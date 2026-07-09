/**
 * Example: HTTP Request/Response Logging
 *
 * This example demonstrates how to enable request/response logging
 * for debugging and monitoring API calls.
 */

import { ConsoleLogger, type Logger, QuestradeClient } from '../src/index'

async function main() {
  // Example 1: Enable debug logging with full details
  console.log('=== Example 1: Debug Logging ===\n')

  const debugClient = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
    logger: 'debug',
    httpLogOptions: {
      logRequestHeaders: true, // Access tokens are redacted, showing only last 4 chars
      logRequestBody: true,
      logResponseHeaders: true,
      logResponseBody: true,
    },
  })

  await debugClient.initialize()
  console.log('\nFetching accounts with debug logging...')
  await debugClient.accounts.getAccounts()

  // Example 2: Production logging (errors only)
  console.log('\n\n=== Example 2: Error-Only Logging ===\n')

  const prodClient = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
    logger: 'error', // Only log errors
  })

  await prodClient.initialize()
  console.log('Fetching market data with error-only logging...')
  await prodClient.market.getMarkets()

  // Example 3: Custom Logger implementation
  console.log('\n\n=== Example 3: Custom Logger ===\n')

  const customLogger: Logger = {
    debug(message, context) {
      console.debug(`[DEBUG] ${message}`, context ?? '')
    },
    info(message, context) {
      console.info(`[INFO] ${message}`, context ?? '')
    },
    warn(message, context) {
      console.warn(`[WARN] ${message}`, context ?? '')
    },
    error(message, context) {
      console.error(`[ERROR] ${message}`, context ?? '')
    },
  }

  const customClient = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
    logger: customLogger,
    httpLogOptions: { logResponseBody: true },
  })

  await customClient.initialize()
  console.log('Fetching with custom logger...')
  const accounts = await customClient.accounts.getAccounts()
  console.log(`Found ${accounts.accounts.length} accounts`)

  // Example 4: Custom redaction function
  console.log('\n\n=== Example 4: Custom Redaction ===\n')

  const redactClient = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
    logger: 'debug',
    httpLogOptions: {
      logRequestHeaders: true,
      logResponseBody: true,
      // Custom redaction to hide account numbers
      redactFn: (entry) => {
        const redacted = { ...entry }

        // Redact default sensitive data
        if (redacted.requestHeaders?.Authorization) {
          redacted.requestHeaders = {
            ...redacted.requestHeaders,
            Authorization: '[REDACTED]',
          }
        }

        // Additionally redact account numbers in URLs
        if (redacted.url) {
          redacted.url = redacted.url.replace(/accounts\/\d+/g, 'accounts/[REDACTED]')
        }

        // Redact account numbers in response body
        if (redacted.responseBody && typeof redacted.responseBody === 'object') {
          const body = redacted.responseBody as Record<string, unknown>
          if (Array.isArray(body.accounts)) {
            body.accounts = body.accounts.map((account: Record<string, unknown>) => ({
              ...account,
              number: '[REDACTED]',
            }))
          }
        }

        return redacted
      },
    },
  })

  await redactClient.initialize()
  console.log('Fetching with custom redaction...')
  await redactClient.accounts.getAccounts()

  // Example 5: Dynamic logger configuration
  console.log('\n\n=== Example 5: Dynamic Configuration ===\n')

  const dynamicClient = new QuestradeClient({
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
    logger: 'none', // Start with no logging
  })

  await dynamicClient.initialize()

  // Enable logging dynamically
  console.log('Enabling debug logging...')
  dynamicClient.setLogger(new ConsoleLogger('debug'))

  await dynamicClient.market.getMarkets()

  // Disable logging
  console.log('\nDisabling logging...')
  dynamicClient.setLogger(new ConsoleLogger('none'))

  await dynamicClient.market.getMarkets()
  console.log('(No logs should appear above)')

  // Clean up
  debugClient.dispose()
  prodClient.dispose()
  customClient.dispose()
  redactClient.dispose()
  dynamicClient.dispose()
}

// Run examples
main().catch((error) => {
  console.error('Example failed:', error)
  process.exit(1)
})
