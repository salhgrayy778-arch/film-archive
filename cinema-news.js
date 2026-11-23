/* Film Archive: world cinema homepage, same-origin cinema news and film data.
   News headlines are taken from multiple publishers; posters are official local TMDB assets. */
(function(){
'use strict';
if(!document.getElementById('cinemaNews')||typeof tm!=='function')return;
const root=document.getElementById('cinemaNews'),el=id=>document.getElementById(id);
// Resolve all assets from this script's actual deployed location, not the address bar.
// This works on custom domains and GitHub Pages subpaths, with or without a trailing slash.
const SITE_BASE=new URL('.',document.currentScript?.src||document.baseURI);
const localAsset=(p,pattern)=>pattern.test(String(p||''))?new URL(p,SITE_BASE).href:'';

const L=(fa,en)=>EN?en:fa;
const escHtml=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const validURL=x=>{try{const v=new URL(String(x||''));return ['https:','http:'].includes(v.protocol)?v.href:'';}catch(e){return '';}};
const srcList=[['Variety','https://variety.com/v/film/'],['Deadline','https://deadline.com/category/film/'],['The Hollywood Reporter','https://www.hollywoodreporter.com/movies/'],['IndieWire','https://www.indiewire.com/c/film/'],['Collider','https://collider.com/'],['Screen Rant','https://screenrant.com/']];
const N_TTL=15*60000,M_TTL=60*60000;
let fetching=false,lastCheck=0,snapshotTask=null,snapshotTime=0,lastSnapshot=null;
const movieDetails=new Map();
async function serverSnapshot(){
 if(snapshotTask&&Date.now()-snapshotTime<8*60000)return snapshotTask;
 snapshotTime=Date.now();
 const url=new URL('data/home-feed.json',SITE_BASE);url.searchParams.set('v',String(Date.now()));
 snapshotTask=fetch(url,{cache:'no-store'}).then(async r=>{
  if(!r.ok)throw Error('Cinema data HTTP '+r.status);
  const data=await r.json();
  if(data.schema_version!==2||!data.movies||!Array.isArray(data.news))throw Error('Invalid published cinema data');
  lastSnapshot=data;return data;
 }).catch(err=>{snapshotTask=null;throw err;});
 return snapshotTask;
}

const fromCache=(key,ttl)=>{
 try{const x=JSON.parse(sessionStorage.getItem('film-archive-home-'+key)||'null');
  return x&&Number.isFinite(x.ts)&&Array.isArray(x.items)?{items:x.items,fresh:Date.now()-x.ts<ttl,ts:x.ts}:null;
 }catch(e){return null;}
};
const saveCache=(key,items)=>{try{sessionStorage.setItem('film-archive-home-'+key,JSON.stringify({ts:Date.now(),items}));}catch(e){}};
const placeholder=(text,links)=>'<div class="cn-placeholder">'+escHtml(text)+(links?'<div class="cn-source-strip">'+srcList.map(x=>'<a href="'+x[1]+'" target="_blank" rel="noopener noreferrer">'+x[0]+'</a>').join(' · ')+'</div>':'')+'</div>';
const formattedDay=s=>{
 if(!/^\d{4}-\d\d-\d\d$/.test(s||''))return '';
 const d=new Date(s+'T12:00:00');
 return Number.isNaN(d.getTime())?'':d.toLocaleDateString(EN?'en-US':'fa-IR',{day:'numeric',month:'short',year:'numeric'});
};
const seenTime=s=>{
 const v=String(s||'');
 const d=/^\d{8}T\d{6}Z$/.test(v)?new Date(v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8)+'T'+v.slice(9,11)+':'+v.slice(11,13)+':'+v.slice(13,15)+'Z'):new Date(v);
 return Number.isNaN(d.getTime())?'':d.toLocaleString(EN?'en-US':'fa-IR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
};
const posterPath=p=>localAsset(p,/^assets\/posters\/\d+-[a-f0-9]{12}\.webp$/i);
const newsPath=p=>localAsset(p,/^assets\/news\/[a-f0-9]{16}\.webp$/i);
function renderFilm(items,id){
 const host=el(id);
 if(!Array.isArray(items)||!items.length){host.innerHTML=placeholder(L('فیلمی برای نمایش پیدا نشد. دوباره تازه‌سازی کن.','No movies found. Try refreshing.'));return;}
 host.innerHTML=items.slice(0,12).map(m=>{
  if(Number.isSafeInteger(m.id)&&m.id>0)movieDetails.set(m.id,m);
  const title=String(m.title||m.original_title||'').trim(),cover=posterPath(m.poster_url);
  const rating=Number(m.vote_average)||0,release=formattedDay(m.release_date);
  return '<article class="cn-film-card"><button type="button" class="cn-film-open" data-film-id="'+Number(m.id)+'" aria-label="'+escHtml(L('جزئیات فیلم ','Details of ')+title)+'"><div class="cn-film-poster">'
   +(cover?'<img src="'+escHtml(cover)+'" loading="lazy" decoding="async" alt="'+escHtml(L('پوستر رسمی ','Official poster of ')+title)+'">':escHtml(L('پوستر موجود نیست','Poster unavailable')))
   +'</div><div class="cn-film-details"><h4 dir="auto">'+escHtml(title)+'</h4><p>'+escHtml(release||L('تاریخ نامشخص','Release date unavailable'))+'</p>'
   +(rating>0?'<p class="cn-rating">★ '+escHtml(rating.toFixed(1))+' / 10</p>':'')+'</div></button></article>';
 }).join('');
}
function renderNews(items){
 if(!Array.isArray(items)||!items.length){el('cnNewsFeed').innerHTML=placeholder(L('از سرویس خبر، گزارشی دریافت نشد. خبرهای واقعی را از رسانه‌های پایین دنبال کن.','No current stories were returned. Browse the publisher links below.'),true);return;}
 el('cnNewsFeed').innerHTML=items.slice(0,12).map(a=>{
  const url=validURL(a.url),image=newsPath(a.socialimage),title=String(a.title||'').trim();
  if(!url||!title)return '';
  const source=String(a.source||a.domain||'').replace(/^www\./,'').slice(0,65),time=seenTime(a.seendate);
  return '<article class="cn-news-card"><a target="_blank" rel="noopener noreferrer" href="'+escHtml(url)+'" aria-label="'+escHtml(title)+'">'
   +'<div class="cn-news-thumb">'+(image?'<img src="'+escHtml(image)+'" alt="" loading="lazy" decoding="async">':'<span class="cn-news-empty" aria-hidden="true">◈ CINEMA</span>')+'</div>'
   +'<div class="cn-news-info"><h4 dir="auto">'+escHtml(title)+'</h4><div class="cn-news-meta"><span class="cn-source">'+escHtml(source||L('رسانه اصلی','Original publisher'))+'</span>'
   +(time?'<time>'+escHtml(L('رصد: ','Seen: ')+time)+'</time>':'')+'</div></div></a></article>';
 }).join('');
}
async function movies(path){
 const snapshot=await serverSnapshot();
 const section=path==='/movie/now_playing'?'now':path==='/movie/upcoming'?'soon':path==='/trending/movie/week'?'trends':'';
 return (Array.isArray(snapshot.movies[section])?snapshot.movies[section]:[]).filter(x=>x&&Number.isSafeInteger(x.id)&&x.id>0);
}
async function fetchMovieGroup(key,path,id,force,onlyFuture){
 const old=fromCache(key,M_TTL);
 if(!force&&old?.fresh){renderFilm(old.items,id);return true;}
 try{
  let items=await movies(path);
  if(onlyFuture){
   const today=new Date().toISOString().slice(0,10);
   items=items.filter(m=>m.release_date && m.release_date>=today);
  }
  renderFilm(items,id);saveCache(key,items);return true;
 }catch(e){
  console.warn('Cinema TMDB request failed',key,e);
  if(old){renderFilm(old.items,id);return false;}
  el(id).innerHTML=placeholder(e.message==='key'
    ?L('کلید TMDB معتبر نیست؛ آن را در بخش ابزارها بررسی کن.','Invalid TMDB key. Check it in Tools.')
    :L('اطلاعات فیلم‌ها در سرور سایت هنوز منتشر نشده‌اند.','Movie snapshot has not yet been published on the site.'));
  return false;
 }
}
async function requestNews(timespan){
 const snapshot=await serverSnapshot();
 const unique=[],records=Array.isArray(snapshot.news)?snapshot.news:[];
 const normalize=t=>String(t||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g,' ').replace(/\s+/g,' ').trim();
 const words=t=>new Set(normalize(t).split(' ').filter(w=>w.length>3));
 for(const entry of records){
  const title=normalize(entry?.title),url=validURL(entry?.url);
  if(!title||!url)continue;
  if(unique.some(prev=>{
   if(prev.url===url||normalize(prev.title)===title)return true;
   const x=words(title),y=words(prev.title),count=[...x].filter(w=>y.has(w)).length;
   return count>=4&&count/new Set([...x,...y]).size>=.67;
  }))continue;
  unique.push(entry);
 }
 return unique.slice(0,18);
}
async function headlines(force){
 const cache=fromCache('news',N_TTL);
 if(!force&&cache?.fresh){renderNews(cache.items);return true;}
 try{
  let results=await requestNews('3d');
  if(results.length<3)results=await requestNews('7d');
  if(results.length){renderNews(results);saveCache('news',results);return true;}
  if(cache?.items.length){renderNews(cache.items);return false;}
  renderNews([]);return false;
 }catch(e){
  console.warn('Cinema news index unavailable',e);
  if(cache?.items.length)renderNews(cache.items);
  else el('cnNewsFeed').innerHTML=placeholder(L('فایل خبرها در سرور سایت هنوز منتشر نشده است؛ از لینک رسانه‌های زیر استفاده کن.','News snapshot is not yet published. Publisher links are below.'),true);
  return false;
 }
}
async function refresh(force){
 if(fetching)return;
 if(!force&&lastCheck>Date.now()-N_TTL)return;
 if(force)snapshotTask=null;
 fetching=true;
 const btn=el('cnRefresh');btn.disabled=true;btn.textContent=L('در حال تازه‌سازی…','Refreshing…');
 el('cnUpdated').textContent=L('در حال دریافت اطلاعات زنده…','Loading live feeds…');
 try{
  const result=await Promise.all([
   headlines(!!force),
   fetchMovieGroup('now','/movie/now_playing','cnNowPlaying',!!force,false),
   fetchMovieGroup('soon','/movie/upcoming','cnUpcoming',!!force,true),
   fetchMovieGroup('trends','/trending/movie/week','cnTrending',!!force,false)
  ]);
  lastCheck=Date.now();
  const data=lastSnapshot;
  const newsAt=data?.news_updated_at?seenTime(data.news_updated_at):'';
  const filmsAt=data?.movies_updated_at?seenTime(data.movies_updated_at):'';
  const age=Date.parse(data?.generated_at||'');
  const stale=Number.isFinite(age)&&Date.now()-age>24*3600000;
  const times=[newsAt&&L('اخبار: ','News: ')+newsAt,filmsAt&&L('فیلم‌ها: ','Movies: ')+filmsAt].filter(Boolean);
  el('cnUpdated').textContent=(stale?L('⚠ داده‌ها قدیمی‌اند • ','⚠ Data may be stale • '):'')
   +(times.length?times.join(' • '):L('منتظر اولین اجرای به‌روزرسانی GitHub','Waiting for the first GitHub update'));
 }catch(e){
  el('cnUpdated').textContent=L('بررسی آنلاین ناموفق بود. دوباره تلاش کن.','Live refresh failed. Try again.');
 }finally{fetching=false;btn.disabled=false;btn.textContent=L('↻ تازه‌سازی اخبار و فیلم‌ها','↻ Refresh cinema news and movies');}
}

function initLocalMovieDetails(){
 const dialog=document.createElement('dialog');
 dialog.className='cnMovieDialog';dialog.id='cnMovieDialog';dialog.setAttribute('aria-labelledby','cnModalTitle');
 dialog.innerHTML='<div class="cnModalHead"><h3 id="cnModalTitle" dir="auto"></h3><button type="button" class="btn" id="cnModalClose" aria-label="'+L('بستن','Close')+'">✕</button></div>'
   +'<div class="cnModalContent"><div id="cnModalPoster" class="cnModalPoster"></div><div class="cnModalData"><p id="cnModalMeta"></p><p id="cnModalOverview" dir="auto"></p><a id="cnModalSource" target="_blank" rel="noopener noreferrer">'
   +L('مشاهده در TMDB (ممکن است VPN بخواهد)','View on TMDB (may need VPN)')+'</a></div></div>';
 root.appendChild(dialog);
 el('cnModalClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 root.addEventListener('click',event=>{
  const button=event.target.closest('button[data-film-id]');
  if(!button)return;
  const m=movieDetails.get(Number(button.dataset.filmId));if(!m)return;
  const title=String(m.title||m.original_title||'');
  el('cnModalTitle').textContent=title;
  el('cnModalMeta').textContent=[formattedDay(m.release_date),m.vote_average?'★ '+Number(m.vote_average).toFixed(1)+'/10':''].filter(Boolean).join(' • ');
  el('cnModalOverview').textContent=m.overview||L('خلاصه رسمی این فیلم در دسترس نیست.','Official synopsis is unavailable.');
  const poster=posterPath(m.poster_url),holder=el('cnModalPoster');holder.replaceChildren();
  if(poster){const img=document.createElement('img');img.src=poster;img.alt=L('پوستر رسمی ','Original official poster of ')+title;holder.appendChild(img);}
  else holder.textContent=L('پوستر موجود نیست','No poster available');
  el('cnModalSource').href='https://www.themoviedb.org/movie/'+Number(m.id);
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
 });
}
root.innerHTML="\n<div class=\"cn-hero\">\n <div class=\"cn-eyebrow\"><span class=\"cn-live-dot\"></span> WORLD CINEMA · LIVE EDITION</div>\n <h2 data-en=\"From the big screen to the latest film news\">از پردهٔ سینما تا تازه‌ترین خبرهای جهان</h2>\n <p data-en=\"Real news from multiple publishers, new releases and official posters. Server-side updates every three hours; no direct TMDB connection required for visitors.\">خبرهای واقعی از رسانه‌های معتبر، تازه‌ترین اکران‌ها، فیلم‌های در راه و ترندهای این هفته؛ همراه با به‌روزرسانی خودکار.</p>\n <div class=\"cn-hero-foot\"><button type=\"button\" class=\"btn primary cn-refresh\" id=\"cnRefresh\" data-en=\"↻ Refresh cinema news and movies\">↻ تازه‌سازی اخبار و فیلم‌ها</button>\n <span class=\"cn-updated\" id=\"cnUpdated\" role=\"status\" aria-live=\"polite\"></span></div>\n</div>\n<section class=\"cn-block\" aria-labelledby=\"cnNewsHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnNewsHeading\" data-en=\"Latest world cinema news\">آخرین اخبار سینمای جهان</h3><p data-en=\"Original headlines, publisher, and first-seen time\">عنوان واقعی خبر، رسانه و زمان رصد خبر</p></div>\n <a href=\"https://www.google.com/search?tbm=nws&amp;q=international+cinema+news\" rel=\"noopener noreferrer\" target=\"_blank\" data-en=\"More news\">خبرهای بیشتر</a></div>\n <div class=\"cn-news-grid\" id=\"cnNewsFeed\" aria-live=\"polite\"></div>\n <div class=\"cn-source-strip\" id=\"cnSources\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnNowHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnNowHeading\" data-en=\"Now playing in cinemas\">تازه روی پردهٔ سینما</h3><p data-en=\"Current US theatrical releases according to TMDB\">فیلم‌های در حال اکران در منطقهٔ آمریکا بر اساس TMDB</p></div>\n <a href=\"https://www.themoviedb.org/movie/now-playing\" rel=\"noopener noreferrer\" target=\"_blank\" data-en=\"All releases\">همه اکران‌ها</a></div>\n <div class=\"cn-film-grid\" id=\"cnNowPlaying\" aria-live=\"polite\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnUpcomingHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnUpcomingHeading\" data-en=\"Coming soon\">به‌زودی روی پرده</h3><p data-en=\"Upcoming release dates in the US region\">فیلم‌های با تاریخ اکران آینده در منطقه آمریکا</p></div></div>\n <div class=\"cn-film-grid\" id=\"cnUpcoming\" aria-live=\"polite\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnTrendHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnTrendHeading\" data-en=\"Trending this week\">محبوب‌های این هفته</h3><p data-en=\"TMDB weekly trends — these are not necessarily new releases\">ترندهای هفتگی TMDB؛ لزوماً اکران تازه نیستند</p></div></div>\n <div class=\"cn-film-grid\" id=\"cnTrending\" aria-live=\"polite\"></div>\n</section>\n<div class=\"cn-footnote\" id=\"cnAttribution\"></div>\n";
if(EN)root.querySelectorAll('[data-en]').forEach(node=>{node.textContent=node.getAttribute('data-en');});
el('cnSources').innerHTML=L('خبرگزاری‌ها: ','News publishers: ')+srcList.map(x=>'<a href="'+x[1]+'" target="_blank" rel="noopener noreferrer">'+x[0]+'</a>').join(' · ');
el('cnAttribution').innerHTML=L('داده‌های فیلم و پوستر از ','Movie data and posters from ')+'<a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>. '
 +L('این سایت از TMDB API استفاده می‌کند، اما مورد تأیید آن نیست. خبرها از منابع اصلی و ','This product uses the TMDB API but is not endorsed or certified by TMDB. Stories from ')
 +'<span>publisher RSS feeds</span> — '
 +L('برای خواندن خبر، وارد وب‌سایت رسانهٔ اصلی می‌شوی.','follow a headline to the original publication.');
for(const id of ['cnNowPlaying','cnUpcoming','cnTrending'])el(id).innerHTML=placeholder(L('در حال دریافت فیلم‌ها…','Loading movies…'));
el('cnNewsFeed').innerHTML=placeholder(L('در حال دریافت خبرهای واقعی…','Loading real news…'));
el('cnRefresh').addEventListener('click',()=>refresh(true));
root.addEventListener('error',e=>{
 if(e.target instanceof HTMLImageElement){
  const img=e.target;
  console.warn('Image did not load:',img.src);
  const parent=img.parentElement;img.remove();
  if(parent){
   const fall=document.createElement('span');
   fall.className='cn-image-fallback';fall.setAttribute('aria-hidden','true');
   fall.textContent=parent.classList.contains('cn-film-poster')?'🎞':'✦';
   parent.appendChild(fall);
  }
 }
},true);
initLocalMovieDetails();
const visible=()=>state.tab==='news'&&!document.hidden;
document.getElementById('tab-news')?.addEventListener('click',()=>{if(Date.now()-lastCheck>N_TTL)refresh(false);});
document.addEventListener('visibilitychange',()=>{if(visible()&&Date.now()-lastCheck>N_TTL)refresh(false);});
window.addEventListener('online',()=>{if(visible())refresh(true);});
setInterval(()=>{if(visible()&&Date.now()-lastCheck>N_TTL)refresh(false);},N_TTL);
document.title=L('My Film Archive | اخبار سینمای جهان','My Film Archive | World Cinema News');
refresh(false);
})();