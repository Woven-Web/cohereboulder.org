export function installPlatform(userAgent: string, standalone: boolean, prompt: boolean): 'installed' | 'ios' | 'prompt' | 'manual' {
    if (standalone)
        return 'installed';
    if (/iPhone|iPad|iPod/i.test(userAgent))
        return 'ios';
    return prompt ? 'prompt' : 'manual';
}
export function safeNotificationPath(path: unknown): string {
    return typeof path === 'string' && (/^(\/today|\/calendar|\/quests|\/more)$/.test(path) || /^\/events\/[a-zA-Z0-9:%_-]+\/[a-zA-Z0-9_-]+$/.test(path)) ? path : '/today';
}
export function eventsForDays<T extends {
    startsAt: string | null;
}>(events: T[], date: string): T[] {
    const next = new Date(date + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' });
    return events.filter(e => { if (!e.startsAt || isNaN(Date.parse(e.startsAt)))
        return false; const d = isoDate(fmt, new Date(e.startsAt)); return d === date || d === tomorrow; });
}
export function localGet(key: string): string | null { try {
    return localStorage.getItem(key);
}
catch {
    return null;
} }
export function localSet(key: string, value: string): void { try {
    localStorage.setItem(key, value);
}
catch { /* Session-only state remains usable when storage is unavailable. */ } }
let sessionDevice: string | undefined;
export function anonymousDevice(): string {
    const key = 'cohere-companion-device';
    const stored = localGet(key);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored))
        return stored;
    sessionDevice ??= crypto.randomUUID();
    localSet(key, sessionDevice);
    return sessionDevice;
}

export function questChecks(): string[] {
    try { const value:unknown=JSON.parse(localGet('cohere-quests') || '[]');return Array.isArray(value) && value.every(item=>typeof item==='string') ? value : []; } catch { return []; }
}
function isoDate(formatter: Intl.DateTimeFormat, date: Date): string {
    const parts=formatter.formatToParts(date);
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export const currentDenverDate = () => isoDate(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}),new Date());
