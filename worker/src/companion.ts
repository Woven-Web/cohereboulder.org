import { translations } from "../../src/lib/translations";
import { decode, encryptPush, validEndpoint, vapid, serializePush } from './push';
import { handleEventsList, type EventsEnv } from './events';
export interface CompanionEnv extends EventsEnv {
    cohere: D1Database;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    COMPANION_START_DATE?: string;
    COMPANION_END_DATE?: string;
    /** "true" stops every scheduled push (like RSVP_REMINDERS_PAUSED). Flipped at launch. */ COMPANION_PUSH_PAUSED?: string;
    /** Set only in local hermetic tests. Exact loopback origin. */ COMPANION_LOCAL_PUSH_MOCK?: string;
}
export const denverDate = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
};
const start = (env: CompanionEnv) => env.COMPANION_START_DATE || '2026-10-15';
const end = (env: CompanionEnv) => env.COMPANION_END_DATE || '2026-10-25';
const enabled = (env: CompanionEnv) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
export function slotFor(now: Date, env: CompanionEnv): 'practice' | 'events' | 'question' | null {
    validateDates(env);
    const date = denverDate(now);
    if (date < start(env) || date > end(env) || now.getUTCMinutes() !== 0)
        return null;
    return ({ 12: 'practice', 15: 'events', 21: 'question' } as const)[now.getUTCHours() as 12 | 15 | 21] ?? null;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const dateOK = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
function validateDates(env: CompanionEnv) {
    if (!dateOK(start(env)) || !dateOK(end(env)) || start(env) > end(env)) throw new Error('invalid companion dates');
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
    if (method === 'POST' && ['subscriptions', 'replies', 'completions'].includes(path) && !await rateAllowed(request, env, path, path === 'replies' ? 20 : path === 'subscriptions' ? 30 : 100))
        return json({ error: 'rate limit' }, 429);
    if (path === 'subscriptions') {
        if (method === 'DELETE') {
            if (body.endpoint != null) {
                if (typeof body.endpoint !== 'string' || typeof body.p256dh !== 'string' || typeof body.auth !== 'string') return json({error:'invalid possession proof'},400);
                await db.prepare('DELETE FROM companion_subscriptions WHERE endpoint=?1 AND p256dh=?2 AND auth=?3').bind(body.endpoint,body.p256dh,body.auth).run();
            } else await db.prepare('DELETE FROM companion_subscriptions WHERE device_id=?1').bind(body.device_id).run();
            return json({ ok: true });
        }
        if (method === 'PATCH') {
            if (typeof body.endpoint !== 'string' || typeof body.p256dh !== 'string' || typeof body.auth !== 'string' || !['en','es'].includes(String(body.language))) return json({error:'invalid possession proof'},400);
            const result=await db.prepare('UPDATE companion_subscriptions SET language=?1 WHERE endpoint=?2 AND p256dh=?3 AND auth=?4').bind(body.language,body.endpoint,body.p256dh,body.auth).run();
            return result.meta.changes ? json({ok:true}) : json({error:'subscription missing'},404);
        }
        if (method === 'POST') {
            if (typeof body.endpoint !== 'string' || !validEndpoint(body.endpoint, env.COMPANION_LOCAL_PUSH_MOCK))
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
/** Claim before I/O. Claimed recipients never retry, even after network errors. */
export async function runCompanionCron(env: CompanionEnv, now: Date): Promise<void> {
    validateDates(env);
    const date = denverDate(now), db = env.cohere;
    await db.prepare('DELETE FROM companion_rate_limits WHERE rowid IN (SELECT rowid FROM companion_rate_limits WHERE window<?1 LIMIT 500)')
        .bind(Math.floor(now.getTime() / 3600000) - 24).run();
    const cutoff = new Date(end(env) + 'T12:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    if (date > cutoff.toISOString().slice(0, 10)) {
        for (const table of ['companion_replies', 'companion_completions', 'companion_subscriptions', 'companion_ledger']) {
            await db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} LIMIT 500)`).run();
        }
        return;
    }
    if (env.COMPANION_PUSH_PAUSED === 'true' || !enabled(env) || date < start(env) || date > end(env) || now.getUTCMinutes() >= 5)
        return;
    const slot = ({ 12: 'practice', 15: 'events', 21: 'question' } as const)[now.getUTCHours() as 12 | 15 | 21];
    if (!slot)
        return;
    const slotTime = new Date(now);
    slotTime.setUTCMinutes(0, 0, 0);
    const deadline = slotTime.getTime() + 5 * 60 * 1000;
    const stale = () => !env.COMPANION_LOCAL_PUSH_MOCK && (Date.now() >= deadline || Date.now() < slotTime.getTime() - 60000);
    if (stale())
        return;
    let marker = await db.prepare("SELECT claimed_at,payload_en,payload_es FROM companion_ledger WHERE date=?1 AND slot=?2 AND recipient='*'")
        .bind(date, slot).first<{
        claimed_at: string;
        payload_en: string | null;
        payload_es: string | null;
    }>();
    if (!marker) {
        // Minute ticks may continue a claimed slot, but cannot create late content.
        if (!slotFor(now, env))
            return;
        const daily = await db.prepare('SELECT * FROM companion_daily WHERE date=?1').bind(date).first<Record<string, string>>();
        // No organizer-written content for today means nothing goes out, in any slot.
        if (!daily)
            return;
        let eventsBody = '';
        if (slot === 'events') {
            const response = await handleEventsList(new Request('https://cohereboulder.org/api/events'), env, {});
            const data = await response.json() as {
                events?: {
                    name: string;
                    startsAt: string | null;
                    status?: string;
                }[];
            };
            const tomorrow = new Date(now);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            const dates = [date, denverDate(tomorrow)];
            eventsBody = (data.events ?? []).filter(e => e.status !== 'cancelled' && e.startsAt && !isNaN(Date.parse(e.startsAt)) && dates.includes(denverDate(new Date(e.startsAt))))
                .map(e => e.name).join(' · ');
            if (!eventsBody)
                return;
        }
        else if (slot === 'question' ? !daily.question : !daily.title)
            return;
        const payload = (language: 'en' | 'es') => {
            const es = language === 'es';
            const title = slot === 'events' ? translations.companion.events[language] : slot === 'question' ? (daily![es ? 'question_es' : 'question'] || daily!.question) : (daily![es ? 'title_es' : 'title'] || daily!.title);
            const body = slot === 'events' ? eventsBody : slot === 'question' ? '' : (daily![es ? 'body_es' : 'body'] || daily!.body || '');
            return serializePush({ title: Array.from(title).slice(0, 200).join(''), body: Array.from(body).slice(0, 1000).join(''), url: '/today', tag: date + '-' + slot });
        };
        await db.prepare('INSERT OR IGNORE INTO companion_ledger(date,slot,recipient,claimed_at,payload_en,payload_es) VALUES (?1,?2,?3,?4,?5,?6)')
            .bind(date, slot, '*', slotTime.toISOString(), payload('en'), payload('es')).run();
        // Concurrent creators all read the winner's snapshot, keeping content stable.
        marker = await db.prepare("SELECT claimed_at,payload_en,payload_es FROM companion_ledger WHERE date=?1 AND slot=?2 AND recipient='*'")
            .bind(date, slot).first<{
            claimed_at: string;
            payload_en: string | null;
            payload_es: string | null;
        }>();
    }
    if (!marker?.payload_en || !marker.payload_es)
        return;
    let after = '';
    // Bounded queries and invocation work. Minute cron resumes any unclaimed
    // recipients while this slot is fresh; recipients added later are excluded.
    for (let page = 0; page < 20 && !stale(); page++) {
        const rows = await db.prepare(`SELECT s.* FROM companion_subscriptions s
   WHERE s.device_id>?1 AND s.created_at<=?2 AND NOT EXISTS
   (SELECT 1 FROM companion_ledger l WHERE l.date=?3 AND l.slot=?4 AND l.recipient=s.device_id)
   ORDER BY s.device_id LIMIT 50`).bind(after, marker.claimed_at, date, slot)
            .all<{
            device_id: string;
            endpoint: string;
            p256dh: string;
            auth: string;
            language: string;
        }>();
        for (const sub of rows.results) {
            if (stale())
                return;
            after = sub.device_id;
            const claimed = await db.prepare('INSERT OR IGNORE INTO companion_ledger(date,slot,recipient,claimed_at) VALUES (?1,?2,?3,?4)')
                .bind(date, slot, sub.device_id, now.toISOString()).run();
            if (!claimed.meta.changes)
                continue;
            try {
                if (!validEndpoint(sub.endpoint, env.COMPANION_LOCAL_PUSH_MOCK))
                    throw new Error('unsafe endpoint');
                const encrypted = await encryptPush(sub.language === 'es' ? marker.payload_es : marker.payload_en, sub.p256dh, sub.auth);
                const token = await vapid(sub.endpoint, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.VAPID_SUBJECT!);
                // Check deadline again after crypto; do not start any stale delivery.
                if (stale())
                    return;
                const res = await fetch(sub.endpoint, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
                    headers: { Authorization: `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '300' }, body: encrypted });
                if (res.status === 404 || res.status === 410)
                    await db.prepare('DELETE FROM companion_subscriptions WHERE device_id=?1 AND endpoint=?2 AND p256dh=?3 AND auth=?4').bind(sub.device_id,sub.endpoint,sub.p256dh,sub.auth).run();
                else if (res.ok)
                    await db.prepare('UPDATE companion_subscriptions SET last_success=?1,failure_count=0 WHERE device_id=?2 AND endpoint=?3 AND p256dh=?4 AND auth=?5').bind(now.toISOString(), sub.device_id,sub.endpoint,sub.p256dh,sub.auth).run();
                else
                    throw new Error('push failed');
            }
            catch {
                await db.prepare('UPDATE companion_subscriptions SET failure_count=failure_count+1 WHERE device_id=?1 AND endpoint=?2 AND p256dh=?3 AND auth=?4').bind(sub.device_id,sub.endpoint,sub.p256dh,sub.auth).run();
            }
        }
        if (rows.results.length < 50)
            break;
    }
}
