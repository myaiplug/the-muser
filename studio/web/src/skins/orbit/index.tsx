import type { CSSProperties } from 'react'
import '@fontsource/orbitron/700.css'
import '@fontsource/inter/400.css'
import { useEasy } from '../../studio/EasyContext'
import { useStudio } from '../../studio/StudioContext'
import { Overview } from '../shared/Overview'
import { AdvancedDesk, Brief, Finishing, Macros, StudioTop } from '../shared/NewSkinParts'
import { Transport } from '../shared/TopParts'
import './orbit.css'

export default function Orbit() {
  const { mode, current } = useStudio()
  const easy = useEasy()
  return (
    <div className="ns orbit" data-skin-root="orbit" data-mode={mode}>
      <StudioTop brand="ORBIT" edition="RADIAL · PATH" />
      <main className="ns-scroll or-void">
        <div className="or-rings" aria-hidden="true">
          <span /><span /><span />
        </div>
        {mode === 'easy' ? (
          <>
            <section className="or-core">
              <div className="or-tiles" data-testid="vibes">
                {easy.tiles.map((p, i) => {
                  const angle = (i / Math.max(easy.tiles.length, 1)) * 360
                  const r = 180 + (i % 3) * 40
                  return (
                    <button
                      key={p.id}
                      className="or-tile"
                      style={{
                        '--angle': `${angle}deg`,
                        '--r': `${r}px`,
                      } as CSSProperties}
                      aria-pressed={easy.genreId === p.id}
                      onClick={() => easy.selectGenre(p)}
                    >
                      <b>{p.name}</b>
                      <small>{p.generate?.bpm || '∞'}</small>
                    </button>
                  )
                })}
              </div>
              <div className="or-center">
                <span>PATH</span>
                <b>{easy.busy ? 'ALIGNING…' : current ? 'LOCKED' : 'OPEN'}</b>
                <Transport />
              </div>
            </section>
            <aside className="or-panel">
              <Brief verb="ENTER ORBIT" />
              <Macros />
              <Finishing />
            </aside>
            <section className="or-result" data-ready={!!current}>
              <Overview color="#7ef9ff" />
              <div className="or-meta">
                <h2>{current?.title || 'No trajectory yet.'}</h2>
                <small>{current?.key || 'UNKEYED'} · {current?.bpm ? `${Math.round(current.bpm)} BPM` : 'UNMEASURED'}</small>
              </div>
            </section>
          </>
        ) : (
          <div className="or-panel or-advanced">
            <AdvancedDesk label="Orbital mechanics" />
          </div>
        )}
      </main>
    </div>
  )
}
