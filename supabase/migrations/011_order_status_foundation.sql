
-- 1. Ensure Orders Table Exists (In case previous migrations were skipped)
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    package_id uuid references public.packages(id) on delete cascade not null,
    amount numeric not null default 0,
    status text not null default 'pending',
    payment_provider text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for orders (if not exists)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own orders." ON public.orders;
CREATE POLICY "Users can view own orders." ON public.orders FOR SELECT USING (auth.uid() = user_id);

-- 2. Drop existing CHECK constraint (Assuming default constraint name or we must find it)
DO $$
DECLARE
    con_name text;
BEGIN
    SELECT conname INTO con_name
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF con_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || con_name;
    END IF;
END $$;

-- 3. Migrate existing data
UPDATE public.orders SET status = 'paid' WHERE status = 'completed' AND amount > 0;
UPDATE public.orders SET status = 'free' WHERE status = 'completed' AND amount = 0;
UPDATE public.orders SET status = 'cancelled' WHERE status = 'revoked';

-- 4. Add new CHECK constraint explicitly named
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('free', 'pending', 'paid', 'failed', 'refunded', 'cancelled'));
