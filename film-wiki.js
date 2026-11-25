/* Filter-proof film details and posters for titles that are not in the site's own TMDB cache.
 *
 * TMDB's API and image servers are often unreachable from Iran. Wikidata and Wikipedia are not, and Wikidata
 * stores the TMDB movie id of most notable films (property P4947), so a film can be matched by its exact
 * TMDB id, never by guessing from its title. From the matched item we read the director, cast, runtime, date,
 * country and genres; from English/Persian Wikipedia we read the summary and the article's lead image
 * (the film's poster). Every result is cached in this browser, so a film is looked up only once.
 *
 *   window.filmWiki.lookup(tmdbId)   -> Promise<record|null>
 *   window.filmWiki.cached(tmdbId)   -> record|null   (instant, no network)
 */
(function(){
'use strict';
const KEY='film-wiki-v2:',TTL_OK=45*864e5,TTL_MISS=3*864e5,MAX_ENTRIES=420;
const WD='https://www.wikidata.org/w/api.php',EN='https://en.wikipedia.org/w/api.php',FA='https://fa.wikipedia.org/w/api.php';
const POSTER_OK=/^https:\/\/upload\.wikimedia\.org\/[A-Za-z0-9_.\/%,()'!~+-]{10,480}$/;
const tasks=new Map(),waiting=[];let active=0;

function read(id){
 try{
  const v=JSON.parse(localStorage.getItem(KEY+id)||'null');
  if(!v||typeof v!=='object')return null;
  const age=Date.now()-Number(v.t||0);
  if(age>(v.miss?TTL_MISS:TTL_OK)||age<0)return null;
  return v;
 }catch(e){return null;}
}
function prune(){
 try{
  const rows=[];
  for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);if(!k||!k.startsWith(KEY))continue;
   let t=0;try{t=Number(JSON.parse(localStorage.getItem(k)).t)||0;}catch(e){}
   rows.push([k,t]);
  }
  rows.sort((a,b)=>a[1]-b[1]);
  for(const [k] of rows.slice(0,Math.max(40,rows.length-MAX_ENTRIES+40)))localStorage.removeItem(k);
 }catch(e){}
}
function write(id,value){
 const text=JSON.stringify({...value,t:Date.now()});
 try{localStorage.setItem(KEY+id,text);}catch(e){prune();try{localStorage.setItem(KEY+id,text);}catch(_){}}
}
async function getJSON(url,ms=7000){
 const r=await fetch(url,{signal:AbortSignal.timeout?AbortSignal.timeout(ms):undefined,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r.json();
}
const qs=o=>Object.entries(o).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
const claimIds=(claims,p,max)=>(claims?.[p]||[]).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0,max);
function runtimeMinutes(claims){
 const v=claims?.P2047?.[0]?.mainsnak?.datavalue?.value;
 if(!v)return 0;
 const amount=Math.abs(Number(v.amount));if(!amount)return 0;
 const unit=String(v.unit||'').split('/').pop();
 const minutes=unit==='Q11574'?amount/60:unit==='Q25235'?amount*60:amount;
 return minutes>=1&&minutes<1000?Math.round(minutes):0;
}
function dateOf(claims){
 const list=(claims?.P577||[]).map(c=>c?.mainsnak?.datavalue?.value?.time).filter(Boolean).map(t=>String(t).replace(/^\+/,'').slice(0,10)).filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t)).sort();
 const d=list[0]||'';
 return d.replace(/-00/g,'').replace(/-$/,'');
}
const cleanDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)?d:(/^\d{4}/.test(d)?d.slice(0,4):'');
async function wikiPage(base,title){
 if(!title)return null;
 const d=await getJSON(base+'?'+qs({action:'query',titles:title,prop:'pageimages|extracts',piprop:'thumbnail',pithumbsize:342,exintro:1,explaintext:1,exchars:1100,redirects:1,format:'json',formatversion:2,origin:'*'}));
 const p=d?.query?.pages?.[0];
 if(!p||p.missing)return null;
 return {title:p.title,extract:String(p.extract||'').trim(),thumb:String(p.thumbnail?.source||'')};
}
async function resolve(id){
 // 1) exact match on the TMDB id stored in Wikidata
 const found=await getJSON(WD+'?'+qs({action:'query',list:'search',srsearch:'haswbstatement:P4947='+id,srlimit:1,format:'json',formatversion:2,origin:'*'}));
 const qid=found?.query?.search?.[0]?.title;
 if(!/^Q\d+$/.test(qid||''))return {miss:true};
 // 2) the item: claims, Wikipedia titles, labels
 const ent=await getJSON(WD+'?'+qs({action:'wbgetentities',ids:qid,props:'claims|sitelinks|labels',sitefilter:'enwiki|fawiki',languages:'en|fa',format:'json',origin:'*'}));
 const item=ent?.entities?.[qid];if(!item)return {miss:true};
 const claims=item.claims||{};
 const people=claimIds(claims,'P57',3),cast=claimIds(claims,'P161',6),country=claimIds(claims,'P495',2),genres=claimIds(claims,'P136',3);
 const wanted=[...new Set([...people,...cast,...country,...genres])];
 const labels=new Map();
 const need=[
  getJSON(WD+'?'+qs({action:'wbgetentities',ids:wanted.join('|'),props:'labels',languages:'en|fa',format:'json',origin:'*'})).then(d=>{
   for(const [k,v] of Object.entries(d?.entities||{}))labels.set(k,{en:v?.labels?.en?.value||'',fa:v?.labels?.fa?.value||''});
  }).catch(()=>{}),
  wikiPage(EN,item.sitelinks?.enwiki?.title).catch(()=>null),
  wikiPage(FA,item.sitelinks?.fawiki?.title).catch(()=>null)
 ];
 if(!wanted.length)need.shift();
 const out=await Promise.all(need);
 const en=out[out.length-2],fa=out[out.length-1];
 const nm=qid2=>labels.get(qid2)?.en||'';
 const poster=en?.thumb&&POSTER_OK.test(en.thumb)?en.thumb:(fa?.thumb&&POSTER_OK.test(fa.thumb)?fa.thumb:'');
 const record={
  qid,
  title:item.labels?.en?.value||en?.title||'',
  fa_title:item.labels?.fa?.value||'',
  release_date:cleanDate(dateOf(claims)),
  runtime:runtimeMinutes(claims),
  director:people.map(nm).filter(Boolean).join(', '),
  cast:cast.map(nm).filter(Boolean).join(', '),
  country:country.map(nm).filter(Boolean).join(', '),
  genres_text:genres.map(g=>labels.get(g)?.fa||labels.get(g)?.en||'').filter(Boolean).join(' · '),
  overview:en?.extract||'',
  overview_fa:fa?.extract||'',
  poster_ext:poster,
  source:'wikipedia'
 };
 if(!record.title&&!record.overview&&!record.poster_ext&&!record.director)return {miss:true};
 return record;
}
function runNext(){
 while(active<2&&waiting.length){
  const job=waiting.shift();active++;
  resolve(job.id).then(r=>{write(job.id,r);job.done(r.miss?null:r);})
   .catch(()=>job.done(undefined)) // network trouble: do not cache, the caller may retry later
   .finally(()=>{active--;runNext();});
 }
}
function lookup(id){
 id=Number(id);if(!Number.isSafeInteger(id)||id<1)return Promise.resolve(null);
 const hit=read(id);
 if(hit)return Promise.resolve(hit.miss?null:hit);
 if(tasks.has(id))return tasks.get(id);
 const task=new Promise(resolve=>waiting.push({id,done:resolve})).then(v=>v===undefined?null:v).finally(()=>tasks.delete(id));
 tasks.set(id,task);runNext();return task;
}
function cached(id){const hit=read(Number(id));return hit&&!hit.miss?hit:null;}
window.filmWiki={lookup,cached,POSTER_OK};
})();
