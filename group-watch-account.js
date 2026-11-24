/* Group watch requires an account.
 * The whole room UI stays visible (so people can see what it offers) but is
 * locked behind a clear sign-in / sign-up notice. Invite links are remembered
 * and opened automatically right after the person signs in. */
(function(){
'use strict';
if(typeof R==='undefined'||typeof startRoom!=='function'||typeof paintRoomAccountGate!=='function')return;
const $=id=>document.getElementById(id);
const text=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const ready=()=>Boolean(typeof ses!=='undefined'&&ses&&typeof cloudReady!=='undefined'&&cloudReady);
let pending=null; // {host:boolean,resume:string,code:string}
const innerStart=startRoom;
R.watchAccountReady=ready;

function paint(){
 const gate=$('roomAccountGate'),grid=document.querySelector('#room .rgrid'),notice=$('rWatchNotice');
 if(!gate||!grid)return;
 // A person already inside a room is never locked out by a background session refresh.
 const ok=ready()||Boolean(R.peer&&typeof ses!=='undefined'&&ses);
 gate.hidden=ok;
 gate.classList.add('compact');
 grid.hidden=false;
 grid.classList.toggle('roomAuthLocked',!ok);
 if(ok){grid.removeAttribute('inert');grid.removeAttribute('aria-disabled');return;}
 grid.setAttribute('inert','');grid.setAttribute('aria-disabled','true');
 if(notice)notice.hidden=true;
 const signedIn=Boolean(typeof ses!=='undefined'&&ses);
 $('roomGateTitle').textContent=signedIn
  ?text('در حال آماده‌سازی حساب…','Preparing your account…')
  :text('برای استفاده از تماشای گروهی باید وارد شوی یا ثبت‌نام کنی','Sign in or sign up to use group watch');
 $('roomGateMessage').textContent=signedIn
  ?text('آرشیو حساب در حال دریافت است؛ پس از آماده‌شدن، اتاق‌ها فعال می‌شوند.','Your account is loading; rooms unlock as soon as it is ready.')
  :pending
  ?text('لینک دعوت ذخیره شد. بعد از ورود یا ثبت‌نام، خودکار وارد همان اتاق می‌شوی.','Your invite is saved. After you sign in or sign up you will join that room automatically.')
  :text('می‌توانی بخش‌های اتاق را ببینی، اما ساخت اتاق، پیوستن با کد، چت و پخش فقط با حساب شخصی فعال است.','You can look around, but creating or joining a room, chat and playback need an account.');
 const button=$('roomGateSignIn');
 button.textContent=signedIn?text('دریافت دوباره حساب','Retry account loading'):text('ورود / ثبت‌نام','Sign in / Sign up');
}
paintRoomAccountGate=paint;

startRoom=async function(host,resume){
 if(!ready()){
  const typed=($('rCode')?.value||'').trim();
  const invite=(location.hash.match(/^#join=(film-[a-f0-9]{24})$/)||[])[1]||'';
  pending={host:Boolean(host),resume:resume||'',code:host?'':(typed||invite)};
  paint();
  try{$('roomAccountGate')?.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){}
  if(typeof ses!=='undefined'&&!ses&&typeof openAuth==='function')openAuth('signup');
  else if(typeof toast==='function')toast(text('ابتدا حسابت را آماده کن','Wait for your account to finish loading'));
  return;
 }
 return innerStart(host,resume);
};

function resumePending(){
 if(!pending||!ready()||R.peer)return;
 const job=pending;pending=null;
 if(job.code&&$('rCode'))$('rCode').value=job.code;
 $('tab-room')?.click();
 setTimeout(()=>{if(!R.peer&&ready())startRoom(job.host,job.resume||undefined);},250);
}

let lastId='';
window.addEventListener('film-account-state',event=>{
 const d=event.detail||{};
 paint();
 if(lastId&&lastId!==d.id&&R.peer){ // signed out, or switched account: leave the room explicitly
  try{R.watchRoomForget?.();}catch(e){}
  $('rLeave')?.click();
 }
 lastId=d.id||'';
 if(d.signedIn&&d.ready)resumePending();
});
paint();
})();
