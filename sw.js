/* Minimal service worker: it only makes the site installable as an app. It caches nothing and never answers
 * requests itself, so visitors always get the newest version of the site. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
