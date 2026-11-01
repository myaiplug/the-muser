import json, subprocess, sys, unittest, os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
import freesound  # noqa: E402
from licenses_bridge import normalize_license  # noqa: E402

LIB = Path(__file__).resolve().parent.parent


def snd(**kw):
    d = dict(id=1, name="kick.wav", username="someone", license="http://creativecommons.org/publicdomain/zero/1.0/",
             url="https://freesound.org/people/someone/sounds/1/", duration=0.5, tags=["Kick"],
             previews={"preview-hq-ogg": "https://cdn.freesound.org/previews/1/1-hq.ogg"})
    d.update(kw)
    return d


class Freesound(unittest.TestCase):
    def test_cc0_accepted(self):
        m, why = freesound.to_record_meta(snd(), "acoustic-kick")
        self.assertIsNone(why)
        self.assertEqual(m["license"], "CC0-1.0")
        self.assertEqual(m["sid"], "fs-1")

    def test_by_accepted_with_author(self):
        m, _ = freesound.to_record_meta(snd(license="http://creativecommons.org/licenses/by/3.0/"), "acoustic-kick")
        self.assertEqual(m["license"], "CC-BY-3.0")
        self.assertEqual(m["author"], "someone")

    def test_rejections(self):
        for lic in ("http://creativecommons.org/licenses/by-nc/3.0/", "http://creativecommons.org/licenses/sampling+/1.0/",
                    "https://creativecommons.org/licenses/by-nc/4.0/", "", None):
            m, why = freesound.to_record_meta(snd(license=lic), "acoustic-kick")
            self.assertIsNone(m, lic)
            self.assertTrue(why)
        self.assertIsNone(freesound.to_record_meta(snd(username=""), "acoustic-kick")[0])
        self.assertIsNone(freesound.to_record_meta(snd(duration=30), "acoustic-kick")[0])
        self.assertIsNone(freesound.to_record_meta(snd(previews={}), "acoustic-kick")[0])

    def test_search_uses_licence_filter_and_mock(self):
        seen = {}

        def fake(url):
            seen["url"] = url
            return {"results": [snd()]}
        res = freesound.search("kick", "KEY", fetch=fake)
        self.assertEqual(len(res), 1)
        self.assertIn("license", seen["url"])
        self.assertIn("Creative+Commons+0", seen["url"])

    def test_no_key_skips_cleanly(self):
        env = {k: v for k, v in os.environ.items() if k != "FREESOUND_API_KEY"}
        r = subprocess.run([sys.executable, str(LIB / "ingest" / "freesound.py")], env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        self.assertIn("skipping", r.stdout)


class Bridge(unittest.TestCase):
    def test_parity_with_js_allowlist(self):
        cases = ["CC0-1.0", "http://creativecommons.org/publicdomain/zero/1.0/", "https://creativecommons.org/licenses/by/4.0/",
                 "https://creativecommons.org/licenses/by/3.0/us/", "https://creativecommons.org/licenses/by-nc/4.0/",
                 "https://creativecommons.org/licenses/by-sa/4.0/", "GPL-3.0", "", "https://creativecommons.org/licenses/by/2.0/",
                 "http://creativecommons.org/licenses/sampling+/1.0/"]
        js = "import {normalizeLicense as n} from './src/licenses.mjs';console.log(JSON.stringify(%s.map(n)))" % json.dumps(cases)
        out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=LIB, capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), [normalize_license(c) for c in cases])


if __name__ == "__main__":
    unittest.main()
