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

The SDK manages token rotation automatically. With no configuration it uses the
`'auto'` storage:

```typescript
import { QuestradeClient } from 'kest-trade-sdk'

const client = new QuestradeClient()
await client.initialize()
```

### Where the first token comes from

Questrade refresh tokens are single-use, so the token in storage is always the newest.
`initialize()` resolves the token in this order:

1. The token in `tokenStorage`.
2. The seed: `refreshToken` from config, or the `QUESTRADE_REFRESH_TOKEN` environment
   variable. Used when storage is empty, or when the stored token is rejected (for example
   after generating a new token in the Questrade API Centre).

A seed that was already consumed simply fails, so it is safe to leave it configured.
Errors other than a rejected token (network, timeout) do not fall through to the seed.

To store the first token without putting it in code, a file or shell history, run:

```bash
bunx kest-trade-sdk login        # or: npx kest-trade-sdk login
```

### Storage Backends

#### Auto (default)

Uses the OS keychain when a real probe (write, read back, delete a sentinel entry)
succeeds. Otherwise it uses a user-only file in the per-user config directory:

- Linux: `$XDG_CONFIG_HOME/kest-trade-sdk/refresh-token` (default `~/.config`)
- macOS: `~/Library/Application Support/kest-trade-sdk/refresh-token`
- Windows: `%APPDATA%\kest-trade-sdk\refresh-token`

The directory is created with mode `0700` and the file with `0600`, written atomically.
This is the same model as the `gh`, `aws` and `gcloud` CLIs. Headless servers, Docker and
CI usually have no Linux Secret Service, so they resolve to the file. The choice is logged
at `[WARN]` and observable:

```typescript
await client.resolveTokenStorageKind() // 'secure' | 'file'
```

```typescript
tokenStorage: { type: 'auto', service: 'kest-trade-sdk-paper', filePath: '/run/secrets/qt' }
```

#### Secure (OS keychain only)

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service API (needs libsecret and a running, unlocked keyring)

Under Bun it uses `Bun.secrets`; under Node.js the optional dependency
`@napi-rs/keyring`. Unlike `'auto'`, it throws when the keychain is unusable.

```typescript
tokenStorage: 'secure'
tokenStorage: { type: 'secure', name: 'my-app-refresh-token', service: 'my-app' }
```

#### File

```typescript
tokenStorage: 'file'
tokenStorage: { type: 'file', filePath: '/var/lib/my-bot/questrade-token' }
```

#### Env

Writes the token in plaintext to a `.env` file in the project directory:

```typescript
tokenStorage: 'env'
tokenStorage: { type: 'env', envPath: '.env.prod', varName: 'MY_TOKEN' }
```

#### Memory (for testing)

Stores the token in memory only. Because Questrade rotates the token on every refresh,
the token is lost when the process exits and a new one must be generated in the
Questrade API Centre. Use `onTokenRefresh` or a persistent storage outside tests.

```typescript
tokenStorage: 'memory'
```

#### Custom storage

Pass any object implementing `ITokenStorage`. This is the recommended setup for
production servers, backed by a secrets manager:

```typescript
import { SecretsManager } from '@aws-sdk/client-secrets-manager'

const secrets = new SecretsManager({})
const SecretId = 'questrade/refresh-token'

const client = new QuestradeClient({
  tokenStorage: {
    async get() {
      const { SecretString } = await secrets.getSecretValue({ SecretId })
      return SecretString || null
    },
    async set(token) {
      await secrets.putSecretValue({ SecretId, SecretString: token })
    },
    async delete() {
      await secrets.putSecretValue({ SecretId, SecretString: '' })
    },
  },
})
```

### What Happens Internally

1. `initialize()` reads the stored token, then falls back to the seed if needed
2. SDK exchanges the refresh token for an access token
3. SDK receives new tokens (old refresh token is now invalid)
4. SDK updates its single `HttpClient` with `access_token` and `api_server`
5. SDK saves the new `refresh_token` to `tokenStorage`
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

**Note**: The `HttpClient` is updated **before** storage save, so the client
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

### Do

- Keep the default `'auto'` storage on desktops, or `'secure'` to require the keychain
- Use a secrets manager through a custom `ITokenStorage` on production servers
- Use `'memory'` for unit tests
- Handle `TokenStorageError` to recover tokens if storage fails
- Use a separate test account for integration tests

### Don't

- Don't reuse old refresh tokens (they're invalidated immediately)
- Don't store tokens in plaintext inside the project (`'env'`) in production
- Don't commit tokens to version control
- Don't run integration tests frequently (each run rotates the token)

## Troubleshooting

### AuthenticationError: "Questrade rejected the refresh token from ..."

**Cause**: The stored token and the seed (if any) were both rejected. They were already
used, expired, or revoked. The token endpoint reports this as `400 Bad Request`.

**Solution**:
1. Go to Questrade dashboard: https://apphub.questrade.com/UI/UserApps.aspx
2. Generate a new refresh token
3. Run `kest-trade-sdk login`, or set `QUESTRADE_REFRESH_TOKEN` to the new token

### Error: "No refresh token available"

**Cause**: Storage is empty and no seed was provided.

**Solution**: Run `kest-trade-sdk login` or set `QUESTRADE_REFRESH_TOKEN`.

### Error: TokenStorageError

**Cause**: Token storage backend failed (e.g., keychain locked, file not writable).

**Solution**: Recover the new token from `error.refreshToken` and save it
manually. The client is still usable in-memory.

### [WARN] "OS keychain unusable, storing the refresh token in a user-only file"

**Cause**: The `'auto'` storage could not use the keychain (no Secret Service on Linux,
or `@napi-rs/keyring` not installed on Node.js). The `reason` field says which.

**Solution**: Nothing, if a user-only file is acceptable. Otherwise install the missing
piece, or configure `'secure'` (fail loud) or a custom `ITokenStorage`.

## Testing with Token Rotation

### Unit Tests

Unit tests mock the token responses and don't use real tokens:

```bash
bun run test:unit
```

Use `TokenStorageType.MEMORY` in test setup so tests never touch a real token.

### Integration Tests

Integration tests use real tokens and will rotate them:

```bash
# Warning: this consumes and rotates your refresh token
bun run test:integration
```

**Recommendation**:
- Use a separate test account for integration tests
- Run integration tests sparingly
- Keep the default storage so rotated tokens are saved automatically

## Example: Complete Implementation

```typescript
import { QuestradeClient, TokenStorageError } from 'kest-trade-sdk'

async function main() {
  // First token: `kest-trade-sdk login` or QUESTRADE_REFRESH_TOKEN.
  // Every later run reads the rotated token from the default storage.
  const client = new QuestradeClient({
    onTokenRefresh: async () => {
      // SDK already saved the token. This is for additional logic only.
      console.log('Token rotated at:', new Date().toISOString())
    },
  })

  try {
    await client.initialize()

    const accounts = await client.accounts.getAccounts()
    console.log('Accounts:', accounts.accounts.length)
  } catch (error) {
    if (error instanceof TokenStorageError) {
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
