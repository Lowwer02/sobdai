'use client'

/**
 * ThemeToggle — the user-facing Dark / Light / System control (P1E).
 *
 * Two shapes, one source of truth (useTheme):
 *  - <ThemeToggle />  — compact icon + dropdown for the desktop navbar.
 *  - <ThemeToggleInline /> — a three-way segmented row for the mobile drawer.
 *
 * Until mounted, both render a stable neutral state (Monitor icon / no active
 * highlight) so server and first client render agree — reading the persisted
 * choice any earlier would cause a hydration mismatch.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { THEME_CHOICES, type ThemeChoice } from '@/lib/theme'

const CHOICE_META: Record<ThemeChoice, { label: string; Icon: typeof Moon }> = {
  dark: { label: 'มืด', Icon: Moon },
  light: { label: 'สว่าง', Icon: Sun },
  system: { label: 'ตามระบบ', Icon: Monitor },
}

/** Neutral placeholder shown pre-mount to keep SSR and hydration identical. */
function NeutralIcon() {
  return <Monitor size={18} aria-hidden />
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const CurrentIcon = mounted ? CHOICE_META[theme].Icon : NeutralIcon

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เลือกธีมการแสดงผล"
        title="เลือกธีมการแสดงผล"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <CurrentIcon />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="เลือกธีมการแสดงผล"
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-[var(--shadow-lg)]"
        >
          {THEME_CHOICES.map((choice) => {
            const { label, Icon } = CHOICE_META[choice]
            const isActive = mounted && theme === choice
            return (
              <button
                key={choice}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setTheme(choice)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors focus:outline-none ${
                  isActive
                    ? 'text-brand bg-wash font-semibold'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="flex-1 text-left">{label}</span>
                {isActive && <Check size={14} aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ThemeToggleInline() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="เลือกธีมการแสดงผล"
      className="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface-muted p-1"
    >
      {THEME_CHOICES.map((choice) => {
        const { label, Icon } = CHOICE_META[choice]
        const isActive = mounted && theme === choice
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(choice)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
              isActive ? 'bg-wash text-brand' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
            }`}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
