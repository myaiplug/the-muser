// Port of studio/server/demo_synth.py. A small procedural synthesizer: drums, bass,
// chords and lead as separate stems. This is NOT AI generation and the UI says so.
import { type Audio, silence, biquad, scale, peak, sum } from './dsp'

export const SR = 44100
const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11 }
type Genre = [number, number, string, number[], number]
const GENRES: Record<string, Genre> = {
  lofi: [80, 0.18, 'boombap', [0, 5, 3, 4], 0.35],
  'lo-fi': [80, 0.18, 'boombap', [0, 5, 3, 4], 0.35],
  'hip hop': [90, 0.12, 'boombap', [0, 3, 5, 4], 0.45],
  trap: [140, 0.0, 'trap', [0, 0, 5, 6], 0.5],
  house: [124, 0.0, 'four', [0, 5, 3, 6], 0.6],
  techno: [128, 0.0, 'four', [0, 0, 0, 6], 0.7],
  edm: [126, 0.0, 'four', [0, 5, 2, 6], 0.75],
  synthwave: [100, 0.0, 'four', [0, 5, 3, 6], 0.65],
  ambient: [70, 0.0, 'none', [0, 5, 3, 4], 0.25],
  cinematic: [75, 0.0, 'none', [0, 5, 2, 6], 0.4],
  jazz: [96, 0.22, 'boombap', [1, 4, 0, 5], 0.4],
  rock: [118, 0.0, 'rock', [0, 5, 3, 6], 0.7],
  pop: [110, 0.0, 'rock', [0, 4, 5, 3], 0.6],
  drill: [142, 0.0, 'trap', [0, 1, 5, 4], 0.5],
}

export type Spec = {
  prompt: string; bpm: number; keyRoot: number; minor: boolean; genre: string; swing: number
  drumStyle: string; progression: number[]; brightness: number; bars: number; seed: number
}
export const keyName = (s: Spec) => `${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][s.keyRoot]} ${s.minor ? 'minor' : 'major'}`

function fnv(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
function rngFor(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    random: next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo)),
    normal: () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next()),
  }
}
type Rng = ReturnType<typeof rngFor>

export function parsePrompt(prompt: string, bpm?: number | null, key?: string | null, durationS?: number | null): Spec {
  const text = prompt.toLowerCase()
  const s: Spec = { prompt, bpm: 96, keyRoot: 9, minor: true, genre: 'lofi', swing: 0.1, drumStyle: 'boombap', progression: [0, 5, 3, 4], brightness: 0.5, bars: 8, seed: fnv(prompt) }
  for (const [name, [gb, sw, dr, prog, br]] of Object.entries(GENRES)) {
    if (text.includes(name)) { s.genre = name; s.bpm = gb; s.swing = sw; s.drumStyle = dr; s.progression = [...prog]; s.brightness = br; break }
  }
  const m = text.match(/(\d{2,3})\s*bpm/)
  if (m) s.bpm = parseInt(m[1])
  if (bpm) s.bpm = Math.round(bpm)
  s.bpm = Math.max(50, Math.min(180, s.bpm))
  const km = key ? key.match(/^\s*([A-Ga-g])([#b]?)\s*(major|minor|maj|min|m)?/) : prompt.match(/\bin\s+([A-G])([#b]?)\s*(major|minor|maj|min|m)?\b/)
  if (km) {
    const root = (km[1] + km[2]).toUpperCase()
    if (root in NOTE_INDEX) s.keyRoot = NOTE_INDEX[root]
    const q = (km[3] || '').toLowerCase()
    if (q === 'major' || q === 'maj') s.minor = false
    else if (q === 'minor' || q === 'min' || q === 'm') s.minor = true
  } else if (['happy', 'bright', 'uplifting', 'sunny'].some((w) => text.includes(w))) s.minor = false
  if (text.includes('dark') || text.includes('sad')) s.brightness = Math.max(0.2, s.brightness - 0.15)
  const target = durationS || 16
  const barS = (4 * 60) / s.bpm
  s.bars = Math.round(Math.max(4, Math.min(32, Math.round(target / barS / 4) * 4 || 4)))
  return s
}

// -- primitives
const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
function envelope(n: number, a: number, d: number, s: number, r: number): Float32Array {
  const an = Math.max(Math.floor(a * SR), 1), dn = Math.max(Math.floor(d * SR), 1), rn = Math.max(Math.floor(r * SR), 1)
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (i < an) e[i] = i / an
    else if (i < an + dn) e[i] = 1 + (s - 1) * ((i - an) / dn)
    else if (i < n - rn) e[i] = s
    else e[i] = s * Math.max(0, (n - i) / rn)
  }
  return e
}
function onepoleLP(x: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR), y = new Float32Array(x.length)
  let z = 0
  for (let i = 0; i < x.length; i++) { z = (1 - a) * x[i] + a * z; y[i] = z }
  return y
}
function add(buf: Float32Array, sig: Float32Array, start: number, g = 1) {
  if (start >= buf.length) return
  const end = Math.min(buf.length, start + sig.length)
  for (let i = start; i < end; i++) buf[i] += sig[i - start] * g
}
function kick(): Float32Array {
  const n = Math.floor(0.45 * SR), o = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 28))) / SR
    o[i] = Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 7.5))
  }
  return o
}
function snare(r: Rng): Float32Array {
  const n = Math.floor(0.25 * SR)
  const noise = new Float32Array(n)
  for (let i = 0; i < n; i++) noise[i] = r.normal()
  const lp = onepoleLP(noise, 1500), o = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    o[i] = 0.55 * ((noise[i] - lp[i]) * Math.exp(-t * 18) + 0.8 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30))
  }
  return o
}
function hat(r: Rng, open = false): Float32Array {
  const n = Math.floor((open ? 0.25 : 0.06) * SR)
  const noise = new Float32Array(n)
  for (let i = 0; i < n; i++) noise[i] = r.normal()
  const lp = onepoleLP(noise, 7000), o = new Float32Array(n)
  for (let i = 0; i < n; i++) o[i] = 0.22 * (noise[i] - lp[i]) * Math.exp((-i / SR) * (open ? 12 : 70))
  return o
}
const scaleOf = (minor: boolean) => (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11])
function chordOf(rootDeg: number, s: Spec): number[] {
  const sc = scaleOf(s.minor), base = 48 + s.keyRoot
  return [0, 2, 4, 6].map((step) => { const d = rootDeg + step; return base + sc[d % 7] + 12 * Math.floor(d / 7) })
}

export type NoteEvent = { stem: string; pitch: number; start: number; dur: number; vel: number }
type Stem = { mono: Float32Array; notes: NoteEvent[] }

function drums(s: Spec, total: number, r: Rng): Stem {
  const buf = new Float32Array(total)
  if (s.drumStyle === 'none') {
    const step = 60 / s.bpm / 2, h = hat(r)
    for (let i = 0; i < Math.floor(total / SR / step); i++) add(buf, h, Math.floor(i * step * SR), 0.35)
    return { mono: buf, notes: [] }
  }
  const sx = 60 / s.bpm / 4, k = kick(), sn = snare(r), notes: NoteEvent[] = []
  const ev = (pitch: number, t: number, vel = 100) => notes.push({ stem: 'drums', pitch, start: t, dur: 0.1, vel })
  const hats = [hat(r), hat(r), hat(r), hat(r)], open = [hat(r, true), hat(r, true)]
  for (let st = 0; st < s.bars * 16; st++) {
    const pos = st % 16
    let t = st * sx
    if (pos % 2 === 1) t += s.swing * sx
    const i = Math.floor(t * SR), odd = Math.floor(st / 16) % 2 === 1
    const K = () => { add(buf, k, i); ev(36, t) }
    const S = (g = 1) => { add(buf, sn, i, g); ev(38, t) }
    const H = (g = 1) => { add(buf, hats[st % 4], i, g); ev(42, t, 70) }
    if (s.drumStyle === 'four') {
      if (pos % 4 === 0) K()
      if (pos === 4 || pos === 12) S(0.8)
      if (pos % 4 === 2) { add(buf, open[st % 2], i); ev(46, t, 80) }
    } else if (s.drumStyle === 'trap') {
      if (pos === 0 || pos === 7 || pos === 10 || (pos === 14 && odd)) K()
      if (pos === 8) S()
      H(0.8)
      if ((pos === 13 || pos === 15) && odd) add(buf, hats[(st + 1) % 4], i + Math.floor((sx * SR) / 2), 0.6)
    } else if (s.drumStyle === 'rock') {
      if (pos === 0 || pos === 8 || pos === 10) K()
      if (pos === 4 || pos === 12) S()
      if (pos % 2 === 0) H()
    } else {
      if (pos === 0 || pos === 7 || pos === 10) K()
      if (pos === 4 || pos === 12) S()
      if (pos % 2 === 0) H(0.7 + 0.3 * r.random())
    }
  }
  return { mono: buf, notes }
}

function bass(s: Spec, total: number): Stem {
  const buf = new Float32Array(total), notes: NoteEvent[] = []
  const bar = (4 * 60) / s.bpm, eighth = bar / 8, none = s.drumStyle === 'none'
  const pattern: (number | null)[] = none ? [0, null, null, null, null, null, null, null] : [0, null, 0, null, 7, null, 0, 12]
  for (let b = 0; b < s.bars; b++) {
    const root = chordOf(s.progression[b % s.progression.length], s)[0] - 12
    pattern.forEach((iv, k) => {
      if (iv === null) return
      const dur = eighth * (none ? 8 : 0.9), n = Math.floor(dur * SR), f = midiHz(root + iv)
      const e = envelope(n, 0.005, 0.08, 0.7, 0.05), sig = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const t = i / SR
        sig[i] = Math.tanh(1.4 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t))) * e[i]
      }
      const start = b * bar + k * eighth
      add(buf, sig, Math.floor(start * SR), 0.5)
      notes.push({ stem: 'bass', pitch: root + iv, start, dur, vel: 100 })
    })
  }
  return { mono: buf, notes }
}

function chords(s: Spec, total: number): Stem {
  const buf = new Float32Array(total), notes: NoteEvent[] = []
  const bar = (4 * 60) / s.bpm
  for (let b = 0; b < s.bars; b++) {
    const cn = chordOf(s.progression[b % s.progression.length], s)
    const n = Math.floor(bar * SR), sig = new Float32Array(n)
    for (const note of cn) {
      const f = midiHz(note + 12)
      for (const det of [-0.08, 0.08]) {
        const ff = f * Math.pow(2, det / 12)
        for (let h = 1; h <= 6; h++) {
          const amp = (1 / h) * Math.pow(s.brightness, h / 3), w = 2 * Math.PI * ff * h / SR
          for (let i = 0; i < n; i++) sig[i] += Math.sin(w * i) * amp
        }
      }
      notes.push({ stem: 'chords', pitch: note + 12, start: b * bar, dur: bar, vel: 80 })
    }
    const e = envelope(n, 0.08, 0.3, 0.75, 0.25)
    for (let i = 0; i < n; i++) sig[i] *= e[i] * (1 + 0.05 * Math.sin(2 * Math.PI * 0.5 * (i / SR)))
    add(buf, sig, Math.floor(b * bar * SR), 0.06)
  }
  return { mono: onepoleLP(buf, 1200 + 4000 * s.brightness), notes }
}

function lead(s: Spec, total: number, r: Rng): Stem {
  const buf = new Float32Array(total), notes: NoteEvent[] = []
  const bar = (4 * 60) / s.bpm, eighth = bar / 8
  const pent = s.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9], base = 72 + s.keyRoot
  let motif = Array.from({ length: 8 }, () => r.int(0, pent.length * 2))
  const rhythm = Array.from({ length: 8 }, () => r.random() > 0.35)
  for (let b = 0; b < s.bars; b++) {
    if (b % 4 === 0 && b > 0) motif = motif.map((m) => (((m + r.int(-2, 3)) % (pent.length * 2)) + pent.length * 2) % (pent.length * 2))
    if (b % 2 === 1 && s.bars > 4 && b === s.bars - 1) continue
    for (let k = 0; k < 8; k++) {
      if (!rhythm[k]) continue
      const deg = motif[k], note = base + pent[deg % pent.length] + 12 * Math.floor(deg / pent.length) - 12
      const n = Math.floor(eighth * 0.95 * SR), f = midiHz(note), e = envelope(n, 0.01, 0.1, 0.6, 0.08), sig = new Float32Array(n)
      let ph = 0
      for (let i = 0; i < n; i++) {
        ph += (2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * (i / SR)))) / SR
        sig[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * e[i]
      }
      const start = b * bar + k * eighth
      add(buf, sig, Math.floor(start * SR), 0.18)
      notes.push({ stem: 'lead', pitch: note, start, dur: eighth * 0.95, vel: 90 })
    }
  }
  return { mono: buf, notes }
}

function stereo(mono: Float32Array, width = 0, pan = 0): Audio {
  const n = mono.length, out = silence(SR, n)
  const gl = Math.sqrt((1 - pan) / 2) * Math.SQRT2, gr = Math.sqrt((1 + pan) / 2) * Math.SQRT2
  const d = Math.floor(0.012 * SR * width)
  for (let i = 0; i < n; i++) { out.ch[0][i] = mono[i] * gl; out.ch[1][i] = i >= d ? mono[i - d] * gr : 0 }
  return out
}

export const STEM_NAMES = ['drums', 'bass', 'chords', 'lead'] as const
export type Rendered = { mix: Audio; stems: Record<string, Audio>; notes: NoteEvent[]; spec: Spec }
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export async function renderSpec(s: Spec, progress?: (p: number, msg: string) => void): Promise<Rendered> {
  const r = rngFor(s.seed), bar = (4 * 60) / s.bpm, total = Math.floor((s.bars * bar + 1) * SR)
  const parts: [string, () => Stem, number, number][] = [
    ['drums', () => drums(s, total, r), 0, 0],
    ['bass', () => bass(s, total), 0, 0],
    ['chords', () => chords(s, total), 0.8, 0],
    ['lead', () => lead(s, total, r), 0.3, 0.15],
  ]
  const stems: Record<string, Audio> = {}
  let notes: NoteEvent[] = []
  let i = 0
  for (const [name, fn, width, pan] of parts) {
    progress?.(0.1 + 0.2 * i++, `Synthesizing ${name} (demo synth)`)
    await tick()
    const st = fn()
    notes = notes.concat(st.notes)
    stems[name] = stereo(st.mono, width, pan)
  }
  const mix = sum(Object.values(stems))
  const g = 0.89 / (peak(mix) || 1)
  for (const a of [...Object.values(stems), mix]) scale(a, g)
  return { mix, stems, notes, spec: s }
}

/** Standard MIDI file (format 1, one track per stem). */
export function toMidi(notes: NoteEvent[], bpm: number): Uint8Array {
  const ppq = 480, tps = (ppq * bpm) / 60
  const vlq = (v: number) => { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o }
  const be = (v: number, n: number) => Array.from({ length: n }, (_, i) => (v >> (8 * (n - 1 - i))) & 0xff)
  const tracks: number[][] = []
  const mpq = Math.round(60000000 / bpm)
  tracks.push([0, 0xff, 0x51, 3, ...be(mpq, 3), 0, 0xff, 0x2f, 0])
  for (const stem of STEM_NAMES) {
    const ch = stem === 'drums' ? 9 : STEM_NAMES.indexOf(stem)
    const ev: [number, number[]][] = []
    for (const n of notes.filter((x) => x.stem === stem)) {
      ev.push([Math.round(n.start * tps), [0x90 | ch, n.pitch & 0x7f, n.vel & 0x7f]])
      ev.push([Math.round((n.start + n.dur) * tps), [0x80 | ch, n.pitch & 0x7f, 0]])
    }
    ev.sort((a, b) => a[0] - b[0])
    const name = Array.from(stem).map((c) => c.charCodeAt(0))
    const t: number[] = [0, 0xff, 0x03, name.length, ...name]
    let last = 0
    for (const [tick_, bytes] of ev) { t.push(...vlq(tick_ - last), ...bytes); last = tick_ }
    t.push(0, 0xff, 0x2f, 0)
    tracks.push(t)
  }
  const out: number[] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, ...be(tracks.length, 2), ...be(ppq, 2)]
  for (const t of tracks) out.push(0x4d, 0x54, 0x72, 0x6b, ...be(t.length, 4), ...t)
  return new Uint8Array(out)
}

/** Four-band crossover used for uploaded audio. A crossover, not source separation. */
export function bandSplit(a: Audio): Record<string, Audio> {
  const mk = (kind: 'lowpass' | 'highpass' | 'bandpass', f: number, q?: number) => {
    const c: Audio = { sr: a.sr, ch: [a.ch[0].slice(), a.ch[1].slice()] }
    biquad(c, kind, f, q ?? 0.7071); biquad(c, kind, f, q ?? 0.7071)
    return c
  }
  return {
    'low (sub/bass)': mk('lowpass', 160),
    'low-mid (body)': mk('bandpass', 440, 0.5),
    'high-mid (presence)': mk('bandpass', 2700, 0.6),
    'air (highs)': mk('highpass', 6000),
  }
}
