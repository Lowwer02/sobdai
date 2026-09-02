-- 089_daily_retention_phase1.sql
-- Sobdai Daily Retention Phase 1.
--
-- Scope:
--   * one deterministic, shared Daily 5 challenge per Asia/Bangkok date
--   * one mutable resume/progress snapshot per user/date
--   * one lifetime aggregate row per user
--   * exactly two quests: completion and score >= 3/5
--
-- Deliberate non-objects:
--   * no per-answer table, click log, or EXP ledger
--   * no additional quest tracking
--   * no progression-tier column
--   * no changes to existing exam/progress or homepage tables
--
-- All learner writes go through the authenticated SECURITY DEFINER RPCs below.
-- The RPCs derive auth.uid(), the Bangkok date, challenge membership, answer
-- validity, correctness, quest state, EXP, and streak transitions server-side.

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

    if pg_catalog.to_regprocedure('public.daily_get_state()') is not null
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

    -- One compact mutable resume snapshot. This is not action history.
    current_index integer not null default 0,
    answers jsonb not null default '{}'::jsonb,
    questions_answered smallint not null default 0,
    correct_answers smallint not null default 0,

    -- Daily terminal state and the two quest claim states.
    daily_completed boolean not null default false,
    quest_one_completed boolean not null default false,
    quest_two_completed boolean not null default false,
    both_quests_completed boolean not null default false,
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
    constraint user_daily_progress_quest_shape_check
        check (
            quest_one_completed = daily_completed
            and quest_two_completed = (daily_completed and correct_answers >= 3)
            and both_quests_completed = (quest_one_completed and quest_two_completed)
        ),
    constraint user_daily_progress_exp_shape_check
        check (
            exp_earned =
                (case when quest_one_completed then 50 else 0 end)
                + (case when quest_two_completed then 20 else 0 end)
                + (case when both_quests_completed then 30 else 0 end)
            and exp_earned between 0 and 100
        )
);

comment on table public.user_daily_progress is
    'Daily Retention Phase 1: one user/date snapshot containing resume answers, aggregate counts, exactly two quest states, and the idempotent daily EXP total. No action history or EXP ledger.';

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
    'Daily Retention Phase 1 lifetime aggregate: total EXP, qualified-day streaks, and completed Daily question totals. Progression tiers are deliberately not persisted.';

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
-- the narrow RPC projection instead of arbitrary PostgREST table mutations.
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
-- daily_challenges, user_daily_progress, or user_progress.

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
-- 4. Deterministic challenge creation/read helper
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

    -- Once a date has a persisted challenge, that row is the only source of
    -- truth for the date. Do not let later pool changes reseed or invalidate a
    -- still-valid persisted challenge.
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

    -- The hash order is stable for the date and question ID. The UUID is a
    -- deterministic tiebreaker; an unstable random selection is deliberately
    -- not used.
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

    -- local_date is the convergence key. Concurrent first requests select the
    -- same deterministic IDs; one insert wins and every caller reads that row.
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
    v_questions jsonb;
    v_answers jsonb;
    v_current_index integer;
    v_questions_answered integer;
    v_correct_answers integer;
    v_daily_completed boolean;
    v_quest_one_completed boolean;
    v_quest_two_completed boolean;
    v_both_quests_completed boolean;
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

    -- Revalidate the persisted IDs. A later unpublish/delete never silently
    -- reseeds the day; it makes the day unavailable until an operator fixes it.
    select
        count(*)::integer,
        coalesce(
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
    into v_valid_question_count, v_questions
    from unnest(v_question_ids) with ordinality as ids(id, ordinality)
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

    insert into public.user_daily_progress (user_id, local_date)
    values (v_user_id, v_today)
    on conflict (user_id, local_date) do nothing;

    insert into public.user_progress (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select
        p.current_index,
        p.answers,
        p.questions_answered,
        p.correct_answers,
        p.daily_completed,
        p.quest_one_completed,
        p.quest_two_completed,
        p.both_quests_completed,
        p.exp_earned,
        p.completed_at
    into
        v_current_index,
        v_answers,
        v_questions_answered,
        v_correct_answers,
        v_daily_completed,
        v_quest_one_completed,
        v_quest_two_completed,
        v_both_quests_completed,
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

    return jsonb_build_object(
        'available', true,
        'localDate', v_today,
        'questions', v_questions,
        'progress', jsonb_build_object(
            'currentIndex', v_current_index,
            'answers', v_answers,
            'questionsAnswered', v_questions_answered,
            'correctAnswers', v_correct_answers,
            'dailyCompleted', v_daily_completed,
            'questOneCompleted', v_quest_one_completed,
            'questTwoCompleted', v_quest_two_completed,
            'bothQuestsCompleted', v_both_quests_completed,
            'expEarned', v_exp_earned,
            'completedAt', v_completed_at
        ),
        'lifetime', jsonb_build_object(
            'totalExp', v_total_exp,
            'currentStreak', v_current_streak,
            'longestStreak', v_longest_streak,
            'lastQualifiedDate', v_last_qualified_date,
            'totalDailyQuestions', v_total_daily_questions,
            'totalDailyCorrect', v_total_daily_correct
        ),
        'stats', jsonb_build_object(
            'questionsAnswered', v_questions_answered,
            'correctAnswers', v_correct_answers,
            'accuracy', case
                when v_questions_answered > 0
                    then round(v_correct_answers::numeric * 100 / v_questions_answered)::integer
                else 0
            end,
            'expEarnedToday', v_exp_earned,
            'totalExp', v_total_exp,
            'currentStreak', v_current_streak,
            'longestStreak', v_longest_streak
        ),
        'quests', jsonb_build_array(
            jsonb_build_object(
                'id', 'complete-daily-five',
                'label', 'ทำ Daily 5 ให้ครบ',
                'rewardExp', 50,
                'completed', v_quest_one_completed
            ),
            jsonb_build_object(
                'id', 'score-three-of-five',
                'label', 'ทำถูกอย่างน้อย 3/5',
                'rewardExp', 20,
                'completed', v_quest_two_completed
            )
        )
    );
end
$function$;

comment on function public.daily_get_state() is
    'Authenticated Daily learner projection. Returns question content without correct answers until a terminal submit response, plus the caller-owned aggregate state and exactly two quests.';

revoke all on function public.daily_get_state()
    from public, anon, authenticated, service_role;
grant execute on function public.daily_get_state()
    to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Server-authoritative progress save and terminal reward transaction
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.daily_save_progress(
    p_answers jsonb,
    p_current_index integer,
    p_finalize boolean default false
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
    v_answer_pair record;
    v_effective_answers jsonb;
    v_current_index integer;
    v_questions_answered integer;
    v_correct_answers integer;
    v_submitted_questions_answered integer;
    v_submitted_correct_answers integer;
    v_daily_completed boolean;
    v_quest_one_completed boolean;
    v_quest_two_completed boolean;
    v_both_quests_completed boolean;
    v_exp_earned integer;
    v_completed_at timestamptz;
    v_was_completed boolean;
    v_exp_delta integer := 0;
    v_total_exp integer;
    v_current_streak integer;
    v_longest_streak integer;
    v_last_qualified_date date;
    v_total_daily_questions integer;
    v_total_daily_correct integer;
    v_new_streak integer;
    v_results jsonb := '[]'::jsonb;
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

    if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
        raise exception using
            errcode = '22023',
            message = 'Answers must be a JSON object.';
    end if;

    if p_current_index is null or p_current_index not between 0 and 4 then
        raise exception using
            errcode = '22023',
            message = 'Current question index is invalid.';
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

    -- Validate every supplied key/value against today's exact five-question
    -- challenge. Correctness is intentionally not checked here; it is read
    -- from public.questions below.
    for v_answer_pair in
        select key, value
        from jsonb_each_text(p_answers)
    loop
        if not exists (
            select 1
            from unnest(v_question_ids) as ids(id)
            where ids.id::text = v_answer_pair.key
        ) then
            raise exception using
                errcode = '22023',
                message = 'Answer contains a question outside today''s challenge.';
        end if;

        if v_answer_pair.value is null
           or v_answer_pair.value not in ('A', 'B', 'C', 'D')
        then
            raise exception using
                errcode = '22023',
                message = 'Answer choice is invalid.';
        end if;
    end loop;

    -- This aggregate is the authority for answered/correct counts. The
    -- client never submits score, correctness, quest state, EXP, or streak.
    select
        count(*) filter (where p_answers ? (q.id::text))::integer,
        count(*) filter (
            where p_answers ? (q.id::text)
              and (p_answers ->> (q.id::text)) = q.correct_answer::text
        )::integer
    into v_questions_answered, v_correct_answers
    from unnest(v_question_ids) as ids(id)
    join public.questions q on q.id = ids.id
    where public.daily_question_is_valid(q);

    v_submitted_questions_answered := v_questions_answered;
    v_submitted_correct_answers := v_correct_answers;

    insert into public.user_daily_progress (user_id, local_date)
    values (v_user_id, v_today)
    on conflict (user_id, local_date) do nothing;

    -- The daily row is the first lock in every terminal mutation. A second
    -- final request waits here, sees daily_completed, and returns the stored
    -- outcome without another EXP or streak transition.
    select
        p.current_index,
        p.answers,
        p.questions_answered,
        p.correct_answers,
        p.daily_completed,
        p.quest_one_completed,
        p.quest_two_completed,
        p.both_quests_completed,
        p.exp_earned,
        p.completed_at
    into
        v_current_index,
        v_effective_answers,
        v_questions_answered,
        v_correct_answers,
        v_daily_completed,
        v_quest_one_completed,
        v_quest_two_completed,
        v_both_quests_completed,
        v_exp_earned,
        v_completed_at
    from public.user_daily_progress p
    where p.user_id = v_user_id
      and p.local_date = v_today
    for update;

    v_was_completed := v_daily_completed;

    if v_was_completed then
        -- Never overwrite a terminal snapshot with a retry's potentially
        -- different payload. The stored aggregate remains authoritative.
        v_exp_delta := 0;
    else
        v_effective_answers := p_answers;
        v_current_index := p_current_index;
        v_questions_answered := v_submitted_questions_answered;
        v_correct_answers := v_submitted_correct_answers;

        if p_finalize then
            if v_questions_answered <> 5 then
                raise exception using
                    errcode = '22023',
                    message = 'All five Daily questions must be answered before submitting.';
            end if;

            v_daily_completed := true;
            v_quest_one_completed := true;
            v_quest_two_completed := v_correct_answers >= 3;
            v_both_quests_completed := v_quest_one_completed and v_quest_two_completed;
            v_exp_delta := 50
                + case when v_quest_two_completed then 20 else 0 end
                + case when v_both_quests_completed then 30 else 0 end;
            v_exp_earned := v_exp_delta;
            v_completed_at := now();

            update public.user_daily_progress
            set
                current_index = v_current_index,
                answers = v_effective_answers,
                questions_answered = v_questions_answered,
                correct_answers = v_correct_answers,
                daily_completed = true,
                quest_one_completed = v_quest_one_completed,
                quest_two_completed = v_quest_two_completed,
                both_quests_completed = v_both_quests_completed,
                exp_earned = v_exp_earned,
                completed_at = v_completed_at
            where user_id = v_user_id
              and local_date = v_today;

            -- Lifetime state is locked only after the user/date row. All
            -- Daily terminal mutations use this same order.
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

            if v_last_qualified_date = v_today then
                v_new_streak := v_current_streak;
            elsif v_last_qualified_date = v_today - 1 then
                v_new_streak := v_current_streak + 1;
            else
                v_new_streak := 1;
            end if;

            update public.user_progress
            set
                total_exp = v_total_exp + v_exp_delta,
                current_streak = v_new_streak,
                longest_streak = greatest(v_longest_streak, v_new_streak),
                last_qualified_date = v_today,
                total_daily_questions = v_total_daily_questions + 5,
                total_daily_correct = v_total_daily_correct + v_correct_answers
            where user_id = v_user_id;
        else
            -- Autosave/resume changes only the one user/date snapshot. It has
            -- no reward, streak, or correctness authority side effect.
            update public.user_daily_progress
            set
                current_index = v_current_index,
                answers = v_effective_answers,
                questions_answered = v_questions_answered,
                correct_answers = v_correct_answers
            where user_id = v_user_id
              and local_date = v_today;
        end if;
    end if;

    if v_was_completed or p_finalize then
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', q.id,
                    'selected', v_effective_answers ->> (q.id::text),
                    'correctAnswer', q.correct_answer,
                    'isCorrect', (v_effective_answers ->> (q.id::text)) = q.correct_answer::text,
                    'explanation', q.full_explanation
                )
                order by ids.ordinality
            ),
            '[]'::jsonb
        )
        into v_results
        from unnest(v_question_ids) with ordinality as ids(id, ordinality)
        join public.questions q on q.id = ids.id
        where public.daily_question_is_valid(q)
          and v_effective_answers ? (q.id::text);
    end if;

    -- A partial save has no need to expose a lifetime row that did not exist
    -- before this request; initialize it for a stable response shape.
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
    where p.user_id = v_user_id;

    return jsonb_build_object(
        'finalized', v_daily_completed,
        'idempotent', v_was_completed,
        'expDelta', v_exp_delta,
        'results', v_results,
        'state', jsonb_build_object(
            'available', true,
            'localDate', v_today,
            'questions', (
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
                from unnest(v_question_ids) with ordinality as ids(id, ordinality)
                join public.questions q on q.id = ids.id
                where public.daily_question_is_valid(q)
            ),
            'progress', jsonb_build_object(
                'currentIndex', case when v_was_completed then v_current_index else p_current_index end,
                'answers', v_effective_answers,
                'questionsAnswered', v_questions_answered,
                'correctAnswers', v_correct_answers,
                'dailyCompleted', v_daily_completed,
                'questOneCompleted', v_quest_one_completed,
                'questTwoCompleted', v_quest_two_completed,
                'bothQuestsCompleted', v_both_quests_completed,
                'expEarned', v_exp_earned,
                'completedAt', v_completed_at
            ),
            'lifetime', jsonb_build_object(
                'totalExp', v_total_exp,
                'currentStreak', v_current_streak,
                'longestStreak', v_longest_streak,
                'lastQualifiedDate', v_last_qualified_date,
                'totalDailyQuestions', v_total_daily_questions,
                'totalDailyCorrect', v_total_daily_correct
            ),
            'stats', jsonb_build_object(
                'questionsAnswered', v_questions_answered,
                'correctAnswers', v_correct_answers,
                'accuracy', case
                    when v_questions_answered > 0
                        then round(v_correct_answers::numeric * 100 / v_questions_answered)::integer
                    else 0
                end,
                'expEarnedToday', v_exp_earned,
                'totalExp', v_total_exp,
                'currentStreak', v_current_streak,
                'longestStreak', v_longest_streak
            ),
            'quests', jsonb_build_array(
                jsonb_build_object(
                    'id', 'complete-daily-five',
                    'label', 'ทำ Daily 5 ให้ครบ',
                    'rewardExp', 50,
                    'completed', v_quest_one_completed
                ),
                jsonb_build_object(
                    'id', 'score-three-of-five',
                    'label', 'ทำถูกอย่างน้อย 3/5',
                    'rewardExp', 20,
                    'completed', v_quest_two_completed
                )
            )
        )
    );
end
$function$;

comment on function public.daily_save_progress(jsonb, integer, boolean) is
    'Authenticated Daily snapshot mutation. Validates today''s challenge and answer letters, computes correctness from questions.correct_answer, and atomically applies the 50/20/30 EXP and streak transition exactly once on terminal completion.';

revoke all on function public.daily_save_progress(jsonb, integer, boolean)
    from public, anon, authenticated, service_role;
grant execute on function public.daily_save_progress(jsonb, integer, boolean)
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
        'public.daily_save_progress(jsonb, integer, boolean)'
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

    if has_table_privilege('authenticated', 'public.user_daily_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'DELETE')
       or has_table_privilege('authenticated', 'public.user_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_progress', 'DELETE')
    then
        raise exception using
            errcode = 'insufficient_privilege',
            message = 'Daily progress tables must not expose authenticated direct writes.';
    end if;
end
$daily_postflight$;

notify pgrst, 'reload schema';
