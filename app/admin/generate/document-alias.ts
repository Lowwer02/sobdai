/**
 * app/admin/generate/document-alias.ts
 * ----------------------------------------------------------------------------
 * KSB emergency Document Alias Bridge (application/transport boundary).
 *
 * PROVEN ROOT CAUSE (KSB document/candidate-supply diagnostic, 2026-09-04):
 * the Question Bank stores OFFICIAL document names
 * (e.g. `พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม`) while
 * Blueprint bma-education-specialist@3.0.1 registers POPULAR short names
 * (e.g. `พ.ร.บ.การศึกษาแห่งชาติ 2542`). The Engine's Document Filter matches
 * `BankMetadataRow.document` against the registry names by exact string
 * equality, so 11 of 12 Blueprint documents matched zero Bank questions and
 * the candidate pool collapsed to the 40 questions of the single document
 * whose names coincide (`การประกันคุณภาพการศึกษา`).
 *
 * THIS BRIDGE. One explicit, central, deterministic alias registry scoped by
 * EXACT Blueprint id + version. The generate transport projects each raw
 * `questions.document` through `resolveAssessmentDocumentAlias()` BEFORE the
 * Engine sees the row, so the generic Engine (Reader / Query Planner /
 * Document Filter / Generator / Solver) stays untouched and keeps comparing
 * canonical document identities normally.
 *
 * HARD SAFETY RULES (deliberate, do not "improve"):
 *  - EXPLICIT registry entries ONLY. No fuzzy matching, no Levenshtein, no
 *    substring matching, no abbreviation guessing, no year removal, no
 *    semantic matching, no regex that can merge different laws.
 *  - The ONLY normalization is trimming OUTER whitespace of the lookup key
 *    (a harmless transport artifact). Inner content must match byte-for-byte.
 *  - An unknown document value is returned UNCHANGED — never guessed,
 *    never silently mapped. Same for a value under a Blueprint identity that
 *    has no registered alias table (wrong id or wrong version → no bridge).
 *  - Original data is immutable: `questions.document`, the Blueprint
 *    Markdown, and imported Question metadata are never written. Resolution
 *    exists only in this runtime projection.
 *
 * SCOPE / LIFETIME. This is temporary infrastructure for the KSB release
 * until the document_code registry (Multi-Blueprint / OAG foundation)
 * replaces name-based document identity. Aliases registered for
 * bma-education-specialist@3.0.1 NEVER apply to another Blueprint id, another
 * version, or another package; a future version must be explicitly registered
 * here. CR-1 binding-shape semantics are explicitly OUT OF SCOPE.
 */

/** Exact executable Blueprint identity (server-registry values only). */
export interface AssessmentBlueprintIdentity {
  readonly id: string
  readonly version: string
}

/**
 * Alias registry for bma-education-specialist@3.0.1 (KSB-EDU-2026-V10).
 *
 * Keys are RAW Bank `questions.document` values verified against Production
 * (read-only RPC evidence, 2026-09-04). Values are the EXACT Document
 * Registry names the Blueprint Reader projects from the Tier Mapping table.
 * `การประกันคุณภาพการศึกษา` is intentionally ABSENT: it is already canonical
 * and must remain an exact pass-through.
 *
 * Exported (frozen) solely so tests and audits can inspect the explicit
 * mapping table; the resolver is the only runtime consumer.
 */
export const KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY: Readonly<
  Record<string, string>
> = Object.freeze({
    'การจัดทำแผนงานการจัดการศึกษา': 'การจัดทำแผนงาน/โครงการ',
    'พระราชบัญญัติการศึกษาภาคบังคับ พ.ศ. 2545': 'พ.ร.บ.การศึกษาภาคบังคับ 2545',
    'พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม':
      'พ.ร.บ.การศึกษาแห่งชาติ 2542',
    'พระราชบัญญัติข้อมูลข่าวสารของราชการ พ.ศ. 2540': 'พ.ร.บ.ข้อมูลข่าวสาร 2540',
    'พ.ร.บ.การบริหารงานและการให้บริการภาครัฐผ่านระบบดิจิทัล พ.ศ.2562':
      'พ.ร.บ.ดิจิทัลภาครัฐ 2562',
    'พระราชบัญญัติการพัฒนาเด็กปฐมวัย พ.ศ. 2562': 'พ.ร.บ.พัฒนาเด็กปฐมวัย 2562',
    'พระราชบัญญัติพื้นที่นวัตกรรมการศึกษา พ.ศ. 2562': 'พ.ร.บ.พื้นที่นวัตกรรมฯ 2562',
    'พระราชบัญญัติระเบียบข้าราชการกรุงเทพมหานครและบุคลากรกรุงเทพมหานคร พ.ศ. 2554':
      'พ.ร.บ.ระเบียบข้าราชการ กทม. 2554',
    'หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551': 'หลักสูตรแกนกลาง 2551',
    'แนวโน้มเกี่ยวกับการศึกษายุคใหม่': 'แนวโน้มการศึกษายุคใหม่',
    'แผนการศึกษาแห่งชาติ พ.ศ. 2560 – 2579': 'แผนการศึกษาแห่งชาติ 2560–2579',
  })

/**
 * All alias registries, keyed by the EXACT `<id>@<version>` executable
 * Blueprint identity. A Blueprint identity without an entry here has NO
 * bridge — its Bank rows pass through unresolved.
 */
const ASSESSMENT_DOCUMENT_ALIAS_REGISTRIES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  'bma-education-specialist@3.0.1': KSB_ASSESSMENT_DOCUMENT_ALIAS_REGISTRY,
})

/**
 * Resolve one raw Bank document value to the canonical Blueprint document
 * name for the EXACT Blueprint identity, or return the input unchanged.
 *
 * Deterministic and pure: same (identity, rawDocument) → same output; the
 * registries are frozen and never mutated.
 */
export function resolveAssessmentDocumentAlias(
  identity: AssessmentBlueprintIdentity,
  rawDocument: string
): string {
  const registry =
    ASSESSMENT_DOCUMENT_ALIAS_REGISTRIES[registryKey(identity)]
  if (registry === undefined) {
    return rawDocument
  }
  const resolved = registry[rawDocument.trim()]
  return resolved ?? rawDocument
}

/** Registry key for an exact Blueprint identity. */
function registryKey(identity: AssessmentBlueprintIdentity): string {
  return `${identity.id}@${identity.version}`
}
