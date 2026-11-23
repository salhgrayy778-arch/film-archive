/* My Film Archive: Persian news translation and section-by-section language toggles.
 * Titles/short RSS excerpts are pre-translated by a scheduled GitHub Action,
 * so this UI only requests same-origin published JSON. Full articles stay linked.
 */
(function(){
'use strict';
const root=document.getElementById('cinemaNews');
if(!root)return;
const T=(fa,en)=>typeof EN!=='undefined'&&EN?en:fa;
const base=new URL('.',document.currentScript?.src||document.baseURI);
const sections=[
 {key:'news',heading:'cnNewsHeading',feed:'cnNewsFeed'},
 {key:'now',heading:'cnNowHeading',feed:'cnNowPlaying'},
 {key:'soon',heading:'cnUpcomingHeading',feed:'cnUpcoming'},
 {key:'trends',heading:'cnTrendHeading',feed:'cnTrending'}
];
const state=Object.fromEntries(sections.map(x=>[x.key,false]));
let snapshot=null,catalog=null,loading=null,updatedAt=0;
const safeText=x=>String(x??'').slice(0,1200);
const persian=s=>/[\u0600-\u06ff]/.test(String(s||''));
const standardURL=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'';}catch(e){return '';}};
function notices(button,message){
  button.title=message;
  button.setAttribute('aria-label',message);
}
function updateButtons(){
  for(const x of sections){
    const btn=document.getElementById('cnTranslate-'+x.key);
    if(!btn)continue;
    btn.setAttribute('aria-pressed',String(state[x.key]));
    btn.textContent=state[x.key]?T('↩ متن اصلی','↩ Original'):T('ترجمه فارسی','Persian translation');
    notices(btn,state[x.key]?T('بازگشت به عنوان انگلیسی و متن اصلی','Restore original-language titles'):T('نمایش ترجمه فارسی موجود در آرشیو سایت','Show cached Persian translations'));
  }
}
function installControls(){
 for(const item of sections){
  const heading=document.getElementById(item.heading);
  const bar=heading?.closest('.cn-heading');
  if(!bar||document.getElementById('cnTranslate-'+item.key))continue;
  const actions=document.createElement('div');
  actions.className='cnHeadingActions';
  // Retain the publisher and TMDB links beside the translate control.
  [...bar.children].filter(x=>x.tagName==='A').forEach(x=>actions.appendChild(x));
  const button=document.createElement('button');
  button.id='cnTranslate-'+item.key;
  button.type='button';
  button.className='cnTranslateBtn';
  button.dataset.translateSection=item.key;
  actions.appendChild(button);
  bar.appendChild(actions);
  button.addEventListener('click',()=>{
    state[item.key]=!state[item.key];
    updateButtons();
    apply(item.key);
  });
 }
 updateButtons();
}
async function fetchTranslationData(){
 if(loading&&Date.now()-updatedAt<7*60000)return loading;
 updatedAt=Date.now();
 loading=(async()=>{
  const url=new URL('data/home-feed.json',base);
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('News snapshot HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.news)||!data.movies)throw Error('Invalid news snapshot');
  snapshot=data;
  const catalogUrl=new URL('data/tmdb-catalog.json',base);
  try{
   const response=await fetch(catalogUrl,{cache:'default'});
   if(response.ok){
    const result=await response.json();
    if(Array.isArray(result.movies))catalog=new Map(result.movies.filter(x=>x?.id>0).map(x=>[x.id,x]));
   }
  }catch(error){ /* Movie translations are optional; news remains usable. */ }
  return data;
 })().catch(e=>{
   console.warn('Offline translations are unavailable',e);
   loading=null;
   return null;
 });
 return loading;
}
function resetOrAddSummary(info,english,fa,translated){
  let brief=info.querySelector('.cnNewsSummary');
  const val=translated && fa?safeText(fa):safeText(english);
  if(!val){if(brief)brief.remove();return;}
  if(!brief){
   brief=document.createElement('p');
   brief.className='cnNewsSummary';
   brief.dir='auto';
   const meta=info.querySelector('.cn-news-meta');
   if(meta)info.insertBefore(brief,meta);
   else info.appendChild(brief);
  }
  brief.textContent=val;
}
function applyNews(){
 const items=new Map((snapshot?.news||[]).map(x=>[standardURL(x.url),x]));
 const wants=state.news, cards=document.querySelectorAll('#cnNewsFeed .cn-news-card');
 let translatedCount=0;
 for(const card of cards){
  const link=card.querySelector('a[href]');
  const article=items.get(standardURL(link?.href));
  if(!article)continue;
  const translated=wants && persian(article.title_fa) && article.title_source_for_fa===article.title;
  const title=card.querySelector('h4');
  if(!title)continue;
  title.textContent=translated?article.title_fa:article.title;
  title.dir=translated?'rtl':'auto';
  const info=card.querySelector('.cn-news-info');
  if(info)resetOrAddSummary(info,article.summary,article.summary_fa,translated);
  let badge=info?.querySelector('.cnTranslationBadge');
  if(translated){
   translatedCount++;
   if(!badge){badge=document.createElement('span');badge.className='cnTranslationBadge';badge.textContent=T('ترجمه ماشینی','Machine translation');info.appendChild(badge);}
  }else if(badge)badge.remove();
 }
 const btn=document.getElementById('cnTranslate-news');
 if(wants&&btn){
  notices(btn,translatedCount
    ?T('نمایش '+translatedCount+' عنوان ترجمه‌شده؛ برای بازگشت به متن اصلی دوباره بزن','Showing '+translatedCount+' translated headlines; tap again for originals')
    :T('ترجمه فارسی هنوز منتشر نشده؛ متن اصلی حفظ شده است','Persian translations are not published yet; original text is preserved'));
 }
}
function applyMovies(section){
 const name=section.key;
 const cardList=document.querySelectorAll('#'+section.feed+' .cn-film-card');
 const items=new Map((snapshot?.movies?.[name]||[]).map(x=>[x.id,x]));
 for(const card of cardList){
  const id=Number(card.querySelector('[data-film-id]')?.dataset.filmId);
  const movie=items.get(id);
  if(!movie)continue;
  const fallback=catalog?.get(id);
  const fa=movie.fa_title||fallback?.fa_title||'';
  const displayed=state[name]&&persian(fa)?fa:(movie.title||movie.original_title);
  const title=card.querySelector('h4');
  if(title){title.textContent=safeText(displayed);title.dir=state[name]&&persian(fa)?'rtl':'auto';}
 }
}
function apply(key){
 if(!snapshot)return;
 if(key==='news')applyNews();
 else{
  const section=sections.find(x=>x.key===key);
  if(section)applyMovies(section);
 }
}
function applyAll(){
 for(const x of sections)apply(x.key);
}
installControls();
const watched=sections.map(x=>document.getElementById(x.feed)).filter(Boolean);
for(const element of watched){
 const obs=new MutationObserver(()=>{if(!snapshot){fetchTranslationData().then(applyAll);}else applyAll();});
 obs.observe(element,{childList:true});
}
document.getElementById('cnRefresh')?.addEventListener('click',()=>{
 // Same-site data refresh is asynchronous; the observer re-applies the selected locale.
 loading=null;updatedAt=0;
 setTimeout(()=>fetchTranslationData().then(applyAll),750);
});
fetchTranslationData().then(applyAll);
})();
