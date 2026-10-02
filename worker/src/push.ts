/** Web Push: RFC8291/RFC8188 encryption and RFC8292 VAPID, WebCrypto only. */
export function decode(s: string): Uint8Array { if (!/^[A-Za-z0-9_-]+$/.test(s))
    throw new Error('invalid base64url'); return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export function encode(b: Uint8Array): string { return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const bytes = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of parts) {
    b.set(p, offset);
    offset += p.length;
} return b; };
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) { const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)); }
export async function encryptPush(payload: string, p256dh: string, auth: string, fixed?: {
    privateKey: CryptoKey;
    publicKey: Uint8Array;
    salt: Uint8Array;
}): Promise<Uint8Array> {
    const ua = decode(p256dh), secret = decode(auth);
    if (ua.length !== 65 || ua[0] !== 4 || secret.length !== 16)
        throw new Error('invalid subscription keys');
    const receiver = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const pair = fixed ? null : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pub = fixed?.publicKey ?? new Uint8Array(await crypto.subtle.exportKey('raw', pair!.publicKey));
    const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiver }, fixed?.privateKey ?? pair!.privateKey, 256));
    const ikm = await hkdf(shared, secret, concat(bytes('WebPush: info\0'), ua, pub), 32);
    const cek = await hkdf(ikm, salt, bytes('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(ikm, salt, bytes('Content-Encoding: nonce\0'), 12);
    const plain = concat(bytes(payload), new Uint8Array([2]));
    if (plain.length > 3993)
        throw new Error('push payload too large');
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
    return concat(salt, new Uint8Array([0, 0, 16, 0, 65]), pub, ciphertext);
}
export function validEndpoint(endpoint: string, localMock?: string): boolean {
    try {
        const u = new URL(endpoint);
        if (u.username || u.password || u.hash || endpoint.length > 2048)
            return false;
        // Local allowance is deliberately exact and restricted to loopback; never an arbitrary origin.
        if (localMock && /^http:\/\/127\.0\.0\.1:\d+$/.test(localMock) && u.origin === localMock)
            return true;
        return u.protocol === 'https:' && (!u.port || u.port === '443') && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(u.hostname) || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+push\.apple\.com$/.test(u.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));
    }
    catch {
        return false;
    }
}
export async function vapid(endpoint: string, publicKey: string, privateKey: string, subject: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))
        throw new Error('invalid VAPID subject');
    const raw = decode(publicKey);
    if (raw.length !== 65 || raw[0] !== 4 || decode(privateKey).length !== 32)
        throw new Error('invalid VAPID key');
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: encode(raw.slice(1, 33)), y: encode(raw.slice(33)), d: privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const data = encode(bytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + encode(bytes(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 3600, sub: subject })));
    return data + '.' + encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(data))));
}

/** Budget the serialized UTF-8 message, including JSON escapes and metadata. */
export function serializePush(payload: {title:string;body:string;url:string;tag:string}): string {
    const copy={...payload};
    let result=JSON.stringify(copy);
    while (new TextEncoder().encode(result).length > 3992) {
        const field=copy.body ? 'body' : 'title';
        const points=Array.from(copy[field]);
        if (!points.length) throw new Error('push metadata too large');
        points.pop(); copy[field]=points.join(''); result=JSON.stringify(copy);
    }
    return result;
}
