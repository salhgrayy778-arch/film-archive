/* Dependency-free browser mock smoke test for film-discovery.js.
 * Run with: node tests/film-discovery-smoke.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {URL}=require('node:url');
const {gzipSync}=require('node:zlib');

class FakeElement{
 constructor(tagName='div'){
  this.tagName=tagName.toUpperCase();this.children=[];this.listeners={};
  this.attributes={};this.dataset={};this.value='';this.hidden=false;
  this.textContent='';this.classList={toggle(){}};this.disabled=false;
 }
 set id(value){this._id=value;this.elements[value]=this;}
 get id(){return this._id;}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(...items){this.children=items;}
 prepend(child){this.children.unshift(child);}
 append(child){this.children.push(child);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 addEventListener(type,cb){this.listeners[type]=cb;}
 querySelector(){return null;}
}
function fakeBrowser(startUrl){
 const registry=Object.create(null);
 function create(tag){
  const element=new FakeElement(tag);
  element.elements=registry;
  return element;
 }
 const required=['filmQuickForm','filmQuickInput','filmQuickSubmit','filmQuickSuggestions',
  'filmSearchInput','filmSearchResults','filmSearchCount','filmSearchMore',
  'filmSearchRemote','filmDetailRoot'];
 for(const id of required)create('div').id=id;
 const document={
  currentScript:{src:'https://archive.example/film-archive/film-discovery.js'},
  baseURI:'https://archive.example/film-archive/index.html',
  title:'My Film Archive',
  getElementById(id){return registry[id]||(registry[id]=create());},
  createElement:create,
  createTextNode(text){const n=create('#text');n.textContent=text;return n;},
  addEventListener(){}
 };
 const window={listeners:{},addEventListener(type,cb){this.listeners[type]=cb;},
  scrollTo(){},prompt(){}};
 const location={href:startUrl||'https://archive.example/film-archive/index.html'};
 const history={pushState(info,title,path){location.href=new URL(path,location.href).href;}};
 const movies=[
  {id:10,title:'Interstellar',original_title:'Interstellar',fa_title:'میان‌ستاره‌ای',
   release_date:'2014-11-05',poster_url:'assets/catalog/10-abcdefabcdef.webp',
   overview:'Space exploration.',vote_average:8.8,popularity:100,genre_ids:[878],
   director:'Christopher Nolan',cast:'Matthew McConaughey',country:'United States',runtime:169},
  {id:20,title:'Inception',original_title:'Inception',fa_title:'تلقین',
   release_date:'2010-07-16',poster_url:'assets/catalog/20-abcdefabcdef.webp',
   overview:'A world of dreams.',vote_average:8.3,popularity:90,genre_ids:[28]}
 ];
 const manifest={schema_version:1,movie_count:1278230,id_shards:64,unicode_shards:24,search_buckets:{g:1}};
 const fetch=async url=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('tmdb-universe/manifest.json'))
   return {ok:true,json:async()=>manifest};
  if(path.endsWith('tmdb-universe/search/g.json.gz')||
     path.endsWith('tmdb-universe/by-id/39.json.gz'))
   return new Response(gzipSync(JSON.stringify([[999,'The Great Movie',22]])),{status:200});
  if(path.includes('tmdb-universe/')&&path.endsWith('.gz'))
   return new Response(gzipSync('[]'),{status:200});
  return {ok:true,json:async()=>path.includes('tmdb-catalog')
   ?{movies}:{movies:{now:[{
     id:10,overview:'Space exploration.',overview_fa:'کاوش در فضا.',
     overview_source_for_fa:'Space exploration.',poster_url:movies[0].poster_url
   }]}}};
 };
 const state={tab:'news',films:[]};
 const context={
  document,window,location,history,URL,fetch,Response,DecompressionStream,state,
  ses:{id:'owner-account'},cloudReady:true,cloudLoading:false,EN:false,
  LX:(fa,en)=>fa,
  render:()=>window.filmDiscovery?.onTabRendered(state.tab),
  requireCloud:()=>Boolean(context.ses&&context.cloudReady&&!context.cloudLoading),
  saveFilms:async()=>{context.saveCalls++;return true;},
  saveCalls:0,todayISO:()=>'2026-11-24',newId:()=>('fallback-id'),
  tm:async()=>({results:[]}),
  navigator:{clipboard:{writeText:async()=>{}}},
  console:{warn(){},error(){}},setTimeout:()=>1,clearTimeout:()=>{}
 };
 return {context,registry,movies,location,window,state};
}
async function settle(){for(let i=0;i<15;i++)await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,65));for(let i=0;i<15;i++)await Promise.resolve();}
async function main(){
 const source=readFileSync('film-discovery.js','utf8');
 const compiled=new vm.Script(source,{filename:'film-discovery.js'});
 const {context,registry,state,location,window}=fakeBrowser();
 vm.createContext(context);compiled.runInContext(context);
 await settle();

 window.filmDiscovery.openSearch('Interstellar');
 await settle();
 assert.equal(state.tab,'search');
 assert.equal(registry.filmSearchResults.children.length,1);
 assert.equal(registry.filmSearchResults.children[0].href,
  '/film-archive/index.html?film=10');

 window.filmDiscovery.openFilm(10);
 await settle();
 assert.equal(state.tab,'film');
 assert.equal(new URL(location.href).searchParams.get('film'),'10');
 assert.equal(registry.filmDetailTitle.textContent,'میان‌ستاره‌ای');
 assert.equal(registry.filmDetailSynopsis.textContent,'Space exploration.');
 registry.filmDetailTranslate.onclick();
 assert.equal(registry.filmDetailSynopsis.textContent,'کاوش در فضا.');

 registry.filmWatchToggle.onclick();
 assert.equal(registry.filmProviderChooser.hidden,false);
 const providers=registry.filmProviderChooser.children.filter(el=>el.tagName==='A');
 assert.equal(providers.length,2);
 assert.equal(providers[0].href,'https://almasmovie.app/');
 assert.equal(providers[1].href,'https://moviejavan.com/');
 assert.ok(providers.every(a=>a.target==='_blank'&&a.rel==='noopener noreferrer'));

 await registry.filmMarkWant.onclick();
 assert.equal(state.films.length,1);
 assert.equal(state.films[0].tmdb,10);
 assert.equal(state.films[0].status,'want');
 await registry.filmMarkSeen.onclick();
 assert.equal(state.films.length,1);
 assert.equal(state.films[0].status,'seen');
 assert.equal(state.films[0].date,'2026-11-24');
 assert.equal(context.saveCalls,2);

 context.ses=null;
 registry.filmWatchToggle.onclick();
 assert.equal(registry.filmProviderChooser.hidden,true,'Guest cannot reveal watch providers');
 assert.equal(registry.filmWatchToggle.attributes['aria-expanded'],'false');
 let prevented=false;
 registry.filmProviderChooser.listeners.click({
  target:{closest:selector=>selector==='a.filmProviderCard'?providers[0]:null},
  preventDefault(){prevented=true;}
 });
 assert.equal(prevented,true,'Guest external watch navigation must be blocked');
 await registry.filmMarkWant.onclick();
 assert.equal(context.saveCalls,2,'Guests cannot save movie lists');
 assert.equal(state.films[0].status,'seen');

 location.href='https://archive.example/film-archive/index.html';
 window.listeners.popstate({state:{tab:'news'}});
 assert.equal(state.tab,'news','Back navigation restores prior page');

 window.filmDiscovery.openSearch('Great');
 await settle();
 assert.equal(registry.filmSearchResults.children.length,1,'Universe search result');
 assert.equal(registry.filmSearchResults.children[0].dataset.filmId,'999');
 window.filmDiscovery.openFilm(999);
 await settle();
 assert.equal(registry.filmDetailTitle.textContent,'The Great Movie','Title-only movie page');
 assert.equal(registry.filmDetailSynopsis.textContent,'خلاصه این فیلم موجود نیست.','Do not invent plot');
 const directFull=fakeBrowser('https://archive.example/film-archive/index.html?film=999');
 vm.createContext(directFull.context);compiled.runInContext(directFull.context);
 await settle();
 assert.equal(directFull.state.tab,'film');
 assert.equal(directFull.registry.filmDetailTitle.textContent,'The Great Movie','Direct long-tail ID page');

 const direct=fakeBrowser('https://archive.example/film-archive/index.html?film=20');
 vm.createContext(direct.context);compiled.runInContext(direct.context);
 await settle();
 assert.equal(direct.state.tab,'film','Direct links must open the film page');
 assert.equal(direct.registry.filmDetailTitle.textContent,'تلقین');

 process.stdout.write('PASS: comprehensive gzip title shards, long-tail deep links, Persian plot, guest watch gating, account lists\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
