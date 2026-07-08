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
  createTokenStorage,
  type EnvStorageConfig,
  EnvTokenStorage,
  type ITokenStorage,
  type MemoryStorageConfig,
  MemoryTokenStorage,
  type SecureStorageConfig,
  SecureTokenStorage,
  type StorageConfig,
  type TokenStorageConfig,
  TokenStorageType,
  type TokenStorageTypeValue,
} from './auth/token-storage'
// Main client
export { QuestradeClient, type QuestradeClientConfig } from './client'
export { HttpClient } from './http/http-client'
// Logger
export {
  HttpLogger,
  type LogEntry,
  type LoggerOptions,
  type LogLevel,
  redactToken,
} from './http/logger'
export { MarketClient } from './market/market-client'
export type {
  // Account types
  Account,
  AccountsResponse,
} from './types/accounts'
// Type definitions
export type {
  // Auth types
  TokenResponse,
} from './types/auth'

export type {
  // Balance types
  Balance,
  BalancesResponse,
  Currency,
} from './types/balances'
export {
  type APIError,
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
  OrdersResponse,
  OrderType,
  // Position types
  Position,
  PositionsResponse,
  TimeInForce,
} from './types/positions'
