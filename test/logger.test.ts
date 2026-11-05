// SPDX-License-Identifier: BSD-3-Clause
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  ConsoleLogger,
  createLogger,
  type LogContext,
  type Logger,
  SilentLogger,
  serializeContext,
} from '@/logger'

describe('SilentLogger', () => {
  const logger = new SilentLogger()

  test('all methods are no-ops (do not throw)', () => {
    expect(() => logger.debug('msg')).not.toThrow()
    expect(() => logger.info('msg')).not.toThrow()
    expect(() => logger.warn('msg')).not.toThrow()
    expect(() => logger.error('msg')).not.toThrow()
  })

  test('accepts context without throwing', () => {
    expect(() => logger.info('msg', { key: 'value' })).not.toThrow()
  })
})

describe('ConsoleLogger', () => {
  let consoleDebug: ReturnType<typeof mock>
  let consoleInfo: ReturnType<typeof mock>
  let consoleWarn: ReturnType<typeof mock>
  let consoleError: ReturnType<typeof mock>

  beforeEach(() => {
    consoleDebug = mock(() => {})
    consoleInfo = mock(() => {})
    consoleWarn = mock(() => {})
    consoleError = mock(() => {})
    globalThis.console.debug = consoleDebug as typeof console.debug
    globalThis.console.info = consoleInfo as typeof console.info
    globalThis.console.warn = consoleWarn as typeof console.warn
    globalThis.console.error = consoleError as typeof console.error
  })

  afterEach(() => {
    globalThis.console.debug = console.debug
    globalThis.console.info = console.info
    globalThis.console.warn = console.warn
    globalThis.console.error = console.error
  })

  test('silent by default when level is none', () => {
    const logger = new ConsoleLogger('none')
    logger.debug('msg')
    logger.info('msg')
    logger.warn('msg')
    logger.error('msg')
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  test('debug level enables all log levels', () => {
    const logger = new ConsoleLogger('debug')
    logger.debug('debug-msg')
    logger.info('info-msg')
    logger.warn('warn-msg')
    logger.error('error-msg')
    expect(consoleDebug).toHaveBeenCalledTimes(1)
    expect(consoleInfo).toHaveBeenCalledTimes(1)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  test('info level disables debug', () => {
    const logger = new ConsoleLogger('info')
    logger.debug('msg')
    logger.info('msg')
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(consoleInfo).toHaveBeenCalledTimes(1)
  })

  test('warn level disables debug and info', () => {
    const logger = new ConsoleLogger('warn')
    logger.debug('msg')
    logger.info('msg')
    logger.warn('msg')
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })

  test('error level disables debug, info, and warn', () => {
    const logger = new ConsoleLogger('error')
    logger.debug('msg')
    logger.info('msg')
    logger.warn('msg')
    logger.error('msg')
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  test('formats message with level prefix', () => {
    const logger = new ConsoleLogger('info')
    logger.info('Token stored')
    expect(consoleInfo.mock.calls[0]?.[0]).toBe('[INFO] Token stored')
  })

  test('formats message with context as JSON', () => {
    const logger = new ConsoleLogger('info')
    logger.info('Token stored', { backend: 'secure' })
    const output = consoleInfo.mock.calls[0]?.[0] as string
    expect(output).toContain('[INFO] Token stored')
    expect(output).toContain('"backend":"secure"')
  })

  test('omits context when empty object', () => {
    const logger = new ConsoleLogger('info')
    logger.info('msg', {})
    const output = consoleInfo.mock.calls[0]?.[0] as string
    expect(output).toBe('[INFO] msg')
  })

  test('setLevel changes the active level dynamically', () => {
    const logger = new ConsoleLogger('error')
    logger.info('before')
    expect(consoleInfo).not.toHaveBeenCalled()

    logger.setLevel('info')
    logger.info('after')
    expect(consoleInfo).toHaveBeenCalledTimes(1)
  })

  test('uses correct console method per level', () => {
    const logger = new ConsoleLogger('debug')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(consoleDebug).toHaveBeenCalledTimes(1)
    expect(consoleInfo).toHaveBeenCalledTimes(1)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})

describe('createLogger', () => {
  test('returns SilentLogger for undefined', () => {
    expect(createLogger(undefined)).toBeInstanceOf(SilentLogger)
  })

  test('returns SilentLogger for none', () => {
    expect(createLogger('none')).toBeInstanceOf(SilentLogger)
  })

  test('returns ConsoleLogger for debug', () => {
    const logger = createLogger('debug')
    expect(logger).toBeInstanceOf(ConsoleLogger)
  })

  test('returns ConsoleLogger for info', () => {
    expect(createLogger('info')).toBeInstanceOf(ConsoleLogger)
  })

  test('returns ConsoleLogger for warn', () => {
    expect(createLogger('warn')).toBeInstanceOf(ConsoleLogger)
  })

  test('returns ConsoleLogger for error', () => {
    expect(createLogger('error')).toBeInstanceOf(ConsoleLogger)
  })
})

describe('Logger interface compliance', () => {
  const loggers: Array<{ name: string; logger: Logger }> = [
    { name: 'SilentLogger', logger: new SilentLogger() },
    { name: 'ConsoleLogger', logger: new ConsoleLogger('debug') },
    { name: 'createLogger(none)', logger: createLogger('none') },
    { name: 'createLogger(debug)', logger: createLogger('debug') },
  ]

  for (const { name, logger } of loggers) {
    test(`${name}: implements all four log methods`, () => {
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')

      expect(() => logger.debug('msg', { ctx: true } as LogContext)).not.toThrow()
      expect(() => logger.info('msg', { ctx: true } as LogContext)).not.toThrow()
      expect(() => logger.warn('msg', { ctx: true } as LogContext)).not.toThrow()
      expect(() => logger.error('msg', { ctx: true } as LogContext)).not.toThrow()
    })
  }
})

describe('serializeContext', () => {
  test('should keep name, message and own properties of Errors', () => {
    const error = Object.assign(new Error('boom'), { statusCode: 502 })
    const parsed = JSON.parse(serializeContext({ error }))
    expect(parsed.error).toEqual({ name: 'Error', message: 'boom', statusCode: 502 })
  })

  test('should serialize the cause chain of Errors', () => {
    const error = new Error('outer', { cause: new TypeError('inner') })
    const parsed = JSON.parse(serializeContext({ error }))
    expect(parsed.error.cause).toEqual({ name: 'TypeError', message: 'inner' })
  })

  test('should render BigInt values as strings', () => {
    const parsed = JSON.parse(serializeContext({ volume: 12345678901234567890n }))
    expect(parsed.volume).toBe('12345678901234567890')
  })

  test('should mark circular references instead of throwing', () => {
    const node: Record<string, unknown> = { name: 'root' }
    node.self = node
    const parsed = JSON.parse(serializeContext({ node }))
    expect(parsed.node).toEqual({ name: 'root', self: '[Circular]' })
  })

  test('should not flag repeated non-circular references', () => {
    const shared = { a: 1 }
    const parsed = JSON.parse(serializeContext({ first: shared, second: shared }))
    expect(parsed).toEqual({ first: { a: 1 }, second: { a: 1 } })
  })

  test('should not throw when a getter throws', () => {
    const hostile = {
      get value(): string {
        throw new Error('getter failed')
      },
    }
    expect(() => serializeContext({ hostile })).not.toThrow()
    expect(serializeContext({ hostile })).toContain('getter failed')
  })

  test('should serialize dates as ISO strings and keep plain values', () => {
    const parsed = JSON.parse(
      serializeContext({ at: new Date('2024-01-02T03:04:05.000Z'), n: 1, s: 'x', nil: null }),
    )
    expect(parsed).toEqual({ at: '2024-01-02T03:04:05.000Z', n: 1, s: 'x', nil: null })
  })
})

describe('ConsoleLogger with hostile contexts', () => {
  test('should include the Error message and never throw', () => {
    const originalError = console.error
    const lines: string[] = []
    console.error = ((line: string) => lines.push(line)) as typeof console.error
    try {
      const circular: Record<string, unknown> = {}
      circular.self = circular
      const logger = new ConsoleLogger('debug')
      expect(() =>
        logger.error('failed', { error: new Error('disk full'), circular, big: 1n }),
      ).not.toThrow()
      expect(lines[0]).toContain('disk full')
      expect(lines[0]).toContain('[Circular]')
    } finally {
      console.error = originalError
    }
  })
})
