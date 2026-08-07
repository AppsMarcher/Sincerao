-- Fix da 036: CREATE POLICY nao aceita IF NOT EXISTS no Postgres, entao a
-- reexecucao travou em "avatares_select_proprio ja existe" apos coluna e
-- bucket (esses sim idempotentes) terem passado. Aqui repete tudo de forma
-- segura pra rodar quantas vezes precisar.

alter table perfis add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatares_select_proprio on storage.objects;
create policy avatares_select_proprio on storage.objects
for select to authenticated
using (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatares_insert_proprio on storage.objects;
create policy avatares_insert_proprio on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatares_update_proprio on storage.objects;
create policy avatares_update_proprio on storage.objects
for update to authenticated
using (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatares_delete_proprio on storage.objects;
create policy avatares_delete_proprio on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);
