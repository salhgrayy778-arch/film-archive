/* Phone notifications (web push): follow, like on a review, new role. One switch in the Tools menu.
 * Needs the install-as-app step on iPhone; on Android and desktop it also works from the browser. */
(function(){
'use strict';
const VAPID='BFqOpJG58wx8zLWvvhKhWea_OGmapUFHpeqjk7gogVHjKeNumtcAHQh_5coEnIOkM2FK2SMBgRYEC-9rYA5wFJ8';
const ua=navigator.userAgent||'';
const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&window.isSecureContext;
const flagKey=()=>'film-push-on-v1:'+(typeof ses!=='undefined'&&ses?ses.id:'');
const getFlag=()=>{try{return localStorage.getItem(flagKey())==='1';}catch(e){return false;}};
const setFlag=v=>{try{v?localStorage.setItem(flagKey(),'1'):localStorage.removeItem(flagKey());}catch(e){}};
const announce=()=>window.dispatchEvent(new CustomEvent('film-push-state'));
const key64=s=>{const p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b);return Uint8Array.from([...r].map(c=>c.charCodeAt(0)));};
async function reg(){try{return await Promise.race([navigator.serviceWorker.ready,new Promise((_,j)=>setTimeout(j,6000))]);}catch(e){return null;}}

/* 'unsupported' | 'need-install' | 'signin' | 'denied' | 'off' | 'on' */
async function state(){
 if(!supported())return isIOS&&!standalone()?'need-install':'unsupported';
 if(isIOS&&!standalone())return 'need-install';
 if(typeof ses==='undefined'||!ses)return 'signin';
 if(Notification.permission==='denied')return 'denied';
 if(!getFlag())return 'off';
 const r=await reg();const s=r?await r.pushManager.getSubscription():null;
 return s&&Notification.permission==='granted'?'on':'off';
}
async function enable(){
 const st=await state();if(st==='need-install'||st==='unsupported'||st==='signin'||st==='denied')return st;
 const perm=await Notification.requestPermission();
 if(perm!=='granted'){announce();return perm==='denied'?'denied':'off';}
 const r=await reg();if(!r)return 'unsupported';
 try{
  try{(await r.pushManager.getSubscription())?.unsubscribe();}catch(e){}
  const sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key64(VAPID)});
  const j=sub.toJSON();
  await restCall('/film_push_subs?on_conflict=endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify({user_id:ses.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})});
  setFlag(true);announce();return 'on';
 }catch(e){
  try{(await (await reg())?.pushManager.getSubscription())?.unsubscribe();}catch(_){}
  announce();return e?.status===404?'no-table':'error';
 }
}
async function disable(){
 const r=await reg();const s=r?await r.pushManager.getSubscription():null;
 if(s){try{await restCall('/film_push_subs?endpoint=eq.'+encodeURIComponent(s.endpoint),{method:'DELETE'});}catch(e){}try{await s.unsubscribe();}catch(e){}}
 setFlag(false);announce();return 'off';
}
// signing out: this phone must stop receiving the previous account's notifications
window.addEventListener('film-account-state',async()=>{
 if(typeof ses!=='undefined'&&ses){announce();return;}
 const r=supported()?await reg():null;try{(await r?.pushManager.getSubscription())?.unsubscribe();}catch(e){}announce();
});
window.filmPush={state,enable,disable,supported,isIOS,standalone};
})();
