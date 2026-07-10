/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages liefert unter /handballmanager/ aus; lokal bleibt '/'
const base = process.env.GITHUB_PAGES ? '/handballmanager/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Handball Manager — TuS Köln-Ehrenfeld',
        short_name: 'HB Manager',
        description:
          'Teammanagement für Handball-Trainer: Kader, Spieltagsplanung, Festspiel-Tracker (§55), Taktikboard, Notizen.',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0B2158',
        background_color: '#F5F6F8',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: base + 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
