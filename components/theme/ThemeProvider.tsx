'use client'

/**
 * ThemeProvider — the single React-side owner of theme state (P1).
 *
 * Owns everything after hydration:
 *  - reads the persisted choice and mirrors it into context
 *  - writes <html data-theme> + <meta name="theme-color"> on change
 *  - follows the OS live while the choice is 'system'
 *
 * The pre-paint boot script in the root layout handles the initial
 * application; the lazy state initializer below reads the SAME sources
 * (localStorage + the attribute the script set) so React's first render
 * matches the DOM and no correction flash occurs.
 *
 * Nothing outside this provider and lib/theme.ts may mutate data-theme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME_CHOICE,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  syncThemeColorMeta,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from '@/lib/theme'

interface ThemeContextValue {
  /** What the user picked (persists across reloads). */
  theme: ThemeChoice
  /** What is actually rendered: 'system' collapsed to dark/light. */
  resolvedTheme: ResolvedTheme
  setTheme: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export default function ThemeProvider({ children }: { children: ReactNode }) {
  // Server + first client render agree on the default; the initializer re-reads
  // the boot script's outcome on the client so state matches the DOM.
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredTheme() ?? DEFAULT_THEME_CHOICE)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  })

  const setTheme = useCallback((choice: ThemeChoice) => {
    const resolved = resolveTheme(choice)
    writeStoredTheme(choice)
    applyTheme(resolved, choice)
    setThemeState(choice)
    setResolvedTheme(resolved)
  }, [])

  // Re-resolve live while following the OS (choice = system or unset default).
  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const resolved = media.matches ? 'light' : 'dark'
      applyTheme(resolved, 'system')
      setResolvedTheme(resolved)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  // Sync browser chrome on mount (covers SSR'd explicit choices the boot
  // script left as dark when the OS is dark, etc.).
  useEffect(() => {
    syncThemeColorMeta(resolvedTheme, theme)
  }, [resolvedTheme, theme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Consumer hook. Throws if used outside the provider — a wiring bug, not a
 *  runtime condition; there is exactly one provider in the root layout. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
