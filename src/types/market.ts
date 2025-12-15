// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Candle interval types for OHLC data
 */
export const CandleIntervalSchema = z.enum([
  'OneMinute',
  'TwoMinutes',
  'ThreeMinutes',
  'FourMinutes',
  'FiveMinutes',
  'TenMinutes',
  'FifteenMinutes',
  'TwentyMinutes',
  'HalfHour',
  'OneHour',
  'TwoHours',
  'FourHours',
  'OneDay',
  'OneWeek',
  'OneMonth',
  'OneYear',
])

export type CandleInterval = z.infer<typeof CandleIntervalSchema>

/**
 * Schema for a single candle (OHLC data point)
 */
export const CandleSchema = z.object({
  start: z.string(), // ISO 8601 datetime
  end: z.string(), // ISO 8601 datetime
  low: z.number(),
  high: z.number(),
  open: z.number(),
  close: z.number(),
  volume: z.number().int(),
  VWAP: z.number().optional(),
})

export type Candle = z.infer<typeof CandleSchema>

/**
 * Schema for candles response
 */
export const CandlesResponseSchema = z.object({
  candles: z.array(CandleSchema),
})

export type CandlesResponse = z.infer<typeof CandlesResponseSchema>

/**
 * Symbol security type
 */
export const SecurityTypeSchema = z.enum([
  'Stock',
  'Option',
  'Bond',
  'Right',
  'Gold',
  'MutualFund',
  'Index',
])

export type SecurityType = z.infer<typeof SecurityTypeSchema>

/**
 * Listing exchange
 * Accepts any string to handle new exchanges without breaking,
 * but provides autocomplete for known exchanges through the type union.
 *
 * Note: Can be an empty string for some security types (e.g., Rights)
 */
export const ListingExchangeSchema = z.string()

// Type that provides autocomplete for known exchanges while accepting any string
export type ListingExchange =
  | '' // Empty for unlisted securities
  | 'TSX'
  | 'TSXV'
  | 'CNSX'
  | 'NEO'
  | 'MX'
  | 'NASDAQ'
  | 'NYSE'
  | 'NYSEAM'
  | 'ARCA'
  | 'BATS'
  | 'OPRA'
  | 'PinkSheets'
  | 'OTCBB'
  | 'NYSEGIF'
  | 'NASDAQI'
  | (string & {}) // Allows any other string while keeping autocomplete for known values

/**
 * Schema for symbol information
 */
export const SymbolSchema = z.object({
  symbol: z.string(),
  symbolId: z.number().int(),
  description: z.string(),
  securityType: SecurityTypeSchema,
  listingExchange: ListingExchangeSchema,
  isTradable: z.boolean(),
  isQuotable: z.boolean(),
  currency: z.enum(['CAD', 'USD']),
  minTicks: z
    .array(
      z.object({
        pivot: z.number(),
        minTick: z.number(),
      }),
    )
    .optional(),
  industrySector: z.string().optional(),
  industryGroup: z.string().optional(),
  industrySubgroup: z.string().optional(),
})

export type Symbol = z.infer<typeof SymbolSchema>

/**
 * Schema for symbols response
 */
export const SymbolsResponseSchema = z.object({
  symbols: z.array(SymbolSchema),
})

export type SymbolsResponse = z.infer<typeof SymbolsResponseSchema>

/**
 * Schema for symbol search result
 */
export const SymbolSearchResultSchema = z.object({
  symbol: z.string(),
  symbolId: z.number().int(),
  description: z.string(),
  securityType: SecurityTypeSchema,
  listingExchange: ListingExchangeSchema,
  isQuotable: z.boolean(),
  isTradable: z.boolean(),
  currency: z.enum(['CAD', 'USD']),
})

export type SymbolSearchResult = z.infer<typeof SymbolSearchResultSchema>

/**
 * Schema for symbol search response
 */
export const SymbolSearchResponseSchema = z.object({
  symbols: z.array(SymbolSearchResultSchema),
})

export type SymbolSearchResponse = z.infer<typeof SymbolSearchResponseSchema>

/**
 * Schema for quote information
 */
export const QuoteSchema = z.object({
  symbol: z.string(),
  symbolId: z.number().int(),
  tier: z.string().optional(),
  bidPrice: z.number().nullable(),
  bidSize: z.number().int().nullable(),
  askPrice: z.number().nullable(),
  askSize: z.number().int().nullable(),
  lastTradePriceTrHrs: z.number().nullable(),
  lastTradePrice: z.number().nullable(),
  lastTradeSize: z.number().int().nullable(),
  lastTradeTick: z.string().nullable(),
  lastTradeTime: z.string().nullable(),
  volume: z.number().int().nullable(),
  openPrice: z.number().nullable(),
  highPrice: z.number().nullable(),
  lowPrice: z.number().nullable(),
  delay: z.number().int().nullable(),
  isHalted: z.boolean(),
  high52w: z.number().nullable().optional(),
  low52w: z.number().nullable().optional(),
  VWAP: z.number().nullable().optional(),
})

export type Quote = z.infer<typeof QuoteSchema>

/**
 * Schema for quotes response
 */
export const QuotesResponseSchema = z.object({
  quotes: z.array(QuoteSchema),
})

export type QuotesResponse = z.infer<typeof QuotesResponseSchema>

/**
 * Option type (Call or Put)
 */
export const OptionTypeSchema = z.enum(['Call', 'Put'])

export type OptionType = z.infer<typeof OptionTypeSchema>

/**
 * Schema for option chain entry
 */
export const OptionChainEntrySchema = z.object({
  expiryDate: z.string(), // ISO 8601 date
  description: z.string(),
  listingExchange: ListingExchangeSchema,
  optionExerciseType: z.string().optional(),
  chainPerRoot: z.array(
    z.object({
      root: z.string(),
      chainPerStrikePrice: z.array(
        z.object({
          strikePrice: z.number(),
          callSymbolId: z.number().int().nullable(),
          putSymbolId: z.number().int().nullable(),
        }),
      ),
      multiplier: z.number().int().optional(),
    }),
  ),
})

export type OptionChainEntry = z.infer<typeof OptionChainEntrySchema>

/**
 * Schema for option chain response
 */
export const OptionChainResponseSchema = z.object({
  optionChain: z.array(OptionChainEntrySchema),
})

export type OptionChainResponse = z.infer<typeof OptionChainResponseSchema>

/**
 * Schema for market information
 */
export const MarketSchema = z.object({
  name: z.string(),
  tradingVenues: z.array(z.string()),
  defaultTradingVenue: z.string(),
  primaryOrderRoutes: z.array(z.string()),
  secondaryOrderRoutes: z.array(z.string()),
  level1Feeds: z.array(z.string()).optional(),
  level2Feeds: z.array(z.string()).optional(),
  extendedStartTime: z.string().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  currency: z.string().optional(),
  snapQuotesLimit: z.number().int().optional(),
})

export type Market = z.infer<typeof MarketSchema>

/**
 * Schema for markets response
 */
export const MarketsResponseSchema = z.object({
  markets: z.array(MarketSchema),
})

export type MarketsResponse = z.infer<typeof MarketsResponseSchema>
