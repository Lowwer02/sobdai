import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { validateNewsDraft, validateNewsForPublish, parseDate, parseApplicationDeadline } from './news.ts'

const validBasePublishPayload = {
  title: 'กรมการแพทย์ เปิดรับสมัครบุคคลเพื่อเลือกสรรเป็นพนักงานกระทรวงสาธารณสุข',
  slug: 'dms-medical-recruitment-2026',
  excerpt: 'กรมการแพทย์เปิดรับสมัครบุคคลเพื่อเลือกสรรเป็นพนักงานกระทรวงสาธารณสุขทั่วไป 10 อัตรา',
  body_markdown: '## รายละเอียดการรับสมัคร\n\nกรมการแพทย์เปิดรับสมัคร...',
  cover_image_url: 'https://example.com/cover.jpg',
  cover_image_alt: 'รูปปกข่าวรับสมัครกรมการแพทย์',
  category: 'เปิดรับสมัครสอบ',
  gp_exam_requirement: 'not_required',
  source_name: 'กรมการแพทย์',
  source_url: 'https://hr-dms.thaijobjob.com',
  source_date: null,
}

test('1. Draft + all sources blank is allowed', () => {
  const result = validateNewsDraft({
    title: 'ร่างข่าวรับสมัครงานใหม่',
    source_name: '',
    source_url: '',
    source_date: '',
  })
  assert.equal(result.ok, true)
  assert.equal(result.errors.source_name, undefined)
  assert.equal(result.errors.source_url, undefined)
  assert.equal(result.errors.source_date, undefined)
})

test('2. Publish + all sources blank is rejected', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: '',
    source_url: '',
    source_date: '',
  })
  assert.equal(result.ok, false)
  assert.equal(result.errors.source_name, 'กรุณาระบุชื่อแหล่งข้อมูลก่อนเผยแพร่')
  assert.equal(result.errors.source_url, 'กรุณาระบุ URL แหล่งข้อมูลก่อนเผยแพร่')
})

test('3. Publish + source_name only is rejected', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: 'กรมการแพทย์',
    source_url: '',
    source_date: '',
  })
  assert.equal(result.ok, false)
  assert.equal(result.errors.source_name, undefined)
  assert.equal(result.errors.source_url, 'กรุณาระบุ URL แหล่งข้อมูลก่อนเผยแพร่')
})

test('4. Publish + source_url only is rejected', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: '',
    source_url: 'https://hr-dms.thaijobjob.com',
    source_date: '',
  })
  assert.equal(result.ok, false)
  assert.equal(result.errors.source_name, 'กรุณาระบุชื่อแหล่งข้อมูลก่อนเผยแพร่')
  assert.equal(result.errors.source_url, undefined)
})

test('5. Publish + source_name + invalid URL is rejected', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: 'กรมการแพทย์',
    source_url: 'ftp://not-http.com',
    source_date: '',
  })
  assert.equal(result.ok, false)
  assert.equal(result.errors.source_url, 'URL แหล่งข้อมูลไม่ถูกต้อง (ต้องเป็น http/https)')
})

test('6. Publish + source_name + valid URL + blank date is allowed', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: 'กรมการแพทย์',
    source_url: 'https://hr-dms.thaijobjob.com',
    source_date: '',
  })
  assert.equal(result.ok, true)
  assert.equal(result.clean?.source_name, 'กรมการแพทย์')
  assert.equal(result.clean?.source_url, 'https://hr-dms.thaijobjob.com')
  assert.equal(result.clean?.source_date, null)
})

test('7. Publish + source_name + valid URL + valid date is allowed', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_name: 'การนิคมอุตสาหกรรมแห่งประเทศไทย',
    source_url: 'https://www.ieat.go.th',
    source_date: '2026-07-24',
  })
  assert.equal(result.ok, true)
  assert.equal(result.clean?.source_date, '2026-07-24')
})

test('8. CE date such as 2026-08-26 is allowed', () => {
  const result = validateNewsForPublish({
    ...validBasePublishPayload,
    source_date: '2026-08-26',
    application_deadline: '2026-08-26',
  })
  assert.equal(result.ok, true)
  assert.equal(result.clean?.source_date, '2026-08-26')
  assert.equal(result.clean?.application_deadline, '2026-08-26')
})

test('9. Obvious BE-as-CE date such as 2569-08-26 is rejected with useful message', () => {
  const publishResult = validateNewsForPublish({
    ...validBasePublishPayload,
    source_date: '2569-08-26',
    application_deadline: '2569-08-26',
  })
  assert.equal(publishResult.ok, false)
  assert.equal(publishResult.errors.source_date, 'กรุณากรอกปี ค.ศ. เช่น 2026')
  assert.equal(publishResult.errors.application_deadline, 'กรุณากรอกปี ค.ศ. เช่น 2026')

  const draftResult = validateNewsDraft({
    title: 'ร่างข่าว',
    source_date: '2569-08-26',
  })
  assert.equal(draftResult.ok, false)
  assert.equal(draftResult.errors.source_date, 'กรุณากรอกปี ค.ศ. เช่น 2026')
})

test('10. Blank optional source_date is allowed in both publish and draft', () => {
  const publishResult = validateNewsForPublish({
    ...validBasePublishPayload,
    source_date: null,
  })
  assert.equal(publishResult.ok, true)
  assert.equal(publishResult.clean?.source_date, null)

  const draftResult = validateNewsDraft({
    title: 'ร่างข่าวไม่มีวันที่ประกาศ',
    source_date: null,
  })
  assert.equal(draftResult.ok, true)
  assert.equal(draftResult.clean?.source_date, null)
})
