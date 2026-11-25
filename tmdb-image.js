/* Posters from image.tmdb.org are blocked in Iran. Every <img> that points at TMDB is switched to the site's own
 * Supabase proxy (tmdb-proxy, "img" route). Stored URLs stay untouched; only what the browser loads changes.
 * If the proxy turns out to be missing (image error), the original TMDB address is restored. */
(function(){
'use strict';
const RE=/^https:\/\/image\.tmdb\.org\/t\/p\/(w92|w154|w185|w342|w500)(\/[a-zA-Z0-9_-]{8,90}\.(?:jpg|png|webp))$/;
let dead=false;
const base=()=>(typeof SB_URL==='string'&&SB_URL)||'';
function proxied(src){
 const m=RE.exec(src||'');if(!m||dead||!base())return '';
 return base()+'/functions/v1/tmdb-proxy?img='+encodeURIComponent(m[2])+'&size='+m[1];
}
function fix(img){
 if(!(img instanceof HTMLImageElement))return;
 const src=img.getAttribute('src'),p=proxied(src);if(!p)return;
 img.dataset.tmFixed=src;img.src=p;
}
function scan(root){
 if(root instanceof HTMLImageElement){fix(root);return;}
 root.querySelectorAll?.('img[src^="https://image.tmdb.org/"]').forEach(fix);
}
document.addEventListener('error',e=>{
 const img=e.target;
 if(!(img instanceof HTMLImageElement)||!img.dataset.tmFixed||img.src.indexOf('/functions/v1/tmdb-proxy')<0)return;
 // proxy failed: after the first failure stop using it and go back to the original address once
 const orig=img.dataset.tmFixed;delete img.dataset.tmFixed;img.dataset.tmBack='1';
 if(!img.dataset.tmTried){img.dataset.tmTried='1';dead=true;img.src=orig;}
},true);
new MutationObserver(list=>{
 for(const m of list){
  if(m.type==='attributes')fix(m.target);
  else m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n);});
 }
}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
scan(document);
window.tmdbImg=(size,path)=>proxied('https://image.tmdb.org/t/p/'+size+path)||('https://image.tmdb.org/t/p/'+size+path);
})();
