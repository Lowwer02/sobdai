/**
 * Sobdai Theme System V1 — single source of theme truth.
 *
 * Architecture (P1): Dark is the SSR/default baseline. The user's choice is
 * persisted in localStorage and applied to <html data-theme="...">.
 *
 *  - An inline <head> script (THEME_BOOT_SCRIPT) runs before first paint and
 *    re-applies a stored non-dark choice, so there is no wrong-theme flash.
 *  - components/theme/ThemeProvider owns the React state and DOM writes after
 *    hydration; no other component may touch data-theme directly.
 *
 * Why localStorage instead of a cookie read in the root layout: Next's own
 * guide (node_modules/next/dist/docs .../preventing-flash-before-hydration.md,
 * "Themes") prescribes exactly this inline-script pattern, and `cookies()` in
 * the async root layout would opt EVERY route into dynamic rendering — the
 * layout is deliberately ISR-cacheable today (see lib/homepageConfig.ts,
 * "cookie-free anon client so this stays ISR-cacheable"). System behavior
 * requires client-side matchMedia regardless, so the script is needed either
 * way; localStorage keeps every route static.
 */

export const THEME_STORAGE_KEY = 'sobdai-theme'

export type ThemeChoice = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_CHOICES: ThemeChoice[] = ['dark', 'light', 'system']

/** New visitors get the current production look: dark. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'dark'

/** Browser-chrome colors, mirrored in app/layout.tsx viewport + manifest. */
export const THEME_COLOR_DARK = '#0f0b08'
export const THEME_COLOR_LIGHT = '#faf5ec'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'dark' || value === 'light' || value === 'system'
}

/**
 * Read the stored choice. Safe to call during a client render; returns null on
 * the server (typeof window guard) and whenever storage is unavailable.
 */
export function readStoredTheme(): ThemeChoice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredTheme(choice: ThemeChoice): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Private mode / storage disabled — theme still applies for this session.
  }
}

/** Collapse a choice to the concrete theme it renders as right now. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'dark' || choice === 'light') return choice
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Apply the resolved theme to <html> and the browser-chrome color. */
export function applyTheme(resolved: ResolvedTheme, choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
  syncThemeColorMeta(resolved, choice)
}

/**
 * Stable marker for the two managed theme-color metas. Tagged once (on the
 * first sync after SSR, classified from the media attributes layout.tsx
 * emitted) so identification never depends on DOM order or on attributes we
 * later rewrite.
 */
const THEME_COLOR_ROLE_ATTR = 'data-sobdai-theme-color-role'

type ThemeColorRole = 'dark' | 'light'

/**
 * Locate the managed dark/light theme-color metas. Returns null unless BOTH
 * roles are found — partial state is left untouched rather than guessed at.
 *
 * Never adds, removes, or reorders metas; only reads + tags them.
 */
function getManagedThemeColorMetas(): Array<{ role: ThemeColorRole; meta: HTMLMetaElement }> | null {
  const metas = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  )
  const byRole = new Map<ThemeColorRole, HTMLMetaElement>()

  // Pass 1 — markers set by an earlier sync. Immune to content rewrites and
  // DOM order.
  for (const meta of metas) {
    const role = meta.getAttribute(THEME_COLOR_ROLE_ATTR)
    if ((role === 'dark' || role === 'light') && !byRole.has(role)) {
      byRole.set(role, meta)
    }
  }

  // Pass 2 — first sync after SSR: classify by the media attributes emitted
  // by app/layout.tsx and tag them for every later sync.
  if (byRole.size < 2) {
    for (const meta of metas) {
      if (byRole.size === 2) break
      if (meta.hasAttribute(THEME_COLOR_ROLE_ATTR)) continue
      const media = meta.getAttribute('media') ?? ''
      if (!byRole.has('dark') && /prefers-color-scheme:\s*dark/.test(media)) {
        meta.setAttribute(THEME_COLOR_ROLE_ATTR, 'dark')
        byRole.set('dark', meta)
      } else if (!byRole.has('light') && /prefers-color-scheme:\s*light/.test(media)) {
        meta.setAttribute(THEME_COLOR_ROLE_ATTR, 'light')
        byRole.set('light', meta)
      }
    }
  }

  if (!byRole.has('dark') || !byRole.has('light')) return null
  return [
    { role: 'dark', meta: byRole.get('dark')! },
    { role: 'light', meta: byRole.get('light')! },
  ]
}

/**
 * Keep <meta name="theme-color"> in step with the ACTIVE theme. SSR emits two
 * media-scoped metas (dark + light) so the OS theme is correct pre-JS and for
 * System users.
 *
 * Invariant: exactly those TWO metas exist for the lifetime of the document —
 * they are never deleted and their media attributes are never touched.
 *
 *  - System: each meta carries its own media's color, so the browser resolves
 *    (and live-updates) the right chrome color as the OS theme changes.
 *  - Forced dark/light: BOTH metas carry the forced color. Whichever media
 *    query matches the OS, the applied chrome color is the forced one. When
 *    the user returns to System, restoring each meta's own content is a pure
 *    content write — the lossy "collapse + delete + hope to reconstruct" trap
 *    is impossible by construction.
 *
 * Idempotent and reversible across any sequence of transitions.
 */
export function syncThemeColorMeta(resolved: ResolvedTheme, choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  const pair = getManagedThemeColorMetas()
  // SSR always emits the pair (app/layout.tsx). If it is missing (e.g. a
  // document rendered by the pre-P1 build, which could delete a meta), there
  // is nothing safe to manage — leave the DOM alone; the next full document
  // load re-renders the SSR pair.
  if (!pair) return

  const forced = choice === 'dark' || choice === 'light' ? resolved : null
  for (const { role, meta } of pair) {
    const content = forced
      ? forced === 'dark'
        ? THEME_COLOR_DARK
        : THEME_COLOR_LIGHT
      : role === 'dark'
        ? THEME_COLOR_DARK
        : THEME_COLOR_LIGHT
    meta.setAttribute('content', content)
  }
}

/**
 * Pre-paint boot script for <head>. Runs synchronously during HTML parsing:
 * dark needs no work (SSR already rendered dark); a stored light choice or
 * system-light flips <html> to light before anything is painted.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches)){document.documentElement.setAttribute("data-theme","light")}}catch(e){}})()`
