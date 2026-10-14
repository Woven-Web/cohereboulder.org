import {expect,it,vi} from 'vitest';
it('keeps a deferred install event across navigation and discards a used or installed prompt',async()=>{
 const target=new EventTarget();vi.stubGlobal('window',target);vi.stubGlobal('matchMedia',()=>({matches:false}));
 try{
  const store=await import('./install');
  const prompt=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt:vi.fn(async()=>{}),userChoice:Promise.resolve({outcome:'dismissed'})});
  target.dispatchEvent(prompt);expect(prompt.defaultPrevented).toBe(true);
  // A later route sees the event captured before it mounted.
  expect(store.getInstallState().prompt).toBe(prompt);store.clearInstallPrompt();expect(store.getInstallState().prompt).toBe(null);
  target.dispatchEvent(prompt);target.dispatchEvent(new Event('appinstalled'));
  expect(store.getInstallState()).toMatchObject({prompt:null,installed:true});
 }finally{vi.unstubAllGlobals();}
});
