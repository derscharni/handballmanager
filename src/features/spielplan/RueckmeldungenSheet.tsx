import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../lib/db'
import type { AttendanceResponse, AttendanceStatus, MatchEvent, Player } from '../../lib/types'
import { EVENT_KIND_LABEL, TEAM_LABEL } from '../../lib/types'
import { availabilityOn, type DayAvailability } from '../../lib/availability'
import { fmtDayDate, playerName } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Badge, Button, EmptyState, Sheet } from '../../components/ui'
import { AttendanceBar } from './AttendanceRow'
import {
  countAttendance,
  eventHeading,
  isRosterPlayer,
  reminderText,
  responsesByPlayer,
} from './attendance'

/**
 * Rückmeldungen-Sheet: Der Trainer pflegt Zu-/Absagen aus der WhatsApp-Gruppe.
 * Kein Eintrag = offen; nochmaliges Tippen auf den aktiven Chip setzt zurück auf offen.
 */
export default function RueckmeldungenSheet({
  open,
  event,
  opponentName,
  onClose,
}: {
  open: boolean
  event: MatchEvent | null
  opponentName?: string
  onClose: () => void
}) {
  return (
    <Sheet open={open && event != null} onClose={onClose} title="Rückmeldungen">
      {open && event && <SheetBody key={event.id} event={event} opponentName={opponentName} />}
    </Sheet>
  )
}

function SheetBody({ event, opponentName }: { event: MatchEvent; opponentName?: string }) {
  const players = useLiveQuery(() => db.players.toArray(), [])
  const absences = useLiveQuery(() => db.absences.toArray(), [])
  const responses = useLiveQuery(
    () => db.attendance.where('eventId').equals(event.id).toArray(),
    [event.id],
  )

  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  function showNotice(msg: string) {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2400)
  }

  const roster = useMemo(
    () =>
      (players ?? [])
        .filter(isRosterPlayer)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'de'),
        ),
    [players],
  )
  const byPlayer = useMemo(() => responsesByPlayer(responses ?? []), [responses])
  const counts = useMemo(() => countAttendance(roster, responses ?? []), [roster, responses])

  const availByPlayer = useMemo(() => {
    const map = new Map<string, DayAvailability>()
    for (const p of roster) map.set(p.id, availabilityOn(p, absences ?? [], event.date))
    return map
  }, [roster, absences, event.date])

  const openPlayers = useMemo(() => roster.filter((p) => !byPlayer.has(p.id)), [roster, byPlayer])
  /** Abwesende, die noch nicht abgesagt sind — Kandidatinnen für den Vorschlag-Button. */
  const absentNotDeclined = useMemo(
    () =>
      roster.filter(
        (p) => !availByPlayer.get(p.id)?.available && byPlayer.get(p.id)?.status !== 'abgesagt',
      ),
    [roster, availByPlayer, byPlayer],
  )

  if (!players || !absences || !responses) return null

  const now = () => new Date().toISOString()

  /** Setzt/ändert den Status per [eventId+playerId]-Lookup; null = zurück auf offen. */
  async function setStatus(playerId: string, status: AttendanceStatus | null) {
    const existing = await db.attendance
      .where('[eventId+playerId]')
      .equals([event.id, playerId])
      .first()
    if (status === null) {
      if (existing) await db.attendance.delete(existing.id)
      return
    }
    if (existing) {
      await db.attendance.update(existing.id, { status, updatedAt: now() })
    } else {
      await db.attendance.put({ id: uid(), eventId: event.id, playerId, status, updatedAt: now() })
    }
  }

  async function saveComment(playerId: string, comment: string) {
    const existing = await db.attendance
      .where('[eventId+playerId]')
      .equals([event.id, playerId])
      .first()
    if (!existing) return
    await db.attendance.update(existing.id, {
      comment: comment.trim() || undefined,
      updatedAt: now(),
    })
  }

  async function declineAllAbsent() {
    for (const p of absentNotDeclined) {
      const reason = availByPlayer.get(p.id)?.reason
      const existing = await db.attendance
        .where('[eventId+playerId]')
        .equals([event.id, p.id])
        .first()
      if (existing) {
        await db.attendance.update(existing.id, {
          status: 'abgesagt',
          comment: existing.comment ?? reason,
          updatedAt: now(),
        })
      } else {
        await db.attendance.put({
          id: uid(),
          eventId: event.id,
          playerId: p.id,
          status: 'abgesagt',
          comment: reason,
          updatedAt: now(),
        })
      }
    }
    showNotice('Abwesende als abgesagt eingetragen')
  }

  async function acceptAllOpen() {
    const stamp = now()
    await db.attendance.bulkPut(
      openPlayers.map((p) => ({
        id: uid(),
        eventId: event.id,
        playerId: p.id,
        status: 'zugesagt' as const,
        updatedAt: stamp,
      })),
    )
    setConfirmAllOpen(false)
    showNotice(`${openPlayers.length} Offene zugesagt`)
  }

  async function remindAllOpen() {
    const text = reminderText(
      event,
      opponentName,
      openPlayers.map((p) => p.firstName),
    )
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
        return
      } catch {
        // Abgebrochen oder nicht möglich → Fallback unten
      }
    }
    await copyReminder()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  async function copyReminder() {
    const text = reminderText(
      event,
      opponentName,
      openPlayers.map((p) => p.firstName),
    )
    try {
      await navigator.clipboard.writeText(text)
      showNotice('Erinnerungstext kopiert')
    } catch {
      showNotice('Kopieren nicht möglich')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- Termin-Kopf ---------- */}
      <div className="rounded-xl border border-line bg-card-2 px-3 py-2.5">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          <span className="min-w-0 truncate">{eventHeading(event, opponentName)}</span>
          <Badge tone={event.kind === 'match' ? 'accent' : 'neutral'}>
            {EVENT_KIND_LABEL[event.kind]}
          </Badge>
        </p>
        <p className="tnum mt-0.5 text-[12.5px] text-muted">
          {fmtDayDate(event.date)}
          {event.time ? ` · ${event.time} Uhr` : ''}
          {event.hall ? ` · ${event.hall}` : ''}
        </p>
      </div>

      {/* ---------- Zähler groß ---------- */}
      <div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [counts.zugesagt, 'Zugesagt', 'text-ok'],
              [counts.abgesagt, 'Abgesagt', 'text-crit'],
              [counts.offen, 'Offen', 'text-muted'],
            ] as const
          ).map(([val, label, cls]) => (
            <div
              key={label}
              className="rounded-xl border border-line bg-card-2 px-1 pb-1.5 pt-2 text-center"
            >
              <b className={`tnum block font-display text-[26px] font-bold leading-none ${cls}`}>
                {val}
              </b>
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 px-0.5">
          <AttendanceBar counts={counts} className="h-1.5" />
          <span className="tnum shrink-0 text-[11.5px] text-muted">
            {counts.responses}/{counts.total} gemeldet
            {counts.unsicher > 0 ? ` · ${counts.unsicher} unsicher` : ''}
          </span>
        </div>
      </div>

      {/* ---------- Vorschlag: Abwesende absagen ---------- */}
      {absentNotDeclined.length > 0 && (
        <button
          onClick={() => void declineAllAbsent()}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-left text-[12.5px] font-semibold text-warn active:opacity-85"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 8v5m0 3.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="tnum">{absentNotDeclined.length}</span> abwesend am Termindatum — als
            abgesagt eintragen
          </span>
        </button>
      )}

      {/* ---------- Aktionen für Offene ---------- */}
      {openPlayers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void remindAllOpen()}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-2.5 8-2.5 8h17S18 15 18 8" />
                <path d="M10.3 20a2 2 0 0 0 3.4 0" />
              </svg>
              Alle Offenen erinnern
            </Button>
            <Button
              variant="secondary"
              className="w-12 flex-none px-0"
              aria-label="Erinnerungstext kopieren"
              onClick={() => void copyReminder()}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </Button>
          </div>
          {confirmAllOpen ? (
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void acceptAllOpen()}>
                Wirklich {openPlayers.length} zusagen?
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmAllOpen(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmAllOpen(true)}>
              Alle Offenen → zugesagt
            </Button>
          )}
        </div>
      )}

      {/* ---------- Spielerinnen-Liste ---------- */}
      {roster.length === 0 ? (
        <EmptyState
          title="Kein Kader"
          hint="Lege zuerst Spielerinnen im Kader an, um Rückmeldungen zu pflegen."
        />
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-card">
          {roster.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              response={byPlayer.get(p.id)}
              avail={availByPlayer.get(p.id)}
              onSet={(status) => void setStatus(p.id, status)}
              onComment={(text) => void saveComment(p.id, text)}
            />
          ))}
        </div>
      )}

      {/* ---------- Inline-Hinweis ---------- */}
      {notice && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-club-900 px-4 py-2.5 text-[13px] font-semibold text-club-on shadow-card"
        >
          {notice}
        </div>
      )}
    </div>
  )
}

/* ==================================================================
   Zeile pro Spielerin: Status-Chips + expandierbarer Kommentar
   ================================================================== */
const CHIP_ACTIVE: Record<AttendanceStatus, string> = {
  zugesagt: 'border-ok bg-ok-soft text-ok',
  abgesagt: 'border-crit bg-crit-soft text-crit',
  unsicher: 'border-warn bg-warn-soft text-warn',
}

function PlayerRow({
  player,
  response,
  avail,
  onSet,
  onComment,
}: {
  player: Player
  response: AttendanceResponse | undefined
  avail: DayAvailability | undefined
  onSet: (status: AttendanceStatus | null) => void
  onComment: (text: string) => void
}) {
  const [editingComment, setEditingComment] = useState(false)
  const [draft, setDraft] = useState('')

  const status = response?.status
  const chips: { value: AttendanceStatus; label: string; aria: string }[] = [
    { value: 'zugesagt', label: 'Zu', aria: 'Zugesagt' },
    { value: 'abgesagt', label: 'Ab', aria: 'Abgesagt' },
    { value: 'unsicher', label: '?', aria: 'Unsicher' },
  ]

  function startCommentEdit() {
    if (!response) return
    setDraft(response.comment ?? '')
    setEditingComment(true)
  }

  function finishCommentEdit() {
    setEditingComment(false)
    onComment(draft)
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2.5">
        <Avatar player={player} size="sm" />
        <button
          onClick={startCommentEdit}
          disabled={!response}
          className="min-h-11 min-w-0 flex-1 text-left disabled:cursor-default"
          aria-label={
            response
              ? `Kommentar für ${playerName(player)} bearbeiten`
              : playerName(player)
          }
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {playerName(player)}
            </span>
            {player.isGuest && <Badge tone="guest">Gast · {TEAM_LABEL[player.team]}</Badge>}
          </span>
          {avail && !avail.available && (
            <span className="mt-0.5 block">
              <Badge tone="warn">{avail.reason}</Badge>
            </span>
          )}
          {!editingComment && response?.comment && (
            <span className="mt-0.5 block truncate text-[12px] italic text-muted">
              „{response.comment}“
            </span>
          )}
          {!editingComment && response && !response.comment && (
            <span className="mt-0.5 block text-[11px] text-muted">+ Kommentar</span>
          )}
        </button>
        <div className="flex flex-none gap-1.5" role="group" aria-label={`Rückmeldung ${playerName(player)}`}>
          {chips.map((c) => (
            <button
              key={c.value}
              aria-label={`${c.aria}${status === c.value ? ' — nochmal tippen für offen' : ''}`}
              aria-pressed={status === c.value}
              onClick={() => onSet(status === c.value ? null : c.value)}
              className={`grid h-11 w-11 place-items-center rounded-xl border font-display text-[13px] font-bold transition-colors ${
                status === c.value ? CHIP_ACTIVE[c.value] : 'border-line bg-card-2 text-muted'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {editingComment && (
        <div className="mt-1.5 flex gap-2 pl-[42px]">
          <input
            autoFocus
            className="min-h-11 w-full min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3 text-[13.5px] text-ink placeholder:text-muted"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishCommentEdit()
            }}
            placeholder='z.B. "kommt später"'
            maxLength={120}
          />
          <Button variant="secondary" className="flex-none px-3" onClick={finishCommentEdit}>
            OK
          </Button>
        </div>
      )}
    </div>
  )
}
