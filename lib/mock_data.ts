export interface Topic {
  id: string;
  title: string;
  question_count: number;
  is_sample?: boolean;
}

export interface Section {
  title: string;
  topics: Topic[];
}

export interface Package {
  id: string;
  department: string;
  position: string;
  subject: string;
  year: number;
  total_questions: number;
  price: number;
  tag?: 'ใหม่' | 'ขายดี';
  sections: Section[];
}

export const PACKAGES: Package[] = [
  {
    id: 'demo-1', // keeping the ID mapping simple for now
    department: 'สำนักงานปลัดกระทรวง อว.',
    position: 'นักวิเคราะห์นโยบายและแผน',
    subject: 'เนื้อหาตามโครงสร้างหลักสูตร (อว.)',
    year: 2569,
    total_questions: 2135,
    price: 99,
    tag: 'ใหม่',
    sections: [
      {
        title: 'ส่วนที่ 1 ความรู้เกี่ยวกับการปฏิบัติราชการ',
        topics: [
          { id: 'demo-1', title: 'พ.ร.บ. แผนด้านการอุดมศึกษาฯ พ.ศ. 2566-2570', question_count: 20, is_sample: true },
          { id: 'demo-2', title: 'กรอบนโยบายและยุทธศาสตร์ อววน.', question_count: 20, is_sample: true },
          { id: 'topic-3', title: 'พ.ร.บ. ข้อมูลข่าวสารของราชการ พ.ศ. 2540', question_count: 112 },
          { id: 'topic-4', title: 'พ.ร.บ. ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534', question_count: 136 },
          { id: 'topic-5', title: 'ระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526', question_count: 164 },
          { id: 'topic-6', title: 'ความรู้ทางด้านภาษาอังกฤษ', question_count: 211 },
        ]
      },
      {
        title: 'ส่วนที่ 2 ความรู้เกี่ยวกับการปฏิบัติงานในตำแหน่ง',
        topics: [
          { id: 'topic-7', title: 'การจัดทำแผนยุทธศาสตร์ แผนปฏิบัติการ', question_count: 85 },
          { id: 'topic-8', title: 'การติดตามและประเมินผลนโยบาย', question_count: 90 },
          { id: 'topic-9', title: 'การจัดการความรู้และนวัตกรรม', question_count: 45 },
          { id: 'topic-10', title: 'ความรู้เกี่ยวกับระบบงบประมาณ', question_count: 120 },
        ]
      }
    ]
  },
  {
    id: 'demo-3',
    department: 'กรมส่งเสริมการปกครองท้องถิ่น',
    position: 'นักวิชาการศึกษา',
    subject: 'ความรู้ความสามารถเฉพาะตำแหน่ง',
    year: 2568,
    total_questions: 250,
    price: 199,
    sections: [
      {
        title: 'ส่วนที่ 1 ความรู้พื้นฐาน',
        topics: [
          { id: 'topic-11', title: 'พ.ร.บ. การศึกษาแห่งชาติ', question_count: 150 },
        ]
      }
    ]
  }
];
