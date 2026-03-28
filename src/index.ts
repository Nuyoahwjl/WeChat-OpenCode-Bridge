import process from "node:process";
import { WeChatApi } from "./wechat/api.js";
import { startQrLogin, waitForQrScan, displayQrInTerminal } from "./wechat/login.js";
import { createMonitor, type MonitorCallbacks } from "./wechat/monitor.js";
import { OpenCodeClient, type Session } from "./opencode/client.js";
import { loadLatestAccount, saveAccount, ensureDataDir } from "./store/account.js";
import {
    createSession,
    loadSession,
    saveSession,
    addChatMessage,
    clearSession,
    getChatHistoryText,
    deleteSessionFile,
    findLocalSessionBySdkId,
    type SessionHandle,
    type Session as LocalSession,
} from "./store/session.js";
import { routeCommand, type CommandContext } from "./commands/router.js";
import { logger } from "./logger.js";
import { MessageType, MessageItemType, MessageState, type WeixinMessage, type AccountData } from "./wechat/types.js";

const MAX_MESSAGE_LENGTH = 2048;
let clientCounter = 0;

function generateClientId(): string {
    return `wcc-${Date.now()}-${++clientCounter}`;
}

function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        let splitIdx = remaining.lastIndexOf("\n", maxLen);
        if (splitIdx < maxLen * 0.3) {
            splitIdx = maxLen;
        }
        chunks.push(remaining.slice(0, splitIdx));
        remaining = remaining.slice(splitIdx).replace(/^\n+/, "");
    }
    return chunks;
}

function extractTextFromItems(items: NonNullable<WeixinMessage["item_list"]>): string {
    return items.map((item) => item.text_item?.text).filter(Boolean).join("\n");
}

function generateTitle(): string {
    const now = new Date();
    return `WeChat: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
}

async function runSetup(): Promise<void> {
    ensureDataDir();
    console.log("⚙️ 正在设置...\n");
    while (true) {
        const { qrcodeUrl, qrcodeId } = await startQrLogin();
        console.log("📷 请用微信扫描下方二维码：");
        await displayQrInTerminal(qrcodeUrl);
        console.log("⏳ 等待扫码绑定...");
        try {
            const account = await waitForQrScan(qrcodeId);
            saveAccount(account);
            console.log("✅ 绑定成功!");
            break;
        } catch (err: any) {
            if (err.message?.includes("expired")) {
                console.log("🔄 二维码已过期，正在刷新...");
                continue;
            }
            throw err;
        }
    }
    console.log("\n");
    console.log("❤️‍🔥 1.先在你的工作目录终端运行 opencode serve");
    console.log("👉 2.在当前终端运行 npm run daemon:start 启动服务");
}

const processingMsgIds = new Set<string>();

interface DaemonContext {
    account: AccountData;
    opencode: OpenCodeClient;
    sessionHandle: SessionHandle;
}

async function handleMessage(msg: WeixinMessage, ctx: DaemonContext): Promise<void> {
    if (msg.message_type !== MessageType.USER) return;
    if (!msg.from_user_id || !msg.item_list) return;

    const msgId = `${msg.from_user_id}-${msg.context_token}`;
    if (processingMsgIds.has(msgId)) {
        logger.warn("⏭️ 消息重复，跳过", { msgId });
        return;
    }
    processingMsgIds.add(msgId);
    setTimeout(() => processingMsgIds.delete(msgId), 60000);

    const contextToken = msg.context_token ?? "";
    const fromUserId = msg.from_user_id;
    const userText = extractTextFromItems(msg.item_list);

    if (!userText) {
        return;
    }

    logger.info("📩 收到消息", { from: fromUserId, text: userText.substring(0, 80) });

    const handle = ctx.sessionHandle;
    const session = handle.session;

    if (userText.startsWith("/")) {
        const cmdCtx: CommandContext = {
            text: userText,
            updateSession: (partial: any) => {
                Object.assign(session, partial);
                saveSession(handle.sessionId, session);
            },
            newSession: async (customTitle?: string) => {
                const newHandle = createSession(ctx.account.accountId);
                const title = customTitle ? `WeChat: ${customTitle}` : generateTitle();
                newHandle.session.sdkSessionId = await ctx.opencode.createSession(title);
                handle.sessionId = newHandle.sessionId;
                handle.session = newHandle.session;
                saveSession(handle.sessionId, handle.session);
                logger.info("💌 新会话已创建", { session: handle.sessionId, sdkSession: newHandle.session.sdkSessionId, title });
            },
            getChatHistoryText: (limit?: number) => getChatHistoryText(session, limit),
            listSessions: async () => {
                try {
                    return await ctx.opencode.listSessions();
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    logger.error("❌ 获取会话列表失败", { error: errorMsg });
                    return [];
                }
            },
            getCurrentSessionId: () => {
                return handle.session.sdkSessionId || "";
            },
            getCurrentSessionTitle: () => {
                // Get current session title from OpenCode
                return "";
            },
            switchSession: (sdkSessionId: string) => {
                // Find existing local session by SDK session ID
                const existingSessionId = findLocalSessionBySdkId(ctx.account.accountId, sdkSessionId);

                if (existingSessionId) {
                    const existingHandle = loadSession(existingSessionId);
                    if (existingHandle) {
                        // Use existing local session
                        handle.sessionId = existingHandle.sessionId;
                        handle.session = existingHandle.session;
                        logger.info("🔄 复用已有本地会话", { sessionId: existingSessionId, sdkSession: sdkSessionId });
                    }
                } else {
                    // Create new local session linked to SDK session
                    const newHandle = createSession(ctx.account.accountId);
                    newHandle.session.sdkSessionId = sdkSessionId;
                    handle.sessionId = newHandle.sessionId;
                    handle.session = newHandle.session;
                    logger.info("🔄 创建新本地会话", { sessionId: newHandle.sessionId, sdkSession: sdkSessionId });
                }

                saveSession(handle.sessionId, handle.session);
                logger.info("🔄 已切换会话", { sessionId: handle.sessionId, sdkSession: sdkSessionId });
            },
            renameSession: async (newTitle: string) => {
                const sdkSessionId = handle.session.sdkSessionId;
                if (!sdkSessionId) {
                    throw new Error("当前会话未关联 OpenCode 会话");
                }
                const fullTitle = `WeChat: ${newTitle}`;
                await ctx.opencode.renameSession(sdkSessionId, fullTitle);
                logger.info("✏️ 会话已重命名", { sessionId: handle.sessionId, sdkSession: sdkSessionId, fullTitle });
            },
            deleteSession: async (sessionTitle?: string) => {
                const sessions = await ctx.opencode.listSessions();
                let matchedSession;

                if (sessionTitle) {
                    // Find session by exact title match
                    const targetTitle = sessionTitle.trim();
                    matchedSession = sessions.find(s =>
                        (s.title || "") === targetTitle
                    );
                } else {
                    // Delete current session
                    const currentSdkSessionId = handle.session.sdkSessionId;
                    if (currentSdkSessionId) {
                        matchedSession = sessions.find(s => s.id === currentSdkSessionId);
                    }
                }

                if (!matchedSession) {
                    return { deleted: false, wasCurrent: false };
                }

                const currentSdkSessionId = handle.session.sdkSessionId;
                const isCurrent = matchedSession.id === currentSdkSessionId;

                // Delete from OpenCode
                await ctx.opencode.deleteSession(matchedSession.id);

                // Delete local session file if exists
                const localSessionId = findLocalSessionBySdkId(ctx.account.accountId, matchedSession.id);
                if (localSessionId) {
                    deleteSessionFile(localSessionId);
                }

                // Clear current session if it was deleted
                if (isCurrent) {
                    handle.session.sdkSessionId = undefined;
                    // saveSession(handle.sessionId, handle.session);
                }

                logger.info("🗑️ 会话已删除", {
                    sdkSession: matchedSession.id,
                    title: matchedSession.title,
                    wasCurrent: isCurrent
                });

                return { deleted: true, wasCurrent: isCurrent };
            },
        };
        const result = await routeCommand(cmdCtx);
        if (result.handled && result.reply) {
            await sendReply(ctx.account, fromUserId, contextToken, result.reply);
            return;
        }
        if (result.handled) {
            return;
        }
    }

    // Check if current session has been deleted
    if (!session.sdkSessionId) {
        await sendReply(ctx.account, fromUserId, contextToken, "⚠️ 当前会话已被删除\n⚠️ 请使用 /new 创建新会话\n⚠️ 或使用/switch 切换到其他会话");
        return;
    }

    session.state = "processing";
    saveSession(handle.sessionId, session);
    addChatMessage(session, "user", userText);

    try {
        const result = await ctx.opencode.query({
            prompt: userText,
            resume: session.sdkSessionId,
            model: session.model,
        });

        if (result.error) {
            logger.error("❌ OpenCode 查询失败", { error: result.error });
            await sendReply(ctx.account, fromUserId, contextToken, "OpenCode 处理请求时出错，请稍后重试。");
        } else if (result.text) {
            addChatMessage(session, "assistant", result.text);
            const chunks = splitMessage(result.text);
            for (const chunk of chunks) {
                await sendReply(ctx.account, fromUserId, contextToken, chunk);
            }
        } else {
            await sendReply(ctx.account, fromUserId, contextToken, "OpenCode 无返回内容");
        }

        if (result.sessionId) {
            session.sdkSessionId = result.sessionId;
        }
        session.state = "idle";
        saveSession(handle.sessionId, session);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("❌ 消息处理异常", { error: errorMsg });
        await sendReply(ctx.account, fromUserId, contextToken, "处理消息时出错，请稍后重试。");
        session.state = "idle";
        saveSession(handle.sessionId, session);
    }
}

async function sendReply(
    account: AccountData,
    toUserId: string,
    contextToken: string,
    text: string
): Promise<void> {
    try {
        const api = new WeChatApi(account.botToken, account.baseUrl);
        const clientId = generateClientId();

        const resp = await api.sendMessage({
            msg: {
                from_user_id: account.accountId,
                to_user_id: toUserId,
                client_id: clientId,
                message_type: MessageType.BOT,
                message_state: MessageState.FINISH,
                context_token: contextToken,
                item_list: [{
                    type: MessageItemType.TEXT,
                    text_item: { text }
                }],
            },
        });
        logger.info("✉️ 消息已发送", { to: toUserId, len: text.length, ret: resp.ret });
    } catch (err) {
        logger.error("❌ 消息发送失败", { error: String(err) });
    }
}

async function runDaemon(): Promise<void> {
    const account = loadLatestAccount();
    if (!account) {
        console.error("❌ 未找到账号，请先运行 npm run setup");
        process.exit(1);
    }

    console.log("🔗 正在连接 OpenCode 服务...");
    const opencode = new OpenCodeClient();
    try {
        const healthy = await opencode.health();
        if (!healthy) {
            throw new Error("OpenCode 服务未启动");
        }
        console.log("✅ OpenCode 服务已连接");
    } catch (err) {
        console.error("❌ " + (err instanceof Error ? err.message : String(err)));
        console.log("   请确保 OpenCode 服务已启动: opencode serve");
        process.exit(1);
    }

    const sessionHandle = createSession(account.accountId);
    const title = generateTitle();
    sessionHandle.session.sdkSessionId = await opencode.createSession(title);
    saveSession(sessionHandle.sessionId, sessionHandle.session);
    logger.info("🔎 会话已创建", { session: sessionHandle.sessionId, sdkSession: sessionHandle.session.sdkSessionId });

    const daemonCtx: DaemonContext = {
        account,
        opencode,
        sessionHandle,
    };

    const api = new WeChatApi(account.botToken, account.baseUrl);
    const callbacks: MonitorCallbacks = {
        onMessage: async (msg: WeixinMessage) => {
            await handleMessage(msg, daemonCtx);
        },
        onSessionExpired: () => {
            logger.warn("⚠️ 微信会话已过期");
            console.error("⚠️ 微信会话已过期，请重新运行 npm run setup 扫码绑定");
        },
    };
    const monitor = createMonitor(api, callbacks);

    function shutdown(): void {
        logger.info("🛑 正在停止守护进程...");
        monitor.stop();
        process.exit(0);
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    logger.info("🚀 守护进程已启动", { account: account.accountId, session: sessionHandle.sessionId });
    console.log("");
    console.log("账号   " + account.accountId);
    console.log("会话   " + sessionHandle.sessionId);
    console.log("");
    console.log("🛡️ 守护进程已启动，等待消息中... [按 Ctrl+C 停止]");
    console.log("");
    await monitor.run();
}

function showHelp(): void {
    console.log(`WeChat-OpenCode-Bridge - 微信接入 OpenCode
用法:
    npm run setup 扫码绑定微信
    npm run daemon:start 启动服务
    npm run daemon:stop 停止服务
    npm run daemon:status 查看状态
    `);
}

const command = process.argv[2];

if (command === "setup") {
    runSetup().catch((err) => {
        logger.error("❌ 设置失败", { error: err instanceof Error ? err.message : String(err) });
        console.error("设置失败:", err);
        process.exit(1);
    });
} else if (command === "start" || !command) {
    runDaemon().catch((err) => {
        logger.error("❌ 守护进程异常", { error: err instanceof Error ? err.message : String(err) });
        console.error("运行失败:", err);
        process.exit(1);
    });
} else if (command === "stop") {
    console.log("停止服务需要手动终止进程");
} else if (command === "status") {
    const account = loadLatestAccount();
    if (account) {
        console.log(`账号: ${account.accountId}`);
    } else {
        console.log("未找到账号");
    }
} else if (command === "help" || command === "--help" || command === "-h") {
    showHelp();
} else {
    console.error(`未知命令: ${command}`);
    showHelp();
    process.exit(1);
}
