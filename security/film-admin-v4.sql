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
