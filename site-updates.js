/* What's new: a short popup the first time someone opens the site after an update (they can close it and carry on),
 * plus a permanent "Site updates" list in the Tools menu. To announce an update, add an entry at the TOP of UPDATES
 * (new unique id) - only the main changes, a few short lines. Seen-state lives in this browser (localStorage). */
(function(){
'use strict';
const doc=document;
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};

/* newest first */
const UPDATES=[
 {id:'2026-11-25-b',date:'2026-11-25',
  fa:'تازه‌ها: راست‌کلیک، تم جدید و ابزارهای ساده‌تر',en:'New: right-click, a new theme and simpler tools',
  items:[
   ['🖱️','روی هر پوستر یا کارت فیلم راست‌کلیک کن تا با یک کلیک به «دیده‌شده‌ها» یا «خواهم دید» اضافه شود.','Right-click any film poster or card to add it to Watched or Want to watch in one click.'],
   ['🎨','تم تازهٔ «شفق سینمایی» پیش‌فرض شد و انتخاب تم با پیش‌نمایش رنگ‌ها زیباتر شد.','The new "Cinema Aurora" theme is now the default and the theme picker shows live previews.'],
   ['🧰','منوی «ابزارها» حالا تنظیمات پایهٔ سایت است: تم، زبان، اعلان‌ها و پس‌زمینهٔ متحرک.','The Tools menu now holds basic site settings: theme, language, notifications and animated backgrounds.'],
   ['🔔','وقتی منتقد یا مودریتور شوی، در زنگوله خبرت می‌کنیم. لایک‌ها هم دقیق‌تر نمایش داده می‌شوند.','You get a bell notification when you become a critic or moderator, and likes are shown more accurately.'],
   ['🧹','وارد کردن از Letterboxd برداشته شد؛ سایت خودش آرشیو کامل فیلم است.','Importing from Letterboxd was removed; the site is now a complete film archive on its own.']
  ]},
 {id:'2026-11-24-a',date:'2026-11-24',
  fa:'پنل کاربری، لایک و آموزش سایت',en:'User panel, likes and the site tour',
  items:[
   ['🎛️','«پنل کاربری»: با یک چرخ بین میز منتقد، میز مودریتور و پروفایلت جابه‌جا شو.','"User panel": a wheel to switch between your critic desk, moderator desk and profile.'],
   ['❤️','روی هر نظری می‌توانی قلب بزنی و صاحبش در زنگوله خبردار می‌شود.','You can heart any review and its author is notified in the bell.'],
   ['🧭','یک آموزش کوتاه برای آشنایی با بخش‌های سایت، فقط یک بار برای هر مرورگر.','A short tour of the site, shown only once per browser.'],
   ['🔤','فونت تازهٔ فارسی با خوانایی بهتر روی کامپیوتر و گوشی.','A new Persian font that is easier to read on desktop and phone.']
  ]}
];

const KEY='film-updates-seen-v1';
const getSeen=()=>{try{return localStorage.getItem(KEY)||'';}catch(e){return '';}};
const setSeen=v=>{try{localStorage.setItem(KEY,v);}catch(e){}};
const latest=()=>UPDATES[0].id;
const hasUnseen=()=>getSeen()!==latest();
const notify=()=>window.dispatchEvent(new CustomEvent('film-updates-state',{detail:{unseen:hasUnseen()}}));

let box=null,lastFocus=null;
function close(){
 if(!box)return;
 box.remove();box=null;setSeen(latest());notify();
 doc.removeEventListener('keydown',onKey,true);
 try{lastFocus?.focus?.({preventScroll:true});}catch(e){}
}
function onKey(e){
 if(!box)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
 else if(e.key==='Tab'){const f=[...box.querySelectorAll('button')];if(!f.length)return;const a=doc.activeElement;
  if(e.shiftKey&&a===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus();}}
}
const fmt=d=>{try{return new Date(d+'T12:00:00').toLocaleDateString(typeof EN!=='undefined'&&EN?'en-US':'fa-IR',{year:'numeric',month:'long',day:'numeric'});}catch(e){return d;}};

/* all=true: the whole history (Tools menu). all=false: only what this person has not seen yet (max 3). */
function open(all){
 if(box)return;
 const seen=getSeen();
 let list=UPDATES;
 if(!all){const i=UPDATES.findIndex(u=>u.id===seen);list=(i<0?UPDATES:UPDATES.slice(0,i)).slice(0,3);}
 if(!list.length)list=UPDATES.slice(0,1);
 lastFocus=doc.activeElement;
 box=make('div','suLayer');
 const card=make('div','suCard');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',T('تازه‌های سایت','Site updates'));
 const head=make('div','suHead');
 head.append(make('span','suSpark','✨'),make('h2','',all?T('تازه‌های سایت','Site updates'):T('چه چیزی تازه است؟','What’s new?')));
 const x=make('button','suX','✕');x.type='button';x.setAttribute('aria-label',T('بستن','Close'));x.onclick=close;head.appendChild(x);
 const body=make('div','suBody');
 list.forEach((u,i)=>{
  const sec=make('section','suItem'+(i===0?' first':''));
  const top=make('div','suTop');top.append(make('h3','',T(u.fa,u.en)),make('time','',fmt(u.date)));
  if(i===0&&!all)top.prepend(make('span','suNew',T('تازه','NEW')));
  sec.appendChild(top);
  const ul=make('ul','suList');
  for(const [icon,fa,en] of u.items){const li=make('li');li.append(make('span','suIcon',icon),make('span','',T(fa,en)));ul.appendChild(li);}
  sec.appendChild(ul);body.appendChild(sec);
 });
 const foot=make('div','suFoot');
 const ok=make('button','suOk',T('متوجه شدم، ادامه می‌دهم','Got it, continue'));ok.type='button';ok.onclick=close;foot.appendChild(ok);
 card.append(head,body,foot);box.appendChild(card);
 box.addEventListener('pointerdown',e=>{if(e.target===box)close();});
 doc.body.appendChild(box);doc.addEventListener('keydown',onKey,true);
 ok.focus({preventScroll:true});
}

/* show it automatically once the page has settled and nothing else is in the way */
let tries=0,timer=0;
function auto(){
 clearTimeout(timer);
 if(box||!hasUnseen())return;
 const tourDone=(()=>{try{return localStorage.getItem('film-site-tour-v1')==='1';}catch(e){return true;}})();
 if(!getSeen()&&!tourDone){setSeen(latest());notify();return;} // brand-new visitor: the site tour introduces everything
 const busy=doc.querySelector('dialog[open],.overlay.open,.stLayer,.fcMenu')||doc.body.classList.contains('roomFocus')||doc.body.classList.contains('cinema')||doc.getElementById('drawer')?.classList.contains('open');
 if(busy){if(++tries<12)timer=setTimeout(auto,3000);return;}
 open(false);
}
timer=setTimeout(auto,2600);
window.addEventListener('film-account-state',()=>{tries=0;clearTimeout(timer);timer=setTimeout(auto,2800);});
window.filmUpdates={open:()=>open(true),openNew:()=>open(false),unseen:hasUnseen,latestId:latest,count:UPDATES.length};
})();
