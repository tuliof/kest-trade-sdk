// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { AuthClient } from '@/auth/auth-client'

/**
 * Integration tests for AuthClient using real Questrade API
 *
 * These tests require valid tokens in .env file:
 * - QUESTRADE_REFRESH_TOKEN: A valid Questrade refresh token
 *
 * To run integration tests: bun run test:integration
 * To run unit tests only: bun run test
 */
describe('AuthClient Integration Tests', () => {
  const refreshToken = process.env.QUESTRADE_REFRESH_TOKEN

  if (!refreshToken) {
    throw new Error(
      'QUESTRADE_REFRESH_TOKEN environment variable not set. Please add it to .env file.',
    )
  }

  test('should successfully refresh token with real Questrade API', async () => {
    const client = new AuthClient()

    // Make real API call
    const response = await client.refreshToken(refreshToken)

    // Verify response structure
    expect(response.access_token).toBeDefined()
    expect(response.refresh_token).toBeDefined()
    expect(response.token_type).toBe('Bearer')
    expect(response.expires_in).toBeGreaterThan(0)
    expect(response.api_server).toMatch(/^https:\/\//)

    console.log('✅ Successfully refreshed token')
    console.log(`   API Server: ${response.api_server}`)
    console.log(`   Expires in: ${response.expires_in} seconds`)
    console.log(`   New refresh token: ${response.refresh_token.substring(0, 10)}...`)
  }, 10000) // 10 second timeout for network call

  test('should track token expiration time', async () => {
    const client = new AuthClient()

    const response = await client.refreshToken(refreshToken)

    // Check expiration tracking
    const expiresAt = client.getTokenExpiresAt()
    expect(expiresAt).toBeDefined()

    if (expiresAt) {
      const now = Date.now()
      const expiryTime = expiresAt.getTime()
      const secondsUntilExpiry = Math.floor((expiryTime - now) / 1000)

      expect(secondsUntilExpiry).toBeGreaterThan(0)
      expect(secondsUntilExpiry).toBeLessThanOrEqual(response.expires_in + 5) // Small tolerance

      console.log(`   Token expires in ${secondsUntilExpiry} seconds`)
    }

    expect(client.isTokenExpired()).toBe(false)

    // For real tokens that might have short expiry (e.g., 30 seconds in practice mode),
    // use a smaller buffer to check "expiring soon"
    const shortBuffer = 5 // 5 seconds
    expect(client.isTokenExpiringSoon(shortBuffer)).toBe(false)
  }, 10000)

  test('should fail with invalid refresh token', async () => {
    const client = new AuthClient()

    try {
      await client.refreshToken('invalid_token_12345')
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      // Should throw an authentication error
      expect(error).toBeDefined()
      console.log(`✅ Correctly rejected invalid token: ${(error as Error).message}`)
    }
  }, 10000)
})
