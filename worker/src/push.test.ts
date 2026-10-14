import { expect, it } from 'vitest';
import { encryptPush, decode, encode, vapid, validEndpoint } from './push';
it('matches RFC8291 Appendix A ciphertext', async () => {
    const publicKey = decode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: encode(publicKey.slice(1, 33)), y: encode(publicKey.slice(33)), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const result = await encryptPush('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', { privateKey: key, publicKey, salt: decode('DGv6ra1nlYgDCS1FRnbzlw') });
    expect(encode(result.slice(86))).toBe('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ');
});
it('signs ES256 with origin audience and bounded expiry', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
    const pub = encode(new Uint8Array([4, ...decode(jwk.x!), ...decode(jwk.y!)]));
    const token = await vapid('https://fcm.googleapis.com/send/abc', pub, jwk.d!, 'mailto:test@example.test', 1000);
    const [header, payload, sig] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(decode(payload)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 4600, sub: 'mailto:test@example.test' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, decode(sig), new TextEncoder().encode(header + '.' + payload))).toBe(true);
});
it('rejects SSRF and credentials; local mock requires exact explicit config', () => {
    for (const url of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.test/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.test/x'])
        expect(validEndpoint(url)).toBe(false);
    expect(validEndpoint('https://fcm.googleapis.com/x')).toBe(true);
    expect(validEndpoint('http://127.0.0.1:10049/push', 'http://127.0.0.1:10049')).toBe(true);
});

it('accepts strict Apple push subdomains only',()=>{
 expect(validEndpoint('https://eu.web.push.apple.com/path')).toBe(true);
 for(const host of ['push.apple.com','evilpush.apple.com','web.push.apple.com.evil.test','-bad.push.apple.com','bad..push.apple.com'])expect(validEndpoint('https://'+host+'/path')).toBe(false);
});
it('truncates escaped controls and multibyte text within encryption budget without breaking Unicode',async()=>{
 const {serializePush}=await import('./push');
 for(const body of ['\u0000'.repeat(1000),'🌻'.repeat(1000)]){
 const result=serializePush({title:'\u0000'.repeat(200),body,url:'/today',tag:'2026-10-15-practice'});
 expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(3992);
 const parsed=JSON.parse(result);expect(parsed.url).toBe('/today');expect(body.startsWith(parsed.body)).toBe(true);expect(parsed.body).not.toContain('\ufffd');
 }
});
