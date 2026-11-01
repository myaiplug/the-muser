#!/usr/bin/env python3
"""Ingest curated one-shots from Karoryfer CC0 drum kits hosted on GitHub (sfzinstruments org).

Each kit repo ships a LICENSE file that is the CC0 1.0 legal code (checked via raw.githubusercontent.com
and the GitHub API, which reports spdx_id CC0-1.0). The ingester re-checks the LICENSE text and the API
license field on every run and refuses to ingest a kit if either is not CC0 1.0.

Selection is curated, not a bulk dump: for each articulation we pick a velocity layer by quantile and
round-robin 1, mix the available microphones (weights below), fold to mono, trim and normalise.

Usage:  python3 github_sfz.py [--cache DIR]       (needs network, no API key)
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
import soundfile as sf

from common import LIB, SR, finish, make_record, resample, save_records, slug, to_mono, write_flac

ORG = "sfzinstruments"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
AUTHOR = "Karoryfer Samples"
UA = {"User-Agent": "nodaw-sound-library/0.1"}

KITS = {
    "big-rusty-drums": ("Big Rusty Drums", "karoryfer.big-rusty-drums", "LICENSE"),
    "unruly-drums": ("Unruly Drums", "karoryfer.unruly-drums", "LICENSE"),
    "swirly-drums": ("Swirly Drums", "karoryfer.swirly-drums", "license"),
    "frankensnare": ("Frankensnare", "karoryfer.frankensnare", "license"),
}

FNAME = re.compile(r"^(?P<stem>.+?)_(?P<kind>vl|dl)(?P<v>\d+)_rr(?P<r>\d+)(?P<suf>_[a-z]+)?\.(?P<ext>flac|wav)$")


def M(d, g=1.0, suf=None):
    return (d, g, suf)


# Mic sets. Directory mics share identical basenames across dirs.
BR_KICK = [M("kick_24/kick/kick", 1.0), M("kick_24/kick/oh", 0.5), M("kick_24/kick/sn", 0.2)]
BR_KICK_ND = [M("kick_24_nodamp/kick/kick", 1.0), M("kick_24_nodamp/kick/oh", 0.5), M("kick_24_nodamp/kick/sn", 0.2)]


def br_sn(art):
    return [M(f"snare_14/{art}/top", 1.0), M(f"snare_14/{art}/btm", 0.5), M(f"snare_14/{art}/oh", 0.5)]


def br_cl(grp, art):  # close + overhead
    return [M(f"{grp}/{art}/cl", 1.0), M(f"{grp}/{art}/oh", 0.5)]


def un_sn(k, art):
    return [M(f"s{k}/top/rr1", 1.0), M(f"s{k}/btm/rr1", 0.5), M(f"s{k}/ohl/rr1", 0.4), M(f"s{k}/ohr/rr1", 0.4)]


def un_cl(grp, extra=()):
    return [M(f"{grp}/cl/rr1", 1.0), M(f"{grp}/oh/rr1", 0.5), *extra]


def fs_sn(k):
    return [M(f"{k}/top", 1.0), M(f"{k}/btm", 0.5), M(f"{k}/oh", 0.5)]


def tom_mics(n, art="center"):
    return [M(f"tom_{n}/{art}/cl", 1.0), M(f"tom_{n}/{art}/oh", 0.5), M(f"tom_{n}/{art}/sn", 0.2)]


# (repo, category, title, stem filter, mics, quantiles, extra tags)
def plan():
    P = []
    add = lambda *a: P.append(a)
    # ---- Big Rusty Drums
    for q in (0.25, 0.55, 0.9):
        add("big-rusty-drums", "acoustic-kick", "Rusty Kick", "k", BR_KICK, q, ["damped", "big-rusty"])
    for q in (0.4, 0.9):
        add("big-rusty-drums", "acoustic-kick", "Rusty Kick Open", "k_nodamp", BR_KICK_ND, q, ["undamped", "big-rusty"])
    for q in (0.3, 0.6, 0.95):
        add("big-rusty-drums", "acoustic-snare", "Rusty Snare", "sn_center", br_sn("center"), q, ["center", "big-rusty"])
    add("big-rusty-drums", "acoustic-snare", "Rusty Snare Edge", "sn_edge", br_sn("edge"), 0.7, ["edge", "big-rusty"])
    for q in (0.5, 0.9):
        add("big-rusty-drums", "acoustic-rimshot", "Rusty Rimshot", "sn_rims", br_sn("rimshot"), q, ["rimshot", "big-rusty"])
    for q in (0.4, 0.8):
        add("big-rusty-drums", "acoustic-sidestick", "Rusty Sidestick", "sn_ss", br_sn("sidestick"), q, ["sidestick", "big-rusty"])
    for art, lab in (("cl", "Closed"), ("tc", "Tight Closed")):
        for q in (0.3, 0.75):
            add("big-rusty-drums", "acoustic-hat", f"Rusty Hat {lab}", f"ht_{art}", br_cl("hihat_14", art), q, [lab.lower().replace(" ", "-"), "big-rusty"])
    for art, lab in (("open", "Open"), ("ho", "Half Open"), ("qo", "Quarter Open")):
        add("big-rusty-drums", "acoustic-open-hat", f"Rusty Hat {lab}", f"ht_{art}", br_cl("hihat_14", art), 0.6, [lab.lower().replace(" ", "-"), "big-rusty"])
    for q in (0.5, 0.9):
        add("big-rusty-drums", "acoustic-crash", "Rusty Crash", "cr", br_cl("crash_17", "cr"), q, ["big-rusty"])
    add("big-rusty-drums", "acoustic-crash", "Rusty Crash Sizzle", "crs", br_cl("crash_sizzle_17", "cr"), 0.7, ["sizzle", "big-rusty"])
    add("big-rusty-drums", "acoustic-china", "Rusty China", "cn", br_cl("china_18", "cn"), 0.7, ["big-rusty"])
    for q in (0.4, 0.8):
        add("big-rusty-drums", "acoustic-ride", "Rusty Ride Bow", "rd", br_cl("ride_22", "rd"), q, ["bow", "big-rusty"])
    add("big-rusty-drums", "acoustic-ride", "Rusty Ride Bell", "rd_bl", br_cl("ride_22", "bl"), 0.7, ["bell", "big-rusty"])
    add("big-rusty-drums", "acoustic-ride", "Rusty Ride Sizzle", "rds", br_cl("ride_sizzle_19", "rd"), 0.6, ["sizzle", "big-rusty"])
    for n, lab in ((14, "14in"), (15, "15in"), (18, "18in"), (22, "22in")):
        add("big-rusty-drums", "acoustic-tom", f"Rusty Tom {lab}", f"t{n}", tom_mics(n), 0.6, [lab, "big-rusty"])
    # ---- Unruly Drums
    for stem, lab in (("kick_clean", "Clean"), ("kick_dirty", "Dirty"), ("kick_dirtiest", "Dirtiest")):
        for q in ((0.4, 0.9) if lab == "Clean" else (0.6,)):
            add("unruly-drums", "acoustic-kick", f"Unruly Kick {lab}", stem, [M("k20/in/rr1", 1.0), M("k20/out/rr1", 0.6), M("k20/oh/rr1", 0.4)], q, [lab.lower(), "unruly"])
    for k in (13, 14, 22):
        for q in ((0.3, 0.7, 0.95) if k == 14 else (0.4, 0.85)):
            add("unruly-drums", "acoustic-snare", f"Unruly Snare {k}in", f"s{k}_center", un_sn(k, "center"), q, [f"{k}in", "center", "unruly"])
        add("unruly-drums", "acoustic-snare", f"Unruly Snare {k}in Edge", f"s{k}_edge", un_sn(k, "edge"), 0.7, [f"{k}in", "edge", "unruly"])
        add("unruly-drums", "acoustic-sidestick", f"Unruly Sidestick {k}in", f"s{k}_sstick", un_sn(k, "sstick"), 0.6, [f"{k}in", "sidestick", "unruly"])
    for k in (13, 14):
        add("unruly-drums", "acoustic-rimshot", f"Unruly Rimshot {k}in", f"s{k}_rimshot", un_sn(k, "rimshot"), 0.7, [f"{k}in", "rimshot", "unruly"])
    hh = lambda: [M("h14/cl/rr1", 1.0), M("h14/ohl/rr1", 0.4), M("h14/ohr/rr1", 0.4)]
    for art in ("closed_tip", "closed_shank", "tight_tip", "tight_shank"):
        add("unruly-drums", "acoustic-hat", f"Unruly Hat {art.replace('_', ' ').title()}", f"hh_{art}", hh(), 0.5, [art.replace("_", "-"), "unruly"])
    for art in ("open_tip", "open_shank", "half_tip", "quarter_tip", "loose_tip"):
        add("unruly-drums", "acoustic-open-hat", f"Unruly Hat {art.replace('_', ' ').title()}", f"hh_{art}", hh(), 0.5, [art.replace("_", "-"), "unruly"])
    for stem in ("cr_bow", "cr_edge"):
        add("unruly-drums", "acoustic-crash", f"Unruly Crash {stem[3:].title()}", stem, un_cl("c16"), 0.7, [stem[3:], "unruly"])
    for stem, q in (("ride_bow", 0.4), ("ride_bow", 0.8), ("ride_bell", 0.7)):
        add("unruly-drums", "acoustic-ride", f"Unruly Ride {stem[5:].title()}", stem, un_cl("r20"), q, [stem[5:], "unruly"])
    for stem in ("woodblock_hi", "woodblock_lo"):
        add("unruly-drums", "acoustic-woodblock-perc", f"Unruly {stem.replace('_', ' ').title()}", stem, un_cl("wb"), 0.7, ["unruly"])
    # ---- Swirly Drums (single-file dirs; suffix variants are mics)
    S = lambda d, g=1.0, suf=None: M(d, g, suf)
    for q in (0.5, 0.9):
        add("swirly-drums", "acoustic-kick", "Swirly Cajon Kick", "cajon_kick", [S("cajon_kick", 1.0, "_front"), S("cajon_kick", 0.6, "_rear")], q, ["cajon", "swirly"])
    for q in (0.5, 0.9):
        add("swirly-drums", "acoustic-kick", "Swirly Marching Kick", "marching_kick", [S("marching_kick", 1.0, "_beater"), S("marching_kick", 0.6, "_reso")], q, ["marching", "swirly"])
    add("swirly-drums", "acoustic-kick", "Swirly Buzz Kick", "buzz_kick_with_snare_buzz", [S("kick_buzz")], 0.6, ["buzz", "swirly"])
    for q in (0.3, 0.7):
        add("swirly-drums", "acoustic-snare", "Swirly Snare", "snare_hit", [S("snare_main")], q, ["center", "swirly"])
    add("swirly-drums", "acoustic-snare", "Swirly Snare Edge", "snare_edge", [S("snare_edge")], 0.7, ["edge", "swirly"])
    for d, stem, lab, cat in (
        ("hat_closed", "hh_closed", "Closed", "acoustic-hat"), ("hat_tight", "hh_tight", "Tight", "acoustic-hat"),
        ("hat_open", "hh_open", "Open", "acoustic-open-hat"), ("hat_half", "hh_half", "Half Open", "acoustic-open-hat"),
        ("hat_quarter", "hh_quarter", "Quarter Open", "acoustic-open-hat"), ("hat_sizzling", "hh_sizzling", "Sizzle", "acoustic-open-hat"),
    ):
        qs = (0.3, 0.8) if lab in ("Closed", "Open") else (0.6,)
        for q in qs:
            add("swirly-drums", cat, f"Swirly Hat {lab}", stem, [S(d)], q, [lab.lower().replace(" ", "-"), "swirly"])
    add("swirly-drums", "acoustic-cowbell-perc", "Swirly Cowbell", "cowbell", [S("cowbell")], 0.6, ["swirly"])
    add("swirly-drums", "acoustic-crash", "Swirly Crash", "crash", [S("crash")], 0.7, ["swirly"])
    add("swirly-drums", "acoustic-crash", "Swirly Splash", "splash", [S("splash")], 0.7, ["splash", "swirly"])
    add("swirly-drums", "acoustic-china", "Swirly China", "china", [S("china")], 0.7, ["swirly"])
    for q in (0.4, 0.8):
        add("swirly-drums", "acoustic-ride", "Swirly Ride", "ride", [S("ride")], q, ["swirly"])
    for d, lab in (("djembe", "Djembe"), ("darbouka", "Darbouka"), ("hbongo", "High Bongo"), ("lbongo", "Low Bongo")):
        for q in ((0.4, 0.85) if d in ("djembe", "darbouka") else (0.6,)):
            add("swirly-drums", "world-hand-perc", f"Swirly {lab}", d, [S(d)], q, [lab.lower().replace(" ", "-"), "swirly"])
    for d, lab in (("tom_floor", "Floor"), ("tom_xmed", "Mid"), ("tom_mlow", "Mid Low"), ("tom_vhi", "Very High")):
        add("swirly-drums", "acoustic-tom", f"Swirly Tom {lab}", d, [S(d)], 0.6, [lab.lower().replace(" ", "-"), "swirly"])
    # ---- Frankensnare (mics are directories)
    for k, lab in (("10_basic", "10in"), ("12_basic", "12in"), ("13b_basic", "13in Brass"), ("14a_basic", "14in Aluminium"),
                   ("14d_basic", "14in Dark"), ("14p_basic", "14in Piccolo"), ("14s_basic", "14in Steel"),
                   ("16_basic", "16in"), ("20_basic", "20in"), ("22_basic", "22in")):
        add("frankensnare", "acoustic-snare", f"Frankensnare {lab}", "sn", fs_sn(k), 0.6, [lab.lower().replace(" ", "-"), "frankensnare"])
    for q in (0.3, 0.9):
        add("frankensnare", "acoustic-snare", "Frankensnare 14in Aluminium", "sn", fs_sn("14a_basic"), q, ["14in", "frankensnare"])
    add("frankensnare", "acoustic-sidestick", "Frankensnare 14in Sidestick", "ss", fs_sn("14a_basic"), 0.6, ["sidestick", "frankensnare"])
    add("frankensnare", "acoustic-rimshot", "Frankensnare 14in Rimshot", "sr", fs_sn("14a_rimshot"), 0.7, ["rimshot", "frankensnare"])
    add("frankensnare", "acoustic-rimshot", "Frankensnare 13in Rimshot", "sn", fs_sn("13b_rimshot"), 0.7, ["rimshot", "frankensnare"])
    for q in (0.4, 0.8):
        add("frankensnare", "acoustic-tambourine-perc", "Frankensnare Tambourine", "tamb", [M("xtra_tamb", 1.0)], q, ["frankensnare"])
    return P


def http(url, binary=True):
    h = dict(UA)
    tok = os.environ.get("GITHUB_TOKEN")  # optional: only raises the API rate limit; never required
    if tok and url.startswith("https://api.github.com/"):
        h["Authorization"] = f"Bearer {tok}"
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        d = r.read()
    return d if binary else d.decode()


def fetch_cached(url, cache: Path):
    p = cache / re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("githubusercontent.com/")[-1])
    if p.exists():
        return p.read_bytes()
    d = http(url)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(d)
    return d


def check_license(repo):
    kit, name, lic_file = KITS[repo]
    text = http(f"https://raw.githubusercontent.com/{ORG}/{name}/main/{lic_file}", binary=False)
    api = json.loads(http(f"https://api.github.com/repos/{ORG}/{name}"))
    spdx = (api.get("license") or {}).get("spdx_id")
    ok = "CC0 1.0 Universal" in text and "waives, abandons, and surrenders" in text and spdx == "CC0-1.0"
    return ok, spdx


def load_tree(repo, cache):
    kit, name, _ = KITS[repo]
    p = cache / f"tree_{name}.json"
    if not p.exists():
        d = http(f"https://api.github.com/repos/{ORG}/{name}/git/trees/main?recursive=1")
        p.write_bytes(d)
    j = json.loads(p.read_text())
    if j.get("truncated"):
        raise SystemExit(f"tree truncated for {repo}")
    return {t["path"]: t["size"] for t in j["tree"] if t["type"] == "blob"}


def resolve(tree, mics, stem, q):
    """Pick basename by velocity quantile, rr1 (or lowest available), present in every mic."""
    d0, _, suf0 = mics[0]
    base = f"Samples/{d0}/"
    cands = []
    for p in tree:
        if not p.startswith(base) or "/" in p[len(base):]:
            continue
        m = FNAME.match(p[len(base):])
        if m and m["stem"] == stem and (suf0 is None or m["suf"] == suf0):
            cands.append((int(m["v"]), int(m["r"]), m))
    if not cands:
        return None
    vels = sorted({c[0] for c in cands})
    target = vels[min(len(vels) - 1, int(round(q * (len(vels) - 1))))]
    for v in [target] + [x for x in vels if x != target]:
        for r in sorted({c[1] for c in cands if c[0] == v}):
            m = next(c[2] for c in cands if c[0] == v and c[1] == r)
            paths = []
            for d, g, suf in mics:
                name = m.string
                if suf is not None:
                    name = name.replace(m["suf"] or "", suf) if m["suf"] else name
                pth = f"Samples/{d}/{name}"
                if pth not in tree:
                    break
                paths.append((pth, g))
            else:
                return v, r, paths
    return None


def vel_label(q):
    return "soft" if q < 0.4 else ("medium" if q < 0.75 else "hard")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="/workspace/cache/sfz")
    ap.add_argument("--only", default=None)
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    lic_ok, trees = {}, {}
    for repo in KITS:
        ok, spdx = check_license(repo)
        lic_ok[repo] = ok
        print(f"license {repo}: {'CC0 OK' if ok else 'REJECT'} (api spdx={spdx})")
        if ok:
            trees[repo] = load_tree(repo, cache)
    recs, skipped, seen = [], [], set()
    jobs = []
    for repo, cat, title, stem, mics, q, tags in plan():
        if not lic_ok.get(repo):
            skipped.append((title, "license check failed"))
            continue
        r = resolve(trees[repo], mics, stem, q)
        if not r:
            skipped.append((title, f"no file for stem={stem} in {mics[0][0]}"))
            continue
        jobs.append((repo, cat, title, tags, q, r))
    urls = {}
    for repo, *_, (v, rr, paths) in jobs:
        for p, g in paths:
            urls[(repo, p)] = f"https://raw.githubusercontent.com/{ORG}/{KITS[repo][1]}/main/{urllib.parse.quote(p)}"
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda kv: fetch_cached(kv[1], cache), urls.items()))
    for repo, cat, title, tags, q, (v, rr, paths) in jobs:
        kit, name, _ = KITS[repo]
        mix = None
        for p, g in paths:
            data, sr = sf.read(BytesIO(fetch_cached(urls[(repo, p)], cache)), always_2d=False)
            x = resample(to_mono(data), sr) * g
            if mix is None:
                mix = x
            else:
                n = max(len(mix), len(x))
                mix = np.pad(mix, (0, n - len(mix))) + np.pad(x, (0, n - len(x)))
        long_ = cat in ("acoustic-crash", "acoustic-ride", "acoustic-china")
        if cat == "acoustic-hat":
            y = finish(mix, max_s=0.8, thresh_db=-45.0)
        else:
            y = finish(mix, max_s=3.5 if long_ else 1.8, thresh_db=-50.0 if cat == "acoustic-open-hat" else -60.0)
        vl = vel_label(q)
        ttl = f"{title} {vl.title()}"
        sid = f"kar-{slug(title)}-{vl}-vl{v}"
        if sid in seen:
            skipped.append((ttl, "duplicate id"))
            continue
        seen.add(sid)
        rel = f"audio/karoryfer/{sid}.flac"
        info = write_flac(y, LIB / rel)
        recs.append(make_record(
            sid=sid, title=ttl, category=cat, source=f"karoryfer/{kit}", license="CC0-1.0", license_url=CC0,
            author=AUTHOR, source_url=f"https://github.com/{ORG}/{name}", provenance="source-metadata",
            file=rel, audio_info=info, extra_tags=["acoustic", vl, *tags],
            origin_path=paths[0][0],
            processing=f"{len(paths)}-mic mix, mono, trimmed, faded, peak-normalised to -1 dBFS, FLAC 16-bit 44.1 kHz",
            notes=f"{kit}, velocity layer {v}, round-robin {rr}. Genre assignment follows the category (acoustic kits suit organic genres).",
        ))
    save_records("karoryfer", recs)
    for t, why in skipped:
        print("SKIPPED", t, "-", why)
    print(f"{len(recs)} ingested, {len(skipped)} skipped")


if __name__ == "__main__":
    main()
