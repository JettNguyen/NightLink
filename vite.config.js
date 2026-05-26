import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const customBase = process.env.VITE_BASE_PATH;
const base = customBase && customBase.trim() !== '' ? customBase : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        // Never let the SW return index.html for asset/api paths
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//],
      },
      manifest: {
        name: 'Nightlink',
        short_name: 'Nightlink',
        description: 'Dream journal and social network',
        id: '/',
        scope: '/',
        start_url: '/',
        theme_color: '#05070f',
        background_color: '#05070f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    cssMinify: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/[\\/]node_modules[\\/]date-fns/.test(id)) return 'date-fns';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)/.test(id)) return 'vendor';
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      // forward /api requests to local dev API server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
