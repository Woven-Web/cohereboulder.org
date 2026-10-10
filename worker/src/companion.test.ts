import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { companionRoute, denverDate, slotFor, runCompanionCron } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });
let env: Parameters<typeof companionRoute>[1];
afterEach(() => vi.useRealTimers());
beforeEach(() => { vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); env = { cohere: testD1(['../migrations/0010_companion.sql']) as unknown as D1Database }; });
const device = '00000000-0000-4000-8000-000000000001';
function req(path: string, body?: unknown, method = body ? 'POST' : 'GET', origin = 'https://cohereboulder.org') { return new Request('https://cohereboulder.org/api/companion/' + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin }, body: body ? JSON.stringify(body) : undefined }); }
it('uses Denver dates and inclusive schedule boundaries; never sends late', () => {
    expect(denverDate(new Date('2026-10-15T05:59:00Z'))).toBe('2026-10-14');
    expect(slotFor(new Date('2026-10-15T12:00:00Z'), env)).toBe('practice');
    expect(slotFor(new Date('2026-10-25T21:00:00Z'), env)).toBe('question');
    expect(slotFor(new Date('2026-10-26T12:00:00Z'), env)).toBe(null);
    expect(slotFor(new Date('2026-10-15T12:10:00Z'), env)).toBe(null);
});
it('public content is empty without seeds and push is disabled without secrets', async () => {
    const res = await companionRoute(req('today'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ daily: null, quests: [], pushKey: null });
    expect((await companionRoute(req('subscriptions', { device_id: device }), env)).status).toBe(503);
});
it('admin content requires gate, validates dates, rejects cross-origin mutation', async () => {
    expect((await companionRoute(req('content'), env, false, true)).status).toBe(401);
    expect((await companionRoute(req('content', { type: 'daily', date: 'bad', title: 'a' }, 'PUT'), env, true, true)).status).toBe(400);
    expect((await companionRoute(req('content', { type: 'daily', date: '2026-10-15', title: 'a' }, 'PUT', 'https://evil.test'), env, true, true)).status).toBe(403);
    const res = await companionRoute(req('content', { type: 'daily', date: '2026-10-15', title: 'Practice', body: 'Body', question: 'Question' }, 'PUT'), env, true, true);
    expect(res.status).toBe(200);
});
it('replies require existing question; bounded length, atomic rate limit, CSV neutralizes formulas', async () => {
    await companionRoute(req('content', { type: 'daily', date: denverDate(new Date()), title: 'Practice', question: 'Q' }, 'PUT'), env, true, true);
    expect((await companionRoute(req('replies', { device_id: device, reply: 'x'.repeat(2001) }), env)).status).toBe(400);
    expect((await companionRoute(req('replies', { device_id: device, reply: '=CMD()', name: 'Alice' }), env)).status).toBe(200);
    expect((await companionRoute(req('replies', { device_id: device, reply: 'again' }), env)).status).toBe(429);
    const csv = await companionRoute(req('replies.csv'), env, true, true);
    expect(await csv.text()).toContain("'=CMD()");
});
it('quest completion is anonymous and idempotent', async () => {
    const date = denverDate(new Date());
    await companionRoute(req('content', { type: 'quest', id: 'walk', title: 'Walk', description: 'Outside', start_date: date, end_date: date }, 'PUT'), env, true, true);
    for (let i = 0; i < 2; i++)
        expect((await companionRoute(req('completions', { device_id: device, quest_id: 'walk' }), env)).status).toBe(200);
    const res = await companionRoute(req('content'), env, true, true);
    expect(await res.json()).toMatchObject({ totals: [{ quest_id: 'walk', total: 1 }] });
});
it('purges anonymous data after end plus 30 days even with push unset', async () => {
    await env.cohere.prepare('INSERT INTO companion_replies(device_id,date,reply,created_at) VALUES (?1,?2,?3,?4)').bind(device, '2026-10-15', 'hello', '2026-10-15').run();
    await runCompanionCron(env, new Date('2026-11-25T12:00:00Z'));
    expect(await env.cohere.prepare('SELECT * FROM companion_replies').first()).toBe(null);
});
it('overlapping scheduler invocations claim slot and each recipient before I/O; removes 410', async () => {
    const push = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', vapidKeys.privateKey);
    const { encode, decode } = await import('./push');
    Object.assign(env, { VAPID_PUBLIC_KEY: encode(new Uint8Array([4, ...decode(jwk.x!), ...decode(jwk.y!)])), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:test@example.test', COMPANION_LOCAL_PUSH_MOCK: 'http://127.0.0.1:10049' });
    const pub = encode(new Uint8Array(await crypto.subtle.exportKey('raw', push.publicKey)));
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device, 'http://127.0.0.1:10049/push', pub, encode(crypto.getRandomValues(new Uint8Array(16))), '2026-10-15').run();
    await env.cohere.prepare('INSERT INTO companion_daily(date,title,body) VALUES (?1,?2,?3)').bind('2026-10-15', 'Practice', 'Body').run();
    const mock = vi.fn(async () => {
        expect(await env.cohere.prepare('SELECT * FROM companion_ledger WHERE recipient=?1').bind(device).first()).not.toBe(null);
        return new Response(null, { status: 410 });
    });
    vi.stubGlobal('fetch', mock);
    try {
        await Promise.all([runCompanionCron(env, new Date('2026-10-15T12:00:00Z')), runCompanionCron(env, new Date('2026-10-15T12:00:00Z'))]);
        await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
        expect(mock).toHaveBeenCalledTimes(1);
        expect(await env.cohere.prepare('SELECT * FROM companion_subscriptions').first()).toBe(null);
    }
    finally {
        vi.unstubAllGlobals();
    }
});
it('reply attempts across fresh devices are bounded per network by D1', async () => {
    const date = denverDate(new Date());
    await companionRoute(req('content', { type: 'daily', date, title: 'Practice', question: 'Question' }, 'PUT'), env, true, true);
    for (let i = 0; i < 20; i++)
        expect((await companionRoute(req('replies', { device_id: crypto.randomUUID(), reply: 'local' }), env)).status).toBe(200);
    expect((await companionRoute(req('replies', { device_id: crypto.randomUUID(), reply: 'excess' }), env)).status).toBe(429);
});
it('unsubscribing clears durable push ownership even with configuration disabled', async () => {
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device, 'https://fcm.googleapis.com/test', 'x', 'y', '2026-10-15').run();
    expect((await companionRoute(req('subscriptions', { device_id: device }, 'DELETE'), env)).status).toBe(200);
    expect(await env.cohere.prepare('SELECT * FROM companion_subscriptions').first()).toBe(null);
});
it('missing daily content and off-slot invocations never create delivery claims', async () => {
    Object.assign(env, { VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x', VAPID_SUBJECT: 'mailto:test@example.test', COMPANION_LOCAL_PUSH_MOCK: 'http://127.0.0.1:10049' });
    await runCompanionCron(env, new Date('2026-10-15T12:00:00Z'));
    await runCompanionCron(env, new Date('2026-10-15T21:00:00Z'));
    expect(await env.cohere.prepare('SELECT * FROM companion_ledger').first()).toBe(null);
});
it('event slot uses anonymous existing calendar reads, Denver today/tomorrow and excludes cancelled', async () => {
    const { createPushReceiver } = await import('../../scripts/pwa-push-receiver.mjs');
    const receiver = createPushReceiver('http://127.0.0.1:10049'), keys = receiver.fixture;
    Object.assign(env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: keys.subject, COMPANION_LOCAL_PUSH_MOCK: 'http://127.0.0.1:10049', REGENOS_BASE_URL: 'http://127.0.0.1:10048', REGENOS_COLLECTIVE_DID: 'did:plc:mockscene' });
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device, keys.endpoint, keys.p256dh, keys.auth, '2026-10-15').run();
    await env.cohere.prepare('INSERT INTO companion_daily(date,title) VALUES (?1,?2)').bind('2026-10-15', 'Practice').run();
    const received: Record<string, string>[] = [];
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/xrpc/')) {
            expect(new Headers(init?.headers).has('Authorization')).toBe(false);
            return Response.json({ events: [['today', '2026-10-15T20:00:00Z', 'scheduled'], ['tomorrow', '2026-10-17T01:00:00Z', 'scheduled'], ['cancelled', '2026-10-15T20:00:00Z', 'cancelled'], ['later', '2026-10-18T01:00:00Z', 'scheduled']].map(([name, startsAt, status]) => ({ uri: 'at://did:plc:mockscene/community.lexicon.calendar.event/' + name, value: { name, startsAt, status } })) });
        }
        received.push(receiver.receive(Object.fromEntries(new Headers(init?.headers)), init?.body));
        return new Response(null, { status: 201 });
    });
    vi.stubGlobal('fetch', mock);
    try {
        await runCompanionCron(env, new Date('2026-10-15T15:00:00Z'));
        expect(received).toHaveLength(1);
        expect(received[0].body).toBe('today · tomorrow');
        expect(await env.cohere.prepare('SELECT last_success,failure_count FROM companion_subscriptions').first()).toMatchObject({ last_success: '2026-10-15T15:00:00.000Z', failure_count: 0 });
    }
    finally {
        vi.unstubAllGlobals();
    }
});
it('resumes unclaimed recipients from a durable slot within five minutes without new content', async () => {
    const { createPushReceiver } = await import('../../scripts/pwa-push-receiver.mjs');
    const receiver = createPushReceiver('http://127.0.0.1:10049'), keys = receiver.fixture;
    Object.assign(env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: keys.subject, COMPANION_LOCAL_PUSH_MOCK: 'http://127.0.0.1:10049' });
    await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device, keys.endpoint, keys.p256dh, keys.auth, '2026-10-15T11:00:00Z').run();
    // Crash after slot claim, before any recipient claim.
    await env.cohere.prepare('INSERT INTO companion_ledger(date,slot,recipient,claimed_at,payload_en,payload_es) VALUES (?1,?2,?3,?4,?5,?5)').bind('2026-10-15', 'practice', '*', '2026-10-15T12:00:00.000Z', JSON.stringify({ title: 'Stored practice', body: 'Stored', url: '/today', tag: '2026-10-15-practice' })).run();
    const mock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', mock);
    try {
        await runCompanionCron(env, new Date('2026-10-15T12:01:00Z'));
        expect(mock).toHaveBeenCalledTimes(1);
        await runCompanionCron(env, new Date('2026-10-15T12:02:00Z'));
        expect(mock).toHaveBeenCalledTimes(1);
    }
    finally {
        vi.unstubAllGlobals();
    }
});
it('accepts maximum bilingual content within a bounded admin request',async()=>{
 const res=await companionRoute(req('content',{type:'daily',date:'2026-10-15',title:'t'.repeat(200),title_es:'e'.repeat(200),body:'b'.repeat(3000),body_es:'c'.repeat(3000),question:'q'.repeat(1000),question_es:'p'.repeat(1000)},'PUT'),env,true,true);expect(res.status).toBe(200);
});
it('cancels oversized streamed requests before consuming the full body',async()=>{
 let cancelled=false,pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;if(pulls<=3)controller.enqueue(new Uint8Array(9000).fill(65));else controller.close();},cancel(){cancelled=true;}});
 const request=new Request('https://cohereboulder.org/api/companion/replies',{method:'POST',headers:{Origin:'https://cohereboulder.org'},body:stream,duplex:'half'} as RequestInit);
 expect((await companionRoute(request,env)).status).toBe(413);expect(cancelled).toBe(true);
});

it.each([410,201,500])('stale delivery %s cannot mutate replacement keys at the same endpoint', async status => {
 const {createPushReceiver}=await import('../../scripts/pwa-push-receiver.mjs');
 const k=createPushReceiver('http://127.0.0.1:10049').fixture;
 Object.assign(env,{VAPID_PUBLIC_KEY:k.publicKey,VAPID_PRIVATE_KEY:k.privateKey,VAPID_SUBJECT:k.subject,COMPANION_LOCAL_PUSH_MOCK:'http://127.0.0.1:10049'});
 await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device,k.endpoint,k.p256dh,k.auth,'2026-10-15').run();
 await env.cohere.prepare('INSERT INTO companion_daily(date,title) VALUES (?1,?2)').bind('2026-10-15','Practice').run();
 vi.stubGlobal('fetch',async()=>{await env.cohere.prepare("UPDATE companion_subscriptions SET auth='replacement',failure_count=7 WHERE device_id=?1").bind(device).run();return new Response(null,{status});});
 try {await runCompanionCron(env,new Date('2026-10-15T12:00:00Z'));expect(await env.cohere.prepare('SELECT auth,failure_count,last_success FROM companion_subscriptions').first()).toMatchObject({auth:'replacement',failure_count:7,last_success:null});}finally{vi.unstubAllGlobals();}
});
it('storage loss removal requires all browser possession keys',async()=>{
 await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device,'https://fcm.googleapis.com/test','public','secret','2026-10-15').run();
 const lost='00000000-0000-4000-8000-000000000002';
 await companionRoute(req('subscriptions',{device_id:lost,endpoint:'https://fcm.googleapis.com/test',p256dh:'public',auth:'wrong'},'DELETE'),env);
 expect(await env.cohere.prepare('SELECT * FROM companion_subscriptions').first()).not.toBe(null);
 await companionRoute(req('subscriptions',{device_id:lost,endpoint:'https://fcm.googleapis.com/test',p256dh:'public',auth:'secret'},'DELETE'),env);
 expect(await env.cohere.prepare('SELECT * FROM companion_subscriptions').first()).toBe(null);
});
it.each([{COMPANION_END_DATE:'bad'},{COMPANION_START_DATE:'2026-02-30'},{COMPANION_START_DATE:'2026-10-26'}])('rejects invalid configured dates before database work: %j',async config=>{
 Object.assign(env,config);await expect(runCompanionCron(env,new Date('2026-10-15T12:00:00Z'))).rejects.toThrow(/dates/);
});
it('persists language only with browser possession proof, including after device storage loss',async()=>{
 await env.cohere.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,created_at) VALUES (?1,?2,?3,?4,?5)').bind(device,'https://fcm.googleapis.com/test','public','secret','2026-10-15').run();
 const proof={device_id:crypto.randomUUID(),endpoint:'https://fcm.googleapis.com/test',p256dh:'public',auth:'secret',language:'es'};
 expect((await companionRoute(req('subscriptions',{...proof,auth:'wrong'},'PATCH'),env)).status).toBe(404);
 expect((await companionRoute(req('subscriptions',proof,'PATCH'),env)).status).toBe(200);
 expect(await env.cohere.prepare('SELECT language,device_id FROM companion_subscriptions').first()).toMatchObject({language:'es',device_id:device});
});
it('cron truncation preserves Unicode at the body length boundary',async()=>{
 Object.assign(env,{VAPID_PUBLIC_KEY:'x',VAPID_PRIVATE_KEY:'x',VAPID_SUBJECT:'mailto:test@example.test',COMPANION_LOCAL_PUSH_MOCK:'http://127.0.0.1:10049'});
 await env.cohere.prepare('INSERT INTO companion_daily(date,title,body) VALUES (?1,?2,?3)').bind('2026-10-15','Practice','x'.repeat(999)+'🌻').run();
 await runCompanionCron(env,new Date('2026-10-15T12:00:00Z'));
 const row=await env.cohere.prepare("SELECT payload_en FROM companion_ledger WHERE recipient='*'").first<{payload_en:string}>();
 expect(JSON.parse(row!.payload_en).body).toBe('x'.repeat(999)+'🌻');
});

it.each([
 [{}, '2026-10-16', '2026-10-24'],
 [{start_date:'2026-10-17'}, '2026-10-17', '2026-10-24'],
 [{end_date:'2026-10-20'}, '2026-10-16', '2026-10-20'],
 [{start_date:'2026-10-18',end_date:'2026-10-18'}, '2026-10-18', '2026-10-18'],
])('defaults omitted quest dates independently from configured gathering: %j', async (dates, start_date, end_date) => {
 Object.assign(env,{COMPANION_START_DATE:'2026-10-16',COMPANION_END_DATE:'2026-10-24'});
 expect((await companionRoute(req('content',{type:'quest',id:'window',title:'Window',...dates},'PUT'),env,true,true)).status).toBe(200);
 expect(await env.cohere.prepare('SELECT start_date,end_date FROM companion_quests WHERE id=?1').bind('window').first()).toEqual({start_date,end_date});
});
it.each([{start_date:'2026-10-26'},{end_date:'2026-10-14'},{start_date:null},{end_date:''},{start_date:'2026-02-30'}])('validates resulting quest window and rejects explicit invalid dates: %j',async dates=>{
 expect((await companionRoute(req('content',{type:'quest',id:'window',title:'Window',...dates},'PUT'),env,true,true)).status).toBe(400);
 expect(await env.cohere.prepare('SELECT * FROM companion_quests').first()).toBe(null);
});
it('defaults quest dates to standard gathering when no override is configured',async()=>{
 await companionRoute(req('content',{type:'quest',id:'window',title:'Window'},'PUT'),env,true,true);
 expect(await env.cohere.prepare('SELECT start_date,end_date FROM companion_quests').first()).toEqual({start_date:'2026-10-15',end_date:'2026-10-25'});
});
