// Seed a Mongo database (local mongod or Atlas M0) from sounds.json. Metadata only.
import mongoose from 'mongoose'
import { getModel } from '../src/schema.mjs'
import { loadSoundsJson, seed } from '../src/db.mjs'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Set MONGODB_URI (e.g. mongodb://127.0.0.1:27017/nodaw_sounds)'); process.exit(1) }
const conn = await mongoose.createConnection(uri).asPromise()
const n = await seed(getModel(conn), loadSoundsJson())
console.log(`seeded: ${n} sounds`)
await conn.close()
