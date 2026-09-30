import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8')
const ordersClient = readFileSync(join(root, 'app/orders/MyOrdersClient.tsx'), 'utf8')
const checkoutClient = readFileSync(join(root, 'app/checkout/[id]/CheckoutClient.tsx'), 'utf8')

function readThemeBlock(selector: string) {
  const match = globals.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `theme block ${selector} must exist`)
  return match[1]
}

function readToken(block: string, name: string) {
  const match = block.match(new RegExp(`\\s${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  assert.ok(match, `${name} must be a six-digit hex token`)
  return match[1]
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

test('M1.3B success CTA base and hover pairs remain WCAG AA in both themes', () => {
  const themes = [
    { name: 'dark', block: readThemeBlock(':root(?=\\s*\\{\\s*color-scheme:\\s*dark;)') },
    { name: 'light', block: readThemeBlock("\\[data-theme='light'\\]") },
  ]

  for (const theme of themes) {
    const success = readToken(theme.block, '--success')
    const foreground = readToken(theme.block, '--success-foreground')
    const hover = readToken(theme.block, '--success-hover')

    assert.ok(
      contrastRatio(foreground, success) >= 4.5,
      `${theme.name} base contrast must be at least 4.5:1`,
    )
    assert.ok(
      contrastRatio(foreground, hover) >= 4.5,
      `${theme.name} hover contrast must be at least 4.5:1`,
    )
  }
})

test('customer success CTAs use the shared semantic hover token', () => {
  for (const source of [ordersClient, checkoutClient]) {
    assert.match(source, /bg-success[^\n]*text-success-foreground/)
    assert.match(source, /hover:bg-success-hover/)
    assert.doesNotMatch(source, /bg-success[^\n]*hover:opacity-/)
  }

  assert.match(globals, /--color-success-hover: var\(--success-hover\)/)
})
