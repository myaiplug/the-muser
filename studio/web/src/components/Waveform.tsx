import { useEffect, useRef } from 'react'
import { audio } from '../audio/engine'

type Props = { buffer?: AudioBuffer; color: string; height?: number; dim?: boolean; onSeek?: (t: number) => void }

const peaksCache = new WeakMap<AudioBuffer, Float32Array>()

function peaks(buf: AudioBuffer, n = 1200): Float32Array {
  const hit = peaksCache.get(buf)
  if (hit) return hit
  const out = new Float32Array(n * 2)
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
  const per = Math.max(1, Math.floor(buf.length / n))
  for (let i = 0; i < n; i++) {
    let mn = 0
    let mx = 0
    const s0 = i * per
    for (let j = 0; j < per; j += 4) {
      for (const ch of chans) {
        const v = ch[s0 + j] ?? 0
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
    }
    out[i * 2] = mn
    out[i * 2 + 1] = mx
  }
  // normalize for display so quiet stems are still readable
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 1e-4) for (let i = 0; i < out.length; i++) out[i] /= peak
  peaksCache.set(buf, out)
  return out
}

export function Waveform({ buffer, color, height = 54, dim, onSeek }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const cv = canvas.current
      if (!cv) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr
        cv.height = h * dpr
      }
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      // grid
      g.strokeStyle = 'rgba(255,255,255,0.04)'
      g.lineWidth = 1
      for (let x = 0; x < w; x += w / 16) {
        g.beginPath()
        g.moveTo(Math.round(x) + 0.5, 0)
        g.lineTo(Math.round(x) + 0.5, h)
        g.stroke()
      }
      if (!buffer) {
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.font = '11px JetBrains Mono, monospace'
        g.fillText('loading...', 8, h / 2 + 4)
        raf = requestAnimationFrame(draw)
        return
      }
      const pk = peaks(buffer)
      const n = pk.length / 2
      const pos = audio.duration ? audio.currentTime() / audio.duration : 0
      const px = pos * w
      const mid = h / 2
      for (let x = 0; x < w; x++) {
        const i = Math.floor((x / w) * n)
        const mn = pk[i * 2]
        const mx = pk[i * 2 + 1]
        g.fillStyle = x < px ? color : 'rgba(255,255,255,0.22)'
        g.globalAlpha = dim ? 0.35 : 1
        g.fillRect(x, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95))
      }
      g.globalAlpha = 1
      g.fillStyle = '#fff'
      g.shadowColor = color
      g.shadowBlur = 8
      g.fillRect(px - 0.5, 0, 1.5, h)
      g.shadowBlur = 0
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [buffer, color, dim])

  return (
    <canvas
      ref={canvas}
      className="waveform"
      style={{ height }}
      onPointerDown={(e) => {
        if (!onSeek || !audio.duration) return
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
        onSeek(((e.clientX - r.left) / r.width) * audio.duration)
      }}
    />
  )
}
