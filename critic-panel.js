/* Critics' desk: for members with the "critic" (or admin) role.
 *  - Queue: films you marked as watched in your archive that you have not reviewed yet, so each one
 *    can be scored and reviewed in a few seconds.
 *  - My reviews: every published review with its score, hearts, edit and delete.
 *  - Overview: numbers about your reviews.
 * It is only a UI: publishing uses the same database rules as every other review. */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const $=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined&&value!==null)e.textContent=String(value);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady&&!cloudLoading;
const faNum=n=>typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(n):String(n);
const FF=()=>window.filmFriends;
const isCritic=()=>{try{const r=window.filmStaff?.roles?.()||[];return r.includes('critic')||r.includes('admin');}catch(e){return false;}};
const skipKey=()=>'film-critic-skip:'+(ses?.id||'');
const loadSkip=()=>{try{return new Set(JSON.parse(localStorage.getItem(skipKey())||'[]'));}catch(e){return new Set();}};
const saveSkip=set=>{try{localStorage.setItem(skipKey(),JSON.stringify([...set].slice(-500)));}catch(e){}};
const safePoster=p=>{p=String(p||'');return /^(assets\/[\w./-]+|https:\/\/[^\s'"<>]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(p)&&p.length<400000?p:'';};
const relTime=iso=>{
 if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';
 try{return d.toLocaleDateString(typeof EN!=='undefined'&&EN?'en-GB':'fa-IR',{year:'numeric',month:'short',day:'numeric'});}catch(e){return iso.slice(0,10);}
};

let dialog,body,tabs,tab='queue',launch,serial=0,loadToken=0;
let my=[],mySeen=false,resolving=false;

function build(){
 dialog=make('dialog','cpDialog');dialog.id='criticDialog';dialog.setAttribute('aria-label',T('میز منتقد','Critic desk'));
 const head=make('header','cpHead');
 const title=make('div','cpTitle');title.append(make('h2','','🎬 '+T('میز منتقد','Critic desk')),make('span','cpSub',T('فیلم‌هایی که دیده‌ای و هنوز نقد نکرده‌ای، صف‌شده و آمادهٔ نقد','Films you watched but have not reviewed yet, queued and ready')));
 const close=make('button','btn',T('بستن','Close'));close.type='button';close.onclick=()=>dialog.close();
 head.append(title,close);
 tabs=make('nav','cpTabs');tabs.setAttribute('role','tablist');
 body=make('main','cpBody');
 dialog.append(head,tabs,body);document.body.appendChild(dialog);
 dialog.addEventListener('close',()=>{loadToken++;});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
}
function drawTabs(counts){
 tabs.replaceChildren();
 const defs=[['queue','⏳ '+T('صف نقد','Queue'),counts?.queue],['mine','⭐ '+T('نقدهای من','My reviews'),counts?.mine],['stats','📊 '+T('آمار من','My numbers')]];
 for(const [key,label,n] of defs){
  const b=make('button','cpTab'+(key===tab?' on':''),label);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(key===tab));
  if(n!==undefined&&n!==null){b.appendChild(make('span','cpCount',faNum(n)));}
  b.onclick=()=>{tab=key;show();};tabs.appendChild(b);
 }
}

async function loadMine(){
 const rows=await FF().get('/film_public_reviews?select=id,film_id,film_title,rating,review,created_at,updated_at&user_id=eq.'+ses.id+'&order=updated_at.desc&limit=1000');
 my=rows||[];mySeen=true;
 try{
  const ids=my.map(r=>r.id);const likes=new Map();
  for(let i=0;i<ids.length;i+=80){
   const rows2=await FF().get('/film_review_likes?select=review_id&review_id=in.('+ids.slice(i,i+80).join(',')+')&limit=5000');
   for(const l of rows2||[])likes.set(Number(l.review_id),(likes.get(Number(l.review_id))||0)+1);
  }
  for(const r of my)r.hearts=likes.get(Number(r.id))||0;
 }catch(e){for(const r of my)r.hearts=r.hearts||0;}
}
function watchedFilms(){
 const films=typeof state!=='undefined'&&Array.isArray(state.films)?state.films:[];
 return films.filter(f=>f&&f.status==='seen').sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
function tmdbOf(f){return window.filmLink?.knownId?.(f)||0;}

async function show(){
 if(!dialog)return;
 const mySerial=++serial;
 drawTabs();
 body.replaceChildren(make('div','fsSkeleton'));
 try{
  await loadMine();
 }catch(e){
  if(mySerial!==serial)return;
  body.replaceChildren(make('p','cpEmpty',e.status===404||e.status===401||e.status===403?T('بخش نظرها هنوز فعال نشده است؛ فایل security/film-all-in-one.sql را یک‌بار در Supabase اجرا کن.','Reviews are not enabled yet; run security/film-all-in-one.sql once in Supabase.'):T('دریافت اطلاعات ممکن نشد.','Could not load your data.')));
  return;
 }
 if(mySerial!==serial)return;
 if(tab==='mine')renderMine(mySerial);
 else if(tab==='stats')renderStats();
 else renderQueue(mySerial);
}

/* ---------- queue ---------- */
function scoreRow(initial,onChange){
 const row=make('div','cpScore');row.setAttribute('role','radiogroup');row.setAttribute('aria-label',T('امتیاز از ۱۰','Score out of 10'));
 let value=initial||0;
 const paint=()=>row.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',Number(b.dataset.v)<=value);b.setAttribute('aria-checked',String(Number(b.dataset.v)===value));});
 for(let i=1;i<=10;i++){const b=make('button','',faNum(i));b.type='button';b.dataset.v=i;b.setAttribute('role','radio');b.onclick=()=>{value=value===i?0:i;paint();onChange?.(value);};row.appendChild(b);}
 paint();
 return {row,get:()=>value,set:v=>{value=v;paint();}};
}
function queueCard(f,tmdb,after){
 const card=make('article','cpFilm');
 const poster=make('div','cpPoster');
 const url=safePoster(f.poster);
 if(url){const img=make('img');img.alt='';img.loading='lazy';img.src=url;img.onerror=()=>{img.remove();poster.textContent='🎬';};poster.appendChild(img);}else poster.textContent='🎬';
 const info=make('div','cpInfo');
 const head=make('div','cpFilmHead');
 const t=make('button','cpFilmTitle',f.title||f.titleEn||'—');t.type='button';t.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(tmdb);};
 head.appendChild(t);
 head.appendChild(make('small','cpMeta',[f.year?faNum(f.year):'',f.date?T('دیده‌شده در ','Watched ')+relTime(f.date):''].filter(Boolean).join(' · ')));
 const initial=f.rating>0?Math.min(10,Math.max(1,Math.round(Number(f.rating)*2))):0;
 const sc=scoreRow(initial);
 const text=make('textarea');text.rows=3;text.maxLength=1500;text.value=String(f.notes||'');
 text.placeholder=T('نقدت را بنویس (اختیاری؛ فقط نمره هم کافی است)…','Write your review (optional — a score alone is fine)…');text.setAttribute('aria-label',T('متن نقد','Review text'));
 const acts=make('div','cpActs');
 const pub=make('button','btn primary',T('انتشار نقد','Publish'));pub.type='button';
 const skip=make('button','btn',T('بعداً','Later'));skip.type='button';
 const open=make('button','btn',T('صفحهٔ فیلم','Film page'));open.type='button';open.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(tmdb);};
 acts.append(pub,skip,open);
 pub.onclick=async()=>{
  const score=sc.get(),review=text.value.trim();
  if(!score&&!review){toast(T('یک نمره یا کمی متن بنویس','Add a score or some text'));return;}
  pub.disabled=true;
  try{
   await FF().saveMyReview({id:tmdb,title:f.title||f.titleEn||''},score,review,0);
   my.unshift({id:0,film_id:tmdb,film_title:f.title||f.titleEn||'',rating:score||null,review,updated_at:new Date().toISOString(),hearts:0});
   toast(T('نقد منتشر شد ✓','Review published ✓'));
   card.classList.add('done');setTimeout(()=>{card.remove();after?.();},260);
  }catch(e){pub.disabled=false;toast(T('انتشار نشد؛ ورود و اتصال را بررسی کن.','Could not publish; check your sign-in and connection.'));}
 };
 skip.onclick=()=>{const s=loadSkip();s.add(String(tmdb));saveSkip(s);card.classList.add('done');setTimeout(()=>{card.remove();after?.();},200);};
 info.append(head,sc.row,text,acts);
 card.append(poster,info);
 return card;
}
async function renderQueue(mySerial){
 const films=watchedFilms();
 const reviewed=new Set(my.map(r=>Number(r.film_id)));
 const skipped=loadSkip();
 const root=make('div','cpQueue');
 const bar=make('div','cpBar');
 const info=make('p','cpHint');
 const list=make('div','cpList');
 const unresolvedBox=make('details','cpUnresolved');
 root.append(bar,list,unresolvedBox);body.replaceChildren(root);
 if(!films.length){list.appendChild(make('p','cpEmpty',T('هنوز فیلمی با وضعیت «دیده‌شده» در آرشیوت نیست. وقتی فیلم دیده‌ای را ثبت کنی، اینجا برای نقد نوبت می‌گیرد.','No watched films in your archive yet. Films you mark as watched will queue up here.')));return;}
 const items=[],unresolved=[];
 let todo=[];
 for(const f of films){
  const id=tmdbOf(f);
  if(id){if(!reviewed.has(id))items.push({f,id});}
  else todo.push(f);
 }
 let shownSkipped=false;
 const counter=make('strong','cpQueueCount');
 const paintBar=()=>{
  const waiting=list.querySelectorAll('.cpFilm').length;
  counter.textContent=T('در صف نقد: ','In queue: ')+faNum(waiting);
  drawTabs({queue:waiting,mine:my.length});
 };
 const addItem=({f,id})=>{
  if(skipped.has(String(id))&&!shownSkipped)return;
  list.appendChild(queueCard(f,id,()=>{paintBar();checkEmpty();}));
 };
 function checkEmpty(){
  if(!list.querySelector('.cpFilm')&&!list.querySelector('.cpEmpty')){
   list.appendChild(make('p','cpEmpty','🎉 '+T('صف نقد خالی است؛ همهٔ فیلم‌های دیده‌شده‌ات نقد دارند.','Your queue is empty — every watched film has a review.')));
  }
 }
 const showSkipped=make('button','btn',T('نمایش رد‌شده‌ها','Show skipped'));showSkipped.type='button';
 const skippedCount=items.filter(x=>skipped.has(String(x.id))).length;
 showSkipped.hidden=!skippedCount;
 showSkipped.onclick=()=>{shownSkipped=true;showSkipped.hidden=true;for(const x of items)if(skipped.has(String(x.id)))addItem(x);paintBar();};
 bar.append(counter,showSkipped);
 for(const x of items)addItem(x);
 paintBar();checkEmpty();
 root.insertBefore(info,list);
 info.textContent=T('هر فیلم را نمره بده (۱ تا ۱۰) و در صورت دلخواه چند خط بنویس؛ با «انتشار» همان لحظه در صفحهٔ فیلم و پروفایلت دیده می‌شود. «بعداً» فیلم را فعلاً از صف کنار می‌گذارد.','Give each film a score (1–10) and optionally a few lines. “Publish” shows it on the film page and your profile right away. “Later” parks a film.');
 // films without a known TMDB id: try to find them in the background
 if(todo.length&&window.filmLink?.resolve){
  const myToken=++loadToken;
  const status=make('small','cpResolve',T('در حال تطبیق ',"Matching ")+faNum(todo.length)+T(' فیلم دیگر با فهرست سایت…',' more films with the site catalog…'));
  bar.appendChild(status);
  let done=0;
  for(const f of todo){
   if(myToken!==loadToken||!dialog.open||tab!=='queue'||mySerial!==serial)return;
   let id=0;try{id=await window.filmLink.resolve(f);}catch(e){}
   if(myToken!==loadToken||mySerial!==serial)return;
   if(id){if(!reviewed.has(id)){items.push({f,id});addItem({f,id});paintBar();list.querySelector('.cpEmpty')?.remove();}}
   else unresolved.push(f);
   done++;status.textContent=T('در حال تطبیق… ','Matching… ')+faNum(todo.length-done)+T(' مانده',' left');
  }
  status.remove();
 }
 if(unresolved.length){
  unresolvedBox.appendChild(make('summary','',T('فیلم‌هایی که در فهرست سایت پیدا نشدند (',"Films not found in the site catalog (")+faNum(unresolved.length)+')'));
  unresolvedBox.appendChild(make('p','cpHint',T('برای این فیلم‌ها صفحهٔ عمومی وجود ندارد، پس نقد عمومی هم نمی‌شود. اگر نامشان را در فرم آرشیو با نام رسمی انگلیسی اصلاح کنی، دفعهٔ بعد پیدا می‌شوند.','These films have no public page, so a public review is not possible. Fix their title in the archive form (official English title) and they may be found next time.')));
  const ul=make('ul');for(const f of unresolved.slice(0,60))ul.appendChild(make('li','',(f.title||f.titleEn||'—')+(f.year?' ('+faNum(f.year)+')':'')));unresolvedBox.appendChild(ul);
 }
}

/* ---------- my reviews ---------- */
function renderMine(mySerial){
 const root=make('div','cpMine');
 const bar=make('div','cpBar');
 const q=make('input');q.type='search';q.placeholder=T('جست‌وجو در نقدهایم…','Search my reviews…');q.setAttribute('aria-label',q.placeholder);
 const sort=make('select');sort.setAttribute('aria-label',T('مرتب‌سازی','Sort'));
 for(const [v,a,b] of [['new','تازه‌ترین','Newest'],['high','بالاترین نمره','Highest score'],['low','کمترین نمره','Lowest score'],['hearts','بیشترین قلب','Most hearts']]){const o=make('option','',T(a,b));o.value=v;sort.appendChild(o);}
 bar.append(q,sort);
 const list=make('div','cpList');root.append(bar,list);body.replaceChildren(root);
 drawTabs({queue:undefined,mine:my.length});
 const paint=()=>{
  const term=q.value.trim().toLowerCase();
  let rows=my.filter(r=>!term||String(r.film_title||'').toLowerCase().includes(term)||String(r.review||'').toLowerCase().includes(term));
  const s=sort.value;
  rows=rows.slice().sort((a,b)=>s==='high'?(b.rating||0)-(a.rating||0):s==='low'?(a.rating||99)-(b.rating||99):s==='hearts'?(b.hearts||0)-(a.hearts||0):String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  list.replaceChildren();
  if(!rows.length)list.appendChild(make('p','cpEmpty',my.length?T('نقدی با این جست‌وجو پیدا نشد.','No review matches.'):T('هنوز نقدی منتشر نکرده‌ای؛ از «صف نقد» شروع کن.','No reviews yet — start from the queue.')));
  for(const r of rows)list.appendChild(mineRow(r,paint));
 };
 q.oninput=paint;sort.onchange=paint;paint();
}
function mineRow(r,repaint){
 const card=make('article','cpRev');
 const top=make('div','cpRevTop');
 const t=make('button','cpFilmTitle',r.film_title||('#'+r.film_id));t.type='button';t.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(Number(r.film_id));};
 const score=make('span','cpBadge',r.rating?faNum(r.rating)+'/'+faNum(10):'—');
 const hearts=make('span','cpHearts','♥ '+faNum(r.hearts||0));hearts.title=T('قلب‌هایی که این نقد گرفته','Hearts on this review');
 top.append(t,make('span','cpGrow'),score,hearts);
 card.appendChild(top);
 const text=make('p','cpRevText',r.review||T('(فقط نمره، بدون متن)','(score only)'));if(!r.review)text.classList.add('cpMuted');
 card.appendChild(text);
 const foot=make('div','cpRevFoot');
 foot.appendChild(make('small','cpMeta',relTime(r.updated_at||r.created_at)));
 const edit=make('button','btn',T('ویرایش','Edit'));edit.type='button';
 const del=make('button','btn danger',T('حذف','Delete'));del.type='button';
 foot.append(make('span','cpGrow'),edit,del);card.appendChild(foot);
 edit.onclick=()=>{
  const sc=scoreRow(r.rating||0);
  const ta=make('textarea');ta.rows=4;ta.maxLength=1500;ta.value=r.review||'';ta.setAttribute('aria-label',T('متن نقد','Review text'));
  const save=make('button','btn primary',T('ذخیره','Save'));save.type='button';
  const cancel=make('button','btn',T('انصراف','Cancel'));cancel.type='button';
  const row=make('div','cpActs');row.append(save,cancel);
  const box=make('div','cpEdit');box.append(sc.row,ta,row);
  text.hidden=true;foot.hidden=true;card.appendChild(box);
  cancel.onclick=()=>{box.remove();text.hidden=false;foot.hidden=false;};
  save.onclick=async()=>{
   const score=sc.get(),review=ta.value.trim();
   if(!score&&!review){toast(T('یک نمره یا کمی متن بنویس','Add a score or some text'));return;}
   save.disabled=true;
   try{await FF().saveMyReview({id:r.film_id,title:r.film_title},score,review,r.id);r.rating=score||null;r.review=review;r.updated_at=new Date().toISOString();toast(T('تغییرات ذخیره شد ✓','Saved ✓'));repaint();}
   catch(e){save.disabled=false;toast(T('ذخیره نشد','Could not save'));}
  };
 };
 let armed=false,timer=0;
 del.onclick=async()=>{
  if(!armed){armed=true;del.textContent=T('مطمئنی؟','Sure?');timer=setTimeout(()=>{armed=false;del.textContent=T('حذف','Delete');},4000);return;}
  clearTimeout(timer);del.disabled=true;
  try{await restCall('/film_public_reviews?id=eq.'+Number(r.id),{method:'DELETE'});my=my.filter(x=>x!==r);toast(T('نقد حذف شد','Review deleted'));repaint();drawTabs({mine:my.length});window.dispatchEvent(new CustomEvent('film-review-saved',{detail:{film_id:r.film_id}}));}
  catch(e){del.disabled=false;armed=false;del.textContent=T('حذف','Delete');toast(T('حذف نشد','Could not delete'));}
 };
 return card;
}

/* ---------- numbers ---------- */
function renderStats(){
 drawTabs({mine:my.length});
 const root=make('div','cpStats');
 const rated=my.filter(r=>r.rating>0);
 const avg=rated.length?rated.reduce((a,r)=>a+Number(r.rating),0)/rated.length:0;
 const withText=my.filter(r=>r.review&&r.review.trim()).length;
 const hearts=my.reduce((a,r)=>a+(r.hearts||0),0);
 const waiting=(()=>{const rev=new Set(my.map(r=>Number(r.film_id)));return watchedFilms().filter(f=>{const id=tmdbOf(f);return id&&!rev.has(id);}).length;})();
 const cards=make('div','cpCards');
 for(const [n,l] of [[my.length,T('نقد منتشرشده','Published reviews')],[rated.length?faNum(avg.toFixed(1)):'—',T('میانگین نمره‌هایم','My average score')],[withText,T('نقد با متن','With written text')],[hearts,T('قلب دریافتی','Hearts received')],[waiting,T('در صف نقد','Waiting in queue')]]){
  const c=make('div','cpCard');c.append(make('strong','',typeof n==='number'?faNum(n):n),make('span','',l));cards.appendChild(c);
 }
 root.appendChild(cards);
 const dist=make('section','cpDist');dist.appendChild(make('h3','',T('پراکندگی نمره‌ها','Score distribution')));
 const counts=Array(11).fill(0);for(const r of rated)counts[Math.round(r.rating)]++;
 const max=Math.max(1,...counts);
 for(let i=10;i>=1;i--){
  const row=make('div','cpDistRow');const bar=make('span','cpDistBar');const fill=make('i');fill.style.width=(counts[i]/max*100)+'%';bar.appendChild(fill);
  row.append(make('b','',faNum(i)),bar,make('small','',faNum(counts[i])));dist.appendChild(row);
 }
 root.appendChild(dist);
 const top=my.filter(r=>(r.hearts||0)>0).sort((a,b)=>b.hearts-a.hearts).slice(0,5);
 if(top.length){
  const s=make('section','cpDist');s.appendChild(make('h3','',T('محبوب‌ترین نقدهای من','My most loved reviews')));
  for(const r of top){const row=make('div','cpTopRow');const b=make('button','cpFilmTitle',r.film_title||('#'+r.film_id));b.type='button';b.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(Number(r.film_id));};row.append(b,make('span','cpGrow'),make('span','cpHearts','♥ '+faNum(r.hearts)));s.appendChild(row);}
  root.appendChild(s);
 }
 body.replaceChildren(root);
}

/* ---------- launcher ---------- */
function open(t){
 if(!ready()||!isCritic())return;
 if(!dialog)build();
 tab=t||'queue';mySeen=false;
 if(!dialog.open)dialog.showModal();
 show();
}
function sync(){
 const want=ready()&&isCritic();
 if(want&&!launch){
  launch=make('button','cpLaunch');launch.append(make('span','lIcon','🎬'),make('span','lLbl',T('میز منتقد','Critic desk')));launch.title=T('میز منتقد','Critic desk');launch.setAttribute('aria-label',launch.title);launch.id='criticLaunch';launch.type='button';launch.onclick=()=>open('queue');document.body.appendChild(launch);
 }else if(!want&&launch){launch.remove();launch=null;if(dialog?.open)dialog.close();}
}
window.addEventListener('film-staff-state',sync);
window.addEventListener('film-account-state',()=>setTimeout(sync,300));
window.addEventListener('film-review-saved',()=>{mySeen=false;});
setInterval(sync,3000);
window.filmCritic={open,isCritic};
})();
