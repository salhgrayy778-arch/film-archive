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

/* Offer notifications once after sign-in (everyone who can use them): "Turn on" or, on iPhone, "Install first".
   "Later" asks again after a week; turning on or blocking in the browser ends it. */
const askKey=()=>'film-push-ask-v1:'+(typeof ses!=='undefined'&&ses?ses.id:'');
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
let bar=null,askTimer=0,askTries=0;
function closeBar(){bar?.remove();bar=null;}
async function maybeAsk(){
 clearTimeout(askTimer);
 if(bar||typeof ses==='undefined'||!ses)return;
 const last=(()=>{try{return Number(localStorage.getItem(askKey()))||0;}catch(e){return 0;}})();
 if(last&&Date.now()-last<7*864e5)return;
 const st=await state();
 if(st!=='off'&&st!=='need-install')return;
 if(st==='off'&&Notification.permission!=='default')return;
 const busy=document.querySelector('dialog[open],.overlay.open,.stLayer,.suLayer,.piBar,.fcMenu')||document.body.classList.contains('roomFocus')||document.body.classList.contains('cinema')||document.getElementById('drawer')?.classList.contains('open')||(window.visualViewport?.scale||1)>1.05||document.activeElement?.matches?.('input,textarea');
 if(busy){if(++askTries<25)askTimer=setTimeout(maybeAsk,4000);return;}
 const mk=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;};
 bar=mk('div','piBar');bar.setAttribute('role','region');bar.setAttribute('aria-label',T('اعلان روی گوشی','Phone notifications'));
 const ic=mk('span','piIcon piBell','🔔');
 const tx=mk('div','piText');
 tx.append(mk('b','',T('اعلان‌ها را روشن کن','Turn on notifications')),
  mk('small','',st==='off'?T('وقتی کسی دنبالت کند یا نظرت را لایک کند، روی گوشی یا کامپیوتر خبردار شو.','Get told on your phone or computer when someone follows you or likes your review.')
   :T('برای دریافت اعلان روی آیفون، اول سایت را نصب کن.','On iPhone, install the site first to get notifications.')));
 const go=mk('button','piGo',st==='off'?T('روشن کن','Turn on'):T('نصب','Install'));go.type='button';
 const later=mk('button','piLater','✕');later.type='button';later.setAttribute('aria-label',T('بعداً','Later'));
 const remember=()=>{try{localStorage.setItem(askKey(),String(Date.now()));}catch(e){}};
 later.onclick=()=>{remember();closeBar();};
 go.onclick=async()=>{
  remember();
  if(st==='off'){go.disabled=true;go.textContent='…';const r=await enable();
   if(r==='on'){tx.querySelector('b').textContent=T('اعلان‌ها روشن شد ✓','Notifications are on ✓');tx.querySelector('small').textContent='';setTimeout(closeBar,1800);}
   else{closeBar();try{window.toast?.(r==='denied'?T('اجازهٔ اعلان داده نشد','Notification permission was not granted'):T('روشن نشد؛ از ابزارها دوباره امتحان کن','Could not turn on; try again from Tools'));}catch(e){}}
  }else{closeBar();window.filmInstall?.install?.();}
 };
 bar.append(ic,tx,go,later);document.body.appendChild(bar);
}
// signing out: this phone must stop receiving the previous account's notifications
window.addEventListener('film-account-state',async()=>{
 if(typeof ses!=='undefined'&&ses){announce();askTries=0;clearTimeout(askTimer);askTimer=setTimeout(maybeAsk,7000);return;}
 closeBar();
 const r=supported()?await reg():null;try{(await r?.pushManager.getSubscription())?.unsubscribe();}catch(e){}announce();
});
window.filmPush={ask:maybeAsk,state,enable,disable,supported,isIOS,standalone};
})();
