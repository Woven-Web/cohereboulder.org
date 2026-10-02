import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('hermetic runner includes push decryption and browser companion checks with isolated scratch and ports', () => {
    const runner = readFileSync('scripts/ci-e2e.sh', 'utf8');
    expect(runner.includes('E2E_PORT_OFFSET')).toBe(true);
    expect(runner.includes('pwa-')).toBe(true);
    expect(runner.includes('companion-e2e.mjs')).toBe(true);
});
