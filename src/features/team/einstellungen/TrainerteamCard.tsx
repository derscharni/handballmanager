import { useState } from 'react'
import { db } from '../../../lib/db'
import type { Settings } from '../../../lib/types'
import { hashPin, lockAgain, tryUnlock, useTrainerLock } from '../../../lib/trainerLock'
import { Badge, Button, Card } from '../../../components/ui'

/**
 * Trainerteam & Schutz: Der Admin verwaltet die Trainer-Liste; die
 * Trainer-PIN verriegelt Notizen/Bewertungen in der ganzen App.
 * Bei gesetzter PIN sind auch diese Verwaltungs-Funktionen gesperrt,
 * bis entsperrt wurde — nur der Admin (PIN-Inhaber) ändert das Team.
 */
export function TrainerteamCard({ settings }: { settings: Settings }) {
  const { locked, pinConfigured } = useTrainerLock(settings.trainerPinHash)
  const team = settings.trainerTeam ?? { admin: '', trainers: [] }

  const [adminName, setAdminName] = useState(team.admin)
  const [newTrainer, setNewTrainer] = useState('')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [unlockPin, setUnlockPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(null), 3000)
  }

  async function saveTeam(next: { admin: string; trainers: string[] }) {
    await db.settings.update('app', { trainerTeam: next })
  }

  async function addTrainer() {
    const name = newTrainer.trim()
    if (name === '') return
    await saveTeam({ admin: adminName.trim(), trainers: [...team.trainers, name] })
    setNewTrainer('')
  }

  async function removeTrainer(name: string) {
    await saveTeam({
      admin: adminName.trim(),
      trainers: team.trainers.filter((t) => t !== name),
    })
  }

  async function setPin() {
    if (pin1.length < 4 || pin1 !== pin2) {
      flash(pin1 !== pin2 ? 'PINs stimmen nicht überein.' : 'Mindestens 4 Stellen.')
      return
    }
    await db.settings.update('app', { trainerPinHash: await hashPin(pin1) })
    await tryUnlock(pin1)
    setPin1('')
    setPin2('')
    flash('PIN gesetzt — Notizen sind jetzt geschützt.')
  }

  async function removePin() {
    await db.settings.update('app', { trainerPinHash: undefined })
    setPin1('')
    setPin2('')
    flash('PIN entfernt — Notizen sind ungeschützt.')
  }

  if (locked) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-[13px] text-muted">
          Trainerteam-Verwaltung ist gesperrt — nur der Admin (PIN) kann Trainer:innen
          ändern.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void tryUnlock(unlockPin).then((ok) => {
              if (!ok) flash('Falsche PIN.')
              setUnlockPin('')
            })
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            aria-label="Trainer-PIN"
            placeholder="PIN"
            className="tnum min-h-11 w-28 rounded-xl border border-line bg-card-2 px-3 text-center text-[16px] font-bold tracking-[0.3em]"
            value={unlockPin}
            onChange={(e) => setUnlockPin(e.target.value)}
          />
          <Button type="submit" disabled={unlockPin.length === 0}>
            Entsperren
          </Button>
        </form>
        {msg && <p className="text-[12px] font-semibold text-crit">{msg}</p>}
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-muted">Team-Admin</span>
        <input
          className="min-h-11 rounded-xl border border-line bg-card-2 px-3 text-[14px]"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          onBlur={() => void saveTeam({ admin: adminName.trim(), trainers: team.trainers })}
          placeholder="z.B. Jens"
        />
      </label>

      <div>
        <span className="text-[12px] font-semibold text-muted">Trainer:innen</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {team.trainers.length === 0 && (
            <span className="text-[12px] text-muted">Noch niemand eingetragen.</span>
          )}
          {team.trainers.map((t) => (
            <Badge key={t} tone="accent" className="!text-[12px]">
              {t}
              <button
                aria-label={`${t} entfernen`}
                className="ml-0.5 font-bold"
                onClick={() => void removeTrainer(t)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addTrainer()
          }}
        >
          <input
            className="min-h-11 flex-1 rounded-xl border border-line bg-card-2 px-3 text-[14px]"
            value={newTrainer}
            onChange={(e) => setNewTrainer(e.target.value)}
            placeholder="Name hinzufügen …"
          />
          <Button type="submit" variant="secondary" disabled={newTrainer.trim() === ''}>
            +
          </Button>
        </form>
      </div>

      <div className="rounded-xl border border-line bg-card-2 p-3">
        <p className="text-[13px] font-semibold">
          Trainer-PIN {pinConfigured ? <Badge tone="ok">aktiv</Badge> : <Badge tone="neutral">aus</Badge>}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Verriegelt Notizen &amp; Bewertungen in der ganzen App — z.B. wenn das Handy
          in der Kabine weitergegeben wird. Nur mit PIN sichtbar.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="password"
            inputMode="numeric"
            aria-label="Neue PIN"
            placeholder={pinConfigured ? 'Neue PIN' : 'PIN (min. 4)'}
            className="tnum min-h-11 rounded-xl border border-line bg-card px-3 text-center text-[15px] font-bold tracking-[0.25em]"
            value={pin1}
            onChange={(e) => setPin1(e.target.value)}
          />
          <input
            type="password"
            inputMode="numeric"
            aria-label="PIN wiederholen"
            placeholder="Wiederholen"
            className="tnum min-h-11 rounded-xl border border-line bg-card px-3 text-center text-[15px] font-bold tracking-[0.25em]"
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
        </div>
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" onClick={() => void setPin()} disabled={pin1.length === 0}>
            {pinConfigured ? 'PIN ändern' : 'PIN aktivieren'}
          </Button>
          {pinConfigured && (
            <>
              <Button variant="secondary" onClick={() => void removePin()}>
                Entfernen
              </Button>
              <Button variant="ghost" onClick={lockAgain}>
                Jetzt sperren
              </Button>
            </>
          )}
        </div>
        {msg && <p className="mt-2 text-[12px] font-semibold text-accent">{msg}</p>}
      </div>

      <p className="text-[11px] text-muted">
        Hinweis: In der geplanten Mehrbenutzer-Version werden Trainer-Rollen
        serverseitig erzwungen — die PIN ist der lokale Schutz für dieses Gerät.
      </p>
    </Card>
  )
}
