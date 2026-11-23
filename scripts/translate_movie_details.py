#!/usr/bin/env python3
"""Cache Persian synopses for every movie on the public cinema homepage.

Try TMDB's own fa-IR localization first; when unavailable, use translation
on the GitHub Actions runner. Visitors only read the same-origin JSON.
Translations are associated with the exact original English synopsis.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import re

import requests
import update_cinema as core

ROOT = Path(__file__).resolve().parent.parent
FEED = ROOT / "data" / "home-feed.json"
CATALOG = ROOT / "data" / "tmdb-catalog.json"
PERSIAN = re.compile(r"[\u0600-\u06ff]")

def valid_fa(text):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    return value[:2800] if PERSIAN.search(value) and len(value) <= 2800 else ""

def load_catalog():
    try:
        rows = json.loads(CATALOG.read_text(encoding="utf-8")).get("movies", [])
        return {item["id"]: item for item in rows if isinstance(item, dict) and isinstance(item.get("id"), int)}
    except (OSError, ValueError):
        return {}

def tmdb_fa(movie_id, headers, params):
    if headers is None:
        return {}
    try:
        req = {**params, "language": "fa-IR"}
        res = requests.get(core.API + "/movie/" + str(movie_id),
                           headers=headers, params=req, timeout=(6, 14))
        res.raise_for_status()
        return res.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"TMDB Persian metadata unavailable for {movie_id}: {exc}")
        return {}

def main():
    try:
        data = json.loads(FEED.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print("Missing/invalid homepage snapshot", exc)
        return 1
    movies = data.get("movies", {})
    if not isinstance(movies, dict):
        return 1

    by_id = {}
    for group in movies.values():
        if not isinstance(group, list):
            continue
        for entry in group:
            if isinstance(entry, dict) and isinstance(entry.get("id"), int):
                by_id.setdefault(entry["id"], []).append(entry)
    if not by_id:
        print("No films in snapshot; nothing to translate")
        return 0

    catalog = load_catalog()
    headers, params = core.tmdb_access()
    need_tmdb = []
    translations = {}
    for movie_id, entries in by_id.items():
        movie = entries[0]
        english = str(movie.get("overview") or "").strip()
        already_fa = valid_fa(movie.get("overview_fa"))
        valid_cached = already_fa and movie.get("overview_source_for_fa") == english
        native_title = valid_fa(movie.get("fa_title")) or valid_fa(catalog.get(movie_id, {}).get("fa_title"))
        if native_title:
            translations[movie_id] = {"fa_title": native_title[:180]}
        if english and not valid_cached:
            need_tmdb.append(movie_id)

    # Use actual, localized TMDB descriptions when available; no guesswork.
    if need_tmdb and headers is not None:
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(tmdb_fa, mid, headers, params): mid for mid in need_tmdb}
            for future in as_completed(futures):
                movie_id = futures[future]
                try:
                    translated = future.result()
                except Exception as exc:
                    print(f"TMDB localization error for {movie_id}: {exc}")
                    continue
                fa_overview = valid_fa(translated.get("overview"))
                fa_title = valid_fa(translated.get("title"))
                row = translations.setdefault(movie_id, {})
                if fa_title:
                    row["fa_title"] = fa_title[:180]
                if fa_overview:
                    row["overview_fa"] = fa_overview
                    row["overview_translation_source"] = "tmdb"

    remaining = [
        (mid, str(group[0].get("overview") or "").strip())
        for mid, group in by_id.items()
        if str(group[0].get("overview") or "").strip()
        and not (valid_fa(group[0].get("overview_fa"))
                 and group[0].get("overview_source_for_fa") == group[0].get("overview"))
        and not translations.get(mid, {}).get("overview_fa")
    ]
    if remaining:
        from translate_news import load_translation_model, try_online_quality_provider
        online = try_online_quality_provider()
        offline = None
        for movie_id, original in remaining:
            translated = ""
            if online:
                try:
                    translated = valid_fa(online.translate(original))
                except Exception as exc:
                    print("Online film synopsis translation unavailable:", str(exc)[:150])
            if not translated:
                if offline is None:
                    try:
                        offline = load_translation_model()
                    except Exception as exc:
                        print("Offline translation model unavailable:", exc)
                        break
                try:
                    translated = valid_fa(offline.translate(original))
                except Exception as exc:
                    print(f"Offline synopsis translation unavailable {movie_id}: {exc}")
            if translated:
                row = translations.setdefault(movie_id, {})
                row["overview_fa"] = translated
                row["overview_translation_source"] = "machine"

    changes = 0
    for movie_id, entries in by_id.items():
        fa = translations.get(movie_id, {})
        for movie in entries:
            title = fa.get("fa_title")
            if title and movie.get("fa_title") != title:
                movie["fa_title"] = title
                changes += 1
            english = str(movie.get("overview") or "").strip()
            value = fa.get("overview_fa")
            if value and english:
                if (movie.get("overview_fa") != value
                    or movie.get("overview_source_for_fa") != english):
                    movie["overview_fa"] = value
                    movie["overview_source_for_fa"] = english
                    movie["overview_translation_source"] = fa.get("overview_translation_source", "machine")
                    changes += 1
    translated_count = len({
        mid for mid, entries in by_id.items()
        if valid_fa(entries[0].get("overview_fa"))
        and entries[0].get("overview_source_for_fa") == entries[0].get("overview")
    })
    if changes:
        data["movie_translation_updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        temp = FEED.with_suffix(".movies-fa.tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temp.replace(FEED)
    print(f"Persian film synopses: {translated_count}/{len(by_id)}; changed fields: {changes}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
