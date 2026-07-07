/**
 * Curated Subject list for Question / Summary content classification.
 *
 * This is the first-class content taxonomy (Level 1) for Sobdai, as proposed
 * in `content_architecture_foundation.md` (Subject Foundation).
 *
 * Design decisions:
 *  - Pure constant — no DB table, no query. This keeps Subject Foundation
 *    "SAFE" (no schema change) while normalizing free-text subjects into a
 *    controlled vocabulary.
 *  - The Thai label is what users see; the code is what we recommend storing
 *    in `subject` columns for consistency. Old free-text values keep working
 *    (backward compatible — see `UNASSIGNED_SUBJECT` + normalization helpers).
 *  - When a record has no subject, group it under "ยังไม่กำหนด Subject"
 *    rather than hiding it.
 */

export interface SubjectOption {
  /** Stable code to store — recommended canonical value. */
  code: string
  /** Display label (Thai). */
  label: string
}

/**
 * The canonical Subject vocabulary. Keep ordering stable — it drives dropdown
 * order in admin + filter pill order on summary navigation.
 */
export const SUBJECTS: readonly SubjectOption[] = [
  { code: 'law', label: 'กฎหมาย' },
  { code: 'policy', label: 'นโยบายและแผน' },
  { code: 'economics', label: 'เศรษฐศาสตร์' },
  { code: 'administration', label: 'การบริหาร' },
  { code: 'english', label: 'ภาษาอังกฤษ' },
  { code: 'technology', label: 'เทคโนโลยีสารสนเทศ' },
  { code: 'math', label: 'คณิตศาสตร์' },
] as const

/** Sentinel for records with no subject set. Used as a filter value + label. */
export const UNASSIGNED_SUBJECT = {
  code: '__unassigned__',
  label: 'ยังไม่กำหนด Subject',
} as const

/**
 * Map a stored `subject` value (from DB, possibly free-text / legacy) to a
 * display label. Falls back to the raw value if it isn't in the curated list
 * (so existing data is never hidden), and to `UNASSIGNED_SUBJECT.label` when
 * empty/null.
 */
export function getSubjectLabel(subject: string | null | undefined): string {
  if (!subject || !subject.trim()) return UNASSIGNED_SUBJECT.label
  const found = SUBJECTS.find((s) => s.code === subject || s.label === subject)
  return found ? found.label : subject
}

/**
 * Options for a `<select>` dropdown: every curated subject plus the "unassigned"
 * entry at the end. The empty string option ("All Subjects" / "เลือก Subject")
 * should be added by the caller as the first `<option>` if needed.
 */
export function getSubjectDropdownOptions(): SubjectOption[] {
  return [...SUBJECTS, { code: UNASSIGNED_SUBJECT.code, label: UNASSIGNED_SUBJECT.label }]
}

/**
 * Returns true if the given subject value should be considered "unassigned"
 * (empty string, null, undefined, or the sentinel code).
 */
export function isUnassignedSubject(subject: string | null | undefined): boolean {
  return !subject || !subject.trim() || subject === UNASSIGNED_SUBJECT.code
}
