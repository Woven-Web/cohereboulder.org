import { expect, it, vi } from 'vitest';
import { installPlatform, safeNotificationPath, eventsForDays } from './companion';
import { existsSync, readFileSync } from 'node:fs';
it('distinguishes iOS home screen requirement, installed, unsupported and browser prompt', () => {
    expect(installPlatform('iPhone', false, false)).toBe('ios');
    expect(installPlatform('iPad', true, false)).toBe('installed');
    expect(installPlatform('Android', false, true)).toBe('prompt');
    expect(installPlatform('Firefox', false, false)).toBe('manual');
});
it('notification routes cannot leave origin or reach private routes', () => {
    for (const path of ['https://evil.test', '//evil.test', '/admin', '/api/auth/logout', '/today?secret=x', '/today/../admin'])
        expect(safeNotificationPath(path)).toBe('/today');
    expect(safeNotificationPath('/quests')).toBe('/quests');
    expect(safeNotificationPath('/events/did%3Aplc%3Aabc/one')).toBe('/events/did%3Aplc%3Aabc/one');
});
it('event dates use Denver including tomorrow across UTC midnight', () => {
    const events = [{ startsAt: '2026-10-16T01:00:00Z' }, { startsAt: '2026-10-17T01:00:00Z' }, { startsAt: '2026-10-18T01:00:00Z' }];
    expect(eventsForDays(events, '2026-10-15')).toHaveLength(2);
});
it('manifest, brand icons, Apple metadata and private-safe service worker exist', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(manifest).toMatchObject({ name: 'COhere Boulder', start_url: '/today', display: 'standalone' });
    type Icon = { sizes: string; purpose: string; src: string };
    // "any" and "maskable" are separate files, never "any maskable" on one.
    expect(manifest.icons.map((i: Icon) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
    for (const icon of manifest.icons as Icon[]) expect(existsSync('public' + icon.src)).toBe(true);
    // No orientation lock: it fights tablets' two-column layout and WCAG 1.3.4.
    expect(manifest.orientation).toBeUndefined();
    expect(manifest.id).toBe('/today');
    expect(manifest.description.length).toBeGreaterThan(20);
    expect(manifest.theme_color).toBe('#F3ECDC');
    expect(readFileSync('index.html', 'utf8')).toContain('content="#F3ECDC"');
    expect((manifest.screenshots as { form_factor: string; src: string }[]).map(s => s.form_factor).sort()).toEqual(['narrow', 'narrow', 'wide']);
    for (const shot of manifest.screenshots as { src: string }[]) expect(existsSync('public' + shot.src)).toBe(true);
    expect(readFileSync('index.html', 'utf8')).toContain('apple-touch-icon');
    expect(readFileSync('public/sw.js', 'utf8')).toContain('notificationclick');
});
it('anonymous identity survives unavailable local storage without requiring PII', async () => {
    const { anonymousDevice } = await import('./companion');
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('storage denied'); }, setItem: () => { throw new Error('storage denied'); } } });
    try {
        const id = anonymousDevice();
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(anonymousDevice()).toBe(id);
    }
    finally {
        if (previous)
            Object.defineProperty(globalThis, 'localStorage', previous);
        else
            Reflect.deleteProperty(globalThis, 'localStorage');
    }
});
it('standalone mode supports the iOS standalone flag', () => {
    const nav = readFileSync('src/components/StandaloneMode.tsx', 'utf8');
    expect(nav.includes('standalone')).toBe(true);
    const css = readFileSync('src/index.css', 'utf8');
    expect(css.includes('.companion-standalone')).toBe(true);
});
it('uses ISO date parts even when locale formats dates with slashes',async()=>{
 const original=Intl.DateTimeFormat;
 const spy=vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(locale,options){const formatter=new original(locale,options);return new Proxy(formatter,{get(target,key){if(key==='format')return()=> '10/15/2026';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});} as typeof Intl.DateTimeFormat);
 try{expect(eventsForDays([{startsAt:'2026-10-15T20:00:00Z'}],'2026-10-15')).toHaveLength(1);}finally{spy.mockRestore();}
});
