# News → Agency attribution: explicit backfill is a separate data-ops step

Status note for Entity Discovery V1 (no production data was mutated by that task).

## Current production state (at audit time)

- 46 published News rows.
- 0 rows carry an explicit `news.organization_id` (column exists since migration 102).
- 2 news rows derive an Agency through their package relations.

## How discovery behaves today

`/news/[slug]` resolves its Agency chips with a strict priority (see
`resolveNewsAgencyOrganizationIds` in `lib/agency-profile.ts`):

1. A non-null `news.organization_id` is authoritative and exclusive —
   package-derived organizations can neither override it nor add to it.
2. A NULL explicit value falls back to the distinct organizations of the
   related packages (junction `sort_order`, first-occurrence order).
3. Neither signal renders no Agency chip.

Because every current row is NULL, production news Agency chips today are
purely package-derived — the code is already correct for that state.

## The remaining step

Populating `news.organization_id` deterministically (operator-reviewed,
relation-driven only — no title/tag/name matching, no fuzzy backfill) is a
**separate data-ops task**. It is intentionally not automated here: a wrong
attribution becomes an authoritative wrong link, so each set value must be
reviewable before it ships.
