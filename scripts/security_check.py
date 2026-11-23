#!/usr/bin/env python3
"""Fast source-side security regression checks for the public static site."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parent.parent
files={path: (root/path).read_text(encoding="utf-8")
       for path in ("index.html","cinema-news.js","cinema-translation.js",
                    "group-watch.js","sidebar-ui.js","add-film-ui.js",
                    "account-profile.js")}
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
check('src="cinema-translation.js"' in index,"Translation script not linked")
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
check("inactiveTools.hidden=true" in (root/"sidebar-ui.js").read_text(encoding="utf-8"),"Legacy poster/TMDB nodes were not preserved")
# Account profiles are saved only inside authenticated, owner-scoped archives JSON.
profile = files["account-profile.js"]
check('src="account-profile.js"' in index and 'href="account-profile.css"' in index,"Profile UI assets not loaded")
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
if errors:
    print("Security checks failed:")
    for problem in errors:print(" -",problem)
    sys.exit(1)
print("Security source checks passed (not a penetration test).")
