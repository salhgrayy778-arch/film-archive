/* Group-watch experience layer: reconnect button, host/guest sync, dependable chat,
   "you are in a room" pill, calmer layout and the cinema (theatre) mode.
   Loaded last; it only touches the room UI and never the transport. */
(function(){
'use strict';
if(typeof R==='undefined'||typeof rv!=='function'||!document.getElementById('room'))return;
const $=id=>document.getElementById(id);
const L=(fa,en)=>EN?en:fa;
const ready=()=>!!(R.watchRoomReady&&R.watchRoomReady());
const SVGNS='http://www.w3.org/2000/svg';

/* ---------- icons ---------- */
(function(){
 const defs=document.querySelector('body > svg defs');if(!defs||$('i-curtain'))return;
 const add=(id,inner)=>{const s=document.createElementNS(SVGNS,'symbol');s.id=id;s.setAttribute('viewBox','0 0 24 24');s.innerHTML=inner;defs.appendChild(s);};
 add('i-curtain','<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h18"/><path d="M5 5c-.6 5 .2 11 3.2 15M19 5c.6 5-.2 11-3.2 15M12 5v3.2"/><path d="M9.6 12.2l4.2 2.5-4.2 2.5z" fill="currentColor"/></g>');
 add('i-retry','<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.3h-4.3"/></g>');
})();
const icon=(id)=>{const s=document.createElementNS(SVGNS,'svg');s.setAttribute('class','ic');s.setAttribute('aria-hidden','true');const u=document.createElementNS(SVGNS,'use');u.setAttribute('href','#'+id);s.appendChild(u);return s;};

/* ---------- reconnect banner + button ---------- */
const bar=document.createElement('div');bar.id='rBanner';bar.className='rBanner';bar.hidden=true;bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
const msg=document.createElement('span');msg.className='rbMsg';const dot=document.createElement('i');const msgText=document.createElement('span');msg.append(dot,msgText);
const mkRecon=cls=>{const b=document.createElement('button');b.type='button';b.className='rRecon '+(cls||'');b.append(icon('i-retry'),document.createTextNode(''));const t=document.createElement('span');b.append(t);b.lbl=t;return b;};
const bBtn=mkRecon(),sBtn=mkRecon();sBtn.id='rReconnect';sBtn.hidden=true;
bar.append(msg,bBtn);
const notice=$('rWatchNotice');(notice||document.querySelector('#room .rgrid')).insertAdjacentElement(notice?'afterend':'beforebegin',bar);
const rstat=document.querySelector('#room .rstat');if(rstat)rstat.appendChild(sBtn);
function doReconnect(){
 [bBtn,sBtn].forEach(b=>{b.classList.add('spin');setTimeout(()=>b.classList.remove('spin'),1400);});
 if(!(R.watchRoomReconnect&&R.watchRoomReconnect()))toast(L('اتاق ذخیره‌شده‌ای پیدا نشد؛ یک اتاق بساز یا کد بزن','No saved room; create one or enter a code'));
}
bBtn.addEventListener('click',doReconnect);sBtn.addEventListener('click',doReconnect);
$('rLeave')?.addEventListener('click',()=>{R.watchRoomForget&&R.watchRoomForget();paint();});

function mode(){
 const saved=R.watchRoomSaved&&R.watchRoomSaved();
 if(R.peer){
  if(ready())return '';
  if(R.hostAway)return 'away';
  if(R.roomPhase==='connecting'&&!R.roomError)return '';
  if(R.roomPhase==='failed'||R.roomError)return 'failed';
  return 'retry';
 }
 return saved?'resume':'';
}
function paint(){
 const m=mode();
 bar.hidden=!m;
 const txt={
  retry:L('اتصال قطع شد؛ خودکار دوباره وصل می‌شوم…','Connection lost; reconnecting automatically…'),
  away:L('میزبان فعلاً قطع است؛ به‌محض بازگشتش خودکار وصل می‌شوی.','The host is away; you will be reconnected as soon as they return.'),
  failed:L('اتصال به اتاق برقرار نشد.','Could not connect to the room.'),
  resume:L('آخرین اتاقت هنوز ذخیره است.','Your last room is still saved.')
 }[m]||'';
 msgText.textContent=txt;
 dot.style.display=(m==='retry'||m==='away')?'':'none';
 const lab=m==='resume'?L('بازگشت به اتاق قبلی','Rejoin last room'):L('اتصال مجدد','Reconnect');
 bBtn.lbl.textContent=lab;sBtn.lbl.textContent=lab;
 sBtn.hidden=!(m==='retry'||m==='away'||m==='failed');
 paintSync();paintPill();
 const inRoom=!!R.peer,hostBtn=$('rHost'),joinRow=$('rJoin')&&$('rJoin').closest('.rrow');
 if(hostBtn)hostBtn.hidden=inRoom;
 if(joinRow)joinRow.hidden=inRoom;
}
/* Room focus: while you are in a room and on the room tab, hide the hero so the room fits one screen. */
let focusOn=false;
function focus(){
 const on=Boolean(R.peer)&&typeof state!=='undefined'&&state.tab==='room';
 if(on===focusOn)return;
 focusOn=on;document.body.classList.toggle('roomFocus',on);
 if(on)window.scrollTo({top:0});
}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.tab'))setTimeout(focus,30);});
window.addEventListener('film-room-state',()=>setTimeout(focus,0));
window.addEventListener('film-room-ended',()=>setTimeout(focus,0));
window.addEventListener('film-room-state',paint);
window.addEventListener('online',paint);window.addEventListener('offline',paint);
setInterval(()=>{paint();focus();},1500);

/* ---------- sync button (host: "bring everyone to me", guest: "sync with host") ---------- */
let syncBtn=$('rSync');
if(syncBtn){
 const nb=syncBtn.cloneNode(true);syncBtn.replaceWith(nb);syncBtn=nb;syncBtn.classList.add('syncBtn');
 syncBtn.addEventListener('click',()=>{
  if(!ready()){toast(L('اتصال برقرار نیست؛ «اتصال مجدد» را بزن','Not connected; press Reconnect'));return;}
  syncBtn.classList.add('busy');setTimeout(()=>syncBtn.classList.remove('busy'),1100);
  if(R.host){
   if(![...R.conns.values()].some(c=>c.open)){toast(L('هنوز کسی وارد اتاق نشده','Nobody has joined yet'));return;}
   const v=rv();rsend({t:'tick',time:v.currentTime,playing:!v.paused,force:1});
   toast(L('همه به نقطهٔ تو برده شدند','Everyone was moved to your position'));
  }else{
   rsend({t:'syncreq'});
   toast(L('در حال همگام‌سازی با میزبان…','Syncing with the host…'));
  }
 });
}
function paintSync(){
 if(!syncBtn)return;
 const t=R.host?L('همه را به نقطهٔ من ببر','Bring everyone to my position'):L('همگام‌سازی با میزبان','Sync with host');
 const last=syncBtn.lastChild;if(last&&last.nodeType===3&&last.textContent!==t)last.textContent=t;
 else if(!last||last.nodeType!==3)syncBtn.append(document.createTextNode(t));
}

/* ---------- chat ---------- */
(function(){
 const inp0=$('chIn'),btn0=$('chSend');if(!inp0||!btn0)return;
 const inp=inp0.cloneNode(true),btn=btn0.cloneNode(true);inp0.replaceWith(inp);btn0.replaceWith(btn);
 inp.maxLength=300;inp.autocomplete='off';
 const others=()=>R.host?[...R.conns.values()].some(c=>c.open):!!(R.conn&&R.conn.open);
 function send(){
  const text=inp.value.trim();if(!text)return;
  if(!ready()){toast(L('اتصال برقرار نیست؛ «اتصال مجدد» را بزن','Not connected; press Reconnect'));return;}
  if(!others()){toast(L('هنوز کسی متصل نیست','Nobody else is connected yet'));return;}
  const ok=rsend({t:'chat',name:nm(),text:text.slice(0,300)});
  chat(text.slice(0,300),'me');
  if(ok===false){const last=$('chLog').lastElementChild;if(last){last.classList.add('fail');last.dataset.fail=L('ارسال نشد','Not sent');}}
  inp.value='';inp.focus();
 }
 btn.addEventListener('click',send);
 inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send();}});
 inp.addEventListener('input',()=>{const n=Date.now();if(n-(R.typingT||0)>2000){R.typingT=n;rsend({t:'typing'});}});
})();

/* ---------- "you are in a room" pill ---------- */
const pill=document.createElement('button');pill.type='button';pill.id='roomPill';pill.className='roomPill';pill.hidden=true;
const pdot=document.createElement('i');const ptxt=document.createElement('span');pill.append(icon('i-curtain'),pdot,ptxt);
document.body.appendChild(pill);
pill.addEventListener('click',()=>$('tab-room')?.click());
function paintPill(){
 const inRoom=!!R.peer&&mode()!=='resume';
 const onTab=!$('room').hidden;
 document.body.classList.toggle('inRoomTab',onTab);
 pill.hidden=!(inRoom&&!onTab);
 if(pill.hidden)return;
 const ok=ready();
 pill.classList.toggle('off',!ok);
 const n=R.host?[...R.conns.values()].filter(c=>c.open).length+1:(R.conn&&R.conn.open?(R.members.size||1)+1:1);
 ptxt.textContent=ok?L('در اتاق تماشا · '+(typeof fa==='function'?fa(n):n)+' نفر · بازگشت','In the room · '+n+' · return'):L('اتاق: در حال اتصال… · بازگشت','Room: reconnecting… · return');
}
new MutationObserver(paintPill).observe($('room'),{attributes:true,attributeFilter:['hidden']});

/* ---------- subtitle panel never lingers when playback is changed remotely ---------- */
['play','pause'].forEach(ev=>rv().addEventListener(ev,()=>{
 if(Date.now()<(R.mute||0)&&typeof closePops==='function')closePops();
}));

/* ---------- cinema mode ---------- */
const layer=document.createElement('div');layer.id='cineLayer';layer.setAttribute('aria-hidden','true');
const glow=document.createElement('canvas');glow.width=48;glow.height=27;
const mk=c=>{const d=document.createElement('div');d.className=c;return d;};
const seats=mk('cSeats');
(function(){
 const w=1200,h=92,svg=document.createElementNS(SVGNS,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('preserveAspectRatio','none');
 let d1='',d2='';
 for(let x=-10,i=0;x<w+40;x+=64,i++){d1+=`M${x} ${h}V${h-34}q0-20 22-20h20q22 0 22 20V${h}z`;}
 for(let x=22;x<w+40;x+=64){d2+=`M${x} ${h}V${h-52}q0-22 24-22h16q24 0 24 22V${h}z`;}
 const p2=document.createElementNS(SVGNS,'path');p2.setAttribute('d',d2);p2.setAttribute('fill','#0b1514');
 const p1=document.createElementNS(SVGNS,'path');p1.setAttribute('d',d1);p1.setAttribute('fill','#050909');
 const hi=document.createElementNS(SVGNS,'rect');hi.setAttribute('x','0');hi.setAttribute('y',String(h-1.5));hi.setAttribute('width',String(w));hi.setAttribute('height','1.5');hi.setAttribute('fill','rgba(201,162,90,.25)');
 svg.append(p2,p1);seats.appendChild(svg);
})();
layer.append(glow,mk('cBeam'),mk('cCurtain l'),mk('cCurtain r'),mk('cValance'),seats,mk('cVig'));
document.body.prepend(layer);

const exit=document.createElement('button');exit.type='button';exit.id='cineExit';
exit.append(icon('i-curtain'),document.createTextNode(L('خروج از حالت سینما','Exit cinema mode')));
document.body.appendChild(exit);

let cineBtn=$('rCinema');
if(cineBtn){
 const nb=cineBtn.cloneNode(false);cineBtn.replaceWith(nb);cineBtn=nb;
 cineBtn.className='btn cineBtn';cineBtn.type='button';cineBtn.id='rCinema';cineBtn.setAttribute('aria-pressed','false');
 const tx=document.createElement('span');tx.className='tx';
 const t1=document.createElement('span');t1.textContent=L('حالت سینما','Cinema mode');
 const t2=document.createElement('small');t2.textContent=L('چراغ‌ها خاموش، پرده کنار می‌رود','Lights down, curtains open');
 tx.append(t1,t2);cineBtn.append(icon('i-curtain'),tx);
 const row=cineBtn.closest('.tools2');if(row)row.prepend(cineBtn);
}
let glowT=0;const gctx=glow.getContext&&glow.getContext('2d');
function glowLoop(){
 glowT=setTimeout(glowLoop,250);
 if(!gctx||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const v=rv();if(v.readyState<2||v.paused||!v.videoWidth)return;
 try{gctx.drawImage(v,0,0,48,27);}catch(e){}
}
function setCinema(on){
 document.body.classList.toggle('cinema',on);
 if(cineBtn)cineBtn.setAttribute('aria-pressed',String(on));
 clearTimeout(glowT);
 if(on){
  layer.classList.remove('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>layer.classList.add('open')));
  window.scrollTo({top:0});glowLoop();
 }else layer.classList.remove('open');
}
cineBtn&&cineBtn.addEventListener('click',()=>setCinema(!document.body.classList.contains('cinema')));
exit.addEventListener('click',()=>setCinema(false));
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&document.body.classList.contains('cinema')&&!document.fullscreenElement&&!document.querySelector('.overlay.open')){setCinema(false);}
});
/* leaving the tab (existing tab handler removes the class) must also reset our state */
new MutationObserver(()=>{
 const on=document.body.classList.contains('cinema');
 if(cineBtn&&cineBtn.getAttribute('aria-pressed')!==String(on)){cineBtn.setAttribute('aria-pressed',String(on));if(!on){clearTimeout(glowT);layer.classList.remove('open');}}
}).observe(document.body,{attributes:true,attributeFilter:['class']});

paint();
})();
