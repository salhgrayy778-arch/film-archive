-- One-time cleanup (optional): removes every film that was imported from Letterboxd (id starts with lb_)
-- and the Letterboxd link from the remaining films, for ALL accounts. Safe to run more than once.
-- The site also does the same cleanup by itself when each user signs in, so this is only a shortcut.
update public.archives a
set data = jsonb_set(a.data, '{films}',
  coalesce((select jsonb_agg(f - 'lb') from jsonb_array_elements(a.data->'films') f
            where coalesce(f->>'id','') not like 'lb\_%'), '[]'::jsonb))
where jsonb_typeof(a.data->'films') = 'array'
  and exists (select 1 from jsonb_array_elements(a.data->'films') f
              where coalesce(f->>'id','') like 'lb\_%' or f ? 'lb');
