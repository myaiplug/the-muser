import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLicense } from '../src/licenses.mjs'
import { validateSound, validateAll } from '../src/validate.mjs'
import { resolveGenre, CATEGORIES, GENRES, TYPES } from '../taxonomy/taxonomy.mjs'

const good = () => ({
  id: 'rusty-kick-hard',
  title: 'Rusty Kick Hard',
  type: 'kick',
  category: 'acoustic-kick',
  tags: ['kick', 'acoustic'],
  license: 'CC0-1.0',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  author: 'Karoryfer Samples',
  source_url: 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums',
  attribution_text: '"Rusty Kick Hard" by Karoryfer Samples (CC0 1.0).',
  provenance: 'source-metadata',
  file: 'audio/karoryfer/rusty-kick-hard.flac',
  sha256: 'a'.repeat(64),
  duration_ms: 900,
  bytes: 1234,
})

test('normalizeLicense accepts the allowlist', () => {
  assert.equal(normalizeLicense('CC0-1.0'), 'CC0-1.0')
  assert.equal(normalizeLicense('http://creativecommons.org/publicdomain/zero/1.0/'), 'CC0-1.0')
  assert.equal(normalizeLicense('https://creativecommons.org/publicdomain/zero/1.0/legalcode'), 'CC0-1.0')
  assert.equal(normalizeLicense('http://creativecommons.org/licenses/by/3.0/'), 'CC-BY-3.0')
  assert.equal(normalizeLicense('https://creativecommons.org/licenses/by/3.0/us/'), 'CC-BY-3.0')
  assert.equal(normalizeLicense('https://creativecommons.org/licenses/by/4.0/'), 'CC-BY-4.0')
})

test('normalizeLicense rejects everything else', () => {
  for (const bad of [
    'https://creativecommons.org/licenses/by-nc/4.0/',
    'https://creativecommons.org/licenses/by-nc/3.0/',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'https://creativecommons.org/licenses/by-nd/4.0/',
    'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    'http://creativecommons.org/licenses/sampling+/1.0/',
    'https://creativecommons.org/licenses/by/2.0/',
    'https://www.gnu.org/licenses/gpl-3.0.html',
    'GPL-3.0', 'free for personal use', 'royalty-free', 'Unknown', '', null, undefined, 42,
    'https://evil.example/creativecommons.org/publicdomain/zero/1.0/',
    'https://creativecommons.org/publicdomain/zero/1.0/../by-nc/4.0/',
  ]) assert.equal(normalizeLicense(bad), null, String(bad))
})

test('good record validates', () => {
  const v = validateSound(good())
  assert.deepEqual(v.errors, [])
  assert.equal(v.ok, true)
})

test('missing or unknown license is rejected', () => {
  for (const patch of [
    { license: '' }, { license: 'Unknown' }, { license_url: '' }, { license: undefined, license_url: undefined },
    { license: 'CC-BY-NC-4.0', license_url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    { license: 'CC-BY-SA-4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  ]) {
    const v = validateSound({ ...good(), ...patch })
    assert.equal(v.ok, false, JSON.stringify(patch))
  }
})

test('license and license_url must agree', () => {
  const v = validateSound({ ...good(), license: 'CC-BY-4.0' })
  assert.equal(v.ok, false)
  assert.match(v.errors.join(' '), /disagree/)
})

test('CC-BY requires attribution naming author, license link and source', () => {
  const by = { ...good(), license: 'CC-BY-4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/' }
  assert.equal(validateSound({ ...by, attribution_text: 'thanks' }).ok, false)
  const full = '"Rusty Kick Hard" by Karoryfer Samples, https://github.com/sfzinstruments/karoryfer.big-rusty-drums, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).'
  assert.equal(validateSound({ ...by, attribution_text: full }).ok, true)
})

test('structural checks', () => {
  assert.equal(validateSound({ ...good(), type: 'snare' }).ok, false, 'type/category mismatch')
  assert.equal(validateSound({ ...good(), category: 'nope' }).ok, false)
  assert.equal(validateSound({ ...good(), source_url: 'http://x.example' }).ok, false)
  assert.equal(validateSound({ ...good(), author: '' }).ok, false)
  assert.equal(validateSound({ ...good(), duration_ms: 60000 }).ok, false, 'not a one-shot')
  assert.equal(validateSound({ ...good(), sha256: 'x' }).ok, false)
  assert.equal(validateSound({ ...good(), file: '../etc/passwd' }).ok, false)
  assert.equal(validateSound({ ...good(), tags: ['Kick'] }).ok, false)
  assert.equal(validateSound({ ...good(), provenance: 'trust-me' }).ok, false)
  assert.equal(validateSound(null).ok, false)
})

test('validateAll catches duplicate ids and audio', () => {
  const a = good()
  const b = { ...good(), id: 'other-kick' }
  const r = validateAll([a, a, b])
  assert.equal(r.ok, false)
  assert.ok(r.bad.some((x) => /duplicate id/.test(x.errors.join())))
  assert.ok(r.bad.some((x) => /duplicate audio/.test(x.errors.join())))
})

test('taxonomy: ids unique, 24 genres, every category valid', () => {
  assert.equal(GENRES.length, 24)
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, CATEGORIES.length)
  const gids = new Set(GENRES.map((g) => g.id))
  for (const c of CATEGORIES) {
    assert.ok(TYPES.includes(c.type), c.id)
    assert.ok(c.genres.length > 0, c.id)
    for (const g of c.genres) assert.ok(gids.has(g), `${c.id}: ${g}`)
  }
  for (const g of GENRES) {
    const types = new Set(CATEGORIES.filter((c) => c.genres.includes(g.id)).map((c) => c.type))
    for (const need of ['kick', 'snare', 'hat']) {
      if (g.id === 'cinematic' && need === 'hat') continue
      assert.ok(types.has(need), `${g.id} lacks ${need}`)
    }
  }
})

test('resolveGenre handles aliases', () => {
  assert.equal(resolveGenre('modern-house'), 'house')
  assert.equal(resolveGenre('Deep Techno'), 'techno')
  assert.equal(resolveGenre('trap'), 'trap')
  assert.equal(resolveGenre('nonsense'), null)
  assert.equal(resolveGenre(''), null)
})
