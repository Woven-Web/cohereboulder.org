// Independent Node crypto receiver for hermetic tests only. Never shipped to Worker.
import {createECDH,generateKeyPairSync,verify,hkdfSync,createDecipheriv} from 'node:crypto';
export function createPushReceiver(origin) {
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw new Error('loopback required');
const ecdh=createECDH('prime256v1');ecdh.generateKeys();
const vapid=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=vapid.privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const auth=crypto.getRandomValues(new Uint8Array(16));
const fixture={publicKey,privateKey:jwk.d,subject:'mailto:test@example.test',endpoint:origin+'/push',p256dh:ecdh.getPublicKey().toString('base64url'),auth:Buffer.from(auth).toString('base64url')};
return {fixture,receive(headers,encrypted){
  const authHeader=headers.authorization||'',match=/^vapid t=([^,]+), k=(.+)$/.exec(authHeader);if(!match||match[2]!==publicKey)throw new Error('VAPID header');
  const [header,payload,sig]=match[1].split('.');const claims=JSON.parse(Buffer.from(payload,'base64url'));
  if(JSON.parse(Buffer.from(header,'base64url')).alg!=='ES256'||claims.aud!==origin||claims.sub!==fixture.subject||claims.exp<Date.now()/1000||claims.exp>Date.now()/1000+86400)throw new Error('VAPID claims');
  if(!verify('sha256',Buffer.from(header+'.'+payload),{key:vapid.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url')))throw new Error('signature');
  if(headers['content-encoding']!=='aes128gcm')throw new Error('encoding');
  const body=Buffer.from(encrypted);
  if(body.readUInt32BE(16)!==4096||body[20]!==65)throw new Error('record header');
  const salt=body.subarray(0,16),server=body.subarray(21,86),shared=ecdh.computeSecret(server);
  const ikm=Buffer.from(hkdfSync('sha256',shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ecdh.getPublicKey(),server]),32));
  const key=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));
  const nonce=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
  const decipher=createDecipheriv('aes-128-gcm',key,nonce);decipher.setAuthTag(body.subarray(-16));
  const plain=Buffer.concat([decipher.update(body.subarray(86,-16)),decipher.final()]);if(plain.at(-1)!==2)throw new Error('delimiter');
 return JSON.parse(plain.subarray(0,-1));
}};
}
