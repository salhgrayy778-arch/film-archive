#!/usr/bin/env python3
"""Incrementally cache real TMDB metadata and official posters for highly popular
movie IDs outside the original 1,100-item catalog.

GitHub Pages is static, so a complete 1.27-million-poster archive is not
technically viable there. This job expands the no-VPN *verified image* subset
in bounded weekly batches, preserving existing files and metadata.

Outputs:
  data/tmdb-extra.json  -- small, curated additions with real TMDB metadata
  assets/catalog/<id>-<posterhash>.webp  -- authentic, resized TMDB artwork
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import argparse
import gzip
import json
from pathlib import Path
import sys

import requests
import build_catalog as catalog_build
import update_cinema as core

ROOT=Path(__file__).resolve().parent.parent
EXPORT=ROOT/"data"/"tmdb-universe"/"by-id"
OUT=ROOT/"data"/"tmdb-extra.json"
CURATED=ROOT/"data"/"tmdb-catalog.json"
MAX_ITEMS=25000

def read_existing():
    try:
        obj=json.loads(OUT.read_text(encoding="utf-8"))
        if isinstance(obj.get("movies"),list):
            return {m["id"]:m for m in obj["movies"] if isinstance(m,dict) and isinstance(m.get("id"),int)}
    except (OSError,ValueError,KeyError):
        pass
    return {}

def read_curated():
    try:
        d=json.loads(CURATED.read_text(encoding="utf-8"))
        return {m["id"] for m in d.get("movies",[]) if isinstance(m.get("id"),int)}
    except (OSError,ValueError):
        return set()

def popularity_candidates(excluded):
    records=[]
    for path in sorted(EXPORT.glob("*.json.gz")):
        try:
            with gzip.open(path,"rt",encoding="utf-8") as source:
                for movie_id,title,popularity in json.load(source):
                    if movie_id not in excluded and title:
                        records.append((int(movie_id),str(title),float(popularity)))
        except (OSError,ValueError,TypeError) as exc:
            raise RuntimeError(f"Invalid compressed TMDB ID shard: {path}: {exc}") from exc
    records.sort(key=lambda m:(-m[2],m[0]))
    return records

def fetch_detail(candidate,headers,auth):
    movie_id,original,popularity=candidate
    try:
        detail=catalog_build.get_json("/movie/"+str(movie_id),
          {"language":"en-US","append_to_response":"credits"},headers,auth)
        if detail.get("adult") or detail.get("id")!=movie_id:
            return None
        path=detail.get("poster_path") or ""
        if not path:return None
        genre_ids=[genre.get("id") for genre in detail.get("genres",[])
                   if isinstance(genre.get("id"),int)][:8]
        people=detail.get("credits") or {}
        crew=people.get("crew",[])
        actors=people.get("cast",[])
        value={
            "id":movie_id,
            "title":str(detail.get("title") or original)[:180],
            "original_title":original[:180],
            "fa_title":"",
            "release_date":str(detail.get("release_date") or "")[:10],
            "vote_average":round(float(detail.get("vote_average") or 0),1),
            "poster_path":path,
            "poster_url":"",
            "popularity":round(popularity,2),
            "runtime":detail.get("runtime") or 0,
            "director":", ".join(p.get("name","") for p in crew if p.get("job")=="Director")[:180],
            "cast":", ".join(p.get("name","") for p in actors[:6])[:280],
            "country":", ".join(p.get("name","") for p in detail.get("production_countries",[]))[:160],
            "genre_ids":genre_ids,
            "overview":str(detail.get("overview") or "")[:1400],
            "details_ok":True,
        }
        # Use TMDB Persian metadata when it actually contains Persian text.
        try:
            fa=catalog_build.get_json("/movie/"+str(movie_id),
                {"language":"fa-IR"},headers,auth)
            if fa.get("id")==movie_id:
                fa_title=str(fa.get("title") or "").strip()
                fa_overview=str(fa.get("overview") or "").strip()
                if any("\u0600" <= ch <= "\u06ff" for ch in fa_title):
                    value["fa_title"]=fa_title[:180]
                if any("\u0600" <= ch <= "\u06ff" for ch in fa_overview):
                    value["overview_fa"]=fa_overview[:1400]
                    value["overview_source_for_fa"]=value["overview"]
                    value["overview_translation_source"]="tmdb"
        except (requests.RequestException,ValueError,TypeError):
            pass
        artwork=catalog_build.poster_url(value)
        if not artwork:return None
        value["poster_url"]=artwork
        return value
    except (requests.RequestException,ValueError,TypeError,KeyError,AttributeError) as exc:
        print(f"TMDB extended detail/poster for {movie_id} failed: {str(exc)[:160]}")
        return None

def save(rows):
    data={
        "schema_version":1,
        "source":"TMDB verified metadata and locally cached original movie poster images",
        "updated_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),
        "movie_count":len(rows),
        "movies":sorted(rows.values(),key=lambda x:(-float(x.get("popularity") or 0),x["id"])),
    }
    temp=OUT.with_suffix(".json.tmp")
    temp.parent.mkdir(parents=True,exist_ok=True)
    temp.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    temp.replace(OUT)
    print(f"Verified additional TMDB movie details/posters: {len(rows):,}",flush=True)

def run(batch_size):
    headers,auth=core.tmdb_access()
    if headers is None:
        print("TMDB API credential absent; original poster enrichment skipped.")
        return 0 if OUT.exists() else 1
    current=read_existing()
    if len(current)>=MAX_ITEMS:
        print("Maximum number of cached extra movie posters reached.")
        return 0
    excluded=read_curated()|set(current)
    candidates=popularity_candidates(excluded)
    # Some TMDB entries have no poster or inaccessible metadata, so try twice
    # the requested batch size while keeping API load bounded.
    candidate_count=min(batch_size*2,len(candidates),MAX_ITEMS-len(current)+batch_size)
    target=min(batch_size,MAX_ITEMS-len(current))
    print(f"Curated posters: {len(read_curated())}, existing extra: {len(current)}, "
          f"candidate attempts: {candidate_count}, new target: {target}",flush=True)
    successes=0
    with ThreadPoolExecutor(max_workers=6) as workers:
        jobs=[workers.submit(fetch_detail,row,headers,auth)
              for row in candidates[:candidate_count]]
        for job in as_completed(jobs):
            value=job.result()
            if value and value["id"] not in current:
                current[value["id"]]=value
                successes+=1
    # All attempted candidates in a batch may complete; we then retain only
    # MAX_ITEMS in the resulting JSON. Original downloaded posters can be
    # reused in later runs if temporarily not represented in JSON.
    if len(current)>MAX_ITEMS:
        current=dict(sorted(current.items(),key=lambda p:-p[1]["popularity"])[:MAX_ITEMS])
    if successes:
        save(current)
    else:
        print("No additional image-backed metadata could be verified; preserving old data.")
    return 0

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size",type=int,default=450)
    args=parser.parse_args()
    if not 1<=args.batch_size<=1200:
        parser.error("batch size must be between 1 and 1200")
    return run(args.batch_size)

if __name__=="__main__":
    sys.exit(main())
