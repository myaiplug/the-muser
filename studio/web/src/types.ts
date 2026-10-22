export type CapabilityItem = {
  key: string
  label: string
  available: boolean
  detail: string
  hint: string
}

export type Status = {
  mode: 'demo' | 'hybrid' | 'full'
  mode_detail: string
  demo_forced: boolean
  items: Record<string, CapabilityItem>
  ollama_models: string[]
  llm_models: string[]
  tool_count: number
}

export type StemInfo = { id: string; name: string; path: string; url: string; color: string }

export type Track = {
  id: string
  title: string
  source: 'demo-synth' | 'acestep' | 'upload' | 'agent' | 'mixdown'
  url: string
  created: number
  prompt: string
  bpm: number | null
  key: string
  duration_s: number
  stems: StemInfo[]
  stem_method: string
  notes: string
  parent_id: string
}

export type Job<T = unknown> = {
  job_id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'error'
  message: string
  result: T | null
  error: string
}

export type StemParams = {
  gain_db: number
  pan: number
  mute: boolean
  solo: boolean
  eq_low_db: number
  eq_mid_db: number
  eq_high_db: number
  comp: number
  reverb: number
  room: number
}

export const DEFAULT_STEM: StemParams = {
  gain_db: 0,
  pan: 0,
  mute: false,
  solo: false,
  eq_low_db: 0,
  eq_mid_db: 0,
  eq_high_db: 0,
  comp: 0,
  reverb: 0,
  room: 0.5,
}

export type SynthParams = {
  wave: OscillatorType
  cutoff: number // 0..1
  reso: number // 0..1
  attack: number // seconds
  release: number // seconds
  detune: number // cents
  volume: number // 0..1
  octave: number // -2..2
}

export type PadParams = { volume: number; pitch: number; tone: number }

export type Project = {
  mixer: Record<string, StemParams> // key: stem id (or "<trackId>:mix")
  master: { gain_db: number; normalize: boolean }
  synth: SynthParams
  pads: PadParams
  pattern: boolean[][] // 16 pads x 16 steps
  bpm: number
}

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; status: 'running' | 'success' | 'error'; detail?: string }
  | { kind: 'track'; track: Track }
  | { kind: 'error'; text: string }
