import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/prayer-tracker/',
  plugins: [vue(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/*.png', 'favicon.svg'],
    manifest: {
      id: '/prayer-tracker/', name: 'قضاء الصلوات', short_name: 'قضاء الصلوات',
      description: 'متابعة ما أتممته من قضاء الصلوات، محفوظة على جهازك.',
      lang: 'ar', dir: 'rtl', start_url: '/prayer-tracker/', scope: '/prayer-tracker/',
      display: 'standalone', orientation: 'portrait-primary',
      theme_color: '#235b48', background_color: '#f5f6f0',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
      navigateFallback: '/prayer-tracker/index.html',
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: true
    }
  })]
})
