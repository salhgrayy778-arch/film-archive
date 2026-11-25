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
