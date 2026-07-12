import { Suspense, lazy, useState } from 'react'
import { Segmented } from '../../components/ui'
import type { TeamScreenProps } from '../props'

const KasseSection = lazy(() => import('./kasse/KasseSection'))
const AemterSection = lazy(() => import('./aemter/AemterSection'))
const UmfragenSection = lazy(() => import('./umfragen/UmfragenSection'))
const GegnerSection = lazy(() => import('./gegner/GegnerSection'))
const EinstellungenSection = lazy(() => import('./einstellungen/EinstellungenSection'))

type Section = 'kasse' | 'aemter' | 'umfragen' | 'gegner' | 'einstellungen'

export default function TeamScreen({ openPlayer }: TeamScreenProps) {
  const [section, setSection] = useState<Section>('kasse')

  return (
    <div>
      <h1 className="font-display px-1 pb-2 pt-3 text-[26px] font-bold uppercase tracking-wide">
        Team
      </h1>
      <Segmented
        options={[
          { value: 'kasse', label: 'Kasse' },
          { value: 'aemter', label: 'Ämter' },
          { value: 'umfragen', label: 'Umfragen' },
          { value: 'gegner', label: 'Gegner' },
          { value: 'einstellungen', label: 'Mehr' },
        ]}
        value={section}
        onChange={setSection}
      />
      <Suspense
        fallback={
          <div className="flex h-[30dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
            Lädt …
          </div>
        }
      >
        <div className="pt-2">
          {section === 'kasse' && <KasseSection openPlayer={openPlayer} />}
          {section === 'aemter' && <AemterSection openPlayer={openPlayer} />}
          {section === 'umfragen' && <UmfragenSection openPlayer={openPlayer} />}
          {section === 'gegner' && <GegnerSection openPlayer={openPlayer} />}
          {section === 'einstellungen' && <EinstellungenSection openPlayer={openPlayer} />}
        </div>
      </Suspense>
    </div>
  )
}
