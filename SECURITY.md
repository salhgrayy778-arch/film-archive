# Security notes

- This repository is public on purpose (free GitHub Pages needs it). Anyone can **read** the files; only people you add as collaborators can **change** them.
- Secrets never go in files. TMDB and push keys live in Supabase secrets / GitHub Actions secrets. The Supabase `sb_publishable_…` key in the site is meant to be public; real protection is the Row Level Security in `security/*.sql`.
- Recommended GitHub settings (Settings of the repository): protect `main` against deletion and force-push (Rules → Rulesets), keep secret scanning + push protection on, enable Dependabot alerts, and turn on two-factor authentication on the owner account.
- Keep an offline copy now and then: `git clone https://github.com/salhgrayy778-arch/film-archive` (or Code → Download ZIP).
