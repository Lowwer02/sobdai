-- 065_article_storage.sql
-- Sobdai Articles System — Storage bucket for cover and inline images.
--
-- Creates the `article-assets` storage bucket + RLS policies.
-- Bucket settings:
--   - public read access
--   - 4 MB max file size
--   - allowed image types: JPEG, PNG, WEBP, HEIC
-- RLS policies:
--   - public SELECT
--   - INSERT / UPDATE / DELETE restricted to content managers (owner/admin/editor)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'article-assets',
    'article-assets',
    true,
    4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
    public = true,
    file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

drop policy if exists "Article assets are publicly accessible." on storage.objects;
drop policy if exists "Content managers can upload article assets." on storage.objects;
drop policy if exists "Content managers can update article assets." on storage.objects;
drop policy if exists "Content managers can delete article assets." on storage.objects;

-- Policy 1: Public Read Access
create policy "Article assets are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'article-assets' );

-- Policy 2: Admin Upload Access
create policy "Content managers can upload article assets."
  on storage.objects for insert
  with check (
    bucket_id = 'article-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Policy 3: Admin Update Access
create policy "Content managers can update article assets."
  on storage.objects for update
  using (
    bucket_id = 'article-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

-- Policy 4: Admin Delete Access
create policy "Content managers can delete article assets."
  on storage.objects for delete
  using (
    bucket_id = 'article-assets'
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin', 'editor'))
  );

notify pgrst, 'reload schema';
