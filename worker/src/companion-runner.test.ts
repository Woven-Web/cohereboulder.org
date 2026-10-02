import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('hermetic runner includes push decryption and browser companion checks with isolated scratch and ports', () => {
    const runner = readFileSync('scripts/ci-e2e.sh', 'utf8');
    expect(runner.includes('E2E_PORT_OFFSET')).toBe(true);
    // companion-e2e refuses fixture writes outside this unique scratch prefix.
    expect(runner).toContain('/pwa-e2e-XXXXXX');
    expect(runner).toContain('/pwa-merge-worker-6.log');
    expect(runner).toContain('P28237=$(( 28237 + E2E_PORT_OFFSET ))');
    expect(runner).toContain('P28890=$(( 28890 + E2E_PORT_OFFSET ))');
    expect(runner).toContain('P28952=$(( 28952 + E2E_PORT_OFFSET ))');
    expect(runner.includes('companion-e2e.mjs')).toBe(true);
});
