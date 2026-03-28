import * as path from "node:path";
import * as os from "node:os";

export const DATA_DIR = path.join(os.homedir(), ".WeChat-OpenCode-Bridge");
export const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");
export const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
export const LOGS_DIR = path.join(DATA_DIR, "logs");

export const OPENCODE_DEFAULT_PORT = 4096;
export const OPENCODE_DEFAULT_URL = `http://localhost:${OPENCODE_DEFAULT_PORT}`;

export const WECHAT_DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";

export const MAX_MESSAGE_LENGTH = 2048;
