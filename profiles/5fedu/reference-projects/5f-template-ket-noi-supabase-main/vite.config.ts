import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      // Devtools không bắt buộc pre-bundle — tránh 504 Outdated Optimize Dep khi deps/cache đổi
      optimizeDeps: {
        exclude: ['@tanstack/react-query-devtools'],
      },
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      build: {
        chunkSizeWarningLimit: 3500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('framer-motion')) return 'vendor-framer';
              if (id.includes('@tanstack')) return 'vendor-tanstack';
              if (id.includes('recharts')) return 'vendor-recharts';
              if (id.includes('jspdf')) return 'vendor-jspdf';
              if (id.includes('lucide-react')) return 'vendor-icons';
            },
          },
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg'],
          manifest: {
            name: '5F template',
            short_name: '5F template',
            description: 'Ứng dụng mẫu quản lý ERP',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
            start_url: '/',
            icons: [
              {
                src: '/favicon.svg',
                sizes: 'any',
                type: 'image/svg+xml',
                purpose: 'any',
              },
              {
                src: '/favicon.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any maskable',
              },
              {
                src: '/favicon.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable',
              },
            ],
          },
          minify: true,
          workbox: {
            mode: 'production',
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MiB (chunk chính ~5.8 MB)
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
            ],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
