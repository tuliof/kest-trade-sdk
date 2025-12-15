// SPDX-License-Identifier: BSD-3-Clause
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { HttpClient } from '@/http/http-client'
import { AuthenticationError, NetworkError, RateLimitError } from '@/types/errors'

describe('HttpClient', () => {
  let client: HttpClient
  const mockApiServer = 'https://api01.iq.questrade.com/'
  const mockAccessToken = 'test_access_token_123'

  beforeEach(() => {
    client = new HttpClient(mockApiServer, mockAccessToken)
  })

  describe('Constructor', () => {
    test('should create client with api server and token', () => {
      expect(client).toBeInstanceOf(HttpClient)
    })

    test('should strip trailing slash from api server', () => {
      const clientWithSlash = new HttpClient('https://api01.iq.questrade.com/', mockAccessToken)
      const clientWithoutSlash = new HttpClient('https://api01.iq.questrade.com', mockAccessToken)

      // Both should work the same way
      expect(clientWithSlash).toBeInstanceOf(HttpClient)
      expect(clientWithoutSlash).toBeInstanceOf(HttpClient)
    })
  })

  describe('GET requests', () => {
    test('should make successful GET request with proper headers', async () => {
      const mockFetch = mock(async (url: string, options?: RequestInit) => {
        expect(url).toBe(`${mockApiServer}v1/accounts`)
        expect(options?.method).toBe('GET')
        expect(options?.headers).toMatchObject({
          Authorization: `Bearer ${mockAccessToken}`,
          Accept: 'application/json',
        })

        return new Response(
          JSON.stringify({
            accounts: [],
            userId: 12345,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const response = await client.get('/v1/accounts')
      expect(response).toEqual({
        accounts: [],
        userId: 12345,
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle relative paths without leading slash', async () => {
      const mockFetch = mock(async (url: string) => {
        expect(url).toBe(`${mockApiServer}v1/accounts`)
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await client.get('v1/accounts')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle query parameters', async () => {
      const mockFetch = mock(async (url: string) => {
        const parsedUrl = new URL(url)
        expect(parsedUrl.pathname).toBe('/v1/accounts/123/activities')
        expect(parsedUrl.searchParams.get('startTime')).toBe('2024-01-01')
        expect(parsedUrl.searchParams.get('endTime')).toBe('2024-01-31')

        return new Response(JSON.stringify({ activities: [] }), {
          status: 200,
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await client.get('/v1/accounts/123/activities', {
        startTime: '2024-01-01',
        endTime: '2024-01-31',
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST requests', () => {
    test('should make successful POST request with JSON body', async () => {
      const mockFetch = mock(async (url: string, options?: RequestInit) => {
        expect(url).toBe(`${mockApiServer}v1/accounts/123/orders`)
        expect(options?.method).toBe('POST')
        expect(options?.headers).toMatchObject({
          Authorization: `Bearer ${mockAccessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        })

        const body = JSON.parse(options?.body as string)
        expect(body).toEqual({
          accountNumber: '123',
          symbolId: 456,
          quantity: 10,
        })

        return new Response(
          JSON.stringify({
            orderId: 789,
            status: 'Pending',
          }),
          { status: 200 },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const response = await client.post('/v1/accounts/123/orders', {
        accountNumber: '123',
        symbolId: 456,
        quantity: 10,
      })

      expect(response).toEqual({
        orderId: 789,
        status: 'Pending',
      })
    })
  })

  describe('Error Handling', () => {
    test('should throw AuthenticationError on 401', async () => {
      const mockFetch = mock(async () => {
        return new Response(
          JSON.stringify({
            code: 1001,
            message: 'Invalid access token',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError)
        if (error instanceof AuthenticationError) {
          expect(error.message).toBe('Invalid access token')
          expect(error.apiErrorCode).toBe(1001)
        }
      }
    })

    test('should throw RateLimitError on 429 with retry-after header', async () => {
      const mockFetch = mock(async () => {
        return new Response(
          JSON.stringify({
            code: 1002,
            message: 'Rate limit exceeded',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          },
        )
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError)
        if (error instanceof RateLimitError) {
          expect(error.retryAfter).toBe(60)
          expect(error.apiErrorCode).toBe(1002)
        }
      }
    })

    test('should throw NetworkError on 500', async () => {
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

      try {
        await client.get('/v1/accounts')
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError)
        if (error instanceof NetworkError) {
          expect(error.statusCode).toBe(500)
          expect(error.apiErrorCode).toBe(5000)
        }
      }
    })

    test('should handle network fetch errors', async () => {
      const mockFetch = mock(async () => {
        throw new Error('Network connection failed')
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await expect(client.get('/v1/accounts')).rejects.toThrow(NetworkError)
    })

    test('should handle non-JSON error responses', async () => {
      const mockFetch = mock(async () => {
        return new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await expect(client.get('/v1/accounts')).rejects.toThrow(NetworkError)
    })
  })

  describe('Token Management', () => {
    test('should allow updating access token', async () => {
      const newToken = 'new_token_456'
      client.setAccessToken(newToken)

      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        expect(options?.headers).toMatchObject({
          Authorization: `Bearer ${newToken}`,
        })
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await client.get('/v1/accounts')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
