/** Capture early, once per page, so route navigation never loses install eligibility. */
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome:string}>;
}
interface InstallState { prompt: InstallPrompt|null; installed:boolean; }
let state:InstallState={prompt:null,installed:typeof window!=='undefined'&&(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true)};
const listeners=new Set<()=>void>();
const publish=(next:InstallState)=>{state=next;for(const listener of listeners)listener();};
export const getInstallState=()=>state;
export function subscribeInstall(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function clearInstallPrompt(){publish({...state,prompt:null});}
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();publish({...state,prompt:event as InstallPrompt});});
 window.addEventListener('appinstalled',()=>publish({prompt:null,installed:true}));
}
