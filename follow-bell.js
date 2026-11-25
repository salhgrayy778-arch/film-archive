/* Notification bell: shows a red badge when someone has followed you since you last opened it.
 * "Seen" time is kept per account in this browser (localStorage). Needs film_follows(created_at). */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady;
const faNum=n=>typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(n):String(n);
const key=()=>'film-bell-seen:'+ses.id;
const getSeen=()=>{try{return localStorage.getItem(key())||'';}catch(e){return '';}};
const setSeen=v=>{try{localStorage.setItem(key(),v);}catch(e){}};
let btn,dot,panel,items=[],owner='',timer=0,busy=false,renderSerial=0;

function build(){
 const anchor=document.getElementById('acctBtn');if(!anchor||btn)return;
 btn=make('button','themeBtn bellBtn');btn.id='bellBtn';btn.type='button';btn.textContent='🔔';
 btn.setAttribute('aria-label',T('اعلان‌ها','Notifications'));btn.setAttribute('aria-haspopup','true');btn.setAttribute('aria-expanded','false');
 dot=make('span','bellDot');dot.hidden=true;dot.setAttribute('aria-hidden','true');btn.appendChild(dot);
 anchor.before(btn);
 panel=make('div','bellPanel');panel.id='bellPanel';panel.hidden=true;document.body.appendChild(panel);
 btn.addEventListener('click',e=>{e.stopPropagation();panel.hidden?open():close();});
 document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();btn.focus();}});
}
function unreadCount(){const seen=getSeen();return items.filter(i=>!seen||i.created_at>seen).length;}
function paint(){
 if(!btn)return;
 const on=Boolean(ready());btn.classList.toggle('on',on);
 if(!on){panel.hidden=true;return;}
 const n=unreadCount();dot.hidden=n===0;dot.textContent=n>9?'9+':faNum(n);
 btn.title=n?T(n+' دنبال‌کنندهٔ جدید','New followers: '+n):T('اعلان‌ها','Notifications');
}
function position(){
 const r=btn.getBoundingClientRect();const w=Math.min(340,innerWidth*0.94);
 panel.style.top=(r.bottom+8)+'px';
 panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';
}
async function load(){
 if(!ready()||busy)return;
 busy=true;
 try{
  const F=window.filmFriends;
  const rows=await F.get('/film_follows?select=follower_id,created_at&followed_id=eq.'+ses.id+'&order=created_at.desc&limit=30');
  items=rows;
  if(owner!==ses.id){owner=ses.id;if(!getSeen()){/* first time on this device: do not flash old followers as new */setSeen(rows[0]?.created_at||new Date().toISOString());}}
  paint();
  if(!panel.hidden)render();
 }catch(e){/* offline or SQL not run: stay quiet */}
 busy=false;
}
async function render(){
 const F=window.filmFriends;const seen=getSeen();const mine=++renderSerial;
 panel.replaceChildren();
 const head=make('div','bellHead');head.appendChild(make('span','',T('🔔 دنبال‌کننده‌های جدید','🔔 New followers')));panel.appendChild(head);
 if(!items.length){panel.appendChild(make('div','bellEmpty',T('هنوز کسی تو را دنبال نکرده است.','Nobody has followed you yet.')));return;}
 const pm=await F.getProfiles(items.map(i=>i.follower_id));
 if(mine!==renderSerial)return;
 for(const it of items.slice(0,12)){
  const p=pm.get(it.follower_id);
  const b=make('button','bellItem'+(seen&&it.created_at>seen?' fresh':''));b.type='button';
  const txt=make('span','');txt.append(make('b','',p?.display_name||T('فیلم‌باز','Movie fan')),make('small','',T('تو را دنبال کرد · ','Followed you · ')+new Date(it.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})));
  b.append(F.avatar(p,36),txt);
  b.onclick=()=>{close();F.openProfile(it.follower_id);};
  panel.appendChild(b);
 }
}
async function open(){
 position();panel.hidden=false;btn.setAttribute('aria-expanded','true');
 await load();await render();
 // checking the bell clears the red badge (after the list has shown which ones are new)
 if(items[0])setSeen(items[0].created_at);paint();
}
function close(){panel.hidden=true;btn.setAttribute('aria-expanded','false');}
function markSeen(){if(!ready())return;if(items[0])setSeen(items[0].created_at);paint();}
function start(){
 build();paint();
 clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)load();},45000);
 load();
}
window.addEventListener('film-account-state',()=>{owner='';items=[];paint();setTimeout(load,300);setTimeout(load,2500);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('resize',()=>{if(!panel?.hidden)position();});
window.filmFollowBell={reload:load,markSeen};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
