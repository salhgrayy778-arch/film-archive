/* Private profile: photo, bio, ranked favorite movies. Uses Supabase account data. */
(function(){
'use strict';
const T=(fa,en)=>LX(fa,en),base=new URL('.',document.currentScript?.src||document.baseURI);
const dialog=document.createElement('dialog');
dialog.id='accountProfileDialog';dialog.className='accountProfileDialog';
dialog.setAttribute('aria-labelledby','profileDialogTitle');
dialog.innerHTML='<div class="profileShell">'
 +'<header class="profileHeading"><div><span class="profileKicker">MY FILM ARCHIVE · PERSONAL COLLECTION</span>'
 +'<h2 id="profileDialogTitle">'+T('پروفایل سینمایی من','My cinema profile')+'</h2>'
 +'<p>'+T('داستان تو از نگاه فیلم‌هایی که دوست داری','Your story, told through films')+'</p></div>'
 +'<button id="profileClose" class="profileClose" type="button" aria-label="'+T('بستن','Close')+'">✕</button></header>'
 +'<section id="profileRead" class="profileRead">'
 +'<div class="profileHero"><div id="profileReadAvatar" class="profileAvatar profileAvatarLarge" aria-hidden="true"></div>'
 +'<div class="profileIdentity"><h3 id="profileReadName" dir="auto"></h3><p id="profileReadEmail" dir="ltr"></p>'
 +'<p id="profileReadBio" dir="auto"></p></div>'
 +'<button class="profileEditButton" id="profileStartEdit" type="button">'+T('شخصی‌سازی پروفایل','Edit profile')+'</button></div>'
 +'<div class="profileSectionTitle"><h3>'+T('۱۰ فیلم محبوب من','My top 10 films')+'</h3><span id="profileViewCount"></span></div>'
 +'<div id="profileViewFavorites" class="profileViewFavorites"></div>'
 +'<p class="profileFootnote">'+T('این پروفایل در حساب شخصی تو ذخیره می‌شود.','Your profile stays with your account.')+'</p></section>'
 +'<form id="profileEdit" class="profileEdit" hidden>'
 +'<div class="profileEditGrid"><div class="profileAvatarEditor"><div class="profileAvatar" id="profileEditAvatar" aria-hidden="true"></div>'
 +'<label for="profileImageFile">'+T('عکس پروفایل','Profile photo')+'</label>'
 +'<input id="profileImageFile" type="file" accept="image/jpeg,image/png,image/webp">'
 +'<button id="profileRemoveAvatar" class="profileTextButton" type="button">'+T('برداشتن عکس','Remove photo')+'</button>'
 +'<p>'+T('JPEG، PNG یا WebP تا ۵ مگابایت','JPEG, PNG or WebP up to 5 MB')+'</p></div>'
 +'<div class="profileTextFields"><label for="profileDisplayName">'+T('نام نمایشی','Display name')+'</label>'
 +'<input id="profileDisplayName" type="text" maxlength="60" autocomplete="nickname">'
 +'<label for="profileBiography">'+T('بیو','Bio')+'</label>'
 +'<textarea id="profileBiography" maxlength="500" rows="4" placeholder="'+T('سینما برای تو چه معنایی دارد؟','What does cinema mean to you?')+'"></textarea>'
 +'<small id="profileBioCount" class="profileCharacterCount"></small></div></div>'
 +'<div class="profileSectionTitle"><h3>'+T('۱۰ فیلم مورد علاقه','Your favorite 10 films')+'</h3><span id="profileSelectedCount"></span></div>'
 +'<label class="profileSearchLabel" for="profileFilmSearch">'+T('جستجوی فیلم','Find a film')+'</label>'
 +'<div class="profileSearchBar"><span aria-hidden="true">⌕</span>'
 +'<input id="profileFilmSearch" type="search" autocomplete="off" placeholder="'+T('جستجو در آرشیو و TMDB…','Search archive & TMDB…')+'"></div>'
 +'<div id="profileFilmSuggestions" class="profileFilmSuggestions" role="region" aria-label="'+T('پیشنهاد فیلم','Movie suggestions')+'" hidden></div>'
 +'<button id="profileAddOther" class="profileAddOther" type="button" hidden>'+T('افزودن عنوان واردشده به‌صورت دستی','Add entered title manually')+'</button>'
 +'<p class="profileSearchHint">'+T('از آرشیو یا فهرست TMDB انتخاب کن؛ فیلم خارج از فهرست را هم می‌توانی دستی اضافه کنی.','Choose from your archive or TMDB; manual titles are also supported.')+'</p>'
 +'<div id="profileSelectedFavorites" class="profileSelectedFavorites"></div>'
 +'<p id="profileFeedback" class="profileFeedback" role="status" aria-live="polite"></p>'
 +'<div class="profileActions"><button id="profileCancel" type="button" class="profileCancel">'+T('انصراف','Cancel')+'</button>'
 +'<button id="profileSave" type="submit" class="profileSave">'+T('ذخیره در حساب','Save to account')+'</button></div></form></div>';
document.body.appendChild(dialog);
const $=id=>document.getElementById(id);
let draft=null,catalog=null,catalogPromise=null,catalogFailed=false,mode='view',openedBy='';
function feedback(message){$('profileFeedback').textContent=message||'';}
function photo(host,data,initial){
 host.replaceChildren();
 if(data){const im=document.createElement('img');im.src=data;im.alt='';host.appendChild(im);}
 else host.textContent=(String(initial||'').trim().charAt(0)||'🎬').toUpperCase();
}
function posterUrl(source){
 const p=String(source||'');
 if(/^assets\/(?:catalog|posters)\/[a-z0-9_.-]+\.webp$/i.test(p))return new URL(p,base).href;
 try{const u=new URL(p);return u.protocol==='https:'&&!u.username&&!u.password&&p.length<1000?u.href:'';}
 catch(error){return '';}
}
function filmCard(movie,index,editing){
 const source=String(movie.id||'');
 let movieId=/^tmdb:([1-9][0-9]*)$/.exec(source)?.[1]||'';
 if(!movieId&&source.startsWith('archive:')){
  const archived=state.films.find(f=>'archive:'+f.id===source);
  if(Number.isSafeInteger(Number(archived?.tmdb))&&Number(archived?.tmdb)>0)movieId=String(archived.tmdb);
 }
 const clickable=!editing&&Boolean(movieId);
 const card=document.createElement(clickable?'a':'article');card.className='profileFavoriteTile';
 if(clickable){
  const link=new URL(location.href);link.searchParams.delete('user');link.searchParams.delete('q');link.searchParams.set('film',movieId);link.hash='';
  card.href=link.pathname+link.search;card.style.textDecoration='none';card.style.color='inherit';
  card.setAttribute('aria-label',T('بازکردن صفحه فیلم ','Open film page: ')+movie.title);
 }
 const cover=document.createElement('div');cover.className='profileFavoritePoster';
 const url=posterUrl(movie.poster);
 if(url){
  const im=document.createElement('img');im.src=url;im.loading='lazy';im.alt=T('پوستر ','Poster of ')+movie.title;
  im.onerror=()=>{im.remove();cover.textContent='🎞';cover.appendChild(rank);};
  cover.appendChild(im);
 }else cover.textContent='🎞';
 const rank=document.createElement('b');rank.className='profileFavoriteRank';rank.textContent=String(index+1);
 cover.appendChild(rank);card.appendChild(cover);
 const label=document.createElement('strong');label.textContent=movie.title;label.dir='auto';card.appendChild(label);
 if(movie.year){const year=document.createElement('small');year.textContent=movie.year;card.appendChild(year);}
 if(editing){
  const actions=document.createElement('div');actions.className='profileFavoriteTools';
  for(const [type,label,desc] of [['up','↑',T('رتبه بالاتر','Move up')],['down','↓',T('رتبه پایین‌تر','Move down')],['remove','✕',T('حذف','Remove')]]){
   const btn=document.createElement('button');btn.type='button';
   btn.dataset.action=type;btn.dataset.index=String(index);
   btn.textContent=label;btn.title=desc;btn.setAttribute('aria-label',desc+' '+movie.title);
   btn.disabled=(type==='up'&&index===0)||(type==='down'&&index===draft.favorites.length-1);
   actions.appendChild(btn);
  }
  card.appendChild(actions);
 }
 return card;
}
function renderView(){
 if(!ses||!cloudReady)return;
 const p=normalizeAccountProfile(accountProfile);
 photo($('profileReadAvatar'),p.avatar,p.name||ses.email);
 $('profileReadName').textContent=p.name||T('عاشق سینما','Cinema lover');
 $('profileReadEmail').textContent=ses.email||'';
 $('profileReadBio').textContent=p.bio||T('هنوز بیویی ثبت نشده است.','No bio yet.');
 $('profileViewCount').textContent=p.favorites.length+'/10';
 const area=$('profileViewFavorites');area.replaceChildren();
 if(!p.favorites.length){
  const empty=document.createElement('p');empty.className='profileNoFavorites';
  empty.textContent=T('برای ساختن فهرست محبوب‌ها پروفایلت را ویرایش کن.','Edit your profile to choose favorite movies.');
  area.appendChild(empty);
 }else p.favorites.forEach((m,i)=>area.appendChild(filmCard(m,i,false)));
}
function renderSelected(){
 const area=$('profileSelectedFavorites');area.replaceChildren();
 $('profileSelectedCount').textContent=draft.favorites.length+'/10';
 if(!draft.favorites.length){
  const empty=document.createElement('p');empty.className='profileNoFavorites';
  empty.textContent=T('با جستجوی بالا اولین فیلم محبوبت را انتخاب کن.','Find your first favorite above.');
  area.appendChild(empty);
 }else draft.favorites.forEach((m,i)=>area.appendChild(filmCard(m,i,true)));
 if(draft.favorites.length===10){
  $('profileFilmSuggestions').hidden=true;$('profileAddOther').hidden=true;
  feedback(T('۱۰ فیلم انتخاب شده‌اند؛ برای تغییر یکی را حذف کن.','You have selected 10 films. Remove one to make room.'));
 }else feedback('');
}
async function loadCatalog(){
 if(catalog)return catalog;
 if(catalogPromise)return catalogPromise;
 catalogPromise=fetch(new URL('data/tmdb-catalog.json',base),{cache:'default'})
  .then(async r=>{if(!r.ok)throw Error('TMDB catalog unavailable');const j=await r.json();
   catalog=Array.isArray(j.movies)?j.movies.filter(x=>Number.isSafeInteger(x?.id)&&x.id>0):[];return catalog;})
  .catch(e=>{console.warn('Profile catalog unavailable',e);catalogFailed=true;catalogPromise=null;return [];});
 return catalogPromise;
}
const norm=x=>String(x||'').normalize('NFKD').toLocaleLowerCase().replace(/[\u064b-\u065f\u0670]/g,'')
 .replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
function candidates(){
 const records=[];
 for(const f of state.films||[]){
  const id=String(f.id||'');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!f.title)continue;
  records.push({id:'archive:'+id,title:String(f.title).slice(0,160),alt:String(f.titleEn||''),
   year:String(f.year||'').slice(0,4),poster:f.poster||'',my:true});
 }
 for(const m of catalog||[]){
  records.push({id:'tmdb:'+m.id,title:String(!EN&&m.fa_title?m.fa_title:m.title||m.original_title||'').slice(0,160),
   alt:String(m.original_title||m.title||''),year:String(m.release_date||'').slice(0,4),poster:m.poster_url||'',my:false});
 }
 return records;
}
function searchMovies(){
 const q=norm($('profileFilmSearch').value),list=$('profileFilmSuggestions');
 list.replaceChildren();list.hidden=true;$('profileAddOther').hidden=true;
 if(mode!=='edit'||q.length<2||draft.favorites.length>=10)return;
 const selected=new Set(draft.favorites.map(f=>f.id));
 const matches=candidates().map((m,i)=>{
  const a=norm(m.title),b=norm(m.alt);
  let score=a===q||b===q?700:a.startsWith(q)||b.startsWith(q)?520:a.includes(q)||b.includes(q)?280:-1;
  if(score>=0&&m.my)score+=80;
  return {m,i,score};
 }).filter(x=>x.score>=0&&!selected.has(x.m.id))
   .sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,8);
 for(const x of matches){
  const m=x.m,button=document.createElement('button');button.type='button';button.className='profileSuggestionItem';
  const thumb=document.createElement('span');thumb.className='profileSuggestionPoster';
  const src=posterUrl(m.poster);
  if(src){const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';thumb.appendChild(image);}
  else thumb.textContent='🎬';
  button.appendChild(thumb);
  const info=document.createElement('span');info.className='profileSuggestionInfo';
  const title=document.createElement('strong');title.textContent=m.title;title.dir='auto';info.appendChild(title);
  const sub=document.createElement('small');
  sub.textContent=[m.alt!==m.title?m.alt:'',m.year,m.my?T('آرشیو من','My library'):'TMDB'].filter(Boolean).join(' · ');
  info.appendChild(sub);button.appendChild(info);
  button.addEventListener('click',()=>addFavorite(m));list.appendChild(button);
 }
 if(!matches.length){
  const p=document.createElement('p');p.className='profileSearchEmpty';
  p.textContent=catalogFailed?T('فهرست TMDB در دسترس نیست؛ ورود دستی همچنان ممکن است.','Catalog unavailable; manual entry works.')
   :T('نتیجه‌ای پیدا نشد؛ عنوان را دستی وارد کن.','No matches; add the title manually.');
  list.appendChild(p);
 }
 list.hidden=false;$('profileAddOther').hidden=false;
}
function addFavorite(m){
 if(!draft||draft.favorites.length>=10){feedback(T('حداکثر ۱۰ فیلم مجاز است.','Maximum 10 films.'));return;}
 if(draft.favorites.some(f=>f.id===m.id)){feedback(T('این فیلم قبلاً انتخاب شده است.','Already selected.'));return;}
 const item=normalizeAccountProfile({favorites:[m]}).favorites[0];
 if(!item)return;
 if(draft.favorites.some(f=>norm(f.title)===norm(item.title)&&f.year===item.year)){
  feedback(T('این فیلم از قبل در فهرست وجود دارد.','This film is already in your list.'));return;
 }
 draft.favorites.push(item);$('profileFilmSearch').value='';
 $('profileFilmSuggestions').hidden=true;$('profileAddOther').hidden=true;renderSelected();
}
function enterEdit(){
 if(!ses||!cloudReady)return;
 draft=normalizeAccountProfile(accountProfile);mode='edit';
 $('profileRead').hidden=true;$('profileEdit').hidden=false;
 $('profileDisplayName').value=draft.name;$('profileBiography').value=draft.bio;
 $('profileImageFile').value='';$('profileFilmSearch').value='';
 $('profileFilmSuggestions').hidden=true;$('profileAddOther').hidden=true;
 photo($('profileEditAvatar'),draft.avatar,draft.name||ses.email);
 $('profileBioCount').textContent=draft.bio.length+'/500';renderSelected();
 loadCatalog().then(()=>{if(mode==='edit')searchMovies();});
 $('profileDisplayName').focus();
}
function enterView(){
 draft=null;mode='view';$('profileRead').hidden=false;$('profileEdit').hidden=true;renderView();
}
function open(){
 if(!ses||!cloudReady){toast(T('ابتدا وارد حسابت شو.','Sign in to your account first.'));return;}
 openedBy=ses.id;
 if($('auOv')?.classList.contains('open'))closeAuth();
 enterView();
 if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
}
const close=()=>dialog.close?dialog.close():dialog.removeAttribute('open');
$('profileClose').addEventListener('click',close);
dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
$('profileStartEdit').addEventListener('click',enterEdit);
$('profileCancel').addEventListener('click',enterView);
$('profileDisplayName').addEventListener('input',()=>{if(draft)draft.name=$('profileDisplayName').value.slice(0,60);});
$('profileBiography').addEventListener('input',()=>{
 if(draft)draft.bio=$('profileBiography').value.slice(0,500);
 $('profileBioCount').textContent=$('profileBiography').value.length+'/500';
});
$('profileRemoveAvatar').addEventListener('click',()=>{
 if(!draft)return;draft.avatar='';$('profileImageFile').value='';
 photo($('profileEditAvatar'),'',draft.name||ses?.email);
});
$('profileImageFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file||!draft)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
  feedback(T('عکس باید JPEG، PNG یا WebP و حداکثر ۵ مگابایت باشد.','Use JPEG, PNG or WebP up to 5 MB.'));
  e.target.value='';return;
 }
 const owner=openedBy;
 try{
  const url=URL.createObjectURL(file),im=new Image();
  try{await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error('Invalid photo'));im.src=url;});}
  finally{URL.revokeObjectURL(url);}
  if(im.naturalWidth*im.naturalHeight>35e6)throw Error('Huge dimensions');
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  ctx.fillStyle='#192c30';ctx.fillRect(0,0,256,256);
  const side=Math.min(im.naturalWidth,im.naturalHeight);
  ctx.drawImage(im,(im.naturalWidth-side)/2,(im.naturalHeight-side)/2,side,side,0,0,256,256);
  let photoData=canvas.toDataURL('image/jpeg',.76);
  if(photoData.length>160000)photoData=canvas.toDataURL('image/jpeg',.58);
  if(photoData.length>160000)throw Error('Compressed photo too large');
  if(!ses||ses.id!==owner||mode!=='edit'||!draft)return;
  draft.avatar=photoData;photo($('profileEditAvatar'),photoData,draft.name||ses.email);feedback('');
 }catch(error){console.warn('Profile photo processing failed',error);feedback(T('پردازش این تصویر ممکن نشد.','Could not process this image.'));}
});
$('profileFilmSearch').addEventListener('input',searchMovies);
$('profileAddOther').addEventListener('click',()=>{
 const title=$('profileFilmSearch').value.trim().slice(0,160);if(title.length<2)return;
 if(!globalThis.crypto?.getRandomValues){feedback(T('سایت را با HTTPS باز کن.','Open the site with HTTPS.'));return;}
 const data=new Uint8Array(12);crypto.getRandomValues(data);
 const id='custom:'+Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
 addFavorite({id,title,year:'',poster:''});
});
$('profileSelectedFavorites').addEventListener('click',event=>{
 const target=event.target.closest('button[data-action][data-index]');if(!target||!draft)return;
 const index=Number(target.dataset.index),action=target.dataset.action;
 if(!Number.isSafeInteger(index)||index<0||index>=draft.favorites.length)return;
 if(action==='remove')draft.favorites.splice(index,1);
 else if(action==='up'&&index>0)[draft.favorites[index-1],draft.favorites[index]]=[draft.favorites[index],draft.favorites[index-1]];
 else if(action==='down'&&index<draft.favorites.length-1)[draft.favorites[index+1],draft.favorites[index]]=[draft.favorites[index],draft.favorites[index+1]];
 renderSelected();searchMovies();
});
$('profileEdit').addEventListener('submit',async event=>{
 event.preventDefault();if(!draft||mode!=='edit'||!ses||ses.id!==openedBy)return;
 draft.name=$('profileDisplayName').value.trim().slice(0,60);
 draft.bio=$('profileBiography').value.trim().slice(0,500);
 const btn=$('profileSave');btn.disabled=true;btn.textContent=T('در حال ذخیره…','Saving…');feedback('');
 try{
  const ok=await saveAccountProfileDraft(draft);
  if(!ok){feedback(T('ذخیره نشد؛ دوباره تلاش کن.','Save failed. Please retry.'));return;}
  if(!ses||ses.id!==openedBy)return;
  enterView();toast(T('پروفایل در حساب ذخیره شد ✓','Profile saved ✓'));
 }finally{btn.disabled=false;btn.textContent=T('ذخیره در حساب','Save to account');}
});
window.addEventListener('film-account-profile-updated',()=>{
 if(!ses||!cloudReady||ses.id!==openedBy){if(dialog.open)close();return;}
 if(dialog.open&&mode==='view')renderView();
});
window.filmAccountProfile={open};
})();