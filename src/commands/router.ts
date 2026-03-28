export interface CommandContext {
    text: string;
    updateSession: (partial: any) => void;
    clearSession: () => void;
    newSession: (title?: string) => Promise<void>;
    getChatHistoryText: (limit?: number) => string;
    listSessions?: () => Promise<Array<{ id: string; title?: string; created: number; updated: number }>>;
    getCurrentSessionId?: () => string;
    switchSession?: (sessionId: string) => void;
    renameSession?: (newTitle: string) => Promise<void>;
    deleteSession?: (sessionTitle: string) => Promise<{ deleted: boolean; wasCurrent: boolean }>;
}

export interface CommandResult {
    handled: boolean;
    reply?: string;
    prompt?: string;
}

export async function routeCommand(ctx: CommandContext): Promise<CommandResult> {
    const text = ctx.text.trim();
    const spaceIdx = text.indexOf(" ");
    const cmd = (spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)).toLowerCase();
    const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

    switch (cmd) {
        case "help":
            return handleHelp();
        case "clear":
            return handleClear(ctx);
        case "status":
            return handleStatus();
        case "new":
            return handleNew(ctx, args);
        case "history":
            return handleHistory(ctx, args);
        case "sessions":
            return await handleSessions(ctx);
        case "switch":
            return await handleSwitch(ctx, args);
        case "rename":
            return await handleRename(ctx, args);
        case "delete":
            return await handleDelete(ctx, args);
        default:
            return { handled: true, reply: `❌ 未知指令: /${cmd}\n发送 /help 查看可用命令` };
    }
}

function handleHelp(): CommandResult {
    const help = `微信 OpenCode 助手命令：
/help          - 显示帮助信息
/clear         - 清空当前会话
/new [标题]    - 创建新的会话
/rename <标题> - 重命名当前会话
/delete <标题> - 删除指定会话
/status        - 显示当前状态
/history [数量] - 查看聊天历史
/sessions      - 列出所有会话
/switch <标题> - 切换到指定会话`;
    return { handled: true, reply: help };
}

function handleClear(ctx: CommandContext): CommandResult {
    ctx.clearSession();
    return { handled: true, reply: "✅ 当前会话已清空" };
}

function handleStatus(): CommandResult {
    return { handled: true, reply: "状态: 运行中" };
}

async function handleNew(ctx: CommandContext, args: string): Promise<CommandResult> {
    const title = args.trim() || undefined;
    await ctx.newSession(title);
    return { handled: true, reply: "✅ 已创建新会话" };
}

function handleHistory(ctx: CommandContext, args: string): CommandResult {
    const limit = args ? parseInt(args) : 20;
    const history = ctx.getChatHistoryText(limit);
    return { handled: true, reply: history || "暂无聊天记录" };
}

async function handleSessions(ctx: CommandContext): Promise<CommandResult> {
    if (!ctx.listSessions) {
        return { handled: true, reply: "❌ 无法获取会话列表：未提供会话列表功能" };
    }

    try {
        const sessions = await ctx.listSessions();
        if (sessions.length === 0) {
            return { handled: true, reply: "📭 当前没有会话" };
        }

        const formatTime = (timestamp: number) => {
            // OpenCode API returns timestamps in milliseconds, but check if it's seconds
            // Unix timestamp in seconds is 10 digits, in milliseconds is 13 digits
            const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
            const date = new Date(ts);
            return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        };

        // Get current session ID if available
        let currentSessionId = "";
        if (ctx.getCurrentSessionId) {
            currentSessionId = ctx.getCurrentSessionId();
        }

        let reply = "📋 会话列表：\n\n";
        sessions.forEach((session, index) => {
            const title = session.title || "未命名会话";
            const created = formatTime(session.created);
            const isCurrent = session.id === currentSessionId;
            const marker = isCurrent ? "✅ (当前会话)" : "";
            reply += `${index + 1}.${title}\n`;
            reply += `   ID: ${session.id.substring(0, 12)}...\n`;
            reply += `   创建: ${created}\n`;
            reply += `   ${marker}\n\n`;
        });

        reply += `共 ${sessions.length} 个会话`;
        return { handled: true, reply };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { handled: true, reply: `❌ 获取会话列表失败: ${errorMsg}` };
    }
}

async function handleSwitch(ctx: CommandContext, args: string): Promise<CommandResult> {
    if (!args) {
        return { handled: true, reply: "❌ 请提供会话标题\n用法: /switch <会话标题>" };
    }

    if (!ctx.listSessions || !ctx.switchSession) {
        return { handled: true, reply: "❌ 无法切换会话：功能未启用" };
    }

    try {
        const sessions = await ctx.listSessions();
        const targetTitle = args.trim().toLowerCase();

        // Find session by title (case-insensitive partial match)
        const matchedSession = sessions.find(s =>
            (s.title || "").toLowerCase().includes(targetTitle)
        );

        if (!matchedSession) {
            return { handled: true, reply: `❌ 未找到标题包含 "${args}" 的会话` };
        }

        ctx.switchSession(matchedSession.id);
        return { handled: true, reply: `✅ 已切换到会话: ${matchedSession.title || "未命名会话"}` };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { handled: true, reply: `❌ 切换会话失败: ${errorMsg}` };
    }
}

async function handleRename(ctx: CommandContext, args: string): Promise<CommandResult> {
    if (!args) {
        return { handled: true, reply: "❌ 请提供新标题\n用法: /rename <新标题>" };
    }

    if (!ctx.renameSession) {
        return { handled: true, reply: "❌ 无法重命名会话：功能未启用" };
    }

    try {
        const newTitle = args.trim();
        await ctx.renameSession(newTitle);
        return { handled: true, reply: `✅ 会话已重命名为: WeChat: ${newTitle}` };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { handled: true, reply: `❌ 重命名会话失败: ${errorMsg}` };
    }
}

async function handleDelete(ctx: CommandContext, args: string): Promise<CommandResult> {
    if (!args) {
        return { handled: true, reply: "❌ 请提供要删除的会话标题\n用法: /delete <会话标题>" };
    }

    if (!ctx.deleteSession) {
        return { handled: true, reply: "❌ 无法删除会话：功能未启用" };
    }

    try {
        const sessionTitle = args.trim();
        const result = await ctx.deleteSession(sessionTitle);
        
        if (!result.deleted) {
            return { handled: true, reply: `❌ 未找到标题包含 "${sessionTitle}" 的会话` };
        }

        if (result.wasCurrent) {
            return { handled: true, reply: `✅ 已删除会话: ${sessionTitle}\n⚠️ 当前会话已被删除，请使用 /new 创建新会话` };
        }

        return { handled: true, reply: `✅ 已删除会话: ${sessionTitle}` };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { handled: true, reply: `❌ 删除会话失败: ${errorMsg}` };
    }
}
