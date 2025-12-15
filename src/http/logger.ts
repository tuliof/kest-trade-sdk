// SPDX-License-Identifier: BSD-3-Clause
/**
 * HTTP request/response logger for debugging and monitoring
 */

/**
 * Redact a token/password while keeping last few characters visible for identification
 * @param value - The sensitive value to redact
 * @param visibleChars - Number of characters to keep visible at the end (default: 4)
 * @returns Redacted string like "[REDACTED]...abc123"
 * @example
 * redactToken('secret_token_12345', 4) // Returns: "[REDACTED]...2345"
 */
export function redactToken(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) {
    return '[REDACTED]'
  }
  const lastChars = value.slice(-visibleChars)
  return `[REDACTED]...${lastChars}`
}

export interface LogEntry {
  timestamp: string
  method: string
  url: string
  requestHeaders?: Record<string, string>
  requestBody?: unknown
  responseStatus?: number
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  duration?: number
  error?: Error
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

export interface LoggerOptions {
  /**
   * Log level (default: 'none' - no logging)
   */
  level?: LogLevel

  /**
   * Whether to log request headers (default: false)
   * Note: Access tokens are automatically redacted, showing only last 4 characters for identification
   */
  logRequestHeaders?: boolean

  /**
   * Whether to log request bodies (default: false)
   */
  logRequestBody?: boolean

  /**
   * Whether to log response headers (default: false)
   */
  logResponseHeaders?: boolean

  /**
   * Whether to log response bodies (default: false)
   */
  logResponseBody?: boolean

  /**
   * Custom logger function (default: console.log)
   */
  logger?: (entry: LogEntry) => void

  /**
   * Filter function to redact sensitive information
   */
  redactFn?: (entry: LogEntry) => LogEntry
}

/**
 * Default redaction function to hide sensitive data
 * Keeps last 4 characters visible for token identification
 */
function defaultRedactFn(entry: LogEntry): LogEntry {
  const redacted = { ...entry }

  // Redact Authorization header but keep last 4 chars for identification
  if (redacted.requestHeaders?.Authorization) {
    const authValue = redacted.requestHeaders.Authorization
    // Handle "Bearer <token>" format
    if (authValue.startsWith('Bearer ')) {
      const token = authValue.substring(7)
      redacted.requestHeaders = {
        ...redacted.requestHeaders,
        Authorization: `Bearer ${redactToken(token)}`,
      }
    } else {
      redacted.requestHeaders = {
        ...redacted.requestHeaders,
        Authorization: redactToken(authValue),
      }
    }
  }

  // Redact access_token and refresh_token in request body
  if (redacted.requestBody && typeof redacted.requestBody === 'object') {
    const body = redacted.requestBody as Record<string, unknown>
    if (typeof body.access_token === 'string') {
      redacted.requestBody = { ...body, access_token: redactToken(body.access_token) }
    }
    if (typeof body.refresh_token === 'string') {
      redacted.requestBody = { ...body, refresh_token: redactToken(body.refresh_token) }
    }
  }

  // Redact tokens in response body
  if (redacted.responseBody && typeof redacted.responseBody === 'object') {
    const body = redacted.responseBody as Record<string, unknown>
    if (typeof body.access_token === 'string') {
      redacted.responseBody = { ...body, access_token: redactToken(body.access_token) }
    }
    if (typeof body.refresh_token === 'string') {
      redacted.responseBody = { ...body, refresh_token: redactToken(body.refresh_token) }
    }
  }

  return redacted
}

/**
 * HTTP Logger for request/response logging
 */
export class HttpLogger {
  private options: Required<LoggerOptions>

  constructor(options: LoggerOptions = {}) {
    this.options = {
      level: options.level ?? 'none',
      logRequestHeaders: options.logRequestHeaders ?? false,
      logRequestBody: options.logRequestBody ?? false,
      logResponseHeaders: options.logResponseHeaders ?? false,
      logResponseBody: options.logResponseBody ?? false,
      logger: options.logger ?? console.log,
      redactFn: options.redactFn ?? defaultRedactFn,
    }
  }

  /**
   * Check if logging is enabled for a given level
   */
  private shouldLog(level: LogLevel): boolean {
    if (this.options.level === 'none') return false

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none']
    const currentLevel = levels.indexOf(this.options.level)
    const requiredLevel = levels.indexOf(level)

    return requiredLevel >= currentLevel
  }

  /**
   * Log a request
   */
  public logRequest(
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: unknown,
  ): void {
    if (!this.shouldLog('debug')) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      requestHeaders: this.options.logRequestHeaders ? headers : undefined,
      requestBody: this.options.logRequestBody ? body : undefined,
    }

    const redacted = this.options.redactFn(entry)
    this.options.logger({
      ...redacted,
      type: '→ REQUEST',
    } as LogEntry & { type: string })
  }

  /**
   * Log a response
   */
  public logResponse(
    method: string,
    url: string,
    status: number,
    headers?: Record<string, string>,
    body?: unknown,
    duration?: number,
  ): void {
    const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info'
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      responseStatus: status,
      responseHeaders: this.options.logResponseHeaders ? headers : undefined,
      responseBody: this.options.logResponseBody ? body : undefined,
      duration,
    }

    const redacted = this.options.redactFn(entry)
    this.options.logger({
      ...redacted,
      type: '← RESPONSE',
    } as LogEntry & { type: string })
  }

  /**
   * Log an error
   */
  public logError(method: string, url: string, error: Error, duration?: number): void {
    if (!this.shouldLog('error')) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      error,
      duration,
    }

    const redacted = this.options.redactFn(entry)
    this.options.logger({
      ...redacted,
      type: '✖ ERROR',
    } as LogEntry & { type: string })
  }

  /**
   * Update logger options
   */
  public setOptions(options: Partial<LoggerOptions>): void {
    this.options = {
      ...this.options,
      ...options,
      logger: options.logger ?? this.options.logger,
      redactFn: options.redactFn ?? this.options.redactFn,
    }
  }

  /**
   * Get current logger options
   */
  public getOptions(): Readonly<Required<LoggerOptions>> {
    return { ...this.options }
  }
}
