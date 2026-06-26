-- 003_add_is_common_to_questions.sql
-- Description: Adds is_common field to questions table to distinguish between common questions and specialized ones.

alter table public.questions add column if not exists is_common boolean not null default true;
