/* Public shell only. No API, admin, auth, reply, subscription or private caching. */
const CACHE = 'cohere-companion-v1';
const SHELL = ['/today', '/manifest.webmanifest', '/cohere-icon-192.png', '/cohere-icon-512.png', '/cohere-icon-180.png', '/fonts/newsreader-normal.woff2', '/fonts/newsreader-italic.woff2', '/fonts/ibm-plex-mono-normal.woff2', '/fonts/lora-700.woff2', '/fonts/lora-italic-500.woff2', '/fonts/poppins-400.woff2', '/fonts/poppins-500.woff2', '/fonts/poppins-600.woff2', '/fonts/poppins-700.woff2'];
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
 if (req.mode === 'navigate' && ['/today','/calendar','/quests','/more','/more/notifications','/tomorrow'].includes(url.pathname)) {
  event.respondWith(fetch(req).catch(() => caches.match('/today')));return;
 }
 if (url.pathname.startsWith('/assets/') || SHELL.slice(1).includes(url.pathname)) event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
function safePath(path) {
 return typeof path === 'string' && (/^\/(today|calendar|quests|more|tomorrow)$/.test(path) || path === '/more/notifications' || /^\/events\/[a-zA-Z0-9:%_-]+\/[a-zA-Z0-9_-]+$/.test(path)) ? path : '/today';
}
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Android action buttons: only the two we know, with plain-text titles.
function safeActions(actions) {
 return Array.isArray(actions) ? actions.filter(a => a && (a.action === 'open' || a.action === 'settings') && typeof a.title === 'string').slice(0, 2).map(a => ({ action: a.action, title: a.title.slice(0, 40) })) : [];
}
self.addEventListener('push', event => {
 let data;try { data = event.data.json(); } catch { return; }
 if (!data || typeof data.title !== 'string') return;
 const device = typeof data.device === 'string' && DEVICE.test(data.device) ? data.device : null;
 const options = { body: typeof data.body === 'string' ? data.body.slice(0,1000) : '', icon:'/cohere-icon-192.png', badge:'/cohere-icon-192.png', tag: typeof data.tag === 'string' ? data.tag : undefined, data: device ? {url:safePath(data.url), device} : {url:safePath(data.url)} };
 const actions = safeActions(data.actions);
 if (actions.length) options.actions = actions;
 event.waitUntil((async () => {
  await self.registration.showNotification(data.title.slice(0,200), options);
  // Tell the Worker the phone really showed it: the push service accepting a message proves less than that.
  if (device) try { await fetch('/api/notify/shown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: device }), keepalive: true }); } catch {}
 })());
});
self.addEventListener('notificationclick', event => {
 event.notification.close();const path=event.action==='settings'?'/more/notifications':safePath(event.notification.data?.url);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows) if(new URL(client.url).origin===self.location.origin && !/^\/(admin|api)(\/|$)/.test(new URL(client.url).pathname)){await client.navigate(path);return client.focus();}
  return self.clients.openWindow(path);
 })());
});
