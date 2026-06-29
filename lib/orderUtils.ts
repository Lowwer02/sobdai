export const ORDER_STATUS = {
  FREE: 'free',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

/**
 * Returns an array of statuses that indicate the order is successful and grants access.
 */
export const ORDER_COMPLETED_STATUSES = [ORDER_STATUS.PAID, ORDER_STATUS.FREE];

/**
 * Checks if a given order status implies the user has completed the purchase.
 */
export function isOrderCompleted(status: string | undefined | null): boolean {
  return status === ORDER_STATUS.PAID || status === ORDER_STATUS.FREE;
}

/**
 * Checks if a given order status implies the payment is pending.
 */
export function isPaymentPending(status: string | undefined | null): boolean {
  return status === ORDER_STATUS.PENDING;
}

/**
 * Checks if the user can access the package based on their order status.
 * Alias for isOrderCompleted to clearly express business intent.
 */
export function canAccessPackage(orderStatus: string | undefined | null): boolean {
  return isOrderCompleted(orderStatus);
}
