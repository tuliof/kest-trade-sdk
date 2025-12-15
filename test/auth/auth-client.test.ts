// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, mock, test } from 'bun:test'
import { AuthClient } from '@/auth/auth-client'
import type { TokenResponse } from '@/types/auth'
import { AuthenticationError, NetworkError } from '@/types/errors'

describe('AuthClient', () => {
  describe('Constructor', () => {
    test('should create auth client', () => {
      const client = new AuthClient()
      expect(client).toBeInstanceOf(AuthClient)
    })
  })

  describe('refreshToken', () => {
    test('should successfully exchange refresh token for access token', async () => {
      const mockResponse: TokenResponse = {
        access_token: 'new_access_token_123',
        refresh_token: 'new_refresh_token_456',
        token_type: 'Bearer',
        expires_in: 1800,
        api_server: 'https://api01.iq.questrade.com/',
      }

      const mockFetch = mock(async (url: string, options?: RequestInit) => {
        expect(url).toBe('https://login.questrade.com/oauth2/token')
        expect(options?.method).toBe('POST')
        expect(options?.headers).toMatchObject({
          'Content-Type': 'application/x-www-form-urlencoded',
        })

        // Check body contains correct form data
        const body = options?.body as string
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=old_token_123')

        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()
      const result = await client.refreshToken('old_token_123')

      expect(result).toEqual(mockResponse)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should throw AuthenticationError on 401 (invalid refresh token)', async () => {
      const mockFetch = mock(async () => {
        return new Response(
          JSON.stringify({
            code: 1001,
            message: 'Invalid refresh token',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()

      try {
        await client.refreshToken('invalid_token')
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError)
        if (error instanceof AuthenticationError) {
          expect(error.message).toBe('Invalid refresh token')
          expect(error.apiErrorCode).toBe(1001)
        }
      }
    })

    test('should throw NetworkError on server error', async () => {
      const mockFetch = mock(async () => {
        return new Response(
          JSON.stringify({
            code: 5000,
            message: 'Internal server error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()

      await expect(client.refreshToken('some_token')).rejects.toThrow(NetworkError)
    })

    test('should throw NetworkError on network failure', async () => {
      const mockFetch = mock(async () => {
        throw new Error('Network connection failed')
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()

      await expect(client.refreshToken('some_token')).rejects.toThrow(NetworkError)
    })

    test('should handle malformed response body', async () => {
      const mockFetch = mock(async () => {
        return new Response('Not valid JSON', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()

      await expect(client.refreshToken('some_token')).rejects.toThrow()
    })

    test('should validate response schema', async () => {
      // Response missing required fields
      const invalidResponse = {
        access_token: 'token_123',
        // missing other required fields
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(invalidResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()

      await expect(client.refreshToken('some_token')).rejects.toThrow()
    })
  })

  describe('Token Expiration', () => {
    test('should calculate token expiry time', async () => {
      const mockResponse: TokenResponse = {
        access_token: 'token_123',
        refresh_token: 'refresh_456',
        token_type: 'Bearer',
        expires_in: 1800, // 30 minutes
        api_server: 'https://api01.iq.questrade.com/',
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()
      const startTime = Date.now()
      await client.refreshToken('token')

      const expiresAt = client.getTokenExpiresAt()
      expect(expiresAt).toBeDefined()
      if (expiresAt) {
        // Should expire approximately 1800 seconds (30 min) from now
        const expectedExpiry = startTime + 1800 * 1000
        const diff = Math.abs(expiresAt.getTime() - expectedExpiry)
        expect(diff).toBeLessThan(5000) // Within 5 seconds tolerance
      }
    })

    test('should detect if token is expired', async () => {
      const mockResponse: TokenResponse = {
        access_token: 'token_123',
        refresh_token: 'refresh_456',
        token_type: 'Bearer',
        expires_in: 1, // 1 second (will be expired after we wait)
        api_server: 'https://api01.iq.questrade.com/',
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()
      await client.refreshToken('token')

      // Initially not expired
      expect(client.isTokenExpired()).toBe(false)

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Now it should be expired
      expect(client.isTokenExpired()).toBe(true)
    })

    test('should detect if token will expire soon', async () => {
      const mockResponse: TokenResponse = {
        access_token: 'token_123',
        refresh_token: 'refresh_456',
        token_type: 'Bearer',
        expires_in: 30, // 30 seconds
        api_server: 'https://api01.iq.questrade.com/',
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const client = new AuthClient()
      await client.refreshToken('token')

      // With 60 second buffer (default), token expiring in 30s should be considered expiring soon
      expect(client.isTokenExpiringSoon()).toBe(true)
      // But with a 10 second buffer, it should not
      expect(client.isTokenExpiringSoon(10)).toBe(false)
    })
  })
})
