import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './skins/tokens.css'
import './styles/base.css'
import { applySkinAttr } from './skins/SkinProvider'
import { initialSkin } from './skins/registry'
import App from './App'
import { initApi } from './api'

applySkinAttr(initialSkin())

// Find out first whether a Studio server answers; if not, run the in-browser demo backend.
void initApi().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
