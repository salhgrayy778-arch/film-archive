/* Film friends: public profiles, follows and review feed. Supabase RLS policies are required. */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const $=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady&&!cloudLoading;
const validId=id=>/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(String(id||''));
const notice=(s)=>{const n=$('filmFriendsMessage');if(n)n.textContent=s;};
let active='feed',selected=null,busy=false;
async function request(path,options={}){
 if(!ready()){if(typeof openAuth==='function'&&!ses)openAuth('login');throw Error(T('ابتدا وارد حساب شو','Sign in first'));}
 if(!await freshToken())throw Error(T('ورود به حساب منقضی شده است','Session expired'));
 return restCall(path,options);
}
async function json(path){return (await request(path,{cache:'no-store'})).json();}
async function publicProfile(id){
 const path='/film_public_profiles?select=user_id,display_name,bio,avatar,favorites&user_id=eq.'+encodeURIComponent(id)+'&limit=1';
 if(ready())return (await json(path))[0]||null;
 const response=await fetch((sb.url.endsWith('/')?sb.url.slice(0,-1):sb.url)+'/rest/v1'+path,
  {headers:{apikey:sb.key},cache:'no-store'});
 if(!response.ok)throw Error('Public profile HTTP '+response.status);
 return (await response.json())[0]||null;
}
const avatar=(profile,size=46)=>{
 const a=make('span','filmFriendsAvatar');a.style.width=size+'px';a.style.height=size+'px';
 if(/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(profile?.avatar||'')&&profile.avatar.length<170000){
  const img=make('img');img.src=profile.avatar;img.alt='';a.appendChild(img);
 }else a.textContent=(profile?.display_name||'🎬').charAt(0).toUpperCase();
 return a;
};
const userLink=(id,profile)=>{
 const button=make('button','filmFriendsUser',profile?.display_name||T('فیلم‌باز','Movie fan'));
 button.type='button';button.onclick=()=>openProfile(id);return button;
};
const filmLink=(filmId,title)=>{
 const link=make('a','filmFriendsFilm',title||T('صفحه فیلم','Film page'));
 link.href='?film='+encodeURIComponent(filmId);
 return link;
};
function empty(parent,body){parent.appendChild(make('p','filmFriendsEmpty',body));}
function loginGate(){const body=$('filmFriendsBody');body.replaceChildren();empty(body,T('برای دیدن دوستای فیلمباز، وارد حسابت شو.','Sign in to see film friends.'));const b=make('button','btn primary',T('ورود / ثبت‌نام','Sign in / sign up'));b.onclick=()=>openAuth('login');body.appendChild(b);}
function show(){const root=$('filmFriendsDialog');if(!root.open)root.showModal();if(active==='profile'&&selected){openProfile(selected);return;}if(!ready()){loginGate();return;}openFeed();}
function status(error){console.warn('Film friends',error);notice(T('اطلاعات اجتماعی دریافت نشد. ابتدا فایل SQL بخش اجتماعی را در Supabase اجرا کن، سپس دوباره تلاش کن.','Social data unavailable. Apply the social SQL migration in Supabase and try again.'));}
function createUI(){
 const style=make('style');style.textContent=`
 #filmFriendsLaunch{position:fixed;bottom:20px;left:20px;z-index:38;border:1px solid var(--gold,#dbb97b);border-radius:40px;padding:12px 18px;background:var(--panel,#15242d);color:var(--ink,#fff);font:inherit;cursor:pointer;box-shadow:0 8px 28px #0005}
 #filmFriendsDialog{width:min(800px,94vw);max-height:88vh;border:1px solid var(--line,#59606b);border-radius:20px;background:var(--panel,#172630);color:var(--ink,#fff);padding:22px;overflow:auto}
 #filmFriendsDialog::backdrop{background:#000b}
 .filmFriendsHeader,.filmFriendsActions,.filmFriendsRow{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}
 .filmFriendsHeader{margin-bottom:18px}.filmFriendsHeader h2{font-size:22px;margin:0}
 .filmFriendsBody{display:grid;gap:14px}.filmFriendsCard{padding:16px;border:1px solid var(--line,#485560);border-radius:14px;background:var(--bg,#102027)}
 .filmFriendsAvatar{display:grid;place-items:center;flex:none;border-radius:50%;overflow:hidden;background:#364b55;font-weight:700}
 .filmFriendsAvatar img{width:100%;height:100%;object-fit:cover}
 .filmFriendsUser,.filmFriendsFilm{background:transparent;border:0;color:var(--accent2,#e4c184);font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
 .filmFriendsEmpty{opacity:.8}.filmFriendsCard p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85}
 .filmFriendsTop{display:flex;gap:14px;align-items:center}.filmFriendsTop h3{margin:0}.filmFriendsTop small{opacity:.75}
 .filmFriendsFavorites{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:12px;margin-top:14px}
 .filmFriendsFavorite{text-decoration:none;color:inherit;border-radius:10px;border:1px solid var(--line,#556);overflow:hidden;display:grid;align-content:start}
 .filmFriendsFavorite img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover}
 .filmFriendsFavorite span{padding:8px;font-size:12px}.filmFriendsStats{margin:14px 0}
 .filmFriendsCompose{display:grid;gap:10px}.filmFriendsCompose textarea,.filmFriendsCompose input,.filmFriendsCompose select{min-height:44px;padding:9px;border-radius:9px;font:inherit;width:100%;box-sizing:border-box}
 .filmFriendsCompose textarea{min-height:90px}
 #filmFriendsMessage{min-height:18px;margin:8px 0}
 `;document.head.appendChild(style);
 const launch=make('button','',T('🎬 دوستای فیلمباز','🎬 Film friends'));launch.id='filmFriendsLaunch';launch.type='button';launch.onclick=show;document.body.appendChild(launch);
 const d=make('dialog');d.id='filmFriendsDialog';d.setAttribute('aria-label',T('دوستای فیلمباز','Film friends'));
 const header=make('div','filmFriendsHeader');header.appendChild(make('h2','',T('دوستای فیلمباز','Film friends')));
 const controls=make('div','filmFriendsActions');
 const mine=make('button','btn',T('پروفایل من','My public profile'));mine.onclick=()=>{if(ready())openProfile(ses.id);else loginGate();};
 const feed=make('button','btn',T('نظرهای دوستان','Friends reviews'));feed.onclick=openFeed;
 const close=make('button','btn','✕');close.setAttribute('aria-label',T('بستن','Close'));close.onclick=()=>d.close();
 controls.append(feed,mine,close);header.appendChild(controls);d.appendChild(header);
 const msg=make('p');msg.id='filmFriendsMessage';msg.setAttribute('role','status');d.appendChild(msg);
 const body=make('div','filmFriendsBody');body.id='filmFriendsBody';d.appendChild(body);document.body.appendChild(d);
 d.addEventListener('click',e=>{if(e.target===d)d.close();});
}
async function publishMyProfile(){
 if(!ready())return false;
 const p=normalizeAccountProfile(accountProfile);
 const payload={user_id:ses.id,display_name:p.name||ses.email?.split('@')[0]||T('فیلم‌باز','Movie fan'),bio:p.bio||'',avatar:p.avatar||'',
 favorites:p.favorites.map(x=>{
   if(!String(x.id||'').startsWith('archive:'))return {id:x.id,title:x.title,poster:x.poster,year:x.year};
   const entry=state.films.find(f=>'archive:'+f.id===x.id);
   const tmdbId=Number(entry?.tmdb);
   return {id:Number.isSafeInteger(tmdbId)&&tmdbId>0?'tmdb:'+tmdbId:x.id,
    title:x.title,poster:x.poster,year:x.year};
  })};
 await request('/film_public_profiles?on_conflict=user_id',{method:'POST',
 headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
 return true;
}
async function profilesByIds(ids){
 const unique=[...new Set(ids.filter(validId))];if(!unique.length)return new Map();
 const rows=await json('/film_public_profiles?select=user_id,display_name,bio,avatar,favorites&user_id=in.('+unique.join(',')+')&limit=250');
 return new Map(rows.map(p=>[p.user_id,p]));
}
async function openFeed(){
 active='feed';selected=null;if(!ready()){loginGate();return;}
 const body=$('filmFriendsBody');body.replaceChildren();notice(T('در حال دریافت نظرهای دوستان…','Loading friends’ reviews…'));
 try{
  const following=await json('/film_follows?select=followed_id&follower_id=eq.'+encodeURIComponent(ses.id)+'&limit=250');
  if(!following.length){notice('');empty(body,T('هنوز کسی را دنبال نکرده‌ای. از بخش جستجوی کاربران شروع کن.','You are not following anyone yet. Search for people to follow.'));}
  else{
   const ids=following.map(f=>f.followed_id).filter(validId).slice(0,250);
   const [reviews,profiles]=await Promise.all([
    json('/film_public_reviews?select=id,user_id,film_id,film_title,rating,review,created_at&user_id=in.('+ids.join(',')+')&order=created_at.desc&limit=100'),
    profilesByIds(ids)
   ]);
   notice('');if(!reviews.length)empty(body,T('هنوز نظری از دوستانت منتشر نشده است.','Your friends have not posted reviews yet.'));
   for(const r of reviews){
    const card=make('article','filmFriendsCard');
    const by=make('div','filmFriendsTop');const profile=profiles.get(r.user_id);
    by.append(avatar(profile),userLink(r.user_id,profile));card.appendChild(by);
    const title=make('p');title.append(filmLink(r.film_id,r.film_title));
    if(r.rating)title.append(' · ★ '+r.rating+'/10');
    card.append(title,make('p','',r.review),make('small','',new Date(r.created_at).toLocaleDateString()));
    body.appendChild(card);
   }
  }
  const search=make('div','filmFriendsCard filmFriendsCompose');
  const heading=make('strong','',T('پیدا کردن فیلم‌بازها','Find film fans'));
  const field=make('input');field.type='search';field.maxLength=60;field.placeholder=T('نام نمایشی کاربر را وارد کن','Search display name');field.setAttribute('aria-label',heading.textContent);
  const results=make('div');const button=make('button','btn',T('جستجو','Search'));
  button.onclick=async()=>{
   results.replaceChildren();const q=field.value.trim();
   if(q.length<2){empty(results,T('حداقل دو حرف وارد کن','Enter at least two letters'));return;}
   try{
    const safe=q.replace(/[,%()]/g,' ').trim();
    const rows=await json('/film_public_profiles?select=user_id,display_name,avatar&display_name=ilike.'+encodeURIComponent('*'+safe+'*')+'&limit=30');
    if(!rows.length)empty(results,T('کاربری پیدا نشد','No users found'));
    for(const p of rows){const row=make('div','filmFriendsRow');row.append(avatar(p),userLink(p.user_id,p));results.appendChild(row);}
   }catch(e){status(e);}
  };
  field.addEventListener('keydown',e=>{if(e.key==='Enter')button.click();});
  search.append(heading,field,button,results);body.appendChild(search);
 }catch(e){status(e);empty(body,T('دریافت نظرات ممکن نشد.','Unable to load reviews.'));}
}
async function openProfile(id){
 if(!validId(id))return;
 active='profile';selected=id;
 const body=$('filmFriendsBody');body.replaceChildren();notice(T('در حال دریافت پروفایل…','Loading profile…'));
 try{
  const mine=ready()&&id===ses.id;
  if(mine)await publishMyProfile();
  const [profile,followers,following,followed]=await Promise.all([
   publicProfile(id),
   ready()?json('/film_follows?select=follower_id&followed_id=eq.'+encodeURIComponent(id)+'&limit=1000'):Promise.resolve([]),
   ready()?json('/film_follows?select=followed_id&follower_id=eq.'+encodeURIComponent(id)+'&limit=1000'):Promise.resolve([]),
   mine||!ready()?Promise.resolve([]):json('/film_follows?select=followed_id&followed_id=eq.'+encodeURIComponent(id)+'&follower_id=eq.'+encodeURIComponent(ses.id))
  ]);
  if(selected!==id)return;
  notice('');if(!profile){empty(body,T('این کاربر هنوز پروفایل عمومی ندارد.','No public profile for this user yet.'));return;}
  const card=make('section','filmFriendsCard');
  const top=make('div','filmFriendsTop');top.append(avatar(profile,80));
  const text=make('div');text.append(make('h3','',profile.display_name),make('p','',profile.bio||T('بدون بیو','No bio')));
  top.appendChild(text);card.appendChild(top);
  if(ready())card.append(make('p','filmFriendsStats',followers.length+' '+T('دنبال‌کننده','followers')+' · '+following.length+' '+T('دنبال‌شونده','following')));
  if(!mine){
   const followingNow=followed.length>0;
   const btn=make('button','btn primary',!ready()?T('ورود برای دنبال‌کردن','Sign in to follow'):followingNow?T('لغو دنبال‌کردن','Unfollow'):T('دنبال‌کردن','Follow'));
   btn.onclick=async()=>{
    if(!ready()){openAuth('login');return;}
    btn.disabled=true;try{
     const path='/film_follows'+(followingNow?'?follower_id=eq.'+encodeURIComponent(ses.id)+'&followed_id=eq.'+encodeURIComponent(id):'');
     await request(path,followingNow?{method:'DELETE'}:{method:'POST',body:JSON.stringify({follower_id:ses.id,followed_id:id})});
     await openProfile(id);
    }catch(e){status(e);btn.disabled=false;}
   };card.appendChild(btn);
  }
  const share=make('button','btn',T('کپی لینک پروفایل','Copy profile link'));
  share.onclick=async()=>{
    const url=new URL(location.href);url.searchParams.delete('film');url.searchParams.set('user',id);url.hash='';
    try{await navigator.clipboard.writeText(url.href);notice(T('لینک کپی شد','Link copied'));}
    catch(error){window.prompt(T('لینک پروفایل','Profile link'),url.href);}
  };
  card.appendChild(share);
  card.appendChild(make('h3','',T('۱۰ فیلم برتر','Top 10 films')));
  const favorites=make('div','filmFriendsFavorites');
  for(const m of Array.isArray(profile.favorites)?profile.favorites.slice(0,10):[]){
   const raw=String(m.id||'');const filmId=/^tmdb:\d+$/.test(raw)?raw.split(':')[1]:null;
   const item=filmId?filmLink(filmId,''):make('div','filmFriendsFavorite');
   item.className='filmFriendsFavorite';
   const poster=String(m.poster||'');
   if(/^https:\/\//.test(poster)||/^assets\/(catalog|posters)\/[a-z0-9_.-]+\.webp$/i.test(poster)){
    const im=make('img');im.loading='lazy';im.alt=String(m.title||'');im.src=poster;im.onerror=()=>im.remove();item.appendChild(im);
   }
   item.appendChild(make('span','',(m.title||T('بدون عنوان','Untitled'))+(filmId?'':' · '+T('بدون صفحه TMDB','No TMDB page'))));favorites.appendChild(item);
  }
  if(!favorites.children.length)empty(favorites,T('هنوز فیلم برتری ثبت نشده است.','No favorite films yet.'));
  card.appendChild(favorites);body.appendChild(card);
  if(mine){
   const edit=make('button','btn',T('ویرایش پروفایل','Edit profile'));
   edit.onclick=()=>{ $('filmFriendsDialog').close();window.filmAccountProfile?.open();};
   card.appendChild(edit);
  }
 }catch(e){status(e);}
}
function addComposer(){
 const detail=$('filmDetailView');if(!detail)return;
 const form=make('form','filmFriendsCard filmFriendsCompose');form.id='filmReviewComposer';
 form.appendChild(make('h3','',T('نظر من درباره فیلم','My film review')));
 const rating=make('select');rating.setAttribute('aria-label',T('امتیاز فیلم','Movie rating'));
 rating.appendChild(new Option(T('بدون امتیاز','No rating'),''));for(let i=10;i>=1;i--)rating.appendChild(new Option(i+'/10',String(i)));
 const review=make('textarea');review.maxLength=1500;review.required=true;review.placeholder=T('نظرت را درباره فیلم بنویس…','Write your review…');review.setAttribute('aria-label',T('متن نظر','Review text'));
 const submit=make('button','btn primary',T('انتشار نظر','Publish review'));submit.type='submit';
 const hint=make('p','',T('نظر منتشرشده برای کاربران سایت و دنبال‌کنندگان تو قابل مشاهده است.','Published reviews are visible to signed-in members and followers.'));
 form.append(rating,review,submit,hint);
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;if(!ready()){openAuth('login');return;}
  const movie=window.filmDiscovery?.getCurrentMovie();if(!movie?.id)return;
  busy=true;submit.disabled=true;
  try{
   await request('/film_public_reviews',{method:'POST',body:JSON.stringify({user_id:ses.id,film_id:movie.id,film_title:String(movie.title||movie.original_title).slice(0,180),rating:rating.value?Number(rating.value):null,review:review.value.trim()})});
   review.value='';rating.value='';toast(T('نظر منتشر شد ✓','Review published ✓'));
  }catch(error){status(error);toast(T('انتشار نظر ناموفق بود','Could not publish review'));}
  finally{busy=false;submit.disabled=false;}
 };
 detail.appendChild(form);
}
createUI();addComposer();
window.addEventListener('film-account-profile-updated',()=>{
 if(ready())publishMyProfile().catch(e=>console.warn('Public profile sync',e));
 else setTimeout(()=>{if(ready())publishMyProfile().catch(e=>console.warn('Public profile sync',e));},1000);
});
window.addEventListener('popstate',()=>{
 const id=new URL(location.href).searchParams.get('user');
 if(validId(id)){if(!$('filmFriendsDialog').open)$('filmFriendsDialog').showModal();openProfile(id);}
});
const id=new URL(location.href).searchParams.get('user');
if(validId(id)){if(!$('filmFriendsDialog').open)$('filmFriendsDialog').showModal();openProfile(id);}
window.filmFriends={open:show,openProfile,openFeed,publishMyProfile};
})();