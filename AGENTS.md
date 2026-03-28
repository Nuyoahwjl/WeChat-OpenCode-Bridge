# AGENTS.md - WeChat OpenCode Bridge

## Project Overview

Node.js bridge connecting WeChat personal accounts to OpenCode AI via WeChat ilink bot API. TypeScript ESM project with QR code login and long-polling message monitoring.

Version: 1.1.0. Written by Nuyoahwjl. MIT license.

## Build / Dev Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript (`tsc`) to `dist/` |
| `npm run dev` | Watch mode (`tsc --watch`), auto-recompile on changes |
| `npm run start` | Run compiled output (`node dist/index.js start`) |
| `npm run setup` | QR code login flow to bind WeChat account |
| `npm run stop` | Print stop instructions (manual process kill) |
| `npm run status` | Show current bound account ID |
| `npm install` | Install deps + auto-builds via `postinstall` |

CLI dispatches on `process.argv[2]`: `setup`, `start` (default when no arg), `stop`, `status`, `help`/`--help`/`-h`.

### Type Checking & Testing
- **No test framework** — validate with `npx tsc --noEmit`
- **No lint command** — TypeScript strict mode catches errors
- **No test runner** — all validation via type checking

## Architecture

```
src/
├── index.ts              # CLI entry point + daemon orchestration
├── logger.ts             # Structured logger singleton (LogLevel enum)
├── constants.ts          # Shared constants (paths, URLs, limits)
├── config.ts             # Config load/save (model, permissionMode)
├── commands/
│   └── router.ts         # Slash-command dispatcher + handlers
├── opencode/
│   └── client.ts         # OpenCode REST API client (OpenCodeClient class)
├── store/
│   ├── account.ts        # Account credential persistence (JSON files)
│   └── session.ts        # Session state + chat history persistence
└── wechat/
    ├── types.ts          # WeChat ilink API type definitions + enums
    ├── api.ts            # WeChatApi class (getUpdates, sendMessage, etc.)
    ├── login.ts          # QR code login flow (startQrLogin, waitForQrScan)
    ├── fetch-helper.ts   # fetchWithRetry() with retry + timeout
    └── monitor.ts        # Long-polling message monitor with backoff
```

### Data Flow

1. `monitor.ts` polls WeChat via `WeChatApi.getUpdates()` in a loop
2. Incoming messages dispatched to `handleMessage()` in `index.ts`
3. Slash commands (`/`) routed via `commands/router.ts`
4. AI queries sent to OpenCode via `OpenCodeClient.query()`
5. Responses split (if >2048 chars) and sent back via `WeChatApi.sendMessage()`

### WeChat Commands (in `commands/router.ts`)

| Command | Description |
|---------|-------------|
| `/help` | Show help text |
| `/new [title]` | Create new OpenCode session (timestamp name if no arg) |
| `/rename <title>` | Rename current session (adds `WeChat: ` prefix) |
| `/delete [title]` | Delete session by partial title match, or current if no arg |
| `/history [count]` | Show chat history (default 20) |
| `/sessions` | List all sessions from OpenCode server |
| `/switch <title>` | Switch to session by partial title match |

## Code Style Guidelines

### Module System
- ESM (`"type": "module"` in package.json, `"module": "ES2022"` in tsconfig)
- Use `node:` prefix for built-in imports: `import { join } from "node:path"`
- Import from local modules with `.js` extensions: `import { logger } from "./logger.js"`
- Use `import type` for type-only imports

### Imports
- Node builtins first (with `node:` prefix), separated by blank line
- Then local project imports
- `import * as fs from "node:fs"` for namespace-style Node imports
- `import process from "node:process"` in `index.ts` (bare default import, not destructured)
- Named exports preferred over default exports

### Types & Naming
- Strict mode enabled — handle `null`/`undefined` explicitly
- Interfaces for data shapes (`Config`, `Session`, `AccountData`, `WeixinMessage`)
- Enums for fixed sets (`MessageType`, `MessageItemType`, `MessageState`, `LogLevel`)
- PascalCase for types/interfaces/enums, camelCase for variables/functions
- UPPER_SNAKE_CASE for module-level constants (`DATA_DIR`, `OPENCODE_DEFAULT_URL`)

### Formatting
- 4-space indentation throughout codebase
- Double quotes for strings
- Semicolons required
- Arrow functions for callbacks, named functions for exported/module-level functions
- No trailing commas

### Error Handling
- `instanceof Error ? err.message : String(err)` for error message extraction
- Try/catch with `finally` for cleanup (e.g., `clearTimeout`)
- Log via `logger` singleton, never raw `console.error`
- Throw with context: `throw new Error("sendMessage failed: ret=...")`
- Async functions: let errors propagate unless explicitly handling

### Async Patterns
- Always `async/await`
- `AbortController` + `setTimeout` for request timeouts
- `sleep()` helpers for delays (exists in both `login.ts` and `monitor.ts`)
- Monitor's `sleep()` accepts optional `AbortSignal` for graceful shutdown
- Polling loops check `controller.signal.aborted` before continuing

### Logging
- Singleton `logger` from `src/logger.ts`
- Methods: `debug`, `info`, `warn`, `error` — message string + optional data object
- `LOG_LEVEL` env var (numeric: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR; default: INFO)
- Include context in data objects: `{ accountId, sessionId, error }`
- Format: `HH:MM:SS [LEVEL]  message  key=value`

### Configuration & Environment
- Data stored in `~/.WeChat-OpenCode-Bridge/` with subdirs `accounts/`, `sessions/`, `logs/`
- `OPENCODE_URL` env var overrides OpenCode server URL (default `http://localhost:4096`)
- Config files are JSON, written with `JSON.stringify(data, null, 2)`
- `config.ts` stores optional `model` and `permissionMode` settings

### Class Patterns
- `WeChatApi`: constructor validates `baseUrl` against `weixin.qq.com`/`wechat.com` domains; falls back to default if invalid
- Private helpers: `private headers()`, `private request<T>()`
- Generic request wrapper with timeout via `AbortController` + `setTimeout`
- Response validation: check `res.ok`, parse typed JSON
- `OpenCodeClient`: similar pattern; `sendMessage()` has 30-minute timeout (1,800,000ms)

## Key Implementation Details

### Message Deduplication (two layers)
1. **Monitor level** (`monitor.ts`): `Set<number>` tracking `message_id`, capped at 1000 entries (evicts oldest 500 when full)
2. **Handler level** (`index.ts`): `Set<string>` keyed by `${fromUserId}-${contextToken}`, 60-second auto-expiry via `setTimeout`

### Message Splitting
- `splitMessage()` in `index.ts` splits responses >2048 chars at newline boundaries
- Falls back to hard split if no newline found in first 30% of chunk

### OpenCodeClient Methods
- `health()` — GET `/global/health`, returns boolean
- `listSessions()` — GET `/session`, maps `item.time.created`/`item.time.updated` timestamps
- `createSession(title)` — POST `/session`, returns session ID
- `renameSession(id, title)` — PATCH `/session/{id}`
- `deleteSession(id)` — DELETE `/session/{id}`
- `sendMessage(sessionId, parts, model?)` — POST `/session/{id}/message`, parses `data.parts` or `data.info.text`
- `query(options)` — orchestration method: creates/reuses session, calls `sendMessage()`, returns `{text, sessionId, error?}`

### WeChatApi Methods
- `getUpdates(buf?)` — POST `ilink/bot/getupdates`, 35s timeout
- `sendMessage(req)` — POST `ilink/bot/sendmessage`, throws on non-zero `ret`
- `getConfig(userId, contextToken?)` — POST `ilink/bot/getconfig`
- `sendTyping(userId, ticket, status)` — POST `ilink/bot/sendtyping`

### Session State
- States: `"idle"`, `"processing"`, `"waiting_permission"`
- Chat history capped at `maxHistoryLength` (default 100), trimmed from front
- Session files: `{accountId}_{timestamp}.json` in `~/.WeChat-OpenCode-Bridge/sessions/`

### Monitor Backoff
- Consecutive failures < 3: 3-second delay
- Consecutive failures >= 3: 30-second delay
- Session expired (errcode -14): pause 1 hour, call `onSessionExpired` callback

## Adding New WeChat Commands

1. Add a `case` to the `switch` in `src/commands/router.ts`
2. Implement `handleXxx(ctx: CommandContext, args: string): CommandResult`
3. Return `{ handled: true, reply: "..." }` to send reply, or `{ handled: true }` to handle silently
4. Update `handleHelp()` text to include the new command
5. Add optional methods to `CommandContext` interface if external services needed

## Dependencies

- Runtime: `qrcode-terminal` (QR display), `@opencode-ai/sdk` (OpenCode SDK types)
- Dev: `typescript` (5.9.3), `@types/node` (22+), `@types/qrcode-terminal`
- No test framework, linter, or formatter configured

## TypeScript Configuration

- Strict mode: `"strict": true`
- Module: ES2022, target ES2022, node module resolution
- Output: `./dist` with source maps, declaration files, declaration maps
- Include: `src/**/*`
- Typecheck without emit: `npx tsc --noEmit`

## Debugging

- Run `npm run dev` for watch rebuilds
- Set `LOG_LEVEL=0` for debug-level logging
- Check status: `npm run status`
- Logs output to stdout/stderr (not to files by default)

## Common Gotchas

- Local imports must include `.js` extension — TypeScript does not rewrite import paths
- `src/index.ts` uses `import process from "node:process"` (default import, not destructured)
- `WeChatApi.sendMessage()` throws on non-zero `ret` field — catch and handle at call site
- Session state persisted synchronously via `fs.writeFileSync` — avoid calling in hot loops
- `fetch-helper.ts` sets `User-Agent: WeChat-OpenCode-Bridge/1.1.0` on all requests
- OpenCode `sendMessage` timeout is 30 minutes — don't confuse with WeChat API's 15-35s timeouts
- `constants.ts` and `store/account.ts` both define `DATA_DIR` — the store version is the one actually used at runtime
