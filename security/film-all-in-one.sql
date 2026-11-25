-- ONE FILE, run once in Supabase SQL Editor (safe to re-run). Does everything in order:
-- 1) public profiles/follows/reviews  2) roles + reviews rules  3) staff panel  4) admin can delete member accounts
-- 5) makes saleh@gmail.com admin (change the e-mail on the last lines if needed)

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
create or replace function public.film_admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
  returns table(user_id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz,
                email_confirmed boolean, last_seen timestamptz, visits int, last_path text,
                roles text[], review_count bigint, followers bigint, total bigint)
  language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.film_is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, coalesce(p.display_name, '')::text, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null), pr.last_seen, coalesce(pr.visits, 0), coalesce(pr.last_path, '')::text,
         coalesce((select array_agg(r.role order by r.role) from public.film_roles r where r.user_id = u.id), '{}'::text[]),
         (select count(*) from public.film_public_reviews v where v.user_id = u.id),
         (select count(*) from public.film_follows f where f.followed_id = u.id),
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

-- ===== make yourself admin =====
insert into public.film_roles(user_id, role)
  select id, 'admin' from auth.users where email = 'saleh@gmail.com'
  on conflict (user_id, role) do nothing;

-- Result check: you should see one row per role, with your e-mail and the role "admin"
select u.email, r.role from public.film_roles r join auth.users u on u.id = r.user_id order by r.role, u.email;
