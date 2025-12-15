// SPDX-License-Identifier: BSD-3-Clause
import type { HttpClient } from '@/http/http-client'
import { type AccountsResponse, AccountsResponseSchema } from '@/types/accounts'
import { type BalancesResponse, BalancesResponseSchema } from '@/types/balances'
import { ValidationError } from '@/types/errors'
import {
  type ActivitiesResponse,
  ActivitiesResponseSchema,
  type ExecutionsResponse,
  ExecutionsResponseSchema,
  type OrdersResponse,
  OrdersResponseSchema,
  type PositionsResponse,
  PositionsResponseSchema,
} from '@/types/positions'

/**
 * AccountsClient handles account-related operations
 * - Get list of accounts
 * - Get account balances
 * - Get account positions
 * - Get account activities
 * - Get account executions
 * - Get account orders
 */
export class AccountsClient {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get list of accounts for the authenticated user
   * @returns Array of accounts with userId
   */
  async getAccounts(): Promise<AccountsResponse> {
    const response = await this.httpClient.get<unknown>('/v1/accounts')

    const validationResult = AccountsResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid accounts response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get balances for a specific account
   * @param accountNumber - The account number (e.g., "52138123")
   * @returns Balance information for the account
   */
  async getBalances(accountNumber: string): Promise<BalancesResponse> {
    const response = await this.httpClient.get<unknown>(`/v1/accounts/${accountNumber}/balances`)

    const validationResult = BalancesResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid balances response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get positions for a specific account
   * @param accountNumber - The account number
   * @returns Position information for the account
   */
  async getPositions(accountNumber: string): Promise<PositionsResponse> {
    const response = await this.httpClient.get<unknown>(`/v1/accounts/${accountNumber}/positions`)

    const validationResult = PositionsResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid positions response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get activities for a specific account
   * @param accountNumber - The account number
   * @param startTime - Start date/time
   * @param endTime - End date/time
   * @returns Activity information for the account
   */
  async getActivities(
    accountNumber: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ActivitiesResponse> {
    // Validate date range (max 31 days)
    const daysDiff = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 31) {
      throw new ValidationError('Date range cannot exceed 31 days', [])
    }

    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${accountNumber}/activities?${params}`,
    )

    const validationResult = ActivitiesResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid activities response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get executions for a specific account
   * @param accountNumber - The account number
   * @param startTime - Start date/time
   * @param endTime - End date/time
   * @returns Execution information for the account
   */
  async getExecutions(
    accountNumber: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ExecutionsResponse> {
    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${accountNumber}/executions?${params}`,
    )

    const validationResult = ExecutionsResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid executions response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }

  /**
   * Get orders for a specific account
   * @param accountNumber - The account number
   * @param startTime - Start date/time
   * @param endTime - End date/time
   * @param stateFilter - Optional order state filter (e.g., 'All', 'Open', 'Closed')
   * @returns Order information for the account
   */
  async getOrders(
    accountNumber: string,
    startTime: Date,
    endTime: Date,
    stateFilter?: string,
  ): Promise<OrdersResponse> {
    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    if (stateFilter) {
      params.append('stateFilter', stateFilter)
    }

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${accountNumber}/orders?${params}`,
    )

    const validationResult = OrdersResponseSchema.safeParse(response)
    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid orders response from Questrade API',
        validationResult.error.issues,
      )
    }

    return validationResult.data
  }
}
