/* Tools menu (right side): basic site settings only - language, theme, notifications, announcements,
 * background animation and a replay of the site tour. Preferences live in this browser (localStorage). */
(function(){
'use strict';
const drawer=document.getElementById('drawer'),host=document.getElementById('drawerSettings');
if(!drawer||!host||!document.getElementById('menuBtn'))return;
const isEN=typeof EN!=='undefined'&&EN;
const T=(fa,en)=>isEN?en:fa;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const KEY='film-site-prefs-v1';
const DEFAULTS={bell:true,ann:true,scenes:true};
let prefs={...DEFAULTS};
try{const p=JSON.parse(localStorage.getItem(KEY)||'{}');for(const k of Object.keys(DEFAULTS))if(typeof p[k]==='boolean')prefs[k]=p[k];}catch(e){}
const CLS={bell:'prefNoBell',ann:'prefNoAnn',scenes:'prefNoScenes'};
function apply(){for(const k of Object.keys(CLS))document.documentElement.classList.toggle(CLS[k],!prefs[k]);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}}
apply();

drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
drawer.setAttribute('aria-label',T('ابزارها و تنظیمات سایت','Tools & site settings'));
const dhead=drawer.querySelector('.dhead'),close=document.getElementById('drawerClose');
const title=document.getElementById('drawerTitle');
title.textContent=T('ابزارها','Tools');
const lead=el('p','drawerLead',T('تنظیمات پایهٔ سایت','Basic site settings'));
const wrap=el('div','drawerHeading');wrap.append(title,lead);dhead.replaceChildren(wrap,close);

function group(fa,en){const g=el('section','tsGroup');g.appendChild(el('h3','',T(fa,en)));host.appendChild(g);return g;}
function action(g,icon,fa,en,hintFa,hintEn,onClick,id){
  const b=el('button','tsRow');b.type='button';if(id)b.id=id;
  const t=el('span','tsText');t.append(el('b','',icon+' '+T(fa,en)));if(hintFa)t.append(el('small','',T(hintFa,hintEn)));
  b.append(t,el('span','tsGo','›'));b.addEventListener('click',onClick);g.appendChild(b);return b;
}
function toggle(g,key,fa,en,hintFa,hintEn){
  const b=el('button','tsRow tsSwitchRow');b.type='button';b.setAttribute('role','switch');
  const t=el('span','tsText');t.append(el('b','',T(fa,en)),el('small','',T(hintFa,hintEn)));
  const sw=el('span','tsSwitch');sw.appendChild(el('i'));
  b.append(t,sw);
  const paint=()=>b.setAttribute('aria-checked',String(prefs[key]));
  b.addEventListener('click',()=>{prefs[key]=!prefs[key];save();apply();paint();
    if(key==='scenes')window.dispatchEvent(new Event('resize'));});
  paint();g.appendChild(b);return b;
}

const look=group('ظاهر و زبان','Look & language');
action(look,'🎨','تم و رنگ‌بندی سایت','Theme & colours','انتخاب از بین پالت‌های رنگی','Pick a colour palette',()=>{close.click();document.getElementById('themeBtn').click();},'drawerThemeShortcut');
action(look,'🌐',isEN?'فارسی':'English',isEN?'Switch to Persian':'Switch to English',isEN?'':'زبان سایت را به انگلیسی ببر',isEN?'':'',()=>document.getElementById('langBtn').click(),'drawerLanguageShortcut');

const notif=group('اعلان‌ها','Notifications');
toggle(notif,'bell','اعلان‌های زنگوله','Bell notifications','دنبال‌کننده‌های تازه و لایک نظرهایت','New followers and likes on your reviews');
toggle(notif,'ann','اعلان‌های سایت','Site announcements','نوار اعلان مدیران بالای صفحه','The announcement bar at the top');

// real phone notifications (follow / like / role): switch + live hint
{
  const b=el('button','tsRow tsSwitchRow');b.type='button';b.id='drawerPush';b.setAttribute('role','switch');b.setAttribute('aria-checked','false');
  const tx=el('span','tsText');const ttl=el('b','',T('اعلان روی گوشی','Phone notifications'));const hint=el('small','','');tx.append(ttl,hint);
  const sw=el('span','tsSwitch');sw.appendChild(el('i'));b.append(tx,sw);notif.appendChild(b);
  const MSG={
    'on':['روشن است: دنبال‌کردن، لایک و نقش تازه را روی گوشی می‌بینی','On: follows, likes and new roles reach your phone'],
    'off':['خاموش؛ با زدن این دکمه روشن می‌شود','Off; tap to turn on'],
    'signin':['برای روشن کردن اول وارد حساب شو','Sign in first to turn this on'],
    'denied':['مرورگر اعلان‌ها را بسته؛ از تنظیمات سایت در مرورگر آزاد کن','Notifications are blocked; allow them in the browser site settings'],
    'need-install':['روی آیفون اول سایت را نصب کن (ابزارها ← نصب روی گوشی)، بعد این را روشن کن','On iPhone, install the site first (Tools → Install on your phone), then turn this on'],
    'unsupported':['این مرورگر اعلان گوشی را پشتیبانی نمی‌کند؛ Chrome را امتحان کن','This browser does not support phone notifications; try Chrome']
  };
  const paint=async()=>{const s=window.filmPush?await window.filmPush.state():'unsupported';b.setAttribute('aria-checked',String(s==='on'));b.dataset.state=s;hint.textContent=T(...(MSG[s]||MSG.off));};
  b.addEventListener('click',async()=>{
    const s=b.dataset.state;
    if(s==='need-install'){close.click();setTimeout(()=>window.filmInstall?.install?.(),250);return;}
    if(s==='on'){await window.filmPush.disable();}
    else if(s==='off'){hint.textContent=T('در حال روشن کردن…','Turning on…');const r=await window.filmPush.enable();
      if(r==='no-table')hint.textContent=T('مدیر سایت هنوز بخش اعلان را در دیتابیس راه نینداخته','The site admin has not set up notifications in the database yet');
      else if(r==='error')hint.textContent=T('روشن نشد؛ دوباره امتحان کن','Could not turn on; try again');
      if(r==='no-table'||r==='error')return;}
    paint();
  });
  paint();window.addEventListener('film-push-state',paint);
  new MutationObserver(paint).observe(drawer,{attributes:true,attributeFilter:['class']});
}

const show=group('نمایش','Display');
toggle(show,'scenes','پس‌زمینهٔ سینمایی متحرک','Animated cinema backgrounds','نور پروژکتور و صحنه‌های پشت صفحه‌ها','Projector light and scenes behind the pages');

const help=group('راهنما و تازه‌ها','Help & updates');
const upBtn=action(help,'✨','تازه‌های سایت','Site updates','آخرین به‌روزرسانی‌های مهم','The latest important updates',()=>{close.click();setTimeout(()=>window.filmUpdates?.open?.(),250);},'drawerUpdates');
const upDot=()=>{const b=upBtn.querySelector('b');b.querySelector('.suDot')?.remove();if(window.filmUpdates?.unseen?.()){const d=el('i','suDot');d.setAttribute('aria-label',T('جدید','New'));b.appendChild(d);}};
upDot();window.addEventListener('film-updates-state',upDot);new MutationObserver(upDot).observe(drawer,{attributes:true,attributeFilter:['class']});
const inst=action(help,'📲','نصب روی گوشی (مثل اپ)','Install on your phone','برای دریافت اعلان؛ سایت روی صفحهٔ اصلی گوشی','For notifications and quick access, on your home screen',()=>{close.click();setTimeout(()=>window.filmInstall?.install?.(),250);},'drawerInstall');
const instShow=()=>{inst.hidden=Boolean(window.filmInstall?.installed?.());};instShow();window.addEventListener('film-install-state',instShow);
action(help,'🧭','نمایش دوبارهٔ آموزش سایت','Replay the site tour','معرفی کوتاه بخش‌های سایت','A short intro to every section',()=>{
  close.click();setTimeout(()=>{try{window.filmTour?.start(true);}catch(e){}},250);
},'drawerTourReplay');

new MutationObserver(()=>document.body.classList.toggle('drawerOpen',drawer.classList.contains('open')))
  .observe(drawer,{attributes:true,attributeFilter:['class']});

// keep keyboard focus inside the open dialog
drawer.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!drawer.classList.contains('open'))return;
  const f=[...drawer.querySelectorAll('button:not([disabled])')].filter(x=>!x.closest('[hidden]')&&x.getClientRects().length>0);
  if(!f.length)return;
  if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}
  else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}
});
})();
