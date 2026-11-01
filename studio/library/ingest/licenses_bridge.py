"""Python port of src/licenses.mjs normalizeLicense. test_licenses_bridge keeps both in sync."""
import re

CC = "creativecommons.org"
_P = {
    "CC0-1.0": [rf"^https?://{CC}/publicdomain/zero/1\.0(/legalcode)?/?$"],
    "CC-BY-4.0": [rf"^https?://{CC}/licenses/by/4\.0(/legalcode)?/?$"],
    "CC-BY-3.0": [rf"^https?://{CC}/licenses/by/3\.0(/[a-z]{{2}})?(/legalcode)?/?$"],
}


def normalize_license(s):
    if not isinstance(s, str):
        return None
    s = s.strip()
    if s in _P:
        return s
    for k, pats in _P.items():
        if any(re.match(p, s, re.I) for p in pats):
            return k
    return None
