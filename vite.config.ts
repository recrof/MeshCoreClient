/// <reference types="vitest" />

import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa';

const vitePwaConfig = {
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    sourcemap: true
  },
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'service-worker.ts',
  devOptions: {
    enabled: true,
    type: 'module',
  },
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'favicon.svg'],
  manifest: {
    lang: 'en',
    name: 'Mesh Core Client',
    short_name: 'MeshCoreClient',
    description: 'Client for your MeshCore companion device - manage settings and chat.',
    theme_color: '#000000',
    background_color: '#000000',
    icons: [
      {
        src: 'web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: 'web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  }
} as VitePWAOptions;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA(vitePwaConfig)
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
