/**
 * app/admin/generate/document-identity.ts
 * ----------------------------------------------------------------------------
 * Pure deterministic resolver for document canonicalization at the adapter boundary.
 */

const DOCUMENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม': 'พ.ร.บ.การศึกษาแห่งชาติ 2542',
  'พระราชบัญญัติระเบียบข้าราชการกรุงเทพมหานครและบุคลากรกรุงเทพมหานคร พ.ศ. 2554': 'พ.ร.บ.ระเบียบข้าราชการ กทม. 2554',
  'หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551': 'หลักสูตรแกนกลาง 2551',
  'การประกันคุณภาพการศึกษา': 'การประกันคุณภาพการศึกษา',
  'การจัดทำแผนงานการจัดการศึกษา': 'การจัดทำแผนงาน/โครงการ',
  'แผนการศึกษาแห่งชาติ พ.ศ. 2560 – 2579': 'แผนการศึกษาแห่งชาติ 2560–2579',
  'พระราชบัญญัติการศึกษาภาคบังคับ พ.ศ. 2545': 'พ.ร.บ.การศึกษาภาคบังคับ 2545',
  'พระราชบัญญัติการพัฒนาเด็กปฐมวัย พ.ศ. 2562': 'พ.ร.บ.พัฒนาเด็กปฐมวัย 2562',
  'พระราชบัญญัติพื้นที่นวัตกรรมการศึกษา พ.ศ. 2562': 'พ.ร.บ.พื้นที่นวัตกรรมฯ 2562',
  'พ.ร.บ.การบริหารงานและการให้บริการภาครัฐผ่านระบบดิจิทัล พ.ศ.2562': 'พ.ร.บ.ดิจิทัลภาครัฐ 2562',
  'พระราชบัญญัติข้อมูลข่าวสารของราชการ พ.ศ. 2540': 'พ.ร.บ.ข้อมูลข่าวสาร 2540',
  'แนวโน้มเกี่ยวกับการศึกษายุคใหม่': 'แนวโน้มการศึกษายุคใหม่'
})

/**
 * Resolves a document string to its canonical Blueprint document name.
 * 
 * 1. Known legacy/bank document string -> return exact canonical Blueprint document name.
 * 2. Already-canonical Blueprint document name -> return unchanged.
 * 3. Unknown/unmapped document -> return unchanged.
 * 
 * This is an explicit V1 mapping. No fuzzy matching, normalizations, or substring matching.
 */
export function resolveDocumentIdentity(document: string): string {
  if (Object.prototype.hasOwnProperty.call(DOCUMENT_ALIASES, document)) {
    return DOCUMENT_ALIASES[document]
  }
  return document
}
