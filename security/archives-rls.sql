-- Run once in the Supabase SQL Editor (safe to re-run).
-- Guarantees that every account can read and write ONLY its own archive row,
-- no matter what the browser sends. The client already filters by user_id, but
-- this is the server-side guarantee that makes per-account isolation real.
create table if not exists public.archives (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"films":[],"deleted":{}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.archives enable row level security;
alter table public.archives force row level security;

drop policy if exists "archives owner select" on public.archives;
drop policy if exists "archives owner insert" on public.archives;
drop policy if exists "archives owner update" on public.archives;
drop policy if exists "archives owner delete" on public.archives;

create policy "archives owner select" on public.archives
  for select to authenticated using (user_id = auth.uid());
create policy "archives owner insert" on public.archives
  for insert to authenticated with check (user_id = auth.uid());
create policy "archives owner update" on public.archives
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "archives owner delete" on public.archives
  for delete to authenticated using (user_id = auth.uid());

-- Anonymous visitors must never touch archives.
revoke all on public.archives from anon;
grant select, insert, update, delete on public.archives to authenticated;

-- Reasonable size guard (about 6 MB of JSON per account).
alter table public.archives drop constraint if exists archives_data_size;
alter table public.archives add constraint archives_data_size check (pg_column_size(data) < 6000000);
