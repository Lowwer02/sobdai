export type FaqCategoryId =
  | 'general'
  | 'getting-started'
  | 'taking-exams'
  | 'results-and-review'

export interface FaqCategory {
  id: FaqCategoryId
  title: string
  description?: string
}

export interface FaqLink {
  text: string
  href: string
}

export interface FaqItem {
  id: string
  question: string
  category: FaqCategoryId
  categoryLabel: string
  paragraphs: string[]
  link?: FaqLink
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'general', title: 'ทั่วไป' },
  { id: 'getting-started', title: 'การเริ่มใช้งานและแพ็กเกจ' },
  { id: 'taking-exams', title: 'การทำข้อสอบ' },
  { id: 'results-and-review', title: 'ผลและการทบทวน' },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'what-is-sobdai',
    category: 'general',
    categoryLabel: 'ทั่วไป',
    question: 'Sobdai คืออะไร?',
    paragraphs: [
      'Sobdai คือเว็บแอปสำหรับฝึกทำแนวข้อสอบราชการ ช่วยให้คุณเลือกชุดข้อสอบ ฝึกทำ ดูผล ทบทวนข้อที่ตอบผิด บันทึกข้อที่สนใจ และดูหัวข้อที่ควรกลับไปฝึกเพิ่มเติม',
    ],
  },
  {
    id: 'where-to-start',
    category: 'getting-started',
    categoryLabel: 'การเริ่มใช้งานและแพ็กเกจ',
    question: 'จะเริ่มทำข้อสอบได้จากตรงไหน?',
    paragraphs: [
      'เริ่มจากหน้าคลังข้อสอบ เลือกแพ็กเกจที่ต้องการ แล้วเปิดหน้ารายละเอียดเพื่อดูชุดข้อสอบและเนื้อหาที่มีอยู่ในแพ็กเกจ',
    ],
    link: {
      text: 'ไปยังหน้าคลังข้อสอบ',
      href: '/packages',
    },
  },
  {
    id: 'login-requirement',
    category: 'getting-started',
    categoryLabel: 'การเริ่มใช้งานและแพ็กเกจ',
    question: 'ต้องสมัครสมาชิกหรือเข้าสู่ระบบก่อนใช้งานหรือไม่?',
    paragraphs: [
      'คุณสามารถดูรายละเอียดของแต่ละแพ็กเกจและตรวจสอบว่าในแพ็กเกจมีอะไรบ้างได้โดยไม่ต้องเข้าสู่ระบบ แต่หากต้องการเปิดอ่านเนื้อหาข้อสอบหรือเริ่มทำข้อสอบ จะต้องเข้าสู่ระบบก่อนทุกครั้ง ไม่ว่าแพ็กเกจนั้นจะเป็นแบบทดลองหรือไม่ก็ตาม',
      'ชุดข้อสอบตัวอย่างช่วยให้ผู้ใช้ที่เข้าสู่ระบบแล้วทดลองทำได้โดยไม่ต้องมีสิทธิ์เข้าถึงแพ็กเกจเต็ม ตามเงื่อนไขของชุดนั้น',
    ],
  },
  {
    id: 'practice-vs-mock',
    category: 'taking-exams',
    categoryLabel: 'การทำข้อสอบ',
    question: 'ฝึกทำกับจำลองสอบต่างกันอย่างไร?',
    paragraphs: [
      'โหมดฝึกทำเหมาะสำหรับการเรียนรู้และทบทวน ไม่มีการนับเวลาถอยหลัง หลังเลือกคำตอบระบบจะแสดงผลของข้อนั้น และแสดงคำอธิบายหรือข้อมูลประกอบเมื่อข้อดังกล่าวมีข้อมูล',
      'โหมดจำลองสอบมีการจับเวลาและทำข้อสอบต่อเนื่อง โดยผลและรายละเอียดสำหรับทบทวนจะแสดงหลังส่งข้อสอบ',
    ],
  },
  {
    id: 'exam-explanations',
    category: 'taking-exams',
    categoryLabel: 'การทำข้อสอบ',
    question: 'ข้อสอบมีเฉลยหรือไม่?',
    paragraphs: [
      'ข้อสอบใน Sobdai มีข้อมูลสำหรับช่วยทบทวนคำตอบ โดยในข้อที่มีข้อมูลอาจมีคำอธิบาย เหตุผล หลักการ หรือแหล่งอ้างอิงประกอบ',
    ],
  },
  {
    id: 'where-to-view-results',
    category: 'results-and-review',
    categoryLabel: 'ผลและการทบทวน',
    question: 'ทำข้อสอบเสร็จแล้วดูผลตรงไหน?',
    paragraphs: [
      'หลังส่งข้อสอบ ระบบจะแสดงผลของการทำข้อสอบครั้งนั้น เช่น คะแนน ความถูกต้อง และเวลาที่ใช้ คุณสามารถกลับมาดูข้อมูลการทำข้อสอบของคุณได้จากหน้า “ข้อสอบของฉัน”',
    ],
    link: {
      text: 'ไปยังหน้าข้อสอบของฉัน',
      href: '/exams',
    },
  },
  {
    id: 'review-wrong-answers',
    category: 'results-and-review',
    categoryLabel: 'ผลและการทบทวน',
    question: 'สามารถทบทวนเฉพาะข้อที่ตอบผิดได้ไหม?',
    paragraphs: [
      'ได้ ในหน้าทบทวนผลการทำข้อสอบ คุณสามารถเลือกดูข้อที่ตอบผิดหรือไม่ได้ตอบ หรือเลือกดูทุกข้อของการทำข้อสอบครั้งนั้นได้',
    ],
  },
  {
    id: 'practice-only-wrong-set',
    category: 'results-and-review',
    categoryLabel: 'ผลและการทบทวน',
    question: 'สามารถฝึกทำเฉพาะข้อที่เคยตอบผิดเป็นชุดใหม่ได้ไหม?',
    paragraphs: [
      'ตอนนี้ Sobdai ยังไม่ได้สร้างชุดฝึกใหม่จากเฉพาะข้อที่เคยตอบผิด หากต้องการฝึกอีกครั้ง คุณสามารถกด “ทำชุดนี้อีกครั้ง” เพื่อเริ่มทำชุดข้อสอบเดิมใหม่ทั้งชุด',
    ],
  },
  {
    id: 'bookmark-questions',
    category: 'results-and-review',
    categoryLabel: 'ผลและการทบทวน',
    question: 'บันทึกข้อสอบไว้ทบทวนได้ไหม?',
    paragraphs: [
      'ได้ คุณสามารถบันทึกข้อที่สนใจจากหน้าข้อสอบหรือหน้าทบทวนไว้กลับมาดูภายหลัง โดยข้อที่บันทึกล่าสุดจะแสดงในหน้า “ข้อสอบของฉัน”',
    ],
  },
  {
    id: 'weak-topics-calculation',
    category: 'results-and-review',
    categoryLabel: 'ผลและการทบทวน',
    question: 'หัวข้อที่ควรทบทวนคำนวณจากอะไร?',
    paragraphs: [
      'Sobdai ใช้ผลจากการทำข้อสอบที่ผ่านมาเพื่อช่วยสรุปหัวข้อที่คุณมีคำตอบผิดและควรกลับไปให้ความสำคัญเพิ่มเติม ข้อมูลนี้ใช้เป็นตัวช่วยวางแผนการทบทวน ไม่ใช่การคาดการณ์หรือรับประกันผลสอบจริง',
    ],
  },
  {
    id: 'resume-incomplete',
    category: 'taking-exams',
    categoryLabel: 'การทำข้อสอบ',
    question: 'ถ้าทำข้อสอบไม่เสร็จ สามารถกลับมาทำต่อได้ไหม?',
    paragraphs: [
      'ระบบมีการบันทึกความคืบหน้าของการทำข้อสอบ เพื่อให้คุณสามารถกลับมาทำต่อจากการทำข้อสอบที่ยังไม่เสร็จได้',
    ],
  },
  {
    id: 'mobile-usage',
    category: 'general',
    categoryLabel: 'ทั่วไป',
    question: 'ใช้งาน Sobdai บนมือถือได้ไหม?',
    paragraphs: [
      'ได้ Sobdai รองรับการใช้งานผ่านเว็บเบราว์เซอร์บนคอมพิวเตอร์ แท็บเล็ต และสมาร์ตโฟน',
    ],
  },
  {
    id: 'package-validity',
    category: 'getting-started',
    categoryLabel: 'การเริ่มใช้งานและแพ็กเกจ',
    question: 'แพ็กเกจใช้งานได้นานแค่ไหน?',
    paragraphs: [
      'ระยะเวลาและเงื่อนไขการเข้าถึงขึ้นอยู่กับรายละเอียดของแต่ละแพ็กเกจ กรุณาตรวจสอบข้อมูลบนหน้าแพ็กเกจก่อนเริ่มใช้งาน',
    ],
  },
  {
    id: 'government-affiliation',
    category: 'general',
    categoryLabel: 'ทั่วไป',
    question: 'Sobdai เป็นเว็บไซต์ของหน่วยงานราชการหรือไม่?',
    paragraphs: [
      'Sobdai เป็นบริการอิสระสำหรับช่วยเตรียมสอบ และไม่ได้เป็นเว็บไซต์ทางการของหน่วยงานราชการ สำหรับกำหนดการรับสมัคร คุณสมบัติ เงื่อนไข และประกาศสอบ ควรตรวจสอบข้อมูลจากประกาศทางการของหน่วยงานที่เกี่ยวข้องอีกครั้ง',
    ],
  },
]

/**
 * Builds standard Schema.org FAQPage structured data directly from the
 * canonical FAQ items, guaranteeing that visible page text and structured data
 * can never diverge.
 */
export function buildFaqPageJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.paragraphs.join('\n\n'),
      },
    })),
  }
}
