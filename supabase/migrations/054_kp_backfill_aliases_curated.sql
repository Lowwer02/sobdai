-- 054_kp_backfill_aliases_curated.sql
-- Sobdai Knowledge Platform — reconciled frozen Migration 052 responsibility.
--
-- Migration-number audit
-- ----------------------
-- Production migration 053_kp_backfill_package_summaries.sql is committed and
-- is the current deployed Knowledge Platform maximum. Production migration
-- 054 is therefore the next identity and implements frozen responsibility 052.
--
-- Purpose
-- -------
-- Install the private manifest, human-approval boundary, controlled one-alias
-- executor, explicit-empty evidence, and combined canonical/alias namespace
-- reconciliation required for curated Summary aliases.
--
-- Deployment boundary
-- -------------------
-- Deployment creates empty control infrastructure and helper functions only.
-- It does not load a manifest, invoke a helper, insert a SummaryAlias, repoint
-- a PackageSummary or NewsSummary, modify a Summary/SummaryVersion, infer an
-- alias from Package-scoped legacy slugs, or execute production backfill.
-- Approved consolidation repoints remain optional and require their own exact
-- reviewed manifest; this unit never performs an automatic semantic merge.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail closed on frozen dependencies 036, 044, 048, 049, and 053
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_curated_summary_alias_preflight$
declare
    expected record;
begin
    for expected in
        select object_name
        from (values
            ('public.profiles'),
            ('public.summaries'),
            ('public.summary_aliases'),
            ('public.package_summaries'),
            ('public.news_summaries'),
            ('kp_migration.migration_runs'),
            ('kp_migration.summary_ledger'),
            ('kp_migration.batch_progress')
        ) as required(object_name)
    loop
        if to_regclass(expected.object_name) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 prerequisite %s is missing.', expected.object_name);
        end if;
    end loop;

    if to_regprocedure('kp_migration.apply_package_summary_placement_unit(uuid,uuid)') is null
       or to_regprocedure('kp_migration.reconcile_package_summary_placements(uuid)') is null
       or to_regprocedure('public.guard_summary_slug_namespace()') is null
       or to_regprocedure('public.protect_summary_alias_identity()') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 054 requires production migration 053 placement reconciliation and the frozen SummaryAlias guards.';
    end if;

    for expected in
        select table_name, constraint_name
        from (values
            ('summary_aliases', 'summary_aliases_pkey'),
            ('summary_aliases', 'summary_aliases_slug_key'),
            ('summary_aliases', 'summary_aliases_slug_check'),
            ('summary_aliases', 'summary_aliases_redirect_type_check'),
            ('summary_aliases', 'summary_aliases_status_check'),
            ('summary_aliases', 'summary_aliases_reason_check'),
            ('summary_aliases', 'summary_aliases_retirement_check'),
            ('summary_aliases', 'summary_aliases_summary_fkey'),
            ('summary_aliases', 'summary_aliases_created_by_fkey'),
            ('summary_aliases', 'summary_aliases_retired_by_fkey')
        ) as required(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public'
              and t.relname = expected.table_name
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 requires validated constraint public.%I.%I.', expected.table_name, expected.constraint_name);
        end if;
    end loop;

    for expected in
        select index_name, table_name, must_be_unique
        from (values
            ('summaries_canonical_slug_key', 'summaries', true),
            ('summary_aliases_slug_key', 'summary_aliases', true),
            ('summary_aliases_summary_status_idx', 'summary_aliases', false)
        ) as required(index_name, table_name, must_be_unique)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_index i on i.indexrelid = c.oid
            where n.nspname = 'public'
              and c.relname = expected.index_name
              and i.indrelid = format('public.%I', expected.table_name)::regclass
              and i.indisunique = expected.must_be_unique
              and i.indisvalid
              and i.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 requires valid index public.%I.', expected.index_name);
        end if;
    end loop;

    for expected in
        select table_name, trigger_name
        from (values
            ('summary_aliases', 'enforce_summary_alias_transition'),
            ('summary_aliases', 'protect_summary_alias_identity'),
            ('summary_aliases', 'guard_summary_alias_slug_namespace'),
            ('summaries', 'guard_summary_canonical_slug_namespace'),
            ('summary_aliases', 'handle_updated_at_summary_aliases')
        ) as required(table_name, trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger trigger_row
            join pg_class table_row on table_row.oid = trigger_row.tgrelid
            join pg_namespace n on n.oid = table_row.relnamespace
            where trigger_row.tgname = expected.trigger_name
              and n.nspname = 'public'
              and table_row.relname = expected.table_name
              and not trigger_row.tgisinternal
              and trigger_row.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 requires enabled trigger %I.', expected.trigger_name);
        end if;
    end loop;

    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'summary_aliases'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 054 requires SummaryAlias RLS to remain enabled.';
    end if;
end
$kp_curated_summary_alias_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Private reviewed alias manifest — intentionally empty at deployment
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.summary_alias_manifest (
    migration_run_id uuid not null,
    alias_id uuid not null,
    target_summary_id uuid not null,
    source_summary_id uuid,

    alias_origin text not null,
    slug text not null,
    redirect_type text not null,
    reason text not null,
    approval_note text not null,

    target_summary_code text not null,
    target_canonical_slug text not null,
    target_updated_at timestamptz not null,
    source_summary_code text,
    source_canonical_slug text,
    source_updated_at timestamptz,

    state text not null default 'preparing',
    approved_by uuid,
    approved_at timestamptz,
    applied_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_summary_alias_manifest_pkey
        primary key (migration_run_id, alias_id),
    constraint kp_summary_alias_manifest_alias_id_key
        unique (alias_id),
    constraint kp_summary_alias_manifest_run_slug_key
        unique (migration_run_id, slug),
    constraint kp_summary_alias_manifest_run_fkey
        foreign key (migration_run_id)
        references kp_migration.migration_runs(id) on delete restrict,
    constraint kp_summary_alias_manifest_target_ledger_fkey
        foreign key (migration_run_id, target_summary_id)
        references kp_migration.summary_ledger(migration_run_id, source_summary_id)
        on delete restrict,
    constraint kp_summary_alias_manifest_source_ledger_fkey
        foreign key (migration_run_id, source_summary_id)
        references kp_migration.summary_ledger(migration_run_id, source_summary_id)
        on delete restrict,
    constraint kp_summary_alias_manifest_approved_by_fkey
        foreign key (approved_by)
        references public.profiles(id) on delete restrict,
    constraint kp_summary_alias_manifest_slug_check check (
        btrim(slug) <> ''
        and slug = lower(btrim(slug))
    ),
    constraint kp_summary_alias_manifest_required_text_check check (
        btrim(approval_note) <> ''
        and btrim(target_summary_code) <> ''
        and target_summary_code = upper(btrim(target_summary_code))
        and btrim(target_canonical_slug) <> ''
        and target_canonical_slug = lower(btrim(target_canonical_slug))
        and target_canonical_slug <> slug
        and (source_summary_code is null or (
            btrim(source_summary_code) <> ''
            and source_summary_code = upper(btrim(source_summary_code))
        ))
        and (source_canonical_slug is null or (
            btrim(source_canonical_slug) <> ''
            and source_canonical_slug = lower(btrim(source_canonical_slug))
        ))
    ),
    constraint kp_summary_alias_manifest_origin_check check (
        (
            alias_origin = 'former_global'
            and source_summary_id is null
            and source_summary_code is null
            and source_canonical_slug is null
            and source_updated_at is null
            and reason in ('rename', 'correction', 'migration')
        )
        or (
            alias_origin = 'approved_merge'
            and source_summary_id is not null
            and source_summary_id <> target_summary_id
            and source_summary_code is not null
            and source_canonical_slug is not null
            and source_updated_at is not null
            and reason = 'merge'
            and redirect_type = 'permanent'
        )
    ),
    constraint kp_summary_alias_manifest_redirect_type_check check (
        redirect_type in ('permanent', 'temporary')
    ),
    constraint kp_summary_alias_manifest_reason_check check (
        reason in ('rename', 'merge', 'correction', 'migration')
    ),
    constraint kp_summary_alias_manifest_state_check check (
        state in ('preparing', 'approved', 'applied')
    ),
    constraint kp_summary_alias_manifest_approval_check check (
        (state = 'preparing' and approved_by is null and approved_at is null and applied_at is null)
        or (state = 'approved' and approved_by is not null and approved_at is not null and applied_at is null)
        or (state = 'applied' and approved_by is not null and approved_at is not null and applied_at is not null)
    )
);

comment on table kp_migration.summary_alias_manifest is
    'Private human-reviewed former-global and approved-merge Summary alias manifest. Empty deployment never invents aliases from Package-scoped legacy slugs.';
comment on column kp_migration.summary_alias_manifest.alias_origin is
    'Human-reviewed evidence class: former_global or approved_merge; it is never inferred from PackageSummary.legacy_slug.';
comment on column kp_migration.summary_alias_manifest.source_summary_id is
    'Optional non-canonical Summary identity associated with an approved merge redirect. This manifest does not itself repoint or archive that Summary.';
comment on column kp_migration.summary_alias_manifest.approval_note is
    'Required human review evidence explaining why the slug is a real former global locator or approved merge redirect.';

create index if not exists kp_summary_alias_manifest_run_state_idx
    on kp_migration.summary_alias_manifest (migration_run_id, state, alias_id);

create index if not exists kp_summary_alias_manifest_target_idx
    on kp_migration.summary_alias_manifest (target_summary_id, migration_run_id);

create index if not exists kp_summary_alias_manifest_source_idx
    on kp_migration.summary_alias_manifest (source_summary_id, migration_run_id)
    where source_summary_id is not null;

alter table kp_migration.summary_alias_manifest enable row level security;

-- Approved/applied rows are durable reviewed history. Preparing rows remain
-- editable so an operator can correct a candidate before human approval.
create or replace function kp_migration.guard_summary_alias_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
begin
    if tg_op = 'DELETE' then
        if old.state <> 'preparing' then
            raise exception 'approved or applied Summary alias manifest rows cannot be deleted'
                using errcode = 'check_violation';
        end if;
        return old;
    end if;

    if old.state = 'applied' then
        raise exception 'applied Summary alias manifest rows are immutable'
            using errcode = 'check_violation';
    end if;

    if old.state = 'approved' then
        if new.state <> 'applied'
           or row(
                new.migration_run_id, new.alias_id,
                new.target_summary_id, new.source_summary_id,
                new.alias_origin, new.slug, new.redirect_type, new.reason,
                new.approval_note,
                new.target_summary_code, new.target_canonical_slug, new.target_updated_at,
                new.source_summary_code, new.source_canonical_slug, new.source_updated_at,
                new.approved_by, new.approved_at, new.created_at
           ) is distinct from row(
                old.migration_run_id, old.alias_id,
                old.target_summary_id, old.source_summary_id,
                old.alias_origin, old.slug, old.redirect_type, old.reason,
                old.approval_note,
                old.target_summary_code, old.target_canonical_slug, old.target_updated_at,
                old.source_summary_code, old.source_canonical_slug, old.source_updated_at,
                old.approved_by, old.approved_at, old.created_at
           )
           or new.applied_at is null
        then
            raise exception 'approved Summary alias manifest rows permit only the controlled applied transition'
                using errcode = 'check_violation';
        end if;
    elsif old.state = 'preparing' and new.state = 'applied' then
        raise exception 'Summary alias manifest approval cannot be skipped'
            using errcode = 'check_violation';
    end if;

    return new;
end
$function$;

drop trigger if exists guard_summary_alias_manifest
    on kp_migration.summary_alias_manifest;
create trigger guard_summary_alias_manifest
    before update or delete on kp_migration.summary_alias_manifest
    for each row execute function kp_migration.guard_summary_alias_manifest();

drop trigger if exists handle_updated_at_kp_summary_alias_manifest
    on kp_migration.summary_alias_manifest;
create trigger handle_updated_at_kp_summary_alias_manifest
    before update on kp_migration.summary_alias_manifest
    for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Human approval — validates only and writes no domain facts
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.approve_curated_summary_alias_manifest(
    p_migration_run_id uuid,
    p_alias_id uuid,
    p_approved_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_run kp_migration.migration_runs%rowtype;
    v_manifest kp_migration.summary_alias_manifest%rowtype;
    v_target public.summaries%rowtype;
    v_source public.summaries%rowtype;
    v_target_ledger kp_migration.summary_ledger%rowtype;
    v_source_ledger kp_migration.summary_ledger%rowtype;
    v_placement_reconciliation record;
begin
    if p_migration_run_id is null or p_alias_id is null or p_approved_by is null then
        raise exception 'curated Summary alias approval requires migration_run_id, alias_id, and approved_by'
            using errcode = 'null_value_not_allowed';
    end if;

    select r.* into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
    for share;

    if not found or v_run.status <> 'running' then
        raise exception 'curated Summary alias approval requires a running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = p_approved_by
          and p.role in ('owner', 'admin', 'editor')
    ) then
        raise exception 'curated Summary alias approval requires an existing owner, admin, or editor'
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_placement_reconciliation
    from kp_migration.reconcile_package_summary_placements(p_migration_run_id);

    if v_placement_reconciliation.ledger_total = 0
       or v_placement_reconciliation.ledger_total <> v_placement_reconciliation.placement_total
       or v_placement_reconciliation.ledger_total <>
          v_placement_reconciliation.succeeded_total + v_placement_reconciliation.skipped_total
       or v_placement_reconciliation.mismatch_total <> 0
    then
        raise exception 'curated Summary alias approval requires complete zero-mismatch migration 053 placement reconciliation'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_alias_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.alias_id = p_alias_id
    for update;

    if not found or v_manifest.state <> 'preparing' then
        raise exception 'curated Summary alias manifest unit must be preparing before approval'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select s.* into v_target
    from public.summaries s
    where s.id = v_manifest.target_summary_id
    for share;

    select l.* into v_target_ledger
    from kp_migration.summary_ledger l
    where l.migration_run_id = p_migration_run_id
      and l.source_summary_id = v_manifest.target_summary_id
    for share;

    if v_target.id is null
       or v_target_ledger.source_summary_id is null
       or v_target.summary_code is distinct from v_manifest.target_summary_code
       or v_target.canonical_slug is distinct from v_manifest.target_canonical_slug
       or v_target.updated_at is distinct from v_manifest.target_updated_at
       or v_target.lifecycle_status <> 'active'
       or v_target_ledger.target_summary_id is distinct from v_target.id
       or v_target_ledger.target_summary_code is distinct from v_target.summary_code
       or v_target_ledger.target_canonical_slug is distinct from v_target.canonical_slug
       or v_target_ledger.state not in ('succeeded', 'skipped')
       or not (v_target_ledger.provenance ? 'package_summary_placement')
    then
        raise exception 'curated Summary alias target does not match completed frozen Summary/placement evidence'
            using errcode = 'serialization_failure';
    end if;

    if v_manifest.source_summary_id is not null then
        select s.* into v_source
        from public.summaries s
        where s.id = v_manifest.source_summary_id
        for share;

        select l.* into v_source_ledger
        from kp_migration.summary_ledger l
        where l.migration_run_id = p_migration_run_id
          and l.source_summary_id = v_manifest.source_summary_id
        for share;

        if v_source.id is null
           or v_source_ledger.source_summary_id is null
           or v_source.id = v_target.id
           or v_source.summary_code is distinct from v_manifest.source_summary_code
           or v_source.canonical_slug is distinct from v_manifest.source_canonical_slug
           or v_source.updated_at is distinct from v_manifest.source_updated_at
           or v_source_ledger.target_summary_id is distinct from v_source.id
           or v_source_ledger.target_summary_code is distinct from v_source.summary_code
           or v_source_ledger.target_canonical_slug is distinct from v_source.canonical_slug
           or v_source_ledger.state not in ('succeeded', 'skipped')
           or not (v_source_ledger.provenance ? 'package_summary_placement')
        then
            raise exception 'approved merge alias source does not match completed frozen Summary/placement evidence'
                using errcode = 'serialization_failure';
        end if;
    end if;

    if exists (
        select 1 from public.summaries s
        where s.canonical_slug = v_manifest.slug
    ) or exists (
        select 1 from public.summary_aliases a
        where a.slug = v_manifest.slug or a.id = v_manifest.alias_id
    ) then
        raise exception 'curated Summary alias collides with the combined canonical/alias namespace'
            using errcode = 'unique_violation';
    end if;

    update kp_migration.summary_alias_manifest
    set state = 'approved',
        approved_by = p_approved_by,
        approved_at = clock_timestamp()
    where migration_run_id = p_migration_run_id
      and alias_id = p_alias_id;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Controlled one-alias execution — defined only, never invoked here
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function kp_migration.apply_curated_summary_alias_unit(
    p_migration_run_id uuid,
    p_alias_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_run kp_migration.migration_runs%rowtype;
    v_manifest kp_migration.summary_alias_manifest%rowtype;
    v_target public.summaries%rowtype;
    v_source public.summaries%rowtype;
    v_alias public.summary_aliases%rowtype;
    v_placement_reconciliation record;
    v_remaining bigint;
    v_now timestamptz := clock_timestamp();
begin
    if p_migration_run_id is null or p_alias_id is null then
        raise exception 'curated Summary alias application requires migration_run_id and alias_id'
            using errcode = 'null_value_not_allowed';
    end if;

    select r.* into v_run
    from kp_migration.migration_runs r
    where r.id = p_migration_run_id
    for share;

    if not found or v_run.status <> 'running' then
        raise exception 'curated Summary alias application requires a running migration run'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select * into v_placement_reconciliation
    from kp_migration.reconcile_package_summary_placements(p_migration_run_id);

    if v_placement_reconciliation.ledger_total = 0
       or v_placement_reconciliation.ledger_total <> v_placement_reconciliation.placement_total
       or v_placement_reconciliation.ledger_total <>
          v_placement_reconciliation.succeeded_total + v_placement_reconciliation.skipped_total
       or v_placement_reconciliation.mismatch_total <> 0
    then
        raise exception 'curated Summary alias application requires complete zero-mismatch migration 053 placement reconciliation'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select m.* into v_manifest
    from kp_migration.summary_alias_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.alias_id = p_alias_id
    for update;

    if not found or v_manifest.state not in ('approved', 'applied') then
        raise exception 'curated Summary alias application requires an approved manifest unit'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    select s.* into v_target
    from public.summaries s
    where s.id = v_manifest.target_summary_id
    for share;

    if not found
       or v_target.summary_code is distinct from v_manifest.target_summary_code
       or v_target.canonical_slug is distinct from v_manifest.target_canonical_slug
       or v_target.updated_at is distinct from v_manifest.target_updated_at
       or v_target.lifecycle_status <> 'active'
    then
        raise exception 'curated Summary alias target changed after approval'
            using errcode = 'serialization_failure';
    end if;

    if v_manifest.source_summary_id is not null then
        select s.* into v_source
        from public.summaries s
        where s.id = v_manifest.source_summary_id
        for share;

        if not found
           or v_source.summary_code is distinct from v_manifest.source_summary_code
           or v_source.canonical_slug is distinct from v_manifest.source_canonical_slug
           or v_source.updated_at is distinct from v_manifest.source_updated_at
        then
            raise exception 'approved merge alias source changed after approval'
                using errcode = 'serialization_failure';
        end if;
    end if;

    select a.* into v_alias
    from public.summary_aliases a
    where a.id = p_alias_id or a.slug = v_manifest.slug
    for share;

    if found and (
        v_alias.id <> v_manifest.alias_id
        or v_alias.summary_id <> v_manifest.target_summary_id
        or v_alias.slug <> v_manifest.slug
        or v_alias.redirect_type <> v_manifest.redirect_type
        or v_alias.status <> 'active'
        or v_alias.reason <> v_manifest.reason
        or v_alias.created_by <> v_manifest.approved_by
        or v_alias.retired_by is not null
        or v_alias.retired_at is not null
    ) then
        raise exception 'existing SummaryAlias does not match the approved curated manifest'
            using errcode = 'serialization_failure';
    end if;

    if v_manifest.state = 'applied' then
        if v_alias.id is null
           or v_manifest.applied_at is null
           or v_alias.created_at is distinct from v_manifest.applied_at
           or not exists (
               select 1
               from kp_migration.summary_ledger l
               where l.migration_run_id = p_migration_run_id
                 and l.source_summary_id = v_manifest.target_summary_id
                 and l.provenance #>> array['curated_summary_aliases', v_manifest.alias_id::text, 'migration'] = '54'
           )
           or (
               v_manifest.source_summary_id is not null
               and not exists (
                   select 1
                   from kp_migration.summary_ledger l
                   where l.migration_run_id = p_migration_run_id
                     and l.source_summary_id = v_manifest.source_summary_id
                     and l.provenance #>> array['curated_summary_aliases', v_manifest.alias_id::text, 'migration'] = '54'
                     and l.provenance #>> array['curated_summary_aliases', v_manifest.alias_id::text, 'ledger_role'] = 'approved_merge_source'
               )
           )
        then
            raise exception 'applied curated Summary alias does not reconcile with domain and ledger evidence'
                using errcode = 'serialization_failure';
        end if;
        return v_manifest.alias_id;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_manifest.slug, 0));

    if exists (
        select 1 from public.summaries s
        where s.canonical_slug = v_manifest.slug
    ) or exists (
        select 1 from public.summary_aliases a
        where a.slug = v_manifest.slug or a.id = v_manifest.alias_id
    ) then
        raise exception 'curated Summary alias namespace changed after approval'
            using errcode = 'unique_violation';
    end if;

    insert into public.summary_aliases (
        id, summary_id, slug, redirect_type, status, reason,
        created_by, created_at, updated_at, retired_by, retired_at
    ) values (
        v_manifest.alias_id,
        v_manifest.target_summary_id,
        v_manifest.slug,
        v_manifest.redirect_type,
        'active',
        v_manifest.reason,
        v_manifest.approved_by,
        v_now,
        v_now,
        null,
        null
    );

    update kp_migration.summary_alias_manifest
    set state = 'applied', applied_at = v_now
    where migration_run_id = p_migration_run_id
      and alias_id = p_alias_id;

    update kp_migration.summary_ledger
    set provenance = provenance || jsonb_build_object(
        'curated_summary_aliases',
        coalesce(provenance -> 'curated_summary_aliases', '{}'::jsonb)
        || jsonb_build_object(
            v_manifest.alias_id::text,
            jsonb_build_object(
                'migration', 54,
                'frozen_responsibility', 52,
                'alias_id', v_manifest.alias_id,
                'slug', v_manifest.slug,
                'alias_origin', v_manifest.alias_origin,
                'redirect_type', v_manifest.redirect_type,
                'reason', v_manifest.reason,
                'target_summary_id', v_manifest.target_summary_id,
                'source_summary_id', v_manifest.source_summary_id,
                'ledger_role', case
                    when source_summary_id = v_manifest.target_summary_id then 'target'
                    else 'approved_merge_source'
                end,
                'approved_by', v_manifest.approved_by,
                'approved_at', v_manifest.approved_at,
                'applied_at', v_now
            )
        )
    )
    where migration_run_id = p_migration_run_id
      and source_summary_id in (v_manifest.target_summary_id, v_manifest.source_summary_id);

    select count(*) into v_remaining
    from kp_migration.summary_alias_manifest m
    where m.migration_run_id = p_migration_run_id
      and m.state <> 'applied';

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id,
        'curated_summary_aliases',
        case when v_remaining = 0 then 'completed' else 'running' end,
        1, 1, 0, 0,
        v_now, v_now,
        case when v_remaining = 0 then v_now else null end
    )
    on conflict (migration_run_id, batch_key) do update
    set state = excluded.state,
        processed_count = kp_migration.batch_progress.processed_count + 1,
        succeeded_count = kp_migration.batch_progress.succeeded_count + 1,
        started_at = coalesce(kp_migration.batch_progress.started_at, excluded.started_at),
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    return v_manifest.alias_id;
end
$function$;

-- Explicitly approve a zero-row curated unit without creating an alias.
create or replace function kp_migration.confirm_empty_curated_summary_alias_manifest(
    p_migration_run_id uuid,
    p_approved_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_placement_reconciliation record;
    v_now timestamptz := clock_timestamp();
begin
    if not exists (
        select 1
        from kp_migration.migration_runs r
        where r.id = p_migration_run_id
          and r.status = 'running'
    ) or not exists (
        select 1
        from public.profiles p
        where p.id = p_approved_by
          and p.role in ('owner', 'admin', 'editor')
    ) then
        raise exception 'empty curated Summary alias confirmation has invalid run or approver'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    lock table kp_migration.summary_alias_manifest in share mode;
    lock table public.summary_aliases in share mode;

    if exists (
        select 1
        from kp_migration.summary_alias_manifest m
        where m.migration_run_id = p_migration_run_id
    ) or exists (select 1 from public.summary_aliases)
    then
        raise exception 'empty curated Summary alias confirmation requires empty manifest and alias target tables'
            using errcode = 'check_violation';
    end if;

    select * into v_placement_reconciliation
    from kp_migration.reconcile_package_summary_placements(p_migration_run_id);

    if v_placement_reconciliation.ledger_total = 0
       or v_placement_reconciliation.ledger_total <> v_placement_reconciliation.placement_total
       or v_placement_reconciliation.ledger_total <>
          v_placement_reconciliation.succeeded_total + v_placement_reconciliation.skipped_total
       or v_placement_reconciliation.mismatch_total <> 0
    then
        raise exception 'empty curated Summary alias confirmation requires complete zero-mismatch migration 053 placement reconciliation'
            using errcode = 'object_not_in_prerequisite_state';
    end if;

    insert into kp_migration.batch_progress (
        migration_run_id, batch_key, state,
        processed_count, succeeded_count, failed_count, skipped_count,
        started_at, heartbeat_at, completed_at
    ) values (
        p_migration_run_id, 'curated_summary_aliases', 'completed',
        0, 0, 0, 0, v_now, v_now, v_now
    )
    on conflict (migration_run_id, batch_key) do update
    set state = 'completed',
        processed_count = 0,
        succeeded_count = 0,
        failed_count = 0,
        skipped_count = 0,
        heartbeat_at = excluded.heartbeat_at,
        completed_at = excluded.completed_at,
        error_message = null;

    update kp_migration.migration_runs
    set metadata = jsonb_set(
        metadata,
        '{curated_summary_aliases}',
        jsonb_build_object(
            'status', 'approved_empty',
            'approved_by', p_approved_by,
            'approved_at', v_now,
            'migration', 54,
            'frozen_responsibility', 52
        ),
        true
    )
    where id = p_migration_run_id;
end
$function$;

-- Read-only reconciliation; it never inserts, repairs, repoints, or retires.
create or replace function kp_migration.reconcile_curated_summary_aliases(
    p_migration_run_id uuid
)
returns table (
    manifest_total bigint,
    preparing_total bigint,
    approved_total bigint,
    applied_total bigint,
    target_alias_total bigint,
    former_global_total bigint,
    approved_merge_total bigint,
    namespace_collision_total bigint,
    unmanifested_alias_total bigint,
    mismatch_total bigint,
    empty_confirmed boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, kp_migration, pg_temp
as $function$
    with manifest as (
        select m.*
        from kp_migration.summary_alias_manifest m
        where m.migration_run_id = p_migration_run_id
    ), run_evidence as (
        select r.metadata -> 'curated_summary_aliases' as evidence
        from kp_migration.migration_runs r
        where r.id = p_migration_run_id
    ), collisions as (
        select count(*)::bigint as total
        from public.summaries s
        join public.summary_aliases a on a.slug = s.canonical_slug
    ), unmanifested as (
        select count(*)::bigint as total
        from public.summary_aliases a
        where not exists (
            select 1 from manifest m where m.alias_id = a.id
        )
    )
    select
        (select count(*) from manifest),
        (select count(*) from manifest where state = 'preparing'),
        (select count(*) from manifest where state = 'approved'),
        (select count(*) from manifest where state = 'applied'),
        (
            select count(*)
            from manifest m
            join public.summary_aliases a on a.id = m.alias_id
        ),
        (select count(*) from manifest where alias_origin = 'former_global'),
        (select count(*) from manifest where alias_origin = 'approved_merge'),
        (select total from collisions),
        (select total from unmanifested),
        (
            (select total from collisions)
            + (select total from unmanifested)
            + (
                select count(*)
                from manifest m
                where (
                    m.state = 'applied'
                    and not exists (
                        select 1
                        from public.summary_aliases a
                        join kp_migration.summary_ledger l
                          on l.migration_run_id = m.migration_run_id
                         and l.source_summary_id = m.target_summary_id
                        where a.id = m.alias_id
                          and a.summary_id = m.target_summary_id
                          and a.slug = m.slug
                          and a.redirect_type = m.redirect_type
                          and a.status = 'active'
                          and a.reason = m.reason
                          and a.created_by = m.approved_by
                          and a.created_at = m.applied_at
                          and a.retired_by is null
                          and a.retired_at is null
                          and l.provenance #>> array['curated_summary_aliases', m.alias_id::text, 'migration'] = '54'
                          and l.provenance #>> array['curated_summary_aliases', m.alias_id::text, 'frozen_responsibility'] = '52'
                          and (
                              m.source_summary_id is null
                              or exists (
                                  select 1
                                  from kp_migration.summary_ledger source_ledger
                                  where source_ledger.migration_run_id = m.migration_run_id
                                    and source_ledger.source_summary_id = m.source_summary_id
                                    and source_ledger.provenance #>> array['curated_summary_aliases', m.alias_id::text, 'migration'] = '54'
                                    and source_ledger.provenance #>> array['curated_summary_aliases', m.alias_id::text, 'frozen_responsibility'] = '52'
                                    and source_ledger.provenance #>> array['curated_summary_aliases', m.alias_id::text, 'ledger_role'] = 'approved_merge_source'
                              )
                          )
                    )
                ) or (
                    m.state <> 'applied'
                    and exists (
                        select 1 from public.summary_aliases a
                        where a.id = m.alias_id or a.slug = m.slug
                    )
                )
            )
            + case
                when (select count(*) from manifest) = 0
                     and not exists (
                         select 1 from run_evidence e
                         where e.evidence #>> '{status}' = 'approved_empty'
                           and e.evidence #>> '{migration}' = '54'
                           and e.evidence #>> '{frozen_responsibility}' = '52'
                     )
                then 1
                when (select count(*) from manifest) > 0
                     and exists (
                         select 1 from run_evidence e
                         where e.evidence #>> '{status}' = 'approved_empty'
                     )
                then 1
                else 0
              end
        ),
        exists (
            select 1 from run_evidence e
            where e.evidence #>> '{status}' = 'approved_empty'
              and e.evidence #>> '{migration}' = '54'
              and e.evidence #>> '{frozen_responsibility}' = '52'
        );
$function$;

comment on function kp_migration.approve_curated_summary_alias_manifest(uuid, uuid, uuid) is
    'Freezes one human-reviewed former-global or approved-merge alias after exact migration 053 reconciliation; writes no domain facts.';
comment on function kp_migration.apply_curated_summary_alias_unit(uuid, uuid) is
    'Controlled frozen migration 052 alias executor installed as production migration 054. One explicit call inserts one approved direct SummaryAlias and records ledger evidence.';
comment on function kp_migration.confirm_empty_curated_summary_alias_manifest(uuid, uuid) is
    'Records explicit human approval that production migration 054 has zero curated Summary aliases; inserts no domain facts.';
comment on function kp_migration.reconcile_curated_summary_aliases(uuid) is
    'Read-only manifest, direct-target alias, ledger, and combined canonical/alias namespace reconciliation for frozen migration 052.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Private service/operator boundary; no browser policies and no public RLS drift
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on table kp_migration.summary_alias_manifest
    from public, anon, authenticated;
grant select, insert, update, delete on table kp_migration.summary_alias_manifest
    to service_role;

revoke all on function kp_migration.guard_summary_alias_manifest()
    from public, anon, authenticated;
revoke all on function kp_migration.approve_curated_summary_alias_manifest(uuid, uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.apply_curated_summary_alias_unit(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.confirm_empty_curated_summary_alias_manifest(uuid, uuid)
    from public, anon, authenticated;
revoke all on function kp_migration.reconcile_curated_summary_aliases(uuid)
    from public, anon, authenticated;

grant execute on function kp_migration.approve_curated_summary_alias_manifest(uuid, uuid, uuid)
    to service_role;
grant execute on function kp_migration.apply_curated_summary_alias_unit(uuid, uuid)
    to service_role;
grant execute on function kp_migration.confirm_empty_curated_summary_alias_manifest(uuid, uuid)
    to service_role;
grant execute on function kp_migration.reconcile_curated_summary_aliases(uuid)
    to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail-closed post-validation; still no manifest load or data execution
-- ─────────────────────────────────────────────────────────────────────────────

do $kp_curated_summary_alias_assertions$
declare
    expected record;
    function_is_security_definer boolean;
    function_config text[];
begin
    if not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'kp_migration'
          and c.relname = 'summary_alias_manifest'
          and c.relkind = 'r'
          and c.relrowsecurity
    ) or has_table_privilege('anon', 'kp_migration.summary_alias_manifest', 'SELECT')
       or has_table_privilege('authenticated', 'kp_migration.summary_alias_manifest', 'SELECT')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 054 drift: private alias manifest is missing, RLS-disabled, or browser-readable.';
    end if;

    for expected in
        select constraint_name
        from (values
            ('kp_summary_alias_manifest_pkey'),
            ('kp_summary_alias_manifest_alias_id_key'),
            ('kp_summary_alias_manifest_run_slug_key'),
            ('kp_summary_alias_manifest_run_fkey'),
            ('kp_summary_alias_manifest_target_ledger_fkey'),
            ('kp_summary_alias_manifest_source_ledger_fkey'),
            ('kp_summary_alias_manifest_approved_by_fkey'),
            ('kp_summary_alias_manifest_slug_check'),
            ('kp_summary_alias_manifest_required_text_check'),
            ('kp_summary_alias_manifest_origin_check'),
            ('kp_summary_alias_manifest_redirect_type_check'),
            ('kp_summary_alias_manifest_reason_check'),
            ('kp_summary_alias_manifest_state_check'),
            ('kp_summary_alias_manifest_approval_check')
        ) as required(constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            where c.conrelid = 'kp_migration.summary_alias_manifest'::regclass
              and c.conname = expected.constraint_name
              and c.convalidated
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 drift: manifest constraint %I is missing.', expected.constraint_name);
        end if;
    end loop;

    for expected in
        select index_name
        from (values
            ('kp_summary_alias_manifest_run_state_idx'),
            ('kp_summary_alias_manifest_target_idx'),
            ('kp_summary_alias_manifest_source_idx')
        ) as required(index_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_index i on i.indexrelid = c.oid
            where n.nspname = 'kp_migration'
              and c.relname = expected.index_name
              and i.indisvalid
              and i.indisready
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 drift: manifest index %I is missing or invalid.', expected.index_name);
        end if;
    end loop;

    for expected in
        select trigger_name
        from (values
            ('guard_summary_alias_manifest'),
            ('handle_updated_at_kp_summary_alias_manifest')
        ) as required(trigger_name)
    loop
        if not exists (
            select 1
            from pg_trigger trigger_row
            where trigger_row.tgrelid = 'kp_migration.summary_alias_manifest'::regclass
              and trigger_row.tgname = expected.trigger_name
              and not trigger_row.tgisinternal
              and trigger_row.tgenabled <> 'D'
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 drift: manifest trigger %I is missing or disabled.', expected.trigger_name);
        end if;
    end loop;

    for expected in
        select signature
        from (values
            ('kp_migration.approve_curated_summary_alias_manifest(uuid,uuid,uuid)'),
            ('kp_migration.apply_curated_summary_alias_unit(uuid,uuid)'),
            ('kp_migration.confirm_empty_curated_summary_alias_manifest(uuid,uuid)'),
            ('kp_migration.reconcile_curated_summary_aliases(uuid)')
        ) as required(signature)
    loop
        if to_regprocedure(expected.signature) is null
           or has_function_privilege('anon', expected.signature, 'EXECUTE')
           or has_function_privilege('authenticated', expected.signature, 'EXECUTE')
           or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 drift: helper %s has incompatible existence or grants.', expected.signature);
        end if;
    end loop;

    for expected in
        select signature, require_lock_timeout
        from (values
            ('kp_migration.approve_curated_summary_alias_manifest(uuid,uuid,uuid)', true),
            ('kp_migration.apply_curated_summary_alias_unit(uuid,uuid)', true),
            ('kp_migration.confirm_empty_curated_summary_alias_manifest(uuid,uuid)', true),
            ('kp_migration.reconcile_curated_summary_aliases(uuid)', false)
        ) as required(signature, require_lock_timeout)
    loop
        select p.prosecdef, p.proconfig
        into function_is_security_definer, function_config
        from pg_proc p
        where p.oid = expected.signature::regprocedure;

        if not function_is_security_definer
           or function_config is null
           or not ('search_path=pg_catalog, public, kp_migration, pg_temp' = any(function_config))
           or (expected.require_lock_timeout and not ('lock_timeout=5s' = any(function_config)))
        then
            raise exception using
                errcode = 'check_violation',
                message = format('Knowledge Platform migration 054 drift: helper %s has incompatible security configuration.', expected.signature);
        end if;
    end loop;

    if exists (
        select 1
        from pg_policies p
        where p.schemaname = 'kp_migration'
          and p.tablename = 'summary_alias_manifest'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 054 drift: private alias manifest must not expose RLS policies.';
    end if;
end
$kp_curated_summary_alias_assertions$;
