-- 002_add_question_metadata.sql
-- Description: Adds Subject, Law, and Topic metadata columns to public.questions table for future-proofing question reuse across packages and organizations.
-- Safe to run on production. Existing questions will have NULL values for these fields.

alter table public.questions 
add column if not exists subject text,
add column if not exists law text,
add column if not exists topic text;
