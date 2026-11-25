-- Notifications v2: per-kind settings, admin announcements, and abuse protection.
-- Run once in Supabase -> SQL Editor (after film-push.sql). Safe to run again.

-- 1) per-kind settings kept next to each subscription: {"follow":true,"like":true,"role":true,"announce":true}
alter table public.film_push_subs add column if not exists prefs jsonb not null default '{}'::jsonb;

-- 2) abuse protection: at most 10 devices per account, sane sizes, https endpoints only
create or replace function public.film_push_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.endpoint !~ '^https://' or length(new.endpoint) > 700 or length(new.p256dh) > 200 or length(new.auth) > 100 then
    raise exception 'invalid push subscription' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.film_push_subs where user_id = new.user_id) >= 10 then
    raise exception 'too many devices' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.film_push_limit() from public, anon, authenticated;
drop trigger if exists film_push_limit_trg on public.film_push_subs;
create trigger film_push_limit_trg before insert or update on public.film_push_subs
  for each row execute function public.film_push_limit();

-- 3) hourly cap log used by the send-push function (nobody but the server can read or write it)
create table if not exists public.film_push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists film_push_log_user_idx on public.film_push_log(user_id, created_at desc);
alter table public.film_push_log enable row level security;
revoke all on public.film_push_log from anon, authenticated;

-- 4) admin announcements reach everyone who turned notifications on
drop trigger if exists film_push_announce on public.film_announcements;
create trigger film_push_announce after insert on public.film_announcements
  for each row when (new.active) execute function public.film_push_notify();
