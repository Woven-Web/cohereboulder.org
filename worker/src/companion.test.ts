import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testD1 } from './test-d1';
import { companionRoute, denverDate, runCompanionCron } from './companion';
vi.hoisted(() => { globalThis.caches = { default: { match: async () => undefined, put: async () => { } } } as unknown as CacheStorage; });
let env: Parameters<typeof companionRoute>[1];
afterEach(() => vi.useRealTimers());
beforeEach(() => { vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); env = { cohere: testD1(['../migrations/0010_companion.sql', '../migrations/0012_notify.sql']) as unknown as D1Database }; });
const device = '00000000-0000-4000-8000-000000000001';
function req(path: string, body?: unknown, method = body ? 'POST' : 'GET', origin = 'https://cohereboulder.org') { return new Request('https://cohereboulder.org/api/companion/' + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin }, body: body ? JSON.stringify(body) : undefined }); }
it('uses Denver dates', () => {
    expect(denverDate(new Date('2026-10-15T05:59:00Z'))).toBe('2026-10-14');
    expect(denverDate(new Date('2026-10-15T06:00:00Z'))).toBe('2026-10-15');
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
it('accepts maximum bilingual content within a bounded admin request',async()=>{
 const res=await companionRoute(req('content',{type:'daily',date:'2026-10-15',title:'t'.repeat(200),title_es:'e'.repeat(200),body:'b'.repeat(3000),body_es:'c'.repeat(3000),question:'q'.repeat(1000),question_es:'p'.repeat(1000)},'PUT'),env,true,true);expect(res.status).toBe(200);
});
it('cancels oversized streamed requests before consuming the full body',async()=>{
 let cancelled=false,pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;if(pulls<=3)controller.enqueue(new Uint8Array(9000).fill(65));else controller.close();},cancel(){cancelled=true;}});
 const request=new Request('https://cohereboulder.org/api/companion/replies',{method:'POST',headers:{Origin:'https://cohereboulder.org'},body:stream,duplex:'half'} as RequestInit);
 expect((await companionRoute(request,env)).status).toBe(413);expect(cancelled).toBe(true);
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
