import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Service worker: stores the whole app on the tablet so it opens
    // instantly with ZERO internet — even after a device restart or if
    // Chrome's normal cache is cleared. When a new version is deployed,
    // it downloads silently in the background during a connected moment
    // and activates on the next open.
    VitePWA({
      registerType: 'autoUpdate',
      // We ship our own public/manifest.json (already linked in index.html),
      // so tell the plugin not to generate a second one.
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'manifest.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Never intercept API calls — the app's own cache-first data layer
        // (dataSync.js + Dexie) handles those with proper offline logic.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
