import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { createLogger } from "../utils/logger";

const logger = createLogger("ChromeFinder");

export async function findChromePath(): Promise<string> {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return findChromeDarwin();
    case "win32":
      return findChromeWin32();
    case "linux":
      return findChromeLinux();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function findChromeDarwin(): string {
  const priorityPaths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];

  for (const chromePath of priorityPaths) {
    if (chromePath && canAccess(chromePath)) {
      return chromePath;
    }
  }

  throw new Error("Chrome not found on macOS");
}

function findChromeWin32(): string {
  const installations: string[] = [];
  const suffixes = [
    "\\Google\\Chrome SxS\\Application\\chrome.exe",
    "\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const prefixes = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
  ].filter(Boolean) as string[];

  if (process.env.CHROME_PATH && canAccess(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  prefixes.forEach((prefix) => {
    suffixes.forEach((suffix) => {
      const chromePath = path.join(prefix, suffix);
      if (canAccess(chromePath)) {
        installations.push(chromePath);
      }
    });
  });

  if (installations.length === 0) {
    throw new Error("Chrome not found on Windows");
  }

  return installations[0];
}

function findChromeLinux(): string {
  const installations: string[] = [];

  if (process.env.CHROME_PATH && canAccess(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const execPaths = [
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "chromium",
  ];

  execPaths.forEach((executable) => {
    try {
      const chromePath = spawnSync("which", [executable], { stdio: "pipe" })
        .stdout.toString()
        .trim();
      if (chromePath && canAccess(chromePath)) {
        installations.push(chromePath);
      }
    } catch (e) {
      // Not installed
    }
  });

  if (installations.length === 0) {
    throw new Error("Chrome not found on Linux");
  }

  return installations[0];
}

function canAccess(filePath: string): boolean {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}
