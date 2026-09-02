-- 089_daily_retention_phase1.sql
-- Run manually in the Supabase SQL Editor after applying the migration.
-- This file is verification-only; it does not create or mutate objects.

do $verify_daily$
declare
    required_relation text;
    required_function text;
begin
    foreach required_relation in array array[
        'public.daily_challenges',
        'public.user_daily_progress',
        'public.user_progress'
    ] loop
        if to_regclass(required_relation) is null then
            raise exception 'Missing Daily relation: %', required_relation;
        end if;
    end loop;

    foreach required_function in array array[
        'public.daily_get_or_create_challenge()',
        'public.daily_get_state()',
        'public.daily_submit_answer(uuid, text, integer)'
    ] loop
        if to_regprocedure(required_function) is null then
            raise exception 'Missing Daily RPC: %', required_function;
        end if;
        if not has_function_privilege('authenticated', required_function, 'EXECUTE')
           or has_function_privilege('anon', required_function, 'EXECUTE')
           or has_function_privilege('service_role', required_function, 'EXECUTE')
        then
            raise exception 'Unexpected Daily RPC ACL: %', required_function;
        end if;
    end loop;

    if to_regprocedure('public.daily_save_progress(jsonb, integer, boolean)') is not null then
        raise exception 'Obsolete snapshot Daily RPC is still installed.';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_daily_progress'
          and column_name in ('quest_one_completed', 'quest_two_completed', 'both_quests_completed')
    ) then
        raise exception 'Obsolete multi-quest Daily columns are still installed.';
    end if;

    if not exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'daily_challenges'
          and t.tgname = 'daily_challenges_immutable'
          and not t.tgisinternal
    ) then
        raise exception 'Daily challenge immutability trigger is missing.';
    end if;

    if has_table_privilege('authenticated', 'public.daily_challenges', 'SELECT')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_daily_progress', 'DELETE')
       or has_table_privilege('authenticated', 'public.user_progress', 'INSERT')
       or has_table_privilege('authenticated', 'public.user_progress', 'UPDATE')
       or has_table_privilege('authenticated', 'public.user_progress', 'DELETE')
    then
        raise exception 'Authenticated direct Daily challenge reads or progress writes are still granted.';
    end if;
end
$verify_daily$;

select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('daily_challenges', 'user_daily_progress', 'user_progress')
order by c.relname;

select
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('daily_challenges', 'user_daily_progress', 'user_progress')
order by tablename, policyname;

select
    indexname,
    tablename,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('daily_challenges', 'user_daily_progress', 'user_progress')
order by tablename, indexname;

select
    n.nspname as schema_name,
    c.relname as table_name,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'daily_challenges'
  and t.tgname = 'daily_challenges_immutable'
  and not t.tgisinternal;

-- Expected challenge properties: at most one row per local_date and five
-- distinct IDs. The query returns violations, which should be zero.
select count(*) as challenge_duplicate_dates
from (
    select local_date
    from public.daily_challenges
    group by local_date
    having count(*) > 1
) duplicates;

select count(*) as challenge_invalid_rows
from public.daily_challenges c
left join public.questions q1 on q1.id = c.question_1_id
left join public.questions q2 on q2.id = c.question_2_id
left join public.questions q3 on q3.id = c.question_3_id
left join public.questions q4 on q4.id = c.question_4_id
left join public.questions q5 on q5.id = c.question_5_id
where q1.id is null or q2.id is null or q3.id is null or q4.id is null or q5.id is null
   or q1.status <> 'Published' or q2.status <> 'Published'
   or q3.status <> 'Published' or q4.status <> 'Published'
   or q5.status <> 'Published';

-- Daily is consistency-only: an incomplete row has zero EXP and a completed
-- row has exactly +50, independent of its informational accuracy count.
select count(*) as impossible_daily_reward_rows
from public.user_daily_progress
where exp_earned not between 0 and 50
   or exp_earned <> case when daily_completed then 50 else 0 end;

-- The answers object is one aggregate map. This reports rows whose stored
-- terminal-answer count disagrees with the JSON object cardinality; expected 0.
select count(*) as inconsistent_daily_answer_counts
from public.user_daily_progress
where questions_answered <> (
    select count(*)
    from jsonb_object_keys(
        case
            when jsonb_typeof(answers) = 'object' then answers
            else '{}'::jsonb
        end
    ) as answer_key
);
