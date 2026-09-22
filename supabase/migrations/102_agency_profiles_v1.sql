-- SOBDAI — Agency Entity V1.
--
-- Locked architecture:
--   organizations   = canonical Agency identity (operational + identity)
--   agency_profiles = 1:1 editorial / SEO / publish profile
--   news.organization_id = authoritative News -> Agency relation
--
-- agency_profiles deliberately does NOT duplicate organization name,
-- short_name, or logo: the public loader joins organizations for display
-- identity. The UNIQUE organization_id makes the profile strictly 1:1.
--
-- Agency → Positions / Position Entities / Packages / News / Articles are
-- derived through the existing operational spine; no junction tables and no
-- mapping RPC are introduced by this migration.
--
-- This migration is structural only. It intentionally does not seed or
-- backfill any agency profile or news organization attribution; the audited
-- editorial steps are supplied separately in docs/agency-v1-production-sql.md
-- for an operator to run after this migration has been applied.
--
-- Unlike the 094 -> 095 -> 096 sequence, the normalized table ACL is included
-- here from the start (revoke, then grant the exact intended privileges).

set local lock_timeout = '5s';

-- Fail closed if the V1 baseline is missing or an earlier partial attempt
-- already created any Agency V1 object. The operator must inspect that drift
-- instead of allowing this migration to guess how to repair it.
do $agency_v1_preflight$
begin
    if to_regclass('public.organizations') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires the canonical public.organizations table.';
    end if;

    if to_regclass('public.news') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires public.news from migration 031.';
    end if;

    if to_regclass('public.article_authors') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires public.article_authors from migration 080.';
    end if;

    if to_regclass('public.profiles') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires the canonical public.profiles table.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires public.handle_updated_at().';
    end if;

    if to_regnamespace('extensions') is null
       or to_regprocedure('extensions.uuid_generate_v4()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires extensions.uuid_generate_v4().';
    end if;

    if (
        select count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organizations'
          and column_name in ('id', 'code', 'name')
    ) <> 3 then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires organizations.id, code, and name.';
    end if;

    if (
        select count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name in ('id', 'role', 'status', 'deleted_at')
    ) <> 4 then
        raise exception using
            errcode = 'check_violation',
            message = 'Agency V1 102 requires the hardened profiles authorization columns.';
    end if;

    if to_regclass('public.agency_profiles') is not null then
        raise exception using
            errcode = 'duplicate_table',
            message = 'Agency V1 102 refuses an already-present public.agency_profiles table.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'news'
          and column_name = 'organization_id'
    ) then
        raise exception using
            errcode = 'duplicate_column',
            message = 'Agency V1 102 refuses an already-present news.organization_id column.';
    end if;
end
$agency_v1_preflight$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Agency Profile table (1:1 editorial / SEO / publish profile)
-- ──────────────────────────────────────────────────────────────────────────
create table public.agency_profiles (
    id uuid default extensions.uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    slug text unique not null,
    overview_markdown text,
    seo_title text,
    seo_description text,
    status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),
    published_at timestamptz,
    sources jsonb not null default '[]'::jsonb,
    author_id uuid references public.article_authors(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint agency_profiles_organization_id_key unique (organization_id),
    constraint agency_profiles_slug_not_empty check (btrim(slug) <> ''),
    constraint agency_profiles_published_at_check check (
        status <> 'published' or published_at is not null
    )
);

comment on table public.agency_profiles is
    'Sobdai 1:1 editorial / SEO / publish profiles for canonical organizations (Agency Entity V1).';
comment on column public.agency_profiles.organization_id is
    'The canonical organization this profile edits. UNIQUE: one profile per organization. ON DELETE CASCADE: an editorial profile is meaningless without its agency.';
comment on column public.agency_profiles.slug is
    'Editor-owned stable ASCII lowercase kebab-case canonical route segment under /agencies/.';
comment on column public.agency_profiles.overview_markdown is
    'Editorial evergreen overview. A meaningful unique overview is required by the public index-readiness gate.';
comment on column public.agency_profiles.sources is
    'Editorial source list as JSONB. Public rendering accepts HTTPS URLs only.';
comment on column public.agency_profiles.author_id is
    'Optional public editorial author. References article_authors, never auth profiles.';

drop trigger if exists handle_updated_at_agency_profiles on public.agency_profiles;
create trigger handle_updated_at_agency_profiles
  before update on public.agency_profiles
  for each row execute procedure public.handle_updated_at();

create index agency_profiles_status_updated_idx
  on public.agency_profiles (status, updated_at desc, id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Authoritative News -> Agency relation
-- ──────────────────────────────────────────────────────────────────────────
alter table public.news
  add column organization_id uuid;

alter table public.news
  add constraint news_organization_id_fkey
  foreign key (organization_id)
  references public.organizations(id)
  on delete set null;

comment on column public.news.organization_id is
    'Authoritative editorial News -> Agency attribution. NULL keeps the legacy package-derived fallback. App-level strict consistency: when set, every related package must belong to this organization.';

create index news_organization_id_idx
  on public.news (organization_id)
  where organization_id is not null;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS — public published reads; content-manager writes
-- ──────────────────────────────────────────────────────────────────────────
alter table public.agency_profiles enable row level security;

create policy "Public can read published agency profiles."
  on public.agency_profiles for select
  using (status = 'published');

create policy "Content managers can manage agency profiles."
  on public.agency_profiles
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin', 'editor')
        and p.status = 'active'
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin', 'editor')
        and p.status = 'active'
        and p.deleted_at is null
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Normalized explicit table ACL (096 lesson applied from the start)
-- ──────────────────────────────────────────────────────────────────────────
revoke all privileges on table public.agency_profiles
    from anon, authenticated, service_role;

grant select on table public.agency_profiles
    to anon;

grant select, insert, update, delete on table public.agency_profiles
    to authenticated;

grant select, insert, update, delete on table public.agency_profiles
    to service_role;

-- PostgREST schema reload so the new table + news column are visible to REST.
notify pgrst, 'reload schema';
