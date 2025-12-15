// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import {
  CandleSchema,
  CandlesResponseSchema,
  MarketSchema,
  MarketsResponseSchema,
  OptionChainResponseSchema,
  QuoteSchema,
  QuotesResponseSchema,
  SymbolSchema,
  SymbolSearchResponseSchema,
  SymbolsResponseSchema,
} from '@/types/market'

describe('Market Types', () => {
  describe('CandleSchema', () => {
    test('should validate a valid candle', () => {
      const validCandle = {
        start: '2025-11-17T09:30:00-05:00',
        end: '2025-11-17T09:31:00-05:00',
        low: 100.5,
        high: 102.3,
        open: 101.0,
        close: 102.0,
        volume: 1500,
        VWAP: 101.5,
      }

      const result = CandleSchema.safeParse(validCandle)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.open).toBe(101.0)
        expect(result.data.volume).toBe(1500)
      }
    })

    test('should validate candle without optional VWAP', () => {
      const validCandle = {
        start: '2025-11-17T09:30:00-05:00',
        end: '2025-11-17T09:31:00-05:00',
        low: 100.5,
        high: 102.3,
        open: 101.0,
        close: 102.0,
        volume: 1500,
      }

      const result = CandleSchema.safeParse(validCandle)
      expect(result.success).toBe(true)
    })

    test('should reject candle with missing required fields', () => {
      const invalidCandle = {
        start: '2025-11-17T09:30:00-05:00',
        open: 101.0,
        close: 102.0,
      }

      const result = CandleSchema.safeParse(invalidCandle)
      expect(result.success).toBe(false)
    })
  })

  describe('CandlesResponseSchema', () => {
    test('should validate a valid candles response', () => {
      const validResponse = {
        candles: [
          {
            start: '2025-11-17T09:30:00-05:00',
            end: '2025-11-17T09:31:00-05:00',
            low: 100.5,
            high: 102.3,
            open: 101.0,
            close: 102.0,
            volume: 1500,
          },
        ],
      }

      const result = CandlesResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('SymbolSchema', () => {
    test('should validate a valid symbol', () => {
      const validSymbol = {
        symbol: 'AAPL',
        symbolId: 8049,
        description: 'Apple Inc.',
        securityType: 'Stock',
        listingExchange: 'NASDAQ',
        isTradable: true,
        isQuotable: true,
        currency: 'USD',
      }

      const result = SymbolSchema.safeParse(validSymbol)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.currency).toBe('USD')
      }
    })

    test('should validate symbol with optional fields', () => {
      const validSymbol = {
        symbol: 'TD.TO',
        symbolId: 9291,
        description: 'Toronto-Dominion Bank',
        securityType: 'Stock',
        listingExchange: 'TSX',
        isTradable: true,
        isQuotable: true,
        currency: 'CAD',
        industrySector: 'Financial Services',
        industryGroup: 'Banks',
        industrySubgroup: 'Diversified Banks',
        minTicks: [
          { pivot: 0.5, minTick: 0.005 },
          { pivot: 1.0, minTick: 0.01 },
        ],
      }

      const result = SymbolSchema.safeParse(validSymbol)
      expect(result.success).toBe(true)
    })

    test('should reject symbol with invalid security type', () => {
      const invalidSymbol = {
        symbol: 'AAPL',
        symbolId: 8049,
        description: 'Apple Inc.',
        securityType: 'InvalidType',
        listingExchange: 'NASDAQ',
        isTradable: true,
        isQuotable: true,
        currency: 'USD',
      }

      const result = SymbolSchema.safeParse(invalidSymbol)
      expect(result.success).toBe(false)
    })
  })

  describe('SymbolsResponseSchema', () => {
    test('should validate a valid symbols response', () => {
      const validResponse = {
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

      const result = SymbolsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('SymbolSearchResponseSchema', () => {
    test('should validate a valid search response', () => {
      const validResponse = {
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

      const result = SymbolSearchResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('QuoteSchema', () => {
    test('should validate a valid quote', () => {
      const validQuote = {
        symbol: 'AAPL',
        symbolId: 8049,
        tier: '',
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
        high52w: 180.0,
        low52w: 120.0,
        VWAP: 150.5,
      }

      const result = QuoteSchema.safeParse(validQuote)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symbol).toBe('AAPL')
        expect(result.data.bidPrice).toBe(150.25)
      }
    })

    test('should handle nullable quote fields', () => {
      const quoteWithNulls = {
        symbol: 'TEST',
        symbolId: 1234,
        tier: '',
        bidPrice: null,
        bidSize: null,
        askPrice: null,
        askSize: null,
        lastTradePriceTrHrs: null,
        lastTradePrice: null,
        lastTradeSize: null,
        lastTradeTick: null,
        lastTradeTime: null,
        volume: null,
        openPrice: null,
        highPrice: null,
        lowPrice: null,
        delay: null,
        isHalted: true,
      }

      const result = QuoteSchema.safeParse(quoteWithNulls)
      expect(result.success).toBe(true)
    })
  })

  describe('QuotesResponseSchema', () => {
    test('should validate a valid quotes response', () => {
      const validResponse = {
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

      const result = QuotesResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('OptionChainResponseSchema', () => {
    test('should validate a valid option chain response', () => {
      const validResponse = {
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
                ],
                multiplier: 100,
              },
            ],
          },
        ],
      }

      const result = OptionChainResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('MarketSchema', () => {
    test('should validate a valid market', () => {
      const validMarket = {
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
      }

      const result = MarketSchema.safeParse(validMarket)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('TSX')
        expect(result.data.currency).toBe('CAD')
      }
    })
  })

  describe('MarketsResponseSchema', () => {
    test('should validate a valid markets response', () => {
      const validResponse = {
        markets: [
          {
            name: 'TSX',
            tradingVenues: ['ALPHA', 'TSX', 'OMEGA'],
            defaultTradingVenue: 'AUTO',
            primaryOrderRoutes: ['AUTO', 'TSX'],
            secondaryOrderRoutes: ['ALPHA', 'OMEGA'],
            startTime: '09:30:00 ET',
            endTime: '16:00:00 ET',
          },
        ],
      }

      const result = MarketsResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })
})
