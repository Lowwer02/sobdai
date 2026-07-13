export const legalConfig = {
  companyName: 'Sobdai',
  supportEmail: 'support@sobdai.com',
  termsVersion: '1.0',
  privacyVersion: '1.0',
  cookiesVersion: '1.0',
  aboutVersion: '1.0',
  contactVersion: '1.0',
  lastUpdated: '30 มิถุนายน 2026', // Format for Thai users as the app is in Thai
}

/**
 * Social media links for the Footer "ติดตามเรา" section.
 *
 * `active: false` entries are rendered as disabled (greyed, no href) so the
 * layout is already future-ready for LINE OA / TikTok — flipping `active` to
 * true + adding the URL turns them on with zero refactor.
 */
export interface SocialLink {
  key: 'facebook' | 'line' | 'tiktok'
  label: string
  url: string
  active: boolean
}

export const socialLinks: SocialLink[] = [
  { key: 'facebook', label: 'Facebook', url: 'https://facebook.com/sobdai', active: true },
  { key: 'line', label: 'LINE OA', url: '', active: false },
  { key: 'tiktok', label: 'TikTok', url: '', active: false },
]


export const LEGAL = legalConfig;
