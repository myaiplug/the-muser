// Validate sounds.json (and the files it points at). Exit 1 on any problem.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { LIB_DIR, loadSoundsJson } from '../src/db.mjs'
import { validateAll } from '../src/validate.mjs'

const recs = loadSoundsJson()
const v = validateAll(recs)
const problems = v.bad.map((b) => `${b.id}: ${b.errors.join('; ')}`)
for (const r of recs) {
  const p = path.join(LIB_DIR, r.file)
  if (!fs.existsSync(p)) problems.push(`${r.id}: file missing`)
  else if (crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== r.sha256) problems.push(`${r.id}: hash mismatch`)
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log(`validated ${recs.length} sounds: all licences on allowlist, attribution present, files match hashes`)
