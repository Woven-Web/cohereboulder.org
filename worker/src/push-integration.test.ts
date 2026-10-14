import { expect, it } from 'vitest';
import { encryptPush, vapid } from './push';
import { createPushReceiver } from '../../scripts/pwa-push-receiver.mjs';
it('local mock decrypts WebCrypto payloads and validates VAPID; refuses tampering', async () => {
    const receiver = createPushReceiver('http://127.0.0.1:10049');
    const keys = receiver.fixture;
    const payload = { title: 'Local practice', body: 'Local body', url: '/today', tag: '2026-10-15-practice' };
    const body = await encryptPush(JSON.stringify(payload), keys.p256dh, keys.auth);
    const token = await vapid(keys.endpoint, keys.publicKey, keys.privateKey, keys.subject);
    const headers = { authorization: `vapid t=${token}, k=${keys.publicKey}`, 'content-encoding': 'aes128gcm' };
    expect(receiver.receive(headers, body)).toEqual(payload);
    const bad = body.slice();
    bad[90] ^= 1;
    expect(() => receiver.receive(headers, bad)).toThrow();
    expect(() => receiver.receive({ ...headers, authorization: 'vapid t=bad, k=bad' }, body)).toThrow();
});
