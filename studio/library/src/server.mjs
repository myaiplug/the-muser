import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { buildTaxonomy } from '../taxonomy/taxonomy.mjs'
import { LIB_DIR, openRepo } from './db.mjs'
import { parseParams, QueryError } from './repo.mjs'

/**
 * GET /api/sounds?tag=kick&genre=modern-house&type=&category=&q=&license=&limit=&offset=
 * GET /api/sounds/:id   GET /api/taxonomy   GET /api/facets   GET /api/health
 * Static: /audio/* (audio files), /preview (HTML player), /sounds.json
 */
export function createApp(repo, { libDir = LIB_DIR } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    next()
  })
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next)

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.get('/api/taxonomy', (req, res) => res.json(buildTaxonomy()))
  app.get('/api/facets', wrap(async (req, res) => res.json(await repo.facets())))
  app.get('/api/sounds', wrap(async (req, res) => {
    const p = parseParams(req.query)
    const { total, items } = await repo.find(p)
    res.json({ total, limit: p.limit, offset: p.offset, items })
  }))
  app.get('/api/sounds/:id', wrap(async (req, res) => {
    const s = await repo.get(req.params.id)
    if (!s) return res.status(404).json({ error: 'not found' })
    res.json(s)
  }))

  app.use('/audio', express.static(path.join(libDir, 'audio'), { immutable: true, maxAge: '7d', fallthrough: false }))
  app.use('/preview', express.static(path.join(libDir, 'preview')))
  app.get('/sounds.json', (req, res) => res.sendFile(path.join(libDir, 'sounds.json')))
  app.get('/', (req, res) => res.redirect('/preview/'))

  app.use((err, req, res, next) => {
    if (err instanceof QueryError) return res.status(400).json({ error: err.message })
    if (err.status === 404) return res.status(404).json({ error: 'not found' })
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  })
  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { repo, backend } = await openRepo()
  const port = Number(process.env.PORT || 4177)
  createApp(repo).listen(port, () => console.log(`sound library API (${backend}) on http://localhost:${port}  preview: /preview/`))
}
