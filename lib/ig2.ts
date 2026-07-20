/**
 * lib/ig2.ts
 * ----------------------------------------------------------------------------
 * IG-2 axis normalization helpers (Session 6.20 E-0.7).
 *
 * Source of truth:
 *  - Content Template v2.2 Delta Amendment §5.1 (Normalization rules)
 *  - IG-2 Architecture Amendment v1.0 §6.1 (Bank schema extension)
 *
 * Pure functions only. No I/O, no side effects. Deterministic — the canonical
 * form is the persisted form the Engine's Similarity Metric (weight 0.20) and
 * L2 rule compare against. Two sections the Engine should treat as identical
 * MUST byte-compare equal after normalization.
 *
 * Extracted here (rather than living inside the importer's server-action file)
 * so the normalization is unit-testable without importing `'use server'` code.
 * The importer imports these helpers — single source of truth for the rules.
 */

/**
 * Normalize a parsed Section value to its canonical persisted form.
 *
 * Canonical form: trimmed, unicode NFC, internal whitespace runs collapsed to
 * a single space, ANY dash variant (hyphen-minus, en-dash, em-dash) surrounded
 * by non-space characters normalized to a tight en-dash '–' (U+2013) with no
 * surrounding spaces. Empty/whitespace-only input returns '' so the caller can
 * convert to NULL.
 *
 * Examples (all canonicalize to 'ม.6–8'):
 *   'ม.6-8'        — ASCII hyphen-minus
 *   'ม.6 - 8'      — spaced ASCII hyphen-minus
 *   'ม.6–8'        — already en-dash (idempotent)
 *   'ม.6 – 8'      — spaced en-dash
 *   '  ม.6-8  '    — surrounding whitespace
 *
 * Non-range values are untouched: 'มาตรา 6' → 'มาตรา 6', 'ม.6' → 'ม.6'.
 */
export function normalizeSection(raw: string): string {
  if (!raw) return ''
  // unicode NFC first — composes Thai combining sequences so visually-identical
  // strings byte-compare equal.
  let s = raw.normalize('NFC')
  // collapse internal whitespace runs to a single space, then trim
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  // range separator: ANY dash variant (hyphen-minus '-', en-dash '–' U+2013,
  // em-dash '—' U+2014) surrounded by non-space characters → tight en-dash
  // '–' with no surrounding spaces. Authors type any of these; the persisted
  // form is always the tight en-dash, so L2 and the Similarity Metric (weight
  // 0.20) byte-compare equal across all author variations.
  //
  // The non-space lookbehind/lookahead prevents a leading dash or a dash used
  // as a list bullet from being affected (those are malformed Section input
  // anyway, but defensive).
  s = s.replace(/(\S)\s*[-–—]\s*(\S)/g, '$1–$2')
  return s
}

/**
 * Normalize a parsed enum axis value (blueprint_type, learning_objective,
 * question_pattern). The DB CHECK constraint is the ultimate authority; this
 * helper just trims whitespace and returns '' for empty input so the caller
 * can convert to NULL. No case-folding — the enum is Title Case and authors
 * are told to use it verbatim (Content Template v2.2 §5.1).
 *
 * Returns '' for empty/whitespace input.
 */
export function normalizeEnumAxis(raw: string): string {
  if (!raw) return ''
  return raw.trim()
}
