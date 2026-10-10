// Release metadata is injected by build-release.mjs; do not deploy this template.
const RELEASE = __RELEASE__;
const PREFIX = 'reception-desk-shell-';
const CACHE = PREFIX + RELEASE.build;
const assets = new Map(RELEASE.assets.map(asset => [new URL(asset.url, self.registration.scope).href, asset]));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch from the network/HTTP revalidation path, not a fresh legacy HTTP
    // cache. Never activate a partially deployed or stale set of source files.
    const verified = await Promise.all([...assets].map(async ([url, asset]) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok || response.redirected) throw new Error(`Unusable release asset: ${asset.url}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
      const sha = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (sha !== asset.sha256) throw new Error(`Release asset mismatch: ${asset.url}`);
      return [url, response];
    }));
    const cache = await caches.open(CACHE);
    try { await Promise.all(verified.map(([url, response]) => cache.put(url, response))); }
    catch (error) { await caches.delete(CACHE); throw error; }
    // Legacy pages do not implement an update handshake. Activate only after the
    // complete release is verified; do not navigate clients or touch their data.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain the last release for already-open documents using immutable URLs.
    // Other applications' caches and all localStorage records are untouched.
    const ours = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
    const previous = ours.at(-1);
    await Promise.all(ours.filter(key => key !== previous).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_BUILD') event.ports[0]?.postMessage({ type: 'BUILD', version: RELEASE.version, build: RELEASE.build });
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Only document query strings are interchangeable. Module/release URLs are
  // exact identities, never stripped to an older unversioned cache key.
  if (event.request.mode === 'navigate') { url.search = ''; url.hash = ''; }
  if (assets.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(url.href)) || new Response('Offline release is incomplete. Reconnect and reload.', { status: 503 })));
    return;
  }
  const releases = new URL('./assets/', self.registration.scope).pathname;
  if (url.pathname.startsWith(releases)) {
    event.respondWith((async () => {
      for (const key of (await caches.keys()).filter(key => key.startsWith(PREFIX))) {
        const cached = await (await caches.open(key)).match(event.request);
        if (cached) return cached;
      }
      return fetch(event.request);
    })());
  }
});
