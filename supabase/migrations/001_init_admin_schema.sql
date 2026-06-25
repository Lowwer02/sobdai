-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Extends auth.users)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text unique not null,
    role text not null default 'user' check (role in ('admin', 'user')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for profiles
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- 2. PACKAGES TABLE
create table if not exists public.packages (
    id uuid default uuid_generate_v4() primary key,
    slug text unique not null,
    package_code text not null,
    name text not null,
    org_name text not null,
    logo_url text,
    cover_image_url text,
    current_price numeric not null default 0,
    original_price numeric not null default 0,
    discount_percent numeric generated always as (
        case when original_price > 0 then ((original_price - current_price) / original_price * 100) else 0 end
    ) stored,
    total_questions int not null default 0,
    total_exam_sets int not null default 0,
    total_categories int not null default 0,
    difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard', 'Mixed')),
    features jsonb not null default '[]'::jsonb,
    description text,
    seo_title text,
    seo_description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for packages
alter table public.packages enable row level security;
create policy "Packages are viewable by everyone." on public.packages for select using (true);
create policy "Only admins can insert packages." on public.packages for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update packages." on public.packages for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete packages." on public.packages for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 3. EXAM SETS TABLE
create table if not exists public.exam_sets (
    id uuid default uuid_generate_v4() primary key,
    package_id uuid references public.packages(id) on delete cascade not null,
    name text not null,
    description text,
    duration_minutes int not null default 60,
    is_sample boolean not null default false,
    sort_order int not null default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for exam_sets
alter table public.exam_sets enable row level security;
create policy "Exam sets viewable by everyone." on public.exam_sets for select using (true);
create policy "Only admins can insert exam_sets." on public.exam_sets for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update exam_sets." on public.exam_sets for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete exam_sets." on public.exam_sets for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 4. QUESTIONS TABLE (Question Bank)
create table if not exists public.questions (
    id uuid default uuid_generate_v4() primary key,
    content text not null,
    choice_a text not null,
    choice_b text not null,
    choice_c text not null,
    choice_d text not null,
    correct_answer char(1) not null check (correct_answer in ('A', 'B', 'C', 'D')),
    hint text,
    full_explanation text,
    why_a_wrong text,
    why_b_wrong text,
    why_c_wrong text,
    why_d_wrong text,
    reference text,
    difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
    category text,
    tags text[] not null default '{}',
    status text not null default 'Draft' check (status in ('Draft', 'Review', 'Published')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for questions
alter table public.questions enable row level security;
create policy "Published questions viewable by authenticated users." on public.questions for select using (
    status = 'Published' and auth.role() = 'authenticated'
);
create policy "Admins can view all questions." on public.questions for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can insert questions." on public.questions for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update questions." on public.questions for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete questions." on public.questions for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- 5. EXAM_SET_QUESTIONS (Many-to-many join table)
create table if not exists public.exam_set_questions (
    exam_set_id uuid references public.exam_sets(id) on delete cascade not null,
    question_id uuid references public.questions(id) on delete cascade not null,
    sort_order int not null default 0,
    primary key (exam_set_id, question_id)
);

-- RLS for exam_set_questions
alter table public.exam_set_questions enable row level security;
create policy "Exam set questions viewable by authenticated users." on public.exam_set_questions for select using (
    auth.role() = 'authenticated'
);
create policy "Only admins can manage exam_set_questions." on public.exam_set_questions for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- TRIGGERS to update 'updated_at'
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_updated_at_profiles before update on public.profiles for each row execute procedure public.handle_updated_at();
create trigger handle_updated_at_packages before update on public.packages for each row execute procedure public.handle_updated_at();
create trigger handle_updated_at_exam_sets before update on public.exam_sets for each row execute procedure public.handle_updated_at();
create trigger handle_updated_at_questions before update on public.questions for each row execute procedure public.handle_updated_at();
