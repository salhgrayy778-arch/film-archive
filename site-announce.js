/* Site announcements: a slim bar at the top of the page, written by admins (Staff panel → Announcements).
 * Everyone can read active announcements; each visitor can dismiss one (remembered on this device). */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const KEY='film-announce-closed';
const closed=()=>{try{return new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));}catch(e){return new Set();}};
const remember=id=>{try{const s=closed();s.add(String(id));localStorage.setItem(KEY,JSON.stringify([...s].slice(-60)));}catch(e){}};
let host=null,timer=0,busy=false;
async function load(){
 if(busy||typeof sb==='undefined'||!sb||!sb.url||!sb.key)return;
 busy=true;
 try{
  const r=await fetch(sb.url.replace(/\/$/,'')+'/rest/v1/film_announcements?select=id,message,level&active=eq.true&order=created_at.desc&limit=3',{headers:{apikey:sb.key},cache:'no-store'});
  if(!r.ok){paint([]);return;}
  paint(await r.json());
 }catch(e){}finally{busy=false;}
}
function paint(rows){
 const hide=closed();
 rows=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.id&&typeof x.message==='string'&&!hide.has(String(x.id))).slice(0,2);
 if(!rows.length){if(host){host.remove();host=null;}return;}
 if(!host){host=document.createElement('div');host.className='saWrap';host.setAttribute('role','region');host.setAttribute('aria-label',T('اعلان سایت','Site announcement'));document.body.prepend(host);}
 host.replaceChildren();
 for(const a of rows){
  const bar=document.createElement('div');bar.className='saBar'+(a.level==='warn'?' warn':'');
  const icon=document.createElement('span');icon.className='saIcon';icon.setAttribute('aria-hidden','true');icon.textContent=a.level==='warn'?'⚠️':'📣';
  const text=document.createElement('span');text.className='saText';text.textContent=a.message.slice(0,240);
  const x=document.createElement('button');x.type='button';x.className='saClose';x.textContent='✕';x.setAttribute('aria-label',T('بستن اعلان','Dismiss'));
  x.onclick=()=>{remember(a.id);bar.remove();if(host&&!host.childElementCount){host.remove();host=null;}};
  bar.append(icon,text,x);host.appendChild(bar);
 }
}
window.addEventListener('film-announce-changed',load);
timer=setInterval(()=>{if(!document.hidden)load();},300000);
setTimeout(load,1200);
window.filmAnnounce={reload:load};
})();
