// SPDX-License-Identifier: BSD-3-Clause
import { type Logger, SilentLogger } from '@/logger'
import { APIErrorSchema, AuthenticationError, NetworkError, RateLimitError } from '@/types/errors'
import {
  formatErrorEntry,
  formatRequestEntry,
  formatResponseEntry,
  getResponseLogLevel,
  type HttpLogOptions,
} from './logger'
import {
  assertValidRequestTimeout,
  DEFAULT_REQUEST_TIMEOUT_MS,
  describeTimeout,
  isTimeoutError,
} from './request-timeout'

const MAX_ERROR_MESSAGE_LENGTH = 200

/**
 * Raw text of a body that was declared as JSON but could not be parsed.
 */
class UnparseableBody {
  constructor(readonly text: string) {}
}

function truncate(text: string): string {
  return text.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : text
}

/**
 * Turn the raw response text into a trusted value.
 * - empty body: undefined (e.g. 204)
 * - JSON content type: the parsed value, or UnparseableBody if malformed
 * - anything else (HTML error pages, plain text): the raw string
 */
function parseResponseBody(rawBody: string, contentType: string | undefined): unknown {
  if (rawBody === '') return undefined
  if (!contentType || !/json/i.test(contentType)) return new UnparseableBody(rawBody)
  try {
    return JSON.parse(rawBody)
  } catch {
    return new UnparseableBody(rawBody)
  }
}

/**
 * HTTP Client for making requests to the Questrade API
 * Uses native fetch with Bearer token authentication
 */
export class HttpClient {
  private apiServer: string
  private accessToken: string
  private logger: Logger
  private logOptions: HttpLogOptions
  private readonly requestTimeoutMs: number

  /**
   * Create a new HTTP client
   * @param apiServer - The API server URL (e.g., "https://api01.iq.questrade.com/")
   * @param accessToken - The Bearer access token
   * @param logger - Logger for request/response/error logging (default: silent)
   * @param logOptions - HTTP-specific log formatting options
   * @param requestTimeoutMs - Abort a request and throw NetworkError after this many ms (default: 30000)
   */
  constructor(
    apiServer: string,
    accessToken: string,
    logger: Logger = new SilentLogger(),
    logOptions: HttpLogOptions = {},
    requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.apiServer = HttpClient.normalizeApiServer(apiServer)
    this.accessToken = accessToken
    this.logger = logger
    this.logOptions = logOptions
    this.requestTimeoutMs = assertValidRequestTimeout(requestTimeoutMs)
  }

  private static normalizeApiServer(apiServer: string): string {
    return apiServer.endsWith('/') ? apiServer.slice(0, -1) : apiServer
  }

  /**
   * Replace the API server and access token together. Questrade returns both
   * on every token refresh, and the server can change between refreshes.
   * @param apiServer - The API server URL
   * @param accessToken - The new Bearer access token
   */
  public updateCredentials(apiServer: string, accessToken: string): void {
    this.apiServer = HttpClient.normalizeApiServer(apiServer)
    this.accessToken = accessToken
  }

  /**
   * Update the access token (useful after token refresh)
   * @param accessToken - The new access token
   */
  public setAccessToken(accessToken: string): void {
    this.accessToken = accessToken
  }

  /**
   * Update the logger
   * @param logger - New logger instance
   */
  public setLogger(logger: Logger): void {
    this.logger = logger
  }

  /**
   * Update HTTP log formatting options; applies to subsequent requests
   * @param logOptions - New HTTP log options
   */
  public setLogOptions(logOptions: HttpLogOptions): void {
    this.logOptions = logOptions
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
    this.logger.debug(
      'HTTP Request',
      formatRequestEntry(method, url, requestHeaders, options.body, this.logOptions),
    )

    try {
      const response = await fetch(url, {
        ...options,
        headers: requestHeaders,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      const responseBody = parseResponseBody(await response.text(), responseHeaders['content-type'])

      const duration = Date.now() - startTime

      this.logResponse(
        method,
        url,
        response.status,
        responseHeaders,
        responseBody instanceof UnparseableBody ? responseBody.text : responseBody,
        duration,
      )

      if (!response.ok) {
        await this.handleErrorResponse(response.status, responseHeaders, responseBody)
      }

      if (responseBody instanceof UnparseableBody) {
        throw new NetworkError(
          `Expected a JSON response but received ${responseHeaders['content-type'] ?? 'no content type'}: ${truncate(responseBody.text)}`,
          response.status,
        )
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
        this.logger.error(
          'HTTP Error',
          formatErrorEntry(method, url, error, duration, this.logOptions),
        )
        throw error
      }

      const networkError = new NetworkError(
        isTimeoutError(error)
          ? describeTimeout(url, this.requestTimeoutMs)
          : 'Network request failed',
        undefined,
        undefined,
        { cause: error },
      )
      this.logger.error(
        'HTTP Error',
        formatErrorEntry(method, url, networkError, duration, this.logOptions),
      )
      throw networkError
    }
  }

  /**
   * Log the response line (status, url, duration) at a status-derived level.
   * The body is financial data, so it is only emitted separately at debug level.
   */
  private logResponse(
    method: string,
    url: string,
    status: number,
    headers: Record<string, string>,
    body: unknown,
    duration: number,
  ): void {
    const level = getResponseLogLevel(status)
    const summary = formatResponseEntry(method, url, status, headers, undefined, duration, {
      ...this.logOptions,
      logResponseBody: false,
    })
    this.logger[level]('HTTP Response', summary)

    if (!this.logOptions.logResponseBody) return
    this.logger.debug(
      'HTTP Response Body',
      formatResponseEntry(method, url, status, headers, body, duration, this.logOptions),
    )
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(
    statusCode: number,
    headers: Record<string, string>,
    errorBody: unknown,
  ): Promise<never> {
    let errorMessage = `HTTP ${statusCode} error`
    let apiErrorCode: number | undefined

    if (errorBody instanceof UnparseableBody) {
      errorMessage = truncate(errorBody.text)
    } else if (typeof errorBody === 'string') {
      errorMessage = truncate(errorBody)
    } else {
      const parsedError = APIErrorSchema.safeParse(errorBody)
      if (parsedError.success) {
        apiErrorCode = parsedError.data.code
        errorMessage = parsedError.data.message
      }
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
