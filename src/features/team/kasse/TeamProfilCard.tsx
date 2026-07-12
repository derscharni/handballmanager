import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import { Badge, Card, SectionTitle } from '../../../components/ui'
import { fmtEuro } from './money'

/**
 * Kompakte "Team"-Karte fürs Spielerinnen-Profil:
 * Ämter der Spielerin + offene Strafen-Summe (nur wenn > 0).
 */
export function TeamProfilCard({ playerId }: { playerId: string }) {
  const duties = useLiveQuery(() => db.duties.orderBy('order').toArray(), [playerId])
  const openCents = useLiveQuery(
    async () => {
      const fines = await db.fines.where('playerId').equals(playerId).toArray()
      return fines.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0)
    },
    [playerId],
  )

  if (duties === undefined || openCents === undefined) return null
  const myDuties = duties.filter((d) => d.playerIds.includes(playerId))

  return (
    <>
      <SectionTitle>Team</SectionTitle>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold text-muted">Ämter</span>
          {myDuties.length === 0 ? (
            <span className="text-[13px] text-muted">— keine zugewiesen</span>
          ) : (
            myDuties.map((d) => (
              <Badge key={d.id} tone="accent">
                {d.label}
              </Badge>
            ))
          )}
        </div>
        {openCents > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-[13px] font-bold text-crit tnum">
            Offene Strafen: {fmtEuro(openCents)}
          </p>
        )}
      </Card>
    </>
  )
}
