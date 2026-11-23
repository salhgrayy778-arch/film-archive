#!/usr/bin/env python3
"""Create a searchable TMDB movie catalog, served with images from GitHub Pages.

The catalog is a periodically synchronized *subset* of TMDB, not the entire database.
Only GitHub Actions calls TMDB. Browser suggestions work without direct TMDB access.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import re
import time

from PIL import Image, ImageOps, UnidentifiedImageError
import requests

import update_cinema as core

ROOT=Path(__file__).resolve().parent.parent
OUTPUT=ROOT / "data" / "tmdb-catalog.json"
IMAGE_DIR=ROOT / "assets" / "catalog"
MAX_CATALOG=1100
DETAIL_WORKERS=6
POSTER_WORKERS=8
API=core.API
SESSION=core.SESSION

GENRE_IDS={18,35,80,9648,53,27,878,14,28,12,10749,99,16,36,10752}
CATEGORIES=[
    ("/movie/popular",18,{}),
    ("/trending/movie/week",5,{}),
    ("/movie/top_rated",18,{}),
    ("/movie/now_playing",4,{"region":"US"}),
    ("/movie/upcoming",4,{"region":"US"}),
    ("/discover/movie",10,{"sort_by":"vote_average.desc","vote_count.gte":500}),
    ("/discover/movie",5,{"sort_by":"primary_release_date.desc","vote_count.gte":20}),
    ("/discover/movie",7,{"sort_by":"popularity.desc","primary_release_date.gte":"2010-01-01","primary_release_date.lte":"2019-12-31"}),
    ("/discover/movie",7,{"sort_by":"popularity.desc","primary_release_date.gte":"2000-01-01","primary_release_date.lte":"2009-12-31"}),
    ("/discover/movie",7,{"sort_by":"popularity.desc","primary_release_date.gte":"1990-01-01","primary_release_date.lte":"1999-12-31"}),
    ("/discover/movie",5,{"sort_by":"popularity.desc","primary_release_date.gte":"1970-01-01","primary_release_date.lte":"1989-12-31"}),
]

def cached_catalog():
    try:
        doc=json.loads(OUTPUT.read_text(encoding="utf-8"))
        if doc.get("schema_version")==1 and isinstance(doc.get("movies"),list):
            return {str(x["id"]):x for x in doc["movies"] if isinstance(x,dict) and isinstance(x.get("id"),int)}
    except (OSError,ValueError,KeyError):
        pass
    return {}

def get_json(path,params,auth_headers,key_args):
    q=dict(params);q.update(key_args)
    response=SESSION.get(API+path,params=q,headers=auth_headers,timeout=(10,28))
    response.raise_for_status()
    return response.json()

def get_candidates(headers,auth):
    candidates={}
    successful=0
    for endpoint,pages,filter_args in CATEGORIES:
        for page in range(1,pages+1):
            try:
                q={"language":"en-US","page":page}
                q.update(filter_args)
                response=get_json(endpoint,q,headers,auth)
                successful+=1
                for m in response.get("results",[]):
                    id=m.get("id")
                    if not isinstance(id,int) or id<=0 or m.get("adult") is True:
                        continue
                    if id not in candidates and (m.get("title") or m.get("original_title")):
                        candidates[id]=m
            except (requests.RequestException,ValueError) as e:
                print(f"Discover failed {endpoint} page {page}: {e}")
                break
        if len(candidates)>=MAX_CATALOG:
            break
    print(f"Candidate sources succeeded: {successful} requests, {len(candidates)} distinct movies")
    return list(candidates.values())[:MAX_CATALOG]

def poster_url(movie):
    value=str(movie.get("poster_path") or "")
    if not re.fullmatch(r"/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)",value,re.I):
        return ""
    id=movie["id"]
    checksum=hashlib.sha256(value.encode()).hexdigest()[:12]
    rel=(Path("assets")/"catalog"/f"{id}-{checksum}.webp").as_posix()
    path=ROOT/rel
    if path.exists() and path.stat().st_size>1000:
        return rel
    try:
        response=SESSION.get("https://image.tmdb.org/t/p/w500"+value,timeout=(8,26),stream=True)
        response.raise_for_status()
        raw=bytearray()
        for chunk in response.iter_content(32768):
            raw.extend(chunk)
            if len(raw)>6*1024*1024:
                raise ValueError("poster too large")
        image=Image.open(BytesIO(raw))
        image=ImageOps.exif_transpose(image).convert("RGB")
        if image.width<100 or image.height<140:
            return ""
        image.thumbnail((300,450),Image.Resampling.LANCZOS)
        path.parent.mkdir(parents=True,exist_ok=True)
        temp=path.with_suffix(".tmp")
        image.save(temp,"WEBP",quality=80,method=4)
        temp.replace(path)
        return rel
    except (requests.RequestException,OSError,ValueError,UnidentifiedImageError) as exc:
        print(f"Poster unavailable for {id}: {exc}")
        return ""

def detail(movie,headers,auth,prior):
    id=movie["id"]
    original=str(movie.get("original_title") or movie.get("title") or "").strip()
    title=str(movie.get("title") or original).strip()
    # Previous detail fields remain useful until the movie changes. Do not
    # re-fetch the same movie every three hours.
    fields={}
    if prior and prior.get("details_ok"):
        fields={k:prior.get(k) for k in ["runtime","director","cast","country","genre_ids","fa_title","overview"]}
        fields["details_ok"]=True
    else:
        try:
            d=get_json("/movie/"+str(id),{"language":"en-US","append_to_response":"credits"},headers,auth)
            crew=d.get("credits",{}).get("crew",[])
            cast=d.get("credits",{}).get("cast",[])
            fields={
                "runtime":d.get("runtime") or 0,
                "director":", ".join(x.get("name","") for x in crew if x.get("job")=="Director")[:180],
                "cast":", ".join(x.get("name","") for x in cast[:6])[:280],
                "country":", ".join(x.get("name","") for x in (d.get("production_countries") or []))[:160],
                "genre_ids":[x.get("id") for x in d.get("genres",[]) if isinstance(x.get("id"),int)][:8],
                "overview":str(d.get("overview") or movie.get("overview") or "")[:1400],
                "details_ok":True,
                "fa_title":"",
            }
            # TMDB localization is optional and not always available.
            try:
                localized=get_json("/movie/"+str(id),{"language":"fa-IR"},headers,auth)
                fa=str(localized.get("title") or "")
                if re.search("[\u0600-\u06FF]",fa):
                    fields["fa_title"]=fa[:180]
            except (requests.RequestException,ValueError):
                pass
        except (requests.RequestException,ValueError,AttributeError) as e:
            print(f"TMDB detail for {id} unavailable: {e}")
            fields={
                "runtime":prior.get("runtime",0) if prior else 0,
                "director":prior.get("director","") if prior else "",
                "cast":prior.get("cast","") if prior else "",
                "country":prior.get("country","") if prior else "",
                "genre_ids":prior.get("genre_ids",movie.get("genre_ids",[])) if prior else movie.get("genre_ids",[]),
                "overview":str(movie.get("overview") or "")[:1400],
                "fa_title":prior.get("fa_title","") if prior else "",
                "details_ok":False,
            }
    return {
        "id":id,
        "title":title[:180],
        "original_title":original[:180],
        "fa_title":fields.get("fa_title") or "",
        "release_date":str(movie.get("release_date") or "")[:10],
        "vote_average":round(float(movie.get("vote_average") or 0),1),
        "poster_path":movie.get("poster_path") or "",
        "poster_url":prior.get("poster_url","") if prior and prior.get("poster_path")==movie.get("poster_path") else "",
        "popularity":round(float(movie.get("popularity") or 0),2),
        **fields
    }

def build():
    headers,auth=core.tmdb_access()
    if headers is None:
        print("No TMDB credentials, preserving last catalog if available.")
        return 0 if OUTPUT.exists() else 1
    old=cached_catalog()
    movies=get_candidates(headers,auth)
    if not movies:
        print("No candidates; preserving previous catalog.")
        return 0 if old else 1
    results=[None]*len(movies)
    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as pool:
        jobs={pool.submit(detail,m,headers,auth,old.get(str(m["id"]))):n for n,m in enumerate(movies)}
        for job in as_completed(jobs):
            idx=jobs[job]
            try:results[idx]=job.result()
            except Exception as error:
                print("Detail worker error:",error)
                m=movies[idx];results[idx]=old.get(str(m["id"])) or {
                    "id":m["id"],"title":m.get("title") or m.get("original_title"),
                    "original_title":m.get("original_title") or "",
                    "release_date":m.get("release_date") or "",
                    "poster_path":m.get("poster_path") or "",
                    "poster_url":"","genre_ids":m.get("genre_ids") or [],
                    "details_ok":False,
                }
    # Persist artwork for every suggestion, not only the currently trending titles.
    with ThreadPoolExecutor(max_workers=POSTER_WORKERS) as pool:
        jobs={pool.submit(poster_url,m):m for m in results if m and not m.get("poster_url")}
        for job in as_completed(jobs):
            m=jobs[job]
            try:m["poster_url"]=job.result()
            except Exception as error:
                print("Poster worker error:",error)
    records=[m for m in results if m and m.get("id") and m.get("title")]
    if len(records)<120 and old:
        print("Too few candidates; keeping previous searchable catalog")
        return 0
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    payload={"schema_version":1,"source":"TMDB periodic metadata and original poster artwork, cached on My Film Archive",
             "updated_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),
             "scope":"Curated popular, critically acclaimed, recent and selected classic titles; not all TMDB movies",
             "movies":records}
    p=OUTPUT.with_suffix(".tmp")
    p.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    p.replace(OUTPUT)
    print(f"Catalog saved: {len(records)} titles, {sum(bool(m.get('poster_url')) for m in records)} local images, {sum(bool(m.get('details_ok')) for m in records)} detailed records")
    return 0

if __name__=="__main__":
    raise SystemExit(build())
