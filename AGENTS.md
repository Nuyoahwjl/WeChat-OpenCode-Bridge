# AGENTS.md - WeChat OpenCode Bridge

## Project Overview

Node.js bridge connecting WeChat personal accounts to OpenCode AI via WeChat ilink bot API. TypeScript ESM project with QR code login and long-polling message monitoring.

## Build / Dev Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript (`tsc`) to `dist/` |
| `npm run dev` | Watch mode, auto-recompile on changes |
| `npm run start` | Run compiled output (`node dist/index.js`) |
| `npm run setup` | QR code login flow to bind WeChat account |
| `npm run daemon:start` | Start background polling daemon |
| `npm run daemon:stop` | Print stop instructions |
| `npm run daemon:status` | Show current account status |
| `npm install` | Install deps + auto-builds via `postinstall` |

### Type Checking & Testing
- **No test framework** - validate with `npx tsc --noEmit`
- **No lint command** - use TypeScript strict mode for catching errors
- **No single test runner** - all validation via type checking

## Architecture

```
src/
├── index.ts              # CLI entry point (setup, daemon, status commands)
├── logger.ts             # Structured logger singleton
├── constants.ts          # Shared constants (paths, URLs, limits)
├── config.ts             # Config load/save to ~/.WeChat-OpenCode-Bridge/
├── commands/
│   └── router.ts         # Slash-command dispatcher (/help, /clear, etc.)
├── opencode/
│   └── client.ts         # HTTP client for OpenCode REST API
├── store/
│   ├── account.ts        # Account credential persistence (JSON files)
│   └── session.ts        # Session state + chat history persistence
└── wechat/
    ├── types.ts          # WeChat ilink API type definitions
    ├── api.ts            # WeChat API client (getUpdates, sendMessage)
    ├── login.ts          # QR code login flow
    ├── fetch-helper.ts   # fetch() wrapper with retry + timeout
    └── monitor.ts        # Long-polling message monitor with backoff
```

## Code Style Guidelines

### Module System
- ESM (`"type": "module"` in package.json, `"module": "ES2022"` in tsconfig)
- Use `node:` prefix for built-in imports: `import { join } from "node:path"`
- Import from local modules with `.js` extensions: `import { logger } from "./logger.js"`
- Use `import type` for type-only imports to keep them distinct at a glance

### Imports
- Node builtins first (with `node:` prefix), separated by blank line
- Then local project imports
- `import * as fs from "node:fs"` for namespace-style Node imports
- Named exports preferred over default exports (codebase uses named exports throughout)

### Types & Naming
- Strict mode enabled — handle `null`/`undefined` explicitly
- Interfaces for data shapes (`Config`, `Session`, `WeixinMessage`), enums for fixed sets (`MessageType`, `LogLevel`)
- PascalCase for types/interfaces/enums, camelCase for variables/functions/constants
- UPPER_SNAKE_CASE for module-level constants
- Prefix private members with descriptive access: `private readonly token`, `private headers()`

### Formatting
- 4-space indentation (tabs equivalent)
- Double quotes for strings
- Semicolons required
- Arrow functions for callbacks, named functions for exported/module-level functions
- Trailing commas not used
- Line length: reasonably short, no strict limit enforced

### Error Handling
- Wrap errors with `instanceof Error ? err.message : String(err)` for logging
- Use try/catch with `finally` for cleanup (e.g., `clearTimeout`)
- Log errors via the `logger` singleton, not raw `console.error`
- Throw descriptive errors with context: `throw new Error("sendMessage failed: ret=...")`
- Async functions: let errors propagate to caller unless explicitly handling

### Async Patterns
- Always `async/await`, never raw Promises for control flow
- `AbortController` + `setTimeout` for request timeouts
- Custom `sleep()` helper for delays, optionally with `AbortSignal`
- Polling loops check `controller.signal.aborted` before continuing

### Logging
- Use the singleton `logger` from `src/logger.ts`
- Methods: `debug`, `info`, `warn`, `error` — each takes message string + optional data object
- Log level controlled by `LOG_LEVEL` env var (default: INFO)
- Include relevant context in data objects: `{ accountId, sessionId, error }`

### Configuration & Environment
- Data stored in `~/.WeChat-OpenCode-Bridge/` with subdirs `accounts/`, `sessions/`, `logs/`
- `OPENCODE_URL` env var overrides OpenCode server URL (default `http://localhost:4096`)
- Config files are JSON, written with `JSON.stringify(data, null, 2)`

### Class Patterns
- Constructor validation with fallback defaults (see `WeChatApi` sanitizing `baseUrl`)
- Private helper methods prefixed logically: `private headers()`, `private request<T>()`
- Generic request wrapper with timeout via `AbortController` + `setTimeout`
- Response validation after fetch: check `res.ok`, parse typed JSON response

### CLI Entry Point
- `src/index.ts` dispatches on `process.argv[2]` (setup, start, stop, status, help)
- Top-level `.catch()` handlers log via `logger.error` then `process.exit(1)`
- Graceful shutdown via `process.on("SIGINT"/"SIGTERM")` calling monitor `.stop()`

### Message Deduplication
- Use `Set<string>` with timed expiry (`setTimeout` to delete after N ms) for deduping
- Key format: `${fromUserId}-${contextToken}`

### Network / Retry
- `fetchWithRetry()` in `src/wechat/fetch-helper.ts` wraps `fetch` with configurable retries, delay, timeout
- Note: `fetch-helper.ts` uses 2-space indent (inconsistent with rest of codebase's 4-space) — prefer 4-space for new code

### Adding New Commands
1. Add a `case` to the `switch` in `src/commands/router.ts`
2. Implement a `handleXxx(ctx: CommandContext, args: string): CommandResult` function
3. Return `{ handled: true, reply: "..." }` to send a reply, or `{ handled: true }` to silently handle
4. Update the `/help` text in `handleHelp()` to include the new command

### Dependencies
- Runtime: `qrcode-terminal` (QR code display in terminal)
- Dev: `typescript`, `@types/node`, `@types/qrcode-terminal`
- No test framework, linter, or formatter configured

## TypeScript Configuration
- Strict mode: `"strict": true` (no implicit any, null checks, etc.)
- Module: ES2022, target ES2022, node module resolution
- Output: `./dist` with source maps and declaration files
- Include: `src/**/*`
- No emit on typecheck: use `npx tsc --noEmit`

## Testing & Debugging
- No test framework; validate with `npx tsc --noEmit`
- Run in dev mode: `npm run dev` for watch rebuilds
- Start daemon: `npm run daemon:start` (requires prior `npm run setup`)
- Check status: `npm run daemon:status`
- Logs: default INFO level; set `LOG_LEVEL=debug` for verbose output

## Common Gotchas
- Local imports must include `.js` extension — TypeScript does not rewrite import paths
- `src/index.ts` uses bare `process` import (`import process from "node:process"`) not destructured
- `sendMessage` in `WeChatApi` throws on non-zero `ret` field — catch and handle at call site
- Session state is persisted synchronously via `fs.writeFileSync` — avoid calling in hot loops
