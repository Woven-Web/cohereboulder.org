import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
import Companion from '../pages/Companion';
import {LanguageProvider} from '../contexts/LanguageContext';
function render(path:string){
 const client=new QueryClient();
 client.setQueryData(['companion'],{date:'2026-10-15',daily:{title:'Local practice <script>',body:'Body',question:'Local question?'},quests:[{id:'walk',title:'Local walk',description:'Outside'}],pushKey:null,start:'2026-10-15',end:'2026-10-25'});
 client.setQueryData(['companion-events'],[{did:'did:plc:local',rkey:'local',name:'Local event',startsAt:'2026-10-16T01:00:00Z'},{did:'did:plc:local',rkey:'later',name:'Too late',startsAt:'2026-10-18T01:00:00Z'}]);
 return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(LanguageProvider,null,createElement(StaticRouter,{location:path},createElement(Companion)))));
}
it('renders actual Today practice, local event links, escaped content and optional-name reply form',()=>{
 const html=render('/today');expect(html).toContain('Local practice &lt;script&gt;');expect(html).toContain('Local event');expect(html).not.toContain('Too late');expect(html).toContain('Local question?');expect(html).toContain('Name (optional)');expect(html).toContain('/events/did%3Aplc%3Alocal/local');
});
it('renders real quest checklist and iOS installation guidance without requiring an account',()=>{
 expect(render('/quests')).toContain('type="checkbox"');expect(render('/quests')).toContain('Local walk');
 vi.stubGlobal('navigator',{userAgent:'iPhone',maxTouchPoints:1});
 try{const html=render('/more');expect(html).toContain('16.4+');expect(html).toContain('Add to Home Screen');expect(html).toContain('No account or email is required.');expect(html).not.toContain('Enable daily notifications');}finally{vi.unstubAllGlobals();}
});
it.each(['null','{}','42','[1,null]'])('ignores malformed stored checklist %s',value=>{
 vi.stubGlobal('localStorage',{getItem:()=>value});try{expect(render('/quests')).toContain('Local walk');}finally{vi.unstubAllGlobals();}
});
