import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

test('Article cover files use the secure R2 media boundary while manual URLs remain supported', () => {
  const editorSource = read('components/admin/articles/ArticleEditorClient.tsx')
  const actionsSource = read('app/admin/articles/actions.ts')

  assert.match(editorSource, /fetch\(['"]\/api\/admin\/media\/upload['"]/)
  assert.match(editorSource, /formData\.append\(['"]scope['"],\s*['"]articles['"]\)/)
  assert.match(editorSource, /formData\.append\(['"]purpose['"],\s*['"]cover['"]\)/)
  assert.match(editorSource, /setCoverImageUrl\(result\.asset\.url\)/)
  assert.match(editorSource, /value=\{coverImageUrl\}/)
  assert.match(editorSource, /URL รูปภาพปก \(หรืออัปโหลดด้านบน\)/)
  assert.doesNotMatch(editorSource, /uploadArticleCover/)
  assert.doesNotMatch(actionsSource, /export async function uploadArticleCover/)
  assert.doesNotMatch(actionsSource, /\.from\(['"]article-assets['"]\)\s*\.upload/)
})

test('News cover files use the secure R2 media boundary without mutable URL cache busting', () => {
  const editorSource = read('components/admin/news/NewsEditorClient.tsx')

  assert.match(editorSource, /fetch\(['"]\/api\/admin\/media\/upload['"]/)
  assert.match(editorSource, /formData\.append\(['"]scope['"],\s*['"]news['"]\)/)
  assert.match(editorSource, /formData\.append\(['"]purpose['"],\s*['"]cover['"]\)/)
  assert.match(editorSource, /setCoverImageUrl\(result\.asset\.url\)/)
  assert.doesNotMatch(editorSource, /createClient/)
  assert.doesNotMatch(editorSource, /\.storage\s*\.from\(['"]news-assets['"]\)/)
  assert.doesNotMatch(editorSource, /\?v=/)
  assert.doesNotMatch(editorSource, /Date\.now\(\)/)
})

test('Cover file controls advertise only formats accepted by the decoded-image pipeline', () => {
  for (const path of [
    'components/admin/articles/ArticleEditorClient.tsx',
    'components/admin/news/NewsEditorClient.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /accept=["']\.jpg,\.jpeg,\.png,\.webp,image\/jpeg,image\/png,image\/webp["']/)
    assert.doesNotMatch(source, /image\/heic/i)
    assert.doesNotMatch(source, /รองรับ[^\n]*HEIC/i)
  }
})

test('Public Article and News covers retain responsive next/image rendering', () => {
  const publicCoverFiles = [
    'components/articles/ArticleCard.tsx',
    'components/articles/ArticleDetail.tsx',
    'components/news/NewsCard.tsx',
    'app/news/[slug]/page.tsx',
  ]

  for (const path of publicCoverFiles) {
    const source = read(path)
    assert.match(source, /from ['"]next\/image['"]/)
    assert.match(source, /<Image/)
    assert.match(source, /\bfill\b/)
    assert.match(source, /\bsizes=/)
    assert.match(source, /\balt=/)
    assert.doesNotMatch(source, /\bunoptimized\b/)
  }

  assert.match(read('components/articles/ArticleDetail.tsx'), /\bpriority\b/)
  assert.match(read('components/news/NewsCard.tsx'), /priority=\{prioritizeFirstRow/)
  assert.match(read('app/news/[slug]/page.tsx'), /\bpriority\b/)
})
