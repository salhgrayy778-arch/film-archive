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

def try_online_quality_provider():
    """Optional higher-quality server-side provider; Argos remains offline fallback.

    This is attempted in GitHub Actions, NEVER from a visitor's browser.
    The unofficial endpoint may be unavailable; failures must not break news.
    """
    try:
        from deep_translator import GoogleTranslator
        provider = GoogleTranslator(source="en", target="fa")
        probe = provider.translate("The movie premiered at the film festival.")
        if usable_translation("The movie premiered at the film festival.", probe):
            return provider
    except Exception as error:
        print("Optional online translator unavailable; retaining offline translations:", str(error)[:140])
    return None

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

    online = try_online_quality_provider()
    pending = [
        story for story in stories
        if isinstance(story, dict) and (
            not story.get("title_fa")
            or story.get("title_source_for_fa") != story.get("title")
            or (story.get("summary") and not story.get("summary_fa"))
            or (online is not None and story.get("translation_engine") != "google")
        )
    ]
    if not pending:
        print("Existing Persian translations are up to date.")
        return 0

    offline = None
    def translated(text: str) -> tuple[str, str]:
        nonlocal offline
        if online is not None:
            try:
                result = usable_translation(text, online.translate(text))
                if result:
                    return result, "google"
            except Exception as error:
                print("Online translation request failed; trying Argos:", str(error)[:120])
        if offline is None:
            offline = load_translation_model()
        try:
            result = usable_translation(text, offline.translate(text))
            if result:
                return result, "argos"
        except Exception as error:
            print("Offline Argos translation failed:", str(error)[:120])
        return "", ""

    updated = 0
    for item in pending:
        headline = str(item.get("title") or "").strip()
        if not headline:
            continue
        if item.get("title_source_for_fa") != headline:
            item.pop("title_fa", None)
            item.pop("summary_fa", None)
            item.pop("translation_engine", None)

        needs_title = not item.get("title_fa") or (online and item.get("translation_engine") != "google")
        if needs_title:
            try:
                value, provider = translated(headline)
                if value:
                    item["title_fa"] = value
                    item["title_source_for_fa"] = headline
                    item["translation_engine"] = provider
                    if provider == "google":item.pop("summary_fa", None)
                    updated += 1
            except Exception as error:
                print("Headline translation unavailable:", str(error)[:140])
        summary = str(item.get("summary") or "").strip()
        if summary and item.get("title_fa") and (not item.get("summary_fa") or (online and item.get("translation_engine") == "google" and item.get("summary_engine") != "google")):
            try:
                value, provider = translated(summary)
                if value:
                    item["summary_fa"] = value[:600]
                    item["summary_engine"] = provider
            except Exception as error:
                print("Summary translation unavailable:", str(error)[:140])
    if not updated and not any(story.get("summary_fa") for story in pending):
        print("No new translations; preserving last valid published data")
        return 0
    data["news_translation_updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    temp = SOURCE.with_suffix(".translation.tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(SOURCE)
    print(f"Persian headlines updated: {updated}; Google-backed: {sum(x.get('translation_engine')=='google' for x in stories)}; summaries: {sum(bool(x.get('summary_fa')) for x in stories)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
