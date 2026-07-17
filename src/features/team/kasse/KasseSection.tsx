import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso, uid } from '../../../lib/db'
import type { CashTransaction, Fine, FineTemplate, Player } from '../../../lib/types'
import { fmtDate, fmtDateShort, playerName } from '../../../lib/format'
import { Avatar } from '../../../components/Avatar'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Segmented,
  Sheet,
} from '../../../components/ui'
import { Field, inputCls, TwoStepDelete } from '../../kader/shared'
import type { TeamSectionProps } from '../../props'
import { fmtEuro, fmtEuroSigned, parseEuro } from './money'

/**
 * Mannschaftskasse: Kassenstand, Strafen verhängen/kassieren,
 * Strafenkatalog, Zahlungserinnerung und Kassen-Verlauf.
 */
export default function KasseSection({ openPlayer }: TeamSectionProps) {
  const players = useLiveQuery(() => db.players.toArray())
  const fines = useLiveQuery(() => db.fines.toArray())
  const cash = useLiveQuery(() => db.cash.toArray())
  const templates = useLiveQuery(() => db.fineTemplates.orderBy('order').toArray())

  if (!players || !fines || !cash || !templates) {
    return (
      <div className="flex h-[30dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }
  return (
    <KasseInner
      players={players}
      fines={fines}
      cash={cash}
      templates={templates}
      openPlayer={openPlayer}
    />
  )
}

/** Offene Strafen einer Spielerin, gebündelt. */
interface OpenGroup {
  player: Player
  sum: number
  fines: Fine[]
}

function KasseInner({
  players,
  fines,
  cash,
  templates,
  openPlayer,
}: {
  players: Player[]
  fines: Fine[]
  cash: CashTransaction[]
  templates: FineTemplate[]
  openPlayer: (id: string) => void
}) {
  const [showCash, setShowCash] = useState(false)
  const [showFine, setShowFine] = useState(false)
  const [showReminder, setShowReminder] = useState(false)

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const balance = useMemo(
    () =>
      fines.filter((f) => f.paid).reduce((s, f) => s + f.amount, 0) +
      cash.reduce((s, t) => s + t.amount, 0),
    [fines, cash],
  )
  const openSum = useMemo(
    () => fines.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0),
    [fines],
  )

  // Offene Strafen je Spielerin, höchste Summe zuerst.
  const openGroups = useMemo<OpenGroup[]>(() => {
    const byPlayer = new Map<string, Fine[]>()
    for (const f of fines) {
      if (f.paid) continue
      const list = byPlayer.get(f.playerId)
      if (list) list.push(f)
      else byPlayer.set(f.playerId, [f])
    }
    const groups: OpenGroup[] = []
    for (const [pid, list] of byPlayer) {
      const player = playerById.get(pid)
      if (!player) continue
      list.sort((a, b) => a.date.localeCompare(b.date))
      groups.push({ player, fines: list, sum: list.reduce((s, f) => s + f.amount, 0) })
    }
    groups.sort(
      (a, b) => b.sum - a.sum || a.player.lastName.localeCompare(b.player.lastName, 'de'),
    )
    return groups
  }, [fines, playerById])

  return (
    <div className="pb-6">
      {/* ---------- Kassenstand ---------- */}
      <Card className="mt-2 p-4">
        <span className="font-display text-[12px] font-bold uppercase tracking-wide text-muted">
          Kassenstand
        </span>
        <p
          className={`tnum font-display text-[40px] font-bold leading-tight ${
            balance < 0 ? 'text-crit' : ''
          }`}
        >
          {fmtEuro(balance)}
        </p>
        <p className="mt-0.5 text-[13px] text-muted tnum">
          {openSum > 0 ? `davon offen: ${fmtEuro(openSum)}` : 'keine offenen Strafen'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowCash(true)}>
            Einzahlung / Ausgabe
          </Button>
          <Button className="flex-1" onClick={() => setShowFine(true)}>
            Strafe verhängen
          </Button>
        </div>
      </Card>

      {/* ---------- Offene Strafen ---------- */}
      <SectionTitle>Offene Strafen</SectionTitle>
      {openGroups.length === 0 ? (
        <EmptyState
          title="Keine offenen Strafen"
          hint="Alles bezahlt — neue Strafen landen hier, bis sie in die Kasse wandern."
        />
      ) : (
        <>
          <Card>
            <ul className="divide-y divide-line">
              {openGroups.map((g) => (
                <OpenGroupRow key={g.player.id} group={g} openPlayer={openPlayer} />
              ))}
            </ul>
          </Card>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => setShowReminder(true)}
          >
            <ShareIcon />
            Zahlungserinnerung
          </Button>
        </>
      )}

      {/* ---------- Strafenkatalog ---------- */}
      <KatalogSection templates={templates} />

      {/* ---------- Verlauf ---------- */}
      <VerlaufSection fines={fines} cash={cash} playerById={playerById} />

      {/* ---------- Sheets ---------- */}
      <CashSheet open={showCash} onClose={() => setShowCash(false)} />
      <FineSheet
        open={showFine}
        onClose={() => setShowFine(false)}
        players={players}
        templates={templates}
      />
      <ReminderSheet
        open={showReminder}
        onClose={() => setShowReminder(false)}
        groups={openGroups}
        totalOpen={openSum}
      />
    </div>
  )
}

/* ---------- Offene Strafen: Zeile je Spielerin ---------- */

function OpenGroupRow({
  group,
  openPlayer,
}: {
  group: OpenGroup
  openPlayer: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { player, sum, fines } = group

  async function markPaid(fine: Fine) {
    await db.fines.update(fine.id, { paid: true, paidAt: new Date().toISOString() })
  }

  return (
    <li>
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          onClick={() => openPlayer(player.id)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <Avatar player={player} size="sm" />
          <span className="truncate text-[14px] font-semibold">{playerName(player)}</span>
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`Strafen von ${player.firstName} ${expanded ? 'einklappen' : 'anzeigen'}`}
          className="flex min-h-11 items-center gap-1.5 pl-2"
        >
          <span className="tnum text-[14px] font-bold">{fmtEuro(sum)}</span>
          <Chevron open={expanded} />
        </button>
      </div>
      {expanded && (
        <ul className="divide-y divide-line border-t border-line bg-card-2/50 pl-4">
          {fines.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-1.5 pr-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{f.label}</span>
                <span className="block truncate text-[12px] text-muted tnum">
                  {fmtDate(f.date)}
                  {f.note ? ` · ${f.note}` : ''}
                </span>
              </span>
              <span className="tnum text-[13px] font-semibold">{fmtEuro(f.amount)}</span>
              <button
                onClick={() => void markPaid(f)}
                aria-label={`${f.label} als bezahlt markieren`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-ok-soft px-2.5 text-[11px] font-bold text-ok"
              >
                Bezahlt
              </button>
              <TwoStepDelete
                label="Löschen"
                confirmLabel="Sicher?"
                size="sm"
                onConfirm={() => void db.fines.delete(f.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/* ---------- Sheet: Einzahlung / Ausgabe ---------- */

function CashSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amountStr, setAmountStr] = useState('')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDirection('in')
      setAmountStr('')
      setLabel('')
      setDate(todayIso())
      setError(null)
    }
  }, [open])

  async function save() {
    const cents = parseEuro(amountStr)
    if (cents === null || cents <= 0) {
      setError('Bitte einen gültigen Betrag angeben, z.B. 25 oder 12,50.')
      return
    }
    if (!label.trim()) {
      setError('Bitte eine Bezeichnung angeben, z.B. „Getränkeverkauf Heimspiel“.')
      return
    }
    if (!date) {
      setError('Bitte ein Datum wählen.')
      return
    }
    await db.cash.add({
      id: uid(),
      date,
      amount: direction === 'out' ? -cents : cents,
      label: label.trim(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Einzahlung / Ausgabe">
      <div className="flex flex-col gap-3">
        <Segmented
          options={[
            { value: 'in', label: 'Einnahme' },
            { value: 'out', label: 'Ausgabe' },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <Field label="Betrag (€)">
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className={`${inputCls} tnum`}
          />
        </Field>
        <Field label="Bezeichnung">
          <input
            placeholder={direction === 'in' ? 'z.B. Getränkeverkauf Heimspiel' : 'z.B. Kuchen für Turnier'}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Datum">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputCls} tnum`}
          />
        </Field>
        {error && <p className="text-[13px] font-semibold text-crit">{error}</p>}
        <div className="flex gap-2 pt-1">
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

/* ---------- Sheet: Strafe verhängen ---------- */

function FineSheet({
  open,
  onClose,
  players,
  templates,
}: {
  open: boolean
  onClose: () => void
  players: Player[]
  templates: FineTemplate[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  // Template-ID oder 'free' für eine freie Strafe.
  const [choice, setChoice] = useState<string | null>(null)
  const [freeLabel, setFreeLabel] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected([])
      setChoice(null)
      setFreeLabel('')
      setAmountStr('')
      setDate(todayIso())
      setNote('')
      setError(null)
    }
  }, [open])

  const eligible = useMemo(
    () =>
      players
        .filter((p) => p.team === 'D1' || p.isGuest)
        .sort(
          (a, b) =>
            a.firstName.localeCompare(b.firstName, 'de') ||
            a.lastName.localeCompare(b.lastName, 'de'),
        ),
    [players],
  )
  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates])

  function toggle(id: string) {
    setSelected((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]))
  }

  async function save() {
    if (selected.length === 0) {
      setError('Bitte mindestens eine Spielerin auswählen.')
      return
    }
    let label: string
    let amount: number
    let templateId: string | undefined
    if (choice === 'free') {
      const cents = parseEuro(amountStr)
      if (!freeLabel.trim()) {
        setError('Bitte eine Bezeichnung für die Strafe angeben.')
        return
      }
      if (cents === null || cents <= 0) {
        setError('Bitte einen gültigen Betrag angeben, z.B. 5 oder 7,50.')
        return
      }
      label = freeLabel.trim()
      amount = cents
    } else {
      const t = activeTemplates.find((t) => t.id === choice)
      if (!t) {
        setError('Bitte eine Strafe aus dem Katalog wählen oder eine freie Strafe anlegen.')
        return
      }
      label = t.label
      amount = t.amount
      templateId = t.id
    }
    if (!date) {
      setError('Bitte ein Datum wählen.')
      return
    }
    const noteV = note.trim() || undefined
    await db.fines.bulkAdd(
      selected.map((playerId) => ({
        id: uid(),
        playerId,
        templateId,
        label,
        amount,
        date,
        paid: false,
        note: noteV,
      })),
    )
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Strafe verhängen">
      <div className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">
            Spielerinnen{' '}
            {selected.length > 0 && <span className="tnum">· {selected.length} ausgewählt</span>}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {eligible.map((p) => {
              const sel = selected.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  aria-pressed={sel}
                  className={`flex w-16 flex-col items-center gap-1 rounded-xl p-1.5 transition-colors ${
                    sel ? 'bg-accent-soft' : ''
                  }`}
                >
                  <span className="relative">
                    <Avatar player={p} size="md" className={sel ? 'ring-2 ring-accent' : ''} />
                    {sel && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-white"
                      >
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span
                    className={`w-full truncate text-center text-[11px] ${
                      sel ? 'font-bold text-accent' : 'text-muted'
                    }`}
                  >
                    {p.firstName}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">Strafe</span>
          <div className="flex flex-col gap-1.5">
            {activeTemplates.map((t) => {
              const sel = choice === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setChoice(t.id)}
                  aria-pressed={sel}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left transition-colors ${
                    sel ? 'border-accent bg-accent-soft' : 'border-line bg-card-2'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {t.label}
                  </span>
                  <span className="tnum text-[13px] font-bold">{fmtEuro(t.amount)}</span>
                </button>
              )
            })}
            <button
              onClick={() => setChoice('free')}
              aria-pressed={choice === 'free'}
              className={`flex min-h-11 items-center rounded-xl border px-3 text-left text-[14px] font-semibold transition-colors ${
                choice === 'free' ? 'border-accent bg-accent-soft' : 'border-line bg-card-2'
              }`}
            >
              Freie Strafe …
            </button>
          </div>
        </div>

        {choice === 'free' && (
          <div className="flex gap-2">
            <Field label="Bezeichnung" className="flex-1">
              <input
                placeholder="z.B. Ball vergessen"
                value={freeLabel}
                onChange={(e) => setFreeLabel(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Betrag (€)" className="w-28">
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className={`${inputCls} tnum`}
              />
            </Field>
          </div>
        )}

        <Field label="Datum">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputCls} tnum`}
          />
        </Field>
        <Field label="Notiz (optional)">
          <input
            placeholder="z.B. Abfahrt Auswärtsspiel"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </Field>

        {error && <p className="text-[13px] font-semibold text-crit">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            {selected.length > 1 ? `${selected.length} Strafen verhängen` : 'Strafe verhängen'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- Sheet: Zahlungserinnerung (WhatsApp) ---------- */

function buildReminderText(groups: OpenGroup[], totalOpen: number): string {
  const lines = groups.map((g) => {
    const details = g.fines.map((f) => `${f.label} ${fmtDateShort(f.date)}`).join(', ')
    return `• ${g.player.firstName}: ${fmtEuro(g.sum)} (${details})`
  })
  return [
    'Hallo zusammen! Kurzes Update aus der Mannschaftskasse — folgende Strafen sind noch offen:',
    '',
    ...lines,
    '',
    `Gesamt: ${fmtEuro(totalOpen)}`,
    '',
    'Bitte bis zum nächsten Training in die Kasse einzahlen — danke euch!',
  ].join('\n')
}

function ReminderSheet({
  open,
  onClose,
  groups,
  totalOpen,
}: {
  open: boolean
  onClose: () => void
  groups: OpenGroup[]
  totalOpen: number
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  const text = useMemo(() => buildReminderText(groups, totalOpen), [groups, totalOpen])

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        // Abgebrochen oder nicht möglich → WhatsApp-Fallback.
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Zahlungserinnerung">
      <div className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap rounded-xl border border-line bg-card-2 p-3 text-[13px] leading-relaxed">
          {text}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => void copy()}>
            {copied ? 'Kopiert!' : 'Kopieren'}
          </Button>
          <Button className="flex-1" onClick={() => void share()}>
            <ShareIcon />
            Teilen
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- Strafenkatalog (einklappbar) ---------- */

function KatalogSection({ templates }: { templates: FineTemplate[] }) {
  const [open, setOpen] = useState(false)
  // 'new' = anlegen, sonst zu bearbeitendes Template.
  const [editing, setEditing] = useState<FineTemplate | 'new' | null>(null)

  return (
    <>
      <CollapsibleTitle
        open={open}
        onToggle={() => setOpen((v) => !v)}
        badge={`${templates.filter((t) => t.active).length}`}
      >
        Strafenkatalog
      </CollapsibleTitle>
      {open && (
        <Card>
          {templates.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-muted">
              Noch keine Strafen im Katalog.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-1.5 ${t.active ? '' : 'opacity-55'}`}
                >
                  <button
                    onClick={() => setEditing(t)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {t.label}
                    </span>
                    <span className="tnum text-[13px] font-bold">{fmtEuro(t.amount)}</span>
                  </button>
                  <button
                    onClick={() => void db.fineTemplates.update(t.id, { active: !t.active })}
                    aria-pressed={t.active}
                    aria-label={`${t.label} ${t.active ? 'deaktivieren' : 'aktivieren'}`}
                    className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-[11px] font-bold ${
                      t.active ? 'bg-ok-soft text-ok' : 'bg-card-2 text-muted'
                    }`}
                  >
                    {t.active ? 'Aktiv' : 'Inaktiv'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-2">
            <Button variant="ghost" className="w-full" onClick={() => setEditing('new')}>
              + Neue Katalog-Strafe
            </Button>
          </div>
        </Card>
      )}
      <TemplateSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        template={editing === 'new' ? null : editing}
        nextOrder={templates.reduce((m, t) => Math.max(m, t.order + 1), 0)}
      />
    </>
  )
}

function TemplateSheet({
  open,
  onClose,
  template,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  template: FineTemplate | null
  nextOrder: number
}) {
  const [label, setLabel] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLabel(template?.label ?? '')
      setAmountStr(template ? String(template.amount / 100).replace('.', ',') : '')
      setError(null)
    }
  }, [open, template])

  async function save() {
    const cents = parseEuro(amountStr)
    if (!label.trim()) {
      setError('Bitte eine Bezeichnung angeben.')
      return
    }
    if (cents === null || cents <= 0) {
      setError('Bitte einen gültigen Betrag angeben, z.B. 5 oder 7,50.')
      return
    }
    if (template) {
      await db.fineTemplates.update(template.id, { label: label.trim(), amount: cents })
    } else {
      await db.fineTemplates.add({
        id: uid(),
        label: label.trim(),
        amount: cents,
        active: true,
        order: nextOrder,
      })
    }
    onClose()
  }

  /** Löschen: hart, wenn keine Strafe darauf verweist — sonst nur deaktivieren. */
  async function remove() {
    if (!template) return
    const used = await db.fines.filter((f) => f.templateId === template.id).count()
    if (used > 0) {
      await db.fineTemplates.update(template.id, { active: false })
    } else {
      await db.fineTemplates.delete(template.id)
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={template ? 'Katalog-Strafe bearbeiten' : 'Neue Katalog-Strafe'}
    >
      <div className="flex flex-col gap-3">
        <Field label="Bezeichnung">
          <input
            placeholder="z.B. Zu spät zum Training"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Betrag (€)">
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className={`${inputCls} tnum`}
          />
        </Field>
        {error && <p className="text-[13px] font-semibold text-crit">{error}</p>}
        <div className="flex gap-2 pt-1">
          {template && (
            <TwoStepDelete
              label="Löschen"
              confirmLabel="Wirklich löschen?"
              size="lg"
              onConfirm={() => void remove()}
              className="flex-1"
            />
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            Speichern
          </Button>
        </div>
        {template && (
          <p className="text-[12px] text-muted">
            Hinweis: Wird die Strafe bereits verwendet, wird sie beim Löschen nur deaktiviert.
          </p>
        )}
      </div>
    </Sheet>
  )
}

/* ---------- Verlauf (einklappbar) ---------- */

interface Movement {
  id: string
  date: string
  label: string
  amount: number
}

function VerlaufSection({
  fines,
  cash,
  playerById,
}: {
  fines: Fine[]
  cash: CashTransaction[]
  playerById: Map<string, Player>
}) {
  const [open, setOpen] = useState(false)

  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = []
    for (const f of fines) {
      if (!f.paid) continue
      const who = playerById.get(f.playerId)?.firstName ?? 'Unbekannt'
      list.push({
        id: f.id,
        date: (f.paidAt ?? f.date).slice(0, 10),
        label: `Strafe ${who} · ${f.label}`,
        amount: f.amount,
      })
    }
    for (const t of cash) {
      list.push({ id: t.id, date: t.date, label: t.label, amount: t.amount })
    }
    list.sort((a, b) => b.date.localeCompare(a.date))
    return list.slice(0, 20)
  }, [fines, cash, playerById])

  return (
    <>
      <CollapsibleTitle open={open} onToggle={() => setOpen((v) => !v)}>
        Verlauf
      </CollapsibleTitle>
      {open &&
        (movements.length === 0 ? (
          <EmptyState
            title="Noch keine Bewegungen"
            hint="Bezahlte Strafen sowie Ein- und Auszahlungen erscheinen hier."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-13 shrink-0 text-[12px] font-semibold text-muted tnum">
                    {fmtDateShort(m.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {m.label}
                  </span>
                  <span
                    className={`tnum text-[13px] font-bold ${
                      m.amount >= 0 ? 'text-ok' : 'text-crit'
                    }`}
                  >
                    {fmtEuroSigned(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </>
  )
}

/* ---------- Kleine Bausteine ---------- */

/** SectionTitle-Optik, aber als aufklappbarer Button. */
function CollapsibleTitle({
  open,
  onToggle,
  children,
  badge,
}: {
  open: boolean
  onToggle: () => void
  children: ReactNode
  badge?: string
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-11 w-full items-center justify-between px-1 pb-1 pt-4 text-left"
    >
      <span className="inline-flex items-center gap-1.5 font-display text-[13px] uppercase tracking-wide text-muted">
        {children}
        {badge !== undefined && <Badge tone="neutral">{badge}</Badge>}
      </span>
      <Chevron open={open} />
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function CheckIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M8 6.5 12 3l4 3.5" />
      <path d="M5 12v7.5h14V12" />
    </svg>
  )
}
