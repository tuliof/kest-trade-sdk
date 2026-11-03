# Questrade Typescript SDK

A TypeScript SDK for the Questrade API, built with Bun.
Provides type-safe access to:

- **Accounts** - Get account information, balances, positions, activities, executions, and orders
- **Market Data** - Search symbols, get quotes, candles (OHLC), option chains, and market info

Refer to the [Questrade API documentation](https://www.questrade.com/api/documentation) for detailed endpoint information.

## Features

- ✅ **Full TypeScript support** with comprehensive type definitions
- 🔄 **Automatic token rotation** - Questrade refresh tokens are automatically updated
- 🔐 **Pluggable token storage** - Secure (OS keychain), env file, or memory backends
- 🧪 **Comprehensive test coverage** with unit and integration tests
- 📦 **Zero dependencies** (except Zod for validation)
- ⚡ **Built with Bun** for maximum performance

## Prerequisites

Before you can use this SDK, you need:

1. **Questrade Account** - Create one at [questrade.com](https://www.questrade.com)
2. **API Key** - Register your application at [apphub.questrade.com](https://apphub.questrade.com/UI/UserApps.aspx) to get your refresh token

## Installation

```bash
bun add kest-trade-sdk
```

## Quick Start

1. Generate a refresh token in the Questrade API Centre.
2. Store it once (see [First token](#first-token)):

```bash
bunx kest-trade-sdk login        # or: npx kest-trade-sdk login
```

3. Use the client. No token in code, no secrets in the project:

```typescript
import { QuestradeClient } from 'kest-trade-sdk'

const client = new QuestradeClient()
await client.initialize()

const accounts = await client.accounts.getAccounts()
const quotes = await client.market.getQuotes([8049]) // AAPL symbol ID
```

## Important: Token Rotation

**Questrade rotates refresh tokens on every use.** When you exchange a refresh token for an access token, you receive a new refresh token. The old one becomes invalid immediately.

The SDK handles this automatically:

- Reads the newest token from the configured `tokenStorage` (default: `'auto'`)
- Saves each rotated token back to that storage
- Calls your custom `onTokenRefresh` callback (if provided, for additional logic)

See [TOKEN_MANAGEMENT.md](./TOKEN_MANAGEMENT.md) for the storage backends and failure recovery.

## First token

Pick whichever fits your environment. They all end with the token in the default storage:

- **`kest-trade-sdk login`** (desktop): prompts for the token without echoing it and stores it.
- **`QUESTRADE_REFRESH_TOKEN`** (servers, Docker, CI): set it in the environment or a `.env`
  file (Bun loads `.env` automatically). It is a *seed*: used when storage is empty, or when
  the stored token is rejected. Leaving it set after it was consumed is harmless.
- **`refreshToken` in config**: same seed semantics, for tokens coming from your own code.

The CLI also reads the token from stdin (`echo "$TOKEN" | npx kest-trade-sdk login`) and has
`status` (where the token is stored, without printing it) and `logout`. Pass
`--storage auto|secure|file` to match a non-default `tokenStorage` in your application.

## Token storage

The default `'auto'` storage uses the OS keychain (macOS Keychain, Windows Credential
Manager, Linux Secret Service) when it is usable, and otherwise a user-only file (`0600`)
in the per-user config directory (`~/.config/kest-trade-sdk/` on Linux). The file is never
written to your project. When the file is chosen the SDK logs a `[WARN]`, and
`await client.resolveTokenStorageKind()` tells you which one is in use.

| `tokenStorage` | Where the token lives |
| --- | --- |
| `'auto'` (default) | OS keychain, else a user-only file in the config directory |
| `'secure'` | OS keychain only; fails loud if unusable |
| `'file'` | User-only file in the config directory (or `{ type: 'file', filePath }`) |
| `'memory'` | Process memory; lost on restart (a new token must then be generated) |
| your `ITokenStorage` | Anywhere, e.g. a secrets manager (recommended for production servers) |

On Node.js the keychain is reached through the optional dependency `@napi-rs/keyring`;
under Bun, through `Bun.secrets`.

## Client Configuration

```typescript
const client = new QuestradeClient({
  // Optional: where to keep the rotated token (default: 'auto')
  tokenStorage: 'secure',

  // Optional: additional custom logic after the SDK saves the token
  onTokenRefresh: async (token) => {
    await db.logTokenRotation(token.refresh_token)
  },

  // Optional: auto-refresh before expiry (default: true)
  autoRefresh: true,
  refreshBuffer: 60,
})
await client.initialize()
```

## Logging

The SDK is silent by default. Enable logging with a single config option:

```typescript
const client = new QuestradeClient({
  refreshToken: '...',
  logger: 'debug',  // 'debug' | 'info' | 'warn' | 'error' | 'none'
})
```

See [LOGGING.md](./LOGGING.md) for log levels, HTTP request/response details,
custom loggers (Datadog, CloudWatch), redaction, and dynamic configuration.

## Examples

For practical usage patterns, see the [examples/](./examples/) folder:

- [`basic-usage.ts`](./examples/basic-usage.ts) - Getting started with accounts and market data
- [`logging-example.ts`](./examples/logging-example.ts) - Advanced logging and debugging

## Development

```bash
# Install dependencies
bun install

# Run unit tests
bun run test:unit

# Run integration tests (requires a valid refresh token, see First token)
bun run test:integration

# Run all tests
bun test

# Lint and format
bun run lint:fix

# Build
bun run build
```

## Testing

The SDK includes comprehensive test coverage:

- **Unit tests**: Mock-based tests for all functionality
- **Integration tests**: Real API tests (require valid token)

To run integration tests, create a `.env` file:

```env
QUESTRADE_REFRESH_TOKEN=your_token_here
```

## Questrade API Reference documentation

- [Authorization](https://www.questrade.com/api/documentation/authorization)
- [Streaming](https://www.questrade.com/api/documentation/streaming)
- [Rate Limiting](https://www.questrade.com/api/documentation/rate-limiting)
- [Error Handling](https://www.questrade.com/api/documentation/error-handling)
- [Security](https://www.questrade.com/api/documentation/security)
- [Account calls](https://www.questrade.com/api/documentation/rest-operations/account-calls)
- [Market calls](https://www.questrade.com/api/documentation/rest-operations/market-calls)
- [Enumerations](https://www.questrade.com/api/documentation/rest-operations/enumerations)
- [Order calls](https://www.questrade.com/api/documentation/rest-operations/order-calls)

## TO-DO

- [x] Add authorization methods
- [x] Add account calls methods
- [x] Add market calls methods
- [x] Improve security practices for token storage
- [ ] Add [Streaming](https://www.questrade.com/api/documentation/streaming) API support
- [ ] Add [buy/sell order](https://www.questrade.com/api/documentation/rest-operations/order-calls) methods

## License

BSD licensed. See the LICENSE file for details.
