/** npm run test:demo. Optional FFmpeg exercises bundled FLACs; DEMO_WAV_DIR saves auditions. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
const root = new URL('../', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('public/library/catalog.json', root), 'utf8')).sounds
let decodes = 0, fetches = 0, ffmpeg = false
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = true } catch {}
// Codec fixture adapter. Only the offline decode contract exists, never a live AudioContext.
class OfflineDecoder {
  constructor(ch, len, sr) { assert.deepEqual([ch, len, sr], [1, 1, 44100]); decodes++ }
  async decodeAudioData(bytes) {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '44100', 'pipe:1'], { input: Buffer.from(bytes), maxBuffer: 8e6 })
    const floats = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength))
    return { length: floats.length, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => floats }
  }
}
async function load({ samples = false, failed = false } = {}) {
  const context = vm.createContext({ console, Math, setTimeout, Blob, Float32Array, Map, AbortSignal, ...(samples ? { OfflineAudioContext: OfflineDecoder } : {}), fetch: async url => {
    fetches++
    if (failed) throw new Error('fixture network failure')
    const bytes = await readFile(new URL(`public${url}`, root))
    return { ok: true, json: async () => JSON.parse(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  } })
  const cache = new Map()
  async function mod(name) {
    if (cache.has(name)) return cache.get(name)
    const source = await readFile(new URL(`src/demo/${name}.ts`, root), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    const m = new vm.SourceTextModule(code, { context, initializeImportMeta(meta) { meta.env = { BASE_URL: '/' } } })
    cache.set(name, m)
    await m.link(spec => { assert.ok(spec.startsWith('./'), `must not import shared engine: ${spec}`); return mod(spec.slice(2)) })
    return m
  }
  for (const name of ['dsp', 'voices', 'genres', 'samples', 'synth']) { const m = await mod(name); await m.evaluate() }
  return Object.fromEntries([...cache].map(([k, m]) => [k, m.namespace]))
}
const plain = await load()
const genres = ['trap', 'house', 'lo-fi-chill', 'hip-hop', 'uk-drill', 'phonk', 'techno', 'edm-anthem']

test('hooks repeat A pitches in bar 2, stay sparse and land on chord tones across 192 seeds', () => {
  for (const genre of genres) for (let seed = 0; seed < 24; seed++) {
    const s = plain.synth.parsePrompt(`modern ${seed}`, null, null, 16, genre)
    const phrase = plain.synth.composeHook(s)
    assert.equal(JSON.stringify(phrase[0].map(n => n.step)), JSON.stringify(phrase[2].map(n => n.step)))
    const pitches = phrase[0].map(n => n.pitch)
    assert.ok(phrase[2].some(n => pitches.includes(n.pitch)), `${genre}: actual A pitches must recur`)
    for (let b = 0; b < 4; b++) {
      const sc = plain.genres.MODES[s.mode], deg = s.progression[b % s.progression.length]
      const pcs = [0, 2, 4, 6].map(k => (s.keyRoot + sc[(deg + k) % 7]) % 12)
      assert.ok(phrase[b].length >= 2 && phrase[b].length <= 4)
      for (const n of phrase[b]) if (n.step % 4 === 0) assert.ok(pcs.includes(n.pitch % 12), `${genre}: beat must land on chord`)
      if (['trap', 'uk-drill', 'lo-fi-chill'].includes(genre)) {
        assert.ok(phrase[b].length <= 3)
        assert.ok(phrase[b].reduce((sum, n) => sum + n.steps, 0) <= 12, 'leave silence')
      }
    }
    assert.notEqual(s.profile.lead.voice, 'bell')
  }
})
test('picker deterministic, CC0-only, recorded kits preferred; 808 roots known and files present', () => {
  const p = plain.genres.PROFILE_BY_ID['hip-hop']
  const a = plain.samples.pickSample(catalog, 'kick:boom', p, 77)
  assert.equal(a.id, plain.samples.pickSample(catalog, 'kick:boom', p, 77).id)
  assert.match(a.author, /Karoryfer/)
  assert.equal(a.license, 'CC0-1.0')
  assert.equal(plain.samples.pickSample([{ ...a, license: 'CC-BY-NC' }], 'kick', p, 1), undefined)
  assert.equal(plain.samples.sampleRoot(catalog.find(s => s.id === 'nodaw-808-sub-c1')), 24)
  for (const s of catalog) assert.ok(existsSync(new URL(`public/library/${s.file}`, root)))
})
test('trap, house, lo-fi and hip-hop render 4 audible stems and a mastered mix with samples', async () => {
  const renderer = await load({ samples: ffmpeg })
  let first
  for (const genre of genres.slice(0, 4)) {
    const s = renderer.synth.parsePrompt(`modern ${genre} hook`, null, null, 12, genre)
    const out = await renderer.synth.renderSpec(s)
    assert.deepEqual(Object.keys(out.stems), ['drums', 'bass', 'chords', 'lead'])
    for (const a of [...Object.values(out.stems), out.mix]) {
      assert.ok(renderer.dsp.peak(a) > 0.005)
      assert.ok(renderer.dsp.peak(a) < 1)
      for (const ch of a.ch) assert.ok(ch.every(Number.isFinite))
    }
    assert.ok(renderer.dsp.truePeakDb(out.mix) <= -0.99)
    if (ffmpeg) {
      assert.ok(Object.keys(out.samples).some(v => v.startsWith('kick')))
      assert.ok(out.samples[s.profile.drums.lanes.find(l => l.role === 'hat').voice])
      if (genre === 'trap') assert.ok(out.samples['808'])
    }
    console.log(genre, JSON.stringify({ ...renderer.dsp.analyze(out.mix), leadNotes: out.notes.filter(n => n.stem === 'lead').length, samples: out.samples }))
    if (process.env.DEMO_WAV_DIR) {
      await mkdir(process.env.DEMO_WAV_DIR, { recursive: true })
      for (const [name, audio] of Object.entries({ mix: out.mix, lead: out.stems.lead })) await writeFile(`${process.env.DEMO_WAV_DIR}/${genre}-${name}.wav`, Buffer.from(await renderer.dsp.encodeWav(audio).arrayBuffer()))
    }
    if (genre === 'trap') first = out
  }
  const again = await renderer.synth.renderSpec(first.spec)
  assert.deepEqual(again.samples, first.samples)
  assert.deepEqual(again.mix.ch[0], first.mix.ch[0])
  if (ffmpeg) { assert.ok(decodes > 0); assert.ok(fetches > 0) }
})
test('missing catalog or decoder falls back without opening live audio', async () => {
  const offline = await load({ samples: true, failed: true }), n = decodes
  const out = await offline.synth.renderSpec(offline.synth.parsePrompt('fallback trap', null, null, 8, 'trap'))
  assert.equal(Object.keys(out.samples).length, 0)
  assert.ok(offline.dsp.peak(out.mix) > 0.05)
  assert.equal(decodes, n)
})
