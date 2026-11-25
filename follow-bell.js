/* Notification bell: shows a red badge when someone has followed you or liked one of your reviews since you last opened it.
 * "Seen" time is kept per account in this browser (localStorage). Needs film_follows(created_at). */
(function(){
'use strict';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&cloudReady;
const faNum=n=>typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(n):String(n);
const key=()=>'film-bell-seen:'+ses.id;
const getSeen=()=>{try{return localStorage.getItem(key())||'';}catch(e){return '';}};
const setSeen=v=>{try{localStorage.setItem(key(),v);}catch(e){}};
let reviewInfo=new Map(),btn,dot,panel,items=[],owner='',timer=0,busy=false,renderSerial=0;

function build(){
 const anchor=document.getElementById('acctBtn');if(!anchor||btn)return;
 btn=make('button','themeBtn bellBtn');btn.id='bellBtn';btn.type='button';btn.textContent='🔔';
 btn.setAttribute('aria-label',T('اعلان‌ها','Notifications'));btn.setAttribute('aria-haspopup','true');btn.setAttribute('aria-expanded','false');
 dot=make('span','bellDot');dot.hidden=true;dot.setAttribute('aria-hidden','true');btn.appendChild(dot);
 anchor.before(btn);
 panel=make('div','bellPanel');panel.id='bellPanel';panel.hidden=true;document.body.appendChild(panel);
 btn.addEventListener('click',e=>{e.stopPropagation();panel.hidden?open():close();});
 document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();btn.focus();}});
}
function bellHeart(){
 const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','bellHeart');svg.setAttribute('aria-hidden','true');
 const p=document.createElementNS(NS,'path');p.setAttribute('d','M12 20.6 4.6 13.4C2.2 11 2.3 7.4 4.5 5.5c2-1.7 4.8-1.3 6.4.6l1.1 1.3 1.1-1.3c1.6-1.9 4.4-2.3 6.4-.6 2.2 1.9 2.3 5.5-.1 7.9z');
 svg.appendChild(p);return svg;
}
function unreadCount(){const seen=getSeen();return items.filter(i=>!seen||i.created_at>seen).length;}
function paint(){
 if(!btn)return;
 const on=Boolean(ready());btn.classList.toggle('on',on);
 if(!on){panel.hidden=true;return;}
 const n=unreadCount();dot.hidden=n===0;dot.textContent=n>9?'9+':faNum(n);
 btn.title=n?T(n+' اعلان جدید','New notifications: '+n):T('اعلان‌ها','Notifications');
}
function position(){
 const r=btn.getBoundingClientRect();const w=Math.min(340,innerWidth*0.94);
 panel.style.top=(r.bottom+8)+'px';
 panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';
}
async function load(){
 if(!ready()||busy)return;
 busy=true;
 try{
  const F=window.filmFriends;
  const rows=(await F.get('/film_follows?select=follower_id,created_at&followed_id=eq.'+ses.id+'&order=created_at.desc&limit=30')).map(r=>({...r,kind:'follow'}));
  // likes on my reviews (readable by everyone; needs no extra SQL). A failure here must not hide the followers.
  let likeRows=[];
  try{
   const mine=await F.get('/film_public_reviews?select=id,film_id,film_title&user_id=eq.'+ses.id+'&limit=200');
   reviewInfo=new Map(mine.map(r=>[Number(r.id),r]));
   if(mine.length){
    const ids=mine.map(r=>Number(r.id)).filter(Number.isSafeInteger).join(',');
    const lr=await F.get('/film_review_likes?select=review_id,user_id,created_at&review_id=in.('+ids+')&order=created_at.desc&limit=40');
    likeRows=lr.filter(l=>l.user_id!==ses.id).map(l=>({...l,follower_id:l.user_id,kind:'like'}));
   }
  }catch(e){likeRows=[];}
  items=[...rows,...likeRows].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,40);
  if(owner!==ses.id){owner=ses.id;if(!getSeen()){/* first time on this device: do not flash old followers as new */setSeen(items[0]?.created_at||new Date().toISOString());}}
  paint();
  if(!panel.hidden)render();
 }catch(e){/* offline or SQL not run: stay quiet */}
 busy=false;
}
async function render(){
 const F=window.filmFriends;const seen=getSeen();const mine=++renderSerial;
 panel.replaceChildren();
 const head=make('div','bellHead');head.appendChild(make('span','',T('🔔 اعلان‌ها','🔔 Notifications')));panel.appendChild(head);
 if(!items.length){panel.appendChild(make('div','bellEmpty',T('هنوز اعلانی نداری؛ دنبال‌کردن و لایک نظرها اینجا می‌آید.','Nothing yet: new followers and likes on your reviews show up here.')));return;}
 const pm=await F.getProfiles(items.map(i=>i.follower_id));
 if(mine!==renderSerial)return;
 for(const it of items.slice(0,12)){
  const p=pm.get(it.follower_id);
  const b=make('button','bellItem'+(it.kind==='like'?' isLike':'')+(seen&&it.created_at>seen?' fresh':''));b.type='button';
  const when=new Date(it.created_at).toLocaleDateString((typeof EN!=='undefined'&&EN)?'en-US':'fa-IR',{month:'short',day:'numeric'});
  const txt=make('span','');
  const who=p?.display_name||T('فیلم‌باز','Movie fan');
  if(it.kind==='like'){
   const rv=reviewInfo.get(Number(it.review_id));
   txt.append(make('b','',who),make('small','',T('نظر تو را پسندید','Liked your review')+(rv?.film_title?' · '+String(rv.film_title).slice(0,40):'')+' · '+when));
   const av=F.avatar(p,36);const wrap=make('span','bellAv');wrap.append(av,bellHeart());
   b.append(wrap,txt);
   b.onclick=()=>{close();if(rv)F.goToReview({id:rv.id,film_id:rv.film_id});else F.openProfile(it.follower_id);};
  }else{
   txt.append(make('b','',who),make('small','',T('تو را دنبال کرد · ','Followed you · ')+when));
   b.append(F.avatar(p,36),txt);
   b.onclick=()=>{close();F.openProfile(it.follower_id);};
  }
  panel.appendChild(b);
 }
}
async function open(){
 position();panel.hidden=false;btn.setAttribute('aria-expanded','true');
 await load();await render();
 // checking the bell clears the red badge (after the list has shown which ones are new)
 if(items[0])setSeen(items[0].created_at);paint();
}
function close(){panel.hidden=true;btn.setAttribute('aria-expanded','false');}
function markSeen(){if(!ready())return;if(items[0])setSeen(items[0].created_at);paint();}
function start(){
 build();paint();
 clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)load();},45000);
 load();
}
window.addEventListener('film-account-state',()=>{owner='';items=[];paint();setTimeout(load,300);setTimeout(load,2500);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('resize',()=>{if(!panel?.hidden)position();});
window.filmFollowBell={reload:load,markSeen};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
