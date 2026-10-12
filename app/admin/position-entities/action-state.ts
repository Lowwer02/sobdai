export type PositionEntitySaveResult =
  | { ok: true; entityId: string; entitySlug: string }
  | { ok: false; error: string }

export type MappingOwnerEntity = {
  id: string
  slug: string
  name: string
}

export type SearchedOperationalPosition = {
  id: string
  code: string | null
  name: string
  organizationId: string | null
  organizationName: string | null
  /** Canonical entity currently owning this position, if any. */
  owningEntity: MappingOwnerEntity | null
}

export type SearchOperationalPositionsResult =
  | { ok: true; positions: SearchedOperationalPosition[]; hasMore: boolean }
  | { ok: false; error: string }

export type ReplaceMappingsResult =
  | { ok: true; entityId: string; mappedCount: number; mappedIds: string[] }
  | { ok: false; error: string; stale?: boolean; currentIds?: string[] }
