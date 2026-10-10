import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSql } from '../../scripts/companion-import.mjs';
import { testD1 } from './test-d1';

const daily = { date: '2026-10-15', title: 'Arrive', body: "Notice what's around you.", title_es: 'Llega', body_es: 'Observa.', question: 'What grew?', question_es: '¿Qué creció?' };
const quest = { id: 'water-walk', title: 'Water walk', description: 'Follow the creek.', title_es: 'Camino', description_es: 'Sigue el arroyo.', start_date: '2026-10-15', end_date: '2026-10-25' };

describe('generateSql', () => {
    it('emits idempotent upserts and nothing destructive', () => {
        const sql = generateSql({ daily: [daily], quests: [quest] });
        expect(sql).toContain('INSERT INTO companion_daily');
        expect(sql).toContain('ON CONFLICT(date) DO UPDATE');
        expect(sql).toContain('INSERT INTO companion_quests');
        expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
        expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
        expect(generateSql({ daily: [daily], quests: [quest] })).toBe(sql);
    });

    it('applies cleanly twice and stores the text verbatim, including quotes', async () => {
        const db = testD1(['../migrations/0010_companion.sql']) as unknown as D1Database;
        const sql = generateSql({ daily: [daily, { ...daily, date: '2026-10-16', title: "It's O'Neil; DROP TABLE x; --", question: undefined, question_es: undefined }], quests: [quest] });
        for (let run = 0; run < 2; run++) for (const statement of sql.split(/;\n/).filter(s => s.replace(/--.*$/gm, '').trim())) await db.prepare(statement).run();
        expect((await db.prepare('SELECT COUNT(*) AS n FROM companion_daily').first<{ n: number }>())!.n).toBe(2);
        expect(await db.prepare('SELECT * FROM companion_daily WHERE date=?1').bind('2026-10-15').first()).toMatchObject({ body: "Notice what's around you.", question_es: '¿Qué creció?' });
        expect(await db.prepare('SELECT title,question FROM companion_daily WHERE date=?1').bind('2026-10-16').first()).toEqual({ title: "It's O'Neil; DROP TABLE x; --", question: null });
        expect(await db.prepare('SELECT * FROM companion_quests').first()).toMatchObject({ id: 'water-walk', end_date: '2026-10-25' });
    });

    it('rewrites an existing row on a second import with edited text', async () => {
        const db = testD1(['../migrations/0010_companion.sql']) as unknown as D1Database;
        for (const title of ['First', 'Second']) for (const s of generateSql({ daily: [{ ...daily, title }] }).split(/;\n/).filter(x => x.replace(/--.*$/gm, '').trim())) await db.prepare(s).run();
        expect(await db.prepare('SELECT title FROM companion_daily').first()).toEqual({ title: 'Second' });
    });

    it.each([
        [{ daily: [{ ...daily, date: '2026-13-40' }] }, /date/],
        [{ daily: [{ ...daily, date: '2026-02-30' }] }, /date/],
        [{ daily: [{ ...daily, title: '' }] }, /title/],
        [{ daily: [{ ...daily, body: 'x'.repeat(3001) }] }, /body/],
        [{ daily: [daily, daily] }, /duplicate/],
        [{ quests: [{ ...quest, id: 'bad id!' }] }, /id/],
        [{ quests: [{ ...quest, end_date: '2026-10-01' }] }, /window|end_date/],
        [{ quests: [{ ...quest, start_date: undefined }] }, /start_date/],
        [{ daily: 'nope' }, /daily/],
        [{ extra: 1 }, /unknown/],
    ])('rejects invalid input %#', (input, message) => {
        expect(() => generateSql(input as never)).toThrow(message);
    });

    it('--staging only changes the commented target hint', () => {
        const prod = generateSql({ daily: [daily] }), staging = generateSql({ daily: [daily] }, { staging: true });
        expect(prod).toContain('--remote');
        expect(staging).toContain('cohere-staging');
        expect(prod.replace(/^--.*\n/gm, '')).toBe(staging.replace(/^--.*\n/gm, ''));
    });
});

describe('CLI', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/companion-import.mjs', ...args], { encoding: 'utf8' });
    it('prints SQL to stdout and exits 0', () => {
        const file = join(mkdtempSync(join(tmpdir(), 'pwa-import-')), 'c.json');
        writeFileSync(file, JSON.stringify({ daily: [daily] }));
        const result = run(file);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('INSERT INTO companion_daily');
        expect(result.stderr).toBe('');
    });
    it('fails with usage and no stdout on bad input', () => {
        const file = join(mkdtempSync(join(tmpdir(), 'pwa-import-')), 'c.json');
        writeFileSync(file, '{"daily":[{"date":"nope"}]}');
        for (const args of [[], [file]]) {
            const result = run(...args);
            expect(result.status).toBe(1);
            expect(result.stdout).toBe('');
            expect(result.stderr).not.toBe('');
        }
    });
});
