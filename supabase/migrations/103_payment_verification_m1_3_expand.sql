-- Sobdai M1.3A — hybrid slip verification engine, SHADOW MODE.
--
-- This is an EXPAND migration. It keeps the released M1.2 submission and
-- manual-review contracts callable while adding durable analyzer state,
-- evidence replay protection, and a service-only future auto-approval
-- primitive. Applying this file never enables automatic approval.
--
-- Rollout: apply DB-first, verify the objects, then deploy the application.
-- Do not run this file from application code or against Production without an
-- operator-approved SQL review.
-- The repository migration runner supplies the transaction boundary. When this
-- file is pasted into a SQL editor, wrap the complete file in one explicit
-- transaction and commit only after the final statement succeeds.

set local lock_timeout = '5s';
set local search_path = public;

do $payment_verification_m1_3_preflight$
declare
    required_relation text;
begin
    foreach required_relation in array ARRAY[
        'public.profiles',
        'public.orders',
        'public.payment_submissions',
        'public.payment_settings',
        'storage.objects'
    ] loop
        if to_regclass(required_relation) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('M1.3A requires %s.', required_relation);
        end if;
    end loop;

    if to_regprocedure('extensions.uuid_generate_v4()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.3A requires the uuid-ossp function at extensions.uuid_generate_v4(); install/enable the extension before applying this migration.';
    end if;

    if to_regprocedure('public.approve_payment_submission(uuid)') is null
       or to_regprocedure('public.reject_payment_submission(uuid,text)') is null
       or to_regprocedure('public.try_create_package_approved_notification(uuid)') is null
       or to_regprocedure('public.try_create_payment_rejected_notification(uuid)') is null
    then
        raise exception using
            errcode = 'check_violation',
            message = 'M1.3A requires the released manual approval/rejection and notification primitives.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'payment_submissions'
          and column_name = 'review_source'
    ) then
        raise exception using
            errcode = 'duplicate_column',
            message = 'M1.3A refuses a partially applied payment_submissions.review_source column.';
    end if;

    if to_regclass('public.payment_verifications') is not null
       or to_regclass('public.approved_payment_evidence') is not null
       or to_regclass('public.payment_verification_events') is not null
       or to_regclass('public.payment_provider_attestations') is not null
    then
        raise exception using
            errcode = 'duplicate_object',
            message = 'M1.3A refuses partially installed verification tables; inspect schema drift before retrying.';
    end if;
end
$payment_verification_m1_3_preflight$;

-- ---------------------------------------------------------------------------
-- Private settings and the smallest payment_submissions extension.
-- ---------------------------------------------------------------------------

alter table public.payment_settings
    add column auto_approval_enabled boolean not null default false,
    add column verification_recipient_name text not null default 'กิตติพงษ์',
    add column verification_destination_suffixes text[] not null default array['1853', '853']::text[],
    add column legacy_replay_backfill_complete boolean not null default false,
    add column legacy_replay_backfill_cutoff_at timestamptz not null default now(),
    add column legacy_replay_backfill_last_run_at timestamptz,
    add column legacy_replay_backfill_completed_at timestamptz,
    add column legacy_replay_backfill_success_count integer not null default 0,
    add column legacy_replay_backfill_unsupported_count integer not null default 0,
    add column legacy_replay_backfill_in_progress boolean not null default false,
    add column legacy_replay_backfill_checkpoint_reviewed_at timestamptz,
    add column legacy_replay_backfill_checkpoint_submission_id uuid,
    add column legacy_replay_backfill_last_run_completed_at timestamptz;

alter table public.payment_settings
    add constraint payment_settings_verification_name_check
        check (length(btrim(verification_recipient_name)) between 1 and 120),
    add constraint payment_settings_verification_destination_check
        check (
            cardinality(verification_destination_suffixes) between 1 and 8
            and verification_destination_suffixes <@ array['1853', '853']::text[]
        ),
    add constraint payment_settings_legacy_replay_counts_check
        check (
            legacy_replay_backfill_success_count >= 0
            and legacy_replay_backfill_unsupported_count >= 0
        );

comment on column public.payment_settings.auto_approval_enabled is
    'Private activation gate for the future service-only auto-approval primitive; M1.3A defaults and deploys this as false.';
comment on column public.payment_settings.verification_recipient_name is
    'Private exact-normalized recipient name used by the M1.3A analyzer; never exposed to customer clients.';
comment on column public.payment_settings.verification_destination_suffixes is
    'Private allowlist of destination tails accepted by deterministic verification; M1.3A defaults to 1853 and 853.';
comment on column public.payment_settings.legacy_replay_backfill_complete is
    'Durable activation fence. Automatic approval must remain unavailable until every pre-M1.3A approved submission has a replay result.';
comment on column public.payment_settings.legacy_replay_backfill_cutoff_at is
    'Migration-time cutoff for the service/operator-only replay backfill; newer approvals are handled by the live ledger.';
comment on column public.payment_settings.legacy_replay_backfill_in_progress is
    'Durable operator backfill run fence; an interrupted run resumes from its keyset checkpoint.';
comment on column public.payment_settings.legacy_replay_backfill_checkpoint_reviewed_at is
    'Last durably accounted approved submission reviewed_at key for deterministic backfill pagination.';
comment on column public.payment_settings.legacy_replay_backfill_checkpoint_submission_id is
    'Tie-breaker for the deterministic (reviewed_at, submission id) backfill keyset.';

alter table public.payment_submissions
    add column review_source text not null default 'manual';

alter table public.payment_submissions
    add constraint payment_submissions_review_source_check
        check (review_source in ('manual', 'automatic'));

alter table public.payment_submissions
    drop constraint payment_submissions_review_state_check;

alter table public.payment_submissions
    add constraint payment_submissions_review_state_check check (
        (status = 'submitted'
            and reviewed_at is null
            and reviewed_by is null
            and rejection_reason is null
            and review_source = 'manual')
        or
        (status = 'approved'
            and reviewed_at is not null
            and rejection_reason is null
            and (
                (review_source = 'manual' and reviewed_by is not null)
                or (review_source = 'automatic' and reviewed_by is null)
            ))
        or
        (status = 'rejected'
            and reviewed_at is not null
            and reviewed_by is not null
            and rejection_reason is not null
            and length(btrim(rejection_reason)) > 0
            and review_source = 'manual')
    );

-- M1.2's trigger remains the package-access boundary. Extend only its
-- evidence-completeness predicate so a future automatic approval can satisfy
-- the same guard with reviewed_by intentionally null and review_source set to
-- automatic. Manual approval semantics remain unchanged.
create or replace function public.guard_manual_payment_paid_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
    if TG_OP = 'INSERT' then
        if new.status is distinct from 'paid'
           or new.payment_provider is distinct from 'promptpay_manual'
        then
            return new;
        end if;
    elsif new.status is distinct from 'paid' then
        return new;
    elsif old.status is not distinct from 'paid'
          and old.payment_provider is not distinct from 'promptpay_manual'
    then
        return new;
    elsif old.payment_provider is distinct from 'promptpay_manual'
          and new.payment_provider is distinct from 'promptpay_manual'
    then
        return new;
    end if;

    if not exists (
        select 1
        from public.payment_submissions ps
        where ps.order_id = new.id
          and ps.payment_method = 'promptpay_manual'
          and ps.status = 'approved'
          and ps.reviewed_at is not null
          and ps.rejection_reason is null
          and (
              (ps.review_source = 'manual' and ps.reviewed_by is not null)
              or (ps.review_source = 'automatic' and ps.reviewed_by is null)
          )
    ) then
        raise exception using
            errcode = '42501',
            message = 'A manual PromptPay order requires approved payment evidence.';
    end if;

    return new;
end
$function$;

comment on function public.guard_manual_payment_paid_transition() is
    'Prevents a promptpay_manual order from becoming paid without complete manual or automatic approved payment evidence for the same order.';

-- ---------------------------------------------------------------------------
-- Durable verification row. It is intentionally separate from orders.status.
-- ---------------------------------------------------------------------------

create table public.payment_verifications (
    id uuid primary key default extensions.uuid_generate_v4(),
    submission_id uuid not null unique references public.payment_submissions(id) on delete restrict,
    order_id uuid not null references public.orders(id) on delete restrict,
    state text not null check (state in (
        'AUTO_CHECKING',
        'STRONG_MATCH',
        'MANUAL_REVIEW',
        'SUSPICIOUS',
        'ANALYZER_ERROR',
        'AUTO_APPROVED',
        'APPROVED_MANUAL',
        'REJECTED_MANUAL'
    )),
    decision text check (decision in ('STRONG_MATCH', 'MANUAL_REVIEW', 'SUSPICIOUS', 'ANALYZER_ERROR')),
    analyzer_version text not null check (length(btrim(analyzer_version)) between 1 and 80),
    attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 20),
    lease_token uuid,
    lease_expires_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    detected_amount numeric,
    amount_match_state text not null default 'UNKNOWN'
        check (amount_match_state in ('MATCH', 'MISMATCH', 'UNKNOWN', 'AMBIGUOUS')),
    recipient_match_state text not null default 'UNKNOWN'
        check (recipient_match_state in ('MATCH', 'MISMATCH', 'UNKNOWN', 'AMBIGUOUS')),
    destination_match_state text not null default 'UNKNOWN'
        check (destination_match_state in ('MATCH', 'MISMATCH', 'UNKNOWN', 'AMBIGUOUS')),
    qr_kind text check (qr_kind is null or qr_kind in ('PAYMENT_REQUEST', 'SLIP_VERIFICATION', 'UNKNOWN')),
    qr_structure_valid boolean,
    qr_crc_valid boolean,
    reference_extracted boolean not null default false,
    qr_format text check (qr_format is null or length(qr_format) <= 80),
    reference_state text not null default 'UNKNOWN'
        check (reference_state in ('VALID_UNIQUE', 'DUPLICATE_APPROVED', 'UNKNOWN', 'AMBIGUOUS')),
    reference_fingerprint text check (reference_fingerprint is null or length(reference_fingerprint) <= 160),
    raw_image_hash text check (raw_image_hash is null or length(raw_image_hash) <= 160),
    normalized_image_hash text check (normalized_image_hash is null or length(normalized_image_hash) <= 160),
    perceptual_hash text check (perceptual_hash is null or length(perceptual_hash) <= 160),
    image_duplicate_state text not null default 'NONE'
        check (image_duplicate_state in ('NONE', 'EXACT_APPROVED', 'NORMALIZED_APPROVED', 'NEAR_MATCH')),
    timestamp_state text not null default 'UNKNOWN'
        check (timestamp_state in ('VALID', 'UNKNOWN', 'ABNORMAL')),
    suspicious boolean not null default false,
    reason_codes text[] not null default array[]::text[]
        check (cardinality(reason_codes) <= 24),
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.payment_verifications is
    'One bounded, structured M1.3A analyzer result per payment submission; never stores raw OCR text or full QR payloads.';
comment on column public.payment_verifications.state is
    'Analyzer lifecycle state, independent from public.orders.status and payment_submissions.status.';
comment on column public.payment_verifications.reference_fingerprint is
    'Cryptographic reference identity; raw reference text is deliberately not retained.';
comment on column public.payment_verifications.reason_codes is
    'Bounded deterministic reason codes safe for operator QA; never raw OCR or payload content.';

drop trigger if exists handle_updated_at_payment_verifications on public.payment_verifications;
create trigger handle_updated_at_payment_verifications
    before update on public.payment_verifications
    for each row execute procedure public.handle_updated_at();

create index payment_verifications_state_updated_at_idx
    on public.payment_verifications (state, updated_at desc);
create index payment_verifications_order_id_idx
    on public.payment_verifications (order_id, created_at desc);
create index payment_verifications_reason_codes_idx
    on public.payment_verifications using gin (reason_codes);

-- ---------------------------------------------------------------------------
-- Durable authoritative provider attestation. M1.3A has no provider adapter,
-- so no normal application role can insert this table. The future provider
-- verifier must insert a bounded attestation through an explicitly reviewed
-- trusted path; offline OCR/QR analysis can only remain NOT_CHECKED.
-- ---------------------------------------------------------------------------

create table public.payment_provider_attestations (
    id uuid primary key default extensions.uuid_generate_v4(),
    verification_id uuid not null references public.payment_verifications(id) on delete restrict,
    submission_id uuid not null references public.payment_submissions(id) on delete restrict,
    order_id uuid not null references public.orders(id) on delete restrict,
    provider text not null check (provider in ('promptpay_authoritative')),
    method text not null check (method in ('promptpay_provider_api_v1')),
    status text not null check (status in ('NOT_CHECKED', 'VERIFIED', 'FAILED', 'UNAVAILABLE')),
    transaction_reference_fingerprint text
        check (transaction_reference_fingerprint is null or transaction_reference_fingerprint ~ '^hmac-sha256:v1:[0-9a-f]{64}$'),
    transaction_amount numeric,
    recipient_name text check (recipient_name is null or length(btrim(recipient_name)) between 1 and 120),
    destination_suffix text check (destination_suffix is null or destination_suffix ~ '^[0-9]{3,20}$'),
    -- The provider method must return a canonical, provider-namespaced
    -- transaction identity. It is intentionally bounded and immutable; a
    -- provider adapter must normalize/hash any sensitive upstream value
    -- before writing it here.
    provider_transaction_identity text
        check (
            provider_transaction_identity is null
            or (
                length(btrim(provider_transaction_identity)) between 1 and 200
                and provider_transaction_identity = btrim(provider_transaction_identity)
            )
        ),
    provider_transaction_at timestamptz,
    provider_verified_at timestamptz,
    valid_until timestamptz,
    created_at timestamptz not null default now(),
    constraint payment_provider_attestation_verified_fields_check check (
        status <> 'VERIFIED'
        or (
            transaction_reference_fingerprint is not null
            and transaction_amount is not null
            and transaction_amount > 0
            and provider_transaction_identity is not null
            and provider_transaction_at is not null
            and provider_verified_at is not null
            and valid_until is not null
        )
    ),
    constraint payment_provider_attestation_temporal_check check (
        (provider_transaction_at is null or provider_verified_at is null or provider_verified_at >= provider_transaction_at)
        and (valid_until is null or provider_verified_at is null or valid_until > provider_verified_at)
    )
);

comment on table public.payment_provider_attestations is
    'Private durable transaction-existence attestations. Only an explicitly trusted provider-verification path may create VERIFIED; M1.3A ships no such application path. VERIFIED rows require the promptpay_provider_api_v1 validity contract.';
comment on column public.payment_provider_attestations.transaction_reference_fingerprint is
    'Versioned keyed transaction identity only; raw provider references are never stored.';
comment on column public.payment_provider_attestations.provider_transaction_identity is
    'Canonical provider/method transaction namespace key. It is immutable through the append-only boundary and is unique among VERIFIED attestations.';
comment on column public.payment_provider_attestations.provider_transaction_at is
    'Provider-reported transaction time. AUTO requires it not to predate the linked order by more than five minutes and rejects future values beyond the same database-clock skew tolerance; this is clock skew only, not a historical-transaction allowance.';
comment on column public.payment_provider_attestations.provider_verified_at is
    'Provider verification time. It must be at or after provider_transaction_at and within the documented database-clock skew tolerance.';
comment on column public.payment_provider_attestations.valid_until is
    'Required validity boundary for VERIFIED promptpay_provider_api_v1 attestations. This is the provider method contract, not a universal business timeout; AUTO rejects expired rows.';
comment on column public.payment_provider_attestations.created_at is
    'Attestation creation time. AUTO requires it to be no earlier than the linked order and submission identities.';

create index payment_provider_attestations_lookup_idx
    on public.payment_provider_attestations (verification_id, status, provider_verified_at desc, id desc);

-- DB-backed idempotency boundary: FAILED/UNAVAILABLE attempts may repeat, but
-- one provider + method + canonical transaction identity can have only one
-- VERIFIED attestation. A retry must treat the uniqueness conflict as the
-- already-recorded authoritative result after checking the same linkage; it
-- can never create a second consumable attestation.
create unique index payment_provider_attestations_verified_transaction_key
    on public.payment_provider_attestations (provider, method, provider_transaction_identity)
    where status = 'VERIFIED';

create function public.prevent_payment_provider_attestation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
    raise exception using
        errcode = '42501',
        message = 'Provider attestations are append-only.';
end
$function$;

create trigger payment_provider_attestations_append_only
    before update or delete on public.payment_provider_attestations
    for each row execute function public.prevent_payment_provider_attestation_mutation();

-- ---------------------------------------------------------------------------
-- Canonical approval ledger. Partial uniqueness prevents approved replay while
-- allowing legitimate manual PDFs/legacy reviews with no machine reference.
-- ---------------------------------------------------------------------------

create table public.approved_payment_evidence (
    id uuid primary key default extensions.uuid_generate_v4(),
    order_id uuid not null unique references public.orders(id) on delete restrict,
    submission_id uuid not null unique references public.payment_submissions(id) on delete restrict,
    verification_id uuid references public.payment_verifications(id) on delete set null,
    reference_fingerprint text,
    raw_image_hash text,
    normalized_image_hash text,
    perceptual_hash text,
    approval_source text not null check (approval_source in ('manual', 'automatic', 'legacy')),
    approved_by uuid references public.profiles(id) on delete restrict,
    approved_at timestamptz not null default now(),
    constraint approved_payment_evidence_machine_identity_check check (
        approval_source = 'manual'
        or (
            reference_fingerprint is not null
            and raw_image_hash is not null
            and normalized_image_hash is not null
        )
    )
);

comment on table public.approved_payment_evidence is
    'Append-only replay-protection ledger for evidence actually used in a paid approval; rejected/submitted rows never claim an identity.';

create unique index approved_payment_evidence_reference_key
    on public.approved_payment_evidence (reference_fingerprint)
    where reference_fingerprint is not null;
create unique index approved_payment_evidence_raw_image_key
    on public.approved_payment_evidence (raw_image_hash)
    where raw_image_hash is not null;
create unique index approved_payment_evidence_normalized_image_key
    on public.approved_payment_evidence (normalized_image_hash)
    where normalized_image_hash is not null;

create index approved_payment_evidence_perceptual_hash_scan_idx
    on public.approved_payment_evidence (approved_at desc, id desc)
    where perceptual_hash is not null;

-- ---------------------------------------------------------------------------
-- Service/operator-only replay backfill results. Unsupported and unreadable
-- legacy evidence is recorded explicitly and keeps the activation fence down.
-- ---------------------------------------------------------------------------

create table public.payment_verification_legacy_backfill_results (
    submission_id uuid primary key references public.payment_submissions(id) on delete restrict,
    order_id uuid not null references public.orders(id) on delete restrict,
    status text not null check (status in (
        'BACKFILLED',
        'PDF_MANUAL_ONLY',
        'MISSING_OBJECT',
        'UNSUPPORTED_REFERENCE',
        'UNREADABLE_EVIDENCE',
        'ANALYZER_ERROR'
    )),
    reference_fingerprint text check (reference_fingerprint is null or length(reference_fingerprint) <= 160),
    raw_image_hash text check (raw_image_hash is null or length(raw_image_hash) <= 160),
    normalized_image_hash text check (normalized_image_hash is null or length(normalized_image_hash) <= 160),
    perceptual_hash text check (perceptual_hash is null or length(perceptual_hash) <= 160),
    reason_code text check (reason_code is null or length(reason_code) between 1 and 120),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payment_verification_legacy_backfill_machine_identity_check check (
        status <> 'BACKFILLED'
        or (
            reference_fingerprint is not null
            and raw_image_hash is not null
            and normalized_image_hash is not null
        )
    )
);

comment on table public.payment_verification_legacy_backfill_results is
    'Private, idempotent operator ledger for pre-M1.3A approved evidence replay; unsupported/missing/PDF evidence is explicit and never silently activated.';

create index payment_verification_legacy_backfill_status_idx
    on public.payment_verification_legacy_backfill_results (status, updated_at desc);

-- ---------------------------------------------------------------------------
-- Append-only verification audit trail.
-- ---------------------------------------------------------------------------

create table public.payment_verification_events (
    id uuid primary key default extensions.uuid_generate_v4(),
    verification_id uuid references public.payment_verifications(id) on delete restrict,
    submission_id uuid not null references public.payment_submissions(id) on delete restrict,
    order_id uuid not null references public.orders(id) on delete restrict,
    event_type text not null check (event_type in (
        'verification_created',
        'analysis_started',
        'analysis_lease_recovered',
        'strong_match',
        'manual_review',
        'suspicious',
        'analyzer_error',
        'auto_approval_attempted',
        'auto_approved',
        'manually_approved',
        'manually_rejected'
    )),
    actor_kind text not null check (actor_kind in ('system', 'user', 'admin')),
    actor_id uuid references public.profiles(id) on delete restrict,
    reason_codes text[] not null default array[]::text[] check (cardinality(reason_codes) <= 24),
    created_at timestamptz not null default now()
);

comment on table public.payment_verification_events is
    'Append-only M1.3A analyzer/manual decision audit events; not a customer-facing notification or access authority.';

create index payment_verification_events_submission_created_idx
    on public.payment_verification_events (submission_id, created_at desc);
create index payment_verification_events_type_created_idx
    on public.payment_verification_events (event_type, created_at desc);

create or replace function public.prevent_payment_verification_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
    raise exception using
        errcode = '42501',
        message = 'Payment verification events are append-only.';
end
$function$;

create trigger payment_verification_events_append_only
    before update or delete on public.payment_verification_events
    for each row execute function public.prevent_payment_verification_event_mutation();

-- ---------------------------------------------------------------------------
-- RLS and grants. No client role can forge a verification result or ledger row.
-- ---------------------------------------------------------------------------

alter table public.payment_verifications enable row level security;
alter table public.payment_provider_attestations enable row level security;
alter table public.approved_payment_evidence enable row level security;
alter table public.payment_verification_events enable row level security;
alter table public.payment_verification_legacy_backfill_results enable row level security;

revoke all on table public.payment_verifications from public, anon, authenticated, service_role;
revoke all on table public.payment_provider_attestations from public, anon, authenticated, service_role;
revoke all on table public.approved_payment_evidence from public, anon, authenticated, service_role;
revoke all on table public.payment_verification_events from public, anon, authenticated, service_role;
revoke all on table public.payment_verification_legacy_backfill_results from public, anon, authenticated, service_role;

grant select on table public.approved_payment_evidence to authenticated;
grant select on table public.payment_verification_events to authenticated;
grant select on table public.payment_verifications to service_role;
-- The analyzer service may read the replay ledger, but it receives no direct
-- mutation privilege; writes remain inside the security-definer approval RPC.
grant select on table public.approved_payment_evidence to service_role;

create policy payment_verifications_manager_select
    on public.payment_verifications for select
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('owner', 'admin')
              and p.status = 'active'
              and p.deleted_at is null
        )
    );

create policy approved_payment_evidence_manager_select
    on public.approved_payment_evidence for select
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('owner', 'admin')
              and p.status = 'active'
              and p.deleted_at is null
        )
    );

create policy payment_verification_events_manager_select
    on public.payment_verification_events for select
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('owner', 'admin')
              and p.status = 'active'
              and p.deleted_at is null
        )
    );

revoke all on function public.prevent_payment_verification_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.prevent_payment_provider_attestation_mutation() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Service-only lease acquisition. A lease is durable and recoverable; no
-- request-lifecycle callback is used as the authority.
-- ---------------------------------------------------------------------------

create or replace function public.start_payment_verification(
    p_submission_id uuid,
    p_lease_token uuid,
    p_force boolean default false
)
returns table (
    verification_id uuid,
    order_id uuid,
    state text,
    decision text,
    lease_acquired boolean,
    attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_submission_order_id uuid;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_verification_id uuid;
    v_state text;
    v_decision text;
    v_attempt_count integer;
    v_lease_expires_at timestamptz;
    v_previous_state text;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using
            errcode = '42501',
            message = 'Payment verification is service-only.';
    end if;

    if p_submission_id is null or p_lease_token is null then
        raise exception using
            errcode = '22023',
            message = 'A submission and lease token are required.';
    end if;

    select ps.order_id, ps.status, o.status, o.payment_provider
    into v_submission_order_id, v_submission_status, v_order_status, v_payment_provider
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Payment submission not found.';
    end if;

    insert into public.payment_verifications (
        submission_id,
        order_id,
        state,
        decision,
        analyzer_version,
        attempt_count,
        started_at
    ) values (
        p_submission_id,
        v_submission_order_id,
        'AUTO_CHECKING',
        null,
        'm1.3a-shadow-1',
        0,
        now()
    )
    on conflict (submission_id) do nothing;

    select pv.id, pv.state, pv.decision, pv.attempt_count, pv.lease_expires_at
    into v_verification_id, v_state, v_decision, v_attempt_count, v_lease_expires_at
    from public.payment_verifications pv
    where pv.submission_id = p_submission_id
    for update;

    if v_state in ('AUTO_APPROVED', 'APPROVED_MANUAL', 'REJECTED_MANUAL') then
        return query select v_verification_id, v_submission_order_id, v_state, v_decision, false, v_attempt_count;
        return;
    end if;

    -- A completed analyzer result is durable and replayable. Normal upload
    -- retries return it without running OCR again; the explicitly authorized
    -- admin resume action passes p_force=true for a fresh shadow attempt.
    if not coalesce(p_force, false)
       and v_state in ('STRONG_MATCH', 'MANUAL_REVIEW', 'SUSPICIOUS', 'ANALYZER_ERROR')
    then
        return query select v_verification_id, v_submission_order_id, v_state, v_decision, false, v_attempt_count;
        return;
    end if;

    if v_lease_expires_at is not null and v_lease_expires_at > now() then
        return query select v_verification_id, v_submission_order_id, v_state, v_decision, false, v_attempt_count;
        return;
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        return query select v_verification_id, v_submission_order_id, v_state, v_decision, false, v_attempt_count;
        return;
    end if;

    if v_attempt_count >= 20 then
        update public.payment_verifications
        set state = 'ANALYZER_ERROR',
            decision = 'ANALYZER_ERROR',
            completed_at = coalesce(completed_at, now()),
            lease_token = null,
            lease_expires_at = null,
            reason_codes = array['ANALYZER_RETRY_LIMIT']::text[]
        where id = v_verification_id;

        if not exists (
            select 1
            from public.payment_verification_events pve
            where pve.verification_id = v_verification_id
              and pve.event_type = 'analyzer_error'
              and pve.reason_codes = array['ANALYZER_RETRY_LIMIT']::text[]
        ) then
            insert into public.payment_verification_events (
                verification_id, submission_id, order_id, event_type, actor_kind, reason_codes
            ) values (
                v_verification_id, p_submission_id, v_submission_order_id,
                'analyzer_error', 'system', array['ANALYZER_RETRY_LIMIT']::text[]
            );
        end if;

        return query select v_verification_id, v_submission_order_id, 'ANALYZER_ERROR'::text, 'ANALYZER_ERROR'::text, false, v_attempt_count;
        return;
    end if;

    v_previous_state := v_state;
    update public.payment_verifications as pv
    set state = 'AUTO_CHECKING',
        decision = null,
        attempt_count = pv.attempt_count + 1,
        lease_token = p_lease_token,
        lease_expires_at = now() + interval '5 minutes',
        started_at = now(),
        completed_at = null,
        updated_at = now()
    where pv.id = v_verification_id;

    if v_attempt_count = 0 then
        insert into public.payment_verification_events (
            verification_id, submission_id, order_id, event_type, actor_kind
        ) values (
            v_verification_id, p_submission_id, v_submission_order_id, 'verification_created', 'system'
        );
    elsif v_previous_state = 'AUTO_CHECKING' then
        insert into public.payment_verification_events (
            verification_id, submission_id, order_id, event_type, actor_kind, reason_codes
        ) values (
            v_verification_id, p_submission_id, v_submission_order_id, 'analysis_lease_recovered', 'system', array['LEASE_EXPIRED']::text[]
        );
    end if;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind
    ) values (
        v_verification_id, p_submission_id, v_submission_order_id, 'analysis_started', 'system'
    );

    return query select v_verification_id, v_submission_order_id, 'AUTO_CHECKING'::text, null::text, true, v_attempt_count + 1;
end
$function$;

comment on function public.start_payment_verification(uuid, uuid, boolean) is
    'Service-only, lease-based analyzer claim; expired leases can be recovered without a durable queue.';

-- ---------------------------------------------------------------------------
-- Service-only result persistence. JSON is used only as a bounded internal
-- transport; every stored field is separately constrained by the table.
-- ---------------------------------------------------------------------------

create or replace function public.complete_payment_verification(
    p_verification_id uuid,
    p_lease_token uuid,
    p_result jsonb
)
returns table (
    verification_id uuid,
    order_id uuid,
    state text,
    decision text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_submission_id uuid;
    v_order_id uuid;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_state text;
    v_decision text;
    v_lease_token uuid;
    v_lease_expires_at timestamptz;
    v_amount numeric;
    v_reasons text[];
    v_event_type text;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using
            errcode = '42501',
            message = 'Payment verification is service-only.';
    end if;

    select pv.submission_id, pv.order_id, pv.state, pv.lease_token, pv.lease_expires_at
    into v_submission_id, v_order_id, v_state, v_lease_token, v_lease_expires_at
    from public.payment_verifications pv
    where pv.id = p_verification_id
    for update;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Payment verification not found.';
    end if;

    if v_lease_token is distinct from p_lease_token
       or v_lease_expires_at is null
       or v_lease_expires_at <= now()
    then
        return query select p_verification_id, v_order_id, v_state, null::text;
        return;
    end if;

    select ps.status, o.status, o.payment_provider, o.amount
    into v_submission_status, v_order_status, v_payment_provider, v_amount
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = v_submission_id
    for update of ps, o;

    if not found then
        raise exception using
            errcode = '22023',
            message = 'Payment submission disappeared during analysis.';
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        v_state := case
            when v_submission_status = 'rejected' then 'REJECTED_MANUAL'
            when v_submission_status = 'approved' then 'APPROVED_MANUAL'
            else 'MANUAL_REVIEW'
        end;

        update public.payment_verifications
        set state = v_state,
            decision = case when v_state = 'MANUAL_REVIEW' then 'MANUAL_REVIEW' else null end,
            lease_token = null,
            lease_expires_at = null,
            completed_at = now(),
            reason_codes = array['ANALYSIS_STALE_PAYMENT_STATE']::text[],
            updated_at = now()
        where id = p_verification_id;

        return query select p_verification_id, v_order_id, v_state, case when v_state = 'MANUAL_REVIEW' then 'MANUAL_REVIEW' else null end;
        return;
    end if;

    v_decision := upper(coalesce(p_result ->> 'decision', p_result ->> 'state', 'ANALYZER_ERROR'));
    if v_decision not in ('STRONG_MATCH', 'MANUAL_REVIEW', 'SUSPICIOUS', 'ANALYZER_ERROR') then
        v_decision := 'ANALYZER_ERROR';
    end if;

    select coalesce(array_agg(value order by ordinality), array[]::text[])
    into v_reasons
    from jsonb_array_elements_text(case when jsonb_typeof(p_result -> 'reasonCodes') = 'array' then p_result -> 'reasonCodes' else '[]'::jsonb end)
         with ordinality as reason(value, ordinality)
    where length(btrim(value)) between 1 and 80;

    v_reasons := (v_reasons)[1:24];

    v_amount := nullif(p_result ->> 'detectedAmount', '')::numeric;

    update public.payment_verifications
    set state = v_decision,
        decision = v_decision,
        analyzer_version = left(coalesce(nullif(p_result ->> 'analyzerVersion', ''), 'm1.3a-shadow-1'), 80),
        lease_token = null,
        lease_expires_at = null,
        completed_at = now(),
        detected_amount = v_amount,
        amount_match_state = coalesce(nullif(p_result ->> 'amountMatchState', ''), 'UNKNOWN'),
        recipient_match_state = coalesce(nullif(p_result ->> 'recipientMatchState', ''), 'UNKNOWN'),
        destination_match_state = coalesce(nullif(p_result ->> 'destinationMatchState', ''), 'UNKNOWN'),
        qr_kind = nullif(p_result ->> 'qrKind', ''),
        qr_structure_valid = case
            when p_result ? 'qrStructureValid' then (p_result ->> 'qrStructureValid')::boolean
            else null
        end,
        qr_crc_valid = case
            when p_result ? 'qrCrcValid' then (p_result ->> 'qrCrcValid')::boolean
            else null
        end,
        reference_extracted = coalesce((p_result ->> 'referenceExtracted')::boolean, false),
        qr_format = nullif(left(coalesce(p_result ->> 'qrFormat', ''), 80), ''),
        reference_state = coalesce(nullif(p_result ->> 'referenceState', ''), 'UNKNOWN'),
        reference_fingerprint = nullif(left(coalesce(p_result ->> 'referenceFingerprint', ''), 160), ''),
        raw_image_hash = nullif(left(coalesce(p_result ->> 'rawImageHash', ''), 160), ''),
        normalized_image_hash = nullif(left(coalesce(p_result ->> 'normalizedImageHash', ''), 160), ''),
        perceptual_hash = nullif(left(coalesce(p_result ->> 'perceptualHash', ''), 160), ''),
        image_duplicate_state = coalesce(nullif(p_result ->> 'imageDuplicateState', ''), 'NONE'),
        timestamp_state = coalesce(nullif(p_result ->> 'timestampState', ''), 'UNKNOWN'),
        suspicious = coalesce((p_result ->> 'suspicious')::boolean, v_decision = 'SUSPICIOUS'),
        reason_codes = v_reasons,
        duration_ms = nullif(p_result ->> 'durationMs', '')::integer,
        updated_at = now()
    where id = p_verification_id;

    v_event_type := case v_decision
        when 'STRONG_MATCH' then 'strong_match'
        when 'MANUAL_REVIEW' then 'manual_review'
        when 'SUSPICIOUS' then 'suspicious'
        else 'analyzer_error'
    end;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind, reason_codes
    ) values (
        p_verification_id, v_submission_id, v_order_id, v_event_type, 'system', v_reasons
    );

    return query select p_verification_id, v_order_id, v_decision, v_decision;
end
$function$;

comment on function public.complete_payment_verification(uuid, uuid, jsonb) is
    'Service-only, lease-bound persistence of bounded analyzer output; stale analyzers cannot overwrite manual state.';

-- ---------------------------------------------------------------------------
-- Future auto-approval primitive. It is deliberately disabled by the default
-- setting and is not called by the shadow application unless enabled later.
-- ---------------------------------------------------------------------------

create or replace function public.auto_approve_payment_verification(
    p_verification_id uuid
)
returns table (
    verification_id uuid,
    order_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_submission_id uuid;
    v_order_id uuid;
    v_state text;
    v_decision text;
    v_analyzer_version text;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_order_amount numeric;
    v_detected_amount numeric;
    v_qr_format text;
    v_reference_fingerprint text;
    v_raw_image_hash text;
    v_normalized_image_hash text;
    v_perceptual_hash text;
    v_recipient_match_state text;
    v_destination_match_state text;
    v_amount_match_state text;
    v_qr_structure_valid boolean;
    v_qr_crc_valid boolean;
    v_reference_state text;
    v_image_duplicate_state text;
    v_suspicious boolean;
    v_auto_approval_enabled boolean;
    v_legacy_replay_backfill_complete boolean;
    v_verification_recipient_name text;
    v_verification_destination_suffixes text[];
    v_provider_attestation_id uuid;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using
            errcode = '42501',
            message = 'Automatic approval is service-only.';
    end if;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind
    )
    select pv.id, pv.submission_id, pv.order_id, 'auto_approval_attempted', 'system'
    from public.payment_verifications pv
    where pv.id = p_verification_id;

    select ps.id, ps.order_id, pv.state, pv.decision, pv.analyzer_version,
           ps.status, o.status, o.payment_provider, o.amount,
           pv.detected_amount, pv.reference_fingerprint, pv.raw_image_hash,
           pv.normalized_image_hash, pv.perceptual_hash,
           pv.recipient_match_state, pv.destination_match_state,
           pv.amount_match_state, pv.qr_structure_valid, pv.qr_crc_valid, pv.qr_format, pv.reference_state,
           pv.image_duplicate_state, pv.suspicious
    into v_submission_id, v_order_id, v_state, v_decision, v_analyzer_version,
         v_submission_status, v_order_status, v_payment_provider, v_order_amount,
         v_detected_amount, v_reference_fingerprint, v_raw_image_hash,
         v_normalized_image_hash, v_perceptual_hash,
         v_recipient_match_state, v_destination_match_state,
         v_amount_match_state, v_qr_structure_valid, v_qr_crc_valid, v_qr_format, v_reference_state,
         v_image_duplicate_state, v_suspicious
    from public.payment_verifications pv
    join public.payment_submissions ps on ps.id = pv.submission_id
    join public.orders o on o.id = pv.order_id
    where pv.id = p_verification_id
    for update of pv, ps, o;

    if not found then
        raise exception using errcode = '22023', message = 'Payment verification not found.';
    end if;

    if v_state = 'AUTO_APPROVED' and v_submission_status = 'approved' and v_order_status = 'paid' then
        return query select p_verification_id, v_order_id, 'approved'::text;
        return;
    end if;

    -- Serialize the activation gate with approval. A concurrent disable can
    -- wait for this row lock, but cannot race past a stale false/true read.
    select ps.auto_approval_enabled,
           ps.legacy_replay_backfill_complete,
           ps.verification_recipient_name,
           ps.verification_destination_suffixes
    into v_auto_approval_enabled,
         v_legacy_replay_backfill_complete,
         v_verification_recipient_name,
         v_verification_destination_suffixes
    from public.payment_settings ps
    where ps.id = 1
    for update;

    if v_auto_approval_enabled is distinct from true
       or v_legacy_replay_backfill_complete is distinct from true
    then
        raise exception using errcode = '55000', message = 'Automatic approval is disabled.';
    end if;

    select pa.id
    into v_provider_attestation_id
    from public.payment_provider_attestations pa
    where pa.verification_id = p_verification_id
      and pa.submission_id = v_submission_id
      and pa.order_id = v_order_id
      and pa.provider = 'promptpay_authoritative'
      and pa.method = 'promptpay_provider_api_v1'
      and pa.status = 'VERIFIED'
      and pa.provider_transaction_identity is not null
      and pa.transaction_reference_fingerprint = v_reference_fingerprint
      and pa.transaction_amount = v_order_amount
      and pa.provider_transaction_at is not null
      and pa.provider_verified_at is not null
      and pa.valid_until is not null
      and pa.valid_until > now()
      -- This is clock-skew tolerance only. Staleness is governed by the
      -- provider method's durable valid_until contract above.
      -- Compare transaction age with order creation, not submission/upload
      -- creation: delayed uploads may arrive hours or the next day later.
      and pa.provider_transaction_at >= (
        select o.created_at - interval '5 minutes'
        from public.orders o
        where o.id = v_order_id
      )
      and pa.provider_transaction_at <= now() + interval '5 minutes'
      and pa.provider_verified_at <= now() + interval '5 minutes'
      and pa.provider_verified_at >= pa.provider_transaction_at
      and pa.created_at >= (select o.created_at from public.orders o where o.id = v_order_id)
      and pa.created_at >= (select ps.created_at from public.payment_submissions ps where ps.id = v_submission_id)
      and (pa.recipient_name is null or btrim(pa.recipient_name) = btrim(v_verification_recipient_name))
      and (pa.destination_suffix is null or pa.destination_suffix = any(v_verification_destination_suffixes))
    order by pa.provider_verified_at desc, pa.id desc
    limit 1;

    if v_state <> 'STRONG_MATCH'
       or v_decision <> 'STRONG_MATCH'
       or v_analyzer_version <> 'm1.3a-shadow-1'
       or v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
       or v_detected_amount is null
       or v_order_amount is distinct from v_detected_amount
       or v_amount_match_state <> 'MATCH'
       or v_recipient_match_state <> 'MATCH'
       or v_destination_match_state <> 'MATCH'
       or v_qr_structure_valid is distinct from true
       or v_qr_crc_valid is distinct from true
       or v_qr_format is null
       or v_qr_format not in ('BANK_SLIP_VERIFY', 'TRUEMONEY_SLIP_VERIFY')
       or v_reference_state <> 'VALID_UNIQUE'
       or v_image_duplicate_state <> 'NONE'
       or v_suspicious
       or v_reference_fingerprint is null
       or v_reference_fingerprint !~ '^hmac-sha256:v1:[0-9a-f]{64}$'
       or v_raw_image_hash is null
       or v_normalized_image_hash is null
       or v_provider_attestation_id is null
       or not exists (
           select 1
           from storage.objects so
           where so.bucket_id = 'payment-slips'
             and so.name = (select ps.storage_object_path from public.payment_submissions ps where ps.id = v_submission_id)
       )
    then
        raise exception using errcode = '40001', message = 'Verification is not eligible for automatic approval.';
    end if;

    if exists (
        select 1
        from public.approved_payment_evidence ape
        where ape.reference_fingerprint = v_reference_fingerprint
           or ape.raw_image_hash = v_raw_image_hash
           or ape.normalized_image_hash = v_normalized_image_hash
    ) then
        raise exception using errcode = '23505', message = 'Approved payment evidence already claims this reference or image.';
    end if;

    insert into public.approved_payment_evidence (
        order_id,
        submission_id,
        verification_id,
        reference_fingerprint,
        raw_image_hash,
        normalized_image_hash,
        perceptual_hash,
        approval_source,
        approved_by
    ) values (
        v_order_id,
        v_submission_id,
        p_verification_id,
        v_reference_fingerprint,
        v_raw_image_hash,
        v_normalized_image_hash,
        v_perceptual_hash,
        'automatic',
        null
    );

    update public.payment_submissions
    set status = 'approved',
        review_source = 'automatic',
        reviewed_at = now(),
        reviewed_by = null,
        rejection_reason = null
    where id = v_submission_id;

    update public.orders as payment_order
    set status = 'paid'
    where payment_order.id = v_order_id
      and payment_order.status = 'pending'
      and payment_order.payment_provider = 'promptpay_manual';

    if not found then
        raise exception using errcode = '40001', message = 'The order changed before automatic approval could commit.';
    end if;

    update public.payment_verifications
    set state = 'AUTO_APPROVED',
        decision = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = p_verification_id;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind
    ) values (
        p_verification_id, v_submission_id, v_order_id, 'auto_approved', 'system'
    );

    perform public.try_create_package_approved_notification(v_order_id);

    return query select p_verification_id, v_order_id, 'approved'::text;
end
$function$;

comment on function public.auto_approve_payment_verification(uuid) is
    'Dedicated, atomic, idempotent service-only approval primitive; M1.3A shadow configuration keeps this disabled.';

-- ---------------------------------------------------------------------------
-- Manual approval/rejection replacements. Signatures and return shapes stay
-- compatible with M1.2; approved evidence is ledgered only at approval time.
-- ---------------------------------------------------------------------------

create or replace function public.approve_payment_submission(
    p_submission_id uuid
)
returns table (
    payment_submission_id uuid,
    order_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_submission_id uuid;
    v_order_id uuid;
    v_verification_id uuid;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_order_user_id uuid;
    v_order_package_id uuid;
    v_completed_order_id uuid;
    v_verification_state text;
begin
    v_actor_id := auth.uid();
    if v_actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required.';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.role in ('owner', 'admin')
          and p.status = 'active' and p.deleted_at is null
    ) then
        raise exception using errcode = '42501', message = 'Financial manager permission is required.';
    end if;

    select ps.order_id into v_order_id
    from public.payment_submissions ps
    where ps.id = p_submission_id;
    if not found then
        raise exception using errcode = '22023', message = 'Payment submission not found.';
    end if;

    insert into public.payment_verifications (
        submission_id, order_id, state, analyzer_version, completed_at
    ) values (
        p_submission_id, v_order_id, 'APPROVED_MANUAL', 'legacy-manual-m1.3a', now()
    ) on conflict (submission_id) do nothing;

    -- Every approval path locks verification first, then submission/order. The
    -- analyzer and future automatic primitive use the same order.
    select pv.id, pv.state
    into v_verification_id, v_verification_state
    from public.payment_verifications pv
    where pv.submission_id = p_submission_id
    for update;

    select ps.id, ps.order_id, ps.status, o.status, o.payment_provider,
           o.user_id, o.package_id
    into v_submission_id, v_order_id, v_submission_status, v_order_status,
         v_payment_provider, v_order_user_id, v_order_package_id
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id
    for update of ps, o;

    if v_submission_status = 'approved' and v_order_status = 'paid' then
        return query select v_submission_id, v_order_id, 'approved'::text;
        return;
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        raise exception using errcode = '40001', message = 'Payment submission is no longer approvable.';
    end if;

    select o.id into v_completed_order_id
    from public.orders o
    where o.user_id = v_order_user_id
      and o.package_id = v_order_package_id
      and o.status in ('paid', 'free')
      and o.id <> v_order_id
    order by o.created_at desc
    limit 1;
    if found then
        raise exception using errcode = '23505', message = 'The user already has package access through another order.';
    end if;

    insert into public.approved_payment_evidence (
        order_id, submission_id, verification_id,
        reference_fingerprint, raw_image_hash, normalized_image_hash,
        perceptual_hash, approval_source, approved_by
    )
    select v_order_id, v_submission_id, v_verification_id,
           pv.reference_fingerprint, pv.raw_image_hash, pv.normalized_image_hash,
           pv.perceptual_hash, 'manual', v_actor_id
    from public.payment_verifications pv
    where pv.id = v_verification_id;

    update public.payment_submissions
    set status = 'approved',
        review_source = 'manual',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        rejection_reason = null
    where id = v_submission_id;

    update public.orders as payment_order
    set status = 'paid'
    where payment_order.id = v_order_id
      and payment_order.status = 'pending'
      and payment_order.payment_provider = 'promptpay_manual';
    if not found then
        raise exception using errcode = '40001', message = 'The order changed before approval could be completed.';
    end if;

    update public.payment_verifications
    set state = 'APPROVED_MANUAL',
        decision = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_verification_id;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind, actor_id
    ) values (
        v_verification_id, v_submission_id, v_order_id, 'manually_approved', 'admin', v_actor_id
    );

    perform public.try_create_package_approved_notification(v_order_id);
    return query select v_submission_id, v_order_id, 'approved'::text;
end
$function$;

create or replace function public.reject_payment_submission(
    p_submission_id uuid,
    p_rejection_reason text
)
returns table (
    payment_submission_id uuid,
    order_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_actor_id uuid;
    v_submission_id uuid;
    v_order_id uuid;
    v_verification_id uuid;
    v_submission_status text;
    v_order_status text;
    v_payment_provider text;
    v_reason text;
begin
    v_actor_id := auth.uid();
    if v_actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required.';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.role in ('owner', 'admin')
          and p.status = 'active' and p.deleted_at is null
    ) then
        raise exception using errcode = '42501', message = 'Financial manager permission is required.';
    end if;

    v_reason := pg_catalog.left(pg_catalog.btrim(coalesce(p_rejection_reason, '')), 1000);
    if length(v_reason) = 0 then
        raise exception using errcode = '22023', message = 'A rejection reason is required.';
    end if;

    select ps.order_id into v_order_id
    from public.payment_submissions ps
    where ps.id = p_submission_id;
    if not found then
        raise exception using errcode = '22023', message = 'Payment submission not found.';
    end if;

    insert into public.payment_verifications (
        submission_id, order_id, state, analyzer_version, completed_at
    ) values (
        p_submission_id, v_order_id, 'REJECTED_MANUAL', 'legacy-manual-m1.3a', now()
    ) on conflict (submission_id) do nothing;

    select pv.id into v_verification_id
    from public.payment_verifications pv
    where pv.submission_id = p_submission_id
    for update;

    select ps.id, ps.order_id, ps.status, o.status, o.payment_provider
    into v_submission_id, v_order_id, v_submission_status, v_order_status, v_payment_provider
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where ps.id = p_submission_id
    for update of ps, o;

    if v_submission_status = 'rejected' then
        perform public.try_create_payment_rejected_notification(v_submission_id);
        return query select v_submission_id, v_order_id, 'rejected'::text;
        return;
    end if;

    if v_submission_status <> 'submitted'
       or v_order_status <> 'pending'
       or v_payment_provider <> 'promptpay_manual'
    then
        raise exception using errcode = '40001', message = 'Payment submission is no longer rejectable.';
    end if;

    update public.payment_submissions
    set status = 'rejected',
        review_source = 'manual',
        reviewed_at = now(),
        reviewed_by = v_actor_id,
        rejection_reason = v_reason
    where id = v_submission_id;

    update public.payment_verifications
    set state = 'REJECTED_MANUAL',
        decision = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_verification_id;

    insert into public.payment_verification_events (
        verification_id, submission_id, order_id, event_type, actor_kind, actor_id, reason_codes
    ) values (
        v_verification_id, v_submission_id, v_order_id, 'manually_rejected', 'admin', v_actor_id, array['MANUAL_REJECTION']::text[]
    );

    perform public.try_create_payment_rejected_notification(v_submission_id);
    return query select v_submission_id, v_order_id, 'rejected'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- Private configuration mutation for a later activation gate. M1.3A does not
-- expose this in the UI; the RPC is service/operator-only and the default
-- remains false.
-- ---------------------------------------------------------------------------

create or replace function public.update_payment_verification_settings(
    p_auto_approval_enabled boolean,
    p_verification_recipient_name text,
    p_verification_destination_suffixes text[]
)
returns table (
    auto_approval_enabled boolean,
    verification_recipient_name text,
    verification_destination_suffixes text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_current_recipient_name text;
    v_current_destination_suffixes text[];
    v_legacy_replay_backfill_complete boolean;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Verification settings are service-only.';
    end if;
    if p_auto_approval_enabled is null
       or p_verification_recipient_name is null
       or length(btrim(p_verification_recipient_name)) not between 1 and 120
       or p_verification_destination_suffixes is null
       or cardinality(p_verification_destination_suffixes) not between 1 and 8
       or not (p_verification_destination_suffixes <@ array['1853', '853']::text[])
    then
        raise exception using errcode = '22023', message = 'Verification settings are invalid.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(7281, 1201);

    select ps.verification_recipient_name,
           ps.verification_destination_suffixes,
           ps.legacy_replay_backfill_complete
    into v_current_recipient_name, v_current_destination_suffixes,
         v_legacy_replay_backfill_complete
    from public.payment_settings ps
    where ps.id = 1
    for update;

    if p_auto_approval_enabled and v_legacy_replay_backfill_complete is distinct from true then
        raise exception using
            errcode = '55000',
            message = 'Automatic approval cannot be enabled until the legacy replay backfill is complete.';
    end if;

    if (
        v_current_recipient_name is distinct from btrim(p_verification_recipient_name)
        or v_current_destination_suffixes is distinct from p_verification_destination_suffixes
    ) and exists (
        select 1
        from public.orders o
        where o.status = 'pending'
          and o.payment_provider = 'promptpay_manual'
    ) then
        raise exception using
            errcode = '55006',
            message = 'Verification recipient settings cannot change while PromptPay orders are pending.';
    end if;

    return query
    update public.payment_settings
    set auto_approval_enabled = p_auto_approval_enabled,
        verification_recipient_name = btrim(p_verification_recipient_name),
        verification_destination_suffixes = p_verification_destination_suffixes,
        updated_by = null
    where id = 1
    returning payment_settings.auto_approval_enabled,
              payment_settings.verification_recipient_name,
              payment_settings.verification_destination_suffixes;
end
$function$;

-- ---------------------------------------------------------------------------
-- Customer-safe status projection. It deliberately returns one coarse value
-- and never exposes verification rows, hashes, fingerprints, reasons, or
-- analyzer metadata to the buyer.
-- ---------------------------------------------------------------------------

create or replace function public.get_payment_verification_customer_status(
    p_submission_id uuid
)
returns table (
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_actor_id uuid := auth.uid();
    v_order_user_id uuid;
    v_order_status text;
    v_verification_state text;
begin
    if v_actor_id is null then
        raise exception using errcode = '42501', message = 'Authentication is required.';
    end if;

    select o.user_id, o.status, pv.state
    into v_order_user_id, v_order_status, v_verification_state
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    left join public.payment_verifications pv on pv.submission_id = ps.id
    where ps.id = p_submission_id;

    if not found or v_order_user_id is distinct from v_actor_id then
        raise exception using errcode = '42501', message = 'Payment submission is not available.';
    end if;

    return query
    select case
        when v_order_status in ('paid', 'free') then 'paid'::text
        when v_verification_state is null or v_verification_state = 'AUTO_CHECKING' then 'checking'::text
        else 'under_review'::text
    end;
end
$function$;

comment on function public.get_payment_verification_customer_status(uuid) is
    'Customer-safe coarse payment status only: checking, under_review, or paid. Never returns verification internals.';

-- ---------------------------------------------------------------------------
-- Service/operator-only pre-M1.3A replay backfill. These functions write the
-- canonical replay ledger plus a private result table and never mutate order
-- entitlement.
-- ---------------------------------------------------------------------------

create or replace function public.start_payment_verification_legacy_backfill()
returns table (
    cutoff_at timestamptz,
    already_complete boolean,
    checkpoint_reviewed_at timestamptz,
    checkpoint_submission_id uuid,
    processed_count integer,
    unresolved_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_cutoff timestamptz;
    v_complete boolean;
    v_in_progress boolean;
    v_checkpoint_reviewed_at timestamptz;
    v_checkpoint_submission_id uuid;
    v_processed_count integer;
    v_unresolved_count integer;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Legacy replay backfill is service-only.';
    end if;

    select ps.legacy_replay_backfill_cutoff_at,
           ps.legacy_replay_backfill_complete,
           ps.legacy_replay_backfill_in_progress,
           ps.legacy_replay_backfill_checkpoint_reviewed_at,
           ps.legacy_replay_backfill_checkpoint_submission_id,
           ps.legacy_replay_backfill_success_count,
           ps.legacy_replay_backfill_unsupported_count
    into v_cutoff, v_complete, v_in_progress, v_checkpoint_reviewed_at,
         v_checkpoint_submission_id, v_processed_count, v_unresolved_count
    from public.payment_settings ps
    where ps.id = 1
    for update;

    if not found then
        raise exception using errcode = '22023', message = 'Payment verification settings are missing.';
    end if;

    if v_complete then
        return query select v_cutoff, true, v_checkpoint_reviewed_at,
            v_checkpoint_submission_id, v_processed_count, v_unresolved_count;
        return;
    end if;

    if not v_in_progress then
        select count(*) filter (where r.status = 'BACKFILLED')::integer,
               count(*) filter (where r.status <> 'BACKFILLED')::integer
        into v_processed_count, v_unresolved_count
        from public.payment_verification_legacy_backfill_results r
        join public.payment_submissions ps on ps.id = r.submission_id
        where ps.status = 'approved'
          and ps.reviewed_at <= v_cutoff;

        update public.payment_settings
        set legacy_replay_backfill_in_progress = true,
            legacy_replay_backfill_checkpoint_reviewed_at = null,
            legacy_replay_backfill_checkpoint_submission_id = null,
            legacy_replay_backfill_success_count = coalesce(v_processed_count, 0),
            legacy_replay_backfill_unsupported_count = coalesce(v_unresolved_count, 0),
            legacy_replay_backfill_last_run_at = now(),
            legacy_replay_backfill_last_run_completed_at = null,
            updated_at = now()
        where id = 1;

        v_checkpoint_reviewed_at := null;
        v_checkpoint_submission_id := null;
        v_processed_count := coalesce(v_processed_count, 0);
        v_unresolved_count := coalesce(v_unresolved_count, 0);
    else
        update public.payment_settings
        set legacy_replay_backfill_last_run_at = now(),
            updated_at = now()
        where id = 1;
    end if;

    return query select v_cutoff, v_complete, v_checkpoint_reviewed_at,
        v_checkpoint_submission_id, v_processed_count, v_unresolved_count;
end
$function$;

create or replace function public.get_payment_verification_legacy_backfill_page(
    p_page_size integer default 100
)
returns table (
    submission_id uuid,
    order_id uuid,
    amount numeric,
    storage_object_path text,
    mime_type text,
    reviewed_at timestamptz,
    backfill_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_cutoff timestamptz;
    v_checkpoint_reviewed_at timestamptz;
    v_checkpoint_submission_id uuid;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Legacy replay backfill is service-only.';
    end if;
    if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
        raise exception using errcode = '22023', message = 'Legacy replay page size must be between 1 and 100.';
    end if;

    select ps.legacy_replay_backfill_cutoff_at,
           ps.legacy_replay_backfill_checkpoint_reviewed_at,
           ps.legacy_replay_backfill_checkpoint_submission_id
    into v_cutoff, v_checkpoint_reviewed_at, v_checkpoint_submission_id
    from public.payment_settings ps
    where ps.id = 1
      and ps.legacy_replay_backfill_in_progress = true
      and ps.legacy_replay_backfill_complete = false
    for update;

    if not found then
        raise exception using errcode = '55000', message = 'Legacy replay backfill is not active.';
    end if;

    return query
    select ps.id,
           ps.order_id,
           o.amount,
           ps.storage_object_path,
           ps.mime_type,
           ps.reviewed_at,
           r.status
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    left join public.payment_verification_legacy_backfill_results r on r.submission_id = ps.id
    where ps.status = 'approved'
      and ps.reviewed_at <= v_cutoff
      and (r.status is null or r.status <> 'BACKFILLED')
      and (
          v_checkpoint_reviewed_at is null
          or ps.reviewed_at > v_checkpoint_reviewed_at
          or (
              ps.reviewed_at = v_checkpoint_reviewed_at
              and ps.id > v_checkpoint_submission_id
          )
      )
    order by ps.reviewed_at asc, ps.id asc
    limit p_page_size;
end
$function$;

create or replace function public.record_payment_verification_legacy_backfill(
    p_submission_id uuid,
    p_status text,
    p_reason_code text,
    p_reference_fingerprint text,
    p_raw_image_hash text,
    p_normalized_image_hash text,
    p_perceptual_hash text
)
returns table (
    backfill_status text,
    ledger_written boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_order_id uuid;
    v_reviewed_at timestamptz;
    v_existing_status text;
    v_ledger_written boolean := false;
    v_reason_code text;
    v_inserted_rows integer;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Legacy replay backfill is service-only.';
    end if;

    if p_status not in (
        'BACKFILLED',
        'PDF_MANUAL_ONLY',
        'MISSING_OBJECT',
        'UNSUPPORTED_REFERENCE',
        'UNREADABLE_EVIDENCE',
        'ANALYZER_ERROR'
    ) then
        raise exception using errcode = '22023', message = 'Invalid legacy replay backfill status.';
    end if;

    select ps.order_id, ps.reviewed_at
    into v_order_id, v_reviewed_at
    from public.payment_submissions ps
    where ps.id = p_submission_id
      and ps.status = 'approved'
      and ps.reviewed_at is not null;
    if not found then
        raise exception using errcode = '22023', message = 'Only approved payment submissions can be replay-backfilled.';
    end if;

    if not exists (
        select 1
        from public.payment_settings ps
        where ps.id = 1
          and ps.legacy_replay_backfill_in_progress = true
          and ps.legacy_replay_backfill_complete = false
    ) then
        raise exception using errcode = '55000', message = 'Legacy replay backfill is not active.';
    end if;

    select r.status
    into v_existing_status
    from public.payment_verification_legacy_backfill_results r
    where r.submission_id = p_submission_id
    for update;

    -- A successful result is immutable for replay purposes. Reruns are safe
    -- and cannot downgrade a ledgered identity to an unsupported result.
    if v_existing_status = 'BACKFILLED' then
        update public.payment_settings
        set legacy_replay_backfill_checkpoint_reviewed_at = case
                when legacy_replay_backfill_checkpoint_reviewed_at is null
                  or v_reviewed_at > legacy_replay_backfill_checkpoint_reviewed_at
                  or (
                      v_reviewed_at = legacy_replay_backfill_checkpoint_reviewed_at
                      and p_submission_id > legacy_replay_backfill_checkpoint_submission_id
                  )
                then v_reviewed_at
                else legacy_replay_backfill_checkpoint_reviewed_at
            end,
            legacy_replay_backfill_checkpoint_submission_id = case
                when legacy_replay_backfill_checkpoint_reviewed_at is null
                  or v_reviewed_at > legacy_replay_backfill_checkpoint_reviewed_at
                  or (
                      v_reviewed_at = legacy_replay_backfill_checkpoint_reviewed_at
                      and p_submission_id > legacy_replay_backfill_checkpoint_submission_id
                  )
                then p_submission_id
                else legacy_replay_backfill_checkpoint_submission_id
            end,
            legacy_replay_backfill_last_run_at = now(),
            updated_at = now()
        where id = 1;
        return query select v_existing_status, true;
        return;
    end if;

    if p_status = 'BACKFILLED'
       and (
           p_reference_fingerprint is null
           or p_raw_image_hash is null
           or p_normalized_image_hash is null
           or p_reference_fingerprint !~ '^hmac-sha256:v1:[0-9a-f]{64}$'
           or p_raw_image_hash !~ '^sha256:v1:[0-9a-f]{64}$'
           or p_normalized_image_hash !~ '^sha256:v1:[0-9a-f]{64}$'
       ) then
        raise exception using errcode = '22023', message = 'BACKFILLED requires versioned HMAC and image identities.';
    end if;

    v_reason_code := nullif(left(pg_catalog.btrim(coalesce(p_reason_code, '')), 120), '');

    if p_status = 'BACKFILLED' then
        insert into public.approved_payment_evidence (
            order_id, submission_id, verification_id,
            reference_fingerprint, raw_image_hash, normalized_image_hash,
            perceptual_hash, approval_source, approved_by
        ) values (
            v_order_id, p_submission_id, null,
            p_reference_fingerprint, p_raw_image_hash, p_normalized_image_hash,
            p_perceptual_hash, 'legacy', null
        ) on conflict (submission_id) do nothing;
        get diagnostics v_inserted_rows = row_count;
        v_ledger_written := v_inserted_rows > 0
            or exists (
                select 1
                from public.approved_payment_evidence ape
                where ape.submission_id = p_submission_id
            );
    end if;

    insert into public.payment_verification_legacy_backfill_results (
        submission_id, order_id, status,
        reference_fingerprint, raw_image_hash, normalized_image_hash,
        perceptual_hash, reason_code
    ) values (
        p_submission_id, v_order_id, p_status,
        p_reference_fingerprint, p_raw_image_hash, p_normalized_image_hash,
        p_perceptual_hash, v_reason_code
    )
    on conflict (submission_id) do update
    set order_id = excluded.order_id,
        status = excluded.status,
        reference_fingerprint = excluded.reference_fingerprint,
        raw_image_hash = excluded.raw_image_hash,
        normalized_image_hash = excluded.normalized_image_hash,
        perceptual_hash = excluded.perceptual_hash,
        reason_code = excluded.reason_code,
        updated_at = now();

    update public.payment_settings
    set legacy_replay_backfill_checkpoint_reviewed_at = case
            when legacy_replay_backfill_checkpoint_reviewed_at is null
              or v_reviewed_at > legacy_replay_backfill_checkpoint_reviewed_at
              or (
                  v_reviewed_at = legacy_replay_backfill_checkpoint_reviewed_at
                  and p_submission_id > legacy_replay_backfill_checkpoint_submission_id
              )
            then v_reviewed_at
            else legacy_replay_backfill_checkpoint_reviewed_at
        end,
        legacy_replay_backfill_checkpoint_submission_id = case
            when legacy_replay_backfill_checkpoint_reviewed_at is null
              or v_reviewed_at > legacy_replay_backfill_checkpoint_reviewed_at
              or (
                  v_reviewed_at = legacy_replay_backfill_checkpoint_reviewed_at
                  and p_submission_id > legacy_replay_backfill_checkpoint_submission_id
              )
            then p_submission_id
            else legacy_replay_backfill_checkpoint_submission_id
        end,
        legacy_replay_backfill_success_count = legacy_replay_backfill_success_count
            + case when p_status = 'BACKFILLED' then 1 else 0 end,
        legacy_replay_backfill_unsupported_count = legacy_replay_backfill_unsupported_count
            + case
                when v_existing_status is null and p_status <> 'BACKFILLED' then 1
                when v_existing_status is not null
                     and v_existing_status <> 'BACKFILLED'
                     and p_status = 'BACKFILLED' then -1
                else 0
              end,
        legacy_replay_backfill_last_run_at = now(),
        updated_at = now()
    where id = 1;

    return query select p_status, v_ledger_written;
end
$function$;

create or replace function public.complete_payment_verification_legacy_backfill(
    p_total_count integer,
    p_backfilled_count integer,
    p_unsupported_count integer
)
returns table (
    complete boolean,
    total_count integer,
    backfilled_count integer,
    unsupported_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
set lock_timeout = '5s'
as $function$
declare
    v_cutoff timestamptz;
    v_total_count integer;
    v_backfilled_count integer;
    v_unsupported_count integer;
    v_missing_count integer;
    v_complete boolean;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Legacy replay backfill is service-only.';
    end if;
    if p_total_count is null or p_backfilled_count is null or p_unsupported_count is null
       or p_total_count < 0 or p_backfilled_count < 0 or p_unsupported_count < 0
    then
        raise exception using errcode = '22023', message = 'Legacy replay backfill counts are invalid.';
    end if;

    select ps.legacy_replay_backfill_cutoff_at
    into v_cutoff
    from public.payment_settings ps
    where ps.id = 1
    for update;

    select count(*)::integer,
           count(*) filter (where r.status = 'BACKFILLED')::integer,
           count(*) filter (where r.status is not null and r.status <> 'BACKFILLED')::integer,
           count(*) filter (where r.status is null)::integer
    into v_total_count, v_backfilled_count, v_unsupported_count, v_missing_count
    from public.payment_submissions ps
    left join public.payment_verification_legacy_backfill_results r
      on r.submission_id = ps.id
    where ps.status = 'approved'
      and ps.reviewed_at <= v_cutoff;

    -- The durable result table is authoritative. Caller-provided counts are
    -- retained for the released function signature and must reconcile exactly;
    -- they cannot force the fence true or hide rows omitted by a paged run.
    v_complete := v_missing_count = 0
        and v_unsupported_count = 0
        and v_total_count = p_total_count
        and v_backfilled_count = p_backfilled_count
        and v_unsupported_count = p_unsupported_count;

    update public.payment_settings
    set legacy_replay_backfill_complete = v_complete,
        legacy_replay_backfill_completed_at = case when v_complete then now() else null end,
        legacy_replay_backfill_in_progress = false,
        legacy_replay_backfill_last_run_completed_at = now(),
        legacy_replay_backfill_checkpoint_reviewed_at = (
            select max(ps.reviewed_at)
            from public.payment_submissions ps
            where ps.status = 'approved'
              and ps.reviewed_at <= v_cutoff
        ),
        legacy_replay_backfill_checkpoint_submission_id = (
            select ps.id
            from public.payment_submissions ps
            where ps.status = 'approved'
              and ps.reviewed_at <= v_cutoff
            order by ps.reviewed_at desc, ps.id desc
            limit 1
        ),
        legacy_replay_backfill_last_run_at = now(),
        legacy_replay_backfill_success_count = v_backfilled_count,
        legacy_replay_backfill_unsupported_count = v_unsupported_count,
        updated_at = now()
    where id = 1;

    return query select v_complete, v_total_count, v_backfilled_count, v_unsupported_count;
end
$function$;

-- ---------------------------------------------------------------------------
-- Admin-readable shadow metrics without introducing analytics infrastructure.
-- ---------------------------------------------------------------------------

create or replace function public.get_payment_verification_shadow_metrics()
returns table (
    total_analyzed bigint,
    strong_match bigint,
    manual_review bigint,
    suspicious bigint,
    analyzer_error bigint,
    average_duration_ms numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
    if not exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'admin')
          and p.status = 'active' and p.deleted_at is null
    ) then
        raise exception using errcode = '42501', message = 'Financial manager permission is required.';
    end if;

    return query
    select
        count(*) filter (where pv.completed_at is not null),
        count(*) filter (where pv.state = 'STRONG_MATCH'),
        count(*) filter (where pv.state = 'MANUAL_REVIEW'),
        count(*) filter (where pv.state = 'SUSPICIOUS'),
        count(*) filter (where pv.state = 'ANALYZER_ERROR'),
        round(avg(pv.duration_ms)::numeric, 2)
    from public.payment_verifications pv;
end
$function$;

-- ---------------------------------------------------------------------------
-- Retention support primitive. No scheduler or destructive storage delete is
-- installed here; an operator-approved worker can consume this idempotently.
-- ---------------------------------------------------------------------------

create or replace function public.list_payment_slip_retention_candidates(
    p_as_of timestamptz default now()
)
returns table (
    submission_id uuid,
    storage_object_path text,
    terminal_status text,
    terminal_at timestamptz,
    delete_after timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception using errcode = '42501', message = 'Payment retention is service-only.';
    end if;

    return query
    select ps.id,
           ps.storage_object_path,
           o.status,
           o.updated_at,
           o.updated_at + interval '120 days'
    from public.payment_submissions ps
    join public.orders o on o.id = ps.order_id
    where o.status in ('paid', 'free', 'failed', 'refunded', 'cancelled')
      and o.updated_at is not null
      and o.updated_at + interval '120 days' <= coalesce(p_as_of, now())
      and exists (
          select 1 from storage.objects so
          where so.bucket_id = 'payment-slips'
            and so.name = ps.storage_object_path
      )
      and not exists (
          select 1 from public.orders current_order
          where current_order.id = ps.order_id
            and current_order.status = 'pending'
      )
    order by o.updated_at asc, ps.id asc;
end
$function$;

comment on function public.list_payment_slip_retention_candidates(timestamptz) is
    'Idempotent read-only support primitive for deleting private slip objects 120 days after terminal order state; it never deletes data.';

-- ---------------------------------------------------------------------------
-- Final grants. Client roles receive only the existing manual RPCs plus
-- read-only verification rows through RLS. Analyzer/ledger mutations are
-- service-only or remain inside the established manual manager RPCs.
-- ---------------------------------------------------------------------------

revoke all on function public.start_payment_verification(uuid, uuid, boolean)
    from public, anon, authenticated, service_role;
revoke all on function public.complete_payment_verification(uuid, uuid, jsonb)
    from public, anon, authenticated, service_role;
revoke all on function public.auto_approve_payment_verification(uuid)
    from public, anon, authenticated, service_role;
revoke all on function public.update_payment_verification_settings(boolean, text, text[])
    from public, anon, authenticated, service_role;
revoke all on function public.get_payment_verification_shadow_metrics()
    from public, anon, authenticated, service_role;
revoke all on function public.list_payment_slip_retention_candidates(timestamptz)
    from public, anon, authenticated, service_role;
revoke all on function public.get_payment_verification_customer_status(uuid)
    from public, anon, authenticated, service_role;
revoke all on function public.start_payment_verification_legacy_backfill()
    from public, anon, authenticated, service_role;
revoke all on function public.get_payment_verification_legacy_backfill_page(integer)
    from public, anon, authenticated, service_role;
revoke all on function public.record_payment_verification_legacy_backfill(uuid, text, text, text, text, text, text)
    from public, anon, authenticated, service_role;
revoke all on function public.complete_payment_verification_legacy_backfill(integer, integer, integer)
    from public, anon, authenticated, service_role;

grant execute on function public.start_payment_verification(uuid, uuid, boolean) to service_role;
grant execute on function public.complete_payment_verification(uuid, uuid, jsonb) to service_role;
grant execute on function public.auto_approve_payment_verification(uuid) to service_role;
grant execute on function public.update_payment_verification_settings(boolean, text, text[]) to service_role;
grant execute on function public.get_payment_verification_shadow_metrics() to authenticated;
grant execute on function public.list_payment_slip_retention_candidates(timestamptz) to service_role;
grant execute on function public.get_payment_verification_customer_status(uuid) to authenticated;
grant execute on function public.start_payment_verification_legacy_backfill() to service_role;
grant execute on function public.get_payment_verification_legacy_backfill_page(integer) to service_role;
grant execute on function public.record_payment_verification_legacy_backfill(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.complete_payment_verification_legacy_backfill(integer, integer, integer) to service_role;

revoke all on function public.approve_payment_submission(uuid)
    from public, anon, authenticated, service_role;
revoke all on function public.reject_payment_submission(uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.approve_payment_submission(uuid) to authenticated;
grant execute on function public.reject_payment_submission(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Operator handoff:
-- 1. Apply this file manually after verifying migration 102 is the current
--    source head and the live 088-100 payment objects match their anchors.
-- 2. Execute the complete file as one transactional migration batch; do not
--    split the settings, fence, table, policy, or function sections. Verify
--    table/RLS/function grants and confirm both activation fences are false.
-- 3. Run the service/operator legacy replay tool. It must process every
--    pre-cutoff approved private object using the same analyzer identity
--    extraction, record explicit unsupported/PDF/missing/error outcomes, and
--    call the completion RPC. A nonzero unsupported count keeps the fence down.
-- 4. Deploy the M1.3A application in shadow mode.
-- 5. Compare the bounded analyzer decisions with human review. Do not enable
--    automatic approval as part of this migration or deployment.
-- 6. Retention cleanup is intentionally not scheduled by this migration; a
--    separately reviewed service worker may consume the read-only candidate
--    function and delete only the returned private objects after DB recheck.
