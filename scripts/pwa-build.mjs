// Make the SW update whenever Vite's public app shell changes.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function reviseServiceWorker(source,indexHtml){
 const revision=createHash('sha256').update(indexHtml).digest('hex').slice(0,16);
 if(!source.includes("'cohere-companion-v1'"))throw new Error('missing service worker cache revision marker');
 return source.replace("'cohere-companion-v1'",`'cohere-companion-${revision}'`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const html=readFileSync('dist/index.html','utf8');
 writeFileSync('dist/sw.js',reviseServiceWorker(readFileSync('public/sw.js','utf8'),html));
}
