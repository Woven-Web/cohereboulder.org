import { expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { companionRoute, type CompanionEnv } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });

const device = '00000000-0000-4000-8000-000000000002';
const call = (env: CompanionEnv, method: string, body: object, ip = '203.0.113.7') => companionRoute(new Request('https://cohereboulder.org/api/companion/subscriptions', {
    method, headers: { Origin: 'https://cohereboulder.org', 'CF-Connecting-IP': ip }, body: JSON.stringify({ device_id: device, ...body }) }), env);
const fresh = () => ({ cohere: testD1(['../migrations/0010_companion.sql']) as unknown as D1Database, VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x', VAPID_SUBJECT: 'mailto:a@b.test' }) as CompanionEnv;

it.each([
    ['DELETE', {}],
    ['DELETE', { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'a', auth: 'b' }],
    ['PATCH', { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'a', auth: 'b', language: 'es' }],
])('%s %j on subscriptions is rate limited like POST, before any write', async (method, body) => {
    const env = fresh();
    const prepare = env.cohere.prepare.bind(env.cohere);
    let writes = 0;
    env.cohere.prepare = ((sql: string) => { if (/^\s*(DELETE|UPDATE)\s+(FROM\s+)?companion_subscriptions/i.test(sql)) writes++; return prepare(sql); }) as typeof env.cohere.prepare;
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) statuses.push((await call(env, method, body)).status);
    expect(statuses.filter(s => s === 429).length).toBe(10);
    expect(statuses.slice(30).every(s => s === 429)).toBe(true);
    expect(writes).toBe(30);
    // Another caller is unaffected.
    expect((await call(env, method, body, '198.51.100.9')).status).not.toBe(429);
});
