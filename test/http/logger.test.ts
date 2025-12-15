// SPDX-License-Identifier: BSD-3-Clause
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { HttpLogger, type LogEntry, type LoggerOptions } from '@/http/logger'

describe('HttpLogger', () => {
  let logger: HttpLogger
  let mockLogFn: ReturnType<typeof mock>

  beforeEach(() => {
    mockLogFn = mock(() => {})
  })

  describe('Constructor and Configuration', () => {
    test('should create logger with default options', () => {
      logger = new HttpLogger()
      const options = logger.getOptions()

      expect(options.level).toBe('none')
      expect(options.logRequestHeaders).toBe(false)
      expect(options.logRequestBody).toBe(false)
      expect(options.logResponseHeaders).toBe(false)
      expect(options.logResponseBody).toBe(false)
    })

    test('should create logger with custom options', () => {
      const customOptions: LoggerOptions = {
        level: 'debug',
        logRequestHeaders: true,
        logRequestBody: true,
        logResponseHeaders: true,
        logResponseBody: true,
        logger: mockLogFn,
      }

      logger = new HttpLogger(customOptions)
      const options = logger.getOptions()

      expect(options.level).toBe('debug')
      expect(options.logRequestHeaders).toBe(true)
      expect(options.logRequestBody).toBe(true)
      expect(options.logResponseHeaders).toBe(true)
      expect(options.logResponseBody).toBe(true)
    })

    test('should update logger options', () => {
      logger = new HttpLogger()
      logger.setOptions({ level: 'info', logRequestBody: true })

      const options = logger.getOptions()
      expect(options.level).toBe('info')
      expect(options.logRequestBody).toBe(true)
    })
  })

  describe('Logging Levels', () => {
    test('should not log anything when level is "none"', () => {
      logger = new HttpLogger({ level: 'none', logger: mockLogFn })

      logger.logRequest('GET', 'https://api.example.com/test')
      logger.logResponse('GET', 'https://api.example.com/test', 200)
      logger.logError('GET', 'https://api.example.com/test', new Error('Test'))

      expect(mockLogFn).not.toHaveBeenCalled()
    })

    test('should log requests at debug level', () => {
      logger = new HttpLogger({ level: 'debug', logger: mockLogFn })

      logger.logRequest('GET', 'https://api.example.com/test')

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry & { type: string }
      expect(logEntry.type).toBe('→ REQUEST')
      expect(logEntry.method).toBe('GET')
      expect(logEntry.url).toBe('https://api.example.com/test')
    })

    test('should log successful responses at info level', () => {
      logger = new HttpLogger({ level: 'info', logger: mockLogFn })

      logger.logResponse('GET', 'https://api.example.com/test', 200, {}, null, 100)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry & { type: string }
      expect(logEntry.type).toBe('← RESPONSE')
      expect(logEntry.responseStatus).toBe(200)
      expect(logEntry.duration).toBe(100)
    })

    test('should log errors at error level', () => {
      logger = new HttpLogger({ level: 'error', logger: mockLogFn })

      const error = new Error('Test error')
      logger.logError('POST', 'https://api.example.com/test', error, 150)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry & { type: string }
      expect(logEntry.type).toBe('✖ ERROR')
      expect(logEntry.error).toBe(error)
      expect(logEntry.duration).toBe(150)
    })

    test('should log 4xx responses at error level', () => {
      logger = new HttpLogger({ level: 'error', logger: mockLogFn })

      logger.logResponse('GET', 'https://api.example.com/test', 404)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry & { type: string }
      expect(logEntry.responseStatus).toBe(404)
    })
  })

  describe('Redaction', () => {
    test('should redact Authorization header but keep last 4 chars', () => {
      logger = new HttpLogger({
        level: 'debug',
        logRequestHeaders: true,
        logger: mockLogFn,
      })

      const headers = { Authorization: 'Bearer secret-token-123' }
      logger.logRequest('GET', 'https://api.example.com/test', headers)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      expect(logEntry.requestHeaders?.Authorization).toBe('Bearer [REDACTED]...-123')
    })

    test('should redact access_token in request body but keep last 4 chars', () => {
      logger = new HttpLogger({
        level: 'debug',
        logRequestBody: true,
        logger: mockLogFn,
      })

      const body = { access_token: 'secret-token', other: 'data' }
      logger.logRequest('POST', 'https://api.example.com/test', undefined, body)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      const requestBody = logEntry.requestBody as { access_token: string; other: string }
      expect(requestBody.access_token).toBe('[REDACTED]...oken')
      expect(requestBody.other).toBe('data')
    })

    test('should redact refresh_token in response body but keep last 4 chars', () => {
      logger = new HttpLogger({
        level: 'info',
        logResponseBody: true,
        logger: mockLogFn,
      })

      const body = {
        refresh_token: 'secret-refresh-token',
        api_server: 'https://api.example.com',
      }
      logger.logResponse('GET', 'https://api.example.com/test', 200, {}, body)

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      const responseBody = logEntry.responseBody as { refresh_token: string; api_server: string }
      expect(responseBody.refresh_token).toBe('[REDACTED]...oken')
      expect(responseBody.api_server).toBe('https://api.example.com')
    })

    test('should allow custom redaction function', () => {
      const customRedact = (entry: LogEntry): LogEntry => {
        return {
          ...entry,
          url: entry.url.replace(/password=\w+/, 'password=[HIDDEN]'),
        }
      }

      logger = new HttpLogger({
        level: 'debug',
        logger: mockLogFn,
        redactFn: customRedact,
      })

      logger.logRequest('GET', 'https://api.example.com/test?password=secret123')

      expect(mockLogFn).toHaveBeenCalledTimes(1)
      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      expect(logEntry.url).toContain('password=[HIDDEN]')
    })
  })

  describe('Selective Logging', () => {
    test('should not log headers when logRequestHeaders is false', () => {
      logger = new HttpLogger({
        level: 'debug',
        logRequestHeaders: false,
        logger: mockLogFn,
      })

      logger.logRequest('GET', 'https://api.example.com/test', { Authorization: 'Bearer token' })

      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      expect(logEntry.requestHeaders).toBeUndefined()
    })

    test('should not log response body when logResponseBody is false', () => {
      logger = new HttpLogger({
        level: 'info',
        logResponseBody: false,
        logger: mockLogFn,
      })

      logger.logResponse('GET', 'https://api.example.com/test', 200, {}, { data: 'test' })

      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      expect(logEntry.responseBody).toBeUndefined()
    })
  })

  describe('Timestamps', () => {
    test('should include timestamp in log entries', () => {
      logger = new HttpLogger({ level: 'debug', logger: mockLogFn })

      logger.logRequest('GET', 'https://api.example.com/test')

      const logEntry = mockLogFn.mock.calls[0]?.[0] as LogEntry
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
  })
})
