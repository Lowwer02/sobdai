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

import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import type { SocialFollowConfig } from './socialFollowConfig'
import { SOCIAL_FOLLOW_DEFAULTS, normalizeSocialFollowConfig } from './socialFollowConfig'


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
  search_placeholder: string
  search_chip_label: string
  browse_cta_label: string
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
  /** Latest News strip (added 047). Sits between Package Explorer and How It Works. */
  news: boolean
  features: boolean
  howto: boolean
  cta: boolean
}

/**
 * Latest News section configuration. Stored under extended_config.latest_news in
 * the DB JSONB column (mirrors package_explorer/footer/support). Public section
 * is added in a later phase; this layer just owns typing/defaults/validation.
 */
export interface LatestNewsSettings {
  title: string
  subtitle: string
  cta_label: string
  /** How many published news cards to show. Integer 1–6. Default 3. */
  limit: number
}

export interface HomepageSeo {
  title: string
  description: string
  og_image_url: string
}

export interface PackageExplorerSettings {
  title: string
  subtitle: string
  cta_label: string
  empty_title: string
  empty_description: string
}

export interface FooterSocialLink {
  key: 'facebook' | 'line' | 'tiktok'
  label: string
  url: string
  active: boolean
}

export interface FooterSettings {
  social_links: FooterSocialLink[]
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
  package_explorer: PackageExplorerSettings
  /** Latest News section (added 047). Stored under extended_config.latest_news. */
  latest_news: LatestNewsSettings
  footer: FooterSettings
  /** Phase 1 moves Features + HowTo copy into config (admin-editable text). */
  features: FeatureItem[]
  howto: HowToStep[]
  /**
   * Support Sobdai configuration. Stored under extended_config.support in the
   * DB JSONB column — never a dedicated column. Designed to grow (QR image,
   * PromptPay, bank account, etc.) without requiring new migrations.
   */
  support: SupportConfig
  social_follow: SocialFollowConfig
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
    // Keyword-ownership copy (SEO-P0B): the homepage owns แนวข้อสอบราชการ.
    // The aspirational line lives on in the subtitle as supporting copy.
    badge: 'คลังข้อสอบราชการ',
    title: 'แนวข้อสอบราชการออนไลน์\nพร้อมเฉลยละเอียดทุกข้อ',
    subtitle: 'เริ่มต้นเส้นทางสู่ข้าราชการในฝัน ฝึกทำแนวข้อสอบราชการทีละข้อ พร้อมสรุปและเฉลยละเอียด',
    search_placeholder: 'ค้นหาตำแหน่ง เช่น นักวิชาการศึกษา, นิติกร',
    search_chip_label: 'ค้นหายอดนิยม:',
    browse_cta_label: 'ดูชุดข้อสอบทั้งหมด',
    stats: [
      { value: 'ตรงจุด', label: 'ตามเกณฑ์สอบ' },
      { value: 'ละเอียด', label: 'เฉลยทุกข้อ' },
      { value: 'วิเคราะห์', label: 'ชี้จุดอ่อน' },
    ],
  },
  cta: {
    primary: { label: 'ดูชุดข้อสอบ', href: '#exams', type: 'internal', open_in_new_tab: false },
    secondary: { label: 'ทดลองทำฟรี', href: '#exams', type: 'internal', open_in_new_tab: false },
    final_title: 'พร้อมเริ่มติวสอบแล้วใช่ไหม',
    final_subtitle: 'เลือกชุดข้อสอบที่ต้องการ แล้วเริ่มฝึกทำได้ทันที',
    final_button: { label: 'ดูชุดข้อสอบ', href: '#exams', type: 'internal', open_in_new_tab: false },
  },
  sections: {
    hero: true,
    featured: true,
    news: true,
    features: true,
    howto: true,
    cta: true,
  },
  seo: {
    // SEO-P0B: homepage owns the แนวข้อสอบราชการ practice-exam intent; the
    // news/recruitment intent belongs to /news and must not lead here.
    title: 'แนวข้อสอบราชการออนไลน์ พร้อมเฉลย | Sobdai',
    description: 'ฝึกทำแนวข้อสอบราชการออนไลน์ พร้อมเฉลยละเอียดทุกข้อ เลือกชุดข้อสอบตามหน่วยงานและตำแหน่งที่ต้องการ มีระบบวิเคราะห์จุดอ่อนและตัวอย่างให้ลองทำฟรี',
    og_image_url: '',
  },
  package_explorer: {
    title: 'เลือกแนวข้อสอบราชการตามหน่วยงานและตำแหน่ง',
    subtitle: 'แต่ละชุดข้อสอบมาพร้อมสรุปเนื้อหา แบบฝึกหัด เฉลยละเอียด และการติดตามความพร้อม',
    cta_label: 'ดูเส้นทางเตรียมสอบทั้งหมด',
    empty_title: 'กำลังเตรียมชุดข้อสอบใหม่',
    empty_description: 'ทีมงานกำลังอัปเดตคลังข้อสอบและสรุปเนื้อหาสำหรับปีล่าสุด กลับมาเช็คใหม่เร็วๆ นี้นะครับ',
  },
  latest_news: {
    // Supporting discovery module only — the ข่าวสอบราชการ cluster belongs to /news.
    title: 'ข่าวและประกาศล่าสุด',
    subtitle: 'ติดตามข่าวเปิดรับสมัคร กำหนดการสอบ และประกาศสำคัญ',
    cta_label: 'ดูข่าวทั้งหมด',
    limit: 3,
  },
  footer: {
    social_links: [
      { key: 'facebook', label: 'Facebook', url: 'https://facebook.com/sobdai', active: true },
      { key: 'line', label: 'LINE OA', url: '', active: false },
      { key: 'tiktok', label: 'TikTok', url: '', active: false },
    ],
  },
  features: [
    { icon: 'exam', title: 'ข้อสอบรายตำแหน่ง', description: 'คลังข้อสอบตรงตามหน่วยงานและตำแหน่ง คัดสรรตรงประเด็น' },
    { icon: 'hint', title: 'คำใบ้ทุกข้อ', description: 'กดดูคำใบ้ได้เมื่อต้องการ ช่วยให้คิดเป็นระบบก่อนดูเฉลย' },
    { icon: 'explain', title: 'เฉลยละเอียด', description: 'ทุกข้อมีคำอธิบายเหตุผล ไม่ใช่แค่บอกว่าข้อไหนถูก' },
    { icon: 'lock', title: 'บันทึกและทบทวน', description: 'เลือกบันทึกข้อที่น่าสนใจ และทบทวนข้อที่ตอบผิดได้ตลอดเวลา' },
  ],
  howto: [
    { num: '01', title: 'เลือกข้อสอบที่ใช่', desc: 'ค้นหาตามหน่วยงานและตำแหน่งที่เปิดสอบ ตรงตามเกณฑ์จริง' },
    { num: '02', title: 'ฝึกทำเหมือนสอบจริง', desc: 'ฝึกทำทีละข้อ พร้อมระบบจับเวลา คำใบ้ และเฉลยละเอียดทันที' },
    { num: '03', title: 'วิเคราะห์และพัฒนา', desc: 'ดูสถิติคะแนน วิเคราะห์จุดอ่อน และทบทวนเพื่อพัฒนาความพร้อม' },
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
  social_follow: SOCIAL_FOLLOW_DEFAULTS,
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

  // --- extended config groups
  const extRaw = r.extended_config || {}

  // package_explorer can arrive top-level from the admin client state, but is
  // stored under extended_config.package_explorer to avoid schema churn.
  const packageExplorerRaw =
    (typeof r.package_explorer === 'object' && r.package_explorer !== null)
      ? r.package_explorer
      : ((typeof extRaw.package_explorer === 'object' && extRaw.package_explorer !== null) ? extRaw.package_explorer : {})
  // latest_news: admin client sends it top-level; DB stores it under extended_config.
  const latestNewsRaw =
    (typeof r.latest_news === 'object' && r.latest_news !== null)
      ? r.latest_news
      : ((typeof extRaw.latest_news === 'object' && extRaw.latest_news !== null) ? extRaw.latest_news : {})
  // limit must be an integer in [1,6]; anything else falls back to the default.
  const lnLimitRaw = Number(latestNewsRaw.limit)
  const latestNewsLimit = Number.isInteger(lnLimitRaw) && lnLimitRaw >= 1 && lnLimitRaw <= 6
    ? lnLimitRaw
    : d.latest_news.limit
  const footerRaw =
    (typeof r.footer === 'object' && r.footer !== null)
      ? r.footer
      : ((typeof extRaw.footer === 'object' && extRaw.footer !== null) ? extRaw.footer : {})
  const footerLinksRaw = Array.isArray(footerRaw.social_links) ? footerRaw.social_links : []
  const fallbackFooterLinks = d.footer.social_links
  const footerKeys: FooterSocialLink['key'][] = ['facebook', 'line', 'tiktok']
  const social_links: FooterSocialLink[] = footerKeys.map((key) => {
    const rawLink = footerLinksRaw.find((link: any) => link?.key === key)
    const fallback = fallbackFooterLinks.find(link => link.key === key)!
    return {
      key,
      label: cleanString(rawLink?.label, fallback.label, 40),
      url: typeof rawLink?.url === 'string' ? rawLink.url : fallback.url,
      active: typeof rawLink?.active === 'boolean' ? rawLink.active : fallback.active,
    }
  })

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
      search_placeholder: cleanString(heroRaw.search_placeholder, d.hero.search_placeholder, 140),
      search_chip_label: cleanString(heroRaw.search_chip_label, d.hero.search_chip_label, 60),
      browse_cta_label: cleanString(heroRaw.browse_cta_label, d.hero.browse_cta_label, 80),
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
      news: sRaw.news === false ? false : true,
      features: sRaw.features === false ? false : true,
      howto: sRaw.howto === false ? false : true,
      cta: sRaw.cta === false ? false : true,
    },
    seo: {
      title: cleanString(seoRaw.title, d.seo.title, 120),
      description: cleanString(seoRaw.description, d.seo.description, 300),
      og_image_url: cleanString(seoRaw.og_image_url, '', 500),
    },
    package_explorer: {
      title: cleanString(packageExplorerRaw.title, d.package_explorer.title, 120),
      subtitle: cleanString(packageExplorerRaw.subtitle, d.package_explorer.subtitle, 300),
      cta_label: cleanString(packageExplorerRaw.cta_label, d.package_explorer.cta_label, 80),
      empty_title: cleanString(packageExplorerRaw.empty_title, d.package_explorer.empty_title, 120),
      empty_description: cleanString(packageExplorerRaw.empty_description, d.package_explorer.empty_description, 300),
    },
    latest_news: {
      // title + cta_label required (fallback if empty); subtitle may be empty.
      title: cleanString(latestNewsRaw.title, d.latest_news.title, 120),
      subtitle: typeof latestNewsRaw.subtitle === 'string'
        ? latestNewsRaw.subtitle.slice(0, 300)
        : d.latest_news.subtitle,
      cta_label: cleanString(latestNewsRaw.cta_label, d.latest_news.cta_label, 80),
      limit: latestNewsLimit,
    },
    footer: {
      social_links,
    },
    features,
    howto,
    support,
    social_follow: normalizeSocialFollowConfig(extRaw.social_follow),
  }
}

// ─── Server fetcher ─────────────────────────────────────────────────────────

/**
 * Read the singleton row (id=1) via the cookie-free anon client so this stays
 * ISR-cacheable. Merges over defaults + validates. Returns defaults on any
 * failure — the homepage must never 500 on config.
 *
 * Wrapped in React cache(): identical calls (same arguments) within the same
 * server render — e.g. RootLayout + generateMetadata + page — reuse one read,
 * and nothing is persisted across requests. The optional supabase override is
 * part of the cache key, so admin calls stay separate from public ones.
 *
 * Optional: pass a supabase client (e.g. admin) to bypass RLS in the admin UI.
 */
export const getHomepageSettings = cache(async function getHomepageSettings(
  supabaseOverride?: any
): Promise<HomepageSettings> {
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
})
