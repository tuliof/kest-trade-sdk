// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import { HttpClient } from '@/http/http-client'

/**
 * Integration tests for AccountsClient using real Questrade API
 *
 * These tests require valid tokens in .env file:
 * - QUESTRADE_REFRESH_TOKEN: A valid Questrade refresh token
 *
 * To run integration tests: bun run test:integration
 * To run unit tests only: bun run test
 */
describe('AccountsClient Integration Tests', () => {
  const refreshToken = process.env.QUESTRADE_REFRESH_TOKEN

  if (!refreshToken) {
    throw new Error(
      'QUESTRADE_REFRESH_TOKEN environment variable not set. Please add it to .env file.',
    )
  }

  test('should fetch accounts and balances from real API', async () => {
    // Step 1: Get access token (only once)
    const authClient = new AuthClient()
    const tokenResponse = await authClient.refreshToken(refreshToken)

    // Step 2: Create HTTP client with real API server and token
    const httpClient = new HttpClient(tokenResponse.api_server, tokenResponse.access_token)

    // Step 3: Create accounts client
    const accountsClient = new AccountsClient(httpClient)

    // Step 4: Fetch accounts
    const accountsResponse = await accountsClient.getAccounts()

    // Verify response structure
    expect(accountsResponse.accounts).toBeDefined()
    expect(accountsResponse.userId).toBeDefined()
    expect(Array.isArray(accountsResponse.accounts)).toBe(true)
    expect(typeof accountsResponse.userId).toBe('number')

    console.log('✅ Successfully fetched accounts')
    console.log(`   User ID: ${accountsResponse.userId}`)
    console.log(`   Number of accounts: ${accountsResponse.accounts.length}`)

    if (accountsResponse.accounts.length > 0) {
      const firstAccount = accountsResponse.accounts[0]
      if (!firstAccount) {
        throw new Error('First account is undefined')
      }

      console.log(`   First account: ${firstAccount.type} (${firstAccount.number})`)

      // Step 5: Get balances for first account
      const balancesResponse = await accountsClient.getBalances(firstAccount.number)

      // Verify response structure
      expect(balancesResponse.perCurrencyBalances).toBeDefined()
      expect(balancesResponse.combinedBalances).toBeDefined()
      expect(Array.isArray(balancesResponse.perCurrencyBalances)).toBe(true)
      expect(Array.isArray(balancesResponse.combinedBalances)).toBe(true)

      console.log('✅ Successfully fetched balances')
      console.log(`   Account: ${firstAccount.number}`)
      console.log(`   Currencies: ${balancesResponse.perCurrencyBalances.length}`)

      if (balancesResponse.perCurrencyBalances.length > 0) {
        const balance = balancesResponse.perCurrencyBalances[0]
        console.log(`   ${balance?.currency} - Total Equity: $${balance?.totalEquity}`)
      }
    }
  }, 15000) // 15 second timeout
})
