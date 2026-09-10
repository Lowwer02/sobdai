export type PackageOwnershipCheck =
  | { valid: true }
  | { valid: false; reason: 'missing' | 'mismatch' }

/**
 * Packages are organization-scoped and position-scoped. The selected
 * position must belong to the selected organization; checking the two IDs
 * independently is not sufficient.
 */
export function validatePackageOrganizationPosition(
  organizationId: unknown,
  positionOrganizationId: unknown,
): PackageOwnershipCheck {
  if (typeof organizationId !== 'string' || !organizationId.trim()) {
    return { valid: false, reason: 'missing' }
  }

  if (typeof positionOrganizationId !== 'string' || !positionOrganizationId.trim()) {
    return { valid: false, reason: 'missing' }
  }

  return organizationId === positionOrganizationId
    ? { valid: true }
    : { valid: false, reason: 'mismatch' }
}

export function packageOwnershipError(check: PackageOwnershipCheck): string | null {
  if (check.valid) return null
  return check.reason === 'mismatch'
    ? 'ตำแหน่งที่เลือกไม่ได้อยู่ในหน่วยงานเดียวกับแพ็กเกจ'
    : 'ไม่พบหน่วยงานหรือตำแหน่งที่เลือก'
}
