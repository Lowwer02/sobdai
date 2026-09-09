import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

test('ArticleMarkdownEditor includes Image button, scope articles, and Live Preview', () => {
  const source = read('components/admin/articles/ArticleMarkdownEditor.tsx')

  // ToolButton with ImageIcon
  assert.match(source, /InlineImageUploadDialog/)
  assert.match(source, /ImageIcon/)
  assert.match(source, /title=["']แทรกรูปภาพ \(Image\)["']/)

  // Scope is strictly "articles"
  assert.match(source, /scope=["']articles["']/)

  // Session entity ID fallback for create flow
  assert.match(source, /crypto\.randomUUID/)

  // Preserves Edit / Split / Preview modes
  assert.match(source, /setMode\(['"]edit['"]\)/)
  assert.match(source, /setMode\(['"]split['"]\)/)
  assert.match(source, /setMode\(['"]preview['"]\)/)

  // Live preview uses SummaryMarkdown
  assert.match(source, /<SummaryMarkdown content={value}/)
})

test('News MarkdownEditor includes Image button, scope news, and Live Preview', () => {
  const source = read('components/admin/news/MarkdownEditor.tsx')

  // ToolButton with ImageIcon
  assert.match(source, /InlineImageUploadDialog/)
  assert.match(source, /ImageIcon/)
  assert.match(source, /title=["']แทรกรูปภาพ \(Image\)["']/)

  // Scope is strictly "news"
  assert.match(source, /scope=["']news["']/)

  // Session entity ID fallback for create flow
  assert.match(source, /crypto\.randomUUID/)

  // Preserves Edit / Split / Preview modes
  assert.match(source, /setMode\(['"]edit['"]\)/)
  assert.match(source, /setMode\(['"]split['"]\)/)
  assert.match(source, /setMode\(['"]preview['"]\)/)

  // Live preview uses SummaryMarkdown
  assert.match(source, /<SummaryMarkdown content={value}/)
})

test('InlineImageUploadDialog calls /api/admin/media/upload with FormData and enforces 4MB limit', () => {
  const source = read('components/admin/InlineImageUploadDialog.tsx')

  // Target endpoint
  assert.match(source, /fetch\(['"]\/api\/admin\/media\/upload['"],\s*\{\s*method:\s*['"]POST['"]/)

  // FormData append
  assert.match(source, /formData\.append\(['"]file['"],\s*file\)/)
  assert.match(source, /formData\.append\(['"]scope['"],\s*scope\)/)

  // 4 MB size limit
  assert.match(source, /4\s*\*\s*1024\s*\*\s*1024/)

  // Alt text is required
  assert.match(source, /!altText\.trim\(\)/)

  // Disables duplicate submission during upload
  assert.match(source, /isUploading/)
  assert.match(source, /disabled=\{[^}]*isUploading[^}]*\}/)

  // Contract: Dialog must NOT use <form> tag to prevent nesting inside parent editor forms
  assert.doesNotMatch(source, /<form[\s>]/, 'InlineImageUploadDialog must not use <form> tag')

  // Contract: All buttons in dialog must explicitly be type="button" (never type="submit")
  assert.doesNotMatch(source, /type=["']submit["']/, 'No button in dialog should be type="submit"')
  assert.match(source, /<button[^>]*type=["']button["'][^>]*onClick=\{handleUploadAndInsert\}/, 'Upload button must be type="button"')
  assert.match(source, /<button[^>]*type=["']button["'][^>]*onClick=\{onClose\}/, 'Cancel/Close buttons must be type="button"')

  // Contract: Alt text input intercepts Enter key without submitting any form
  assert.match(source, /if\s*\(\s*e\.key\s*===\s*['"]Enter['"]\s*\)/, 'Alt text input should handle Enter key')
  assert.match(source, /e\.preventDefault\(\)/, 'Enter key handler must call e.preventDefault()')

  // Contract: Successful upload calls onSuccess to trigger Markdown insertion, then closes
  assert.match(source, /onSuccess\(\{\s*url:\s*json\.asset\.url,\s*alt:\s*trimmedAlt,\s*key:\s*json\.asset\.key,?\s*\}\)/)
  assert.match(source, /onClose\(\)/)
})

test('SummaryMarkdown renders Markdown images with lazy loading and responsive width', () => {
  const source = read('components/summary/SummaryMarkdown.tsx')

  // img component exists in ReactMarkdown components map
  assert.match(source, /img:\s*\(\{\s*node,\s*alt,\s*src/)
  assert.match(source, /loading=["']lazy["']/)
  assert.match(source, /decoding=["']async["']/)
  assert.match(source, /w-full\s+h-auto/)
})
