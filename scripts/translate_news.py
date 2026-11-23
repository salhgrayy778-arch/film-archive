#!/usr/bin/env python3
"""Generate offline Persian translations for news headlines and short RSS summaries.

Translation runs only on GitHub Actions. Visitors never contact a translator,
and the English source remains available for transparency and accuracy.
Missing/failed translations are not passed off as Persian.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "home-feed.json"
PERSIAN = re.compile(r"[\u0600-\u06ff]")
MODEL_LOADED = False

def load_translation_model():
    from argostranslate import package, translate
    installed = translate.get_installed_languages()
    english = next((l for l in installed if l.code == "en"), None)
    persian = next((l for l in installed if l.code == "fa"), None)
    if english and persian and english.get_translation(persian):
        return english.get_translation(persian)
    print("Installing offline Argos English-to-Persian model.")
    package.update_package_index()
    options = package.get_available_packages()
    model = next((p for p in options if p.from_code == "en" and p.to_code == "fa"), None)
    if model is None:
        raise RuntimeError("English-to-Persian Argos model not available")
    package.install_from_path(model.download())
    installed = translate.get_installed_languages()
    english = next((l for l in installed if l.code == "en"), None)
    persian = next((l for l in installed if l.code == "fa"), None)
    if not english or not persian:
        raise RuntimeError("Installed English-Persian model missing")
    return english.get_translation(persian)

def usable_translation(original: str, translated: str) -> str:
    value = re.sub(r"\s+", " ", str(translated or "")).strip()
    if not value or not PERSIAN.search(value) or len(value) > 900:
        return ""
    # Avoid presenting unchanged English content as a successful translation.
    if value.casefold() == original.strip().casefold():
        return ""
    return value

def main():
    try:
        raw = SOURCE.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        print("Cannot translate missing/invalid feed:", error)
        return 1
    stories = data.get("news")
    if not isinstance(stories, list):
        print("No news in current snapshot.")
        return 1

    missing = [
        story for story in stories
        if isinstance(story, dict)
        and (not story.get("title_fa") or
             story.get("title_source_for_fa") != story.get("title") or
             (story.get("summary") and not story.get("summary_fa")))
    ]
    if not missing:
        print("Persian translations already available.")
        return 0

    try:
        translator = load_translation_model()
    except Exception as error:
        # Preserve the original feed and prior validated Persian translations.
        # Subsequent scheduled jobs can retry without blocking the site.
        print("Offline Persian translator unavailable:", repr(error))
        return 0

    count = 0
    for item in missing:
        headline = str(item.get("title") or "").strip()
        if not headline:
            continue
        if item.get("title_source_for_fa") != headline:
            item.pop("title_fa", None)
            item.pop("summary_fa", None)
        if not item.get("title_fa"):
            try:
                translated = usable_translation(headline, translator.translate(headline))
                if translated:
                    item["title_fa"] = translated
                    item["title_source_for_fa"] = headline
                    count += 1
            except Exception as error:
                print("Headline translation failed:", str(error)[:150])
        short = str(item.get("summary") or "").strip()
        if short and not item.get("summary_fa") and item.get("title_fa"):
            try:
                translated = usable_translation(short, translator.translate(short))
                if translated:
                    item["summary_fa"] = translated[:600]
            except Exception as error:
                print("Summary translation failed:", str(error)[:150])
    if not count and not any(story.get("summary_fa") for story in missing):
        print("No successful new translations; preserving prior feed")
        return 0
    data["news_translation_updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    temp=SOURCE.with_suffix(".translation.tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(SOURCE)
    print(f"Offline Persian titles translated: {count}; Persian summaries: {sum(bool(x.get('summary_fa')) for x in stories)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
