# Logging

The SDK uses a unified `Logger` interface for all operations — HTTP requests,
token storage, and error reporting. Logs are **silent by default**.

## Quick Start

```typescript
import { QuestradeClient } from 'kest-trade-sdk'

const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  logger: 'debug',
})
```

That's it. You'll see HTTP requests, responses, and token storage events in the console.

## Log Levels

| Level    | What you see                                                        |
| -------- | ------------------------------------------------------------------- |
| `debug`  | HTTP requests + responses, token storage operations                 |
| `info`   | HTTP responses (2xx), token stored/loaded/deleted                   |
| `warn`   | 3xx/4xx responses, storage warnings (e.g., Bun.secrets unavailable) |
| `error`  | 5xx responses, storage failures, auto-refresh failures              |
| `none`   | Silent (default)                                                    |

```typescript
// Production: errors only
const client = new QuestradeClient({ refreshToken: '...', logger: 'error' })

// Development: see everything
const client = new QuestradeClient({ refreshToken: '...', logger: 'debug' })
```

Output format: `[LEVEL] Message {"key":"value"}`

```
[DEBUG] HTTP Request {"method":"GET","url":"https://api01.iq.questrade.com/v1/accounts"}
[INFO] HTTP Response {"method":"GET","url":"https://api01.iq.questrade.com/v1/accounts","responseStatus":200,"duration":145}
[INFO] Token stored in OS keychain
```

## HTTP Request/Response Details

By default, `debug` shows `method`, `url`, `status`, and `duration` — but **not**
headers or bodies. To include them, use `httpLogOptions`:

```typescript
const client = new QuestradeClient({
  refreshToken: '...',
  logger: 'debug',
  httpLogOptions: {
    logRequestHeaders: true,   // Authorization header (redacted)
    logRequestBody: true,      // POST body (tokens redacted)
    logResponseHeaders: true,  // Content-Type, etc.
    logResponseBody: true,     // JSON response body (tokens redacted)
  },
})
```

### Redaction

Sensitive data is automatically redacted before logging:

- `Authorization: Bearer abc123...` → `Bearer [REDACTED]...c123`
- `access_token` in request/response body → `[REDACTED]...c123`
- `refresh_token` in request/response body → `[REDACTED]...oken`

To customize redaction, provide a `redactFn`:

```typescript
const client = new QuestradeClient({
  refreshToken: '...',
  logger: 'debug',
  httpLogOptions: {
    logResponseBody: true,
    redactFn: (entry) => {
      // Hide account numbers in URLs
      entry.url = entry.url?.replace(/accounts\/\d+/g, 'accounts/[REDACTED]')
      return entry
    },
  },
})
```

## Custom Loggers

For log aggregation (Datadog, CloudWatch, etc.), implement the `Logger` interface:

```typescript
import { type Logger, QuestradeClient } from 'kest-trade-sdk'

const datadogLogger: Logger = {
  debug(message, context) { /* send to Datadog */ },
  info(message, context)  { /* send to Datadog */ },
  warn(message, context)  { /* send to Datadog */ },
  error(message, context) { /* send to Datadog */ },
}

const client = new QuestradeClient({
  refreshToken: '...',
  logger: datadogLogger,
  httpLogOptions: { logResponseBody: true },
})
```

The `context` parameter is a structured object (not a string) — safe for JSON
serialization. Tokens are redacted before reaching your logger.

## Dynamic Configuration

Change the logger at runtime:

```typescript
import { ConsoleLogger } from 'kest-trade-sdk'

const client = new QuestradeClient({
  refreshToken: '...',
  logger: 'none',  // Start silent
})

await client.initialize()

// Enable debugging on demand
client.setLogger(new ConsoleLogger('debug'))

// Disable again
client.setLogger(new ConsoleLogger('none'))
```

## What Gets Logged

| Component         | Events                                                       |
| ----------------- | ------------------------------------------------------------ |
| HttpClient        | Request sent, response received, network error               |
| Token storage     | Token stored, loaded, deleted, storage failure               |
| QuestradeClient   | Auto-refresh failure                                         |
| TokenStorageError | Carries refresh token as non-enumerable `error.refreshToken`  |

## Defaults Summary

| Setting                  | Default     | Why                                             |
| ------------------------ | ----------- | ------------------------------------------------ |
| Logger                   | Silent      | SDKs should not produce output unless asked      |
| HTTP headers in logs     | Off         | Security — avoid leaking auth headers            |
| HTTP body in logs        | Off         | Security — avoid leaking tokens in request body  |
| Redaction                | On          | Can't accidentally log `access_token`/`refresh_token` |
| `httpLogOptions`         | `{}`        | No headers/body unless explicitly requested      |
