# Handball Manager

Local-First PWA für Handball-Trainer (TuS Köln-Ehrenfeld 1865, 1. Damen):
Kader- & Gästeverwaltung, Spieltagsplanung mit Entwurf→Freigabe,
Festspiel-Tracker nach DHB-Spielordnung §55, Spielplan (manuell / ICS /
handball.net), Trainer-Notizen mit Sprachaufnahme, Statistik-Dashboard
und animierbares Taktikboard.

## Stack

- React + TypeScript + Vite, Tailwind CSS 4 (Design-Tokens in `src/theme.css`)
- Dexie (IndexedDB) — alle Daten bleiben auf dem Gerät (local-first, offline-fähig)
- vite-plugin-pwa — installierbar auf iOS/Android/Desktop
- Vitest — u.a. Festspiel-Engine (`src/lib/festspiel.test.ts`)

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm test -- --run  # Tests
npm run build      # Produktion (dist/)
```

## Deployment

Jeder Push auf `main` baut und deployt automatisch nach GitHub Pages
(`.github/workflows/deploy.yml`). Einmalig in den Repo-Einstellungen
aktivieren: Settings → Pages → Source: **GitHub Actions**.

## Design

Die klickbaren Design-Iterationen (V1–V4) liegen in `design/`.
Gewinner-Richtung: „Vereinsfarben" — die App trägt Blau/Gelb des Vereins,
Token-System siehe `src/theme.css`.
