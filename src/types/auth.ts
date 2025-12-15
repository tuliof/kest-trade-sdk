// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Schema for OAuth token response from Questrade API
 */
export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().positive(),
  api_server: z.string().url(),
})

/**
 * Type inferred from TokenResponseSchema
 */
export type TokenResponse = z.infer<typeof TokenResponseSchema>

/**
 * Request parameters for token refresh
 */
export interface RefreshTokenRequest {
  grant_type: 'refresh_token'
  refresh_token: string
}
