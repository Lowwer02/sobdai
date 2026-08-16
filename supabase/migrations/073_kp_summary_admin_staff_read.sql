-- 073_kp_summary_admin_staff_read.sql
-- Sobdai Knowledge Platform — authenticated staff read access for Summary roots.
--
-- Migration 058 removed the historical broad Summary management policies while
-- preserving the writer boundary. That also removed the staff read capability
-- needed by the SECURITY INVOKER admin-library projection. Restore only the
-- narrowly-scoped SELECT policy; direct writes remain denied by 058/068-072.

set local lock_timeout = '5s';

-- Fail closed on the exact read-policy prerequisites. This catalog-only block
-- neither reads nor mutates Summary data.
do $kp_summary_admin_staff_read_preflight$
declare
    v_summaries oid;
    v_staff_function oid;
begin
    v_summaries := to_regclass('public.summaries');
    if v_summaries is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 073 requires public.summaries.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = v_summaries
          and c.relkind = 'r'
          and c.relrowsecurity
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 073 requires RLS on public.summaries.';
    end if;

    v_staff_function := to_regprocedure('public.kp_is_staff()');
    if v_staff_function is null then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 073 requires public.kp_is_staff().';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_staff_function
          and p.prosecdef
          and array_to_string(p.proconfig, ',') ilike '%search_path=pg_catalog, public%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 073 requires the locked SECURITY DEFINER staff predicate.';
    end if;

    -- 073 is forward-only and must not silently replace the existing public
    -- published-read surface left in place by migration 005/058.
    if not exists (
        select 1
        from pg_catalog.pg_policy pol
        where pol.polrelid = v_summaries
          and pol.polname = 'Published summaries viewable by everyone.'
          and pol.polcmd = 'r'
          and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ilike '%is_published%true%'
    ) then
        raise exception using
            errcode = 'check_violation',
            message = 'Knowledge Platform migration 073 requires the existing published Summary read policy.';
    end if;
end
$kp_summary_admin_staff_read_preflight$;

-- PostgreSQL has no CREATE POLICY IF NOT EXISTS. Replacing only this policy
-- keeps repeated isolated application safe without touching any other policy.
drop policy if exists kp_f4_4_summary_staff_read on public.summaries;

create policy kp_f4_4_summary_staff_read
    on public.summaries
    for select
    to authenticated
    using (public.kp_is_staff());

notify pgrst, 'reload schema';
