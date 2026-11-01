import { ALLOWED, normalizeLicense, rejectionReason } from './licenses.mjs'
import { CATEGORY_BY_ID, TYPES } from '../taxonomy/taxonomy.mjs'

export const PROVENANCE = ['source-metadata', 'uploader-asserted', 'first-party']
const ID_RE = /^[a-z0-9][a-z0-9-]{2,95}$/
const FILE_RE = /^audio\/[a-z0-9._-]+\/[a-z0-9._-]+\.(flac|wav|ogg|mp3)$/
const SHA_RE = /^[0-9a-f]{64}$/

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
const isHttps = (v) => {
  try { return new URL(v).protocol === 'https:' } catch { return false }
}

/**
 * Validate one sound record. Returns { ok, errors }.
 * Rule of thumb: when in doubt, reject.
 */
export function validateSound(rec, { checkFileFields = true } = {}) {
  const errors = []
  const err = (m) => errors.push(m)
  if (!rec || typeof rec !== 'object') return { ok: false, errors: ['record is not an object'] }

  if (!ID_RE.test(rec.id ?? '')) err('id must be a lowercase slug (3-96 chars)')
  if (!nonEmpty(rec.title)) err('title required')
  if (!TYPES.includes(rec.type)) err(`type must be one of ${TYPES.join(', ')}`)
  const cat = CATEGORY_BY_ID[rec.category]
  if (!cat) err(`unknown category: ${rec.category}`)
  else if (cat.type !== rec.type) err(`category ${rec.category} has type ${cat.type}, record says ${rec.type}`)
  if (!Array.isArray(rec.tags) || rec.tags.length === 0 || rec.tags.some((t) => typeof t !== 'string' || t !== t.toLowerCase() || !t.trim())) {
    err('tags must be a non-empty array of lowercase strings')
  }

  // License: id and URL must both be present, both allowlisted, and agree.
  const byId = normalizeLicense(rec.license)
  const byUrl = normalizeLicense(rec.license_url)
  if (!nonEmpty(rec.license)) err('license required')
  else if (!byId) err(`license rejected: ${rejectionReason(rec.license)}`)
  if (!nonEmpty(rec.license_url)) err('license_url required')
  else if (!byUrl) err(`license_url rejected: ${rejectionReason(rec.license_url)}`)
  if (byId && byUrl && byId !== byUrl) err(`license (${byId}) and license_url (${byUrl}) disagree`)
  if (rec.license_url && !isHttps(rec.license_url) && !/^http:\/\/creativecommons\.org\//i.test(rec.license_url)) {
    err('license_url must be http(s)')
  }

  if (!nonEmpty(rec.author)) err('author required')
  if (!isHttps(rec.source_url)) err('source_url must be an https URL')
  if (!PROVENANCE.includes(rec.provenance)) err(`provenance must be one of ${PROVENANCE.join(', ')}`)

  // Attribution: always stored; mandatory content check for CC-BY.
  if (!nonEmpty(rec.attribution_text)) err('attribution_text required')
  else if (byId && ALLOWED[byId].requiresAttribution) {
    const a = rec.attribution_text
    if (!a.includes(rec.author)) err('attribution_text must name the author')
    if (!a.includes(ALLOWED[byId].canonicalUrl) && !a.includes(rec.license_url)) err('attribution_text must link the license')
    if (!a.includes(rec.source_url)) err('attribution_text must link the source')
  }

  if (checkFileFields) {
    if (!FILE_RE.test(rec.file ?? '')) err('file must be audio/<source>/<name>.<flac|wav|ogg|mp3>')
    if (!SHA_RE.test(rec.sha256 ?? '')) err('sha256 required (64 hex chars)')
    if (!(rec.duration_ms > 0 && rec.duration_ms <= 6000)) err('duration_ms must be in (0, 6000]: one-shots only')
    if (!(rec.bytes > 0)) err('bytes required')
  }
  return { ok: errors.length === 0, errors }
}

/** Validate a list; also checks duplicate ids and duplicate audio hashes. */
export function validateAll(records, opts) {
  const results = []
  const ids = new Map()
  const hashes = new Map()
  for (const r of records) {
    const v = validateSound(r, opts)
    if (r?.id) {
      if (ids.has(r.id)) v.errors.push(`duplicate id (also in ${ids.get(r.id)})`)
      ids.set(r.id, r.id)
    }
    if (r?.sha256 && opts?.checkFileFields !== false) {
      if (hashes.has(r.sha256)) v.errors.push(`duplicate audio (same sha256 as ${hashes.get(r.sha256)})`)
      hashes.set(r.sha256, r.id)
    }
    v.ok = v.errors.length === 0
    results.push({ id: r?.id, ...v })
  }
  return { ok: results.every((x) => x.ok), results, bad: results.filter((x) => !x.ok) }
}
