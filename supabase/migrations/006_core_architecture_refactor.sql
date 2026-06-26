-- 1. Create Organizations Table
create table if not exists public.organizations (
    id uuid default uuid_generate_v4() primary key,
    code text unique not null,
    name text not null,
    short_name text,
    logo_url text,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Organizations
alter table public.organizations enable row level security;
create policy "Organizations viewable by everyone." on public.organizations for select using (true);
create policy "Only admins can insert organizations." on public.organizations for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update organizations." on public.organizations for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete organizations." on public.organizations for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger handle_updated_at_organizations before update on public.organizations for each row execute procedure public.handle_updated_at();

-- 2. Create Positions Table
create table if not exists public.positions (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid references public.organizations(id) on delete cascade not null,
    code text not null,
    name text not null,
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(organization_id, code)
);

-- RLS for Positions
alter table public.positions enable row level security;
create policy "Positions viewable by everyone." on public.positions for select using (true);
create policy "Only admins can insert positions." on public.positions for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can update positions." on public.positions for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Only admins can delete positions." on public.positions for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create trigger handle_updated_at_positions before update on public.positions for each row execute procedure public.handle_updated_at();

-- 3. Update Packages Table
alter table public.packages
add column organization_id uuid references public.organizations(id),
add column position_id uuid references public.positions(id),
add column exam_year text,
add column version text default '1.0';

-- 4. Data Migration (Zero Data Loss)
-- 4.1 Insert unique organizations from existing packages
insert into public.organizations (code, name)
select distinct org_name, org_name from public.packages where org_name is not null and org_name != ''
on conflict (code) do nothing;

-- 4.2 Map organization_id to packages
update public.packages p
set organization_id = o.id
from public.organizations o
where p.org_name = o.name;

-- 4.3 Create a "General Position" for each created organization
insert into public.positions (organization_id, code, name)
select id, 'GEN', 'General Position' from public.organizations
on conflict do nothing;

-- 4.4 Map position_id to packages
update public.packages p
set position_id = pos.id
from public.positions pos
where p.organization_id = pos.organization_id and pos.code = 'GEN';

-- 4.5 Set default exam_year
update public.packages set exam_year = to_char(now(), 'YYYY') where exam_year is null;

-- 5. Drop old column after mapping
alter table public.packages drop column org_name;
