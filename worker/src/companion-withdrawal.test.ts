import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { runCompanionCron, type CompanionEnv } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });

// Deleting a day's content withdraws it: a slot that was already claimed must
// not keep sending to the remaining devices.
const mockOrigin = 'http://127.0.0.1:10049';
const ids = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
let env: CompanionEnv, sent: ReturnType<typeof vi.fn>, keys: { publicKey: string; privateKey: string; subject: string; endpoint: string; p256dh: string; auth: string };

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { createPushReceiver } = await import('../../scripts/pwa-push-receiver.mjs');
    keys = createPushReceiver(mockOrigin).fixture;
    env = {
        cohere: testD1(['../migrations/0010_companion.sql']) as unknown as D1Database,
        VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: keys.subject,
        COMPANION_LOCAL_TEST_MODE: 'true', COMPANION_LOCAL_PUSH_MOCK: mockOrigin,
    } as CompanionEnv;
    for (const id of ids)
        await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(id, keys.endpoint + '?d=' + id, keys.p256dh, keys.auth, '2026-10-01T00:00:00Z').run();
    sent = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', sent);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const payload = JSON.stringify({ title: 't', body: 'b', url: '/today', tag: 'x' });
const seedMarker = (slot: string) => env.cohere.prepare("INSERT INTO companion_ledger(date,slot,recipient,claimed_at,payload_en,payload_es) VALUES ('2026-10-15',?1,'*','2026-10-15T00:00:00Z',?2,?2)").bind(slot, payload).run();

it.each([['practice', 12], ['events', 15], ['question', 21]])('%s: a claimed slot sends nothing once its daily row is deleted (continuation)', async (slot, hour) => {
    await seedMarker(slot);
    await runCompanionCron(env, new Date(`2026-10-15T${hour}:01:00Z`));
    expect(sent.mock.calls.length).toBe(0);
});

it('control: a claimed slot with its daily row still continues', async () => {
    await env.cohere.prepare("INSERT INTO companion_daily(date,title,body) VALUES ('2026-10-15','T','B')").run();
    await seedMarker('practice');
    await runCompanionCron(env, new Date('2026-10-15T12:01:00Z'));
    expect(sent.mock.calls.length).toBeGreaterThan(0);
});

it('deleting the daily row mid-batch stops the remaining deliveries', async () => {
    await env.cohere.prepare("INSERT INTO companion_daily(date,title,body) VALUES ('2026-10-15','T','B')").run();
    await seedMarker('practice');
    const count = (await env.cohere.prepare('SELECT COUNT(*) AS n FROM companion_subscriptions').first<{ n: number }>())!.n;
    expect(count).toBeGreaterThan(1);
    sent.mockImplementation(async () => { await env.cohere.prepare('DELETE FROM companion_daily').run(); return new Response(null, { status: 201 }); });
    await runCompanionCron(env, new Date('2026-10-15T12:01:00Z'));
    expect(sent.mock.calls.length).toBe(1);
});
