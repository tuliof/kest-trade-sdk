// SPDX-License-Identifier: BSD-3-Clause
/**
 * HTTP log formatting utilities and redaction helpers.
 *
 * HttpLogger has been eliminated — HttpClient now calls Logger directly
 * with LogEntry objects formatted by the helpers below.
 */

export type { LogLevel } from '@/logger'

/**
 * Redact a token/password while keeping last few characters visible for identification
 * @param value - The sensitive value to redact
 * @param visibleChars - Number of characters to keep visible at the end (default: 4)
 * @returns Redacted string like "[REDACTED]...abc123"
 * @example
 * redactToken('secret_token_12345', 4) // Returns: "[REDACTED]...2345"
 */
export function redactToken(value: string, visibleChars = 4): string {
  if (!value || value.length < visibleChars) {
    return '[REDACTED]'
  }
  const lastChars = value.slice(-visibleChars)
  return `[REDACTED]...${lastChars}`
}

export interface LogEntry {
  [key: string]: unknown
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

/**
 * HTTP-specific log formatting options.
 * These control what data is included in LogEntry objects — they do NOT
 * control the log level or output destination (that's on the Logger interface).
 */
export interface HttpLogOptions {
  logRequestHeaders?: boolean
  logRequestBody?: boolean
  logResponseHeaders?: boolean
  logResponseBody?: boolean
  redactFn?: (entry: LogEntry) => LogEntry
}

/**
 * Default redaction function to hide sensitive data
 * Keeps last 4 characters visible for token identification
 */
export function defaultRedactFn(entry: LogEntry): LogEntry {
  const redacted = { ...entry }

  if (redacted.requestHeaders?.Authorization) {
    const authValue = redacted.requestHeaders.Authorization
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

  if (redacted.requestBody && typeof redacted.requestBody === 'object') {
    const body = redacted.requestBody as Record<string, unknown>
    if (typeof body.access_token === 'string') {
      redacted.requestBody = { ...body, access_token: redactToken(body.access_token) }
    }
    if (typeof body.refresh_token === 'string') {
      redacted.requestBody = { ...body, refresh_token: redactToken(body.refresh_token) }
    }
  }

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

function applyRedaction(entry: LogEntry, options?: HttpLogOptions): LogEntry {
  const redactFn = options?.redactFn ?? defaultRedactFn
  return redactFn(entry)
}

export function formatRequestEntry(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: unknown,
  options?: HttpLogOptions,
): LogEntry {
  return applyRedaction(
    {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      requestHeaders: options?.logRequestHeaders ? headers : undefined,
      requestBody: options?.logRequestBody ? body : undefined,
    },
    options,
  )
}

export function formatResponseEntry(
  method: string,
  url: string,
  status: number,
  headers?: Record<string, string>,
  body?: unknown,
  duration?: number,
  options?: HttpLogOptions,
): LogEntry {
  return applyRedaction(
    {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      responseStatus: status,
      responseHeaders: options?.logResponseHeaders ? headers : undefined,
      responseBody: options?.logResponseBody ? body : undefined,
      duration,
    },
    options,
  )
}

export function formatErrorEntry(
  method: string,
  url: string,
  error: Error,
  duration?: number,
  options?: HttpLogOptions,
): LogEntry {
  return applyRedaction(
    {
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url,
      error,
      duration,
    },
    options,
  )
}

export function getResponseLogLevel(status: number): 'error' | 'warn' | 'info' {
  if (status >= 500) return 'error'
  if (status >= 300) return 'warn'
  return 'info'
}
