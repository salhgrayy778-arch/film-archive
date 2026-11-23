/* Film Archive: world cinema homepage, live TMDB lists and GDELT headline index.
   No generated headlines; all journalism links to its original publisher. */
(function(){
'use strict';
if(!document.getElementById('cinemaNews')||typeof tm!=='function')return;
const root=document.getElementById('cinemaNews'),el=id=>document.getElementById(id);
const L=(fa,en)=>EN?en:fa;
const escHtml=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const validURL=x=>{try{const v=new URL(String(x||''));return ['https:','http:'].includes(v.protocol)?v.href:'';}catch(e){return '';}};
const srcList=[['Variety','https://variety.com/v/film/'],['Deadline','https://deadline.com/category/film/'],['The Hollywood Reporter','https://www.hollywoodreporter.com/movies/'],['IndieWire','https://www.indiewire.com/c/film/']];
const N_TTL=15*60000,M_TTL=60*60000;
let fetching=false,lastCheck=0;
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
const posterPath=p=>/^\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/i.test(String(p||''))?'https://image.tmdb.org/t/p/w342'+p:'';
function renderFilm(items,id){
 const host=el(id);
 if(!Array.isArray(items)||!items.length){host.innerHTML=placeholder(L('فیلمی برای نمایش پیدا نشد. دوباره تازه‌سازی کن.','No movies found. Try refreshing.'));return;}
 host.innerHTML=items.slice(0,12).map(m=>{
  const title=String(m.title||m.original_title||'').trim(),cover=posterPath(m.poster_path);
  const href='https://www.themoviedb.org/movie/'+Number(m.id);
  const rating=Number(m.vote_average)||0,release=formattedDay(m.release_date);
  return '<article class="cn-film-card"><a href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="'+escHtml(title)+'"><div class="cn-film-poster">'
   +(cover?'<img src="'+cover+'" loading="lazy" alt="'+escHtml(L('پوستر ','Poster ')+title)+'">':escHtml(L('بدون پوستر','No poster')))
   +'</div><div class="cn-film-details"><h4 dir="auto">'+escHtml(title)+'</h4><p>'+escHtml(release||L('تاریخ نامشخص','Release date unavailable'))+'</p>'
   +(rating>0?'<p class="cn-rating">★ '+escHtml(rating.toFixed(1))+' / 10</p>':'')+'</div></a></article>';
 }).join('');
}
function renderNews(items){
 if(!Array.isArray(items)||!items.length){el('cnNewsFeed').innerHTML=placeholder(L('از سرویس خبر، گزارشی دریافت نشد. خبرهای واقعی را از رسانه‌های پایین دنبال کن.','No current stories were returned. Browse the publisher links below.'),true);return;}
 el('cnNewsFeed').innerHTML=items.slice(0,12).map(a=>{
  const url=validURL(a.url),image=validURL(a.socialimage),title=String(a.title||'').trim();
  if(!url||!title)return '';
  const source=String(a.domain||'').replace(/^www\./,'').slice(0,65),time=seenTime(a.seendate);
  return '<article class="cn-news-card"><a target="_blank" rel="noopener noreferrer" href="'+escHtml(url)+'" aria-label="'+escHtml(title)+'">'
   +'<div class="cn-news-thumb">WORLD CINEMA'+(image?'<img src="'+escHtml(image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'</div>'
   +'<div class="cn-news-info"><h4 dir="auto">'+escHtml(title)+'</h4><div class="cn-news-meta"><span class="cn-source">'+escHtml(source||L('رسانه اصلی','Original publisher'))+'</span>'
   +(time?'<time>'+escHtml(L('رصد: ','Seen: ')+time)+'</time>':'')+'</div></div></a></article>';
 }).join('');
}
async function movies(path){
 const r=await tm(path,{language:EN?'en-US':'fa-IR',region:'US',page:1});
 return (Array.isArray(r.results)?r.results:[]).filter(x=>x&&Number.isSafeInteger(x.id)&&x.id>0&&(x.title||x.original_title)).slice(0,20);
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
    :L('ارتباط با TMDB برقرار نشد؛ بعداً دوباره تلاش کن.','Could not connect to TMDB. Try again later.'));
  return false;
 }
}
async function requestNews(timespan){
 const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
 u.searchParams.set('query','(domain:variety.com OR domain:deadline.com OR domain:hollywoodreporter.com OR domain:indiewire.com) (film OR movie OR cinema OR hollywood OR "box office")');
 u.searchParams.set('mode','ArtList');u.searchParams.set('format','json');
 u.searchParams.set('maxrecords','30');u.searchParams.set('timespan',timespan);u.searchParams.set('sort','DateDesc');
 const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),18000);
 try{
  const resp=await fetch(u,{signal:ac.signal,headers:{Accept:'application/json'}});
  if(!resp.ok)throw Error('News service HTTP '+resp.status);
  const json=await resp.json(),seen=new Set();
  return (Array.isArray(json.articles)?json.articles:[]).filter(a=>{
   const url=validURL(a?.url),title=String(a?.title||'').trim();
   if(!url||!title||seen.has(url))return false;
   seen.add(url);return true;
  }).slice(0,16);
 }finally{clearTimeout(timeout);}
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
  else el('cnNewsFeed').innerHTML=placeholder(L('ارتباط با سرویس خبر برقرار نشد. می‌توانی اخبار را مستقیم از رسانه‌های زیر بخوانی.','News service is unavailable. Follow the original publishers below.'),true);
  return false;
 }
}
async function refresh(force){
 if(fetching)return;
 if(!force&&lastCheck>Date.now()-N_TTL)return;
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
  const stamp=new Date().toLocaleString(EN?'en-US':'fa-IR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  el('cnUpdated').textContent=result.every(Boolean)
   ?L('آخرین بررسی: ','Last checked: ')+stamp
   :L('برخی منابع در دسترس نیستند؛ ممکن است اطلاعات ذخیره‌شده قدیمی باشد. بررسی: ','Some sources are unavailable; cached data may be outdated. Checked: ')+stamp;
 }catch(e){
  el('cnUpdated').textContent=L('بررسی آنلاین ناموفق بود. دوباره تلاش کن.','Live refresh failed. Try again.');
 }finally{fetching=false;btn.disabled=false;btn.textContent=L('↻ تازه‌سازی اخبار و فیلم‌ها','↻ Refresh cinema news and movies');}
}
root.innerHTML="\n<div class=\"cn-hero\">\n <div class=\"cn-eyebrow\"><span class=\"cn-live-dot\"></span> WORLD CINEMA · LIVE EDITION</div>\n <h2 data-en=\"From the big screen to the latest film news\">از پردهٔ سینما تا تازه‌ترین خبرهای جهان</h2>\n <p data-en=\"Real headlines from original publishers, latest theatrical releases, films coming soon, and weekly trends. Automatically refreshed while you browse.\">خبرهای واقعی از رسانه‌های معتبر، تازه‌ترین اکران‌ها، فیلم‌های در راه و ترندهای این هفته؛ همراه با به‌روزرسانی خودکار.</p>\n <div class=\"cn-hero-foot\"><button type=\"button\" class=\"btn primary cn-refresh\" id=\"cnRefresh\" data-en=\"↻ Refresh cinema news and movies\">↻ تازه‌سازی اخبار و فیلم‌ها</button>\n <span class=\"cn-updated\" id=\"cnUpdated\" role=\"status\" aria-live=\"polite\"></span></div>\n</div>\n<section class=\"cn-block\" aria-labelledby=\"cnNewsHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnNewsHeading\" data-en=\"Latest world cinema news\">آخرین اخبار سینمای جهان</h3><p data-en=\"Original headlines, publisher, and first-seen time\">عنوان واقعی خبر، رسانه و زمان رصد خبر</p></div>\n <a href=\"https://www.google.com/search?tbm=nws&amp;q=international+cinema+news\" rel=\"noopener noreferrer\" target=\"_blank\" data-en=\"More news\">خبرهای بیشتر</a></div>\n <div class=\"cn-news-grid\" id=\"cnNewsFeed\" aria-live=\"polite\"></div>\n <div class=\"cn-source-strip\" id=\"cnSources\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnNowHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnNowHeading\" data-en=\"Now playing in cinemas\">تازه روی پردهٔ سینما</h3><p data-en=\"Current US theatrical releases according to TMDB\">فیلم‌های در حال اکران در منطقهٔ آمریکا بر اساس TMDB</p></div>\n <a href=\"https://www.themoviedb.org/movie/now-playing\" rel=\"noopener noreferrer\" target=\"_blank\" data-en=\"All releases\">همه اکران‌ها</a></div>\n <div class=\"cn-film-grid\" id=\"cnNowPlaying\" aria-live=\"polite\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnUpcomingHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnUpcomingHeading\" data-en=\"Coming soon\">به‌زودی روی پرده</h3><p data-en=\"Upcoming release dates in the US region\">فیلم‌های با تاریخ اکران آینده در منطقه آمریکا</p></div></div>\n <div class=\"cn-film-grid\" id=\"cnUpcoming\" aria-live=\"polite\"></div>\n</section>\n<section class=\"cn-block\" aria-labelledby=\"cnTrendHeading\">\n <div class=\"cn-heading\"><div><h3 id=\"cnTrendHeading\" data-en=\"Trending this week\">محبوب‌های این هفته</h3><p data-en=\"TMDB weekly trends — these are not necessarily new releases\">ترندهای هفتگی TMDB؛ لزوماً اکران تازه نیستند</p></div></div>\n <div class=\"cn-film-grid\" id=\"cnTrending\" aria-live=\"polite\"></div>\n</section>\n<div class=\"cn-footnote\" id=\"cnAttribution\"></div>\n";
if(EN)root.querySelectorAll('[data-en]').forEach(node=>{node.textContent=node.getAttribute('data-en');});
el('cnSources').innerHTML=L('خبرگزاری‌ها: ','News publishers: ')+srcList.map(x=>'<a href="'+x[1]+'" target="_blank" rel="noopener noreferrer">'+x[0]+'</a>').join(' · ');
el('cnAttribution').innerHTML=L('داده‌های فیلم و پوستر از ','Movie data and posters from ')+'<a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>. '
 +L('این سایت از API سرویس TMDB استفاده می‌کند اما مورد تأیید یا پشتیبانی TMDB نیست. عنوان خبرها از ','This product uses the TMDB API but is not endorsed or certified by TMDB. News indexed by ')
 +'<a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">GDELT</a> — '
 +L('برای خواندن خبر، وارد وب‌سایت رسانهٔ اصلی می‌شوی.','follow a headline to the original publication.');
for(const id of ['cnNowPlaying','cnUpcoming','cnTrending'])el(id).innerHTML=placeholder(L('در حال دریافت فیلم‌ها…','Loading movies…'));
el('cnNewsFeed').innerHTML=placeholder(L('در حال دریافت خبرهای واقعی…','Loading real news…'));
el('cnRefresh').addEventListener('click',()=>refresh(true));
root.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)e.target.remove();},true);
const visible=()=>state.tab==='news'&&!document.hidden;
document.getElementById('tab-news')?.addEventListener('click',()=>{if(Date.now()-lastCheck>N_TTL)refresh(false);});
document.addEventListener('visibilitychange',()=>{if(visible()&&Date.now()-lastCheck>N_TTL)refresh(false);});
window.addEventListener('online',()=>{if(visible())refresh(true);});
setInterval(()=>{if(visible()&&Date.now()-lastCheck>N_TTL)refresh(false);},N_TTL);
document.title=L('سینمای جهان | اخبار و فیلم‌های جدید','World Cinema | News & New Releases');
refresh(false);
})();