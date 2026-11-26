// Jaystarbliss Dynamic Institute — Production PWA Service Worker
// Caches the app shell, compiled JS/CSS assets, fonts, and images using Stale-While-Revalidate
// while strictly bypassing Vite dev paths, Firestore/Firebase Auth streams, and API routes.

const APP_SHELL_CACHE = 'jaystar-pwa-shell-v5';
const STATIC_ASSET_CACHE = 'jaystar-pwa-assets-v5';
const FONT_CACHE = 'jaystar-pwa-fonts-v5';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/logo.png',
  '/favicon.png',
  '/favicon.ico',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
          )
        )
      )
      .catch(() => null)
  );
});

self.addEventListener('activate', (event) => {
  const allowedCaches = new Set([APP_SHELL_CACHE, STATIC_ASSET_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!allowedCaches.has(key)) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldBypassRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  // Never intercept dev preview hosts or Vite dev server module streams
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app')
  ) {
    return true;
  }

  const pathname = url.pathname;
  if (
    pathname.startsWith('/src/') ||
    pathname.startsWith('/@vite') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.netlify/') ||
    pathname.startsWith('/coding-lab-editor/')
  ) {
    return true;
  }

  // Never cache Firebase Auth, Firestore RPCs, or Paystack APIs
  if (
    host.includes('firestore.googleapis.com') ||
    host.includes('identitytoolkit.googleapis.com') ||
    host.includes('securetoken.googleapis.com') ||
    host.includes('firebaseinstallations.googleapis.com') ||
    host.includes('paystack.co')
  ) {
    return true;
  }

  return false;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (shouldBypassRequest(request, url)) {
    return;
  }

  // 1. Google Fonts (Stale-While-Revalidate)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              cache.put(request, response.clone()).catch(() => null);
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Only handle same-origin requests beyond fonts
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. Navigation requests (Network-First with instant cached app-shell fallback)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches
              .open(APP_SHELL_CACHE)
              .then((cache) => cache.put('/index.html', copy))
              .catch(() => null);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL_CACHE);
          const cachedShell =
            (await cache.match('/index.html')) || (await cache.match('/'));
          return cachedShell || Response.error();
        })
    );
    return;
  }

  // 3. Compiled static assets (/assets/*, images, manifest, icons) — Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|webmanifest)$/i.test(
      url.pathname
    );

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone()).catch(() => null);
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })
    );
  }
});
