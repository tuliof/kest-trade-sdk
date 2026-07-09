// SPDX-License-Identifier: BSD-3-Clause
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { QuestradeClient } from '@/client'
import { redactToken } from '@/http/logger'

/**
 * Integration tests for QuestradeClient
 *
 * These tests require a valid refresh token from Questrade.
 * Set the QUESTRADE_REFRESH_TOKEN environment variable to run these tests.
 *
 * To run integration tests: bun run test:integration
 * To run unit tests only: bun run test
 *
 * NOTE: These tests use a SHARED client instance to avoid token rotation issues.
 * Since refresh tokens are rotated on each use, we initialize once and reuse the client.
 */

const REFRESH_TOKEN = process.env.QUESTRADE_REFRESH_TOKEN

describe('QuestradeClient Integration Tests', () => {
  let client: QuestradeClient

  beforeAll(async () => {
    if (!REFRESH_TOKEN) {
      throw new Error(
        'QUESTRADE_REFRESH_TOKEN environment variable not set. Please add it to .env file.',
      )
    }

    // Initialize a SHARED client instance for all tests
    client = new QuestradeClient({
      refreshToken: REFRESH_TOKEN,
      logger: 'debug',
      httpLogOptions: { logResponseBody: true },
      autoRefresh: false, // Disable auto-refresh for testing
    })

    await client.initialize()

    console.log('Shared integration test client initialized')
    console.log(`   API Server: ${client.getCurrentToken()?.api_server}`)
    console.log(`   Token expires in: ${client.getCurrentToken()?.expires_in} seconds`)
  })

  afterAll(() => {
    // Clean up resources
    if (client) {
      client.dispose()
      console.log('Shared client disposed')
    }
  })

  test('should initialize with refresh token', async () => {
    // Verify the shared client is initialized
    expect(client.getCurrentToken()).toBeDefined()
    expect(client.getCurrentToken()?.access_token).toBeDefined()
    expect(client.getCurrentToken()?.api_server).toBeDefined()
  })

  test('should provide access to sub-clients after initialization', async () => {
    // Verify sub-clients are available
    expect(client.accounts).toBeDefined()
    expect(client.market).toBeDefined()
    expect(client.auth).toBeDefined()
  })

  test('should support full authentication flow with chained operations', async () => {
    // Use the shared client for all operations

    // Get accounts
    const accountsResponse = await client.accounts.getAccounts()
    expect(accountsResponse.accounts).toBeDefined()
    expect(Array.isArray(accountsResponse.accounts)).toBe(true)

    if (accountsResponse.accounts.length > 0) {
      const firstAccount = accountsResponse.accounts[0]
      if (!firstAccount) {
        throw new Error('First account is undefined')
      }
      const accountId = firstAccount.number

      // Get balances for first account
      const balancesResponse = await client.accounts.getBalances(accountId)
      expect(balancesResponse.perCurrencyBalances).toBeDefined()
      expect(Array.isArray(balancesResponse.perCurrencyBalances)).toBe(true)

      // Get positions for first account
      const positionsResponse = await client.accounts.getPositions(accountId)
      expect(positionsResponse.positions).toBeDefined()
      expect(Array.isArray(positionsResponse.positions)).toBe(true)
    }
  })

  test('should support market data operations', async () => {
    // Search for a symbol using the shared client
    const searchResponse = await client.market.searchSymbols('AAPL')
    expect(searchResponse.symbols).toBeDefined()
    expect(Array.isArray(searchResponse.symbols)).toBe(true)

    console.log(`Found ${searchResponse.symbols.length} symbols for 'AAPL'`)

    if (searchResponse.symbols.length > 0) {
      const firstSymbol = searchResponse.symbols[0]
      if (!firstSymbol) {
        throw new Error('First symbol is undefined')
      }
      const symbolId = firstSymbol.symbolId

      // Get quote for the symbol
      const quotesResponse = await client.market.getQuotes([symbolId])
      expect(quotesResponse.quotes).toBeDefined()
      expect(Array.isArray(quotesResponse.quotes)).toBe(true)
      expect(quotesResponse.quotes.length).toBeGreaterThan(0)

      console.log(`Fetched quote for ${firstSymbol.symbol}`)
    }
  })

  test('should handle token refresh', async () => {
    const oldToken = client.getCurrentToken()
    expect(oldToken).toBeDefined()

    console.log(`   Old access token: ${redactToken(oldToken?.access_token || '')}`)

    // Refresh the token manually
    const newToken = await client.refreshAccessToken()
    expect(newToken).toBeDefined()
    expect(newToken.access_token).not.toBe(oldToken?.access_token)
    expect(newToken.refresh_token).toBeDefined()

    console.log(`Token refreshed successfully`)
    console.log(`   New access token: ${redactToken(newToken.access_token)}`)
    console.log(`   New refresh token saved to .env`)

    // Verify the client still works with the new token
    const accountsResponse = await client.accounts.getAccounts()
    expect(accountsResponse.accounts).toBeDefined()

    console.log('Client functional after token refresh')
  })

  test('should check token expiration status', async () => {
    // Token should not be expired immediately after refresh
    expect(client.isTokenExpired()).toBe(false)

    // Token should not be expiring soon (within 60 seconds)
    // Practice tokens typically have 30-minute expiry
    expect(client.isTokenExpiringSoon(60)).toBe(false)

    console.log('Token expiration status verified')
  })

  test('should support using existing access token', async () => {
    // Get the current token from our shared client
    const token = client.getCurrentToken()
    if (!token) {
      throw new Error('Token is undefined')
    }

    // Create a new client using just the access token (not the refresh token)
    const accessTokenClient = new QuestradeClient({
      accessToken: token.access_token,
      apiServer: token.api_server,
      autoRefresh: false,
    })

    await accessTokenClient.initialize()

    // Should be able to make API calls
    const accountsResponse = await accessTokenClient.accounts.getAccounts()
    expect(accountsResponse.accounts).toBeDefined()

    accessTokenClient.dispose()

    console.log('Access token-only client works correctly')
  })

  test('should cleanup resources on dispose', async () => {
    // Create a temporary client to test disposal
    const currentToken = client.getCurrentToken()
    if (!currentToken) {
      throw new Error('Current token is undefined')
    }

    const tempClient = new QuestradeClient({
      accessToken: currentToken.access_token,
      apiServer: currentToken.api_server,
      autoRefresh: false,
    })

    await tempClient.initialize()

    // Dispose should not throw
    expect(() => tempClient.dispose()).not.toThrow()

    // Should be safe to call multiple times
    expect(() => tempClient.dispose()).not.toThrow()

    console.log('Client disposal works correctly')
  })

  test('should handle concurrent API calls', async () => {
    // Make multiple concurrent calls using shared client
    const [accountsResponse, marketsResponse, searchResponse] = await Promise.all([
      client.accounts.getAccounts(),
      client.market.getMarkets(),
      client.market.searchSymbols('AAPL'),
    ])

    expect(accountsResponse.accounts).toBeDefined()
    expect(marketsResponse.markets).toBeDefined()
    expect(searchResponse.symbols).toBeDefined()

    console.log('Concurrent API calls successful')
  })

  test('should support time-range queries', async () => {
    const accountsResponse = await client.accounts.getAccounts()

    if (accountsResponse.accounts.length > 0) {
      const firstAccount = accountsResponse.accounts[0]
      if (!firstAccount) {
        throw new Error('First account is undefined')
      }
      const accountId = firstAccount.number

      // Get activities for the last 7 days
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      const activitiesResponse = await client.accounts.getActivities(accountId, startDate, endDate)

      expect(activitiesResponse.activities).toBeDefined()
      expect(Array.isArray(activitiesResponse.activities)).toBe(true)

      console.log(`Fetched ${activitiesResponse.activities.length} activities for last 7 days`)

      // Get executions for the last 7 days
      const executionsResponse = await client.accounts.getExecutions(accountId, startDate, endDate)

      expect(executionsResponse.executions).toBeDefined()
      expect(Array.isArray(executionsResponse.executions)).toBe(true)

      // Get orders for the last 7 days
      const ordersResponse = await client.accounts.getOrders(accountId, startDate, endDate)

      expect(ordersResponse.orders).toBeDefined()
      expect(Array.isArray(ordersResponse.orders)).toBe(true)

      console.log('Time-range queries successful')
    }
  })
})

describe('QuestradeClient Error Handling', () => {
  test('should handle invalid refresh token', async () => {
    const client = new QuestradeClient({
      refreshToken: 'invalid_token',
      autoRefresh: false,
    })

    await expect(client.initialize()).rejects.toThrow()
  })

  test('should handle initialization without credentials', () => {
    expect(() => new QuestradeClient({})).toThrow(
      'Either refreshToken, (accessToken + apiServer), or tokenStorage must be provided',
    )
  })

  test('should handle refresh without refresh token', async () => {
    const client = new QuestradeClient({
      accessToken: 'some_token',
      apiServer: 'https://api.test.questrade.com',
      autoRefresh: false,
    })

    await client.initialize()

    await expect(client.refreshAccessToken()).rejects.toThrow(
      'Cannot refresh token: no refresh token available',
    )
  })

  test('should throw error when accessing sub-clients before initialization', () => {
    const client = new QuestradeClient({
      refreshToken: 'test_token',
      autoRefresh: false,
    })

    expect(() => client.accounts).toThrow('Client not initialized. Call initialize() first.')
    expect(() => client.market).toThrow('Client not initialized. Call initialize() first.')
  })
})
