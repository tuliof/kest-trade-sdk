// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { AccountSchema, AccountsResponseSchema } from '@/types/accounts'

describe('Account Types', () => {
  describe('AccountSchema', () => {
    test('should validate a valid account', () => {
      const validAccount = {
        type: 'TFSA',
        number: '52138123',
        status: 'Active',
        isPrimary: true,
        isBilling: true,
        clientAccountType: 'Individual',
      }

      const result = AccountSchema.safeParse(validAccount)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('TFSA')
        expect(result.data.number).toBe('52138123')
        expect(result.data.status).toBe('Active')
        expect(result.data.isPrimary).toBe(true)
      }
    })

    test('should reject account with missing required fields', () => {
      const invalidAccount = {
        type: 'TFSA',
        number: '52138123',
        // missing status
      }

      const result = AccountSchema.safeParse(invalidAccount)
      expect(result.success).toBe(false)
    })

    test('should handle boolean flags correctly', () => {
      const account = {
        type: 'RRSP',
        number: '12345678',
        status: 'Active',
        isPrimary: false,
        isBilling: false,
        clientAccountType: 'Joint',
      }

      const result = AccountSchema.safeParse(account)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isPrimary).toBe(false)
        expect(result.data.isBilling).toBe(false)
      }
    })
  })

  describe('AccountsResponseSchema', () => {
    test('should validate a valid accounts response', () => {
      const validResponse = {
        accounts: [
          {
            type: 'TFSA',
            number: '52138123',
            status: 'Active',
            isPrimary: true,
            isBilling: true,
            clientAccountType: 'Individual',
          },
        ],
        userId: 894475,
      }

      const result = AccountsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.accounts).toHaveLength(1)
        expect(result.data.userId).toBe(894475)
      }
    })

    test('should validate response with multiple accounts', () => {
      const validResponse = {
        accounts: [
          {
            type: 'TFSA',
            number: '52138123',
            status: 'Active',
            isPrimary: true,
            isBilling: true,
            clientAccountType: 'Individual',
          },
          {
            type: 'RRSP',
            number: '98765432',
            status: 'Active',
            isPrimary: false,
            isBilling: false,
            clientAccountType: 'Individual',
          },
        ],
        userId: 894475,
      }

      const result = AccountsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.accounts).toHaveLength(2)
      }
    })

    test('should validate response with empty accounts array', () => {
      const validResponse = {
        accounts: [],
        userId: 894475,
      }

      const result = AccountsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })

    test('should reject response without userId', () => {
      const invalidResponse = {
        accounts: [
          {
            type: 'TFSA',
            number: '52138123',
            status: 'Active',
            isPrimary: true,
            isBilling: true,
            clientAccountType: 'Individual',
          },
        ],
      }

      const result = AccountsResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })
  })
})
