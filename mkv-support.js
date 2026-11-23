/* MKV support: native playback where supported, optional local FFmpeg.wasm conversion.
   Files stay in the viewer's browser and are not transmitted to the host or peers. */
(function () {
'use strict';
if (typeof R === 'undefined' || typeof setFile !== 'function') return;
const local = (fa,en) => typeof EN!=='undefined' && EN ? en : fa;
const $m = id => document.getElementById(id);
const originalChooseFile=setFile;
const canWatch = () => typeof R.watchRoomReady === 'function' && R.watchRoomReady();
const lockedNotice = () => toast(local('اول اتاق بساز یا به یک اتاق متصل شو.','Create or join a room before choosing a movie.'));
let selectedMKV=null,requestId=0,converting=false,ff=null;
const MAX_CONVERT_BYTES=128*1024*1024; // WASM uses several copies of the input
const CDN='https://cdn.jsdelivr.net/npm/';
const FF_VERSION='@ffmpeg/ffmpeg@0.12.15/dist/umd/';
const CORE_VERSION='@ffmpeg/core@0.12.10/dist/umd/';
function convertButton() {
  let btn=$m('rConvertMKV');
  if(btn)return btn;
  btn=document.createElement('button');
  btn.id='rConvertMKV';btn.type='button';btn.className='btn';btn.hidden=true;
  btn.textContent=local('تبدیل MKV برای پخش','Convert MKV for playback');
  btn.style.cssText='min-height:44px;white-space:normal';
  $m('rFileBtn').insertAdjacentElement('afterend',btn);
  btn.addEventListener('click',convertSelected);
  return btn;
}
function showMKVHelp(file) {
  const btn=convertButton();
  selectedMKV=/\.mkv$/i.test(file?.name||'') ? file : null;
  const selectedId=++requestId;
  btn.hidden=!selectedMKV;
  btn.disabled=false;
  btn.textContent=selectedMKV && selectedMKV.size>MAX_CONVERT_BYTES
    ? local('MKV بزرگ: راهنمای تبدیل','Large MKV: conversion guide')
    : local('تبدیل MKV برای پخش','Convert MKV for playback');
  if(selectedMKV) {
    toast(local('فایل MKV انتخاب شد؛ اگر پخش نشد، دکمهٔ تبدیل را بزن.','MKV file selected. If it does not play, tap Convert.'));
  }
  return selectedId;
}
setFile=function(file) {
  if(!file)return;
  if(!canWatch()){lockedNotice();return;}
  const result=originalChooseFile(file);
  showMKVHelp(file);
  return result;
};
const originalSetSrc=setSrc;
setSrc=function(url,fromPeer) {
  if(!canWatch()){lockedNotice();return;}
  selectedMKV=null;requestId++;
  convertButton().hidden=true;
  return originalSetSrc(url,fromPeer);
};
function linkScript(url) {
  return new Promise((resolve,reject)=>{
    if(window.FFmpegWASM&&window.FFmpegWASM.FFmpeg)return resolve();
    const element=document.createElement('script');
    element.src=url;element.async=true;
    element.onload=()=>window.FFmpegWASM?.FFmpeg?resolve():reject(new Error('FFmpeg class unavailable'));
    element.onerror=()=>reject(new Error('Could not load FFmpeg script'));
    document.head.appendChild(element);
  });
}
async function blobFromURL(url,type) {
  const res=await fetch(url,{mode:'cors'});
  if(!res.ok)throw new Error('download HTTP '+res.status);
  return URL.createObjectURL(new Blob([await res.arrayBuffer()],{type}));
}
async function getFFmpeg() {
  if(ff&&ff.loaded)return ff;
  // FFmpeg.wasm's worker is created from a Blob URL to avoid cross-origin worker restrictions.
  await linkScript(CDN+FF_VERSION+'ffmpeg.js');
  const temporary=[];
  try {
    const classWorkerURL=await blobFromURL(CDN+FF_VERSION+'814.ffmpeg.js','text/javascript');
    temporary.push(classWorkerURL);
    const coreURL=await blobFromURL(CDN+CORE_VERSION+'ffmpeg-core.js','text/javascript');
    temporary.push(coreURL);
    const wasmURL=await blobFromURL(CDN+CORE_VERSION+'ffmpeg-core.wasm','application/wasm');
    temporary.push(wasmURL);
    ff=new window.FFmpegWASM.FFmpeg();
    ff.on('progress',({progress})=>{
      if(!converting)return;
      const p=Math.round(Math.max(0,Math.min(1,Number(progress)||0))*100);
      convertButton().textContent=local('در حال تبدیل… ','Converting… ')+p+'%';
    });
    await ff.load({classWorkerURL,coreURL,wasmURL});
    return ff;
  } finally {
    // Worker / WASM load is complete here; revoke temporary local blob links.
    temporary.forEach(u=>URL.revokeObjectURL(u));
  }
}
async function convertSelected() {
  const file=selectedMKV;
  if(!file||converting)return;
  if(!canWatch()){lockedNotice();return;}
  if(file.size>MAX_CONVERT_BYTES) {
    toast(local('تبدیل MKV بزرگ با FFmpeg یا HandBrake به MP4 با H.264 و AAC انجام شود.','For large MKV, convert on your computer to MP4 (H.264 video + AAC audio) with FFmpeg or HandBrake.'));
    return;
  }
  if(!window.Worker||!window.WebAssembly) {
    toast(local('مرورگر از تبدیل ویدئو پشتیبانی نمی‌کند','This browser cannot convert video'));
    return;
  }
  const token=requestId,btn=convertButton();
  converting=true;btn.disabled=true;
  btn.textContent=local('در حال بارگذاری موتور تبدیل…','Loading converter…');
  try {
    const engine=await getFFmpeg();
    if(token!==requestId||!canWatch())return;
    btn.textContent=local('در حال خواندن ویدئو…','Reading video…');
    await engine.writeFile('movie-input.mkv',new Uint8Array(await file.arrayBuffer()));
    if(token!==requestId||!canWatch())return;
    // Re-encode to browser-compatible H.264/AAC. Slow on large devices, so 128 MB cap.
    const exitCode=await engine.exec([
      '-i','movie-input.mkv','-map','0:v:0','-map','0:a:0?',
      '-c:v','libx264','-preset','ultrafast','-crf','26',
      '-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',
      '-movflags','+faststart','movie-output.mp4'
    ],300000);
    if(exitCode!==0)throw new Error('ffmpeg exited '+exitCode);
    const bytes=await engine.readFile('movie-output.mp4');
    if(token!==requestId||!canWatch())return;
    // Keep the originally shared file metadata; participants still select their own source.
    freeBlob();
    R.blob=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
    attach(R.blob);
    btn.hidden=true;selectedMKV=null;
    toast(local('MKV به MP4 تبدیل شد؛ آمادهٔ پخش است.','MKV converted to MP4 and is ready to play.'));
  } catch(error) {
    console.warn('MKV conversion',error);
    toast(local('تبدیل در مرورگر انجام نشد. با HandBrake/FFmpeg آن را به MP4 با H.264/AAC تبدیل کن.','Browser conversion failed. Use HandBrake/FFmpeg to convert to MP4 with H.264/AAC.'));
  } finally {
    converting=false;btn.disabled=false;
    if(selectedMKV)btn.textContent=local('تبدیل MKV برای پخش','Convert MKV for playback');
    // Do not keep multi-hundred-MB WASM FS allocations after conversion.
    if(ff) {try{ff.terminate();}catch(e){}ff=null;}
  }
}
convertButton();
window.addEventListener('film-room-ended',()=>{
  selectedMKV=null;requestId++;
  convertButton().hidden=true;
});
const mkvHint=document.createElement('p');
mkvHint.className='hint';
mkvHint.textContent=local(
  'پشتیبانی MKV: فایل را انتخاب کن؛ در مرورگرهای سازگار مستقیم پخش می‌شود. برای فایل‌های MKV تا ۱۲۸ مگابایت می‌توانی تبدیل MP4 را امتحان کنی (نیاز به اینترنت، حافظه و زمان پردازش دارد). برای فیلم‌های بزرگ از HandBrake یا FFmpeg استفاده کن. خود فایل به اعضای اتاق منتقل نمی‌شود.',
  'MKV support: choose a file for native playback where supported. For MKV clips up to 128 MB, optional local MP4 conversion may work (requires internet, memory and CPU time). Use HandBrake or FFmpeg for large files. Movie files are never sent to other room members.'
);
const parent=$m('rFileBtn').closest('.rbox');
if(parent)parent.appendChild(mkvHint);
rv().addEventListener('error',()=>{
  if(selectedMKV)convertButton().hidden=false;
});
})();