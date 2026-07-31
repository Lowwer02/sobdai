-- 036_kp_migration_control.sql
-- Sobdai Knowledge Platform — Batch A / Migration 036.
--
-- Purpose
-- -------
-- Install private, temporary migration bookkeeping for the later frozen
-- backfill batches:
--   * one migration-run record per approved manifest/run;
--   * one Summary source-to-target/checksum ledger row per run;
--   * resumable progress per logical backfill batch.
--
-- Boundaries
-- ----------
-- * This schema is operational infrastructure, not a domain aggregate.
-- * It contains no Knowledge Platform domain data or application read model.
-- * It has no grants for anon/authenticated and no public API surface.
-- * It does not read or mutate Packages, Summaries, Users, engines, or content.
-- * Domain UUIDs are recorded as values, not foreign keys, so the temporary
--   ledger cannot change legacy delete behavior during the coexistence window.
--
-- Safety / idempotency
-- --------------------
-- Objects use IF NOT EXISTS where PostgreSQL supports it. A final assertion
-- block fails closed if an object with the expected name has an incompatible
-- shape. RLS is enabled with no policies; only Supabase service_role and the
-- database owner can access the schema.
--
-- Rollback
-- --------
-- Leave this isolated schema dormant. Frozen migration 060 exports evidence
-- and removes migration-only compatibility/control objects after cleanup.

create schema if not exists kp_migration;

comment on schema kp_migration is
    'Private, temporary control plane for the frozen Knowledge Platform migration. Not a domain schema or PostgREST surface.';

revoke all on schema kp_migration from public, anon, authenticated;
grant usage on schema kp_migration to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration run
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.migration_runs (
    id uuid primary key default uuid_generate_v4(),
    run_key text not null,
    status text not null default 'preparing',

    source_schema_fingerprint text not null,
    manifest_checksum text not null,
    markdown_checksum_algorithm text not null,

    created_by uuid,
    started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_migration_runs_run_key_key unique (run_key),
    constraint kp_migration_runs_status_check check (
        status in ('preparing', 'running', 'paused', 'completed', 'failed', 'abandoned')
    ),
    constraint kp_migration_runs_required_text_check check (
        btrim(run_key) <> ''
        and btrim(source_schema_fingerprint) <> ''
        and btrim(manifest_checksum) <> ''
        and btrim(markdown_checksum_algorithm) <> ''
    ),
    constraint kp_migration_runs_started_check check (
        status = 'preparing' or started_at is not null
    ),
    constraint kp_migration_runs_completed_check check (
        (status = 'completed' and completed_at is not null)
        or (status <> 'completed' and completed_at is null)
    ),
    constraint kp_migration_runs_failed_check check (
        status <> 'failed' or nullif(btrim(error_message), '') is not null
    ),
    constraint kp_migration_runs_metadata_check check (
        jsonb_typeof(metadata) = 'object'
    )
);

comment on table kp_migration.migration_runs is
    'One approved Knowledge Platform migration execution and its immutable manifest/checksum policy identity.';
comment on column kp_migration.migration_runs.run_key is
    'Operator-approved idempotency key. A run key is unique and never reused for a different manifest.';
comment on column kp_migration.migration_runs.source_schema_fingerprint is
    'Digest of the preflight-approved source schema/inventory used to detect drift.';
comment on column kp_migration.migration_runs.manifest_checksum is
    'Digest of the frozen source manifest for this run.';
comment on column kp_migration.migration_runs.markdown_checksum_algorithm is
    'Versioned algorithm identifier used for source/target Markdown reconciliation.';

create index if not exists kp_migration_runs_status_created_idx
    on kp_migration.migration_runs (status, created_at, id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary source-to-target ledger
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.summary_ledger (
    migration_run_id uuid not null,
    source_summary_id uuid not null,
    source_package_id uuid not null,
    source_updated_at timestamptz not null,
    source_content_bytes bigint not null,
    source_content_checksum text not null,

    target_summary_id uuid,
    target_revision_id uuid,
    target_summary_code text,
    target_canonical_slug text,
    target_package_id uuid,
    target_legacy_slug text,
    target_content_checksum text,

    state text not null default 'pending',
    attempt_count integer not null default 0,
    last_attempted_at timestamptz,
    completed_at timestamptz,
    error_code text,
    error_message text,
    provenance jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_summary_ledger_pkey primary key (
        migration_run_id,
        source_summary_id
    ),
    constraint kp_summary_ledger_run_fkey foreign key (migration_run_id)
        references kp_migration.migration_runs(id)
        on delete restrict,
    constraint kp_summary_ledger_state_check check (
        state in ('pending', 'in_progress', 'succeeded', 'failed', 'stale', 'skipped')
    ),
    constraint kp_summary_ledger_source_size_check check (
        source_content_bytes >= 0
    ),
    constraint kp_summary_ledger_attempt_count_check check (
        attempt_count >= 0
    ),
    constraint kp_summary_ledger_source_checksum_check check (
        btrim(source_content_checksum) <> ''
    ),
    constraint kp_summary_ledger_identity_preservation_check check (
        target_summary_id is null or target_summary_id = source_summary_id
    ),
    constraint kp_summary_ledger_success_check check (
        state <> 'succeeded'
        or (
            target_summary_id is not null
            and target_revision_id is not null
            and nullif(btrim(target_summary_code), '') is not null
            and nullif(btrim(target_canonical_slug), '') is not null
            and target_package_id is not null
            and nullif(btrim(target_legacy_slug), '') is not null
            and nullif(btrim(target_content_checksum), '') is not null
            and completed_at is not null
        )
    ),
    constraint kp_summary_ledger_completion_check check (
        (state in ('succeeded', 'skipped') and completed_at is not null)
        or (state not in ('succeeded', 'skipped') and completed_at is null)
    ),
    constraint kp_summary_ledger_failure_check check (
        state <> 'failed' or nullif(btrim(error_message), '') is not null
    ),
    constraint kp_summary_ledger_provenance_check check (
        jsonb_typeof(provenance) = 'object'
    )
);

comment on table kp_migration.summary_ledger is
    'Lossless, resumable mapping from each legacy Summary row to frozen Knowledge Platform identities, revision, placement, and checksums.';
comment on column kp_migration.summary_ledger.source_summary_id is
    'Existing Summary UUID. Initial migration preserves this as the target Summary UUID.';
comment on column kp_migration.summary_ledger.target_revision_id is
    'Revision 1 UUID allocated by the later frozen backfill; intentionally not an FK before Batch C exists.';
comment on column kp_migration.summary_ledger.provenance is
    'Migration evidence only. It is not editable Knowledge Platform metadata.';

create index if not exists kp_summary_ledger_run_state_idx
    on kp_migration.summary_ledger (
        migration_run_id,
        state,
        source_summary_id
    );

create index if not exists kp_summary_ledger_source_summary_idx
    on kp_migration.summary_ledger (source_summary_id, migration_run_id);

create index if not exists kp_summary_ledger_target_revision_idx
    on kp_migration.summary_ledger (target_revision_id)
    where target_revision_id is not null;

create unique index if not exists kp_summary_ledger_run_summary_code_key
    on kp_migration.summary_ledger (migration_run_id, target_summary_code)
    where target_summary_code is not null;

create unique index if not exists kp_summary_ledger_run_canonical_slug_key
    on kp_migration.summary_ledger (migration_run_id, target_canonical_slug)
    where target_canonical_slug is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-batch progress
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kp_migration.batch_progress (
    migration_run_id uuid not null,
    batch_key text not null,
    state text not null default 'pending',

    last_source_summary_id uuid,
    source_updated_watermark timestamptz,

    processed_count bigint not null default 0,
    succeeded_count bigint not null default 0,
    failed_count bigint not null default 0,
    skipped_count bigint not null default 0,

    started_at timestamptz,
    heartbeat_at timestamptz,
    completed_at timestamptz,
    error_message text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint kp_batch_progress_pkey primary key (
        migration_run_id,
        batch_key
    ),
    constraint kp_batch_progress_run_fkey foreign key (migration_run_id)
        references kp_migration.migration_runs(id)
        on delete restrict,
    constraint kp_batch_progress_batch_key_check check (
        btrim(batch_key) <> ''
    ),
    constraint kp_batch_progress_state_check check (
        state in ('pending', 'running', 'paused', 'completed', 'failed')
    ),
    constraint kp_batch_progress_counts_check check (
        processed_count >= 0
        and succeeded_count >= 0
        and failed_count >= 0
        and skipped_count >= 0
        and processed_count = succeeded_count + failed_count + skipped_count
    ),
    constraint kp_batch_progress_started_check check (
        state = 'pending' or started_at is not null
    ),
    constraint kp_batch_progress_completed_check check (
        (state = 'completed' and completed_at is not null)
        or (state <> 'completed' and completed_at is null)
    ),
    constraint kp_batch_progress_failed_check check (
        state <> 'failed' or nullif(btrim(error_message), '') is not null
    )
);

comment on table kp_migration.batch_progress is
    'Resumable cursor, counts, heartbeat, and failure state for each logical Knowledge Platform backfill batch.';

create index if not exists kp_batch_progress_run_state_idx
    on kp_migration.batch_progress (
        migration_run_id,
        state,
        batch_key
    );

create index if not exists kp_batch_progress_running_heartbeat_idx
    on kp_migration.batch_progress (heartbeat_at, migration_run_id, batch_key)
    where state = 'running';

-- Reuse the established public updated_at trigger function. Dropping only
-- these private triggers keeps this migration idempotent without touching
-- application triggers.
drop trigger if exists handle_updated_at_kp_migration_runs
    on kp_migration.migration_runs;
create trigger handle_updated_at_kp_migration_runs
    before update on kp_migration.migration_runs
    for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at_kp_summary_ledger
    on kp_migration.summary_ledger;
create trigger handle_updated_at_kp_summary_ledger
    before update on kp_migration.summary_ledger
    for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at_kp_batch_progress
    on kp_migration.batch_progress;
create trigger handle_updated_at_kp_batch_progress
    before update on kp_migration.batch_progress
    for each row execute procedure public.handle_updated_at();

-- Defense in depth: the schema is not exposed by PostgREST, RLS has no client
-- policies, and grants are limited to service_role.
alter table kp_migration.migration_runs enable row level security;
alter table kp_migration.summary_ledger enable row level security;
alter table kp_migration.batch_progress enable row level security;

revoke all on all tables in schema kp_migration
    from public, anon, authenticated;
revoke all on all sequences in schema kp_migration
    from public, anon, authenticated;

grant select, insert, update, delete
    on all tables in schema kp_migration
    to service_role;
grant usage, select
    on all sequences in schema kp_migration
    to service_role;

alter default privileges in schema kp_migration
    revoke all on tables from public, anon, authenticated;
alter default privileges in schema kp_migration
    revoke all on sequences from public, anon, authenticated;
alter default privileges in schema kp_migration
    grant select, insert, update, delete on tables to service_role;
alter default privileges in schema kp_migration
    grant usage, select on sequences to service_role;

-- Fail closed if an earlier partial/manual object used one of these names with
-- an incompatible shape. IF NOT EXISTS must never hide drift.
do $kp_control_assertions$
declare
    expected record;
begin
    for expected in
        select *
        from (
            values
                ('migration_runs', 'id', 'uuid', 'NO'),
                ('migration_runs', 'run_key', 'text', 'NO'),
                ('migration_runs', 'status', 'text', 'NO'),
                ('migration_runs', 'source_schema_fingerprint', 'text', 'NO'),
                ('migration_runs', 'manifest_checksum', 'text', 'NO'),
                ('migration_runs', 'markdown_checksum_algorithm', 'text', 'NO'),
                ('migration_runs', 'metadata', 'jsonb', 'NO'),

                ('summary_ledger', 'migration_run_id', 'uuid', 'NO'),
                ('summary_ledger', 'source_summary_id', 'uuid', 'NO'),
                ('summary_ledger', 'source_package_id', 'uuid', 'NO'),
                ('summary_ledger', 'source_content_checksum', 'text', 'NO'),
                ('summary_ledger', 'target_summary_id', 'uuid', 'YES'),
                ('summary_ledger', 'target_revision_id', 'uuid', 'YES'),
                ('summary_ledger', 'target_summary_code', 'text', 'YES'),
                ('summary_ledger', 'target_canonical_slug', 'text', 'YES'),
                ('summary_ledger', 'state', 'text', 'NO'),
                ('summary_ledger', 'attempt_count', 'int4', 'NO'),
                ('summary_ledger', 'provenance', 'jsonb', 'NO'),

                ('batch_progress', 'migration_run_id', 'uuid', 'NO'),
                ('batch_progress', 'batch_key', 'text', 'NO'),
                ('batch_progress', 'state', 'text', 'NO'),
                ('batch_progress', 'processed_count', 'int8', 'NO'),
                ('batch_progress', 'succeeded_count', 'int8', 'NO'),
                ('batch_progress', 'failed_count', 'int8', 'NO'),
                ('batch_progress', 'skipped_count', 'int8', 'NO')
        ) as required_columns(table_name, column_name, udt_name, is_nullable)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'kp_migration'
              and c.table_name = expected.table_name
              and c.column_name = expected.column_name
              and c.udt_name = expected.udt_name
              and c.is_nullable = expected.is_nullable
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration control drift: expected kp_migration.%I.%I type=%s nullable=%s.',
                    expected.table_name,
                    expected.column_name,
                    expected.udt_name,
                    expected.is_nullable
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('migration_runs', 'migration_runs_pkey'),
                ('migration_runs', 'kp_migration_runs_run_key_key'),
                ('migration_runs', 'kp_migration_runs_status_check'),
                ('migration_runs', 'kp_migration_runs_required_text_check'),
                ('migration_runs', 'kp_migration_runs_started_check'),
                ('migration_runs', 'kp_migration_runs_completed_check'),
                ('migration_runs', 'kp_migration_runs_failed_check'),
                ('migration_runs', 'kp_migration_runs_metadata_check'),

                ('summary_ledger', 'kp_summary_ledger_pkey'),
                ('summary_ledger', 'kp_summary_ledger_run_fkey'),
                ('summary_ledger', 'kp_summary_ledger_state_check'),
                ('summary_ledger', 'kp_summary_ledger_source_size_check'),
                ('summary_ledger', 'kp_summary_ledger_attempt_count_check'),
                ('summary_ledger', 'kp_summary_ledger_source_checksum_check'),
                ('summary_ledger', 'kp_summary_ledger_identity_preservation_check'),
                ('summary_ledger', 'kp_summary_ledger_success_check'),
                ('summary_ledger', 'kp_summary_ledger_completion_check'),
                ('summary_ledger', 'kp_summary_ledger_failure_check'),
                ('summary_ledger', 'kp_summary_ledger_provenance_check'),

                ('batch_progress', 'kp_batch_progress_pkey'),
                ('batch_progress', 'kp_batch_progress_run_fkey'),
                ('batch_progress', 'kp_batch_progress_batch_key_check'),
                ('batch_progress', 'kp_batch_progress_state_check'),
                ('batch_progress', 'kp_batch_progress_counts_check'),
                ('batch_progress', 'kp_batch_progress_started_check'),
                ('batch_progress', 'kp_batch_progress_completed_check'),
                ('batch_progress', 'kp_batch_progress_failed_check')
        ) as required_constraints(table_name, constraint_name)
    loop
        if not exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'kp_migration'
              and t.relname = expected.table_name
              and c.conname = expected.constraint_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration control drift: constraint %I is missing from kp_migration.%I.',
                    expected.constraint_name,
                    expected.table_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('kp_migration_runs_status_created_idx'),
                ('kp_summary_ledger_run_state_idx'),
                ('kp_summary_ledger_source_summary_idx'),
                ('kp_summary_ledger_target_revision_idx'),
                ('kp_summary_ledger_run_summary_code_key'),
                ('kp_summary_ledger_run_canonical_slug_key'),
                ('kp_batch_progress_run_state_idx'),
                ('kp_batch_progress_running_heartbeat_idx')
        ) as required_indexes(index_name)
    loop
        if to_regclass(format('kp_migration.%I', expected.index_name)) is null then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration control drift: index kp_migration.%I is missing.',
                    expected.index_name
                );
        end if;
    end loop;

    for expected in
        select *
        from (
            values
                ('migration_runs'),
                ('summary_ledger'),
                ('batch_progress')
        ) as rls_tables(table_name)
    loop
        if not exists (
            select 1
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'kp_migration'
              and c.relname = expected.table_name
              and c.relrowsecurity
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration control drift: RLS is not enabled on kp_migration.%I.',
                    expected.table_name
                );
        end if;
    end loop;

    if exists (
        select 1
        from pg_policies
        where schemaname = 'kp_migration'
          and tablename in ('migration_runs', 'summary_ledger', 'batch_progress')
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration control drift: client RLS policies exist in the private schema.';
    end if;

    if has_schema_privilege('anon', 'kp_migration', 'USAGE')
       or has_schema_privilege('authenticated', 'kp_migration', 'USAGE')
    then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration control drift: a client role has USAGE on kp_migration.';
    end if;

    if not has_schema_privilege('service_role', 'kp_migration', 'USAGE') then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration control drift: service_role lacks schema USAGE.';
    end if;

    for expected in
        select *
        from (
            values
                ('migration_runs', 'SELECT'),
                ('migration_runs', 'INSERT'),
                ('migration_runs', 'UPDATE'),
                ('migration_runs', 'DELETE'),
                ('summary_ledger', 'SELECT'),
                ('summary_ledger', 'INSERT'),
                ('summary_ledger', 'UPDATE'),
                ('summary_ledger', 'DELETE'),
                ('batch_progress', 'SELECT'),
                ('batch_progress', 'INSERT'),
                ('batch_progress', 'UPDATE'),
                ('batch_progress', 'DELETE')
        ) as required_privileges(table_name, privilege_name)
    loop
        if not has_table_privilege(
            'service_role',
            format('kp_migration.%I', expected.table_name),
            expected.privilege_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Knowledge Platform migration control drift: service_role lacks %s on kp_migration.%I.',
                    expected.privilege_name,
                    expected.table_name
                );
        end if;
    end loop;

    raise notice 'Knowledge Platform Batch A migration-control infrastructure is valid and private.';
end
$kp_control_assertions$;
