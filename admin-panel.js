/* Staff panel (admin + moderator) and presence ping.
 * Needs security/film-admin-v3.sql. The panel is only a UI: every action is allowed or refused by the
 * database (row level security + admin-only functions), so hiding the button is not the protection.
 *  - Admin: overview numbers, who is online, all users, roles, all reviews, catalog corrections, audit log.
 *  - Moderator (security/film-round9.sql): own desk with report queue, review deletion, timed suspensions with a reason
 *    (1 hour ... 10 years), film archive fixes and the activity log. No e-mails, no roles, no deleting accounts. */
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
 if(/remove the admin role first/.test(m))return T('این کاربر ادمین است؛ اول نقش ادمین او را بگیر.','This user is an admin; remove the admin role first.');
 if(/cannot delete yourself/.test(m))return T('حساب خودت را نمی‌شود حذف کرد.','You cannot delete your own account.');
 if(/last admin/.test(m))return T('آخرین ادمین را نمی‌شود حذف کرد.','The last admin cannot be removed.');
 if(/404|PGRST20|does not exist|42P01/.test(m))return T('بخشی از SQL امنیتی هنوز در Supabase اجرا نشده است؛ فایل security/film-all-in-one.sql را یک‌بار اجرا کن.','Part of the security SQL has not been run in Supabase yet; run security/film-all-in-one.sql once.');
 if(/cannot suspend an admin/.test(m))return T('ادمین را نمی‌شود تعلیق کرد.','An admin cannot be suspended.');
 if(/only an admin can suspend a moderator/.test(m))return T('فقط ادمین می‌تواند یک مودریتور را تعلیق کند.','Only an admin can suspend a moderator.');
 if(/suspension set by an admin/.test(m))return T('این تعلیق را ادمین گذاشته؛ فقط ادمین می‌تواند آن را تغییر دهد.','An admin set this suspension; only an admin can change it.');
 if(/daily suspension limit/.test(m))return T('سقف ۲۵ تعلیق در ۲۴ ساعت برای مودریتور پر شد.','Daily limit of 25 suspensions reached.');
 if(/reason required/.test(m))return T('دلیل تعلیق را بنویس (۳ تا ۲۰۰ نویسه).','Write a reason (3–200 characters).');
 if(/invalid duration/.test(m))return T('مدت تعلیق باید از ۱ ساعت تا ۱۰ سال باشد.','Duration must be between 1 hour and 10 years.');
 if(/staff only/.test(m))return T('این بخش فقط برای مودریتور و ادمین است.','Staff only.');
 if(/cannot suspend yourself/.test(m))return T('حساب خودت را نمی‌شود تعلیق کرد.','You cannot suspend yourself.');
 if(/violates check constraint/.test(m))return T('متن اعلان باید بین ۱ تا ۲۴۰ نویسه باشد.','The announcement must be 1–240 characters.');
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
 b=make('button','apLaunch');const lbl=isAdmin()?T('پنل مدیریت','Staff panel'):T('میز مودریتور','Moderator desk');b.append(make('span','lIcon','🛡️'),make('span','lLbl',lbl));b.title=lbl;b.setAttribute('aria-label',b.title);b.id='adminLaunch';b.type='button';
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
 {id:'announce',fa:'اعلان‌های سایت',en:'Announcements',icon:'📣',admin:true},
 {id:'home',fa:'میز مودریتور',en:'Moderator desk',icon:'🛡️',modOnly:true},
 {id:'reports',fa:'گزارش‌های نظرها',en:'Review reports',icon:'🚩'},
 {id:'reviews',fa:'نظرها',en:'Reviews',icon:'💬'},
 {id:'suspensions',fa:'تعلیق حساب‌ها',en:'Suspensions',icon:'⏳'},
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
  if(s.modOnly&&isAdmin())continue;
  const b=make('button','apNavBtn'+(s.id===current?' on':''),s.icon+' '+T(s.fa,s.en));b.type='button';
  b.onclick=()=>show(s.id);navBox.appendChild(b);
 }
 dialog.querySelector('.apWho').textContent=[...myRoles].map(roleName).join(' · ');
 dialog.querySelector('.apTitle h2').textContent=isAdmin()?T('پنل مدیریت','Staff panel'):T('میز مودریتور','Moderator desk');
 dialog.classList.toggle('apModerator',!isAdmin());
}
async function openPanel(section){
 await loadMyRoles();
 if(!isStaff())return;
 if(!dialog)build();
 if(!dialog.open)dialog.showModal();
 show(section||(isAdmin()?'overview':'home'));
}
function show(id){
 const meta=SECTIONS.find(s=>s.id===id);
 if(!meta||(meta.admin&&!isAdmin())||(meta.modOnly&&isAdmin()))id=isAdmin()?'overview':'home';
 current=id;say('');drawNav();clearInterval(timer);
 main.replaceChildren(make('div','fsSkeleton'));
 const run={overview,home:modHomeView,reports:reportsView,suspensions:suspensionsView,users:usersView,announce:announceView,reviews:reviewsView,catalog:catalogView,roles:rolesView,audit:auditView}[id];
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
 const csv=make('button','btn',T('⬇ خروجی CSV کاربران','⬇ Export users (CSV)'));csv.type='button';
 csv.onclick=async()=>{
  csv.disabled=true;
  try{
   const all=[];for(let o=0;o<2000;o+=200){const part=await rpc('film_admin_users',{p_search:userQuery,p_limit:200,p_offset:o});all.push(...(part||[]));if(!part||part.length<200)break;}
   const esc=v=>{let x=String(v??'');if(/^[=+\-@\t\r]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';};
   const head=['email','display_name','roles','joined','last_sign_in','last_seen','visits','reviews','email_confirmed','suspended'];
   const lines=[head.join(',')].concat(all.map(u=>[u.email,u.display_name,(u.roles||[]).join('|'),u.created_at,u.last_sign_in_at,u.last_seen,u.visits,u.review_count,u.email_confirmed?'yes':'no',u.banned?'yes':'no'].map(esc).join(',')));
   const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='film-users-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
   say(T('فایل CSV ساخته شد ('+num(all.length)+' کاربر).','CSV created ('+all.length+' users).'));
  }catch(e){say(explain(e),true);}finally{csv.disabled=false;}
 };
 const list=make('div');bar.append(q,csv);root.append(bar,list);main.replaceChildren(root);
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
   if(u.banned){const sb_=make('span','apBanned','🚫 '+T('تعلیق','Suspended'));who.appendChild(sb_);tr.classList.add('apIsBanned');}
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
 if(u.user_id!==ses.id){
  if(!(u.roles||[]).includes('admin')){
   const sus=make('div','apSuspend');
   sus.appendChild(make('h4','',T('تعلیق حساب','Suspend account')));
   sus.appendChild(make('p','apHint',u.banned?T('این حساب تعلیق است: وارد نمی‌شود و نمی‌تواند نظر یا لایک بگذارد. با رفع تعلیق، دوباره عادی می‌شود.','This account is suspended: it cannot sign in, review or like. Lifting the suspension makes it normal again.')
    :T('مدت را انتخاب کن (از ۱ ساعت تا همیشگی) و دلیل را بنویس. حساب تعلیق‌شده نمی‌تواند وارد شود، نظر بگذارد یا لایک کند؛ اطلاعاتش حذف نمی‌شود.','Choose a length (1 hour to permanent) and write a reason. A suspended account cannot sign in, review or like; nothing is deleted.')));
   if(u.banned)sus.appendChild(confirmButton(T('رفع تعلیق','Lift suspension'),async()=>{
    await rpc('film_staff_lift',{p_user:u.user_id});
    say(T('حساب بازگردانده شد.','Account restored.'));
    if(live(serial))usersView(serial);
   },'btn primary'));
   else sus.appendChild(suspendForm(u.user_id,()=>{if(live(serial))usersView(serial);}));
   box.appendChild(sus);
  }
  const zone=make('div','apDanger');zone.appendChild(make('h4','',T('حذف حساب','Delete account')));
  zone.appendChild(make('p','apHint',T('با حذف حساب، آرشیو، پروفایل عمومی، نظرها و دنبال‌کردن‌های این کاربر برای همیشه پاک می‌شود و برگشت ندارد. برای تأیید، ایمیل او را دقیقاً بنویس.','Deleting removes this member’s archive, public profile, reviews and follows permanently. Type the e-mail to confirm.')));
  const typed=make('input');typed.type='email';typed.dir='ltr';typed.placeholder=u.email||'';typed.autocomplete='off';typed.setAttribute('aria-label',T('ایمیل برای تأیید حذف','E-mail to confirm deletion'));
  const del=make('button','btn danger',T('حذف دائمی این حساب','Delete this account permanently'));del.type='button';del.disabled=true;
  typed.oninput=()=>{del.disabled=!u.email||typed.value.trim().toLowerCase()!==String(u.email).toLowerCase();};
  del.onclick=async()=>{
   del.disabled=true;
   try{await rpc('film_admin_delete_user',{p_user:u.user_id});say(T('حساب حذف شد و در گزارش فعالیت ثبت شد.','Account deleted and logged.'));if(live(serial))usersView(serial);}
   catch(e){say(explain(e),true);del.disabled=false;}
  };
  const line=make('div','apLine');line.append(typed,del);zone.appendChild(line);box.appendChild(zone);
 }
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

/* ---------- moderator desk: durations, suspend form, home, reports, suspensions ---------- */
const DURATIONS=[[1,'۱ ساعت','1 hour'],[6,'۶ ساعت','6 hours'],[12,'۱۲ ساعت','12 hours'],[24,'۱ روز','1 day'],[72,'۳ روز','3 days'],[168,'۱ هفته','1 week'],
 [336,'۲ هفته','2 weeks'],[720,'۱ ماه','1 month'],[2160,'۳ ماه','3 months'],[4320,'۶ ماه','6 months'],[8760,'۱ سال','1 year'],[17520,'۲ سال','2 years'],
 [43800,'۵ سال','5 years'],[87600,'۱۰ سال','10 years']];
function durationLabel(h){
 h=Number(h)||0;
 const hit=DURATIONS.find(d=>d[0]===h);if(hit)return T(hit[1],hit[2]);
 if(h>=876000)return T('همیشگی','permanently');
 if(h%24===0)return T(num(h/24)+' روز',(h/24)+' days');
 return T(num(h)+' ساعت',h+' hours');
}
function remaining(iso){
 const ms=new Date(iso).getTime()-Date.now();
 if(!(ms>0))return T('تمام شده','Over');
 const h=ms/36e5;
 if(h<1)return T(num(Math.max(1,Math.round(ms/6e4)))+' دقیقه مانده',Math.max(1,Math.round(ms/6e4))+' min left');
 if(h<48)return T(num(Math.round(h))+' ساعت مانده',Math.round(h)+' h left');
 if(h<24*90)return T(num(Math.round(h/24))+' روز مانده',Math.round(h/24)+' d left');
 if(h<24*365*3)return T(num(Math.round(h/24/30))+' ماه مانده',Math.round(h/24/30)+' months left');
 return T(num(Math.round(h/24/365))+' سال مانده',Math.round(h/24/365)+' years left');
}
function suspendForm(uid,after){
 const box=make('div','apSusForm');
 const sel=make('select');sel.setAttribute('aria-label',T('مدت تعلیق','Suspension length'));
 for(const [h,f,e] of DURATIONS){const o=make('option','',T(f,e));o.value=String(h);if(h===24)o.selected=true;sel.appendChild(o);}
 if(isAdmin()){const o=make('option','',T('همیشگی (۱۰۰ سال)','Permanent (100 years)'));o.value='876000';sel.appendChild(o);}
 const why=make('input');why.maxLength=200;why.placeholder=T('دلیل تعلیق (الزامی)','Reason (required)');why.setAttribute('aria-label',why.placeholder);
 const go=confirmButton(T('تعلیق حساب','Suspend account'),async()=>{
  const reason=why.value.trim();
  if(reason.length<3)throw Error('reason required');
  await rpc('film_staff_suspend',{p_user:uid,p_hours:Number(sel.value),p_reason:reason});
  say(T('حساب برای '+durationLabel(sel.value)+' تعلیق شد؛ ورودهای فعالش بسته شد و در گزارش فعالیت ثبت شد.','Account suspended for '+durationLabel(sel.value)+'; its sessions were closed and it is in the activity log.'));
  if(after)after();
 },'btn danger');
 box.append(sel,why,go);
 return box;
}
function section(title,content){const b=make('section','apBox');b.appendChild(make('h3','',title));if(content)b.appendChild(content);return b;}

async function modHomeView(serial){
 const [stats,mine]=await Promise.all([rpc('film_staff_stats'),api('/film_audit?select=*&actor=eq.'+ses.id+'&order=at.desc&limit=8')]);
 if(!live(serial))return;
 await fillNames((mine||[]).flatMap(a=>[a.actor,a.target_user]));
 if(!live(serial))return;
 const root=make('div','apStack');
 const cards=make('div','apCards');
 for(const [key,label,go] of [['open_reports',T('گزارش بازِ نظرها','Open review reports'),'reports'],['active_suspensions',T('حساب تعلیق‌شده','Suspended accounts'),'suspensions'],
  ['reviews_24h',T('نظر در ۲۴ ساعت اخیر','Reviews in 24 h'),'reviews'],['my_actions_7d',T('کارهای من در ۷ روز','My actions in 7 days'),'audit']]){
  const c=make('button','apCard apCardBtn'+(key==='open_reports'&&Number(stats?.[key])>0?' live':''));c.type='button';
  c.append(make('strong','',num(stats?.[key])),make('span','',label));c.onclick=()=>show(go);cards.appendChild(c);
 }
 root.appendChild(cards);
 const can=make('ul','apCan');
 for(const t of [T('حذف نظرهای نامناسب و رسیدگی به گزارش‌ها','Delete inappropriate reviews and handle reports'),
  T('تعلیق حساب از ۱ ساعت تا ۱۰ سال، همیشه با نوشتن دلیل؛ و برداشتن تعلیق‌هایی که خودت یا مودریتورها گذاشته‌اید','Suspend accounts from 1 hour up to 10 years, always with a reason; lift suspensions set by you or other moderators'),
  T('اصلاح اطلاعات و پوستر فیلم‌ها برای همهٔ کاربران','Correct film details and posters for everyone'),
  T('دیدن گزارش فعالیت همهٔ مدیریت','Read the staff activity log')])can.appendChild(make('li','',t));
 const lim=make('ul','apCannot');
 for(const t of [T('ایمیل کامل کاربران را نمی‌بیند و فهرست اعضا را باز نمی‌کند','Cannot see full e-mails or the member list'),
  T('نقش‌ها را تغییر نمی‌دهد، حساب حذف نمی‌کند و اعلان سایت نمی‌گذارد','Cannot change roles, delete accounts or post announcements'),
  T('ادمین‌ها و مودریتورها را نمی‌تواند تعلیق کند؛ حداکثر ۲۵ تعلیق در ۲۴ ساعت','Cannot suspend admins or moderators; at most 25 suspensions per 24 hours')])lim.appendChild(make('li','',t));
 const two=make('div','apTwo');
 two.append(section(T('کارهایی که می‌توانی انجام دهی','What you can do'),can),section(T('محدودیت‌های نقش مودریتور','Limits of the moderator role'),lim));
 root.appendChild(two);
 const hist=make('div');for(const e of mine||[])hist.appendChild(auditLine(e));
 if(!(mine||[]).length)hist.appendChild(empty(T('هنوز کاری ثبت نشده.','Nothing logged yet.')));
 root.appendChild(section(T('آخرین کارهای تو','Your latest actions'),hist));
 main.replaceChildren(root);
}

async function reportsView(serial){
 const root=make('div','apStack'),bar=make('div','apBar');
 const sel=make('select');for(const [v,f,e] of [['open','باز','Open'],['all','همه (با سابقه)','All (with history)']]){const o=make('option','',T(f,e));o.value=v;sel.appendChild(o);}
 sel.value=reportFilter;bar.append(sel);
 const list=make('div');root.append(bar,list);main.replaceChildren(root);
 sel.onchange=()=>{reportFilter=sel.value;load().catch(e=>say(explain(e),true));};
 async function load(){
  list.replaceChildren(make('div','fsSkeleton'));
  const rows=await rpc('film_staff_reports',{p_status:reportFilter,p_limit:100});
  if(!live(serial))return;
  await fillNames((rows||[]).map(r=>r.author));
  const wrap=make('div','apReviews');
  for(const r of rows||[]){
   const card=make('article','fsCard apReview');
   const top=make('div','apLine');top.append(userCell(r.author));
   const fb=make('button','fsFilm',r.film_title||('#'+r.film_id));fb.type='button';fb.onclick=()=>{dialog.close();window.filmDiscovery?.openFilm?.(Number(r.film_id));};
   const st=make('span','apBadge apSt-'+r.status,{open:T('باز','Open'),removed:T('نظر حذف شد','Review removed'),dismissed:T('رد شد','Dismissed')}[r.status]||r.status);
   top.append(fb,make('span','apGrow'),make('small','',T(num(r.reports_on_review)+' گزارش',r.reports_on_review+' report(s)')),make('small','',when(r.created_at)),st);
   card.appendChild(top);
   card.appendChild(make('p','apText',r.snippet||'—'));
   card.appendChild(make('p','apHint',T('دلیل گزارش: ','Reason: ')+r.reason));
   if(r.status==='open'){
    const acts=make('div','apLine'),slot=make('div');
    if(r.review_exists)acts.appendChild(confirmButton(T('حذف نظر','Delete review'),async()=>{
     await rpc('film_staff_resolve_report',{p_id:r.id,p_action:'delete'});say(T('نظر حذف شد و در گزارش ثبت شد.','Review deleted and logged.'));load().catch(()=>{});},'btn danger'));
    acts.appendChild(confirmButton(T('رد گزارش','Dismiss report'),async()=>{
     await rpc('film_staff_resolve_report',{p_id:r.id,p_action:'dismiss'});say(T('گزارش رد شد.','Report dismissed.'));load().catch(()=>{});},'btn'));
    if(r.author&&r.author!==ses.id){
     const sus=make('button','btn',T('تعلیق نویسنده…','Suspend author…'));sus.type='button';
     sus.onclick=()=>{if(slot.firstChild){slot.replaceChildren();return;}slot.appendChild(suspendForm(r.author,()=>load().catch(()=>{})));};
     acts.appendChild(sus);
    }
    card.append(acts,slot);
   }
   wrap.appendChild(card);
  }
  if(!(rows||[]).length)wrap.appendChild(empty(reportFilter==='open'?T('گزارش بازی نیست. 🎉','No open reports. 🎉'):T('هنوز گزارشی ثبت نشده.','No reports yet.')));
  list.replaceChildren(wrap);
 }
 await load();
}

async function suspensionsView(serial){
 const root=make('div','apStack');
 // find a member (by public name) and suspend them
 const finder=make('div','apBar');
 const q=make('input');q.type='search';q.placeholder=T('نام عمومی عضو را برای تعلیق جست‌وجو کن (دست‌کم ۲ حرف)…','Search a member’s public name to suspend (2+ letters)…');
 const go=make('button','btn primary',T('جست‌وجو','Search'));go.type='button';
 finder.append(q,go);
 const found=make('div'),activeBox=make('div');
 root.append(section(T('تعلیق یک عضو','Suspend a member'),(()=>{const w=make('div');w.append(finder,found);return w;})()),activeBox);
 main.replaceChildren(root);
 async function runSearch(){
  const term=q.value.trim();found.replaceChildren();
  if(term.length<2)return;
  const rows=await rpc('film_staff_find_users',{p_search:term,p_limit:20});
  if(!live(serial))return;
  await fillNames((rows||[]).map(r=>r.user_id));
  if(!(rows||[]).length){found.appendChild(empty(T('عضوی با این نام نیست.','No member with that name.')));return;}
  for(const u of rows){
   const row=make('div','apFound'),line=make('div','apLine');
   const protectedUser=(u.roles||[]).some(r=>r==='admin'||(r==='moderator'&&!isAdmin()))||u.user_id===ses.id;
   line.append(userCell(u.user_id),make('small','apLtr',u.email||''),badges(u.roles),make('span','apGrow'),make('small','',T(num(u.review_count)+' نظر',u.review_count+' reviews')));
   const slot=make('div');
   if(u.suspended_until){
    line.appendChild(make('span','apBadge apSt-open','⏳ '+remaining(u.suspended_until)));
    line.appendChild(confirmButton(T('رفع تعلیق','Lift suspension'),async()=>{await rpc('film_staff_lift',{p_user:u.user_id});say(T('تعلیق برداشته شد.','Suspension lifted.'));show('suspensions');},'btn primary'));
   }else if(protectedUser){
    line.appendChild(make('small','',u.user_id===ses.id?T('خودت','You'):T('قابل تعلیق نیست','Cannot be suspended')));
   }else{
    const b=make('button','btn danger',T('تعلیق…','Suspend…'));b.type='button';
    b.onclick=()=>{if(slot.firstChild){slot.replaceChildren();return;}slot.appendChild(suspendForm(u.user_id,()=>show('suspensions')));};
    line.appendChild(b);
   }
   row.append(line,slot);found.appendChild(row);
  }
 }
 go.onclick=()=>runSearch().catch(e=>say(explain(e),true));
 q.onkeydown=e=>{if(e.key==='Enter')go.onclick();};
 // current suspensions (and history)
 async function loadActive(){
  activeBox.replaceChildren(make('div','fsSkeleton'));
  const rows=await rpc('film_staff_suspensions',{p_active_only:!showHistory,p_limit:150});
  if(!live(serial))return;
  await fillNames((rows||[]).flatMap(r=>[r.user_id,r.imposed_by]));
  const box=make('section','apBox');
  const head=make('div','apLine');head.append(make('h3','apGrow',(showHistory?T('همهٔ تعلیق‌ها (سابقه)','All suspensions (history)'):T('تعلیق‌های فعال','Active suspensions'))+' — '+num((rows||[]).length)));
  const toggle=make('button','btn',showHistory?T('فقط فعال‌ها','Active only'):T('نمایش سابقه','Show history'));toggle.type='button';
  toggle.onclick=()=>{showHistory=!showHistory;loadActive().catch(e=>say(explain(e),true));};head.appendChild(toggle);box.appendChild(head);
  if(!(rows||[]).length)box.appendChild(empty(T('تعلیقی نیست.','No suspensions.')));
  else{
   const trs=[];
   for(const r of rows){
    const tr=make('tr',r.is_active?'':'apMuted');
    tr.append(cell(userCell(r.user_id)),cell(r.email||'','apLtr'),cell(r.reason||''),cell(when(r.starts_at)),
     cell(r.is_active?when(r.until)+' · '+remaining(r.until):(r.lifted_at?T('برداشته شد ','Lifted ')+when(r.lifted_at):T('تمام شد','Expired'))),
     cell(r.imposed_by?labelOf(r.imposed_by):'—'));
    const act=make('td');
    if(r.is_active)act.appendChild(confirmButton(T('رفع تعلیق','Lift'),async()=>{await rpc('film_staff_lift',{p_user:r.user_id});say(T('تعلیق برداشته شد.','Suspension lifted.'));loadActive().catch(()=>{});},'btn'));
    tr.appendChild(act);trs.push(tr);
   }
   box.appendChild(table([T('عضو','Member'),T('ایمیل','E-mail'),T('دلیل','Reason'),T('شروع','Start'),T('پایان / وضعیت','End / status'),T('توسط','By'),''],trs));
  }
  activeBox.replaceChildren(box);
 }
 await loadActive();
}
let reportFilter='open',showHistory=false;

/* ---------- announcements (admin) ---------- */
async function announceView(serial){
 const root=make('div','apStack');
 root.appendChild(make('p','apHint',T('اعلانِ فعال به‌صورت یک نوار بالای صفحه به همهٔ بازدیدکننده‌ها نشان داده می‌شود (هر نفر می‌تواند آن را ببندد). برای اطلاع‌رسانی نگهداری، رویداد یا قانون جدید استفاده کن.','An active announcement shows as a bar at the top for every visitor (each person can dismiss it). Use it for maintenance, events or new rules.')));
 const form=make('form','apBox apForm');form.appendChild(make('h3','',T('اعلان تازه','New announcement')));
 const msg=make('textarea');msg.rows=2;msg.maxLength=240;msg.required=true;msg.placeholder=T('متن اعلان (حداکثر ۲۴۰ نویسه)…','Announcement text (max 240 characters)…');msg.setAttribute('aria-label',msg.placeholder);
 const level=make('select');for(const [v,a,b] of [['info','ℹ️ اطلاع‌رسانی','ℹ️ Info'],['warn','⚠️ هشدار','⚠️ Warning']]){const o=make('option','',T(a,b));o.value=v;level.appendChild(o);}
 const go=make('button','btn primary',T('انتشار اعلان','Publish'));go.type='submit';
 const row=make('div','apLine');row.append(level,go);form.append(msg,row);
 const list=make('section','apBox');
 root.append(form,list);main.replaceChildren(root);
 async function load(){
  list.replaceChildren(make('h3','',T('اعلان‌ها','Announcements')));
  const rows=await api('/film_announcements?select=id,message,level,active,created_at&order=created_at.desc&limit=50');
  if(!live(serial))return;
  if(!(rows||[]).length)list.appendChild(empty(T('هنوز اعلانی نگذاشته‌ای.','No announcements yet.')));
  for(const r of rows||[]){
   const line=make('div','apLine apAnn'+(r.active?'':' off'));
   line.append(make('span','apAnnIcon',r.level==='warn'?'⚠️':'ℹ️'),make('span','apGrow',r.message),make('small','',ago(r.created_at)));
   const t=make('button','btn',r.active?T('غیرفعال کردن','Turn off'):T('فعال کردن','Turn on'));t.type='button';
   t.onclick=async()=>{t.disabled=true;try{await api('/film_announcements?id=eq.'+Number(r.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({active:!r.active})});window.dispatchEvent(new Event('film-announce-changed'));load().catch(e=>say(explain(e),true));}catch(e){say(explain(e),true);t.disabled=false;}};
   line.append(t,confirmButton(T('حذف','Delete'),async()=>{await api('/film_announcements?id=eq.'+Number(r.id),{method:'DELETE'});window.dispatchEvent(new Event('film-announce-changed'));load().catch(e=>say(explain(e),true));},'btn danger'));
   list.appendChild(line);
  }
 }
 form.onsubmit=async ev=>{
  ev.preventDefault();const text=msg.value.trim();if(!text)return;go.disabled=true;
  try{await api('/film_announcements',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({message:text,level:level.value,created_by:ses.id})});
   msg.value='';say(T('اعلان منتشر شد.','Announcement published.'));window.dispatchEvent(new Event('film-announce-changed'));await load();}
  catch(e){say(explain(e),true);}finally{go.disabled=false;}
 };
 await load();
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
   const slot=make('div'),theirs=rolesMap.get(r.user_id)||[];
   if(r.user_id!==ses.id&&!theirs.includes('admin')&&!(theirs.includes('moderator')&&!isAdmin())){
    const sus=make('button','btn',T('تعلیق نویسنده…','Suspend author…'));sus.type='button';
    sus.onclick=()=>{if(slot.firstChild){slot.replaceChildren();return;}slot.appendChild(suspendForm(r.user_id));};
    acts.appendChild(sus);
   }
   card.append(acts,slot);wrap.appendChild(card);
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
  catalog_reset:T(`${actor} اصلاح فیلم ${film} را برگرداند`,`${actor} reset film ${film}`),
  user_deleted:T(`${actor} حساب ${e.detail?.email||target} را حذف کرد`,`${actor} deleted the account ${e.detail?.email||target}`),
  user_suspended:T(`${actor} حساب ${e.detail?.email||target} را ${e.detail?.hours?durationLabel(e.detail.hours):''} تعلیق کرد`,`${actor} suspended ${e.detail?.email||target}${e.detail?.hours?' for '+durationLabel(e.detail.hours):''}`)+(e.detail?.reason?` — «${String(e.detail.reason).slice(0,80)}»`:''),
  report_dismissed:T(`${actor} گزارش یک نظر را رد کرد`,`${actor} dismissed a review report`),
  user_restored:T(`${actor} حساب ${e.detail?.email||target} را بازگرداند`,`${actor} restored ${e.detail?.email||target}`),
  announcement_insert:T(`${actor} اعلان تازه گذاشت: «${e.detail?.message||''}»`,`${actor} posted an announcement: “${e.detail?.message||''}”`),
  announcement_update:T(`${actor} اعلان «${e.detail?.message||''}» را ${e.detail?.active?'فعال':'غیرفعال'} کرد`,`${actor} ${e.detail?.active?'enabled':'disabled'} the announcement “${e.detail?.message||''}”`),
  announcement_delete:T(`${actor} اعلان «${e.detail?.message||''}» را حذف کرد`,`${actor} deleted the announcement “${e.detail?.message||''}”`)
 }[e.action]||e.action;
 line.append(make('span','apGrow',text),make('small','',short?when(e.at):ago(e.at)));
 if(e.action==='role_granted')line.classList.add('good');if(['role_revoked','review_deleted','user_deleted','user_suspended'].includes(e.action))line.classList.add('bad');
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
 const sel=make('select');for(const [v,fa_,en_] of [['','همهٔ رویدادها','All events'],['role_granted','نقش داده شد','Role granted'],['role_revoked','نقش گرفته شد','Role removed'],['review_deleted','نظر حذف شد','Review deleted'],['catalog_edit','اصلاح آرشیو','Catalog fix'],['catalog_reset','برگرداندن اصلاح','Catalog reset'],['user_deleted','حساب حذف شد','Account deleted'],['user_suspended','حساب تعلیق شد','Account suspended'],['user_restored','حساب بازگردانده شد','Account restored'],['announcement_insert','اعلان تازه','Announcement posted']]){const o=make('option','',T(fa_,en_));o.value=v;sel.appendChild(o);}
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
