/* Social layer: public profiles, follows, critics / member reviews, room-member profiles.
 * Needs the Supabase SQL files security/film-social-rls.sql and security/film-social-v2.sql.
 * Everything degrades gracefully (with a clear message) if the SQL has not been run yet. */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const $=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined&&value!==null)e.textContent=String(value);return e;};
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const validId=id=>UUID.test(String(id||''));
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady&&!cloudLoading;
const hasBackend=()=>typeof sb!=='undefined'&&sb&&sb.url&&sb.key;
const faNum=n=>typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(n):String(n);
const safePoster=p=>{
 p=String(p||'');
 if(/^assets\/(catalog|posters)\/[a-z0-9_.-]+\.webp$/i.test(p))return p;
 try{const u=new URL(p);return u.protocol==='https:'&&!u.username&&!u.password&&p.length<1000?u.href:'';}catch(e){return '';}
};

/* ---------- data access ---------- */
const restBase=()=>sb.url.replace(/\/$/,'')+'/rest/v1';
async function get(path){
 if(!hasBackend())throw Error('no backend');
 const headers={apikey:sb.key};
 if(ready()&&await freshToken())headers.Authorization='Bearer '+ses.access_token;
 const response=await fetch(restBase()+path,{headers,cache:'no-store'});
 if(!response.ok){const e=Error('HTTP '+response.status);e.status=response.status;throw e;}
 return response.json();
}
async function write(path,options){
 if(!ready()){if(typeof openAuth==='function'&&!ses)openAuth('login');throw Error(T('ابتدا وارد حساب شو','Sign in first'));}
 if(!await freshToken())throw Error(T('ورود به حساب منقضی شده است','Session expired'));
 return restCall(path,options);
}
const profiles=new Map(),roles=new Map();
async function getProfiles(ids,full){
 const wanted=[...new Set((ids||[]).filter(validId))];
 const missing=wanted.filter(id=>!profiles.has(id)||(full&&!profiles.get(id)._full));
 const cols=full?'user_id,display_name,bio,avatar,favorites,watched':'user_id,display_name,bio,avatar,favorites';
 for(let i=0;i<missing.length;i+=40){
  const chunk=missing.slice(i,i+40);
  let rows=[];
  try{rows=await get('/film_public_profiles?select='+cols+'&user_id=in.('+chunk.join(',')+')&limit=40');}
  catch(e){
   if(full&&e.status===400)rows=await get('/film_public_profiles?select=user_id,display_name,bio,avatar,favorites&user_id=in.('+chunk.join(',')+')&limit=40');
   else throw e;
  }
  for(const row of rows)profiles.set(row.user_id,{...row,_full:Boolean(full)});
  for(const id of chunk)if(!profiles.has(id))profiles.set(id,{user_id:id,display_name:'',missing:true});
 }
 return new Map(wanted.map(id=>[id,profiles.get(id)]));
}
async function getRoles(ids){
 const wanted=[...new Set((ids||[]).filter(validId))].filter(id=>!roles.has(id));
 for(let i=0;i<wanted.length;i+=60){
  const chunk=wanted.slice(i,i+60);
  try{
   const rows=await get('/film_roles?select=user_id,role&user_id=in.('+chunk.join(',')+')&limit=60');
   const sets=new Map();
   for(const r of rows){if(!sets.has(r.user_id))sets.set(r.user_id,new Set());sets.get(r.user_id).add(r.role);}
   for(const [id,set] of sets)roles.set(id,set.has('critic')?'critic':set.has('admin')?'admin':set.has('moderator')?'moderator':'member');
  }catch(e){/* roles table not created yet */}
  for(const id of chunk)if(!roles.has(id))roles.set(id,'member');
 }
}
let followingSet=null,followingOwner='';
async function myFollowing(force){
 if(!ready())return new Set();
 if(!force&&followingSet&&followingOwner===ses.id)return followingSet;
 try{
  const rows=await get('/film_follows?select=followed_id&follower_id=eq.'+ses.id+'&limit=1000');
  followingSet=new Set(rows.map(r=>r.followed_id));followingOwner=ses.id;
 }catch(e){followingSet=new Set();}
 return followingSet;
}
window.addEventListener('film-account-state',()=>{followingSet=null;});

/* ---------- small UI parts ---------- */
const roleLabel=r=>r==='critic'?T('منتقد','Critic'):r==='admin'?T('مدیر','Admin'):r==='moderator'?T('مودریتور','Moderator'):'';
function avatar(profile,size){
 const a=make('span','fsAvatar');a.style.width=a.style.height=(size||44)+'px';a.style.fontSize=Math.round((size||44)*.42)+'px';
 const src=profile&&/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(profile.avatar||'')&&profile.avatar.length<170000?profile.avatar:'';
 if(src){const img=make('img');img.src=src;img.alt='';img.decoding='async';a.appendChild(img);}
 else a.textContent=Array.from(profile?.display_name||'🎬')[0].toUpperCase();
 return a;
}
function badge(role){const l=roleLabel(role);if(!l)return null;const b=make('span','fsRole fsRole-'+role,l);return b;}
function nameButton(id,profile,role){
 const wrap=make('span','fsNameWrap');
 const b=make('button','fsName',profile?.display_name||T('فیلم‌باز','Movie fan'));b.type='button';b.onclick=()=>openProfile(id);
 wrap.appendChild(b);const rb=badge(role);if(rb)wrap.appendChild(rb);return wrap;
}
function score(value,cls){const s=make('span','fsScore '+(cls||''),value?faNum(value)+'/'+faNum(10):'—');s.title=T('امتیاز از ۱۰','Score out of 10');return s;}
function emptyNote(parent,text){parent.appendChild(make('p','fsEmpty',text));}
function openFilmPage(id){
 const dlg=$('filmFriendsDialog');if(dlg?.open)dlg.close();
 if(window.filmDiscovery?.openFilm)window.filmDiscovery.openFilm(Number(id));else location.href='?film='+encodeURIComponent(id);
}
function filmButton(id,title,review){
 const a=make('a','fsFilm',title||T('صفحه فیلم','Film page'));
 a.href='?film='+encodeURIComponent(id)+(review&&review.id?'&review='+encodeURIComponent(review.id):'');
 a.onclick=e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();if(review)goToReview(review);else openFilmPage(id);};
 return a;
}
/* ---------- jump to a review: film page, scroll to it, highlight it ---------- */
let pendingFocus=null,focusFilm=0;
function goToReview(r){
 const film=Number(r&&r.film_id);if(!Number.isSafeInteger(film)||film<1)return;
 pendingFocus=r.id?{id:Number(r.id),film}:null;
 openFilmPage(film);
 try{const u=new URL(location.href);u.searchParams.set('film',String(film));if(r.id)u.searchParams.set('review',String(r.id));else u.searchParams.delete('review');history.replaceState(history.state,'',u);}catch(e){}
 // The film page may already be open with its reviews loaded: try right away, the render path tries again after loading.
 setTimeout(()=>{if(reviewHost&&reviewHost.isConnected)focusPending(reviewHost,true);},350);
}
function focusPending(host,quiet){
 if(!pendingFocus||pendingFocus.film!==focusFilm)return false;
 const card=host.querySelector('.fsReview[data-rid="'+pendingFocus.id+'"]');
 if(!card)return false;
 pendingFocus=null;
 card.classList.add('fsFlash');
 try{card.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){card.scrollIntoView();}
 setTimeout(()=>card.classList.remove('fsFlash'),3600);
 return true;
}
/* Make a whole card (not just its small film link) open its review on the film page. */
function reviewLink(el,r){
 if(!r||!r.film_id)return el;
 el.classList.add('fsClickable');el.tabIndex=0;el.setAttribute('role','link');
 el.title=T('رفتن به این نظر در صفحهٔ فیلم','Open this review on the film page');
 const go=()=>goToReview(r);
 el.addEventListener('click',e=>{
  if(e.target.closest&&e.target.closest('a,button,input,textarea,select,.fsLike,[role="button"]'))return;
  try{if(String(window.getSelection()||'').length)return;}catch(_){}
  go();
 });
 el.addEventListener('keydown',e=>{if(e.target!==el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
 return el;
}
const relTime=iso=>{try{return new Date(iso).toLocaleDateString(typeof LOC!=='undefined'?LOC:undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return '';}};
const note=text=>{const n=$('filmFriendsMessage');if(n)n.textContent=text||'';};
function backendProblem(error){
 console.warn('Film social',error);
 note(error&&(error.status===404||error.status===400||error.status===401||error.status===403)
  ?T('بخش اجتماعی هنوز کامل فعال نشده است (فایل‌های SQL امنیتی باید یک‌بار در Supabase اجرا شوند).','The social features are not fully enabled yet (the SQL files must be run once in Supabase).')
  :T('دریافت اطلاعات ممکن نشد؛ اتصال را بررسی کن.','Could not load; check your connection.'));
}

/* ---------- dialog ---------- */
let active='feed',selected=null,profileSerial=0;
function createDialog(){
 const launch=make('button','fsLaunch','👥 '+T('دوستان فیلم‌باز','Film friends'));launch.id='filmFriendsLaunch';launch.type='button';
 launch.onclick=()=>{const dlg=$('filmFriendsDialog');if(!dlg.open)dlg.showModal();if(!ready())gate();else openFeed();};document.body.appendChild(launch);
 const d=make('dialog','fsDialog');d.id='filmFriendsDialog';d.setAttribute('aria-label',T('دوستان فیلم‌باز','Film friends'));
 const head=make('div','fsHead');head.appendChild(make('h2','',T('👥 دوستان فیلم‌باز','👥 Film friends')));
 const controls=make('div','fsHeadActions');
 const feed=make('button','btn',T('دوستان من','My friends'));feed.onclick=()=>openFeed();
 const mine=make('button','btn',T('پروفایل من','My profile'));mine.onclick=()=>{if(ready())openProfile(ses.id);else gate();};
 const close=make('button','btn','✕');close.setAttribute('aria-label',T('بستن','Close'));close.onclick=()=>d.close();
 controls.append(feed,mine,close);head.appendChild(controls);d.appendChild(head);
 const msg=make('p','fsMessage');msg.id='filmFriendsMessage';msg.setAttribute('role','status');d.appendChild(msg);
 const body=make('div','fsBody');body.id='filmFriendsBody';d.appendChild(body);
 document.body.appendChild(d);
 d.addEventListener('click',e=>{if(e.target===d)d.close();});
}
function gate(){
 const body=$('filmFriendsBody');body.replaceChildren();
 const box=make('div','fsGate');
 box.append(make('strong','',T('برای دیدن پروفایل‌ها و دنبال‌کردن دیگران وارد شو','Sign in to browse profiles and follow people')),
  make('p','',T('با حساب خودت می‌توانی نظر بدهی، دیگران را دنبال کنی و نظرهای دوستانت را ببینی.','With an account you can review films, follow people and see what your friends think.')));
 const b=make('button','btn primary',T('ورود / ثبت‌نام','Sign in / Sign up'));b.onclick=()=>{$('filmFriendsDialog').close();openAuth('login');};
 box.appendChild(b);body.appendChild(box);
}
function show(id){
 const d=$('filmFriendsDialog');if(!d.open)d.showModal();
 if(id){openProfile(id);return;}
 if(active==='profile'&&selected){openProfile(selected);return;}
 if(!ready()){gate();return;}
 openFeed();
}

/* ---------- publishing my public profile ---------- */
let lastPublished='';
function watchedPayload(profile){
 if(profile.showWatched===false||typeof state==='undefined')return [];
 const seen=state.films.filter(f=>f&&f.status==='seen'&&f.title);
 seen.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(b.created||0)-(a.created||0));
 return seen.slice(0,80).map(f=>({
  id:Number.isSafeInteger(Number(f.tmdb))&&Number(f.tmdb)>0?'tmdb:'+Number(f.tmdb):'',
  title:String(f.title).slice(0,120),year:/^\d{4}$/.test(String(f.year||''))?String(f.year):'',
  poster:safePoster(f.poster),rating:f.rating>0?Math.min(10,Math.round(Number(f.rating)*2)):0
 }));
}
async function publishMyProfile(force){
 if(!ready())return false;
 const p=normalizeAccountProfile(accountProfile);
 const payload={user_id:ses.id,display_name:p.name||ses.email?.split('@')[0]||T('فیلم‌باز','Movie fan'),bio:p.bio||'',avatar:p.avatar||'',
  favorites:p.favorites.map(x=>{
   if(!String(x.id||'').startsWith('archive:'))return {id:x.id,title:x.title,poster:x.poster,year:x.year};
   const entry=state.films.find(f=>'archive:'+f.id===x.id);
   const tmdbId=Number(entry?.tmdb);
   return {id:Number.isSafeInteger(tmdbId)&&tmdbId>0?'tmdb:'+tmdbId:x.id,title:x.title,poster:x.poster,year:x.year};
  }),
  watched:watchedPayload(p)};
 const sig=ses.id+JSON.stringify(payload);
 if(!force&&sig===lastPublished)return true;
 const send=body=>write('/film_public_profiles?on_conflict=user_id',{method:'POST',
  headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
 try{await send(payload);}
 catch(e){
  if(/rest 400/.test(String(e.message))){const {watched,...older}=payload;await send(older);} // SQL v2 not run yet
  else throw e;
 }
 lastPublished=sig;profiles.delete(ses.id);return true;
}
let publishTimer=0;
const schedulePublish=()=>{clearTimeout(publishTimer);publishTimer=setTimeout(()=>{publishMyProfile().catch(e=>console.warn('Public profile sync',e));},1200);};
window.addEventListener('film-account-profile-updated',schedulePublish);
window.addEventListener('film-account-state',e=>{if(e.detail?.ready)schedulePublish();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready())publishMyProfile().catch(()=>{});});

/* ---------- friends page ---------- */
function followToggle(uid,small){
 const b=make('button','btn'+(small?' fsSmall':''));b.type='button';
 const paint=on=>{b.textContent=on?T('✓ دنبال می‌کنی','✓ Following'):T('＋ دنبال‌کردن','＋ Follow');b.classList.toggle('primary',!on);};
 myFollowing().then(set=>paint(set.has(uid)));paint(false);
 b.onclick=async()=>{
  if(!ready()){$('filmFriendsDialog').close();openAuth('login');return;}
  b.disabled=true;
  try{
   const set=await myFollowing();
   if(set.has(uid))await write('/film_follows?follower_id=eq.'+ses.id+'&followed_id=eq.'+uid,{method:'DELETE'});
   else await write('/film_follows',{method:'POST',body:JSON.stringify({follower_id:ses.id,followed_id:uid})});
   await myFollowing(true);paint((await myFollowing()).has(uid));refreshReviews();
  }catch(e){backendProblem(e);}
  b.disabled=false;
 };
 return b;
}
async function peopleList(parent,ids,emptyText){
 if(!ids.length){emptyNote(parent,emptyText);return;}
 const pm=await getProfiles(ids);await getRoles(ids);
 const list=make('div','fsList');
 for(const uid of ids){
  const row=make('div','fsRow fsPerson');row.append(avatar(pm.get(uid),42),nameButton(uid,pm.get(uid),roles.get(uid)));
  if(ready()&&uid!==ses.id){const sp=make('span','fsGrow');row.append(sp,followToggle(uid,true));}
  list.appendChild(row);
 }
 parent.appendChild(list);
}
function friendCard(uid,profile,role,lastReview){
 const card=make('article','fsFriend');
 const top=make('div','fsRow');top.append(avatar(profile,48),nameButton(uid,profile,role));card.appendChild(top);
 const watched=Array.isArray(profile?.watched)?profile.watched:[];
 const last=watched[0];
 const sec1=make('div','fsMini');sec1.appendChild(make('small','fsMiniLabel',T('آخرین فیلم دیده‌شده','Last watched')));
 if(last){
  const row=make('div','fsMiniRow');
  const raw=String(last.id||'');const filmId=/^tmdb:\d+$/.test(raw)?raw.split(':')[1]:'';
  const cover=make('span','fsMiniCover');let url=safePoster(last.poster);
  if(!url&&filmId&&window.filmDiscovery?.posterFor)url=window.filmDiscovery.posterFor({id:Number(filmId)})||'';
  if(url){const img=make('img');img.loading='lazy';img.alt='';img.src=url;img.onerror=()=>img.remove();cover.appendChild(img);}
  const info=make('span','fsMiniInfo');
  const sameReview=lastReview&&filmId&&String(lastReview.film_id)===filmId?lastReview:null;
  info.appendChild(filmId?filmButton(filmId,last.title,sameReview):make('b','',last.title||''));
  if(last.year)info.appendChild(make('small','fsDate',last.year));
  if(last.rating)info.appendChild(score(last.rating));
  row.append(cover,info);sec1.appendChild(row);
  if(filmId){
   row.classList.add('fsClickable');row.tabIndex=0;row.setAttribute('role','link');
   const go=()=>{if(sameReview)goToReview(sameReview);else openFilmPage(filmId);};
   row.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('a,button'))return;go();});
   row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();go();}});
  }
 }else sec1.appendChild(make('p','fsEmpty',profile?.watched===undefined?T('این بخش هنوز فعال نشده است.','Not available yet.'):T('هنوز فیلمی ثبت نکرده.','Nothing logged yet.')));
 const sec2=make('div','fsMini');sec2.appendChild(make('small','fsMiniLabel',T('آخرین نظر و امتیاز','Latest review & score')));
 if(lastReview){
  const l=make('p','fsFilmLine');l.append(filmButton(lastReview.film_id,lastReview.film_title,lastReview));if(lastReview.rating)l.append(' ',score(lastReview.rating));
  l.appendChild(make('small','fsDate',relTime(lastReview.created_at)));sec2.appendChild(l);
  if(lastReview.review){const t=lastReview.review;sec2.appendChild(make('p','fsSnippet',t.length>170?t.slice(0,170)+'…':t));}
 reviewLink(sec2,lastReview);
  if(lastReview.id){const lf=make('div','fsCardFoot');lf.appendChild(likeBar(lastReview));sec2.appendChild(lf);}
 }else sec2.appendChild(make('p','fsEmpty',T('هنوز نظری ننوشته.','No review yet.')));
 card.append(sec1,sec2);
 return card;
}
async function openFeed(tab){
 if(typeof tab!=='string')tab='friends';
 active='feed';selected=null;
 const body=$('filmFriendsBody');body.replaceChildren();
 if(!ready()){gate();return;}
 const nav=make('div','fsTabs fsNav');nav.setAttribute('role','tablist');
 const content=make('div','fsPage');
 body.append(nav,content);
 const serial=++profileSerial;
 const defs=[['friends',T('دوستان من','My friends')],['followers',T('دنبال‌کننده‌ها','Followers')],['find',T('پیدا کردن فیلم‌باز','Find people')]];
 for(const [key,label] of defs){const b=make('button','fsTab',label);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(key===tab));b.onclick=()=>openFeed(key);nav.appendChild(b);}
 note(T('در حال دریافت…','Loading…'));
 try{
  if(tab==='find'){note('');content.appendChild(userSearch());return;}
  if(tab==='followers'){
   const rows=await get('/film_follows?select=follower_id&followed_id=eq.'+ses.id+'&order=created_at.desc&limit=200');
   if(serial!==profileSerial)return;note('');
   await peopleList(content,rows.map(r=>r.follower_id),T('هنوز کسی تو را دنبال نکرده است.','Nobody follows you yet.'));
   markFollowersSeen();return;
  }
  const following=[...await myFollowing(true)].slice(0,150);
  if(serial!==profileSerial)return;
  if(!following.length){note('');emptyNote(content,T('هنوز کسی را دنبال نکرده‌ای. از «پیدا کردن فیلم‌باز» شروع کن؛ بعد اینجا آخرین فیلم و نظر هر دوستت را می‌بینی.','You are not following anyone yet. Start with “Find people”; then you will see each friend’s last film and review here.'));return;}
  const [pm,reviews]=await Promise.all([getProfiles(following,true),
   get('/film_public_reviews?select=id,user_id,film_id,film_title,rating,review,created_at&user_id=in.('+following.join(',')+')&order=created_at.desc&limit=400').catch(()=>[])]);
  await getRoles(following);
  if(serial!==profileSerial)return;note('');
  const latest=new Map();for(const r of reviews)if(!latest.has(r.user_id))latest.set(r.user_id,r);
  const order=following.slice().sort((a,b)=>String(latest.get(b)?.created_at||'').localeCompare(String(latest.get(a)?.created_at||'')));
  const grid=make('div','fsFriends');
  for(const uid of order)grid.appendChild(friendCard(uid,pm.get(uid),roles.get(uid),latest.get(uid)));
  content.appendChild(grid);
 }catch(e){backendProblem(e);}
}
function userSearch(){
 const box=make('div','fsCard fsSearch');
 box.appendChild(make('strong','',T('پیدا کردن فیلم‌بازها','Find film fans')));
 const bar=make('div','fsRow');
 const input=make('input');input.type='search';input.maxLength=60;input.placeholder=T('نام کاربر را بنویس','Search display name');input.setAttribute('aria-label',T('جستجوی کاربر','Search users'));
 const go=make('button','btn',T('جستجو','Search'));bar.append(input,go);
 const out=make('div','fsList');
 go.onclick=async()=>{
  out.replaceChildren();const q=input.value.trim().replace(/[,%()*]/g,' ').trim();
  if(q.length<2){emptyNote(out,T('حداقل دو حرف وارد کن','Enter at least two letters'));return;}
  try{
   const rows=await get('/film_public_profiles?select=user_id,display_name,avatar&display_name=ilike.'+encodeURIComponent('*'+q+'*')+'&limit=30');
   await getRoles(rows.map(r=>r.user_id));
   if(!rows.length)emptyNote(out,T('کاربری پیدا نشد','No users found'));
   for(const p of rows){const row=make('div','fsRow fsPerson');row.append(avatar(p,38),nameButton(p.user_id,p,roles.get(p.user_id)));if(ready()&&p.user_id!==ses.id){row.append(make('span','fsGrow'),followToggle(p.user_id,true));}out.appendChild(row);}
  }catch(e){backendProblem(e);}
 };
 input.addEventListener('keydown',e=>{if(e.key==='Enter')go.click();});
 box.append(bar,out);return box;
}
function markFollowersSeen(){try{window.filmFollowBell?.markSeen?.();}catch(e){}}

/* ---------- profile page ---------- */
async function openProfile(id){
 if(!validId(id))return;
 const d=$('filmFriendsDialog');if(!d.open)d.showModal();
 active='profile';selected=id;const serial=++profileSerial;
 const body=$('filmFriendsBody');body.replaceChildren(make('div','fsSkeleton'));note('');
 try{
  const mine=ready()&&id===ses.id;
  if(mine)await publishMyProfile(true).catch(()=>{});
  const [pm,followers,following,reviews,iFollow]=await Promise.all([
   getProfiles([id],true),
   get('/film_follows?select=follower_id&followed_id=eq.'+id+'&limit=1000').catch(()=>[]),
   get('/film_follows?select=followed_id&follower_id=eq.'+id+'&limit=1000').catch(()=>[]),
   get('/film_public_reviews?select=id,user_id,film_id,film_title,rating,review,created_at&user_id=eq.'+id+'&order=created_at.desc&limit=40').catch(()=>[]),
   mine||!ready()?Promise.resolve(new Set()):myFollowing(true),
   getRoles([id])
  ]);
  if(serial!==profileSerial)return;
  const profile=pm.get(id);body.replaceChildren();
  if(!profile||profile.missing){emptyNote(body,T('این کاربر هنوز پروفایل عمومی ندارد.','This member has no public profile yet.'));return;}
  const role=roles.get(id);
  const card=make('section','fsCard fsProfile');
  const top=make('div','fsProfileTop');top.appendChild(avatar(profile,92));
  const text=make('div','fsProfileText');
  const title=make('h3','',profile.display_name);title.dir='auto';
  const nameRow=make('div','fsRow');nameRow.appendChild(title);const rb=badge(role);if(rb)nameRow.appendChild(rb);
  const bio=make('p','fsBio',profile.bio||T('هنوز بیوگرافی ننوشته است.','No bio yet.'));bio.dir='auto';
  text.append(nameRow,bio);
  const stats=make('div','fsStats');
  if(mine)text.appendChild(make('p','fsEmail',ses.email||''));
  const stat=(n,label,fn)=>{const b=make(fn?'button':'span','fsStat');if(fn){b.type='button';b.onclick=fn;}b.append(make('b','',faNum(n)),make('span','',label));return b;};
  const jump=key=>()=>{const t=tabs.querySelector('[data-key="'+key+'"]');if(t)t.click();else openConnections(id,key);};
  stats.append(stat(reviews.length,T('نظر','Reviews'),jump('reviews')),
   stat(followers.length,T('دنبال‌کننده','Followers'),jump('followers')),
   stat(following.length,T('دنبال‌شونده','Following'),jump('following')));
  text.appendChild(stats);top.appendChild(text);card.appendChild(top);
  const actions=make('div','fsActions');
  if(mine){
   const edit=make('button','btn primary',T('ویرایش پروفایل','Edit profile'));edit.onclick=()=>{$('filmFriendsDialog').close();window.filmAccountProfile?.open();};
   const out=make('button','btn danger',T('خروج از حساب','Sign out'));out.onclick=async()=>{$('filmFriendsDialog').close();await window.filmAccountActions?.signOut();};
   actions.append(edit,out);
  }else{
   let following_=iFollow.has(id);
   const btn=make('button','btn primary',!ready()?T('ورود برای دنبال‌کردن','Sign in to follow'):following_?T('✓ دنبال می‌کنی','✓ Following'):T('＋ دنبال‌کردن','＋ Follow'));
   btn.onclick=async()=>{
    if(!ready()){$('filmFriendsDialog').close();openAuth('login');return;}
    btn.disabled=true;
    try{
     if(following_)await write('/film_follows?follower_id=eq.'+ses.id+'&followed_id=eq.'+id,{method:'DELETE'});
     else await write('/film_follows',{method:'POST',body:JSON.stringify({follower_id:ses.id,followed_id:id})});
     await myFollowing(true);refreshReviews();await openProfile(id);
    }catch(e){backendProblem(e);btn.disabled=false;}
   };
   if(following_){btn.classList.remove('primary');}
   actions.appendChild(btn);
  }
  const share=make('button','btn',T('کپی لینک پروفایل','Copy profile link'));
  share.onclick=async()=>{
   const url=new URL(location.href);url.search='';url.searchParams.set('user',id);url.hash='';
   try{await navigator.clipboard.writeText(url.href);note(T('لینک کپی شد','Link copied'));}catch(e){window.prompt(T('لینک پروفایل','Profile link'),url.href);}
  };
  actions.appendChild(share);card.appendChild(actions);

  const tabs=make('div','fsTabs');tabs.setAttribute('role','tablist');
  const panel=make('div','fsPanel');
  const favs=Array.isArray(profile.favorites)?profile.favorites.slice(0,10):[];
  const watched=Array.isArray(profile.watched)?profile.watched:null;
  const defs=[
   ['top',T('۱۰ فیلم برتر','Top 10'),()=>renderPoster(panel,favs.map(m=>({id:m.id,title:m.title,year:m.year,poster:m.poster})),T('هنوز فیلم برتری ثبت نشده است.','No top films yet.'),true)],
   ['seen',T('دیده‌شده‌ها','Watched')+(watched?' ('+faNum(watched.length)+')':''),()=>{
     if(watched===null)emptyNote(panel.replaceChildren()||panel,T('این بخش هنوز فعال نشده است.','Not available yet.'));
     else renderPoster(panel,watched,T('این کاربر فیلم دیده‌شده‌ای را عمومی نکرده است.','No public watched films.'),false,new Map(reviews.map(r=>[String(r.film_id),r])));}],
   ['reviews',T('نظرها','Reviews')+' ('+faNum(reviews.length)+')',()=>renderProfileReviews(panel,reviews)]
  ];
  if(mine){
   defs.push(['following',T('دنبال‌شونده‌ها','Following')+' ('+faNum(following.length)+')',()=>{peopleList(panel,following.map(r=>r.followed_id),T('هنوز کسی را دنبال نکرده‌ای.','You are not following anyone yet.')).catch(backendProblem);}],
    ['followers',T('دنبال‌کننده‌ها','Followers')+' ('+faNum(followers.length)+')',()=>{peopleList(panel,followers.map(r=>r.follower_id),T('هنوز کسی تو را دنبال نکرده است.','Nobody follows you yet.')).catch(backendProblem);markFollowersSeen();}],
    ['settings',T('⚙️ تنظیمات حساب','⚙️ Account settings'),()=>renderSettings(panel)]);
  }
  const select=key=>{
   tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.key===key)));
   panel.replaceChildren();defs.find(x=>x[0]===key)[2]();
  };
  for(const [key,label] of defs){const b=make('button','fsTab',label);b.type='button';b.dataset.key=key;b.setAttribute('role','tab');b.onclick=()=>select(key);tabs.appendChild(b);}
  card.append(tabs,panel);body.appendChild(card);select('top');
 }catch(e){backendProblem(e);body.replaceChildren();}
}
function renderSettings(panel){
 panel.replaceChildren();
 const A=window.filmAccountActions||{};
 const st=A.status?.()||{};
 const box=(title)=>{const c=make('section','fsCard fsInner fsSet');c.appendChild(make('h4','',title));panel.appendChild(c);return c;};
 const acc=box(T('حساب','Account'));
 acc.appendChild(make('p','fsEmail',ses.email||''));
 const sync=make('p','fsHint',(st.message||'—')+(st.synced?' • '+T('آخرین همگام‌سازی: ','Last sync: ')+new Date(st.synced).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):''));acc.appendChild(sync);
 const row=make('div','fsActions');
 const edit=make('button','btn primary',T('ویرایش نام، عکس و بیو','Edit name, photo & bio'));edit.onclick=()=>{$('filmFriendsDialog').close();window.filmAccountProfile?.open();};
 const refresh=make('button','btn',T('به‌روزرسانی حساب','Refresh account'));refresh.onclick=()=>{Promise.resolve(A.refresh?.()).then(()=>note(T('درخواست به‌روزرسانی ارسال شد.','Refresh started.')));};
 const imp=make('button','btn',T('انتقال آرشیو قدیمی این مرورگر','Import this browser’s old archive'));imp.onclick=()=>{$('filmFriendsDialog').close();A.importLegacy?.();};
 row.append(edit,refresh,imp);acc.appendChild(row);
 const sec=box(T('امنیت','Security'));
 const pw=make('input');pw.type='password';pw.dir='ltr';pw.autocomplete='new-password';pw.placeholder=T('رمز جدید (حداقل ۶ نویسه)','New password (min. 6 characters)');pw.setAttribute('aria-label',T('رمز جدید','New password'));
 const save=make('button','btn',T('تغییر رمز','Change password'));
 save.onclick=async()=>{
  save.disabled=true;
  try{await A.changePassword(pw.value);pw.value='';note(T('رمز تغییر کرد.','Password changed.'));}
  catch(e){note(String(e.message||e).slice(0,140));}
  save.disabled=false;
 };
 const line=make('div','fsRow');line.append(pw,save);sec.appendChild(line);
 if(window.filmStaff?.isStaff?.()){
  const staff=box(T('مدیریت','Administration'));
  const b=make('button','btn',T('🛡️ باز کردن پنل مدیریت','🛡️ Open staff panel'));b.onclick=()=>{$('filmFriendsDialog').close();window.filmStaff.open();};
  staff.appendChild(b);
 }
 const out=box(T('خروج','Sign out'));
 const ob=make('button','btn danger',T('خروج از حساب','Sign out'));ob.onclick=async()=>{$('filmFriendsDialog').close();await A.signOut?.();};
 out.append(make('p','fsHint',T('با خروج، آرشیو روی همین دستگاه نمایش داده نمی‌شود؛ اطلاعات تو در حساب می‌ماند.','After signing out your archive is hidden on this device; your data stays in your account.')),ob);
}
function renderPoster(panel,items,emptyText,ranked,reviewByFilm){
 panel.replaceChildren();
 const grid=make('div','fsPosters');
 items.forEach((m,i)=>{
  const raw=String(m.id||'');const filmId=/^tmdb:\d+$/.test(raw)?raw.split(':')[1]:'';
  const tile=filmId?filmButton(filmId,'',reviewByFilm&&reviewByFilm.get(filmId)):make('div','fsFilm');tile.className='fsPosterTile';tile.textContent='';
  const cover=make('div','fsCover');
  let url=safePoster(m.poster);
  if(!url&&filmId&&window.filmDiscovery?.posterFor)url=window.filmDiscovery.posterFor({id:Number(filmId)})||'';
  if(url){const img=make('img');img.loading='lazy';img.decoding='async';img.alt=String(m.title||'');img.src=url;img.onerror=()=>img.remove();cover.appendChild(img);}
  else cover.appendChild(make('span','fsNoPoster',String(m.title||'').slice(0,40)));
  if(ranked)cover.appendChild(make('b','fsRank',faNum(i+1)));
  if(m.rating)cover.appendChild(make('span','fsCoverScore','★ '+faNum(m.rating)));
  tile.append(cover,make('span','fsTileTitle',(m.title||T('بدون عنوان','Untitled'))+(m.year?' · '+m.year:'')));
  grid.appendChild(tile);
 });
 if(!items.length)emptyNote(panel,emptyText);else panel.appendChild(grid);
}
function renderProfileReviews(panel,reviews){
 panel.replaceChildren();
 if(!reviews.length){emptyNote(panel,T('هنوز نظری منتشر نشده است.','No reviews yet.'));return;}
 for(const r of reviews){
  const card=make('article','fsCard fsInner');
  const line=make('p','fsFilmLine');line.append(filmButton(r.film_id,r.film_title,r));if(r.rating)line.append(' ',score(r.rating));
  line.appendChild(make('small','fsDate',relTime(r.created_at)));card.appendChild(line);
  if(r.review)card.appendChild(make('p','fsText',r.review));
  if(r.id)card.appendChild(make('div','fsCardFoot')).appendChild(likeBar(r));
  reviewLink(card,r);
  panel.appendChild(card);
 }
}
async function openConnections(id,kind){
 const body=$('filmFriendsBody');body.replaceChildren(make('div','fsSkeleton'));
 try{
  const col=kind==='followers'?'follower_id':'followed_id',filter=kind==='followers'?'followed_id':'follower_id';
  const rows=await get('/film_follows?select='+col+'&'+filter+'=eq.'+id+'&limit=200');
  const ids=rows.map(r=>r[col]);const pm=await getProfiles(ids);await getRoles(ids);
  body.replaceChildren();
  const back=make('button','btn',T('← بازگشت به پروفایل','← Back to profile'));back.onclick=()=>openProfile(id);body.appendChild(back);
  body.appendChild(make('h3','',kind==='followers'?T('دنبال‌کننده‌ها','Followers'):T('دنبال‌شونده‌ها','Following')));
  const list=make('div','fsList');
  if(!ids.length)emptyNote(list,T('هنوز کسی در این فهرست نیست.','Nobody here yet.'));
  for(const uid of ids){const row=make('div','fsRow fsPerson');row.append(avatar(pm.get(uid),40),nameButton(uid,pm.get(uid),roles.get(uid)));list.appendChild(row);}
  body.appendChild(list);
 }catch(e){backendProblem(e);}
}

/* ---------- reviews on every film page ---------- */
let reviewSerial=0,reviewHost=null,shown=new Map();
function ensureReviewHost(){
 const view=$('filmDetailView');if(!view)return null;
 if(!reviewHost){reviewHost=make('section','fsReviews');reviewHost.id='filmReviews';reviewHost.setAttribute('aria-label',T('نظرها و امتیازها','Reviews and ratings'));}
 if(reviewHost.parentNode!==view)view.appendChild(reviewHost);
 return reviewHost;
}
/* A member can report someone else's review; moderators see the report in their desk (security/film-round9.sql). */
function reportButton(r,card){
 const b=make('button','fsReport','🚩');b.type='button';
 b.title=T('گزارش این نظر به مودریتورها','Report this review to the moderators');b.setAttribute('aria-label',b.title);
 let form=null;
 b.onclick=()=>{
  if(form){form.remove();form=null;return;}
  form=make('form','fsReportForm');
  const why=make('input');why.maxLength=200;why.required=true;why.placeholder=T('چرا این نظر نامناسب است؟','Why is this review a problem?');why.setAttribute('aria-label',why.placeholder);
  const send=make('button','btn primary',T('ارسال گزارش','Send report'));send.type='submit';
  const msg=make('small','fsReportMsg');form.append(why,send,msg);
  form.onsubmit=async e=>{
   e.preventDefault();const reason=why.value.trim();
   if(reason.length<3){msg.textContent=T('دلیل را کمی کامل‌تر بنویس.','Please write a little more.');return;}
   send.disabled=true;
   try{
    await write('/rpc/film_report_review',{method:'POST',body:JSON.stringify({p_review:Number(r.id),p_reason:reason})});
    form.replaceChildren(make('small','fsReportMsg',T('گزارش ثبت شد؛ مودریتورها بررسی می‌کنند. ممنون 🙏','Report received; the moderators will take a look. Thank you 🙏')));
    b.disabled=true;
   }catch(err){
    send.disabled=false;
    const t=String(err&&err.message||err);
    msg.textContent=/54000|too many/.test(t)?T('امروز بیش از حد گزارش داده‌ای؛ فردا دوباره.','Too many reports today; try tomorrow.')
     :/42501|verified/.test(t)?T('برای گزارش‌دادن، ایمیلت باید تأیید شده باشد.','Your e-mail must be confirmed to report.')
     :/404|PGRST|does not exist/.test(t)?T('گزارش‌دادن هنوز فعال نشده است (SQL امنیتی را اجرا کن).','Reporting is not enabled yet (run the security SQL).')
     :T('ارسال نشد؛ دوباره امتحان کن.','Could not send; try again.');
   }
  };
  card.appendChild(form);why.focus();
 };
 return b;
}
function trashButton(r,card){
 const mine=ready()&&r.user_id===ses.id;
 const b=make('button','fsTrash','🗑️');b.type='button';
 b.title=mine?T('حذف نظر من','Delete my review'):T('حذف نظر (مدیریت)','Delete review (staff)');
 b.setAttribute('aria-label',b.title);
 let armed=false,timer=0;
 b.onclick=async()=>{
  if(!armed){armed=true;b.textContent=T('مطمئنی؟','Sure?');b.classList.add('armed');timer=setTimeout(()=>{armed=false;b.textContent='🗑️';b.classList.remove('armed');},4000);return;}
  clearTimeout(timer);b.disabled=true;
  try{
   const response=await write('/film_public_reviews?id=eq.'+Number(r.id),{method:'DELETE',headers:{Prefer:'return=representation'}});
   const gone=await response.json().catch(()=>[]);
   if(!Array.isArray(gone)||!gone.length)throw Error('denied');
   card.remove();refreshReviews();
  }catch(e){b.disabled=false;armed=false;b.textContent='🗑️';b.classList.remove('armed');(typeof toast==='function'?toast:note)(T('حذف نشد؛ دسترسی نداری یا اتصال قطع است.','Could not delete: no permission or offline.'));}
 };
 return b;
}
/* ---------- hearts on reviews ---------- */
const likes=new Map();let likeQueue=new Set(),likeTimer=0;
const serverSeen=new Set(); // review ids whose likes were really read from the server
/* my own likes are mirrored in this browser, so a red heart never disappears while the server is slow or briefly unreachable */
const mirrorKey=()=>'film-my-likes-v1:'+(ready()?ses.id:'');
const mirrorGet=()=>{try{return new Set(JSON.parse(localStorage.getItem(mirrorKey())||'[]'));}catch(e){return new Set();}};
const mirrorSet=(id,on)=>{if(!ready())return;try{const m=mirrorGet();on?m.add(Number(id)):m.delete(Number(id));localStorage.setItem(mirrorKey(),JSON.stringify([...m].slice(-3000)));}catch(e){}};
async function fetchLikes(ids,force){
 ids=[...new Set(ids.map(Number).filter(n=>n>0&&(force||!likes.has(n))))];
 for(let i=0;i<ids.length;i+=80){
  const chunk=ids.slice(i,i+80);
  let rows=null;
  for(let attempt=0;attempt<2&&!rows;attempt++){try{rows=await get('/film_review_likes?select=review_id,user_id&review_id=in.('+chunk.join(',')+')&limit=5000');}catch(e){await new Promise(r=>setTimeout(r,400));}}
  if(!rows)continue; // unreachable: keep whatever we had (never cache "0 likes" from a failed request)
  for(const id of chunk){likes.set(id,new Set());serverSeen.add(id);}
  for(const row of rows)likes.get(Number(row.review_id))?.add(row.user_id);
  if(ready()){const mine=new Set(rows.filter(r=>r.user_id===ses.id).map(r=>Number(r.review_id)));for(const id of chunk)mirrorSet(id,mine.has(id));}
 }
}
function queueLikes(id){
 likeQueue.add(Number(id));clearTimeout(likeTimer);
 likeTimer=setTimeout(async()=>{const ids=[...likeQueue];likeQueue=new Set();await fetchLikes(ids);for(const id of ids)paintHearts(id);},40);
}
function paintBox(box,id){
 id=Number(id);
 const set=likes.get(id)||new Set();
 const me=ready()?ses.id:'';
 const local=!!me&&!serverSeen.has(id)&&mirrorGet().has(id);
 const on=!!me&&(set.has(me)||local);
 const total=Math.max(set.size,local&&!set.has(me)?set.size+1:0);
 const b=box.querySelector('button');b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
 const cn=box.querySelector('span');cn.textContent=total?faNum(total):'';
 /* paint the heart with its own attributes so it can never turn invisible (stale CSS, theme colours): red + filled when liked */
 const sv=b.querySelector('svg');if(sv){sv.setAttribute('fill',on?'#ff4d6d':'none');sv.setAttribute('stroke',on?'#ff4d6d':'#8a948f');}
 cn.style.cssText='display:inline;min-width:8px;font-weight:700;font-size:13px;color:'+(on?'#ff4d6d':'inherit');
 b.title=on?T('برداشتن لایک','Remove like'):T('پسندیدن این نظر','Like this review');
 b.setAttribute('aria-label',b.title+(total?' ('+total+')':''));
}
function repaintAllHearts(){document.querySelectorAll('.fsLike[data-rid]').forEach(box=>paintBox(box,box.dataset.rid));}
function paintHearts(id){
 document.querySelectorAll('.fsLike[data-rid="'+Number(id)+'"]').forEach(box=>paintBox(box,id));
}
/* A real heart drawn as SVG (the old text glyph looked like a tiny blob in many fonts): outline = not liked, filled = liked. */
function heartIcon(){
 const NS='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','fsHeartIcon');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('fill','none');svg.setAttribute('stroke','#8a948f');svg.setAttribute('stroke-width','1.9');svg.setAttribute('stroke-linejoin','round');svg.style.cssText='width:20px;height:20px;display:block;flex:none';svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=document.createElementNS(NS,'path');
 path.setAttribute('d','M12 20.6 4.6 13.4C2.2 11 2.3 7.4 4.5 5.5c2-1.7 4.8-1.3 6.4.6l1.1 1.3 1.1-1.3c1.6-1.9 4.4-2.3 6.4-.6 2.2 1.9 2.3 5.5-.1 7.9z');
 svg.appendChild(path);return svg;
}
function likeBar(r){
 const box=make('div','fsLike');box.dataset.rid=Number(r.id);
 const b=make('button','fsHeart');b.type='button';b.appendChild(heartIcon());b.setAttribute('aria-pressed','false');
 const count=make('span','fsLikeCount');box.append(b,count);
 const mine=()=>ready()&&r.user_id===ses.id;
 if(mine())b.classList.add('own');
 b.onclick=async()=>{
  if(!ready()){if(typeof openAuth==='function')openAuth('login');return;}
  if(mine()){toast(T('نظر خودت را نمی‌توانی لایک کنی','You cannot like your own review'));return;}
  const id=Number(r.id);await fetchLikes([id]);
  const set=likes.get(id)||new Set();likes.set(id,set);
  const had=set.has(ses.id);
  if(had)set.delete(ses.id);else set.add(ses.id);serverSeen.add(id);paintHearts(id);b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),400);
  try{
   if(had)await write('/film_review_likes?review_id=eq.'+id+'&user_id=eq.'+ses.id,{method:'DELETE'});
   else{
    try{await write('/film_review_likes',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({review_id:id,user_id:ses.id})});}
    catch(err){if(err.status!==409)throw err;} // already liked on the server: that is fine
   }
   mirrorSet(id,!had);
   /* re-read the truth from the server so the heart and the number are always exact */
   await fetchLikes([id],true);
   const fresh=likes.get(id)||new Set();
   if(!had&&!fresh.has(ses.id))throw Object.assign(Error('not stored'),{status:0});
   paintHearts(id);
  }catch(e){
   if(had)set.add(ses.id);else set.delete(ses.id);mirrorSet(id,had);paintHearts(id);
   const code=e.status?' ('+e.status+')':'';
   toast(e.status===404?T('بخش لایک هنوز فعال نشده است (SQL مرحلهٔ ۸ را یک‌بار اجرا کن).','Likes are not enabled yet (run the step-8 SQL once).')
    :e.status===403?T('لایک ثبت نشد؛ ایمیل حسابت باید تأیید شده باشد و حسابت نباید مسدود باشد.','Could not like: your e-mail must be confirmed and your account must not be suspended.')
    :T('لایک ثبت نشد'+code+'؛ اتصال را بررسی کن و دوباره بزن.','Could not like'+code+'; check your connection and try again.'));
  }
 };
 if(likes.has(Number(r.id)))paintBox(box,r.id);else queueLikes(r.id);
 return box;
}
async function saveMyReview(movie,rating,review,existingId){
 const body={user_id:ses.id,film_id:Number(movie.id),film_title:String(movie.title||movie.original_title||'').slice(0,180),rating:rating||null,review:String(review||'').slice(0,1500),updated_at:new Date().toISOString()};
 await publishMyProfile().catch(()=>{});
 if(existingId)await write('/film_public_reviews?id=eq.'+Number(existingId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
 else await write('/film_public_reviews?on_conflict=user_id,film_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
 window.dispatchEvent(new CustomEvent('film-review-saved',{detail:{film_id:body.film_id}}));
}
function reviewCard(r,pm,role,opts){
 const card=make('article','fsCard fsReview'+(role==='critic'?' fsCritic':''));
 if(r.id)card.dataset.rid=String(Number(r.id));
 const top=make('div','fsRow');
 top.append(avatar(pm.get(r.user_id),opts?.big?48:38),nameButton(r.user_id,pm.get(r.user_id),role));
 const grow=make('span','fsGrow');top.appendChild(grow);
 if(r.rating)top.appendChild(score(r.rating,role==='critic'?'fsScoreBig':''));
 if(opts?.onEdit&&ready()&&r.user_id===ses.id){const eb=make('button','fsEdit','✏️ '+T('ویرایش','Edit'));eb.type='button';eb.onclick=opts.onEdit;top.appendChild(eb);}
 if(r.id&&ready()&&r.user_id!==ses.id)top.appendChild(reportButton(r,card));
 if(r.id&&((window.filmStaff?.isStaff?.())||(ready()&&r.user_id===ses.id)))top.appendChild(trashButton(r,card));
 card.appendChild(top);
 if(r.review)card.appendChild(make('p','fsText',r.review));
 const foot=make('div','fsCardFoot');
 if(r.id)foot.appendChild(likeBar(r));
 foot.appendChild(make('small','fsDate',relTime(r.updated_at||r.created_at)));
 card.appendChild(foot);
 return card;
}
function average(list){const v=list.map(r=>Number(r.rating)).filter(x=>x>0);return v.length?{avg:v.reduce((a,b)=>a+b,0)/v.length,n:v.length}:null;}
function summaryBox(label,stat,cls){
 const box=make('div','fsSum '+(cls||''));
 box.appendChild(make('span','fsSumLabel',label));
 box.appendChild(make('b','fsSumValue',stat?faNum(stat.avg.toFixed(1)):'—'));
 box.appendChild(make('small','',stat?faNum(stat.n)+' '+T('امتیاز','ratings'):T('هنوز امتیازی نیست','No ratings yet')));
 return box;
}
async function renderReviews(movie){
 const host=ensureReviewHost();if(!host||!movie?.id)return;
 const id=Number(movie.id),serial=++reviewSerial;focusFilm=id;
 host.replaceChildren();host.hidden=false;
 host.appendChild(make('h2','fsReviewsTitle',T('نظرها و امتیازها','Reviews & ratings')));
 const bodyEl=make('div','fsReviewsBody');bodyEl.appendChild(make('div','fsSkeleton'));host.appendChild(bodyEl);
 let reviews;
 try{reviews=await get('/film_public_reviews?select=id,user_id,film_id,film_title,rating,review,created_at,updated_at&film_id=eq.'+id+'&order=created_at.desc&limit=100');}
 catch(e){
  if(serial!==reviewSerial)return;
  bodyEl.replaceChildren(make('p','fsEmpty',e.status===401||e.status===403||e.status===404
   ?T('بخش نظرها هنوز فعال نشده است (یک‌بار SQL امنیتی اجتماعی باید در Supabase اجرا شود).','Reviews are not enabled yet (run the social SQL once in Supabase).')
   :T('دریافت نظرها ممکن نشد.','Could not load reviews.')));
  return;
 }
 if(serial!==reviewSerial)return;
 const userIds=[...new Set(reviews.map(r=>r.user_id))];
 await getRoles(userIds);
 const isCritic=r=>roles.get(r.user_id)==='critic';
 const criticsAll=reviews.filter(isCritic),membersAll=reviews.filter(r=>!isCritic(r));
 const following=ready()?await myFollowing():new Set();
 const mineReview=ready()?reviews.find(r=>r.user_id===ses.id):null;
 const friendReviews=reviews.filter(r=>following.has(r.user_id)&&r.user_id!==(ready()?ses.id:''));
 // A review by someone you follow appears ONLY under "From people you follow", never a second time below.
 const isFriend=new Set(friendReviews.map(r=>r.id));
 const critics=criticsAll.filter(r=>r!==mineReview&&!isFriend.has(r.id)),members=membersAll.filter(r=>r!==mineReview&&!isFriend.has(r.id));
 await fetchLikes(reviews.map(r=>r.id),true);
 const firstPage=members.slice(0,10);
 const needProfiles=[...critics,...friendReviews,...firstPage].map(r=>r.user_id).concat(ready()?[ses.id]:[]);
 await getProfiles(needProfiles);
 if(serial!==reviewSerial)return;
 bodyEl.replaceChildren();

 const sums=make('div','fsSums');
 sums.append(summaryBox(T('میانگین منتقدان','Critics’ average'),average(criticsAll),'fsSumCritic'),
  summaryBox(T('میانگین کاربران','Members’ average'),average(membersAll)));
 bodyEl.appendChild(sums);
 const mineBox=make('div','fsMine');bodyEl.appendChild(mineBox);
 const showMine=(editing)=>{
  mineBox.replaceChildren();
  if(mineReview&&!editing){
   const s=make('div','fsSection');s.appendChild(make('h3','',T('نظر من','My review')));
   s.appendChild(reviewCard(mineReview,new Map([[ses.id,profiles.get(ses.id)]]),roles.get(ses.id),{big:true,onEdit:()=>showMine(true)}));
   mineBox.appendChild(s);
  }else mineBox.appendChild(composer(movie,mineReview,editing?()=>showMine(false):null));
 };
 showMine(false);

 const sec=(title,cls)=>{const s=make('div','fsSection '+(cls||''));s.appendChild(make('h3','',title));bodyEl.appendChild(s);return s;};
 const cs=sec(T('نظر منتقدان','Critics’ reviews'),'fsCriticsSection');
 if(!critics.length)emptyNote(cs,criticsAll.some(r=>r!==mineReview)?T('نظر منتقدی که دنبالش می‌کنی بالاتر، در «از دنبال‌شونده‌های تو» آمده است.','A critic you follow is listed above, under “From people you follow”.'):T('هنوز منتقدی دربارهٔ این فیلم نظر نداده است.','No critic has reviewed this film yet.'));
 for(const r of critics)cs.appendChild(reviewCard(r,new Map([[r.user_id,profiles.get(r.user_id)]]),'critic',{big:true}));

 if(ready()&&following.size){
  const fs=sec(T('از دنبال‌شونده‌های تو','From people you follow'),'fsFriendsSection');
  if(!friendReviews.length)emptyNote(fs,T('هیچ‌کدام از دنبال‌شونده‌هایت هنوز دربارهٔ این فیلم نظر نداده‌اند.','Nobody you follow has reviewed this film yet.'));
  for(const r of friendReviews)fs.appendChild(reviewCard(r,new Map([[r.user_id,profiles.get(r.user_id)]]),roles.get(r.user_id)));
 }

 const us=sec(T('نظر کاربران','Member reviews'));
 const list=make('div','fsReviewList');us.appendChild(list);
 let shownCount=0;
 const more=make('button','btn fsMore',T('نمایش نظرهای بیشتر','Show more reviews'));
 const paint=async()=>{
  const slice=members.slice(shownCount,shownCount+10);
  await getProfiles(slice.map(r=>r.user_id));
  if(serial!==reviewSerial)return;
  for(const r of slice)list.appendChild(reviewCard(r,new Map([[r.user_id,profiles.get(r.user_id)]]),roles.get(r.user_id)));
  shownCount+=slice.length;more.hidden=shownCount>=members.length;
 };
 if(!members.length)emptyNote(us,friendReviews.length||membersAll.some(r=>r!==mineReview)?T('نظر دیگری از کاربران نیست.','No other member reviews.'):T('هنوز نظری ثبت نشده؛ اولین نفر باش.','No member reviews yet — be the first.'));
 more.onclick=paint;us.appendChild(more);await paint();
 // Coming from a clicked review: make sure it is on screen (it may sit beyond the first ten), then scroll + highlight it.
 if(pendingFocus&&pendingFocus.film===id){
  const idx=members.findIndex(r=>Number(r.id)===pendingFocus.id);
  while(idx>=shownCount&&shownCount<members.length&&serial===reviewSerial)await paint();
  if(serial!==reviewSerial)return;
  if(!focusPending(host)){
   const gone=pendingFocus;pendingFocus=null;
   if(gone&&typeof toast==='function')toast(T('این نظر دیگر موجود نیست.','That review no longer exists.'));
   host.scrollIntoView({block:'start',behavior:'smooth'});
  }
 }
}
function composer(movie,mineReview,onCancel){
 const box=make('form','fsCard fsCompose');
 box.appendChild(make('h3','',mineReview?T('ویرایش نظر من','Edit my review'):T('نظر من','My review')));
 if(!ready()){
  box.appendChild(make('p','fsText',T('برای ثبت نظر و امتیاز، وارد حساب شو یا ثبت‌نام کن.','Sign in or sign up to rate and review.')));
  const b=make('button','btn primary',T('ورود / ثبت‌نام','Sign in / Sign up'));b.type='button';b.onclick=()=>openAuth('login');box.appendChild(b);return box;
 }
 const stars=make('div','fsStarPick');stars.setAttribute('role','radiogroup');stars.setAttribute('aria-label',T('امتیاز از ۱۰','Rating out of 10'));
 let rating=mineReview?.rating||0;
 const paintStars=()=>stars.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',Number(b.dataset.v)<=rating);b.setAttribute('aria-checked',String(Number(b.dataset.v)===rating));});
 for(let i=1;i<=10;i++){const b=make('button','',faNum(i));b.type='button';b.dataset.v=i;b.setAttribute('role','radio');b.onclick=()=>{rating=rating===i?0:i;paintStars();};stars.appendChild(b);}
 paintStars();
 const text=make('textarea');text.maxLength=1500;text.rows=4;text.value=mineReview?.review||'';
 text.placeholder=T('نظرت را دربارهٔ فیلم بنویس (اختیاری)…','Write your review (optional)…');text.setAttribute('aria-label',T('متن نظر','Review text'));
 const actions=make('div','fsRow');
 const submit=make('button','btn primary',mineReview?T('ذخیرهٔ تغییرات','Save changes'):T('انتشار نظر','Publish'));submit.type='submit';
 actions.appendChild(submit);
 if(mineReview){
  const del=make('button','btn danger',T('حذف نظر','Delete'));del.type='button';
  del.onclick=async()=>{
   if(!confirm(T('این نظر برای همیشه حذف شود؟','Delete this review permanently?')))return;
   try{await write('/film_public_reviews?id=eq.'+mineReview.id,{method:'DELETE'});toast(T('نظر حذف شد','Review deleted'));renderReviews(movie);}
   catch(e){backendProblem(e);}
  };actions.appendChild(del);
 }
 if(onCancel){const c=make('button','btn',T('انصراف','Cancel'));c.type='button';c.onclick=onCancel;actions.appendChild(c);}
 box.append(stars,text,actions,make('p','fsHint',T('نظر و امتیاز تو برای همهٔ بازدیدکنندگان سایت قابل مشاهده است و دنبال‌کننده‌هایت آن را در صفحهٔ فیلم می‌بینند.','Your rating and review are visible to everyone and show up for your followers on the film page.')));
 let busy=false;
 box.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  const review=text.value.trim();
  if(!rating&&!review){toast(T('امتیاز یا متن نظر را وارد کن','Add a rating or some text'));return;}
  busy=true;submit.disabled=true;
  try{
   await saveMyReview(movie,rating,review,mineReview?.id);
   toast(T('نظر ذخیره شد ✓','Review saved ✓'));renderReviews(movie);
  }catch(error){backendProblem(error);toast(T('ذخیره نظر ناموفق بود','Could not save the review'));busy=false;submit.disabled=false;}
 };
 return box;
}
window.addEventListener('film-detail-loaded',e=>{
 const m=e.detail?.movie;if(!m?.id)return;
 if(shown.get('id')===m.id&&reviewHost?.isConnected&&reviewHost.childElementCount>1){
  if(pendingFocus&&pendingFocus.film===Number(m.id)&&!focusPending(reviewHost))renderReviews(m);
  return;
 }
 shown.set('id',m.id);renderReviews(m);
});
/* The film page can finish painting before this script has loaded (a fast, cached catalog); catch up once. */
function catchUpReviews(){
 const m=window.filmDiscovery?.getCurrentMovie?.();
 if(m?.id&&!(reviewHost?.isConnected&&reviewHost.childElementCount>1)){shown.set('id',m.id);renderReviews(m);}
}
window.addEventListener('load',()=>setTimeout(catchUpReviews,0));
function refreshReviews(){const m=window.filmDiscovery?.getCurrentMovie?.();if(m&&reviewHost?.isConnected&&!reviewHost.hidden)renderReviews(m);}
window.addEventListener('film-account-state',refreshReviews);
window.addEventListener('film-staff-state',refreshReviews);

/* ---------- room members: avatar + profile link ---------- */
const pendingRoom=new Set();
if(typeof R!=='undefined'){
 R.decorateMember=(root,letter,p)=>{
  const uid=p.uid;if(!validId(uid))return;
  const cached=profiles.get(uid);
  if(cached&&!cached.missing&&/^data:image\/jpeg;base64,/i.test(cached.avatar||'')){
   const img=make('img','peAvatar');img.src=cached.avatar;img.alt='';img.decoding='async';
   letter.replaceChildren(img);letter.classList.add('hasPhoto');
  }
  root.classList.add('clickable');root.tabIndex=0;root.setAttribute('role','button');
  root.title=T('مشاهدهٔ پروفایل ','View profile of ')+p.name;
  const open=()=>show(uid);
  root.addEventListener('click',open);root.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  if(!cached&&!pendingRoom.has(uid)&&hasBackend()){
   pendingRoom.add(uid);
   getProfiles([uid]).then(()=>{pendingRoom.delete(uid);R.watchRoomMembers?.();}).catch(()=>pendingRoom.delete(uid));
  }
 };
}

createDialog();
document.addEventListener('click',e=>{
 const b=e.target.closest?.('#acctBtn');
 if(!b||!ready())return;
 e.stopImmediatePropagation();e.preventDefault();
 show(ses.id);
},true);
window.addEventListener('popstate',()=>{
 const id=new URL(location.href).searchParams.get('user');
 if(validId(id))show(id);
});
{const q=new URL(location.href).searchParams,rv=Number(q.get('review')),fv=Number(q.get('film'));
 if(Number.isSafeInteger(rv)&&rv>0&&Number.isSafeInteger(fv)&&fv>0)pendingFocus={id:rv,film:fv};}
const initial=new URL(location.href).searchParams.get('user');
if(validId(initial))show(initial);
window.addEventListener('film-account-state',()=>setTimeout(repaintAllHearts,150));window.addEventListener('focus',()=>{repaintAllHearts();});
setInterval(()=>{if(!document.hidden)repaintAllHearts();},4000);
window.filmFriends={goToReview,open:show,openProfile,openFeed,publishMyProfile,getProfiles,get,validId,avatar,refresh:refreshReviews,saveMyReview,likeBar,fetchLikes};
})();
