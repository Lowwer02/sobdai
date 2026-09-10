# Position V1 production SQL runbook

The application migration is [093_position_entities_v1.sql](../supabase/migrations/093_position_entities_v1.sql). It is structural only and does not execute the initial production mapping.

Run the following in the Supabase SQL Editor as a database operator, in order:

1. Apply migration `093_position_entities_v1.sql` through the normal migration process. Do not run the mapping block before the migration succeeds.
2. Run the preflight verification below. It must show the new table and nullable `positions.position_entity_id`.
3. Run the audited initial mapping block below. It creates one `draft` entity and maps only the five verified organization-scoped rows. It does not fabricate editorial copy or publish the entity.
4. Run the post-mapping verification below.
5. An authorized editor completes `overview_markdown`, `seo_title`/`seo_description` as needed, and HTTPS `sources` in `/admin/position-entities`. Publish only after the editorial and index-readiness requirements are met.

## Preflight verification

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
```

Expected: `position_entities_table` is `public.position_entities`; the position column is nullable; and the FK references `public.position_entities(id)` with `ON DELETE SET NULL`.

## Audited initial mapping

This block is intentionally separate from the migration so the editor-owned entity content is not silently seeded by schema deployment. The exact IDs were verified during the bounded preflight inventory against the role name and organization IDs shown in the `values` list.

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

select p.id, p.name, p.organization_id, p.position_entity_id
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

Expected from the audited live snapshot: one `draft` entity, five mapped positions, four published packages, two distinct published News items, and six distinct published Articles reachable through the existing package relations. The final two checks were zero during preflight. Because the entity remains `draft`, the public hub/detail/sitemap intentionally expose no indexable Position URL until editorial publication.
