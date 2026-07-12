import { useState } from 'react'
import { db } from '../../../lib/db'
import type { Settings } from '../../../lib/types'
import {
  DEFAULT_CLUB_COLORS,
  applyClubColors,
  buildClubScale,
  hexToRgb,
} from '../../../lib/clubColors'
import { Button, Card } from '../../../components/ui'

/**
 * Vereinsfarben festlegen: Hauptfarbe + Akzent. Die App generiert daraus
 * die komplette Farbskala und themt sich sofort um — Änderungen wirken live.
 */
export function FarbenCard({ settings }: { settings: Settings }) {
  const [primary, setPrimary] = useState(settings.colors?.primary ?? DEFAULT_CLUB_COLORS.primary)
  const [accent, setAccent] = useState(settings.colors?.accent ?? DEFAULT_CLUB_COLORS.accent)
  const [saved, setSaved] = useState(false)

  const valid = hexToRgb(primary) != null && hexToRgb(accent) != null
  const scale = valid ? buildClubScale({ primary, accent }) : null
  const isDefault =
    primary.toLowerCase() === DEFAULT_CLUB_COLORS.primary.toLowerCase() &&
    accent.toLowerCase() === DEFAULT_CLUB_COLORS.accent.toLowerCase()

  function preview(nextPrimary: string, nextAccent: string) {
    if (hexToRgb(nextPrimary) && hexToRgb(nextAccent)) {
      applyClubColors({ primary: nextPrimary, accent: nextAccent })
    }
  }

  async function save() {
    if (!valid) return
    await db.settings.update('app', {
      colors: isDefault ? undefined : { primary, accent },
    })
    applyClubColors(isDefault ? undefined : { primary, accent })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function reset() {
    setPrimary(DEFAULT_CLUB_COLORS.primary)
    setAccent(DEFAULT_CLUB_COLORS.accent)
    await db.settings.update('app', { colors: undefined })
    applyClubColors(undefined)
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="Hauptfarbe"
          value={primary}
          onChange={(v) => {
            setPrimary(v)
            preview(v, accent)
          }}
        />
        <ColorField
          label="Akzentfarbe"
          value={accent}
          onChange={(v) => {
            setAccent(v)
            preview(primary, v)
          }}
        />
      </div>

      {scale && (
        <div className="flex overflow-hidden rounded-lg border border-line" aria-hidden="true">
          {(
            ['--club-950', '--club-900', '--club-700', '--club-500', '--club-300', '--club-150'] as const
          ).map((k) => (
            <span key={k} className="h-7 flex-1" style={{ background: scale[k] }} />
          ))}
          <span className="h-7 flex-1" style={{ background: scale['--club-acc'] }} />
        </div>
      )}

      <p className="text-[12px] text-muted">
        Die App erzeugt aus beiden Farben die komplette Skala (Poster, Buttons,
        Badges, Taktikboard). Änderungen wirken sofort — Speichern macht sie dauerhaft.
      </p>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save()} disabled={!valid}>
          {saved ? 'Gespeichert ✓' : 'Farben speichern'}
        </Button>
        {!isDefault && (
          <Button variant="secondary" onClick={() => void reset()}>
            TuS-Standard
          </Button>
        )}
      </div>
    </Card>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} wählen`}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-card-2 p-1"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="tnum min-h-11 w-full rounded-xl border border-line bg-card-2 px-3 text-[14px] font-semibold uppercase"
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#14418F"
        />
      </span>
    </label>
  )
}
