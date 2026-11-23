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
create policy "film profiles readable" on public.film_public_profiles for select to authenticated using(true);
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
grant select,insert,delete on public.film_follows to authenticated;
grant select,insert,update,delete on public.film_public_reviews to authenticated;
grant usage,select on sequence public.film_public_reviews_id_seq to authenticated;
-- Do not grant anon access: sign-in is required to browse user social activity.
