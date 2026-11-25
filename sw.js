/* Service worker. It caches nothing and never answers page requests (visitors always get the newest site); it only
 * makes the site installable and shows phone notifications (follow / like / new role) sent by the send-push function. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(_){}
  const title=String(d.title||'My Film Archive').slice(0,80),body=String(d.body||'').slice(0,200);
  e.waitUntil(self.registration.showNotification(title,{body,icon:'assets/icons/icon-192.png',badge:'assets/icons/icon-192.png',tag:String(d.tag||'film'),dir:'rtl',lang:'fa',data:{url:'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of all){if('focus' in c){await c.focus();return;}}
    await self.clients.openWindow(self.registration.scope);
  })());
});
