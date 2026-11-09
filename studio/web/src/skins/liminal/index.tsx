import type { CSSProperties } from 'react'
import '@fontsource/syne/700.css'
import '@fontsource/space-grotesk/400.css'
import { useEasy } from '../../studio/EasyContext'
import { useStudio } from '../../studio/StudioContext'
import { Overview } from '../shared/Overview'
import { AdvancedDesk, Brief, Finishing, Macros, StudioTop } from '../shared/NewSkinParts'
import { Transport } from '../shared/TopParts'
import './liminal.css'

export default function Liminal() {
  const { mode, current } = useStudio()
  const easy = useEasy()
  return (
    <div className="ns liminal" data-skin-root="liminal" data-mode={mode}>
      <StudioTop brand="LIMINAL" edition="VOID · DRIFT" />
      <main className="ns-scroll lim-void">
        <div className="lim-ambient" aria-hidden="true" />
        {mode === 'easy' ? (
          <>
            <section className="lim-float lim-stage">
              <div className="lim-label">DRIFT</div>
              <div className="lim-tiles" data-testid="vibes">
                {easy.tiles.map((p, i) => (
                  <button
                    key={p.id}
                    className="lim-tile"
                    style={{ '--i': i } as CSSProperties}
                    aria-pressed={easy.genreId === p.id}
                    onClick={() => easy.selectGenre(p)}
                  >
                    <span className="lim-edge" />
                    <b>{p.name}</b>
                    <small>{p.generate?.bpm || '∞'} BPM</small>
                  </button>
                ))}
              </div>
            </section>
            <aside className="lim-float lim-control">
              <div className="lim-status">
                <span>SPACE</span>
                <b>{easy.busy ? 'FORMING…' : current ? 'HELD' : 'EMPTY'}</b>
                <Transport />
              </div>
              <Brief verb="HOLD A SOUND" />
              <Macros />
              <Finishing />
            </aside>
            <section className="lim-float lim-result" data-ready={!!current}>
              <Overview color="#a8f0ff" />
              <div className="lim-meta">
                <h2>{current?.title || 'Nothing yet. The void is patient.'}</h2>
                <small>{current?.key || 'UNKEYED'} · {current?.bpm ? `${Math.round(current.bpm)} BPM` : 'UNMEASURED'}</small>
              </div>
            </section>
          </>
        ) : (
          <div className="lim-float lim-advanced">
            <AdvancedDesk label="Deep space" />
          </div>
        )}
      </main>
    </div>
  )
}
