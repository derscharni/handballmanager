import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { seedIfEmpty, seedTeamDefaults } from './lib/seed'
import { db } from './lib/db'

async function boot() {
  await seedIfEmpty()
  await seedTeamDefaults()

  // Theme-Einstellung anwenden (auto = OS-Präferenz, sonst erzwungen)
  const settings = await db.settings.get('app')
  if (settings && settings.theme !== 'auto') {
    document.documentElement.dataset.theme = settings.theme
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
