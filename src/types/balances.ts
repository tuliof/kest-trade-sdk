// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Currency enum for Questrade API
 */
export const CurrencySchema = z.enum(['CAD', 'USD'])
export type Currency = z.infer<typeof CurrencySchema>

/**
 * Schema for a single balance record
 */
export const BalanceSchema = z.object({
  currency: CurrencySchema,
  cash: z.number(),
  marketValue: z.number(),
  totalEquity: z.number(),
  buyingPower: z.number(),
  maintenanceExcess: z.number(),
  isRealTime: z.boolean(),
})

/**
 * Type inferred from BalanceSchema
 */
export type Balance = z.infer<typeof BalanceSchema>

/**
 * Schema for account balances response
 * Contains per-currency, combined, and start-of-day (SOD) balances
 */
export const BalancesResponseSchema = z.object({
  perCurrencyBalances: z.array(BalanceSchema),
  combinedBalances: z.array(BalanceSchema),
  sodPerCurrencyBalances: z.array(BalanceSchema),
  sodCombinedBalances: z.array(BalanceSchema),
})

/**
 * Type inferred from BalancesResponseSchema
 */
export type BalancesResponse = z.infer<typeof BalancesResponseSchema>
