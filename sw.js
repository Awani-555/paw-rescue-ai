const CACHE_NAME = 'pawrescue-fcf13daa35f9';
// Relative to sw.js's own location, not the domain root. This file is
// served from whatever subpath the app is deployed under (e.g. GitHub
// Pages project sites), and cache.addAll() rejects entirely if any one
// of these 404s, which would silently break the service worker install.
const PRECACHE_URLS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Network-first for API calls: always prefer fresh data, fall back to
// whatever was last cached (e.g. the first aid library) when offline.
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'You are offline.' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Cache-first for static assets (JS/CSS/images): the first aid library's
// data ships inside the app bundle, so caching the bundle keeps it available offline.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await caches.match('./index.html');
    return fallback || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});

// Two alert tiers share this one handler. Tier 2 (registered responders)
// payloads carry detail: 'full' with species/severity; Tier 1 (anonymous
// public opt-in) payloads carry detail: 'soft' with nothing but a case id
// and a generic message, that filtering already happened server-side in
// alertNearbyVolunteers.js, this handler just renders whatever it receives.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    payload = { title: 'PawRescue AI', body: event.data.text() };
  }

  const title = payload.title || 'PawRescue AI';
  const options = {
    body: payload.body || '',
    tag: payload.caseId || undefined,
    data: { url: payload.url || './' },
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'pawrescue-notification-click', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
