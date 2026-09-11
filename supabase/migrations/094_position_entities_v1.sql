-- SOBDAI — SEO Entity / Position V1.
--
-- Migration 094 is intentionally separate from Production migration 093,
-- which is owned by the payment-rejected notification feature.
--
-- Canonical public role pages are modeled separately from the existing
-- organization-scoped `positions` rows:
--
--   position_entities -> positions -> packages -> News / Articles
--
-- This migration is structural only. It intentionally does not seed or map
-- production rows; the audited initial mapping is supplied as separate SQL
-- for an operator to run after this migration has been applied.

set local lock_timeout = '5s';

-- Fail closed if the Position V1 baseline is missing or if an earlier partial
-- attempt already created any Position V1 object. The operator must inspect
-- that drift instead of allowing this migration to guess how to repair it.
do $position_v1_preflight$
begin
    if to_regclass('public.positions') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires the canonical public.positions table.';
    end if;

    if to_regclass('public.article_authors') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires public.article_authors from migration 080.';
    end if;

    if to_regclass('public.profiles') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires the canonical public.profiles table.';
    end if;

    if to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires public.handle_updated_at().';
    end if;

    if to_regnamespace('extensions') is null
       or to_regprocedure('extensions.uuid_generate_v4()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires extensions.uuid_generate_v4().';
    end if;

    if (
        select count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'positions'
          and column_name in ('id', 'code', 'name', 'organization_id')
    ) <> 4 then
        raise exception using
            errcode = 'check_violation',
            message = 'Position V1 094 requires positions.id, code, name, and organization_id.';
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
            message = 'Position V1 094 requires the hardened profiles authorization columns.';
    end if;

    if to_regclass('public.position_entities') is not null then
        raise exception using
            errcode = 'duplicate_table',
            message = 'Position V1 094 refuses an already-present public.position_entities table.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'positions'
          and column_name = 'position_entity_id'
    ) then
        raise exception using
            errcode = 'duplicate_column',
            message = 'Position V1 094 refuses an already-present positions.position_entity_id column.';
    end if;

    if to_regprocedure('public.replace_position_entity_mappings(uuid,uuid[])') is not null then
        raise exception using
            errcode = 'duplicate_function',
            message = 'Position V1 094 refuses an already-present mapping RPC.';
    end if;
end
$position_v1_preflight$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Canonical Position Entity table
-- ──────────────────────────────────────────────────────────────────────────
create table public.position_entities (
    id uuid default extensions.uuid_generate_v4() primary key,
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
  add column position_entity_id uuid;

alter table public.positions
  add constraint positions_position_entity_id_fkey
  foreign key (position_entity_id)
  references public.position_entities(id)
  on delete set null;

create index positions_position_entity_id_idx
  on public.positions (position_entity_id)
  where position_entity_id is not null;

create index position_entities_status_updated_idx
  on public.position_entities (status, updated_at desc, id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS — public published reads; content-manager writes
-- ──────────────────────────────────────────────────────────────────────────
alter table public.position_entities enable row level security;

create policy "Public can read published position entities."
  on public.position_entities for select
  using (status = 'published');

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

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Transactional, owner-gated mapping replacement
-- ──────────────────────────────────────────────────────────────────────────
--
-- Direct `positions` mutations remain owner-only under the existing hardened
-- RLS boundary. This SECURITY DEFINER RPC does not broaden that boundary: it
-- re-checks the active Owner profile before it can mutate any mapping. All
-- validation runs before the clear/set statements, and a PL/pgSQL exception
-- rolls the whole function transaction back.
create or replace function public.replace_position_entity_mappings(
    p_entity_id uuid,
    p_position_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $replace_position_entity_mappings$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_entity_id uuid;
    v_position_ids uuid[];
    v_found_count integer;
    v_mapped_count integer := 0;
    v_conflicting_position_id uuid;
begin
    v_actor_id := auth.uid();
    if v_actor_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required to replace Position mappings.';
    end if;

    select p.role
      into v_actor_role
    from public.profiles p
    where p.id = v_actor_id
      and p.status = 'active'
      and p.deleted_at is null
    for update;

    if not found or v_actor_role <> 'owner' then
        raise exception using
            errcode = '42501',
            message = 'Only an active Owner may replace Position mappings.';
    end if;

    if p_entity_id is null then
        raise exception using
            errcode = '22023',
            message = 'A target Position Entity is required.';
    end if;

    select pe.id
      into v_entity_id
    from public.position_entities pe
    where pe.id = p_entity_id
    for update;

    if not found then
        raise exception using
            errcode = '23503',
            message = 'The target Position Entity does not exist.';
    end if;

    v_position_ids := coalesce(p_position_ids, '{}'::uuid[]);

    if exists (
        select 1
        from unnest(v_position_ids) as requested(position_id)
        where requested.position_id is null
    ) then
        raise exception using
            errcode = '22023',
            message = 'Position mapping IDs cannot contain NULL.';
    end if;

    if (
        select count(*)
        from (
            select distinct requested.position_id
            from unnest(v_position_ids) as requested(position_id)
        ) distinct_ids
    ) <> cardinality(v_position_ids) then
        raise exception using
            errcode = '23505',
            message = 'Position mapping IDs cannot contain duplicates.';
    end if;

    if cardinality(v_position_ids) > 2000 then
        raise exception using
            errcode = '22023',
            message = 'A Position Entity may map at most 2,000 operational positions.';
    end if;

    -- Lock both the current mapping set and every requested row in a stable
    -- order. This makes concurrent replacements observe a single owner for a
    -- Position and prevents a check-then-write race.
    perform p.id
    from public.positions p
    where p.position_entity_id = v_entity_id
       or p.id = any(v_position_ids)
    order by p.id
    for update;

    select count(*)
      into v_found_count
    from public.positions p
    where p.id = any(v_position_ids);

    if v_found_count <> cardinality(v_position_ids) then
        raise exception using
            errcode = '23503',
            message = 'Every requested Position must exist.';
    end if;

    if exists (
        select 1
        from public.positions p
        where p.id = any(v_position_ids)
          and (
              lower(btrim(coalesce(p.code, ''))) in ('gen', 'general', 'general position', 'ไม่ระบุ', 'ไม่ระบุตำแหน่ง')
              or lower(btrim(coalesce(p.name, ''))) in ('gen', 'general', 'general position', 'ไม่ระบุ', 'ไม่ระบุตำแหน่ง')
              or lower(btrim(coalesce(p.code, ''))) ~ '^gen([[:space:]_-]|$)'
              or lower(btrim(coalesce(p.name, ''))) ~ '^gen([[:space:]_-]|$)'
              or lower(btrim(coalesce(p.code, ''))) like '%general position%'
              or lower(btrim(coalesce(p.name, ''))) like '%general position%'
          )
    ) then
        raise exception using
            errcode = '22023',
            message = 'GEN and placeholder Positions cannot be mapped to a canonical Position Entity.';
    end if;

    select p.id
      into v_conflicting_position_id
    from public.positions p
    where p.id = any(v_position_ids)
      and p.position_entity_id is not null
      and p.position_entity_id <> v_entity_id
    order by p.id
    limit 1;

    if v_conflicting_position_id is not null then
        raise exception using
            errcode = '23505',
            message = 'A requested Position is already owned by another Position Entity.';
    end if;

    update public.positions
       set position_entity_id = null
     where position_entity_id = v_entity_id;

    if cardinality(v_position_ids) > 0 then
        update public.positions
           set position_entity_id = v_entity_id
         where id = any(v_position_ids);
        get diagnostics v_mapped_count = row_count;
    end if;

    if v_mapped_count <> cardinality(v_position_ids) then
        raise exception using
            errcode = 'P0001',
            message = 'Position mapping replacement did not affect the requested rows.';
    end if;

    return jsonb_build_object(
        'entity_id', v_entity_id,
        'mapped_count', v_mapped_count,
        'mapped_position_ids', to_jsonb(v_position_ids)
    );
end
$replace_position_entity_mappings$;

comment on function public.replace_position_entity_mappings(uuid, uuid[]) is
    'Owner-gated atomic replacement of one Position Entity mapping set; validates placeholders and conflicting ownership before mutation.';

revoke all on function public.replace_position_entity_mappings(uuid, uuid[])
    from public, anon, authenticated, service_role;
grant execute on function public.replace_position_entity_mappings(uuid, uuid[])
    to authenticated;

-- PostgREST schema reload
notify pgrst, 'reload schema';
