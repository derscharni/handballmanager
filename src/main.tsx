import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { seedIfEmpty, seedTeamDefaults } from './lib/seed'
import { applyClubColors } from './lib/clubColors'
import { db } from './lib/db'

async function boot() {
  await seedIfEmpty()
  await seedTeamDefaults()

  // Design "Trainertafel" ist immer aktiv — kein Hell-/Dunkel-Schalter mehr.
  const settings = await db.settings.get('app')
  // Vereinsfarben anwenden (fehlt = TuS-Standardskala aus theme.css)
  applyClubColors(settings?.colors)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
