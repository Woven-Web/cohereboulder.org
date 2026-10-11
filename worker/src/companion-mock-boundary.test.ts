import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { companionRoute, runCompanionCron, type CompanionEnv } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });

// The loopback mock and any pre-launch start date are honoured only behind an
// explicit local-only flag the wrangler configs never set.
const mockOrigin = 'http://127.0.0.1:10049';
const device = '00000000-0000-4000-8000-000000000002';
let env: CompanionEnv, sent: ReturnType<typeof vi.fn>, keys: { publicKey: string; privateKey: string; subject: string; endpoint: string; p256dh: string; auth: string };

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { createPushReceiver } = await import('../../scripts/pwa-push-receiver.mjs');
    keys = createPushReceiver(mockOrigin).fixture;
    env = { cohere: testD1(['../migrations/0010_companion.sql']) as unknown as D1Database, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: keys.subject } as CompanionEnv;
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device, keys.endpoint, keys.p256dh, keys.auth, '2026-10-01T00:00:00Z').run();
    for (const d of ['2026-10-14', '2026-10-15']) await env.cohere.prepare("INSERT INTO companion_daily(date,title,body) VALUES (?1,'T','B')").bind(d).run();
    sent = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', sent);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const subscribe = async (endpoint: string) => {
    const response = await companionRoute(new Request('https://cohereboulder.org/api/companion/subscriptions', { method: 'POST', headers: { Origin: 'https://cohereboulder.org' },
        body: JSON.stringify({ device_id: '00000000-0000-4000-8000-000000000009', endpoint, p256dh: keys.p256dh, auth: keys.auth, language: 'en' }) }), env);
    return response.status;
};

// Production-like env: whatever mock values are configured, none is honoured.
it.each([[mockOrigin], ['false'], ['junk'], ['http://evil.example'], ['http://127.0.0.1:10049/x']])('without the local-only flag, mock value %j is ignored for endpoints', async value => {
    env.COMPANION_LOCAL_PUSH_MOCK = value;
    expect(await subscribe(keys.endpoint)).toBe(400);
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(0); // unsafe endpoint refused at delivery
});

it.each([['false'], ['junk'], [mockOrigin]])('without the local-only flag, mock value %j does not disable the deadline', async value => {
    env.COMPANION_LOCAL_PUSH_MOCK = value;
    env.COMPANION_LOCAL_TEST_MODE = 'false';
    // The wall clock (Date) is far past the 12:00Z slot's five-minute window.
    vi.setSystemTime(new Date('2026-10-15T12:30:00Z'));
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(0);
});

it.each([['false'], ['junk'], ['1'], ['TRUE']])('local-only flag %j alone is not the capability', async flag => {
    env.COMPANION_LOCAL_TEST_MODE = flag;
    env.COMPANION_LOCAL_PUSH_MOCK = mockOrigin;
    expect(await subscribe(keys.endpoint)).toBe(400);
});

it('with the flag and an exact loopback origin the mock works and bypasses the deadline', async () => {
    env.COMPANION_LOCAL_TEST_MODE = 'true';
    env.COMPANION_LOCAL_PUSH_MOCK = mockOrigin;
    expect(await subscribe(keys.endpoint + '?new')).toBe(200);
    vi.setSystemTime(new Date('2026-10-15T12:30:00Z'));
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(2); // the seeded device and the one just added
});

it('with the flag but a non-loopback or malformed origin, the deadline still applies', async () => {
    env.COMPANION_LOCAL_TEST_MODE = 'true';
    env.COMPANION_LOCAL_PUSH_MOCK = 'http://evil.example:10049';
    vi.setSystemTime(new Date('2026-10-15T12:30:00Z'));
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(0);
});

// Launch floor.
it('COMPANION_START_DATE="2026-10-14" sends nothing on the 14th', async () => {
    env.COMPANION_START_DATE = '2026-10-14';
    env.COMPANION_LOCAL_PUSH_MOCK = mockOrigin; // would be honoured only locally
    await runCompanionCron(env, new Date('2026-10-14T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(0);
});

it('the floor leaves later configured start dates alone', async () => {
    env.COMPANION_START_DATE = '2026-10-16';
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(0);
});

it('the floor may be lowered only under the local capability', async () => {
    Object.assign(env, { COMPANION_START_DATE: '2026-10-14', COMPANION_LOCAL_TEST_MODE: 'true', COMPANION_LOCAL_PUSH_MOCK: mockOrigin });
    await env.cohere.prepare('UPDATE companion_subscriptions SET endpoint=?1').bind(keys.endpoint).run();
    await runCompanionCron(env, new Date('2026-10-14T12:00:00Z'));
    expect(sent.mock.calls.length).toBe(1);
});
