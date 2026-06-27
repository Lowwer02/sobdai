# Sobdai System Architecture

*Last Updated: Session 6.8.5 (User Settings Foundation)*

## 1. Routing (Next.js App Router)

### Public Routes
- `/` - Landing Page
- `/about` - About Page
- `/quiz` - Free Sample Quiz
- `/exams` - Exam Packages List
- `/package/[slug]` - Package Detail
- `/package/[slug]/summary/[summarySlug]` - Content Summary
- `/package/[slug]/exam/[examSetId]` - Exam Runtime
- `/checkout/[id]` - Purchase Flow
- `/login`, `/register` - Authentication

### Protected Routes (Authenticated)
- `/settings` (or `/me`) - User Profile & Settings

### Admin Routes (`/admin/*`)
- `/admin` - Dashboard
- `/admin/packages` - Package Management
- `/admin/exam-sets` - Exam Set Management
- `/admin/questions` - Question Bank
- `/admin/summaries` - Summary Content
- `/admin/users` - User Management (Roles & Status)
- `/admin/orders` - Order History
- `/admin/import` - Bulk Import

---

## 2. Database Schema

### Core Tables
1. **`profiles`**
   - Core fields: `id` (references auth.users), `email`, `role`, `status`
   - Setting fields: `display_name`, `occupation`, `phone`, `avatar_url`
2. **`packages`**
   - High-level containers for exams and summaries. Includes pricing, difficulty, and metadata.
3. **`exam_sets`**
   - Groupings of questions within a package.
4. **`questions`**
   - The question bank. Contains content, choices, correct answer, hints, and explanations.
5. **`exam_set_questions`** (Join Table)
   - Many-to-many relationship linking `exam_sets` and `questions`.
6. **`summaries`**
   - Educational content linked to packages.
7. **`orders`** (Assumed)
   - Payment and transaction records.

### Relationships
- `profiles` 1:1 `auth.users`
- `packages` 1:N `exam_sets`
- `packages` 1:N `summaries`
- `exam_sets` N:M `questions` (via `exam_set_questions`)
- `profiles` 1:N `orders`
- `orders` N:1 `packages`

---

## 3. Role-Based Access Control (RBAC)

**System Roles:**
1. **`owner`**: Full root access. Bypasses all permissions. Cannot be deleted or downgraded if they are the last active owner.
2. **`admin`**: Full access to content, users, and financials. Excludes `system.manage`.
3. **`editor`**: Content management only (`content.read`, `content.write`).
4. **`support`**: Read-only access to users and orders (`users.read`, `orders.read`).
5. **`user`**: Standard customer. No access to `/admin`.

**Enforcement:**
- **Proxy Middleware:** Blocks `user` from `/admin`.
- **`requirePermission(permission)`**: Used inside Server Actions and Pages to strictly evaluate the user's role against required capabilities.

---

## 4. Flows

### Payment Flow
1. User clicks "Buy" on `/package/[slug]`.
2. Redirected to `/checkout/[id]`.
3. Calls `/api/payment/create` to initialize transaction (e.g., PromptPay QR).
4. Webhook at `/api/payment/webhook` receives success event.
5. Order status updates to PAID.
6. Package is unlocked for the user.

### User Flow
1. Guest visits `/`.
2. Guest registers/logs in via Auth Modal (Google/Email).
3. Auth state updates via Supabase listener in `Navbar`.
4. User accesses `/settings` to update `display_name`, `occupation`, etc.
5. User purchases package (Payment Flow).
6. User enters `/package/[slug]` -> Reads Summary -> Takes Exam.
7. Exam results computed and stored.

### Admin Flow
1. Staff logs in.
2. Proxy evaluates role and allows entry to `/admin`.
3. `admin/layout.tsx` checks specific role and filters sidebar navigation (e.g., Editor only sees Questions/Summaries).
4. Staff interacts with Server Actions (e.g., `updateQuestionAction`).
5. `requirePermission` verifies staff capability.
6. Action executes and logs event via `logAuditEvent`.
