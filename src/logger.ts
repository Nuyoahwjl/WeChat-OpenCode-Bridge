export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

class Logger {
    private level: LogLevel;

    constructor(level: LogLevel = LogLevel.INFO) {
        this.level = level;
    }

    private format(
        level: string,
        message: string,
        data?: Record<string, unknown>
    ): string {
        const time = new Date().toTimeString().slice(0, 8);
        const prefix = `${time} [${level}]  `;
        let line = `${prefix}${message}`;

        if (data && Object.keys(data).length > 0) {
            const entries = Object.entries(data)
                .map(([k, v]) => {
                    if (typeof v === "string" && v.length > 80) {
                        return `${k}="${v.slice(0, 80)}…"`;
                    }
                    return `${k}=${JSON.stringify(v)}`;
                })
                .join("  ");
            line += `  ${entries}`;
        }

        return line;
    }

    debug(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.DEBUG) {
            console.debug(this.format("DEBUG", message, data));
        }
    }

    info(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.INFO) {
            console.log(this.format("INFO", message, data));
        }
    }

    warn(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.WARN) {
            console.warn(this.format("WARN", message, data));
        }
    }

    error(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.ERROR) {
            console.error(this.format("ERROR", message, data));
        }
    }
}

export const logger = new Logger(
    process.env.LOG_LEVEL
        ? parseInt(process.env.LOG_LEVEL)
        : LogLevel.INFO
);
