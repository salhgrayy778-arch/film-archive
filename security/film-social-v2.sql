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
