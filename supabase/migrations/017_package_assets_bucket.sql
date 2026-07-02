-- 017_package_assets_bucket.sql
-- Creates the package-assets storage bucket for package logos and sets up RLS policies.

-- Create the bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('package-assets', 'package-assets', true)
on conflict (id) do nothing;

-- Drop existing policies if any to prevent conflicts when re-running
drop policy if exists "Package Assets are publicly accessible." on storage.objects;
drop policy if exists "Users can upload package assets." on storage.objects;
drop policy if exists "Users can update package assets." on storage.objects;

-- Policy 1: Public Read Access
-- Anyone can view package assets
create policy "Package Assets are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'package-assets' );

-- Policy 2: Authenticated Upload Access
-- Only authenticated users can upload assets (typically Admins, but restricting to auth is enough baseline)
create policy "Users can upload package assets."
  on storage.objects for insert
  with check (
    bucket_id = 'package-assets' 
    and auth.role() = 'authenticated'
  );

-- Policy 3: Authenticated Update Access
-- Allow updates (upsert) for authenticated users
create policy "Users can update package assets."
  on storage.objects for update
  using (
    bucket_id = 'package-assets'
    and auth.role() = 'authenticated'
  );
