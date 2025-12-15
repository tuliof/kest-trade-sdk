// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import {
  APIErrorSchema,
  AuthenticationError,
  NetworkError,
  QuestradeError,
  RateLimitError,
  ValidationError,
} from '@/types/errors'

describe('Error Types', () => {
  describe('APIErrorSchema', () => {
    test('should validate a basic API error response', () => {
      const errorResponse = {
        code: 1001,
        message: 'Invalid request',
      }

      const result = APIErrorSchema.safeParse(errorResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe(1001)
        expect(result.data.message).toBe('Invalid request')
      }
    })

    test('should reject error without code', () => {
      const invalidError = {
        message: 'Invalid request',
      }

      const result = APIErrorSchema.safeParse(invalidError)
      expect(result.success).toBe(false)
    })

    test('should reject error without message', () => {
      const invalidError = {
        code: 1001,
      }

      const result = APIErrorSchema.safeParse(invalidError)
      expect(result.success).toBe(false)
    })
  })

  describe('Custom Error Classes', () => {
    test('QuestradeError should store message and apiErrorCode', () => {
      const error = new QuestradeError('Something went wrong', 1001, {
        cause: new Error('Original error'),
      })

      expect(error.message).toBe('Something went wrong')
      expect(error.name).toBe('QuestradeError')
      expect(error.apiErrorCode).toBe(1001)
      expect(error.cause).toBeInstanceOf(Error)
    })

    test('AuthenticationError should store apiErrorCode', () => {
      const error = new AuthenticationError('Invalid token', 1002)

      expect(error.message).toBe('Invalid token')
      expect(error.name).toBe('AuthenticationError')
      expect(error.apiErrorCode).toBe(1002)
      expect(error).toBeInstanceOf(QuestradeError)
    })

    test('RateLimitError should store retryAfter and apiErrorCode', () => {
      const error = new RateLimitError('Rate limit exceeded', 60, 1003)

      expect(error.message).toBe('Rate limit exceeded')
      expect(error.name).toBe('RateLimitError')
      expect(error.retryAfter).toBe(60)
      expect(error.apiErrorCode).toBe(1003)
      expect(error).toBeInstanceOf(QuestradeError)
    })

    test('ValidationError should store validation details and apiErrorCode', () => {
      const validationDetails = {
        field: 'expires_in',
        error: 'must be positive',
      }
      const error = new ValidationError('Validation failed', validationDetails, 1004)

      expect(error.message).toBe('Validation failed')
      expect(error.name).toBe('ValidationError')
      expect(error.details).toEqual(validationDetails)
      expect(error.apiErrorCode).toBe(1004)
      expect(error).toBeInstanceOf(QuestradeError)
    })

    test('NetworkError should store status code and apiErrorCode', () => {
      const error = new NetworkError('Network request failed', 500, 5000)

      expect(error.message).toBe('Network request failed')
      expect(error.name).toBe('NetworkError')
      expect(error.statusCode).toBe(500)
      expect(error.apiErrorCode).toBe(5000)
      expect(error).toBeInstanceOf(QuestradeError)
    })

    test('NetworkError should work without status code or apiErrorCode', () => {
      const error = new NetworkError('Connection timeout')

      expect(error.message).toBe('Connection timeout')
      expect(error.statusCode).toBeUndefined()
      expect(error.apiErrorCode).toBeUndefined()
    })
  })
})
