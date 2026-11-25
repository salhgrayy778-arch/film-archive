/* First-visit tour: a short spotlight walk-through of every section, shown ONCE per browser right after the person
 * is signed in (not on every login). The "done" flag lives in this browser's localStorage under TOUR_KEY.
 * Each step highlights one real button, draws an arrow to it and explains it in a single line. The last step has a
 * confirm button ("Got it"); "Skip" also counts as done. window.filmTour.start(true) replays it by hand. */
(function(){
'use strict';
const TOUR_KEY='film-site-tour-v1';
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const doc=document;
const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const ready=()=>typeof ses!=='undefined'&&ses&&typeof cloudReady!=='undefined'&&cloudReady;
let memoryDone=false;
const isDone=()=>{try{return localStorage.getItem(TOUR_KEY)==='1';}catch(e){return memoryDone;}};
const markDone=()=>{memoryDone=true;try{localStorage.setItem(TOUR_KEY,'1');}catch(e){}};

const STEPS=[
 {sel:'#tab-news',icon:'📰',fa:['اخبار سینما','آخرین اخبار و ترندهای سینمای جهان، هر روز تازه.'],en:['Cinema news','The latest news and trends from world cinema, fresh every day.']},
 {sel:'#tab-search',icon:'🔎',fa:['جستجوی فیلم','هر فیلمی را پیدا کن؛ صفحهٔ فیلم پوستر، خلاصه، بازیگران و نظرها را دارد.'],en:['Film search','Find any film; its page has the poster, story, cast and reviews.']},
 {sel:'#tab-dash',icon:'📊',fa:['داشبورد','فیلم‌های دیده‌شده، «می‌خواهم ببینم» و آمار تماشای تو.'],en:['Dashboard','Your watched films, watchlist and viewing stats.']},
 {sel:'#tab-diary',icon:'📔',fa:['دفترچه تماشا','یادداشت‌های شخصی‌ات دربارهٔ فیلم‌ها، فقط برای خودت.'],en:['Watch diary','Your private notes about films, just for you.']},
 {sel:'#tab-room',icon:'🎬',fa:['تماشای گروهی','با دوستت اتاق بساز و فیلم را همزمان ببینید.'],en:['Group watch','Create a room and watch a film in sync with a friend.']},
 {sel:'#addBtn',icon:'➕',fa:['اضافه کردن فیلم','یک فیلم را به آرشیوت اضافه کن. نکته: روی هر پوستر فیلم در سایت راست‌کلیک کن تا با یک کلیک به «دیده‌شده» یا «خواهم دید» برود.'],en:['Add a film','Add a film to your archive. Tip: right-click any film poster on the site to put it on Watched or Want to watch in one click.']},
 {sel:'#filmFriendsLaunch',icon:'👥',fa:['دوستان فیلم‌باز','فیلم‌بازها را دنبال کن و آخرین نظرها و امتیازهایشان را ببین.'],en:['Film friends','Follow other film fans and see their latest reviews and scores.']},
 {sel:'#bellBtn',icon:'🔔',fa:['اعلان‌ها','وقتی کسی تو را دنبال کند، نظرت را لایک کند یا نقش تازه‌ای (منتقد، مودریتور) بگیری، اینجا خبرت می‌کنیم.'],en:['Notifications','You are told here when someone follows you, likes your review or you get a new role (critic, moderator).']},
 {sel:'#panelDockBtn',icon:'🎛️',fa:['پنل کاربری','«پنل» یعنی صفحهٔ کارِ مخصوص نقش تو (میز منتقد، میز مودریتور، پروفایل). از اینجا با یک چرخ انتخاب کن.'],en:['User panel','A panel is the work page for your role (critic desk, moderator desk, profile). Pick your role panels (critic, moderator…) from a wheel here.']},
 {sel:'#acctBtn',icon:'👤',fa:['حساب من','پروفایل، عکس و تنظیمات حسابت.'],en:['My account','Your profile, photo and account settings.']},
 {sel:'#menuBtn',icon:'🧰',fa:['ابزارها','تنظیمات سایت: تم و رنگ‌بندی، زبان، اعلان‌ها و پس‌زمینهٔ متحرک.'],en:['Tools','Site settings: theme and colours, language, notifications and animated backgrounds.']}
];

let layer,ring,card,arrow,steps=[],idx=0,running=false,onKey,onResize,raf=0;
const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return r.width>4&&r.height>4&&cs.visibility!=='hidden'&&cs.display!=='none'&&el.offsetParent!==null||cs.position==='fixed'&&r.width>4;};

function arrowSvg(){
 const NS='http://www.w3.org/2000/svg';const s=doc.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 48 64');s.setAttribute('aria-hidden','true');
 const p=doc.createElementNS(NS,'path');p.setAttribute('d','M24 62V10M8 26 24 8l16 18');p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','6');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');
 s.appendChild(p);return s;
}
function build(){
 layer=make('div','stLayer');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',T('آموزش سایت','Site tour'));
 ring=make('div','stRing');arrow=make('div','stArrow');arrow.appendChild(arrowSvg());
 card=make('div','stCard');
 layer.append(ring,arrow,card);doc.body.appendChild(layer);
 // never a dead end: tapping the dimmed page outside the card ends the tour
 layer.addEventListener('pointerdown',e=>{if(!card.contains(e.target))finish();});
}
function finish(){
 markDone();running=false;
 doc.removeEventListener('keydown',onKey,true);removeEventListener('resize',onResize);removeEventListener('scroll',onResize,true);
 layer?.remove();layer=null;
}
function draw(){
 const s=steps[idx];if(!s)return;
 const el=doc.querySelector(s.sel);
 if(!visible(el)){go(1);return;}
 el.scrollIntoView({block:'center',inline:'center',behavior:'instant'in doc.documentElement.style?'instant':'auto'});
 place();
}
function place(){
 const s=steps[idx];if(!s||!layer)return;
 const el=doc.querySelector(s.sel);if(!el)return;
 const r=el.getBoundingClientRect();const pad=7;
 const vw=innerWidth,vh=innerHeight;
 ring.style.cssText=`left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;border-radius:${Math.min(18,(r.height+pad*2)/2)}px`;
 // text
 card.replaceChildren();
 const [title,text]=T(s.fa,s.en);
 const head=make('div','stHead');head.append(make('span','stIcon',s.icon),make('b','',title));
 const dots=make('div','stDots');steps.forEach((_,i)=>dots.appendChild(make('i',i===idx?'on':'')));
 const last=idx===steps.length-1;
 const skip=make('button','stBtn ghost',T('رد کردن','Skip'));skip.type='button';skip.onclick=finish;
 const back=make('button','stBtn ghost',T('قبلی','Back'));back.type='button';back.hidden=idx===0;back.onclick=()=>go(-1);
 const next=make('button','stBtn main',last?T('فهمیدم ✓','Got it ✓'):T('بعدی','Next'));next.type='button';next.onclick=()=>last?finish():go(1);
 const row=make('div','stRow');row.append(skip,make('span','stCount',(typeof fa==='function'&&!(typeof EN!=='undefined'&&EN)?fa(idx+1)+'/'+fa(steps.length):(idx+1)+'/'+steps.length)),back,next);
 card.append(head,make('p','',text),dots,row);
 // card position: below the target if there is room, else above; clamp to the screen
 const cw=Math.min(340,vw-24);card.style.width=cw+'px';
 const ch=card.offsetHeight||170;
 const below=r.bottom+pad+80+ch<vh||r.top<ch+90;
 let top=below?r.bottom+pad+66:r.top-pad-66-ch;
 top=Math.max(10,Math.min(vh-ch-10,top));
 let left=r.left+r.width/2-cw/2;left=Math.max(12,Math.min(vw-cw-12,left));
 card.style.top=top+'px';card.style.left=left+'px';
 // arrow between the card and the target, pointing at the target
 const ax=Math.max(24,Math.min(vw-24,r.left+r.width/2));
 arrow.style.left=(ax-24)+'px';
 if(below){arrow.style.top=(r.bottom+pad+4)+'px';arrow.classList.remove('down');}
 else{arrow.style.top=(r.top-pad-4-60)+'px';arrow.classList.add('down');}
 next.focus({preventScroll:true});
}
function go(d){
 idx+=d;
 if(idx>=steps.length){finish();return;}
 if(idx<0)idx=0;
 draw();
}
const zoomed=()=>{try{return (window.visualViewport?.scale||1)>1.05;}catch(e){return false;}};
function start(force){
 if(running)return;
 if(!force&&(zoomed()||doc.activeElement?.matches?.('input,textarea')))return;
 if(!force&&isDone())return;
 steps=STEPS.filter(s=>visible(doc.querySelector(s.sel)));
 if(steps.length<3)return;
 running=true;idx=0;build();
 onKey=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish();}
  else if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();go(1);}   // RTL-friendly: either direction moves on
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();go(-1);}
  else if(e.key==='Tab'){e.preventDefault();card.querySelector('.stBtn.main')?.focus();}
 };
 onResize=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(place);};
 doc.addEventListener('keydown',onKey,true);addEventListener('resize',onResize);addEventListener('scroll',onResize,true);
 draw();
}
/* Wait until the person is signed in, no dialog is open and the page has settled, then start (once per browser). */
let tries=0;
function maybeStart(){
 if(isDone()||running)return;
 if(!ready())return;
 if(doc.querySelector('dialog[open]')||doc.querySelector('.overlay.open')||doc.body.classList.contains('roomFocus')||doc.body.classList.contains('cinema'))return;
 setTimeout(()=>{if(!isDone()&&!running&&ready()&&!doc.querySelector('dialog[open]')&&!doc.querySelector('.overlay.open'))start(false);},1500);
}
window.addEventListener('film-account-state',()=>setTimeout(maybeStart,900));
const iv=setInterval(()=>{if(isDone()||++tries>40){clearInterval(iv);return;}maybeStart();},2500);
window.filmTour={start,isDone,reset:()=>{try{localStorage.removeItem(TOUR_KEY);}catch(e){}memoryDone=false;}};
})();
