/* My Film Archive: same-origin TMDB search and shareable movie pages.
   Live TMDB requests are optional; the local catalog and official posters work without VPN. */
(function(){
'use strict';
const $=id=>document.getElementById(id),L=(fa,en)=>LX(fa,en);
const BASE=new URL('.',document.currentScript?.src||document.baseURI);
const GENRES={18:'درام',35:'کمدی',80:'جنایی و معمایی',9648:'جنایی و معمایی',53:'جنایی و معمایی',27:'ترسناک',878:'علمی‌تخیلی',14:'علمی‌تخیلی',28:'اکشن',12:'اکشن',10749:'عاشقانه',99:'مستند',16:'انیمیشن',36:'تاریخی و جنگی',10752:'تاریخی و جنگی'};
let catalog=[],catalogPromise=null,catalogFailed=false,catalogLoaded=false,featuredPromise=null,featured=new Map(),extra=new Map();
let query='',limit=30,current=null,showFa=false,watchOpen=false,loadSerial=0,remoteBusy=false,searchTimer=0,quickTimer=0;
let returnTab='search';

/* Sharded, VPN-free complete-title layer from TMDB's official daily export.
 * The source has IDs, original titles and popularity only. Detail metadata
 * and original posters are still served from the curated local movie cache.
 * No live TMDB request is required to search or view a title-only movie.
 */
let universeManifest=null,universeManifestTask=null;
const universeBuckets=new Map(),universeTasks=new Map();
const universeIds=new Map(),universeIdTasks=new Map();
const UNIVERSE_CACHE_LIMIT=3;
function universeBucket(text){
 const word=normalize(text).split(' ').find(Boolean);
 if(!word)return '';
 const cp=word.codePointAt(0);
 const ch=word[0];
 if(/[a-z0-9]/.test(ch)&&ch.length===1)return ch;
 const count=universeManifest?.unicode_shards||24;
 return 'u-'+String(cp%count).padStart(2,'0');
}
async function getUniverseManifest(){
 if(universeManifestTask)return universeManifestTask;
 universeManifestTask=(async()=>{
  const response=await fetch(new URL('data/tmdb-universe/manifest.json',BASE),{cache:'default'});
  if(!response.ok)throw Error('Full movie index not built yet');
  const manifest=await response.json();
  if(manifest.schema_version!==1||!Number.isSafeInteger(manifest.movie_count)
     ||!Number.isSafeInteger(manifest.id_shards)||manifest.movie_count<100000)
    throw Error('Unrecognized TMDB full index manifest');
  universeManifest=manifest;
  const hero=$('filmSearchView').querySelector('.filmSearchHero p');
  if(hero){
   hero.textContent=L(
    'جستجو میان '+manifest.movie_count.toLocaleString('fa-IR')+' عنوان فیلم از TMDB. پوستر و اطلاعات کامل برای فیلم‌های منتخب ذخیره شده‌اند.',
    'Search '+manifest.movie_count.toLocaleString('en-US')+' TMDB movie titles. Posters and full details are cached for selected films.');
  }
  return manifest;
 })().catch(error=>{
  console.warn('Comprehensive TMDB title index unavailable',error);
  return null;
 });
 return universeManifestTask;
}
async function readGzippedIndex(relative){
 if(typeof DecompressionStream!=='function')throw Error('Browser does not support gzip decompression');
 const response=await fetch(new URL('data/tmdb-universe/'+relative,BASE),{cache:'default'});
 if(!response.ok||!response.body)throw Error('Movie title shard HTTP '+response.status);
 const decoded=new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
 const result=await decoded.json();
 if(!Array.isArray(result))throw Error('Unexpected TMDB title shard');
 return result;
}
function compactMovie(row){
 if(!Array.isArray(row)||!idNumber(row[0])||typeof row[1]!=='string')return null;
 const name=row[1].slice(0,240);
 if(!name)return null;
 return {id:Number(row[0]),title:name,original_title:name,popularity:Number(row[2])||0,
  poster_url:'',overview:'',genre_ids:[],_source:'universe'};
}
function cacheIndex(map,key,value){
 if(map.size>=UNIVERSE_CACHE_LIMIT)map.delete(map.keys().next().value);
 map.set(key,value);
}
async function loadUniverseBucket(term){
 const manifest=await getUniverseManifest();
 const key=universeBucket(term);
 if(!manifest){
  // No index yet? Cache the unavailable state for this page load so a
  // search does not recursively schedule unlimited failed HTTP requests.
  if(key)cacheIndex(universeBuckets,key,[]);
  return [];
 }
 if(!key||!Object.prototype.hasOwnProperty.call(manifest.search_buckets||{},key))return [];
 if(universeBuckets.has(key))return universeBuckets.get(key);
 if(universeTasks.has(key))return universeTasks.get(key);
 const task=readGzippedIndex('search/'+key+'.json.gz')
  .then(rows=>{
   const entries=rows.map(compactMovie).filter(Boolean);
   cacheIndex(universeBuckets,key,entries);
   return entries;
  }).catch(error=>{
   console.warn('Movie title search shard unavailable',key,error);
   // Remember a failure for this page load; otherwise the UI can enter an
   // infinite fetch -> render -> fetch loop when one shard is unavailable.
   cacheIndex(universeBuckets,key,[]);
   return [];
  }).finally(()=>universeTasks.delete(key));
 universeTasks.set(key,task);
 return task;
}
function startUniverseSearch(term,quick=false){
 if(normalize(term).length<2)return;
 const key=universeBucket(term);
 if(!key||universeBuckets.has(key))return;
 loadUniverseBucket(term).then(()=>{
  const value=quick?$('filmQuickInput').value.trim():$('filmSearchInput').value.trim();
  if(normalize(value)!==normalize(term))return;
  if(quick)quickSuggestions();
  else if(state.tab==='search')renderSearch();
 });
}
async function lookupUniverseMovie(id){
 const manifest=await getUniverseManifest();
 if(!manifest)return null;
 const slot=id%manifest.id_shards,key=String(slot).padStart(2,'0');
 if(!universeIds.has(key)){
  if(!universeIdTasks.has(key)){
   const pending=readGzippedIndex('by-id/'+key+'.json.gz')
    .then(rows=>{
     const entries=rows.map(compactMovie).filter(Boolean);
     cacheIndex(universeIds,key,entries);
     return entries;
    }).catch(error=>{console.warn('Movie ID shard unavailable',error);cacheIndex(universeIds,key,[]);return [];})
     .finally(()=>universeIdTasks.delete(key));
   universeIdTasks.set(key,pending);
  }
  await universeIdTasks.get(key);
 }
 return universeIds.get(key)?.find(m=>m.id===id)||null;
}

const idNumber=value=>/^[1-9]\d{0,11}$/.test(String(value||''))?Number(value):null;
const faValue=value=>/[\u0600-\u06ff]/.test(String(value||''));
const normalize=value=>String(value||'').normalize('NFKD').toLocaleLowerCase()
 .replace(/\p{M}/gu,'').replace(/ي/g,'ی').replace(/ك/g,'ک')
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
function node(tag,cls,text){
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);return e;
}
function titleOf(m){
 return String(!EN&&faValue(m.fa_title)?m.fa_title:m.title||m.original_title||'').slice(0,180);
}
function posterOf(m){
 const v=String(m.poster_url||'');
 if(/^assets\/(?:catalog|posters)\/\d+-[a-f0-9]{12}\.webp$/i.test(v))return new URL(v,BASE).href;
 // Use only TMDB's own verified poster path. Never invent artwork from a title.
 const path=String(m.poster_path||'');
 if(/^\/[a-zA-Z0-9_-]{8,90}\.(?:jpg|png|webp)$/i.test(path))
  return 'https://image.tmdb.org/t/p/w342'+path;
 return '';
}
function createPoster(m,cls){
 const element=node('div',cls),url=posterOf(m);
 const placeholder=()=>{
  // This is a labeled typographic fallback, NEVER a fabricated TMDB poster.
  element.replaceChildren();
  element.classList.add('filmPosterFallback');
  element.appendChild(node('span','filmPosterFallbackIcon','▣'));
  const heading=node('strong','filmPosterFallbackTitle',titleOf(m)||m.original_title||'');
  heading.dir='auto';element.appendChild(heading);
  element.appendChild(node('span','filmPosterFallbackLabel',
    L('پوستر اصلی موجود نیست','Original poster unavailable')));
 };
 if(url){
  const img=node('img');img.src=url;img.loading='lazy';
  img.alt=L('پوستر رسمی ','Official movie poster: ')+titleOf(m);
  img.onerror=()=>{img.remove();placeholder();};
  element.appendChild(img);
 }else placeholder();
 return element;
}
async function loadCatalog(){
 if(catalogPromise)return catalogPromise;
 catalogPromise=(async()=>{
  const r=await fetch(new URL('data/tmdb-catalog.json',BASE),{cache:'default'});
  if(!r.ok)throw Error('Catalog HTTP '+r.status);
  const d=await r.json();if(!Array.isArray(d.movies))throw Error('Invalid catalog');
  const verified=d.movies.filter(m=>idNumber(m?.id)).map(m=>({...m,_source:'catalog'}));
  // A separate bounded GitHub Action gradually caches original posters and
  // metadata for popular movies outside the initial 1,100.
  let extras=[];
  try{
    const response=await fetch(new URL('data/tmdb-extra.json',BASE),{cache:'default'});
    if(response.ok){
      const supplement=await response.json();
      if(Array.isArray(supplement.movies))
        extras=supplement.movies.filter(m=>idNumber(m?.id)&&m.details_ok&&posterOf(m))
          .map(m=>({...m,_source:'extra'}));
    }
  }catch(error){console.warn('Extended TMDB poster metadata not yet available',error);}
  const known=new Set(verified.map(m=>m.id));
  catalog=verified.concat(extras.filter(m=>!known.has(m.id)));
  catalogLoaded=true;return catalog;
 })().catch(error=>{catalogLoaded=true;catalogFailed=true;console.warn('Film index unavailable',error);return [];});
 return catalogPromise;
}
async function loadFeatured(){
 if(featuredPromise)return featuredPromise;
 featuredPromise=(async()=>{
  const r=await fetch(new URL('data/home-feed.json',BASE),{cache:'default'});
  if(!r.ok)throw Error('Home feed HTTP '+r.status);
  const d=await r.json();
  for(const m of Object.values(d.movies||{}).flat()){
   const id=idNumber(m?.id);if(id)featured.set(id,m);
  }
  return featured;
 })().catch(error=>{console.warn('Film translation supplement unavailable',error);return featured;});
 return featuredPromise;
}
function findFilm(id){
 const movie=catalog.find(m=>m.id===id)||extra.get(id);
 const supplement=featured.get(id);
 return movie?(supplement?{...movie,...supplement,poster_url:movie.poster_url||supplement.poster_url}:movie):null;
}
function permalink(id){
 const u=new URL(location.href);
 u.searchParams.set('film',String(id));u.searchParams.delete('q');u.hash='';
 return u.pathname+u.search;
}
function rankedMovies(term){
 const q=normalize(term);
 const rows=[...catalog,...[...extra.values()].filter(m=>!catalog.some(c=>c.id===m.id))];
 if(q.length>=2){
  const shard=universeBuckets.get(universeBucket(q))||[];
  const known=new Set(rows.map(m=>m.id));
  for(const m of shard){if(!known.has(m.id)){known.add(m.id);rows.push(m);}}
 }
 if(q.length<2)return rows.sort((a,b)=>(b.popularity||0)-(a.popularity||0));
 return rows.map(m=>{
  let score=-1;
  for(const t of [m.title,m.original_title,m.fa_title].filter(Boolean).map(normalize)){
   if(t===q)score=Math.max(score,950);
   else if(t.startsWith(q))score=Math.max(score,730);
   else if(t.split(' ').some(word=>word.startsWith(q)))score=Math.max(score,510);
   else if(t.includes(q))score=Math.max(score,300);
  }
  if(score<0&&[m.director,m.cast].some(x=>normalize(x).includes(q)))score=140;
  return {m,score:score<0?-1:score+Math.log1p(m.popularity||0)*8};
 }).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score).map(x=>x.m);
}
function empty(container,text){container.replaceChildren(node('p','filmSearchEmpty',text));}
function filmCard(m){
 const link=node('a','filmResultCard');link.href=permalink(m.id);
 link.dataset.filmId=String(m.id);link.setAttribute('aria-label',titleOf(m));
 link.appendChild(createPoster(m,'filmResultPoster'));
 const name=node('strong','',titleOf(m));name.dir='auto';link.appendChild(name);
 if(m.original_title&&m.original_title!==titleOf(m))link.appendChild(node('small','',m.original_title));
 link.appendChild(node('small','',String(m.release_date||'').slice(0,4)));
 if(Number(m.vote_average)>0)link.appendChild(node('span','filmResultRating','★ '+Number(m.vote_average).toFixed(1)));
 return link;
}
function renderSearch(){
 if(state.tab!=='search')return;
 const host=$('filmSearchResults'),term=$('filmSearchInput').value.trim();
 if(term.length>=2)startUniverseSearch(term);
 if(!catalogLoaded){
  empty(host,L('در حال بارگذاری فیلم‌ها…','Loading films…'));
  loadCatalog().then(()=>{if(state.tab==='search')renderSearch();});return;
 }
 if(!catalog.length&&!(term.length>=2&&universeBuckets.has(universeBucket(term)))){
  empty(host,L('در حال دریافت فهرست کامل یا بررسی اتصال سایت…','Loading comprehensive index or checking the site connection…'));
  $('filmSearchCount').textContent='';
  $('filmSearchRemote').hidden=term.length<2;return;
 }
 const matches=rankedMovies(term);
 host.replaceChildren();
 if(!matches.length)empty(host,L('نتیجه‌ای پیدا نشد؛ جستجوی مستقیم TMDB را امتحان کن.','No matching films; try live TMDB search.'));
 else matches.slice(0,limit).forEach(m=>host.appendChild(filmCard(m)));
 $('filmSearchCount').textContent=EN?matches.length.toLocaleString('en-US')+' films':matches.length.toLocaleString('fa-IR')+' فیلم';
 $('filmSearchMore').hidden=limit>=matches.length;
 $('filmSearchRemote').hidden=term.length<2;
}
function clearSuggestions(){const el=$('filmQuickSuggestions');el.replaceChildren();el.hidden=true;}
function quickSuggestions(){
 const q=$('filmQuickInput').value.trim();clearSuggestions();
 if(q.length<2)return;
 startUniverseSearch(q,true);
 if(!catalogLoaded){loadCatalog().then(()=>{if($('filmQuickInput').value.trim()===q)quickSuggestions();});return;}
 if(!catalog.length&&!(universeBuckets.get(universeBucket(q))||[]).length)return;
 const box=$('filmQuickSuggestions');
 for(const m of rankedMovies(q).slice(0,6)){
  const a=node('a','filmSuggestRow');a.href=permalink(m.id);a.dataset.filmId=String(m.id);
  a.setAttribute('role','option');
  const image=createPoster(m,'filmSuggestPlaceholder');
  a.appendChild(image);
  const label=node('span','filmSuggestText');
  const strong=node('strong','',titleOf(m));strong.dir='auto';label.appendChild(strong);
  label.appendChild(node('small','',[m.original_title,String(m.release_date||'').slice(0,4)].filter(Boolean).join(' · ')));
  a.appendChild(label);box.appendChild(a);
 }
 const all=node('button','filmSuggestAll',L('نمایش همه نتایج','View all results'));all.type='button';
 all.onclick=()=>openSearch(q);box.appendChild(all);box.hidden=false;
}
function openSearch(term='',push=true){
 query=String(term||'').trim().slice(0,160);limit=30;
 $('filmSearchInput').value=query;$('filmQuickInput').value=query;
 clearSuggestions();
 if(push){
  const u=new URL(location.href);u.searchParams.delete('film');u.hash='';
  history.pushState({tab:'search'},'',u.pathname+u.search);
 }
 document.title='My Film Archive';state.tab='search';render();
 window.scrollTo({top:0,behavior:'instant'});
}
async function liveSearch(){
 const q=$('filmSearchInput').value.trim();if(q.length<2||remoteBusy)return;
 remoteBusy=true;const button=$('filmSearchRemote');
 button.disabled=true;button.textContent=L('در حال جستجو…','Searching TMDB…');
 try{
  const d=await tm('/search/movie',{query:q,language:'en-US'});
  for(const m of (Array.isArray(d.results)?d.results:[]).slice(0,30)){
   const id=idNumber(m.id);if(!id||catalog.some(x=>x.id===id))continue;
   extra.set(id,{id,title:m.title||m.original_title,original_title:m.original_title||m.title,
    release_date:m.release_date||'',vote_average:m.vote_average||0,overview:m.overview||'',
    genre_ids:m.genre_ids||[],popularity:m.popularity||0,poster_url:'',_source:'live'});
  }
  limit=Math.max(limit,60);renderSearch();
 }catch(error){
  console.warn('TMDB direct search is blocked on this connection',error);
  $('filmSearchResults').prepend(node('p','filmSearchEmpty',L('جستجوی مستقیم TMDB در این اتصال در دسترس نیست.','Direct TMDB search is unavailable on this connection.')));
 }finally{remoteBusy=false;button.disabled=false;button.textContent=L('جستجوی مستقیم در TMDB','Search live TMDB');}
}
function detailStructure(id){
 const root=$('filmDetailRoot');root.replaceChildren();
 const hero=node('article','filmDetailHero');
 const back=node('button','filmBackBtn',L('بازگشت به جستجو','Back to search'));
 back.type='button';back.onclick=()=>openSearch(query);hero.appendChild(back);
 const cols=node('div','filmDetailColumns');
 const cover=node('div','filmDetailPoster');cover.id='filmDetailPoster';cols.appendChild(cover);
 const copy=node('div','filmDetailCopy');
 copy.appendChild(node('span','filmDetailEyebrow','MY FILM ARCHIVE · MOVIE FILE'));
 const heading=node('h1','',L('در حال بارگذاری…','Loading movie…'));heading.id='filmDetailTitle';copy.appendChild(heading);
 const alt=node('p','filmDetailAlt');alt.id='filmDetailOriginal';copy.appendChild(alt);
 const stats=node('div','filmDetailStats');stats.id='filmDetailStats';copy.appendChild(stats);
 const cast=node('div','filmDetailCast');cast.id='filmDetailCast';copy.appendChild(cast);
 const synHead=node('div','filmDetailSynopsisHeader');
 synHead.appendChild(node('h2','',L('داستان فیلم','Synopsis')));
 const tr=node('button','filmTranslateBtn',L('ترجمه فارسی','Persian translation'));tr.id='filmDetailTranslate';tr.type='button';
 tr.setAttribute('aria-pressed','false');tr.onclick=()=>{showFa=!showFa;paintSynopsis();};synHead.appendChild(tr);
 copy.appendChild(synHead);
 const synopsis=node('p','filmDetailSynopsis');synopsis.id='filmDetailSynopsis';synopsis.dir='auto';copy.appendChild(synopsis);
 const note=node('p','filmSynopsisNote');note.id='filmSynopsisNote';copy.appendChild(note);
 const actions=node('div','filmDetailActions');
 for(const [status,label,cls] of [['seen',L('✓ دیده‌ام','✓ Watched'),''],['want',L('＋ می‌خواهم ببینم','＋ Want to watch'),'secondary']]){
  const btn=node('button',cls,label);btn.type='button';btn.id=status==='seen'?'filmMarkSeen':'filmMarkWant';
  btn.onclick=()=>saveList(status);actions.appendChild(btn);
 }
 copy.appendChild(actions);
 const msg=node('p','filmDetailStatus');msg.id='filmDetailStatus';msg.setAttribute('role','status');copy.appendChild(msg);
 cols.appendChild(copy);hero.appendChild(cols);
 const watch=node('section','filmWatchSection');
 const watchHeading=node('div','filmWatchHeading');
 const watchTitle=node('div');
 watchTitle.appendChild(node('h2','',L('تماشای فیلم','Watch movie')));
 watchTitle.appendChild(node('p','',L('یکی از وب‌سایت‌های مستقل زیر را انتخاب کن.','Choose an independent movie site.')));
 watchHeading.appendChild(watchTitle);
 const toggle=node('button','filmWatchToggle',L('سایت‌های تماشا','Watch sites'));
 toggle.type='button';toggle.id='filmWatchToggle';
 toggle.setAttribute('aria-expanded','false');
 watchHeading.appendChild(toggle);watch.appendChild(watchHeading);
 const list=node('div','filmProviderChooser');list.id='filmProviderChooser';list.hidden=true;
 const sites=[
  {name:L('الماس مووی','Almas Movie'),domain:'almasmovie.app',href:'https://almasmovie.app/',icon:'almas'},
  {name:L('مووی جوان','Movie Javan'),domain:'moviejavan.com',href:'https://moviejavan.com/',icon:'javan'}
 ];
 for(const s of sites){
  const a=node('a','filmProviderCard');a.href=s.href;a.target='_blank';a.rel='noopener noreferrer';
  const icon=node('span','filmProviderIcon '+s.icon);
  icon.innerHTML=s.icon==='almas'
   ?'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m8 19 9-11h14l9 11-16 21Z"/><path d="M8 19h32M17 8l7 11 7-11M17 19l7 21 7-21"/></svg>'
   :'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="6" y="10" width="36" height="28" rx="6"/><path d="m21 19 11 5-11 6z"/></svg>';
  a.appendChild(icon);
  const labels=node('span','filmProviderText');labels.appendChild(node('strong','',s.name));
  labels.appendChild(node('small','',s.domain));a.appendChild(labels);list.appendChild(a);
 }
 list.appendChild(node('p','filmProviderNote',
  L('لینک‌ها صفحه اصلی سایت‌های مستقل را باز می‌کنند؛ موجودبودن و مجازبودن تماشای این فیلم در آن‌ها بررسی نشده است.',
    'Links open third-party homepages; availability and licensing for this film are not verified.')));
 const copyTitle=node('button','filmCopyTitle',L('کپی نام فیلم','Copy film title'));copyTitle.type='button';
 copyTitle.onclick=async()=>{
  const t=current?.original_title||current?.title||'';
  try{await navigator.clipboard.writeText(t);copyTitle.textContent=L('کپی شد ✓','Copied ✓');}
  catch(error){window.prompt(L('نام فیلم','Movie title'),t);}
 };
 list.appendChild(copyTitle);watch.appendChild(list);hero.appendChild(watch);
 toggle.onclick=()=>{
  // Both provider selection and external navigation require a loaded account.
  if(!requireCloud()){watchOpen=false;list.hidden=true;toggle.setAttribute('aria-expanded','false');return;}
  watchOpen=!watchOpen;list.hidden=!watchOpen;toggle.setAttribute('aria-expanded',String(watchOpen));
 };
 list.addEventListener('click',event=>{
  const destination=event.target.closest('a.filmProviderCard');
  if(destination&&!requireCloud())event.preventDefault();
 });
 const tmdb=node('p','filmDetailSource');const link=node('a','',L('اطلاعات فیلم در TMDB','Movie info on TMDB'));
 link.href='https://www.themoviedb.org/movie/'+id;link.target='_blank';link.rel='noopener noreferrer';
 tmdb.appendChild(link);hero.appendChild(tmdb);root.appendChild(hero);
}
function paintSynopsis(){
 if(!current||state.tab!=='film')return;
 const m=current,valid=faValue(m.overview_fa)&&m.overview_source_for_fa===m.overview;
 const translate=showFa&&valid;
 $('filmDetailTitle').textContent=showFa&&faValue(m.fa_title)?m.fa_title:titleOf(m);
 $('filmDetailTitle').dir=showFa&&faValue(m.fa_title)?'rtl':'auto';
 $('filmDetailSynopsis').textContent=translate?m.overview_fa:
  String(m.overview||L('خلاصه این فیلم موجود نیست.','Synopsis unavailable.'));
 $('filmDetailSynopsis').dir=translate?'rtl':'auto';
 const button=$('filmDetailTranslate');
 button.textContent=showFa?L('↩ متن اصلی','↩ Original'):L('ترجمه فارسی','Persian translation');
 button.setAttribute('aria-pressed',String(showFa));
 $('filmSynopsisNote').textContent=showFa?(valid
  ?m.overview_translation_source==='tmdb'?L('خلاصه فارسی TMDB','TMDB Persian synopsis'):L('ترجمه ماشینی، ممکن است خطا داشته باشد.','Machine translation; may contain errors.')
  :L('ترجمه فارسی هنوز موجود نیست؛ متن اصلی نمایش داده می‌شود.','No Persian translation cached; original text shown.')):'';
}
function accountEntry(){
 return ses&&cloudReady&&!cloudLoading&&current?state.films.find(f=>Number(f.tmdb)===Number(current.id)):null;
}
function updateAccountButtons(){
 if(!current||state.tab!=='film')return;
 const ready=Boolean(ses&&cloudReady&&!cloudLoading);
 const watchToggle=$('filmWatchToggle'),chooser=$('filmProviderChooser');
 if(watchToggle){
  watchToggle.textContent=ready?L('سایت‌های تماشا','Watch sites'):
   L('ورود برای تماشای فیلم','Sign in to watch');
  if(!ready){
   watchOpen=false;chooser.hidden=true;
   watchToggle.setAttribute('aria-expanded','false');
  }
 }
 const entry=accountEntry(),seen=$('filmMarkSeen'),want=$('filmMarkWant');
 if(!seen||!want)return;
 seen.setAttribute('aria-pressed',String(entry?.status==='seen'));
 want.setAttribute('aria-pressed',String(entry?.status==='want'));
 seen.classList.toggle('secondary',entry?.status!=='seen');
 want.classList.toggle('secondary',entry?.status!=='want');
 seen.textContent=entry?.status==='seen'?L('✓ در دیده‌شده‌ها','✓ On watched list'):L('✓ دیده‌ام','✓ Watched');
 want.textContent=entry?.status==='want'?L('✓ در فهرست انتظار','✓ On watchlist'):L('＋ می‌خواهم ببینم','＋ Want to watch');
 $('filmDetailStatus').textContent=!ses
  ?L('برای افزودن فیلم وارد حساب شو.','Sign in to add this movie to your lists.')
  :!cloudReady?L('در حال دریافت آرشیو حسابت…','Loading account archive…')
  :entry?L('این فیلم در حساب تو ثبت شده است.','This movie is saved to your account.')
  :L('برای ذخیره فیلم یکی از دو فهرست را انتخاب کن.','Select a list to save this movie.');
}
function showFilm(m){
 if(!m||state.tab!=='film')return;
 current=m;
 const cover=$('filmDetailPoster');cover.replaceChildren();cover.appendChild(createPoster(m,'filmDetailPosterImage'));
 $('filmDetailOriginal').textContent=m.original_title||m.title||'';
 const stats=$('filmDetailStats');stats.replaceChildren();
 const rating=Number(m.vote_average||0);
 if(rating>0)stats.appendChild(node('span','','★ '+rating.toFixed(1)+'/10'));
 const year=String(m.release_date||'').slice(0,4);
 if(year)stats.appendChild(node('span','',year));
 if(Number(m.runtime)>0)stats.appendChild(node('span','',String(m.runtime)+' '+L('دقیقه','min')));
 const gs=(m.genre_ids||[]).map(id=>GENRES[id]).filter(Boolean);
 if(gs.length)stats.appendChild(node('span','',[...new Set(gs)].slice(0,3).join(' · ')));
 const cast=$('filmDetailCast');cast.replaceChildren();
 for(const [label,value] of [[L('کارگردان: ','Director: '),m.director],[L('بازیگران: ','Cast: '),m.cast],[L('کشور: ','Country: '),m.country]]){
  if(!value)continue;const line=node('span');line.appendChild(node('strong','',label));line.appendChild(document.createTextNode(String(value).slice(0,350)));cast.appendChild(line);
 }
 paintSynopsis();updateAccountButtons();document.title=titleOf(m)+' | My Film Archive';
 window.dispatchEvent(new CustomEvent('film-detail-loaded',{detail:{movie:{...m}}}));
}
async function fetchLiveDetail(id){
 try{
  const d=await tm('/movie/'+id,{language:'en-US',append_to_response:'credits'});
  if(idNumber(d?.id)!==id)return null;
  const m={id,title:d.title||d.original_title,original_title:d.original_title||d.title,
   release_date:d.release_date||'',vote_average:d.vote_average||0,overview:d.overview||'',
   genre_ids:(d.genres||[]).map(g=>g.id),runtime:d.runtime||0,poster_url:'',poster_path:d.poster_path||'',
   director:(d.credits?.crew||[]).filter(c=>c.job==='Director').map(c=>c.name).join(', '),
   cast:(d.credits?.cast||[]).slice(0,6).map(c=>c.name).join(', '),
   country:(d.production_countries||[]).map(c=>c.name).join(', ')};
  // A localized TMDB title/overview is available only when actually translated.
  try{
   const fa=await tm('/movie/'+id,{language:'fa-IR'});
   if(fa?.id===id){
    if(faValue(fa.title))m.fa_title=fa.title;
    if(faValue(fa.overview)){m.overview_fa=fa.overview;m.overview_source_for_fa=m.overview;m.overview_translation_source='tmdb';}
   }
  }catch(error){ /* Preserve the English original when Persian data is absent. */ }
  extra.set(id,m);return m;
 }catch(error){console.warn('Movie not locally cached and direct TMDB unavailable',error);return null;}
}
async function showDetail(id){
 const seq=++loadSerial;detailStructure(id);
 $('filmDetailTitle').textContent=L('در حال دریافت اطلاعات…','Loading movie…');
 await Promise.all([loadCatalog(),loadFeatured()]);
 if(seq!==loadSerial||state.tab!=='film')return;
 let movie=findFilm(id);
 if(!movie){
  $('filmDetailTitle').textContent=L('این فیلم در فهرست ذخیره‌شده نیست.','Film unavailable in the local index.');
  $('filmDetailSynopsis').textContent=L('برای مشاهده این فیلم ممکن است دسترسی مستقیم TMDB لازم باشد.','Direct TMDB access may be needed.');
  movie=await lookupUniverseMovie(id);
  // The one-million-title index does not include poster paths. Request verified
  // full metadata for the movie being viewed, and keep the title-only fallback.
  const live=await fetchLiveDetail(id);
  if(live)movie=live;
 }
 if(seq===loadSerial&&state.tab==='film'&&movie)showFilm(movie);
}
function openFilm(id,push=true){
 const ident=idNumber(id);if(!ident){openSearch(query,push);return;}
 if(state.tab!=='film')returnTab=state.tab;
 current=null;showFa=!EN;watchOpen=false;
 if(push)history.pushState({film:ident},'',permalink(ident));
 state.tab='film';render();window.scrollTo({top:0,behavior:'instant'});
}
async function saveList(status){
 if(!current||!['seen','want'].includes(status)||!requireCloud())return;
 const owner=ses.id,m=current,old=state.films,previous=old.find(f=>Number(f.tmdb)===Number(m.id));
 if(previous?.status===status){$('filmDetailStatus').textContent=L('فیلم از قبل در همین فهرست است.','Already in this list.');return;}
 const buttons=[$('filmMarkSeen'),$('filmMarkWant')];buttons.forEach(b=>b.disabled=true);
 try{
  if(previous){
   state.films=old.map(f=>f===previous?{...f,status,date:status==='seen'&&!f.date?todayISO():f.date||''}:f);
  }else{
   const year=Number(String(m.release_date||'').slice(0,4))||'';
   const genre=(m.genre_ids||[]).map(id=>GENRES[id]).find(Boolean)||'';
   let id='tmdb-'+m.id;if(old.some(f=>f.id===id))id=newId();
   state.films=old.concat([{id,tmdb:m.id,
    title:!EN&&faValue(m.fa_title)?m.fa_title:m.title||m.original_title||'',
    titleEn:m.original_title||m.title||'',year,genre,
    director:String(m.director||'').slice(0,240),cast:String(m.cast||'').slice(0,350),
    country:String(m.country||'').slice(0,180),runtime:Number(m.runtime)||'',
    poster:posterOf(m)?String(m.poster_url):'',status,notes:'',rating:0,liked:false,
    date:status==='seen'?todayISO():'',logs:[]}]);
  }
  if(!await saveFilms()){if(ses?.id===owner&&cloudReady)state.films=old;return;}
  updateAccountButtons();
  $('filmDetailStatus').textContent=status==='seen'
   ?L('فیلم در دیده‌شده‌های حساب ذخیره شد ✓','Saved to your watched list ✓')
   :L('فیلم در فهرست انتظار حساب ذخیره شد ✓','Saved to your watchlist ✓');
 }catch(error){
  console.error('Account list save failed',error);
  if(ses?.id===owner&&cloudReady)state.films=old;
  $('filmDetailStatus').textContent=L('ذخیره موفق نبود؛ دوباره تلاش کن.','Save failed; please retry.');
 }finally{buttons.forEach(b=>b.disabled=false);}
}
function navigateLink(event){
 const a=event.target.closest('a[data-film-id]');
 if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const id=idNumber(a.dataset.filmId);if(!id)return;
 event.preventDefault();clearSuggestions();openFilm(id);
}
function translateStatic(){
 if(!EN)return;
 document.querySelector('#filmQuickForm label').textContent='Search the movie catalog';
 $('filmQuickInput').placeholder='Search for a movie…';
 $('filmQuickSubmit').textContent='Search';
 $('tab-search').textContent='Movie search';
 const hero=$('filmSearchView');
 hero.querySelector('.filmSearchHero h2').textContent='Explore movies';
 hero.querySelector('.filmSearchHero p').textContent='Search the locally cached TMDB movie index, then open a dedicated page for any film.';
 hero.querySelector('.filmSearchHero label').textContent='Movie title';
 $('filmSearchInput').placeholder='English or Persian…';
 hero.querySelector('.filmSearchResultsHead h3').textContent='Movies';
 $('filmSearchMore').textContent='Show more films';
 $('filmSearchRemote').textContent='Search live TMDB';
 hero.querySelector('.filmSearchDisclaimer').textContent='The local movie index is periodically updated. Direct TMDB search may require a VPN.';
}
function init(){
 translateStatic();
 $('filmQuickForm').addEventListener('submit',event=>{event.preventDefault();openSearch($('filmQuickInput').value);});
 $('filmQuickInput').addEventListener('input',()=>{
  clearTimeout(quickTimer);quickTimer=setTimeout(quickSuggestions,140);
 });
 $('filmQuickInput').addEventListener('keydown',event=>{if(event.key==='Escape')clearSuggestions();});
 document.addEventListener('click',event=>{if(!event.target.closest('#filmQuickForm'))clearSuggestions();});
 $('filmQuickSuggestions').addEventListener('click',navigateLink);
 $('filmSearchResults').addEventListener('click',navigateLink);
 $('filmSearchInput').addEventListener('input',()=>{
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
   query=$('filmSearchInput').value.trim();limit=30;renderSearch();
  },150);
 });
 $('filmSearchMore').addEventListener('click',()=>{limit+=30;renderSearch();});
 $('filmSearchRemote').addEventListener('click',liveSearch);
 window.addEventListener('popstate',event=>{
  const id=idNumber(new URL(location.href).searchParams.get('film'));
  if(id){openFilm(id,false);return;}
  if(state.tab!=='film')return;
  const tab=event.state?.tab||returnTab;
  if(tab==='news'||tab==='room'||tab==='dash'||tab==='diary'){
    document.title='My Film Archive';state.tab=tab;render();
  }else openSearch(query,false);
 });
 window.addEventListener('film-account-profile-updated',updateAccountButtons);
 loadCatalog();
 getUniverseManifest();
 const id=idNumber(new URL(location.href).searchParams.get('film'));
 if(id)openFilm(id,false);
}
window.filmDiscovery={
 openFilm,openSearch,
 // Shared with the "Add film" combobox: not restricted to the curated 1,100.
 async searchAllMovies(input,max=12){
  const term=String(input||'').trim().slice(0,160);
  if(normalize(term).length<2)return [];
  await Promise.all([loadCatalog(),loadUniverseBucket(term)]);
  const maxCount=Math.min(30,Math.max(1,Math.floor(Number(max)||12)));
  return rankedMovies(term).slice(0,maxCount).map(movie=>{
   const known=findFilm(movie.id);
   return known||movie;
  });
 },
 async findAnyMovie(id){
  const n=idNumber(id);if(!n)return null;
  await Promise.all([loadCatalog(),loadFeatured()]);
  return findFilm(n)||await lookupUniverseMovie(n);
 },
 async fullIndexInfo(){
  return await getUniverseManifest();
 },
 async getCuratedMovies(){
  await loadCatalog();
  return catalog.slice();
 },
 getCurrentMovie(){return current?{...current}:null;},
 onTabRendered(tab){
  if(tab==='search')renderSearch();
  if(tab==='film'){
   const id=idNumber(new URL(location.href).searchParams.get('film'));
   if(id)showDetail(id);
  }
 },
 onArchiveUpdated:updateAccountButtons
};
init();
})();
