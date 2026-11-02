import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
