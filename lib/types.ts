// Package (แทน Exam เดิม)
export interface Package {
  id: string;
  code: string;
  name: string;
  slug: string;
  organization_id: string;
  position_id: string;
  exam_year: number;
  version: number;
  original_price: number;
  current_price: number;
  description: string;
  features: any; // jsonb
  is_published: boolean;
  cover_image_url?: string;
  created_at: string;
}

// Exam Set
// Aligned with the real `exam_sets` schema:
//   - 001_init_admin_schema.sql: id, package_id, name, description,
//     duration_minutes, is_sample, sort_order, created_at, updated_at
//   - 019_display_order.sql: display_order, released_at (nullable)
//   - 024_exam_sets_passing_score.sql: passing_score
// Prior drift (title / time_limit_minutes) removed during Milestone 1 Refactor #2.
export interface ExamSet {
  id: string;
  package_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  is_sample: boolean;
  sort_order: number;
  display_order: number;
  released_at: string | null;
  passing_score: number;
  created_at: string;
  updated_at: string;
}

// ข้อสอบ
export interface Question {
  id: string;
  content: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  hint?: string;
  full_explanation?: string;
  why_a_wrong?: string;
  why_b_wrong?: string;
  why_c_wrong?: string;
  why_d_wrong?: string;
  reference?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category?: string;
  tags: string[];
  status: 'Draft' | 'Review' | 'Published';
  subject?: string;
  law?: string;
  topic?: string;
  created_at: string;
}

// คำสั่งซื้อ
export interface Order {
  id: string;
  user_id: string;
  package_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'revoked';
  payment_provider?: string;
  created_at: string;
  updated_at: string;
}

// User Profile
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: string;
  status: string;
  created_at: string;
}
