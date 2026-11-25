/* Right-click on any film (news, search, similar films, profiles, your own cards):
 * a small menu to add it to "Watched" or "Want to watch", or to open its page, without leaving where you are.
 * Hold Shift while right-clicking to get the normal browser menu. */
(function(){
'use strict';
const doc=document;
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
let menu=null,target=null;

function textOf(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
/* work out which film a right-clicked element belongs to */
function describe(start){
 // 1) one of the account's own cards (dashboard, diary)
 const own=start.closest('.card[data-id],.drow[data-id]');
 if(own&&typeof state!=='undefined'){
  const f=state.films.find(x=>String(x.id)===own.dataset.id);
  if(f)return {kind:'own',film:f,title:f.title,poster:f.poster||'',tmdb:Number(f.tmdb)||0};
 }
 // 2) any element carrying a TMDB film id, or a link to ?film=ID
 let el=start.closest('[data-film-id]'),id=0;
 if(el)id=Number(el.dataset.filmId);
 if(!id){
  const a=start.closest('a[href*="film="]');
  if(a){try{id=Number(new URL(a.getAttribute('href'),location.href).searchParams.get('film'));el=a;}catch(e){}}
 }
 if(!Number.isSafeInteger(id)||id<=0)return null;
 const root=el.closest('article,li,.fsPosterTile,.filmResultCard,.filmSimilarCard')||el;
 const img=root.querySelector('img');
 let title=(el.getAttribute('aria-label')||'').replace(/^(جزئیات فیلم|Details of)\s*/,'').trim();
 title=title||textOf(root.querySelector('h4,strong,.fsTileTitle'))||img?.alt||textOf(el);
 title=title.replace(/^(پوستر رسمی|Official poster of)\s*/,'').replace(/\s·\s\d{4}$/,'').slice(0,160);
 const year=(textOf(root).match(/\b(19|20)\d{2}\b/)||[])[0]||'';
 const poster=img?.currentSrc||img?.src||'';
 return {kind:'film',tmdb:id,title,year,poster};
}
function close(){if(menu){menu.remove();menu=null;}target=null;}
function statusOfTmdb(id){
 try{const f=state.films.find(x=>Number(x.tmdb)===Number(id));return f?f.status:'';}catch(e){return '';}
}
async function add(info,status){
 close();
 const toast=window.toast||(m=>console.log(m));
 try{
  if(info.kind==='own'){
   const f=state.films.find(x=>x.id===info.film.id);if(!f||f.status===status){toast(T('از قبل در همین فهرست است','Already in this list'));return;}
   const old=state.films;
   state.films=old.map(x=>x===f?{...x,status,date:status==='seen'&&!x.date?(typeof todayISO==='function'?todayISO():''):x.date||''}:x);
   if(!await saveFilms()){state.films=old;return;}
   if(typeof render==='function')render();
   toast((status==='seen'?T('به دیده‌شده‌ها منتقل شد ✓','Moved to Watched ✓'):T('به فهرست «خواهم دید» منتقل شد ✓','Moved to Want to watch ✓')));
   return;
  }
  const r=await window.filmDiscovery?.quickAdd?.(info.tmdb,status,{title:info.title,year:info.year,poster:info.poster});
  if(r==='same')toast(T('«'+info.title+'» از قبل در همین فهرست است','"'+info.title+'" is already in this list'));
  else if(r)toast(status==='seen'?T('«'+info.title+'» به دیده‌شده‌ها اضافه شد ✓','"'+info.title+'" added to Watched ✓'):T('«'+info.title+'» به «خواهم دید» اضافه شد ✓','"'+info.title+'" added to Want to watch ✓'));
  else toast(T('اضافه نشد؛ وارد حساب شو و دوباره تلاش کن','Could not add; sign in and try again'));
  if(typeof render==='function'&&state?.tab!=='film')render();
 }catch(e){console.error(e);}
}
function show(info,x,y){
 close();target=info;
 menu=make('div','fcMenu');menu.setAttribute('role','menu');
 const head=make('div','fcHead');
 if(info.poster&&/^(https:|assets\/|blob:|data:image)/.test(info.poster)){const im=make('img');im.alt='';im.src=info.poster;im.onerror=()=>im.remove();head.appendChild(im);}
 head.appendChild(make('b','',info.title||T('فیلم','Film')));
 menu.appendChild(head);
 const cur=info.kind==='own'?info.film.status:statusOfTmdb(info.tmdb);
 const item=(icon,label,on,fn)=>{const b=make('button','fcItem');b.type='button';b.setAttribute('role','menuitem');
  b.append(make('span','fcIcon',icon),make('span','',label));if(on)b.append(make('span','fcOn','✓'));b.onclick=fn;menu.appendChild(b);return b;};
 item('✅',T('اضافه به دیده‌شده‌ها','Add to Watched'),cur==='seen',()=>add(info,'seen'));
 item('🕒',T('اضافه به خواهم دید','Add to Want to watch'),cur==='want',()=>add(info,'want'));
 const tm=info.kind==='own'?info.tmdb:info.tmdb;
 if(tm)item('🎬',T('باز کردن صفحهٔ فیلم','Open film page'),false,()=>{close();window.filmDiscovery?.openFilm?.(tm);});
 doc.body.appendChild(menu);
 const r=menu.getBoundingClientRect();
 menu.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x))+'px';
 menu.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y))+'px';
 menu.querySelector('.fcItem')?.focus({preventScroll:true});
}
doc.addEventListener('contextmenu',e=>{
 if(e.shiftKey||e.ctrlKey||e.metaKey)return;
 const t=e.target;if(!t||!t.closest)return;
 if(t.closest('input,textarea,select,[contenteditable="true"],.fcMenu,video'))return;
 let info=null;try{info=describe(t);}catch(err){info=null;}
 if(!info)return;
 e.preventDefault();show(info,e.clientX,e.clientY);
});
doc.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target))close();},true);
doc.addEventListener('scroll',close,true);
window.addEventListener('resize',close);
window.addEventListener('blur',close);
doc.addEventListener('keydown',e=>{
 if(!menu)return;
 if(e.key==='Escape'){e.preventDefault();close();return;}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  e.preventDefault();const items=[...menu.querySelectorAll('.fcItem')];const i=items.indexOf(doc.activeElement);
  items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
 }
});
window.filmContext={close};
})();
