const CACHE_NAME = 'correction-note-v3';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './styles/tokens.css',
  './styles/base.css',
  './styles/glass.css',
  './styles/motion.css',
  './styles/layout.css',
  './styles/components.css',
  './styles/cards.css',
  './styles/pages.css',
  './styles/content.css',
  './utils/db.js',
  './utils/review.js',
  './utils/ai.js',
  './utils/glass.js',
  './utils/motion.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(urlsToCache.map(url =>
        cache.add(url).catch(err => console.error(`[SW] 缓存失败: ${url}`, err))
      )))
      .catch(err => console.error('[SW] 打开缓存失败', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k.startsWith('correction-note-'))
          .map(k => caches.delete(k).then(() => console.log(`[SW] 删除旧缓存: ${k}`)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
