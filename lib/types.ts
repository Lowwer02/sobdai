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
//   - 026_exam_set_foundation.sql: exam_type, status, subject, document
// Prior drift (title / time_limit_minutes) removed during Milestone 1 Refactor #2.
//
// Intentionally ABSENT (per milestone decisions):
//   - slug            : public exam routing is by UUID examSetId, no slug needed.
//   - question_count  : exam_set_questions is the source of truth; computed via
//                       COUNT(*) on demand. Caching deferred to a later milestone.
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
  exam_type: 'document' | 'simulation';
  status: 'draft' | 'published' | 'archived';
  // subject/document are TEXT (no normalized lookup tables yet — migration 019
  // defers them). Values must be chosen from Question Bank metadata
  // (get_question_metadata()), never free-form. Stored on exam_sets purely to
  // scope/filter sets; they are NOT foreign keys.
  subject: string | null;
  document: string | null;
  created_at: string;
  updated_at: string;
}

// ข้อสอบ
// IG-2 axes (migration 027 — Session 6.20 E-0): the four Blueprint v3.0 filter
// axes are nullable. Existing rows have NULL → Engine treats as Incomplete
// Metadata → reduced Confidence per Scoring Model v1.0 §11. The enum unions
// below mirror the DB CHECK constraints exactly; the vocabulary is the
// authoritative Blueprint v3.0 set (IG-2 Amendment Appendix A). Note the
// Pattern sixth value is the two-word `Matching Concept` (not `Matching`).
export interface Question {
  id: string;
  // Immutable business identifier (Q-000001, Q-000002, ...). Generated ONLY by
  // the importer (app/admin/import/actions.ts) via the allocate_question_codes
  // RPC. Unique + indexed at the DB; once set it can never change. Absent on
  // questions created before migration 026 until they are (re)imported.
  question_code?: string;
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
  // IG-2 axes (migration 027). Nullable for v2.1-authored content and any
  // pre-migration row. Vocabulary per Blueprint v3.0 / IG-2 Amendment.
  blueprint_type?: 'Memory' | 'Concept' | 'Procedure' | 'Scenario' | null;
  learning_objective?: 'LO1' | 'LO2' | 'LO3' | 'LO4' | null;
  question_pattern?:
    | 'Positive'
    | 'Negative'
    | 'Best Answer'
    | 'Scenario'
    | 'Sequence'
    | 'Matching Concept'
    | null;
  // Free-text legal-section reference, e.g. 'ม.6–8'. Normalized by the
  // importer (trim, unicode NFC, en-dash U+2013 for ranges) before insert.
  section?: string | null;
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
