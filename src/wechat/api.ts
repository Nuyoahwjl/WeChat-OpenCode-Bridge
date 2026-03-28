import type { GetUpdatesResp, SendMessageReq, SendMessageResp } from "./types.js";
import { logger } from "../logger.js";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";

function generateUin(): string {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Buffer.from(buf).toString("base64");
}

export class WeChatApi {
    private readonly token: string;
    private readonly baseUrl: string;
    private readonly uin: string;

    constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
        if (baseUrl) {
            try {
                const url = new URL(baseUrl);
                const allowedHosts = ["weixin.qq.com", "wechat.com"];
                const isAllowed = allowedHosts.some(
                    (h) => url.hostname === h || url.hostname.endsWith("." + h)
                );
                if (url.protocol !== "https:" || !isAllowed) {
                    logger.warn("Untrusted baseUrl, using default", { baseUrl });
                    baseUrl = DEFAULT_BASE_URL;
                }
            } catch {
                logger.warn("Invalid baseUrl, using default", { baseUrl });
                baseUrl = DEFAULT_BASE_URL;
            }
        }
        this.token = token;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.uin = generateUin();
    }

    private headers(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
            AuthorizationType: "ilink_bot_token",
            "X-WECHAT-UIN": this.uin,
        };
    }

    private async request<T>(
        path: string,
        body: unknown,
        timeoutMs: number = 15_000
    ): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const url = `${this.baseUrl}/${path}`;

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            const json = (await res.json()) as T;
            return json;
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    async getUpdates(buf?: string): Promise<GetUpdatesResp> {
        logger.debug("📬 正在拉取消息");
        return this.request<GetUpdatesResp>(
            "ilink/bot/getupdates",
            buf ? { get_updates_buf: buf } : {},
            35_000
        );
    }

    async sendMessage(req: SendMessageReq): Promise<SendMessageResp> {
        const resp = await this.request<SendMessageResp>("ilink/bot/sendmessage", req);
        logger.info("📤 发送响应", { ret: resp.ret, errcode: resp.errcode });
        
        if (resp.ret !== undefined && resp.ret !== 0) {
            throw new Error(`sendMessage failed: ret=${resp.ret}, errcode=${resp.errcode}, errmsg=${resp.errmsg}`);
        }
        
        return resp;
    }

    async getConfig(
        ilinkUserId: string,
        contextToken?: string
    ): Promise<{ typing_ticket?: string }> {
        return this.request<{ typing_ticket?: string }>(
            "ilink/bot/getconfig",
            { ilink_user_id: ilinkUserId, context_token: contextToken },
            10_000
        );
    }

    async sendTyping(
        toUserId: string,
        typingTicket: string,
        status: number
    ): Promise<void> {
        await this.request(
            "ilink/bot/sendtyping",
            { ilink_user_id: toUserId, typing_ticket: typingTicket, status },
            5_000
        );
    }
}
