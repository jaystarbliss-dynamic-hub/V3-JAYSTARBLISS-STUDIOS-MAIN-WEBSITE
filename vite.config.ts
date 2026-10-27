import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function netlifyDevFunctionsPlugin() {
  return {
    name: 'netlify-dev-functions-fallback',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && (req.url.startsWith('/.netlify/functions/') || req.url.startsWith('/api/'))) {
          const url = req.url.split('?')[0];
          res.setHeader('Content-Type', 'application/json');
          if (url.includes('class-schedules')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ schedules: [], fallback: true }));
            return;
          }
          if (url.includes('student-examinations')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ exams: [], fallback: true }));
            return;
          }
          if (url.includes('academic-assignments')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ assignments: [], fallback: true }));
            return;
          }
          if (url.includes('academic-students')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ students: [], fallback: true }));
            return;
          }
          if (url.includes('academic-schools')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ schools: [], fallback: true }));
            return;
          }
          if (url.includes('academic-milestones')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ milestones: [], fallback: true }));
            return;
          }
          if (url.includes('academic-assessments') || url.includes('academic-attendance')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ records: [], fallback: true }));
            return;
          }
          if (url.includes('portal-access-login')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ fallback: true, error: 'Direct resolver active' }));
            return;
          }
          if (url.includes('examination-passcode') || url.includes('examination-attempt')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ fallback: true }));
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, fallback: true }));
          return;
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    netlifyDevFunctionsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon.png',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'favicon-96x96.png',
        'favicon-144x144.png',
        'favicon-192x192.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
        'apple-touch-icon.png',
        'site.webmanifest',
        'robots.txt',
        'sitemap.xml'
      ],
      manifest: {
        name: 'Jaystarbliss Studios',
        short_name: 'Jaystarbliss',
        description: 'Tech Education, Digital Innovation & Creative Solutions for Kids and Businesses in Lagos, Nigeria.',
        theme_color: '#0d0f17',
        background_color: '#0d0f17',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        id: '/',
        categories: ['education', 'technology', 'productivity'],
        icons: [
          {
            src: '/favicon-48x48.png',
            sizes: '48x48',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/favicon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/favicon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,woff2,ttf}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cdn-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase/')) return 'firebase'
          if (id.includes('node_modules/three/') || id.includes('node_modules/@react-three/')) return 'three'
          if (id.includes('node_modules/recharts/')) return 'charts'
          if (
            id.includes('node_modules/react-quill/') ||
            id.includes('node_modules/react-quill-new/') ||
            id.includes('node_modules/react-markdown/')
          ) return 'editor'
          if (id.includes('node_modules/jspdf/')) return 'pdf'
          return undefined
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: true
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
})
