// SPDX-License-Identifier: BSD-3-Clause
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import { HttpClient } from '@/http/http-client'
import type { LoggerOptions } from '@/http/logger'
import { MarketClient } from '@/market/market-client'
import type { TokenResponse } from '@/types/auth'

/**
 * Default token persistence handler that saves the refresh token to .env file
 * This is used when no custom onTokenRefresh callback is provided
 *
 * Uses Bun's native file I/O APIs for optimal performance
 */
async function defaultTokenPersistence(token: TokenResponse): Promise<void> {
  try {
    // Only available in Node.js/Bun environments
    if (typeof process === 'undefined' || !process.cwd) {
      console.warn('⚠️  Token rotated but cannot auto-save (not in Node.js/Bun environment)')
      console.warn('   New refresh token:', token.refresh_token)
      console.warn('   Please save this token manually!')
      return
    }

    const envPath = `${process.cwd()}/.env`
    const envFile = Bun.file(envPath)

    // Check if .env file exists
    const exists = await envFile.exists()

    if (!exists) {
      // Create new .env file
      await Bun.write(envPath, `QUESTRADE_REFRESH_TOKEN=${token.refresh_token}\n`)
      console.log('✅ Token saved to new .env file')
      return
    }

    // Read existing .env file
    const envContent = await envFile.text()

    // Check if QUESTRADE_REFRESH_TOKEN exists in the file
    if (envContent.includes('QUESTRADE_REFRESH_TOKEN=')) {
      // Replace existing token
      const updated = envContent.replace(
        /QUESTRADE_REFRESH_TOKEN=.*/,
        `QUESTRADE_REFRESH_TOKEN=${token.refresh_token}`,
      )
      await Bun.write(envPath, updated)
      console.log('✅ Token refreshed and saved to .env file')
    } else {
      // Append new token
      const updated = `${envContent.trimEnd()}\nQUESTRADE_REFRESH_TOKEN=${token.refresh_token}\n`
      await Bun.write(envPath, updated)
      console.log('✅ Token saved to .env file')
    }
  } catch (error) {
    console.error('❌ Failed to save token to .env file:', error)
    console.warn('   New refresh token:', token.refresh_token)
    console.warn('   Please save this token manually!')
  }
}

/**
 * Configuration options for QuestradeClient
 */
export interface QuestradeClientConfig {
  /**
   * Refresh token for authentication
   * Either refreshToken or (accessToken + apiServer) must be provided
   */
  refreshToken?: string

  /**
   * Existing access token (if you already have one)
   * Must provide apiServer as well
   */
  accessToken?: string

  /**
   * API server URL (required if using accessToken)
   */
  apiServer?: string

  /**
   * Auto-refresh token before expiry (default: true)
   * When enabled, tokens will be refreshed automatically when they're about to expire
   */
  autoRefresh?: boolean

  /**
   * Time in seconds before expiry to trigger auto-refresh (default: 60)
   */
  refreshBuffer?: number

  /**
   * Callback invoked whenever a token is refreshed
   *
   * **Default Behavior**: If not provided, tokens are automatically saved to `.env` file
   * in the current working directory. The SDK will create the file if it doesn't exist
   * or update the `QUESTRADE_REFRESH_TOKEN` variable if it does.
   *
   * **Custom Behavior**: Provide your own callback to save tokens to a database,
   * secure storage, or any other location.
   *
   * IMPORTANT: Questrade rotates refresh tokens on each use. The old refresh token
   * becomes invalid immediately. The SDK handles saving the new token automatically
   * using either the default behavior or your custom callback.
   *
   * @param tokenResponse - The new token response containing the rotated refresh_token
   *
   * @example Default (saves to .env automatically)
   * ```typescript
   * const client = new QuestradeClient({
   *   refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
   *   // onTokenRefresh not needed - saves to .env by default!
   * })
   * ```
   *
   * @example Custom persistence
   * ```typescript
   * const client = new QuestradeClient({
   *   refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
   *   onTokenRefresh: async (token) => {
   *     // Save to database, secure storage, etc.
   *     await db.saveRefreshToken(token.refresh_token)
   *   }
   * })
   * ```
   */
  onTokenRefresh?: (tokenResponse: TokenResponse) => void | Promise<void>

  /**
   * Logger configuration for HTTP request/response logging
   * Useful for debugging and monitoring API calls
   *
   * @example Enable debug logging
   * ```typescript
   * const client = new QuestradeClient({
   *   refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
   *   logger: {
   *     level: 'debug',
   *     logRequestBody: true,
   *     logResponseBody: true,
   *   }
   * })
   * ```
   */
  logger?: LoggerOptions
}

/**
 * Main Questrade SDK Client
 * Provides unified access to all Questrade API operations with automatic token management
 *
 * @example
 * ```typescript
 * // Initialize with refresh token
 * const client = new QuestradeClient({ refreshToken: 'your_refresh_token' })
 * await client.initialize()
 *
 * // Get accounts
 * const accounts = await client.accounts.getAccounts()
 *
 * // Get market data
 * const quotes = await client.market.getQuotes([8049])
 * ```
 */
export class QuestradeClient {
  private authClient: AuthClient
  private httpClient?: HttpClient
  private _accounts?: AccountsClient
  private _market?: MarketClient
  private config: Omit<Required<QuestradeClientConfig>, 'onTokenRefresh'> & {
    onTokenRefresh?: (tokenResponse: TokenResponse) => void | Promise<void>
  }
  private currentToken?: TokenResponse
  private refreshTimerId?: Timer

  constructor(config: QuestradeClientConfig) {
    // Validate configuration
    if (!config.refreshToken && (!config.accessToken || !config.apiServer)) {
      throw new Error('Either refreshToken or (accessToken + apiServer) must be provided')
    }

    // Set defaults
    this.config = {
      refreshToken: config.refreshToken || '',
      accessToken: config.accessToken || '',
      apiServer: config.apiServer || '',
      autoRefresh: config.autoRefresh ?? true,
      refreshBuffer: config.refreshBuffer ?? 60,
      logger: config.logger ?? { level: 'none' },
      // Use default token persistence if no callback provided
      onTokenRefresh: config.onTokenRefresh ?? defaultTokenPersistence,
    }

    this.authClient = new AuthClient()
  }

  /**
   * Initialize the client and authenticate
   * Must be called before using any API methods
   */
  async initialize(): Promise<void> {
    if (this.config.refreshToken) {
      // Authenticate with refresh token
      await this.refreshAccessToken()
    } else if (this.config.accessToken && this.config.apiServer) {
      // Use existing access token
      this.httpClient = new HttpClient(
        this.config.apiServer,
        this.config.accessToken,
        this.config.logger,
      )
      this.initializeClients()
    }
  }

  /**
   * Refresh the access token
   *
   * IMPORTANT - Token Rotation:
   * Questrade rotates refresh tokens on every use. When you exchange a refresh token
   * for an access token, you receive a NEW refresh token in the response. The old
   * refresh token becomes invalid immediately.
   *
   * This means:
   * 1. You MUST save the new refresh_token from the response
   * 2. Use the onTokenRefresh callback to persist it (to .env, database, etc.)
   * 3. If you don't save it, you'll need to manually generate a new one from the
   *    Questrade dashboard the next time you initialize the SDK
   *
   * The SDK handles this automatically by:
   * - Updating the internal refresh token state
   * - Calling your onTokenRefresh callback (if provided)
   * - Using the new token for subsequent refreshes
   *
   * @returns The new token response with rotated refresh_token
   * @throws Error if no refresh token is available
   *
   * @example
   * ```typescript
   * // Manual refresh
   * const newToken = await client.refreshAccessToken()
   * console.log('New refresh token:', newToken.refresh_token)
   * // Make sure to save this new token!
   * ```
   */
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.config.refreshToken) {
      throw new Error('Cannot refresh token: no refresh token available')
    }

    const tokenResponse = await this.authClient.refreshToken(this.config.refreshToken)
    this.currentToken = tokenResponse

    // Update refresh token for next use (CRITICAL: tokens are rotated)
    this.config.refreshToken = tokenResponse.refresh_token

    // Invoke callback to allow user to persist the new token
    if (this.config.onTokenRefresh) {
      await this.config.onTokenRefresh(tokenResponse)
    }

    // Create or update HTTP client
    this.httpClient = new HttpClient(
      tokenResponse.api_server,
      tokenResponse.access_token,
      this.config.logger,
    )
    this.initializeClients()

    // Schedule auto-refresh if enabled
    if (this.config.autoRefresh) {
      this.scheduleTokenRefresh()
    }

    return tokenResponse
  }

  /**
   * Schedule automatic token refresh before expiry
   */
  private scheduleTokenRefresh(): void {
    // Clear existing timer
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId)
    }

    if (!this.authClient.getTokenExpiresAt()) {
      return
    }

    const expiresAt = this.authClient.getTokenExpiresAt()
    if (!expiresAt) {
      return
    }

    const now = Date.now()
    const expiryTime = expiresAt.getTime()
    const refreshTime = expiryTime - this.config.refreshBuffer * 1000
    const delay = refreshTime - now

    if (delay > 0) {
      this.refreshTimerId = setTimeout(async () => {
        try {
          await this.refreshAccessToken()
        } catch (error) {
          console.error('Auto-refresh failed:', error)
        }
      }, delay)
    }
  }

  /**
   * Initialize sub-clients (lazy initialization)
   */
  private initializeClients(): void {
    if (!this.httpClient) {
      throw new Error('HttpClient not initialized')
    }

    this._accounts = new AccountsClient(this.httpClient)
    this._market = new MarketClient(this.httpClient)
  }

  /**
   * Get the accounts client for account-related operations
   */
  get accounts(): AccountsClient {
    if (!this._accounts) {
      throw new Error('Client not initialized. Call initialize() first.')
    }
    return this._accounts
  }

  /**
   * Get the market client for market data operations
   */
  get market(): MarketClient {
    if (!this._market) {
      throw new Error('Client not initialized. Call initialize() first.')
    }
    return this._market
  }

  /**
   * Get the auth client for authentication operations
   */
  get auth(): AuthClient {
    return this.authClient
  }

  /**
   * Update logger options dynamically
   * @param options - New logger options to merge with existing options
   */
  public setLoggerOptions(options: Partial<LoggerOptions>): void {
    this.config.logger = {
      ...this.config.logger,
      ...options,
    }
    // Update HttpClient logger if it exists
    this.httpClient?.setLoggerOptions(options)
  }

  /**
   * Get current logger options
   */
  public getLoggerOptions(): Readonly<Required<LoggerOptions>> | undefined {
    return this.httpClient?.getLoggerOptions()
  }

  /**
   * Check if the current token is expired
   */
  isTokenExpired(): boolean {
    return this.authClient.isTokenExpired()
  }

  /**
   * Check if the current token will expire soon
   */
  isTokenExpiringSoon(bufferSeconds?: number): boolean {
    return this.authClient.isTokenExpiringSoon(bufferSeconds)
  }

  /**
   * Get the current token information
   */
  getCurrentToken(): TokenResponse | undefined {
    return this.currentToken
  }

  /**
   * Cleanup resources (timers, etc.)
   */
  dispose(): void {
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId)
      this.refreshTimerId = undefined
    }
  }
}
