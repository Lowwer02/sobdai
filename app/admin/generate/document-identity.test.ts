/**
 * app/admin/generate/document-identity.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for pure document identity resolver (PHASE 3F5-E3D1).
 *
 * RUN: npx jiti app/admin/generate/document-identity.test.ts
 */

import assert from 'node:assert/strict'
import { resolveDocumentIdentity } from './document-identity'

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_12_real_bank_documents(): void {
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม'),
    'พ.ร.บ.การศึกษาแห่งชาติ 2542'
  )
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติระเบียบข้าราชการกรุงเทพมหานครและบุคลากรกรุงเทพมหานคร พ.ศ. 2554'),
    'พ.ร.บ.ระเบียบข้าราชการ กทม. 2554'
  )
  assert.equal(
    resolveDocumentIdentity('หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551'),
    'หลักสูตรแกนกลาง 2551'
  )
  assert.equal(
    resolveDocumentIdentity('การประกันคุณภาพการศึกษา'),
    'การประกันคุณภาพการศึกษา'
  )
  assert.equal(
    resolveDocumentIdentity('การจัดทำแผนงานการจัดการศึกษา'),
    'การจัดทำแผนงาน/โครงการ'
  )
  assert.equal(
    resolveDocumentIdentity('แผนการศึกษาแห่งชาติ พ.ศ. 2560 – 2579'),
    'แผนการศึกษาแห่งชาติ 2560–2579'
  )
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติการศึกษาภาคบังคับ พ.ศ. 2545'),
    'พ.ร.บ.การศึกษาภาคบังคับ 2545'
  )
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติการพัฒนาเด็กปฐมวัย พ.ศ. 2562'),
    'พ.ร.บ.พัฒนาเด็กปฐมวัย 2562'
  )
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติพื้นที่นวัตกรรมการศึกษา พ.ศ. 2562'),
    'พ.ร.บ.พื้นที่นวัตกรรมฯ 2562'
  )
  assert.equal(
    resolveDocumentIdentity('พ.ร.บ.การบริหารงานและการให้บริการภาครัฐผ่านระบบดิจิทัล พ.ศ.2562'),
    'พ.ร.บ.ดิจิทัลภาครัฐ 2562'
  )
  assert.equal(
    resolveDocumentIdentity('พระราชบัญญัติข้อมูลข่าวสารของราชการ พ.ศ. 2540'),
    'พ.ร.บ.ข้อมูลข่าวสาร 2540'
  )
  assert.equal(
    resolveDocumentIdentity('แนวโน้มเกี่ยวกับการศึกษายุคใหม่'),
    'แนวโน้มการศึกษายุคใหม่'
  )
}

function test_canonical_names_resolve_to_themselves(): void {
  const canonicals = [
    'พ.ร.บ.การศึกษาแห่งชาติ 2542',
    'พ.ร.บ.ระเบียบข้าราชการ กทม. 2554',
    'หลักสูตรแกนกลาง 2551',
    'การประกันคุณภาพการศึกษา',
    'การจัดทำแผนงาน/โครงการ',
    'แผนการศึกษาแห่งชาติ 2560–2579',
    'พ.ร.บ.การศึกษาภาคบังคับ 2545',
    'พ.ร.บ.พัฒนาเด็กปฐมวัย 2562',
    'พ.ร.บ.พื้นที่นวัตกรรมฯ 2562',
    'พ.ร.บ.ดิจิทัลภาครัฐ 2562',
    'พ.ร.บ.ข้อมูลข่าวสาร 2540',
    'แนวโน้มการศึกษายุคใหม่'
  ]

  for (const c of canonicals) {
    assert.equal(resolveDocumentIdentity(c), c)
  }
}

function test_intentionally_unmapped_13th_document(): void {
  const doc = 'แผนพัฒนาการศึกษากรุงเทพมหานคร พ.ศ. 2568 - 2570'
  assert.equal(resolveDocumentIdentity(doc), doc)
}

function test_arbitrary_unknown_document(): void {
  assert.equal(resolveDocumentIdentity('Unknown Document 123'), 'Unknown Document 123')
  assert.equal(resolveDocumentIdentity(''), '')
  assert.equal(resolveDocumentIdentity('  '), '  ')
}

function test_similar_but_not_exact_strings(): void {
  // spacing
  const doubleSpace = 'หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน  พุทธศักราช 2551'
  assert.equal(resolveDocumentIdentity(doubleSpace), doubleSpace)

  // punctuation
  const diffPunct = 'พ.ร.บ.การบริหารงานและการให้บริการภาครัฐผ่านระบบดิจิทัล พ.ศ. 2562'
  assert.equal(resolveDocumentIdentity(diffPunct), diffPunct)
}

function test_deterministic(): void {
  const input = 'พระราชบัญญัติการศึกษาแห่งชาติ พ.ศ. 2542 และที่แก้ไขเพิ่มเติม'
  const out1 = resolveDocumentIdentity(input)
  const out2 = resolveDocumentIdentity(input)
  const out3 = resolveDocumentIdentity(input)

  assert.equal(out1, 'พ.ร.บ.การศึกษาแห่งชาติ 2542')
  assert.equal(out2, 'พ.ร.บ.การศึกษาแห่งชาติ 2542')
  assert.equal(out3, 'พ.ร.บ.การศึกษาแห่งชาติ 2542')
}

function test_no_mutation_during_calls(): void {
  const doc = 'การประกันคุณภาพการศึกษา'
  assert.equal(resolveDocumentIdentity(doc), 'การประกันคุณภาพการศึกษา')
  assert.equal(resolveDocumentIdentity(doc), 'การประกันคุณภาพการศึกษา')
}

// Run all tests
const tests = [
  test_12_real_bank_documents,
  test_canonical_names_resolve_to_themselves,
  test_intentionally_unmapped_13th_document,
  test_arbitrary_unknown_document,
  test_similar_but_not_exact_strings,
  test_deterministic,
  test_no_mutation_during_calls,
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(err)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
