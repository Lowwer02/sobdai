-- 018_ban_metadata.sql
-- Adds optional metadata columns to support the User Ban / Unban system.
--
-- We REUSE the existing `profiles.status` column ('active' | 'banned',
-- introduced in migration 004) as the source of truth for whether a user is
-- banned. This migration only adds descriptive metadata (when/why/who) — no
-- new boolean, no new tables, no RLS changes.
--
-- RLS note: the existing UPDATE policy on profiles (migration 010) already
-- permits `auth.uid() = id OR role IN ('owner', 'admin')`. Support role is
-- intentionally NOT granted update, matching the spec ("Support cannot Ban").

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS banned_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS banned_by uuid DEFAULT NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.banned_at IS 'Timestamp when the user was banned. NULL when status = active.';
COMMENT ON COLUMN public.profiles.banned_reason IS 'Optional admin-provided reason for the ban.';
COMMENT ON COLUMN public.profiles.banned_by IS 'Profile id of the admin/owner who issued the ban.';
