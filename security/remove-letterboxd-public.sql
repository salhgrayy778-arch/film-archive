-- Clears the public copy of imported Letterboxd data on every public profile.
-- The public "watched" list is only a copy of each user's own archive; it is rebuilt automatically
-- from the (already cleaned) archive the next time that user signs in. Safe to run more than once.
update public.film_public_profiles
set watched = '[]'::jsonb,
    favorites = coalesce((select jsonb_agg(x) from jsonb_array_elements(favorites) x
                          where coalesce(x->>'id','') not like 'archive:lb\_%'), '[]'::jsonb)
where watched <> '[]'::jsonb
   or exists (select 1 from jsonb_array_elements(favorites) x where coalesce(x->>'id','') like 'archive:lb\_%');
