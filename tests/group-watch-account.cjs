/* Group watch account gate: UI stays visible but locked, invites are held until sign-in. */
const assert=require('assert'),vm=require('vm'),fs=require('fs');
function el(){return {hidden:false,textContent:'',inert:false,classList:{_s:new Set(),add(c){this._s.add(c)},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 attrs:{},setAttribute(k,v){this.attrs[k]=v;if(k==='inert')this.inert=true},removeAttribute(k){delete this.attrs[k];if(k==='inert')this.inert=false},scrollIntoView(){},click(){this.clicked=true},value:''};}
const ids={};const get=id=>ids[id]||(ids[id]=el());
const grid=el();const events={};const started=[];const opened=[];
const ctx={setTimeout,R:{},document:{getElementById:get,querySelector:()=>grid},
 window:{addEventListener:(n,f)=>{events[n]=f}},location:{hash:'#join=film-'+'a'.repeat(24)},
 EN:false,ses:null,cloudReady:false,toast(){},openAuth:v=>opened.push(v),
 startRoom:async(h,r)=>{started.push([h,r]);},paintRoomAccountGate(){}};
ctx.window.window=ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('group-watch-account.js','utf8'),ctx);
(async()=>{
 // signed out: UI visible but locked, join is held
 assert.equal(get('roomAccountGate').hidden,false,'notice must be visible');
 assert.equal(grid.hidden,false,'room UI must stay visible');
 assert.ok(grid.classList.contains('roomAuthLocked')&&grid.inert,'room UI locked');
 assert.match(get('roomGateTitle').textContent,/ثبت‌نام/);
 await ctx.startRoom(false);
 assert.equal(started.length,0,'room must not start without an account');
 assert.deepEqual(opened,['signup']);
 // sign in: pending invite resumes
 vm.runInContext("ses={id:'u1'};cloudReady=true;",ctx);
 events['film-account-state']({detail:{signedIn:true,ready:true,id:'u1'}});
 await new Promise(r=>setTimeout(r,400));
 assert.equal(get('roomAccountGate').hidden,true);
 assert.equal(started.length,1,'pending invite opens after sign-in');
 assert.equal(get('rCode').value,'film-'+'a'.repeat(24));
 console.log('PASS: group watch requires account, UI stays visible, invite resumes after sign-in');
})().catch(e=>{console.error(e);process.exit(1);});
