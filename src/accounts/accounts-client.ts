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
  type OrderStateFilter,
  OrderStateFilterSchema,
  type OrdersResponse,
  OrdersResponseSchema,
  type PositionsResponse,
  PositionsResponseSchema,
} from '@/types/positions'
import { assertDateRangeWithinDays, assertValidDateRange } from '@/validation'

const MAX_ACTIVITIES_RANGE_DAYS = 31

function parseStateFilter(stateFilter: unknown): OrderStateFilter | undefined {
  if (stateFilter === undefined) return undefined
  const parsed = OrderStateFilterSchema.safeParse(stateFilter)
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid stateFilter ${JSON.stringify(stateFilter)}: expected 'All', 'Open' or 'Closed'`,
      parsed.error.issues,
    )
  }
  return parsed.data
}

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
    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${encodeURIComponent(accountNumber)}/balances`,
    )

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
    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${encodeURIComponent(accountNumber)}/positions`,
    )

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
   * @param endTime - End date/time (at most 31 days after startTime)
   * @throws ValidationError if a date is invalid, endTime is before startTime, or the range exceeds 31 days
   * @returns Activity information for the account
   */
  async getActivities(
    accountNumber: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ActivitiesResponse> {
    assertValidDateRange(startTime, endTime)
    assertDateRangeWithinDays(startTime, endTime, MAX_ACTIVITIES_RANGE_DAYS)

    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${encodeURIComponent(accountNumber)}/activities?${params}`,
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
    assertValidDateRange(startTime, endTime)

    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${encodeURIComponent(accountNumber)}/executions?${params}`,
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
   * @param stateFilter - Optional order state filter: 'All', 'Open' or 'Closed'
   * @throws ValidationError if stateFilter is not one of the allowed values
   * @returns Order information for the account
   */
  async getOrders(
    accountNumber: string,
    startTime: Date,
    endTime: Date,
    stateFilter?: OrderStateFilter,
  ): Promise<OrdersResponse> {
    assertValidDateRange(startTime, endTime)
    const parsedStateFilter = parseStateFilter(stateFilter)

    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    })

    if (parsedStateFilter) {
      params.append('stateFilter', parsedStateFilter)
    }

    const response = await this.httpClient.get<unknown>(
      `/v1/accounts/${encodeURIComponent(accountNumber)}/orders?${params}`,
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
