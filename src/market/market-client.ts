// SPDX-License-Identifier: BSD-3-Clause
import type { HttpClient } from '@/http/http-client'
import { ValidationError } from '@/types/errors'
import {
  type CandleInterval,
  type CandlesResponse,
  CandlesResponseSchema,
  type MarketsResponse,
  MarketsResponseSchema,
  type OptionChainResponse,
  OptionChainResponseSchema,
  type QuotesResponse,
  QuotesResponseSchema,
  type SymbolSearchResponse,
  SymbolSearchResponseSchema,
  type SymbolsResponse,
  SymbolsResponseSchema,
} from '@/types/market'

/**
 * MarketClient handles market data operations
 * - Get symbol information
 * - Search symbols
 * - Get quotes
 * - Get option chains
 * - Get candles (OHLC data)
 * - Get markets
 */
export class MarketClient {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get symbol(s) information by ID or name
   * @param options - Symbol IDs or names to fetch
   * @returns Symbol information
   */
  async getSymbols(options: { ids?: number[]; names?: string[] }): Promise<SymbolsResponse> {
    const params = new URLSearchParams()

    if (options.ids && options.ids.length > 0) {
      params.append('ids', options.ids.join(','))
    }

    if (options.names && options.names.length > 0) {
      params.append('names', options.names.join(','))
    }

    const queryString = params.toString()
    const endpoint = queryString ? `/v1/symbols?${queryString}` : '/v1/symbols'

    const response = await this.httpClient.get<unknown>(endpoint)

    const validationResult = SymbolsResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid symbols response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Search for symbols by prefix
   * @param prefix - Symbol prefix to search for (e.g., "AAPL")
   * @param offset - Offset for pagination (default: 0)
   * @returns Array of matching symbols
   */
  async searchSymbols(prefix: string, offset = 0): Promise<SymbolSearchResponse> {
    const params = new URLSearchParams({
      prefix,
      offset: offset.toString(),
    })

    const response = await this.httpClient.get<unknown>(`/v1/symbols/search?${params}`)

    const validationResult = SymbolSearchResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid symbol search response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get quotes for one or more symbols
   * @param ids - Array of symbol IDs
   * @returns Quote information for the symbols
   */
  async getQuotes(ids: number[]): Promise<QuotesResponse> {
    if (ids.length === 0) {
      throw new ValidationError('At least one symbol ID is required', [])
    }

    const params = new URLSearchParams({
      ids: ids.join(','),
    })

    const response = await this.httpClient.get<unknown>(`/v1/markets/quotes?${params}`)

    const validationResult = QuotesResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid quotes response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get option chain for a symbol
   * @param symbolId - The underlying symbol ID
   * @returns Option chain information
   */
  async getOptionChain(symbolId: number): Promise<OptionChainResponse> {
    const response = await this.httpClient.get<unknown>(`/v1/symbols/${symbolId}/options`)

    const validationResult = OptionChainResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid option chain response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get historical candles (OHLC data) for a symbol
   * @param symbolId - The symbol ID
   * @param startTime - Start date/time
   * @param endTime - End date/time
   * @param interval - Candle interval
   * @returns Array of candles
   */
  async getCandles(
    symbolId: number,
    startTime: Date,
    endTime: Date,
    interval: CandleInterval,
  ): Promise<CandlesResponse> {
    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      interval,
    })

    const response = await this.httpClient.get<unknown>(`/v1/markets/candles/${symbolId}?${params}`)

    const validationResult = CandlesResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid candles response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get information about supported markets
   * @returns Array of market information
   */
  async getMarkets(): Promise<MarketsResponse> {
    const response = await this.httpClient.get<unknown>('/v1/markets')

    const validationResult = MarketsResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid markets response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }
}
