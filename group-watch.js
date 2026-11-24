/* Multi-participant Watch Room — PeerJS star network, host relays controls/chat.
   No hard-coded participant cap. Actual capacity depends on host bandwidth and PeerJS.
   Loaded after the original app: deliberately replaces room networking only. */
(function () {
'use strict';
if (typeof R === 'undefined' || typeof startRoom !== 'function') return;

R.conns = new Map();
R.members = new Map();
R.uids = new Map(); // room peer id -> account id (for avatars and profile links)
R.myUid = () => (typeof ses!=='undefined' && ses && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(ses.id))) ? ses.id : '';
const cleanUid = v => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v||'')) ? String(v) : '';
R.source = R.url ? {t:'src',url:R.url} : null;
R.roomGeneration = 0;
const $room = id => document.getElementById(id);
const sendOne = (c,m) => { if (c && c.open) { try { c.send(m); return true; } catch(e) {} } return false; };
const activeConnections = () => R.host ? Array.from(R.conns.values()).filter(c => c.open) : (R.conn && R.conn.open ? [R.conn] : []);
const isConnected = () => activeConnections().length > 0;
const roomReady = () => {
  // Room invitations work even when a visitor does not have an account.
  if (navigator.onLine === false || R.roomError || !R.peer || !R.peer.open) return false;
  return R.host ? !!(R.peer.id && $room('rCodeShow').textContent.trim()===R.peer.id)
    : !!(R.conn && R.conn.open);
};
R.watchRoomReady = roomReady;
R.roomError = null;
function updateWatchAccess() {
  const notice=$room('rWatchNotice'),main=document.querySelector('#room .rmain');
  if(!notice || !main) return;
  const ready=roomReady();
  main.inert=!ready;main.setAttribute('aria-disabled',String(!ready));
  main.classList.toggle('watchLocked',!ready);
  notice.hidden=ready;
  const opening=R.peer && !ready && !R.roomError && navigator.onLine!==false;
  notice.textContent=R.roomError
    ? localLabel('اتصال برقرار نشد. کد را دوباره بررسی کن و مطمئن شو میزبان آنلاین است. اگر مشکل ادامه داشت، ممکن است شبکه اتصال همتا‌به‌همتا را مسدود کرده باشد.','Could not connect. Verify the code and that the host is online. Your network may block peer-to-peer traffic.')
    :opening
    ? localLabel('در حال اتصال به اتاق… پس از برقراری ارتباط، امکان واردکردن لینک و تماشای فیلم فعال می‌شود.','Connecting to room… Movie links and playback will unlock once connected.')
    : localLabel('برای واردکردن لینک، انتخاب فیلم و شروع تماشا، ابتدا اتاق بساز یا با کد به یک اتاق بپیوند.','Create a room or join one using a code to unlock movie links, file selection and playback.');
  const controls=['rUrl','rLoad','rFileBtn','rFile','rSub','rCount','rSync','rCinema','cPlay','bigPlay','cBack','cFwd','cMute','cVol','cSpd','cCc','cFull','seek','chIn','chSend'];
  for(const id of controls){const el=$room(id);if(el){if(!ready){if(!el.hasAttribute('data-watch-was-disabled'))el.setAttribute('data-watch-was-disabled',String(!!el.disabled));el.disabled=true;}
    else if(el.hasAttribute('data-watch-was-disabled')){el.disabled=el.getAttribute('data-watch-was-disabled')==='true';el.removeAttribute('data-watch-was-disabled');}}}
  const convert=$room('rConvertMKV');if(convert)convert.disabled=!ready;
}

const memberLabel = () => EN ? ' participants' : ' نفر';
const localLabel = (fa,en) => EN ? en : fa;
const toFaNumber = n => EN ? String(n) : String(n).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const displayMembers = () => {
  const own = [{id:R.peer && R.peer.id || 'self',name:nm(),host:R.host,me:true,uid:R.myUid()}];
  for (const [id,name] of R.members) {
    if (id !== (R.peer && R.peer.id)) own.push({id,name,host:!R.host && !!R.conn && id===R.conn.peer,me:false,uid:R.uids.get(id)||''});
  }
  $room('rMemberCount').textContent=toFaNumber(own.length)+memberLabel();
  const element=$room('rMembers');
  element.replaceChildren();
  for (const p of own) {
    const root=document.createElement('div');root.className='pe '+(p.me?'me':'you')+(p.host?' host':'');root.setAttribute('role','listitem');root.title=p.name;
    const letter=document.createElement('i');letter.textContent=Array.from(p.name)[0]||'?';letter.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=p.name+(p.host?' ★':'')+(p.me?' ('+localLabel('من','me')+')':'');
    root.append(letter,label);element.append(root);
    try{R.decorateMember&&R.decorateMember(root,letter,p);}catch(e){}
  }
};
const status = () => {
  const ready=roomReady(), n=activeConnections().length;
  let text;
  if(navigator.onLine===false) text=localLabel('اینترنت قطع است؛ پس از وصل شدن خودکار برمی‌گردی','No internet; you will rejoin automatically when it is back');
  else if(R.roomError) {
    const network=['network','server-error','socket-error','socket-closed'].includes(R.roomError);
    const missing=['peer-unavailable','join-failed'].includes(R.roomError);
    text=network
      ? localLabel('سرور اتصال در دسترس نیست؛ شبکه یا VPN را بررسی کن','Signaling server unreachable; check network/VPN')
      :missing
      ? localLabel('اتاق پیدا نشد یا میزبان در دسترس نیست','Room not found or host unreachable')
      :localLabel('اتصال اتاق برقرار نشد؛ دوباره تلاش کن','Room connection failed; try again');
  }
  else if(!R.peer) text=localLabel('اتاقی فعال نیست','No active room');
  else if(R.hostAway) text=localLabel('میزبان فعلاً قطع است؛ منتظر بازگشتش…','Host is away; waiting for them to return…');
  else if(R.roomPhase==='reconnecting') text=localLabel('اتصال قطع شد؛ در حال اتصال مجدد…','Connection lost; reconnecting…');
  else if(!ready) text=localLabel('در حال اتصال به اتاق…','Connecting to room…');
  else if(R.host) text=n ? localLabel('اتاق آنلاین · ','Room online · ')+toFaNumber(n+1)+memberLabel()
    : localLabel('اتاق ساخته شد · منتظر مهمان','Room created · Waiting for guests');
  else text=localLabel('به اتاق متصل هستی','Connected to room');
  rst(text,ready);
  $room('peLink')?.classList.toggle('on',ready);
  $room('peYou')?.classList.toggle('off',!ready);
  const indicator=$room('dot');
  indicator.hidden=!R.peer;
  if(!ready && R.peer && !R.roomError && navigator.onLine!==false)indicator.className='pending';
  if(!ready || !n)$room('ping').hidden=true;
  updateWatchAccess();
};
const broadcastRoster = () => {
  if (!R.host || !R.peer || !R.peer.id) return;
  const list=[{id:R.peer.id,name:nm(),uid:R.myUid()},...Array.from(R.members,([id,name])=>({id,name,uid:R.uids.get(id)||''}))];
  rsend({t:'members',list});
  displayMembers();
};
const sendSnapshot = c => {
  if (!c || !c.open) return;
  if (R.source) sendOne(c,R.source);
  const player=rv();
  if (player.readyState>0) {
    sendOne(c,{t:'rate',v:player.playbackRate});
    if (Number.isFinite(player.duration)) sendOne(c,{t:'dur',d:player.duration});
    sendOne(c,{t:'tick',time:player.currentTime,playing:!player.paused,force:1});
  }
};
rst = function(text,on) {
  $room('rst').textContent=text;
  $room('dot').className=on?'on':'';
};
rsend = function(msg,excludePeer) {
  if (msg && msg.t==='syncreq' && R.host) {
    const player=rv();
    for (const c of activeConnections()) sendSnapshot(c);
    return;
  }
  for (const c of activeConnections()) if (!excludePeer || c.peer!==excludePeer) sendOne(c,msg);
};
paintPres = displayMembers;
startPing = function () {
  if (R.ping) return;
  rsend({t:'ping',ts:Date.now()});
  R.ping=setInterval(()=>rsend({t:'ping',ts:Date.now()}),4000);
};
stopPing = function () {
  clearInterval(R.ping);R.ping=null;$room('ping').hidden=true;
};
// Block mixed-content and private-network requests delivered in shared rooms.
const safeSharedVideoUrl = value => {
  if(typeof value!=='string'||value.length>4096)return '';
  try{
    const u=new URL(value);
    const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(u.protocol!=='https:'||u.username||u.password)return '';
    if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')
      ||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)
      ||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ||host==='::1')return '';
    return u.href;
  }catch(error){return '';}
};
// Applies a remote play/pause/seek/tick. Local events are muted only when something actually changes,
// otherwise every host tick would swallow the viewer's own pause/seek for a second.
function applyRemote(m,player){
  const dur=Number.isFinite(player.duration)?player.duration:Infinity;
  let time=Math.min(dur,m.time);
  if(m.t==='tick'&&m.playing&&!player.paused&&!m.force)time+=0.12; // transit allowance
  const drift=Math.abs(player.currentTime-time);
  const hard=m.t==='tick'&&!m.force?1.5:0.5;
  const wantPlay=m.t==='play'||(m.t==='tick'&&m.playing);
  const wantPause=m.t==='pause'||(m.t==='tick'&&!m.playing);
  if(drift>hard){quiet();player.currentTime=time;}
  if(wantPlay&&player.paused){
    quiet();
    player.play().catch(()=>{
      if(Date.now()-(R.playToast||0)>20000){R.playToast=Date.now();toast(localLabel('برای شروع پخش، روی دکمه پلی بزن','Tap play to begin'));}
    });
  }else if(wantPause&&!player.paused){quiet();player.pause();}
}
// Keep the original source selection behavior but remember it for late joiners.
const originalSetSrc=setSrc, originalSetFile=setFile;
setSrc = function(url,fromPeer) {
  const safe=safeSharedVideoUrl(url);
  if(!safe){if(!fromPeer)toast(localLabel('فقط لینک امن HTTPS عمومی برای فیلم مجاز است','Use a public HTTPS movie URL'));return;}
  R.source={t:'src',url:safe};
  return originalSetSrc(safe,fromPeer);
};
setFile = function(file) {
  if (file) R.source={t:'file',name:file.name,size:file.size};
  return originalSetFile(file);
};
const permitted = new Set(['src','file','chat','typing','react','count','rate','dur','play','pause','seek','tick']);
onMsg = function(message,c) {
  if (!message || typeof message!=='object' || typeof message.t!=='string') return;
  if (!c || (R.host ? R.conns.get(c.peer)!==c : R.conn!==c)) return;
  const m=message,player=rv();
  const sender=R.host ? (R.members.get(c.peer)||localLabel('مهمان','Guest')) : (typeof m.name==='string' && m.name ? m.name.slice(0,24) : (R.members.get(c.peer)||localLabel('میزبان','Host')));
  if (m.t==='hello') {
    const name=String(m.name||localLabel('مهمان','Guest')).slice(0,24);
    R.members.set(c.peer,name);
    R.uids.set(c.peer,cleanUid(m.uid));
    if (R.host) broadcastRoster(); else displayMembers();
    status();
    return;
  }
  if (m.t==='members') {
    if (R.host || !Array.isArray(m.list)) return;
    const roster=new Map();
    for (const entry of m.list) {
      if (entry && typeof entry.id==='string' && typeof entry.name==='string' && entry.id!==(R.peer && R.peer.id))
        {roster.set(entry.id,entry.name.slice(0,24));R.uids.set(entry.id,cleanUid(entry.uid));}
    }
    R.members=roster;displayMembers();status();return;
  }
  if (m.t==='ping') {
    if (Number.isFinite(m.ts)) sendOne(c,{t:'pong',ts:m.ts});
    return;
  }
  if (m.t==='pong') {
    if (Number.isFinite(m.ts)) {
      const delay=Math.max(0,Date.now()-m.ts),p=$room('ping');
      p.hidden=false;p.textContent=toFaNumber(delay)+localLabel(' میلی‌ثانیه',' ms');
      p.className='ping '+(delay<150?'g':delay<400?'m':'b');
    }
    return;
  }
  if (m.t==='syncreq') {
    if (R.host) sendSnapshot(c);
    return;
  }
  if (!permitted.has(m.t)) return;
  let forwarded=m;
  if (m.t==='src') {
    const safe=safeSharedVideoUrl(m.url);
    if(!safe)return;
    if(R.url!==safe||!rv().getAttribute('src'))setSrc(safe,true);
    forwarded={t:'src',url:safe};
  } else if (m.t==='file') {
    if (typeof m.name!=='string'||m.name.length>180||!Number.isFinite(m.size)||m.size<0) return;
    const sameFile=R.source&&R.source.t==='file'&&R.source.name===m.name&&R.source.size===m.size;
    R.source={t:'file',name:m.name,size:m.size};
    if (!sameFile && (R.local!==m.name || R.localSize!==m.size))
      chat(localLabel('فایل انتخاب شد: ','Selected file: ')+m.name+localLabel(' — همان فایل را از دستگاه خودت انتخاب کن.',' — open the same file on your device.'),'sys');
  } else if (m.t==='chat') {
    if (typeof m.text!=='string'||!m.text.trim()||m.text.length>4000) return;
    const msg=m.text.slice(0,300);
    $room('typing').hidden=true;chat(msg,'you',sender);
    forwarded={t:'chat',name:sender,text:msg};
  } else if (m.t==='typing') {
    $room('typing').hidden=false;
    clearTimeout(R.typeHide);R.typeHide=setTimeout(()=>$room('typing').hidden=true,2500);
  } else if (m.t==='react') {
    if (!RX.includes(m.k)) return;
    spawnReact(m.k,sender);forwarded={t:'react',k:m.k,name:sender};
  } else if (m.t==='count') {
    countdown(true);
  } else if (m.t==='rate') {
    if (!Number.isFinite(m.v)||m.v<0.25||m.v>4) return;
    quiet();player.playbackRate=m.v;paintSpd();
  } else if (m.t==='dur') {
    if (!Number.isFinite(m.d)||m.d<0) return;
    R.pDur=m.d;checkDur();
  } else {
    if (!Number.isFinite(m.time)||m.time<0) return;
    if (player.readyState>0) applyRemote(m,player);
    else if (m.t==='tick'||m.t==='play'||m.t==='seek') R.pendingSync={m:{t:m.t,time:m.time,playing:m.t==='play'?true:m.playing,force:1},at:Date.now()};
  }
  // Host relays validated actions to all other guests; sender never receives an echo.
  if (R.host && m.t!=='dur') rsend(forwarded,c.peer);
};
wire = function(c) {
  const owner=R.peer;
  if (R.host) {
    const prev=R.conns.get(c.peer);
    if (prev && prev!==c) {try{prev.close();}catch(e){}}
    R.conns.set(c.peer,c);
  } else R.conn=c;
  c.on('open',()=>{
    if (R.peer!==owner) return;
    if (R.host) {
      R.members.set(c.peer,localLabel('مهمان','Guest'));
      R.conn=activeConnections()[0]||null; // compatibility with existing chat/sync controls
      sendOne(c,{t:'hello',name:nm(),uid:R.myUid?R.myUid():''});
      broadcastRoster();
      sendSnapshot(c);
    } else {
      R.members.set(c.peer,localLabel('میزبان','Host'));
      sendOne(c,{t:'hello',name:nm(),uid:R.myUid?R.myUid():''});
      displayMembers();
    }
    startPing();status();
  });
  c.on('data',msg=>{if(R.peer===owner)onMsg(msg,c);});
  c.on('close',()=>{
    if(R.peer!==owner)return;
    if(R.host){
      if(R.conns.get(c.peer)!==c)return;
      R.conns.delete(c.peer);R.members.delete(c.peer);R.uids.delete(c.peer);
      R.conn=activeConnections()[0]||null;
      broadcastRoster();
      chat(localLabel('یک نفر از اتاق خارج شد','A member left the room'),'sys');
    }else{
      if(R.conn!==c)return;
      R.conn=null;R.members.clear();displayMembers();
      chat(localLabel('ارتباط با میزبان قطع شد','Host disconnected'),'sys');
    }
    if(!isConnected())stopPing();
    status();
  });
  c.on('error',()=>toast(localLabel('خطا در اتصال یکی از اعضا','A participant connection error')));
};
leaveRoom = function () {
  const peer=R.peer;
  R.peer=null;R.roomGeneration++;R.roomError=null;
  const video=rv();
  video.pause();video.removeAttribute('src');video.load();
  freeBlob();R.url='';R.local='';R.localSize=0;R.source=null;
  $room('rUrl').value='';$room('rFile').value='';
  $room('rFileName').hidden=true;
  $room('stage').classList.add('noSrc');$room('vph').hidden=false;
  window.dispatchEvent(new Event('film-room-ended'));
  clearInterval(R.timer);R.timer=null;stopPing();
  clearInterval(R.cdT);$room('cdown').hidden=true;
  for(const c of R.conns.values())try{c.close();}catch(e){}
  R.conns.clear();
  if(R.conn)try{R.conn.close();}catch(e){}
  try{peer&&peer.destroy();}catch(e){}
  R.conn=null;R.host=false;R.members.clear();R.link='';
  $room('rHost').disabled=false;$room('rJoin').disabled=false;
  $room('rLeave').hidden=true;$room('rInfo').hidden=true;
  displayMembers();status();
};
startRoom = async function (host) {
  const rawCode=$room('rCode').value.trim();
  let code=rawCode;
  try{if(/^https?:\/\//i.test(code))code=new URL(code).hash.replace(/^#join=/,'');}catch(e){}
  code=code.replace(/^#?join=/,'').replace(/[\u200e\u200f\u200c]/g,'').trim();
  $room('rCode').value=code;
  if(!host&&!/^film-[a-f0-9]{24}$/.test(code)){
    toast(localLabel('کد اتاق نامعتبر است؛ کد کامل را کپی کن','Invalid room code; copy the entire code.'));return;
  }
  R.roomError=null;
  rst(localLabel('در حال اتصال…','Connecting…'),false);
  try{await loadPeer();}catch(e){status();toast(localLabel('کتابخانهٔ اتصال بارگذاری نشد','Connection library failed to load'));return;}
  leaveRoom();R.host=host;$room('rLeave').hidden=false;displayMembers();
  $room('rHost').disabled=true;$room('rJoin').disabled=true;
  if(host) {
    // A hard-to-guess room ID is safer than Math.random-based short codes.
    const secureBytes=new Uint8Array(12);
    if(!globalThis.crypto?.getRandomValues){toast(localLabel('برای ساخت اتاق، سایت را با HTTPS باز کن','Open the site over HTTPS to create a room'));leaveRoom();return;}
    globalThis.crypto.getRandomValues(secureBytes);
    const id='film-'+Array.from(secureBytes,b=>b.toString(16).padStart(2,'0')).join('');
    R.peer=new Peer(id);
    const hostPeer=R.peer;
    R.peer.on('open',pid=>{
      if(R.peer!==hostPeer)return;
      R.roomError=null;
      $room('rCodeShow').textContent=pid;
      R.link=/^https?:$/.test(location.protocol)?location.origin+location.pathname+'#join='+pid:'';
      $room('rCopyLink').hidden=!R.link;
      $room('rInfo').hidden=false;
      $room('rHost').disabled=false;$room('rJoin').disabled=false;
      status();displayMembers();
    });
    R.peer.on('connection',c=>{if(R.peer===hostPeer)wire(c);else c.close();});
  } else {
    R.peer=new Peer();
    const guestPeer=R.peer;
    let joined=false;
    let timeout=null;
    const finish=()=>{clearTimeout(timeout);$room('rHost').disabled=false;$room('rJoin').disabled=false;};
    const joinFailed=(fa,en)=>{
      if(R.peer!==guestPeer||joined)return;
      R.roomError='join-failed';
      finish();status();
      toast(localLabel(fa,en));
    };
    guestPeer.on('open',()=>{
      if(R.peer!==guestPeer)return;
      try {
        const connection=guestPeer.connect(code,{reliable:true});
        if(!connection){joinFailed('امکان اتصال با این کد وجود ندارد','Unable to connect with this code');return;}
        connection.on('open',()=>{joined=true;R.roomError=null;finish();status();});
        connection.on('error',()=>joinFailed('اتصال به اتاق ناموفق بود؛ کد و اینترنت هر دو نفر را بررسی کن','Could not join the room; check the code and both connections'));
        wire(connection);
      } catch(error) {
        console.warn('Group watch connection failed',error);
        joinFailed('امکان ورود به اتاق وجود ندارد؛ دوباره تلاش کن','Unable to join the room; please retry');
      }
    });
    timeout=setTimeout(()=>{
      if(R.peer===guestPeer&&!joined){
        joinFailed('اتاق پیدا نشد یا میزبان در دسترس نیست؛ کد را بررسی کن و مطمئن شو میزبان آنلاین است','Room not found or host unreachable; check the code and make sure the host is online');
      }
    },15000);
  }
  const owner=R.peer;
  R.timer=setInterval(()=>{
    if(R.peer===owner && R.host && isConnected() && R.source && rv().readyState>0)
      rsend({t:'tick',time:rv().currentTime,playing:!rv().paused});
  },4000);
  R.peer.on('error',e=>{if(R.peer!==owner)return;R.roomError=e?.type||'error';
    $room('rHost').disabled=false;$room('rJoin').disabled=false;
    peerErr(e);status();});
  R.peer.on('disconnected',()=>{if(R.peer!==owner)return;status();try{R.peer.reconnect();}catch(e){}});
  status();
};
// Account gating lives in group-watch-account.js.
function readInvite(){
  const match=location.hash.match(/^#join=(film-[a-f0-9]{24})$/);
  if(match){
    $room('rCode').value=match[1];
    $room('tab-room')?.click();
  }
}
R.watchRoomStatus=status;
R.watchRoomMembers=displayMembers;
R.watchRoomBroadcastRoster=broadcastRoster;
R.watchRoomSnapshot=sendSnapshot;
function customizeRoomUI() {
  const tab=$room('tab-room');tab.textContent=localLabel('تماشای گروهی','Group watch');
  const heading=document.querySelector('#room .sec');
  if(heading)heading.lastChild.textContent=localLabel(' اتاق تماشای گروهی',' Group watch room');
  const welcome=document.querySelector('#vph b');if(welcome)welcome.textContent=localLabel('سینمای گروهی شما','Your group cinema');
  const aside=document.querySelector('#room .rside .rbox');
  const oldPresence=aside&&aside.querySelector('.pres');
  if(oldPresence) {
    const head=document.createElement('div');head.className='rbh memberHeading';
    const label=document.createElement('span');label.textContent=localLabel('اعضای اتاق','Room participants');
    const counter=document.createElement('span');counter.id='rMemberCount';counter.className='chip';counter.setAttribute('aria-live','polite');
    head.append(label,counter);
    const list=document.createElement('div');list.id='rMembers';list.className='pres multiPres';
    list.setAttribute('role','list');list.setAttribute('aria-label',localLabel('افراد حاضر در اتاق','Room participants'));
    oldPresence.replaceWith(head,list);
  }
  const joinInput=$room('rCode');joinInput.placeholder=localLabel('کد اتاق گروه','Group room code');
  const label=$room('rInfo')?.querySelector('.lbl');
  if(label)label.textContent=localLabel('کد اتاق (برای دوستانت بفرست)','Room code (share with friends)');
  const sync=$room('rSync');if(sync)sync.lastChild.textContent=localLabel('همگام‌سازی با میزبان','Sync with host');
  const hint=document.querySelector('#room>.hint');
  if(hint)hint.textContent=localLabel(
    'میزبان لینک اتاق را با مهمان‌ها به اشتراک می‌گذارد. ارتباط اعضا از طریق سرور همگام‌سازی اتاق برقرار می‌شود و به اتصال مستقیم دو دستگاه وابسته نیست. میزبان باید آنلاین بماند. چت، واکنش و کنترل پخش همگام می‌شوند؛ خود فایل ویدئو منتقل نمی‌شود و هر نفر باید فایل یا لینک مستقیم فیلم را داشته باشد.',
    'Share the room link with guests. Participants connect through the room relay, not a direct device-to-device connection. The host must stay online. Chat, reactions and playback controls are synchronized; video files are not transferred, so each person needs their own file or a direct URL.'
  );
  const firstHint=document.querySelector('#room .rmain .rbox .hint');
  if(firstHint)firstHint.innerHTML=localLabel(
    'با فایل دستگاه، <b>همهٔ اعضا باید همان فایل</b> را در دستگاه خود انتخاب کنند. فقط زمان پخش همگام می‌شود. میان‌برها: فاصله = پخش/توقف، ← → = ۱۰ ثانیه، F = تمام‌صفحه.',
    'With a local video, <b>all participants need the same file</b> on their own device. Only playback time is synced. Shortcuts: Space = play/pause, ← → = 10 seconds, F = fullscreen.'
  );
  const notice=document.createElement('p');
  notice.id='rWatchNotice';notice.className='rWatchNotice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const grid=document.querySelector('#room .rgrid');grid.parentNode.insertBefore(notice,grid);
  const rstat=$room('rst').closest('.rstat');
  if(rstat){rstat.setAttribute('role','status');rstat.setAttribute('aria-live','polite');rstat.setAttribute('aria-label',localLabel('وضعیت اتصال اتاق','Room connection status'));rstat.title=localLabel('این یک نشانگر وضعیت است، نه دکمه','This is a status indicator, not a button');}
  const style=document.createElement('style');
  style.textContent='.multiPres{display:flex;justify-content:flex-start;flex-wrap:wrap;gap:12px;max-height:228px;overflow-y:auto;padding:12px 5px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}.multiPres .pe{width:calc(25% - 9px);min-width:62px;max-width:90px;gap:4px;text-align:center}.multiPres .pe i{width:42px;height:42px;font-size:18px;box-shadow:none}.multiPres .pe span{font-size:12px;max-width:100%}.multiPres .pe.host i{border-color:var(--gold)}.multiPres .pe.you i{background:var(--strip);color:var(--hero-ink);border-color:var(--accent2);box-shadow:none}.memberHeading{justify-content:space-between}.rWatchNotice{background:var(--panel);color:var(--ink);border:1px solid var(--gold);border-radius:10px;padding:14px 16px;margin:10px 0 16px;font-size:14px}.rWatchNotice[hidden]{display:none!important}#room .rmain.watchLocked{opacity:.45;filter:grayscale(.5);pointer-events:none;user-select:none}#room .rstat{cursor:default}#room .rstat #dot.pending{background:#E7C47E;box-shadow:none}@media(max-width:440px){.multiPres .pe{width:calc(33.3% - 9px)}}';
  document.head.appendChild(style);
  displayMembers();status();
  let renameTimer=0;
  $room('rName').addEventListener('input',()=>{
    clearTimeout(renameTimer);
    renameTimer=setTimeout(()=>{if(R.host)broadcastRoster();},750);
  });
  const share=$room('rShare');
  share.addEventListener('click',()=>{}, {passive:true});
  window.addEventListener('online',status);
  window.addEventListener('hashchange',readInvite);
  readInvite();
  window.addEventListener('offline',status);
  // Any attempted playback outside an active room is blocked, including keyboard shortcuts.
  document.querySelector('#room').addEventListener('keydown',e=>{
    if(!roomReady() && [' ','k','K','ArrowLeft','ArrowRight','f','F'].includes(e.key) && !['INPUT','TEXTAREA'].includes(e.target?.tagName)){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  rv().addEventListener('play',()=>{if(!roomReady())rv().pause();});
  // A play/seek/tick that arrived before the movie had metadata is applied as soon as it is ready.
  const flushPending=()=>{
    const p=R.pendingSync;if(!p||rv().readyState<1)return;
    R.pendingSync=null;
    if(Date.now()-p.at<45000&&roomReady())applyRemote(p.m,rv());
  };
  ['loadedmetadata','canplay'].forEach(ev=>rv().addEventListener(ev,flushPending));
}
customizeRoomUI();
})();