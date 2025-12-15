// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Schema for API error responses
 */
export const APIErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
})

/**
 * Type inferred from APIErrorSchema
 */
export type APIError = z.infer<typeof APIErrorSchema>

/**
 * Base error class for all Questrade SDK errors
 */
export class QuestradeError extends Error {
  public readonly apiErrorCode?: number

  constructor(message: string, apiErrorCode?: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'QuestradeError'
    this.apiErrorCode = apiErrorCode
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends QuestradeError {
  constructor(message: string, apiErrorCode?: number, options?: ErrorOptions) {
    super(message, apiErrorCode, options)
    this.name = 'AuthenticationError'
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends QuestradeError {
  public readonly retryAfter?: number

  constructor(message: string, retryAfter?: number, apiErrorCode?: number, options?: ErrorOptions) {
    super(message, apiErrorCode, options)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends QuestradeError {
  public readonly details?: unknown

  constructor(message: string, details?: unknown, apiErrorCode?: number, options?: ErrorOptions) {
    super(message, apiErrorCode, options)
    this.name = 'ValidationError'
    this.details = details
  }
}

/**
 * Error thrown when network request fails
 */
export class NetworkError extends QuestradeError {
  public readonly statusCode?: number

  constructor(message: string, statusCode?: number, apiErrorCode?: number, options?: ErrorOptions) {
    super(message, apiErrorCode, options)
    this.name = 'NetworkError'
    this.statusCode = statusCode
  }
}
