// Runs the same API contract against Mongoose via mongodb-memory-server.
// Skipped (not failed) if the mongod binary cannot be downloaded (offline machines).
import test from 'node:test'
import assert from 'node:assert/strict'
import { openRepo, loadSoundsJson } from '../src/db.mjs'
import { JsonRepo, parseParams } from '../src/repo.mjs'

let handle
try {
  handle = await openRepo({ backend: 'memory' })
} catch (e) {
  console.log('mongodb-memory-server unavailable, skipping:', e.message.split('\n')[0])
}

test('MongoRepo returns the same results as JsonRepo', { skip: !handle && 'no mongod available' }, async () => {
  const recs = loadSoundsJson()
  const js = new JsonRepo(recs)
  for (const q of [{ tag: 'kick', genre: 'modern-house', limit: '500' }, { type: 'snare', limit: '500' }, { q: 'tom', limit: '500' }, { tag: 'hat,acoustic', limit: '500' }, { genre: 'lofi', type: 'perc', limit: '500' }]) {
    const p = parseParams(q)
    const a = await js.find(p)
    const b = await handle.repo.find(p)
    assert.equal(b.total, a.total, JSON.stringify(q))
    assert.deepEqual(b.items.map((x) => x.id), a.items.map((x) => x.id))
  }
  assert.equal((await handle.repo.get(recs[3].id)).id, recs[3].id)
  const f = await handle.repo.facets()
  assert.equal(Object.values(f.type).reduce((a, c) => a + c, 0), recs.length)
})

test('cleanup', async () => { if (handle) await handle.close() })
