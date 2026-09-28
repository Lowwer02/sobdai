/**
 * Unit tests for syncThemeColorMeta (lib/theme.ts) — the theme-color meta
 * synchronization invariant:
 *
 *   exactly TWO managed metas exist for the document lifetime; they are never
 *   deleted and their media attributes are never touched. Forced themes point
 *   BOTH metas at the forced color; System restores each meta's own color.
 *
 * Runs on the repo's existing node --test runner. lib/theme.ts only touches
 * document.head.querySelectorAll, so a minimal fake head (no DOM framework,
 * no dependency) is enough to exercise the real logic.
 *
 * Run with:
 *   node --test lib/theme.test.ts
 */

import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { syncThemeColorMeta, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from './theme.ts'

/** Minimal stand-in for an HTMLMetaElement (attribute map only). */
class FakeMeta {
  private attrs = new Map<string, string>()
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name)
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }
}

type FakeDoc = { head: { querySelectorAll: (selector: string) => FakeMeta[] } }

function installFakeHead(metas: FakeMeta[]): () => void {
  const doc: FakeDoc = {
    head: {
      querySelectorAll: (selector: string) =>
        selector === 'meta[name="theme-color"]' ? metas : [],
    },
  }
  ;(globalThis as Record<string, unknown>).document = doc
  return () => {
    delete (globalThis as Record<string, unknown>).document
  }
}

/** The exact SSR pair app/layout.tsx emits, in DOM order. */
function createSsrPair(): FakeMeta[] {
  const dark = new FakeMeta()
  dark.setAttribute('name', 'theme-color')
  dark.setAttribute('media', '(prefers-color-scheme: dark)')
  dark.setAttribute('content', THEME_COLOR_DARK)
  const light = new FakeMeta()
  light.setAttribute('name', 'theme-color')
  light.setAttribute('media', '(prefers-color-scheme: light)')
  light.setAttribute('content', THEME_COLOR_LIGHT)
  return [dark, light]
}

function contentOf(meta: FakeMeta): string | null {
  return meta.getAttribute('content')
}

test('no document (SSR context) is a safe no-op', () => {
  const cleanup = installFakeHead([])
  delete (globalThis as Record<string, unknown>).document
  assert.doesNotThrow(() => syncThemeColorMeta('light', 'system'))
  cleanup()
  installFakeHead([])
})

test('System keeps the SSR media pair intact with per-media contents', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('light', 'system')
  assert.equal(metas.length, 2)
  assert.equal(contentOf(metas[0]), THEME_COLOR_DARK)
  assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT)
  assert.match(metas[0].getAttribute('media') ?? '', /dark/)
  assert.match(metas[1].getAttribute('media') ?? '', /light/)
  cleanup()
})

test('forcing a theme points BOTH metas at the forced color without deleting anything', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('dark', 'dark')
  assert.equal(metas.length, 2, 'no meta may be removed')
  assert.equal(contentOf(metas[0]), THEME_COLOR_DARK)
  assert.equal(contentOf(metas[1]), THEME_COLOR_DARK)
  assert.match(metas[1].getAttribute('media') ?? '', /light/, 'media attribute must survive')
  // Forced light on the same invariant.
  syncThemeColorMeta('light', 'light')
  assert.equal(contentOf(metas[0]), THEME_COLOR_LIGHT)
  assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT)
  assert.equal(metas.length, 2)
  cleanup()
})

test('E/F: returning to System after forcing restores the per-media pair', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('dark', 'dark') // forced Dark
  syncThemeColorMeta('light', 'system') // → System while OS is Light
  assert.equal(metas.length, 2)
  assert.equal(contentOf(metas[0]), THEME_COLOR_DARK)
  assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT, 'light meta must be restored')

  syncThemeColorMeta('light', 'light') // forced Light
  syncThemeColorMeta('dark', 'system') // → System while OS is Dark
  assert.equal(contentOf(metas[0]), THEME_COLOR_DARK, 'dark meta must be restored')
  assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT)
  cleanup()
})

test('G: Light → Dark → System → Light → System stays stable and correct', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  const expectPair = () => {
    assert.equal(metas.length, 2, 'exactly two managed metas at every step')
    assert.match(metas[0].getAttribute('media') ?? '', /dark/)
    assert.match(metas[1].getAttribute('media') ?? '', /light/)
    assert.equal(contentOf(metas[0]), THEME_COLOR_DARK)
    assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT)
  }

  syncThemeColorMeta('light', 'light')
  syncThemeColorMeta('dark', 'dark')
  syncThemeColorMeta('dark', 'system') // System, OS dark
  syncThemeColorMeta('light', 'light')
  syncThemeColorMeta('light', 'system') // System, OS light
  expectPair()
  cleanup()
})

test('H: repeated identical syncs are idempotent', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('dark', 'dark')
  const snapshot = metas.map((m) => [m.getAttribute('content'), m.getAttribute('media')])
  syncThemeColorMeta('dark', 'dark')
  syncThemeColorMeta('dark', 'dark')
  assert.deepEqual(
    metas.map((m) => [m.getAttribute('content'), m.getAttribute('media')]),
    snapshot
  )
  cleanup()
})

test('identification is by media attribute, not DOM order', () => {
  const metas = createSsrPair().reverse() // light meta first
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('dark', 'system')
  assert.equal(contentOf(metas[0]), THEME_COLOR_LIGHT, 'first-in-DOM light meta keeps light color')
  assert.equal(contentOf(metas[1]), THEME_COLOR_DARK)
  cleanup()
})

test('stable marker keeps roles identified even if content attributes were rewritten externally', () => {
  const metas = createSsrPair()
  const cleanup = installFakeHead(metas)
  syncThemeColorMeta('dark', 'dark') // first sync tags roles
  // Simulate external mangling of contents; roles must still be known.
  metas.forEach((m) => m.setAttribute('content', '#123456'))
  syncThemeColorMeta('light', 'system')
  assert.equal(contentOf(metas[0]), THEME_COLOR_DARK)
  assert.equal(contentOf(metas[1]), THEME_COLOR_LIGHT)
  cleanup()
})

test('a document with an incomplete meta pair is left untouched (no guessing)', () => {
  const metas = createSsrPair().slice(0, 1) // e.g. aftermath of the pre-fix bug
  const cleanup = installFakeHead(metas)
  const before = metas.map((m) => [m.getAttribute('content'), m.getAttribute('media')])
  syncThemeColorMeta('light', 'system')
  assert.deepEqual(
    metas.map((m) => [m.getAttribute('content'), m.getAttribute('media')]),
    before,
    'partial state must not be mutated'
  )
  cleanup()
})
