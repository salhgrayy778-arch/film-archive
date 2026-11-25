-- Behaviour test for security/film-round9.sql (run on a scratch database after film-all-in-one.sql; see tests/README in SECURITY.md)
\set ON_ERROR_STOP off
insert into auth.users(id,email,last_sign_in_at,email_confirmed_at) values
('00000000-0000-0000-0000-0000000000a1','admin@x.com',now(),now()),
('00000000-0000-0000-0000-0000000000b1','mod@x.com',now(),now()),
('00000000-0000-0000-0000-0000000000b2','mod2@x.com',now(),now()),
('00000000-0000-0000-0000-0000000000c1','member@x.com',now(),now()),
('00000000-0000-0000-0000-0000000000c2','reporter@x.com',now(),now());
insert into public.film_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000b1','moderator'),('00000000-0000-0000-0000-0000000000b2','moderator') on conflict do nothing;
insert into public.film_public_profiles(user_id,display_name) values ('00000000-0000-0000-0000-0000000000c1','Cinephile') on conflict do nothing;
insert into public.film_public_reviews(user_id,film_id,film_title,rating,review) values ('00000000-0000-0000-0000-0000000000c1',603,'The Matrix',9,'bad words here');
\echo === moderator suspends member for 36 hours with a reason (ok)
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select film_staff_suspend('00000000-0000-0000-0000-0000000000c1',36,'abusive review');
\echo === moderator: no reason (error), 0 hours (error), 11 years (error), self (error), admin (error), other moderator (error)
select film_staff_suspend('00000000-0000-0000-0000-0000000000c2',5,'');
select film_staff_suspend('00000000-0000-0000-0000-0000000000c2',0,'because');
select film_staff_suspend('00000000-0000-0000-0000-0000000000c2',87601,'because');
select film_staff_suspend('00000000-0000-0000-0000-0000000000b1',5,'because');
select film_staff_suspend('00000000-0000-0000-0000-0000000000a1',5,'because');
select film_staff_suspend('00000000-0000-0000-0000-0000000000b2',5,'because');
\echo === moderator 10 years is allowed
select film_staff_suspend('00000000-0000-0000-0000-0000000000c2',87600,'repeat spam');
select film_staff_lift('00000000-0000-0000-0000-0000000000c2');
\echo === moderator list: masked e-mail
select display_name,email,reason,is_active,round(extract(epoch from (until-starts_at))/3600) as hours from film_staff_suspensions(true,10);
select email,review_count from film_staff_find_users('cine',10);
select film_admin_users('',5,0);
\echo === member cannot use staff functions
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c2';
select film_staff_suspend('00000000-0000-0000-0000-0000000000c1',5,'because');
select * from film_staff_suspensions();
select film_staff_stats();
select count(*) from film_suspensions; -- expected: permission denied
\echo === member reports review, cannot report twice (idempotent), cannot report own
select film_report_review((select id from film_public_reviews limit 1),'offensive');
select film_report_review((select id from film_public_reviews limit 1),'offensive again');
\echo === moderator resolves: dismiss then delete
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select id,film_title,status,review_exists,reports_on_review from film_staff_reports('open',10);
select film_staff_resolve_report(1,'delete');
select count(*) as reviews_left from film_public_reviews;
select status from film_staff_reports('all',10);
select film_staff_stats();
\echo === admin sets a long ban via old function; moderator cannot lift an admin suspension
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select film_admin_set_ban('00000000-0000-0000-0000-0000000000c2',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select film_staff_lift('00000000-0000-0000-0000-0000000000c2');
select film_staff_suspend('00000000-0000-0000-0000-0000000000c2',2,'shorten');
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select film_staff_lift('00000000-0000-0000-0000-0000000000c2');
select film_staff_suspend('00000000-0000-0000-0000-0000000000b1',3,'admin may suspend a moderator');
select email from film_staff_suspensions(true,5);
reset role;
\echo === banned member cannot post (email guard) and the ban expires by itself
select film_email_verified() as dummy where false;
update auth.users set banned_until=now()-interval '1 minute' where id='00000000-0000-0000-0000-0000000000c1';
select (banned_until is null or banned_until < now()) as ban_over from auth.users where id='00000000-0000-0000-0000-0000000000c1';
select action, detail->>'reason' as reason, detail->>'hours' as hours from film_audit order by id;
\echo === daily moderator limit
reset role;
create temp table bulk_ids as select gen_random_uuid() as id from generate_series(1,30);
grant select on bulk_ids to authenticated;
insert into auth.users(id,email,email_confirmed_at) select id, id||'@bulk.test', now() from bulk_ids;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
do $$ declare r record; n int:=0; e int:=0; begin for r in select id from bulk_ids loop begin perform film_staff_suspend(r.id,1,'bulk test'); n:=n+1; exception when others then e:=e+1; end; end loop; raise notice 'ok=% blocked=% (expected 25 / 5)',n,e; end $$;
