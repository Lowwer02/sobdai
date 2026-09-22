# Agency V1 production SQL runbook

Agency Entity V1 is applied through migration `102_agency_profiles_v1.sql` — a single forward migration that ships the schema, RLS, and the normalized ACL together (the 094→095→096 repair sequence is deliberately not repeated). Production SQL is operator-owned; do not execute this runbook from a feature worktree. Do not touch Production before the Supabase TEST runtime matrix (below) has passed.

## 1. Before SQL: read-only preflight

Run these checks in the Supabase SQL Editor as a database operator. Do not continue if any expected result differs.

```sql
-- The latest Production migration slot must be 101; Agency V1 owns 102.
select version, name
from supabase_migrations.schema_migrations
where version in ('100', '101')
   or name ilike '%agency_profiles%'
   or name ilike '%assessment_sessions_question_order%';

-- Baseline objects Agency V1 depends on.
select
  to_regclass('public.organizations') as organizations_table,
  to_regclass('public.news') as news_table,
  to_regclass('public.article_authors') as article_authors_table,
  to_regclass('public.profiles') as profiles_table,
  to_regnamespace('extensions') as extensions_schema,
  to_regprocedure('extensions.uuid_generate_v4()') as uuid_generator,
  to_regprocedure('public.handle_updated_at()') as updated_at_trigger_function;

-- Agency V1 objects must NOT exist yet.
select to_regclass('public.agency_profiles') as must_be_null;
select count(*) as must_be_zero
from information_schema.columns
where table_schema = 'public'
  and table_name = 'news'
  and column_name = 'organization_id';
```

Expected: `101_assessment_sessions_question_order_version` is recorded; no `agency_profiles` migration name appears; all baseline objects resolve; both "must be null/zero" checks return null/0. If migration 102 or any Agency V1 object already exists, stop and inspect drift — do not rerun or repair ad hoc.

## 2. Apply the migration

1. Apply `102_agency_profiles_v1.sql` once through the normal migration process. Do not run extracted fragments.
2. The migration is fail-closed: it aborts if any Agency V1 object already exists or any prerequisite is missing.

## 3. Post-apply verification

```sql
-- Schema + constraints.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'agency_profiles'
order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_catalog.pg_constraint
where conrelid = 'public.agency_profiles'::regclass
order by conname;

select indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('agency_profiles', 'news')
  and (indexname ilike '%agency_profiles%'
       or indexname = 'news_organization_id_idx')
order by indexname;

-- news.organization_id FK + nullability.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'news'
  and column_name = 'organization_id';

select conname, pg_get_constraintdef(oid)
from pg_catalog.pg_constraint
where conrelid = 'public.news'::regclass
  and conname = 'news_organization_id_fkey';

-- RLS + policies.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'agency_profiles';

select policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'agency_profiles'
order by policyname;

-- Exact ACL matrix (mirror of migration 096's verification).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'agency_profiles'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select
  has_table_privilege('anon', 'public.agency_profiles', 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.agency_profiles', 'INSERT') as anon_insert,
  has_table_privilege('authenticated', 'public.agency_profiles', 'SELECT') as auth_select,
  has_table_privilege('authenticated', 'public.agency_profiles', 'INSERT') as auth_insert,
  has_table_privilege('authenticated', 'public.agency_profiles', 'UPDATE') as auth_update,
  has_table_privilege('authenticated', 'public.agency_profiles', 'DELETE') as auth_delete,
  has_table_privilege('service_role', 'public.agency_profiles', 'SELECT') as service_select,
  has_table_privilege('service_role', 'public.agency_profiles', 'TRUNCATE') as service_truncate;
```

Expected: two policies (`Public can read published agency profiles.`, `Content managers can manage agency profiles.`); `rls_enabled = true`; grants are exactly anon SELECT, authenticated + service_role SELECT/INSERT/UPDATE/DELETE; anon_insert/auth booleans per grant; `service_truncate = false`; the news FK reads `REFERENCES organizations(id) ON DELETE SET NULL`.

## 4. Supabase TEST runtime matrix (must pass BEFORE Production)

Execute on a TEST project — never on Production:

1. **Schema**: preflight (§1) then apply 102; §3 checks pass.
2. **UNIQUE organization_id**: insert a second profile for the same organization → rejected with unique violation (`agency_profiles_organization_id_key`).
3. **FK behavior**: delete an organization that owns a profile (as owner) → the profile is CASCADE-deleted; `news.organization_id` rows referencing it become NULL (SET NULL).
4. **status/published_at constraint**: `update agency_profiles set status='published'` with `published_at is null` → rejected (`agency_profiles_published_at_check`).
5. **slug constraints**: blank slug rejected; duplicate slug rejected (unique).
6. **anon draft invisibility**: with anon key, `select * from agency_profiles` returns only `status='published'` rows (a draft row inserted via authenticated editor is invisible).
7. **anon published readability**: a published profile row IS readable via anon.
8. **authenticated CRUD**: an active owner/admin/editor profile can insert/update/delete; the app gates are content.write (save) / content.publish (publish/archive/restore).
9. **banned/deleted profile denial**: a banned (`status <> 'active'`) or soft-deleted (`deleted_at` set) profile actor is rejected by the RLS with_check.
10. **service_role intended privileges**: service_role bypasses RLS with exactly the granted CRUD ACL (no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN).
11. **news.organization_id FK**: inserting a news row with a non-existent organization uuid → FK violation; valid uuid persists.
12. **REST schema reload**: after `notify pgrst`, `GET /rest/v1/agency_profiles?select=id` with the anon key responds 200 (empty array when no published rows), and the OpenAPI definitions expose the new news column to authenticated staff.
13. **Strict News consistency (app-level, via admin UI on TEST)**: set an organization on a news row whose related packages all belong to another organization → save is blocked with the Thai error; clearing the organization saves; adding a foreign package to an attributed news row via the relation picker is blocked before any junction delete.

## 5. Deterministic News organization backfill (operator-reviewed)

`news.organization_id` deploys NULL for every existing row. Backfill ONLY rows with deterministic editorial evidence — the single deterministic signal available today is the package junction set. Do NOT fuzzy-match titles or tags. News rows with zero or mixed-org junctions stay NULL (the public agency pages keep using the package-derived fallback for NULL rows).

```sql
-- 5.1 READ: candidate news whose related packages ALL belong to exactly one
-- organization. Review every row before updating.
select
  n.id,
  n.slug,
  n.title,
  o.id as organization_id,
  o.code as organization_code,
  count(distinct np.package_id) as related_packages
from public.news n
join public.news_packages np on np.news_id = n.id
join public.packages p on p.id = np.package_id
join public.organizations o on o.id = p.organization_id
where n.organization_id is null
group by n.id, n.slug, n.title, o.id, o.code
having count(distinct p.organization_id) = 1
order by n.published_at desc nulls last;

-- 5.2 UPDATE: run one statement per ACCEPTED row, substituting the reviewed ids.
update public.news
set organization_id = '<organization_id from the reviewed row>'
where id = '<news id from the reviewed row>';
```

Expected from the Production snapshot at audit time: only two junction-linked news rows exist (`ombudsman-recruitment-2026` → OMB, `opsmoac-recruitment-2026` → OPSMOAC). Every other published news row has zero junctions and therefore stays NULL. The strict consistency rule is satisfied by construction: a backfilled row's junctions all belong to that single organization.

## 6. First Agency Profile: สำนักงานการตรวจเงินแผ่นดิน (OAG / สตง.)

Editorial workflow (preferred path — via `/admin/agency-profiles`, no direct SQL):

1. Sign in as a role holding `content.write` (owner/admin/editor). Navigate to **Admin → Agency Profiles → Create Agency Profile**.
2. Select **สำนักงานการตรวจเงินแผ่นดิน** (code `OAG`, short name `สตง.` — exactly one organization row exists).
3. Choose the canonical slug (editorial decision; `state-audit-office` follows the `policy-and-plan-analyst` English-kebab convention; the form enforces the ASCII kebab pattern and immutability after publish).
4. Author a meaningful Thai overview (≥ 80 readable characters — required for index-readiness) covering mandate, organic law, and recruitment cycles.
5. Sources: HTTPS-only, operator-reviewed. The known official source family already used by Sobdai for สตง. is `https://www.audit.go.th/`. Do NOT substitute `https://www.oag.go.th` — it was never verified. Example sources JSON:

   ```json
   [
     { "label": "สำนักงานการตรวจเงินแผ่นดิน (สตง.)", "url": "https://www.audit.go.th/" }
   ]
   ```

6. Optionally assign an editorial author from `article_authors`, then **Save Agency Profile** (draft).
7. Publish with a `content.publish` role (owner/admin) via the Lifecycle panel. Publication requires a stable slug, a non-empty overview, and ≥ 1 authoritative HTTPS source.
8. Expected index-readiness at publish (from the audited Production snapshot): 2 meaningful positions + 2 published packages + 0 news + 10 published articles → supporting total 14 ≥ 2 with packages present → the page is published AND index-ready (hub + sitemap inclusion) once the overview/sources pass.

Equivalent operator SQL (alternative path — draft only, no editorial copy fabricated):

```sql
begin;

insert into public.agency_profiles (organization_id, slug, overview_markdown, status, sources)
values (
  (select id from public.organizations where code = 'OAG' and name = 'สำนักงานการตรวจเงินแผ่นดิน'),
  'state-audit-office',
  null,
  'draft',
  '[{"label":"สำนักงานการตรวจเงินแผ่นดิน (สตง.)","url":"https://www.audit.go.th/"}]'::jsonb
)
on conflict (organization_id) do nothing;

commit;
```

The `where code = 'OAG' and name = …` guard aborts the insert (null organization_id → NOT NULL violation) if the audited OAG row is missing or renamed. Editorial copy and publication then happen through the admin UI.
