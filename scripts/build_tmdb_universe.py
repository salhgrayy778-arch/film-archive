#!/usr/bin/env python3
"""Build a sharded, compressed search index of TMDB's daily movie ID export.

TMDB's daily movie export contains IDs, original titles and popularity, NOT
posters, cast, release dates or synopses. It is an index, not a full metadata
snapshot. Store the export's non-adult movie entries in GitHub Pages shards
so ordinary searches work without a browser connection to api.themoviedb.org.

Output:
  data/tmdb-universe/manifest.json
  data/tmdb-universe/search/<letter>.json.gz
  data/tmdb-universe/by-id/<NN>.json.gz

Each movie appears once in an ID shard and in one search shard per distinct
first character of its normalized title tokens. This supports searching ANY
word of a title without fetching an enormous site-wide JSON document.

Usage: python scripts/build_tmdb_universe.py
Optional smoke input: --input-jsonl tests/fixtures/tmdb-export.jsonl
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import argparse
import gzip
import io
import json
from pathlib import Path
import re
import sys
import unicodedata

import requests

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "data" / "tmdb-universe"
ID_SHARDS = 64
UNICODE_SHARDS = 24
EXPORT_BASE = "https://files.tmdb.org/p/exports/"


def normalize(value: str) -> str:
    raw = unicodedata.normalize("NFKD", str(value or "")).casefold()
    raw = raw.replace("ي", "ی").replace("ك", "ک")
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    return " ".join(re.findall(r"[^\W_]+", raw, flags=re.UNICODE))


def bucket_for_word(word: str) -> str:
    if not word:
        return ""
    ch = word[0]
    if ("a" <= ch <= "z") or ("0" <= ch <= "9"):
        return ch
    return f"u-{ord(ch) % UNICODE_SHARDS:02d}"


def movie_record(entry):
    if not isinstance(entry, dict) or entry.get("adult") is True:
        return None
    movie_id = entry.get("id")
    if isinstance(movie_id, bool) or not isinstance(movie_id, int) or not (0 < movie_id < 2**53):
        return None
    name = str(entry.get("original_title") or "").strip()
    if not name or len(name) > 240:
        return None
    try:
        popularity = min(999999, max(0, round(float(entry.get("popularity") or 0))))
    except (ValueError, TypeError, OverflowError):
        popularity = 0
    # Compact, deterministic display record. Do NOT synthesize poster/plot data.
    return [movie_id, name, popularity]


def read_export(stream):
    for line_no, raw in enumerate(stream, 1):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except (ValueError, UnicodeDecodeError) as error:
            if line_no <= 10:
                raise ValueError(f"Invalid TMDB export data on line {line_no}: {error}") from error
            continue
        value = movie_record(obj)
        if value is not None:
            yield value


def download_export():
    utc = datetime.now(timezone.utc)
    session = requests.Session()
    errors = []
    # TMDB publishes each export around 08:00 UTC; the most recent may not
    # exist during an early run, so try the last few available publication days.
    for age in range(0, 6):
        day = utc - timedelta(days=age)
        filename = f"movie_ids_{day:%m_%d_%Y}.json.gz"
        url = EXPORT_BASE + filename
        try:
            response = session.get(url, stream=True, timeout=(12, 210))
            response.raise_for_status()
            response.raw.decode_content = False
            print("Reading TMDB official export:", url, flush=True)
            return gzip.GzipFile(fileobj=response.raw, mode="rb"), filename, response
        except (requests.RequestException, OSError) as error:
            errors.append(f"{filename}: {str(error)[:100]}")
            try:
                response.close()
            except Exception:
                pass
    raise RuntimeError("No recent TMDB daily export is accessible: " + "; ".join(errors))


def serialize_gzip(path: Path, rows):
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = gzip.compress(payload, compresslevel=8, mtime=0)
    if len(packed) > 70 * 1024 * 1024:
        raise ValueError(f"Index shard exceeds 70 MiB: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(packed)
    temp.replace(path)
    return len(packed)


def build(rows, output: Path, export_name: str, *, minimum: int = 100000):
    indexes = defaultdict(list)
    by_id = [[] for _ in range(ID_SHARDS)]
    total, stored = 0, 0
    seen_ids = set()
    for record in rows:
        total += 1
        movie_id, title, _popularity = record
        if movie_id in seen_ids:
            continue
        seen_ids.add(movie_id)
        stored += 1
        by_id[movie_id % ID_SHARDS].append(record)
        keys = {bucket_for_word(word) for word in normalize(title).split()}
        for key in keys:
            if key:
                indexes[key].append(record)
    if stored < minimum:
        raise ValueError(f"Unexpectedly small export ({stored}); refusing to overwrite valid index")

    total_bytes = 0
    for index, entries in enumerate(by_id):
        entries.sort(key=lambda record: record[0])
        total_bytes += serialize_gzip(output / "by-id" / f"{index:02d}.json.gz", entries)
    counts = {}
    for key, entries in sorted(indexes.items()):
        entries.sort(key=lambda record: (-record[2], record[0]))
        total_bytes += serialize_gzip(output / "search" / f"{key}.json.gz", entries)
        counts[key] = len(entries)

    manifest = {
        "schema_version": 1,
        "scope": "TMDB standard daily non-adult movie ID export. Titles/IDs only; detailed metadata and official posters are cached for a smaller subset.",
        "source": "TMDB Daily ID Exports",
        "source_url": "https://developer.themoviedb.org/docs/daily-id-exports",
        "source_file": export_name,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "movie_count": stored,
        "id_shards": ID_SHARDS,
        "unicode_shards": UNICODE_SHARDS,
        "search_buckets": counts,
    }
    output.mkdir(parents=True, exist_ok=True)
    temp = output / "manifest.json.tmp"
    temp.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(output / "manifest.json")
    print(f"TMDB universe index: {stored:,} non-adult movies, {len(counts)} title shards, {total_bytes / 1048576:.1f} MiB compressed", flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-jsonl", type=Path, help="Use a local TMDB-style JSONL fixture")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--min-count", type=int, default=100000)
    args = parser.parse_args()
    if args.input_jsonl:
        with args.input_jsonl.open("rb") as input_file:
            build(read_export(input_file), args.output, args.input_jsonl.name, minimum=args.min_count)
        return 0
    stream = None
    response = None
    try:
        stream, filename, response = download_export()
        build(read_export(stream), args.output, filename, minimum=args.min_count)
        return 0
    finally:
        if stream is not None:
            stream.close()
        if response is not None:
            response.close()


if __name__ == "__main__":
    sys.exit(main())
