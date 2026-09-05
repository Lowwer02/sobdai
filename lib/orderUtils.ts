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

/**
 * The package projection embedded in an order query. Supabase returns a
 * to-one relation as an object, but accepting an array here keeps the access
 * projection safe if the relation metadata is represented differently by a
 * client or test double.
 */
export interface PackageAccessOrderRow<TPackage extends { id: string; is_published: boolean }> {
  status?: string | null;
  packages?: TPackage | TPackage[] | null;
}

/**
 * Resolve the packages a learner can currently use from their order rows.
 *
 * `orders` remains the authority for entitlement. The first qualifying row is
 * retained (the page query orders newest first), duplicate package orders are
 * collapsed, and unpublished packages are never exposed as usable content.
 */
export function selectAccessiblePackages<TPackage extends { id: string; is_published: boolean }>(
  orders: readonly PackageAccessOrderRow<TPackage>[],
): TPackage[] {
  const seenPackageIds = new Set<string>();
  const accessiblePackages: TPackage[] = [];

  for (const order of orders) {
    if (!canAccessPackage(order.status)) continue;

    const packageValue = order.packages;
    const pkg = Array.isArray(packageValue) ? packageValue[0] : packageValue;
    if (!pkg || !pkg.id || !pkg.is_published || seenPackageIds.has(pkg.id)) continue;

    seenPackageIds.add(pkg.id);
    accessiblePackages.push(pkg);
  }

  return accessiblePackages;
}
