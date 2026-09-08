import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { formatMarkdownImage, insertMarkdownImageAtCursor, sanitizeAltText } from './inline-image-insert.ts'

test('sanitizeAltText cleans special brackets and newlines', () => {
  assert.equal(sanitizeAltText('แผนผังขั้นตอน [ข้อสอบ]'), 'แผนผังขั้นตอน ข้อสอบ')
  assert.equal(sanitizeAltText('บรรทัดที่ 1\nบรรทัดที่ 2\r\nบรรทัดที่ 3'), 'บรรทัดที่ 1 บรรทัดที่ 2 บรรทัดที่ 3')
  assert.equal(sanitizeAltText('   คำอธิบายภาพ   '), 'คำอธิบายภาพ')
  assert.equal(sanitizeAltText(''), '')
})

test('formatMarkdownImage constructs standard Markdown image tag', () => {
  const result = formatMarkdownImage('ภาพตัวอย่าง', 'https://assets.sobdai.com/articles/123/abc.webp')
  assert.equal(result, '![ภาพตัวอย่าง](https://assets.sobdai.com/articles/123/abc.webp)')
})

test('insertMarkdownImageAtCursor inserts at empty document with no extra padding', () => {
  const { nextValue, newCursorPos } = insertMarkdownImageAtCursor(
    '',
    0,
    0,
    'แผนผัง',
    'https://assets.sobdai.com/articles/123/abc.webp',
  )

  assert.equal(nextValue, '![แผนผัง](https://assets.sobdai.com/articles/123/abc.webp)')
  assert.equal(newCursorPos, nextValue.length)
})

test('insertMarkdownImageAtCursor separates paragraphs with blank lines', () => {
  const original = 'ย่อหน้าที่หนึ่ง\n\nย่อหน้าที่สอง'
  const cursorPos = 'ย่อหน้าที่หนึ่ง\n\n'.length

  const { nextValue } = insertMarkdownImageAtCursor(
    original,
    cursorPos,
    cursorPos,
    'รูปภาพประกอบ',
    'https://assets.sobdai.com/articles/123/abc.webp',
  )

  assert.equal(
    nextValue,
    'ย่อหน้าที่หนึ่ง\n\n![รูปภาพประกอบ](https://assets.sobdai.com/articles/123/abc.webp)\n\nย่อหน้าที่สอง',
  )
})

test('insertMarkdownImageAtCursor handles mid-line insertion with padding', () => {
  const original = 'ข้อความก่อนหน้า ข้อความตามหลัง'
  const cursorPos = 'ข้อความก่อนหน้า '.length

  const { nextValue } = insertMarkdownImageAtCursor(
    original,
    cursorPos,
    cursorPos,
    'รูปภาพ',
    'https://assets.sobdai.com/news/456/def.webp',
  )

  assert.equal(
    nextValue,
    'ข้อความก่อนหน้า \n\n![รูปภาพ](https://assets.sobdai.com/news/456/def.webp)\n\nข้อความตามหลัง',
  )
})

test('insertMarkdownImageAtCursor replaces selected text range', () => {
  const original = 'ข้อความ [แทนที่ตรงนี้] ต่อไป'
  const start = original.indexOf('[แทนที่ตรงนี้]')
  const end = start + '[แทนที่ตรงนี้]'.length

  const { nextValue } = insertMarkdownImageAtCursor(
    original,
    start,
    end,
    'รูปภาพใหม่',
    'https://assets.sobdai.com/articles/789/ghi.webp',
  )

  assert.equal(
    nextValue,
    'ข้อความ \n\n![รูปภาพใหม่](https://assets.sobdai.com/articles/789/ghi.webp)\n\n ต่อไป',
  )
})
