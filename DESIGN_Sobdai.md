---
name: Aura Government Portal
colors:
  surface: '#191305'
  surface-dim: '#191305'
  surface-bright: '#403827'
  surface-container-lowest: '#130d02'
  surface-container-low: '#211b0c'
  surface-container: '#261f10'
  surface-container-high: '#312919'
  surface-container-highest: '#3c3423'
  on-surface: '#efe1c9'
  on-surface-variant: '#d2c5b0'
  inverse-surface: '#efe1c9'
  inverse-on-surface: '#372f1f'
  outline: '#9b8f7c'
  outline-variant: '#4e4636'
  surface-tint: '#f0c051'
  primary: '#f2c153'
  on-primary: '#402d00'
  primary-container: '#d4a63a'
  on-primary-container: '#543d00'
  inverse-primary: '#795900'
  secondary: '#e2c46d'
  on-secondary: '#3c2f00'
  secondary-container: '#685200'
  on-secondary-container: '#e5c76f'
  tertiary: '#b1c7ff'
  on-tertiary: '#002d6c'
  tertiary-container: '#85abff'
  on-tertiary-container: '#003d8b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdf9f'
  primary-fixed-dim: '#f0c051'
  on-primary-fixed: '#261a00'
  on-primary-fixed-variant: '#5b4300'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e2c46d'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#d9e2ff'
  tertiary-fixed-dim: '#afc6ff'
  on-tertiary-fixed: '#001a43'
  on-tertiary-fixed-variant: '#004398'
  background: '#191305'
  on-background: '#efe1c9'
  surface-variant: '#3c3423'
  bg-main: '#0F0A06'
  surface-card: '#1A120B'
  surface-hover: '#24180E'
  text-heading: '#F7F3EC'
  text-muted: '#8B7A63'
  border-subtle: '#3A2A17'
  success: '#22C55E'
  danger: '#EF4444'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is engineered for a premium government recruitment platform. It balances the high-stakes authority of public service with a modern, user-centric interface. The aesthetic is sophisticated yet accessible, utilizing deep earth tones and metallic accents to evoke trust, stability, and success.

The chosen design style is **Corporate / Modern** with a **Minimalist** focus on information density. It avoids unnecessary decorative elements, instead using precise alignment and typographic hierarchy to guide the user through complex data. The interface prioritizes readability for users under time pressure—candidates looking for "Urgent" openings or exam results—by utilizing a dark-first approach that reduces eye strain and emphasizes key calls-to-action (CTAs) in gold.

## Colors

The palette is anchored by a "Obsidian Gold" theme. The primary gold (`#D4A63A`) serves as the core action color, symbolizing achievement and professional excellence. 

### Light Mode Variant
While the default is dark, the light mode implementation utilizes:
- **Background:** `#FCFAF7` (a soft cream-white).
- **Surface:** `#FFFFFF` (pure white for cards).
- **Primary Text:** `#1A120B` (deepest brown-black).
- **Secondary Text:** `#4A3F35` (muted brown).
- **Borders:** `#E5E0D8`.

The Gold primary and highlight colors remain consistent across both modes to maintain brand recognition, though luminosity may be adjusted slightly for contrast accessibility on light backgrounds.

## Typography

This design system uses a trio of sans-serif fonts to handle high-density information. 
- **Plus Jakarta Sans** is reserved for high-level headings and hero sections, offering a modern and welcoming geometric feel. 
- **Be Vietnam Pro** handles the bulk of body copy and job descriptions, chosen for its exceptional legibility in both Thai and English scripts at smaller sizes. 
- **Hanken Grotesk** is used for metadata, labels, and tags, providing a sharp, technical feel that aids in scanning lists.

When rendering Thai text, use a 1.2x multiplier for line-height on body copy to ensure vowel and tone marks do not overlap.

## Layout & Spacing

The design system employs a **12-column fixed grid** for desktop, maxing out at 1280px to ensure line lengths remain readable. 

- **Mobile:** 4-column grid with 16px margins. Cards are full-width.
- **Tablet:** 8-column grid with 24px margins. Use 2-column layouts for job listings.
- **Desktop:** 12-column grid. Job listings can transition to 3-column grids or high-density vertical lists with a 4-column sidebar for filters.

Spacing follows an 8px rhythm. Vertical stack spacing is generous between sections (48px+) to prevent the information-rich content from feeling overwhelming.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** rather than heavy shadows. 
- **Level 0 (Background):** Used for the main canvas (`#0F0A06`).
- **Level 1 (Cards/Surfaces):** Raised slightly using a lighter fill (`#1A120B`) and a 1px solid border (`#3A2A17`).
- **Level 2 (Hover/Interaction):** Surfaces shift to `#24180E`.
- **Level 3 (Modals/Popovers):** Use a subtle ambient shadow (Black, 40% opacity, 20px blur) and a backdrop blur of 8px to create a "glass" effect that maintains context.

Outlines are the primary method of separation, keeping the UI sharp and professional.

## Shapes

The shape language is **Rounded**, striking a balance between the rigidity of government bureaucracy and the approachability of a modern tech product. 

- **Standard Elements:** 0.5rem (8px) radius for buttons, input fields, and small cards.
- **Large Containers:** 1rem (16px) for main job listing cards and hero containers.
- **Contextual Tags:** Pill-shaped (fully rounded) for categories like "No OCSC required" or "Urgent" to differentiate them from interactive buttons.

## Components

### Buttons
- **Primary:** Solid Gold (`#D4A63A`) with Dark Brown text. High-gloss hover state (`#E5B84A`).
- **Secondary:** Outlined with 1px Gold border and Gold text.
- **Ghost:** Transparent background with Muted Text; used for less critical actions like "View All."

### Cards
- Job cards must include a defined header for the Department Logo/Icon, a clear Title, and a footer area for metadata (Date, Views). Use a subtle 1px border.

### Input Fields
- Dark surfaces with a `#3A2A17` border. On focus, the border transitions to Primary Gold with a 2px outer glow.

### Chips & Tags
- Status tags (e.g., "Urgent") use a dark red background with white text.
- Filter chips use the Surface Hover color with a secondary gold text.

### Lists
- For the "Latest Announcements" section, use a clean row-based layout with thin dividers. Ensure the "Update Date" is right-aligned or clearly separated to maintain scannability.