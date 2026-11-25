/* Animated backgrounds — a different "film world" behind every section of the site.
 *
 *   news     Premiere Night   searchlights and camera flashes        (red-carpet premieres, newsreels)
 *   search   Sweeping Projector  a lamp scanning the dark hall, reel, frames (Cinema Paradiso, Hugo)
 *   film     Silver Screen    projector cone, film-leader countdown, light leaks (the cinema itself)
 *   diary    Projection Booth projector beam, dust, scrolling film   (Cinema Paradiso, Hugo, Amélie)
 *   dash     Stage Lights     two crossing spotlights over a hazy stage    (Broadway / Hollywood stage)
 *   room     Grand Theatre    swaying curtains, spotlights, popcorn  (Singin' in the Rain, Moulin Rouge)
 *   friends  Lantern Night    rising lanterns, fireflies             (Tangled, La La Land, Spirited Away)
 *   critic   Walk of Fame     falling golden stars                   (the Oscars)
 *   staff    Control Room     falling code, radar sweep              (WarGames, The Matrix)
 *
 * Everything is original abstract artwork drawn with CSS: no images, no downloads, no copyrighted characters.
 * Only transform/opacity are animated (GPU-friendly); animations pause when the tab is hidden or a dialog covers
 * the page, and stop for visitors who prefer reduced motion (film-scenes.css). The scene follows the colour theme. */
(function(){
'use strict';
const doc=document,root=doc.documentElement;
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function el(tag,cls,style,parent){const e=doc.createElement(tag);if(cls)e.className=cls;if(style)e.style.cssText=style;if(parent)parent.appendChild(e);return e;}
const px=(n,d=1)=>(Math.round(n*10**d)/10**d);

const BUILD={
 news(box,r){
  el('div','sc-glow',null,box);
  [[10,'-26deg','26deg',17,0],[50,'-34deg','30deg',23,-6],[90,'-24deg','28deg',19,-11],[30,'-20deg','35deg',29,-3]].forEach(([x,a,b,d,w],i)=>{
   const beam=el('div','news-beam'+(i===3?' lite':''),`--x:${x}%;--a:${a};--b:${b};--d:${d}s;--w:${w}s`,box);
   el('i','',null,beam);
  });
  for(let i=0;i<16;i++)el('i','news-flash'+(i>9?' lite':''),`--x:${px(r()*100)}%;--y:${px(50+r()*46)}%;--s:${px(10+r()*16)}px;--d:${px(3+r()*7)}s;--w:-${px(r()*9)}s`,box);
  el('div','news-tape t1',null,box);el('div','news-tape t2',null,box);
 },
 search(box,r){
  el('div','sc-glow',null,box);
  const b1=el('div','sw-beam',null,box);el('i','',null,b1);
  const b2=el('div','sw-beam thin',null,box);el('i','',null,b2);
  el('div','sw-reel',null,box);
  for(let i=0;i<5;i++)el('i','sw-frame'+(i>2?' lite':''),`--x:${px(18+r()*66)}%;--y:${px(30+r()*50)}%;--s:${px(70+r()*60,0)}px;--d:${px(16+r()*10)}s;--w:-${px(r()*20)}s;--dx:${px(-40+r()*80)}px`,box);
  for(let i=0;i<30;i++)el('i','scr-dust'+(i>18?' lite':''),`--x:${px(6+r()*88)}%;--y:${px(r()*100)}%;--s:${px(1.5+r()*3.5)}px;--d:${px(14+r()*18)}s;--w:-${px(r()*30)}s;--dx:${px(-30+r()*60)}px`,box);
 },
 film(box,r){
  el('div','sc-glow',null,box);
  el('div','scr-cone',null,box);
  for(let i=0;i<14;i++)el('i','scr-dust'+(i>7?' lite':''),`--x:${px(20+r()*60)}%;--y:${px(r()*100)}%;--s:${px(1.5+r()*2.5)}px;--d:${px(16+r()*18)}s;--w:-${px(r()*30)}s;--dx:${px(-24+r()*48)}px`,box);
 },
 diary(box,r){
  el('div','sc-glow',null,box);
  el('div','booth-cone',null,box);
  for(let i=0;i<34;i++)el('i','booth-dust'+(i>20?' lite':''),`--x:${px(8+r()*84)}%;--y:${px(r()*100)}%;--s:${px(1.5+r()*3.5)}px;--d:${px(14+r()*18)}s;--w:-${px(r()*30)}s;--dx:${px(-30+r()*60)}px`,box);
  [['left',34],['right',-26]].forEach(([side,off],i)=>{
   const strip=el('div','booth-strip '+side,null,box);
   el('div','run'+(i?' rev':''),null,strip);
  });
 },
 dash(box,r){
  /* the calmest scene: one soft light from above and a few slow dust specks, nothing else */
  el('div','sc-glow',null,box);
  const beam=el('div','stg-beam c',`--a:-4deg;--b:4deg;--d:26s;--w:0s`,box);el('i','',null,beam);
  for(let i=0;i<10;i++)el('i','stg-dust'+(i>5?' lite':''),`--x:${px(25+r()*50)}%;--y:${px(r()*100)}%;--s:${px(1.5+r()*2)}px;--d:${px(18+r()*18)}s;--w:-${px(r()*30)}s;--dx:${px(-20+r()*40)}px`,box);
 },
 room(box,r){
  el('div','sc-glow',null,box);
  el('div','hall-spot a',null,box);el('div','hall-spot b',null,box);
  ['left','right'].forEach(side=>{const c=el('div','hall-curtain '+side,null,box);el('i','',null,c);});
  for(let i=0;i<18;i++)el('i','hall-corn'+(i>10?' lite':''),`--x:${px(6+r()*88)}%;--s:${px(9+r()*11)}px;--d:${px(13+r()*14)}s;--w:-${px(r()*26)}s;--dx:${px(-40+r()*80)}px;--rot:${px(-200+r()*400,0)}deg`,box);
  const crowd=el('div','hall-crowd',null,box);
  for(let i=0;i<22;i++)el('i','',`--d:${px(3+r()*3)}s;--w:-${px(r()*5)}s;--h:${px(26+r()*20,0)}px;--w2:${px(34+r()*26,0)}px;margin-inline-start:${px(-10+r()*6,0)}px`,crowd);
 },
 friends(box,r){
  el('div','sc-glow',null,box);
  for(let i=0;i<22;i++)el('i','lan-star'+(i>12?' lite':''),`--x:${px(r()*100)}%;--y:${px(r()*60)}%;--s:${px(1.5+r()*2.5)}px;--d:${px(2+r()*5)}s;--w:-${px(r()*6)}s`,box);
  for(let i=0;i<12;i++)el('i','lan-lantern'+(i>7?' lite':''),`--x:${px(4+r()*92)}%;--s:${px(20+r()*26,0)}px;--d:${px(22+r()*18)}s;--w:-${px(r()*34)}s;--dx:${px(-26+r()*52)}px`,box);
  for(let i=0;i<18;i++)el('i','lan-fly'+(i>9?' lite':''),`--x:${px(r()*100)}%;--y:${px(40+r()*55)}%;--d:${px(7+r()*9)}s;--w:-${px(r()*14)}s;--dx:${px(-50+r()*100)}px;--dy:${px(-60+r()*40)}px`,box);
 },
 critic(box,r){
  el('div','sc-glow',null,box);
  el('div','fame-spot',null,box);
  for(let i=0;i<20;i++)el('i','fame-star'+(i>11?' lite':''),`--x:${px(r()*100)}%;--s:${px(12+r()*22,0)}px;--d:${px(12+r()*12)}s;--w:-${px(r()*24)}s;--dx:${px(-30+r()*60)}px;--rot:${px(180+r()*360,0)}deg`,box);
 },
 staff(box,r){
  el('div','sc-glow',null,box);
  el('div','ctl-radar',null,box);
  const glyphs='01アイウエオカキクケコ0123456789';
  for(let i=0;i<22;i++){
   let t='';const n=14+Math.floor(r()*10);for(let k=0;k<n;k++)t+=glyphs[Math.floor(r()*glyphs.length)]+'\n';
   const c=el('i','ctl-col'+(i>12?' lite':''),`--x:${px(i*4.7+r()*2)}%;--d:${px(9+r()*9)}s;--w:-${px(r()*16)}s;--o:${px(.25+r()*.5,2)}`,box);
   c.textContent=t;
  }
 }
};

const built=new Map();
function make(name,inDialog){
 const box=el('div','sc sc-'+name);
 BUILD[name](box,rng(name.split('').reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)));
 box.setAttribute('aria-hidden','true');
 return box;
}

/* ----- page background ----- */
let host=null,active='',hideTimer=0;
function ensureHost(){
 if(host)return host;
 host=el('div','');host.id='filmScene';host.setAttribute('aria-hidden','true');
 doc.body.insertBefore(host,doc.body.firstChild);return host;
}
function show(name){
 if(!BUILD[name]||name===active)return;
 const h=ensureHost();
 let incoming=built.get(name);
 if(!incoming){incoming=make(name);built.set(name,incoming);h.appendChild(incoming);}
 const outgoing=built.get(active);
 incoming.style.display='block';
 void incoming.offsetWidth; // let the browser register display:block before the fade starts
 incoming.classList.add('on');
 if(outgoing){
  outgoing.classList.remove('on');
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>{if(active!==outgoing.dataset.name)outgoing.style.display='none';},1100);
 }
 incoming.dataset.name=name;
 active=name;root.dataset.scene=name;
}
const VIEWS=[['cinemaNews','news'],['filmSearchView','search'],['filmDetailView','film'],['dashboard','dash'],['diary','diary'],['room','room']];
function sync(){
 for(const [id,scene] of VIEWS){const v=doc.getElementById(id);if(v&&!v.hidden){show(scene);return;}}
}

/* ----- backgrounds inside dialogs (friends, critic desk, staff panel) ----- */
const DIALOGS={filmFriendsDialog:'friends',criticDialog:'critic',adminDialog:'staff'};
function mountDialog(d){
 const name=DIALOGS[d.id];if(!name||d.dataset.scene)return;
 d.dataset.scene=name;
 const wrap=el('div','sceneIn');const box=make(name);box.classList.add('on');box.style.display='block';wrap.appendChild(box);
 d.insertBefore(wrap,d.firstChild);
}
function scanDialogs(){Object.keys(DIALOGS).forEach(id=>{const d=doc.getElementById(id);if(d)mountDialog(d);});}

function start(){
 ensureHost();sync();scanDialogs();
 const main=doc.querySelector('main')||doc.body;
 new MutationObserver(sync).observe(main,{attributes:true,attributeFilter:['hidden'],subtree:true});
 new MutationObserver(scanDialogs).observe(doc.body,{childList:true});
 doc.addEventListener('visibilitychange',()=>root.classList.toggle('sceneIdle',doc.hidden));
 addEventListener('popstate',()=>setTimeout(sync,0));
}
window.filmScenes={show,sync,scenes:Object.keys(BUILD),active:()=>active};
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();
})();
