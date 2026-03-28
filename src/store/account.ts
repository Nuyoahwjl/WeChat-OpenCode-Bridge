import * as fs from "node:fs";
import * as path from "node:path";
import type { AccountData } from "../wechat/types.js";
import { logger } from "../logger.js";

const DATA_DIR = path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".WeChat-OpenCode-Bridge"
);
const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");

export function getDataDir(): string {
    return DATA_DIR;
}

export function ensureDataDir(): void {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

export function saveAccount(account: AccountData): void {
    ensureDataDir();
    const filePath = path.join(ACCOUNTS_DIR, `${account.accountId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(account, null, 2));
    logger.info("Account saved", { accountId: account.accountId });
    logger.info("Account path", { filePath });
}

export function loadAccount(accountId: string): AccountData | null {
    const filePath = path.join(ACCOUNTS_DIR, `${accountId}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data) as AccountData;
    } catch (err) {
        logger.error("Failed to load account", { accountId, error: String(err) });
        return null;
    }
}

export function loadLatestAccount(): AccountData | null {
    if (!fs.existsSync(ACCOUNTS_DIR)) {
        return null;
    }
    const files = fs
        .readdirSync(ACCOUNTS_DIR)
        .filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
        return null;
    }
    let latest: AccountData | null = null;
    let latestTime = 0;
    for (const file of files) {
        try {
            const data = fs.readFileSync(path.join(ACCOUNTS_DIR, file), "utf-8");
            const account = JSON.parse(data) as AccountData;
            const time = new Date(account.createdAt).getTime();
            if (time > latestTime) {
                latestTime = time;
                latest = account;
            }
        } catch (err) {
            logger.warn("Failed to parse account file", { file, error: String(err) });
        }
    }
    return latest;
}

export function listAccounts(): AccountData[] {
    if (!fs.existsSync(ACCOUNTS_DIR)) {
        return [];
    }
    const files = fs
        .readdirSync(ACCOUNTS_DIR)
        .filter((f) => f.endsWith(".json"));
    const accounts: AccountData[] = [];
    for (const file of files) {
        try {
            const data = fs.readFileSync(path.join(ACCOUNTS_DIR, file), "utf-8");
            accounts.push(JSON.parse(data) as AccountData);
        } catch (err) {
            logger.warn("Failed to parse account file", { file, error: String(err) });
        }
    }
    return accounts;
}
