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
    return `[${level}] ${message} ${JSON.stringify(context)}`
  }
}

export function createLogger(level?: LogLevel): Logger {
  if (!level || level === 'none') return new SilentLogger()
  return new ConsoleLogger(level)
}
