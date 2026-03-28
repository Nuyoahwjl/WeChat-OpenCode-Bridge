import * as fs from "node:fs";
import * as path from "node:path";

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

class Logger {
    private level: LogLevel;
    private logStream: fs.WriteStream | null = null;

    constructor(level: LogLevel = LogLevel.INFO) {
        this.level = level;
    }

    enableFileLogging(logsDir: string): void {
        try {
            fs.mkdirSync(logsDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const logFile = path.join(logsDir, `${timestamp}.log`);
            this.logStream = fs.createWriteStream(logFile, { flags: "a" });
            this.logStream.on("error", (err) => {
                console.error("Log file write error:", err.message);
            });
        } catch (err) {
            console.error("Failed to create log file:", String(err));
        }
    }

    private writeToFile(line: string): void {
        if (this.logStream) {
            this.logStream.write(line + "\n");
        }
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
            const line = this.format("DEBUG", message, data);
            console.debug(line);
            this.writeToFile(line);
        }
    }

    info(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.INFO) {
            const line = this.format("INFO", message, data);
            console.log(line);
            this.writeToFile(line);
        }
    }

    warn(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.WARN) {
            const line = this.format("WARN", message, data);
            console.warn(line);
            this.writeToFile(line);
        }
    }

    error(message: string, data?: Record<string, unknown>): void {
        if (this.level <= LogLevel.ERROR) {
            const line = this.format("ERROR", message, data);
            console.error(line);
            this.writeToFile(line);
        }
    }
}

export const logger = new Logger(
    process.env.LOG_LEVEL
        ? parseInt(process.env.LOG_LEVEL)
        : LogLevel.INFO
);
