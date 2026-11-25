-- Real phone notifications (web push): follow, like on a review, new role.
-- Run once in Supabase -> SQL Editor -> New query. Replace __PUSH_SECRET__ with the secret string you also put
-- in the Edge Function secret PUSH_SECRET (the same text in both places).

create table if not exists public.film_push_subs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists film_push_subs_user_idx on public.film_push_subs(user_id);
alter table public.film_push_subs enable row level security;

drop policy if exists "push subs read own"   on public.film_push_subs;
drop policy if exists "push subs insert own" on public.film_push_subs;
drop policy if exists "push subs update own" on public.film_push_subs;
drop policy if exists "push subs delete own" on public.film_push_subs;
create policy "push subs read own"   on public.film_push_subs for select to authenticated using (user_id = auth.uid());
create policy "push subs insert own" on public.film_push_subs for insert to authenticated with check (user_id = auth.uid());
create policy "push subs update own" on public.film_push_subs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push subs delete own" on public.film_push_subs for delete to authenticated using (user_id = auth.uid());
revoke all on public.film_push_subs from anon;

-- Database webhooks: every new follow / like / role calls the send-push Edge Function.
drop trigger if exists film_push_follow on public.film_follows;
create trigger film_push_follow after insert on public.film_follows
  for each row execute function supabase_functions.http_request(
    'https://qphlhhuxtlchejbrkeec.supabase.co/functions/v1/send-push', 'POST',
    '{"Content-Type":"application/json","x-push-secret":"__PUSH_SECRET__"}', '{}', '4000');

drop trigger if exists film_push_like on public.film_review_likes;
create trigger film_push_like after insert on public.film_review_likes
  for each row execute function supabase_functions.http_request(
    'https://qphlhhuxtlchejbrkeec.supabase.co/functions/v1/send-push', 'POST',
    '{"Content-Type":"application/json","x-push-secret":"__PUSH_SECRET__"}', '{}', '4000');

drop trigger if exists film_push_role on public.film_roles;
create trigger film_push_role after insert on public.film_roles
  for each row execute function supabase_functions.http_request(
    'https://qphlhhuxtlchejbrkeec.supabase.co/functions/v1/send-push', 'POST',
    '{"Content-Type":"application/json","x-push-secret":"__PUSH_SECRET__"}', '{}', '4000');
