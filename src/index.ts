// SPDX-License-Identifier: BSD-3-Clause
/**
 * Questrade TypeScript SDK
 *
 * A TypeScript SDK for the Questrade API, built with Bun.
 * Provides type-safe access to account information, market data, and automated token management.
 */

// Sub-clients
export { AccountsClient } from './accounts/accounts-client'
export { AuthClient } from './auth/auth-client'
// Token Storage
export {
  type AutoStorageBackendKind,
  type AutoStorageConfig,
  AutoTokenStorage,
  createTokenStorage,
  type EnvStorageConfig,
  EnvTokenStorage,
  type FileStorageConfig,
  FileTokenStorage,
  type ITokenStorage,
  isTokenStorageInstance,
  type KeychainProbeResult,
  type KeychainRuntime,
  loadKeychainBackend,
  type MemoryStorageConfig,
  MemoryTokenStorage,
  type NodeKeyringModule,
  resolveDefaultTokenFilePath,
  resolveTokenStorageKind,
  type SecretsBackend,
  type SecureStorageConfig,
  SecureTokenStorage,
  type StorageConfig,
  type TokenStorageConfig,
  TokenStorageError,
  type TokenStorageKind,
  TokenStorageType,
  type TokenStorageTypeValue,
} from './auth/token-storage'
// Main client
export { QuestradeClient, type QuestradeClientConfig } from './client'
export { HttpClient } from './http/http-client'
// HTTP logging utilities
export { type HttpLogOptions, type LogEntry, redactToken } from './http/logger'
// Logger
export {
  ConsoleLogger,
  createLogger,
  type LogContext,
  type Logger,
  type LogLevel,
  SilentLogger,
} from './logger'
export { MarketClient } from './market/market-client'
export type {
  // Account types
  Account,
  AccountsResponse,
} from './types/accounts'
// Zod schemas
export {
  AccountSchema,
  AccountsResponseSchema,
} from './types/accounts'
// Type definitions
export type {
  // Auth types
  TokenResponse,
} from './types/auth'
export { TokenResponseSchema } from './types/auth'
export type {
  // Balance types
  Balance,
  BalancesResponse,
  Currency,
} from './types/balances'
export {
  BalanceSchema,
  BalancesResponseSchema,
  CurrencySchema,
} from './types/balances'
export {
  type APIError,
  APIErrorSchema,
  AuthenticationError,
  NetworkError,
  // Error types
  QuestradeError,
  RateLimitError,
  ValidationError,
} from './types/errors'
export type {
  Candle,
  CandleInterval,
  CandlesResponse,
  ListingExchange,
  Market,
  MarketsResponse,
  OptionChainEntry,
  OptionChainResponse,
  OptionType,
  Quote,
  QuotesResponse,
  SecurityType,
  // Market types
  Symbol,
  SymbolSearchResponse,
  SymbolsResponse,
} from './types/market'
export {
  CandleIntervalSchema,
  CandleSchema,
  CandlesResponseSchema,
  ListingExchangeSchema,
  MarketSchema,
  MarketsResponseSchema,
  OptionChainEntrySchema,
  OptionChainResponseSchema,
  OptionTypeSchema,
  QuoteSchema,
  QuotesResponseSchema,
  SecurityTypeSchema,
  SymbolSchema,
  SymbolSearchResponseSchema,
  SymbolSearchResultSchema,
  SymbolsResponseSchema,
} from './types/market'
export type {
  ActivitiesResponse,
  Activity,
  ActivityType,
  Execution,
  ExecutionsResponse,
  Order,
  OrderLeg,
  OrderSide,
  OrderState,
  OrderStateFilter,
  OrdersResponse,
  OrderType,
  // Position types
  Position,
  PositionsResponse,
  TimeInForce,
} from './types/positions'
export {
  ActivitiesResponseSchema,
  ActivitySchema,
  ActivityTypeSchema,
  ExecutionSchema,
  ExecutionsResponseSchema,
  OrderLegSchema,
  OrderSchema,
  OrderSideSchema,
  OrderStateFilterSchema,
  OrderStateSchema,
  OrdersResponseSchema,
  OrderTypeSchema,
  PositionSchema,
  PositionsResponseSchema,
  TimeInForceSchema,
} from './types/positions'
