export interface CommandContext {
    text: string;
    updateSession: (partial: any) => void;
    clearSession: () => void;
    newSession: () => Promise<void>;
    getChatHistoryText: (limit?: number) => string;
    listSessions?: () => Promise<Array<{ id: string; title?: string; created: number; updated: number }>>;
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
        default:
            return { handled: false };
    }
}

function handleHelp(): CommandResult {
    const help = `微信 OpenCode 助手命令：
/help - 显示帮助信息
/clear - 清空历史记录
/new - 创建新会话
/status - 显示当前状态
/history [数量] - 查看聊天历史
/sessions - 列出所有会话`;
    return { handled: true, reply: help };
}

function handleClear(ctx: CommandContext): CommandResult {
    ctx.clearSession();
    return { handled: true, reply: "✅ 历史记录已清除" };
}

function handleStatus(): CommandResult {
    return { handled: true, reply: "状态: 运行中" };
}

async function handleNew(ctx: CommandContext, args: string): Promise<CommandResult> {
    await ctx.newSession();
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
        
        let reply = "📋 当前会话列表：\n\n";
        sessions.forEach((session, index) => {
            const title = session.title || "未命名会话";
            const created = formatTime(session.created);
            reply += `${index + 1}. ${title}\n`;
            reply += `   ID: ${session.id.substring(0, 8)}...\n`;
            reply += `   创建: ${created}\n\n`;
        });
        
        reply += `共 ${sessions.length} 个会话`;
        return { handled: true, reply };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { handled: true, reply: `❌ 获取会话列表失败: ${errorMsg}` };
    }
}
