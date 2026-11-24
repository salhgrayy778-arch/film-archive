#!/usr/bin/env python3
"""Small, frequent, low-load sync of the site's TMDB data.

One shared film database feeds the movie search, Add Film, profile top-10,
similar films and the library: data/tmdb-catalog.json + data/tmdb-extra.json
(+ cached posters in assets/catalog/). This job keeps that database healthy in
tiny steps so it can run every ~15 minutes without stressing TMDB or the site:

  1. repair   - re-download missing/broken poster files that records point to
  2. refresh  - re-check the stalest cached films (rating, popularity, poster)
  3. grow     - add a few more popular films (reuses enrich_tmdb_posters.py)
  4. report   - write data/sync-status.json (counts, coverage, last run)

Every step is bounded by the --budget numbers; with no TMDB credential it only
performs the local integrity check, so it never fails the workflow.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

import build_catalog as catalog_build
import enrich_tmdb_posters as enrich
import update_cinema as core

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "tmdb-catalog.json"
EXTRA = ROOT / "data" / "tmdb-extra.json"
STATUS = ROOT / "data" / "sync-status.json"
ASSET_RE = re.compile(r"^assets/catalog/\d+-[a-f0-9]{12}\.webp$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def file_ok(rel: str) -> bool:
    if not ASSET_RE.match(rel or ""):
        return False
    path = ROOT / rel
    return path.is_file() and path.stat().st_size > 1000


def load_catalog() -> dict:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    return data


def write_json(path: Path, data: dict) -> None:
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(path)


def repair(rows: list[dict], limit: int) -> int:
    """Re-fetch poster files that a record references but that are missing."""
    fixed = 0
    for movie in rows:
        if fixed >= limit:
            break
        if not isinstance(movie.get("id"), int) or not movie.get("poster_path"):
            continue
        if file_ok(movie.get("poster_url", "")):
            continue
        url = catalog_build.poster_url(movie)
        if url and file_ok(url):
            movie["poster_url"] = url
            fixed += 1
    return fixed


def refresh(current: dict, headers, auth, limit: int) -> int:
    """Re-check the stalest cached films (cheap: one request each)."""
    if not current or limit <= 0:
        return 0
    stale = sorted(current.values(), key=lambda m: (int(m.get("synced") or 0), -float(m.get("popularity") or 0)))
    done = 0
    stamp = int(time.time())
    for movie in stale[:limit]:
        movie_id = movie["id"]
        try:
            detail = catalog_build.get_json("/movie/" + str(movie_id), {"language": "en-US"}, headers, auth)
        except (requests.RequestException, ValueError, TypeError) as exc:
            print(f"Refresh {movie_id} skipped: {str(exc)[:100]}")
            movie["synced"] = stamp  # do not retry the same broken id every run
            continue
        if detail.get("id") != movie_id or detail.get("adult"):
            movie["synced"] = stamp
            continue
        movie["vote_average"] = round(float(detail.get("vote_average") or 0), 1)
        movie["vote_count"] = int(detail.get("vote_count") or 0)
        movie["popularity"] = round(float(detail.get("popularity") or movie.get("popularity") or 0), 2)
        new_path = detail.get("poster_path") or ""
        if new_path and new_path != movie.get("poster_path"):
            movie["poster_path"] = new_path
            url = catalog_build.poster_url(movie)
            if url:
                movie["poster_url"] = url
        elif new_path and not file_ok(movie.get("poster_url", "")):
            url = catalog_build.poster_url(movie)
            if url:
                movie["poster_url"] = url
        movie["synced"] = stamp
        done += 1
        time.sleep(0.15)  # polite pacing
    return done


def coverage(catalog_rows: list[dict], extra_rows: list[dict]) -> dict:
    rows = catalog_rows + extra_rows
    with_file = sum(1 for m in rows if file_ok(m.get("poster_url", "")))
    return {
        "curated": len(catalog_rows),
        "extra": len(extra_rows),
        "with_cached_poster": with_file,
        "missing_poster_file": sum(1 for m in rows if m.get("poster_path") and not file_ok(m.get("poster_url", ""))),
        "no_poster_on_tmdb": sum(1 for m in rows if not m.get("poster_path")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repair", type=int, default=25)
    parser.add_argument("--refresh", type=int, default=30)
    parser.add_argument("--grow", type=int, default=20)
    args = parser.parse_args()

    catalog = load_catalog()
    current = enrich.read_existing()
    cursor = enrich.read_scan_cursor()
    headers, auth = core.tmdb_access()
    summary = {"repaired": 0, "refreshed": 0, "added": 0, "tmdb": headers is not None}

    summary["repaired"] += repair(catalog.get("movies", []), args.repair)
    summary["repaired"] += repair(list(current.values()), max(0, args.repair - summary["repaired"]))
    if headers is not None:
        summary["refreshed"] = refresh(current, headers, auth, args.refresh)
    else:
        print("TMDB credential absent: only the local integrity check ran.")

    if summary["repaired"] or summary["refreshed"]:
        catalog["updated_at"] = now_iso()
        write_json(CATALOG, catalog)
        enrich.save(current, cursor)

    if headers is not None and args.grow > 0:
        before = len(enrich.read_existing())
        enrich.run(args.grow)
        summary["added"] = max(0, len(enrich.read_existing()) - before)

    extra_rows = list(enrich.read_existing().values())
    report = {
        "schema_version": 1,
        "updated_at": now_iso(),
        "last_run": summary,
        "coverage": coverage(load_catalog().get("movies", []), extra_rows),
        "note": "Shared TMDB film database used by search, Add Film, profile top-10 and the library.",
    }
    # Only touch the status file when the numbers changed, to avoid empty commits.
    try:
        old = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    if old.get("coverage") != report["coverage"] or any(summary[k] for k in ("repaired", "refreshed", "added")):
        write_json(STATUS, report)
    print(json.dumps({"summary": summary, "coverage": report["coverage"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
