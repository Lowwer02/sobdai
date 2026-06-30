-- 014_orders_rbac_alignment.sql

-- 1. Drop existing global management policies
DROP POLICY IF EXISTS "Admins can manage orders." ON public.orders;
DROP POLICY IF EXISTS "Financial managers can manage orders." ON public.orders;
DROP POLICY IF EXISTS "Admins and owners can manage orders." ON public.orders;

-- Note: We intentionally preserve "Users can view own orders." 
-- to ensure standard users can view their own purchases.

-- 2. READ (SELECT)
-- Canonical RBAC: Owner, Admin, Support can READ orders.
CREATE POLICY "Support staff can view all orders." ON public.orders FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'support'))
);

-- 3. WRITE (INSERT, UPDATE, DELETE)
-- Canonical RBAC: Only Owner, Admin can MANAGE orders (financial.manage).
CREATE POLICY "Financial managers can insert orders." ON public.orders FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE POLICY "Financial managers can update orders." ON public.orders FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE POLICY "Financial managers can delete orders." ON public.orders FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);
