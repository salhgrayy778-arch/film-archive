-- Run once in the Supabase SQL Editor AFTER film-hardening.sql (safe to re-run).
-- Adds: likes on reviews, site announcements (admin), and account suspension (admin).

-- 1) Likes on reviews (one heart per member per review, not on your own review)
create table if not exists public.film_review_likes (
  review_id bigint not null references public.film_public_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
create index if not exists film_review_likes_user_idx on public.film_review_likes(user_id);
alter table public.film_review_likes enable row level security;
drop policy if exists "film likes read" on public.film_review_likes;
create policy "film likes read" on public.film_review_likes for select to anon, authenticated using (true);
drop policy if exists "film likes insert own" on public.film_review_likes;
create policy "film likes insert own" on public.film_review_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.film_email_verified()
              and not exists (select 1 from public.film_public_reviews r where r.id = review_id and r.user_id = (select auth.uid())));
drop policy if exists "film likes delete own" on public.film_review_likes;
create policy "film likes delete own" on public.film_review_likes for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.film_review_likes from anon, authenticated;
grant select on public.film_review_likes to anon, authenticated;
grant insert, delete on public.film_review_likes to authenticated;

create or replace function public.film_throttle_likes() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.film_review_likes where user_id = new.user_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'too many likes, try again later' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.film_throttle_likes() from public;
drop trigger if exists film_likes_throttle on public.film_review_likes;
create trigger film_likes_throttle before insert on public.film_review_likes for each row execute function public.film_throttle_likes();

-- 2) Site announcements: admins write, everyone reads the active ones
create table if not exists public.film_announcements (
  id bigserial primary key,
  message text not null check (char_length(message) between 1 and 240),
  level text not null default 'info' check (level in ('info', 'warn')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table public.film_announcements enable row level security;
drop policy if exists "film announcements read" on public.film_announcements;
create policy "film announcements read" on public.film_announcements for select to anon, authenticated
  using (active or public.film_is_admin());
drop policy if exists "film announcements admin write" on public.film_announcements;
create policy "film announcements admin write" on public.film_announcements for all to authenticated
  using (public.film_is_admin()) with check (public.film_is_admin());
revoke all on public.film_announcements from anon, authenticated;
grant select on public.film_announcements to anon, authenticated;
grant insert, update, delete on public.film_announcements to authenticated;
grant usage, select on sequence public.film_announcements_id_seq to authenticated;

create or replace function public.film_log_announcement() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.film_audit(actor, action, detail)
    values (auth.uid(), 'announcement_' || lower(tg_op), jsonb_build_object('message', left(coalesce(new.message, old.message), 80), 'active', coalesce(new.active, false)));
  return coalesce(new, old);
end $$;
revoke all on function public.film_log_announcement() from public;
drop trigger if exists film_announcement_audit on public.film_announcements;
create trigger film_announcement_audit after insert or update or delete on public.film_announcements
  for each row execute function public.film_log_announcement();

-- 3) Suspend / restore a member (cannot sign in or post while suspended). Not for yourself or other admins.
create or replace function public.film_admin_set_ban(p_user uuid, p_ban boolean) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare victim_email text;
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'cannot suspend yourself'; end if;
  if exists (select 1 from public.film_roles where user_id = p_user and role = 'admin') then raise exception 'remove the admin role first'; end if;
  select email into victim_email from auth.users where id = p_user;
  if victim_email is null then raise exception 'user not found'; end if;
  update auth.users set banned_until = case when p_ban then now() + interval '100 years' else null end where id = p_user;
  if p_ban then delete from auth.sessions where user_id = p_user; end if;
  insert into public.film_audit(actor, action, target_user, detail)
    values (auth.uid(), case when p_ban then 'user_suspended' else 'user_restored' end, p_user, jsonb_build_object('email', victim_email));
end $$;
revoke all on function public.film_admin_set_ban(uuid, boolean) from public;
grant execute on function public.film_admin_set_ban(uuid, boolean) to authenticated;
