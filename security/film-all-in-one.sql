-- ONE FILE, run once in Supabase SQL Editor (safe to re-run). Does everything in order:
-- 1) public profiles/follows/reviews  2) roles + review rules  3) staff panel  4) admin can delete accounts
-- 5) fake e-mails blocked, only confirmed e-mails can post  6) size limits, throttles, reserved names
-- 7) review likes, announcements, suspend accounts  8) moderator desk: timed suspensions, review reports
-- 9) makes saleh@gmail.com admin (change the e-mail below if needed)

-- ===== film-social-rls =====
-- Execute once in Supabase SQL Editor. Private archives remain private.
-- Public data contains only explicitly published profile fields and movie reviews.
create table if not exists public.film_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'فیلم‌باز',
  bio text not null default '',
  avatar text not null default '',
  favorites jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint film_profile_name_length check (char_length(display_name) between 1 and 60),
  constraint film_profile_bio_length check (char_length(bio) <= 500),
  constraint film_profile_avatar_length check (char_length(avatar) <= 170000),
  constraint film_profile_favorites check (jsonb_typeof(favorites)='array' and jsonb_array_length(favorites)<=10)
);
create table if not exists public.film_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,followed_id),
  constraint film_no_self_follow check(follower_id<>followed_id)
);
create index if not exists film_follows_followed_idx on public.film_follows(followed_id,created_at desc);
create table if not exists public.film_public_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  film_id bigint not null check(film_id between 1 and 999999999999),
  film_title text not null check(char_length(film_title) between 1 and 180),
  rating smallint check(rating between 1 and 10),
  review text not null check(char_length(review) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists film_reviews_feed_idx on public.film_public_reviews(user_id,created_at desc);
create index if not exists film_reviews_movie_idx on public.film_public_reviews(film_id,created_at desc);
alter table public.film_public_profiles enable row level security;
alter table public.film_follows enable row level security;
alter table public.film_public_reviews enable row level security;
drop policy if exists "film profiles readable" on public.film_public_profiles;
create policy "film profiles readable" on public.film_public_profiles for select to anon, authenticated using(true);
drop policy if exists "film profiles insert own" on public.film_public_profiles;
create policy "film profiles insert own" on public.film_public_profiles for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists "film profiles update own" on public.film_public_profiles;
create policy "film profiles update own" on public.film_public_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists "film follows read" on public.film_follows;
create policy "film follows read" on public.film_follows for select to authenticated using(true);
drop policy if exists "film follows insert own" on public.film_follows;
create policy "film follows insert own" on public.film_follows for insert to authenticated with check(follower_id=(select auth.uid()));
drop policy if exists "film follows delete own" on public.film_follows;
create policy "film follows delete own" on public.film_follows for delete to authenticated using(follower_id=(select auth.uid()));
drop policy if exists "film reviews read" on public.film_public_reviews;
create policy "film reviews read" on public.film_public_reviews for select to authenticated using(true);
drop policy if exists "film reviews insert own" on public.film_public_reviews;
create policy "film reviews insert own" on public.film_public_reviews for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists "film reviews edit own" on public.film_public_reviews;
create policy "film reviews edit own" on public.film_public_reviews for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists "film reviews delete own" on public.film_public_reviews;
create policy "film reviews delete own" on public.film_public_reviews for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,update on public.film_public_profiles to authenticated;
grant select on public.film_public_profiles to anon;
grant select,insert,delete on public.film_follows to authenticated;
grant select,insert,update,delete on public.film_public_reviews to authenticated;
grant usage,select on sequence public.film_public_reviews_id_seq to authenticated;
-- Do not grant anon access: sign-in is required to browse user social activity.

-- ===== film-social-v2 =====
-- Run once in the Supabase SQL Editor AFTER security/film-social-rls.sql (safe to re-run).
-- Adds: public watched list, roles (member / critic / admin), one review per user per film,
-- reviews + follow counts readable by everyone, and admin moderation rights.

-- 1) Public watched films on the public profile (shown only if the user keeps it enabled)
alter table public.film_public_profiles add column if not exists watched jsonb not null default '[]'::jsonb;
alter table public.film_public_profiles drop constraint if exists film_profile_watched;
alter table public.film_public_profiles add constraint film_profile_watched
  check (jsonb_typeof(watched)='array' and jsonb_array_length(watched)<=80);

-- 2) Roles. Nobody can grant themselves a role: only admins (or you, in the SQL editor).
create table if not exists public.film_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('critic','admin')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.film_roles enable row level security;
create or replace function public.film_is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists(select 1 from public.film_roles where user_id = auth.uid() and role = 'admin') $$;
revoke all on function public.film_is_admin() from public;
grant execute on function public.film_is_admin() to anon, authenticated;
drop policy if exists "film roles readable" on public.film_roles;
create policy "film roles readable" on public.film_roles for select to anon, authenticated using (true);
drop policy if exists "film roles admin write" on public.film_roles;
create policy "film roles admin write" on public.film_roles for all to authenticated
  using (public.film_is_admin()) with check (public.film_is_admin());
grant select on public.film_roles to anon, authenticated;
grant insert, update, delete on public.film_roles to authenticated;

-- 3a) A rating alone (no text) is allowed, like Letterboxd
alter table public.film_public_reviews drop constraint if exists film_public_reviews_review_check;
alter table public.film_public_reviews drop constraint if exists film_public_reviews_review_len;
alter table public.film_public_reviews add constraint film_public_reviews_review_len check (char_length(review) <= 1500);
alter table public.film_public_reviews alter column review set default '';

-- 3) Reviews: one per user per film, readable by everyone, admins can moderate
delete from public.film_public_reviews a using public.film_public_reviews b
  where a.user_id = b.user_id and a.film_id = b.film_id and a.id < b.id;
create unique index if not exists film_reviews_one_per_user on public.film_public_reviews(user_id, film_id);
drop policy if exists "film reviews read" on public.film_public_reviews;
create policy "film reviews read" on public.film_public_reviews for select to anon, authenticated using (true);
drop policy if exists "film reviews admin delete" on public.film_public_reviews;
create policy "film reviews admin delete" on public.film_public_reviews for delete to authenticated using (public.film_is_admin());
grant select on public.film_public_reviews to anon;

-- 4) Follow counts are public; only you can follow/unfollow as yourself
drop policy if exists "film follows read" on public.film_follows;
create policy "film follows read" on public.film_follows for select to anon, authenticated using (true);
grant select on public.film_follows to anon;

-- 5) Make yourself the first admin (replace the UUID with your user id from Authentication > Users):
-- insert into public.film_roles(user_id, role) values ('00000000-0000-0000-0000-000000000000', 'admin')
--   on conflict (user_id) do update set role = 'admin';
-- Give someone the critic role:
-- insert into public.film_roles(user_id, role) values ('<their user id>', 'critic')
--   on conflict (user_id) do update set role = 'critic';

-- ===== film-admin-v3 =====
-- Run once in the Supabase SQL Editor AFTER security/film-social-v2.sql (safe to re-run).
-- Adds: moderator role + multi-role users, audit log (who became critic/moderator/admin and when,
-- who deleted which review), online presence, admin user list/stats, and catalog corrections
-- that moderators/admins can make for everyone. All checks run inside the database.

-- 1) Roles: a user can hold several roles (critic + admin, ...). New role: moderator.
alter table public.film_roles drop constraint if exists film_roles_role_check;
alter table public.film_roles add constraint film_roles_role_check check (role in ('critic','moderator','admin'));
alter table public.film_roles drop constraint if exists film_roles_pkey;
alter table public.film_roles add primary key (user_id, role);

create or replace function public.film_has_role(r text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists(select 1 from public.film_roles where user_id = auth.uid() and role = r) $$;
create or replace function public.film_is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.film_has_role('admin') $$;
create or replace function public.film_is_staff() returns boolean
  language sql stable security definer set search_path = public as
  $$ select public.film_has_role('admin') or public.film_has_role('moderator') $$;
revoke all on function public.film_has_role(text) from public;
revoke all on function public.film_is_staff() from public;
grant execute on function public.film_has_role(text) to anon, authenticated;
grant execute on function public.film_is_admin() to anon, authenticated;
grant execute on function public.film_is_staff() to anon, authenticated;

-- 2) Audit log (staff can read; nobody writes directly, only triggers / functions below)
create table if not exists public.film_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  target_user uuid,
  film_id bigint,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists film_audit_at_idx on public.film_audit(at desc);
create index if not exists film_audit_action_idx on public.film_audit(action, at desc);
alter table public.film_audit enable row level security;
drop policy if exists "film audit staff read" on public.film_audit;
create policy "film audit staff read" on public.film_audit for select to authenticated using (public.film_is_staff());
revoke all on public.film_audit from anon, authenticated;
grant select on public.film_audit to authenticated;

-- 3) Roles can be changed only through film_set_role (admin only). Every change is logged.
drop policy if exists "film roles admin write" on public.film_roles;
revoke insert, update, delete on public.film_roles from authenticated;

create or replace function public.film_log_role() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.film_audit(actor, action, target_user, detail)
      values (auth.uid(), 'role_granted', new.user_id, jsonb_build_object('role', new.role));
    return new;
  else
    insert into public.film_audit(actor, action, target_user, detail)
      values (auth.uid(), 'role_revoked', old.user_id, jsonb_build_object('role', old.role));
    return old;
  end if;
end $$;
drop trigger if exists film_roles_audit on public.film_roles;
create trigger film_roles_audit after insert or delete on public.film_roles
  for each row execute function public.film_log_role();

-- roles that already exist (e.g. your own admin row) get a history entry once
insert into public.film_audit(at, actor, action, target_user, detail)
  select r.created_at, r.granted_by, 'role_granted', r.user_id, jsonb_build_object('role', r.role, 'backfill', true)
  from public.film_roles r
  where not exists (select 1 from public.film_audit a where a.action = 'role_granted'
                    and a.target_user = r.user_id and a.detail->>'role' = r.role);

create or replace function public.film_set_role(p_user uuid, p_role text, p_on boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_role not in ('critic','moderator','admin') then raise exception 'bad role'; end if;
  if p_on then
    insert into public.film_roles(user_id, role, granted_by) values (p_user, p_role, auth.uid())
      on conflict (user_id, role) do nothing;
  else
    if p_role = 'admin' and p_user = auth.uid()
       and (select count(*) from public.film_roles where role = 'admin') <= 1 then
      raise exception 'cannot remove the last admin';
    end if;
    delete from public.film_roles where user_id = p_user and role = p_role;
  end if;
end $$;
revoke all on function public.film_set_role(uuid, text, boolean) from public;
grant execute on function public.film_set_role(uuid, text, boolean) to authenticated;

-- 4) Review moderation: admins and moderators can delete anyone's review; deletions are logged
drop policy if exists "film reviews admin delete" on public.film_public_reviews;
drop policy if exists "film reviews staff delete" on public.film_public_reviews;
create policy "film reviews staff delete" on public.film_public_reviews for delete to authenticated
  using (public.film_is_staff());

create or replace function public.film_log_review_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    insert into public.film_audit(actor, action, target_user, film_id, detail)
      values (auth.uid(), 'review_deleted', old.user_id, old.film_id,
              jsonb_build_object('rating', old.rating, 'review', left(coalesce(old.review, ''), 400)));
  end if;
  return old;
end $$;
drop trigger if exists film_reviews_audit on public.film_public_reviews;
create trigger film_reviews_audit after delete on public.film_public_reviews
  for each row execute function public.film_log_review_delete();

-- 5) Presence: every signed-in visitor pings about once a minute; only staff can read it
create table if not exists public.film_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visits integer not null default 1,
  last_path text not null default ''
);
alter table public.film_presence enable row level security;
revoke all on public.film_presence from anon, authenticated;
drop policy if exists "film presence staff read" on public.film_presence;
create policy "film presence staff read" on public.film_presence for select to authenticated using (public.film_is_staff());
grant select on public.film_presence to authenticated;

create or replace function public.film_ping(p_path text default '') returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.film_presence(user_id, last_path) values (auth.uid(), left(coalesce(p_path, ''), 120))
  on conflict (user_id) do update set
    visits = public.film_presence.visits + case when public.film_presence.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen = now(),
    last_path = excluded.last_path;
end $$;
revoke all on function public.film_ping(text) from public;
grant execute on function public.film_ping(text) to authenticated;

-- 6) Admin-only user directory and numbers (reads auth.users inside the database, no secret key in the browser)
drop function if exists public.film_admin_users(text, int, int);
create or replace function public.film_admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
  returns table(user_id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz,
                email_confirmed boolean, last_seen timestamptz, visits int, last_path text,
                roles text[], review_count bigint, followers bigint, banned boolean, total bigint)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, coalesce(p.display_name, '')::text, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null), pr.last_seen, coalesce(pr.visits, 0), coalesce(pr.last_path, '')::text,
         coalesce((select array_agg(r.role order by r.role) from public.film_roles r where r.user_id = u.id), '{}'::text[]),
         (select count(*) from public.film_public_reviews v where v.user_id = u.id),
         (select count(*) from public.film_follows f where f.followed_id = u.id),
         (u.banned_until is not null and u.banned_until > now()),
         count(*) over()
  from auth.users u
  left join public.film_public_profiles p on p.user_id = u.id
  left join public.film_presence pr on pr.user_id = u.id
  where coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
  order by coalesce(pr.last_seen, u.last_sign_in_at, u.created_at) desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;
revoke all on function public.film_admin_users(text, int, int) from public;
grant execute on function public.film_admin_users(text, int, int) to authenticated;

create or replace function public.film_admin_stats() returns jsonb
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'online_now', (select count(*) from public.film_presence where last_seen > now() - interval '3 minutes'),
    'active_today', (select count(*) from public.film_presence where last_seen > now() - interval '24 hours'),
    'active_7d', (select count(*) from public.film_presence where last_seen > now() - interval '7 days'),
    'signed_in_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'never_signed_in', (select count(*) from auth.users where last_sign_in_at is null),
    'reviews', (select count(*) from public.film_public_reviews),
    'reviews_7d', (select count(*) from public.film_public_reviews where created_at > now() - interval '7 days'),
    'follows', (select count(*) from public.film_follows),
    'critics', (select count(*) from public.film_roles where role = 'critic'),
    'moderators', (select count(*) from public.film_roles where role = 'moderator'),
    'admins', (select count(*) from public.film_roles where role = 'admin'));
end $$;
revoke all on function public.film_admin_stats() from public;
grant execute on function public.film_admin_stats() to authenticated;

-- 7) Catalog corrections. Everyone reads them (the site applies them on top of the cached TMDB
--    catalog); only admins and moderators can add/change/remove them.
create table if not exists public.film_catalog_overrides (
  film_id bigint primary key,
  patch jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint film_override_patch check (jsonb_typeof(patch) = 'object' and char_length(patch::text) <= 6000),
  constraint film_override_note check (char_length(note) <= 300)
);
alter table public.film_catalog_overrides enable row level security;
drop policy if exists "film overrides read" on public.film_catalog_overrides;
create policy "film overrides read" on public.film_catalog_overrides for select to anon, authenticated using (true);
drop policy if exists "film overrides staff write" on public.film_catalog_overrides;
create policy "film overrides staff write" on public.film_catalog_overrides for all to authenticated
  using (public.film_is_staff()) with check (public.film_is_staff());
grant select on public.film_catalog_overrides to anon;
grant select, insert, update, delete on public.film_catalog_overrides to authenticated;

create or replace function public.film_override_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'DELETE' then
    insert into public.film_audit(actor, action, film_id, detail) values (auth.uid(), 'catalog_reset', old.film_id, '{}'::jsonb);
    return old;
  end if;
  for k in select jsonb_object_keys(new.patch) loop
    if k not in ('fa_title','title','original_title','director','cast','country','runtime','release_date','overview','poster_path') then
      raise exception 'field not allowed: %', k;
    end if;
  end loop;
  new.updated_by := auth.uid();
  new.updated_at := now();
  insert into public.film_audit(actor, action, film_id, detail)
    values (auth.uid(), 'catalog_edit', new.film_id,
            jsonb_build_object('fields', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(new.patch) x),
                               'hidden', new.hidden));
  return new;
end $$;
drop trigger if exists film_override_guard_trg on public.film_catalog_overrides;
create trigger film_override_guard_trg before insert or update or delete on public.film_catalog_overrides
  for each row execute function public.film_override_guard();

-- 8) Make yourself admin (replace the e-mail) and give someone else a role. After this file,
--    roles are written with the function, which also writes the history:
-- select public.film_set_role((select id from auth.users where email = 'you@example.com'), 'admin', true);
-- select public.film_set_role((select id from auth.users where email = 'someone@example.com'), 'critic', true);
-- (When you run these in the SQL Editor there is no signed-in user, so use the direct form instead:)
-- insert into public.film_roles(user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id, role) do nothing;

-- ===== film-admin-v4 =====
-- Run once in the Supabase SQL Editor AFTER security/film-admin-v3.sql (safe to re-run).
-- Adds: admin-only deletion of a member account. Everything the member owns (archive, public
-- profile, reviews, follows, roles, presence) is removed by the database cascade; an entry with
-- the e-mail stays in the activity log. Admins cannot delete themselves or another admin
-- (remove the admin role first), so the site can never be left without an admin.
create or replace function public.film_admin_delete_user(p_user uuid) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare victim_email text;
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_user is null then raise exception 'no user'; end if;
  if p_user = auth.uid() then raise exception 'cannot delete yourself'; end if;
  if exists (select 1 from public.film_roles where user_id = p_user and role = 'admin') then
    raise exception 'remove the admin role first';
  end if;
  select email into victim_email from auth.users where id = p_user;
  if victim_email is null then raise exception 'user not found'; end if;
  insert into public.film_audit(actor, action, target_user, detail)
    values (auth.uid(), 'user_deleted', p_user, jsonb_build_object('email', victim_email));
  delete from auth.users where id = p_user;
end $$;
revoke all on function public.film_admin_delete_user(uuid) from public;
grant execute on function public.film_admin_delete_user(uuid) to authenticated;

-- ===== film-email-guard =====
-- Run once in the Supabase SQL Editor AFTER film-admin-v4.sql (safe to re-run).
-- Goal: only real, owned e-mail addresses can use the social features.
--  1) Sign-ups with malformed or throw-away (disposable) e-mail domains are rejected by the database itself.
--  2) Posting reviews, following people and publishing a public profile require a CONFIRMED e-mail
--     (the person must have clicked the link we sent to that address).
-- IMPORTANT: also switch on  Authentication -> Sign In / Providers -> Email -> "Confirm email"  in Supabase,
-- otherwise Supabase marks every address as confirmed without checking it.
create table if not exists public.film_blocked_email_domains (domain text primary key check (domain = lower(domain)));
alter table public.film_blocked_email_domains enable row level security;
revoke all on public.film_blocked_email_domains from anon, authenticated;
insert into public.film_blocked_email_domains(domain) values
  ('10minutemail.co.uk'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('1secmail.com'),
  ('1secmail.net'),
  ('1secmail.org'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonbox.net'),
  ('anonymbox.com'),
  ('armyspy.com'),
  ('bheps.com'),
  ('bugmenot.com'),
  ('burnermail.io'),
  ('byom.de'),
  ('cock.li'),
  ('cool.fr.nf'),
  ('courriel.fr.nf'),
  ('crazymailing.com'),
  ('cuvox.de'),
  ('dayrep.com'),
  ('dcctb.com'),
  ('deadaddress.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('discardmail.de'),
  ('disposableinbox.com'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('dropmail.ml'),
  ('e4ward.com'),
  ('easytrashmail.com'),
  ('eelmail.com'),
  ('einrot.com'),
  ('einrot.de'),
  ('email-fake.com'),
  ('emailfake.com'),
  ('emailondeck.com'),
  ('emailsensei.com'),
  ('emailtemporanea.net'),
  ('emltmp.com'),
  ('esiix.com'),
  ('ezztt.com'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('fakemailgenerator.com'),
  ('fastacura.com'),
  ('fastchevy.com'),
  ('fastmazda.com'),
  ('fexbox.org'),
  ('fexbox.ru'),
  ('fleckens.hu'),
  ('generator.email'),
  ('get2mail.fr'),
  ('getairmail.com'),
  ('getnada.com'),
  ('gmailnator.com'),
  ('grr.la'),
  ('guerillamail.com'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('gustr.com'),
  ('harakirimail.com'),
  ('icznn.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  ('incognitomail.com'),
  ('instant-mail.de'),
  ('jetable.fr.nf'),
  ('jourrapide.com'),
  ('kzccv.com'),
  ('laafd.com'),
  ('lroid.com'),
  ('luxusmail.org'),
  ('mail-temp.com'),
  ('mail.gw'),
  ('mail.tm'),
  ('mailbox.in.ua'),
  ('mailbox92.biz'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailexpire.com'),
  ('mailforspam.com'),
  ('mailinator.com'),
  ('mailmoat.com'),
  ('mailnesia.com'),
  ('mailnull.com'),
  ('mailpoof.com'),
  ('mailsac.com'),
  ('mailscrap.com'),
  ('mailslite.com'),
  ('mailtemp.info'),
  ('mailtothis.com'),
  ('mailzi.ru'),
  ('mailzilla.com'),
  ('mega.zik.dj'),
  ('meltmail.com'),
  ('mintemail.com'),
  ('minuteinbox.com'),
  ('moakt.cc'),
  ('moakt.com'),
  ('mohmal.com'),
  ('moncourrier.fr.nf'),
  ('monemail.fr.nf'),
  ('monmail.fr.nf'),
  ('mt2014.com'),
  ('mt2015.com'),
  ('myspaceinc.com'),
  ('mytemp.email'),
  ('nada.email'),
  ('nada.ltd'),
  ('nepwk.com'),
  ('noclickemail.com'),
  ('nomail.xl.cx'),
  ('nospam.ze.tc'),
  ('nowmymail.com'),
  ('objectmail.com'),
  ('onewaymail.com'),
  ('owlymail.com'),
  ('pjjkp.com'),
  ('pokemail.net'),
  ('pookmail.com'),
  ('qiott.com'),
  ('quickinbox.com'),
  ('rcpt.at'),
  ('receiveee.com'),
  ('rhyta.com'),
  ('rmqkr.net'),
  ('s0ny.net'),
  ('safetymail.info'),
  ('selfdestructingmail.com'),
  ('sharedmailbox.org'),
  ('sharklasers.com'),
  ('shieldedmail.com'),
  ('smashmail.de'),
  ('snakemail.com'),
  ('sneakemail.com'),
  ('sogetthis.com'),
  ('soodonims.com'),
  ('spam4.me'),
  ('spamavert.com'),
  ('spambog.com'),
  ('spambox.us'),
  ('spamex.com'),
  ('spamfree24.org'),
  ('spamgourmet.com'),
  ('spamhereplease.com'),
  ('spaml.com'),
  ('speed.1s.fr'),
  ('stuffmail.de'),
  ('supermailer.jp'),
  ('superrito.com'),
  ('tafmail.com'),
  ('techemail.com'),
  ('teleworm.us'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('temp-mail.ru'),
  ('tempail.com'),
  ('tempe-mail.com'),
  ('tempinbox.com'),
  ('tempm.com'),
  ('tempmail.com'),
  ('tempmail.dev'),
  ('tempmail.email'),
  ('tempmail.net'),
  ('tempmail.plus'),
  ('tempmailaddress.com'),
  ('tempmailo.com'),
  ('temporary-mail.net'),
  ('temporaryemail.net'),
  ('temporaryforwarding.com'),
  ('tempr.email'),
  ('tempsky.com'),
  ('thankyou2010.com'),
  ('thisisnotmyrealemail.com'),
  ('throwam.com'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmails.net'),
  ('tmpeml.com'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('tradermail.info'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.io'),
  ('trashmail.me'),
  ('trashmail.net'),
  ('trbvm.com'),
  ('trialmail.de'),
  ('twinmail.de'),
  ('txcct.com'),
  ('uroid.com'),
  ('vjuum.com'),
  ('vomoto.com'),
  ('webemail.me'),
  ('wegwerfemail.de'),
  ('wegwerfmail.de'),
  ('wegwerfmail.net'),
  ('wegwerfmail.org'),
  ('wh4f.org'),
  ('wuuvo.com'),
  ('wwjmp.com'),
  ('xagloo.com'),
  ('xojxe.com'),
  ('yep.it'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('zehnminuten.de'),
  ('zippymail.info'),
  ('zoemail.org')
on conflict do nothing;

create or replace function public.film_guard_email() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
declare e text; d text;
begin
  e := lower(btrim(coalesce(new.email, '')));
  if e = '' then return new; end if;  -- phone / anonymous users are not used by this site
  if length(e) > 254 or e !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  d := split_part(e, '@', 2);
  if exists (select 1 from public.film_blocked_email_domains b where d = b.domain or d like '%.' || b.domain) then
    raise exception 'disposable email address not allowed' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.film_guard_email() from public;
drop trigger if exists film_guard_email on auth.users;
create trigger film_guard_email before insert or update of email on auth.users
  for each row execute function public.film_guard_email();

create or replace function public.film_email_verified() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email_confirmed_at is not null and (banned_until is null or banned_until < now()) from auth.users where id = auth.uid()), false)
$$;
revoke all on function public.film_email_verified() from public;
grant execute on function public.film_email_verified() to authenticated;

drop policy if exists "film profiles insert own" on public.film_public_profiles;
create policy "film profiles insert own" on public.film_public_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.film_email_verified());
drop policy if exists "film profiles update own" on public.film_public_profiles;
create policy "film profiles update own" on public.film_public_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.film_email_verified());
drop policy if exists "film follows insert own" on public.film_follows;
create policy "film follows insert own" on public.film_follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and public.film_email_verified());
drop policy if exists "film reviews insert own" on public.film_public_reviews;
create policy "film reviews insert own" on public.film_public_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and public.film_email_verified());
drop policy if exists "film reviews edit own" on public.film_public_reviews;
create policy "film reviews edit own" on public.film_public_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.film_email_verified());

-- ===== film-hardening =====
-- Run once in the Supabase SQL Editor AFTER film-email-guard.sql (safe to re-run).
-- Extra protection against abuse: size/format limits, spam throttles and look-alike staff names.

-- 1) Public profile content limits (the database enforces them even if someone bypasses the website)
alter table public.film_public_profiles drop constraint if exists film_profile_avatar_format;
alter table public.film_public_profiles add constraint film_profile_avatar_format
  check (avatar = '' or avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$');
alter table public.film_public_profiles drop constraint if exists film_profile_json_size;
alter table public.film_public_profiles add constraint film_profile_json_size
  check (octet_length(favorites::text) <= 20000 and octet_length(watched::text) <= 90000);
alter table public.film_public_reviews drop constraint if exists film_reviews_title_len;
alter table public.film_public_reviews add constraint film_reviews_title_len check (char_length(film_title) between 1 and 200);

-- 2) Spam throttles: follows and reviews per hour, and a cap on total follows
create or replace function public.film_throttle() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'film_follows' then
    if (select count(*) from public.film_follows where follower_id = new.follower_id and created_at > now() - interval '1 hour') >= 60 then
      raise exception 'too many follows, try again later' using errcode = '54000';
    end if;
    if (select count(*) from public.film_follows where follower_id = new.follower_id) >= 3000 then
      raise exception 'follow limit reached' using errcode = '54000';
    end if;
  elsif tg_table_name = 'film_public_reviews' then
    if (select count(*) from public.film_public_reviews where user_id = new.user_id and created_at > now() - interval '1 hour') >= 400 then
      raise exception 'too many reviews, try again later' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.film_throttle() from public;
drop trigger if exists film_follows_throttle on public.film_follows;
create trigger film_follows_throttle before insert on public.film_follows for each row execute function public.film_throttle();
drop trigger if exists film_reviews_throttle on public.film_public_reviews;
create trigger film_reviews_throttle before insert on public.film_public_reviews for each row execute function public.film_throttle();

-- 3) Ordinary members cannot call themselves admin / moderator / support (staff have a badge for that)
create or replace function public.film_guard_display_name() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not public.film_is_staff()
     and lower(btrim(new.display_name)) ~ '(^|[^a-z])(admin|administrator|moderator|staff|support|official)([^a-z]|$)|مدیر|ادمین|مودریتور|پشتیبان|ناظر سایت' then
    raise exception 'reserved display name' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.film_guard_display_name() from public;
drop trigger if exists film_guard_display_name on public.film_public_profiles;
create trigger film_guard_display_name before insert or update of display_name on public.film_public_profiles
  for each row execute function public.film_guard_display_name();

-- ===== film-round8 =====
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

-- ===== film-round9 =====
-- Run once in the Supabase SQL Editor AFTER security/film-round8.sql (safe to re-run).
-- Round 9: the MODERATOR desk. A moderator is not an admin: they cannot see e-mails, delete accounts, change roles,
-- write announcements or read the member list. They can: delete reviews, handle review reports, suspend members for a
-- chosen time (1 hour ... 10 years, always with a reason), lift suspensions they or other moderators made, fix film
-- archive entries, and read the activity log. Every check runs inside the database; the web page only shows buttons.

-- 1) Suspension history (who suspended whom, why, for how long, who lifted it). Nobody reads this table directly.
create table if not exists public.film_suspensions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 200),
  starts_at timestamptz not null default now(),
  until timestamptz not null,
  imposed_by uuid references auth.users(id) on delete set null,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null
);
create index if not exists film_suspensions_user_idx on public.film_suspensions(user_id, starts_at desc);
create index if not exists film_suspensions_active_idx on public.film_suspensions(until) where lifted_at is null;
alter table public.film_suspensions enable row level security;
revoke all on public.film_suspensions from anon, authenticated;

-- 2) Review reports from members (snapshot kept, so the history survives when the review is removed)
create table if not exists public.film_review_reports (
  id bigserial primary key,
  review_id bigint not null,
  author uuid,
  film_id bigint,
  film_title text not null default '',
  snippet text not null default '',
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 200),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  unique (review_id, reporter)
);
create index if not exists film_reports_status_idx on public.film_review_reports(status, created_at desc);
alter table public.film_review_reports enable row level security;
revoke all on public.film_review_reports from anon, authenticated;

-- 3) Suspend a member for a chosen number of hours
create or replace function public.film_staff_suspend(p_user uuid, p_hours int, p_reason text) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare
  caller_admin boolean := public.film_is_admin();
  max_hours int;
  victim_email text;
  clean_reason text := btrim(coalesce(p_reason, ''));
  prior record;
  stop_at timestamptz;
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'cannot suspend yourself'; end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 200 then raise exception 'reason required (3-200 characters)'; end if;
  max_hours := case when caller_admin then 876000 else 87600 end;   -- admin: 100 years, moderator: 10 years
  if p_hours is null or p_hours < 1 or p_hours > max_hours then raise exception 'invalid duration'; end if;
  if exists (select 1 from public.film_roles where user_id = p_user and role = 'admin') then raise exception 'cannot suspend an admin'; end if;
  if not caller_admin and exists (select 1 from public.film_roles where user_id = p_user and role = 'moderator') then
    raise exception 'only an admin can suspend a moderator';
  end if;
  if not caller_admin and (select count(*) from public.film_suspensions where imposed_by = auth.uid() and starts_at > now() - interval '24 hours') >= 25 then
    raise exception 'daily suspension limit reached' using errcode = '54000';
  end if;
  select email into victim_email from auth.users where id = p_user;
  if victim_email is null then raise exception 'user not found'; end if;
  select s.* into prior from public.film_suspensions s where s.user_id = p_user and s.lifted_at is null and s.until > now() order by s.id desc limit 1;
  if found and not caller_admin then
    if exists (select 1 from public.film_roles where user_id = prior.imposed_by and role = 'admin') then
      raise exception 'suspension set by an admin';
    end if;
  end if;
  stop_at := now() + make_interval(hours => p_hours);
  update public.film_suspensions set lifted_at = now(), lifted_by = auth.uid() where user_id = p_user and lifted_at is null;
  insert into public.film_suspensions(user_id, reason, until, imposed_by) values (p_user, clean_reason, stop_at, auth.uid());
  update auth.users set banned_until = stop_at where id = p_user;
  delete from auth.sessions where user_id = p_user;
  insert into public.film_audit(actor, action, target_user, detail)
    values (auth.uid(), 'user_suspended', p_user,
            jsonb_build_object('email', public.film_mask_email(victim_email), 'hours', p_hours, 'until', stop_at, 'reason', clean_reason));
end $$;

create or replace function public.film_mask_email(p_email text) returns text
  language sql immutable as $$
  select case when p_email is null or position('@' in p_email) = 0 then ''
              else left(p_email, 2) || '***@' || split_part(p_email, '@', 2) end
$$;
revoke all on function public.film_mask_email(text) from public;
grant execute on function public.film_mask_email(text) to authenticated;
revoke all on function public.film_staff_suspend(uuid, int, text) from public;
grant execute on function public.film_staff_suspend(uuid, int, text) to authenticated;

-- 4) Lift a suspension
create or replace function public.film_staff_lift(p_user uuid) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare prior record; victim_email text; caller_admin boolean := public.film_is_admin();
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select email into victim_email from auth.users where id = p_user;
  if victim_email is null then raise exception 'user not found'; end if;
  select s.* into prior from public.film_suspensions s where s.user_id = p_user and s.lifted_at is null order by s.id desc limit 1;
  if not caller_admin then
    if not found then raise exception 'suspension set by an admin'; end if;
    if exists (select 1 from public.film_roles where user_id = prior.imposed_by and role = 'admin') then
      raise exception 'suspension set by an admin';
    end if;
  end if;
  update public.film_suspensions set lifted_at = now(), lifted_by = auth.uid() where user_id = p_user and lifted_at is null;
  update auth.users set banned_until = null where id = p_user;
  insert into public.film_audit(actor, action, target_user, detail)
    values (auth.uid(), 'user_restored', p_user, jsonb_build_object('email', public.film_mask_email(victim_email)));
end $$;
revoke all on function public.film_staff_lift(uuid) from public;
grant execute on function public.film_staff_lift(uuid) to authenticated;

-- the older admin buttons keep working and now write the same history
create or replace function public.film_admin_set_ban(p_user uuid, p_ban boolean) returns void
  language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_ban then perform public.film_staff_suspend(p_user, 876000, 'Suspended by an admin');
  else perform public.film_staff_lift(p_user); end if;
end $$;
revoke all on function public.film_admin_set_ban(uuid, boolean) from public;
grant execute on function public.film_admin_set_ban(uuid, boolean) to authenticated;

-- 5) Staff lists. A moderator sees names and masked e-mails only; an admin sees full e-mails.
create or replace function public.film_staff_suspensions(p_active_only boolean default true, p_limit int default 100)
  returns table(id bigint, user_id uuid, display_name text, email text, reason text, starts_at timestamptz, until timestamptz,
                imposed_by uuid, imposed_by_name text, lifted_at timestamptz, is_active boolean)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query
  select s.id, s.user_id, coalesce(p.display_name, '')::text,
         case when public.film_is_admin() then u.email::text else public.film_mask_email(u.email::text) end,
         s.reason, s.starts_at, s.until, s.imposed_by, coalesce(ip.display_name, '')::text, s.lifted_at,
         (s.lifted_at is null and s.until > now())
  from public.film_suspensions s
  join auth.users u on u.id = s.user_id
  left join public.film_public_profiles p on p.user_id = s.user_id
  left join public.film_public_profiles ip on ip.user_id = s.imposed_by
  where (not p_active_only) or (s.lifted_at is null and s.until > now())
  order by s.id desc
  limit least(greatest(p_limit, 1), 300);
end $$;
revoke all on function public.film_staff_suspensions(boolean, int) from public;
grant execute on function public.film_staff_suspensions(boolean, int) to authenticated;

create or replace function public.film_staff_find_users(p_search text, p_limit int default 20)
  returns table(user_id uuid, display_name text, email text, review_count bigint, roles text[], suspended_until timestamptz)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_search, ''))) < 2 then return; end if;
  return query
  select u.id, coalesce(p.display_name, '')::text,
         case when public.film_is_admin() then u.email::text else public.film_mask_email(u.email::text) end,
         (select count(*) from public.film_public_reviews v where v.user_id = u.id),
         coalesce((select array_agg(r.role order by r.role) from public.film_roles r where r.user_id = u.id), '{}'::text[]),
         case when u.banned_until is not null and u.banned_until > now() then u.banned_until end
  from auth.users u
  left join public.film_public_profiles p on p.user_id = u.id
  where p.display_name ilike '%' || btrim(p_search) || '%'
     or (public.film_is_admin() and u.email ilike '%' || btrim(p_search) || '%')
  order by p.display_name nulls last
  limit least(greatest(p_limit, 1), 50);
end $$;
revoke all on function public.film_staff_find_users(text, int) from public;
grant execute on function public.film_staff_find_users(text, int) to authenticated;

-- 6) Review reports
create or replace function public.film_report_review(p_review bigint, p_reason text) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare rv record; clean_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not public.film_email_verified() then raise exception 'verified e-mail required' using errcode = '42501'; end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 200 then raise exception 'reason required (3-200 characters)'; end if;
  select * into rv from public.film_public_reviews where id = p_review;
  if not found then raise exception 'review not found'; end if;
  if rv.user_id = auth.uid() then raise exception 'cannot report your own review'; end if;
  if (select count(*) from public.film_review_reports where reporter = auth.uid() and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too many reports today' using errcode = '54000';
  end if;
  insert into public.film_review_reports(review_id, author, film_id, film_title, snippet, reporter, reason)
    values (rv.id, rv.user_id, rv.film_id, left(rv.film_title, 200), left(rv.review, 400), auth.uid(), clean_reason)
    on conflict (review_id, reporter) do nothing;
end $$;
revoke all on function public.film_report_review(bigint, text) from public;
grant execute on function public.film_report_review(bigint, text) to authenticated;

create or replace function public.film_staff_reports(p_status text default 'open', p_limit int default 100)
  returns table(id bigint, review_id bigint, author uuid, author_name text, film_id bigint, film_title text, snippet text,
                reason text, status text, created_at timestamptz, review_exists boolean, reports_on_review bigint)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query
  select r.id, r.review_id, r.author, coalesce(p.display_name, '')::text, r.film_id, r.film_title, r.snippet, r.reason, r.status, r.created_at,
         exists (select 1 from public.film_public_reviews v where v.id = r.review_id),
         (select count(*) from public.film_review_reports x where x.review_id = r.review_id)
  from public.film_review_reports r
  left join public.film_public_profiles p on p.user_id = r.author
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 300);
end $$;
revoke all on function public.film_staff_reports(text, int) from public;
grant execute on function public.film_staff_reports(text, int) to authenticated;

create or replace function public.film_staff_resolve_report(p_id bigint, p_action text) returns void
  language plpgsql security definer set search_path = public, auth as $$
declare rp record;
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_action not in ('delete', 'dismiss') then raise exception 'invalid action'; end if;
  select * into rp from public.film_review_reports where id = p_id;
  if not found then raise exception 'report not found'; end if;
  if p_action = 'delete' then
    delete from public.film_public_reviews where id = rp.review_id;   -- the delete trigger writes the activity-log entry
    update public.film_review_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
      where review_id = rp.review_id and status = 'open';
  else
    update public.film_review_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now()
      where review_id = rp.review_id and status = 'open';
    insert into public.film_audit(actor, action, target_user, film_id, detail)
      values (auth.uid(), 'report_dismissed', rp.author, rp.film_id, jsonb_build_object('review_id', rp.review_id));
  end if;
end $$;
revoke all on function public.film_staff_resolve_report(bigint, text) from public;
grant execute on function public.film_staff_resolve_report(bigint, text) to authenticated;

-- 7) The moderator's home numbers
create or replace function public.film_staff_stats() returns jsonb
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'open_reports', (select count(*) from public.film_review_reports where status = 'open'),
    'active_suspensions', (select count(*) from public.film_suspensions where lifted_at is null and until > now()),
    'reviews_24h', (select count(*) from public.film_public_reviews where created_at > now() - interval '24 hours'),
    'my_actions_7d', (select count(*) from public.film_audit where actor = auth.uid() and at > now() - interval '7 days'
                       and action in ('review_deleted', 'user_suspended', 'user_restored', 'catalog_edit', 'catalog_reset', 'report_dismissed')));
end $$;
revoke all on function public.film_staff_stats() from public;
grant execute on function public.film_staff_stats() to authenticated;

-- ===== make yourself admin =====
insert into public.film_roles(user_id, role)
  select id, 'admin' from auth.users where email = 'saleh@gmail.com'
  on conflict (user_id, role) do nothing;

-- Result check: you should see one row per role, with your e-mail and the role "admin"
select u.email, r.role from public.film_roles r join auth.users u on u.id = r.user_id order by r.role, u.email;
