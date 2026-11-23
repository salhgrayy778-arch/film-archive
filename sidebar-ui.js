/* My Film Archive sidebar: purpose-based tools, accessible navigation,
   bilingual text, fixed right-side presentation independent of RTL/LTR. */
(function(){
'use strict';
const drawer=document.getElementById('drawer');
if(!drawer||!document.getElementById('menuBtn'))return;
const isEN=typeof EN!=='undefined'&&EN;
const T=(fa,en)=>isEN?en:fa;
const el=(name,cls,text)=>{
  const node=document.createElement(name);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const svg=icon=>{
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('class','ic');s.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href','#'+icon);s.appendChild(use);return s;
};

const dhead=drawer.querySelector('.dhead');
const title=document.getElementById('drawerTitle');
const close=document.getElementById('drawerClose');
const importBlock=drawer.querySelector(':scope > section.backup');
const settings=drawer.querySelector(':scope > section.settingsGroup');
const blocks=settings?[...settings.querySelectorAll(':scope > section.backup')]:[];
if(!dhead||!title||!close||!importBlock||blocks.length!==3)return;
const [backupBlock,posterBlock,tmdbBlock]=blocks;

// Retain the existing sections and input IDs; moving DOM nodes keeps their
// already-bound event handlers for Letterboxd, backups, posters and TMDB.
drawer.setAttribute('role','dialog');
drawer.setAttribute('aria-modal','true');
drawer.setAttribute('aria-label',T('ابزارها و تنظیمات My Film Archive','My Film Archive tools and settings'));
const headingWrap=el('div','drawerHeading');
const brand=el('div','drawerBrand','MY FILM ARCHIVE');
const heading=el('h2','',T('ابزارها و تنظیمات','Tools & Settings'));
heading.id='drawerTitle';
title.removeAttribute('id');
const lead=el('p','drawerLead',T('همهٔ امکانات، منظم و در دسترس','Everything you need, in one place'));
headingWrap.append(brand,heading,lead);
dhead.replaceChildren(headingWrap,close);

const groups=el('div','drawerGroups');
function createGroup(id,fa,en,subFa,subEn,icon,open=false){
  const details=el('details','drawerGroup');
  details.id=id;details.open=open;
  const summary=el('summary');
  const iconBox=el('span','drawerGroupIcon');
  iconBox.appendChild(svg(icon));
  const texts=el('span','drawerSummaryCopy');
  const head=el('strong','',T(fa,en));
  const sub=el('small','',T(subFa,subEn));
  texts.append(head,sub);summary.append(iconBox,texts);
  const content=el('div','drawerGroupContent');
  details.append(summary,content);
  groups.appendChild(details);
  return {details,content,summary};
}
const navigation=createGroup('drawerNavigation', 'دسترسی سریع','Quick navigation',
  'چهار صفحه اصلی سایت','The four main pages','i-menu',true);
const dataGroup=createGroup('drawerDataGroup','ورود، خروجی و پشتیبان','Import, export & backups',
  'Letterboxd و ذخیرهٔ اطلاعات','Letterboxd and data safety','i-file');
const moviesGroup=createGroup('drawerMoviesGroup','پوستر و اطلاعات فیلم','Posters & movie details',
  'دریافت پوستر و اتصال به TMDB','Artwork and TMDB connection','i-film');
const personalize=createGroup('drawerPersonalizeGroup','ظاهر و لینک سایت','Appearance & site link',
  'تم، زبان و اشتراک‌گذاری','Themes, language and sharing','i-link');

const links=[
  {id:'news',icon:'i-film',fa:'اخبار سینمای جهان',en:'Cinema news'},
  {id:'dash',icon:'i-menu',fa:'داشبورد',en:'Dashboard'},
  {id:'diary',icon:'i-file',fa:'دفترچه تماشا',en:'Watch diary'},
  {id:'room',icon:'i-clap',fa:'تماشای گروهی',en:'Group watch'}
];
const navList=el('div','drawerNavList');
for(const item of links){
  const button=el('button','drawerNavButton');
  button.type='button';button.dataset.drawerTab=item.id;
  button.append(svg(item.icon),el('span','',T(item.fa,item.en)));
  navList.appendChild(button);
}
navigation.content.append(navList);
const updateNav=()=>{
  let tab='news';try{if(typeof state!=='undefined')tab=state.tab;}catch(e){}
  navList.querySelectorAll('button[data-drawer-tab]').forEach(b=>{
    if(b.dataset.drawerTab===tab)b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
};
navList.addEventListener('click',e=>{
  const b=e.target.closest('button[data-drawer-tab]');
  if(!b)return;
  const target=document.getElementById('tab-'+b.dataset.drawerTab);
  if(!target)return;
  target.click();document.getElementById('drawerClose').click();
  updateNav();
});

// Preserves all original operations without duplicating listeners.
dataGroup.content.append(importBlock,backupBlock);
moviesGroup.content.append(posterBlock,tmdbBlock);
settings.remove();

const actions=el('div','drawerActionRows');
const themeButton=el('button','drawerActionButton',T('🎨 تغییر تم','🎨 Change theme'));
themeButton.id='drawerThemeShortcut';themeButton.type='button';
themeButton.addEventListener('click',()=>{
  document.getElementById('drawerClose').click();
  document.getElementById('themeBtn').click();
});
const languageButton=el('button','drawerActionButton',T('🌐 English','🌐 فارسی'));
languageButton.id='drawerLanguageShortcut';languageButton.type='button';
languageButton.setAttribute('aria-label',T('تغییر زبان سایت به انگلیسی','Switch site language to Persian'));
languageButton.addEventListener('click',()=>document.getElementById('langBtn').click());
actions.append(themeButton,languageButton);
personalize.content.append(actions);

const linkLabel=el('label','drawerSiteLink',T('آدرس فعلی سایت','Current website address'));
linkLabel.setAttribute('for','drawerSiteLinkField');
const linkRow=el('div','drawerLinkRow');
const linkInput=el('input');
linkInput.id='drawerSiteLinkField';linkInput.type='text';linkInput.readOnly=true;
linkInput.dir='ltr';linkInput.setAttribute('aria-label',T('نشانی قابل اشتراک سایت','Shareable website URL'));
const copyBtn=el('button','btn primary',T('کپی لینک','Copy link'));
copyBtn.id='drawerCopySiteLink';copyBtn.type='button';
const shareBtn=el('button','btn',T('اشتراک','Share'));
shareBtn.id='drawerShareSiteLink';shareBtn.type='button';
linkRow.append(linkInput,copyBtn);
const feedback=el('p','drawerLinkStatus');
feedback.id='drawerLinkStatus';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
const info=el('p','drawerInfo',T(
  'لینک از آدرس واقعی سایت ساخته می‌شود و با تغییر نشانی انتشار، خودکار به‌روز خواهد شد.',
  'The link uses the live published address and automatically follows future hosting changes.'
));
personalize.content.append(linkLabel,linkRow,shareBtn,feedback,info);
shareBtn.style.marginTop='8px';
shareBtn.style.width='100%';

const currentUrl=()=>{
  if(!/^https?:$/.test(location.protocol))return '';
  return location.origin+location.pathname.replace(/\/index\.html$/i,'/');
};
const url=currentUrl();
linkInput.value=url||T('بعد از انتشار سایت فعال می‌شود','Available after publishing');
copyBtn.disabled=!url;
shareBtn.disabled=!url;
if(!url)feedback.textContent=T('در حالت فایل محلی، لینک عمومی وجود ندارد.','A local file does not have a public link.');

copyBtn.addEventListener('click',async()=>{
  if(!url)return;
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);}
    else{
      linkInput.focus();linkInput.select();
      if(!document.execCommand('copy'))throw Error('Clipboard unavailable');
    }
    feedback.textContent=T('لینک My Film Archive کپی شد.','My Film Archive link copied.');
  }catch(error){
    feedback.textContent=T('کپی خودکار ممکن نشد؛ لینک را انتخاب و دستی کپی کن.','Could not copy automatically; select the URL and copy manually.');
    linkInput.focus();linkInput.select();
  }
});
shareBtn.addEventListener('click',async()=>{
  if(!url)return;
  const title='My Film Archive';
  const text=T('اخبار سینمای جهان، آرشیو شخصی و تماشای گروهی','World cinema news, a personal film archive and group watch');
  if(navigator.share){
    try{await navigator.share({title,text,url});return;}
    catch(error){if(error?.name==='AbortError')return;}
  }
  copyBtn.click();
});

drawer.appendChild(groups);
// On the empty dashboard, "Import from Letterboxd" opens the matching section
// before the app's existing click listener tries to focus the import button.
document.addEventListener('click',e=>{
  if(e.target.closest('#firstImport'))dataGroup.details.open=true;
},true);

const syncDrawerState=()=>{
  const open=drawer.classList.contains('open');
  document.body.classList.toggle('drawerOpen',open);
  if(open)updateNav();
};
new MutationObserver(syncDrawerState).observe(drawer,{attributes:true,attributeFilter:['class']});
syncDrawerState();
document.getElementById('menuBtn').addEventListener('click',updateNav);

// Maintain keyboard focus inside the open modal drawer.
drawer.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!drawer.classList.contains('open'))return;
  const focusable=[...drawer.querySelectorAll('button:not([disabled]),input:not([disabled]),summary,a[href]')]
    .filter(x=>!x.hidden && x.getClientRects().length>0 &&
      (x.matches('summary')||!x.closest('details:not([open])')));
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
})();
