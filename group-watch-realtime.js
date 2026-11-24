/* Supabase Realtime room transport.
   Uses the existing Supabase project as a WebSocket relay, so guests on
   different NATs/mobile networks do not need a direct WebRTC data channel.
   Video bytes are never relayed; only room control/chat metadata is sent.

   Reliability model
   - The room survives tab switches, sign-in/out and short network drops: the
     channel re-joins by itself (soft retry) and is rebuilt (hard retry) when it
     stays silent. The same room id/client id is kept, so nobody has to re-invite.
   - The last room is remembered locally so a reload/accidental close can be
     resumed with the "reconnect" button (R.watchRoomReconnect()).
   - Hello is retried until the host answers, so joining no longer depends on
     the host's channel having been subscribed a split second earlier. */
(function(){
'use strict';
if(typeof R==='undefined'||typeof startRoom!=='function')return;
const $=id=>document.getElementById(id);
const label=(fa,en)=>EN?en:fa;
const oldLeave=leaveRoom;
let channel=null,client=null,clientId='',roomId='',role='';
let joinTimer=0,subscriptionTimer=0,helloTimer=0,watchdog=0,retryTimer=0,softTimer=0;
let everOpen=false,retries=0,lastRx=0,helloTries=0;
const LAST_KEY='film-last-room',LAST_TTL=6*60*60*1000;
const store={
 get(){try{const v=JSON.parse(localStorage.getItem(LAST_KEY)||'null');return v&&/^film-[a-f0-9]{24}$/.test(v.id)&&Date.now()-v.t<LAST_TTL?v:null;}catch(e){return null;}},
 set(v){try{localStorage.setItem(LAST_KEY,JSON.stringify(v));}catch(e){}},
 clear(){try{localStorage.removeItem(LAST_KEY);}catch(e){}}
};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const changed=()=>{try{R.watchRoomStatus?.();}catch(e){}try{window.dispatchEvent?.(new Event('film-room-state'));}catch(e){}};
function connection(peer,open=true){
 return {peer,open,send(message){if(!this.open)return false;return transmit(peer,message);},close(){this.open=false;}};
}
function transmit(to,message){
 if(!channel||!clientId||!R.peer?.open)return Promise.resolve(false);
 return channel.send({type:'broadcast',event:'film-room',payload:{from:clientId,to,message}}).then(v=>v==='ok'||v?.status==='ok').catch(e=>{console.warn('Realtime room send failed',e);return false;});
}
function primaryGuest(){
 for(const c of R.conns.values())if(c.open)return c;
 return null;
}
function clearTimers(){
 clearTimeout(joinTimer);clearTimeout(subscriptionTimer);clearTimeout(retryTimer);clearTimeout(softTimer);
 clearInterval(helloTimer);helloTimer=0;
}
function fail(message){
 clearTimers();
 R.roomError='realtime-failed';R.roomPhase='failed';
 $('rHost').disabled=false;$('rJoin').disabled=false;changed();
 toast(message||label('اتصال واسط اتاق برقرار نشد؛ چند لحظه بعد دوباره تلاش کن','Room relay connection failed; please retry shortly'));
}
/* ---------- incoming ---------- */
function handle(payload){
 if(!payload||payload.from===clientId||!payload.message||typeof payload.message!=='object')return;
 if(role==='host'){
  if(payload.to!==roomId)return;
  lastRx=Date.now();
  const m=payload.message;
  let c=R.conns.get(payload.from),fresh=false;
  if(!c){c=connection(payload.from,true);R.conns.set(payload.from,c);fresh=true;}
  if(!c.open)c.open=true;
  if(!R.conn||!R.conn.open)R.conn=c; /* chat/sync controls talk to "the other side" */
  if(m.t==='hello'){
   if(!m.re)transmit(payload.from,{t:'welcome',host:roomId,name:nm(),uid:R.myUid?R.myUid():''});
  }else if(fresh){
   /* a guest we do not know (host reloaded): ask it to introduce itself again */
   transmit(payload.from,{t:'welcome',host:roomId,name:nm(),uid:R.myUid?R.myUid():'',again:1});
  }
  onMsg(m,c);
  if(m.t==='hello'&&!m.re){
   R.watchRoomSnapshot?.(c);
   if(typeof startPing==='function'&&!R.ping)startPing();
  }
  return;
 }
 if(payload.to!==clientId)return;
 lastRx=Date.now();
 const m=payload.message;
 if(m.t==='welcome'){
  if(m.host!==roomId)return;
  const first=!R.conn?.open;
  clearTimeout(joinTimer);clearInterval(helloTimer);helloTimer=0;
  R.conn=connection(roomId,true);R.roomError=null;R.roomPhase='online';R.hostAway=false;
  R.members.set(roomId,String(m.name||label('میزبان','Host')).slice(0,24));
  R.uids&&R.uids.set(roomId,/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(m.uid||''))?String(m.uid):'');
  if(m.again)transmit(roomId,{t:'hello',name:nm(),uid:R.myUid?R.myUid():'',re:1});
  if(first){
   transmit(roomId,{t:'syncreq'});
   if(typeof startPing==='function'&&!R.ping)startPing();
  }
  R.watchRoomMembers?.();changed();
  return;
 }
 if(!R.conn||!R.conn.open)return;
 onMsg(m,R.conn);
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
function dropChannel(){
 const old=channel;channel=null;
 if(old){try{client?.removeChannel(old);}catch(e){}}
 client=null;
}
function cleanTransport(){
 clearTimers();clearInterval(watchdog);watchdog=0;
 dropChannel();
 clientId='';roomId='';role='';everOpen=false;retries=0;lastRx=0;helloTries=0;
 R.roomPhase='idle';R.hostAway=false;
}
const baseReady=R.watchRoomReady;
R.watchRoomReady=()=>!!(R.peer&&R.peer.open&&(R.host?R.peer.id===roomId&&$('rCodeShow').textContent===roomId:!!R.conn?.open)&&navigator.onLine!==false&&!R.roomError);
rsend=function(message,excludePeer){
 if(!channel||!clientId||!R.peer?.open)return false;
 let sent=false;
 if(R.host){
  for(const c of R.conns.values()){
   if(c.open&&c.peer!==excludePeer){sendTo(c.peer,message);sent=true;}
  }
 }else if(R.conn?.open){sendTo(roomId,message);sent=true;}
 return sent;
};
function sendTo(to,message){
 if(!channel||!clientId)return;
 channel.send({type:'broadcast',event:'film-room',payload:{from:clientId,to,message}})
  .then(result=>{if(result!=='ok'&&result?.status!=='ok')console.warn('Realtime relay response',result);})
  .catch(error=>console.warn('Realtime relay send',error));
}
/* ---------- joining ---------- */
function beginHello(){
 clearInterval(helloTimer);clearTimeout(joinTimer);helloTries=0;
 const send=()=>{
  if(role!=='guest'||!channel||R.conn?.open){clearInterval(helloTimer);helloTimer=0;return;}
  helloTries++;
  sendTo(roomId,{t:'hello',name:nm(),uid:R.myUid?R.myUid():''});
 };
 send();
 helloTimer=setInterval(send,2500);
 joinTimer=setTimeout(()=>{
  clearInterval(helloTimer);helloTimer=0;
  if(!R.conn?.open){
   if(everOpen&&R.hostAway){changed();return;} /* host is away: wait quietly, presence will tell us when it is back */
   fail(label('میزبان پاسخ نمی‌دهد؛ مطمئن شو اتاق هنوز باز است','Host did not respond; make sure the room is still open'));
  }
 },14000);
}
function onState(ch,state){
 if(ch!==channel)return;
 if(state==='SUBSCRIBED'){
  clearTimeout(subscriptionTimer);clearTimeout(retryTimer);clearTimeout(softTimer);
  const again=everOpen;everOpen=true;retries=0;lastRx=Date.now();
  R.roomError=null;R.peer.open=true;R.roomPhase=role==='host'?'online':(R.conn?.open?'online':'connecting');
  ch.track({id:clientId,host:role==='host',name:nm()}).catch(error=>console.warn('Room presence tracking failed',error));
  store.set({id:roomId,host:role==='host',t:Date.now()});
  if(role==='host'){
   $('rCodeShow').textContent=roomId;
   R.link=location.origin+location.pathname+'#join='+roomId;
   $('rCopyLink').hidden=!R.link;$('rInfo').hidden=false;
   $('rHost').disabled=false;$('rJoin').disabled=false;
   if(!R.timer)R.timer=setInterval(()=>{
    const video=rv();
    if(R.host&&R.conns.size&&R.source&&video.readyState>0&&(!video.paused||Date.now()-(R.lastIdleTick||0)>12000)){
     R.lastIdleTick=Date.now();
     rsend({t:'tick',time:video.currentTime,playing:!video.paused});
    }
   },4000);
   if(again)for(const c of R.conns.values())if(c.open)R.watchRoomSnapshot?.(c);
   R.watchRoomMembers?.();
  }else{
   R.conn=connection(roomId,false);
   beginHello();
  }
  changed();
 }else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'||state==='CLOSED'){
  if(!everOpen){
   fail(label('اتصال به سرور اتاق ناموفق بود؛ اینترنت را بررسی کن','Could not connect to room relay; check your connection'));
  }else{
   goReconnecting();
  }
 }
}
function openChannel(){
 readyClient();
 const ch=client.channel('film-room:'+roomId,{
  config:{broadcast:{self:false,ack:true},presence:{key:clientId},private:false}
 });
 channel=ch;
 ch.on('broadcast',{event:'film-room'},({payload})=>handle(payload));
 ch.on('presence',{event:'leave'},({key})=>{
  if(ch!==channel)return;
  if(role==='guest'&&key===roomId){
   if(R.conn)R.conn.open=false;
   R.conn=null;R.hostAway=true;R.watchRoomStatus?.();changed();
  }
  if(role==='host'&&key!==clientId){
   const c=R.conns.get(key);
   if(c){c.close();R.conns.delete(key);R.members.delete(key);
    if(R.conn===c)R.conn=primaryGuest();
    R.watchRoomBroadcastRoster?.();R.watchRoomStatus?.();changed();}
  }
 });
 ch.on('presence',{event:'join'},({key})=>{
  if(ch!==channel)return;
  if(role==='guest'&&key===roomId&&!R.conn?.open){R.hostAway=false;R.conn=connection(roomId,false);beginHello();changed();}
 });
 ch.subscribe(state=>onState(ch,state));
 clearTimeout(subscriptionTimer);
 subscriptionTimer=setTimeout(()=>{
  if(ch===channel&&!R.peer?.open){
   if(everOpen)goReconnecting();
   else fail(label('اتصال به سرور اتاق بیش از حد طول کشید','Room relay connection timed out'));
  }
 },15000);
}
/* ---------- recovery ---------- */
function goReconnecting(){
 if(!R.peer||!roomId)return;
 R.peer.open=false;R.roomPhase='reconnecting';R.roomError=null;
 if(role==='guest'&&R.conn){R.conn.open=false;R.conn=null;}
 clearTimeout(softTimer);clearTimeout(retryTimer);
 changed();
 /* supabase-js re-joins by itself; if it has not within a few seconds, rebuild */
 const wait=Math.min(3000*(retries+1),15000);
 softTimer=setTimeout(()=>{if(R.peer&&!R.peer.open)hardReconnect();},wait);
}
function hardReconnect(manual){
 if(!roomId||!role||!R.peer)return false;
 clearTimers();
 retries++;
 if(!manual&&retries>8){fail(label('اتصال مجدد ناموفق بود؛ دکمهٔ «اتصال مجدد» را بزن','Reconnect failed; press “Reconnect”'));return false;}
 dropChannel();
 R.roomError=null;R.peer.open=false;R.roomPhase='reconnecting';
 if(role==='guest'&&R.conn){R.conn.open=false;R.conn=null;}
 changed();
 try{openChannel();}
 catch(error){
  console.warn('Room reconnect failed',error);
  retryTimer=setTimeout(()=>hardReconnect(false),Math.min(2000*retries,15000));
 }
 return true;
}
R.watchRoomReconnect=function(){
 if(R.peer&&roomId){retries=0;return hardReconnect(true);}
 const last=store.get();
 if(!last)return false;
 $('rCode').value=last.id;
 startRoom(!!last.host,last.id);
 return true;
};
R.watchRoomSaved=()=>store.get();
R.watchRoomForget=()=>store.clear();
leaveRoom=function(){
 cleanTransport();
 try{oldLeave();}catch(error){console.warn('Original room cleanup',error);}
 R.conns.clear();R.members.clear();R.conn=null;R.host=false;R.peer=null;
 changed();
};
startRoom=async function(host,resumeId){
 const raw=$('rCode').value.trim();
 let code=raw;
 try{if(/^https?:\/\//i.test(code))code=new URL(code).hash.replace(/^#join=/,'');}catch(e){}
 code=code.replace(/^#?join=/,'').replace(/[‎‏‌]/g,'').trim();
 if(!host&&!/^film-[a-f0-9]{24}$/.test(code)){
  toast(label('کد اتاق معتبر نیست؛ کد کامل را کپی کن','Invalid room code; copy the full code'));return;
 }
 leaveRoom();
 role=host?'host':'guest';
 if(host){
  if(typeof resumeId==='string'&&/^film-[a-f0-9]{24}$/.test(resumeId))roomId=resumeId;
  else{
   const bytes=crypto.getRandomValues(new Uint8Array(12));
   roomId='film-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  $('rCodeShow').textContent=roomId;
  $('rCode').value=roomId;
  R.host=true;
 }else{
  roomId=code;$('rCode').value=code;R.host=false;
 }
 clientId=host?roomId:uuid();
 R.roomError=null;R.roomPhase='connecting';R.peer={id:host?roomId:clientId,open:false,destroy(){this.open=false;}};
 R.conn=null;R.conns=new Map();R.members=new Map();
 $('rHost').disabled=true;$('rJoin').disabled=true;$('rLeave').hidden=false;
 rst(label('در حال اتصال به سرور اتاق…','Connecting to room relay…'),false);
 try{
  openChannel();
  clearInterval(watchdog);
  watchdog=setInterval(()=>{
   if(!R.peer||!everOpen||navigator.onLine===false)return;
   /* a guest that hears nothing from the host for a long time has a dead socket */
   if(role==='guest'&&R.peer.open&&R.conn?.open&&Date.now()-lastRx>18000){goReconnecting();hardReconnect(false);}
  },5000);
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
window.addEventListener('online',()=>{
 if(R.peer&&roomId&&everOpen){retries=0;hardReconnect(true);}
 else R.watchRoomStatus?.();
});
window.addEventListener('offline',()=>{
 if(R.peer){R.roomPhase='reconnecting';changed();}
});
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{
 if(document.hidden||!R.peer||!roomId||!everOpen)return;
 /* coming back from the background: mobile browsers often kill the socket silently */
 if(!R.peer.open||(Date.now()-lastRx>10000&&(R.host?R.conns.size>0:true)))hardReconnect(true);
 else if(role==='guest'&&R.conn?.open)sendTo(roomId,{t:'syncreq'});
});
})();
