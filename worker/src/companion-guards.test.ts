import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { runCompanionCron, type CompanionEnv } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });

// Nothing may be sent before there is content, before the gathering, or while
// COMPANION_PUSH_PAUSED is "true" — even with push fully configured and a
// subscriber on file.
const device = '00000000-0000-4000-8000-000000000002';
let env: CompanionEnv, sent: ReturnType<typeof vi.fn>;
const mockOrigin = 'http://127.0.0.1:10049';

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { createPushReceiver } = await import('../../scripts/pwa-push-receiver.mjs');
    const keys = createPushReceiver(mockOrigin).fixture;
    env = {
        cohere: testD1(['../migrations/0010_companion.sql']) as unknown as D1Database,
        VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: keys.subject,
        COMPANION_LOCAL_PUSH_MOCK: mockOrigin, REGENOS_BASE_URL: 'http://127.0.0.1:10048', REGENOS_COLLECTIVE_DID: 'did:plc:mockscene',
    } as CompanionEnv;
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)')
        .bind(device, keys.endpoint, keys.p256dh, keys.auth, '2026-10-01T00:00:00Z').run();
    // A public event on both sides of the gathering start, so the events slot has something to say.
    sent = vi.fn(async (url: string) => url.includes('/xrpc/')
        ? Response.json({ events: ['2026-10-14T20:00:00Z', '2026-10-15T20:00:00Z', '2026-10-16T20:00:00Z'].map((startsAt, i) => ({ uri: `at://did:plc:mockscene/community.lexicon.calendar.event/e${i}`, value: { name: `event ${i}`, startsAt, status: 'scheduled' } })) })
        : new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', sent);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const pushes = () => sent.mock.calls.filter(([url]) => !String(url).includes('/xrpc/')).length;
const ledger = async () => (await env.cohere.prepare('SELECT COUNT(*) AS n FROM companion_ledger').first<{ n: number }>())!.n;
const addDaily = (date: string) => env.cohere.prepare('INSERT INTO companion_daily(date,title,body,question) VALUES (?1,?2,?3,?4)').bind(date, 'Practice', 'Body', 'Question').run();

it('is a no-op in every slot when companion_daily has no row for the date', async () => {
    await addDaily('2026-10-16'); // content exists, but for another day
    for (const hour of [12, 15, 21]) await runCompanionCron(env, new Date(`2026-10-15T${hour}:00:00Z`));
    expect(pushes()).toBe(0);
    expect(await ledger()).toBe(0);
});

it('sends nothing before 2026-10-15 America/Denver, even with content and events', async () => {
    await addDaily('2026-10-14');
    for (const hour of [12, 15, 21]) await runCompanionCron(env, new Date(`2026-10-14T${hour}:00:00Z`));
    // 05:00Z on the 15th is still the 14th in Denver (MDT, UTC-6).
    await runCompanionCron(env, new Date('2026-10-15T05:00:00Z'));
    expect(pushes()).toBe(0);
    expect(await ledger()).toBe(0);
});

it('sends on the first day once content exists (control for the guards above)', async () => {
    await addDaily('2026-10-15');
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(pushes()).toBe(1);
});

it('COMPANION_PUSH_PAUSED="true" stops every scheduled push, however complete the content', async () => {
    await addDaily('2026-10-15');
    env.COMPANION_PUSH_PAUSED = 'true';
    for (const hour of [12, 15, 21]) await runCompanionCron(env, new Date(`2026-10-15T${hour}:00:00Z`));
    expect(pushes()).toBe(0);
    expect(await ledger()).toBe(0);
    expect((await env.cohere.prepare('SELECT failure_count FROM companion_subscriptions').first<{ failure_count: number }>())!.failure_count).toBe(0);
});

it('only the exact string "true" pauses; "false" or unset sends', async () => {
    await addDaily('2026-10-15');
    env.COMPANION_PUSH_PAUSED = 'false';
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    expect(pushes()).toBe(1);
});

it('a pause does not stop retention cleanup after the gathering', async () => {
    await env.cohere.prepare('INSERT INTO companion_replies(device_id,date,reply,created_at) VALUES (?1,?2,?3,?4)').bind(device, '2026-10-20', 'hi', '2026-10-20').run();
    env.COMPANION_PUSH_PAUSED = 'true';
    await runCompanionCron(env, new Date('2026-12-01T12:00:00Z'));
    expect(await env.cohere.prepare('SELECT 1 FROM companion_replies').first()).toBe(null);
});
