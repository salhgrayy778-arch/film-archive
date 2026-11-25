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
