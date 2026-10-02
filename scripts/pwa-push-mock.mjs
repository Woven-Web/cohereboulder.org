// Hermetic loopback push receiver: fresh throwaway keys, real RFC8291 decryption.
import http from 'node:http';
import {writeFileSync} from 'node:fs';
import {createPushReceiver} from './pwa-push-receiver.mjs';
const port=Number(process.env.PORT||10049);
const receiver=createPushReceiver(`http://127.0.0.1:${port}`);
if(!process.env.PWA_KEYS_FILE)throw new Error('PWA_KEYS_FILE required (scratch only)');
writeFileSync(process.env.PWA_KEYS_FILE,JSON.stringify(receiver.fixture),{mode:0o600});
const messages=[],errors=[];
http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/messages'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({messages,errors}));return;}
 if(req.method!=='POST'||req.url!=='/push'){res.writeHead(404);res.end();return;}
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  messages.push(receiver.receive(req.headers,Buffer.concat(chunks)));res.writeHead(201);res.end();
 }catch(e){errors.push(e.message);res.writeHead(400);res.end('invalid encrypted push');}
}).listen(port,'127.0.0.1');
