-- 005_summary_bank.sql

create table if not exists public.summaries (
    id uuid default uuid_generate_v4() primary key,
    package_id uuid references public.packages(id) on delete cascade not null,
    title text not null,
    slug text not null,
    subject text,
    law text,
    topic text,
    content_md text not null,
    read_time_minutes int not null default 5,
    sort_order int not null default 0,
    is_published boolean not null default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(package_id, slug)
);

-- RLS
alter table public.summaries enable row level security;
create policy "Published summaries viewable by everyone." on public.summaries for select using (is_published = true);
create policy "Admins can manage summaries." on public.summaries for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger handle_updated_at_summaries before update on public.summaries for each row execute procedure public.handle_updated_at();
