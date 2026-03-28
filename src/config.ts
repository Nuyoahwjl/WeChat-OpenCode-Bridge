import * as fs from "node:fs";
import * as path from "node:path";
import { getDataDir } from "./store/account.js";
import { logger } from "./logger.js";

export interface Config {
    model?: string;
    permissionMode?: "default" | "acceptEdits" | "plan" | "auto";
}

const CONFIG_FILE = path.join(getDataDir(), "config.json");

export function loadConfig(): Config {
    if (!fs.existsSync(CONFIG_FILE)) {
        return {};
    }

    try {
        const data = fs.readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(data) as Config;
    } catch (err) {
        logger.error("Failed to load config", { error: String(err) });
        return {};
    }
}

export function saveConfig(config: Config): void {
    try {
        const dir = path.dirname(CONFIG_FILE);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        logger.info("Config saved", { configFile: CONFIG_FILE });
    } catch (err) {
        logger.error("Failed to save config", { error: String(err) });
    }
}
