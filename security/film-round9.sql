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
