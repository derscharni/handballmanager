import { useEffect, useState, type ChangeEvent } from 'react'
import { db, uid } from '../../../lib/db'
import type { MatchEvent, Opponent } from '../../../lib/types'
import { fmtDate } from '../../../lib/format'
import { Badge, Button, Sheet } from '../../../components/ui'
import { OpponentLogo } from './OpponentLogo'
import { downscaleLogo, loadLogoFromUrl } from './logo'
import { fmtDiff, hasResult, recordFromEvents } from './bilanz'
import { Field, TwoStepDelete, inputCls } from './form'

type LogoTool = 'none' | 'url' | 'search'

const URL_ERROR_TEXT = {
  'invalid-url': 'Bitte eine gültige Bild-URL eingeben (https://…).',
  'not-image': 'Unter dieser URL liegt kein Bild.',
  blocked: 'Direktes Laden blockiert — Bild speichern und hier hochladen.',
} as const

/**
 * Detail-/Bearbeiten-Sheet eines Gegners (opponent = null → neu anlegen).
 * Enthält Stammdaten, Logo-Verwaltung und die Spiele-Bilanz.
 */
export function GegnerSheet({
  open,
  opponent,
  matches,
  usedCount,
  onClose,
}: {
  open: boolean
  opponent: Opponent | null
  /** Alle Spiel-Termine gegen diesen Gegner, neueste zuerst. */
  matches: MatchEvent[]
  /** Anzahl aller Termine, die auf den Gegner verweisen (Lösch-Sperre). */
  usedCount: number
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [league, setLeague] = useState('')
  const [hall, setHall] = useState('')
  const [contact, setContact] = useState('')
  const [logo, setLogo] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [tool, setTool] = useState<LogoTool>('none')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoErrorUrl, setLogoErrorUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(opponent?.name ?? '')
    setShortName(opponent?.shortName ?? '')
    setLeague(opponent?.league ?? '')
    setHall(opponent?.hall ?? '')
    setContact(opponent?.contact ?? '')
    setLogo(opponent?.logo ?? null)
    setError(null)
    setTool('none')
    setLogoUrl('')
    setLogoBusy(false)
    setLogoError(null)
    setLogoErrorUrl(null)
  }, [open, opponent])

  async function save() {
    const nameV = name.trim()
    if (!nameV) {
      setError('Bitte einen Namen für den Gegner angeben.')
      return
    }
    const data = {
      name: nameV,
      shortName: shortName.trim() || undefined,
      league: league.trim() || undefined,
      hall: hall.trim() || undefined,
      contact: contact.trim() || undefined,
      logo,
    }
    if (opponent) {
      await db.opponents.update(opponent.id, data)
    } else {
      await db.opponents.add({ id: uid(), ...data })
    }
    onClose()
  }

  async function remove() {
    if (!opponent) return
    await db.opponents.delete(opponent.id)
    onClose()
  }

  async function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoBusy(true)
    setLogoError(null)
    setLogoErrorUrl(null)
    try {
      setLogo(await downscaleLogo(file))
      setTool('none')
    } catch {
      setLogoError('Bild konnte nicht verarbeitet werden.')
    } finally {
      setLogoBusy(false)
    }
  }

  async function onLoadFromUrl() {
    const raw = logoUrl.trim()
    if (!raw) return
    setLogoBusy(true)
    setLogoError(null)
    setLogoErrorUrl(null)
    const result = await loadLogoFromUrl(raw)
    setLogoBusy(false)
    if (result.ok) {
      setLogo(result.blob)
      setLogoUrl('')
      setTool('none')
    } else {
      setLogoError(URL_ERROR_TEXT[result.reason])
      if (result.reason === 'blocked') setLogoErrorUrl(raw)
    }
  }

  const displayName = name.trim() || opponent?.name || 'Gegner'
  const record = recordFromEvents(matches)

  const toolBtnCls =
    'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-accent-soft px-3 text-[13px] font-bold text-accent transition-opacity active:opacity-85'

  return (
    <Sheet open={open} onClose={onClose} title={opponent ? opponent.name : 'Neuer Gegner'}>
      <div className="flex flex-col gap-3">
        {/* ---------- Logo-Bereich ---------- */}
        <div className="rounded-2xl border border-line bg-card-2 p-3">
          <div className="flex items-center gap-3">
            <OpponentLogo name={displayName} shortName={shortName} logo={logo} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label className={toolBtnCls}>
                Bild hochladen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onFilePicked(e)}
                  disabled={logoBusy}
                />
              </label>
              <button
                type="button"
                className={toolBtnCls}
                aria-expanded={tool === 'url'}
                onClick={() => {
                  setTool((t) => (t === 'url' ? 'none' : 'url'))
                  setLogoError(null)
                  setLogoErrorUrl(null)
                }}
              >
                Von URL laden
              </button>
              <button
                type="button"
                className={toolBtnCls}
                aria-expanded={tool === 'search'}
                onClick={() => {
                  setTool((t) => (t === 'search' ? 'none' : 'search'))
                  setLogoError(null)
                  setLogoErrorUrl(null)
                }}
              >
                Automatisch suchen
              </button>
              {logo && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-crit-soft px-3 text-[13px] font-bold text-crit transition-opacity active:opacity-85"
                  onClick={() => setLogo(null)}
                >
                  Logo entfernen
                </button>
              )}
            </div>
          </div>

          {tool === 'url' && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://…/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className={inputCls}
                  aria-label="Bild-URL"
                />
                <Button
                  variant="secondary"
                  className="shrink-0"
                  disabled={logoBusy || logoUrl.trim() === ''}
                  onClick={() => void onLoadFromUrl()}
                >
                  {logoBusy ? 'Lädt …' : 'Laden'}
                </Button>
              </div>
              <p className="mt-1.5 text-[12px] text-muted">
                Viele Seiten blockieren direktes Laden (CORS) — dann das Bild dort speichern
                und hier hochladen.
              </p>
            </div>
          )}

          {tool === 'search' && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[13px] text-muted">
                Logo im Netz finden, dort speichern und hier über „Bild hochladen“ einfügen:
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <a
                  href={`https://www.handball.net/suche?q=${encodeURIComponent(displayName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-card px-3 text-[13px] font-bold text-accent ring-1 ring-line"
                >
                  Vereinssuche auf handball.net ↗
                </a>
                <a
                  href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
                    `${displayName} handball logo`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-card px-3 text-[13px] font-bold text-accent ring-1 ring-line"
                >
                  Google-Bildersuche ↗
                </a>
              </div>
            </div>
          )}

          {logoError && (
            <div className="mt-2.5 rounded-xl bg-warn-soft px-3 py-2">
              <p className="text-[13px] font-semibold text-warn">{logoError}</p>
              {logoErrorUrl && (
                <a
                  href={logoErrorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex min-h-9 items-center text-[13px] font-bold text-accent underline underline-offset-2"
                >
                  URL im Browser öffnen ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* ---------- Stammdaten ---------- */}
        <Field label="Name">
          <input
            placeholder="z.B. HSG Bergische Panther"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kurzname (optional)">
            <input
              placeholder="z.B. HSG BP"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Liga (optional)">
            <input
              placeholder="z.B. Landesliga"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Halle (optional)">
          <input
            placeholder="z.B. Sporthalle Burscheid"
            value={hall}
            onChange={(e) => setHall(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Kontakt (optional)">
          <textarea
            placeholder="Ansprechpartner, Telefon, E-Mail …"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none py-2.5`}
          />
        </Field>
        {error && <p className="text-[13px] font-semibold text-crit">{error}</p>}

        {/* ---------- Bilanz ---------- */}
        {opponent && (
          <div className="rounded-2xl border border-line bg-card-2 p-3">
            <h4 className="font-display text-[12px] font-bold uppercase tracking-wide text-muted">
              Spiele gegen {opponent.shortName || opponent.name}
            </h4>
            {matches.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">Noch keine Spiele im Spielplan.</p>
            ) : (
              <>
                <div className="mt-1.5 flex flex-col">
                  {matches.map((m) => (
                    <div
                      key={m.id}
                      className="flex min-h-11 items-center gap-2 border-b border-line py-1.5 last:border-b-0"
                    >
                      <span className="tnum w-[76px] shrink-0 text-[13px] font-semibold">
                        {fmtDate(m.date)}
                      </span>
                      <Badge
                        tone={m.home ? 'accent' : 'neutral'}
                        className="w-6 justify-center"
                      >
                        {m.home ? 'H' : 'A'}
                      </Badge>
                      <span className="min-w-0 flex-1" />
                      <ResultChip event={m} />
                    </div>
                  ))}
                </div>
                {record.played > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2.5">
                    <span className="tnum text-[13px] font-bold">
                      {record.wins}S · {record.draws}U · {record.losses}N
                    </span>
                    <span className="tnum text-[13px] font-semibold text-muted">
                      Tore {record.goalsFor}:{record.goalsAgainst} ({fmtDiff(record)})
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------- Löschen / Speichern ---------- */}
        {opponent && usedCount > 0 && (
          <p className="text-[12px] text-muted">
            Löschen nicht möglich — der Gegner wird in{' '}
            <span className="tnum font-semibold">{usedCount}</span>{' '}
            {usedCount === 1 ? 'Termin' : 'Terminen'} verwendet.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {opponent && usedCount === 0 && (
            <TwoStepDelete className="flex-1" onConfirm={() => void remove()} />
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Ergebnis aus unserer Sicht als Chip; ohne Ergebnis: "offen". */
function ResultChip({ event }: { event: MatchEvent }) {
  if (!hasResult(event)) return <Badge tone="neutral">offen</Badge>
  const tone =
    event.goalsUs > event.goalsThem ? 'ok' : event.goalsUs < event.goalsThem ? 'crit' : 'neutral'
  return (
    <Badge tone={tone} className="tnum">
      {event.goalsUs}:{event.goalsThem}
    </Badge>
  )
}
