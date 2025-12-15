/**
 * Basic Usage Example
 *
 * This example shows the simplest way to use the Questrade SDK.
 * Tokens are automatically saved to .env file when rotated.
 */

import { QuestradeClient } from '../src/index'

async function main() {
  // Simple initialization - tokens are saved to .env automatically!
  const client = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
  })

  // Initialize the client (this will exchange the refresh token)
  await client.initialize()
  console.log('✅ Client initialized')

  // Get accounts
  const accountsResponse = await client.accounts.getAccounts()
  console.log('\n📊 Accounts:')
  for (const account of accountsResponse.accounts) {
    console.log(`  - ${account.type}: ${account.number}`)
  }

  // Get balances for the first account
  if (accountsResponse.accounts.length > 0) {
    const firstAccount = accountsResponse.accounts[0]
    if (firstAccount) {
      const balancesResponse = await client.accounts.getBalances(firstAccount.number)
      console.log(`\n💰 Balances for ${firstAccount.number}:`)
      for (const balance of balancesResponse.perCurrencyBalances) {
        console.log(`  - ${balance.currency}: $${balance.cash.toFixed(2)}`)
      }
    }
  }

  // Search for a stock
  const searchResponse = await client.market.searchSymbols('AAPL')
  console.log('\n🔍 Search results for AAPL:')
  for (const symbol of searchResponse.symbols.slice(0, 3)) {
    console.log(`  - ${symbol.symbol}: ${symbol.description}`)
  }

  // Get quotes
  if (searchResponse.symbols.length > 0) {
    const firstSymbol = searchResponse.symbols[0]
    if (firstSymbol) {
      const quotesResponse = await client.market.getQuotes([firstSymbol.symbolId])
      const quote = quotesResponse.quotes[0]
      if (quote) {
        console.log(`\n📈 Quote for ${quote.symbol}:`)
        console.log(`  Last Price: $${quote.lastTradePrice}`)
        console.log(`  Bid: $${quote.bidPrice} | Ask: $${quote.askPrice}`)
      }
    }
  }

  // Cleanup
  client.dispose()
  console.log('\n✅ Done!')
}

main().catch((error) => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
