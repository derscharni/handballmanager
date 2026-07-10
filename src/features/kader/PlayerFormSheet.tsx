import { useEffect, useRef, useState } from 'react'
import { db, uid } from '../../lib/db'
import type { Player, Position, TeamId } from '../../lib/types'
import { POSITIONS, POSITION_LABEL, TEAMS, TEAM_LABEL } from '../../lib/types'
import { Button, Sheet } from '../../components/ui'
import { Field, inputCls } from './shared'
import { downscalePhoto } from './photo'

/**
 * Voll-Formular für "Neue Spielerin" und "Bearbeiten".
 * Foto wird via Canvas auf max. 512px JPEG verkleinert (Blob in IndexedDB).
 */
export function PlayerFormSheet({
  open,
  onClose,
  player,
}: {
  open: boolean
  onClose: () => void
  /** Vorhandene Spielerin = Bearbeiten, sonst Neuanlage. */
  player?: Player
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [mainPosition, setMainPosition] = useState<Position>('TW')
  const [altPosition, setAltPosition] = useState<'' | Position>('')
  const [team, setTeam] = useState<TeamId>('D1')
  const [comment, setComment] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Formular bei jedem Öffnen frisch befüllen.
  useEffect(() => {
    if (!open) return
    setFirstName(player?.firstName ?? '')
    setLastName(player?.lastName ?? '')
    setNumber(player?.number != null ? String(player.number) : '')
    setMainPosition(player?.mainPosition ?? 'TW')
    setAltPosition(player?.altPosition ?? '')
    setTeam(player?.team ?? 'D1')
    setComment(player?.comment ?? '')
    setPhoto(player?.photo ?? null)
    setPhotoError(null)
    setSaving(false)
  }, [open, player])

  const canSave = firstName.trim() !== '' && lastName.trim() !== '' && !saving

  async function onPickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoError(null)
    try {
      setPhoto(await downscalePhoto(file))
    } catch {
      setPhotoError('Foto konnte nicht verarbeitet werden.')
    }
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    const num = number.trim() === '' ? undefined : Number(number)
    const base = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      number: Number.isFinite(num) ? num : undefined,
      mainPosition,
      altPosition: altPosition === '' ? undefined : altPosition,
      team,
      comment: comment.trim() === '' ? undefined : comment.trim(),
      photo,
    }
    if (player) {
      await db.players.update(player.id, base)
    } else {
      await db.players.add({
        id: uid(),
        ...base,
        isGuest: false,
        available: true,
        createdAt: new Date().toISOString(),
      })
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={player ? 'Spielerin bearbeiten' : 'Neue Spielerin'}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname *">
            <input
              className={inputCls}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Nachname *">
            <input
              className={inputCls}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Nr.">
            <input
              className={`${inputCls} tnum`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="Hauptposition" className="col-span-2">
            <select
              className={inputCls}
              value={mainPosition}
              onChange={(e) => setMainPosition(e.target.value as Position)}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p} — {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Alternativposition">
            <select
              className={inputCls}
              value={altPosition}
              onChange={(e) => setAltPosition(e.target.value as '' | Position)}
            >
              <option value="">— keine —</option>
              {POSITIONS.filter((p) => p !== mainPosition).map((p) => (
                <option key={p} value={p}>
                  {p} — {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select
              className={inputCls}
              value={team}
              onChange={(e) => setTeam(e.target.value as TeamId)}
            >
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {TEAM_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Kommentar">
          <textarea
            className={`${inputCls} min-h-20 py-2.5`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="z.B. Wurfstark, spielt auch Abwehr Mitte …"
          />
        </Field>

        <PhotoPicker
          photo={photo}
          error={photoError}
          onPick={onPickPhoto}
          onRemove={() => setPhoto(null)}
          name={`${firstName} ${lastName}`.trim()}
        />

        <div className="mt-1 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" disabled={!canSave} onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Foto wählen/aufnehmen mit Vorschau und Entfernen. */
function PhotoPicker({
  photo,
  error,
  onPick,
  onRemove,
  name,
}: {
  photo: Blob | null
  error: string | null
  onPick: (file: File | undefined) => void
  onRemove: () => void
  name: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null)
      return
    }
    const u = URL.createObjectURL(photo)
    setPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])

  return (
    <div>
      <span className="mb-1 block text-[12px] font-semibold text-muted">Foto</span>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={name ? `Foto von ${name}` : 'Foto-Vorschau'}
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card-2 ring-1 ring-line text-muted"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8.5h3l1.6-2.2h6.8L17 8.5h3v10H4Z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            {photo ? 'Foto ändern' : 'Foto aufnehmen'}
          </Button>
          {photo && (
            <Button variant="danger" onClick={onRemove}>
              Entfernen
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-1 text-[12px] font-semibold text-crit">{error}</p>}
      <p className="mt-1 text-[11px] text-muted">
        Wird lokal auf max. 512px verkleinert — bleibt auf dem Gerät.
      </p>
    </div>
  )
}
