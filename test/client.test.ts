// SPDX-License-Identifier: BSD-3-Clause
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import { QuestradeClient } from '@/client'
import { MarketClient } from '@/market/market-client'
import type { TokenResponse } from '@/types/auth'
import { AuthenticationError, NetworkError } from '@/types/errors'

const pristineAuthClientMethods = {
  refreshToken: AuthClient.prototype.refreshToken,
  getTokenExpiresAt: AuthClient.prototype.getTokenExpiresAt,
  isTokenExpired: AuthClient.prototype.isTokenExpired,
  isTokenExpiringSoon: AuthClient.prototype.isTokenExpiringSoon,
}

describe('QuestradeClient', () => {
  let mockTokenResponse: TokenResponse
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    // Save original fetch
    originalFetch = globalThis.fetch

    mockTokenResponse = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      api_server: 'https://api.test.questrade.com',
      expires_in: 3600,
      token_type: 'Bearer',
    }

    // Mock fetch to return our test token response
    globalThis.fetch = mock(async (_url: string, _options?: RequestInit) => {
      return new Response(JSON.stringify(mockTokenResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch
    Object.assign(AuthClient.prototype, pristineAuthClientMethods)
    mock.restore()
  })

  describe('constructor', () => {
    test('should create a client with no config, relying on storage and the env seed', () => {
      expect(new QuestradeClient({ tokenStorage: 'memory' })).toBeDefined()
    })

    test('should create client with refresh token', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })
      expect(client).toBeDefined()
    })

    test('should reject an invalid requestTimeoutMs', () => {
      expect(
        () =>
          new QuestradeClient({ refreshToken: 'x', tokenStorage: 'memory', requestTimeoutMs: 0 }),
      ).toThrow('requestTimeoutMs')
    })

    test('should attach a timeout signal to the token request', async () => {
      const signals: Array<AbortSignal | null | undefined> = []
      globalThis.fetch = mock(async (_url: string, options?: RequestInit) => {
        signals.push(options?.signal)
        return new Response(JSON.stringify(mockTokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch
      const client = new QuestradeClient({
        refreshToken: 'x',
        tokenStorage: 'memory',
        autoRefresh: false,
        requestTimeoutMs: 5000,
      })

      await client.initialize()

      expect(signals[0]).toBeInstanceOf(AbortSignal)
    })

    test('should create client with access token and api server', () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })
      expect(client).toBeDefined()
    })

    test('should throw error if access token provided without api server', () => {
      expect(() => new QuestradeClient({ accessToken: 'test_access_token' })).toThrow(
        'accessToken and apiServer must be provided together',
      )
    })

    test('should set default config values', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })
      expect(client).toBeDefined()
      // Auto-refresh should be true by default
      // Refresh buffer should be 60 seconds by default
    })

    test('should allow custom config values', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
        refreshBuffer: 120,
      })
      expect(client).toBeDefined()
    })
  })

  describe('initialize', () => {
    describe('refresh token precedence', () => {
      const seedEnvVar = 'QUESTRADE_REFRESH_TOKEN'
      let originalSeedEnv: string | undefined

      beforeEach(() => {
        originalSeedEnv = process.env[seedEnvVar]
        delete process.env[seedEnvVar]
      })

      afterEach(() => {
        if (originalSeedEnv === undefined) delete process.env[seedEnvVar]
        else process.env[seedEnvVar] = originalSeedEnv
      })

      function mockTokenEndpoint(validTokens: string[]) {
        const usedTokens: string[] = []
        AuthClient.prototype.refreshToken = mock(async (token: string) => {
          usedTokens.push(token)
          if (!validTokens.includes(token)) throw new AuthenticationError('Bad Request')
          return { ...mockTokenResponse, refresh_token: `rotated_${token}` }
        })
        return usedTokens
      }

      async function createClientWithStoredToken(storedToken: string | null, seed?: string) {
        const client = new QuestradeClient({
          refreshToken: seed,
          tokenStorage: 'memory',
          autoRefresh: false,
        })
        const storage = (client as unknown as { tokenStorage: { set(t: string): Promise<void> } })
          .tokenStorage
        if (storedToken) await storage.set(storedToken)
        return { client, storage: storage as unknown as { get(): Promise<string | null> } }
      }

      test('prefers the stored token over a stale seed', async () => {
        const usedTokens = mockTokenEndpoint(['stored'])
        const { client, storage } = await createClientWithStoredToken('stored', 'stale_seed')

        await client.initialize()

        expect(usedTokens).toEqual(['stored'])
        expect(await storage.get()).toBe('rotated_stored')
      })

      test('falls back to the seed when the stored token is rejected', async () => {
        const usedTokens = mockTokenEndpoint(['fresh_seed'])
        const { client, storage } = await createClientWithStoredToken('revoked', 'fresh_seed')

        await client.initialize()

        expect(usedTokens).toEqual(['revoked', 'fresh_seed'])
        expect(await storage.get()).toBe('rotated_fresh_seed')
      })

      test('uses the seed when storage is empty', async () => {
        const usedTokens = mockTokenEndpoint(['seed'])
        const { client } = await createClientWithStoredToken(null, 'seed')

        await client.initialize()

        expect(usedTokens).toEqual(['seed'])
      })

      test('reads the seed from QUESTRADE_REFRESH_TOKEN when config has none', async () => {
        process.env[seedEnvVar] = 'env_seed'
        const usedTokens = mockTokenEndpoint(['env_seed'])
        const { client } = await createClientWithStoredToken(null)

        await client.initialize()

        expect(usedTokens).toEqual(['env_seed'])
      })

      test('tries a token only once when storage and seed hold the same value', async () => {
        const usedTokens = mockTokenEndpoint([])
        const { client } = await createClientWithStoredToken('same', 'same')

        await expect(client.initialize()).rejects.toBeInstanceOf(AuthenticationError)
        expect(usedTokens).toEqual(['same'])
      })

      test('explains how to recover when every token is rejected', async () => {
        mockTokenEndpoint([])
        const { client } = await createClientWithStoredToken('revoked', 'consumed')

        await expect(client.initialize()).rejects.toThrow(
          'rejected the refresh token from storage and seed',
        )
      })

      test('does not try the seed when the stored token fails for a non-auth reason', async () => {
        const usedTokens: string[] = []
        AuthClient.prototype.refreshToken = mock(async (token: string) => {
          usedTokens.push(token)
          throw new NetworkError('Network request failed')
        })
        const { client } = await createClientWithStoredToken('stored', 'seed')

        await expect(client.initialize()).rejects.toBeInstanceOf(NetworkError)
        expect(usedTokens).toEqual(['stored'])
      })

      test('explains where to get a token when none is available', async () => {
        const { client } = await createClientWithStoredToken(null)

        await expect(client.initialize()).rejects.toThrow('kest-trade-sdk login')
      })
    })

    test('should initialize with refresh token', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken

      await client.initialize()

      expect(mockRefreshToken).toHaveBeenCalledWith('test_refresh_token')
    })

    test('should initialize with existing access token', async () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })

      await client.initialize()

      // Should not call refresh token
      expect(client.getCurrentToken()).toBeUndefined()
    })

    test('should initialize sub-clients after authentication', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      // Should be able to access sub-clients
      expect(() => client.accounts).not.toThrow()
      expect(() => client.market).not.toThrow()
      expect(client.auth).toBeDefined()
    })
  })

  describe('refreshAccessToken', () => {
    test('should refresh access token', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken

      const result = await client.refreshAccessToken()

      expect(result).toEqual(mockTokenResponse)
      expect(mockRefreshToken).toHaveBeenCalledWith('test_refresh_token')
    })

    test('should update current token after refresh', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.refreshAccessToken()

      expect(client.getCurrentToken()).toEqual(mockTokenResponse)
    })

    test('should throw error if no refresh token available', async () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })

      await client.initialize()

      await expect(client.refreshAccessToken()).rejects.toThrow(
        'Cannot refresh token: no refresh token available',
      )
    })

    test('should update refresh token for next use', async () => {
      const client = new QuestradeClient({
        refreshToken: 'old_refresh_token',
        tokenStorage: 'memory',
      })

      const newTokenResponse = {
        ...mockTokenResponse,
        refresh_token: 'new_refresh_token',
      }

      AuthClient.prototype.refreshToken = mock(async () => newTokenResponse)

      await client.refreshAccessToken()

      // Next refresh should use the new refresh token
      AuthClient.prototype.refreshToken = mock(async (token: string) => {
        expect(token).toBe('new_refresh_token')
        return newTokenResponse
      })

      await client.refreshAccessToken()
    })

    test('should initialize clients after refresh', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.refreshAccessToken()

      expect(() => client.accounts).not.toThrow()
      expect(() => client.market).not.toThrow()
    })

    test('should call onTokenRefresh callback when token is refreshed', async () => {
      const onTokenRefresh = mock(async (token: TokenResponse) => {
        expect(token.refresh_token).toBe('test_refresh_token')
        expect(token.access_token).toBe('test_access_token')
      })

      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        onTokenRefresh,
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.refreshAccessToken()

      expect(onTokenRefresh).toHaveBeenCalledTimes(1)
      expect(onTokenRefresh).toHaveBeenCalledWith(mockTokenResponse)
    })

    test('should handle async onTokenRefresh callback', async () => {
      let savedToken: TokenResponse | undefined

      const onTokenRefresh = mock(async (token: TokenResponse) => {
        // Simulate async save operation
        await new Promise((resolve) => setTimeout(resolve, 10))
        savedToken = token
      })

      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        onTokenRefresh,
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.refreshAccessToken()

      expect(savedToken).toEqual(mockTokenResponse)
    })
  })

  describe('credential updates across refreshes', () => {
    const secondTokenResponse = (): TokenResponse => ({
      access_token: 'second_access_token',
      refresh_token: 'second_refresh_token',
      api_server: 'https://api02.test.questrade.com/',
      expires_in: 1800,
      token_type: 'Bearer',
    })

    test('should keep previously obtained sub-clients working with the new access token', async () => {
      const responses = [mockTokenResponse, secondTokenResponse()]
      let refreshCalls = 0
      AuthClient.prototype.refreshToken = mock(
        async () => responses[refreshCalls++] as TokenResponse,
      )
      const requests: Array<{ url: string; authorization: string | undefined }> = []
      globalThis.fetch = mock(async (url: string, options?: RequestInit) => {
        const headers = options?.headers as Record<string, string>
        requests.push({ url, authorization: headers.Authorization })
        return new Response(JSON.stringify({ accounts: [], userId: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as unknown as typeof fetch
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })
      await client.initialize()
      const heldAccounts = client.accounts
      const heldMarket = client.market

      await client.refreshAccessToken()
      await heldAccounts.getAccounts()

      expect(requests).toEqual([
        {
          url: 'https://api02.test.questrade.com/v1/accounts',
          authorization: 'Bearer second_access_token',
        },
      ])
      expect(client.accounts).toBe(heldAccounts)
      expect(client.market).toBe(heldMarket)
    })
  })

  describe('setHttpLogOptions', () => {
    test('should apply new log options to requests without waiting for a refresh', async () => {
      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      const entries: Array<Record<string, unknown> | undefined> = []
      const logger = {
        debug: (_message: string, context?: Record<string, unknown>) => {
          entries.push(context)
        },
        info: () => {},
        warn: () => {},
        error: () => {},
      }
      globalThis.fetch = mock(
        async () =>
          new Response(JSON.stringify({ accounts: [], userId: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
        logger,
      })
      await client.initialize()

      client.setHttpLogOptions({ logRequestHeaders: false, logResponseBody: false })
      await client.accounts.getAccounts()

      const requestEntry = entries.find((entry) => entry?.method === 'GET')
      expect(requestEntry?.requestHeaders).toBeUndefined()
      expect(entries.some((entry) => entry?.responseBody !== undefined)).toBe(false)
    })
  })

  describe('concurrent refreshes', () => {
    function createDeferredRefresh() {
      let release: (token: TokenResponse) => void = () => {}
      const gate = new Promise<TokenResponse>((resolve) => {
        release = resolve
      })
      const exchange = mock(async () => gate)
      return { exchange, release }
    }

    test('should share one token exchange between concurrent callers', async () => {
      const { exchange, release } = createDeferredRefresh()
      AuthClient.prototype.refreshToken = exchange
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })

      const first = client.refreshAccessToken()
      const second = client.refreshAccessToken()
      release(mockTokenResponse)

      expect(await first).toEqual(mockTokenResponse)
      expect(await second).toEqual(mockTokenResponse)
      expect(exchange).toHaveBeenCalledTimes(1)
    })

    test('should allow a new refresh once the previous one settled', async () => {
      const exchange = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = exchange
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })

      await client.refreshAccessToken()
      await client.refreshAccessToken()

      expect(exchange).toHaveBeenCalledTimes(2)
    })

    test('should clear the in-flight refresh after a failure', async () => {
      let calls = 0
      AuthClient.prototype.refreshToken = mock(async () => {
        calls++
        if (calls === 1) throw new Error('boom')
        return mockTokenResponse
      })
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })

      const failing = client.refreshAccessToken()
      const sharing = client.refreshAccessToken()
      await expect(failing).rejects.toThrow('boom')
      await expect(sharing).rejects.toThrow('boom')

      expect(await client.refreshAccessToken()).toEqual(mockTokenResponse)
    })
  })

  describe('automatic token refresh', () => {
    test('should schedule token refresh when autoRefresh is enabled', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: true,
        refreshBuffer: 60,
      })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 3600000))

      await client.initialize()

      // Should have scheduled a refresh
      expect(mockRefreshToken).toHaveBeenCalledTimes(1)
    })

    test('should not schedule token refresh when autoRefresh is disabled', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken

      await client.initialize()

      // Should only refresh once during initialization
      expect(mockRefreshToken).toHaveBeenCalledTimes(1)
    })

    test('should use custom refresh buffer', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: true,
        refreshBuffer: 120,
      })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 3600000))

      await client.initialize()

      expect(mockRefreshToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('auto-refresh failure handling', () => {
    const originalRefreshToken = AuthClient.prototype.refreshToken
    const originalGetTokenExpiresAt = AuthClient.prototype.getTokenExpiresAt

    afterEach(() => {
      AuthClient.prototype.refreshToken = originalRefreshToken
      AuthClient.prototype.getTokenExpiresAt = originalGetTokenExpiresAt
    })

    async function waitFor(condition: () => boolean): Promise<void> {
      const deadline = Date.now() + 2000
      while (!condition()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
        await new Promise((resolve) => setTimeout(resolve, 2))
      }
    }

    function expireSoonOnlyOnce() {
      let reported = false
      AuthClient.prototype.getTokenExpiresAt = mock(() => {
        if (reported) return undefined
        reported = true
        return new Date(Date.now() + 15)
      })
    }

    function createAutoRefreshClient(
      onAutoRefreshError?: (error: unknown, attempts: number) => void,
    ) {
      return new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        refreshBuffer: 0,
        autoRefreshRetryDelayMs: 2,
        onAutoRefreshError,
      })
    }

    test('should retry a failed auto-refresh and recover without notifying', async () => {
      expireSoonOnlyOnce()
      let calls = 0
      AuthClient.prototype.refreshToken = mock(async () => {
        calls++
        if (calls === 2) throw new NetworkError('flaky', 503)
        return mockTokenResponse
      })
      const onAutoRefreshError = mock(() => {})
      const client = createAutoRefreshClient(onAutoRefreshError)

      await client.initialize()
      await waitFor(() => calls >= 3)

      expect(onAutoRefreshError).not.toHaveBeenCalled()
      client.dispose()
    })

    test('should give up after 3 attempts and call onAutoRefreshError', async () => {
      expireSoonOnlyOnce()
      let calls = 0
      const failure = new NetworkError('down', 503)
      AuthClient.prototype.refreshToken = mock(async () => {
        calls++
        if (calls > 1) throw failure
        return mockTokenResponse
      })
      const notifications: Array<{ error: unknown; attempts: number }> = []
      const client = createAutoRefreshClient((error, attempts) => {
        notifications.push({ error, attempts })
      })

      await client.initialize()
      await waitFor(() => notifications.length > 0)

      expect(calls).toBe(4)
      expect(notifications).toEqual([{ error: failure, attempts: 3 }])
      client.dispose()
    })

    test('should not retry a rejected refresh token', async () => {
      expireSoonOnlyOnce()
      let calls = 0
      AuthClient.prototype.refreshToken = mock(async () => {
        calls++
        if (calls > 1) throw new AuthenticationError('invalid_grant')
        return mockTokenResponse
      })
      const notifications: number[] = []
      const client = createAutoRefreshClient((_error, attempts) => {
        notifications.push(attempts)
      })

      await client.initialize()
      await waitFor(() => notifications.length > 0)
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(calls).toBe(2)
      expect(notifications).toEqual([1])
      client.dispose()
    })

    test('should survive an onAutoRefreshError callback that throws', async () => {
      expireSoonOnlyOnce()
      let calls = 0
      AuthClient.prototype.refreshToken = mock(async () => {
        calls++
        if (calls > 1) throw new AuthenticationError('invalid_grant')
        return mockTokenResponse
      })
      let invoked = false
      const client = createAutoRefreshClient(() => {
        invoked = true
        throw new Error('callback failed')
      })

      await client.initialize()
      await waitFor(() => invoked)
      await new Promise((resolve) => setTimeout(resolve, 10))

      client.dispose()
    })

    test('should not keep the process alive with the refresh timer', async () => {
      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 3_600_000))
      const client = createAutoRefreshClient()

      await client.initialize()

      const timer = (client as unknown as { refreshTimerId?: { hasRef(): boolean } }).refreshTimerId
      expect(timer?.hasRef()).toBe(false)
      client.dispose()
    })
  })

  describe('sub-client access', () => {
    test('should provide access to accounts client after initialization', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      const accounts = client.accounts
      expect(accounts).toBeInstanceOf(AccountsClient)
    })

    test('should provide access to market client after initialization', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      const market = client.market
      expect(market).toBeInstanceOf(MarketClient)
    })

    test('should provide access to auth client', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      const auth = client.auth
      expect(auth).toBeInstanceOf(AuthClient)
    })

    test('should throw error when accessing accounts client before initialization', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      expect(() => client.accounts).toThrow('Client not initialized. Call initialize() first.')
    })

    test('should throw error when accessing market client before initialization', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      expect(() => client.market).toThrow('Client not initialized. Call initialize() first.')
    })
  })

  describe('token status methods', () => {
    test('should check if token is expired', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.isTokenExpired = mock(() => false)

      await client.initialize()

      expect(client.isTokenExpired()).toBe(false)
    })

    test('should check if token is expiring soon', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.isTokenExpiringSoon = mock(() => true)

      await client.initialize()

      expect(client.isTokenExpiringSoon(300)).toBe(true)
    })

    test('should throw from isTokenExpired in access-token-only mode', async () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })
      await client.initialize()

      expect(() => client.isTokenExpired()).toThrow('access-token-only mode')
    })

    test('should throw from isTokenExpiringSoon in access-token-only mode', async () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })
      await client.initialize()

      expect(() => client.isTokenExpiringSoon()).toThrow('access-token-only mode')
    })

    test('should get current token', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      expect(client.getCurrentToken()).toEqual(mockTokenResponse)
    })

    test('should return undefined for current token before initialization with refresh token', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      expect(client.getCurrentToken()).toBeUndefined()
    })

    test('should return undefined for current token when initialized with access token', async () => {
      const client = new QuestradeClient({
        accessToken: 'test_access_token',
        apiServer: 'https://api.test.questrade.com',
      })

      await client.initialize()

      expect(client.getCurrentToken()).toBeUndefined()
    })
  })

  describe('dispose', () => {
    test('should cleanup resources', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: true,
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 3600000))

      await client.initialize()

      // Should clear timer
      client.dispose()

      // Should be able to call dispose multiple times safely
      client.dispose()
    })
  })

  describe('error handling', () => {
    test('should propagate authentication errors during initialization', async () => {
      const client = new QuestradeClient({ refreshToken: 'invalid_token', tokenStorage: 'memory' })

      AuthClient.prototype.refreshToken = mock(async () => {
        throw new Error('Invalid refresh token')
      })

      await expect(client.initialize()).rejects.toThrow('Invalid refresh token')
    })

    test('should propagate authentication errors during refresh', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      // Mock refresh to fail
      AuthClient.prototype.refreshToken = mock(async () => {
        throw new Error('Token refresh failed')
      })

      await expect(client.refreshAccessToken()).rejects.toThrow('Token refresh failed')
    })

    test('should handle auto-refresh failures gracefully', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: true,
        refreshBuffer: 0.01, // Very short buffer for testing
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 100)) // Expire very soon

      await client.initialize()

      // Auto-refresh should fail silently and not crash the app
      // (Logged via logger.error, not console.error)
    })
  })

  describe('integration scenario', () => {
    test('should support full authentication flow with chained operations', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        tokenStorage: 'memory',
        autoRefresh: false,
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      // Initialize client
      await client.initialize()

      // Should be able to access sub-clients
      expect(client.accounts).toBeDefined()
      expect(client.market).toBeDefined()
      expect(client.auth).toBeDefined()

      // Should have current token
      expect(client.getCurrentToken()).toEqual(mockTokenResponse)

      // Cleanup
      client.dispose()
    })

    test('should support using existing access token', async () => {
      const client = new QuestradeClient({
        accessToken: 'existing_access_token',
        apiServer: 'https://api.test.questrade.com',
        autoRefresh: false,
      })

      // Initialize client
      await client.initialize()

      // Should be able to access sub-clients
      expect(client.accounts).toBeDefined()
      expect(client.market).toBeDefined()

      // Cleanup
      client.dispose()
    })
  })
})
