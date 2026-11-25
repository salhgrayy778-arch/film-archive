/* Staff panel (admin + moderator) and presence ping.
 * Needs security/film-admin-v3.sql. The panel is only a UI: every action is allowed or refused by the
 * database (row level security + admin-only functions), so hiding the button is not the protection.
 *  - Admin: overview numbers, who is online, all users, roles, all reviews, catalog corrections, audit log.
 *  - Moderator: reviews (delete), catalog corrections, roles list and audit log (read only). */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const $=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined&&value!==null)e.textContent=String(value);return e;};
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
// The signed-in token is usable as soon as the account is set up; the archive may still be loading (cloudLoading).
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady;
const num=n=>{const v=Number(n)||0;return typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(v):String(v);};
const ROLE_FA={critic:'منتقد',moderator:'مودریتور',admin:'ادمین'},ROLE_EN={critic:'Critic',moderator:'Moderator',admin:'Admin'};
const roleName=r=>T(ROLE_FA[r]||r,ROLE_EN[r]||r);
const online=iso=>iso&&Date.now()-new Date(iso).getTime()<3*60*1000;
function when(iso){
 if(!iso)return T('هرگز','Never');
 const d=new Date(iso);if(isNaN(d))return '—';
 try{return d.toLocaleString(typeof EN!=='undefined'&&EN?'en-GB':'fa-IR',{dateStyle:'medium',timeStyle:'short'});}catch(e){return d.toISOString().slice(0,16).replace('T',' ');}
}
function ago(iso){
 if(!iso)return T('هرگز','Never');
 const s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
 if(s<90)return T('همین الان','just now');
 if(s<3600)return T(num(Math.round(s/60))+' دقیقه پیش',Math.round(s/60)+' min ago');
 if(s<86400)return T(num(Math.round(s/3600))+' ساعت پیش',Math.round(s/3600)+' h ago');
 return T(num(Math.round(s/86400))+' روز پیش',Math.round(s/86400)+' d ago');
}

/* ---------- API (token + database-enforced permissions) ---------- */
async function api(path,opt){
 if(!ready()||!await freshToken())throw Error(T('ابتدا وارد حساب شو','Sign in first'));
 const r=await restCall(path,opt);
 const text=await r.text();
 try{return text?JSON.parse(text):null;}catch(e){return null;}
}
const rpc=(name,args)=>api('/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});
function explain(e){
 const m=String(e&&e.message||e);
 if(/42501|admin only|403/.test(m))return T('این کار برای نقش تو مجاز نیست.','Your role is not allowed to do this.');
 if(/last admin/.test(m))return T('آخرین ادمین را نمی‌شود حذف کرد.','The last admin cannot be removed.');
 if(/404|PGRST20|does not exist|42P01/.test(m))return T('هنوز فایل security/film-admin-v3.sql در Supabase اجرا نشده است.','security/film-admin-v3.sql has not been run in Supabase yet.');
 return T('انجام نشد: ','Failed: ')+m.slice(0,140);
}

/* ---------- who am I ---------- */
let myRoles=new Set(),rolesFor='',roleError='',roleTries=0,retryTimer=0;
const isAdmin=()=>myRoles.has('admin'),isStaff=()=>myRoles.has('admin')||myRoles.has('moderator');
async function loadMyRoles(){
 clearTimeout(retryTimer);
 if(!ready()){myRoles=new Set();rolesFor='';syncLaunch();return;}
 if(rolesFor===ses.id)return;
 try{
  const rows=await api('/film_roles?select=role&user_id=eq.'+ses.id);
  myRoles=new Set((rows||[]).map(r=>r.role));roleError='';rolesFor=ses.id;roleTries=0;
 }catch(e){
  // A failed lookup must never be remembered as "no role": retry a few times.
  myRoles=new Set();roleError=String(e.message||e).slice(0,160);
  if(roleTries++<4)retryTimer=setTimeout(()=>loadMyRoles(),2000*roleTries);
 }
 syncLaunch();
}
let lastStaffSig='';
function syncLaunch(){
 const sig=(typeof ses!=='undefined'&&ses?ses.id:'')+'|'+[...myRoles].sort().join(',');
 if(sig!==lastStaffSig){lastStaffSig=sig;setTimeout(()=>window.dispatchEvent(new CustomEvent('film-staff-state',{detail:{staff:isStaff(),admin:isAdmin()}})),0);}
 let b=$('adminLaunch');
 if(!isStaff()){if(b)b.remove();const d=$('adminDialog');if(d?.open)d.close();return;}
 if(b)return;
 b=make('button','apLaunch','🛡️ '+T('پنل مدیریت','Staff panel'));b.id='adminLaunch';b.type='button';
 b.onclick=()=>openPanel();document.body.appendChild(b);
}

/* ---------- presence ---------- */
let pingOff=false,pingTimer=0;
async function ping(){
 if(pingOff||!ready()||document.hidden)return;
 try{await rpc('film_ping',{p_path:(location.search||'/').slice(0,80)});}
 catch(e){if(/404|42883|PGRST202/.test(String(e.message)))pingOff=true;}
}
function startPing(){
 clearInterval(pingTimer);if(!ready())return;
 ping();pingTimer=setInterval(ping,90000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ping();});

/* ---------- name cache ---------- */
const names=new Map(); // uid -> {name,email,avatar}
async function fillNames(ids){
 const wanted=[...new Set(ids.filter(id=>UUID.test(String(id||''))&&!names.has(id)))];
 if(!wanted.length)return;
 try{
  const pm=await window.filmFriends?.getProfiles?.(wanted);
  for(const id of wanted){const p=pm?.get?.(id);if(p)names.set(id,{name:p.display_name,avatar:p.avatar});}
 }catch(e){}
}
const labelOf=id=>{const n=names.get(id);return n?.email&&!n.name?n.email:(n?.name||T('کاربر ','User ')+String(id).slice(0,6));};
function avatarEl(id,size){
 const n=names.get(id)||{};const box=make('span','fsAvatar');box.style.width=box.style.height=size+'px';box.style.fontSize=Math.round(size*.42)+'px';
 if(n.avatar&&/^(data:image\/|https:\/\/)/.test(n.avatar)){const img=document.createElement('img');img.src=n.avatar;img.alt='';box.appendChild(img);}
 else box.textContent=(labelOf(id)||'?').trim().charAt(0).toUpperCase();
 return box;
}
function userCell(id){
 const w=make('span','apUser');w.appendChild(avatarEl(id,30));
 const b=make('button','fsName',labelOf(id));b.type='button';b.onclick=()=>window.filmFriends?.openProfile?.(id);w.appendChild(b);return w;
}

/* ---------- shell ---------- */
let current='overview',timer=0,dialog,navBox,main,msgBox;
const SECTIONS=[
 {id:'overview',fa:'نمای کلی',en:'Overview',icon:'📊',admin:true},
 {id:'users',fa:'کاربران',en:'Users',icon:'👥',admin:true},
 {id:'reviews',fa:'نظرها',en:'Reviews',icon:'💬'},
 {id:'catalog',fa:'اصلاح آرشیو فیلم‌ها',en:'Film archive fixes',icon:'🎞️'},
 {id:'roles',fa:'نقش‌ها و سابقه',en:'Roles & history',icon:'🏷️'},
 {id:'audit',fa:'گزارش فعالیت',en:'Activity log',icon:'🧾'}
];
function build(){
 dialog=make('dialog','apDialog');dialog.id='adminDialog';dialog.setAttribute('aria-label',T('پنل مدیریت','Staff panel'));
 const head=make('header','apHead');
 const title=make('div','apTitle');title.append(make('h2','',T('پنل مدیریت','Staff panel')),make('span','apWho'));
 const close=make('button','btn',T('بستن','Close'));close.type='button';close.onclick=()=>dialog.close();
 const refresh=make('button','btn','↻ '+T('تازه‌سازی','Refresh'));refresh.type='button';refresh.onclick=()=>show(current);
 const acts=make('div','apHeadActions');acts.append(refresh,close);head.append(title,acts);
 navBox=make('nav','apNav');navBox.setAttribute('aria-label',T('بخش‌ها','Sections'));
 main=make('main','apMain');msgBox=make('p','apMsg');msgBox.setAttribute('role','status');
 const layout=make('div','apLayout');const content=make('div','apContent');content.append(msgBox,main);layout.append(navBox,content);
 dialog.append(head,layout);document.body.appendChild(dialog);
 dialog.addEventListener('close',()=>{clearInterval(timer);if(location.hash==='#admin')history.replaceState(null,'',location.pathname+location.search);});
}
const say=(t,bad)=>{msgBox.textContent=t||'';msgBox.classList.toggle('bad',Boolean(bad));};
function drawNav(){
 navBox.replaceChildren();
 for(const s of SECTIONS){
  if(s.admin&&!isAdmin())continue;
  const b=make('button','apNavBtn'+(s.id===current?' on':''),s.icon+' '+T(s.fa,s.en));b.type='button';
  b.onclick=()=>show(s.id);navBox.appendChild(b);
 }
 dialog.querySelector('.apWho').textContent=[...myRoles].map(roleName).join(' · ');
}
async function openPanel(section){
 await loadMyRoles();
 if(!isStaff())return;
 if(!dialog)build();
 if(!dialog.open)dialog.showModal();
 show(section||(isAdmin()?'overview':'reviews'));
}
function show(id){
 const meta=SECTIONS.find(s=>s.id===id);
 if(!meta||(meta.admin&&!isAdmin()))id=isAdmin()?'overview':'reviews';
 current=id;say('');drawNav();clearInterval(timer);
 main.replaceChildren(make('div','fsSkeleton'));
 const run={overview,users:usersView,reviews:reviewsView,catalog:catalogView,roles:rolesView,audit:auditView}[id];
 const serial=++renderSerial;
 Promise.resolve(run(serial)).catch(e=>{if(serial===renderSerial){main.replaceChildren();say(explain(e),true);}});
 if(id==='overview')timer=setInterval(()=>{if(dialog.open&&current==='overview')overview(++renderSerial,true).catch(()=>{});},30000);
}
let renderSerial=0;
const live=serial=>serial===renderSerial&&dialog.open;
function confirmButton(label,action,cls){
 const b=make('button',cls||'btn',label);b.type='button';let armed=false,t=0;
 b.onclick=async()=>{
  if(!armed){armed=true;b.textContent=T('مطمئنی؟ دوباره بزن','Sure? Click again');b.classList.add('apArmed');t=setTimeout(()=>{armed=false;b.textContent=label;b.classList.remove('apArmed');},4000);return;}
  clearTimeout(t);b.disabled=true;try{await action();}catch(e){say(explain(e),true);b.disabled=false;armed=false;b.textContent=label;b.classList.remove('apArmed');}
 };
 return b;
}
function badges(roles){
 const w=make('span','apBadges');
 for(const r of roles||[]){w.appendChild(make('span','fsRole fsRole-'+r,roleName(r)));}
 return w;
}
function table(headers,rows){
 const wrap=make('div','apTableWrap'),t=make('table','apTable'),thead=make('thead'),tr=make('tr');
 for(const h of headers)tr.appendChild(make('th','',h));thead.appendChild(tr);
 const body=make('tbody');for(const r of rows)body.appendChild(r);t.append(thead,body);wrap.appendChild(t);return wrap;
}
const cell=(content,cls)=>{const td=make('td',cls||'');if(content instanceof Node)td.appendChild(content);else td.textContent=content;return td;};
const empty=text=>make('p','apEmpty',text);

/* ---------- overview (admin) ---------- */
async function overview(serial,quiet){
 const [stats,users,audit,reviews]=await Promise.all([
  rpc('film_admin_stats'),
  rpc('film_admin_users',{p_search:'',p_limit:200,p_offset:0}),
  api('/film_audit?select=*&order=at.desc&limit=8'),
  api('/film_public_reviews?select=id,user_id,film_id,film_title,rating,review,created_at&order=created_at.desc&limit=6')]);
 if(!live(serial))return;
 for(const u of users||[])names.set(u.user_id,{name:u.display_name,email:u.email,avatar:names.get(u.user_id)?.avatar});
 await fillNames((users||[]).map(u=>u.user_id).concat((audit||[]).flatMap(a=>[a.actor,a.target_user]),(reviews||[]).map(r=>r.user_id)));
 if(!live(serial))return;
 const root=make('div','apStack');
 const cards=make('div','apCards');
 const items=[
  ['online_now',T('آنلاین الان','Online now'),'live'],['active_today',T('فعال در ۲۴ ساعت','Active in 24 h')],['active_7d',T('فعال در ۷ روز','Active in 7 days')],
  ['users',T('کل کاربران','All users')],['new_7d',T('ثبت‌نام ۷ روز اخیر','New in 7 days')],['never_signed_in',T('هرگز وارد نشده','Never signed in')],
  ['reviews',T('نظرها','Reviews')],['reviews_7d',T('نظر ۷ روز اخیر','Reviews in 7 days')],['follows',T('دنبال‌کردن‌ها','Follows')],
  ['critics',T('منتقدها','Critics')],['moderators',T('مودریتورها','Moderators')],['admins',T('ادمین‌ها','Admins')]];
 for(const [key,label,kind] of items){const c=make('div','apCard'+(kind?' '+kind:''));c.append(make('strong','',num(stats?.[key])),make('span','',label));cards.appendChild(c);}
 root.appendChild(cards);
 const now=(users||[]).filter(u=>online(u.last_seen));
 const box=make('section','apBox');box.appendChild(make('h3','',T('الان در سایت (۳ دقیقهٔ اخیر)','On the site now (last 3 minutes)')+' — '+num(now.length)));
 if(!now.length)box.appendChild(empty(T('کسی آنلاین نیست.','Nobody is online.')));
 else{const l=make('div','apChips');for(const u of now){const chip=make('span','apChip');chip.append(userCell(u.user_id),make('small','',u.last_path&&u.last_path!=='/'?u.last_path:''));l.appendChild(chip);}box.appendChild(l);}
 root.appendChild(box);
 const two=make('div','apTwo');
 const a=make('section','apBox');a.appendChild(make('h3','',T('آخرین نظرها','Latest reviews')));
 for(const r of reviews||[]){const row=make('div','apLine');row.append(userCell(r.user_id),make('span','apGrow',(r.film_title||'')+(r.rating?' · '+num(r.rating)+'/۱۰':'')),make('small','',ago(r.created_at)));a.appendChild(row);}
 if(!(reviews||[]).length)a.appendChild(empty(T('هنوز نظری ثبت نشده.','No reviews yet.')));
 const b=make('section','apBox');b.appendChild(make('h3','',T('آخرین رویدادهای مدیریتی','Latest staff events')));
 for(const e of audit||[])b.appendChild(auditLine(e));
 if(!(audit||[]).length)b.appendChild(empty(T('رویدادی ثبت نشده.','Nothing logged yet.')));
 two.append(a,b);root.appendChild(two);
 main.replaceChildren(root);if(!quiet)say('');
}

/* ---------- users (admin) ---------- */
let userQuery='',userPage=0;
async function usersView(serial){
 const root=make('div','apStack');
 const bar=make('div','apBar');const q=make('input');q.type='search';q.placeholder=T('جست‌وجو با نام یا ایمیل…','Search by name or e-mail…');q.value=userQuery;q.setAttribute('aria-label',q.placeholder);
 const list=make('div');bar.appendChild(q);root.append(bar,list);main.replaceChildren(root);
 let debounce=0;
 async function load(){
  list.replaceChildren(make('div','fsSkeleton'));
  const rows=await rpc('film_admin_users',{p_search:userQuery,p_limit:30,p_offset:userPage*30});
  if(!live(serial))return;
  for(const u of rows||[])names.set(u.user_id,{name:u.display_name,email:u.email,avatar:names.get(u.user_id)?.avatar});
  await fillNames((rows||[]).map(u=>u.user_id));
  const trs=[];
  for(const u of rows||[]){
   const tr=make('tr','apRowBtn');tr.tabIndex=0;
   const dot=make('span','apDot'+(online(u.last_seen)?' on':u.last_seen&&Date.now()-new Date(u.last_seen)<864e5?' day':''));
   dot.title=online(u.last_seen)?T('آنلاین','Online'):T('آفلاین','Offline');
   const who=make('div','apUser');who.append(dot,avatarEl(u.user_id,30),make('span','',u.display_name||(u.email||'').split('@')[0]));
   tr.append(cell(who),cell(u.email||'','apLtr'),cell(badges(u.roles)),cell(online(u.last_seen)?T('آنلاین','Online'):ago(u.last_seen)),cell(when(u.last_sign_in_at)),cell(when(u.created_at)),cell(num(u.visits)),cell(num(u.review_count)),cell(u.email_confirmed?'✓':T('تأیید نشده','Unconfirmed')));
   tr.onclick=()=>drawer(u,tr,serial);tr.onkeydown=e=>{if(e.key==='Enter')drawer(u,tr,serial);};
   trs.push(tr);
  }
  const total=Number(rows?.[0]?.total||0);
  const wrap=make('div');
  wrap.appendChild(make('p','apHint',T('کل: ','Total: ')+num(total)+T(' کاربر — روی هر ردیف بزن تا نقش‌ها و جزئیات باز شود.',' users — click a row for roles and details.')));
  wrap.appendChild(trs.length?table([T('کاربر','User'),T('ایمیل','E-mail'),T('نقش','Roles'),T('آخرین حضور','Last seen'),T('آخرین ورود','Last sign-in'),T('عضویت','Joined'),T('بازدید','Visits'),T('نظر','Reviews'),T('ایمیل','Verified')],trs):empty(T('کاربری پیدا نشد.','No users found.')));
  const nav=make('div','apPager');
  const prev=make('button','btn',T('قبلی','Previous'));prev.disabled=userPage===0;prev.onclick=()=>{userPage--;load().catch(e=>say(explain(e),true));};
  const next=make('button','btn',T('بعدی','Next'));next.disabled=(userPage+1)*30>=total;next.onclick=()=>{userPage++;load().catch(e=>say(explain(e),true));};
  nav.append(prev,make('span','',num(userPage+1)),next);wrap.appendChild(nav);
  list.replaceChildren(wrap);
 }
 q.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{userQuery=q.value.trim();userPage=0;load().catch(e=>say(explain(e),true));},350);};
 await load();
}
async function drawer(u,tr,serial){
 const old=tr.nextElementSibling;
 if(old&&old.classList.contains('apDrawerRow')){old.remove();return;}
 const row=make('tr','apDrawerRow'),td=make('td');td.colSpan=9;
 const box=make('div','apDrawer');
 const head=make('div','apLine');head.append(avatarEl(u.user_id,44),make('div','apGrow',''));
 head.lastChild.append(make('strong','',u.display_name||u.email),make('div','apLtr',u.email||''));
 const open=make('button','btn',T('نمایش پروفایل','View profile'));open.type='button';open.onclick=()=>window.filmFriends?.openProfile?.(u.user_id);
 const rev=make('button','btn',T('نظرهای این کاربر','This user’s reviews'));rev.type='button';rev.onclick=()=>{reviewFilter={user:u.user_id,film:'',q:''};show('reviews');};
 head.append(open,rev);box.appendChild(head);
 box.appendChild(make('h4','',T('نقش‌ها','Roles')));
 const rr=make('div','apRoles');
 const mine=new Set(u.roles||[]);
 for(const role of ['critic','moderator','admin']){
  const has=mine.has(role);
  const label=(has?T('گرفتن نقش ','Remove ')+roleName(role):T('دادن نقش ','Grant ')+roleName(role));
  rr.appendChild(confirmButton(label,async()=>{
   await rpc('film_set_role',{p_user:u.user_id,p_role:role,p_on:!has});
   say(T('ثبت شد و در گزارش فعالیت ذخیره شد.','Done and written to the activity log.'));
   if(live(serial))usersView(serial);
  },'btn'+(has?' apOn':'')));
 }
 box.appendChild(rr);
 box.appendChild(make('p','apHint',T('منتقد: نظرش با نشان و نمره در «نظر منتقدان» می‌آید. مودریتور: حذف نظرها و اصلاح آرشیو فیلم‌ها. ادمین: همهٔ این پنل.','Critic: shown in “Critics’ reviews”. Moderator: delete reviews, fix film archive. Admin: this whole panel.')));
 box.appendChild(make('h4','',T('سابقهٔ نقش‌های این کاربر','This user’s role history')));
 const hist=make('div');box.appendChild(hist);
 td.appendChild(box);row.appendChild(td);tr.after(row);
 try{
  const rows=await api('/film_audit?select=*&target_user=eq.'+u.user_id+'&action=in.(role_granted,role_revoked)&order=at.desc&limit=20');
  await fillNames((rows||[]).map(r=>r.actor));
  if(!rows?.length)hist.appendChild(empty(T('هنوز نقشی نداشته.','No role changes yet.')));
  for(const e of rows||[])hist.appendChild(auditLine(e,true));
 }catch(e){hist.appendChild(empty(explain(e)));}
}

/* ---------- reviews (staff) ---------- */
let reviewFilter={user:'',film:'',q:''},reviewPage=0;
async function reviewsView(serial){
 const root=make('div','apStack'),bar=make('div','apBar');
 const q=make('input');q.type='search';q.placeholder=T('جست‌وجو در متن نظر…','Search review text…');q.value=reviewFilter.q;
 const film=make('input');film.type='number';film.min='1';film.placeholder=T('شناسهٔ فیلم','Film id');film.value=reviewFilter.film;film.className='apNarrow';
 const user=make('input');user.placeholder=T('شناسهٔ کاربر (UUID)','User id (UUID)');user.value=reviewFilter.user;user.className='apLtr';
 const go=make('button','btn primary',T('فیلتر','Filter'));go.type='button';
 const clear=make('button','btn',T('پاک کردن','Clear'));clear.type='button';
 bar.append(q,film,user,go,clear);
 const list=make('div');root.append(bar,list);main.replaceChildren(root);
 async function load(){
  list.replaceChildren(make('div','fsSkeleton'));
  const f=['select=id,user_id,film_id,film_title,rating,review,created_at','order=created_at.desc','limit=25','offset='+reviewPage*25];
  if(/^\d+$/.test(reviewFilter.film))f.push('film_id=eq.'+reviewFilter.film);
  if(UUID.test(reviewFilter.user))f.push('user_id=eq.'+reviewFilter.user);
  if(reviewFilter.q)f.push('review=ilike.*'+encodeURIComponent(reviewFilter.q.replace(/[*%,()]/g,' '))+'*');
  const rows=await api('/film_public_reviews?'+f.join('&'));
  if(!live(serial))return;
  await fillNames((rows||[]).map(r=>r.user_id));
  let rolesMap=new Map();
  try{const rs=await api('/film_roles?select=user_id,role&user_id=in.('+[...new Set((rows||[]).map(r=>r.user_id))].join(',')+')');for(const r of rs||[]){if(!rolesMap.has(r.user_id))rolesMap.set(r.user_id,[]);rolesMap.get(r.user_id).push(r.role);}}catch(e){}
  const wrap=make('div','apReviews');
  for(const r of rows||[]){
   const card=make('article','fsCard apReview');
   const top=make('div','apLine');top.append(userCell(r.user_id),badges(rolesMap.get(r.user_id)));
   const fb=make('button','fsFilm',r.film_title||('#'+r.film_id));fb.type='button';fb.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(Number(r.film_id));};
   top.append(fb,make('span','apGrow'),make('small','',r.rating?num(r.rating)+'/۱۰ · ':''),make('small','',when(r.created_at)));
   card.appendChild(top);
   card.appendChild(r.review?make('p','apText',r.review):make('p','apHint',T('(فقط نمره، بدون متن)','(rating only)')));
   const acts=make('div','apLine');
   acts.appendChild(confirmButton(T('حذف نظر','Delete review'),async()=>{
    const gone=await api('/film_public_reviews?id=eq.'+Number(r.id),{method:'DELETE',headers:{Prefer:'return=representation'}});
    if(!gone?.length)throw Error('403');
    say(T('نظر حذف شد و در گزارش ثبت شد.','Review deleted and logged.'));card.remove();
   },'btn danger'));
   card.appendChild(acts);wrap.appendChild(card);
  }
  if(!(rows||[]).length)wrap.appendChild(empty(T('نظری با این فیلتر نیست.','No reviews match.')));
  const nav=make('div','apPager');
  const prev=make('button','btn',T('قبلی','Previous'));prev.disabled=reviewPage===0;prev.onclick=()=>{reviewPage--;load().catch(e=>say(explain(e),true));};
  const next=make('button','btn',T('بعدی','Next'));next.disabled=(rows||[]).length<25;next.onclick=()=>{reviewPage++;load().catch(e=>say(explain(e),true));};
  nav.append(prev,make('span','',num(reviewPage+1)),next);
  list.replaceChildren(wrap,nav);
 }
 go.onclick=()=>{reviewFilter={q:q.value.trim(),film:film.value.trim(),user:user.value.trim()};reviewPage=0;load().catch(e=>say(explain(e),true));};
 clear.onclick=()=>{reviewFilter={user:'',film:'',q:''};reviewPage=0;show('reviews');};
 q.onkeydown=film.onkeydown=user.onkeydown=e=>{if(e.key==='Enter')go.onclick();};
 await load();
}

/* ---------- film archive fixes (staff) ---------- */
const FIELDS=[
 ['fa_title','عنوان فارسی','Persian title'],['title','عنوان','Title'],['original_title','عنوان اصلی','Original title'],
 ['director','کارگردان','Director'],['cast','بازیگران','Cast'],['country','کشور','Country'],['runtime','مدت (دقیقه)','Runtime (min)'],
 ['release_date','تاریخ انتشار (YYYY یا YYYY-MM-DD)','Release date (YYYY or YYYY-MM-DD)'],['poster_path','مسیر پوستر TMDB (مثل /abc123.jpg)','TMDB poster path (like /abc123.jpg)'],['overview','خلاصهٔ داستان','Overview']];
async function catalogView(serial){
 const root=make('div','apStack');
 root.appendChild(make('p','apHint',T('اینجا اطلاعات فیلم‌های آرشیو سایت را برای همهٔ کاربران اصلاح کن (عنوان، کارگردان، پوستر…). فایل اصلی TMDB دست‌نخورده می‌ماند و اصلاحات روی آن اعمال می‌شود؛ هر اصلاح قابل بازگرداندن است و در گزارش ثبت می‌شود.','Correct film info for every visitor (title, director, poster…). The cached TMDB file stays untouched; corrections are applied on top, can be reset, and are logged.')));
 const bar=make('div','apBar');const q=make('input');q.type='search';q.placeholder=T('نام فیلم را جست‌وجو کن…','Search a film…');q.setAttribute('aria-label',q.placeholder);bar.appendChild(q);
 const results=make('div','apResults'),editor=make('div'),listBox=make('section','apBox');
 root.append(bar,results,editor,listBox);main.replaceChildren(root);
 async function recent(){
  listBox.replaceChildren(make('h3','',T('اصلاحات ثبت‌شده','Existing corrections')));
  try{
   const rows=await api('/film_catalog_overrides?select=film_id,patch,hidden,updated_by,updated_at&order=updated_at.desc&limit=30');
   await fillNames((rows||[]).map(r=>r.updated_by));
   if(!rows?.length)listBox.appendChild(empty(T('هنوز اصلاحی ثبت نشده.','No corrections yet.')));
   for(const r of rows||[]){
    const line=make('div','apLine');
    const t=make('button','fsFilm','#'+r.film_id+' '+(r.patch?.fa_title||r.patch?.title||''));t.type='button';
    t.onclick=async()=>{const m=await window.filmDiscovery.findAnyMovie(r.film_id);if(m)edit(m);};
    line.append(t,make('small','',(r.hidden?T('مخفی · ','Hidden · '):'')+Object.keys(r.patch||{}).join(', ')),make('span','apGrow'),make('small','',labelOf(r.updated_by)+' · '+ago(r.updated_at)));
    listBox.appendChild(line);
   }
  }catch(e){listBox.appendChild(empty(explain(e)));}
 }
 function edit(movie){
  const id=Number(movie.id),ov=window.filmDiscovery.overrideFor(id);
  const card=make('section','apBox');card.appendChild(make('h3','',T('ویرایش: ','Editing: ')+(movie.fa_title||movie.title||id)+' (#'+id+')'));
  const form=make('form','apForm');const inputs={};
  for(const [key,fa_,en_] of FIELDS){
   const lab=make('label','apField');lab.appendChild(make('span','',T(fa_,en_)));
   const el=key==='overview'||key==='cast'?make('textarea'):make('input');if(el.tagName==='TEXTAREA')el.rows=key==='overview'?4:2;
   el.value=movie[key]==null?'':String(movie[key]);el.dataset.initial=el.value;if(['release_date','poster_path','runtime'].includes(key))el.dir='ltr';
   inputs[key]=el;lab.appendChild(el);form.appendChild(lab);
  }
  const hl=make('label','apCheck');const hidden=make('input');hidden.type='checkbox';hidden.checked=Boolean(ov?.hidden);hl.append(hidden,make('span','',T('این فیلم از جست‌وجو و فهرست‌ها مخفی شود','Hide this film from search and lists')));
  const note=make('input');note.placeholder=T('یادداشت دلیل اصلاح (اختیاری)','Why this correction (optional)');note.maxLength=300;
  const save=make('button','btn primary',T('ذخیره اصلاح','Save correction'));save.type='submit';
  const reset=confirmButton(T('بازگرداندن به حالت اولیه','Reset to original'),async()=>{
   await api('/film_catalog_overrides?film_id=eq.'+id,{method:'DELETE'});
   await window.filmDiscovery.setOverride(id,null,false);say(T('اصلاح حذف شد.','Correction removed.'));editor.replaceChildren();recent();
  },'btn danger');
  const row=make('div','apLine');row.append(save,reset);form.append(hl,note,row);card.appendChild(form);editor.replaceChildren(card);card.scrollIntoView({block:'nearest'});
  form.onsubmit=async ev=>{
   ev.preventDefault();save.disabled=true;
   try{
    const patch={...(ov?.patch||{})};
    for(const [key,el] of Object.entries(inputs)){
     if(el.value===el.dataset.initial)continue;
     const v=el.value.trim();
     if(key==='runtime'){if(!/^\d{1,3}$/.test(v)||Number(v)<1)throw Error(T('مدت باید عدد باشد','Runtime must be a number'));patch.runtime=Number(v);}
     else if(key==='poster_path'&&!/^\/[a-zA-Z0-9_-]{8,90}\.(?:jpg|png|webp)$/.test(v))throw Error(T('مسیر پوستر معتبر نیست','Invalid poster path'));
     else if(key==='release_date'&&!/^\d{4}(-\d{2}-\d{2})?$/.test(v))throw Error(T('تاریخ معتبر نیست','Invalid date'));
     else patch[key]=v;
    }
    await api('/film_catalog_overrides?on_conflict=film_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({film_id:id,patch,hidden:hidden.checked,note:note.value.trim().slice(0,300)})});
    await window.filmDiscovery.setOverride(id,patch,hidden.checked);
    say(T('اصلاح ذخیره شد و برای همه اعمال می‌شود.','Saved. Everyone now sees the correction.'));recent();
   }catch(e){say(explain(e),true);}finally{save.disabled=false;}
  };
 }
 let debounce=0,token=0;
 q.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(async()=>{
  const mine=++token,term=q.value.trim();
  if(term.length<2){results.replaceChildren();return;}
  results.replaceChildren(make('div','fsSkeleton'));
  const found=await window.filmDiscovery.searchAllMovies(term,10).catch(()=>[]);
  if(mine!==token||!live(serial))return;
  results.replaceChildren();
  for(const m of found){const b=make('button','apResult',(m.fa_title||m.title||'')+' · '+String(m.release_date||'').slice(0,4)+' · #'+m.id);b.type='button';b.onclick=()=>edit(m);results.appendChild(b);}
  if(!found.length)results.appendChild(empty(T('فیلمی پیدا نشد.','Nothing found.')));
 },300);};
 await recent();
}

/* ---------- roles and history (staff; changes: admin only, in Users) ---------- */
function auditLine(e,short){
 const line=make('div','apLine apAudit');
 const actor=labelOf(e.actor),target=labelOf(e.target_user);
 const film=e.film_id?('#'+e.film_id):'';
 const role=e.detail?.role?roleName(e.detail.role):'';
 const text={
  role_granted:T(`${target} ${role} شد`,`${target} became ${role}`)+(short?'':T(` (توسط ${actor||'سیستم'})`,` (by ${actor||'system'})`)),
  role_revoked:T(`${target} از نقش ${role} خارج شد`,`${target} is no longer ${role}`)+(short?'':T(` (توسط ${actor||'سیستم'})`,` (by ${actor||'system'})`)),
  review_deleted:T(`${actor} نظر ${target} را برای فیلم ${film} حذف کرد`,`${actor} deleted ${target}’s review of ${film}`)+(e.detail?.review?` — «${String(e.detail.review).slice(0,80)}»`:''),
  catalog_edit:T(`${actor} اطلاعات فیلم ${film} را اصلاح کرد`,`${actor} corrected film ${film}`)+(e.detail?.fields?.length?' ('+e.detail.fields.join(', ')+')':'')+(e.detail?.hidden?T(' · مخفی شد',' · hidden'):''),
  catalog_reset:T(`${actor} اصلاح فیلم ${film} را برگرداند`,`${actor} reset film ${film}`)
 }[e.action]||e.action;
 line.append(make('span','apGrow',text),make('small','',short?when(e.at):ago(e.at)));
 if(e.action==='role_granted')line.classList.add('good');if(e.action==='role_revoked'||e.action==='review_deleted')line.classList.add('bad');
 return line;
}
async function rolesView(serial){
 const [rows,hist]=await Promise.all([
  api('/film_roles?select=user_id,role,created_at,granted_by&order=created_at.asc&limit=500'),
  api('/film_audit?select=*&action=in.(role_granted,role_revoked)&order=at.desc&limit=150')]);
 if(!live(serial))return;
 const ids=(rows||[]).flatMap(r=>[r.user_id,r.granted_by]).concat((hist||[]).flatMap(h=>[h.actor,h.target_user]));
 if(isAdmin()){try{const us=await rpc('film_admin_users',{p_search:'',p_limit:200,p_offset:0});for(const u of us||[])names.set(u.user_id,{name:u.display_name,email:u.email,avatar:names.get(u.user_id)?.avatar});}catch(e){}}
 await fillNames(ids);
 if(!live(serial))return;
 const root=make('div','apStack');
 const cols=make('div','apThree');
 for(const role of ['admin','moderator','critic']){
  const box=make('section','apBox');const list=(rows||[]).filter(r=>r.role===role);
  box.appendChild(make('h3','',roleName(role)+' — '+num(list.length)));
  if(!list.length)box.appendChild(empty(T('هیچ‌کس','Nobody')));
  for(const r of list){
   const line=make('div','apLine');
   const info=make('div','apGrow');info.append(userCell(r.user_id),make('small','',T('از ','Since ')+when(r.created_at)+(r.granted_by?T(' · توسط ',' · by ')+labelOf(r.granted_by):'')));
   line.appendChild(info);
   if(isAdmin())line.appendChild(confirmButton(T('گرفتن نقش','Remove'),async()=>{await rpc('film_set_role',{p_user:r.user_id,p_role:role,p_on:false});say(T('نقش گرفته شد.','Role removed.'));rolesView(++renderSerial).catch(e=>say(explain(e),true));},'btn danger'));
   box.appendChild(line);
  }
  cols.appendChild(box);
 }
 root.appendChild(cols);
 if(isAdmin())root.appendChild(make('p','apHint',T('برای دادن نقش به یک نفر، از بخش «کاربران» او را پیدا کن و دکمهٔ نقش را بزن.','To grant a role, find the person in “Users” and press the role button.')));
 else root.appendChild(make('p','apHint',T('تغییر نقش‌ها فقط با ادمین است؛ این بخش برای مودریتور فقط‌خواندنی است.','Only admins change roles; this section is read-only for moderators.')));
 const h=make('section','apBox');h.appendChild(make('h3','',T('سابقه: چه کسی کی منتقد/مودریتور/ادمین شد یا خارج شد','History: who became / stopped being critic, moderator or admin, and when')));
 if(!(hist||[]).length)h.appendChild(empty(T('هنوز سابقه‌ای نیست.','No history yet.')));
 for(const e of hist||[])h.appendChild(auditLine(e));
 root.appendChild(h);main.replaceChildren(root);
}

/* ---------- audit log (staff) ---------- */
async function auditView(serial){
 const root=make('div','apStack'),bar=make('div','apBar');
 const sel=make('select');for(const [v,fa_,en_] of [['','همهٔ رویدادها','All events'],['role_granted','نقش داده شد','Role granted'],['role_revoked','نقش گرفته شد','Role removed'],['review_deleted','نظر حذف شد','Review deleted'],['catalog_edit','اصلاح آرشیو','Catalog fix'],['catalog_reset','برگرداندن اصلاح','Catalog reset']]){const o=make('option','',T(fa_,en_));o.value=v;sel.appendChild(o);}
 bar.appendChild(sel);const list=make('div');root.append(bar,list);main.replaceChildren(root);
 async function load(){
  list.replaceChildren(make('div','fsSkeleton'));
  const rows=await api('/film_audit?select=*&order=at.desc&limit=120'+(sel.value?'&action=eq.'+sel.value:''));
  if(!live(serial))return;
  if(isAdmin()){try{const us=await rpc('film_admin_users',{p_search:'',p_limit:200,p_offset:0});for(const u of us||[])names.set(u.user_id,{name:u.display_name,email:u.email,avatar:names.get(u.user_id)?.avatar});}catch(e){}}
  await fillNames((rows||[]).flatMap(r=>[r.actor,r.target_user]));
  list.replaceChildren();
  for(const e of rows||[]){const l=auditLine(e);l.title=when(e.at);list.appendChild(l);}
  if(!(rows||[]).length)list.appendChild(empty(T('رویدادی ثبت نشده.','Nothing logged.')));
 }
 sel.onchange=()=>load().catch(e=>say(explain(e),true));
 await load();
}

/* ---------- wiring ---------- */
function onAccount(){
 rolesFor='';pingOff=false;
 if(!ready()){myRoles=new Set();syncLaunch();clearInterval(pingTimer);return;}
 loadMyRoles().then(()=>{if(location.hash==='#admin'){if(isStaff())openPanel();else banner(diagnose());}});
 startPing();
}
window.addEventListener('film-account-state',onAccount);
// Safety net: the account events can fire before the account is usable, so also check regularly.
setInterval(()=>{
 const signedIn=typeof ses!=='undefined'&&ses;
 if(!signedIn){if(myRoles.size||rolesFor){myRoles=new Set();rolesFor='';syncLaunch();}return;}
 if(ready()&&rolesFor!==ses.id&&!retryTimer)loadMyRoles();
 if(ready()&&!pingTimer)startPing();
},2500);
function diagnose(){
 if(!ready())return T('هنوز وارد حساب نشده‌ای یا اتصال حساب آماده نیست.','You are not signed in yet, or the account is still connecting.');
 return T('حساب: ','Account: ')+ses.email+' — '+(isStaff()?T('نقش‌ها: ','Roles: ')+[...myRoles].join(', '):T('نقش مدیریتی برای این حساب پیدا نشد','No staff role found for this account'))+(roleError?' — '+T('خطا: ','Error: ')+roleError:'');
}
function banner(text){
 let b=$('apBanner');if(!b){b=make('div','apBanner');b.id='apBanner';b.setAttribute('role','status');document.body.appendChild(b);}
 b.textContent=text;clearTimeout(b._t);b._t=setTimeout(()=>b.remove(),12000);b.onclick=()=>b.remove();
}
async function openFromHash(){
 if(location.hash!=='#admin')return;
 if(ready()){rolesFor='';await loadMyRoles();}
 if(isStaff())openPanel();else banner(diagnose());
}
window.addEventListener('hashchange',openFromHash);
window.filmStaff={open:openPanel,isAdmin,isStaff,roles:()=>[...myRoles],diagnose};
if(typeof ses!=='undefined'&&ses)onAccount();
})();
