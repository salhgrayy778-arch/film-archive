'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('group-watch-realtime.js','utf8');
const channels=new Map();
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
class FakeChannel{
 constructor(topic){this.topic=topic;this.handlers={};this.presence={};this.status='CLOSED';(channels.get(topic)||channels.set(topic,[]).get(topic)).push(this);}
 on(type,filter,fn){this.handlers[type+':'+(filter.event||'')]=fn;return this;}
 subscribe(fn){this.status='SUBSCRIBED';queueMicrotask(()=>fn('SUBSCRIBED'));return this;}
 async send(packet){
  for(const other of channels.get(this.topic)||[]){
   if(other===this||other.status!=='SUBSCRIBED')continue;
   const fn=other.handlers['broadcast:'+packet.event];
   if(fn)queueMicrotask(()=>fn({payload:packet.payload}));
  }
  return 'ok';
 }
 async track(data){
  this.presence=data;
  for(const other of channels.get(this.topic)||[]){
   if(other===this||other.status!=='SUBSCRIBED')continue;
   const fn=other.handlers['presence:sync'];
   if(fn)queueMicrotask(fn);
  }
  return 'ok';
 }
 presenceState(){return {};}
}
const supabase={createClient(){return {channel(topic){return new FakeChannel(topic);},removeChannel(ch){ch.status='CLOSED';return Promise.resolve('ok');}};}};
function makeBrowser(){
 const els=new Map();
 const get=id=>{if(!els.has(id))els.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,open:false,attributes:{},classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},hasAttribute(k){return k in this.attributes;},getAttribute(k){return this.attributes[k];}});return els.get(id);};
 const listeners={};
 const R={peer:null,conn:null,host:false,conns:new Map(),members:new Map(),roomError:null,link:''};
 const ctx={R,EN:false,sb:{url:'https://demo.supabase.co',key:'public-key'},
  window:{supabase,addEventListener(n,fn){listeners[n]=fn;}},
  document:{getElementById:get,querySelector(){return {click(){}};}},
  location:{hash:'',origin:'https://example.test',pathname:'/'},
  navigator:{onLine:true},crypto:webcrypto,URL,Map,Set,Promise,Date,console,
  setTimeout,clearTimeout,setInterval(){return 0;},clearInterval(){},
  nm:()=>get('rName').value||'Guest',rv:()=>({readyState:0,currentTime:0,paused:true}),
  localLabel:(a)=>a,toast(){},rst(){},status(){},displayMembers(){},
  broadcastRoster(){R.roster=(R.roster||0)+1;ctx.rsend({t:'members',list:[{id:R.peer.id,name:ctx.nm()},...Array.from(R.members,([id,name])=>({id,name}))]});},
  onMsg(message,conn){
   if(message.t==='hello'){
    R.members.set(conn.peer,message.name||'Guest');
    if(R.host)ctx.broadcastRoster();
   }else if(message.t==='members'){
    R.receivedRoster=message.list;
   }else if(message.t==='chat'){
    R.receivedChat=message.text;
   }
  },
  startRoom(){},rsend(){},oldLeaveCalls:0,leaveRoom(){R.oldLeaveCalls=(R.oldLeaveCalls||0)+1;clearInterval(R.timer);R.peer=null;},
 };
 ctx.globalThis=ctx;vm.createContext(ctx);
 new vm.Script(source,{filename:'group-watch-realtime.js'}).runInContext(ctx);
 return {ctx,R,get,listeners};
}
async function main(){
 const host=makeBrowser(),guest=makeBrowser();
 await host.ctx.startRoom(true);await flush();
 const code=host.get('rCodeShow').textContent;
 assert.match(code,/^film-[a-f0-9]{24}$/);
 assert.equal(host.R.peer.open,true);
 guest.get('rCode').value=code;
 await guest.ctx.startRoom(false);await flush();
 assert.equal(guest.R.conn.open,true,'guest receives host welcome');
 assert.equal(host.R.conns.size,1,'host records remote guest');
 assert.equal(host.R.members.size,1,'host records guest name');
 assert.ok(guest.R.receivedRoster?.length>=1,'guest receives room roster');
 guest.R.conn.send({t:'chat',text:'hello from another network'});
 await flush();
 assert.equal(host.R.receivedChat,'hello from another network','guest message reaches host');
 host.ctx.leaveRoom();await flush();
 assert.equal(host.R.peer,null);
 guest.ctx.leaveRoom();await flush();
 assert.equal(guest.R.peer,null);
 const invalid=makeBrowser();
 invalid.get('rCode').value='not-a-room';
 await invalid.ctx.startRoom(false);await flush();
 assert.equal(invalid.R.peer,null,'invalid room code is rejected');
 process.stdout.write('PASS: Supabase Realtime host/guest join, roster, guest-to-host message, cleanup, invalid code\\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
