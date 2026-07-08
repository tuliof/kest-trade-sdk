// SPDX-License-Identifier: BSD-3-Clause
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import { createTokenStorage, type TokenStorageConfig, TokenStorageType } from '@/auth/token-storage'
import { HttpClient } from '@/http/http-client'
import type { LoggerOptions } from '@/http/logger'
import { MarketClient } from '@/market/market-client'
import type { TokenResponse } from '@/types/auth'

/**
 * Configuration options for QuestradeClient
 */
export interface QuestradeClientConfig {
  /**
   * Refresh token for authentication
   * Either refreshToken or (accessToken + apiServer) must be provided
   *
   * When using tokenStorage: 'secure', this is only needed on first initialization.
   * Subsequent runs will retrieve the token from secure storage automatically.
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
   * Token storage strategy
   * - 'secure': Use OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
   * - 'env': Save to .env file (default for backward compatibility)
   * - 'memory': In-memory only (not persistent, useful for testing)
   * - Custom config: Provide SecureStorageConfig or EnvStorageConfig for more control
   *
   * @default TokenStorageType.ENV
   *
   * @example Using secure storage with constants
   * ```typescript
   * const { TokenStorageType } = require('kest-trade-sdk')
   * const client = new QuestradeClient({
   *   tokenStorage: TokenStorageType.SECURE,
   *   refreshToken: 'initial_token', // Only needed first time
   * })
   * ```
   *
   * @example Using .env file (backward compatible)
   * ```typescript
   * const client = new QuestradeClient({
   *   tokenStorage: TokenStorageType.ENV,
   *   refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
   * })
   * ```
   */
  tokenStorage?: TokenStorageConfig

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
   * **Default Behavior**: If not provided, tokens are automatically saved using the
   * configured tokenStorage strategy (secure storage, .env file, etc.).
   *
   * **Custom Behavior**: Provide your own callback to save tokens to a database,
   * or for custom logic.
   *
   * IMPORTANT: Questrade rotates refresh tokens on each use. The old refresh token
   * becomes invalid immediately. The SDK handles saving the new token automatically
   * using either the tokenStorage strategy or your custom callback.
   *
   * @param tokenResponse - The new token response containing the rotated refresh_token
   *
   * @example Custom persistence with database
   * ```typescript
   * const client = new QuestradeClient({
   *   tokenStorage: 'secure',
   *   refreshToken: 'initial_token',
   *   onTokenRefresh: async (token) => {
   *     // Also save to database for auditing
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
 * import { QuestradeClient, TokenStorageType } from 'kest-trade-sdk'
 *
 * // Initialize with refresh token (saves to secure storage automatically)
 * const client = new QuestradeClient({
 *   tokenStorage: TokenStorageType.SECURE,
 *   refreshToken: 'your_refresh_token'
 * })
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
  private tokenStorage: Awaited<ReturnType<typeof createTokenStorage>>
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
      tokenStorage: config.tokenStorage ?? TokenStorageType.ENV,
      onTokenRefresh: config.onTokenRefresh,
    }

    // Create token storage instance
    this.tokenStorage = createTokenStorage(this.config.tokenStorage)

    this.authClient = new AuthClient()
  }

  /**
   * Initialize the client and authenticate
   * Must be called before using any API methods
   *
   * When using tokenStorage: 'secure', the initial refreshToken is only needed on first
   * initialization. Subsequent runs will automatically retrieve the token from secure storage.
   */
  async initialize(): Promise<void> {
    if (this.config.refreshToken || !(this.config.accessToken && this.config.apiServer)) {
      // Try to load token from storage if not provided in config
      let refreshToken: string | null = this.config.refreshToken || null
      if (!refreshToken) {
        refreshToken = await this.tokenStorage.get()
      }

      if (!refreshToken && !this.config.accessToken) {
        throw new Error(
          'No refresh token available. Provide refreshToken in config or initialize with a valid token first.',
        )
      }

      if (refreshToken) {
        this.config.refreshToken = refreshToken
        // Authenticate with refresh token
        await this.refreshAccessToken()
      }
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
   * 2. The SDK automatically saves it using the configured tokenStorage strategy
   * 3. If you don't persist it, you'll need to manually generate a new one from the
   *    Questrade dashboard the next time you initialize the SDK
   *
   * The SDK handles this automatically by:
   * - Updating the internal refresh token state
   * - Saving to configured storage (secure, env file, etc.)
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
   * console.log('New refresh token saved automatically')
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

    // Save to configured storage automatically
    await this.tokenStorage.set(tokenResponse.refresh_token)

    // Invoke callback if provided (for additional custom logic)
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
