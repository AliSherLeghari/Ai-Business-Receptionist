import { APP_VERSION, BUILD_ID } from './version.js';
import { ENGINE_VERSION } from './receptionist.js';

// Diagnostics describe the running modules and the controlling worker separately.
// No business data is read, posted to the worker, or sent to a server.
export function initializePWA(offlineMessage) {
  const info = document.querySelector('#build-info');
  const update = document.querySelector('#reload-update');
  const offline = document.querySelector('#offline-status');
  const base = `App ${APP_VERSION} · build ${BUILD_ID} · engine ${ENGINE_VERSION}`;
  info.textContent = `${base} · worker: checking`;
  update.addEventListener('click', () => location.reload()); // Owner beforeunload protects unsaved forms.
  if (!('serviceWorker' in navigator)) {
    info.textContent = `${base} · worker: unsupported`;
    offline.textContent = 'Offline caching is unavailable in this browser.';
    return;
  }
  let request = 0;
  async function inspect() {
    const sequence = ++request;
    const controller = navigator.serviceWorker.controller;
    if (!controller) { info.textContent = `${base} · worker: not controlling this page`; return; }
    const data = await new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1500);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      controller.postMessage({ type: 'GET_BUILD' }, [channel.port2]);
    });
    if (sequence !== request) return;
    const known = data?.type === 'BUILD' && typeof data.build === 'string';
    info.textContent = `${base} · worker: ${known ? data.build : 'legacy / unidentified'}`;
    update.hidden = !(known && data.build !== BUILD_ID);
    if (!update.hidden) offline.textContent = 'A newer offline release is ready. Reload when your edits are saved.';
    else if (known) offline.textContent = offlineMessage;
    else offline.textContent = 'An older worker controls this page. Checking for an update; do not clear browser data.';
  }
  navigator.serviceWorker.addEventListener('controllerchange', inspect);
  inspect();
  // Bypass HTTP cache for worker updates. Install verifies every asset before it
  // activates. Activation changes future requests, never reloads an editing tab.
  navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), { updateViaCache: 'none' }).then(async registration => {
    const watch = worker => worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated') inspect();
      if (worker.state === 'redundant') offline.textContent = 'Update could not be verified. The previous offline release is preserved; retry online later.';
    });
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    try { await registration.update(); } catch { /* Offline operation uses the installed release. */ }
    await inspect();
  }).catch(() => { offline.textContent = 'Offline update unavailable. Text still works if cached; retry online using HTTPS or localhost.'; });
}
