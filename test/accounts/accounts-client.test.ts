// SPDX-License-Identifier: BSD-3-Clause
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { AccountsClient } from '@/accounts/accounts-client'
import { HttpClient } from '@/http/http-client'
import type { AccountsResponse } from '@/types/accounts'
import type { BalancesResponse } from '@/types/balances'
import { ValidationError } from '@/types/errors'
import type {
  ActivitiesResponse,
  ExecutionsResponse,
  OrdersResponse,
  PositionsResponse,
} from '@/types/positions'

describe('AccountsClient', () => {
  let httpClient: HttpClient
  let accountsClient: AccountsClient

  beforeEach(() => {
    // Create a fresh HttpClient for each test
    httpClient = new HttpClient('https://api01.iq.questrade.com', 'test_token_123')
    accountsClient = new AccountsClient(httpClient)
  })

  describe('getAccounts', () => {
    test('should successfully fetch accounts', async () => {
      const mockResponse: AccountsResponse = {
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

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/accounts')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getAccounts()

      expect(result.accounts).toHaveLength(2)
      expect(result.userId).toBe(894475)
      expect(result.accounts[0]?.type).toBe('TFSA')
      expect(result.accounts[1]?.type).toBe('RRSP')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle empty accounts array', async () => {
      const mockResponse: AccountsResponse = {
        accounts: [],
        userId: 894475,
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getAccounts()

      expect(result.accounts).toHaveLength(0)
      expect(result.userId).toBe(894475)
    })

    test('should throw ValidationError on invalid response schema', async () => {
      const invalidResponse = {
        accounts: [
          {
            // Missing required fields
            type: 'TFSA',
          },
        ],
        userId: 894475,
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(invalidResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await expect(accountsClient.getAccounts()).rejects.toThrow(ValidationError)
    })
  })

  describe('getBalances', () => {
    test('should successfully fetch account balances', async () => {
      const mockResponse: BalancesResponse = {
        perCurrencyBalances: [
          {
            currency: 'CAD',
            cash: 10000.5,
            marketValue: 25000.75,
            totalEquity: 35001.25,
            buyingPower: 40000.0,
            maintenanceExcess: 15000.0,
            isRealTime: true,
          },
        ],
        combinedBalances: [
          {
            currency: 'CAD',
            cash: 10000.5,
            marketValue: 25000.75,
            totalEquity: 35001.25,
            buyingPower: 40000.0,
            maintenanceExcess: 15000.0,
            isRealTime: true,
          },
        ],
        sodPerCurrencyBalances: [
          {
            currency: 'CAD',
            cash: 9500.0,
            marketValue: 24000.0,
            totalEquity: 33500.0,
            buyingPower: 38000.0,
            maintenanceExcess: 14000.0,
            isRealTime: false,
          },
        ],
        sodCombinedBalances: [
          {
            currency: 'CAD',
            cash: 9500.0,
            marketValue: 24000.0,
            totalEquity: 33500.0,
            buyingPower: 38000.0,
            maintenanceExcess: 14000.0,
            isRealTime: false,
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/accounts/52138123/balances')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getBalances('52138123')

      expect(result.perCurrencyBalances).toHaveLength(1)
      expect(result.perCurrencyBalances[0]?.currency).toBe('CAD')
      expect(result.perCurrencyBalances[0]?.cash).toBe(10000.5)
      expect(result.perCurrencyBalances[0]?.isRealTime).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle multiple currencies', async () => {
      const mockResponse: BalancesResponse = {
        perCurrencyBalances: [
          {
            currency: 'CAD',
            cash: 10000.0,
            marketValue: 20000.0,
            totalEquity: 30000.0,
            buyingPower: 35000.0,
            maintenanceExcess: 10000.0,
            isRealTime: true,
          },
          {
            currency: 'USD',
            cash: 5000.0,
            marketValue: 10000.0,
            totalEquity: 15000.0,
            buyingPower: 17500.0,
            maintenanceExcess: 5000.0,
            isRealTime: true,
          },
        ],
        combinedBalances: [
          {
            currency: 'CAD',
            cash: 16650.0,
            marketValue: 33300.0,
            totalEquity: 49950.0,
            buyingPower: 58275.0,
            maintenanceExcess: 16650.0,
            isRealTime: true,
          },
        ],
        sodPerCurrencyBalances: [],
        sodCombinedBalances: [],
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getBalances('52138123')

      expect(result.perCurrencyBalances).toHaveLength(2)
      expect(result.perCurrencyBalances[0]?.currency).toBe('CAD')
      expect(result.perCurrencyBalances[1]?.currency).toBe('USD')
    })

    test('should throw ValidationError on invalid balance response', async () => {
      const invalidResponse = {
        perCurrencyBalances: [
          {
            currency: 'EUR', // Invalid currency
            cash: 10000.0,
          },
        ],
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(invalidResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await expect(accountsClient.getBalances('52138123')).rejects.toThrow(ValidationError)
    })
  })

  describe('getPositions', () => {
    test('should successfully fetch account positions', async () => {
      const mockResponse: PositionsResponse = {
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

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/accounts/52138123/positions')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getPositions('52138123')

      expect(result.positions).toHaveLength(1)
      expect(result.positions[0]?.symbol).toBe('AAPL')
      expect(result.positions[0]?.openQuantity).toBe(100)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle empty positions array', async () => {
      const mockResponse: PositionsResponse = {
        positions: [],
      }

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getPositions('52138123')

      expect(result.positions).toHaveLength(0)
    })
  })

  describe('getActivities', () => {
    test('should successfully fetch account activities', async () => {
      const mockResponse: ActivitiesResponse = {
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

      const startTime = new Date('2025-11-01T00:00:00Z')
      const endTime = new Date('2025-11-17T23:59:59Z')

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('/v1/accounts/52138123/activities')
        expect(url).toContain('startTime=')
        expect(url).toContain('endTime=')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getActivities('52138123', startTime, endTime)

      expect(result.activities).toHaveLength(1)
      expect(result.activities[0]?.symbol).toBe('AAPL')
      expect(result.activities[0]?.type).toBe('Trades')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should throw ValidationError when date range exceeds 31 days', async () => {
      const startTime = new Date('2025-10-01T00:00:00Z')
      const endTime = new Date('2025-11-17T23:59:59Z') // More than 31 days

      await expect(accountsClient.getActivities('52138123', startTime, endTime)).rejects.toThrow(
        ValidationError,
      )
    })
  })

  describe('getExecutions', () => {
    test('should successfully fetch account executions', async () => {
      const mockResponse: ExecutionsResponse = {
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

      const startTime = new Date('2025-11-01T00:00:00Z')
      const endTime = new Date('2025-11-17T23:59:59Z')

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('/v1/accounts/52138123/executions')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getExecutions('52138123', startTime, endTime)

      expect(result.executions).toHaveLength(1)
      expect(result.executions[0]?.symbol).toBe('AAPL')
      expect(result.executions[0]?.side).toBe('Buy')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getOrders', () => {
    test('should successfully fetch account orders', async () => {
      const mockResponse: OrdersResponse = {
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

      const startTime = new Date('2025-11-01T00:00:00Z')
      const endTime = new Date('2025-11-17T23:59:59Z')

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('/v1/accounts/52138123/orders')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await accountsClient.getOrders('52138123', startTime, endTime)

      expect(result.orders).toHaveLength(1)
      expect(result.orders[0]?.symbol).toBe('AAPL')
      expect(result.orders[0]?.state).toBe('Accepted')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should fetch orders with state filter', async () => {
      const mockResponse: OrdersResponse = {
        orders: [],
      }

      const startTime = new Date('2025-11-01T00:00:00Z')
      const endTime = new Date('2025-11-17T23:59:59Z')

      const mockFetch = mock(async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await accountsClient.getOrders('52138123', startTime, endTime, 'Closed')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
