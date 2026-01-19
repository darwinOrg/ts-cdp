export enum LogLevel {
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  DEBUG = "debug",
}

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: LogLevel, message: string): string {
    // 使用本地时区格式化时间
    const timestamp = new Date().toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  info(message: string, ...args: any[]): void {
    console.log(this.formatMessage(LogLevel.INFO, message), ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage(LogLevel.WARN, message), ...args);
  }

  error(message: string, error?: Error | any, ...args: any[]): void {
    console.error(this.formatMessage(LogLevel.ERROR, message), error, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.debug(this.formatMessage(LogLevel.DEBUG, message), ...args);
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
