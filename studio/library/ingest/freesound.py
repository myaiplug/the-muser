#!/usr/bin/env python3
"""Freesound ingester (optional, needs FREESOUND_API_KEY in the environment).

Without the key this script prints a notice and exits 0, so CI and local runs pass.

IMPORTANT, read before enabling: Freesound's API terms are written for non-commercial use and say
commercial use of the API needs a separate agreement with the Freesound team. Per-sound licences
(CC0 / CC BY) are valid on their own, but this ingester is therefore OFF by default in the shipped
workflow and records get provenance "source-metadata". Review https://freesound.org/help/tos_api/
and get written clearance before shipping anything fetched through it in the paid app.

Only sounds whose API `license` field maps onto the allowlist (CC0 1.0, CC BY 3.0/4.0) are kept.
Everything else (BY-NC, Sampling+, unknown) is dropped before download.
"""
import json, os, sys, urllib.parse, urllib.request
from io import BytesIO

from licenses_bridge import normalize_license  # thin Python port of src/licenses.mjs

API = "https://freesound.org/apiv2"
FIELDS = "id,name,username,license,url,previews,duration,tags,description"
# query -> taxonomy category
QUERIES = {
    "kick drum one shot": "acoustic-kick",
    "snare drum one shot": "acoustic-snare",
    "hand clap one shot": "hand-clap",
    "hihat closed": "acoustic-hat",
    "hihat open": "acoustic-open-hat",
    "crash cymbal": "acoustic-crash",
    "ride cymbal": "acoustic-ride",
    "tom drum hit": "acoustic-tom",
    "808 kick": "808-sub",
    "tambourine hit": "acoustic-tambourine-perc",
}
MAX_DURATION_S = 4.0
ATTRIBUTION = {"CC0-1.0": "CC0 1.0 Universal", "CC-BY-3.0": "CC BY 3.0", "CC-BY-4.0": "CC BY 4.0"}


def search(query, key, page_size=40, fetch=None):
    fetch = fetch or (lambda u: json.loads(urllib.request.urlopen(u, timeout=60).read()))
    flt = f'duration:[0 TO {MAX_DURATION_S}] license:("Creative Commons 0" OR "Attribution")'
    params = {"query": query, "filter": flt, "fields": FIELDS, "page_size": page_size, "token": key, "sort": "rating_desc"}
    return fetch(f"{API}/search/text/?" + urllib.parse.urlencode(params)).get("results", [])


def to_record_meta(sound, category):
    """Pure function: Freesound result -> metadata dict, or (None, reason) if the licence is not allowed."""
    lic = normalize_license(sound.get("license"))
    if not lic:
        return None, f"licence not allowed: {sound.get('license')}"
    if not sound.get("username"):
        return None, "no author"
    if sound.get("duration", 99) > MAX_DURATION_S:
        return None, "too long for a one-shot"
    url = sound.get("url") or f"https://freesound.org/s/{sound['id']}/"
    previews = sound.get("previews") or {}
    prev = previews.get("preview-hq-ogg") or previews.get("preview-hq-mp3")
    if not prev:
        return None, "no preview URL"
    title = sound["name"].rsplit(".", 1)[0].strip()
    return {
        "sid": f"fs-{sound['id']}", "title": title, "category": category, "license": lic,
        "license_url": {"CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
                        "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
                        "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/"}[lic],
        "author": sound["username"], "source_url": url, "preview": prev,
        "extra_tags": [t.lower() for t in (sound.get("tags") or [])[:6] if t.isascii()],
    }, None


def main():
    key = os.environ.get("FREESOUND_API_KEY", "").strip()
    if not key:
        print("FREESOUND_API_KEY not set: skipping Freesound ingest (this is fine).")
        return 0
    import soundfile as sf
    from common import LIB, finish, make_record, resample, save_records, to_mono, write_flac
    recs, dropped = [], 0
    for q, cat in QUERIES.items():
        for s in search(q, key):
            meta, why = to_record_meta(s, cat)
            if not meta:
                dropped += 1
                continue
            raw = urllib.request.urlopen(meta["preview"], timeout=60).read()
            data, sr = sf.read(BytesIO(raw))
            rel = f"audio/freesound/{meta['sid']}.flac"
            info = write_flac(finish(resample(to_mono(data), sr), max_s=3.0), LIB / rel)
            recs.append(make_record(
                sid=meta["sid"], title=meta["title"], category=cat, source="freesound.org",
                license=meta["license"], license_url=meta["license_url"], author=meta["author"],
                source_url=meta["source_url"], provenance="source-metadata", file=rel, audio_info=info,
                extra_tags=meta["extra_tags"], origin_path=meta["preview"],
                processing="decoded from Freesound HQ preview, mono, trimmed, faded, peak-normalised, FLAC 16-bit 44.1 kHz",
                notes="Fetched via Freesound API; see ToS note in ingest/freesound.py.",
            ))
    save_records("freesound", recs)
    print(f"{len(recs)} ingested, {dropped} dropped on licence/metadata")
    return 0


if __name__ == "__main__":
    sys.exit(main())
