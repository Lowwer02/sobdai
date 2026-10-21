import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('./page.tsx')
const about = read('../../components/about/AboutPageV2.tsx')
const person = read('../../components/about/AboutPerson.tsx')
const principles = read('../../components/about/AboutPrinciples.tsx')
const trust = read('../../components/about/AboutTrust.tsx')
const legalLayout = read('../../components/legal/LegalLayout.tsx')
const markdown = read('../../components/legal/MarkdownRenderer.tsx')
const rootLayout = read('../layout.tsx')

test('About preserves main metadata, canonical route, and existing AboutPage JSON-LD', () => {
  assert.match(page, /ABOUT_TITLE/)
  assert.match(page, /ABOUT_DESCRIPTION/)
  assert.match(page, /createPageMetadata\(/)
  assert.match(page, /path: '\/about'/)
  assert.match(page, /'@type': 'AboutPage'/)
  assert.match(page, /SITE_URL\}\/#organization/)
  assert.equal((page.match(/'@type': 'AboutPage'/g) ?? []).length, 1)
  assert.match(page, /<AboutPerson \/>/)
  assert.match(page, /<AboutPrinciples \/>/)
  assert.match(page, /<AboutTrust \/>/)
})

test('platform story and founder introduction remain before credibility content', () => {
  const hero = page.indexOf('id="about-h1"')
  const personSection = page.indexOf('<AboutPerson />')
  const principlesSection = page.indexOf('<AboutPrinciples />')
  const experienceSection = page.indexOf('<AboutPageV2')
  const trustSection = page.indexOf('<AboutTrust />')
  assert.ok(hero >= 0 && personSection > hero)
  assert.ok(principlesSection > personSection)
  assert.ok(experienceSection > principlesSection)
  assert.ok(trustSection > experienceSection)
  assert.match(principles, /สิ่งที่เราให้ความสำคัญ/)
  assert.match(about, /ประสบการณ์ที่หล่อหลอมแนวคิดของ Sobdai/)
})

test('About adds no nested main and uses the root layout landmark', () => {
  assert.equal((rootLayout.match(/<main\b/g) ?? []).length, 1)
  assert.match(rootLayout, /<main className="flex-grow">\{children\}<\/main>/)
  assert.doesNotMatch(page + about, /<main\b|<\/main>/)
  assert.equal((page.match(/<h1 id="about-h1"/g) ?? []).length, 1)
  assert.doesNotMatch(about, /<h1\b/)
})

test('all six entries remain written-exam passes without implying final selection or appointment', () => {
  assert.equal((about.match(/organization: '/g) ?? []).length, 6)
  assert.match(about, /ผ่านการสอบข้อเขียน \(ภาค ข\) จำนวน 6 หน่วยงาน/)
  assert.match(about, /ผ่านการสอบข้อเขียนภาค ข เท่านั้น/)
  assert.match(about, /ไม่ได้หมายถึงผ่านทุกขั้นตอนหรือได้รับการบรรจุ/)
  assert.match(about, /ยังไม่ได้เทียบกับประกาศสอบต้นฉบับ/)
  assert.doesNotMatch(about, /สอบติด 6 หน่วยงาน|บรรจุแล้ว 6 หน่วยงาน/)
  assert.equal((about.match(/ระดับปริญญาโท/g) ?? []).length, 3)
})

test('education and professional experience remain grouped without implying current full-time roles', () => {
  for (const text of [
    'เศรษฐศาสตรบัณฑิต (ศ.บ.)',
    'วิทยาศาสตรมหาบัณฑิต สาขาวิชาธุรกิจดิจิทัลระหว่างประเทศ (หลักสูตรนานาชาติ)',
    'นักวิชาการศึกษา — สำนักงานเลขาธิการสภาการศึกษา',
    'นักวิเคราะห์การตลาดและการตลาดดิจิทัล — วิทยาลัยนานาชาติ มหาวิทยาลัยรังสิต',
    'นักวิเคราะห์ธุรกิจและการตลาดดิจิทัล — สถาบันส่งเสริมนักเรียนเรียนต่อต่างประเทศ',
    'นักวิเคราะห์ธุรกิจและการตลาดดิจิทัล — ธุรกิจเอเจนซี่',
    'ที่ปรึกษาด้านการตลาดดิจิทัล',
    'วิทยากรรับเชิญ — คณะเศรษฐศาสตร์ มหาวิทยาลัยรังสิต',
    'ผู้ช่วยงานวิจัย — วิทยาลัยนานาชาติ มหาวิทยาลัยรังสิต',
    'ไม่ได้หมายความว่าทั้งหมดเป็นงานประจำหรือดำรงอยู่ในปัจจุบัน',
  ]) {
    assert.ok(about.includes(text), `missing approved experience content: ${text}`)
  }
})

test('policy appointment remains attributed and unverified, with committee duties separated', () => {
  for (const text of [
    'ข้อมูลการแต่งตั้งและบทบาทนี้ได้รับแจ้งจาก กิตติพงษ์ จงคล้ายกลาง',
    'ยังไม่ได้ตรวจสอบกับเอกสารต้นฉบับ',
    'UNVERIFIED:',
    'คำสั่งคณะกรรมการบูรณาการและเร่งรัดการขับเคลื่อนนโยบายการศึกษาของกระทรวงศึกษาธิการ ที่ 2/2569',
    'รายการ 1.11',
    'เจ้าหน้าที่สำนักนโยบายและแผนการศึกษา',
    'อนุกรรมการและผู้ช่วยเลขานุการ',
    'ขอบเขตภารกิจของคณะอนุกรรมการ',
    'ลดความเหลื่อมล้ำทางการศึกษา',
    'เพิ่มโอกาสเข้าถึงการศึกษาที่มีคุณภาพ',
    'พัฒนาแนวทางจัดสรรงบประมาณและทรัพยากรการศึกษา',
    'พัฒนาการบริหารจัดการสถานศึกษา',
    'ส่งเสริมการใช้เทคโนโลยีดิจิทัลในการบริหารจัดการศึกษา',
    'ไม่ใช่ผลงานส่วนบุคคล',
  ]) {
    assert.ok(about.includes(text), `missing appointment qualification: ${text}`)
  }
  assert.doesNotMatch(about, /ก่อนเผยแพร่ต่อสาธารณะ|ตรวจสอบแล้ว|ได้รับการรับรองจากกระทรวง/)
  assert.doesNotMatch(about, /https?:\/\/[^\s"']*(?:2\/2569|education|moe)/i)
})

test('About keeps the local portrait, date, legal document version, and platform disclaimer', () => {
  assert.match(person, /src="\/images\/about\/kittipong-portrait\.webp"/)
  assert.ok(existsSync(new URL('../../public/images/about/kittipong-portrait.webp', import.meta.url)))
  assert.match(page, /version=\{LEGAL\.aboutVersion\}/)
  assert.match(about, /const aboutContentUpdatedOn = '20 ตุลาคม 2569'/)
  assert.match(about, /เวอร์ชันเอกสาร: \{version\}/)
  assert.match(person, /แพลตฟอร์มอิสระ/)
  assert.match(trust, /มิได้เป็นหน่วยงานของรัฐ/)
  assert.match(trust, /href="\/privacy"/)
  assert.match(trust, /href="\/cookies"/)
  assert.match(trust, /href="\/terms"/)
})

test('legal markdown keeps parser behavior and uses semantic theme tokens', () => {
  assert.match(legalLayout, /bg-background/)
  assert.match(legalLayout, /text-foreground/)
  assert.match(markdown, /remarkPlugins=\{\[remarkGfm\]\}/)
  assert.match(markdown, /rehypePlugins=\{\[rehypeRaw\]\}/)
  assert.match(markdown, /text-muted-foreground/)
  assert.match(markdown, /text-brand/)
  assert.doesNotMatch(markdown, /prose-invert|#F5E9D6|#D4AF37/)
})
