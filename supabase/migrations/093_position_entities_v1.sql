-- SOBDAI — SEO Entity / Position V1.
--
-- Canonical public role pages are modeled separately from the existing
-- organization-scoped `positions` rows:
--
--   position_entities -> positions -> packages -> News / Articles
--
-- This migration is structural only. It intentionally does not seed or map
-- production rows; the audited initial mapping is supplied as separate SQL
-- for an operator to run after this migration has been applied.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Canonical Position Entity table
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.position_entities (
    id uuid default uuid_generate_v4() primary key,
    slug text unique not null,
    name text not null,
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

    constraint position_entities_slug_not_empty check (btrim(slug) <> ''),
    constraint position_entities_name_not_empty check (btrim(name) <> ''),
    constraint position_entities_published_at_check check (
        status <> 'published' or published_at is not null
    )
);

comment on table public.position_entities is
    'Sobdai canonical SEO entities for organization-scoped public positions.';
comment on column public.position_entities.slug is
    'Editor-owned stable ASCII lowercase kebab-case canonical route segment.';
comment on column public.position_entities.overview_markdown is
    'Editorial evergreen overview. A meaningful unique overview is required by the public index-readiness gate.';
comment on column public.position_entities.sources is
    'Editorial source list as JSONB. Public rendering accepts HTTPS URLs only.';
comment on column public.position_entities.author_id is
    'Optional public editorial author. References article_authors, never auth profiles.';

drop trigger if exists handle_updated_at_position_entities on public.position_entities;
create trigger handle_updated_at_position_entities
  before update on public.position_entities
  for each row execute procedure public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Map organization-scoped Positions to canonical entities
-- ──────────────────────────────────────────────────────────────────────────
alter table public.positions
  add column if not exists position_entity_id uuid;

do $position_entity_fk$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.conname = 'positions_position_entity_id_fkey'
          and c.conrelid = 'public.positions'::regclass
    ) then
        alter table public.positions
          add constraint positions_position_entity_id_fkey
          foreign key (position_entity_id)
          references public.position_entities(id)
          on delete set null;
    end if;
end
$position_entity_fk$;

create index if not exists positions_position_entity_id_idx
  on public.positions (position_entity_id)
  where position_entity_id is not null;

create index if not exists position_entities_status_updated_idx
  on public.position_entities (status, updated_at desc, id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS — public published reads; content-manager writes
-- ──────────────────────────────────────────────────────────────────────────
alter table public.position_entities enable row level security;

drop policy if exists "Public can read published position entities." on public.position_entities;
create policy "Public can read published position entities."
  on public.position_entities for select
  using (status = 'published');

drop policy if exists "Content managers can manage position entities." on public.position_entities;
create policy "Content managers can manage position entities."
  on public.position_entities
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

-- PostgREST schema reload
notify pgrst, 'reload schema';
