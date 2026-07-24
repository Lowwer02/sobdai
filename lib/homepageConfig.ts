/**
 * Homepage Configuration System — typed layer (Phase 1).
 *
 * This module is the single contract between the DB (homepage_settings JSONB
 * singleton), the admin form, and the homepage render. It:
 *   - Defines the typed shape of each config group (General/Hero/CTA/Sections/SEO).
 *   - Holds code-defined DEFAULTS so the homepage renders correctly even when
 *     the DB row is empty or missing keys (the homepage must never break on
 *     config). Defaults mirror the original hardcoded homepage copy.
 *   - Provides a strict VALIDATOR for each group (no free-form JSON: features
 *     and how-to steps are typed arrays with required keys + length bounds).
 *   - Exposes `getHomepageSettings()` — a server fetcher that reads the
 *     singleton row, merges it over defaults, validates, and returns a fully
 *     typed, render-ready config.
 *
 * JSONB (not many columns) is used at the DB layer so future nested grouping
 * doesn't require migrations; this typed layer is what keeps it safe.
 */

import { createAnonServerClient } from '@/lib/supabase/anon-server'

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single "Why Sobdai" feature card. Icon is a developer-owned key. */
export interface FeatureItem {
  icon: string
  title: string
  description: string
}

/** A single "How to use" step. */
export interface HowToStep {
  num: string
  title: string
  desc: string
}

/** A stat in the Hero social-proof row. */
export interface HeroStat {
  value: string
  label: string
}

export interface HomepageHero {
  badge: string
  title: string
  subtitle: string
  stats: HeroStat[]
}

/**
 * CTA supports internal OR external links, with optional new-tab for external.
 * `type: 'internal'` → href is a path (e.g. "/packages"); never new tab.
 * `type: 'external'` → href is a full URL; `open_in_new_tab` applies.
 */
export interface CtaButton {
  label: string
  href: string
  type: 'internal' | 'external'
  open_in_new_tab: boolean
}

export interface HomepageCta {
  primary: CtaButton
  secondary: CtaButton
  /** Final (bottom) CTA band. */
  final_title: string
  final_subtitle: string
  final_button: CtaButton
}

export interface HomepageSections {
  hero: boolean
  featured: boolean
  features: boolean
  howto: boolean
  cta: boolean
}

export interface HomepageSeo {
  title: string
  description: string
  og_image_url: string
}

export interface HomepageGeneral {
  /** How many featured packages to show: 2 | 4 | 6. */
  featured_count: 2 | 4 | 6
}

export interface HomepageSettings {
  general: HomepageGeneral
  hero: HomepageHero
  cta: HomepageCta
  sections: HomepageSections
  seo: HomepageSeo
  /** Phase 1 moves Features + HowTo copy into config (admin-editable text). */
  features: FeatureItem[]
  howto: HowToStep[]
  /**
   * Support Sobdai configuration. Stored under extended_config.support in the
   * DB JSONB column — never a dedicated column. Designed to grow (QR image,
   * PromptPay, bank account, etc.) without requiring new migrations.
   */
  support: SupportConfig
}

/**
 * Support Sobdai configuration. v1.1 adds PromptPay QR + bank info.
 * All data lives under extended_config.support in the DB JSONB column —
 * never a dedicated column. Designed to grow without requiring migrations.
 */
export interface SupportConfig {
  /** Show or hide the Support Card on the Package Detail page. Default true. */
  enabled: boolean
  title: string
  description: string
  button_label: string
  // v1.1 additions
  /** Supabase Storage public URL for the PromptPay QR image. Empty = show placeholder. */
  qr_image_url: string
  /** Display name shown below the QR, e.g. "ชื่อ Sobdai". */
  promptpay_name: string
  /** Optional bank name, e.g. "ธนาคารกสิกรไท". */
  bank_name: string
  /** Optional account number. */
  account_number: string
  /** Footer note, e.g. "ขอบคุณที่สนับสนุน Sobdai ♥". */
  footer_message: string
}

// ─── Defaults (mirror the original hardcoded homepage) ──────────────────────

export const HOMEPAGE_DEFAULTS: HomepageSettings = {
  general: {
    featured_count: 6,
  },
  hero: {
    badge: 'คลังข้อสอบราชการ 2569',
    title: 'เตรียมสอบข้าราชการ\nอย่างมีระบบ',
    subtitle: 'ฝึกทำข้อสอบจริง เข้าใจเหตุผล พร้อมสอบมั่นใจ',
    stats: [
      { value: '100+', label: 'ข้อสอบ/ชุด' },
      { value: '1 ปี', label: 'สิทธิ์ใช้งาน' },
      { value: 'ทันที', label: 'หลังชำระ' },
    ],
  },
  cta: {
    primary: { label: 'ดูชุดข้อสอบ', href: '#exams', type: 'internal', open_in_new_tab: false },
    secondary: { label: 'ทดลองทำฟรี', href: '#exams', type: 'internal', open_in_new_tab: false },
    final_title: 'พร้อมเริ่มติวสอบแล้วใช่ไหม',
    final_subtitle: 'ซื้อชุดข้อสอบที่ต้องการ แล้วเริ่มทำได้ทันที ไม่ต้องรอ',
    final_button: { label: 'ดูชุดข้อสอบ', href: '#exams', type: 'internal', open_in_new_tab: false },
  },
  sections: {
    hero: true,
    featured: true,
    features: true,
    howto: true,
    cta: true,
  },
  seo: {
    title: 'Sobdai — เตรียมสอบข้าราชการอย่างมีระบบ',
    description: 'ฝึกทำข้อสอบทีละข้อแบบ Flashcard มีคำใบ้และเฉลยละเอียดทุกข้อ ซื้อขาดต่อชุดข้อสอบ ใช้ได้ 1 ปี',
    og_image_url: '',
  },
  features: [
    { icon: 'exam', title: 'ข้อสอบรายตำแหน่ง', description: 'คลังข้อสอบเฉพาะกรมและตำแหน่ง ตรงประเด็นกว่าหนังสือทั่วไป' },
    { icon: 'hint', title: 'คำใบ้ทุกข้อ', description: 'กดดูคำใบ้ได้เมื่อต้องการ ช่วยให้คิดเป็นระบบก่อนดูเฉลย' },
    { icon: 'explain', title: 'เฉลยละเอียด', description: 'ทุกข้อมีคำอธิบายเหตุผล ไม่ใช่แค่บอกว่าข้อไหนถูก' },
    { icon: 'lock', title: 'ซื้อขาด 1 ปี', description: 'ไม่มีสมาชิกรายเดือน ซื้อครั้งเดียวใช้ได้ 365 วัน' },
  ],
  howto: [
    { num: '01', title: 'เลือกชุดข้อสอบ', desc: 'เลือกกรมและตำแหน่งที่ต้องการสมัคร มีให้ครบทุกหน่วยงาน' },
    { num: '02', title: 'ชำระเงิน', desc: 'ชำระผ่าน PromptPay หรือบัตรเครดิต ได้สิทธิ์ทันที 1 ปี' },
    { num: '03', title: 'ทำข้อสอบทีละข้อ', desc: 'ระบบ Flashcard ทำทีละข้อ มีคำใบ้ช่วย + เฉลยละเอียดทุกข้อ' },
    { num: '04', title: 'ติดตามผล', desc: 'ดูสถิติคะแนน วิเคราะห์จุดอ่อน ฝึกซ้ำจนแม่นยำ' },
  ],
  support: {
    enabled: true,
    title: 'ชอบ Sobdai ไหม?',
    description:
      'หาก Sobdai ช่วยให้การเตรียมสอบของคุณง่ายขึ้น สามารถสนับสนุนการพัฒนาได้ตามสมัครใจ',
    button_label: 'สนับสนุน Sobdai',
    qr_image_url: '',
    promptpay_name: '',
    bank_name: '',
    account_number: '',
    footer_message: 'ขอบคุณทุกการสนับสนุนที่ช่วยให้ Sobdai พัฒนาต่อไปได้ ♥',
  },
}

// ─── Validators (strict; no free-form JSON leaks into render) ───────────────

const MAX_STR = (n: number) => (s: unknown): s is string => typeof s === 'string' && s.length <= n
const isStr = (s: unknown): s is string => typeof s === 'string' && s.length > 0
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

function cleanString(v: unknown, fallback: string, maxLen: number): string {
  if (typeof v === 'string' && v.length > 0 && v.length <= maxLen) return v
  return fallback
}

function cleanCta(v: any, fallback: CtaButton): CtaButton {
  if (!v || typeof v !== 'object') return fallback
  const type: 'internal' | 'external' = v.type === 'external' ? 'external' : 'internal'
  const href = typeof v.href === 'string' ? v.href : fallback.href
  return {
    label: cleanString(v.label, fallback.label, 80),
    href,
    type,
    // open_in_new_tab only meaningful for external; force false for internal.
    open_in_new_tab: type === 'external' ? isBool(v.open_in_new_tab) ? v.open_in_new_tab : false : false,
  }
}

/**
 * Merge a raw DB group over defaults + validate. Returns a guaranteed-safe,
 * fully-typed object. Any malformed/missing key falls back to the default —
 * the homepage can never render broken config.
 */
export function normalizeHomepageSettings(raw: any): HomepageSettings {
  const d = HOMEPAGE_DEFAULTS
  const r = raw || {}

  // --- general
  const fcRaw = r.general?.featured_count
  const featured_count: 2 | 4 | 6 = [2, 4, 6].includes(fcRaw) ? (fcRaw as 2 | 4 | 6) : d.general.featured_count

  // --- hero
  const heroRaw = r.hero || {}
  const statsRaw = Array.isArray(heroRaw.stats) ? heroRaw.stats : []
  const stats: HeroStat[] = (statsRaw.length > 0 ? statsRaw : d.hero.stats)
    .filter((s: any) => s && typeof s === 'object')
    .slice(0, 4)
    .map((s: any) => ({
      value: cleanString(s.value, '', 24),
      label: cleanString(s.label, '', 40),
    }))
    .filter((s: HeroStat) => s.value && s.label)

  // --- cta
  const ctaRaw = r.cta || {}

  // --- sections (all booleans; default true if absent)
  const sRaw = r.sections || {}

  // --- seo
  const seoRaw = r.seo || {}

  // --- features (strict: icon/title/description required, bounded)
  const featuresRaw = Array.isArray(r.features) ? r.features : []
  const features: FeatureItem[] = (featuresRaw.length > 0 ? featuresRaw : d.features)
    .filter((f: any) => f && typeof f === 'object')
    .slice(0, 8)
    .map((f: any) => ({
      icon: cleanString(f.icon, 'exam', 32),
      title: cleanString(f.title, '', 80),
      description: cleanString(f.description, '', 200),
    }))
    .filter((f: FeatureItem) => f.title && f.description)

  // --- howto (strict: num/title/desc required, bounded)
  const howtoRaw = Array.isArray(r.howto) ? r.howto : []
  const howto: HowToStep[] = (howtoRaw.length > 0 ? howtoRaw : d.howto)
    .filter((s: any) => s && typeof s === 'object')
    .slice(0, 6)
    .map((s: any) => ({
      num: cleanString(s.num, '', 8),
      title: cleanString(s.title, '', 80),
      desc: cleanString(s.desc, '', 200),
    }))
    .filter((s: HowToStep) => s.num && s.title && s.desc)

  // --- support (stored under extended_config.support in the DB, but when called
  //     from the save action the client sends it as a top-level `support` key)
  const supFromTopLevel = (typeof r.support === 'object' && r.support !== null) ? r.support : null
  const extRaw = r.extended_config || {}
  const supFromExt = (typeof extRaw.support === 'object' && extRaw.support !== null) ? extRaw.support : null
  const supRaw = supFromTopLevel || supFromExt || {}
  const support: SupportConfig = {
    enabled: typeof supRaw.enabled === 'boolean' ? supRaw.enabled : d.support.enabled,
    title: cleanString(supRaw.title, d.support.title, 120),
    description: cleanString(supRaw.description, d.support.description, 400),
    button_label: cleanString(supRaw.button_label, d.support.button_label, 80),
    // v1.1 fields — empty string = not configured (show placeholder / hide section)
    qr_image_url: typeof supRaw.qr_image_url === 'string' ? supRaw.qr_image_url : '',
    promptpay_name: typeof supRaw.promptpay_name === 'string' ? supRaw.promptpay_name : '',
    bank_name: typeof supRaw.bank_name === 'string' ? supRaw.bank_name : '',
    account_number: typeof supRaw.account_number === 'string' ? supRaw.account_number : '',
    footer_message: cleanString(supRaw.footer_message, d.support.footer_message, 200),
  }

  return {
    general: { featured_count },
    hero: {
      badge: cleanString(heroRaw.badge, d.hero.badge, 80),
      title: cleanString(heroRaw.title, d.hero.title, 200),
      subtitle: cleanString(heroRaw.subtitle, d.hero.subtitle, 400),
      stats,
    },
    cta: {
      primary: cleanCta(ctaRaw.primary, d.cta.primary),
      secondary: cleanCta(ctaRaw.secondary, d.cta.secondary),
      final_title: cleanString(ctaRaw.final_title, d.cta.final_title, 120),
      final_subtitle: cleanString(ctaRaw.final_subtitle, d.cta.final_subtitle, 300),
      final_button: cleanCta(ctaRaw.final_button, d.cta.final_button),
    },
    sections: {
      hero: sRaw.hero === false ? false : true,
      featured: sRaw.featured === false ? false : true,
      features: sRaw.features === false ? false : true,
      howto: sRaw.howto === false ? false : true,
      cta: sRaw.cta === false ? false : true,
    },
    seo: {
      title: cleanString(seoRaw.title, d.seo.title, 120),
      description: cleanString(seoRaw.description, d.seo.description, 300),
      og_image_url: cleanString(seoRaw.og_image_url, '', 500),
    },
    features,
    howto,
    support,
  }
}

// ─── Server fetcher ─────────────────────────────────────────────────────────

/**
 * Read the singleton row (id=1) via the cookie-free anon client so this stays
 * ISR-cacheable. Merges over defaults + validates. Returns defaults on any
 * failure — the homepage must never 500 on config.
 *
 * Optional: pass a supabase client (e.g. admin) to bypass RLS in the admin UI.
 */
export async function getHomepageSettings(supabaseOverride?: any): Promise<HomepageSettings> {
  try {
    const supabase = supabaseOverride || createAnonServerClient()
    const { data } = await supabase
      .from('homepage_settings')
      .select('general, hero, cta, sections, seo, features, howto, extended_config')
      .eq('id', 1)
      .single()

    if (!data) return HOMEPAGE_DEFAULTS
    return normalizeHomepageSettings(data)
  } catch (err) {
    console.error('getHomepageSettings failed, using defaults:', err)
    return HOMEPAGE_DEFAULTS
  }
}
