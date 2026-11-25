#!/usr/bin/env python3
"""Fast source-side security regression checks for the public static site."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parent.parent
files={path: (root/path).read_text(encoding="utf-8")
       for path in ("index.html","cinema-news.js","cinema-translation.js",
                    "group-watch.js","group-watch-account.js","sidebar-ui.js","film-context.js","site-updates.js","pwa-install.js","add-film-ui.js",
                    "account-profile.js","admin-panel.js","follow-bell.js","film-friends.js","security/film-admin-v3.sql","security/film-admin-v4.sql","security/film-email-guard.sql","security/film-hardening.sql","film-notes-sync.js","critic-panel.js","site-announce.js","security/film-round8.sql","security/film-round9.sql","film-wiki.js","film-scenes.js","panel-dock.js","site-tour.js","film-fonts.css","film-scenes.css","film-discovery.js","security/film-all-in-one.sql")}
index=files["index.html"]
errors=[]
def check(ok,message):
    if not ok:
        errors.append(message)

check('http-equiv="Content-Security-Policy"' in index,"No CSP meta policy")
for directive in ("object-src 'none'","base-uri 'self'","form-action 'self'","frame-src 'none'"):
    check(directive in index,"Missing CSP directive "+directive)
check('name="referrer"' in index,"No referrer policy")
check('safePosterSrc(' in index,"Missing image URL sanitizer")
check('safeExternalHref(' in index,"Missing external-link sanitizer")
check('src="cinema-translation.js' in index,"Translation script not linked")
check('crypto.getRandomValues' in files["group-watch.js"],"Weak watch-room IDs")
check("new URL('data/home-feed.json',base)" in files["cinema-translation.js"],
      "Translation UI should fetch only same-site data")
check("title.textContent=nextTitle" in files["cinema-translation.js"] or "title.textContent=translated?" in files["cinema-translation.js"],
      "Translated text should use textContent")
check("new URL('data/home-feed.json',SITE_BASE)" in files["cinema-news.js"],
      "Cinema homepage should fetch same-origin snapshot")
check("data:image" in index,"Image data URL validation missing")
# The personal archive must not automatically hydrate from browser storage.
check("async function loadFilms(){return [];}" in index,"Personal films could load from local storage")
check("const ok=await syncNow(true,true)" in index,"Save does not wait for Supabase confirmation")
check("function loadAccountArchive()" in index,"No account-only archive load")
check("validateAccount()" in index and "'/auth/v1/user'" in index,"No server-side session validation")
check("user_id=eq." in index,"Account archive query is not scoped by user ID")
check("function clearPersonalView()" in index,"Logout must reset private archive state")
check("importLegacyBrowserArchive()" in index,"No explicit legacy browser data migration")
check("if(!requireCloud())return;" in index,"Edit/import controls are not account gated")
check("kvSet(KEY" not in index,"Personal movie archive must not be written to localStorage")
check("const moviesGroup=createGroup(" not in (root/"sidebar-ui.js").read_text(encoding="utf-8"),"Unwanted movie-details sidebar category still visible")
check('id="legacyMovieTools" hidden' in index and 'id="pxAll"' in index and 'id="tmKeySave"' in index,"Legacy poster/TMDB nodes were not preserved")
# Account profiles are saved only inside authenticated, owner-scoped archives JSON.
profile = files["account-profile.js"]
check('src="account-profile.js' in index and 'href="account-profile.css' in index,"Profile UI assets not loaded")
check("merged.profile=profileDirty" in index,"Movie archive sync could erase profile")
check("profile:normalizeAccountProfile(data.profile)" in index,"Profile not read from owner row")
check("saveAccountProfileDraft(value)" in index and "syncNow(true,true)" in index,"Profile save must persist to Supabase")
check("accountProfile=blankAccountProfile()" in index,"Signout must clear profile state")
check("if(favorites.length>=10)break" in index,"Max 10 favorites validation missing")
check("data:image\\/jpeg;base64" in index,"Avatar data format not constrained")
check("file.size>5*1024*1024" in profile and "canvas.toDataURL('image/jpeg'" in profile,"Profile photo size/compression missing")
check("new URL('data/tmdb-catalog.json',base)" in profile,"Favorites should use cached local TMDB catalog")
check("این سایت با عشق به سینما ساخته شده" in index and "salehgharaie48@gmail.com" in index,"Required footer copy missing")


combined="\n".join(files.values())
for name,expression in {
    "Supabase secret key":r"\bsb_secret_[A-Za-z0-9_-]{16,}",
    "GitHub personal access token":r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    "Private PEM block":r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
}.items():
    check(re.search(expression,combined) is None,name+" appears in public client code")
# Staff panel: UI only; permissions are enforced by the database.
panel=files["admin-panel.js"]
check("innerHTML" not in panel and "eval(" not in panel and "document.write" not in panel,"Staff panel must not use innerHTML/eval")
admin_sql=files["security/film-admin-v3.sql"]
for needle in ("film_is_staff()","film_is_admin()","enable row level security","revoke insert, update, delete on public.film_roles",
               "raise exception 'admin only'","cannot remove the last admin"):
    check(needle in admin_sql,"film-admin-v3.sql is missing: "+needle)
check("service_role" not in panel and "service-role" not in panel.replace("service-role key","") ,"Staff panel must never hold a service key")

for name in ("follow-bell.js","film-friends.js"):
    check("innerHTML" not in files[name] and "eval(" not in files[name],name+" must not use innerHTML/eval")
delete_sql=files["security/film-admin-v4.sql"]
for needle in ("security definer","film_is_admin()","raise exception 'admin only'","cannot delete yourself","remove the admin role first","revoke all on function public.film_admin_delete_user"):
    check(needle in delete_sql,"film-admin-v4.sql is missing: "+needle)

guard=files["security/film-email-guard.sql"]
for needle in ("film_guard_email","film_email_verified()","film_blocked_email_domains","email_confirmed_at is not null","disposable email address not allowed"):
    check(needle in guard,"film-email-guard.sql is missing: "+needle)
hard=files["security/film-hardening.sql"]
for needle in ("film_throttle","film_profile_avatar_format","film_guard_display_name","film_profile_json_size"):
    check(needle in hard,"film-hardening.sql is missing: "+needle)
for name in ("critic-panel.js","site-announce.js"):
    check("innerHTML" not in files[name] and "eval(" not in files[name] and "document.write" not in files[name],name+" must not use innerHTML/eval")
r8=files["security/film-round8.sql"]
for needle in ("film_review_likes","enable row level security","film_email_verified()","film_announcements","film_is_admin()","film_admin_set_ban","cannot suspend yourself","remove the admin role first","revoke all on function public.film_admin_set_ban"):
    check(needle in r8,"film-round8.sql is missing: "+needle)
check("film-round8" in files["security/film-all-in-one.sql"] and "film_review_likes" in files["security/film-all-in-one.sql"],"film-all-in-one.sql is out of date (run scripts/build_all_in_one.py)")
# Round 9: moderator desk, VPN-free metadata fallback, self-hosted fonts, animated scenes
r9=files["security/film-round9.sql"]
for needle in ("film_suspensions","film_review_reports","enable row level security","revoke all on public.film_suspensions",
               "film_staff_suspend","film_staff_lift","film_staff_reports","film_staff_resolve_report","film_report_review",
               "raise exception 'staff only'","only an admin can suspend a moderator","cannot suspend an admin","cannot suspend yourself",
               "daily suspension limit","film_mask_email","reason required","revoke all on function public.film_staff_suspend"):
    check(needle in r9,"film-round9.sql is missing: "+needle)
check("film-round9" in files["security/film-all-in-one.sql"] and "film_staff_suspend" in files["security/film-all-in-one.sql"],"film-all-in-one.sql is out of date (run scripts/build_all_in_one.py)")
for name in ("film-wiki.js","film-scenes.js","panel-dock.js","site-tour.js"):
    check("innerHTML" not in files[name] and "eval(" not in files[name] and "document.write" not in files[name],name+" must not use innerHTML/eval")
check("upload\\.wikimedia\\.org" in files["film-wiki.js"] and "POSTER_OK" in files["film-wiki.js"],"film-wiki.js must only accept Wikimedia poster addresses")
check("https://www.wikidata.org" in index.split("Content-Security-Policy")[1][:1800],"CSP connect-src must allow Wikidata for the VPN-free fallback")
check("fonts.googleapis.com" not in index and "fonts.gstatic.com" not in index,"Fonts must be self-hosted (no Google Fonts)")
check(all(x in index for x in ('href="film-fonts.css','href="film-scenes.css','src="film-scenes.js','src="film-wiki.js')),"Round 9 assets are not linked in index.html")
check("prefers-reduced-motion" in files["film-scenes.css"],"Animated scenes must respect prefers-reduced-motion")
check("innerHTML" not in files["film-notes-sync.js"] and "eval(" not in files["film-notes-sync.js"],"film-notes-sync.js must not use innerHTML/eval")
check("https://cdnjs.cloudflare.com" not in index and "@supabase/supabase-js@2" not in index,"Third-party CDN scripts must be vendored (assets/vendor)")
check("https://*.supabase.co" not in index.split("Content-Security-Policy")[1][:1500],"CSP connect-src must name the project host, not a wildcard")
check("window.top!==window.self" in index,"Clickjacking frame-buster missing")
check("mailProblem(email)" in index and "email_confirmed_at" in index,"Client must reject fake / unconfirmed e-mails")

if errors:
    print("Security checks failed:")
    for problem in errors:print(" -",problem)
    sys.exit(1)
print("Security source checks passed (not a penetration test).")
