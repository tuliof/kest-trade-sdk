// SPDX-License-Identifier: BSD-3-Clause
import { AccountsClient } from '@/accounts/accounts-client'
import { AuthClient } from '@/auth/auth-client'
import {
  createTokenStorage,
  type ITokenStorage,
  isTokenStorageInstance,
  resolveTokenStorageKind,
  type TokenStorageConfig,
  TokenStorageError,
  type TokenStorageKind,
  TokenStorageType,
} from '@/auth/token-storage'
import { HttpClient } from '@/http/http-client'
import type { HttpLogOptions } from '@/http/logger'
import { assertValidRequestTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from '@/http/request-timeout'
import { createLogger, type Logger, type LogLevel, SilentLogger } from '@/logger'
import { MarketClient } from '@/market/market-client'
import type { TokenResponse } from '@/types/auth'
import { AuthenticationError } from '@/types/errors'

const AUTO_REFRESH_MAX_ATTEMPTS = 3
const DEFAULT_AUTO_REFRESH_RETRY_DELAY_MS = 1000

/**
 * A rejected refresh token or a storage failure will not be fixed by trying
 * again (the token has already been rotated in the storage case).
 */
function isRetryableRefreshError(error: unknown): boolean {
  return !(error instanceof AuthenticationError || error instanceof TokenStorageError)
}

const SEED_REFRESH_TOKEN_ENV_VAR = 'QUESTRADE_REFRESH_TOKEN'

type RefreshTokenSource = 'storage' | 'seed'

interface RefreshTokenCandidate {
  source: RefreshTokenSource
  token: string
}

function readSeedRefreshTokenFromEnv(): string {
  if (typeof process === 'undefined') return ''
  return process.env[SEED_REFRESH_TOKEN_ENV_VAR]?.trim() ?? ''
}

/**
 * The stored token is the newest one (rotated on every refresh), so it goes
 * first; the seed only bootstraps an empty storage or recovers a rejected token.
 */
export function listRefreshTokenCandidates(
  storedToken: string | null,
  seedToken: string,
): RefreshTokenCandidate[] {
  const candidates: RefreshTokenCandidate[] = []
  if (storedToken) candidates.push({ source: 'storage', token: storedToken })
  if (seedToken && seedToken !== storedToken) candidates.push({ source: 'seed', token: seedToken })
  return candidates
}

function describeRejectedTokens(
  candidates: RefreshTokenCandidate[],
  lastError: AuthenticationError,
): AuthenticationError {
  const sources = candidates.map((candidate) => candidate.source).join(' and ')
  // A rejected seed with empty storage is the signature of storage that did not
  // survive a restart, typically a container recreated without a volume
  const storageWasEmpty = candidates.every((candidate) => candidate.source === 'seed')
  const persistenceHint = storageWasEmpty
    ? ' The token storage was empty, so the rotated token from a previous run was lost. If you run in a container, persist the token storage with a volume (see TOKEN_MANAGEMENT.md, "Containers").'
    : ''
  return new AuthenticationError(
    `Questrade rejected the refresh token from ${sources}. Refresh tokens are single-use.${persistenceHint} Generate a new one in the Questrade API Centre, then run \`kest-trade-sdk login\` or set ${SEED_REFRESH_TOKEN_ENV_VAR}.`,
    lastError.apiErrorCode,
    { cause: lastError },
  )
}

/**
 * Configuration options for QuestradeClient
 */
export interface QuestradeClientConfig {
  /**
   * Seed refresh token, used only to bootstrap or recover the stored token.
   * Defaults to the QUESTRADE_REFRESH_TOKEN environment variable.
   *
   * Questrade refresh tokens are single-use, so the token in storage (rotated on
   * every refresh) always takes precedence. The seed is tried when storage is empty,
   * or when the stored token is rejected (e.g. after generating a new token in the
   * Questrade API Centre). A seed that was already consumed simply fails, so it is
   * safe to leave it configured.
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
   * Where the rotated refresh token is kept between runs.
   * - 'auto' (default): OS keychain when usable, otherwise a user-only file (0600) in the
   *   per-user config directory (headless servers, Docker, CI). Logged at WARN when the
   *   file is chosen; check with resolveTokenStorageKind().
   * - 'secure': OS keychain only (Keychain, Credential Manager, Secret Service); fails loud
   *   when it is unusable. Uses Bun.secrets under Bun and @napi-rs/keyring under Node.js.
   * - 'file': user-only file in the per-user config directory
   * - 'memory': in-memory only. Questrade rotates the token on every refresh, so after a
   *   restart the token is lost and a new one must be generated in the Questrade API Centre.
   * - A config object for any of the above, or your own ITokenStorage (e.g. a secrets
   *   manager such as AWS Secrets Manager or Vault, recommended for production servers)
   *
   * @default TokenStorageType.AUTO
   *
   * @example Custom storage
   * ```typescript
   * const client = new QuestradeClient({
   *   tokenStorage: {
   *     get: () => vault.read('questrade/refresh-token'),
   *     set: (token) => vault.write('questrade/refresh-token', token),
   *     delete: () => vault.delete('questrade/refresh-token'),
   *   },
   * })
   * ```
   */
  tokenStorage?: TokenStorageConfig | ITokenStorage

  /**
   * Auto-refresh token before expiry (default: true)
   * When enabled, tokens will be refreshed automatically when they're about to expire
   */
  autoRefresh?: boolean

  /**
   * Base delay in milliseconds between auto-refresh retries (default: 1000).
   * A failed auto-refresh is attempted up to 3 times in total, doubling the
   * delay after each failure. Rejected tokens and storage failures are not retried.
   */
  autoRefreshRetryDelayMs?: number

  /**
   * Called when auto-refresh gives up (retries exhausted, token rejected, or
   * the rotated token could not be stored). Without it, failures are only logged.
   * Errors thrown by the callback are logged and swallowed.
   *
   * @param error - The last error
   * @param attempts - Number of refresh attempts made
   */
  onAutoRefreshError?: (error: unknown, attempts: number) => void | Promise<void>

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

  /**
   * Per-request timeout in milliseconds for API and token requests.
   * A timed-out request rejects with a NetworkError.
   * @default 30000
   */
  requestTimeoutMs?: number
}

/**
 * Main Questrade SDK Client
 * Provides unified access to all Questrade API operations with automatic token management
 *
 * @example
 * ```typescript
 * import { QuestradeClient } from 'kest-trade-sdk'
 *
 * // First run: `kest-trade-sdk login` or QUESTRADE_REFRESH_TOKEN seeds the token;
 * // afterwards the rotated token is read from the default storage
 * const client = new QuestradeClient()
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
    seedRefreshToken: string
    accessToken: string
    apiServer: string
    autoRefresh: boolean
    refreshBuffer: number
    httpLogOptions: HttpLogOptions
    requestTimeoutMs: number
    autoRefreshRetryDelayMs: number
    onAutoRefreshError?: (error: unknown, attempts: number) => void | Promise<void>
    onTokenRefresh?: (tokenResponse: TokenResponse) => void | Promise<void>
  }
  private tokenStorage: ITokenStorage
  private currentToken?: TokenResponse
  private refreshTimerId?: Timer
  private inFlightRefresh?: Promise<TokenResponse>

  constructor(config: QuestradeClientConfig = {}) {
    if (Boolean(config.accessToken) !== Boolean(config.apiServer)) {
      throw new Error(
        'accessToken and apiServer must be provided together. Omit both to authenticate with a refresh token instead.',
      )
    }

    // Resolve logger: string level → ConsoleLogger, Logger instance → as-is, undefined → silent
    this.logger =
      typeof config.logger === 'string'
        ? createLogger(config.logger)
        : (config.logger ?? new SilentLogger())

    const seedRefreshToken = config.refreshToken || readSeedRefreshTokenFromEnv()

    this.config = {
      refreshToken: seedRefreshToken,
      seedRefreshToken,
      accessToken: config.accessToken || '',
      apiServer: config.apiServer || '',
      autoRefresh: config.autoRefresh ?? true,
      refreshBuffer: config.refreshBuffer ?? 60,
      httpLogOptions: {
        logRequestHeaders: true,
        logRequestBody: true,
        logResponseHeaders: true,
        logResponseBody: true,
        ...config.httpLogOptions,
      },
      requestTimeoutMs: assertValidRequestTimeout(
        config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      ),
      autoRefreshRetryDelayMs:
        config.autoRefreshRetryDelayMs ?? DEFAULT_AUTO_REFRESH_RETRY_DELAY_MS,
      onAutoRefreshError: config.onAutoRefreshError,
      onTokenRefresh: config.onTokenRefresh,
    }

    // Create token storage instance
    this.tokenStorage = isTokenStorageInstance(config.tokenStorage)
      ? config.tokenStorage
      : createTokenStorage(config.tokenStorage ?? TokenStorageType.AUTO, this.logger)

    this.authClient = new AuthClient(this.config.requestTimeoutMs)
  }

  /**
   * Initialize the client and authenticate
   * Must be called before using any API methods
   *
   * The stored refresh token is tried first, then the seed token (config
   * `refreshToken` or QUESTRADE_REFRESH_TOKEN) if storage is empty or the stored
   * token is rejected.
   *
   * @throws Error if no refresh token is available anywhere
   * @throws AuthenticationError if every available refresh token is rejected
   */
  async initialize(): Promise<void> {
    if (this.config.accessToken && this.config.apiServer) {
      this.applyCredentials(this.config.apiServer, this.config.accessToken)
      return
    }

    const candidates = listRefreshTokenCandidates(
      await this.tokenStorage.get(),
      this.config.seedRefreshToken,
    )
    if (candidates.length === 0) {
      throw new Error(
        `No refresh token available. Generate one in the Questrade API Centre, then run \`kest-trade-sdk login\` or set ${SEED_REFRESH_TOKEN_ENV_VAR}.`,
      )
    }

    for (const [index, candidate] of candidates.entries()) {
      const isLastCandidate = index === candidates.length - 1
      try {
        this.config.refreshToken = candidate.token
        await this.refreshAccessToken()
        return
      } catch (error) {
        if (!(error instanceof AuthenticationError)) throw error
        if (isLastCandidate) throw describeRejectedTokens(candidates, error)
        this.logger.warn('Refresh token rejected, trying the next source', {
          source: candidate.source,
        })
      }
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
   * Concurrent calls share a single in-flight refresh and resolve to the same result.
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
  refreshAccessToken(): Promise<TokenResponse> {
    if (this.inFlightRefresh) return this.inFlightRefresh

    // Refresh tokens are single-use: a second concurrent exchange with the
    // same token would fail, so concurrent callers share one in-flight refresh
    const refresh = this.performTokenRefresh().finally(() => {
      this.inFlightRefresh = undefined
    })
    this.inFlightRefresh = refresh
    return refresh
  }

  private async performTokenRefresh(): Promise<TokenResponse> {
    if (!this.config.refreshToken) {
      throw new Error('Cannot refresh token: no refresh token available')
    }

    const tokenResponse = await this.authClient.refreshToken(this.config.refreshToken)
    this.currentToken = tokenResponse

    // Update refresh token for next use (CRITICAL: tokens are rotated)
    this.config.refreshToken = tokenResponse.refresh_token

    // Update credentials first, so the client remains usable
    // even if token storage fails
    this.applyCredentials(tokenResponse.api_server, tokenResponse.access_token)

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
    this.clearRefreshTimer()

    const expiresAt = this.authClient.getTokenExpiresAt()
    if (!expiresAt) return

    const delay = expiresAt.getTime() - this.config.refreshBuffer * 1000 - Date.now()
    if (delay <= 0) return

    this.startRefreshTimer(delay, 1)
  }

  private startRefreshTimer(delayMs: number, attempt: number): void {
    const timer = setTimeout(() => {
      void this.attemptAutoRefresh(attempt)
    }, delayMs)
    // Auto-refresh must not keep the process alive on its own
    timer.unref?.()
    this.refreshTimerId = timer
  }

  private clearRefreshTimer(): void {
    if (!this.refreshTimerId) return
    clearTimeout(this.refreshTimerId)
    this.refreshTimerId = undefined
  }

  private async attemptAutoRefresh(attempt: number): Promise<void> {
    try {
      await this.refreshAccessToken()
      return
    } catch (error) {
      const canRetry = attempt < AUTO_REFRESH_MAX_ATTEMPTS && isRetryableRefreshError(error)
      this.logger.error('Auto-refresh failed', {
        attempt,
        willRetry: canRetry,
        error: error instanceof Error ? error.message : String(error),
      })

      if (canRetry) {
        this.startRefreshTimer(
          this.config.autoRefreshRetryDelayMs * 2 ** (attempt - 1),
          attempt + 1,
        )
        return
      }

      await this.notifyAutoRefreshFailure(error, attempt)
    }
  }

  private async notifyAutoRefreshFailure(error: unknown, attempts: number): Promise<void> {
    if (!this.config.onAutoRefreshError) return
    try {
      await this.config.onAutoRefreshError(error, attempts)
    } catch (callbackError) {
      this.logger.error('onAutoRefreshError callback threw', {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      })
    }
  }

  /**
   * Create the HttpClient and sub-clients on first use; afterwards update the
   * existing HttpClient in place so sub-clients held by callers never go stale.
   */
  private applyCredentials(apiServer: string, accessToken: string): void {
    if (this.httpClient) {
      this.httpClient.updateCredentials(apiServer, accessToken)
      return
    }

    this.httpClient = new HttpClient(
      apiServer,
      accessToken,
      this.logger,
      this.config.httpLogOptions,
      this.config.requestTimeoutMs,
    )
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
    this.httpClient?.setLogOptions(options)
  }

  /**
   * Where the refresh token is kept. For the default 'auto' storage this
   * probes the OS keychain (once) and reports 'secure' or 'file'.
   */
  resolveTokenStorageKind(): Promise<TokenStorageKind> {
    return resolveTokenStorageKind(this.tokenStorage)
  }

  /**
   * Check if the current token is expired
   *
   * @throws Error in access-token-only mode (accessToken + apiServer), where the
   * expiry time is unknown and a boolean answer would be a guess. Use a
   * refreshToken if you need expiry tracking.
   */
  isTokenExpired(): boolean {
    this.assertTokenExpiryIsKnown('isTokenExpired')
    return this.authClient.isTokenExpired()
  }

  /**
   * Check if the current token will expire soon
   *
   * @throws Error in access-token-only mode (accessToken + apiServer); see isTokenExpired
   */
  isTokenExpiringSoon(bufferSeconds?: number): boolean {
    this.assertTokenExpiryIsKnown('isTokenExpiringSoon')
    return this.authClient.isTokenExpiringSoon(bufferSeconds)
  }

  private assertTokenExpiryIsKnown(methodName: string): void {
    if (!this.isAccessTokenOnlyMode()) return
    throw new Error(
      `${methodName}() is unavailable in access-token-only mode: the expiry time of a caller-supplied access token is unknown. Provide a refreshToken to enable expiry tracking.`,
    )
  }

  private isAccessTokenOnlyMode(): boolean {
    return Boolean(this.config.accessToken && this.config.apiServer)
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
    this.clearRefreshTimer()
  }
}
