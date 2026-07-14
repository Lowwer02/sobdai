-- 020_homepage_settings.sql
-- Homepage Configuration System — Phase 1.
--
-- Two changes:
--   1. `packages.featured_homepage` boolean — admin-curated homepage featured
--      packages (no relation table, per the approved design decision).
--   2. `homepage_settings` singleton table — the Single Source of Truth for
--      homepage content/visibility, stored as grouped JSONB (general / hero /
--      cta / sections / seo). JSONB (not many columns) so future grouping /
--      nested objects don't require migrations.
--
-- SAFE: only adds one column + one new table. Does not modify existing
-- columns, RLS, triggers, or indexes on packages.

-- ─── packages.featured_homepage ─────────────────────────────────────────────
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS featured_homepage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.packages.featured_homepage IS 'When true, this package is eligible to appear in the homepage Featured row. Admin-curated. Ordering reuses the existing display_order chain.';

-- ─── homepage_settings (singleton) ─────────────────────────────────────────
create table if not exists public.homepage_settings (
    -- Singleton enforcement: exactly one row. The app always reads id = 1.
    id smallint primary key default 1,
    general jsonb not null default '{}'::jsonb,
    hero     jsonb not null default '{}'::jsonb,
    cta      jsonb not null default '{}'::jsonb,
    sections jsonb not null default '{}'::jsonb,
    seo      jsonb not null default '{}'::jsonb,
    -- Phase 1: admin-editable copy for the "Why Sobdai" and "How to" sections.
    -- Typed arrays (validated in app land) — NOT free-form JSON.
    features jsonb not null default '[]'::jsonb,
    howto    jsonb not null default '[]'::jsonb,
    -- Reserved for Phase 3 (analytics flags, experiment ids, audience keys).
    -- Nullable so it is simply ignored until then.
    extended_config jsonb default null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint homepage_settings_singleton check (id = 1)
);

-- Seed the single row with empty groups; the app hydrates from code defaults
-- for any missing key, so an empty row is always safe.
insert into public.homepage_settings (id) values (1)
  on conflict (id) do nothing;

-- updated_at bump on save.
create trigger handle_updated_at_homepage_settings
  before update on public.homepage_settings
  for each row execute procedure public.handle_updated_at();

-- RLS: the public homepage must be able to read the singleton (anon/auth),
-- but only admins may write it.
alter table public.homepage_settings enable row level security;

create policy "Homepage settings are publicly readable."
  on public.homepage_settings for select
  using (true);

create policy "Only admins can manage homepage settings."
  on public.homepage_settings for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Notify PostgREST to pick up the new table + the new packages column.
NOTIFY pgrst, 'reload schema';
