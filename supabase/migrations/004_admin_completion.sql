-- 004_admin_completion.sql

-- 1. Update Profiles Table
alter table public.profiles add column if not exists status text not null default 'active' check (status in ('active', 'banned'));

-- 2. Create Orders Table
create table if not exists public.orders (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    package_id uuid references public.packages(id) on delete cascade not null,
    amount numeric not null default 0,
    status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded', 'revoked')),
    payment_provider text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for orders
alter table public.orders enable row level security;
create policy "Users can view own orders." on public.orders for select using (auth.uid() = user_id);
create policy "Admins can manage orders." on public.orders for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger handle_updated_at_orders before update on public.orders for each row execute procedure public.handle_updated_at();
