import type { AttendanceCounts } from './attendance'

/**
 * Kompakte Rückmeldungs-Zeile für Termin-Cards:
 * drei Mini-Pills (zugesagt / abgesagt / offen) + dünner Stacked-Bar.
 * "offen" umfasst hier auch "unsicher" — beides ist noch nicht entschieden.
 */

/** Dünner Anteils-Balken: grün (zu) · gelb (unsicher) · rot (ab) · Rest neutral. */
export function AttendanceBar({
  counts,
  className = 'h-1',
}: {
  counts: AttendanceCounts
  /** Höhe/Extras; Default h-1. */
  className?: string
}) {
  const { zugesagt, abgesagt, unsicher, total } = counts
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <span
      aria-hidden="true"
      className={`flex min-w-10 flex-1 overflow-hidden rounded-full bg-line ${className}`}
    >
      {zugesagt > 0 && <span className="h-full bg-ok" style={{ width: `${pct(zugesagt)}%` }} />}
      {unsicher > 0 && <span className="h-full bg-warn" style={{ width: `${pct(unsicher)}%` }} />}
      {abgesagt > 0 && <span className="h-full bg-crit" style={{ width: `${pct(abgesagt)}%` }} />}
    </span>
  )
}

function MiniPill({
  tone,
  value,
  label,
}: {
  tone: 'ok' | 'crit' | 'neutral'
  value: number
  label: string
}) {
  const tones = {
    ok: 'bg-ok-soft text-ok',
    crit: 'bg-crit-soft text-crit',
    neutral: 'bg-card-2 text-muted',
  }[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap ${tones}`}
    >
      <span className="tnum">{value}</span> {label}
    </span>
  )
}

export default function AttendanceRow({
  counts,
  onOpen,
}: {
  counts: AttendanceCounts
  onOpen: () => void
}) {
  const undecided = counts.offen + counts.unsicher
  return (
    <button
      onClick={onOpen}
      aria-label={`Rückmeldungen: ${counts.zugesagt} zugesagt, ${counts.abgesagt} abgesagt, ${undecided} offen`}
      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left active:bg-card-2"
    >
      <MiniPill tone="ok" value={counts.zugesagt} label="zu" />
      <MiniPill tone="crit" value={counts.abgesagt} label="ab" />
      <MiniPill tone="neutral" value={undecided} label="offen" />
      <AttendanceBar counts={counts} />
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  )
}
