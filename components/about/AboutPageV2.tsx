import styles from '@/app/about/about.module.css'

const aboutContentUpdatedOn = '20 ตุลาคม 2569'

const examExperience = [
  {
    position: 'นักวิเคราะห์',
    organization: 'สำนักงานนโยบายและแผนการขนส่งและจราจร (สนข.)',
    education: 'ระดับปริญญาโท',
  },
  {
    position: 'นักวิชาการศึกษา',
    organization: 'สำนักงานเลขาธิการสภาการศึกษา (สกศ.)',
    education: 'ระดับปริญญาโท',
  },
  {
    position: 'นักวิเคราะห์',
    organization: 'สำนักงานสภาพัฒนาการเศรษฐกิจและสังคมแห่งชาติ (สภาพัฒน์)',
    education: 'ระดับปริญญาโท',
  },
  {
    position: 'นักวิเคราะห์',
    organization: 'สำนักงานปลัดกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
  },
  {
    position: 'นักวิเคราะห์',
    organization: 'สำนักเลขาธิการคณะรัฐมนตรี (สลค.)',
  },
  {
    position: 'นักวิชาการตรวจเงินแผ่นดิน',
    organization: 'สำนักงานการตรวจเงินแผ่นดิน (สตง.)',
  },
]

const experienceGroups = [
  {
    title: 'ภาครัฐและการศึกษา',
    count: '1 บทบาท',
    roles: ['นักวิชาการศึกษา — สำนักงานเลขาธิการสภาการศึกษา'],
  },
  {
    title: 'ธุรกิจและดิจิทัล',
    count: '4 บทบาท',
    roles: [
      'นักวิเคราะห์การตลาดและการตลาดดิจิทัล — วิทยาลัยนานาชาติ มหาวิทยาลัยรังสิต',
      'นักวิเคราะห์ธุรกิจและการตลาดดิจิทัล — สถาบันส่งเสริมนักเรียนเรียนต่อต่างประเทศ',
      'นักวิเคราะห์ธุรกิจและการตลาดดิจิทัล — ธุรกิจเอเจนซี่',
      'ที่ปรึกษาด้านการตลาดดิจิทัล',
    ],
  },
  {
    title: 'งานวิชาการ',
    count: '3 บทบาท',
    roles: [
      'วิทยากรรับเชิญ — คณะเศรษฐศาสตร์ มหาวิทยาลัยรังสิต',
      'วิทยากรรับเชิญ — วิทยาลัยนานาชาติ มหาวิทยาลัยรังสิต',
      'ผู้ช่วยงานวิจัย — วิทยาลัยนานาชาติ มหาวิทยาลัยรังสิต',
    ],
  },
]

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-6 max-w-3xl">
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={styles.sectionHeading}>{title}</h2>
      {description ? (
        <p className="leading-7 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export default function AboutPageV2({ version }: { version: string }) {
  return (
    <>
      <section aria-labelledby="founder-credibility-heading" className="scroll-mt-24">
        <div className={styles.hairline} aria-hidden="true" />
        <div className={styles.sectionInner}>
          <SectionHeading
            id="founder-credibility-heading"
            eyebrow="ประสบการณ์และพื้นฐานของผู้พัฒนา"
            title="ประสบการณ์ที่หล่อหลอมแนวคิดของ Sobdai"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-3xl font-bold text-brand">6 หน่วยงาน</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">ผ่านข้อเขียน ภาค ข</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-3xl font-bold text-brand">ปริญญาตรีและโท</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                เศรษฐศาสตร์และธุรกิจดิจิทัลระหว่างประเทศ
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-3xl font-bold text-brand">นโยบายการศึกษา</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                อนุกรรมการและผู้ช่วยเลขานุการ
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            เนื้อหาเกี่ยวกับ Sobdai ปรับปรุงล่าสุด: {aboutContentUpdatedOn} · เวอร์ชันเอกสาร: {version}
          </p>
        </div>
      </section>

      <section aria-labelledby="exam-experience-heading" className="scroll-mt-24">
        <div className={styles.hairline} aria-hidden="true" />
        <div className={styles.sectionInner}>
          <SectionHeading
            id="exam-experience-heading"
            eyebrow="ประสบการณ์จากสนามสอบ"
            title="ประสบการณ์สอบแข่งขันเข้ารับราชการ"
            description="ผ่านการสอบข้อเขียน (ภาค ข) จำนวน 6 หน่วยงาน"
          />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {examExperience.map((exam, index) => (
              <li
                key={`${exam.organization}-${exam.position}`}
                className="flex min-h-36 gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <span aria-hidden="true" className="pt-1 text-xs font-semibold tabular-nums text-brand">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground">{exam.position}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{exam.organization}</p>
                  {exam.education ? (
                    <p className="mt-2 text-xs text-muted-foreground">{exam.education}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl border border-border bg-wash p-4 text-sm leading-6 text-muted-foreground">
            ทั้ง 6 รายการหมายถึงผ่านการสอบข้อเขียนภาค ข เท่านั้น ไม่ได้หมายถึงผ่านทุกขั้นตอนหรือได้รับการบรรจุ
            ชื่อตำแหน่งแสดงตามข้อมูลที่ผู้พัฒนาแจ้ง และยังไม่ได้เทียบกับประกาศสอบต้นฉบับ
          </p>
        </div>
      </section>

      <section aria-labelledby="education-heading" className="scroll-mt-24">
        <div className={styles.hairline} aria-hidden="true" />
        <div className={styles.sectionInner}>
          <SectionHeading
            id="education-heading"
            eyebrow="พื้นฐานการศึกษา"
            title="ประวัติการศึกษา"
            description="ชื่อปริญญาและหลักสูตรจัดรูปแบบตามข้อมูลหลักสูตรของมหาวิทยาลัย"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">ปริญญาตรี</p>
              <h3 className="mt-2 text-lg font-bold text-foreground">เศรษฐศาสตรบัณฑิต (ศ.บ.)</h3>
              <p className="mt-1 text-muted-foreground">มหาวิทยาลัยรามคำแหง</p>
              <a
                className="mt-4 inline-flex rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:underline"
                href="https://www.ru.ac.th/th/Center_study_plan/19/10.pdf"
                target="_blank"
                rel="noreferrer"
              >
                ดูชื่อปริญญาจากหลักสูตรมหาวิทยาลัย
              </a>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">ปริญญาโท</p>
              <h3 className="mt-2 text-lg font-bold text-foreground">
                วิทยาศาสตรมหาบัณฑิต สาขาวิชาธุรกิจดิจิทัลระหว่างประเทศ (หลักสูตรนานาชาติ)
              </h3>
              <p className="mt-1 text-muted-foreground">มหาวิทยาลัยรังสิต</p>
              <a
                className="mt-4 inline-flex rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:underline"
                href="https://grad.rsu.ac.th/"
                target="_blank"
                rel="noreferrer"
              >
                ดูรายชื่อหลักสูตรจากบัณฑิตวิทยาลัย
              </a>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="professional-experience-heading" className="scroll-mt-24">
        <div className={styles.hairline} aria-hidden="true" />
        <div className={styles.sectionInner}>
          <SectionHeading
            id="professional-experience-heading"
            eyebrow="ประสบการณ์วิชาชีพ"
            title="ประสบการณ์การทำงาน"
            description="บทบาทเหล่านี้เกิดขึ้นในต่างช่วงเวลาและรูปแบบงาน ไม่ได้หมายความว่าทั้งหมดเป็นงานประจำหรือดำรงอยู่ในปัจจุบัน"
          />
          <div className="space-y-3">
            {experienceGroups.map((group) => (
              <details key={group.title} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <summary className="flex cursor-pointer items-center justify-between gap-4 rounded font-semibold text-foreground">
                  <span>{group.title}</span>
                  <span className="shrink-0 text-sm font-normal text-muted-foreground">{group.count}</span>
                </summary>
                <ul className="mt-4 space-y-3 border-t border-border pt-4">
                  {group.roles.map((role) => (
                    <li key={role} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{role}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* INTERNAL EVIDENCE: Owner confirms personal participation. The supplied scan identifies the staff role and office, not the owner's name. Official-source authentication remains unverified. */}
      <section aria-labelledby="education-policy-heading" className="scroll-mt-24">
        <div className={styles.hairline} aria-hidden="true" />
        <div className={styles.sectionInner}>
          <SectionHeading
            id="education-policy-heading"
            eyebrow="การมีส่วนร่วมเชิงนโยบาย"
            title="การมีส่วนร่วมในการขับเคลื่อนนโยบายการศึกษา"
            description="ผู้พัฒนา Sobdai ยืนยันว่าเคยปฏิบัติหน้าที่ในบทบาทนี้ ขณะเป็นเจ้าหน้าที่สำนักนโยบายและแผนการศึกษา สำนักงานเลขาธิการสภาการศึกษา"
          />
          <article className="rounded-2xl border border-brand/30 bg-card p-5 shadow-md sm:p-7">
            <p className="mb-5 text-sm leading-6 text-muted-foreground">
              คำสั่งคณะกรรมการบูรณาการและเร่งรัดการขับเคลื่อนนโยบายการศึกษาของกระทรวงศึกษาธิการ ที่ 2/2569
              เรื่อง แต่งตั้งคณะอนุกรรมการลดความเหลื่อมล้ำและพัฒนาการบริหารจัดการ
            </p>
            <h3 className="text-lg font-bold text-foreground">
              คณะอนุกรรมการลดความเหลื่อมล้ำและพัฒนาการบริหารจัดการ
            </h3>
            <div className="mt-4 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  เจ้าหน้าที่สำนักนโยบายและแผนการศึกษา
                </p>
                <p className="mt-1 text-muted-foreground">
                  สำนักงานเลขาธิการสภาการศึกษา
                </p>
              </div>
              <p className="inline-flex w-fit rounded-full border border-brand/30 bg-wash px-3 py-1.5 text-sm font-semibold text-brand">
                อนุกรรมการและผู้ช่วยเลขานุการ
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              ตำแหน่งดังกล่าวปรากฏในองค์ประกอบคณะอนุกรรมการตามคำสั่งนี้ หน้า 2 รายการ 1.10 และ 1.11
              โดยเอกสารระบุตำแหน่งและหน่วยงาน แต่ไม่ได้ระบุชื่อผู้พัฒนาเป็นรายบุคคล
            </p>
            <div className="pt-5">
              <h3 className="font-semibold text-foreground">ขอบเขตภารกิจของคณะอนุกรรมการ</h3>
              <ul className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
                <li>ลดความเหลื่อมล้ำทางการศึกษา</li>
                <li>ขยายโอกาสเข้าถึงการศึกษาที่มีคุณภาพ</li>
                <li>จัดสรรงบประมาณและทรัพยากรทางการศึกษาอย่างเป็นธรรม</li>
                <li>พัฒนาการบริหารจัดการสถานศึกษา</li>
                <li className="sm:col-span-2">นำเทคโนโลยีดิจิทัลมาสนับสนุนการบริหารจัดการศึกษา</li>
              </ul>
            </div>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              รายการภารกิจอธิบายหน้าที่ของคณะอนุกรรมการ ไม่ใช่ผลงานส่วนบุคคล
            </p>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              ประสบการณ์ดังกล่าวเป็นบทบาทส่วนบุคคลของผู้พัฒนา และไม่แสดงถึงการรับรองหรือการสนับสนุน Sobdai จากกระทรวงศึกษาธิการ
            </p>
          </article>
        </div>
      </section>
    </>
  )
}
