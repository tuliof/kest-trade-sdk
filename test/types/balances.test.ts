// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { BalanceSchema, BalancesResponseSchema } from '@/types/balances'

describe('Balance Types', () => {
  describe('BalanceSchema', () => {
    test('should validate a valid balance', () => {
      const validBalance = {
        currency: 'CAD',
        cash: 359.8815,
        marketValue: 12211.91,
        totalEquity: 12571.7915,
        buyingPower: 359.8815,
        maintenanceExcess: 359.8815,
        isRealTime: true,
      }

      const result = BalanceSchema.safeParse(validBalance)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currency).toBe('CAD')
        expect(result.data.cash).toBe(359.8815)
        expect(result.data.isRealTime).toBe(true)
      }
    })

    test('should validate balance with USD currency', () => {
      const usdBalance = {
        currency: 'USD',
        cash: 0,
        marketValue: 0,
        totalEquity: 0,
        buyingPower: 0,
        maintenanceExcess: 0,
        isRealTime: true,
      }

      const result = BalanceSchema.safeParse(usdBalance)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currency).toBe('USD')
      }
    })

    test('should reject balance with invalid currency', () => {
      const invalidBalance = {
        currency: 'EUR', // Not supported by Questrade
        cash: 100,
        marketValue: 1000,
        totalEquity: 1100,
        buyingPower: 100,
        maintenanceExcess: 100,
        isRealTime: true,
      }

      const result = BalanceSchema.safeParse(invalidBalance)
      expect(result.success).toBe(false)
    })

    test('should handle negative values (allowed for cash)', () => {
      const balanceWithMargin = {
        currency: 'CAD',
        cash: -500.5,
        marketValue: 5000,
        totalEquity: 4500,
        buyingPower: 1000,
        maintenanceExcess: 200,
        isRealTime: false,
      }

      const result = BalanceSchema.safeParse(balanceWithMargin)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.cash).toBe(-500.5)
        expect(result.data.isRealTime).toBe(false)
      }
    })

    test('should reject balance with missing required fields', () => {
      const invalidBalance = {
        currency: 'CAD',
        cash: 100,
        // missing marketValue and others
      }

      const result = BalanceSchema.safeParse(invalidBalance)
      expect(result.success).toBe(false)
    })
  })

  describe('BalancesResponseSchema', () => {
    test('should validate a complete balances response', () => {
      const validResponse = {
        perCurrencyBalances: [
          {
            currency: 'CAD',
            cash: 359.8815,
            marketValue: 12211.91,
            totalEquity: 12571.7915,
            buyingPower: 359.8815,
            maintenanceExcess: 359.8815,
            isRealTime: true,
          },
          {
            currency: 'USD',
            cash: 0,
            marketValue: 0,
            totalEquity: 0,
            buyingPower: 0,
            maintenanceExcess: 0,
            isRealTime: true,
          },
        ],
        combinedBalances: [
          {
            currency: 'CAD',
            cash: 359.8815,
            marketValue: 12211.91,
            totalEquity: 12571.7915,
            buyingPower: 359.8815,
            maintenanceExcess: 359.8815,
            isRealTime: true,
          },
        ],
        sodPerCurrencyBalances: [
          {
            currency: 'CAD',
            cash: 359.88,
            marketValue: 12223.62,
            totalEquity: 12583.5,
            buyingPower: 359.8815,
            maintenanceExcess: 359.8815,
            isRealTime: true,
          },
        ],
        sodCombinedBalances: [
          {
            currency: 'USD',
            cash: 256.608079,
            marketValue: 8715.90431,
            totalEquity: 8972.512389,
            buyingPower: 250.962492,
            maintenanceExcess: 250.962492,
            isRealTime: true,
          },
        ],
      }

      const result = BalancesResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.perCurrencyBalances).toHaveLength(2)
        expect(result.data.combinedBalances).toHaveLength(1)
        expect(result.data.sodPerCurrencyBalances).toHaveLength(1)
        expect(result.data.sodCombinedBalances).toHaveLength(1)
      }
    })

    test('should reject response with missing required arrays', () => {
      const invalidResponse = {
        perCurrencyBalances: [],
        // missing other required arrays
      }

      const result = BalancesResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    test('should handle empty balance arrays', () => {
      const emptyResponse = {
        perCurrencyBalances: [],
        combinedBalances: [],
        sodPerCurrencyBalances: [],
        sodCombinedBalances: [],
      }

      const result = BalancesResponseSchema.safeParse(emptyResponse)
      expect(result.success).toBe(true)
    })
  })
})
