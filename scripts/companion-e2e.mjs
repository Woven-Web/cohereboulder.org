// Local only: never contact push services or production; keys exist only in scratch.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const [base,token,pushOrigin,keysFile,mockOrigin]=process.argv.slice(2);
for(const url of [base,pushOrigin,mockOrigin])if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||''))throw new Error('loopback endpoints required');
const keys=JSON.parse(readFileSync(keysFile,'utf8'));
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const device=crypto.randomUUID();
async function api(path,body,method=body?'POST':'GET',admin=false){const response=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(admin?{Cookie:`cohere_session=${token}`}:{})},body:body?JSON.stringify(body):undefined});return response;}
const content='/api/admin/companion/content';
assert.equal((await api('/api/companion/today')).status,200);
assert.equal((await api(content)).status,401);
assert.equal((await api(content,{type:'daily',date,title:'Local daily practice',body:'A local practice only',question:'Local question?',title_es:'Práctica local',question_es:'¿Pregunta local?'},'PUT',true)).status,200);
assert.equal((await api(content,{type:'quest',id:'local-walk',title:'Local walk',description:'Local test quest',start_date:date,end_date:date},'PUT',true)).status,200);
assert.equal((await api('/api/companion/subscriptions',{device_id:device,endpoint:keys.endpoint,p256dh:keys.p256dh,auth:keys.auth,language:'en'})).status,200);
// Normalize local fixture creation time before the simulated slots, regardless
// of the real time of day. The persist dir must be the runner's unique scratch.
const persist=process.env.E2E_PERSIST_DIR;
if(!persist||!persist.includes('/pwa-e2e-'))throw new Error('unique pwa scratch persistence required');
execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','cohere','--local','--persist-to',persist,'--command',`UPDATE companion_subscriptions SET created_at='${date}T00:00:00.000Z' WHERE device_id='${device}'`],{stdio:'pipe'});
// A public local fixture tomorrow is always future-facing to the existing reader.
const tomorrow=new Date(date+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
const create=await api('/api/admin/events',{name:'Local tomorrow gathering',startsAt:tomorrow.toISOString().slice(0,10)+'T20:00:00Z',endsAt:tomorrow.toISOString().slice(0,10)+'T22:00:00Z'},'POST',true);
assert.equal(create.status,200);
const createdEvent=await create.json();
const eventPath='/events/'+encodeURIComponent(createdEvent.did)+'/'+encodeURIComponent(createdEvent.rkey);
// Exercise all three slots at configured local dates, concurrently and repeatedly.
for(const [hour,slot] of [[12,'practice'],[15,'events'],[21,'question']]){
 const timestamp=Date.parse(date+`T${hour}:00:00Z`);
 const url=base+'/cdn-cgi/local/scheduled?cron='+encodeURIComponent(`0 ${hour} * * *`)+'&time='+timestamp;
 const responses=await Promise.all([fetch(url),fetch(url)]);for(const r of responses)assert.equal(r.status,200);
 await fetch(url);
 const {messages,errors}=await (await fetch(pushOrigin+'/messages')).json();assert.deepEqual(errors,[]);
 const matching=messages.filter(m=>m.tag===date+'-'+slot);
 assert.equal(matching.length,1,slot);assert.equal(matching[0].url,'/today');
 assert.equal(matching[0].title,slot==='practice'?'Local daily practice':slot==='question'?'Local question?':'Events today and tomorrow');
 assert.equal(matching[0].body,slot==='practice'?'A local practice only':slot==='question'?'':'Local tomorrow gathering');
}
process.stdout.write('PASS companion: three encrypted slots, overlap claims and local event payloads\n');
assert.equal((await api('/api/companion/replies',{device_id:device,reply:'=local formula',name:'<script>local</script>'})).status,200);
assert.equal((await api('/api/companion/replies',{device_id:device,reply:'again'})).status,429);
const csv=await api('/api/admin/companion/replies.csv',undefined,'GET',true);assert.match(await csv.text(),/'=local formula/);
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 // Block any non-local requests; this lane is hermetic even for existing links/embeds.
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/today');await page.getByRole('heading',{name:'Local daily practice',exact:true}).waitFor();
 await page.getByRole('button',{name:'En/Es',exact:true}).last().click();await page.getByRole('heading',{name:'Práctica local',exact:true}).waitFor();await page.getByRole('button',{name:'Es/En',exact:true}).last().click();
 try { await page.getByRole('heading',{name:'Local tomorrow gathering',exact:true}).waitFor({timeout:5000}); } catch(error) { process.stderr.write(JSON.stringify(await page.evaluate(async()=>({today:await (await fetch('/api/companion/today')).json(),events:await (await fetch('/api/events')).json(),text:document.querySelector('.companion-page')?.textContent})))+'\n');throw error; }
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.localCopied=value;}}});});
 await page.getByRole('button',{name:'Share',exact:true}).click();assert.match(await page.getByRole('link',{name:'Share by text',exact:true}).getAttribute('href'),/^sms:/);
 await page.getByRole('button',{name:'Copy link',exact:true}).click();await page.getByRole('status').filter({hasText:'Link copied'}).waitFor();assert.equal(await page.evaluate(()=>window.localCopied),base+eventPath);
 await page.getByLabel('Your reply', {exact:true}).fill('Browser local reply');await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByRole('status').filter({hasText:'Your reply is saved'}).waitFor();
 await page.getByRole('link',{name:'Quests',exact:true}).last().click();await page.getByRole('checkbox',{name:'Local walk'}).check();const celebration=page.getByRole('dialog',{name:'YAY!',exact:true});await celebration.waitFor();
 const continueButton=celebration.getByRole('button',{name:'Continue',exact:true});
 // Visibility precedes Radix's passive mount effects. Observe its autofocus
 // (never force focus) before testing the focus trap or sending Escape.
 const waitForContinueFocus=async()=>{
  await page.waitForFunction(()=>document.activeElement===document.querySelector('.companion-celebration button'));
  // Layer registration also schedules a render that updates Escape's layer
  // index. Let that mount work finish before the next keyboard event.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
 };
 await waitForContinueFocus();
 assert.equal(await continueButton.evaluate(el=>document.activeElement===el),true);
 const screen=await celebration.boundingBox();assert.equal(screen.width,390);assert.equal(screen.height,844);
 await page.keyboard.press('Tab');assert.equal(await continueButton.evaluate(el=>document.activeElement===el),true);
 await continueButton.click();await celebration.waitFor({state:'hidden'});
 // Radix restores focus after its asynchronous unmount cleanup; hidden alone
 // does not prove that cleanup has completed on a slower CI browser.
 await page.waitForFunction(()=>document.activeElement===document.querySelector('.companion-check input'));
 // A failed/offline report must not suppress local celebration or lose the check.
 await page.getByRole('checkbox',{name:'Local walk'}).uncheck();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/companion/completions',route=>route.abort());
 await page.getByRole('checkbox',{name:'Local walk'}).check();await celebration.waitFor();
 await waitForContinueFocus();
 assert.equal(await celebration.locator('.companion-yay').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.keyboard.press('Escape');await celebration.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement===document.querySelector('.companion-check input'));
 await page.getByRole('status').filter({hasText:'The completion report could not be sent.'}).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:'Local walk'}).isChecked(),true);
 await page.unroute('**/api/companion/completions');
 await page.getByRole('button',{name:'Retry completion report',exact:true}).click();
 await page.getByRole('button',{name:'Retry completion report',exact:true}).waitFor({state:'hidden'});
 assert.equal(await celebration.count(),0);
 await page.getByRole('button',{name:'En/Es',exact:true}).last().click();
 await page.getByRole('checkbox',{name:'Local walk'}).uncheck();await page.getByRole('checkbox',{name:'Local walk'}).check();
 await page.getByRole('dialog',{name:'¡YAY!',exact:true}).getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('button',{name:'Es/En',exact:true}).last().click();
 await page.reload();await page.getByRole('checkbox',{name:'Local walk'}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Local walk'}).isChecked(),true);
 await page.goto(base+'/more');await page.getByRole('heading',{name:'Install COhere',exact:true}).waitFor();
 // Simulate Chromium's install event without attempting a real browser install.
 await page.evaluate(()=>{const e=new Event('beforeinstallprompt');e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);});
 await page.getByRole('button',{name:'Install COhere',exact:true}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await page.getByText('COhere is installed',{exact:true}).waitFor();
 // Mock only browser permission/subscription APIs; registration and settings use the real local Worker.
 const pushPage=await context.newPage();
 await pushPage.addInitScript(fixture=>{
   let subscription=null;
   const sub={toJSON:()=>({endpoint:fixture.endpoint,keys:{p256dh:fixture.p256dh,auth:fixture.auth}}),unsubscribe:async()=>{subscription=null;return true;}};
   Object.defineProperty(window,'PushManager',{value:class {}});
   Object.defineProperty(Notification,'permission',{get:()=> 'granted'});
   Notification.requestPermission=async()=> 'granted';
   const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{subscription=sub;return sub;}}};
   Object.defineProperty(navigator.serviceWorker,'ready',{value:Promise.resolve(registration)});
   navigator.serviceWorker.getRegistration=async()=>registration;
 },keys);
 // Remove the API fixture first so the browser can register the same local endpoint.
 assert.equal((await api('/api/companion/subscriptions',{device_id:device},'DELETE')).status,200);
 await pushPage.goto(base+'/more');
 const enrolled=pushPage.waitForResponse(r=>r.url().endsWith('/api/companion/subscriptions')&&r.request().method()==='POST');
 await pushPage.getByRole('button',{name:'Enable daily notifications',exact:true}).click();const enrollment=await enrolled;assert.equal(enrollment.status(),200);
 await pushPage.getByText('Daily notifications are on.',{exact:true}).waitFor();
 const synced=pushPage.waitForResponse(r=>r.url().endsWith('/api/companion/subscriptions')&&r.request().method()==='PATCH'&&r.request().postDataJSON().language==='es');
 await pushPage.getByRole('button',{name:/^(En\/Es|Es\/En)$/}).last().click();assert.equal((await synced).status(),200);
 // A failed language update must be visible.
 await pushPage.route('**/api/companion/subscriptions',route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'local failure'}}):route.continue());
 await pushPage.getByRole('button',{name:/^(En\/Es|Es\/En)$/}).last().click();await pushPage.getByRole('status').filter({hasText:'Could not save.'}).waitFor();
 await pushPage.unroute('**/api/companion/subscriptions');
 await pushPage.evaluate(()=>localStorage.removeItem('cohere-companion-device'));
 const removed=pushPage.waitForResponse(r=>r.url().endsWith('/api/companion/subscriptions')&&r.request().method()==='DELETE');
 await pushPage.getByRole('button',{name:'Turn off notifications',exact:true}).click();
 const removal=await removed;assert.equal(removal.status(),200);assert.equal(removal.request().postDataJSON().auth,keys.auth);assert.notEqual(removal.request().postDataJSON().device_id,enrollment.request().postDataJSON().device_id);
 // No durable endpoint remains: registering it under a fresh identity succeeds.
 const fresh=crypto.randomUUID();assert.equal((await api('/api/companion/subscriptions',{device_id:fresh,endpoint:keys.endpoint,p256dh:keys.p256dh,auth:keys.auth})).status,200);
 await api('/api/companion/subscriptions',{device_id:fresh},'DELETE');await pushPage.close();
 process.stdout.write('PASS companion: browser enrollment, language sync/failure and possession-based storage-loss opt-out\n');
 // Freeze browser wall time across Denver midnight and provide local next-day content.
 const rolloverContext=await browser.newContext({serviceWorkers:'block'});
 await rolloverContext.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const rollover=await rolloverContext.newPage();await rollover.clock.setFixedTime(new Date(tomorrow.toISOString().slice(0,10)+'T05:59:59Z'));
 let day=date,reads=0;
 await rollover.route('**/api/companion/today',route=>{reads++;return route.fulfill({json:{date:day,daily:{title:'Rollover practice',question:'Rollover question'},quests:[],pushKey:null}});});
 await rollover.route('**/api/companion/replies',route=>route.fulfill({json:{ok:true}}));
 await rollover.goto(base+'/today');await rollover.getByLabel('Your reply',{exact:true}).fill('Local answer');await rollover.getByRole('button',{name:'Send reply',exact:true}).click();await rollover.getByRole('status').filter({hasText:'Your reply is saved'}).waitFor();
 assert.equal(await rollover.locator('.companion-page textarea').isDisabled(),true);
 day=tomorrow.toISOString().slice(0,10);const before=reads;
 await rollover.clock.setFixedTime(new Date(tomorrow.toISOString().slice(0,10)+'T06:00:01Z'));await rollover.getByLabel('Your reply',{exact:true}).waitFor();
 await rollover.waitForFunction(()=>!document.querySelector('.companion-page textarea')?.disabled);
 assert(reads>before);assert.equal(await rollover.locator('.companion-page textarea').inputValue(),'');await rolloverContext.close();
 process.stdout.write('PASS companion: Denver rollover refreshes content and resets answered form\n');
 // Permission denial must be visible and must never trigger a prompt on render.
 await page.addInitScript(()=>{Object.defineProperty(Notification,'permission',{get:()=> 'denied'});Notification.requestPermission=()=>{throw new Error('unexpected permission prompt');};});
 await page.reload();await page.getByText('Notifications are blocked.',{exact:false}).waitFor();
 const ios=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Version/16.4 Mobile Safari/604.1',isMobile:true,hasTouch:true});
 await ios.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const ip=await ios.newPage();await ip.goto(base+'/more');await ip.getByText('Notifications require iOS/iPadOS 16.4+',{exact:false}).waitFor();await ip.getByText('Choose Add to Home Screen',{exact:false}).waitFor();
 assert.equal(await ip.getByRole('button',{name:'Enable daily notifications'}).count(),0);await ios.close();
 const unsupported=await context.newPage();await unsupported.addInitScript(()=>{Object.defineProperty(window,'Notification',{value:undefined});});await unsupported.goto(base+'/more');await unsupported.getByText('This browser does not support Web Push.',{exact:true}).waitFor();await unsupported.close();
 const disabled=await context.newPage();await disabled.route('**/api/companion/today',route=>route.fulfill({json:{date,daily:null,quests:[],pushKey:null,start:date,end:date}}));await disabled.goto(base+'/more');await disabled.getByText('Notifications are unavailable while organizers configure delivery.',{exact:true}).waitFor();await disabled.close();
 // Standalone nav safe area; desktop remains hidden.
 await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,media:query,addEventListener(){},removeEventListener(){}}:original(query);});
 await page.goto(base+'/today');await page.locator('.companion-bottom').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overscrollBehavior),'none');
 // CSS display-mode is browser-managed; verify desktop nav is hidden separately.
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});await desktop.goto(base+'/today');assert.equal(await desktop.locator('.companion-bottom').isVisible(),false);await desktop.close();
 // Authenticated operator portal uses its desktop layout.
 const adminContext=await browser.newContext({viewport:{width:1280,height:900}});
 await adminContext.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const adminPage=await adminContext.newPage();adminPage.on('pageerror',error=>errors.push(error.message));
 await adminContext.addCookies([{name:'cohere_session',value:token,url:base}]);await adminPage.goto(base+'/admin');await adminPage.getByRole('tab',{name:'Companion / Compañero',exact:true}).click();
 await adminPage.locator('#comp-existing option[value="'+date+'"]').waitFor({state:'attached'});
 await adminPage.getByLabel('Companion content JSON', {exact:false}).fill(JSON.stringify({type:'daily',date,title:'Browser edited practice',body:'Local',question:'Question'}));
 await adminPage.getByRole('button',{name:'Save / Guardar',exact:true}).click();await adminPage.locator('#comp-message').filter({hasText:'Saved'}).waitFor();
 await adminPage.getByRole('button',{name:'Load replies / Ver respuestas',exact:true}).click();await adminPage.locator('#comp-reply-rows').getByText('<script>local</script>',{exact:true}).waitFor();
 assert.equal(await adminPage.locator('#comp-reply-rows script').count(),0);
 await adminContext.close();
 // SW installed shell opens /today offline, and contains no API/admin entries.
 await page.goto(base+'/today');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 const cacheKeys=await page.evaluate(async()=>{const name=(await caches.keys()).find(k=>k.startsWith('cohere-companion-'));if(!name)throw new Error('offline shell not installed');const cache=await caches.open(name);return (await cache.keys()).map(r=>new URL(r.url).pathname);});assert(cacheKeys.includes('/today'));assert(!cacheKeys.some(p=>/^\/(api|admin|xrpc)/.test(p)));
 await context.setOffline(true);await page.goto(base+'/today');await page.getByRole('heading',{name:'Your daily companion',exact:true}).waitFor();await context.setOffline(false);
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser.close();}
assert.equal((await api('/api/companion/subscriptions',{device_id:device},'DELETE')).status,200);
process.stdout.write('Companion e2e passed: local encrypted push, concurrency, API, mocked browser enrollment/opt-out, language sync, rollover, mobile, install, quests, admin and offline shell.\n');
