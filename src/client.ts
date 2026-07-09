// SPDX-License-Identifier: BSD-3-Clause
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import {
  createTokenStorage,
  type ITokenStorage,
  type TokenStorageConfig,
  TokenStorageError,
  TokenStorageType,
} from '@/auth/token-storage'
import { HttpClient } from '@/http/http-client'
import type { HttpLogOptions } from '@/http/logger'
import { createLogger, type Logger, type LogLevel, SilentLogger } from '@/logger'
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
   * Logger for SDK operations (HTTP, token storage, errors)
   * Accept a Logger instance or a LogLevel string.
   * Default: silent (no output).
   *
   * @example Enable debug logging
   * ```typescript
   * const client = new QuestradeClient({
   *   refreshToken: process.env.QUESTRADE_REFRESH_TOKEN,
   *   logger: 'debug',
   * })
   * ```
   *
   * @example Custom logger for Datadog
   * ```typescript
   * const client = new QuestradeClient({
   *   logger: new DatadogLogger(),
   * })
   * ```
   */
  logger?: Logger | LogLevel

  /**
   * HTTP-specific log formatting options
   * Controls what data is included in HTTP log entries (headers, body, etc.)
   * Only relevant when logger is enabled.
   */
  httpLogOptions?: HttpLogOptions
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
  private logger: Logger
  private config: {
    refreshToken: string
    accessToken: string
    apiServer: string
    autoRefresh: boolean
    refreshBuffer: number
    tokenStorage: TokenStorageConfig
    httpLogOptions: HttpLogOptions
    onTokenRefresh?: (tokenResponse: TokenResponse) => void | Promise<void>
  }
  private tokenStorage: ITokenStorage
  private currentToken?: TokenResponse
  private refreshTimerId?: Timer

  constructor(config: QuestradeClientConfig) {
    // Validate configuration
    if (
      !config.refreshToken &&
      (!config.accessToken || !config.apiServer) &&
      !config.tokenStorage
    ) {
      throw new Error(
        'Either refreshToken, (accessToken + apiServer), or tokenStorage must be provided',
      )
    }

    // Resolve logger: string level → ConsoleLogger, Logger instance → as-is, undefined → silent
    this.logger =
      typeof config.logger === 'string'
        ? createLogger(config.logger)
        : (config.logger ?? new SilentLogger())

    // Set defaults
    this.config = {
      refreshToken: config.refreshToken || '',
      accessToken: config.accessToken || '',
      apiServer: config.apiServer || '',
      autoRefresh: config.autoRefresh ?? true,
      refreshBuffer: config.refreshBuffer ?? 60,
      tokenStorage: config.tokenStorage ?? TokenStorageType.ENV,
      httpLogOptions: config.httpLogOptions ?? {},
      onTokenRefresh: config.onTokenRefresh,
    }

    // Create token storage instance
    this.tokenStorage = createTokenStorage(this.config.tokenStorage, this.logger)

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
    // Use existing access token if provided
    if (this.config.accessToken && this.config.apiServer) {
      this.httpClient = new HttpClient(
        this.config.apiServer,
        this.config.accessToken,
        this.logger,
        this.config.httpLogOptions,
      )
      this.initializeClients()
      return
    }

    // Load refresh token from config or storage
    let refreshToken: string | null = this.config.refreshToken || null
    if (!refreshToken) {
      refreshToken = await this.tokenStorage.get()
    }

    if (!refreshToken) {
      throw new Error(
        'No refresh token available. Provide refreshToken in config, initialize with a valid token first, or ensure tokenStorage has a saved token.',
      )
    }

    this.config.refreshToken = refreshToken
    await this.refreshAccessToken()
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

    // Create or update HTTP client first, so the client remains usable
    // even if token storage fails
    this.httpClient = new HttpClient(
      tokenResponse.api_server,
      tokenResponse.access_token,
      this.logger,
      this.config.httpLogOptions,
    )
    this.initializeClients()

    // Schedule auto-refresh if enabled
    if (this.config.autoRefresh) {
      this.scheduleTokenRefresh()
    }

    // Save to configured storage — may throw TokenStorageError
    // carrying the new token for manual recovery
    let storageError: TokenStorageError | null = null
    try {
      await this.tokenStorage.set(tokenResponse.refresh_token)
    } catch (error) {
      storageError =
        error instanceof TokenStorageError
          ? error
          : new TokenStorageError(
              `Failed to save token to storage: ${error instanceof Error ? error.message : String(error)}`,
              tokenResponse.refresh_token,
              { cause: error },
            )
    }

    // Invoke callback if provided (for additional custom logic)
    if (this.config.onTokenRefresh) {
      await this.config.onTokenRefresh(tokenResponse)
    }

    // Surface storage error after callback, so the caller can recover the token
    if (storageError) {
      throw storageError
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
          this.logger.error('Auto-refresh failed', {
            error: error instanceof Error ? error.message : String(error),
          })
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
   * Update the logger instance
   * @param logger - New logger to use for all SDK operations
   */
  public setLogger(logger: Logger): void {
    this.logger = logger
    this.httpClient?.setLogger(logger)
  }

  /**
   * Get the current logger instance
   */
  public getLogger(): Logger {
    return this.logger
  }

  /**
   * Update HTTP log formatting options
   * @param options - New HTTP log options
   */
  public setHttpLogOptions(options: HttpLogOptions): void {
    this.config.httpLogOptions = options
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
