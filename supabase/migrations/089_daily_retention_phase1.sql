-- 089_daily_retention_phase1.sql
-- Sobdai Daily Retention Phase 1.
--
-- Scope:
--   * one deterministic, shared Daily 5 challenge per Asia/Bangkok date
--   * one mutable aggregate row per user/date containing terminal answers
--   * one lifetime aggregate row per user
--   * exactly one consistency quest: complete all five answers for +50 EXP
--
-- Deliberate non-objects:
--   * no per-answer table, click log, or EXP ledger
--   * no accuracy-based reward, second quest, or level column
--   * no changes to existing exam/progress or homepage tables
--
-- Learner writes use the authenticated SECURITY DEFINER RPC below. The RPC
-- derives auth.uid(), the Bangkok date, challenge membership, answer validity,
-- correctness, completion, EXP, and streak transitions server-side.

set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fail-closed predecessor and collision gate
-- ─────────────────────────────────────────────────────────────────────────────

do $daily_preflight$
declare
    required_relation text;
    required_column record;
begin
    foreach required_relation in array array[
        'public.questions',
        'public.profiles'
    ] loop
        if pg_catalog.to_regclass(required_relation) is null then
            raise exception using
                errcode = 'check_violation',
                message = format('Daily Retention migration 089 requires %s.', required_relation);
        end if;
    end loop;

    for required_column in
        select table_name, column_name
        from (values
            ('questions', 'id'),
            ('questions', 'content'),
            ('questions', 'choice_a'),
            ('questions', 'choice_b'),
            ('questions', 'choice_c'),
            ('questions', 'choice_d'),
            ('questions', 'correct_answer'),
            ('questions', 'status'),
            ('questions', 'hint'),
            ('questions', 'full_explanation'),
            ('profiles', 'id'),
            ('profiles', 'status'),
            ('profiles', 'deleted_at')
        ) as required(table_name, column_name)
    loop
        if not exists (
            select 1
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.table_name = required_column.table_name
              and c.column_name = required_column.column_name
        ) then
            raise exception using
                errcode = 'check_violation',
                message = format(
                    'Daily Retention migration 089 requires public.%I.%I.',
                    required_column.table_name,
                    required_column.column_name
                );
        end if;
    end loop;

    if pg_catalog.to_regprocedure('public.handle_updated_at()') is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Daily Retention migration 089 requires public.handle_updated_at().';
    end if;

    for required_relation in
        select relation_name
        from (values
            ('daily_challenges'),
            ('user_daily_progress'),
            ('user_progress')
        ) as required(relation_name)
    loop
        if pg_catalog.to_regclass(format('public.%I', required_relation)) is not null then
            raise exception using
                errcode = 'duplicate_object',
                message = format(
                    'Daily Retention migration 089 refuses to replace existing public.%I.',
                    required_relation
                );
        end if;
    end loop;

    if pg_catalog.to_regprocedure('public.daily_get_or_create_challenge()') is not null
       or pg_catalog.to_regprocedure('public.daily_get_state()') is not null
       or pg_catalog.to_regprocedure('public.daily_submit_answer(uuid, text, integer)') is not null
       or pg_catalog.to_regprocedure('public.daily_save_progress(jsonb, integer, boolean)') is not null
    then
        raise exception using
            errcode = 'duplicate_object',
            message = 'Daily Retention migration 089 RPC already exists.';
    end if;
end
$daily_preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. State-only persistence model
-- ─────────────────────────────────────────────────────────────────────────────

create table public.daily_challenges (
    local_date date primary key,
    question_1_id uuid not null,
    question_2_id uuid not null,
    question_3_id uuid not null,
    question_4_id uuid not null,
    question_5_id uuid not null,
    created_at timestamptz not null default now(),

    constraint daily_challenges_distinct_questions_check check (
        question_1_id <> question_2_id
        and question_1_id <> question_3_id
        and question_1_id <> question_4_id
        and question_1_id <> question_5_id
        and question_2_id <> question_3_id
        and question_2_id <> question_4_id
        and question_2_id <> question_5_id
        and question_3_id <> question_4_id
        and question_3_id <> question_5_id
        and question_4_id <> question_5_id
    )
);

comment on table public.daily_challenges is
    'Daily Retention Phase 1: immutable question ID selection for one Asia/Bangkok calendar date. Content is never copied here; RPCs revalidate Published questions at read and submit time.';

create or replace function public.daily_challenges_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
    raise exception using
        errcode = '55006',
        message = 'Daily challenge rows are immutable once created.';
end
$function$;

create trigger daily_challenges_immutable
    before update or delete on public.daily_challenges
    for each row execute procedure public.daily_challenges_block_mutation();

revoke all on function public.daily_challenges_block_mutation()
    from public, anon, authenticated, service_role;

create table public.user_daily_progress (
    user_id uuid not null references auth.users(id) on delete cascade,
    local_date date not null,

    -- One compact mutable aggregate. answers contains terminal submissions,
    -- not a click history and not an overwriteable client snapshot.
    current_index integer not null default 0,
    answers jsonb not null default '{}'::jsonb,
    questions_answered smallint not null default 0,
    correct_answers smallint not null default 0,

    -- Completion is the sole quest and the sole reward eligibility condition.
    daily_completed boolean not null default false,
    exp_earned integer not null default 0,
    completed_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    primary key (user_id, local_date),

    constraint user_daily_progress_index_check
        check (current_index between 0 and 4),
    constraint user_daily_progress_answers_object_check
        check (jsonb_typeof(answers) = 'object'),
    constraint user_daily_progress_answer_counts_check
        check (
            questions_answered between 0 and 5
            and correct_answers between 0 and questions_answered
        ),
    constraint user_daily_progress_completion_shape_check
        check (
            (not daily_completed and completed_at is null)
            or (daily_completed and completed_at is not null)
        ),
    constraint user_daily_progress_exp_shape_check
        check (
            exp_earned = case when daily_completed then 50 else 0 end
            and exp_earned between 0 and 50
        )
);

comment on table public.user_daily_progress is
    'Daily Retention Phase 1: one user/date aggregate containing terminal answers, informational correctness counts, one completion quest, and idempotent +50 EXP. No action history or EXP ledger.';

create table public.user_progress (
    user_id uuid primary key references auth.users(id) on delete cascade,
    total_exp integer not null default 0,
    current_streak integer not null default 0,
    longest_streak integer not null default 0,
    last_qualified_date date,
    total_daily_questions integer not null default 0,
    total_daily_correct integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint user_progress_exp_check check (total_exp >= 0),
    constraint user_progress_streak_check check (
        current_streak >= 0
        and longest_streak >= 0
        and longest_streak >= current_streak
    ),
    constraint user_progress_daily_totals_check check (
        total_daily_questions >= 0
        and total_daily_correct between 0 and total_daily_questions
    )
);

comment on table public.user_progress is
    'Daily Retention Phase 1 lifetime aggregate: total EXP, qualified-day streaks, and completed Daily question totals. Correctness is informational; no progression tier is persisted.';

drop trigger if exists handle_updated_at_user_daily_progress on public.user_daily_progress;
create trigger handle_updated_at_user_daily_progress
    before update on public.user_daily_progress
    for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_updated_at_user_progress on public.user_progress;
create trigger handle_updated_at_user_progress
    before update on public.user_progress
    for each row execute procedure public.handle_updated_at();

create index user_daily_progress_date_idx
    on public.user_daily_progress (local_date desc, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS and table privileges
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.daily_challenges enable row level security;
alter table public.user_daily_progress enable row level security;
alter table public.user_progress enable row level security;

-- Raw challenge/progress tables are not a client write surface. Learners use
-- the narrow Daily RPC projection and answer mutation instead of arbitrary
-- PostgREST table mutations.
revoke all on table public.daily_challenges from public, anon, authenticated;
revoke all on table public.user_daily_progress from public, anon, authenticated;
revoke all on table public.user_progress from public, anon, authenticated;

grant select on table public.user_daily_progress to authenticated;
grant select on table public.user_progress to authenticated;

create policy user_daily_progress_select_own
    on public.user_daily_progress
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy user_progress_select_own
    on public.user_progress
    for select
    to authenticated
    using (auth.uid() = user_id);

-- There are intentionally no authenticated INSERT/UPDATE/DELETE policies on
-- any Daily table.

create or replace function public.daily_question_is_valid(
    p_question public.questions
)
returns boolean
language sql
immutable
as $function$
    select p_question.status = 'Published'
       and char_length(btrim(p_question.content)) > 0
       and char_length(btrim(p_question.choice_a)) > 0
       and char_length(btrim(p_question.choice_b)) > 0
       and char_length(btrim(p_question.choice_c)) > 0
       and char_length(btrim(p_question.choice_d)) > 0
       and p_question.correct_answer in ('A', 'B', 'C', 'D');
$function$;

comment on function public.daily_question_is_valid(public.questions) is
    'Internal Daily eligibility predicate: Published plus non-empty question/choice fields and an allowed answer.';

revoke all on function public.daily_question_is_valid(public.questions)
    from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Deterministic challenge creation/read helper
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.daily_get_or_create_challenge()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_today date := timezone('Asia/Bangkok', now())::date;
    v_question_ids uuid[];
    v_persisted_ids uuid[];
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.status = 'active'
          and p.deleted_at is null
    ) then
        raise exception using
            errcode = '42501',
            message = 'Daily access is unavailable for this account.';
    end if;

    -- A persisted date is immutable and is never reseeded after a pool
    -- change. The read path revalidates its questions before serving content.
    select array[
        c.question_1_id,
        c.question_2_id,
        c.question_3_id,
        c.question_4_id,
        c.question_5_id
    ]::uuid[]
    into v_persisted_ids
    from public.daily_challenges c
    where c.local_date = v_today;

    if v_persisted_ids is not null then
        return jsonb_build_object(
            'available', true,
            'localDate', v_today,
            'questionIds', to_jsonb(v_persisted_ids)
        );
    end if;

    -- Stable per-date hash plus UUID tiebreaker; random() is deliberately not
    -- used. Concurrent callers converge on the local_date primary key.
    select array_agg(candidate.id order by candidate.selection_key, candidate.id)
    into v_question_ids
    from (
        select q.id,
               md5(v_today::text || ':' || q.id::text) as selection_key
        from public.questions q
        where public.daily_question_is_valid(q)
        order by selection_key, q.id
        limit 5
    ) candidate;

    if coalesce(array_length(v_question_ids, 1), 0) < 5 then
        return jsonb_build_object(
            'available', false,
            'localDate', v_today,
            'reason', 'not-enough-eligible-questions'
        );
    end if;

    insert into public.daily_challenges (
        local_date,
        question_1_id,
        question_2_id,
        question_3_id,
        question_4_id,
        question_5_id
    )
    values (
        v_today,
        v_question_ids[1],
        v_question_ids[2],
        v_question_ids[3],
        v_question_ids[4],
        v_question_ids[5]
    )
    on conflict (local_date) do nothing;

    select array[
        c.question_1_id,
        c.question_2_id,
        c.question_3_id,
        c.question_4_id,
        c.question_5_id
    ]::uuid[]
    into v_persisted_ids
    from public.daily_challenges c
    where c.local_date = v_today;

    return jsonb_build_object(
        'available', true,
        'localDate', v_today,
        'questionIds', to_jsonb(v_persisted_ids)
    );
end
$function$;

comment on function public.daily_get_or_create_challenge() is
    'Authenticated Daily challenge resolver. Derives the Bangkok date, deterministically selects five Published questions, converges concurrent first creation on daily_challenges.local_date, and never reseeds a persisted date.';

revoke all on function public.daily_get_or_create_challenge()
    from public, anon, authenticated, service_role;
grant execute on function public.daily_get_or_create_challenge()
    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Shared internal state/streak helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.daily_recompute_user_streaks(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_existing_longest integer;
    v_existing_last date;
    v_current_streak integer;
    v_longest_streak integer;
    v_latest_date date;
    v_last_qualified_date date;
begin
    if p_user_id is null or auth.uid() is null or p_user_id <> auth.uid() then
        raise exception using
            errcode = '42501',
            message = 'Invalid Daily streak owner.';
    end if;

    select p.longest_streak, p.last_qualified_date
    into v_existing_longest, v_existing_last
    from public.user_progress p
    where p.user_id = p_user_id
    for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'Daily lifetime progress is unavailable.';
    end if;

    -- Completed dates form consecutive islands. The latest island is the
    -- current streak; longest_streak is retained monotonically.
    with ordered as (
        select p.local_date,
               p.local_date - (row_number() over (order by p.local_date))::integer as island
        from public.user_daily_progress p
        where p.user_id = p_user_id
          and p.daily_completed
    ), runs as (
        select min(local_date) as run_start,
               max(local_date) as run_end,
               count(*)::integer as run_length
        from ordered
        group by island
    )
    select
        coalesce((select run_length from runs order by run_end desc limit 1), 0),
        coalesce((select max(run_length) from runs), 0),
        (select max(run_end) from runs)
    into v_current_streak, v_longest_streak, v_latest_date;

    v_last_qualified_date := case
        when v_latest_date is null then v_existing_last
        when v_existing_last is null then v_latest_date
        else greatest(v_existing_last, v_latest_date)
    end;

    v_longest_streak := greatest(v_existing_longest, coalesce(v_longest_streak, 0));

    update public.user_progress
    set
        current_streak = coalesce(v_current_streak, 0),
        longest_streak = v_longest_streak,
        last_qualified_date = v_last_qualified_date
    where user_id = p_user_id;

    return jsonb_build_object(
        'currentStreak', coalesce(v_current_streak, 0),
        'longestStreak', v_longest_streak,
        'lastQualifiedDate', v_last_qualified_date
    );
end
$function$;

comment on function public.daily_recompute_user_streaks(uuid) is
    'Internal Daily helper. Recomputes the latest completed-date island under the caller user_progress lock so adjacent days converge regardless of commit order.';

revoke all on function public.daily_recompute_user_streaks(uuid)
    from public, anon, authenticated, service_role;

create or replace function public.daily_render_state(
    p_today date,
    p_question_ids uuid[],
    p_answers jsonb,
    p_current_index integer,
    p_questions_answered integer,
    p_correct_answers integer,
    p_daily_completed boolean,
    p_exp_earned integer,
    p_completed_at timestamptz,
    p_total_exp integer,
    p_current_streak integer,
    p_longest_streak integer,
    p_last_qualified_date date,
    p_total_daily_questions integer,
    p_total_daily_correct integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_questions jsonb;
    v_results jsonb;
begin
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'content', q.content,
                'choices', jsonb_build_object(
                    'A', q.choice_a,
                    'B', q.choice_b,
                    'C', q.choice_c,
                    'D', q.choice_d
                ),
                'hint', q.hint
            )
            order by ids.ordinality
        ),
        '[]'::jsonb
    )
    into v_questions
    from unnest(p_question_ids) with ordinality as ids(id, ordinality)
    join public.questions q on q.id = ids.id
    where public.daily_question_is_valid(q);

    -- Results are derived only for keys already present in the terminal
    -- answer aggregate. A pre-answer state therefore contains no answer key.
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'selected', p_answers ->> (q.id::text),
                'correctAnswer', q.correct_answer,
                'isCorrect', (p_answers ->> (q.id::text)) = q.correct_answer::text,
                'explanation', q.full_explanation
            )
            order by ids.ordinality
        ),
        '[]'::jsonb
    )
    into v_results
    from unnest(p_question_ids) with ordinality as ids(id, ordinality)
    join public.questions q on q.id = ids.id
    where public.daily_question_is_valid(q)
      and p_answers ? (q.id::text);

    return jsonb_build_object(
        'available', true,
        'localDate', p_today,
        'questions', v_questions,
        'progress', jsonb_build_object(
            'currentIndex', p_current_index,
            'answers', p_answers,
            'questionsAnswered', p_questions_answered,
            'correctAnswers', p_correct_answers,
            'dailyCompleted', p_daily_completed,
            'expEarned', p_exp_earned,
            'completedAt', p_completed_at
        ),
        'lifetime', jsonb_build_object(
            'totalExp', p_total_exp,
            'currentStreak', p_current_streak,
            'longestStreak', p_longest_streak,
            'lastQualifiedDate', p_last_qualified_date,
            'totalDailyQuestions', p_total_daily_questions,
            'totalDailyCorrect', p_total_daily_correct
        ),
        'stats', jsonb_build_object(
            'questionsAnswered', p_questions_answered,
            'correctAnswers', p_correct_answers,
            'accuracy', case
                when p_questions_answered > 0
                    then round(p_correct_answers::numeric * 100 / p_questions_answered)::integer
                else 0
            end,
            'expEarnedToday', p_exp_earned,
            'totalExp', p_total_exp,
            'currentStreak', p_current_streak,
            'longestStreak', p_longest_streak
        ),
        'results', v_results,
        'quests', jsonb_build_array(
            jsonb_build_object(
                'id', 'complete-daily-five',
                'label', 'ทำ Daily 5 ให้ครบ',
                'rewardExp', 50,
                'completed', p_daily_completed
            )
        )
    );
end
$function$;

comment on function public.daily_render_state(
    date, uuid[], jsonb, integer, integer, integer, boolean, integer,
    timestamptz, integer, integer, integer, date, integer, integer
) is
    'Internal Daily keyless question projection plus terminal-answer feedback. It is callable only from authenticated Daily RPCs.';

revoke all on function public.daily_render_state(
    date, uuid[], jsonb, integer, integer, integer, boolean, integer,
    timestamptz, integer, integer, integer, date, integer, integer
) from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Learner state projection
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.daily_get_state()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_today date := timezone('Asia/Bangkok', now())::date;
    v_challenge jsonb;
    v_question_ids uuid[];
    v_valid_question_count integer;
    v_current_index integer;
    v_answers jsonb;
    v_questions_answered integer;
    v_correct_answers integer;
    v_daily_completed boolean;
    v_exp_earned integer;
    v_completed_at timestamptz;
    v_total_exp integer;
    v_current_streak integer;
    v_longest_streak integer;
    v_last_qualified_date date;
    v_total_daily_questions integer;
    v_total_daily_correct integer;
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.status = 'active'
          and p.deleted_at is null
    ) then
        raise exception using
            errcode = '42501',
            message = 'Daily access is unavailable for this account.';
    end if;

    select public.daily_get_or_create_challenge()
    into v_challenge;

    if coalesce((v_challenge->>'available')::boolean, false) is false then
        return v_challenge;
    end if;

    select array_agg(value::uuid order by ordinality)
    into v_question_ids
    from jsonb_array_elements_text(v_challenge->'questionIds') with ordinality as ids(value, ordinality);

    -- A later unpublish/delete invalidates the persisted date; never reseed it.
    select count(*)::integer
    into v_valid_question_count
    from unnest(v_question_ids) as ids(id)
    join public.questions q on q.id = ids.id
    where public.daily_question_is_valid(q);

    if coalesce(array_length(v_question_ids, 1), 0) <> 5
       or v_valid_question_count <> 5
    then
        return jsonb_build_object(
            'available', false,
            'localDate', v_today,
            'reason', 'challenge-invalid'
        );
    end if;

    -- Keep the same user_progress -> user_daily_progress lock/creation order
    -- used by answer submission, preventing cross-midnight lock inversion.
    insert into public.user_progress (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    insert into public.user_daily_progress (user_id, local_date)
    values (v_user_id, v_today)
    on conflict (user_id, local_date) do nothing;

    select
        p.current_index,
        p.answers,
        p.questions_answered,
        p.correct_answers,
        p.daily_completed,
        p.exp_earned,
        p.completed_at
    into
        v_current_index,
        v_answers,
        v_questions_answered,
        v_correct_answers,
        v_daily_completed,
        v_exp_earned,
        v_completed_at
    from public.user_daily_progress p
    where p.user_id = v_user_id
      and p.local_date = v_today;

    select
        p.total_exp,
        p.current_streak,
        p.longest_streak,
        p.last_qualified_date,
        p.total_daily_questions,
        p.total_daily_correct
    into
        v_total_exp,
        v_current_streak,
        v_longest_streak,
        v_last_qualified_date,
        v_total_daily_questions,
        v_total_daily_correct
    from public.user_progress p
    where p.user_id = v_user_id;

    return public.daily_render_state(
        v_today,
        v_question_ids,
        v_answers,
        v_current_index,
        v_questions_answered,
        v_correct_answers,
        v_daily_completed,
        v_exp_earned,
        v_completed_at,
        v_total_exp,
        v_current_streak,
        v_longest_streak,
        v_last_qualified_date,
        v_total_daily_questions,
        v_total_daily_correct
    );
end
$function$;

comment on function public.daily_get_state() is
    'Authenticated Daily learner projection. Question content is keyless; terminal answer feedback is returned only for answer IDs already persisted in the caller-owned aggregate.';

revoke all on function public.daily_get_state()
    from public, anon, authenticated, service_role;
grant execute on function public.daily_get_state()
    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. One-answer terminal mutation and completion transaction
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.daily_submit_answer(
    p_question_id uuid,
    p_choice text,
    p_next_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_today date := timezone('Asia/Bangkok', now())::date;
    v_challenge jsonb;
    v_question_ids uuid[];
    v_valid_question_count integer;
    v_question_position integer;
    v_lock_question_id uuid;
    v_selected_question public.questions%rowtype;
    v_answers jsonb;
    v_current_index integer;
    v_questions_answered integer;
    v_correct_answers integer;
    v_daily_completed boolean;
    v_exp_earned integer;
    v_completed_at timestamptz;
    v_existing_choice text;
    v_idempotent boolean := false;
    v_exp_delta integer := 0;
    v_total_exp integer;
    v_current_streak integer;
    v_longest_streak integer;
    v_last_qualified_date date;
    v_total_daily_questions integer;
    v_total_daily_correct integer;
    v_result jsonb;
begin
    if v_user_id is null then
        raise exception using
            errcode = '42501',
            message = 'Authentication is required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.status = 'active'
          and p.deleted_at is null
    ) then
        raise exception using
            errcode = '42501',
            message = 'Daily access is unavailable for this account.';
    end if;

    if p_question_id is null
       or p_choice is null
       or p_choice not in ('A', 'B', 'C', 'D')
    then
        raise exception using
            errcode = '22023',
            message = 'Daily answer is invalid.';
    end if;

    if p_next_index is null or p_next_index not between 0 and 4 then
        raise exception using
            errcode = '22023',
            message = 'Daily question index is invalid.';
    end if;

    select public.daily_get_or_create_challenge()
    into v_challenge;

    if coalesce((v_challenge->>'available')::boolean, false) is false then
        raise exception using
            errcode = 'P0001',
            message = 'Daily 5 is unavailable today.';
    end if;

    select array_agg(value::uuid order by ordinality)
    into v_question_ids
    from jsonb_array_elements_text(v_challenge->'questionIds') with ordinality as ids(value, ordinality);

    -- Every answer mutation first serializes the caller through the lifetime
    -- row, then the user/date row. This also serializes adjacent Bangkok days.
    insert into public.user_progress (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select
        p.total_exp,
        p.current_streak,
        p.longest_streak,
        p.last_qualified_date,
        p.total_daily_questions,
        p.total_daily_correct
    into
        v_total_exp,
        v_current_streak,
        v_longest_streak,
        v_last_qualified_date,
        v_total_daily_questions,
        v_total_daily_correct
    from public.user_progress p
    where p.user_id = v_user_id
    for update;

    insert into public.user_daily_progress (user_id, local_date)
    values (v_user_id, v_today)
    on conflict (user_id, local_date) do nothing;

    select
        p.current_index,
        p.answers,
        p.questions_answered,
        p.correct_answers,
        p.daily_completed,
        p.exp_earned,
        p.completed_at
    into
        v_current_index,
        v_answers,
        v_questions_answered,
        v_correct_answers,
        v_daily_completed,
        v_exp_earned,
        v_completed_at
    from public.user_daily_progress p
    where p.user_id = v_user_id
      and p.local_date = v_today
    for update;

    -- Lock all challenge question rows in deterministic ID order before
    -- checking eligibility or reading correct_answer. The locks last through
    -- the aggregate mutation and the terminal feedback response.
    for v_lock_question_id in
        select ids.id
        from unnest(v_question_ids) as ids(id)
        order by ids.id
    loop
        perform 1
        from public.questions q
        where q.id = v_lock_question_id
        for update;
    end loop;

    select count(*)::integer
    into v_valid_question_count
    from unnest(v_question_ids) as ids(id)
    join public.questions q on q.id = ids.id
    where public.daily_question_is_valid(q);

    if coalesce(array_length(v_question_ids, 1), 0) <> 5
       or v_valid_question_count <> 5
    then
        raise exception using
            errcode = 'P0001',
            message = 'Daily 5 is unavailable because the persisted challenge is invalid.';
    end if;

    select ids.ordinality::integer
    into v_question_position
    from unnest(v_question_ids) with ordinality as ids(id, ordinality)
    where ids.id = p_question_id;

    if v_question_position is null then
        raise exception using
            errcode = '22023',
            message = 'Answer is outside today''s Daily challenge.';
    end if;

    select q.*
    into v_selected_question
    from public.questions q
    where q.id = p_question_id
      and public.daily_question_is_valid(q)
    for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'The selected Daily question is no longer valid.';
    end if;

    if v_answers ? (p_question_id::text) then
        v_existing_choice := v_answers ->> (p_question_id::text);
        if v_existing_choice <> p_choice then
            raise exception using
                errcode = 'P0001',
                message = 'This Daily answer has already been submitted.';
        end if;
        -- Same answer retry: return the stored terminal outcome without any
        -- aggregate replacement or second reward.
        v_idempotent := true;
    else
        if v_daily_completed then
            raise exception using
                errcode = 'P0001',
                message = 'Daily 5 has already been completed.';
        end if;

        -- Merge exactly one new terminal answer into the existing aggregate;
        -- no request can remove or replace another question's answer.
        v_answers := jsonb_set(
            v_answers,
            array[p_question_id::text],
            to_jsonb(p_choice),
            true
        );
        -- A delayed answer may carry an older cursor. Keep the persisted
        -- resume cursor moving forward while the terminal answer merge stays
        -- narrowly scoped to this question ID.
        v_current_index := greatest(v_current_index, p_next_index);

        select
            count(*) filter (where v_answers ? (q.id::text))::integer,
            count(*) filter (
                where v_answers ? (q.id::text)
                  and (v_answers ->> (q.id::text)) = q.correct_answer::text
            )::integer
        into v_questions_answered, v_correct_answers
        from unnest(v_question_ids) as ids(id)
        join public.questions q on q.id = ids.id
        where public.daily_question_is_valid(q);

        if v_questions_answered = 5 then
            -- Completion is derived from five persisted terminal answers. It
            -- is the only reward/streak eligibility condition.
            v_daily_completed := true;
            v_exp_earned := 50;
            v_exp_delta := 50;
            v_completed_at := now();

            update public.user_daily_progress
            set
                current_index = v_current_index,
                answers = v_answers,
                questions_answered = v_questions_answered,
                correct_answers = v_correct_answers,
                daily_completed = true,
                exp_earned = 50,
                completed_at = v_completed_at
            where user_id = v_user_id
              and local_date = v_today;

            -- The lifetime row is already locked. Only this false -> true
            -- transition can add EXP and completed-question totals.
            update public.user_progress
            set
                total_exp = total_exp + 50,
                total_daily_questions = total_daily_questions + 5,
                total_daily_correct = total_daily_correct + v_correct_answers
            where user_id = v_user_id;

            -- Recompute from all completed dates, not from whichever request
            -- happened to commit first. This makes D/D+1 order-independent.
            perform public.daily_recompute_user_streaks(v_user_id);
        else
            update public.user_daily_progress
            set
                current_index = v_current_index,
                answers = v_answers,
                questions_answered = v_questions_answered,
                correct_answers = v_correct_answers
            where user_id = v_user_id
              and local_date = v_today;
        end if;
    end if;

    -- Correctness/explanation is returned only for the now-terminal answer.
    -- For a retry, this is the same already-terminal answer and remains
    -- idempotent.
    v_result := jsonb_build_object(
        'id', v_selected_question.id,
        'selected', p_choice,
        'correctAnswer', v_selected_question.correct_answer,
        'isCorrect', p_choice = v_selected_question.correct_answer::text,
        'explanation', v_selected_question.full_explanation
    );

    select
        p.total_exp,
        p.current_streak,
        p.longest_streak,
        p.last_qualified_date,
        p.total_daily_questions,
        p.total_daily_correct
    into
        v_total_exp,
        v_current_streak,
        v_longest_streak,
        v_last_qualified_date,
        v_total_daily_questions,
        v_total_daily_correct
    from public.user_progress p
    where p.user_id = v_user_id;

    return jsonb_build_object(
        'finalized', v_daily_completed,
        'idempotent', v_idempotent,
        'expDelta', v_exp_delta,
        'result', v_result,
        'state', public.daily_render_state(
            v_today,
            v_question_ids,
            v_answers,
            v_current_index,
            v_questions_answered,
            v_correct_answers,
            v_daily_completed,
            v_exp_earned,
            v_completed_at,
            v_total_exp,
            v_current_streak,
            v_longest_streak,
            v_last_qualified_date,
            v_total_daily_questions,
            v_total_daily_correct
        )
    );
end
$function$;

comment on function public.daily_submit_answer(uuid, text, integer) is
    'Authenticated Daily terminal answer mutation. Locks the caller/date and challenge questions, validates the persisted challenge, merges one answer, derives correctness from the DB, and awards exactly +50 EXP once when five answers are terminal.';

revoke all on function public.daily_submit_answer(uuid, text, integer)
    from public, anon, authenticated, service_role;
grant execute on function public.daily_submit_answer(uuid, text, integer)
    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Security postflight
-- ─────────────────────────────────────────────────────────────────────────────

do $daily_postflight$
declare
    expected_function text;
begin
    foreach expected_function in array array[
        'public.daily_get_or_create_challenge()',
        'public.daily_get_state()',
        'public.daily_submit_answer(uuid, text, integer)'
    ] loop
        if not pg_catalog.has_function_privilege('authenticated', expected_function, 'EXECUTE')
           or pg_catalog.has_function_privilege('anon', expected_function, 'EXECUTE')
           or pg_catalog.has_function_privilege('service_role', expected_function, 'EXECUTE')
        then
            raise exception using
                errcode = 'insufficient_privilege',
                message = format('Daily RPC ACL is invalid for %s.', expected_function);
        end if;
    end loop;

    if has_table_privilege('authenticated', 'public.daily_challenges', 'SELECT')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'DELETE')
       or has_table_privilege('authenticated', 'public.user_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_progress', 'DELETE')
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Authenticated Daily tables must not expose direct challenge reads or progress writes.';
    end if;
end
$daily_postflight$;

notify pgrst, 'reload schema';
