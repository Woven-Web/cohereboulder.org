import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Companion from '../pages/Companion';
import {LanguageProvider} from '../contexts/LanguageContext';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T14:00:00Z'));});
afterEach(()=>{vi.useRealTimers();});
function render(path:string){
 const client=new QueryClient();
 client.setQueryData(['companion'],{date:'2026-10-15',daily:{title:'Local practice <script>',body:'Body',question:'Local question?'},quests:[{id:'walk',title:'Local walk',description:'Outside'}],pushKey:null,start:'2026-10-15',end:'2026-10-25'});
 client.setQueryData(['companion-events'],[{did:'did:plc:local',rkey:'local',name:'Local event',startsAt:'2026-10-16T01:00:00Z'},{did:'did:plc:local',rkey:'later',name:'Too late',startsAt:'2026-10-18T01:00:00Z'}]);
 return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(LanguageProvider,null,createElement(StaticRouter,{location:path},createElement(Companion)))));
}
it('renders actual Today practice, local event links, escaped content and optional-name reply form',()=>{
 const html=render('/today');expect(html).toContain('Local practice &lt;script&gt;');expect(html).toContain('Local event');expect(html).not.toContain('Too late');expect(html).toContain('Local question?');expect(html).toContain('Name (optional)');expect(html).toContain('/events/did%3Aplc%3Alocal/local');
 expect(html).toContain('Day 1 of 11');expect(html).toContain('I did it');expect(html).toContain('Write an answer');
 expect(html).toMatch(/<div hidden=""><form/);
});
it('before the gathering, Today shows a countdown and a labelled sample, never "not available yet"',()=>{
 vi.setSystemTime(new Date('2026-10-11T14:00:00Z'));
 const client=new QueryClient();
 client.setQueryData(['companion'],{date:'2026-10-11',daily:null,quests:[],pushKey:null,start:'2026-10-15',end:'2026-10-25'});
 client.setQueryData(['companion-events'],[]);
 const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(LanguageProvider,null,createElement(StaticRouter,{location:'/today'},createElement(Companion)))));
 expect(html).toContain('4 days until we gather');expect(html).toContain('Sample day');expect(html).toContain('Welcome. Start by arriving.');
 expect(html).not.toContain('not available yet');expect(html).not.toContain('I did it');
});
it('when the practice has not been published, Today says when it arrives instead of failing',()=>{
 vi.setSystemTime(new Date('2026-10-17T14:00:00Z'));
 const client=new QueryClient();
 client.setQueryData(['companion'],{date:'2026-10-17',daily:null,quests:[],pushKey:null,start:'2026-10-15',end:'2026-10-25'});
 client.setQueryData(['companion-events'],[]);
 const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(LanguageProvider,null,createElement(StaticRouter,{location:'/today'},createElement(Companion)))));
 expect(html).toContain('arrives at 6 AM');expect(html).not.toContain('not available yet');expect(html).not.toContain('I did it');
});
it('renders real quest checklist and iOS installation guidance without requiring an account',()=>{
 expect(render('/quests')).toContain('type="checkbox"');expect(render('/quests')).toContain('Local walk');
 vi.stubGlobal('navigator',{userAgent:'iPhone',maxTouchPoints:1});
 try{const html=render('/more');expect(html).toContain('16.4+');expect(html).toContain('Add to Home Screen');expect(html).toContain('No account or email is required.');expect(html).not.toContain('Enable daily notifications');}finally{vi.unstubAllGlobals();}
});
it.each(['null','{}','42','[1,null]'])('ignores malformed stored checklist %s',value=>{
 vi.stubGlobal('localStorage',{getItem:()=>value});try{expect(render('/quests')).toContain('Local walk');}finally{vi.unstubAllGlobals();}
});

it.each(['en','es'] as const)('celebration renders an accessible screen with a localized dismiss action (%s)',async language=>{
 const {Dialog}=await import('../components/ui/dialog');
 const {QuestCelebration}=await import('../components/QuestCelebration');
 const {getTranslation}=await import('./translations');
 const html=renderToStaticMarkup(createElement(Dialog,{open:true},createElement(QuestCelebration,{tr:key=>getTranslation(key,language),onDismissFocus:()=>{}})));
 expect(html).toContain('role="dialog"');
 expect(html).toContain('aria-labelledby=');expect(html).toContain('aria-describedby=');
 expect(html).toContain('companion-celebration');
 expect(html).toContain(getTranslation('companion.yay',language));
 expect(html).toContain(getTranslation('companion.continue',language));
 expect(html).toContain('<button');
});

it.each([['en','Only the COhere organizers can read replies, including the optional name.'],['es','Solo las organizadoras y organizadores de COhere pueden leer las respuestas, incluido el nombre opcional.']] as const)('reply form says who can read replies (%s)',async(language,line)=>{
 const {getTranslation}=await import('./translations');
 expect(getTranslation('companion.replyAudience',language)).toBe(line);
 expect(render('/today')).toContain(getTranslation('companion.replyAudience','en'));
});
