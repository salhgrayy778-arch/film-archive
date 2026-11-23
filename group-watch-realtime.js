/* Supabase Realtime room transport.
   Uses the existing Supabase project as a WebSocket relay, so guests on
   different NATs/mobile networks do not need a direct WebRTC data channel.
   Video bytes are never relayed; only room control/chat metadata is sent. */
(function(){
'use strict';
if(typeof R==='undefined'||typeof startRoom!=='function')return;
const $=id=>document.getElementById(id);
const label=(fa,en)=>EN?en:fa;
const oldLeave=leaveRoom;
let channel=null,client=null,clientId='',roomId='',role='',joinTimer=0,subscriptionTimer=0;
let pending=[];
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
function connection(peer,open=true){
 return {peer,open,send(message){if(!this.open)return false;return transmit(peer,message);},close(){this.open=false;}};
}
function transmit(to,message){
 if(!channel||!clientId)return Promise.resolve(false);
 return channel.send({type:'broadcast',event:'film-room',payload:{from:clientId,to,message}}).then(v=>v==='ok'||v?.status==='ok').catch(e=>{console.warn('Realtime room send failed',e);return false;});
}
function fail(message){
 clearTimeout(joinTimer);clearTimeout(subscriptionTimer);
 R.roomError='realtime-failed';$('rHost').disabled=false;$('rJoin').disabled=false;status();
 toast(message||label('اتصال واسط اتاق برقرار نشد؛ چند لحظه بعد دوباره تلاش کن','Room relay connection failed; please retry shortly'));
}
function handle(payload){
 if(!payload||payload.from===clientId||!payload.message||typeof payload.message!=='object')return;
 if(role==='host'){
  if(payload.to!==roomId)return;
  let c=R.conns.get(payload.from);
  if(!c){c=connection(payload.from,true);R.conns.set(payload.from,c);}
  if(payload.message.t==='hello'){
   transmit(payload.from,{t:'welcome',host:roomId,name:nm()});
  }
  onMsg(payload.message,c);
  return;
 }
 if(payload.to!==clientId)return;
 if(payload.message.t==='welcome'){
  if(payload.message.host!==roomId)return;
  clearTimeout(joinTimer);
  R.conn=connection(roomId,true);
  R.members.set(roomId,String(payload.message.name||label('میزبان','Host')).slice(0,24));
  sendTo(roomId,{t:'syncreq'});
  displayMembers();status();
  return;
 }
 if(!R.conn||!R.conn.open)return;
 onMsg(payload.message,R.conn);
}
function readyClient(){
 if(!window.supabase||typeof window.supabase.createClient!=='function')
  throw new Error('Supabase Realtime client library unavailable');
 if(typeof sb==='undefined'||!sb.url||!sb.key)throw new Error('Supabase configuration missing');
 client=window.supabase.createClient(sb.url,sb.key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  realtime:{params:{eventsPerSecond:30}}
 });
}
function cleanTransport(){
 clearTimeout(joinTimer);clearTimeout(subscriptionTimer);
 if(channel){try{client?.removeChannel(channel);}catch(e){}}
 channel=null;client=null;clientId='';roomId='';role='';pending=[];
}
const baseReady=R.watchRoomReady;
R.watchRoomReady=()=>!!(R.peer&&R.peer.open&&(R.host?R.peer.id===roomId&&$('rCodeShow').textContent===roomId:!!R.conn?.open)&&navigator.onLine!==false&&!R.roomError);
rsend=function(message,excludePeer){
 if(!channel||!clientId)return;
 if(R.host){
  for(const c of R.conns.values()){
   if(c.open&&c.peer!==excludePeer)sendTo(c.peer,message);
  }
 }else if(R.conn?.open)sendTo(roomId,message);
};
function sendTo(to,message){
 if(!channel||!clientId)return;
 channel.send({type:'broadcast',event:'film-room',payload:{from:clientId,to,message}})
  .then(result=>{if(result!=='ok'&&result?.status!=='ok')console.warn('Realtime relay response',result);})
  .catch(error=>console.warn('Realtime relay send',error));
}
leaveRoom=function(){
 cleanTransport();
 try{oldLeave();}catch(error){console.warn('Original room cleanup',error);}
 R.conns.clear();R.members.clear();R.conn=null;R.host=false;R.peer=null;
};
startRoom=async function(host){
 const raw=$('rCode').value.trim();
 let code=raw;
 try{if(/^https?:\/\//i.test(code))code=new URL(code).hash.replace(/^#join=/,'');}catch(e){}
 code=code.replace(/^#?join=/,'').replace(/[\u200e\u200f\u200c]/g,'').trim();
 if(!host&&!/^film-[a-f0-9]{24}$/.test(code)){
  toast(label('کد اتاق معتبر نیست؛ کد کامل را کپی کن','Invalid room code; copy the full code'));return;
 }
 leaveRoom();
 role=host?'host':'guest';
 if(host){
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  roomId='film-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  $('rCodeShow').textContent=roomId;
  $('rCode').value=roomId;
  R.host=true;
 }else{
  roomId=code;$('rCode').value=code;R.host=false;
 }
 clientId=host?roomId:uuid();
 R.roomError=null;R.peer={id:host?roomId:clientId,open:false,destroy(){this.open=false;}};
 R.conn=null;R.conns=new Map();R.members=new Map();
 $('rHost').disabled=true;$('rJoin').disabled=true;$('rLeave').hidden=false;
 rst(label('در حال اتصال به سرور اتاق…','Connecting to room relay…'),false);
 try{
  readyClient();
  channel=client.channel('film-room:'+roomId,{
   config:{broadcast:{self:false,ack:true},presence:{key:clientId},private:false}
  });
  channel.on('broadcast',{event:'film-room'},({payload})=>handle(payload));
  channel.on('presence',{event:'leave'},({key,leftPresences})=>{
   if(role==='guest'&&key===roomId){R.conn=null;R.roomError='host-left';status();}
   if(role==='host'&&key!==clientId){const c=R.conns.get(key);if(c){c.close();R.conns.delete(key);R.members.delete(key);broadcastRoster();status();}}
  });
  channel.subscribe(async state=>{
   if(state==='SUBSCRIBED'){
    clearTimeout(subscriptionTimer);
    R.peer.open=true;
    channel.track({id:clientId,host:!!host,name:nm()}).catch(error=>console.warn('Room presence tracking failed',error));
    if(host){
     $('rCodeShow').textContent=roomId;
     R.link=location.origin+location.pathname+'#join='+roomId;
     $('rCopyLink').hidden=!R.link;$('rInfo').hidden=false;
     $('rHost').disabled=false;$('rJoin').disabled=false;
     R.timer=setInterval(()=>{
      const video=rv();
      if(R.host&&R.conns.size&&R.source&&video.readyState>0)
       rsend({t:'tick',time:video.currentTime,playing:!video.paused});
     },4000);
     status();displayMembers();
    }else{
     R.conn=connection(roomId,false);
     sendTo(roomId,{t:'hello',name:nm()});
     joinTimer=setTimeout(()=>{
      if(!R.conn?.open)fail(label('میزبان پاسخ نمی‌دهد؛ مطمئن شو اتاق هنوز باز است','Host did not respond; make sure the room is still open'));
     },12000);
    }
   }else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'||state==='CLOSED'){
    fail(label('اتصال به سرور اتاق ناموفق بود؛ اینترنت را بررسی کن','Could not connect to room relay; check your connection'));
   }
  });
  subscriptionTimer=setTimeout(()=>{
   if(!R.peer?.open)fail(label('اتصال به سرور اتاق بیش از حد طول کشید','Room relay connection timed out'));
  },15000);
 }catch(error){
  console.error('Room realtime startup failed',error);
  fail(label('راه‌اندازی اتاق ناموفق بود','Could not start the room'));
 }
};
function joinFromInvite(){
 const match=location.hash.match(/^#join=(film-[a-f0-9]{24})$/);
 if(!match||R.peer)return;
 $('rCode').value=match[1];
 $('tab-room')?.click();
 setTimeout(()=>{if(!R.peer&&$('rCode').value===match[1])startRoom(false);},350);
}
window.addEventListener('hashchange',joinFromInvite);
setTimeout(joinFromInvite,0);
window.addEventListener('online',()=>{if(R.peer&&!R.peer.open)status();});
window.addEventListener('offline',()=>{if(R.peer){R.roomError='offline';status();}});
})();
