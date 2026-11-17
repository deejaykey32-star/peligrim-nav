const SHELL_CACHE = 'pilgrim-shell-v3';
const CONFIG_CACHE = 'pilgrim-config-v3';
const TILE_CACHE = 'pilgrim-tiles-v1';
const MAX_TILES = 900;

const APP_SHELL_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const results = await Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' })
            .then((res) => {
              if (res && (res.ok || res.type === 'opaque')) {
                return cache.put(url, res);
              }
              return null;
            })
            .catch(() => null)
        )
      );
      return results;
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const allowed = new Set([SHELL_CACHE, CONFIG_CACHE, TILE_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!allowed.has(key)) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

function isTileRequest(url) {
  return (
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('tile.opentopomap.org')
  );
}

function isFontRequest(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    const excess = keys.length - MAX_TILES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (_err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      return (await shell.match('./index.html')) || (await shell.match('./'));
    }
    throw _err;
  }
}

async function cacheFirstTiles(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request, { mode: 'cors' });
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      trimTileCache();
    }
    return response;
  } catch (_err) {
    return new Response('', { status: 503, statusText: 'Offline tile unavailable' });
  }
}

async function cacheFirstGeneral(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (isTileRequest(url)) {
    event.respondWith(cacheFirstTiles(event.request));
    return;
  }

  if (url.pathname.endsWith('route-config.json')) {
    event.respondWith(networkFirstWithCache(event.request, CONFIG_CACHE));
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirstWithCache(event.request, SHELL_CACHE));
    return;
  }

  if (isFontRequest(url)) {
    event.respondWith(cacheFirstGeneral(event.request, SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          fetch(event.request)
            .then((fresh) => {
              if (fresh && fresh.ok) cache.put(event.request, fresh);
            })
            .catch(() => null);
          return cached;
        }
        const fresh = await fetch(event.request);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
          await cache.put(event.request, fresh.clone());
        }
        return fresh;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'GET_TILE_COUNT') {
    caches.open(TILE_CACHE).then((cache) => cache.keys()).then((keys) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ count: keys.length });
      }
    });
    return;
  }

  if (event.data.type === 'CLEAR_TILE_CACHE') {
    caches.delete(TILE_CACHE).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ cleared: true });
      }
    });
  }
});
