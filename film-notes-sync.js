/* Film notes become public reviews, and archive posters lead to the film page.
 *  - A note written in the archive form (with "show to others" ticked) is published to
 *    film_public_reviews, so it appears on the film page, in the author's profile and in the
 *    friends page. Editing/clearing/unticking/deleting the film updates or removes it.
 *  - Films without a stored TMDB id are matched by title + year (cached on this device).
 *  - Clicking a poster opens that film's page; clicking the rest of the card still opens the details. */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady&&!cloudLoading;
const LINK_KEY='film-link-cache';
let linkCache={};try{linkCache=JSON.parse(localStorage.getItem(LINK_KEY)||'{}')||{};}catch(e){}
const saveLinks=()=>{try{localStorage.setItem(LINK_KEY,JSON.stringify(linkCache));}catch(e){}};
const norm=x=>String(x||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const validTmdb=n=>Number.isSafeInteger(Number(n))&&Number(n)>0&&Number(n)<999999999999;

/* ---------- film → TMDB id ---------- */
function knownId(f){
 if(!f)return 0;
 if(validTmdb(f.tmdb))return Number(f.tmdb);
 const c=linkCache[f.id];return validTmdb(c)?Number(c):0;
}
const pending=new Map();
async function resolve(f){
 const known=knownId(f);if(known)return known;
 if(!f||linkCache[f.id]===-1||!window.filmDiscovery?.searchAllMovies)return 0;
 if(pending.has(f.id))return pending.get(f.id);
 const job=(async()=>{
  try{
   const names=[...new Set([f.titleEn,f.title].map(x=>String(x||'').trim()).filter(Boolean))];
   const year=String(f.year||'').trim();
   for(const name of names){
    const found=await window.filmDiscovery.searchAllMovies(name,8);
    const want=norm(name);
    const hit=found.find(m=>{
     const y=String(m.release_date||'').slice(0,4);
     const same=[m.title,m.original_title,m.fa_title].some(t=>norm(t)===want);
     return same&&(!year||!y||y===year);
    });
    if(hit&&validTmdb(hit.id)){linkCache[f.id]=Number(hit.id);saveLinks();return Number(hit.id);}
   }
   linkCache[f.id]=-1;saveLinks();return 0;
  }catch(e){return 0;}finally{pending.delete(f.id);}
 })();
 pending.set(f.id,job);return job;
}
window.filmLink={resolve,knownId};

/* ---------- poster click → film page ---------- */
function bind(container){
 if(!container)return;
 container.addEventListener('click',async e=>{
  const poster=e.target.closest?.('.poster');
  if(!poster||e.target.closest('a'))return;
  const holder=poster.closest('[data-id]');
  const id=holder?.dataset.id||poster.closest('#dBody')?.dataset.film;
  const film=(typeof state!=='undefined'?state.films:[]).find(x=>x.id===id);
  if(!film)return;
  e.stopImmediatePropagation();e.preventDefault();
  const tmdb=await resolve(film);
  if(tmdb){
   for(const o of ['dOv','overlay']){try{if(typeof closeModal==='function'&&document.getElementById(o)?.classList.contains('open'))closeModal(o);}catch(_){}}
   window.filmDiscovery.openFilm(tmdb);
  }else if(typeof openDetail==='function'){
   if(typeof toast==='function')toast(T('صفحهٔ این فیلم در فهرست سایت پیدا نشد؛ جزئیات باز شد.','No film page found for this one; opening its details.'));
   openDetail(film.id);
  }
 },true);
}
function start(){
 for(const id of ['grid','dash','diary'])bind(document.getElementById(id));
 const body=document.getElementById('dBody');
 if(body){
  // the detail dialog knows its film through the title/poster only; remember which film is open
  const orig=window.openDetail;
  if(typeof orig==='function'){
   window.openDetail=function(id,rnd){body.dataset.film=id;return orig.apply(this,arguments);};
  }
  bind(body);
 }
}

/* ---------- notes → public reviews ---------- */
const pubKey=()=>'film-note-pub:'+ses.id;
const loadPub=()=>{try{return JSON.parse(localStorage.getItem(pubKey())||'{}')||{};}catch(e){return {};}};
const savePub=m=>{try{localStorage.setItem(pubKey(),JSON.stringify(m));}catch(e){}};
const hash=text=>{let h=5381;for(let i=0;i<text.length;i++)h=((h<<5)+h+text.charCodeAt(i))|0;return String(h>>>0);};
let running=false,lastSig='',timer=0;
async function syncNotes(){
 if(running||!ready()||typeof state==='undefined'||!Array.isArray(state.films))return;
 const owner=ses.id;
 const films=state.films;
 const sig=owner+'|'+films.map(f=>f.id+':'+(f.notesPublic===true?1:0)+':'+hash(String(f.notes||''))+':'+(f.rating||0)+':'+(f.tmdb||'')+':'+(f.title||'')).join(',');
 if(sig===lastSig)return;
 running=true;
 try{
  const token=await freshToken();if(!token||!ses||ses.id!==owner)return;
  const pub=loadPub();const wanted=new Map();
  for(const f of films){
   const text=String(f.notes||'').trim();
   if(f.notesPublic!==true||!text)continue;
   const tmdb=await resolve(f);if(!tmdb)continue;
   const rating=f.rating>0?Math.min(10,Math.max(1,Math.round(Number(f.rating)*2))):null;
   const body=text.slice(0,1500);
   wanted.set(tmdb,{user_id:owner,film_id:tmdb,film_title:String(f.title||f.titleEn||'').slice(0,180)||'—',rating,review:body,updated_at:new Date().toISOString(),_h:hash(body+'|'+rating+'|'+(f.title||''))});
  }
  const changed=[...wanted.values()].filter(r=>pub[r.film_id]!==r._h).slice(0,200);
  for(let i=0;i<changed.length;i+=40){
   const chunk=changed.slice(i,i+40);
   await restCall('/film_public_reviews?on_conflict=user_id,film_id',{method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(chunk.map(({_h,...row})=>row))});
   for(const r of chunk)pub[r.film_id]=r._h;
  }
  // notes that were published earlier but are now cleared / made private / film removed
  if(films.length){
   for(const id of Object.keys(pub)){
    if(wanted.has(Number(id)))continue;
    await restCall('/film_public_reviews?user_id=eq.'+owner+'&film_id=eq.'+Number(id),{method:'DELETE'});
    delete pub[id];
   }
  }
  if(ses&&ses.id===owner){savePub(pub);lastSig=sig;}
  try{window.filmFriends?.refresh?.();}catch(e){}
 }catch(e){console.warn('Notes sync',e);}
 finally{running=false;}
}
const schedule=()=>{clearTimeout(timer);timer=setTimeout(syncNotes,1500);};
setInterval(()=>{if(!document.hidden)schedule();},6000);
window.addEventListener('film-account-state',()=>{lastSig='';schedule();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)syncNotes();});
window.filmNotes={sync:()=>{lastSig='';return syncNotes();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
