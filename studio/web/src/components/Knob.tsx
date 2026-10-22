import { useEffect, useRef, useState } from 'react'

export type KnobProps = {
  label: string
  value: number
  min: number
  max: number
  defaultValue?: number
  step?: number
  size?: number
  color?: string
  bipolar?: boolean
  format?: (v: number) => string
  /** Gesture lifecycle so the host can group a drag into one undo step. */
  onBegin?: () => void
  onChange: (v: number) => void
  onEnd?: () => void
  /** One-shot change (double-click reset, keyboard). */
  onCommit?: (v: number) => void
  title?: string
}

const ARC = 270
const START = -135
const DOTS = 25

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`
}

export function Knob({
  label, value, min, max, defaultValue, step = 0, size = 56, color = 'var(--gold)', bipolar,
  format = (v) => v.toFixed(1), onBegin, onChange, onEnd, onCommit, title,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; v: number } | null>(null)
  const wheelTimer = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const latest = useRef({ value, onBegin, onChange, onEnd })
  latest.current = { value, onBegin, onChange, onEnd }

  const norm = (value - min) / (max - min)
  const clamp = (v: number) => {
    let x = Math.min(max, Math.max(min, v))
    if (step) x = Math.round(x / step) * step
    return x
  }

  // Non-passive wheel listener so we can preventDefault page scroll.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const L = latest.current
      if (wheelTimer.current === null) L.onBegin?.()
      else window.clearTimeout(wheelTimer.current)
      const fine = e.shiftKey ? 0.2 : 1
      const delta = (-Math.sign(e.deltaY) * (max - min) * 0.02 * fine)
      L.onChange(clamp(L.value + delta))
      setActive(true)
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null
        setActive(false)
        latest.current.onEnd?.()
      }, 350)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, v: value }
    setActive(true)
    onBegin?.()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const fine = e.shiftKey ? 0.2 : 1
    const dv = ((drag.current.y - e.clientY) / 180) * (max - min) * fine
    onChange(clamp(drag.current.v + dv))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    setActive(false)
    onEnd?.()
  }
  const reset = () => {
    if (defaultValue === undefined) return
    if (onCommit) onCommit(defaultValue)
    else {
      onBegin?.()
      onChange(defaultValue)
      onEnd?.()
    }
  }
  const onKey = (e: React.KeyboardEvent) => {
    const d = (max - min) * (e.shiftKey ? 0.01 : 0.05)
    let nv: number | null = null
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nv = clamp(value + d)
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nv = clamp(value - d)
    if (nv !== null) {
      e.preventDefault()
      if (onCommit) onCommit(nv)
      else {
        onBegin?.()
        onChange(nv)
        onEnd?.()
      }
    }
  }

  const s = size
  const c = s / 2
  const ringR = s / 2 - 3
  const bodyR = s / 2 - 10
  const angle = START + norm * ARC
  const zeroNorm = bipolar ? (0 - min) / (max - min) : 0
  const zeroAngle = START + zeroNorm * ARC
  const lit = (i: number) => {
    const t = i / (DOTS - 1)
    if (!bipolar) return t <= norm + 1e-6
    return (t >= Math.min(zeroNorm, norm) - 1e-6 && t <= Math.max(zeroNorm, norm) + 1e-6)
  }

  return (
    <div
      className={`knob ${active ? 'is-active' : ''}`}
      style={{ ['--knob-color' as string]: color, width: s + 8 }}
      title={title ?? `${label}: drag / scroll (Shift = fine), double-click to reset`}
    >
      <div
        ref={ref}
        className="knob-hit"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onKeyDown={onKey}
        style={{ width: s, height: s }}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <radialGradient id="kb" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#4a4a52" />
              <stop offset="45%" stopColor="#1f1f25" />
              <stop offset="100%" stopColor="#0b0b0e" />
            </radialGradient>
            <linearGradient id="kbrim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a8a93" />
              <stop offset="100%" stopColor="#16161a" />
            </linearGradient>
          </defs>
          <path d={arcPath(c, c, ringR, START, START + ARC)} className="knob-track" />
          {norm > 0.001 || bipolar ? (
            <path
              d={arcPath(c, c, ringR, Math.min(zeroAngle, angle), Math.max(zeroAngle, angle) + 0.01)}
              className="knob-arc"
            />
          ) : null}
          {Array.from({ length: DOTS }, (_, i) => {
            const [x, y] = polar(c, c, ringR, START + (i / (DOTS - 1)) * ARC)
            return <circle key={i} cx={x} cy={y} r={1.1} className={lit(i) ? 'led on' : 'led'} />
          })}
          <circle cx={c} cy={c} r={bodyR + 2} fill="url(#kbrim)" />
          <circle cx={c} cy={c} r={bodyR} fill="url(#kb)" className="knob-body" />
          <g transform={`rotate(${angle} ${c} ${c})`}>
            <line x1={c} y1={c - bodyR + 3} x2={c} y2={c - bodyR * 0.35} className="knob-pointer" />
          </g>
        </svg>
      </div>
      <div className="knob-value">{format(value)}</div>
      <div className="knob-label">{label}</div>
    </div>
  )
}
