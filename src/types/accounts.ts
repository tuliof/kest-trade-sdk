// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Schema for a single account
 */
export const AccountSchema = z.object({
  type: z.string(),
  number: z.string(),
  status: z.string(),
  isPrimary: z.boolean(),
  isBilling: z.boolean(),
  clientAccountType: z.string(),
})

/**
 * Type inferred from AccountSchema
 */
export type Account = z.infer<typeof AccountSchema>

/**
 * Schema for accounts list response
 */
export const AccountsResponseSchema = z.object({
  accounts: z.array(AccountSchema),
  userId: z.number(),
})

/**
 * Type inferred from AccountsResponseSchema
 */
export type AccountsResponse = z.infer<typeof AccountsResponseSchema>
