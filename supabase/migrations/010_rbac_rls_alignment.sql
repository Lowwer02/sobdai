-- 010_rbac_rls_alignment.sql

-- 1. PROFILES
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- 2. ORGANIZATIONS
DROP POLICY IF EXISTS "Only admins can insert organizations." ON public.organizations;
DROP POLICY IF EXISTS "Only admins can update organizations." ON public.organizations;
DROP POLICY IF EXISTS "Only admins can delete organizations." ON public.organizations;

CREATE POLICY "Only owners can insert organizations." ON public.organizations FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);
CREATE POLICY "Only owners can update organizations." ON public.organizations FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);
CREATE POLICY "Only owners can delete organizations." ON public.organizations FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);

-- 3. POSITIONS
DROP POLICY IF EXISTS "Only admins can insert positions." ON public.positions;
DROP POLICY IF EXISTS "Only admins can update positions." ON public.positions;
DROP POLICY IF EXISTS "Only admins can delete positions." ON public.positions;

CREATE POLICY "Only owners can insert positions." ON public.positions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);
CREATE POLICY "Only owners can update positions." ON public.positions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);
CREATE POLICY "Only owners can delete positions." ON public.positions FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
);

-- 4. PACKAGES
DROP POLICY IF EXISTS "Only admins can insert packages." ON public.packages;
DROP POLICY IF EXISTS "Only admins can update packages." ON public.packages;
DROP POLICY IF EXISTS "Only admins can delete packages." ON public.packages;

CREATE POLICY "Content creators can insert packages." ON public.packages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content creators can update packages." ON public.packages FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content managers can delete packages." ON public.packages FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- 5. EXAM SETS
DROP POLICY IF EXISTS "Only admins can insert exam_sets." ON public.exam_sets;
DROP POLICY IF EXISTS "Only admins can update exam_sets." ON public.exam_sets;
DROP POLICY IF EXISTS "Only admins can delete exam_sets." ON public.exam_sets;

CREATE POLICY "Content creators can insert exam_sets." ON public.exam_sets FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content creators can update exam_sets." ON public.exam_sets FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content managers can delete exam_sets." ON public.exam_sets FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- 6. QUESTIONS
DROP POLICY IF EXISTS "Only admins can insert questions." ON public.questions;
DROP POLICY IF EXISTS "Only admins can update questions." ON public.questions;
DROP POLICY IF EXISTS "Only admins can delete questions." ON public.questions;
DROP POLICY IF EXISTS "Admins can view all questions." ON public.questions;

CREATE POLICY "Content creators can view all questions." ON public.questions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content creators can insert questions." ON public.questions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content creators can update questions." ON public.questions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);
CREATE POLICY "Content managers can delete questions." ON public.questions FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- 7. EXAM SET QUESTIONS
DROP POLICY IF EXISTS "Only admins can manage exam_set_questions." ON public.exam_set_questions;

CREATE POLICY "Content creators can manage exam_set_questions." ON public.exam_set_questions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);

-- 8. SUMMARIES
DROP POLICY IF EXISTS "Admins can manage summaries." ON public.summaries;

CREATE POLICY "Content managers can manage summaries." ON public.summaries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'editor'))
);

-- 9. ORDERS (Skipped: Table does not exist in your current DB)
-- DROP POLICY IF EXISTS "Admins can manage orders." ON public.orders;

-- CREATE POLICY "Financial managers can manage orders." ON public.orders FOR ALL USING (
--     EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
-- );
