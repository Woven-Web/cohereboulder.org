import {expect,it} from 'vitest';
import {reviseServiceWorker} from '../../scripts/pwa-build.mjs';
it('changes offline cache revision when the built app changes, stable for identical builds',()=>{
 const sw="const CACHE = 'cohere-companion-v1';";
 const first=reviseServiceWorker(sw,'<script src="/assets/app-a.js"></script>');
 expect(first).not.toBe(sw);
 expect(reviseServiceWorker(sw,'<script src="/assets/app-a.js"></script>')).toBe(first);
 expect(reviseServiceWorker(sw,'<script src="/assets/app-b.js"></script>')).not.toBe(first);
 expect(first).toMatch(/cohere-companion-[a-f0-9]{16}/);
});
