// SPDX-License-Identifier: BSD-3-Clause
import { type TokenResponse, TokenResponseSchema } from '@/types/auth'
import { AuthenticationError, NetworkError, ValidationError } from '@/types/errors'

/**
 * AuthClient handles OAuth token management for Questrade API
 * Responsible for refreshing access tokens using refresh tokens
 */
export class AuthClient {
  private static readonly TOKEN_ENDPOINT = 'https://login.questrade.com/oauth2/token'

  private tokenExpiresAt?: Date
  private currentToken?: TokenResponse

  /**
   * Refresh an access token using a refresh token
   * @param refreshToken - The refresh token to exchange
   * @returns New token response with access_token, refresh_token, and api_server
   */
  public async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Prepare form data for token refresh
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })

      // Make request to Questrade token endpoint
      const response = await fetch(AuthClient.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      // Handle error responses
      if (!response.ok) {
        await this.handleErrorResponse(response)
      }

      // Parse and validate response
      const data = await response.json()
      const validationResult = TokenResponseSchema.safeParse(data)

      if (!validationResult.success) {
        throw new ValidationError(
          'Invalid token response from Questrade API',
          validationResult.error.issues,
        )
      }

      const tokenResponse = validationResult.data

      // Store token and calculate expiration
      this.currentToken = tokenResponse
      this.tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000)

      return tokenResponse
    } catch (error) {
      // Re-throw our custom errors
      if (
        error instanceof AuthenticationError ||
        error instanceof NetworkError ||
        error instanceof ValidationError
      ) {
        throw error
      }

      // Wrap unexpected errors
      throw new NetworkError('Token refresh failed', undefined, undefined, {
        cause: error,
      })
    }
  }

  /**
   * Get the expiration time of the current token
   * @returns Date when token expires, or undefined if no token
   */
  public getTokenExpiresAt(): Date | undefined {
    return this.tokenExpiresAt
  }

  /**
   * Check if the current token is expired
   * @returns true if token is expired or no token exists
   */
  public isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) {
      return true
    }
    return Date.now() >= this.tokenExpiresAt.getTime()
  }

  /**
   * Check if token will expire soon (within buffer seconds)
   * @param bufferSeconds - Seconds before expiry to consider "expiring soon" (default: 60)
   * @returns true if token expires within buffer time
   */
  public isTokenExpiringSoon(bufferSeconds = 60): boolean {
    if (!this.tokenExpiresAt) {
      return true
    }
    const expiryWithBuffer = this.tokenExpiresAt.getTime() - bufferSeconds * 1000
    return Date.now() >= expiryWithBuffer
  }

  /**
   * Get the current token response (if available)
   * @returns Current token response or undefined
   */
  public getCurrentToken(): TokenResponse | undefined {
    return this.currentToken
  }

  /**
   * Handle error responses from token endpoint
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const statusCode = response.status
    let errorMessage = `HTTP ${statusCode} error`
    let apiErrorCode: number | undefined

    try {
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorBody = (await response.json()) as {
          code?: number
          message?: string
          error_description?: string
        }

        // Extract error code if available
        if (typeof errorBody.code === 'number') {
          apiErrorCode = errorBody.code
        }

        // Extract error message
        if (errorBody.error_description) {
          errorMessage = errorBody.error_description
        } else if (errorBody.message) {
          errorMessage = errorBody.message
        }
      } else {
        const textBody = await response.text()
        if (textBody) {
          errorMessage = textBody
        }
      }
    } catch {
      // Use default error message if parsing fails
    }

    // OAuth endpoints typically return 401 for invalid tokens
    if (statusCode === 401 || statusCode === 403) {
      throw new AuthenticationError(errorMessage || 'Authentication failed', apiErrorCode)
    }

    throw new NetworkError(errorMessage || 'Server error', statusCode, apiErrorCode)
  }
}
