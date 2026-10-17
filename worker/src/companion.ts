import { decode, validEndpoint } from './push';
import type { EventsEnv } from './events';
export interface CompanionEnv extends EventsEnv {
    cohere: D1Database;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    COMPANION_START_DATE?: string;
    COMPANION_END_DATE?: string;
    /** "true" stops every scheduled push (like RSVP_REMINDERS_PAUSED). Flipped at launch. worker/src/notify.ts honours it for the morning, harvest and 8 PM pushes. */ COMPANION_PUSH_PAUSED?: string;
    /** Exact loopback origin for hermetic tests. Honoured only together with COMPANION_LOCAL_TEST_MODE. */ COMPANION_LOCAL_PUSH_MOCK?: string;
    /** "true" only on a developer machine (`wrangler dev --var`). No wrangler config sets it. */ COMPANION_LOCAL_TEST_MODE?: string;
}
export const denverDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
};
/** Gathering opens 2026-10-15 America/Denver; configuration cannot move this earlier. */
export const LAUNCH_FLOOR = '2026-10-15';
/** The validated local-test capability: the explicit flag AND an exact loopback origin, else nothing. */
export function localMock(env: CompanionEnv): string | null {
    const origin = env.COMPANION_LOCAL_PUSH_MOCK;
    return env.COMPANION_LOCAL_TEST_MODE === 'true' && typeof origin === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin) ? origin : null;
}
const configuredStart = (env: CompanionEnv) => env.COMPANION_START_DATE || LAUNCH_FLOOR;
const start = (env: CompanionEnv) => localMock(env) || configuredStart(env) >= LAUNCH_FLOOR ? configuredStart(env) : LAUNCH_FLOOR;
const end = (env: CompanionEnv) => env.COMPANION_END_DATE || '2026-10-25';
export const pushConfigured = (env: CompanionEnv) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
const enabled = pushConfigured;
/** The gathering's first and last Boulder dates (validated; the launch floor applies). The notify senders run inside it. */
export function companionWindow(env: CompanionEnv): { start: string; end: string } {
    validateDates(env);
    return { start: start(env), end: end(env) };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const dateOK = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function validateDates(env: CompanionEnv) {
    if (!dateOK(configuredStart(env)) || !dateOK(end(env)) || configuredStart(env) > end(env)) throw new Error('invalid companion dates');
}
const deviceOK = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max: number, required = false) => typeof v === 'string' && v.length <= max && (!required || !!v.trim());
export function csvCell(v: unknown): string { let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s))
    s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
async function rateAllowed(request: Request, env: CompanionEnv, action: string, max: number): Promise<boolean> {
    const window = Math.floor(Date.now() / 3600000);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(window + ':' + ip)));
    const bucket = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    const row = await env.cohere.prepare('INSERT INTO companion_rate_limits(bucket,action,window,attempts) VALUES (?1,?2,?3,1) ON CONFLICT(bucket,action,window) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket, action, window).first<{
        attempts: number;
    }>();
    return !!row && row.attempts <= max;
}
/** Turning notifications off on a device is the person's choice, not a failure: it simply stops being a push target. */
async function expireDevice(db: D1Database, deviceId: string): Promise<void> {
    await db.prepare("UPDATE notify_devices SET state='expired', updated_at=?2 WHERE device_id=?1").bind(deviceId, new Date().toISOString()).run().catch(() => console.error('notify device not updated'));
}
export async function companionRoute(request: Request, env: CompanionEnv, admin = false, adminRoute = false): Promise<Response> {
    const url = new URL(request.url), path = url.pathname.split('/').pop()!, method = request.method;
    if (adminRoute && !admin)
        return json({ error: 'unauthorized' }, 401);
    if (method !== 'GET' && method !== 'HEAD' && request.headers.get('Origin') !== url.origin)
        return json({ error: 'forbidden' }, 403);
    const today = denverDate(new Date());
    const db = env.cohere;
    if (!adminRoute && path === 'today' && method === 'GET') {
        const daily = await db.prepare('SELECT * FROM companion_daily WHERE date=?1').bind(today).first();
        const quests = await db.prepare('SELECT * FROM companion_quests WHERE start_date<=?1 AND end_date>=?1 ORDER BY id LIMIT 100').bind(today).all();
        return json({ date: today, daily, quests: quests.results, pushKey: enabled(env) ? env.VAPID_PUBLIC_KEY : null, start: start(env), end: end(env) });
    }
    if (adminRoute && method === 'GET') {
        const after = url.searchParams.get('after') || '';
        if (path === 'replies' || path === 'replies.csv') {
            const rows = await db.prepare("SELECT date,device_id,name,reply,created_at FROM companion_replies WHERE date||':'||device_id>?1 ORDER BY date,device_id LIMIT 100").bind(after).all<Record<string, string>>();
            if (path === 'replies.csv')
                return new Response(['date,device_id,name,reply,created_at', ...rows.results.map(r => [r.date, r.device_id, r.name, r.reply, r.created_at].map(csvCell).join(','))].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="companion-replies.csv"' } });
            const last = rows.results.at(-1);
            return json({ replies: rows.results, next: rows.results.length === 100 && last ? last.date + ':' + last.device_id : null });
        }
        if (path === 'content') {
            const daily = await db.prepare('SELECT * FROM companion_daily ORDER BY date LIMIT 100').all();
            const quests = await db.prepare('SELECT * FROM companion_quests ORDER BY id LIMIT 100').all();
            const totals = await db.prepare('SELECT quest_id,count(*) AS total FROM companion_completions GROUP BY quest_id ORDER BY quest_id LIMIT 100').all();
            return json({ daily: daily.results, quests: quests.results, totals: totals.results });
        }
    }
    let body: Record<string, unknown> = {};
    if (method !== 'GET') {
        const limit = adminRoute ? 32768 : 8192;
        if (Number(request.headers.get('Content-Length')) > limit)
            return json({ error: 'too large' }, 413);
        try {
            const reader = request.body?.getReader();
            if (!reader) return json({ error: 'invalid JSON' }, 400);
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    length += value.byteLength;
                    if (length > limit) {
                        await reader.cancel();
                        return json({ error: 'too large' }, 413);
                    }
                    chunks.push(value);
                }
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            if (!body || typeof body !== 'object' || Array.isArray(body))
                throw new Error();
        }
        catch {
            return json({ error: 'invalid JSON' }, 400);
        }
    }
    if (adminRoute && path === 'content' && (method === 'PUT' || method === 'DELETE')) {
        const daily = body.type === 'daily';
        if (!daily && body.type !== 'quest')
            return json({ error: 'invalid type' }, 400);
        const id = daily ? body.date : body.id;
        if (daily ? !dateOK(id) : !text(id, 80, true) || !/^[a-zA-Z0-9_-]+$/.test(String(id)))
            return json({ error: 'invalid id or date' }, 400);
        if (method === 'DELETE') {
            await db.prepare(daily ? 'DELETE FROM companion_daily WHERE date=?1' : 'DELETE FROM companion_quests WHERE id=?1').bind(id).run();
            return json({ ok: true });
        }
        const limits = daily ? { title: 200, body: 3000, title_es: 200, body_es: 3000, question: 1000, question_es: 1000 } : { title: 200, description: 3000, title_es: 200, description_es: 3000 };
        for (const [key, max] of Object.entries(limits))
            if (body[key] != null && !text(body[key], max, key === 'title'))
                return json({ error: 'invalid ' + key }, 400);
        if (!text(body.title, 200, true))
            return json({ error: 'title required' }, 400);
        if (daily)
            await db.prepare('INSERT INTO companion_daily(date,title,body,title_es,body_es,question,question_es) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(date) DO UPDATE SET title=excluded.title,body=excluded.body,title_es=excluded.title_es,body_es=excluded.body_es,question=excluded.question,question_es=excluded.question_es').bind(id, body.title, body.body ?? '', body.title_es ?? null, body.body_es ?? null, body.question ?? null, body.question_es ?? null).run();
        else {
            body.start_date = body.start_date === undefined ? start(env) : body.start_date;
            body.end_date = body.end_date === undefined ? end(env) : body.end_date;
            if (!dateOK(body.start_date) || !dateOK(body.end_date) || body.end_date < body.start_date)
                return json({ error: 'invalid window' }, 400);
            await db.prepare('INSERT INTO companion_quests(id,title,description,title_es,description_es,start_date,end_date) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,title_es=excluded.title_es,description_es=excluded.description_es,start_date=excluded.start_date,end_date=excluded.end_date').bind(id, body.title, body.description ?? '', body.title_es ?? null, body.description_es ?? null, body.start_date, body.end_date).run();
        }
        return json({ ok: true });
    }
    if (adminRoute)
        return json({ error: 'not found' }, 404);
    if (path === 'subscriptions' && method === 'POST' && !enabled(env))
        return json({ error: 'push disabled' }, 503);
    if (!deviceOK(body.device_id))
        return json({ error: 'invalid anonymous device id' }, 400);
    if (['subscriptions', 'replies', 'completions'].includes(path) && (method === 'POST' || (path === 'subscriptions' && (method === 'PATCH' || method === 'DELETE'))) && !await rateAllowed(request, env, path, path === 'replies' ? 20 : path === 'subscriptions' ? 30 : 100))
        return json({ error: 'rate limit' }, 429);
    if (path === 'subscriptions') {
        if (method === 'DELETE') {
            if (body.endpoint != null) {
                if (typeof body.endpoint !== 'string' || typeof body.p256dh !== 'string' || typeof body.auth !== 'string') return json({error:'invalid possession proof'},400);
                const owner = await db.prepare('SELECT device_id FROM companion_subscriptions WHERE endpoint=?1 AND p256dh=?2 AND auth=?3').bind(body.endpoint,body.p256dh,body.auth).first<{ device_id: string }>();
                await db.prepare('DELETE FROM companion_subscriptions WHERE endpoint=?1 AND p256dh=?2 AND auth=?3').bind(body.endpoint,body.p256dh,body.auth).run();
                if (owner) await expireDevice(db, owner.device_id);
            } else {
                await db.prepare('DELETE FROM companion_subscriptions WHERE device_id=?1').bind(body.device_id).run();
                await expireDevice(db, body.device_id);
            }
            return json({ ok: true });
        }
        if (method === 'PATCH') {
            if (typeof body.endpoint !== 'string' || typeof body.p256dh !== 'string' || typeof body.auth !== 'string' || !['en','es'].includes(String(body.language))) return json({error:'invalid possession proof'},400);
            const result=await db.prepare('UPDATE companion_subscriptions SET language=?1 WHERE endpoint=?2 AND p256dh=?3 AND auth=?4').bind(body.language,body.endpoint,body.p256dh,body.auth).run();
            return result.meta.changes ? json({ok:true}) : json({error:'subscription missing'},404);
        }
        if (method === 'POST') {
            if (typeof body.endpoint !== 'string' || !validEndpoint(body.endpoint, localMock(env) ?? undefined))
                return json({ error: 'invalid push endpoint' }, 400);
            try {
                if (typeof body.p256dh !== 'string' || typeof body.auth !== 'string' || decode(body.auth).length !== 16 || decode(body.p256dh).length !== 65)
                    throw new Error();
                await crypto.subtle.importKey('raw', decode(body.p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
            }
            catch {
                return json({ error: 'invalid keys' }, 400);
            }
            try {
                await db.prepare('INSERT INTO companion_subscriptions(device_id,endpoint,p256dh,auth,language,created_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(device_id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,language=excluded.language,failure_count=0').bind(body.device_id, body.endpoint, body.p256dh, body.auth, body.language === 'es' ? 'es' : 'en', new Date().toISOString()).run();
            }
            catch {
                return json({ error: 'subscription conflict' }, 409);
            }
            // A fresh subscription is a live device again. Best-effort: the
            // push itself must still work if the health table is unavailable.
            const stamp = new Date().toISOString();
            await db.prepare("INSERT INTO notify_devices(device_id,installed,permission,state,fail_count,last_seen_at,created_at,updated_at) VALUES (?1,0,'granted','live',0,?2,?2,?2) ON CONFLICT(device_id) DO UPDATE SET state='live',fail_count=0,last_failure_at=NULL,permission='granted',last_seen_at=?2,updated_at=?2")
                .bind(body.device_id, stamp).run().catch(() => console.error('notify device not recorded'));
            return json({ ok: true });
        }
    }
    if (path === 'replies' && method === 'POST') {
        if (!text(body.reply, 2000, true) || (body.name != null && !text(body.name, 80)))
            return json({ error: 'invalid reply' }, 400);
        if (!await db.prepare("SELECT date FROM companion_daily WHERE date=?1 AND question IS NOT NULL AND question<>''").bind(today).first())
            return json({ error: 'no question today' }, 404);
        const result = await db.prepare('INSERT OR IGNORE INTO companion_replies(device_id,date,reply,name,created_at) VALUES (?1,?2,?3,?4,?5)').bind(body.device_id, today, body.reply, body.name ?? null, new Date().toISOString()).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'one reply per device per day' }, 429);
    }
    if (path === 'completions' && method === 'POST') {
        if (!text(body.quest_id, 80, true))
            return json({ error: 'invalid quest' }, 400);
        if (!await db.prepare('SELECT id FROM companion_quests WHERE id=?1 AND start_date<=?2 AND end_date>=?2').bind(body.quest_id, today).first())
            return json({ error: 'quest unavailable' }, 404);
        await db.prepare('INSERT OR IGNORE INTO companion_completions(device_id,quest_id,created_at) VALUES (?1,?2,?3)').bind(body.device_id, body.quest_id, new Date().toISOString()).run();
        return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
}
/**
 * Housekeeping only. The morning note, the harvest invite and the 8 PM note are
 * sent by worker/src/notify.ts; this keeps rate-limit rows trimmed and, once the
 * gathering plus 30 days has passed, deletes the anonymous companion data.
 */
export async function runCompanionCron(env: CompanionEnv, now: Date): Promise<void> {
    validateDates(env);
    const date = denverDate(now), db = env.cohere;
    await db.prepare('DELETE FROM companion_rate_limits WHERE rowid IN (SELECT rowid FROM companion_rate_limits WHERE window<?1 LIMIT 500)')
        .bind(Math.floor(now.getTime() / 3600000) - 24).run();
    const cutoff = new Date(end(env) + 'T12:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    if (date > cutoff.toISOString().slice(0, 10)) {
        for (const table of ['companion_replies', 'companion_completions', 'companion_subscriptions', 'companion_ledger', 'notify_devices', 'notify_ledger', 'notify_reminder_ledger', 'notify_runs']) {
            try {
                await db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} LIMIT 500)`).run();
            }
            catch (error) {
                // A table from a later migration that this database has not had yet.
                if (!/no such table/i.test(String(error))) throw error;
            }
        }
    }
}
