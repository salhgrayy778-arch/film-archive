#!/usr/bin/env python3
"""Rebuild security/film-all-in-one.sql from the individual SQL files (same order the owner must run them)."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent / "security"
parts = ["film-social-rls", "film-social-v2", "film-admin-v3", "film-admin-v4", "film-email-guard", "film-hardening", "film-round8", "film-round9"]
out = ["-- ONE FILE, run once in Supabase SQL Editor (safe to re-run). Does everything in order:",
       "-- 1) public profiles/follows/reviews  2) roles + review rules  3) staff panel  4) admin can delete accounts",
       "-- 5) fake e-mails blocked, only confirmed e-mails can post  6) size limits, throttles, reserved names",
       "-- 7) review likes, announcements, suspend accounts  8) moderator desk: timed suspensions, review reports",
       "-- 9) makes saleh@gmail.com admin (change the e-mail below if needed)"]
for name in parts:
    out += ["", f"-- ===== {name} =====", (root / f"{name}.sql").read_text().rstrip()]
out += ["", "-- ===== make yourself admin =====",
        "insert into public.film_roles(user_id, role)",
        "  select id, 'admin' from auth.users where email = 'saleh@gmail.com'",
        "  on conflict (user_id, role) do nothing;", "",
        "-- Result check: you should see one row per role, with your e-mail and the role \"admin\"",
        "select u.email, r.role from public.film_roles r join auth.users u on u.id = r.user_id order by r.role, u.email;", ""]
(root / "film-all-in-one.sql").write_text("\n".join(out))
print("wrote", root / "film-all-in-one.sql")
