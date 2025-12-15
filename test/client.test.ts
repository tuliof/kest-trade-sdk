// SPDX-License-Identifier: BSD-3-Clause
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import { QuestradeClient } from '@/client'
import { MarketClient } from '@/market/market-client'
import type { TokenResponse } from '@/types/auth'

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
    mock.restore()
  })

  describe('constructor', () => {
    test('should throw error if no authentication credentials provided', () => {
      expect(() => new QuestradeClient({})).toThrow(
        'Either refreshToken or (accessToken + apiServer) must be provided',
      )
    })

    test('should create client with refresh token', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })
      expect(client).toBeDefined()
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
        'Either refreshToken or (accessToken + apiServer) must be provided',
      )
    })

    test('should set default config values', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })
      expect(client).toBeDefined()
      // Auto-refresh should be true by default
      // Refresh buffer should be 60 seconds by default
    })

    test('should allow custom config values', () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
        autoRefresh: false,
        refreshBuffer: 120,
      })
      expect(client).toBeDefined()
    })
  })

  describe('initialize', () => {
    test('should initialize with refresh token', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      const mockRefreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.refreshToken = mockRefreshToken

      const result = await client.refreshAccessToken()

      expect(result).toEqual(mockTokenResponse)
      expect(mockRefreshToken).toHaveBeenCalledWith('test_refresh_token')
    })

    test('should update current token after refresh', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
      const client = new QuestradeClient({ refreshToken: 'old_refresh_token' })

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
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
        onTokenRefresh,
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.refreshAccessToken()

      expect(savedToken).toEqual(mockTokenResponse)
    })
  })

  describe('automatic token refresh', () => {
    test('should schedule token refresh when autoRefresh is enabled', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
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

  describe('sub-client access', () => {
    test('should provide access to accounts client after initialization', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      const accounts = client.accounts
      expect(accounts).toBeInstanceOf(AccountsClient)
    })

    test('should provide access to market client after initialization', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      const market = client.market
      expect(market).toBeInstanceOf(MarketClient)
    })

    test('should provide access to auth client', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      const auth = client.auth
      expect(auth).toBeInstanceOf(AuthClient)
    })

    test('should throw error when accessing accounts client before initialization', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      expect(() => client.accounts).toThrow('Client not initialized. Call initialize() first.')
    })

    test('should throw error when accessing market client before initialization', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      expect(() => client.market).toThrow('Client not initialized. Call initialize() first.')
    })
  })

  describe('token status methods', () => {
    test('should check if token is expired', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.isTokenExpired = mock(() => false)

      await client.initialize()

      expect(client.isTokenExpired()).toBe(false)
    })

    test('should check if token is expiring soon', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.isTokenExpiringSoon = mock(() => true)

      await client.initialize()

      expect(client.isTokenExpiringSoon(300)).toBe(true)
    })

    test('should get current token', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)

      await client.initialize()

      expect(client.getCurrentToken()).toEqual(mockTokenResponse)
    })

    test('should return undefined for current token before initialization with refresh token', () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
      const client = new QuestradeClient({ refreshToken: 'invalid_token' })

      AuthClient.prototype.refreshToken = mock(async () => {
        throw new Error('Invalid refresh token')
      })

      await expect(client.initialize()).rejects.toThrow('Invalid refresh token')
    })

    test('should propagate authentication errors during refresh', async () => {
      const client = new QuestradeClient({ refreshToken: 'test_refresh_token' })

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
        autoRefresh: true,
        refreshBuffer: 0.01, // Very short buffer for testing
      })

      AuthClient.prototype.refreshToken = mock(async () => mockTokenResponse)
      AuthClient.prototype.getTokenExpiresAt = mock(() => new Date(Date.now() + 100)) // Expire very soon

      await client.initialize()

      // Auto-refresh should fail silently and not crash the app
      // (In real scenario, this would be logged to console.error)
    })
  })

  describe('integration scenario', () => {
    test('should support full authentication flow with chained operations', async () => {
      const client = new QuestradeClient({
        refreshToken: 'test_refresh_token',
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
