import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/server.mjs'
import { JsonRepo, parseParams, QueryError } from '../src/repo.mjs'
import { loadSoundsJson } from '../src/db.mjs'
import { validateAll } from '../src/validate.mjs'

const recs = loadSoundsJson()

async function withServer(repo, fn) {
  const server = createApp(repo).listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  try { await fn(base) } finally { await new Promise((r) => server.close(r)) }
}
const get = async (base, p) => { const r = await fetch(base + p); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers } }

test('shipped sounds.json is fully valid and meets the target', () => {
  const v = validateAll(recs)
  assert.deepEqual(v.bad, [])
  assert.ok(recs.length >= 150, `only ${recs.length}`)
  for (const t of ['kick', 'snare', 'clap', 'hat', 'open-hat', 'perc', '808', 'cymbal']) assert.ok(recs.some((r) => r.type === t), `no ${t}`)
  assert.ok(recs.every((r) => ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'].includes(r.license)))
})

test('parseParams validation', () => {
  assert.throws(() => parseParams({ genre: 'nope' }), QueryError)
  assert.throws(() => parseParams({ limit: '0' }), QueryError)
  assert.throws(() => parseParams({ limit: '9999' }), QueryError)
  assert.throws(() => parseParams({ offset: '-1' }), QueryError)
  assert.deepEqual(parseParams({ tag: 'Kick, Punchy', genre: 'modern house' }).tags, ['kick', 'punchy'])
  assert.equal(parseParams({ genre: 'modern-house' }).genre, 'house')
})

test('/api/sounds?tag=kick&genre=modern-house works (JsonRepo)', async () => {
  await withServer(new JsonRepo(recs), async (b) => {
    const r = await get(b, '/api/sounds?tag=kick&genre=modern-house&limit=500')
    assert.equal(r.status, 200)
    assert.ok(r.body.total > 0)
    for (const s of r.body.items) { assert.equal(s.type, 'kick'); assert.ok(s.genres.includes('house')) }
    const none = await get(b, '/api/sounds?tag=kick&q=zzzznotathing')
    assert.equal(none.body.total, 0)
  })
})

test('paging, type filter, 400, 404, facets, taxonomy', async () => {
  await withServer(new JsonRepo(recs), async (b) => {
    const p1 = (await get(b, '/api/sounds?type=snare&limit=5&offset=0')).body
    const p2 = (await get(b, '/api/sounds?type=snare&limit=5&offset=5')).body
    assert.equal(p1.items.length, 5)
    assert.notEqual(p1.items[0].id, p2.items[0].id)
    assert.equal((await get(b, '/api/sounds?genre=bogus')).status, 400)
    assert.equal((await get(b, '/api/sounds/does-not-exist')).status, 404)
    const one = await get(b, `/api/sounds/${recs[0].id}`)
    assert.equal(one.body.id, recs[0].id)
    const f = (await get(b, '/api/facets')).body
    assert.equal(Object.values(f.type).reduce((a, c) => a + c, 0), recs.length)
    assert.equal((await get(b, '/api/taxonomy')).body.genres.length, 24)
  })
})

test('audio files are served with audio content type; missing file is 404', async () => {
  await withServer(new JsonRepo(recs), async (b) => {
    const r = await get(b, '/' + recs[0].file)
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /audio|flac|octet/)
    assert.equal((await get(b, '/audio/nope/nope.flac')).status, 404)
    assert.equal((await get(b, '/sounds.json')).status, 200)
  })
})
