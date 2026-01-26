import express, {Request, Response} from "express";
import {CDPClient} from "../browser/client";
import {BrowserPage} from "../browser/page";
import {launch} from "../launcher";
import {createLogger} from "../utils/logger";

const logger = createLogger("HttpServer");

export interface BrowserSession {
    sessionId: string;
    chrome: any;
    client: CDPClient;
    page: BrowserPage; // 单个页面
    isExternal: boolean; // 标识是否连接到外部浏览器
}

export interface HttpServerOptions {
    port: number;
    host?: string;
}

export class BrowserHttpServer {
    private app: express.Application;
    private server: any;
    private clients: Map<string, BrowserSession>;
    private readonly port: number;
    private readonly host: string;

    constructor(options: HttpServerOptions) {
        this.port = options.port;
        this.host = options.host || "0.0.0.0";
        this.app = express();
        this.clients = new Map();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(express.json({limit: "50mb"}));
        this.app.use(express.urlencoded({extended: true, limit: "50mb"}));
        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS",
            );
            res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            if (req.method === "OPTIONS") {
                res.sendStatus(200);
            } else {
                next();
            }
        });
    }

    private setupRoutes(): void {
        // 健康检查
        this.app.get("/health", (req: Request, res: Response) => {
            res.json({status: "ok", sessions: this.clients.size});
        });

        // ========== 浏览器操作 ==========

        // 启动浏览器
        this.app.post("/api/browser/start", async (req: Request, res: Response) => {
            try {
                const {sessionId, headless = false} = req.body;

                if (!this.validateNewSession(sessionId, res)) {
                    return;
                }

                const chrome = await launch({headless});
                const client = new CDPClient({port: chrome.port, name: sessionId});
                await client.connect();

                // 创建 BrowserPage，使用默认的第一个 tab 页面
                const page = new BrowserPage(client, {name: `${sessionId}-page`});
                await page.init();

                this.clients.set(sessionId, {
                    sessionId,
                    chrome,
                    client,
                    page,
                    isExternal: false,
                });

                res.json({success: true, data: {sessionId}});
            } catch (error) {
                logger.error("Failed to start browser:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 连接到已存在的浏览器
        this.app.post("/api/browser/connect", async (req: Request, res: Response) => {
            try {
                const {sessionId, port = 9222} = req.body;

                if (!this.validateNewSession(sessionId, res)) {
                    return;
                }

                // 连接到已存在的浏览器（通过调试端口）
                const client = new CDPClient({port, name: sessionId});
                await client.connect();

                // 创建 BrowserPage，使用默认的第一个 tab 页面
                const page = new BrowserPage(client, {name: `${sessionId}-page`});
                await page.init();

                this.clients.set(sessionId, {
                    sessionId,
                    chrome: null, // 连接到外部浏览器，不需要 chrome 实例
                    client,
                    page,
                    isExternal: true,
                });

                res.json({success: true, data: {sessionId}});
            } catch (error) {
                logger.error("Failed to connect to browser:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 断开连接
        this.app.post("/api/browser/disconnect", async (req: Request, res: Response) => {
            try {
                const session = this.validateSessionOnly(req, res);
                if (!session) {
                    return;
                }

                // 只关闭客户端连接，不杀掉浏览器进程
                await session.client.close();
                this.clients.delete(session.sessionId);

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to disconnect:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 关闭浏览器
        this.app.post("/api/browser/stop", async (req: Request, res: Response) => {
            try {
                const session = this.validateSessionOnly(req, res);
                if (!session) {
                    return;
                }

                // 关闭客户端连接
                await session.client.close();

                // 杀掉浏览器进程（仅对启动的浏览器有效）
                if (session.chrome && !session.isExternal) {
                    session.chrome.kill();
                }

                this.clients.delete(session.sessionId);

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to close browser:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // ========== 网络监听器 ==========

        // 启用网络监听
        this.app.post("/api/network/enable", async (req: Request, res: Response) => {
            try {
                const session = this.validateSessionOnly(req, res);
                if (!session) {
                    return;
                }

                const {urlPatterns = []} = req.body;
                const networkListener = session.client.getNetworkListener();
                if (networkListener) {
                    networkListener.enable(urlPatterns);
                    res.json({success: true, data: {urlPatterns}});
                } else {
                    res
                        .status(404)
                        .json({success: false, error: "NetworkListener not found"});
                }
            } catch (error) {
                logger.error("Failed to enable network listener:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 禁用网络监听
        this.app.post("/api/network/disable", async (req: Request, res: Response) => {
            try {
                const session = this.validateSessionOnly(req, res);
                if (!session) {
                    return;
                }

                const networkListener = session.client.getNetworkListener();
                if (networkListener) {
                    networkListener.disable();
                    res.json({success: true});
                } else {
                    res
                        .status(404)
                        .json({success: false, error: "NetworkListener not found"});
                }
            } catch (error) {
                logger.error("Failed to disable network listener:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 获取网络监听器状态
        this.app.get("/api/network/status", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionFromQuery(req, res);
                if (!result) {
                    return;
                }

                const {session} = result;
                const networkListener = session.client.getNetworkListener();
                if (networkListener) {
                    const cachePatterns = networkListener.getCachePatterns();
                    const cacheData: Record<string, any> = {};
                    for (const pattern of cachePatterns) {
                        const cachedRequest = networkListener.getCachedRequests(pattern);
                        if (cachedRequest) {
                            cacheData[pattern] = {
                                url: cachedRequest.url,
                                timestamp: cachedRequest.timestamp,
                            };
                        }
                    }
                    res.json({
                        success: true,
                        data: {
                            enabled: networkListener.isEnabled(),
                            cacheStats: cacheData,
                        },
                    });
                } else {
                    res
                        .status(404)
                        .json({success: false, error: "NetworkListener not found"});
                }
            } catch (error) {
                logger.error("Failed to get network listener status:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 清除网络监听器缓存
        this.app.post("/api/network/clear-cache", async (req: Request, res: Response) => {
            try {
                const session = this.validateSessionOnly(req, res);
                if (!session) {
                    return;
                }

                const {pattern} = req.body;
                const networkListener = session.client.getNetworkListener();
                if (networkListener) {
                    networkListener.clearCache(pattern);
                    res.json({success: true});
                } else {
                    res
                        .status(404)
                        .json({success: false, error: "NetworkListener not found"});
                }
            } catch (error) {
                logger.error("Failed to clear network cache:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // ========== 页面操作 ==========

        // 导航到 URL
        this.app.post("/api/page/navigate", async (req: Request, res: Response) => {
            try {
                const {sessionId, url} = req.body;

                if (!sessionId || !url) {
                    res
                        .status(400)
                        .json({success: false, error: "sessionId and url are required"});
                    return;
                }

                const session = this.clients.get(sessionId);
                if (!session) {
                    res.status(404).json({success: false, error: "Session not found"});
                    return;
                }

                const page = this.getPage(session);
                await page.navigate(url);

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to navigate:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 刷新页面
        this.app.post("/api/page/reload", async (req: Request, res: Response) => {
            try {
                const result = this.validateSession(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                await page.reload();

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to reload:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 执行 JavaScript
        this.app.post("/api/page/execute", async (req: Request, res: Response) => {
            try {
                const {sessionId, script} = req.body;

                if (!sessionId || !script) {
                    res
                        .status(400)
                        .json({
                            success: false,
                            error: "sessionId and script are required",
                        });
                    return;
                }

                const session = this.clients.get(sessionId);
                if (!session) {
                    res.status(404).json({success: false, error: "Session not found"});
                    return;
                }

                logger.debug("Execute script:", script)
                const page = this.getPage(session);
                const result = await page.evaluate(script);

                logger.debug("Execute script result:", result)
                res.json({success: true, data: {result}});
            } catch (error) {
                logger.error("Failed to execute script:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 获取页面标题
        this.app.get("/api/page/title", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionFromQuery(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const title = await page.getTitle();

                res.json({success: true, data: {title}});
            } catch (error) {
                logger.error("Failed to get title:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 获取页面 URL
        this.app.get("/api/page/url", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionFromQuery(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const url = await page.getUrl();

                res.json({success: true, data: {url}});
            } catch (error) {
                logger.error("Failed to get URL:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 截图
        this.app.post(
            "/api/page/screenshot",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {format = "png"} = req.body;
                    const screenshot = await page.screenshot(format);

                    res.setHeader("Content-Type", `image/${format}`);
                    res.send(screenshot);
                } catch (error) {
                    logger.error("Failed to take screenshot:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 带加载状态的导航
        this.app.post(
            "/api/page/navigate-with-loaded-state",
            async (req: Request, res: Response) => {
                try {
                    const {sessionId, url} = req.body;

                    if (!sessionId || !url) {
                        res
                            .status(400)
                            .json({
                                success: false,
                                error: "sessionId and url are required",
                            });
                        return;
                    }

                    const session = this.clients.get(sessionId);
                    if (!session) {
                        res
                            .status(404)
                            .json({success: false, error: "Session not found"});
                        return;
                    }

                    const page = this.getPage(session);
                    await page.navigateWithLoadedState(url);

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to navigate with loaded state:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 带加载状态的刷新
        this.app.post(
            "/api/page/reload-with-loaded-state",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    await page.reloadWithLoadedState();

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to reload with loaded state:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 等待加载状态 load
        this.app.post(
            "/api/page/wait-for-load-state-load",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    await page.waitForLoadStateLoad();

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to wait for load state:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 等待 DOM 内容加载
        this.app.post(
            "/api/page/wait-for-dom-content-loaded",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    await page.waitForDomContentLoaded();

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to wait for DOM content loaded:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 等待 网络 空闲
        this.app.post(
            "/api/page/wait-for-network-idle",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    await page.waitForNetworkIdle();

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to wait for network idle:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 等待选择器可见
        this.app.post(
            "/api/page/wait-for-selector-visible",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    await page.waitForSelectorStateVisible(selector);

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to wait for selector visible:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 期望响应文本
        this.app.post(
            "/api/page/expect-response-text",
            async (req: Request, res: Response) => {
                try {
                    const {urlOrPredicate, callback, timeout = 10000} = req.body;

                    if (!urlOrPredicate) {
                        res
                            .status(400)
                            .json({
                                success: false,
                                error: "sessionId and urlOrPredicate are required",
                            });
                        return;
                    }

                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const text = await page.expectResponseText(
                        urlOrPredicate,
                        async () => {
                            if (callback) {
                                await page.evaluate(callback);
                            }
                        }, timeout
                    );

                    res.json({success: true, data: {text}});
                } catch (error) {
                    logger.error("Failed to expect response text:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 关闭页面
        this.app.post(
            "/api/page/close",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSession(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    await page.close();

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to close all:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取页面 HTML
        this.app.get("/api/page/html", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionFromQuery(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const html = await page.getHTML();

                res.json({success: true, data: {html}});
            } catch (error) {
                logger.error("Failed to get HTML:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // ========== 元素操作 ==========

        // 检查元素是否存在
        this.app.post(
            "/api/element/exists",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const locator = page.locator(selector);
                    const exists = await locator.exists();

                    res.json({success: true, data: {exists}});
                } catch (error) {
                    logger.error("Failed to check element exists:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 点击元素
        this.app.post("/api/element/click", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionAndSelector(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const {selector} = req.body;
                const locator = page.locator(selector);
                await locator.click();

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to click element:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 鼠标悬停
        this.app.post("/api/element/hover", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionAndSelector(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const {selector} = req.body;
                const locator = page.locator(selector);
                await locator.hover();

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to hover element:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 设置元素值
        this.app.post(
            "/api/element/setValue",
            async (req: Request, res: Response) => {
                try {
                    const {value} = req.body;

                    if (value === undefined) {
                        res
                            .status(400)
                            .json({
                                success: false,
                                error: "sessionId, selector and value are required",
                            });
                        return;
                    }

                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const locator = page.locator(selector);
                    await locator.setValue(value);

                    res.json({success: true});
                } catch (error) {
                    logger.error("Failed to set element value:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 等待元素
        this.app.post("/api/element/wait", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionAndSelector(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const {selector, timeout = 10000} = req.body;
                await page.waitForSelector(selector, {timeout});

                res.json({success: true});
            } catch (error) {
                logger.error("Failed to wait for element:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 获取元素属性
        this.app.post(
            "/api/element/attribute",
            async (req: Request, res: Response) => {
                try {
                    const {attribute} = req.body;

                    if (!attribute) {
                        res
                            .status(400)
                            .json({
                                success: false,
                                error: "sessionId, selector and attribute are required",
                            });
                        return;
                    }

                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const locator = page.locator(selector);
                    const value = await locator.getAttribute(attribute);

                    res.json({success: true, data: {value}});
                } catch (error) {
                    logger.error("Failed to get element attribute:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取内部文本
        this.app.post(
            "/api/element/inner-text",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const text = await page.innerText(selector);

                    res.json({success: true, data: {text}});
                } catch (error) {
                    logger.error("Failed to get inner text:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取文本内容
        this.app.post(
            "/api/element/text-content",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const text = await page.textContent(selector);

                    res.json({success: true, data: {text}});
                } catch (error) {
                    logger.error("Failed to get text content:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取所有匹配元素的文本
        this.app.post(
            "/api/element/all-texts",
            async (req: Request, res: Response) => {
                try {
                    const result = this.validateSessionAndSelector(req, res);
                    if (!result) {
                        return;
                    }

                    const {page} = result;
                    const {selector} = req.body;
                    const locator = page.locator(selector);
                    const texts = await locator.allInnerTexts();

                    res.json({success: true, data: {texts}});
                } catch (error) {
                    logger.error("Failed to get all element texts:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取所有匹配元素的属性
        this.app.post(
            "/api/element/all-attributes",
            async (req: Request, res: Response) => {
                try {
                    const {sessionId, selector, attribute} = req.body;

                    if (!sessionId || !selector || !attribute) {
                        res
                            .status(400)
                            .json({
                                success: false,
                                error: "sessionId, selector and attribute are required",
                            });
                        return;
                    }

                    const session = this.clients.get(sessionId);
                    if (!session) {
                        res
                            .status(404)
                            .json({success: false, error: "Session not found"});
                        return;
                    }

                    const page = this.getPage(session);
                    const locator = page.locator(selector);
                    const attributes = await locator.allAttributes(attribute);

                    res.json({success: true, data: {attributes}});
                } catch (error) {
                    logger.error("Failed to get all element attributes:", error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : "Unknown error",
                    });
                }
            },
        );

        // 获取元素数量
        this.app.post("/api/element/count", async (req: Request, res: Response) => {
            try {
                const result = this.validateSessionAndSelector(req, res);
                if (!result) {
                    return;
                }

                const {page} = result;
                const {selector} = req.body;
                const locator = page.locator(selector);
                const count = await locator.getCount();

                res.json({success: true, data: {count}});
            } catch (error) {
                logger.error("Failed to get element count:", error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        });

        // 404 处理
        this.app.use((req, res) => {
            res.status(404).json({success: false, error: "Not found"});
        });

        // 错误处理
        this.app.use((err: Error, req: Request, res: Response, next: any) => {
            logger.error("Unhandled error:", err);
            res.status(500).json({
                success: false,
                error: err.message,
            });
        });
    }

    // 辅助方法：获取页面
    private getPage(session: BrowserSession): BrowserPage {
        if (!session.page) {
            throw new Error("Page not found");
        }
        return session.page;
    }

    // 辅助方法：验证新的 sessionId（是否存在且不重复）
    private validateNewSession(sessionId: string, res: any): boolean {
        if (!sessionId) {
            res.status(400).json({
                success: false,
                error: "sessionId is required",
            });
            return false;
        }

        if (this.clients.has(sessionId)) {
            res.status(400).json({
                success: false,
                error: "Session already exists",
            });
            return false;
        }

        return true;
    }

    // 辅助方法：从 query 参数中验证 sessionId，返回 session 和 page
    private validateSessionFromQuery(
        req: any,
        res: any,
    ): { session: BrowserSession; page: BrowserPage } | null {
        const {sessionId} = req.query;

        if (!sessionId) {
            res.status(400).json({
                success: false,
                error: "sessionId is required",
            });
            return null;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
            res.status(404).json({
                success: false,
                error: "Session not found",
            });
            return null;
        }

        const page = this.getPage(session);
        return {session, page};
    }

    // 辅助方法：验证 sessionId 和 selector，返回 session 和 page
    private validateSessionAndSelector(
        req: any,
        res: any,
    ): { session: BrowserSession; page: BrowserPage } | null {
        const {sessionId, selector} = req.body;

        if (!sessionId || !selector) {
            res.status(400).json({
                success: false,
                error: "sessionId and selector are required",
            });
            return null;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
            res.status(404).json({
                success: false,
                error: "Session not found",
            });
            return null;
        }

        const page = this.getPage(session);
        return {session, page};
    }

    // 辅助方法：验证 sessionId，返回 session
    private validateSessionOnly(
        req: any,
        res: any,
    ): BrowserSession | null {
        const {sessionId} = req.body;

        if (!sessionId) {
            res.status(400).json({
                success: false,
                error: "sessionId is required",
            });
            return null;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
            res.status(404).json({
                success: false,
                error: "Session not found",
            });
            return null;
        }

        return session;
    }

    // 辅助方法：验证 sessionId，返回 session 和 page
    private validateSession(
        req: any,
        res: any,
    ): { session: BrowserSession; page: BrowserPage } | null {
        const session = this.validateSessionOnly(req, res);
        if (!session) {
            return null;
        }

        const page = this.getPage(session);
        return {session, page};
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, this.host, (err?: Error) => {
                if (err) {
                    reject(err);
                } else {
                    logger.info(`HTTP Server listening on ${this.host}:${this.port}`);
                    resolve();
                }
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            // 关闭所有浏览器会话
            for (const session of this.clients.values()) {
                // 关闭页面
                if (session.page) {
                    session.page
                        .close()
                        .catch((err: Error) => logger.error("Error closing page:", err));
                }

                session.client
                    .close()
                    .catch((err: Error) => logger.error("Error closing client:", err));

                // 只有在启动的浏览器时才需要关闭 chrome
                if (session.chrome && !session.isExternal) {
                    session.chrome
                        .close()
                        .catch((err: Error) => logger.error("Error closing chrome:", err));
                }
            }
            this.clients.clear();

            if (this.server) {
                this.server.close((err?: Error) => {
                    if (err) {
                        reject(err);
                    } else {
                        logger.info("HTTP Server stopped");
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}
