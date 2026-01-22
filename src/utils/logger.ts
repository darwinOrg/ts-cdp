import {getLocalTimeString} from "./tools";

export enum LogLevel {
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
}

export class Logger {
    private readonly context: string;

    constructor(context: string) {
        this.context = context;
    }

    private formatMessage(level: LogLevel, message: string): string {
        const localTime = getLocalTimeString();
        return `[${localTime}] [${level.toUpperCase()}] [${this.context}] ${message}`;
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
