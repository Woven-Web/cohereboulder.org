import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:email', () => ({ EmailMessage: class {
    } }));
vi.hoisted(() => vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => { }, delete: async () => true } }));
import worker from './index';
import { testD1, testKV } from './test-d1';
import { ADMIN_PAGE } from './admin-page';
it('Worker exposes companion public API and preserves authenticated admin gate', async () => {
    const env = { cohere: testD1(['../schema.sql']), COHERE_AUTH: testKV(), ASSETS: { fetch: async () => new Response('shell') } } as unknown as Parameters<typeof worker.fetch>[1];
    expect((await worker.fetch(new Request('https://cohereboulder.org/api/companion/today'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://cohereboulder.org/api/admin/companion/content'), env)).status).toBe(401);
});
it('admin portal provides companion content editor and replies viewer', () => {
    expect(ADMIN_PAGE).toContain('data-tab="companion"');
    expect(ADMIN_PAGE).toContain('/api/admin/companion/content');
    expect(ADMIN_PAGE).toContain('/api/admin/companion/replies.csv');
});
it.each(['* * * * *','0 15 * * *'])('companion failure leaves existing cron %s running',async cron=>{
 const db=testD1(['../schema.sql']);const statements:string[]=[];
 const prepare=db.prepare.bind(db);db.prepare=(sql:string)=>{statements.push(sql);if(sql.includes('companion_'))throw new Error('companion broken');return prepare(sql);};
 const env={cohere:db,COHERE_AUTH:testKV()} as unknown as Parameters<typeof worker.fetch>[1];
 await expect(worker.scheduled({scheduledTime:Date.parse('2026-10-15T15:00:00Z'),cron},env)).resolves.toBeUndefined();
 expect(statements.some(sql=>sql.includes('companion_'))).toBe(true);
 expect(statements.some(sql=>sql.includes(cron==='* * * * *'?'newsletter':'event_rsvps'))).toBe(true);
 expect(statements.some(sql=>sql.includes('event_checkins'))).toBe(cron==='0 15 * * *');
 expect(statements.some(sql=>sql.includes('resend_webhook_events'))).toBe(cron==='0 15 * * *');
});

it.each(['0 12 * * *', '0 21 * * *'])('companion-only cron %s does not run newsletter or RSVP retention', async cron => {
 const db = testD1(['../schema.sql']);
 const statements: string[] = [];
 const prepare = db.prepare.bind(db);
 db.prepare = (sql: string) => { statements.push(sql); return prepare(sql); };
 const env = { cohere: db, COHERE_AUTH: testKV() } as unknown as Parameters<typeof worker.fetch>[1];
 await worker.scheduled({ scheduledTime: Date.parse('2026-10-15T12:00:00Z'), cron }, env);
 expect(statements.some(sql => sql.includes('companion_'))).toBe(true);
 expect(statements.some(sql => /newsletter|event_rsvps|event_checkins|resend_webhook_events/.test(sql))).toBe(false);
});
