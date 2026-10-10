// Bump this version whenever app-shell files change. New workers wait until old
// tabs close, avoiding mixed module versions. Business data never enters caches.
const CACHE = 'reception-desk-shell-v2';
const ASSETS = ['./', './index.html', './demo.html', './js/demo.js', './js/demo-knowledge.js', './js/matching.js', './js/voice.js', './styles.css', './js/app.js', './js/model.js', './js/storage.js', './js/receptionist.js', './js/conversations.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const urls = ASSETS.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('reception-desk-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cache-first serves a consistent version of the entire app, including HTML.
  url.search = ''; url.hash = '';
  if (!urls.includes(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.href)) || fetch(event.request)));
});
