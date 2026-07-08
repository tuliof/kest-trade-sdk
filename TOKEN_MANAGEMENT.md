# Token Management in Questrade SDK

## Overview

This document explains how Questrade token rotation works and how the SDK handles it automatically.

## How Questrade Token Rotation Works

### The Challenge

Questrade uses OAuth2 with **refresh token rotation** for security. This means:

1. When you exchange a refresh token for an access token, the API returns:
   - A new `access_token` (short-lived, typically 30 minutes)
   - A new `refresh_token` (for the next exchange)
   - An `api_server` URL (can change between tokens)

2. **The old refresh token becomes invalid immediately** after use

3. If you don't save the new refresh token, you'll need to manually generate a new one from the Questrade dashboard

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

### Automatic Token Management

The `QuestradeClient` handles token rotation automatically:

```typescript
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  onTokenRefresh: async (token) => {
    // SDK calls this whenever a token is refreshed
    // Save the new token here!
    console.log('New refresh token:', token.refresh_token)
  }
})

await client.initialize() // Internally calls refreshAccessToken()
```

### What Happens Internally

1. `initialize()` is called
2. SDK exchanges refresh token for access token
3. SDK receives new tokens
4. SDK updates internal state:
   - Saves new `refresh_token` for next use
   - Creates `HttpClient` with `access_token` and `api_server`
5. SDK calls your `onTokenRefresh` callback
6. You save the new refresh token to persistent storage

### Token Persistence Options

#### Option 1: Save to .env file (Development)

```typescript
import fs from 'fs'

const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  onTokenRefresh: async (token) => {
    const envContent = fs.readFileSync('.env', 'utf-8')
    const updated = envContent.replace(
      /QUESTRADE_REFRESH_TOKEN=.*/,
      `QUESTRADE_REFRESH_TOKEN=${token.refresh_token}`
    )
    fs.writeFileSync('.env', updated)
    console.log('✅ Token saved to .env')
  }
})
```

#### Option 2: Save to Database (Production)

```typescript
import { db } from './database'

const client = new QuestradeClient({
  refreshToken: await db.getRefreshToken(),
  onTokenRefresh: async (token) => {
    await db.saveRefreshToken(token.refresh_token)
    console.log('✅ Token saved to database')
  }
})
```

#### Option 3: Save to Encrypted Storage

```typescript
import { SecureStore } from './secure-store'

const store = new SecureStore()

const client = new QuestradeClient({
  refreshToken: await store.get('questrade_refresh_token'),
  onTokenRefresh: async (token) => {
    await store.set('questrade_refresh_token', token.refresh_token)
    console.log('✅ Token saved securely')
  }
})
```

## Automatic Refresh

The SDK can automatically refresh tokens before they expire:

```typescript
const client = new QuestradeClient({
  refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  autoRefresh: true,      // Default: true
  refreshBuffer: 60,      // Refresh 60 seconds before expiry (default)
  onTokenRefresh: async (token) => {
    // This will be called both on manual AND automatic refreshes
    await saveToken(token.refresh_token)
  }
})
```

## Best Practices

### ✅ DO

- **Always** implement `onTokenRefresh` callback
- Save the new refresh token immediately
- Use secure storage for tokens in production
- Handle `onTokenRefresh` errors gracefully
- Test token rotation in development

### ❌ DON'T

- Don't reuse old refresh tokens
- Don't forget to save the new token
- Don't store tokens in plain text in production
- Don't commit tokens to version control
- Don't run integration tests frequently (each run rotates the token)

## Troubleshooting

### Error: 400 Bad Request on token refresh

**Cause**: The refresh token has already been used and rotated

**Solution**:
1. Go to Questrade dashboard: https://apphub.questrade.com/UI/UserApps.aspx
2. Generate a new refresh token
3. Update your `.env` or storage with the new token

### Error: "Cannot refresh token: no refresh token available"

**Cause**: Client was initialized with `accessToken` only, no `refreshToken`

**Solution**: Initialize with a refresh token if you need automatic rotation

### Token not being saved

**Cause**: `onTokenRefresh` callback not implemented or throwing errors

**Solution**:
```typescript
onTokenRefresh: async (token) => {
  try {
    await saveToken(token.refresh_token)
  } catch (error) {
    console.error('Failed to save token:', error)
    // Implement fallback or notification
  }
}
```

## Testing with Token Rotation

### Unit Tests

Unit tests mock the token responses and don't use real tokens:

```bash
bun run test:unit
```

### Integration Tests

Integration tests use real tokens and will rotate them:

```bash
# ⚠️ Warning: This will consume and rotate your refresh token!
bun run test:integration
```

**Recommendation**:
- Use a separate test account for integration tests
- Run integration tests sparingly
- Implement `onTokenRefresh` in your test setup to save rotated tokens

## Example: Complete Implementation

```typescript
import { QuestradeClient } from 'quest-ts'
import fs from 'fs/promises'

async function main() {
  // Load current token
  const envContent = await fs.readFile('.env', 'utf-8')
  const match = envContent.match(/QUESTRADE_REFRESH_TOKEN=(.+)/)
  const refreshToken = match?.[1]

  if (!refreshToken) {
    throw new Error('No refresh token found in .env')
  }

  // Initialize client with token persistence
  const client = new QuestradeClient({
    refreshToken,
    autoRefresh: true,
    onTokenRefresh: async (token) => {
      // Save the new token
      const updated = envContent.replace(
        /QUESTRADE_REFRESH_TOKEN=.*/,
        `QUESTRADE_REFRESH_TOKEN=${token.refresh_token}`
      )
      await fs.writeFile('.env', updated)
      console.log('✅ Token refreshed:', new Date().toISOString())
    }
  })

  await client.initialize()

  // Use the client normally
  const accounts = await client.accounts.getAccounts()
  console.log('Accounts:', accounts.accounts.length)

  // Cleanup
  client.dispose()
}

main().catch(console.error)
```

## Additional Resources

- [Questrade API Authorization](https://www.questrade.com/api/documentation/authorization)
- [OAuth 2.0 Token Rotation](https://oauth.net/2/token-rotation/)
- [SDK Client Documentation](./src/client.ts)
