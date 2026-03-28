import * as fs from "node:fs";
import * as path from "node:path";
import { getDataDir } from "./account.js";
import { logger } from "../logger.js";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

export interface Session {
    sdkSessionId?: string;
    model?: string;
    permissionMode?: "default" | "acceptEdits" | "plan" | "auto";
    state: "idle" | "processing" | "waiting_permission";
    chatHistory: ChatMessage[];
    maxHistoryLength?: number;
}

export interface SessionHandle {
    sessionId: string;
    session: Session;
}

const SESSIONS_DIR = path.join(getDataDir(), "sessions");

function ensureSessionsDir(): void {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionFilePath(sessionId: string): string {
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function createNewSession(): Session {
    return {
        state: "idle",
        chatHistory: [],
        maxHistoryLength: 100,
    };
}

export function createSession(accountId: string): SessionHandle {
    ensureSessionsDir();
    const sessionId = `${accountId}_${Date.now()}`;
    const session = createNewSession();
    saveSession(sessionId, session);
    logger.info("🆕 创建新会话", { sessionId });
    return { sessionId, session };
}

export function loadSession(sessionId: string): SessionHandle | null {
    const filePath = sessionFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const data = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(data) as Session;

        if (!session.chatHistory) {
            session.chatHistory = [];
        }
        if (!session.state) {
            session.state = "idle";
        }

        return { sessionId, session };
    } catch (err) {
        logger.error("❌ 会话加载失败", { sessionId, error: String(err) });
        return null;
    }
}

export function saveSession(sessionId: string, session: Session): void {
    ensureSessionsDir();
    const filePath = sessionFilePath(sessionId);

    try {
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    } catch (err) {
        logger.error("❌ 会话保存失败", { sessionId, error: String(err) });
    }
}

export function addChatMessage(
    session: Session,
    role: "user" | "assistant",
    content: string
): void {
    session.chatHistory.push({
        role,
        content,
        timestamp: Date.now(),
    });

    const maxLength = session.maxHistoryLength || 100;
    if (session.chatHistory.length > maxLength) {
        session.chatHistory = session.chatHistory.slice(-maxLength);
    }
}

export function getChatHistoryText(session: Session, limit?: number): string {
    const history = limit ? session.chatHistory.slice(-limit) : session.chatHistory;
    return history.map(m => `${m.role}: ${m.content}`).join("\n");
}

export function clearSession(sessionId: string, session: Session): void {
    session.chatHistory = [];
    session.state = "idle";
    saveSession(sessionId, session);
    logger.info("🗑️ 会话已清空", { sessionId });
}
