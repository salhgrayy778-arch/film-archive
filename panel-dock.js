/* "Your panels" (پنل‌های شما): one button on the RIGHT edge. Opening it rolls a roulette wheel out of the edge;
 * each of your panels (critic desk, moderator desk / staff panel, your profile) sits on the wheel. Click one, press
 * the arrow keys, or turn the mouse wheel; the wheel spins the panel to the pointer and opens it.
 * The old floating panel buttons on the left are hidden (panel-dock.css); "Film friends" stays on the left. */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const doc=document;
const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&typeof cloudReady!=='undefined'&&cloudReady;
const STEP=30; // degrees between two panels on the wheel
let dock,wheel,scrim,hub,list=[],sel=0,isOpen=false,sig='',spinTimer=0,wheelLock=0;

function panels(){
 if(!ready())return [];
 const out=[];
 try{
  const S=window.filmStaff;
  if(S?.isStaff?.())out.push({id:'staff',icon:'🛡️',label:S.isAdmin?.()?T('پنل مدیریت','Staff panel'):T('میز مودریتور','Moderator desk'),run:()=>S.open()});
 }catch(e){}
 try{
  const C=window.filmCritic;
  if(C?.isCritic?.())out.push({id:'critic',icon:'🎬',label:T('میز منتقد','Critic desk'),run:()=>C.open()});
 }catch(e){}
 if(out.length&&window.filmFriends?.openProfile)out.push({id:'profile',icon:'👤',label:T('پروفایل من','My profile'),run:()=>window.filmFriends.openProfile(ses.id)});
 return out;
}

function build(){
 if(dock)return;
 scrim=make('div','pdScrim');scrim.hidden=true;scrim.addEventListener('click',close);
 dock=make('div','pdDock');dock.hidden=true;
 const btn=make('button','pdBtn');btn.type='button';btn.id='panelDockBtn';btn.setAttribute('aria-haspopup','true');btn.setAttribute('aria-expanded','false');
 btn.append(make('span','pdBtnIcon','🎛️'),make('span','pdBtnLbl',T('پنل‌های شما','Your panels')));
 btn.addEventListener('click',e=>{e.stopPropagation();isOpen?close():open();});
 wheel=make('div','pdWheel');wheel.setAttribute('role','menu');wheel.setAttribute('aria-label',T('پنل‌های شما','Your panels'));wheel.hidden=true;
 const pointer=make('i','pdPointer');pointer.setAttribute('aria-hidden','true');
 wheel.addEventListener('wheel',e=>{
  e.preventDefault();const now=Date.now();if(now-wheelLock<260)return;wheelLock=now;
  go(sel+(e.deltaY>0?1:-1));
 },{passive:false});
 dock.append(wheel,pointer,btn);
 doc.body.append(scrim,dock);
 doc.addEventListener('keydown',e=>{
  if(!isOpen)return;
  if(e.key==='Escape'){close();btn.focus();}
  else if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();go(sel+1);}
  else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();go(sel-1);}
  else if(e.key==='Enter'&&doc.activeElement?.closest?.('.pdWheel')==null){e.preventDefault();choose(sel);}
 });
}
function fill(){
 wheel.replaceChildren();
 hub=make('div','pdHub');hub.appendChild(make('b','',T('پنل‌ها','Panels')));
 wheel.appendChild(hub);
 list.forEach((p,i)=>{
  const b=make('button','pdItem');b.type='button';b.setAttribute('role','menuitem');b.style.setProperty('--a',(180+i*STEP)+'deg');
  b.append(make('span','pdIcon',p.icon),make('span','pdName',p.label));
  b.addEventListener('click',e=>{e.stopPropagation();choose(i);});
  wheel.appendChild(b);
 });
 paint();
}
function paint(){
 wheel.style.setProperty('--w',(-sel*STEP)+'deg');
 [...wheel.querySelectorAll('.pdItem')].forEach((b,i)=>{b.classList.toggle('on',i===sel);b.setAttribute('aria-current',String(i===sel));});
}
function go(i){if(!list.length)return;sel=Math.max(0,Math.min(list.length-1,i));paint();}
function choose(i){
 if(!list[i])return;
 go(i);
 const run=()=>{close();try{list[i].run();}catch(e){}};
 const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
 clearTimeout(spinTimer);spinTimer=setTimeout(run,calm?0:620);
}
function open(){
 list=panels();if(!list.length)return;
 sel=Math.min(sel,list.length-1);fill();
 isOpen=true;wheel.hidden=false;scrim.hidden=false;dock.classList.add('open');
 dock.querySelector('.pdBtn').setAttribute('aria-expanded','true');
 requestAnimationFrame(()=>{wheel.querySelector('.pdItem.on')?.focus({preventScroll:true});});
}
function close(){
 if(!dock)return;isOpen=false;clearTimeout(spinTimer);
 dock.classList.remove('open');scrim.hidden=true;wheel.hidden=true;
 dock.querySelector('.pdBtn').setAttribute('aria-expanded','false');
}
function sync(){
 build();
 const now=panels();const s=now.map(p=>p.id+p.label).join('|');
 dock.hidden=!now.length;
 if(!now.length&&isOpen)close();
 if(s!==sig){sig=s;list=now;if(isOpen){sel=Math.min(sel,Math.max(0,list.length-1));fill();}}
}
['film-staff-state','film-account-state'].forEach(n=>window.addEventListener(n,()=>setTimeout(sync,200)));
setInterval(sync,2500);
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',sync);else sync();
window.filmPanelDock={open,close,panels:()=>panels().map(p=>p.id)};
})();
