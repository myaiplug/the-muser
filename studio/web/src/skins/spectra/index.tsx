import type { CSSProperties } from 'react'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/outfit/600.css'
import { useEasy } from '../../studio/EasyContext'
import { useStudio } from '../../studio/StudioContext'
import { Overview } from '../shared/Overview'
import { AdvancedDesk, Brief, Finishing, Macros, StudioTop } from '../shared/NewSkinParts'
import { Transport } from '../shared/TopParts'
import './spectra.css'

export default function Spectra() {
  const { mode, current } = useStudio()
  const easy = useEasy()
  return (
    <div className="ns spectra" data-skin-root="spectra" data-mode={mode}>
      <StudioTop brand="SPECTRA" edition="CHROMATIC NIHILISM" />
      <main className="ns-scroll sp-void">
        <div className="sp-bloom" aria-hidden="true" />
        {mode === 'easy' ? (
          <>
            <section className="sp-panel sp-stage">
              <div className="sp-scan" />
              <div className="sp-tiles" data-testid="vibes">
                {easy.tiles.map((p, i) => (
                  <button
                    key={p.id}
                    className="sp-tile"
                    style={{ '--hue': (i * 37) % 360 } as CSSProperties}
                    aria-pressed={easy.genreId === p.id}
                    onClick={() => easy.selectGenre(p)}
                  >
                    <span className="sp-prism" />
                    <b>{p.name}</b>
                    <small>{p.generate?.bpm || '∞'}</small>
                  </button>
                ))}
              </div>
            </section>
            <aside className="sp-panel sp-control">
              <div className="sp-status">
                <span className="sp-tag">SIGNAL</span>
                <b>{easy.busy ? 'SPLITTING…' : current ? 'LOCKED' : 'NULL'}</b>
                <Transport />
              </div>
              <Brief verb="SPLIT A FREQUENCY" />
              <Macros />
              <Finishing />
            </aside>
            <section className="sp-panel sp-result" data-ready={!!current}>
              <Overview color="#ff6bff" />
              <div className="sp-meta">
                <h2>{current?.title || 'No spectrum yet.'}</h2>
                <small>{current?.key || 'NO KEY'} · {current?.bpm ? `${Math.round(current.bpm)} BPM` : 'UNMEASURED'}</small>
              </div>
            </section>
          </>
        ) : (
          <div className="sp-panel sp-advanced">
            <AdvancedDesk label="Full spectrum" />
          </div>
        )}
      </main>
    </div>
  )
}
