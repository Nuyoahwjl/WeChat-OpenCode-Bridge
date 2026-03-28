export interface CommandContext {
    text: string;
    updateSession: (partial: any) => void;
    clearSession: () => void;
    newSession: () => Promise<void>;
    getChatHistoryText: (limit?: number) => string;
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
/history [数量] - 查看聊天历史`;
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
