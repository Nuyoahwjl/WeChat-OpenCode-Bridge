import { logger } from "../logger.js";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";

export interface Session {
    id: string;
    title?: string;
    created: number;
    updated: number;
}

export interface QueryOptions {
    prompt: string;
    resume?: string;
    model?: string;
    images?: Array<{
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
    }>;
    title?: string;
}

export interface QueryResult {
    text: string;
    sessionId: string;
    error?: string;
}

export class OpenCodeClient {
    private baseUrl: string;

    constructor(baseUrl: string = OPENCODE_URL) {
        this.baseUrl = baseUrl;
    }

    async health(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/global/health`);
            return res.ok;
        } catch {
            return false;
        }
    }

    async listSessions(): Promise<Session[]> {
        try {
            const url = `${this.baseUrl}/session`;
            logger.info("📋 正在获取会话列表", { url });
            
            const res = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });

            if (!res.ok) {
                const text = await res.text();
                logger.error("❌ 获取会话列表失败", { status: res.status, body: text });
                throw new Error(`Failed to list sessions: ${res.status} - ${text}`);
            }

            const data = (await res.json()) as any[];
            logger.info("✅ 获取到会话列表", { count: data.length });
            
            return data.map((item: any) => ({
                id: item.id,
                title: item.title || "未命名会话",
                created: item.created || Date.now(),
                updated: item.updated || Date.now(),
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error("❌ 获取会话列表失败", { error: errorMessage });
            throw err;
        }
    }

    async createSession(title: string): Promise<string> {
        logger.info("🔧 创建 OpenCode 会话", { title });
        const url = `${this.baseUrl}/session`;

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
        });

        if (!res.ok) {
            const text = await res.text();
            logger.error("❌ 会话创建失败", { status: res.status, body: text });
            throw new Error(`Failed to create session: ${res.status} - ${text}`);
        }

        const data = (await res.json()) as any;
        logger.info("✅ OpenCode 会话已创建", { id: data.id });
        return data.id;
    }

    async sendMessage(
        sessionId: string,
        parts: any[],
        model?: string
    ): Promise<string> {
        const body: any = { parts };
        if (model) {
            body.model = { providerID: "opencode", modelID: model };
        }

        const url = `${this.baseUrl}/session/${sessionId}/message`;
        logger.info("🤔 正在处理...", { url });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1_800_000);

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text();
                logger.error("❌ 请求失败", {
                    status: res.status,
                    body: text.substring(0, 200),
                });
                throw new Error(`Prompt failed: ${res.status} - ${text}`);
            }

            const text = await res.text();
            if (!text || text.trim() === "") {
                logger.error("❌ 响应为空", {
                    status: res.status,
                    url,
                });
                throw new Error(
                    "OpenCode 返回了空响应。请检查 OpenCode 服务配置和 API Key。"
                );
            }

            let data: any;
            try {
                data = JSON.parse(text);
            } catch (e) {
                logger.error("❌ JSON 解析失败", { text: text.substring(0, 200) });
                throw new Error(
                    `OpenCode 返回了无效的响应格式。原始响应: ${text.substring(0, 100)}`
                );
            }

            let responseText = "";
            if (data.parts) {
                responseText = data.parts
                    .filter((p: any) => p.type === "text" && p.text)
                    .map((p: any) => p.text)
                    .join("\n");
            } else if (data.info?.text) {
                responseText = data.info.text;
            }

            return responseText;
        } finally {
            clearTimeout(timeout);
        }
    }

    async query(options: QueryOptions): Promise<QueryResult> {
        const { prompt, resume, model, images, title } = options;
        logger.info("🤔 开始处理查询", {
            model,
            resume: !!resume,
            hasImages: !!images?.length,
            title,
        });

        try {
            let sessionId = resume || "";
            if (!sessionId) {
                const sessionTitle = title || "WeChat: session";
                sessionId = await this.createSession(sessionTitle);
            }

            const parts: any[] = [{ type: "text", text: prompt }];
            if (images?.length) {
                for (const img of images) {
                    parts.push({ type: "image", source: img.source });
                }
            }

            const text = await this.sendMessage(sessionId, parts, model);
            logger.info("💡 处理完成", { session: sessionId, len: text.length });

            return { text, sessionId };
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            logger.error("❌ 查询失败", {
                error: errorMessage,
                prompt: prompt?.substring(0, 100),
                resume: !!resume,
                model,
            });

            return { text: "", sessionId: "", error: errorMessage };
        }
    }
}
