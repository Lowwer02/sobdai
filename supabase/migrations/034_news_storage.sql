-- 034_news_storage.sql
-- Government News — Phase 1, Migration D: storage bucket for cover/inline images.
--
-- Creates ONLY the `news-assets` storage bucket + its RLS policies. Mirrors the
-- package-assets bucket pattern (migration 017): public bucket, public read,
-- authenticated write. Tightens WRITE to the admin-exists predicate
-- (owner/admin/editor) per the module convention established in migrations
-- 031–033.
--
-- Publish-state visibility is NOT enforced at the storage layer: a bucket
-- object has no knowledge of the news row that references it. The public-read
-- gate on COVER IMAGES lives on `news` (migration 031): anon cannot read a
-- draft news row, so its cover_image_url is unreachable even though the object
-- is technically public. This is identical to how avatars/package-assets behave.
--
-- SAFE: adds one bucket + policies. Touches nothing else.

-- Create the bucket if it doesn't exist (public read).
insert into storage.buckets (id, name, public)
values ('news-assets', 'news-assets', true)
on conflict (id) do update set public = true;

-- Drop existing policies if any to stay idempotent on re-run (matches 017).
drop policy if exists "News assets are publicly accessible." on storage.objects;
drop policy if exists "Content managers can upload news assets." on storage.objects;
drop policy if exists "Content managers can update news assets." on storage.objects;
drop policy if exists "Content managers can delete news assets." on storage.objects;

-- Policy 1: Public Read Access.
-- Anyone can read news assets. Publish-state is gated by the `news` table RLS,
-- not here (see header note).
create policy "News assets are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'news-assets' );

-- Policy 2: Admin Upload Access.
-- Only owner/admin/editor can upload news assets. Admin-exists predicate is
-- uniform with the rest of the module (migrations 031–033).
create policy "Content managers can upload news assets."
  on storage.objects for insert
  with check (
    bucket_id = 'news-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Policy 3: Admin Update Access.
create policy "Content managers can update news assets."
  on storage.objects for update
  using (
    bucket_id = 'news-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Policy 4: Admin Delete Access.
create policy "Content managers can delete news assets."
  on storage.objects for delete
  using (
    bucket_id = 'news-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );
