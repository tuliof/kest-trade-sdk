// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import { AuthClient } from '@/auth/auth-client'
import { HttpClient } from '@/http/http-client'
import { MarketClient } from '@/market/market-client'

/**
 * Integration tests for MarketClient using real Questrade API
 *
 * These tests require valid tokens in .env file:
 * - QUESTRADE_REFRESH_TOKEN: A valid Questrade refresh token
 *
 * To run integration tests: bun run test:integration
 * To run unit tests only: bun run test
 */
describe('MarketClient Integration Tests', () => {
  const refreshToken = process.env.QUESTRADE_REFRESH_TOKEN

  if (!refreshToken) {
    throw new Error(
      'QUESTRADE_REFRESH_TOKEN environment variable not set. Please add it to .env file.',
    )
  }

  test('should fetch markets from real API', async () => {
    // Setup
    const authClient = new AuthClient()
    const tokenResponse = await authClient.refreshToken(refreshToken)
    const httpClient = new HttpClient(tokenResponse.api_server, tokenResponse.access_token)
    const marketClient = new MarketClient(httpClient)

    // Get markets
    const marketsResponse = await marketClient.getMarkets()

    // Verify
    expect(marketsResponse.markets).toBeDefined()
    expect(Array.isArray(marketsResponse.markets)).toBe(true)
    expect(marketsResponse.markets.length).toBeGreaterThan(0)

    console.log('✅ Successfully fetched markets')
    console.log(`   Number of markets: ${marketsResponse.markets.length}`)

    const firstMarket = marketsResponse.markets[0]
    if (firstMarket) {
      console.log(`   First market: ${firstMarket.name}`)
      console.log(`   Trading hours: ${firstMarket.startTime} - ${firstMarket.endTime}`)
    }
  }, 15000)

  test('should search symbols from real API', async () => {
    // Setup
    const authClient = new AuthClient()
    const tokenResponse = await authClient.refreshToken(refreshToken)
    const httpClient = new HttpClient(tokenResponse.api_server, tokenResponse.access_token)
    const marketClient = new MarketClient(httpClient)

    // Search for symbols starting with "AAPL"
    const searchResponse = await marketClient.searchSymbols('AAPL')

    // Verify
    expect(searchResponse.symbols).toBeDefined()
    expect(Array.isArray(searchResponse.symbols)).toBe(true)

    console.log('✅ Successfully searched symbols')
    console.log(`   Search prefix: AAPL`)
    console.log(`   Results found: ${searchResponse.symbols.length}`)

    if (searchResponse.symbols.length > 0) {
      const firstSymbol = searchResponse.symbols[0]
      if (firstSymbol) {
        console.log(
          `   First result: ${firstSymbol.symbol} - ${firstSymbol.description} (ID: ${firstSymbol.symbolId})`,
        )
      }
    }
  }, 15000)

  test('should fetch symbol information and quotes from real API', async () => {
    // Setup
    const authClient = new AuthClient()
    const tokenResponse = await authClient.refreshToken(refreshToken)
    const httpClient = new HttpClient(tokenResponse.api_server, tokenResponse.access_token)
    const marketClient = new MarketClient(httpClient)

    // Get symbol by name
    const symbolsResponse = await marketClient.getSymbols({ names: ['AAPL'] })

    expect(symbolsResponse.symbols).toBeDefined()
    expect(symbolsResponse.symbols.length).toBeGreaterThan(0)

    const symbol = symbolsResponse.symbols[0]
    if (!symbol) {
      throw new Error('No symbol found')
    }

    console.log('✅ Successfully fetched symbol information')
    console.log(`   Symbol: ${symbol.symbol} (ID: ${symbol.symbolId})`)
    console.log(`   Description: ${symbol.description}`)
    console.log(`   Exchange: ${symbol.listingExchange}`)
    console.log(`   Currency: ${symbol.currency}`)

    // Get quotes for the symbol
    const quotesResponse = await marketClient.getQuotes([symbol.symbolId])

    expect(quotesResponse.quotes).toBeDefined()
    expect(quotesResponse.quotes.length).toBeGreaterThan(0)

    const quote = quotesResponse.quotes[0]
    if (quote) {
      console.log('✅ Successfully fetched quote')
      console.log(`   Last Trade: $${quote.lastTradePrice}`)
      console.log(`   Bid: $${quote.bidPrice} x ${quote.bidSize}`)
      console.log(`   Ask: $${quote.askPrice} x ${quote.askSize}`)
      console.log(`   Volume: ${quote.volume}`)
    }
  }, 15000)

  test('should fetch candles from real API', async () => {
    // Setup
    const authClient = new AuthClient()
    const tokenResponse = await authClient.refreshToken(refreshToken)
    const httpClient = new HttpClient(tokenResponse.api_server, tokenResponse.access_token)
    const marketClient = new MarketClient(httpClient)

    // Get AAPL symbol
    const symbolsResponse = await marketClient.getSymbols({ names: ['AAPL'] })
    const symbol = symbolsResponse.symbols[0]
    if (!symbol) {
      throw new Error('No symbol found')
    }

    // Get 1-day candles for the last 5 days
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 days ago

    const candlesResponse = await marketClient.getCandles(
      symbol.symbolId,
      startTime,
      endTime,
      'OneDay',
    )

    // Verify
    expect(candlesResponse.candles).toBeDefined()
    expect(Array.isArray(candlesResponse.candles)).toBe(true)

    console.log('✅ Successfully fetched candles')
    console.log(`   Symbol: ${symbol.symbol}`)
    console.log(`   Interval: OneDay`)
    console.log(`   Candles received: ${candlesResponse.candles.length}`)

    if (candlesResponse.candles.length > 0) {
      const lastCandle = candlesResponse.candles[candlesResponse.candles.length - 1]
      if (lastCandle) {
        console.log(`   Last candle:`)
        console.log(`     Open: $${lastCandle.open}`)
        console.log(`     High: $${lastCandle.high}`)
        console.log(`     Low: $${lastCandle.low}`)
        console.log(`     Close: $${lastCandle.close}`)
        console.log(`     Volume: ${lastCandle.volume}`)
      }
    }
  }, 15000)
})
