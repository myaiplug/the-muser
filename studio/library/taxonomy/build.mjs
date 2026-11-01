import { writeFileSync } from 'node:fs'
import { buildTaxonomy } from './taxonomy.mjs'
const out = new URL('./taxonomy.json', import.meta.url)
writeFileSync(out, JSON.stringify(buildTaxonomy(), null, 2) + '\n')
console.log('wrote', out.pathname)
