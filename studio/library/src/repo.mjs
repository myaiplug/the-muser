import { resolveGenre, GENRE_IDS } from '../taxonomy/taxonomy.mjs'

export class QueryError extends Error {}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Normalise and validate raw query-string params. Throws QueryError on bad input. */
export function parseParams(raw = {}) {
  const p = {}
  const one = (v) => (Array.isArray(v) ? v[0] : v)
  if (raw.tag) p.tags = String(one(raw.tag)).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (raw.genre) {
    const g = resolveGenre(one(raw.genre))
    if (!g) throw new QueryError(`unknown genre: ${one(raw.genre)}. Known: ${GENRE_IDS.join(', ')}`)
    p.genre = g
  }
  for (const k of ['type', 'category', 'license', 'q']) if (raw[k]) p[k] = String(one(raw[k])).trim().toLowerCase()
  const lim = raw.limit === undefined ? 50 : Number(one(raw.limit))
  const off = raw.offset === undefined ? 0 : Number(one(raw.offset))
  if (!Number.isInteger(lim) || lim < 1 || lim > 500) throw new QueryError('limit must be an integer 1-500')
  if (!Number.isInteger(off) || off < 0) throw new QueryError('offset must be an integer >= 0')
  p.limit = lim
  p.offset = off
  return p
}

function matchTag(r, t) {
  return r.tags.includes(t) || r.type === t || r.category === t
}

/** In-memory repo: used for tests, the static demo and local dev with no database. */
export class JsonRepo {
  constructor(records) {
    this.records = records
  }
  async find(params) {
    const p = params
    let out = this.records.filter((r) => {
      if (p.tags && !p.tags.every((t) => matchTag(r, t))) return false
      if (p.genre && !r.genres.includes(p.genre)) return false
      if (p.type && r.type !== p.type) return false
      if (p.category && r.category !== p.category) return false
      if (p.license && r.license.toLowerCase() !== p.license) return false
      if (p.q) {
        const hay = `${r.title} ${r.tags.join(' ')} ${r.category}`.toLowerCase()
        if (!hay.includes(p.q)) return false
      }
      return true
    })
    const total = out.length
    out = out.slice(p.offset, p.offset + p.limit)
    return { total, items: out }
  }
  async get(id) {
    return this.records.find((r) => r.id === id) ?? null
  }
  async facets() {
    const count = (f) => {
      const m = {}
      for (const r of this.records) for (const v of [].concat(f(r))) m[v] = (m[v] ?? 0) + 1
      return m
    }
    return { type: count((r) => r.type), category: count((r) => r.category), genre: count((r) => r.genres), license: count((r) => r.license) }
  }
}

/** Mongo-backed repo with identical semantics. */
export class MongoRepo {
  constructor(model) {
    this.model = model
  }
  filter(p) {
    const and = []
    for (const t of p.tags ?? []) and.push({ $or: [{ tags: t }, { type: t }, { category: t }] })
    if (p.genre) and.push({ genres: p.genre })
    if (p.type) and.push({ type: p.type })
    if (p.category) and.push({ category: p.category })
    if (p.license) and.push({ license: new RegExp(`^${esc(p.license)}$`, 'i') })
    if (p.q) {
      const re = new RegExp(esc(p.q), 'i')
      and.push({ $or: [{ title: re }, { tags: re }, { category: re }] })
    }
    return and.length ? { $and: and } : {}
  }
  async find(p) {
    const f = this.filter(p)
    const [total, items] = await Promise.all([
      this.model.countDocuments(f),
      this.model.find(f, { _id: 0 }).sort({ id: 1 }).skip(p.offset).limit(p.limit).lean(),
    ])
    return { total, items }
  }
  async get(id) {
    return this.model.findOne({ id }, { _id: 0 }).lean()
  }
  async facets() {
    const agg = async (field) => {
      const rows = await this.model.aggregate([{ $unwind: `$${field}` }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])
      return Object.fromEntries(rows.map((r) => [r._id, r.n]))
    }
    return { type: await agg('type'), category: await agg('category'), genre: await agg('genres'), license: await agg('license') }
  }
}
