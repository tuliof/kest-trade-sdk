// SPDX-License-Identifier: BSD-3-Clause
import { APIErrorSchema, AuthenticationError, NetworkError, RateLimitError } from '@/types/errors'
import { HttpLogger, type LoggerOptions } from './logger'

/**
 * HTTP Client for making requests to the Questrade API
 * Uses native fetch with Bearer token authentication
 */
export class HttpClient {
  private apiServer: string
  private accessToken: string
  private logger: HttpLogger

  /**
   * Create a new HTTP client
   * @param apiServer - The API server URL (e.g., "https://api01.iq.questrade.com/")
   * @param accessToken - The Bearer access token
   * @param loggerOptions - Optional logger configuration for request/response logging
   */
  constructor(apiServer: string, accessToken: string, loggerOptions?: LoggerOptions) {
    // Remove trailing slash for consistency
    this.apiServer = apiServer.endsWith('/') ? apiServer.slice(0, -1) : apiServer
    this.accessToken = accessToken
    this.logger = new HttpLogger(loggerOptions)
  }

  /**
   * Update the access token (useful after token refresh)
   * @param accessToken - The new access token
   */
  public setAccessToken(accessToken: string): void {
    this.accessToken = accessToken
  }

  /**
   * Update logger options
   * @param options - New logger options
   */
  public setLoggerOptions(options: Partial<LoggerOptions>): void {
    this.logger.setOptions(options)
  }

  /**
   * Get current logger options
   */
  public getLoggerOptions(): Readonly<Required<LoggerOptions>> {
    return this.logger.getOptions()
  }

  /**
   * Make a GET request
   * @param path - API endpoint path (e.g., "/v1/accounts")
   * @param params - Optional query parameters
   * @returns Parsed JSON response
   */
  public async get<T = unknown>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const url = this.buildUrl(path, params)
    return this.request<T>(url, { method: 'GET' })
  }

  /**
   * Make a POST request
   * @param path - API endpoint path
   * @param body - Request body (will be JSON stringified)
   * @returns Parsed JSON response
   */
  public async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string | number>): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const baseUrl = `${this.apiServer}${normalizedPath}`

    if (!params || Object.keys(params).length === 0) {
      return baseUrl
    }

    const url = new URL(baseUrl)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value))
    }
    return url.toString()
  }

  /**
   * Make HTTP request with error handling
   */
  private async request<T>(
    url: string,
    options: RequestInit & { headers?: Record<string, string> },
  ): Promise<T> {
    const startTime = Date.now()
    const method = options.method || 'GET'

    // Build headers
    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    }

    // Merge with options headers if provided
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        requestHeaders[key] = value
      }
    }

    // Log request
    this.logger.logRequest(method, url, requestHeaders, options.body)

    try {
      const response = await fetch(url, {
        ...options,
        headers: requestHeaders,
      })

      const duration = Date.now() - startTime

      // Parse response body
      const responseBody = await response.json()

      // Log response
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      this.logger.logResponse(method, url, response.status, responseHeaders, responseBody, duration)

      // Handle non-2xx responses
      if (!response.ok) {
        await this.handleErrorResponse(response.status, responseHeaders, responseBody)
      }

      return responseBody as T
    } catch (error) {
      const duration = Date.now() - startTime

      // If it's already one of our custom errors, log and re-throw it
      if (
        error instanceof AuthenticationError ||
        error instanceof RateLimitError ||
        error instanceof NetworkError
      ) {
        this.logger.logError(method, url, error, duration)
        throw error
      }

      // Wrap other errors in NetworkError
      const networkError = new NetworkError('Network request failed', undefined, undefined, {
        cause: error,
      })
      this.logger.logError(method, url, networkError, duration)
      throw networkError
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(
    statusCode: number,
    headers: Record<string, string>,
    errorBody: unknown,
  ): Promise<never> {
    // Try to parse error response
    let errorMessage = `HTTP ${statusCode} error`
    let apiErrorCode: number | undefined

    try {
      const contentType = headers['content-type']
      if (contentType?.includes('application/json')) {
        const parsedError = APIErrorSchema.safeParse(errorBody)

        if (parsedError.success) {
          apiErrorCode = parsedError.data.code
          errorMessage = parsedError.data.message
        }
      } else if (typeof errorBody === 'string') {
        errorMessage = errorBody
      }
    } catch {
      // Failed to parse error, use default message
    }

    // Throw appropriate error type based on status code
    switch (statusCode) {
      case 401:
      case 403:
        throw new AuthenticationError(errorMessage || 'Authentication failed', apiErrorCode)

      case 429: {
        // Rate limit - extract retry-after header
        const retryAfter = headers['retry-after']
        const retrySeconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined

        throw new RateLimitError(errorMessage || 'Rate limit exceeded', retrySeconds, apiErrorCode)
      }

      case 400:
      case 404:
      case 422:
        throw new NetworkError(errorMessage || 'Client error', statusCode, apiErrorCode)

      default:
        throw new NetworkError(errorMessage || 'Server error', statusCode, apiErrorCode)
    }
  }
}
