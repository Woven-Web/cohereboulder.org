import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ADMIN_PAGE } from './admin-page';
function worker() {
    const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
    const navigate = vi.fn(async () => { }), focus = vi.fn(async () => { }), openWindow = vi.fn(async () => { }), showNotification = vi.fn(async () => { }), respondWith = vi.fn();
    const cache = { put: vi.fn(async () => { }), addAll: vi.fn(async () => { }) };
    const fetch = vi.fn(async () => new Response('<script src="/assets/app-test.js"></script><link href="/assets/app-test.css" rel="stylesheet">'));
    const caches = { open: vi.fn(async () => cache), match: vi.fn(async () => new Response('offline public shell')), keys: vi.fn(async () => ['cohere-companion-old', 'other-app']), delete: vi.fn(async () => { }) };
    const self = { location: { origin: 'https://cohereboulder.org' }, addEventListener: (name: string, fn: (event: Record<string, unknown>) => void) => handlers[name] = fn, skipWaiting: async () => { }, registration: { showNotification }, clients: { claim: async () => { }, matchAll: async () => [{ url: 'https://cohereboulder.org/today', navigate, focus }], openWindow } };
    runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL });
    return { handlers, navigate, focus, openWindow, showNotification, respondWith, caches, cache };
}
it('service worker never intercepts private, API, foreign, query or non-GET requests', () => {
    const w = worker();
    for (const path of ['/api/companion/today', '/api/events', '/admin', '/api/admin/companion/replies', '/xrpc/read', '/unsubscribe', '/login', '/join/token', '/today?private=x', 'https://evil.test/assets/app.js']) {
        w.handlers.fetch({ request: { method: 'GET', url: path.startsWith('https') ? path : 'https://cohereboulder.org' + path, mode: 'navigate' }, respondWith: w.respondWith });
    }
    w.handlers.fetch({ request: { method: 'POST', url: 'https://cohereboulder.org/today', mode: 'navigate' }, respondWith: w.respondWith });
    expect(w.respondWith).not.toHaveBeenCalled();
});
it('service worker preloads built shell assets; offline navigation has a public fallback', async () => {
    const w = worker();
    let task: Promise<void> | undefined;
    w.handlers.install({ waitUntil: (promise: Promise<void>) => task = promise });
    await task;
    expect(w.cache.put).toHaveBeenCalledWith('/today', expect.any(Response));
    expect(w.cache.addAll.mock.calls[0][0]).toContain('/assets/app-test.js');
});
it('notification clicks fall back to Today for foreign and private destinations and focus existing client', async () => {
    const w = worker();
    for (const url of ['https://evil.test', '/admin', '/api/admin/replies', '//evil.test', '/today?private=x']) {
        let task: Promise<void> | undefined;
        w.handlers.notificationclick({ notification: { close: vi.fn(), data: { url } }, waitUntil: (promise: Promise<void>) => task = promise });
        await task;
        expect(w.navigate).toHaveBeenLastCalledWith('/today');
    }
    expect(w.focus).toHaveBeenCalledTimes(5);
    expect(w.openWindow).not.toHaveBeenCalled();
});
it('push trims payloads, isolates safe route data and ignores malformed messages', async () => {
    const w = worker();
    let task: Promise<void> | undefined;
    w.handlers.push({ data: { json: () => ({ title: 'Local', body: 'body', url: '/api/admin', tag: 'local' }) }, waitUntil: (promise: Promise<void>) => task = promise });
    await task;
    expect(w.showNotification).toHaveBeenCalledWith('Local', expect.objectContaining({ body: 'body', data: { url: '/today' } }));
    w.handlers.push({ data: { json: () => { throw new Error('invalid'); } } });
    expect(w.showNotification).toHaveBeenCalledTimes(1);
});
it('generated admin script parses after bilingual companion interpolation', () => {
    // HTML has a single script block; syntax checking is hermetic and executes no requests.
    const script = ADMIN_PAGE.split('<script>')[1].split('</script>')[0];
    expect(() => new Function(script)).not.toThrow();
});
