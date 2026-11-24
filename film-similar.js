/* Film-page recommendations from cached TMDB metadata, with an honest
 * title-similarity fallback for titles without plot, cast, or genre data.
 * No external browser request to the TMDB API, no invented posters.
 */
(function(){
'use strict';
const D=()=>window.filmDiscovery;
const T=(fa,en)=>typeof EN==='boolean'&&EN?en:fa;
const site=new URL('.',document.currentScript?.src||document.baseURI);
let version=0;
const byId=new Map();
const stop=new Set('the a an and or of for in on at to with from by this that film movie part episode sequel new old love my our one two three four life night day man woman girl boy story movie film it le la les de des du der das und ein eine el los las un una y et il i ii iii iv v 2024 2025 2026'.split(' '));
function norm(x){return String(x||'').normalize('NFKD').toLowerCase()
 .replace(/\p{M}/gu,'').replace(/ي/g,'ی').replace(/ك/g,'ک')
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function terms(m){
 return [...new Set(norm(m.original_title||m.title).split(' ')
  .filter(x=>x.length>=4&&!stop.has(x)))];
}
function year(m){const s=String(m.release_date||m.year||'').slice(0,4);
 return /^\d{4}$/.test(s)?Number(s):0;}
function tokens(v){return new Set(String(v||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean));}
function common(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n;}
function scoreByMetadata(main,other){
 if(main.id===other.id)return -1;
 const genresA=new Set((main.genre_ids||[]).map(Number)),genresB=new Set((other.genre_ids||[]).map(Number));
 const genre=common(genresA,genresB);
 const director=Boolean(main.director&&other.director&&norm(main.director)===norm(other.director));
 const cast=common(tokens(main.cast),tokens(other.cast));
 const related=genre>0||director||cast>0;
 if(!related)return -1;
 const gap=year(main)&&year(other)?Math.abs(year(main)-year(other)):100;
 const recency=gap<=3?9:gap<=9?6:gap<=20?3:0;
 const popularity=Math.min(9,Math.log1p(Number(other.popularity)||0));
 const art=other.poster_url||other.poster_path?3:0;
 return genre*38+(director?100:0)+Math.min(4,cast)*18+recency+popularity+art;
}
function scoreByTitle(main,other){
 if(main.id===other.id)return -1;
 const key=new Set(terms(main)),otherWords=new Set(terms(other));
 const shared=common(key,otherWords);
 if(!shared)return -1;
 const yr=year(main),theirYear=year(other);
 const proximity=yr&&theirYear?Math.max(0,12-Math.abs(yr-theirYear)):0;
 return shared*48+proximity+Math.min(8,Math.log1p(Number(other.popularity)||0))+(other.poster_url||other.poster_path?3:0);
}
function element(tag,cls,text){
 const item=document.createElement(tag);
 if(cls)item.className=cls;
 if(text!==undefined)item.textContent=String(text);
 return item;
}
function poster(m){
 const wrap=element('div','filmSimilarPoster');
 const v=String(m.poster_url||'');
 const path=String(m.poster_path||'');
 const imageUrl=/^assets\/(?:catalog|posters)\/\d+-[a-f0-9]{12}\.webp$/i.test(v)
  ?new URL(v,site).href
  :/^\/[a-zA-Z0-9_-]{8,90}\.(?:jpg|png|webp)$/i.test(path)
  ?'https://image.tmdb.org/t/p/w342'+path:'';
 if(imageUrl){
  const img=element('img');
  img.src=imageUrl;img.alt=T('پوستر اصلی ','Original poster for ')+String(m.title||m.original_title);
  img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{img.remove();makePlaceholder();},{once:true});
  wrap.appendChild(img);
 }else makePlaceholder();
 function makePlaceholder(){
  wrap.classList.add('filmSimilarNoPoster');
  wrap.appendChild(element('span','filmSimilarClapper','▱'));
  wrap.appendChild(element('strong','filmSimilarPlaceholderTitle',m.title||m.original_title||''));
  wrap.appendChild(element('small','filmSimilarPlaceholderNote',T('پوستر رسمی موجود نیست','Original poster unavailable')));
 }
 return wrap;
}
function card(m){
 const a=element('a','filmSimilarCard');
 const url=new URL(location.href);url.searchParams.set('film',String(m.id));url.hash='';
 a.href=url.pathname+url.search;
 a.dataset.filmId=String(m.id);a.setAttribute('aria-label',m.title||m.original_title||'');
 a.appendChild(poster(m));
 const title=element('strong','filmSimilarCardName',m.fa_title&&typeof EN==='boolean'&&!EN?m.fa_title:m.title||m.original_title);
 title.dir='auto';a.appendChild(title);
 const sub=element('span','filmSimilarMeta');
 const y=year(m);sub.textContent=(y?String(y):'')+(Number(m.vote_average)>0?'  ★ '+Number(m.vote_average).toFixed(1):'');
 a.appendChild(sub);
 a.addEventListener('click',e=>{
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;
  e.preventDefault();D()?.openFilm(m.id);
 });
 return a;
}
function prepareArea(){
 const root=document.getElementById('filmDetailRoot');
 if(!root)return null;
 let area=document.getElementById('filmSimilarSection');
 if(area)return area;
 area=element('section','filmSimilarSection');area.id='filmSimilarSection';
 area.setAttribute('aria-labelledby','filmSimilarHeading');
 const header=element('div','filmSimilarHeader');
 const text=element('div','filmSimilarHeaderCopy');
 const eyebrow=element('span','filmSimilarEyebrow','DISCOVER MORE');
 text.appendChild(eyebrow);
 const heading=element('h2','',T('فیلم‌های مشابه','Similar films'));heading.id='filmSimilarHeading';
 text.appendChild(heading);
 const description=element('p','',T('براساس اطلاعات موجود فیلم','Based on available movie information'));
 description.id='filmSimilarDescription';text.appendChild(description);
 header.appendChild(text);area.appendChild(header);
 const grid=element('div','filmSimilarGrid');grid.id='filmSimilarGrid';
 grid.setAttribute('role','list');area.appendChild(grid);
 root.appendChild(area);
 return area;
}
async function similarFor(movie){
 const api=D();
 if(!api)return {reason:'missing',items:[]};
 const curated=await api.getCuratedMovies();
 const local=curated.map(m=>({...m,id:Number(m.id)}));
 const hasMeta=(movie.genre_ids||[]).length||movie.director||movie.cast;
 let result=[];
 if(hasMeta){
  result=local.map(m=>({m,score:scoreByMetadata(movie,m)}))
   .filter(x=>x.score>=25).sort((a,b)=>b.score-a.score).map(x=>x.m);
 }
 // When the local cache is insufficient, use TMDB's official similar-film
 // recommendations if reachable. Otherwise retain the verified offline ranking.
 if(result.length<8&&typeof tm==='function'){
  try{
   const remote=await Promise.race([
    tm('/movie/'+movie.id+'/similar',{language:typeof EN==='boolean'&&EN?'en-US':'fa-IR',page:1}).catch(()=>null),
    new Promise(resolve=>setTimeout(()=>resolve(null),4500))
   ]);
   const known=new Set([movie.id,...result.map(m=>m.id)]);
   const byId=new Map(local.map(m=>[Number(m.id),m]));
   for(const item of Array.isArray(remote?.results)?remote.results:[]){
    if(result.length>=10)break;
    const id=Number(item.id);
    if(!Number.isSafeInteger(id)||id<=0||known.has(id)||item.adult)continue;
    const entry=byId.get(id)||{
     id,title:String(item.title||item.original_title||'').slice(0,180),
     original_title:String(item.original_title||item.title||'').slice(0,180),
     fa_title:typeof EN==='boolean'&&!EN&&/[\u0600-\u06ff]/.test(item.title||'')?item.title:'',
     release_date:item.release_date||'',vote_average:item.vote_average||0,
     genre_ids:Array.isArray(item.genre_ids)?item.genre_ids:[],
     poster_path:item.poster_path||''
    };
    if(!entry.title&&!entry.original_title)continue;
    result.push(entry);known.add(id);
   }
  }catch(error){console.warn('TMDB official similar films unavailable',error);}
 }
 // If a rare movie only has a title, avoid asserting genre or plot similarity.
 if(result.length<8){
  const words=terms(movie).sort((a,b)=>b.length-a.length);
  const word=words.find(w=>w.length>=4);
  if(word){
   let other=[];
   try{other=await api.searchAllMovies(word,30);}catch(error){console.warn('Similar-title search unavailable',error);}
   const known=new Set(result.map(m=>m.id));
   const ranked=[...other,...local].filter(m=>m&&m.id!==movie.id&&!known.has(m.id))
    .map(m=>({m,score:scoreByTitle(movie,m)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
   for(const {m} of ranked){if(known.has(m.id))continue;result.push(m);known.add(m.id);if(result.length>=10)break;}
  }
 }
 if(result.length){
  return {reason:hasMeta?'metadata':'title',items:result.slice(0,10)};
 }
 // Still present a useful way to explore without claiming an unverified match.
 const candidates=local.filter(m=>m.id!==movie.id&&m.poster_url)
  .sort((a,b)=>(Number(b.popularity)||0)-(Number(a.popularity)||0));
 return {reason:'discovery',items:candidates.slice(0,8)};
}
async function show(movie){
 if(!movie?.id)return;
 const serial=++version,area=prepareArea();
 if(!area)return;
 const grid=document.getElementById('filmSimilarGrid');
 grid.replaceChildren(element('p','filmSimilarLoading',T('در حال پیدا کردن فیلم‌های مرتبط…','Finding related movies…')));
 try{
  const suggestions=await similarFor(movie);
  if(serial!==version||document.getElementById('filmSimilarSection')!==area)return;
  const desc=document.getElementById('filmSimilarDescription');
  if(suggestions.reason==='metadata'){
   desc.textContent=T('پیشنهادها براساس ژانر، کارگردان، بازیگران و دوره ساخت مرتب شده‌اند.',
      'Ranked using shared genres, director, cast and release period.');
  }else if(suggestions.reason==='title'){
   desc.textContent=T('اطلاعات کامل این فیلم در دسترس نیست؛ این‌ها عنوان‌های مرتبط با نام فیلم‌اند، نه شباهت داستانی تأییدشده.',
      'Full metadata is unavailable. These titles share words, not necessarily themes or plot.');
  }else{
   desc.textContent=T('اطلاعات کافی برای سنجش شباهت موجود نیست؛ این‌ها فیلم‌های منتخب برای کشف بیشترند.',
      'Not enough metadata for a similarity score; explore these selected films instead.');
  }
  grid.replaceChildren();
  for(const m of suggestions.items){grid.appendChild(card(m));}
  if(!suggestions.items.length)grid.appendChild(element('p','filmSimilarLoading',
   T('فعلاً پیشنهاد معتبری برای این عنوان موجود نیست.','No reliable suggestions available yet.')));
 }catch(error){
  console.warn('Recommendations unavailable',error);
  if(serial===version)grid.replaceChildren(element('p','filmSimilarLoading',
   T('پیشنهادها فعلاً در دسترس نیستند.','Suggestions are temporarily unavailable.')));
 }
}
window.addEventListener('film-detail-loaded',event=>show(event.detail?.movie));
const existing=D()?.getCurrentMovie?.();
if(existing&&typeof state==='object'&&state.tab==='film')show(existing);
})();
