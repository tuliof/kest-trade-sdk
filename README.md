# Questrade Typescript SDK

A TypeScript SDK for the Questrade API, built with Bun.
Provides type-safe access to:

- **Accounts** - Get account information, balances, positions, activities, executions, and orders
- **Market Data** - Search symbols, get quotes, candles (OHLC), option chains, and market info

Refer to the [Questrade API documentation](https://www.questrade.com/api/documentation) for detailed endpoint information.

## Features

- ✅ **Full TypeScript support** with comprehensive type definitions
- 🔄 **Automatic token rotation** - Questrade refresh tokens are automatically updated
- 🔐 **Token persistence** - Save rotated tokens automatically via callbacks
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

```typescript
import { QuestradeClient } from 'kest-trade-sdk'

// Simple initialization - tokens are saved to .env automatically!
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
})

await client.initialize()

// Get accounts
const accounts = await client.accounts.getAccounts()
console.log(accounts)

// Get market quotes
const quotes = await client.market.getQuotes([8049]) // AAPL symbol ID
console.log(quotes)
```

## ⚠️ Important: Token Rotation

**Questrade rotates refresh tokens on every use.** When you exchange a refresh token for an access token, you receive a new refresh token. The old one becomes invalid immediately.

The SDK handles this automatically:

- Updates the internal token state
- Saves the new token to `.env` file (default)
- Calls your custom `onTokenRefresh` callback (if provided)

**Important:** You must persist the new refresh token, otherwise you'll need to manually generate a new one from the Questrade dashboard.

## Client Configuration

### Simple Usage (Recommended)

```typescript
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
})
await client.initialize()
```

### Advanced Configuration

```typescript
const client = new QuestradeClient({
  refreshToken: 'your_refresh_token',

  // Optional: Custom token persistence
  onTokenRefresh: async (token) => {
    await db.saveRefreshToken(token.refresh_token)
  },

  // Optional: Auto-refresh before expiry (default: true)
  autoRefresh: true,
  refreshBuffer: 60,
})
await client.initialize()
```

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

# Run integration tests (requires valid QUESTRADE_REFRESH_TOKEN in .env)
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
- [ ] Improve security practices for token storage
- [ ] Add [Streaming](https://www.questrade.com/api/documentation/streaming) API support
- [ ] Add [buy/sell order](https://www.questrade.com/api/documentation/rest-operations/order-calls) methods

## License

BSD licensed. See the LICENSE file for details.
