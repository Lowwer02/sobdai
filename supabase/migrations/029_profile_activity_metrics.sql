-- 029_profile_activity_metrics.sql
-- Phase 1 Business Health Dashboard usage metrics.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
ON public.profiles (last_seen_at)
WHERE last_seen_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
ON public.profiles (created_at);

COMMENT ON COLUMN public.profiles.last_seen_at IS
'Latest lightweight user activity timestamp for DAU/MAU dashboard counts. Updated at most once per user per Bangkok calendar day by the app shell.';

NOTIFY pgrst, 'reload schema';
