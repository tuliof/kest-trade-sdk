# TODO - Questrade TypeScript SDK Implementation Plan

## Phase 1: Project Setup & Core Infrastructure ✓

- [x] Project initialized with Bun + TypeScript
- [x] Basic dependencies (zod for validation)
- [x] Add testing dependencies (@types/bun includes test types)
- [x] Create project structure with src/ and test/ directories

## Phase 2: Type Definitions & Schemas (TDD) ✓

- [x] **Test**: Write tests for OAuth token response validation
- [x] **Implement**: Create Zod schemas for OAuth token response
  - `TokenResponse`: access_token, refresh_token, api_server, expires_in, token_type
- [x] **Test**: Write tests for Account types
- [x] **Implement**: Create Zod schemas for Account types
  - `Account`: type, number, status, isPrimary, isBilling, clientAccountType
  - `AccountsResponse`: accounts array, userId
- [x] **Test**: Write tests for Balance types
- [x] **Implement**: Create Zod schemas for Balance types
  - `Balance`: currency, cash, marketValue, totalEquity, buyingPower, maintenanceExcess, isRealTime
  - `BalancesResponse`: perCurrencyBalances, combinedBalances, sodPerCurrencyBalances, sodCombinedBalances
- [x] **Test**: Write tests for Activity types
- [x] **Implement**: Create Zod schemas for Activity types
  - `Activity`: tradeDate, transactionDate, settlementDate, action, symbol, etc.
- [x] **Test**: Write tests for Market data types
- [x] **Implement**: Create Zod schemas for Market types
  - `Candle`: start, end, open, high, low, close, volume
  - `CandlesResponse`: candles array
- [x] **Test**: Write tests for Error handling types
- [x] **Implement**: Create Zod schemas for API errors
  - `APIError`: code, message

## Phase 3: HTTP Client Layer (TDD) ✓

- [x] **Test**: Write tests for base HTTP client
  - Test request headers (Authorization, Accept)
  - Test base URL handling
  - Test error response handling
- [x] **Implement**: Create `HttpClient` class
  - Use Bun's native `fetch` API
  - Handle Bearer token authentication
  - Parse JSON responses
  - Transform fetch errors to custom error types
- [x] **Test**: Write tests for rate limiting detection
- [x] **Implement**: Add rate limiting awareness
  - Detect 429 responses
  - Extract rate limit headers
  - Provide retry information

## Phase 4: Authentication Module (TDD) ✓

- [x] **Test**: Write tests for refresh token exchange
  - Mock successful token refresh
  - Test token expiration handling
  - Test error responses (invalid token, etc.)
- [x] **Implement**: Create `AuthClient` class
  - `refreshToken(refreshToken: string): Promise<TokenResponse>`
  - Handle POST to <https://login.questrade.com/oauth2/token>
- [x] **Test**: Write tests for automatic token refresh
- [x] **Implement**: Token refresh strategy
  - Detect token expiration
  - Auto-refresh before expiry
  - Store new tokens
- [ ] **Test**: Write tests for Authorization Code flow (optional)
- [ ] **Implement**: Authorization Code flow helpers (optional)

## Phase 5: Account Operations (TDD) ✓

- [x] **Test**: Write tests for getting accounts
  - Mock successful accounts response
  - Test empty accounts
  - Test error handling
- [x] **Implement**: Create `AccountsClient` class
  - `getAccounts(): Promise<AccountsResponse>`
- [x] **Test**: Write tests for getting account balances
  - Mock successful balances response
  - Test multiple currencies
  - Test real-time vs SOD balances
- [x] **Implement**: Add balance methods
  - `getBalances(accountId: string): Promise<BalancesResponse>`
- [x] **Test**: Write integration tests for accounts and balances
- [x] **Test**: Write tests for getting account positions
- [x] **Implement**: Add positions methods
  - `getPositions(accountId: string): Promise<PositionsResponse>`
- [x] **Test**: Write tests for getting account activities
- [x] **Implement**: Add activities methods
  - `getActivities(accountId: string, startTime: Date, endTime: Date): Promise<ActivitiesResponse>`
  - Validate date range (max 31 days)
- [x] **Test**: Write tests for getting account executions
- [x] **Implement**: Add executions methods
  - `getExecutions(accountId: string, startTime: Date, endTime: Date): Promise<ExecutionsResponse>`
- [x] **Test**: Write tests for getting account orders
- [x] **Implement**: Add orders methods
  - `getOrders(accountId: string, startTime: Date, endTime: Date, stateFilter?: string): Promise<OrdersResponse>`

## Phase 6: Market Data Operations (TDD) ✓

- [x] **Test**: Write tests for market data types (symbols, quotes, candles, options, markets)
- [x] **Implement**: Create Zod schemas for market data types
- [x] **Test**: Write tests for getting symbol info
- [x] **Implement**: Create `MarketClient` class
  - `getSymbols(ids?: number[], names?: string[]): Promise<SymbolsResponse>`
- [x] **Test**: Write tests for searching symbols
- [x] **Implement**: Add search methods
  - `searchSymbols(prefix: string, offset?: number): Promise<SymbolSearchResponse>`
- [x] **Test**: Write tests for getting quotes
- [x] **Implement**: Add quotes methods
  - `getQuotes(ids: number[]): Promise<QuotesResponse>`
- [x] **Test**: Write tests for getting options chain
- [x] **Implement**: Add options methods
  - `getOptionChain(symbolId: number): Promise<OptionChainResponse>`
- [x] **Test**: Write tests for getting candles/OHLC data
- [x] **Implement**: Add candles methods
  - `getCandles(symbolId: number, startTime: Date, endTime: Date, interval: CandleInterval): Promise<CandlesResponse>`
  - Validate max 2000 candles per request
- [x] **Test**: Write tests for getting markets list
- [x] **Implement**: Add markets methods
  - `getMarkets(): Promise<MarketsResponse>`
- [x] **Test**: Write integration tests for market data
- [x] **Implement**: Integration test suite for real API calls

## Phase 7: Main SDK Client (TDD) ✓

- [x] **Test**: Write tests for SDK initialization
  - Test with refresh token
  - Test with existing access token + api_server
- [x] **Implement**: Create main `QuestradeClient` class
  - Constructor with refresh token
  - Lazy initialization of sub-clients
  - Expose: auth, accounts, market modules
- [x] **Test**: Write tests for automatic token management
- [x] **Implement**: Token lifecycle management
  - Auto-refresh tokens before expiry
  - Event emitters for token refresh (onTokenRefresh callback)
  - Pluggable token storage (secure/env/memory) with TokenStorageError recovery

## Phase 8: Error Handling & Resilience (TDD) ✓

- [x] **Test**: Write tests for custom error classes
- [x] **Implement**: Create error hierarchy
  - `QuestradeError` (base)
  - `AuthenticationError`
  - `RateLimitError`
  - `ValidationError`
  - `NetworkError`
- [ ] **Test**: Write tests for retry logic (optional - not implemented)
- [ ] **Implement**: Add retry mechanism (optional - not implemented)
  - Exponential backoff
  - Configurable retry attempts
  - Handle rate limit responses
- [ ] **Test**: Write tests for timeout handling (optional - not implemented)
- [ ] **Implement**: Add request timeout configuration (optional - not implemented)

## Phase 9: Documentation & Examples ✓

- [x] Create comprehensive README
  - Installation instructions
  - Quick start guide
  - Authentication examples
  - API usage examples
- [x] Add JSDoc comments to all public APIs
- [x] Create examples directory
  - `basic-usage.ts` (covers authentication, accounts, balances, market data)
  - `logging-example.ts` (covers Logger interface, custom loggers, redaction)
- [x] Create TOKEN_MANAGEMENT.md (token rotation, storage backends, failure recovery)
- [x] Create AGENTS.md (5 Laws of Elegant Defense, no-emoji policy, logging pattern)
- [ ] Add TypeScript declaration generation to build (not needed - direct TS usage)

## Phase 10: Advanced Features (Optional)

- [ ] **Test**: Write tests for WebSocket streaming
- [ ] **Implement**: Streaming client for real-time data
  - Level 1 quotes streaming
  - Level 2 market depth streaming
- [ ] Add response caching layer
- [x] **Implemented**: Unified logging system
  - `Logger` interface with `debug`/`info`/`warn`/`error` + structured `LogContext`
  - `ConsoleLogger` (level-based, silent by default) and `SilentLogger` (no-op)
  - `createLogger(level)` factory accepting `LogLevel` string
  - Flows from `QuestradeClient` to `HttpClient` and token storage
  - HTTP formatting utilities: `formatRequestEntry`, `formatResponseEntry`, `formatErrorEntry`
  - Redaction utilities: `redactToken`, `defaultRedactFn` (Authorization, access_token, refresh_token)
  - `HttpLogOptions` for HTTP-specific formatting (selective headers/body)
  - `setLogger()` for dynamic logger replacement
  - No emojis in any log output (financial SDK policy)
  - Example: `examples/logging-example.ts`
  - Comprehensive test coverage (22 logger tests + 30 formatting/redaction tests)
- [ ] Add metrics/telemetry

## Phase 11: Code Review & Security Hardening ✓

- [x] Full code review performed (4 layers: Correctness, Security, Performance, Style)
- [x] **Critical fix**: `TokenStorageConfig` type union corrected (compile-blocking)
- [x] **Major fixes**:
  - Constructor allows storage-only initialization (secure storage on subsequent runs)
  - `TokenStorageError` with non-enumerable `refreshToken` for safe recovery
  - `httpClient` created before storage save (client usable on storage failure)
  - No secret leakage in logs (replaced `console.warn` with raw token)
  - Portable `fs/promises.unlink` instead of `Bun.spawn(['rm'])`
  - Rewrote `TOKEN_MANAGEMENT.md` for pluggable storage API
- [x] **Minor fixes**:
  - Dead code removed, consistent type field declarations
  - Fail loud on unknown storage type (no silent fallback)
  - Escape regex metacharacters in `varName`
  - `.env` file permissions restricted to `0o600`
  - `SecureTokenStorage.delete` limitation documented with TODO
  - 35+ unit tests for token storage (MemoryTokenStorage, EnvTokenStorage, SecureTokenStorage, createTokenStorage, TokenStorageError)
  - `initialize()` restructured with guard clauses
  - README updated for pluggable token storage
- [x] **Nitpick fixes**:
  - Simplified `Awaited<ReturnType<...>>` to `ITokenStorage`
  - Eliminated `HttpLogger` class, replaced with unified `Logger` interface
  - No emojis anywhere in source/logs/tests (financial SDK policy)
  - `SecureTokenStorage.get()` logs errors via `Logger` instead of swallowing
  - Configurable `service` name in `SecureTokenStorage` for keychain isolation

## Phase 12: Order Management (Optional - High Risk Feature)

**Warning**: Order placement involves real money and carries significant financial risk. Implement with extreme caution.

### Prerequisites

- Practice/sandbox account for testing
- Comprehensive validation and safety checks
- Clear user documentation and warnings
- Legal disclaimers

### Implementation Tasks

- [ ] **Test**: Write tests for order type schemas
- [ ] **Implement**: Create Zod schemas for order types
  - `OrderRequest`: symbolId, quantity, orderType, action, timeInForce, prices, etc.
  - `OrderResponse`: orderId, order details, state, execution info
  - `OrderStateFilter`: All, Open, Closed enums
  - `OrderType`: Market, Limit, Stop, StopLimit, TrailStop, etc.
  - `OrderAction`: Buy, Sell, Short, Cover, BTO, STC, STO, BTC
  - `TimeInForce`: Day, GoodTillCanceled, GoodTillDate, etc.
- [ ] **Test**: Write tests for order placement
- [ ] **Implement**: Create `OrdersClient` class
  - `placeOrder(accountId: string, order: OrderRequest): Promise<OrderResponse>`
  - `replaceOrder(accountId: string, orderId: number, order: OrderRequest): Promise<OrderResponse>`
  - `cancelOrder(accountId: string, orderId: number): Promise<void>`
- [ ] **Test**: Write tests for order validation
- [ ] **Implement**: Order validation and safety checks
  - Validate symbolId exists
  - Validate price ranges (min tick size)
  - Validate quantity (min/max lot sizes)
  - Validate account has sufficient buying power
  - Add dry-run/preview mode
  - Add order confirmation step
- [ ] **Test**: Write tests for multi-leg strategies
- [ ] **Implement**: Advanced order types
  - Bracket orders (entry + profit + stop loss)
  - Multi-leg strategies (spreads, straddles, etc.)
  - Iceberg orders
  - Anonymous orders
- [ ] **Documentation**: Create comprehensive order management guide
  - Risk warnings and disclaimers
  - Order type explanations
  - Examples with safety checks
  - Best practices for production use
- [ ] **Examples**: Create order placement examples
  - `examples/place-market-order.ts`
  - `examples/place-limit-order.ts`
  - `examples/place-stop-loss.ts`
  - `examples/order-preview-dry-run.ts`

### Safety Considerations

- All order operations should log warnings via Logger
- Consider requiring explicit confirmation flag (e.g., `{ confirm: true }`)
- Add rate limiting to prevent accidental rapid-fire orders
- Implement order preview/dry-run mode by default
- Add prominent warnings in documentation
- Consider adding a "paper trading" mode for testing

## Project Structure

```
kest-trade-sdk/
├── src/
│   ├── index.ts                 # Main exports
│   ├── client.ts                # Main QuestradeClient class
│   ├── logger.ts                # Unified Logger interface + ConsoleLogger/SilentLogger
│   ├── auth/
│   │   ├── auth-client.ts       # Authentication operations
│   │   └── token-storage.ts     # Pluggable token storage (secure/env/memory)
│   ├── accounts/
│   │   └── accounts-client.ts   # Account operations
│   ├── market/
│   │   └── market-client.ts     # Market data operations
│   ├── http/
│   │   ├── http-client.ts       # Base HTTP client (uses Logger directly)
│   │   └── logger.ts            # HTTP log formatting helpers + redaction utils
│   ├── types/
│   │   ├── auth.ts              # Auth types & schemas
│   │   ├── accounts.ts          # Account types & schemas
│   │   ├── market.ts            # Market types & schemas
│   │   ├── common.ts            # Shared types
│   │   └── errors.ts            # Error types
│   └── utils/
│       ├── validation.ts        # Zod validation helpers
│       └── date-utils.ts        # Date formatting utilities
├── test/
│   ├── logger.test.ts           # Logger interface tests
│   ├── client.test.ts           # Client unit tests
│   ├── client.integration.test.ts # Client integration tests
│   ├── auth/
│   │   ├── auth-client.test.ts
│   │   ├── auth-client.integration.test.ts
│   │   └── token-storage.test.ts # Token storage unit tests
│   ├── accounts/
│   │   └── accounts-client.test.ts
│   ├── market/
│   │   └── market-client.test.ts
│   ├── http/
│   │   ├── http-client.test.ts
│   │   └── logger.test.ts       # HTTP formatting/redaction tests
│   └── types/
│       └── *.test.ts            # Type validation tests
├── examples/
│   ├── basic-usage.ts
│   └── logging-example.ts
├── AGENTS.md                    # 5 Laws of Elegant Defense, no-emoji policy, logging pattern
├── TOKEN_MANAGEMENT.md          # Token rotation, storage backends, failure recovery
├── TODO.md                      # This file
└── package.json
```

## Testing Strategy

- Use Bun's built-in test runner (`bun test`)
- Follow TDD: Write test first, then implementation
- Use `describe` blocks to group related tests
- Mock HTTP requests using Bun's mocking capabilities
- Include integration tests with real API (using test account)
- Use `MemoryTokenStorage` in unit tests to avoid clobbering real `.env`
- Aim for >80% code coverage
- Test error paths extensively

## Notes

- All dates in ISO 8601 format with timezone
- Rate limit: Be aware of API rate limits (documented in API docs)
- Token expiry: Access tokens expire in 1800 seconds (30 min)
- Max data ranges: Activities limited to 31 days, Candles limited to 2000
- Currency types: CAD, USD (enum)
- Account types: TFSA, RRSP, RESP, etc. (enum)
- No emojis in source code, logs, tests, or documentation (financial SDK policy)
- All logging flows through unified `Logger` interface (`src/logger.ts`)
