// SPDX-License-Identifier: BSD-3-Clause
import { z } from 'zod'

/**
 * Schema for position information
 */
export const PositionSchema = z.object({
  symbol: z.string(),
  symbolId: z.number().int(),
  openQuantity: z.number(),
  closedQuantity: z.number(),
  currentMarketValue: z.number(),
  currentPrice: z.number(),
  averageEntryPrice: z.number(),
  closedPnl: z.number(),
  openPnl: z.number(),
  totalCost: z.number(),
  isRealTime: z.boolean(),
  isUnderReorg: z.boolean(),
})

export type Position = z.infer<typeof PositionSchema>

/**
 * Schema for positions response
 */
export const PositionsResponseSchema = z.object({
  positions: z.array(PositionSchema),
})

export type PositionsResponse = z.infer<typeof PositionsResponseSchema>

/**
 * Activity type enum
 */
export const ActivityTypeSchema = z.enum([
  'Trades',
  'Dividends',
  'Deposits',
  'Withdrawals',
  'Transfers',
  'CorporateActions',
  'ForeignExchange',
  'Fees',
  'Interest',
  'Other',
])

export type ActivityType = z.infer<typeof ActivityTypeSchema>

/**
 * Schema for activity
 */
export const ActivitySchema = z.object({
  tradeDate: z.string(), // ISO 8601 date
  transactionDate: z.string(), // ISO 8601 datetime
  settlementDate: z.string(), // ISO 8601 date
  action: z.string(),
  symbol: z.string(),
  symbolId: z.number().int(),
  description: z.string(),
  currency: z.enum(['CAD', 'USD']),
  quantity: z.number(),
  price: z.number(),
  grossAmount: z.number(),
  commission: z.number(),
  netAmount: z.number(),
  type: ActivityTypeSchema,
})

export type Activity = z.infer<typeof ActivitySchema>

/**
 * Schema for activities response
 */
export const ActivitiesResponseSchema = z.object({
  activities: z.array(ActivitySchema),
})

export type ActivitiesResponse = z.infer<typeof ActivitiesResponseSchema>

/**
 * Schema for order execution
 */
export const ExecutionSchema = z.object({
  symbol: z.string(),
  symbolId: z.number().int(),
  quantity: z.number().int(),
  side: z.enum(['Buy', 'Sell']),
  price: z.number(),
  id: z.number().int(),
  orderId: z.number().int(),
  orderChainId: z.number().int(),
  exchangeExecId: z.string(),
  timestamp: z.string(), // ISO 8601 datetime
  notes: z.string().optional(),
  venue: z.string(),
  totalCost: z.number(),
  orderPlacementCommission: z.number(),
  commission: z.number(),
  executionFee: z.number(),
  secFee: z.number(),
  canadianExecutionFee: z.number().optional(),
  parentId: z.number().int().optional(),
})

export type Execution = z.infer<typeof ExecutionSchema>

/**
 * Schema for executions response
 */
export const ExecutionsResponseSchema = z.object({
  executions: z.array(ExecutionSchema),
})

export type ExecutionsResponse = z.infer<typeof ExecutionsResponseSchema>

/**
 * Order side
 */
export const OrderSideSchema = z.enum(['Buy', 'Sell', 'Short', 'Cov', 'BTO', 'STC', 'STO', 'BTC'])

export type OrderSide = z.infer<typeof OrderSideSchema>

/**
 * Order type
 */
export const OrderTypeSchema = z.enum([
  'Market',
  'Limit',
  'Stop',
  'StopLimit',
  'TrailStopInPercentage',
  'TrailStopInDollar',
  'TrailStopLimitInPercentage',
  'TrailStopLimitInDollar',
  'LimitOnOpen',
  'LimitOnClose',
])

export type OrderType = z.infer<typeof OrderTypeSchema>

/**
 * Order state
 */
export const OrderStateSchema = z.enum([
  'Failed',
  'Pending',
  'Accepted',
  'Rejected',
  'CancelPending',
  'Canceled',
  'PartialCanceled',
  'Partial',
  'Executed',
  'ReplacePending',
  'Replaced',
  'Stopped',
  'Suspended',
  'Expired',
  'Queued',
])

export type OrderState = z.infer<typeof OrderStateSchema>

/**
 * Time in force
 */
export const TimeInForceSchema = z.enum([
  'Day',
  'GoodTillCanceled',
  'GoodTillExtendedDay',
  'GoodTillDate',
  'ImmediateOrCancel',
  'FillOrKill',
])

export type TimeInForce = z.infer<typeof TimeInForceSchema>

/**
 * Schema for order leg
 */
export const OrderLegSchema = z.object({
  id: z.number().int(),
  symbol: z.string(),
  symbolId: z.number().int(),
  openQuantity: z.number().int(),
  filledQuantity: z.number().int(),
  action: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  price: z.number().nullable().optional(),
  stopPrice: z.number().nullable().optional(),
})

export type OrderLeg = z.infer<typeof OrderLegSchema>

/**
 * Schema for order
 */
export const OrderSchema = z.object({
  id: z.number().int(),
  symbol: z.string(),
  symbolId: z.number().int(),
  totalQuantity: z.number().int(),
  openQuantity: z.number().int(),
  filledQuantity: z.number().int(),
  canceledQuantity: z.number().int(),
  side: OrderSideSchema,
  orderType: OrderTypeSchema,
  limitPrice: z.number().nullable().optional(),
  stopPrice: z.number().nullable().optional(),
  isAllOrNone: z.boolean(),
  isAnonymous: z.boolean(),
  icebergQuantity: z.number().int().nullable().optional(),
  minQuantity: z.number().int().nullable().optional(),
  avgExecPrice: z.number().nullable().optional(),
  lastExecPrice: z.number().nullable().optional(),
  source: z.string(),
  timeInForce: TimeInForceSchema,
  gtdDate: z.string().nullable().optional(), // ISO 8601 date
  state: OrderStateSchema,
  rejectionReason: z.string().optional(),
  chainId: z.number().int(),
  creationTime: z.string(), // ISO 8601 datetime
  updateTime: z.string(), // ISO 8601 datetime
  notes: z.string().optional(),
  primaryRoute: z.string(),
  secondaryRoute: z.string().optional(),
  orderRoute: z.string(),
  venueHoldingOrder: z.string().optional(),
  comissionCharged: z.number().optional(),
  exchangeOrderId: z.string().optional(),
  isSignificantShareHolder: z.boolean(),
  isInsider: z.boolean(),
  isLimitOffsetInDollar: z.boolean(),
  userId: z.number().int(),
  placementCommission: z.number().nullable().optional(),
  legs: z.array(OrderLegSchema).optional(),
  strategyType: z.string().optional(),
  triggerStopPrice: z.number().nullable().optional(),
  orderGroupId: z.number().int().optional(),
  orderClass: z.string().nullable().optional(),
})

export type Order = z.infer<typeof OrderSchema>

/**
 * Schema for orders response
 */
export const OrdersResponseSchema = z.object({
  orders: z.array(OrderSchema),
})

export type OrdersResponse = z.infer<typeof OrdersResponseSchema>
