/* Public shell only. No API, admin, auth, reply, subscription or private caching. */
const CACHE = 'cohere-companion-v1';
const SHELL = ['/today', '/manifest.webmanifest', '/cohere-icon-192.png', '/cohere-icon-512.png', '/cohere-icon-180.png'];
self.addEventListener('install', event => {
 event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const shell = await fetch('/today', { credentials: 'omit', cache: 'reload' });
  if (!shell.ok) throw new Error('shell unavailable');
  const html = await shell.clone().text();
  await cache.put('/today', shell);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match => match[1]);
  await cache.addAll([...SHELL.slice(1), ...new Set(assets)]);
  await self.skipWaiting();
 })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
 for (const key of await caches.keys()) if (key.startsWith('cohere-companion-') && key !== CACHE) await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 const req = event.request, url = new URL(req.url);
 if (req.method !== 'GET' || url.origin !== self.location.origin || url.search || /^(\/api|\/admin|\/xrpc|\/unsubscribe|\/login|\/join)(\/|$)/.test(url.pathname)) return;
 if (req.mode === 'navigate' && ['/today','/calendar','/quests','/more'].includes(url.pathname)) {
  event.respondWith(fetch(req).catch(() => caches.match('/today')));return;
 }
 if (url.pathname.startsWith('/assets/') || SHELL.slice(1).includes(url.pathname)) event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
function safePath(path) {
 return typeof path === 'string' && (/^\/(today|calendar|quests|more)$/.test(path) || /^\/events\/[a-zA-Z0-9:%_-]+\/[a-zA-Z0-9_-]+$/.test(path)) ? path : '/today';
}
self.addEventListener('push', event => {
 let data;try { data = event.data.json(); } catch { return; }
 if (!data || typeof data.title !== 'string') return;
 event.waitUntil(self.registration.showNotification(data.title.slice(0,200), { body: typeof data.body === 'string' ? data.body.slice(0,1000) : '', icon:'/cohere-icon-192.png', badge:'/cohere-icon-192.png', tag: typeof data.tag === 'string' ? data.tag : undefined, data:{url:safePath(data.url)} }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();const path=safePath(event.notification.data?.url);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows) if(new URL(client.url).origin===self.location.origin && !/^\/(admin|api)(\/|$)/.test(new URL(client.url).pathname)){await client.navigate(path);return client.focus();}
  return self.clients.openWindow(path);
 })());
});
