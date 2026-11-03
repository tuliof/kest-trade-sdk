// SPDX-License-Identifier: BSD-3-Clause
/**
 * Unified logging interface for kest-trade-sdk.
 * Used by HttpClient, token storage, and QuestradeClient.
 *
 * Default behavior is silent (SilentLogger) — no output unless configured.
 * Use ConsoleLogger with a LogLevel to enable console output, or provide
 * a custom Logger implementation to route logs to Datadog, CloudWatch, etc.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

export type LogContext = Record<string, unknown>

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

export class SilentLogger implements Logger {
  debug(_message: string, _context?: LogContext): void {}
  info(_message: string, _context?: LogContext): void {}
  warn(_message: string, _context?: LogContext): void {}
  error(_message: string, _context?: LogContext): void {}
}

export class ConsoleLogger implements Logger {
  private level: LogLevel

  constructor(level: LogLevel = 'info') {
    this.level = level
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.level === 'none') return false
    const order: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'none']
    return order.indexOf(level) >= order.indexOf(this.level)
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) console.debug(this.format('DEBUG', message, context))
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) console.info(this.format('INFO', message, context))
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) console.warn(this.format('WARN', message, context))
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) console.error(this.format('ERROR', message, context))
  }

  private format(level: string, message: string, context?: LogContext): string {
    if (!context || Object.keys(context).length === 0) return `[${level}] ${message}`
    return `[${level}] ${message} ${serializeContext(context)}`
  }
}

function toSerializable(value: unknown, ancestors: readonly object[]): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return String(value)
  if (value === null || typeof value !== 'object') return value
  if (ancestors.includes(value)) return '[Circular]'

  const lineage = [...ancestors, value]

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  }

  if (Array.isArray(value)) return value.map((item) => toSerializable(item, lineage))

  const entries = Object.entries(value).map(
    ([key, entryValue]) => [key, toSerializable(entryValue, lineage)] as const,
  )

  if (value instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      ...Object.fromEntries(entries),
    }
    if (value.cause !== undefined) serialized.cause = toSerializable(value.cause, lineage)
    return serialized
  }

  return Object.fromEntries(entries)
}

/**
 * Serialize a log context to JSON without ever throwing. Errors keep their
 * name, message, own properties and cause; BigInt and circular references
 * are rendered as strings.
 */
export function serializeContext(context: LogContext): string {
  try {
    return JSON.stringify(toSerializable(context, []))
  } catch (error) {
    return JSON.stringify({
      serializationError: error instanceof Error ? error.message : String(error),
    })
  }
}

export function createLogger(level?: LogLevel): Logger {
  if (!level || level === 'none') return new SilentLogger()
  return new ConsoleLogger(level)
}
