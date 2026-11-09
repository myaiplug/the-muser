/** CC0 one-shots for the offline demo renderer. Never imports or unlocks StudioAudio. */
import type { LibSound } from '../audio/library'
import type { Profile } from './genres'
import { SR, fnv } from './voices'

export type RenderSample = { sound: LibSound; mono: Float32Array; root?: number }
export type SampleKit = Map<string, RenderSample>
const base = `${import.meta.env?.BASE_URL ?? '/'}library/`.replace(/\/\/+/g, '/')
const decoded = new Map<string, Promise<Float32Array>>()
const TYPES: Record<string, string> = { kick: 'kick', snare: 'snare', clap: 'clap', hat: 'hat', ohat: 'open-hat', ride: 'cymbal', crash: 'cymbal', tom: 'tom', shaker: 'perc', conga: 'perc', rim: 'perc', snap: 'clap', brush: 'snare' }
export function sampleRoot(s: LibSound): number | undefined {
  const m = s.tags.join(' ').match(/\b([a-g])([#b]?)([0-8])\b/i)
  if (!m) return undefined
  return (Number(m[3]) + 1) * 12 + ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] ?? 0) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
/** Genre first, recorded kits preferred within a style, seed breaks equally suitable ties. */
export function pickSample(list: LibSound[], voice: string, p: Profile, seed: number): LibSound | undefined {
  const name = voice.split(':')[0], type = name === '808' ? '808' : TYPES[name]
  if (!type) return undefined // keep a cowbell a cowbell, never replace it with a random tambourine
  const scored = list.filter(s => s.type === type && s.license === 'CC0-1.0' && (type !== '808' || sampleRoot(s) !== undefined)).map(s => {
    const text = `${s.title} ${s.tags.join(' ')}`.toLowerCase()
    let score = (s.genres.includes(p.id) ? 12 : 0) + (/recorded/.test(text) || /karoryfer/i.test(s.author) ? 5 : 0) - (/synthetic/.test(text) ? 1 : 0)
    if (['shaker', 'conga', 'rim', 'brush', 'snap', 'crash', 'ride'].includes(name)) score += text.includes(name) ? 18 : -18
    if (type === 'kick' && s.duration_ms > 900) score -= 5
    if (p.id === 'lo-fi-chill') score += /soft|medium|damped/.test(text) ? 3 : 0
    if (type === '808') {
      score += text.includes(p.id === 'phonk' ? 'distorted' : 'sub') ? 5 : 0
      score -= Math.abs((sampleRoot(s)! % 12) - p.root) * 0.1
      if (/slide/.test(text)) score -= 8 // transpose a stable note; renderer supplies its own glide
    }
    return { s, score, tie: fnv(`${seed}|${voice}|${s.id}`) }
  }).sort((a, b) => b.score - a.score || a.tie - b.tie)
  return scored[0]?.s
}
export async function decodeRenderSample(bytes: ArrayBuffer): Promise<Float32Array> {
  // decodeAudioData works without startRendering or a live AudioContext, including iOS.
  const ctx = new OfflineAudioContext(1, 1, SR)
  const b = await ctx.decodeAudioData(bytes)
  const n = Math.round(b.length * SR / b.sampleRate), mono = new Float32Array(n)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c)
    for (let i = 0; i < n; i++) { const at = i * b.sampleRate / SR, k = Math.floor(at), f = at - k; mono[i] += ((x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f) / b.numberOfChannels }
  }
  let peak = 0
  for (const x of mono) peak = Math.max(peak, Math.abs(x))
  if (!peak || !Number.isFinite(peak)) throw new Error('Empty sample')
  for (let i = 0; i < n; i++) mono[i] *= 0.8 / peak
  return mono
}
async function get(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Sample fetch ${r.status}`)
  return r
}
export async function loadRenderKit(p: Profile, seed: number): Promise<SampleKit> {
  const kit: SampleKit = new Map()
  if (typeof OfflineAudioContext === 'undefined') return kit
  try {
    const { sounds } = await (await get(base + 'catalog.json')).json() as { sounds: LibSound[] }
    const voices = [...new Set([...p.drums.lanes.map(l => l.voice), 'tom:lo', 'tom:mid', 'tom:hi', 'crash', ...(p.bass?.kind === 'sub808' ? ['808'] : [])])]
    await Promise.all(voices.map(async voice => {
      const sound = pickSample(sounds, voice, p, seed)
      if (!sound) return
      try {
        if (!decoded.has(sound.file)) {
          if (decoded.size >= 48) decoded.delete(decoded.keys().next().value!)
          decoded.set(sound.file, get(base + sound.file).then(r => r.arrayBuffer()).then(decodeRenderSample).catch(e => { decoded.delete(sound.file); throw e }))
        }
        kit.set(voice, { sound, mono: await decoded.get(sound.file)!, root: sampleRoot(sound) })
      } catch { /* only this voice falls back to DSP */ }
    }))
  } catch { /* offline or unavailable catalog: use the procedural kit */ }
  return kit
}
/** Tuned, gated 808 with optional glide and a click-free release. No live audio nodes. */
export function sampleBass(s: RenderSample, pitch: number, gate: number, vel: number, from?: number, tau = 0.07): Float32Array {
  const n = gate + Math.round(SR * 0.08), out = new Float32Array(n), root = s.root ?? pitch
  let pos = 0
  for (let i = 0; i < n; i++) {
    const note = pitch + ((from ?? pitch) - pitch) * Math.exp(-i / (SR * tau))
    const k = Math.floor(pos), frac = pos - k
    if (k >= s.mono.length - 1) break
    out[i] = (s.mono[k] * (1 - frac) + s.mono[k + 1] * frac) * vel * Math.min(1, i / (0.003 * SR)) * Math.min(1, (n - i) / (0.08 * SR))
    pos += 2 ** ((note - root) / 12)
  }
  return out
}
