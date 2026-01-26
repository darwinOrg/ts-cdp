# ts-cdp 项目说明

## 项目概述

ts-cdp 是一个基于 Chrome DevTools Protocol (CDP) 的 TypeScript 浏览器自动化库，提供了一套完整的 API 来控制 Chrome
浏览器。项目支持通过 HTTP API 或直接使用 TypeScript SDK 进行浏览器自动化操作。

**主要功能：**

- 浏览器管理：启动、停止、连接到现有浏览器实例
- 页面操作：导航、刷新、执行 JavaScript、截图、等待加载状态
- 元素定位和操作：选择器定位、点击、悬停、设置值、获取属性
- 网络监听：拦截和缓存网络请求，支持 URL 模式匹配
- 登录状态监控：自动检测用户登录/登出状态
- HTTP API 服务器：提供 RESTful API 接口

**技术栈：**

- TypeScript 5.9.3+
- Node.js >=16.0.0
- Chrome DevTools Protocol (chrome-remote-interface)
- Express 5.2.1 (HTTP 服务器)

## 项目结构

```
ts-cdp/
├── src/
│   ├── browser/
│   │   ├── client.ts       # CDP 客户端，管理浏览器连接和重连
│   │   ├── page.ts         # 页面操作 API
│   │   └── locator.ts      # 元素定位器
│   ├── http/
│   │   ├── index.ts        # HTTP 服务器入口
│   │   └── HttpServer.ts   # HTTP API 服务器实现
│   ├── launcher/
│   │   ├── index.ts        # Chrome 启动器
│   │   └── chrome-finder.ts # Chrome 可执行文件查找
│   ├── network/
│   │   └── listener.ts     # 网络请求监听器
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   ├── utils/
│   │   ├── logger.ts       # 日志系统
│   │   └── tools.ts        # 工具函数
│   └── index.ts            # 库的主入口
├── examples/
│   └── basic-usage.ts      # 基本使用示例
├── dist/                   # 编译输出目录
├── package.json
├── tsconfig.json
└── README.md
```

## 构建和运行

### 安装依赖

```bash
npm install
```

### 编译 TypeScript

```bash
npm run build
```

### 开发模式（监听文件变化）

```bash
npm run dev
```

### 启动 HTTP API 服务器

```bash
npm run server
```

服务器将在 `http://localhost:3000` 启动。

### 运行示例

```bash
npm run example
```

### 代码检查

```bash
npm run lint
```

### 清理编译输出

```bash
npm run clean
```

## 核心架构

### CDPClient (src/browser/client.ts)

CDP 客户端负责与 Chrome DevTools Protocol 建立连接和管理。

**核心特性：**

- 自动重连机制：连接断开后自动尝试重连（最多 5 次）
- 心跳检测：每 30 秒检查连接状态
- 登录状态监控：通过 URL 模式匹配检测登录/登出
- 网络监听器集成：自动初始化网络请求监听

**使用示例：**

```typescript
const client = new CDPClient({
    port: 9222,
    name: 'my-session',
    loginCallback: (state) => {
        console.log(`Login state: ${state}`);
    },
    loginUrlPatterns: {
        loginUrl: 'https://example.com/login',
        targetPrefix: 'https://example.com'
    }
});
await client.connect();
```

### BrowserPage (src/browser/page.ts)

页面操作 API，提供所有页面级别的操作。

**核心方法：**

- `navigate(url, options)` - 导航到指定 URL
- `reload(options)` - 刷新页面
- `waitForLoadState(state, timeout)` - 等待加载状态（load/domcontentloaded/networkidle）
- `waitForSelector(selector, options)` - 等待元素出现
- `executeScript(script)` - 执行 JavaScript
- `screenshot(format)` - 截图
- `expectResponseText(urlOrPredicate, callback, timeout)` - 等待特定网络响应

**使用示例：**

```typescript
const page = new BrowserPage(client);
await page.navigate('https://example.com');
await page.waitForLoadState('load');
const title = await page.getTitle();
```

### BrowserLocator (src/browser/locator.ts)

元素定位器，提供元素级别的操作。

**核心方法：**

- `exists()` - 检查元素是否存在
- `getText()` - 获取元素文本
- `getTextContent()` - 获取文本内容
- `click()` - 点击元素
- `hover()` - 鼠标悬停
- `setValue(value)` - 设置元素值
- `getAttribute(name)` - 获取元素属性
- `isVisible()` - 检查元素是否可见
- `getAllTexts()` - 获取所有匹配元素的文本
- `getAllAttributes(name)` - 获取所有匹配元素的属性

**使用示例：**

```typescript
const locator = page.locator('#submit-button');
if (await locator.exists()) {
    await locator.click();
}
```

### NetworkListener (src/network/listener.ts)

网络请求监听器，用于拦截和缓存网络请求。

**核心特性：**

- URL 模式匹配（支持通配符 * 和 **）
- 请求缓存管理
- 网络空闲检测
- 响应数据提取

**使用示例：**

```typescript
const networkListener = client.getNetworkListener();
networkListener.enable(['https://api.example.com/*']);
await networkListener.waitForNetworkIdle(500, 0, 10000);
```

### BrowserHttpServer (src/http/HttpServer.ts)

HTTP API 服务器，提供 RESTful API 接口。

**主要 API 端点：**

**浏览器管理：**

- `POST /api/browser/start` - 启动浏览器
- `POST /api/browser/connect` - 连接到现有浏览器
- `POST /api/browser/stop` - 关闭浏览器
- `POST /api/browser/disconnect` - 断开连接

**页面操作：**

- `POST /api/page/navigate` - 导航到 URL
- `POST /api/page/reload` - 刷新页面
- `POST /api/page/execute` - 执行 JavaScript
- `GET /api/page/title` - 获取页面标题
- `GET /api/page/url` - 获取页面 URL
- `POST /api/page/screenshot` - 截图
- `POST /api/page/wait-for-network-idle` - 等待网络空闲
- `POST /api/page/wait-for-selector-visible` - 等待元素可见
- `POST /api/page/expect-response-text` - 等待特定网络响应

**元素操作：**

- `POST /api/element/exists` - 检查元素是否存在
- `POST /api/element/text` - 获取元素文本
- `POST /api/element/click` - 点击元素
- `POST /api/element/hover` - 鼠标悬停
- `POST /api/element/setValue` - 设置元素值
- `POST /api/element/wait` - 等待元素
- `POST /api/element/attribute` - 获取元素属性

**网络监听：**

- `POST /api/network/enable` - 启用网络监听
- `POST /api/network/disable` - 禁用网络监听
- `GET /api/network/status` - 获取网络监听状态
- `POST /api/network/clear-cache` - 清除网络缓存

**会话管理：**

- `GET /api/sessions` - 获取所有会话
- `GET /health` - 健康检查

## 开发约定

### TypeScript 配置

- 目标：ES2020
- 模块：CommonJS
- 严格模式：启用
- 声明文件：生成 `.d.ts` 文件
- 源映射：生成 `.map` 文件

### 日志系统

项目使用自定义日志系统（`src/utils/logger.ts`），支持不同日志级别：

- `error` - 错误信息
- `warn` - 警告信息
- `info` - 一般信息
- `debug` - 调试信息

**使用示例：**

```typescript
import {createLogger} from "./utils/logger";

const logger = createLogger("MyModule");
logger.info("Starting operation");
logger.error("Operation failed", error);
```

### 错误处理

- 所有公开 API 方法都应该捕获和处理异常
- 使用日志系统记录错误信息
- 对于连接错误，检查 WebSocket 状态并适当处理

### 连接管理

- 每个会话（sessionId）对应一个浏览器实例
- 支持连接到外部浏览器实例（通过调试端口）
- 自动重连机制确保连接稳定性
- 使用前检查连接状态：`client.isConnected()`

### 网络监听

- 网络监听器默认启用
- 支持通配符 URL 匹配：`*` 匹配非路径分隔符，`**` 匹配任意字符
- 缓存管理：使用后及时清理缓存以避免内存泄漏

### 元素定位

- 支持 CSS 选择器
- 隐式等待：自动等待元素出现（默认 10 秒）
- 所有元素操作前检查元素是否存在
- 支持获取多个匹配元素

### 测试

- 目前项目没有自动化测试配置
- 建议为新的功能添加单元测试
- 示例文件（`examples/basic-usage.ts`）可以作为手动测试参考

## HTTP API 使用示例

### 启动浏览器并导航

```bash
# 1. 启动浏览器
curl -X POST http://localhost:3000/api/browser/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session", "headless": false}'

# 2. 导航到页面
curl -X POST http://localhost:3000/api/page/navigate \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session", "url": "https://example.com"}'

# 3. 获取页面标题
curl http://localhost:3000/api/page/title?sessionId=test-session

# 4. 关闭浏览器
curl -X POST http://localhost:3000/api/browser/stop \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session"}'
```

### 元素操作

```bash
# 检查元素是否存在
curl -X POST http://localhost:3000/api/element/exists \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session", "selector": "h1"}'

# 点击元素
curl -X POST http://localhost:3000/api/element/click \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session", "selector": "#submit-button"}'

# 设置输入框值
curl -X POST http://localhost:3000/api/element/setValue \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session", "selector": "#username", "value": "testuser"}'
```

## TypeScript SDK 使用示例

### 基本使用

```typescript
import {launch, CDPClient, BrowserPage} from './src';

// 启动 Chrome
const chrome = await launch({headless: false});

// 创建客户端
const client = new CDPClient({
    port: chrome.port,
    name: 'my-session'
});
await client.connect();

// 创建页面
const page = new BrowserPage(client);
await page.navigate('https://example.com');

// 执行操作
await page.waitForLoadState('load');
const title = await page.getTitle();
console.log('Page title:', title);

// 元素操作
const locator = page.locator('h1');
const text = await locator.getText();
console.log('Heading:', text);

// 关闭
await client.close();
chrome.kill();
```

### 网络监听

```typescript
import {launch, CDPClient, BrowserPage} from './src';

const chrome = await launch({headless: false});
const client = new CDPClient({port: chrome.port});
await client.connect();

const page = new BrowserPage(client);

// 启用网络监听
const networkListener = client.getNetworkListener();
networkListener.enable(['https://api.example.com/*']);

// 导航并等待网络空闲
await page.navigate('https://example.com');
await page.waitForNetworkIdle();

// 等待特定响应
const response = await page.expectResponseText(
    'https://api.example.com/data',
    async () => {
        await page.evaluate("document.querySelector('#load').click()");
    },
    10000
);
console.log('Response:', response);

await client.close();
chrome.kill();
```

### 登录状态监控

```typescript
import {launch, CDPClient, BrowserPage} from './src';

const chrome = await launch({headless: false});
const client = new CDPClient({
    port: chrome.port,
    name: 'login-monitor',
    loginCallback: (state) => {
        console.log(`Login state changed: ${state}`);
    },
    loginUrlPatterns: {
        loginUrl: 'https://example.com/login',
        targetPrefix: 'https://example.com'
    }
});
await client.connect();

const page = new BrowserPage(client);

// 导航到登录页面
await page.navigate('https://example.com/login');
// ... 执行登录操作

// 登录成功后会自动触发 loginCallback

await client.close();
chrome.kill();
```

## 注意事项

1. **会话管理**：每个浏览器实例都有一个唯一的 `sessionId`，所有操作都需要提供 `sessionId`
2. **单页面模式**：当前版本为单页面模式，每个会话只有一个默认页面
3. **资源清理**：使用完毕后记得调用 `client.close()` 和 `chrome.kill()` 关闭浏览器
4. **超时处理**：大多数操作都有默认超时时间（10秒），可以通过参数自定义
5. **错误处理**：所有错误都会返回 JSON 格式的错误信息，建议在代码中适当处理
6. **网络监听**：使用网络监听后，记得及时清理缓存以避免内存泄漏
7. **连接稳定性**：项目内置了自动重连机制，但建议在关键操作前检查连接状态

## 相关项目

- **go-cdp-sdk**: Go 语言版本的 CDP SDK（位于 `/Users/mac/ncode/go-cdp-sdk`）
- **go-crawler**: 使用 go-cdp-sdk 的爬虫项目（位于 `/Users/mac/ncode/go-crawler`）

## 许可证

MIT License