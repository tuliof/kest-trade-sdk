// SPDX-License-Identifier: BSD-3-Clause
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { HttpClient } from '@/http/http-client'
import type { Logger } from '@/logger'
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
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
          { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  describe('Non-JSON and empty bodies', () => {
    test('should surface the real status code for an HTML 502 page', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('<html><body>Bad Gateway</body></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ) as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect.unreachable('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError)
        expect((error as NetworkError).statusCode).toBe(502)
        expect((error as NetworkError).message).toContain('Bad Gateway')
      }
    })

    test('should throw AuthenticationError for a plain-text 401', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
      ) as unknown as typeof fetch

      await expect(client.get('/v1/accounts')).rejects.toThrow(AuthenticationError)
    })

    test('should keep the status code when an error body is empty', async () => {
      globalThis.fetch = mock(
        async () => new Response(null, { status: 503 }),
      ) as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect.unreachable('Should have thrown')
      } catch (error) {
        expect((error as NetworkError).statusCode).toBe(503)
        expect((error as NetworkError).message).toBe('HTTP 503 error')
      }
    })

    test('should keep the status code when a JSON error body is malformed', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('{not json', {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect.unreachable('Should have thrown')
      } catch (error) {
        expect((error as NetworkError).statusCode).toBe(500)
      }
    })

    test('should truncate very long error bodies in the message', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('x'.repeat(5000), { status: 500, headers: { 'Content-Type': 'text/html' } }),
      ) as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect.unreachable('Should have thrown')
      } catch (error) {
        expect((error as NetworkError).message.length).toBeLessThan(300)
      }
    })

    test('should resolve undefined for an empty 204 response', async () => {
      globalThis.fetch = mock(
        async () => new Response(null, { status: 204 }),
      ) as unknown as typeof fetch

      expect(await client.get('/v1/accounts')).toBeUndefined()
    })

    test('should reject a successful response that is not JSON', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      ) as unknown as typeof fetch

      try {
        await client.get('/v1/accounts')
        expect.unreachable('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError)
        expect((error as NetworkError).statusCode).toBe(200)
        expect((error as NetworkError).message).toContain('Expected a JSON response')
      }
    })
  })

  describe('Response logging', () => {
    interface LoggedCall {
      level: string
      message: string
      context?: Record<string, unknown>
    }

    function createRecordingLogger(calls: LoggedCall[]): Logger {
      const record = (level: string) => (message: string, context?: Record<string, unknown>) => {
        calls.push({ level, message, context })
      }
      return {
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
      }
    }

    function mockAccountsResponse(status = 200) {
      globalThis.fetch = mock(
        async () =>
          new Response(JSON.stringify({ accounts: [], userId: 987654 }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch
    }

    test('should keep the body out of info-level response lines', async () => {
      const calls: LoggedCall[] = []
      const loggingClient = new HttpClient(
        mockApiServer,
        mockAccessToken,
        createRecordingLogger(calls),
        { logResponseBody: true },
      )
      mockAccountsResponse()

      await loggingClient.get('/v1/accounts')

      const infoCalls = calls.filter((call) => call.level === 'info')
      expect(infoCalls).toHaveLength(1)
      expect(infoCalls[0]?.context?.responseStatus).toBe(200)
      expect(infoCalls[0]?.context?.url).toContain('/v1/accounts')
      expect(typeof infoCalls[0]?.context?.duration).toBe('number')
      expect(infoCalls[0]?.context?.responseBody).toBeUndefined()
    })

    test('should emit the full response body only at debug level', async () => {
      const calls: LoggedCall[] = []
      const loggingClient = new HttpClient(
        mockApiServer,
        mockAccessToken,
        createRecordingLogger(calls),
        { logResponseBody: true },
      )
      mockAccountsResponse()

      await loggingClient.get('/v1/accounts')

      const bodyCalls = calls.filter((call) => call.context?.responseBody !== undefined)
      expect(bodyCalls).toHaveLength(1)
      expect(bodyCalls[0]?.level).toBe('debug')
    })

    test('should not emit bodies at all when logResponseBody is disabled', async () => {
      const calls: LoggedCall[] = []
      const loggingClient = new HttpClient(
        mockApiServer,
        mockAccessToken,
        createRecordingLogger(calls),
        { logResponseBody: false },
      )
      mockAccountsResponse()

      await loggingClient.get('/v1/accounts')

      expect(calls.some((call) => call.context?.responseBody !== undefined)).toBe(false)
    })

    test('should keep the body out of error-level response lines', async () => {
      const calls: LoggedCall[] = []
      const loggingClient = new HttpClient(
        mockApiServer,
        mockAccessToken,
        createRecordingLogger(calls),
        { logResponseBody: true },
      )
      mockAccountsResponse(500)

      await expect(loggingClient.get('/v1/accounts')).rejects.toThrow(NetworkError)

      const responseLine = calls.find(
        (call) => call.level === 'error' && call.message === 'HTTP Response',
      )
      expect(responseLine?.context?.responseStatus).toBe(500)
      expect(responseLine?.context?.responseBody).toBeUndefined()
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
        return new Response(JSON.stringify({ data: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await client.get('/v1/accounts')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
