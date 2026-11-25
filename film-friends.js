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
function filmButton(id,title){
 const a=make('a','fsFilm',title||T('صفحه فیلم','Film page'));a.href='?film='+encodeURIComponent(id);
 a.onclick=e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();openFilmPage(id);};
 return a;
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
  info.appendChild(filmId?filmButton(filmId,last.title):make('b','',last.title||''));
  if(last.year)info.appendChild(make('small','fsDate',last.year));
  if(last.rating)info.appendChild(score(last.rating));
  row.append(cover,info);sec1.appendChild(row);
 }else sec1.appendChild(make('p','fsEmpty',profile?.watched===undefined?T('این بخش هنوز فعال نشده است.','Not available yet.'):T('هنوز فیلمی ثبت نکرده.','Nothing logged yet.')));
 const sec2=make('div','fsMini');sec2.appendChild(make('small','fsMiniLabel',T('آخرین نظر و امتیاز','Latest review & score')));
 if(lastReview){
  const l=make('p','fsFilmLine');l.append(filmButton(lastReview.film_id,lastReview.film_title));if(lastReview.rating)l.append(' ',score(lastReview.rating));
  l.appendChild(make('small','fsDate',relTime(lastReview.created_at)));sec2.appendChild(l);
  if(lastReview.review){const t=lastReview.review;sec2.appendChild(make('p','fsSnippet',t.length>170?t.slice(0,170)+'…':t));}
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
   get('/film_public_reviews?select=id,film_id,film_title,rating,review,created_at&user_id=eq.'+id+'&order=created_at.desc&limit=40').catch(()=>[]),
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
     else renderPoster(panel,watched,T('این کاربر فیلم دیده‌شده‌ای را عمومی نکرده است.','No public watched films.'),false);}],
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
function renderPoster(panel,items,emptyText,ranked){
 panel.replaceChildren();
 const grid=make('div','fsPosters');
 items.forEach((m,i)=>{
  const raw=String(m.id||'');const filmId=/^tmdb:\d+$/.test(raw)?raw.split(':')[1]:'';
  const tile=filmId?filmButton(filmId,''):make('div','fsFilm');tile.className='fsPosterTile';tile.textContent='';
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
  const line=make('p','fsFilmLine');line.append(filmButton(r.film_id,r.film_title));if(r.rating)line.append(' ',score(r.rating));
  line.appendChild(make('small','fsDate',relTime(r.created_at)));card.appendChild(line);
  if(r.review)card.appendChild(make('p','fsText',r.review));panel.appendChild(card);
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
function reviewCard(r,pm,role,opts){
 const card=make('article','fsCard fsReview'+(role==='critic'?' fsCritic':''));
 const top=make('div','fsRow');
 top.append(avatar(pm.get(r.user_id),opts?.big?48:38),nameButton(r.user_id,pm.get(r.user_id),role));
 const grow=make('span','fsGrow');top.appendChild(grow);
 if(r.rating)top.appendChild(score(r.rating,role==='critic'?'fsScoreBig':''));
 if(r.id&&((window.filmStaff?.isStaff?.())||(ready()&&r.user_id===ses.id)))top.appendChild(trashButton(r,card));
 card.appendChild(top);
 if(r.review)card.appendChild(make('p','fsText',r.review));
 card.appendChild(make('small','fsDate',relTime(r.updated_at||r.created_at)));
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
 const id=Number(movie.id),serial=++reviewSerial;
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
 const critics=reviews.filter(isCritic),members=reviews.filter(r=>!isCritic(r));
 const following=ready()?await myFollowing():new Set();
 const mineReview=ready()?reviews.find(r=>r.user_id===ses.id):null;
 const friendReviews=reviews.filter(r=>following.has(r.user_id)&&r.user_id!==(ready()?ses.id:''));
 const firstPage=members.slice(0,10);
 const needProfiles=[...critics,...friendReviews,...firstPage].map(r=>r.user_id).concat(ready()?[ses.id]:[]);
 await getProfiles(needProfiles);
 if(serial!==reviewSerial)return;
 bodyEl.replaceChildren();

 const sums=make('div','fsSums');
 sums.append(summaryBox(T('میانگین منتقدان','Critics’ average'),average(critics),'fsSumCritic'),
  summaryBox(T('میانگین کاربران','Members’ average'),average(members)));
 bodyEl.appendChild(sums);

 const sec=(title,cls)=>{const s=make('div','fsSection '+(cls||''));s.appendChild(make('h3','',title));bodyEl.appendChild(s);return s;};
 const cs=sec(T('نظر منتقدان','Critics’ reviews'),'fsCriticsSection');
 if(!critics.length)emptyNote(cs,T('هنوز منتقدی دربارهٔ این فیلم نظر نداده است.','No critic has reviewed this film yet.'));
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
 if(!members.length)emptyNote(us,T('هنوز نظری ثبت نشده؛ اولین نفر باش.','No member reviews yet — be the first.'));
 more.onclick=paint;us.appendChild(more);await paint();

 bodyEl.appendChild(composer(movie,mineReview));
}
function composer(movie,mineReview){
 const box=make('form','fsCard fsCompose');
 box.appendChild(make('h3','',mineReview?T('نظر من (قابل ویرایش)','My review (editable)'):T('نظر من','My review')));
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
 box.append(stars,text,actions,make('p','fsHint',T('نظر و امتیاز تو برای همهٔ بازدیدکنندگان سایت قابل مشاهده است و دنبال‌کننده‌هایت آن را در صفحهٔ فیلم می‌بینند.','Your rating and review are visible to everyone and show up for your followers on the film page.')));
 let busy=false;
 box.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  const review=text.value.trim();
  if(!rating&&!review){toast(T('امتیاز یا متن نظر را وارد کن','Add a rating or some text'));return;}
  busy=true;submit.disabled=true;
  const body={user_id:ses.id,film_id:movie.id,film_title:String(movie.title||movie.original_title||'').slice(0,180),rating:rating||null,review,updated_at:new Date().toISOString()};
  try{
   await publishMyProfile().catch(()=>{});
   if(mineReview)await write('/film_public_reviews?id=eq.'+mineReview.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
   else await write('/film_public_reviews',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
   toast(T('نظر ذخیره شد ✓','Review saved ✓'));renderReviews(movie);
  }catch(error){backendProblem(error);toast(T('ذخیره نظر ناموفق بود','Could not save the review'));busy=false;submit.disabled=false;}
 };
 return box;
}
window.addEventListener('film-detail-loaded',e=>{
 const m=e.detail?.movie;if(!m?.id)return;
 if(shown.get('id')===m.id&&reviewHost?.isConnected&&reviewHost.childElementCount>1)return;
 shown.set('id',m.id);renderReviews(m);
});
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
const initial=new URL(location.href).searchParams.get('user');
if(validId(initial))show(initial);
window.filmFriends={open:show,openProfile,openFeed,publishMyProfile,getProfiles,get,validId,avatar};
})();
