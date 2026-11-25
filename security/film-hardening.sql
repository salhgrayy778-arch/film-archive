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
