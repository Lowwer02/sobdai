/**
 * Helper utilities for formatting and inserting Markdown images in Admin editors.
 */

/**
 * Sanitizes user-provided alt text for Markdown image syntax.
 * - Replaces newlines with spaces
 * - Strips unescaped square brackets [ and ] to prevent syntax breaks
 * - Trims outer whitespace
 */
export function sanitizeAltText(alt: string): string {
  if (!alt || typeof alt !== 'string') return ''
  return alt
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\[\]]/g, '')
    .trim()
}

/**
 * Formats a valid Markdown image tag: ![alt](url)
 */
export function formatMarkdownImage(alt: string, url: string): string {
  const cleanAlt = sanitizeAltText(alt)
  const cleanUrl = url.trim()
  return `![${cleanAlt}](${cleanUrl})`
}

export interface InsertMarkdownImageResult {
  nextValue: string
  newCursorPos: number
}

/**
 * Inserts a Markdown image tag at the current cursor/selection with clean blank-line spacing.
 */
export function insertMarkdownImageAtCursor(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  alt: string,
  url: string,
): InsertMarkdownImageResult {
  const imageMarkdown = formatMarkdownImage(alt, url)

  // Clamp selection bounds within current value
  const start = Math.max(0, Math.min(selectionStart, currentValue.length))
  const end = Math.max(start, Math.min(selectionEnd, currentValue.length))

  const before = currentValue.slice(0, start)
  const after = currentValue.slice(end)

  // Leading newline: ensure 2 newlines before image if preceding text exists
  let leadingPadding = ''
  if (before.length > 0) {
    if (before.endsWith('\n\n')) {
      leadingPadding = ''
    } else if (before.endsWith('\n')) {
      leadingPadding = '\n'
    } else {
      leadingPadding = '\n\n'
    }
  }

  // Trailing newline: ensure 2 newlines after image if succeeding text exists
  let trailingPadding = ''
  if (after.length > 0) {
    if (after.startsWith('\n\n')) {
      trailingPadding = ''
    } else if (after.startsWith('\n')) {
      trailingPadding = '\n'
    } else {
      trailingPadding = '\n\n'
    }
  }

  const insertion = `${leadingPadding}${imageMarkdown}${trailingPadding}`
  const nextValue = `${before}${insertion}${after}`
  const newCursorPos = before.length + insertion.length

  return {
    nextValue,
    newCursorPos,
  }
}
