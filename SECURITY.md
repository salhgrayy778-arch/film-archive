# My Film Archive — Security controls and deployment checklist

This is a **static GitHub Pages web app** with optional Supabase user accounts and
PeerJS group watch. Security depends on several distinct layers.

## Implemented in the site

- Content Security Policy via HTML `<meta http-equiv>`: restricts scripts to the
  website plus explicitly listed CDN origins, disables object and iframe
  content, limits server connections, and upgrades insecure requests.
  **Limitation:** the existing legacy inline scripts require `'unsafe-inline'`;
  this is defense-in-depth, not a complete XSS barrier.
- Browser referrer privacy policy.
- URL scheme validation for poster images and external Letterboxd links.
- Restricted locally uploaded poster types: JPEG / PNG / WebP / GIF up to 10 MB;
  SVG image uploads are not accepted.
- Escaped user-provided archive identifiers when rendered as HTML attributes.
- Cryptographically strong 96-bit room codes. Invited users still need to keep
  room links private; there is currently no server-side room authentication.
- Same-origin cached cinema data and official posters, avoiding visitor TMDB
  credentials and cross-origin image requirements.
- Original news publishers remain linked; translations are generated only in
  GitHub Actions and rendered as plain text in the browser.

## Account profiles and privacy

- Each signed-in user can set a display name, a short bio, a profile picture,
  and an ordered list of up to **10 favorite films**.
- These fields are stored as `profile` within the existing
  `public.archives.data` JSON object, alongside `films` and `deleted`.
  No extra Supabase table, bucket, or database migration is required.
- Uploaded avatars are cropped/resized to 256×256 JPEG and limited before
  being saved in that private account JSON document. They are **not**
  placed in a public storage bucket or browser localStorage.
- Favorite-film suggestions read a locally cached TMDB subset, or the user's
  private archive. A missing title can be entered manually. Only ten items
  are retained after input validation.
- The profile is private to the signed-in account, **not** a publicly
  searchable member profile. It is cleared from the active screen on logout.
- **Supabase Row Level Security remains essential**: a client-side owner
  check alone is not permission enforcement. Verify that the
  `security/supabase-archives-rls.sql` rules are applied in the actual
  Supabase project before collecting personal biographies or images.

## REQUIRED manual Supabase action

Review and run **`security/supabase-archives-rls.sql`** in the Supabase
SQL Editor of the *actual project*. This file does not run automatically.

**Before executing:** take a backup and verify `public.archives` has
`user_id uuid`, `data jsonb`, and `updated_at`. Check the existing
policies. The SQL adds a **restrictive owner-only RLS guard** and permissive
owner policies, revokes anonymous table privileges, and grants authenticated
access. Test with two unrelated accounts: Account A must never see or modify
Account B's records.

Also review Supabase Auth settings: verify email confirmations,
MFA for administrators, password and anti-abuse settings, acceptable login
rate limits, and token/session expiry. Never place `service_role` keys,
database passwords, or private API tokens in browser-accessible HTML/JS.

The Supabase **publishable** key is by design client-visible and not a secret;
the **service_role** key is sensitive and must only be stored in trusted
server-side environments.

## GitHub Pages limitations

A pure GitHub Pages site cannot configure the HTTP response headers required
for the strongest versions of these controls:

- `Content-Security-Policy: frame-ancestors 'none'` (anti-clickjacking).
- `Strict-Transport-Security` and some other response-header protections.
- HttpOnly and Secure cookies set by a custom first-party authentication server.

These require a hosting platform, reverse proxy or CDN with HTTP header
configuration. The in-page CSP does not support `frame-ancestors`.
Read more: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

## Translation and data integrity

News headlines and short RSS excerpts are translated by an offline
English-to-Persian model in GitHub Actions. The original headline,
publisher and original article URL remain intact; these are machine
translations, not editorially verified. If translation cannot run, the site
must show the original text instead of fabricated Persian news.

Review Actions permissions periodically; use repository secrets for
server-side provider credentials. GitHub Actions artifacts and logs should
not print secrets. Rotate any credentials found committed to history.

## Ongoing testing

After every relevant release, test in Persian and English, desktop/mobile,
with/without VPN. Test add-film autocomplete, authentic poster loading,
group room creation and joining, signup/login and archive sync. The static
code changes and CI workflow status do not prove production account security.

## Shared film database and automatic sync

- Search, Add Film, the profile top-10, similar films and the library all read the
  same cached TMDB records (`data/tmdb-catalog.json`, `data/tmdb-extra.json`,
  `data/tmdb-universe/`) through `window.filmDiscovery` (`resolve`, `posterFor`,
  `hydrateMovies`, `syncLibrary`).
- `.github/workflows/sync-film-data.yml` runs every 15 minutes and performs a small,
  bounded repair / refresh / growth step (`scripts/sync_film_data.py`); it commits
  only when data changed and shares one concurrency lane with the other data jobs.

## Accounts and group watch

- Group watch requires a signed-in account (the UI stays visible but locked with a
  sign-in notice; invite links are remembered and opened after sign-in).
- Archives are loaded and saved only for the signed-in user id; cross-tab sign-in/out
  is followed. Run `security/archives-rls.sql` once in Supabase so the database itself
  enforces "each account reads/writes only its own row".

## Social layer (profiles, follows, reviews, critics)

- Run `security/film-social-rls.sql` and then `security/film-social-v2.sql` once in the
  Supabase SQL Editor. They create/extend `film_public_profiles`, `film_follows`,
  `film_public_reviews` and `film_roles`, with RLS: public read; each user writes only
  their own profile/review/follow rows; only admins write roles or delete others' reviews.
- Roles live in `film_roles` and are checked by `film_is_admin()` in the database, never
  by the browser. Make yourself admin / grant the critic role with the commented SQL
  snippets at the end of `film-social-v2.sql`.
- The watched list is public only when the user enables "show my watched films".
- Room members' account id (`uid`) is self-reported over the unauthenticated broadcast
  channel and is used only to load a public profile/avatar; it grants no access.
- Planned (not built): admin panel. It must be account-based (role check), with
  last-sign-in data served by a Supabase Edge Function/RPC using the service-role key
  kept server-side, never in the browser.
