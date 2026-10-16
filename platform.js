/* FIELD OF IMMORTALS — Poki platform bridge. No third-party accounts or analytics. */
'use strict';
const FOI_CONFIG=window.FOI_CONFIG||{};
window.FOI_PLATFORM={sdk:null,locale:String(navigator.language||'en').toLowerCase().startsWith('ko')?'ko':'en',muted:false,playing:false,ready:true,local:!!FOI_CONFIG.local,error:null,output:null,user:null,identityEpoch:0,saveError:null,started:false,adActive:false,transition:false,everPlayed:false,inputSeen:false,wantsPlay:false,loaded:false,loadingSent:false};
const CG=window.FOI_PLATFORM;
const FOI_SAVE_KEY=FOI_CONFIG.fresh?'foi_poki_preview_fresh':FOI_CONFIG.master?'foi_poki_preview_master_v2':FOI_CONFIG.local?'foi_poki_preview_v2':'foi_poki_v1';
let foiMemorySave=null,foiStorage=null,foiSaveBlocked=false;
function cgDeadline(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(timer));}
function cgPrepareSave(raw){if(raw==null)return null;const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid save');for(const k of ['units','legends','relics','story'])if(data[k]!=null&&(typeof data[k]!=='object'||Array.isArray(data[k])))throw Error('Invalid save');return raw;}
try{if(!FOI_CONFIG.fresh){foiStorage=window.localStorage;const raw=foiStorage.getItem(FOI_SAVE_KEY);try{foiMemorySave=cgPrepareSave(raw);}catch(error){foiSaveBlocked=true;CG.saveError='corrupt';}if(!foiSaveBlocked){const probe=FOI_SAVE_KEY+'_probe';foiStorage.setItem(probe,'1');foiStorage.removeItem(probe);}}}catch(error){foiStorage=null;CG.saveError='unavailable';}
function cgSaveNotice(){
 let note=document.getElementById('foiSaveNotice');if(!CG.saveError){note?.remove();return;}
 if(!note){note=document.createElement('aside');note.id='foiSaveNotice';note.setAttribute('role','status');document.body.append(note);}
 const ko=CG.locale==='ko',copy=document.createElement('span'),close=document.createElement('button');
 copy.textContent=CG.saveError==='corrupt'?(ko?'저장 파일을 읽지 못했습니다. 원본을 보존하며 이번 플레이는 임시로 저장됩니다.':'Saved progress could not be read. The original is preserved; this session is temporary.'):(ko?'이 브라우저에서 저장할 수 없습니다. 창을 닫으면 이번 진행이 사라집니다.':'This browser cannot save progress. This session will be lost when you close the game.');
 close.textContent='×';close.setAttribute('aria-label',ko?'알림 닫기':'Dismiss notice');close.onclick=()=>note.remove();note.replaceChildren(copy,close);
}
function cgPersist(value){foiMemorySave=String(value);if(FOI_CONFIG.fresh)return true;if(foiSaveBlocked)return false;try{if(!foiStorage)throw Error('Storage unavailable');foiStorage.setItem(FOI_SAVE_KEY,foiMemorySave);const failed=CG.saveError;CG.saveError=null;if(failed)cgSaveNotice();return true;}catch(error){const first=!CG.saveError;CG.saveError='unavailable';if(first)cgSaveNotice();return false;}}
function cgRetrySave(){return foiMemorySave===null||cgPersist(foiMemorySave);}
const CG_STORAGE={getItem(key){return key==='foi_meta'?foiMemorySave:null;},setItem(key,value){if(key==='foi_meta')return cgPersist(value);},removeItem(key){if(key!=='foi_meta')return;foiMemorySave=null;foiSaveBlocked=false;if(FOI_CONFIG.fresh)return;try{foiStorage?.removeItem(FOI_SAVE_KEY);}catch(error){CG.saveError='unavailable';cgSaveNotice();}}};
function cgApplyAudioPolicy(){if(CG.output){const g=CG.output.gain,t=CG.output.context.currentTime;g.cancelScheduledValues(t);if(CG.muted||CG.adActive||document.hidden)g.setValueAtTime(0,t);else g.setTargetAtTime(.85,t,.02);}}
function foiSDKCall(name,...args){try{return CG.sdk?.[name]?.(...args);}catch(error){return undefined;}}
function foiPokiFlush(){
 if(!CG.sdk||CG.adActive)return;
 if(CG.loaded&&!CG.loadingSent){CG.loadingSent=true;foiSDKCall('gameLoadingFinished');}
 const active=CG.loadingSent&&CG.inputSeen&&CG.wantsPlay&&!document.hidden&&CG.canPlay?.();
 if(active&&!CG.playing){CG.playing=true;CG.everPlayed=true;foiSDKCall('gameplayStart');}
 else if(!active&&CG.playing){CG.playing=false;foiSDKCall('gameplayStop');}
}
function foiPokiStart(){CG.wantsPlay=true;if(CG.inputSeen)CG.everPlayed=true;queueMicrotask(foiPokiFlush);}
function foiPokiStop(){CG.wantsPlay=false;if(CG.adActive)return;if(CG.playing){CG.playing=false;foiSDKCall('gameplayStop');}}
function cgEvent(name){if(name==='loadingStop'){CG.loaded=true;foiPokiFlush();}else if(name==='gameplayStart')foiPokiStart();else if(name==='gameplayStop')foiPokiStop();}
function cgGameStarted(){CG.started=true;cgSaveNotice();}
function cgLoadingStage(stage){const ko=CG.locale==='ko',title=document.getElementById('loadTitle'),sub=document.getElementById('loadSub');if(title)title.textContent=stage==='art'?(ko?'전장 전개 중':'Deploying battlefield'):(ko?'게임 불러오는 중':'Loading game');if(sub)sub.textContent=ko?'전장 그래픽을 준비합니다':'Preparing battlefield graphics';}
function cgStatusError(error){if(CG.error)return;CG.error=error?.message||String(error);console.error('Game startup:',CG.error);const root=document.getElementById('lyLoad');if(!root)return;root.classList.add('on');const h=document.createElement('h2'),p=document.createElement('p'),button=document.createElement('button');h.textContent=CG.locale==='ko'?'게임을 불러오지 못했습니다':'Unable to load the game';p.textContent=CG.locale==='ko'?'연결을 확인하고 다시 시도해 주세요. 저장된 진행은 유지됩니다.':'Check your connection and try again. Saved progress is preserved.';button.textContent=CG.locale==='ko'?'다시 시도':'Retry';button.className='btn primary';button.onclick=()=>location.reload();root.replaceChildren(h,p,button);}
function cgLoadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Unable to load '+src));document.head.append(script);});}
// Register before gameplay input listeners so game controls cannot leak into an ad.
for(const name of ['keydown','keyup','pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','click'])addEventListener(name,event=>{
 if(window.FOI_SUPPLY_OPEN&&!CG.adActive&&name.startsWith('key')){if(name==='keydown'&&event.code==='Escape')window.foiCloseSupply?.();event.preventDefault();event.stopImmediatePropagation();return;}
 if(CG.adActive){if(name.startsWith('key')||event.target?.closest?.('#wrap,#cgHub,#pgSpotlight,#foiSupplyDialog,#foiFieldBoard')){event.preventDefault();event.stopImmediatePropagation();}return;}
 if(['keydown','pointerdown','touchstart'].includes(name)&&event.isTrusted)CG.inputSeen=true;
 if(name==='keydown'&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)&&!event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))event.preventDefault();
},{capture:true,passive:false});
addEventListener('blur',()=>{if(!CG.adActive)foiPokiStop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)foiPokiStop();cgApplyAudioPolicy();});
// SDK loading never holds up the game, including with blockers/offline previews.
async function foiInitSDK(){
 if(FOI_CONFIG.local)return;
 try{await cgDeadline(cgLoadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js'),6000,'SDK unavailable');const sdk=window.PokiSDK;if(!sdk)throw Error('SDK unavailable');await cgDeadline(sdk.init(),6000,'SDK initialization unavailable');CG.sdk=sdk;foiSDKCall('movePill',50,-100);foiPokiFlush();}catch(error){/* Local progress and gameplay remain available without ads. */}
}
foiInitSDK();
cgLoadingStage('code');
const foiEmbedded=document.getElementById('foiLocalGame');
if(foiEmbedded){const script=document.createElement('script');script.textContent=foiEmbedded.textContent;document.head.append(script);foiEmbedded.remove();}else cgLoadScript('./game.js').catch(cgStatusError);
