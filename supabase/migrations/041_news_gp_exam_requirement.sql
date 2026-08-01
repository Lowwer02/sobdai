-- 041_news_gp_exam_requirement.sql
--
-- Adds a tri-state "ภาค ก. exam requirement" field to public.news so each
-- article can state whether applicants must have passed the ก.พ. exam
-- (required / not_required / unspecified). Stored as a single text column with
-- a CHECK constraint — NOT a boolean and NOT derived from category, so editors
-- state it explicitly and recruitment announcements can be gated on it.
--
-- Design choices:
--   * text not null default 'unspecified': every existing row stays valid as
--     'unspecified' with no backfill, and the app never sees a NULL. Unknown
--     values coerce to 'unspecified' in lib/news.ts (the contract treats it as
--     the safe fallback).
--   * CHECK constrains to the three legal values at the DB layer; the app's
--     coercion is the friendly first line of defense, this is the hard backstop.
--   * No RLS changes: the existing news policies (public SELECT on
--     status='published'; content managers FOR ALL) already cover any column.
--   * Follows the project's PostgREST schema-reload convention (NOTIFY pgrst),
--     matching every prior news migration (031–034, 037).

alter table public.news
  add column if not exists gp_exam_requirement text
    not null
    default 'unspecified'
    check (gp_exam_requirement in ('required', 'not_required', 'unspecified'));

comment on column public.news.gp_exam_requirement is
  'Whether applicants must have passed ภาค ก. (the ก.พ. exam). One of required / not_required / unspecified. Defaults to unspecified.';

-- Reload the PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
