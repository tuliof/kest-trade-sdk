// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import {
  defaultRedactFn,
  formatErrorEntry,
  formatRequestEntry,
  formatResponseEntry,
  getResponseLogLevel,
  type HttpLogOptions,
  type LogEntry,
  redactToken,
} from '@/http/logger'

describe('redactToken', () => {
  test('should redact token keeping last 4 chars', () => {
    expect(redactToken('secret-token-1234')).toBe('[REDACTED]...1234')
  })

  test('should support custom visible chars', () => {
    expect(redactToken('secret-token-1234', 6)).toBe('[REDACTED]...n-1234')
  })

  test('should fully redact short tokens', () => {
    expect(redactToken('abc')).toBe('[REDACTED]')
  })

  test('should fully redact empty strings', () => {
    expect(redactToken('')).toBe('[REDACTED]')
  })

  test('should redact exactly visibleChars length', () => {
    expect(redactToken('1234', 4)).toBe('[REDACTED]...1234')
  })
})

describe('defaultRedactFn', () => {
  test('should redact Bearer Authorization header', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.example.com/test',
      requestHeaders: { Authorization: 'Bearer secret-token-1234' },
    }

    const redacted = defaultRedactFn(entry)
    expect(redacted.requestHeaders?.Authorization).toBe('Bearer [REDACTED]...1234')
  })

  test('should redact non-Bearer Authorization header', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.example.com/test',
      requestHeaders: { Authorization: 'basic-secret-creds' },
    }

    const redacted = defaultRedactFn(entry)
    expect(redacted.requestHeaders?.Authorization).toBe('[REDACTED]...reds')
  })

  test('should redact access_token in request body', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: 'POST',
      url: 'https://api.example.com/test',
      requestBody: { access_token: 'secret-token-1234', other: 'data' },
    }

    const redacted = defaultRedactFn(entry)
    const body = redacted.requestBody as { access_token: string; other: string }
    expect(body.access_token).toBe('[REDACTED]...1234')
    expect(body.other).toBe('data')
  })

  test('should redact refresh_token in response body', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.example.com/test',
      responseBody: {
        refresh_token: 'secret-refresh-token',
        api_server: 'https://api.example.com',
      },
    }

    const redacted = defaultRedactFn(entry)
    const body = redacted.responseBody as { refresh_token: string; api_server: string }
    expect(body.refresh_token).toBe('[REDACTED]...oken')
    expect(body.api_server).toBe('https://api.example.com')
  })

  test('should not modify entries without sensitive data', () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://api.example.com/test',
      requestHeaders: { 'Content-Type': 'application/json' },
    }

    const redacted = defaultRedactFn(entry)
    expect(redacted.requestHeaders?.['Content-Type']).toBe('application/json')
  })
})

describe('formatRequestEntry', () => {
  const options: HttpLogOptions = {
    logRequestHeaders: true,
    logRequestBody: true,
  }

  test('should format basic request entry', () => {
    const entry = formatRequestEntry('GET', 'https://api.example.com/test')
    expect(entry.method).toBe('GET')
    expect(entry.url).toBe('https://api.example.com/test')
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('should include headers when logRequestHeaders is true', () => {
    const headers = { Authorization: 'Bearer secret-token-1234' }
    const entry = formatRequestEntry(
      'GET',
      'https://api.example.com/test',
      headers,
      undefined,
      options,
    )
    expect(entry.requestHeaders?.Authorization).toBe('Bearer [REDACTED]...1234')
  })

  test('should exclude headers when logRequestHeaders is false', () => {
    const headers = { Authorization: 'Bearer token' }
    const entry = formatRequestEntry('GET', 'https://api.example.com/test', headers, undefined, {
      logRequestHeaders: false,
    })
    expect(entry.requestHeaders).toBeUndefined()
  })

  test('should include body when logRequestBody is true', () => {
    const body = { access_token: 'secret-token-1234', data: 'value' }
    const entry = formatRequestEntry(
      'POST',
      'https://api.example.com/test',
      undefined,
      body,
      options,
    )
    const requestBody = entry.requestBody as { access_token: string; data: string }
    expect(requestBody.access_token).toBe('[REDACTED]...1234')
    expect(requestBody.data).toBe('value')
  })

  test('should exclude body when logRequestBody is false', () => {
    const body = { data: 'value' }
    const entry = formatRequestEntry('POST', 'https://api.example.com/test', undefined, body, {
      logRequestBody: false,
    })
    expect(entry.requestBody).toBeUndefined()
  })

  test('should support custom redactFn', () => {
    const customRedact = (entry: LogEntry): LogEntry => ({
      ...entry,
      url: entry.url.replace(/password=\w+/, 'password=[HIDDEN]'),
    })

    const entry = formatRequestEntry(
      'GET',
      'https://api.example.com/test?password=secret123',
      undefined,
      undefined,
      { redactFn: customRedact },
    )
    expect(entry.url).toContain('password=[HIDDEN]')
  })
})

describe('formatResponseEntry', () => {
  const options: HttpLogOptions = {
    logResponseHeaders: true,
    logResponseBody: true,
  }

  test('should format response entry with status and duration', () => {
    const entry = formatResponseEntry(
      'GET',
      'https://api.example.com/test',
      200,
      {},
      null,
      100,
      options,
    )
    expect(entry.responseStatus).toBe(200)
    expect(entry.duration).toBe(100)
  })

  test('should include response headers when enabled', () => {
    const headers = { 'Content-Type': 'application/json' }
    const entry = formatResponseEntry(
      'GET',
      'https://api.example.com/test',
      200,
      headers,
      undefined,
      undefined,
      options,
    )
    expect(entry.responseHeaders?.['Content-Type']).toBe('application/json')
  })

  test('should exclude response headers when disabled', () => {
    const headers = { 'Content-Type': 'application/json' }
    const entry = formatResponseEntry(
      'GET',
      'https://api.example.com/test',
      200,
      headers,
      undefined,
      undefined,
      {
        logResponseHeaders: false,
      },
    )
    expect(entry.responseHeaders).toBeUndefined()
  })

  test('should include response body when enabled', () => {
    const body = { refresh_token: 'secret-refresh-token', data: 'value' }
    const entry = formatResponseEntry(
      'GET',
      'https://api.example.com/test',
      200,
      {},
      body,
      undefined,
      options,
    )
    const responseBody = entry.responseBody as { refresh_token: string; data: string }
    expect(responseBody.refresh_token).toBe('[REDACTED]...oken')
    expect(responseBody.data).toBe('value')
  })

  test('should exclude response body when disabled', () => {
    const body = { data: 'value' }
    const entry = formatResponseEntry(
      'GET',
      'https://api.example.com/test',
      200,
      {},
      body,
      undefined,
      {
        logResponseBody: false,
      },
    )
    expect(entry.responseBody).toBeUndefined()
  })
})

describe('formatErrorEntry', () => {
  test('should format error entry with error and duration', () => {
    const error = new Error('Test error')
    const entry = formatErrorEntry('POST', 'https://api.example.com/test', error, 150)
    expect(entry.method).toBe('POST')
    expect(entry.url).toBe('https://api.example.com/test')
    expect(entry.error).toBe(error)
    expect(entry.duration).toBe(150)
  })

  test('should format error entry without duration', () => {
    const error = new Error('Network error')
    const entry = formatErrorEntry('GET', 'https://api.example.com/test', error)
    expect(entry.error).toBe(error)
    expect(entry.duration).toBeUndefined()
  })
})

describe('getResponseLogLevel', () => {
  test('should return info for 2xx status', () => {
    expect(getResponseLogLevel(200)).toBe('info')
    expect(getResponseLogLevel(204)).toBe('info')
    expect(getResponseLogLevel(299)).toBe('info')
  })

  test('should return warn for 3xx status', () => {
    expect(getResponseLogLevel(301)).toBe('warn')
    expect(getResponseLogLevel(399)).toBe('warn')
  })

  test('should return warn for 4xx status', () => {
    expect(getResponseLogLevel(400)).toBe('warn')
    expect(getResponseLogLevel(404)).toBe('warn')
    expect(getResponseLogLevel(499)).toBe('warn')
  })

  test('should return error for 5xx status', () => {
    expect(getResponseLogLevel(500)).toBe('error')
    expect(getResponseLogLevel(503)).toBe('error')
    expect(getResponseLogLevel(599)).toBe('error')
  })
})
