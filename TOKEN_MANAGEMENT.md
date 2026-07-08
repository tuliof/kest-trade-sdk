# Token Management in kest-trade-sdk

## Overview

This document explains how Questrade token rotation works and how the SDK
handles it automatically with pluggable token storage backends.

## How Questrade Token Rotation Works

### The Challenge

Questrade uses OAuth2 with **refresh token rotation** for security. This means:

1. When you exchange a refresh token for an access token, the API returns:
   - A new `access_token` (short-lived, typically 30 minutes)
   - A new `refresh_token` (for the next exchange)
   - An `api_server` URL (can change between tokens)

2. **The old refresh token becomes invalid immediately** after use

3. If you don't save the new refresh token, you'll need to manually generate
   a new one from the Questrade dashboard

### Example Token Flow

```
Initial State:
  refresh_token: ABC123

Step 1: Exchange refresh token
  POST https://login.questrade.com/oauth2/token
  Body: grant_type=refresh_token&refresh_token=ABC123

Step 2: Receive response
  {
    "access_token": "XYZ789",
    "refresh_token": "DEF456",  ← NEW TOKEN (save this!)
    "api_server": "https://api01.iq.questrade.com/",
    "expires_in": 1800
  }

Step 3: Old token ABC123 is now INVALID ❌
  Next time, must use DEF456 ✅
```

## SDK Implementation

### Pluggable Token Storage

The SDK manages token rotation automatically. Configure a storage backend
with the `tokenStorage` option:

```typescript
import { QuestradeClient, TokenStorageType } from 'kest-trade-sdk'

const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  tokenStorage: TokenStorageType.SECURE, // default: TokenStorageType.ENV
})

await client.initialize()
```

### Storage Backends

#### Secure Storage (recommended for production)

Uses OS-native credential storage via `Bun.secrets`:
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service API

```typescript
// String shorthand
tokenStorage: 'secure'

// Or with custom credential name
tokenStorage: { type: 'secure', name: 'my-app-refresh-token' }
```

**Subsequent runs**: Once a token is saved, you can initialize without
providing a `refreshToken` — the SDK loads it from secure storage
automatically:

```typescript
const client = new QuestradeClient({
  tokenStorage: 'secure',
})
await client.initialize() // Loads token from keychain
```

#### Env Storage (default, backward compatible)

Saves the refresh token to a `.env` file:

```typescript
// Default: writes QUESTRADE_REFRESH_TOKEN to .env
tokenStorage: 'env'

// Or with custom path and variable name
tokenStorage: { type: 'env', envPath: '.env.prod', varName: 'MY_TOKEN' }
```

#### Memory Storage (for testing)

Stores the token in memory only — not persistent across restarts:

```typescript
tokenStorage: 'memory'
```

### What Happens Internally

1. `initialize()` is called
2. If no `refreshToken` is in config, SDK loads it from `tokenStorage`
3. SDK exchanges the refresh token for an access token
4. SDK receives new tokens (old refresh token is now invalid)
5. SDK updates internal state:
   - Creates `HttpClient` with `access_token` and `api_server`
   - Saves the new `refresh_token` to `tokenStorage`
6. SDK calls `onTokenRefresh` callback (if provided) for additional custom logic
7. SDK schedules auto-refresh (if enabled)

### Storage Failure Recovery

If token storage fails **after** a successful token rotation, the SDK throws
a `TokenStorageError` carrying the new refresh token as a non-enumerable
property:

```typescript
import { QuestradeClient, TokenStorageError, TokenStorageType } from 'kest-trade-sdk'

try {
  await client.initialize()
} catch (error) {
  if (error instanceof TokenStorageError) {
    // The old token is already invalidated server-side.
    // Recover the new token before it's lost:
    console.error('Storage failed:', error.message)
    const newToken = error.refreshToken // non-enumerable, won't leak to logs
    await saveTokenManually(newToken)
  }
}
```

**Note**: The `HttpClient` is created **before** storage save, so the client
remains usable in-memory even if storage fails.

### onTokenRefresh Callback (optional)

The `onTokenRefresh` callback is for **additional custom logic** — it runs
*after* the SDK has already saved the token to the configured storage:

```typescript
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  tokenStorage: 'secure',
  onTokenRefresh: async (token) => {
    // SDK has already saved to secure storage.
    // Use this for: logging, metrics, database sync, notifications, etc.
    await db.logTokenRotation(token.refresh_token)
  },
})
```

## Automatic Refresh

The SDK can automatically refresh tokens before they expire:

```typescript
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  tokenStorage: 'secure',
  autoRefresh: true,      // Default: true
  refreshBuffer: 60,      // Refresh 60 seconds before expiry (default)
})
```

## Best Practices

### ✅ DO

- Use `TokenStorageType.SECURE` in production
- Use `TokenStorageType.ENV` for local development
- Use `TokenStorageType.MEMORY` for unit tests
- Handle `TokenStorageError` to recover tokens if storage fails
- Use a separate test account for integration tests

### ❌ DON'T

- Don't reuse old refresh tokens (they're invalidated immediately)
- Don't store tokens in plain text in production (use secure storage)
- Don't commit tokens to version control
- Don't run integration tests frequently (each run rotates the token)

## Troubleshooting

### Error: 400 Bad Request on token refresh

**Cause**: The refresh token has already been used and rotated.

**Solution**:
1. Go to Questrade dashboard: https://apphub.questrade.com/UI/UserApps.aspx
2. Generate a new refresh token
3. Update your `tokenStorage` with the new token (or provide it as `refreshToken`)

### Error: "Cannot refresh token: no refresh token available"

**Cause**: No `refreshToken` was provided and `tokenStorage` has no saved token.

**Solution**: Provide a `refreshToken` on first run, or ensure `tokenStorage`
has a previously saved token.

### Error: TokenStorageError

**Cause**: Token storage backend failed (e.g., keychain locked, .env not writable).

**Solution**: Recover the new token from `error.refreshToken` and save it
manually. The client is still usable in-memory.

### Error: "Bun.secrets is not available"

**Cause**: Running in an environment where `Bun.secrets` is not supported.

**Solution**: Use `TokenStorageType.ENV` or `TokenStorageType.MEMORY` instead,
or provide a custom `ITokenStorage` implementation.

## Testing with Token Rotation

### Unit Tests

Unit tests mock the token responses and don't use real tokens:

```bash
bun run test:unit
```

Use `TokenStorageType.MEMORY` in test setup to avoid clobbering real `.env` files.

### Integration Tests

Integration tests use real tokens and will rotate them:

```bash
# ⚠️ Warning: This will consume and rotate your refresh token!
bun run test:integration
```

**Recommendation**:
- Use a separate test account for integration tests
- Run integration tests sparingly
- Use `TokenStorageType.SECURE` so rotated tokens are saved automatically

## Example: Complete Implementation

```typescript
import { QuestradeClient, TokenStorageError, TokenStorageType } from 'kest-trade-sdk'

async function main() {
  // First run: provide refreshToken, SDK saves to secure storage
  // Subsequent runs: SDK loads from secure storage automatically
  const client = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN, // undefined on subsequent runs
    tokenStorage: TokenStorageType.SECURE,
    autoRefresh: true,
    onTokenRefresh: async () => {
      // SDK already saved the token. This is for additional logic only.
      console.log('Token rotated at:', new Date().toISOString())
    },
  })

  try {
    await client.initialize()

    // Use the client normally
    const accounts = await client.accounts.getAccounts()
    console.log('Accounts:', accounts.accounts.length)
  } catch (error) {
    if (error instanceof TokenStorageError) {
      // Recover the new token manually
      await saveTokenManually(error.refreshToken)
    }
    throw error
  } finally {
    client.dispose()
  }
}

main().catch(console.error)
```

## Additional Resources

- [Questrade API Authorization](https://www.questrade.com/api/documentation/authorization)
- [OAuth 2.0 Token Rotation](https://oauth.net/2/token-rotation/)
- [SDK Client Documentation](./src/client.ts)
- [Token Storage API](./src/auth/token-storage.ts)
