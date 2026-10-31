/**
 * Web Audio engine: multi-stem playback with a live per-channel FX chain that
 * mirrors the server-side render (src/audio/effects.py):
 *   source -> EQ 100Hz / 1kHz / 8kHz (peaking) -> compressor -> dry + reverb send
 *          -> pan -> fader -> mute/solo -> meter -> stem bus -> master
 */
import type { StemParams } from '../types'

export const dbToGain = (db: number) => (db <= -59.9 ? 0 : Math.pow(10, db / 20))

type Channel = {
  id: string
  buffer: AudioBuffer
  input: GainNode
  eq: BiquadFilterNode[]
  comp: DynamicsCompressorNode
  dry: GainNode
  send: GainNode
  conv: ConvolverNode
  pan: StereoPannerNode
  fader: GainNode
  mute: GainNode
  analyser: AnalyserNode
  room: number
  source?: AudioBufferSourceNode
}

type Listener = () => void

class StudioAudio {
  ctx: AudioContext | null = null
  master!: GainNode
  limiter!: DynamicsCompressorNode
  masterAnalyser!: AnalyserNode
  stemBus!: GainNode
  instBus!: GainNode
  private channels = new Map<string, Channel>()
  private bufferCache = new Map<string, Promise<AudioBuffer>>()
  private irCache = new Map<number, AudioBuffer>()
  private startedAt = 0
  private offset = 0
  playing = false
  loop = true
  duration = 0
  private listeners = new Set<Listener>()

  ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      this.ctx = ctx
      this.master = ctx.createGain()
      this.limiter = ctx.createDynamicsCompressor()
      this.limiter.threshold.value = -1
      this.limiter.knee.value = 0
      this.limiter.ratio.value = 20
      this.limiter.attack.value = 0.002
      this.limiter.release.value = 0.1
      this.masterAnalyser = ctx.createAnalyser()
      this.masterAnalyser.fftSize = 1024
      this.stemBus = ctx.createGain()
      this.instBus = ctx.createGain()
      this.stemBus.connect(this.master)
      this.instBus.connect(this.master)
      this.master.connect(this.limiter)
      this.limiter.connect(this.masterAnalyser)
      this.masterAnalyser.connect(ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((l) => l())
  }

  async decode(url: string): Promise<AudioBuffer> {
    const ctx = this.ensure()
    if (!this.bufferCache.has(url)) {
      this.bufferCache.set(
        url,
        fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`Failed to load ${url}`)
            return r.arrayBuffer()
          })
          .then((ab) => ctx.decodeAudioData(ab)),
      )
    }
    return this.bufferCache.get(url)!
  }

  private impulse(room: number): AudioBuffer {
    const q = Math.round(room * 10) / 10
    const hit = this.irCache.get(q)
    if (hit) return hit
    const ctx = this.ensure()
    const len = Math.floor(ctx.sampleRate * (0.6 + q * 3.2))
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < len; i++) {
        const t = i / len
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2 + (1 - q) * 3)
      }
    }
    this.irCache.set(q, ir)
    return ir
  }

  /** Replace the loaded channel set. */
  async load(list: { id: string; url: string }[], opts: { keepPosition?: boolean } = {}): Promise<void> {
    const ctx = this.ensure()
    const wasPlaying = this.playing
    const keep = opts.keepPosition ? this.currentTime() : 0
    this.stop()
    this.channels.forEach((c) => c.analyser.disconnect())
    this.channels.clear()
    const buffers = await Promise.all(list.map((s) => this.decode(s.url)))
    list.forEach((s, i) => {
      const input = ctx.createGain()
      const eq = [100, 1000, 8000].map((f, k) => {
        const b = ctx.createBiquadFilter()
        b.type = 'peaking'
        b.frequency.value = f
        b.Q.value = k === 1 ? 1.0 : 0.7
        b.gain.value = 0
        return b
      })
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = 0
      comp.ratio.value = 1
      comp.knee.value = 4
      comp.attack.value = 0.01
      comp.release.value = 0.2
      const dry = ctx.createGain()
      const send = ctx.createGain()
      send.gain.value = 0
      const conv = ctx.createConvolver()
      conv.buffer = this.impulse(0.5)
      const pan = ctx.createStereoPanner()
      const fader = ctx.createGain()
      const mute = ctx.createGain()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      input.connect(eq[0])
      eq[0].connect(eq[1])
      eq[1].connect(eq[2])
      eq[2].connect(comp)
      comp.connect(dry)
      comp.connect(send)
      send.connect(conv)
      dry.connect(pan)
      conv.connect(pan)
      pan.connect(fader)
      fader.connect(mute)
      mute.connect(analyser)
      analyser.connect(this.stemBus)
      this.channels.set(s.id, {
        id: s.id, buffer: buffers[i], input, eq, comp, dry, send, conv, pan, fader, mute, analyser, room: 0.5,
      })
    })
    this.duration = Math.max(0, ...buffers.map((b) => b.duration))
    this.offset = Math.min(keep, Math.max(0, this.duration - 0.05))
    if (wasPlaying) this.play()
    this.emit()
  }

  buffer(id: string) {
    return this.channels.get(id)?.buffer
  }
  analyser(id: string) {
    return this.channels.get(id)?.analyser
  }

  applyParams(id: string, p: StemParams, anySolo: boolean) {
    const c = this.channels.get(id)
    if (!c || !this.ctx) return
    const t = this.ctx.currentTime
    const ramp = (param: AudioParam, v: number) => param.setTargetAtTime(v, t, 0.015)
    ramp(c.eq[0].gain, p.eq_low_db)
    ramp(c.eq[1].gain, p.eq_mid_db)
    ramp(c.eq[2].gain, p.eq_high_db)
    if (p.comp > 0.01) {
      c.comp.threshold.value = -6 - 30 * p.comp
      c.comp.ratio.value = 1.5 + 6.5 * p.comp
    } else {
      c.comp.threshold.value = 0
      c.comp.ratio.value = 1
    }
    ramp(c.dry.gain, 1 - p.reverb * 0.3)
    ramp(c.send.gain, p.reverb * 0.9)
    if (Math.abs(c.room - p.room) > 0.05) {
      c.room = p.room
      c.conv.buffer = this.impulse(p.room)
    }
    ramp(c.pan.pan, p.pan)
    ramp(c.fader.gain, dbToGain(p.gain_db))
    const audible = !p.mute && (!anySolo || p.solo)
    ramp(c.mute.gain, audible ? 1 : 0)
  }

  setMasterGain(db: number) {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02)
  }

  currentTime(): number {
    if (!this.ctx || !this.playing) return this.offset
    const t = this.ctx.currentTime - this.startedAt
    if (this.loop && this.duration > 0) return t % this.duration
    return Math.min(t, this.duration)
  }

  play() {
    const ctx = this.ensure()
    if (this.playing || !this.channels.size) return
    const when = ctx.currentTime + 0.03
    const off = this.offset >= this.duration ? 0 : this.offset
    this.channels.forEach((c) => {
      const src = ctx.createBufferSource()
      src.buffer = c.buffer
      src.loop = this.loop
      if (this.loop) {
        src.loopStart = 0
        src.loopEnd = this.duration
      }
      src.connect(c.input)
      src.start(when, off % c.buffer.duration)
      c.source = src
    })
    this.startedAt = when - off
    this.playing = true
    const longest = [...this.channels.values()][0]?.source
    if (longest && !this.loop) {
      longest.onended = () => {
        if (this.playing && this.currentTime() >= this.duration - 0.05) {
          this.playing = false
          this.offset = 0
          this.emit()
        }
      }
    }
    this.emit()
  }

  pause() {
    if (!this.playing) return
    this.offset = this.currentTime()
    this.killSources()
    this.playing = false
    this.emit()
  }

  stop() {
    this.killSources()
    this.playing = false
    this.offset = 0
    this.emit()
  }

  seek(t: number) {
    const was = this.playing
    this.killSources()
    this.playing = false
    this.offset = Math.max(0, Math.min(t, this.duration))
    if (was) this.play()
    else this.emit()
  }

  setLoop(on: boolean) {
    const t = this.currentTime()
    this.loop = on
    if (this.playing) {
      this.killSources()
      this.playing = false
      this.offset = t
      this.play()
    }
    this.emit()
  }

  private killSources() {
    this.channels.forEach((c) => {
      if (c.source) {
        c.source.onended = null
        try {
          c.source.stop()
        } catch {
          /* already stopped */
        }
        c.source.disconnect()
        c.source = undefined
      }
    })
  }
}

export const audio = new StudioAudio()

/** RMS level 0..1 from an analyser. */
export function level(an: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  an.getFloatTimeDomainData(buf)
  let peak = 0
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
  return peak
}
