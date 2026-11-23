/* Dependency-free two-client PeerJS signaling simulation for group-watch.js.
   This verifies the actual room module's host/guest networking callbacks. */
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const crypto=require('node:crypto');
const source=readFileSync('group-watch.js','utf8');
const peers=new Map();
const micro=()=>new Promise(resolve=>setTimeout(resolve,0));
class Emitter {
 constructor(){this.listeners=new Map();}
 on(name,fn){const handlers=this.listeners.get(name)||[];handlers.push(fn);this.listeners.set(name,handlers);return this;}
 emit(name,...args){for(const fn of this.listeners.get(name)||[])fn(...args);}
}
class Connection extends Emitter {
 constructor(peer){super();this.peer=peer;this.open=false;this.remote=null;}
 send(value){if(!this.open)throw Error('not open');queueMicrotask(()=>this.remote.open&&this.remote.emit('data',value));}
 close(){if(!this.open)return;this.open=false;this.emit('close');if(this.remote.open)this.remote.close();}
}
let nextGuest=0;
class Peer extends Emitter {
 constructor(id){super();this.id=id||'guest-'+(++nextGuest);this.open=false;this.destroyed=false;
  queueMicrotask(()=>{if(peers.has(this.id)){this.emit('error',{type:'unavailable-id'});return;}
   peers.set(this.id,this);this.open=true;this.emit('open',this.id);});
 }
 connect(id){
  const a=new Connection(id),b=new Connection(this.id);
  a.remote=b;b.remote=a;
  queueMicrotask(()=>{
   const target=peers.get(id);
   if(!target||target.destroyed){a.emit('error',{type:'peer-unavailable'});return;}
   target.emit('connection',b);
   queueMicrotask(()=>{a.open=b.open=true;a.emit('open');b.emit('open');});
  });
  return a;
 }
 destroy(){this.destroyed=true;this.open=false;peers.delete(this.id);}
 reconnect(){this.open=true;}
}
class Element {
 constructor(id){this.id=id;this.value='';this.textContent='';this.hidden=false;
  this.disabled=false;this.open=false;this.dataset={};this.children=[];
  this.attributes=new Map();this.className='';this.style={};this.listeners={};this.inert=false;
  this.classList={add(){},remove(){},toggle(){}};this.parentNode={insertBefore(){}};
  this.lastChild={textContent:''};}
 setAttribute(key,value){this.attributes.set(key,String(value));}
 getAttribute(key){return this.attributes.get(key)||null;}
 hasAttribute(key){return this.attributes.has(key);}
 removeAttribute(key){this.attributes.delete(key);}
 append(...children){this.children.push(...children);}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(...children){this.children=children;}
 replaceWith(){}
 addEventListener(name,fn){this.listeners[name]=fn;}
 closest(){return this;}
 querySelector(){return new Element('nested');}
 pause(){this.paused=true;}
 load(){}
 removeAttribute(){}
}
function browser(){
 const map=new Map();
 const get=id=>{if(!map.has(id))map.set(id,new Element(id));return map.get(id);};
 const document={
  getElementById:get,
  querySelector:()=>get('selector'),
  createElement:type=>new Element(type),
  head:get('head'),body:get('body'),
 };
 const events={};
 const win={addEventListener(n,fn){events[n]=fn;},dispatchEvent(){}};
 const R={peer:null,conn:null,host:false,url:'',timer:null,ping:null,blob:'',local:'',localSize:0,cdT:null,conns:new Map(),members:new Map()};
 const player=get('rv');player.readyState=0;player.paused=true;player.currentTime=0;player.playbackRate=1;
 const context={
  document,window:win,location:{hash:'',protocol:'https:',origin:'https://example.org',pathname:'/index.html'},
  Peer,R,EN:false,ses:null,cloudReady:false,cloudLoading:false,
  navigator:{onLine:true},crypto:crypto.webcrypto,
  URL,Map,Set,Date,Event:class{constructor(n){this.type=n;}},console,
  setTimeout(fn,ms){return setTimeout(fn,Math.min(ms,100));},clearTimeout,
  setInterval(){return 0;},clearInterval(){},
  requireCloud:()=>false,loadPeer:async()=>{},toast:()=>{},
  startRoom(){},leaveRoom(){},paintRoomAccountGate(){},rst(){},
  rsend(){},paintPres(){},startPing(){},stopPing(){},wire(){},onMsg(){},
  setSrc(){},setFile(){},freeBlob(){},setSub(){},
  rv:()=>player,nm:()=>get('rName').value||'Tester',
  chat(){},quiet(){},paintSpd(){},checkDur(){},countdown(){},
  RX:['heart'],spawnReact(){},peerErr(){},uiAll(){},
  globalThis:null
 };
 context.globalThis=context;
 vm.createContext(context);
 new vm.Script(source,{filename:'group-watch.js'}).runInContext(context);
 return {context,get,R};
}
async function wait(){for(let i=0;i<8;i++)await micro();}
async function main(){
 const host=browser(),guest=browser();
 await host.context.startRoom(true);await wait();
 const code=host.get('rCodeShow').textContent;
 assert.match(code,/^film-[a-f0-9]{24}$/);
 assert.equal(host.R.watchRoomReady(),true,'Host is ready before any guests arrive');
 guest.get('rCode').value=code;
 await guest.context.startRoom(false);await wait();
 assert.equal(guest.R.watchRoomReady(),true,'Anonymous guest joins by full code');
 assert.equal(host.R.conns.size,1,'Host receives remote peer');
 assert.equal(host.R.members.size,1,'Host sees joined guest');
 assert.equal(guest.R.members.size,1,'Guest receives host roster');
 assert.match(host.get('rMemberCount').textContent,/۲/);
 guest.context.leaveRoom();await wait();
 assert.equal(host.R.conns.size,0,'Guest leaving removes it from roster');
 const bad=browser();bad.get('rCode').value='film-aaaaaaaaaaaaaaaaaaaaaaaa';
 await bad.context.startRoom(false);await new Promise(resolve=>setTimeout(resolve,140));
 assert.equal(bad.R.watchRoomReady(),false,'Unreachable room remains locked');
 host.context.leaveRoom();bad.context.leaveRoom();
 process.stdout.write('PASS: peer host creation, anonymous guest join, roster sync, disconnect, unreachable code\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
