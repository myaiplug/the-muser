import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './skins/tokens.css'
import './styles/base.css'
import { applySkinAttr } from './skins/SkinProvider'
import { initialSkin } from './skins/registry'
import App from './App'

applySkinAttr(initialSkin())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
