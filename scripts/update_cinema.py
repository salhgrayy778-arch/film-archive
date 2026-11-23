#!/usr/bin/env python3
"""Build a same-origin film/news snapshot for the static My Film Archive site.

Only GitHub Actions contacts TMDB and publisher feeds; visitors fetch local JSON
and locally cached *official TMDB* movie posters. No artificial news is generated.
"""
from __future__ import annotations

import calendar
from collections import Counter
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.parse import urlparse, urlunparse

import feedparser
from PIL import Image, ImageOps, UnidentifiedImageError
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "home-feed.json"
POSTER_DIR = ROOT / "assets" / "posters"
API = "https://api.themoviedb.org/3"
POSTER_SOURCE = "https://image.tmdb.org/t/p/original"
HEADERS = {"User-Agent": "MyFilmArchive/1.1 (+https://github.com/salhgrayy778-arch/film-archive)", "Accept": "application/json, application/rss+xml, application/xml, text/xml, */*"}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
MOVIE_LIMIT = 12
NOW = datetime.now(timezone.utc)

# Separate feeds from multiple editorial publishers; alternatives provide resilience.
FEEDS = [
    ("Variety", ["https://variety.com/v/film/feed/"]),
    ("Deadline", ["https://deadline.com/feed/"]),
    ("The Hollywood Reporter", ["https://www.hollywoodreporter.com/c/movies/movie-news/feed/", "https://www.hollywoodreporter.com/feed/"]),
    ("IndieWire", ["https://www.indiewire.com/c/film/feed/", "https://www.indiewire.com/feed/"]),
    ("Collider", ["https://collider.com/feed/"]),
    ("Screen Rant", ["https://screenrant.com/feed/"]),
]
FILM_WORDS = re.compile(r"\b(film|films|movie|movies|cinema|director|box.office|oscar|academy.award|screenplay|theatrical|premiere|sundance|cannes|sequel|feature.film|film.festival|animated.film|cinematography|movie.trailer|horror.movie|avengers|spider.man|star.wars|batman|superman|james.bond)\b", re.I)
NOT_FILM = re.compile(r"\b(smosh|video.game|gaming|playstation|xbox|nintendo|tv.series|television|season\s*[1-9]|episode\s*[1-9]|season.finale|super.bowl|football|comic.books?|wwe|reality.show|talk.show|concert|music.video|podcast)\b", re.I)
DEDICATED_FILM_FEEDS = {"Variety", "IndieWire"}
STOP_WORDS = set("the a an and or of for from to in on at with as by is are was were into about new first last after before how what who why movie movies film films cinema hollywood says said report exclusive reveals revealed".split())

def utcstamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def old_snapshot():
    try:
        obj = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else {}
    except (OSError, ValueError):
        return {}

def clean_url(url):
    try:
        p = urlparse(str(url or "").strip())
        if p.scheme not in ("https", "http") or not p.hostname or len(p.geturl()) > 2048:
            return ""
        path = re.sub(r"/+", "/", p.path).rstrip("/") or "/"
        return urlunparse((p.scheme, p.netloc.lower(), path, "", "", ""))
    except (ValueError, TypeError):
        return ""

def normalize_title(title):
    text = unicodedata.normalize("NFKD", str(title)).casefold()
    text = re.sub(r"\s+[-|]\s+(variety|deadline|the hollywood reporter|indiewire|collider|screen rant)$", "", text)
    tokens = re.findall(r"[a-z0-9]+", text)
    return " ".join(w for w in tokens if w not in STOP_WORDS)

def event_signature(title):
    """Catch identical news events rewritten in distinct editorial headlines."""
    normalized = normalize_title(title)
    if ("oscar" in normalized or "academy award" in normalized) and (
        "eligib" in normalized or ("animated" in normalized and "international" in normalized)
    ):
        return "oscars-eligibility"
    return ""


def duplicate(a, b):
    if a["url"] == b["url"]:
        return True
    same_event = event_signature(a["title"]) and event_signature(a["title"]) == event_signature(b["title"])
    if same_event:
        return True
    x, y = a["_norm"], b["_norm"]
    if not x or not y:
        return False
    if x == y:
        return True
    xt, yt = set(x.split()), set(y.split())
    overlap = len(xt & yt)
    return (
        overlap >= 4 and len(xt | yt) and overlap / len(xt | yt) >= 0.64
    ) or (
        min(len(x), len(y)) >= 30
        and SequenceMatcher(None, x, y).ratio() >= 0.83
    )

def parse_date(entry):
    st = entry.get("published_parsed") or entry.get("updated_parsed")
    if st:
        try:
            return datetime.fromtimestamp(calendar.timegm(st), timezone.utc)
        except (TypeError, ValueError, OverflowError):
            pass
    return None

def get_feed(name, urls):
    for url in urls:
        try:
            res = SESSION.get(url, timeout=(12, 25), headers={"Accept": "application/rss+xml, application/xml, text/xml, */*"})
            res.raise_for_status()
            doc = feedparser.parse(res.content)
            if not doc.entries:
                print(f"{name}: no readable items from {url}")
                continue
            rows = []
            for entry in doc.entries[:35]:
                title = re.sub(r"\s+", " ", str(entry.get("title", "")).strip())
                link = clean_url(entry.get("link"))
                when = parse_date(entry)
                if not title or not link:
                    continue
                if when is not None and when < NOW - timedelta(days=14):
                    continue
                # Mixed entertainment feeds should still prioritize actual film coverage.
                categories = " ".join(str(t.get("term", "")) for t in entry.get("tags", []))
                # Exclude television, sports and gaming items unless specifically
                # described as a movie/film adaptation or cinematic release.
                explicit_film = bool(FILM_WORDS.search(title))
                if NOT_FILM.search(title) and not re.search(r"\b(film|films|movie|movies|cinema|box.office)\b", title, re.I):
                    continue
                category_movie = bool(re.search(r"\b(film|films|movie|movies|cinema)\b", categories, re.I))
                if not explicit_film and not (name in DEDICATED_FILM_FEEDS or category_movie):
                    continue
                rows.append({
                    "title": title[:240],
                    "url": link,
                    "domain": urlparse(link).hostname or name,
                    "source": name,
                    "seendate": (when or NOW).strftime("%Y%m%dT%H%M%SZ"),
                    "socialimage": "",
                    "_norm": normalize_title(title),
                    "_ts": (when or NOW).timestamp(),
                })
            if rows:
                print(f"{name}: {len(rows)} film stories")
                return rows
        except (requests.RequestException, OSError) as exc:
            print(f"{name}: feed error: {exc}")
    return []

def collect_news(existing):
    pool = []
    for name, urls in FEEDS:
        pool.extend(get_feed(name, urls))
    pool.sort(key=lambda x: x["_ts"], reverse=True)
    chosen = []
    per_source = Counter()
    def try_add(item):
        if per_source[item["source"]] >= 5:
            return False
        if any(duplicate(item, already) for already in chosen):
            return False
        chosen.append(item)
        per_source[item["source"]] += 1
        return True

    # Initial pass aims to show each available editorial source at least once.
    for name, _ in FEEDS:
        for row in pool:
            if row["source"] == name and try_add(row):
                break
    for row in pool:
        if len(chosen) >= 18:
            break
        try_add(row)
    chosen.sort(key=lambda x: x["_ts"], reverse=True)
    output = [{k: v for k, v in item.items() if not k.startswith("_")} for item in chosen[:18]]
    if output:
        return output, utcstamp()
    print("No fresh editorial news available; preserving last successful snapshot.")
    return existing.get("news", []), existing.get("news_updated_at")

def tmdb_access():
    token = os.environ.get("TMDB_READ_ACCESS_TOKEN", "").strip()
    key = os.environ.get("TMDB_API_KEY", "").strip()
    if token:
        return {"Authorization": "Bearer "+token}, {}
    if key:
        return {}, {"api_key": key}
    # Compatibility for existing public deployment. The site already has a
    # published API v3 key; prefer GitHub Actions secret for future deployments.
    try:
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        m = re.search(r"const TM_DEFAULT\s*=\s*'([a-fA-F0-9]{32})'", source)
        if m:
            print("Using legacy public TMDB v3 key; add Actions secret TMDB_READ_ACCESS_TOKEN to migrate.")
            return {}, {"api_key": m.group(1)}
    except OSError:
        pass
    return None, None

def tmdb_list(endpoint, auth_headers, key_args):
    args = {"language": "en-US", "page": 1}
    if endpoint != "/trending/movie/week":
        args["region"] = "US"
    args.update(key_args)
    resp = SESSION.get(API+endpoint, params=args, headers=auth_headers, timeout=(12, 30))
    resp.raise_for_status()
    body = resp.json()
    items = body.get("results")
    if not isinstance(items, list):
        raise ValueError("TMDB returned no movie results array")
    return items

def save_official_poster(movie, known_poster):
    movie_id = movie["id"]
    poster_path = str(movie.get("poster_path") or "")
    if not re.fullmatch(r"/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)", poster_path, re.I):
        return known_poster if known_poster and (ROOT / known_poster).is_file() else ""
    # The same TMDB ID + same official poster_path always map to one exact file.
    import hashlib
    hash_part = hashlib.sha256(poster_path.encode()).hexdigest()[:12]
    local = Path("assets") / "posters" / f"{movie_id}-{hash_part}.webp"
    dest = ROOT / local
    if dest.is_file() and dest.stat().st_size > 1000:
        return local.as_posix()
    try:
        url = POSTER_SOURCE+poster_path
        res = SESSION.get(url, timeout=(12, 35), stream=True)
        res.raise_for_status()
        data = bytearray()
        for chunk in res.iter_content(65536):
            data.extend(chunk)
            if len(data) > 12*1024*1024:
                raise ValueError("Poster too large")
        # Preserve the authentic artwork; only resize/compress for bandwidth.
        im = Image.open(BytesIO(data))
        im = ImageOps.exif_transpose(im).convert("RGB")
        if im.width < 120 or im.height < 180:
            raise ValueError("Poster resolution too small")
        im.thumbnail((640, 960), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix(".tmp")
        im.save(temp, format="WEBP", quality=86, method=5)
        temp.replace(dest)
        return local.as_posix()
    except (requests.RequestException, OSError, ValueError, UnidentifiedImageError) as exc:
        print(f"Poster unavailable for TMDB {movie_id}: {exc}")
        return known_poster if known_poster and (ROOT / known_poster).is_file() else ""

def build_films(existing):
    headers, args = tmdb_access()
    if headers is None:
        print("TMDB not configured; preserving existing film lists.")
        return existing.get("movies", {}), existing.get("movies_updated_at")
    old_by_id = {}
    for group in (existing.get("movies") or {}).values():
        for item in group if isinstance(group, list) else []:
            if isinstance(item, dict) and isinstance(item.get("id"), int):
                old_by_id[item["id"]] = item.get("poster_url", "")
    groups = {}
    errors = 0
    for key, endpoint in (
        ("now", "/movie/now_playing"),
        ("soon", "/movie/upcoming"),
        ("trends", "/trending/movie/week"),
    ):
        try:
            raw = tmdb_list(endpoint, headers, args)
            if key == "soon":
                today = NOW.date().isoformat()
                raw = [item for item in raw if str(item.get("release_date") or "") >= today]
            filtered = []
            for movie in raw:
                movie_id = movie.get("id")
                if not isinstance(movie_id, int) or movie_id <= 0:
                    continue
                title = str(movie.get("title") or movie.get("original_title") or "").strip()
                if not title or movie.get("adult") is True:
                    continue
                filtered.append({
                    "id": movie_id,
                    "title": title[:180],
                    "original_title": str(movie.get("original_title") or title)[:180],
                    "release_date": str(movie.get("release_date") or "")[:10],
                    "vote_average": round(float(movie.get("vote_average") or 0), 1),
                    "poster_path": movie.get("poster_path") or "",
                    "overview": str(movie.get("overview") or "")[:800],
                })
                if len(filtered) >= MOVIE_LIMIT:
                    break
            groups[key] = filtered
            print(f"TMDB {key}: {len(filtered)} items")
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            errors += 1
            print(f"TMDB {key} unavailable: {exc}")
            groups[key] = existing.get("movies", {}).get(key, [])

    seen_movies = {}
    for group in groups.values():
        for movie in group:
            if movie["id"] in seen_movies:
                movie["poster_url"] = seen_movies[movie["id"]]
                continue
            known = old_by_id.get(movie["id"], "")
            # Avoid carrying a poster from a different official poster_path.
            old_entry = next((x for section in (existing.get("movies") or {}).values() for x in section
                             if isinstance(x, dict) and x.get("id") == movie["id"]), None)
            if old_entry and old_entry.get("poster_path") != movie.get("poster_path"):
                known = ""
            movie["poster_url"] = save_official_poster(movie, known)
            seen_movies[movie["id"]] = movie["poster_url"]
    stamp = utcstamp() if errors < 3 else existing.get("movies_updated_at")
    return groups, stamp

def main():
    existing = old_snapshot()
    news, news_updated = collect_news(existing)
    movies, movies_updated = build_films(existing)
    if not news and not any(movies.values()):
        print("No news and no movies; not replacing a possibly working snapshot.")
        return 1
    payload = {
        "schema_version": 2,
        "source": "My Film Archive GitHub Actions; TMDB official metadata and poster artwork; publisher RSS headlines",
        "generated_at": utcstamp(),
        "news_updated_at": news_updated,
        "movies_updated_at": movies_updated,
        "news": news,
        "movies": movies,
    }
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(DATA_FILE)
    print(f"Published {len(news)} unique headlines and {sum(len(v) for v in movies.values())} movie entries.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
