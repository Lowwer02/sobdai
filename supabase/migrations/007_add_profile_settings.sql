-- ==========================================
-- Migration 007: Add User Profile Settings
-- ==========================================

-- This migration adds the required columns for the User Settings page 
-- built in Session 6.8.5.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS occupation text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Optional: You can enforce length constraints directly in the database 
-- to match our backend validation rules for extra safety.
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_display_name_check CHECK (char_length(display_name) <= 80),
ADD CONSTRAINT profiles_occupation_check CHECK (char_length(occupation) <= 120);

-- Notify Supabase PostgREST schema cache to reload
NOTIFY pgrst, 'reload schema';
