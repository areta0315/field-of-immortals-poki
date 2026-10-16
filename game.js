"use strict";
if(CG.error)throw Error("Startup stopped: "+CG.error);
const BUILD={disableLegacyRewards:true,name:'FIELD OF IMMORTALS',version:'poki-2',
             tutorialVersion:4,
             master:false,
             gate:''};              // 값이 있으면 시작 전에 비밀번호를 묻습니다
let cgFocusPause=false;
function cgSDK(){return CG.sdk;}
function cgGameplayStart(){if(CG.playing)return;CG.playing=true;cgEvent('gameplayStart');}
function cgGameplayStop(){if(cgFocusPause||!CG.playing)return;CG.playing=false;cgEvent('gameplayStop');}
function applyBuildModeUI(){
  if(!BUILD.disableLegacyRewards) return;
  for(const id of ['btUpAd','btUpReroll','btRevive']){ const el=$(id); if(el) el.style.display='none'; }
}
/* =========================================================================
   FIELD OF IMMORTALS — v3
   · 자동 스크롤 폐지 → 자유 이동 월드 + 카메라 추적 (뱀파이어 서바이버 방식)
   · 흡수 즉시 아군 전환 (빨강→파랑), AI 전투, 정원 초과 시 선입선출
   · 중립(레전드) 유닛은 노랑, 흡수 매우 어려움, 일정 시간 뒤 이탈
   · 모든 유닛 스프라이트는 진행 방향으로 회전
   ========================================================================= */
let W=480, H=800;
const MOBILE_DEVICE=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'');
let R=1;             // 모바일은 캔버스 메모리/발열을 낮추고 논리 해상도는 유지
const VIEW={portrait:[420,750], landscape:[800,480]};
let ORIENT='auto';                     // auto | portrait | landscape
/* Use one consistent viewport sample and one resize transaction per burst. */
const PG_VIEW={key:'',width:0,height:0,layout:'',dpr:0,raf:0,timer:0};
function viewportSize(){
 const root=document.documentElement,lw=Math.max(1,root.clientWidth||innerWidth),lh=Math.max(1,root.clientHeight||innerHeight),v=window.visualViewport;
 // Mobile engines can briefly report the previous orientation or zoomed visual
 // viewport. Only use it when it agrees with the current layout width.
 const visual=!!v&&Math.abs((v.scale||1)-1)<.02&&Math.abs(v.width-lw)<2&&v.height>0&&v.height<=lh+2;
 return {width:lw,height:visual?Math.min(lh,v.height):lh,left:0,top:visual?Math.max(0,Math.min(v.offsetTop||0,lh-v.height)):0};
}
function currentLayout(v=viewportSize()){
 if(ORIENT==='portrait'||ORIENT==='landscape')return ORIENT;
 return v.width>v.height?'landscape':'portrait';
}
let ROTATED=false;
function applyViewport(){
 const cvE=document.getElementById('cv'),st=document.getElementById('stage');
 if(!cvE||!st||cvE.parentElement!==st)return;
 const v=viewportSize(),L=currentLayout(v),dpr=Math.min(devicePixelRatio||1,2),rotated=ORIENT!=='auto'&&((L==='landscape')!==(v.width>v.height));
 const bw=Math.round(rotated?v.height:v.width),bh=Math.round(rotated?v.width:v.height),left=Math.round(v.left),top=Math.round(v.top),key=[bw,bh,left,top,L,rotated,dpr].join(':');
 if(PG_VIEW.key===key)return;
 const geometry=PG_VIEW.width!==bw||PG_VIEW.height!==bh||PG_VIEW.layout!==L||ROTATED!==rotated;
 const raster=geometry||PG_VIEW.dpr!==dpr;PG_VIEW.key=key;ROTATED=rotated;
 const wrap=document.getElementById('wrap');Object.assign(wrap.style,{inset:'auto',left:left+'px',top:top+'px',width:Math.round(v.width)+'px',height:Math.round(v.height)+'px'});
 if(geometry){
  // The same touch device keeps the same world scale when its axes swap.
  const touch=MOBILE_DEVICE||navigator.maxTouchPoints>0,base=VIEW[L],scale=(touch?Math.min(Math.min(bw,bh)/VIEW.portrait[0],Math.max(bw,bh)/VIEW.portrait[1]):Math.min(bw/base[0],bh/base[1]))*.76;
  W=bw/scale;H=bh/scale;evoResizeWorld();
  Object.assign(st.style,{flex:'none',width:bw+'px',height:bh+'px',transform:rotated?'rotate(90deg)':'',aspectRatio:'auto'});
  document.body.classList.toggle('land',L==='landscape');
  HOME.move={x:Math.round(W*.19),y:H-116/.76};HOME.aim={x:Math.round(W*.81),y:H-116/.76};
  clearBattleInput();sticks.move.id=null;sticks.aim.id=null;
  // Progression menus use responsive CSS. Do not measure hidden legacy text.
  if(!document.body.classList.contains('pg-enabled'))fitMenuText();
 }
 if(raster){
  const budget=MOBILE_DEVICE||navigator.maxTouchPoints>0?2000000:4200000;
  R=Math.min((bw/W)*dpr,Math.sqrt(budget/(W*H)));
  const pw=Math.round(W*R),ph=Math.round(H*R);
  if(cvE.width!==pw)cvE.width=pw;if(cvE.height!==ph)cvE.height=ph;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
 }
 PG_VIEW.width=bw;PG_VIEW.height=bh;PG_VIEW.layout=L;PG_VIEW.dpr=dpr;
}
function scheduleViewport(){
 clearTimeout(PG_VIEW.timer);cancelAnimationFrame(PG_VIEW.raf);
 // Coalesce rotation, visual-viewport and resize notifications while the device
 // animation settles. Desktop resizing is applied on the next animation frame.
 const commit=()=>{PG_VIEW.timer=0;PG_VIEW.raf=requestAnimationFrame(()=>{PG_VIEW.raf=0;applyViewport();});};
 if(MOBILE_DEVICE||navigator.maxTouchPoints>0)PG_VIEW.timer=setTimeout(commit,70);else commit();
}
addEventListener('resize',scheduleViewport);
window.visualViewport?.addEventListener('resize',scheduleViewport);
window.visualViewport?.addEventListener('scroll',scheduleViewport);
screen.orientation?.addEventListener('change',scheduleViewport);
addEventListener('orientationchange',scheduleViewport);
document.addEventListener('fullscreenchange',scheduleViewport);

const WORLD={w:2000, h:2800};          // 적 기지 위치가 무작위라 넓고 정사각에 가깝게
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='low';
const $=id=>document.getElementById(id);

/* ------------------------------ 아트 ------------------------------------ */
const PG_SHARED_ART=["data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","assets/dc59ea530774eca1d3bbcc26.webp","assets/0fb2933c9153e493d77eb5b9.webp","assets/0603662f29384ca659e335a5.webp","assets/9ba5eeefc58ab3401393be52.webp","assets/72fe2d026dfbc383285d35f5.webp","assets/91a546c771b7ae1f1314666a.webp","assets/f2e3a4e83624244456f5a396.webp","assets/88f32641c00ef1b79fd6e2d7.webp"];
const ART={
"grass_earth":"assets/1ba077d120ef5e84154517e6.webp",
"border_earth":"assets/91808fed7b58b24702c7bfc8.webp",
"inf_w0":PG_SHARED_ART[0],
"inf_w1":PG_SHARED_ART[0],
"inf_w2":PG_SHARED_ART[0],
"inf_w3":PG_SHARED_ART[0],
"inf_w4":PG_SHARED_ART[0],
"inf_w5":PG_SHARED_ART[0],
"inf_w6":PG_SHARED_ART[0],
"inf_w7":PG_SHARED_ART[0],
"inf_a0":PG_SHARED_ART[0],
"inf_a1":PG_SHARED_ART[0],
"inf_a2":PG_SHARED_ART[0],
"inf_a3":PG_SHARED_ART[0],
"e_spike":"assets/f4189fa2bf96d9a28583e4a6.webp",
"e_mole":"assets/bb608850184b520cb2086dca.webp",
"e_volt":"assets/fdf85cb0a6c37b15e343271f.webp",
"e_flak":"assets/a39a66be55263f68544e884f.webp",
"e_wasp":"assets/0f7d1d288983927e9c904b34.webp",
"grass_lava2":PG_SHARED_ART[1],
"grass_crys2":PG_SHARED_ART[2],
"grass_lava":PG_SHARED_ART[1],
"border_lava":"assets/dd383f2e47f00a0591129886.webp",
"grass_crys":PG_SHARED_ART[2],
"border_crys":"assets/4766c02ec2d6939bcf06160c.webp",
"p_hill_lv":PG_SHARED_ART[3],
"p_wall_lv":PG_SHARED_ART[4],
"p_big_lv":PG_SHARED_ART[3],
"p_base_lv":PG_SHARED_ART[5],
"p_hill_cr":PG_SHARED_ART[6],
"p_wall_cr":PG_SHARED_ART[4],
"p_big_cr":PG_SHARED_ART[6],
"p_base_cr":PG_SHARED_ART[5],
"grass_space":"assets/e30fd17c4ede8085958fd3ae.webp",
"border_space":"assets/30113c102cd72f8c401486b9.webp",
"wall_closed":"assets/5d59fd38be1fdfc7b80f4d16.webp",
"wall_open":"assets/31183141ca389d5621f02af3.webp",
"turrets":"assets/f7811d71e8b3cfa5f2933d1e.webp",
"main":PG_SHARED_ART[0],
"infantry":PG_SHARED_ART[0],
"apc":PG_SHARED_ART[0],
"tank":PG_SHARED_ART[0],
"heli":PG_SHARED_ART[0],
"legend_bike":"assets/2e08e69a9740c32d5038dd73.webp",
"legend_ship":"assets/24ffd3b684f4eadb2cd2c260.webp",
"i_pwr":"assets/059e9bdbd25f3d7154dddb2b.webp",
"i_poison":"assets/9dcc12dec90e3456180480eb.webp",
"i_shld":"assets/e244d51239390672bd118c37.webp",
"i_ice":"assets/234aedf8368e1a48d21ce581.webp",
"i_slot":"assets/800b574e02b65c9fdc660cd7.webp",
"i_apwr":"assets/5330d0669027a777fe7dc15e.webp",
"i_spd":"assets/6a543fdb3e87c4766790a3ed.webp",
"i_way":"assets/d3b56eaefdcfe3565c80eff7.webp",
"e_hawk":"assets/b8326110af97c4b3576873f8.webp",
"e_guard":PG_SHARED_ART[0],
"e_rider":"assets/a8f3443ea98afe0d1f0c8668.webp",
"e_missile":PG_SHARED_ART[0],
"e_scout":"assets/2be654923a9c08283004a961.webp",
"e_rocket":"assets/75c22debfd37ace75b291159.webp",
"e_sentry":PG_SHARED_ART[0],
"e_bruiser":PG_SHARED_ART[0],
"e_hover":"assets/fd992233112ea545461015ac.webp",
"e_warbrute":PG_SHARED_ART[0],
"ad_board":"assets/ad_board-full.webp",
"ad_floor":"assets/ad_floor-full.webp",
"c_ast":"assets/b3132a03e42d181c06078fd8.webp",
"c_cred":"assets/e3268712a9ac49b3270bfc90.webp",
"rel1":PG_SHARED_ART[0],
"rel2":PG_SHARED_ART[0],
"rel3":PG_SHARED_ART[0],
"rel4":PG_SHARED_ART[0],
"rel5":PG_SHARED_ART[0],
"rel6":PG_SHARED_ART[0],
"rel7":PG_SHARED_ART[0],
"rel8":PG_SHARED_ART[0],
"rel9":PG_SHARED_ART[0],
"rel10":PG_SHARED_ART[0],
"i_fire":"assets/46a0711aec10c80893a373fa.webp",
"i_heal":"assets/cf14ce959ae8268f9866bb49.webp",
"i_rate":"assets/fd8b738de0a988afd6aaaf7a.webp",
"p_base_e":PG_SHARED_ART[5],
"p_hill_e":PG_SHARED_ART[7],
"p_wall_e":PG_SHARED_ART[4],
"p_big_e":PG_SHARED_ART[7],
"p_base_s":PG_SHARED_ART[5],
"p_hill_s":PG_SHARED_ART[8],
"p_wall_s":PG_SHARED_ART[4],
"p_big_s":PG_SHARED_ART[8],
"L_vulcan":PG_SHARED_ART[0],
"L_gunship":PG_SHARED_ART[0],
"L_cannon":PG_SHARED_ART[0],
"L_twin":PG_SHARED_ART[0],
"L_lancer":PG_SHARED_ART[0],
"L_sweeper":PG_SHARED_ART[0],
"L_cruiser":PG_SHARED_ART[0],
"L_titan":PG_SHARED_ART[0],
"L_phantom":PG_SHARED_ART[0],
"L_nova":PG_SHARED_ART[0],
"i_summon":PG_SHARED_ART[0]
};
Object.assign(ART,{"v_arc":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","v_crawler":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","v_oblivion":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","v_phantom":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","v_revenant":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","v_eclipse":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E"});
ART.velca_core="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E";
Object.assign(ART,{"L_astra":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E","L_nemesis":"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E"});
const IMG={}, TINT={ally:{}, neutral:{}, frost:{}};

async function loadOneArt(k){
 const im=new Image();im.src=ART[k];await im.decode();IMG[k]=im;
}
async function loadArt(){
  const ks=Object.keys(ART), batch=6;
  const pct=$('loadPct');
  for(let i=0;i<ks.length;i+=batch){
    await Promise.all(ks.slice(i,i+batch).map(k=>loadOneArt(k)));
    if(pct) pct.textContent=Math.min(100,Math.round(Math.min(ks.length,i+batch)/ks.length*100))+'%';
    // Safari/Chrome 모바일에서 디코더가 UI 스레드를 장시간 점유하지 않도록 한 프레임 양보합니다.
    await new Promise(r=>setTimeout(r,0));
  }
}

/* ---- 색상 치환: 붉은 계열 픽셀만 목표 색조로. 회색 장갑/올리브는 그대로 ---- */
function rgb2hsl(r,g,b){ r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let h=0,s=0;
  if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn);
    h = mx===r ? (g-b)/d+(g<b?6:0) : mx===g ? (b-r)/d+2 : (r-g)/d+4; h/=6; }
  return [h*360,s,l]; }
function hsl2rgb(h,s,l){ h=((h%360)+360)%360/360;
  if(s===0){const v=Math.round(l*255);return [v,v,v];}
  const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{ t=(t+1)%1;
    if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
  return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)]; }

function tint(img, targetHue){
  if(!img) return null;
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d'); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height), p=d.data;
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10||p[i]<p[i+1]||p[i]<p[i+2]) continue;
    const [h,s,l]=rgb2hsl(p[i],p[i+1],p[i+2]);
    if(s<0.22) continue;                       // 무채색(회색 장갑)은 유지
    if(!(h<=38 || h>=330)) continue;           // 빨강~주황 범위만 치환
    const [r,gg,b]=hsl2rgb(targetHue, Math.min(1,s*1.05), l);
    p[i]=r; p[i+1]=gg; p[i+2]=b;
  }
  g.putImageData(d,0,0); return c;
}
/* 냉동 상태 스프라이트 — 흰·하늘색으로 얼어붙은 모습.
   예전엔 사각형을 덮어씌워서 네모나게 보였는데, 스프라이트 자체를 미리 만들어 씁니다. */
function frostify(img){
  if(!img) return null;
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d'); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height), p=d.data;
  const TR=214,TG=240,TB=255, m=.58;
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10) continue;
    p[i]  =Math.round(p[i]  *(1-m)+TR*m);
    p[i+1]=Math.round(p[i+1]*(1-m)+TG*m);
    p[i+2]=Math.round(p[i+2]*(1-m)+TB*m);
  }
  g.putImageData(d,0,0); return c;
}
const ANIM_KEYS=[];
for(let i=0;i<8;i++) ANIM_KEYS.push('inf_w'+i);
for(let i=0;i<4;i++) ANIM_KEYS.push('inf_a'+i);
const UNIT_KEYS=[...ANIM_KEYS,'main','infantry','apc','tank','heli','legend_bike','legend_ship',
  'e_hawk','e_guard','e_rider','e_missile','e_scout','e_rocket','e_sentry','e_bruiser','e_hover','e_warbrute',
  'L_vulcan','L_gunship','L_cannon','L_twin','L_lancer','L_sweeper','L_cruiser','L_titan','L_phantom','L_nova'];
function buildTints(){
  for(const k of UNIT_KEYS){
    TINT.ally[k]    = tint(IMG[k], 212);   // 아군 파랑
    TINT.neutral[k] = tint(IMG[k], 47);    // 중립 노랑
    TINT.frost[k]   = frostify(IMG[k]);    // 냉동
  }
}

/* ------------------------------ 튜닝 ------------------------------------ */
const ILL_PLAYER_W=62;
const TUNE={
  keySpeed:2.4, spdPerStack:0.14, spdStackMax:5,   // 기본은 느리게, 아이템 5개까지만 누적
  baseFireMs:340, baseDamage:1, bulletSpeed:9.6,
  baseHp:200, healAmt:55, hpPerPower:30, regenPerPower:1.3,   // 체력제
  invulnMs:600, contactDmg:9,
  beamLen:190, beamW:74, captureFillMs:700,
  captureChance:.62, captureDropPerStage:.015, captureFloor:.30, captureCap:.80,
  captureChanceLegend:.08, resistMs:1300,
  itemDropRate:.20,
  allyCapBase:4, allyCapMax:8,
  legendLifeMs:14000,
  enemyCap:24, aimRange:430,
  enemyHpPerStage:0.22,          // 스테이지마다 적 체력 상승 (완만하게)
  enemyDmgPerStage:0.06,         // 적 피해량은 아주 소폭만 상승
  wallY:110,                     // 벽 이미지 상단의 월드 Y
};
/* 스테이지 강화 누적 상한 — 무한 모드가 무너지지 않도록 */
const UPMAX={dmg:8, rate:6, move:5, armor:5, cap:6, beam:5, squad:4, scout:3};

/* ------------------------------ 사운드 ----------------------------------
   ── 저작권 정리 ───────────────────────────────────────────────────────
   · 지구 테마는 바그너 〈발퀴레의 기행〉(1870, 퍼블릭 도메인)의 동기를
     바탕으로 새로 편곡한 것입니다. 기존 상용 편곡을 옮긴 것이 아닙니다.
   · 나머지 세 곡(메인 · 화성 · 보스)은 홀스트 〈행성〉풍의 후기 낭만
     관현악 어법을 참고해 **새로 작곡한 원곡**입니다. 홀스트 작품 자체도
     이미 퍼블릭 도메인이지만, 선율을 옮겨 적으면 편곡 저작권 시비가
     생길 수 있어 인용 없이 새로 썼습니다.
   ── 음질 방침 ─────────────────────────────────────────────────────────
   드럼 루프를 쓰지 않고, 악기별 음색(현·금관·호른·합창·저음)을 만들어
   컨볼루션 리버브와 컴프레서를 거칩니다. 타악은 큰 마디에만 아주 옅게.  */

/* Original symphonic game suite: riding 9/8 brass, bowed ostinati, broad hymn
 * sections and concert percussion. No downloaded recording or external asset. */
const A4HZ=440,SEMI=Math.pow(2,1/12),PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
function freqOf(nm){const m=/^([A-G][#b]?)(-?\d)$/.exec(nm);return m?440*Math.pow(2,(PC[m[1]]+(+m[2]+1)*12-69)/12):0;}
const INST={
  strings:{g:.14,a:.12,r:.34,cut:4700,pan:-.36,root:220},
  spiccato:{g:.16,a:.012,r:.075,cut:5200,pan:-.50,root:220},
  brass:{g:.21,a:.045,r:.18,cut:4400,pan:.24,root:220},
  horn:{g:.20,a:.09,r:.32,cut:2600,pan:.10,root:220},
  bass:{g:.19,a:.022,r:.17,cut:1700,pan:-.08,root:110},
  woodwind:{g:.10,a:.035,r:.20,cut:5200,pan:-.12,root:440},
  choir:{g:.11,a:.30,r:.75,cut:2600,pan:.36,root:220},
  timpani:{g:.50,pan:.12,root:65.4064,percussion:true},
  drum:{g:.34,pan:0,root:50,percussion:true},
  snare:{g:.12,pan:.28,root:200,percussion:true},
  cymbal:{g:.12,pan:-.22,root:440,percussion:true}
};
let actx=null,soundOn=false,MASTER=null,BUS_MUS=null,BUS_SFX=null,VERB=null,VERB_IN=null,MUS_LP=null;
let VOL_MUS=.40,VOL_SFX=.85,musTrack=null,musTimer=null,musBeat=0,musTime=0,musNextTrack=null;
const ORCHESTRA={context:null,banks:new Map(),voices:new Set(),epoch:0,swapTimer:null,serial:0,peakVoices:0,maxVoices:112};
function orchestraNoise(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2147483648-1;};}
function makeIR(sec,decay){
  const n=Math.floor(actx.sampleRate*sec),b=actx.createBuffer(2,n,actx.sampleRate),random=orchestraNoise(9081);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++)d[i]=random()*Math.pow(1-i/n,decay)*(1-Math.exp(-i/220));}
  return b;
}
function orchestraBank(name){
  if(ORCHESTRA.context!==actx){ORCHESTRA.context=actx;ORCHESTRA.banks.clear();}
  if(ORCHESTRA.banks.has(name))return ORCHESTRA.banks.get(name);
  const I=INST[name],sr=22050,seconds=I.percussion?(name==='cymbal'?2.4:1.6):2,n=Math.round(sr*seconds),buffer=actx.createBuffer(2,n,sr),random=orchestraNoise(93+name.length*716);
  if(I.percussion){
    for(let c=0;c<2;c++){const d=buffer.getChannelData(c);let low=0;
      for(let j=0;j<n;j++){const t=j/sr,r=random();low=low*.72+r*.28;let sample;
        if(name==='timpani')sample=.62*Math.sin(2*Math.PI*(65.4064*t+.026*(1-Math.exp(-t*24))))*Math.exp(-t*3.4)+.22*Math.sin(2*Math.PI*97.4*t)*Math.exp(-t*6)+.12*Math.sin(2*Math.PI*132.7*t)*Math.exp(-t*8)+low*.3*Math.exp(-t*35);
        else if(name==='drum')sample=.72*Math.sin(2*Math.PI*(42*t+.20*(1-Math.exp(-t*18))))*Math.exp(-t*5)+low*.45*Math.exp(-t*15);
        else if(name==='snare')sample=(r-low)*.60*Math.exp(-t*22)+.25*Math.sin(2*Math.PI*186*t)*Math.exp(-t*28);
        else sample=((r-low)*.62+Math.sin(2*Math.PI*3217*t)*Math.sin(2*Math.PI*4639*t)*.13)*Math.exp(-t*2.6);
        d[j]=sample*Math.min(1,t*900)*Math.min(1,(seconds-t)*80);
      }
    }
  }else{
    // Build instrument-specific harmonic spectra, then sample a small ensemble.
    // Two-second modulation periods join exactly at the loop boundary.
    const N=2048,table=new Float32Array(N),harmonics=name==='woodwind'?12:36;
    let energy=0;
    for(let h=1;h<=harmonics;h++){
      const hz=I.root*h;let a;
      if(name==='brass')a=Math.pow(h,-.72)*Math.exp(-hz/4900)*(1+.55*Math.exp(-(((hz-1200)/700)**2)));
      else if(name==='horn')a=Math.pow(h,-1.05)*Math.exp(-hz/2400)*(h%2?1:.82);
      else if(name==='choir')a=(.22+1.9*Math.exp(-(((hz-750)/220)**2))+.8*Math.exp(-(((hz-1250)/280)**2)))*Math.pow(h,-1.25);
      else if(name==='woodwind')a=Math.pow(h,-1.7)*(h%2?1:.16);
      else if(name==='bass')a=Math.pow(h,-1.2)*Math.exp(-hz/2200);
      else a=Math.pow(h,-.86)*Math.exp(-hz/6500)*(1+.45*Math.exp(-(((hz-2600)/1400)**2)));
      energy+=a*a;const phase=name==='brass'||name==='horn'?0:h*.61;
      for(let j=0;j<N;j++)table[j]+=a*Math.sin(2*Math.PI*h*j/N+phase);
    }
    const norm=.46/Math.sqrt(energy/2);
    const lookup=phase=>{const at=((phase%1)+1)%1*N,i=at|0,f=at-i;return table[i]*(1-f)+table[(i+1)%N]*f;};
    for(let c=0;c<2;c++){const d=buffer.getChannelData(c);let smooth=0;
      for(let j=0;j<n;j++){const t=j/sr,phase=I.root*t,offset=c*.17;
        const vibrato=.085*(Math.sin(2*Math.PI*5*t+offset)-Math.sin(offset));
        let v=lookup(phase+vibrato)*.50;
        v+=lookup(phase+.27+.19*Math.sin(2*Math.PI*.5*t+c))*.28;
        v+=lookup(phase+.61+.17*Math.sin(2*Math.PI*1.5*t-c))*.22;
        smooth=smooth*.8+random()*.2;
        const bow=(name==='strings'||name==='spiccato')?.012:.002;
        d[j]=v*norm+smooth*bow*Math.sin(Math.PI*t/2)**2;
      }
    }
  }
  ORCHESTRA.banks.set(name,buffer);return buffer;
}
function applyVolumes(){
  if(!actx)return;
  BUS_SFX?.gain.setTargetAtTime(VOL_SFX,actx.currentTime,.04);
  if(BUS_MUS&&musTrack)BUS_MUS.gain.setTargetAtTime(VOL_MUS,actx.currentTime,.06);
}
function audioInit(){
  if(MASTER)return;
  MASTER=actx.createDynamicsCompressor();MASTER.threshold.value=-16;MASTER.knee.value=22;MASTER.ratio.value=3.4;MASTER.attack.value=.006;MASTER.release.value=.22;
  const out=actx.createGain();out.gain.value=.85;MASTER.connect(out);CG.output=out;cgApplyAudioPolicy();out.connect(actx.destination);
  VERB=actx.createConvolver();VERB.buffer=makeIR(2.5,2.7);VERB_IN=actx.createGain();VERB_IN.gain.value=.20;
  const vlp=actx.createBiquadFilter();vlp.type='lowpass';vlp.frequency.value=4800;VERB_IN.connect(VERB);VERB.connect(vlp);vlp.connect(MASTER);
  BUS_MUS=actx.createGain();BUS_MUS.gain.value=0;BUS_SFX=actx.createGain();BUS_SFX.gain.value=VOL_SFX;
  MUS_LP=actx.createBiquadFilter();MUS_LP.type='lowpass';MUS_LP.frequency.value=6800;MUS_LP.Q.value=.4;
  const glue=actx.createDynamicsCompressor();glue.threshold.value=-12;glue.knee.value=12;glue.ratio.value=2.2;glue.attack.value=.025;glue.release.value=.22;
  BUS_MUS.connect(MUS_LP);MUS_LP.connect(glue);glue.connect(MASTER);glue.connect(VERB_IN);BUS_SFX.connect(MASTER);
  for(const name of new Set(Object.values(SCORES).flatMap(t=>t.ev.map(e=>e.i))))orchestraBank(name);
}
function voice(name,f,when,dur,vel,pan){
  if(!actx||!soundOn||!f||!INST[name]||ORCHESTRA.voices.size>=ORCHESTRA.maxVoices)return;
  const I=INST[name],s=actx.createBufferSource(),g=actx.createGain(),lp=actx.createBiquadFilter(),p=actx.createStereoPanner();
  s.buffer=orchestraBank(name);s.playbackRate.value=Math.max(.2,Math.min(5,f/I.root));s.loop=!I.percussion;
  const t=Math.max(when,actx.currentTime),attack=Math.min(I.a||.004,Math.max(.008,dur*.25)),release=I.percussion?.035:I.r,peak=I.g*vel;
  const length=I.percussion?s.buffer.duration/s.playbackRate.value:dur+release;
  lp.type='lowpass';lp.Q.value=.45;lp.frequency.setValueAtTime((I.cut||11000)*(name==='brass'?.45:1),t);
  if(name==='brass')lp.frequency.exponentialRampToValueAtTime(I.cut,t+attack+.06);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+attack);
  g.gain.setValueAtTime(peak*(name==='spiccato'?.7:1),t+Math.max(attack,length-release));g.gain.linearRampToValueAtTime(0,t+length);
  p.pan.value=Math.max(-1,Math.min(1,pan??I.pan));s.connect(lp);lp.connect(g);g.connect(p);p.connect(BUS_MUS);
  const handle={s,g,p,lp,epoch:ORCHESTRA.epoch};ORCHESTRA.voices.add(handle);ORCHESTRA.peakVoices=Math.max(ORCHESTRA.peakVoices,ORCHESTRA.voices.size);
  s.onended=()=>{ORCHESTRA.voices.delete(handle);s.disconnect();g.disconnect();lp.disconnect();p.disconnect();};
  s.start(t);s.stop(t+length+.02);
}
function buildOrchestralScores(){
  const profiles={
    menu:{title:'불멸의 서곡',subtitle:'넓은 호른 선율과 현악의 장엄한 서곡',root:50,major:true,meter:4,bpm:92,verb:.23},
    earth:{title:'강철의 기행',subtitle:'9/8 기마 리듬 · 금관 팡파르 · 현악 질주',root:47,major:false,meter:4.5,bpm:138,verb:.18},
    ceres:{title:'잊힌 제국의 진군',subtitle:'저음 현악에서 펼쳐지는 장대한 행진',root:52,major:false,meter:4.5,bpm:120,verb:.24},
    ignis:{title:'화염의 군세',subtitle:'금관의 응답과 팀파니가 이끄는 공세',root:50,major:false,meter:4.5,bpm:148,verb:.17},
    prisma:{title:'성좌의 왕관',subtitle:'광활한 장조 선율 · 빛나는 목관과 현악',root:57,major:true,meter:4,bpm:112,verb:.28},
    boss:{title:'최후의 성채',subtitle:'겹겹의 금관 · 급박한 현악 · 전투 타악',root:50,major:false,meter:4.5,bpm:156,verb:.17}
  },out={};
  const minor=[[0,0],[0,0],[8,1],[7,1],[5,0],[3,1],[8,1],[7,1],[0,0],[3,1],[5,0],[7,1],[8,1],[5,0],[7,1],[7,1]];
  const major=[[0,1],[7,1],[9,0],[4,0],[5,1],[0,1],[2,0],[7,1],[0,1],[9,0],[5,1],[7,1],[2,0],[5,1],[7,1],[0,1]];
  const hymn=[[0,4,7],[7,9,7],[4,2,0],[2,4,7],[9,7,4],[4,2,0],[2,7,11],[7,4,0]];
  for(const [key,P]of Object.entries(profiles)){
    const T={...P,bs:60/P.bpm,len:P.meter*48,ev:[],bars:48};let serial=0;
    const add=(i,n,b,d,v=1,pan)=>{if(n===null)return;const human=((serial++*37)%13-6)*.0009;T.ev.push({i,f:440*2**((n-69)/12),b:Math.max(0,b+human),d,v,pan});};
    for(let bar=0;bar<48;bar++){
      const lyrical=bar>=16&&bar<32,climax=bar>=32,sectionMajor=lyrical||P.major;
      const home=P.root+(lyrical&&!P.major?3:0),progression=sectionMajor?major:minor;
      const [offset,maj]=progression[bar%16],root=home+offset,third=maj?4:3,chord=[root,root+third,root+7],start=bar*P.meter;
      const dynamic=(lyrical?.62:climax?.98:.76)+bar%4*.045,pan=key==='ceres'?-.06:.22;
      // Sustained inner voices and contrabass keep every harmonic change anchored.
      for(let j=0;j<3;j++)add('strings',chord[j]+12,start,P.meter*.95,dynamic*(lyrical?.45:.22),-.45+j*.30);
      add('bass',root-12,start,lyrical?P.meter*.92:P.meter*.48,dynamic*.70);
      if(!lyrical)add('bass',root-5,start+P.meter/2,P.meter*.43,dynamic*.51);
      if(lyrical||key==='prisma')for(const n of [chord[0]+12,chord[1]+12])add('choir',n,start,P.meter,dynamic*.29);
      // Bowed subdivisions have short, distinct attacks; they never become a pad.
      const step=lyrical?.5:(key==='boss'||key==='ignis'?.25:.5),arp=[0,2,1,2,0,1,2,1,0];
      for(let at=0,j=0;at<P.meter-.01;at+=step,j++)add('spiccato',chord[arp[(j+bar)%arp.length]]+12+(climax&&j%4===3?12:0),start+at,step*.63,dynamic*(j%3===0?.43:.28));
      if(lyrical||P.meter===4){
        const line=hymn[bar%8],rhythm=[0,P.meter*.375,P.meter*.5],length=[P.meter*.34,P.meter*.105,P.meter*.46];
        for(let j=0;j<3;j++){const note=home+12+line[j]+(bar%8>=4?0:0);add('horn',note,start+rhythm[j],length[j],dynamic*.89,.12);
          add('strings',note+12,start+rhythm[j]+.012,length[j],dynamic*.20,-.30);
          if(climax)add('brass',note,start+rhythm[j],length[j],dynamic*.50,.32);}
        if(bar%4===3)for(let j=0;j<4;j++)add('woodwind',chord[j%3]+24,start+P.meter-1+j*.25,.22,dynamic*.32,-.22);
      }else{
        // Dotted, rising calls answered by lower horns, with an octave expansion
        // in the final sixteen bars. Themes have different inversions and answers.
        const notes=key==='ignis'?[0,7,third,7,12,third+12,7]:key==='ceres'?[7,third+12,12,7,third,7,12]:key==='boss'?[0,12,7,third+12,12,7,19]:[7,12,third+12,12,7,12,19];
        const rhythm=[0,.5,1.25,1.5,2.25,2.5,3],dur=[.44,.66,.20,.64,.20,.40,1.30];
        for(let j=0;j<notes.length;j++){
          const note=root+notes[(j+(bar%4===3?2:0))%notes.length];
          add('brass',note,start+rhythm[j],dur[j],dynamic*.80,pan);
          if(climax&&j%2===0)add('horn',note-12,start+rhythm[j],dur[j],dynamic*.48,-.10);
        }
        add('horn',root+third,start+1.5,1.28,dynamic*.38,-.04);add('horn',root+7,start+3,1.3,dynamic*.38,-.04);
      }
      // Concert percussion has phrase accents, rolls and rests; not a drum loop.
      add('timpani',root-12,start,.5,dynamic*(lyrical?.22:.62));
      if(!lyrical){add('timpani',root-5,start+P.meter-1,.4,dynamic*.36);if(bar%2===0)add('drum',31,start,.6,dynamic*.7);
        for(const at of [P.meter/3,P.meter*2/3])add('snare',55,start+at,.15,dynamic*.34);}
      if(bar%8===0||bar===47)add('cymbal',69,start,1.8,dynamic*(climax?.9:.50));
      if(bar%8===7)for(let j=0;j<6;j++)add('timpani',root-5,start+P.meter-1+j/6,.12,dynamic*(.16+j*.045));
    }
    T.ev.sort((a,b)=>a.b-b.b);out[key]=T;
  }
  return out;
}
const SCORES=buildOrchestralScores();
function compileScore(T){return T;}
function stopOrchestraVoices(fade=.08){
  if(!actx)return;const now=actx.currentTime;
  for(const h of ORCHESTRA.voices){h.g.gain.cancelScheduledValues(now);h.g.gain.setTargetAtTime(0,now,Math.max(.008,fade/3));try{h.s.stop(now+fade);}catch(e){}}
}
function musicSchedule(){
  musTimer=null;if(!actx||!soundOn||!musTrack)return;
  if(actx.state==='suspended'){musTimer=setTimeout(musicSchedule,180);return;}
  const T=SCORES[musTrack],look=actx.currentTime+.45;
  // After tab throttling, resume near now instead of emitting missed bars at once.
  if(musTime<actx.currentTime-.15)musTime=actx.currentTime+.03;
  let guard=0;
  while(musTime<look&&guard++<8){
    for(const e of T.ev)if(e.b>=musBeat&&e.b<musBeat+1)voice(e.i,e.f,musTime+(e.b-musBeat)*T.bs,e.d*T.bs,e.v,e.pan);
    musBeat++;musTime+=T.bs;if(musBeat>=T.len)musBeat=0;
  }
  musTimer=setTimeout(musicSchedule,120);
}
function musicPlay(name,immediate=false){
  if(!SCORES[name])return;musNextTrack=name;
  if(!actx||!soundOn)return;audioInit();if(musTrack===name)return;
  const epoch=++ORCHESTRA.epoch;
  clearTimeout(musTimer);musTimer=null;clearTimeout(ORCHESTRA.swapTimer);ORCHESTRA.swapTimer=null;
  const fade=musTrack&&!immediate?.22:0;stopOrchestraVoices(fade||.025);musTrack=null;
  const swap=()=>{ORCHESTRA.swapTimer=null;if(epoch!==ORCHESTRA.epoch||!soundOn)return;
    const now=actx.currentTime,T=SCORES[name];musTrack=name;musBeat=0;musTime=now+.05;
    VERB_IN.gain.setTargetAtTime(T.verb,now,.2);BUS_MUS.gain.cancelScheduledValues(now);BUS_MUS.gain.setValueAtTime(0,now);BUS_MUS.gain.linearRampToValueAtTime(VOL_MUS,now+.55);musicSchedule();};
  if(fade)ORCHESTRA.swapTimer=setTimeout(swap,fade*1000);else swap();
}
function stopMusic(){
  ORCHESTRA.epoch++;clearTimeout(musTimer);musTimer=null;clearTimeout(ORCHESTRA.swapTimer);ORCHESTRA.swapTimer=null;stopOrchestraVoices(.06);
  if(BUS_MUS&&actx){BUS_MUS.gain.cancelScheduledValues(actx.currentTime);BUS_MUS.gain.setTargetAtTime(0,actx.currentTime,.02);}musTrack=null;
}
function startMusic(){musicPlay(musNextTrack||'menu',true);}
const THEME_TRACK={EARTH:'earth',CERES:'ceres',IGNIS:'ignis',PRISMA:'prisma'};
function musicForScene(){if(!S||!['play','pause'].includes(mode))return 'menu';if(S.phase==='boss'||S.phase==='heroBoss')return 'boss';return THEME_TRACK[S.theme?.id]||'earth';}
function musicSync(){const name=musicForScene();if(name!==musTrack)musicPlay(name);}

/* 효과음 — 음악과 섞여도 뭉개지지 않게 별도 버스로 보냅니다 */
/* 효과음도 사각파를 그대로 쓰면 8비트 '삑' 소리가 납니다.
   삼각파로 바꾸고 저역 통과를 얹어 둥글게 만듭니다. */
function blip(f,d,t,v,when){ if(!actx||!soundOn)return; audioInit();
  const s=when??actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain(), lp=actx.createBiquadFilter();
  lp.type='lowpass'; lp.frequency.value=Math.min(5200, Math.max(700, f*3.2)); lp.Q.value=.5;
  o.type=(t==='square'||t==='sawtooth')?'triangle':t;
  o.frequency.setValueAtTime(f,s);
  g.gain.setValueAtTime(0,s);
  g.gain.linearRampToValueAtTime(v,s+.014);          // 어택을 조금 늘려 딱딱함 제거
  g.gain.exponentialRampToValueAtTime(.0001,s+d);
  o.connect(lp); lp.connect(g); g.connect(BUS_SFX); o.start(s); o.stop(s+d+.02);}
function noise(d,v){ if(!actx||!soundOn)return; audioInit();
  const n=Math.floor(actx.sampleRate*d),b=actx.createBuffer(1,n,actx.sampleRate),a=b.getChannelData(0);
  for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);
  const s=actx.createBufferSource(),g=actx.createGain();
  s.buffer=b;g.gain.value=v;s.connect(g);g.connect(BUS_SFX);s.start();}

/* ------------------------------ 테마 ------------------------------------ */
const THEMES=[
  {id:'EARTH', grass:'grass_earth',border:'border_earth',fallback:'#2f7a2a',
   base:'p_base_e', props:['p_hill_e','p_wall_e','p_big_e']},
  {id:'CERES', grass:'grass_space',border:'border_space',fallback:'#5a2a1e',
   base:'p_base_s', props:['p_hill_s','p_wall_s','p_big_s']},
  /* grass2 를 주면 칸마다 두 그림을 섞어 깔아 반복감이 크게 줄어듭니다 */
  {id:'IGNIS', grass:'grass_lava', grass2:'grass_lava2', border:'border_lava', fallback:'#1a0e0b',
   base:'p_base_lv',props:['p_hill_lv','p_wall_lv','p_big_lv']},
  {id:'PRISMA',grass:'grass_crys', grass2:'grass_crys2', border:'border_crys', fallback:'#1a1230',
   base:'p_base_cr',props:['p_hill_cr','p_wall_cr','p_big_cr']}];
const THEME_BY_ID={}; THEMES.forEach(t=>THEME_BY_ID[t.id]=t);
/* 구조물 규격 — w는 논리 폭, rx/ry는 충돌 타원 반경 비율 */
const PROP_SPEC={
  p_hill_e:{w:120,rx:.40,ry:.30}, p_hill_s:{w:120,rx:.40,ry:.30},
  p_wall_e:{w:115,rx:.46,ry:.20}, p_wall_s:{w:115,rx:.46,ry:.20},
  p_big_e :{w:165,rx:.42,ry:.33}, p_big_s :{w:165,rx:.42,ry:.33},
  p_base_e:{w:150,rx:.40,ry:.32}, p_base_s:{w:150,rx:.40,ry:.32},
  p_hill_lv:{w:120,rx:.40,ry:.30}, p_hill_cr:{w:120,rx:.40,ry:.30},
  p_wall_lv:{w:115,rx:.46,ry:.20}, p_wall_cr:{w:115,rx:.46,ry:.20},
  p_big_lv :{w:165,rx:.42,ry:.33}, p_big_cr :{w:165,rx:.42,ry:.33},
  p_base_lv:{w:150,rx:.40,ry:.32}, p_base_cr:{w:150,rx:.40,ry:.32},
  /* 광고 전광판 — 맵 가장자리에 크게 서고 이동을 막습니다 */
  ad_board:{w:210,rx:.44,ry:.26},
};
/* 광고면 위치(이미지 대비 비율)와 아직 광고주가 없을 때 띄울 문구 */
const AD_PANEL={ ad_board:{l:.119,t:.114,w:.764,h:.396},
                 ad_floor:{l:.115,t:.150,w:.772,h:.697} };
const AD_FLOOR_W=150;

/* ------------------------------ 유닛 정의 -------------------------------- */
/* 이동속도 / 공격속도 / 탄속을 각각 분리했습니다 */
const UNITS={
  /* 애니메이션 캔버스가 정지 스프라이트보다 여백이 넓어 w 를 키웠습니다.
     화면에 보이는 캐릭터 크기는 예전과 같습니다 (높이 약 42px). */
  infantry:{img:'infantry', hp:3,  spd:0.52, fire:2500, bspd:2.2, bdmg:5,  r:13, score:100, w:37, label:'보병'},
  apc:     {img:'apc',      hp:5,  spd:1.35, fire:1500, bspd:3.6, bdmg:8, r:19, score:280, w:43, label:'전차'},
  tank:    {img:'tank',     hp:9,  spd:0.85, fire:2700, bspd:5.4, bdmg:14, r:22, score:420, w:49, label:'탱크'},
  heli:    {img:'heli',     hp:5,  spd:1.30, fire:1600, bspd:2.4, bdmg:7,  r:20, score:340, w:49, label:'헬기', flying:true},
  /* 정예 — 이제 적군입니다. 느리지만 단단하고 특수 무장을 씁니다.
     흡수는 어렵지만 성공하면 아군 최강 전력이 됩니다. */
  legend_bike:{img:'legend_bike', hp:7,  spd:1.15, fire:1900, bspd:4.0, bdmg:9,  r:17, score:340, w:36,
               label:'정예 강습병', elite:true, ways:2, spread:.16, splashR:0, dmgBonus:1},
  legend_ship:{img:'legend_ship', hp:9,  spd:1.00, fire:2100, bspd:3.6, bdmg:10, r:24, score:420, w:52,
               label:'정예 우주선', elite:true, flying:true, ways:2, spread:.14,
               splashR:0, homing:true, dmgBonus:1},

  /* ===================== 신규 정규 적군 10종 =========================
     탱크(체력 9 · 피해 14)를 기준으로 티어를 올려 잡았습니다.
     ai 값이 유닛별 특수 행동을 결정합니다 — enemyAI()에서 처리합니다. */
  e_hawk:    {img:'e_hawk',    hp:4,  spd:1.70, fire:900,  bspd:4.2, bdmg:6,  r:20, score:300,  w:56,
              flying:true, ways:2, spread:.10, ai:'strafe', from:5,  to:15},
  e_guard:   {img:'e_guard',   hp:8,  spd:0.70, fire:1400, bspd:3.4, bdmg:9,  r:14, score:500,  w:30,
              ai:'burst',  from:10, to:20},
  e_rider:   {img:'e_rider',   hp:7,  spd:1.15, fire:1300, bspd:4.0, bdmg:10, r:15, score:600,  w:32,
              ways:2, spread:.13, ai:'charge', from:15, to:25},
  e_missile: {img:'e_missile', hp:9,  spd:0.60, fire:1800, bspd:3.0, bdmg:8,  r:12, score:750,  w:24,
              ai:'salvo',  from:20, to:30},
  e_scout:   {img:'e_scout',   hp:10, spd:1.45, fire:1000, bspd:3.8, bdmg:10, r:22, score:900,  w:50,
              flying:true, ways:2, spread:.09, ai:'rove', from:25, to:35},
  e_rocket:  {img:'e_rocket',  hp:20, spd:0.50, fire:2400, bspd:4.6, bdmg:16, r:26, score:1400, w:54,
              splashR:26, ai:'rockets', from:30, to:40},
  e_sentry:  {img:'e_sentry',  hp:18, spd:0.00, fire:620,  bspd:5.0, bdmg:12, r:20, score:1300, w:40,
              ways:2, spread:.07, ai:'turret', from:35, to:45},
  e_bruiser: {img:'e_bruiser', hp:26, spd:0.80, fire:1500, bspd:4.4, bdmg:16, r:28, score:2000, w:62,
              ai:'rage', from:40, to:50},
  e_hover:   {img:'e_hover',   hp:24, spd:0.90, fire:2000, bspd:5.2, bdmg:20, r:26, score:2200, w:58,
              flying:true, splashR:30, ai:'hover', from:45, to:55},
  e_warbrute:{img:'e_warbrute',hp:34, spd:0.70, fire:1600, bspd:4.8, bdmg:18, r:29, score:3000, w:64,
              ai:'siege', from:50, to:60},

  /* ===================== v32 신규 6종 =================================
     기존 10종 사이사이에 끼워 넣어 등장 간격을 촘촘하게 했습니다.
     특수 동작은 enemyAI() 의 새 case 에서 처리합니다. */

  /* 스파이크 러너 — 경량 돌격 차량. 좌우 소형 포 2발 + 주기적 짧은 돌진 */
  e_spike:   {img:'e_spike',   hp:9,  spd:1.55, fire:1100, bspd:4.4, bdmg:9,  r:23, score:700,  w:52,
              ways:2, spread:.11, ai:'spike', from:13, to:23},

  /* 브리치 몰 — 중장갑 굴착 전차. 땅속에서 솟아오르며 충격파, 근접하면 파고들며 충격파 */
  e_mole:    {img:'e_mole',    hp:30, spd:0.75, fire:1500, bspd:3.8, bdmg:14, r:30, score:1600, w:71,
              ways:2, spread:.20, ai:'burrow', from:23, to:33},

  /* 볼트 오브 — 전격 부유 드론. 추적 레이저 + 근접 시 플라즈마 장판 */
  e_volt:    {img:'e_volt',    hp:14, spd:1.60, fire:900,  bspd:6.0, bdmg:8,  r:21, score:1500, w:54,
              flying:true, ai:'volt', from:33, to:43},


  /* 플랙 하울러 — 중화기 지원차량. 대각선 대형 미사일 8발 + 시야를 막는 연막탄 */
  e_flak:    {img:'e_flak',    hp:38, spd:0.45, fire:1900, bspd:3.4, bdmg:16, r:27, score:2600, w:56,
              ways:2, spread:.09, ai:'flak', from:48, to:58},

  /* 시즈 와스프 — VTOL 폭격 드론. 10초 폭격 후 이탈, 3초 뒤 융단폭격으로 재진입 */
  e_wasp:    {img:'e_wasp',    hp:30, spd:1.50, fire:700,  bspd:5.4, bdmg:11, r:30, score:3200, w:74,
              flying:true, ai:'wasp', from:51, to:61},
};
const HOSTILE=['infantry','apc','tank','heli','legend_bike','legend_ship'];
const NEW_FOES=['e_hawk','e_guard','e_spike','e_rider','e_missile','e_mole',
                'e_scout','e_rocket','e_volt','e_sentry','e_bruiser',
                'e_hover','e_flak','e_warbrute','e_wasp'];

/* ======================== 레전드 유닛 ====================================
   중립으로 등장해 아무도 공격하지 않고 공격받지도 않습니다.
   흡수 확률이 극악이지만, 성공 후 그 스테이지를 클리어해야 최종 획득됩니다.
   무기는 weapons 배열로 조합합니다 — 종류별 동작은 fireWeapon()에 있습니다. */
const LEGENDS={
  L_vulcan:{ img:'L_vulcan', name:'발칸 라이더', w:52, r:22, hp:120, spd:1.55, armor:.05,
    from:1, to:10,
    desc:'전방 개틀링 연사 + 5초마다 유도 미사일 2발',
    weapons:[{t:'gatling',cd:110,dmg:3,spread:.34,n:1,range:230,bspd:11},
             {t:'missile',cd:5000,dmg:14,n:2,spreadDeg:16,range:620,bspd:6.2,splashR:30}]},

  L_gunship:{ img:'L_gunship', name:'스트라이크 건쉽', w:58, r:24, hp:140, spd:1.15, armor:.08,
    from:3, to:13, flying:true,
    desc:'공중 기관포 + 5초마다 확산 미사일 2발',
    weapons:[{t:'gatling',cd:120,dmg:3,spread:.30,n:1,range:250,bspd:11},
             {t:'missile',cd:5000,dmg:16,n:2,spreadDeg:22,range:640,bspd:6,splashR:44}]},

  L_cannon:{ img:'L_cannon', name:'아이언 캐논', w:56, r:24, hp:230, spd:0.55, armor:.35,
    from:5, to:15,
    desc:'2초마다 대구경 포탄 · 착탄 시 강한 폭발',
    weapons:[{t:'missile',cd:2000,dmg:46,n:1,range:520,bspd:5.2,splashR:62,big:true}]},

  L_twin:{ img:'L_twin', name:'트윈 블래스터', w:56, r:23, hp:150, spd:1.0, armor:.12,
    from:8, to:18,
    desc:'중앙 기본 사격 + 3초마다 좌우 5발씩 산탄',
    weapons:[{t:'gatling',cd:300,dmg:6,spread:.05,n:1,range:300,bspd:10},
             {t:'side',cd:3000,dmg:6,n:5,spreadDeg:34,range:200,bspd:7,splashR:16}]},

  L_lancer:{ img:'L_lancer', name:'스카이 렌서', w:50, r:21, hp:130, spd:1.75, armor:.06,
    from:11, to:21, flying:true,
    desc:'2초마다 관통 레이저',
    weapons:[{t:'laser',cd:1700,dmg:56,range:560,life:220,width:11}]},

  L_sweeper:{ img:'L_sweeper', name:'스위퍼 터렛', w:60, r:26, hp:260, spd:0.95, armor:.30,
    from:14, to:24,
    desc:'6방향 동시 사격 · 사방 방어 특화',
    weapons:[{t:'radial',cd:380,dmg:5,n:6,range:300,bspd:9}]},

  L_cruiser:{ img:'L_cruiser', name:'어썰트 크루저', w:66, r:29, hp:300, spd:0.65, armor:.22,
    from:17, to:27, flying:true,
    desc:'전방 광역 개틀링 + 좌우 5발 + 후방 장거리 2발',
    weapons:[{t:'gatling',cd:100,dmg:3,spread:.50,n:1,range:300,bspd:10},
             {t:'side',cd:4000,dmg:5,n:5,spreadDeg:40,range:210,bspd:7,splashR:18},
             {t:'rear',cd:3000,dmg:26,n:2,spreadDeg:14,range:640,bspd:6,splashR:34}]},

  L_titan:{ img:'L_titan', name:'타이탄 워커', w:62, r:28, hp:360, spd:0.85, armor:.34,
    from:20, to:30,
    desc:'대구경 포격 + 추적 미사일 4기 · 파괴 시 대폭발',
    weapons:[{t:'missile',cd:1900,dmg:58,n:1,range:540,bspd:5.2,splashR:70,big:true},
             {t:'seeker',cd:8000,dmg:20,n:4,range:420,bspd:4.4,splashR:34}],
    deathBoom:150},

  L_phantom:{ img:'L_phantom', name:'팬텀 스피어', w:52, r:22, hp:120, spd:1.9, armor:.05,
    from:23, to:33, flying:true,
    desc:'3초간 연쇄 레이저(최대 4연결) 후 플레이어 곁으로 순간이동',
    weapons:[{t:'chain',cd:5000,dur:3000,dmg:11,links:4,range:450,tick:220}]},

  L_nova:{ img:'L_nova', name:'리액터 노바', w:62, r:27, hp:280, spd:0.95, armor:.30,
    from:26, to:36,
    desc:'120도 간격 관통 레이저 3줄이 회전하며 3초간 발사',
    weapons:[{t:'spin',cd:4200,dur:3000,dmg:14,arms:3,range:470,tick:150,spin:.0016}]},
};
/* Hero progression is separate from regular Velcarion capture and neutral spawns. */
const HERO_KEYS=['L_astra','L_nemesis'];
const HERO_RULES={dropAstra:.02,dropNemesis:.0025,rollAstra:.02,rollNemesis:.004,
  bossHp:7200,bossArmor:.50,bossSize:180,bossRadius:62,bossFleetDamage:.45,shotCap:400,fieldCap:192,fxCap:180};
const HEROES={
 L_astra:{name:'아스트라 세이버',en:'ASTRA SABER',factionName:'벨카리온 영웅',hp:500,armor:.32,w:76,r:28,spd:1.55,
  guns:[[.236,.577],[.289,.625],[.712,.625],[.765,.577]],wings:[[.115,.42],[.885,.42]],jets:[[.39,.16],[.61,.16]],
  primary:{cd:160,dmg:3,speed:10,range:650},sweep:{first:3000,cd:7000,life:2000,warn:1000,tick:250,dmg:5,bossDmg:6,len:660,width:5},
  pulse:{first:5000,cd:10000,charge:750,dmg:26,radius:280},dash:{first:10000,cd:15000,charge:2000,away:2000,life:2000,dmg:8,bossDmg:6,width:64,bossWidth:110}},
 L_nemesis:{name:'네메시스 베일',en:'NEMESIS VEIL',factionName:'네겐트리스 영웅',hp:500,armor:.32,w:78,r:29,spd:1.55,
  guns:[[.209,.600],[.244,.621],[.756,.621],[.791,.600]],wings:[[.077,.35],[.923,.35]],jets:[[.39,.15],[.61,.15]],
  primary:{cd:120,dmg:1.5,speed:10.8,range:670},missile:{cd:2500,gap:65,pairs:4,dmg:4,splash:42},
  storm:{first:5000,cd:10000,charge:2000,life:3000,radius:260,tick:300,dmg:3,slow:180},
  hole:{uptime:20000,life:2500,radius:220,pullRadius:310,pullSpeed:28,dmg:100}}
};
for(const key of HERO_KEYS){const d=HEROES[key];LEGENDS[key]={img:key,name:d.name,w:d.w,r:d.r,hp:d.hp,armor:d.armor,spd:d.spd,flying:true,from:60,to:60,
 desc:key==='L_astra'?'4문 레이저 · 전방위 랜덤 빔 · 날개 펄스 · 무적 돌진':'4문 연사 · 8발 미사일 · 전기 폭풍 · 흡인 블랙홀',
 weapons:[{t:'gatling',cd:d.primary.cd,dmg:d.primary.dmg,n:4,range:d.primary.range},key==='L_astra'?{t:'spin',cd:d.sweep.cd,dur:2000,dmg:d.sweep.dmg,range:d.sweep.len}:{t:'storm',cd:d.storm.cd,dur:d.storm.life,dmg:d.storm.dmg,range:d.storm.radius}]};
}
function isHero(u){return !!(u&&HEROES[u.type]);}
function heroUnlocked(){return !!(ownsVelcaCore()&&META.story?.['4-10']?.clear);}
function heroVisibleKeys(){return LEGEND_KEYS.filter(k=>!HEROES[k]||heroUnlocked());}
function heroLegendRoll(){
 const roll=Math.random();if(heroUnlocked()){if(roll<HERO_RULES.rollAstra)return 'L_astra';if(roll<HERO_RULES.rollAstra+HERO_RULES.rollNemesis)return 'L_nemesis';}
 const pool=LEGEND_KEYS.filter(k=>!HEROES[k]);return pool[Math.floor(Math.random()*pool.length)];
}
function heroText(ko,en){return LANG==='ko'?ko:en;}
function heroWeaponDescription(key){return key==='L_astra'?[
 heroText('4문 짧은 레이저 · 0.16초 간격','Four short laser bolts · every 0.16s'),heroText('전방위 랜덤 빔 · 1초 예고 → 2초간 서로 다른 경로 / 재사용 7초','Omnidirectional random beams · 1s warning → four independent 2s sweeps / 7s cooldown'),
 heroText('첫 5초 후 날개 충전 펄스 · 재사용 10초','Wing pulse first at 5s · 10s cooldown'),heroText('첫 10초 후 2초 무적 충전 → 돌진 → 2초 후 귀환 · 재사용 15초','First dash at 10s · 2s invulnerable charge / 2s return / 15s cooldown')]:[
 heroText('4문 연사 · 0.12초 간격','Four gun barrage · every 0.12s'),heroText('2.5초마다 좌우 4발씩 총 8발 · 연기 배출 후 가속','Eight missiles every 2.5s · four per side / smoke ejection then acceleration'),heroText('2초 정지 충전 중 기본 사격 유지 → 3초 고정 전기 폭풍 · 둔화 / 지속 피해','Fire while charging motionless for 2s → a fixed 3s storm · slow / periodic damage'),heroText('기본 사격 누적 20초 → 2.5초 흡인 블랙홀 → 붕괴 후 타깃 근처 귀환','20s of primary fire → 2.5s pulling black hole → collapse and return near target')];}

const LEGEND_KEYS=Object.keys(LEGENDS);
/* ---- 설명 자동 생성 -------------------------------------------------------
   16종 × 4개 언어를 손으로 쓰면 관리가 안 되므로, 스탯과 무기 데이터에서
   문장을 조립합니다. 언어를 바꾸면 설명도 함께 바뀝니다. */
const AI_TEXT={strafe:'aiStrafe',burst:'aiBurst',charge:'aiCharge',salvo:'aiSalvo',
  rove:'aiRove',rockets:'aiRockets',turret:'aiTurret',rage:'aiRage',
  hover:'aiHover',siege:'aiSiege',
  spike:'aiSpike',burrow:'aiBurrow',volt:'aiVolt',
  flak:'aiFlak',wasp:'aiWasp'};
const W_TEXT={gatling:'wGatling',missile:'wMissile',side:'wSide',rear:'wRear',
  seeker:'wSeeker',laser:'wLaser',radial:'wRadial',chain:'wChain',spin:'wSpin'};
function unitBehaviour(key){
  const U=UNITS[key]; if(!U) return '';
  return T(U.ai&&AI_TEXT[U.ai] ? AI_TEXT[U.ai] : 'aiBasic');
}
function unitTraits(key){
  const U=UNITS[key], out=[];
  out.push(T(U.flying?'tAir':'tGround'));
  if(U.ways>1) out.push(T('tMulti',U.ways));
  if(U.homing) out.push(T('tHoming'));
  if(U.splashR) out.push(T('tSplash'));
  if(U.spd===0) out.push(T('tFixed'));
  if(U.elite) out.push(T('tElite'));
  return out;
}
function unitStats(key){
  const U=UNITS[key];
  return [[T('statHp'),U.hp],[T('statDmg'),U.bdmg],
          [T('statFire'),(U.fire/1000).toFixed(1)+'s'],
          [T('statSpd'),U.spd.toFixed(2)]];
}
function legendWeapons(key){
  if(HEROES[key])return heroWeaponDescription(key);
  const L=LEGENDS[key]; if(!L||!L.weapons) return [];
  return L.weapons.map(w=>{
    const nmw=T(W_TEXT[w.t]||'wGatling');
    const dur=(w.dur?w.dur:w.cd)/1000;
    return T('wLine', nmw + (w.n>1?' ×'+w.n:''), w.dmg, dur.toFixed(1));
  });
}
function legendStats(key){
  if(HEROES[key]){const d=HEROES[key];return [[T('statHp'),Math.round(d.hp*powerMul('legend',key))],[T('statSpd'),d.spd.toFixed(2)],[heroText('피해 감소','Damage reduction'),Math.round(d.armor*100)+'%']];}
  const L=LEGENDS[key];
  return [[T('statHp'),L.hp],[T('statSpd'),L.spd.toFixed(2)],
          [T('statRange'),Math.max(...L.weapons.map(w=>w.range||0))]];
}
/* 레전드 출신 지역 — 스토리에서 지역별로 다른 유닛이 나옵니다 */
const LEGEND_REGION={L_vulcan:'E',L_cannon:'E',L_twin:'E',L_sweeper:'E',L_titan:'E',
                     L_gunship:'M',L_lancer:'M',L_cruiser:'M',L_phantom:'M',L_nova:'M'};

/* ======================== 유물 ==========================================
   보유하면 항상 적용되는 패시브입니다. 중복으로 뽑으면 단계가 올라갑니다.
   상점의 유물 소환(아스트라늄)으로 얻습니다. */
const RELIC_RARITY={N:{t:'rarN',c:'#8E9A86',w:52},R:{t:'rarR',c:'#5FD07A',w:28},
                    SR:{t:'rarSR',c:'#5BC8F0',w:15},SSR:{t:'rarSSR',c:'#FFC24A',w:5}};
const rarName=ra=>T(RELIC_RARITY[ra].t);
const RELICS={
/* v24 — 레벨을 잘게 쪼갰습니다. v0 는 Lv1 값, vmax 는 최대 레벨 값이고
   그 사이를 선형으로 채웁니다. 한 번 올릴 때의 체감은 작아지지만
   끝까지 올렸을 때의 도달치는 예전보다 높습니다.
   step 은 표시 단위(0이면 정수) 입니다. */
  r_core:  {ic:'rel1',  ra:'N',  t:'rCore',   v0:1,   vmax:9,   st:1},
  r_armor: {ic:'rel3',  ra:'N',  t:'rArmor',  v0:2,   vmax:28,  st:0},
  r_cool:  {ic:'rel5',  ra:'N',  t:'rCool',   v0:3,   vmax:34,  st:0},
  r_thrust:{ic:'rel4',  ra:'N',  t:'rThrust', v0:2,   vmax:26,  st:0},
  r_scan:  {ic:'rel2',  ra:'R',  t:'rScan',   v0:2,   vmax:20,  st:0},
  r_tow:   {ic:'rel6',  ra:'R',  t:'rTow',    v0:2,   vmax:18,  st:0},
  r_nano:  {ic:'rel7',  ra:'R',  t:'rNano',   v0:0.4, vmax:4.4, st:1},
  r_link:  {ic:'rel8',  ra:'SR', t:'rLink',   v0:1,   vmax:8,   st:1},
  r_bay:   {ic:'rel9',  ra:'SR', t:'rBay',    v0:1,   vmax:4,   st:0},
  r_mag:   {ic:'rel10', ra:'SSR',t:'rMag',    v0:1,   vmax:4,   st:0},
};
const RELIC_KEYS=Object.keys(RELICS);
/* 희귀도별 최대 레벨 — 흔한 유물일수록 오래, 길게 키웁니다 */
const RELIC_MAXLV={N:40, R:32, SR:24, SSR:16};
const relicMax=k=>['r_bay','r_mag'].includes(k)?1:RELIC_MAXLV[RELICS[k].ra];
/* Lv1 = v0, 최대 레벨 = vmax. 그 사이는 선형입니다. */
function relicValAt(k,lv){
  const R=RELICS[k], mx=relicMax(k);
  if(lv<=0) return 0;
  const a=(lv-1)/Math.max(1,mx-1);
  const raw=R.v0+(R.vmax-R.v0)*a;
  return R.st ? Math.round(raw*10)/10 : Math.round(raw);
}
/* 기존 코드가 R.d(v) / R.v[n] 형태로 부르고 있어 호환 래퍼를 답니다 */
for(const k of RELIC_KEYS){
  const R=RELICS[k];
  R.d=(function(val){ return T(R.t,val); });
  Object.defineProperty(R,'v',{get:()=>{
    const mx=relicMax(k), out=[];
    for(let l=1;l<=mx;l++) out.push(relicValAt(k,l));
    return out; }});
}
/* 아직 얻지 못한 유물도 Lv1 기준으로 효과를 보여줍니다 */
const relicPreview=k=>T(RELICS[k].t, relicValAt(k,1));
/* 카드 누적 → 단계 (1/3/8/18/38장에서 Lv1~5) */
function relicLv(k){ return (META.relics[k]||{}).lv|0; }
/* relicVal 은 아래에서 다시 정의되지만, 참조 순서를 위해 여기서도 둡니다 */
function relicVal(k){ return relicValAt(k, relicLv(k)); }
const RELIC_COST=100, RELIC_COST10=Math.round(100*10*0.9);
/* 아스트라늄 구매 — 금액이 클수록 보너스가 커집니다 (결제는 미연동) */
const AST_PACKS=[
  {usd:'$0.99', base:100,   bonus:0},
  {usd:'$4.99', base:520,   bonus:10},
  {usd:'$9.99', base:1080,  bonus:20},
  {usd:'$19.99',base:2250,  bonus:30},
  {usd:'$49.99',base:5900,  bonus:40},
  {usd:'$99.99',base:12300, bonus:50},
];
/* 아스트라늄 → 크레딧 교환 (많이 바꿀수록 유리) */
const CRED_PACKS=[{ast:10,cred:1000},{ast:50,cred:5500},{ast:100,cred:12000}];
/* 실제 뽑기 확률 — 유물 개수까지 반영해 계산합니다 */
function relicOdds(){
  const tot={}; let sum=0;
  for(const k of RELIC_KEYS){ const w=RELIC_RARITY[RELICS[k].ra].w;
    tot[RELICS[k].ra]=(tot[RELICS[k].ra]||0)+w; sum+=w; }
  return ['N','R','SR','SSR'].filter(r=>tot[r])
    .map(r=>RELIC_RARITY[r].n+' '+(tot[r]/sum*100).toFixed(1)+'%').join(' · ');
}
function relicRoll(){
  const bag=[];
  for(const k of RELIC_KEYS) for(let i=0;i<RELIC_RARITY[RELICS[k].ra].w;i++) bag.push(k);
  return bag[(Math.random()*bag.length)|0];
}
/* 해당 스테이지에 등장 가능한 레전드 */
/* 데뷔한 레전드는 계속 후보에 남습니다.
   예전에는 to 를 넘기면 빠져서, 최상위 레전드의 상한(36)을 넘는
   37스테이지부터는 후보가 아예 비어 중립 레전드가 영영 등장하지 않았습니다.
   전성기 구간 안에 있으면 3배 가중치를 주어 '새 레전드를 만나는 느낌'은 남깁니다. */
const legendsForStage=n=>{
  const out=[];
  for(const k of LEGEND_KEYS){
    const d=LEGENDS[k];
    if(HEROES[k]||n<d.from) continue;
    const w = n<=(d.to||d.from+10) ? 3 : 1;
    for(let i=0;i<w;i++) out.push(k);
  }
  return out;
};

/* ======================== 스토리 스테이지 ================================
   1장은 지구에서 시작해 6번째부터 화성으로 전선이 옮겨갑니다.
   각 스테이지 임무는 소량의 재화, 장 전체 클리어는 레전드 카드 1장을 줍니다. */
const MISSION_POOL=[
  /* 처치 목표가 늘어난 만큼 제한 시간도 함께 늘립니다.
     그대로 두면 1-1 의 90초 임무가 사실상 불가능해집니다. */
  {id:'time', n:i=>T('mTime',110+i*12),            ok:(S,i)=>S.clearMs<=(110+i*12)*1000},
  {id:'nohit',n:()=>T('mNohit'),                   ok:S=>S.hits===0},
  {id:'nocap',n:()=>T('mNocap'),                   ok:S=>S.captured===0},
  {id:'kill', n:i=>T('mKill',24+i*4),              ok:(S,i)=>S.kills>=24+i*4},
  {id:'item', n:i=>T('mItem',4+Math.floor(i/2)),   ok:(S,i)=>S.itemGot>=4+Math.floor(i/2)},
  {id:'squad',n:i=>T('mSquad',Math.min(4,2+Math.floor(i/3))),
   ok:(S,i)=>rosterCount(false)>=Math.min(4,2+Math.floor(i/3))},
  {id:'nosum',n:()=>T('mNosum'),                   ok:S=>S.summonUsed===0},
  {id:'noheal',n:()=>T('mNoheal'),                 ok:S=>S.healUsed===0},
];
/* 적 기지가 나타나기까지 처치해야 할 적 수.
   인피니티와 스토리가 같은 식을 씁니다 — 스토리는 환산 난이도(diff)를 넣습니다.

     killNeed = 16 + 2.6·d + 6·√d

   · 상수 16 과 √d 항이 초반을 끌어올립니다. 예전에는 1~3스테이지가
     6 / 9 / 12기라 30초도 안 되어 기지가 떴습니다.
   · 2.6·d 가 후반까지 꾸준히 늘려 줍니다.
   · 예전 인피니티 식은 3스테이지 12기 → 4스테이지 26기로 두 배 넘게 튀었는데,
     이 곡선은 매끄럽게 이어집니다.
   결과 — 인피니티 1/5/10/20/50스테이지 = 24 / 41 / 58 / 90 / 176기 */
function killNeedFor(d){
  d=Math.max(1,d);
  /* 상한 220 — 아주 깊은 인피니티에서 사냥 구간이 끝없이 늘어지지 않게 */
  return Math.min(220, Math.round(16 + 2.35*d + 6*Math.sqrt(d)));
}

/* 장별 무대. 1장 후반부터 지구를 떠나 케레스로 넘어갑니다. */
const CH_THEME=['EARTH','CERES','IGNIS','PRISMA'];
const PLANET_OF={EARTH:'pEarth', CERES:'pCeres', IGNIS:'pIgnis', PRISMA:'pPrisma'};
function storyList(){
  const out=[];
  for(let ch=1; ch<=4; ch++)
    for(let st=1; st<=10; st++){
      const gi=(ch-1)*10+st-1;                     // 전체 진행 인덱스
      /* 1장 6번째부터는 이미 지구 밖 — 레전드 출현 지역도 여기서 갈립니다 */
      const offworld = ch>=2 || st>=6;
      const theme = (ch===1 && st<6) ? 'EARTH' : (ch===1 ? 'CERES' : CH_THEME[ch-1]);
      const seed=(gi*7919)%MISSION_POOL.length;
      const ms=[0,1,2].map(k=>MISSION_POOL[(seed+k*3)%MISSION_POOL.length]);
      const diff = 1+gi*0.9;                       // 인피니티 스테이지 환산 난이도
      out.push({id:ch+'-'+st, ch, st, gi, mars:offworld, theme, ms,
        diff,
        /* 반올림하지 않은 diff 를 넣어야 스테이지마다 반드시 늘어납니다 */
        killNeed: killNeedFor(diff)});
    }
  return out;
}
/* 스테이지가 속한 행성 이름 */
const planetName=x=>T(PLANET_OF[x.theme]||'pEarth');
const STORY=storyList();
STORY.find(x=>x.id==='4-10').ms=[{id:'astra',n:()=>heroText('아스트라 세이버 처치','Defeat Astra Saber'),ok:S=>!!S.hero?.bossDefeated},...STORY.find(x=>x.id==='4-10').ms.slice(1)];
const storyIndex=id=>STORY.findIndex(x=>x.id===id);
function storyRec(id){ return META.story[id]||(META.story[id]={stars:[false,false,false],clear:false}); }
/* Chapter rewards replace the old per-stage Legend grant. Existing cards stay owned. */
const STORY_REWARD={mission:1,first:1,creditBase:30,creditStep:5,replayBase:10,replayStep:2};
function migrateChapterRewards(){
  if(!META.storyChapters||typeof META.storyChapters!=='object')META.storyChapters={};
  if(META.storyRewardVersion>=10)return;
  for(let ch=1;ch<=4;ch++){
    const stages=STORY.filter(x=>x.ch===ch);
    if(stages.every(x=>META.story[x.id]?.clear))META.storyChapters[ch]={claimed:true,legacy:true};
  }
  META.storyRewardVersion=10;
}
function settleStoryReward(){
  const x=S.story,rec=storyRec(x.id),first=!rec.clear;rec.clear=true;
  let ast=first?STORY_REWARD.first:0;
  x.ms.forEach((m,k)=>{
    let ok=false;try{ok=!!m.ok(S,x.gi);}catch(e){}
    const isNew=ok&&!rec.stars[k];if(ok)rec.stars[k]=true;
    if(isNew)ast+=STORY_REWARD.mission;
    S.missionRes.push({n:typeof m.n==='function'?m.n(x.gi):m.n,ok,isNew});
  });
  const credits=first?STORY_REWARD.creditBase+x.gi*STORY_REWARD.creditStep:STORY_REWARD.replayBase+x.gi*STORY_REWARD.replayStep;
  META.astranium+=ast;META.credits+=credits;S.missionAst=ast;S.missionCredits=credits;S.missionAll=rec.stars.every(Boolean);
  META.storyChapters=META.storyChapters||{};
  const complete=STORY.filter(s=>s.ch===x.ch).every(s=>META.story[s.id]?.clear);
  if(complete&&!META.storyChapters[x.ch]?.claimed){
    const region=x.ch===1?'E':'M',pool=LEGEND_KEYS.filter(k=>LEGEND_REGION[k]===region);
    const key=pool[(Math.random()*pool.length)|0];
    META.storyChapters[x.ch]={claimed:true,key};
    // A chapter award is not a field capture and earns no extra capture currency.
    addCard('legend',key,1);S.missionCard=nm(key);S.chapterReward=key;
  }
}
function advanceAfterUpgrade(){
  if(cgSeasonGate())return;
  if(S.story){const next=STORY[storyIndex(S.story.id)+1];
    if(!next||next.ch!==S.story.ch){metaSave();showMenu();return;}}
  S.storyStep=(S.storyStep||1)+1;show(null);startStage(S.stage+1);
}

/* Story-only, permanent ownership. Kept outside every summon/upgrade pool. */
const VELCA_CORE_KEY='r_velca_core';
const VELCA_CORE_STAGES=STORY.filter(x=>x.ch>=1&&x.ch<=4);
function ownsVelcaCore(){return META.relics?.[VELCA_CORE_KEY]?.lv===1;}
function velcaCoreProgress(){
  let stars=0,complete=0;
  for(const x of VELCA_CORE_STAGES){
    const rec=META.story?.[x.id],n=rec?.clear?[0,1,2].filter(i=>rec.stars?.[i]===true).length:0;
    stars+=n;if(n===3)complete++;
  }
  return {stars,total:VELCA_CORE_STAGES.length*3,complete,stages:VELCA_CORE_STAGES.length};
}
function grantVelcaCore(){
  if(ownsVelcaCore())return false;
  const p=velcaCoreProgress();if(p.stages!==40||p.complete!==p.stages)return false;
  META.relics[VELCA_CORE_KEY]={lv:1,cards:0,source:'story-120-stars',earnedAt:Date.now(),announced:false};
  return true;
}
function canCaptureUnit(u){return !!u&&!isHero(u)&&(!isVelcarion(u)||ownsVelcaCore());}
function coreText(ko,en){return LANG==='ko'?ko:en;}
function velcaCoreCard(parent,celebrate=false){
  const p=velcaCoreProgress(),owned=ownsVelcaCore(),d=document.createElement('button');
  d.type='button';d.className='velca-core-card'+(owned?' owned':'')+(celebrate?' earned':'');
  d.innerHTML=`<img src="${ART.velca_core}" alt=""><span class="core-copy"><small>${coreText(celebrate?'특수 유물 획득':'스토리 완전 정복 보상',celebrate?'SPECIAL RELIC ACQUIRED':'STORY MASTERY REWARD')}</small><strong>${coreText('벨카코어','Velca Core')} <em>VELCA CORE</em></strong><span>${coreText(owned?'벨카리온 포획 해금 · 보유 효과 적용 중':'1–4장 모든 스테이지 ★★★ 달성',owned?'Velcarion capture unlocked · Always active':'Earn ★★★ on every stage in Chapters 1–4')}</span><span class="core-meter" role="progressbar" aria-label="${coreText('스토리 별','Story stars')}" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.stars}"><i style="width:${p.stars/p.total*100}%"></i></span><span class="core-bottom"><b>★ ${p.stars} / ${p.total}</b><span>${coreText('뽑기 획득 불가 · 1회 지급','Never summoned · One-time reward')}</span></span></span>`;
  d.onclick=()=>velcaCoreDrawer(d);parent.appendChild(d);return d;
}
function velcaCoreDrawer(anchor){
  const p=velcaCoreProgress(),owned=ownsVelcaCore();
  openDrawer({anchor,img:ART.velca_core,name:coreText('벨카코어','Velca Core'),color:'#82DFFF',wide:true,
    sub:coreText('스토리 전용 특수 유물 · 영구 보유 효과','Story-exclusive special relic · Permanent passive'),
    build(b){
      dtext(b,coreText('회수한 벨카코어의 정밀 분석으로 고대 코어 접속 기술을 확보했습니다.','Analysis of the recovered Velca Core reveals its ancient access protocol.'));
      dsec(b,coreText('능력','Ability'));
      dtext(b,coreText('벨카리온의 기계 코어와 공명해 6종의 벨카리온 유닛을 포획할 수 있습니다. 획득 즉시 적용되며 장착은 필요하지 않습니다.','Resonate with mechanical cores to capture all six Velcarion units. Active immediately on ownership; no equipment slot needed.'));
      dsec(b,coreText('획득 조건','Unlock condition'));
      dtext(b,coreText('1–4장 전체 40개 스테이지를 별 3개로 완수하세요. 총 120개의 별을 모으면 자동으로 한 번 지급됩니다. 별은 재도전하며 누적할 수 있습니다. 뽑기·상점·일반 드롭에서는 나오지 않습니다.','Complete all 40 stages in Chapters 1–4 with three stars. Automatically awarded once at 120 stars. Stars accumulate across successful replays. Never available from summons, shops, or random drops.'));
      dstats(b,[[coreText('모은 별','Stars'),`${p.stars} / ${p.total}`],[coreText('별 3개 스테이지','Three-star stages'),`${p.complete} / ${p.stages}`],[coreText('상태','Status'),coreText(owned?'보유 · 포획 해금':'미획득',owned?'Owned · Capture unlocked':'Locked')]]);
      dtext(b,coreText('해금 후에는 기존 포획 확률과 일반 편대 정원을 사용합니다. 포획한 벨카리온은 고유 공격으로 함께 싸우며, 스테이지가 끝나면 기존 포획 편대와 동일하게 정리됩니다.','After unlocking, capture uses the existing standard capture chance and squad capacity. Captured Velcarion keep their signature attacks and leave at stage transitions, like the existing captured squad.'));
      const roster=document.createElement('div');roster.className='core-roster';
      for(const k of VELCA_KEYS){const u=document.createElement('div');u.innerHTML=`<img src="${ART[k]}" alt=""><span>${nm(k)}</span>`;roster.appendChild(u);}b.appendChild(roster);
    }});
}
function velcaCoreNotice(){
  const rec=META.relics?.[VELCA_CORE_KEY];if(!ownsVelcaCore()||rec.announced)return;
  let host=document.getElementById('velcaCoreNotice');
  if(!host){host=document.createElement('div');host.id='velcaCoreNotice';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');document.body.appendChild(host);}
  host.innerHTML='';const panel=document.createElement('div');panel.className='core-notice-panel';host.appendChild(panel);
  const title=document.createElement('h2');title.id='coreNoticeTitle';title.textContent=coreText('120개의 별, 벨카코어 각성','120 stars · Velca Core awakened');panel.appendChild(title);host.setAttribute('aria-labelledby',title.id);
  velcaCoreCard(panel,true);
  const note=document.createElement('p');note.textContent=coreText('모든 스토리 도전을 완수했습니다. 이제 벨카리온을 포획해 편대로 합류시킬 수 있습니다.','You mastered every Story stage. Velcarion can now be captured and join your squad.');panel.appendChild(note);
  const button=document.createElement('button');button.className='core-notice-close';button.textContent=coreText('확인','Continue');panel.appendChild(button);
  const previous=document.activeElement;
  button.onclick=()=>{rec.announced=true;metaSave();host.remove();previous?.focus?.();};
  host.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();button.click();}if(e.key==='Tab'){const controls=[...host.querySelectorAll('button')],first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  button.focus();
}

/* Velcarion attacks now keep their allegiance through every secondary effect. */
function velcaTeam(source){return source?.team||(source?.side==='ally'?'ally':'enemy');}
function velcaTargets(source){
  return velcaTeam(source)==='ally'
    ? [...S.enemies.filter(t=>t.side==='enemy'&&!t.gone&&t.hp>0),...S.turrets.filter(t=>t.alive&&t.hp>0)]
    : [S,...S.allies].filter(t=>t.hp>0);
}
function velcaOwnerAlive(e){return !!e&&e.hp>0&&!e.vc?.dead&&(e.side==='ally'?S.allies:S.enemies).includes(e);}
function velcaValidTarget(source,t){return velcaTargets(source).includes(t);}
function velcaDisarm(e){
  if(!S.velca)return;
  for(const key of ['shots','channels','beams','emitters','storms'])S.velca[key]=(S.velca[key]||[]).filter(v=>v.owner!==e);
}
function makeVelcaAlly(type,x,y){
  if(!ownsVelcaCore())return null;
  const a=makeVelcarion(type,x,y);a.side='ally';a.uncapturable=false;a.hp=a.hpMax=VELCARION[type].hp;return a;
}
function convertVelcaToAlly(e){
  if(!ownsVelcaCore()||!S.enemies.includes(e))return false;
  velcaDisarm(e);const a=makeVelcaAlly(e.type,e.x,e.y);a.face=e.face;a.vc.aim=e.face;pushAlly(a);return a;
}
function velcaAllyAI(a,dt,slow=1){
  if(a.hp<=0)return;
  const target=velcaTarget(a,720);
  if(target){velcaAI(a,dt,slow);}
  else{
    velcaStopChannel(a);a.vc.shots=0;a.vc.charge=0;a.vc.swing=0;a.vc.recoil=0;
    const dx=S.px-a.x,dy=S.py-a.y,d=Math.hypot(dx,dy);
    if(d>110){a.face=a.vc.aim=Math.atan2(dy,dx);const step=Math.min(d-110,a.spd*1.3*slow*dt/16);a.x+=dx/d*step;a.y+=dy/d*step;}
  }
  a.x=Math.max(16,Math.min(WORLD.w-16,a.x));a.y=Math.max(16,Math.min(WORLD.h-16,a.y));resolveProps(a,a.r,a.flying);
}

const STORY_COMMANDER_PORTRAIT='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E';
/* Act I canon. Future-act answers are intentionally absent from player-facing records. */
const STORY_RECORDS=[
 {id:'prologue',group:'operations',chapter:0,title:['꺼져 가는 고향','A fading home'],tag:['서막 · 지구','PROLOGUE · EARTH'],quote:['출항로를 확보하라. 지구의 미래가 이 함대에 달려 있다.','Secure the departure route. Earth is depending on this fleet.'],body:{ko:[
 '에너지 자원의 고갈과 환경오염으로 지구는 한계에 다다랐다. 인류의 후예인 아르디안인들은 도시를 유지할 전력마저 배급받으며 살아가고 있었다.',
 '여러 국가와 군사 세력이 아르디안 연합을 결성했다. 새로운 자원을 확보해 지구를 재건한다는 목표 아래, 대규모 행성 정복 계획이 시작되었다.',
 '모든 아르디안인이 이 계획에 동의한 것은 아니었다. 정복에 반대하는 이들은 세라크 연맹을 조직했다. 출항 중단을 요구하던 대립은 무력 충돌로 번졌고, 같은 인류가 서로를 향해 포문을 열었다.',
 '당신은 아르디안 연합 원정군의 지휘관이다. 적 기계의 제어권을 확보하는 포획 시스템과 함께, 함대가 나아갈 길을 열어야 한다.'
 ],en:['Earth is running out of energy while pollution makes its cities harder to sustain. The descendants of humanity, the Ardians, face a struggle for survival.','The Ardian Union launches a planetary conquest campaign to secure resources. Opponents form the Serak League, and the dispute becomes a civil war.','You command an Ardian Union expeditionary unit. Your capture system can seize enemy machines and reinforce the squad. Your first order is to open the fleet’s departure route.']}},
 {id:'departure',group:'operations',chapter:1,after:'1-5',title:['지구를 떠나는 함대','Departure'],tag:['1장 · 출항 보고','CHAPTER 1 · DEPARTURE'],body:{ko:['세라크 연맹은 지구의 수송항과 출항로를 봉쇄했다. 당신의 부대는 적의 기계를 포획해 병력을 보충하며 함대의 진로를 열었다.','출항에 성공했다고 전쟁이 끝난 것은 아니었다. 세라크 함대도 지구를 떠나 원정군을 추격하기 시작했다. 연합의 다음 목적지는 세레스였다.'],en:['Your unit breaks the Serak blockade and opens a route out of Earth. Captured machines help the expedition keep moving.','The League follows the departing fleet. The conflict now extends beyond Earth, toward Ceres.']}},
 {id:'ceres',group:'operations',chapter:1,after:'1-10',title:['세레스 진입','Ceres secured'],tag:['1장 · 원정 기록','CHAPTER 1 · EXPEDITION'],body:{ko:['연합은 세라크의 추격을 뚫고 세레스에 진입했다. 대규모 채굴 시설과 지하 공동이 발견되자, 지휘부는 이곳에서 지구에 보낼 에너지를 확보할 수 있다고 기대했다.','당신의 부대에는 채굴 구역을 확보하고 탐사대의 조사 경로를 보호하라는 명령이 내려왔다.'],en:['The Union reaches Ceres despite Serak pursuit. Vast mining facilities appear to promise the energy Earth needs.','Your next assignment is to secure the excavation zones and protect the survey teams.']}},
 {id:'empty-mines',group:'operations',chapter:2,after:'2-5',title:['비어 있는 광맥','Empty veins'],tag:['2장 · 탐사 보고','CHAPTER 2 · SURVEY'],body:{ko:['세레스의 주요 채굴 구역을 확보했지만 기대했던 에너지원은 나오지 않았다. 오래된 광맥들은 이미 고갈되어 있었다.','보급은 줄어들고 세라크의 압박은 계속되었다. 지휘부가 추가 굴착을 지시한 가운데, 가장 깊은 지하에서 출처를 알 수 없는 기계 구조물이 발견되었다.'],en:['The secured mines contain no usable energy reserves. Their ancient veins are exhausted.','With supplies declining and Serak pressure increasing, a survey team discovers an unknown machine structure beneath the deepest excavation.']}},
 {id:'core-discovery',group:'operations',chapter:2,after:'2-10',title:['벨카코어의 좌표','Coordinates of the Velca Core'],tag:['2장 · 고대 기록 복원','CHAPTER 2 · RECOVERED ARCHIVE'],quote:['목적지 확인. 프라즈마 행성, 심연 좌표를 전송한다.','Destination confirmed. Transmitting the coordinates of the Prisma abyss.'],body:{ko:['당신의 포획 안테나가 유적의 미약한 신호와 공명했다. 고대 기록이 복원되면서, 벨카코어라는 이름의 에너지원이 드러났다.','아르디안의 동력원과 비교할 수 없는 출력, 오랜 세월에도 고갈되지 않는 에너지 순환 구조. 그 힘은 지구의 에너지 위기를 끝낼 가능성이 있었다.','기록에 명시된 위치는 프라즈마 행성의 심연이었다. 연합 지휘부는 이 정보를 극비로 분류했다. 세라크보다 먼저 그곳에 도착해야 했다.'],en:['Your antenna resonates with the ruin and restores an ancient record. It names an extraordinary energy source: the Velca Core.','Its output and circulation system could offer a solution to Earth’s energy crisis. The record places it deep beneath Prisma.','Command classifies the discovery. The Union must reach those coordinates before the Serak League.']}},
 {id:'ignis-bait',group:'operations',chapter:3,after:'3-5',title:['거짓 좌표','False coordinates'],tag:['3장 · 기만 작전','CHAPTER 3 · DECEPTION'],body:{ko:['프라즈마로 향하는 동안 세라크와 정면 대결을 벌인다면, 연합은 남은 보급을 모두 소모할 위험이 있었다. 지휘부는 벨카코어가 이그니스에 있다는 조작된 정보를 흘렸다.','연합 함대 일부가 이그니스로 이동해 정보를 뒷받침했다. 세라크 주력이 그 뒤를 따르는 동안, 당신은 소규모 부대로 항로 중계 시설과 방어망에 침투했다.'],en:['A direct battle on the way to Prisma could exhaust the expedition. Command leaks a false report locating the Velca Core on Ignis.','A visible Union deployment draws the Serak main fleet to the planet. Your smaller force infiltrates its route relays and defense network.']}},
 {id:'ignis-trap',group:'operations',chapter:3,after:'3-10',title:['닫힌 항로, 열린 심연','A route sealed, a path opened'],tag:['3장 · 작전 성공','CHAPTER 3 · OPERATION COMPLETE'],quote:['중계망 장악 완료. 지금 프라즈마로 향한다.','Relay control secured. Proceed to Prisma now.'],body:{ko:['세라크 주력이 이그니스 깊숙이 진입한 순간, 포획된 중계망이 차단되었다. 퇴로 신호를 잃은 함대는 화산 지대와 전자 폭풍 사이에 묶였다.','당신의 부대가 확보한 틈으로 연합 함대가 빠져나갔다. 세라크를 완전히 궤멸시킨 것은 아니었다. 그러나 프라즈마의 심연에 먼저 도착할 시간은 충분했다.'],en:['Once the Serak fleet commits, the captured relays go dark. Without exit signals, its main force is trapped amid Ignis’s volcanic terrain and electromagnetic storms.','The Union slips through the opening. The League remains a threat, but the expedition has bought enough time to reach Prisma first.']}},
 {id:'first-contact',group:'operations',chapter:4,after:'4-1',title:['심연의 수호자','Guardians of the abyss'],tag:['4장 · 최초 조우','CHAPTER 4 · FIRST CONTACT'],quote:['접근을 중단하라. 그 힘은 너희의 것이 아니다.','Stop your approach. That power is not yours.'],body:{ko:['세레스의 기록은 정확했다. 연합은 프라즈마의 지하로 빠르게 진입했고, 심연에서 마침내 벨카코어를 발견했다.','회수 장치가 가동되자 어둠 속의 기계 구조물들이 움직이기 시작했다. 벨카코어를 지키는 고대 기계 생명체, 벨카리온이었다.','교신은 경고로 돌아왔고 포획 신호는 차단되었다. 연합이 후퇴를 거부하면서 프라즈마 대전투가 시작되었다.'],en:['The Ceres coordinates lead the Union directly into Prisma’s abyss. The Velca Core is real.','Activating the recovery equipment awakens its guardians: the ancient mechanical Velcarion. They reject capture signals and demand withdrawal.','The Union refuses. The battle for Prisma begins.']}},
 {id:'prisma-advance',group:'operations',chapter:4,after:'4-5',title:['승리 직전','Victory within reach'],tag:['4장 · 전황 보고','CHAPTER 4 · SITUATION REPORT'],body:{ko:['지구와 세레스, 이그니스에서 경험을 쌓은 당신의 부대는 벨카리온의 공격 패턴을 파악하며 전선을 밀어붙였다. 연합은 회수 장치 주변을 확보하고 적 증원 경로를 차단했다.','상층부가 연합의 통제 아래 들어오자 승전 보고가 이어졌다. 지휘부는 벨카코어의 확보가 임박했다고 판단했다.'],en:['Your experienced unit finds openings in Velcarion defenses. The Union secures the recovery site and cuts several reinforcement routes.','With the upper levels under Union control, command believes the Velca Core is almost won.']}},
 {id:'astra-reversal',group:'operations',chapter:4,after:'4-9',title:['뒤집힌 전세','The reversal'],tag:['4장 · 긴급 전황','CHAPTER 4 · EMERGENCY REPORT'],body:{ko:['심연의 봉인문에서 아스트라 세이버가 모습을 드러냈다. 벨카리온의 최고 영웅이자 최강의 전력이었다.','그의 등장과 함께 벨카리온은 전열을 되찾았다. 연합의 집중 포격을 돌파한 아스트라 세이버가 핵심 진지를 무너뜨리자, 승전 보고는 구조 요청으로 바뀌었다.','동시에 이그니스에서 빠져나온 세라크의 추격 부대가 프라즈마 외곽을 봉쇄했다. 앞에는 벨카리온, 뒤에는 세라크. 당신의 부대와 원정 함대는 심연에 고립되었다.'],en:['Astra Saber emerges from the abyss: the Velcarion’s greatest hero and strongest combatant. His counterattack overturns the Union advance.','At the same time, Serak pursuit forces escape Ignis and blockade Prisma’s outer routes. With Velcarion ahead and Serak behind, the expedition has nowhere to retreat.']}},
 {id:'nemesis-arrival',group:'operations',chapter:4,after:'4-10',title:['갈라진 시공간','A tear in spacetime'],tag:['1막 · 최종 전투 기록','ACT I · FINAL BATTLE RECORD'],quote:['너희의 존재를 내가 알려주지.','I will make your existence known.'],body:{ko:['마지막 방어선이 무너지려던 순간, 전장 한가운데의 시공간이 갈라졌다. 그 틈에서 네겐트리스 종족의 영웅, 네메시스 베일이 나타났다. 그는 자신이 반물질 세계에서 왔다고 밝혔다.','네메시스 베일은 당신에게 의도를 알 수 없는 말을 남긴 뒤 전투에 뛰어들었다. 아스트라 세이버의 공격을 받아낸 그는 압도적인 전투력으로 반격해, 벨카리온의 영웅을 제압했다.','아스트라 세이버는 남은 병력의 엄호를 받으며 후퇴했다. 정체불명의 전력과 다시 전열을 갖춘 연합을 동시에 상대할 수 없었던 세라크도 봉쇄를 풀고 물러났다.'],en:['As the last defense fails, spacetime splits open. Nemesis Veil appears, a hero of the Negentris who claims to come from an antimatter world.','He addresses you with an uncertain promise, then joins the battle. His overwhelming power defeats Astra Saber and forces the Velcarion to withdraw.','Facing both the unknown hero and a regrouping Union, the Serak fleet lifts its blockade and retreats.']}},
 {id:'act-one-end',group:'operations',chapter:4,after:'4-10',title:['벨카코어 회수 완료','The Velca Core recovered'],tag:['1막 종결 · 귀환 기록','ACT I COMPLETE · RETURN LOG'],body:{ko:['아르디안 연합은 벨카코어를 확보했다. 지구로 전송된 승전 보고에는 원정의 성공과 새로운 에너지원의 확보가 기록되었다.','절체절명의 순간에 나타난 네메시스 베일은 연합의 구원자로 받아들여졌다. 그는 대가를 요구하지 않았다. 다만 벨카코어의 안정적인 운용에 자신의 지식이 필요할 것이라고 말했다.','연합은 그의 도움을 받아들였다. 당신은 마지막 통신에 남은 한 문장을 다시 확인했다. “너희의 존재를 내가 알려주지.” 누구에게 무엇을 알려주겠다는 뜻인지는 여전히 확인되지 않았다.','벨카코어를 실은 함대가 지구로 향했다. 아르디안 연합은 승리했다. 그렇게 첫 번째 원정이 끝났다.'],en:['The Ardian Union recovers the Velca Core and transmits news of victory to Earth. The expedition has secured its energy source.','Nemesis Veil is welcomed as a savior. He asks for no payment, only offering knowledge needed to operate the Core safely. Command accepts.','You review his first words again. Who would learn of your existence, and why? The answer remains unknown.','The fleet turns toward Earth. The Union has won. The first expedition ends.']}},
 {id:'core-analysis',group:'operations',chapter:4,core:true,title:['공명 코어 분석 완료','Resonance analysis complete'],tag:['120개 별 · 특수 유물 기록','120 STARS · SPECIAL RELIC'],image:'velca_core',body:{ko:['1막의 모든 작전 목표를 완수한 지휘관에게 회수한 벨카코어의 정밀 분석 결과가 전달되었다. 고대 코어의 접속 구조를 해독하면서, 벨카리온 기계에 통하는 공명 신호가 확인되었다.','이 기술을 담은 특수 유물 벨카코어는 보유 즉시 포획 시스템에 적용된다. 별도 장착은 필요하지 않으며, 뽑기로 획득할 수 없다. 벨카리온 포획이 해금되어도 기존 포획 확률과 편대 정원은 유지된다.'],en:['Completing all Act I objectives unlocks a full analysis of the recovered Velca Core. Its resonance protocol can connect to Velcarion machines.','The special relic applies this knowledge permanently to your capture system. It cannot be summoned and needs no equipment slot. Existing capture chance and squad capacity still apply.']}},
 {id:'commander',group:'dossiers',chapter:0,title:['당신 — 연합 지휘관','You — Union commander'],tag:['인물 · 플레이어','PERSONNEL · PLAYER'],image:'main',body:{ko:['소속: 아르디안 연합 원정군. 임무: 선봉 지휘, 전선 돌파, 적 기계 포획 및 편대 운용.','당신은 포획 시스템을 탑재한 특수 지휘 기체로 원정군을 이끈다. 현장에서 확보한 적 병기를 아군 편대로 전환하며 부족한 전력을 보충한다. 지구에서 시작한 임무는 세레스와 이그니스를 거쳐 프라즈마로 이어진다.'],en:['Affiliation: Ardian Union expeditionary force. Duties: vanguard command, breakthrough operations, and captured-squad control.','You lead from a specialized command machine equipped with a capture system. Turning enemy machines into allies sustains the expedition across its four planetary fronts.']}},
 {id:'ardian',group:'dossiers',chapter:0,title:['아르디안 연합','Ardian Union'],tag:['세력 · 플레이어 소속','FACTION · YOUR ALLEGIANCE'],body:{ko:['아르디안인은 지구 인류의 후예다. 에너지 고갈과 환경오염 위기를 해결하기 위해 여러 국가와 군사 세력이 연합을 구성했다.','연합은 행성 정복으로 자원을 확보하고 지구를 재건하려 한다. 원정의 필요성에는 강한 확신을 보이지만, 같은 아르디안인인 세라크 연맹과의 내전으로 큰 대가를 치르고 있다.'],en:['The Ardians descend from humanity on Earth. Their Union joins nations and military forces to address energy depletion and pollution.','It seeks resources through planetary conquest, while fighting a civil war against fellow Ardians of the Serak League.']}},
 {id:'serak',group:'dossiers',chapter:0,title:['세라크 연맹','Serak League'],tag:['세력 · 아르디안 반대 진영','FACTION · ARDIAN OPPOSITION'],body:{ko:['행성 정복 계획에 반대하는 아르디안인들이 결성한 연맹. 지구를 황폐하게 만든 방식이 다른 행성에서도 반복될 것을 우려한다.','출항 저지에서 시작한 대립은 원정 함대 추격으로 이어졌다. 연합과 같은 기계 문명의 기술을 사용하지만, 그 힘을 어디에 써야 하는지에 대한 입장은 다르다.'],en:['The League unites Ardians opposed to planetary conquest. It fears repeating Earth’s destruction on other worlds.','Its attempts to stop the expedition become a pursuit across space. The two sides share a technological heritage, but disagree about its purpose.']}},
 {id:'velcarion',group:'dossiers',chapter:4,after:'4-1',title:['벨카리온','Velcarion'],tag:['종족 · 심연의 수호자','SPECIES · ABYSS GUARDIANS'],image:'v_crawler',body:{ko:['고대부터 존재한 기계 생명체 종족. 육체의 한계를 버리고 의식을 기계 코어에 이식했다. 푸른 에너지 벨카코어에서 그 이름이 유래했다.','프라즈마 심연에서 벨카코어를 수호하며 연합과 충돌했다. 일반 포획 신호를 거부한다. 벨카코어 유물로 접속 기술을 해금하면 포획할 수 있다.'],en:['An ancient mechanical species whose consciousness resides in machine cores. Its name derives from the blue energy of the Velca Core.','They defend Prisma’s abyss and reject standard capture signals. The special Velca Core relic unlocks the required access protocol.']}},
 {id:'astra',group:'dossiers',chapter:4,after:'4-9',title:['아스트라 세이버','Astra Saber'],tag:['영웅 · 벨카리온','HERO · VELCARION'],body:{ko:['벨카리온의 최고 영웅이자 최강의 전력. 프라즈마 대전투에서 연합이 승기를 잡자 모습을 드러냈다.','압도적인 전투력과 지휘 능력으로 무너진 전선을 되살렸고, 연합 원정군을 전멸 위기로 몰아넣었다.'],en:['The Velcarion’s greatest hero and strongest combatant. He enters the battle as the Union approaches victory.','His power and command restore the defensive line and bring the expedition to the brink of annihilation.']}},
 {id:'nemesis',group:'dossiers',chapter:4,after:'4-10',title:['네메시스 베일','Nemesis Veil'],tag:['영웅 · 네겐트리스','HERO · NEGENTRIS'],quote:['너희의 존재를 내가 알려주지.','I will make your existence known.'],body:{ko:['반물질 세계에서 왔다고 밝힌 네겐트리스 종족의 영웅. 갈라진 시공간을 통해 프라즈마 전장에 나타났다.','아스트라 세이버를 제압해 연합을 구했고, 벨카코어 확보의 결정적인 계기를 만들었다. 연합은 그를 구원자로 받아들였다.','자신의 출신과 벨카코어 운용 지식을 제외하면 알려진 정보가 적다. 첫 교신의 정확한 의미와 개입 목적은 확인되지 않았다.'],en:['A Negentris hero who claims to originate from an antimatter world. He reaches Prisma through a tear in spacetime.','He defeats Astra Saber, saves the Union and enables recovery of the Velca Core. Command welcomes him as a savior.','His knowledge is considerable, but his purpose and the meaning of his first message remain unverified.']}}
];
const STORY_DISPATCHES=[
 {at:'1-1',speaker:['연합 작전사령부','UNION COMMAND'],text:['지휘관, 출항로를 확보하라. 포획한 기체로 편대를 보충한다.','Commander, secure the departure route. Reinforce your squad with captured machines.']},
 {at:'1-6',speaker:['함대 통신','FLEET COMMS'],text:['지구 이탈 완료. 세라크 추격대를 뚫고 세레스로 향한다.','Departure confirmed. Break through Serak pursuit and proceed to Ceres.']},
 {at:'2-1',speaker:['탐사대','SURVEY TEAM'],text:['세레스 채굴 구역에 진입한다. 탐사대의 조사 경로를 확보해 달라.','Entering the Ceres mining zone. Secure a route for the survey teams.']},
 {at:'2-6',speaker:['탐사대','SURVEY TEAM'],text:['광맥은 비어 있다. 더 깊은 곳에서 정체불명의 신호가 잡힌다.','The veins are empty. An unidentified signal is coming from deeper underground.']},
 {at:'3-1',speaker:['연합 기밀 교신','UNION SECURE CHANNEL'],text:['진짜 목적지는 프라즈마다. 세라크가 이그니스의 거짓 좌표를 물었다.','Prisma is our real destination. Serak has taken the false coordinates on Ignis.']},
 {at:'3-6',speaker:['연합 기밀 교신','UNION SECURE CHANNEL'],text:['세라크 주력 진입 확인. 중계망을 장악해 퇴로를 차단하라.','Serak’s main force has committed. Seize the relays and seal their exit.']},
 {at:'4-1',speaker:['함대 통신','FLEET COMMS'],text:['심연 좌표에 도착했다. 벨카코어 반응 확인—주변 기계들이 깨어난다.','Abyss coordinates reached. Velca Core confirmed—the surrounding machines are waking.']},
 {at:'4-6',speaker:['연합 작전사령부','UNION COMMAND'],text:['상층부 확보. 회수 장치를 지켜라. 벨카코어 확보가 눈앞이다.','Upper levels secured. Defend the recovery site. The Velca Core is almost ours.']},
 {at:'4-10',speaker:['함대 긴급 교신','FLEET EMERGENCY'],text:['아스트라 세이버가 방어선을 돌파했다! 세라크까지 퇴로를 막고 있다.','Astra Saber has broken our defenses! Serak is blocking the escape route.']}
];

const STORY_CLEAR_LINES={
 '1-5':['출항로 확보. 연합 함대가 지구를 떠난다.','Departure route secured. The Union fleet leaves Earth.'],
 '1-10':['세레스 진입 완료. 에너지원 탐사를 시작한다.','Ceres reached. The energy survey begins.'],
 '2-5':['주요 광맥은 고갈되었다. 지하 유적에서 새로운 신호가 감지된다.','The main veins are exhausted. A new signal is detected in the ruins.'],
 '2-10':['벨카코어의 존재 확인. 위치는 프라즈마 행성의 심연이다.','Velca Core confirmed. Its location is the abyss beneath Prisma.'],
 '3-5':['세라크가 거짓 좌표를 추적한다. 이그니스 중계망을 장악한다.','Serak is following the false coordinates. Seize the Ignis relays.'],
 '3-10':['세라크 주력을 이그니스에 묶었다. 프라즈마로 신속 이동한다.','Serak is trapped on Ignis. Proceed swiftly to Prisma.'],
 '4-1':['벨카코어의 수호자와 조우했다. 프라즈마 대전투가 시작되었다.','The Core’s guardians have answered. The battle for Prisma has begun.'],
 '4-5':['연합이 승기를 잡았다. 벨카코어 회수 준비를 진행한다.','The Union is gaining the upper hand. Prepare to recover the Core.'],
 '4-9':['아스트라 세이버가 전세를 뒤집었다. 세라크도 퇴로를 막고 있다.','Astra Saber has turned the battle. Serak blocks the retreat.'],
 '4-10':['네메시스 베일이 아스트라 세이버를 제압했다. 두 적군이 후퇴하고, 연합은 벨카코어를 확보했다.','Nemesis Veil defeats Astra Saber. Both enemies withdraw, and the Union recovers the Velca Core.']
};
const STORY_READER={group:'operations',selected:null,focus:null,wasInert:false};
function storyText(pair){return pair[LANG==='ko'?0:1]||pair[0];}
function storyArchiveState(){
  if(!META.storyArchive||typeof META.storyArchive!=='object'||Array.isArray(META.storyArchive))META.storyArchive={};
  const a=META.storyArchive;
  for(const k of ['read','radioSeen'])if(!a[k]||typeof a[k]!=='object'||Array.isArray(a[k]))a[k]={};
  return a;
}
function storyAllRecords(){return [...STORY_RECORDS,...STORY_DISPATCHES.map(d=>({id:'signal-'+d.at,group:'signals',chapter:+d.at[0],signal:d.at,after:d.at,title:[d.at+' · '+d.speaker[0],d.at+' · '+d.speaker[1]],tag:['교신 기록 · '+d.at,'TRANSMISSION · '+d.at],quote:d.text,body:{ko:['스테이지 '+d.at+'에서 수신한 교신입니다. 전투 중 지나친 내용은 이곳에서 다시 확인할 수 있습니다.'],en:['Received during stage '+d.at+'. Revisit transmissions here whenever you need.']}}))];}
function storyRecordUnlocked(e){
  if(e.core)return ownsVelcaCore();
  if(e.signal&&storyArchiveState().radioSeen[e.signal]===true)return true;
  return !e.after||META.story?.[e.after]?.clear===true;
}
function storyAvailableRecords(){return storyAllRecords().filter(storyRecordUnlocked);}
function storyUnreadCount(){const read=storyArchiveState().read;return storyAvailableRecords().filter(e=>read[e.id]!==true).length;}
function storyCreate(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function storyButton(text,fn,cls=''){const b=storyCreate('button',cls,text);b.type='button';b.onclick=fn;return b;}
function storyArchiveEntry(parent,compact=false){
  const n=storyUnreadCount(),b=storyButton('',()=>openStoryArchive(),compact?'archive-menu-button':'archive-entry');
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 3h12l4 4v14H4zM15 3v5h5M8 12h8M8 16h6"/></svg>';
  const copy=storyCreate('span','archive-entry-copy');copy.append(storyCreate('strong','',storyText(['작전 기록실','Operation archives'])));
  if(!compact)copy.append(storyCreate('small','',storyText(['아르디안 연합 지휘관 · 지나친 교신과 이야기를 다시 읽습니다.','Ardian Union commander · Revisit the story and past transmissions.'])));
  b.append(copy);if(n)b.append(storyCreate('span','archive-new',String(n)));b.setAttribute('aria-label',storyText(['작전 기록실 · 읽지 않은 기록 '+n+'개','Operation archives · '+n+' unread records']));parent.append(b);return b;
}
function storySyncMenu(){
  const m=$('mstage');if(!m)return;m.querySelector('.archive-menu-button')?.remove();storyArchiveEntry(m,true);
}
function storyArchiveClose(){
  const root=$('storyArchive');if(!root||root.hidden)return;
  root.hidden=true;$('wrap').inert=STORY_READER.wasInert;
  if(STORY_READER.focus?.isConnected)STORY_READER.focus.focus({preventScroll:true});
  if(mode==='menu')storySyncMenu();
}
function openStoryArchive(id){
  if(mode==='play')setPaused(true);
  if(!['menu','pause','upgrade','over'].includes(mode))return;
  let root=$('storyArchive');if(!root){root=storyCreate('section');root.id='storyArchive';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','archiveTitle');document.body.append(root);}
  if(root.hidden){STORY_READER.focus=document.activeElement;STORY_READER.wasInert=$('wrap').inert;$('wrap').inert=true;}
  const a=storyArchiveState(),entries=storyAllRecords(),desired=entries.find(e=>e.id===(id||a.lastRead)&&storyRecordUnlocked(e));
  STORY_READER.selected=desired?.id||storyAvailableRecords().find(e=>!a.read[e.id])?.id||'prologue';
  STORY_READER.group=entries.find(e=>e.id===STORY_READER.selected)?.group||'operations';
  root.hidden=false;root.replaceChildren();
  const shell=storyCreate('div','archive-shell'),head=storyCreate('header','archive-header'),heading=storyCreate('div');
  heading.append(storyCreate('small','','ARDIAN UNION / FIELD ARCHIVES'));const title=storyCreate('h2','',storyText(['작전 기록실','Operation archives']));title.id='archiveTitle';heading.append(title,storyCreate('p','',storyText(['당신은 아르디안 연합 원정군의 지휘관입니다.','You are the commander of an Ardian Union expeditionary unit.'])));head.append(heading);
  const close=storyButton(storyText([mode==='pause'?'전투 설정으로':'닫기',mode==='pause'?'Battle settings':'Close']),storyArchiveClose,'archive-close');close.id='archiveClose';head.append(close);shell.append(head);
  const tabs=storyCreate('nav','archive-tabs');tabs.setAttribute('aria-label',storyText(['기록 분류','Record categories']));tabs.id='archiveTabs';shell.append(tabs);
  const layout=storyCreate('div','archive-layout'),list=storyCreate('nav','archive-list');list.id='archiveList';list.setAttribute('aria-label',storyText(['작전 기록 목록','Archive records']));const article=storyCreate('article','archive-article');article.id='archiveArticle';article.tabIndex=-1;layout.append(list,article);shell.append(layout);
  const footer=storyCreate('footer','archive-footer'),toggle=storyCreate('label','archive-toggle'),check=storyCreate('input');check.type='checkbox';check.checked=a.radioEnabled!==false;check.id='archiveRadioToggle';check.onchange=()=>storySetRadio(check.checked);toggle.append(check,storyCreate('span','',storyText(['전투 중 짧은 교신 표시','Show brief combat transmissions'])));footer.append(toggle,storyCreate('small','',storyText(['미해금 기록은 진행 후 열립니다.','Locked records open with Story progress.'])));shell.append(footer);root.append(shell);
  root.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();storyArchiveClose();return;}
    if(e.key==='Tab'){const all=[...root.querySelectorAll('button:not(:disabled),input,a[href]')].filter(x=>x.getClientRects().length),first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){e.preventDefault();first.focus();}}
  };
  storyRenderArchive();close.focus({preventScroll:true});
}
function storyRenderArchive(focusArticle=false){
  const entries=storyAllRecords(),a=storyArchiveState(),tabs=$('archiveTabs'),list=$('archiveList'),article=$('archiveArticle');
  tabs.replaceChildren();
  for(const [group,label]of [['operations',['작전 일지','Operations']],['dossiers',['세력·인물','Factions & people']],['signals',['지난 교신','Transmissions']]]){
    const available=entries.filter(e=>e.group===group&&storyRecordUnlocked(e)),button=storyButton(storyText(label)+' '+available.length,()=>{STORY_READER.group=group;STORY_READER.selected=available.find(e=>!a.read[e.id])?.id||available[0]?.id;storyRenderArchive();});button.setAttribute('aria-pressed',String(STORY_READER.group===group));tabs.append(button);
  }
  const group=entries.filter(e=>e.group===STORY_READER.group);let active=group.find(e=>e.id===STORY_READER.selected&&storyRecordUnlocked(e));
  if(!active){active=group.find(storyRecordUnlocked);STORY_READER.selected=active?.id;}
  if(active){a.read[active.id]=true;a.lastRead=active.id;metaSave();}
  list.replaceChildren();const progress=storyCreate('p','archive-count',storyText(['해금 ','Unlocked '])+entries.filter(storyRecordUnlocked).length+' / '+entries.length);list.append(progress);
  for(const e of group){const unlocked=storyRecordUnlocked(e),b=storyButton('',()=>{if(!storyRecordUnlocked(e))return;STORY_READER.selected=e.id;storyRenderArchive(true);},'archive-record'+(e.id===active?.id?' selected':''));b.dataset.record=e.id;b.disabled=!unlocked;b.setAttribute('aria-current',String(e.id===active?.id));
    b.append(storyCreate('small','',unlocked?storyText(e.tag):storyText(['미해금 기록','SEALED RECORD'])),storyCreate('strong','',unlocked?storyText(e.title):e.core?storyText(['별 120개 달성 후','Earn all 120 stars']):storyText([e.after+' 완료 후', 'Clear '+e.after])));
    if(unlocked&&!a.read[e.id])b.append(storyCreate('span','archive-unread',storyText(['NEW','NEW'])));list.append(b);
  }
  article.replaceChildren();article.scrollTop=0;
  if(!active){article.append(storyCreate('p','archive-empty',storyText(['아직 수신한 교신이 없습니다. 스토리를 진행하면 이곳에 기록됩니다.','No transmissions received yet. Continue the Story to collect them.'])));return;}
  article.append(storyCreate('small','archive-tag',storyText(active.tag)));
  const title=storyCreate('h3','',storyText(active.title));article.append(title);
  const portrait=active.id==='commander'?STORY_COMMANDER_PORTRAIT:ART[active.image];
  if(active.image&&portrait){const img=storyCreate('img','archive-portrait');img.src=portrait;img.alt=active.id==='commander'?storyText(['현재 플레이어 기체 — 파란 장갑과 포획 안테나','Current player unit — blue armor and capture antenna']):'';article.append(img);}
  if(active.quote)article.append(storyCreate('blockquote','',storyText(active.quote)));
  for(const p of active.body[LANG==='ko'?'ko':'en'])article.append(storyCreate('p','',p));
  const available=group.filter(storyRecordUnlocked),i=available.indexOf(active),bottom=storyCreate('div','archive-reading-nav');
  if(i>0)bottom.append(storyButton(storyText(['이전 기록','Previous']),()=>{STORY_READER.selected=available[i-1].id;storyRenderArchive(true);}));
  if(i+1<available.length)bottom.append(storyButton(storyText(['다음 기록','Next']),()=>{STORY_READER.selected=available[i+1].id;storyRenderArchive(true);}));
  article.append(bottom);if(focusArticle)article.focus({preventScroll:true});
  const selected=list.querySelector('.selected');
  if(selected){const item=selected.getBoundingClientRect(),bounds=list.getBoundingClientRect();list.scrollTop+=item.top-bounds.top-(list.clientHeight-item.height)/2;}
}
function storySetRadio(enabled){storyArchiveState().radioEnabled=!!enabled;metaSave();if(!enabled){if(S)S.storyRadio=null;$('storyRadio')?.setAttribute('hidden','');}}
function storyOnStart(){
  storyArchiveClose();$('storyRadio')?.setAttribute('hidden','');S.storyReport=null;S.storyRadio=null;
  if(!S.story)return;const d=STORY_DISPATCHES.find(d=>d.at===S.story.id),a=storyArchiveState();
  if(d&&a.radioEnabled!==false&&!a.radioSeen[d.at]&&!META.story?.[d.at]?.clear)S.storyRadio={at:d.at,delay:1200,left:6500,shown:false};
}
function storyUpdate(dt){
  let box=$('storyRadio');if(!S?.storyRadio||mode!=='play'||S.tutorial||storyArchiveState().radioEnabled===false){if(box)box.hidden=true;return;}
  const radio=S.storyRadio;if(radio.delay>0){radio.delay-=dt;return;}
  if(radio.left<=0){if(box)box.hidden=true;S.storyRadio=null;return;}
  if(!box){box=storyCreate('aside');box.id='storyRadio';box.setAttribute('role','status');box.setAttribute('aria-live','polite');$('stage').append(box);}
  if(!radio.shown){const d=STORY_DISPATCHES.find(d=>d.at===radio.at);box.replaceChildren(storyCreate('small','',storyText(d.speaker)),storyCreate('p','',storyText(d.text)));radio.shown=true;storyArchiveState().radioSeen[radio.at]=true;metaSave();}
  box.hidden=false;radio.left=Math.max(0,radio.left-dt);
}
function storyBeforeClear(){if(S?.story)S.storyRecordBefore=storyAvailableRecords().map(e=>e.id);}
function storyAfterClear(){
  if(!S?.story)return;const previous=S.storyRecordBefore||[],newRecords=storyAvailableRecords().filter(e=>!previous.includes(e.id));
  S.storyReport=newRecords.length?{ids:newRecords.map(e=>e.id),line:STORY_CLEAR_LINES[S.story.id]||[storyText(newRecords[0].title),storyText(newRecords[0].title)]}:null;
}
function storyClearCard(parent){
  const report=S?.storyReport;if(!report)return;
  const b=storyButton('',()=>openStoryArchive(report.ids.find(id=>!id.startsWith('signal-'))||report.ids[0]),'archive-clear-card');
  b.append(storyCreate('small','',storyText(['새 작전 기록 '+report.ids.length+'건','NEW RECORDS · '+report.ids.length])),storyCreate('span','',storyText(report.line)),storyCreate('strong','',storyText(['기록실에서 이어 읽기 →','Continue reading in archives →'])));parent.append(b);
}
function storyPauseControls(){
  const root=$('pauseSettings');if(!root)return;const row=storyCreate('label','battle-setting');row.append(storyCreate('span','',storyText(['짧은 교신','Brief transmissions'])));
  const b=storyButton(storyText(storyArchiveState().radioEnabled!==false?['켜짐','On']:['꺼짐','Off']),()=>{storySetRadio(storyArchiveState().radioEnabled===false);b.textContent=storyText(storyArchiveState().radioEnabled!==false?['켜짐','On']:['꺼짐','Off']);b.setAttribute('aria-pressed',String(storyArchiveState().radioEnabled!==false));});b.id='pauseStoryRadio';b.setAttribute('aria-pressed',String(storyArchiveState().radioEnabled!==false));row.append(b);root.append(row);
  const archive=storyButton(storyText(['작전 기록실','Operation archives']),()=>openStoryArchive());archive.id='pauseArchive';root.append(archive);
}

function storyUnlocked(i){ return i===0 || (META.story[STORY[i-1].id]||{}).clear; }

/* 도감 — 브라우저에 저장됩니다 */
const META={legends:{}, relics:{}, units:{}, credits:0, astranium:0, best:0, story:{},
             lang:CG.locale, tutorialDone:false, volMus:0.40, volSfx:0.85, hideObj:false,
             /* 기록실용 누적 통계 */
             bestStage:0, bestStoryStage:'-', totalKills:0, totalRuns:0,
             totalCaptured:0, totalLegendCaught:0, playMs:0};

/* ======================== 다국어 ========================================
   T('키') 로 현재 언어의 문구를 가져옵니다. 없으면 한국어로 대체합니다. */
const LANGS={ko:'한국어',en:'English',ja:'日本語',zh:'中文'};
let LANG=CG.locale;
const STR={
 ko:{commander:'지휘관',infinity:'인피니티 스테이지',storyD:'본편을 플레이하며 전투와 스토리를 경험하세요.',infinityD:'끝없이 이어지는 전장에서 최고 기록에 도전하세요.',adSpace:'광고 문의 · 현재 스폰서 없음',chapter:n=>`${n}장`,recovered:'회수!',summoned:'소환!',swapped:'교대',retired:'퇴역',trainUnit:'훈련 포획 유닛',pull10:n=>`10회 · 아스트라늄 ${n} 소모`,legendW:'레전드',buyAst:'아스트라늄 구매',buyAstD:'금액이 클수록 보너스가 커집니다.',exCred:'크레딧 교환',exCredD:'아스트라늄을 크레딧으로 바꿉니다. 많이 바꿀수록 유리합니다.',testGrant:'(테스트 지급 · 결제 미연동)',shop:'상점',unit:'유닛',relic:'유물',set:'설정',story:'스토리 스테이지',close:'닫기',
  cred:'크레딧',ast:'아스트라늄',best:'최고 기록',
  normalUnit:'일반 유닛 · 흡수 시 적용',legendUnit:'레전드 유닛 · 소환 시 적용',
  unitSummon:'유닛 소환',relicSummon:'유물 소환',
  unitSummonD:'일반 유닛 카드를 1장 얻습니다. 강화하면 그 유닛을 흡수했을 때만 강해집니다.',
  relicSummonD:'유물 1개를 무작위로 획득합니다. 이미 가진 유물이면 카드가 쌓입니다.',
  costPull:n=>`아스트라늄 ${n} 소모 · 소환`,notEnough:'아스트라늄이 부족합니다.',
  relicNote:'보유한 유물은 <b>항상</b> 효과가 적용됩니다. 중복으로 뽑으면 카드가 쌓여 단계가 올라갑니다.',
  storyNote:'임무 1개당 아스트라늄 2, 첫 클리어에 3을 줍니다.<br>임무 3개를 모두 달성하면 그 지역의 레전드 카드를 1장 받습니다.',
  legendNote:(a)=>`레전드를 흡수하고 그 스테이지를 클리어하면 카드를 얻습니다.<br>카드 누적 ${a}장에서 단계가 오르고, 단계마다 체력·공격력이 22%씩 상승합니다.`,
  sound:'사운드',on:'켜짐',off:'꺼짐',orient:'화면 방향',lang:'언어',
  oAuto:'자동 (기기 방향 따름)',oPort:'세로 고정',oLand:'가로 고정',
  ownLegend:'보유 레전드',resetAll:'모든 기록 초기화',reset:'초기화',
  resetAsk:'레전드 도감과 재화가 모두 사라집니다. 계속할까요?',
  clear:'CLEAR',pickUp:'강화 선택',mission:'임무',captured:'포획 성공',
  cards:n=>`카드 ${n}장`,lvUp:(a,b)=>`Lv${a}→${b}`,allMission:n=>`임무 전체 달성 — ${n} 카드 1장`,
  adMore:'광고 보고 하나 더 받기',adReroll:'광고 보고 다시 뽑기',adSub:'보상형 광고 1회 (SDK 미연동)',
  over:'격추됨',retry:'다시 시작',toMenu:'메인으로',
  reachedStage:'도달 스테이지',score:'점수',killed:'격추',absorbed:'흡수',survived:'생존',
  reviveAd:'광고 보고 부활하기',reviveSub:'보상형 광고 자리 · 판당 1회',
  lostLegend:n=>`미확정 레전드 ${n}종 소멸`,
  hp:'체력',squad:'편대',atk:'화력',rate:'연사',ways:'탄환',spd:'속도',
  sweep:'적 소탕',base:'기지',turret:'포탑',warnBase:'적 기지 출현 — 레이더를 확인하십시오',
  warnLegend:n=>`레전드 유닛 출현 — ${n}`,stageUp:'스테이지 강화',gotItems:'획득 아이템',
  none:'—  —  —',locked:'???',notOwned:'아직 포획하지 못했습니다.',maxLv:'최대 단계',
  toNext:n=>`다음 단계까지 ${n}장`,earthF:'지구',marsF:'화성',objSweep:(a,b)=>`적 소탕 <b>${a} / ${b}</b>`,objBase:n=>`적 기지 포탑 <b>${n} / 4</b> · 레이더 화살표를 따라가세요`,tutMove:'이동해 보세요. 주포는 가까운 적을 자동으로 조준해 사격합니다.',tutCapture:'노란색 유닛은 포획 가능한 중립 유닛입니다. 공격으로는 죽지 않으니 흡수빔을 끝까지 유지해 내 편으로 만들어 보세요.',tutItem:'전투 중 떨어지는 아이템을 먹어보세요. 초록 아이템 쪽으로 이동하면 자동으로 끌려옵니다.',tutFight:'튜토리얼 완료! 이제 <b>적군을 물리쳐 봅시다.</b> 적을 소탕하면 기지가 출현합니다.',basicShop:'Basic Launch 테스트',basicShopD:'현금 결제와 보상형 광고는 심사용 테스트 빌드에서 비활성화되어 있습니다.',pause:'일시정지',resume:'계속하기'},
 en:{commander:'Commander',infinity:'Infinity Stage',storyD:'Play the campaign and follow the story.',infinityD:'Endless battlefield — chase your best score.',adSpace:'AD SPACE · NO SPONSOR YET',chapter:n=>`CH.${n}`,recovered:'RECOVERED!',summoned:'SUMMONED!',swapped:'swapped',retired:'retired',trainUnit:'TRAINING UNIT',pull10:n=>`x10 · ${n} Astranium`,legendW:'Legend',buyAst:'Buy Astranium',buyAstD:'Larger packs give bigger bonuses.',exCred:'Exchange Credits',exCredD:'Convert Astranium into Credits. Bigger trades give better rates.',testGrant:'(test grant · payments not wired)',shop:'Shop',unit:'Units',relic:'Relics',set:'Settings',story:'Story Stages',close:'Close',
  cred:'Credits',ast:'Astranium',best:'Best',
  normalUnit:'Standard Units · applies when captured',legendUnit:'Legend Units · applies when summoned',
  unitSummon:'Unit Summon',relicSummon:'Relic Summon',
  unitSummonD:'Gain one standard unit card. Upgrades apply only when you capture that unit.',
  relicSummonD:'Gain one random relic. Duplicates become cards.',
  costPull:n=>`Spend ${n} Astranium · Summon`,notEnough:'Not enough Astranium.',
  relicNote:'Owned relics are <b>always</b> active. Duplicates stack into cards and raise the tier.',
  storyNote:'Each mission grants 2 Astranium, first clear grants 3.<br>Complete all 3 missions to earn a Legend card from that region.',
  legendNote:(a)=>`Capture a Legend and clear that stage to earn its card.<br>Tiers unlock at ${a} cards; each tier adds 22% HP and damage.`,
  sound:'Sound',on:'On',off:'Off',orient:'Screen Orientation',lang:'Language',
  oAuto:'Auto (follow device)',oPort:'Portrait lock',oLand:'Landscape lock',
  ownLegend:'Legends owned',resetAll:'Reset all progress',reset:'Reset',
  resetAsk:'Your Legend codex and currency will be erased. Continue?',
  clear:'CLEAR',pickUp:'Choose an Upgrade',mission:'Missions',captured:'CAPTURED',
  cards:n=>`${n} cards`,lvUp:(a,b)=>`Lv${a}→${b}`,allMission:n=>`All missions cleared — 1 ${n} card`,
  adMore:'Watch an ad for one more',adReroll:'Watch an ad to reroll',adSub:'Rewarded ad (SDK not wired)',
  over:'SHOT DOWN',retry:'Retry',toMenu:'Main Menu',
  reachedStage:'Stage reached',score:'Score',killed:'Kills',absorbed:'Captured',survived:'Survived',
  reviveAd:'Watch an ad to revive',reviveSub:'Rewarded ad · once per run',
  lostLegend:n=>`${n} unconfirmed Legend(s) lost`,
  hp:'HP',squad:'Squad',atk:'ATK',rate:'RATE',ways:'WAYS',spd:'SPD',
  sweep:'Sweep',base:'Base',turret:'Turrets',warnBase:'ENEMY BASE DETECTED — CHECK RADAR',
  warnLegend:n=>`LEGEND UNIT SIGHTED — ${n}`,stageUp:'Stage Upgrades',gotItems:'Items Found',
  none:'—  —  —',locked:'???',notOwned:'Not captured yet.',maxLv:'Max tier',
  toNext:n=>`${n} more cards to next tier`,earthF:'Earth',marsF:'Mars',objSweep:(a,b)=>`Sweep enemies <b>${a} / ${b}</b>`,objBase:n=>`Enemy base turrets <b>${n} / 4</b> · follow the radar arrow`,tutMove:'Move around. Your main cannon automatically targets nearby enemies.',tutCapture:'Yellow units can be captured. This training unit cannot be destroyed, so hold the capture beam on it until it joins your squad.',tutItem:'Pick up the green item. Nearby items are pulled toward your unit automatically.',tutFight:'Training complete! <b>Defeat the enemy forces.</b> Clear the sweep objective to reveal the enemy base.',basicShop:'Basic Launch Test',basicShopD:'Real-money purchases and rewarded ads are disabled in this review build.',pause:'Paused',resume:'Resume'},
 ja:{commander:'指揮官',infinity:'インフィニティステージ',storyD:'本編をプレイして戦闘とストーリーを体験しよう。',infinityD:'終わりなき戦場で最高記録に挑戦しよう。',adSpace:'広告枠 · スポンサー募集中',chapter:n=>`第${n}章`,recovered:'回収!',summoned:'召喚!',swapped:'交代',retired:'退役',trainUnit:'訓練用ユニット',pull10:n=>`10連 · アストラニウム ${n}`,legendW:'レジェンド',buyAst:'アストラニウム購入',buyAstD:'金額が大きいほどボーナスが増えます。',exCred:'クレジット交換',exCredD:'アストラニウムをクレジットに交換します。多いほど有利です。',testGrant:'(テスト付与 · 決済未接続)',shop:'ショップ',unit:'ユニット',relic:'遺物',set:'設定',story:'ストーリーステージ',close:'閉じる',
  cred:'クレジット',ast:'アストラニウム',best:'最高記録',
  normalUnit:'通常ユニット · 吸収時に適用',legendUnit:'レジェンド · 召喚時に適用',
  unitSummon:'ユニット召喚',relicSummon:'遺物召喚',
  unitSummonD:'通常ユニットのカードを1枚獲得します。強化はそのユニットを吸収した時のみ適用されます。',
  relicSummonD:'遺物を1つランダムで獲得します。所持済みならカードが貯まります。',
  costPull:n=>`アストラニウム ${n} 消費 · 召喚`,notEnough:'アストラニウムが足りません。',
  relicNote:'所持している遺物は<b>常に</b>効果が適用されます。重複はカードとして貯まり段階が上がります。',
  storyNote:'任務1つにつきアストラニウム2、初回クリアで3を獲得。<br>任務を3つ全て達成するとその地域のレジェンドカードを1枚獲得します。',
  legendNote:(a)=>`レジェンドを吸収しそのステージをクリアするとカードを獲得します。<br>累計${a}枚で段階が上がり、段階ごとに体力・攻撃力が22%上昇します。`,
  sound:'サウンド',on:'オン',off:'オフ',orient:'画面の向き',lang:'言語',
  oAuto:'自動 (端末に従う)',oPort:'縦固定',oLand:'横固定',
  ownLegend:'所持レジェンド',resetAll:'全データ初期化',reset:'初期化',
  resetAsk:'レジェンド図鑑と通貨が全て消えます。続けますか？',
  clear:'CLEAR',pickUp:'強化を選択',mission:'任務',captured:'捕獲成功',
  cards:n=>`カード${n}枚`,lvUp:(a,b)=>`Lv${a}→${b}`,allMission:n=>`任務全達成 — ${n} カード1枚`,
  adMore:'広告を見てもう1つ',adReroll:'広告を見て引き直す',adSub:'リワード広告 (SDK未接続)',
  over:'撃墜',retry:'再挑戦',toMenu:'メインへ',
  reachedStage:'到達ステージ',score:'スコア',killed:'撃破',absorbed:'吸収',survived:'生存',
  reviveAd:'広告を見て復活',reviveSub:'リワード広告 · 1回のみ',
  lostLegend:n=>`未確定レジェンド ${n}種 消滅`,
  hp:'体力',squad:'編隊',atk:'火力',rate:'連射',ways:'弾数',spd:'速度',
  sweep:'掃討',base:'基地',turret:'砲台',warnBase:'敵基地出現 — レーダーを確認せよ',
  warnLegend:n=>`レジェンド出現 — ${n}`,stageUp:'ステージ強化',gotItems:'獲得アイテム',
  none:'—  —  —',locked:'???',notOwned:'まだ捕獲していません。',maxLv:'最大段階',
  toNext:n=>`次の段階まで${n}枚`,earthF:'地球',marsF:'火星'},
 zh:{commander:'指挥官',infinity:'无尽关卡',storyD:'游玩主线，体验战斗与剧情。',infinityD:'在无尽战场上挑战最高纪录。',adSpace:'广告位 · 暂无赞助商',chapter:n=>`第${n}章`,recovered:'回收!',summoned:'召唤!',swapped:'替换',retired:'退役',trainUnit:'训练用单位',pull10:n=>`十连 · ${n} 星辰素`,legendW:'传说',buyAst:'购买星辰素',buyAstD:'金额越大赠送越多。',exCred:'兑换信用点',exCredD:'将星辰素兑换为信用点。兑换越多越划算。',testGrant:'(测试发放 · 未接入支付)',shop:'商店',unit:'单位',relic:'遗物',set:'设置',story:'剧情关卡',close:'关闭',
  cred:'信用点',ast:'星辰素',best:'最高纪录',
  normalUnit:'普通单位 · 吸收时生效',legendUnit:'传说单位 · 召唤时生效',
  unitSummon:'单位召唤',relicSummon:'遗物召唤',
  unitSummonD:'获得一张普通单位卡。强化仅在吸收该单位时生效。',
  relicSummonD:'随机获得一件遗物。重复则累积为卡片。',
  costPull:n=>`消耗 ${n} 星辰素 · 召唤`,notEnough:'星辰素不足。',
  relicNote:'已拥有的遗物<b>始终</b>生效。重复抽取会累积卡片并提升等级。',
  storyNote:'每完成一个任务获得2星辰素，首次通关获得3。<br>完成全部3个任务可获得该区域的传说卡片1张。',
  legendNote:(a)=>`吸收传说单位并通关该关卡即可获得卡片。<br>累计${a}张提升等级，每级提升22%生命与攻击。`,
  sound:'音效',on:'开',off:'关',orient:'屏幕方向',lang:'语言',
  oAuto:'自动 (跟随设备)',oPort:'锁定竖屏',oLand:'锁定横屏',
  ownLegend:'已拥有传说',resetAll:'重置全部进度',reset:'重置',
  resetAsk:'传说图鉴与货币将全部清除。是否继续？',
  clear:'CLEAR',pickUp:'选择强化',mission:'任务',captured:'捕获成功',
  cards:n=>`卡片${n}张`,lvUp:(a,b)=>`Lv${a}→${b}`,allMission:n=>`任务全达成 — ${n} 卡片1张`,
  adMore:'看广告再拿一个',adReroll:'看广告重抽',adSub:'激励广告 (SDK未接入)',
  over:'被击落',retry:'重新开始',toMenu:'返回主页',
  reachedStage:'到达关卡',score:'分数',killed:'击杀',absorbed:'吸收',survived:'存活',
  reviveAd:'看广告复活',reviveSub:'激励广告 · 每局一次',
  lostLegend:n=>`未确认传说 ${n} 种消失`,
  hp:'生命',squad:'编队',atk:'火力',rate:'射速',ways:'弹数',spd:'速度',
  sweep:'清剿',base:'基地',turret:'炮塔',warnBase:'发现敌方基地 — 请查看雷达',
  warnLegend:n=>`传说单位出现 — ${n}`,stageUp:'关卡强化',gotItems:'获得道具',
  none:'—  —  —',locked:'???',notOwned:'尚未捕获。',maxLv:'最高等级',
  toNext:n=>`距下一级还需${n}张`,earthF:'地球',marsF:'火星'},
};
/* ===================== v21 언어 보강 =====================================
   기존 STR 리터럴은 그대로 두고 뒤에서 병합합니다.
   ja / zh 에 비어 있던 키를 모두 채웠고, v21 신규 UI 문구를 추가했습니다.
   영어를 기준 언어로 삼아 Web 심사에 대응합니다. */
const STR_V21={
 ko:{
  gradeC:'커먼',gradeR:'레어',gradeE:'엘리트',gradeP:'에픽',gradeL:'레전더리',
  rarN:'일반',rarR:'희귀',rarSR:'영웅',rarSSR:'전설',
  tier:'단계',ownedCards:'보유 카드',needCards:n=>`필요 카드 ${n}장`,
  upBtn:'업그레이드',upTo:(a,b)=>`Lv${a} → Lv${b}`,maxTier:'최대 단계 도달',
  lackCard:'카드가 부족합니다',lackCred:'크레딧이 부족합니다',
  upDone:'업그레이드 완료',notYet:'아직 획득하지 않았습니다',
  atkStyle:'공격 방식',statHp:'체력',statSpd:'이동',statFire:'연사',statDmg:'피해',statRange:'사거리',
  tAir:'공중 유닛',tGround:'지상 유닛',tMulti:n=>`${n}발 동시 발사`,tHoming:'유도탄',
  tSplash:'폭발 범위 피해',tFixed:'고정 포대 · 이동 불가',tElite:'정예 · 흡수 성공률 우대',
  aiBasic:'플레이어에게 접근하며 사격합니다',
  aiStrafe:'측면으로 선회하며 스쳐 지나가듯 사격합니다',
  aiBurst:'멈춰 서서 3점사를 퍼붓습니다',
  aiCharge:'거리를 좁혀 돌진한 뒤 근접에서 난사합니다',
  aiSalvo:'멀리서 미사일을 일제히 쏟아붓습니다',
  aiRove:'전장을 넓게 배회하며 기습합니다',
  aiRockets:'느리지만 폭발 로켓을 연속으로 날립니다',
  aiTurret:'움직이지 않고 사거리 안의 모든 것을 사격합니다',
  aiRage:'체력이 낮아질수록 공격이 빨라집니다',
  aiHover:'상공에 머물다 폭격을 떨어뜨립니다',
  aiSiege:'전진하며 공성 포격을 반복합니다',
  wGatling:'개틀링 연사',wMissile:'미사일',wSide:'좌우 산탄',wRear:'후방 장거리탄',
  wSeeker:'추적 미사일',wLaser:'관통 레이저',wRadial:'전방위 사격',
  wChain:'연쇄 레이저',wSpin:'회전 레이저',
  wLine:(a,b,c)=>`${a} · 피해 ${b} · ${c}초 간격`,
  storyStart:'출격',missionList:'스테이지 임무',
  missionOk:'달성 완료',missionNo:'미달성',
  storyCum:'임무는 누적 판정입니다. 남은 임무만 나중에 따로 달성해도 됩니다.',
  profile:'지휘관 정보',pName:'호출부호',pBest:'최고 기록',pLegend:'보유 레전드',pRelic:'보유 유물',
  pAccount:'계정 연동은 추후 지원됩니다.',
  cRes:'보유 자원',cGoShop:'상점 열기',
  detailHint:'항목을 누르면 상세 정보가 열립니다',
  replayTut:'튜토리얼 다시 보기',replayTutV:'다시 보기',replayDone:'다음 인피니티 출격에서 실행됩니다',
  gradeOdds:'등급별 확률',
  unitSummonD2:'등급별 확률로 유닛 카드를 얻습니다. 카드는 크레딧과 함께 써야 단계가 오릅니다.',
  relicSummonD2:'유물 카드를 1장 얻습니다. 카드와 크레딧으로 단계를 올리세요.',
  objSweep:(a,b)=>`적 소탕 <b>${a} / ${b}</b>`,
  objBase:n=>`적 기지 포탑 <b>${n} / 4</b> · 레이더 화살표를 따라가세요`,
  upDmgN:'화력 증폭',upDmgD:'공격력 +1',
  upRateN:'장전속도 증가',upRateD:'발사 간격 10% 감소',
  upMoveN:'엔진 강화',upMoveD:'이동속도 8% 증가',
  upArmorN:'장갑 강화',upArmorD:'받는 피해 8% 감소',
  upCapN:'흡수 숙련',upCapD:'흡수 성공률 +5%p (최대 80%)',
  upBeamN:'빔 업그레이드',upBeamD:'흡수 판정 12% 단축 · 범위 증가',
  upPowerN:'예비 동력로',upPowerD:(a,b)=>`최대 체력 +${a} · 초당 ${b} 회복`,
  upShldN:'상시 차폐',upShldD:'매 스테이지 시작 시 보호막 1개',
  upSquadN:'편대 확장',upSquadD:'편대 정원 +1 (영구)',
  upScoutN:'정찰병 지급',upScoutD:'스테이지 시작 시 아군 1기 배치',
  iPWR:'공격력 증가',iRATE:'공격속도 증가',iWAY:'탄환 수 증가',iSPD:'이동속도 증가',
  iSHLD:'보호막',iHEAL:'체력 회복',iSLOT:'편대 정원 +1',iAPWR:'편대 화력 +1',
  iFREEZE:'아이스 미사일',iPOISON:'맹독 미사일',iFIRE:'화염 미사일',iSUMMON:'레전드 소환',
  eFREEZE:'냉동',ePOISON:'독',eFIRE:'화염',
  rCore:v=>`공격력 +${v}`,rArmor:v=>`받는 피해 -${v}%`,rCool:v=>`공격속도 +${v}%`,
  rThrust:v=>`이동속도 +${v}%`,rScan:v=>`아이템 드롭률 +${v}%p`,rTow:v=>`흡수 성공률 +${v}%p`,
  rNano:v=>`초당 체력 회복 +${v}`,rLink:v=>`아군 공격력 +${v}`,rBay:v=>`편대 정원 +${v}`,
  rMag:v=>`탄환 수 +${v}`,
  mTime:n=>`${n}초 안에 클리어`,mNohit:'한 번도 피격당하지 않고 클리어',
  mNocap:'흡수 없이 클리어',mKill:n=>`적 ${n}기 이상 처치`,
  mItem:n=>`아이템 ${n}개 이상 획득`,mSquad:n=>`편대 ${n}기 이상 유지한 채 클리어`,
  mNosum:'레전드 소환 없이 클리어',mNoheal:'체력 회복 아이템 없이 클리어',
  rotateMsg:'화면을 세로로 돌려주세요',loadTitle:'전장 전개 중',loadSub:'모바일 최적화 리소스를 불러오는 중입니다',
  startBtn:'출격',ctrlTouch:'화면 <b>왼쪽</b>을 끌면 이동, <b>오른쪽</b>을 끌면 그 방향으로 흡수빔이 나갑니다.<br>두 손가락을 동시에 써도 되고, 사격은 가장 가까운 적을 자동 조준합니다.',
  ctrlKey:'<span class="keys">W</span><span class="keys">A</span><span class="keys">S</span><span class="keys">D</span> 이동 · 사격은 자동 조준<br><span class="keys">마우스</span>로 흡수 방향을 조준하고 <span class="keys">SPACE</span> 또는 클릭으로 발동',
  hintTouch:'왼쪽=이동 · 오른쪽=흡수 조준',hintKey:'WASD 이동 · 마우스 조준 · SPACE 흡수 · 위로 올라가 적 기지를 찾으세요',
  tutMove:'이동해 보세요. 주포는 가까운 적을 자동으로 조준해 사격합니다.',
  tutCapture:'노란색 유닛은 포획 가능한 중립 유닛입니다. 공격으로는 죽지 않으니 흡수빔을 끝까지 유지해 내 편으로 만들어 보세요.',
  tutItem:'전투 중 떨어지는 아이템을 먹어보세요. 초록 아이템 쪽으로 이동하면 자동으로 끌려옵니다.',
  tutFight:'튜토리얼 완료! 이제 <b>적군을 물리쳐 봅시다.</b> 적을 소탕하면 기지가 출현합니다.',
  tutCapMsg:'이 유닛을 포획하세요',tutItemMsg:'아이템을 획득하세요',
  tov3T:'아이템 & 전투 빌드',
  tov3L:'좋습니다. 전투 중 적이 떨어뜨리는 아이템을 획득하면 그 스테이지 동안 전투 능력이 즉시 강화됩니다.',
  tov3A:"획득한 아이템은 화면 <b>우측 상단의 '획득 아이템'</b> 영역에 아이콘으로 표시됩니다. 지금 어떤 효과를 가지고 있는지 전투 중에도 확인할 수 있습니다.",
  tov3B:'필드에서 획득한 아이템 효과는 <b>스테이지가 끝나면 초기화</b>됩니다. 매 스테이지 다른 조합을 만들어 보세요.',
  tov3N:'다음 · HUD와 레이더',
  tov4T:'HUD · 레이더 · 레전드',
  tov4L:'전투 화면에는 스테이지를 진행하는 데 필요한 정보가 항상 표시됩니다.',
  tovRadarH:'좌측 상단 · 레이더',
  tovRadarP:'주변의 적, 아이템, 아군과 적 기지의 위치를 표시합니다. 기지가 나타나면 방향 화살표를 따라가세요.',
  tovHudH:'화면 상단 · 체력 / 편대',
  tovHudP:'현재 체력과 일반 아군·레전드 아군의 포획 가능 수를 이곳에서 확인할 수 있습니다.',
  tovSquad:'일반 1/4',tovSquadL:'레전드 0/4',
  tovLegH:'레전드 유닛',
  tovLegP:'전장에는 드물게 강력한 <b>레전드 유닛</b>이 노란색 중립 유닛으로 등장합니다. 발견하면 포획에 도전해 보세요.',
  tov4Tip:'레전드는 <b>포획만 해서는 완전히 획득되지 않습니다.</b> 포획한 뒤 해당 스테이지까지 클리어해야 레전드 카드가 확정됩니다.',
  tov4N:'확인 · 전투 시작',
  basicShop:'Basic Launch 테스트',
  basicShopD:'현금 결제와 보상형 광고는 심사용 테스트 빌드에서 비활성화되어 있습니다.',
  pause:'일시정지',resume:'계속하기',
 },
 en:{
  gradeC:'Common',gradeR:'Rare',gradeE:'Elite',gradeP:'Epic',gradeL:'Legendary',
  rarN:'Common',rarR:'Rare',rarSR:'Heroic',rarSSR:'Legendary',
  tier:'Tier',ownedCards:'Cards held',needCards:n=>`${n} cards required`,
  upBtn:'Upgrade',upTo:(a,b)=>`Lv${a} → Lv${b}`,maxTier:'Max tier reached',
  lackCard:'Not enough cards',lackCred:'Not enough Credits',
  upDone:'Upgrade complete',notYet:'Not obtained yet',
  atkStyle:'Combat behaviour',statHp:'HP',statSpd:'Speed',statFire:'Rate',statDmg:'Damage',statRange:'Range',
  tAir:'Airborne unit',tGround:'Ground unit',tMulti:n=>`Fires ${n} rounds at once`,tHoming:'Homing rounds',
  tSplash:'Splash damage on impact',tFixed:'Fixed emplacement · cannot move',tElite:'Elite · easier to capture',
  aiBasic:'Closes on the player and fires steadily',
  aiStrafe:'Banks sideways and strafes past you',
  aiBurst:'Halts and unloads three-round bursts',
  aiCharge:'Rushes into close range, then fires wildly',
  aiSalvo:'Rains missile salvos from long range',
  aiRove:'Roams wide across the field and ambushes',
  aiRockets:'Slow, but lobs explosive rockets back to back',
  aiTurret:'Never moves; fires on anything in range',
  aiRage:'Attacks faster the lower its health falls',
  aiHover:'Holds altitude, then drops bombs below',
  aiSiege:'Advances while repeating siege bombardment',
  wGatling:'Gatling barrage',wMissile:'Missile',wSide:'Side scatter',wRear:'Rear long-range shot',
  wSeeker:'Homing missiles',wLaser:'Piercing laser',wRadial:'Omnidirectional fire',
  wChain:'Chain laser',wSpin:'Rotating laser',
  wLine:(a,b,c)=>`${a} · ${b} DMG · every ${c}s`,
  storyStart:'Deploy',missionList:'Stage Missions',
  missionOk:'Complete',missionNo:'Incomplete',
  storyCum:'Missions are tracked cumulatively. You can clear the remaining ones on a later run.',
  profile:'Commander Profile',pName:'Callsign',pBest:'Best score',pLegend:'Legends owned',pRelic:'Relics owned',
  pAccount:'Account linking is coming in a future update.',
  cRes:'Resources',cGoShop:'Open Shop',
  detailHint:'Tap any entry for details',
  replayTut:'Replay tutorial',replayTutV:'Replay',replayDone:'Runs on your next Infinity deployment',
  gradeOdds:'Odds by grade',
  unitSummonD2:'Draw a unit card by grade. Cards raise a tier only when spent together with Credits.',
  relicSummonD2:'Draw one relic card. Spend cards and Credits to raise its tier.',
  objSweep:(a,b)=>`Sweep enemies <b>${a} / ${b}</b>`,
  objBase:n=>`Enemy base turrets <b>${n} / 4</b> · follow the radar arrow`,
  upDmgN:'Firepower Boost',upDmgD:'Damage +1',
  upRateN:'Faster Reload',upRateD:'Fire interval -10%',
  upMoveN:'Engine Tuning',upMoveD:'Move speed +8%',
  upArmorN:'Armour Plating',upArmorD:'Damage taken -8%',
  upCapN:'Capture Training',upCapD:'Capture rate +5%p (max 80%)',
  upBeamN:'Beam Upgrade',upBeamD:'Capture time -12% · wider beam',
  upPowerN:'Auxiliary Reactor',upPowerD:(a,b)=>`Max HP +${a} · ${b} HP/s regen`,
  upShldN:'Standing Shield',upShldD:'One shield at the start of every stage',
  upSquadN:'Squad Expansion',upSquadD:'Squad capacity +1 (permanent)',
  upScoutN:'Scout Detachment',upScoutD:'Start each stage with one ally',
  iPWR:'Damage Up',iRATE:'Fire Rate Up',iWAY:'Extra Rounds',iSPD:'Move Speed Up',
  iSHLD:'Shield',iHEAL:'Repair',iSLOT:'Squad Slot +1',iAPWR:'Squad Power +1',
  iFREEZE:'Ice Missile',iPOISON:'Venom Missile',iFIRE:'Fire Missile',iSUMMON:'Legend Summon',
  eFREEZE:'Frozen',ePOISON:'Poison',eFIRE:'Burning',
  rCore:v=>`Damage +${v}`,rArmor:v=>`Damage taken -${v}%`,rCool:v=>`Fire rate +${v}%`,
  rThrust:v=>`Move speed +${v}%`,rScan:v=>`Item drop rate +${v}%p`,rTow:v=>`Capture rate +${v}%p`,
  rNano:v=>`HP regen +${v}/s`,rLink:v=>`Ally damage +${v}`,rBay:v=>`Squad capacity +${v}`,
  rMag:v=>`Rounds per shot +${v}`,
  mTime:n=>`Clear within ${n} seconds`,mNohit:'Clear without taking a single hit',
  mNocap:'Clear without capturing anything',mKill:n=>`Destroy ${n} or more enemies`,
  mItem:n=>`Collect ${n} or more items`,mSquad:n=>`Clear while holding ${n} or more squad units`,
  mNosum:'Clear without summoning a Legend',mNoheal:'Clear without using a repair item',
  rotateMsg:'Please rotate your device to portrait',loadTitle:'Deploying battlefield',loadSub:'Loading mobile-optimised assets',
  startBtn:'Deploy',
  ctrlTouch:'Drag the <b>left</b> half to move, the <b>right</b> half to aim the capture beam.<br>Both work at once, and your cannon auto-targets the nearest enemy.',
  ctrlKey:'<span class="keys">W</span><span class="keys">A</span><span class="keys">S</span><span class="keys">D</span> to move · cannon auto-targets<br>Aim the capture beam with the <span class="keys">mouse</span> and fire it with <span class="keys">SPACE</span> or click',
  hintTouch:'Left = move · Right = aim capture beam',hintKey:'WASD to move · mouse to aim · SPACE to capture · head north to find the enemy base',
  tutMove:'Move around. Your main cannon automatically targets nearby enemies.',
  tutCapture:'Yellow units can be captured. This training unit cannot be destroyed, so hold the capture beam on it until it joins your squad.',
  tutItem:'Pick up the green item. Nearby items are pulled toward your unit automatically.',
  tutFight:'Training complete! <b>Defeat the enemy forces.</b> Clear the sweep objective to reveal the enemy base.',
  tutCapMsg:'CAPTURE THIS UNIT',tutItemMsg:'PICK UP THE ITEM',
  tov3T:'ITEMS & LOADOUT',
  tov3L:'Nice. Items dropped during a stage immediately change your combat abilities.',
  tov3A:'Items you collect appear in the <b>Items Found panel at the upper right</b>, so you can check your current stage build at a glance.',
  tov3B:'Field item effects <b>reset when the stage ends</b>. Build a different combination every stage.',
  tov3N:'NEXT · HUD & RADAR',
  tov4T:'HUD · RADAR · LEGENDS',
  tov4L:'The combat HUD always shows what you need to survive and finish the stage.',
  tovRadarH:'UPPER LEFT · RADAR',
  tovRadarP:'Enemies, items, allies and the enemy base all appear here. When the base shows up, follow the direction marker.',
  tovHudH:'TOP · HP / SQUAD',
  tovHudP:'Check your health and how many standard and Legend units your formation can hold.',
  tovSquad:'SQUAD 1/4',tovSquadL:'LEGEND 0/4',
  tovLegH:'LEGEND UNITS',
  tovLegP:'Rare and powerful <b>Legend units</b> occasionally appear as yellow neutrals. Try to capture one when you spot it.',
  tov4Tip:'A Legend is <b>not secured by capture alone.</b> You must also clear that stage before its card is confirmed.',
  tov4N:'START BATTLE',
  basicShop:'Basic Launch Test',
  basicShopD:'Real-money purchases and rewarded ads are disabled in this review build.',
  pause:'Paused',resume:'Resume',
 },
 ja:{
  gradeC:'コモン',gradeR:'レア',gradeE:'エリート',gradeP:'エピック',gradeL:'レジェンダリー',
  rarN:'ノーマル',rarR:'レア',rarSR:'ヒーロー',rarSSR:'レジェンド',
  tier:'段階',ownedCards:'所持カード',needCards:n=>`必要カード ${n}枚`,
  upBtn:'アップグレード',upTo:(a,b)=>`Lv${a} → Lv${b}`,maxTier:'最大段階に到達',
  lackCard:'カードが足りません',lackCred:'クレジットが足りません',
  upDone:'アップグレード完了',notYet:'まだ入手していません',
  atkStyle:'戦闘スタイル',statHp:'体力',statSpd:'移動',statFire:'連射',statDmg:'威力',statRange:'射程',
  tAir:'航空ユニット',tGround:'地上ユニット',tMulti:n=>`${n}発同時発射`,tHoming:'誘導弾',
  tSplash:'着弾時に範囲ダメージ',tFixed:'固定砲台 · 移動不可',tElite:'精鋭 · 吸収成功率が高い',
  aiBasic:'プレイヤーに接近しながら射撃します',
  aiStrafe:'側面へ旋回しすれ違いざまに射撃します',
  aiBurst:'停止して3点バーストを浴びせます',
  aiCharge:'距離を詰めて突進し至近距離で乱射します',
  aiSalvo:'遠距離からミサイルを一斉に撃ち込みます',
  aiRove:'戦場を広く徘徊し奇襲します',
  aiRockets:'低速ですが爆発ロケットを連射します',
  aiTurret:'移動せず射程内の全てを撃ちます',
  aiRage:'体力が減るほど攻撃が速くなります',
  aiHover:'上空に留まり爆撃を落とします',
  aiSiege:'前進しながら攻城砲撃を繰り返します',
  wGatling:'ガトリング連射',wMissile:'ミサイル',wSide:'左右散弾',wRear:'後方長距離弾',
  wSeeker:'追尾ミサイル',wLaser:'貫通レーザー',wRadial:'全方位射撃',
  wChain:'連鎖レーザー',wSpin:'回転レーザー',
  wLine:(a,b,c)=>`${a} · 威力 ${b} · ${c}秒間隔`,
  storyStart:'出撃',missionList:'ステージ任務',
  missionOk:'達成済み',missionNo:'未達成',
  storyCum:'任務は累積で判定されます。残った任務だけ後から達成しても構いません。',
  profile:'指揮官情報',pName:'コールサイン',pBest:'最高記録',pLegend:'所持レジェンド',pRelic:'所持遺物',
  pAccount:'アカウント連携は今後対応予定です。',
  cRes:'所持資源',cGoShop:'ショップを開く',
  detailHint:'項目をタップすると詳細が開きます',
  replayTut:'チュートリアルを再生',replayTutV:'再生',replayDone:'次のインフィニティ出撃で開始します',
  gradeOdds:'等級別確率',
  unitSummonD2:'等級別の確率でユニットカードを獲得します。カードはクレジットと共に使って初めて段階が上がります。',
  relicSummonD2:'遺物カードを1枚獲得します。カードとクレジットで段階を上げましょう。',
  objSweep:(a,b)=>`敵掃討 <b>${a} / ${b}</b>`,
  objBase:n=>`敵基地の砲台 <b>${n} / 4</b> · レーダーの矢印に従ってください`,
  upDmgN:'火力増幅',upDmgD:'攻撃力 +1',
  upRateN:'装填速度上昇',upRateD:'発射間隔 10% 短縮',
  upMoveN:'エンジン強化',upMoveD:'移動速度 8% 上昇',
  upArmorN:'装甲強化',upArmorD:'被ダメージ 8% 減少',
  upCapN:'吸収熟練',upCapD:'吸収成功率 +5%p (最大80%)',
  upBeamN:'ビーム強化',upBeamD:'吸収判定 12% 短縮 · 範囲拡大',
  upPowerN:'予備動力炉',upPowerD:(a,b)=>`最大体力 +${a} · 毎秒 ${b} 回復`,
  upShldN:'常時シールド',upShldD:'ステージ開始時にシールド1枚',
  upSquadN:'編隊拡張',upSquadD:'編隊定員 +1 (永続)',
  upScoutN:'偵察兵支給',upScoutD:'ステージ開始時に味方1機を配置',
  iPWR:'攻撃力アップ',iRATE:'攻撃速度アップ',iWAY:'弾数アップ',iSPD:'移動速度アップ',
  iSHLD:'シールド',iHEAL:'体力回復',iSLOT:'編隊定員 +1',iAPWR:'編隊火力 +1',
  iFREEZE:'アイスミサイル',iPOISON:'猛毒ミサイル',iFIRE:'火炎ミサイル',iSUMMON:'レジェンド召喚',
  eFREEZE:'凍結',ePOISON:'毒',eFIRE:'炎上',
  rCore:v=>`攻撃力 +${v}`,rArmor:v=>`被ダメージ -${v}%`,rCool:v=>`攻撃速度 +${v}%`,
  rThrust:v=>`移動速度 +${v}%`,rScan:v=>`アイテムドロップ率 +${v}%p`,rTow:v=>`吸収成功率 +${v}%p`,
  rNano:v=>`毎秒体力回復 +${v}`,rLink:v=>`味方攻撃力 +${v}`,rBay:v=>`編隊定員 +${v}`,
  rMag:v=>`弾数 +${v}`,
  mTime:n=>`${n}秒以内にクリア`,mNohit:'一度も被弾せずにクリア',
  mNocap:'吸収せずにクリア',mKill:n=>`敵を${n}機以上撃破`,
  mItem:n=>`アイテムを${n}個以上獲得`,mSquad:n=>`編隊${n}機以上を維持したままクリア`,
  mNosum:'レジェンドを召喚せずにクリア',mNoheal:'回復アイテムを使わずにクリア',
  rotateMsg:'画面を縦向きにしてください',loadTitle:'戦場を展開中',loadSub:'モバイル最適化リソースを読み込んでいます',
  startBtn:'出撃',
  ctrlTouch:'画面の<b>左半分</b>をドラッグで移動、<b>右半分</b>をドラッグでその方向へ吸収ビームを放ちます。<br>両方を同時に使えます。射撃は最も近い敵を自動照準します。',
  ctrlKey:'<span class="keys">W</span><span class="keys">A</span><span class="keys">S</span><span class="keys">D</span> で移動 · 射撃は自動照準<br><span class="keys">マウス</span>で吸収方向を狙い、<span class="keys">SPACE</span> またはクリックで発動',
  hintTouch:'左=移動 · 右=吸収照準',hintKey:'WASDで移動 · マウスで照準 · SPACEで吸収 · 北へ進んで敵基地を探そう',
  tutMove:'動いてみましょう。主砲は近くの敵を自動で狙って射撃します。',
  tutCapture:'黄色のユニットは捕獲できる中立ユニットです。攻撃では倒せないので、吸収ビームを当て続けて味方にしましょう。',
  tutItem:'戦闘中に落ちるアイテムを拾ってみましょう。緑のアイテムに近づくと自動で引き寄せられます。',
  tutFight:'チュートリアル完了！ さあ <b>敵軍を撃破しましょう。</b> 敵を掃討すると基地が出現します。',
  tutCapMsg:'このユニットを捕獲せよ',tutItemMsg:'アイテムを獲得せよ',
  tov3T:'アイテムとビルド',
  tov3L:'いい調子です。戦闘中に敵が落とすアイテムを拾うと、そのステージの間だけ戦闘能力が即座に強化されます。',
  tov3A:'獲得したアイテムは画面<b>右上の「獲得アイテム」</b>欄にアイコンで表示され、戦闘中でも現在の効果を確認できます。',
  tov3B:'フィールドで得たアイテム効果は<b>ステージ終了時にリセット</b>されます。毎ステージ違う組み合わせを試しましょう。',
  tov3N:'次へ · HUDとレーダー',
  tov4T:'HUD · レーダー · レジェンド',
  tov4L:'戦闘画面には、ステージを進めるのに必要な情報が常に表示されています。',
  tovRadarH:'左上 · レーダー',
  tovRadarP:'周囲の敵、アイテム、味方、敵基地の位置を表示します。基地が現れたら方向マーカーに従ってください。',
  tovHudH:'画面上部 · 体力 / 編隊',
  tovHudP:'現在の体力と、通常ユニット・レジェンドをそれぞれ何機まで編成できるかを確認できます。',
  tovSquad:'通常 1/4',tovSquadL:'レジェンド 0/4',
  tovLegH:'レジェンドユニット',
  tovLegP:'戦場にはまれに強力な<b>レジェンドユニット</b>が黄色の中立として出現します。見つけたら捕獲に挑みましょう。',
  tov4Tip:'レジェンドは<b>捕獲だけでは確定しません。</b> 捕獲後にそのステージをクリアして初めてカードが確定します。',
  tov4N:'確認 · 戦闘開始',
  basicShop:'Basic Launch テスト',
  basicShopD:'現金決済とリワード広告は審査用テストビルドでは無効になっています。',
  pause:'一時停止',resume:'再開',
 },
 zh:{
  gradeC:'普通',gradeR:'稀有',gradeE:'精英',gradeP:'史诗',gradeL:'传说',
  rarN:'普通',rarR:'稀有',rarSR:'英雄',rarSSR:'传说',
  tier:'等级',ownedCards:'持有卡片',needCards:n=>`需要卡片 ${n} 张`,
  upBtn:'升级',upTo:(a,b)=>`Lv${a} → Lv${b}`,maxTier:'已达最高等级',
  lackCard:'卡片不足',lackCred:'信用点不足',
  upDone:'升级完成',notYet:'尚未获得',
  atkStyle:'战斗方式',statHp:'生命',statSpd:'移动',statFire:'射速',statDmg:'伤害',statRange:'射程',
  tAir:'空中单位',tGround:'地面单位',tMulti:n=>`同时发射 ${n} 发`,tHoming:'追踪弹',
  tSplash:'命中时造成范围伤害',tFixed:'固定炮台 · 无法移动',tElite:'精英 · 吸收成功率更高',
  aiBasic:'一边逼近玩家一边射击',
  aiStrafe:'侧向盘旋并擦身射击',
  aiBurst:'停下来倾泻三连点射',
  aiCharge:'拉近距离冲锋后近身乱射',
  aiSalvo:'从远处齐射导弹',
  aiRove:'在战场上大范围游走并伏击',
  aiRockets:'速度缓慢但连续投射爆炸火箭',
  aiTurret:'原地不动，射击射程内的一切',
  aiRage:'生命越低攻击越快',
  aiHover:'滞空后向下投弹',
  aiSiege:'一边推进一边重复攻城炮击',
  wGatling:'加特林连射',wMissile:'导弹',wSide:'左右散射',wRear:'后方远程弹',
  wSeeker:'追踪导弹',wLaser:'贯穿激光',wRadial:'全方位射击',
  wChain:'连锁激光',wSpin:'旋转激光',
  wLine:(a,b,c)=>`${a} · 伤害 ${b} · 每 ${c} 秒`,
  storyStart:'出击',missionList:'关卡任务',
  missionOk:'已完成',missionNo:'未完成',
  storyCum:'任务为累计判定，剩下的任务可以在之后单独完成。',
  profile:'指挥官信息',pName:'呼号',pBest:'最高纪录',pLegend:'已拥有传说',pRelic:'已拥有遗物',
  pAccount:'账号绑定将在后续版本支持。',
  cRes:'持有资源',cGoShop:'打开商店',
  detailHint:'点击条目可查看详情',
  replayTut:'重看新手教程',replayTutV:'重看',replayDone:'将在下次无尽出击时开始',
  gradeOdds:'各等级概率',
  unitSummonD2:'按等级概率获得单位卡片。卡片需与信用点一同消耗才能提升等级。',
  relicSummonD2:'获得一张遗物卡片。用卡片和信用点提升等级。',
  objSweep:(a,b)=>`清剿敌军 <b>${a} / ${b}</b>`,
  objBase:n=>`敌方基地炮塔 <b>${n} / 4</b> · 请跟随雷达箭头`,
  upDmgN:'火力增幅',upDmgD:'攻击力 +1',
  upRateN:'装填加速',upRateD:'射击间隔 -10%',
  upMoveN:'引擎强化',upMoveD:'移动速度 +8%',
  upArmorN:'装甲强化',upArmorD:'受到伤害 -8%',
  upCapN:'吸收精通',upCapD:'吸收成功率 +5%p (上限80%)',
  upBeamN:'光束升级',upBeamD:'吸收判定 -12% · 范围扩大',
  upPowerN:'备用反应炉',upPowerD:(a,b)=>`最大生命 +${a} · 每秒回复 ${b}`,
  upShldN:'常驻护盾',upShldD:'每关开始时获得一个护盾',
  upSquadN:'编队扩充',upSquadD:'编队上限 +1 (永久)',
  upScoutN:'配属侦察兵',upScoutD:'每关开始时部署一名友军',
  iPWR:'攻击力提升',iRATE:'攻速提升',iWAY:'弹数提升',iSPD:'移速提升',
  iSHLD:'护盾',iHEAL:'恢复生命',iSLOT:'编队上限 +1',iAPWR:'编队火力 +1',
  iFREEZE:'冰冻导弹',iPOISON:'剧毒导弹',iFIRE:'火焰导弹',iSUMMON:'召唤传说',
  eFREEZE:'冰冻',ePOISON:'中毒',eFIRE:'燃烧',
  rCore:v=>`攻击力 +${v}`,rArmor:v=>`受到伤害 -${v}%`,rCool:v=>`攻击速度 +${v}%`,
  rThrust:v=>`移动速度 +${v}%`,rScan:v=>`道具掉落率 +${v}%p`,rTow:v=>`吸收成功率 +${v}%p`,
  rNano:v=>`每秒生命回复 +${v}`,rLink:v=>`友军攻击力 +${v}`,rBay:v=>`编队上限 +${v}`,
  rMag:v=>`弹数 +${v}`,
  mTime:n=>`在 ${n} 秒内通关`,mNohit:'全程不受伤通关',
  mNocap:'不进行吸收通关',mKill:n=>`击破 ${n} 架以上敌军`,
  mItem:n=>`获得 ${n} 个以上道具`,mSquad:n=>`保持 ${n} 架以上编队通关`,
  mNosum:'不召唤传说单位通关',mNoheal:'不使用回复道具通关',
  rotateMsg:'请将设备旋转为竖屏',loadTitle:'战场展开中',loadSub:'正在加载移动端优化资源',
  startBtn:'出击',
  ctrlTouch:'拖动屏幕<b>左半边</b>移动，拖动<b>右半边</b>向该方向发射吸收光束。<br>两者可同时使用，射击会自动瞄准最近的敌人。',
  ctrlKey:'<span class="keys">W</span><span class="keys">A</span><span class="keys">S</span><span class="keys">D</span> 移动 · 射击自动瞄准<br>用<span class="keys">鼠标</span>瞄准吸收方向，按 <span class="keys">SPACE</span> 或点击发动',
  hintTouch:'左=移动 · 右=吸收瞄准',hintKey:'WASD 移动 · 鼠标瞄准 · SPACE 吸收 · 向北前进寻找敌方基地',
  tutMove:'先移动看看。主炮会自动瞄准附近的敌人射击。',
  tutCapture:'黄色单位是可以捕获的中立单位。攻击无法击杀它，请持续照射吸收光束把它收为己用。',
  tutItem:'捡起战斗中掉落的道具。靠近绿色道具时会自动被吸过来。',
  tutFight:'教程完成！现在 <b>去击败敌军吧。</b> 清剿敌人后基地就会出现。',
  tutCapMsg:'捕获这个单位',tutItemMsg:'拾取道具',
  tov3T:'道具与配装',
  tov3L:'很好。战斗中敌人掉落的道具一旦拾取，就会在该关卡内立即强化你的战斗能力。',
  tov3A:'获得的道具会以图标显示在画面<b>右上角的「获得道具」</b>区域，战斗中也能随时确认当前效果。',
  tov3B:'在战场上获得的道具效果会<b>在关卡结束时重置</b>。每关都可以尝试不同的组合。',
  tov3N:'下一步 · HUD 与雷达',
  tov4T:'HUD · 雷达 · 传说单位',
  tov4L:'战斗界面会始终显示推进关卡所需的信息。',
  tovRadarH:'左上 · 雷达',
  tovRadarP:'显示周围的敌人、道具、友军以及敌方基地的位置。基地出现后请跟随方向标记。',
  tovHudH:'顶部 · 生命 / 编队',
  tovHudP:'可以查看当前生命值，以及普通单位与传说单位各能编入多少。',
  tovSquad:'普通 1/4',tovSquadL:'传说 0/4',
  tovLegH:'传说单位',
  tovLegP:'战场上偶尔会出现强大的<b>传说单位</b>，以黄色中立单位的形式登场。发现后请尝试捕获。',
  tov4Tip:'传说单位<b>仅靠捕获并不会确定获得。</b> 捕获后还需通关该关卡，卡片才会最终到手。',
  tov4N:'确认 · 开始战斗',
  basicShop:'Basic Launch 测试',
  basicShopD:'现金支付与激励广告在审核测试版中已停用。',
  pause:'暂停',resume:'继续',
 },
};
for(const lg in STR_V21) Object.assign(STR[lg], STR_V21[lg]);
/* 안전망 — 어떤 언어에 키가 비면 영어로 폴백합니다(한국어가 튀어나오지 않게). */
for(const lg of Object.keys(STR)){
  for(const k in STR.en) if(STR[lg][k]===undefined) STR[lg][k]=STR.en[k];
}
/* ===================== v22 계급 · 신규 문구 =============================
   계급은 미 육군 체계를 씁니다. Web 주 이용자가 영어권이라
   영어 표기를 기준으로 삼고, 나머지 언어는 각국 군 계급 관례를 따랐습니다. */
const STR_V22={
 ko:{
  rank:'계급',nextRank:'다음 계급',promote:'진급',rankStep:'진급 횟수',
  power:'전투력',effect:'효과',
  maxLvIs:n=>`최대 Lv${n}`,
  refundNote:n=>`최대 레벨 이후 중복 획득 시 아스트라늄 ${n} 환급`,
  refunded:n=>`아스트라늄 +${n} 환급`,
  rkPVT:'이등병',rkPFC:'일병',rkCPL:'상병',rkSGT:'병장',
  rkSSG:'하사',rkSFC:'중사',rkMSG:'상사',rkSGM:'원사',
  rkWO:'준위',rkCWO:'준위장',
  rk2LT:'소위',rk1LT:'중위',rkCPT:'대위',rkMAJ:'소령',rkLTC:'중령',rkCOL:'대령',
  rkBG:'준장',rkMG:'소장',rkLTG:'중장',rkGEN:'대장',rkGA:'원수',
  rankNote:'카드 5장마다 1계급 진급합니다.',rateUpBy:n=>`재장전 ${n}% 단축`,nextGain:(l,v)=>`Lv${l} 에서 ${v}`,
 },
 en:{
  rank:'Rank',nextRank:'Next rank',promote:'Promote',rankStep:'Promotions',
  power:'Combat power',effect:'Effect',
  maxLvIs:n=>`Max Lv${n}`,
  refundNote:n=>`Duplicates past max level refund ${n} Astranium`,
  refunded:n=>`+${n} Astranium refunded`,
  rkPVT:'Private',rkPFC:'Private First Class',rkCPL:'Corporal',rkSGT:'Sergeant',
  rkSSG:'Staff Sergeant',rkSFC:'Sergeant First Class',rkMSG:'Master Sergeant',rkSGM:'Sergeant Major',
  rkWO:'Warrant Officer',rkCWO:'Chief Warrant Officer',
  rk2LT:'Second Lieutenant',rk1LT:'First Lieutenant',rkCPT:'Captain',
  rkMAJ:'Major',rkLTC:'Lieutenant Colonel',rkCOL:'Colonel',
  rkBG:'Brigadier General',rkMG:'Major General',rkLTG:'Lieutenant General',
  rkGEN:'General',rkGA:'General of the Army',
  rankNote:'Every 5 cards earns a promotion.',rateUpBy:n=>`Reload ${n}% faster`,nextGain:(l,v)=>`${v} at Lv${l}`,
 },
 ja:{
  rank:'階級',nextRank:'次の階級',promote:'昇進',rankStep:'昇進回数',
  power:'戦闘力',effect:'効果',
  maxLvIs:n=>`最大 Lv${n}`,
  refundNote:n=>`最大レベル到達後の重複はアストラニウム ${n} に還元`,
  refunded:n=>`アストラニウム +${n} 還元`,
  rkPVT:'二等兵',rkPFC:'一等兵',rkCPL:'上等兵',rkSGT:'兵長',
  rkSSG:'三等軍曹',rkSFC:'二等軍曹',rkMSG:'一等軍曹',rkSGM:'曹長',
  rkWO:'准尉',rkCWO:'上級准尉',
  rk2LT:'少尉',rk1LT:'中尉',rkCPT:'大尉',rkMAJ:'少佐',rkLTC:'中佐',rkCOL:'大佐',
  rkBG:'准将',rkMG:'少将',rkLTG:'中将',rkGEN:'大将',rkGA:'元帥',
  rankNote:'カード5枚ごとに1階級昇進します。',rateUpBy:n=>`装填 ${n}% 短縮`,nextGain:(l,v)=>`Lv${l} で ${v}`,
 },
 zh:{
  rank:'军衔',nextRank:'下一军衔',promote:'晋升',rankStep:'晋升次数',
  power:'战斗力',effect:'效果',
  maxLvIs:n=>`最高 Lv${n}`,
  refundNote:n=>`满级后重复获得将返还 ${n} 星辰素`,
  refunded:n=>`返还 +${n} 星辰素`,
  rkPVT:'列兵',rkPFC:'一等兵',rkCPL:'下士',rkSGT:'中士',
  rkSSG:'上士',rkSFC:'一级军士长',rkMSG:'军士长',rkSGM:'总军士长',
  rkWO:'准尉',rkCWO:'高级准尉',
  rk2LT:'少尉',rk1LT:'中尉',rkCPT:'上尉',rkMAJ:'少校',rkLTC:'中校',rkCOL:'上校',
  rkBG:'准将',rkMG:'少将',rkLTG:'中将',rkGEN:'上将',rkGA:'陆军特级上将',
  rankNote:'每 5 张卡片晋升一级。',rateUpBy:n=>`装填缩短 ${n}%`,nextGain:(l,v)=>`Lv${l} 时 ${v}`,
 },
};
for(const lg in STR_V22) Object.assign(STR[lg], STR_V22[lg]);
for(const lg of Object.keys(STR)){
  for(const k in STR.en) if(STR[lg][k]===undefined) STR[lg][k]=STR.en[k];
}
/* ===================== v26 행성 · 로고 부제 ==============================
   로고(FIELD OF IMMORTALS)는 영문 워드마크라 영어에서 부제로 제목을 한 번 더
   쓰면 중복입니다. 그래서 영어만 태그라인을 쓰고, 나머지 언어는 현지 제목을
   부제로 둡니다. 문구를 바꾸고 싶으면 gameSub 만 고치면 됩니다. */
const STR_V32={
 ko:{ aiSpike:'좌우 소형 포로 2발씩 쏘며 주기적으로 짧게 돌진합니다',
      aiBurrow:'땅속에서 솟아올라 충격파를 일으키고, 가까워지면 다시 파고들며 폭발합니다',
      aiVolt:'따라오는 전격 레이저를 쏘고, 근접하면 플라즈마 장판을 남깁니다',
      aiFlak:'대각선으로 대형 미사일을 퍼붓고 시야를 막는 연막탄을 던집니다',
      aiWasp:'폭탄을 떨구다 이탈한 뒤, 융단폭격으로 되돌아옵니다',
      tStun:'명중 시 이동 봉쇄', tPull:'끌어당김', tPlasma:'플라즈마 장판',
      tSmoke:'시야 차단 연막', tCarpet:'융단폭격' },
 en:{ aiSpike:'Fires paired side cannons and dashes in short bursts',
      aiBurrow:'Erupts from the ground with a shockwave, then burrows away when you close in',
      aiVolt:'Sweeps a tracking arc laser and leaves plasma pools up close',
      aiFlak:'Rains diagonal missile barrages and throws vision-blocking smoke',
      aiWasp:'Drops bombs, withdraws, then returns with a carpet-bombing run',
      tStun:'Stuns on hit', tPull:'Pulls you in', tPlasma:'Plasma pools',
      tSmoke:'Vision-blocking smoke', tCarpet:'Carpet bombing' },
 ja:{ aiSpike:'左右の小口径砲で2発ずつ撃ち、周期的に短く突進します',
      aiBurrow:'地中から出現して衝撃波を放ち、近づくと再び潜って爆発します',
      aiVolt:'追尾する電撃レーザーを放ち、接近するとプラズマ床を残します',
      aiFlak:'斜めに大型ミサイルを撃ち込み、視界を遮る煙幕を投げます',
      aiWasp:'爆弾を落として離脱し、絨毯爆撃で戻ってきます',
      tStun:'命中時に行動不能', tPull:'引き寄せ', tPlasma:'プラズマ床',
      tSmoke:'視界遮断の煙幕', tCarpet:'絨毯爆撃' },
 zh:{ aiSpike:'左右小炮各射两发，并周期性短距冲刺',
      aiBurrow:'从地下钻出并释放冲击波，靠近时再次潜入并爆炸',
      aiVolt:'发射追踪电弧激光，靠近时留下等离子地面',
      aiFlak:'斜向倾泻大型导弹并投掷遮蔽视野的烟雾',
      aiWasp:'投弹后撤离，再以地毯式轰炸返场',
      tStun:'命中时无法行动', tPull:'拉近', tPlasma:'等离子地面',
      tSmoke:'遮蔽视野的烟雾', tCarpet:'地毯式轰炸' },
};
const STR_V31={
 ko:{ records:'기록 확인', recordsSub:'이 기기에 쌓인 전적',
      recordsLocal:'※ 아직 이 기기 안의 기록입니다. 온라인 순위표는 출시 후 연결됩니다.',
      rcBestScore:'최고 점수', rcBestStage:'최고 스테이지', rcStory:'스토리 진행',
      rcStars:'임무 달성', rcTopLegend:'최고 계급 레전드', rcTopUnit:'최고 계급 유닛',
      rcTopRelic:'최고 레벨 유물', rcLegend:'보유 레전드', rcRelic:'보유 유물',
      rcKills:'누적 처치', rcRuns:'플레이 횟수', stageUnit:'스테이지',
      master:'마스터 도구', mStage:'스테이지 이동', mLegend:'레전드 소환',
      mAll:'전부 해금', mGod:'무적', mOn:'켬', mOff:'끔',
      gateTitle:'테스트 빌드', gateAsk:'비밀번호를 입력하세요', gateNo:'비밀번호가 다릅니다', gateGo:'입장' },
 en:{ records:'Records', recordsSub:'Stats stored on this device',
      recordsLocal:'Note: these are local records. Online personal records come after launch.',
      rcBestScore:'Best score', rcBestStage:'Best stage', rcStory:'Story progress',
      rcStars:'Missions cleared', rcTopLegend:'Highest-ranked Legend', rcTopUnit:'Highest-ranked unit',
      rcTopRelic:'Highest relic tier', rcLegend:'Legends owned', rcRelic:'Relics owned',
      rcKills:'Total kills', rcRuns:'Runs played', stageUnit:'',
      master:'Master tools', mStage:'Jump to stage', mLegend:'Summon Legend',
      mAll:'Unlock everything', mGod:'Invincible', mOn:'On', mOff:'Off',
      gateTitle:'Test build', gateAsk:'Enter the password', gateNo:'Wrong password', gateGo:'Enter' },
 ja:{ records:'記録確認', recordsSub:'この端末に蓄積された戦績',
      recordsLocal:'※ 現在は端末内の記録です。オンライン順位表はリリース後に接続します。',
      rcBestScore:'最高スコア', rcBestStage:'最高ステージ', rcStory:'ストーリー進行',
      rcStars:'任務達成', rcTopLegend:'最高階級レジェンド', rcTopUnit:'最高階級ユニット',
      rcTopRelic:'最高レベル遺物', rcLegend:'所持レジェンド', rcRelic:'所持遺物',
      rcKills:'累計撃破', rcRuns:'プレイ回数', stageUnit:'',
      master:'マスターツール', mStage:'ステージ移動', mLegend:'レジェンド召喚',
      mAll:'全て解放', mGod:'無敵', mOn:'オン', mOff:'オフ',
      gateTitle:'テストビルド', gateAsk:'パスワードを入力してください', gateNo:'パスワードが違います', gateGo:'入場' },
 zh:{ records:'战绩查看', recordsSub:'本机累积的战绩',
      recordsLocal:'※ 目前为本机记录。在线排行榜将在上线后接入。',
      rcBestScore:'最高分数', rcBestStage:'最高关卡', rcStory:'剧情进度',
      rcStars:'任务完成', rcTopLegend:'最高军衔传说', rcTopUnit:'最高军衔单位',
      rcTopRelic:'最高等级遗物', rcLegend:'已拥有传说', rcRelic:'已拥有遗物',
      rcKills:'累计击破', rcRuns:'游玩次数', stageUnit:'关',
      master:'开发者工具', mStage:'跳转关卡', mLegend:'召唤传说',
      mAll:'全部解锁', mGod:'无敌', mOn:'开', mOff:'关',
      gateTitle:'测试版本', gateAsk:'请输入密码', gateNo:'密码错误', gateGo:'进入' },
};
const STR_V29={
 ko:{ resetYes:'정말 초기화합니다', cancel:'취소',
      volMusic:'배경음 음량', volSfx:'효과음 음량', showObj:'목표 표시',
      objSweepShort:(a,b)=>`<b>${a}/${b}</b> 소탕`,
      objBaseShort:n=>`포탑 <b>${n}/4</b>` },
 en:{ resetYes:'Yes, erase everything', cancel:'Cancel',
      volMusic:'Music volume', volSfx:'Effects volume', showObj:'Objective display',
      objSweepShort:(a,b)=>`<b>${a}/${b}</b> swept`,
      objBaseShort:n=>`turrets <b>${n}/4</b>` },
 ja:{ resetYes:'本当に初期化します', cancel:'キャンセル',
      volMusic:'BGM 音量', volSfx:'効果音 音量', showObj:'目標表示',
      objSweepShort:(a,b)=>`<b>${a}/${b}</b> 掃討`,
      objBaseShort:n=>`砲台 <b>${n}/4</b>` },
 zh:{ resetYes:'确认全部清除', cancel:'取消',
      volMusic:'背景音量', volSfx:'音效音量', showObj:'目标显示',
      objSweepShort:(a,b)=>`<b>${a}/${b}</b> 清剿`,
      objBaseShort:n=>`炮塔 <b>${n}/4</b>` },
};
const STR_V26={
 ko:{ pEarth:'지구', pCeres:'케레스', pIgnis:'이그니스', pPrisma:'프리즈마',
      gameSub:'필드 오브 이모탈' },
 en:{ pEarth:'EARTH', pCeres:'CERES', pIgnis:'IGNIS', pPrisma:'PRISMA',
      gameSub:'ETERNAL FRONT' },
 ja:{ pEarth:'地球', pCeres:'ケレス', pIgnis:'イグニス', pPrisma:'プリズマ',
      gameSub:'不滅の戦場' },
 zh:{ pEarth:'地球', pCeres:'刻瑞斯', pIgnis:'伊格尼斯', pPrisma:'普里兹玛',
      gameSub:'不朽战场' },
};
for(const lg in STR_V26) Object.assign(STR[lg], STR_V26[lg]);
for(const lg in STR_V29) Object.assign(STR[lg], STR_V29[lg]);
for(const lg in STR_V31) Object.assign(STR[lg], STR_V31[lg]);
for(const lg in STR_V32) Object.assign(STR[lg], STR_V32[lg]);
for(const lg of Object.keys(STR)){
  for(const k in STR.en) if(STR[lg][k]===undefined) STR[lg][k]=STR.en[k];
}
for(const lg of Object.keys(STR)){
  for(const k in STR.en) if(STR[lg][k]===undefined) STR[lg][k]=STR.en[k];
}



/* ===================== 고유명 (유닛·레전드·유물·지역) ==================
   nm('tank') 처럼 부르면 현재 언어의 이름이 나옵니다. */
const NAMES={
 infantry:   {ko:'애쉬 라이플맨', en:'Ash Rifleman',   ja:'アッシュライフルマン', zh:'灰烬步枪兵'},
 apc:        {ko:'스틸 하운드',   en:'Steel Hound',    ja:'スチールハウンド',     zh:'钢铁猎犬'},
 tank:       {ko:'그레이 몰',     en:'Grey Maul',      ja:'グレイモール',         zh:'灰锤坦克'},
 heli:       {ko:'애쉬 버저드',   en:'Ash Buzzard',    ja:'アッシュバザード',     zh:'灰烬秃鹫'},
 legend_bike:{ko:'크림슨 랜스',   en:'Crimson Lance',  ja:'クリムゾンランス',     zh:'赤红骑枪'},
 legend_ship:{ko:'오비탈 팰컨',   en:'Orbital Falcon', ja:'オービタルファルコン', zh:'轨道游隼'},
 e_hawk:     {ko:'레드 호크',   en:'Red Hawk',        ja:'レッドホーク',  zh:'红鹰'},
 e_guard:    {ko:'레드 가드',   en:'Red Guard',       ja:'レッドガード',  zh:'红卫兵'},
 e_rider:    {ko:'러시 라이더', en:'Rush Rider',      ja:'ラッシュライダー', zh:'冲锋骑手'},
 e_missile:  {ko:'미사일 트루퍼',en:'Missile Trooper',ja:'ミサイル兵',    zh:'导弹兵'},
 e_scout:    {ko:'스카이 스카우트',en:'Sky Scout',    ja:'スカイスカウト',zh:'天空侦察机'},
 e_rocket:   {ko:'헤비 로켓 탱크',en:'Heavy Rocket Tank',ja:'ヘビーロケット戦車',zh:'重型火箭坦克'},
 e_sentry:   {ko:'트윈 센트리', en:'Twin Sentry',     ja:'ツインセントリー',zh:'双联哨戒炮'},
 e_bruiser:  {ko:'브루저 메크', en:'Bruiser Mech',    ja:'ブルーザーメック',zh:'重击机甲'},
 e_hover:    {ko:'호버 캐논',   en:'Hover Cannon',    ja:'ホバーキャノン',zh:'悬浮炮车'},
 e_spike:   {ko:'스파이크 러너', en:'Spike Runner',  ja:'スパイクランナー', zh:'尖刺奔袭车'},
  e_mole:    {ko:'브리치 몰',     en:'Breach Mole',   ja:'ブリーチモール',   zh:'破土鼹鼠'},
  e_volt:    {ko:'볼트 오브',     en:'Volt Orb',      ja:'ボルトオーブ',     zh:'雷电球'},
  e_flak:    {ko:'플랙 하울러',   en:'Flak Howler',   ja:'フラックハウラー', zh:'防空嚎叫者'},
  e_wasp:    {ko:'시즈 와스프',   en:'Siege Wasp',    ja:'シージワスプ',     zh:'攻城黄蜂'},
  e_warbrute:{ko:'워브루트',    en:'War Brute',       ja:'ウォーブルート',zh:'战争凶兽'},
 L_vulcan:   {ko:'발칸 라이더', en:'Vulcan Rider',    ja:'バルカンライダー',zh:'火神骑手'},
 L_gunship:  {ko:'스트라이크 건쉽',en:'Strike Gunship',ja:'ストライクガンシップ',zh:'突击炮艇'},
 L_cannon:   {ko:'아이언 캐논', en:'Iron Cannon',     ja:'アイアンキャノン',zh:'铁铸重炮'},
 L_twin:     {ko:'트윈 블래스터',en:'Twin Blaster',   ja:'ツインブラスター',zh:'双联爆破者'},
 L_lancer:   {ko:'스카이 렌서', en:'Sky Lancer',      ja:'スカイランサー',zh:'苍穹长枪'},
 L_sweeper:  {ko:'스위퍼 터렛', en:'Sweeper Turret',  ja:'スイーパータレット',zh:'清扫炮塔'},
 L_cruiser:  {ko:'어썰트 크루저',en:'Assault Cruiser',ja:'アサルトクルーザー',zh:'突击巡洋舰'},
 L_titan:    {ko:'타이탄 워커', en:'Titan Walker',    ja:'タイタンウォーカー',zh:'泰坦行者'},
 L_phantom:  {ko:'팬텀 스피어', en:'Phantom Spear',   ja:'ファントムスピア',zh:'幻影之枪'},
 L_nova:     {ko:'리액터 노바', en:'Reactor Nova',    ja:'リアクターノヴァ',zh:'反应炉新星'},
 r_core:     {ko:'동력 결정',   en:'Power Crystal',   ja:'動力結晶',      zh:'动力结晶'},
 r_armor:    {ko:'반응 장갑',   en:'Reactive Armor',  ja:'反応装甲',      zh:'反应装甲'},
 r_cool:     {ko:'냉각 링',     en:'Coolant Ring',    ja:'冷却リング',    zh:'冷却环'},
 r_thrust:   {ko:'가속 추진기', en:'Boost Thruster',  ja:'加速スラスター',zh:'加速推进器'},
 r_scan:     {ko:'광역 탐사기', en:'Wide Scanner',    ja:'広域探知機',    zh:'广域探测器'},
 r_tow:      {ko:'견인 큐브',   en:'Tractor Cube',    ja:'牽引キューブ',  zh:'牵引方块'},
 r_nano:     {ko:'나노 재생기', en:'Nano Regenerator',ja:'ナノ再生機',    zh:'纳米再生器'},
 r_link:     {ko:'관제 성좌반', en:'Command Astrolabe',ja:'管制星座盤',   zh:'管制星盘'},
 r_bay:      {ko:'예비 격납고', en:'Reserve Hangar',  ja:'予備格納庫',    zh:'预备机库'},
 r_mag:      {ko:'특이점 장치', en:'Singularity Core',ja:'特異点装置',    zh:'奇点装置'},
 EARTH:      {ko:'지구 전선',   en:'Earth Front',     ja:'地球戦線',      zh:'地球战线'},
 SPACE:      {ko:'화성 전역',   en:'Mars Theater',    ja:'火星戦域',      zh:'火星战区'},
 ch1:        {ko:'지구 전선',   en:'Earth Front',     ja:'地球戦線',      zh:'地球战线'},
 ch2:        {ko:'케레스 폐허',     en:'Ceres Ruins',        ja:'ケレス廃墟',        zh:'刻瑞斯废墟'},
 ch3:        {ko:'이그니스 화산대', en:'Ignis Volcanic Belt',ja:'イグニス火山帯',    zh:'伊格尼斯火山带'},
 ch4:        {ko:'프리즈마 심연',   en:'Prisma Abyss',       ja:'プリズマ深淵',      zh:'普里兹玛深渊'},
};
function nm(k){ if(VELCARION[k])return LANG==='ko'?VELCARION[k].name:VELCARION[k].en; const d=NAMES[k]; if(!d) return k; return d[LANG]||d.ko; }

function T(k,...a){
  let d=(STR[LANG]&&STR[LANG][k])!==undefined?STR[LANG][k]:undefined;
  if(d===undefined) d=STR.en[k];            // 폴백은 영어 (Web 기준 언어)
  if(d===undefined) d=STR.ko[k];
  if(d===undefined) return k;
  return typeof d==='function'?d(...a):d;
}
function metaLoad(){ try{ const r=CG_STORAGE.getItem('foi_meta'); if(r) Object.assign(META,JSON.parse(r)); }catch(e){}
  META.units=META.units||{}; META.relics=META.relics||{}; META.legends=META.legends||{}; META.story=META.story||{};
  if(META.tutorialDone===undefined) META.tutorialDone=false;
  /* 튜토리얼 개편 버전이 바뀌면 기존 플레이어도 새 튜토리얼을 1회 다시 볼 수 있게 합니다. */
  /* 예전에는 튜토리얼 버전이 바뀌면 모두에게 다시 보여줬습니다.
     이미 익힌 사람에게는 방해가 되므로 그 자동 재생을 없앴습니다.
     다시 보고 싶으면 설정 → 튜토리얼 다시 보기를 쓰면 됩니다. */
  META.tutorialVersion=BUILD.tutorialVersion;
  migrateSave(); migrateSave22(); migrateSave28(); migrateChapterRewards();

  metaSave(); }
/* v20까지는 카드 장수만으로 단계가 자동으로 올라갔습니다.
   v21부터는 카드를 소모해 올리므로, 기존 플레이어의 단계를 그대로 인정하고
   남은 카드만 이월합니다. 진행도가 깎이지 않게 하는 것이 목적입니다. */
const OLD_STEPS=[1,3,8,18,38];
function migrateSave(){
  if(META.saveVer>=21) return;
  for(const [kind,slot] of [['unit','units'],['legend','legends'],['relic','relics']]){
    const m=META[slot]||{};
    for(const k in m){
      const r=m[k]; if(!r || r.lv!==undefined) continue;
      const c=r.cards|0; let lv=0;
      for(const need of OLD_STEPS) if(c>=need) lv++;
      lv=Math.min(MAXLV,lv);
      r.lv=lv;
      r.cards=Math.max(0, c-(lv>0?OLD_STEPS[lv-1]:0));
    }
  }
  META.saveVer=21;
}
/* v21은 유닛·레전드가 5단계, 유물도 5단계였습니다.
   v22에서는 유닛이 등급별 계급 수로, 유물은 희귀도별 최대 레벨로 바뀝니다.
   기존 레벨을 새 상한 안으로 눌러 담고 카드는 그대로 둡니다. */
function migrateSave22(){
  if(META.saveVer>=22) return;
  for(const k in (META.units||{})){
    const r=META.units[k]; if(!r) continue;
    if(UNIT_GRADE[k]) r.lv=Math.min(r.lv|0, maxSteps(UNIT_GRADE[k]));
    else delete META.units[k];
  }
  for(const k in (META.legends||{})){
    const r=META.legends[k]; if(!r) continue;
    r.lv=Math.min(r.lv|0, maxSteps('L'));
  }
  for(const k in (META.relics||{})){
    const r=META.relics[k]; if(!r||!RELICS[k]) continue;
    r.lv=Math.min(r.lv|0, relicMax(k));
  }
  META.saveVer=22;
}
/* v28 — 준위 2단계가 사라져 등급별 최대 진급 횟수가 줄었습니다.
   상한을 넘는 기존 기록은 새 상한으로 눌러 담고, 줄어든 만큼 카드로 돌려줍니다. */
function migrateSave28(){
  if(META.saveVer>=28) return;
  for(const [kind,slot] of [['unit','units'],['legend','legends']]){
    const m=META[slot]||{};
    for(const k in m){
      const r=m[k]; if(!r) continue;
      const mx=maxLvOf(kind,k);
      if((r.lv|0)>mx){ r.cards=(r.cards|0)+((r.lv|0)-mx)*stepCards(); r.lv=mx; }
    }
  }
  META.saveVer=28;
}
function metaSave(){ grantVelcaCore(); try{ CG_STORAGE.setItem('foi_meta',JSON.stringify(META)); }catch(e){} }
/* 카드 누적 → 강화 단계. 1장 획득 시 Lv1, 이후 2·5·10·20장마다 상승 */
const CARD_STEPS=[1,3,8,18,38];
function legendLv(k){ return (META.legends[k]||{}).lv|0; }
/* 카드를 1장이라도 확보하면 도감이 열리고 소환 대상이 됩니다 */
function legendOwned(){ return heroVisibleKeys().filter(k=>{
  const r=META.legends[k]||{}; return (r.cards|0)>0 || (r.lv|0)>0; }); }

/* ------------------------------ 아이템 ---------------------------------- */
const ITEM_SZ=33;                       // 필드에 놓일 때의 크기 (작게)
const ITEMS={
  PWR:   {img:'i_pwr',    c:'#E8B24A'},
  RATE:  {img:'i_rate',   c:'#E8A93C'},
  WAY:   {img:'i_way',    c:'#E8B33C'},
  SPD:   {img:'i_spd',    c:'#E8934A'},
  SHLD:  {img:'i_shld',   c:'#5BC8F0'},
  HEAL:  {img:'i_heal',   c:'#7FE87F'},
  SLOT:  {img:'i_slot',   c:'#E8C24A'},
  APWR:  {img:'i_apwr',   c:'#E8B33C'},
  FREEZE:{img:'i_ice',    c:'#7FD4E8'},
  POISON:{img:'i_poison', c:'#9BE87F'},
  FIRE:  {img:'i_fire',   c:'#E8724F'},
  SUMMON:{img:'i_summon', c:'#FFC24A', legendOnly:true},
};
const ITEM_KEYS=Object.keys(ITEMS);
/* 아이템 이름은 언어별로 꺼냅니다. 기존 ITEMS[k].name 호출부는 getter 로 살립니다. */
const itemName=k=>T('i'+k);
for(const k of ITEM_KEYS) Object.defineProperty(ITEMS[k],'name',{get:()=>itemName(k)});
const ELEMENTS=['FREEZE','POISON','FIRE'];
/* 속성탄은 같은 아이템을 3개까지 모으면 강해집니다.
   1개는 체감이 약하고, 3개도 과하지 않게 — 총알 수가 늘면 곱해지므로 일부러 낮게 잡았습니다. */
const ELEM_TUNE={
  FREEZE:[{mul:.86,ms:800},{mul:.74,ms:1050},{mul:.60,ms:1300}],
  POISON:[{tick:950,ms:1700},{tick:700,ms:2300},{tick:480,ms:2900}],
  FIRE  :[{r:26,f:.28},{r:40,f:.38},{r:54,f:.48}],
};
const elemLv = el => Math.min(3, S.elemStack[el]||0);
const elemCfg = el => ELEM_TUNE[el][Math.max(0,elemLv(el)-1)];
const ELEM_INFO={FREEZE:{c:'#7FD4E8'},POISON:{c:'#9BE87F'},FIRE:{c:'#E8724F'}};
for(const k of ELEMENTS) Object.defineProperty(ELEM_INFO[k],'name',{get:()=>T('e'+k)});

/* ------------------------------ 강화 ------------------------------------ */
/* 스테이지 강화 — 게임 오버 전까지 유지됩니다.
   필드 아이템(스테이지마다 초기화)과 역할이 겹치지 않게 나눴습니다. */
const UPGRADES=[
  {id:'dmg',  ic:'dmg',  t:'upDmg',
   ap:s=>s.upDmg++,   lv:s=>s.upDmg,   max:UPMAX.dmg},
  {id:'rate', ic:'rate', t:'upRate',
   ap:s=>s.upRate++,  lv:s=>s.upRate,  max:UPMAX.rate},
  {id:'move', ic:'move', t:'upMove',
   ap:s=>s.upMove++,  lv:s=>s.upMove,  max:UPMAX.move},
  {id:'armor',ic:'armor',t:'upArmor',
   ap:s=>s.upArmor++, lv:s=>s.upArmor, max:UPMAX.armor},
  {id:'cap',  ic:'cap',  t:'upCap',
   ap:s=>s.upCap++,   lv:s=>s.upCap,   max:UPMAX.cap},
  {id:'beam', ic:'beam', t:'upBeam',
   ap:s=>s.upBeam++,  lv:s=>s.upBeam,  max:UPMAX.beam},
  {id:'power',ic:'power',t:'upPower', dsArgs:()=>[TUNE.hpPerPower,TUNE.regenPerPower],
   ap:s=>{s.upPower++; s.hp=Math.min(maxHp(),s.hp+TUNE.hpPerPower);}, lv:s=>s.upPower, max:99},
  {id:'shld', ic:'shld', t:'upShld',
   ap:s=>s.startShield=true, lv:s=>s.startShield?1:0, max:1},
  {id:'squad',ic:'squad',t:'upSquad',
   ap:s=>s.upSquad++, lv:s=>s.upSquad, max:UPMAX.squad},
  {id:'scout',ic:'scout',t:'upScout',
   ap:s=>s.upScout++, lv:s=>s.upScout, max:UPMAX.scout},
];
/* 강화 카드 이름·설명은 그릴 때마다 현재 언어로 뽑습니다 */
for(const u of UPGRADES){
  Object.defineProperty(u,'nm',{get:()=>T(u.t+'N')});
  Object.defineProperty(u,'ds',{get:()=>T(u.t+'D', ...(u.dsArgs?u.dsArgs():[]))});
}

/* ================================ 상태 =================================== */
let S=null, mode='load', last=0, picksLeft=1, MODE_STORY=null;
const isTouch=MOBILE_DEVICE||navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
if(isTouch) document.body.classList.add('touch');

function newGame(storyId){
  MODE_STORY = storyId||null;
  S={stage:0,score:0,kills:0,captured:0,
     hp:TUNE.baseHp,
     // ↓ 필드 아이템 효과 — 스테이지를 클리어하면 전부 초기화됩니다
     shield:false,ways:1+relicVal('r_mag'),itemDmg:0,itemRate:0,spd:0,element:null,
     itemSlot:0,allyPwr:0, elemStack:{FREEZE:0,POISON:0,FIRE:0},
     // ↓ 스테이지 강화 — 게임 오버 전까지 유지됩니다
     upDmg:0,upRate:0,upMove:0,upArmor:0,upCap:0,upBeam:0,upPower:0,
     upSquad:0,upScout:0,startShield:false,
     upsTaken:{}, itemsTaken:{},
     revived:false,adBonusUsed:false,rerollUsed:false,
     theme:THEMES[0],runStart:performance.now(),
     px:WORLD.w/2,py:WORLD.h-260,vx:0,vy:0,face:-Math.PI/2,beamAng:-Math.PI/2,fireCd:0,beam:false,
     cam:{x:0,y:0},
     bullets:[],ebullets:[],enemies:[],allies:[],items:[],fx:[],turrets:[],props:[],
     base:null,phase:'hunt',killed:0,killNeed:0,warn:0,warnText:'',floorAds:[],
     story:null,storyStep:1,hits:0,itemGot:0,summonUsed:0,healUsed:0,stageStart:0,clearMs:0,
     /* 스토리부터 시작하는 사람도 처음이면 튜토리얼을 봅니다 */
     tutorial:!META.tutorialDone,tutStep:0,tutMsgMs:0,tutX:WORLD.w/2,tutY:WORLD.h-260,
     firstCaptureGuaranteed:!META.tutorialDone,tutorialTargetSpawned:false,
     tutorialItemSpawned:false,tutorialItemPicked:false,
     lasers:[],pending:{},legendCd:9000,
     gates:[],spawnCd:0,invuln:0,shake:0};
  startStage(1);
  cgBeginRankedRun();
}

function startStage(n){
  delete S.hero;
  S.rewardSettled=false; for(const ally of S.allies||[])ally.velcaSlow=0;
  if(S)delete S.velca;
  visualReset();
  S.stage=n;
  if(MODE_STORY){
    const i=storyIndex(MODE_STORY)+(S.storyStep||1)-1;
    S.story = STORY[Math.min(i,STORY.length-1)];
    S.theme = THEME_BY_ID[S.story.theme] || THEMES[0];
    S.stage = Math.max(1,Math.round(S.story.diff));   // 난이도는 진행 인덱스로 환산
  } else {
    /* 인피니티는 1스테이지만 지구, 이후는 네 행성을 무작위로 돕니다 */
    S.theme = n===1 ? THEMES[0] : THEMES[(Math.random()*THEMES.length)|0];
  }
  S.hits=0; S.itemGot=0; S.summonUsed=0; S.healUsed=0; S.stageStart=performance.now();
  setTimeout(musicSync,0);                     // 지구 / 화성 테마 전환
  /* 필드에서 주운 아이템 효과는 스테이지가 끝나면 전부 사라집니다 */
  S.element=null; S.elemStack={FREEZE:0,POISON:0,FIRE:0};
  S.ways=1+relicVal('r_mag'); S.itemDmg=0; S.itemRate=0; S.spd=0; S.itemSlot=0; S.allyPwr=0; S.shield=false;
  S.itemsTaken={};
  S.enemies.length=0; S.ebullets.length=0; S.bullets.length=0; S.items.length=0;
  if(S.hazards) S.hazards.length=0;
  S.stun=0; S.slowT=0; S.blind=0;
  S.allies.length=0;                                   // 편대는 스테이지마다 재편성
  S.px=WORLD.w/2; S.py=WORLD.h-260; S.face=-Math.PI/2; S.beamAng=-Math.PI/2;
  S.spawnCd=800; S.invuln=2000;
  /* 신규 적군이 쓰는 상태들 */
  S.hazards=[]; S.stun=0; S.slowT=0; S.blind=0;
  /* 보스 기지는 처음엔 없습니다. 적을 일정 수 제거해야 무작위 위치에 나타납니다. */
  S.phase='hunt'; S.base=null; S.turrets=[]; S.gates=[]; S.warn=0;
  S.lasers=[]; S.pending={}; S.legendCd=26000+Math.random()*20000;   // 포획 확정은 스테이지 클리어 시
  S.killed=0; S.killNeed=S.story?S.story.killNeed:killNeedFor(n);
  /* 기록실 통계 — 스테이지에 들어설 때마다 최고 도달 기록을 갱신합니다 */
  if(!S.story && n>(META.bestStage|0)){ META.bestStage=n; metaSave(); }
  buildProps();
  /* 스토리는 S.stage 가 난이도 값으로 바뀌므로 '첫 스테이지'로 판정합니다 */
  if(S.tutorial && (S.storyStep||1)===1 && n===1){
    S.tutStage=S.stage;                          // 튜토리얼이 도는 스테이지 번호
    S.spawnCd=999999; S.legendCd=999999; S.tutStep=0; S.tutX=S.px; S.tutY=S.py;
    S.tutorialTargetSpawned=false; S.tutorialItemSpawned=false; S.tutorialItemPicked=false; }
  if(S.startShield) S.shield=true;            // 상시 차폐: 매 스테이지 1개씩 새로 지급
  /* 정찰병 — 강화 수만큼 랜덤 아군을 데리고 시작합니다 */
  for(let i=0;i<S.upScout;i++){
    const t=HOSTILE[(Math.random()*HOSTILE.length)|0];
    const a=Math.random()*6.283;
    pushAlly(makeUnit(t, S.px+Math.cos(a)*70, S.py+Math.sin(a)*70, 'ally'));
  }
  mode='play';
  storyOnStart();
  cgGameplayStart();
}

const dmgOf   =()=>TUNE.baseDamage+S.itemDmg+S.upDmg+relicVal('r_core');
const fireMs  =()=>TUNE.baseFireMs*Math.pow(.86,S.itemRate)*Math.pow(.90,S.upRate)*(1-relicVal('r_cool')/100);
const speedOf =()=>TUNE.keySpeed*(1+S.spd*TUNE.spdPerStack)*(1+S.upMove*.08)*(1+relicVal('r_thrust')/100);
const maxHp   =()=>TUNE.baseHp+S.upPower*TUNE.hpPerPower;
const regenPs =()=>S.upPower*TUNE.regenPerPower+relicVal('r_nano');
const armorCut=()=>Math.min(.6,S.upArmor*.08+relicVal('r_armor')/100);
const allyCap =()=>Math.min(TUNE.allyCapMax+2, TUNE.allyCapBase+S.upSquad+S.itemSlot+relicVal('r_bay'));
const enemyDmgScale=()=>1+(S.stage-1)*TUNE.enemyDmgPerStage;
/* 흡수 성공률은 스테이지가 오를수록 떨어지고, 강화로 조금씩 되돌립니다 */
const capBase =()=>Math.max(TUNE.captureFloor, TUNE.captureChance-(S.stage-1)*TUNE.captureDropPerStage);
const capChance=u=>!canCaptureUnit(u)?0:u.isLegend?evoLegendCaptureChance():1;
const capFill =()=>1100*Math.pow(.88,S.upBeam)*(1-relicVal('r_tow')/100);
const beamW   =()=>TUNE.beamW+S.upBeam*10+(S.evoRange||0)*12;
const beamLen =()=>(TUNE.beamLen+S.upBeam*18+(S.evoRange||0)*25)*(1+relicVal('r_scan')/100);
/* 부채꼴 반각(라디안). 사각형이던 시절과 판정 면적이 같아지도록
   θ = Bw / L 로 잡았습니다 — 기본 약 22°, 빔 강화 5단계에서 약 25°. */
const beamArc =()=>Math.min(.62, beamW()/beamLen());
/* -π~π 로 접은 각도 차 */
function angGap(a,b){ let d=(a-b)%6.283185; if(d>3.141593)d-=6.283185; if(d<-3.141593)d+=6.283185; return Math.abs(d); }

/* ================================ 입력 =================================== */
const keys={};
// Physical key codes keep the movement cluster in the same place on QWERTY,
// AZERTY and QWERTZ. Arrow keys work in every layout, including left-hand mode.
function basicInputCode(code){
  return META.basicKeys==='ijkl'?({KeyI:'KeyW',KeyJ:'KeyA',KeyK:'KeyS',KeyL:'KeyD'}[code]||code):code;
}
function basicTypingTarget(target){return !!target?.closest?.('input,textarea,select,[contenteditable="true"]');}
addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey){clearBattleInput();return;}
  if(basicTypingTarget(e.target))return;
  if(e.code==='KeyP'&&!e.repeat&&S&&['play','pause'].includes(mode)){
    e.preventDefault();setPaused(mode==='play');return;
  }
  if(mode!=='play')return;
  if(e.target?.closest?.('button')&&['Space','Enter'].includes(e.code))return;
  const code=basicInputCode(e.code);
  if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code))return;
  keys[code]=true;e.preventDefault();
});
addEventListener('keyup',e=>{keys[basicInputCode(e.code)]=false;});

addEventListener('blur',()=>{ for(const k in keys)keys[k]=false;
  sticks.move.on=false; sticks.aim.on=false; mouse.down=false; if(mode==='play'){cgFocusPause=true;setPaused(true);cgFocusPause=false;} });

/* 모바일 트윈 스틱 — 왼쪽 절반은 이동, 오른쪽 절반은 흡수 조준+발동.
   손가락을 identifier로 따로 추적하므로 두 스틱을 동시에 쓸 수 있고,
   한쪽을 떼도 다른 쪽 입력이 끊기지 않습니다. */
const STICK={r:58/.76, dead:9/.76};
const sticks={ move:{on:false,id:null,ox:0,oy:0,x:0,y:0},
               aim :{on:false,id:null,ox:0,oy:0,x:0,y:0} };
const HOME={ move:{x:100,y:H-116}, aim:{x:W-100,y:H-116} };   // applyViewport에서 갱신
function localPt(cx,cy){
  const r=cv.getBoundingClientRect();
  if(!ROTATED) return {x:(cx-r.left)*(W/r.width), y:(cy-r.top)*(H/r.height)};
  /* 90도 돌린 상태에서는 getBoundingClientRect() 가 회전된 '바깥 상자'를
     돌려주므로, 정규화한 뒤 축을 되돌려야 터치 위치가 맞습니다.
     rotate(90deg) 는 캔버스 +x 를 화면 아래로, +y 를 화면 왼쪽으로 보냅니다. */
  const u=(cx-r.left)/r.width, v=(cy-r.top)/r.height;
  return {x:v*W, y:(1-u)*H};
}
function stickVec(s){
  if(!s.on) return {x:0,y:0,len:0};
  const dx=s.x-s.ox, dy=s.y-s.oy, d=Math.hypot(dx,dy);
  if(d<STICK.dead) return {x:0,y:0,len:0};
  return {x:dx/d, y:dy/d, len:Math.min(1,d/STICK.r)};
}
cv.addEventListener('touchstart',e=>{ e.preventDefault();
  if(document.body.classList.contains('warnRotate') && innerWidth>innerHeight && innerHeight<560) return;
  for(const t of e.changedTouches){
    const p=localPt(t.clientX,t.clientY);
    const s = p.x < W/2 ? sticks.move : sticks.aim;
    if(s.on) continue;                       // 이미 그 스틱을 쓰는 손가락이 있으면 무시
    s.on=true; s.id=t.identifier; s.ox=p.x; s.oy=p.y; s.x=p.x; s.y=p.y;
  }
  $('hint').style.opacity='0';
},{passive:false});
cv.addEventListener('touchmove',e=>{ e.preventDefault();
  for(const t of e.changedTouches)
    for(const s of [sticks.move,sticks.aim])
      if(s.on && s.id===t.identifier){ const p=localPt(t.clientX,t.clientY); s.x=p.x; s.y=p.y; }
},{passive:false});
function endTouch(e){
  for(const t of e.changedTouches)
    for(const s of [sticks.move,sticks.aim])
      if(s.on && s.id===t.identifier){ s.on=false; s.id=null; }
}
cv.addEventListener('touchend',endTouch);
cv.addEventListener('touchcancel',endTouch);

/* 데스크톱 — 마우스가 흡수빔 방향을 조준하고, 스페이스나 클릭으로 발동합니다 */
const mouse={x:W/2,y:H/2,down:false,moved:false};
cv.addEventListener('mousemove',e=>{ const p=localPt(e.clientX,e.clientY);
  mouse.x=p.x; mouse.y=p.y; mouse.moved=true; });
cv.addEventListener('mousedown',e=>{ e.preventDefault(); mouse.down=true; $('hint').style.opacity='0'; });
addEventListener('mouseup',()=>{ mouse.down=false; });
cv.addEventListener('contextmenu',e=>e.preventDefault());

function clampPlayer(){
  S.px=Math.max(24,Math.min(WORLD.w-24,S.px));
  S.py=Math.max(24,Math.min(WORLD.h-24,S.py));
  const o={x:S.px,y:S.py};                     // 플레이어 좌표는 px/py라 변환이 필요합니다
  resolveProps(o,16,false);                    // 언덕·벽·기지를 통과할 수 없습니다
  S.px=Math.max(24,Math.min(WORLD.w-24,o.x));
  S.py=Math.max(24,Math.min(WORLD.h-24,o.y));
}

/* ================================ 스폰 =================================== */
/* 흡수한 유닛은 스테이지 보정을 받지 않는 고정 스탯입니다.
   (높은 스테이지에서 잡아도 같은 성능 — 대신 나중에 메인 화면의
    유닛 업그레이드 수치를 여기 UNIT_LV에 넣으면 그대로 반영됩니다) */
/* 일반 유닛 도감 — 카드를 모아 강화하면 '흡수했을 때만' 강해집니다.
   적으로 나올 때는 아무 영향이 없습니다. */
/* ==================== 등급 · 뽑기 · 성장 경제 ==========================
   유닛은 이름별이 아니라 등급별로 뽑습니다. 등급 안에서는 균등 확률입니다.
   가중치 합계는 10000이라 그대로 만분율로 읽으면 됩니다. */
const GRADES={
  C:{i:'C', c:'#9FB0A6', w:5500},   // COMMON     55%
  R:{i:'R', c:'#5FD07A', w:2800},   // RARE       28%
  E:{i:'E', c:'#5BC8F0', w:1200},   // ELITE      12%
  P:{i:'P', c:'#C08CFA', w:450},    // EPIC        4.5%
  L:{i:'L', c:'#FFD75A', w:50},     // LEGENDARY   0.5%
};
const GRADE_ORDER=['C','R','E','P','L'];
/* 체력·화력·점수를 기준으로 16종을 4등급에 4기씩 배분했습니다 */
const UNIT_GRADE={
  infantry:'C', apc:'C', e_hawk:'C', e_guard:'C',
  heli:'R', tank:'R', e_rider:'R', e_missile:'R',
  legend_bike:'E', legend_ship:'E', e_scout:'E', e_sentry:'E',
  e_rocket:'P', e_bruiser:'P', e_hover:'P', e_warbrute:'P',
  /* v32 신규 — 등장 시점과 위력에 맞춰 배분했습니다 */
  e_spike:'R', e_volt:'E', e_mole:'P', e_flak:'P', e_wasp:'P',
};
const UNIT_POOL=Object.keys(UNIT_GRADE);
const gradeOf=k=>LEGENDS[k]?'L':(UNIT_GRADE[k]||'C');
const gradeName=g=>T('grade'+g);
const gradeColor=g=>GRADES[g].c;

const UNIT_COST=60, UNIT_COST10=Math.round(60*10*0.9);      // 10연차 10% 할인
function unitRoll(){
  let r=Math.random()*10000, acc=0, g='C';
  for(const k of GRADE_ORDER){ acc+=GRADES[k].w; if(r<acc){ g=k; break; } }
  if(g==='L') return {legend:true, grade:'L', key:heroLegendRoll()};
  const pool=UNIT_POOL.filter(k=>UNIT_GRADE[k]===g);
  return {legend:false, grade:g, key:pool[(Math.random()*pool.length)|0]};
}
function unitOdds(){
  return GRADE_ORDER.map(g=>gradeName(g)+' '+(GRADES[g].w/100).toFixed(1)+'%').join(' · ');
}

/* ---- 카드 + 크레딧 성장 --------------------------------------------------
   뽑기로 얻은 카드는 바로 강해지지 않습니다. 카드와 크레딧을 함께 써야
   단계가 오르고, 쓴 카드는 소모됩니다. 크레딧을 계속 벌어야 하는 구조입니다. */
/* ==================== 계급 (미 육군 기준) ================================
   Web 주 이용자가 영어권이라 미 육군 계급을 그대로 씁니다.
   카드 5장을 모을 때마다 1계급 올라갑니다. 화면에는 현재 계급장과
   그 아래에 다음 계급까지의 진행 표시(●●●●○) 4칸을 그립니다.
   pip 4개가 차고 5번째 카드를 쓰면 계급이 오르는 구조입니다. */
const PIPS=4;                                  // 계급 사이의 중간 단계 수
/* 병 → 부사관 → 위관 → 영관 → 장성으로 곧게 이어지는 19단계.
   준위(WO/CWO)는 미 육군에서 별도 병과 트랙이라 진급 경로에서 뺐습니다. */
const RANKS=[
  {k:'PVT', ab:'PVT', t:'rkPVT'},   {k:'PFC', ab:'PFC', t:'rkPFC'},
  {k:'CPL', ab:'CPL', t:'rkCPL'},   {k:'SGT', ab:'SGT', t:'rkSGT'},
  {k:'SSG', ab:'SSG', t:'rkSSG'},   {k:'SFC', ab:'SFC', t:'rkSFC'},
  {k:'MSG', ab:'MSG', t:'rkMSG'},   {k:'SGM', ab:'SGM', t:'rkSGM'},
  {k:'2LT', ab:'2LT', t:'rk2LT'},   {k:'1LT', ab:'1LT', t:'rk1LT'},
  {k:'CPT', ab:'CPT', t:'rkCPT'},   {k:'MAJ', ab:'MAJ', t:'rkMAJ'},
  {k:'LTC', ab:'LTC', t:'rkLTC'},   {k:'COL', ab:'COL', t:'rkCOL'},
  {k:'BG',  ab:'BG',  t:'rkBG'},    {k:'MG',  ab:'MG',  t:'rkMG'},
  {k:'LTG', ab:'LTG', t:'rkLTG'},   {k:'GEN', ab:'GEN', t:'rkGEN'},
  {k:'GA',  ab:'GA',  t:'rkGA'},
];
const RANK_INDEX={}; RANKS.forEach((r,i)=>RANK_INDEX[r.k]=i);
/* 등급별 시작 계급 — 잘 모이는 등급일수록 아래에서 시작합니다 */
const GRADE_START={C:'PVT', R:'SGT', E:'SGM', P:'CPT', L:'COL'};
/* 등급별 상한. 전투력은 '지금 몇 계급인가'를 그대로 따라갑니다.
   같은 계급이면 등급이 달라도 힘이 비슷하고, 등급은
   ① 어디서 시작하는지 ② 어디까지 올라갈 수 있는지 ③ 소폭의 품질 프리미엄
   으로 구분됩니다. 그래서 커먼을 끝까지 키운 준장은
   레어 준장 · 엘리트 대령 · 에픽 중령과 비슷한 힘을 냅니다. */
/* 등급 사다리를 '이어 붙여' 놓았습니다 — 한 등급을 만렙으로 키우면
   바로 위 등급의 시작점과 같아집니다. 커먼을 아무리 키워도 레어 신규를
   넘지 못하므로, 왜 상위 등급이 필요한지가 숫자로 드러납니다. */
/* 사다리가 19단계로 줄어든 만큼 1계급당 상승분을 0.040 → 0.045 로 올려
   등급별 시작·만렙 전투력과 교차점을 이전과 거의 같게 유지합니다. */
const RANK_STEP=0.045;                    // 계급 1단계당 전투력 상승분
const GRADE_TIER={
  C:{cap:'BG',  bonus:0.000},  // 이등병 → 준장 : 14계급 · ×1.00 ~ 1.63
  R:{cap:'MG',  bonus:0.020},  // 병장   → 소장 : 12계급 · ×1.16 ~ 1.70
  E:{cap:'LTG', bonus:0.045},  // 원사   → 중장 :  9계급 · ×1.36 ~ 1.77
  P:{cap:'GEN', bonus:0.090},  // 대위   → 대장 :  7계급 · ×1.54 ~ 1.86
  L:{cap:'GA',  bonus:0.135},  // 대령   → 원수 :  5계급 · ×1.72 ~ 1.95
};
function startRank(g){ return RANK_INDEX[GRADE_START[g]]; }
function capRank(g){ return RANK_INDEX[GRADE_TIER[g].cap]; }
function maxSteps(g){ return capRank(g)-startRank(g); }        // 등급별 총 계급 상승 횟수
const MAXLV=99;                                                // 등급별로 따로 판정합니다
/* 계급 1단계에 필요한 카드는 PIPS+1 = 5장으로 고정하고,
   비용은 계급이 오를수록 완만하게 늘립니다. */
function stepCards(){ return PIPS+1; }
function stepCred(kind,g,step){
  /* 계급이 많은 등급일수록 사다리가 길어서, 회당 증가율은 완만하게 잡았습니다.
     끝까지 올리는 총비용은 커먼 5,100 / 레어 5,900 / 엘리트 5,500 /
     에픽 3,900 / 레전더리 12,000 크레딧 수준입니다. */
  const b={unit:120, legend:420}[kind]||120;
  const gm={C:1.0, R:1.5, E:2.2, P:3.2, L:4.5}[g]||1;
  return Math.round(b*gm*Math.pow(1.12,step)/10)*10;
}
/* 레벨이 40단계까지 늘어 고정 표 대신 완만한 곡선을 씁니다.
   초반은 가볍고, 뒤로 갈수록 한 단계가 무거워집니다. */
/* 레벨 수가 5~7단계에서 16~40단계로 늘었으므로, 한 단계의 부담을 그만큼
   낮춰 '끝까지 올리는 총비용'은 이전과 비슷하게 유지합니다.
   총액 — 일반 220장/23,000 · 희귀 147장/13,600 · 영웅 90장/7,600 · 전설 45장/3,900 */
function relicCards(lv){ return Math.max(1, Math.round(1.2+lv*0.22)); }
function relicCred(lv){ return Math.round(150*Math.pow(1.06,lv)/10)*10; }
const KINDMAP={unit:'units', legend:'legends', relic:'relics'};
function recOf(kind,k){
  const m=META[KINDMAP[kind]]; m[k]=m[k]||{cards:0,lv:0};
  if(m[k].lv===undefined) m[k].lv=0;
  if(m[k].cards===undefined) m[k].cards=0;
  return m[k];
}
const cardsOf =(kind,k)=>recOf(kind,k).cards|0;
/* 현재 계급 인덱스와 배수 */
function rankIdx(kind,k){
  const g=gradeOf(k);
  return Math.min(capRank(g), startRank(g)+(recOf(kind,k).lv|0));
}
function rankOf(kind,k){ return RANKS[rankIdx(kind,k)]; }
function rankName(kind,k){ return T(rankOf(kind,k).t); }
/* 아군일 때 붙는 능력 배수 = 1 + (현재 계급 × 계급당 상승분) + 등급 프리미엄.
   계급이 같으면 등급이 달라도 힘이 비슷하다는 점이 핵심입니다. */
function powerMul(kind,k){
  const g=gradeOf(k);
  return 1 + RANK_STEP*rankIdx(kind,k) + GRADE_TIER[g].bonus;
}
/* 계급이 오르면 사격 방식이 조금씩 달라집니다 — 세지기보다 '달라지는' 쪽입니다.
   3계급마다 탄이 1발 늘고, 대신 발당 위력이 나뉘어 총 화력은 완만하게만 오릅니다. */
function rankWays(kind,k){
  const g=gradeOf(k), n=maxSteps(g);
  const st=Math.min(recOf(kind,k).lv|0, n);
  /* 사다리의 40% · 80% 지점에서 탄이 1발씩 늘어납니다. 등급마다 계급 수가
     달라도 체감 시점이 같도록 비율로 잡았습니다. 에픽·레전더리는 기본 1발 더. */
  let w = 1 + ((g==='P'||g==='L')?1:0);
  if(n>0){ if(st>=Math.ceil(n*0.4)) w++; if(st>=Math.ceil(n*0.8)) w++; }
  return w;
}
function rankHoming(kind,k){
  const g=gradeOf(k), n=maxSteps(g);
  const st=Math.min(recOf(kind,k).lv|0, n);
  return (g==='P'||g==='L') && st>=Math.ceil(n*0.5);   // 상위 등급만 사다리 절반에서 유도탄
}
const hasOf   =(kind,k)=>{ const r=recOf(kind,k); return (r.cards|0)>0 || (r.lv|0)>0; };
/* 유물은 계급이 아니라 별도 곡선입니다 (RELIC_MAXLV 는 위에서 정의).
   최대 레벨을 끝낸 유물이 또 나오면 카드를 쌓지 않고 아스트라늄으로 돌려줍니다. */
const RELIC_REFUND={N:1, R:2, SR:5, SSR:12};

function maxLvOf(kind,k){
  if(kind==='relic') return relicMax(k);
  return maxSteps(gradeOf(k));
}
function needCard(kind,k,lv){
  if(kind==='relic') return lv>=relicMax(k)?0:relicCards(lv);
  return stepCards();
}
function needCred(kind,k,lv){
  if(kind==='relic') return lv>=relicMax(k)?0:relicCred(lv);
  return stepCred(kind, gradeOf(k), lv);
}
function canUp(kind,k){
  if(k===VELCA_CORE_KEY)return false;
  const r=recOf(kind,k), lv=r.lv|0;
  if(lv>=maxLvOf(kind,k)) return false;
  return (r.cards|0)>=needCard(kind,k,lv) && META.credits>=needCred(kind,k,lv);
}
function doUp(kind,k){
  if(!canUp(kind,k)) return false;
  const r=recOf(kind,k), lv=r.lv|0;
  r.cards-=needCard(kind,k,lv); META.credits-=needCred(kind,k,lv); r.lv=lv+1;
  metaSave(); return true;
}
/* 카드 적립. 유물이 이미 최대 레벨이면 아스트라늄으로 환급합니다. */
function addCard(kind,k,n){
  if(HEROES[k]&&!heroUnlocked())return {refunded:0,rec:null};
  if(k===VELCA_CORE_KEY)return {refunded:0,rec:null};
  n=n||1;
  const r=recOf(kind,k);
  if(kind==='relic' && (r.lv|0)>=relicMax(k)){
    const back=RELIC_REFUND[RELICS[k].ra]*n;
    META.astranium+=back;
    return {refunded:back, rec:r};
  }
  r.cards=(r.cards|0)+n;
  return {refunded:0, rec:r};
}
function unitLv(k){ return (META.units[k]||{}).lv|0; }
/* 아군으로 전환됐을 때 붙는 체력·화력 배수 */
function unitBoost(k){ return powerMul('unit',k); }

function makeUnit(type,x,y,side){
  if(VELCARION[type])return side==='enemy'?makeVelcarion(type,x,y):side==='ally'?makeVelcaAlly(type,x,y):null;
  const d=UNITS[type], n=S.stage;
  const lv = side==='ally' ? unitLv(type) : 0;          // 적으로 나올 땐 강화가 적용되지 않습니다
  /* 계급 배수는 아군일 때만 붙습니다. 등급이 높을수록 기본치와 계급당
     상승폭이 모두 커서, 커먼을 끝까지 키워도 에픽 초반을 넘지 못합니다. */
  const mul = side==='ally' ? unitBoost(type) : 1;
  const sc = side==='ally' ? mul : 1+(n-1)*TUNE.enemyHpPerStage;
  /* 계급이 오르면 사격 방식이 조금씩 바뀝니다 — 탄수가 늘고 상위 등급은 유도가 붙습니다.
     발당 위력은 탄수로 나눠 총 화력이 급격히 튀지 않게 했습니다. */
  const rw = side==='ally' ? rankWays('unit',type) : (d.ways||1);
  const rh = side==='ally' ? (d.homing||rankHoming('unit',type)) : !!d.homing;
  // 중립(레전드)은 fire를 0으로 못박아, 유저가 먼저 쏘더라도 절대 반격하지 않습니다
  return {type,...d, side, lv, fire: side==='neutral'?0:d.fire,
    ways:rw, homing:rh, spread:(d.spread||.12),
    rankMul:mul,
    hp:Math.ceil(d.hp*sc), hpMax:Math.ceil(d.hp*sc),
    x,y, face:Math.PI/2, fireCd:600+Math.random()*d.fire,
    fireGap:d.fire*(side==='enemy'?Math.max(.85,1.20-(n-1)*.022):.85),   // 적 공격속도 아주 소폭 상승
    cap:0,resist:0,slow:0,poison:0,poisonCd:0,t:Math.random()*400,
    life:d.legend&&side==='neutral'?TUNE.legendLifeMs:0, bob:Math.random()*6.28};
}
/* 플레이어 주변 화면 밖에서 스폰 → 서바이버 방식으로 몰려옵니다 */
/* ---------------------------- 지형 구조물 ------------------------------ */
/* 언덕·벽은 지상 유닛과 탄환을 막습니다. 비행 유닛은 넘어다닙니다. */
function propAt(x,y,key){
  const sp=PROP_SPEC[key], img=IMG[key];
  const w=sp.w, h=img ? w*img.height/img.width : w*0.66;
  return {key,x,y,w,h, rx:w*sp.rx, ry:h*sp.ry};
}
function farFromAll(x,y,list,pad){
  for(const p of list) if(Math.hypot(p.x-x,p.y-y) < p.rx+p.ry+pad) return false;
  return true;
}
function buildProps(){
  S.props=[];
  const set=S.theme.props, n=Math.min(16, 9+S.stage);
  let guard=0;
  while(S.props.length<n && guard++<600){
    const key=set[(Math.random()*set.length)|0];
    const x=90+Math.random()*(WORLD.w-180), y=90+Math.random()*(WORLD.h-180);
    if(Math.hypot(x-S.px,y-S.py)<420) continue;          // 시작 지점은 비워둡니다
    if(!farFromAll(x,y,S.props,120)) continue;
    S.props.push(propAt(x,y,key));
  }
  /* 전광판은 맵 가장자리에 2~3개 세웁니다 (이동을 막는 구조물) */
  const nb=2+((Math.random()*2)|0);
  guard=0;
  while(S.props.filter(p=>p.key==='ad_board').length<nb && guard++<300){
    const edge=(Math.random()*4)|0;
    let x,y;
    if(edge===0){ x=140+Math.random()*(WORLD.w-280); y=130+Math.random()*90; }
    else if(edge===1){ x=140+Math.random()*(WORLD.w-280); y=WORLD.h-130-Math.random()*90; }
    else if(edge===2){ x=130+Math.random()*90; y=160+Math.random()*(WORLD.h-320); }
    else { x=WORLD.w-130-Math.random()*90; y=160+Math.random()*(WORLD.h-320); }
    if(Math.hypot(x-S.px,y-S.py)<460) continue;
    if(!farFromAll(x,y,S.props,150)) continue;
    S.props.push(propAt(x,y,'ad_board'));
  }
  /* 바닥 광고는 그냥 지나다닐 수 있는 장식입니다 */
  S.floorAds=[];
  const nf=3+((S.stage/6)|0);
  guard=0;
  while(S.floorAds.length<nf && guard++<300){
    const x=120+Math.random()*(WORLD.w-240), y=120+Math.random()*(WORLD.h-240);
    if(Math.hypot(x-S.px,y-S.py)<200) continue;
    const img=IMG.ad_floor;
    const w=AD_FLOOR_W, h=img?w*img.height/img.width:w*.68;
    if(S.floorAds.some(f=>Math.hypot(f.x-x,f.y-y)<w*1.2)) continue;
    S.floorAds.push({x,y,w,h});
  }
}
/* 타원 밖으로 밀어냅니다 */
function resolveProps(o,rad,flying){
  if(flying) return;
  for(const p of S.props){
    const RX=p.rx+rad*.6, RY=p.ry+rad*.6;
    let dx=(o.x-p.x)/RX, dy=(o.y-p.y)/RY;
    let d=Math.hypot(dx,dy);
    if(d<1e-4){ o.x=p.x+RX; o.y=p.y; continue; }   // 정중앙에 끼면 옆으로 빼냅니다
    if(d<1){ const k=1/d; o.x=p.x+dx*RX*k; o.y=p.y+dy*RY*k; }
  }
  if(S.base){
    const b=S.base;
    const RX=b.rx+rad*.6, RY=b.ry+rad*.6;
    let dx=(o.x-b.x)/RX, dy=(o.y-b.y)/RY, d=Math.hypot(dx,dy);
    if(d<1e-4){ o.x=b.x; o.y=b.y+RY; return; }
    if(d<1){ const k=1/d; o.x=b.x+dx*RX*k; o.y=b.y+dy*RY*k; }
  }
}
function blockedByProp(x,y){
  for(const p of S.props){
    const dx=(x-p.x)/p.rx, dy=(y-p.y)/p.ry;
    if(dx*dx+dy*dy<1) return true;
  }
  return false;
}

/* ------------------------- 보스 기지 출현 ------------------------------- */
function spawnBase(){
  if(heroBossStage())return heroSpawnBoss();
  const thp=S.stage===1?6:12+(S.stage-1)*4;
  let x,y,guard=0;
  do{
    x=220+Math.random()*(WORLD.w-440);
    y=200+Math.random()*(WORLD.h-400);
    guard++;
  }while(guard<400 && (Math.hypot(x-S.px,y-S.py)<820 || !farFromAll(x,y,S.props,150)));
  const b=propAt(x,y,S.theme.base);
  b.gateT=1800; b.open=false;
  S.base=b;
  S.turrets=[0,1,2,3].map(i=>({i, x:x+(i-1.5)*84, y:y+112,
    hp:thp,hpMax:thp,alive:true,fireCd:1100+i*430,flash:0}));
  S.phase='boss'; S.warn=3400; S.warnText=T('warnBase');
  musicPlay('boss');                            // 기지 출현 — 공성 테마
  noise(.5,.10); blip(150,.6,'sawtooth',.08);
}

/* 유닛 해금을 천천히 — 초반 스테이지가 갑자기 어려워지지 않게 */
function pickType(n){
  const pool=[];
  /* 기본 유닛은 후반으로 갈수록 비중이 줄어듭니다 */
  const baseW = n<=10 ? 3 : n<=25 ? 2 : 1;
  for(let i=0;i<baseW;i++) pool.push('infantry');
  if(n>=2) pool.push('apc');
  if(n>=3) pool.push('heli');
  if(n>=4) pool.push('apc','heli');
  if(n>=5) pool.push('tank');
  if(n>=6) pool.push('legend_bike');
  if(n>=7) pool.push('tank');
  if(n>=9) pool.push('legend_ship');
  /* 신규 정규군 — 한 번 등장한 유닛은 이후 스테이지에서 사라지지 않습니다.
     데뷔(from) 이후 서서히 늘어 전성기(mid)에 가장 많이 나오고,
     그 뒤로는 줄어들되 최소 1장은 계속 남습니다.
     예전에는 to 를 넘으면 풀에서 완전히 빠져, 61스테이지부터는
     기본 6종만 나오는 구멍이 있었습니다. */
  for(const k of NEW_FOES){
    const d=UNITS[k];
    if(n<d.from) continue;
    const to=d.to||(d.from+10);
    const mid=(d.from+to)/2, span=Math.max(1,(to-d.from)/2);
    const w = n<=mid
      ? Math.max(1, Math.round(1+3*(n-d.from)/span))     // 데뷔 → 전성기 : 1 → 4
      : Math.max(1, Math.round(4-3*(n-mid)/span));       // 전성기 이후  : 4 → 1 (바닥 1)
    for(let i=0;i<w;i++) pool.push(k);
  }
  if(!pool.length) pool.push('infantry');
  return pool[(Math.random()*pool.length)|0];
}
/* 레전드는 중립으로 등장합니다. 시간 제한이 없고 아무도 공격하지 않습니다. */
function makeLegend(key,x,y,side){
  if(HEROES[key])return makeHero(key,x,y,side);
  const d=LEGENDS[key], lv=legendLv(key);
  /* 레전드도 계급으로 성장합니다 (대령 → 원수) */
  const mult = side==='ally' ? powerMul('legend',key) : 1;
  const rst = side==='ally' ? Math.min(recOf('legend',key).lv|0, maxSteps('L')) : 0;
  const rcd = 1; // Permanent rank strength is bounded in powerMul.
  return {type:key, legendKey:key, img:d.img, label:d.name, side, x, y, w:d.w, r:d.r,
    flying:!!d.flying, armor:d.armor||0, spd:d.spd, isLegend:true,
    hp:Math.round(d.hp*mult), hpMax:Math.round(d.hp*mult), lv,
    dmgMul:mult, deathBoom:d.deathBoom||0,
    /* 계급이 오르면 재장전이 조금씩 빨라집니다 — 위력(dmgMul)과 별개로
       '공격 방식이 달라지는' 체감을 주되, 최대 25%까지만 줄입니다. */
    wep:d.weapons.map(w=>{ const cd=Math.round(w.cd*rcd);
      return Object.assign({},w,{cd, cd0:cd, t0:Math.random()*cd, on:0, seek:[]}); }),
    face:Math.PI/2, cap:0, resist:0, slow:0, poison:0, t:Math.random()*400, bob:Math.random()*6.28,
    fire:0, score:5000, life:0};
}
function spawnLegend(){
  let pool=legendsForStage(S.stage);
  if(S.story) pool=LEGEND_KEYS.filter(k=>LEGEND_REGION[k]===(S.story.mars?'M':'E'));
  if(!pool.length) return;
  const key=pool[(Math.random()*pool.length)|0];
  const a=Math.random()*6.283, d=430+Math.random()*220;
  let x=Math.max(60,Math.min(WORLD.w-60,S.px+Math.cos(a)*d));
  let y=Math.max(60,Math.min(WORLD.h-60,S.py+Math.sin(a)*d));
  S.enemies.push(makeLegend(key,x,y,'neutral'));
  S.warn=3200; S.warnText=T('warnLegend',nm(key));
  noise(.4,.08); blip(520,.5,'triangle',.07); blip(780,.6,'triangle',.05);
}

function spawnAroundPlayer(){
  if(S.enemies.length>=TUNE.enemyCap) return;
  const type = pickType(S.stage);
  const a=Math.random()*6.283, d=430+Math.random()*160;
  let x=S.px+Math.cos(a)*d, y=S.py+Math.sin(a)*d;
  x=Math.max(40,Math.min(WORLD.w-40,x)); y=Math.max(40,Math.min(WORLD.h-40,y));
  if(!velcaSpawnInstead(x,y)) S.enemies.push(makeUnit(type,x,y,'enemy'));
}

/* 편대는 일반 흡수 유닛과 레전드를 '따로' 관리합니다.
   일반 유닛을 아무리 흡수해도 레전드가 밀려나지 않고, 그 반대도 마찬가지입니다.
   각 칸이 가득 찬 상태에서 새로 들어오면 그쪽 계열의 가장 먼저 들어온 유닛만 교체됩니다. */
function rosterCount(isL){ let n=0; for(const a of S.allies) if(!!a.isLegend===isL) n++; return n; }
function pushAlly(u){
  if(!u||(isVelcarion(u)&&!ownsVelcaCore()))return false;
  S.allies.push(u);
  const isL=!!u.isLegend;
  while(rosterCount(isL)>allyCap()){
    const old=S.allies.find(a=>!!a.isLegend===isL);
    if(!old) break;
    S.allies.splice(S.allies.indexOf(old),1);
    S.fx.push({k:'ring',x:old.x,y:old.y,r:4,max:46,life:420,t:420,c:isL?'#FFC24A':'#5B9BE8'});
    S.fx.push({k:'txt',x:old.x,y:old.y,life:900,t:900,
      s:isL?(nm(old.legendKey||old.type)+' '+T('swapped')):T('retired'), c:isL?'#FFC24A':'#5B9BE8'});
  }
}
/* 흡수 성공 → 그 자리에서 즉시 아군으로 전환 */
function convertToAlly(u){
  if(isVelcarion(u))return convertVelcaToAlly(u);
  const a=makeUnit(u.type,u.x,u.y,'ally');
  a.hp=a.hpMax; a.face=u.face;
  pushAlly(a);
}

/* ============================== 튜토리얼/일시정지 ======================== */
function clearBattleInput(){for(const k in keys)keys[k]=false;sticks.move.on=false;sticks.aim.on=false;mouse.down=false;}
function setPaused(on){
  if(on&&mode==='play'){
    S.pauseAt=performance.now();clearBattleInput();mode='pause';cgGameplayStop();renderPauseSettings();$('pausePanel').classList.add('on');
    $('btResume').focus({preventScroll:true});
  }else if(!on&&mode==='pause'){
    const now=performance.now(),elapsed=Math.max(0,now-(S.pauseAt??now));S.stageStart+=elapsed;S.runStart+=elapsed;delete S.pauseAt;
    clearBattleInput();mode='play';last=now;$('pausePanel').classList.remove('on');cgGameplayStart();$('gameSettings').focus({preventScroll:true});
  }
  syncGameSettings();cgSyncIdentity();
}
function setBattleSound(on){
  if(on&&!actx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)actx=new AC();}
  if(!actx)return;
  if(on&&actx.state==='suspended')actx.resume().catch(()=>{});
  soundOn=!!on;$('snd').classList.toggle('on',soundOn);
  if(soundOn){audioInit();musicPlay(musicForScene(),true);}else stopMusic();
}
function renderPauseSettings(){
  const root=$('pauseSettings');root.replaceChildren();$('pauseTitle').textContent=T('pauseSettings');
  $('btResume').textContent=T('resume');$('btPauseMenu').textContent=T('toMenu');
  const row=(label,control)=>{const d=document.createElement('label');d.className='battle-setting';const text=document.createElement('span');text.textContent=label;d.append(text,control);root.append(d);};
  const sound=document.createElement('button');sound.id='pauseSound';sound.textContent=soundOn?T('on'):T('off');sound.onclick=()=>{setBattleSound(!soundOn);sound.textContent=soundOn?T('on'):T('off');};row(T('sound'),sound);
  const slider=(id,label,value,change)=>{const box=document.createElement('div');box.className='battle-volume';const out=document.createElement('output'),input=document.createElement('input');input.id=id;input.type='range';input.min=0;input.max=100;input.step=5;input.value=Math.round(value*100);input.setAttribute('aria-label',label);out.textContent=input.value+'%';out.htmlFor=id;input.oninput=()=>{out.textContent=input.value+'%';change(+input.value/100);applyVolumes();metaSave();};box.append(input,out);row(label,box);};
  slider('pauseMusic',T('volMusic'),VOL_MUS,v=>{VOL_MUS=v;META.volMus=v;});
  slider('pauseSfx',T('volSfx'),VOL_SFX,v=>{VOL_SFX=v;META.volSfx=v;});


  storyPauseControls();
  $("pauseSettings").append(teamShotLegend());
  const callsign=document.createElement("p");callsign.className="cg-note";callsign.textContent=cgDisplayName();$("pauseSettings").prepend(callsign);
}
let settingsScene=null;
function syncGameSettings(){

  if(settingsScene===mode)return;settingsScene=mode;const gear=$('gameSettings');if(!gear)return;
  gear.hidden=!['play','pause'].includes(mode);gear.setAttribute('aria-label',T('pauseSettings'));gear.setAttribute('aria-expanded',String(mode==='pause'));
}

function spawnTutorialTarget(){
  if(!S||!S.tutorial||S.tutStep!==1) return;
  if(S.enemies.some(e=>e.tutorial)) return;
  const e=makeUnit('infantry',S.px+125,S.py-95,'neutral');
  e.life=99999999; e.tutorial=true; e.hp=e.hpMax=9999; e.label=T('trainUnit');
  e.spd=Math.min(e.spd,.45);
  S.enemies.push(e); S.tutorialTargetSpawned=true;
  S.fx.push({k:'txt',x:e.x,y:e.y-30,life:1700,t:1700,s:T('tutCapMsg'),c:'#FFD75A'});
}
function spawnTutorialItem(){
  if(!S||S.tutorialItemSpawned) return;
  const a=-.55, d=135;
  S.items.push({k:'PWR',x:S.px+Math.cos(a)*d,y:S.py+Math.sin(a)*d,t:0,tutorial:true});
  S.tutorialItemSpawned=true;
  S.fx.push({k:'txt',x:S.px+Math.cos(a)*d,y:S.py+Math.sin(a)*d-28,life:2300,t:2300,
    s:T('tutItemMsg'),c:'#7FE87F'});
}
function tutorialItemName(k){ return itemName(k); }
function tutorialItemGrid(){
  return ITEM_KEYS.map(k=>`<div class="icard"><img src="${ART[ITEMS[k].img]}" alt=""><span>${tutorialItemName(k)}</span></div>`).join('');
}
function showTutorialOverlay(kind){
  if(!S||!S.tutorial) return;
  mode='tutorialOverlay'; cgGameplayStop();
  const ov=$('tutorialOverlay'), body=$('tutorialOverlayBody');
  if(kind==='items'){
    body.innerHTML=
      `<div class="tstep">TRAINING 3 / 5</div><h3>${T('tov3T')}</h3>`+
      `<p class="lead">${T('tov3L')}</p>`+
      `<div class="tip">${T('tov3A')}</div>`+
      `<div class="igrid">${tutorialItemGrid()}</div>`+
      `<div class="tip">${T('tov3B')}</div>`+
      `<button type="button" class="tNext" id="btTutNext">${T('tov3N')}</button>`;
    ov.classList.add('on');
    $('btTutNext').onclick=()=>showTutorialOverlay('hud');
  }else{
    const lk=LEGEND_KEYS[0], limg=ART[LEGENDS[lk].img];
    body.innerHTML=
      `<div class="tstep">TRAINING 4 / 5</div><h3>${T('tov4T')}</h3>`+
      `<p class="lead">${T('tov4L')}</p>`+
      `<div class="hudguide">`+
        `<div class="guide"><div class="radarDemo"></div>`+
          `<div class="gh">${T('tovRadarH')}</div><p>${T('tovRadarP')}</p></div>`+
        `<div class="guide"><div class="hudDemo"><div class="hpDemo"><i></i></div>`+
          `<div class="squadDemo">${T('tovSquad')} <b>${T('tovSquadL')}</b></div></div>`+
          `<div class="gh">${T('tovHudH')}</div><p>${T('tovHudP')}</p></div>`+
        `<div class="guide wide"><img class="legendDemo" src="${limg}" alt="">`+
          `<div><div class="gh">${T('tovLegH')}</div><p>${T('tovLegP')}</p></div></div>`+
      `</div>`+
      `<div class="tip">${T('tov4Tip')}</div>`+
      `<button type="button" class="tNext" id="btTutNext">${T('tov4N')}</button>`;
    ov.classList.add('on');
    $('btTutNext').onclick=finishTutorialOverlay;
  }
}
function finishTutorialOverlay(){
  $('tutorialOverlay').classList.remove('on');
  S.tutStep=4; S.tutMsgMs=3800; S.spawnCd=450; S.legendCd=26000;
  /* 5단계를 다 본 시점에 완료로 기록합니다. 여기서 죽더라도 다시 뜨지 않습니다. */
  META.tutorialDone=true; metaSave();
  /* 튜토리얼에 쓴 시간은 스토리 '제한 시간' 임무에서 빼 줍니다 */
  S.stageStart=performance.now(); S.hits=0; S.itemGot=0;
  mode='play'; last=performance.now(); cgGameplayStart();
}
/* 튜토리얼 진행 중인지 — 스토리에서는 S.stage 가 난이도 값이라
   스테이지 번호 대신 튜토리얼이 시작된 스테이지를 기억해 비교합니다. */
function inTutorial(){
  return !!(S && S.tutorial && S.tutStep<4 &&
            (S.tutStage===undefined || S.stage===S.tutStage));
}
function updateTutorial(dt){
  const box=$('tutorial');
  if(!S||mode!=='play'||!S.tutorial||
     (S.tutStage!==undefined && S.stage!==S.tutStage)){ box.classList.remove('on'); return; }
  $('hint').style.opacity='0';
  if(S.tutStep===0){
    box.innerHTML='<span class="step">TRAINING 1 / 5</span>'+T('tutMove'); box.classList.add('on');
    if(Math.hypot(S.px-S.tutX,S.py-S.tutY)>45){ S.tutStep=1; spawnTutorialTarget(); }
  }else if(S.tutStep===1){
    box.innerHTML='<span class="step">TRAINING 2 / 5</span>'+T('tutCapture'); box.classList.add('on');
    spawnTutorialTarget();
  }else if(S.tutStep===2){
    spawnTutorialItem();
    box.innerHTML='<span class="step">TRAINING 3 / 5</span>'+T('tutItem'); box.classList.add('on');
  }else if(S.tutStep===4){
    S.tutMsgMs-=dt;
    box.innerHTML='<span class="step">TRAINING 5 / 5</span>'+T('tutFight'); box.classList.toggle('on',S.tutMsgMs>0);
  }
}
function updateObjectiveUI(){
  const el=$('objective');
  if(!S||mode!=='play'||inTutorial()){ el.classList.remove('on'); return; }
  if(S.phase==='heroBoss'||S.phase==='heroLoot'){el.classList.remove('on');return;}
  const text=S.phase==='hunt'?T('objSweepShort',Math.min(S.killed,S.killNeed),S.killNeed):T('objBaseShort',S.turrets.filter(t=>t.alive).length);
  if(el._cgText!==text){el._cgText=text;el.innerHTML=text;}
  el.classList.add('on');
}
/* ============================== 업데이트 ================================= */
function update(dt){
  if(mode!=='play') return;
  if(S.invuln>0) S.invuln-=dt;
  if(S.shake>0) S.shake-=dt;
  if((S.upPower>0||relicVal('r_nano')>0) && S.hp<maxHp()) S.hp=Math.min(maxHp(), S.hp+regenPs()*dt/1000);
  updateTutorial(dt); updateObjectiveUI();
  if(S.stun>0) S.stun-=dt;
  if(S.slowT>0) S.slowT-=dt;
  if(S.blind>0) S.blind-=dt;
  updateHazards(dt);

  /* --- 플레이어 이동 (키보드 또는 왼쪽 스틱) --- */
  let ax=0,ay=0,mag=0;
  if(keys.KeyA||keys.ArrowLeft) ax-=1;
  if(keys.KeyD||keys.ArrowRight) ax+=1;
  if(keys.KeyW||keys.ArrowUp) ay-=1;
  if(keys.KeyS||keys.ArrowDown) ay+=1;
  if(ax||ay){ const m=Math.hypot(ax,ay); ax/=m; ay/=m; mag=1; }
  else { const v=stickVec(sticks.move); ax=v.x; ay=v.y; mag=v.len; }
  if(S.stun>0){ mag=0; S.vx*=.7; S.vy*=.7; }        // 스턴 중에는 움직일 수 없습니다
  if(mag>0){ const sp=speedOf()*(S.slowT>0?0.45:1)*mag*dt/16;
    S.px+=ax*sp; S.py+=ay*sp; S.vx=ax; S.vy=ay; clampPlayer();
    $('hint').style.opacity='0'; }
  else { S.vx*=.8; S.vy*=.8; }
  clampPlayer();                    // 가만히 있어도 구조물 밖으로 밀려나게

  /* --- 카메라 (조준 계산이 화면 좌표를 쓰므로 먼저) --- */
  S.cam.x=Math.max(0,Math.min(WORLD.w-W, S.px-W/2));
  S.cam.y=Math.max(0,Math.min(WORLD.h-H, S.py-H*0.55));

  relCamera(dt);
  heroFrameCamera(dt);
  /* --- 사격 조준: 가장 가까운 적/포탑 자동 조준 --- */
  const tgt=nearestTarget(S.px,S.py,TUNE.aimRange);
  if(tgt) S.face=Math.atan2(tgt.y-S.py,tgt.x-S.px);
  else if(Math.hypot(S.vx,S.vy)>.05) S.face=Math.atan2(S.vy,S.vx);

  /* --- 흡수빔: 사격과 별개로 방향을 직접 조준합니다 --- */
  const av=stickVec(sticks.aim);
  if(sticks.aim.on){
    S.beam=true;
    if(av.len>0) S.beamAng=Math.atan2(av.y,av.x);
  }else if(keys.Space||mouse.down){
    S.beam=true;
    if(mouse.moved) S.beamAng=Math.atan2(mouse.y-(S.py-S.cam.y), mouse.x-(S.px-S.cam.x));
  }else S.beam=false;

  /* --- 사격 (빔 중에는 정지) --- */
  S.fireCd-=dt;
  if(!S.beam && tgt && S.fireCd<=0){
    S.fireCd=fireMs();
    for(let i=0;i<evoWays();i++){
      const a=S.face+(i-(evoWays()-1)/2)*.11;
      S.bullets.push({x:S.px+Math.cos(S.face)*20,y:S.py+Math.sin(S.face)*20,
        vx:Math.cos(a)*TUNE.bulletSpeed,vy:Math.sin(a)*TUNE.bulletSpeed,
        dmg:dmgOf(),el:S.element,from:'player',_visualKind:'hero'});
      visualBindBullet(S.bullets[S.bullets.length-1],S);
    }
    visualFire(S, 'shell', S.face);
    Math.random(); // Preserve gameplay RNG; weapon audio is emitted by visualFire.
  }

  /* --- 스폰 --- */
  S.spawnCd-=dt;
  if(S.spawnCd<=0 && !inTutorial()){
    S.spawnCd=evoSpawnInterval(S.stage,S.phase==='boss')*(.92+Math.random()*.16); spawnAroundPlayer();
  }
  /* 레전드는 별도 타이머로 드물게 등장합니다 */
  S.legendCd-=dt;
  if(S.legendCd<=0 && !inTutorial()){
    S.legendCd=30000+Math.random()*24000;
    if(!S.enemies.some(e=>e.isLegend&&e.side==='neutral') && Math.random()<.40) spawnLegend();
  }

  /* --- 적 기지: 목표 처치 수를 채우면 무작위 위치에 출현 --- */
  if(S.warn>0) S.warn-=dt;
  if(S.phase==='hunt' && S.killed>=S.killNeed) spawnBase();

  if(S.base){
    const b=S.base, nearBase=Math.hypot(S.px-b.x,S.py-b.y)<650 && S.enemies.length<evoEnemyLimit(S.stage);
    b.gateT-=dt;
    if(b.gateT<=0){
      b.open=!b.open;
      b.gateT = b.open ? 1600 : 4800+Math.random()*1800;
      if(b.open && nearBase){
        for(let i=0,slots=Math.max(0,evoEnemyLimit(S.stage)-S.enemies.length-(S.relQueue?.length||0));i<Math.min(2,1+((S.stage/6)|0),slots);i++)
          S.enemies.push(makeUnit(pickType(S.stage), b.x+(Math.random()-.5)*60, b.y+40, 'enemy'));
        blip(170,.32,'sawtooth',.05);
      }
    }
  }
  relUpdateTurrets(dt);
  if(S.phase==='boss' && S.turrets.length && S.turrets.every(t=>!t.alive)) return openUpgrade();

  const basicCaptureTarget=basicNearestCaptureTarget();
  S.basicCaptureTarget=basicCaptureTarget;
  /* --- 적 / 중립 --- */
  for(let i=S.enemies.length-1;i>=0;i--){
    const e=S.enemies[i]; if(!e)continue; if(isHero(e)){heroAI(e,dt);continue;} e.t+=dt;
    if(e.atkT>0) e.atkT-=dt;                          // 사격 애니메이션 남은 시간
    if(e.resist>0) e.resist-=dt;
    if(e.slow>0) e.slow-=dt;
    if(e.poison>0){ e.poison-=dt; e.poisonCd-=dt;
      if(e.poisonCd<=0){ e.poisonCd=e.poisonTick||900; damageUnit(e,1,null,true);
        S.fx.push({k:'spark',x:e.x+(Math.random()-.5)*14,y:e.y,vx:(Math.random()-.5)*1.2,vy:-Math.random()*1.4-.3,life:600,t:600,c:'#9BE87F'}); } }
    if(e.slow>0 && Math.random()<dt/90)          // 냉동 유닛이 지나온 길에 눈이 흩날립니다
      S.fx.push({k:'snow',x:e.x+(Math.random()-.5)*e.r*1.8, y:e.y+(Math.random()-.5)*e.r,
                 vx:(Math.random()-.5)*.5, vy:.35+Math.random()*.5, life:900,t:900,c:'#EAF6FF'});
    if(e.side==='neutral' && !e.isLegend && !e.tutorial){        // 일반 중립만 시간이 지나면 이탈
      e.life-=dt;
      if(e.life<=0){ S.fx.push({k:'ring',x:e.x,y:e.y,r:4,max:50,life:400,t:400,c:'#E8C63C'});
        S.fx.push({k:'txt',x:e.x,y:e.y,life:800,t:800,s:'이탈',c:'#E8C63C'});
        S.enemies.splice(i,1); continue; }
    }
    const velcaSlow=e.velcaSlow>0?.45:1;if(e.velcaSlow>0)e.velcaSlow=Math.max(0,e.velcaSlow-dt);
    if(e.velcaStun>0){e.velcaStun=Math.max(0,e.velcaStun-dt);continue;}
    const sl=velcaSlow*(e.slow>0?(e.slowMul||.8):1);

    /* 흡수빔 판정 — 플레이어가 바라보는 방향으로 뻗습니다 */
    if(S.beam && e===basicCaptureTarget && e.resist<=0 && canCaptureUnit(e)){
      const dx=e.x-S.px, dy=e.y-S.py;
      const dist=Math.hypot(dx,dy);
      /* 부채꼴 판정 — 가까울수록 유닛 크기가 각도로 크게 잡히므로 보정합니다 */
      const allow = beamArc() + Math.atan2(e.r, Math.max(24,dist));
      if(dist>0 && dist<beamLen()+e.r && angGap(Math.atan2(dy,dx), S.beamAng)<allow){
        e.cap+=dt;
        e.x+=(S.px-e.x)*.016*dt/16; e.y+=(S.py-e.y)*.016*dt/16;
        /* 견인 입자 — 대상에서 떨어져 나와 플레이어 쪽으로 빨려 들어갑니다 */
        if(S.fx.length<380 && Math.random()<.34){
          const a=Math.random()*6.283, rr=e.r*(.5+Math.random()*.8);
          S.fx.push({k:'draw', x:e.x+Math.cos(a)*rr, y:e.y+Math.sin(a)*rr,
            ox:e.x+Math.cos(a)*rr, oy:e.y+Math.sin(a)*rr,
            life:340,t:340, c:e.isLegend?'#FFD75A':'#8FFFDC'});
        }
        if(e.cap>=capFill()){
          const captureOK = (e.tutorial || (S.firstCaptureGuaranteed && !e.isLegend)) ? true : Math.random()<capChance(e);
          if(captureOK){
            if(!e.isLegend) S.firstCaptureGuaranteed=false;
            S.captured++; S.score+=e.score*2;
            if(e.isLegend){
              evoRecruitLegend(e);
            }else{
              if(!e.tutorial) S.killed++;
              convertToAlly(e);
              if(e.tutorial){ S.tutStep=2; S.basicLessonMs=0; }
            }
            if(!e.isLegend){
            /* 일반 편입 — 레전드보다는 절제하되 확실히 보이게 */
            S.fx.push({k:'flash',x:e.x,y:e.y,r:64,life:190,t:190,c:'#DDF2FF'});
            S.fx.push({k:'shock',x:e.x,y:e.y,r:5,max:74,life:440,t:440,c:'#5B9BE8'});
            S.fx.push({k:'ring',x:e.x,y:e.y,r:4,max:54,life:380,t:380,c:'#8FFFDC'});
            for(let q=0;q<14;q++){ const a=Math.random()*6.283, sp=1.1+Math.random()*2.2;
              S.fx.push({k:'spark',x:e.x,y:e.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
                life:380+Math.random()*260,t:380+Math.random()*260,c:q%2?'#5B9BE8':'#8FFFDC'}); }
            S.fx.push({k:'txt',x:e.x,y:e.y,life:900,t:900,s:T('captured'),c:'#5B9BE8'});
            blip(660,.09,'triangle',.06); blip(990,.13,'triangle',.05);
            }else{blip(740,.10,'sine',.06);blip(1110,.17,'triangle',.045);}
            S.enemies.splice(i,1); continue;
          }else{
            if(e.isLegend){evoDepart(e,"failed");S.enemies.splice(i,1);continue;}
            e.cap=0; e.resist=TUNE.resistMs;
            S.fx.push({k:'txt',x:e.x,y:e.y,life:700,t:700,s:T('cgResisted'),c:'#D6453A'});
            blip(150,.16,'sawtooth',.05);
          }
        }
      }else if(e.cap>0) e.cap=Math.max(0,e.cap-dt*1.6);
    }else if(e.cap>0) e.cap=Math.max(0,e.cap-dt*1.6);

    /* 이동: 적은 플레이어를 향해, 중립은 도망 */
    const dx=S.px-e.x, dy=S.py-e.y, dist=Math.hypot(dx,dy)||1;
    if(e.side==='neutral'){
      if(dist<300){ e.x-=dx/dist*e.spd*1.1*sl*dt/16; e.y-=dy/dist*e.spd*1.1*sl*dt/16;
        e.face=Math.atan2(-dy,-dx); }
      else { e.x+=Math.cos(e.t*.0009)*e.spd*sl*dt/16; e.y+=Math.sin(e.t*.0011)*e.spd*sl*dt/16;
        e.face=e.t*.0009+Math.PI/2; }
    }else{
      if(e.ai) enemyAI(e,dx,dy,dist,dt,sl);
      const mv=(e.mv===undefined?1:e.mv);
      if(mv!==0 && (dist>60 || mv<0)){
        e.x+=dx/dist*e.spd*mv*sl*dt/16; e.y+=dy/dist*e.spd*mv*sl*dt/16; }
      if(!isVelcarion(e))e.face=e.ai==='volt'&&(e.charge>0||e.flash>0)?(e.flash>0?e.flashAng:e.beamAng):Math.atan2(dy,dx);
    }
    e.x=Math.max(16,Math.min(WORLD.w-16,e.x));
    e.y=Math.max(16,Math.min(WORLD.h-16,e.y));
    resolveProps(e,e.r,e.flying);          // 비행 유닛은 지형을 넘어다닙니다

    /* 사격 */
    if(e.fire>0 && !e.noFire && e.side==='enemy' && dist<(e.range||520)){
      e.fireCd-=dt*sl;
      if(e.fireCd<=0){
        e.fireCd=e.fireGap*(.7+Math.random()*.6);
        animFire(e);                                  // 사격 애니메이션 재생
        if(e._opt){                                   // 특수 속성이 붙은 사격
          eVolley(e, Math.atan2(dy,dx), e.ways||1, e.spread||.12,
                  Object.assign({bspd:e.bspd,dmg:e.bdmg,c:'#FFC08A'}, e._opt));
        } else fireFrom(e, Math.atan2(dy,dx), 'enemy');
        if(e.shots>0) e.shots--;                    // 점사 카운트
      }
    }
  }

  /* --- 아군 (흡수된 유닛) AI --- */
  for(const a of S.allies){
    if(isHero(a)){heroAI(a,dt);continue;}
    if(a.velcaStun>0){a.velcaStun=Math.max(0,a.velcaStun-dt);continue;}
    const stormSlow=a.velcaSlow>0?.45:1;if(a.velcaSlow>0)a.velcaSlow=Math.max(0,a.velcaSlow-dt);
    a.t+=dt;
    if(isVelcarion(a)){velcaAllyAI(a,dt,stormSlow);continue;}
    if(a.atkT>0) a.atkT-=dt;                          // 사격 애니메이션 남은 시간
    if(a.isLegend){                                  // 레전드는 전용 무기 로직
      evoLegendAI(a,dt,stormSlow);
      continue;
    }
    evoAllyAI(a,dt,stormSlow);
  }

  /* --- 아군/플레이어 탄 --- */
  for(let i=S.bullets.length-1;i>=0;i--){
    const b=S.bullets[i]; if(!b)continue;
    if(b.homing){                                  // 레전드 우주선 — 유도탄
      const t=nearestEnemy(b.x,b.y,300);
      if(t){ const sp2=Math.hypot(b.vx,b.vy), ca=Math.atan2(b.vy,b.vx);
        let d2=Math.atan2(t.y-b.y,t.x-b.x)-ca;
        while(d2>Math.PI)d2-=6.283; while(d2<-Math.PI)d2+=6.283;
        const na=ca+Math.max(-.075,Math.min(.075,d2))*dt/16;
        b.vx=Math.cos(na)*sp2; b.vy=Math.sin(na)*sp2; }
    }
    if(b.seekId){                                   // 추적 미사일
      const t=b.seekId;
      if(t.hp>0&&(S.enemies.includes(t)||(S.turrets.includes(t)&&t.alive))){
        const sp2=Math.hypot(b.vx,b.vy), ca=Math.atan2(b.vy,b.vx);
        let d2=Math.atan2(t.y-b.y,t.x-b.x)-ca;
        while(d2>Math.PI)d2-=6.283; while(d2<-Math.PI)d2+=6.283;
        const na=ca+Math.max(-.09,Math.min(.09,d2))*dt/16;
        b.vx=Math.cos(na)*sp2; b.vy=Math.sin(na)*sp2;
      } else b.seekId=null;
    }
    const step0=Math.hypot(b.vx,b.vy)*dt/16;
    b.x+=b.vx*dt/16; b.y+=b.vy*dt/16; b.life=(b.life||0)+dt; b.trav=(b.trav||0)+step0;
    if(b.kind==='missile' && Math.random()<dt/28)     // 미사일 배기 연기
      S.fx.push({k:'smoke',x:b.x-b.vx*.6,y:b.y-b.vy*.6,life:420,t:420,r:2,c:'#C8B8A8',_visualSkip:true});
    if(b.range && b.trav>b.range){                    // 사거리 소진 → 폭발
      if(b.kind==='missile'&&b.splashR) burstFire(b.x,b.y,b.splashR*.7);
      S.bullets.splice(i,1); continue; }
    if(b.life>2600||b.x<-40||b.x>WORLD.w+40||b.y<-40||b.y>WORLD.h+40){S.bullets.splice(i,1);continue;}
    if(blockedByProp(b.x,b.y)){                 // 언덕·벽에 막힙니다
      S.fx.push({k:'part',x:b.x,y:b.y,vx:0,vy:0,life:160,t:160,c:'#C9C2A8'});
      S.bullets.splice(i,1); continue; }
    let hit=false;
    for(const e of S.enemies){
      if(e.gone)continue;
      if(e.side==='neutral' && b.from==='ally') continue;      // 아군은 중립을 쏘지 않음
      if(e.relRecruit)continue;
      if(Math.hypot(b.x-e.x,b.y-e.y)<e.r+6){
        damageUnit(e,b.dmg,b.el);
        if(b.el==='FIRE'){
          const c=elemCfg('FIRE');
          const sd=Math.max(1,Math.round(b.dmg*c.f));
          for(const o of S.enemies)
            if(o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<c.r) damageUnit(o,sd,'FIRE',true);
          burstFire(e.x,e.y,c.r);
        }
        if(b.splashR){                            // 레전드 — 착탄 시 확산 피해
          const sd=Math.max(1,Math.round(b.dmg*.45));
          for(const o of S.enemies)
            if(o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<b.splashR) damageUnit(o,sd,null,true);
          burstFire(e.x,e.y,b.splashR);
        }
        hit=true; break; }
    }
    if(!hit) for(const t of S.turrets){
      if(t.alive && Math.abs(b.x-t.x)<26 && Math.abs(b.y-t.y)<30){ hitTurret(t,b.dmg);if(b.el)evoElementImpact(t.x,t.y,b.el); hit=true; break; }
    }
    if(hit) S.bullets.splice(i,1);
  }

  /* --- 적 탄 --- */
  for(let i=S.ebullets.length-1;i>=0;i--){
    const b=S.ebullets[i]; b.x+=b.vx*dt/16; b.y+=b.vy*dt/16; b.life=(b.life||0)+dt;
    if(b.life>3000||b.x<-40||b.x>WORLD.w+40||b.y<-40||b.y>WORLD.h+40){S.ebullets.splice(i,1);continue;}
    if(blockedByProp(b.x,b.y)){ S.ebullets.splice(i,1); continue; }
    let hit=false;
    for(const a of S.allies){ if(a.gone)continue;     // 적 탄은 아군에게도 맞습니다
      if(Math.hypot(b.x-a.x,b.y-a.y)<a.r+5){ if((a.relHitUntil||0)<=S.relTime){a.hp-=a.isLegend?Math.max(1,(b.dmg||8)*.25):1;a.relHitUntil=S.relTime+500;visualHit(a);} hit=true;
        S.fx.push({k:'part',x:a.x,y:a.y,vx:(Math.random()-.5)*3,vy:-Math.random()*2,life:240,t:240,c:'#5B9BE8'});
        if(a.hp<=0){ visualDeath(a); const k=S.allies.indexOf(a); if(k>=0)S.allies.splice(k,1);
          for(let q=0;q<10;q++) S.fx.push({k:'part',x:a.x,y:a.y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:420,t:420,c:'#5B9BE8'});
          noise(.12,.05); }
        break; } }
    if(!hit && Math.hypot(b.x-S.px,b.y-S.py)<16){
      hit=true;
      /* 작살·집게팔은 무적 시간과 무관하게 발을 묶습니다 (피해는 무적이면 무시) */
      if(b.stun) S.stun=Math.max(S.stun,b.stun);
      if(b.pull && b.src){
        const dx=b.src.x-S.px, dy=b.src.y-S.py, d=Math.hypot(dx,dy)||1;
        const pull=Math.max(0,d-b.src.r-22);
        S.px+=dx/d*pull; S.py+=dy/d*pull; clampPlayer();
        S.fx.push({k:'ring',x:S.px,y:S.py,r:4,max:46,life:340,t:340,c:'#FF8A5A'});
        blip(200,.16,'triangle',.06);
      }
      if(S.invuln<=0) damagePlayer(b.dmg||8);
    }
    if(hit) S.ebullets.splice(i,1);
  }

  /* --- 적 접촉 --- */
  if(S.invuln<=0) for(const e of S.enemies)
    if(e.side==='enemy'&&!e.gone&&Math.hypot(e.x-S.px,e.y-S.py)<e.r+14){
      damagePlayer(Math.round(TUNE.contactDmg*enemyDmgScale())); break; }

  /* --- 아이템 --- */
  for(let i=S.items.length-1;i>=0;i--){
    const it=S.items[i]; it.t+=dt;
    const dx=S.px-it.x, dy=S.py-it.y, d=Math.hypot(dx,dy);
    if(d>0&&d<90){ it.x+=dx/d*3.2*dt/16; it.y+=dy/d*3.2*dt/16; }   // 가까우면 끌려옵니다
    if(d<24){ pickup(it.k,it); S.items.splice(i,1); continue; }
    if(!it.tutorial && it.t>20000) S.items.splice(i,1);
  }

  updateLasers(dt);

  /* --- 이펙트 --- */
  for(let i=S.fx.length-1;i>=0;i--){ const f=S.fx[i]; f.t-=dt;
    if(f.k==='ring'||f.k==='burst'||f.k==='shock'||f.k==='halo')
      f.r=f.max*(1-f.t/f.life);
    if(f.k==='draw'){                     // 견인 입자 — 플레이어 쪽으로 가속하며 빨려듦
      const p=1-f.t/f.life, e=p*p;
      const tx=S?S.px:f.ox, ty=S?S.py:f.oy;
      f.x=f.ox+(tx-f.ox)*e; f.y=f.oy+(ty-f.oy)*e;
    }
    if(f.k==='part'){f.x+=f.vx*dt/16;f.y+=f.vy*dt/16;f.vy+=.1*dt/16;}
    if(f.k==='ember'){f.x+=f.vx*dt/16;f.y+=f.vy*dt/16;f.vx*=.94;f.vy=f.vy*.94-.02*dt/16;}
    if(f.k==='spark'){f.x+=f.vx*dt/16;f.y+=f.vy*dt/16;f.vy-=.008*dt/16;}
    if(f.k==='snow'){f.x+=f.vx*dt/16+Math.sin(f.t*.01)*.25;f.y+=f.vy*dt/16;}
    if(f.k==='smoke'){ f.r+=dt*.012; f.y-=dt*.005; }
    if(f.k==='txt') f.y-=dt*.03;
    if(f.t<=0) S.fx.splice(i,1); }
}

/* 조준 대상 = 적 유닛 + 살아있는 포탑 중 가장 가까운 것.
   포탑을 빼먹으면 기지를 공략할 방법이 없어집니다. */
function nearestTarget(x,y,range){
  let best=nearestEnemy(x,y,range);
  let bd=best?(best.x-x)**2+(best.y-y)**2:range*range;
  for(const t of S.turrets){
    if(!t.alive) continue;
    const d=(t.x-x)**2+(t.y-y)**2;
    if(d<bd){bd=d;best=t;}
  }
  return best;
}
function nearestEnemy(x,y,range){
  let best=null,bd=range*range;
  for(const e of S.enemies){
    if(e.gone) continue;                    // 땅속이거나 필드를 벗어난 유닛은 조준 대상이 아닙니다
    if(e.side!=='enemy') continue;
    const d=(e.x-x)**2+(e.y-y)**2;
    if(d<bd){bd=d;best=e;}
  }
  return best;
}
/* 적 전용 일제사격 — ways/spread를 임시로 바꿔 여러 발을 뿌립니다 */
/* ── 지형 효과 ────────────────────────────────────────────────────────────
   plasma  : 밟으면 느려지고 지속 피해
   smoke   : 안에 있으면 시야가 막힘
   bomb    : 잠시 깜빡이다 터지는 시한폭탄
   shock   : 한 번 퍼지며 범위 피해를 주는 충격파
   rumble  : 땅이 우글거리는 예고 표시 (피해 없음)                        */
function addHazard(h){
  if(!S.hazards) S.hazards=[];
  if(S.hazards.length>90) S.hazards.shift();
  h.t=h.life; S.hazards.push(h); return h;
}
function hazShock(x,y,r,dmg){
  addHazard({k:'shock',x,y,r:8,max:r,life:420,dmg,hit:false,c:'#FFB05A'});
  S.shake=Math.max(S.shake||0,120);
  noise(.22,.09); blip(90,.30,'triangle',.06);
}
function updateHazards(dt){
  if(!S.hazards) return;
  const inSmoke=[];
  for(let i=S.hazards.length-1;i>=0;i--){
    const h=S.hazards[i]; h.t-=dt;
    if(h.side==='ally'){evoUpdateFriendlyHazard(h,dt);if(h.t<=0)S.hazards.splice(i,1);continue;}
    const p=1-h.t/h.life;

    if(h.k==='shock'){
      h.r=h.max*Math.min(1,p*1.6);
      if(!h.hit && p>0.18){                       // 파동이 퍼진 순간 한 번만 판정
        h.hit=true;
        if(Math.hypot(S.px-h.x,S.py-h.y)<h.max) damagePlayer(h.dmg);
        for(const a of S.allies) if(Math.hypot(a.x-h.x,a.y-h.y)<h.max) a.hp-=2;
      }
    }
    else if(h.k==='bomb'){
      if(h.t<=0){                                  // 터집니다
        visualExplosion(h.x,h.y,h.max);
        hazShock(h.x,h.y,h.max,h.dmg);
        for(let q=0;q<14;q++) S.fx.push({k:'ember',x:h.x,y:h.y,
          vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:520,t:520,c:'#FF9A4A'});
      }
    }
    else if(h.k==='plasma'){
      if(Math.hypot(S.px-h.x,S.py-h.y)<h.r){
        S.slowT=Math.max(S.slowT,120);
        h.tick=(h.tick||0)+dt;
        if(h.tick>=420){ h.tick=0; damagePlayer(h.dmg); }
      }
    }
    else if(h.k==='smoke'){
      if(Math.hypot(S.px-h.x,S.py-h.y)<h.r) inSmoke.push(h);
    }
    if(h.t<=0) S.hazards.splice(i,1);
  }
  if(inSmoke.length) S.blind=Math.max(S.blind,140);
}
function drawHazards(cx,cy){
  if(!S.hazards) return;
  for(const h of S.hazards){
    const X=h.x-cx, Y=h.y-cy, al=Math.max(0,h.t/h.life);
    if(X<-260||X>W+260||Y<-260||Y>H+260) continue;
    if(h.k==='shock'){ drawVisualShock(h,X,Y,al); }

    else if(h.k==='rumble'){                       // 땅이 우글거리는 예고
      const n=9;
      ctx.globalAlpha=.55+.35*Math.sin(performance.now()*.02);
      ctx.fillStyle='#6b5236';
      for(let q=0;q<n;q++){
        const a=(q/n)*6.283+h.t*.004, rr=h.r*(.45+.5*Math.abs(Math.sin(h.t*.01+q)));
        ctx.beginPath();
        ctx.ellipse(X+Math.cos(a)*rr, Y+Math.sin(a)*rr*.55, 5+3*Math.sin(h.t*.02+q), 3, 0,0,6.283);
        ctx.fill();
      }
      ctx.globalAlpha=.35; ctx.strokeStyle='#8a6b46'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.ellipse(X,Y,h.r,h.r*.55,0,0,6.283); ctx.stroke();
      ctx.globalAlpha=1;
    }
    else if(h.k==='plasma'){
      const g=ctx.createRadialGradient(X,Y,2,X,Y,h.r);
      g.addColorStop(0,'rgba(150,200,255,'+(.42*al)+')');
      g.addColorStop(.6,'rgba(90,140,255,'+(.22*al)+')');
      g.addColorStop(1,'rgba(90,140,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X,Y,h.r,0,6.283); ctx.fill();
      ctx.globalAlpha=al*.8; ctx.strokeStyle='#BFD8FF'; ctx.lineWidth=1.2;
      for(let q=0;q<3;q++){
        const a=performance.now()*.004+q*2.1;
        ctx.beginPath();
        ctx.moveTo(X+Math.cos(a)*h.r*.3, Y+Math.sin(a)*h.r*.3);
        ctx.lineTo(X+Math.cos(a+.7)*h.r*.8, Y+Math.sin(a+.7)*h.r*.8);
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    else if(h.k==='smoke'){ drawVisualSmoke(h,X,Y,al); }

    else if(h.k==='bomb'){
      const blink=Math.floor(h.t/110)%2===0;
      ctx.fillStyle=h.side==='ally'?(blink?'#55DBFF':'#175570'):(blink?'#FF5A3C':'#7a2a1c');
      drawVisualCanister(h,X,Y);
      ctx.strokeStyle=(h.side==='ally'?'rgba(70,205,255,':'rgba(255,120,70,')+(blink?.9:.35)+')'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(X,Y,h.max*(1-al)*0.5+10,0,6.283); ctx.stroke();
    }
  }
}

function eVolley(e,ang,n,spreadRad,opts){
  const o=opts||{};
  const visualKind=['salvo','rockets','flak'].includes(e.ai)?'missile':visualRig(e).shot;
  visualFire(e,visualKind,ang,n);
  const dmg=Math.round((o.dmg||e.bdmg||8)*enemyDmgScale());
  for(let i=0;i<n;i++){
    const a=ang+(n>1?(i-(n-1)/2)*spreadRad:0)+(o.jitter?(Math.random()-.5)*o.jitter:0);
    S.ebullets.push({x:e.x+Math.cos(ang)*(e.r+4), y:e.y+Math.sin(ang)*(e.r+4),
      vx:Math.cos(a)*(o.bspd||e.bspd), vy:Math.sin(a)*(o.bspd||e.bspd),
      c:o.c||'#FF9A4A', splash:false, dmg, el:null, from:'enemy',
      splashR:o.splashR||0, homing:!!o.homing, legend:false, big:!!o.big,_visualKind:visualKind,
      stun:o.stun||0, pull:!!o.pull, src:o.pull?e:null});
    visualBindBullet(S.ebullets[S.ebullets.length-1],e);
  }
  if(o.snd!==false) noise(.05,.03);
}

/* ===================== 적군 특수 행동 =====================================
   e.mv = 이동속도 배수, e.fireGap = 발사 간격. 유닛별로 다르게 움직입니다. */
function enemyAI(e,dx,dy,dist,dt,sl){
  if(isVelcarion(e)){velcaAI(e,dt,sl);return;}
  const aimX=e.side==='ally'?(e.evoSkillTarget?.x??e.x):S.px,aimY=e.side==='ally'?(e.evoSkillTarget?.y??e.y):S.py;
  e.mv=1; e.noFire=false;
  const ang=Math.atan2(dy,dx);
  e.aiT=(e.aiT||0)-dt;
  switch(e.ai){

  case 'strafe':            /* 레드 호크 — 덕트팬 횡이동 회피 + 순간 가속 집중사격 */
    e.ph=(e.ph||0)+dt*.005;
    { const s2=Math.sin(e.ph)*1.5*sl*dt/16;
      e.x+=Math.cos(ang+Math.PI/2)*s2; e.y+=Math.sin(ang+Math.PI/2)*s2; }
    if(e.aiT<=0){ e.aiT=4000+Math.random()*2000; e.dash=650; }
    if(e.dash>0){ e.dash-=dt; e.mv=2.2; e.fireGap=e.fire*.30; }
    else e.fireGap=e.fire;
    break;

  case 'burst':             /* 레드 가드 — 점사 후 정지 재조준, 가까우면 점사가 길어짐 */
    if(e.aiT<=0){ e.shots=(dist<230?5:3); e.aiT=2400+Math.random()*900; }
    if(e.shots>0){ e.mv=.25; e.fireGap=240; }
    else { e.mv=1; e.noFire=true; }        // 재조준 중에는 쏘지 않습니다
    break;

  case 'charge':            /* 러시 라이더 — 직선 돌진 후 감속 사격, 돌진 중 피격 판정 축소 */
    if(e.aiT<=0){ e.aiT=3200+Math.random()*1400; e.dash=900; }
    if(e.dash>0){ e.dash-=dt; e.mv=2.6; e.hitS=.55; e.fireGap=e.fire*2; }
    else { e.mv=.55; e.hitS=1; e.fireGap=e.fire*.8; }
    break;

  case 'salvo':             /* 미사일 트루퍼 — 주기적으로 소형 유도미사일 4~8발 순차 발사 */
    e.mv=dist<300?.15:.8;
    if(e.aiT<=0){ e.aiT=6500+Math.random()*2000; e.salvo=4+((S.stage/12)|0); e.salvoCd=0; }
    if(e.salvo>0){
      e.salvoCd-=dt;
      if(e.salvoCd<=0){ e.salvoCd=170; e.salvo--;
        eVolley(e,ang,1,0,{bspd:2.6,dmg:e.bdmg*.7,c:'#FFB05A',splashR:16,jitter:.5}); }
    }
    break;

  case 'rove':              /* 스카이 스카우트 — 좌우로 크게 돌며 추적, 가끔 짧게 후퇴 */
    e.ph=(e.ph||0)+dt*.0022;
    { const s2=Math.sin(e.ph)*2.4*sl*dt/16;
      e.x+=Math.cos(ang+Math.PI/2)*s2; e.y+=Math.sin(ang+Math.PI/2)*s2; }
    if(e.aiT<=0){ e.aiT=3000+Math.random()*2600; if(Math.random()<.45) e.back=900; }
    if(e.back>0){ e.back-=dt; e.mv=-1.1; } else e.mv=1;
    break;

  case 'rockets':           /* 헤비 로켓 탱크 — 주기적으로 좌우 포드에서 8발 확산 */
    e.mv=dist<340?.3:1;
    if(e.aiT<=0){ e.aiT=5200+Math.random()*1600;
      eVolley(e,ang,8,.16,{bspd:3.4,dmg:e.bdmg*.55,c:'#FF7A4A',splashR:20,jitter:.08});
      S.shake=Math.max(S.shake,90); }
    break;

  case 'turret':            /* 트윈 센트리 — 고정. 연사 후 냉각 */
    e.mv=0;
    if(e.aiT<=0){ e.cool=!e.cool; e.aiT=e.cool?1800:3200; }
    e.noFire=!!e.cool;                     // 냉각 중에는 발사 정지
    break;

  case 'rage':              /* 브루저 메크 — 체력 절반 이하에서 각성 */
    if(e.hp<=e.hpMax*.5){ e.mv=1.35; e.fireGap=e.fire*.65; e.raged=true; }
    else { e.mv=1; e.fireGap=e.fire; }
    break;

  case 'hover':             /* 호버 캐논 — 지형 무시, 좌우로 미끄러지며 포격 */
    e.ph=(e.ph||0)+dt*.0016;
    { const s2=Math.sin(e.ph)*1.7*sl*dt/16;
      e.x+=Math.cos(ang+Math.PI/2)*s2; e.y+=Math.sin(ang+Math.PI/2)*s2; }
    e.mv=dist<380?.35:.9;
    break;

  case 'siege':             /* 워브루트 — 이동과 포격 모드를 번갈아 전환 */
    if(e.aiT<=0){ e.aiT=e.siege?4200:3600; e.siege=!e.siege; }
    if(e.siege){ e.mv=0; e.fireGap=e.fire*.55; e.range=760; }
    else { e.mv=1; e.fireGap=e.fire; e.range=520; }
    break;

  /* ================= v32 신규 6종 ================= */

  case 'spike':             /* 스파이크 러너 — 2발씩 쏘다 짧게 가속 돌진, 직후 감속 */
    if(e.aiT<=0){ e.aiT=3400+Math.random()*1500; e.dash=520; e.rest=0; }
    if(e.dash>0){ e.dash-=dt; e.mv=2.8; e.noFire=true;      // 돌진 중에는 쏘지 않습니다
      if(e.dash<=0) e.rest=620; }
    else if(e.rest>0){ e.rest-=dt; e.mv=.20; e.fireGap=e.fire*.55; }
    else { e.mv=1; e.fireGap=e.fire; }
    break;

  case 'burrow':            /* 브리치 몰 — 솟아오르고 파고들 때 충격파 */
    if(e.bstate===undefined){ e.bstate='rise'; e.aiT=1000; e.gone=true;
      evoSkillHazard(e,{k:'rumble',x:e.x,y:e.y,r:70,life:1000}); }
    if(e.bstate==='rise'){
      e.mv=0; e.noFire=true; e.gone=true;
      if(e.aiT<=0){ e.bstate='out'; e.gone=false; e.aiT=0;
        evoSkillShock(e,e.x,e.y,110,Math.round(e.bdmg*1.1*evoSkillScale(e)));
        for(let q=0;q<16;q++) S.fx.push({k:'part',x:e.x,y:e.y,
          vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:520,t:520,c:'#8a6b46'}); }
      break;
    }
    if(e.bstate==='sink'){
      e.mv=0; e.noFire=true;
      if(e.aiT<=0){                                    // 파고들며 다시 충격파
        evoSkillShock(e,e.x,e.y,120,Math.round(e.bdmg*1.2*evoSkillScale(e)));
        e.gone=true; e.bstate='under'; e.aiT=1800+Math.random()*900;
      }
      break;
    }
    if(e.bstate==='under'){                            // 땅속 이동 — 보이지도 맞지도 않습니다
      e.mv=1.35; e.noFire=true; e.gone=true;
      if(e.aiT<=0){ e.bstate='rise'; e.aiT=1000;
        evoSkillHazard(e,{k:'rumble',x:e.x,y:e.y,r:70,life:1000}); }
      break;
    }
    /* out — 드릴을 돌리며 전진, 좌우 포드 사격 */
    e.mv=1; e.fireGap=e.fire;
    if(dist<95){                                       // 근접하면 드릴 피해 후 잠수 준비
      e.drillCd=(e.drillCd||0)-dt;
      if(e.drillCd<=0){ e.drillCd=420;
        if(e.side==='ally')evoSkillArea(e.x,e.y,95,e.bdmg*.8*evoSkillScale(e));else if(S.invuln<=0)damagePlayer(Math.round(e.bdmg*.8*evoSkillScale(e)));
        S.fx.push({k:'ring',x:e.x,y:e.y,r:4,max:60,life:260,t:260,c:'#C8B08A'}); }
      if(e.aiT<=0){ e.bstate='sink'; e.aiT=1000;
        evoSkillHazard(e,{k:'rumble',x:e.x,y:e.y,r:70,life:1000}); }
    } else if(e.aiT<=0) e.aiT=1400;                    // 멀어지면 잠수 타이머를 미룹니다
    break;

  case 'volt':              /* 볼트 오브 — 추적 레이저 + 근접 시 플라즈마 장판 */
    e.ph=(e.ph||0)+dt*.0026;
    { const s2=e.charge>0||e.flash>0?0:Math.sin(e.ph)*2.0*sl*dt/16;            // 크게 횡이동
      e.x+=Math.cos(ang+Math.PI/2)*s2; e.y+=Math.sin(ang+Math.PI/2)*s2; }
    e.mv=e.charge>0||e.flash>0?0:dist<260?-.5:1;                               // 너무 가까우면 물러납니다
    e.noFire=true;                                     // 일반 사격 대신 레이저를 씁니다
    /* 레이저는 '조준 → 순간 발사 → 소멸' 입니다.
       예전처럼 막대가 플레이어를 계속 따라다니면 피할 방법이 없고 보기에도 어색합니다.
       1초 동안 고정된 조준선을 보여 준 뒤, 그 각도로 한 번만 쏘고 사라집니다. */
    if(e.charge>0){
      e.charge-=dt;
      /* The aim and origin stay locked for the entire warning. */
      if(e.charge<=0){
        visualFire(e,'laser',e.beamAng);
        e.flash=150; e.flashAng=e.beamAng;           // 발사각 고정
        const L=430, bx=Math.cos(e.flashAng), by=Math.sin(e.flashAng);
        evoSkillBeamHit(e,e.flashAng,L,16,Math.max(1,e.bdmg*1.5*evoSkillScale(e)));
        for(let q=0;q<7;q++){                        // 발사 지점 스파크
          const jj=Math.random()*L;
          S.fx.push({k:'spark',x:e.x+bx*jj,y:e.y+by*jj,
            vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3,life:240,t:240,c:'#CFE6FF'});
        }
        blip(1500,.09,'triangle',.05); blip(900,.14,'sine',.04);
      }
    } else if(e.flash>0){ e.flash-=dt; }
    else if(e.aiT<=0){ e.aiT=2400+Math.random()*1200;
      e.charge=1000; e.beamAng=Math.atan2(aimY-e.y,aimX-e.x); e.mv=0;                                   // 조준 시작
      blip(560,.30,'sine',.03); }
    if(dist<190){                                      // 코일 방전 — 플라즈마를 남깁니다
      e.arcCd=(e.arcCd||0)-dt;
      if(e.arcCd<=0){ e.arcCd=1500;
        for(const sgn of [-1,1]){
          const a=ang+sgn*Math.PI/2;
          evoSkillHazard(e,{k:'plasma',x:e.x+Math.cos(a)*34,y:e.y+Math.sin(a)*34,
            r:46,life:3000,dmg:Math.round(e.bdmg*.4*evoSkillScale(e))});
        }
        blip(1200,.10,'triangle',.04);
      }
    }
    break;

  case 'flak':              /* 플랙 하울러 — 대각선 대형 미사일 + 시야 차단 연막탄 */
    e.mv=dist<380?.25:.85;
    e.fireGap=e.fire;
    if(e.aiT<=0){ e.aiT=4000;
      for(const sgn of [-1,1])                         // 좌우 대각선으로 4발씩
        eVolley(e,ang+sgn*0.42,4,.075,{bspd:3.2,dmg:e.bdmg*.8,c:'#FFB05A',
                                       splashR:26,big:true,jitter:.03});
      S.shake=Math.max(S.shake,90);
    }
    e.smokeCd=(e.smokeCd||6000)-dt;
    if(e.smokeCd<=0){ visualFire(e,'missile',ang); e.smokeCd=9000+Math.random()*3000;
      const d2=Math.min(dist,420);
      const sx=e.x+Math.cos(ang)*d2, sy=e.y+Math.sin(ang)*d2;
      evoSkillHazard(e,{k:'bomb',x:sx,y:sy,r:8,max:70,life:900,
                 dmg:Math.round(e.bdmg*.9*evoSkillScale(e)),smoke:true});
      evoSkillHazard(e,{k:'smoke',x:sx,y:sy,r:210,life:7000});
      blip(150,.30,'triangle',.05);
    }
    break;

  case 'wasp':              /* 시즈 와스프 — 10초 폭격 → 이탈 → 융단폭격 재진입 */
    if(e.wstate===undefined){ e.wstate='bomb'; e.aiT=10000; }
    if(e.wstate==='bomb'){
      e.ph=(e.ph||0)+dt*.0022;
      { const s2=Math.sin(e.ph)*3.0*sl*dt/16;          // 좌우로 크게 이동
        e.x+=Math.cos(ang+Math.PI/2)*s2; e.y+=Math.sin(ang+Math.PI/2)*s2; }
      e.mv=dist<300?.3:1;
      e.fireGap=e.fire;
      e.bombCd=(e.bombCd||0)-dt;
      if(e.bombCd<=0){ visualFire(e,'missile',ang); e.bombCd=1000;                  // 1초마다 시한폭탄 투하
        evoSkillHazard(e,{k:'bomb',x:e.x,y:e.y+16,r:8,max:96,life:1000,
                   dmg:Math.round(e.bdmg*1.1*evoSkillScale(e))}); }
      if(e.aiT<=0){ e.wstate='leave'; e.aiT=900; e.noFire=true;
        S.fx.push({k:'txt',x:e.x,y:e.y-40,life:1200,t:1200,s:T('tCarpet'),c:'#FF8A5A'});
        blip(420,.5,'triangle',.05); }
      break;
    }
    if(e.wstate==='leave'){                            // 하늘로 빠르게 이탈
      e.mv=0; e.noFire=true;
      e.y-=1.6*dt/16*4;
      if(e.aiT<=0){ e.gone=true; e.wstate='away'; e.aiT=3000; }
      break;
    }
    if(e.wstate==='away'){                             // 화면 밖에서 대기
      e.mv=0; e.noFire=true; e.gone=true;
      if(e.aiT<=0){                                    // 플레이어 위를 가로지르며 융단폭격
        e.gone=false; e.wstate='run'; e.aiT=2600;
        e.runDir=((e.side==='ally'?S.px:aimX)>WORLD.w/2)?-1:1;
        e.x=e.side==='ally'?evoClamp(S.px-e.runDir*145,40,WORLD.w-40):(e.runDir>0?Math.max(40,aimX-WORLD.w*.30):Math.min(WORLD.w-40,aimX+WORLD.w*.30));
        e.y=(e.side==='ally'?S.py-85:aimY-40)+(Math.random()-.5)*60;if(e.side==='ally')e.evoEscortReentry=true;
        e.dropCd=0; e.dropped=0;
        S.shake=Math.max(S.shake,140);
      }
      break;
    }
    /* run — 직선으로 지나가며 폭탄 15발을 즉시 폭발시킵니다 */
    e.mv=0; e.noFire=true;
    e.x+=e.runDir*6.2*sl*dt/16;
    e.dropCd-=dt;
    if(e.dropCd<=0 && e.dropped<15){
      visualFire(e,'missile',ang); e.dropCd=150; e.dropped++;
      evoSkillShock(e,e.x,e.y+18,86,Math.round(e.bdmg*.95*evoSkillScale(e)));
      for(let q=0;q<8;q++) S.fx.push({k:'ember',x:e.x,y:e.y+18,
        vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:460,t:460,c:'#FF9A4A'});
    }
    if(e.aiT<=0 || e.dropped>=15 && (e.x<20||e.x>WORLD.w-20)){
      e.wstate='bomb'; e.aiT=10000; e.bombCd=0;        // 원래 패턴으로 복귀
    }
    break;
  }
}
/* 다음 발사에 특수 속성을 실어 보내는 자리.
   지금은 쓰는 유닛이 없지만, 스턴·끌어당김 탄을 만들 때 다시 쓸 수 있게 남겨 둡니다. */
function eOpt(e,tag,opt){ e._opt=opt; }

function fireFrom(u,ang,from){
  visualFire(u, null, ang, u.ways||(u.twoWay?2:1));
  const n=u.ways||(u.twoWay?2:1), sp=u.spread||.15;
  /* 계급 배수를 화력에도 반영하되, 탄이 늘어난 만큼은 나눠 총량을 완만하게 유지합니다 */
  const dmg = from==='ally' ? Math.max(1, Math.round(
                (1+S.allyPwr+relicVal('r_link')+(u.dmgBonus||0))*(u.rankMul||1)
                / Math.max(1,(u.ways||1)*0.62)))
                            : Math.round((u.bdmg||8)*enemyDmgScale());
  for(let i=0;i<n;i++){
    const a=ang+(i-(n-1)/2)*sp;
    const b={x:u.x+Math.cos(ang)*(u.r+4),y:u.y+Math.sin(ang)*(u.r+4),
      vx:Math.cos(a)*u.bspd,vy:Math.sin(a)*u.bspd,
      c: from==='ally' ? (u.elite?'#9BD4FF':'#5B9BE8') : (u.color||'#FF7A4A'),
      splash:false,dmg,el:null,from,_visualKind:visualRig(u).shot,
      splashR:u.splashR||0, homing:(from==='ally')&&!!u.homing, legend:!!u.elite};
    visualBindBullet(b,u);
    if(from==='ally') S.bullets.push(b); else S.ebullets.push(b);
  }
}

/* 화염 확산 — 겹치는 원 + 불씨로 퍼지는 느낌을 냅니다 */
function burstFire(x,y,r){
  visualExplosion(x,y,r);
  S.fx.push({k:'burst',x,y,r:r*.3,max:r,life:300,t:300,c:'#FFC24A'});
  S.fx.push({k:'burst',x,y,r:r*.15,max:r*.72,life:400,t:400,c:'#E8552F'});
  const n=6+Math.round(r/9);
  for(let i=0;i<n;i++){ const a=Math.random()*6.283, sp=.8+Math.random()*2.2;
    S.fx.push({k:'ember',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
      life:340+Math.random()*260,t:340,c:i%3?'#FF9A3A':'#FFD98A'});
  }
}

/* ===================== 레전드 무기 ======================================
   종류: gatling(부채꼴 연사) / missile(유도 없는 폭발탄) / side(좌우 산탄)
        rear(후방 장거리) / seeker(추적) / laser(관통) / radial(전방위)
        chain(연쇄 레이저) / spin(회전 관통 레이저)                        */
function pushBullet(o){ S.bullets.push(o); }
function muzzle(x,y,ang,c,sz){
  S.fx.push({k:'muzzle',x,y,a:ang,life:110,t:110,c:c||'#FFD9A0',r:sz||10});
}
function legendBullet(u,ang,w,kind,extra){
  const sp=w.bspd||8, dmg=(w.dmg||5)*(u.dmgMul||1)*(1+.25*Math.min(3,S.allyPwr||0));
  const b={x:u.x+Math.cos(ang)*(u.r+6), y:u.y+Math.sin(ang)*(u.r+6),
    vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, dmg, from:'ally', kind,
    splashR:w.splashR||0, big:!!w.big, range:w.range||400, trav:0, el:null,_visualKind:w.big?'shell':kind};
  Object.assign(b, extra||{});
  visualBindBullet(b,u);
  pushBullet(b);
}
function fireWeapon(u,w,dt){
  const foe=u.isLegend?nearestTarget(u.x,u.y,w.range||400):nearestEnemy(u.x,u.y,w.range||400);
  w.t0-=dt;
  if(w.t==='chain' || w.t==='spin'){
    if(w.on>0){ w.on-=dt; return; }         // 지속 공격 중에는 아래 발사 로직을 건너뜁니다
  }
  if(w.t0>0) return;
  const ang=foe?Math.atan2(foe.y-u.y,foe.x-u.x):u.face;

  if(w.t==='gatling'){
    if(!foe) { w.t0=w.cd; return; }
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const a=ang+(Math.random()-.5)*(w.spread||.3);
    legendBullet(u,a,w,'vulcan');
    muzzle(u.x+Math.cos(ang)*u.r, u.y+Math.sin(ang)*u.r, ang, '#FFE08A', 9);
    blip(1500+Math.random()*300,.025,'square',.012);
  }
  else if(w.t==='missile'){
    if(!foe){ w.t0=w.cd*.4; return; }
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const n=w.n||1, sd=(w.spreadDeg||0)*Math.PI/180;
    for(let i=0;i<n;i++){
      const a=ang+(n>1?(i-(n-1)/2)*sd:0);
      legendBullet(u,a,w,'missile');
    }
    muzzle(u.x+Math.cos(ang)*u.r,u.y+Math.sin(ang)*u.r,ang,'#FFB05A',14);
    noise(.06,.035);
  }
  else if(w.t==='side'){
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const sd=(w.spreadDeg||30)*Math.PI/180, n=w.n||5;
    for(const base of [ang-Math.PI/2, ang+Math.PI/2])
      for(let i=0;i<n;i++) legendBullet(u,base+(i-(n-1)/2)*sd/n,w,'missile',{small:true});
    noise(.05,.03);
  }
  else if(w.t==='rear'){
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const sd=(w.spreadDeg||14)*Math.PI/180, n=w.n||2, back=ang+Math.PI;
    for(let i=0;i<n;i++) legendBullet(u,back+(i-(n-1)/2)*sd,w,'missile');
    noise(.06,.035);
  }
  else if(w.t==='radial'){
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const n=w.n||6;
    for(let i=0;i<n;i++) legendBullet(u, u.face+i*6.283/n, w, 'vulcan');
    blip(900,.05,'square',.02);
  }
  else if(w.t==='seeker'){
    if(!foe){ w.t0=w.cd*.3; return; }
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    const targets=[];
    for(const e of S.enemies){ if(e.side==='enemy' && Math.hypot(e.x-u.x,e.y-u.y)<w.range) targets.push(e); }
    targets.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
    for(let i=0;i<Math.min(w.n||4,targets.length);i++){
      const t=targets[i], a=Math.atan2(t.y-u.y,t.x-u.x)+(Math.random()-.5)*.8;
      legendBullet(u,a,w,'missile',{homing:true, seekId:t});
    }
    noise(.07,.04);
  }
  else if(w.t==='laser'){
    if(!foe){ w.t0=w.cd*.3; return; }
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd;
    S.lasers.push({kind:'beam',x:u.x,y:u.y,a:ang,len:w.range,life:w.life||220,t:w.life||220,
      width:w.width||8,dmg:w.dmg*(u.dmgMul||1)*(1+.25*Math.min(3,S.allyPwr||0)),hit:new Set(),c:'#8FE8FF'});
    noise(.09,.05); blip(300,.14,'sawtooth',.05);
  }
  else if(w.t==='chain'){
    if(!foe){ w.t0=w.cd*.3; return; }
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd; w.on=w.dur; w.tickCd=0; w.owner=u;
    u.channel=w.dur;                                   // 공격 중엔 아주 느리게 이동
    noise(.1,.05);
  }
  else if(w.t==='spin'){
    visualFire(u,w.big?'shell':w.t,ang,w.n||1);
    w.t0=w.cd; w.on=w.dur; w.ang=u.face; w.tickCd=0;
    noise(.1,.05);
  }
}
/* 지속형 무기(연쇄·회전)의 매 프레임 처리 */
function tickChannel(u,w,dt){
  if(w.on<=0) return;
  w.on-=dt; w.tickCd-=dt;
  if(w.t==='chain'){
    u.channel=w.on;
    if(w.tickCd<=0){
      w.tickCd=w.tick||220;
      let src=u;
      const chain=[];
      for(let i=0;i<(w.links||4);i++){
        let best=null,bd=(i?260:w.range)**2;
        for(const e of S.enemies){
          if(e.side!=='enemy'||chain.includes(e)) continue;
          const d=(e.x-src.x)**2+(e.y-src.y)**2;
          if(d<bd){bd=d;best=e;}
        }
        if(!best) break;
        chain.push(best);
        S.lasers.push({kind:'link',x1:src.x,y1:src.y,x2:best.x,y2:best.y,
          life:200,t:200,width:4,c:'#C89BFF'});
        damageUnit(best,w.dmg*(u.dmgMul||1)*(1+.25*Math.min(3,S.allyPwr||0)),null,true);
        S.fx.push({k:'spark',x:best.x,y:best.y,vx:(Math.random()-.5)*2,vy:-Math.random()*1.5,
          life:300,t:300,c:'#C89BFF'});
        src=best;
      }
    }
    if(w.on<=0){                                       // 공격이 끝나면 플레이어 곁으로 순간이동
      const a=Math.random()*6.283;
      S.fx.push({k:'ring',x:u.x,y:u.y,r:4,max:60,life:380,t:380,c:'#C89BFF'});
      u.x=S.px+Math.cos(a)*90; u.y=S.py+Math.sin(a)*90;
      S.fx.push({k:'ring',x:u.x,y:u.y,r:4,max:60,life:380,t:380,c:'#C89BFF'});
      u.channel=0; blip(700,.12,'triangle',.05);
    }
  }
  else if(w.t==='spin'){
    w.ang+=(w.spin||.0016)*dt;
    if(w.tickCd<=0){
      w.tickCd=w.tick||170;
      for(let i=0;i<(w.arms||3);i++){
        S.lasers.push({kind:'beam',x:u.x,y:u.y,a:w.ang+i*6.283/(w.arms||3),len:w.range,
          life:200,t:200,width:7,dmg:w.dmg*(u.dmgMul||1)*(1+.25*Math.min(3,S.allyPwr||0)),hit:new Set(),c:'#FFA24A'});
      }
    }
  }
}
/* 레이저 판정 + 수명 */
function updateLasers(dt){
  for(let i=S.lasers.length-1;i>=0;i--){
    const L=S.lasers[i]; L.t-=dt;
    if(L.kind==='beam' && L.dmg){
      for(const e of S.enemies){
        if(e.side!=='enemy'||L.hit.has(e)) continue;
        const dx=e.x-L.x, dy=e.y-L.y;
        const along=dx*Math.cos(L.a)+dy*Math.sin(L.a);
        const perp=-dx*Math.sin(L.a)+dy*Math.cos(L.a);
        if(along>0&&along<L.len&&Math.abs(perp)<L.width/2+e.r){
          L.hit.add(e); damageUnit(e,L.dmg,null,true);
          S.fx.push({k:'spark',x:e.x,y:e.y,vx:(Math.random()-.5)*2,vy:-Math.random()*1.6,life:320,t:320,c:L.c});
        }
      }
    }
    if(L.t<=0) S.lasers.splice(i,1);
  }
}

function hitTurret(t,dmg){
  visualFX({k:'spark',x:t.x,y:t.y,vx:0,vy:-48,life:160,c:'#EAC598'});
  t.hp-=dmg; t.flash=110; S.shake=Math.max(S.shake,80);
  S.fx.push({k:'part',x:t.x+(Math.random()-.5)*40,y:t.y-10,vx:(Math.random()-.5)*4,vy:-Math.random()*3,life:300,t:300,c:'#FFB05A'});
  noise(.05,.04);
  if(t.hp<=0){
    visualFX({k:'flash',x:t.x,y:t.y,r:29,life:150,c:'#FFE0A0',radial:true});
    t.alive=false; S.score+=1500; S.shake=340;
    for(let i=0;i<26;i++) S.fx.push({k:'part',x:t.x+(Math.random()-.5)*70,y:t.y+(Math.random()-.5)*50,
      vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:700,t:700,c:i%2?'#FFB05A':'#D6453A'});
    S.fx.push({k:'ring',x:t.x,y:t.y,r:6,max:120,life:520,t:520,c:'#FF8A3A'});
    noise(.4,.11); blip(90,.5,'sawtooth',.09);
  }
}

function damageUnit(e,dmg,el,silent){
  if(isHero(e)){heroDamage(e,dmg,el);return;}
  if(isVelcarion(e)){if(e.vc.dead)return;dmg*=1-(e.armor||0);}
  /* Step 2 훈련 포획 유닛은 자동사격으로 제거되지 않습니다. 흡수 연습 전용입니다. */
  if(e.tutorial && S && S.tutorial && S.tutStep===1){ e.hp=e.hpMax; return; }
  e.hp-=dmg; visualHit(e);
  if(el==='FREEZE'){ const c=elemCfg('FREEZE'); e.slow=c.ms; e.slowMul=c.mul; }
  if(el==='POISON'){ const c=elemCfg('POISON'); e.poison=c.ms; e.poisonTick=c.tick; e.poisonCd=c.tick;
    for(let i=0;i<4;i++) S.fx.push({k:'spark',x:e.x,y:e.y,vx:(Math.random()-.5)*2,vy:-Math.random()*1.6-.4,life:520,t:520,c:'#9BE87F'}); }
  if(!silent) S.fx.push({k:'part',x:e.x,y:e.y,vx:(Math.random()-.5)*3,vy:-Math.random()*2,life:240,t:240,c:'#FFD9A0'});
  if(e.hp<=0 && e.deathBoom){
    burstFire(e.x,e.y,e.deathBoom);
    for(const o of S.enemies) if(o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<e.deathBoom)
      { o.hp-=30; }
    S.shake=340; noise(.5,.12);
  }
  if(e.hp<=0){
    const i=S.enemies.indexOf(e); if(i<0) return;
    velcaDeath(e);
    visualDeath(e);
    S.enemies.splice(i,1); S.kills++; S.killed++; S.score+=e.score; S.shake=Math.max(S.shake,80);
    META.totalKills=(META.totalKills|0)+1;
    for(let k=0;k<10;k++) S.fx.push({k:'part',x:e.x,y:e.y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:420,t:420,c:'#FF9A5A'});
    noise(.09,.05);
    evoDropSupply(e);
  }
}

function damagePlayer(amount){

  if(S.invuln>0) return;
  if(S.shield){ S.shield=false; S.invuln=800; S.shake=180;   // 보호막은 피해를 통째로 무효화
    S.fx.push({k:'ring',x:S.px,y:S.py,r:4,max:58,life:320,t:320,c:'#9BE87F'});
    blip(300,.16,'triangle',.07); return; }
  const dmg=Math.max(1,Math.round((amount||8)*(1-armorCut())));
  S.hp-=dmg; visualHit(S); S.hits++; S.invuln=TUNE.invulnMs; S.shake=Math.min(300,120+dmg*6);
  S.fx.push({k:'txt',x:S.px,y:S.py-34,life:700,t:700,s:'-'+dmg,c:'#FF8A7A'});
  for(let i=0;i<10;i++) S.fx.push({k:'part',x:S.px,y:S.py,vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:460,t:460,c:'#E8B33C'});
  noise(.18,.08); blip(110,.26,'sawtooth',.06);
  if(S.hp<=0){ S.hp=0; visualDeath(S); gameOver(); }
}

function pickup(k,src){
  blip(1250,.07,'square',.05); blip(1650,.09,'square',.04);
  const d=ITEMS[k];
  if(k==='PWR') S.itemDmg++;
  else if(k==='RATE') S.itemRate++;
  else if(k==='WAY') S.ways=Math.min(5,S.ways+1);
  else if(k==='SPD') S.spd=Math.min(TUNE.spdStackMax,S.spd+1);       // 5개가 최대
  else if(k==='SHLD') S.shield=true;                                  // 중첩 없음
  else if(k==='SLOT') S.itemSlot++;
  else if(k==='APWR') S.allyPwr++;
  else if(k==='HEAL') S.hp=Math.min(maxHp(), S.hp+evoHealAmount(S.stage));
  else if(k==='SUMMON'){                       // 보유한 레전드 중 하나를 무작위 소환
    const own=legendOwned();
    if(own.length){
      const key=own[(Math.random()*own.length)|0];
      const a=Math.random()*6.283;
      pushAlly(makeLegend(key,S.px+Math.cos(a)*80,S.py+Math.sin(a)*80,'ally'));
      S.fx.push({k:'ring',x:S.px,y:S.py,r:4,max:110,life:520,t:520,c:'#FFC24A'});
      S.fx.push({k:'txt',x:S.px,y:S.py-52,life:1400,t:1400,s:nm(key)+' '+T('summoned'),c:'#FFD75A'});
      blip(660,.14,'triangle',.08); blip(990,.2,'triangle',.06);
    }
  }
  else if(ELEMENTS.includes(k)){ S.element=k;                          // 속성탄은 서로 교체
    S.elemStack[k]=Math.min(3,(S.elemStack[k]||0)+1); }
  S.itemsTaken[k]=(S.itemsTaken[k]||0)+1; S.itemGot++;
  if(src&&src.tutorial&&S.tutorial&&S.tutStep===2){
    S.tutorialItemPicked=true; S.tutStep=3; $('tutorial').classList.remove('on');
    setTimeout(()=>{ if(S&&S.tutorial&&S.tutStep===3) showTutorialOverlay('items'); },180);
  }
  if(k==='HEAL') S.healUsed++;
  if(k==='SUMMON') S.summonUsed++;
  const lvTxt = ELEMENTS.includes(k) ? ' Lv'+S.elemStack[k] : '';
  S.fx.push({k:'txt',x:S.px,y:S.py-42,life:900,t:900,s:d.name+lvTxt,c:d.c});
}

/* ================================ 렌더 =================================== */
/* 지면은 상하좌우가 이어지는 타일이라 그냥 반복해도 이음매가 없습니다.
   숲·산 테두리는 월드 양쪽 끝에만 그립니다 — 예전처럼 맵 한가운데에
   테두리끼리 맞붙어 세로 띠가 생기는 문제가 사라집니다. */
function drawBG(){
  const th=S?S.theme:THEMES[0];
  const g=IMG[th.grass], bd=IMG[th.border];
  const cx=S?S.cam.x:0, cy=S?S.cam.y:performance.now()*.02;
  if(!g){ ctx.fillStyle=th.fallback; ctx.fillRect(0,0,W,H); return; }
  drawVisualGround(th,cx,cy);
  if(bd){
    /* 가장자리 띠도 한 칸 걸러 상하를 뒤집어 반복감을 줄입니다 */
    const artScale=MOBILE_DEVICE?1.5:2,bw=bd.width/artScale,bh=bd.height/artScale;
    for(let j=Math.floor(cy/bh); j*bh<cy+H; j++){
      const y=j*bh-cy, flip=(j&1)?-1:1;
      ctx.save(); ctx.translate(0-cx, y+bh/2); ctx.scale(1,flip);
      ctx.drawImage(bd, 0, -bh/2, bw, bh); ctx.restore();        // 왼쪽 끝
      ctx.save(); ctx.translate(WORLD.w-cx, y+bh/2); ctx.scale(-1,flip);
      ctx.drawImage(bd, 0, -bh/2, bw, bh); ctx.restore();        // 오른쪽은 좌우 반전
    }
  }
}

/* 유닛 스프라이트를 진행 방향으로 회전해 그립니다.
   원본 아트는 모두 '아래쪽(남쪽)'을 보고 있으므로 -90도가 기준입니다. */
/* FIELD OF IMMORTALS — mechanical presentation layer.
 * All coordinates below are normalized ORIGINAL-image coordinates (+Y = nose).
 * No world positions, hitboxes, weapons, cooldowns or gameplay RNG are modified.
 * Parts use the existing decoded/tinted art, with localized socket/alpha repairs.
 */
const VISUAL = {
  owner:null, stage:null, states:new WeakMap(), cache:new WeakMap(),
  bullets:new WeakMap(), origins:new WeakMap(), fx:[], wrecks:[], decals:[], time:0, serial:0,
  maxFX:MOBILE_DEVICE?150:260, maxWrecks:MOBILE_DEVICE?14:24,
};
const vRect=(mode,x0,y0,x1,y1,px=(x0+x1)/2,py=y0,extra={})=>
  ({mode,poly:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],pivot:[px,py],...extra});
const vGun=(x0,y0,x1,y1,extra={})=>vRect('gun',x0,y0,x1,y1,(x0+x1)/2,y0,extra);
const vLeg=(x0,y0,x1,y1,side,extra={})=>vRect('leg',x0,y0,x1,y1,(x0+x1)/2,y0,{side,...extra});
const vTread=(x0,y0,x1,y1)=>vRect('tread',x0,y0,x1,y1);
const vFan=(x,y,rx,ry=rx)=>({mode:'fan',ellipse:[x,y,rx,ry],pivot:[x,y]});
const vWheel=(x,y,rx,ry)=>({mode:'wheel',ellipse:[x,y,rx,ry],pivot:[x,y]});
const vPod=(x0,y0,x1,y1,side)=>vRect('pod',x0,y0,x1,y1,(x0+x1)/2,y0,{channel:'missile',side,slot:'pod'+side,tip:[(x0+x1)/2,y1-.025]});
const V_RIG={
  main:{kind:'hover',shot:'shell',recoil:1.15,vents:[[.16,.69],[.84,.69]],parts:[
    vGun(.43,.66,.57,.99),vRect('radar',.34,.02,.65,.28,.5,.20)]},
  infantry:{kind:'authored',shot:'rifle',stride:21,muzzle:[.10,.61],parts:[]},
  e_guard:{kind:'walk',shot:'rifle',stride:24,gait:{hip:.14,knee:.22,lift:1.1},parts:[
    vLeg(.04,.61,.48,1,-1,{pivot:[.31,.64]}),vLeg(.51,.61,.97,1,1,{pivot:[.64,.64]}),
    {mode:'aimGun',poly:[[.27,.435],[.48,.44],[.995,.53],[.999,.64],[.47,.62],[.28,.55]],erase:[[.26,.435],[.50,.435],[1,.52],[1,.66],[.52,.65],[.34,.62],[.25,.55]],pivot:[.39,.50],tip:[.95,.57],anchor:[.50,.48],shorten:.64,cover:[.29,.44,.78,.66],sample:[.27,.32,.73,.43],shade:.20}]},
  e_missile:{kind:'walk',shot:'rifle',stride:22,gait:{hip:.14,knee:.23,lift:1.1},parts:[
    vLeg(.12,.67,.44,1,-1,{pivot:[.32,.70]}),vLeg(.55,.67,.90,1,1,{pivot:[.64,.70]}),
    {mode:'aimGun',poly:[[.23,.47],[.45,.50],[.96,.64],[.97,.74],[.52,.67],[.22,.58]],erase:[[.23,.465],[.48,.495],[.99,.635],[.99,.76],[.53,.70],[.21,.60]],pivot:[.39,.55],tip:[.91,.69],anchor:[.50,.53],shorten:.65,cover:[.29,.48,.78,.70],sample:[.26,.38,.73,.48],shade:.28},
    vPod(.08,.09,.28,.28,-1),vPod(.68,.09,.88,.28,1)]},
  e_bruiser:{kind:'walk',shot:'shell',stride:32,recoil:1.5,gait:{hip:.15,knee:.24,lift:1.0},parts:[
    vLeg(.26,.59,.48,.85,-1,{pivot:[.38,.61]}),vLeg(.50,.59,.73,.85,1,{pivot:[.60,.61]}),vGun(.20,.45,.29,.61),vGun(.71,.47,.79,.61,{side:1})]},
  e_warbrute:{kind:'walk',shot:'shell',stride:35,recoil:1.8,gait:{hip:.10,knee:.18,lift:.95},parts:[
    {mode:'leg',side:-1,poly:[[.27,.46],[.40,.49],[.41,.66],[.36,.86],[.14,.86],[.22,.67]],pivot:[.34,.49]},
    {mode:'leg',side:1,poly:[[.67,.47],[.82,.49],[.85,.66],[.93,.87],[.70,.87],[.64,.67]],pivot:[.74,.50]},vGun(.45,.45,.55,.64)]},
  apc:{kind:'wheel',shot:'shell',stride:22,recoil:1.0,parts:[vWheel(.115,.765,.064,.183),vWheel(.884,.765,.064,.183),vGun(.41,.67,.57,.95)]},
  tank:{kind:'track',shot:'shell',stride:29,recoil:1.25,parts:[vTread(.035,.79,.17,.96),vTread(.81,.79,.96,.96),vGun(.45,.73,.55,.97)]},
  legend_bike:{kind:'wheel',shot:'rifle',stride:22,parts:[vTread(.41,.72,.59,.96),vGun(.00,.28,.14,.54),vGun(.83,.35,.95,.54,{side:1})]},
  e_rider:{kind:'wheel',shot:'rifle',stride:24,parts:[vTread(.23,.80,.38,.97),vTread(.63,.80,.77,.97),vGun(.02,.45,.15,.75),vGun(.85,.45,.97,.75,{side:1})]},
  e_spike:{kind:'wheel',shot:'rifle',stride:25,parts:[vWheel(.135,.297,.061,.095),vWheel(.855,.297,.061,.095),vWheel(.135,.761,.061,.128),vWheel(.855,.761,.061,.128),vGun(.00,.49,.06,.64),vGun(.93,.49,1,.64,{side:1})]},
  e_rocket:{kind:'track',shot:'shell',stride:30,recoil:1.2,parts:[vTread(.05,.74,.16,.97),vTread(.84,.74,.95,.97),vGun(.42,.58,.58,.92),vGun(.08,.15,.29,.39,{channel:'missile',tip:[.19,.37]}),vGun(.70,.15,.91,.39,{channel:'missile',side:1,tip:[.80,.37]})]},
  e_mole:{kind:'track',shot:'shell',stride:34,recoil:1.1,parts:[vTread(.04,.75,.14,.88),vTread(.86,.75,.96,.88),{mode:'drill',poly:[[.45,.60],[.55,.60],[.59,.72],[.51,.88],[.43,.72]],pivot:[.5,.60]},vGun(.18,.10,.28,.30),vGun(.73,.10,.83,.30,{side:1})]},
  e_flak:{kind:'track',shot:'shell',stride:34,recoil:1.2,parts:[vTread(.07,.78,.17,.97),vTread(.84,.78,.94,.97),vPod(.12,.17,.29,.37,-1),vPod(.74,.17,.91,.37,1),vGun(.43,.69,.57,.92)]},
  e_sentry:{kind:'fixed',shot:'shell',recoil:1.0,parts:[vGun(.32,.33,.43,.57),vGun(.52,.33,.62,.57,{side:1})]},
  heli:{kind:'rotor',shot:'rifle',parts:[vFan(.137,.414,.084,.0815),vFan(.692,.414,.084,.0815),vGun(.32,.61,.47,.87)]},
  e_hawk:{kind:'rotor',shot:'rifle',parts:[vFan(.138,.586,.081,.120),vFan(.862,.586,.081,.120),vGun(.425,.70,.565,.98)]},
  e_scout:{kind:'rotor',shot:'rifle',parts:[vFan(.307,.116,.16,.049),vGun(.265,.78,.355,.975)]},
  legend_ship:{kind:'jet',shot:'missile',jets:[[.30,.15],[.68,.15]],parts:[vGun(.30,.69,.41,.96),vGun(.58,.69,.69,.96,{side:1}),vRect('vane',.06,.47,.22,.70,.22,.52,{side:-1}),vRect('vane',.78,.47,.94,.70,.78,.52,{side:1})]},
  e_hover:{kind:'hover',shot:'shell',recoil:1.3,vents:[[.07,.69],[.94,.69]],parts:[vGun(.42,.36,.57,.66)]},
  e_volt:{kind:'hover',shot:'laser',vents:[[.085,.63],[.918,.63]],parts:[vRect('coil',.035,.35,.135,.71,.085,.53),vRect('coil',.868,.35,.968,.71,.918,.53)]},
  e_wasp:{kind:'jet',shot:'missile',jets:[[.35,.22],[.64,.22]],parts:[vGun(.45,.84,.55,.96,{channel:'rifle'}),vPod(.10,.54,.18,.70,-1),vPod(.81,.54,.90,.70,1),{mode:'vane',poly:[[.02,.25],[.26,.40],[.26,.46],[.02,.31]],pivot:[.26,.42],side:-1},{mode:'vane',poly:[[.98,.25],[.74,.40],[.74,.46],[.98,.31]],pivot:[.74,.42],side:1}]},
  L_vulcan:{kind:'wheel',shot:'rifle',stride:28,recoil:.75,parts:[vTread(.43,.75,.57,.96),vGun(.08,.60,.17,.80),vGun(.43,.57,.56,.75),vGun(.83,.60,.92,.80,{side:1})]},
  L_gunship:{kind:'jet',shot:'rifle',jets:[[.34,.17],[.66,.17]],parts:[vGun(.46,.79,.54,.96),vGun(.03,.47,.12,.64,{channel:'missile'}),vGun(.88,.47,.97,.64,{channel:'missile',side:1})]},
  L_cannon:{kind:'track',shot:'shell',stride:34,recoil:1.3,parts:[vTread(.05,.80,.18,.95),vTread(.83,.80,.95,.95),{mode:'gun',poly:[[.44,.29],[.57,.29],[.61,.78],[.55,.88],[.44,.88],[.39,.78]],pivot:[.50,.32]}]},
  L_twin:{kind:'hover',shot:'rifle',vents:[[.31,.70],[.68,.70]],parts:[vGun(.025,.58,.15,.94,{channel:'side',axis:[-.6,.8]}),vGun(.86,.58,.98,.94,{channel:'side',side:1,axis:[.6,.8]}),vGun(.46,.76,.55,.91)]},
  L_lancer:{kind:'jet',shot:'laser',jets:[[.45,.08],[.55,.08]],parts:[vGun(.46,.68,.54,.99,{channel:'laser'}),{mode:'vane',poly:[[.02,.43],[.32,.27],[.35,.35],[.02,.49]],pivot:[.32,.32],side:-1},{mode:'vane',poly:[[.98,.43],[.68,.27],[.65,.35],[.98,.49]],pivot:[.68,.32],side:1}]},
  L_sweeper:{kind:'hover',shot:'rifle',vents:[[.36,.53],[.64,.53]],parts:[
    vGun(.46,.02,.54,.32,{axis:[0,-1]}),vGun(.46,.70,.54,.98),
    {mode:'gun',poly:[[.05,.19],[.13,.16],[.37,.36],[.29,.44]],pivot:[.33,.39],axis:[-.78,-.62]},
    {mode:'gun',poly:[[.63,.36],[.87,.16],[.96,.20],[.71,.44]],pivot:[.68,.39],axis:[.78,-.62]},
    {mode:'gun',poly:[[.06,.79],[.30,.58],[.38,.66],[.14,.87]],pivot:[.33,.63],axis:[-.78,.62]},
    {mode:'gun',poly:[[.62,.65],[.71,.58],[.95,.79],[.87,.87]],pivot:[.67,.63],axis:[.78,.62]}]},
  L_cruiser:{kind:'jet',shot:'rifle',jets:[[.26,.14],[.75,.14]],parts:[...[.35,.42,.50,.59,.67].map(x=>vGun(x-.024,.77,x+.024,.96)),vGun(.04,.34,.12,.49,{channel:'side',axis:[-1,0],tip:[.04,.42]}),vGun(.87,.34,.95,.49,{channel:'side',side:1,axis:[1,0],tip:[.95,.42]}),vGun(.27,.04,.33,.15,{channel:'rear',axis:[0,-1],tip:[.30,.04]}),vGun(.67,.04,.73,.15,{channel:'rear',side:1,axis:[0,-1],tip:[.70,.04]})]},
  L_titan:{kind:'walk',shot:'shell',stride:38,recoil:1.3,gait:{hip:.10,knee:.17,lift:.85},parts:[{mode:'leg',side:-1,poly:[[.19,.41],[.32,.43],[.33,.59],[.26,.83],[.25,.97],[0,.98],[0,.85],[.08,.59]],pivot:[.25,.45]},{mode:'leg',side:1,poly:[[.81,.41],[.68,.43],[.67,.59],[.74,.83],[.75,.97],[1,.98],[1,.85],[.92,.59]],pivot:[.75,.45]},vGun(.43,.43,.58,.78),vPod(.25,.09,.34,.24,-1),vPod(.65,.09,.75,.24,1)]},
  L_phantom:{kind:'jet',shot:'laser',jets:[[.36,.17],[.63,.17]],parts:[vGun(.48,.65,.52,.92,{channel:'laser'}),{mode:'vane',poly:[[.17,.51],[.34,.37],[.37,.43],[.19,.64]],pivot:[.35,.41],side:-1},{mode:'vane',poly:[[.83,.51],[.66,.37],[.63,.43],[.81,.64]],pivot:[.65,.41],side:1}]},
  L_nova:{kind:'hover',shot:'laser',vents:[[.38,.57],[.63,.57]],parts:[vFan(.51,.62,.115,.1345),{mode:'orbit',poly:[[.43,0],[.58,0],[.61,.34],[.43,.34]],pivot:[.51,.62]},{mode:'orbit',poly:[[0,.84],[.25,.69],[.31,.81],[.08,1]],pivot:[.51,.62]},{mode:'orbit',poly:[[.77,.69],[1,.84],[1,1],[.70,.82]],pivot:[.51,.62]}]},
};
function visualKey(u){ return u===S?'main':u.type; }
function visualRig(u){ return V_RIG[visualKey(u)]||V_RIG.main; }
function visualXY(u){ return u===S?[S.px,S.py]:[u.x,u.y]; }
function visualState(u){
  if(VISUAL.owner!==S||VISUAL.stage!==(S&&S.stage)) visualReset();
  let v=VISUAL.states.get(u);
  if(!v){ const [x,y]=visualXY(u); v={x,y,face:u.face||0,speed:0,travel:0,phase:0,turn:0,hit:0,shots:{},shotId:0,dead:false}; VISUAL.states.set(u,v); }
  return v;
}
function visualReset(){
  VISUAL.owner=S; VISUAL.stage=S&&S.stage; VISUAL.states=new WeakMap(); VISUAL.bullets=new WeakMap();VISUAL.origins=new WeakMap();
  VISUAL.fx.length=0; VISUAL.wrecks.length=0; VISUAL.decals.length=0; VISUAL.time=0; VISUAL.serial=0;
}
// Cosmetic hash: never consumes the gameplay's Math.random stream.
function visualNoise(n){ const x=Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); }
function visualFX(f){
  if(!S) return;
  if(VISUAL.fx.length>=VISUAL.maxFX) VISUAL.fx.shift();
  VISUAL.fx.push({age:0,...f});
}
function visualStyle(u,style){
  if(style==='gatling'||style==='vulcan'||style==='radial') return 'rifle';
  if(style==='seeker'||style==='rear'||style==='side') return 'missile';
  if(style==='chain'||style==='spin') return 'laser';
  return style||visualRig(u).shot;
}
function visualAimGeometry(p,w,h){
  const px=(p.pivot[0]-.5)*w,py=(p.pivot[1]-.5)*h;
  const dx=(p.tip[0]-p.pivot[0])*w,dy=(p.tip[1]-p.pivot[1])*h;
  return {px,py,x:(p.anchor[0]-.5)*w,y:(p.anchor[1]-.5)*h,angle:Math.atan2(dy,dx),length:Math.hypot(dx,dy)*(p.shorten||1)};
}
function visualFireBase22(u,style,ang,count){
  if(!S) return;
  const v=visualState(u), rig=visualRig(u), raw=style||rig.shot;
  style=visualStyle(u,style); ang=ang===undefined?u.face:ang;
  const channel=raw==='side'||raw==='rear'?raw:style;
  v.shots[channel]={time:VISUAL.time,style,ang}; v.shotId++;
  const [x,y]=visualXY(u), w=u===S?ILL_PLAYER_W:u.w, img=IMG[u===S?'main':u.type==='infantry'?'inf_w0':u.img];
  if(!img) return;
  const h=w*img.height/img.width, rot=facingAngle(u);
  let guns=rig.parts.filter(p=>['gun','aimGun','pod'].includes(p.mode)&&(p.channel?p.channel===channel:channel===rig.shot));
  if(count===undefined)count=u.ways||1;
  const pods=guns.filter(p=>p.mode==='pod');
  if(pods.length&&count===1){guns=[pods[(v.podCycle||0)%pods.length]];v.podCycle=(v.podCycle||0)+1;}
  if(!guns.length) guns=[{tip:rig.muzzle||[.5,.94]}];
  v.muzzles=[];v.emitted=0;
  // A volley emits one brief flash per physical barrel/pod, never per pellet.
  for(const p of guns.slice(0,6)){
    const axis=p.axis||[0,1];let tip=p.tip;
    if(!tip&&p.poly){
      const projection=p.poly.map(q=>q[0]*axis[0]+q[1]*axis[1]),front=Math.max(...projection);
      const edge=p.poly.filter((q,i)=>front-projection[i]<.025);
      tip=[edge.reduce((s,q)=>s+q[0],0)/edge.length,edge.reduce((s,q)=>s+q[1],0)/edge.length];
    }
    tip=tip||[.5,.94];
    let lx=(tip[0]-.5)*w, ly=(tip[1]-.5)*h;
    const mount=facingMount(u,p,w,h);
    if(p.mode==='aimGun'){const aim=visualAimGeometry(p,w,h);lx=aim.x-Math.sin(mount.angle)*aim.length;ly=aim.y+Math.cos(mount.angle)*aim.length;}
    else if(mount.angle&&p.pivot){const px=(p.pivot[0]-.5)*w,py=(p.pivot[1]-.5)*h,dx=lx-px,dy=ly-py;lx=px+dx*Math.cos(mount.angle)-dy*Math.sin(mount.angle);ly=py+dx*Math.sin(mount.angle)+dy*Math.cos(mount.angle);}
    lx+=mount.x;ly+=mount.y;
    const fx=x+lx*Math.cos(rot)-ly*Math.sin(rot), fy=y+lx*Math.sin(rot)+ly*Math.cos(rot);
    if(p.slot)v.shots[p.slot]={time:VISUAL.time,style,ang};
    const flashAng=raw==='rear'?ang+Math.PI:raw==='side'?ang+(p.pivot&&p.pivot[0]<.5?1:-1)*Math.PI/2:raw==='radial'?Math.atan2(axis[1],axis[0])+rot:ang;
    v.muzzles.push({x:fx,y:fy,a:flashAng});
    visualFX({k:'flash',x:fx,y:fy,a:flashAng,life:style==='shell'?105:style==='laser'?130:65,r:style==='shell'?9:style==='missile'?6:4,c:style==='laser'?TEAM_ENERGY[u.side==='ally'?'ally':'enemy'].color:TEAM_SHOT[u===S?'player':u.side==='ally'?'ally':'enemy'].color});
    if(style==='shell'||style==='missile') visualFX({k:'smoke',x:fx,y:fy,vx:Math.cos(flashAng)*8,vy:Math.sin(flashAng)*8,life:360,r:3,c:'#A19A8D'});
    if(p.mode==='pod')visualFX({k:'launch',x:fx,y:fy,a:flashAng,life:180,r:3,c:TEAM_SHOT[u.side==='ally'?'ally':'enemy'].color});
  }
}
function visualBindBullet(b,u){
  const v=visualState(u);if(!v.muzzles||!v.muzzles.length)return;
  // Correct ONLY the early visible launch point. Collision continues to use b.x/y.
  const origin=v.muzzles[(v.emitted++)%v.muzzles.length];
  VISUAL.origins.set(b,{dx:origin.x-b.x,dy:origin.y-b.y});
}
function visualBulletPosition(b){
  const o=VISUAL.origins.get(b),fade=o?Math.pow(Math.max(0,1-(b.life||0)/150),2):0;
  return {x:b.x+(o?o.dx*fade:0),y:b.y+(o?o.dy*fade:0)};
}
function visualHit(u){
  if(!S) return;
  const v=visualState(u); v.hit=85;
  const [x,y]=visualXY(u), id=++VISUAL.serial;
  for(let i=0;i<3;i++){
    const a=visualNoise(id*5+i)*Math.PI*2, speed=35+visualNoise(id+i+4)*35;
    visualFX({k:'spark',x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:135+visualNoise(id+i+8)*95,c:u.side==='ally'?'#B2D5EB':'#E9C89A'});
  }
}
function visualImage(u,key){
  let img=u.side==='ally'?(TINT.ally[key]||IMG[key]):u.side==='neutral'?(TINT.neutral[key]||IMG[key]):IMG[key];
  if(u.slow>0&&TINT.frost[key]) img=u.side==='ally'?(EVO_PALETTE.frost[key]||TINT.ally[key]):TINT.frost[key];
  return img;
}
function visualDeath(u){
  if(!S) return;
  if(isHero(u)&&u.hp<=0){heroDeath(u);return;}
  if(isVelcarion(u)&&u.side==='ally'&&u.hp<=0)velcaDeath(u);
  const v=visualState(u); if(v.dead) return; v.dead=true;
  const key=u===S?'main':(animFrame(u,v.speed)||u.img), img=visualImage(u,key);
  if(!img) return;
  const [x,y]=visualXY(u), rig=visualRig(u), w=u===S?ILL_PLAYER_W:u.w, id=++VISUAL.serial;
  if(VISUAL.wrecks.length>=VISUAL.maxWrecks) VISUAL.wrecks.shift();
  const facing=rig.artAngle?{angle:0,mirror:u.type==='v_revenant'?1:facingIsoMirror(u)}:null;
  VISUAL.wrecks.push({x,y,w,h:w*img.height/img.width,img,rig,face:facing?facing.angle+Math.PI/2:facingState(u).heading,mirror:facing?facing.mirror:1,age:0,life:rig.kind==='walk'||rig.kind==='authored'?680:950,id});
  const infantry=rig.kind==='walk'||rig.kind==='authored', air=['jet','rotor','hover'].includes(rig.kind);
  if(!infantry){
    visualExplosion(x,y,w*.8);
    for(let i=0;i<4;i++) visualFX({k:'smoke',x:x+(visualNoise(id+i)-.5)*w*.35,y:y+(visualNoise(id+6+i)-.5)*w*.3,vx:(visualNoise(id+i+11)-.5)*16,vy:-10-visualNoise(id+i+17)*9,life:700+i*70,r:w*.12,c:'#6D6861'});
  }
  for(let i=0;i<(infantry?4:8);i++){
    const a=visualNoise(id*17+i)*6.283, speed=(air?55:35)+visualNoise(id*3+i)*45;
    visualFX({k:'spark',x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:250+visualNoise(id+i)*250,c:i%2?'#CEAE7F':'#E9D2A4'});
  }
}
function visualUpdate(dt){
  if(!S) return;
  if(VISUAL.owner!==S||VISUAL.stage!==S.stage) visualReset();
  if(mode!=='play'&&mode!=='over') return; // Pause/upgrade/tutorial poses stay still.
  VISUAL.time+=dt;cgTurretTick(dt);
  for(let i=VISUAL.decals.length-1;i>=0;i--){const d=VISUAL.decals[i];d.age+=dt;if(d.age>=d.life)VISUAL.decals.splice(i,1);}
  if(mode==='play'){
    for(const u of [S,...S.enemies,...S.allies]){
      const v=visualState(u), [x,y]=visualXY(u), rig=visualRig(u), dx=x-v.x, dy=y-v.y, d=Math.hypot(dx,dy);
      if(u===S&&S.hp>0&&v.dead){ v.dead=false; VISUAL.wrecks.length=0; }
      // Do not count teleports, pull snaps, offscreen re-entry or burrow travel as footsteps.
      const moving=!u.gone&&d<Math.max(18,dt*.55)&&d>.001;
      facingUpdate(u,dt,moving?d:0,d>=Math.max(18,dt*.55));
      if(u===S)captureRadarUpdate(dt);
      const velocity=moving?d*16/Math.max(1,dt):0;
      const blend=1-Math.exp(-dt/65);
      v.speed+=(Math.min(1,velocity/1.8)-v.speed)*blend;
      let da=(u.face||0)-v.face; while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
      v.turn+=(Math.max(-1,Math.min(1,da*100/Math.max(1,dt)))-v.turn)*blend;
      if(moving){
        v.travel+=d;
        v.phase=(v.phase+d/(rig.stride||28)*Math.PI*2)%(Math.PI*2);
        const foot=Math.floor(v.travel/((rig.stride||28)/2));
        if(foot!==(v.foot||0)&&['walk','authored','wheel','track'].includes(rig.kind)){
          v.foot=foot;
          const a=(u.face||0)-Math.PI/2, side=foot%2?1:-1, width=(u===S?ILL_PLAYER_W:u.w)||40;
          visualFX({k:'dust',x:x+Math.cos(a)*side*width*.19,y:y+Math.sin(a)*side*width*.19,life:240,r:rig.kind==='walk'?2:3,c:'#A39983'});
        }
      }
      motion22Contact(u,v,moving,dt);
      v.hit=Math.max(0,v.hit-dt); v.x=x;v.y=y;v.face=u.face||0;
    }
    for(const b of [...S.bullets,...S.ebullets]){
      if(b._visualKind!=='missile'&&b.kind!=='missile') continue;
      if(b._visualKind==='shell') continue;
      const position=visualBulletPosition(b);let trail=VISUAL.bullets.get(b);
      if(!trail){ trail={x:position.x,y:position.y,carry:0}; VISUAL.bullets.set(b,trail); }
      const dx=position.x-trail.x, dy=position.y-trail.y, d=Math.hypot(dx,dy);
      if(d>0&&d<80){
        const spacing=18; let next=spacing-trail.carry, count=0;
        while(next<=d&&count++<2){ const p=next/d;
          visualFX({k:'smoke',x:trail.x+dx*p,y:trail.y+dy*p,life:240,r:2.2,c:'#9F9B93'});next+=spacing; }
        trail.carry=(trail.carry+d)%spacing;
      }
      trail.x=position.x;trail.y=position.y;
    }
  }
  for(let i=VISUAL.fx.length-1;i>=0;i--){const f=VISUAL.fx[i];f.age+=dt;if(f.age>=f.life)VISUAL.fx.splice(i,1);}
  for(let i=VISUAL.wrecks.length-1;i>=0;i--){const f=VISUAL.wrecks[i];f.age+=dt;if(f.age>=f.life)VISUAL.wrecks.splice(i,1);}
}
function visualPath(c,p,w,h){
  c.beginPath();
  if(p.ellipse){ const [x,y,rx,ry]=p.ellipse;c.ellipse(x*w,y*h,rx*w,ry*h,0,0,Math.PI*2); }
  else { p.poly.forEach(([x,y],i)=>i?c.lineTo(Math.round(x*w),Math.round(y*h)):c.moveTo(Math.round(x*w),Math.round(y*h)));c.closePath(); }
}
function visualCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function visualSolidArt(){
  // Repair material alpha once before tint/mask caches are built. Feathered outer
  // silhouettes, open limb gaps and the authored Ash frames remain untouched.
  for(const key of Object.keys(V_RIG)){
    if(key==='infantry'||!IMG[key])continue;
    const img=IMG[key],c=visualCanvas(img.width,img.height),q=c.getContext('2d');q.drawImage(img,0,0);
    const data=q.getImageData(0,0,c.width,c.height),a=data.data,original=new Uint8ClampedArray(a),w=c.width,h=c.height;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=(y*w+x)*4,alpha=original[i+3];if(alpha===0||alpha===255)continue;
      if(alpha>=220){a[i+3]=255;continue;}
      // Semi-transparent dark metal in imported cutouts is not exhaust or glass.
      // Only promote interior pixels surrounded by material, keeping edge alpha.
      if(key==='e_wasp'&&alpha>=16&&[-w-1,-w,-w+1,-1,1,w-1,w,w+1].every(d=>original[i+d*4+3]>=16))a[i+3]=255;
    }
    // Some original cutouts also erased black armor entirely. Restore enclosed
    // pinholes from their nearest original metal pixel, not a rectangular backing.
    const n=w*h,nearest=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0;
    for(let j=0;j<n;j++)if(original[j*4+3]>=220){nearest[j]=j;queue[tail++]=j;}
    while(head<tail){const j=queue[head++],x=j%w;for(const k of [x?j-1:-1,x<w-1?j+1:-1,j-w,j+w])if(k>=0&&k<n&&nearest[k]===-1){nearest[k]=nearest[j];queue[tail++]=k;}}
    const seen=new Uint8Array(n),fill=[];
    for(let j=0;j<n;j++)if(!seen[j]&&original[j*4+3]<16){let border=false;head=0;tail=0;queue[tail++]=j;seen[j]=1;
      while(head<tail){const k=queue[head++],x=k%w,y=Math.floor(k/w);if(x===0||y===0||x===w-1||y===h-1)border=true;
        for(const m of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(m>=0&&m<n&&!seen[m]&&original[m*4+3]<16){seen[m]=1;queue[tail++]=m;}}
      if(!border&&tail<=Math.max(10,n*.004))for(let k=0;k<tail;k++)fill.push(queue[k]);
    }
    if(key==='e_wasp'){
      // The central armor and wings have connected holes left by background
      // removal. These contours follow the hull and leave the gaps beside pods open.
      const mask=visualCanvas(w,h),mc=mask.getContext('2d');
      const polys=[[[.46,.08],[.55,.08],[.59,.37],[.69,.58],[.55,.84],[.53,.95],[.47,.95],[.44,.84],[.31,.58],[.41,.37]],[[.02,.29],[.30,.43],[.41,.69],[.22,.57],[.04,.37]],[[.98,.29],[.70,.43],[.59,.69],[.78,.57],[.96,.37]]];
      for(const poly of polys){visualPath(mc,{poly},w,h);mc.fill();}const md=mc.getImageData(0,0,w,h).data;
      for(let j=0;j<n;j++)if(md[j*4+3]>240&&a[j*4+3]<255)fill.push(j);
    }
    for(const j of fill){const k=nearest[j];if(k<0)continue;const i=j*4,s=k*4;if(original[i+3]<32){for(let ch=0;ch<3;ch++)a[i+ch]=Math.round(original[s+ch]*.86);}a[i+3]=255;}
    q.putImageData(data,0,0);IMG[key]=c;if(!UNIT_KEYS.includes(key))TINT.frost[key]=frostify(c);
  }
}
function visualParts(img,rig){
  let byRig=VISUAL.cache.get(img);if(!byRig){byRig=new Map();VISUAL.cache.set(img,byRig);}
  if(byRig.has(rig)) return byRig.get(rig);
  const iw=img.width,ih=img.height,base=visualCanvas(iw,ih),bc=base.getContext('2d'),parts=[];
  bc.drawImage(img,0,0);
  for(const p of rig.parts){
    const c=visualCanvas(iw,ih),cc=c.getContext('2d');
    cc.save();visualPath(cc,p,iw,ih);cc.clip();cc.drawImage(img,0,0);cc.restore();
    // Enclosed mechanisms need a stationary housing underneath. Removing their
    // whole mask exposed the map through fans, coils, radar and recoiling guns.
    if(['leg','aimGun','velcaGun','velcaArm','sword','greatswordArm','vane','orbit','captureRadar'].includes(p.mode)){bc.save();bc.globalCompositeOperation='destination-out';visualPath(bc,p.erase?{poly:p.erase}:p,iw,ih);bc.fill();bc.restore();}
    if(p.cover){
      const [x0,y0,x1,y1]=p.cover,[sx0,sy0,sx1,sy1]=p.sample;
      bc.save();visualPath(bc,p.erase?{poly:p.erase}:p,iw,ih);bc.clip();
      // Opaque receiver backing, restricted to the original armor silhouette.
      const backing=visualCanvas(iw,ih),back=backing.getContext('2d');back.drawImage(img,0,0);
      back.globalCompositeOperation='source-in';back.fillStyle='#252C30';back.fillRect(0,0,iw,ih);
      bc.drawImage(backing,x0*iw,y0*ih,(x1-x0)*iw,(y1-y0)*ih,x0*iw,y0*ih,(x1-x0)*iw,(y1-y0)*ih);
      bc.drawImage(img,sx0*iw,sy0*ih,(sx1-sx0)*iw,(sy1-sy0)*ih,x0*iw,y0*ih,(x1-x0)*iw,(y1-y0)*ih);
      if(p.shade){bc.fillStyle='rgba(16,19,20,'+p.shade+')';bc.fillRect(x0*iw,y0*ih,(x1-x0)*iw,(y1-y0)*ih);}bc.restore();
    }
    // Leave an original-art socket beneath moving limbs/barrels, avoiding open joints.
    if(['leg','sword','greatswordArm','vane','orbit','velcaGun','velcaArm'].includes(p.mode)){
      const joint=p.mode==='leg'||p.mode==='velcaGun'||p.mode==='velcaArm'||p.mode==='greatswordArm';
      bc.save();bc.beginPath();bc.ellipse(p.pivot[0]*iw,p.pivot[1]*ih,iw*(joint?.060:.055),ih*(joint?.055:.050),0,0,Math.PI*2);bc.clip();bc.drawImage(img,0,0);bc.restore();
    }
    parts.push({p,img:c,contact:p.mode==='wheel'?visualCanvas(iw,ih):null});
  }
  const result={base,parts};byRig.set(rig,result);return result;
}
async function visualWarmArt(){
  // Bake once during the existing loading screen, not on first enemy appearance.
  const warm=visualCanvas(2,2).getContext('2d');let count=0;
  for(const [key,rig] of Object.entries(V_RIG)){
    if(!rig.parts.length)continue;
    for(const img of [IMG[key],TINT.ally[key],TINT.neutral[key],TINT.frost[key]]){
      if(!img)continue;
      const p=visualParts(img,rig);warm.drawImage(p.base,0,0,2,2);for(const part of p.parts)warm.drawImage(part.img,0,0,2,2);
    }
    if(++count%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
}
function visualRecoil(v,p,rig){
  const key=p.slot||p.channel||rig.shot, shot=v.shots[key];if(!shot)return 0;
  const age=VISUAL.time-shot.time, dur=shot.style==='shell'?310:shot.style==='missile'?230:shot.style==='laser'?180:125;
  if(age<0||age>=dur)return 0;
  const a=age/dur, envelope=a<.12?a/.12:Math.pow((1-a)/.88,2);
  return envelope*(rig.recoil||1)*1.12*(shot.style==='rifle'?.65:shot.style==='laser'?.28:1);
}
function visualGreatswordPose(u,p,w,h){
  const v=visualState(u),q=u.vc,g=velcaGunGeometry(u,p,q.aim),aim=Math.atan2(Math.sin(g.rotation),Math.cos(g.rotation));
  let rotation=Math.sin(v.phase)*.035*Math.min(1,v.speed);
  if(q.phase==='pulseCharge'){const t=Math.min(1,Math.max(0,1-q.timer/q.charge));rotation=aim*t*t*(3-2*t);}
  else if(q.swing>0){const t=1-q.swing/200;rotation=aim*Math.sin(t*Math.PI)+(q.swingSide||1)*.20*Math.sin(t*Math.PI*2);}
  else if(q.recoil>0)rotation=aim*Math.min(1,q.recoil/100);
  return {rotation,px:(p.pivot[0]-.5)*w,py:(p.pivot[1]-.5)*h};
}
function visualGreatswordGrip(u,p,w,h){
  const weapon=visualRig(u).parts.find(part=>part.twoHand),s=visualGreatswordPose(u,weapon,w,h),x=(p.grip[0]-.5)*w-s.px,y=(p.grip[1]-.5)*h-s.py;
  return {x:s.px+x*Math.cos(s.rotation)-y*Math.sin(s.rotation),y:s.py+x*Math.sin(s.rotation)+y*Math.cos(s.rotation)};
}
function drawVisualSprite(u,img,w,h,ctx=FACING_MAIN_CTX){
  const rig=visualRig(u),v=visualState(u);
  if(!rig.parts.length){ctx.drawImage(img,-w/2,-h/2,w,h);return;}
  const layers=visualParts(img,rig);
  ctx.drawImage(layers.base,-w/2,-h/2,w,h);
  for(const {p,img:part,contact} of layers.parts){
    const px=(p.pivot[0]-.5)*w,py=(p.pivot[1]-.5)*h;
    ctx.save();
    const mount=facingMount(u,p,w,h);ctx.translate(mount.x,mount.y);
    if(['leg','wheel','tread'].includes(p.mode)&&!rig.artAngle)ctx.rotate(facingLowerAngle(u));
    if(p.mode==='heroPod'){drawHeroPod(u,part,p,w,h,ctx);
    }else if(p.mode==='heroGun'){drawHeroGun(u,part,p,w,h,ctx);
    }else if(p.mode==='captureRadar'){
      // The upper antenna is rendered after the command armor in drawVisualFront.
    }else if(p.mode==='wheel'){
      const contactState={...v,travel:facingContact(u,p),speed:Math.max(v.speed,v.pivotSpeed)};
      if(contact){drawVisualRollingTire(part,contact,p,w,h,contactState,ctx);ctx.restore();continue;}
      // Original rounded tire, shoulder shading and V-shaped tread remain intact.
      // Move a low-contrast contact highlight along that curved surface only.
      const [x,y,rx,ry]=p.ellipse;ctx.translate(-w/2,-h/2);visualPath(ctx,{ellipse:[x,y,rx*.88,ry*.88]},w,h);ctx.clip();
      if(contactState.speed>.015){
        const cc=contact.getContext('2d');cc.clearRect(0,0,contact.width,contact.height);cc.save();cc.scale(contact.width/w,contact.height/h);
        const turn=((contactState.travel/(Math.max(3,ry*h)*2))%1+1)%1;
        for(let q=0;q<3;q++){
          const f=(turn+q/3)%1,yy=(y-ry+2*ry*f)*h,edge=Math.sqrt(Math.max(0,1-(f*2-1)**2));
          cc.globalAlpha=.17*contactState.speed;cc.strokeStyle='#B5BAB3';cc.lineWidth=.65;
          cc.beginPath();cc.moveTo((x-rx*edge*.82)*w,yy-.75);cc.lineTo(x*w,yy+.75);cc.lineTo((x+rx*edge*.82)*w,yy-.75);cc.stroke();
        }
        cc.restore();cc.globalCompositeOperation='destination-in';cc.drawImage(part,0,0);cc.globalCompositeOperation='source-over';ctx.drawImage(contact,0,0,w,h);
      }
    }else if(p.mode==='aimGun'){
      const aim=visualAimGeometry(p,w,h),kick=visualRecoil(v,p,rig);
      ctx.translate(aim.x,aim.y-kick);ctx.rotate(Math.PI/2+mount.angle);ctx.scale(p.shorten||1,1);ctx.rotate(-aim.angle);
      ctx.drawImage(part,-w/2-aim.px,-h/2-aim.py,w,h);
    }else if(p.mode==='grip'){
      ctx.translate((p.anchor[0]-.5)*w,(p.anchor[1]-.5)*h-visualRecoil(v,p,rig)*.45);
      ctx.rotate(p.angle||0);if(p.mirror)ctx.scale(-1,1);
      ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='tread'){
      if(evoRollingTread(img,part,p,w,h,v,u,ctx)){ctx.restore();continue;}
      ctx.translate(-w/2,-h/2);visualPath(ctx,p,w,h);ctx.clip();
      // Scroll an existing strip of tread/drill pixels inside a stationary silhouette.
      const xs=p.poly.map(a=>a[0]),ys=p.poly.map(a=>a[1]);
      const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const band=Math.max(2,Math.round(img.height*.04)), sy=Math.round(img.height*(y0+(y1-y0)*.42));
      const pitch=band*h/img.height, off=((facingContact(u,p)%pitch)+pitch)%pitch;
      if(Math.max(v.speed,v.pivotSpeed)<.012)ctx.drawImage(part,0,0,w,h);
      else for(let y=y0*h-pitch+off;y<y1*h+pitch;y+=pitch)
        ctx.drawImage(img,x0*img.width,sy,(x1-x0)*img.width,band,x0*w,y,(x1-x0)*w,pitch+.15);
    }else if(p.mode==='velcaGun'){
      const g=velcaGunGeometry(u,p,u.vc.aim),kick=visualRecoil(v,p,rig)*(rig.shot==='laser'?5:1.4),a=u.vc.aim;
      // Only the extracted weapon swivels; the painted top/underside of the hull stays upright.
      ctx.translate(px,py);ctx.fillStyle='#18212B';ctx.strokeStyle='#6A777D';ctx.lineWidth=.65;
      ctx.beginPath();ctx.ellipse(0,0,w*.030,h*.026,0,0,6.283);ctx.fill();ctx.stroke();
      ctx.translate(-Math.cos(a)*g.mirror*kick,-Math.sin(a)*kick);ctx.rotate(g.rotation);ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='greatswordArm'){
      // Elbows remain attached to the chassis. Both wrists follow the same hilt.
      const grip=visualGreatswordGrip(u,p,w,h),dx=(p.grip[0]-p.pivot[0])*w,dy=(p.grip[1]-p.pivot[1])*h,tx=grip.x-px,ty=grip.y-py;
      ctx.translate(px,py);ctx.rotate(Math.atan2(ty,tx));ctx.scale(Math.hypot(tx,ty)/Math.max(.001,Math.hypot(dx,dy)),1);ctx.rotate(-Math.atan2(dy,dx));ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='sword'&&p.twoHand){
      const pose=visualGreatswordPose(u,p,w,h);ctx.translate(px,py);ctx.rotate(pose.rotation);ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='sword'){
      const q=u.vc,attack=q&&q.swing>0?Math.sin(q.swing/200*Math.PI)*(q.swingSide||1)*.72:0;
      const g=velcaGunGeometry(u,p,q.aim),ready=q.phase==='pulseCharge'||q.phase==='double'||q.swing>0||q.recoil>0;
      const carry=Math.sin(v.phase+Math.PI)*.10*Math.min(1,v.speed);
      ctx.translate(px,py);ctx.rotate((ready?g.rotation:carry)+attack);ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='velcaArm'){
      const discharge=u.vc.phase==='channel'?.15+Math.sin(VISUAL.time*.022)*.012:u.vc.phase==='stormCharge'?.18*(1-Math.max(0,u.vc.timer)/1800):0;
      ctx.translate(px,py);ctx.rotate((discharge+Math.min(1,v.speed)*.045)*(p.side||1));ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }else if(p.mode==='leg'){
      const cycle=v.phase+(p.side>0?Math.PI:0),step=Math.sin(cycle),swing=Math.max(0,step),heavy=rig.stride>=30;
      const lastY=Math.max(...p.poly.map(q=>q[1]));
      const knee=Math.round((p.kneePoint?p.kneePoint[1]:p.pivot[1]+(lastY-p.pivot[1])*.52)*part.height),ky=knee/part.height*h-h/2,kx=p.kneePoint?(p.kneePoint[0]-.5)*w:px;
      const gait=rig.gait||{hip:heavy?.025:.04,knee:heavy?.045:.065,lift:heavy?.4:.6};
      const strideSpeed=Math.max(v.speed,v.pivotSpeed||0),weight=rig.gait?Math.min(1,strideSpeed*1.8/Math.max(.45,u.spd||.7)):strideSpeed;
      const turnPlant=rig.artAngle&&v.isoBlend<1?Math.sin(v.isoBlend*Math.PI)*.065*(p.side||1):0;
      const thigh=step*gait.hip*weight+turnPlant,bend=swing*gait.knee*weight*(p.side||1)-turnPlant*.7;
      ctx.translate(px,py+step*gait.lift*weight);ctx.rotate(thigh);
      const overlap=Math.max(2,Math.round(part.height*.012));
      ctx.drawImage(part,0,0,part.width,knee+overlap,-w/2-px,-h/2-py,w,(knee+overlap)/part.height*h);
      ctx.translate(kx-px,ky-py);ctx.rotate(bend);
      ctx.drawImage(part,0,knee-overlap,part.width,part.height-knee+overlap,-w/2-kx,-overlap/part.height*h,w,(part.height-knee+overlap)/part.height*h);
    }else if(p.mode==='fan'){
      const [x,y,rx,ry]=p.ellipse,ratio=ry*h/(rx*w);
      ctx.translate(-w/2,-h/2);visualPath(ctx,p,w,h);ctx.clip();ctx.translate(x*w,y*h);
      ctx.scale(1,ratio);ctx.rotate(VISUAL.time*(rig===V_RIG.L_nova?.002:.035)*(rig.kind==='rotor'&&x>.5?-1:1));ctx.scale(1,1/ratio);
      ctx.drawImage(part,-x*w,-y*h,w,h);
    }else{
      let dx=0,dy=0,rot=mount.angle;
      if(p.mode==='gun'||p.mode==='pod'){
        const recoil=visualRecoil(v,p,rig),axis=p.axis||[0,1];dx=-axis[0]*recoil;dy=-axis[1]*recoil;
        if(p.mode==='pod')rot=recoil*(p.side||1)*.038;
        if(rig.artAngle&&v.isoBlend<1)rot+=Math.sin(v.isoBlend*Math.PI)*(p.side||1)*.025;
      }else if(p.mode==='orbit'){
        const spin=(u.wep||[]).find(w=>w.t==='spin'&&w.on>0);
        rot=spin?(spin.ang-u.face+Math.PI):0;
      }else if(p.mode==='drill')dy=Math.sin(VISUAL.time*.075)*.35*(u.gone?0:.35+v.speed*.65);
      else if(p.mode==='vane')rot=((v.steer||v.turn)*(rig.artAngle?.09:.045)+(rig.artAngle&&u.vc?Math.sin(Math.min(1,(u.vc.recoil||0)/110)*Math.PI)*.035:0))*(p.side||1);
      else if(p.mode==='radar')rot=Math.sin(VISUAL.time*.0008)*.035;
      ctx.translate(px+dx,py+dy);ctx.rotate(rot);ctx.drawImage(part,-w/2-px,-h/2-py,w,h);
    }
    ctx.restore();
  }
  motion22Mechanics(u,w,h,ctx);
  // Damage is a short local armor spark, never a body displacement or white box.
  if(v.hit>0&&!EVO_PRESTIGE.drawingEmission){ctx.save();ctx.globalAlpha=v.hit/85*.7;ctx.fillStyle='#FFE5B4';ctx.fillRect(-w*.08,-h*.04,1.8,1.2);ctx.fillRect(w*.15,h*.08,1.2,1.8);ctx.restore();}
}
function drawVisualPropulsionBase22(u,w,h){
  const rig=visualRig(u),v=visualState(u);
  if(u===S)drawVisualHero(u,w,h,false);
  if(rig.jets)for(const [x,y] of rig.jets){
    const ox=(x-.5)*w,oy=(y-.5)*h,len=2+v.speed*5, pulse=.9+.1*Math.sin(VISUAL.time*.049+x*17);
    ctx.save();ctx.globalAlpha=.42+v.speed*.32;
    ctx.fillStyle='#DAA35F';ctx.beginPath();ctx.moveTo(ox-1.15,oy);ctx.lineTo(ox,oy-len*pulse);ctx.lineTo(ox+1.15,oy);ctx.closePath();ctx.fill();
    ctx.fillStyle='#E2EDE6';ctx.fillRect(ox-.45,oy-2-v.speed, .9,2+v.speed);ctx.restore();
  }
  if(rig.vents)for(const [x,y] of rig.vents){
    ctx.save();ctx.globalAlpha=.20+v.speed*.20;ctx.fillStyle=rig.shot==='laser'?'#80C9E8':'#BDC0A0';
    ctx.beginPath();ctx.ellipse((x-.5)*w,(y-.5)*h,2.2,.85,0,0,6.283);ctx.fill();ctx.restore();
  }
}
function drawVisualFront(u,w,h){
  if(u===S){drawVisualHero(u,w,h,true);drawMountedCaptureRadar(u,w,h,ctx);}
  const rig=visualRig(u),v=visualState(u),shot=v.shots.laser;
  const active=(u.charge>0?1-u.charge/1000:0)||((u.wep||[]).some(w=>w.on>0)?.7:0)||(shot?Math.max(0,1-(VISUAL.time-shot.time)/200):0);
  if(active>0&&rig.shot==='laser'){
    ctx.save();ctx.globalAlpha=active*.8;ctx.strokeStyle=visualKey(u)==='L_nova'?'#FFC17C':'#B2E6FF';ctx.lineWidth=.85;
    for(const p of rig.parts.filter(p=>p.mode==='coil')){
      const x=(p.pivot[0]-.5)*w,y=(p.pivot[1]-.5)*h;
      ctx.beginPath();ctx.moveTo(x-2,y-3);ctx.lineTo(x+1,y);ctx.lineTo(x-1,y+2);ctx.lineTo(x+2,y+4);ctx.stroke();
      if(u.type==='e_volt'){
        const endX=0,endY=h*.09,angle=Math.atan2(endY-y,endX-x);
        drawVisualLightning(x,y,angle,Math.hypot(endX-x,endY-y),active,Math.floor(VISUAL.time/35)+(p.pivot[0]<.5?2:9));
      }
    }
    ctx.beginPath();ctx.arc(0,h*.10,Math.max(2,w*.075),0,6.283);ctx.stroke();ctx.restore();
  }
}
function drawVisualLightning(X,Y,angle,length,alpha,seed=0,palette=TEAM_DRAW){ctx.save();ctx.translate(X,Y);ctx.rotate(angle);cgElectricStream32(ctx,palette||TEAM_ENERGY.enemy,length,alpha,seed);ctx.restore();}
function drawVisualWrecks(cx,cy){
  for(const f of VISUAL.wrecks){
    if(f.x<cx-100||f.x>cx+W+100||f.y<cy-100||f.y>cy+H+100)continue;
    const t=f.age/f.life,settle=1-Math.pow(1-Math.min(1,t*3),3), air=['jet','rotor','hover'].includes(f.rig.kind),walk=['walk','authored'].includes(f.rig.kind);
    ctx.save();ctx.translate(f.x-cx,f.y-cy);ctx.rotate(f.face-Math.PI/2);ctx.scale(f.mirror||1,1);
    ctx.globalAlpha=Math.min(1,(1-t)*2.2);
    if(walk){
      // Knee-first collapse: original upper/lower sections fold once and settle.
      const cut=.65*f.img.height,upper=.65*f.h;
      ctx.save();ctx.translate(0,settle*2);ctx.rotate(settle*.16);
      ctx.drawImage(f.img,0,0,f.img.width,cut,-f.w/2,-f.h/2,f.w,upper);ctx.restore();
      for(const side of [-1,1]){
        ctx.save();ctx.translate(side*f.w*.17,f.h*.15);ctx.rotate(side*settle*.18);
        ctx.drawImage(f.img,side<0?0:f.img.width/2,cut,f.img.width/2,f.img.height-cut,side<0?-f.w*.33:-f.w*.17,0,f.w/2,f.h*.35);ctx.restore();
      }
    }else{
      const layers=visualParts(f.img,f.rig);
      // Hull settles without a looping bounce; only detached mechanical parts separate.
      ctx.translate(0,air?settle*3:0);ctx.drawImage(layers.base,-f.w/2,-f.h/2,f.w,f.h);
      for(let i=0;i<layers.parts.length;i++){
        const {p,img}=layers.parts[i],sign=p.pivot[0]<.5?-1:1;
        ctx.save();ctx.translate(sign*settle*(air?4:2),settle*(i%2?2:-1));ctx.rotate(sign*settle*.045);
        ctx.drawImage(img,-f.w/2,-f.h/2,f.w,f.h);ctx.restore();
      }
    }
    ctx.restore();
  }
}
function drawVisualFXBase22(cx,cy){
  for(const f of VISUAL.fx){
    if(f.k==='muzzle22'||f.k==='drive22')continue;
    const p=f.age/f.life,al=1-p,t=f.age/1000,X=f.x-cx+(f.vx||0)*t,Y=f.y-cy+(f.vy||0)*t;
    if(X<-70||X>W+70||Y<-70||Y>H+70)continue;
    ctx.save();ctx.globalAlpha=al*al;
    if(f.k==='spark'){
      ctx.strokeStyle=f.c;ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(X,Y);ctx.lineTo(X-(f.vx||0)*.028,Y-(f.vy||0)*.028);ctx.stroke();
    }else if(f.k==='blast'){
      drawVisualBlast(f,X,Y);
    }else if(f.k==='smoke'||f.k==='dust'){
      const r=f.r*(1+p*2.1);drawVisualPuff(X,Y-p*2,r,al*Math.min(1,p*10)*.45,f.k==='dust'?'dust':'smoke');
    }else if(f.k==='launch'){
      ctx.translate(X,Y);ctx.rotate(f.a);ctx.fillStyle=f.c;ctx.globalAlpha=al*.7;
      ctx.fillRect(-1,-1.5,2,3);ctx.globalAlpha=al*.28;
      ctx.beginPath();ctx.moveTo(-1,-1.4);ctx.lineTo(-4-p*5,0);ctx.lineTo(-1,1.4);ctx.closePath();ctx.fill();
    }else if(f.k==='flash'){
      ctx.translate(X,Y);ctx.rotate(f.a||0);const r=f.r*(1-p*.45);
      ctx.fillStyle=f.c;ctx.globalAlpha=al*.65;
      if(f.radial){ctx.beginPath();ctx.arc(0,0,r,0,6.283);ctx.fill();}
      else {ctx.beginPath();ctx.moveTo(-1,-r*.35);ctx.lineTo(r,0);ctx.lineTo(-1,r*.35);ctx.closePath();ctx.fill();}
      ctx.fillStyle='#FFF7DD';ctx.globalAlpha=al;ctx.fillRect(-1,-1,Math.max(2,r*.5),2);
    }
    ctx.restore();
  }
}
/* Presentation only. A projectile's allegiance is read from its collision list
   or its immutable launch-time team, never from the owner's current side. */
/* Compact cached sprite frames: layered metal and clustered flame pixels. */
/* VFX atlases are prepared once; combat rendering only draws cached frames. */
/* Revision 33: short arcade rounds, textured electrical surfaces and pulse fronts. */
const CG_EFFECT33={source:null,ground:{},rings:{},rounds:new Map()};
function cgPrepareEffects33(){const source=IMG.cg_field33;if(!source?.width||CG_EFFECT33.source===source)return;CG_EFFECT33.source=source;
 for(const team of ['enemy','ally']){const frames=cgAtlas32(source,4,2,160,160,team==='ally'?(d,k)=>{const r=d[k],g=d[k+1],b=d[k+2];d[k]=Math.round(r*.8+g*.2);d[k+1]=b;d[k+2]=Math.round(r*.65+g*.10);}:null);CG_EFFECT33.ground[team]=frames;CG_EFFECT33.rings[team]=frames.map(frame=>{const art=visualCanvas(160,160),q=art.getContext('2d');q.drawImage(frame,0,0);q.globalCompositeOperation='destination-in';const g=q.createRadialGradient(80,80,37,80,80,79);g.addColorStop(0,'#0000');g.addColorStop(.25,'#FFFF');g.addColorStop(.8,'#FFFF');g.addColorStop(1,'#0000');q.fillStyle=g;q.fillRect(0,0,160,160);return art;});}
}
function cgArcadeRound33(c,p,r=3.1,age=0){
 const frame=Math.floor(age/55)%4,key=p.id+':'+frame;let art=CG_EFFECT33.rounds.get(key);
 if(!art){art=visualCanvas(36,14);const q=art.getContext('2d'),tail=frame%2;
 // The luminous casing is centered on the unchanged physical bullet point.
 cgPixelPoly(q,p.dark,[[13,4],[19,4],[23,6],[24,7],[23,8],[19,10],[13,10],[11,8],[11,6]]);
 cgPixelPoly(q,p.color,[[12,5],[19,5],[22,6],[23,7],[22,8],[19,9],[12,9]]);
 q.fillStyle=p.body;q.fillRect(12,5,3,4);q.fillStyle=p.core;q.fillRect(15,5,5,3);q.fillRect(20,6,2,1);q.fillStyle=p.color;q.fillRect(11,6,2,2);
 cgPixelPoly(q,p.color,[[11,5],[7,6],[2+tail,7],[7,8],[11,9]]);cgPixelPoly(q,p.core,[[11,6],[5+tail,7],[11,8]]);
 q.globalAlpha=.38;q.fillStyle=p.color;q.fillRect(0,6,3,2);q.fillRect(7,4,3,1);q.fillRect(7,9,3,1);CG_EFFECT33.rounds.set(key,art);}
 c.save();const s=r/3.1;c.imageSmoothingEnabled=true;c.drawImage(art,-18*s,-7*s,36*s,14*s);c.restore();
}
function cgFieldGround33(c,p,r,age,alpha=1,flatten=1){cgPrepareEffects33();const frames=CG_EFFECT33.ground[p.id==='enemy'?'enemy':'ally'];c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=alpha;
 c.beginPath();c.ellipse(0,0,r,r*flatten,0,0,6.283);c.clip();
 if(frames?.length)c.drawImage(frames[Math.floor(age/75)%8],-r,-r*flatten,r*2,r*2*flatten);
 else{c.save();c.scale(1,flatten);cgGlow(c,p,r,.22);c.restore();}
 // The boundary remains at exactly the existing gameplay radius.
 c.strokeStyle=p.color;c.lineWidth=1;c.globalAlpha*=.5;c.beginPath();c.ellipse(0,0,r,r*flatten,0,0,6.283);c.stroke();c.restore();
}
function cgStormBolts33(c,f,p,flatten=1){const fade=Math.max(0,Math.min(1,f.age/140,(f.life-f.age)/280));if(!fade)return;const tick=Math.floor(f.age/70),r=f.r;c.save();c.globalCompositeOperation='lighter';c.lineJoin='miter';
 for(let i=0;i<7;i++){const a=i*2.399+(f.id||0),d=Math.sqrt(visualNoise(i*13+9))*r*.7,x=Math.cos(a)*d,y=Math.sin(a)*d*flatten,height=Math.min(98,r*.87)*(.6+visualNoise(tick+i)*.4),points=[];
 for(let j=0;j<6;j++){const t=j/5;points.push([x+(j===5?0:(visualNoise(tick*31+i*7+j)-.5)*22*Math.sin((t+.15)*Math.PI)),y-height*(1-t)]);}
 c.beginPath();points.forEach((v,j)=>j?c.lineTo(...v):c.moveTo(...v));for(const [color,width,alpha]of [[p.color,7,.13],[p.color,3,.82],[p.core,1.1,1]]){c.strokeStyle=color;c.lineWidth=width;c.globalAlpha=fade*alpha;c.stroke();}
 const branch=points[2],side=i%2?1:-1;c.beginPath();c.moveTo(...branch);c.lineTo(branch[0]+side*11,branch[1]+9);c.lineTo(branch[0]+side*7,branch[1]+17);c.lineTo(branch[0]+side*17,branch[1]+28);c.strokeStyle=p.color;c.lineWidth=1.5;c.globalAlpha=fade*.7;c.stroke();c.strokeStyle=p.core;c.lineWidth=.5;c.stroke();
 c.save();c.translate(x,y);cgGlow(c,p,14,.35*fade);c.globalAlpha=fade*.8;c.strokeStyle=p.color;c.lineWidth=1;c.beginPath();c.ellipse(0,0,10,4,0,0,6.283);c.stroke();c.fillStyle=p.core;c.fillRect(-1.5,-1,3,2);for(let j=0;j<3;j++){const t=(f.age/230+j*.333)%1;c.globalAlpha=fade*(1-t);c.fillRect((j-1)*8*t,-t*10,1.5,1.5);}c.restore();
 }c.restore();}
function cgStorm33(c,f,p,flatten=1){const fade=Math.max(0,Math.min(1,f.age/150,(f.life-f.age)/300));cgFieldGround33(c,p,f.r,f.age,fade*.80,flatten);cgStormBolts33(c,f,p,flatten);}
function cgPulse33(c,p,r,t,id=0){cgPrepareEffects33();const fade=Math.max(0,1-t),frames=CG_EFFECT33.rings[p.id==='enemy'?'enemy':'ally'];c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=fade;
 if(frames?.length)c.drawImage(frames[(Math.floor(t*12)+Math.abs(id|0))%8],-r,-r*.66,r*2,r*1.32);
 // A hazy charged rim and narrow hot edges, rather than three bare outlines.
 for(let i=0;i<3;i++){const rr=Math.max(1,r*(.48+i*.23));for(const [width,opacity,color]of [[8,.07,p.color],[3,.24,p.color],[.85,i===1?.88:.60,i===1?p.core:p.color]]){c.globalAlpha=fade*opacity;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.ellipse(0,0,rr,rr*.66,0,0,6.283);c.stroke();}}
 c.lineWidth=.7;for(let i=0;i<30;i++){const a=i*6.283/30,noise=visualNoise(i*7+id),rr=r*(.85+noise*.13),length=3+noise*6,x=Math.cos(a)*rr,y=Math.sin(a)*rr*.66;c.globalAlpha=fade*(.3+noise*.7);c.strokeStyle=i%4?p.color:p.core;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*length*.4-Math.sin(a)*2,y+Math.sin(a)*length*.26);c.lineTo(x+Math.cos(a)*length,y+Math.sin(a)*length*.66);c.stroke();}
 c.restore();}
function cgArcadeHeavy33(c,p,age=0,scale=1){c.save();c.scale(scale,scale);c.globalCompositeOperation='lighter';cgGlow(c,p,13,.2);c.globalCompositeOperation='source-over';cgPixelPoly(c,p.dark,[[-7,-3],[-3,-5],[3,-5],[7,-3],[9,0],[7,3],[3,5],[-3,5],[-7,3]]);cgPixelPoly(c,p.color,[[-7,-2],[-3,-4],[3,-4],[7,-2],[8,0],[7,2],[3,4],[-3,4],[-7,2]]);cgPixelPoly(c,p.core,[[-4,-2],[2,-3],[5,-1],[6,0],[5,1],[2,2],[-4,2]]);c.globalAlpha=.65;cgPixelPoly(c,p.color,[[-7,-2],[-13,-1],[-20,0],[-13,1],[-7,2]]);c.fillStyle=p.core;c.globalAlpha=.75;c.fillRect(-9,-1,5,2);c.restore();}
function cgArcadeNeedle33(c,p,length=24,width=3.2,age=0){c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=.2;c.fillStyle=p.color;c.fillRect(-length,-width,length+5,width*2);c.restore();c.save();cgPixelPoly(c,p.dark,[[4,0],[2,-2.5],[-length*.85,-2.5],[-length,0],[-length*.85,2.5],[2,2.5]]);cgPixelPoly(c,p.color,[[3,0],[1,-1.8],[-length*.85,-1.8],[-length,0],[-length*.85,1.8],[1,1.8]]);c.fillStyle=p.core;c.fillRect(-length*.79,-.7,length*.8,1.4);c.globalAlpha=.55;c.fillStyle=p.color;c.fillRect(-length-5,-.75,3,1.5);c.restore();}

const CG_ARCADE32={missile:null,explosion:null,missiles:{},blasts:[],smoke:null};
function cgAtlas32(source,cols,rows,w,h,recolor){
 const frames=[],cw=source.width/cols,ch=source.height/rows;
 // Common bounds keep anchors and scale stable across the complete animation.
 let left=cw,right=0,top=ch,bottom=0;const cells=[];
 for(let i=0;i<cols*rows;i++){const cell=visualCanvas(Math.ceil(cw),Math.ceil(ch)),q=cell.getContext('2d',{willReadFrequently:true});q.drawImage(source,i%cols*cw,Math.floor(i/cols)*ch,cw,ch,0,0,cell.width,cell.height);const d=q.getImageData(0,0,cell.width,cell.height);for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){const k=(y*cell.width+x)*4;if(d.data[k+3]>20&&Math.max(d.data[k],d.data[k+1],d.data[k+2])>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}cells.push({cell,q,d});}
 const sw=Math.max(1,right-left+1),sh=Math.max(1,bottom-top+1),scale=Math.min((w-4)/sw,(h-4)/sh);
 for(const {cell,q,d} of cells){if(recolor){for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){const k=(y*cell.width+x)*4;recolor(d.data,k,(x-left)/sw);}q.putImageData(d,0,0);}const art=visualCanvas(w,h),a=art.getContext('2d');a.imageSmoothingEnabled=true;a.drawImage(cell,left,top,sw,sh,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);frames.push(art);}return frames;
}
function cgPrepareArcade32(){
 const missile=IMG.cg_missile32,explosion=IMG.cg_explosion32;
 if(missile?.width&&CG_ARCADE32.missile!==missile){CG_ARCADE32.missile=missile;CG_ARCADE32.missiles.enemy=cgAtlas32(missile,4,2,80,36);CG_ARCADE32.missiles.ally=cgAtlas32(missile,4,2,80,36,(d,k,x)=>{const r=d[k],g=d[k+1],b=d[k+2];if(x>.70&&r>g*1.25&&r>b*1.35){d[k]=Math.round(g*.75+r*.18);d[k+1]=r;d[k+2]=Math.round(g*.8+b*.2);}});}
 if(explosion?.width&&CG_ARCADE32.explosion!==explosion){CG_ARCADE32.explosion=explosion;CG_ARCADE32.blasts=cgAtlas32(explosion,4,2,80,80);}
}
function cgSmokeArt32(){if(CG_ARCADE32.smoke)return CG_ARCADE32.smoke;const art=visualCanvas(24,24),c=art.getContext('2d');for(let i=0;i<6;i++){const a=i*2.399,x=12+Math.cos(a)*4,y=12+Math.sin(a)*3;cgPixelPoly(c,'#242F3E99',[[x-5,y-2],[x-3,y-5],[x+2,y-5],[x+5,y-2],[x+5,y+2],[x+2,y+5],[x-3,y+4],[x-5,y+1]]);c.fillStyle='#93A1AE77';c.fillRect(x-3,y-4,5,2);c.fillStyle='#52627088';c.fillRect(x-4,y-1,8,4);}CG_ARCADE32.smoke=art;return art;}
function cgMissileSmoke32(c,age,scale){if(age<40)return;c.save();for(let i=0;i<5;i++){const t=((age/320+i*.2)%1),x=(-18-t*28)*scale,y=Math.sin(i*2.399)*t*3*scale,r=(3+t*5)*scale;c.globalAlpha=(1-t)*.40*Math.min(1,age/180);c.drawImage(cgSmokeArt32(),x-r,y-r,r*2,r*2);}c.restore();}
function cgSpriteMissile32(c,p,age,scale,lit){cgPrepareArcade32();const frames=CG_ARCADE32.missiles[p.id==='enemy'?'enemy':'ally'];if(!frames?.length)return false;c.save();c.imageSmoothingEnabled=true;if(lit)cgMissileSmoke32(c,age,scale);const f=frames[Math.floor(age/55)%8];if(lit)c.drawImage(f,-32*scale,-11.7*scale,52*scale,23.4*scale);else c.drawImage(f,28,0,52,36,-13.8*scale,-11.7*scale,33.8*scale,23.4*scale);c.restore();return true;}
function cgMuzzle32(c,p,r,age,life,id=0){const t=Math.max(0,Math.min(1,age/life)),fade=1-t;if(!fade)return;c.save();c.globalCompositeOperation='lighter';c.globalAlpha=fade;cgGlow(c,p,r*1.3,.22);const reach=r*(1.5-t*.6),wide=r*(.42-t*.16);cgPixelPoly(c,p.color,[[-2,-wide*.5],[reach*.2,-wide],[reach*.35,-wide*.35],[reach*.8,-wide*.6],[reach*.65,-wide*.16],[reach,0],[reach*.65,wide*.16],[reach*.8,wide*.6],[reach*.35,wide*.35],[reach*.2,wide],[-2,wide*.5]]);cgPixelPoly(c,p.core,[[-1,-wide*.4],[reach*.65,-wide*.12],[reach*.85,0],[reach*.65,wide*.12],[-1,wide*.4]]);for(let i=0;i<5;i++){const a=(visualNoise(id*7+i)-.5)*2.5,d=r*(.5+t*1.8),x=Math.cos(a)*d,y=Math.sin(a)*d;c.globalAlpha=fade*fade;c.fillStyle=i%2?p.color:p.core;c.fillRect(Math.round(x),Math.round(y),i%2?2:1,1);}c.restore();}
function cgBlast32(c,f,X,Y){cgPrepareArcade32();if(!CG_ARCADE32.blasts.length)return false;const t=Math.max(0,Math.min(.999,f.age/f.life)),r=f.r;c.save();c.translate(X,Y);c.imageSmoothingEnabled=true;c.globalAlpha=Math.min(1,(1-t)*4);if(t<.25){const p={color:'#FF932F',core:'#FFF8D8'};cgGlow(c,p,r*2,.35*(1-t/.25));}c.globalCompositeOperation='lighter';c.drawImage(CG_ARCADE32.blasts[Math.floor(t*8)],-r*1.4,-r*1.5,r*2.8,r*2.8);c.globalCompositeOperation='lighter';for(let i=0;i<9;i++){const a=i*2.399+(f.id||0),d=r*(.1+Math.sqrt(t)*1.35),x=Math.cos(a)*d,y=Math.sin(a)*d*.8+t*t*r*.3;c.globalAlpha=(1-t)*(1-t)*.9;c.fillStyle=i%3?'#FFA632':'#FFF5CB';c.fillRect(Math.round(x),Math.round(y),i%2?2:1,2);}c.restore();return true;}
function cgEnergyImpact32(c,p,r,t,id=0){c.save();c.globalCompositeOperation='lighter';c.globalAlpha=1-t;const expand=Math.sin(Math.min(1,t*2)*Math.PI/2);cgGlow(c,p,r*(.5+expand),.35*(1-t));for(let i=0;i<8;i++){const a=i*Math.PI/4+id,d=r*(.2+expand*.8),x=Math.cos(a)*d,y=Math.sin(a)*d;c.strokeStyle=p.color;c.lineWidth=2;heroArc(c,x*.3,y*.3,x,y,Math.floor(t*12)+i*3,5*(1-t));c.stroke();c.strokeStyle=p.core;c.lineWidth=.7;c.stroke();c.fillStyle=p.core;c.fillRect(Math.round(x)-1,Math.round(y)-1,2,2);}c.globalAlpha=(1-t)*.75;c.strokeStyle=p.color;c.lineWidth=Math.max(.7,(1-t)*2.5);c.beginPath();c.arc(0,0,Math.max(1,r*expand),0,6.283);c.stroke();c.restore();}
function cgElectricStream32(c,p,len,alpha,seed){c.save();c.globalAlpha*=Math.max(0,alpha);c.globalCompositeOperation='lighter';c.lineJoin='miter';for(let strand=-1;strand<=1;strand++){c.beginPath();for(let i=0;i<=10;i++){const t=i/10,spread=Math.sin(t*Math.PI)*Math.min(6,len*.05),y=spread*(strand+(visualNoise(seed*19+i+strand*17)-.5)*.8);i?c.lineTo(t*len,y):c.moveTo(0,0);}c.strokeStyle=p.color;c.lineWidth=strand?1:4;c.globalAlpha=alpha*(strand?.6:.35);c.stroke();c.strokeStyle=p.core;c.lineWidth=strand?.5:1;c.globalAlpha=alpha*(strand?.75:1);c.stroke();}c.fillStyle=p.core;c.globalAlpha=alpha;c.fillRect(-2,-2,4,4);c.fillRect(len-2,-2,4,4);c.restore();}
function cgShockRings32(c,p,r,t,id=0){cgPulse33(c,p,r,t,id);}
const CG_PIXEL31={missiles:new Map(),bolts:new Map(),plasma:[],source:null};
function cgPixelPoly(c,color,points){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();}
function cgMissileFrame(p,frame,lit){
 const key=p.id+':'+frame+':'+lit;if(CG_PIXEL31.missiles.has(key))return CG_PIXEL31.missiles.get(key);
 const art=visualCanvas(64,28),c=art.getContext('2d');c.imageSmoothingEnabled=true;
 if(lit){const n=frame%4;cgPixelPoly(c,p.dark,[[27,8],[21,8],[18-n,5],[16,9],[7+n,10],[10,12],[2+n*2,14],[12,16],[8,18],[19,20],[21,17],[27,19]]);
 cgPixelPoly(c,p.color,[[27,10],[21,9],[19-n,11],[9+n,12],[5+n*2,14],[14,16],[12,17],[20,18],[24,17],[27,18]]);
 cgPixelPoly(c,p.core,[[28,12],[20,11],[17-n,13],[10+n*2,14],[20,16],[27,16]]);c.fillStyle=p.color;c.fillRect(3+n,9,2,1);c.fillRect(6+n*2,20,3,1);c.fillRect(14-n,7,2,1);}
 cgPixelPoly(c,'#111922',[[24,9],[27,9],[32,3],[36,3],[37,9],[51,9],[62,14],[51,20],[37,20],[34,25],[31,25],[27,20],[24,20]]);
 cgPixelPoly(c,'#687B85',[[27,10],[32,4],[35,4],[34,11]]);cgPixelPoly(c,'#D1DDDA',[[29,9],[32,5],[33,5],[32,10]]);
 cgPixelPoly(c,'#43505A',[[28,19],[32,24],[34,24],[34,18]]);c.fillStyle='#293640';c.fillRect(25,10,28,10);c.fillStyle='#ADBEBE';c.fillRect(28,10,24,7);c.fillStyle='#EFF5D9';c.fillRect(29,10,21,2);c.fillStyle='#718A94';c.fillRect(28,16,24,2);c.fillStyle='#364853';c.fillRect(28,18,24,1);
 cgPixelPoly(c,p.dark,[[49,9],[54,10],[62,14],[54,19],[49,20]]);cgPixelPoly(c,p.color,[[50,10],[55,11],[60,14],[55,17],[50,18]]);cgPixelPoly(c,p.core,[[51,10],[55,12],[57,13],[51,12]]);
 c.fillStyle=p.color;c.fillRect(36,10,3,9);c.fillRect(44,10,2,9);c.fillStyle=p.core;c.fillRect(36,10,3,2);c.fillRect(44,10,2,2);c.fillStyle='#111C24';c.fillRect(25,10,3,10);c.fillRect(39,14,3,2);c.fillStyle='#D7EBE5';c.fillRect(40,13,1,1);c.fillStyle='#768E9B';c.fillRect(24,11,1,8);c.fillStyle=p.core;c.fillRect(24,13,1,3);
 CG_PIXEL31.missiles.set(key,art);return art;
}
function cgPixelMissile(c,p,age=0,scale=1,lit=true){if(cgSpriteMissile32(c,p,age,scale,lit))return;c.save();c.imageSmoothingEnabled=true;const frame=Math.floor(age/45)%8;c.drawImage(cgMissileFrame(p,frame,lit),-30*scale,-10.5*scale,48*scale,21*scale);c.restore();}
function cgPixelNeedle(c,p,length=18,width=3.2,age=0){
 c.save();c.imageSmoothingEnabled=true;c.globalCompositeOperation='lighter';cgGlow(c,p,12,.28);c.globalCompositeOperation='source-over';
 cgPixelPoly(c,p.dark,[[7,0],[2,-4],[-length+3,-2],[-length-3,0],[-length+3,2],[2,4]]);cgPixelPoly(c,p.color,[[6,0],[1,-3],[-length+4,-2],[-length-1,0],[-length+4,2],[1,3]]);
 cgPixelPoly(c,p.core,[[4,0],[0,-1.3],[-length+6,-1],[-length+1,0],[-length+6,1],[0,1.3]]);
 c.fillStyle=p.color;const t=(age%110)/110;c.globalAlpha=1-t;c.fillRect(-length-4-t*6,-1,3,2);c.restore();
}
function cgPreparePlasma31(){
 const source=IMG.cg_plasma31;if(!source||!source.width||CG_PIXEL31.source===source)return;CG_PIXEL31.source=source;CG_PIXEL31.plasma=[];
 const cw=source.width/4,ch=source.height/2;
 for(const team of ['enemy','ally']){const frames=[];for(let i=0;i<8;i++){const cell=visualCanvas(Math.ceil(cw),Math.ceil(ch)),q=cell.getContext('2d');q.drawImage(source,(i%4)*cw,Math.floor(i/4)*ch,cw,ch,0,0,cell.width,cell.height);const data=q.getImageData(0,0,cell.width,cell.height),px=data.data;let left=cell.width,right=0,top=cell.height,bottom=0;
  for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){const k=(y*cell.width+x)*4;if(Math.max(px[k],px[k+1],px[k+2])>35){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(team==='ally'){const r=px[k],g=px[k+1],b=px[k+2];px[k]=Math.round(r*.8+g*.2);px[k+1]=b;px[k+2]=Math.round(r*.75+g*.1);}}
  if(team==='ally')q.putImageData(data,0,0);const art=visualCanvas(64,48),a=art.getContext('2d');a.imageSmoothingEnabled=true;const w=Math.max(1,right-left+1),h=Math.max(1,bottom-top+1),scale=Math.min(58/w,42/h);a.drawImage(cell,left,top,w,h,(64-w*scale)/2,(48-h*scale)/2,w*scale,h*scale);frames.push(art);
 }CG_PIXEL31.plasma[team]=frames;}
}
function cgSpritePlasma31(c,p,r,age=0){cgPreparePlasma31();const frames=CG_PIXEL31.plasma[p.id==='enemy'?'enemy':'ally'];if(!frames?.length)return false;c.save();c.globalCompositeOperation='lighter';c.imageSmoothingEnabled=true;const w=r*3.3;c.drawImage(frames[Math.floor(age/60)%8],-w*.5,-w*.375,w,w*.75);c.restore();return true;}

/* Canvas-native munitions. Decorative paths use a deterministic clock and never RNG. */
const CG_GLOW_ART=new Map();
function cgGlow(c,p,r,alpha=.2){let art=CG_GLOW_ART.get(p.color);if(!art){art=visualCanvas(64,64);const q=art.getContext('2d'),g=q.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,p.core);g.addColorStop(.18,p.color+'CC');g.addColorStop(.5,p.color+'4D');g.addColorStop(1,p.color+'00');q.fillStyle=g;q.fillRect(0,0,64,64);CG_GLOW_ART.set(p.color,art);}c.save();c.globalAlpha*=alpha;c.drawImage(art,-r,-r,r*2,r*2);c.restore();}
function cgIonCore(c,p,r,age=0,heavy=false){
 if(cgSpritePlasma31(c,p,r,age))return;
 c.save();const phase=age*.006;c.globalCompositeOperation='lighter';cgGlow(c,p,r*2.3,.10);cgGlow(c,p,r*1.5,.18);
 c.globalCompositeOperation='source-over';c.fillStyle=p.dark;c.strokeStyle=p.color;c.lineWidth=1.2;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();
 c.fillStyle=p.color;c.beginPath();c.moveTo(r*.82,0);c.lineTo(0,-r*.68);c.lineTo(-r*.65,0);c.lineTo(0,r*.68);c.closePath();c.fill();
 c.fillStyle=p.core;c.beginPath();c.moveTo(r*.6,0);c.lineTo(0,-r*.38);c.lineTo(-r*.45,0);c.lineTo(0,r*.38);c.closePath();c.fill();
 c.globalCompositeOperation='lighter';c.strokeStyle=p.color;c.lineWidth=.9;
 for(let i=0;i<(heavy?3:2);i++){c.beginPath();c.ellipse(0,0,r*(1.2+i*.17),r*.45,phase+i*1.8,0,6.283);c.stroke();}
 if(heavy){c.strokeStyle=p.core;c.lineWidth=.8;c.beginPath();c.moveTo(-r*1.7,0);c.lineTo(r*1.7,0);c.moveTo(0,-r*1.4);c.lineTo(0,r*1.4);c.stroke();}
 for(let i=0;i<4;i++){const t=(age/320+i*.27)%1,x=-r*(.5+t*2.7),y=Math.sin(i*2.4)*r*(.25+t*.5);c.globalAlpha=(1-t)*.65;c.fillStyle=p.color;c.fillRect(x,y,1.3,1.3);}
 c.restore();
}
function cgPlume(c,p,age,scale=1){
 c.save();c.scale(scale,scale);const pulse=.88+.12*Math.sin(age*.083);c.globalCompositeOperation='lighter';
 c.fillStyle=p.color;c.globalAlpha*=.3;c.beginPath();c.moveTo(-6,-2.7);c.lineTo(-25*pulse,0);c.lineTo(-6,2.7);c.closePath();c.fill();c.globalAlpha=1;
 for(let i=0;i<4;i++){const t=(age/135+i*.25)%1,x=-7-t*15,w=2.8*(1-t)+.3;c.fillStyle=i%2?p.core:p.color;c.globalAlpha=(1-t)*.85;c.beginPath();c.moveTo(x+2,0);c.lineTo(x,-w*.55);c.lineTo(x-4,0);c.lineTo(x,w*.55);c.closePath();c.fill();}
 c.restore();
}
function cgEnergyNeedle(c,p,length=18,width=3.2,age=0){cgArcadeNeedle33(c,p,length+6,width,age);}
function cgPulseBlade(c,p,age=0){
 c.save();c.fillStyle=p.dark;c.beginPath();c.arc(-8,0,20,-1.1,1.1);c.arc(-4,0,13,1.1,-1.1,true);c.closePath();c.fill();c.fillStyle=p.color;c.beginPath();c.arc(-8,0,18,-1.1,1.1);c.arc(-4,0,13,1.1,-1.1,true);c.closePath();c.fill();c.restore();
 c.save();c.globalCompositeOperation='lighter';for(let i=3;i>=0;i--){c.globalAlpha=i?.12*(4-i):.95;c.strokeStyle=p.color;c.lineWidth=i?2:4;c.beginPath();c.arc(-8-i*4,0,18-i*1.4,-1.12,1.12);c.stroke();if(!i){c.strokeStyle=p.core;c.lineWidth=1;c.stroke();}}
 c.fillStyle=p.color;for(let i=0;i<5;i++){const a=-1.05+i*.525,t=(age/180+i*.2)%1;c.globalAlpha=(1-t)*.8;c.fillRect(-8+Math.cos(a)*18-t*9,Math.sin(a)*18,1.5,1.5);}c.restore();
}
function cgStormColumns(c,f,p){cgStorm33(c,f,p);}
function cgProjectileWake(c,p,trail,cx,cy){
 c.save();for(let i=0;i<trail.length;i+=2){const z=trail[i],t=Math.min(1,z.age/320),r=1+t*3.4;c.globalAlpha=(1-t)*.22;c.fillStyle=p.smoke;c.beginPath();c.ellipse(z.x-cx,z.y-cy,r,r*.7,i*.8,0,6.283);c.fill();}c.restore();
}

/* Authored directional body already contains its cannon. Never overlay another barrel. */
const CG_TURRET={art:null,directions:null,heads:[],antennas:[],states:new WeakMap(),projection:.80,step:Math.PI/4};
// Muzzle centers in each 176px authored view; rear ports are occluded by the roof.
const CG_TURRET_PORTS=[[155,89],[130,127],[88,138],[41,128],[18,89],[54,51],[88,39],[119,51]];
function cgTurretMatte33(canvas){const c=canvas.getContext('2d',{willReadFrequently:true}),im=c.getImageData(0,0,canvas.width,canvas.height),d=im.data,w=canvas.width,h=canvas.height,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let n=0,head=0;
 const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const i=y*w+x,k=i*4;if(seen[i])return;seen[i]=1;if(d[k+3]===0||Math.max(d[k],d[k+1],d[k+2])<22){queue[n++]=i;d[k+3]=0;}};
 for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=0;y<h;y++){add(0,y);add(w-1,y);}while(head<n){const i=queue[head++],x=i%w,y=Math.floor(i/w);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}c.putImageData(im,0,0);
}
function cgTurretArt(){const im=IMG.cg_turretSource33||IMG.turrets,atlas=IMG.cg_turret33;if(!im?.width||!atlas?.width||(CG_TURRET.art===im&&CG_TURRET.directions===atlas))return;
 CG_TURRET.art=im;CG_TURRET.directions=atlas;CG_TURRET.heads=[];CG_TURRET.antennas=[];
 const cw=atlas.width/4,ch=atlas.height/2,poses=[];
 for(let n=0;n<8;n++){const pose=visualCanvas(176,176),p=pose.getContext('2d');p.imageSmoothingEnabled=true;p.drawImage(atlas,n%4*cw,Math.floor(n/4)*ch,cw,ch,0,0,176,176);cgTurretMatte33(pose);poses.push(pose);}
 const sx=im.width/960,sy=im.height/320;
 for(let i=0;i<4;i++){const center=150+i*220,antenna=visualCanvas(14,31);antenna.getContext('2d').drawImage(im,(center-7)*sx,50*sy,14*sx,31*sy,0,0,14,31);CG_TURRET.antennas.push(antenna);CG_TURRET.heads.push(poses);}
}
function cgTurretSector(a){return ((Math.round(a/CG_TURRET.step)%8)+8)%8;}
function cgTurretPose(t){let v=CG_TURRET.states.get(t);if(!v){const a=Math.atan2(S.py-t.y,S.px-t.x);v={angle:a,body:cgTurretSector(a),recoil:0,flash:0};CG_TURRET.states.set(t,v);}return v;}
function cgTurretChooseBody(v){const b=v.body*CG_TURRET.step,gap=Math.atan2(Math.sin(v.angle-b),Math.cos(v.angle-b));if(Math.abs(gap)>CG_TURRET.step/2+.035)v.body=cgTurretSector(v.angle);}
function cgTurretTick(dt){if(!S||mode!=='play')return;for(const t of S.turrets){if(!t.alive)continue;const v=cgTurretPose(t),a=Math.atan2(S.py-t.y,S.px-t.x),gap=Math.atan2(Math.sin(a-v.angle),Math.cos(a-v.angle));v.angle+=gap*(1-Math.exp(-dt/70));cgTurretChooseBody(v);v.recoil=Math.max(0,v.recoil-dt);v.flash=Math.max(0,v.flash-dt);}}
function cgTurretAxes(a){const yaw=Math.atan2(Math.sin(a)/CG_TURRET.projection,Math.cos(a));return {yaw,x:Math.cos(yaw),y:Math.sin(yaw)*CG_TURRET.projection};}
function cgTurretRecoil(v){const d=cgTurretAxes(v.body*CG_TURRET.step),kick=Math.sin(Math.min(1,v.recoil/180)*Math.PI)*1.4;return {x:-d.x*kick,y:-d.y*kick};}
function cgTurretMuzzle(t,a){const v=cgTurretPose(t),port=CG_TURRET_PORTS[v.body],kick=cgTurretRecoil(v);return {x:t.x-39+port[0]*78/176+kick.x,y:t.y-47+port[1]*78/176+kick.y};}
function cgTurretFire(t,b,a){const v=cgTurretPose(t);v.angle=a;cgTurretChooseBody(v);v.recoil=180;v.flash=110;const p=cgTurretMuzzle(t,a);VISUAL.origins.set(b,{dx:p.x-b.x,dy:p.y-b.y});b._visualKind='shell';visualFX({k:'smoke',x:p.x,y:p.y,vx:Math.cos(a)*9,vy:Math.sin(a)*9,life:360,r:3.2,c:'#ADB5BC'});}
function cgTurretFlash(c,t,v){if(!t.alive||v.flash<=0)return;const p=cgTurretMuzzle(t,v.angle);c.save();c.translate(p.x-t.x,p.y-t.y);c.rotate(v.angle);cgMuzzle32(c,TEAM_SHOT.enemy,13,110-v.flash,110,t.i);c.restore();}
function cgDrawTurrets(cx,cy){cgTurretArt();if(!CG_TURRET.art||!CG_TURRET.heads.length)return;const c=ctx,im=CG_TURRET.art,sx=im.width/960,sy=im.height/320;
 for(const t of S.turrets){const X=t.x-cx,Y=t.y-cy;if(X<-75||X>W+75||Y<-75||Y>H+75)continue;const v=cgTurretPose(t),angle=v.body*CG_TURRET.step;c.save();c.translate(X,Y);c.globalAlpha=t.alive?1:.35;c.imageSmoothingEnabled=true;
 c.drawImage(im,(30+t.i*220)*sx,186*sy,240*sx,70*sy,-34,11,68,19.8);
 // Rear flashes are occluded by the same body sprite as the rear cannon.
 if(v.body>4)cgTurretFlash(c,t,v);
 const kick=cgTurretRecoil(v);c.save();c.translate(kick.x,kick.y);
 c.drawImage(CG_TURRET.heads[t.i][v.body],-39,-47,78,78);
 if(t.flash>0){c.save();c.globalCompositeOperation='screen';c.globalAlpha*=Math.min(.35,t.flash/110*.35);c.drawImage(CG_TURRET.heads[t.i][v.body],-39,-47,78,78);c.restore();}
 const back=cgTurretAxes(angle),ax=-back.x*12,ay=-back.y*12-26;c.drawImage(CG_TURRET.antennas[t.i],ax-1.82,ay,3.64,8.06);
 c.restore();if(v.body<=4)cgTurretFlash(c,t,v);
 c.globalAlpha=1;if(t.alive){c.fillStyle='#000B';c.fillRect(-22,34,44,4);c.fillStyle=t.hp/t.hpMax>.5?'#E8B33C':'#D6453A';c.fillRect(-22,34,44*Math.max(0,t.hp/t.hpMax),4);}c.restore();}
}

const TEAM_SHOT={
 player:{id:'player',color:'#83F46E',core:'#F5FFE4',dark:'#122A18',body:'#8ABE83',smoke:'#93B591'},
 ally:{id:'ally',color:'#83F46E',core:'#F5FFE4',dark:'#122A18',body:'#8ABE83',smoke:'#93B591'},
 enemy:{id:'enemy',color:'#FF654F',core:'#FFF1E9',dark:'#481922',body:'#D17468',smoke:'#C39187'}
};
const TEAM_ENERGY={
 ally:{id:'ally',color:'#8EF16A',core:'#F7FFD6',dark:'#173F2A',body:'#9BD56B',smoke:'#A7C38A'},
 enemy:{id:'enemy',color:'#469FFF',core:'#ECFAFF',dark:'#153874',body:'#659DDE',smoke:'#99B8DD'}
};
function teamShot(b,enemy,energy=false){
 const key=typeof enemy==='boolean'?(enemy?'enemy':b.from==='player'?'player':'ally'):(b.team==='ally'?'ally':'enemy');
 return energy?TEAM_ENERGY[key==='enemy'?'enemy':'ally']:TEAM_SHOT[key];
}
let TEAM_DRAW=null;
function withTeamShot(team,paint){const previous=TEAM_DRAW;TEAM_DRAW=team==='ally'?TEAM_ENERGY.ally:TEAM_ENERGY.enemy;try{paint();}finally{TEAM_DRAW=previous;}}
const TEAM_PLASMA={ally:[],enemy:[]};
function teamPlasmaFrames(palette){
 if(!palette||palette.id==='enemy')return VELCA_PLASMA.frames;
 const frames=TEAM_PLASMA[palette.id==='enemy'?'enemy':'ally'];if(frames.length)return frames;
 for(const source of VELCA_PLASMA.frames){const canvas=visualCanvas(source.width,source.height),c=canvas.getContext('2d');c.drawImage(source,0,0);const image=c.getImageData(0,0,canvas.width,canvas.height),data=image.data;
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];data[i]=Math.round(r*.85+g*.15);data[i+1]=b;data[i+2]=Math.round(r*.78+g*.10);}
  c.putImageData(image,0,0);frames.push(canvas);
 }return frames;
}
function drawTeamRoundBullet(c,p,r=3.1){cgArcadeRound33(c,p,r,VISUAL.time);}
function drawTeamTracer(c,p,length=18,width=3.2,scale=1){
 c.save();c.scale(scale,scale);cgEnergyNeedle(c,p,length,width,VISUAL.time);c.restore();
}
function drawTeamMissile(c,p,age=0,scale=1,ignited=true){cgPixelMissile(c,p,age,scale,ignited);}
function drawVisualBullet(b,cx,cy,enemy){
 const position=visualBulletPosition(b),X=position.x-cx,Y=position.y-cy;if(X<-45||X>W+45||Y<-45||Y>H+45)return;
 const kind=b._visualKind||b.kind||'rifle',p=teamShot(b,enemy,kind==='laser'),scale=b.big?1.35:b.small?.8:1;
 ctx.save();ctx.translate(X,Y);ctx.rotate(Math.atan2(b.vy,b.vx));
 if(kind==='missile')drawTeamMissile(ctx,p,b.life||0,scale);
 else if(kind==='shell'){cgArcadeHeavy33(ctx,p,b.life||0,scale); }else if(kind==='laser')drawTeamTracer(ctx,p,18,3.2);
 else if(kind==='hero')cgArcadeNeedle33(ctx,p,23,3.2,b.life||0);
 else drawTeamRoundBullet(ctx,p,3.1*scale);
 // Element information is a secondary trail accent, not an affiliation override.
 const element=b.el&&ELEM_INFO[b.el]?.c;if(element){ctx.globalAlpha=.45;ctx.strokeStyle=element;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(0,0,4.6,.4,1.4);ctx.stroke();}
 ctx.restore();
}
function drawTeamHeroShot(b,cx,cy){
 const p=teamShot(b,undefined,b.kind==='laserBolt');ctx.save();
 if(b.trail?.length)cgProjectileWake(ctx,p,b.trail,cx,cy);
 ctx.globalAlpha=1;ctx.translate(b.x-cx,b.y-cy);ctx.rotate(b.a);
 if(b.kind==='missile')drawTeamMissile(ctx,p,b.age,1.2,b.age>(b.eject||0));else if(b.kind==='laserBolt')drawTeamTracer(ctx,p,18,3.2);else drawTeamRoundBullet(ctx,p,3.1);
 ctx.restore();
}
function drawTeamVelcaShot(b,cx,cy){
 const fade=Math.max(0,1-b.age/150)**2,X=b.x+(b.visualDx||0)*fade-cx,Y=b.y+(b.visualDy||0)*fade-cy;if(X<-40||X>W+40||Y<-40||Y>H+40)return;
 const p=teamShot(b,undefined,true);withTeamShot(b.team,()=>{ctx.save();ctx.translate(X,Y);ctx.rotate(b.a);
  if(b.kind==='stormSeed'){drawVelcaPlasma(0,0,17,b.age,1,3);drawVelcaCorona(0,0,20,b.age,.9,3);}
  else if(b.kind==='archonBolt')drawVelcaPlasmaBolt(b);
  else if(b.kind==='laserBolt')drawTeamTracer(ctx,p,18,3.6);
  else if(b.kind==='blade')cgPulseBlade(ctx,p,b.age);
  else cgIonCore(ctx,p,b.r,b.age,b.kind==='heavyOrb');ctx.restore();
 });
}
function teamShotLegend(){
 const row=document.createElement('div');row.className='cg-note';row.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:10px 0 0';
 for(const [color,ko,en]of [[TEAM_SHOT.ally.color,'아군 공격','Allied fire'],[TEAM_SHOT.enemy.color,'적 총알·미사일','Enemy bullets / missiles'],[TEAM_ENERGY.enemy.color,'적 광선·전격','Enemy energy / storms']]){const label=document.createElement('span'),dot=document.createElement('i');dot.style.cssText='display:inline-block;width:7px;height:7px;border-radius:50%;vertical-align:middle;margin-right:5px;background:'+color;label.append(dot,document.createTextNode(LANG==='ko'?ko:en));row.append(label);}return row;
}

function drawVisualSmoke(h,X,Y,al){
  const strength=Math.min(1,al*2),age=h.life-h.t;
  // Irregular lobed volume; no circular background gradient or circular clip.
  // The gameplay blindness radius/timer still comes from the original hazard.
  ctx.save();ctx.globalAlpha=strength;ctx.drawImage(visualCloudArt(Math.floor((h.x??X)+(h.y??Y))%4),X-h.r,Y-h.r,h.r*2,h.r*2);ctx.restore();
  for(let q=0;q<6;q++){
    const a=q*2.399,rr=h.r*(.12+q*.07),x=X+Math.cos(a)*rr,y=Y+Math.sin(a)*rr;
    drawVisualPuff(x+Math.sin(age*.00035+q)*h.r*.012,y-Math.min(3,age*.00035),h.r*(.25+.02*q),strength*.23,'smoke',a);
  }
}
function drawVisualShard(f,X,Y,al){
  ctx.save();ctx.translate(X,Y);ctx.rotate(Math.atan2(f.vy||0,f.vx||0)+(1-al)*1.6);
  ctx.globalAlpha=al*.82;ctx.fillStyle=f.c;ctx.fillRect(-1.8,-.6,3.6,1.2);ctx.restore();
}
function drawVisualCanister(h,X,Y){
  // Original arming clock/radius; richer casing, pin, fuse, seams and tail assembly.
  const blink=Math.floor(h.t/110)%2===0,smoke=h.smoke;
  ctx.save();ctx.translate(X,Y);ctx.fillStyle='#080E1150';ctx.beginPath();ctx.ellipse(1,3,8,4,0,0,6.283);ctx.fill();ctx.rotate(smoke?-.32:.24);
  ctx.lineJoin='round';ctx.strokeStyle='#151D21';ctx.lineWidth=.8;
  if(smoke){
    ctx.fillStyle='#748172';ctx.beginPath();ctx.moveTo(-3.7,-5.8);ctx.lineTo(-2,-7);ctx.lineTo(2,-7);ctx.lineTo(3.7,-5.8);ctx.lineTo(3.7,5.8);ctx.lineTo(2.6,7);ctx.lineTo(-2.6,7);ctx.lineTo(-3.7,5.8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#34413C';ctx.fillRect(.8,-5.5,2.5,11);ctx.fillStyle='#DADCC5';ctx.fillRect(-3.2,-1.8,6.4,3.2);ctx.fillStyle='#526158';ctx.fillRect(-1.8,-.9,1.1,1.4);
    ctx.fillStyle='#D3D8BB';ctx.fillRect(-2.6,-5.5,.7,10);ctx.fillStyle='#263535';ctx.fillRect(-3.5,-5.6,7,1.2);ctx.fillRect(-3.5,4.7,7,.8);
    ctx.strokeStyle='#B9C8C1';ctx.lineWidth=.75;ctx.beginPath();ctx.arc(1,-8.4,1.65,0,6.283);ctx.stroke();ctx.beginPath();ctx.moveTo(2,-6);ctx.lineTo(4,-3);ctx.lineTo(4,2);ctx.stroke();
    ctx.fillStyle=blink?'#DAFBA9':'#6F9A64';ctx.fillRect(-1,-5,1.8,1.2);
    if(h.life-h.t>100)drawVisualPuff(-1,-10,4+(1-h.t/h.life)*4,.35,'smoke');
  }else{
    ctx.fillStyle='#7C8D95';ctx.beginPath();ctx.moveTo(-2.7,2);ctx.lineTo(-5,7.5);ctx.lineTo(5,7.5);ctx.lineTo(2.7,2);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#6A7475';ctx.beginPath();ctx.ellipse(0,-1,4.2,7.5,0,0,6.283);ctx.fill();ctx.stroke();
    ctx.fillStyle='#AEB9B7';ctx.beginPath();ctx.ellipse(-1.5,-2,1.25,4.8,-.06,0,6.283);ctx.fill();
    ctx.fillStyle='#B5573E';ctx.fillRect(-3.7,-2.2,7.4,2.2);ctx.fillStyle='#D8B86D';ctx.fillRect(-2.8,2.5,5.6,1);
    ctx.fillStyle=blink?'#FFF0BC':'#BC593D';ctx.fillRect(-.7,-6.3,1.4,1.2);ctx.fillStyle='#273B43';ctx.fillRect(-.6,4,1.2,4.5);
  }ctx.restore();
}

/* Presentation-only steering. Logical face, movement and weapon timing stay intact. */
const FACING_PROFILE={
  authored:{tau:68,rate:14,lower:110},walk:{tau:80,rate:12,lower:145},
  wheel:{tau:95,rate:10,lower:160},track:{tau:125,rate:8,lower:195},
  jet:{tau:115,rate:9,lower:150},rotor:{tau:100,rate:10,lower:150},
  hover:{tau:85,rate:12,lower:130},fixed:{tau:85,rate:10,lower:160}
};
const FACING_MAIN_CTX=ctx;
function facingGap(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function facingApproach(a,b,dt,tau,rate){const gap=facingGap(b,a),step=gap*(1-Math.exp(-dt/tau)),limit=rate*dt/1000;return a+Math.max(-limit,Math.min(limit,step));}
function facingState(u){
  const v=visualState(u);
  if(v.heading===undefined){const a=Number.isFinite(u.face)?u.face:0;v.heading=a;v.lowerHeading=a;v.steer=0;v.pivotSpeed=0;v.leftTravel=v.travel;v.rightTravel=v.travel;v.contactTravel=v.travel;
    v.isoSign=Math.cos(a)>0?-1:1;v.isoFrom=v.isoSign;v.isoBlend=1;v.isoCandidate=v.isoSign;v.isoWait=0;}
  return v;
}
function facingUpdate(u,dt,travel,teleported){
  const v=facingState(u),p=FACING_PROFILE[visualRig(u).kind]||FACING_PROFILE.hover;
  // Capturing swivels the antenna, not the player chassis. Logical facing and
  // movement stay intact; normal visual steering resumes after capture release.
  const a=u===S&&u.beam?v.heading:Number.isFinite(u.face)?u.face:0,old=v.heading;
  // Teleport reappearance has its own transition; do not drag the old pose across it.
  if(teleported){v.heading=a;v.lowerHeading=a;}else{
    v.heading=facingApproach(v.heading,a,dt,p.tau,p.rate);
    v.lowerHeading=facingApproach(v.lowerHeading,v.heading,dt,p.lower,p.rate*.8);
  }
  const da=teleported?0:facingGap(v.heading,old),turn=Math.max(-1,Math.min(1,da*160/Math.max(1,dt)));
  v.steer+=(turn-v.steer)*(1-Math.exp(-dt/65));
  v.pivotSpeed=Math.min(.26,Math.abs(da)*220/Math.max(1,dt));
  const width=(u===S?ILL_PLAYER_W:u.w)||40,arc=da*width*.22;
  v.leftTravel+=travel-arc;v.rightTravel+=travel+arc;
  v.contactTravel+=travel;
  if(travel<.001&&Math.abs(da)>.0001)v.phase=(v.phase+Math.abs(da)*.9)%(Math.PI*2);
  // A dead band and a dwell time prevent repeated mirroring near straight up/down.
  const horizontal=Math.cos(v.heading),wanted=horizontal>.22?-1:horizontal<-.22?1:v.isoSign;
  if(wanted!==v.isoCandidate){v.isoCandidate=wanted;v.isoWait=0;}else v.isoWait+=dt;
  if(v.isoBlend<1)v.isoBlend=Math.min(1,v.isoBlend+dt/150);
  if(teleported){v.isoSign=Math.cos(a)>0?-1:1;v.isoFrom=v.isoSign;v.isoBlend=1;v.isoWait=0;}
  else if(wanted!==v.isoSign&&v.isoWait>=75&&v.isoBlend===1){v.isoFrom=v.isoSign;v.isoSign=wanted;v.isoBlend=0;}
}
function facingAngle(u){return facingState(u).heading-Math.PI/2;}
function facingMount(u,p,w,h){
  const v=facingState(u),rig=visualRig(u);
  if(rig.artAngle||p.mode==='leg'||p.mode==='tread'||p.mode==='wheel')return {x:0,y:0,angle:0};
  const raised=['gun','pod','radar','captureRadar','coil','fan','orbit'].includes(p.mode),height=raised?Math.min(1.65,w*.025):0,a=facingAngle(u);
  // Raised mechanisms remain above the floor in screen space as the chassis turns.
  const aiming=(p.mode==='gun'||p.mode==='aimGun')&&!p.channel&&!(u===S&&u.beam),lead=aiming?Math.max(-.12,Math.min(.12,facingGap(u.face||0,v.heading))):0;
  return {x:-Math.sin(a)*height,y:(1-Math.cos(a))*height,angle:lead};
}
function facingContact(u,p){
  const v=facingState(u),side=p.side||(p.pivot?p.pivot[0]-.5:p.ellipse?p.ellipse[0]-.5:p.poly.reduce((s,q)=>s+q[0],0)/p.poly.length-.5);
  return (side<0?v.leftTravel:v.rightTravel)+(v.travel-v.contactTravel);
}
function facingLowerAngle(u){const v=facingState(u);return Math.max(-.13,Math.min(.13,facingGap(v.lowerHeading,v.heading)));}
function facingIsoProgress(v){const t=v.isoBlend;return t*t*(3-2*t);}
function facingIsoMirror(u){const v=facingState(u);return v.isoBlend<.5?v.isoFrom:v.isoSign;}
function facingIsoMuzzle(u,side=0){
  const gun=velcaWeapon(u,side);if(gun){const g=velcaGunGeometry(u,gun,u.vc.aim);return {x:u.x+g.x,y:u.y+g.y};}
  const points=VELCA_MUZZLES[u.type],img=IMG[u.type];if(!points||!img)return null;
  const p=points[side>0?points.length-1:0],mix=u.type==='v_revenant'?1:facingIsoMirror(u);
  return {x:u.x+(p[0]-.5)*u.w*mix,y:u.y+(p[1]-.5)*u.w*img.height/img.width};
}
function drawFacingIso(u,img,w,h){
  // A deliberate pixel-animation turn: plant, change the single body pose, settle.
  // Never crossfade whole silhouettes or squeeze the sprite into a flat card.
  ctx.save();ctx.scale(u.type==='v_revenant'?1:facingIsoMirror(u),1);drawVisualSprite(u,img,w,h);ctx.restore();
}

/* Render-only effects and terrain. Original gameplay/art data stays untouched. */
const VFX_ART={ground:new Map(),puffs:new Map(),decals:new Map()};
const VFX_CLOUDS=new Map();
function visualCloudArt(seed){
  if(VFX_CLOUDS.has(seed))return VFX_CLOUDS.get(seed);
  const c=visualCanvas(256,256),q=c.getContext('2d'),mask=visualCanvas(256,256),m=mask.getContext('2d');
  const lobes=[[0,0,.55],[-.32,-.22,.42],[.24,-.31,.40],[-.50,.12,.34],[.49,.09,.42],[.08,.38,.39],[-.30,.44,.32],[.52,-.37,.28],[-.45,-.46,.29]];
  for(let i=0;i<lobes.length;i++){
    const [lx,ly,lr]=lobes[i],x=128+lx*128,y=128+ly*128,r=128*lr*(.94+visualNoise(seed*13+i)*.12);
    const g=m.createRadialGradient(x,y,r*.25,x,y,r);
    g.addColorStop(0,'#FFFFFFEF');g.addColorStop(.64,'#FFFFFFDA');g.addColorStop(1,'#FFFFFF00');m.fillStyle=g;m.fillRect(x-r,y-r,r*2,r*2);
  }
  // Shade the joined cloud, not each sphere: no dark bubble borders inside smoke.
  const shade=q.createLinearGradient(30,30,195,235);shade.addColorStop(0,'#8C9499');shade.addColorStop(.40,'#66717A');shade.addColorStop(1,'#343F49');q.fillStyle=shade;q.fillRect(0,0,256,256);
  for(let i=0;i<28;i++){
    const x=40+visualNoise(i*7+seed)*176,y=35+visualNoise(i*11+seed)*185,r=20+visualNoise(i*13)*40,g=q.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,i%3?'#B8C1C81E':'#16232D20');g.addColorStop(1,'#7B858D00');q.fillStyle=g;q.fillRect(x-r,y-r,r*2,r*2);
  }
  q.globalCompositeOperation='destination-in';q.drawImage(mask,0,0);q.globalCompositeOperation='source-over';
  VFX_CLOUDS.set(seed,c);return c;
}
function drawVisualRollingTire(part,canvas,p,w,h,v,ctx=FACING_MAIN_CTX){
  if(v.speed<.015)return;
  const c=canvas.getContext('2d'),iw=canvas.width,ih=canvas.height,[x,y,rx,ry]=p.ellipse;
  c.clearRect(0,0,iw,ih);c.save();
  c.beginPath();c.ellipse(x*iw,y*ih,rx*iw*.78,ry*ih*.94,0,0,Math.PI*2);c.clip();
  // Roll the ORIGINAL V tread pixels, retaining the fixed sidewall and tire shading.
  const left=(x-rx)*iw,width=rx*2*iw,band=Math.max(4,Math.round(ih*.075)),sourceY=Math.round((y-.04)*ih);
  const offset=((v.travel*ih/h)%band+band)%band;
  for(let yy=(y-ry)*ih-band+offset;yy<(y+ry)*ih+band;yy+=band)
    c.drawImage(part,left,sourceY,width,band,left,yy,width,band+.3);
  const shade=c.createLinearGradient(left,0,left+width,0);
  shade.addColorStop(0,'#080D10C0');shade.addColorStop(.30,'#E0E7DF15');shade.addColorStop(.62,'#151B2020');shade.addColorStop(1,'#080D10C0');
  c.fillStyle=shade;c.fillRect(left,(y-ry)*ih,width,ry*2*ih);c.restore();
  c.globalCompositeOperation='destination-in';c.drawImage(part,0,0);c.globalCompositeOperation='source-over';
  ctx.drawImage(canvas,-w/2,-h/2,w,h);
}
function drawVisualHero(u,w,h,front){
  const v=visualState(u),shot=v.shots.shell,age=shot?VISUAL.time-shot.time:9999;
  const charge=Math.max(0,1-age/200),drive=v.speed,pulse=.9+.1*Math.sin(VISUAL.time*.003);
  ctx.save();
  if(!front){
    // Exhaust emerges from the two rear engine sockets, attached to the vehicle.
    for(const side of [-1,1]){
      const x=side*w*.24,y=-h*.29,len=2+drive*10;
      const glow=ctx.createRadialGradient(x,y,0,x,y,7+drive*3);glow.addColorStop(0,'#B9F7FF70');glow.addColorStop(1,'#4BB9EF00');
      ctx.globalAlpha=pulse;ctx.fillStyle=glow;ctx.fillRect(x-10,y-10,20,20);
      ctx.globalAlpha=.65;ctx.fillStyle='#53BEE9';ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x-.9,y-len);ctx.lineTo(x,y-len-2);ctx.lineTo(x+1,y-len);ctx.lineTo(x+2,y);ctx.closePath();ctx.fill();
      ctx.fillStyle='#E7FCFF';ctx.globalAlpha=.9;ctx.fillRect(x-.6,y-len*.55,1.2,len*.55+1);
    }
  }else{
    // Cobalt command armor follows the existing curved plates; no floating symbols.
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(side*w*.24,-h*.13);ctx.lineTo(side*w*.28,h*.03);ctx.lineTo(side*w*.21,h*.18);ctx.lineTo(side*w*.12,h*.25);
      ctx.strokeStyle='#102B49';ctx.lineWidth=2.7;ctx.globalAlpha=.95;ctx.stroke();ctx.strokeStyle='#368DE1';ctx.lineWidth=1.6;ctx.stroke();
      ctx.strokeStyle='#A9EDFF';ctx.lineWidth=.55;ctx.globalAlpha=.8+charge*.2;ctx.stroke();
      ctx.fillStyle='#A6F2FF';ctx.globalAlpha=.65+drive*.25;ctx.fillRect(side*w*.24-.7,-h*.29,1.4,2.5);
    }
    // A compact reactor feeds the barrel rails for each shot.
    const glow=ctx.createRadialGradient(0,h*.16,0,0,h*.16,5+charge*4);glow.addColorStop(0,'#A8E9FF9A');glow.addColorStop(1,'#308DE500');
    ctx.globalAlpha=.55+charge*.35;ctx.fillStyle=glow;ctx.fillRect(-10,h*.16-10,20,20);
    ctx.fillStyle='#BDEEFF';ctx.globalAlpha=.65*pulse;ctx.fillRect(-.9,h*.12,1.8,2);
    if(charge>0){ctx.globalAlpha=charge*.85;ctx.strokeStyle='#D6F9FF';ctx.lineWidth=.75;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*w*.065,h*.19);ctx.lineTo(side*w*.065,h*.40);ctx.stroke();}}
  }ctx.restore();
}
function visualGroundTexture(theme){
  if(VFX_ART.ground.has(theme.grass))return VFX_ART.ground.get(theme.grass);
  const source=IMG[theme.grass];if(!source)return null;
  const size=1024,tile=visualCanvas(size,size),c=tile.getContext('2d'),stamp=visualCanvas(128,128),q=stamp.getContext('2d');
  const avg=visualCanvas(1,1),ac=avg.getContext('2d',{willReadFrequently:true});ac.drawImage(source,0,0,1,1);const color=ac.getImageData(0,0,1,1).data;
  c.fillStyle='rgb('+color[0]+','+color[1]+','+color[2]+')';c.fillRect(0,0,size,size);
  // Toroidal, feathered, offset patches. All copies share the same world anchor.
  // No independently flipped rectangular tile edges remain in the final texture.
  for(let gy=0;gy<18;gy++)for(let gx=0;gx<18;gx++){
    const id=gy*18+gx+17,s=size/18;
    const x=(gx+.5)*s+(visualNoise(id*3)-.5)*s*.65,y=(gy+.5)*s+(visualNoise(id*3+1)-.5)*s*.65;
    const img=theme.grass2&&visualNoise(id+22)>.48?IMG[theme.grass2]||source:source;
    q.clearRect(0,0,128,128);q.save();q.translate(64,64);q.rotate(visualNoise(id*7)*Math.PI*2);
    // Supplied maps contain internal 2x2 joins too. Sample ONE quadrant per patch
    // so a pre-existing rectangular lava/crystal edge cannot survive the blend.
    const sw=img.width/2,sh=img.height/2,sx=(id%2)*sw,sy=(Math.floor(id/2)%2)*sh;
    q.drawImage(img,sx+2,sy+2,sw-4,sh-4,-98,-98,196,196);q.restore();
    const mask=q.createRadialGradient(64,64,23,64,64,63);mask.addColorStop(0,'#FFFFFFFF');mask.addColorStop(.42,'#FFFFFFEB');mask.addColorStop(1,'#FFFFFF00');
    q.globalCompositeOperation='destination-in';q.fillStyle=mask;q.fillRect(0,0,128,128);q.globalCompositeOperation='source-over';
    for(const ox of [-size,0,size])for(const oy of [-size,0,size]){
      if(x+ox+64<0||x+ox-64>size||y+oy+64<0||y+oy-64>size)continue;
      c.drawImage(stamp,x+ox-64,y+oy-64);
    }
  }
  VFX_ART.ground.set(theme.grass,tile);return tile;
}
function drawVisualGround(theme,cx,cy){
  const tile=visualGroundTexture(theme);if(!tile){ctx.fillStyle=theme.fallback;ctx.fillRect(0,0,W,H);return;}
  const size=tile.width;
  for(let x=Math.floor(cx/size)*size;x<cx+W;x+=size)for(let y=Math.floor(cy/size)*size;y<cy+H;y+=size)
    ctx.drawImage(tile,x-cx,y-cy,size,size);
}
function visualPuffArt(kind){
  if(VFX_ART.puffs.has(kind))return VFX_ART.puffs.get(kind);
  const c=visualCanvas(96,96),q=c.getContext('2d');
  const fire=kind==='fire',dust=kind==='dust';
  for(let i=0;i<7;i++){
    const a=i*2.399,r=i?12+visualNoise(i+44)*13:0,x=48+Math.cos(a)*r,y=48+Math.sin(a)*r;
    const g=q.createRadialGradient(x-3,y-5,1,x,y,22+i%3*2);
    g.addColorStop(0,fire?'#FFF1BCDF':dust?'#B4A78A9A':'#A1A19B9A');
    g.addColorStop(.4,fire?'#FFB240C8':dust?'#9B8E7575':'#666A687D');
    g.addColorStop(.78,fire?'#CB442472':dust?'#655D4F30':'#333A3D4D');g.addColorStop(1,'#20282A00');
    q.fillStyle=g;q.fillRect(x-26,y-26,52,52);
  }VFX_ART.puffs.set(kind,c);return c;
}
function drawVisualPuff(X,Y,r,alpha,kind='smoke',rotation=0){
  ctx.save();ctx.translate(X,Y);ctx.rotate(rotation);ctx.globalAlpha=alpha;
  ctx.drawImage(visualPuffArt(kind),-r,-r,2*r,2*r);ctx.restore();
}
function visualExplosion(x,y,r,scorch=true){
  if(!S)return;const id=++VISUAL.serial;
  visualFX({k:'blast',x,y,r:Math.max(12,Math.min(65,r*.58)),life:680,id});
  for(let i=0;i<8;i++){const a=visualNoise(id*31+i)*6.283,s=35+visualNoise(id*19+i)*110;
    visualFX({k:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:280+visualNoise(id+i)*260,c:i%3?'#FFC16F':'#FFF1BC'});}
  if(scorch){
    if(VISUAL.decals.length>=(MOBILE_DEVICE?32:56))VISUAL.decals.shift();
    VISUAL.decals.push({x,y,r:Math.max(12,Math.min(55,r*.40)),age:0,life:24000,id:id%8,angle:visualNoise(id)*6.283});
  }
}
function visualDecalArt(id){
  if(VFX_ART.decals.has(id))return VFX_ART.decals.get(id);
  const c=visualCanvas(128,128),q=c.getContext('2d');
  const g=q.createRadialGradient(64,64,8,64,64,60);g.addColorStop(0,'#201B189E');g.addColorStop(.45,'#211C1885');g.addColorStop(.72,'#25201942');g.addColorStop(1,'#211C1800');q.fillStyle=g;q.fillRect(0,0,128,128);
  for(let i=0;i<100;i++){const a=visualNoise(i*7+id)*6.283,r=visualNoise(i*9+id)*42;q.fillStyle=i%3?'#A59A8220':'#18191835';q.fillRect(64+Math.cos(a)*r,64+Math.sin(a)*r,1+visualNoise(i)*2,1);}
  for(let i=0;i<15;i++){
    const a=i/15*6.283,r=24+visualNoise(id*23+i)*16,x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
    q.strokeStyle=i%2?'#121514B0':'#6F665654';q.lineWidth=i%2?1.8:1;
    q.beginPath();q.moveTo(x,y);q.lineTo(x+Math.cos(a+.15)*9,y+Math.sin(a+.15)*9);q.lineTo(x+Math.cos(a)*17,y+Math.sin(a)*17);q.stroke();
    q.fillStyle='#14161375';q.fillRect(x-2,y-1,4,2);
  }
  q.strokeStyle='#B29A672C';q.lineWidth=2;q.beginPath();q.ellipse(64,65,28,25,.16,0.15,2.5);q.stroke();
  VFX_ART.decals.set(id,c);return c;
}
function drawVisualDecals(cx,cy){
  for(const d of VISUAL.decals){const X=d.x-cx,Y=d.y-cy;if(X<-80||X>W+80||Y<-80||Y>H+80)continue;
    ctx.save();ctx.translate(X,Y);ctx.rotate(d.angle);ctx.globalAlpha=Math.min(1,d.age/90)*Math.min(1,(d.life-d.age)/6000);
    ctx.drawImage(visualDecalArt(d.id),-d.r,-d.r*.76,d.r*2,d.r*1.52);ctx.restore();
  }
}
function drawVisualBlast(f,X,Y){
  if(cgBlast32(ctx,f,X,Y))return;
  const p=f.age/f.life,expand=1-Math.pow(1-Math.min(1,p*3),3),r=f.r;
  if(p<.32){const a=1-p/.32,g=ctx.createRadialGradient(X,Y,0,X,Y,r*(.5+expand));g.addColorStop(0,'#FFF3C9B0');g.addColorStop(.35,'#F69A4450');g.addColorStop(1,'#E1662200');ctx.globalAlpha=a;ctx.fillStyle=g;ctx.fillRect(X-r*1.5,Y-r*1.5,r*3,r*3);}
  for(let i=0;i<5;i++){
    const a=i*2.399+f.id,spread=expand*r*.37,x=X+Math.cos(a)*spread,y=Y+Math.sin(a)*spread*.7-p*r*.2;
    drawVisualPuff(x,y,r*(.42+p*.65),Math.max(0,1-p*2.4)*.82,'fire',a);
    if(p>.12)drawVisualPuff(x,y-p*5,r*(.40+p*.75),Math.sin(Math.min(1,(p-.12)/.88)*Math.PI)*.34,'smoke',a);
  }
  ctx.globalAlpha=(1-p)*.45;ctx.lineWidth=.8;ctx.strokeStyle='#DCB576';ctx.beginPath();ctx.ellipse(X,Y,Math.max(1,r*expand*1.5),Math.max(1,r*expand),0,0,6.283);ctx.stroke();
}
function drawVisualShock(h,X,Y,al){
  ctx.save();ctx.globalAlpha=al*.60;ctx.strokeStyle='#FFE0A7';ctx.lineWidth=Math.max(.7,2.2*al);ctx.beginPath();ctx.arc(X,Y,Math.max(1,h.r),0,6.283);ctx.stroke();
  ctx.strokeStyle=h.c||'#FFB05A';ctx.globalAlpha=al*.22;ctx.lineWidth=5*al;ctx.beginPath();ctx.arc(X,Y,Math.max(1,h.r*.94),0,6.283);ctx.stroke();ctx.restore();
}

/* Revision 17: open-ended capture volume without the fixed terminal rim.
 * Only VISUAL state is written. Capture chance, cone, progress and RNG are untouched.
 */
const CAPTURE_RADAR={period:3600,projection:.64,halfWidth:15.2,depth:6.8,segments:24,servo:20,emitter:{forward:9.4,height:9.1}};
const CAPTURE_RADAR_PART=V_RIG.main.parts.find(p=>p.mode==='radar');
Object.assign(CAPTURE_RADAR_PART,{mode:'captureRadar',pivot:[.5,.225],
  // Remove the original aerial including its thin tip; retain the armored neck.
  poly:[[.315,0],[.695,0],[.695,.19],[.625,.225],[.39,.225],[.315,.19]]});

const captureRadarYawFor=a=>Math.atan2(Math.sin(a)/CAPTURE_RADAR.projection,Math.cos(a));
function captureRadarUpdate(dt){
  const v=visualState(S),seconds=dt/1000,scan=Math.PI*2/(CAPTURE_RADAR.period/1000);
  if(!Number.isFinite(v.radarYaw)){v.radarYaw=captureRadarYawFor(S.face||0);v.radarVelocity=S.beam?0:scan;}
  if(S.beam&&Number.isFinite(S.beamAng)){
    // Exact critically damped servo. Cross the +/-pi seam on the shortest arc,
    // decelerate into alignment and hold without overshoot or a frame-rate jump.
    const gap=facingGap(captureRadarYawFor(S.beamAng),v.radarYaw),target=v.radarYaw+gap;
    const omega=CAPTURE_RADAR.servo,decay=Math.exp(-omega*seconds),change=(v.radarVelocity-omega*gap)*seconds;
    v.radarYaw=target+(-gap+change)*decay;
    v.radarVelocity=(v.radarVelocity-omega*change)*decay;
    if(Math.abs(facingGap(target,v.radarYaw))<.001&&Math.abs(v.radarVelocity)<.02){v.radarYaw=target;v.radarVelocity=0;}
  }else{
    // Physical yaw has constant cruise speed. Projection is applied only at draw
    // time; it never accelerates the mechanism near front/side views.
    const decay=Math.exp(-seconds/.18),old=v.radarVelocity;
    v.radarYaw+=scan*seconds+(old-scan)*.18*(1-decay);
    v.radarVelocity=scan+(old-scan)*decay;
  }
  v.radarYaw=Math.atan2(Math.sin(v.radarYaw),Math.cos(v.radarYaw));
}
function captureRadarAim(u=S){
  const v=visualState(u);
  const yaw=Number.isFinite(v.radarYaw)?v.radarYaw:captureRadarYawFor(u.face||0);
  return Math.atan2(Math.sin(yaw)*CAPTURE_RADAR.projection,Math.cos(yaw));
}
function captureRadarOrigin(){
  const w=ILL_PLAYER_W,h=w*IMG.main.height/IMG.main.width,p=CAPTURE_RADAR_PART,a=facingAngle(S),m=facingMount(S,p,w,h);
  const x=(p.pivot[0]-.5)*w+m.x,y=(p.pivot[1]-.5)*h+m.y;
  const yaw=visualState(S).radarYaw??captureRadarYawFor(S.face||0);
  const e=CAPTURE_RADAR.emitter;
  return {x:S.px+x*Math.cos(a)-y*Math.sin(a)+Math.cos(yaw)*e.forward,y:S.py+x*Math.sin(a)+y*Math.cos(a)+Math.sin(yaw)*e.forward*CAPTURE_RADAR.projection-e.height};
}
function drawCaptureRadar(u,w,c){
  // Re-project the solid geometry every frame. A reusable supersampled surface
  // preserves thin metal edges during subpixel turns without rotating a flat sprite.
  if(!VISUAL.radarSurface)VISUAL.radarSurface=visualCanvas(224,224);
  const q=VISUAL.radarSurface.getContext('2d'),density=4;
  q.setTransform(1,0,0,1,0,0);q.clearRect(0,0,224,224);q.setTransform(density,0,0,density,112,112);
  paintCaptureRadar(u,q);
  const size=224/density*w/46;c.save();c.imageSmoothingEnabled=true;c.drawImage(VISUAL.radarSurface,-size/2,-size/2,size,size);c.restore();
}
function drawMountedCaptureRadar(u,w,h,c){
  const p=CAPTURE_RADAR_PART,m=facingMount(u,p,w,h);
  c.save();c.translate((p.pivot[0]-.5)*w+m.x,(p.pivot[1]-.5)*h+m.y);
  c.rotate(-facingAngle(u));drawCaptureRadar(u,w,c);c.restore();
}
function paintCaptureRadar(u,c){
  const yaw=visualState(u).radarYaw??captureRadarYawFor(u.face||0),active=!!u.beam;
  const dx=Math.cos(yaw),dy=Math.sin(yaw),lx=-dy,ly=dx,N=CAPTURE_RADAR.segments,nodes=[];
  const point=(l,f,z)=>({x:lx*l+dx*f,y:ly*l+dy*f,z});
  const screen=p=>[p.x,p.y*CAPTURE_RADAR.projection-p.z];
  const depth=p=>p.y+p.z*CAPTURE_RADAR.projection;
  function section(i,z,back=0){
    const t=-Math.PI/2+i*Math.PI/N,dl=CAPTURE_RADAR.halfWidth*Math.cos(t),df=CAPTURE_RADAR.depth*Math.sin(t),d=Math.hypot(dl,df);
    return point(Math.sin(t)*CAPTURE_RADAR.halfWidth+df/d*back,CAPTURE_RADAR.depth*(1-Math.cos(t))-3.8-dl/d*back,z);
  }
  function path(points){c.beginPath();points.forEach((p,i)=>{const [x,y]=screen(p);i?c.lineTo(x,y):c.moveTo(x,y);});}
  function polygon(points,fill,stroke='#142538',width=.35){nodes.push({depth:points.reduce((s,p)=>s+depth(p),0)/points.length,draw(){path(points);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}});}
  function line(points,color,width,bias=.02){nodes.push({depth:points.reduce((s,p)=>s+depth(p),0)/points.length+bias,draw(){path(points);c.strokeStyle=color;c.lineWidth=width;c.stroke();}});}
  c.save();c.lineJoin='round';c.lineCap='round';
  // Low armored bearing. It stays fixed while only the head above it rotates.
  c.fillStyle='#11151b';c.beginPath();c.ellipse(0,.7,6.4,3.1,0,0,Math.PI*2);c.fill();
  c.fillStyle='#82888b';c.beginPath();c.ellipse(0,-.1,5.3,2.5,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#d7e0e1';c.lineWidth=.55;c.stroke();
  c.fillStyle='#272e35';c.beginPath();c.ellipse(0,-.6,3.8,1.7,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#a3bec6';c.lineWidth=.6;c.stroke();
  c.fillStyle='#f0eded';for(const side of [-1,1])c.fillRect(side*4.1-.4,-.5,.8,.7);
  c.fillStyle='#252b33';c.fillRect(-2,-6.1,4,5.8);c.fillStyle='#a0a9ab';c.fillRect(-1.6,-6.1,.8,5.3);
  // Two load-bearing yokes connect the mast to the broad curved array.
  for(const side of [-1,1]){
    const strut=[point(side*1.4,0,3.5),point(side*7.8,-1.8,6.3),point(side*11.2,-.7,6.3)];
    line(strut,'#11161c',2.6);line(strut,'#c3c9c8',1.2,.06);line(strut,'#717c7c',.45,.08);
  }
  for(let i=0;i<N;i++){
    const t=-Math.PI/2+(i+.5)*Math.PI/N,dl=CAPTURE_RADAR.halfWidth*Math.cos(t),df=CAPTURE_RADAR.depth*Math.sin(t),d=Math.hypot(dl,df);
    const normalY=(dy*dl-ly*df)/d,front=normalY>=0;
    const inner=[section(i,6.4),section(i+1,6.4),section(i+1,14),section(i,14)];
    const outer=[section(i,6.4,1.15),section(i+1,6.4,1.15),section(i+1,14,1.15),section(i,14,1.15)];
    if(front){
      const light=Math.round(Math.max(0,normalY)*17);
      polygon(inner,'rgb('+(19+light)+','+(28+light)+','+(34+light)+')',null);
      // Fine receiving cells and two restrained blue energy channels.
      for(const z of [8.5,11.4])line([section(i,z),section(i+1,z)],active?'#78D7FF':'#347CAA',active?.40:.28,.10);
      if(i%3===0)line([section(i,7.2),section(i,13.2)],'#606c70',.22,.08);
      if(i%4===1){
        const n=.7+.3*Math.sin(VISUAL.time*.004+i*.25),z=9.8;
        line([section(i+.12,z),section(i+.70,z)],active?'rgb('+Math.round(121+n*60)+',226,255)':'#7CB9D7',.65,.15);
      }
    }else{
      const light=Math.round(Math.max(0,-normalY)*38),v=44+light;
      polygon(outer,'rgb('+(v+20)+','+(v+27)+','+(v+29)+')','#242c32',.2);
      if(i%4===0){line([section(i,7,1.2),section(i,13.5,1.2)],'#c5cbcc',1.05,.12);line([section(i,7,1.2),section(i,13.5,1.2)],'#596566',.43,.16);}
      if(i%4===1)line([section(i+.1,8.1,1.2),section(i+.85,8.1,1.2)],'#64BEED',.52,.12);
    }
    // Solid, two-layer silver/blue rim gives the curved head thickness.
    polygon([inner[3],inner[2],section(i+1,14,1.15),section(i,14,1.15)],'#bfc7c9','#576465',.3);
    line([section(i,14.15,.12),section(i+1,14.15,.12)],'#ecf0eb',.75,.18);
    polygon([inner[0],inner[1],section(i+1,6.4,1.15),section(i,6.4,1.15)],'#515d63','#171e24',.4);
    line([section(i,6.5,-.08),section(i+1,6.5,-.08)],'#419BCD',.65,.12);
  }
  // Armored end caps protect the receiver rather than leaving a wire-frame edge.
  for(const i of [0,N]){
    const points=[section(i,5.9,-.25),section(i,14.5,-.25),section(i,14.5,1.5),section(i,5.9,1.5)];
    polygon(points,'#8b979c','#253036',.6);
    line([section(i,7,-.32),section(i,13.3,-.32)],'#9BDEFF',.75,.20);
  }
  // Depth-sort the feed horn with the dish, so it is occluded correctly on turns.
  const root=point(0,-2.6,6.7),tip=point(0,8.7,9.2);
  line([root,tip],'#151c23',2.3);line([root,tip],'#bfcacb',1.05,.05);
  polygon([point(-1.35,8.5,8.2),point(1.35,8.5,8.2),point(1.1,9.2,10.1),point(-1.1,9.2,10.1)],'#657a87','#202930',.55);
  const emitter=CAPTURE_RADAR.emitter,lens=point(0,emitter.forward,emitter.height);
  line([point(-.72,emitter.forward,emitter.height),point(.72,emitter.forward,emitter.height)],active?'#DDF8FF':'#82D6FB',1.1,.16);
  nodes.push({depth:depth(lens)+.2,draw(){
    if(!active)return;const [x,y]=screen(lens),g=c.createRadialGradient(x,y,0,x,y,3.8);
    g.addColorStop(0,'#78D4FF60');g.addColorStop(1,'#318DEB00');c.fillStyle=g;c.fillRect(x-4,y-4,8,8);
  }});
  nodes.sort((a,b)=>a.depth-b.depth);for(const node of nodes)node.draw();
  c.restore();
}
function captureWaveTargets(){
  return S.enemies.filter(e=>!e.gone&&canCaptureUnit(e)&&e.cap>0&&e.resist<=0&&
    Math.hypot(e.x-S.px,e.y-S.py)<beamLen()+e.r&&
    angGap(Math.atan2(e.y-S.py,e.x-S.px),S.beamAng)<beamArc()+Math.atan2(e.r,Math.max(24,Math.hypot(e.x-S.px,e.y-S.py))))
    .slice(0,MOBILE_DEVICE?3:5);
}
// Wavefronts in a world-aligned 3D emission volume. Its axis
// is one straight ray from the lens: never bend it back toward the hull center.
// This is presentation geometry; the original ground-sector hit test is intact.
const CAPTURE_WAVE={period:1450,count:4,height:.72,thickness:.20,segments:32};
function captureWaveGeometry(){
  const targets=captureWaveTargets(),gold=targets.some(e=>e.isLegend),radarAim=captureRadarAim();
  const yaw=visualState(S).radarYaw??captureRadarYawFor(S.face||0),dx=Math.cos(radarAim),dy=Math.sin(radarAim);
  // Match the antenna's fixed world camera: ground Y is foreshortened and
  // height goes UP the screen, regardless of the direction of the beam.
  // Rotating one screen-space ellipse caused the old billboard-like roll.
  const k=CAPTURE_RADAR.projection,h=CAPTURE_WAVE.height,t=CAPTURE_WAVE.thickness,sy=Math.sin(yaw),cy=Math.cos(yaw);
  // Project a thin rounded shell, rather than a zero-thickness disc. Its small
  // physical depth keeps the rim legible edge-on without billboard rotation.
  const ax=-sy,ay=cy*k,bx=0,by=-h,cx=cy*t,cyProjected=sy*k*t;
  const xx=ax*ax+cx*cx,xy=ax*ay+cx*cyProjected,yy=ay*ay+by*by+cyProjected*cyProjected;
  const determinant=xx*yy-xy*xy,root=Math.sqrt(Math.max(0,determinant)),norm=Math.sqrt(xx+yy+2*root);
  let ux=(xx+root)/norm,uy=xy/norm,vx=xy/norm,vy=(yy+root)/norm;
  const transverse=Math.hypot(dx*uy-dy*ux,dx*vy-dy*vx);
  // Recover camera depth from the same projected shell for front/back shading.
  const kx=cy*ax+sy*t*cx,ky=cy*ay+h*k*by+sy*t*cyProjected;
  const depthX=(kx*yy-ky*xy)/determinant,depthY=(ky*xx-kx*xy)/determinant;
  const ud=(depthX*ux+depthY*uy)/transverse,vd=(depthX*vx+depthY*vy)/transverse;
  ux/=transverse;uy/=transverse;vx/=transverse;vy/=transverse;
  const along=Math.hypot(dx*ux+dy*uy,dx*vx+dy*vy),L=beamLen(),spread=Math.tan(beamArc()),axis=L/(1+spread*along);
  const frontFrom=Math.atan2(vd,ud)-Math.PI/2;
  return {origin:captureRadarOrigin(),aim:radarAim,dx,dy,ux,uy,vx,vy,ud,vd,yaw,transverse,frontFrom,L,axis,spread,targets,gold,
    color:gold?'#FFD785':'#68D9FF',core:gold?'#FFF1CE':'#D5F6FF',
    align:.18+.82*Math.pow(Math.max(0,Math.cos(facingGap(radarAim,S.beamAng))),2)};
}
function captureWaveCenter(g,p){
  return {x:g.origin.x+g.dx*g.axis*p,y:g.origin.y+g.dy*g.axis*p};
}
function captureWavePoint(g,p,phi,radiusScale=1){
  const center=captureWaveCenter(g,p),radius=g.axis*p*g.spread*radiusScale;
  const lateral=Math.cos(phi)*radius,height=Math.sin(phi)*radius;
  return {x:center.x+g.ux*lateral+g.vx*height,y:center.y+g.uy*lateral+g.vy*height,
    depth:g.ud*lateral+g.vd*height};
}
function captureWaveArc(g,p,cx,cy,from,to,radiusScale=1,append=false){
  if(!append)ctx.beginPath();
  for(let i=0;i<=CAPTURE_WAVE.segments;i++){
    const q=captureWavePoint(g,p,from+(to-from)*i/CAPTURE_WAVE.segments,radiusScale);
    if(i||append)ctx.lineTo(q.x-cx,q.y-cy);else ctx.moveTo(q.x-cx,q.y-cy);
  }
}
function drawCaptureWaveBand(g,p,cx,cy,front,strength=1){
  const alpha=Math.min(1,p/.065)*Math.pow(1-p, .7)*strength*g.align;
  if(alpha<.008)return;
  const from=g.frontFrom+(front?0:Math.PI),to=from+Math.PI,tail=Math.max(0,p-3/g.axis);
  // A short luminous shell gives each ring thickness instead of a flat arc.
  captureWaveArc(g,p,cx,cy,from,to);
  captureWaveArc(g,tail,cx,cy,to,from,.97,true);ctx.closePath();
  ctx.fillStyle=g.color;ctx.globalAlpha=alpha*(front?.15:.035);ctx.fill();
  captureWaveArc(g,p,cx,cy,from,to);
  ctx.strokeStyle=g.color;ctx.globalAlpha=alpha*(front?.14:.045);ctx.lineWidth=front?5:2.5;ctx.stroke();
  ctx.globalAlpha=alpha*(front?.9:.28);ctx.lineWidth=front?1.3:.65;ctx.stroke();
  captureWaveArc(g,p,cx,cy,from+.13,to-.13,.97);
  ctx.strokeStyle=g.core;ctx.globalAlpha=alpha*(front?.7:.16);ctx.lineWidth=.5;ctx.stroke();
  // The near crown catches light; the far hemisphere stays translucent.
  if(front){captureWaveArc(g,p,cx,cy,from+Math.PI*.31,from+Math.PI*.69);ctx.globalAlpha=alpha*.8;ctx.lineWidth=.8;ctx.stroke();}
}
function captureWavePhases(){
  return Array.from({length:CAPTURE_WAVE.count},(_,k)=>(VISUAL.time/CAPTURE_WAVE.period+k/CAPTURE_WAVE.count)%1).sort((a,b)=>b-a);
}
function captureVolumeTangents(g){
  // Tangents from the lens to the projected end ellipse. These two straight
  // generators bound the complete volume, including every traveling ring.
  const u=g.dx*g.uy-g.dy*g.ux,v=g.dx*g.vy-g.dy*g.vx,det=g.ux*g.vy-g.uy*g.vx;
  const mid=Math.atan2(-u,v),half=Math.acos(Math.max(-1,Math.min(1,-g.spread*det)));
  const a=mid-half,b=mid+half;
  const forward=(g.dx*g.ux+g.dy*g.uy)*Math.cos(mid)+(g.dx*g.vx+g.dy*g.vy)*Math.sin(mid);
  return forward>=0?[a,b]:[b,a+Math.PI*2];
}
function drawCaptureVolume(g,cx,cy,front,maxDistance=Infinity){
  const extent=Math.min(1,maxDistance/g.L),o=g.origin,end=captureWaveCenter(g,extent);
  const [from,to]=captureVolumeTangents(g);
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  if(!front){
    // A translucent, shaded shell connects the rings into a readable space.
    // The silhouette uses the same projection as the moving wavefronts.
    ctx.beginPath();ctx.moveTo(o.x-cx,o.y-cy);
    captureWaveArc(g,extent,cx,cy,from,to,1,true);ctx.closePath();
    const glow=ctx.createLinearGradient(o.x-cx,o.y-cy,end.x-cx,end.y-cy);
    glow.addColorStop(0,g.gold?'#FFC76508':'#51C9F608');
    glow.addColorStop(.2,g.gold?'#FFC76530':'#51C9F632');
    glow.addColorStop(.75,g.gold?'#FFC76525':'#51C9F629');
    glow.addColorStop(1,g.gold?'#FFC76512':'#51C9F618');
    ctx.fillStyle=glow;ctx.globalAlpha=g.align;ctx.fill();
    // A gentle near-side highlight gives the enclosing space a curved surface.
    ctx.beginPath();ctx.moveTo(o.x-cx,o.y-cy);
    captureWaveArc(g,extent,cx,cy,g.frontFrom+Math.PI*.17,g.frontFrom+Math.PI*.60,1,true);ctx.closePath();
    ctx.fillStyle=g.core;ctx.globalAlpha=.032*g.align;ctx.fill();
  }
  if(front){
    // Keep the side boundaries while leaving the far end open.
    for(const phi of [from,to]){
      const q=captureWavePoint(g,extent,phi),start=captureWavePoint(g,Math.min(extent,.025),phi);
      ctx.beginPath();ctx.moveTo(start.x-cx,start.y-cy);ctx.lineTo(q.x-cx,q.y-cy);
      ctx.strokeStyle='#092B3E';ctx.lineWidth=2.5;ctx.globalAlpha=.26*g.align;ctx.stroke();
      ctx.strokeStyle=g.color;ctx.lineWidth=.8;ctx.globalAlpha=.48*g.align;ctx.stroke();
    }
  }
  ctx.restore();
}
function drawCaptureWaves(cx,cy){
  if(!S?.beam||!Number.isFinite(S.beamAng)||visualState(S).dead)return;
  const g=captureWaveGeometry(),time=VISUAL.time,o=g.origin;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  drawCaptureVolume(g,cx,cy,false);
  // Far halves go behind units; near halves are drawn above them.
  for(const p of captureWavePhases())drawCaptureWaveBand(g,p,cx,cy,false);
  for(let j=0;j<6;j++){
    const phi=j/6*Math.PI*2+.3,p=(time/1800+j*.173)%1;
    const q=captureWavePoint(g,p,phi,.76),tail=captureWavePoint(g,Math.max(0,p-3.2/g.axis),phi,.76);
    ctx.globalAlpha=Math.sin(p*Math.PI)*.26*g.align;ctx.strokeStyle=g.core;ctx.lineWidth=.65;
    ctx.beginPath();ctx.moveTo(tail.x-cx,tail.y-cy);ctx.lineTo(q.x-cx,q.y-cy);ctx.stroke();
  }
  // Receiving sparks end at the very same lens used by outgoing waves.
  for(const e of g.targets){
    const progress=Math.min(1,e.cap/capFill()),r=e.r+4,c=e.isLegend?'#FFD785':'#ACFFE8';
    ctx.strokeStyle=c;ctx.lineWidth=.85;ctx.globalAlpha=.30+progress*.45;
    for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;ctx.beginPath();ctx.arc(e.x-cx,e.y-cy,r,a-.13,a+.13);ctx.stroke();}
    for(let k=0;k<3;k++){const p=(time/630+k/3)%1,x=e.x+(o.x-e.x)*p,y=e.y+(o.y-e.y)*p;ctx.globalAlpha=Math.sin(p*Math.PI)*(.35+progress*.35);ctx.fillStyle=c;ctx.fillRect(x-cx-.7,y-cy-.7,1.4,1.4);}
  }
  ctx.restore();
}
function drawCaptureEmitter(cx,cy,maxDistance=Infinity){
  if(!S?.beam||!Number.isFinite(S.beamAng)||visualState(S).dead)return;
  const g=captureWaveGeometry(),o=g.origin,time=VISUAL.time;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(Number.isFinite(maxDistance))drawCaptureVolume(g,cx,cy,false,maxDistance);
  drawCaptureVolume(g,cx,cy,true,maxDistance);
  for(const p of captureWavePhases()){
    if(g.L*p>maxDistance)continue;
    // The isolated enlargement has no background pass, so show both halves.
    if(Number.isFinite(maxDistance))drawCaptureWaveBand(g,p,cx,cy,false);
    drawCaptureWaveBand(g,p,cx,cy,true);
  }
  // A compact launch collar uses the same 3D projection as the traveling rings.
  const launch=(time/480)%1;
  drawCaptureWaveBand(g,(1+launch*10)/g.L,cx,cy,false,(1-launch)*.7);
  drawCaptureWaveBand(g,(1+launch*10)/g.L,cx,cy,true,(1-launch)*.7);
  const halo=ctx.createRadialGradient(o.x-cx,o.y-cy,0,o.x-cx,o.y-cy,5);
  halo.addColorStop(0,g.gold?'#FFF1BD99':'#C0F7FF99');halo.addColorStop(1,'#70CEFF00');
  ctx.globalAlpha=.75;ctx.fillStyle=halo;ctx.fillRect(o.x-cx-5,o.y-cy-5,10,10);
  ctx.fillStyle=g.core;ctx.globalAlpha=.9;ctx.fillRect(o.x-cx-.55,o.y-cy-.55,1.1,1.1);ctx.restore();
}


/* VELCARION: story-gated capture content. Existing UNITS / shop / card pools stay intact.
 * Timers are milliseconds; speeds retain the game's pixels-per-16ms convention.
 * New projectiles own their collision/lifetime; original projectile rules are untouched. */
const VELCARION={
  v_arc:{name:'아크 블레이드',en:'ARC BLADE',role:'근접 돌격형 보병',hp:7,armor:0,spd:1.95,r:17,w:27,score:1150,weight:24,
    detail:'빠른 2연속 베기 · 5회 공격 후 1.5초 충전 칼날파',kind:'walk'},
  v_crawler:{name:'크롤러 센티넬',en:'CRAWLER SENTINEL',role:'다족 중거리 사격 유닛',hp:20,armor:.08,spd:1.25,r:25,w:74,score:1850,weight:23,
    detail:'청색 에너지탄 · 다리 고정 후 2.5초 충전 전방위 연사',kind:'walk'},
  v_oblivion:{name:'오블리비언 캐논',en:'OBLIVION CANNON',role:'초중량 공성 전차',hp:46,armor:.22,spd:.85,r:32,w:87,score:3100,weight:17,
    detail:'2초 정지 충전 · 대형 에너지탄 착탄 후 4차례 방사형 연사',kind:'track'},
  v_phantom:{name:'팬텀 레이저윙',en:'PHANTOM LASERWING',role:'고속 비행 공격기',hp:9,armor:0,spd:1.85,r:22,w:68,score:1500,weight:18,flying:true,
    detail:'장거리 쌍열 관통 레이저탄 · 순간이동 직후 쌍열 5연사',kind:'jet'},
  v_revenant:{name:'볼트 레버넌트',en:'VOLT REVENANT',role:'부유형 전격 에너지체',hp:40,armor:.18,spd:.95,r:25,w:67,score:2900,weight:12,flying:false,
    detail:'사거리 내 지속 전격 · 6초 공격 후 1.8초 충전 · 1.5초 전기 폭풍과 이동 감속 · 사망 시 0.8초 이동 정지',kind:'hover'},
  v_eclipse:{name:'이클립스 드레드노트',en:'ECLIPSE DREADNOUGHT',role:'중대형 외계 전투함',hp:58,armor:.24,spd:.88,r:38,w:140,score:4200,weight:6,flying:true,
    detail:'전방·주변 분열 에너지탄 · 4초 충전 후 2.4초 지속 광폭 펄스빔',kind:'jet'},
};
const VELCA_KEYS=Object.keys(VELCARION);
const VELCA_SPAWN_RATE=.08, VELCA_MAX_ACTIVE=4, VELCA_MAX_SHOTS=240, VELCA_MAX_FX=100;
const VELCA_ATTACK={
  crawler:{count:10,waves:4,interval:190,speed:3.8,dmg:4,range:400},
  siege:{charge:2000,count:12,waves:4,interval:125,delay:100,speed:4.4,dmg:5,range:280},
  phantom:{waves:5,interval:110},
  revenant:{cooldown:900,hold:260,range:185,breakRange:210,splash:64,dmg:10,tetherWidth:8,channel:6000,stormCharge:1800,stormLife:1500,stormRadius:88,stormTick:300,stormDmg:4},
  beam:{charge:4000,life:2400,len:1050,width:104,dmg:29}
};
function isVelcarion(u){return !!(u&&(u.faction==='velcarion'||VELCARION[u.type]));}
function velcaUnlocked(){return !!S&&(S.story?S.story.ch===4:S.stage>=41);}
function velcaState(){return S.velca||(S.velca={shots:[],fx:[],emitters:[],beams:[],channels:[],storms:[],time:0,serial:0});}
function makeVelcarion(type,x,y){
  const d=VELCARION[type];if(!d)throw Error('Unknown Velcarion '+type);
  const hp=Math.ceil(d.hp*(1+(S.stage-1)*TUNE.enemyHpPerStage));
  return {type,...d,img:type,label:d.name,faction:'velcarion',uncapturable:!ownsVelcaCore(),side:'enemy',ai:'velcarion',fire:0,noFire:true,
    x,y,hp,hpMax:hp,face:Math.PI/2,cap:0,resist:0,slow:0,poison:0,poisonCd:0,t:0,bob:0,
    vc:{phase:'move',timer:600,shots:0,aim:Math.PI/2,teleportCd:5800,step:Math.random()*6.283,swing:0,charge:0}};
}
function velcaSpawnInstead(x,y){
  if(!velcaUnlocked()||S.enemies.filter(isVelcarion).length>=VELCA_MAX_ACTIVE||Math.random()>=VELCA_SPAWN_RATE)return false;
  let roll=Math.random()*100,type=VELCA_KEYS[0];
  for(const key of VELCA_KEYS){roll-=VELCARION[key].weight;if(roll<0){type=key;break;}}
  const e=makeVelcarion(type,x,y);resolveProps(e,e.r,e.flying);S.enemies.push(e);velcaState();return true;
}
function velcaPos(t){return t===S?{x:S.px,y:S.py,r:14}:{x:t.x,y:t.y,r:t.r||26};}
function velcaTarget(e,range=Infinity){
  let best=null,dist=range;
  for(const t of velcaTargets(e)){if(t.hp<=0)continue;const p=velcaPos(t),d=Math.hypot(p.x-e.x,p.y-e.y);if(d<dist){best=t;dist=d;}}
  return best;
}
function velcaFX(f){const v=velcaState();if(v.fx.length>=VELCA_MAX_FX)v.fx.shift();v.fx.push({age:0,id:++v.serial,...f});}
function velcaHit(t,dmg,stun=0,source=null){
  if(t.hp<=0||mode!=='play')return;
  if(velcaTeam(source)==='ally'){
    if(!velcaValidTarget(source,t))return;
    const dealt=Math.max(1,dmg/7)*(1+(S.allyPwr||0)+relicVal('r_link'));
    if(S.turrets.includes(t))hitTurret(t,dealt);
    else{damageUnit(t,dealt,null);if(stun&&t.hp>0)t.velcaStun=Math.max(t.velcaStun||0,stun);}
    return;
  }
  if(t===S){damagePlayer(Math.round(dmg*enemyDmgScale()));if(stun&&S.hp>0)S.stun=Math.max(S.stun||0,stun);}
  else {t.hp-=Math.max(1,dmg/7);if(stun)t.velcaStun=Math.max(t.velcaStun||0,stun);visualHit(t);
    if(t.hp<=0){visualDeath(t);const i=S.allies.indexOf(t);if(i>=0)S.allies.splice(i,1);}}
}
function velcaArea(x,y,r,dmg,stun=0,source=null){
  for(const t of velcaTargets(source)){const p=velcaPos(t);if(Math.hypot(p.x-x,p.y-y)<=r+p.r)velcaHit(t,dmg,stun,source);}
}
function velcaShot(e,a,opts={}){
  const v=velcaState();if(v.shots.filter(b=>b.team===velcaTeam(e)).length>=VELCA_MAX_SHOTS)return;
  const nose=opts.nose===undefined?e.r*.85:opts.nose,side=opts.side||0,origin=opts.origin||(!opts.radial&&e.type?velcaMuzzle(e,a,side):null)||{
    x:e.x+Math.cos(a)*nose-Math.sin(a)*side,y:e.y+Math.sin(a)*nose+Math.cos(a)*side};
  const speed=opts.speed||3.8;
  const visible=(!opts.radial&&!opts.origin&&e.type)?facingIsoMuzzle(e,side):null;
  const shot={team:velcaTeam(e),owner:e.owner||e,x:origin.x,y:origin.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,a,r:4,dmg:8,
    range:480,travel:0,age:0,kind:'orb',hit:new Set(),visualDx:visible?visible.x-origin.x:0,visualDy:visible?visible.y-origin.y:0,...opts};
  if(shot.kind==='archonBolt'&&e.type==='v_revenant'){
    shot.tether={owner:e,root:velcaMuzzle(e,a),positions:new WeakMap(),damaged:new Set(),line:null,severed:false};
    for(const target of velcaTargets(e))shot.tether.positions.set(target,velcaPos(target));
  }
  v.shots.push(shot);
  e.vc.recoil=110;velcaFX({team:velcaTeam(e),k:'muzzle',x:visible?visible.x:origin.x,y:visible?visible.y:origin.y,a,r:opts.r||4,life:100});
}
function velcaRing(e,count,offset,opts={}){for(let i=0;i<count;i++)velcaShot(e,offset+i*Math.PI*2/count,{radial:true,...opts});}
function velcaCharge(e,ms,phase,aim){
  const q=e.vc;q.phase=phase;q.timer=ms;q.charge=ms;q.aim=aim;e.mv=0;
}
function velcaMove(e,p,dt,sl,desired,strafe=0){
  const dx=p.x-e.x,dy=p.y-e.y,dist=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx);
  const radial=dist>desired?1:dist<desired*.65?-.45:0;
  const lateral=strafe*Math.sin(e.vc.step+e.t*.0045);
  const norm=Math.max(1,Math.hypot(radial,lateral)),speed=e.spd*sl*dt/16;
  e.x+=(Math.cos(a)*radial-Math.sin(a)*lateral)*speed/norm;
  e.y+=(Math.sin(a)*radial+Math.cos(a)*lateral)*speed/norm;
}
function velcaTeleport(e,p,min=135,max=190){
  // Ground entities must have a clear, obstacle-free route: no wall hopping.
  const q=e.vc,start=q.step+e.t*.001;
  for(let i=0;i<20;i++){
    const a=start+i*2.399,dist=min+(max-min)*(i%5)/4;
    const pos={x:p.x+Math.cos(a)*dist,y:p.y+Math.sin(a)*dist};
    if(pos.x<e.r+18||pos.y<e.r+18||pos.x>WORLD.w-e.r-18||pos.y>WORLD.h-e.r-18)continue;
    if(!e.flying){
      const check={...pos};resolveProps(check,e.r,false);
      if(Math.hypot(check.x-pos.x,check.y-pos.y)>1)continue;
      let blocked=false;const steps=Math.ceil(Math.hypot(pos.x-e.x,pos.y-e.y)/12);
      for(let j=1;j<=steps;j++){const at={x:e.x+(pos.x-e.x)*j/steps,y:e.y+(pos.y-e.y)*j/steps},test={...at};resolveProps(test,e.r,false);if(Math.hypot(at.x-test.x,at.y-test.y)>1){blocked=true;break;}}
      if(blocked)continue;
    }
    velcaFX({team:velcaTeam(e),k:'teleport',x:e.x,y:e.y,r:e.r,life:430});
    e.x=pos.x;e.y=pos.y;velcaFX({team:velcaTeam(e),k:'teleport',x:e.x,y:e.y,r:e.r,life:430});q.timer=Math.max(q.timer,420);return true;
  }
  return false;
}
function velcaSlash(e,second){
  const q=e.vc;q.swing=200;q.swingSide=second?1:-1;e.atkT=200;
  velcaFX({team:velcaTeam(e),k:'slash',x:e.x,y:e.y,a:q.aim,r:64,life:210,side:q.swingSide});
  for(const t of velcaTargets(e)){const p=velcaPos(t),d=Math.hypot(p.x-e.x,p.y-e.y);
    if(d<64+p.r&&angGap(Math.atan2(p.y-e.y,p.x-e.x),q.aim)<1.15)velcaHit(t,second?7:6,0,e);}
}
function velcaTwinLaser(e,a){
  for(const side of [-9,9])velcaShot(e,a,{kind:'laserBolt',side,speed:8.4,range:880,r:2.5,dmg:9,pierce:true});
}
function velcaRevenantAttack(e,target=velcaTarget(e,VELCA_ATTACK.revenant.range)){
  if(!target||target.hp<=0)return false;
  const d=VELCA_ATTACK.revenant,p=velcaPos(target),length=Math.hypot(p.x-e.x,p.y-e.y);if(length>d.range+p.r)return false;
  const v=velcaState();v.channels=v.channels||[];if(v.channels.some(c=>c.owner===e)||v.channels.filter(c=>velcaTeam(c.owner)===velcaTeam(e)).length>=VELCA_MAX_ACTIVE)return false;
  const q=e.vc,a=Math.atan2(p.y-e.y,p.x-e.x);q.aim=a;q.phase='channel';q.timer=d.channel-(q.channelSpent||0);q.recoil=d.hold;
  const root=velcaMuzzle(e,a),c={owner:e,player:target===S,target:target===S?null:target,age:0,reach:0,line:{ax:root.x,ay:root.y,bx:root.x,by:root.y,width:d.tetherWidth},positions:new WeakMap(),lastHit:new WeakMap()};
  for(const t of velcaTargets(e))c.positions.set(t,velcaPos(t));v.channels.push(c);return true;
}
function velcaAI(e,dt,sl){
  const q=e.vc;if(e.hp<=0)return;e.mv=0;e.noFire=true;e.uncapturable=!ownsVelcaCore();if(e.uncapturable)e.cap=0;
  q.timer-=dt;q.teleportCd-=dt;q.swing=Math.max(0,(q.swing||0)-dt);q.recoil=Math.max(0,(q.recoil||0)-dt);
  const target=velcaTarget(e),p=target?velcaPos(target):{x:S.px,y:S.py};
  const dist=Math.hypot(p.x-e.x,p.y-e.y),aim=Math.atan2(p.y-e.y,p.x-e.x);
  if(q.phase==='move')q.aim=aim;
  if(e.type==='v_arc'){
    if(q.phase==='pulseCharge'){
      if(q.timer<=0){velcaShot(e,q.aim,{kind:'blade',r:12,dmg:16,speed:6,range:205});q.phase='move';q.timer=700;q.shots=0;}
    }else if(q.phase==='double'){
      if(q.timer<=0){velcaSlash(e,true);q.shots++;if(q.shots>=5)velcaCharge(e,1500,'pulseCharge',aim);else{q.phase='move';q.timer=310;}}
    }else{
      velcaMove(e,p,dt,sl,48,.55);
      if(dist<70&&q.timer<=0){q.aim=aim;velcaSlash(e,false);q.phase='double';q.timer=190;}
    }
  }else if(e.type==='v_crawler'){
    if(q.phase==='barrageCharge'){
      if(q.timer<=0){q.phase='barrage';q.timer=0;q.bursts=0;}
    }else if(q.phase==='barrage'){
      if(q.timer<=0){const d=VELCA_ATTACK.crawler;velcaRing(e,d.count,q.bursts*.12,{speed:d.speed,range:d.range,r:3.5,dmg:d.dmg});q.bursts++;q.timer+=d.interval;
        if(q.bursts>=d.waves){q.phase='move';q.timer=1100;q.shots=0;}}
    }else{
      velcaMove(e,p,dt,sl,230,.85);
      if(dist<510&&q.timer<=0){for(const side of [-10,10])velcaShot(e,aim,{side,speed:4.2,dmg:8});q.shots++;q.timer=680;
        if(q.shots>=6)velcaCharge(e,2500,'barrageCharge',aim);}
    }
  }else if(e.type==='v_oblivion'){
    if(q.phase==='siegeCharge'){
      if(q.timer<=0){velcaShot(e,q.aim,{r:13,kind:'heavyOrb',speed:3.1,range:680,dmg:23,splash:69,siegeBarrage:true});q.phase='recover';q.timer=1400;}
    }else if(q.phase==='recover'){if(q.timer<=0)q.phase='move';}
    else if(dist<560&&q.timer<=0)velcaCharge(e,VELCA_ATTACK.siege.charge,'siegeCharge',aim);
    else velcaMove(e,p,dt,sl,510,0);
  }else if(e.type==='v_phantom'){
    if(q.phase==='warpCharge'){
      if(q.timer<=0){const warped=velcaTeleport(e,p,125,180);q.teleportCd=7600;
        if(warped){q.aim=Math.atan2(p.y-e.y,p.x-e.x);e.face=q.aim;facingUpdate(e,0,0,true);velcaTwinLaser(e,q.aim);q.phase='warpBurst';q.bursts=1;q.timer=VELCA_ATTACK.phantom.interval;}
        else{q.phase='move';q.timer=450;}}
    }else if(q.phase==='warpBurst'){
      if(q.timer<=0){q.aim=aim;velcaTwinLaser(e,q.aim);q.bursts++;q.timer+=VELCA_ATTACK.phantom.interval;
        if(q.bursts>=VELCA_ATTACK.phantom.waves){q.phase='move';q.timer=880;}}
    }else{
      velcaMove(e,p,dt,sl,290,1.1);
      if(q.teleportCd<=0&&dist<700)velcaCharge(e,550,'warpCharge',aim);
      else if(dist<750&&q.timer<=0){velcaTwinLaser(e,aim);q.timer=880;}
    }
  }else if(e.type==='v_revenant'){
    if(q.phase==='warpCharge'){
      if(q.timer<=0){velcaTeleport(e,p,150,205);q.phase='move';q.teleportCd=6400;q.timer=650;}
    }else if(q.phase==='channel'){
      const c=(velcaState().channels||[]).find(c=>c.owner===e),victim=c&&(c.player?S:c.target),at=victim&&velcaPos(victim);
      if(!victim||victim.hp<=0||!velcaValidTarget(e,victim)||Math.hypot(at.x-e.x,at.y-e.y)>VELCA_ATTACK.revenant.breakRange||Number.isFinite(velcaWallT(e.x,e.y,at.x,at.y))){velcaStopChannel(e);}
      else {q.aim=Math.atan2(at.y-e.y,at.x-e.x);
        if(q.timer<=0){velcaStopChannel(e);q.channelSpent=0;q.stormPoint={x:at.x,y:at.y};velcaCharge(e,VELCA_ATTACK.revenant.stormCharge,'stormCharge',q.aim);}}
    }else if(q.phase==='stormCharge'){
      if(q.timer<=0){const root=velcaMuzzle(e,q.aim),at=q.stormPoint;q.aim=Math.atan2(at.y-root.y,at.x-root.x);
        velcaShot(e,q.aim,{kind:'stormSeed',origin:root,speed:6,r:8,dmg:0,range:Math.max(1,Math.hypot(at.x-root.x,at.y-root.y))});q.phase='recover';q.timer=650;q.recoil=220;}
    }else if(q.phase==='recover'){
      if(q.timer<=0){q.phase='move';q.timer=0;}
    }else{
      velcaMove(e,p,dt,sl,150,0);
      if(dist<VELCA_ATTACK.revenant.range&&q.timer<=0)velcaRevenantAttack(e,target);
      else if(dist>330&&q.teleportCd<=0)velcaCharge(e,650,'warpCharge',aim);
    }
  }else if(e.type==='v_eclipse'){
    if(q.phase==='beamCharge'){
      if(q.timer<=0){const d=VELCA_ATTACK.beam;velcaBeam(e,q.aim,d.len,d.width,d.dmg);q.phase='beamHold';q.timer=d.life;q.shots=0;}
    }else if(q.phase==='beamHold'){if(q.timer<=0){q.phase='recover';q.timer=1400;}
    }else if(q.phase==='recover'){if(q.timer<=0)q.phase='move';}
    else{
      velcaMove(e,p,dt,sl,320,.35);
      if(dist<720&&q.timer<=0){
        for(const side of [-13,13])velcaShot(e,aim,{side,r:8,kind:'heavyOrb',speed:3.3,range:570,dmg:14,splash:37,split:7});
        velcaRing(e,8,aim+q.shots*.25,{r:5.5,speed:2.7,range:215,dmg:8,splash:23,split:4,childRange:125});
        q.shots++;q.timer=1000;if(q.shots>=6)velcaCharge(e,VELCA_ATTACK.beam.charge,'beamCharge',aim);
      }
    }
  }
  e.face=q.aim;
}
function velcaSegmentT(x,y,ax,ay,bx,by,r){
  const dx=bx-ax,dy=by-ay,ox=ax-x,oy=ay-y,A=dx*dx+dy*dy,C=ox*ox+oy*oy-r*r;
  if(C<=0)return 0;if(A<1e-8)return Infinity;
  const B=2*(ox*dx+oy*dy),D=B*B-4*A*C;if(D<0)return Infinity;
  const t=(-B-Math.sqrt(D))/(2*A);return t>=0&&t<=1?t:Infinity;
}
function velcaWallT(ax,ay,bx,by){
  const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/6));
  for(let j=0;j<=steps;j++)if(blockedByProp(ax+(bx-ax)*j/steps,ay+(by-ay)*j/steps))return j/steps;
  return Infinity;
}
function velcaTetherAlive(b){
  const t=b.tether,e=t&&t.owner;return !!(t&&!t.severed&&velcaOwnerAlive(e));
}
function velcaTetherClip(ax,ay,bx,by){
  const wall=velcaWallT(ax,ay,bx,by),f=Number.isFinite(wall)?wall:1;
  return {ax,ay,bx:ax+(bx-ax)*f,by:ay+(by-ay)*f,width:VELCA_ATTACK.revenant.tetherWidth};
}
function velcaTetherDistance(p,l){
  const dx=l.bx-l.ax,dy=l.by-l.ay,length2=dx*dx+dy*dy,t=length2>1e-8?Math.max(0,Math.min(1,((p.x-l.ax)*dx+(p.y-l.ay)*dy)/length2)):0;
  return Math.hypot(p.x-l.ax-dx*t,p.y-l.ay-dy*t);
}
function velcaTetherUpdate(b,oldX,oldY,dt,end=1){
  const t=b.tether;if(!t)return;
  if(!velcaTetherAlive(b)){t.line=null;t.severed=true;return;}
  const root=velcaMuzzle(t.owner,b.a),oldRoot=t.root,rootTravel=Math.hypot(root.x-oldRoot.x,root.y-oldRoot.y);
  // A teleport severs the connection instead of drawing/damaging across the map.
  const jump=Math.max(96,dt*2.5);if(rootTravel>jump){t.line=null;t.severed=true;return;}
  t.line=velcaTetherClip(root.x,root.y,b.x,b.y);
  const headTravel=Math.hypot(b.x-oldX,b.y-oldY),width=VELCA_ATTACK.revenant.tetherWidth;
  for(const target of velcaTargets(b)){
    const p=velcaPos(target);let previous=t.positions.get(target)||p;t.positions.set(target,p);
    if(target.hp<=0||t.damaged.has(target)||mode!=='play')continue;
    let travel=Math.hypot(p.x-previous.x,p.y-previous.y);if(travel>jump){previous=p;travel=0;}
    // Subdivide synchronized target/anchor/head motion. This catches a crossing
    // between frames without reaching beyond the distance the orb has travelled.
    const steps=Math.max(1,Math.min(64,Math.ceil((travel+Math.max(rootTravel,headTravel))/Math.max(2,p.r*.4))));
    for(let i=0;i<=steps;i++){
      const f=i/steps,at=f*end,point={x:previous.x+(p.x-previous.x)*at,y:previous.y+(p.y-previous.y)*at};
      const line={ax:oldRoot.x+(root.x-oldRoot.x)*at,ay:oldRoot.y+(root.y-oldRoot.y)*at,bx:oldX+(b.x-oldX)*f,by:oldY+(b.y-oldY)*f};
      if(velcaTetherDistance(point,line)>p.r+width/2)continue;
      const clipped=velcaTetherClip(line.ax,line.ay,line.bx,line.by);
      if(velcaTetherDistance(point,clipped)>p.r+width/2)continue;
      // Walls also shield a body whose radius overlaps the clipped beam tip.
      if(Number.isFinite(velcaWallT(line.ax,line.ay,point.x,point.y)))continue;
      t.damaged.add(target);velcaHit(target,b.dmg,0,b);
      velcaFX({team:velcaTeam(b),k:'electric',x:point.x,y:point.y,r:15,life:130});break;
    }
  }
  t.root=root;
}
function velcaImpact(b,expired=false){
  if(b.kind==='stormSeed'){velcaCreateStorm(b);return;}
  if(b.kind==='archonBolt'){
    if(!expired||b.hit.size){
      for(const t of velcaTargets(b)){const p=velcaPos(t),dist=Math.hypot(p.x-b.x,p.y-b.y);
        if(t.hp>0&&!(b.tether&&b.tether.damaged.has(t))&&(b.hit.has(t)||dist<=b.archonSplash+p.r)){
          if(b.tether)b.tether.damaged.add(t);velcaHit(t,b.dmg*(b.hit.has(t)?1:dist<=b.archonSplash*.5?.6:.35),0,b);}}
      velcaFX({team:velcaTeam(b),k:'archonArc',x:b.x,y:b.y,a:b.a,len:0,r:b.archonSplash,life:300});
    }else velcaFX({team:velcaTeam(b),k:'impact',x:b.x,y:b.y,r:10,life:150});
    return;
  }
  if(b.splash){velcaArea(b.x,b.y,b.splash,b.dmg,0,b);visualScorch(b.x,b.y,b.splash*.65);
    velcaFX({team:velcaTeam(b),k:'blast',x:b.x,y:b.y,r:b.splash,life:580});
    if(b.siegeBarrage){const v=velcaState();let x=b.x,y=b.y;
      // A sampled wall hit may be a few pixels inside terrain. Keep the emitter
      // on the incoming side so outward waves survive and inward shots hit the wall.
      for(let step=0;step<8&&blockedByProp(x,y);step++){x-=Math.cos(b.a)*2;y-=Math.sin(b.a)*2;}
      if(v.emitters.filter(f=>f.team===b.team).length<8)v.emitters.push({team:b.team,owner:b.owner,x,y,a:b.a,waves:0,timer:VELCA_ATTACK.siege.delay});}
    else if(b.split){const dummy={team:b.team,owner:b.owner,x:b.x,y:b.y,r:0,vc:{}};
      for(let i=0;i<b.split;i++)velcaShot(dummy,i*Math.PI*2/b.split+b.a,{nose:0,speed:4.1,r:3,dmg:5,range:b.childRange||230,kind:'shard'});}
  }else if(!expired)velcaFX({team:velcaTeam(b),k:'impact',x:b.x,y:b.y,r:12,life:170});
}
function velcaBeam(e,a,len,width,dmg){
  // Persistent, direction-locked hazard. Each target can be hit once per beam,
  // including targets entering later; damage never scales with frame rate.
  const v=velcaState();if(v.beams.filter(b=>velcaTeam(b)===velcaTeam(e)).length>=VELCA_MAX_ACTIVE)return;
  const muzzle=velcaMuzzle(e,a),x=muzzle.x,y=muzzle.y,dx=Math.cos(a),dy=Math.sin(a);
  const wall=velcaWallT(x,y,x+dx*len,y+dy*len);if(Number.isFinite(wall))len*=wall;
  const beam={team:velcaTeam(e),x,y,a,len,width,dmg,life:VELCA_ATTACK.beam.life,age:0,owner:e,hit:new Set(),id:++v.serial};
  v.beams.push(beam);velcaBeamHit(beam);e.vc.recoil=240;
}
function velcaBeamHit(b){
  const {x,y,a,len,width,dmg}=b,dx=Math.cos(a),dy=Math.sin(a);
  for(const t of velcaTargets(b)){const p=velcaPos(t),along=(p.x-x)*dx+(p.y-y)*dy,across=Math.abs((p.x-x)*dy-(p.y-y)*dx);
    if(t.hp>0&&!b.hit.has(t)&&along>=-p.r&&along<=len+p.r&&across<width/2+p.r){b.hit.add(t);velcaHit(t,dmg,0,b);}}
}
function velcaDeath(e){
  if(!isVelcarion(e)||e.vc.dead)return;e.vc.dead=true;
  if(S.velca)S.velca.beams=S.velca.beams.filter(b=>b.owner!==e);
  if(e.type==='v_revenant'&&S.velca)S.velca.channels=(S.velca.channels||[]).filter(c=>c.owner!==e);
  velcaFX({team:velcaTeam(e),k:'blast',x:e.x,y:e.y,r:e.type==='v_revenant'?165:e.r*1.7,life:e.type==='v_revenant'?1000:600});
  if(e.type==='v_revenant'){velcaArea(e.x,e.y,165,25,800,e);velcaFX({team:velcaTeam(e),k:'electric',x:e.x,y:e.y,r:165,life:800});visualScorch(e.x,e.y,80);}
}
function velcaUpdate(dt){
  if(!S||mode!=='play'||!S.velca)return;const v=S.velca;v.time+=dt;
  velcaUpdateChannels(dt);velcaUpdateStorms(dt);
  for(let i=v.fx.length-1;i>=0;i--){v.fx[i].age+=dt;if(v.fx[i].age>=v.fx[i].life)v.fx.splice(i,1);}
  for(let i=v.beams.length-1;i>=0;i--){const b=v.beams[i];b.age+=dt;
    if(b.age>=b.life||!velcaOwnerAlive(b.owner))v.beams.splice(i,1);else velcaBeamHit(b);}
  for(let i=v.emitters.length-1;i>=0;i--){const f=v.emitters[i],d=VELCA_ATTACK.siege;f.timer-=dt;
    if(f.timer<=0){velcaRing({team:f.team,owner:f.owner,x:f.x,y:f.y,r:0,vc:{}},d.count,f.a+f.waves*.12,{nose:0,speed:d.speed,r:3,dmg:d.dmg,range:d.range,kind:'shard'});
      velcaFX({team:velcaTeam(f),k:'barragePulse',x:f.x,y:f.y,r:44,life:220});f.waves++;f.timer+=d.interval;}
    if(f.waves>=d.waves)v.emitters.splice(i,1);
  }
  // Snapshot: split children enter next frame and cannot recurse on the impact frame.
  const pending=v.shots;v.shots=[];
  for(const b of pending){
    if(mode!=='play'){v.shots.push(b);continue;}
    const ox=b.x,oy=b.y,step=Math.min(Math.hypot(b.vx,b.vy)*dt/16,b.range-b.travel),a=b.a;
    const nx=ox+Math.cos(a)*step,ny=oy+Math.sin(a)*step,wall=velcaWallT(ox,oy,nx,ny);
    const hits=[];
    for(const t of velcaTargets(b)){if(t.hp<=0||b.hit.has(t))continue;const p=velcaPos(t),at=velcaSegmentT(p.x,p.y,ox,oy,nx,ny,p.r+b.r);if(at<=wall&&Number.isFinite(at))hits.push({t,at});}
    hits.sort((a,b)=>a.at-b.at);let end=Number.isFinite(wall)?wall:1,hit=false;
    for(const h of hits){b.hit.add(h.t);hit=true;
      if(!b.splash&&b.kind!=='archonBolt'&&b.kind!=='stormSeed')velcaHit(h.t,b.dmg,0,b);
      if(!b.pierce){end=h.at;break;}}
    b.x=ox+(nx-ox)*end;b.y=oy+(ny-oy)*end;b.travel+=step*end;b.age+=dt;
    if(b.tether)velcaTetherUpdate(b,ox,oy,dt,end);
    const expired=b.travel>=b.range-.001||b.age>8000||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h;
    if((hit&&!b.pierce)||Number.isFinite(wall)||expired){
      if(b.tether){b.tether.line=null;b.tether.severed=true;}velcaImpact(b,expired);
    }
    else if(v.shots.filter(s=>s.team===b.team).length<VELCA_MAX_SHOTS)v.shots.push(b);
  }
}

/* First sighting pauses combat and mission time; saved only on acknowledgement. */
let velcaIntroAt=0,velcaIntroFocus=null;
function velcaMaybeEncounter(){
  if(!S||mode!=='play'||META.velcarionSeen)return;
  const e=S.enemies.find(e=>isVelcarion(e)&&e.x>S.cam.x-e.r&&e.x<S.cam.x+W+e.r&&e.y>S.cam.y-e.r&&e.y<S.cam.y+H+e.r);
  if(e)showVelcaIntro();
}
function showVelcaIntro(){
  if(mode!=='play')return;mode='velca-intro';velcaIntroAt=performance.now();velcaIntroFocus=document.activeElement;cgGameplayStop();
  let panel=$('velcaIntro');if(!panel){panel=document.createElement('div');panel.id='velcaIntro';document.body.appendChild(panel);}
  panel.className='velca-intro on';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','velcaTitle');
  const ko=LANG==='ko';
  panel.innerHTML=`<section class="velca-brief"><div class="velca-eyebrow">FIRST CONTACT / VELCA CORE</div><h2 id="velcaTitle">${ko?'벨카리온':'VELCARION'} <small>${ko?'VELCARION':'ANCIENT MACHINE LIFE'}</small></h2><p>${ko?'고대부터 존재해 온 기계 생명체 종족. 육체의 한계를 버리고 의식을 기계 코어에 이식했습니다. 푸른 에너지, 벨카코어(Velca Core)에서 그 이름이 유래했습니다.':'An ancient machine species that abandoned flesh and transferred its consciousness into mechanical cores. Its name comes from the blue energy known as the Velca Core.'}</p><strong class="velca-lock">${ownsVelcaCore()?(ko?'벨카코어 공명 활성 — 벨카리온을 포획할 수 있습니다.':'VELCA CORE ACTIVE — Velcarion capture is unlocked.'):(ko?'현재 포획 불가 — 스토리 1–4장 모든 별 120개를 모아 벨카코어를 획득하면 포획할 수 있습니다.':'CAPTURE LOCKED — Earn all 120 stars in Story Chapters 1–4 to obtain the Velca Core and unlock capture.')}</strong><div class="velca-roster">${VELCA_KEYS.map(k=>`<article><img src="${ART[k]}" alt=""><div><b>${ko?VELCARION[k].name:VELCARION[k].en}</b><small>${ko?VELCARION[k].role:VELCARION[k].kind.toUpperCase()}</small></div></article>`).join('')}</div><p class="velca-tip">${ko?'충전 빛과 공격 예고를 확인하고 사선을 벗어나세요. 볼트 레버넌트는 파괴 시 주변에 폭발과 0.8초 정지 펄스를 남깁니다.':'Watch the charge light and attack telegraphs. A dying Volt Revenant explodes and briefly immobilizes nearby units.'}</p><button type="button" id="velcaAcknowledge">${ko?'확인 — 전투 계속':'Understood — resume combat'}</button><small class="velca-paused">${ko?'안내 중에는 전투와 임무 시간이 멈춥니다.':'Combat and mission time are paused.'}</small></section>`;
  $('velcaAcknowledge').onclick=closeVelcaIntro;$('velcaAcknowledge').focus();
  panel.onkeydown=ev=>{if(ev.key==='Tab'){ev.preventDefault();$('velcaAcknowledge').focus();}if(ev.key==='Escape'){ev.preventDefault();closeVelcaIntro();}};
}
function closeVelcaIntro(){
  if(mode!=='velca-intro')return;
  const elapsed=performance.now()-velcaIntroAt;S.stageStart+=elapsed;
  META.velcarionSeen=true;metaSave();$('velcaIntro').classList.remove('on');
  for(const key of Object.keys(keys))keys[key]=false;mouse.down=false;S.beam=false;
  for(const s of Object.values(sticks)){s.on=false;s.id=null;}
  mode='play';last=performance.now();cgGameplayStart();if(velcaIntroFocus&&velcaIntroFocus.focus)velcaIntroFocus.focus();
}

function velcaStopChannel(e){
  const d=VELCA_ATTACK.revenant,q=e.vc;
  if(q.phase==='channel')q.channelSpent=Math.min(d.channel,Math.max(0,d.channel-q.timer));
  if(S.velca)S.velca.channels=(S.velca.channels||[]).filter(c=>c.owner!==e);
  q.phase='move';q.timer=300;
}
function velcaUpdateChannels(dt){
  const v=S.velca,d=VELCA_ATTACK.revenant;
  for(const c of [...(v.channels||[])]){
    const e=c.owner,t=c.player?S:c.target,p=t&&velcaPos(t);
    if(!velcaOwnerAlive(e)||e.vc.phase!=='channel'){v.channels=v.channels.filter(b=>b!==c);continue;}
    if(!t||t.hp<=0||!velcaValidTarget(e,t)||Math.hypot(p.x-e.x,p.y-e.y)>d.breakRange){velcaStopChannel(e);continue;}
    const root=velcaMuzzle(e,e.vc.aim),length=Math.hypot(p.x-root.x,p.y-root.y),a=Math.atan2(p.y-root.y,p.x-root.x),old=c.line;
    if(Number.isFinite(velcaWallT(root.x,root.y,p.x,p.y))){velcaStopChannel(e);continue;}
    c.age+=dt;c.reach=Math.min(length,c.reach+5.2*dt/16);c.line=velcaTetherClip(root.x,root.y,root.x+Math.cos(a)*c.reach,root.y+Math.sin(a)*c.reach);
    for(const target of velcaTargets(e)){
      const now=velcaPos(target);let prior=c.positions.get(target)||now;c.positions.set(target,now);
      if(target.hp<=0||v.time-(c.lastHit.get(target)??-Infinity)<d.cooldown)continue;
      let travel=Math.hypot(now.x-prior.x,now.y-prior.y);if(travel>Math.max(96,dt*2.5)){prior=now;travel=0;}
      const lineMove=Math.max(Math.hypot(old.ax-c.line.ax,old.ay-c.line.ay),Math.hypot(old.bx-c.line.bx,old.by-c.line.by));
      const steps=Math.max(1,Math.min(64,Math.ceil((travel+lineMove)/Math.max(2,now.r*.4))));
      for(let i=0;i<=steps;i++){
        const f=i/steps,point={x:prior.x+(now.x-prior.x)*f,y:prior.y+(now.y-prior.y)*f};
        const line={ax:old.ax+(c.line.ax-old.ax)*f,ay:old.ay+(c.line.ay-old.ay)*f,bx:old.bx+(c.line.bx-old.bx)*f,by:old.by+(c.line.by-old.by)*f};
        if(velcaTetherDistance(point,line)>now.r+d.tetherWidth/2||Number.isFinite(velcaWallT(line.ax,line.ay,point.x,point.y)))continue;
        c.lastHit.set(target,v.time);velcaHit(target,d.dmg,0,e);velcaFX({team:velcaTeam(e),k:'electric',x:point.x,y:point.y,r:17,life:150});break;
      }
    }
  }
}
function velcaCreateStorm(b){
  const v=velcaState(),d=VELCA_ATTACK.revenant;v.storms=v.storms||[];
  if(v.storms.filter(f=>f.team===velcaTeam(b)).length>=8)v.storms.splice(v.storms.findIndex(f=>f.team===velcaTeam(b)),1);let x=b.x,y=b.y;
  for(let i=0;i<8&&blockedByProp(x,y);i++){x-=Math.cos(b.a)*2;y-=Math.sin(b.a)*2;}
  v.storms.push({team:velcaTeam(b),owner:b.owner,x,y,r:d.stormRadius,life:d.stormLife,age:0,id:++v.serial,lastHit:new WeakMap()});
  velcaFX({team:velcaTeam(b),k:'archonArc',x,y,a:b.a,len:0,r:44,life:240});
}
function velcaUpdateStorms(dt){
  const v=S.velca,d=VELCA_ATTACK.revenant;
  for(let i=(v.storms||[]).length-1;i>=0;i--){const f=v.storms[i];f.age+=dt;
    if(f.age>=f.life){v.storms.splice(i,1);continue;}
    for(const target of velcaTargets(f)){const p=velcaPos(target);
      if(target.hp<=0||Math.hypot(p.x-f.x,p.y-f.y)>f.r+p.r||Number.isFinite(velcaWallT(f.x,f.y,p.x,p.y)))continue;
      if(target===S)S.slowT=Math.max(S.slowT||0,160);else target.velcaSlow=Math.max(target.velcaSlow||0,160);
      if(v.time-(f.lastHit.get(target)??-Infinity)>=d.stormTick){f.lastHit.set(target,v.time);velcaHit(target,d.stormDmg,0,f);}
    }
  }
}
function drawVelcaChannels(cx,cy){
  for(const c of S.velca.channels||[]){if(c.owner.hp<=0||c.owner.vc.dead||c.owner.vc.phase!=='channel')continue;
    const l=c.line,length=Math.hypot(l.bx-l.ax,l.by-l.ay),age=c.age,tick=Math.floor(age/38);if(length<1)continue;
    withTeamShot(velcaTeam(c.owner),()=>{
    ctx.save();ctx.translate(l.ax-cx,l.ay-cy);ctx.rotate(Math.atan2(l.by-l.ay,l.bx-l.ax));
    for(const side of [-1,1]){const points=[];for(let i=0;i<=16;i++){const f=i/16;points.push([length*f,i===0||i===16?0:side*1.7+(visualNoise(tick*29+i*13+side)-.5)*5]);}drawVelcaArc(points,side===1?.75:.42,side===1?1.1:.65);}
    for(let j=0;j<3;j++){const x=(age*.26+j*length/3)%length;drawVelcaPlasma(x,0,3.5,age,.6,j*2);}
    drawVelcaPlasma(0,0,8,age,.9,2);drawVelcaPlasma(length,0,11.5,age,.96,1);drawVelcaCorona(length,0,14,age,.7,1);ctx.restore();
    });
  }
}
function drawVelcaStorms(cx,cy,front){for(const f of S.velca.storms||[]){const fade=Math.max(0,Math.min(1,f.age/150,(f.life-f.age)/300));withTeamShot(f.team,()=>{ctx.save();ctx.translate(f.x-cx,f.y-cy);if(front)cgStormBolts33(ctx,f,TEAM_DRAW);else cgFieldGround33(ctx,TEAM_DRAW,f.r,f.age,fade*.8);ctx.restore();});}}
/* Prepared sprite coordinates: original isometric art, mechanical parts only. */
// Upright greatsword artwork: coordinates refer to its occupied source rectangle.
const vArcPoint=([x,y])=>[(x-372)/549,(y-30)/1194];
const vArcPart=(mode,poly,pivot,extra={})=>({mode,poly:poly.map(vArcPoint),pivot:vArcPoint(pivot),...extra});
Object.assign(V_RIG,{
  v_arc:{kind:'walk',shot:'laser',stride:42,gait:{hip:.32,knee:.58,lift:.55},parts:[
    vArcPart('leg',[[687,800],[747,807],[767,872],[809,866],[858,938],[903,978],[928,1020],[914,1070],[894,1105],[850,1131],[813,1125],[818,1085],[836,1061],[800,1030],[749,1002],[697,963],[652,923],[650,867]],[714,837],{side:1,kneePoint:vArcPoint([782,916])}),
    vArcPart('leg',[[638,810],[695,842],[674,899],[644,940],[603,973],[568,1056],[535,1107],[552,1132],[559,1175],[516,1189],[444,1227],[369,1227],[378,1191],[413,1149],[452,1117],[465,1069],[465,980],[467,918],[499,874],[554,862]],[631,866],{side:-1,kneePoint:vArcPoint([575,939])}),
    vArcPart('greatswordArm',[[383,650],[403,630],[429,628],[447,641],[441,678],[455,687],[458,718],[422,718],[397,703],[383,680]],[406,690],{grip:vArcPoint([450,639])}),
    vArcPart('greatswordArm',[[705,695],[741,715],[746,747],[712,765],[645,761],[546,758],[518,740],[516,698],[535,686],[605,695],[664,688]],[717,732],{grip:vArcPoint([520,715])}),
    vArcPart('sword',[[403,534],[410,516],[408,397],[404,136],[435,54],[464,19],[495,61],[522,136],[526,399],[537,511],[542,545],[529,581],[512,599],[520,632],[508,657],[509,678],[525,691],[523,732],[504,750],[504,779],[519,801],[503,820],[464,825],[449,804],[457,779],[460,748],[448,732],[440,691],[428,683],[427,620],[440,599],[440,581],[420,580],[402,562]],[478,668],{tip:vArcPoint([465,34]),twoHand:true})]},
  v_crawler:{kind:'walk',shot:'laser',stride:34,gait:{hip:.12,knee:.20,lift:.45},parts:[
    {mode:'leg',side:1,poly:[[.69,.53],[.83,.46],[.99,.67],[.99,.87],[.93,.77],[.83,.64]],pivot:[.81,.54]},
    {mode:'leg',side:-1,poly:[[.29,.52],[.41,.57],[.31,.70],[.23,.85],[.19,.83],[.21,.67]],pivot:[.33,.57]},
    {mode:'leg',side:1,poly:[[.51,.58],[.67,.59],[.61,.80],[.51,.99],[.47,.98],[.46,.79]],pivot:[.55,.65]},
    {mode:'leg',side:-1,poly:[[.60,.60],[.70,.56],[.83,.78],[.84,.96],[.77,.92],[.72,.78]],pivot:[.65,.62]},
    {mode:'leg',side:-1,poly:[[.13,.65],[.28,.55],[.32,.60],[.19,.81],[.06,.97],[.02,.89]],pivot:[.23,.63]},
    vRect('velcaGun',.025,.245,.295,.415,.265,.29,{tip:[.058,.355],side:-1}),vRect('velcaGun',.54,.285,.805,.465,.765,.34,{tip:[.567,.409],side:1})]},
  v_oblivion:{kind:'track',shot:'shell',stride:32,recoil:1.7,parts:[
    {mode:'velcaGun',poly:[[.02,.38],[.41,.31],[.50,.39],[.48,.50],[.11,.62],[.01,.53]],pivot:[.43,.41],tip:[.126,.514]},
    vTread(.10,.82,.23,.89),vTread(.57,.89,.72,.95)]},
  v_phantom:{kind:'jet',shot:'laser',parts:[
    {mode:'vane',poly:[[.02,.38],[.23,.17],[.63,0],[.61,.06],[.28,.29],[.08,.48]],pivot:[.29,.25],side:-1},
    {mode:'vane',poly:[[.61,.75],[.84,.49],[.90,.21],[.98,.19],[.99,.57],[.72,.92],[.43,.99]],pivot:[.81,.59],side:1},
    {mode:'velcaGun',poly:[[.103,.691],[.251,.452],[.293,.488],[.169,.733]],pivot:[.265,.485],tip:[.132,.69],side:-1},
    {mode:'velcaGun',poly:[[.33,.84],[.52,.61],[.56,.66],[.411,.884]],pivot:[.525,.65],tip:[.374,.845],side:1}]},
  v_revenant:{kind:'hover',shot:'laser',parts:[
    {mode:'velcaArm',poly:[[.22,.31],[.06,.36],[0,.48],[.03,.62],[.15,.75],[.19,.70],[.10,.54],[.17,.49],[.26,.44]],pivot:[.23,.445],side:-1},
    {mode:'velcaArm',poly:[[.78,.32],[.92,.36],[1,.49],[.99,.60],[.85,.73],[.81,.68],[.88,.54],[.80,.49],[.73,.44]],pivot:[.78,.45],side:1},
    vRect('coil',.40,.42,.53,.57,.465,.495)]},
  v_eclipse:{kind:'jet',shot:'laser',parts:[
    {mode:'velcaGun',poly:[[0,.932],[.126,.81],[.153,.844],[.032,.968]],pivot:[.136,.84],tip:[.016,.947],side:-1},
    {mode:'velcaGun',poly:[[.031,.966],[.163,.85],[.184,.884],[.068,1]],pivot:[.169,.873],tip:[.051,.977],side:1},
    {mode:'vane',poly:[[.81,.18],[.89,.16],[.90,.35],[.86,.44],[.83,.37]],pivot:[.85,.31],side:1}]},
});
const VELCA_ART_ANGLE={v_arc:2.40,v_crawler:2.78,v_oblivion:2.86,v_phantom:2.36,v_revenant:Math.PI/2,v_eclipse:2.67};
for(const key of VELCA_KEYS)V_RIG[key].artAngle=VELCA_ART_ANGLE[key];
const VELCA_MUZZLES={v_arc:[[.04,.84]],v_crawler:[[.058,.355],[.567,.409]],v_oblivion:[[.126,.514]],v_phantom:[[.132,.69],[.374,.845]],v_revenant:[[.465,.495]],v_eclipse:[[.016,.947],[.051,.977]]};
function velcaArtTransform(e,a){
  // Isometric sprites have a painted top and underside: never rotate that plane.
  // Chassis uses horizontal facing; each articulated weapon aims independently.
  if(e.type==='v_revenant')return {angle:0,mirror:1};
  return {angle:0,mirror:Math.cos(a)>0?-1:1};
}
function velcaMuzzle(e,a,side=0){
  const gun=velcaWeapon(e,side);if(gun){const g=velcaGunGeometry(e,gun,a);return {x:e.x+g.x,y:e.y+g.y};}
  const points=VELCA_MUZZLES[e.type],img=IMG[e.type];if(!points||!img)return null;
  const p=points[side>0?points.length-1:0],w=e.w,h=w*img.height/img.width,transform=velcaArtTransform(e,a),rot=transform.angle,x=(p[0]-.5)*w*transform.mirror,y=(p[1]-.5)*h;
  return {x:e.x+x*Math.cos(rot)-y*Math.sin(rot),y:e.y+x*Math.sin(rot)+y*Math.cos(rot)};
}
function velcaWeapon(e,side=0){const parts=V_RIG[e.type].parts.filter(p=>p.mode==='velcaGun'||p.mode==='sword');return parts[side>0?parts.length-1:0];}
function velcaGunGeometry(e,p,a,visual=true){
  const img=IMG[e.type],w=e.w,h=w*img.height/img.width,mirror=visual?facingIsoMirror(e):velcaArtTransform(e,a).mirror;
  const px=(p.pivot[0]-.5)*w,py=(p.pivot[1]-.5)*h,dx=(p.tip[0]-p.pivot[0])*w,dy=(p.tip[1]-p.pivot[1])*h;
  const length=Math.hypot(dx,dy),source=Math.atan2(dy,dx),localAim=Math.atan2(Math.sin(a),Math.cos(a)*mirror);
  return {px,py,length,rotation:localAim-source,x:px*mirror+Math.cos(a)*length,y:py+Math.sin(a)*length,mirror};
}
function velcaPrepareArt(){
  // Crop transparent margins and bound component-cache memory at load time.
  // Originals stay embedded and available for the roster cards / delivered PNGs.
  for(const key of VELCA_KEYS){
    const source=IMG[key];if(!source)continue;
    const raw=visualCanvas(source.width,source.height),rc=raw.getContext('2d');rc.drawImage(source,0,0);
    const data=rc.getImageData(0,0,raw.width,raw.height).data;let x0=raw.width,y0=raw.height,x1=0,y1=0;
    for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++)if(data[(y*raw.width+x)*4+3]>48){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<=x0)continue;const sw=x1-x0+1,sh=y1-y0+1,c=visualCanvas(256,Math.round(256*sh/sw)),q=c.getContext('2d');
    q.imageSmoothingEnabled=true;q.drawImage(source,x0,y0,sw,sh,0,0,c.width,c.height);IMG[key]=c;TINT.frost[key]=frostify(c);
  }
  velcaWarmPlasma();
}
// Reference-inspired plasma: a turbulent white/cyan core, cobalt corona and
// branching discharges. Bake the cloud frames once; do not allocate per shot.
const VELCA_PLASMA={frames:[],size:128,radius:35,count:12};
function velcaWarmPlasma(){
  if(VELCA_PLASMA.frames.length)return;
  const n=VELCA_PLASMA.size,r=VELCA_PLASMA.radius;
  for(let frame=0;frame<VELCA_PLASMA.count;frame++){
    const c=visualCanvas(n,n),q=c.getContext('2d'),data=q.createImageData(n,n),p=data.data,t=frame*Math.PI*2/VELCA_PLASMA.count;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const nx=(x-n/2)/r,ny=(y-n/2)/r,a=Math.atan2(ny,nx),d=Math.hypot(nx,ny);
      const edge=1+.095*Math.sin(a*5+t)+.055*Math.sin(a*9-t*2),rad=d/edge;
      const billow=(Math.sin(nx*13+Math.sin(ny*7+t)*1.5-t)+Math.sin(ny*16-nx*5+t*2)+Math.sin((nx+ny)*22-t))/3;
      const heat=Math.max(0,Math.min(1,1-rad*.87+billow*.17)),alpha=.88*Math.max(0,Math.min(1,(1.13-rad)/.25))+.12*Math.exp(-Math.max(0,rad-.80)*4);
      const grain=.94+.06*visualNoise(Math.floor(x/2)*17+Math.floor(y/2)*191),i=(y*n+x)*4;
      let color;
      if(heat>.35){const k=Math.min(1,(heat-.35)/.30);color=[67+179*k,220+35*k,255];}
      else if(heat>.25){const k=(heat-.25)/.10;color=[12+55*k,137+83*k,255];}
      else{const k=heat/.25;color=[29-17*k,62+75*k,231+24*k];}
      p[i]=color[0]*grain;p[i+1]=color[1]*grain;p[i+2]=color[2];p[i+3]=Math.min(1,alpha)*255;
    }
    q.putImageData(data,0,0);VELCA_PLASMA.frames.push(c);
  }
}
function drawVelcaPlasma(x,y,r,age,alpha=1,seed=0){
  velcaWarmPlasma();const frame=((Math.floor(age/45)+seed)%VELCA_PLASMA.count+VELCA_PLASMA.count)%VELCA_PLASMA.count,size=r*VELCA_PLASMA.size/VELCA_PLASMA.radius;
  ctx.save();ctx.globalAlpha*=Math.max(0,alpha);ctx.drawImage(teamPlasmaFrames(TEAM_DRAW)[frame],x-size/2,y-size/2,size,size);ctx.restore();
}
function drawVelcaArc(points,alpha=1,width=1){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='miter';const inherited=ctx.globalAlpha;
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  for(const [color,w,opacity]of (TEAM_DRAW?[[TEAM_DRAW.dark,8,.12],[TEAM_DRAW.color,4,.6],[TEAM_DRAW.color,2,1],[TEAM_DRAW.core,.75,.95]]:[['#5345F3',8,.12],['#167CFF',4,.6],['#64E6FF',2,1],['#EDFFFF',.75,.95]])){
    ctx.strokeStyle=color;ctx.lineWidth=w*width;ctx.globalAlpha=inherited*alpha*opacity;ctx.stroke();
  }ctx.restore();
}
function drawVelcaCorona(x,y,r,age,alpha=1,seed=0){
  const tick=Math.floor(age/45);
  for(let i=0;i<5;i++){
    const a=i*2.399+seed*.61+Math.sin(tick*.5+i)*.13,points=[];
    for(let j=0;j<5;j++){const angle=a+j*.16,rr=r*(.88+(visualNoise(seed*19+i*31+j*7+tick)-.5)*.23);points.push([x+Math.cos(angle)*rr,y+Math.sin(angle)*rr]);}
    drawVelcaArc(points,alpha*(i%2?.55:.85),.75);
    if(i%2===0){const [px,py]=points[2],rr=r*(1.2+visualNoise(i+tick)*.23);drawVelcaArc([[px,py],[px+Math.cos(a+.5)*r*.16,py+Math.sin(a+.5)*r*.16],[x+Math.cos(a+.4)*rr,y+Math.sin(a+.4)*rr]],alpha*.65,.6);}
  }
}
function drawVelcaRevenantCast(u,w,h,front){
  const continuous=u.vc.phase==='channel',age=continuous?VELCA_ATTACK.revenant.channel-u.vc.timer:Math.max(0,VELCA_ATTACK.revenant.hold-u.vc.timer),t=continuous?.45:Math.min(1,age/VELCA_ATTACK.revenant.hold),envelope=continuous?.66+.06*Math.sin(age*.025):Math.min(1,(age+24)/65)*Math.pow(1-t,.7);
  const x=-.035*w,y=-.005*h;
  if(!front){
    ctx.save();ctx.globalAlpha=envelope*.55;drawVelcaPlasma(x,y,w*.36,age,.45);drawVelcaCorona(x,y,w*.46,age,.58,3);ctx.restore();return;
  }
  // Arms discharge into the core. The tether grows only as far as the flying orb;
  // the chassis is never displaced by the cast animation.
  for(const side of [-1,1]){
    const sx=side*w*.24,sy=h*.015,jitter=Math.sin(age*.055+side)*h*.04;
    drawVelcaArc([[sx,sy],[sx*.66,sy-h*.07],[sx*.47,h*.025+jitter],[x,y]],envelope,.95);
  }
  drawVelcaPlasma(x,y,11+7*Math.sin(Math.PI*t),age,envelope*.95);
  drawVelcaCorona(x,y,16+5*Math.sin(Math.PI*t),age,envelope*.8,2);
}
function drawVelcaPlasmaBolt(b){
  const tail=Math.min(30,b.travel),tick=Math.floor(b.age/45),radius=10.5+Math.sin(b.age*.014)*.8;
  if(tail>3&&!velcaTetherAlive(b)){
    // Once the source is destroyed, the released orb retains a short ion wake.
    for(const side of [-1,1]){
      const points=[];for(let j=0;j<=6;j++){const f=j/6,x=-tail+tail*f,y=side*4.5*(1-f)+(j===6?0:(visualNoise(tick*13+j*7+side)-.5)*8);points.push([x,y]);}
      drawVelcaArc(points,.7,.9);
    }
    drawVelcaPlasma(-tail*.5,0,4.5,b.age,.28,4);
  }
  drawVelcaPlasma(0,0,radius,b.age,1);drawVelcaCorona(0,0,radius*1.12,b.age,.75,1);
}
function drawVelcaTethers(cx,cy){
  for(const b of S.velca.shots){
    if(!velcaTetherAlive(b)||!b.tether.line)continue;
    const l=b.tether.line,ax=l.ax-cx,ay=l.ay-cy,bx=l.bx-cx,by=l.by-cy,length=Math.hypot(bx-ax,by-ay);
    // Cull by the whole connection, so its visible middle survives offscreen ends.
    if(length<.5||Math.max(ax,bx)<-18||Math.min(ax,bx)>W+18||Math.max(ay,by)<-18||Math.min(ay,by)>H+18)continue;
    withTeamShot(b.team,()=>{
    ctx.save();ctx.translate(ax,ay);ctx.rotate(Math.atan2(by-ay,bx-ax));
    ctx.fillStyle=TEAM_DRAW.color;ctx.globalAlpha=.10;ctx.fillRect(0,-l.width/2,length,l.width);ctx.globalAlpha=1;
    const count=Math.max(2,Math.min(20,Math.ceil(length/12))),tick=Math.floor(b.age/35),points=[];
    for(let i=0;i<=count;i++){const f=i/count,jitter=i===0||i===count?0:(visualNoise(tick*17+i*11)-.5)*l.width*.42;points.push([length*f,jitter]);}
    drawVelcaArc(points,.92,1.1);
    for(let i=1;i<count;i+=3){const [x,y]=points[i],sign=(i+tick)%2?1:-1;drawVelcaArc([[x,y],[Math.min(length,x+3),sign*l.width*.45],[Math.min(length,x+7),sign*l.width*.22]],.50,.6);}
    if(length>14){const flow=(b.age*.28)%(length-8);ctx.fillStyle=TEAM_DRAW.core;ctx.globalAlpha=.65;ctx.fillRect(flow,-.55,6,1.1);ctx.globalAlpha=1;}
    drawVelcaPlasma(0,0,5.2,b.age,.72,2);ctx.restore();
    });
  }
}
function visualScorch(x,y,r){
  if(VISUAL.decals.length>=(MOBILE_DEVICE?32:56))VISUAL.decals.shift();
  const id=++VISUAL.serial;VISUAL.decals.push({x,y,r:Math.max(12,Math.min(78,r)),age:0,life:24000,id:id%8,angle:visualNoise(id)*6.283});
}
function drawVelcaUnitBase22(u,sx,sy){
  const img=u.slow>0?(TINT.frost[u.img]||IMG[u.img]):IMG[u.img];if(!img)return;
  const w=u.w,h=w*img.height/img.width,q=u.vc,v=visualState(u);
  ctx.save();ctx.translate(sx,sy);ctx.fillStyle='#07102066';ctx.beginPath();ctx.ellipse(0,h*.30,w*.30,w*.11,0,0,6.283);ctx.fill();
  if(u.type==='v_revenant'&&q.phase==='channel')drawVelcaRevenantCast(u,w,h,false);
  if(q.recoil>0){const style=V_RIG[u.type].shot;v.shots[style]={time:VISUAL.time-110+Math.min(110,q.recoil),style,ang:q.aim};}
  // Idle chassis remains fixed; planted legs settle immediately during charge.
  const speed=v.speed,pivot=v.pivotSpeed;if(q.phase!=='move'){v.speed=0;v.pivotSpeed=0;}
  drawFacingIso(u,img,w,h);v.speed=speed;v.pivotSpeed=pivot;
  ctx.save();ctx.scale(u.type==='v_revenant'?1:facingIsoMirror(u),1);
  const glow=q.phase.endsWith('Charge')?1-Math.max(0,q.timer)/q.charge:(q.phase==='channel'||q.phase==='beamHold')?.9:.12;
  const core=u.type==='v_arc'?[(vArcPoint([553,632])[0]-.5)*w,(vArcPoint([553,632])[1]-.5)*h]:u.type==='v_revenant'?[-.035*w,0]:u.type==='v_eclipse'?[.05*w,-.22*h]:[0,-h*.12];
  ctx.globalAlpha=.15+glow*.50;ctx.fillStyle='#4CDFFF';ctx.beginPath();ctx.arc(core[0],core[1],u.type==='v_arc'?1+glow*.9:2+glow*3,0,6.283);ctx.fill();
  if(u.type==='v_revenant'&&q.phase==='channel'){
    ctx.save();ctx.globalAlpha=1;drawVelcaRevenantCast(u,w,h,true);ctx.restore();
  }
  if(u.type==='v_revenant'&&speed>.03){
    for(let i=0;i<3;i++)drawVisualLightning(core[0],core[1],q.aim+i*2.1,w*.19,.22+speed*.35,Math.floor(VISUAL.time/70)+i*13);
  }
  if(u.flying){
    const jets=u.type==='v_phantom'?[[.78,.19],[.92,.35]]:[[.80,.25],[.94,.47]];
    for(const [jx,jy]of jets){const x=(jx-.5)*w,y=(jy-.5)*h,len=2+speed*7,pulse=.90+.10*Math.sin(VISUAL.time*.045+jx*29);
      ctx.save();ctx.translate(x,y);ctx.rotate(-.64);ctx.globalAlpha=.35+speed*.4;ctx.fillStyle='#2C8FE9';ctx.beginPath();ctx.moveTo(0,-1.8);ctx.lineTo(len*pulse,0);ctx.lineTo(0,1.8);ctx.closePath();ctx.fill();ctx.fillStyle='#C5F8FF';ctx.fillRect(0,-.6,len*.52,1.2);ctx.restore();}
  }
  ctx.restore();ctx.globalAlpha=1;
  if(u.hp<u.hpMax){ctx.fillStyle='#04101FE0';ctx.fillRect(-19,h*.5+4,38,3);ctx.fillStyle='#5DBFFF';ctx.fillRect(-19,h*.5+4,38*Math.max(0,u.hp/u.hpMax),3);}
  if(u.slow>0){ctx.strokeStyle='#CAEDFF';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,u.r+3,0,6.283);ctx.stroke();}
  if(u.poison>0){ctx.fillStyle='#ABED71';ctx.fillRect(-3,-h*.43,2,2);ctx.fillRect(4,-h*.4,2,2);}
  if(u.side==='ally'){ctx.fillStyle='#8EF8CE';ctx.beginPath();ctx.moveTo(-5,h*.5+10);ctx.lineTo(0,h*.5+6);ctx.lineTo(5,h*.5+10);ctx.lineTo(0,h*.5+14);ctx.fill();}
  if(u.side==='enemy'&&canCaptureUnit(u)&&u.cap>0){ctx.fillStyle='#092F40';ctx.fillRect(-19,-h*.5-9,38,4);ctx.fillStyle='#80DFFF';ctx.fillRect(-19,-h*.5-9,38*Math.min(1,u.cap/capFill()),4);}
  // Small broken capture mark appears only when the player actually aims the beam.
  if(u.side==='enemy'&&!canCaptureUnit(u)&&S.beam&&Math.hypot(u.x-S.px,u.y-S.py)<beamLen()+u.r&&angGap(Math.atan2(u.y-S.py,u.x-S.px),S.beamAng)<beamArc()+.2){
    ctx.strokeStyle='#80D3FF';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-h*.48,5,0,6.283);ctx.moveTo(-4,-h*.48+4);ctx.lineTo(4,-h*.48-4);ctx.stroke();
  }
  ctx.restore();
}
function drawVelcaTelegraphs(cx,cy){
  if(S.velca)drawVelcaStorms(cx,cy,false);
  for(const e of [...S.enemies,...S.allies]){if(!isVelcarion(e)||e.hp<=0)continue;const q=e.vc,phase=q.phase;
    if(!phase.endsWith('Charge'))continue;
    const progress=1-Math.max(0,q.timer)/q.charge,x=e.x-cx,y=e.y-cy;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#68CFFF';ctx.lineWidth=1.2;ctx.globalAlpha=.35+progress*.4;
    ctx.beginPath();ctx.arc(0,0,e.r+7,-Math.PI/2,-Math.PI/2+6.283*progress);ctx.stroke();
    if(phase==='stormCharge'){
      const p=q.stormPoint,r=VELCA_ATTACK.revenant.stormRadius;ctx.translate(p.x-e.x,p.y-e.y);ctx.globalAlpha=.07+progress*.10;ctx.fillStyle='#3C87E8';ctx.beginPath();ctx.arc(0,0,r,0,6.283);ctx.fill();
      ctx.globalAlpha=.38+progress*.40;ctx.strokeStyle='#95DFFF';ctx.setLineDash([6,6]);ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(0,0,r*.55+progress*r*.40,0,6.283);ctx.stroke();
      drawVelcaPlasma(0,0,5+progress*8,e.t,.35+progress*.30);
    }else if(phase==='beamCharge'||phase==='siegeCharge'||phase==='pulseCharge'){
      const len=phase==='beamCharge'?VELCA_ATTACK.beam.len:phase==='siegeCharge'?680:205,width=phase==='beamCharge'?VELCA_ATTACK.beam.width:phase==='siegeCharge'?26:24;
      // Preview the same physical muzzle and blocked length as the sustained beam.
      if(phase==='beamCharge'){
        const p=velcaMuzzle(e,q.aim),dx=Math.cos(q.aim),dy=Math.sin(q.aim),wall=velcaWallT(p.x,p.y,p.x+dx*len,p.y+dy*len),reach=Number.isFinite(wall)?len*wall:len;
        ctx.translate(p.x-e.x,p.y-e.y);ctx.rotate(q.aim);ctx.globalAlpha=.06+progress*.12;ctx.fillStyle='#479DED';ctx.fillRect(0,-width/2,reach,width);
        ctx.globalAlpha=.3+progress*.4;ctx.setLineDash([8,8]);ctx.lineDashOffset=-e.t*.02;ctx.strokeRect(0,-width/2,reach,width);ctx.setLineDash([]);
      }else{
      ctx.rotate(q.aim);ctx.globalAlpha=.05+progress*.12;ctx.fillStyle='#479DED';ctx.fillRect(e.r,-width/2,len,width);
      ctx.globalAlpha=.3+progress*.4;ctx.setLineDash([8,8]);ctx.lineDashOffset=-e.t*.02;ctx.beginPath();ctx.moveTo(e.r,-width/2);ctx.lineTo(len,-width/2);ctx.moveTo(e.r,width/2);ctx.lineTo(len,width/2);ctx.stroke();ctx.setLineDash([]);
      for(let x=e.r+25;x<Math.min(len,500);x+=50){ctx.beginPath();ctx.moveTo(x,-3);ctx.lineTo(x+6,0);ctx.lineTo(x,3);ctx.stroke();}
      }
    }else if(phase==='barrageCharge'){
      const rad=100;ctx.setLineDash([4,7]);ctx.beginPath();ctx.arc(0,0,rad,0,6.283);ctx.stroke();ctx.setLineDash([]);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*(e.r+12),Math.sin(a)*(e.r+12));ctx.lineTo(Math.cos(a)*(e.r+18+progress*15),Math.sin(a)*(e.r+18+progress*15));ctx.stroke();}
    }else if(phase==='warpCharge'){
      ctx.setLineDash([2,5]);ctx.beginPath();ctx.arc(0,0,e.r+15*(1-progress),0,6.283);ctx.stroke();
    }
    ctx.restore();
  }
}
function drawVelcaProjectiles(cx,cy){
  if(!S.velca)return;
  drawVelcaChannels(cx,cy);drawVelcaTethers(cx,cy);
  for(const b of S.velca.shots)drawTeamVelcaShot(b,cx,cy);
}
function drawVelcaBeams(cx,cy){
  for(const b of S.velca.beams){const tick=Math.floor(b.age/40),power=.92+.08*Math.sin(b.age*.052),fade=Math.min(1,(b.life-b.age)/180);
    withTeamShot(b.team,()=>{
    ctx.save();ctx.translate(b.x-cx,b.y-cy);ctx.rotate(b.a);ctx.globalAlpha=fade;
    const rim=ctx.createLinearGradient(0,-b.width*.68,0,b.width*.68);
    for(const [at,color]of [[0,TEAM_DRAW.color+'00'],[.13,TEAM_DRAW.color+'35'],[.25,TEAM_DRAW.color+'80'],[.37,TEAM_DRAW.color+'CC'],[.46,TEAM_DRAW.core+'F5'],[.5,TEAM_DRAW.core],[.54,TEAM_DRAW.core+'F5'],[.63,TEAM_DRAW.color+'CC'],[.75,TEAM_DRAW.color+'80'],[.87,TEAM_DRAW.color+'35'],[1,TEAM_DRAW.color+'00']])rim.addColorStop(at,color);
    ctx.fillStyle=rim;ctx.fillRect(0,-b.width*.68,b.len,b.width*1.36);
    // Keep the broad energy envelope translucent; moving, uneven filaments carry
    // the hot core without covering the battlefield with an opaque rectangle.
    ctx.fillStyle=TEAM_DRAW.core;ctx.globalAlpha=fade*.85;ctx.beginPath();
    for(let j=0;j<=36;j++){const x=b.len*j/36,y=(Math.sin(j*.9-b.age*.03)*1.7+b.width*.058)*power;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    for(let j=36;j>=0;j--)ctx.lineTo(b.len*j/36,(-Math.sin(j*.8-b.age*.025)*1.5-b.width*.058)*power);ctx.closePath();ctx.fill();ctx.globalAlpha=fade;
    ctx.save();ctx.beginPath();ctx.rect(0,-b.width/2,b.len,b.width);ctx.clip();
    for(let i=0;i<3;i++)drawVisualLightning(0,(i-1)*b.width*.29,0,b.len,fade*.65,tick+i*31);
    for(let i=0;i<11;i++){const x=(b.age*1.8+i*b.len/11)%Math.max(1,b.len),y=(visualNoise(i+tick*9)-.5)*b.width*.8;ctx.globalAlpha=fade*.5;ctx.fillStyle=TEAM_DRAW.core;ctx.fillRect(x,y,18+visualNoise(i)*24,1.2);}
    ctx.restore();ctx.globalAlpha=fade;
    const root=ctx.createRadialGradient(0,0,3,0,0,b.width*.6);root.addColorStop(0,TEAM_DRAW.core);root.addColorStop(.18,TEAM_DRAW.core+'F0');root.addColorStop(.5,TEAM_DRAW.color+'55');root.addColorStop(1,TEAM_DRAW.color+'00');ctx.fillStyle=root;ctx.beginPath();ctx.arc(0,0,b.width*.6,0,6.283);ctx.fill();
    ctx.strokeStyle=TEAM_DRAW.core;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(17,0);ctx.moveTo(0,-13);ctx.lineTo(0,13);ctx.stroke();ctx.restore();
    });
  }
}
function drawVelcaArchon(f){
  const t=Math.min(1,f.age/f.life),expand=1-Math.pow(1-Math.min(1,t*2.8),3),alpha=Math.min(1,(t+.08)*9)*Math.pow(1-t,.9),seed=f.id||0;
  const radius=f.r*(.27+.31*expand);ctx.rotate(f.a);ctx.translate(f.len||0,0);ctx.globalAlpha=alpha;
  // Irregular blooming plasma replaces the geometric star/ring at the hit point.
  for(let i=0;i<4;i++){const a=i*2.399+seed,spread=radius*(.20+.28*expand);drawVelcaPlasma(Math.cos(a)*spread,Math.sin(a)*spread,radius*(.55+visualNoise(i+seed)*.14),f.age,.6,seed+i*3);}
  drawVelcaPlasma(0,0,radius*.91,f.age,.93,seed);drawVelcaCorona(0,0,radius*1.12,f.age,.85,seed);
  const tick=Math.floor(f.age/45);
  for(let i=0;i<6;i++){
    const a=i*2.399+seed*.31,r=f.r*(.57+.36*t),dx=Math.cos(a),dy=Math.sin(a),bend=(visualNoise(i+tick)-.5)*12;
    const points=[[dx*radius*.6,dy*radius*.6],[dx*r*.68-dy*bend,dy*r*.68+dx*bend],[dx*r*.79+dy*4,dy*r*.79-dx*4],[dx*r,dy*r]];
    drawVelcaArc(points,(1-t)*.8,.85);
    if(t<.6){ctx.fillStyle=i%2?(TEAM_DRAW||TEAM_ENERGY.enemy).color:(TEAM_DRAW||TEAM_ENERGY.enemy).core;ctx.globalAlpha=alpha*(1-t);ctx.fillRect(dx*r-1,dy*r-1,1.8,1.8);ctx.globalAlpha=alpha;}
  }
}
function drawVelcaFX(cx,cy){
  if(!S.velca)return;
  drawVelcaStorms(cx,cy,true);
  drawVelcaBeams(cx,cy);
  for(const f of S.velca.fx){const t=f.age/f.life,alpha=1-t,X=f.x-cx,Y=f.y-cy;
    withTeamShot(f.team||'enemy',()=>{
    ctx.save();ctx.translate(X,Y);ctx.globalAlpha=alpha;
    if(f.k==='archonArc'){
      drawVelcaArchon(f);

    }else if(f.k==='barragePulse'){
      cgShockRings32(ctx,TEAM_DRAW,f.r*(.4+t),t,f.id);
      ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=2*alpha;ctx.beginPath();ctx.arc(0,0,f.r*(.4+t),0,6.283);ctx.stroke();
      ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=5*alpha;ctx.globalAlpha=alpha*.3;ctx.stroke();
    }else if(f.k==='beam'){
      ctx.rotate(f.a);ctx.fillStyle=TEAM_DRAW.color+'38';ctx.fillRect(0,-f.width*.65,f.len,f.width*1.3);
      ctx.fillStyle=TEAM_DRAW.color;ctx.fillRect(0,-f.width*.42*alpha,f.len,f.width*.84*alpha);ctx.fillStyle=TEAM_DRAW.color;ctx.fillRect(0,-f.width*.19*alpha,f.len,f.width*.38*alpha);
      ctx.fillStyle=TEAM_DRAW.core;ctx.fillRect(0,-f.width*.06,f.len,f.width*.12);drawVisualLightning(0,0,0,Math.min(f.len,550),alpha,Math.floor(f.age/40));
    }else if(f.k==='slash'){
      ctx.rotate(f.a);ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=7*alpha;ctx.beginPath();ctx.arc(0,0,f.r*(.65+t*.35),-1.0+t*.3,1.05+t*.3);ctx.stroke();ctx.strokeStyle=TEAM_DRAW.core;ctx.lineWidth=2*alpha;ctx.stroke();
    }else if(f.k==='electric'){
      ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=1;ctx.globalAlpha=alpha*.18;ctx.beginPath();ctx.arc(0,0,f.r*(.45+.55*t),0,6.283);ctx.stroke();
      for(let i=0;i<9;i++)drawVisualLightning(0,0,i*6.283/9+visualNoise(i+f.id)*.22,f.r*(.5+visualNoise(i*7+f.id)*.5),alpha,Math.floor(f.age/45)+i*9);
    }else if(f.k==='teleport'){
      ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=1.8;for(let j=0;j<2;j++){ctx.beginPath();ctx.ellipse(0,0,f.r*(.6+t*.7),f.r*(.3+t*.4),j*.7,0,6.283);ctx.stroke();}
      for(let i=0;i<12;i++){const a=i*2.399,r=f.r*(.5+t);ctx.fillStyle=TEAM_DRAW.core;ctx.fillRect(Math.cos(a)*r,Math.sin(a)*r,1.5,4*(1-t));}
    }else if(f.k==='impact'){
      cgEnergyImpact32(ctx,TEAM_DRAW,f.r,t,f.id);
    }else if(f.k==='blast'){
      cgEnergyImpact32(ctx,TEAM_DRAW,f.r,t,f.id);
      const r=Math.max(1,f.r*Math.min(1,t*2.4));ctx.globalAlpha=alpha*.25;ctx.fillStyle=TEAM_DRAW.color;ctx.beginPath();ctx.arc(0,0,r,0,6.283);ctx.fill();
      ctx.globalAlpha=alpha*.9;ctx.strokeStyle=TEAM_DRAW.color;ctx.lineWidth=2.5*alpha;ctx.beginPath();ctx.arc(0,0,r,0,6.283);ctx.stroke();
      if(t<.3){ctx.fillStyle=TEAM_DRAW.core;ctx.globalAlpha=(1-t/.3)*.75;ctx.beginPath();ctx.arc(0,0,Math.max(1,f.r*.3*(1-t)),0,6.283);ctx.fill();}
      for(let i=0;i<15;i++){const a=i*2.399+f.id,r=f.r*(.25+t*.85);ctx.globalAlpha=alpha;ctx.strokeStyle=i%3?TEAM_DRAW.color:TEAM_DRAW.core;ctx.lineWidth=i%3?1:1.7;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r+4+alpha*9),Math.sin(a)*(r+4+alpha*9));ctx.stroke();}
    }else{
      ctx.fillStyle=TEAM_DRAW.color;ctx.beginPath();ctx.arc(0,0,Math.max(1,f.r*alpha),0,6.283);ctx.fill();ctx.fillStyle=TEAM_DRAW.core;ctx.fillRect(-1,-1,2,2);
    }
    ctx.restore();
    });
  }
}

/* Timers use milliseconds. Hero projectiles use swept collision and their own team. */
function heroState(){return S.hero||(S.hero={time:0,serial:0,shots:[],fields:[],fx:[],trophies:[],boss:null,bossDefeated:false,clearing:false,clearDelay:0});}
function heroAlive(u){return !!(u&&u.hp>0&&!u.hg?.dead&&(u.side==='ally'?S.allies:S.enemies).includes(u));}
function heroImmune(u){return !!(u.gone||['dashCharge','dash','away','hole'].includes(u.hg?.mode));}
function heroSide(u){return u.side==='ally'?'ally':'enemy';}
function heroTargets(u){return heroSide(u)==='ally'?[...S.enemies.filter(e=>e.side==='enemy'&&!e.gone&&e.hp>0),...S.turrets.filter(t=>t.alive)]:[S,...S.allies.filter(a=>a.hp>0&&!a.gone)];}
function heroPos(u){return u===S?{x:S.px,y:S.py,r:14}:u;}
function heroTarget(u,range=1000){let best=null,dist=range;for(const t of heroTargets(u)){const p=heroPos(t),d=Math.hypot(p.x-u.x,p.y-u.y);if(d<dist){dist=d;best=t;}}return best;}
function makeHero(key,x,y,side,boss=false){
 const d=HEROES[key],mult=side==='ally'?powerMul('legend',key):1,infinity=boss&&!S.story,scale=infinity?1.20:1;
 const hp=boss?Math.round(HERO_RULES.bossHp*scale):Math.round((100+S.stage*2)*mult);
 const u={type:key,legendKey:key,img:key,label:d.name,side,x,y,w:boss?HERO_RULES.bossSize:d.w,r:boss?HERO_RULES.bossRadius:d.r,
  hp,hpMax:hp,armor:boss?HERO_RULES.bossArmor:d.armor,spd:d.spd,flying:true,isLegend:true,heroBoss:boss,heroScale:scale,
  ai:'hero',fire:0,noFire:true,face:Math.PI/2,cap:0,resist:0,slow:0,poison:0,t:0,bob:0,score:boss?24000:5000,dmgMul:mult,wep:[],
  hg:{mode:'normal',timer:0,dead:false,primary:650,sweepCd:d.sweep?.first||Infinity,pulseCd:d.pulse?.first||Infinity,dashCd:d.dash?.first||Infinity,
   stormCd:d.storm?.first||Infinity,stormOn:false,stormAge:0,missileCd:d.missile?.cd||Infinity,missilePair:4,missilePairCd:0,launcherKick:[0,0],basicTime:0,age:0,aim:Math.PI/2,sweepAge:0,sweepOn:false,sweepTick:0,pulseAge:0,pulseOn:false,gunKick:[0,0,0,0],serial:++heroState().serial}};
 // Legacy weapons also subtract hp directly. Centralize hero armor and invulnerability here.
 let health=hp;Object.defineProperty(u,'hp',{enumerable:true,get:()=>health,set(value){if(value<health&&!u.hg.dead&&!u.pgRestoringHealth){if(heroImmune(u))return;health-=(health-value)*(1-u.armor);}else health=value;}});return u;
}
function heroFX(f){const h=heroState();if(h.fx.length>=HERO_RULES.fxCap)h.fx.shift();h.fx.push({age:0,id:++h.serial,...f});}
function heroDisarm(u){const h=heroState();h.shots=h.shots.filter(s=>s.owner!==u);h.fields=h.fields.filter(f=>f.owner!==u);}
function heroDamage(u,dmg,el){
 if(!heroAlive(u)||heroImmune(u)||!Number.isFinite(dmg)||dmg<=0)return;
 u.hp-=dmg;visualHit(u);u.hg.hit=100;
 if(el==='FREEZE'){const c=elemCfg('FREEZE');u.slow=c.ms;u.slowMul=c.mul;}
 if(el==='POISON'){const c=elemCfg('POISON');u.poison=c.ms;u.poisonCd=c.tick;u.poisonTick=c.tick;}
 if(u.hp<=0)heroDeath(u);
}
function heroHit(owner,target,amount,slow=0){
 if(mode!=='play'||target.hp<=0||!heroTargets(owner).includes(target))return;
 let dmg=amount*(owner.dmgMul||1);if(owner.heroBoss)dmg*=owner.heroScale||1;
 if(owner.type==='L_nemesis'&&target.heroBoss)dmg*=1.15;
 if(target===S){damagePlayer(dmg);if(slow&&S.hp>0)S.slowT=Math.max(S.slowT||0,slow);return;}
 if(owner.heroBoss&&target.side==='ally')dmg*=HERO_RULES.bossFleetDamage;
 if(S.turrets.includes(target)){hitTurret(target,dmg);return;}
 if(target.side==='enemy'){damageUnit(target,dmg,null,true);if(slow&&target.hp>0)target.velcaSlow=Math.max(target.velcaSlow||0,slow);return;}
 if(isHero(target))heroDamage(target,dmg,null);
 else{target.hp-=dmg*(target.pgArmorManaged?1:1-(target.armor||0));visualHit(target);if(target.hp<=0){visualDeath(target);const i=S.allies.indexOf(target);if(i>=0)S.allies.splice(i,1);}}
 if(slow&&target.hp>0)target.velcaSlow=Math.max(target.velcaSlow||0,slow);
}
function heroPoint(u,point,angle=facingState(u).heading){const h=u.w*IMG[u.type].height/IMG[u.type].width,a=angle-Math.PI/2,x=(point[0]-.5)*u.w,y=(point[1]-.5)*h;return {x:u.x+x*Math.cos(a)-y*Math.sin(a),y:u.y+x*Math.sin(a)+y*Math.cos(a)};}
function heroSweepRandom(q){let n=q.sweepSeed>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;q.sweepSeed=n>>>0;return q.sweepSeed/4294967296;}
function heroGunTurn(u,i){const q=u.hg;if(u.type!=='L_astra'||!q.sweepOn||!q.sweepPaths)return 0;const path=q.sweepPaths[i],t=Math.min(1,q.sweepAge/HEROES.L_astra.sweep.life)*4,j=Math.min(3,Math.floor(t)),f=t-j,s=f*f*(3-2*f);return path[j]+(path[j+1]-path[j])*s;}
function heroMuzzle(u,i){const d=HEROES[u.type],p=d.guns[i],pivot=[p[0],p[1]-.115],q=heroPoint(u,pivot),angle=facingState(u).heading+heroGunTurn(u,i),length=.115*u.w*IMG[u.type].height/IMG[u.type].width;return {x:q.x+Math.cos(angle)*length,y:q.y+Math.sin(angle)*length,a:angle};}
function heroBeamMuzzle(u,i){return heroMuzzle(u,i);}
function heroShot(u,origin,angle,opts={}){
 const h=heroState();if(h.shots.length>=HERO_RULES.shotCap)return;
 const speed=opts.speed||HEROES[u.type].primary.speed;
 h.shots.push({owner:u,team:heroSide(u),x:origin.x,y:origin.y,a:angle,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:3,kind:'bolt',age:0,travel:0,range:650,dmg:3,hit:new Set(),...opts});
 heroFX({team:heroSide(u),kind:'muzzle',x:origin.x,y:origin.y,a:angle,life:90,r:5,color:teamShot({team:heroSide(u)},undefined,opts.kind==='laserBolt').color});
}
function heroPrimary(u){const d=HEROES[u.type];for(let i=0;i<4;i++){const p=heroMuzzle(u,i);heroShot(u,p,p.a,{...d.primary,kind:u.type==='L_astra'?'laserBolt':'bullet',r:2.5});u.hg.gunKick[i]=100;}u.atkT=100;}
function heroMissilePair(u,index){const d=HEROES[u.type],a=facingState(u).heading;
 for(const side of [-1,1]){const p=heroPoint(u,[side<0?.16:.84,.525+(index%2)*.017]),spread=-side*(.42+index*.12);
  heroShot(u,p,a+spread,{kind:'missile',speed:2.2,range:660,dmg:d.missile.dmg,splash:d.missile.splash,target:heroTarget(u,800),turn:1.9,r:4,eject:140,smokeCd:0,trail:[],bank:side});
  u.hg.launcherKick[side<0?0:1]=180;heroFX({team:heroSide(u),kind:'launchSmoke',x:p.x,y:p.y,a:a-side*.45,life:440,r:13});
 }
}
function heroMissiles(u){u.hg.missilePair=1;u.hg.missilePairCd=HEROES[u.type].missile.gap;heroMissilePair(u,0);}
function heroMissileSequence(u,dt){const q=u.hg,d=HEROES[u.type].missile;if(!d||q.missilePair>=d.pairs)return;q.missilePairCd-=dt;while(q.missilePairCd<=0&&q.missilePair<d.pairs){heroMissilePair(u,q.missilePair++);q.missilePairCd+=d.gap;}}
function heroArea(u,x,y,r,dmg,slow=0){for(const t of [...heroTargets(u)]){const p=heroPos(t);if(Math.hypot(p.x-x,p.y-y)<=r+(p.r||24))heroHit(u,t,dmg,slow);}}
function heroLine(u,x,y,angle,length,width,dmg,hitSet=null){
 const ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length,wall=velcaWallT(x,y,ex,ey),end=Number.isFinite(wall)?wall:1;
 for(const t of [...heroTargets(u)]){if(hitSet?.has(t))continue;const p=heroPos(t);if(velcaSegmentT(p.x,p.y,x,y,x+(ex-x)*end,y+(ey-y)*end,(p.r||24)+width)<=1){hitSet?.add(t);heroHit(u,t,dmg);}}
 return {x,y,ex:x+(ex-x)*end,ey:y+(ey-y)*end};
}
function heroStartSweep(u){if(!HEROES[u.type].sweep)return;const q=u.hg;q.sweepOn=true;q.sweepAge=0;q.sweepTick=0;q.sweepWarn=HEROES[u.type].sweep.warn;q.sweepCd=Infinity;q.aim=facingState(u).heading;
 // Independent attack RNG: drawing, frame rate and loot/spawn RNG cannot alter a planned sweep.
 if(!q.sweepSeed)q.sweepSeed=(Math.floor(performance.now()*1000)^Math.imul(q.serial,2654435761))>>>0||1;
 q.sweepPaths=Array.from({length:4},()=>{const path=[heroSweepRandom(q)*Math.PI*2-Math.PI];for(let k=1;k<5;k++)path.push(path[k-1]+(heroSweepRandom(q)*2-1)*1.45);return path;});
}
function heroSweep(u,dt){const q=u.hg,d=HEROES[u.type].sweep;if(!q.sweepOn)return;
 if(q.sweepWarn>0){q.sweepWarn=Math.max(0,q.sweepWarn-dt);return;}
 q.sweepAge=Math.min(d.life,q.sweepAge+dt);q.sweepTick-=dt;q.lines=[];
 for(let i=0;i<4;i++){const p=heroBeamMuzzle(u,i),length=u.heroBoss?900:d.len;
  const ex=p.x+Math.cos(p.a)*length,ey=p.y+Math.sin(p.a)*length,wall=velcaWallT(p.x,p.y,ex,ey),f=Number.isFinite(wall)?wall:1;q.lines.push({x:p.x,y:p.y,ex:p.x+(ex-p.x)*f,ey:p.y+(ey-p.y)*f,a:p.a});
 }
 if(q.sweepTick<=0){q.sweepTick+=d.tick;const hit=new Set();for(const line of q.lines){heroLine(u,line.x,line.y,line.a,Math.hypot(line.ex-line.x,line.ey-line.y),d.width,u.heroBoss?d.bossDmg:d.dmg,hit);heroFX({team:heroSide(u),kind:'scar',...line,life:3800,width:3});}}
 if(q.sweepAge>=d.life){q.sweepOn=false;q.lines=[];q.sweepCd=d.cd;}
}
function heroPulse(u,dt){const q=u.hg,d=HEROES[u.type].pulse;if(!q.pulseOn)return;q.pulseAge+=dt;
 if(q.pulseAge<d.charge)return;
 const h=heroState(),a=facingState(u).heading;
 for(let i=0;i<2;i++){const p=heroPoint(u,HEROES[u.type].wings[i]);if(h.fields.length<HERO_RULES.fieldCap)h.fields.push({kind:'fan',owner:u,...p,a:a+(i?1:-1)*.45,half:.88,r:0,max:u.heroBoss?380:d.radius,age:0,life:750,hit:new Set(),dmg:u.heroBoss?26:d.dmg});}
 q.pulseOn=false;q.pulseCd=d.cd;
}
function heroBeginDash(u,target){const q=u.hg;q.mode='dashCharge';q.timer=2000;q.aim=Math.atan2(heroPos(target).y-u.y,heroPos(target).x-u.x);q.sweepOn=false;q.lines=[];q.pulseOn=false;q.dashCd=Infinity;}
function heroDash(u,dt){const q=u.hg;
 if(q.mode==='dashCharge'){q.timer-=dt;u.face=q.aim;if(q.timer<=0){q.mode='dash';q.timer=1700;q.dashTrail=0;facingState(u).heading=u.face;}return;}
 if(q.mode==='dash'){
  const old={x:u.x,y:u.y},step=48*dt/16;u.x+=Math.cos(q.aim)*step;u.y+=Math.sin(q.aim)*step;q.timer-=dt;
  // Coalesce up to 64ms of adjacent path; each section survives at least two seconds.
  const h=heroState(),last=q.lastTrail;
  if(last&&h.fields.includes(last)&&last.age<64){last.ex=u.x;last.ey=u.y;last.life=last.age+2000;}
  else{const d=HEROES[u.type].dash;q.lastTrail={kind:'trail',owner:u,x:old.x,y:old.y,ex:u.x,ey:u.y,age:0,life:2000,width:u.heroBoss?d.bossWidth:d.width,dmg:u.heroBoss?d.bossDmg:d.dmg,tick:0};h.fields.push(q.lastTrail);}
  if(h.fields.length>HERO_RULES.fieldCap)h.fields.shift();
  if(u.x<-100||u.y<-100||u.x>WORLD.w+100||u.y>WORLD.h+100||q.timer<=0){q.mode='away';q.timer=2000;u.gone=true;}return;
 }
 if(q.mode==='away'){q.timer-=dt;if(q.timer<=0){heroReturn(u,heroTarget(u,Infinity));q.mode='normal';q.dashCd=15000;q.primary=350;q.sweepCd=Math.max(650,q.sweepCd===Infinity?7000:q.sweepCd);q.pulseCd=Math.max(850,q.pulseCd);}}
}
function heroReturn(u,target){const p=target?heroPos(target):{x:S.px,y:S.py},a=(u.hg.serial%2?1:-1)*.8-Math.PI/2,dist=u.heroBoss?340:190;u.x=Math.max(u.r+24,Math.min(WORLD.w-u.r-24,p.x+Math.cos(a)*dist));u.y=Math.max(u.r+24,Math.min(WORLD.h-u.r-24,p.y+Math.sin(a)*dist));u.gone=false;u.face=Math.atan2(p.y-u.y,p.x-u.x);facingState(u).heading=u.face;heroFX({team:heroSide(u),kind:'arrival',x:u.x,y:u.y,r:u.r*2,life:700});}
function heroBeginStorm(u){const q=u.hg;q.stormOn=true;q.stormAge=0;q.stormCd=Infinity;q.stormOrigin={x:u.x,y:u.y};}
function heroStormCharge(u,dt){const q=u.hg,d=HEROES[u.type].storm;if(!q.stormOn)return;q.stormAge+=dt;if(q.stormAge<d.charge)return;
 const h=heroState();if(h.fields.filter(f=>f.kind==='storm').length>=6){const old=h.fields.findIndex(f=>f.kind==='storm');h.fields.splice(old,1);}
 if(h.fields.length>=HERO_RULES.fieldCap)h.fields.shift();
 h.fields.push({kind:'storm',owner:u,x:q.stormOrigin.x,y:q.stormOrigin.y,r:d.radius,age:0,life:d.life,tick:0,dmg:d.dmg,slow:d.slow,id:++h.serial});
 heroFX({team:heroSide(u),kind:'stormRelease',x:q.stormOrigin.x,y:q.stormOrigin.y,r:d.radius,life:650});q.stormOn=false;q.stormCd=d.cd;
}
function heroBeginHole(u,target){const q=u.hg;q.mode='hole';q.timer=2500;q.holeTarget=target;q.holeOrigin={x:u.x,y:u.y};q.stormOn=false;q.missilePair=4;q.lines=[];u.gone=true;q.basicTime=0;blip(64,.9,'sine',.035);}
function heroPull(u,dt){const q=u.hg,p=q.holeOrigin,d=HEROES[u.type].hole;
 for(const t of heroTargets(u)){if(S.turrets.includes(t)||heroImmune(t))continue;const pos=heroPos(t),dx=p.x-pos.x,dy=p.y-pos.y,dist=Math.hypot(dx,dy);if(dist<12||dist>d.pullRadius||Number.isFinite(velcaWallT(p.x,p.y,pos.x,pos.y)))continue;
  const step=Math.min(dist-12,d.pullSpeed*(.4+.6*(1-dist/d.pullRadius))*dt/1000),x=dx/dist*step,y=dy/dist*step;
  if(t===S){S.px+=x;S.py+=y;clampPlayer();}else{t.x+=x;t.y+=y;resolveProps(t,t.r||18,t.flying);t.x=Math.max(t.r||18,Math.min(WORLD.w-(t.r||18),t.x));t.y=Math.max(t.r||18,Math.min(WORLD.h-(t.r||18),t.y));}
 }
}
function heroHole(u,dt){const q=u.hg;heroPull(u,Math.min(dt,Math.max(0,q.timer)));q.timer-=dt;if(q.timer>0)return;const p=q.holeOrigin,d=HEROES[u.type].hole;
 heroArea(u,p.x,p.y,d.radius,d.dmg);heroFX({team:heroSide(u),kind:'singularityBurst',x:p.x,y:p.y,r:d.radius,life:1100});S.shake=Math.max(S.shake||0,180);noise(.30,.05);
 heroReturn(u,heroTargets(u).includes(q.holeTarget)?q.holeTarget:heroTarget(u,Infinity));q.mode='normal';q.primary=120;q.missileCd=Math.max(500,q.missileCd);
}
function heroAI(u,dt){
 if(u.hp<=0&&!u.hg.dead){heroDeath(u);return;}if(!heroAlive(u))return;const q=u.hg,d=HEROES[u.type];u.t+=dt;q.age+=dt;for(let i=0;i<4;i++)q.gunKick[i]=Math.max(0,q.gunKick[i]-dt);q.hit=Math.max(0,(q.hit||0)-dt);
 for(let i=0;i<2;i++)q.launcherKick[i]=Math.max(0,q.launcherKick[i]-dt);
 if(u.hp<=0){heroDeath(u);return;}if(u.poison>0){u.poison-=dt;u.poisonCd-=dt;if(u.poisonCd<=0){u.poisonCd=u.poisonTick||900;heroDamage(u,1,null);if(q.dead)return;}}
 const sl=(u.slow>0?(u.slowMul||.8):1)*(u.velcaSlow>0?.45:1);u.slow=Math.max(0,u.slow-dt);u.velcaSlow=Math.max(0,(u.velcaSlow||0)-dt);
 if(u.velcaStun>0){u.velcaStun=Math.max(0,u.velcaStun-dt);return;}
 if(['dashCharge','dash','away'].includes(q.mode)){heroDash(u,dt);return;}if(q.mode==='hole'){heroHole(u,dt);return;}
 const target=heroTarget(u,1000),p=target?heroPos(target):{x:S.px,y:S.py},dx=p.x-u.x,dy=p.y-u.y,dist=Math.hypot(dx,dy)||1;
 if(target){
  q.sweepCd-=dt;q.pulseCd-=dt;q.dashCd-=dt;q.missileCd-=dt;q.stormCd-=dt;
  if(u.type==='L_astra'&&!q.sweepOn&&!q.pulseOn&&q.dashCd<=0){heroBeginDash(u,target);return;}
  if(u.type==='L_nemesis'&&!q.stormOn&&q.basicTime>=d.hole.uptime){heroBeginHole(u,target);return;}
  if(d.storm&&q.stormCd<=0&&!q.stormOn)heroBeginStorm(u);
  if(q.sweepCd<=0&&!q.sweepOn&&!q.pulseOn)heroStartSweep(u);
  if(d.pulse&&q.pulseCd<=0&&!q.sweepOn&&!q.pulseOn){q.pulseOn=true;q.pulseAge=0;q.pulseCd=Infinity;}
 }
 if(!q.sweepOn)u.face=Math.atan2(dy,dx);else u.face=q.aim;
 const hold=q.stormOn||(q.sweepOn&&u.type==='L_astra'),desired=target?(u.heroBoss?220:230):115;
 if(!hold){const radial=dist>desired?1:target&&dist<desired*.67?-.55:0,lateral=target?Math.sin(q.age*.001+q.serial)*.35:0,step=u.spd*sl*dt/16;u.x+=(dx/dist*radial-dy/dist*lateral)*step;u.y+=(dy/dist*radial+dx/dist*lateral)*step;}
 u.x=Math.max(u.r+12,Math.min(WORLD.w-u.r-12,u.x));u.y=Math.max(u.r+12,Math.min(WORLD.h-u.r-12,u.y));
 if(d.sweep)heroSweep(u,dt);if(d.pulse)heroPulse(u,dt);if(d.storm)heroStormCharge(u,dt);
 const canFire=target&&dist<d.primary.range&&!(u.type==='L_astra'&&q.sweepOn);
 if(canFire){q.primary-=dt;if(u.type==='L_nemesis')q.basicTime+=dt;if(q.primary<=0){heroPrimary(u);q.primary+=d.primary.cd*(u.side==='ally'?1:1);}}
 heroMissileSequence(u,dt);if(d.missile&&target&&dist<800&&q.missileCd<=0){heroMissiles(u);q.missileCd=d.missile.cd;}
}
function heroSpawnBoss(){
 const h=heroState();if(h.boss||h.bossDefeated)return;const x=Math.max(220,Math.min(WORLD.w-220,S.px)),y=Math.max(220,Math.min(WORLD.h-220,S.py-480));
 S.base=null;S.turrets=[];S.gates=[];S.phase='heroBoss';h.boss=makeHero('L_astra',x,y,'enemy',true);S.enemies.push(h.boss);
 h.boss.hg.primary=1800;S.warn=1500;S.warnText=heroText('최종 병기 · 아스트라 세이버','FINAL WEAPON · ASTRA SABER');musicPlay('boss');heroFX({kind:'arrival',x,y,r:180,life:1300});
}
function heroBossStage(){return !!S&&(S.story?S.story.id==='4-10':S.stage===60);}
function heroFrameCamera(dt){const h=S.hero;if(!h)return;const u=h.boss,visible=u&&heroAlive(u)&&!heroImmune(u)&&Math.hypot(u.x-S.px,u.y-S.py)<800;
 const wanted=visible?{x:Math.max(-W*.15,Math.min(W*.15,(u.x-S.px)*.30)),y:Math.max(-H*.18,Math.min(H*.18,(u.y-S.py)*.30))}:{x:0,y:0},q=h.camera||(h.camera={x:0,y:0}),lerp=1-Math.exp(-dt/180);
 q.x+=(wanted.x-q.x)*lerp;q.y+=(wanted.y-q.y)*lerp;S.cam.x=Math.max(0,Math.min(WORLD.w-W,S.cam.x+q.x));S.cam.y=Math.max(0,Math.min(WORLD.h-H,S.cam.y+q.y));
}
function heroDropTrophies(u){if(!heroUnlocked())return;for(const [key,chance]of [['L_astra',HERO_RULES.dropAstra],['L_nemesis',HERO_RULES.dropNemesis]])if(Math.random()<chance)heroState().trophies.push({key,x:u.x+(key==='L_astra'?-32:32),y:u.y,age:0,collected:false});}
function heroDeath(u){
 const q=u.hg;if(q.dead)return;q.dead=true;u.hp=0;heroDisarm(u);const list=u.side==='ally'?S.allies:S.enemies,i=list.indexOf(u);if(i>=0)list.splice(i,1);
 heroFX({team:heroSide(u),kind:'collapse',x:u.x,y:u.y,r:u.heroBoss?200:90,life:950});
 if(!u.heroBoss)return;const h=heroState();h.bossDefeated=true;h.clearing=true;h.clearDelay=1200;S.phase='heroLoot';S.kills++;S.killed++;S.score+=u.score;
 META.totalKills=(META.totalKills||0)+1;META.astraDefeats=(META.astraDefeats||0)+1;heroDropTrophies(u);
 S.spawnCd=S.legendCd=1e9;S.enemies.length=0;S.ebullets.length=0;S.bullets.length=0;S.hazards.length=0;delete S.velca;h.shots.length=0;h.fields.length=0;
 S.warn=2000;S.warnText=heroText('아스트라 세이버 격파','ASTRA SABER DEFEATED');
}
function heroCollectTrophy(t){if(t.collected||!heroUnlocked())return false;t.collected=true;S.pending[t.key]=(S.pending[t.key]||0)+1;S.captured++;
 S.fx.push({k:'txt',x:S.px,y:S.py-45,life:1800,t:1800,s:nm(t.key)+' '+heroText('획득','ACQUIRED'),c:'#ffe7a1'});heroFX({kind:'arrival',x:S.px,y:S.py,r:85,life:650});blip(880,.18,'triangle',.04);blip(1320,.25,'sine',.04);heroState().clearDelay=1400;return true;}
function heroUpdate(dt){
 if(!S||mode!=='play'||!S.hero)return;const h=S.hero;
 // Fixed-size substeps keep piercing shots and thin waves fair across frame rates.
 for(let left=dt;left>0;){const step=Math.min(16,left);h.time+=step;heroUpdateShots(step);heroUpdateFields(step);left-=step;}
 for(const t of h.trophies){t.age+=dt;if(t.collected)continue;const dx=S.px-t.x,dy=S.py-t.y,d=Math.hypot(dx,dy);if(d<26){heroCollectTrophy(t);continue;}if(d<210){const step=Math.min(d,5.5*dt/16);t.x+=dx/d*step;t.y+=dy/d*step;}}
 h.trophies=h.trophies.filter(t=>!t.collected);for(const f of h.fx)f.age+=dt;h.fx=h.fx.filter(f=>f.age<f.life);
 if(h.clearing){S.spawnCd=S.legendCd=1e9;h.clearDelay-=dt;if(h.clearDelay<=0&&!h.trophies.length)openUpgrade();}
}
function heroUpdateShots(dt){const h=heroState();for(let i=h.shots.length-1;i>=0;i--){const b=h.shots[i];if(!b)continue;b.age+=dt;
 if(b.kind==='missile'){
  if(b.age>(b.eject||0)&&b.target&&heroTargets(b.owner).includes(b.target)){const p=heroPos(b.target),want=Math.atan2(p.y-b.y,p.x-b.x);b.a+=Math.max(-b.turn*dt/1000,Math.min(b.turn*dt/1000,facingGap(want,b.a)));}
  const speed=b.eject?2.2+3.3*Math.min(1,Math.max(0,b.age-b.eject)/260):Math.hypot(b.vx,b.vy);b.vx=Math.cos(b.a)*speed;b.vy=Math.sin(b.a)*speed;
  if(b.trail){b.trail.push({x:b.x,y:b.y,age:0});for(const p of b.trail)p.age+=dt;while(b.trail.length>18||b.trail[0]?.age>300)b.trail.shift();b.smokeCd-=dt;if(b.smokeCd<=0){b.smokeCd+=60;heroFX({team:b.team,kind:'rocketSmoke',x:b.x,y:b.y,a:b.a,life:420,r:7});}}
 }
 const ax=b.x,ay=b.y;b.x+=b.vx*dt/16;b.y+=b.vy*dt/16;b.travel+=Math.hypot(b.x-ax,b.y-ay);let done=b.travel>b.range||b.age>4000||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h;
 const wall=velcaWallT(ax,ay,b.x,b.y);if(Number.isFinite(wall)){b.x=ax+(b.x-ax)*wall;b.y=ay+(b.y-ay)*wall;done=true;}
 let direct=null;for(const t of [...heroTargets(b.owner)]){if(b.hit.has(t))continue;const p=heroPos(t);if(velcaSegmentT(p.x,p.y,ax,ay,b.x,b.y,(p.r||24)+b.r)>1)continue;b.hit.add(t);direct=t;heroHit(b.owner,t,b.dmg);if(b.kind!=='laserBolt'){done=true;break;}}
 if(done){if(b.splash){heroArea(b.owner,b.x,b.y,b.splash,b.dmg*.65);heroFX({team:b.team,kind:'impact',x:b.x,y:b.y,r:b.splash,life:430});}const index=h.shots.indexOf(b);if(index>=0)h.shots.splice(index,1);}
 }}
function heroUpdateFields(dt){const h=heroState();for(let i=h.fields.length-1;i>=0;i--){const f=h.fields[i];if(!f)continue;f.age+=dt;if(f.age>=f.life){h.fields.splice(i,1);continue;}
 if(f.kind==='fan'){const old=f.r;f.r=f.max*f.age/f.life;for(const t of [...heroTargets(f.owner)]){if(f.hit.has(t))continue;const p=heroPos(t),dx=p.x-f.x,dy=p.y-f.y,d=Math.hypot(dx,dy),r=p.r||24;if(d+r<old||d-r>f.r+10||Math.abs(facingGap(Math.atan2(dy,dx),f.a))>f.half+Math.atan2(r,Math.max(1,d)))continue;const wall=velcaWallT(f.x,f.y,p.x,p.y);if(Number.isFinite(wall))continue;f.hit.add(t);heroHit(f.owner,t,f.dmg);}}
 if(f.kind==='storm'){f.tick-=dt;const hit=f.tick<=0;if(hit)f.tick+=HEROES.L_nemesis.storm.tick;for(const t of [...heroTargets(f.owner)]){const p=heroPos(t);if(Math.hypot(p.x-f.x,p.y-f.y)>f.r||Number.isFinite(velcaWallT(f.x,f.y,p.x,p.y)))continue;if(t===S)S.slowT=Math.max(S.slowT||0,f.slow);else if(!S.turrets.includes(t))t.velcaSlow=Math.max(t.velcaSlow||0,f.slow);if(hit)heroHit(f.owner,t,f.dmg);}}
 if(f.kind==='trail'){f.tick-=dt;if(f.tick<=0){f.tick+=300;for(const t of [...heroTargets(f.owner)]){const p=heroPos(t);if(velcaSegmentT(p.x,p.y,f.x,f.y,f.ex,f.ey,(p.r||24)+f.width/2)<=1){const key=f.owner.hg.serial;const ticks=t.heroTrailTicks||(t.heroTrailTicks={});if((ticks[key]||0)<=h.time){ticks[key]=h.time+290;heroHit(f.owner,t,f.dmg,450);}}}}}
 }}

/* Local weapon motion: hull never bobs or bounces. Weapon origins share rendering geometry. */
const HERO_ART={white:{}};
for(const key of HERO_KEYS){const d=HEROES[key];V_RIG[key]={kind:'jet',shot:'laser',recoil:.8,parts:d.guns.map((p,i)=>vRect('heroGun',p[0]-.026,p[1]-.13,p[0]+.026,p[1]+.018,p[0],p[1]-.115,{index:i}))};if(key==='L_nemesis')for(let i=0;i<2;i++){const x=i?.84:.16;V_RIG[key].parts.push(vRect('heroPod',x-.027,.496,x+.027,.56,x,.525,{index:i}));}}
function heroPrepareArt(){for(const key of HERO_KEYS){const image=IMG[key];if(!image)continue;const c=visualCanvas(512,512),q=c.getContext('2d');q.drawImage(image,0,0,512,512);IMG[key]=c;TINT.frost[key]=frostify(c);const white=visualCanvas(512,512),w=white.getContext('2d');w.drawImage(c,0,0);w.globalCompositeOperation='source-in';w.fillStyle='#eafcff';w.fillRect(0,0,512,512);HERO_ART.white[key]=white;}}
function drawHeroGun(u,img,p,w,h,c){const px=(p.pivot[0]-.5)*w,py=(p.pivot[1]-.5)*h,kick=(u.hg.gunKick[p.index]||0)/100*w*.020;c.translate(px,py);c.rotate(heroGunTurn(u,p.index));c.drawImage(img,-w/2-px,-h/2-py-kick,w,h);}
function drawHeroPod(u,img,p,w,h,c){const kick=(u.hg.launcherKick[p.index]||0)/180;c.drawImage(img,-w/2,-h/2-kick*w*.017,w,h);if(kick>0)heroGlow(c,(p.pivot[0]-.5)*w,(p.pivot[1]-.5)*h,w*.07,'#ffd3a5aa',kick);}
function heroGlow(c,x,y,r,color,alpha=1){const g=c.createRadialGradient(x,y,0,x,y,Math.max(1,r));g.addColorStop(0,color);g.addColorStop(1,'#3189f000');c.save();c.globalAlpha*=alpha;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
function heroNoise(n){const x=Math.sin(n*127.1+19.19)*43758.5453;return x-Math.floor(x);}
function heroArc(c,x1,y1,x2,y2,seed,spread=9){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1;c.beginPath();c.moveTo(x1,y1);for(let i=1;i<8;i++){const t=i/8,j=(heroNoise(seed+i)-.5)*spread*Math.sin(t*Math.PI);c.lineTo(x1+dx*t-dy/L*j,y1+dy*t+dx/L*j);}c.lineTo(x2,y2);}
function heroChargeSparks(c,x,y,r,t,age,color){heroGlow(c,x,y,r,color,.6+t*.4);c.save();c.strokeStyle='#defaff';c.lineWidth=1.2;for(let i=0;i<10;i++){const a=i*2.399+age*.0014,p=(age*.001+i*.173)%1,rr=r*(1.8-p*1.55);c.globalAlpha=(.3+t*.7)*p;c.beginPath();c.moveTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);c.lineTo(x+Math.cos(a)*(rr+r*.1),y+Math.sin(a)*(rr+r*.1));c.stroke();}c.restore();}
function drawHeroUnit(u,x,y){if(!u.hg||u.hg.dead||u.gone)return;const d=HEROES[u.type],q=u.hg,w=u.w,h=w*IMG[u.type].height/IMG[u.type].width,c=ctx;
 c.save();c.translate(x,y);c.rotate(facingAngle(u));
 for(const p of d.jets){const xx=(p[0]-.5)*w,yy=(p[1]-.5)*h,drive=visualState(u).speed,thrust=q.mode==='dash'?w*.64:w*(.14+drive*.33);heroGlow(c,xx,yy,w*.12,'#51baffa0');motion22Exhaust(c,xx,yy,thrust,w*.043,q.age+p[0]*400,true);}
 drawVisualSprite(u,IMG[u.type],w,h,c);
 if(q.mode==='dashCharge'||q.mode==='dash'){const amount=q.mode==='dash'?1:1-Math.max(0,q.timer)/2000;c.globalAlpha=.12+amount*.82;c.drawImage(HERO_ART.white[u.type],-w/2,-h/2,w,h);c.globalAlpha=1;heroGlow(c,0,0,w*.55,'#e3ffff60',amount);}
 const charging=q.stormOn?Math.min(1,q.stormAge/2000):q.pulseOn?Math.min(1,q.pulseAge/750):q.sweepOn&&q.sweepWarn>0?1-q.sweepWarn/HEROES.L_astra.sweep.warn:0;
 if(charging>0)for(const p of d.wings){const xx=(p[0]-.5)*w,yy=(p[1]-.5)*h;heroChargeSparks(c,xx,yy,w*(.12+.16*charging),charging,q.age,q.stormOn?'#b79bffcc':'#9beeffcc');c.strokeStyle='#dbffff';c.lineWidth=1;c.beginPath();c.arc(xx,yy,w*.12*(1-charging)+2,0,6.283);c.stroke();}
 if(q.mode==='dashCharge'){c.strokeStyle='#e7ffff';c.lineWidth=1.2;for(let i=0;i<10;i++){const a=i*2.399+q.age*.002,r=w*(.62-.2*(1-q.timer/2000)),len=w*.08;c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a)*(r-len),Math.sin(a)*(r-len));c.stroke();}}
 c.restore();
 if(!u.heroBoss){c.save();c.fillStyle='#0b1827';c.fillRect(x-w*.35,y+h*.46,w*.7,3);c.fillStyle=u.side==='ally'?'#77ddd1':'#cf9fff';c.fillRect(x-w*.35,y+h*.46,w*.7*Math.max(0,u.hp/u.hpMax),3);c.restore();}
}
function drawHeroGround(cx,cy){if(!S?.hero)return;const c=ctx;
 for(const f of S.hero.fx)if(f.kind==='scar'){const t=f.age/f.life;c.save();c.lineCap='butt';c.setLineDash([9,17,3,11]);c.lineDashOffset=f.id%29;c.strokeStyle='#081621';c.globalAlpha=.25*(1-t);c.lineWidth=2;c.beginPath();c.moveTo(f.x-cx,f.y-cy);c.lineTo(f.ex-cx,f.ey-cy);c.stroke();c.strokeStyle='#75d9ff';c.globalAlpha=.16*Math.max(0,1-f.age/800);c.lineWidth=.8;c.stroke();c.restore();}
 for(const f of S.hero.fields){const alpha=1-f.age/f.life;c.save();c.translate(f.x-cx,f.y-cy);
  if(f.kind==='trail')drawHeroTrail(c,f,alpha);
  else if(f.kind==='fan')drawHeroFan(c,f,alpha);
  else if(f.kind==='storm')drawHeroStorm(c,f);
  c.restore();
 }
 for(const u of [...S.enemies,...S.allies])if(isHero(u)){const q=u.hg;
  if(q.stormOn){c.save();c.translate(q.stormOrigin.x-cx,q.stormOrigin.y-cy);const r=HEROES.L_nemesis.storm.radius;c.strokeStyle=TEAM_ENERGY[u.side==='ally'?'ally':'enemy'].color;c.globalAlpha=.22+.22*q.stormAge/2000;c.lineWidth=1;c.setLineDash([5,11]);c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();c.restore();}
  if(q.mode==='dashCharge'){const d=HEROES[u.type].dash,width=u.heroBoss?d.bossWidth:d.width;c.save();c.translate(u.x-cx,u.y-cy);c.rotate(q.aim);c.strokeStyle=TEAM_ENERGY[u.side==='ally'?'ally':'enemy'].color;c.globalAlpha=.25+.35*(1-q.timer/2000);c.setLineDash([10,12]);c.lineWidth=1.5;for(const side of [-1,1]){c.beginPath();c.moveTo(0,side*width/2);c.lineTo(1400,side*width/2);c.stroke();}c.restore();}
 }
}
function drawHeroTrail(c,f,alpha){const palette=TEAM_ENERGY[f.owner.side==='ally'?'ally':'enemy'];const dx=f.ex-f.x,dy=f.ey-f.y,L=Math.hypot(dx,dy),w=f.width,age=S.hero.time,a=Math.atan2(dy,dx),offset=f.x*Math.cos(a)+f.y*Math.sin(a);c.rotate(a);
 const g=c.createLinearGradient(0,-w*.56,0,w*.56);g.addColorStop(0,palette.color+'00');g.addColorStop(.17,palette.color+'a0');g.addColorStop(.4,palette.color+'a0');g.addColorStop(.5,palette.core+'c0');g.addColorStop(.6,palette.color+'a0');g.addColorStop(.83,palette.color+'a0');g.addColorStop(1,palette.color+'00');c.fillStyle=g;c.globalAlpha=alpha*.8;c.fillRect(0,-w*.56,L,w*1.12);
 c.beginPath();c.rect(0,-w*.55,L,w*1.1);c.clip();c.globalCompositeOperation='lighter';
 for(let k=0;k<5;k++){c.strokeStyle=k===2?palette.core:palette.color;c.globalAlpha=alpha*(k===2?.65:.32);c.lineWidth=k===2?1.8:1.1;c.beginPath();for(let x=0;x<=L+8;x+=8){const v=x+offset,y=(k-2)*w*.17+Math.sin(v*.036-age*.006+k*2)*w*.07+Math.sin(v*.093+age*.003)*w*.035;if(!x)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
 const first=Math.floor(offset/42)*42-offset;
 for(let x=first;x<L;x+=42){const n=Math.floor((x+offset)/42),t=n*.7+age*.006,y=Math.sin(t)*w*.31,seed=n+Math.floor(age/95);c.strokeStyle=palette.core;c.lineWidth=1.2;c.globalAlpha=alpha*.85;heroArc(c,x,y,x+32,y+Math.cos(t)*w*.28,seed,w*.24);c.stroke();heroGlow(c,x+14,y,14,palette.color+'b0',alpha*.7);c.fillStyle=palette.core;c.globalAlpha=alpha*.9;c.fillRect(x+14,y,2.5,2.5);}
}
function drawHeroFan(c,f,alpha){const palette=TEAM_ENERGY[f.owner.side==='ally'?'ally':'enemy'];c.rotate(f.a);const r=Math.max(1,f.r),inner=Math.max(0,r-26),g=c.createRadialGradient(0,0,inner,0,0,r+12);g.addColorStop(0,palette.color+'00');g.addColorStop(.58,palette.color+'88');g.addColorStop(.78,palette.color+'cf');g.addColorStop(1,palette.color+'00');c.globalAlpha=Math.min(1,alpha*2);c.fillStyle=g;c.beginPath();c.arc(0,0,r+12,-f.half,f.half);c.arc(0,0,inner,f.half,-f.half,true);c.closePath();c.fill();
 c.globalCompositeOperation='lighter';
 for(let k=0;k<3;k++){c.strokeStyle=k?palette.color:palette.core;c.globalAlpha=Math.min(1,alpha*1.6)*(k?.62:1);c.lineWidth=k?1.4:3;c.beginPath();c.arc(0,0,Math.max(1,r-k*9),-f.half,f.half);c.stroke();}
 for(let i=0;i<25;i++){const a=-f.half+i*f.half/12,rr=r-heroNoise(i+Math.floor(f.age/70))*12,x=Math.cos(a)*rr,y=Math.sin(a)*rr;c.strokeStyle=palette.core;c.lineWidth=1.2;c.globalAlpha=alpha;heroArc(c,Math.cos(a)*Math.max(0,r-32),Math.sin(a)*Math.max(0,r-32),x,y,i+Math.floor(f.age/70),18);c.stroke();if(i%3===0)heroGlow(c,x,y,17,palette.color+'aa',alpha);c.fillStyle=palette.core;c.fillRect(x,y,2.5,2.5);}
}
function drawHeroStorm(c,f){cgStorm33(c,f,TEAM_ENERGY[f.owner.side==='ally'?'ally':'enemy']);}
function drawHeroBlackHole(u,cx,cy){const q=u.hg,age=2500-q.timer,t=Math.min(1,age/2500),r=156*(.045+.955*Math.pow(1-t,.60)),x=q.holeOrigin.x-cx,y=q.holeOrigin.y-cy;
 ctx.save();ctx.translate(x+Math.sin(age*.071)*1.1,y+Math.cos(age*.083)*.7);heroGlow(ctx,0,0,r*3.1,'#b48cff85');ctx.rotate(-.12);
 const pull=HEROES.L_nemesis.hole.pullRadius;ctx.strokeStyle='#8b83d8';ctx.globalAlpha=.12;ctx.lineWidth=1;ctx.setLineDash([4,19]);ctx.beginPath();ctx.arc(0,0,pull,0,6.283);ctx.stroke();ctx.setLineDash([]);
 for(let i=0;i<34;i++){const phase=(age/1700+i*.117)%1,rr=22+(pull-22)*Math.pow(1-phase,.9),a=i*2.399+age*.0014+phase*2,xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;ctx.strokeStyle=i%3?'#9c99f7':'#ffe5b2';ctx.globalAlpha=Math.sin(phase*Math.PI)*.55;ctx.lineWidth=i%5?1:1.6;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(Math.cos(a-.055)*(rr+8),Math.sin(a-.055)*(rr+8));ctx.stroke();}
 ctx.globalAlpha=1;
 // Turbulent accretion filaments: back layer is occluded by the opaque horizon.
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=0;i<(MOBILE_DEVICE?20:32);i++){const rr=r*(1.04+i*.024),a=age*.0015*(i%2?1:-1)+i*2.399;ctx.strokeStyle=i%4===0?'#d4b8ff':i%3?'#ffcb91':'#fff1c9';ctx.globalAlpha=.14+(i%5)*.045;ctx.lineWidth=1+(i%3)*.7;ctx.beginPath();ctx.ellipse(0,0,rr,rr*.29,-.025,a,a+.65+(i%3)*.2);ctx.stroke();}
 for(const side of [-1,1]){ctx.save();ctx.rotate(side<0?Math.PI:0);const g=ctx.createLinearGradient(0,-r*.5,0,-r*1.85);g.addColorStop(0,'#99baff45');g.addColorStop(.3,'#749cf52c');g.addColorStop(1,'#668eff00');ctx.globalAlpha=.6;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-r*.12,-r*.42);ctx.bezierCurveTo(-r*.05,-r,r*.08,-r*1.45,0,-r*1.9);ctx.bezierCurveTo(r*.20,-r*1.45,r*.12,-r,r*.12,-r*.42);ctx.fill();ctx.restore();}
 ctx.restore();
 // Lensed upper disk, opaque event horizon, then the foreground accretion band.
 for(let i=10;i>=0;i--){ctx.strokeStyle=i>5?'#9e7bce':i>2?'#f2be87':'#fff0ce';ctx.globalAlpha=.14+.05*(10-i);ctx.lineWidth=1+i*.55;ctx.beginPath();ctx.ellipse(0,-r*.03,r*(1.45+i*.02),r*(.42+i*.012),0,Math.PI,Math.PI*2);ctx.stroke();}
 ctx.globalAlpha=1;ctx.fillStyle='#010309';ctx.beginPath();ctx.arc(0,0,r*.73,0,6.283);ctx.fill();
 for(let i=5;i>=0;i--){ctx.globalAlpha=i?.08:.9;ctx.strokeStyle=i?'#bb9cff':'#ffecc9';ctx.lineWidth=1.4+i*1.8;ctx.stroke();}ctx.globalAlpha=1;
 for(let i=6;i>=0;i--){ctx.strokeStyle=i<2?'#fff3d2':'#dbac79';ctx.lineWidth=.7+i*.65;ctx.globalAlpha=.08+(6-i)*.065;ctx.beginPath();ctx.ellipse(0,0,r*(.79+i*.016),r*(.85+i*.016),0,Math.PI*1.02,Math.PI*1.98);ctx.stroke();}
 const band=ctx.createLinearGradient(0,-r*.025,0,r*.105);band.addColorStop(0,'#ddadf200');band.addColorStop(.22,'#ffbd7970');band.addColorStop(.43,'#fff4d4');band.addColorStop(.61,'#ffdc9dbb');band.addColorStop(1,'#9d7cf000');ctx.globalAlpha=.94;ctx.fillStyle=band;ctx.beginPath();ctx.moveTo(-r*1.8,r*.02);ctx.bezierCurveTo(-r*.8,-r*.04,r*.8,-r*.04,r*1.8,r*.02);ctx.bezierCurveTo(r*.8,r*.13,-r*.8,r*.13,-r*1.8,r*.02);ctx.fill();
 for(let i=0;i<26;i++){const p=(i/26+age*.00024)%1,xx=(p*3.4-1.7)*r,yy=r*(.025+heroNoise(i)*.022);ctx.globalAlpha=.35+heroNoise(i+5)*.3;ctx.strokeStyle=i%3?'#fff1cf':'#cfbaff';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+r*(.025+heroNoise(i+8)*.055),yy);ctx.stroke();}
 for(let i=9;i>=0;i--){ctx.strokeStyle=i>5?'#9478bc':i>2?'#f3bc81':'#fff7dc';ctx.globalAlpha=.12+.065*(9-i);ctx.lineWidth=1+i*.45;ctx.beginPath();ctx.ellipse(0,r*.08,r*(1.65+i*.015),r*(.21+i*.018),0,0,Math.PI);ctx.stroke();}
 for(let i=0;i<36;i++){const a=i*2.399+age*.003,rr=r*(1.05+(i%3)*.23),xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.3;if(yy<0&&Math.hypot(xx,yy)<r*.74)continue;ctx.strokeStyle=i%2?'#f9d5a7':'#b9a0ff';ctx.globalAlpha=.75;ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(0,0,rr,rr*.3,0,a,a+.12);ctx.stroke();}
 for(const side of [-1,1]){heroGlow(ctx,side*r*1.33,r*.02,r*.32,'#fff0be9a');ctx.globalAlpha=.75;ctx.strokeStyle='#fff3d5';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(side*r*1.33-r*.25,r*.02);ctx.lineTo(side*r*1.33+r*.25,r*.02);ctx.stroke();}
 if(t>.83){heroGlow(ctx,0,0,24+32*(t-.83)/.17,'#ffffffde',(t-.83)/.17);ctx.strokeStyle='#d6e3ff';ctx.globalAlpha=(t-.83)/.17;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-80,0);ctx.lineTo(80,0);ctx.stroke();}
 ctx.restore();
}
function drawHeroCombat(cx,cy){if(!S?.hero)return;const c=ctx;
 for(const u of [...S.enemies,...S.allies]){if(!isHero(u)||u.hg.dead)continue;const q=u.hg;
  if(q.mode==='hole'){drawHeroBlackHole(u,cx,cy);continue;}
  if(q.sweepOn&&HEROES[u.type].sweep){for(let i=0;i<4;i++){const p=heroBeamMuzzle(u,i),line=q.lines?.[i],len=line?Math.hypot(line.ex-line.x,line.ey-line.y):(u.heroBoss?900:HEROES[u.type].sweep.len);c.save();c.translate(p.x-cx,p.y-cy);c.rotate(p.a);
   if(q.sweepWarn>0){c.setLineDash([8,9]);c.strokeStyle=u.side==='enemy'?TEAM_ENERGY.enemy.color:TEAM_ENERGY.ally.color;c.globalAlpha=.55;c.lineWidth=1;c.beginPath();c.moveTo(0,0);c.lineTo(len,0);c.stroke();}
   else{const palette=TEAM_ENERGY[u.side==='ally'?'ally':'enemy'],width=HEROES[u.type].sweep.width,life=1-Math.max(0,q.sweepAge-1700)/300;c.globalCompositeOperation='lighter';c.globalAlpha=life*.18;c.fillStyle=palette.color;c.fillRect(0,-width*2.2,len,width*4.4);c.globalAlpha=life*.85;c.fillStyle=palette.color;c.fillRect(0,-width*.5,len,width);c.fillStyle=palette.core;c.fillRect(0,-width*.18,len,width*.36);heroGlow(c,0,0,18,palette.color+'b0',life);for(let j=0;j<7;j++){const xx=(q.age*.7+j*len/7)%len;c.globalAlpha=.8*life;c.fillRect(xx,-width*.3,16,width*.6);c.strokeStyle=palette.color;c.lineWidth=.6;heroArc(c,xx,0,Math.min(len,xx+30),0,j+Math.floor(q.age/65),width*1.4);c.stroke();}}
   c.restore();
  }}
 }
 for(const b of S.hero.shots)drawTeamHeroShot(b,cx,cy);
 for(const f of S.hero.fx){if(f.kind==='scar')continue;const t=f.age/f.life,alpha=1-t;c.save();c.translate(f.x-cx,f.y-cy);
  if(f.kind==='launchSmoke'||f.kind==='rocketSmoke'){c.rotate(f.a);for(let i=0;i<4;i++){const px=-t*(f.kind==='launchSmoke'?22:12)-i*3,py=(heroNoise(i+f.id)-.5)*(10+t*10),r=f.r*(.35+t*.9);c.fillStyle=i%2?'#b4c5d6':'#60788d';c.globalAlpha=alpha*(f.kind==='launchSmoke'?.23:.085);c.beginPath();c.ellipse(px,py,r,r*.7,0,0,6.283);c.fill();}}
  else if(f.kind==='singularityBurst')drawHeroSingularityBurst(c,f);
  else if(f.kind==='impact'){cgEnergyImpact32(c,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'],f.r,t,f.id);}
  else if(f.kind==='stormRelease'){heroGlow(c,0,0,f.r*(.2+t*.8),TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'65',alpha);c.strokeStyle=TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.globalAlpha=alpha*.6;c.lineWidth=3*(1-t);c.beginPath();c.arc(0,0,f.r*Math.min(1,t*2),0,6.283);c.stroke();}
  else if(f.kind==='muzzle'){c.rotate(f.a);c.globalCompositeOperation='lighter';heroGlow(c,0,0,f.r*3,f.color+'b0',alpha);c.strokeStyle=TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.globalAlpha=alpha*.7;c.lineWidth=1;c.beginPath();c.ellipse(1,0,1+t*4,2+t*6,0,0,6.283);c.stroke();c.fillStyle=TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.globalAlpha=alpha;c.fillRect(-1,-1,10*(1-t),2);}
  else{const r=Math.max(1,f.r*(1-Math.pow(1-t,3)));heroGlow(c,0,0,r*.8,f.kind==='collapse'?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core+'70':TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'80',alpha);c.globalAlpha=alpha;c.strokeStyle=f.kind==='collapse'?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core:TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color;c.lineWidth=(1-t)*3+.5;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();for(let i=0;i<10;i++){const a=i*2.399+f.id;c.strokeStyle=i%2?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color:TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.beginPath();c.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}}
  c.restore();
 }
 for(const t of S.hero.trophies){const x=t.x-cx,y=t.y-cy;c.save();c.translate(x,y);heroGlow(c,0,0,34,'#f0bf5750');c.fillStyle='#715121';c.beginPath();c.moveTo(-18,18);c.lineTo(18,18);c.lineTo(13,26);c.lineTo(-13,26);c.closePath();c.fill();c.fillStyle='#ead38b';c.fillRect(-12,17,24,3);c.strokeStyle='#e4c87c';c.lineWidth=1;c.beginPath();c.arc(0,0,27,0,6.283);c.stroke();c.drawImage(IMG[t.key],-22,-24,44,44);c.fillStyle='#ffe7a3';c.font='10px system-ui';c.textAlign='center';c.fillText(nm(t.key),0,41);c.restore();}
}
function drawHeroSingularityBurst(c,f){const t=f.age/f.life,fade=1-t,r=f.r*(1-Math.pow(1-t,3));heroGlow(c,0,0,Math.max(1,r*.95),TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'ad',fade);heroGlow(c,0,0,32+f.r*.3*(1-t),TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core+'f0',Math.max(0,1-t*3));c.globalCompositeOperation='lighter';
 if(r>8){const g=c.createRadialGradient(0,0,r*.76,0,0,r*1.03);g.addColorStop(0,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'00');g.addColorStop(.6,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'66');g.addColorStop(.82,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core+'bb');g.addColorStop(1,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color+'00');c.fillStyle=g;c.globalAlpha=fade*.8;c.beginPath();c.arc(0,0,r*1.03,0,6.283);c.fill();}
 for(let i=0;i<3;i++){c.strokeStyle=i===0?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core:i===1?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color:TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].color;c.globalAlpha=fade*(i?.38:.85);c.lineWidth=i?1.2:3*fade;c.beginPath();c.ellipse(0,0,Math.max(1,r*(1-i*.11)),Math.max(1,r*(i===2?.55:1-i*.11)),i===2?-.18:0,0,6.283);c.stroke();}
 for(let i=0;i<32;i++){const a=i*2.399+f.id,rr=r*(.45+heroNoise(i+f.id)*.55),x=Math.cos(a)*rr,y=Math.sin(a)*rr;c.strokeStyle=i%3?TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core:TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.lineWidth=i%4?1:2;c.globalAlpha=fade;heroArc(c,x*.72,y*.72,x,y,i+Math.floor(f.age/70),18*fade);c.stroke();if(i%3===0)heroGlow(c,x,y,17,TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core+'99',fade);c.fillStyle=TEAM_ENERGY[f.team==='ally'?'ally':'enemy'].core;c.fillRect(x,y,2,2);}
}
function drawHeroHUD(){if(!S?.hero)return;const h=S.hero,u=h.boss;if(!u)return;const c=ctx,w=Math.min(330,W-100),x=(W-w)/2,y=H<600?H-28:88;
 c.save();c.fillStyle='#071723e8';c.fillRect(x-8,y-21,w+16,43);c.font='bold 11px system-ui';c.textAlign='left';c.fillStyle='#bbebff';c.fillText(nm('L_astra'),x,y-6);c.textAlign='right';c.font='10px monospace';c.fillStyle='#dceaf3';c.fillText(h.clearing?heroText('격파','DEFEATED'):Math.ceil(Math.max(0,u.hp))+' / '+u.hpMax,x+w,y-6);
 c.fillStyle='#183144';c.fillRect(x,y,w,7);c.fillStyle='#74c8ed';c.fillRect(x,y,w*Math.max(0,u.hp/u.hpMax),7);if(heroImmune(u)&&!h.clearing){c.strokeStyle='#eafbff';c.strokeRect(x,y,w,7);}
 if(h.trophies.length){const t=h.trophies[0],a=Math.atan2(t.y-S.py,t.x-S.px);c.fillStyle='#ffe0a0';c.textAlign='center';c.fillText(heroText('트로피에 다가가 회수하세요','Approach the trophy to collect'),W/2,H<600?y-30:y+33);c.save();c.translate(W/2+Math.cos(a)*45,H*.55+Math.sin(a)*45);c.rotate(a);c.beginPath();c.moveTo(9,0);c.lineTo(-5,-5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();}c.restore();
}

/* Cosmetic component detail, shared by the real game and every preview. */
for(const [key,rig] of Object.entries(V_RIG))if(rig.gait){const amount=key==='v_arc'?1.045:1.14;rig.gait={...rig.gait,hip:rig.gait.hip*amount,knee:rig.gait.knee*amount};}
function motion22Exhaust(c,x,y,length,width,time,blue=true){
 c.save();c.translate(x,y);c.globalCompositeOperation='lighter';
 const g=c.createLinearGradient(0,0,0,-length);g.addColorStop(0,blue?'#9deaffaa':'#ffdda08c');g.addColorStop(.25,blue?'#348eea90':'#ec995359');g.addColorStop(1,'#346ddb00');c.fillStyle=g;
 c.beginPath();c.moveTo(-width,0);c.bezierCurveTo(-width*.8,-length*.35,-width*.2,-length*.9,0,-length);c.bezierCurveTo(width*.3,-length*.8,width*.9,-length*.35,width,0);c.fill();
 c.fillStyle=blue?'#dcfaff':'#fff4d4';c.globalAlpha=.8;c.beginPath();c.moveTo(-width*.35,0);c.lineTo(0,-length*.46);c.lineTo(width*.35,0);c.fill();
 for(let i=0;i<3;i++){const p=(time*.0018+i/3)%1;c.globalAlpha=(1-p)*.52;c.strokeStyle=blue?'#97e5ff':'#ffd79a';c.lineWidth=.8;c.beginPath();c.ellipse(0,-length*p,width*(.68-.40*p),width*.18,0,0,6.283);c.stroke();}c.restore();
}
function drawVisualPropulsion(u,w,h){
 drawVisualPropulsionBase22(u,w,h);const rig=visualRig(u),v=visualState(u),speed=v.speed;
 if(u.gone||v.dead)return;
 const jets=u===S?[[.26,.21],[.74,.21]]:rig.jets||[];
 for(const [x,y]of jets)motion22Exhaust(ctx,(x-.5)*w,(y-.5)*h,w*(.08+speed*.35),Math.max(1.8,w*.035),VISUAL.time+x*300,u===S||rig.shot==='laser'||u.isLegend);
 if(rig.vents&&u!==S)for(const [x,y]of rig.vents)motion22Exhaust(ctx,(x-.5)*w,(y-.5)*h,3+speed*11,1.9,VISUAL.time+y*100,true);
}
function motion22Mechanics(u,w,h,c){
 const rig=visualRig(u),v=visualState(u);if(u.gone||v.dead)return;
 // Detail stays inside the actual rotor housings and lower mechanical contacts.
 for(const p of rig.parts){if(p.mode==='fan'&&p.ellipse){const [x,y,rx,ry]=p.ellipse;c.save();c.translate((x-.5)*w,(y-.5)*h);c.scale(1,ry*h/(rx*w));c.strokeStyle='#c6e8ef';c.lineWidth=.6;c.globalAlpha=.24+v.speed*.12;for(let i=0;i<3;i++){const a=VISUAL.time*.032+i*2.094;c.beginPath();c.arc(0,0,rx*w*.79,a,a+.85);c.stroke();}c.restore();}}
}
function motion22Point(u,x,y,w,h){const rig=visualRig(u),a=rig.artAngle?0:facingAngle(u),mirror=rig.artAngle&&u.type!=='v_revenant'?facingIsoMirror(u):1,px=(x-.5)*w*mirror,py=(y-.5)*h,[wx,wy]=visualXY(u);return {x:wx+px*Math.cos(a)-py*Math.sin(a),y:wy+px*Math.sin(a)+py*Math.cos(a)};}
function motion22Contact(u,v,moving,dt){
 if(!moving||v.dead||u.gone||u.vc&&u.vc.phase!=='move')return;const rig=visualRig(u);if(!['authored','walk','track','wheel'].includes(rig.kind))return;
 const spacing=['walk','authored'].includes(rig.kind)?(rig.stride||28)/2:12,index=Math.floor(v.travel/spacing);if(v.contact22===index)return;v.contact22=index;
 const [x,y]=visualXY(u),cam=S.cam||{x:0,y:0};if(x<cam.x-120||x>cam.x+W+120||y<cam.y-120||y>cam.y+H+120)return;
 const w=u.w||46,img=IMG[u.img]||IMG[u.type]||IMG.inf_w0,h=w*(img?img.height/img.width:1),walk=rig.kind==='walk'||rig.kind==='authored',parts=rig.parts.filter(p=>p.mode==='leg');
 let feet=walk?[[index%2?.31:.69,.86]]:[[.18,.91],[.82,.91]];
 if(walk&&parts.length){const p=parts[index%parts.length],end=Math.max(...p.poly.map(q=>q[1])),points=p.poly.filter(q=>q[1]>=end-.045);feet=[[points.reduce((n,p)=>n+p[0],0)/points.length,end]];}
 for(const foot of feet){const p=motion22Point(u,...foot,w,h);visualFX({k:'drive22',...p,a:facingState(u).heading,life:walk?330:400,r:Math.max(3,w*(walk?.085:.055)),c:'#c2b18f'});}
}
function visualFire(u,style,ang,count){if(!S)return;visualFireBase22(u,style,ang,count);const v=visualState(u),kind=visualStyle(u,style);for(const p of (v.muzzles||[]).slice(0,4))visualFX({k:'muzzle22',x:p.x,y:p.y,a:p.a,life:kind==='rifle'?100:190,r:kind==='rifle'?7:kind==='shell'?15:11,energy:kind==='laser',team:u===S||u.side==='ally'?'ally':'enemy',id:v.shotId});}
function drawVisualFX(cx,cy){drawVisualFXBase22(cx,cy);
 for(const f of VISUAL.fx){if(f.k!=='muzzle22'&&f.k!=='drive22')continue;const x=f.x-cx,y=f.y-cy;if(x<-70||x>W+70||y<-70||y>H+70)continue;const t=f.age/f.life,fade=1-t;ctx.save();ctx.translate(x,y);ctx.rotate(f.a);
  if(f.k==='drive22'){ctx.globalAlpha=fade*.34;ctx.strokeStyle='#615b52';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(-t*5,0,f.r*(.5+t),f.r*(.3+t*.5),0,0,6.283);ctx.stroke();drawVisualPuff(-t*8,0,f.r*(1+t*1.6),fade*.43,'dust',f.a);ctx.fillStyle='#cfc1a4';ctx.globalAlpha=fade*.42;for(let i=0;i<3;i++){const a=i*2.399+f.x;ctx.fillRect(-t*6+Math.cos(a)*f.r*t,Math.sin(a)*f.r*t,1,1);}}
  else{const p=f.energy?TEAM_ENERGY[f.team==='ally'?'ally':'enemy']:TEAM_SHOT[f.team==='ally'?'ally':'enemy'];cgMuzzle32(ctx,p,f.r,f.age,f.life,f.id);}
  ctx.restore();
 }
}
function drawVelcaUnit(u,sx,sy){
 if(!u.gone&&u.hp>0&&u.flying){const w=u.w,h=w*IMG[u.type].height/IMG[u.type].width,points=u.type==='v_phantom'?[[.78,.19],[.92,.35]]:[[.80,.25],[.94,.47]],v=visualState(u);ctx.save();ctx.translate(sx,sy);ctx.scale(facingIsoMirror(u),1);for(const [x,y]of points){ctx.save();ctx.translate((x-.5)*w,(y-.5)*h);ctx.rotate(.93);motion22Exhaust(ctx,0,0,w*(.1+v.speed*.27),w*.032,VISUAL.time+x*100,true);ctx.restore();}ctx.restore();}
 drawVelcaUnitBase22(u,sx,sy);if(u.gone||u.hp<=0)return;const q=u.vc,w=u.w;
 if(q.phase.endsWith('Charge')){const t=Math.max(0,Math.min(1,1-q.timer/Math.max(1,q.charge)));ctx.save();ctx.translate(sx,sy);heroChargeSparks(ctx,0,-w*.08,w*.32,t,VISUAL.time,'#3faaff80');ctx.restore();}
 if(q.recoil>0&&u.type!=='v_arc'){const amount=Math.min(1,q.recoil/110);for(const side of [-1,1]){const p=velcaMuzzle(u,q.aim,side);if(!p)continue;ctx.save();ctx.translate(sx+p.x-u.x,sy+p.y-u.y);ctx.rotate(q.aim);heroGlow(ctx,0,0,w*.10+4,'#8ddfffaa',amount);ctx.globalAlpha=amount*.75;ctx.fillStyle='#dcffff';ctx.fillRect(0,-.8,4+amount*6,1.6);ctx.restore();}}
}

/* ── 스프라이트 애니메이션 ────────────────────────────────────────────────
   유닛별로 걷기/사격 프레임 키 목록만 적어 주면 됩니다.
   여기에 없는 유닛은 예전처럼 정지 스프라이트 한 장을 씁니다.

   walk  : 이동 중 반복. 속도가 빠를수록 빨리 돌아갑니다.
   idle  : 멈춰 있을 때 (없으면 walk 의 첫 프레임)
   atk   : 사격 직후 잠깐 재생. 끝나면 walk/idle 로 돌아갑니다.  */
const ANIM={
  infantry:{
    walk:['inf_w0','inf_w1','inf_w2','inf_w3','inf_w4','inf_w5','inf_w6','inf_w7'],
    atk :['inf_a0','inf_a1','inf_a2','inf_a3'],
    walkMs:110,          // 프레임 한 장당 시간 (걸음 속도 기준)
    atkMs :70,           // 사격 프레임 간격
  },
};
/* 사격할 때 호출 — 사격 애니메이션을 재생시킵니다 */
function animFire(u){
  const A=ANIM[u.type]; if(!A||!A.atk) return;
  u.atkT=A.atk.length*A.atkMs;
}
/* 지금 그려야 할 프레임의 아트 키. 애니메이션이 없으면 null */
function animFrame(u, sp){
  const A=ANIM[u.type]; if(!A) return null;
  if(u.atkT>0 && A.atk){
    const i=Math.min(A.atk.length-1,Math.max(0,Math.floor((A.atk.length*A.atkMs-u.atkT)/A.atkMs)));
    return A.atk[i];
  }
  if(!A.walk) return null;
  const v=visualState(u);
  if(Math.max(sp,v.pivotSpeed||0)<.025) return A.idle?A.idle[0]:A.walk[0];
  return A.walk[Math.floor(v.phase/(Math.PI*2)*A.walk.length)%A.walk.length];
}
function motionOf(u){ return visualRig(u).kind; }
function moveAmt(u){ return visualState(u).speed; }
let FRAME_ID=0;
function drawMotionBack(u,w,h,kind,sp){ drawVisualPropulsion(u,w,h); }
function drawMotionFront(u,w,h,kind,sp){ drawVisualFront(u,w,h); }

function drawUnit(u, sx, sy){
  if(isHero(u)){drawHeroUnit(u,sx,sy);return;}
  if(isVelcarion(u)){drawVelcaUnit(u,sx,sy);return;}
  /* 애니메이션 프레임이 있으면 그것을, 없으면 기존 정지 스프라이트를 씁니다.
     아군·중립 색조와 냉동 스프라이트도 프레임별로 같이 만들어 둡니다. */
  const key=animFrame(u, moveAmt(u)) || u.img;
  let img = u.side==='ally' ? (TINT.ally[key]||IMG[key])
          : u.side==='neutral' ? (TINT.neutral[key]||IMG[key])
          : IMG[key];
  if(u.slow>0 && TINT.frost[key]) img=u.side==='ally'?(EVO_PALETTE.frost[key]||TINT.ally[key]):TINT.frost[key];   // 냉동 시 얼어붙은 스프라이트
  if(!img) return;
  const w=u.w, h=w*img.height/img.width;
  ctx.save(); ctx.translate(sx,sy);
  if(evoLegendArtKey(u.type)&&u.side==='ally'){evoDrawLegendAura(u,w,h);}else if(u.isLegend){ // Neutral encounter glow
    const pl=.5+Math.sin((u.t+u.bob*200)*.003)*.5;
    const col=u.side==='ally'?'110,190,255':'255,214,90';
    const gr=ctx.createRadialGradient(0,0,w*.18,0,0,w*(.78+pl*.14));
    gr.addColorStop(0,'rgba('+col+',0.30)');
    gr.addColorStop(.55,'rgba('+col+',0.13)');
    gr.addColorStop(1,'rgba('+col+',0)');
    ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(0,0,w*(.78+pl*.14),0,6.3); ctx.fill();
  }
  /* 진영 표식 — 헬기·우주선처럼 원본에 빨간 면적이 적은 유닛도
     아군/중립인지 한눈에 구분되도록 발밑에 링을 깔아둡니다 */
  if(u.side!=='enemy'){
    const col=u.side==='ally'?(evoLegendArtKey(u.type)?'244,216,96':'91,155,232'):'232,198,60';
    const pulse=.30+Math.sin((u.t+u.bob*200)*.004)*.10;
    ctx.fillStyle=`rgba(${col},${pulse})`;
    ctx.beginPath(); ctx.ellipse(0,h*.34,w*.46,w*.20,0,0,6.3); ctx.fill();
    ctx.strokeStyle=`rgba(${col},.75)`; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.ellipse(0,h*.34,w*.46,w*.20,0,0,6.3); ctx.stroke();
  }
  // 접지 그림자 (비행 유닛은 더 아래에 크게)
  ctx.fillStyle='rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(0,u.flying?h*.42:h*.30,w*.34,w*.13,0,0,6.3); ctx.fill();
  ctx.rotate(facingAngle(u));

  /* Stable chassis; movement and recoil affect only original-art components. */
  evoApplyHullMotion(u,w,h,ctx);
  drawVisualPropulsion(u,w,h);
  drawVisualSprite(u,img,w,h);
  drawVisualFront(u,w,h);
  ctx.restore();

  if(u.slow>0){                                  // 냉동 — 차가운 테두리 발광
    const f=.35+Math.abs(Math.sin(u.t*.006))*.3;
    ctx.strokeStyle=`rgba(190,235,255,${f})`; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(sx,sy,u.r+4,0,6.3); ctx.stroke();
  }
  if(u.poison>0){                                // 맹독 — 초록 반짝임
    const f=.35+Math.abs(Math.sin(u.t*.022))*.65;
    ctx.strokeStyle=`rgba(155,232,127,${f*.85})`; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.arc(sx,sy,u.r+3,0,6.3); ctx.stroke();
    ctx.fillStyle=`rgba(155,232,127,${f*.14})`;
    ctx.beginPath(); ctx.arc(sx,sy,u.r+3,0,6.3); ctx.fill();
  }

  if(u.cap>0){ const p=Math.min(1,u.cap/capFill());
    const col=u.isLegend?'#FFD75A':'#4FD2C2';
    /* 진행할수록 조여드는 이중 링 — 게이지만으로는 눈에 잘 안 띕니다 */
    const rr=u.r+16-p*11, tt=performance.now()*.006;
    ctx.save(); ctx.translate(sx,sy);
    ctx.globalAlpha=.30+p*.45; ctx.strokeStyle=col; ctx.lineWidth=1.6;
    ctx.setLineDash([5,6]); ctx.lineDashOffset=-tt*7;
    ctx.beginPath(); ctx.arc(0,0,rr,0,6.283); ctx.stroke();
    ctx.setLineDash([]);
    /* 채워지는 호 */
    ctx.globalAlpha=.85; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(0,0,rr-4,-1.5708,-1.5708+6.283*p); ctx.stroke();
    /* 네 귀퉁이 표식 */
    ctx.globalAlpha=.55+p*.4; ctx.lineWidth=1.6;
    for(let q=0;q<4;q++){
      const a=tt*.5+q*1.5708;
      ctx.beginPath();
      ctx.arc(0,0,rr+3,a-.16,a+.16); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha=1;
    ctx.fillStyle='#0009'; ctx.fillRect(sx-18,sy-h/2-11,36,3);
    ctx.fillStyle=col; ctx.fillRect(sx-18,sy-h/2-11,36*p,3); }
  if(u.resist>0){ ctx.strokeStyle='#D6453A'; ctx.globalAlpha=.55; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(sx,sy,u.r+6,0,6.3); ctx.stroke(); ctx.globalAlpha=1; }
  if(u.hp<u.hpMax){ ctx.fillStyle='#0007'; ctx.fillRect(sx-16,sy+h/2+3,32,2.5);
    ctx.fillStyle=u.side==='ally'?'#5B9BE8':u.side==='neutral'?'#E8C63C':'#D6453A';
    ctx.fillRect(sx-16,sy+h/2+3,32*(u.hp/u.hpMax),2.5); }
  if(u.side==='neutral' && u.life>0 && !u.tutorial && !u.relRecruit){          // 이탈까지 남은 시간
    const p=u.life/TUNE.legendLifeMs;
    ctx.fillStyle='#E8C63C'; ctx.globalAlpha=.7;
    ctx.fillRect(sx-16,sy+h/2+7,32*p,1.5); ctx.globalAlpha=1; }
}

function draw(){
  ctx.setTransform(R,0,0,R,0,0);
  ctx.save();
  if(S&&S.shake>0&&!META.basicReduceMotion){const m=S.shake/300*4; ctx.translate((cgShake(FRAME_ID)-.5)*m,(cgShake(FRAME_ID+71)-.5)*m);}
  drawBG();
  if(S&&mode!=='menu'){ctx.fillStyle='rgba(9,20,18,.24)';ctx.fillRect(0,0,W,H);}
  if(!S||mode==='load'||mode==='title'||mode==='menu'){ ctx.restore(); return; }
  const cx=S.cam.x, cy=S.cam.y;

  /* 바닥 광고 — 지형보다 아래, 유닛보다 아래에 깔립니다 (통과 가능) */
  for(const f of S.floorAds||[]){
    if(f.x<cx-f.w||f.x>cx+W+f.w||f.y<cy-f.h||f.y>cy+H+f.h) continue;
    const img=IMG.ad_floor; if(!img) continue;
    ctx.globalAlpha=.92;
    ctx.drawImage(img, f.x-cx-f.w/2, f.y-cy-f.h/2, f.w, f.h);
    ctx.globalAlpha=1;
    drawAdText(f.x-cx-f.w/2, f.y-cy-f.h/2, f.w, f.h, AD_PANEL.ad_floor, .8);
  }

  drawVisualDecals(cx,cy); drawHeroGround(cx,cy);
  /* 지형 구조물 — 화면 안에 있는 것만 */
  for(const p of S.props){
    if(p.x<cx-p.w||p.x>cx+W+p.w||p.y<cy-p.h||p.y>cy+H+p.h) continue;
    const img=IMG[p.key]; if(!img) continue;
    ctx.fillStyle='rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(p.x-cx,p.y-cy+p.ry*.55,p.rx*1.05,p.ry*.55,0,0,6.3); ctx.fill();
    ctx.drawImage(img, p.x-cx-p.w/2, p.y-cy-p.h/2, p.w, p.h);
    if(p.key==='ad_board')
      drawAdText(p.x-cx-p.w/2, p.y-cy-p.h/2, p.w, p.h, AD_PANEL.ad_board, 1);
  }

  /* 적 기지 + 포탑 4대 */
  if(S.base){
    const b=S.base, img=IMG[b.key];
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(b.x-cx,b.y-cy+b.ry*.6,b.rx*1.1,b.ry*.6,0,0,6.3); ctx.fill();
    if(img) ctx.drawImage(img, b.x-cx-b.w/2, b.y-cy-b.h/2, b.w, b.h);
    if(b.open){                                    // 성문이 열리면 붉게 빛납니다
      const g2=ctx.createRadialGradient(b.x-cx,b.y-cy+8,2,b.x-cx,b.y-cy+8,34);
      g2.addColorStop(0,'#FF6B4Acc'); g2.addColorStop(1,'#FF6B4A00');
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(b.x-cx,b.y-cy+8,34,0,6.3); ctx.fill();
    }
    cgDrawTurrets(cx,cy);
  }

  /* Capture radar: render-only; the original cone test stays unchanged. */
  drawCaptureWaves(cx,cy);

  /* 아이템 — 아이콘 주변에 아이템 색으로 맥동하는 빛 */
  for(const it of S.items){
    const d=ITEMS[it.k], img=IMG[d.img];
    const X=it.x-cx, Y=it.y-cy+Math.sin(it.t*.004)*2;
    const pulse=.62+Math.sin(it.t*.005)*.38;
    const rad=ITEM_SZ*(.85+pulse*.55);
    const g=ctx.createRadialGradient(X,Y,ITEM_SZ*.28,X,Y,rad);
    g.addColorStop(0,d.c+'99'); g.addColorStop(.55,d.c+'44'); g.addColorStop(1,d.c+'00');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X,Y,rad,0,6.3); ctx.fill();
    const sz=ITEM_SZ*(1+Math.sin(it.t*.006)*.05);
    if(img){const iw=sz*img.width/Math.max(img.width,img.height),ih=sz*img.height/Math.max(img.width,img.height);ctx.drawImage(img,X-iw/2,Y-ih/2,iw,ih);}
    else { ctx.fillStyle=d.c; ctx.fillRect(X-8,Y-8,16,16); }
  }

  /* 유닛 — 화면 밖은 건너뜁니다 */
  const vis=u=>u.x>cx-80&&u.x<cx+W+80&&u.y>cy-90&&u.y<cy+H+90;
  drawVelcaTelegraphs(cx,cy);
  drawHazards(cx,cy);
  drawVisualWrecks(cx,cy);
  /* 볼트 오브 — 가는 조준선을 보여 준 뒤 굵은 섬광 한 줄기가 번쩍이고 사라집니다 */
  for(const e of S.enemies){
    if(e.gone) continue;
    const X=e.x-cx, Y=e.y-cy;
    if(e.charge>0){                                   // 조준선
      const L=430, a=1-e.charge/1000;
      const ex=X+Math.cos(e.beamAng)*L, ey=Y+Math.sin(e.beamAng)*L;
      ctx.globalAlpha=.25+a*.45;
      ctx.strokeStyle='#9FC8FF'; ctx.lineWidth=1;
      ctx.setLineDash([6,7]); ctx.lineDashOffset=-performance.now()*.05;
      ctx.beginPath(); ctx.moveTo(X,Y); ctx.lineTo(ex,ey); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha=.5+a*.5;                        // 발사구 충전 발광
      const gg=ctx.createRadialGradient(X,Y,0,X,Y,10+a*10);
      gg.addColorStop(0,'rgba(220,240,255,.9)'); gg.addColorStop(1,'rgba(120,170,255,0)');
      ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(X,Y,10+a*10,0,6.283); ctx.fill();
      ctx.globalAlpha=1;
    }
    if(e.flash>0){
      drawVisualLightning(X,Y,e.flashAng,430,e.flash/150,Math.floor((150-e.flash)/30),TEAM_ENERGY.enemy);
    }
  }

  for(const e of S.enemies) if(vis(e) && !e.gone) drawUnit(e,e.x-cx,e.y-cy);
  /* 연막 안에서는 주변만 겨우 보입니다 */
  if(S.blind>0){
    const px=S.px-cx, py=S.py-cy;
    const g=ctx.createRadialGradient(px,py,60,px,py,230);
    g.addColorStop(0,'rgba(26,28,30,0)');
    g.addColorStop(.45,'rgba(26,28,30,.72)');
    g.addColorStop(1,'rgba(22,24,26,.96)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  for(const a of S.allies)  if(vis(a)&&!a.gone) drawUnit(a,a.x-cx,a.y-cy);
  drawPlayer(cx,cy);
  drawCaptureEmitter(cx,cy);

  /* Typed projectile presentation; logical position, kind, velocity and hitbox unchanged. */
  for(const b of S.bullets){
    // Legacy RNG consumption now runs once per simulation tick.
    drawVisualBullet(b,cx,cy,false);
  }
  for(const b of S.ebullets) drawVisualBullet(b,cx,cy,true);

  /* 레이저 */
  for(const L of S.lasers){
    const al=Math.min(1,L.t/L.life*1.4);
    ctx.save(); ctx.globalAlpha=al;
    if(L.kind==='beam'){
      ctx.translate(L.x-cx,L.y-cy); ctx.rotate(L.a);
      const g5=ctx.createLinearGradient(0,-L.width,0,L.width);
      g5.addColorStop(0,TEAM_ENERGY.ally.color+'00'); g5.addColorStop(.5,TEAM_ENERGY.ally.color+'cc'); g5.addColorStop(1,TEAM_ENERGY.ally.color+'00');
      ctx.globalAlpha=al*.55; ctx.fillStyle=g5; ctx.fillRect(0,-L.width,L.len,L.width*2); ctx.globalAlpha=al;
      ctx.fillStyle=TEAM_ENERGY.ally.color; ctx.fillRect(0,-L.width*.25,L.len,L.width*.5);
      ctx.fillStyle='#F4FBFF'; ctx.fillRect(0,-L.width*.11,L.len,L.width*.22);
    }else{
      ctx.strokeStyle=TEAM_ENERGY.ally.color; ctx.lineWidth=L.width*2; ctx.globalAlpha=al*.35;
      ctx.beginPath(); ctx.moveTo(L.x1-cx,L.y1-cy); ctx.lineTo(L.x2-cx,L.y2-cy); ctx.stroke();
      ctx.globalAlpha=al; ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=L.width*.5;
      ctx.beginPath(); ctx.moveTo(L.x1-cx,L.y1-cy); ctx.lineTo(L.x2-cx,L.y2-cy); ctx.stroke();
    }
    ctx.restore();
  }

  /* 이펙트 */
  for(const f of S.fx){
    const al=f.t/f.life, X=f.x-cx, Y=f.y-cy;
    if(f.k==='ring'){ ctx.strokeStyle=f.c; ctx.globalAlpha=al; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(X,Y,f.r,0,6.3); ctx.stroke(); ctx.globalAlpha=1; }
    else if(f.k==='shock'){                     // 두껍게 퍼지며 얇아지는 충격파
      ctx.globalAlpha=al*.9; ctx.strokeStyle=f.c; ctx.lineWidth=Math.max(.6,7*al);
      ctx.beginPath(); ctx.arc(X,Y,Math.max(1,f.r),0,6.3); ctx.stroke();
      ctx.globalAlpha=al*.35; ctx.lineWidth=Math.max(.4,2.2*al);
      ctx.beginPath(); ctx.arc(X,Y,Math.max(1,f.r*1.14),0,6.3); ctx.stroke();
      ctx.globalAlpha=1; }
    else if(f.k==='halo'){                      // 비스듬히 퍼지는 타원 고리
      ctx.save(); ctx.translate(X,Y); ctx.rotate(f.a||0);
      ctx.globalAlpha=al*.7; ctx.strokeStyle=f.c; ctx.lineWidth=Math.max(.5,2.4*al);
      ctx.beginPath(); ctx.ellipse(0,0,Math.max(1,f.r),Math.max(1,f.r*.34),0,0,6.3); ctx.stroke();
      ctx.restore(); ctx.globalAlpha=1; }
    else if(f.k==='flash'){                     // 순간 섬광
      const gf=ctx.createRadialGradient(X,Y,0,X,Y,Math.max(2,f.r*(1.15-al*.4)));
      gf.addColorStop(0,f.c+'dd'); gf.addColorStop(.4,f.c+'55'); gf.addColorStop(1,f.c+'00');
      ctx.globalAlpha=al*al; ctx.fillStyle=gf;
      ctx.beginPath(); ctx.arc(X,Y,Math.max(2,f.r*(1.15-al*.4)),0,6.3); ctx.fill();
      ctx.globalAlpha=1; }
    else if(f.k==='draw'){                      // 견인 입자 — 진행 방향으로 늘어난 꼬리
      const tx=(S?S.px:f.ox)-cx, ty=(S?S.py:f.oy)-cy;
      const a=Math.atan2(ty-Y,tx-X), len=5+(1-al)*9;
      ctx.globalAlpha=Math.min(1,al*1.5); ctx.strokeStyle=f.c; ctx.lineWidth=1.7;
      ctx.beginPath(); ctx.moveTo(X,Y); ctx.lineTo(X-Math.cos(a)*len,Y-Math.sin(a)*len); ctx.stroke();
      ctx.globalAlpha=1; }
    else if(f.k==='burst'){                        // 화염 확산 — 채워진 원이 퍼짐
      const g2=ctx.createRadialGradient(X,Y,f.r*.25,X,Y,Math.max(1,f.r));
      g2.addColorStop(0,f.c+'00'); g2.addColorStop(.55,f.c+'77'); g2.addColorStop(1,f.c+'00');
      ctx.globalAlpha=al; ctx.fillStyle=g2;
      ctx.beginPath(); ctx.arc(X,Y,Math.max(1,f.r),0,6.3); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.k==='ember'){ ctx.globalAlpha=al; ctx.fillStyle=f.c;
      ctx.beginPath(); ctx.arc(X,Y,1.2+al*1.8,0,6.3); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.k==='spark'){ ctx.globalAlpha=al*.95; ctx.fillStyle=f.c;
      const r=1+al*1.6; ctx.fillRect(X-r,Y-r*.4,r*2,r*.8); ctx.fillRect(X-r*.4,Y-r,r*.8,r*2);
      ctx.globalAlpha=1; }
    else if(f.k==='muzzle'){ /* Original FX lifetime retained; physical muzzle is drawn by drawVisualFX. */ }

    else if(f.k==='smoke'){ ctx.globalAlpha=f._visualSkip?0:al*.28; ctx.fillStyle=f.c;
      ctx.beginPath(); ctx.arc(X,Y,f.r,0,6.3); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.k==='snow'){ ctx.globalAlpha=al*.85; ctx.fillStyle=f.c;
      ctx.beginPath(); ctx.arc(X,Y,.9+al*1.3,0,6.3); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.k==='part'){ drawVisualShard(f,X,Y,al); }
    else if(f.k==='txt'){ ctx.fillStyle=f.c; ctx.globalAlpha=Math.min(1,al*1.6);
      ctx.font='bold 13px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(f.s,X,Y); ctx.globalAlpha=1; }
  }
  drawVisualFX(cx,cy);
  drawVelcaProjectiles(cx,cy);
  drawVelcaFX(cx,cy); drawHeroCombat(cx,cy);
  ctx.restore();
  if(S.warn>0) drawWarning();
  drawHUD(); drawHeroHUD();
  drawMinimap();
  drawStatPanel();
  basicSyncHUD(); basicDrawLessonTarget();
  drawSticks();
}

/* 우측 상단 레이더 — 점만 찍고 색으로 구분합니다.
   적 빨강 / 아군 파랑 / 아이템 초록 / 레전드(중립) 노랑 / 적 포탑 주황 */
/* ========================= HUD — 금속 프레임 (컴팩트) ==================== */
const MAP={x:6, y:56, size:88, radar:74, range:920};
const PANEL_ALPHA=0.72;          // 레이더/능력치 패널 반투명도

function bolt(x,y,r){ r=r||2;
  ctx.fillStyle='#8d9884'; ctx.beginPath(); ctx.arc(x,y,r,0,6.3); ctx.fill();
  ctx.fillStyle='#39412f'; ctx.beginPath(); ctx.arc(x,y,r*.42,0,6.3); ctx.fill(); }

function frame(x,y,w,h,bolts){
  const g=ctx.createLinearGradient(0,y,0,y+h);
  g.addColorStop(0,'#1c211a'); g.addColorStop(.45,'#0d110c'); g.addColorStop(1,'#161a14');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='#5c6651'; ctx.lineWidth=1.2; ctx.strokeRect(x+.6,y+.6,w-1.2,h-1.2);
  ctx.strokeStyle='#2b3227'; ctx.lineWidth=1;   ctx.strokeRect(x+3.5,y+3.5,w-7,h-7);
  ctx.strokeStyle='#7e8a72'; ctx.lineWidth=1.5;
  const L=10;
  [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(function(c){
    var bx=c[0],by=c[1],sx=c[2],sy=c[3];
    ctx.beginPath(); ctx.moveTo(bx+sx*2,by+sy*L); ctx.lineTo(bx+sx*2,by+sy*2);
    ctx.lineTo(bx+sx*L,by+sy*2); ctx.stroke(); });
  if(bolts!==false){ const b=7; bolt(x+b,y+b); bolt(x+w-b,y+b); bolt(x+b,y+h-b); bolt(x+w-b,y+h-b); }
}
function bezel(x,y,w,h){
  ctx.fillStyle='#050704'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='#3b4435'; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}

/* ------------------------------ 상단 바 --------------------------------- */
function drawHUD(){
  ctx.textBaseline='middle';
  const BW=W-12;
  frame(6,4,BW,46);

  const y1=17, mh=maxHp(), r=Math.max(0,S.hp)/mh;
  const xLight=W-44, xScore=xLight-138, xBar=106, barW=xScore-10-xBar;
  ctx.font='9px ui-monospace,monospace'; ctx.textAlign='left';
  ctx.fillStyle='#C7D2BC'; ctx.fillText(T('hp'),14,y1);
  bezel(38,y1-8,64,16);
  ctx.font='bold 10px ui-monospace,monospace'; ctx.textAlign='center';
  ctx.fillStyle = r>.5?'#9BE87F' : r>.25?'#E8B33C' : '#FF7A6A';
  ctx.fillText(Math.ceil(S.hp)+' / '+mh,70,y1);

  bezel(xBar,y1-8,barW,16);
  const bg=ctx.createLinearGradient(xBar+4,0,xBar+barW-4,0);
  bg.addColorStop(0,'#4FA85C'); bg.addColorStop(1,'#A8E87F');
  ctx.fillStyle= r>.25?bg:'#D6453A'; ctx.fillRect(xBar+4,y1-5,(barW-8)*r,10);
  ctx.fillStyle='rgba(0,0,0,.35)';
  for(let i=1;i<8;i++) ctx.fillRect(xBar+4+i*(barW-8)/8,y1-5,1,10);
  if(S.shield){ ctx.strokeStyle='#9BE87F'; ctx.lineWidth=1.2; ctx.strokeRect(xBar-1.5,y1-10.5,barW+3,21); }

  bezel(xScore,y1-8,130,16);
  ctx.font='bold 11px ui-monospace,monospace'; ctx.textAlign='center';
  ctx.fillStyle='#E8B33C'; ctx.fillText(String(S.score).padStart(7,'0'),xScore+65,y1);

  bezel(xLight,y1-8,30,16);
  for(let i=0;i<3;i++){
    const on = i===0 ? S.hp>0 : i===1 ? S.allies.length>0 : S.beam;
    ctx.fillStyle = on?'#7FE87F':'#243020';
    ctx.beginPath(); ctx.arc(xLight+8+i*8,y1,2.4,0,6.3); ctx.fill();
  }

  const y2=36;
  bezel(14,y2-7,84,15);
  ctx.font='9px ui-monospace,monospace'; ctx.textAlign='left';
  ctx.fillStyle='#7FB8FF'; ctx.fillText(rosterCount(false)+'/'+allyCap(),19,y2);
  ctx.fillStyle='#4a5445'; ctx.fillText('·',48,y2);
  ctx.fillStyle='#FFD75A'; ctx.fillText('L '+rosterCount(true)+'/'+allyCap(),56,y2);

  const chips=[];
  if(S.itemDmg)  chips.push([T('atk'),'+'+S.itemDmg,'#E8B24A']);
  if(S.itemRate) chips.push([T('rate'),'+'+S.itemRate,'#E8A93C']);
  if(S.ways>1)   chips.push([T('ways'),''+S.ways,'#E8B33C']);
  chips.push([T('spd'),S.spd+'/'+TUNE.spdStackMax,'#E8934A']);
  if(S.element)  chips.push([ELEM_INFO[S.element].name,'Lv'+elemLv(S.element),ELEM_INFO[S.element].c]);
  let cx2=106;
  ctx.font='9px ui-monospace,monospace'; ctx.textAlign='left';
  chips.forEach(function(c,i){
    if(cx2>W-192) return;
    if(i){ ctx.fillStyle='#4a5445'; ctx.fillText('·',cx2,y2); cx2+=6; }
    ctx.fillStyle='#8E9A86'; ctx.fillText(c[0],cx2,y2); cx2+=ctx.measureText(c[0]).width+3;
    ctx.fillStyle=c[2];      ctx.fillText(c[1],cx2,y2); cx2+=ctx.measureText(c[1]).width+6;
  });

  const xStage=W-180;
  ctx.font='bold 10px ui-monospace,monospace'; ctx.textAlign='left';
  ctx.fillStyle=S.phase==='boss'?'#FF7A6A':'#E8B33C';
  ctx.fillText(S.story?('STAGE '+S.story.id):('STAGE '+S.stage),xStage,y2);
  ctx.fillStyle='#5c6651'; ctx.fillText('|',xStage+62,y2);
  ctx.font='9px ui-monospace,monospace';
  ctx.fillStyle='#C7D2BC'; ctx.fillText(nm(S.theme.id),xStage+72,y2);
}

/* 광고면에 문구를 그립니다. 아직 광고주가 없어 자체 문구를 띄웁니다. */
function drawAdText(x,y,w,h,pr,scale){
  const px=x+w*pr.l, py=y+h*pr.t, pw=w*pr.w, ph=h*pr.h;
  if(pw<40) return;
  ctx.save();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const cxp=px+pw/2, cyp=py+ph/2;
  const s1=Math.max(7, pw*0.108*scale), s2=Math.max(5, pw*0.052*scale);
  const pulse=.72+Math.abs(Math.sin(performance.now()*.0013))*.28;
  ctx.fillStyle='rgba(232,179,60,'+(0.16*pulse)+')';
  ctx.fillRect(px,py,pw,ph);
  ctx.font='bold '+s1+'px ui-monospace,monospace';
  ctx.fillStyle='rgba(255,220,140,'+(0.92*pulse)+')';
  ctx.fillText('FIELD OF IMMORTALS', cxp, cyp-ph*0.13);
  ctx.font=s2+'px ui-monospace,monospace';
  ctx.fillStyle='rgba(200,210,190,.72)';
  ctx.fillText(T('adSpace'), cxp, cyp+ph*0.20);
  ctx.strokeStyle='rgba(232,179,60,'+(0.28*pulse)+')'; ctx.lineWidth=1;
  ctx.strokeRect(px+1,py+1,pw-2,ph-2);
  ctx.restore();
}

/* 보스 출현 경고 배너 */
function drawWarning(){
  const t=S.warn, blink=Math.floor(t/180)%2===0;
  const yc=H*0.42, hh=52;
  ctx.save();
  ctx.globalAlpha=Math.min(1,t/500);
  ctx.fillStyle='rgba(10,4,4,.82)'; ctx.fillRect(0,yc-hh/2,W,hh);
  ctx.fillStyle=blink?'#D6453A':'#7a2620';
  ctx.fillRect(0,yc-hh/2,W,3); ctx.fillRect(0,yc+hh/2-3,W,3);
  ctx.save(); ctx.beginPath(); ctx.rect(0,yc-hh/2,W,hh); ctx.clip();
  ctx.strokeStyle='rgba(214,69,58,.16)'; ctx.lineWidth=9;
  const off=(performance.now()*.06)%36;
  for(let x=-hh; x<W+hh; x+=36){ ctx.beginPath();
    ctx.moveTo(x+off,yc+hh/2); ctx.lineTo(x+off+hh,yc-hh/2); ctx.stroke(); }
  ctx.restore();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 20px ui-monospace,monospace';
  ctx.fillStyle=blink?'#FF6B5A':'#E8B33C';
  ctx.fillText('W A R N I N G',W/2,yc-11);
  ctx.font='12px ui-monospace,monospace'; ctx.fillStyle='#E6E2D3';
  ctx.fillText(S.warnText||T('warnBase'),W/2,yc+12);
  ctx.restore();
}

/* ------------------------------ 레이더 ---------------------------------- */
function drawMinimap(){
  const X=MAP.x, Y=MAP.y, SZ=MAP.size, RD=MAP.radar;
  ctx.globalAlpha=PANEL_ALPHA;                 // 전투 시야를 덜 가리도록 반투명
  frame(X,Y,SZ,SZ+18);
  const rx=X+(SZ-RD)/2, ry=Y+6;
  ctx.fillStyle='#07130A'; ctx.fillRect(rx,ry,RD,RD);
  ctx.strokeStyle='#2b3a2b'; ctx.lineWidth=1; ctx.strokeRect(rx+.5,ry+.5,RD-1,RD-1);
  const cxm=rx+RD/2, cym=ry+RD/2, k=(RD/2)/MAP.range;

  ctx.save(); ctx.beginPath(); ctx.rect(rx,ry,RD,RD); ctx.clip();
  ctx.strokeStyle='rgba(90,150,95,.22)'; ctx.setLineDash([3,4]);
  for(let i=1;i<4;i++){
    ctx.beginPath(); ctx.moveTo(rx,ry+RD*i/4); ctx.lineTo(rx+RD,ry+RD*i/4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx+RD*i/4,ry); ctx.lineTo(rx+RD*i/4,ry+RD); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle='rgba(120,200,130,.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(rx,cym); ctx.lineTo(rx+RD,cym);
  ctx.moveTo(cxm,ry); ctx.lineTo(cxm,ry+RD); ctx.stroke();
  const sweep=performance.now()*.0018;
  ctx.strokeStyle='rgba(127,232,160,.28)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(cxm,cym);
  ctx.lineTo(cxm+Math.cos(sweep)*RD*.75, cym+Math.sin(sweep)*RD*.75); ctx.stroke();

  const dot=function(x,y,c,r){ ctx.fillStyle=c;
    ctx.fillRect(cxm+(x-S.px)*k-r, cym+(y-S.py)*k-r, r*2, r*2); };
  for(const p of S.props){                      // 지형은 어둡게 깔아둡니다
    ctx.fillStyle='rgba(150,160,140,.30)';
    ctx.beginPath();
    ctx.ellipse(cxm+(p.x-S.px)*k, cym+(p.y-S.py)*k, Math.max(1.5,p.rx*k), Math.max(1,p.ry*k),0,0,6.3);
    ctx.fill();
  }
  if(S.base){ ctx.fillStyle='rgba(255,138,58,.25)';
    ctx.beginPath(); ctx.arc(cxm+(S.base.x-S.px)*k, cym+(S.base.y-S.py)*k, 7,0,6.3); ctx.fill(); }
  for(const t of S.turrets) if(t.alive) dot(t.x,t.y,'#FF8A3A',2.6);
  for(const it of S.items)  dot(it.x,it.y,'#5FE05F',2.2);
  for(const a of S.allies)  dot(a.x,a.y,'#4A90E8',2.4);
  for(const e of S.enemies) e.side==='neutral' ? dot(e.x,e.y,'#FFD75A',e.isLegend?4:2.6)
                                               : dot(e.x,e.y,'#E83C3C',2.2);
  var left=S.turrets.filter(function(t){return t.alive;}).length;
  var bd=0;
  if(S.base){                                   // 기지 방향 화살표
    bd=Math.hypot(S.base.x-S.px,S.base.y-S.py);
    const ba=Math.atan2(S.base.y-S.py,S.base.x-S.px);
    const rr=Math.min(RD/2-7, bd*k);
    ctx.save(); ctx.translate(cxm+Math.cos(ba)*rr, cym+Math.sin(ba)*rr); ctx.rotate(ba+Math.PI/2);
    ctx.fillStyle=left?'#E8B33C':'#4FD2C2';
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,5.5); ctx.lineTo(0,2.4); ctx.lineTo(-5,5.5);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.restore();

  ctx.fillStyle='#E6E2D3'; ctx.fillRect(cxm-1.6,cym-1.6,3.2,3.2);
  ctx.strokeStyle='rgba(232,226,211,.55)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(cxm,cym,5,0,6.3); ctx.stroke();

  const by2=Y+SZ+1;
  bezel(X+11,by2,SZ-22,13);
  ctx.font='8px ui-monospace,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#8E9A86'; ctx.fillText('SCAN',X+SZ/2-7,by2+7);
  const bl=.4+Math.abs(Math.sin(performance.now()*.004))*.6;
  ctx.fillStyle='rgba(95,224,95,'+bl+')';
  ctx.beginPath(); ctx.arc(X+SZ/2+13,by2+7,2.4,0,6.3); ctx.fill();
  ctx.globalAlpha=1;
  ctx.font='8px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillStyle=S.phase==='hunt'?'#8E9A86':'#E8B33C';
  ctx.fillText(S.phase==='hunt'
    ? T('sweep')+' '+Math.min(S.killed,S.killNeed)+' / '+S.killNeed
    : S.phase==='heroBoss'||S.phase==='heroLoot'?heroText(S.hero?.clearing?'격파 · 트로피 회수':'아스트라 세이버','ASTRA SABER') : T('base')+' '+Math.round(bd)+'m · '+T('turret')+' '+left+'/4', X+2, Y+SZ+17);
}

/* --------------------- 우측: 이번 판에 쌓은 것들 ------------------------ */
function drawStatPanel(){
  const PW=110, PX=W-PW-6, PY=MAP.y;
  const ups=Object.keys(S.upsTaken), its=Object.keys(S.itemsTaken);
  const irows=Math.max(1,Math.ceil(its.length/4));
  const h=13 + Math.max(1,ups.length)*11 + 10 + 12 + irows*17 + 8;
  ctx.globalAlpha=PANEL_ALPHA;
  frame(PX,PY,PW,h);
  ctx.textBaseline='middle'; ctx.textAlign='left';
  let y=PY+13;

  ctx.fillStyle='#7FE87F'; ctx.beginPath(); ctx.arc(PX+12,y,2.4,0,6.3); ctx.fill();
  ctx.font='9px ui-monospace,monospace'; ctx.fillStyle='#C7D2BC';
  ctx.fillText(T('stageUp'),PX+19,y);
  ctx.strokeStyle='rgba(127,232,127,.3)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX+10,y+7); ctx.lineTo(PX+PW-10,y+7); ctx.stroke();
  y+=17;
  ctx.font='9px ui-monospace,monospace';
  if(!ups.length){ ctx.fillStyle='#465043'; ctx.fillText(T('none'),PX+19,y); y+=11; }
  for(const id of ups){
    const u=UPGRADES.find(function(x){return x.id===id;}); if(!u) continue;
    ctx.fillStyle='#E8B33C'; ctx.fillText(u.nm,PX+13,y);
    if(u.max>1){ ctx.textAlign='right'; ctx.fillStyle='#8E9A86';
      ctx.fillText('Lv'+u.lv(S),PX+PW-12,y); ctx.textAlign='left'; }
    y+=11;
  }
  y+=7;
  ctx.fillStyle='#E8B33C'; ctx.fillRect(PX+10,y-2.5,5,5);
  ctx.font='9px ui-monospace,monospace'; ctx.fillStyle='#C7D2BC';
  ctx.fillText(T('gotItems'),PX+19,y);
  y+=12;
  if(!its.length){ ctx.fillStyle='#465043'; ctx.fillText(T('none'),PX+19,y+3); ctx.globalAlpha=1; return; }
  its.forEach(function(k,i){
    const ix=PX+11+(i%4)*24, iy=y+((i/4)|0)*17;
    const img=IMG[ITEMS[k].img];
    if(img) ctx.drawImage(img,ix,iy,15,15);
    const n=S.itemsTaken[k];
    if(n>1){ ctx.font='bold 8px ui-monospace,monospace';
      ctx.fillStyle='#000b'; ctx.fillRect(ix+9,iy+9,10,8);
      ctx.fillStyle='#E6E2D3'; ctx.fillText(n,ix+11,iy+13.5); }
  });
  ctx.globalAlpha=1;
}

/* 모바일 조작 스틱 — 손을 대지 않았을 땐 기본 위치에 흐리게, 대면 그 자리에 생깁니다 */
function drawSticks(){
  if(!isTouch || mode!=='play') return;
  const defs=[[sticks.move,HOME.move,'232,179,60',basicText('이동','MOVE')],
              [sticks.aim ,HOME.aim ,'79,210,194',basicText('포획','CAPTURE')]];
  for(const [s,home,col,label] of defs){
    const ox=s.on?s.ox:home.x, oy=s.on?s.oy:home.y;
    ctx.globalAlpha=s.on?.65:.26;
    ctx.strokeStyle=`rgba(${col},1)`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(ox,oy,STICK.r,0,6.3); ctx.stroke();
    const v=stickVec(s);
    ctx.fillStyle=`rgba(${col},${s.on?.55:.2})`;
    ctx.beginPath(); ctx.arc(ox+v.x*v.len*STICK.r, oy+v.y*v.len*STICK.r, 23/.76,0,6.3); ctx.fill();
    if(!s.on){ ctx.fillStyle=`rgba(${col},.95)`; ctx.font='10px ui-monospace,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,ox,oy); }
    ctx.globalAlpha=1;
  }
}

function drawPlayer(cx,cy){
  const img=IMG.main; const sx=S.px-cx, sy=S.py-cy;
  if(S.invuln>0 && Math.floor(performance.now()/90)%2===0) ctx.globalAlpha=.35;
  if(img){
    const w=ILL_PLAYER_W, h=w*img.height/img.width;
    ctx.save(); ctx.translate(sx,sy);
    const pg=.5+Math.sin(performance.now()*.0022)*.5;      // 메인 캐릭터 발광
    const gp=ctx.createRadialGradient(0,0,w*.2,0,0,w*(.85+pg*.15));
    gp.addColorStop(0,'rgba(110,197,255,0.20)');
    gp.addColorStop(.6,'rgba(65,150,245,0.08)');
    gp.addColorStop(1,'rgba(65,150,245,0)');
    ctx.fillStyle=gp; ctx.beginPath(); ctx.arc(0,0,w*(.85+pg*.15),0,6.3); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0,h*.44,w*.36,w*.14,0,0,6.3); ctx.fill();
    ctx.rotate(facingAngle(S));
    if(!visualState(S).dead){
      evoApplyHullMotion(S,w,h,ctx);
      drawVisualPropulsion(S,w,h);
      drawVisualSprite(S,img,w,h);
      drawVisualFront(S,w,h);
    }
    ctx.restore();
  }
  ctx.globalAlpha=1;
  if(S.shield){ ctx.strokeStyle='#9BE87F'; ctx.lineWidth=1.8;
    ctx.globalAlpha=.6+Math.sin(performance.now()*.006)*.2;
    ctx.beginPath(); ctx.arc(sx,sy,30,0,6.3); ctx.stroke(); ctx.globalAlpha=1; }
}

/* ============================ 화면 전환 ================================== */
const show=id=>{document.querySelectorAll('.layer').forEach(l=>l.classList.remove('on')); if(id)$(id).classList.add('on');};
function openUpgrade(){
  if(heroBossStage()&&(!S.hero?.bossDefeated||S.hero.trophies.length))return;
  if(S.rewardSettled)return; S.rewardSettled=true;
  cgRecordRun(true);
  cgGameplayStop();
  if(S.tutorial){ META.tutorialDone=true; S.tutorial=false; metaSave(); $('tutorial').classList.remove('on'); }
  storyBeforeClear();
  S.clearMs = performance.now()-S.stageStart;
  /* 스토리라면 임무를 판정합니다 */
  S.missionRes=[]; S.missionCard=null; S.chapterReward=null; S.velcaCoreAward=false;
  if(S.story){settleStoryReward();S.velcaCoreAward=grantVelcaCore();storyAfterClear();}
  /* 이 스테이지에서 확보한 레전드를 여기서 확정 지급합니다 */
  S.claimed=[];
  // Field recruitment and trophies never mint promotion cards.
  /* 크레딧은 넉넉하게, 아스트라늄은 아주 드물게 */
  pgSettleBattle();
  if(S.claimed.length) META.astranium += 5*S.claimed.reduce((a,c)=>a+c.n,0);
  metaSave();
  S.pending={};
  if(!EVO_UPGRADES.some(evoUpgradeEligible)&&!evoOwnedLegends().length){   // 모든 강화가 상한이면 선택을 건너뜁니다
    advanceAfterUpgrade(); return;
  }
  mode='upgrade'; picksLeft=1; S.adBonusUsed=false; S.rerollUsed=false;
  $('upEyebrow').textContent=`STAGE ${S.stage} CLEAR`;
  $('upEyebrow').textContent = `STAGE ${S.story?S.story.id:S.stage} ${T('clear')}`;
  const mb=$('missionBox'); mb.innerHTML='';
  if(S.story){
    const h=document.createElement('div'); h.className='mhd';
    h.innerHTML=`<span>${T('mission')}</span><b>+${S.missionAst||0} ${T('ast')}</b>`;
    mb.appendChild(h);
    for(const r of S.missionRes){
      const d=document.createElement('div'); d.className='mrow'+(r.ok?' ok':'');
      d.innerHTML=`<span class="ck">${r.ok?'✔':'✖'}</span><span class="tx">${r.n}</span>`+
                  (r.isNew?'<span class="nw">+1</span>':'');
      mb.appendChild(d);
    }
    if(S.missionCard){
      const d=document.createElement('div'); d.className='mrow card';
      d.innerHTML=`<span class="ck">★</span><span class="tx">${T('chapterReward',S.story.ch,S.missionCard)}</span>`;
      mb.appendChild(d);
    }
  }
  if(S.velcaCoreAward)velcaCoreCard(mb,true);
  queueMicrotask(()=>{if(mode==='upgrade')velcaCoreNotice();});
  storyClearCard(mb);
  const cb=$('claimBox'); cb.innerHTML='';
  for(const c of (S.claimed||[])){
    const L=LEGENDS[c.k], up=c.after>c.before ? ` · Lv${c.before}→${c.after}` : '';
    const d=document.createElement('div'); d.className='cl';
    d.innerHTML=`<span class="tag">${T('captured')}</span>
      <span class="lg">${nm(c.k)}${c.n>1?' ×'+c.n:''}</span>
      <span class="lv">${T('cards',cardsOf('legend',c.k))}${up}</span>`;
    cb.appendChild(d);
  }
  refreshAdCards(); $('pClose').textContent=T('close');
  $('upTitle').textContent=T('pickUp');
  rollUpgrades(); $('btUpAd').disabled=false; $('btUpReroll').disabled=false; show('lyUp');
}
/* 강화 아이콘 — 외부 이미지 없이 SVG로 그립니다 */
const SV=(d)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const UP_ICON={
  dmg:  SV('<path d="M12 3l3 5v6a3 3 0 0 1-6 0V8z"/><path d="M12 20v-3"/><path d="M9 22h6"/>'),
  rate: SV('<path d="M13 2L5 13h5l-1 9 8-11h-5z"/>'),
  move: SV('<path d="M6 18V9l5-4 6 3v10"/><path d="M6 18h12"/><path d="M2 8h4M2 12h3"/>'),
  armor:SV('<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12h6M12 9v6"/>'),
  cap:  SV('<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 4h5M15 4h5"/><path d="M12 16v5"/>'),
  beam: SV('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  power:SV('<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 1h6"/><path d="M13 8l-3 5h4l-3 4"/>'),
  shld: SV('<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M12 7l3 1.8v3.4L12 14l-3-1.8V8.8z"/>'),
  squad:SV('<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M13.5 14.6A5 5 0 0 1 21 19"/>'),
  scout:SV('<circle cx="7.5" cy="15" r="3.6"/><circle cx="16.5" cy="15" r="3.6"/><path d="M11.1 15h1.8"/><path d="M6 11.5L8 5h3M18 11.5L16 5h-3"/>'),
  ad:   SV('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 5v14M18 5v14"/><path d="M10.5 9.6l4 2.4-4 2.4z"/>'),
};
function adCard(el, title, sub){
  el.innerHTML=`<span class="ico">${UP_ICON.ad}</span>
    <span class="txt"><span class="nm">${title}</span><span class="ds">${sub}</span></span>`;
}
function refreshAdCards(){
  if(BUILD.disableLegacyRewards){ $('btUpAd').style.display='none'; $('btUpReroll').style.display='none'; return; }
  adCard($('btUpAd'),T('adMore'),T('adSub'));
  adCard($('btUpReroll'),T('adReroll'),T('adSub'));
}
refreshAdCards();

let cards=[];
function rollUpgrades(){
  const pool=UPGRADES.filter(u=>['dmg','rate','power','squad'].includes(u.id)&&u.lv(S)<u.max);   // 이미 최대치인 강화는 후보에서 제외
  const copy=[...pool]; cards=[]; const box=$('upChoices'); box.innerHTML='';
  for(let i=0;i<3&&copy.length;i++){
    const u=copy.splice((Math.random()*copy.length)|0,1)[0];
    const d=document.createElement('button'); d.type='button'; d.className='card';
    const lv=u.lv(S);
    const badge = u.max>1 && lv>0 ? `<span style="color:#7f8f78;font-weight:400"> Lv${lv}→${lv+1}</span>` : '';
    d.innerHTML=`<span class="ico">${UP_ICON[u.ic]||''}</span>
      <span class="txt"><span class="nm">${u.nm}${badge}</span><span class="ds">${u.ds}</span></span>
      <span class="arw">›</span>`;
    d.onclick=()=>{ u.ap(S); S.upsTaken[u.id]=(S.upsTaken[u.id]||0)+1; d.classList.add('taken');
      if(--picksLeft<=0){
        advanceAfterUpgrade();
      } };
    box.appendChild(d); cards.push(d);
  }
}
/* ============================ 메인 화면 ================================== */
function fmt(n){ return Math.floor(Number(n)||0).toLocaleString(); }
function showMenu(){
  storySyncMenu(); $('storyRadio')?.setAttribute('hidden','');
  queueMicrotask(()=>{if(mode==='menu')velcaCoreNotice();});
  if(S&&['play','pause'].includes(mode))cgRecordRun(false);
  cgGameplayStop(); mode='menu'; closeDrawer(); musicPlay('menu');
  cgSyncIdentity();cgScheduleProfile();
  $('pausePanel').classList.remove('on'); $('tutorialOverlay').classList.remove('on'); $('objective').classList.remove('on'); $('tutorial').classList.remove('on');
  $('mCred').textContent=fmt(META.credits);
  $('mAst').textContent=fmt(META.astranium);
  $('mBest').textContent=fmt(META.best||0);
  fitMenuText();
  $('mpanel').classList.remove('on');
  $('pClose').textContent=T('close'); $('btResume').textContent=T('resume');
  show('lyMenu');
  setTimeout(fitMenuText,30);
}
const MSVG=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const MENU_ICON={
  shop: MSVG('<path d="M3 4h2l2.4 11h10.2l1.9-8H6.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  unit: MSVG('<path d="M12 2a5 5 0 0 1 5 5v3H7V7a5 5 0 0 1 5-5z"/><path d="M8.5 10h7v4a3.5 3.5 0 0 1-7 0z"/><path d="M6 22v-3.5A3.5 3.5 0 0 1 9.5 15h5a3.5 3.5 0 0 1 3.5 3.5V22"/>'),
  relic:MSVG('<path d="M12 2l4.5 5.5L12 22 7.5 7.5z"/><path d="M7.5 7.5h9"/>'),
  set:  MSVG('<circle cx="12" cy="12" r="3.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1"/>'),
  story:MSVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  inf:  MSVG('<path d="M8.5 12a3.5 3.5 0 1 1 3.5 3.5c-2 0-2-7-4-7A3.5 3.5 0 1 0 8.5 12z"/><path d="M15.5 12a3.5 3.5 0 1 0-3.5-3.5"/>'),
};
/* 시안 이미지 크기에 맞춰 덧씌운 숫자의 글자 크기를 맞춥니다 */
/* ── 세로 ↔ 가로 좌표 변환 ───────────────────────────────────────────────
   세로 원본(820×1457)의 어느 사각형이 가로 원본(1400×840)의 어디로 옮겨졌는지만
   적어 두면, 그 안의 모든 좌표·크기가 자동으로 따라갑니다.
   덕분에 좌표표를 두 벌 유지할 필요가 없고, 한쪽만 고쳐서 어긋날 일도 없습니다. */
const PW=820, PH=1457, LW=1400, LH=840;
const LAND_MAP=[
  {s:[ 14,  14, 320, 152], d:[  30, 18], k:1.00},   // 좌상단 지휘관 칸
  {s:[508,  14, 812, 152], d:[1066, 18], k:1.00},   // 우상단 재화 칸
  {s:[ 96, 668, 724, 932], d:[ 429,162], k:0.86},   // 로고 + 부제
  {s:[ 60, 916, 760,1102], d:[ 399,392], k:0.86},   // 스토리 칸
  {s:[ 60,1100, 760,1290], d:[ 399,548], k:0.86},   // 무한 칸
  {s:[  8,1290, 812,1454], d:[ 378,695], k:0.80},   // 하단 탭
];
function landOf(xPct, yPct){
  const px=xPct/100*PW, py=yPct/100*PH;
  for(const m of LAND_MAP){
    const [a,b,c,e]=m.s;
    if(px>=a-6 && px<=c+6 && py>=b-6 && py<=e+6)
      return { x:(m.d[0]+(px-a)*m.k)/LW*100, y:(m.d[1]+(py-b)*m.k)/LH*100, k:m.k };
  }
  return null;
}
/* 화면 폭 대비 비율로 적힌 값(글자 크기·최대폭)은 원본 폭이 달라진 만큼 보정합니다 */
const landRatio=(v,k)=>v*PW*k/LW;

/* 처음 한 번 세로 좌표를 기억해 둡니다 */
function snapMenuBase(){
  for(const el of document.querySelectorAll('#mstage .mtx, #mstage .val, #mstage .cico, #mstage .hot, #mstage #txSub')){
    if(el.dataset.pl!==undefined) continue;
    el.dataset.pl=el.style.left||''; el.dataset.pt=el.style.top||'';
    el.dataset.pr=el.style.right||''; el.dataset.pw=el.style.width||'';
    el.dataset.ph=el.style.height||'';
  }
}
/* 현재 방향에 맞게 모든 요소를 배치합니다 */
function layoutMenu(){
  snapMenuBase();
  const land=document.body.classList.contains('land');
  const num=v=>parseFloat(v);
  for(const el of document.querySelectorAll('#mstage .mtx, #mstage .val, #mstage .cico, #mstage .hot, #mstage #txSub')){
    const pl=el.dataset.pl, pt=el.dataset.pt, pr=el.dataset.pr;
    const pw=el.dataset.pw, ph=el.dataset.ph;
    if(!land){
      el.style.left=pl; el.style.top=pt; el.style.right=pr;
      el.style.width=pw; el.style.height=ph;
      el.dataset.k=''; continue;
    }
    /* 오른쪽 기준으로 잡힌 것은 왼쪽 기준으로 바꿔 계산합니다 */
    const xPct = pl!=='' ? num(pl) : (pr!==''? 100-num(pr) : 50);
    const yPct = pt!=='' ? num(pt) : 50;
    const m=landOf(xPct,yPct);
    if(!m){ el.style.left=pl; el.style.top=pt; el.style.right=pr; continue; }
    if(pr!==''){ el.style.left=''; el.style.right=(100-m.x)+'%'; }
    else { el.style.right=''; el.style.left=m.x+'%'; }
    el.style.top=m.y+'%';
    if(pw!==''){
      const p2=landOf(xPct+num(pw), yPct);
      el.style.width=((p2?p2.x:m.x+num(pw)*m.k)-m.x)+'%';
    }
    if(ph!==''){
      const p3=landOf(xPct, yPct+num(ph));
      el.style.height=((p3?p3.y:m.y+num(ph)*m.k)-m.y)+'%';
    }
    el.dataset.k=String(m.k);
  }
}

function fitMenuText(){
  if(document.body.classList.contains('pg-enabled'))return;
  layoutMenu();
  const st=$('mstage'); if(!st) return;
  const LAND=document.body.classList.contains('land');
  const w=st.clientWidth||st.getBoundingClientRect().width||450;
  const ic=Math.round(w*0.039*(LAND?landRatio(1,1.00):1));  // 배경 아이콘(3.54%)에 맞춥니다
  for(const [el,src] of [[$('icCred'),ART.c_cred],[$('icAst'),ART.c_ast]]){
    el.src=src; el.style.width=ic+'px'; el.style.height=ic+'px';
  }
  /* 얹은 문구들의 크기와 내용을 언어에 맞춰 갱신 */
  const MT={txCmdr:cgDisplayName(),txBestL:T('best'),
    txStoryT:T('story'),txStoryD:T('storyD'),txInfT:T('infinity'),txInfD:T('infinityD'),
    txTab1:T('shop'),txTab2:T('unit'),txTab3:T('relic'),txTab4:T('set')};
  for(const id in MT){
    const el=$(id); if(!el) continue;
    el.textContent=MT[id];
    const k=parseFloat(el.dataset.k||0);
    /* 시안에 그려진 칸을 넘지 않도록, 기본 크기로 넣어보고 넘치면 줄입니다.
       언어마다 글자 길이가 크게 달라 고정 크기로는 반드시 삐져나옵니다. */
    const baseFs=parseFloat(el.dataset.fs)||.028;
    const baseMax=parseFloat(el.dataset.max||0);
    let fs=w*(LAND&&k ? landRatio(baseFs,k) : baseFs);
    el.style.fontSize=fs+'px';
    const cap=(LAND&&k ? landRatio(baseMax,k) : baseMax)*w;
    if(cap>0){
      let guard=0;
      while(el.scrollWidth>cap && fs>w*0.012 && guard++<40){
        fs*=0.94; el.style.fontSize=fs+'px';
      }
    }
  }
  /* 부제 — 글자 사이를 넉넉히 띄워 로고 아래 장식선 사이에 앉힙니다.
     라틴 문자는 대문자 트래킹이 어울리고, 한중일은 자간만 살짝 벌립니다. */
  const sub=$('txSub');
  if(sub){
    const txt=T('gameSub'), latin=(LANG==='en');
    sub.innerHTML=[...txt].map(c=>c===' '
      ? '<span class="g" style="width:.42em"></span>'
      : '<span class="g">'+c.replace('&','&amp;').replace('<','&lt;')+'</span>').join('');
    const kSub=LAND?landRatio(1,0.86):1;         // 부제는 로고 조각(0.86배)을 따릅니다
    let fs=w*(latin?.0245:.0285)*kSub;
    sub.style.letterSpacing=(latin?.22:.20)+'em';
    sub.style.fontSize=fs+'px';
    const cap=w*0.286*kSub;                       // 좌우 장식선 사이 실측 빈 폭(29.0%)에서 여백 조금
    let guard=0;
    while(sub.scrollWidth>cap && fs>w*0.011 && guard++<50){
      fs*=0.94; sub.style.fontSize=fs+'px';
    }
  }
  /* 상단 칸은 배율 1.00 로 옮겨졌으므로 원본 폭 비율만 환산합니다 */
  const kTop=LAND?landRatio(1,1.00):1;
  $('mCred').style.fontSize=(w*0.030*kTop)+'px';
  $('mAst').style.fontSize=(w*0.030*kTop)+'px';
  $('mBest').style.fontSize=(w*0.024*kTop)+'px';
}
/* Viewport scheduler owns resize work. */

/* ======================= 드롭다운 상세 시트 (v21) ========================
   유닛·유물·스토리·재화·지휘관 정보를 아래에서 올라오는 시트로 보여줍니다.
   메인 화면의 좁은 칸에 글자를 욱여넣지 않아도 되게 하는 것이 목적입니다. */
/* ---- 계급장 ------------------------------------------------------------
   외부 이미지 없이 SVG로 그립니다. 사병은 갈매기(V), 부사관은 갈매기+로커,
   준위는 막대, 위관은 막대/은막대, 영관은 잎, 장성은 별입니다. */
function rankSVG(rk, size){
  const S2=size||34, C={
    PVT:'#8E9A86', PFC:'#C08A4A', CPL:'#C08A4A', SGT:'#C08A4A',
    SSG:'#C08A4A', SFC:'#C08A4A', MSG:'#C08A4A', SGM:'#C08A4A',
    WO:'#C9CFD4', CWO:'#C9CFD4',
    '2LT':'#C9CFD4', '1LT':'#C9CFD4', CPT:'#C9CFD4',
    MAJ:'#C9CFD4', LTC:'#C9CFD4', COL:'#C9CFD4',
    BG:'#E6E2D3', MG:'#E6E2D3', LTG:'#E6E2D3', GEN:'#E6E2D3', GA:'#FFD75A'};
  const c=C[rk]||'#C9CFD4';
  const chev=(n,rock)=>{
    let p='';
    for(let i=0;i<n;i++){ const y=16-i*4.6;
      p+=`<path d="M6 ${y} L16 ${y-6.4} L26 ${y}" stroke="${c}" stroke-width="2.6" fill="none"/>`; }
    for(let i=0;i<(rock||0);i++){ const y=20.5+i*4.4;
      p+=`<path d="M6.5 ${y} L16 ${y+5.6} L25.5 ${y}" stroke="${c}" stroke-width="2.3" fill="none"/>`; }
    return p;
  };
  const star=(n)=>{
    const pts=(cx,cy,r)=>{ let o=[];
      for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2?r*.45:r;
        o.push((cx+Math.cos(a)*rr).toFixed(1)+','+(cy+Math.sin(a)*rr).toFixed(1)); }
      return o.join(' '); };
    const gap=n===1?0:(n===2?9:(n===3?8:7)), r=n>=4?4.6:5.6;
    let p='';
    for(let i=0;i<n;i++) p+=`<polygon points="${pts(16+(i-(n-1)/2)*gap,16,r)}" fill="${c}"/>`;
    return p;
  };
  const bar=(n,fill)=>{ let p='';
    for(let i=0;i<n;i++) p+=`<rect x="${13+(i-(n-1)/2)*6}" y="7" width="6" height="18" rx="1"
      fill="${fill?c:'none'}" stroke="${c}" stroke-width="2"/>`; return p; };
  const leaf=()=>`<path d="M16 6 C9 10 7 18 10 25 C15 24 20 19 21 12 C20 9 18 7 16 6 Z"
      fill="${c}" opacity=".92"/><path d="M16 6 C23 10 25 18 22 25 C17 24 12 19 11 12 C12 9 14 7 16 6 Z"
      fill="${c}" opacity=".6"/>`;
  const eagle=()=>`<path d="M4 17 L12 13 L16 8 L20 13 L28 17 L20 18 L16 24 L12 18 Z"
      fill="${c}"/><circle cx="16" cy="14" r="2" fill="#0a1410"/>`;
  const wbar=(n)=>{ let p=`<rect x="12" y="6" width="8" height="20" rx="1" fill="#2b2f33" stroke="${c}" stroke-width="1.6"/>`;
    for(let i=0;i<n;i++) p+=`<rect x="13.4" y="${8.5+i*4.4}" width="5.2" height="2.6" fill="${c}"/>`;
    return p; };
  const G={PVT:'', PFC:chev(1), CPL:chev(2), SGT:chev(3), SSG:chev(3,1),
    SFC:chev(3,2), MSG:chev(3,3), SGM:chev(3,3)+`<polygon points="16,17 18,21 14,21" fill="${c}"/>`,
    WO:wbar(1), CWO:wbar(3),
    '2LT':bar(1,true), '1LT':bar(1,true), CPT:bar(2,true),
    MAJ:leaf(), LTC:leaf(), COL:eagle(),
    BG:star(1), MG:star(2), LTG:star(3), GEN:star(4), GA:star(5)};
  const inner=G[rk]!==undefined?G[rk]:'';
  return `<svg width="${S2}" height="${S2}" viewBox="0 0 32 32" aria-hidden="true">`+
    (inner||`<rect x="10" y="14" width="12" height="4" rx="1" fill="#5c665c"/>`)+`</svg>`;
}
/* 계급 + 진행 pip 블록 */
function rankBlock(kind,key){
  const g=gradeOf(key), r=recOf(kind,key), lv=r.lv|0;
  const idx=rankIdx(kind,key), rk=RANKS[idx];
  const maxed=lv>=maxLvOf(kind,key);
  const have=maxed?PIPS:Math.min(PIPS,(r.cards|0));
  let pips='';
  for(let i=0;i<PIPS;i++) pips+=`<i class="${i<have?'on':''}"></i>`;
  return `<div class="rankbox">${rankSVG(rk.k,34)}`+
    `<div class="rn">${T(rk.t)}</div><div class="ra">${rk.ab}</div>`+
    `<div class="pips">${pips}<i class="nx ${maxed?'':''}"></i></div></div>`;
}
/* 도감 셀용 소형 계급 표시 */
function rankMini(kind,key){
  const r=recOf(kind,key), rk=RANKS[rankIdx(kind,key)];
  const maxed=(r.lv|0)>=maxLvOf(kind,key);
  const have=maxed?PIPS:Math.min(PIPS,(r.cards|0));
  let pips='';
  for(let i=0;i<PIPS;i++) pips+=`<i class="${i<have?'on':''}"></i>`;
  return `<div class="rk">${rankSVG(rk.k,20)}<div class="rt">${rk.ab}</div>`+
         `<div class="pp">${pips}</div></div>`;
}

/* ---- 팝오버 -------------------------------------------------------------
   누른 요소 바로 아래에 띄웁니다. 아래 공간이 모자라면 위로 뒤집고,
   좌우로는 화면 안쪽으로 밀어 넣습니다. 가로 모드에서도 배경을 덜 가립니다. */
let DRAWER_ANCHOR=null;
function closeDrawer(){ $('drawer').classList.remove('on'); DRAWER_ANCHOR=null; }
function placeDrawer(anchor){
  const sheet=$('drawerSheet'), host=$('drawer'), nub=$('drawerNub');
  if(!sheet||!host) return;
  const hb=host.getBoundingClientRect();
  const sw=sheet.offsetWidth||236, sh=sheet.offsetHeight||200;
  let ax=hb.width/2, ay=hb.height*0.28, aw=0, ah=0;
  if(anchor && anchor.getBoundingClientRect){
    const ab=anchor.getBoundingClientRect();
    ax=ab.left-hb.left+ab.width/2; ay=ab.top-hb.top; aw=ab.width; ah=ab.height;
  }
  const M=8;
  let left=ax-sw/2;
  left=Math.max(M, Math.min(hb.width-sw-M, left));
  let top=ay+ah+9, below=true;
  if(top+sh > hb.height-M){
    if(ay-sh-9 >= M){ top=ay-sh-9; below=false; }
    else top=Math.max(M, hb.height-sh-M);
  }
  sheet.style.left=left+'px'; sheet.style.top=top+'px';
  if(nub){
    const nx=Math.max(10, Math.min(sw-18, ax-left-6));
    nub.style.left=nx+'px';
    nub.style.top = below ? '-7px' : (sh-6)+'px';
    nub.style.transform = below ? 'rotate(45deg)' : 'rotate(225deg)';
    nub.style.display = (anchor?'':'none');
  }
}
function openDrawer(o){
  $("drawerIcon").querySelector(".cg-drawer-avatar")?.remove();
  $('drawerImg').src = o.img || '';
  $('drawerImg').style.display = o.img ? '' : 'none';
  $('drawerIcon').style.display = o.img ? '' : 'none';
  $('drawerName').textContent = o.name || '';
  $('drawerName').style.color = o.color || '#EAFBF5';
  $('drawerSub').innerHTML = o.sub || '';
  $('drawerSheet').classList.toggle('wide', !!o.wide);
  const b=$('drawerBody'); b.innerHTML='';
  (o.build||function(){})(b);
  DRAWER_ANCHOR = o.anchor || DRAWER_ANCHOR || null;
  $('drawer').classList.add('on');
  placeDrawer(DRAWER_ANCHOR);
  /* 내용이 그려진 뒤 실제 높이로 한 번 더 맞춥니다 */
  setTimeout(()=>{ if($('drawer').classList.contains('on')) placeDrawer(DRAWER_ANCHOR); },0);
}
addEventListener('resize',()=>{ if($('drawer').classList.contains('on')) placeDrawer(DRAWER_ANCHOR); });
const el=(cls,html)=>{ const d=document.createElement('div');
  if(cls) d.className=cls; if(html!==undefined) d.innerHTML=html; return d; };
const dsec =(b,t)=>b.appendChild(el('dsec',t));
const dtext=(b,t)=>b.appendChild(el('dtext',t));
function dchips(b,list){
  if(!list||!list.length) return;
  b.appendChild(el('dchips', list.map(x=>`<span>${x}</span>`).join('')));
}
function dstats(b,rows){
  const d=el('dstats'+(rows.length===3?' n3':''),
    rows.map(r=>`<div><div class="k">${r[0]}</div><div class="v">${r[1]}</div></div>`).join(''));
  b.appendChild(d);
}
/* 카드/크레딧 진행 상황과 업그레이드 버튼 */
function dUpgradeBlock(b, kind, key, onDone){
  const r=recOf(kind,key), lv=r.lv|0, cards=r.cards|0;
  const isRelic=(kind==='relic');
  const maxLv=maxLvOf(kind,key);
  const box=el('dprog');
  if(lv>=maxLv){
    box.innerHTML=isRelic
      ? `<div class="dprow"><span>${T('tier')}</span><b>Lv${lv} / ${maxLv}</b></div>`
      : `<div class="dprow"><span>${T('rank')}</span><b>${rankName(kind,key)}</b></div>`;
    b.appendChild(box);
    b.appendChild(el('dmsg','<span style="color:#FFD75A">'+T('maxTier')+'</span>'+
      (isRelic?'<br>'+T('refundNote',RELIC_REFUND[RELICS[key].ra]):'')));
    return;
  }
  const nc=needCard(kind,key,lv), ncr=needCred(kind,key,lv);
  const okCard=cards>=nc, okCred=META.credits>=ncr;
  const pct=Math.max(0,Math.min(100, cards/nc*100));
  const head = isRelic
    ? `<div class="dprow"><span>${T('tier')}</span><b>${T('upTo',lv,lv+1)} · max ${maxLv}</b></div>`
    : `<div class="dprow"><span>${T('nextRank')}</span><b>${T(RANKS[Math.min(capRank(gradeOf(key)),rankIdx(kind,key)+1)].t)}</b></div>`;
  box.innerHTML= head +
    `<div class="dprow"><span>${T('ownedCards')}</span>`+
      `<b class="${okCard?'':'no'}">${cards} / ${nc}</b></div>`+
    `<div class="dprow"><span>${T('cred')}</span>`+
      `<b class="${okCred?'':'no'}">${fmt(META.credits)} / ${fmt(ncr)}</b></div>`+
    `<div class="dbar"><i style="width:${pct}%"></i></div>`;
  b.appendChild(box);
  const msg=el('dmsg','');
  const bt=document.createElement('button');
  bt.className='dup';
  bt.innerHTML=`<span>${isRelic?T('upBtn'):T('promote')}</span>`+
               `<span class="cost">${fmt(ncr)} ${T('cred')}</span>`;
  bt.disabled=!(okCard&&okCred);
  bt.onclick=()=>{
    if(!okCard){ msg.innerHTML='<span style="color:#D6453A">'+T('lackCard')+'</span>'; return; }
    if(!okCred){ msg.innerHTML='<span style="color:#D6453A">'+T('lackCred')+'</span>'; return; }
    if(doUp(kind,key)){
      blip(720,.09,'square',.05); blip(980,.13,'triangle',.05);
      syncCurrency();
      if(onDone) onDone();
    }
  };
  b.appendChild(bt); b.appendChild(msg);
}
function syncCurrency(){
  cgScheduleProfile();
  const c=$('mCred'), a=$('mAst');
  if(c) c.textContent=fmt(META.credits);
  if(a) a.textContent=fmt(META.astranium);
}

/* ---- 일반 유닛 상세 ---- */
function unitDrawer(key, anchor){
  const U=UNITS[key], g=gradeOf(key);
  const mul=powerMul('unit',key), st=recOf('unit',key).lv|0;
  openDrawer({
    anchor, img:ART[U.img], name:nm(key), color:gradeColor(g),
    sub:`<span class="dbadge" style="color:${gradeColor(g)}">${gradeName(g)}</span>`+
        `${rankName('unit',key)}`,
    build(b){
      b.appendChild(el(null,rankBlock('unit',key)));
      dsec(b,T('normalUnit'));
      dtext(b,`${T('power')} <b>+${Math.round((mul-1)*100)}%</b> · `+
              `${T('rankStep')} ${st} / ${maxSteps(g)}`);
      dchips(b,[T('tMulti',rankWays('unit',key))]
        .concat(rankHoming('unit',key)?[T('tHoming')]:[]));
      dsec(b,T('atkStyle'));
      dtext(b,unitBehaviour(key));
      dchips(b,unitTraits(key));
      dstats(b,unitStats(key));
      dUpgradeBlock(b,'unit',key,()=>unitDrawer(key,anchor));
    }
  });
}
/* ---- 레전드 상세 ---- */
function legendDrawer(key, anchor){
  if(HEROES[key]&&!heroUnlocked())return;
  const L=LEGENDS[key], own=hasOf('legend',key);
  const mul=powerMul('legend',key), st=recOf('legend',key).lv|0;
  openDrawer({
    anchor, img:ART[L.img], name:own||HEROES[key]?nm(key):T('locked'), color:'#FFD75A',
    sub:`<span class="dbadge" style="color:#FFD75A">${T('gradeL')}</span>`+
        `${own?rankName('legend',key):T('notOwned')}`,
    build(b){
      if(own) b.appendChild(el(null,rankBlock('legend',key)));
      dsec(b,T('legendUnit'));
      dtext(b, own ? `${T('power')} <b>+${Math.round((mul-1)*100)}%</b> · `+
                     `${T('rankStep')} ${st} / ${maxSteps('L')}`
                   : T('notOwned'));
      dsec(b,T('atkStyle'));
      dtext(b, legendWeapons(key).map(x=>'· '+x).join('<br>'));
      const cdCut=Math.round(Math.min(25, st*5));
      dchips(b,[L.flying?T('tAir'):T('tGround'), HEROES[key]?heroText('아스트라 보스 트로피 · 극희소 소환','Astra boss trophy · ultra-rare summon'):`STAGE ${L.from}~${L.to}`]
        .concat(cdCut?[HEROES[key]?heroText('기본 사격 간격 −','Primary interval −')+cdCut+'%':T('rateUpBy',cdCut)]:[]));
      dstats(b,legendStats(key));
      dUpgradeBlock(b,'legend',key,()=>legendDrawer(key,anchor));
    }
  });
}
/* ---- 유물 상세 ---- */
function relicDrawer(key, anchor){
  const R=RELICS[key], lv=relicLv(key), own=hasOf('relic',key), rr=RELIC_RARITY[R.ra];
  const mx=relicMax(key);
  openDrawer({
    anchor, img:ART[R.ic], name:own?nm(key):T('locked'), color:rr.c,
    sub:`<span class="dbadge" style="color:${rr.c}">${rarName(R.ra)}</span>`+
        `Lv${lv} / ${mx} · ${T('ownedCards')} ${cardsOf('relic',key)}`,
    build(b){
      dsec(b,T('effect'));
      dtext(b, lv>0 ? `<b>Lv${lv}</b> — ${T(R.t,relicVal(key))}`
                    : `Lv1 — ${relicPreview(key)}`);
      if(lv<mx){
        const chips=[`Lv${lv+1} → ${T(R.t,relicValAt(key,lv+1))}`];
        /* 정수로 떨어지는 유물은 몇 레벨 뒤에 수치가 오르는지 같이 보여줍니다 */
        if(!R.st){
          const now=relicValAt(key,Math.max(1,lv));
          let nx=0;
          for(let l=lv+1;l<=mx;l++) if(relicValAt(key,l)>now){ nx=l; break; }
          if(nx&&nx>lv+1) chips.push(T('nextGain',nx,T(R.t,relicValAt(key,nx))));
        }
        chips.push(`Lv${mx} → ${T(R.t,relicValAt(key,mx))}`);
        dchips(b,chips);
      }
      dchips(b,[T('maxLvIs',mx), T('refundNote',RELIC_REFUND[R.ra])]);
      dUpgradeBlock(b,'relic',key,()=>relicDrawer(key,anchor));
    }
  });
}
/* ---- 스토리 스테이지 상세 ----
   임무는 누적 판정입니다. 이전 판에서 깬 임무는 계속 달성 상태로 남고,
   남은 임무만 나중에 따로 달성해도 3개 전부 인정됩니다. */
function storyDrawer(x, anchor){
  const rec=storyRec(x.id);
  openDrawer({
    anchor, wide:true,
    img:ART[(THEME_BY_ID[x.theme]||THEMES[0]).base], name:`${x.id}  ${planetName(x)}`,
    color:'#7FFFD8',
    sub:`${T('chapter',x.ch)} · ${nm('ch'+x.ch)}`,
    build(b){
      dsec(b,T('missionList'));
      const box=el('dmis');
      x.ms.forEach((m,k)=>{
        const ok=!!rec.stars[k];
        const name=(typeof m.n==='function'?m.n(x.gi):m.n);
        box.appendChild(el('row'+(ok?' ok':''),
          `<span class="ck">${ok?'★':'☆'}</span><span class="tx">${name}</span>`+
          `<span class="st">${ok?T('missionOk'):T('missionNo')}</span>`));
      });
      b.appendChild(box);
      b.appendChild(el('dmsg',T('storyCum')));
      const bt=document.createElement('button');
      bt.className='dup teal'; bt.innerHTML=`<span>${T('storyStart')}</span>`;
      bt.onclick=()=>{ closeDrawer(); $('mpanel').classList.remove('on');
                       newGame(x.id); show(null); };
      b.appendChild(bt);
    }
  });
}
/* ---- 재화 ---- */
function currencyDrawer(anchor){
  openDrawer({
    anchor, img:ART.c_cred, name:T('cRes'), color:'#F5C542', sub:'',
    build(b){
      const d=el('dres',
        `<div><img src="${ART.c_cred}" alt=""><div><div class="rk">${T('cred')}</div>`+
        `<div class="rv">${fmt(META.credits)}</div></div></div>`+
        `<div><img src="${ART.c_ast}" alt=""><div><div class="rk">${T('ast')}</div>`+
        `<div class="rv" style="color:#8FD9C4">${fmt(META.astranium)}</div></div></div>`);
      b.appendChild(d);
      const bt=document.createElement('button');
      bt.className='dup teal'; bt.innerHTML=`<span>${T('cGoShop')}</span>`;
      bt.onclick=()=>{ closeDrawer(); openPanel('shop'); };
      b.appendChild(bt);
    }
  });
}
/* ---- 지휘관 ---- */
/* ── 기록실 ───────────────────────────────────────────────────────────────
   서버가 없어 전 세계 순위는 아직 만들 수 없습니다. 지금은 이 기기에 쌓인
   개인 기록을 모아 보여 줍니다. 나중에 Web 순위표 SDK 를 붙이면
   이 함수의 rows 만 서버 값으로 바꾸면 됩니다. */
function recordRows(){
  const legOwned=legendOwned();
  let topLeg='-', topLegRank=-1;
  for(const k of legOwned){
    const r=rankIdx('legend',k);
    if(r>topLegRank){ topLegRank=r; topLeg=nm(k)+' · '+rankName('legend',k); }
  }
  let topUnit='-', topUnitRank=-1;
  for(const k of UNIT_POOL){
    if(!hasOf('unit',k)) continue;
    const r=rankIdx('unit',k);
    if(r>topUnitRank){ topUnitRank=r; topUnit=nm(k)+' · '+rankName('unit',k); }
  }
  const cleared=Object.keys(META.story||{}).filter(id=>META.story[id].clear);
  let far='-';
  for(const x of STORY) if(META.story&&META.story[x.id]&&META.story[x.id].clear) far=x.id;
  const stars=cleared.reduce((a,id)=>a+(META.story[id].stars||[]).filter(Boolean).length,0);
  const relN=RELIC_KEYS.filter(k=>hasOf('relic',k)).length+(ownsVelcaCore()?1:0);
  let topRelic='-', topRelicLv=-1;
  for(const k of RELIC_KEYS){ const lv=relicLv(k);
    if(lv>topRelicLv){ topRelicLv=lv; topRelic=nm(k)+' Lv'+lv+'/'+relicMax(k); } }
  return [
    [T('rcBestScore'), fmt(META.best||0)],
    [T('rcBestStage'), (META.bestStage|0) ? (META.bestStage|0)+' ' + T('stageUnit') : '-'],
    [T('rcStory'), far+'  ('+cleared.length+'/'+STORY.length+')'],
    [T('rcStars'), stars+' / '+(STORY.length*3)],
    [T('rcTopLegend'), topLeg],
    [T('rcTopUnit'), topUnit],
    [T('rcTopRelic'), topRelic],
    [T('rcLegend'), legOwned.length+' / '+heroVisibleKeys().length],
    [T('rcRelic'), relN+' / '+(RELIC_KEYS.length+1)],
    [T('rcKills'), fmt(META.totalKills|0)],
    [T('rcRuns'), fmt(META.totalRuns|0)],
  ];
}
/* ── 마스터 도구 ──────────────────────────────────────────────────────────
   레전드 성능을 눈으로 확인하기 위한 개발자용 기능입니다.
   BUILD.master 가 켜진 빌드에서만 존재합니다. 정식/심사 빌드에는 나타나지 않습니다. */

function recordsDrawer(anchor){
  openDrawer({
    anchor, wide:true, img:ART.main, name:T('records'), color:'#F5C542', sub:T('recordsSub'),
    build(b){
      const box=el('dprog');
      box.innerHTML=recordRows().map(([k,v])=>
        `<div class="dprow"><span>${k}</span><b>${v}</b></div>`).join('');
      b.appendChild(box);
      b.appendChild(el('dmsg',T('recordsLocal')));
    }
  });
}
function profileDrawer(anchor){
  const relN=RELIC_KEYS.filter(k=>hasOf('relic',k)).length+(ownsVelcaCore()?1:0);
  openDrawer({
    anchor, img:ART.main, name:pgText('지휘관 정보','COMMANDER PROFILE'), color:'#EAFBF5', sub:pgText('전적과 보유 현황','Records and collection'),
    build(b){
      dstats(b,[[T('pBest'),fmt(META.best||0)],
                [T('pLegend'),legendOwned().length+'/'+heroVisibleKeys().length],
                [T('pRelic'),relN+'/'+(RELIC_KEYS.length+1)]]);
      dsec(b,T('pName'));
      cgProfileControls(b);
      storyArchiveEntry(b);
      const bt=document.createElement('button');
      bt.className='dup teal'; bt.innerHTML=`<span>${T('records')}</span>`;
      bt.onclick=()=>recordsDrawer(anchor);
      b.appendChild(bt);

      b.appendChild(el('dmsg',T('pAccount')));
    }
  });
}
/* 모든 기록 초기화 — 되돌릴 수 없으므로 두 번 확인합니다 */
function doResetAll(){
  META.legends={}; META.relics={}; META.units={}; META.story={}; META.storyChapters={}; META.storyRewardVersion=10; META.storyArchive={};
  META.credits=0; META.astranium=0; META.best=0;
  META.infinityBestScore=0;META.infinityCleared=0;META.season2Signal=false;
  META.tutorialDone=false;
  try{ CG_STORAGE.removeItem('foi_meta'); }catch(e){}
  metaSave();
  closeDrawer(); syncCurrency(); showMenu();
}
function resetConfirm(anchor){
  openDrawer({
    anchor, name:T('resetAll'), color:'#D6453A', sub:'', wide:true,
    build(b){
      dtext(b,T('resetAsk'));
      const bt=document.createElement('button');
      bt.className='dup';
      bt.style.background='linear-gradient(180deg,rgba(62,18,14,.94),rgba(28,8,6,.94))';
      bt.style.borderColor='#D6453A'; bt.style.color='#FF8A7A';
      bt.innerHTML=`<span>${T('resetYes')}</span>`;
      bt.onclick=doResetAll;
      b.appendChild(bt);
      const cx=document.createElement('button');
      cx.className='dup teal'; cx.innerHTML=`<span>${T('cancel')}</span>`;
      cx.onclick=closeDrawer;
      b.appendChild(cx);
    }
  });
}
$('drawerClose').onclick=closeDrawer;
$('drawerDim').onclick=closeDrawer;
const PANEL_TITLE=()=>({shop:T('shop'),unit:T('unit'),relic:T('relic'),set:T('set'),story:T('story')});
function openPanel(k){
  closeDrawer();
  $('pTitle').textContent=PANEL_TITLE()[k]||'';
  $('pClose').textContent=T('close');
  const b=$('pBody'); b.innerHTML='';
  const HEX=MSVG('<path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/><circle cx="12" cy="12" r="3"/>');

  if(k==='unit'){
    /* 1) 일반 유닛 — 흡수했을 때만 강해집니다 */
    const f1=document.createElement('div'); f1.className='tframe';
    f1.innerHTML=`<div class="usec"><i>▪▪▪</i><b>${T('normalUnit')}</b><i>▪▪▪</i></div>`;
    /* 등급 순서대로 16종 전부 나열합니다 */
    const g0=document.createElement('div'); g0.className='lgrid';
    const sorted=[...UNIT_POOL].sort((a,c)=>
      GRADE_ORDER.indexOf(UNIT_GRADE[a])-GRADE_ORDER.indexOf(UNIT_GRADE[c]));
    for(const key of sorted){
      const U=UNITS[key], gd=gradeOf(key), col=gradeColor(gd);
      const d=document.createElement('div'); d.className='lcell own';
      d.style.borderColor=col;
      d.innerHTML=`<img src="${ART[U.img]}" alt="">
        <div class="n" style="color:${col}">${nm(key)}</div>
        ${rankMini('unit',key)}`;
      d.onclick=()=>unitDrawer(key,d);
      g0.appendChild(d);
    }
    f1.appendChild(g0); b.appendChild(f1);

    /* 2) 레전드 유닛 */
    const f2=document.createElement('div'); f2.className='tframe';
    f2.innerHTML=`<div class="usec"><i>▪▪▪</i><b>${T('legendUnit')}</b><i>▪▪▪</i></div>`;
    const g=document.createElement('div'); g.className='lgrid';
    for(const key of heroVisibleKeys()){
      const L=LEGENDS[key], own=hasOf('legend',key);
      const d=document.createElement('div'); d.className='lcell'+(own?' own':' lock');
      d.innerHTML=`<img src="${ART[L.img]}" alt="">
        <div class="n">${own||HEROES[key]?nm(key):T('locked')}</div>`+
        (own?rankMini('legend',key)
            :`<div class="s">${HEROES[key]?heroText('트로피 · 극희소 소환','Trophy · ultra-rare summon'):L.from+'~'+L.to}</div><div class="lbar"><i style="width:0%"></i></div>`);
      d.onclick=()=>legendDrawer(key,d);
      g.appendChild(d);
    }
    f2.appendChild(g); b.appendChild(f2);
    dtext(b,heroUnlocked()?heroText('벨카코어 영웅 해금 완료 · 아스트라 보스 처치 시 아스트라 2%, 네메시스 0.25% 트로피.','Core heroes unlocked · Astra boss trophy chances: Astra 2%, Nemesis 0.25%.'):heroText('벨카코어 보유(스토리 120별) 시 숨겨진 영웅 2종이 해금됩니다.','Own the Velca Core (120 Story stars) to unlock two hidden heroes.'));
    const p=document.createElement('div'); p.className='pnote';
    p.innerHTML=T('legendNote','<b>'+CARD_STEPS.join(' / ')+'</b>');
    b.appendChild(p);
  }

  else if(k==='relic'){
    velcaCoreCard(b);
    const f=document.createElement('div'); f.className='tframe';
    const g=document.createElement('div'); g.className='lgrid';
    for(const key of RELIC_KEYS){
      const R=RELICS[key], lv=relicLv(key), own=hasOf('relic',key);
      const rr=RELIC_RARITY[R.ra], cards=cardsOf('relic',key), mx=relicMax(key);
      const nc=lv>=mx?0:needCard('relic',key,lv);
      const pct=lv>=mx?100:Math.max(0,Math.min(100,cards/nc*100));
      const d=document.createElement('div'); d.className='lcell'+(own?' own':' lock');
      if(own) d.style.borderColor=rr.c;
      d.innerHTML=`<img src="${ART[R.ic]}" alt="">
        <div class="n" style="color:${own?rr.c:'#7FD9C0'}">${own?nm(key):T('locked')}</div>
        <div class="s">${own?('Lv'+lv+'/'+mx+' · '+cards+(lv<mx?'/'+nc:'')):rarName(R.ra)+' · max '+mx}</div>
        <div class="lbar"><i style="width:${own?pct:0}%;background:${rr.c}"></i></div>`;
      d.onclick=()=>relicDrawer(key,d);
      g.appendChild(d);
    }
    f.appendChild(g); b.appendChild(f);
    const p=document.createElement('div'); p.className='pnote'; p.innerHTML=T('relicNote'); b.appendChild(p);
  }

  else if(k==='shop'){
    const card=(icon,title,desc,odds)=>{
      const f=document.createElement('div'); f.className='tframe';
      f.innerHTML=`<div class="sitem">
          <div class="sicon"><img src="${icon}" alt=""></div>
          <div style="flex:1;min-width:0"><div class="sh">${title}</div><div class="sd">${desc}</div></div>
        </div>` + (odds?`<div class="oddsrow">${odds.map(o=>
          `<div><div class="k">${o[0]}</div><div class="v">${o[1]}</div></div>`).join('')}</div>`:'');
      return f;
    };
    const btn=(f,label,cls,fn,id)=>{
      const x=document.createElement('button'); x.className='sbtn '+(cls||'');
      if(id) x.id=id;
      x.innerHTML=`<span class="hx">${HEX}</span><span>${label}</span>`;
      x.onclick=fn; f.appendChild(x); return x;
    };
    /* 결과를 카드로 떨어뜨립니다. 레전드는 위에서 길게 내려와 크게 터집니다. */
    const showPull=(box,items)=>{
      box.innerHTML='';
      const g=document.createElement('div');
      g.className='pullres '+(items.length>1?'many':'one');
      items.forEach((it,i)=>{
        const d=document.createElement('div');
        d.className='pcard'+(it.legend?' leg':'');
        const delay=i*(items.length>1?115:0);
        d.style.animationDelay=delay+'ms';
        d.innerHTML=`<span class="pg"></span><img src="${it.img}" alt="">
          <div class="pn" style="color:${it.c}">${it.n}</div>`;
        g.appendChild(d);
        const hit=delay+(it.legend?760:330);
        setTimeout(()=>{
          const pg=d.querySelector? d.querySelector('.pg') : null;
          if(pg) pg.classList.add('go');
          if(it.legend){
            noise(.4,.11); blip(160,.55,'sawtooth',.09); blip(880,.35,'triangle',.07);
            g.classList.add('shakeit'); setTimeout(()=>g.classList.remove('shakeit'),400);
          }else{
            noise(.05,.035); blip(620+Math.random()*260,.06,'square',.035);
          }
        }, hit);
      });
      box.appendChild(g);
    };
    const pay=(n)=>{ if(META.astranium<n) return false; META.astranium-=n; return true; };
    const sync=()=>{ metaSave(); $('mAst').textContent=fmt(META.astranium); $('mCred').textContent=fmt(META.credits); };

    /* 유닛 소환 — 이름별이 아니라 등급별 확률입니다 */
    const uOdds=GRADE_ORDER.map(g=>[gradeName(g),(GRADES[g].w/100).toFixed(1)+'%']);
    const uf=card(ART.infantry,T('unitSummon'),T('unitSummonD2'),uOdds);
    dtext(uf,heroUnlocked()?heroText('1회 소환 기준: 아스트라 세이버 0.010% · 네메시스 베일 0.002% (레전드 0.5%에 포함)','Per summon: Astra Saber 0.010% · Nemesis Veil 0.002% (included in 0.5% Legend chance)'):heroText('숨겨진 영웅 소환 확률: 0% · 벨카코어 보유 후 해금','Hidden hero summon chance: 0% · unlock by owning the Velca Core'));
    const ur=document.createElement('div'); ur.className='sres';
    const doUnit=(n)=>{
      const cost=n===1?UNIT_COST:UNIT_COST10;
      if(!pay(cost)){ ur.innerHTML='<span style="color:#D6453A">'+T('notEnough')+'</span>'; return; }
      const got=[];
      for(let i=0;i<n;i++){
        const r=unitRoll();
        if(r.legend){ addCard('legend',r.key,1);
          got.push({legend:true, img:ART[LEGENDS[r.key].img], n:nm(r.key), c:'#FFD75A'}); }
        else { addCard('unit',r.key,1);
          got.push({legend:false, img:ART[UNITS[r.key].img], n:nm(r.key), c:gradeColor(r.grade)}); }
      }
      got.sort((a,b)=>(a.legend?1:0)-(b.legend?1:0));   // 레전드는 마지막에 등장
      showPull(ur,got); sync();
    };
    btn(uf,T('costPull',UNIT_COST),'',()=>doUnit(1),'btURoll');
    btn(uf,T('pull10',UNIT_COST10),'teal sm',()=>doUnit(10),'btURoll10');
    uf.appendChild(ur); b.appendChild(uf);

    /* 유물 소환 */
    const rTot={}; let rsum=0;
    for(const key of RELIC_KEYS){ const w=RELIC_RARITY[RELICS[key].ra].w;
      rTot[RELICS[key].ra]=(rTot[RELICS[key].ra]||0)+w; rsum+=w; }
    const rOdds=['N','R','SR','SSR'].filter(r=>rTot[r]).map(r=>[rarName(r),(rTot[r]/rsum*100).toFixed(1)+'%']);
    const rf=card(ART.rel6,T('relicSummon'),T('relicSummonD2'),rOdds);
    const rr2=document.createElement('div'); rr2.className='sres';
    const doRelic=(n)=>{
      const cost=n===1?RELIC_COST:RELIC_COST10;
      if(!pay(cost)){ rr2.innerHTML='<span style="color:#D6453A">'+T('notEnough')+'</span>'; return; }
      const got=[];
      for(let i=0;i<n;i++){
        const key=relicRoll(), R=RELICS[key], rar=RELIC_RARITY[R.ra];
        const res=addCard('relic',key,1);
        got.push({legend:(R.ra==='SSR'||R.ra==='SR'), img:ART[R.ic],
                  n:nm(key)+(res.refunded?` +${res.refunded}✦`:''), c:rar.c});
      }
      got.sort((a,b)=>(a.legend?1:0)-(b.legend?1:0));
      showPull(rr2,got); sync();
    };
    btn(rf,T('costPull',RELIC_COST),'',()=>doRelic(1),'btRoll');
    btn(rf,T('pull10',RELIC_COST10),'teal sm',()=>doRelic(10),'btRoll10');
    rf.appendChild(rr2); b.appendChild(rf);

    /* 아스트라늄 구매 — Basic Launch 심사 빌드에서는 실제/가짜 결제를 모두 숨깁니다 */
    const af=card(ART.c_ast,T('basicShop'),T('basicShopD'),null);b.appendChild(af);
    /* 크레딧 교환 */
    const cf=card(ART.c_cred,T('exCred'),T('exCredD'),null);
    const cres=document.createElement('div'); cres.className='sres';
    for(const pk of CRED_PACKS){
      btn(cf,`${T('ast')} ${pk.ast} → ${T('cred')} ${fmt(pk.cred)}`,'teal sm',()=>{
        if(!pay(pk.ast)){ cres.innerHTML='<span style="color:#D6453A">'+T('notEnough')+'</span>'; return; }
        META.credits+=pk.cred; sync();
        cres.innerHTML=`<span style="color:#5FD07A">+${fmt(pk.cred)} ${T('cred')}</span>`;
      });
    }
    cf.appendChild(cres); b.appendChild(cf);
  }

  else if(k==='story'){
    storyArchiveEntry(b);
    velcaCoreCard(b);
    const f=document.createElement('div'); f.className='tframe';
    for(let ch=1; ch<=4; ch++){
      const h=document.createElement('div'); h.className='chhd';
      h.innerHTML=`<span></span><b>${T('chapter',ch)} · ${nm('ch'+ch)}</b><span></span>`;
      f.appendChild(h);
      const g=document.createElement('div'); g.className='sgrid';
      STORY.filter(x=>x.ch===ch).forEach(x=>{
        const i=storyIndex(x.id), rec=META.story[x.id]||{stars:[false,false,false]};
        const open=storyUnlocked(i);
        const d=document.createElement('div'); d.className='scell'+(open?'':' lock')+(rec.clear?' done':'');
        d.innerHTML=`<div class="sid">${x.id}</div>
          <div class="sth">${planetName(x)}</div>
          <div class="sst">${[0,1,2].map(k2=>`<i class="${rec.stars[k2]?'on':''}">★</i>`).join('')}</div>`;
        if(open) d.onclick=()=>storyDrawer(x,d);
        g.appendChild(d);
      });
      f.appendChild(g);
    }
    b.appendChild(f);
    const n=document.createElement('div'); n.className='gnote';
    n.innerHTML=`<span class="hx">${HEX}</span><p>${T('storyNote')}</p>`;
    b.appendChild(n);
  }

  else if(k==='set'){
    const f=document.createElement('div'); f.className='tframe';
    const row=(label,val,fn,danger)=>{
      const d=document.createElement('div'); d.className='setrow';
      d.innerHTML=`<span${danger?' style="color:#D6453A"':''}>${label}</span>`;
      const r=document.createElement(fn?'button':'span');
      r.textContent=val;
      if(fn) r.onclick=fn; else r.style.color='#8FD9C4';
      if(danger){ r.style.borderColor='#7a2620'; r.style.color='#D6453A'; }
      d.appendChild(r); f.appendChild(d);
    };
    storyArchiveEntry(b);
    row(T('lang'), LANGS[LANG], ()=>{ const ks=Object.keys(LANGS);
      LANG=ks[(ks.indexOf(LANG)+1)%ks.length]; META.lang=LANG; metaSave();
      applyStaticLang(); showMenu(); openPanel('set'); });

    row(T('sound'), soundOn?T('on'):T('off'), ()=>{ $('snd').click(); openPanel('set'); });
    /* 음량 — 폰에서 배경음이 크다는 피드백이 있어 따로 조절할 수 있게 했습니다 */
    const slider=(label, get, set)=>{
      const d=document.createElement('div'); d.className='setrow slide';
      const lab=document.createElement('div'); lab.className='lab';
      const val=document.createElement('b');
      const put=v=>{ val.textContent=Math.round(v*100)+'%'; };
      lab.innerHTML=`<span>${label}</span>`; lab.appendChild(val);
      const inp=document.createElement('input');
      inp.type='range'; inp.min='0'; inp.max='100'; inp.step='5';
      inp.value=String(Math.round(get()*100));
      inp.style.setProperty('--p', inp.value+'%');
      put(get());
      const onIn=()=>{ const v=(+inp.value)/100;
        inp.style.setProperty('--p', inp.value+'%'); put(v); set(v); };
      inp.oninput=onIn; inp.onchange=onIn;
      d.appendChild(lab); d.appendChild(inp); f.appendChild(d);
    };
    slider(T('volMusic'), ()=>VOL_MUS, v=>{ VOL_MUS=v; META.volMus=v;
      applyVolumes(); metaSave(); });
    slider(T('volSfx'), ()=>VOL_SFX, v=>{ VOL_SFX=v; META.volSfx=v;
      applyVolumes(); metaSave(); blip(880,.09,'triangle',.05); });
    row(T('showObj'), META.hideObj?T('off'):T('on'), ()=>{
      META.hideObj=!META.hideObj; metaSave();
      document.body.classList.toggle('hideObj', !!META.hideObj); openPanel('set'); });
    row(T('best'), fmt(META.best||0), null);
    row(T('ownLegend'), legendOwned().length+' / '+heroVisibleKeys().length, null);
    row(T('pRelic'), (RELIC_KEYS.filter(k=>hasOf('relic',k)).length+(ownsVelcaCore()?1:0))+' / '+(RELIC_KEYS.length+1), null);
    /* 튜토리얼은 1회만 자동 실행됩니다. 여기서 언제든 다시 켤 수 있습니다. */
    row(T('replayTut'), T('replayTutV'), ()=>{
      META.tutorialDone=false; metaSave(); openPanel('set');
      const note=document.createElement('div'); note.className='pnote';
      note.innerHTML=T('replayDone'); $('pBody').appendChild(note); });
    /* 예전에는 브라우저 기본 확인 대화상자로 물었는데, 게임 포털은 대개
       sandbox 속성에 allow-modals 가 없는 iframe 안에서 게임을 돌립니다.
       그 경우 대화상자가 뜨지 않고 곧바로 false 가 돌아오기 때문에
       버튼을 눌러도 아무 일이 일어나지 않았습니다. 게임 내 확인 창으로 바꿉니다. */
    row(T('resetAll'), T('reset'), function(){ resetConfirm(this); }, true);
    b.appendChild(f);
  }
  $('mpanel').classList.add('on');
}
document.querySelectorAll('.hot[data-p]').forEach(t=>{ t.onclick=()=>openPanel(t.dataset.p); });
$('pClose').onclick=()=>{ closeDrawer(); $('mpanel').classList.remove('on'); };
$('btCurrency').onclick=()=>currencyDrawer($('btCurrency'));
$('btInf').onclick=()=>{ newGame(); show(null); };
$('btStory').onclick=()=>openPanel('story');
$('btProfile').onclick=()=>profileDrawer($('btProfile'));

$('btStart').onclick=()=>{newGame(); show(null);};
$('btUpAd').onclick=()=>{ if(BUILD.disableLegacyRewards||S.adBonusUsed)return; S.adBonusUsed=true; picksLeft++; $('btUpAd').disabled=true; };
$('btUpReroll').onclick=()=>{ if(BUILD.disableLegacyRewards||S.rerollUsed)return; S.rerollUsed=true; rollUpgrades(); $('btUpReroll').disabled=true; };
function gameOver(){
  cgRecordRun(false);
  cgGameplayStop(); mode='over'; $('tutorialOverlay').classList.remove('on'); $('objective').classList.remove('on'); $('tutorial').classList.remove('on');
  META.best=Math.max(META.best||0, S.score);
  /* Currency is earned at combat milestones, not repeatedly at death. */
  metaSave();
  const s=Math.round((performance.now()-S.runStart)/1000);
  $('ovStats').innerHTML=`${T('reachedStage')} <b style="color:#E8B33C">${S.stage}</b><br>`+
    `${T('score')} <b style="color:#E8B33C">${S.score.toLocaleString()}</b><br>`+
    `${T('killed')} ${S.kills} · ${T('absorbed')} ${S.captured}<br>${T('survived')} ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` +
    (Object.keys(S.pending).length ? `<br><b style="color:#D6453A">${T('lostLegend',Object.keys(S.pending).length)}</b>` : '');
  /* BASIC 빌드는 보상형 광고가 없으므로 눌리지 않는 버튼을 아예 감춥니다.
     applyBuildModeUI() 로 숨겨둔 것을 여기서 덮어써 버리던 문제를 막습니다. */
  META.totalRuns=(META.totalRuns|0)+1; metaSave();
  $('btRevive').style.display=(BUILD.disableLegacyRewards||S.revived)?'none':'block';
  show('lyOver');
}
$('btRevive').onclick=()=>{ if(BUILD.disableLegacyRewards)return; S.revived=true; S.hp=Math.round(maxHp()*.6); S.shield=true; S.invuln=2400;
  S.ebullets.length=0; S.enemies.length=0; S.spawnCd=1500; mode='play'; show(null); };
$('btRetry').onclick=()=>{newGame(); show(null);};
$('btMenu').onclick=()=>showMenu();
$('gameSettings').onclick=()=>setPaused(mode==='play');
$('btResume').onclick=()=>setPaused(false);
$('btPauseMenu').onclick=()=>showMenu();
$('snd').onclick=e=>{e.stopPropagation();setBattleSound(!soundOn);};

/* ── 비밀번호 잠금 ────────────────────────────────────────────────────────
   테스트 링크를 공유할 때 아무나 열지 못하게 막는 용도입니다.
   난독화가 아니라 단순 잠금이므로, 정식 빌드에는 넣지 않습니다. */
function openGate(){
  $('gateTitle').textContent=T('gateTitle');
  $('gateAsk').textContent=T('gateAsk');
  $('gateGo').textContent=T('gateGo');
  $('gateMsg').textContent='';
  show('lyGate');
  setTimeout(()=>{ try{ $('gateInput').focus(); }catch(e){} }, 60);
}
function tryGate(){
  const v=($('gateInput').value||'').trim();
  if(v===BUILD.gate){
    try{ sessionStorage.setItem('foi_gate','1'); }catch(e){}
    showMenu();
  } else {
    $('gateMsg').textContent=T('gateNo');
    $('gateInput').value='';
  }
}
$('gateGo').onclick=tryGate;
$('gateInput').addEventListener('keydown',e=>{ if(e.key==='Enter') tryGate(); });

/* ============================== 메인 루프 ================================ */
/* Stable simulation at the original 16 ms unit timestep; rendering is independent. */
let cgAccumulator=0,cgLastRender=0,cgSimulationTicks=0;
function cgStepFrame(elapsed){
 if(document.hidden||CG.adActive){cgAccumulator=0;return;}
 cgAccumulator+=Math.min(96,Math.max(0,elapsed));
 while(cgAccumulator+1e-7>=16){
  cgAccumulator=Math.max(0,cgAccumulator-16);cgSimulationTicks++;FRAME_ID++;
  if(S){if(mode==='play')for(const u of [S,...S.enemies,...S.allies])visualState(u);evoMotionSnapshot();update(16);velcaUpdate(16);heroUpdate(16);visualUpdate(16);velcaMaybeEncounter();}
  storyUpdate(16);
  // Preserve the old missile RNG step without tying future spawns to monitor Hz.
  if(S&&mode==='play')for(const b of S.bullets)if(!b.el&&b.kind==='missile')Math.random();
 }
 syncGameSettings();
}
function loop(t){
 const elapsed=last?Math.max(0,t-last):16;last=t;cgStepFrame(elapsed);
 if(!document.hidden&&t+.1>=cgLastRender){const interval=1000/60;cgLastRender=t-cgLastRender>interval?t+interval:cgLastRender+interval;draw();}
 requestAnimationFrame(loop);
}
function cgResumeAudio(){if(actx&&soundOn&&!CG.muted&&!document.hidden&&actx.state!=='running')actx.resume().catch(()=>{});}
document.addEventListener('pointerup',cgResumeAudio,{passive:true});
document.addEventListener('touchend',cgResumeAudio,{passive:true});
document.addEventListener('keydown',cgResumeAudio);
document.addEventListener('visibilitychange',()=>{
 clearBattleInput();cgAccumulator=0;last=performance.now();cgApplyAudioPolicy();
 if(document.hidden&&mode==='play'){cgFocusPause=true;setPaused(true);cgFocusPause=false;}
});
// Camera shake must not consume enemy/drop random values once per display frame.
function cgShake(seed){const x=Math.sin(seed*12.9898)*43758.5453;return x-Math.floor(x);}

/* 정적 화면 문구도 언어를 바꿀 때마다 다시 씁니다 */
function applyStaticLang(){
  const set=(id,html)=>{ const e=$(id); if(e) e.innerHTML=html; };
  set('rotateMsg',T('rotateMsg'));
  set('loadTitle',T('loadTitle'));
  set('loadSub',T('loadSub'));
  set('pauseTitle',T('pause'));
  set('btResume',T('resume'));
  set('btPauseMenu',T('toMenu'));
  set('btStart',T('startBtn'));
  set('ovTitle',T('over'));
  set('btReviveT',T('reviveAd'));
  set('btReviveS','▸ '+T('reviveSub'));
  set('btRetry',T('retry'));
  set('btMenu',T('toMenu'));
  set('pClose',T('close'));
  set('ctrlHelp', isTouch?T('ctrlTouch'):T('ctrlKey'));
  set('hint', isTouch?T('hintTouch'):T('hintKey'));
  document.documentElement.setAttribute('lang', LANG);
}

Object.assign(STR.ko,{"storyNote":"임무 최초 달성마다 아스트라늄 1, 스테이지 첫 클리어에 1을 받습니다.<br>한 장의 10개 스테이지를 모두 클리어하면 장당 1회 레전드 카드 1장을 받습니다. 반복 클리어는 소량의 크레딧만 지급합니다.","chapterReward":(ch,n)=>`${ch}장 전체 클리어 — ${n} 카드 1장`,"fsScreen":"전체화면","fsEnter":"전체화면 켜기","fsExit":"전체화면 종료","fsFallback":"현재 브라우저에서는 전체화면 진입이 제한됩니다. 화면은 사용 가능한 영역에 맞춰 표시됩니다. 아이폰에서는 홈 화면에 추가해 실행해 보세요.","pauseSettings":"일시정지 · 전투 설정"});
Object.assign(STR.en,{"storyNote":"1 Astranium per new mission and 1 for the first clear.<br>Clear all 10 stages of a chapter for one Legend card, once per chapter. Replays grant reduced Credits.","chapterReward":(ch,n)=>`Chapter ${ch} cleared — 1 ${n} card`,"fsScreen":"Fullscreen","fsEnter":"Enter fullscreen","fsExit":"Exit fullscreen","fsFallback":"Fullscreen is unavailable here. The game fills the available viewport. On iPhone, try launching from Add to Home Screen.","pauseSettings":"Paused · Battle settings"});
Object.assign(STR.ja,{"storyNote":"任務の初達成ごとにアストラニウム1、初回クリアで1。<br>章内の全10ステージをクリアすると、章ごとに一度だけレジェンドカード1枚を獲得。再クリアは少量のクレジットです。","chapterReward":(ch,n)=>`第${ch}章クリア — ${n}カード1枚`,"fsScreen":"全画面","fsEnter":"全画面にする","fsExit":"全画面を終了","fsFallback":"このブラウザーでは全画面が制限されています。表示領域に合わせています。iPhoneはホーム画面から起動してみてください。","pauseSettings":"一時停止 · 戦闘設定"});
Object.assign(STR.zh,{"storyNote":"每项任务首次达成获得1星辰素，首次通关获得1。<br>完成一章全部10关可获得1张传说卡片，每章仅限一次。重复通关仅获得少量信用点。","chapterReward":(ch,n)=>`第${ch}章通关 — ${n}卡片1张`,"fsScreen":"全屏","fsEnter":"进入全屏","fsExit":"退出全屏","fsFallback":"当前浏览器限制全屏。游戏将填满可用区域。iPhone可尝试从添加到主屏幕启动。","pauseSettings":"暂停 · 战斗设置"});

Object.assign(STR.ko,{commander:'연합 지휘관',storyD:'아르디안 연합 지휘관의 원정에 참여하세요.',pPrisma:'프라즈마',pCeres:'세레스'});
NAMES.ch4.ko='프라즈마 심연';NAMES.ch2.ko='세레스 폐허';
Object.assign(STR.en,{commander:'Union commander',storyD:'Command the Ardian Union expedition.'});
Object.assign(STR.ja,{commander:'連合指揮官'});Object.assign(STR.zh,{commander:'联合作战指挥官'});
for(const key of HERO_KEYS){const d=HEROES[key];NAMES[key]={ko:d.name,en:d.en,ja:d.en,zh:d.en};}
STORY_RECORDS.find(e=>e.id==='astra').image='L_astra';
STORY_RECORDS.find(e=>e.id==='nemesis').image='L_nemesis';
Object.assign(STR.en,{basicShop:'Earn Astranium',basicShopD:'Complete story objectives and defeat enemy bases to earn Astranium. Spend it on unit cards and relics.',adSpace:'ARDIAN UNION · FRONTLINE',cgResisted:'Resisted!'});
Object.assign(STR.ko,{basicShop:'아스트라늄 획득',basicShopD:'스토리 임무와 적 기지 격파로 아스트라늄을 모아 유닛 카드와 유물을 획득하세요.',adSpace:'아르디안 연합 · 전선',cgResisted:'저항!'});
Object.assign(STR.ja,{basicShop:'アストラニウムを獲得',basicShopD:'ストーリー任務と敵基地の撃破で集め、ユニットカードや遺物を獲得しましょう。',adSpace:'アーディアン連合 · 前線',cgResisted:'抵抗！'});
Object.assign(STR.zh,{basicShop:'获取星晶',basicShopD:'完成剧情任务并摧毁敌方基地，收集星晶来获取单位卡和遗物。',adSpace:'阿尔迪安联合 · 前线',cgResisted:'抵抗！'});
STR.en.pAccount='Your progress is saved automatically.';
STR.ko.pAccount='진행 상황은 자동으로 저장됩니다.';
STR.ja.pAccount='進行状況は自動で保存されます。';
STR.zh.pAccount='游戏进度会自动保存。';

Object.assign(ART,{"cg_field33":"assets/6cddf33fc44706e67b2fb86d.webp","cg_turret33":"assets/77d616af7f2535a07e51a3d0.webp"});
ART.cg_missile32="assets/daf6395cb6e92c2bdda08d76.webp";
ART.cg_explosion32="assets/c9ec17f0b2be540d23a19a81.webp";
ART.cg_plasma31="assets/7cf7ed8f3e6043972ee49fa7.webp";
/* Fixed, original vector insignia and the game's existing Legend artwork.
   Saves contain allowlisted IDs only, never user-provided markup or URLs. */
const CG_EMBLEM_IMAGES={"ardian":"assets/f5406131efbc31fa06d72a12.webp","serak":"assets/b86466fded4d9bb1dab23b57.webp","velcarion":"assets/510849e63ab969e07674a2ce.webp","negentris":"assets/f2af6f3e90e44fa4c8117d54.webp"};
const CG_EMBLEMS={
 ardian:{ko:'아르디안 연합',en:'Ardian Union',color:'#83D9F5',detail:'EXPEDITION COMMAND',shape:`<path d="M48 14 57 33 53 55 48 65 43 55 39 33Z" fill="#E6F3EF"/><path d="m42 38-27-9 6 12 20 8Zm-1 15L24 46l6 12 12 5Zm13-15 27-9-6 12-20 8Zm1 15 17-7-6 12-12 5Z" fill="#83D9F5"/><path d="m48 26 4 9-4 5-4-5Z" fill="#C6A764"/><path d="M30 72h36M39 78h18" stroke="#C6A764" stroke-width="2"/>`},
 serak:{ko:'세라크 연맹',en:'Serak League',color:'#F39B78',detail:'UNBOUND FRONT',shape:`<path d="M34 17 18 30v36l16 13M62 17l16 13v36L62 79" fill="none" stroke="#F39B78" stroke-width="5"/><path d="m45 22-20 31h16L32 75l29-34H46l12-19Z" fill="#F4E2CD"/><path d="m64 28 5 7-5 7-5-7Zm-35 32 4 5-4 5-4-5Z" fill="#F39B78"/>`},
 velcarion:{ko:'벨카리온',en:'Velcarion',color:'#65DDFB',detail:'VELCA CORE GUARD',shape:`<path d="M34 14C6 34 6 62 34 82L25 61 28 35ZM62 14c28 20 28 48 0 68l9-21-3-26Z" fill="#DDD6BE"/><circle cx="48" cy="48" r="19" fill="none" stroke="#B5A476" stroke-width="3"/><path d="m48 25 13 23-13 23-13-23Z" fill="#279AC9"/><path d="m48 35 7 13-7 13-7-13Z" fill="#DCFDFF"/><path d="M48 12v8M48 76v8M12 48h9M75 48h9" stroke="#65DDFB" stroke-width="2"/>`},
 negentris:{ko:'네겐트리스',en:'Negentris',color:'#BAA0F8',detail:'BEYOND THE VEIL',shape:`<path d="M48 15a33 33 0 1 0 33 33" fill="none" stroke="#A58ADB" stroke-width="4"/><path d="m65 12 17 20-25 1Z" fill="#DCD4F1"/><path d="m48 26 21 22-21 22-21-22Z" fill="#090F20" stroke="#E1D7FD" stroke-width="2"/><path d="m48 33 8 15-8 15-8-15Z" fill="#A78DEC"/><path d="m48 40 4 8-4 8-4-8Z" fill="#EDFBFF"/><path d="M19 66 77 30M22 72 80 36" stroke="#BAA0F8" stroke-width="1" opacity=".55"/>`}
};
function cgAvatarKnown(key){return typeof key==='string'&&(Object.hasOwn(CG_EMBLEMS,key)||LEGEND_KEYS.includes(key)||UNIT_POOL.includes(key));}
function cgChapterProgress(ch){const stages=STORY.filter(s=>s.ch===ch);return {done:stages.filter(s=>META.story?.[s.id]?.clear).length,total:stages.length};}
function cgAvatarRule(key){
 if(key==='ardian')return {open:true,done:1,total:1,label:cgText('기본 제공 · 원정군 지휘관','Available from the start')};
 if(key==='serak'||key==='velcarion'){const ch=key==='serak'?2:4,p=cgChapterProgress(ch);return {open:p.total>0&&p.done===p.total,...p,label:cgText('스토리 '+ch+'장 전체 완료','Complete all Chapter '+ch+' stages')};}
 if(key==='negentris'){const done=Math.min(60,Math.max(0,META.infinityCleared||0));return {open:done>=60,done,total:60,label:cgText('인피니티 60 스테이지 돌파','Clear Infinity Stage 60')};}
 if(LEGEND_KEYS.includes(key)){const r=META.legends?.[key],open=(!HEROES[key]||heroUnlocked())&&!!r&&((r.cards|0)>0||(r.lv|0)>0);return {open,done:open?1:0,total:1,label:cgText('레전드 첫 획득','Obtain this Legend'),detail:cgText('유닛 소환으로 레전드 카드를 처음 획득하면 해금됩니다. 레전드 포획 성공으로도 카드를 획득합니다.','Unlock by obtaining a Legend card from a unit draw. Successful Legend captures also award cards.')};}
 if(UNIT_POOL.includes(key)){const done=Math.max(0,Math.min(3,unitLv(key)));return {open:done>=3,done,total:3,label:cgText('유닛 강화 3단계 달성','Promote this unit 3 times')};}
 return {open:false,done:0,total:1,label:cgText('사용할 수 없는 이미지','Unavailable image')};
}
function cgAvatarOptions(){return [...Object.keys(CG_EMBLEMS),...heroVisibleKeys(),...UNIT_POOL].filter(k=>cgAvatarRule(k).open);}
function cgAvatarKey(){return cgAvatarKnown(META.avatar)&&cgAvatarRule(META.avatar).open?META.avatar:'ardian';}
function cgAvatarName(key){const f=CG_EMBLEMS[key];return f?cgText(f.ko,f.en):nm(key);}
function cgAvatarNode(key,cls=''){
 if(!cgAvatarKnown(key))key='ardian';const box=cgNode('span',undefined,'cg-avatar '+cls);box.dataset.avatar=key;box.setAttribute('role','img');box.setAttribute('aria-label',cgAvatarName(key));
 const emblem=CG_EMBLEMS[key];box.style.setProperty('--emblem',emblem?.color||'#D4B77B');
 if(emblem&&CG_EMBLEM_IMAGES[key]){box.classList.add('cg-avatar-faction');const img=cgNode('img');img.src=CG_EMBLEM_IMAGES[key];img.alt='';box.append(img);}
 else if(emblem){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 96 96');svg.setAttribute('aria-hidden','true');svg.innerHTML=emblem.shape;box.append(svg);}
 else{const img=cgNode('img');img.src=ART[key];img.alt='';box.append(img);}return box;
}
function cgCurrentAvatar(cls=''){const holder=cgNode('span',undefined,cls);holder.dataset.cgAvatarCurrent='';holder.append(cgAvatarNode(cgAvatarKey()));return holder;}
function cgSyncAvatars(){for(const holder of document.querySelectorAll('[data-cg-avatar-current]')){const key=cgAvatarKey();if(holder.firstElementChild?.dataset.avatar!==key)holder.replaceChildren(cgAvatarNode(key));}for(const label of document.querySelectorAll('[data-cg-avatar-label]'))label.textContent=cgAvatarName(cgAvatarKey());}
function cgAvatarProfileControls(box){
 const row=cgNode('div',undefined,'cg-avatar-summary'),preview=cgCurrentAvatar(),copy=cgNode('div');copy.append(cgNode('small',cgText('프로필 이미지','PROFILE EMBLEM')));const name=cgNode('b',cgAvatarName(cgAvatarKey()));name.dataset.cgAvatarLabel='';copy.append(name,cgButton(cgText('이미지 변경','Change image'),cgOpenAvatarPicker));row.append(preview,copy);box.prepend(row);
 const head=$('drawerIcon');if(head){$('drawerImg').style.display='none';head.querySelector('.cg-drawer-avatar')?.remove();head.append(cgCurrentAvatar('cg-drawer-avatar'));}
}
function cgOpenAvatarPicker(){
 const panel=cgHub(cgText('지휘관 프로필 이미지','COMMANDER EMBLEM'),'FIELD OF IMMORTALS · IDENTITY');panel.classList.add('cg-avatar-picker');let selected=cgAvatarKey();
 const preview=cgNode('div',undefined,'cg-avatar-preview'),art=cgNode('div'),copy=cgNode('div'),name=cgNode('h3'),sub=cgNode('p','', 'cg-note'),progress=cgNode('progress');progress.setAttribute('aria-label',cgText('이미지 해금 진행','Portrait unlock progress'));copy.append(name,sub,progress);preview.append(art,copy);panel.append(preview);
 panel.append(cgNode('p',cgText('스토리 달성·포획 카드·유닛 소환·진급으로 모으는 프로필 이미지입니다. 기존 달성 기록도 반영됩니다.','Collect emblems through story achievements, capture cards, unit draws and promotions. Previous achievements count.'),'cg-note'));
 const tiles=[],actions=cgNode('div',undefined,'cg-avatar-apply'),status=cgNode('span','', 'cg-note');status.setAttribute('role','status');
 const apply=cgButton(cgText('선택한 이미지 사용','Use selected image'),()=>{
  if(!cgAvatarKnown(selected)||!cgAvatarRule(selected).open)return;META.avatar=selected;metaSave();cgSyncIdentity();cgSyncAvatars();cgScheduleProfile();if(CG.saveError){status.textContent=cgText('이미지는 적용됐지만 저장에 실패했습니다. 다시 시도해 주세요.','Image applied but saving failed. Please retry.');return;}cgCloseHub();
 },'cg-button cg-primary');apply.id='cgAvatarApply';
 const refresh=()=>{const rule=cgAvatarRule(selected);art.replaceChildren(cgAvatarNode(selected));name.textContent=cgAvatarName(selected);sub.textContent=(rule.open?cgText('해금 완료 · ','Unlocked · '):'')+rule.label+' · '+rule.done+'/'+rule.total+(rule.detail?'\n'+rule.detail:'');progress.max=rule.total;progress.value=rule.done;apply.disabled=!rule.open;apply.textContent=rule.open?cgText('선택한 이미지 사용','Use selected image'):cgText('해금 조건을 달성하세요','Complete the unlock condition');status.textContent=rule.open?'':cgText('미리보기 · 아직 사용할 수 없습니다','Preview · locked');for(const b of tiles)b.setAttribute('aria-pressed',String(b.dataset.avatarChoice===selected));};
 for(const [title,keys]of [[cgText('진영 마크','FACTION INSIGNIA'),Object.keys(CG_EMBLEMS)],[cgText('레전드 유닛','LEGEND PORTRAITS'),heroVisibleKeys()],[cgText('일반 유닛 · 강화 3단계','UNIT PORTRAITS · 3 PROMOTIONS'),UNIT_POOL]]){
  const opened=keys.filter(k=>cgAvatarRule(k).open).length;panel.append(cgNode('h3',title+' · '+opened+'/'+keys.length,'cg-avatar-section'));const grid=cgNode('div',undefined,'cg-avatar-grid');
  for(const key of keys){const rule=cgAvatarRule(key),b=cgButton('',()=>{selected=key;refresh();},'cg-avatar-choice'+(rule.open?'':' cg-avatar-locked'));b.dataset.avatarChoice=key;b.setAttribute('aria-label',cgAvatarName(key)+' · '+rule.label+' '+rule.done+'/'+rule.total);b.append(cgAvatarNode(key),cgNode('span',cgAvatarName(key)),cgNode('small',rule.open?cgText('사용 가능','Unlocked'):rule.done+'/'+rule.total+' · '+rule.label,'cg-avatar-condition'));tiles.push(b);grid.append(b);}panel.append(grid);
 }
 if(!heroUnlocked())panel.append(cgNode('p',cgText('아스트라 세이버·네메시스 베일은 벨카코어 획득 후 공개되며, 각 영웅을 처음 획득하면 이미지가 해금됩니다.','Astra Saber and Nemesis Veil appear after the Velca Core; obtain each hero to unlock its portrait.'),'cg-note'));
 actions.append(status,apply);panel.append(actions);refresh();
}

/* Identity, personal records and the optional shared personal records service. */

const CG_POWER_BASE={C:100,R:220,E:450,P:800,L:1800};
const cgCommunity={metric:'score',request:0,run:null,publishTimer:null,error:null};
const cgText=(ko,en)=>LANG==='ko'?ko:en;
const cgNumber=n=>Math.max(0,Math.floor(Number(n)||0)).toLocaleString();
function cgCleanName(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ');}
function cgValidName(value){return /^[\p{L}\p{N} ._-]{2,20}$/u.test(value)&&[...value].length<=20;}
function cgDisplayName(){return (typeof META.callsign==='string'&&cgValidName(META.callsign)?META.callsign:'')||CG.user?.username||cgText('게스트 지휘관','Guest commander');}
function cgNode(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function cgButton(text,fn,cls='cg-button'){const b=cgNode('button',text,cls);b.type='button';b.onclick=fn;return b;}
function cgCollection(){
 const rows=[];
 for(const [kind,keys] of [['unit',UNIT_POOL],['legend',heroVisibleKeys()]])for(const key of keys){
  if(!hasOf(kind,key))continue;const grade=gradeOf(key),lv=Math.max(0,Math.min(maxSteps(grade),recOf(kind,key).lv|0));
  rows.push({kind,key,lv,power:Math.round(CG_POWER_BASE[grade]*(1+RANK_STEP*(startRank(grade)+lv)+GRADE_TIER[grade].bonus))});
 }
 return rows;
}
function cgCollectionPower(){return cgCollection().reduce((sum,row)=>sum+row.power,0);}
function cgRankCatalog(){const out={};for(const [kind,keys]of [['unit',UNIT_POOL],['legend',[...new Set([...LEGEND_KEYS,...HERO_KEYS])]]])for(const key of keys){const g=gradeOf(key);out[key]={kind,base:CG_POWER_BASE[g],start:startRank(g),max:maxSteps(g),step:RANK_STEP,bonus:GRADE_TIER[g].bonus};}return out;}
function cgPersonal(){return {score:Math.max(0,META.infinityBestScore||0),power:cgCollectionPower(),stage:Math.max(0,META.infinityCleared||0)};}
function cgSyncIdentity(){
 const stamp=LANG+'|'+cgDisplayName()+'|'+cgAvatarKey()+'|'+(S&&['play','pause'].includes(mode))+'|'+(CG.user?.username||'');if(cgCommunity.identityStamp===stamp)return;cgCommunity.identityStamp=stamp;
 const label=$('txCmdr');if(label){label.textContent=cgDisplayName();label.title=cgDisplayName();}
 const hud=$('cgCallsign');if(hud){hud.replaceChildren(cgCurrentAvatar(),cgNode('span',cgDisplayName(),'cg-identity-name'));hud.hidden=!S||!['play','pause'].includes(mode);}
 cgSyncAvatars();$('btProfile')?.setAttribute('aria-label',cgText('프로필 설정 · ','Profile settings · ')+cgDisplayName());
 const account=$('cgAccountName');if(account)account.textContent=CG.user?.username||cgText('로그인하지 않음','Not signed in');
 const dock=$('cgCommunityDock');if(dock){dock.children[0].textContent=cgText('개인 기록','PERSONAL RECORDS');dock.children[1].textContent=cgText('시즌 2 · 미지의 신호','SEASON 2 · UNKNOWN SIGNAL');}
}
function cgProfileControls(parent){
 const box=cgNode('section',undefined,'cg-profile');box.append(cgNode('small',cgText('개인 프로필','LOCAL PROFILE')),cgNode('b',cgDisplayName()),cgNode('p',cgText('진행 상황과 기록은 이 브라우저에 저장됩니다. 다른 기기와 자동으로 동기화되지 않습니다.','Your progress and personal records are saved in this browser, without automatic cross-device sync.'),'cg-note'));
 cgAvatarProfileControls(box);parent.append(box,cgButton(cgText('개인 기록','Personal records'),()=>cgOpenLeaderboard()),cgButton(cgText('시즌 2 · 미지의 신호','Season 2 · Unknown signal'),()=>cgOpenSeason()));
}
let cgHubClose=null;
function cgCloseHub(){const close=cgHubClose;cgHubClose=null;$('cgHub')?.remove();cgCommunity.request++;if(close)close();}
function cgHub(title,eyebrow,onClose){
 cgCloseHub();const previous=document.activeElement,root=cgNode('div',undefined,'cg-hub');root.id='cgHub';
 const panel=cgNode('section',undefined,'cg-hub-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','cgHubTitle');panel.tabIndex=-1;
 const top=cgNode('header'),heading=cgNode('div');heading.append(cgNode('small',eyebrow));const h=cgNode('h2',title);h.id='cgHubTitle';heading.append(h);
 const close=cgButton('✕',cgCloseHub,'cg-close');close.setAttribute('aria-label',T('close'));top.append(heading,close);panel.append(top);root.append(panel);document.body.append(root);
 cgHubClose=()=>{onClose?.();if(previous?.isConnected)previous.focus();};
 root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cgCloseHub();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});close.focus();return panel;
}
function cgOpenSeason(continueRun){
 const started=performance.now();const panel=cgHub(cgText('구원자의 그림자','SHADOW OF THE SAVIOR'),'SEASON 2 · TRANSMISSION 002',()=>{if(continueRun){S.runStart+=performance.now()-started;continueRun();}});
 panel.classList.add('cg-season');
 const art=cgNode('img');art.src=ART.L_nemesis;art.alt='NEMESIS VEIL';panel.append(art);
 panel.append(cgNode('p',cgText('과연 네겐트리스는 누구인가?','Who are the Negentris?'),'cg-season-question'),cgNode('p',cgText('우리를 구한 네메시스 베일. 과연 그는… 동맹인가, 새로운 위협인가?','Nemesis Veil saved us. Is he an ally… or the next threat?')),
 cgNode('blockquote',cgText('“너희의 존재를 내가 알려주지.”','“I will make your existence known.”')),
 cgNode('p',cgText('벨카코어의 기록 속에서 낯선 좌표가 깨어난다. 승리의 끝에서, 진실을 향한 전쟁이 시작된다.','Unknown coordinates awaken within the Velca Core. At the edge of victory, the war for the truth begins.')),
 cgNode('p',cgText('시즌 2 스토리 예고입니다. 인피니티 전투는 61스테이지부터 계속됩니다.','A preview of the Season 2 story. Infinity combat continues from Stage 61.'),'cg-note'));
 const go=cgButton(continueRun?cgText('61스테이지 · 계속 출격','DEPLOY · STAGE 61'):T('close'),cgCloseHub,'cg-button cg-primary');go.id='cgSeasonContinue';panel.append(go);
}
function cgSeasonGate(){if(S.story||S.stage!==60||S.cgSeasonShown)return false;S.cgSeasonShown=true;META.season2Signal=true;metaSave();mode='interlude';show(null);cgOpenSeason(()=>advanceAfterUpgrade());return true;}
function cgScheduleProfile(){}
function cgBeginRankedRun(){cgCommunity.run=null;}
function cgFlushRun(){}
function cgRecordRun(cleared){if(S.story)return;META.infinityBestScore=Math.max(META.infinityBestScore||0,Math.floor(S.score));if(cleared){S.cgCleared=S.stage;META.infinityCleared=Math.max(META.infinityCleared||0,S.stage);}metaSave();}
function cgLeaderboardName(metric){return metric==='score'?cgText('최고 점수','HIGH SCORE'):metric==='power'?cgText('유닛 전투력','UNIT POWER'):cgText('인피니티 돌파','INFINITY CLEARED');}
function cgOpenLeaderboard(){
 const panel=cgHub(cgText('개인 전투 기록','PERSONAL RECORDS'),'FIELD OF IMMORTALS');const personal=cgPersonal();
 for(const metric of ['score','power','stage']){const card=cgNode('div',undefined,'cg-personal');card.append(cgNode('span',cgLeaderboardName(metric)),cgNode('strong',cgNumber(personal[metric])));panel.append(card);}
 panel.append(cgNode('p',cgText('이 브라우저에서 달성한 최고 기록입니다. 온라인 순위가 아니며, 브라우저 데이터를 지우면 기록도 삭제됩니다.','Your best results in this browser. These are personal records, not an online ranking. Clearing browser data also clears progress.'),'cg-note'));
}

function cgCommunityInit(){
 const badge=cgCurrentAvatar('cg-menu-avatar');badge.setAttribute('aria-hidden','true');$('btProfile').append(badge);
 const dock=cgNode('nav',undefined,'cg-community-dock');dock.id='cgCommunityDock';dock.append(cgButton('',()=>cgOpenLeaderboard()),cgButton('',()=>cgOpenSeason()));$('mstage').append(dock);
 const hud=cgNode('span',undefined,'cg-callsign');hud.id='cgCallsign';hud.hidden=true;$('stage').append(hud);
 cgSyncIdentity();addEventListener('foi-user-changed',()=>{cgCommunity.run=null;cgCommunity.error=null;fitMenuText();cgSyncIdentity();});
 addEventListener('online',()=>{cgFlushRun();cgScheduleProfile();});
}

Object.assign(ART,{"ill_turretBase":"assets/763390de958badb1998cda7f.webp","ill_missile0":"assets/9afba142ca02527f20f798ac.webp","ill_missile1":"assets/822d598d105c5c44294846d1.webp","ill_blast0":"assets/7328692d64c3e97e78d4bf92.webp","ill_blast1":"assets/6663b2cb8ef3a9019ec37b26.webp"});
/* Basic Focus: an isolated, capture-first edition. The original release is untouched. */
const basicText=(ko,en)=>LANG==='ko'?ko:en;
loadArt=async function(){
  const keep=k=>/^(ad_|grass_|border_|p_|cg_|ill_|inf_w|e_)/.test(k)||BASIC_CONTENT.units.some(u=>u.key===k)||EVO_LEGENDS.includes(k)||/^(L_titan|infantry)_pose[1-5]$/.test(k)||[...HERO_KEYS,...VELCA_KEYS,'i_summon','velca_core',...RELIC_KEYS.map(k=>RELICS[k].ic),'main','wall_closed','wall_open','turrets','i_pwr','i_rate','i_shld','i_heal','i_way','i_spd','i_slot','i_apwr','i_ice','i_poison','i_fire','c_ast','c_cred'].includes(k);
  const names=Object.keys(ART).filter(keep);
  for(let i=0;i<names.length;i+=6){await Promise.all(names.slice(i,i+6).map(loadOneArt));$('loadPct').textContent=Math.min(100,Math.round((i+6)/names.length*100))+'%';await new Promise(r=>setTimeout(r,0));}
};
let basicReady=false,basicLessonKey='',basicHUDKey='';
const basicNode=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const basicButton=(text,fn,cls)=>{const b=basicNode('button',text,cls);b.type='button';b.onclick=fn;return b;};
function basicLabels(){
  const layout=META.basicKeys||'qwerty';
  return layout==='azerty'?['Z','Q','S','D']:layout==='ijkl'?['I','J','K','L']:['W','A','S','D'];
}
function basicControls(){
  return isTouch?basicText('왼손: 이동 · 오른손: 조준하고 포획','Left: move · Right: aim & capture'):
    basicLabels().join(' ')+' / ↑ ← ↓ → '+basicText('이동 · 마우스를 누르고 포획 · P 일시정지','move · Hold mouse to capture · P pause');
}
function basicPlay(){
  cgCloseHub();clearBattleInput();newGame();show(null);document.activeElement?.blur();
  if(!actx)setBattleSound(true);else cgResumeAudio();
  basicSyncHUD();
}
function basicMenu(){
  if(!basicReady)return;
  const host=$('basicMenu');host.replaceChildren();
  const top=basicNode('header',null,'basic-menu-top');
  top.append(basicNode('span','FIELD OF IMMORTALS','basic-wordmark'));
  const lang=basicNode('select');lang.id='basicLanguage';lang.setAttribute('aria-label','Language');
  for(const [value,name] of [['en','English'],['ko','한국어']]){const o=basicNode('option',name);o.value=value;lang.append(o);}
  lang.value=LANG==='ko'?'ko':'en';lang.onchange=()=>{LANG=lang.value;META.lang=LANG;metaSave();applyStaticLang();basicMenu();};
  top.append(lang);host.append(top);
  const body=basicNode('div',null,'basic-menu-body'),copy=basicNode('section',null,'basic-intro');
  copy.append(basicNode('span',basicText('포획하고, 함께 싸우세요.','CAPTURE. COMMAND. SURVIVE.'),'basic-eyebrow'));
  const heading=basicNode('h1');heading.append(basicNode('span',basicText('적을 포획해','Turn enemies')),basicNode('span',basicText('나의 편대로.','into allies.')));copy.append(heading);
  copy.append(basicNode('p',basicText('사격은 자동입니다. 움직이며 적을 포획하고, 함께 기지를 무너뜨리세요.','Your weapons fire automatically. Keep moving, capture a squad, and take down the enemy base.')));
  const play=basicButton(basicText('바로 출격  →','PLAY NOW  →'),basicPlay,'basic-play');play.id='basicPlay';copy.append(play);
  copy.append(basicNode('small',META.tutorialDone?basicText('최고 도달: 스테이지 ','BEST STAGE: ')+(META.bestStage||1):basicText('첫 출격에서 바로 배워요 · 안내 건너뛰기 가능','Learn as you play · Skip the guide anytime'),'basic-start-note'));
  const visual=basicNode('div',null,'basic-menu-art');visual.setAttribute('aria-hidden','true');
  const ring=basicNode('div',null,'basic-art-ring');visual.append(ring);
  for(const [key,cls] of [['infantry','basic-escort one'],['tank','basic-escort two'],['main','basic-commander']]){const im=basicNode('img',null,cls);im.src=ART[key];im.alt='';visual.append(im);}
  visual.append(basicNode('span',basicText('포획한 적이 함께 전투합니다','CAPTURED UNITS FIGHT FOR YOU'),'basic-art-label'));
  body.append(copy,visual);host.append(body);
  const bottom=basicNode('footer',null,'basic-menu-bottom');bottom.append(basicNode('p',basicControls()));
  const settings=basicButton(basicText('조작 · 설정','Controls & settings'),()=>basicOpenSettings(),'basic-secondary');settings.id='basicSettings';bottom.append(settings);host.append(bottom);
}
function basicSettingsContent(root){
  root.classList.add('basic-settings');
  root.append(basicNode('p',basicControls(),'basic-help'));
  root.append(basicNode('p',basicText('적에게 포획 부채꼴을 유지하면 아군이 됩니다. 손을 떼면 다시 자동 사격합니다.','Keep the capture cone on an enemy to recruit it. Release to resume automatic fire.'),'basic-help'));
  const row=(label,control)=>{const r=basicNode('label',null,'basic-setting-row');r.append(basicNode('span',label),control);root.append(r);};
  const layout=basicNode('select');layout.id='basicKeys';
  for(const [value,name] of [['qwerty','WASD / QWERTY / QWERTZ'],['azerty','ZQSD / AZERTY'],['ijkl','IJKL + arrows']]){const o=basicNode('option',name);o.value=value;layout.append(o);}
  layout.value=META.basicKeys||'qwerty';layout.onchange=()=>{clearBattleInput();META.basicKeys=layout.value;metaSave();basicLessonKey='';const ps=root.querySelectorAll('.basic-help');ps[0].textContent=basicControls();if(mode==='menu')basicMenu();};row(basicText('이동 키','Movement keys'),layout);
  const sound=basicButton(soundOn?basicText('켜짐','On'):basicText('꺼짐','Off'),()=>{setBattleSound(!soundOn);sound.textContent=soundOn?basicText('켜짐','On'):basicText('꺼짐','Off');});sound.id='basicSound';row(basicText('소리','Sound'),sound);
  for(const [key,label,value,fn] of [['Music',basicText('배경 음악','Music'),VOL_MUS,v=>{VOL_MUS=v;META.volMus=v;}],['Sfx',basicText('효과음','Effects'),VOL_SFX,v=>{VOL_SFX=v;META.volSfx=v;}]]){
    const box=basicNode('span',null,'basic-volume'),slider=basicNode('input'),output=basicNode('output');slider.type='range';slider.id='basic'+key;slider.min=0;slider.max=100;slider.step=5;slider.value=Math.round(value*100);output.textContent=slider.value+'%';output.htmlFor=slider.id;slider.oninput=()=>{fn(+slider.value/100);applyVolumes();metaSave();output.textContent=slider.value+'%';};box.append(slider,output);row(label,box);
  }
  const motion=basicNode('input');motion.id='basicMotion';motion.type='checkbox';motion.checked=!!META.basicReduceMotion;motion.onchange=()=>{META.basicReduceMotion=motion.checked;metaSave();};row(basicText('화면 흔들림 끄기','Disable screen shake'),motion);
  root.append(basicNode('p',basicText('방향키는 항상 사용 가능합니다. Esc는 브라우저 전체화면 종료에 사용됩니다.','Arrow keys always work. Esc remains available to leave browser fullscreen.'),'basic-help'));
  if(mode==='menu')root.append(basicButton(basicText('다음 출격에서 안내 다시 보기','Replay guide next run'),()=>{META.tutorialDone=false;metaSave();cgCloseHub();basicMenu();},'basic-secondary'));
}
function basicOpenSettings(){const p=cgHub(basicText('조작과 설정','Controls & settings'),'FIELD OF IMMORTALS');basicSettingsContent(p);}
renderPauseSettings=function(){const r=$('pauseSettings');r.replaceChildren();$('pauseTitle').textContent=basicText('잠시 쉬어가기','Paused');$('btResume').textContent=basicText('계속하기 · P','Resume · P');$('btPauseMenu').textContent=basicText('출격 종료 · 메뉴','End run · Menu');basicSettingsContent(r);};
const basicOriginalMenu=showMenu;
showMenu=function(){basicOriginalMenu();clearBattleInput();basicMenu();basicSyncHUD();};
const basicOriginalLang=applyStaticLang;
applyStaticLang=function(){basicOriginalLang();basicLessonKey='';if($('ctrlHelp'))$('ctrlHelp').textContent=basicControls();};
const basicOriginalNewGame=newGame;
newGame=function(...args){clearBattleInput();basicOriginalNewGame(...args);basicLessonKey='';basicHUDKey='';if(S.tutorial){S.props=S.props.filter(p=>Math.hypot(p.x-S.px,p.y-S.py)>240);S.spawnCd=999999;}basicSyncHUD();};
const basicOriginalStage=startStage;
startStage=function(n){
  const carry=basicCarryItems();
  const squad=(S.allies||[]).filter(a=>a.hp>0&&!a.isLegend).map(a=>({type:a.type,face:a.face}));
  basicOriginalStage(n);n=S.stage;
  basicRestoreItems(carry);
  S.props=S.props.filter(p=>p.key!=='ad_board');S.floorAds=[];
  S.killNeed=Math.min(28,8+Math.max(0,n-1)*4);
  // Stage transitions rebuild world objects, then restore the surviving squad.
  for(let i=0;i<squad.length;i++){const a=i*2.399,u=makeUnit(squad[i].type,S.px+Math.cos(a)*65,S.py+Math.sin(a)*65,'ally');u.face=squad[i].face;pushAlly(u);}
  S.hp=Math.min(maxHp(),S.hp+maxHp()*.25);
  if(n>1){S.basicCarryNotice=4200;S.basicCarryCount=squad.length;}
};
// Advanced progression remains in the original edition. This edition has one loop.
spawnLegend=function(){};
velcaMaybeEncounter=function(){};
/* Velcarion encounters restored, with progression gates. */
heroBossStage=function(){return false;};
cgSeasonGate=function(){return false;};
const basicOriginalDamage=damageUnit;
damageUnit=function(e,dmg,el,silent){
  // Squad fire must not destroy the regular unit the player is recruiting.
  if(S?.beam&&e===S.basicCaptureTarget&&e.cap>0&&!e.isLegend)return;
  basicOriginalDamage(e,dmg,el,silent);
};
pickType=function(n){const pool=n<2?['infantry']:n<3?['infantry','apc']:n<4?['infantry','apc','heli']:['infantry','apc','heli','tank'];return pool[Math.floor(Math.random()*pool.length)];};
spawnTutorialTarget=function(){
  if(!S||!S.tutorial||S.tutStep!==1||S.enemies.some(e=>e.tutorial))return;
  const e=makeUnit('infantry',S.px+96,S.py-68,'neutral');e.life=99999999;e.tutorial=true;e.hp=e.hpMax=9999;e.spd=0;e.label=basicText('포획해 보세요','CAPTURE ME');S.enemies.push(e);S.tutorialTargetSpawned=true;
};
function basicFinishGuide(skipped=false){
  if(!S||!S.tutorial)return;
  S.enemies=S.enemies.filter(e=>!e.tutorial);S.items=S.items.filter(e=>!e.tutorial);
  S.tutorial=false;S.tutStep=4;S.spawnCd=900;S.legendCd=999999;S.invuln=Math.max(S.invuln,2000);
  META.tutorialDone=true;META.basicGuideVersion=1;metaSave();S.stageStart=performance.now();S.hits=0;
  $('tutorial').classList.remove('on');$('tutorialOverlay').classList.remove('on');
  $('basicGuide').hidden=true;basicLessonKey='';clearBattleInput();document.activeElement?.blur();
  S.basicCarryNotice=4000;S.basicCarryCount=skipped?-1:S.allies.length;
}
updateTutorial=function(dt){
  if(!basicReady)return;
  const guide=$('basicGuide');guide.hidden=!S||mode!=='play'||!S.tutorial;
  if(guide.hidden)return;
  $('tutorial').classList.remove('on');$('hint').style.opacity='0';
  if(S.tutStep===0&&Math.hypot(S.px-S.tutX,S.py-S.tutY)>45){S.tutStep=1;spawnTutorialTarget();}
  if(S.tutStep===1)spawnTutorialTarget();
  if(S.tutStep===2){
    S.basicLessonMs=(S.basicLessonMs||0)+dt;
    if(!S.basicDemoEnemy){const e=makeUnit('infantry',S.px,S.py-190,'enemy');e.hp=e.hpMax=12;e.fireCd=2500;S.enemies.push(e);S.basicDemoEnemy=true;S.invuln=4500;}
    if(S.basicLessonMs>7000||(S.kills>0&&S.basicLessonMs>1800)){basicFinishGuide();return;}
  }
  const key=S.tutStep+'|'+LANG+'|'+META.basicKeys;if(key===basicLessonKey)return;basicLessonKey=key;guide.replaceChildren();
  const top=basicNode('div',null,'basic-guide-top');top.append(basicNode('span',String(S.tutStep+1).padStart(2,'0')+' / 03'));
  const skip=basicButton(basicText('건너뛰기','Skip guide'),()=>basicFinishGuide(true));skip.id='basicSkip';top.append(skip);guide.append(top);
  const titles=[basicText('움직여 보세요','Keep moving'),basicText('적을 내 편으로','Recruit your first ally'),basicText('이제 함께 싸워요','Your squad fights with you')];
  guide.append(basicNode('h2',titles[S.tutStep]||titles[2]));
  if(S.tutStep===0){
    const keysBox=basicNode('div',null,'basic-key-demo');for(const k of (isTouch?['↕','↔']:basicLabels()))keysBox.append(basicNode('kbd',k));guide.append(keysBox);
    guide.append(basicNode('p',isTouch?basicText('화면 왼쪽을 누르고 드래그하세요.','Drag on the left side of the screen.'):basicText('표시된 키 또는 방향키로 이동하세요.','Use these keys or the arrow keys.')));
  }else if(S.tutStep===1){
    const diagram=basicNode('div',null,'basic-capture-demo');diagram.innerHTML='<span>◎</span><i>› › ›</i><span>⌖</span><b>+</b>';guide.append(diagram);
    guide.append(basicNode('p',isTouch?basicText('오른쪽을 드래그해 표시된 적을 조준하세요.','Drag on the right to aim at the marked unit.'):basicText('표시된 적을 조준하고 마우스 왼쪽 버튼을 누르고 계세요.','Aim at the marked unit and hold the left mouse button.')));
  }else guide.append(basicNode('p',basicText('포획 버튼을 떼세요. 편대가 자동으로 싸웁니다!','Release capture. Your squad fires automatically!')));
};
function basicDrawLessonTarget(){
  if(!S?.tutorial||S.tutStep!==1)return;const e=S.enemies.find(e=>e.tutorial);if(!e)return;
  const x=e.x-S.cam.x,y=e.y-S.cam.y,p=Math.min(1,(e.cap||0)/capFill());ctx.save();ctx.strokeStyle='#ffe197';ctx.lineWidth=2;
  const r=25+Math.sin(VISUAL.time*.004)*2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#8dffc4';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();
  ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff1ce';ctx.fillText(basicText('포획','CAPTURE'),x,y-37);ctx.restore();
}
function basicSyncHUD(){
  if(!basicReady)return;
  const playing=!!S&&mode==='play';$('basicHUD').hidden=!playing;$('basicObjective').hidden=!playing;
  $('basicGuide').hidden=!playing||!S.tutorial;$('cgCallsign').hidden=true;
  if(!playing)return;
  const hp=Math.max(0,Math.ceil(S.hp)),cap=allyCap(),key=[hp,Math.ceil(maxHp()),S.score,S.allies.length,cap,S.stage,LANG].join('|');
  if(key!==basicHUDKey){basicHUDKey=key;$('basicHPLabel').textContent=basicText('내구도','HULL');$('basicHP').textContent=hp+' / '+Math.ceil(maxHp());$('basicHealth').value=hp;$('basicHealth').max=maxHp();$('basicScore').textContent=basicText('점수 ','SCORE ')+fmt(S.score);$('basicSquad').textContent=basicText('편대 ','SQUAD ')+S.allies.length+' / '+cap;$('basicStage').textContent=basicText('스테이지 ','STAGE ')+S.stage;}
  const el=$('basicObjective'),arrow=$('basicCompass'),copy=$('basicGoal');
  let goal='',target=null;
  if(S.tutorial)goal=basicText('첫 출격 · 이동 → 포획 → 함께 전투','FIRST SORTIE · Move → Capture → Fight');
  else if(S.phase==='hunt'){goal=basicText('적을 포획하거나 처치하세요 ','Capture or defeat enemies ')+Math.min(S.killed,S.killNeed)+' / '+S.killNeed;target=S.enemies.find(e=>e.side==='enemy');}
  else if(S.base){const left=S.turrets.filter(t=>t.alive).length;goal=left?basicText('적 기지 · 남은 포탑 ','ENEMY BASE · Turrets left ')+left:basicText('열린 기지 입구로 이동하세요','Move into the open base entrance');target=S.base;}
  if(copy.textContent!==goal)copy.textContent=goal;
  arrow.hidden=!target;if(target)arrow.style.transform='rotate('+(Math.atan2(target.y-S.py,target.x-S.px)+Math.PI/2)+'rad)';
  el.classList.toggle('basic-base-goal',S.phase==='boss');
  const notice=$('basicNotice');notice.hidden=!S.basicCarryNotice||!!S.tutorial;
  if(!notice.hidden)notice.textContent=S.basicCarryCount<0?basicText('포획은 약 1초. 적을 아군으로 바꾸세요!','Hold capture for about a second to recruit an ally!'):basicText('편대와 함께 출격! ','Squad ready! ')+S.basicCarryCount+basicText('기 동행 · 기지를 향해 전진하세요.',' allies · Advance toward the base.');
}
const basicOriginalStep=cgStepFrame;
cgStepFrame=function(elapsed){basicOriginalStep(elapsed);if(S&&mode==='play')S.basicCarryNotice=Math.max(0,(S.basicCarryNotice||0)-Math.min(96,elapsed));basicSyncHUD();};
const basicOriginalRoll=rollUpgrades;
rollUpgrades=function(){basicOriginalRoll();$('upTitle').textContent=basicText('다음 전투를 위한 강화 하나','Choose one upgrade');$('upEyebrow').textContent=basicText('스테이지 ','STAGE ')+S.stage+basicText(' 완료 · 편대가 계속 동행합니다',' CLEAR · Your squad stays with you');};
function basicInit(){
  document.body.classList.add('basic-focus');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches&&META.basicReduceMotion==null)META.basicReduceMotion=true;
  if(!META.basicKeys)META.basicKeys=/^fr\b/i.test(navigator.language)?'azerty':'qwerty';
  const menu=basicNode('main');menu.id='basicMenu';$('lyMenu').append(menu);
  const hud=basicNode('section');hud.id='basicHUD';hud.hidden=true;hud.setAttribute('aria-label',basicText('전투 현황','Battle status'));
  hud.innerHTML='<div class="basic-health-block"><small id="basicHPLabel"></small><strong id="basicHP"></strong><progress id="basicHealth" aria-label="Hull"></progress></div><div class="basic-hud-stats"><b id="basicStage"></b><span id="basicSquad"></span><span id="basicScore"></span></div>';
  const objective=basicNode('div');objective.id='basicObjective';objective.hidden=true;objective.innerHTML='<span id="basicCompass" aria-hidden="true">↑</span><span id="basicGoal"></span>';
  const guide=basicNode('aside');guide.id='basicGuide';guide.hidden=true;guide.setAttribute('aria-live','polite');
  const notice=basicNode('div');notice.id='basicNotice';notice.hidden=true;notice.setAttribute('role','status');
  $('stage').append(hud,objective,guide,notice);basicReady=true;basicMenu();
  // Do not intercept fullscreen's Escape key even when the settings dialog is open.
  document.addEventListener('keydown',e=>{if(e.code==='Escape'&&$('cgHub'))e.stopImmediatePropagation();},true);
}

/* Keep the original painted title screen and metal HUD; Basic progression stays simple. */
basicMenu=function(){
  if(!basicReady)return;
  for(const [id,text] of Object.entries({txStoryT:basicText('바로 출격','DEPLOY'),txStoryD:basicText('적을 포획하고 편대를 키우세요','Capture enemies. Build your squad.'),txInfT:basicText('조작 · 설정','CONTROLS & SETTINGS'),txInfD:basicText('간단한 조작과 소리 설정','Movement, capture and audio'),txTab1:basicText('작전 안내','GUIDE'),txTab2:basicText('편대','SQUAD'),txTab3:basicText('기록','RECORDS'),txTab4:basicText('설정','SETTINGS')}))$(id).textContent=text;
  $('btStory').onclick=basicPlay;$('btStory').setAttribute('aria-label',basicText('바로 출격','Deploy'));
  $('btInf').onclick=basicOpenSettings;$('btInf').setAttribute('aria-label',basicText('조작과 설정','Controls and settings'));
  const actions={shop:()=>basicOpenFieldGuide(),unit:()=>basicOpenFieldGuide(true),relic:()=>basicOpenRecords(),set:basicOpenSettings};
  document.querySelectorAll('.hot[data-p]').forEach(b=>{b.onclick=actions[b.dataset.p];b.setAttribute('aria-label',b.dataset.p);});
  $('btProfile').onclick=basicOpenRecords;$('btCurrency').onclick=basicOpenRecords;
  // Small keyboard-accessible utility bar, anchored to the menu's bottom edge.
  let footer=$('basicCompactFooter');
  if(!footer){footer=basicNode('nav',null,'basic-compact-footer');footer.id='basicCompactFooter';
    const records=basicButton('',basicOpenRecords),settings=basicButton('',basicOpenSettings);records.id='basicRecords';settings.id='basicMenuSettings';footer.append(records,settings);$('mstage').append(footer);}
  footer.setAttribute('aria-label',basicText('메뉴','Menu'));
  const buttons=[$('basicRecords'),$('basicMenuSettings')];
  buttons[0].id='basicRecords';buttons[0].textContent='▥  '+basicText('기록','RECORDS');
  buttons[1].id='basicMenuSettings';buttons[1].textContent='⚙  '+basicText('설정','SETTINGS');
};
function basicOpenRecords(){const p=cgHub(basicText('전투 기록','Battle records'),'FIELD OF IMMORTALS');p.append(basicNode('p',basicText('최고 점수: ','Best score: ')+fmt(META.best||0),'basic-help'),basicNode('p',basicText('최고 도달 스테이지: ','Highest stage: ')+(META.bestStage||0),'basic-help'));}
function basicOpenFieldGuide(squad=false){const p=cgHub(basicText(squad?'우리 편대':'작전 안내',squad?'Your squad':'Field guide'),'FIELD OF IMMORTALS');
  p.append(basicNode('p',basicText('이동하며 공격을 피하세요. 마우스로 적을 조준하고 포획 버튼을 약 1초 유지하면 아군이 됩니다. 살아남은 아군은 다음 전투에도 동행합니다.','Move to dodge fire. Aim and hold capture for about a second to recruit enemies. Surviving allies stay with you in the next stage.'),'basic-help'));
  const grid=basicNode('div',null,'ill-squad-grid');for(const key of ['infantry','apc','tank','heli']){const card=basicNode('figure'),im=basicNode('img');im.src=ART[key];im.alt=nm(key);card.append(im,basicNode('figcaption',nm(key)));grid.append(card);}p.append(grid);
}
const illBasicFit=fitMenuText;
fitMenuText=function(){illBasicFit();if(basicReady)basicMenu();};
const illSettings=basicSettingsContent;
basicSettingsContent=function(root){illSettings(root);const label=basicNode('label',null,'basic-setting-row'),sel=basicNode('select');sel.id='basicLanguage';sel.setAttribute('aria-label','Language');for(const [k,n] of [['ko','한국어'],['en','English']]){const o=basicNode('option',n);o.value=k;sel.append(o);}sel.value=LANG==='ko'?'ko':'en';sel.onchange=()=>{LANG=sel.value;META.lang=LANG;metaSave();applyStaticLang();fitMenuText();};label.append(basicNode('span','Language'),sel);root.prepend(label);};

/* Shared illustrated presentation for Basic and the complete-content edition.
 * Render state only: combat rules, projectile hitboxes and unlocks stay intact. */
const ILLUSTRATED={version:2,missiles:new Map(),smoke:null};
visualSolidArt=function(){}; // Authored alpha must not be filled by the old pixel repair.
animFrame=function(){return null;};
const illOriginalSprite=drawVisualSprite;
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){
  c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality=w<=112?'low':'high';
  if(u===S){
    // The illustrated chassis contains exactly one cannon and no baked-in dish.
    const v=visualState(u),shot=v.shots.shell,age=shot?VISUAL.time-shot.time:999;
    const recoil=age<210?Math.sin(Math.min(1,age/210)*Math.PI)*.65:0;
    c.drawImage(img,-w/2,-h/2-recoil,w,h);
  }else if(u.type==='infantry'){
    const v=visualState(u),stride=Math.sin(v.phase),step=Math.abs(stride)*v.speed;
    c.translate(stride*v.speed*.6,-step*.85);c.rotate(stride*v.speed*.018);
    c.drawImage(img,-w/2,-h/2,w,h);
  }else illOriginalSprite(u,img,w,h,c);
  c.restore();
};
const illOriginalFront=drawVisualFront;
drawVisualFront=function(u,w,h){if(u!==S)return illOriginalFront(u,w,h);drawMountedCaptureRadar(u,w,h,ctx);};
// Continuous projected rotation retains the existing scan/aim servo, not a flat
// rotating picture. Wider receiver with a clear curved surface and metal rim.
CAPTURE_RADAR.halfWidth=18.6;CAPTURE_RADAR.depth=8.0;CAPTURE_RADAR.segments=32;
CAPTURE_RADAR_PART.pivot=[.5,.16];
drawMountedCaptureRadar=function(u,w,h,c){
  c.save();c.translate(0,-h*.34);c.rotate(-facingAngle(u));drawCaptureRadar(u,w,c);c.restore();
};
captureRadarOrigin=function(){
  const w=ILL_PLAYER_W,h=w*IMG.main.height/IMG.main.width,a=facingAngle(S),y=-h*.34,k=w/46;
  const yaw=visualState(S).radarYaw??captureRadarYawFor(S.face||0),e=CAPTURE_RADAR.emitter;
  return {x:S.px-y*Math.sin(a)+Math.cos(yaw)*e.forward*k,y:S.py+y*Math.cos(a)+(Math.sin(yaw)*e.forward*CAPTURE_RADAR.projection-e.height)*k};
};
drawBG=function(){
  const th=S?S.theme:THEMES[0],cx=S?S.cam.x:0,cy=S?S.cam.y:performance.now()*.02;
  if(!IMG[th.grass]){ctx.fillStyle=th.fallback;ctx.fillRect(0,0,W,H);return;}
  drawVisualGround(th,cx,cy);
  for(const side of [0,1]){const x=(side?WORLD.w-40:0)-cx;if(x>W||x+40<0)continue;const g=ctx.createLinearGradient(x,0,x+40,0);g.addColorStop(side?1:0,'#071216bd');g.addColorStop(side?0:1,'#07121600');ctx.fillStyle=g;ctx.fillRect(x,0,40,H);}
};
cgTurretArt=function(){const atlas=IMG.cg_turret33;if(!atlas?.width||CG_TURRET.directions===atlas)return;
  CG_TURRET.art=atlas;CG_TURRET.directions=atlas;const poses=[],cw=atlas.width/4,ch=atlas.height/2;
  for(let i=0;i<8;i++){const cv=visualCanvas(384,384),c=cv.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(atlas,i%4*cw,Math.floor(i/4)*ch,cw,ch,0,0,384,384);poses.push(cv);}
  CG_TURRET.heads=[poses,poses,poses,poses];
};
cgDrawTurrets=function(cx,cy){cgTurretArt();if(!CG_TURRET.heads.length)return;const c=ctx;
  for(const t of S.turrets){const x=t.x-cx,y=t.y-cy;if(x<-80||x>W+80||y<-80||y>H+80)continue;
    const v=cgTurretPose(t),kick=cgTurretRecoil(v);c.save();c.translate(x,y);c.imageSmoothingEnabled=true;c.globalAlpha=t.alive?1:.32;
    if(IMG.ill_turretBase)c.drawImage(IMG.ill_turretBase,-37,-8,74,42);
    if(v.body>4)cgTurretFlash(c,t,v);
    c.drawImage(CG_TURRET.heads[t.i][v.body],-39+kick.x,-47+kick.y,78,78);
    if(t.flash>0){c.save();c.globalCompositeOperation='screen';c.globalAlpha*=Math.min(.3,t.flash/360);c.drawImage(CG_TURRET.heads[t.i][v.body],-39+kick.x,-47+kick.y,78,78);c.restore();}
    if(v.body<=4)cgTurretFlash(c,t,v);
    if(t.alive){c.globalAlpha=1;c.fillStyle='#061218';c.fillRect(-22,34,44,4);c.fillStyle=t.hp/t.hpMax>.5?'#ebc169':'#ff7561';c.fillRect(-22,34,44*Math.max(0,t.hp/t.hpMax),4);}c.restore();
  }
};
cgArcadeRound33=function(c,p,r=3.1,age=0){
  c.save();cgGlow(c,p,r*2.8,.20);const g=c.createRadialGradient(-r*.25,-r*.32,.15,0,0,r*1.15);g.addColorStop(0,p.core);g.addColorStop(.42,p.core);g.addColorStop(.63,p.color);g.addColorStop(1,p.dark);c.fillStyle=g;c.beginPath();c.ellipse(0,0,r*1.1,r,0,0,Math.PI*2);c.fill();c.strokeStyle=p.color;c.lineWidth=.7;c.stroke();
  c.globalAlpha=.55;const tail=c.createLinearGradient(-r*4,0,-r,0);tail.addColorStop(0,p.color+'00');tail.addColorStop(1,p.color);c.fillStyle=tail;c.beginPath();c.moveTo(-r,-r*.38);c.quadraticCurveTo(-r*2.2,0,-r*4,0);c.quadraticCurveTo(-r*2.2,0,-r,r*.38);c.fill();c.restore();
};
cgArcadeNeedle33=function(c,p,length=24,width=3.2,age=0){
  c.save();c.lineCap='round';c.globalCompositeOperation='lighter';c.strokeStyle=p.color;c.globalAlpha=.20;c.lineWidth=width*2.8;c.beginPath();c.moveTo(-length,0);c.lineTo(3,0);c.stroke();
  c.globalAlpha=.95;c.lineWidth=width;const g=c.createLinearGradient(-length,0,3,0);g.addColorStop(0,p.color+'00');g.addColorStop(.35,p.color);g.addColorStop(1,p.core);c.strokeStyle=g;c.stroke();c.lineWidth=Math.max(.6,width*.28);c.strokeStyle=p.core;c.beginPath();c.moveTo(-length*.62,0);c.lineTo(2,0);c.stroke();c.restore();
};
cgArcadeHeavy33=function(c,p,age=0,scale=1){c.save();c.scale(scale,scale);cgArcadeNeedle33(c,p,20,6,age);cgArcadeRound33(c,p,5,age);c.restore();};
cgSpritePlasma31=function(c,p,r,age=0){c.save();cgGlow(c,p,r*2,.34);cgArcadeRound33(c,p,r,age);c.globalCompositeOperation='lighter';c.strokeStyle=p.color;c.lineWidth=.8;for(let i=0;i<3;i++){const a=age*.008+i*2.094;c.beginPath();c.ellipse(0,0,r*1.6,r*.6,a,0,Math.PI*2);c.stroke();}c.restore();return true;};
cgSmokeArt32=function(){if(ILLUSTRATED.smoke)return ILLUSTRATED.smoke;const art=visualCanvas(96,96),c=art.getContext('2d');for(let i=0;i<7;i++){const a=i*2.399,x=48+Math.cos(a)*16,y=48+Math.sin(a)*12,g=c.createRadialGradient(x-4,y-6,1,x,y,27);g.addColorStop(0,'#a4afba77');g.addColorStop(.45,'#596a7977');g.addColorStop(1,'#26364b00');c.fillStyle=g;c.fillRect(x-27,y-27,54,54);}return ILLUSTRATED.smoke=art;};
function illMissile(p,i){const key=p.id+':'+i;if(ILLUSTRATED.missiles.has(key))return ILLUSTRATED.missiles.get(key);const im=IMG['ill_missile'+i];if(!im)return null;const art=visualCanvas(im.width,im.height),c=art.getContext('2d',{willReadFrequently:true});c.drawImage(im,0,0);if(p.id!=='enemy'){const d=c.getImageData(0,0,art.width,art.height);for(let k=0;k<d.data.length;k+=4){const r=d.data[k],g=d.data[k+1],b=d.data[k+2];if(r>g*1.5&&r>b*1.5){d.data[k]=g*.55+r*.15;d.data[k+1]=r;d.data[k+2]=g*.5+b*.35;}}c.putImageData(d,0,0);}ILLUSTRATED.missiles.set(key,art);return art;}
cgSpriteMissile32=function(c,p,age,scale=1,lit=true){const im=illMissile(p,Math.floor(age/70)%2);if(!im)return false;c.save();c.imageSmoothingEnabled=true;if(lit)cgMissileSmoke32(c,age,scale);const w=43*scale,h=w*im.height/im.width;c.drawImage(im,-w*.66,-h/2,w,h);c.restore();return true;};
cgMuzzle32=function(c,p,r,age,life,id=0){const t=Math.max(0,Math.min(1,age/life));if(t>=1)return;c.save();c.globalCompositeOperation='lighter';c.globalAlpha=1-t;cgGlow(c,p,r*1.4,.26);const end=r*(1.55-t*.6),w=r*.3;c.fillStyle=p.color;c.beginPath();c.moveTo(-1,-w*.35);c.bezierCurveTo(end*.25,-w,end*.55,-w*.45,end,0);c.bezierCurveTo(end*.55,w*.45,end*.25,w,-1,w*.35);c.fill();c.fillStyle=p.core;c.beginPath();c.ellipse(end*.22,0,end*.40,w*.23,0,0,6.283);c.fill();c.restore();};
cgBlast32=function(c,f,x,y){if(!IMG.ill_blast0)return false;const t=Math.min(1,f.age/f.life),size=f.r*(1.5+Math.sqrt(t)*1.4);c.save();c.translate(x,y);c.imageSmoothingEnabled=true;for(let i=0;i<2;i++){const a=i?Math.min(1,t*2):1-Math.min(1,t*2);c.globalAlpha=a*Math.min(1,(1-t)*3);c.drawImage(IMG['ill_blast'+i],-size/2,-size*.55,size,size);}c.globalCompositeOperation='lighter';c.globalAlpha=(1-t)**2;c.strokeStyle='#ffd793';c.lineWidth=1.4;c.beginPath();c.ellipse(0,0,f.r*(.2+t*1.6),f.r*(.15+t*.9),0,0,6.283);c.stroke();c.restore();return true;};

/* Retarget mechanical animation to the final illustrated silhouettes.
 * Distance drives feet/tires; animation time drives airborne fans. No gameplay
 * positions, attack timing, stats or random-number streams are changed here. */
const ILL_MOTION={version:3,walkKeys:Array.from({length:8},(_,i)=>'inf_w'+i)};
function illSetRig(key,patch){Object.assign(V_RIG[key],patch);}
illSetRig('infantry',{kind:'authored',stride:25,muzzle:[.14,.55]});
illSetRig('main',{recoil:2.15,parts:[{...vGun(.405,.61,.592,.988),eraseBarrel:true,tip:[.5,.955]}]});
illSetRig('apc',{stride:25,recoil:1.75,parts:[vWheel(.145,.753,.095,.213),vWheel(.847,.753,.095,.213),vGun(.426,.665,.575,.918,{tip:[.50,.899]})]});
illSetRig('tank',{stride:29,recoil:2.25,parts:[vTread(.035,.705,.204,.979),vTread(.799,.705,.966,.979),vGun(.441,.64,.595,.964,{tip:[.52,.950]})]});
illSetRig('heli',{parts:[vFan(.194,.359,.139,.104),vFan(.812,.359,.139,.104),vGun(.457,.789,.538,.977,{tip:[.50,.975]})]});
illSetRig('e_hawk',{parts:[vFan(.146,.618,.114,.124),vFan(.862,.618,.114,.124),vGun(.434,.743,.564,.979)]});
illSetRig('e_scout',{parts:[vFan(.508,.106,.282,.065),vGun(.435,.819,.575,.984)]});
illSetRig('e_spike',{parts:[vWheel(.138,.260,.081,.110),vWheel(.860,.260,.081,.110),vWheel(.138,.744,.081,.155),vWheel(.860,.744,.081,.155),vGun(.024,.482,.115,.663),vGun(.887,.482,.976,.663,{side:1})]});
illSetRig('e_rider',{parts:[vTread(.224,.746,.383,.982),vTread(.627,.746,.786,.982),vGun(.023,.429,.139,.72),vGun(.852,.429,.971,.72,{side:1})]});
for(const key of ['e_rocket','e_flak','e_mole','L_cannon']){
 const r=V_RIG[key];r.parts=r.parts.filter(p=>p.mode!=='tread');r.parts.unshift(vTread(.035,.665,.19,.965),vTread(.813,.665,.967,.965));r.recoil=Math.max(1.7,r.recoil||1);
}
for(const key of ['legend_bike','L_vulcan']){const r=V_RIG[key];r.parts=r.parts.filter(p=>p.mode!=='tread');r.parts.unshift(vTread(.400,.720,.603,.978));}
// New bodies fill their asset bounds, so the old lower-leg masks were too high
// or ended before the boots. Keep each hip socket under the original torso.
const illLegs={
 e_guard:[vLeg(.095,.623,.461,.995,-1,{pivot:[.32,.64]}),vLeg(.558,.641,.910,.995,1,{pivot:[.66,.65]})],
 e_missile:[vLeg(.243,.672,.473,.987,-1,{pivot:[.38,.69]}),vLeg(.572,.675,.864,.988,1,{pivot:[.67,.69]})],
 e_bruiser:[vLeg(.191,.633,.491,.987,-1,{pivot:[.38,.66]}),vLeg(.547,.633,.841,.987,1,{pivot:[.64,.66]})],
 e_warbrute:[vLeg(.055,.545,.343,.987,-1,{pivot:[.24,.57]}),vLeg(.686,.545,.965,.987,1,{pivot:[.76,.57]})]
};
for(const [key,legs]of Object.entries(illLegs)){const r=V_RIG[key];r.parts=[...legs,...r.parts.filter(p=>p.mode!=='leg')];r.gait={hip:.19,knee:.32,lift:1.15};}
V_RIG.L_titan.gait={hip:.16,knee:.29,lift:1.1};
V_RIG.v_crawler.gait={hip:.19,knee:.30,lift:.85};
// Hands and the painted rifle stay together. The old aiming cutout was for a
// different illustration and sliced through the new wrists/chest.
for(const key of ['e_guard','e_missile']){const r=V_RIG[key];r.parts=r.parts.filter(p=>p.mode!=='aimGun');r.muzzle=key==='e_guard'?[.96,.535]:[.88,.655];}
const illOldParts=visualParts;
visualParts=function(img,rig){
 const layers=illOldParts(img,rig);if(!layers.illPrepared){layers.illPrepared=true;const c=layers.base.getContext('2d');
  for(const {p}of layers.parts)if(p.eraseBarrel){c.save();c.globalCompositeOperation='destination-out';visualPath(c,p,img.width,img.height);c.fill();c.restore();c.save();c.fillStyle='#1c252c';c.beginPath();c.ellipse(p.pivot[0]*img.width,p.pivot[1]*img.height,img.width*.067,img.height*.039,0,0,Math.PI*2);c.fill();c.restore();}
 }return layers;
};
animFrame=function(u,sp){
 if(u.type!=='infantry')return null;const v=visualState(u);
 if(Math.max(sp,v.pivotSpeed||0)<.025)return null;
 return ILL_MOTION.walkKeys[Math.floor(((v.phase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*8)];
};
// Keep the painted V-shaped rubber pattern inside the stationary tire sidewall.
// All wheeled rigs share this roller; each side uses its own cornering travel.
drawVisualRollingTire=function(part,canvas,p,w,h,v,c=FACING_MAIN_CTX){
 if(v.speed<.012||!canvas)return;const q=canvas.getContext('2d'),iw=canvas.width,ih=canvas.height,[x,y,rx,ry]=p.ellipse;
 q.setTransform(1,0,0,1,0,0);q.globalCompositeOperation='source-over';q.clearRect(0,0,iw,ih);q.save();q.beginPath();q.ellipse(x*iw,y*ih,rx*iw*.81,ry*ih*.91,0,0,Math.PI*2);q.clip();
 const left=(x-rx)*iw,ww=rx*2*iw,band=Math.max(7,Math.round(ry*ih*.56)),sy=Math.round((y-ry*.28)*ih),off=((v.travel*ih/h)%band+band)%band;
 for(let yy=(y-ry)*ih-band+off;yy<(y+ry)*ih+band;yy+=band)q.drawImage(part,left,sy,ww,band,left,yy,ww,band+.5);
 const g=q.createLinearGradient(left,0,left+ww,0);g.addColorStop(0,'#05080be6');g.addColorStop(.34,'#e4ece511');g.addColorStop(.6,'#afbab509');g.addColorStop(1,'#05080be6');q.fillStyle=g;q.fillRect(left,(y-ry)*ih,ww,ry*2*ih);q.restore();q.globalCompositeOperation='destination-in';q.drawImage(part,0,0);q.globalCompositeOperation='source-over';c.drawImage(canvas,-w/2,-h/2,w,h);
};
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){
 const v=visualState(u),r=visualRig(u);c.save();c.imageSmoothingEnabled=true;
 if(u.type==='infantry'){
  const shot=v.shots.rifle,age=shot?VISUAL.time-shot.time:999,kick=age<135?Math.sin(age/135*Math.PI)*.75:0;
  c.translate(kick*.45,-kick*.25);c.rotate(kick*.015);c.drawImage(img,-w/2,-h/2,w,h);
 }else{
  // Small suspension/banking response complements separately articulated parts.
  const speed=Math.min(1,v.speed),air=['jet','hover','rotor'].includes(r.kind);
  if(air&&u!==S){c.translate(0,Math.sin(VISUAL.time*.004+(u.bob||0))*Math.min(1.0,w*.012));c.rotate((v.steer||0)*.024);}
  else if(['track','wheel'].includes(r.kind))c.translate(0,Math.sin(v.travel*.32)*speed*.40);
  illOriginalSprite(u,img,w,h,c);
 }
 c.restore();
};
// Crisp rotating blade edges, faint tip blur, and a fixed central bearing.
// Housings never rotate or slide off the aircraft.
motion22Mechanics=function(u,w,h,c){const r=visualRig(u),v=visualState(u);if(u.gone||v.dead)return;
 for(const p of r.parts){if(p.mode!=='fan'||!p.ellipse)continue;const[x,y,rx,ry]=p.ellipse,rotor=r.kind==='rotor';if(!rotor)continue;
  c.save();c.translate((x-.5)*w,(y-.5)*h);c.scale(1,ry*h/(rx*w));const radius=rx*w,spin=VISUAL.time*.035*(x<.5?1:-1);
  c.lineCap='round';for(let i=0;i<4;i++){const a=spin+i*Math.PI/2;c.strokeStyle='#d9e8ed';c.globalAlpha=.36;c.lineWidth=Math.max(.5,w*.009);c.beginPath();c.moveTo(Math.cos(a)*radius*.19,Math.sin(a)*radius*.19);c.lineTo(Math.cos(a)*radius*.83,Math.sin(a)*radius*.83);c.stroke();c.globalAlpha=.20;c.strokeStyle='#b9d3dc';c.lineWidth=radius*.11;c.beginPath();c.arc(0,0,radius*.84,a,a+.46);c.stroke();}
  c.globalAlpha=1;c.fillStyle='#33414a';c.beginPath();c.arc(0,0,radius*.14,0,Math.PI*2);c.fill();c.fillStyle=u.side==='ally'?'#8ddfc1':'#ff7767';c.beginPath();c.arc(0,0,radius*.085,0,Math.PI*2);c.fill();c.restore();
 }
};

/* Shared silhouette hierarchy; combat radii and movement speeds stay intact. */
const ILL_UNIT_SCALES={infantry:.86,e_guard:.90,e_missile:.92,e_bruiser:.96,
 apc:1.05,tank:1.08,heli:1.07,e_hawk:1.06,e_scout:1.06,e_wasp:1.07,
 e_rocket:1.08,e_flak:1.08,e_mole:1.08,legend_ship:1.07,
 L_cannon:1.08,L_gunship:1.06,L_cruiser:1.06,L_phantom:1.06,L_lancer:1.06,
 v_arc:.92,v_oblivion:1.06,v_phantom:1.04};
for(const [key,scale]of Object.entries(ILL_UNIT_SCALES)){
 for(const table of [UNITS,LEGENDS,VELCARION])if(table[key])table[key].w=+(table[key].w*scale).toFixed(2);
}

/* Basic-only: one recruit at a time and a small survivability advantage. */
const BASIC_BALANCE={incomingDamage:.90,spawnInterval:1.10,allyHP:1.20,allyDamage:1.15};
function basicNearestCaptureTarget(){
 if(!S?.beam)return null;
 let target=null,nearest=Infinity;
 for(const e of S.enemies){
  if(e.gone||e.hp<=0||e.resist>0||!canCaptureUnit(e))continue;
  const dx=e.x-S.px,dy=e.y-S.py,d=Math.hypot(dx,dy);
  if(d<=0||d>=beamLen()+e.r||angGap(Math.atan2(dy,dx),S.beamAng)>=beamArc()+Math.atan2(e.r,Math.max(24,d)))continue;
  if(d<nearest){nearest=d;target=e;}
 }
 return target;
}
captureWaveTargets=function(){const e=S?.basicCaptureTarget;return S?.beam&&e&&S.enemies.includes(e)&&e.cap>0?[e]:[];};
const basicBalancedMakeUnit=makeUnit;
makeUnit=function(type,x,y,side){
 const u=basicBalancedMakeUnit(type,x,y,side);
 if(u&&side==='ally'&&!u.isLegend&&!isVelcarion(u)){
  // Use normal stage health, never the tutorial target's artificial 9999 HP.
  const normalHP=Math.ceil(UNITS[type].hp*(1+(S.stage-1)*TUNE.enemyHpPerStage));
  u.hp=u.hpMax=Math.ceil(Math.max(u.hpMax,normalHP)*BASIC_BALANCE.allyHP);
  u.basicAllyBonus=true;
 }
 return u;
};
const basicBalancedFire=fireFrom;
fireFrom=function(u,ang,from){
 const first=S.bullets.length;basicBalancedFire(u,ang,from);
 if(from==='ally'&&u.basicAllyBonus)for(let i=first;i<S.bullets.length;i++)S.bullets[i].dmg*=BASIC_BALANCE.allyDamage;
};
const basicBalancedPlayerDamage=damagePlayer;
damagePlayer=function(amount){return basicBalancedPlayerDamage((amount||8)*BASIC_BALANCE.incomingDamage);};

const BASIC_CONTENT={"version":"v36-basic-expanded-1","units":[{"key":"infantry","stage":1,"kind":"보병","enKind":"Infantry","desc":"기본 사격을 하는 경보병","enDesc":"Light infantry with steady rifle fire"},{"key":"apc","stage":2,"kind":"차량","enKind":"Vehicle","desc":"기동력이 좋은 장갑 차량","enDesc":"Mobile armored assault vehicle"},{"key":"e_hawk","stage":2,"kind":"항공","enKind":"Aircraft","desc":"횡이동하며 두 줄로 사격","enDesc":"Strafes and fires twin shots"},{"key":"heli","stage":3,"kind":"항공","enKind":"Aircraft","desc":"지형을 넘어 비행하는 지원기","enDesc":"Flying support that crosses terrain"},{"key":"e_guard","stage":3,"kind":"보병","enKind":"Infantry","desc":"잠시 멈추고 집중 점사","enDesc":"Pauses to deliver a focused burst"},{"key":"tank","stage":4,"kind":"중장갑","enKind":"Heavy armor","desc":"느리지만 단단한 포격 전차","enDesc":"Durable tank with powerful shells"},{"key":"e_rider","stage":4,"kind":"차량","enKind":"Vehicle","desc":"직선 돌진 후 쌍포 사격","enDesc":"Charges forward, then fires twin guns"},{"key":"e_spike","stage":5,"kind":"차량","enKind":"Vehicle","desc":"짧게 돌진하는 경량 돌격차","enDesc":"Light assault car with short dashes"},{"key":"e_missile","stage":5,"kind":"보병","enKind":"Infantry","desc":"소형 미사일을 연속 발사","enDesc":"Infantry with sequential missile salvos"},{"key":"legend_bike","stage":6,"kind":"차량","enKind":"Vehicle","desc":"쌍열 무장을 갖춘 정예 돌격차","enDesc":"Elite assault bike with twin weapons"},{"key":"e_scout","stage":6,"kind":"항공","enKind":"Aircraft","desc":"크게 선회하며 접근하는 정찰기","enDesc":"Agile scout with wide sweeping turns"},{"key":"legend_ship","stage":7,"kind":"항공","enKind":"Aircraft","desc":"포획하면 유도탄으로 지원","enDesc":"Recruited aircraft provides homing fire"},{"key":"e_sentry","stage":7,"kind":"지원","enKind":"Support","desc":"연사 후 냉각 · 포획한 위치를 지키는 고정 포탑","enDesc":"Fires then cools down; holds its position when recruited"},{"key":"e_volt","stage":8,"kind":"항공","enKind":"Aircraft","desc":"조준선 예고 후 전격 · 접근 시 전기지대","enDesc":"Telegraphed lightning and close-range electric fields"},{"key":"e_rocket","stage":8,"kind":"중장갑","enKind":"Heavy armor","desc":"좌우 포드에서 확산 미사일 발사","enDesc":"Heavy tank launches spreading missile salvos"},{"key":"e_bruiser","stage":9,"kind":"보행 병기","enKind":"Walker","desc":"체력이 낮아지면 빠르게 공격","enDesc":"Armored walker attacks faster at low health"},{"key":"e_hover","stage":9,"kind":"항공","enKind":"Aircraft","desc":"지형을 무시하며 광역 포격","enDesc":"Hovering artillery with explosive shells"},{"key":"e_warbrute","stage":10,"kind":"보행 병기","enKind":"Walker","desc":"이동과 공성 사격을 번갈아 수행","enDesc":"Alternates between movement and siege fire"},{"key":"e_mole","stage":10,"kind":"중장갑","enKind":"Heavy armor","desc":"잠복 후 충격파를 일으키는 굴착 전차","enDesc":"Burrowing drill tank with shockwaves"},{"key":"e_flak","stage":11,"kind":"중장갑","enKind":"Heavy armor","desc":"확산 미사일과 연막으로 공격","enDesc":"Heavy support with missiles and smoke"},{"key":"e_wasp","stage":11,"kind":"항공","enKind":"Aircraft","desc":"폭격 후 이탈하고 다시 진입","enDesc":"Bomber that leaves and returns for strafing runs"}],"items":[{"key":"PWR","stage":1,"weight":14,"field":"itemDmg","cap":6,"keep":"stage","ko":"플레이어 공격력 +1 · 최대 +6","en":"Player damage +1 · up to +6"},{"key":"RATE","stage":1,"weight":14,"field":"itemRate","cap":5,"keep":"stage","ko":"발사 간격 ×0.86 · 최대 5회","en":"Fire interval ×0.86 · up to 5 pickups"},{"key":"WAY","stage":2,"weight":8,"field":"ways","cap":3,"keep":"stage","ko":"탄환 +1줄 · 최대 3줄","en":"One extra shot lane · up to 3 lanes"},{"key":"SPD","stage":2,"weight":5,"field":"spd","cap":3,"keep":"run","ko":"이동속도 +14% · 최대 +42%","en":"Movement speed +14% · up to +42%"},{"key":"SHLD","stage":1,"weight":10,"keep":"stage","ko":"피해 1회 방어 · 중첩되지 않음","en":"Blocks one hit · does not stack"},{"key":"HEAL","stage":1,"weight":28,"keep":"instant","ko":"체력 +55 · 최대 체력까지만 회복","en":"Restores 55 hull · capped at maximum hull"},{"key":"SLOT","stage":3,"weight":4,"field":"itemSlot","cap":2,"keep":"run","ko":"편대 정원 +1 · 아이템으로 최대 +2","en":"Squad capacity +1 · up to +2 from items"},{"key":"APWR","stage":3,"weight":5,"field":"allyPwr","cap":3,"keep":"run","ko":"편대 공격력 +25% · 최대 +75%","en":"Squad damage +25% · up to +75%"},{"key":"FREEZE","stage":3,"weight":4,"keep":"stage","ko":"명중한 적을 둔화 · 최대 3단계","en":"Slows enemies on hit · up to level 3"},{"key":"POISON","stage":4,"weight":4,"keep":"stage","ko":"명중한 적에게 지속 피해 · 최대 3단계","en":"Deals poison damage over time · up to level 3"},{"key":"FIRE","stage":4,"weight":4,"keep":"stage","ko":"착탄 지점에 화염 확산 · 최대 3단계","en":"Explosive fire on impact · up to level 3"}]};
/* Expanded Basic: all regular units, bounded pickups and an optional codex.
 * BASIC_CONTENT is injected from basic-expanded-catalog.cjs by the builder. */
const BASIC_ITEM_MAP=Object.fromEntries(BASIC_CONTENT.items.map(d=>[d.key,d]));
const BASIC_UNIT_MAP=Object.fromEntries(BASIC_CONTENT.units.map(d=>[d.key,d]));
const BASIC_PERSISTENT=BASIC_CONTENT.items.filter(d=>d.keep==='run');
STR.ko.iAPWR='편대 화력 강화';STR.en.iAPWR='Squad Damage Up';
TUNE.itemDropRate=.24;
TUNE.enemyHpPerStage=.16;
TUNE.enemyDmgPerStage=.045;
const basicHealth={e_guard:6,e_missile:7,e_spike:8,e_scout:8,e_sentry:12,e_volt:10,e_rocket:15,e_bruiser:18,e_hover:17,e_warbrute:20,e_mole:20,e_flak:22,e_wasp:20};
for(const [key,hp]of Object.entries(basicHealth)){UNITS[key].hp=hp;UNITS[key].bdmg*=.82;}
ITEMS.RATE.c='#4edff4';ITEMS.SLOT.c='#51eac1';ITEMS.APWR.c='#b793ff';
function basicUnitPool(stage){
 const pool=[];
 for(const d of BASIC_CONTENT.units){if(d.stage>stage)continue;
  const age=stage-d.stage,weight=age<=1?3:age<=3?2:1;
  for(let i=0;i<weight;i++)pool.push(d.key);
 }return pool;
}
pickType=function(stage){const pool=basicUnitPool(stage);return pool[Math.floor(Math.random()*pool.length)];};
function basicItemUseful(d){
 if(d.field&&S[d.field]>=d.cap)return false;
 if(d.key==='SHLD'&&S.shield)return false;
 if(ELEMENTS.includes(d.key)&&S.element===d.key&&S.elemStack[d.key]>=3)return false;
 return true;
}
function basicDropItem(){
 const pool=BASIC_CONTENT.items.filter(d=>d.stage<=S.stage&&basicItemUseful(d));
 const weight=d=>d.weight*(d.key==='HEAL'&&S.hp<maxHp()*.45?1.8:1);
 let roll=Math.random()*pool.reduce((s,d)=>s+weight(d),0);
 for(const d of pool){roll-=weight(d);if(roll<0)return d.key;}
 return 'HEAL';
}
const basicExpandedPickup=pickup;
pickup=function(key,src){
 const d=BASIC_ITEM_MAP[key];if(!d)return; // No summon, relic or ancient pickup.
 if(d.field&&S[d.field]>=d.cap)return;
 basicExpandedPickup(key,src);
 if(d.field)S[d.field]=Math.min(d.cap,S[d.field]);
};
const basicExpandedMake=makeUnit;
makeUnit=function(type,x,y,side){
 const u=basicExpandedMake(type,x,y,side);
 if(u&&side==='ally'&&BASIC_UNIT_MAP[type]){
  // Recruited emplacement folds its stabilizers and follows the commander.
  if(u.spd===0)u.spd=.82;
  u.ways=UNITS[type].ways||1;
 }
 return u;
};
const basicExpandedFire=fireFrom;
fireFrom=function(u,ang,from){
 if(from!=='ally')return basicExpandedFire(u,ang,from);
 const count=S.bullets.length,power=S.allyPwr;
 // Scale after the original rounded base damage so each pickup really is +25%.
 S.allyPwr=0;
 try{basicExpandedFire(u,ang,from);}finally{S.allyPwr=power;}
 for(let i=count;i<S.bullets.length;i++)S.bullets[i].dmg*=1+Math.min(3,power)*.25;
};
function basicCarryItems(){return Object.fromEntries(BASIC_PERSISTENT.map(d=>[d.field,Math.min(d.cap,Math.max(0,S[d.field]||0))]));}
function basicRestoreItems(carry){
 Object.assign(S,carry);
 for(const d of BASIC_PERSISTENT)if(S[d.field])S.itemsTaken[d.key]=S[d.field];
}
const basicExpandedMenu=basicMenu;
basicMenu=function(){
 basicExpandedMenu();const footer=$('basicCompactFooter');if(!footer)return;
 let info=$('basicGameInfo');if(!info){info=basicButton('',()=>basicOpenGameInfo());info.id='basicGameInfo';footer.prepend(info);}
 info.textContent='ⓘ  '+basicText('게임 정보','GAME INFO');
};
function basicKeepLabel(kind){return kind==='run'?basicText('다음 스테이지 유지','CARRIES TO NEXT STAGE'):kind==='instant'?basicText('즉시 회복','INSTANT REPAIR'):basicText('현재 스테이지 한정','THIS STAGE ONLY');}
function basicOpenGameInfo(initial='units'){
 const p=cgHub(basicText('게임 정보','Game info'),'FIELD OF IMMORTALS · BASIC');p.classList.add('basic-codex');
 p.append(basicNode('p',basicText('포획하며 편대를 만들고, 기지를 무너뜨리며 다음 스테이지로 전진하세요.','Capture a squad, destroy the base, and advance to the next stage.'),'codex-intro'));
 const tabs=basicNode('div',null,'codex-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',basicText('정보 종류','Information category'));
 const body=basicNode('div');body.id='basicCodexPanel';body.setAttribute('role','tabpanel');
 const buttons={};
 for(const [key,ko,en,count]of [['units','유닛','UNITS',21],['items','아이템','ITEMS',11]]){
  const b=basicButton(basicText(ko,en)+' · '+count,()=>select(key));b.id='codexTab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',body.id);
  b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'units':e.key==='End'?'items':key==='units'?'items':'units';select(next);buttons[next].focus();}};
  buttons[key]=b;tabs.append(b);
 }
 p.append(tabs,body);
 function select(key){
  for(const [k,b]of Object.entries(buttons)){b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;}
  body.setAttribute('aria-labelledby',buttons[key].id);body.replaceChildren();
  const note=basicNode('p',key==='units'?basicText('1스테이지 3종으로 시작해 4스테이지부터 3스테이지마다 1종씩 추가됩니다. 55스테이지에 21종이 모두 해금되며 60스테이지까지 숙련자 도전을 목표로 난이도가 올라갑니다. 포획은 가장 가까운 1기만 가능하며, 포획 시 자동 능력치 보너스는 없습니다. 이동 아군은 플레이어 주변을 호위하며, 트윈 센트리는 포획 위치를 지킵니다. 선택한 강화와 아이템 효과는 적용됩니다.','Three types start in sector 1. One more debuts every three sectors from sector 4, reaching all 21 in sector 55. Difficulty builds toward an expert challenge around sector 60. Capture recruits the nearest eligible unit, one at a time. Capture grants no automatic stat bonus. Mobile allies escort the player; Twin Sentries hold their captured position. Chosen upgrades and pickups still apply.'):basicText('구조 강화 3종은 이번 출격 동안 유지됩니다. 화력·속성·보호막은 스테이지마다 초기화됩니다. 새 출격을 시작하면 모든 획득 효과가 초기화됩니다.','Three structural upgrades carry between stages for this run. Weapons, elements and shields reset each stage. Starting a new run resets all collected effects.'),'codex-note');body.append(note);
  const grid=basicNode('div',null,'codex-grid '+key);
  const entries=key==='units'?BASIC_CONTENT.units:BASIC_CONTENT.items;
  for(const d of entries){
   const card=basicNode('article',null,'codex-card'),art=basicNode('div',null,'codex-art'),im=basicNode('img');im.src=ART[key==='units'?UNITS[d.key].img:ITEMS[d.key].img];im.alt=key==='units'?nm(d.key):itemName(d.key);im.loading='lazy';art.append(im);
   const copy=basicNode('div',null,'codex-copy');copy.append(basicNode('small',basicText('스테이지 ','STAGE ')+d.stage+'+', 'codex-stage'),basicNode('h3',im.alt));
   if(key==='units'){copy.append(basicNode('span',basicText(d.kind,d.enKind),'codex-kind'),basicNode('p',basicText(d.desc,d.enDesc)));}
   else {copy.append(basicNode('p',basicText(d.ko,d.en),'codex-effect'),basicNode('strong',basicKeepLabel(d.keep),'codex-keep '+d.keep));
    const detail=d.keep==='run'?basicText('다음 스테이지 유지 · 새 출격 시 초기화','Carried between stages · resets on a new run'):d.keep==='instant'?basicText('회복한 체력은 유지됩니다. 스테이지 전환 시 체력 25%도 회복합니다.','Restored hull stays. Stage transitions also restore 25% hull.'):ELEMENTS.includes(d.key)?basicText('마지막에 얻은 속성만 활성 · 다음 스테이지 초기화','Only the last element collected is active · resets next stage'):basicText('다음 스테이지에서 초기화됩니다.','Resets when the next stage begins.');copy.append(basicNode('small',detail,'codex-detail'));
   }
   card.append(art,copy);grid.append(card);
  }
  body.append(grid);
  body.append(basicNode('p',key==='units'?basicText('살아남은 아군은 다음 스테이지에 전원 회복해 동행합니다. 크림슨 랜스·오비탈 팰컨은 일반 정예 유닛입니다. 레전드 10종은 2스테이지부터 무작위로 등장합니다. 출격 2~5기와 예비 편대를 별도로 편성합니다.','Surviving allies carry over with full hull. Crimson Lance and Orbital Falcon are regular elites. All ten Legends may appear randomly from sector 2. Deploy 2–5 Legends and keep others in reserve.'):basicText('일반 적 보급 판정은 1~3스테이지 24%, 4~9스테이지 20%, 10~19스테이지 17%, 20~39스테이지 14.5%, 40스테이지부터 12%입니다. 정예는 +4%p입니다. 보급 간격·전장 6개 제한이 있으며 회복과 보호막은 별도 간격을 적용합니다. 체력 40% 미만에서 회복 확률이 증가하며, 35% 미만으로 24초간 교전하며 6기를 처치하면 회복 1개를 우선 보급합니다. 최대 강화·불필요한 아이템 판정은 추가 드롭이나 회복으로 바뀌지 않습니다.','Supply rolls: 24% in sectors 1–3, 20% in 4–9, 17% in 10–19, 14.5% in 20–39, and 12% from 40. Elites add 4 percentage points. Supply intervals and a six-pickup field cap apply. Repair and shields use separate cooldowns. Repairs are weighted higher below 40% hull. Below 35% hull, fighting for 24 seconds and defeating six enemies prioritizes one repair. Unneeded or maxed-item rolls do not reroll into more drops or healing.'),'codex-note codex-bottom'));
 }
 select(initial);
}
basicOpenFieldGuide=function(squad){basicOpenGameInfo(squad?'units':'items');};

/* Basic Relaunch: one readable objective, an immediate recruit and bounded encounters.
 * This edition deliberately owns separate save keys. Full/R5 are never migrated. */
const REL={version:1,resuming:false,ready:false,hudKey:'',notice:null,events:[]};
const relAllyIcons={};
function relAllyIcon(a){if(!relAllyIcons[a.img])relAllyIcons[a.img]=TINT.ally[a.img]?.toDataURL?.('image/png')||ART[a.type];return relAllyIcons[a.img];}
TUNE.keySpeed=2.85;TUNE.enemyCap=12;TUNE.aimRange=370;TUNE.beamLen=210;
TUNE.enemyHpPerStage=.115;TUNE.enemyDmgPerStage=.035;
for(const k of ['infantry','apc','tank','heli',...NEW_FOES])if(UNITS[k])UNITS[k].w*=1.10;
BASIC_UNIT_MAP.apc.stage=1;BASIC_UNIT_MAP.e_hawk.stage=2;
function relEvent(){}
function relToast(ko,en,key=''){REL.notice={text:basicText(ko,en),until:(S?.relTime||0)+3400,key};}
const relNumeric=['upDmg','upRate','upMove','upArmor','upCap','upBeam','upSquad','upScout','upPower','score','kills','captured','spd','itemSlot','allyPwr'];
function relSaveCheckpoint(){
 if(!S||REL.resuming)return;
 const run={version:1,stage:S.stage,hp:S.hp,values:{},ups:{...S.upsTaken},allies:S.allies.map(a=>a.type),guideDone:!!META.relGuideDone};
 for(const k of relNumeric)run.values[k]=Number.isFinite(S[k])?S[k]:0;
 META.relaunchRun=run;META.bestStage=Math.max(META.bestStage||1,S.stage);metaSave();
}
function relValidSave(){const r=META.relaunchRun;return r?.version===1&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=999&&Array.isArray(r.allies)&&r.allies.length<=10&&r.allies.every(k=>BASIC_UNIT_MAP[k]||(VELCARION[k]&&ownsVelcaCore()))&&r.values&&Object.values(r.values).every(v=>Number.isFinite(v)&&v>=0&&v<=1e8);}
function relContinue(){
 if(!relValidSave()){basicPlay();return;}
 const cp=structuredClone(META.relaunchRun);REL.resuming=true;
 try{basicPlay();for(const k of relNumeric)S[k]=Math.max(0,Math.min(k==='score'||k==='evoSeed'?1e8:999,cp.values[k]||0));S.upsTaken={...cp.ups};S.allies=[];
 for(const type of cp.allies)S.allies.push(makeUnit(type,S.px,S.py,'ally'));
 startStage(cp.stage);S.hp=Math.min(maxHp(),Math.max(maxHp()*.35,Number(cp.hp)||maxHp()));
 if(cp.guideDone||cp.stage>1){S.relGuide=0;S.enemies=S.enemies.filter(e=>!e.relRecruit);S.spawnCd=500;}
 }finally{REL.resuming=false;}
 relSaveCheckpoint();relToast('스테이지 시작 지점에서 이어갑니다','Resumed from the sector checkpoint');
}
const relBaseMenu=basicMenu;
basicMenu=function(){relBaseMenu();if(!basicReady)return;
 const saved=relValidSave();$('txStoryT').textContent=saved?basicText('이어서 출격','CONTINUE'):basicText('바로 출격','DEPLOY');
 $('txStoryD').textContent=saved?basicText('스테이지 ','Sector ')+META.relaunchRun.stage+basicText(' · 저장된 편대로 출격',' · Your squad is ready'):basicText('적을 포획하고, 함께 기지를 무너뜨리세요','Capture an enemy. Build your squad.');
 $('btStory').onclick=saved?relContinue:basicPlay;$('btStory').setAttribute('aria-label',$('txStoryT').textContent);
 const record=$('btCurrency');record.replaceChildren(basicNode('small',basicText('최고 도달','BEST SECTOR')),basicNode('strong',String(META.bestStage||1).padStart(2,'0')));record.setAttribute('aria-label',basicText('전투 기록 보기','View battle records'));
};
const relSettings=basicSettingsContent;
basicSettingsContent=function(root){relSettings(root);root.append(basicNode('p',(S?.story&&['play','pause'].includes(mode)?basicText('완료한 임무 별과 획득 재화는 저장됩니다. 진행 중인 스토리 작전은 재접속 후 다시 출격해야 합니다.','Completed mission stars and collected currency are saved. After reopening the game, deploy again to restart an unfinished Story operation.'):basicText('인피니티는 스테이지 시작 지점을 저장합니다. 이어하기로 해당 체크포인트에서 다시 출격합니다.','Infinity saves a sector checkpoint. Continue restarts that sector from its saved checkpoint.')),'basic-help'));
 if(mode==='menu'&&relValidSave())root.append(basicButton(basicText('새 출격 · 저장된 출격 초기화','New run · Replace saved run'),()=>{delete META.relaunchRun;metaSave();cgCloseHub();basicPlay();},'basic-secondary'));
};
const relInitBase=basicInit;
basicInit=function(){relInitBase();document.body.classList.add('relaunch');
 const hud=basicNode('section');hud.id='relHUD';hud.hidden=true;
 hud.innerHTML='<div class="rel-top"><div class="rel-sector"><span id="relChapter"></span><strong id="relObjective"></strong><progress id="relProgress" max="1" value="0" aria-label="Sector progress"></progress></div></div><div class="rel-bottom"><div class="rel-hull"><span id="relHullLabel"></span><strong id="relHull"></strong><progress id="relHealth" aria-label="Hull"></progress><small id="relBuffs"></small></div><div class="rel-squad"><span id="relSquadLabel"></span><div id="relSlots"></div></div></div><div id="relTip"><b id="relTipTitle"></b><span id="relTipText"></span><button id="relSkip"></button></div><div id="relToast" role="status" hidden></div><div id="relControls"></div>';
 $('stage').append(hud);$('relSkip').onclick=relSkipGuide;REL.ready=true;
 $('btRetry').onclick=()=>{relContinue();show(null);};
};
const relNewBase=newGame;
newGame=function(...args){REL.events=[];relNewBase(...args);if(!REL.resuming)relSaveCheckpoint();};
const relStageBase=startStage;
startStage=function(n){
 WORLD.w=Math.max(1500,W+480);WORLD.h=Math.max(1700,H+440);
 relStageBase(n);n=S.stage;S.tutorial=false;S.relTime=0;S.relSpawnCount=0;S.relQueue=[];S.relBossIn=0;S.relClearIn=0;
 S.relGuide=n===1&&!META.relGuideDone?1:0;
 S.relOrigin={x:WORLD.w/2,y:WORLD.h*.55};
 const ox=S.relOrigin.x,oy=S.relOrigin.y;
 S.px=ox;S.py=oy+150;S.cam.x=Math.max(0,ox-W/2);S.cam.y=Math.max(0,S.py-H*.58);
 S.killNeed=Math.min(18,6+Math.floor((n-1)*1.6));S.spawnCd=S.relGuide?999999:700;
 S.props=[];S.floorAds=[];S.enemies=[];S.bullets=[];S.ebullets=[];S.base=null;S.turrets=[];
 const deco=S.theme.props||[];
 // Readable arena: cover at the edges, a free approach in the middle.
 for(const [dx,dy]of [[-320,-190],[320,-190],[-350,185],[350,185]]){const key=Array.isArray(deco)&&deco.length?deco[0]:null;if(typeof key==='string'&&IMG[key])S.props.push(propAt(ox+dx,oy+dy,key));}
 S.allies.forEach((a,i)=>{a.x=S.px+Math.cos(i*2.4)*70;a.y=S.py+Math.sin(i*2.4)*60;});
 if(S.relGuide){const e=makeUnit('infantry',S.px+42,S.py-105,'neutral');e.relRecruit=true;e.life=9999999;e.spd=0;e.noFire=true;S.enemies.push(e);}
 S.invuln=S.relGuide?0:1500;S.basicCarryNotice=0;S.warn=0;REL.hudKey='';REL.notice=null;
 relEvent('sector-start',{allies:S.allies.map(a=>a.type)});relSaveCheckpoint();
 if(n>1)relToast('스테이지 '+n+' · 편대가 함께 출격합니다','SECTOR '+n+' · Your squad stays with you');
};
updateTutorial=function(){$('basicGuide').hidden=true;$('tutorial').classList.remove('on');};
updateObjectiveUI=function(){};
basicDrawLessonTarget=function(){};
basicSyncHUD=function(){if(basicReady)for(const id of ['basicHUD','basicObjective','basicGuide','basicNotice'])$(id).hidden=true;};
function relSkipGuide(){if(!S)return;S.relGuide=0;META.relGuideDone=true;S.spawnCd=450;S.enemies.forEach(e=>{if(e.relRecruit){e.relRecruit=false;e.side='enemy';e.spd=UNITS[e.type].spd;e.noFire=false;}});clearBattleInput();metaSave();relEvent('guide-skipped');}
const relConvertBase=convertToAlly;
convertToAlly=function(u){const replaced=rosterCount(false)>=allyCap();relConvertBase(u);relEvent('capture',{type:u.type});
 relToast(nm(u.type)+' 편입! '+(replaced?'편대가 가득 차면 먼저 합류한 아군을 교체합니다.':'함께 공격합니다.'),nm(u.type)+' recruited! '+(replaced?'Full squad: oldest ally is replaced.':'Now fighting with you.'),'capture');
 if(S.relGuide===1){S.relGuide=2;S.relGuideUntil=S.relTime+7000;S.spawnCd=650;META.relGuideDone=true;metaSave();}
};
spawnAroundPlayer=function(){
 if(S.enemies.length+S.relQueue.length>=Math.min(TUNE.enemyCap,4+S.stage)||S.relGuide===1)return;
 const count=S.relSpawnCount++,type=S.stage===1?(count%3===1?'apc':'infantry'):pickType(S.stage);
 const a=-Math.PI*.5+Math.sin(count*2.4)*1.2,d=250+Math.random()*70;
 const x=Math.max(70,Math.min(WORLD.w-70,S.px+Math.cos(a)*d)),y=Math.max(90,Math.min(WORLD.h-90,S.py+Math.sin(a)*d));
 S.relQueue.push({x,y,type,remaining:900});
};
spawnBase=function(){
 const x=S.relOrigin.x,y=S.relOrigin.y-155;
 const b=propAt(x,y,S.theme.base);b.gateT=4000;b.open=false;S.base=b;
 const hp=9+Math.min(65,(S.stage-1)*4),space=W<600?80:90;
 S.turrets=[0,1,2,3].map(i=>({i,x:x+(i-1.5)*space,y:y+105,hp,hpMax:hp,alive:true,fireCd:1900+i*580,flash:0,relCharge:0}));
 S.phase='boss';S.warn=0;S.relBossIn=1600;S.spawnCd=5200;S.relQueue=[];
 S.props=S.props.filter(p=>Math.hypot(p.x-x,p.y-y)>260);
 relEvent('base-spawn');relToast('기지 방어선 발견 · 포탑 4기를 파괴하세요','BASE DETECTED · Destroy the four turrets','boss');musicPlay('boss');
};
function relUpdateTurrets(dt){
 for(const t of S.turrets){if(!t.alive)continue;t.flash=Math.max(0,(t.flash||0)-dt);
 if(Math.hypot(S.px-t.x,S.py-t.y)>570)continue;
 if(t.relCharge>0){t.relCharge-=dt;if(t.relCharge<=0){const ways=S.stage<3?3:5,spread=S.stage<3?.19:.16;
 for(let k=0;k<ways;k++){const a=t.relAngle+(k-(ways-1)/2)*spread,sp=3.0+Math.min(.8,S.stage*.06);const bullet={x:t.x,y:t.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,c:'#ff956a',big:true,dmg:Math.round((7+Math.min(7,S.stage))*enemyDmgScale())};S.ebullets.push(bullet);cgTurretFire(t,bullet,a);}
 t.fireCd=Math.max(2300,3600-S.stage*100);relEvent('turret-volley',{turret:t.i});/* Turret launch audio is emitted by cgTurretFire. */
 }}else{t.fireCd-=dt;if(t.fireCd<=0){t.relAngle=Math.atan2(S.py-t.y,S.px-t.x);t.relCharge=800;}}
 }
}
function relCamera(){if(!S)return;
 let y=S.py-H*.58,x=S.px-W/2;
 // Portrait combat keeps the four-turret line in view while the commander is nearby.
 if(S.phase==='boss'&&S.base&&W<700&&Math.abs(S.px-S.base.x)<W*.7&&Math.abs(S.py-S.base.y)<490)x=Math.max(S.base.x-W+180,Math.min(S.base.x-180,x));
 if(S.phase==='boss'&&S.base&&Math.hypot(S.px-S.base.x,S.py-S.base.y)<490&&H<700)y=(S.py+S.base.y+85)/2-H*.52;
 S.cam.x=Math.max(0,Math.min(Math.max(0,WORLD.w-W),x));S.cam.y=Math.max(0,Math.min(Math.max(0,WORLD.h-H),y));
}
function relFormation(a,dt){const i=S.allies.indexOf(a),angle=i*2.399+Math.PI/2,r=60+(i%2)*25;
 const tx=S.px+Math.cos(angle)*r,ty=S.py+Math.sin(angle)*r,dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy);
 if(d>95){const step=Math.min(d-75,Math.max(a.spd*1.6,speedOf()+.55)*dt/16);a.x+=dx/d*step;a.y+=dy/d*step;}
}
const relUpdateBase=update;
update=function(dt){if(mode!=='play')return;S.relTime+=dt;
 if(S.relGuide===2&&S.relTime>S.relGuideUntil)S.relGuide=0;
 for(let i=S.relQueue.length-1;i>=0;i--){const q=S.relQueue[i];q.remaining-=dt;if(q.remaining<=0){const e=makeUnit(q.type,q.x,q.y,'enemy');e.fireCd=Math.max(1200,e.fireCd);S.enemies.push(e);S.relQueue.splice(i,1);}}
 relUpdateBase(dt);
 S.relBossIn=Math.max(0,S.relBossIn-dt);
 if(S.relClearIn>0){S.relClearIn-=dt;if(S.relClearIn<=0)relOpenUpgradeNow();}
 // Only low-strength attraction within walking reach. No screen-wide auto collection.
 for(const it of S.items){const dx=S.px-it.x,dy=S.py-it.y,d=Math.hypot(dx,dy);if(d>22&&d<80){it.x+=dx/d*2.2*dt/16;it.y+=dy/d*2.2*dt/16;}}
};
const relPickupBase=pickup;
pickup=function(k,src){if(!BASIC_ITEM_MAP[k])return;const hpBefore=S.hp;relPickupBase(k,src);const restored=Math.ceil(S.hp-hpBefore),d=BASIC_ITEM_MAP[k];relEvent('pickup',{item:k});relToast(ITEMS[k].name+' · '+(d.keep==='run'?'다음 스테이지 유지':d.keep==='instant'?(restored?'내구도 +'+restored:'내구도 최대'):'이번 스테이지 강화'),ITEMS[k].name+' · '+(d.keep==='run'?'Carries to next sector':d.keep==='instant'?(restored?'Hull +'+restored:'Hull full'):'This sector only'),'item');};
const relOpenUpgradeBase=openUpgrade;
function relOpenUpgradeNow(){S.relClearIn=0;relOpenUpgradeBase();}
openUpgrade=function(){if(S.relClearIn||S.rewardSettled)return;S.relClearIn=1200;S.ebullets=[];S.spawnCd=999999;relEvent('sector-clear');relToast('기지 확보! 다음 전투를 준비합니다','BASE SECURED · Choose your next upgrade','clear');};
// Three tangible choices, with carry rules and new recruits visible before continuing.
rollUpgrades=function(){const pool=UPGRADES.filter(u=>['dmg','rate','power','squad'].includes(u.id)&&u.lv(S)<u.max);const box=$('upChoices');box.replaceChildren();cards=[];
 const names={dmg:[basicText('화력 증폭','Stronger weapons'),basicText('기본 공격력 +1','Base weapon damage +1'),'i_pwr'],rate:[basicText('빠른 재장전','Rapid reload'),basicText('기본 발사 간격 10% 감소','Base firing interval −10%'),'i_rate'],power:[basicText('강화 선체','Reinforced hull'),basicText('최대 체력 +30 · 자동 회복 증가','Max hull +30 · Improved regeneration'),'i_heal'],squad:[basicText('편대 확장','Larger squad'),basicText('아군 편대 슬롯 +1','One additional ally slot'),'i_slot']};
 $('upEyebrow').textContent=basicText('스테이지 ','SECTOR ')+S.stage+basicText(' 확보',' SECURED');$('upTitle').textContent=basicText('다음 전투, 무엇을 강화할까요?','How will your squad grow?');
 $('missionBox').replaceChildren();$('claimBox').replaceChildren();box.after($('claimBox'));
 $('missionBox').append(basicNode('p',basicText('아군 '+S.allies.length+'기 생존 · 체력 25% 회복 · 스테이지 시작 자동 저장',S.allies.length+' allies survived · Restore 25% hull · Next sector saves automatically'),'rel-clear-summary'));
 const unlocked=BASIC_CONTENT.units.filter(d=>d.stage===S.stage+1);if(unlocked.length){const row=basicNode('div',null,'rel-unlocks');row.append(basicNode('span',basicText('다음 스테이지','NEXT SECTOR')));for(const d of unlocked){const im=basicNode('img');im.src=ART[d.key];im.alt=nm(d.key);row.append(im,basicNode('b',nm(d.key)));}$('missionBox').append(row);}
 for(const u of pool.slice(0,3)){const [title,detail,key]=names[u.id];const b=basicButton('',()=>{u.ap(S);S.upsTaken[u.id]=(S.upsTaken[u.id]||0)+1;clearBattleInput();advanceAfterUpgrade();},'card');const im=basicNode('img');im.src=ART[key];im.alt='';const copy=basicNode('span',null,'txt');copy.append(basicNode('strong',title),basicNode('span',detail),basicNode('small',basicText('이번 출격 동안 유지','Stays for this run')));b.append(im,copy,basicNode('span','→'));box.append(b);cards.push(b);}
 if(pool.length>3&&S.stage%2===0){const u=pool[3],b=box.lastChild;const [title,detail,key]=names[u.id];b.querySelector('img').src=ART[key];b.querySelector('strong').textContent=title;b.querySelector('.txt span').textContent=detail;b.onclick=()=>{u.ap(S);S.upsTaken[u.id]=(S.upsTaken[u.id]||0)+1;clearBattleInput();advanceAfterUpgrade();};}
 $('claimBox').append(basicNode('p',basicText('유지: 살아남은 편대 · 선택 강화 · 기동력 · 편대 슬롯 · 편대 화력\n초기화: 필드 공격력 · 연사 · 탄도 · 보호막 · 속성탄','Carry: surviving squad, chosen upgrades, movement, squad slots and squad damage.\nReset: field damage, fire rate, extra shots, shield and elemental rounds.'),'rel-carry-rules'));
 queueMicrotask(()=>cards[0]?.focus({preventScroll:true}));
};
const relOverBase=gameOver;
gameOver=function(){relEvent('run-end');relOverBase();$('btRetry').textContent=basicText('이 스테이지 다시 도전','Retry this sector');$('ovTitle').textContent=basicText('다시 편대를 모으세요','Regroup and return');$('ovStats').append(basicNode('p',basicText('스테이지 시작 때의 편대와 강화로 다시 도전합니다.','Retry with the squad and upgrades saved at this sector’s start.')));};
drawHUD=function(){};drawMinimap=function(){};drawStatPanel=function(){};drawWarning=function(){};
const relDrawBG=drawBG;
drawBG=function(){relDrawBG();if(!S||mode==='menu')return;
 // Keep the illustrated biome visible; only a light veil separates the projectiles.
 ctx.fillStyle='rgba(5,12,17,.06)';ctx.fillRect(0,0,W,H);
 const o=S.relOrigin;if(!o)return;const x=o.x-S.cam.x,y=o.y-S.cam.y;
 ctx.save();ctx.translate(x,y);
 const ink=({EARTH:'#d3dcba24',CERES:'#edc7a924',IGNIS:'#f8b18022',PRISMA:'#b0e9ed26'})[S.theme.id]||'#ccdfd324';
 // Short perimeter marks define the arena without replacing its terrain with a grid.
 ctx.strokeStyle=ink;ctx.lineWidth=2;
 for(const [px,py,sx,sy]of [[-310,-320,1,1],[310,-320,-1,1],[-310,270,1,-1],[310,270,-1,-1]]){ctx.beginPath();ctx.moveTo(px+sx*48,py);ctx.lineTo(px,py);ctx.lineTo(px,py+sy*48);ctx.stroke();}
 ctx.restore();
};
function relDrawWorldHUD(){const cx=S.cam.x,cy=S.cam.y;
 for(const q of S.relQueue){const p=1-q.remaining/900;ctx.save();ctx.strokeStyle='#ffab77';ctx.globalAlpha=.3+p*.5;ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(q.x-cx,q.y-cy,28-p*10,0,Math.PI*2);ctx.stroke();ctx.restore();}
 for(const t of S.turrets){if(!t.alive||!t.relCharge)continue;ctx.save();ctx.translate(t.x-cx,t.y-cy);ctx.rotate(t.relAngle);ctx.strokeStyle='#ffd495';ctx.globalAlpha=.25+(1-t.relCharge/800)*.5;ctx.lineWidth=2;ctx.setLineDash([8,9]);ctx.beginPath();ctx.moveTo(24,0);ctx.lineTo(300,0);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#ff9460';ctx.beginPath();ctx.arc(0,0,31,0,Math.PI*2);ctx.stroke();ctx.restore();}
 const e=S.basicCaptureTarget||S.enemies.find(e=>e.relRecruit);
 if(e){const x=e.x-cx,y=e.y-cy,r=Math.max(25,e.r+9);ctx.save();ctx.strokeStyle='#71f5d0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();if(e.cap){ctx.lineWidth=4;ctx.strokeStyle='#eafff7';ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.min(1,e.cap/capFill())*Math.PI*2);ctx.stroke();}
 ctx.textAlign='center';ctx.font='700 13px system-ui';const text=e.relRecruit?basicText('누르고 포획','HOLD TO RECRUIT'):Math.ceil(Math.min(1,e.cap/capFill())*100)+'%';const tw=ctx.measureText(text).width;ctx.fillStyle='#081e25e8';ctx.fillRect(x-tw/2-8,y-r-30,tw+16,23);ctx.fillStyle='#caffec';ctx.fillText(text,x,y-r-14);ctx.restore();}
 // Direction is needed only while the base is outside the playable view.
 if(S.base&&S.turrets.some(t=>t.alive)){const target={x:S.base.x,y:S.base.y+110},x=target.x-cx,y=target.y-cy;if(x<45||x>W-45||y<110||y>H-130){const px=Math.max(42,Math.min(W-42,x)),py=Math.max(125,Math.min(H-140,y));ctx.save();ctx.translate(px,py);ctx.rotate(Math.atan2(y-py,x-px));ctx.fillStyle='#ffd194';ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,-8);ctx.lineTo(-8,8);ctx.closePath();ctx.fill();ctx.restore();}}
}
function relSyncHUD(){if(!REL.ready)return;const active=S&&['play','pause'].includes(mode);$('relHUD').hidden=!active;if(!active)return;
 const remaining=S.turrets.filter(t=>t.alive).length;
 $('relChapter').textContent=basicText('스테이지 ','SECTOR ')+String(S.stage).padStart(2,'0')+'  /  '+basicText(S.phase==='boss'?'기지 공략':'편대 결성',S.phase==='boss'?'BASE ASSAULT':'BUILD YOUR SQUAD');
 $('relObjective').textContent=S.relGuide===1?basicText('표시된 적을 내 편으로 만드세요','Recruit the marked enemy'):S.phase==='boss'?basicText('포탑 파괴 ','Destroy turrets ')+(4-remaining)+' / 4':basicText('포획 또는 처치 ','Capture or defeat ')+Math.min(S.killed,S.killNeed)+' / '+S.killNeed;
 $('relProgress').value=S.phase==='boss'?(4-remaining)/4:S.killed/S.killNeed;
 $('relHullLabel').textContent=basicText('체력','HULL');$('relHull').textContent=Math.ceil(S.hp)+' / '+maxHp();$('relHealth').max=maxHp();$('relHealth').value=S.hp;$('relHealth').classList.toggle('low',S.hp<maxHp()*.3);
 $('relSquadLabel').textContent=basicText('내 편대 ','YOUR SQUAD ')+S.allies.length+' / '+allyCap();
 const key=S.allies.map(a=>a.type+':'+Math.ceil(a.hp*10/a.hpMax)).join(',')+'|'+allyCap();if(key!==REL.hudKey){REL.hudKey=key;const slots=$('relSlots');slots.replaceChildren();for(let i=0;i<allyCap();i++){const a=S.allies[i],slot=basicNode('div',null,'rel-slot');if(a){const im=basicNode('img');im.src=relAllyIcon(a);im.alt=nm(a.type);const bar=basicNode('i');bar.style.setProperty('--hp',Math.max(0,a.hp/a.hpMax)*100+'%');slot.append(im,bar);slot.title=nm(a.type);}else{slot.textContent='+';slot.title=basicText('적을 포획해 편대를 채우세요','Recruit an enemy to fill this slot');}slots.append(slot);}}
 $('relBuffs').textContent=[S.shield?basicText('보호막','SHIELD'):'',S.itemDmg?'ATK +'+S.itemDmg:'',S.itemRate?'RATE +'+S.itemRate:'',S.element?ITEMS[S.element].name:''].filter(Boolean).join(' · ');
 const tip=$('relTip');tip.hidden=!S.relGuide;$('relSkip').hidden=S.relGuide!==1;$('relSkip').textContent=basicText('건너뛰기','Skip');
 if(S.relGuide){$('relTipTitle').textContent=S.relGuide===1?basicText('적 한 기가 곧 내 아군이 됩니다','One enemy. Your first ally.'):basicText('포획을 놓으면 함께 자동 사격!','Release capture. Fight together!');$('relTipText').textContent=S.relGuide===1?(isTouch?basicText('오른손으로 적을 향해 드래그 · 왼손으로 이동','Drag right control toward the enemy · Left to move'):basicText('적을 조준하고 마우스 꾹 · 방향키 또는 WASD로 이동','Aim and hold mouse · Move with arrows or '+basicLabels().join(''))):basicText('파란 편대는 아군입니다. 주황색 탄을 피하며 기지를 공략하세요.','Blue units are your squad. Dodge orange fire and take the base.');}
 const toast=$('relToast');toast.hidden=!REL.notice||S.relTime>REL.notice.until;if(!toast.hidden)toast.textContent=REL.notice.text;
 $('relControls').textContent=isTouch?'':basicText('이동 ','MOVE ')+basicLabels().join('')+' / ↑←↓→  ·  '+basicText('누르고 포획 · P 일시정지','HOLD MOUSE TO RECRUIT · P PAUSE');
}
const relDrawBase=draw;
draw=function(){relDrawBase();if(S&&mode!=='menu'&&mode!=='load'){ctx.save();ctx.setTransform(R,0,0,R,0,0);relDrawWorldHUD();ctx.restore();}relSyncHUD();};

Object.assign(ART,{"L_vulcan":"assets/c840c7f21e275184b85765b9.webp","L_gunship":"assets/41730a9257ff85628f641daf.webp","L_cannon":"assets/7e7c4bc04c1cbb0f4ebd4af7.webp","L_twin":"assets/738968e2c244da09fc384b21.webp","L_lancer":"assets/20450e10c938a2c805e91ec8.webp","L_sweeper":"assets/3230e7f0af8e2016062ba625.webp","L_cruiser":"assets/0d63d0b09c1cf620145a661b.webp","L_titan":"assets/f0d6d07d3f4f08cb89e11678.webp","L_phantom":"assets/3323ded8ac48a1590813d0ac.webp","L_nova":"assets/2fe7e2daa3e6e9266c114214.webp","main":"assets/1fbac48ee145996cfd7e962a.webp","apc":"assets/49933cdb552e49ff1ae8bd63.webp","tank":"assets/c6942eaad4e296265840cd19.webp","heli":"assets/9a7dbe42bb2d2f114305ebfa.webp","inf_w0":"assets/eaf4de99b111bec7192e9eed.webp","inf_w1":"assets/cc550970271dc94f7614ef7a.webp","inf_w2":"assets/96fd50a9f43d92e75636c9c8.webp","inf_w3":"assets/2954944c033009b1e825cf0d.webp","inf_w4":"assets/fc8d810df2aaf2b6ddc7ebce.webp","inf_w5":"assets/7193daa378187819b587419f.webp","inf_w6":"assets/b63efed9f7569347f383454f.webp","inf_w7":"assets/e6ce5f7e1d97c39679fd07ab.webp","infantry":"assets/eaf4de99b111bec7192e9eed.webp","e_bruiser":"assets/ae2516cdf90743322d0b47e4.webp","e_bruiser_pose1":"assets/66e5cf4a3664e69bad43db6a.webp","e_bruiser_pose2":"assets/5396eac580441d5db4454aec.webp","e_bruiser_pose3":"assets/9cbd39ec29ad2db0b08fe385.webp","e_bruiser_pose4":"assets/880b1183c276ae7dae0b769d.webp","e_bruiser_pose5":"assets/e9cd788151f61ea0ce0d4619.webp","e_warbrute":"assets/8ad3533b4f7c8c957c2c198f.webp","e_warbrute_pose1":"assets/f45f260b32f2d5cb742d1966.webp","e_warbrute_pose2":"assets/fe4e65c0219c001711fda115.webp","e_warbrute_pose3":"assets/b5f6757ce1c5c1edc12f7ba9.webp","e_warbrute_pose4":"assets/a7e985679c7c7ee0556f45f5.webp","e_warbrute_pose5":"assets/901284d6f5027f83220d4972.webp","L_titan_pose1":"assets/2aac13946a20cc811a31e47e.webp","L_titan_pose2":"assets/f7fc846e22e3b01f5296e075.webp","L_titan_pose3":"assets/1e49a141f3285d75cc0705b7.webp","L_titan_pose4":"assets/7dce36652e9ab28c21e4aa5e.webp","L_titan_pose5":"assets/fa2027e0dd0a821244399dbb.webp","e_missile":"assets/6461fe165837806f0d77b30f.webp","e_missile_pose1":"assets/c15d076bc1cbd2cd2c284455.webp","e_missile_pose2":"assets/44d6a8f1a087602f8e04cf47.webp","e_missile_pose3":"assets/625f66d2cf418d4848462355.webp","e_missile_pose4":"assets/8bfd3f7d2f0a5bf236954e7c.webp","e_missile_pose5":"assets/f17b221f1fa9c7e0c70bb12c.webp","e_sentry":"assets/824b8f503e69e765a4398430.webp","e_sentry_pose1":"assets/3a124028448f703dde609e93.webp","e_sentry_pose2":"assets/094ed17a9c34ba001121a5c6.webp","e_sentry_pose3":"assets/0b9681e26b5e1c59f6257e1a.webp","e_sentry_pose4":"assets/bcee7ec2a4bfd84ab5aaf759.webp","e_sentry_pose5":"assets/bcd327a184339fe2d1f5cadd.webp","infantry_pose1":"assets/124cc2affcf4d8a5bc6e42fb.webp","infantry_pose2":"assets/087d31af3197e64bbc271a66.webp","infantry_pose3":"assets/a71f9b9a92348b880f330f8b.webp","infantry_pose4":"assets/419afc58c88b9e0a823cdf2b.webp","infantry_pose5":"assets/af09daab1e7f6707418723af.webp","e_guard":"assets/58603d9ebc9ad542308af49f.webp","e_guard_pose1":"assets/eb14d06d2554d91052e516f6.webp","e_guard_pose2":"assets/4374538447892fd5fa742e64.webp","e_guard_pose3":"assets/2d672dda1a4f32ff1a9200ca.webp","e_guard_pose4":"assets/f535fc2b1435c72580d8e314.webp","e_guard_pose5":"assets/d20d6339ba08335a70418f78.webp","cg_element_freeze":"assets/44771651d3859b65b7395438.webp","cg_element_fire":"assets/4143def9cdf5feebc15cf496.webp","cg_element_poison":"assets/b16e484eb367aca8f17aa2fa.webp","cg_ordnance38":"assets/00d369b39f5e416bf1e42b4a.png","cg_siegeAtlas":"assets/14ea922986d438933c4f086a.png","evo_menu_portrait":"assets/542b50f3a4acfdf119b093a4.webp","evo_menu_landscape":"assets/df1094078955edd2d9d6abce.webp","evo_menu_logo":"assets/5e81bed1aa16e2bd7b6fda1a.webp"});
/* Evolution rules are independent from the preserved v37/Full editions. */
const EVO={version:1,waiting:false,legendLimit:5,legendChance:.38,legendCapture:.30,events:[],lastChoices:[]};
const EVO_LEGENDS=['L_vulcan','L_gunship','L_cannon','L_twin','L_lancer','L_sweeper','L_cruiser','L_titan','L_phantom','L_nova'];
TUNE.keySpeed=3.5;TUNE.baseFireMs=270;TUNE.enemyCap=18;TUNE.regenPerPower=.35;
TUNE.enemyDmgPerStage=.033;
BASIC_BALANCE.allyHP=1;BASIC_BALANCE.allyDamage=1;
function evoEnemyLimit(stage){return Math.min(32,4+Math.floor((Math.max(1,stage)-1)*.48));}
function evoSpawnInterval(stage,boss=false){const n=Math.max(0,stage-1);return boss?Math.max(1050,3300-n*53):Math.max(460,2250/(1+n*.077));}
function evoHealthScale(stage){const n=Math.max(0,stage-1);return .78+n*.12+n*n*.010+Math.max(0,n-15)*.28;}
function evoTurretHealth(stage){const n=Math.max(0,stage-1);return Math.round(17+n*6+n*n*.48+Math.max(0,n-10)*4);}
function evoKillGoal(stage){const n=Math.max(0,stage-1);return Math.min(140,Math.round(5+n*1.3+n*n*.018));}

const evoClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const evoWays=()=>Math.min(6,S.ways+(S.evoSalvo||0));
const evoRand=n=>{let v=(n^0x9e3779b9)>>>0;v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);return ((v^(v>>>15))>>>0)/4294967296;};
function evoLog(){}
for(const k of ['evoSalvo','evoRange','evoSquad','evoSeed','evoTacticalAI'])relNumeric.push(k);
function evoBeginPlay(){if(!S||mode!=='play'||!EVO.waiting)return;EVO.waiting=false;cgResumeAudio();if(!soundOn)setBattleSound(true);relToast('포획하고 함께 돌파하세요!','Capture. Build. Break through!');evoLog('first-input');}
function evoWake(e){if(!S||mode!=='play'||!EVO.waiting)return;if(e.type==='keydown'&&!['KeyW','KeyA','KeyS','KeyD','KeyI','KeyJ','KeyK','KeyL','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))return;
 if(e.type==='pointerdown'&&e.target.closest('button,select,a'))return;evoBeginPlay();}
document.addEventListener('pointerdown',evoWake,{capture:true});document.addEventListener('keydown',evoWake,{capture:true});
const evoSkipGuideBase=relSkipGuide;
relSkipGuide=function(){evoSkipGuideBase();evoBeginPlay();};
function evoAutoStart(){document.body.classList.add('evolution');EVO.waiting=false;clearBattleInput();showMenu();}
const evoBaseNew=newGame;
newGame=function(...args){EVO.events=[];evoBaseNew(...args);S.evoSeed=S.evoSeed||Math.floor(Math.random()*99999999)+1;relSaveCheckpoint();};
const evoStageBase=startStage;
startStage=function(n){evoStageBase(n);n=S.stage;S.legendCd=1e9;S.evoLegendChecked=false;S.evoLegendAt=6500;S.evoBossLegendChecked=false;S.evoBossLegendAt=Infinity;S.evoLegendSeen=[];S.evoLegendPlaceRetry=0;S.evoDepartures=[];
 S.killNeed=evoKillGoal(n);S.spawnCd=S.relGuide===1?1e9:(n<=3?1700:850);relSaveCheckpoint();
};
const evoMakeBase=makeUnit;
makeUnit=function(type,x,y,side){const u=evoMakeBase(type,x,y,side);if(!S||isVelcarion(u))return u;
 const n=Math.max(0,S.stage-1);if(side==='enemy'){
  u.hp=u.hpMax=Math.ceil(UNITS[type].hp*evoHealthScale(S.stage));u.spd*=Math.min(2.15,.78+n*.033);
  u.fire=u.fireGap=Math.max(440,u.fire*Math.max(.38,1.26/(1+n*.052)));u.fireCd=Math.min(u.fireGap,Math.max(500,1500-n*23));
  u.evoRole=type==='infantry'?'flank':u.flying?'strafe':['walk','authored'].includes(visualRig(u).kind)?'burst':'salvo';
  u.ai=u.ai||'evolution';u.evoSpecial=3000+evoRand(x+y)*1800;
 }else if(side==='ally'){
  // Full-edition rarity/rank multipliers are not free capture upgrades in Basic.
  const d=UNITS[type],normalHP=Math.ceil(d.hp*(1+n*TUNE.enemyHpPerStage));
  u.hp=u.hpMax=Math.ceil(normalHP*(1+(S.evoSquad||0)*.2));u.rankMul=1;u.lv=0;
  u.ways=d.ways||1;u.homing=!!d.homing;u.fireGap=u.fire;
 }
 return u;};
const evoLegendBase=makeLegend;
makeLegend=function(key,x,y,side){const u=evoLegendBase(key,x,y,side);if(!EVO_LEGENDS.includes(key))return u;
 u.w*=1.22;u.spd=Math.max(1.9,u.spd);u.hp=u.hpMax=Math.round(38+EVO_LEGENDS.indexOf(key)*4+(S?.stage||1)*2);u.dmgMul=1;u.armor=Math.min(.22,u.armor);
 for(const w of u.wep){w.dmg=Math.max(1,Math.round(w.dmg*.30));w.cd=w.cd0=Math.max(200,w.cd*.85);w.t0=0;w.range=Math.max(390,w.range||400);}
 if(side==='ally'){u.hp=u.hpMax=Math.round(u.hpMax*(1+(S.evoSquad||0)*.2));u.dmgMul=1+(S.evoSquad||0)*.2;}
 u.evoExpiry=18000;return u;};
function evoDepart(e,reason){S.evoDepartures.push({type:e.type,x:e.x,y:e.y,w:e.w,r:e.r,side:'neutral',img:e.img,face:e.face,t:e.t,life:650});evoLog('legend-departed',{key:e.type,reason});relToast(reason==='failed'?'포획 실패 · 레전드가 전장을 이탈합니다':'레전드가 전장을 이탈했습니다',reason==='failed'?'Capture failed · Legend withdrawing':'Legend withdrew from the battlefield');}
const evoDamageBase=damageUnit;
damageUnit=function(e,...args){if(e.isLegend&&e.side==='neutral')return;return evoDamageBase(e,...args);};
spawnAroundPlayer=function(){if(S.relGuide===1||S.relClearIn)return;
 const available=evoEnemyLimit(S.stage)-S.enemies.length-S.relQueue.length,count=Math.min(available,S.stage>=28?3:S.stage>=8?2:1);
 for(let i=0;i<count;i++){const serial=S.relSpawnCount++,type=pickType(S.stage),angle=-Math.PI/2+Math.sin(serial*2.4)*(S.stage<3?1.5:2.45),d=250+Math.random()*80;
 S.relQueue.push({type,x:evoClamp(S.px+Math.cos(angle)*d,65,WORLD.w-65),y:evoClamp(S.py+Math.sin(angle)*d,90,WORLD.h-90),remaining:900+i*160});}
};
const evoEnemyAI=enemyAI;
enemyAI=function(e,dx,dy,dist,dt,sl){evoEnemyAI(e,dx,dy,dist,dt,sl);if(!e.evoRole||S.stage<5)return;
 const a=Math.atan2(dy,dx),side=Math.sin(e.t*.0018+e.bob);if(['flank','strafe'].includes(e.evoRole)&&!e.charge&&!e.flash&&!e.gone&&e.mv!==0){const sp=(e.evoRole==='strafe'?1.1:.55)*sl*dt/16;e.x+=-Math.sin(a)*side*sp;e.y+=Math.cos(a)*side*sp;}
 if(S.stage<10||dist>430)return;e.evoSpecial-=dt;
 if(e.evoCharge>0){e.evoCharge-=dt;e.mv*=.45;e.noFire=true;if(e.evoCharge<=0){const n=S.stage<25?2:e.evoRole==='salvo'?Math.min(5,3+Math.floor((S.stage-25)/18)):3;eVolley(e,e.evoAim,n,e.evoRole==='salvo'?.19:.075,{bspd:3.3,dmg:e.bdmg*.7,c:'#ffac71'});e.evoSpecial=Math.max(2300,5400-S.stage*45);evoLog('enemy-pattern',{role:e.evoRole});}}
 else if(e.evoSpecial<=0){e.evoCharge=Math.max(560,820-S.stage*4);e.evoAim=a;}
};
function evoBoostBullets(start){for(let i=start;i<S.ebullets.length;i++){const b=S.ebullets[i];if(b.evoBoosted)continue;b.evoBoosted=true;const f=Math.min(1.68,1.025+(S.stage-1)*.0125),sp=Math.hypot(b.vx,b.vy)||1,k=Math.min(f,5.8/sp);b.vx*=k;b.vy*=k;}}
const evoVolleyBase=eVolley;
eVolley=function(...args){const n=S.ebullets.length;evoVolleyBase(...args);evoBoostBullets(n);};
const evoFireBase=fireFrom;
fireFrom=function(u,ang,from){const n=S.ebullets.length,b=S.bullets.length;evoFireBase(u,ang,from);if(from==='enemy')evoBoostBullets(n);else if(from==='ally')for(let i=b;i<S.bullets.length;i++)S.bullets[i].dmg*=1+(S.evoSquad||0)*.20;};
const evoBaseSpawn=spawnBase;
spawnBase=function(){evoBaseSpawn();S.evoBossLegendAt=S.relTime+9500;for(const t of S.turrets){const n=S.stage-1;t.hp=t.hpMax=evoTurretHealth(S.stage);t.fireCd=1300+t.i*370;}S.spawnCd=2600;};
relUpdateTurrets=function(dt){for(const t of S.turrets){if(!t.alive)continue;t.flash=Math.max(0,(t.flash||0)-dt);if(Math.hypot(S.px-t.x,S.py-t.y)>620)continue;
 if(t.relCharge>0){t.relCharge-=dt;if(t.relCharge<=0){t.evoVolley=(t.evoVolley||0)+1;const sweep=S.stage>=20&&t.evoVolley%3===0,ways=S.stage===1?1:S.stage<4?2:S.stage<12?3:S.stage<30?5:7,spread=sweep?.12:.17;
 for(let i=0;i<ways;i++){const a=t.relAngle+(i-(ways-1)/2)*spread+(sweep?Math.sin(t.evoVolley)*.25:0),sp=Math.min(5.4,3.2+S.stage*.035),b={x:t.x,y:t.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,c:'#ff956a',big:true,dmg:Math.round((8+Math.min(7,Math.floor(S.stage/8)))*enemyDmgScale())};S.ebullets.push(b);cgTurretFire(t,b,a);}
 t.fireCd=S.stage<=3?3200-S.stage*150:Math.max(1050,2550-S.stage*23);relEvent('turret-volley',{turret:t.i});}
 }else{t.fireCd-=dt;if(t.fireCd<=0){t.relAngle=Math.atan2(S.py-t.y,S.px-t.x);t.relCharge=Math.max(600,820-S.stage*3);}}}};
const evoUpdateBase=update;
update=function(dt){if(mode!=='play')return;if(EVO.waiting){visualUpdate(dt);return;}evoUpdateBase(dt);if(mode!=='play')return;
 if(S.relGuide!==1&&S.relTime>=S.evoLegendAt&&!S.relClearIn)evoTryLegend();
 for(let i=S.enemies.length-1;i>=0;i--){const e=S.enemies[i];if(!e.isLegend||isHero(e))continue;e.evoExpiry-=dt;if(e.evoExpiry<=0&&!(S.beam&&S.basicCaptureTarget===e&&e.cap>0)){evoDepart(e,'expired');S.enemies.splice(i,1);}}
 S.evoDepartures=S.evoDepartures.filter(e=>{e.life-=dt;e.y-=dt*.18;return e.life>0;});
};
const EVO_UPGRADES=[
 {id:'salvo',field:'evoSalvo',max:3,levelStages:[1,12,28],icon:'i_way',ko:'추가 포신',en:'MULTI SHOT',dk:'발사 탄환 +1 · 최대 6발',de:'+1 projectile per volley · maximum 6',group:0},
 {id:'dmg',field:'upDmg',max:10,levelStages:[1,1,4,7,10,16,24,33,43,53],icon:'i_pwr',ko:'고밀도 탄두',en:'HEAVY ROUNDS',dk:'기본 공격력 +1',de:'+1 base weapon damage',group:0},
 {id:'rate',field:'upRate',max:5,icon:'i_rate',ko:'고속 장전',en:'RAPID RELOAD',dk:'발사 간격 10% 감소',de:'10% shorter firing interval',group:0},
 {id:'squadPower',field:'evoSquad',max:6,levelStages:[1,7,16,28,40,52],icon:'i_apwr',ko:'정예 편대',en:'ELITE SQUAD',dk:'모든 아군 체력·공격력 +20%p',de:'+20 percentage points of ally hull & damage',group:1},
 {id:'tacticalAI',field:'evoTacticalAI',max:5,icon:'i_slot',ko:'전술 AI 강화',en:'TACTICAL AI',dk:'아군의 인공지능 능력이 향상됩니다. 회피 반응·공격 위치 선정 강화',de:'Improves allied AI: quicker dodges and smarter firing positions',group:1},
 {id:'beam',field:'upBeam',max:4,icon:'i_rate',ko:'고속 포획',en:'FAST CAPTURE',dk:'포획 시간 12% 감소 · 사거리 +18',de:'12% faster capture · +18 reach',group:1},
 {id:'range',field:'evoRange',max:3,icon:'i_slot',ko:'광역 레이더',en:'WIDE RADAR',dk:'포획 사거리 +25 · 포획 폭 +12',de:'+25 capture reach · +12 beam width',group:1},
 {id:'cap',field:'upCap',max:4,icon:'i_shld',ko:'레전드 동기화',en:'LEGEND SYNC',dk:'레전드 포획 확률 +5%p · 최대 50%',de:'+5 percentage points capture chance · max 50%',group:1,minStage:2},
 {id:'legendBay',field:'evoLegendBay',max:3,icon:'i_slot',ko:'레전드 편대 증강',en:'LEGEND SQUAD EXPANSION',dk:'레전드 출격 +1 · 2 → 3 → 4 → 5기',de:'+1 deployed Legend · 2 → 3 → 4 → 5',group:1,minStage:2},
 {id:'squad',field:'upSquad',max:4,icon:'i_slot',ko:'편대 확장',en:'SQUAD BAY',dk:'일반 아군 슬롯 +1 · 레전드는 별도',de:'+1 regular ally slot · Legends are separate',group:1},
 {id:'move',field:'upMove',max:3,icon:'i_spd',ko:'기동 부스터',en:'THRUST BOOST',dk:'기본 이동 속도 +8%p',de:'+8 percentage points movement speed',group:2},
 {id:'armor',field:'upArmor',max:5,levelStages:[1,7,16,31,46],icon:'i_shld',ko:'적응형 장갑',en:'REACTIVE ARMOR',dk:'받는 피해 8%p 감소',de:'8 percentage points damage reduction',group:2},
 {id:'power',field:'upPower',max:7,levelStages:[1,5,12,21,31,42,53],icon:'i_heal',ko:'자가 복구 선체',en:'REPAIR HULL',dk:'최대 체력 +30 · 초당 회복 +0.35',de:'+30 max hull · +0.35 regeneration/sec',group:2}
];
function evoUpgradeEligible(u){return (S[u.field]||0)<u.max&&S.stage>=(u.minStage||1)&&(!u.levelStages||S.stage>=u.levelStages[S[u.field]||0]);}
function evoApplyUpgrade(u){if(!foiCanChooseUpgrade()||!evoUpgradeEligible(u)||S.evoNeedSelection||EVO_DEBRIEF.busy)return;const old=S[u.field]||0;S[u.field]=old+1;S.upsTaken[u.id]=(S.upsTaken[u.id]||0)+1;
 if(u.id==='power')S.hp=Math.min(maxHp(),S.hp+30);if(u.id==='squadPower'){
  const ratio=(1+S.evoSquad*.2)/(1+old*.2);
  for(const a of S.allies){a.hp*=ratio;a.hpMax*=ratio;if(a.isLegend)a.dmgMul=1+S.evoSquad*.2;}
  // Reserve hull receives the same permanent upgrade; its remaining hull ratio
  // stays unchanged. This is not the deployed-survivor repair reward.
  for(const d of S.evoReserve||[]){d.hp*=ratio;d.hpMax=(d.hpMax||d.hp/ratio)*ratio;}
 }
 evoLog('upgrade',{id:u.id,level:S[u.field]});clearBattleInput();foiAfterUpgradeChoice(u);}
rollUpgrades=function(){const box=$('upChoices');box.replaceChildren();cards=[];const eligible=EVO_UPGRADES.filter(evoUpgradeEligible),chosen=[];
 for(let g=0;g<3;g++){let pool=eligible.filter(u=>u.group===g&&!chosen.includes(u));if(!pool.length)pool=eligible.filter(u=>!chosen.includes(u));if(pool.length){const fresh=pool.filter(u=>!EVO.lastChoices.includes(u.id));if(fresh.length)pool=fresh;chosen.push(pool[Math.floor(Math.random()*pool.length)]);}}
 if(S.stage===1){const salvo=eligible.find(u=>u.id==='salvo');if(salvo)chosen[0]=salvo;}
 EVO.lastChoices=chosen.map(u=>u.id);$('upEyebrow').textContent=basicText('스테이지 ','SECTOR ')+S.stage+basicText(' 확보',' SECURED');$('upTitle').textContent=basicText('다음 전투의 힘을 선택하세요','Choose your next advantage');
 $('missionBox').replaceChildren(basicNode('p',basicText('편대가 동행합니다 · 내구도 25% 회복 · 선택한 강화는 계속 유지됩니다','Your squad carries over · Restore 25% hull · Chosen upgrades stay'),'rel-clear-summary'));$('claimBox').replaceChildren();
 for(const u of chosen){const b=basicButton('',()=>evoApplyUpgrade(u),'card');b.dataset.upgrade=u.id;const im=basicNode('img');im.src=ART[u.icon];im.alt='';const copy=basicNode('span',null,'txt');copy.append(basicNode('small',(S[u.field]||0)+' → '+((S[u.field]||0)+1)+' / '+u.max),basicNode('strong',basicText(u.ko,u.en)),basicNode('span',basicText(u.dk,u.de)),basicNode('small',basicText('다음 스테이지 유지','PERSISTS BETWEEN SECTORS')));b.append(im,copy);box.append(b);cards.push(b);}
 if(!chosen.length){const b=basicButton(basicText('완전 회복 후 진격','Fully repair and advance'),()=>{S.hp=maxHp();advanceAfterUpgrade();},'card');box.append(b);cards.push(b);}
 $('claimBox').append(basicNode('p',basicText('공격 · 편대/포획 · 생존 중 선택하세요. 적도 더 빠르게 움직이고 새로운 공격을 사용합니다.','Choose firepower, squad/capture or survival. Enemies gain speed and new attack patterns.'),'rel-carry-rules'));queueMicrotask(()=>cards[0]?.focus({preventScroll:true}));};
const evoHudBase=relSyncHUD;
relSyncHUD=function(){evoHudBase();if(!S||!REL.ready||!['play','pause'].includes(mode))return;
 $('relChapter').textContent='FIELD OF IMMORTALS  /  '+basicText('스테이지 ','SECTOR ')+String(S.stage).padStart(2,'0');
 $('relSquadLabel').textContent=basicText('편대 ','SQUAD ')+rosterCount(false)+'/'+allyCap()+'  ·  ★ '+rosterCount(true)+'/2';
 const allies=S.allies.filter(a=>!a.isLegend),legends=S.allies.filter(a=>a.isLegend);const slots=$('relSlots'),stamp=REL.hudKey+'|'+S.stage;if(slots.dataset.evoStamp!==stamp){slots.dataset.evoStamp=stamp;slots.replaceChildren();
 for(const a of [...allies,...legends]){const slot=basicNode('div',null,'rel-slot'+(a.isLegend?' evo-legend':'')),im=basicNode('img'),bar=basicNode('i');im.src=relAllyIcon(a);im.alt=nm(a.type);slot.title=nm(a.type);bar.style.setProperty('--hp',Math.max(0,a.hp/a.hpMax)*100+'%');slot.append(im,bar);slots.append(slot);}
 if(!S.allies.length)slots.append(basicNode('small',basicText('포획해 내 편으로','Recruit your first ally')));}
 if(EVO.waiting){$('relTip').hidden=false;$('relTipTitle').textContent=basicText('바로 움직여 시작하세요','Move to begin');$('relTipText').textContent=basicText('적을 향해 누르면 포획 · 놓으면 자동 사격','Hold toward an enemy to recruit · Release to auto-fire');}
 $('relBuffs').textContent=(evoWays()>1?basicText('탄환 ','SHOTS ')+evoWays()+' · ':'')+(S.evoSquad?basicText('편대 +','SQUAD +')+(S.evoSquad*20)+'%':'');
};
const evoWorldHUD=relDrawWorldHUD;
relDrawWorldHUD=function(){evoWorldHUD();for(const e of S.enemies){const x=e.x-S.cam.x,y=e.y-S.cam.y;if(e.evoCharge>0){ctx.save();ctx.strokeStyle='#ffb777';ctx.globalAlpha=.4;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(e.evoAim)*250,y+Math.sin(e.evoAim)*250);ctx.stroke();ctx.restore();}
 if(e.isLegend&&!isHero(e)){ctx.save();ctx.textAlign='center';ctx.font='bold 12px system-ui';const label='★ '+nm(e.type)+' · '+Math.ceil(e.evoExpiry/1000)+'s';const ww=ctx.measureText(label).width;ctx.fillStyle='#211b14eb';ctx.fillRect(x-ww/2-7,y-e.w*.6-26,ww+14,22);ctx.fillStyle='#ffe5a4';ctx.fillText(label,x,y-e.w*.6-10);ctx.restore();}}
 for(const e of S.evoDepartures||[]){const im=TINT.neutral[e.img]||IMG[e.img];if(!im)continue;ctx.save();ctx.globalAlpha=e.life/650;ctx.drawImage(im,e.x-S.cam.x-e.w/2,e.y-S.cam.y-e.w/2,e.w,e.w*im.height/im.width);ctx.restore();}};

/* Collected Legends are distinct machines: deployed (2..5) and reserve (up to 10 total).
 * Only surviving machines that actually cleared a sector receive its 25% repair. */
relNumeric.push('evoLegendBay');
function evoLegendCap(){return 2+Math.max(0,Math.min(3,Math.floor(S?.evoLegendBay||0)));}
function evoLegendCaptureChance(){return Math.min(.50,.30+(S.upCap||0)*.05);}
function evoLegendRecord(a){return{key:a.type,hp:a.hp,hpMax:a.hpMax};}
function evoOwnedLegends(){return [...S.allies.filter(a=>a.isLegend&&a.hp>0).map(evoLegendRecord),...(S.evoReserve||[]).filter(a=>a.hp>0)];}
function evoRestoreLegend(d,x,y){const a=makeLegend(d.key,x,y,'ally');if(Number.isFinite(d.hpMax))a.hpMax=d.hpMax;a.hp=Math.min(a.hpMax,d.hp);return a;}
// Twin Sentry is the regular e_sentry turret; L_twin is the mobile Twin Blaster.
const evoFixedMake=makeUnit;
makeUnit=function(key,x,y,side){const a=evoFixedMake(key,x,y,side);if(key==='e_sentry'){a.spd=0;a.evoStationary=true;if(S?.props)resolveProps(a,a.r,false);a.evoAnchor={x:a.x,y:a.y};}return a;};
const evoFleetFormation=relFormation;
relFormation=function(a,dt){if(a.evoStationary)return;return evoFleetFormation(a,dt);};
function evoPlaceSentry(a){
 // Nearby forward positions are useful in the current sector, not in a remote map corner.
 for(let i=0;i<40;i++){const seed=(S.evoSeed||1)+S.stage*19391+i*313,angle=-Math.PI/2+(evoRand(seed)-.5)*2.3,dist=100+evoRand(seed+731)*150;
  const x=evoClamp(S.px+Math.cos(angle)*dist,80,WORLD.w-80),y=evoClamp(S.py+Math.sin(angle)*dist,100,WORLD.h-100),probe={x,y};
  resolveProps(probe,a.r,false);
  if(Math.hypot(probe.x-x,probe.y-y)<1&&!S.allies.some(u=>Math.hypot(u.x-x,u.y-y)<u.r+a.r+12)){a.x=x;a.y=y;a.evoAnchor={x,y};return;}
 }
 // A collision-resolved local fallback is still stable for this sector.
 const probe={x:S.px+90,y:S.py-100};resolveProps(probe,a.r,false);a.x=probe.x;a.y=probe.y;a.evoAnchor={x:a.x,y:a.y};
}
const evoFleetPush=pushAlly;
pushAlly=function(a){
 if(!a?.isLegend)return evoFleetPush(a);
 if(evoOwnedLegends().some(d=>d.key===a.type))return false;
 if(rosterCount(true)<evoLegendCap()){S.allies.push(a);return true;}
 (S.evoReserve||=[]).push(evoLegendRecord(a));return true;
};
function evoRecruitLegend(e){
 const a=makeLegend(e.type,e.x,e.y,'ally');a.face=e.face;const deployed=rosterCount(true)<evoLegendCap();
 if(!pushAlly(a))return;S.killed++;evoLog('legend-captured',{key:e.type,deployed});
 relToast('★ '+nm(e.type)+basicText(deployed?' · 레전드 편대 합류':' · 레전드 예비 편대 보관 · 클리어 후 선택',deployed?' · Legend deployed':' · Legend in reserve · Select after clearing'));
 S.fx.push({k:'ring',x:e.x,y:e.y,r:6,max:76,life:500,t:500,c:'#ffd788'});
}
function evoTryLegend(){
 if(S.stage<2||mode!=='play'||S.relClearIn||S.rewardSettled)return;
 const boss=S.phase==='boss',flag=boss?'evoBossLegendChecked':'evoLegendChecked';
 if(S[flag]||S.relTime<(S.evoLegendPlaceRetry||0)||boss&&S.relTime<S.evoBossLegendAt||S.enemies.some(e=>e.isLegend&&e.side==='neutral'))return;
 const salt=boss?81397:27011,chance=boss?.30:EVO.legendChance,seed=(S.evoSeed||1)+S.stage*salt;
 if(evoRand(seed)>=chance){S[flag]=true;return;}
 const excluded=new Set([...evoOwnedLegends().map(d=>d.key),...(S.evoLegendSeen||[])]),pool=EVO_LEGENDS.filter(k=>!HEROES[k]&&!excluded.has(k));
 if(!pool.length){S[flag]=true;return;}
 const key=pool[Math.floor(evoRand(seed+7103)*pool.length)],a=makeLegend(key,S.px,S.py,'neutral');let placed=false;
 for(let i=0;i<16;i++){
  const angle=evoRand(seed+197*i)*Math.PI*2,dist=150+evoRand(seed+97*i)*65;
  a.x=evoClamp(S.px+Math.cos(angle)*dist,80,WORLD.w-80);a.y=evoClamp(S.py+Math.sin(angle)*dist,85,WORLD.h-85);resolveProps(a,a.r,a.flying);
  if(Math.hypot(a.x-S.px,a.y-S.py)<90||S.base&&Math.hypot(a.x-S.base.x,a.y-S.base.y)<125||S.turrets.some(t=>t.alive&&Math.hypot(a.x-t.x,a.y-t.y)<75))continue;
  if(a.x<S.cam.x+40||a.x>S.cam.x+W-40||a.y<S.cam.y+65||a.y>S.cam.y+H-55)continue;
  placed=true;break;
 }
 if(!placed){S.evoLegendPlaceRetry=S.relTime+250;return;} // Retry placement, not the probability roll, on a later tick.
 S[flag]=true;(S.evoLegendSeen||=[]).push(key);a.spd=.35;if(a.evoStationary)a.evoAnchor={x:a.x,y:a.y};
 S.enemies.push(a);evoLog('legend-arrived',{key,phase:boss?'boss':'hunt'});relToast('레전드 발견! 18초 내 포획 · 성공률 '+Math.round(capChance(a)*100)+'%','LEGEND! 18 seconds · '+Math.round(capChance(a)*100)+'% capture chance');
}
const evoFleetStage=startStage;
startStage=function(n){
 const active=(S.allies||[]).filter(a=>a.isLegend&&a.hp>0).map(evoLegendRecord),reserve=(S.evoReserve||[]).map(d=>({...d}));
 evoFleetStage(n);S.evoReserve=[];S.evoNeedSelection=false;S.evoSelectionConfirmed=false;
 for(const d of active){const a=evoRestoreLegend(d,S.px+65,S.py+35);pushAlly(a);if(a.evoStationary)evoPlaceSentry(a);}
 S.evoReserve.push(...reserve);for(const a of S.allies)if(a.type==='e_sentry')evoPlaceSentry(a);relSaveCheckpoint();
};
const evoFleetSave=relSaveCheckpoint;
relSaveCheckpoint=function(){evoFleetSave();if(REL.resuming||!S)return;const cp=META.relaunchRun;if(!cp)return;
 cp.allies=S.allies.filter(a=>!a.isLegend&&a.hp>0).map(a=>a.type);
 cp.legends=S.allies.filter(a=>a.isLegend&&a.hp>0).map(evoLegendRecord);
 cp.legendReserve=(S.evoReserve||[]).filter(d=>d.hp>0).map(d=>({...d}));
 cp.legendHealedStage=S.evoLegendHealedStage||0;metaSave();
};
const evoFleetValid=relValidSave;
relValidSave=function(){
 if(!evoFleetValid())return false;const r=META.relaunchRun,a=r.legends||[],b=r.legendReserve||[],bay=r.values.evoLegendBay||0;
 const valid=d=>d&&EVO_LEGENDS.includes(d.key)&&Number.isFinite(d.hp)&&d.hp>0&&d.hp<=100000&&(d.hpMax===undefined||Number.isFinite(d.hpMax)&&d.hpMax>=d.hp&&d.hpMax<=100000);
 return Number.isInteger(bay)&&bay>=0&&bay<=3&&Array.isArray(a)&&Array.isArray(b)&&a.length<=2+bay&&a.length+b.length<=12&&[...a,...b].every(valid)&&new Set([...a,...b].map(d=>d.key)).size===a.length+b.length;
};
const evoFleetContinue=relContinue;
relContinue=function(){
 const cp=relValidSave()?structuredClone(META.relaunchRun):null;evoFleetContinue();if(!cp)return;
 S.evoReserve=[];S.evoLegendHealedStage=cp.legendHealedStage||0;
 for(const d of cp.legends||[]){const a=evoRestoreLegend(d,S.px+65,S.py+35);pushAlly(a);if(a.evoStationary)evoPlaceSentry(a);}
 S.evoReserve=(cp.legendReserve||[]).map(d=>({...d}));relSaveCheckpoint();
};
const evoFleetUpdate=update;
update=function(dt){evoFleetUpdate(dt);if(!S||mode!=='play')return;for(const a of [...S.allies,...S.enemies])if(a.evoStationary&&a.evoAnchor){a.x=a.evoAnchor.x;a.y=a.evoAnchor.y;a.mv=0;a.spd=0;const v=visualState(a);v.speed=0;v.pivotSpeed=0;}};
function evoHealClearedLegends(){
 if(S.evoLegendHealedStage===S.stage)return;
 for(const a of S.allies)if(a.isLegend&&a.hp>0)a.hp=Math.min(a.hpMax,a.hp+a.hpMax*.25);
 S.evoLegendHealedStage=S.stage;
}
function evoSetLegendSelection(keys){
 const records=evoOwnedLegends(),selected=new Set(keys);
 if(selected.size!==keys.length||keys.length>evoLegendCap()||keys.some(k=>!records.some(d=>d.key===k)))return false;
 const keep=S.allies.filter(a=>!a.isLegend);S.allies=keep;S.evoReserve=[];
 for(const d of records){if(selected.has(d.key))S.allies.push(evoRestoreLegend(d,S.px+65,S.py+35));else S.evoReserve.push(d);}
 S.evoNeedSelection=false;S.evoSelectionConfirmed=true;return true;
}
function evoShowLegendSelection(done,expanded=false){
 const records=evoOwnedLegends(),required=Math.min(evoLegendCap(),records.length);
 if(!records.length){S.evoNeedSelection=false;S.evoSelectionConfirmed=true;done();return;}
 S.evoNeedSelection=true;S.evoSelectionConfirmed=false;cards=[];relSyncHUD();$('lyUp').classList.add('evo-selectmode');$('upChoices').after($('claimBox'));
 const selected=new Set(S.allies.filter(a=>a.isLegend&&a.hp>0).map(a=>a.type));
 $('upEyebrow').textContent=basicText('스테이지 ','SECTOR ')+S.stage+basicText(' 확보',' SECURED');
 $('upTitle').textContent=basicText(expanded?'새 출격 칸을 편성하세요':'레전드 출격 편성',expanded?'Fill your new Legend slot':'Choose Legends for the next sector');
 $('missionBox').replaceChildren(basicNode('p',basicText('방금 출격해 생존한 레전드만 체력 25% 회복 · 예비 편대는 체력 유지','Survivors from this battle repaired 25% · Reserve hull unchanged'),'rel-clear-summary'));
 const box=$('upChoices');box.replaceChildren();box.classList.add('evo-fleet-grid');
 const status=basicNode('p',null,'evo-fleet-status'),confirm=basicButton('',()=>{
  if(selected.size!==required||!evoSetLegendSelection([...selected]))return;box.classList.remove('evo-fleet-grid');$('lyUp').classList.remove('evo-selectmode');done();
 },'basic-primary evo-fleet-confirm');
 const buttons=[];
 const refresh=()=>{status.textContent=basicText('출격 ','DEPLOY ')+selected.size+' / '+required+basicText('기 · 보유 ',' · OWNED ')+records.length+'/10';
  confirm.textContent=basicText(expanded?'편성 확정 · 다음 스테이지':'편성 확정 · 보상 선택',expanded?'Confirm · Next sector':'Confirm · Choose reward');confirm.disabled=selected.size!==required;
  for(const [d,b,label]of buttons){const yes=selected.has(d.key);b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));label.textContent=basicText(yes?'출격 선택됨':'예비 편대',yes?'SELECTED':'RESERVE');}};
 for(const d of records){const b=basicButton('',()=>{if(selected.has(d.key))selected.delete(d.key);else if(selected.size<required)selected.add(d.key);else{status.textContent=basicText('선택된 기체를 먼저 해제하세요','Deselect a machine first');return;}refresh();},'evo-fleet-card');
  const im=basicNode('img');im.src=relAllyIcons[d.key]||ART[d.key];im.alt='';const label=basicNode('span',null,'evo-fleet-badge'),bar=basicNode('progress');bar.max=d.hpMax||d.hp;bar.value=d.hp;
  b.append(im,basicNode('strong',nm(d.key)),basicNode('small',Math.ceil(d.hp)+' / '+Math.ceil(d.hpMax||d.hp)),bar,label);
  
  buttons.push([d,b,label]);box.append(b);cards.push(b);
 }
 $('claimBox').replaceChildren(status,confirm);refresh();queueMicrotask(()=>cards[0]?.focus({preventScroll:true}));
}
const evoFleetRewards=rollUpgrades;
rollUpgrades=function(){evoHealClearedLegends();if(!S.evoSelectionConfirmed&&evoOwnedLegends().length){evoShowLegendSelection(()=>rollUpgrades());return;}$('upChoices').classList.remove('evo-fleet-grid');evoFleetRewards();};
const evoFleetAdvance=advanceAfterUpgrade;
advanceAfterUpgrade=function(){
 if(S.evoNeedSelection)return;
 if(rosterCount(true)<evoLegendCap()&&S.evoReserve?.length){evoShowLegendSelection(()=>evoFleetAdvance(),true);return;}
 evoFleetAdvance();
};
const evoFleetInfo=basicOpenGameInfo;
basicOpenGameInfo=function(initial){evoFleetInfo(initial);$('basicCodexPanel').parentElement.querySelectorAll('.evo-info').forEach(n=>n.remove());
 const section=basicNode('section',null,'evo-info');section.append(basicNode('h3',basicText('레전드 10종 · 출격과 예비 편대','Ten Legends · Deployment and reserve')),
 basicNode('p',basicText('2스테이지부터 일반 교전 38%, 보스전 30%의 별도 확률로 아직 보유하지 않은 레전드 10종 중 1기가 무작위 등장합니다. 병종별 스테이지 제한은 없습니다. 18초 내 포획, 기본 성공률 30%이며 동기화 강화로 최대 50%입니다. 실패하면 이탈합니다.','From sector 2, each sector offers a 38% hunt encounter roll and a separate 30% boss-battle roll. Any of the ten unowned types can appear. Capture within 18 seconds: 30% success, up to 50% with Sync. Failure means withdrawal.')),
 basicNode('p',basicText('출격 2기로 시작해 보상 ‘레전드 편대 증강’으로 최대 5기까지 확장합니다. 초과 포획한 기체는 예비 편대에 보관합니다. 클리어 후 다음 출격 기체를 선택하고 보상을 고르세요. 출격해 살아남은 기체만 최대 체력의 25%를 회복하며 대기 중인 기체는 회복하지 않습니다. 파괴된 기체는 소실되지만 다시 등장하면 재포획할 수 있습니다.','Start with two deployed Legends. Legend Squad Expansion rewards raise the cap to five. Extra captures enter reserve. Select your next lineup before choosing a reward. Only deployed survivors repair 25%; reserve hull is unchanged. Destroyed machines are lost and can be encountered again.')),
 basicNode('p',basicText('포획 이력으로 성공률이 추가 상승하지 않습니다. 보유 중인 같은 종류는 중복 출현·강화되지 않습니다. 일반 유닛 트윈 센트리는 포획한 위치에서 싸우는 고정 포탑이며, 다음 스테이지 출격 시 무작위 위치에 배치됩니다.','Past captures do not increase the chance. Owned types do not spawn as duplicates or merge. Regular unit Twin Sentry stays at its capture position and receives a random valid deployment position next sector.')));
 const row=basicNode('div',null,'evo-legend-gallery');for(const key of EVO_LEGENDS){const fig=basicNode('figure'),im=basicNode('img');im.src=ART[key];im.alt=nm(key);fig.append(im,basicNode('figcaption',nm(key)+''));row.append(fig);}section.append(row);$('basicCodexPanel').after(section);
};


/* Long-run progression: 21 regular types unlock gradually through sector 55.
 * serves both field reinforcements and base exits, so neither uses an old pool.
 * Encounter population, attack tuning and protected Legend slots are unchanged.
 */
const EVO_UNLOCKS=[
 [1,['infantry','apc','heli']], [4,['tank']], [7,['e_guard']],
 [10,['e_hawk']], [13,['e_rider']], [16,['e_missile']], [19,['e_spike']],
 [22,['legend_bike']], [25,['legend_ship']], [28,['e_scout']],
 [31,['e_sentry']], [34,['e_volt']], [37,['e_rocket']],
 [40,['e_bruiser']], [43,['e_hover']], [46,['e_mole']],
 [49,['e_warbrute']], [52,['e_flak']], [55,['e_wasp']]
];
const EVO_STAGE_ROSTER=Array.from({length:60},(_,i)=>EVO_UNLOCKS.find(([s])=>s===i+1)?.[1]||[]);
const EVO_ROSTER_KEYS=EVO_STAGE_ROSTER.flat();
EVO_STAGE_ROSTER.forEach((keys,i)=>keys.forEach(key=>{BASIC_UNIT_MAP[key].stage=i+1;}));
BASIC_CONTENT.units.sort((a,b)=>EVO_ROSTER_KEYS.indexOf(a.key)-EVO_ROSTER_KEYS.indexOf(b.key));
function evoStageDebuts(stage){return EVO_STAGE_ROSTER[stage-1]||[];}
basicUnitPool=function(stage){return EVO_STAGE_ROSTER.slice(0,Math.max(1,Math.min(60,Math.floor(stage)||1))).flat();};
function evoRosterShuffle(keys,seed){const list=keys.slice();for(let i=list.length-1;i>0;i--){const j=Math.floor(evoRand(seed+i*7919)*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
function evoRosterState(stage){if(!S.evoRoster||S.evoRoster.stage!==stage)S.evoRoster={stage,cycle:0,bag:[],last:null};return S.evoRoster;}
pickType=function(stage){
 const all=basicUnitPool(stage);if(!S)return all[0];const state=evoRosterState(stage);
 if(!state.bag.length){const seed=(S.evoSeed||1)+stage*27011+state.cycle*104729;
  const fresh=state.cycle===0?evoStageDebuts(stage):[],older=all.filter(k=>!fresh.includes(k));
  let order=[];
  if(fresh.length){const first=evoRosterShuffle(fresh,seed),rest=evoRosterShuffle(older,seed+1987);
   // New debuts are selected within five reinforcements, with familiar
   // enemies between them. Subsequent entries cover every unlocked type once.
   while(first.length){order.push(first.shift());if(rest.length)order.push(rest.shift());}order.push(...rest);
  }else order=evoRosterShuffle(all,seed);
  if(order.length>1&&order[0]===state.last)[order[0],order[1]]=[order[1],order[0]];
  state.bag=order;state.cycle++;
 }
 const key=state.bag.shift();state.last=key;return key;
};
const evoRosterStageBase=startStage;
startStage=function(stage){evoRosterStageBase(stage);S.evoRoster={stage,cycle:0,bag:[],last:null};};
// A warned reinforcement must still arrive when the boss phase begins. Losing
// this queue used to silently discard an already-selected new type.
const evoRosterBaseSpawn=spawnBase;
spawnBase=function(){const pending=S.relQueue.slice();evoRosterBaseSpawn();S.relQueue.push(...pending);};
const evoRosterRewards=rollUpgrades;
rollUpgrades=function(){evoRosterRewards();if(S.evoNeedSelection)return;const fresh=evoStageDebuts(S.stage+1);if(!fresh.length)return;
 const row=basicNode('div',null,'rel-unlocks evo-roster-unlocks');row.append(basicNode('span',basicText('다음 스테이지 새 병종','NEW NEXT SECTOR')));
 for(const key of fresh){const entry=basicNode('span',null,'evo-roster-unit'),im=basicNode('img');im.src=ART[key];im.alt='';entry.append(im,basicNode('b',nm(key)));row.append(entry);}
 $('missionBox').append(row);
};

/* Secondary motion uses fixed-step spring integration and displacement, never RNG. */
const evoVisualUpdateBase=visualUpdate;
visualUpdate=function(dt){evoVisualUpdateBase(dt);if(!S||mode!=='play')return;for(const u of [S,...S.enemies,...S.allies])evoAdvanceHullMotion(u,dt);};
function evoAdvanceHullMotion(u,dt){const h=Math.min(dt,32)/1000,v=visualState(u);if(!v.evo)v.evo={speed:v.speed,lean:0,leanV:0,pitch:0,pitchV:0};const m=v.evo,accel=(v.speed-m.speed)/Math.max(.001,h);m.speed=v.speed;
  const air=['jet','rotor','hover'].includes(visualRig(u).kind);
  const roll=evoClamp((v.steer||v.turn||0)*(air?.23:.10),air?-.18:-.075,air?.18:.075),pitch=evoClamp(accel*.012,-.075,.075);
  m.leanV+=(roll-m.lean)*75*h-m.leanV*15*h;m.lean+=m.leanV*h;
  m.pitchV+=(pitch-m.pitch)*90*h-m.pitchV*16*h;m.pitch+=m.pitchV*h;
}
for(const key of ['e_guard','e_missile','e_bruiser','e_warbrute','L_titan']){const rig=V_RIG[key];rig.gait={hip:.16,knee:.34,lift:1.25};rig.stride=key==='L_titan'?34:26;}
// Apply to the entire rig, including guns, propulsion and the capture antenna.
// Keeping all layers under one transform prevents a sliding/detached gun mount.
function evoHullTransform(u,w,h){const v=visualState(u),r=visualRig(u),m=v.evo||{},speed=Math.min(1,v.speed),walking=['walk','authored'].includes(r.kind),air=['jet','rotor','hover'].includes(r.kind);
 if(walking)return{x:Math.sin(v.phase)*.8*speed,y:-Math.abs(Math.sin(v.phase))*h*.023*speed,a:Math.sin(v.phase)*.035*speed+(m.lean||0)*.3,sy:1};
 if(air)return{x:0,y:Math.sin(VISUAL.time*.003+(u.bob||0))*.65-(m.pitch||0)*h*.26,a:m.lean||0,sy:1-(m.pitch||0)*.65};
 return{x:0,y:(m.pitch||0)*h*.32+Math.sin(v.travel*.33)*.5*speed,a:(m.lean||0)*.45,sy:1};
}
function evoApplyHullMotion(u,w,h,c=FACING_MAIN_CTX){const t=evoHullTransform(u,w,h);c.translate(t.x,t.y);c.rotate(t.a);c.scale(1,t.sy);}
// World-space flashes and the visible projectile origin follow the same rig.
const evoMotionFireBase=visualFire;
visualFire=function(u,style,ang,count){const start=VISUAL.fx.length;evoMotionFireBase(u,style,ang,count);const v=visualState(u),img=IMG[u===S?'main':u.img];if(!img)return;
 const w=u===S?ILL_PLAYER_W:u.w,h=w*img.height/img.width,t=evoHullTransform(u,w,h),[x,y]=visualXY(u),angle=facingAngle(u),co=Math.cos(angle),si=Math.sin(angle),ca=Math.cos(t.a),sa=Math.sin(t.a);
 const move=p=>{const dx=p.x-x,dy=p.y-y,lx=dx*co+dy*si,ly=(-dx*si+dy*co)*t.sy,nx=t.x+lx*ca-ly*sa,ny=t.y+lx*sa+ly*ca;p.x=x+nx*co-ny*si;p.y=y+nx*si+ny*co;};
 for(const p of v.muzzles||[])move(p);for(let i=start;i<VISUAL.fx.length;i++)move(VISUAL.fx[i]);
};
const evoRecoilBase=visualRecoil;
visualRecoil=function(v,p,rig){const amount=evoRecoilBase(v,p,rig);return amount*1.32;};
const evoMotionFrontBase=drawVisualFront;
drawVisualFront=function(u,w,h){evoMotionFrontBase(u,w,h);const r=visualRig(u),v=visualState(u);if(v.dead)return;
 // Tiny material glints stay on the hull rather than covering combat in bloom.
 const glint=.08+Math.abs(v.turn)*.12;ctx.save();ctx.globalAlpha=glint;ctx.strokeStyle='#d6eef6';ctx.lineWidth=.65;
 if(['track','wheel','hover'].includes(r.kind)){ctx.beginPath();ctx.moveTo(-w*.2,-h*.15);ctx.lineTo(-w*.1,-h*.20);ctx.moveTo(w*.12,-h*.20);ctx.lineTo(w*.2,-h*.14);ctx.stroke();}ctx.restore();};

/* One fixed simulation tick of visual interpolation removes the 62.5 Hz / 60 Hz
 * step beat. Collision/AI/save state are restored synchronously after drawing. */
const EVO_INTERP={owner:null,stage:0,positions:new WeakMap(),cam:null};
function evoMotionSnapshot(){
 if(!S||mode!=='play')return;
 EVO_INTERP.owner=S;EVO_INTERP.stage=S.stage;EVO_INTERP.cam={x:S.cam.x,y:S.cam.y};
 const map=EVO_INTERP.positions;
 for(const u of [S,...S.allies,...S.enemies]){const v=visualState(u),[x,y]=visualXY(u);map.set(u,{x,y,heading:v.heading,lowerHeading:v.lowerHeading,phase:v.phase,travel:v.travel,leftTravel:v.leftTravel,rightTravel:v.rightTravel,contactTravel:v.contactTravel});}
 for(const b of [...S.bullets,...S.ebullets])map.set(b,{x:b.x,y:b.y});
}
const evoInterpolatedDrawBase=draw;
draw=function(){
 if(!S||mode!=='play'||EVO.waiting||EVO_INTERP.owner!==S||EVO_INTERP.stage!==S.stage||S.relClearIn>0||S.rewardSettled)return evoInterpolatedDrawBase();
 const a=evoClamp(cgAccumulator/16,0,1),restore=[],mix=(prev,now)=>prev+(now-prev)*a;
 function assign(o,k,value){if(!Number.isFinite(value))return;restore.push([o,k,o[k]]);o[k]=value;}
 try{
  for(const u of [S,...S.allies,...S.enemies]){const p=EVO_INTERP.positions.get(u);if(!p)continue;const [x,y]=visualXY(u);if(Math.hypot(x-p.x,y-p.y)>20)continue;
   assign(u,u===S?'px':'x',mix(p.x,x));assign(u,u===S?'py':'y',mix(p.y,y));const v=visualState(u);
   for(const k of ['heading','lowerHeading','phase'])assign(v,k,p[k]+facingGap(v[k],p[k])*a);
   for(const k of ['travel','leftTravel','rightTravel','contactTravel'])assign(v,k,mix(p[k],v[k]));
  }
  for(const b of [...S.bullets,...S.ebullets]){const p=EVO_INTERP.positions.get(b);if(p&&Math.hypot(b.x-p.x,b.y-p.y)<50){assign(b,'x',mix(p.x,b.x));assign(b,'y',mix(p.y,b.y));}}
  const cam=EVO_INTERP.cam;if(cam&&Math.hypot(S.cam.x-cam.x,S.cam.y-cam.y)<30){assign(S.cam,'x',mix(cam.x,S.cam.x));assign(S.cam,'y',mix(cam.y,S.cam.y));}
  return evoInterpolatedDrawBase();
 }finally{for(let i=restore.length-1;i>=0;i--){const [o,k,value]=restore[i];o[k]=value;}}
};

/* Authored overhead walk/fire poses replace front-facing cutout leg rigs. */
const EVO_WALKERS={
 infantry:{stride:23,muzzles:[[.5,.90]]},
 e_guard:{stride:25,muzzles:[[.5,.88]]},
 e_bruiser:{stride:31,muzzles:[[.13,.76],[.86,.76]]},
 e_warbrute:{stride:32,muzzles:[[.5,.76]]},
 L_titan:{stride:36,muzzles:[[.5,.82]]},
 e_missile:{stride:26,muzzles:[[.63,.82]]},
 e_sentry:{stride:29,muzzles:[[.395,.68],[.61,.68]]}
};
for(const [key,d]of Object.entries(EVO_WALKERS)){
 const r=V_RIG[key];Object.assign(r,{kind:key==='e_sentry'?'fixed':'authored',parts:[],stride:d.stride,muzzle:d.muzzles[0],artAngle:null});
 ANIM[key]={walk:[key,key+'_pose1',key+'_pose2',key+'_pose3'],atk:[key+'_pose4',key+'_pose5'],atkMs:75};
 for(const k of [...ANIM[key].walk,...ANIM[key].atk])if(!UNIT_KEYS.includes(k))UNIT_KEYS.push(k);
}
const evoWalkerFrameBase=animFrame;
function evoWalkerPose(u,sp){const A=ANIM[u.type],v=visualState(u);let shotAt=-Infinity;for(const shot of Object.values(v.shots))shotAt=Math.max(shotAt,shot.time);const age=VISUAL.time-shotAt;
 if(age>=0&&age<150)return {key:A.atk[age<70?0:1],next:null,blend:0};
 if(u.evoStationary||u.type==='e_sentry'||Math.max(sp||0,v.speed||0,v.pivotSpeed||0)<.025)return{key:u.type,next:null,blend:0};
 const phase=((v.phase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*4,i=Math.floor(phase),fraction=phase-i;
 return {key:A.walk[i],next:A.walk[(i+1)%4],blend:Math.max(0,(fraction-.7)/.3)};
}
animFrame=function(u,sp){return EVO_WALKERS[u.type]?evoWalkerPose(u,sp).key:evoWalkerFrameBase(u,sp);};
const evoWalkerSpriteBase=drawVisualSprite;
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){
 if(!EVO_WALKERS[u.type])return evoWalkerSpriteBase(u,img,w,h,c);
 const pose=evoWalkerPose(u,visualState(u).speed),next=pose.next&&visualImage(u,pose.next);c.save();
 if(next&&pose.blend>0){c.globalAlpha*=1-pose.blend;c.drawImage(img,-w/2,-h/2,w,h);c.restore();c.save();c.globalAlpha*=pose.blend;c.drawImage(w<=112?evoCombatTexture(next):next,-w/2,-h/2,w,h);}
 else c.drawImage(img,-w/2,-h/2,w,h);c.restore();
};
const evoWalkerFireBase=visualFire;
visualFire=function(u,style,ang,count){const d=EVO_WALKERS[u.type];if(!d)return evoWalkerFireBase(u,style,ang,count);
 const rig=visualRig(u),parts=rig.parts;rig.parts=d.muzzles.map(tip=>({mode:'gun',tip,pivot:tip,channel:visualStyle(u,style)}));
 try{return evoWalkerFireBase(u,style,ang,count);}finally{rig.parts=parts;}
};

/* Suite VII: original melodic space-action themes, answering phrases and
 * restrained hybrid percussion. Each cue stays in its own named key. */
const EVO_CINEMA={
 earth:{title:'Breakthrough — Starlight Run',bpm:180,root:50,key:'D natural minor',style:'flight',lead:'novaLead',progress:[0,0,5,5,2,2,6,4],
 theme:[[[4,.75],[7,1.25],[6,.5],[4,.5],[2,.5],[4,.5]],[[2,1],[0,.5],[2,.5],[4,1.5],[null,.5]],[[5,1],[7,.5],[9,.5],[7,1],[5,.5],[4,.5]],[[2,.75],[0,.25],[5,1],[4,.5],[2,.5],[0,1]],[[2,1],[4,.5],[6,.5],[9,1],[8,.5],[6,.5]],[[4,1.5],[2,.5],[4,1],[6,1]],[[6,1],[8,.5],[10,.5],[8,1],[6,.5],[3,.5]],[[4,1],[6,.5],[8,.5],[6,1],[4,.5],[2,.5]]],
 answer:[[[7,1.5],[4,.5],[2,1],[4,1]],[[9,1],[7,1],[4,1.5],[null,.5]],[[5,.5],[7,.5],[9,1],[7,2]],[[6,1],[8,.5],[6,.5],[4,1],[2,1]]],kick:[0,1.5,2,2.75]},
 boss:{title:'Citadel Assault — Starbreaker',bpm:188,root:52,key:'E natural minor',style:'siege',lead:'novaBrass',progress:[0,5,3,4,0,2,6,4],
 theme:[[[0,.5],[4,.5],[7,1],[4,.5],[7,.5],[9,1]],[[9,1.5],[7,.5],[5,1],[4,1]],[[3,.75],[5,.25],[7,1],[5,.5],[3,.5],[1,1]],[[4,.5],[6,.5],[8,.5],[6,.5],[4,1.5],[null,.5]],[[7,1],[7,.5],[9,.5],[11,1],[9,1]],[[9,.75],[6,.25],[4,1],[6,1],[2,1]],[[6,.5],[8,.5],[10,1],[8,.5],[6,.5],[3,1]],[[8,1],[6,.5],[4,.5],[6,.5],[4,.5],[0,1]]],
 answer:[[[4,1],[7,1],[11,1.5],[9,.5]],[[9,.5],[7,.5],[5,2],[null,1]],[[7,.75],[5,.25],[3,.5],[1,.5],[3,2]],[[8,.5],[6,.5],[4,1],[6,.75],[4,.25],[2,1]]],kick:[0,.75,2,2.5,3.5]},
 ceres:{title:'Ceres — Aurora Flight',bpm:172,root:45,key:'A natural minor',style:'orbit',lead:'novaKeys',progress:[0,5,2,6,3,5,0,4],
 theme:[[[4,1.5],[7,.5],[9,1],[7,1]],[[9,2],[7,.5],[5,.5],[4,1]],[[6,1],[9,1.5],[6,.5],[4,1]],[[8,1.5],[6,.5],[3,1],[1,1]],[[5,1],[7,.5],[5,.5],[3,2]],[[5,.75],[7,.25],[9,1],[7,1.5],[null,.5]],[[7,1],[4,.5],[2,.5],[0,1],[2,1]],[[4,2],[6,.5],[4,.5],[2,1]]],
 answer:[[[7,2],[9,1],[11,1]],[[9,1],[7,.5],[5,.5],[7,2]],[[6,1.5],[9,.5],[6,1],[4,1]],[[8,1],[6,1],[3,1.5],[null,.5]]],kick:[0,1.75,2.5]},
 ignis:{title:'Ignis — Solar Pursuit',bpm:184,root:47,key:'B natural minor',style:'pursuit',lead:'novaLead',progress:[0,6,5,4,0,3,5,4],
 theme:[[[0,.75],[2,.25],[4,.5],[7,.5],[4,1],[2,.5],[4,.5]],[[6,.5],[8,.5],[6,.75],[3,.25],[1,1],[3,1]],[[5,.75],[7,.25],[9,1],[7,.5],[5,.5],[2,1]],[[4,.5],[6,.5],[8,1],[6,.75],[4,.25],[2,1]],[[7,.75],[9,.25],[11,.5],[9,.5],[7,1],[4,1]],[[7,1],[5,.5],[3,.5],[5,1],[1,1]],[[9,.5],[7,.5],[5,1],[7,.75],[5,.25],[2,1]],[[4,.75],[6,.25],[8,.5],[6,.5],[4,1.5],[null,.5]]],
 answer:[[[7,1.5],[4,.5],[7,.5],[9,.5],[11,1]],[[10,1],[8,1],[6,1],[3,1]],[[9,1],[7,.5],[5,.5],[7,2]],[[8,.75],[6,.25],[4,.5],[2,.5],[4,2]]],kick:[0,1.25,2,3.25]},
 prisma:{title:'Prisma — Radiant Frontier',bpm:176,root:48,key:'C major',major:true,style:'horizon',lead:'novaKeys',progress:[0,4,5,3,0,2,3,4],
 theme:[[[7,1.5],[6,.5],[4,1],[2,1]],[[4,1],[6,.5],[8,.5],[6,2]],[[5,1],[7,1],[9,1.5],[7,.5]],[[7,1],[5,.5],[3,.5],[5,2]],[[9,.75],[7,.25],[4,1],[7,1],[9,1]],[[6,1],[4,.5],[2,.5],[4,1.5],[null,.5]],[[5,1],[7,.5],[10,.5],[7,1],[5,1]],[[8,1.5],[6,.5],[4,1],[2,1]]],
 answer:[[[7,2],[9,1],[11,1]],[[8,1],[6,.5],[4,.5],[6,2]],[[9,1.5],[7,.5],[5,1],[7,1]],[[7,1],[5,1],[3,1.5],[null,.5]]],kick:[0,1,2.5,3.5]},
 menu:{title:'Command — Beyond Tomorrow',bpm:168,root:43,key:'G natural minor',style:'fleet',lead:'novaLead',progress:[0,3,5,2,6,3,4,0],
 theme:[[[0,1],[4,.5],[7,.5],[9,1],[7,1]],[[7,1.5],[5,.5],[3,1],[1,1]],[[5,1],[7,1],[9,1],[7,1]],[[9,1],[6,.5],[4,.5],[2,2]],[[6,1],[8,.5],[10,.5],[8,1],[6,1]],[[7,1],[5,.5],[3,.5],[5,2]],[[8,.75],[6,.25],[4,1],[6,1],[4,1]],[[7,1.5],[4,.5],[2,1],[0,1]]],
 answer:[[[7,2],[9,1],[11,1]],[[10,1],[7,1],[5,2]],[[9,1.5],[7,.5],[5,1],[2,1]],[[9,1],[6,1],[4,1.5],[null,.5]]],kick:[0,1.5,2.5]}
};
// Suite VIII: chord-grounded hooks, syncopated bass, four distinct drum grooves.
// Each motif is an authored four-beat phrase; numbers are diatonic chord offsets.
const NOVA_HOOKS={
 earth:[[[4,.5],[7,1],[4,.5],[2,.5],[0,1],[2,.5]],[[4,1.5],[2,.5],[0,1],[null,1]],[[0,.5],[2,.5],[4,1],[7,1.5],[4,.5]],[[2,1],[0,2],[null,1]]],
 boss:[[[0,.75],[0,.25],[4,.5],[7,.5],[4,1],[2,1]],[[7,1],[4,.5],[2,.5],[0,1.5],[null,.5]],[[4,.5],[4,.5],[7,1.5],[9,.5],[7,1]],[[4,1.5],[2,.5],[0,1],[null,1]]],
 ceres:[[[7,1.5],[4,.5],[2,1],[4,1]],[[2,.5],[4,.5],[7,2],[null,1]],[[4,1],[7,.5],[9,.5],[7,1.5],[4,.5]],[[2,1.5],[0,1.5],[null,1]]],
 ignis:[[[0,.5],[4,.75],[7,.25],[4,1],[2,.5],[4,1]],[[7,.75],[4,.25],[2,.5],[0,1.5],[null,1]],[[4,.5],[7,.5],[9,1],[7,.5],[4,1],[2,.5]],[[4,1],[2,1],[0,1.5],[null,.5]]],
 prisma:[[[4,1],[7,1],[9,.5],[7,.5],[4,1]],[[2,1.5],[4,.5],[7,1],[null,1]],[[7,.5],[9,.5],[11,1],[9,1],[7,1]],[[4,1.5],[2,.5],[0,2]]],
 menu:[[[0,1],[4,1],[7,1.5],[4,.5]],[[2,1],[4,.5],[7,.5],[4,2]],[[7,1],[9,.5],[7,.5],[4,1],[2,1]],[[4,1],[2,1],[0,2]]]
};
for(const [i,key]of ['earth','boss','ceres','ignis','prisma','menu'].entries()){
 const p=EVO_CINEMA[key];p.bpm=[174,182,170,178,176,168][i];p.title=['Starlight Rush','Citadel Overdrive','Aurora Interceptor','Solar Velocity','Radiant Wings','Fleet Horizon'][i];
 p.lead=['novaLead','novaBrass','novaKeys','novaLead','novaLead','novaBrass'][i];
}
function evoCombatScores(){
 const out={};
 for(const[key,P]of Object.entries(EVO_CINEMA)){
  const scale=P.major?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10];
  const note=(degree,oct=0)=>P.root+scale[((degree%7)+7)%7]+12*Math.floor(degree/7)+12*oct;
  const T={title:P.title,subtitle:P.key+' · cinematic electro-rock · Suite VIII',keySignature:P.key,tonic:P.root,percussion:true,bpm:P.bpm,bs:60/P.bpm,meter:4,bars:64,len:256,verb:.10,ev:[],harmony:[],sections:[{bar:0,name:'Ignition'},{bar:8,name:'Main hook'},{bar:16,name:'Pursuit'},{bar:24,name:'Answer'},{bar:32,name:'Orbital break'},{bar:40,name:'Re-entry'},{bar:48,name:'Full thrust'},{bar:56,name:'Final hook'}]};
  const add=(i,n,b,d,v,pan=0)=>T.ev.push({i,n,f:440*2**((n-69)/12),b,d:Math.min(d,T.len-b-.04),v,pan});
  const drum=(i,b,v,pan=0)=>add(i,69,b,.12,v,pan);
  for(let bar=0;bar<64;bar++){
   const section=bar>>3,phrase=bar%8,at=bar*4,bridge=section===4,climax=section===6,answer=[3,5,7].includes(section),dyn=bridge?.66:climax?.95:.84;
   const degree=P.progress[phrase],triad=[note(degree),note(degree+2),note(degree+4)];
   T.harmony.push({bar,chord:degree,notes:triad});
   [triad[0],triad[2],triad[1]+12].forEach((n,j)=>add('novaPad',n,at,3.6,.25*dyn,-.62+j*.60));
   if(!bridge)for(const b of [0,1.5,2.5])for(const n of [triad[0]+12,triad[2]])add('novaStrings',n,at+b,.38,.33*dyn,b===1.5?.5:-.5);
   const rhythm=bridge?[0,1.5,3]:P.style==='pursuit'?[0,.75,1.5,2,2.75,3.5]:P.style==='siege'?[0,.5,1.5,2,2.5,3.5]:[0,.75,1.5,2,2.75,3.5];
   rhythm.forEach((t,j)=>add('novaBass',triad[j===rhythm.length-1?2:0]-12,at+t,bridge?.68:.30,.85*dyn,0));
   let beat=0;
   const melody=NOVA_HOOKS[key][(phrase+(answer?2:0))%4];
   for(const[d,length]of melody){
    if(d!==null){let n=note(degree+d,1);
     // Resolve sustained/accented notes to this chord; passing tones are brief.
     if(length>=1){const choices=triad.flatMap(q=>[q,q+12,q+24]);n=choices.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);}
     add(bridge?'novaKeys':P.lead,n,at+beat,length*.84,.83*dyn,.04);
     if(climax&&length>=1)add('novaStrings',n-12,at+beat+.015,length*.80,.22,-.35);
    }beat+=length;
   }
   if(Math.abs(beat-4)>.001)throw Error('Invalid music phrase '+key+'/'+bar);
   if(!bridge&&section>=2&&phrase%2===1)for(const n of [triad[0],triad[2]])add('novaBrass',n,at+3.25,.45,.26*dyn,-.3);
   const kicks=bridge?[0,2]:key==='boss'?[0,.75,2,2.5,3.75]:key==='ceres'?[0,1.5,2.75]:[0,1,2,3];
   kicks.forEach((b,j)=>drum('novaKick',at+b,(j===0?1:.86)*dyn));
   (bridge?[2]:[1,3]).forEach(b=>drum('novaSnare',at+b,.66*dyn,.12));
   const hats=bridge?[.5,2.5]:[0,.5,1,1.5,2,2.5,3,3.5];
   hats.forEach((b,j)=>drum('novaHat',at+b,(j%2?.40:.19)*dyn,j%2?.30:-.24));
   if(phrase===7&&!bridge)[3.25,3.5,3.75].forEach((b,j)=>drum('novaTom',at+b,(.30+j*.11)*dyn,-.3+j*.3));
   if(phrase===0)drum('novaCrash',at,.29*dyn,.4);
   if((climax||section===2)&&phrase%2===0)[.5,1.5,2.5,3.5].forEach((b,j)=>add('novaKeys',triad[j%3]+12,at+b,.22,.22*dyn,j%2?.48:-.48));
  }
  T.ev.sort((a,b)=>a.b-b.b);out[key]=T;
 }
 return out;
}
Object.assign(SCORES,evoCombatScores());
Object.assign(INST,{
 novaLead:{g:.24,a:.009,r:.095,cut:4600,root:220},novaKeys:{g:.28,a:.003,r:.18,cut:5200,root:220,pluck:true},
 novaStrings:{g:.24,a:.018,r:.095,cut:3700,root:220,pluck:true},novaBrass:{g:.27,a:.018,r:.11,cut:4200,root:220},
 novaPad:{g:.21,a:.18,r:.23,cut:1700,root:220},novaBass:{g:.40,a:.004,r:.04,cut:1150,root:110,pluck:true},
 novaKick:{g:.63,root:440,percussion:true,seconds:.30},novaSnare:{g:.34,root:440,percussion:true,seconds:.26},
 novaHat:{g:.13,root:440,percussion:true,seconds:.13},novaTom:{g:.28,root:440,percussion:true,seconds:.30},novaCrash:{g:.14,root:440,percussion:true,seconds:1.2}
});
const evoOriginalOrchestraBank=orchestraBank;
orchestraBank=function(name){
 if(!name.startsWith('nova'))return evoOriginalOrchestraBank(name);
 if(ORCHESTRA.context!==actx){ORCHESTRA.context=actx;ORCHESTRA.banks.clear();}
 if(ORCHESTRA.banks.has(name))return ORCHESTRA.banks.get(name);
 const I=INST[name],sr=22050,seconds=I.seconds||2,n=Math.round(sr*seconds),buffer=actx.createBuffer(2,n,sr),random=orchestraNoise(2431+name.length*73);
 if(I.percussion){
  for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);let lo=0,mid=0;
   for(let j=0;j<n;j++){const t=j/sr,noise=random();lo=lo*.93+noise*.07;mid=mid*.55+noise*.45;let v;
    if(name==='novaKick')v=.88*Math.sin(2*Math.PI*(48*t+1.15*(1-Math.exp(-t*48))))*Math.exp(-t*14)+.17*(noise-mid)*Math.exp(-t*155);
    else if(name==='novaSnare'){const clap=Math.exp(-t*28)+(t>.014?.36*Math.exp(-(t-.014)*65):0)+(t>.028?.25*Math.exp(-(t-.028)*65):0);v=.38*Math.sin(2*Math.PI*178*t)*Math.exp(-t*32)+.57*(noise-lo)*clap;}
    else if(name==='novaTom')v=.8*Math.sin(2*Math.PI*(115*t+.40*(1-Math.exp(-t*25))))*Math.exp(-t*16)+lo*.17*Math.exp(-t*30);
    else if(name==='novaHat')v=(noise-mid)*.64*Math.exp(-t*48);
    else v=(noise-lo)*.47*Math.exp(-t*5.4);
    data[j]=v*Math.min(1,t*1500)*Math.min(1,(seconds-t)*80);
   }
  }
 }else{
  // Harmonic wavetable with modulation periods that join at its loop boundary.
  const N=2048,table=new Float32Array(N),weights=name==='novaLead'?[1,.46,.30,.18,.12,.08,.05,.028]:name==='novaKeys'?[1,.12,.36,.03,.10,.018]:name==='novaBass'?[1,.31,.13,.065,.022]:name==='novaBrass'?[1,.65,.42,.31,.22,.16,.10,.065,.04]:name==='novaStrings'?[1,.49,.32,.23,.16,.11,.07,.04]:[1,.17,.10,.046,.021];
  for(let h=1;h<=weights.length;h++)for(let j=0;j<N;j++)table[j]+=weights[h-1]*Math.sin(2*Math.PI*h*j/N+h*.21);
  const norm=.65/Math.max(...table.map(Math.abs));for(let j=0;j<N;j++)table[j]*=norm;
  const read=phase=>{const a=((phase%1)+1)%1*N,i=a|0;return table[i]*(1-a+i)+table[(i+1)%N]*(a-i);};
  const wide=['novaStrings','novaPad','novaLead','novaBrass'].includes(name);
  for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);for(let j=0;j<n;j++){
   const t=j/sr,phase=I.root*t,mod=wide?.028*Math.sin(2*Math.PI*.5*t+ch*Math.PI):0;
   data[j]=read(phase+mod)*(wide?.66:1)+(wide?.34*read(phase+.12+.038*Math.sin(2*Math.PI*1.5*t+ch*Math.PI)):0);
  }}
 }
 ORCHESTRA.banks.set(name,buffer);return buffer;
};
const evoCinemaVoice=voice;
const EVO_MUSIC_STATS={dropped:0};
voice=function(name,f,when,dur,vel,pan){
 if(!name.startsWith('nova'))return evoCinemaVoice(name,f,when,dur,vel,pan);
 if(!actx||!soundOn||!f)return;
 if(ORCHESTRA.voices.size>=ORCHESTRA.maxVoices){EVO_MUSIC_STATS.dropped++;return;}
 const I=INST[name],s=actx.createBufferSource(),g=actx.createGain(),lp=actx.createBiquadFilter(),p=actx.createStereoPanner();
 s.buffer=orchestraBank(name);s.playbackRate.value=I.percussion?1:f/I.root;s.loop=!I.percussion;
 const t=Math.max(when,actx.currentTime),attack=Math.min(I.a||.002,dur*.25),release=I.r||.02,length=I.percussion?s.buffer.duration:dur+release,peak=I.g*vel;
 lp.type='lowpass';lp.Q.value=.35;lp.frequency.setValueAtTime(I.cut||9500,t);
 if(I.pluck)lp.frequency.exponentialRampToValueAtTime(I.cut*.32,t+length);
 if(name==='novaBrass'){lp.frequency.setValueAtTime(1150,t);lp.frequency.linearRampToValueAtTime(I.cut,t+.045);lp.frequency.exponentialRampToValueAtTime(1850,t+length);}
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+attack);
 if(I.percussion)g.gain.setValueAtTime(peak,t+Math.max(attack,length-.025));
 else if(I.pluck)g.gain.exponentialRampToValueAtTime(Math.max(.001,peak*.35),t+dur);
 else{g.gain.linearRampToValueAtTime(peak*.79,t+Math.min(dur,attack+.07));g.gain.setValueAtTime(peak*.79,t+dur);}
 g.gain.linearRampToValueAtTime(0,t+length);
 p.pan.value=pan||0;s.connect(lp);lp.connect(g);g.connect(p);p.connect(BUS_MUS);
 const handle={s,g,p,lp,epoch:ORCHESTRA.epoch};ORCHESTRA.voices.add(handle);ORCHESTRA.peakVoices=Math.max(ORCHESTRA.peakVoices,ORCHESTRA.voices.size);
 s.onended=()=>{ORCHESTRA.voices.delete(handle);s.disconnect();g.disconnect();lp.disconnect();p.disconnect();};s.start(t);s.stop(t+length+.01);
};

/* v38.2: immutable combat textures, pre-baked tire motion, differential HUD.
 * Original art stays available to the enlarged gallery. No gameplay/stat changes.
 */
const EVO_PERF={textures:new WeakMap(),wheels:new WeakMap(),hudAt:-Infinity,hudScene:null,slots:'',elements:new Map(),prepared:0};
function evoCombatTexture(img){
 if(!img)return img;let cached=EVO_PERF.textures.get(img);if(cached)return cached;
 const scale=Math.min(1,192/Math.max(img.width,img.height));
 if(scale===1){EVO_PERF.textures.set(img,img);return img;}
 cached=visualCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
 const c=cached.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(img,0,0,cached.width,cached.height);
 EVO_PERF.textures.set(img,cached);EVO_PERF.textures.set(cached,cached);return cached;
}
const evoTireOriginal=drawVisualRollingTire;
function evoPrepareWheel(part,canvas,p){
 let data=EVO_PERF.wheels.get(part);if(data)return data;
 const iw=part.width,ih=part.height,[x,y,rx,ry]=p.ellipse;
 const left=Math.max(0,Math.floor((x-rx)*iw)-2),top=Math.max(0,Math.floor((y-ry)*ih)-2);
 const width=Math.min(iw-left,Math.ceil(rx*2*iw)+4),height=Math.min(ih-top,Math.ceil(ry*2*ih)+4),count=16,band=Math.max(7,Math.round(ry*ih*.56));
 const atlas=visualCanvas(width*count,height),c=atlas.getContext('2d'),frame=visualCanvas(iw,ih),fc=frame.getContext('2d');
 for(let i=0;i<count;i++){fc.setTransform(1,0,0,1,0,0);fc.clearRect(0,0,iw,ih);fc.translate(iw/2,ih/2);evoTireOriginal(part,canvas,p,iw,ih,{speed:1,travel:i*band/count},fc);c.drawImage(frame,left,top,width,height,i*width,0,width,height);}
 data={atlas,left,top,width,height,count,band};EVO_PERF.wheels.set(part,data);return data;
}
drawVisualRollingTire=function(part,canvas,p,w,h,v,c=FACING_MAIN_CTX){
 if(v.speed<.012||!canvas)return;
 // Large gallery renders keep the original continuous, full-resolution roller.
 if(w>112){evoTireOriginal(part,canvas,p,w,h,v,c);return;}
 const q=evoPrepareWheel(part,canvas,p),phase=((v.travel*part.height/h)%q.band+q.band)%q.band,i=Math.floor(phase/q.band*q.count);
 c.drawImage(q.atlas,i*q.width,0,q.width,q.height,(q.left/part.width-.5)*w,(q.top/part.height-.5)*h,q.width/part.width*w,q.height/part.height*h);
};
const evoPerfSpriteBase=drawVisualSprite;
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){evoPerfSpriteBase(u,w<=112?evoCombatTexture(img):img,w,h,c);};
visualWarmArt=async function(){
 const warm=visualCanvas(2,2).getContext('2d');let batch=0;
 for(const key of new Set([...UNIT_KEYS,...Object.keys(V_RIG)])){
  for(const original of [IMG[key],TINT.ally[key],TINT.neutral[key],TINT.frost[key]]){
   if(!original)continue;const img=evoCombatTexture(original),rig=V_RIG[key];warm.drawImage(img,0,0,2,2);
   if(rig?.parts.length){const layers=visualParts(img,rig);warm.drawImage(layers.base,0,0,2,2);for(const part of layers.parts){warm.drawImage(part.img,0,0,2,2);if(part.contact){const wheel=evoPrepareWheel(part.img,part.contact,part.p);warm.drawImage(wheel.atlas,0,0,2,2);}}}
  }
  if(TINT.ally[key]||IMG[key]){const im=TINT.ally[key]||IMG[key],s=64/Math.max(im.width,im.height),thumb=visualCanvas(Math.max(1,Math.round(im.width*s)),Math.max(1,Math.round(im.height*s))),c=thumb.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(im,0,0,thumb.width,thumb.height);relAllyIcons[key]=thumb.toDataURL('image/png');}
  EVO_PERF.prepared++;
  if(typeof evoLoadProgress==='function')evoLoadProgress(86+EVO_PERF.prepared/new Set([...UNIT_KEYS,...Object.keys(V_RIG)]).size*10,basicText('유닛 모션을 준비합니다','Preparing unit animation'));
  if(++batch%3===0)await new Promise(r=>setTimeout(r,0));
 }
 // First missile palette conversion also belongs to loading, never first fire.
 if(typeof illMissile==='function')for(const id of ['enemy','ally','player'])for(let i=0;i<2;i++)illMissile({id},i);
 cgTurretArt();for(const pose of CG_TURRET.heads[0]||[])warm.drawImage(pose,0,0,2,2);
 cgSmokeArt32();for(const img of Object.values(IMG))if(img?.width)warm.drawImage(img,0,0,2,2);
};
function evoHUDElement(id){let el=EVO_PERF.elements.get(id);if(!el){el=$(id);if(el)EVO_PERF.elements.set(id,el);}return el;}
const evoHUDCopy=new WeakMap();
function evoHUDText(id,value){
 const el=evoHUDElement(id);if(!el)return;value=String(value);
 // Compare application state, not text rewritten by a browser/translation layer.
 // Unchanged labels retain their nodes instead of being replaced every HUD tick.
 if(evoHUDCopy.get(el)===value)return;evoHUDCopy.set(el,value);
 if(el.textContent!==value)el.textContent=value;
}
function evoHUDValue(id,key,value){const el=evoHUDElement(id);if(el&&el[key]!==value)el[key]=value;}
relSyncHUD=function(){
 if(!REL.ready)return;const active=!!S&&['play','pause'].includes(mode);evoHUDValue('relHUD','hidden',!active);if(!active)return;
 const now=performance.now(),clearing=EVO_DEBRIEF.phase==='clear',scene=mode+'|'+LANG+'|'+S.stage+'|'+S.relGuide+'|'+EVO.waiting+'|'+S.allies.length+'|'+clearing;
 if(scene===EVO_PERF.hudScene&&now-EVO_PERF.hudAt<80)return;EVO_PERF.hudScene=scene;EVO_PERF.hudAt=now;
 const remaining=S.turrets.filter(t=>t.alive).length,hpMax=maxHp(),allies=S.allies.filter(a=>!a.isLegend),legends=S.allies.filter(a=>a.isLegend),ordered=[...allies,...legends];
 evoHUDText('relChapter',S.story?pgText('작전 ','OP ')+S.story.id:pgText('스테이지 ','SECTOR ')+String(S.stage).padStart(2,'0'));
 evoHUDText('relObjective',pgHUDObjective());
 evoHUDValue('relProgress','value',S.phase==='heroBoss'||S.phase==='heroLoot'?Math.max(0,S.hero?.boss?.hp||0)/(S.hero?.boss?.hpMax||1):clearing?1:S.phase==='boss'?(4-remaining)/4:S.killed/S.killNeed);
 evoHUDText('relHullLabel',basicText('체력','HULL'));evoHUDText('relHull',Math.ceil(S.hp)+' / '+hpMax);evoHUDValue('relHealth','max',hpMax);evoHUDValue('relHealth','value',S.hp);evoHUDElement('relHealth').classList.toggle('low',S.hp<hpMax*.3);
 evoHUDText('relSquadLabel',basicText('편대 ','SQUAD ')+allies.length+'/'+allyCap()+'  ·  ★\u00a0'+legends.length+'/'+evoLegendCap()+(S.evoReserve?.length?basicText(' · 대기 ',' · RESERVE ')+S.evoReserve.length:''));
 const stamp=LANG+'|'+ordered.map(a=>a.type+':'+a.img+':'+!!a.isLegend).join(',');
 const slots=evoHUDElement('relSlots');if(stamp!==EVO_PERF.slots){EVO_PERF.slots=stamp;slots.replaceChildren();
  for(const a of ordered){const slot=basicNode('div',null,'rel-slot'+(a.isLegend?' evo-legend':'')),im=basicNode('img'),bar=basicNode('i');im.src=relAllyIcons[a.img]||ART[a.type];im.alt=nm(a.type);slot.title=nm(a.type);slot.append(im,bar);slots.append(slot);}
  if(!ordered.length)slots.append(basicNode('small',basicText('포획해 내 편으로','Recruit your first ally')));
 }
 ordered.forEach((a,i)=>{const bar=slots.children[i]?.lastElementChild,value=Math.max(0,Math.ceil(a.hp/a.hpMax*100))+'%';if(bar&&bar.style.getPropertyValue('--hp')!==value)bar.style.setProperty('--hp',value);});
 evoHUDText('relBuffs',[(evoWays()>1?basicText('탄환 ','SHOTS ')+evoWays():''),S.evoSquad?basicText('편대 +','SQUAD +')+(S.evoSquad*20)+'%':'',evoAILevel()?'AI '+evoAILevel()+'/5':'',S.shield?basicText('보호막','SHIELD'):'',S.itemDmg?'ATK +'+S.itemDmg:'',S.itemRate?'RATE +'+S.itemRate:'',S.element?ITEMS[S.element].name:''].filter(Boolean).join(' · '));
 evoHUDValue('relTip','hidden',!S.relGuide&&!EVO.waiting);evoHUDValue('relSkip','hidden',S.relGuide!==1);evoHUDText('relSkip',basicText('건너뛰기','Skip'));
 if(EVO.waiting){evoHUDText('relTipTitle',basicText('바로 움직여 시작하세요','Move to begin'));evoHUDText('relTipText',basicText('적을 향해 누르면 포획 · 놓으면 자동 사격','Hold toward an enemy to recruit · Release to auto-fire'));}
 else if(S.relGuide){evoHUDText('relTipTitle',S.relGuide===1?basicText('적 한 기가 곧 내 아군이 됩니다','One enemy. Your first ally.'):basicText('포획을 놓으면 함께 자동 사격!','Release capture. Fight together!'));evoHUDText('relTipText',S.relGuide===1?(isTouch?basicText('오른손으로 적을 향해 드래그 · 왼손으로 이동','Drag right control toward the enemy · Left to move'):basicText('적을 조준하고 마우스 꾹 · 방향키 또는 WASD로 이동','Aim and hold mouse · Move with arrows or '+basicLabels().join(''))):basicText('파란 편대는 아군입니다. 주황색 탄을 피하며 기지를 공략하세요.','Blue units are your squad. Dodge orange fire and take the base.'));}
 const toastHidden=!REL.notice||S.relTime>REL.notice.until;evoHUDValue('relToast','hidden',toastHidden);if(!toastHidden)evoHUDText('relToast',REL.notice.text);
 evoHUDText('relControls',isTouch?'':basicText('이동 ','MOVE ')+basicLabels().join('')+' / ↑←↓→  ·  '+basicText('누르고 포획 · P 일시정지','HOLD MOUSE TO RECRUIT · P PAUSE'));
};

/* v38.4: fixed-size, load-time ammunition caches and a stage-clear barrier.
 * Collision positions, damage and projectile velocities stay authoritative. */
const EVO_ORD={sprites:[],rounds:[],needles:[],muzzles:new Map(),ready:false,trailSpacing:18};
const EVO_TREADS=new WeakMap();
function evoPrepareTread(img,part,p){
 let data=EVO_TREADS.get(part);if(data)return data;
 const iw=img.width,ih=img.height,xs=p.poly.map(q=>q[0]),ys=p.poly.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),band=Math.max(2,Math.round(ih*.04)),sy=Math.round(ih*(y0+(y1-y0)*.42));
 const left=Math.floor(x0*iw)-1,top=Math.floor(y0*ih)-1,width=Math.ceil((x1-x0)*iw)+3,height=Math.ceil((y1-y0)*ih)+3,count=16,atlas=visualCanvas(width*count,height),q=atlas.getContext('2d');q.imageSmoothingQuality='high';
 for(let i=0;i<count;i++){q.save();q.translate(i*width-left,-top);visualPath(q,p,iw,ih);q.clip();const off=i/count*band;for(let y=y0*ih-band+off;y<y1*ih+band;y+=band)q.drawImage(img,x0*iw,sy,(x1-x0)*iw,band,x0*iw,y,(x1-x0)*iw,band+.15);q.restore();}
 data={atlas,left,top,width,height,count,band,iw,ih};EVO_TREADS.set(part,data);return data;
}
function evoRollingTread(img,part,p,w,h,v,u,c){
 if(w>112||Math.max(v.speed,v.pivotSpeed)<.012)return false;
 const q=evoPrepareTread(img,part,p),pitch=q.band*h/q.ih,off=((facingContact(u,p)%pitch)+pitch)%pitch,i=Math.floor(off/pitch*q.count);
 c.drawImage(q.atlas,i*q.width,0,q.width,q.height,(q.left/q.iw-.5)*w,(q.top/q.ih-.5)*h,q.width/q.iw*w,q.height/q.ih*h);return true;
}
Object.assign(TEAM_SHOT.player,{color:'#FFCA59',core:'#FFF9DE',dark:'#60431B'});
Object.assign(TEAM_SHOT.ally,{color:'#40CBFF',core:'#E6FAFF',dark:'#123F7C',body:'#389FE9'});
Object.assign(TEAM_ENERGY.ally,{color:'#40CBFF',core:'#E6FAFF',dark:'#123F7C'});
Object.assign(TEAM_ENERGY.enemy,{color:'#FF654F',core:'#FFF1E9',dark:'#481922'});
const evoOldMuzzle=cgMuzzle32;
function evoOrdnanceArt(){
 if(EVO_ORD.ready||!IMG.cg_ordnance38)return;EVO_ORD.ready=true;
 // Copy the supplied artwork exactly. Remove only the edge-connected light
 // background at load time; enclosed silver/white highlights remain intact.
 const bounds=[[32,47,350,104],[32,203,350,160],[32,422,350,112],[32,595,350,157]];
 for(let col=0;col<3;col++){
  const pal=[TEAM_SHOT.player,TEAM_SHOT.ally,TEAM_SHOT.enemy][col];EVO_ORD.sprites[col]=[];
  for(let row=0;row<4;row++){
   const [x,y,w,h]=bounds[row],raw=visualCanvas(w,h),q=raw.getContext('2d',{willReadFrequently:true});
   q.drawImage(IMG.cg_ordnance38,x+col*410,y,w,h,0,0,w,h);
   const data=q.getImageData(0,0,w,h),d=data.data,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
   function push(p){if(seen[p])return;const i=p*4,lo=Math.min(d[i],d[i+1],d[i+2]),hi=Math.max(d[i],d[i+1],d[i+2]);if(lo<215||hi-lo>24)return;seen[p]=1;queue[tail++]=p;}
   for(let xx=0;xx<w;xx++){push(xx);push((h-1)*w+xx);}for(let yy=0;yy<h;yy++){push(yy*w);push(yy*w+w-1);}
   while(head<tail){const p=queue[head++],xx=p%w,yy=(p/w)|0;d[p*4+3]=0;if(xx)push(p-1);if(xx<w-1)push(p+1);if(yy)push(p-w);if(yy<h-1)push(p+w);}
   // Feather the exterior matte without touching interior specular highlights.
   for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){const p=yy*w+xx,i=p*4;if(seen[p]||!(seen[p-1]||seen[p+1]||seen[p-w]||seen[p+w]))continue;const lo=Math.min(d[i],d[i+1],d[i+2]);if(lo>150){const alpha=Math.max(.18,Math.min(1,(246-lo)/85));d[i+3]=Math.round(255*alpha);for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,(d[i+k]-246*(1-alpha))/alpha));}}
   q.putImageData(data,0,0);const art=visualCanvas(256,Math.round(256*h/w)),c=art.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(raw,0,0,art.width,art.height);EVO_ORD.sprites[col][row]=art;
  }
  // Compact luminous cores and tapered wakes, baked once (no per-shot gradient).
  for(const needle of [false,true]){const art=visualCanvas(128,48),c=art.getContext('2d');c.translate(91,24);const g=c.createLinearGradient(-85,0,8,0);g.addColorStop(0,pal.color+'00');g.addColorStop(.66,pal.color+'44');g.addColorStop(1,pal.color+'EE');c.fillStyle=g;c.beginPath();c.moveTo(-85,0);c.quadraticCurveTo(-35,-3,-5,needle?-11:-8);c.quadraticCurveTo(17,0,-5,needle?11:8);c.quadraticCurveTo(-35,3,-85,0);c.fill();
   const core=c.createRadialGradient(0,-2,1,0,0,needle?11:10);core.addColorStop(0,pal.core);core.addColorStop(.4,pal.core);core.addColorStop(.72,pal.color);core.addColorStop(1,pal.dark);c.fillStyle=core;c.beginPath();c.ellipse(0,0,needle?12:9,needle?5:8,0,0,6.283);c.fill();
   if(needle){const hot=c.createLinearGradient(-48,0,10,0);hot.addColorStop(0,pal.color+'00');hot.addColorStop(.45,pal.color);hot.addColorStop(.8,pal.core);hot.addColorStop(1,'#FFFFFF');c.fillStyle=hot;c.beginPath();c.moveTo(-53,0);c.bezierCurveTo(-24,-4,-10,-11,7,-3);c.quadraticCurveTo(15,0,7,3);c.bezierCurveTo(-10,11,-24,4,-53,0);c.fill();}
   (needle?EVO_ORD.needles:EVO_ORD.rounds)[col]=art;}
  for(const energy of [false,true]){const p=energy?(col===2?TEAM_ENERGY.enemy:TEAM_ENERGY.ally):pal,frames=[];for(let i=0;i<6;i++){const a=visualCanvas(96,64),c=a.getContext('2d');c.translate(24,32);evoOldMuzzle(c,p,14,i*20,120,0);frames.push(a);}EVO_ORD.muzzles.set(p.id+':'+p.color,frames);}
 }
}
function evoOrdnanceTeam(p){return p.id==='enemy'?2:p.id==='player'?0:1;}
function evoStampShot(c,col,row,w,h){const art=EVO_ORD.sprites[col]?.[row];if(!art)return;c.drawImage(art,-w*.70,-h/2,w,h);}
cgArcadeRound33=function(c,p,r=3.1){evoStampShot(c,evoOrdnanceTeam(p),0,r*8,r*2.5);};
cgArcadeNeedle33=function(c,p,length=24,width=3.2){evoStampShot(c,evoOrdnanceTeam(p),0,length+12,(length+12)*.297);};
cgArcadeHeavy33=function(c,p,age=0,scale=1){evoStampShot(c,evoOrdnanceTeam(p),3,27*scale,12*scale);};
cgSpriteMissile32=function(c,p,age,scale=1,lit=true){evoStampShot(c,evoOrdnanceTeam(p),2,32*scale,10*scale);return true;};
cgSpritePlasma31=function(c,p,r,age=0){evoStampShot(c,evoOrdnanceTeam(p),1,r*6,r*3);return true;};
cgMuzzle32=function(c,p,r,age,life){const frames=EVO_ORD.muzzles.get(p.id+':'+p.color);if(!frames)return;const a=frames[Math.min(5,Math.floor(age/life*6))],k=r/14;c.drawImage(a,-24*k,-32*k,96*k,64*k);};
drawVisualBullet=function(b,cx,cy,enemy){
 if(S.relClearIn>0||S.rewardSettled)return;const pos=visualBulletPosition(b),x=pos.x-cx,y=pos.y-cy;if(x<-50||x>W+50||y<-50||y>H+50)return;
 const kind=b._visualKind||b.kind||'rifle',col=enemy?2:b.from==='player'?0:1,p=[TEAM_SHOT.player,TEAM_SHOT.ally,TEAM_SHOT.enemy][col],s=b.big?1.25:b.small?.85:1;
 ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));
 if(kind==='missile')evoStampShot(ctx,col,2,38*s,12*s);
 else if(kind==='shell')evoStampShot(ctx,col,3,32*s,14*s);
 else if(kind==='laser'||kind==='plasma')evoStampShot(ctx,col,1,32*s,15*s);
 else if(col===0||kind==='hero')cgArcadeNeedle33(ctx,p,24*s,3.5*s);
 else cgArcadeRound33(ctx,p,3.9*s);
 const element=b.el&&ELEM_INFO[b.el]?.c;if(element){ctx.strokeStyle=element;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,4.6,.4,2.4);ctx.stroke();}ctx.restore();
};
const evoCombatWarm=visualWarmArt;
visualWarmArt=async function(){await evoCombatWarm();evoOrdnanceArt();cgPrepareEffects33();
 for(const key of new Set([...UNIT_KEYS,...Object.keys(V_RIG)])){const rig=V_RIG[key];if(!rig?.parts.some(p=>p.mode==='tread'))continue;for(const original of [IMG[key],TINT.ally[key],TINT.neutral[key],TINT.frost[key]]){if(!original)continue;const img=evoCombatTexture(original),layers=visualParts(img,rig);for(const part of layers.parts)if(part.p.mode==='tread')evoPrepareTread(img,part.img,part.p);}await new Promise(r=>setTimeout(r,0));}
 // Keep 2x coverage for 78px turrets, avoiding repeated 384px resampling.
 const poses=CG_TURRET.heads[0]?.map(evoCombatTexture);if(poses)CG_TURRET.heads=[poses,poses,poses,poses];
 for(const key of ['ill_turretBase','ill_blast0','ill_blast1'])if(IMG[key])IMG[key]=evoCombatTexture(IMG[key]);
 for(const type of ['smoke','dust','fire'])visualPuffArt(type);
 for(const theme of THEMES){visualGroundTexture(theme);await new Promise(r=>setTimeout(r,0));}
};
function evoClearAttacks(){
 for(const key of ['bullets','ebullets','lasers','hazards','fx','relQueue'])if(Array.isArray(S[key]))S[key].length=0;
 S.beam=false;S.basicCaptureTarget=null;S.spawnCd=999999;S.fireCd=0;S.shake=0;
 VISUAL.fx.length=0;VISUAL.bullets=new WeakMap();VISUAL.origins=new WeakMap();
 for(const u of [S,...S.allies,...S.enemies]){const v=visualState(u);v.shots={};v.muzzles=[];v.hit=0;u.atkT=0;u.cap=0;}
 for(const t of S.turrets){t.flash=0;t.relCharge=0;const v=cgTurretPose(t);v.flash=0;v.recoil=0;}
 // Basic disables full-story hero/Velca encounters, but clear their queues too.
 if(S.hero)for(const k of ['shots','beams','hazards'])if(Array.isArray(S.hero[k]))S.hero[k].length=0;
 if(S.velca)for(const k of ['shots','beams','hazards'])if(Array.isArray(S.velca[k]))S.velca[k].length=0;
 clearBattleInput();
}
const evoCombatOpenUpgrade=openUpgrade;
openUpgrade=function(){if(S.relClearIn>0||S.rewardSettled)return;evoClearAttacks();evoCombatOpenUpgrade();};
const evoCombatUpdate=update;
update=function(dt){if(mode!=='play')return;
 if(S.relClearIn>0){S.relTime+=dt;S.relClearIn=Math.max(0,S.relClearIn-dt);S.beam=false;clearBattleInput();if(S.relClearIn===0){evoClearAttacks();relOpenUpgradeNow();}return;}
 evoCombatUpdate(dt);
};
const evoCombatVisualUpdate=visualUpdate;
visualUpdate=function(dt){if(S&&(S.relClearIn>0||S.rewardSettled)){if(mode==='play')VISUAL.time+=dt;return;}evoCombatVisualUpdate(dt);};

/* Capture paint is baked for every hull AND animation frame during loading.
 * No pixel reads or palette conversion happen in a battle/capture frame. */
const EVO_PALETTE={keys:[],frost:{}};
// Gold paint, aura and icons mean an actual Legend deployment slot.
// Crimson Lance / Orbital Falcon are regular elites despite their old IDs.
const EVO_GOLD_ART_KEYS=[...EVO_LEGENDS];
function evoLegendArtKey(key){return EVO_GOLD_ART_KEYS.some(k=>key===k||key.startsWith(k+'_pose'));}
function evoLegendArmor(img){
 const c=visualCanvas(img.width,img.height),q=c.getContext('2d',{willReadFrequently:true});q.drawImage(img,0,0);
 const image=q.getImageData(0,0,c.width,c.height),a=image.data;
 const rim=Math.max(2,Math.round(Math.min(c.width,c.height)*.014)),distance=new Uint16Array(c.width*c.height);distance.fill(rim+1);
 for(let i=0;i<a.length;i+=4){if(!a[i+3])continue;const [h,s,l]=rgb2hsl(a[i],a[i+1],a[i+2]);let color;
  // Deeper antique-yellow metal with brighter champagne core lights. Keep
  // black joints, shadow depth and silver highlights; never flood the hull.
  if(s>.24&&(h<38||h>330)&&l>.075&&l<.94)color=hsl2rgb(47,Math.min(.72,s*.90),Math.min(.74,l*.80+.018));
  else if(s>.20&&h>160&&h<285&&l>.12)color=hsl2rgb(48,.52,Math.min(.81,l*.86+.025));
  else if(h>=38&&h<=110&&s>.10&&l>.12)color=hsl2rgb(42,.085,Math.min(.90,l*1.17+.025));
  else if(s<.24&&l>.16&&l<.58)color=hsl2rgb(225,.065,l*.85);
  if(color){a[i]=color[0];a[i+1]=color[1];a[i+2]=color[2];if(color[0]>color[2]*1.25&&color[1]>color[2]*1.15)distance[i/4]=0;}
 }
 // Extend the existing painted panel shapes into their adjacent metal trim.
 // Load-time distance passes keep every frame's trim attached to its artwork.
 // Dark joints, tires, white specular highlights and alpha are preserved.
 const width=c.width,height=c.height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;distance[i]=Math.min(distance[i],x?distance[i-1]+1:rim+1,y?distance[i-width]+1:rim+1);}
 for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){const i=y*width+x;distance[i]=Math.min(distance[i],x+1<width?distance[i+1]+1:rim+1,y+1<height?distance[i+width]+1:rim+1);}
 for(let p=0;p<distance.length;p++){const d=distance[p],i=p*4;if(!d||d>rim||!a[i+3])continue;const[h,s,l]=rgb2hsl(a[i],a[i+1],a[i+2]);if(s>.28||l<.20||l>.76)continue;
  const amount=1-d/(rim+1),color=hsl2rgb(47,.34+amount*.21,l*(.91+amount*.04));a[i]=color[0];a[i+1]=color[1];a[i+2]=color[2];
 }
 q.putImageData(image,0,0);return c;
}
function evoBlueArmor(img){
 const c=visualCanvas(img.width,img.height),q=c.getContext('2d',{willReadFrequently:true});q.drawImage(img,0,0);
 const data=q.getImageData(0,0,c.width,c.height),a=data.data;
 for(let i=0;i<a.length;i+=4){if(!a[i+3]||a[i]<a[i+1]||a[i]<a[i+2])continue;
  const [h,s,l]=rgb2hsl(a[i],a[i+1],a[i+2]);
  // Team paint belongs on the existing red/orange panels and signal lights.
  // Preserve neutral steel, olive armor, rubber, silver barrels and highlights.
  if(s<.24||!(h<=38||h>=335)||l<.075||l>.94)continue;
  const rgb=hsl2rgb(211,Math.min(.84,s*.94),l);
  a[i]=rgb[0];a[i+1]=rgb[1];a[i+2]=rgb[2];
 }
 q.putImageData(data,0,0);return c;
}
buildTints=function(){
 const keys=new Set([...UNIT_KEYS,...Object.keys(V_RIG),...BASIC_CONTENT.units.map(u=>u.key),...EVO_LEGENDS,...VELCA_KEYS]);
 for(const anim of Object.values(ANIM))for(const value of Object.values(anim))if(Array.isArray(value))for(const key of value)if(typeof key==='string')keys.add(key);
 for(const k of keys){if(!IMG[k])continue;
  if(!UNIT_KEYS.includes(k))UNIT_KEYS.push(k);
  TINT.ally[k]=evoLegendArtKey(k)?evoLegendArmor(IMG[k]):evoBlueArmor(IMG[k]);TINT.neutral[k]=tint(IMG[k],47);TINT.frost[k]=frostify(IMG[k]);
  // An icy ally retains its blue or yellow-gold allegiance paint.
  EVO_PALETTE.frost[k]=TINT.ally[k];EVO_PALETTE.keys.push(k);
 }
};

/* Layered weapon samples are generated once from a local seeded PRNG. A voice
 * budget, per-mount cooldown and spatial attenuation keep volleys intelligible. */
const EVO_SOUND={context:null,banks:new Map(),voices:new Set(),last:new WeakMap(),kindAt:{},serial:0,peak:0,max:24,suppress:0,played:{}};
function evoWeaponBank(kind,variant=0){
 if(EVO_SOUND.context!==actx){EVO_SOUND.context=actx;EVO_SOUND.banks.clear();}
 const key=kind+':'+variant;if(EVO_SOUND.banks.has(key))return EVO_SOUND.banks.get(key);
 const sr=22050,duration={rifle:.19,missile:.48,shell:.40,laser:.29,impact:.24}[kind]||.19,n=Math.round(sr*duration),buffer=actx.createBuffer(1,n,sr),data=buffer.getChannelData(0),rng=orchestraNoise(7043+variant*8191+kind.length*97);
 let low=0,mid=0,phase=0,peak=0;
 for(let j=0;j<n;j++){
  const t=j/sr,r=rng();low=low*.93+r*.07;mid=mid*.60+r*.40;const high=r-mid;
  const snap=high*Math.exp(-t*150),mechanical=(Math.sin(2*Math.PI*1380*t)+Math.sin(2*Math.PI*2230*t)*.35)*Math.exp(-Math.max(0,t-.026)*100)*(t>.026?1:0);
  let v;
  if(kind==='missile'){const ignition=(mid*.8+Math.sin(2*Math.PI*170*t)*.35)*Math.exp(-t*38),burn=(mid-low)*1.3*(1-Math.exp(-t*65))*Math.exp(-t*7);v=.43*snap+ignition+burn+.07*mechanical;}
  else if(kind==='shell'){phase+=2*Math.PI*(78+70*Math.exp(-t*30))/sr;v=.65*snap+Math.sin(phase)*.58*Math.exp(-t*17)+mid*.7*Math.exp(-t*28)+mechanical*.17;}
  else if(kind==='laser'){phase+=2*Math.PI*(360+1000*Math.exp(-t*22))/sr;v=Math.sin(phase)*.38*Math.exp(-t*17)+(mid-low)*.72*Math.exp(-t*15)+.2*snap;}
  else if(kind==='impact')v=.58*snap+mid*.9*Math.exp(-t*25)+mechanical*.28+Math.sin(2*Math.PI*210*t)*.25*Math.exp(-t*33);
  else v=.70*snap+(mid-low)*1.05*Math.exp(-t*55)+Math.sin(2*Math.PI*(210+variant*9)*t)*.34*Math.exp(-t*45)+mechanical*.12;
  data[j]=v*Math.min(1,t*1500)*Math.min(1,(duration-t)*180);peak=Math.max(peak,Math.abs(data[j]));
 }
 for(let j=0;j<n;j++)data[j]*=.80/Math.max(.8,peak);
 EVO_SOUND.banks.set(key,buffer);return buffer;
}
function evoPlayWeapon(kind,u=null,gain=1){
 if(!actx||!soundOn||CG.muted||document.hidden||mode==='pause'||mode==='upgrade')return false;
 audioInit();kind=['rifle','missile','shell','laser','impact'].includes(kind)?kind:'rifle';
 const now=actx.currentTime;if(EVO_SOUND.voices.size>=EVO_SOUND.max||now-(EVO_SOUND.kindAt[kind]??-10)<.024)return false;
 if(u){const prev=EVO_SOUND.last.get(u);if(prev&&now-prev.at<(kind==='rifle'?.055:.11))return false;EVO_SOUND.last.set(u,{at:now});}
 const [x,y]=u?(u===S?[S.px,S.py]:[u.x,u.y]):[S?.px||0,S?.py||0],distance=S?Math.hypot(x-S.px,y-S.py):0;
 if(distance>950)return false;
 EVO_SOUND.kindAt[kind]=now;
 const source=actx.createBufferSource(),g=actx.createGain(),pan=actx.createStereoPanner(),v=EVO_SOUND.serial++%4;
 source.buffer=evoWeaponBank(kind,v);source.playbackRate.value=[.98,1,1.018,.993][v];
 const amplitude={rifle:.20,missile:.24,shell:.29,laser:.16,impact:.16}[kind];
 g.gain.value=amplitude*gain*(u===S?1:.72)/Math.max(1,1+distance/340);pan.pan.value=S?evoClamp((x-S.px)/480,-.75,.75):0;
 source.connect(g);g.connect(pan);pan.connect(BUS_SFX);const handle={source,g,pan};EVO_SOUND.voices.add(handle);EVO_SOUND.peak=Math.max(EVO_SOUND.peak,EVO_SOUND.voices.size);EVO_SOUND.played[kind]=(EVO_SOUND.played[kind]||0)+1;
 source.onended=()=>{EVO_SOUND.voices.delete(handle);source.disconnect();g.disconnect();pan.disconnect();};source.start();return true;
}
const evoSoundInitBase=audioInit;
audioInit=function(){evoSoundInitBase();for(const kind of ['rifle','missile','shell','laser','impact'])for(let i=0;i<4;i++)evoWeaponBank(kind,i);};
const evoSoundFireBase=visualFire;
visualFire=function(u,style,ang,count){evoSoundFireBase(u,style,ang,count);evoPlayWeapon(visualStyle(u,style),u);};
const evoSoundTurretBase=cgTurretFire;
cgTurretFire=function(t,b,a){evoSoundTurretBase(t,b,a);evoPlayWeapon('shell',t,.95);};
const evoSoundBlipBase=blip;
blip=function(...args){if(!EVO_SOUND.suppress)evoSoundBlipBase(...args);};
// Reuse cached impact layers for the old noise call sites. These no longer
// allocate a fresh random buffer for every impact or consume gameplay RNG.
noise=function(d,v){if(!EVO_SOUND.suppress)evoPlayWeapon(d>.15?'shell':'impact',null,Math.min(.8,v*9));};
const evoSoundFireWeaponBase=fireWeapon;
fireWeapon=function(...args){EVO_SOUND.suppress++;try{return evoSoundFireWeaponBase(...args);}finally{EVO_SOUND.suppress--;}};
const evoSoundVolleyBase=eVolley;
eVolley=function(...args){EVO_SOUND.suppress++;try{return evoSoundVolleyBase(...args);}finally{EVO_SOUND.suppress--;}};

/* The enemy and recruited versions run the SAME unit skill state machine.
 * Allegiance is carried explicitly into projectiles, beams and ground hazards. */
function evoAllyShotDamage(u){return Math.max(1,Math.round((1+relicVal('r_link')+(u.dmgBonus||0))*(u.rankMul||1)/Math.max(1,(u.ways||1)*.62)))*(u.basicAllyBonus?BASIC_BALANCE.allyDamage:1)*(1+Math.min(3,S.allyPwr||0)*.25)*(1+(S.evoSquad||0)*.2);}
function evoSkillScale(u){return u.side==='ally'?evoAllyShotDamage(u)/Math.max(1,u.bdmg||8):enemyDmgScale();}
function evoSkillTargets(){return [...S.enemies.filter(e=>e.side==='enemy'&&!e.gone&&e.hp>0),...S.turrets.filter(t=>t.alive)];}
function evoSkillHit(target,dmg){if(S.turrets.includes(target))hitTurret(target,dmg);else if(target.side==='enemy'&&!target.gone)damageUnit(target,dmg,null);}
function evoSkillArea(x,y,r,dmg){for(const target of evoSkillTargets())if(Math.hypot(target.x-x,target.y-y)<r+(target.r||22))evoSkillHit(target,dmg);}
function evoSkillBeamHit(u,ang,length,width,dmg){const bx=Math.cos(ang),by=Math.sin(ang);
 if(u.side==='ally'){for(const t of evoSkillTargets()){const dx=t.x-u.x,dy=t.y-u.y,p=dx*bx+dy*by;if(p>0&&p<length&&Math.abs(dx*by-dy*bx)<width+(t.r||22)*.5)evoSkillHit(t,dmg);}return;}
 const rx=S.px-u.x,ry=S.py-u.y,proj=rx*bx+ry*by;if(proj>0&&proj<length&&Math.abs(rx*by-ry*bx)<width&&S.invuln<=0)damagePlayer(dmg);
 for(const a of S.allies){if(a.gone)continue;const dx=a.x-u.x,dy=a.y-u.y,p=dx*bx+dy*by;if(p>0&&p<length&&Math.abs(dx*by-dy*bx)<width)a.hp-=3;}
}
function evoSkillHazard(u,h){return addHazard({...h,side:u.side==='ally'?'ally':'enemy',c:u.side==='ally'?'#55D7FF':h.c,owner:u.type});}
function evoSkillShock(u,x,y,r,dmg){if(u.side!=='ally')return hazShock(x,y,r,dmg);return evoSkillHazard(u,{k:'shock',x,y,r:8,max:r,life:420,dmg,hit:false});}
function evoUpdateFriendlyHazard(h,dt){const p=1-h.t/h.life;
 if(h.k==='shock'){h.r=h.max*Math.min(1,p*1.6);if(!h.hit&&p>.18){h.hit=true;evoSkillArea(h.x,h.y,h.max,h.dmg);}}
 else if(h.k==='bomb'&&h.t<=0){visualExplosion(h.x,h.y,h.max*.7);addHazard({k:'shock',x:h.x,y:h.y,r:8,max:h.max,life:420,dmg:h.dmg,hit:false,side:'ally',c:'#55D7FF',owner:h.owner});}
 else if(h.k==='plasma'){h.tick=(h.tick||0)+dt;const tick=h.tick>=420;if(tick)h.tick%=420;for(const t of evoSkillTargets())if(Math.hypot(t.x-h.x,t.y-h.y)<h.r+(t.r||22)){if(t.side==='enemy'){t.slow=Math.max(t.slow||0,140);t.slowMul=.65;}if(tick)evoSkillHit(t,h.dmg);}}
 else if(h.k==='smoke')for(const t of S.enemies)if(t.side==='enemy'&&Math.hypot(t.x-h.x,t.y-h.y)<h.r)t.evoSmokeUntil=S.relTime+180;
}
const evoSkillMake=makeUnit;
makeUnit=function(type,x,y,side){const u=evoSkillMake(type,x,y,side);if(side==='ally'){
 u.ai=u.ai||'evolution';u.evoRole=type==='infantry'?'flank':u.flying?'strafe':['walk','authored'].includes(visualRig(u).kind)?'burst':'salvo';u.evoSpecial=3000+evoRand(x+y)*1800;
 }return u;};
const evoSkillVolley=eVolley;
eVolley=function(u,ang,n,spread,opts={}){if(u.side!=='ally')return evoSkillVolley(u,ang+(u.evoSmokeUntil>S.relTime?Math.sin(u.t*.027)*.27:0),n,spread,opts);
 const kind=['salvo','rockets','flak'].includes(u.ai)?'missile':visualRig(u).shot;visualFire(u,kind,ang,n);
 const dmg=evoAllyShotDamage(u)*(opts.dmg||u.bdmg||8)/Math.max(1,u.bdmg||8);
 for(let i=0;i<n;i++){const a=ang+(i-(n-1)/2)*spread+(opts.jitter?(Math.random()-.5)*opts.jitter:0),sp=opts.bspd||u.bspd;
 const b={x:u.x+Math.cos(ang)*(u.r+4),y:u.y+Math.sin(ang)*(u.r+4),vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,dmg,from:'ally',el:null,c:'#55D7FF',kind,_visualKind:kind,splashR:opts.splashR||0,homing:!!opts.homing,big:!!opts.big,life:0,evoSkill:u.ai};visualBindBullet(b,u);S.bullets.push(b);}
};
const evoSkillFire=fireFrom;
fireFrom=function(u,ang,from){return evoSkillFire(u,ang+(from==='enemy'&&u.evoSmokeUntil>S.relTime?Math.sin(u.t*.027)*.27:0),from);};
function evoAllyAI(a,dt,sl){
 const foe=evoTacticalTarget(a,dt),busy=['rise','sink','under'].includes(a.bstate)||['leave','away','run'].includes(a.wstate);
 if(foe||busy){if(foe)a.evoSkillTarget={x:foe.x,y:foe.y};const target=a.evoSkillTarget||{x:S.px,y:S.py},dx=target.x-a.x,dy=target.y-a.y,d=Math.hypot(dx,dy)||1;
 a.face=Math.atan2(dy,dx);enemyAI(a,dx,dy,d,dt,sl);
 if(a.ai==='volt'&&(a.charge>0||a.flash>0))a.face=a.flash>0?a.flashAng:a.beamAng;
 evoTacticalMove(a,foe,dt,sl);
 if(foe&&!a.noFire&&!a.gone&&d<(a.range||520)){a.fireCd-=dt*sl;if(a.fireCd<=0){a.fireCd=a.fireGap;animFire(a);if(a._opt)eVolley(a,a.face,a.ways||1,a.spread||.12,a._opt);else fireFrom(a,a.face,'ally');if(a.shots>0)a.shots--;}}
 }else{a.mv=1;evoTacticalMove(a,null,dt,sl);}
 // Perimeter recall runs once after every ally has completed its skill step.
 a.x=evoClamp(a.x,16,WORLD.w-16);a.y=evoClamp(a.y,16,WORLD.h-16);if(!a.gone)resolveProps(a,a.r,a.flying);
}
const evoSkillHUD=relDrawWorldHUD;
relDrawWorldHUD=function(){evoSkillHUD();for(const a of S.allies){if(a.gone)continue;const x=a.x-S.cam.x,y=a.y-S.cam.y;if(x<-450||x>W+450||y<-450||y>H+450)continue;
 if(a.ai==='volt'&&a.charge>0){ctx.save();ctx.strokeStyle='#55DBFF';ctx.globalAlpha=.6;ctx.lineWidth=1;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a.beamAng)*430,y+Math.sin(a.beamAng)*430);ctx.stroke();ctx.restore();}
 if(a.ai==='volt'&&a.flash>0)drawVisualLightning(x,y,a.flashAng,430,a.flash/150,Math.floor((150-a.flash)/30),TEAM_ENERGY.ally);
 if(a.evoCharge>0){ctx.save();ctx.strokeStyle='#55DBFF';ctx.globalAlpha=.35;ctx.setLineDash([3,8]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a.evoAim)*200,y+Math.sin(a.evoAim)*200);ctx.stroke();ctx.restore();}
}};

/* Element silhouettes use the supplied ordnance art. All tinting and impact
 * frames are baked once; runtime only stamps sprites and a few trail marks. */
const EVO_ELEMENTS={palette:{FREEZE:{rgb:[85,210,255],color:'#85E9FF',core:'#EAFEFF'},FIRE:{rgb:[255,92,15],color:'#FF863D',core:'#FFF1B0'},POISON:{rgb:[113,237,31],color:'#9BF236',core:'#E8FFC0'}},art:{},impacts:{},fx:[],ready:false};
function evoPrepareElements(){if(EVO_ELEMENTS.ready||!EVO_ORD.ready)return;EVO_ELEMENTS.ready=true;
 for(const[key,p]of Object.entries(EVO_ELEMENTS.palette)){EVO_ELEMENTS.art[key]=EVO_ORD.sprites[0].map(source=>{const c=visualCanvas(source.width,source.height),q=c.getContext('2d',{willReadFrequently:true});q.drawImage(source,0,0);const image=q.getImageData(0,0,c.width,c.height),d=image.data;
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const max=Math.max(d[i],d[i+1],d[i+2]),min=Math.min(d[i],d[i+1],d[i+2]),sat=(max-min)/Math.max(1,max);if(sat<.13)continue;const light=max/255,white=min/255*.35;for(let k=0;k<3;k++)d[i+k]=Math.min(255,p.rgb[k]*light*(1-white)+255*white*light);}
 q.putImageData(image,0,0);return c;});
 EVO_ELEMENTS.impacts[key]=Array.from({length:8},(_,frame)=>{const art=visualCanvas(96,96),c=art.getContext('2d'),t=frame/8,r=10+t*30;c.translate(48,48);c.globalAlpha=1-t;const glow=c.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,p.core+'C0');glow.addColorStop(.3,p.color+'88');glow.addColorStop(1,p.color+'00');c.fillStyle=glow;c.fillRect(-r,-r,r*2,r*2);c.strokeStyle=p.color;c.fillStyle=p.core;c.lineWidth=1.8;
 for(let j=0;j<7;j++){const a=j*6.283/7+t*.6,x=Math.cos(a)*r*.7,y=Math.sin(a)*r*.7;c.save();c.translate(x,y);c.rotate(a);
 if(key==='FREEZE'){c.beginPath();c.moveTo(-5,0);c.lineTo(0,-2.5);c.lineTo(6,0);c.lineTo(0,2.5);c.closePath();c.fill();}
 else if(key==='POISON'){c.beginPath();c.arc(0,0,2.5+(j%3),0,6.283);c.stroke();}
 else{c.beginPath();c.ellipse(0,0,7*(1-t)+2,2,0,0,6.283);c.fill();}c.restore();}return art;});}
}
const evoElementWarm=visualWarmArt;
visualWarmArt=async function(){await evoElementWarm();evoPrepareElements();};
const evoElementBullet=drawVisualBullet;
drawVisualBullet=function(b,cx,cy,enemy){if(!b.el||!EVO_ELEMENTS.art[b.el])return evoElementBullet(b,cx,cy,enemy);if(S.relClearIn>0||S.rewardSettled)return;
 const pos=visualBulletPosition(b),x=pos.x-cx,y=pos.y-cy;if(x<-60||x>W+60||y<-60||y>H+60)return;
 const kind=b._visualKind||b.kind||'rifle',row=kind==='missile'?2:kind==='shell'?3:kind==='laser'||kind==='plasma'?1:0,art=EVO_ELEMENTS.art[b.el][row],pal=EVO_ELEMENTS.palette[b.el],w=(row===2?44:row===3?38:40)*(b.big?1.2:1),h=w*art.height/art.width;
 ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.drawImage(art,-w*.70,-h/2,w,h);ctx.fillStyle=pal.core;ctx.strokeStyle=pal.color;ctx.lineWidth=1.3;
 for(let j=0;j<3;j++){const phase=((b.life||0)*.004+j*.33)%1,tx=-22-j*8-phase*5,ty=Math.sin(j*2.4+(b.life||0)*.025)*(2+j);ctx.globalAlpha=(1-j*.23)*.8;
 if(b.el==='FREEZE'){ctx.beginPath();ctx.moveTo(tx-3,ty);ctx.lineTo(tx,ty-2);ctx.lineTo(tx+3,ty);ctx.lineTo(tx,ty+2);ctx.closePath();ctx.fill();}
 else if(b.el==='POISON'){ctx.beginPath();ctx.arc(tx,ty,1.5+j*.45,0,6.283);ctx.stroke();}
 else{ctx.beginPath();ctx.moveTo(tx+4,ty);ctx.lineTo(tx-6,ty-1.5);ctx.lineTo(tx-4,ty+2);ctx.closePath();ctx.fill();}}
 ctx.restore();};
function evoElementImpact(x,y,el){if(!EVO_ELEMENTS.palette[el]||S.relClearIn>0)return;if(EVO_ELEMENTS.fx.length>=48)EVO_ELEMENTS.fx.shift();EVO_ELEMENTS.fx.push({x,y,el,t:0,life:el==='POISON'?460:320});}
const evoElementDamage=damageUnit;
damageUnit=function(e,dmg,el,silent){if(el&&!silent&&e.side==='enemy'&&!e.gone)evoElementImpact(e.x,e.y,el);return evoElementDamage(e,dmg,el,silent);};
const evoElementUpdate=visualUpdate;
visualUpdate=function(dt){evoElementUpdate(dt);if(mode!=='play')return;for(let i=EVO_ELEMENTS.fx.length-1;i>=0;i--){const f=EVO_ELEMENTS.fx[i];f.t+=dt;if(f.t>=f.life)EVO_ELEMENTS.fx.splice(i,1);}};
const evoElementFX=drawVisualFX;
drawVisualFX=function(cx,cy){evoElementFX(cx,cy);for(const f of EVO_ELEMENTS.fx){const im=EVO_ELEMENTS.impacts[f.el]?.[Math.min(7,Math.floor(f.t/f.life*8))];if(im)ctx.drawImage(im,f.x-cx-38,f.y-cy-38,76,76);}};
const evoElementClear=evoClearAttacks;
evoClearAttacks=function(){EVO_ELEMENTS.fx.length=0;for(const u of S.enemies){u.evoBurnUntil=0;u.evoElementLast=null;u.slow=0;u.poison=0;}evoElementClear();};
const evoElementStage=startStage;
startStage=function(n){EVO_ELEMENTS.fx.length=0;return evoElementStage(n);};

/* Distinct ice/fire/venom silhouettes, expanding impact animations and hull
 * reactions. All sprite colors, clouds and articulated masks are prewarmed. */
Object.assign(EVO_ELEMENTS,{coatings:{FREEZE:{},FIRE:{},POISON:{}},halos:{},drawingEl:null,detailReady:false});
function evoElementCloud(c,x,y,r,color,alpha){c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x-r*.16,y-r*.18,r*.04,x,y,r);g.addColorStop(0,color+'C0');g.addColorStop(.42,color+'78');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
function evoBakeElementImpact(key,frame,count=16){const art=visualCanvas(160,160),c=art.getContext('2d'),t=frame/(count-1),fade=Math.pow(1-t,.7),r=8+Math.sqrt(t)*55;c.translate(80,80);
 if(key==='FIRE'){
  // White-hot ignition opens into overlapping flame lobes, then dark embers.
  for(let j=0;j<7;j++){const a=j*6.283/7+Math.sin(j)*.2,rr=r*(.38+.12*Math.sin(j*5)),x=Math.cos(a)*rr,y=Math.sin(a)*rr-t*10;evoElementCloud(c,x,y,13+r*.37,t<.35?'#FF751D':'#D94C1D',fade*.9);}
  evoElementCloud(c,0,-t*5,Math.max(1,30*(1-t)),t<.2?'#FFF5CC':'#FFAE31',fade);
  c.globalAlpha=fade;c.strokeStyle='#FFAF52';c.lineWidth=2.4*(1-t)+.3;c.beginPath();c.ellipse(0,5,r,r*.67,0,0,6.283);c.stroke();
  for(let j=0;j<11;j++){const a=j*2.399,x=Math.cos(a)*r,y=Math.sin(a)*r*.85-t*12;c.strokeStyle=j%2?'#FFC85A':'#FF652D';c.lineWidth=1.2;c.beginPath();c.moveTo(x,y);c.lineTo(x-Math.cos(a)*8*(1-t),y-Math.sin(a)*8*(1-t));c.stroke();}
 }else if(key==='FREEZE'){
  for(let j=0;j<6;j++){const a=j*1.047;evoElementCloud(c,Math.cos(a)*r*.40,Math.sin(a)*r*.22+9,13+r*.48,'#A6ECF8',fade*.5);}
  c.globalAlpha=fade;c.strokeStyle='#CBFAFF';c.lineWidth=1.3;c.beginPath();c.ellipse(0,5,r*.9,r*.52,0,0,6.283);c.stroke();
  for(let j=0;j<8;j++){const a=j*2.399+.2,x=Math.cos(a)*r*.8,y=Math.sin(a)*r*.65,size=(7+j%3*2)*(1-t*.45);c.save();c.translate(x,y);c.rotate(a);c.fillStyle=j%2?'#E5FFFF':'#79DFFF';c.strokeStyle='#C9FBFF';c.beginPath();c.moveTo(size,0);c.lineTo(-size*.45,-size*.34);c.lineTo(-size*.18,0);c.lineTo(-size*.45,size*.34);c.closePath();c.fill();c.stroke();c.restore();}
  if(t<.35)evoElementCloud(c,0,0,20*(1-t),'#F1FFFF',fade);
 }else{
  // Several drifting puffs make a spreading toxic cloud, not a damage ring.
  for(let j=0;j<8;j++){const a=j*2.399+t*.6,rr=r*(.2+.07*(j%4));evoElementCloud(c,Math.cos(a)*rr,Math.sin(a)*rr*.7-t*15,15+r*.35,j%2?'#66C322':'#A9EE41',fade*.63);}
  for(let j=0;j<9;j++){const a=j*2.399,x=Math.cos(a)*r*.72,y=Math.sin(a)*r*.53-t*19;c.globalAlpha=fade*.85;c.strokeStyle='#BEFF68';c.lineWidth=1.4;c.beginPath();c.arc(x,y,1.5+(j%3)+Math.sin(t*3)*2,0,6.283);c.stroke();}
 }return art;}
async function evoPrepareElementDetails(){if(EVO_ELEMENTS.detailReady)return;EVO_ELEMENTS.detailReady=true;
 for(const key of ELEMENTS){const source=IMG['cg_element_'+key.toLowerCase()];if(source){const c=visualCanvas(256,Math.round(256*source.height/source.width));c.getContext('2d').drawImage(source,0,0,c.width,c.height);EVO_ELEMENTS.art[key]=Array(4).fill(c);}
  EVO_ELEMENTS.impacts[key]=Array.from({length:16},(_,i)=>evoBakeElementImpact(key,i));const halo=visualCanvas(128,128),q=halo.getContext('2d');evoElementCloud(q,64,64,60,EVO_ELEMENTS.palette[key].color,.65);EVO_ELEMENTS.halos[key]=halo;
 }
 const keys=new Set(BASIC_CONTENT.units.map(u=>u.key));for(const unit of BASIC_CONTENT.units)for(const value of Object.values(ANIM[unit.key]||{}))if(Array.isArray(value))for(const key of value)keys.add(key);
 let batch=0;for(const key of keys){const source=IMG[key];if(!source)continue;const base=evoCombatTexture(source);
  for(const el of ELEMENTS){const c=visualCanvas(base.width,base.height),q=c.getContext('2d');q.drawImage(base,0,0);q.globalCompositeOperation='source-atop';q.fillStyle=el==='FREEZE'?'rgba(230,251,255,.80)':el==='FIRE'?'rgba(255,48,17,.76)':'rgba(109,238,35,.75)';q.fillRect(0,0,c.width,c.height);q.globalCompositeOperation='source-over';EVO_ELEMENTS.coatings[el][key]=c;EVO_PERF.textures.set(c,c);
   const rig=V_RIG[key];if(rig?.parts.length){const layers=visualParts(c,rig);for(const part of layers.parts){if(part.p.mode==='tread')evoPrepareTread(c,part.img,part.p);if(part.contact)evoPrepareWheel(part.img,part.contact,part.p);}}
  }if(++batch%3===0)await new Promise(r=>setTimeout(r,0));
 }
}
const evoDetailedWarm=visualWarmArt;
visualWarmArt=async function(){await evoDetailedWarm();await evoPrepareElementDetails();};
evoElementImpact=function(x,y,el){if(!EVO_ELEMENTS.palette[el]||S.relClearIn>0)return;if(EVO_ELEMENTS.fx.length>=40)EVO_ELEMENTS.fx.shift();EVO_ELEMENTS.fx.push({x,y,el,t:0,life:el==='POISON'?850:el==='FREEZE'?650:580});};
const evoDetailedDamage=damageUnit;
damageUnit=function(u,dmg,el,silent){if(u.side==='enemy'&&!u.gone&&el){u.evoElementLast=el;if(el==='FIRE')u.evoBurnUntil=VISUAL.time+780;}return evoDetailedDamage(u,dmg,el,silent);};
function evoElementStatus(u){if(u.side!=='enemy'||u.gone||u.hp<=0)return null;const active={FREEZE:u.slow>0,POISON:u.poison>0,FIRE:(u.evoBurnUntil||0)>VISUAL.time};return active[u.evoElementLast]?u.evoElementLast:active.FIRE?'FIRE':active.FREEZE?'FREEZE':active.POISON?'POISON':null;}
const evoStatusImage=visualImage;
visualImage=function(u,key){return EVO_ELEMENTS.drawingEl&&EVO_ELEMENTS.coatings[EVO_ELEMENTS.drawingEl][key]||evoStatusImage(u,key);};
const evoStatusSprite=drawVisualSprite;
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){evoStatusSprite(u,img,w,h,c);const el=evoElementStatus(u),key=animFrame(u,visualState(u).speed)||u.img,coat=el&&EVO_ELEMENTS.coatings[el][key];if(!coat)return;
 const pulse=.5+.5*Math.sin(VISUAL.time*(el==='FIRE'?.018:.008)+(u.bob||0)),alpha=el==='FREEZE'?.70:el==='FIRE'?.24+pulse*.52:.34+pulse*.3;
 c.save();c.globalAlpha*=alpha;EVO_ELEMENTS.drawingEl=el;try{evoStatusSprite(u,coat,w,h,c);}finally{EVO_ELEMENTS.drawingEl=null;c.restore();}
};
const evoStatusUnit=drawUnit;
drawUnit=function(u,x,y){const el=evoElementStatus(u),pulse=.5+.5*Math.sin(VISUAL.time*.007+(u.bob||0));if(el){const size=Math.max(30,u.w*1.35);ctx.save();ctx.globalAlpha=el==='POISON'?.38+pulse*.18:.22;ctx.drawImage(EVO_ELEMENTS.halos[el],x-size/2,y-size/2,size,size);ctx.restore();}
 evoStatusUnit(u,x,y);if(!el)return;ctx.save();ctx.strokeStyle=EVO_ELEMENTS.palette[el].core;ctx.fillStyle=EVO_ELEMENTS.palette[el].color;ctx.lineWidth=1;
 for(let j=0;j<4;j++){const phase=(VISUAL.time*.0009+j*.25)%1,a=j*2.399,x0=x+Math.cos(a)*u.w*.36,y0=y+Math.sin(a)*u.w*.23-phase*12;ctx.globalAlpha=(1-phase)*.75;
 if(el==='FREEZE'){ctx.beginPath();ctx.moveTo(x0-2,y0);ctx.lineTo(x0,y0-3);ctx.lineTo(x0+2,y0);ctx.lineTo(x0,y0+3);ctx.closePath();ctx.fill();}
 else if(el==='POISON'){ctx.beginPath();ctx.arc(x0,y0,1.5+phase*2,0,6.283);ctx.stroke();}else ctx.fillRect(x0,y0,1.3,3*(1-phase));}ctx.restore();};
drawVisualFX=function(cx,cy){evoElementFX(cx,cy);for(const f of EVO_ELEMENTS.fx){const frames=EVO_ELEMENTS.impacts[f.el],im=frames?.[Math.min(frames.length-1,Math.floor(f.t/f.life*frames.length))];if(!im)continue;const size=f.el==='POISON'?96:f.el==='FREEZE'?88:100,x=f.x-cx,y=f.y-cy;if(x<-size||x>W+size||y<-size||y>H+size)continue;ctx.drawImage(im,x-size/2,y-size/2,size,size);}};

/* Autonomous firing lanes with limited threat perception; regroup uses hysteresis.
 * Stationary units and authored skill phases retain their movement rules. */
function evoEscortRadius(a){return a.flying?500:a.isLegend?480:430;}
function evoEscortMove(a,dx,dy){if(!a.evoStationary){a.x+=dx;a.y+=dy;}}
function evoAILevel(){return Math.floor(evoClamp(Number(S?.evoTacticalAI)||0,0,5));}
// Five reward picks share the former three-step ceiling; extra levels add no power creep.
function evoAITuningLevel(){return evoAILevel()*3/5;}
function evoTactics(a){
 if(a.evoTactics)return a.evoTactics;
 const index=Math.max(0,S.allies.indexOf(a)),seed=evoRand(index*7919+a.x*13+a.y*37+(S.evoSeed||1));
 return a.evoTactics={seed,index,regroup:false,target:null,targetCd:0,steerCd:0,observeCd:180+seed*170,nextDodgeAt:0,evadeUntil:0,evadeX:0,evadeY:0,vx:0,vy:0,wantX:0,wantY:0,patrol:null,patrolAge:0,pause:0,dodges:0,decisions:0,state:'patrol'};
}
function evoDodgeProfile(a){
 // Vehicles take longer to react; aircraft retain a small agility advantage.
 // A short sidestep is a commitment, not continuous perfect trajectory tracking.
 const q=evoTactics(a),kind=visualRig(a).kind,level=evoAITuningLevel();let p;
 if(a.flying)p={reaction:240+q.seed*90,radius:145,horizon:16,cooldown:1050+q.seed*250,commit:192};
 else if(a.isLegend)p={reaction:290+q.seed*100,radius:135,horizon:15,cooldown:1250+q.seed*300,commit:208};
 else if(kind==='walk'||kind==='authored')p={reaction:270+q.seed*90,radius:125,horizon:14,cooldown:1200+q.seed*300,commit:176};
 else p={reaction:350+q.seed*110,radius:120,horizon:12,cooldown:1500+q.seed*350,commit:208};
 // Five earned steps; even maximum AI sees only three close bullets, reacts
 // with a delay and must finish its cooldown. No speed, invulnerability or HP bonus.
 p.reaction=Math.max(180,p.reaction*(1-level*.08));p.cooldown=Math.max(900,p.cooldown*(1-level*.08));p.radius+=level*8;p.horizon+=level*1.5;p.commit+=level*16;
 return p;
}
function evoTacticalTarget(a,dt=16){
 const q=evoTactics(a),distance=Math.hypot(a.x-S.px,a.y-S.py);
 if(distance>evoEscortRadius(a))q.regroup=true;else if(distance<235)q.regroup=false;
 q.targetCd-=dt;
 const valid=t=>t&&(t.alive===true||t.side==='enemy'&&!t.gone&&t.hp>0)&&Math.hypot(t.x-S.px,t.y-S.py)<690&&Math.hypot(t.x-a.x,t.y-a.y)<620;
 if(q.targetCd>0&&valid(q.target))return q.target;
 q.targetCd=(150+q.seed*70)*(1-evoAITuningLevel()*.06);let best=null,bestScore=Infinity;
 for(const t of evoSkillTargets()){
  if(!valid(t))continue;
  const d=Math.hypot(t.x-a.x,t.y-a.y),commander=Math.hypot(t.x-S.px,t.y-S.py),occupied=S.allies.filter(b=>b!==a&&b.evoTactics?.target===t).length;
  const score=d+commander*.17+occupied*(36+evoAITuningLevel()*8)-(q.target===t?65:0);
  if(score<bestScore){bestScore=score;best=t;}
 }q.target=best;return best;
}
function evoTacticalRange(a){
 if(['burrow','wasp'].includes(a.ai))return 70;
 if(['charge','spike'].includes(a.ai))return 125;
 if(['salvo','rockets','flak','siege'].includes(a.ai))return 285;
 if(a.isLegend)return 225;if(a.flying)return 220;
 if(['walk','authored'].includes(visualRig(a).kind))return 165;
 return a.type==='tank'?240:205;
}
function evoFiringLane(a,foe,angle,range,dt){
 const level=evoAITuningLevel(),q=evoTactics(a);if(!level||range<150)return angle;
 q.laneCd=(q.laneCd||0)-dt;
 if(q.laneCd<=0||q.laneTarget!==foe){
  q.laneCd=520-level*60;q.laneTarget=foe;let best=Infinity,offset=0;
  const spread=.16+level*.12;
  for(const turn of [0,-spread,spread]){
   const x=foe.x+Math.cos(angle+turn)*range,y=foe.y+Math.sin(angle+turn)*range;
   let cost=Math.abs(turn)*18;
   for(const b of S.allies){if(b===a||b.gone||b.hp<=0)continue;const gap=Math.hypot(x-b.x,y-b.y);cost+=Math.max(0,84-gap)*(1+level*.2);}
   if(!a.flying)for(const p of [...S.props,...(S.base?[S.base]:[])]){const gap=Math.hypot((x-p.x)/(p.rx+a.r+12),(y-p.y)/(p.ry+a.r+12));cost+=Math.max(0,1.1-gap)*250;}
   if(x<35||x>WORLD.w-35||y<45||y>WORLD.h-35)cost+=300;
   if(cost<best){best=cost;offset=turn;}
  }q.laneOffset=offset;
 }
 return angle+(q.laneOffset||0);
}
function evoTacticalGoal(a,foe,dt){
 const q=evoTactics(a),phase=q.seed*Math.PI*2;
 if(q.regroup){q.state='regroup';const angle=phase+S.relTime*.00006,r=145+q.seed*45;
  return{x:S.px+Math.cos(angle)*r+(S.vx||0)*45,y:S.py+Math.sin(angle)*r+(S.vy||0)*45};}
 if(foe){q.state='engage';q.patrol=null;
  const center=Math.atan2(S.py-foe.y,S.px-foe.x),lane=(q.seed-.5)*1.65,sweep=Math.sin(S.relTime*(a.flying?.0008:.00048)+phase)*(a.flying?.42:.24);
  const range=evoTacticalRange(a)+(a.hp/a.hpMax<.32?45:0);
  const angle=evoFiringLane(a,foe,center+lane+sweep,range,dt);
  return{x:foe.x+Math.cos(angle)*range,y:foe.y+Math.sin(angle)*range};
 }
 q.state='patrol';q.patrolAge+=dt;q.pause=Math.max(0,q.pause-dt);
 if(!q.patrol||Math.hypot(q.patrol.x-S.px,q.patrol.y-S.py)>330||q.patrolAge>7000){
  const angle=phase+Math.floor(S.relTime/4200+q.seed)*1.37,r=140+q.seed*120;
  q.patrol={x:evoClamp(S.px+Math.cos(angle)*r,45,WORLD.w-45),y:evoClamp(S.py+Math.sin(angle)*r,65,WORLD.h-45)};q.patrolAge=0;
 }
 if(Math.hypot(q.patrol.x-a.x,q.patrol.y-a.y)<24&&q.patrolAge<6000){q.pause=700+q.seed*600;q.patrolAge=6000;}
 return q.patrol;
}
function evoTacticalMove(a,foe,dt,sl=1){
 if(a.evoStationary||a.gone||a.hp<=0||a.velcaStun>0||['rise','sink','under'].includes(a.bstate)||['leave','away'].includes(a.wstate))return;
 const q=evoTactics(a),goal=evoTacticalGoal(a,foe,dt);let dx=goal.x-a.x,dy=goal.y-a.y;
 if(foe&&a.mv<0&&!q.regroup){dx=a.x-foe.x;dy=a.y-foe.y;}
 const d=Math.hypot(dx,dy);let speed=a.spd*1.15*sl;
 if(q.regroup)speed=Math.max(speed,speedOf()*1.15*sl);
 const locked=a.channel>0||a.charge>0||a.flash>0||a.evoCharge>0;
 if(locked)speed*=.18;else if(a.mv===0)speed*=.42;else if(a.mv>1)speed*=Math.min(2,a.mv);
 let tx=d>8?dx/d*speed*evoClamp(d/65,.18,1):0,ty=d>8?dy/d*speed*evoClamp(d/65,.18,1):0;
 if(q.pause>0&&!foe&&!q.regroup)tx=ty=0;
 const dodge=evoDodgeProfile(a);q.observeCd-=dt;
 const committed=!locked&&S.relTime<q.evadeUntil;
 if(committed){tx=q.evadeX;ty=q.evadeY;q.state='evade';}
 q.steerCd-=dt;
 if(q.steerCd<=0){
  q.steerCd=85+q.seed*55;q.decisions++;
  let nearby=[];
  if(q.observeCd<=0){
   q.observeCd=dodge.reaction;
   if(!locked&&!committed&&S.relTime>=q.nextDodgeAt)nearby=S.ebullets.filter(b=>Math.hypot(b.x-a.x,b.y-a.y)<dodge.radius).sort((b,c)=>Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(c.x-a.x,c.y-a.y)).slice(0,3);
  }
  const angle=Math.atan2(ty||q.vy||Math.sin(q.seed*6),tx||q.vx||Math.cos(q.seed*6)),desiredSpeed=Math.hypot(tx,ty),mobileSpeed=Math.max(desiredSpeed,speed*(nearby.length?1:.8)),candidates=[[tx,ty],[0,0]];
  for(const turn of [-.55,.55,-1.05,1.05,-1.57,1.57,-2.35,2.35,Math.PI])candidates.push([Math.cos(angle+turn)*mobileSpeed,Math.sin(angle+turn)*mobileSpeed]);
  function risk(vx,vy){let cost=0,clearance=999;
   for(const b of nearby){const rx=b.x-a.x,ry=b.y-a.y,rvx=b.vx-vx,rvy=b.vy-vy,v2=rvx*rvx+rvy*rvy,t=v2?evoClamp(-(rx*rvx+ry*rvy)/v2,0,dodge.horizon):0,miss=Math.hypot(rx+rvx*t,ry+rvy*t);clearance=Math.min(clearance,miss);
    const safe=a.r+8;if(miss<safe)cost+=(safe-miss)*7*(1-t/35);}
   const x=a.x+vx*19,y=a.y+vy*19;
   if(!a.flying)for(const p of [...S.props,...(S.base?[S.base]:[])]){const gap=Math.hypot((x-p.x)/(p.rx+a.r+5),(y-p.y)/(p.ry+a.r+5));if(gap<1.08)cost+=(1.08-gap)*260;}
   for(const b of S.allies){if(b===a||b.gone)continue;const gap=Math.hypot(x-b.x,y-b.y),spacing=Math.max(42,Math.min(80,(a.w+b.w)*.42));if(gap<spacing)cost+=(spacing-gap)*1.2;}
   const commanderGap=Math.hypot(x-S.px,y-S.py);if(commanderGap<65)cost+=(65-commanderGap)*1.9;
   for(const h of S.hazards||[]){if(h.side==='ally')continue;const radius=h.k==='bomb'?h.max:h.r;if(radius&&Math.hypot(x-h.x,y-h.y)<radius+a.r)cost+=90;}
   if(x<28||x>WORLD.w-28||y<40||y>WORLD.h-28)cost+=300;
   return{cost,clearance};
  }
  const direct=risk(tx,ty);let best=Infinity,chosen=[tx,ty],choice=direct;
  for(const [vx,vy]of candidates){const r=risk(vx,vy),score=r.cost+Math.hypot(vx-tx,vy-ty)*7+Math.hypot(vx-q.vx,vy-q.vy)*3;
   if(score<best){best=score;chosen=[vx,vy];choice=r;}}
  if(nearby.length&&direct.clearance<a.r+7&&choice.clearance>direct.clearance+5){q.dodges++;q.state='evade';q.evadeUntil=S.relTime+dodge.commit;q.nextDodgeAt=S.relTime+dodge.cooldown;q.evadeX=chosen[0];q.evadeY=chosen[1];}
  q.wantX=chosen[0];q.wantY=chosen[1];
 }
 const kind=visualRig(a).kind,blend=1-Math.exp(-dt/(kind==='walk'||kind==='authored'?65:a.flying?95:140));
 q.vx+=(q.wantX-q.vx)*blend;q.vy+=(q.wantY-q.vy)*blend;a.x+=q.vx*dt/16;a.y+=q.vy*dt/16;
 if(!foe&&Math.hypot(q.vx,q.vy)>.15)a.face=Math.atan2(q.vy,q.vx);
 a.x=evoClamp(a.x,16,WORLD.w-16);a.y=evoClamp(a.y,16,WORLD.h-16);resolveProps(a,a.r,a.flying);
}
function evoLegendAI(a,dt,sl){const foe=evoTacticalTarget(a,dt);if(foe)a.face=Math.atan2(foe.y-a.y,foe.x-a.x);evoTacticalMove(a,foe,dt,sl);for(const w of a.wep){tickChannel(a,w,dt);fireWeapon(a,w,dt);}}
relFormation=function(a){if(!a.evoStationary&&Math.hypot(a.x-S.px,a.y-S.py)>evoEscortRadius(a))evoTactics(a).regroup=true;};

/* Platinum / graphite hulls, antique-yellow panels, pearly core light and a capture
 * crest. Cosmetic only: no unit stats, fleet slots, probability or AI changes. */
const EVO_PRESTIGE={glow:null,burst:[],serial:0,emission:{},drawingEmission:false};
function evoBakeGoldEmission(img){
 // Only colored panels emit. Dark joints, wheels and silver metal stay solid.
 // Local bloom is baked once; combat never runs a blur or reads pixels.
 const scale=Math.min(1,384/Math.max(img.width,img.height)),c=visualCanvas(Math.round(img.width*scale),Math.round(img.height*scale)),q=c.getContext('2d',{willReadFrequently:true});q.drawImage(img,0,0,c.width,c.height);
 const data=q.getImageData(0,0,c.width,c.height),a=data.data;
 for(let i=0;i<a.length;i+=4){const[h,s,l]=rgb2hsl(a[i],a[i+1],a[i+2]),lit=a[i+3]&&h>=38&&h<=65&&s>.22&&l>.20;
  // A nonlinear response keeps broad painted panels dark while the core and
  // their existing highlights catch a soft, warm pearl reflection.
  const highlight=Math.min(1,Math.max(0,(l-.16)/.60));
  a[i+3]=lit?Math.round(a[i+3]*.74*(.20*highlight+.80*highlight*highlight)):0;a[i]=255;a[i+1]=222;a[i+2]=147;
 }q.putImageData(data,0,0);
 const bloom=visualCanvas(c.width,c.height),b=bloom.getContext('2d');b.filter='blur(2.4px)';b.globalAlpha=.60;b.drawImage(c,0,0);b.filter='none';b.globalAlpha=.84;b.drawImage(c,0,0);return bloom;
}
async function evoWarmGoldEmission(){
 for(const key of EVO_PALETTE.keys.filter(evoLegendArtKey)){
  const mask=evoBakeGoldEmission(TINT.ally[key]);EVO_PRESTIGE.emission[key]=mask;
  const rig=V_RIG[key]||V_RIG[key.replace(/_pose\d+$/,'')];
  for(const img of new Set([mask,evoCombatTexture(mask)]))if(rig?.parts.length){
   const layers=visualParts(img,rig);for(const part of layers.parts){if(part.contact)evoPrepareWheel(part.img,part.contact,part.p);if(part.p.mode==='tread')evoPrepareTread(img,part.img,part.p);}
  }
  await new Promise(r=>setTimeout(r,0));
 }
}
const evoPrestigeWarm=visualWarmArt;
visualWarmArt=async function(){await evoPrestigeWarm();const c=visualCanvas(160,160),q=c.getContext('2d'),g=q.createRadialGradient(80,80,9,80,80,78);
 g.addColorStop(0,'#FFF8DB38');g.addColorStop(.48,'#E7B9511B');g.addColorStop(1,'#E7B95100');q.fillStyle=g;q.fillRect(0,0,160,160);EVO_PRESTIGE.glow=c;
 await evoWarmGoldEmission();
};
// Reuse the same rig transforms and authored pose crossfades for the light pass.
// Both the actual game and the enlarged motion gallery call this shared renderer.
const evoPrestigeImage=visualImage;
visualImage=function(u,key){return EVO_PRESTIGE.drawingEmission?EVO_PRESTIGE.emission[key]||null:evoPrestigeImage(u,key);};
const evoPrestigeMechanics=motion22Mechanics;
motion22Mechanics=function(u,w,h,c){if(!EVO_PRESTIGE.drawingEmission)evoPrestigeMechanics(u,w,h,c);};
const evoPrestigeSprite=drawVisualSprite;
drawVisualSprite=function(u,img,w,h,c=FACING_MAIN_CTX){
 evoPrestigeSprite(u,img,w,h,c);
 if(u.side!=='ally'||!evoLegendArtKey(u.type)||u.gone||u.hp<=0)return;
 const key=animFrame(u,visualState(u).speed)||u.img,light=EVO_PRESTIGE.emission[key];if(!light)return;
 c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=.66+.08*Math.sin(VISUAL.time*.0017+(u.bob||0));EVO_PRESTIGE.drawingEmission=true;
 try{evoPrestigeSprite(u,light,w,h,c);}finally{EVO_PRESTIGE.drawingEmission=false;c.restore();}
};
function evoDrawLegendAura(u,w,h){
 if(!EVO_PRESTIGE.glow)return;const phase=VISUAL.time*.00045+(u.bob||0),pulse=.5+Math.sin(phase*3)*.5;
 ctx.save();ctx.globalAlpha=.62+pulse*.20;ctx.drawImage(EVO_PRESTIGE.glow,-w*.76,-w*.70,w*1.52,w*1.52);
 ctx.translate(0,h*.34);ctx.scale(1,.44);ctx.lineWidth=1.4;ctx.strokeStyle='#F0CA77';ctx.globalAlpha=.55;
 for(let j=0;j<3;j++){const a=phase+j*Math.PI*2/3;ctx.beginPath();ctx.arc(0,0,w*.50,a,a+1.32);ctx.stroke();}
 ctx.fillStyle='#FFF3CE';ctx.globalAlpha=.65;for(let j=0;j<3;j++){const a=-phase+j*Math.PI*2/3,x=Math.cos(a)*w*.50,y=Math.sin(a)*w*.50;ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x+2,y);ctx.lineTo(x,y+3);ctx.lineTo(x-2,y);ctx.closePath();ctx.fill();}ctx.restore();
}
function evoLegendCrest(c,x,y,size,alpha=1){c.save();c.translate(x,y);c.globalAlpha*=alpha;c.lineWidth=1;c.fillStyle='#171B25';c.strokeStyle='#ECCA80';c.beginPath();c.moveTo(0,-size);c.lineTo(size*.8,0);c.lineTo(0,size);c.lineTo(-size*.8,0);c.closePath();c.fill();c.stroke();c.fillStyle='#FFF1BE';c.beginPath();c.moveTo(0,-size*.56);c.lineTo(size*.24,0);c.lineTo(0,size*.56);c.lineTo(-size*.24,0);c.closePath();c.fill();c.restore();}
const evoPrestigeUnit=drawUnit;
drawUnit=function(u,x,y){evoPrestigeUnit(u,x,y);if(u.isLegend&&u.side==='ally'&&!u.gone&&u.hp>0){const img=IMG[u.img],h=u.w*(img?img.height/img.width:1);evoLegendCrest(ctx,x,y-h*.52-10,6,.86);}};
const evoPrestigeRecruit=evoRecruitLegend;
evoRecruitLegend=function(e){const before=evoOwnedLegends().length;evoPrestigeRecruit(e);if(evoOwnedLegends().length<=before)return;
 if(EVO_PRESTIGE.burst.length>=6)EVO_PRESTIGE.burst.shift();EVO_PRESTIGE.burst.push({x:e.x,y:e.y,age:0,life:1050,id:++EVO_PRESTIGE.serial,w:e.w});
};
const evoPrestigeVisual=visualUpdate;
visualUpdate=function(dt){evoPrestigeVisual(dt);if(mode!=='play')return;for(let i=EVO_PRESTIGE.burst.length-1;i>=0;i--){const f=EVO_PRESTIGE.burst[i];f.age+=dt;if(f.age>=f.life)EVO_PRESTIGE.burst.splice(i,1);}};
const evoPrestigeFX=drawVisualFX;
drawVisualFX=function(cx,cy){evoPrestigeFX(cx,cy);for(const f of EVO_PRESTIGE.burst){const x=f.x-cx,y=f.y-cy;if(x<-180||x>W+180||y<-180||y>H+180)continue;const t=f.age/f.life,fade=1-t,spread=(1-Math.pow(1-t,3))*100;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=fade*.9;ctx.drawImage(EVO_PRESTIGE.glow,-110,-110,220,220);
 ctx.strokeStyle='#EAC574';ctx.lineWidth=2*fade+.4;ctx.beginPath();ctx.ellipse(0,12,18+spread,(18+spread)*.56,0,0,6.283);ctx.stroke();
 ctx.strokeStyle='#FFF5D4';ctx.globalAlpha=fade*.7;ctx.beginPath();ctx.ellipse(0,12,12+spread*.77,(12+spread*.77)*.56,0,0,6.283);ctx.stroke();
 for(let j=0;j<16;j++){const a=j*2.399+f.id,rr=spread*(.46+(j%4)*.15),px=Math.cos(a)*rr,py=Math.sin(a)*rr*.65-t*35;ctx.globalAlpha=fade*(j%2?.8:.5);ctx.fillStyle=j%3?'#F4D493':'#FFFBE8';const size=(j%3+1)*fade;ctx.beginPath();ctx.moveTo(px-size,py);ctx.lineTo(px,py-size*2);ctx.lineTo(px+size,py);ctx.lineTo(px,py+size*2);ctx.closePath();ctx.fill();}
 evoLegendCrest(ctx,0,-30-t*36,15+Math.sin(t*Math.PI)*5,Math.min(1,t*8)*Math.min(1,fade*3));ctx.restore();
 }};
const evoPrestigeClear=evoClearAttacks;
evoClearAttacks=function(){EVO_PRESTIGE.burst.length=0;evoPrestigeClear();};
const evoPrestigeStage=startStage;
startStage=function(n){EVO_PRESTIGE.burst.length=0;return evoPrestigeStage(n);};

/* Occasional boss counterattack. Stage-local, never changes normal spawn pools,
 * Legend odds or the four-turret victory condition. */
const EVO_AMBUSH={warningMs:1100,alertMs:3200,cadenceMs:320,batch:2,maxPopulation:36,buffer:null,context:null,voice:null,ui:null};
function evoAmbushScheduled(stage){return stage>=4;}
function evoAmbushCount(stage){return Math.min(22,6+Math.floor((stage-4)/5)*2);}
function evoAmbushInterval(stage){return Math.max(12500,44000-(stage-4)*680);}
function evoAmbushActive(){return !!S?.evoAmbush&&['warning','deploying'].includes(S.evoAmbush.phase);}
function evoAmbushAlive(){return !!S&&mode==='play'&&!EVO.waiting&&S.relGuide!==1&&!S.relClearIn&&!S.rewardSettled&&S.hp>0&&(S.phase==='hunt'||S.turrets.some(t=>t.alive));}
function evoAmbushStopSound(){const v=EVO_AMBUSH.voice;if(!v)return;EVO_AMBUSH.voice=null;try{v.source.stop();}catch{}v.source.disconnect();v.gain.disconnect();}
function evoAmbushAlarmBuffer(){
 if(EVO_AMBUSH.context===actx&&EVO_AMBUSH.buffer)return EVO_AMBUSH.buffer;
 const rate=22050,buffer=actx.createBuffer(1,Math.round(rate*1.65),rate),data=buffer.getChannelData(0);let phase=0;
 for(let i=0;i<data.length;i++){const t=i/rate,p=.5-.5*Math.cos(t/0.80*Math.PI*2),hz=510+430*p,env=Math.min(1,t/.035)*Math.min(1,(1.65-t)/.18);
  phase+=Math.PI*2*hz/rate;data[i]=(.64*Math.sin(phase)+.18*Math.sin(phase*3)+.05*Math.sin(phase*5))*env;
 }
 EVO_AMBUSH.context=actx;EVO_AMBUSH.buffer=buffer;return buffer;
}
function evoAmbushSound(){
 if(!actx||!soundOn||CG.muted||document.hidden||mode!=='play')return false;
 evoAmbushStopSound();audioInit();const source=actx.createBufferSource(),gain=actx.createGain();source.buffer=evoAmbushAlarmBuffer();gain.gain.value=.16;
 source.connect(gain);gain.connect(BUS_SFX);const voice={source,gain};EVO_AMBUSH.voice=voice;
 source.onended=()=>{source.disconnect();gain.disconnect();if(EVO_AMBUSH.voice===voice)EVO_AMBUSH.voice=null;};source.start();return true;
}
const evoAmbushAudioInit=audioInit;
audioInit=function(){evoAmbushAudioInit();evoAmbushAlarmBuffer();};
const evoAmbushAudioPolicy=cgApplyAudioPolicy;
cgApplyAudioPolicy=function(){evoAmbushAudioPolicy();if(CG.muted||document.hidden)evoAmbushStopSound();};
const evoAmbushSoundToggle=setBattleSound;
setBattleSound=function(on){if(!on)evoAmbushStopSound();return evoAmbushSoundToggle(on);};
const evoAmbushPause=setPaused;
setPaused=function(on){if(on)evoAmbushStopSound();return evoAmbushPause(on);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)evoAmbushStopSound();});

function evoAmbushReset(){evoAmbushStopSound();if(S)S.evoAmbush={triggered:false,phase:'idle',age:0,queue:[],anchors:[],spawned:0,total:0,cooldown:0,bossAge:0,clock:0,waves:0,nextAt:Math.max(8500,16000-(S.stage-4)*140)};evoAmbushHUD();}
const evoAmbushStage=startStage;
startStage=function(n){evoAmbushStage(n);evoAmbushReset();};
function evoAmbushCancel(){if(S?.evoAmbush){S.evoAmbush.queue.length=0;S.evoAmbush.phase='cancelled';}evoAmbushStopSound();evoAmbushHUD();}
const evoAmbushClear=evoClearAttacks;
evoClearAttacks=function(){evoAmbushCancel();evoAmbushClear();};
const evoAmbushGameOver=gameOver;
gameOver=function(){evoAmbushCancel();return evoAmbushGameOver();};

function evoStartAmbush(){
 const a=S?.evoAmbush;
 if(!a||evoAmbushActive()||a.phase==='cancelled'||!evoAmbushAlive()||!evoAmbushScheduled(S.stage)||a.clock<a.nextAt)return false;
 a.triggered=true;a.phase='warning';a.age=0;a.total=evoAmbushCount(S.stage);a.spawned=0;a.cooldown=0;a.waves++;
 const b=S.base,y=S.py-65;
 a.anchors=[b?{lane:'gate',x:b.x,y:b.y+Math.max(42,b.ry+16)}:{lane:'north',x:evoClamp(S.px+(Math.random()-.5)*180,70,WORLD.w-70),y:evoClamp(S.py-330,70,WORLD.h-70)},
  {lane:'left',x:evoClamp(S.px-300-Math.random()*85,60,WORLD.w-60),y:evoClamp(y+(Math.random()-.5)*210,70,WORLD.h-70)},
  {lane:'right',x:evoClamp(S.px+300+Math.random()*85,60,WORLD.w-60),y:evoClamp(y+(Math.random()-.5)*210,70,WORLD.h-70)}];
 for(let i=0;i<a.total;i++)a.queue.push({type:pickType(S.stage),lane:i%3,offset:Math.random()});
 if(b)b.gateT=100000;S.spawnCd=Math.max(S.spawnCd,1800);evoAmbushSound();evoAmbushHUD();evoLog('reinforcements-warning',{count:a.total,wave:a.waves,phase:S.phase});return true;
}
const evoAmbushHitTurret=hitTurret;
hitTurret=function(t,dmg){const alive=t.alive;evoAmbushHitTurret(t,dmg);if(alive)evoStartAmbush();};

function evoAmbushPosition(entry){
 const anchor=S.evoAmbush.anchors[entry.lane],d=UNITS[entry.type],radius=d.r||20;
 for(let i=0;i<10;i++){
  const spread=anchor.lane==='gate'?48:75,angle=(entry.offset+i*.381966)*Math.PI*2;
  const distance=i===0?10:spread*(.30+(i%4)*.23);
  const p={x:evoClamp(anchor.x+Math.cos(angle)*distance,45,WORLD.w-45),y:evoClamp(anchor.y+Math.sin(angle)*distance*(anchor.lane==='gate'?.32:.8),55,WORLD.h-55)};
  resolveProps(p,radius,!!d.flying);
  if(p.x<35||p.x>WORLD.w-35||p.y<40||p.y>WORLD.h-40)continue;
  if(Math.hypot(p.x-S.px,p.y-S.py)<145)continue;
  if(S.allies.some(u=>!u.gone&&u.hp>0&&Math.hypot(p.x-u.x,p.y-u.y)<radius+(u.r||20)+22))continue;
  if(S.enemies.some(u=>!u.gone&&u.hp>0&&Math.hypot(p.x-u.x,p.y-u.y)<Math.min(46,radius+(u.r||20)+4)))continue;
  return p;
 }
 return null; // Occupied exits wait briefly; never put a unit on the player.
}
function evoUpdateAmbush(dt){
 const a=S?.evoAmbush;if(!a)return;
 if(!evoAmbushAlive()){if(a.phase==='warning'||a.phase==='deploying')evoAmbushCancel();return;}
 a.clock+=dt;a.bossAge+=dt;if(!evoAmbushActive())evoStartAmbush();
 if(a.phase==='idle'||a.phase==='cancelled')return;a.age+=dt;
 if(a.phase==='warning'&&a.age>=EVO_AMBUSH.warningMs){a.phase='deploying';if(S.base){S.base.open=true;S.base.gateT=100000;}evoLog('reinforcements-deploy',{count:a.total});}
 if(a.phase!=='deploying')return;
 a.cooldown-=dt;if(a.cooldown>0)return;a.cooldown=EVO_AMBUSH.cadenceMs;
 const count=Math.min(EVO_AMBUSH.batch,a.queue.length,Math.max(0,Math.min(EVO_AMBUSH.maxPopulation,evoEnemyLimit(S.stage)+4)-S.enemies.length-S.relQueue.length));let spawned=0,tries=a.queue.length;
 while(spawned<count&&tries-->0){const entry=a.queue.shift(),p=evoAmbushPosition(entry);if(!p){a.queue.push(entry);continue;}
  const e=makeUnit(entry.type,p.x,p.y,'enemy');e.evoAmbushUnit=true;e.evoAmbushLane=S.evoAmbush.anchors[entry.lane].lane;e.evoAmbushGrace=750;e.fireCd=Math.max(e.fireCd,700);e.face=Math.atan2(S.py-e.y,S.px-e.x);
  S.enemies.push(e);a.spawned++;spawned++;
  visualFX({k:'dust',x:e.x,y:e.y+e.r*.5,life:250,r:9,c:'#a58b73'});
 }
 if(!a.queue.length||a.age>10500){a.queue.length=0;a.phase='done';a.nextAt=a.clock+evoAmbushInterval(S.stage);if(S.base)S.base.gateT=1600;S.spawnCd=Math.max(S.spawnCd,900);evoLog('reinforcements-complete',{count:a.spawned,nextIn:evoAmbushInterval(S.stage)});}
}
const evoAmbushAI=enemyAI;
enemyAI=function(e,dx,dy,dist,dt,sl){if(e.evoAmbushGrace>0&&e.side==='enemy'){e.evoAmbushGrace=Math.max(0,e.evoAmbushGrace-dt);e.mv=e.evoStationary?0:1;e.noFire=true;return;}return evoAmbushAI(e,dx,dy,dist,dt,sl);};
const evoAmbushNormalSpawn=spawnAroundPlayer;
spawnAroundPlayer=function(){if(!evoAmbushActive())return evoAmbushNormalSpawn();};
const evoAmbushLegend=evoTryLegend;
evoTryLegend=function(){if(!evoAmbushActive())return evoAmbushLegend();};
const evoAmbushUpdate=update;
update=function(dt){
 if(mode!=='play'||EVO.waiting)return evoAmbushUpdate(dt);
 if(evoAmbushActive()&&S.base){S.base.gateT=100000;if(S.evoAmbush.phase==='deploying')S.base.open=true;}
 evoAmbushUpdate(dt);
 if(mode==='play')evoUpdateAmbush(dt);else if(evoAmbushActive())evoAmbushCancel();
};

function evoAmbushHUD(){
 const ui=EVO_AMBUSH.ui;if(!ui)return;const a=S?.evoAmbush;
 const show=!!a&&a.triggered&&a.phase!=='cancelled'&&a.age<EVO_AMBUSH.alertMs&&mode==='play'&&!S.relClearIn&&!S.rewardSettled;
 evoHUDValue('evoAmbushAlert','hidden',!show);evoHUDValue('relChapter','hidden',show);
 if(!show){if(mode!=='play'||!soundOn||CG.muted||document.hidden)evoAmbushStopSound();return;}
 evoHUDText('evoAmbushText',basicText('경고 · 적 증원 접근','WARNING · REINFORCEMENTS')+' · '+a.total);
}
const evoAmbushInit=basicInit;
basicInit=function(){evoAmbushInit();const alert=basicNode('div',null,'evo-ambush-alert');alert.id='evoAmbushAlert';alert.hidden=true;alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');alert.setAttribute('aria-atomic','true');
 const lamp=basicNode('i'),copy=basicNode('span');copy.id='evoAmbushText';lamp.setAttribute('aria-hidden','true');alert.append(lamp,copy);$('relChapter').before(alert);EVO_AMBUSH.ui=alert;
};
const evoAmbushSyncHUD=relSyncHUD;
relSyncHUD=function(){evoAmbushSyncHUD();evoAmbushHUD();};
const evoAmbushWorldHUD=relDrawWorldHUD;
relDrawWorldHUD=function(){evoAmbushWorldHUD();const a=S.evoAmbush;if(!a||!evoAmbushAlive()||!['warning','deploying'].includes(a.phase)||a.age>EVO_AMBUSH.alertMs)return;
 const pulse=.4+.2*Math.sin(a.age*.016);ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle='#F6AA68';ctx.globalAlpha=pulse;
 for(const p of a.anchors){const x=p.x-S.cam.x,y=p.y-S.cam.y;if(x<-40||x>W+40||y<-40||y>H+40)continue;ctx.beginPath();ctx.ellipse(x,y,25,13,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
};

/* Blend boss framing into ordinary follow over a distance band. A hard
 * 490-unit switch used to jump the map when the player crossed that boundary. */
const EVO_CAMERA={owner:null,stage:0,w:0,h:0,x:0,y:0};
function evoResizeWorld(){
 if(!S)return;
 // Rotation may reveal more ground than the original portrait arena contains.
 // Grow without relocating units, pickups or the base; never shrink an active map.
 WORLD.w=Math.max(WORLD.w,Math.ceil(W+380));
 WORLD.h=Math.max(WORLD.h,Math.ceil(H+320));
 relCamera(0); // Also frame a paused battle immediately, before its next update.
}
function evoCameraTarget(){
 const follow={x:S.px-W/2,y:S.py-H*.58};
 let x=follow.x,y=follow.y;
 if(S.phase==='boss'&&S.base&&S.turrets.some(t=>t.alive)){
  const distance=Math.hypot(S.px-S.base.x,S.py-S.base.y);
  const t=evoClamp((distance-340)/300,0,1),weight=1-t*t*(3-2*t);
  if(W<700){
   const framed=evoClamp(follow.x,S.base.x-W+180,S.base.x-180);
   x+=(framed-x)*weight;
  }
  if(H<700){const framed=(S.py+S.base.y+85)/2-H*.52;y+=(framed-y)*weight;}
 }
 return{x:evoClamp(x,0,Math.max(0,WORLD.w-W)),y:evoClamp(y,0,Math.max(0,WORLD.h-H))};
}
relCamera=function(dt=16){
 if(!S)return;
 const c=EVO_CAMERA,target=evoCameraTarget();
 if(c.owner!==S||c.stage!==S.stage||c.w!==W||c.h!==H){
  c.owner=S;c.stage=S.stage;c.w=W;c.h=H;c.x=target.x;c.y=target.y;
 }else{
  const a=1-Math.exp(-Math.min(64,Math.max(0,dt))/110);
  c.x+=(target.x-c.x)*a;c.y+=(target.y-c.y)*a;
 }
 S.cam.x=c.x;S.cam.y=c.y;
};

/* Combat stops immediately; the clear, mechanical panel and sector reveal keep
 * animating. Timers use the game clock, so tab hiding and pause cannot skip them. */
const EVO_DEBRIEF={phase:'idle',age:0,busy:false,swap:null,veil:null,owner:null,icons:new Map()};
const evoDebriefWarm=visualWarmArt;
visualWarmArt=async function(){await evoDebriefWarm();for(const key of EVO_LEGENDS){const im=TINT.ally[key]||IMG[key];if(!im)continue;const k=160/Math.max(im.width,im.height),c=visualCanvas(Math.round(im.width*k),Math.round(im.height*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);EVO_DEBRIEF.icons.set(key,c.toDataURL('image/png'));}};
function evoDebriefReset(){
 const d=EVO_DEBRIEF;d.phase='idle';d.age=0;d.busy=false;d.swap=null;d.owner=S;
 $('lyUp').classList.remove('evo-switch-out','evo-depart');$('lyUp').querySelector('.frame').inert=false;
 if(d.veil){d.veil.classList.remove('on');d.veil.style.opacity='0';d.veil.style.visibility='';}
 document.body.classList.remove('evo-clearing');
}
const evoDebriefInit=basicInit;
basicInit=function(){evoDebriefInit();const v=basicNode('div',null,'evo-sector-veil');v.setAttribute('aria-hidden','true');$('stage').append(v);EVO_DEBRIEF.veil=v;};
const evoDebriefPause=setPaused;
setPaused=function(on){const result=evoDebriefPause(on);if(EVO_DEBRIEF.veil)EVO_DEBRIEF.veil.style.visibility=mode==='pause'?'hidden':'';return result;};
const evoDebriefStage=startStage;
startStage=function(n){const departing=EVO_DEBRIEF.phase==='depart';if(!departing)evoDebriefReset();evoDebriefStage(n);EVO_DEBRIEF.owner=S;};
openUpgrade=function(){
 if(S.relClearIn||S.rewardSettled||EVO_DEBRIEF.phase!=='idle')return;
 evoClearAttacks();const d=EVO_DEBRIEF;d.phase='clear';d.age=0;d.owner=S;d.busy=true;
 S.relClearIn=560;S.spawnCd=1e9;REL.notice=null;document.body.classList.add('evo-clearing');
 evoLog('sector-clear');cgGameplayStop();
};
function evoPanelSwap(done){
 const d=EVO_DEBRIEF;if(d.swap||['depart','arrive'].includes(d.phase))return;
 d.swap={age:0,done};d.busy=true;$('lyUp').querySelector('.frame').inert=true;$('lyUp').classList.add('evo-switch-out');clearBattleInput();
}
const evoDebriefLegendSelection=evoShowLegendSelection;
evoShowLegendSelection=function(done,expanded=false){evoDebriefLegendSelection(()=>evoPanelSwap(done),expanded);const records=evoOwnedLegends();$('upChoices').querySelectorAll('.evo-fleet-card img').forEach((im,i)=>{const src=EVO_DEBRIEF.icons.get(records[i]?.key);if(src)im.src=src;});};
function evoBeginNextSector(){
 const d=EVO_DEBRIEF;if(['depart','arrive'].includes(d.phase))return;
 d.phase='depart';d.age=0;d.busy=true;d.swap=null;clearBattleInput();
 $('lyUp').classList.add('evo-depart');$('lyUp').querySelector('.frame').inert=true;
 if(d.veil){d.veil.classList.add('on');d.veil.style.opacity='0';}
}
advanceAfterUpgrade=function(){
 if(S.evoNeedSelection||EVO_DEBRIEF.busy)return;
 if(rosterCount(true)<evoLegendCap()&&S.evoReserve?.length){evoPanelSwap(()=>evoShowLegendSelection(()=>evoBeginNextSector(),true));return;}
 evoBeginNextSector();
};
function evoDebriefTick(dt){
 const d=EVO_DEBRIEF;if(!S||mode==='pause'||document.hidden)return;
 if(d.swap){d.swap.age+=dt;if(d.swap.age>=200){const done=d.swap.done;d.swap=null;d.busy=false;$('lyUp').classList.remove('evo-switch-out');$('lyUp').querySelector('.frame').inert=false;done();}return;}
 if(d.phase==='depart'){
  d.age+=dt;if(d.veil)d.veil.style.opacity=String(evoClamp(d.age/380,0,1));
  if(d.age>=400){pgAdvanceStage();
   // The stage-60 season interlude owns its own continuation.
   if(mode!=='play'){evoDebriefReset();return;}
   d.phase='arrive';d.age=0;cgGameplayStop();$('lyUp').classList.remove('evo-depart');$('lyUp').querySelector('.frame').inert=false;relCamera(16);draw();
  }return;
 }
 if(d.phase==='arrive'){
  d.age+=dt;if(d.veil)d.veil.style.opacity=String(1-evoClamp(d.age/360,0,1));clearBattleInput();
  if(d.age>=360){evoDebriefReset();cgGameplayStart();}return;
 }
 if(d.phase==='panel'&&mode!=='upgrade')evoDebriefReset();
}
const evoDebriefUpdate=update;
update=function(dt){
 const d=EVO_DEBRIEF;
 if(d.owner&&d.owner!==S)evoDebriefReset();
 if(['depart','arrive'].includes(d.phase)||d.swap){evoDebriefTick(dt);return;}
 if(d.phase==='clear'&&mode==='play'){
  d.age+=dt;S.relTime+=dt;S.relClearIn=Math.max(1,560-d.age);clearBattleInput();S.shake=0;
  // Ease each survivor to rest instead of freezing walking poses mid-stride.
  for(const a of S.allies){if(a.evoStationary)continue;const q=a.evoTactics;if(q){const k=Math.exp(-dt/75);q.vx*=k;q.vy*=k;a.x+=q.vx*dt/16;a.y+=q.vy*dt/16;resolveProps(a,a.r,a.flying);}}
  if(d.age>=560){d.phase='panel';d.age=0;d.busy=false;S.relClearIn=0;relOpenUpgradeNow();document.body.classList.remove('evo-clearing');}
  return;
 }
 evoDebriefUpdate(dt);evoDebriefTick(dt);
};
const evoDebriefVisual=visualUpdate;
visualUpdate=function(dt){
 if(EVO_DEBRIEF.phase==='clear'&&mode==='play'){evoCombatVisualUpdate(dt);return;}
 if(['panel','depart','arrive'].includes(EVO_DEBRIEF.phase)&&mode!=='pause'){VISUAL.time+=dt;return;}
 evoDebriefVisual(dt);
};
// The common HUD chooses the clear-state text; two writers must not alternate it.
const evoDebriefWorld=relDrawWorldHUD;
relDrawWorldHUD=function(){evoDebriefWorld();if(EVO_DEBRIEF.phase!=='clear')return;
 const p=evoClamp(EVO_DEBRIEF.age/560,0,1);ctx.save();ctx.lineWidth=2;
 for(const t of S.turrets){const x=t.x-S.cam.x,y=t.y-S.cam.y;ctx.globalAlpha=(1-p)*.75;ctx.strokeStyle='#edc28a';ctx.beginPath();ctx.ellipse(x,y,18+p*50,8+p*25,0,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<8;i++){const a=i*Math.PI/4+t.i,r=10+p*(25+i%3*9);ctx.globalAlpha=(1-p)*.85;ctx.fillStyle=i%2?'#ffb15c':'#d8e5df';ctx.fillRect(x+Math.cos(a)*r,y+Math.sin(a)*r*.6-p*18,2,2);}
 }ctx.restore();
};

/* Bounded, deduplicated asset loading. A slow image no longer blocks a batch
 * of unrelated files. Identical source images also share their color caches. */
const EVO_LOAD={images:new Map(),progress:0,retries:0,failed:[],timeout:10000,totalTimeout:60000};
function evoLoadProgress(value,phase){
 EVO_LOAD.progress=Math.max(EVO_LOAD.progress,Math.min(99,Math.round(value)));
 const pct=$('loadPct'),sub=$('loadSub');if(pct)pct.textContent=EVO_LOAD.progress+'%';
 if(sub)sub.textContent=phase||basicText('전장 그래픽을 불러옵니다','Loading battlefield graphics');
}
function evoImageAttempt(src,signal){
 return new Promise((resolve,reject)=>{const im=new Image();let done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);im.onload=im.onerror=null;if(error){im.src='';reject(error);}else resolve(im);};
  const abort=()=>finish(Error('ASSET_LOADING_TIMEOUT'));
  const timer=setTimeout(()=>finish(Error('ASSET_DOWNLOAD_TIMEOUT')),EVO_LOAD.timeout);
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  im.decoding='async';im.onload=()=>{if(im.decode)im.decode().then(()=>finish(),()=>finish(Error('ASSET_DECODE_FAILED')));else finish();};
  im.onerror=()=>finish(Error('ASSET_LOAD_FAILED'));im.src=src;
 });
}
loadOneArt=async function(key,signal){
 const src=ART[key];let promise=EVO_LOAD.images.get(src);
 if(!promise){promise=(async()=>{let last;
   for(let attempt=0;attempt<2;attempt++){if(signal?.aborted)throw Error('ASSET_LOADING_TIMEOUT');
    const url=attempt&&!src.startsWith('data:')?src+(src.includes('?')?'&':'?')+'foi_retry=22':src;
    try{return await evoImageAttempt(url,signal);}catch(error){last=error;if(signal?.aborted)break;if(!attempt){EVO_LOAD.retries++;evoLoadProgress(EVO_LOAD.progress,basicText('지연된 그래픽 파일을 다시 받는 중입니다','Retrying a delayed graphics file'));}}
   }throw Error((last?.message||'ASSET_LOAD_FAILED')+' · '+(src.startsWith('data:')?key:src.split('/').pop()));
  })();EVO_LOAD.images.set(src,promise);
 }
 IMG[key]=await promise;
};
loadArt=async function(){
 EVO_LOAD.progress=0;EVO_LOAD.failed=[];EVO_LOAD.images.clear();
 const keep=k=>/^(ad_|grass_|border_|p_|cg_|ill_|inf_w|e_)/.test(k)||BASIC_CONTENT.units.some(u=>u.key===k)||EVO_LEGENDS.includes(k)||/^(L_titan|infantry)_pose[1-5]$/.test(k)||[...HERO_KEYS,...VELCA_KEYS,'i_summon','velca_core',...RELIC_KEYS.map(k=>RELICS[k].ic),'main','wall_closed','wall_open','turrets','i_pwr','i_rate','i_shld','i_heal','i_way','i_spd','i_slot','i_apwr','i_ice','i_poison','i_fire','c_ast','c_cred'].includes(k);
 const names=Object.keys(ART).filter(keep),controller=new AbortController();let next=0,completed=0;
 const timer=setTimeout(()=>controller.abort(),EVO_LOAD.totalTimeout);
 async function worker(){while(next<names.length&&!controller.signal.aborted){const key=names[next++];try{await loadOneArt(key,controller.signal);completed++;evoLoadProgress(completed/names.length*70);}catch(error){EVO_LOAD.failed.push(error.message);}}}
 try{await Promise.all(Array.from({length:6},worker));if(controller.signal.aborted)throw Error('ASSET_LOADING_TIMEOUT');if(EVO_LOAD.failed.length)throw Error(EVO_LOAD.failed[0]);}
 finally{clearTimeout(timer);controller.abort();}
};
const evoMemoColor={blue:new WeakMap(),gold:new WeakMap(),neutral:new WeakMap(),frost:new WeakMap()};
function evoCachedColor(kind,img,make){const cache=evoMemoColor[kind];if(!cache.has(img))cache.set(img,make(img));return cache.get(img);}
buildTints=async function(){
 const keys=new Set([...UNIT_KEYS,...Object.keys(V_RIG),...BASIC_CONTENT.units.map(u=>u.key),...EVO_LEGENDS]);
 for(const anim of Object.values(ANIM))for(const value of Object.values(anim))if(Array.isArray(value))for(const key of value)if(typeof key==='string')keys.add(key);
 const active=[...keys].filter(k=>IMG[k]);let count=0;
 for(const k of active){const img=IMG[k];if(!UNIT_KEYS.includes(k))UNIT_KEYS.push(k);
  TINT.ally[k]=evoLegendArtKey(k)?evoCachedColor('gold',img,evoLegendArmor):evoCachedColor('blue',img,evoBlueArmor);
  TINT.neutral[k]=evoCachedColor('neutral',img,im=>tint(im,47));TINT.frost[k]=evoCachedColor('frost',img,frostify);
  EVO_PALETTE.frost[k]=TINT.ally[k];EVO_PALETTE.keys.push(k);
  evoLoadProgress(70+ ++count/active.length*16,basicText('편대 색상을 준비합니다','Preparing squad colors'));
  if(count%3===0)await new Promise(r=>setTimeout(r,0));
 }
};

/* Citadel weapons: fixed impact zones and a preannounced laser sweep.
 * Simulation, cannon rotation, beam and damage share one paused game clock. */
const SIEGE={art:null,audioContext:null,buffers:new Map(),voices:new Set(),maxVoices:8};
const SIEGE_LASER={lockAt:750,fireAt:2050,fireMs:2800,endAt:5200,halfArc:.64,near:66,far:1000,halfWidth:16,hitEvery:450};
const SIEGE_ORBITAL={lockAt:2000,warningMs:500,spacing:230,fallMs:320,endAt:3700,blastMs:1600};
function siegeLaserCenter(o){return Math.PI/2+evoClamp(Math.atan2(S.py-o.y+15,S.px-o.x)-Math.PI/2,-.30,.30);}
function siegeLaserAngle(a){const f=evoClamp((a.t-SIEGE_LASER.fireAt)/SIEGE_LASER.fireMs,0,1);return a.center+a.sweepDir*SIEGE_LASER.halfArc*(f*2-1);}
function siegeLaserLive(a){return a?.kind==='laser'&&a.t>=SIEGE_LASER.fireAt&&a.t<SIEGE_LASER.fireAt+SIEGE_LASER.fireMs;}
function siegeLaserContains(a,o,x,y){const dx=x-o.x,dy=y-o.y+15,c=Math.cos(a.angle),sn=Math.sin(a.angle),along=dx*c+dy*sn;return along>SIEGE_LASER.near&&along<SIEGE_LASER.far&&Math.abs(dx*sn-dy*c)<SIEGE_LASER.halfWidth;}
function siegePatterns(stage){return stage<4?[]:stage<7?['salvo']:stage<10?['salvo','laser']:['orbital','salvo','laser'];}
function siegeGap(stage){return Math.max(4400,10600-stage*110);}
function siegeReset(){if(S)S.siege={age:0,next:3800,sequence:0,laserPasses:0,attack:null,blasts:[]};siegeStopAudio();}
const siegeStage=startStage;
startStage=function(n){siegeStage(n);siegeReset();};
const siegeSpawn=spawnBase;
spawnBase=function(){siegeSpawn();siegeReset();const art=siegeArt();if(S.base&&S.stage>=4&&art){S.base.key='cg_siegeOpen';S.base.w=188;S.base.h=188*art.open.height/art.open.width;}};
const siegeClear=evoClearAttacks;
evoClearAttacks=function(){siegeReset();siegeClear();};
const siegeOver=gameOver;
gameOver=function(){siegeReset();return siegeOver();};
const siegePlayerDamage=damagePlayer;
damagePlayer=function(amount){return siegePlayerDamage(amount*(S.stage===1?.58:S.stage===2?.72:S.stage===3?.86:1));};
function siegeOrigin(){const b=S.base;return{x:b.x,y:b.y-b.h*.22};}
function siegeBegin(kind){
 if(!S?.base||!siegePatterns(S.stage).includes(kind)||S.relClearIn||S.rewardSettled||S.siege.attack)return false;
 const o=siegeOrigin(),a={kind,t:0,sent:0,angle:Math.atan2(S.py-o.y+(kind==='laser'?15:0),S.px-o.x),targets:[],locked:false,beep:0,tick:0};
 if(kind==='laser'){a.center=siegeLaserCenter(o);a.sweepDir=S.siege.laserPasses++%2===0?-1:1;a.angle=siegeLaserAngle(a);a.playerHitAt=-Infinity;a.allyHits=new WeakMap();}
 S.siege.attack=a;relToast(kind==='laser'?'경고 · 레이저 충전':kind==='orbital'?'경고 · 삼연발 미사일 발사':'경고 · 연속 미사일',kind==='laser'?'WARNING · LASER CHARGING':kind==='orbital'?'WARNING · TRIPLE MISSILE LAUNCH':'WARNING · MISSILE SALVO');
 if(kind==='laser')relToast(a.sweepDir<0?'레이저 충전 · 좌 → 우':'레이저 충전 · 우 → 좌',a.sweepDir<0?'LASER CHARGING · LEFT → RIGHT':'LASER CHARGING · RIGHT → LEFT');
 siegeAudio(kind==='laser'?'charge':'hatch');evoLog('siege-start',{kind});return true;
}
function siegeStrikeTargets(a){
 const r=Math.min(88,62+S.stage*.45),spread=r*2.55,ang=Math.atan2(S.py-S.base.y,S.px-S.base.x)+Math.PI/2;
 a.targets=[-1,0,1].map((i)=>{const warningAt=a.t+(i+1)*SIEGE_ORBITAL.spacing;return{x:evoClamp(S.px+Math.cos(ang)*spread*i,55,WORLD.w-55),y:evoClamp(S.py+Math.sin(ang)*spread*i+(i===0?-35:25),70,WORLD.h-55),r,warningAt,impact:warningAt+SIEGE_ORBITAL.warningMs,announced:false,hit:false};});
 a.locked=true;relToast('경고 · 미사일 낙하 지점 이탈','WARNING · LEAVE THE IMPACT ZONES');evoLog('siege-targets-locked',{count:3});
}
function siegeHitAllies(test,damage){
 for(let i=S.allies.length-1;i>=0;i--){const a=S.allies[i];if(a.gone||a.hp<=0||!test(a.x,a.y,a))continue;
  a.hp-=damage;visualHit(a);if(a.hp<=0){visualDeath(a);S.allies.splice(i,1);}
 }
}
function siegeImpact(p){
 if(Math.hypot(S.px-p.x,S.py-p.y)<=p.r)damagePlayer(22+Math.min(20,S.stage*.34));
 if(mode!=='play')return;
 siegeHitAllies((x,y)=>Math.hypot(x-p.x,y-p.y)<=p.r,4+Math.min(8,S.stage*.13));
 if(S.siege.blasts.length>=6)S.siege.blasts.shift();
 S.siege.blasts.push({x:p.x,y:p.y,r:p.r,t:0,seed:evoRand(Math.round(p.x*31+p.y*17))});S.shake=Math.max(S.shake,160);siegeAudio('impact');evoLog('siege-impact',{x:p.x,y:p.y});
}
function siegeUpdate(dt){
 const s=S?.siege;if(!s||mode!=='play'||EVO.waiting||S.relClearIn||S.rewardSettled)return;
 s.blasts=s.blasts.filter(b=>(b.t+=dt)<SIEGE_ORBITAL.blastMs);
 if(S.phase!=='boss'||!S.base||!S.turrets.some(t=>t.alive))return;
 s.age+=dt;const patterns=siegePatterns(S.stage);if(!patterns.length)return;
 if(!s.attack){s.next-=dt;if(s.next<=0&&Math.hypot(S.px-S.base.x,S.py-S.base.y)<1050){siegeBegin(patterns[s.sequence++%patterns.length]);}return;}
 const a=s.attack,o=siegeOrigin();a.t+=dt;
 if(a.kind==='salvo'){
  const count=Math.min(10,5+Math.floor(S.stage/12));
  while(a.sent<count&&a.t>=650+a.sent*230){const ang=Math.atan2(S.py-o.y,S.px-o.x)+(a.sent%2?-.045:.045),sp=Math.min(5.5,3.65+S.stage*.03),b={x:o.x,y:o.y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,dmg:9+Math.min(9,S.stage*.16),c:'#ff865c',big:true,_visualKind:'missile',siegeRocket:true,life:0};S.ebullets.push(b);a.sent++;siegeAudio('launch');}
  if(a.t>950+count*230)s.attack=null;
 }else if(a.kind==='laser'){
  if(a.t<SIEGE_LASER.lockAt)a.center=siegeLaserCenter(o);
  if(!a.locked&&a.t>=SIEGE_LASER.lockAt){a.locked=true;evoLog('siege-laser-locked',{center:a.center,direction:a.sweepDir<0?'left-right':'right-left'});}
  a.angle=siegeLaserAngle(a);
  if(a.t>=SIEGE_LASER.fireAt&&a.sent===0){a.sent=1;relToast(a.sweepDir<0?'경고 · 레이저 좌 → 우':'경고 · 레이저 우 → 좌',a.sweepDir<0?'WARNING · LASER LEFT → RIGHT':'WARNING · LASER RIGHT → LEFT');}
  siegeSyncBeamAudio(a);
  if(siegeLaserLive(a)){
   if(a.t-a.playerHitAt>=SIEGE_LASER.hitEvery&&siegeLaserContains(a,o,S.px,S.py)){a.playerHitAt=a.t;damagePlayer(16+Math.min(16,S.stage*.25));if(mode!=='play')return;}
   siegeHitAllies((x,y,u)=>{if(!siegeLaserContains(a,o,x,y)||a.t-(a.allyHits.get(u)??-Infinity)<SIEGE_LASER.hitEvery)return false;a.allyHits.set(u,a.t);return true;},2.2+Math.min(3,S.stage*.045));
  }
  if(a.t>=SIEGE_LASER.endAt)s.attack=null;
 }else{
  while(a.sent<3&&a.t>=550+a.sent*280){a.sent++;siegeAudio('launch');}
  if(!a.locked&&a.t>=SIEGE_ORBITAL.lockAt)siegeStrikeTargets(a);
  for(const p of a.targets){
   if(!p.announced&&a.t>=p.warningAt){p.announced=true;siegeAudio('mark');}
   if(!p.hit&&a.t>=p.impact){p.hit=true;siegeImpact(p);if(mode!=='play')return;}
  }
  if(a.t>SIEGE_ORBITAL.endAt)s.attack=null;
 }
 if(!s.attack){s.next=siegeGap(S.stage);evoLog('siege-end');}
}
const siegeTickBase=update;
update=function(dt){siegeTickBase(dt);if(mode==='play'&&!EVO.waiting)siegeUpdate(dt);};

/* The transparent atlas is decoded once. The two building frames share bounds
 * so shutters never wobble between frames; no per-frame pixel processing. */
function siegeArt(){
 if(SIEGE.art)return SIEGE.art;const img=IMG.cg_siegeAtlas;if(!img?.width)return null;
 const side=img.width/2,frames=[];
 for(let row=0;row<2;row++)for(let col=0;col<2;col++){const c=visualCanvas(side,side),q=c.getContext('2d');q.drawImage(img,col*side,row*side,side,side,0,0,side,side);const data=q.getImageData(0,0,side,side).data;let x0=side,y0=side,x1=0,y1=0;for(let y=0;y<side;y++)for(let x=0;x<side;x++)if(data[(y*side+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}frames.push({c,x0,y0,x1,y1});}
 const common={x0:Math.min(frames[0].x0,frames[1].x0),y0:Math.min(frames[0].y0,frames[1].y0),x1:Math.max(frames[0].x1,frames[1].x1),y1:Math.max(frames[0].y1,frames[1].y1)};
 const cut=(f,b)=>{const w=b.x1-b.x0+1,h=b.y1-b.y0+1,scale=Math.min(1,480/Math.max(w,h)),c=visualCanvas(Math.round(w*scale),Math.round(h*scale));c.getContext('2d').drawImage(f.c,b.x0,b.y0,w,h,0,0,c.width,c.height);return c;};
 SIEGE.art={closed:cut(frames[0],common),open:cut(frames[1],common),missile:cut(frames[2],frames[2]),cannon:cut(frames[3],frames[3])};IMG.cg_siegeOpen=SIEGE.art.open;return SIEGE.art;
}
function siegeHatch(cx,cy){
 if(!S.base||S.stage<4)return;const a=S.siege?.attack,o=siegeOrigin(),art=siegeArt();if(!art)return;const t=a?.t||0,end=a?.kind==='orbital'?SIEGE_ORBITAL.endAt:a?.kind==='laser'?SIEGE_LASER.endAt:950+Math.min(10,5+Math.floor(S.stage/12))*230,open=a?Math.min(1,t/500,Math.max(0,end-t)/350):0;
 const b=S.base,left=b.x-cx-b.w/2,top=b.y-cy-b.h/2,dw=b.w*.22,dh=b.h*.54,dy=b.h*.145,dx=b.w*.28,iw=art.closed.width,ih=art.closed.height;
 ctx.save();ctx.beginPath();ctx.rect(left+dx,top+dy,dw*2,dh);ctx.clip();
 for(let side=0;side<2;side++){ctx.drawImage(art.closed,iw*(.28+side*.22),ih*.145,iw*.22,ih*.54,left+dx+side*dw+(side?1:-1)*open*dw,top+dy,dw,dh);}ctx.restore();
 if(open>.1){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=open*.35;ctx.fillStyle=a?.kind==='laser'?'#ffa45d':'#f96329';for(const [ox,oy]of [[0,-5],[-17,20],[17,20]]){ctx.beginPath();ctx.ellipse(o.x-cx+ox,o.y-cy+oy,8,4,0,0,6.283);ctx.fill();}ctx.restore();}
 if(a?.kind==='laser'){
  const rise=Math.min(1,t/600,Math.max(0,SIEGE_LASER.endAt-t)/300),charge=evoClamp((t-500)/(SIEGE_LASER.fireAt-500),0,1),w=96,h=w*art.cannon.height/art.cannon.width;
  ctx.save();ctx.translate(o.x-cx,o.y-cy-rise*15);ctx.rotate(a.angle);ctx.scale(.62+.38*rise,.62+.38*rise);ctx.globalAlpha=Math.min(1,rise*2);ctx.drawImage(art.cannon,-w*.31,-h/2,w,h);
  if(t<SIEGE_LASER.fireAt+SIEGE_LASER.fireMs){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(.25+charge*.55)*rise;ctx.fillStyle='#ff7b33';ctx.beginPath();ctx.ellipse(66,0,4+charge*6,5+charge*8,0,0,6.283);ctx.fill();ctx.fillStyle='#fff4cf';ctx.beginPath();ctx.ellipse(66,0,2+charge*2,3+charge*4,0,0,6.283);ctx.fill();}
  ctx.restore();
 }
}
function siegeRocket(x,y,angle,length,alpha,t){
 const art=siegeArt();if(!art)return;const w=length*art.missile.width/art.missile.height;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);ctx.globalAlpha=alpha;
 const flame=length*(.55+.09*Math.sin(t*.071)),g=ctx.createLinearGradient(0,length*.3,0,length*.5+flame);g.addColorStop(0,'#fff6bb');g.addColorStop(.20,'#ffc65f');g.addColorStop(.55,'#fa6427aa');g.addColorStop(1,'#fa3c0000');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-w*.16,length*.35);ctx.quadraticCurveTo(-w*.33,length*.7,0,length*.5+flame);ctx.quadraticCurveTo(w*.33,length*.7,w*.16,length*.35);ctx.closePath();ctx.fill();ctx.drawImage(art.missile,-w/2,-length/2,w,length);ctx.restore();
}
const siegeTurretDraw=cgDrawTurrets;
cgDrawTurrets=function(cx,cy){siegeHatch(cx,cy);siegeTurretDraw(cx,cy);};
function siegeDrawGround(cx,cy){
 const s=S.siege,a=s?.attack;if(!s||!S.base)return;ctx.save();
 if(a?.kind==='orbital')for(const p of a.targets){if(p.hit||a.t<p.warningAt)continue;const x=p.x-cx,y=p.y-cy,progress=evoClamp((a.t-p.warningAt)/SIEGE_ORBITAL.warningMs,0,1),pulse=.55+.25*Math.sin(a.t*.038);
  ctx.fillStyle='rgba(255,71,38,.10)';ctx.beginPath();ctx.arc(x,y,p.r,0,6.283);ctx.fill();ctx.strokeStyle='#ff865c';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.beginPath();ctx.arc(x,y,p.r,0,6.283);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#ffe2a6';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,p.r+5,-Math.PI/2,-Math.PI/2+progress*6.283);ctx.stroke();ctx.globalAlpha=pulse;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-16,y);ctx.lineTo(x+16,y);ctx.moveTo(x,y-16);ctx.lineTo(x,y+16);ctx.stroke();ctx.globalAlpha=1;ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff0cd';ctx.fillText(((p.impact-a.t)/1000).toFixed(1),x,y-p.r-12);
 }
 if(a?.kind==='laser'&&a.t<SIEGE_LASER.fireAt+SIEGE_LASER.fireMs){const o=siegeOrigin(),x=o.x-cx,y=o.y-cy-15,c=Math.cos(a.angle),sn=Math.sin(a.angle),L=SIEGE_LASER;
  ctx.save();
  if(a.t<L.fireAt){
   const lo=a.center-L.halfArc,hi=a.center+L.halfArc;
   ctx.fillStyle='#ff77400a';ctx.beginPath();ctx.arc(x,y,L.far,lo,hi);ctx.arc(x,y,L.near,hi,lo,true);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffb47a80';ctx.lineWidth=1;ctx.setLineDash([6,10]);
   for(const angle of [lo,hi]){ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*L.near,y+Math.sin(angle)*L.near);ctx.lineTo(x+Math.cos(angle)*L.far,y+Math.sin(angle)*L.far);ctx.stroke();}ctx.setLineDash([]);
   // Moving chevrons announce the actual traversal direction without hiding targets.
   ctx.strokeStyle='#ffdcac';ctx.lineWidth=2;for(let i=0;i<3;i++){const f=(a.t/1700+i/3)%1,angle=a.center+a.sweepDir*L.halfArc*(f*2-1),r=230;ctx.save();ctx.translate(x+Math.cos(angle)*r,y+Math.sin(angle)*r);ctx.rotate(angle+a.sweepDir*Math.PI/2);ctx.beginPath();ctx.moveTo(-6,-5);ctx.lineTo(0,0);ctx.lineTo(-6,5);ctx.stroke();ctx.restore();}
  }
  ctx.beginPath();ctx.moveTo(x+c*L.near,y+sn*L.near);ctx.lineTo(x+c*L.far,y+sn*L.far);ctx.lineWidth=L.halfWidth*2;ctx.strokeStyle=a.t<L.fireAt?'#ff705727':'#ff653a44';ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle='#ffbd86';ctx.setLineDash(a.t<L.fireAt?[10,9]:[]);ctx.stroke();ctx.restore();
 }
 for(const b of s.blasts){const f=b.t/SIEGE_ORBITAL.blastMs,x=b.x-cx,y=b.y-cy;
  ctx.globalAlpha=Math.min(1,b.t/90)*(1-f)*.62;ctx.drawImage(visualDecalArt(Math.floor(b.seed*8)),x-b.r,y-b.r*.66,b.r*2,b.r*1.32);
  for(let i=0;i<2;i++){const t=(b.t-i*85)/650;if(t<0||t>1)continue;const radius=b.r*(.14+(1-(1-t)**2)*1.36);ctx.globalAlpha=(1-t)*(.72-i*.16);ctx.strokeStyle=i?'#e5863d':'#ffe4ac';ctx.lineWidth=(1-t)*(5-i*2)+.5;ctx.beginPath();ctx.ellipse(x,y,radius,radius*.66,0,0,6.283);ctx.stroke();}
  ctx.globalAlpha=1;
 }
 ctx.restore();
}
const siegeHazards=drawHazards;
drawHazards=function(cx,cy){siegeHazards(cx,cy);siegeDrawGround(cx,cy);};
function siegeDrawAir(cx,cy){
 const s=S.siege,a=s?.attack;if(!s||!S.base)return;const o=siegeOrigin();
 if(a?.kind==='orbital'){
  for(let i=0;i<3;i++){const t=a.t-(550+i*280);if(t<0||t>850)continue;const f=t/850,slot=[[0,-5],[-17,20],[17,20]][i],xx=o.x-cx+slot[0],yy=o.y-cy+slot[1]-f*f*480;drawVisualPuff(xx,o.y-cy+slot[1]+12,18+f*23,(1-f)*.45,'smoke',i);siegeRocket(xx,yy,-Math.PI/2,68,Math.min(1,(1-f)*4),t);}
  for(const p of a.targets){const t=a.t-(p.impact-SIEGE_ORBITAL.fallMs);if(t<0||p.hit)continue;const f=t/SIEGE_ORBITAL.fallMs;siegeRocket(p.x-cx,p.y-cy-(1-f*f)*520,Math.PI/2,80,1,t);}
 }
 if(siegeLaserLive(a)){const x=o.x-cx,y=o.y-cy-15,c=Math.cos(a.angle),sn=Math.sin(a.angle),fade=Math.min(1,(a.t-SIEGE_LASER.fireAt)/60,(SIEGE_LASER.fireAt+SIEGE_LASER.fireMs-a.t)/100);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=fade;
  for(const [width,color]of [[30,'#fc532132'],[19,'#ff773858'],[10,'#ffca73'],[4,'#ffffeb']]){ctx.lineWidth=width;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x+c*66,y+sn*66);ctx.lineTo(x+c*1000,y+sn*1000);ctx.stroke();}
  ctx.restore();
 }
 for(const b of s.blasts)siegeDrawBlast(b,cx,cy);
}
function siegeDrawBlast(b,cx,cy){
 const x=b.x-cx,y=b.y-cy;if(x<-220||y<-220||x>W+220||y>H+220)return;
 const t=b.t/1000,f=b.t/SIEGE_ORBITAL.blastMs,seed=b.seed*6.283,grow=1-Math.exp(-t*13);
 // Authored fire/smoke artwork grows and crossfades into rolling smoke. The
 // cached textures retain the same illustrated detail as the units/buildings.
 const blend=evoClamp((t-.08)/.28,0,1),fade=Math.max(0,1-t/.88);
 if(fade>0)for(let j=0;j<2;j++){const img=IMG[j?'ill_blast1':'ill_blast0'];if(!img)continue;
  const radius=b.r*(.18+grow*(j?1.15:.99));ctx.save();ctx.translate(x,y-t*32);ctx.rotate(seed*.12+(j?-.08:.08));ctx.globalAlpha=fade*(j?blend:1-blend*.9);ctx.drawImage(img,-radius,-radius,radius*2,radius*2);ctx.restore();
 }
 const smoke=Math.sin(evoClamp((t-.16)/1.44,0,1)*Math.PI)*.44;
 if(smoke>0)for(let j=0;j<4;j++){const a=j*2.399+seed;drawVisualPuff(x+Math.cos(a)*b.r*.25,y+Math.sin(a)*b.r*.13-t*(33+j*6),b.r*(.24+f*.38),smoke,'smoke',a+t*.2);}
 ctx.save();ctx.globalCompositeOperation='lighter';
 if(t<.10)drawVisualPuff(x,y,b.r*(.12+grow*.26),(1-t/.10)*.8,'fire',seed);
 // A dozen bounded, ballistic embers. Stable seeds keep render frames from
 // consuming gameplay RNG, and the short trails avoid a particle allocation spike.
 for(let j=0;j<12;j++){const life=.45+(j%4)*.16;if(t>life)continue;const a=j*2.399+seed,velocity=b.r*(1.3+(j%3)*.35),vx=Math.cos(a)*velocity,vy=Math.sin(a)*velocity*.52-45;
  const trail=Math.max(0,t-.035),px=x+vx*t,py=y+vy*t+95*t*t,tx=x+vx*trail,ty=y+vy*trail+95*trail*trail;
  ctx.globalAlpha=(1-t/life)*.9;ctx.strokeStyle=j%3?'#ffc671':'#fff6c9';ctx.lineWidth=j%3===0?2:1.2;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(px,py);ctx.stroke();
 }
 ctx.restore();
}
const siegeFX=drawVisualFX;
drawVisualFX=function(cx,cy){siegeFX(cx,cy);siegeDrawAir(cx,cy);};
const siegeBulletDraw=drawVisualBullet;
drawVisualBullet=function(b,cx,cy,enemy){if(!b.siegeRocket)return siegeBulletDraw(b,cx,cy,enemy);if(S.relClearIn||S.rewardSettled)return;const x=b.x-cx,y=b.y-cy;if(x<-65||y<-65||x>W+65||y>H+65)return;siegeRocket(x,y,Math.atan2(b.vy,b.vx),31,1,S.relTime);};

function siegeSoundBank(kind){
 if(SIEGE.audioContext!==actx){SIEGE.audioContext=actx;SIEGE.buffers.clear();}if(SIEGE.buffers.has(kind))return SIEGE.buffers.get(kind);
 const sr=22050,dur={charge:SIEGE_LASER.fireAt/1000,beam:SIEGE_LASER.fireMs/1000,launch:.48,impact:.85,mark:.10,hatch:.42}[kind],buf=actx.createBuffer(1,Math.ceil(sr*dur),sr),d=buf.getChannelData(0),rand=orchestraNoise(983+kind.length*87);let phase=0,lo=0,mid=0;
 for(let i=0;i<d.length;i++){const t=i/sr,n=rand();lo=.96*lo+.04*n;mid=.7*mid+.3*n;let v=0;
  if(kind==='charge'){phase+=6.283*(85+360*(t/dur)**1.5)/sr;v=(Math.sin(phase)+.22*Math.sin(phase*2))*.30*(.3+t/dur);}
  else if(kind==='beam'){phase+=6.283*(220+70*Math.sin(t/dur*Math.PI)+5*Math.sin(t*24))/sr;v=.30*Math.sin(phase)+.12*Math.sin(phase*2)+.055*Math.sin(phase*4)+(mid-lo)*.15;}
  else if(kind==='launch')v=.65*(mid-lo)*Math.exp(-t*6)+.27*Math.sin(6.283*(80*t+.7*(1-Math.exp(-t*38))))*Math.exp(-t*15);
  else if(kind==='impact')v=.55*mid*Math.exp(-t*7)+.45*Math.sin(6.283*(43*t+.6*(1-Math.exp(-t*27))))*Math.exp(-t*6);
  else if(kind==='mark')v=.32*Math.sin(6.283*1080*t)*Math.exp(-t*22);
  else v=.48*(mid-lo)*Math.exp(-t*9)+.19*Math.sin(6.283*210*t)*Math.exp(-t*18);
  d[i]=v*Math.min(1,t*150)*Math.min(1,(dur-t)*40);
 }SIEGE.buffers.set(kind,buf);return buf;
}
function siegeAudio(kind,offset=0){
 if(!actx||!soundOn||CG.muted||document.hidden||mode!=='play'||SIEGE.voices.size>=SIEGE.maxVoices)return;
 const src=actx.createBufferSource(),g=actx.createGain(),pan=kind==='beam'?actx.createStereoPanner():null;src.buffer=siegeSoundBank(kind);if(offset>=src.buffer.duration)return;g.gain.value=kind==='mark'?.20:kind==='impact'?.48:.32;src.connect(g);if(pan){g.connect(pan);pan.connect(BUS_SFX);}else g.connect(BUS_SFX);const h={src,g,pan,kind};SIEGE.voices.add(h);src.onended=()=>{SIEGE.voices.delete(h);src.disconnect();g.disconnect();pan?.disconnect();};src.start(0,offset);return h;
}
function siegeSyncBeamAudio(a){const voices=[...SIEGE.voices].filter(h=>h.kind==='beam');if(!siegeLaserLive(a)){for(const h of voices){try{h.src.stop();}catch{}SIEGE.voices.delete(h);}return;}const h=voices[0]||siegeAudio('beam',(a.t-SIEGE_LASER.fireAt)/1000);h?.pan?.pan.setTargetAtTime(Math.cos(a.angle)*.65,actx.currentTime,.03);}
function siegeStopAudio(){for(const h of SIEGE.voices){try{h.src.stop();}catch{}h.src.disconnect();h.g.disconnect();h.pan?.disconnect();}SIEGE.voices.clear();}
const siegePause=setPaused;setPaused=function(on){if(on)siegeStopAudio();return siegePause(on);};
const siegeSoundToggle=setBattleSound;setBattleSound=function(on){if(!on)siegeStopAudio();return siegeSoundToggle(on);};
const siegeAudioPolicy=cgApplyAudioPolicy;cgApplyAudioPolicy=function(){siegeAudioPolicy();if(CG.muted||document.hidden)siegeStopAudio();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)siegeStopAudio();});
const siegeWarm=visualWarmArt;visualWarmArt=async function(){await siegeWarm();siegeArt();};

/* Enemy density must not multiply repairs without limit. Use stage-scaled
 * supply odds and keep capped/unused rolls empty instead of rerolling them. */
function evoSupplyConfig(stage=S.stage){
 return stage<=3?{chance:.24,gap:1000,supportGap:10000,healGap:14000,heal:55,repairWeight:28,shieldWeight:10}
  :stage<=9?{chance:.20,gap:1500,supportGap:16000,healGap:18000,heal:50,repairWeight:22,shieldWeight:8}
  :stage<=19?{chance:.17,gap:2000,supportGap:22000,healGap:20000,heal:45,repairWeight:20,shieldWeight:6}
  :{chance:stage<40?.145:.12,gap:2000,supportGap:26000,healGap:22000,heal:40,repairWeight:18,shieldWeight:5};
}
function evoHealAmount(stage){return evoSupplyConfig(stage).heal;}
function evoFreshSupply(){return{lastDrop:-Infinity,lastSupport:-Infinity,lastHeal:-Infinity,lowSince:null,lowKills:0};}
function evoSupplyState(){return S.evoSupply||(S.evoSupply=evoFreshSupply());}
const evoSupplyStage=startStage;
startStage=function(n){evoSupplyStage(n);S.evoSupply=evoFreshSupply();};
function evoSupplyWeight(d){const c=evoSupplyConfig();return d.key==='HEAL'?c.repairWeight*(S.hp<maxHp()*.40?1.8:1):d.key==='SHLD'?c.shieldWeight:d.weight;}
function evoSupplyUseful(d){
 if(!basicItemUseful(d))return false;
 // Include items still on the ground in caps, so a burst cannot produce
 // several of the last upgrade or leave spare shields waiting beside a boss.
 const pending=S.items.filter(i=>i.k===d.key).length;
 if(d.field&&(S[d.field]||0)+pending>=d.cap)return false;
 if(ELEMENTS.includes(d.key)&&(S.elemStack[d.key]||0)>=3&&S.element===d.key)return false;
 if(d.key==='HEAL'||d.key==='SHLD'){
  const state=evoSupplyState(),c=evoSupplyConfig();
  if(pending||S.relTime-(d.key==='HEAL'?state.lastHeal:state.lastSupport)<(d.key==='HEAL'?c.healGap:c.supportGap))return false;
  if(d.key==='HEAL'&&S.hp>=maxHp()*.85)return false;
 }
 return true;
}
basicDropItem=function(){
 const pool=BASIC_CONTENT.items.filter(d=>d.stage<=S.stage);
 let roll=Math.random()*pool.reduce((sum,d)=>sum+evoSupplyWeight(d),0);
 for(const d of pool){roll-=evoSupplyWeight(d);if(roll<0)return evoSupplyUseful(d)?d.key:null;}
 return null;
};
function evoDropSupply(e){
 if(!S||mode!=='play'||S.relClearIn||S.rewardSettled||S.items.length>=6)return;
 const state=evoSupplyState(),c=evoSupplyConfig();
 if(S.hp<maxHp()*.35){if(state.lowSince===null)state.lowSince=S.relTime;state.lowKills++;}
 else{state.lowSince=null;state.lowKills=0;}
 if(S.relTime-state.lastDrop<c.gap)return;
 // A sustained low-hull battle can earn one repair after 24 seconds and six
 // kills. It still obeys the repair cooldown and one-repair-on-ground rule.
 const relief=state.lowSince!==null&&S.relTime-state.lowSince>=24000&&state.lowKills>=6&&evoSupplyUseful(BASIC_ITEM_MAP.HEAL);
 if(!relief&&Math.random()>=c.chance+(e.elite?.04:0))return;
 const k=relief?'HEAL':basicDropItem();if(!k)return;
 S.items.push({k,x:e.x,y:e.y,t:0});state.lastDrop=S.relTime;
 if(k==='SHLD')state.lastSupport=S.relTime;
 if(k==='HEAL'){state.lastHeal=S.relTime;state.lowSince=null;state.lowKills=0;}
}
// Description uses the same stage bands as the actual repair calculation.
BASIC_ITEM_MAP.HEAL.ko='체력 +55(1~3) / +50(4~9) / +45(10~19) / +40(20부터) · 낮은 체력에서는 회복 보급 우선';
BASIC_ITEM_MAP.HEAL.en='Repairs 55 hull (1–3), 50 (4–9), 45 (10–19), or 40 (20+) · repair priority at low hull';
const evoSupplyPickup=pickup;
pickup=function(k,src){
 const d=BASIC_ITEM_MAP[k];if(!d)return;
 const capped=d.field&&(S[d.field]||0)>=d.cap;
 const redundant=capped||k==='SHLD'&&S.shield||ELEMENTS.includes(k)&&S.element===k&&(S.elemStack[k]||0)>=3;
 if(redundant){relToast(basicText('이미 최대 강화된 아이템입니다','This upgrade is already at its limit'),'This upgrade is already at its limit','item');return;}
 return evoSupplyPickup(k,src);
};

/* Explicit run choices: retry the sector checkpoint or confirm a fresh run.
 * Records, settings and other editions are never erased by a fresh sortie. */
function evoConfirmNewRun(){
 let d=$('evoNewRunDialog');
 if(!d){
  d=basicNode('dialog',null,'evo-run-dialog');d.id='evoNewRunDialog';
  d.setAttribute('aria-labelledby','evoNewRunTitle');d.setAttribute('aria-describedby','evoNewRunText');
  const title=basicNode('h2');title.id='evoNewRunTitle';const copy=basicNode('p');copy.id='evoNewRunText';
  const actions=basicNode('div',null,'evo-run-actions'),cancel=basicButton('',()=>d.close(),'btn'),confirm=basicButton('',()=>{
   d.close();delete META.relaunchRun;metaSave();EVO.waiting=false;basicPlay();clearBattleInput();
  },'btn evo-run-confirm');cancel.id='evoNewRunCancel';confirm.id='evoNewRunConfirm';
  actions.append(cancel,confirm);d.append(title,copy,actions);document.body.append(d);
 }
 $('evoNewRunTitle').textContent=basicText('새출발','NEW SORTIE');
 $('evoNewRunText').textContent=basicText('현재 출격이 리셋되고 처음부터 다시 시작합니다. 다시 시작하시겠습니까? 최고 기록과 설정은 유지됩니다.','Your current run will reset and restart from sector 1. Start again? Your best records and settings are kept.');
 $('evoNewRunCancel').textContent=basicText('취소','Cancel');$('evoNewRunConfirm').textContent=basicText('새출발 · 확인','Confirm new sortie');
 if(!d.open)d.showModal();$('evoNewRunCancel').focus({preventScroll:true});
}
const evoRunOver=gameOver;
gameOver=function(){
 evoRunOver();$('btRetry').textContent=basicText('이어서 출발','CONTINUE');$('btMenu').textContent=basicText('새출발','NEW SORTIE');
 $('btRetry').onclick=()=>{if(mode!=='over')return;EVO.waiting=false;relContinue();show(null);clearBattleInput();};
 $('btMenu').onclick=()=>{if(mode==='over')evoConfirmNewRun();};
};

/* A still cinematic plate with localized atmosphere. This renderer has its own
 * presentation clock and never touches combat entities, gameplay RNG or saves. */
const EVO_MENU={canvas:null,background:null,images:{},rigs:{},time:0,last:0,drawn:false,frames:0};
const EVO_MENU_RIG={
 portrait:{width:941,height:1672,
  radar:{box:[380,551,388,112],top:[[392,587],[493,550],[650,563],[753,603]],bottom:[[753,650],[638,615],[502,608],[392,638]]},
  missiles:[
   {nozzle:[244,197],back:[-9,-34],width:13,length:38,path:[[244,197],[233,159],[219,116]],smoke:19,rate:.48},
   {nozzle:[517,261],back:[-28,-42],width:28,length:67,path:[[517,261],[488,218],[448,174],[408,136]],smoke:32,rate:.35},
   {nozzle:[816,350],back:[-38,-58],width:64,length:108,path:[[816,350],[779,285],[712,229],[647,183],[580,140]],smoke:77,rate:.24,smoothExhaust:true}],
  dust:[{x:70,y:918,dx:-61,dy:-26,size:61},{x:351,y:942,dx:64,dy:-29,size:62},{x:306,y:891,dx:-74,dy:-36,size:67},{x:764,y:917,dx:72,dy:-49,size:87},{x:595,y:949,dx:-33,dy:20,size:80}],
  wash:[{from:[610,468],to:[554,563],width:25},{from:[838,532],to:[792,642],width:28}],
  fires:[{x:908,y:913,rx:30,ry:91},{x:926,y:753,rx:25,ry:72},{x:341,y:492,rx:26,ry:34}],
  smoke:[{x:897,y:955,size:120,rise:260,wind:32,speed:.18},{x:925,y:767,size:93,rise:166,wind:-23,speed:.21},{x:338,y:498,size:48,rise:102,wind:-18,speed:.24}]},
 landscape:{width:1672,height:941,
  radar:{box:[732,330,390,116],top:[[743,368],[842,328],[1015,334],[1109,384]],bottom:[[1109,436],[1002,400],[854,394],[743,421]]},
  missiles:[
   {nozzle:[468,136],back:[-27,-23],width:12,length:27,path:[[468,136],[432,113],[395,97]],smoke:19,rate:.5},
   {nozzle:[748,265],back:[-40,-35],width:35,length:69,path:[[748,265],[701,226],[637,174],[571,122]],smoke:42,rate:.34},
   {nozzle:[976,169],back:[-72,13],width:72,length:133,path:[[976,169],[925,150],[875,182],[820,186],[758,145]],smoke:83,rate:.24,smoothExhaust:true}],
  dust:[{x:202,y:712,dx:-69,dy:-28,size:72},{x:539,y:740,dx:80,dy:-28,size:76},{x:618,y:689,dx:-84,dy:-35,size:82},{x:1133,y:728,dx:89,dy:-56,size:99},{x:859,y:736,dx:-41,dy:16,size:96}],
  wash:[{from:[1223,363],to:[1169,483],width:31},{from:[1530,437],to:[1473,564],width:34}],
  fires:[{x:76,y:447,rx:52,ry:87},{x:149,y:543,rx:58,ry:93},{x:1251,y:572,rx:29,ry:74},{x:676,y:414,rx:30,ry:40}],
  smoke:[{x:79,y:513,size:138,rise:235,wind:37,speed:.19},{x:157,y:565,size:104,rise:195,wind:38,speed:.23},{x:1267,y:586,size:111,rise:127,wind:39,speed:.22},{x:675,y:423,size:51,rise:92,wind:21,speed:.25}]}
};
function evoMenuNoise(x,y){
 const hash=(a,b)=>{let n=Math.imul(a,374761393)+Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=hash(ix,iy),b=hash(ix+1,iy),d=hash(ix,iy+1),e=hash(ix+1,iy+1);return(a+(b-a)*u)*(1-v)+(d+(e-d)*u)*v;
}
function evoMenuFireTexture(im,r){
 // Exposure modulation only: hot pixels remain at their original coordinates.
 // No cutout scaling, displaced scenery, duplicate debris, or unit deformation.
 const tex=document.createElement('canvas');tex.width=r.rx*2;tex.height=r.ry*2;const c=tex.getContext('2d');c.drawImage(im,r.x-r.rx,r.y-r.ry,r.rx*2,r.ry*2,0,0,tex.width,tex.height);
 const frame=c.getImageData(0,0,tex.width,tex.height),p=frame.data;
 for(let y=0;y<tex.height;y++)for(let x=0;x<tex.width;x++){const k=(y*tex.width+x)*4,edge=Math.max(0,1-Math.pow(Math.hypot((x-r.rx)/r.rx,(y-r.ry)/r.ry),2)),heat=Math.max(0,Math.min(1,(p[k]-145)/90))*Math.max(0,Math.min(1,(p[k]-p[k+2]-18)/85));p[k+3]=Math.round(p[k+3]*heat*edge);}
 c.putImageData(frame,0,0);return tex;
}
function evoMenuSmokeTexture(seed,tint='smoke'){
 const tex=document.createElement('canvas');tex.width=tex.height=128;const c=tex.getContext('2d'),frame=c.createImageData(128,128),p=frame.data;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const nx=x/128,ny=y/128;let n=0,weight=.55,freq=3;
  for(let octave=0;octave<4;octave++){n+=evoMenuNoise(nx*freq+seed*11,ny*freq+seed*17)*weight;freq*=2;weight*=.5;}
  const radial=Math.max(0,1-Math.hypot((nx-.5)*2,(ny-.5)*2)),density=Math.max(0,n-.10)*Math.pow(radial,.7),k=(y*128+x)*4;
  const rgb=tint==='dust'?[115+n*72,103+n*65,85+n*58]:tint==='vapor'?[137+n*89,161+n*76,173+n*69]:[48+n*65,54+n*67,59+n*67];
  p[k]=rgb[0];p[k+1]=rgb[1];p[k+2]=rgb[2];p[k+3]=Math.min(225,density*690);
 }c.putImageData(frame,0,0);return tex;
}
function evoMenuFlameFrames(){
 // Looping advected turbulence supplies visible flame motion without moving
 // any pixels from the photographic plate. All frames are cached once.
 const frames=[],w=64,h=128,smooth=(a,b,v)=>{const k=Math.max(0,Math.min(1,(v-a)/(b-a)));return k*k*(3-2*k);};
 for(let f=0;f<48;f++){
  const tex=document.createElement('canvas');tex.width=w;tex.height=h;const c=tex.getContext('2d'),frame=c.createImageData(w,h),p=frame.data,phase=f/48;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const v=1-y/(h-1),u=x/(w-1)*2-1,angle=(v*1.15-phase)*Math.PI*2;
   const n=evoMenuNoise(u*3+11,Math.sin(angle)*2.1+17)*.64+evoMenuNoise(u*7+29,Math.cos(angle)*3.3+43)*.36;
   const bend=Math.sin(angle+v*3)*v*.22,shape=(1-v)*.91-Math.abs(u+bend),density=shape+(n-.44)*.77;
   const a=smooth(.015,.30,density)*smooth(0,.11,y/h)*smooth(0,.13,1-y/h),hot=Math.max(0,Math.min(1,density*1.4+(1-v)*.18)),k=(y*w+x)*4;
   p[k]=255;p[k+1]=65+hot*185;p[k+2]=10+Math.pow(hot,3)*187;p[k+3]=Math.round(a*230);
  }c.putImageData(frame,0,0);frames.push(tex);
 }return frames;
}
function evoMenuCanvas(){
 const m=EVO_MENU;if(m.canvas)return m.canvas;
 const c=document.createElement('canvas');c.id='evoMenuScene';c.setAttribute('aria-hidden','true');$('mstage').prepend(c);m.canvas=c;
 const title=basicNode('div',null,'evo-menu-title'),logo=new Image();logo.alt='FIELD OF IMMORTALS';logo.draggable=false;logo.src=ART.evo_menu_logo;title.append(logo);$('mstage').append(title);
 const emblem=document.createElementNS('http://www.w3.org/2000/svg','svg');emblem.setAttribute('viewBox','0 0 64 64');emblem.setAttribute('aria-hidden','true');emblem.classList.add('evo-deploy-emblem');emblem.innerHTML='<path d="M32 3 58 18v28L32 61 6 46V18Z"/><circle cx="32" cy="32" r="15"/><circle cx="32" cy="32" r="6"/><path d="M32 9v13m0 20v13M9 32h13m20 0h13"/>';$('btStory').append(emblem);
 for(const key of ['portrait','landscape']){
  const im=new Image();m.images[key]=im;
  im.onload=()=>{const source=EVO_MENU_RIG[key];m.rigs[key]={...source,radar:evoMenuRadarMask(im,source.radar),fires:source.fires.map(r=>({...r,tex:evoMenuFireTexture(im,r)}))};m.drawn=false;m.last=0;};im.src=ART['evo_menu_'+key];
 }
 m.smoke=[evoMenuSmokeTexture(1),evoMenuSmokeTexture(2),evoMenuSmokeTexture(3)];
 m.dust=[evoMenuSmokeTexture(4,'dust'),evoMenuSmokeTexture(5,'dust'),evoMenuSmokeTexture(6,'dust')];
 m.vapor=[evoMenuSmokeTexture(7,'vapor'),evoMenuSmokeTexture(8,'vapor'),evoMenuSmokeTexture(9,'vapor')];
 m.flames=evoMenuFlameFrames();
 return c;
}
function evoMenuRadarMask(im,r){
 const [x,y,w,h]=r.box,mask=document.createElement('canvas'),layer=document.createElement('canvas');mask.width=layer.width=w;mask.height=layer.height=h;
 const c=mask.getContext('2d');c.save();c.translate(-x,-y);c.beginPath();c.moveTo(...r.top[0]);c.bezierCurveTo(...r.top.slice(1).flat());c.lineTo(...r.bottom[0]);c.bezierCurveTo(...r.bottom.slice(1).flat());c.closePath();c.clip();c.drawImage(im,0,0);c.restore();
 const frame=c.getImageData(0,0,w,h),p=frame.data;
 // The fitted curved aperture and cyan-pixel mask exclude the metal rim,
 // support arms and scenery. No rectangular beam can spill outside the glass.
 for(let i=0;i<p.length;i+=4){const cyan=Math.max(0,Math.min(1,(Math.min(p[i+1],p[i+2])-p[i]-12)/60));p[i+3]*=cyan;p[i]=109;p[i+1]=222;p[i+2]=247;}
 c.putImageData(frame,0,0);return{...r,mask,layer};
}
function evoMenuRadar(c,r,t){
 const a=r.radar,[x,y,w,h]=a.box,q=a.layer.getContext('2d'),scan=w*(.5-.5*Math.cos(t*1.08)),width=37;
 q.clearRect(0,0,w,h);q.globalCompositeOperation='source-over';
 const g=q.createLinearGradient(scan-width,0,scan+width,0);g.addColorStop(0,'#79eaff00');g.addColorStop(.5,'#79eaff52');g.addColorStop(1,'#79eaff00');q.fillStyle=g;q.fillRect(0,0,w,h);
 q.globalCompositeOperation='destination-in';q.drawImage(a.mask,0,0);q.globalCompositeOperation='source-over';
 c.save();c.globalCompositeOperation='screen';c.drawImage(a.layer,x,y);c.restore();
}
function evoMenuPath(points,u){
 const segments=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),total=segments.reduce((a,b)=>a+b,0);let d=u*total;
 for(let i=0;i<segments.length;i++){if(d<=segments[i]||i===segments.length-1){const f=d/segments[i],a=points[i],b=points[i+1];return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}d-=segments[i];}return points[0];
}
function evoMenuSmoothExhaust(t,offset){
 const m=EVO_MENU;
 if(!m.exhaustBlend){m.exhaustBlend=document.createElement('canvas');m.exhaustBlend.width=m.flames[0].width;m.exhaustBlend.height=m.flames[0].height;}
 const c=m.exhaustBlend.getContext('2d'),phase=(t*24+offset)%m.flames.length,index=Math.floor(phase),mix=phase-index;
 c.clearRect(0,0,m.exhaustBlend.width,m.exhaustBlend.height);
 // Interpolate premultiplied pixels, including the last-to-first transition.
 // This avoids frame skipping on the large foreground flame without bright
 // pulses from drawing two translucent frames over one another.
 c.globalCompositeOperation='source-over';c.globalAlpha=1-mix;c.drawImage(m.flames[index],0,0);
 c.globalCompositeOperation='lighter';c.globalAlpha=mix;c.drawImage(m.flames[(index+1)%m.flames.length],0,0);
 c.globalCompositeOperation='source-over';c.globalAlpha=1;return m.exhaustBlend;
}
function evoMenuMissiles(c,r,t){
 const m=EVO_MENU;
 r.missiles.forEach((s,i)=>{
  // Exhaust points backwards from each engine, opposite the missile nose.
  // Geometry stays fixed; only turbulence and vapor travel along its own trail.
  for(let j=0;j<9;j++){
   const u=(t*s.rate+j/9+i*.173)%1,[x,y]=evoMenuPath(s.path,u),size=s.smoke*(1.1-u*.54),fade=Math.pow(Math.sin(u*Math.PI),.85);
   c.save();c.translate(x,y);c.rotate(i*.7+j*.4+u*.3);c.globalAlpha=fade*.38;c.drawImage(m.vapor[(j+i)%3],-size*.5,-size*.48,size,size*.96);c.restore();
  }
  const index=Math.floor(t*34+i*17)%m.flames.length,flutter=s.smoothExhaust?.985+.018*Math.sin(t*3.4+i)+.012*Math.sin(t*5.7+i*.7):.92+evoMenuNoise(t*12,i+11)*.17;
  const flame=s.smoothExhaust?evoMenuSmoothExhaust(t,i*17):m.flames[index];
  c.save();c.translate(...s.nozzle);c.rotate(Math.atan2(s.back[1],s.back[0])+Math.PI/2);c.globalCompositeOperation='screen';c.globalAlpha=.68;
  c.drawImage(flame,-s.width/2,-s.length*flutter,s.width,s.length*flutter);c.restore();
 });
}
function evoMenuUnitAtmosphere(c,r,t){
 const m=EVO_MENU;
 r.wash.forEach((s,i)=>{
  const dx=s.to[0]-s.from[0],dy=s.to[1]-s.from[1],length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)-Math.PI/2;
  for(let j=0;j<7;j++){
   const u=(t*.83+j/7+i*.3)%1,width=s.width*(.4+u*.95),x=s.from[0]+dx*u+Math.sin(u*7+j)*3,y=s.from[1]+dy*u;
   c.save();c.translate(x,y);c.rotate(angle);c.globalCompositeOperation='screen';c.globalAlpha=Math.sin(u*Math.PI)*.28;
   c.drawImage(m.vapor[(j+i)%3],-width/2,-length*.19,width,length*.38);c.restore();
  }
 });
 r.dust.forEach((s,i)=>{for(let j=0;j<7;j++){
  const u=(t*(.34+i*.019)+j/7+i*.113)%1,size=s.size*(.5+u),x=s.x+s.dx*u,y=s.y+s.dy*u+Math.sin(u*6+j)*4;
  c.save();c.translate(x,y);c.rotate(Math.sin(i+j)*.22+u*.12);c.globalAlpha=Math.pow(Math.sin(u*Math.PI),1.1)*.38;
  c.drawImage(m.dust[(i+j)%3],-size/2,-size*.30,size,size*.60);c.restore();
 }});
}
function evoMenuFireAndSmoke(c,r,t){
 const m=EVO_MENU;
 r.fires.forEach((f,i)=>{
  const heat=.16+.47*evoMenuNoise(t*2.1,i*3+4)+.16*evoMenuNoise(t*7.3,i*3+19);
  c.save();c.globalCompositeOperation='screen';c.globalAlpha=heat;c.drawImage(f.tex,f.x-f.rx,f.y-f.ry);c.restore();
  // Separate tongues originate inside the visible explosion, with different
  // heights and phases. They never deform vehicle parts or the rocky terrain.
  for(let j=0;j<3;j++){
   const index=Math.floor(t*(18+j*2)+i*13+j*17)%m.flames.length,fw=f.rx*(.80+j*.13),fh=f.ry*(1.52-j*.19),fx=f.x+(j-1)*f.rx*.42,base=f.y+f.ry*(.66-j*.12);
   c.save();c.globalAlpha=.62+heat*.21;c.drawImage(m.flames[index],fx-fw/2,base-fh,fw,fh);c.restore();
  }
  for(let j=0;j<12;j++){
   const a=(t*(.30+(j%3)*.046)+j*.083+i*.27)%1,wind=Math.sin(j*2.34+i),x=f.x+wind*f.rx*.70+a*(14+wind*22)+Math.sin(a*4+j)*4,y=f.y+f.ry*.22-a*f.ry*2.15,alpha=Math.sin(a*Math.PI)*.85;
   c.strokeStyle='rgba(255,197,115,'+alpha+')';c.lineWidth=1.2+(j%3)*.34;c.beginPath();c.moveTo(x,y);c.lineTo(x-1.1,y+3.2+j%3);c.stroke();
  }
 });
 // Asynchronous, feathered plumes rise from existing fire. The source plate,
 // camera, wheels and fan housings stay completely still.
 r.smoke.forEach((s,i)=>{for(let j=0;j<6;j++){
  const a=(t*s.speed+j/6+i*.137)%1,size=s.size*(.55+a*.93),x=s.x+a*s.wind+Math.sin(a*4.1+j)*s.size*.075,y=s.y-a*s.rise,fade=Math.sin(a*Math.PI);
  c.save();c.translate(x,y);c.rotate(Math.sin(j*2+i)*.45+a*.38);c.globalAlpha=Math.pow(fade,1.3)*.83;c.drawImage(m.smoke[(j+i)%3],-size/2,-size*.47,size,size*.94);c.restore();
 }});
}
function evoPaintMenu(now=performance.now()){
 const m=EVO_MENU;if(mode!=='menu'||document.hidden){m.last=0;m.drawn=false;return;}
 const canvas=evoMenuCanvas(),reduced=META.basicReduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5),pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(!w||!h)return;
 let resized=false;if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;resized=true;}
 if(reduced&&m.drawn&&!resized)return;if(!resized&&!reduced&&m.last&&now-m.last<1000/30-1)return;
 if(m.last&&!reduced)m.time+=Math.min(66,now-m.last);m.last=now;m.drawn=true;m.frames++;
 const c=canvas.getContext('2d'),t=m.time/1000,land=document.body.classList.contains('land'),key=land?'landscape':'portrait',im=m.images[key],rig=m.rigs[key];m.background=im;
 c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#061116';c.fillRect(0,0,w,h);
 if(im?.naturalWidth&&rig){
  // Tall phones retain the complete machine silhouettes. Only the empty road
  // below the subjects fills the extra height; machinery is never stretched.
  const scale=land?Math.max(w/im.width,h/im.height):w/im.width,x=land?(w-im.width*scale)/2:0,y=land?(h-im.height*scale)/2:0;
  if(!land&&h>im.height*scale){const split=Math.round(im.height*.61),edge=split*scale;c.drawImage(im,0,0,im.width,split,0,0,w,edge);c.drawImage(im,0,split,im.width,im.height-split,0,edge,w,h-edge);}
  else c.drawImage(im,x,y,im.width*scale,im.height*scale);
  c.save();c.translate(x,y);c.scale(scale,scale);evoMenuFireAndSmoke(c,rig,t);evoMenuMissiles(c,rig,t);evoMenuUnitAtmosphere(c,rig,t);evoMenuRadar(c,rig,t);c.restore();
 }
 const veil=c.createLinearGradient(0,0,0,h);veil.addColorStop(0,'#01090f44');veil.addColorStop(.18,'#01090f00');veil.addColorStop(.59,'#01090f00');veil.addColorStop(1,'#01090f66');c.fillStyle=veil;c.fillRect(0,0,w,h);
}
const evoMenuDraw=draw;
draw=function(){evoMenuDraw();evoPaintMenu();};
const evoCinematicMenu=basicMenu;
basicMenu=function(){evoCinematicMenu();if(!basicReady)return;const saved=relValidSave();$('txStoryD').textContent=saved?basicText('스테이지 ','Sector ')+META.relaunchRun.stage+basicText(' · 편대 준비 완료',' · Squad ready'):basicText('포획하고, 편대를 이끄세요','Capture. Build your squad.');};

Object.assign(ART,{"L_astra":"assets/c83aeb41ff4e7adc922dfa49.webp","L_nemesis":"assets/98f912f29a3e39dad143be0b.webp","i_summon":"assets/e81662b68cf80014d8653836.webp","velca_core":"assets/401dfef323beb23cbfc8a9be.webp","v_arc":"assets/ea803f391cc998df2b8995ce.webp","v_crawler":"assets/c915795094b89c3806af6a13.webp","v_oblivion":"assets/716685af855e86d4e231f366.webp","v_phantom":"assets/a933e3b05f504b0e0bec72e7.webp","v_revenant":"assets/7c847b9f177b0502589b2fa2.webp","v_eclipse":"assets/28f681b0081739c286c6eefd.webp","rel1":"assets/3732c5215e33374534773c41.webp","rel2":"assets/fde8144a8e042768d0c7ffea.webp","rel3":"assets/01a771983c55c4fa7c50e0b7.webp","rel4":"assets/0e6ad84d952d5460de994a86.webp","rel5":"assets/186a48b3b1103086dad4f494.webp","rel6":"assets/993d63b0d800122ce0ccac4b.webp","rel7":"assets/be6b07b86e5464a54d0f0ed8.webp","rel8":"assets/11e6423c83d1185748a10eb1.webp","rel9":"assets/81aaae0af08ddd8bbb0ad57b.webp","rel10":"assets/0cb44269831838f1ca343240.webp"});
/* Basic Launch progression: earned currency only, bounded permanent power,
 * idempotent rewards, and the v32 combat/presentation underneath. */
const PG={version:1,creating:false,resuming:false,route:null,drawBusy:false,screen:'menu',clock:0};
const PG_COST={unit:60,relic:100};
const PG_TRADE=[{ast:10,cred:250},{ast:50,cred:1350},{ast:100,cred:2800}];
const pgText=(ko,en)=>LANG==='ko'?ko:en;
const pgInt=(n,max=100000000)=>Math.max(0,Math.min(max,Math.floor(Number(n)||0)));
const pgID=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
EVO_LEGENDS.push(...HERO_KEYS);
EVO_GOLD_ART_KEYS.push(...HERO_KEYS);
HERO_RULES.bossHp=2600;HERO_RULES.bossArmor=.28;
GRADES.C.w=5000;GRADES.R.w=2800;GRADES.E.w=1400;GRADES.P.w=600;GRADES.L.w=200;
const PG_RELICS={
 r_core:[.25,1.5,'공격력','Weapon damage'],r_armor:[2,10,'피해 감소 %','Damage reduction %'],
 r_cool:[2,8,'발사 간격 감소 %','Fire interval reduction %'],r_thrust:[2,8,'이동 속도 %','Movement speed %'],
 r_scan:[2,10,'레이더 범위 %','Radar reach %'],r_tow:[2,8,'포획 효율 %','Capture efficiency %'],
 r_nano:[.04,.2,'초당 선체 회복','Hull repair / second'],r_link:[.02,.10,'아군 화력','Ally damage'],
 r_bay:[1,1,'일반 편대 슬롯','Regular squad slot'],r_mag:[1,1,'플레이어 탄환','Player shot lane']
};
for(const ra of Object.keys(RELIC_MAXLV))RELIC_MAXLV[ra]=12;
for(const [key,[v0,vmax]]of Object.entries(PG_RELICS))Object.assign(RELICS[key],{v0,vmax,st:1});
relicValAt=function(k,lv){if(!PG_RELICS[k]||lv<=0)return 0;const [a,b]=PG_RELICS[k];return Math.round((a+(b-a)*Math.min(1,(lv-1)/11))*100)/100;};
powerMul=function(kind,k){return VELCARION[k]?1:1+Math.min(.28,pgInt(recOf(kind,k).lv,20)*.025);};
rankWays=function(kind,k){return UNITS[k]?.ways||1;};
rankHoming=function(kind,k){return !!UNITS[k]?.homing;};
stepCred=function(kind,g,step){return Math.round((kind==='legend'?600:200)*({C:1,R:1.2,E:1.4,P:1.6,L:1}[g]||1)*Math.pow(1.14,step)/10)*10;};
relicCards=function(lv){return lv===0?1:Math.min(5,1+Math.floor(lv/3));};
relicCred=function(lv){return lv===0?0:100+lv*50;};
const pgCanUp=canUp;
canUp=function(kind,k){return !VELCARION[k]&&pgCanUp(kind,k);};
const pgMetaLoad=metaLoad;
metaLoad=function(){pgMetaLoad();META.progression=META.progression&&typeof META.progression==='object'?META.progression:{};
 const p=META.progression;p.version=1;p.grants=p.grants||{};p.ledger=p.ledger||{};p.heroTrophies=p.heroTrophies||{};p.pity=pgInt(p.pity,49);
 for(const k of ['credits','astranium'])META[k]=pgInt(META[k]);
 for(const [kind,keys]of [['unit',UNIT_POOL],['legend',LEGEND_KEYS],['relic',RELIC_KEYS]])for(const key of keys){const r=META[KINDMAP[kind]][key];if(!r)continue;r.cards=pgInt(r.cards,99999);r.lv=pgInt(r.lv,maxLvOf(kind,key));}
 // Field rosters and permanent cards are separate. Preserve existing cards/ranks,
 // but never mint cards when restoring captured allies.
 if(p.tutorial===undefined)p.tutorial=0;if(p.tutorialVersion!==2&&p.tutorial>=22)p.tutorial=25;p.tutorialVersion=2;p.tutorial=pgInt(p.tutorial,25);p.grants=p.grants||{};
 // Recover a refresh between an atomic purchase/promotion and its UI transition.
 if(p.tutorial===5&&p.grants['tutorial-unit-draw'])p.tutorial=6;
 if(p.tutorial===9&&p.grants['promotion-training-funds']&&unitLv('infantry')>=1)p.tutorial=10;
 if(p.tutorial===13&&p.grants['tutorial-relic-draw'])p.tutorial=14;
 metaSave();
};
function pgState(){return META.progression;}
function pgGrantOnce(id,ast=0,credits=0){const p=pgState();if(p.grants[id])return false;p.grants[id]=true;META.astranium=pgInt(META.astranium+ast);META.credits=pgInt(META.credits+credits);metaSave();return true;}
function pgPrice(kind,n){return PG_COST[kind]*n*(n===10?.9:1);}
function pgDraw(kind,n,tutorial=false){
 if(PG.reveal||PG.drawBusy||!['unit','relic'].includes(kind)||![1,5,10].includes(n))return null;
 const p=pgState(),tutorialID=kind==='unit'?'tutorial-unit-draw':'tutorial-relic-draw';
 if(tutorial&&(p.grants[tutorialID]||(kind==='unit'?(p.tutorial!==5||n!==5):(p.tutorial!==13||n!==1))))return null;
 const cost=pgPrice(kind,n);if(META.astranium<cost)return null;
 PG.drawBusy=true;try{const result=[];META.astranium-=cost;if(tutorial)p.grants[tutorialID]=true;
  for(let i=0;i<n;i++){
   if(kind==='unit'){
    let card=tutorial?{key:'infantry',legend:false,grade:'C'}:unitRoll();
    if(!tutorial){p.pity++;if(p.pity>=50&&!card.legend)card={key:pgRegularLegendRoll(),legend:true,grade:'L'};if(card.legend)p.pity=0;}
    addCard(card.legend?'legend':'unit',card.key,1);result.push({...card,kind:card.legend?'legend':'unit'});
   }else{const key=tutorial?'r_core':relicRoll();addCard('relic',key,1);const r=recOf('relic',key);if(r.lv===0){r.cards--;r.lv=1;}result.push({key,kind:'relic'});}
  }
  p.lastDraw={kind,result,at:Date.now()};metaSave();return result;
 }finally{PG.drawBusy=false;}
}
heroUnlocked=function(){return ownsVelcaCore();};
heroVisibleKeys=function(){return LEGEND_KEYS;};
function pgRegularLegendRoll(){const pool=EVO_LEGENDS.filter(k=>!HEROES[k]);return pool[Math.floor(Math.random()*pool.length)];}
// The natural Legend branch is 2%. Conditional 0.5% / 0.1% gives
// exact per-draw rates of 0.01% / 0.002%. Pity awards regular Legends only.
heroLegendRoll=function(){if(heroUnlocked()){const r=Math.random();if(r<.005)return 'L_astra';if(r<.006)return 'L_nemesis';}return pgRegularLegendRoll();};
legendOwned=function(){return EVO_LEGENDS.filter(k=>(!HEROES[k]||heroUnlocked())&&(hasOf('legend',k)||pgState().heroTrophies[k]));};
// All story objectives can be earned in normal play; no RNG-only pickup quota or
// mutually exclusive capture/no-capture objectives prevent the 120-star route.
for(const x of STORY){x.diff=1+x.gi*.82;x.killNeed=14+Math.floor(x.gi*1.3);x.ms=[
 {id:'clear',n:()=>pgText('적 지휘 시설 격파','Destroy enemy command'),ok:()=>true},
 {id:'hull',n:()=>pgText('선체 35% 이상으로 생존','Survive with at least 35% hull'),ok:s=>s.hp>=maxHp()*.35},
 {id:'capture',n:()=>pgText('이번 작전에서 적 2기 포획','Capture 2 enemies this operation'),ok:s=>s.captured-(s.pgCaptureStart||0)>=2}
 ];if(x.id==='4-10')x.ms[0]={id:'astra',n:()=>pgText('아스트라 세이버 격파','Defeat Astra Saber'),ok:s=>!!s.hero?.bossDefeated};}
settleStoryReward=function(){const x=S.story,r=storyRec(x.id),first=!r.clear;r.clear=true;let ast=first?35:12;
 S.missionRes=[];for(let i=0;i<3;i++){const ok=x.ms[i].ok(S,x.gi),fresh=ok&&!r.stars[i];if(fresh){r.stars[i]=true;ast+=15;}S.missionRes.push({n:x.ms[i].n(x.gi),ok,isNew:fresh});}
 S.missionAst=ast;S.missionCredits=first?130+x.ch*25:65;S.missionAll=r.stars.every(Boolean);
 META.astranium+=ast;META.credits+=S.missionCredits;
 const chapters=META.storyChapters||(META.storyChapters={});if(STORY.filter(s=>s.ch===x.ch).every(s=>META.story[s.id]?.clear)&&!chapters[x.ch]?.claimed){
  chapters[x.ch]={claimed:true};META.astranium+=60;S.missionAst+=60;S.pgChapterBonus=60;
 }
};
function pgReceipt(){if(!S.pgRun)S.pgRun=pgID();const ledger=pgState().ledger;
 const id=S.pgRun+':'+(S.story?.id||S.stage);return ledger[id]||(ledger[id]={kills:0,clear:false,summons:0});}
function pgSettleBattle(){const r=pgReceipt();if(r.clear)return;r.clear=true;
 if(!S.story){S.pgReward={ast:18+Math.min(12,Math.floor(S.stage/3)*2),credits:100+Math.min(200,S.stage*10)};META.astranium+=S.pgReward.ast;META.credits+=S.pgReward.credits;}
 else S.pgReward={ast:S.missionAst||0,credits:S.missionCredits||0};metaSave();
}
const pgSettleStory=settleStoryReward;
settleStoryReward=function(){if(pgReceipt().clear){S.missionAst=0;S.missionCredits=0;S.missionRes=[];return;}pgSettleStory();};
for(const [k,img,c,ko,en]of [['AST','c_ast','#76dedf','아스트라늄 보급','Astranium supply'],['CREDIT','c_cred','#dfc88b','크레딧 보급','Credit supply']]){ITEMS[k]={img,c,name:pgText(ko,en)};ITEM_KEYS.push(k);}
const pgDropBase=evoDropSupply;
evoDropSupply=function(e){pgDropBase(e);if(!S||mode!=='play'||S.rewardSettled||S.relGuide===1)return;
 S.pgKills=(S.pgKills||0)+1;const r=pgReceipt(),milestone=Math.floor(S.pgKills/6);
 if(milestone>r.kills&&milestone<=6){r.kills=milestone;S.items.push({k:milestone%2?'AST':'CREDIT',x:e.x+16,y:e.y,t:0});metaSave();}
 pgDropLegendSupport(e);
};
const pgPickupBase=pickup;
pickup=function(k,src){
 if(k==='AST'||k==='CREDIT'){const ast=k==='AST'?6:0,credits=k==='CREDIT'?45:0;META.astranium+=ast;META.credits+=credits;S.itemGot++;metaSave();relToast(ast?'아스트라늄 +6':'크레딧 +45',ast?'Astranium +6':'Credits +45');return;}
 if(k==='SUMMON')return pgSummonLegendSupport();
 return pgPickupBase(k,src);
};
const pgMakeUnit=makeUnit;
makeUnit=function(type,x,y,side){const u=pgMakeUnit(type,x,y,side);if(u&&side==='ally'&&!VELCARION[type]){u.lv=unitLv(type);u.rankMul=powerMul('unit',type);u.hp*=u.rankMul;u.hpMax*=u.rankMul;}return u;};
// Keep fractional damage: rounding a 1-damage shot used to erase small promotions.
evoAllyShotDamage=function(u){return (1+(u.dmgBonus||0))*(u.rankMul||1)*(1+relicVal('r_link'))*(1+Math.min(3,S.allyPwr||0)*.25)*(1+(S.evoSquad||0)*.2);};
const pgFireBase=fireFrom;
fireFrom=function(u,angle,from){const first=S.bullets.length;pgFireBase(u,angle,from);if(from==='ally'&&!u.isLegend&&!isVelcarion(u))for(let i=first;i<S.bullets.length;i++)S.bullets[i].dmg=evoAllyShotDamage(u);};
const pgMakeLegend=makeLegend;
makeLegend=function(key,x,y,side){if(HEROES[key]){const u=makeHero(key,x,y,side);u.evoExpiry=Infinity;u.armor=.2;const f=1+(S.evoSquad||0)*.2;u.hp=u.hpMax=u.hpMax*f;u.dmgMul=.60*(side==='ally'?powerMul('legend',key):1)*f;return u;}
 const u=pgMakeLegend(key,x,y,side);if(side==='ally'){const f=powerMul('legend',key);u.hp*=f;u.hpMax*=f;u.dmgMul*=f;}return u;};
evoRestoreLegend=function(d,x,y){const a=makeLegend(d.key,x,y,'ally');if(Number.isFinite(d.hpMax))a.hpMax=d.hpMax;a.pgRestoringHealth=true;a.hp=Math.min(a.hpMax,d.hp);a.pgRestoringHealth=false;return a;};
const pgApplyUpgrade=evoApplyUpgrade;
evoApplyUpgrade=function(u){pgApplyUpgrade(u);if(u.id==='squadPower')for(const a of S.allies)if(a.isLegend)a.dmgMul=(isHero(a)?.60:1)*powerMul('legend',a.type)*(1+(S.evoSquad||0)*.2);};
// In-game insignia are drawn by the shared cached-vector rank module.
const pgSpawnBase=spawnBase;
spawnBase=function(){if(S.story?.id==='4-10'){heroSpawnBoss();S.evoBossLegendAt=S.relTime+9500;return;}return pgSpawnBase();};
heroBossStage=function(){return S?.story?.id==='4-10';};
heroDropTrophies=function(u){if(!heroUnlocked())return;const p=pgState(),h=heroState();p.heroPity=pgInt(p.heroPity,4)+1;
 if(!p.heroTrophies.L_astra||Math.random()<.25)h.trophies.push({key:'L_astra',x:u.x-28,y:u.y,age:0,collected:false});
 if(p.heroPity>=5||Math.random()<.20){h.trophies.push({key:'L_nemesis',x:u.x+28,y:u.y,age:0,collected:false});p.heroPity=0;}metaSave();
};
const pgCollectTrophy=heroCollectTrophy;
heroCollectTrophy=function(t){const ok=pgCollectTrophy(t);if(ok){pgState().heroTrophies[t.key]=true;delete S.pending[t.key];metaSave();}return ok;};
// Use the original alien AI and authored rigs. Their card/upgrade pool stays closed.
const pgMakeAlien=makeVelcarion;
makeVelcarion=function(...args){const u=pgMakeAlien(...args);u.hp=u.hpMax=Math.ceil(u.hpMax*.8);return u;};
const pgSpawnAround=spawnAroundPlayer;
spawnAroundPlayer=function(){pgSpawnAround();if(velcaUnlocked()&&S.enemies.length<evoEnemyLimit(S.stage)){const a=Math.random()*Math.PI*2;velcaSpawnInstead(evoClamp(S.px+Math.cos(a)*320,80,WORLD.w-80),evoClamp(S.py+Math.sin(a)*320,80,WORLD.h-80));}};
const pgNewBase=newGame;
newGame=function(storyId){PG.creating=true;try{pgNewBase(storyId);S.pgRun=pgID();S.pgKills=0;S.pgCaptureStart=0;pgState().firstBattle=true;
 const entries=Object.entries(pgState().ledger);if(entries.length>160)pgState().ledger=Object.fromEntries(entries.slice(-100));
 }finally{PG.creating=false;}relSaveCheckpoint();metaSave();};
const pgStageBase=startStage;
startStage=function(n){pgStageBase(n);S.pgCaptureStart=S.captured;S.pgKills=0;S.pgLastSummon=-90000;
 if(S.story){S.relGuide=0;S.enemies=S.enemies.filter(e=>!e.relRecruit);S.spawnCd=1000;S.killNeed=S.story.killNeed;
  // Campaign sorties start independently, so mission-issued equipment replaces
  // the many temporary rewards an Infinity squad would have accumulated.
  const gi=S.story.gi;S.upDmg=Math.floor(gi/8);S.upRate=Math.min(3,Math.floor(gi/12));S.upPower=Math.floor(gi/12);S.upSquad=Math.min(2,Math.floor(gi/15));S.upBeam=Math.min(2,Math.floor(gi/18));S.evoTacticalAI=Math.min(2,Math.floor(gi/18));S.hp=maxHp();
 }
 relSaveCheckpoint();
};
const pgEnemyHealth=evoHealthScale;
evoHealthScale=function(stage){if(S?.story){const n=S.story.gi;return .9+n*.09+n*n*.003;}return pgEnemyHealth(stage);};
const pgTurretHealth=evoTurretHealth;
evoTurretHealth=function(stage){if(S?.story){const n=S.story.gi;return Math.round(35+n*7+n*n*.22);}return pgTurretHealth(stage);};
const pgRoster=pickType;
pickType=function(stage){return pgRoster(S?.story?Math.round(1+S.story.gi*54/39):stage);};
const pgSaveCheckpoint=relSaveCheckpoint;
relSaveCheckpoint=function(){if(!S||PG.creating||PG.resuming||S.story||MODE_STORY)return;pgSaveCheckpoint();if(META.relaunchRun){META.relaunchRun.pgRun=S.pgRun;META.relaunchRun.pgVersion=1;metaSave();}};
const pgContinue=relContinue;
relContinue=function(){const id=META.relaunchRun?.pgRun;PG.resuming=true;try{pgContinue();if(id)S.pgRun=id;}finally{PG.resuming=false;}relSaveCheckpoint();};
function pgStartStory(id){if(!STORY.some(s=>s.id===id)||!storyUnlocked(storyIndex(id)))return;cgCloseHub();clearBattleInput();newGame(id);show(null);cgResumeAudio();PG.screen='battle';}
function pgAdvanceStage(){if(S.story){EVO_DEBRIEF.busy=false;showMenu();pgOpenStory(S.story.ch);return;}evoFleetAdvance();}
const pgRollUpgrades=rollUpgrades;
rollUpgrades=function(){if(S.story){const box=$('upChoices');box.replaceChildren();cards=[];$('upTitle').textContent=pgText('작전 결과','Operation complete');$('upEyebrow').textContent=S.story.id+' · '+pgText('임무 종료','DEBRIEF');
  $('missionBox').replaceChildren(...S.missionRes.map(r=>basicNode('p',(r.ok?'★ ':'☆ ')+r.n+(r.isNew?' · +15 AST':''),'pg-mission')));
  for(const [text,fn]of [[pgText('다음 작전 선택','Choose next operation'),()=>{EVO_DEBRIEF.busy=false;showMenu();pgOpenStory(S.story.ch);}], [pgText('편대 정비 · 메인','Refit squad · Main menu'),()=>{EVO_DEBRIEF.busy=false;showMenu();}]]){const b=basicButton(text,fn,'card pg-result-action');box.append(b);cards.push(b);}
  $('claimBox').replaceChildren(basicNode('p','+'+(S.pgReward?.ast||S.missionAst||0)+' AST · +'+(S.pgReward?.credits||S.missionCredits||0)+' CR','pg-reward'));return;}
 pgRollUpgrades();$('claimBox').prepend(basicNode('p','+'+(S.pgReward?.ast||0)+' AST · +'+(S.pgReward?.credits||0)+' CR · '+pgText('영구 저장','Saved permanently'),'pg-reward'));
 const exit=basicButton(pgText('메인으로 · 재화로 정비하기','Main menu · Spend earned supplies'),()=>{S.allies=[];S.evoReserve=[];showMenu();},'pg-inline');$('claimBox').append(exit);
};
const pgGameOver=gameOver;
gameOver=function(){pgGameOver();const route=S.story?.id;$('btRetry').onclick=route?()=>pgStartStory(route):()=>relContinue();
 let b=$('pgDeathHub');if(!b){b=basicButton('',()=>showMenu(),'btn teal');b.id='pgDeathHub';$('btMenu').parentElement.append(b);}b.textContent=pgText('메인으로 · 유닛 정비','Main menu · Refit units');
 if(pgState().tutorial<25&&!pgState().tutorialDeferred){showMenu();pgBeginTutorial();}
};

/* Responsive progression surfaces share the existing cinematic menu and art. */
const pgNode=basicNode;
function pgButton(id,label,fn,cls='pg-button'){const b=basicButton(label,fn,cls);b.id=id;return b;}
function pgImage(key){const im=pgNode('img');im.src=ART[key]||ART.main;im.alt='';im.loading='lazy';return im;}
// Use the same affordability gate as the real promotion action; this is display-only.
function pgUpgradeReady(card,kind,key){
 if(!canUp(kind,key))return;
 card.classList.add('pg-upgrade-ready');
 if(META.basicReduceMotion)card.classList.add('pg-upgrade-still');
 const badge=pgNode('span',null,'pg-upgrade-badge');
 badge.append(pgNode('span',pgText('업그레이드','UPGRADE'),'pg-upgrade-label'));
 card.append(badge);
 card.setAttribute('aria-label',card.textContent+' · '+pgText('강화 가능: 카드와 크레딧이 충분합니다','Upgrade available: sufficient cards and Credits'));
}
function pgWallet(){return '◈ '+fmt(META.astranium)+' AST   ·   '+fmt(META.credits)+' CR';}
function pgPanel(title,screen,back){const p=cgHub(title,pgWallet());p.classList.add('pg-panel');p.parentElement.classList.add('pg-hub');const close=p.querySelector('.cg-close');close.id='pgHubClose';close.textContent=back?'‹':'×';close.setAttribute('aria-label',back?pgText('이전 화면으로','Back'):pgText('닫기','Close'));const leave=()=>{cgCloseHub();if(back)back();};close.onclick=leave;p.parentElement.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();leave();}},true);PG.screen=screen;queueMicrotask(()=>pgTutorialRefresh());return p;}
const PG_ICONS={shop:'<path d="M8 11h5l4 20h19l5-15H15M20 38h.1M34 38h.1"/>',units:'<path d="M15 20V13l9-7 9 7v7l-4 6H19zM14 26l-6 7v9h32v-9l-6-7M20 16h8M18 31v10M30 31v10"/>',relics:'<path d="m24 4 13 19-13 21L11 23zM24 4v40M11 23h26M13 21l11 7 11-7"/>',settings:'<path d="m20 6-2 5-6 1-3 6 3 5-3 6 4 6 6 1 2 5h7l2-5 6-1 4-6-3-6 3-5-4-6-6-1-2-5z"/><circle cx="24" cy="24" r="7"/>',archives:'<path d="M9 8h23l7 7v25H9zM31 8v9h8M16 23h16M16 29h16M16 35h10"/>',story:'<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="6"/><path d="M24 3v11M24 34v11M3 24h11M34 24h11"/>',infinity:'<path d="M24 24C13 3 3 15 7 27c5 14 13 3 17-3s14-17 18-4c5 17-11 20-18 4Z"/>',chevron:'<path d="m19 12 12 12-12 12"/>'};
function pgIcon(key){if(key!=='chevron'){const n=pgNode('span',null,'pg-icon pg-art-icon pg-art-'+key);n.setAttribute('aria-hidden','true');return n;}const n=pgNode('span',null,'pg-icon');n.setAttribute('aria-hidden','true');n.innerHTML='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+PG_ICONS[key]+'</svg>';return n;}
function pgNote(p,ko,en){p.append(pgNode('p',pgText(ko,en),'pg-note'));}
const pgBasicMenu=basicMenu;
basicMenu=function(){pgBasicMenu();if(!basicReady||!META.progression)return;document.body.classList.add('pg-enabled');
 let host=$('pgMenu');if(!host){host=pgNode('section',null,'pg-menu');host.id='pgMenu';$('mstage').append(host);}host.replaceChildren();
 const top=pgNode('div',null,'pg-top'),profile=pgButton('pgLeaderboard','',()=>profileDrawer(profile),'pg-button pg-profile'),identity=pgNode('span',null,'pg-identity');profile.setAttribute('aria-label',pgText('지휘관 정보 · 프로필 이미지와 기록','Commander profile · Emblem and records'));identity.append(pgNode('strong',cgDisplayName()),pgNode('small',pgText('최고 기록','BEST SCORE')+'  '+fmt(META.best||0)),pgNode('em',pgText('프로필 · 개인 기록 ›','PROFILE · personal records ›')));profile.append(cgCurrentAvatar('pg-profile-emblem'),identity);
 const wallet=pgButton('pgWallet','',()=>pgOpenShop(),'pg-button pg-wallet');for(const [key,label,value]of [['c_cred',pgText('크레딧','CREDITS'),META.credits],['c_ast',pgText('아스트라늄','ASTRANIUM'),META.astranium]]){const row=pgNode('span',null,'pg-currency-row');row.append(pgImage(key),pgNode('small',label),pgNode('strong',fmt(value)));wallet.append(row);}top.append(profile,wallet);host.append(top);
 const actions=pgNode('div',null,'pg-deploy');
 const prog=velcaCoreProgress();for(const [id,icon,title,detail,fn]of [['pgStory','story',pgText('스토리 스테이지','STORY CAMPAIGN'),pgText('40개 작전 · ','40 OPERATIONS · ')+'★ '+prog.stars+'/120',()=>pgOpenStory()],['pgInfinity','infinity',pgText('인피니티 스테이지','INFINITY MODE'),pgText('적을 포획하고 끝없는 전장에 도전하세요','Capture allies. Push beyond your best.'),()=>{if(PG.launchPrompt){PG.launchPrompt=false;pgSpotClear();basicPlay();}else if(relValidSave())pgInfinityChoice();else basicPlay();}]]){const b=pgButton(id,'',fn,'pg-button pg-deploy-card pg-'+icon),copy=pgNode('span',null,'pg-deploy-copy');copy.append(pgNode('strong',title),pgNode('small',detail));b.append(pgIcon(icon),copy,pgIcon('chevron'));actions.append(b);}host.append(actions);
 const nav=pgNode('nav',null,'pg-nav');for(const [id,ko,en,fn]of [
 ['pgShop','상점','SHOP',()=>pgOpenShop()],['pgUnits','유닛','UNITS',()=>pgOpenUnits()],['pgRelics','유물','RELICS',()=>pgOpenRelics()],
 ['pgArchives','기록실','ARCHIVES',()=>openStoryArchive()],['pgSettings','설정','SETTINGS',()=>basicOpenSettings()]]){const b=pgButton(id,'',fn);b.append(pgIcon(id.slice(2).toLowerCase()),pgNode('span',pgText(ko,en)));nav.append(b);}nav.id='pgNav';host.append(nav);
 if(pgState().tutorial>0&&pgState().tutorial<25&&pgState().tutorialDeferred){host.append(pgButton('pgResumeGuide',pgText('기본 튜토리얼 이어보기','Resume tutorial'),()=>{pgState().tutorialDeferred=false;metaSave();pgResumeTutorial();},'pg-guide-resume'));}
 PG.screen='menu';queueMicrotask(()=>pgTutorialRefresh());
};
function pgInfinityChoice(){const p=pgPanel(pgText('인피니티 출격','Infinity sortie'),'infinity');pgNote(p,'새 출격에는 최신 유닛 계급과 유물이 적용됩니다. 이전 출격의 보상과 기록은 보존됩니다.','New sorties use your latest ranks and relics. Earned rewards and records stay saved.');
 p.append(pgButton('pgContinue',pgText('이어서 출격 · 스테이지 ','Continue · Sector ')+META.relaunchRun.stage,()=>{cgCloseHub();relContinue();},'pg-button pg-primary'),pgButton('pgFresh',pgText('새 편대로 1스테이지부터','Fresh squad · Start at sector 1'),()=>evoConfirmNewRun()));}
function pgOpenStory(ch=1){ch=Math.max(1,Math.min(4,ch));PG.storyChapter=ch;const p=pgPanel(pgText('스토리 작전','Story operations'),'story'),tabs=pgNode('nav',null,'pg-tabs');
 for(let n=1;n<=4;n++)tabs.append(pgButton('pgChapter'+n,pgText(n+'장','CHAPTER '+n),()=>pgOpenStory(n),'pg-button'+(n===ch?' selected':'')));p.append(tabs);
 pgNote(p,'첫 클리어 35 AST · 새 임무 별마다 15 AST · 재도전 12 AST · 한 장 전체 첫 완료 +60 AST. 별은 성공한 출격마다 누적됩니다.','First clear: 35 AST · Each new star: 15 AST · Replay: 12 AST · First full chapter clear: +60 AST. Successful mission stars accumulate.');
 const grid=pgNode('div',null,'pg-story-grid');for(const x of STORY.filter(s=>s.ch===ch)){const r=META.story[x.id],b=pgButton('pgStory'+x.id.replace('-',''),'',()=>pgStoryDetail(x.id),'pg-stage-card');b.disabled=!storyUnlocked(x.gi);b.append(pgNode('small',planetName(x)),pgNode('strong',x.id),pgNode('span',(r?.stars||[0,0,0]).map(s=>s?'★':'☆').join(' ')),pgNode('small',b.disabled?pgText('이전 작전 완료 후','Clear previous operation'):r?.clear?pgText('재도전','REPLAY'):pgText('출격 가능','READY')));grid.append(b);}p.append(grid);
 p.append(pgButton('pgCoreInfo',pgText('벨카코어 · 별 ','Velca Core · Stars ')+velcaCoreProgress().stars+'/120',pgOpenCore));
}
function pgStoryDetail(id){const x=STORY.find(s=>s.id===id);const p=pgPanel(pgText('작전 ','OPERATION ')+id,'story-detail',()=>pgOpenStory(x.ch));p.append(pgNode('h3',planetName(x)));for(const m of x.ms)p.append(pgNode('p','☆ '+m.n(x.gi),'pg-mission'));
 if(x.gi>=8)pgNote(p,'후반 작전은 임무 장비가 지급됩니다. 작전 단계에 맞춰 기본 화력·장전·선체가 보강되며, 영구 계급과 유물은 추가로 적용됩니다.','Later operations issue mission equipment: base damage, reload and hull improve with campaign progress. Permanent ranks and relics apply on top.');
 pgNote(p,'임무마다 별을 모으세요. 새 별 1개 = 아스트라늄 15. 클리어하지 못해도 전장에서 회수한 재화는 유지됩니다.','Earn stars for mission objectives. Each new star gives 15 Astranium. Supplies collected in combat remain yours even after defeat.');
 if(id==='4-10')pgNote(p,'벨카코어 보유 후 이 작전을 다시 클리어하면 영웅 트로피를 회수할 수 있습니다.','After obtaining the Velca Core, replay this operation to recover hero trophies.');
 p.append(pgButton('pgStoryDeploy',pgText('출격','DEPLOY'),()=>pgStartStory(id),'pg-button pg-primary'));
}
function pgOpenShop(tab='unit'){const p=pgPanel(pgText('보급 상점','Supply exchange'),'shop'),tabs=pgNode('nav',null,'pg-tabs');tabs.append(pgButton('pgUnitTab',pgText('유닛 소환','Unit cards'),()=>pgOpenShop('unit'),'pg-button'+(tab==='unit'?' selected':'')),pgButton('pgRelicTab',pgText('유물 소환','Relics'),()=>pgOpenShop('relic'),'pg-button'+(tab==='relic'?' selected':'')));p.append(tabs);
 const hero=pgNode('section',null,'pg-shop-hero');hero.append(pgImage(tab==='unit'?'L_vulcan':'rel1'));const copy=pgNode('div');copy.append(pgNode('h3',tab==='unit'?pgText('새 전력을 발견하세요','Discover your next ally'):pgText('출격을 넘어 남는 힘','Power that stays with you')));pgNote(copy,'인피니티 돌파·전장 보급·스토리 임무로 아스트라늄을 모으세요. 현금 구매는 없습니다.','Earn Astranium from Infinity clears, battlefield supplies and story missions. No cash purchases.');hero.append(copy);p.append(hero);
 const row=pgNode('div',null,'pg-draw-actions');for(const n of [1,5,10]){const b=pgButton('pgDraw'+tab+n,n+pgText('회 소환',' DRAWS')+' · '+pgPrice(tab,n)+' AST'+(n===10?' −10%':''),()=>{const tutorial=!pgState().tutorialDeferred&&((tab==='unit'&&pgState().tutorial===5)||(tab==='relic'&&pgState().tutorial===13));const r=pgDraw(tab,n,tutorial);if(r)pgSummonReveal(tab,r,{tutorial});},'pg-button'+(n===5?' pg-primary':''));b.disabled=META.astranium<pgPrice(tab,n);row.append(b);}p.append(row);
 pgNote(p,tab==='unit'?'일반 50% · 희귀 28% · 엘리트 14% · 에픽 6% · 레전드 2%. 레전드 없이 49회 소환하면 다음은 레전드 확정.':'유물은 첫 획득 즉시 Lv1로 적용됩니다. 중복 카드는 크레딧으로 강화합니다. 최대 Lv12, 자동 장착.',tab==='unit'?'Common 50% · Rare 28% · Elite 14% · Epic 6% · Legend 2%. After 49 draws without a Legend, the next is guaranteed.':'First relic unlocks at Lv1 automatically. Promote with duplicate cards and Credits. Maximum Lv12; always equipped.');
 if(tab==='unit')pgNote(p,'벨카코어 획득 후 초월 영웅 해금: 아스트라 세이버 0.01% · 네메시스 베일 0.002% (전체 소환 기준, 레전드 2%에 포함). 확정 소환은 일반 레전드만 대상입니다. 나머지 같은 등급 유닛은 균등 확률입니다.','The Velca Core unlocks Ascendant heroes: Astra Saber 0.01% and Nemesis Veil 0.002% per draw, included in the 2% Legend rate. Pity guarantees regular Legends only. Other units within a rarity are equally likely.');
 else{const sum=RELIC_KEYS.reduce((s,k)=>s+RELIC_RARITY[RELICS[k].ra].w,0);p.append(pgNode('small',RELIC_KEYS.map(k=>nm(k)+' '+(RELIC_RARITY[RELICS[k].ra].w/sum*100).toFixed(1)+'%').join(' · '),'pg-note'));pgNote(p,'편대 슬롯·추가 탄환 유물은 최대 Lv1입니다. 최대 레벨 유물의 중복은 소량의 아스트라늄으로 환급됩니다.','Squad-slot and extra-shot relics cap at Lv1. Duplicates of maxed relics refund a small amount of Astranium.');}
 p.append(pgNode('h3',pgText('크레딧 교환','Credit exchange')));const trades=pgNode('div',null,'pg-trades');for(const pack of PG_TRADE){const b=pgButton('pgTrade'+pack.ast,pack.ast+' AST → '+fmt(pack.cred)+' CR',()=>{if(META.astranium<pack.ast)return;META.astranium-=pack.ast;META.credits+=pack.cred;metaSave();pgOpenShop(tab);});b.disabled=META.astranium<pack.ast;trades.append(b);}p.append(trades);
}
function pgDrawResult(kind,result){const p=pgPanel(pgText('보급 확보','Supplies acquired'),'draw-result',()=>pgOpenShop(kind)),grid=pgNode('div',null,'pg-result-grid');
 for(const r of result){const card=pgNode('article',null,'pg-collection-card');card.append(pgImage(r.kind==='relic'?RELICS[r.key].ic:r.key),pgNode('strong',nm(r.key)),pgNode('small',r.kind==='relic'?pgText('유물 +1','RELIC +1'):pgText('카드 +1','CARD +1')));grid.append(card);}p.append(grid);pgNote(p,'획득 결과는 즉시 저장되었습니다. 중복 카드로 유닛을 진급시킬 수 있습니다.','Results saved. Duplicate cards can be used for promotions.');}
function pgOpenUnits(filter='unit'){const p=pgPanel(pgText('편대 정비','Squad refit'),'units'),tabs=pgNode('nav',null,'pg-tabs');for(const [id,ko,en]of [['unit','일반 유닛','Regular units'],['legend','레전드','Legends'],['ancient','벨카리온','Velcarion']])tabs.append(pgButton('pgRoster'+id,pgText(ko,en),()=>pgOpenUnits(id),'pg-button'+(id===filter?' selected':'')));p.append(tabs);
 pgNote(p,'유닛 카드 5장 + 크레딧으로 1계급 진급. 레전드 포획은 정예 합류와 카드 1장을 보상합니다. 진급 카드는 포획과 상점 소환으로 얻습니다. 진급은 아군에게만 적용됩니다.','Promote with 5 cards and Credits. Captured Legends join as Elites and secure one card. Obtain promotion cards from captures and shop draws. Rank bonuses apply only to allies.');
 const grid=pgNode('div',null,'pg-collection-grid');for(const key of filter==='unit'?UNIT_POOL:filter==='legend'?EVO_LEGENDS:VELCA_KEYS){const kind=filter==='unit'?'unit':'legend',r=filter==='ancient'?null:recOf(kind,key),b=pgButton('pgUnit'+key,'',()=>pgUnitDetail(key),'pg-collection-card');b.append(pgImage(key),pgNode('strong',nm(key)||VELCARION[key]?.en));
  b.append(pgNode('small',r?(hasOf(kind,key)?rankName(kind,key)+' · '+r.cards+'/5':kind==='legend'?(pgState().heroTrophies[key]?pgText('지원 소환 해금 · 카드 0/5','Support unlocked · Cards 0/5'):pgText('진급 카드 미보유 · 포획 / 소환','No promotion cards · Capture / draw')):pgText('미보유 · 전장 포획은 가능','Not owned · Field capture available')):pgText('벨카코어로 포획 · 진급 없음','Core capture · No promotions')));if(HEROES[key])b.append(pgNode('small',heroUnlocked()?pgText('초월 영웅 · 극희귀 소환 / 트로피','ASCENDANT · Ultra-rare draw / trophy'):pgText('초월 영웅 · 벨카코어 필요','ASCENDANT · Velca Core required')));if(r)pgUpgradeReady(b,kind,key);grid.append(b);}p.append(grid);
}
function pgUnitDetail(key){const ancient=!!VELCARION[key],kind=LEGENDS[key]?'legend':'unit',p=pgPanel(nm(key)||VELCARION[key]?.en,'unit-detail',()=>pgOpenUnits(ancient?'ancient':kind)),hero=pgNode('section',null,'pg-unit-hero');hero.append(pgImage(key));const details=pgNode('div');
 if(ancient){details.append(pgNode('h3',pgText('벨카코어 공명','Velca resonance')));pgNote(details,'스토리 별 120개로 벨카코어를 획득하면 전장에서 포획할 수 있습니다. 뽑기와 계급 진급은 없습니다.','Earn the Velca Core at 120 story stars to capture in combat. Not available in draws or promotions.');}
 else{const r=recOf(kind,key),lv=r.lv,cap=maxLvOf(kind,key);details.append(pgNode('h3',rankName(kind,key)+' · '+lv+'/'+cap));pgNote(details,'영구 체력·공격력 +'+Math.round((powerMul(kind,key)-1)*100)+'% (최대 +28%).','Permanent hull and damage +'+Math.round((powerMul(kind,key)-1)*100)+'% (maximum +28%).');details.append(pgNode('p',pgText('보유 카드 ','Cards ')+r.cards+' / 5'));const b=pgButton('pgPromote',lv>=cap?pgText('최대 계급','MAX RANK'):pgText('진급','PROMOTE')+' · 5 '+pgText('장','CARDS')+' + '+needCred(kind,key,lv)+' CR',()=>{if(doUp(kind,key)){pgUnitDetail(key);}},'pg-button pg-primary');b.disabled=!canUp(kind,key);details.append(b);}
 hero.append(details);p.append(hero);if(LEGENDS[key]){for(const line of legendWeapons(key))p.append(pgNode('p',line,'pg-note'));if(!HEROES[key])pgNote(p,'포획 확률 5~10%. 성공 시 정예 합류: 해당 출격 체력·공격력 +15%, 카드 1장 확보. 정산 시 지급하며 패배해도 유지됩니다. 정원이 차면 가장 부상당한 레전드를 예비 편대로 보냅니다. 지원 소환은 정예 보너스와 카드가 없습니다.','Capture chance: 5–10%. Success recruits an Elite with +15% hull and damage for this sortie and secures one card, settled even on defeat. A full fleet sends its most damaged Legend to reserve. Support summons grant no elite bonus or cards.');}else if(!ancient)pgNote(p,BASIC_UNIT_MAP[key]?.desc||'',BASIC_UNIT_MAP[key]?.enDesc||'');
 if(HEROES[key])pgNote(p,'직접 포획할 수 없습니다. 벨카코어 획득 후 상점 소환 또는 4-10 트로피로 지원 소환을 해금하세요. 트로피는 진급 카드를 주지 않습니다. 아스트라 첫 트로피는 확정, 네메시스는 20%이며 5회 이내 확정입니다.','Cannot be captured directly. After obtaining the Core, unlock support summons through shop draws or 4-10 trophies. Trophies grant no promotion cards. First Astra trophy is guaranteed; Nemesis is 20%, guaranteed within five eligible clears.');
}
function pgRelicCopy(key,lv){const d=PG_RELICS[key],value=relicValAt(key,lv);return pgText(d[2],d[3])+' +'+(key==='r_link'?Math.round(value*100)+'%':value);}
function pgOpenRelics(){const p=pgPanel(pgText('유물 보관실','Relic vault'),'relics');pgNote(p,'보유 유물은 자동 적용됩니다. 제한된 보너스로 전투의 성장 폭을 유지합니다.','Owned relics apply automatically. Bonuses are capped to keep combat challenging.');const grid=pgNode('div',null,'pg-collection-grid');
 for(const key of RELIC_KEYS){const r=recOf('relic',key),b=pgButton('pgRelic'+key,'',()=>pgRelicDetail(key),'pg-collection-card');b.append(pgImage(RELICS[key].ic),pgNode('strong',nm(key)),pgNode('small',r.lv?'Lv'+r.lv+' · '+pgRelicCopy(key,r.lv):pgText('미보유','NOT OWNED')));pgUpgradeReady(b,'relic',key);grid.append(b);}p.append(grid,pgButton('pgCoreInfo',pgText('벨카코어 · 고대 병력 해금','Velca Core · Unlock ancient forces'),pgOpenCore));}
function pgRelicDetail(key){const r=recOf('relic',key),p=pgPanel(nm(key),'relic-detail',pgOpenRelics),hero=pgNode('section',null,'pg-unit-hero');hero.append(pgImage(RELICS[key].ic));const copy=pgNode('div');copy.append(pgNode('h3','Lv'+r.lv+' / '+relicMax(key)),pgNode('p',pgRelicCopy(key,Math.max(1,r.lv))));pgNote(copy,'자동 장착 · 모든 새 출격에 적용 · 별도 장착 조작 없음','Always equipped · Applies to every new sortie · No equip action needed');const b=pgButton('pgRelicUpgrade',r.lv>=relicMax(key)?pgText('최대 강화','MAX LEVEL'):pgText('강화','UPGRADE')+' · '+needCard('relic',key,r.lv)+pgText('장',' cards')+' + '+needCred('relic',key,r.lv)+' CR',()=>{if(doUp('relic',key))pgRelicDetail(key);},'pg-button pg-primary');b.disabled=!canUp('relic',key);copy.append(b);hero.append(copy);p.append(hero);}
function pgOpenCore(){const from=PG.screen;const p=pgPanel(pgText('벨카코어','Velca Core'),'core',()=>from==='story'?pgOpenStory(PG.storyChapter||1):pgOpenRelics()),hero=pgNode('section',null,'pg-unit-hero');hero.append(pgImage('velca_core'));const copy=pgNode('div');copy.append(pgNode('h3','★ '+velcaCoreProgress().stars+' / 120'));pgNote(copy,'1~4장 전체 40개 작전을 각각 별 3개로 완료하면 자동 획득합니다. 벨카리온의 전장 포획이 해금됩니다.','Complete all 40 operations in Chapters 1–4 with 3 stars each. Automatically unlocks field capture of Velcarion.');pgNote(copy,'코어 보유 시 상점에서 아스트라 0.01%, 네메시스 0.002% 소환이 해금됩니다. 또는 4-10을 다시 격파하고 트로피를 회수하세요. 아스트라 세이버와 네메시스 베일을 영구 컬렉션에 등록해 소환 보급으로 부를 수 있습니다.','The Core unlocks shop draws for Astra (0.01%) and Nemesis (0.002%). Alternatively, replay 4-10 and collect trophies. Add Astra Saber and Nemesis Veil permanently and call them through summon pickups.');hero.append(copy);p.append(hero);}
const pgShowMenu=showMenu;
showMenu=function(){cgCloseHub();pgShowMenu();if(pgState()?.firstBattle&&pgState().tutorial===0&&!pgState().tutorialDeferred){pgState().tutorial=1;metaSave();}queueMicrotask(()=>pgTutorialRefresh());};
const pgSettings=basicOpenSettings;
basicOpenSettings=function(){pgSettings();$('cgHub')?.classList.add('pg-hub');const p=$('cgHub')?.querySelector('section');if(p){p.classList.add('pg-panel');p.append(pgButton('pgGuideRestart',pgState().tutorial>=25?pgText('메뉴 안내 다시 보기','Review menu controls'):pgText('기본 튜토리얼 이어보기','Resume basic tutorial'),()=>{if(pgState().tutorial>=25){pgState().tutorial=20;}pgState().tutorialDeferred=false;showMenu();pgResumeTutorial();}));}PG.screen='settings';};
evoAutoStart=function(){document.body.classList.add('evolution','pg-enabled');EVO.waiting=false;clearBattleInput();
 if(!pgState().firstBattle&&!META.relGuideDone&&!META.relaunchRun){PG.launchPrompt=true;basicMenu();show('lyMenu');mode='menu';pgTutorialRefresh();return;}
 showMenu();if(pgState().tutorial>0&&pgState().tutorial<25&&!pgState().tutorialDeferred)pgResumeTutorial();
};

/* One entry per actual battlefield pickup, rather than broad item categories. */
const PG_ITEM_GUIDE_GROUPS=[
 {ko:'생존과 편대',en:'Survival & squad',keys:['SHLD','HEAL','SPD','SLOT'],dk:'방금 얻은 보호막을 포함해, 생존과 기동을 도와주는 보급품이에요.',de:'These supplies protect your hull, improve movement and expand your squad.'},
 {ko:'공격 강화',en:'Weapon upgrades',keys:['PWR','RATE','WAY','APWR'],dk:'플레이어 무기와 아군 편대를 각각 강화하는 아이템이에요.',de:'Different pickups strengthen your weapons or your allied squad.'},
 {ko:'속성 미사일',en:'Elemental missiles',keys:['FREEZE','FIRE','POISON'],dk:'속성은 하나만 사용해요. 다른 속성을 먹으면 교체되며, 같은 속성은 최대 3단계까지 강해져요.',de:'One element is active at a time. A different element replaces it; matching pickups stack up to level 3.'},
 {ko:'재화와 소환',en:'Currency & summons',keys:['CREDIT','AST','SUMMON'],dk:'재화는 바로 저장돼요. 일반 레전드는 상점 카드나 직접 포획한 카드 보상으로 보유할 수 있어요.',de:'Currency is saved immediately. Own regular Legends through Shop cards or card rewards from successful captures.'}
];
function pgItemGuideEntry(k){const stage=pgText('이번 스테이지 유지','This sector only'),run=pgText('다음 스테이지에도 유지','Carries to next sector');
 const ast=PG_HUNT.summonOverflowAst,chance=Math.round(PG_HUNT.summonChance*100),seconds=PG_HUNT.summonCooldown/1000;
 const entries={
  SHLD:['보호막','Shield','다음 공격 1회를 막습니다.','Blocks the next incoming hit.',pgText('중복 장착 불가','Does not stack')],
  HEAL:['체력 회복','Repair','현재 스테이지에서 체력 +'+evoHealAmount(S.stage)+'. 최대 체력까지만 회복합니다.','Repairs '+evoHealAmount(S.stage)+' hull in this sector, up to your maximum.',pgText('즉시 회복 · 스테이지별 회복량 변화','Instant · Amount varies by sector')],
  SPD:['이동속도 증가','Move Speed Up','이동속도 +14%씩, 최대 +42%.','Movement +14% per pickup, up to +42%.',run],
  SLOT:['편대 정원 증가','Squad Slot','일반 아군 정원 +1. 아이템으로 최대 +2기.','Adds one regular ally slot; up to two from pickups.',run],
  PWR:['공격력 증가','Damage Up','플레이어 공격력 +1씩, 최대 +6.','Player damage +1 per pickup, up to +6.',stage],
  RATE:['공격속도 증가','Fire Rate Up','발사 간격이 14%씩 짧아집니다. 최대 5회.','Fire interval is 14% shorter per pickup; up to 5 stacks.',stage],
  WAY:['탄환 수 증가','Extra Rounds','탄환 +1줄. 아이템으로 최대 3줄.','Adds one shot lane; pickup limit is 3 lanes.',stage],
  APWR:['편대 화력 강화','Squad Power','아군 편대의 공격력을 강화합니다. 최대 3회.','Boosts allied squad damage; up to 3 stacks.',run],
  FREEZE:['아이스 미사일','Ice Missile','명중한 적을 느리게 만듭니다. 냉기와 얼음 결정이 퍼져요.','Slows enemies on hit with frost and ice crystals.',stage],
  FIRE:['화염 미사일','Fire Missile','착탄 지점에서 폭발해 주변 적에게 화염 피해를 줍니다.','Explodes on impact, dealing fire damage around the hit.',stage],
  POISON:['맹독 미사일','Venom Missile','명중한 적에게 초록 독 효과와 지속 피해를 줍니다.','Poisons enemies on hit, dealing damage over time.',stage],
  CREDIT:['크레딧','Credits','45 크레딧 획득. 유닛 진급과 유물 강화에 사용해요.','Collect 45 Credits for unit promotions and relic upgrades.',pgText('획득 즉시 저장','Saved on collection')],
  AST:['아스트라늄','Astranium','아스트라늄 6개 획득. 유닛·유물 소환과 크레딧 교환에 사용해요.','Collect 6 Astranium for unit/relic draws or Credit exchange.',pgText('획득 즉시 저장','Saved on collection')],
  SUMMON:['레전드 소환','Legend Summon','보유한 레전드 중 출전·예비 편대에 없는 1기를 무작위로 불러요. 생존 시 다음 스테이지에도 함께해요. 추가 소환 불가: 아스트라늄 +'+ast+' (즉시 저장).','Calls one random owned Legend missing from both your squad and reserves. Survivors stay for the next sector. If none can join: +'+ast+' Astranium, saved immediately.',pgText('보유 시에만 드랍 · 처치당 '+chance+'% · 첫 드랍/드랍 사이 전투 '+seconds+'초 이상 · 확정 아님','Drops require ownership · '+chance+'% per eligible defeat · First drop/interval: '+seconds+'s of combat minimum · Never guaranteed')]
 };
 const d=entries[k];return {key:k,icon:ITEMS[k].img,name:pgText(d[0],d[1]),effect:pgText(d[2],d[3]),note:d[4]};
}
function pgRenderFieldItemPage(){const lesson=PG.itemLesson;if(!lesson)return;if(pgState().fieldItemPage!==lesson.page){pgState().fieldItemPage=lesson.page;metaSave();}lesson.armed=false;const page=PG_ITEM_GUIDE_GROUPS[lesson.page],count=PG_ITEM_GUIDE_GROUPS.reduce((n,g)=>n+g.keys.length,0),panel=lesson.panel;panel.replaceChildren();panel.dataset.page=lesson.page;
 panel.append(pgNode('small',pgText('기본 튜토리얼 · 아이템 '+count+'종','BASIC TUTORIAL · ALL '+count+' PICKUPS')));const title=pgNode('h2',pgText(page.ko,page.en));title.id='pgItemTitle';title.setAttribute('aria-live','polite');panel.append(title,pgNode('p',pgText(page.dk,page.de)));
 const grid=pgNode('div',null,'pg-pickup-guide');grid.dataset.count=page.keys.length;
 for(const key of page.keys){const d=pgItemGuideEntry(key),card=pgNode('article');card.dataset.item=key;card.append(pgImage(d.icon),pgNode('strong',d.name),pgNode('p',d.effect),pgNode('small',d.note,'pg-item-duration'));grid.append(card);}panel.append(grid);
 if(page.keys.includes('SUMMON')){
  const bonus=Math.round(PG_HUNT.eliteBonus*100),tip=pgNode('aside',null,'pg-summon-lesson');
  tip.append(pgNode('strong',pgText('소환 아이템과 직접 포획은 달라요','Summoning and capture give different rewards')),
   pgNode('p',pgText('소환 아이템: 정예 보너스·카드 없음. 직접 포획 성공: 공격력·체력 +'+bonus+'% 정예 + 카드 1장 확보. 카드는 정산 때 지급되며 패배해도 유지돼요.','Summon pickup: no Elite bonus or cards. Successful capture: an Elite with +'+bonus+'% damage and hull, plus one card secured. Cards are paid at debrief, even on defeat.')));panel.append(tip);
 }
 const nav=pgNode('div',null,'pg-item-page-nav'),prev=pgButton('pgFieldPrevious',pgText('‹ 이전','‹ Back'),()=>{},'pg-button');prev.disabled=lesson.page===0;
 const counter=pgNode('span',(lesson.page+1)+' / '+PG_ITEM_GUIDE_GROUPS.length,'pg-item-page-count');counter.setAttribute('aria-label',pgText('안내 페이지 ','Page ')+(lesson.page+1)+' / '+PG_ITEM_GUIDE_GROUPS.length);nav.append(prev,counter);panel.append(nav);
 const last=lesson.page===PG_ITEM_GUIDE_GROUPS.length-1,next=pgButton('pgFieldContinue',last?pgText('아무 곳이나 눌러 전투 계속','Tap anywhere to resume combat'):pgText('아무 곳이나 눌러 다음 아이템 보기','Tap anywhere for more items'),()=>{},'pg-button pg-primary');panel.append(next,pgNode('small',pgText('안내를 모두 보는 동안 전투는 멈춰 있어요.','Combat stays paused through every page.'),'pg-item-paused'));next.focus({preventScroll:true});
}
function pgAdvanceFieldItems(){const lesson=PG.itemLesson;if(!lesson)return;if(lesson.page<PG_ITEM_GUIDE_GROUPS.length-1){lesson.page++;pgRenderFieldItemPage();}else pgCloseFieldItems();}
function pgPreviousFieldItems(){if(PG.itemLesson?.page>0){PG.itemLesson.page--;pgRenderFieldItemPage();}}

/* Persisted lessons, a genuine spotlight, and an isolated first-time build. */
const PG_TUTORIAL_DONE=25;
const PG_LESSONS={
1:['pgStory','전투 수고하셨어요! 이제 편대를 성장시켜 볼게요. 밝게 표시된 스토리 스테이지를 눌러주세요.','Good work, Commander. Open the highlighted Story Campaign to discover your next objective.'],
2:['pgStory11','1-1을 눌러 세 가지 임무를 확인하세요.','Select 1-1 to see its three mission objectives.'],
3:['pgHubClose','임무 하나를 달성하면 별 하나, 새로운 별마다 15 아스트라늄을 얻어요. 출격으로 시작할 수 있지만 지금은 왼쪽 화살표로 돌아갈게요.','Each completed objective earns a star. Each new star gives 15 Astranium. Deploy starts the operation; for now, tap Back.'],
4:['pgShop','유닛 카드를 얻으러 상점에 가볼까요?','Open the Shop to collect unit cards.'],
5:['pgDrawunit5','훈련용 아스트라늄 300개를 드렸어요. 5회 소환을 눌러주세요. 이번에만 애쉬 라이플맨 카드 5장이 확정됩니다.','Here are 300 Astranium. Draw five cards. This tutorial draw guarantees five Ash Rifleman cards.'],
6:['pgHubClose','카드 5장을 받았어요! 상점에서 레전드 카드를 얻으면 전투의 소환 아이템으로 그 레전드를 부를 수 있어요. 이제 돌아가서 진급을 배워볼게요.','Five cards acquired! A Legend card from the Shop lets summon pickups call that owned Legend in battle. Tap Back to learn about promotions.'],
7:['pgUnits','하단의 유닛을 눌러주세요. 보유 카드와 계급을 확인하고, 같은 카드 5장과 크레딧으로 진급할 수 있어요.','Open Units below to see your cards and ranks. Promote with five matching cards and Credits.'],
8:['pgUnitinfantry','애쉬 라이플맨을 선택하세요. 같은 유닛 카드 5장으로 진급할 수 있어요.','Select Ash Rifleman. Five matching cards let you promote a unit.'],
9:['pgPromote','1,000 크레딧을 드렸어요. 카드 5장과 200 크레딧으로 진급하세요. 이 유닛을 포획하면 진급 능력치가 적용됩니다.','Here are 1,000 Credits. Promote with five cards and 200 Credits. Captured allies of this type gain the rank bonus.'],
10:['pgHubClose','진급 완료! 전투 중 아군 위에 계급 문양이 표시됩니다. 돌아가서 유물도 받아볼게요.','Promoted! Allies display their rank insignia in battle. Tap Back to discover relics.'],
11:['pgShop','상점을 한 번 더 열어주세요. 이번에는 유물을 소환해요.','Open the Shop again. This time, we will draw a relic.'],
12:['pgRelicTab','유물 소환 탭을 눌러주세요.','Select the Relics tab.'],
13:['pgDrawrelic1','아스트라늄 100개를 드렸어요. 1회 소환으로 기본 공격 유물을 받으세요. 이번 안내에서만 확정 지급됩니다.','Here are 100 Astranium. Draw one relic to receive a basic attack relic. This guaranteed reward is tutorial-only.'],
14:['pgHubClose','유물을 획득했어요! 자동으로 적용되니 따로 장착할 필요가 없어요. 돌아가서 확인해 볼까요?','Relic acquired! It applies automatically. Tap Back to inspect it in your vault.'],
15:['pgRelics','하단의 유물을 눌러 보관실을 열어주세요.','Open Relics in the bottom menu.'],
16:['pgRelicr_core','방금 받은 공격 유물을 눌러 효과를 확인하세요.','Select your new attack relic to see its effect.'],
17:['pgHubClose','중복 유물 카드와 크레딧으로 강화할 수 있어요. 왼쪽 화살표를 누르면 유물 목록으로 돌아갑니다.','Upgrade with duplicate relic cards and Credits. The Back arrow returns to your relic collection.'],
18:['pgCoreInfo','장기 목표인 벨카코어도 알아볼게요.','Discover the Velca Core, your long-term objective.'],
19:['pgHubClose','1~4장 모든 작전을 별 3개로 깨면 벨카코어를 얻어요. 벨카리온 포획이 해금됩니다. 두 초월 영웅은 코어 획득 후 상점 카드나 4-10 트로피로 보유해야 소환 아이템으로 부를 수 있어요.','Earn three stars in all 40 operations for the Velca Core and Velcarion capture. To summon either Ascendant hero with a pickup, also obtain its Shop card or 4-10 trophy.'],
20:['pgLeaderboard','왼쪽 위는 지휘관 정보와 최고 기록이에요. 이곳에서 개인 기록도 확인할 수 있습니다.','Top left shows your commander and best score. It also opens records and personal records.','next'],
21:['pgWallet','오른쪽 위의 재화는 위가 크레딧, 아래가 아스트라늄이에요. 전투에서 모아 소환과 강화에 사용하세요.','Top right shows Credits above Astranium. Earn them in battle, then spend them on draws and upgrades.','next'],
22:['pgNav','하단에서 상점·유닛·유물을 열 수 있어요. 기록실에는 작전 이야기가, 설정에는 언어와 음량 조절이 있습니다.','The bottom menu holds Shop, Units and Relics. Archives contains the story; Settings controls language and audio.','next'],
23:['pgStory','이제 자유롭게 선택하세요. 스토리에서는 임무 별을 모으고, 인피니티에서는 더 높은 기록에 도전할 수 있어요.','Choose your next challenge: earn mission stars in Story Campaign or push your best score in Infinity Mode.','next'],
24:['pgWallet','준비 완료! 아스트라늄 30개와 크레딧 200개를 드렸어요. 즐거운 출격 되세요, 지휘관님!','You are ready! Enjoy 30 Astranium and 200 Credits. Good hunting, Commander!','next']
};
let pgTutorialTarget=null,pgSpotRAF=0,pgSpotKey='',pgSpotTimer=0;
function pgSpotClear(){clearTimeout(pgSpotTimer);cancelAnimationFrame(pgSpotRAF);pgSpotRAF=0;pgSpotKey='';pgTutorialTarget=null;$('pgSpotlight')?.remove();document.body.classList.remove('pg-guided');}
function pgSpotPosition(){const root=$('pgSpotlight'),target=pgTutorialTarget;if(!root||!target?.isConnected)return;
 const b=target.getBoundingClientRect(),pad=5,x=Math.max(4,b.left-pad),y=Math.max(4,b.top-pad),r=Math.min(innerWidth-4,b.right+pad),bottom=Math.min(innerHeight-4,b.bottom+pad),w=Math.max(1,r-x),h=Math.max(1,bottom-y),tip=$('pgTutor');
 const key=[x,y,w,h,innerWidth,innerHeight,tip.offsetHeight].map(Math.round).join(':');if(key!==pgSpotKey){pgSpotKey=key;
  const boxes=[[0,0,innerWidth,y],[0,y,x,h],[r,y,innerWidth-r,h],[0,bottom,innerWidth,innerHeight-bottom]];
  root.querySelectorAll('.pg-shade').forEach((el,i)=>{const [a,b,c,d]=boxes[i];el.style.cssText=`left:${a}px;top:${b}px;width:${c}px;height:${d}px`;});
  $('pgFocusRing').style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  const tw=tip.getBoundingClientRect().width,th=tip.offsetHeight,below=innerHeight-bottom,above=y;
  let ty=below>=th+18?bottom+13:above>=th+18?y-th-13:(above>below?8:innerHeight-th-8);
  // Wide phones place the compact card beside a narrow target when possible.
  let tx=evoClamp(x+w/2-tw/2,12,innerWidth-tw-12);
  if(below<th+18&&above<th+18&&innerWidth>650){if(x>=tw+24){tx=x-tw-14;ty=evoClamp(y,8,innerHeight-th-8);}else if(innerWidth-r>=tw+24){tx=r+14;ty=evoClamp(y,8,innerHeight-th-8);}}
  tip.style.left=tx+'px';tip.style.top=evoClamp(ty,8,Math.max(8,innerHeight-th-8))+'px';
 }
 pgSpotRAF=requestAnimationFrame(pgSpotPosition);
}
function pgSpotShow(target,copy,step,{next=false,launch=false}={}){const guideKey=step+':'+next+':'+launch;if(pgTutorialTarget===target&&$('pgSpotlight')?.dataset.guideKey===guideKey)return;pgSpotClear();pgTutorialTarget=target;target.scrollIntoView({block:'nearest',inline:'nearest'});document.body.classList.add('pg-guided');const root=pgNode('div',null,'pg-spotlight');root.id='pgSpotlight';root.dataset.guideKey=guideKey;root.classList.add('pg-overview');const overview=pgNode('span',pgText('먼저 화면을 살펴보세요 · 곧 선택할 곳을 알려드릴게요','Take a look around · Your next step will be highlighted'),'pg-overview-note');root.append(overview);
 for(let i=0;i<4;i++)root.append(pgNode('div',null,'pg-shade'));const ring=pgNode('div');ring.id='pgFocusRing';root.append(ring);
 const tip=pgNode('aside',null,'pg-tutor-v2');tip.id='pgTutor';tip.setAttribute('role','dialog');tip.setAttribute('aria-modal','true');tip.setAttribute('aria-label',pgText('기본 튜토리얼','Basic Tutorial'));
 tip.append(pgNode('small',pgText('기본 튜토리얼','BASIC TUTORIAL')+(launch?'':' · '+step+' / 24')),pgNode('p',copy));const controls=pgNode('div',null,'pg-tutor-actions');
 if(next){const button=pgButton('pgTutorialNext',step===24?pgText('출격 준비 완료','READY TO PLAY'):pgText('다음','NEXT'),pgTutorialAdvance,'pg-button pg-primary pg-guide-next');button.append(pgNode('span','›','pg-next-arrow'));controls.append(button);}
 else controls.append(pgNode('span',pgText('밝게 표시된 곳을 눌러주세요','Tap the highlighted control'),'pg-tutor-hint'));
 if(!launch)controls.append(pgButton('pgTutorialLater',pgText('나중에 이어보기','Continue later'),()=>{pgState().tutorialDeferred=true;metaSave();pgSpotClear();showMenu();},'pg-inline'));
 if(!launch)root.classList.add('pg-hub-lesson');tip.append(controls);root.append(tip);document.body.append(root);pgSpotPosition();
 // Copy and the target ring are visible immediately; the surrounding screen
 // settles into dim/blur afterwards. Advancing early never waits for this timer.
 pgSpotTimer=setTimeout(()=>{if(root.isConnected)root.classList.remove('pg-overview');},650);(next?$('pgTutorialNext'):target).focus({preventScroll:true});
}
function pgTutorialGift(){const p=pgState();if(p.tutorial===5)pgGrantOnce('unit-training-funds',300,0);if(p.tutorial===9)pgGrantOnce('promotion-training-funds',0,1000);if(p.tutorial===13)pgGrantOnce('relic-training-funds',100,0);if(p.tutorial===24)pgGrantOnce('graduation-funds',30,200);}
function pgTutorialRefresh(){if(PG.reveal){pgSpotClear();return;}const p=pgState();if(!p)return;if(PG.launchPrompt&&mode==='menu'){const target=$('pgInfinity');if(target)pgSpotShow(target,pgText('지휘관님, 첫 출격을 시작해 볼까요? 인피니티 스테이지를 누르면 전장에서 하나씩 알려드릴게요.','Welcome, Commander. Select Infinity Mode. We will teach you the controls on the battlefield.'),0,{launch:true});return;}
 const l=PG_LESSONS[p.tutorial];if(!l||p.tutorialDeferred||mode!=='menu'){pgSpotClear();return;}pgTutorialGift();const target=$(l[0]);if(!target){pgSpotClear();return;}pgSpotShow(target,pgText(l[1],l[2]),p.tutorial,{next:l[3]==='next'});
}
function pgBeginTutorial(){if(pgState().tutorial>=25)return;pgFieldClear();PG.launchPrompt=false;if(!pgState().tutorial)pgState().tutorial=1;pgState().tutorialDeferred=false;metaSave();pgResumeTutorial();}
function pgResumeTutorial(){const n=pgState().tutorial;pgSpotClear();pgTutorialGift();
 if([1,4,7,11,15].includes(n)||n>=20)showMenu();else if(n===2)pgOpenStory(1);else if(n===3)pgStoryDetail('1-1');
 else if(n===5||n===12)pgOpenShop('unit');else if(n===13)pgOpenShop('relic');else if(n===6||n===14){const last=pgState().lastDraw;if(last)pgDrawResult(last.kind,last.result);}
 else if(n===8)pgOpenUnits();else if(n===9||n===10)pgUnitDetail('infantry');else if(n===16||n===18)pgOpenRelics();else if(n===17)pgRelicDetail('r_core');else if(n===19)pgOpenCore();pgTutorialRefresh();
}
function pgTutorialAdvance(){const p=pgState();p.tutorial++;metaSave();if(p.tutorial>=25){pgSpotClear();showMenu();return;}pgResumeTutorial();}
document.addEventListener('click',e=>{if(!$('pgSpotlight'))return;const button=e.target.closest('button'),p=pgState(),lesson=PG_LESSONS[p.tutorial];
 if(button?.id==='pgTutorialNext'||button?.id==='pgTutorialLater')return;
 const expected=PG.launchPrompt?'pgInfinity':lesson?.[3]==='next'?null:lesson?.[0];
 if(!button||button.id!==expected){e.preventDefault();e.stopImmediatePropagation();return;}if(PG.launchPrompt)return;const step=p.tutorial;
 setTimeout(()=>{if(p.tutorial!==step||PG.reveal)return;if(step===5&&!p.grants['tutorial-unit-draw']||step===13&&!p.grants['tutorial-relic-draw']||step===9&&unitLv('infantry')<1)return;pgTutorialAdvance();},0);
},true);
document.addEventListener('keydown',e=>{if(!$('pgSpotlight'))return;const nodes=[pgTutorialTarget,$('pgTutorialNext'),$('pgTutorialLater')].filter(n=>n?.matches('button')&&!n.disabled);if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();const i=nodes.indexOf(document.activeElement);nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}else if((e.key==='Enter'||e.key===' ')&&!nodes.includes(document.activeElement)){e.preventDefault();e.stopImmediatePropagation();}},true);
// Movement and capture are hands-on. Pause only for the first pickup explanation.
function pgCloseFieldItems(resume=true){const lesson=PG.itemLesson;if(!lesson)return;PG.itemLesson=null;window.removeEventListener('keydown',lesson.key,true);lesson.root.remove();if(resume&&S===lesson.battle&&mode==='pause'){
 if(lesson.page===PG_ITEM_GUIDE_GROUPS.length-1){const p=pgState();p.battleBasicsDone=true;delete p.fieldItemPage;metaSave();}
 S.pgFieldLesson='ready';S.pgFieldAge=0;setPaused(false);pgFieldRender();}}
function pgShowFieldItems(){if(PG.itemLesson||mode!=='play'||S?.pgFieldLesson!=='items')return;$('pgFieldGuide')?.remove();setPaused(true);$('pausePanel').classList.remove('on');
 const root=pgNode('div',null,'pg-field-items pg-item-modal');root.id='pgFieldItems';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','pgItemTitle');const panel=pgNode('section',null,'pg-panel');
 root.append(panel);const lesson={battle:S,root,panel,page:pgInt(pgState().fieldItemPage,PG_ITEM_GUIDE_GROUPS.length-1),armed:false,key:null};PG.itemLesson=lesson;
 // Require a new press: releasing the joystick that collected the pickup must
 // not dismiss the lesson. Consume the whole click before resuming combat.
 root.addEventListener('pointerdown',e=>{if(e.button!==0)return;lesson.armed=true;e.stopPropagation();});root.addEventListener('pointercancel',()=>{lesson.armed=false;});
 root.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(!lesson.armed&&e.detail!==0)return;if(e.target.closest('#pgFieldPrevious'))pgPreviousFieldItems();else pgAdvanceFieldItems();},true);
 lesson.key=e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(e.code==='Enter'||e.code==='Space'){if(document.activeElement?.id==='pgFieldPrevious')pgPreviousFieldItems();else pgAdvanceFieldItems();}else if(e.code==='ArrowLeft')pgPreviousFieldItems();else if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button:not(:disabled)')],i=controls.indexOf(document.activeElement);controls[(i+(e.shiftKey?-1:1)+controls.length)%controls.length]?.focus({preventScroll:true});}};window.addEventListener('keydown',lesson.key,true);document.body.append(root);pgRenderFieldItemPage();
}
function pgFieldClear(){pgCloseFieldItems(false);document.body.classList.remove('pg-field-guided');$('pgFieldGuide')?.remove();$('pgFieldItems')?.remove();if(S){S.pgFieldLesson=null;S.items?.forEach(i=>{if(i.pgPractice)delete i.pgPractice;});}}
function pgFieldRender(){if(!S?.pgFieldLesson||mode!=='play')return;document.body.classList.add('pg-field-guided');const phase=S.pgFieldLesson;if(phase==='items'){pgShowFieldItems();return;}let p=$('pgFieldGuide');if(!p){p=pgNode('aside',null,'pg-field-guide');p.id='pgFieldGuide';document.body.append(p);}const copy={
move:[pgText('01 · 전장에 오신 것을 환영합니다','01 · WELCOME TO THE FIELD'),isTouch?pgText('왼쪽 조이스틱을 밀어 움직여 보세요.','Push the left joystick to move.'):pgText('WASD 또는 방향키로 움직여 보세요.','Move with WASD or the arrow keys.')],
capture:[pgText('02 · 적을 내 편으로','02 · RECRUIT YOUR FIRST ALLY'),isTouch?pgText('오른쪽 조이스틱을 표시된 적 쪽으로 밀고 유지하세요.','Hold the right joystick toward the marked enemy.'):pgText('표시된 적을 향해 마우스를 꾹 누르세요.','Aim at the marked enemy and hold the mouse button.')],
attack:[pgText('03 · 첫 동료, 합류 완료!','03 · YOUR FIRST ALLY IS READY'),pgText('포획을 놓으면 함께 자동 공격합니다. 근처에 푸른 보호막 보급품을 준비했어요.','Release capture to fire together. A blue shield pickup is waiting nearby.')],
supply:[pgText('04 · 보급품을 향해 이동하세요','04 · COLLECT YOUR SUPPLIES'),pgText('푸른 보호막 아이템에 가까이 가보세요. 버튼 없이 자동으로 획득합니다.','Move toward the blue shield. Pickups are collected automatically—no button needed.')],
items:[pgText('보호막 장착 완료 · 보급품을 기억하세요','SHIELD ONLINE · KNOW YOUR SUPPLIES'),pgText('방금 얻은 보호막은 한 번의 공격을 막아줘요. 전장에서 다른 보급품도 만나보세요.','Your shield blocks one hit. Look out for these other battlefield supplies.')],
ready:[pgText('이제 함께 보스를 공략해 볼까요?','READY TO TAKE ON THE BOSS?'),pgText('편대와 함께 적을 돌파하세요. 첫 전투가 끝나면 기지에서 다음 준비를 도와드릴게요!','Push forward with your squad. After this battle, we will prepare your next sortie at base!')]
};p.replaceChildren(pgNode('small',pgText('기본 튜토리얼','BASIC TUTORIAL')),pgNode('strong',copy[phase][0]),pgNode('p',copy[phase][1]));
if(phase==='move'||phase==='capture')p.append(pgButton('pgFieldSkip',pgText('안내 건너뛰기','Skip controls guide'),()=>{relSkipGuide();pgState().battleBasicsDone=true;delete pgState().fieldItemPage;metaSave();pgFieldClear();},'pg-inline'));
}
function pgPracticeSupply(){if(S.items.some(i=>i.pgPractice))return;let point;for(let j=0;j<16;j++){const a=-Math.PI/2+j*Math.PI/8,x=evoClamp(S.px+Math.cos(a)*122,40,WORLD.w-40),y=evoClamp(S.py+Math.sin(a)*122,40,WORLD.h-40);if(!blockedByProp(x,y)){point={x,y};break;}}point=point||{x:S.px+34,y:S.py};S.items.push({k:'SHLD',...point,t:0,pgPractice:true});S.fx.push({k:'ring',...point,r:6,max:38,life:700,t:700,c:'#88dedb'});}
// Capture controls and the pickup lesson have separate completion states.
// Reconstruct transient practice supplies only after the checkpoint is restored.
function pgRestoreFieldLesson(){const p=pgState();if(!S||mode!=='play'||p.battleBasicsDone)return;
 S.pgFieldAge=0;
 if(Number.isInteger(p.fieldItemPage)){S.relGuide=0;S.pgFieldLesson='items';}
 else if(META.relGuideDone){S.relGuide=0;S.pgFieldLesson='supply';pgPracticeSupply();}
 else if(!S.story&&S.relGuide===1){S.pgFieldLesson='move';S.pgMoveOrigin={x:S.px,y:S.py};}
 else return;
 pgFieldRender();
}
const pgLessonPlay=basicPlay;basicPlay=function(){pgSpotClear();PG.launchPrompt=false;pgLessonPlay();if(!PG.resuming&&!REL.resuming)pgRestoreFieldLesson();};
const pgLessonContinue=relContinue;relContinue=function(){pgLessonContinue();pgRestoreFieldLesson();};
const pgLessonStory=pgStartStory;pgStartStory=function(id){pgLessonStory(id);if(S?.story?.id===id)pgRestoreFieldLesson();};
const pgLessonPause=setPaused;setPaused=function(on){pgLessonPause(on);if(mode==='pause')$('pgFieldGuide')?.remove();else if(mode==='play'&&S?.pgFieldLesson&&!PG.itemLesson)pgFieldRender();};
const pgLessonConvert=convertToAlly;convertToAlly=function(u){const lesson=S?.pgFieldLesson;pgLessonConvert(u);if(lesson==='move'||lesson==='capture'){S.pgFieldLesson='attack';S.pgFieldAge=0;S.spawnCd=Math.max(S.spawnCd,4000);pgPracticeSupply();pgFieldRender();}};
const pgLessonPickup=pickup;pickup=function(k,src){const practice=src?.pgPractice;pgLessonPickup(k,src);if(practice&&S.pgFieldLesson){S.pgFieldLesson='items';S.pgFieldAge=0;pgState().fieldItemPage=0;META.relGuideDone=true;S.relGuide=0;metaSave();const battle=S;queueMicrotask(()=>{if(S===battle&&S.pgFieldLesson==='items')pgFieldRender();});}};
const pgLessonUpdate=update;update=function(dt){pgLessonUpdate(dt);if(mode==='play'&&S?.pgFieldLesson){S.pgFieldAge=(S.pgFieldAge||0)+dt;
if(S.pgFieldLesson==='move'&&Math.hypot(S.px-S.pgMoveOrigin.x,S.py-S.pgMoveOrigin.y)>=38){S.pgFieldLesson='capture';pgFieldRender();}
if(S.pgFieldLesson==='attack'&&S.pgFieldAge>2600){S.pgFieldLesson='supply';S.pgFieldAge=0;pgFieldRender();}
for(const i of S.items)if(i.pgPractice)i.t=0;
if(S.pgFieldLesson==='ready'&&S.pgFieldAge>5500)pgFieldClear();
}if(mode==='menu'||mode==='over')pgFieldClear();};
const pgLessonMenu=showMenu;showMenu=function(){pgFieldClear();pgLessonMenu();};
const pgFirstClearRoll=rollUpgrades;rollUpgrades=function(){if(!S.story&&S.stage===1&&pgState().tutorial===0&&!pgState().tutorialDeferred){queueMicrotask(()=>{evoDebriefReset();startStage(2);relSaveCheckpoint();showMenu();pgBeginTutorial();});return;}pgFirstClearRoll();};

/* Reuse the authored US-style vector insignia. Cache once; no per-frame SVG work. */
const pgRankImages=new Map(),pgMotionQuery=matchMedia('(prefers-reduced-motion: reduce)');
const pgRankOriginalSVG=rankSVG;
rankSVG=function(key,size){let svg=pgRankOriginalSVG(key,size);if(key==='2LT'||key==='MAJ')svg=svg.replaceAll('#C9CFD4','#c6a45f');return svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');};
function pgRankImage(key){if(pgRankImages.has(key))return pgRankImages.get(key);const im=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(rankSVG(key,64));pgRankImages.set(key,im);return im;}
for(const rank of RANKS)pgRankImage(rank.k);
function pgRankBadge(kind,key){const wrap=pgNode('span',null,'pg-rank-badge');const rk=rankOf(kind,key);wrap.innerHTML=rankSVG(rk.k,30);wrap.append(pgNode('small',rankName(kind,key)));return wrap;}
const pgUnitCards=pgOpenUnits;pgOpenUnits=function(...args){pgUnitCards(...args);for(const card of document.querySelectorAll('#cgHub .pg-collection-card')){const key=card.id.replace('pgUnit','');if(VELCARION[key])continue;card.append(pgRankBadge(LEGENDS[key]?'legend':'unit',key));}};
const pgUnitSheet=pgUnitDetail;pgUnitDetail=function(key){pgUnitSheet(key);if(!VELCARION[key])$('cgHub').querySelector('.pg-unit-hero>div')?.prepend(pgRankBadge(LEGENDS[key]?'legend':'unit',key));};
const pgRankDraw=drawUnit;drawUnit=function(u,x,y){pgRankDraw(u,x,y);if(u.side!=='ally'||u.gone||u.hg?.dead||VELCARION[u.type])return;const kind=u.isLegend?'legend':'unit',rank=rankIdx(kind,u.type),im=pgRankImage(RANKS[rank].k);if(!im.complete||!im.naturalWidth)return;
 const size=rank>=RANK_INDEX.BG?26:22,top=y-u.w*.56-size-5;ctx.save();
 const reduced=META.basicReduceMotion||pgMotionQuery.matches,phase=(S.relTime||0)*.0015+(u.x||0)*.013;
 // A small shadow follows the actual transparent insignia silhouette.
 if(rank>=RANK_INDEX.MG){ctx.shadowColor='#d7c593';ctx.shadowBlur=reduced?3.2:3.2+Math.sin(phase)*1.1;}
 else{ctx.shadowColor='#031018';ctx.shadowBlur=1.5;}
 ctx.drawImage(im,x-size/2,top,size,size);ctx.shadowBlur=0;
 if(rank>=RANK_INDEX.MAJ&&!reduced){const p=(phase/5)%1,shine=Math.max(0,1-Math.abs(p-.5)*9);if(shine>0){const sx=x-size*.2+p*size*.4,sy=top+size*.36;ctx.globalAlpha=shine*.65;ctx.strokeStyle='#f2dfaf';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(sx-2,sy);ctx.lineTo(sx+2,sy);ctx.moveTo(sx,sy-2);ctx.lineTo(sx,sy+2);ctx.stroke();}}
 ctx.restore();};

/* Three independently evaluated objectives; this sortie and best stars stay distinct. */
const pgResultsRoll=rollUpgrades;
rollUpgrades=function(){const layer=$('lyUp');layer.classList.toggle('pg-story-result',!!S.story);pgResultsRoll();if(!S.story)return;
 const results=S.missionRes||[],earned=results.filter(r=>r.ok).length,newStars=results.filter(r=>r.isNew).length,total=storyRec(S.story.id).stars.filter(Boolean).length;
 $('upTitle').textContent=pgText('이번 작전 · ','THIS SORTIE · ')+earned+' / 3 '+pgText('별 획득','STARS');
 const box=$('missionBox');box.replaceChildren();const grid=pgNode('div',null,'pg-stars-results');
 results.forEach((r,i)=>{const c=pgNode('article',null,'pg-star-result '+(r.ok?'earned':'failed'));c.style.setProperty('--delay',(i*.38+.12)+'s');const visual=pgNode('div',null,'pg-star-visual');const star=pgNode('span','★','pg-result-star');star.setAttribute('aria-hidden','true');visual.append(star);
 for(let j=0;j<7;j++){const dust=pgNode('i',null,'pg-star-dust');dust.style.setProperty('--dx',((j-3)*11)+'px');dust.style.setProperty('--dy',(-10-(j%3)*8)+'px');visual.append(dust);}c.append(visual,pgNode('strong',r.ok?pgText('달성','COMPLETE'):pgText('미달성','NOT COMPLETED')),pgNode('p',r.n),pgNode('small',r.isNew?pgText('새로운 별 +1 · 15 AST','NEW STAR +1 · 15 AST'):r.ok?pgText('이미 보유한 별','PREVIOUSLY EARNED'):pgText('재도전으로 획득 가능','EARN ON A REPLAY')));grid.append(c);});
 box.append(grid,pgNode('p',pgText('이번 새 별 ','NEW STARS ')+newStars+'  ·  '+pgText('이 스테이지 누적 ','BEST FOR THIS OPERATION ')+total+' / 3','pg-star-total'));
 if(S.pgChapterBonus)box.append(pgNode('p',pgText('이번 장 전체 첫 완료 · +60 AST','CHAPTER COMPLETE · First-clear bonus +60 AST'),'pg-reward'));
 layer.setAttribute('aria-label',pgText('스토리 작전 결과. 이번 별 ','Story result. Stars this sortie: ')+earned+pgText('개. 누적 별 ','; best stars: ')+total);
};

/* The purchase is committed once by pgDraw. This presentation never awards cards. */
function pgRevealTier(r){if(HEROES[r.key])return 'ascendant';if(r.kind==='legend')return 'legend';if(r.kind==='relic'){const ra=RELICS[r.key]?.ra;return ra==='SSR'?'legend':ra==='SR'?'epic':'relic';}return r.grade==='P'?'epic':r.grade==='E'?'elite':'standard';}
const PG_TIER_ORDER=['standard','relic','elite','epic','legend','ascendant'];
function pgTierName(t){return ({ascendant:pgText('초월 영웅','ASCENDANT'),legend:pgText('레전드','LEGENDARY'),epic:pgText('에픽','EPIC'),elite:pgText('엘리트','ELITE'),relic:pgText('유물','RELIC'),standard:pgText('편대 지원','SQUAD REINFORCEMENT')})[t];}
function pgRevealSound(state,release=false){if(!actx||!soundOn||actx.state!=='running'||!BUS_SFX)return;const at=actx.currentTime;
 const tone=(f,to,dur,vol,delay=0,type='sine')=>{const o=actx.createOscillator(),g=actx.createGain(),lp=actx.createBiquadFilter(),t=at+delay;o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);lp.type='lowpass';lp.frequency.value=1900;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(lp);lp.connect(g);g.connect(BUS_SFX);state.voices.add(o);o.onended=()=>{state.voices.delete(o);o.disconnect();g.disconnect();lp.disconnect();};o.start(t);o.stop(t+dur+.03);};
 if(!release){for(let i=0;i<4;i++)tone(146.83*Math.pow(2,i/12),146.83*Math.pow(2,i/12),.12,.045,i*.16,'triangle');tone(73.42,293.66,.95,.035,.5);}
 else{tone(92,42,.4,.16);const chord=state.tier==='ascendant'?[293.66,440,587.33,880]:[293.66,349.23,440];chord.forEach((f,i)=>tone(f,f,1.0,.025,i*.045,'triangle'));
 const b=actx.createBuffer(1,Math.floor(actx.sampleRate*.28),actx.sampleRate),v=b.getChannelData(0);for(let i=0;i<v.length;i++)v[i]=(Math.random()*2-1)*Math.pow(1-i/v.length,3);const src=actx.createBufferSource(),g=actx.createGain(),lp=actx.createBiquadFilter();src.buffer=b;g.gain.value=.09;lp.type='lowpass';lp.frequency.value=800;src.connect(lp);lp.connect(g);g.connect(BUS_SFX);state.voices.add(src);src.onended=()=>{state.voices.delete(src);src.disconnect();g.disconnect();lp.disconnect();};src.start();}
}
function pgSummonReveal(kind,result,{tutorial=false,preview=false}={}){
 if(PG.reveal||!result?.length)return;const lead=result.reduce((a,b)=>PG_TIER_ORDER.indexOf(pgRevealTier(b))>PG_TIER_ORDER.indexOf(pgRevealTier(a))?b:a),tier=pgRevealTier(lead),rare=PG_TIER_ORDER.indexOf(tier)>=4,reduced=META.basicReduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const state={kind,result,tier,voices:new Set(),age:0,last:0,frame:0,released:false,finished:false};PG.reveal=state;const step=pgState().tutorial;pgSpotClear();cgCloseHub();cgResumeAudio();
 if(preview&&mode==='play'){state.resumeBattle=true;setPaused(true);$('pausePanel').classList.remove('on');}
 const root=pgNode('section',null,'pg-summon pg-tier-'+tier+(reduced?' pg-motion-reduced':''));root.id='pgSummon';root.tabIndex=-1;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',pgText('소환 연출','Summoning sequence'));
 const header=pgNode('header');header.append(pgNode('small',preview?pgText('MASTER · 연출 확인 · 보상 없음','MASTER · PRESENTATION PREVIEW · NO REWARDS'):pgText('보급 신호 연결','SUPPLY UPLINK')),pgNode('h2',pgText('새로운 전력이 도착합니다','REINFORCEMENTS INBOUND')));
 const arena=pgNode('div',null,'pg-summon-arena'),canvas=pgNode('canvas'),reactor=pgIcon('reactor'),unit=pgImage(lead.kind==='relic'?RELICS[lead.key].ic:lead.key);canvas.id='pgSummonFX';reactor.classList.add('pg-reactor');unit.className='pg-summon-unit';arena.append(canvas,reactor,unit);
 const label=pgNode('div',null,'pg-summon-label');label.setAttribute('aria-live','polite');label.append(pgNode('small',pgTierName(tier)),pgNode('strong',nm(lead.key)),pgNode('span',result.length>1?pgText('함께 도착한 보급 ','TOTAL SUPPLIES: ')+result.length+pgText('개',''):pgText('새로운 가능성을 확보했습니다','A NEW POSSIBILITY, SECURED')));
 const status=pgNode('p',pgText('신호 탐색 · 에너지 안정화','SCANNING SIGNAL · STABILIZING CORE'),'pg-summon-status'),skip=pgButton('pgRevealSkip',pgText('연출 건너뛰기','SKIP ANIMATION'),()=>finish(),'pg-button');root.append(header,arena,label,status,skip);document.body.append(root);skip.focus();
 const finish=()=>{if(state.finished)return;state.finished=true;cancelAnimationFrame(state.frame);for(const voice of state.voices){try{voice.stop();}catch{}}state.voices.clear();root.remove();PG.reveal=null;
  if(preview){if(state.resumeBattle&&mode==='pause')setPaused(false);pgMasterPanel();return;}
  if(tutorial&&pgState().tutorial===step&&(step===5||step===13)){pgTutorialAdvance();}else pgDrawResult(kind,result);
 };
 state.finish=finish;root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish();}if(e.key==='Tab'){e.preventDefault();skip.focus();}});
 pgRevealSound(state);const q=canvas.getContext('2d'),releaseAt=reduced?180:rare?1700:1350,endAt=reduced?650:rare?4700:3200;
 function paint(now){if(state.finished)return;const dt=state.last?Math.min(50,now-state.last):0;state.last=now;if(!document.hidden)state.age+=dt;const age=state.age;
  if(!root.isConnected){finish();return;}
  if(age>=releaseAt&&!state.released){state.released=true;root.classList.add('pg-released');status.textContent=pgText('신호 확인 · 보급 확보','SIGNAL CONFIRMED · SUPPLIES SECURED');pgRevealSound(state,true);}
  const b=arena.getBoundingClientRect(),dpr=Math.min(1.5,devicePixelRatio||1),w=Math.max(1,b.width),h=Math.max(1,b.height);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}q.setTransform(dpr,0,0,dpr,0,0);q.clearRect(0,0,w,h);q.translate(w/2,h/2);const size=Math.min(w,h),r=size*.3,t=age*.001,color=tier==='ascendant'?'#b4a2ef':rare?'#e2c782':tier==='relic'?'#92d8ba':'#82c5d2';q.strokeStyle=color;q.fillStyle=color;
  if(!reduced){q.save();q.rotate(t*.3);for(let j=0;j<3;j++){q.lineWidth=j?1:2;q.globalAlpha=j?.32:.72;q.beginPath();for(let k=0;k<6;k++)q.arc(0,0,r*(1+j*.22),k*Math.PI/3+j*.13,k*Math.PI/3+.65+j*.13);q.stroke();}q.restore();
   const charge=Math.min(1,age/releaseAt);for(let i=0;i<30;i++){const p=(t*(.5+charge)+i*.137)%1,a=i*2.399+t*.25,rr=r*(2.3-p*2.1);q.globalAlpha=Math.sin(p*Math.PI)*.7;q.lineWidth=i%3?1:2;q.beginPath();q.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);q.lineTo(Math.cos(a)*(rr+7),Math.sin(a)*(rr+7));q.stroke();}
   if(state.released){const v=(age-releaseAt)/1000,fade=Math.max(0,1-v/2.4);q.globalCompositeOperation='lighter';for(let j=0;j<3;j++){q.globalAlpha=Math.max(0,1-v/(.55+j*.25))*.6;q.lineWidth=2-j*.5;q.beginPath();q.ellipse(0,0,Math.max(1,r*(.3+v*2.5+j*.2)),Math.max(1,r*(.16+v*(j===2?.7:2.5))),j===2?-.2:0,0,Math.PI*2);q.stroke();}
    const count=rare?76:36;for(let i=0;i<count;i++){const a=i*2.399,velocity=28+(i*31%71),dist=r*.35+v*velocity,xx=Math.cos(a)*dist,yy=Math.sin(a)*dist+v*v*10;q.globalAlpha=fade*(.35+(i%4)*.16);q.fillStyle=i%4?color:'#f4e8c7';q.fillRect(xx,yy,i%7?1.5:3,i%7?1.5:3);}q.globalCompositeOperation='source-over';}
  }
  if(age>=endAt){finish();return;}state.frame=requestAnimationFrame(paint);
 }state.frame=requestAnimationFrame(paint);
}
const pgRevealResults=pgDrawResult;pgDrawResult=function(kind,result){pgRevealResults(kind,result);const cards=[...document.querySelectorAll('#cgHub .pg-result-grid>.pg-collection-card')];cards.forEach((card,i)=>{const tier=pgRevealTier(result[i]);card.classList.add('pg-result-revealed','pg-tier-'+tier);card.style.setProperty('--reveal-delay',Math.min(i,9)*.075+'s');card.prepend(pgNode('small',pgTierName(tier),'pg-rarity-label'));});};

/* Preserve each hero's combat mechanics. Add tightly bounded weapon-local detail. */
const pgHeroCombatDraw=drawHeroCombat;
drawHeroCombat=function(cx,cy){pgHeroCombatDraw(cx,cy);if(!S?.hero)return;const reduced=META.basicReduceMotion||pgMotionQuery.matches;if(reduced)return;ctx.save();ctx.globalCompositeOperation='lighter';
 for(const u of [...S.allies,...S.enemies]){if(!isHero(u)||u.hg.dead)continue;const q=u.hg;if(u.type==='L_astra'&&q.sweepOn&&q.sweepWarn<=0){for(const line of q.lines||[]){const x=line.ex-cx,y=line.ey-cy;if(x<0||x>W||y<0||y>H)continue;const pulse=.55+.2*Math.sin(q.age*.027);heroGlow(ctx,x,y,12,TEAM_ENERGY[u.side==='ally'?'ally':'enemy'].color+'70',pulse);ctx.strokeStyle=TEAM_ENERGY[u.side==='ally'?'ally':'enemy'].core;ctx.lineWidth=.8;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();}}
  if(u.type==='L_nemesis'&&q.stormOn){const t=Math.min(1,q.stormAge/2000),x=q.stormOrigin.x-cx,y=q.stormOrigin.y-cy;ctx.strokeStyle=u.side==='ally'?'#b8b0ed':TEAM_ENERGY.enemy.color;ctx.lineWidth=.8;ctx.globalAlpha=.35*t;for(let i=0;i<3;i++){const a=q.age*.0018+i*2.094,r=30+t*22;ctx.beginPath();ctx.ellipse(x,y,r,r*.45,a,a,a+1.8);ctx.stroke();}}
 }ctx.restore();};

/* Captured Legends gain a sortie-only elite bonus and a durable card receipt. */
const PG_LEGEND_BALANCE=2;
STR.ko.tov4Tip='포획 성공 시 정예 레전드가 합류하고 카드 1장을 확보합니다. 성공률 5~10%. 지원 소환은 카드를 주지 않습니다.';
STR.en.tov4Tip='Capture at 5–10% success to recruit an Elite Legend and secure one card. Support summons award no cards.';
STR.ko.storyNote='첫 클리어 35 AST · 새 임무 별마다 15 AST · 재도전 12 AST. 한 장 전체 첫 완료 시 +60 AST.';
STR.en.storyNote='First clear: 35 AST · Each new mission star: 15 AST · Replay: 12 AST. First full chapter clear: +60 AST.';
function pgLegendPower(a){return (isHero(a)?.75:1.25)*powerMul('legend',a.type)*(1+(S.evoSquad||0)*.2)*(a.pgElite?1.15:1);}
const pgLegendCreate=makeLegend;
makeLegend=function(key,x,y,side){const a=pgLegendCreate(key,x,y,side);if(side!=='ally')return a;
 a.hpMax*=1.2;a.hp=a.hpMax;a.dmgMul=pgLegendPower(a);
 a.armor=isHero(a)?.28:Math.min(.32,Math.max(.16,(a.armor||0)+.10));
 if(!isHero(a)){
  // All direct-hit paths, including boss beams and area damage, share armor.
  let hull=a.hp;Object.defineProperty(a,'hp',{enumerable:true,get:()=>hull,set(value){if(!Number.isFinite(value))return;hull=value<hull&&!a.pgRestoringHealth?hull-(hull-value)*(1-a.armor):value;}});
  a.pgArmorManaged=true;
  for(const w of a.wep){
   w.cd=w.cd0*=.92;
   if(w.t==='gatling')w.spread=(w.spread||.3)*.72;
   if(w.t==='missile'&&!w.big||w.t==='rear')w.pgGuided=true;
   if(w.big)w.splashR*=1.15;
   if(w.t==='side'){w.bspd*=1.1;w.range*=1.15;}
   if(w.t==='laser'){w.width=(w.width||8)*1.1;w.range*=1.08;}
   if(w.t==='radial')w.bspd*=1.15;
   if(w.t==='seeker')w.n=Math.min(5,w.n+1);
   if(w.t==='chain')w.links=Math.min(5,w.links+1);
   if(w.t==='spin')w.spin*=1.12;
  }
 }
 return a;
};
const pgLegendProjectile=legendBullet;
legendBullet=function(u,ang,w,kind,extra){if(u.side==='ally'&&w.pgGuided){const target=nearestTarget(u.x,u.y,w.range||640);if(target)extra={...extra,seekId:target};}return pgLegendProjectile(u,ang,w,kind,extra);};
evoLegendRecord=function(a){return {key:a.type,hp:a.hp,hpMax:a.hpMax,balance:PG_LEGEND_BALANCE,elite:!!a.pgElite,support:!!a.pgSupport};};
function pgMigrateLegendHull(d){if(d.balance===PG_LEGEND_BALANCE)return d;const scale=1.2;return {...d,hp:d.hp*scale,hpMax:Number.isFinite(d.hpMax)?d.hpMax*scale:undefined,balance:PG_LEGEND_BALANCE};}
evoRestoreLegend=function(record,x,y){const d=pgMigrateLegendHull(record),a=makeLegend(d.key,x,y,'ally');a.pgElite=d.elite===true&&!HEROES[d.key];a.pgSupport=d.support===true&&!a.pgElite;a.dmgMul=pgLegendPower(a);if(Number.isFinite(d.hpMax))a.hpMax=d.hpMax;a.pgRestoringHealth=true;a.hp=Math.min(a.hpMax,d.hp);a.pgRestoringHealth=false;return a;};
const pgLegendLoad=metaLoad;
metaLoad=function(){pgLegendLoad();const save=META.relaunchRun;if(save){for(const k of ['legends','legendReserve'])if(Array.isArray(save[k]))save[k]=save[k].map(pgMigrateLegendHull);metaSave();}};
const pgLegendUpgrade=evoApplyUpgrade;
evoApplyUpgrade=function(u){pgLegendUpgrade(u);for(const a of S.allies)if(a.isLegend)a.dmgMul=pgLegendPower(a);};
const pgLegendRecruit=evoRecruitLegend;
evoRecruitLegend=function(e){if(e.pgCaptured||e.side!=='neutral'||HEROES[e.type])return;
 const roster=evoOwnedLegends(),existing=roster.find(d=>d.key===e.type);if(existing?.elite||!existing&&roster.length>=10)return;
 // Keep the fleet cap: the most damaged active Legend rests in reserve so the
 // new elite can fight immediately. Reserve units receive no free healing.
 let a=S.allies.find(u=>u.isLegend&&u.hp>0&&u.type===e.type);
 if(!a){
  const active=S.allies.filter(a=>a.isLegend&&a.hp>0);
  if(active.length>=evoLegendCap()){const relieved=active.reduce((a,b)=>a.hp/a.hpMax<=b.hp/b.hpMax?a:b);(S.evoReserve||=[]).push(evoLegendRecord(relieved));S.allies.splice(S.allies.indexOf(relieved),1);}
  if(existing){S.evoReserve=S.evoReserve.filter(d=>d.key!==e.type);a=evoRestoreLegend(existing,e.x,e.y);S.allies.push(a);S.killed++;}
  else{pgLegendRecruit(e);a=S.allies.find(u=>u.isLegend&&u.hp>0&&u.type===e.type);}
 }else S.killed++;
 if(!a)return;
 e.pgCaptured=true;pgMarkEliteLegend(a);pgSecureLegendCard(e);relSaveCheckpoint();
 relToast(nm(e.type)+' · 정예 합류! 체력·공격력 +15% · 카드 +1 확보',nm(e.type)+' · ELITE! Hull & damage +15% · 1 card secured');
};
const PG_LEGEND_ROLES={
 L_vulcan:['집중 기관포 · 추적 미사일','Focused gatling · Guided missiles'],L_gunship:['정밀 연사 · 공중 추적 포격','Accurate bursts · Guided aerial salvo'],
 L_cannon:['확장 폭발 반경의 중포격','Heavy shells with wider blast radius'],L_twin:['집중 연사 · 장거리 측면 탄막','Focused bursts · Extended broadside'],
 L_lancer:['강화 관통 빔 · 사거리 확장','Stronger piercing beam · Extended range'],L_sweeper:['고속 전방위 탄막','Faster radial barrage'],
 L_cruiser:['집중 기관포 · 측면 탄막 · 추적 후방탄','Focused gatling · Broadside · Guided rear missiles'],L_titan:['광역 중포 · 최대 5기 동시 추적','Heavy blast · Track up to 5 targets'],
 L_phantom:['최대 5기 연쇄 전격','Chain lightning across up to 5 targets'],L_nova:['고속 회전 관통 빔','Faster rotating piercing beams'],
 L_astra:['강화 4문 레이저 · 회전 빔 · 펄스 · 돌진','Enhanced quad lasers · Sweep · Pulse · Dash'],L_nemesis:['강화 연사 · 8발 미사일 · 폭풍 · 블랙홀','Enhanced bursts · 8-missile salvo · Storm · Black hole']
};
// Show the actual new battlefield characteristics instead of legacy Full stats.
legendWeapons=function(key){const role=PG_LEGEND_ROLES[key];return role?[pgText(...role)]:[];};

/* A single, saved first-contact lesson, triggered by a visible enemy. */
velcaUnlocked=function(){return !!S&&(S.story?S.story.ch===4:S.stage>=40);};
velcaMaybeEncounter=function(){if(!S||mode!=='play'||!velcaUnlocked()||pgState().velcaTutorialDone)return;
 const e=S.enemies.find(e=>isVelcarion(e)&&e.hp>0&&e.x>S.cam.x-e.r&&e.x<S.cam.x+W+e.r&&e.y>S.cam.y-e.r&&e.y<S.cam.y+H+e.r);
 if(e)showVelcaIntro(e);
};
showVelcaIntro=function(enemy){if(mode!=='play')return;clearBattleInput();mode='velca-intro';velcaIntroAt=performance.now();velcaIntroFocus=document.activeElement;cgGameplayStop();
 let panel=$('velcaIntro');if(!panel){panel=pgNode('div');panel.id='velcaIntro';document.body.append(panel);}panel.className='velca-intro pg-first-contact on';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','velcaTitle');panel.replaceChildren();
 const card=pgNode('section',null,'pg-contact-card'),intro=pgNode('div',null,'pg-contact-heading');intro.append(pgImage(enemy?.type||'v_crawler'));
 const title=pgNode('div');title.append(pgNode('small','FIRST CONTACT'),pgNode('h2',pgText('벨카리온 발견','Velcarion encountered')));title.lastChild.id='velcaTitle';title.append(pgNode('p',pgText('새로운 적 기계 군단이 전장에 진입했습니다.','An ancient machine force has entered the battlefield.')));intro.append(title);card.append(intro);
 const core=ownsVelcaCore(),steps=pgNode('div',null,'pg-contact-steps');
 for(const [number,ko,en]of [[1,'벨카리온은 적 유닛입니다. 충전 빛과 공격 예고를 보고 피하세요.','Velcarion are enemies. Watch their charge lights and attack warnings.'],[2,core?'벨카코어를 보유하고 있어 지금은 포획할 수 있습니다.':'지금은 포획할 수 없습니다. 포획 빔으로 데려올 수 없으니 공격해서 격파하세요.',core?'Your Velca Core is active. You can capture them now.':'Capture is locked. Your capture beam cannot recruit them yet; defeat them with weapons.'],[3,'스토리 1~4장의 모든 작전에서 별 3개씩, 총 120개를 모으면 벨카코어를 얻습니다. 이후 전장에서 포획할 수 있습니다. 진급은 없습니다.','Earn 3 stars in every operation in Chapters 1–4 (120 total) to obtain the Velca Core. Then capture them in combat. Velcarion cannot be promoted.']]){const row=pgNode('p');row.append(pgNode('b',String(number)),pgNode('span',pgText(ko,en)));steps.append(row);}
 card.append(steps);const button=pgButton('velcaAcknowledge',pgText('확인 · 전투 계속','Understood · Resume combat'),closeVelcaIntro,'pg-button pg-primary');card.append(button,pgNode('small',pgText('안내 중에는 전투와 임무 시간이 멈춥니다.','Combat and mission time are paused.'),'pg-contact-paused'));panel.append(card);button.focus({preventScroll:true});panel.onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();button.focus();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeVelcaIntro();}};
};
closeVelcaIntro=function(){if(mode!=='velca-intro')return;const now=performance.now(),elapsed=now-velcaIntroAt;S.stageStart+=elapsed;S.runStart+=elapsed;pgState().velcaTutorialDone=true;META.velcarionSeen=true;metaSave();$('velcaIntro')?.classList.remove('on');clearBattleInput();mode='play';last=now;cgGameplayStart();velcaIntroFocus?.focus?.({preventScroll:true});};
const pgContactMenu=showMenu;showMenu=function(){ $('velcaIntro')?.classList.remove('on');return pgContactMenu();};

/* Two compact corner panels leave the middle of the battlefield unobstructed. */
function pgHUDObjective(){
 if(EVO_DEBRIEF.phase==='clear')return pgText('기지 확보 · 편대 정비 중','Base secured · Regrouping');
 if(S.phase==='heroBoss')return pgText('아스트라 세이버를 격파하세요','Defeat Astra Saber');
 if(S.phase==='heroLoot')return pgText('전장에 남은 트로피를 회수하세요','Collect the trophy');
 if(S.relGuide===1)return pgText('표시된 적 1기 포획','Capture the marked enemy');
 if(S.phase==='boss')return pgText('남은 적 포탑 ','Enemy turrets left: ')+S.turrets.filter(t=>t.alive).length+pgText('기','');
 const left=Math.max(0,S.killNeed-S.killed);
 return pgText('보스까지 포획·처치 ','Recruit / defeat: ')+left+pgText('기 남음',' left');
}
function pgHUDMount(){
 const root=$('relHUD');if(!root||$('pgCombatDeck'))return;
 const panel=pgNode('div',null,'pg-combat-deck');panel.id='pgCombatDeck';
 const left=pgNode('div',null,'pg-hud-corner pg-hud-left'),card=pgNode('div',null,'pg-hud-card');
 const right=pgNode('div',null,'pg-hud-corner pg-hud-right');
 card.append(root.querySelector('.rel-hull'));
 const items=pgNode('section',null,'pg-hud-items'),head=pgNode('div',null,'pg-hud-item-heading');
 const label=pgNode('span');label.id='pgHUDEffectsLabel';const recent=pgNode('small');recent.id='pgHUDRecent';head.append(label,recent);
 const icons=pgNode('div');icons.id='pgHUDEffects';items.append(head,icons);
 card.append(items);left.append(card,root.querySelector('.rel-sector'));
 const squad=root.querySelector('.rel-squad');squad.classList.add('pg-hud-card');
 const squadHead=pgNode('div',null,'pg-hud-squad-heading');squadHead.append($('relSquadLabel'),$('gameSettings'));squad.prepend(squadHead);right.append(squad);
 panel.append(left,right);root.prepend(panel);
 const warning=$('evoAmbushAlert');if(warning)root.append(warning);
 const size=()=>{if(!panel.offsetHeight)return;pgHUDFleetColumns();const y=Math.ceil(panel.offsetTop+panel.offsetHeight);root.style.setProperty('--pg-hud-bottom',y+'px');document.body.style.setProperty('--pg-hud-bottom',Math.ceil(panel.getBoundingClientRect().bottom)+'px');};
 // The observer runs after actual layout changes; raw resize bursts need no work.
 new ResizeObserver(size).observe(panel);size();
}
const pgHUDInit=basicInit;basicInit=function(){pgHUDInit();pgHUDMount();};
function pgHUDFleetColumns(){const slots=$('relSlots');if(!slots)return;const n=Math.max(1,S?.allies?.length||0),capacity=Math.max(1,Math.floor((slots.clientWidth+2)/24)),rows=Math.ceil(n/capacity),columns=Math.ceil(n/rows);slots.style.setProperty('--pg-fleet-columns',columns);}
const pgHUDPickup=pickup;pickup=function(k,src){
 const battle=S,before=S?.itemGot||0;const result=pgHUDPickup(k,src);
 if(S===battle&&S&&S.itemGot>before&&ITEMS[k])S.pgHUDRecent={key:k,stage:S.stage,amount:k==='HEAL'?evoHealAmount(S.stage):k==='AST'?6:k==='CREDIT'?45:0};
 return result;
};
function pgHUDEffects(){
 const list=[['PWR',S.itemDmg],['RATE',S.itemRate],['WAY',Math.max(0,S.ways-1-relicVal('r_mag'))],['SPD',S.spd],['SHLD',S.shield?1:0],['SLOT',S.itemSlot],['APWR',S.allyPwr]];
 if(S.element)list.push([S.element,S.elemStack?.[S.element]||1]);return list.filter(([,n])=>n>0);
}
let pgHUDStamp='',pgHUDLastTick=-1;
const pgHUDSync=relSyncHUD;relSyncHUD=function(){
 pgHUDSync();if(!S||!['play','pause'].includes(mode))return;pgHUDMount();
 if(pgHUDLastTick===EVO_PERF.hudAt)return;pgHUDLastTick=EVO_PERF.hudAt;
 const effects=pgHUDEffects(),recent=S.pgHUDRecent?.stage===S.stage?S.pgHUDRecent:null;
 const stamp=LANG+'|'+JSON.stringify(effects)+'|'+JSON.stringify(recent);
 if(stamp!==pgHUDStamp){pgHUDStamp=stamp;
  evoHUDText('pgHUDEffectsLabel',pgText('아이템 효과','ITEM EFFECTS'));
  const recentText=recent?pgText('획득 · ','PICKED UP · ')+pgItemGuideEntry(recent.key).name+(recent.amount?' +'+recent.amount:''):'';
  evoHUDText('pgHUDRecent',recentText);$('pgHUDRecent').title=recentText;
  const icons=$('pgHUDEffects');icons.replaceChildren();icons.style.setProperty('--pg-effect-count',Math.max(1,effects.length));
  for(const [key,n] of effects){const d=pgItemGuideEntry(key),chip=pgNode('div',null,'pg-hud-effect');chip.dataset.item=key;
   chip.title=d.name+' · '+n+' · '+d.effect;chip.setAttribute('role','img');chip.setAttribute('aria-label',chip.title);
   const icon=pgNode('img');icon.src=ART[d.icon];icon.alt='';chip.append(icon);if(n>1)chip.append(pgNode('b',String(n)));icons.append(chip);
  }
  if(!effects.length){const empty=pgNode('small');empty.append(pgNode('span',pgText('아이템을 모아 전력을 강화하세요','Collect pickups to power up'),'pg-hud-empty-long'),pgNode('span',pgText('효과 없음','No effects'),'pg-hud-empty-short'));icons.append(empty);}
 }
 const count=S.allies.length;const slots=$('relSlots');if(slots.dataset.count!==String(count)){slots.dataset.count=count;slots.classList.toggle('pg-fleet-empty',!count);pgHUDFleetColumns();}
 slots.setAttribute('aria-label',pgText('현재 편대 구성','Current squad composition'));
};

/* Restored illustrated identity surfaces share the existing profile save. */
const pgProfileSync=cgSyncIdentity;
cgSyncIdentity=function(){pgProfileSync();const name=$('pgLeaderboard')?.querySelector('.pg-identity strong');if(name&&name.textContent!==cgDisplayName())name.textContent=cgDisplayName();};
const pgProfileDrawer=profileDrawer;
profileDrawer=function(anchor){pgProfileDrawer(anchor);const sheet=$('drawerSheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','drawerName');$('drawerClose').setAttribute('aria-label',pgText('지휘관 정보 닫기','Close commander profile'));$('drawerClose').focus({preventScroll:true});};
const pgProfileClose=closeDrawer;
closeDrawer=function(){const anchor=DRAWER_ANCHOR;pgProfileClose();$('drawerSheet').removeAttribute('aria-modal');const current=anchor?.isConnected?anchor:$(anchor?.id);current?.focus({preventScroll:true});};
// Event handlers installed by the base build held the earlier close function.
$('drawerClose').onclick=()=>closeDrawer();$('drawerDim').onclick=()=>closeDrawer();
$('drawer').addEventListener('keydown',e=>{if(!$('drawer').classList.contains('on')||$('cgHub'))return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDrawer();}if(e.key==='Tab'){const buttons=[...$('drawerSheet').querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
// The menu-only review link is limited to the disposable preview build.
// Production and the ordinary first-time URL always use normal onboarding.
const pgProfileAutoStart=evoAutoStart;
evoAutoStart=function(){const preview=new URLSearchParams(location.search).get('preview');if(window.FOI_FIRST_TIME_DEMO&&['menu','guide'].includes(preview)){META.relGuideDone=true;pgState().battleBasicsDone=true;pgState().tutorial=preview==='guide'?20:25;pgState().tutorialDeferred=false;PG.launchPrompt=false;}return pgProfileAutoStart();};

/* Frequent encounters; one low-probability attempt; durable capture rewards.
 * Timers use active combat time, including across Infinity sectors. */
const PG_HUNT={minGap:30000,maxGap:45000,eliteBonus:.15,summonChance:.03,summonCooldown:60000,summonOverflowAst:3};
const pgHuntGap=()=>PG_HUNT.minGap+Math.random()*(PG_HUNT.maxGap-PG_HUNT.minGap);
function pgHuntState(){
 if(!S)return null;
 if(!S.pgRun)S.pgRun=pgID();
 const runs=pgState().legendHunts||(pgState().legendHunts={});
 return runs[S.pgRun]||(runs[S.pgRun]={clock:0,nextEncounter:pgHuntGap(),nextSupport:PG_HUNT.summonCooldown,summonVersion:3,serial:0,rewards:{}});
}
function pgHuntActive(){return !!S&&mode==='play'&&!PG.creating&&!PG.resuming&&!EVO.waiting&&S.relGuide!==1&&!S.pgFieldLesson&&!PG.itemLesson&&!S.relClearIn&&!S.rewardSettled&&S.phase!=='heroLoot';}
evoLegendCaptureChance=function(){return .05+Math.min(4,Math.max(0,S?.upCap||0))*.0125;};
const pgSyncUpgrade=EVO_UPGRADES.find(u=>u.id==='cap');
Object.assign(pgSyncUpgrade,{dk:'레전드 포획 확률 +1.25%p · 5% → 최대 10%',de:'+1.25 percentage points · 5% to a maximum of 10%'});

// Summoned Legends use the persistent sortie fleet, at normal combat strength.
const pgHuntRosterCount=rosterCount;
rosterCount=function(legend){return legend?S.allies.filter(a=>a.isLegend&&a.hp>0).length:pgHuntRosterCount(legend);};
evoOwnedLegends=function(){return [...S.allies.filter(a=>a.isLegend&&a.hp>0).map(evoLegendRecord),...(S.evoReserve||[]).filter(a=>a.hp>0)];};
function pgSupportPool(){
 const field=new Set(evoOwnedLegends().map(a=>a.key));
 if(field.size>=10)return [];
 // Collection ownership (cards/rank or an unlocked hero trophy), not the
 // encounter catalogue. Active AND reserve types are excluded from repeats.
 return legendOwned().filter(k=>!field.has(k));
}
function pgDropLegendSupport(e){
 if(!pgHuntActive()||!legendOwned().length||S.items.some(i=>i.k==='SUMMON'))return;
 const h=pgHuntState();if(h.clock<h.nextSupport||Math.random()>=PG_HUNT.summonChance)return;
 S.items.push({k:'SUMMON',x:e.x-16,y:e.y,t:0});
 h.nextSupport=h.clock+PG_HUNT.summonCooldown;metaSave();
}
function pgSummonLegendSupport(){
 if(!S)return;
 const pool=pgSupportPool(),key=pool[Math.floor(Math.random()*pool.length)];
 if(!key)return pgConvertLegendSummon();
 const a=makeLegend(key,S.px+50,S.py-20,'ally');a.pgSupport=true;
 const deployed=rosterCount(true)<evoLegendCap();if(!pushAlly(a))return pgConvertLegendSummon();S.summonUsed++;S.itemGot++;
 S.fx.push({k:'ring',x:a.x,y:a.y,r:8,max:65,life:600,t:600,c:'#a1dadd'});
 relToast(nm(key)+(deployed?' · 레전드 소환! 계속 함께 싸웁니다':' · 레전드 소환! 예비 편대 합류'),nm(key)+(deployed?' · Legend summoned! Fights for this sortie':' · Legend summoned! Assigned to reserve'));
 relSaveCheckpoint();metaSave();return a;
}
function pgConvertLegendSummon(){
 // A small, immediately saved reward avoids unbounded combat stat stacking.
 // Also handles a legacy pickup if collection ownership is now empty.
 const n=PG_HUNT.summonOverflowAst;META.astranium=pgInt(META.astranium+n);S.itemGot++;
 relSaveCheckpoint();metaSave();
 relToast('추가 소환 가능한 보유 레전드 없음 · 아스트라늄 +'+n,'No owned Legend available to summon · Astranium +'+n);
}

// Replace the former single hunt/boss roll with recurring visible encounters.
evoTryLegend=function(){
 if(!pgHuntActive())return;
 const h=pgHuntState();if(h.clock<h.nextEncounter||S.enemies.some(e=>e.isLegend&&e.side==='neutral'))return;
 const roster=evoOwnedLegends(),owned=new Map(roster.map(a=>[a.key,a]));
 // A summoned normal Legend must not prevent earning its Elite capture/card.
 const pool=EVO_LEGENDS.filter(k=>!HEROES[k]&&!owned.get(k)?.elite&&(owned.has(k)||roster.length<10));
 if(!pool.length){h.nextEncounter=h.clock+PG_HUNT.minGap;return;}
 const key=pool[Math.floor(Math.random()*pool.length)],a=makeLegend(key,S.px,S.py,'neutral');let placed=false;
 for(let i=0;i<24;i++){
  const angle=Math.random()*Math.PI*2,dist=145+Math.random()*65;
  a.x=evoClamp(S.px+Math.cos(angle)*dist,80,WORLD.w-80);a.y=evoClamp(S.py+Math.sin(angle)*dist,90,WORLD.h-85);resolveProps(a,a.r,a.flying);
  if(Math.hypot(a.x-S.px,a.y-S.py)<90||S.base&&Math.hypot(a.x-S.base.x,a.y-S.base.y)<125||S.turrets.some(t=>t.alive&&Math.hypot(a.x-t.x,a.y-t.y)<75))continue;
  if(a.x<S.cam.x+40||a.x>S.cam.x+W-40||a.y<S.cam.y+85||a.y>S.cam.y+H-45)continue;
  placed=true;break;
 }
 if(!placed){h.nextEncounter=h.clock+500;return;}
 a.pgCaptureId=String(++h.serial);a.spd=.35;
 if(a.evoStationary)a.evoAnchor={x:a.x,y:a.y};
 S.enemies.push(a);h.nextEncounter=h.clock+pgHuntGap();metaSave();
 evoLog('legend-arrived',{key,phase:S.phase,source:'recurring'});
 const chance=Number((evoLegendCaptureChance()*100).toFixed(2));
 relToast('레전드 발견! 18초 내 포획 · 성공률 '+chance+'% · 성공 시 정예 + 카드 1장','LEGEND! 18 seconds · '+chance+'% capture · Elite + 1 card on success');
};

function pgMarkEliteLegend(a){
 if(a.pgElite||!a.isLegend||HEROES[a.type])return;
 a.pgSupport=false;a.pgElite=true;a.pgEliteAt=S.relTime||0;a.hpMax*=1+PG_HUNT.eliteBonus;a.hp*=1+PG_HUNT.eliteBonus;a.dmgMul=pgLegendPower(a);
 S.fx.push({k:'ring',x:a.x,y:a.y,r:8,max:80,life:650,t:650,c:'#e6c67d'});
 blip(880,.10,'sine',.05);blip(1320,.16,'triangle',.035);
}
function pgSecureLegendCard(e){
 if(HEROES[e.type]||!EVO_LEGENDS.includes(e.type)||e.pgSupport||e.side!=='neutral')return;
 const h=pgHuntState(),id=e.pgCaptureId||(e.pgCaptureId=String(++h.serial));
 if(h.rewards[id])return;
 h.rewards[id]={key:e.type,paid:false};metaSave();
}
function pgSettleCaptureCards(){
 const runs=pgState().legendHunts||{};let changed=false;
 for(const h of Object.values(runs))for(const receipt of Object.values(h.rewards||{})){
  if(receipt.paid||!EVO_LEGENDS.includes(receipt.key)||HEROES[receipt.key])continue;
  addCard('legend',receipt.key,1);receipt.paid=true;changed=true;
 }
 // Card balances and receipt flags are persisted in the same META write.
 if(changed)metaSave();
}
function pgCaptureSummary(target){
 if(!target||!S)return;target.querySelector('.pg-capture-rewards')?.remove();
 const h=pgState().legendHunts?.[S.pgRun];if(!h)return;
 const counts={};for(const r of Object.values(h.rewards))counts[r.key]=(counts[r.key]||0)+1;
 if(!Object.keys(counts).length)return;
 const box=pgNode('div',null,'pg-capture-rewards pg-reward');
 box.append(pgNode('strong',pgText('이번 출격 · 포획 카드 누적','THIS SORTIE · CAPTURE CARDS')));
 for(const [key,n]of Object.entries(counts))box.append(pgNode('p',nm(key)+' × '+n));
 box.append(pgNode('small',pgText('영구 저장 완료 · 진급에 사용하세요','Saved permanently · Use for promotions')));target.append(box);
}
const pgHuntMetaLoad=metaLoad;
metaLoad=function(){pgHuntMetaLoad();pgSettleCaptureCards();let migrated=false;
 for(const h of Object.values(pgState().legendHunts||{}))if(h.summonVersion!==3){h.nextSupport=h.clock+PG_HUNT.summonCooldown;h.summonVersion=3;migrated=true;}
 // Remove only unowned normal summons created by the old unrestricted pool.
 // Captured Elites, permanent cards/ranks and genuinely owned summons remain.
 const owned=new Set(legendOwned()),save=META.relaunchRun;
 for(const key of ['legends','legendReserve'])if(Array.isArray(save?.[key])){
  const before=save[key].length;save[key]=save[key].filter(d=>!d.support||d.elite||owned.has(d.key));
  if(save[key].length!==before)migrated=true;
 }
 if(migrated)metaSave();};
const pgHuntNewGame=newGame;
newGame=function(...args){pgSettleCaptureCards();const result=pgHuntNewGame(...args);pgHuntState();
 const runs=pgState().legendHunts,ids=Object.keys(runs);for(const id of ids.slice(0,Math.max(0,ids.length-80)))if(id!==S.pgRun&&id!==META.relaunchRun?.pgRun&&Object.values(runs[id].rewards).every(r=>r.paid))delete runs[id];
 return result;};
const pgHuntStage=startStage;
startStage=function(...args){pgSettleCaptureCards();return pgHuntStage(...args);};
const pgHuntSettle=pgSettleBattle;
pgSettleBattle=function(){pgSettleCaptureCards();return pgHuntSettle();};
const pgHuntRoll=rollUpgrades;
rollUpgrades=function(){pgSettleCaptureCards();pgHuntRoll();pgCaptureSummary($('claimBox'));};
const pgHuntOver=gameOver;
gameOver=function(){pgSettleCaptureCards();pgHuntOver();pgCaptureSummary($('ovStats'));};
const pgHuntMenu=showMenu;
showMenu=function(...args){pgSettleCaptureCards();return pgHuntMenu(...args);};

function pgHuntTick(dt){
 if(!pgHuntActive())return;const h=pgHuntState();h.clock+=dt;
 evoTryLegend();
}
const pgHuntUpdate=update;
update=function(dt){const battle=S,active=pgHuntActive();pgHuntUpdate(dt);if(active&&S===battle)pgHuntTick(dt);};

// Elite-only cached light sprites. No image downloads, per-frame blur, extra
// gameplay particles, random rolls or changes to the normal Legend renderer.
let pgEliteLight=null,pgEliteStar=null;
function pgEliteLightAssets(){
 if(pgEliteLight)return;
 pgEliteLight=document.createElement('canvas');pgEliteLight.width=pgEliteLight.height=128;
 const c=pgEliteLight.getContext('2d'),g=c.createRadialGradient(64,64,8,64,64,63);
 g.addColorStop(0,'rgba(255,244,190,.30)');g.addColorStop(.38,'rgba(255,229,134,.45)');g.addColorStop(.65,'rgba(238,194,88,.18)');g.addColorStop(1,'rgba(238,194,88,0)');c.fillStyle=g;c.fillRect(0,0,128,128);
 pgEliteStar=document.createElement('canvas');pgEliteStar.width=pgEliteStar.height=32;
 const s=pgEliteStar.getContext('2d'),glow=s.createRadialGradient(16,16,0,16,16,16);
 glow.addColorStop(0,'rgba(255,252,224,.9)');glow.addColorStop(.25,'rgba(255,223,129,.45)');glow.addColorStop(1,'rgba(255,217,117,0)');s.fillStyle=glow;s.fillRect(0,0,32,32);
 s.fillStyle='#fff9df';s.beginPath();s.moveTo(16,3);s.lineTo(18,13);s.lineTo(27,16);s.lineTo(18,18);s.lineTo(16,29);s.lineTo(14,18);s.lineTo(5,16);s.lineTo(14,13);s.closePath();s.fill();
}
const pgEliteDraw=drawUnit;
drawUnit=function(u,x,y){
 if(!u.pgElite||!u.isLegend||u.side!=='ally'||u.hp<=0||u.gone){pgEliteDraw(u,x,y);return;}
 pgEliteLightAssets();
 const reduced=META.basicReduceMotion||pgMotionQuery.matches,t=reduced?0:(S.relTime||0)*.001;
 const im=IMG[u.img],h=u.w*(im?.width?im.height/im.width:1),rx=Math.max(22,u.w*.68),ry=Math.max(22,h*.59),phase=t*.42+(u.bob||0),pulse=reduced?.5:.5+.5*Math.sin(t*1.7+(u.bob||0));
 // Soft light sits behind the chassis; the outer sparks remain visible on top.
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=reduced?.46:.48+pulse*.18;
 ctx.drawImage(pgEliteLight,x-rx*1.4,y-ry*1.3,rx*2.8,ry*2.6);ctx.restore();
 pgEliteDraw(u,x,y);
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#ffe6a1';ctx.lineWidth=1.25;ctx.globalAlpha=reduced?.42:.46+pulse*.14;
 for(let i=0;i<2;i++){const a=phase+i*Math.PI;ctx.beginPath();ctx.ellipse(x,y+h*.30,rx,Math.max(11,u.w*.25),0,a,a+1.02);ctx.stroke();}
 const count=reduced?4:8;
 for(let i=0;i<count;i++){
  const angle=-phase+i*Math.PI*2/count,twinkle=reduced?.55:Math.pow(.5+.5*Math.sin(t*2.3+i*2.4),2),size=5+twinkle*6;
  const px=x+Math.cos(angle)*rx,py=y+Math.sin(angle)*ry-(reduced?0:Math.sin(t*1.1+i)*3);
  ctx.globalAlpha=.40+twinkle*.50;ctx.drawImage(pgEliteStar,px-size/2,py-size/2,size,size);
 }
 // A brief local flourish on actual capture, never replayed on save restore.
 const age=u.pgEliteAt===undefined?Infinity:(S.relTime||0)-u.pgEliteAt;
 if(!reduced&&age>=0&&age<1100){const p=age/1100;ctx.globalAlpha=(1-p)*.65;ctx.lineWidth=2*(1-p)+.5;ctx.beginPath();ctx.ellipse(x,y,rx*(.75+p*.6),ry*(.75+p*.6),0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
};
const pgHuntHUD=relSyncHUD;
let pgHuntHUDTick=-1;
relSyncHUD=function(){pgHuntHUD();if(!S||!['play','pause'].includes(mode))return;
 if(pgHuntHUDTick===EVO_PERF.hudAt)return;pgHuntHUDTick=EVO_PERF.hudAt;
 const ordered=[...S.allies.filter(a=>!a.isLegend),...S.allies.filter(a=>a.isLegend)];
 ordered.forEach((a,i)=>{const slot=$('relSlots')?.children[i];if(!slot)return;slot.classList.toggle('pg-elite-slot',!!a.pgElite);slot.classList.toggle('pg-support-slot',!!a.pgSupport);slot.title=nm(a.type)+(a.pgElite?pgText(' · 정예: 체력·공격력 +15%',' · Elite: hull & damage +15%'):a.pgSupport?pgText(' · 소환된 레전드',' · Summoned Legend'):'');});
};
const pgHuntInfo=basicOpenGameInfo;
basicOpenGameInfo=function(...args){pgHuntInfo(...args);const section=document.querySelector('#cgHub .evo-info')||document.querySelector('.evo-info');if(!section)return;
 const paragraphs=section.querySelectorAll(':scope > p');
 if(paragraphs[0])paragraphs[0].textContent=pgText('전투 중 30~45초 간격으로 아직 정예로 포획하지 않은 일반 레전드가 등장합니다. 18초 내 포획에 도전하세요. 성공률은 5%, 동기화 최대 강화 시 10%이며 실패하면 즉시 이탈합니다. 최초 포획 보정은 없습니다.','A regular Legend not yet captured as an Elite appears every 30–45 seconds of combat. Attempt capture within 18 seconds: 5% success, up to 10% with Sync. Failure causes withdrawal. No first-capture bonus.');
 if(paragraphs[1])paragraphs[1].textContent=pgText('포획 성공 시 체력·공격력 +15%의 정예가 합류하며 같은 유닛 카드 1장을 확보합니다. 출격 종료나 스테이지 정산 때 지급되며 패배해도 유지됩니다. 정원이 차면 가장 부상당한 레전드를 예비 편대로 보냅니다.','Capture recruits an Elite with +15% hull and damage and secures one matching card. Cards settle at sector/sortie end and survive defeat. A full fleet sends its most damaged Legend to reserve.');
 if(paragraphs[2])paragraphs[2].textContent=pgText('보유 레전드가 있을 때만 소환 아이템이 적 처치 시 3% 확률로 등장합니다. 첫 드랍과 드랍 사이에는 전투 시간 최소 60초가 필요하며 확정 지급은 없습니다. 바닥에 미획득 소환 아이템이 있으면 추가 드랍을 멈춥니다. 보유한 레전드 중 출전·예비 편대에 없는 1기만 무작위 소환합니다. 추가 소환이 불가능하면 아스트라늄 3개로 전환해 즉시 저장합니다. 생존한 소환 유닛은 다음 스테이지와 이어하기에도 유지되며 정예 보너스와 카드는 없습니다. 같은 종류를 직접 포획하면 정예로 강화되고 카드 1장을 확보합니다.','With at least one owned Legend, eligible enemy defeats have a 3% summon-item chance. The first drop and subsequent drops require at least 60 seconds of active combat; drops are never guaranteed. An uncollected summon item blocks further drops. Summon one random owned Legend missing from both the active squad and reserves. If none can join, receive 3 Astranium, saved immediately. Surviving summoned units carry into the next sector and Continue, without Elite bonuses or cards. Capturing the same type upgrades it to Elite and secures one card.');
};


/* Poki integration is applied after the approved R23 gameplay modules. */
CG.canPlay=()=>mode==='play'&&EVO_DEBRIEF.phase==='idle'&&!PG.itemLesson;
cgGameplayStart=foiPokiStart;
cgGameplayStop=foiPokiStop;
STR.ko.pAccount='진행 상황은 이 브라우저에 저장됩니다.';
STR.en.pAccount='Progress is saved in this browser.';
STR.ja.pAccount='進行状況はこのブラウザに保存されます。';
STR.zh.pAccount='游戏进度保存在此浏览器中。';

function foiEnterBattle(action){
 if(CG.transition)return action();
 if(CG.adActive)return;
 const run=()=>{CG.transition=true;try{return action();}finally{CG.transition=false;}};
 if(!CG.everPlayed||!CG.sdk?.commercialBreak||document.hidden)return run();
 cgGameplayStop();metaSave();clearBattleInput();
 CG.adActive=true;const previousMute=CG.muted;CG.muted=true;cgApplyAudioPolicy();
 const roots=[...document.querySelectorAll('#wrap,#cgHub,#pgSpotlight')].map(node=>[node,node.inert]);for(const [node]of roots)node.inert=true;
 const overlay=document.createElement('div');overlay.id='foiAdWait';overlay.setAttribute('role','status');overlay.textContent=pgText('잠시만 기다려 주세요','Please wait');document.body.append(overlay);
 const started=performance.now(),adBattle=S,alreadyPaused=mode==='pause';
 const finish=()=>{
  overlay.remove();for(const [node,inert]of roots)if(node.isConnected)node.inert=inert;
  // setPaused(false) already excludes the full pause, including the ad.
  if(S===adBattle&&S&&!alreadyPaused){const elapsed=performance.now()-started;S.runStart+=elapsed;S.stageStart+=elapsed;}
  CG.adActive=false;CG.muted=previousMute;cgAccumulator=0;last=performance.now();clearBattleInput();cgApplyAudioPolicy();
  run();
  // If the tab was hidden during an ad, return to a paused game.
  if(document.hidden&&mode==='play')setPaused(true);
  cgResumeAudio();
 };
 try{Promise.resolve(CG.sdk.commercialBreak(()=>{if(CG.adActive){CG.muted=true;cgApplyAudioPolicy();}})).then(finish,finish);}catch(error){finish();}
}
const foiPlay=basicPlay;basicPlay=function(...args){return foiEnterBattle(()=>foiPlay(...args));};
const foiContinue=relContinue;relContinue=function(...args){return foiEnterBattle(()=>foiContinue(...args));};
const foiStory=pgStartStory;pgStartStory=function(...args){return foiEnterBattle(()=>foiStory(...args));};
const foiNext=evoBeginNextSector;evoBeginNextSector=function(...args){if(S.story||['depart','arrive'].includes(EVO_DEBRIEF.phase))return foiNext(...args);return foiEnterBattle(()=>foiNext(...args));};
const foiPause=setPaused;setPaused=function(on){
 if(CG.adActive)return;
 if(!on&&mode==='pause'&&CG.manualResume){CG.manualResume=false;return foiEnterBattle(()=>foiPause(false));}
 return foiPause(on);
};
// Only a player's explicit Resume button/key requests a break. Tutorial dismissals do not.
addEventListener('click',event=>{if(event.target?.closest?.('#btResume')&&mode==='pause'){CG.manualResume=true;setTimeout(()=>{CG.manualResume=false;},0);}},true);
addEventListener('keydown',event=>{
 if(CG.adActive||event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
 if(event.code==='KeyP'&&mode==='pause'&&!PG.itemLesson){CG.manualResume=true;setTimeout(()=>{CG.manualResume=false;},0);}
 if(event.code==='Escape'&&!event.repeat&&!document.getElementById('cgHub')&&!PG.itemLesson&&['play','pause'].includes(mode)){
  event.preventDefault();event.stopImmediatePropagation();CG.manualResume=mode==='pause';setPaused(mode!=='pause');CG.manualResume=false;
 }
},true);
const foiSettings=basicSettingsContent;basicSettingsContent=function(parent){foiSettings(parent);parent.append(basicNode('p',pgText('진행 상황은 이 브라우저에 저장됩니다. 다른 기기와 자동으로 동기화되지 않습니다.','Progress is saved in this browser and does not automatically sync to other devices.'),'cg-note'));};
const foiPauseSettings=renderPauseSettings;renderPauseSettings=function(){foiPauseSettings();$('btResume').textContent=pgText('계속하기 · Esc / P','Resume · Esc / P');};
// Legacy reward buttons had no real ad provider. They remain unavailable in this edition.
for(const id of ['btUpAd','btUpReroll','btRevive']){const button=$(id);button.onclick=null;button.disabled=true;button.hidden=true;}


/* P2: optional Poki rewards. No synthetic completion path in the public build. */
const FOI_REWARDS={astranium:15,dailyLimit:3};
let foiAdTicket=0;
function foiAdButton(id,ko,en,sub,handler){
 const b=pgButton(id,'',handler,'foi-ad-button');b.innerHTML=UP_ICON.ad;
 const label=pgNode('span',pgText(ko,en));if(sub)label.append(pgNode('small',sub));b.append(label);return b;
}
function foiSupplyBudget(){
 const day=new Date().toISOString().slice(0,10),p=pgState();
 if(!p.pokiSupply||p.pokiSupply.day!==day)p.pokiSupply={day,count:0};
 p.pokiSupply.count=pgInt(p.pokiSupply.count,FOI_REWARDS.dailyLimit);return p.pokiSupply;
}
function foiSupplyLeft(){return Math.max(0,FOI_REWARDS.dailyLimit-foiSupplyBudget().count);}
function foiRunAd(kind){
 if(CG.adActive||document.hidden||!CG.sdk||typeof CG.sdk[kind]!=='function')return Promise.resolve(false);
 const token=++foiAdTicket;cgGameplayStop();metaSave();clearBattleInput();
 const priorMute=CG.muted,battle=S,paused=mode==='pause',started=performance.now();
 CG.adActive=true;CG.muted=true;cgApplyAudioPolicy();
 const roots=[...document.querySelectorAll('#wrap,#cgHub,#pgSpotlight,#foiSupplyDialog,#foiFieldBoard')].map(node=>[node,node.inert]);
 for(const [node]of roots)node.inert=true;
 const overlay=pgNode('div');overlay.id='foiAdWait';overlay.setAttribute('role','status');
 overlay.append(pgNode('span',pgText('잠시만 기다려 주세요','Please wait')));
 const cancel=pgNode('button',pgText('취소하고 돌아가기','Cancel and return'),'foi-cancel');cancel.hidden=true;overlay.append(cancel);document.body.append(overlay);
 return new Promise(resolve=>{
  let finished=false,shown=false;
  const finish=value=>{if(finished||token!==foiAdTicket)return;finished=true;clearTimeout(recovery);overlay.remove();
   for(const [node,inert]of roots)if(node.isConnected)node.inert=inert;
   if(S===battle&&battle&&!paused){const elapsed=performance.now()-started;S.runStart+=elapsed;S.stageStart+=elapsed;}
   CG.adActive=false;CG.muted=priorMute;cgAccumulator=0;last=performance.now();clearBattleInput();cgApplyAudioPolicy();cgResumeAudio();
   resolve(value===true);
  };
  // A stalled request can be cancelled before playback starts. A late callback
  // cannot award a reward or seize audio/input again after this request ends.
  const recovery=setTimeout(()=>{if(!shown&&!finished)cancel.hidden=false;},12000);
  cancel.onclick=()=>{if(!shown)finish(false);};
  try{Promise.resolve(CG.sdk[kind](()=>{if(finished||token!==foiAdTicket)return;shown=true;cancel.hidden=true;CG.muted=true;cgApplyAudioPolicy();}))
   .then(value=>finish(kind==='rewardedBreak'?value===true:true),()=>finish(false));}catch(error){finish(false);}
 });
}
foiEnterBattle=function(action){
 if(CG.adActive)return;if(CG.transition)return action();
 const run=()=>{CG.transition=true;try{return action();}finally{CG.transition=false;}};
 if(!CG.everPlayed||!CG.sdk?.commercialBreak||document.hidden)return run();
 return foiRunAd('commercialBreak').then(()=>{run();if(document.hidden&&mode==='play')foiPause(true);});
};
async function foiReward(valid,grant){
 if(CG.adActive||!valid())return false;
 const success=await foiRunAd('rewardedBreak');
 if(!success||!valid())return false;
 grant();metaSave();return true;
}
function foiBossState(){
 if(!S)return null;if(!S.foiBoss||S.foiBoss.stage!==S.stage)S.foiBoss={stage:S.stage,remaining:S.story?0:1,bonus:false,reroll:false,chosen:[],storyOffers:[]};
 return S.foiBoss;
}
function foiCanChooseUpgrade(){return !!S&&mode==='upgrade'&&!CG.adActive&&foiBossState().remaining>0;}
function foiUpgradeCapacity(){return EVO_UPGRADES.reduce((total,u)=>{
 if(S.stage<(u.minStage||1))return total;
 for(let level=S[u.field]||0;level<u.max;level++){if(u.levelStages&&S.stage<u.levelStages[level])break;total++;}
 return total;
},0);}
function foiAfterUpgradeChoice(u){
 const reward=foiBossState();reward.remaining--;reward.chosen.push(pgText(u.ko,u.en));rollUpgrades();
}
function foiStoryRoll(){
 const r=foiBossState(),last=new Set(r.storyOffers.map(x=>x.id));
 const pool=[{id:'ast',ko:'아스트라늄 +15',en:'+15 Astranium',grant:()=>META.astranium+=15},
  {id:'credits',ko:'크레딧 +300',en:'+300 Credits',grant:()=>META.credits+=300},
  ...UNIT_POOL.filter(k=>gradeOf(k)==='C'||gradeOf(k)==='R').map(k=>({id:k,ko:nm(k)+' 카드 +1',en:nm(k)+' · +1 card',grant:()=>recOf('unit',k).cards++}))];
 let candidates=pool.filter(x=>!last.has(x.id));if(candidates.length<3)candidates=pool;
 r.storyOffers=[];while(r.storyOffers.length<3&&candidates.length)r.storyOffers.push(candidates.splice(Math.floor(Math.random()*candidates.length),1)[0]);
}
function foiStoryRewards(){
 const r=foiBossState();if(!r.remaining)return;
 const box=$('upChoices');box.replaceChildren();cards=[];if(!r.storyOffers.length)foiStoryRoll();
 for(const item of r.storyOffers){const b=basicButton(pgText(item.ko,item.en),()=>{
  if(CG.adActive||mode!=='upgrade'||r!==foiBossState()||r.remaining<=0)return;
  r.remaining=0;r.chosen.push(pgText(item.ko,item.en));item.grant();metaSave();rollUpgrades();
 },'card');b.dataset.supplyReward=item.id;box.append(b);cards.push(b);}
}
function foiRenderRewards(){
 let box=$('foiBossRewards');if(box)box.remove();
 if(!S||mode!=='upgrade'||S.evoNeedSelection||EVO_DEBRIEF.swap||['depart','arrive'].includes(EVO_DEBRIEF.phase))return;
 if(!S.story&&S.stage===1&&pgState().tutorial===0&&!pgState().tutorialDeferred)return;
 const r=foiBossState(),battle=S,eligible=S.story||EVO_UPGRADES.some(evoUpgradeEligible);
 if(!S.story&&!eligible)r.remaining=0;
 const extraEligible=S.story||foiUpgradeCapacity()>r.remaining;
 const rerollEligible=S.story||EVO_UPGRADES.filter(evoUpgradeEligible).length>$('upChoices').querySelectorAll('[data-upgrade]').length;
 box=pgNode('section',null,'foi-rewards');box.id='foiBossRewards';
 if(S.story)foiStoryRewards();
 else if(r.remaining<=0){$('upChoices').replaceChildren();cards=[];$('upTitle').textContent=pgText('전력 강화 완료','Upgrades secured');}
 else $('upTitle').textContent=pgText('강화 ','CHOOSE ')+r.remaining+pgText('개를 선택하세요',' UPGRADE'+(r.remaining===1?'':'S'));
 if(r.chosen.length)box.append(pgNode('p',pgText('확보한 보상 · ','SECURED · ')+r.chosen.join(' / '),'foi-reward-note foi-earned'));
 const next=pgButton('foiBossContinue',r.remaining>0?pgText('위에서 보상을 선택하세요','Select your reward above'):S.story?pgText('다음 작전 선택','Choose next operation'):pgText('다음 전투로 출격','Continue to next battle'),()=>{
  if(CG.adActive||S!==battle||r.remaining>0||EVO_DEBRIEF.busy)return;
  if(S.story){showMenu();pgOpenStory(S.story.ch);}else{if(!eligible)S.hp=maxHp();advanceAfterUpgrade();}
 },'pg-button pg-primary foi-continue');
 // At the upgrade cap the original full-repair action is the free alternative.
 next.disabled=r.remaining>0&&eligible;box.append(next);
 const row=pgNode('div',null,'foi-ad-row');
 const valid=()=>S===battle&&mode==='upgrade'&&foiBossState()===r&&!S.evoNeedSelection&&!EVO_DEBRIEF.busy;
 const bonus=foiAdButton('foiBossBonus',r.bonus?'추가 보상 확보':'광고 보고 보상 1개 더',r.bonus?'Extra reward claimed':'Watch ad · One extra reward',pgText('보스 보상마다 1회','Once per boss reward'),async()=>{
  const ok=await foiReward(()=>valid()&&!r.bonus&&eligible&&extraEligible,()=>{r.bonus=true;r.remaining++;if(S.story)foiStoryRoll();});
  if(valid()){if(ok)rollUpgrades();else foiRenderRewards();}
 });bonus.disabled=r.bonus||!eligible||!extraEligible;row.append(bonus);
 const reroll=foiAdButton('foiBossReroll',r.reroll?'다시 뽑기 사용 완료':'광고 보고 다른 보상 보기',r.reroll?'Reroll used':'Watch ad · Reroll choices',pgText('미선택 보상만 · 1회','Unselected choices · Once'),async()=>{
  const ok=await foiReward(()=>valid()&&!r.reroll&&r.remaining>0&&eligible&&rerollEligible,()=>{r.reroll=true;if(S.story)foiStoryRoll();});
  if(valid()){if(ok)rollUpgrades();else foiRenderRewards();}
 });reroll.disabled=r.reroll||r.remaining<=0||!eligible||!rerollEligible;row.append(reroll);box.append(row);
 box.append(pgNode('p',S.story?pgText('별·임무 보상은 이미 저장되었습니다. 추가 보급은 선택 사항입니다.','Stars and mission rewards are already saved. Extra supplies are optional.'):pgText('기본 강화 1개는 광고 없이 선택합니다. 추가 강화도 이번 출격의 다음 스테이지에 유지됩니다.','Choose one upgrade without an ad. Extra upgrades also carry into the next sector of this run.'),'foi-reward-note'));
 $('upChoices').after(box);
}
const foiRewardRoll=rollUpgrades;
rollUpgrades=function(){foiRewardRoll();foiRenderRewards();};
const foiFleetSelection=evoShowLegendSelection;
evoShowLegendSelection=function(...args){$('foiBossRewards')?.remove();return foiFleetSelection(...args);};
function foiSupplyCopy(){return pgText('광고 완료 시 아스트라늄 +15 · 오늘 남은 보급 ','Complete an ad for +15 Astranium · Supplies left today: ')+foiSupplyLeft()+'/3';}
async function foiClaimSupply(){
 const day=foiSupplyBudget().day;
 return foiReward(()=>foiSupplyLeft()>0&&foiSupplyBudget().day===day,()=>{foiSupplyBudget().count++;META.astranium+=FOI_REWARDS.astranium;});
}
const foiShop=pgOpenShop;
pgOpenShop=function(tab='unit',received=false){foiShop(tab);const panel=$('cgHub')?.querySelector('.pg-panel');if(!panel)return;
 // Keep the scripted first-run shop steps uncluttered.
 if(pgState().tutorial<25&&!pgState().tutorialDeferred)return;
 const box=pgNode('section',null,'foi-shop-supply');box.append(pgNode('h3',pgText('선택형 보급','Optional supplies')),pgNode('p',foiSupplyCopy(),'foi-reward-note'));
 box.append(pgNode('p',pgText('상점·전장 보급소 합계 하루 3회 · UTC 00:00 갱신. 전투 보상은 그대로 획득합니다.','Shop and field terminal share 3 claims per day · Resets at 00:00 UTC. Combat rewards remain unchanged.'),'foi-reward-note'));
 if(received)box.append(pgNode('p',pgText('보급 확보! 아스트라늄 +15 · 저장 완료','Supplies secured! +15 Astranium · Saved'),'foi-reward-note foi-earned'));
 box.append(pgButton('foiShopContinue',pgText('상점 계속 보기','Keep browsing'),()=>box.remove(),'pg-button pg-primary foi-continue'));
 const b=foiAdButton('foiShopAd','광고 보고 아스트라늄 +15','Watch ad · +15 Astranium','',async()=>{const ok=await foiClaimSupply();if(box.isConnected)pgOpenShop(tab,ok);});b.disabled=!foiSupplyLeft();box.append(b);
 const draws=panel.querySelector('.pg-draw-actions');draws?draws.after(box):panel.append(box);
};
// Reuse original art: solid board collides; floor decals do not enter S.props.
const foiBoardStage=startStage;
startStage=function(n){foiBoardStage(n);foiPlaceBoards();};
function foiPlaceBoards(){
 if(!S||pgState().tutorial<25&&!pgState().tutorialDeferred)return;
 S.props=S.props.filter(p=>p.key!=='ad_board');S.floorAds=[];
 const spots=[[170,160],[WORLD.w-170,160],[170,WORLD.h-160],[WORLD.w-170,WORLD.h-160]];
 spots.sort((a,b)=>Math.hypot(a[0]-S.px,a[1]-S.py)-Math.hypot(b[0]-S.px,b[1]-S.py));
 const spot=spots.find(([x,y])=>farFromAll(x,y,S.props,85)&&Math.hypot(x-S.px,y-S.py)>150&&(!S.base||Math.hypot(x-S.base.x,y-S.base.y)>300));
 if(spot){const b=propAt(spot[0],spot[1],'ad_board');b.foiSupply=true;S.props.push(b);}
 for(const [x,y]of [[WORLD.w*.28,WORLD.h*.23],[WORLD.w*.74,WORLD.h*.77]]){
  if(!farFromAll(x,y,S.props,80)||S.base&&Math.hypot(x-S.base.x,y-S.base.y)<200)continue;
  const w=135,im=IMG.ad_floor;S.floorAds.push({x,y,w,h:w*im.height/im.width});
 }
}
drawAdText=function(x,y,w,h,pr,scale){
 const px=x+w*pr.l,py=y+h*pr.t,pw=w*pr.w,ph=h*pr.h;if(pw<40)return;
 ctx.save();ctx.fillStyle='#1b1426e8';ctx.fillRect(px,py,pw,ph);ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='#efcf9a';ctx.font='bold '+Math.max(7,pw*.09*scale)+'px system-ui';ctx.fillText(pgText('연합 보급소','FIELD SUPPLY'),px+pw/2,py+ph*.35,pw*.94);
 ctx.fillStyle='#c5acd7';ctx.font=Math.max(6,pw*.06*scale)+'px system-ui';ctx.fillText(pgText('선택형 영상 보급','OPTIONAL VIDEO REWARD'),px+pw/2,py+ph*.72,pw*.94);ctx.restore();
};
function foiCloseSupply(){
 if(CG.adActive)return;const box=$('foiSupplyDialog');if(!box)return;box.remove();window.FOI_SUPPLY_OPEN=false;
 $('pausePanel').style.visibility='';if(mode==='pause'&&!document.hidden)foiPause(false);
}
function foiOpenSupply(){
 if(CG.adActive||mode!=='play'||PG.itemLesson||EVO_DEBRIEF.phase!=='idle')return;
 foiPause(true);clearBattleInput();window.FOI_SUPPLY_OPEN=true;$('pausePanel').style.visibility='hidden';
 const root=pgNode('div');root.id='foiSupplyDialog';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',pgText('전장 보급소','Field supply terminal'));
 const panel=pgNode('section'),heading=pgNode('h2',pgText('전장 보급소','Field supply terminal')),copy=pgNode('p',foiSupplyCopy());panel.append(heading,copy);
 panel.append(pgNode('p',pgText('전투가 일시정지되었습니다. 보급을 받지 않고 바로 계속할 수 있습니다.','Combat is paused. You can continue without taking supplies.')));
 const back=pgButton('foiSupplyContinue',pgText('전투 계속하기','Continue battle'),foiCloseSupply,'pg-button pg-primary foi-continue');panel.append(back);
 const ad=foiAdButton('foiFieldAd','광고 보고 아스트라늄 +15','Watch ad · +15 Astranium','',async()=>{const ok=await foiClaimSupply();copy.textContent=foiSupplyCopy();ad.disabled=!foiSupplyLeft();if(ok){const note=pgNode('p',pgText('아스트라늄 +15 · 저장 완료','+15 Astranium · Saved'),'foi-earned');panel.append(note);}back.focus();});ad.disabled=!foiSupplyLeft();panel.append(ad);root.append(panel);document.body.append(root);back.focus();
}
const foiBoardHUD=relSyncHUD;
relSyncHUD=function(){foiBoardHUD();let b=$('foiFieldBoard');if(!b){b=pgButton('foiFieldBoard',pgText('보급소 열기','Open supply terminal'),foiOpenSupply);b.hidden=true;document.body.append(b);}
 const p=S?.props?.find(p=>p.foiSupply),near=p&&Math.hypot(S.px-p.x,S.py-p.y)<300;
 if(!p||!near||mode!=='play'||CG.adActive||EVO_DEBRIEF.phase!=='idle'||PG.itemLesson){b.hidden=true;return;}
 const rect=cv.getBoundingClientRect(),x=(p.x-S.cam.x)/W*rect.width+rect.left,y=(p.y-S.cam.y-p.h*.48)/H*rect.height+rect.top;
 b.hidden=x<65||x>innerWidth-65||y<115||y>innerHeight-65;
 if(!b.hidden){b.textContent=pgText('보급소 열기','Open supply terminal');b.style.left=(x-65)+'px';b.style.top=y+'px';}
};

metaLoad();
LANG=['ko','en'].includes(META.lang)?META.lang:CG.locale==='ko'?'ko':'en';
ORIENT='auto';
if(typeof META.volMus==='number') VOL_MUS=META.volMus;
if(typeof META.volSfx==='number') VOL_SFX=META.volSfx;
document.body.classList.toggle('hideObj', !!META.hideObj);
applyViewport();
/* 강제 방향은 화면을 돌려 채우므로 '기기를 돌리세요' 안내가 필요 없습니다 */
(async()=>{
  cgLoadingStage("art");
  try{await loadArt();cgPreparePlasma31();cgPrepareArcade32();cgPrepareEffects33();}catch(e){cgStatusError(e);return;}
  velcaPrepareArt(); heroPrepareArt();
  visualSolidArt();
  try{ await buildTints(); }catch(e){ cgStatusError(e);return; }
  try{ await visualWarmArt(); for(const theme of THEMES) visualGroundTexture(theme); }catch(e){ console.warn('part cache fallback',e); }
  try{
    applyBuildModeUI(); applyStaticLang();
    cgCommunityInit();basicInit();cgEvent('loadingStop');evoAutoStart();
    cgGameStarted();requestAnimationFrame(loop);
  }
  catch(e){
    console.error('bootstrap fallback',e);
    const l=$('lyLoad'); if(l){ l.innerHTML='<div class="eyebrow">Mobile Safe Mode</div><h2>게임 시작</h2><button id="safeStart" style="margin-top:16px;padding:14px 24px;font-weight:900">메뉴 열기</button>'; const b=$('safeStart'); if(b)b.onclick=()=>{try{applyStaticLang();showMenu();requestAnimationFrame(loop);}catch(_){location.reload();}}; }
  }
})();
