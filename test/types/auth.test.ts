// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { TokenResponseSchema } from '@/types/auth'

describe('Auth Types', () => {
  describe('TokenResponseSchema', () => {
    test('should validate a valid token response', () => {
      const validResponse = {
        access_token: '5SCj_tI4CgfHwJofgRJdwcr1CaynQjKo0',
        api_server: 'https://api01.iq.questrade.com/',
        expires_in: 1800,
        refresh_token: 'lKylz9dXEDwx_tmGdQict1AnwgRM6XqM0',
        token_type: 'Bearer',
      }

      const result = TokenResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.access_token).toBe(validResponse.access_token)
        expect(result.data.api_server).toBe(validResponse.api_server)
        expect(result.data.expires_in).toBe(validResponse.expires_in)
        expect(result.data.refresh_token).toBe(validResponse.refresh_token)
        expect(result.data.token_type).toBe('Bearer')
      }
    })

    test('should reject response with missing access_token', () => {
      const invalidResponse = {
        api_server: 'https://api01.iq.questrade.com/',
        expires_in: 1800,
        refresh_token: 'lKylz9dXEDwx_tmGdQict1AnwgRM6XqM0',
        token_type: 'Bearer',
      }

      const result = TokenResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    test('should reject response with invalid expires_in type', () => {
      const invalidResponse = {
        access_token: '5SCj_tI4CgfHwJofgRJdwcr1CaynQjKo0',
        api_server: 'https://api01.iq.questrade.com/',
        expires_in: '1800', // should be number
        refresh_token: 'lKylz9dXEDwx_tmGdQict1AnwgRM6XqM0',
        token_type: 'Bearer',
      }

      const result = TokenResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    test('should reject response with invalid api_server URL', () => {
      const invalidResponse = {
        access_token: '5SCj_tI4CgfHwJofgRJdwcr1CaynQjKo0',
        api_server: 'not-a-valid-url',
        expires_in: 1800,
        refresh_token: 'lKylz9dXEDwx_tmGdQict1AnwgRM6XqM0',
        token_type: 'Bearer',
      }

      const result = TokenResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    test('should accept token_type Bearer', () => {
      const validResponse = {
        access_token: '5SCj_tI4CgfHwJofgRJdwcr1CaynQjKo0',
        api_server: 'https://api01.iq.questrade.com/',
        expires_in: 1800,
        refresh_token: 'lKylz9dXEDwx_tmGdQict1AnwgRM6XqM0',
        token_type: 'Bearer',
      }

      const result = TokenResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })
})
