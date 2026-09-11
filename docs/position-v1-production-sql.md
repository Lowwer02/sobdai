# Position V1 production SQL runbook

The application migration is [094_position_entities_v1.sql](../supabase/migrations/094_position_entities_v1.sql). It is structural only and does not seed the initial production entity or mapping. Production SQL is operator-owned; do not execute this runbook from the feature worktree.

## Before SQL: read-only preflight

Run these checks in the Supabase SQL Editor as a database operator. Do not continue if any expected result differs.

```sql
-- The Production 093 slot belongs to the payment-rejected notification migration.
select version, name
from supabase_migrations.schema_migrations
where version = '093'
   or name ilike '%payment_rejected_notification%';

-- Position V1 must be installed only once and must not already be partially present.
select version, name
from supabase_migrations.schema_migrations
where version = '094'
   or name ilike '%position_entities_v1%';

select
  to_regclass('public.positions') as positions_table,
  to_regclass('public.article_authors') as article_authors_table,
  to_regclass('public.profiles') as profiles_table,
  to_regnamespace('extensions') as extensions_schema,
  to_regprocedure('extensions.uuid_generate_v4()') as uuid_generator,
  to_regprocedure('public.handle_updated_at()') as updated_at_trigger_function;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'positions' and column_name in ('id', 'code', 'name', 'organization_id'))
    or (table_name = 'profiles' and column_name in ('id', 'role', 'status', 'deleted_at'))
  )
order by table_name, column_name;

select to_regclass('public.position_entities') as position_entities_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'positions'
  and column_name = 'position_entity_id';
```

Expected: the payment migration owns 093; 094 is not already recorded; `positions`, `article_authors`, `profiles`, `extensions.uuid_generate_v4()`, and `handle_updated_at()` exist; the four required `positions` columns and four hardened `profiles` columns exist; `position_entities` and `positions.position_entity_id` are absent before execution. The migration itself repeats the object-shape checks and fails closed if the baseline is unsafe.

## Execution

1. Run the complete `094_position_entities_v1.sql` once through the normal migration process. Do not run a fragment, a superseded Position V1 migration, or historical migrations 090–093.
2. Do not run the audited mapping block until migration 094 succeeds.
3. The migration installs `replace_position_entity_mappings(uuid, uuid[])`. The RPC is owner-gated, rejects GEN/placeholder rows and conflicting ownership, and clears/replaces mappings in one transaction.

If the migration transaction fails, stop. Verify that the transaction rolled back and that no partial Position V1 object remains before requesting a new review. Do not rerun partial manual fragments or attempt destructive repair.

## Migration verification

```sql
select to_regclass('public.position_entities') as position_entities_table;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'positions'
  and column_name = 'position_entity_id';

select conname, pg_get_constraintdef(oid)
from pg_catalog.pg_constraint
where conrelid = 'public.positions'::regclass
  and conname = 'positions_position_entity_id_fkey';

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('position_entities', 'positions')
  and (
    indexname ilike '%position_entities%slug%'
    or indexname = 'positions_position_entity_id_idx'
    or indexname = 'position_entities_status_updated_idx'
  )
order by indexname;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'position_entities';

select policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'position_entities'
order by policyname;

select p.oid::regprocedure as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'replace_position_entity_mappings';
```

Expected: `public.position_entities` exists; the position column is nullable; the FK references `public.position_entities(id)` with `ON DELETE SET NULL`; the slug unique index and mapping/status indexes exist; RLS is enabled; the published-only SELECT policy and authenticated content-manager policy exist; the mapping RPC is executable by `authenticated` but not `anon`.

## Audited initial mapping

This block is intentionally separate from migration 094 so editor-owned content is not silently seeded by schema deployment. It creates one `draft` entity and maps only the five verified organization-scoped rows. It does not fabricate editorial copy or publish the entity.

```sql
begin;

insert into public.position_entities (slug, name, status, sources)
values (
  'policy-and-plan-analyst',
  'นักวิเคราะห์นโยบายและแผน',
  'draft',
  '[]'::jsonb
)
on conflict (slug) do nothing;

do $map_position_entity$
declare
  v_entity_id uuid;
  v_mapped_count integer;
begin
  select id
    into v_entity_id
  from public.position_entities
  where slug = 'policy-and-plan-analyst'
    and name = 'นักวิเคราะห์นโยบายและแผน';

  if v_entity_id is null then
    raise exception 'The audited Position entity is missing or has an unexpected name.';
  end if;

  with expected(position_id, organization_id) as (
    values
      ('2fd66286-29cf-4327-9c17-94277869c398'::uuid, '1cee30d3-b6f9-4c5a-b24a-56e53728de6b'::uuid),
      ('8a7d2c65-01ce-437b-bf30-0377fa30e1b1'::uuid, 'ece61616-7337-4acb-a38a-09f9823ebd03'::uuid),
      ('c9db799e-26a5-4e5b-9d5d-1bac972944e0'::uuid, '3cd856ca-3be5-4be1-ba2f-55da0c4f2427'::uuid),
      ('01e8bd4d-405b-4a1e-8b11-a4a3e2acdeb6'::uuid, '938b56af-d344-4670-a8e9-eba2d8c5bc78'::uuid),
      ('59abe3de-ad16-442e-8d8b-03ded4c0d091'::uuid, 'bb0ee9cd-db00-4f12-b4af-3dc3b15da5f4'::uuid)
  )
  update public.positions p
     set position_entity_id = v_entity_id
    from expected
   where p.id = expected.position_id
     and p.organization_id = expected.organization_id
     and p.name = 'นักวิเคราะห์นโยบายและแผน'
     and (p.position_entity_id is null or p.position_entity_id = v_entity_id);

  get diagnostics v_mapped_count = row_count;
  if v_mapped_count <> 5 then
    raise exception 'Expected to map 5 audited positions, mapped %.', v_mapped_count;
  end if;
end
$map_position_entity$;

commit;
```

Expected: the block commits with five mapped rows. If any exact ID, organization, name, or existing mapping differs, it aborts instead of overwriting another entity.

## Post-mapping verification

```sql
select
  pe.slug,
  pe.name,
  pe.status,
  count(distinct p.id) as mapped_positions,
  count(distinct pkg.id) filter (where pkg.is_published = true) as published_packages,
  count(distinct n.id) filter (where n.status = 'published') as published_news,
  count(distinct a.id) filter (where a.status = 'published') as published_articles
from public.position_entities pe
left join public.positions p
  on p.position_entity_id = pe.id
left join public.packages pkg
  on pkg.position_id = p.id
 and pkg.organization_id = p.organization_id
left join public.news_packages np
  on np.package_id = pkg.id
left join public.news n
  on n.id = np.news_id
left join public.article_packages ap
  on ap.package_id = pkg.id
left join public.articles a
  on a.id = ap.article_id
where pe.slug = 'policy-and-plan-analyst'
group by pe.id, pe.slug, pe.name, pe.status;

select p.id, p.code, p.name, p.organization_id, p.position_entity_id
from public.positions p
where p.position_entity_id = (
  select id from public.position_entities where slug = 'policy-and-plan-analyst'
)
order by p.organization_id, p.id;

select count(*) as packages_with_null_position
from public.packages
where position_id is null;

select count(*) as package_position_organization_mismatches
from public.packages pkg
join public.positions pos on pos.id = pkg.position_id
where pkg.organization_id is distinct from pos.organization_id;
```

Expected from the audited snapshot: one `draft` entity, five mapped positions, four published packages, two distinct published News items, and six distinct published Articles reachable through existing package relations. The final two checks were zero during preflight. Because the entity remains `draft`, the public hub/detail/sitemap intentionally expose no indexable Position URL until editorial publication.
