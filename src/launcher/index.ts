import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import * as http from "http";
import { spawn, ChildProcess } from "child_process";
import { createLogger } from "../utils/logger";
import { findChromePath } from "./chrome-finder";

const logger = createLogger("Launcher");

export interface LaunchOptions {
  chromePath?: string;
  chromeFlags?: string[];
  userDataDir?: string | false;
  port?: number;
  startingUrl?: string;
  headless?: boolean;
  ignoreDefaultFlags?: boolean;
  prefs?: Record<string, any>;
  envVars?: Record<string, string>;
}

export interface ChromeInstance {
  pid: number;
  port: number;
  kill: () => void;
  process: ChildProcess;
}

const DEFAULT_FLAGS = [
  "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-client-side-phishing-detection",
  "--disable-sync",
  "--metrics-recording-only",
  "--disable-default-apps",
  "--mute-audio",
  "--no-default-browser-check",
  "--no-first-run",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-ipc-flooding-protection",
  "--password-store=basic",
  "--use-mock-keychain",
  "--force-fieldtrials=*BackgroundTracing/default/",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-domain-reliability",
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-web-security",
  "--disable-features=VizDisplayCompositor",
];

export class Launcher {
  private options: LaunchOptions;
  private chromeProcess: ChildProcess | null = null;
  private port: number;
  private userDataDir: string | null = null;
  private tmpDirCreated: boolean = false;

  constructor(options: LaunchOptions = {}) {
    this.options = {
      startingUrl: "about:blank",
      chromeFlags: [],
      ignoreDefaultFlags: false,
      ...options,
    };
    this.port = this.options.port || 0;
  }

  async launch(): Promise<ChromeInstance> {
    if (this.port === 0) {
      this.port = await this.getAvailablePort();
    }

    if (!this.options.chromePath) {
      this.options.chromePath = await findChromePath();
    }

    if (this.options.userDataDir !== false && !this.options.userDataDir) {
      this.userDataDir = await this.createTempDir();
      this.tmpDirCreated = true;
    } else if (typeof this.options.userDataDir === "string") {
      this.userDataDir = this.options.userDataDir;
    }

    await this.setBrowserPrefs();

    const flags = this.buildFlags();
    logger.info(`Launching Chrome: ${this.options.chromePath}`);
    logger.debug(`Flags: ${flags.join(" ")}`);

    this.chromeProcess = spawn(this.options.chromePath!, flags, {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: this.options.envVars || process.env,
    });

    await this.waitForReady();

    return {
      pid: this.chromeProcess.pid!,
      port: this.port,
      kill: () => this.kill(),
      process: this.chromeProcess!,
    };
  }

  private buildFlags(): string[] {
    const flags: string[] = [];

    if (!this.options.ignoreDefaultFlags) {
      flags.push(...DEFAULT_FLAGS);
    }

    flags.push(`--remote-debugging-port=${this.port}`);

    if (process.platform === "linux" && !this.options.ignoreDefaultFlags) {
      flags.push("--disable-setuid-sandbox");
    }

    if (this.userDataDir) {
      flags.push(`--user-data-dir=${this.userDataDir}`);
    }

    if (this.options.headless) {
      flags.push("--headless");
    }

    if (this.options.chromeFlags) {
      flags.push(...this.options.chromeFlags);
    }

    flags.push(this.options.startingUrl!);

    return flags;
  }

  private async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.listen(0);
      server.once("listening", () => {
        const { port } = server.address() as any;
        server.close(() => resolve(port));
      });
      server.once("error", reject);
    });
  }

  private async waitForReady(): Promise<void> {
    const maxRetries = 50;
    const interval = 500;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        await this.isDebuggerReady();
        logger.info(`Chrome ready on port ${this.port}`);
        return;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw new Error(
            `Chrome did not become ready after ${maxRetries} attempts`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }

  private isDebuggerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.port, "127.0.0.1");
      client.once("error", (err) => {
        client.destroy();
        reject(err);
      });
      client.once("connect", () => {
        client.destroy();
        resolve();
      });
    });
  }

  private async createTempDir(): Promise<string> {
    const os = require("os");
    const tmpDir = path.join(
      os.tmpdir(),
      `chrome-cdp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }

  private async setBrowserPrefs(): Promise<void> {
    if (
      !this.userDataDir ||
      !this.options.prefs ||
      Object.keys(this.options.prefs).length === 0
    ) {
      return;
    }

    const profileDir = path.join(this.userDataDir, "Default");
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const preferenceFile = path.join(profileDir, "Preferences");
    try {
      if (fs.existsSync(preferenceFile)) {
        const content = JSON.parse(fs.readFileSync(preferenceFile, "utf-8"));
        fs.writeFileSync(
          preferenceFile,
          JSON.stringify({ ...content, ...this.options.prefs }, null, 2),
        );
      } else {
        fs.writeFileSync(
          preferenceFile,
          JSON.stringify(this.options.prefs, null, 2),
        );
      }
    } catch (error) {
      logger.warn("Failed to set browser preferences", error);
    }
  }

  kill(): void {
    if (!this.chromeProcess) return;

    logger.info(`Killing Chrome process ${this.chromeProcess.pid}`);

    try {
      if (process.platform === "win32") {
        spawn(
          "taskkill",
          ["/pid", String(this.chromeProcess.pid), "/T", "/F"],
          { shell: true },
        );
      } else {
        if (this.chromeProcess.pid) {
          process.kill(-this.chromeProcess.pid, "SIGKILL");
        }
      }
    } catch (error) {
      logger.warn("Failed to kill Chrome", error);
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.userDataDir && this.tmpDirCreated) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
        logger.debug(`Cleaned up temp directory: ${this.userDataDir}`);
      } catch (error) {
        logger.warn("Failed to cleanup temp directory", error);
      }
    }
    this.chromeProcess = null;
  }
}

export async function launch(
  options: LaunchOptions = {},
): Promise<ChromeInstance> {
  const launcher = new Launcher(options);
  return launcher.launch();
}

export async function getChromePath(): Promise<string> {
  return findChromePath();
}
