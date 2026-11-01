#!/usr/bin/env python3
"""Ingest the Source Guy Kicks Collection from archive.org (no API key).

Item: https://archive.org/details/source-guy-kicks
Metadata (archive.org metadata API): creator "Source Guy", licenseurl CC0 1.0, description
"A collection of public domain samples made by source guy".

Provenance is "uploader-asserted": archive.org does not verify the CC0 label (several commercial
packs are mislabelled there), so only curated items by a single named creator are listed here, and
the item is flagged for owner review in the report. Duplicates are removed by audio hash.
"""
import hashlib, json, re, sys, urllib.parse, urllib.request
from io import BytesIO
from pathlib import Path

import soundfile as sf

from common import LIB, finish, make_record, resample, save_records, slug, to_mono, write_flac

ITEMS = [("source-guy-kicks", "Source Guy Kicks Collection", "electronic-kick-general")]
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
UA = {"User-Agent": "nodaw-sound-library/0.1"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    recs, hashes = [], {}
    for ident, label, cat in ITEMS:
        meta = json.loads(get(f"https://archive.org/metadata/{ident}"))
        md = meta["metadata"]
        if md.get("licenseurl", "").rstrip("/") != CC0.rstrip("/") or md.get("creator") != "Source Guy":
            print(f"REJECT {ident}: licenseurl={md.get('licenseurl')} creator={md.get('creator')}")
            continue
        for f in sorted(meta["files"], key=lambda f: f["name"]):
            if f.get("source") != "original" or not f["name"].lower().endswith(".wav"):
                continue
            raw = get(f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}")
            data, sr = sf.read(BytesIO(raw))
            x = finish(resample(to_mono(data), sr), max_s=2.0)
            base = re.sub(r"^SourceGuy - ", "", f["name"][:-4]).strip()
            title = "Source Guy " + base.title() if not base.lower().startswith("kick") else "Source Guy " + base.title()
            sid = "sg-" + slug(base)
            rel = f"audio/source-guy/{sid}.flac"
            info = write_flac(x, LIB / rel)
            if info["sha256"] in hashes:
                (LIB / rel).unlink()
                print("duplicate audio, skipped:", f["name"], "==", hashes[info["sha256"]])
                continue
            hashes[info["sha256"]] = f["name"]
            recs.append(make_record(
                sid=sid, title=title, category=cat, source="archive.org/source-guy-kicks", license="CC0-1.0",
                license_url=CC0, author="Source Guy", source_url=f"https://archive.org/details/{ident}",
                provenance="uploader-asserted", file=rel, audio_info=info, extra_tags=["electronic", "kick"],
                origin_path=f["name"],
                notes="CC0 asserted by the uploader on archive.org (metadata licenseurl). Genre assignment is a heuristic: general electronic kick.",
            ))
    save_records("source-guy", recs)


if __name__ == "__main__":
    main()
