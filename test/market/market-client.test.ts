// SPDX-License-Identifier: BSD-3-Clause
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { HttpClient } from '@/http/http-client'
import { MarketClient } from '@/market/market-client'
import { ValidationError } from '@/types/errors'
import type {
  CandlesResponse,
  MarketsResponse,
  OptionChainResponse,
  QuotesResponse,
  SymbolSearchResponse,
  SymbolsResponse,
} from '@/types/market'

describe('MarketClient', () => {
  let httpClient: HttpClient
  let marketClient: MarketClient

  beforeEach(() => {
    httpClient = new HttpClient('https://api01.iq.questrade.com', 'test_token_123')
    marketClient = new MarketClient(httpClient)
  })

  describe('getSymbols', () => {
    test('should fetch symbols by IDs', async () => {
      const mockResponse: SymbolsResponse = {
        symbols: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            description: 'Apple Inc.',
            securityType: 'Stock',
            listingExchange: 'NASDAQ',
            isTradable: true,
            isQuotable: true,
            currency: 'USD',
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/symbols?ids=8049')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getSymbols({ ids: [8049] })

      expect(result.symbols).toHaveLength(1)
      expect(result.symbols[0]?.symbol).toBe('AAPL')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should fetch symbols by names', async () => {
      const mockResponse: SymbolsResponse = {
        symbols: [
          {
            symbol: 'TD.TO',
            symbolId: 9291,
            description: 'Toronto-Dominion Bank',
            securityType: 'Stock',
            listingExchange: 'TSX',
            isTradable: true,
            isQuotable: true,
            currency: 'CAD',
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/symbols?names=TD.TO')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getSymbols({ names: ['TD.TO'] })

      expect(result.symbols).toHaveLength(1)
      expect(result.symbols[0]?.symbol).toBe('TD.TO')
    })

    test('should fetch symbols by both IDs and names', async () => {
      const mockResponse: SymbolsResponse = {
        symbols: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            description: 'Apple Inc.',
            securityType: 'Stock',
            listingExchange: 'NASDAQ',
            isTradable: true,
            isQuotable: true,
            currency: 'USD',
          },
          {
            symbol: 'TD.TO',
            symbolId: 9291,
            description: 'Toronto-Dominion Bank',
            securityType: 'Stock',
            listingExchange: 'TSX',
            isTradable: true,
            isQuotable: true,
            currency: 'CAD',
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('ids=8049')
        expect(url).toContain('names=TD.TO')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getSymbols({ ids: [8049], names: ['TD.TO'] })

      expect(result.symbols).toHaveLength(2)
    })

    test('should throw ValidationError on invalid response', async () => {
      const invalidResponse = {
        symbols: [
          {
            symbol: 'INVALID',
            // Missing required fields
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

      await expect(marketClient.getSymbols({ ids: [8049] })).rejects.toThrow(ValidationError)
    })
  })

  describe('searchSymbols', () => {
    test('should search symbols by prefix', async () => {
      const mockResponse: SymbolSearchResponse = {
        symbols: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            description: 'Apple Inc.',
            securityType: 'Stock',
            listingExchange: 'NASDAQ',
            isTradable: true,
            isQuotable: true,
            currency: 'USD',
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/symbols/search?prefix=AAP&offset=0')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.searchSymbols('AAP')

      expect(result.symbols).toHaveLength(1)
      expect(result.symbols[0]?.symbol).toBe('AAPL')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should search symbols with offset', async () => {
      const mockResponse: SymbolSearchResponse = {
        symbols: [],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('offset=10')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await marketClient.searchSymbols('AAPL', 10)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getQuotes', () => {
    test('should fetch quotes for symbol IDs', async () => {
      const mockResponse: QuotesResponse = {
        quotes: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            bidPrice: 150.25,
            bidSize: 100,
            askPrice: 150.3,
            askSize: 200,
            lastTradePriceTrHrs: null,
            lastTradePrice: 150.28,
            lastTradeSize: 50,
            lastTradeTick: 'Up',
            lastTradeTime: '2025-11-17T16:00:00.000000-05:00',
            volume: 50000000,
            openPrice: 149.5,
            highPrice: 151.0,
            lowPrice: 149.0,
            delay: 0,
            isHalted: false,
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/markets/quotes?ids=8049')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getQuotes([8049])

      expect(result.quotes).toHaveLength(1)
      expect(result.quotes[0]?.symbol).toBe('AAPL')
      expect(result.quotes[0]?.lastTradePrice).toBe(150.28)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should fetch quotes for multiple symbols', async () => {
      const mockResponse: QuotesResponse = {
        quotes: [
          {
            symbol: 'AAPL',
            symbolId: 8049,
            bidPrice: 150.25,
            bidSize: 100,
            askPrice: 150.3,
            askSize: 200,
            lastTradePriceTrHrs: null,
            lastTradePrice: 150.28,
            lastTradeSize: 50,
            lastTradeTick: 'Up',
            lastTradeTime: '2025-11-17T16:00:00.000000-05:00',
            volume: 50000000,
            openPrice: 149.5,
            highPrice: 151.0,
            lowPrice: 149.0,
            delay: 0,
            isHalted: false,
          },
          {
            symbol: 'MSFT',
            symbolId: 27426,
            bidPrice: 380.5,
            bidSize: 150,
            askPrice: 380.6,
            askSize: 100,
            lastTradePriceTrHrs: null,
            lastTradePrice: 380.55,
            lastTradeSize: 75,
            lastTradeTick: 'Down',
            lastTradeTime: '2025-11-17T16:00:00.000000-05:00',
            volume: 30000000,
            openPrice: 379.0,
            highPrice: 381.5,
            lowPrice: 378.5,
            delay: 0,
            isHalted: false,
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/markets/quotes?ids=8049%2C27426')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getQuotes([8049, 27426])

      expect(result.quotes).toHaveLength(2)
    })

    test('should throw ValidationError when no symbol IDs provided', async () => {
      await expect(marketClient.getQuotes([])).rejects.toThrow(ValidationError)
    })
  })

  describe('getOptionChain', () => {
    test('should fetch option chain for symbol', async () => {
      const mockResponse: OptionChainResponse = {
        optionChain: [
          {
            expiryDate: '2025-12-20',
            description: 'AAPL Dec 2025',
            listingExchange: 'OPRA',
            chainPerRoot: [
              {
                root: 'AAPL',
                chainPerStrikePrice: [
                  {
                    strikePrice: 150.0,
                    callSymbolId: 123456,
                    putSymbolId: 123457,
                  },
                  {
                    strikePrice: 155.0,
                    callSymbolId: 123458,
                    putSymbolId: 123459,
                  },
                ],
                multiplier: 100,
              },
            ],
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/symbols/8049/options')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getOptionChain(8049)

      expect(result.optionChain).toHaveLength(1)
      expect(result.optionChain[0]?.expiryDate).toBe('2025-12-20')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getCandles', () => {
    test('should fetch candles for symbol', async () => {
      const mockResponse: CandlesResponse = {
        candles: [
          {
            start: '2025-11-17T09:30:00-05:00',
            end: '2025-11-17T09:31:00-05:00',
            low: 150.0,
            high: 151.0,
            open: 150.5,
            close: 150.8,
            volume: 10000,
            VWAP: 150.6,
          },
          {
            start: '2025-11-17T09:31:00-05:00',
            end: '2025-11-17T09:32:00-05:00',
            low: 150.5,
            high: 151.5,
            open: 150.8,
            close: 151.2,
            volume: 12000,
            VWAP: 151.0,
          },
        ],
      }

      const startTime = new Date('2025-11-17T09:30:00-05:00')
      const endTime = new Date('2025-11-17T10:00:00-05:00')

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('/v1/markets/candles/8049')
        expect(url).toContain('interval=OneMinute')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getCandles(8049, startTime, endTime, 'OneMinute')

      expect(result.candles).toHaveLength(2)
      expect(result.candles[0]?.open).toBe(150.5)
      expect(result.candles[0]?.close).toBe(150.8)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should support different candle intervals', async () => {
      const mockResponse: CandlesResponse = {
        candles: [],
      }

      const startTime = new Date('2025-11-01T00:00:00-05:00')
      const endTime = new Date('2025-11-17T00:00:00-05:00')

      const mockFetch = mock(async (url: string) => {
        expect(url).toContain('interval=OneDay')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      await marketClient.getCandles(8049, startTime, endTime, 'OneDay')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getMarkets', () => {
    test('should fetch markets information', async () => {
      const mockResponse: MarketsResponse = {
        markets: [
          {
            name: 'TSX',
            tradingVenues: ['ALPHA', 'TSX', 'OMEGA'],
            defaultTradingVenue: 'AUTO',
            primaryOrderRoutes: ['AUTO', 'TSX'],
            secondaryOrderRoutes: ['ALPHA', 'OMEGA'],
            level1Feeds: ['TSX_L1'],
            level2Feeds: ['TSX_L2'],
            extendedStartTime: '07:00:00 ET',
            startTime: '09:30:00 ET',
            endTime: '16:00:00 ET',
            currency: 'CAD',
            snapQuotesLimit: 5,
          },
          {
            name: 'NASDAQ',
            tradingVenues: ['NASDAQ'],
            defaultTradingVenue: 'NASDAQ',
            primaryOrderRoutes: ['NASDAQ'],
            secondaryOrderRoutes: [],
            startTime: '09:30:00 ET',
            endTime: '16:00:00 ET',
          },
        ],
      }

      const mockFetch = mock(async (url: string) => {
        expect(url).toBe('https://api01.iq.questrade.com/v1/markets')
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await marketClient.getMarkets()

      expect(result.markets).toHaveLength(2)
      expect(result.markets[0]?.name).toBe('TSX')
      expect(result.markets[1]?.name).toBe('NASDAQ')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
