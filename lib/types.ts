// ชุดข้อสอบ
export interface Exam {
  id: string;
  title: string;
  description: string;
  subject: string;       // วิชา เช่น "ความรู้ทั่วไป"
  department: string;    // กรม เช่น "กรมบัญชีกลาง"
  position: string;      // ตำแหน่ง เช่น "นักวิชาการเงินและบัญชี"
  year: number;          // ปี เช่น 2569
  total_questions: number;
  price: number;         // ราคา บาท
  is_active: boolean;
  cover_image_url?: string;
  created_at: string;
}

// ข้อสอบแต่ละข้อ
export interface Question {
  id: string;
  exam_id: string;
  question_number: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_answer: 'a' | 'b' | 'c' | 'd';
  explanation: string;   // คำอธิบายเฉลย
  hint?: string;         // คำใบ้ (optional)
  difficulty: 1 | 2 | 3; // 1=ง่าย, 2=กลาง, 3=ยาก
  created_at: string;
}

// access token (สิทธิ์เข้าถึงข้อสอบ)
export interface AccessToken {
  id: string;
  user_id: string;
  exam_id: string;
  order_id: string;
  expires_at: string;    // หมดอายุ 1 ปีหลังซื้อ
  created_at: string;
}

// คำสั่งซื้อ
export interface Order {
  id: string;
  user_id: string;
  exam_id: string;
  amount: number;        // ราคาจริง (บาท)
  status: 'pending' | 'paid' | 'failed';
  omise_charge_id?: string;
  omise_token?: string;
  created_at: string;
  paid_at?: string;
}

// ประวัติการทำข้อสอบ
export interface Attempt {
  id: string;
  user_id: string;
  exam_id: string;
  question_id: string;
  selected_answer: 'a' | 'b' | 'c' | 'd';
  is_correct: boolean;
  time_spent_seconds?: number;
  created_at: string;
}

// User Profile
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
}

// สถิติการทำข้อสอบ
export interface ExamStats {
  exam_id: string;
  total_attempted: number;
  total_correct: number;
  accuracy_percent: number;
  last_attempted_at?: string;
}
