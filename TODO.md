# TODO — kest-trade-sdk

## Completed

- **Phase 1-9**: Project setup, type definitions (Zod schemas), HTTP client, auth module
  (refresh token exchange, auto-refresh), account operations (accounts, balances, positions,
  activities, executions, orders), market data (symbols, quotes, candles, options, markets),
  main SDK client, error hierarchy, documentation & examples
- **Phase 11**: Code review & security hardening — all Critical, Major, Minor, and Nitpick
  findings resolved (pluggable token storage, unified Logger, no emojis, file permissions,
  redaction, 224 tests passing)

## Remaining

### High Priority

- [ ] **Retry & timeout logic** — exponential backoff for 429/5xx, configurable timeout.
  Currently `HttpClient` throws on non-2xx with no retry. Production resilience gap.
- [ ] **Fix `tsconfig.json` / `tsconfig.build.json`** — these files contain `//` comments
  which are invalid JSON. LSP reports 65+ errors. Currently working only because
  TypeScript's bundler mode tolerates them, but `tsc --noEmit` may break in future TS versions.

### Medium Priority

- [ ] **Response caching layer** — cache symbol lookups and quotes to reduce API calls.
  Questrade rate limits are undocumented; caching mitigates risk.
- [ ] **WebSocket streaming** — real-time quotes and L2 market depth.
  Requires verifying Questrade's WebSocket API availability and protocol.
- [ ] **Authorization Code flow** — OAuth flow for web apps (server-side refresh token
  flow is implemented). Lower priority unless SDK targets browser-based use.

### Low Priority

- [ ] **Metrics/telemetry** — structured metrics emission (request count, latency,
  error rate). The `Logger` interface supports this but a dedicated metrics sink
  would be cleaner.
- [ ] **Publish to npm** — SDK is feature-complete for read operations. Needs
  `npm publish` setup, CI pipeline, versioning strategy.

### Not Started — Order Management (High Risk)

Real-money order placement. Requires careful design, safety checks, and a
practice account for testing. Do not implement without explicit user request.

- [ ] Zod schemas for order types (OrderRequest, OrderResponse, OrderType, OrderAction, TimeInForce)
- [ ] `OrdersClient` class — `placeOrder`, `replaceOrder`, `cancelOrder`
- [ ] Order validation — symbolId existence, price ranges, quantity limits, buying power
- [ ] Order preview/dry-run mode (default for safety)
- [ ] Multi-leg strategies (spreads, straddles)
- [ ] Documentation with risk warnings and disclaimers
- [ ] Examples with safety checks
