// Unit test for film-wiki.js with a mocked network (no internet needed).
const assert=require('assert');
const store=new Map();
global.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i],get length(){return store.size;}};
global.window=global;
let calls=[];
global.fetch=async(url)=>{
 const u=new URL(url);calls.push(u.href);const p=u.searchParams;
 const json=o=>({ok:true,status:200,json:async()=>o});
 if(u.host==='www.wikidata.org'){
  if(p.get('list')==='search'){
   return json({query:{search:p.get('srsearch')==='haswbstatement:P4947=603'?[{title:'Q83495'}]:[]}});
  }
  if(p.get('ids')==='Q83495')return json({entities:{Q83495:{labels:{en:{value:'The Matrix'},fa:{value:'ماتریکس'}},sitelinks:{enwiki:{title:'The Matrix'},fawiki:{title:'ماتریکس'}},
   claims:{P57:[{mainsnak:{datavalue:{value:{id:'Q1'}}}}],P161:[{mainsnak:{datavalue:{value:{id:'Q2'}}}}],P495:[{mainsnak:{datavalue:{value:{id:'Q30'}}}}],P136:[{mainsnak:{datavalue:{value:{id:'Q471839'}}}}],
   P577:[{mainsnak:{datavalue:{value:{time:'+1999-03-31T00:00:00Z'}}}}],P2047:[{mainsnak:{datavalue:{value:{amount:'+136',unit:'http://www.wikidata.org/entity/Q7727'}}}}]}}}});
  return json({entities:{Q1:{labels:{en:{value:'Lana Wachowski'}}},Q2:{labels:{en:{value:'Keanu Reeves'}}},Q30:{labels:{en:{value:'United States'}}},Q471839:{labels:{en:{value:'science fiction film'},fa:{value:'علمی‌تخیلی'}}}}});
 }
 if(u.host==='en.wikipedia.org')return json({query:{pages:[{title:'The Matrix',extract:'A hacker learns the truth.',thumbnail:{source:'https://upload.wikimedia.org/wikipedia/en/thumb/d/db/The_Matrix.png/342px-The_Matrix.png'}}]}});
 if(u.host==='fa.wikipedia.org')return json({query:{pages:[{title:'ماتریکس',extract:'یک هکر حقیقت را می‌فهمد.'}]}});
 throw new Error('unexpected '+u.href);
};
require('../film-wiki.js');
(async()=>{
 const w=await window.filmWiki.lookup(603);
 assert.strictEqual(w.title,'The Matrix');assert.strictEqual(w.fa_title,'ماتریکس');
 assert.strictEqual(w.release_date,'1999-03-31');assert.strictEqual(w.runtime,136);
 assert.strictEqual(w.director,'Lana Wachowski');assert.strictEqual(w.cast,'Keanu Reeves');
 assert.strictEqual(w.country,'United States');assert.strictEqual(w.genres_text,'علمی‌تخیلی');
 assert.ok(window.filmWiki.POSTER_OK.test(w.poster_ext));assert.ok(w.overview_fa.includes('هکر'));
 const n=calls.length;
 assert.ok(await window.filmWiki.lookup(603));assert.strictEqual(calls.length,n,'second lookup must come from the cache');
 assert.strictEqual(window.filmWiki.cached(603).qid,'Q83495');
 assert.strictEqual(await window.filmWiki.lookup(999999),null);          // unknown id -> miss
 const m=calls.length;assert.strictEqual(await window.filmWiki.lookup(999999),null);assert.strictEqual(calls.length,m,'misses are cached too');
 assert.strictEqual(await window.filmWiki.lookup('x'),null);
 // a network failure is not cached, so the next call retries
 const keep=global.fetch;global.fetch=async()=>{throw new Error('offline');};
 assert.strictEqual(await window.filmWiki.lookup(4242),null);global.fetch=keep;
 assert.strictEqual(window.filmWiki.cached(4242),null);
 // hostile poster addresses are refused
 assert.ok(!window.filmWiki.POSTER_OK.test('https://evil.example/x.png'));
 console.log('film-wiki ok');
})().catch(e=>{console.error(e);process.exit(1);});
