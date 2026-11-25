/* Install the site like an app: one friendly banner for everyone who can install it (once, closable),
 * plus an "Install on phone" row in the Tools menu. Android/desktop Chrome use the real install prompt;
 * iPhone/iPad and other browsers get a short step-by-step guide. */
(function(){
'use strict';
const doc=document;
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const KEY='film-install-later-v1',DONE='film-installed-v1';
const standalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
const ua=navigator.userAgent||'';
const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isAndroid=/Android/i.test(ua);
const get=k=>{try{return localStorage.getItem(k)||'';}catch(e){return '';}};
const put=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
let deferred=null,banner=null,guide=null;

if('serviceWorker' in navigator&&/^https:$/.test(location.protocol)){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{});});
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;announce();setTimeout(maybeShow,4000);});
window.addEventListener('appinstalled',()=>{put(DONE,'1');deferred=null;closeBanner();announce();try{window.toast?.(T('نصب شد ✓ حالا از صفحهٔ اصلی گوشی‌ات باز کن','Installed ✓ open it from your home screen'));}catch(e){}});
const announce=()=>window.dispatchEvent(new CustomEvent('film-install-state',{detail:{available:canOffer()}}));
const installed=()=>standalone()||get(DONE)==='1';
const canOffer=()=>!installed()&&Boolean(deferred||isIOS||isAndroid||/Mobi/i.test(ua)||true);

function closeBanner(){banner?.remove();banner=null;}
function closeGuide(){guide?.remove();guide=null;doc.removeEventListener('keydown',onKey,true);}
function onKey(e){if(guide&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeGuide();}}

function stepsFor(){
 if(isIOS)return {title:T('نصب روی آیفون و آیپد','Install on iPhone / iPad'),steps:[
  [T('سایت را در Safari باز کن (در مرورگرهای دیگر ممکن است گزینه نباشد).','Open the site in Safari.')],
  [T('دکمهٔ اشتراک‌گذاری را بزن: مربعی با فلشِ رو به بالا، پایین صفحه.','Tap the Share button: a square with an arrow, at the bottom.')],
  [T('پایین بیا و «Add to Home Screen» (افزودن به صفحهٔ اصلی) را انتخاب کن.','Scroll and choose “Add to Home Screen”.')],
  [T('«Add» را بزن. آیکون فیلم‌آرشیو روی صفحهٔ اصلی می‌آید.','Tap “Add”. The Film Archive icon appears on your home screen.')]]};
 if(isAndroid)return {title:T('نصب روی اندروید','Install on Android'),steps:[
  [T('منوی سه‌نقطه ⋮ بالای Chrome را بزن.','Tap the ⋮ menu at the top of Chrome.')],
  [T('«Install app» یا «Add to Home screen» را انتخاب کن.','Choose “Install app” or “Add to Home screen”.')],
  [T('«Install» را بزن؛ آیکون روی صفحهٔ اصلی می‌آید.','Tap “Install”; the icon appears on your home screen.')]]};
 return {title:T('نصب روی کامپیوتر','Install on desktop'),steps:[
  [T('در Chrome یا Edge، آیکون نصب را در انتهای نوار آدرس بزن (مانیتور کوچک با فلش).','In Chrome or Edge, click the install icon at the end of the address bar.')],
  [T('یا از منوی ⋮ گزینهٔ «Install My Film Archive» را بزن.','Or use the ⋮ menu → “Install My Film Archive”.')]]};
}
function showGuide(){
 if(guide)return;
 const g=stepsFor();
 guide=make('div','suLayer');
 const card=make('div','suCard');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',g.title);
 const head=make('div','suHead');head.append(make('span','suSpark','📲'),make('h2','',g.title));
 const x=make('button','suX','✕');x.type='button';x.setAttribute('aria-label',T('بستن','Close'));x.onclick=closeGuide;head.appendChild(x);
 const body=make('div','suBody');const ol=make('ol','piSteps');
 g.steps.forEach(s=>ol.appendChild(make('li','',s[0])));body.appendChild(ol);
 body.appendChild(make('p','piNote',T('بعد از نصب، از «ابزارها ← اعلان روی گوشی» اعلان دنبال‌کردن و لایک را روشن کن.','After installing, turn on follow and like alerts in Tools → Phone notifications.')));
 const foot=make('div','suFoot');const ok=make('button','suOk',T('متوجه شدم','Got it'));ok.type='button';ok.onclick=closeGuide;foot.appendChild(ok);
 card.append(head,body,foot);guide.appendChild(card);
 guide.addEventListener('pointerdown',e=>{if(e.target===guide)closeGuide();});
 doc.body.appendChild(guide);doc.addEventListener('keydown',onKey,true);ok.focus({preventScroll:true});
}
async function install(){
 if(deferred){
  const d=deferred;deferred=null;
  try{d.prompt();const r=await d.userChoice;if(r&&r.outcome==='accepted')put(DONE,'1');}catch(e){}
  closeBanner();announce();return;
 }
 closeBanner();showGuide();
}
function showBanner(){
 if(banner||installed())return;
 banner=make('div','piBar');banner.setAttribute('role','region');banner.setAttribute('aria-label',T('نصب مثل اپ','Install as an app'));
 const icon=make('img','piIcon');icon.alt='';icon.src='assets/icons/icon-192.png';
 const txt=make('div','piText');
 txt.append(make('b','',T('سایت را مثل یک اپ روی گوشی داشته باش','Keep the site on your phone like an app')),
  make('small','',T('با نصب، اعلان دنبال‌کردن و لایک را روی گوشی می‌گیری. بدون فروشگاه.','Install to get follow and like notifications on your phone. No store.')));
 const go=make('button','piGo',T('نصب','Install'));go.type='button';go.onclick=install;
 const later=make('button','piLater','✕');later.type='button';later.setAttribute('aria-label',T('بعداً','Later'));
 later.onclick=()=>{put(KEY,String(Date.now()));closeBanner();};
 banner.append(icon,txt,go,later);doc.body.appendChild(banner);
}
function maybeShow(tries){
 tries=tries||0;
 if(installed()||banner)return;
 const at=Number(get(KEY))||0;if(at&&Date.now()-at<14*864e5)return;
 if(!(deferred||isIOS))return; // other browsers cannot install: the Tools menu still offers the guide
 const busy=doc.querySelector('dialog[open],.overlay.open,.stLayer,.suLayer,.fcMenu')||doc.body.classList.contains('roomFocus')||doc.body.classList.contains('cinema')||doc.getElementById('drawer')?.classList.contains('open');
 if(busy){if(tries<20)setTimeout(()=>maybeShow(tries+1),4000);return;}
 showBanner();
}
setTimeout(()=>maybeShow(0),9000);
window.filmInstall={install,guide:showGuide,installed,canOffer:()=>!installed(),hasPrompt:()=>Boolean(deferred)};
})();
