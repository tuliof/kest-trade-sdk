// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import {
  ActivitiesResponseSchema,
  ActivitySchema,
  ExecutionSchema,
  ExecutionsResponseSchema,
  OrderSchema,
  OrdersResponseSchema,
  PositionSchema,
  PositionsResponseSchema,
} from '@/types/positions'

describe('Position Types', () => {
  describe('PositionSchema', () => {
    test('should validate a valid position', () => {
      const validPosition = {
        symbol: 'AAPL',
        symbolId: 8049,
        openQuantity: 100,
        closedQuantity: 0,
        currentMarketValue: 15000.0,
        currentPrice: 150.0,
        averageEntryPrice: 145.0,
        closedPnl: 0.0,
        openPnl: 500.0,
        totalCost: 14500.0,
        isRealTime: true,
        isUnderReorg: false,
      }

      const result = PositionSchema.safeParse(validPosition)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.openQuantity).toBe(100)
      }
    })

    test('should reject position with missing required fields', () => {
      const invalidPosition = {
        symbol: 'AAPL',
        symbolId: 8049,
      }

      const result = PositionSchema.safeParse(invalidPosition)
      expect(result.success).toBe(false)
    })
  })

  describe('PositionsResponseSchema', () => {
    test('should validate a valid positions response', () => {
      const validResponse = {
        positions: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            openQuantity: 100,
            closedQuantity: 0,
            currentMarketValue: 15000.0,
            currentPrice: 150.0,
            averageEntryPrice: 145.0,
            closedPnl: 0.0,
            openPnl: 500.0,
            totalCost: 14500.0,
            isRealTime: true,
            isUnderReorg: false,
          },
        ],
      }

      const result = PositionsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })

    test('should handle empty positions array', () => {
      const validResponse = {
        positions: [],
      }

      const result = PositionsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('ActivitySchema', () => {
    test('should validate a valid activity', () => {
      const validActivity = {
        tradeDate: '2025-11-15',
        transactionDate: '2025-11-15T10:30:00-05:00',
        settlementDate: '2025-11-18',
        action: 'Buy',
        symbol: 'AAPL',
        symbolId: 8049,
        description: 'AAPL - Apple Inc.',
        currency: 'USD',
        quantity: 100,
        price: 150.0,
        grossAmount: -15000.0,
        commission: -5.0,
        netAmount: -15005.0,
        type: 'Trades',
      }

      const result = ActivitySchema.safeParse(validActivity)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.type).toBe('Trades')
      }
    })

    test('should validate different activity types', () => {
      const activityTypes = ['Trades', 'Dividends', 'Deposits', 'Withdrawals', 'Fees']

      for (const type of activityTypes) {
        const activity = {
          tradeDate: '2025-11-15',
          transactionDate: '2025-11-15T10:30:00-05:00',
          settlementDate: '2025-11-18',
          action: 'Buy',
          symbol: 'AAPL',
          symbolId: 8049,
          description: 'Test',
          currency: 'USD',
          quantity: 100,
          price: 150.0,
          grossAmount: -15000.0,
          commission: -5.0,
          netAmount: -15005.0,
          type,
        }

        const result = ActivitySchema.safeParse(activity)
        expect(result.success).toBe(true)
      }
    })
  })

  describe('ActivitiesResponseSchema', () => {
    test('should validate a valid activities response', () => {
      const validResponse = {
        activities: [
          {
            tradeDate: '2025-11-15',
            transactionDate: '2025-11-15T10:30:00-05:00',
            settlementDate: '2025-11-18',
            action: 'Buy',
            symbol: 'AAPL',
            symbolId: 8049,
            description: 'AAPL - Apple Inc.',
            currency: 'USD',
            quantity: 100,
            price: 150.0,
            grossAmount: -15000.0,
            commission: -5.0,
            netAmount: -15005.0,
            type: 'Trades',
          },
        ],
      }

      const result = ActivitiesResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('ExecutionSchema', () => {
    test('should validate a valid execution', () => {
      const validExecution = {
        symbol: 'AAPL',
        symbolId: 8049,
        quantity: 100,
        side: 'Buy',
        price: 150.0,
        id: 12345,
        orderId: 67890,
        orderChainId: 111,
        exchangeExecId: 'EXEC123',
        timestamp: '2025-11-15T10:30:00-05:00',
        notes: 'Test execution',
        venue: 'AUTO',
        totalCost: 15005.0,
        orderPlacementCommission: 0.0,
        commission: 5.0,
        executionFee: 0.0,
        secFee: 0.0,
      }

      const result = ExecutionSchema.safeParse(validExecution)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.side).toBe('Buy')
      }
    })

    test('should validate execution with Sell side', () => {
      const validExecution = {
        symbol: 'AAPL',
        symbolId: 8049,
        quantity: 50,
        side: 'Sell',
        price: 155.0,
        id: 12346,
        orderId: 67891,
        orderChainId: 112,
        exchangeExecId: 'EXEC124',
        timestamp: '2025-11-16T14:30:00-05:00',
        venue: 'AUTO',
        totalCost: -7745.0,
        orderPlacementCommission: 0.0,
        commission: 5.0,
        executionFee: 0.0,
        secFee: 0.0,
      }

      const result = ExecutionSchema.safeParse(validExecution)
      expect(result.success).toBe(true)
    })
  })

  describe('ExecutionsResponseSchema', () => {
    test('should validate a valid executions response', () => {
      const validResponse = {
        executions: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            quantity: 100,
            side: 'Buy',
            price: 150.0,
            id: 12345,
            orderId: 67890,
            orderChainId: 111,
            exchangeExecId: 'EXEC123',
            timestamp: '2025-11-15T10:30:00-05:00',
            venue: 'AUTO',
            totalCost: 15005.0,
            orderPlacementCommission: 0.0,
            commission: 5.0,
            executionFee: 0.0,
            secFee: 0.0,
          },
        ],
      }

      const result = ExecutionsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('OrderSchema', () => {
    test('should validate a valid order', () => {
      const validOrder = {
        id: 123456,
        symbol: 'AAPL',
        symbolId: 8049,
        totalQuantity: 100,
        openQuantity: 100,
        filledQuantity: 0,
        canceledQuantity: 0,
        side: 'Buy',
        orderType: 'Limit',
        limitPrice: 150.0,
        stopPrice: null,
        isAllOrNone: false,
        isAnonymous: false,
        icebergQuantity: null,
        minQuantity: null,
        avgExecPrice: null,
        lastExecPrice: null,
        source: 'TradingAPI',
        timeInForce: 'Day',
        gtdDate: null,
        state: 'Accepted',
        chainId: 789,
        creationTime: '2025-11-17T09:30:00-05:00',
        updateTime: '2025-11-17T09:30:00-05:00',
        primaryRoute: 'AUTO',
        orderRoute: 'AUTO',
        isSignificantShareHolder: false,
        isInsider: false,
        isLimitOffsetInDollar: false,
        userId: 894475,
        placementCommission: 5.0,
      }

      const result = OrderSchema.safeParse(validOrder)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.orderType).toBe('Limit')
        expect(result.data.state).toBe('Accepted')
      }
    })

    test('should validate order with different states', () => {
      const orderStates = ['Pending', 'Accepted', 'Executed', 'Canceled', 'Rejected']

      for (const state of orderStates) {
        const order = {
          id: 123456,
          symbol: 'AAPL',
          symbolId: 8049,
          totalQuantity: 100,
          openQuantity: 0,
          filledQuantity: 100,
          canceledQuantity: 0,
          side: 'Buy',
          orderType: 'Market',
          isAllOrNone: false,
          isAnonymous: false,
          source: 'TradingAPI',
          timeInForce: 'Day',
          state,
          chainId: 789,
          creationTime: '2025-11-17T09:30:00-05:00',
          updateTime: '2025-11-17T09:30:00-05:00',
          primaryRoute: 'AUTO',
          orderRoute: 'AUTO',
          isSignificantShareHolder: false,
          isInsider: false,
          isLimitOffsetInDollar: false,
          userId: 894475,
        }

        const result = OrderSchema.safeParse(order)
        expect(result.success).toBe(true)
      }
    })
  })

  describe('OrdersResponseSchema', () => {
    test('should validate a valid orders response', () => {
      const validResponse = {
        orders: [
          {
            id: 123456,
            symbol: 'AAPL',
            symbolId: 8049,
            totalQuantity: 100,
            openQuantity: 100,
            filledQuantity: 0,
            canceledQuantity: 0,
            side: 'Buy',
            orderType: 'Limit',
            limitPrice: 150.0,
            isAllOrNone: false,
            isAnonymous: false,
            source: 'TradingAPI',
            timeInForce: 'Day',
            state: 'Accepted',
            chainId: 789,
            creationTime: '2025-11-17T09:30:00-05:00',
            updateTime: '2025-11-17T09:30:00-05:00',
            primaryRoute: 'AUTO',
            orderRoute: 'AUTO',
            isSignificantShareHolder: false,
            isInsider: false,
            isLimitOffsetInDollar: false,
            userId: 894475,
          },
        ],
      }

      const result = OrdersResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })
})
