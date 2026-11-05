// SPDX-License-Identifier: BSD-3-Clause
import { ValidationError } from '@/types/errors'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * @throws ValidationError if either date is invalid or endTime is before startTime
 */
export function assertValidDateRange(startTime: Date, endTime: Date): void {
  if (!isValidDate(startTime)) {
    throw new ValidationError('startTime must be a valid Date', [])
  }
  if (!isValidDate(endTime)) {
    throw new ValidationError('endTime must be a valid Date', [])
  }
  if (endTime.getTime() < startTime.getTime()) {
    throw new ValidationError('endTime must not be before startTime', [])
  }
}

/**
 * @throws ValidationError if the (already valid) range is longer than maxDays
 */
export function assertDateRangeWithinDays(startTime: Date, endTime: Date, maxDays: number): void {
  const days = (endTime.getTime() - startTime.getTime()) / MILLISECONDS_PER_DAY
  if (days > maxDays) {
    throw new ValidationError(`Date range cannot exceed ${maxDays} days`, [])
  }
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime())
}
