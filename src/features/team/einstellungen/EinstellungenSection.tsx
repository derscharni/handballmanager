import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, SectionTitle, Segmented, Sheet } from '../../../components/ui'
import { db, todayIso } from '../../../lib/db'
import { fmtDate } from '../../../lib/format'
import { seedIfEmpty, seedTeamDefaults } from '../../../lib/seed'
import type { Settings } from '../../../lib/types'
import type { TeamSectionProps } from '../../props'
import {
  BACKUP_TABLES,
  BackupError,
  applyBackup,
  exportBackup,
  readBackupFile,
  type ParsedBackup,
} from './backup'

const inputCls =
  'w-full min-h-11 rounded-xl border border-line bg-card-2 px-3 text-[15px] text-ink placeholder:text-muted'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

/** Theme sofort anwenden: auto = OS-Präferenz (Attribut entfernen), sonst erzwingen. */
function applyTheme(theme: Settings['theme']) {
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
}

/* ---------- Verein & Saison ---------- */

function VereinCard({ settings }: { settings: Settings }) {
  const [clubName, setClubName] = useState(settings.clubName)
  const [teamName, setTeamName] = useState(settings.teamName)
  const [seasonStart, setSeasonStart] = useState(settings.seasonStart)
  const [handballNetUrl, setHandballNetUrl] = useState(settings.handballNetUrl ?? '')
  const [saved, setSaved] = useState(false)

  const dirty =
    clubName !== settings.clubName ||
    teamName !== settings.teamName ||
    seasonStart !== settings.seasonStart ||
    handballNetUrl !== (settings.handballNetUrl ?? '')

  async function save() {
    await db.settings.update('app', {
      clubName: clubName.trim(),
      teamName: teamName.trim(),
      seasonStart: seasonStart || settings.seasonStart,
      handballNetUrl: handballNetUrl.trim() || undefined,
    })
    setSaved(true)
  }

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Field label="Verein">
        <input
          className={inputCls}
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="z.B. TuS Köln-Ehrenfeld 1865"
        />
      </Field>
      <Field label="Mannschaft">
        <input
          className={inputCls}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="z.B. 1. Damen"
        />
      </Field>
      <Field label="Saisonstart">
        <input
          type="date"
          className={`${inputCls} tabular-nums`}
          value={seasonStart}
          onChange={(e) => setSeasonStart(e.target.value)}
        />
      </Field>
      <Field label="handball.net-Team-URL (für Spielplan-Import)">
        <input
          type="url"
          inputMode="url"
          className={inputCls}
          value={handballNetUrl}
          onChange={(e) => setHandballNetUrl(e.target.value)}
          placeholder="https://www.handball.net/mannschaften/…"
        />
      </Field>
      <Button onClick={save} disabled={!dirty && !saved}>
        {saved ? 'Gespeichert ✓' : 'Speichern'}
      </Button>
    </Card>
  )
}

/* ---------- Zweistufiger Gefahren-Button ---------- */

function TwoStepDanger({
  label,
  hint,
  confirmLabel,
  onConfirm,
}: {
  label: string
  hint: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(t)
  }, [armed])

  if (!armed) {
    return (
      <Button variant="danger" className="w-full" onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }
  return (
    <div className="rounded-xl border border-line bg-card-2 p-3">
      <p className="mb-2 text-[13px] text-crit">{hint}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => setArmed(false)}
        >
          Abbrechen
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
              setArmed(false)
            }
          }}
        >
          {busy ? 'Bitte warten …' : confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/* ---------- Hauptsektion ---------- */

export default function EinstellungenSection(_props: TeamSectionProps) {
  const settings = useLiveQuery(() => db.settings.get('app'))

  // Nach Import/Reset das Formular mit den frischen Werten neu aufbauen.
  const [formEpoch, setFormEpoch] = useState(0)

  // Backup-Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null)
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (backupMsg?.kind !== 'ok') return
    const t = setTimeout(() => setBackupMsg(null), 4000)
    return () => clearTimeout(t)
  }, [backupMsg])

  async function onExport() {
    setExporting(true)
    setBackupMsg(null)
    try {
      await exportBackup()
      setBackupMsg({ kind: 'ok', text: 'Backup-Datei wurde heruntergeladen.' })
    } catch {
      setBackupMsg({ kind: 'err', text: 'Export fehlgeschlagen. Bitte erneut versuchen.' })
    } finally {
      setExporting(false)
    }
  }

  async function onFileChosen(file: File | null) {
    if (!file) return
    setBackupMsg(null)
    try {
      const parsed = await readBackupFile(file)
      setPendingImport(parsed)
    } catch (err) {
      setBackupMsg({
        kind: 'err',
        text:
          err instanceof BackupError
            ? err.message
            : 'Die Datei konnte nicht gelesen werden. Es wurden keine Daten verändert.',
      })
    }
  }

  async function confirmImport() {
    if (!pendingImport) return
    setImporting(true)
    try {
      await applyBackup(pendingImport)
      const fresh = await db.settings.get('app')
      if (fresh) applyTheme(fresh.theme)
      setPendingImport(null)
      setFormEpoch((n) => n + 1)
      setBackupMsg({ kind: 'ok', text: 'Backup erfolgreich eingespielt.' })
    } catch {
      setBackupMsg({
        kind: 'err',
        text: 'Import fehlgeschlagen — die bisherigen Daten wurden nicht verändert.',
      })
      setPendingImport(null)
    } finally {
      setImporting(false)
    }
  }

  async function clearAllTables() {
    const tables = BACKUP_TABLES.map((name) => db.table(name))
    await db.transaction('rw', tables, async () => {
      for (const t of tables) await t.clear()
    })
  }

  async function resetDemo() {
    await clearAllTables()
    await seedIfEmpty()
    await seedTeamDefaults()
    const fresh = await db.settings.get('app')
    if (fresh) applyTheme(fresh.theme)
    setFormEpoch((n) => n + 1)
  }

  async function wipeAll() {
    const theme = settings?.theme ?? 'auto'
    await clearAllTables()
    await db.settings.put({
      id: 'app',
      clubName: '',
      teamName: '',
      theme,
      seasonStart: todayIso(),
    })
    setFormEpoch((n) => n + 1)
  }

  if (!settings) return null

  return (
    <div className="pb-6">
      <SectionTitle>Verein &amp; Saison</SectionTitle>
      <VereinCard key={formEpoch} settings={settings} />

      <SectionTitle>Darstellung</SectionTitle>
      <Card className="p-4">
        <Segmented
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
          ]}
          value={settings.theme}
          onChange={async (theme) => {
            applyTheme(theme)
            await db.settings.update('app', { theme })
          }}
        />
        <p className="mt-2 text-[12px] text-muted">
          Auto folgt der System-Einstellung des Geräts.
        </p>
      </Card>

      <SectionTitle>Backup</SectionTitle>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-muted">
          Alle Daten liegen nur auf diesem Gerät. Regelmäßige Backups schützen vor
          Datenverlust — z.B. vor einem Gerätewechsel.
        </p>
        <Button onClick={onExport} disabled={exporting}>
          {exporting ? 'Exportiere …' : 'Backup exportieren'}
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Backup importieren …
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void onFileChosen(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
        {backupMsg && (
          <p
            role="status"
            className={`text-[13px] ${backupMsg.kind === 'ok' ? 'text-ok' : 'text-crit'}`}
          >
            {backupMsg.text}
          </p>
        )}
      </Card>

      <SectionTitle>Daten</SectionTitle>
      <Card className="flex flex-col gap-3 p-4">
        <TwoStepDanger
          label="Demo-Daten zurücksetzen"
          hint="Ersetzt ALLE aktuellen Daten durch die mitgelieferten Demo-Daten. Das kann nicht rückgängig gemacht werden."
          confirmLabel="Ja, zurücksetzen"
          onConfirm={resetDemo}
        />
        <TwoStepDanger
          label="Alles löschen (leer starten)"
          hint="Löscht ALLE Daten auf diesem Gerät unwiderruflich. Vorher ein Backup exportieren!"
          confirmLabel="Ja, alles löschen"
          onConfirm={wipeAll}
        />
      </Card>

      <SectionTitle>Über</SectionTitle>
      <Card className="p-4">
        <p className="font-display text-[15px] font-bold uppercase tracking-wide">
          Handball Manager
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Local-first: Alle Daten bleiben auf diesem Gerät.
        </p>
        <p className="mt-1 text-[12px] text-muted tabular-nums">Version v2</p>
      </Card>

      {/* Bestätigung vor dem Import — ersetzt window.confirm */}
      <Sheet
        open={pendingImport !== null}
        onClose={() => {
          if (!importing) setPendingImport(null)
        }}
        title="Backup einspielen?"
      >
        {pendingImport && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px]">
              Ersetzt <strong>ALLE</strong> Daten auf diesem Gerät durch den Inhalt des
              Backups
              {pendingImport.exportedAt && (
                <> vom {fmtDate(pendingImport.exportedAt.slice(0, 10))}</>
              )}
              :
            </p>
            {pendingImport.summary.length > 0 ? (
              <ul className="rounded-xl border border-line bg-card-2 p-3 text-[14px]">
                {pendingImport.summary.map((s) => (
                  <li key={s.label} className="flex justify-between py-0.5">
                    <span>{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-line bg-card-2 p-3 text-[14px] text-muted">
                Das Backup ist leer — danach sind keine Daten mehr vorhanden.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={importing}
                onClick={() => setPendingImport(null)}
              >
                Abbrechen
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={importing}
                onClick={confirmImport}
              >
                {importing ? 'Spiele ein …' : 'Alle Daten ersetzen'}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
