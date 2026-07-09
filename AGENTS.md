# AGENTS.md

Guidance for AI agents (and humans) working on this codebase.

## Build & Verify Commands

```bash
bun run check        # tsc --noEmit && biome check . && license:check
bun run test:unit    # unit tests
bun run lint:fix     # auto-fix formatting + lint + license headers
```

## The 5 Laws of Elegant Defense

All code in this repository must adhere to these five laws. They are not
suggestions — they are the philosophical backbone of the codebase. Violations
should be treated as defects and fixed before merge.

### 1. Law of the Early Exit (Guard Clauses)

Handle edge cases and invalid states at the top of a function. Return early.
Do not nest the happy path inside `if` blocks.

```typescript
// BAD
function process(user?: User) {
  if (user) {
    if (user.active) {
      // deeply nested happy path
    }
  }
}

// GOOD
function process(user?: User) {
  if (!user) return
  if (!user.active) return
  // flat, readable happy path
}
```

### 2. Make Illegal States Unrepresentable (Parse, Don't Validate)

Parse inputs at the boundary into trusted, typed state. After the boundary,
the type system should make invalid states impossible to express. Do not pass
raw, unvalidated data through the system and check it at every layer.

```typescript
// BAD
function createClient(config: any) {
  if (config.type === 'secure') { /* ... */ }
  if (config.type === 'env') { /* ... */ }
  // runtime checks scattered everywhere
}

// GOOD
type StorageConfig = SecureConfig | EnvConfig | MemoryConfig
function createClient(config: StorageConfig) {
  // types already exclude invalid states
}
```

### 3. Law of Atomic Predictability

Functions should be pure where possible. Same input → same output. Avoid
hidden mutations of global or external state. Functions that return `void`
should not silently mutate — if they change state, that should be visible and
unsurprising.

### 4. Law of Fail Fast, Fail Loud

Invalid state must halt immediately with a descriptive error. Never patch bad
data and continue. Never leave the system in a half-broken state. If an
operation fails, the error message should explain what happened and what the
caller should do.

```typescript
// BAD
function createStorage(type: string): ITokenStorage {
  if (type === 'secure') return new SecureStorage()
  return new EnvStorage() // silent fallback — masks misconfiguration
}

// GOOD
function createStorage(type: StorageType): ITokenStorage {
  switch (type) {
    case 'secure': return new SecureStorage()
    case 'env': return new EnvStorage()
    case 'memory': return new MemoryStorage()
    default: throw new Error(`Unknown storage type: ${type}`)
  }
}
```

### 5. Law of Intentional Naming

Names should be so clear that the logic reads like an English sentence. A
reader should understand what a function does from its name alone, without
reading the body. Avoid vague names like `process`, `handle`, `check`.

```typescript
// BAD
function check(user: User): boolean { /* ... */ }

// GOOD
function isUserEligible(user: User): boolean { /* ... */ }
```

## Adherence Checklist

Before submitting code for review, verify:

- [ ] **Guard Clauses** — Are edge cases handled with early returns at the top?
- [ ] **Parsed State** — Are inputs parsed/validated at the boundary into typed state?
- [ ] **Purity** — Are functions pure where possible? No hidden mutations?
- [ ] **Fail Loud** — Do invalid inputs throw descriptive errors? No silent fallbacks?
- [ ] **Readability** — Does the logic read like English when you scan function names?

## Code Style

- **Language**: TypeScript, built with Bun
- **Linter/Formatter**: Biome (`bun run lint:fix` to auto-fix)
- **License header**: SPDX BSD-3-Clause on all source files (auto-managed by `license:check`)
- **No comments** unless explaining *why* (not *what*). The code should explain *what*.
- **Commits**: Atomic, focused on a single concern. Conventional commits format (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).

## No-Emoji Policy

This SDK handles financial data. Emojis are casual and unprofessional — they
must not appear in source code, log output, test output, or documentation.
Use structured messages with log levels (`[INFO]`, `[WARN]`, `[ERROR]`) instead.

## Logging Pattern

All SDK components use a single `Logger` interface (`src/logger.ts`):

- **`Logger` interface**: `debug`/`info`/`warn`/`error` with structured `LogContext`
- **`SilentLogger`**: default (no-op) — SDK is silent unless configured
- **`ConsoleLogger`**: level-based console output with `[LEVEL] message {context}` format
- **`createLogger(level)`:** factory accepting `LogLevel` string

`QuestradeClient` accepts `logger: Logger | LogLevel` and flows the same
instance to `HttpClient` and token storage. HTTP-specific formatting
(selective headers/body, redaction) is handled by utility functions in
`src/http/logger.ts` before calling the `Logger`. No `HttpLogger` class —
formatting is a utility concern, not a logger concern.
