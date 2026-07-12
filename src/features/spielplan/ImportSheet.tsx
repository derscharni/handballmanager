import { useRef, useState } from 'react'
import { db, uid } from '../../lib/db'
import type { EventKind, EventSource, MatchEvent, Opponent, Settings } from '../../lib/types'
import { Badge, Button, Segmented, Sheet } from '../../components/ui'
import { fmtDayDate } from '../../lib/format'
import { icsToCandidates, parseIcs, type ImportCandidate } from './ics'
import {
  buildScheduleApiUrl,
  extractTeamId,
  fetchSchedule,
  parseHandballNetSchedule,
} from './handballnet'
import { Field, SelectWrap, codeTextareaCls, inputCls, selectSmCls } from './inputs'

interface PreviewRow {
  key: string
  cand: ImportCandidate
  kind: EventKind
  include: boolean
  duplicate: boolean
}

const KIND_LABEL: Record<EventKind, string> = {
  match: 'Spiel',
  training: 'Training',
  tournament: 'Turnier',
  sonstiges: 'Event',
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Sheet für ICS- und handball.net-Import mit Vorschau + Dublettenschutz. */
export default function ImportSheet({
  open,
  onClose,
  settings,
  existingExternalIds,
}: {
  open: boolean
  onClose: () => void
  settings: Settings | undefined
  existingExternalIds: Set<string>
}) {
  const [mode, setMode] = useState<'ics' | 'hbnet'>('ics')
  const [icsText, setIcsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [hbUrl, setHbUrl] = useState(settings?.handballNetUrl ?? '')
  const [hbLoading, setHbLoading] = useState(false)
  const [hbFallback, setHbFallback] = useState<string | null>(null)
  const [hbJson, setHbJson] = useState('')
  const [copied, setCopied] = useState(false)

  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [previewSource, setPreviewSource] = useState<EventSource>('ics')
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const clubName = settings?.clubName ?? 'TuS'
  const teamId = extractTeamId(hbUrl)
  const apiUrl = teamId ? buildScheduleApiUrl(teamId) : null

  function buildPreview(cands: ImportCandidate[], source: EventSource) {
    const seen = new Set<string>()
    const rows: PreviewRow[] = cands.map((cand, i) => {
      const ext = cand.externalId
      const duplicate = !!ext && (existingExternalIds.has(ext) || seen.has(ext))
      if (ext) seen.add(ext)
      return { key: `${ext ?? 'row'}-${i}`, cand, kind: cand.kind, include: !duplicate, duplicate }
    })
    setPreview(rows)
    setPreviewSource(source)
    setError(null)
    setResult(null)
  }

  function runIcsParse(text: string) {
    setError(null)
    try {
      const events = parseIcs(text)
      if (events.length === 0) {
        setError('Keine Termine gefunden — ist das eine .ics-Datei mit VEVENT-Blöcken?')
        return
      }
      buildPreview(icsToCandidates(events, clubName), 'ics')
    } catch (e) {
      setError(`Format nicht erkannt: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return
    runIcsParse(await file.text())
    if (fileRef.current) fileRef.current.value = ''
  }

  async function loadFromHandballNet() {
    setError(null)
    setHbFallback(null)
    if (!apiUrl) {
      setError('Team-URL nicht erkannt — bitte den Link einer Mannschaftsseite einfügen.')
      return
    }
    await db.settings.update('app', { handballNetUrl: hbUrl.trim() })
    setHbLoading(true)
    try {
      const raw = await fetchSchedule(apiUrl)
      buildPreview(parseHandballNetSchedule(raw, clubName), 'handballnet')
    } catch (e) {
      setHbFallback(e instanceof Error ? e.message : String(e))
    } finally {
      setHbLoading(false)
    }
  }

  function parsePastedJson() {
    setError(null)
    try {
      buildPreview(parseHandballNetSchedule(hbJson, clubName), 'handballnet')
    } catch (e) {
      setError(`Format nicht erkannt: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function copyApiUrl() {
    if (!apiUrl) return
    try {
      await navigator.clipboard.writeText(apiUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard nicht verfügbar — Link bleibt zum manuellen Kopieren sichtbar.
    }
  }

  async function commit() {
    if (!preview) return
    const toImport = preview.filter((r) => r.include && !r.duplicate)
    const skipped = preview.length - toImport.length
    const opponents = await db.opponents.toArray()
    const oppByName = new Map(opponents.map((o) => [normName(o.name), o.id]))
    let imported = 0
    for (const row of toImport) {
      let opponentId: string | undefined
      if (row.kind === 'match' && row.cand.opponentName) {
        const key = normName(row.cand.opponentName)
        opponentId = oppByName.get(key)
        if (!opponentId) {
          const opp: Opponent = { id: uid(), name: row.cand.opponentName.trim(), logo: null }
          await db.opponents.add(opp)
          oppByName.set(key, opp.id)
          opponentId = opp.id
        }
      }
      const ev: MatchEvent = {
        id: uid(),
        kind: row.kind,
        date: row.cand.date,
        time: row.cand.time,
        home: row.kind === 'match' ? (row.cand.home ?? true) : undefined,
        opponentId,
        hall: row.cand.hall,
        note: row.kind !== 'match' && row.cand.title !== 'Termin' ? row.cand.title : undefined,
        goalsUs: row.kind === 'match' ? null : undefined,
        goalsThem: row.kind === 'match' ? null : undefined,
        source: previewSource,
        externalId: row.cand.externalId,
      }
      await db.events.add(ev)
      imported++
    }
    setPreview(null)
    setResult({ imported, skipped })
  }

  const includedCount = preview?.filter((r) => r.include && !r.duplicate).length ?? 0
  const duplicateCount = preview?.filter((r) => r.duplicate).length ?? 0

  return (
    <Sheet open={open} onClose={onClose} title="Spielplan importieren">
      <div className="flex flex-col gap-3">
        {result ? (
          <>
            <div className="rounded-xl bg-ok-soft p-4 text-center">
              <p className="font-display text-[18px] font-bold text-ok tnum">
                {result.imported} {result.imported === 1 ? 'Termin' : 'Termine'} importiert
              </p>
              {result.skipped > 0 && (
                <p className="mt-1 text-[13px] text-muted tnum">
                  {result.skipped} übersprungen (bereits vorhanden oder abgewählt)
                </p>
              )}
            </div>
            <Button onClick={onClose}>Fertig</Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Weitere importieren
            </Button>
          </>
        ) : preview ? (
          <>
            <p className="text-[13px] text-muted tnum">
              {preview.length} {preview.length === 1 ? 'Termin' : 'Termine'} gefunden
              {duplicateCount > 0 && ` · ${duplicateCount} bereits vorhanden (übersprungen)`}
            </p>
            <ul className="flex max-h-[42dvh] flex-col gap-2 overflow-y-auto">
              {preview.map((row) => (
                <li
                  key={row.key}
                  className={`flex items-center gap-2.5 rounded-xl border border-line bg-card-2 p-2.5 ${
                    row.duplicate ? 'opacity-55' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 flex-none accent-(--accent)"
                    checked={row.include && !row.duplicate}
                    disabled={row.duplicate}
                    aria-label={`${row.cand.title} importieren`}
                    onChange={(e) =>
                      setPreview(
                        (prev) =>
                          prev?.map((r) =>
                            r.key === row.key ? { ...r, include: e.target.checked } : r,
                          ) ?? null,
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">
                      {row.kind === 'match' && row.cand.opponentName
                        ? row.cand.opponentName
                        : row.cand.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted tnum">
                      {fmtDayDate(row.cand.date)}
                      {row.cand.time && ` · ${row.cand.time}`}
                      {row.kind === 'match' && (
                        <Badge tone={row.cand.home ? 'accent' : 'neutral'}>
                          {row.cand.home ? 'H' : 'A'}
                        </Badge>
                      )}
                      {row.duplicate && <Badge tone="warn">Bereits vorhanden</Badge>}
                    </p>
                  </div>
                  {!row.duplicate && (
                    <SelectWrap>
                      <select
                        className={selectSmCls}
                        value={row.kind}
                        aria-label="Terminart"
                        onChange={(e) =>
                          setPreview(
                            (prev) =>
                              prev?.map((r) =>
                                r.key === row.key ? { ...r, kind: e.target.value as EventKind } : r,
                              ) ?? null,
                          )
                        }
                      >
                        {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </SelectWrap>
                  )}
                </li>
              ))}
            </ul>
            <Button onClick={() => void commit()} disabled={includedCount === 0}>
              {includedCount} {includedCount === 1 ? 'Termin' : 'Termine'} importieren
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Zurück
            </Button>
          </>
        ) : (
          <>
            <Segmented
              options={[
                { value: 'ics', label: 'ICS-Datei' },
                { value: 'hbnet', label: 'handball.net' },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m)
                setError(null)
              }}
            />

            {mode === 'ics' ? (
              <>
                <p className="text-[13px] text-muted">
                  Kalender-Export (.ics) wählen oder den Inhalt unten einfügen — z.B. aus nuLiga
                  oder dem Vereinskalender.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ics,text/calendar"
                  className="hidden"
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  .ics-Datei wählen
                </Button>
                <Field label="Oder ICS-Text einfügen">
                  <textarea
                    className={codeTextareaCls}
                    value={icsText}
                    onChange={(e) => setIcsText(e.target.value)}
                    placeholder={'BEGIN:VCALENDAR\nBEGIN:VEVENT\n…'}
                  />
                </Field>
                <Button onClick={() => runIcsParse(icsText)} disabled={icsText.trim() === ''}>
                  Vorschau anzeigen
                </Button>
              </>
            ) : (
              <>
                <Field label="Team-URL auf handball.net">
                  <input
                    type="url"
                    className={inputCls}
                    value={hbUrl}
                    onChange={(e) => {
                      setHbUrl(e.target.value)
                      setHbFallback(null)
                    }}
                    placeholder="https://www.handball.net/mannschaften/…"
                    inputMode="url"
                  />
                </Field>
                <Button
                  onClick={() => void loadFromHandballNet()}
                  disabled={hbUrl.trim() === '' || hbLoading}
                >
                  {hbLoading ? 'Lade Spielplan …' : 'Spielplan laden'}
                </Button>

                {hbFallback && apiUrl && (
                  <div className="flex flex-col gap-3 rounded-xl border border-line bg-card-2 p-3">
                    <p className="text-[13px] leading-relaxed text-muted">
                      Der direkte Abruf wurde vom Browser blockiert (Sicherheitsregel fremder
                      Websites, sog. CORS) — das ist normal und kein Fehler der App. So geht es
                      weiter: Link unten im neuen Tab öffnen, den angezeigten Text komplett
                      kopieren und hier einfügen.
                    </p>
                    <p className="break-all rounded-lg border border-line bg-card px-2.5 py-2 font-mono text-[11px] text-muted">
                      {apiUrl}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1" onClick={() => void copyApiUrl()}>
                        {copied ? 'Kopiert ✓' : 'Link kopieren'}
                      </Button>
                      <a
                        href={apiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-accent-soft px-4 font-display text-[14px] font-bold uppercase tracking-wide text-accent"
                      >
                        Im Tab öffnen
                      </a>
                    </div>
                    <Field label="JSON-Antwort hier einfügen">
                      <textarea
                        className={codeTextareaCls}
                        value={hbJson}
                        onChange={(e) => setHbJson(e.target.value)}
                        placeholder={'{"data":[…]}'}
                      />
                    </Field>
                    <Button onClick={parsePastedJson} disabled={hbJson.trim() === ''}>
                      JSON einlesen
                    </Button>
                    <p className="text-[11.5px] text-muted">
                      Technischer Hinweis: {hbFallback}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-crit-soft px-3 py-2.5 text-[13px] text-crit">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
