import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const SELF_UNREGISTER_SW_SCRIPT = `
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      try {
        const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientsList) {
          client.navigate(client.url);
        }
      } catch (e) {}
    })()
  );
});
`;

const STALE_ASSET_RECOVERY_SCRIPT = `
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {}
  import('/src/main.tsx').catch(() => {
    window.location.reload();
  });
})();
`;

function netlifyDevFunctionsPlugin() {
  return {
    name: 'netlify-dev-functions-fallback',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const rawUrl = req.url || '';
        const url = rawUrl.split('?')[0];

        // 1. Prevent stale Service Workers or cached dist/index.html asset requests from blanking the dev preview
        if (url === '/sw.js' || url === '/registerSW.js' || url.startsWith('/workbox-')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(SELF_UNREGISTER_SW_SCRIPT);
          return;
        }

        if (url.startsWith('/assets/') && url.endsWith('.js')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          if (url.includes('/assets/index-')) {
            res.end(STALE_ASSET_RECOVERY_SCRIPT);
          } else {
            res.end('export default {};');
          }
          return;
        }

        if (url.startsWith('/assets/') && url.endsWith('.css')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end('/* dev fallback */');
          return;
        }

        // 2. Local fallback for Netlify functions & API endpoints in Vite dev server
        if (
          (url.startsWith('/.netlify/functions/') || url.startsWith('/api/')) &&
          !url.startsWith('/api/_lib/') &&
          !url.endsWith('.js') &&
          !url.endsWith('.ts')
        ) {
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
      selfDestroying: true,
      injectRegister: null,
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false
      },
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
    hmr: false
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
})
