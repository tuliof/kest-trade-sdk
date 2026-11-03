// SPDX-License-Identifier: BSD-3-Clause

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/**
 * @throws Error if the timeout is not a positive finite number of milliseconds
 */
export function assertValidRequestTimeout(requestTimeoutMs: number): number {
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error(
      `requestTimeoutMs must be a positive finite number of milliseconds, received ${requestTimeoutMs}`,
    )
  }
  return requestTimeoutMs
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

export function describeTimeout(url: string, requestTimeoutMs: number): string {
  return `Request to ${url} timed out after ${requestTimeoutMs}ms`
}
