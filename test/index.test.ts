// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import * as sdk from '@/index'

describe('public exports', () => {
  test('should export Zod schemas for consumer reuse', () => {
    const schemaNames = Object.keys(sdk).filter((name) => name.endsWith('Schema'))

    expect(schemaNames).toContain('TokenResponseSchema')
    expect(schemaNames).toContain('AccountsResponseSchema')
    expect(schemaNames).toContain('OrderStateFilterSchema')
    expect(schemaNames).toContain('APIErrorSchema')
    for (const name of schemaNames) {
      const schema = (sdk as unknown as Record<string, { safeParse?: unknown }>)[name]
      expect(typeof schema?.safeParse).toBe('function')
    }
  })

  test('should parse a valid payload with an exported schema', () => {
    const result = sdk.TokenResponseSchema.safeParse({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 1800,
      api_server: 'https://api01.iq.questrade.com/',
    })
    expect(result.success).toBe(true)
  })

  test('should reject a token response whose api_server is not a URL', () => {
    const result = sdk.TokenResponseSchema.safeParse({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 1800,
      api_server: 'not a url',
    })
    expect(result.success).toBe(false)
  })
})
