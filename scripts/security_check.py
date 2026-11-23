#!/usr/bin/env python3
"""Fast source-side security regression checks for the public static site."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parent.parent
files={path: (root/path).read_text(encoding="utf-8")
       for path in ("index.html","cinema-news.js","cinema-translation.js",
                    "group-watch.js","sidebar-ui.js","add-film-ui.js")}
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
check("textContent=translated?" in files["cinema-translation.js"],
      "Translated text should use textContent")
check("new URL('data/home-feed.json',SITE_BASE)" in files["cinema-news.js"],
      "Cinema homepage should fetch same-origin snapshot")
check("data:image" in index,"Image data URL validation missing")
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
