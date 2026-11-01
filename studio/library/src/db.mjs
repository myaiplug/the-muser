import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { getModel } from './schema.mjs'
import { JsonRepo, MongoRepo } from './repo.mjs'

export const LIB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadSoundsJson(file = path.join(LIB_DIR, 'sounds.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).sounds
}

/**
 * Backends:
 *   json   (default) in-memory over sounds.json, no database needed
 *   memory mongodb-memory-server (dev; downloads a mongod binary on first use)
 *   mongo  MONGODB_URI (local mongod or Atlas M0), seeded from sounds.json if empty
 */
export async function openRepo({ backend = process.env.SOUNDS_BACKEND || 'json', uri = process.env.MONGODB_URI, records } = {}) {
  const recs = records ?? loadSoundsJson()
  if (backend === 'json') return { repo: new JsonRepo(recs), close: async () => {}, backend }
  let mem
  if (backend === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    mem = await MongoMemoryServer.create()
    uri = mem.getUri('nodaw_sounds')
  } else if (!uri) throw new Error('backend "mongo" needs MONGODB_URI')
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000 }).asPromise()
  const model = getModel(conn)
  await model.init()
  await seed(model, recs)
  return {
    repo: new MongoRepo(model),
    backend,
    close: async () => {
      await conn.close()
      if (mem) await mem.stop()
    },
  }
}

/** Upsert by id (idempotent). Leaves unrelated docs alone; removes ones no longer in the index. */
export async function seed(model, records) {
  const ids = records.map((r) => r.id)
  await model.deleteMany({ id: { $nin: ids } })
  if (records.length) await model.bulkWrite(records.map((r) => ({ replaceOne: { filter: { id: r.id }, replacement: r, upsert: true } })))
  return model.countDocuments()
}
