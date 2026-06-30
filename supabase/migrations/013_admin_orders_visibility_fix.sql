-- 013_admin_orders_visibility_fix.sql

-- Drop the incomplete policy from 004
DROP POLICY IF EXISTS "Admins can manage orders." ON public.orders;

-- Drop the potentially commented out policy from 010 just in case
DROP POLICY IF EXISTS "Financial managers can manage orders." ON public.orders;

-- Create the corrected policy that includes owners and admins
CREATE POLICY "Admins and owners can manage orders." ON public.orders FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner'))
);
