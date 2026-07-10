import type { KaderScreenProps } from '../props'
import { KaderListe } from './KaderListe'
import { KaderProfil } from './KaderProfil'

/**
 * Kader-Screen: zwei Zustände über Props der Shell —
 * detailPlayerId === null → Liste (Stammkader / Gäste / Weitere),
 * sonst → Profil der Spielerin (Zurück-Button setzt auf null).
 */
export default function KaderScreen({ detailPlayerId, setDetailPlayerId }: KaderScreenProps) {
  if (detailPlayerId === null) {
    return <KaderListe openPlayer={setDetailPlayerId} />
  }
  return <KaderProfil playerId={detailPlayerId} onBack={() => setDetailPlayerId(null)} />
}
