import type { TabId } from '../App'

/** Props-Verträge der Feature-Screens (Navigation läuft über die Shell). */

export interface StartScreenProps {
  goTo: (tab: TabId) => void
  openPlayer: (playerId: string) => void
}

export interface SpielplanScreenProps {
  goTo: (tab: TabId) => void
}

export interface KaderScreenProps {
  /** Von außen angesteuerte Detail-Ansicht (z.B. vom Dashboard). */
  detailPlayerId: string | null
  setDetailPlayerId: (id: string | null) => void
}

export interface StatistikScreenProps {
  openPlayer: (playerId: string) => void
}
