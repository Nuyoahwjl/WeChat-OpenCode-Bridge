# WeChat OpenCode Bridge

A Node.js bridge service that connects WeChat personal accounts to OpenCode AI assistant via WeChat ilink bot API.

## Features

- QR code login flow to bind WeChat account
- Long-polling message monitoring
- Real-time message forwarding between WeChat and OpenCode
- Session management with chat history persistence
- Slash command support (/help, /clear, etc.)

## Installation

```bash
npm install
```

## Quick Start

1. **Setup** (bind WeChat account):
   ```bash
   npm run setup
   ```
   Scan the QR code with your WeChat app.

2. **Start daemon** (run in background):
   ```bash
   npm run daemon:start
   ```

3. **Check status**:
   ```bash
   npm run daemon:status
   ```

## Development

```bash
# Development mode (watch)
npm run dev

# Build TypeScript
npm run build

# Type check
npx tsc --noEmit
```

## Architecture

```
src/
├── index.ts              # CLI entry point
├── logger.ts             # Structured logger
├── constants.ts          # Shared constants
├── config.ts             # Configuration management
├── commands/
│   └── router.ts         # Slash-command dispatcher
├── opencode/
│   └── client.ts         # OpenCode REST API client
├── store/
│   ├── account.ts        # Account credential persistence
│   └── session.ts        # Session state + chat history
└── wechat/
    ├── types.ts          # WeChat API types
    ├── api.ts            # WeChat API client
    ├── login.ts          # QR code login flow
    ├── fetch-helper.ts   # fetch() wrapper with retry
    └── monitor.ts        # Long-polling message monitor
```

## Configuration

- Data stored in `~/.WeChat-OpenCode-Bridge/`
- Override OpenCode URL: `OPENCODE_URL=http://your-server:port`
- Logs stored in `~/.WeChat-OpenCode-Bridge/logs/`

## License

MIT