import { Suspense, lazy, useState } from 'react'

const StartScreen = lazy(() => import('./features/start/StartScreen'))
const SpielplanScreen = lazy(() => import('./features/spielplan/SpielplanScreen'))
const KaderScreen = lazy(() => import('./features/kader/KaderScreen'))
const PlanungScreen = lazy(() => import('./features/planung/PlanungScreen'))
const StatistikScreen = lazy(() => import('./features/statistik/StatistikScreen'))
const TaktikScreen = lazy(() => import('./features/taktik/TaktikScreen'))
const TeamScreen = lazy(() => import('./features/team/TeamScreen'))

export type TabId =
  | 'start'
  | 'spielplan'
  | 'kader'
  | 'planung'
  | 'statistik'
  | 'taktik'
  | 'team'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'start',
    label: 'Start',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v9.5h13V10" />
      </svg>
    ),
  },
  {
    id: 'spielplan',
    label: 'Spielplan',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </svg>
    ),
  },
  {
    id: 'kader',
    label: 'Kader',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8.5" r="3.2" />
        <path d="M3.5 19.5c.7-3.3 2.9-5 5.5-5s4.8 1.7 5.5 5" />
        <circle cx="16.8" cy="9.5" r="2.6" />
        <path d="M15.5 14.6c2.4.2 4.3 1.7 5 4.9" />
      </svg>
    ),
  },
  {
    id: 'planung',
    label: 'Planung',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4.5h14M5 4.5v15h14v-15" />
        <path d="M9 12.5l2.2 2.2 4-4.4" />
      </svg>
    ),
  },
  {
    id: 'statistik',
    label: 'Statistik',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.5 19.5v-6M10 19.5V8M15.5 19.5v-9M21 19.5V5" />
      </svg>
    ),
  },
  {
    id: 'taktik',
    label: 'Taktik',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
        <path d="M12 5v14M12 9.5a2.5 2.5 0 0 1 0 5" />
        <path d="M3.5 9.5h3a2.5 2.5 0 0 1 0 5h-3" />
      </svg>
    ),
  },
  {
    id: 'team',
    label: 'Team',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 20 6v6c0 5-3.6 8.4-8 9.5C7.6 20.4 4 17 4 12V6Z" />
        <path d="M8.5 12h7M12 8.5v7" />
      </svg>
    ),
  },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('start')
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null)

  return (
    // App-Frame: die Seite selbst scrollt nie — nur <main>. So kann die
    // Navigation auf iOS/Android nicht aus dem Viewport scrollen
    // (position:fixed ist dort bei Rubber-Band/Tastatur unzuverlässig).
    // Ab lg (Tablet quer, Webview, Desktop) wird die Navigation zur
    // Seitenleiste links; darunter bleibt die Bottom-Bar.
    <div className="mx-auto flex h-dvh max-w-lg flex-col lg:max-w-none lg:flex-row">
      <nav
        aria-label="Hauptnavigation"
        className="hidden shrink-0 flex-col gap-1 border-r border-line bg-card p-3 pl-[max(0.75rem,env(safe-area-inset-left))] lg:flex lg:w-56"
      >
        <div className="mb-3 px-2 pt-1 font-display text-[15px] font-bold uppercase tracking-wide">
          HB Manager
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-display text-[14px] font-bold uppercase tracking-wide ${
              tab === t.id ? 'bg-accent-soft text-accent' : 'text-muted active:bg-card-2'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main
        id="app-scroll"
        className="flex-1 overflow-y-auto overscroll-contain px-3 pb-8 pt-2 lg:px-8"
      >
        <div className="mx-auto w-full lg:max-w-2xl">
        <Suspense
          fallback={
            <div className="flex h-[50dvh] items-center justify-center text-muted font-display uppercase tracking-wide">
              Lädt …
            </div>
          }
        >
          {tab === 'start' && (
            <StartScreen goTo={setTab} openPlayer={(id) => { setDetailPlayerId(id); setTab('kader') }} />
          )}
          {tab === 'spielplan' && <SpielplanScreen goTo={setTab} />}
          {tab === 'kader' && (
            <KaderScreen
              detailPlayerId={detailPlayerId}
              setDetailPlayerId={setDetailPlayerId}
            />
          )}
          {tab === 'planung' && <PlanungScreen />}
          {tab === 'statistik' && (
            <StatistikScreen openPlayer={(id) => { setDetailPlayerId(id); setTab('kader') }} />
          )}
          {tab === 'taktik' && <TaktikScreen />}
          {tab === 'team' && (
            <TeamScreen openPlayer={(id) => { setDetailPlayerId(id); setTab('kader') }} />
          )}
        </Suspense>
        </div>
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="z-40 shrink-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 ${
                tab === t.id ? 'text-accent' : 'text-muted'
              }`}
            >
              {t.icon}
              <span className="font-display text-[10px] font-bold uppercase tracking-wide">
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
