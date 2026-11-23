/* TMDB-powered add-film experience.
   Suggestions come from a GitHub-hosted, periodically synchronized subset of TMDB
   rather than the blocked API domain. Full manual entry remains available.
*/
(function(){
'use strict';
const $f=id=>document.getElementById(id);
if(!$f('fTitle')||!$f('tmRes')||typeof openSheet!=='function')return;
const L=(fa,en)=>EN?en:fa;
const SITE=new URL('.',document.currentScript?.src||document.baseURI);
const normalized=value=>String(value||'').normalize('NFKD').toLocaleLowerCase()
  .replace(/[\u064b-\u065f\u0670]/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک')
  .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const canonicalMoviePoster=p=>/^assets\/catalog\/\d+-[a-f0-9]{12}\.webp$/i.test(String(p||''))
  ?new URL(p,SITE).href:'';
const genres={18:'درام',35:'کمدی',80:'جنایی و معمایی',9648:'جنایی و معمایی',
 53:'جنایی و معمایی',27:'ترسناک',878:'علمی‌تخیلی',14:'علمی‌تخیلی',
 28:'اکشن',12:'اکشن',10749:'عاشقانه',99:'مستند',16:'انیمیشن',
 36:'تاریخی و جنگی',10752:'تاریخی و جنگی'};
const escapeHTML=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=$f('fTitle').closest('.field');
field.classList.add('filmTitleField');
$f('fTitle').setAttribute('role','combobox');
$f('fTitle').setAttribute('aria-autocomplete','list');
$f('fTitle').setAttribute('aria-controls','tmRes');
$f('fTitle').setAttribute('aria-expanded','false');
$f('fTitle').setAttribute('placeholder',L('نام فیلم را تایپ کن…','Start typing a film title…'));
$f('fTitle').setAttribute('spellcheck','false');
const sourceText=document.createElement('p');
sourceText.id='tmSuggestHelp';
sourceText.className='tmSuggestHelp';
sourceText.textContent=L('پیشنهادها از فهرست به‌روزشونده TMDB می‌آیند. انتخاب فیلم، مشخصات را پر می‌کند؛ ورود دستی هم آزاد است.','Suggestions come from a regularly updated TMDB catalog. Select a title to auto-fill details, or enter everything manually.');
field.insertBefore(sourceText,$f('fTitle').nextSibling);
// Replace result container to avoid the legacy TMDB click handler, which
// requests the blocked TMDB API and image server from every visitor.
const stale=$f('tmRes'),result=stale.cloneNode(false);
stale.replaceWith(result);result.id='tmRes';result.className='tmSuggestList';
result.hidden=true;result.setAttribute('role','listbox');
result.setAttribute('aria-label',L('پیشنهاد فیلم‌ها از TMDB','TMDB film suggestions'));
field.appendChild(result);
const selected=document.createElement('div');
selected.id='tmSelectedInfo';selected.className='tmSelectedInfo';selected.hidden=true;
selected.setAttribute('role','status');selected.setAttribute('aria-live','polite');
field.appendChild(selected);
const status=document.createElement('span');
status.className='tmCatalogStatus';status.id='tmCatalogStatus';
status.setAttribute('aria-live','polite');
sourceText.insertAdjacentElement('afterend',status);
// Legacy direct search stays available under Movie information.
const oldButton=$f('tmSearch'),directButton=oldButton.cloneNode(true);
oldButton.replaceWith(directButton);
directButton.innerHTML=L('جستجوی مستقیم TMDB (در صورت دسترسی)','Search live TMDB (if accessible)');
directButton.setAttribute('aria-label',L('جستجوی مستقیم در TMDB برای فیلم‌های خارج از فهرست ذخیره‌شده','Search live TMDB for films outside the offline catalog'));
const addButton=$f('addBtn');
addButton.textContent=L('+ اضافه کردن فیلم','+ Add film');
$f('saveBtn').textContent=L('ذخیره فیلم','Save film');
$f('moreDetails').querySelector('summary').textContent=L('اطلاعات فیلم (قابل ویرایش)','Movie details (editable)');
$f('moreHistory').querySelector('summary').textContent=L('یادداشت و دفترچه تماشا','Notes & watch diary');
$f('morePoster').querySelector('summary').textContent=L('پوستر فیلم','Movie poster');
// Retain all historical details and existing field IDs: director, cast,
// year, country, runtime, genre, date, rating, likes and viewing logs.
let catalog=null,catalogLoad=null,requestVersion=0,typedTimer=0;
let activeIndex=-1,visible=[],selectedId=null,usedCatalog=false;
const sectionIsOpen=()=>!!state.form&&$f('overlay').classList.contains('open');
function updateExpanded(value){$f('fTitle').setAttribute('aria-expanded',String(value));}
function hideOptions(){
  result.replaceChildren();result.hidden=true;activeIndex=-1;visible=[];updateExpanded(false);
  $f('fTitle').removeAttribute('aria-activedescendant');
}
function showMessage(message){
  hideOptions();
  result.hidden=false;result.innerHTML='<div class="tmSuggestMessage">'+escapeHTML(message)+'</div>';
  updateExpanded(false);
}
async function loadCatalog(){
 if(catalog)return catalog;
 if(catalogLoad)return catalogLoad;
 status.textContent=L('در حال دریافت فهرست فیلم‌ها…','Loading movie index…');
 catalogLoad=(async()=>{
  const url=new URL('data/tmdb-catalog.json',SITE);
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw Error('catalog '+response.status);
  const data=await response.json();
  if(data.schema_version!==1||!Array.isArray(data.movies))throw Error('invalid catalog');
  catalog=data.movies.filter(m=>Number.isSafeInteger(m?.id)&&m.id>0);
  status.textContent=L('پیشنهاد از '+catalog.length.toLocaleString('fa-IR')+' فیلم TMDB','Suggestions from '+catalog.length.toLocaleString('en-US')+' TMDB films');
  return catalog;
 })().catch(err=>{
  catalogLoad=null;
  status.textContent=L('فهرست آنلاین هنوز آماده نیست؛ فیلم را دستی وارد کن.','The local film index is unavailable; manual entry still works.');
  console.warn('TMDB suggestions catalog unavailable',err);
  return [];
 });
 return catalogLoad;
}
function ranked(query,movie){
 const names=[movie.title,movie.original_title,movie.fa_title].filter(Boolean).map(normalized);
 let rank=-1;
 for(const name of names){
  if(!name)continue;
  if(name===query)rank=Math.max(rank,900);
  else if(name.startsWith(query))rank=Math.max(rank,700);
  else if(name.split(' ').some(w=>w.startsWith(query)))rank=Math.max(rank,480);
  else if(name.includes(query))rank=Math.max(rank,300);
 }
 return rank<0 ? -1 :rank+Math.min(70,Math.log1p(Number(movie.popularity)||0)*7);
}
function activate(index){
 const buttons=[...result.querySelectorAll('[data-tmdb-id]')];
 if(index<0||!buttons.length)return;
 activeIndex=(index+buttons.length)%buttons.length;
 buttons.forEach((btn,i)=>btn.classList.toggle('active',i===activeIndex));
 $f('fTitle').setAttribute('aria-activedescendant',buttons[activeIndex].id);
 buttons[activeIndex].scrollIntoView({block:'nearest',inline:'nearest'});
}
function drawOptions(movies){
 visible=movies;result.hidden=false;updateExpanded(true);
 result.innerHTML=movies.map((m,i)=>{
  const poster=canonicalMoviePoster(m.poster_url);
  const year=String(m.release_date||'').slice(0,4);
  const title=String(EN?m.title:(m.fa_title||m.title)||m.original_title);
  const secondary=String(m.original_title||'');
  return '<button type="button" role="option" class="tmSuggestItem" id="tmOption-'+i+'" data-tmdb-id="'+m.id+'" aria-selected="false">'
   +'<span class="tmSuggestCover">'+(poster?'<img loading="lazy" decoding="async" src="'+escapeHTML(poster)+'" alt="">':'🎬')+'</span>'
   +'<span class="tmSuggestCopy"><strong dir="auto">'+escapeHTML(title)+'</strong>'
   +'<small dir="auto">'+escapeHTML(secondary+(year?' · '+year:''))+'</small></span>'
   +'<span class="tmSuggestPick">'+L('انتخاب','Select')+'</span></button>';
 }).join('');
 activeIndex=-1;
}
async function suggest(){
 const token=++requestVersion;
 const query=normalized($f('fTitle').value);
 if(!sectionIsOpen()||selectedId && !query){hideOptions();return;}
 if(query.length<2){hideOptions();return;}
 let records;
 try{records=await loadCatalog();}catch(err){records=[];}
 if(token!==requestVersion||!sectionIsOpen()||query!==normalized($f('fTitle').value))return;
 if(!records.length){showMessage(L('فهرست TMDB در دسترس نیست؛ می‌توانی اطلاعات را دستی وارد کنی.','TMDB index unavailable. You can still add your film manually.'));return;}
 const rankedMovies=records.map(movie=>({movie,rank:ranked(query,movie)}))
  .filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank).slice(0,7).map(x=>x.movie);
 if(!rankedMovies.length){
  showMessage(L('در فهرست فعلی پیدا نشد. می‌توانی دستی ثبت کنی یا جستجوی مستقیم TMDB را امتحان کنی.','Not in the cached catalog. Add manually or try direct TMDB search.'));
  return;
 }
 drawOptions(rankedMovies);
}
function setFilm(movie){
 if(!movie||!sectionIsOpen())return;
 const title=String(EN?(movie.title||movie.original_title):(movie.fa_title||movie.title||movie.original_title));
 $f('fTitle').value=title;
 $f('fTitleEn').value=movie.original_title||movie.title||'';
 $f('fYear').value=String(movie.release_date||'').slice(0,4);
 $f('fRuntime').value=movie.runtime||'';
 $f('fDirector').value=movie.director||'';
 $f('fCast').value=movie.cast||'';
 $f('fCountry').value=movie.country||'';
 const ids=Array.isArray(movie.genre_ids)?movie.genre_ids:[];
 const genre=ids.map(x=>genres[x]).find(Boolean);
 if(genre)$f('fGenre').value=genre;
 const poster=canonicalMoviePoster(movie.poster_url);
 if(poster)state.form.poster=poster;
 state.form.tmdb=Number(movie.id);
 paintPoster();
 selectedId=movie.id;usedCatalog=true;
 const fields=[movie.director,movie.cast,movie.runtime,movie.country,poster].filter(Boolean).length;
 selected.hidden=false;
 selected.innerHTML='<span class="tmSelectedPoster">'+(poster?'<img src="'+escapeHTML(poster)+'" alt="" loading="lazy">':'🎬')+'</span>'
  +'<span class="tmSelectedCopy"><strong dir="auto">'+escapeHTML(title)+'</strong><small>'
  +escapeHTML(L('✓ '+fields+' مورد از اطلاعات تکمیل شد؛ می‌توانی جزئیات را ویرایش کنی.','✓ '+fields+' details filled; you can still edit everything.'))
  +'</small></span>';
 hideOptions();
 $f('fTitle').focus({preventScroll:true});
}
$f('fTitle').addEventListener('input',()=>{
  if(selectedId!==null && state.form){
    state.form.tmdb='';
    if(String(state.form.poster||'').includes('/assets/catalog/')){
      state.form.poster='';paintPoster();
    }
  }
  selectedId=null;selected.hidden=true;usedCatalog=false;
  clearTimeout(typedTimer);
  typedTimer=setTimeout(suggest,160);
});
$f('fTitle').addEventListener('keydown',e=>{
 if(result.hidden||!visible.length)return;
 if(e.key==='ArrowDown'){e.preventDefault();activate(activeIndex+1);}
 else if(e.key==='ArrowUp'){e.preventDefault();activate(activeIndex<0?visible.length-1:activeIndex-1);}
 else if(e.key==='Enter'&&activeIndex>=0){e.preventDefault();chooseFilm(visible[activeIndex]);}
 else if(e.key==='Escape'){e.stopPropagation();hideOptions();}
});
result.addEventListener('click',event=>{
 const choice=event.target.closest('[data-tmdb-id]');
 if(!choice)return;
 const entry=visible.find(m=>m.id===Number(choice.dataset.tmdbId));
 if(entry)chooseFilm(entry);
});
document.addEventListener('pointerdown',event=>{
 if(!field.contains(event.target))hideOptions();
});
// Search the full TMDB index directly, as an explicit optional action.
// This request may require VPN and never prevents local suggestions or manual entry.
directButton.addEventListener('click',async()=>{
 const q=$f('fTitle').value.trim();
 if(!q){$f('fTitle').focus();return;}
 if(typeof tm!=='function'){showMessage(L('جستجوی مستقیم فعلاً در دسترس نیست','Live TMDB search is unavailable.'));return;}
 directButton.disabled=true;
 result.hidden=false;result.innerHTML='<div class="tmSuggestMessage">'+L('در حال جستجوی زنده…','Searching live TMDB…')+'</div>';
 try{
  const response=await tm('/search/movie',{query:q,language:EN?'en-US':'fa-IR'});
  const ids=new Set((catalog||[]).map(m=>m.id));
  const results=(response.results||[]).slice(0,7).map(m=>{
    const prior=(catalog||[]).find(x=>x.id===m.id);
    return prior||{...m,original_title:m.original_title||m.title,fa_title:'',genre_ids:m.genre_ids||[],details_ok:false};
  });
  if(!results.length){showMessage(L('نتیجه‌ای پیدا نشد','No results found'));return;}
  drawOptions(results);
 }catch(error){showMessage(L('ارتباط مستقیم برقرار نشد؛ از پیشنهادهای ذخیره‌شده یا ورود دستی استفاده کن.','Live TMDB is inaccessible. Use cached suggestions or manual entry.'));}
 finally{directButton.disabled=false;}
});
// Populate full TMDB fields for direct search results if permitted by the user's connection.
async function hydrateLive(movie){
 if(!movie||movie.details_ok!==false||movie.poster_url)return;
 // Optional live-search result. The saved offline TMDB catalog already contains
 // full metadata and doesn't need a second request.
 try{
  const data=await tm('/movie/'+movie.id,{language:EN?'en-US':'fa-IR',append_to_response:'credits'});
  if(!sectionIsOpen()||Number(state.form.tmdb)!==movie.id)return;
  $f('fRuntime').value=data.runtime||'';
  $f('fDirector').value=(data.credits?.crew||[]).filter(x=>x.job==='Director').map(x=>x.name).join('، ');
  $f('fCast').value=(data.credits?.cast||[]).slice(0,6).map(x=>x.name).join('، ');
  $f('fCountry').value=(data.production_countries||[]).map(x=>x.name).join('، ');
  const g=(data.genres||[]).map(x=>genres[x.id]).find(Boolean);
  if(g)$f('fGenre').value=g;
  const summary=selected.querySelector('.tmSelectedCopy small');if(summary)summary.textContent=L('✓ مشخصات تکمیلی فیلم دریافت شد.','✓ Additional movie details retrieved.');
 }catch(error){ /* All fields remain editable; nothing is lost. */ }
}
function chooseFilm(movie){
 setFilm(movie);
 if(movie && movie.details_ok===false && !movie.poster_url)hydrateLive(movie);
}
const oldOpenSheet=openSheet;
openSheet=function(id){
  oldOpenSheet(id);
  requestVersion++;hideOptions();selectedId=null;usedCatalog=false;
  selected.hidden=true;
  $f('sheetTitle').textContent=id?L('ویرایش فیلم','Edit film'):L('اضافه کردن فیلم','Add film');
  if(id){
    selected.hidden=true;
    status.textContent=L('برای تغییر عنوان، نام فیلم را تایپ کن.','Type a new title to search again.');
  }else{
    status.textContent=L('حداقل دو حرف برای نمایش پیشنهادها بنویس.','Type at least two letters for suggestions.');
    loadCatalog();
  }
};
})();
