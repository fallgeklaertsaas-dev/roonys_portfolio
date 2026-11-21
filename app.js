(()=>{
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const root=document.documentElement;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const saveData=Boolean(navigator.connection?.saveData);
const lowPower=coarse||saveData||((navigator.hardwareConcurrency||8)<=4);
const engineCapable=!reduce&&typeof requestAnimationFrame==='function';

history.scrollRestoration='manual';

const stage=$('#stage');
const scan=$('#scan');
const boot=$('#boot');
const hint=$('#hint');
const hud=$('#hud');
const bar=$('#bar');
const progressTrack=$('#progressTrack');
const st=$('#st');
const nDone=$('#nDone');
const nAll=$('#nAll');
const nAgents=$('#nAgents');
const avs=$('#avs');
const bTour=$('#bTour');
const bAuto=$('#bAuto');
const bSpeed=$('#bSpeed');
const bSound=$('#bSound');
const bSkip=$('#bSkip');
const bReplay=$('#bReplay');
const icoPlay=$('#icoPlay');
const canvas=$('#swarm');
const ctx=canvas?.getContext?.('2d')||null;

const COLORS=['#ff6b5e','#ffb02e','#ffe14d','#7dff8f','#35e0c2','#4db8ff','#8f93ff','#d07bff','#ff7ac8','#8fe1ff','#b7ff65','#ff8bb1'];
const ROLES=['layout','type','product','systems','security','ai'];
const AGENT_COUNT=coarse?5:(lowPower?6:9);

let speed=1;
let started=false;
let finished=false;
let paused=false;
let auto=!coarse;
let touring=false;
let visibleBuilding=false;
let manualUntil=0;
let scrollToken=0;
let buildDone=0;
let soundOn=false;
let finaleStarted=false;
let particles=[];
let lastProgressAt=Date.now();
let manualTimer=null;
let pausedByVisibility=false;
const builtItems=new WeakSet();

if(engineCapable) root.classList.add('build-mode','locked');

nAgents.textContent=AGENT_COUNT;
hint.textContent=`${AGENT_COUNT} Build-Agenten setzen das Portfolio zusammen…`;
bAuto.classList.toggle('on',auto);
bAuto.setAttribute('aria-pressed',String(auto));

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(1,ms/speed)));

function setStatus(value){st.textContent=value}
function setAccent(c){root.style.setProperty('--acc',c)}
function setProgress(){
  const max=Math.max(1,allItems.length);
  const pct=Math.round(buildDone/max*100);
  nDone.textContent=buildDone;
  bar.style.width=pct+'%';
  progressTrack?.setAttribute('aria-valuenow',String(pct));
  lastProgressAt=Date.now();
  if(buildDone>0&&window.__portfolioFailsafe){clearTimeout(window.__portfolioFailsafe);window.__portfolioFailsafe=null}
}
function updatePlayIcon(){
  icoPlay.textContent=!started?'▶':finished?'↻':paused?'▶':'Ⅱ';
  bTour.setAttribute('aria-label',!started?'Build starten':finished?'Build erneut starten':paused?'Build fortsetzen':'Build pausieren');
}
function updateSoundButton(){
  bSound.classList.toggle('off',!soundOn);
  bSound.setAttribute('aria-pressed',String(soundOn));
  bSound.setAttribute('aria-label',soundOn?'Sound ausschalten':'Sound einschalten');
}

async function animate(ms,onFrame,cancel){
  const duration=Math.max(1,ms/speed);
  let elapsed=0;
  let last=performance.now();
  return new Promise(resolve=>{
    const tick=now=>{
      if(cancel?.()){resolve(false);return}
      const dt=Math.min(40,now-last);
      last=now;
      if(!paused) elapsed+=dt;
      const t=clamp(elapsed/duration,0,1);
      onFrame(ease(t),t);
      if(t<1) requestAnimationFrame(tick);
      else resolve(true);
    };
    requestAnimationFrame(tick);
  });
}

function emergencyReveal(reason='fallback'){
  try{
    scrollToken++;
    started=true;finished=true;paused=false;touring=false;
    root.classList.remove('locked','build-mode');
    root.classList.add('instant','inked');
    allItems.forEach(el=>{el.classList.add('built');builtItems.add(el)});
    blocks.forEach(b=>{b.built=true;b.building=false});
    $$('.wire').forEach(el=>el.remove());
    boot?.classList.add('off');
    if(scan)scan.style.opacity='0';
    if(canvas)canvas.style.display='none';
    stage?.classList.add('settled');
    buildDone=allItems.length;
    setProgress();
    history.scrollRestoration='auto';
    bSkip.hidden=true;
    setStatus(reason==='error'?'Fallback':reason==='stalled'?'Stabil':'Fertig');
    updatePlayIcon();
    clearTimeout(window.__portfolioFailsafe);window.__portfolioFailsafe=null;
  }catch{}
}

window.addEventListener('error',()=>setTimeout(()=>emergencyReveal('error'),0));
window.addEventListener('unhandledrejection',()=>setTimeout(()=>emergencyReveal('error'),0));

/* ---------- lightweight sound ---------- */
const sfx={
  ctx:null,
  ensure(){
    if(!this.ctx){
      try{this.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch{}
    }
    this.ctx?.resume?.();
  },
  tone(freq=620,dur=.045,vol=.022){
    if(!soundOn)return;
    this.ensure();
    if(!this.ctx)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;
    o.type='triangle';o.frequency.value=freq;
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+dur+.02);
  },
  build(i){this.tone(360+(i%7)*48,.045,.018)},
  chord(){[330,440,550].forEach((f,i)=>setTimeout(()=>this.tone(f,.18,.022),i*60))}
};

/* ---------- agents ---------- */
const arrowSvg=c=>`<svg class="arrow" viewBox="0 0 18 23"><path d="M2 1.5v16l4.3-4 3.1 7 2.7-1.1-3-6.8h6z" fill="${c}" stroke="#fff" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
const crossSvg=`<svg class="cross" viewBox="0 0 18 18"><path d="M9 1v16M1 9h16" stroke="#060607" stroke-width="4.4" stroke-linecap="round"/><path d="M9 1v16M1 9h16" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ibeamSvg=`<svg class="ibeam" viewBox="0 0 18 18"><path d="M5 2h8M5 16h8M9 2v14" stroke="#060607" stroke-width="4.2" stroke-linecap="round"/><path d="M5 2h8M5 16h8M9 2v14" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`;

class Agent{
  constructor(i){
    this.i=i;
    this.color=COLORS[i%COLORS.length];
    this.x=innerWidth/2+(i-AGENT_COUNT/2)*7;
    this.y=innerHeight/2+(i%3)*6;
    this.el=document.createElement('div');
    this.el.className='agent';
    this.el.style.color=this.color;
    this.el.innerHTML=arrowSvg(this.color)+crossSvg+ibeamSvg+(ROLES[i]?`<label style="background:${this.color}">${ROLES[i]}</label>`:'');
    this.el.dataset.mode='arrow';
    stage?.appendChild(this.el);
    this.render();
  }
  render(){this.el.style.transform=`translate3d(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px,0)`}
  mode(m){this.el.dataset.mode=m}
  click(){this.el.classList.remove('click');void this.el.offsetWidth;this.el.classList.add('click')}
  async moveTo(x,y,dur){
    const sx=this.x,sy=this.y;
    const dx=x-sx,dy=y-sy,d=Math.hypot(dx,dy)||1;
    const bend=Math.sin((this.i+1)*1.63+x*.009+y*.007)*Math.min(82,d*.16);
    const cx=(sx+x)/2-dy/d*bend,cy=(sy+y)/2+dx/d*bend;
    const base=dur??clamp(150+d*.28,180,520);
    await animate(base,e=>{
      const u=1-e;
      this.x=u*u*sx+2*u*e*cx+e*e*x;
      this.y=u*u*sy+2*u*e*cy+e*e*y;
      this.render();
    });
  }
}
const agents=engineCapable?Array.from({length:AGENT_COUNT},(_,i)=>new Agent(i)):[];
avs.innerHTML=agents.slice(0,5).map(a=>`<i style="background:${a.color}"></i>`).join('');

/* ---------- blocks ---------- */
const blocks=$$('[data-block]').map((el,bi)=>{
  const items=[...el.querySelectorAll('[data-item]')].filter(x=>x.closest('[data-block]')===el);
  if(el.hasAttribute('data-item'))items.unshift(el);
  return {el,items:[...new Set(items)],index:bi,built:false,building:false};
});
const allItems=[...new Set(blocks.flatMap(b=>b.items))];
nAll.textContent=allItems.length;
setProgress();

function rect(el){return el.getBoundingClientRect()}
function renderable(el){
  if(!el?.isConnected)return false;
  const s=getComputedStyle(el);
  if(s.display==='none'||s.visibility==='hidden')return false;
  const r=rect(el);
  return el.getClientRects().length>0&&(r.width>0||r.height>0);
}
function onscreen(el){
  const r=rect(el);
  return r.bottom>16&&r.top<innerHeight-16&&r.right>8&&r.left<innerWidth-8;
}
function markBuilt(item){
  if(builtItems.has(item))return false;
  builtItems.add(item);
  item.classList.add('built');
  buildDone++;
  setProgress();
  sfx.build(buildDone);
  return true;
}
function visibleRect(el){
  const r=rect(el);
  const left=clamp(r.left,5,innerWidth-10);
  const top=clamp(r.top,5,innerHeight-10);
  const right=clamp(r.right,10,innerWidth-5);
  const bottom=clamp(r.bottom,10,innerHeight-5);
  return {left,top,width:Math.max(8,right-left),height:Math.max(8,bottom-top)};
}
function makeWire(r){
  const w=document.createElement('div');
  w.className='wire';
  w.innerHTML='<em>0 × 0</em>';
  w.style.left=r.left+'px';w.style.top=r.top+'px';w.style.width='0px';w.style.height='0px';
  stage.appendChild(w);
  return w;
}
async function drawWire(agent,el){
  const r=visibleRect(el);
  await agent.moveTo(r.left,r.top,185);
  agent.mode('cross');
  const w=makeWire(r),label=w.querySelector('em');
  await animate(clamp(120+Math.hypot(r.width,r.height)*.14,145,315),e=>{
    w.style.width=(r.width*e)+'px';
    w.style.height=(r.height*e)+'px';
    label.textContent=Math.round(r.width*e)+' × '+Math.round(r.height*e);
    agent.x=r.left+r.width*e;
    agent.y=r.top+r.height*e;
    agent.render();
  });
  return w;
}
function splitText(el){
  const original=el.innerHTML;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  const chars=[];
  nodes.forEach(node=>{
    if(!node.textContent.length)return;
    const frag=document.createDocumentFragment();
    [...node.textContent].forEach(ch=>{
      const s=document.createElement('span');
      s.className='ch';s.textContent=ch;frag.appendChild(s);chars.push(s);
    });
    node.replaceWith(frag);
  });
  return {original,chars};
}
async function revealText(agent,el){
  const text=(el.textContent||'').trim();
  if(text.length>68||el.querySelector('b,strong,em,a,code,kbd')){
    agent.mode('ibeam');
    el.classList.add('text-sweep');
    markBuilt(el);
    const r=visibleRect(el);
    await agent.moveTo(r.left+r.width*.76,r.top+r.height*.55,135);
    await sleep(105);
    return;
  }
  const {original,chars}=splitText(el);
  el.classList.add('built');
  builtItems.add(el);
  agent.mode('ibeam');
  const total=chars.length;
  await animate(clamp(total*4.4,95,340),(e,t)=>{
    const upto=Math.floor(t*total);
    for(let i=0;i<upto;i++)chars[i]?.classList.add('v');
    const c=chars[Math.max(0,upto-1)];
    if(c){
      const r=c.getBoundingClientRect();
      if(r.width||r.height){agent.x=clamp(r.right+2,0,innerWidth-12);agent.y=clamp(r.top+r.height*.55,0,innerHeight-12);agent.render()}
    }
  });
  el.innerHTML=original;
  el.classList.add('built');
  buildDone++;
  setProgress();
  sfx.build(buildDone);
}
async function buildItem(item,index){
  if(builtItems.has(item)||item.classList.contains('built'))return;
  if(!renderable(item)){
    markBuilt(item);
    return;
  }
  if(!onscreen(item)){
    item.classList.add('text-sweep');
    markBuilt(item);
    return;
  }
  const agent=agents[index%agents.length];
  if(!agent){markBuilt(item);return}
  const wire=await drawWire(agent,item);
  await sleep(24);
  const kind=item.dataset.item;
  if(kind==='text'){
    await revealText(agent,item);
  }else if(kind==='mega'){
    markBuilt(item);
    agent.mode('arrow');agent.click();
    await sleep(360);
  }else{
    const rr=visibleRect(item);
    await agent.moveTo(rr.left+rr.width*.52,rr.top+rr.height*.48,125);
    agent.mode('arrow');agent.click();
    markBuilt(item);
    await sleep(38);
  }
  wire?.classList.add('out');
  setTimeout(()=>wire?.remove(),180);
}
async function buildBlock(block){
  if(block.built||block.building)return;
  block.building=true;
  setStatus('Build');
  const items=block.items.filter(x=>!builtItems.has(x)&&!x.classList.contains('built'));
  const batchSize=lowPower?2:Math.min(3,agents.length);
  for(let i=0;i<items.length;i+=batchSize){
    while(paused)await sleep(70);
    const batch=items.slice(i,i+batchSize);
    await Promise.all(batch.map((it,j)=>sleep(j*(lowPower?34:30)).then(()=>buildItem(it,i+j+block.index))));
  }
  block.built=true;
  block.building=false;
  if(block.el.hasAttribute('data-finale'))runFinale();
}

/* ---------- tour ---------- */
function visibleBlocks(){
  return blocks.filter(b=>{
    const r=rect(b.el);
    return r.bottom>70&&r.top<innerHeight-40;
  });
}
async function buildVisibleSequential(){
  if(visibleBuilding)return;
  visibleBuilding=true;
  for(const block of visibleBlocks()) await buildBlock(block);
  visibleBuilding=false;
  if(blocks.every(b=>b.built)&&!finished)finishBuild();
}
function targetY(block){
  const r=rect(block.el);
  const absolute=scrollY+r.top;
  if(block.index===0)return 0;
  return clamp(absolute-Math.max(36,(innerHeight-Math.min(r.height,innerHeight*.82))/2),0,document.documentElement.scrollHeight-innerHeight);
}
async function smoothTo(y,duration=760,token=scrollToken){
  const from=scrollY,dist=y-from;
  if(Math.abs(dist)<4)return true;
  return animate(clamp(duration,260,1050),e=>scrollTo(0,from+dist*e),()=>token!==scrollToken);
}
async function waitManual(){
  while(Date.now()<manualUntil||paused)await sleep(70);
}
async function tour(){
  if(touring||finished||!started||!auto)return;
  touring=true;
  const token=++scrollToken;
  for(const block of blocks){
    if(!auto||finished||token!==scrollToken)break;
    if(block.built)continue;
    await waitManual();
    if(!auto||token!==scrollToken)break;
    setStatus('Auto');
    const moved=await smoothTo(targetY(block),block.index===0?360:720,token);
    if(!moved||token!==scrollToken)break;
    await sleep(130);
    await buildBlock(block);
    await sleep(block.index===0?320:185);
  }
  touring=false;
  if(blocks.every(b=>b.built)&&!finished)finishBuild();
}
function finishBuild(){
  if(finished)return;
  finished=true;touring=false;
  root.classList.remove('locked');
  root.classList.add('inked');
  setAccent('#fff313');
  setStatus('Fertig');
  history.scrollRestoration='auto';
  bSkip.hidden=true;
  updatePlayIcon();
  sfx.chord();
  runFinale();
  setTimeout(()=>stage?.classList.add('settled'),700);
}

function skipBuild(){
  scrollToken++;
  touring=false;paused=false;started=true;finished=true;
  root.classList.remove('locked','build-mode');
  root.classList.add('instant','inked');
  allItems.forEach(el=>{el.classList.add('built');builtItems.add(el)});
  blocks.forEach(b=>{b.built=true;b.building=false});
  buildDone=allItems.length;
  setProgress();setStatus('Übersprungen');
  history.scrollRestoration='auto';
  bSkip.hidden=true;
  updatePlayIcon();
  boot?.classList.add('off');
  if(scan)scan.style.opacity='0';
  $$('.wire').forEach(w=>w.remove());
  stage?.classList.add('settled');
  if(canvas)canvas.style.display='none';
  clearTimeout(window.__portfolioFailsafe);window.__portfolioFailsafe=null;
}

/* ---------- startup ---------- */
async function brandPass(){
  for(const c of ['#8f93ff','#35e0c2','#fff313']){
    setAccent(c);
    await sleep(70);
  }
  root.classList.add('inked');
}
async function start(){
  if(started||!engineCapable)return;
  started=true;paused=false;updatePlayIcon();setStatus('Scan');
  scan.style.opacity='1';
  scan.style.transform='translateY(0)';
  await animate(610,e=>{scan.style.transform=`translateY(${innerHeight*e}px)`});
  scan.style.opacity='0';
  boot.classList.add('off');
  stage?.classList.remove('idle','settled');
  await sleep(105);
  await brandPass();
  if(auto) tour();
  else buildVisibleSequential();
}
const handsOn=()=>{
  if(!started||finished)return;
  manualUntil=Date.now()+1350;
  document.body.classList.add('manual');
  clearTimeout(manualTimer);
  manualTimer=setTimeout(()=>document.body.classList.remove('manual'),900);
  if(touring){scrollToken++;touring=false;setStatus('Manuell')}
  buildVisibleSequential();
  if(auto)setTimeout(()=>{if(started&&!finished&&auto&&!touring&&Date.now()>=manualUntil)tour()},1420);
};
addEventListener('wheel',handsOn,{passive:true});
addEventListener('touchmove',handsOn,{passive:true});

if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
    if(!started||auto)return;
    if(entries.some(e=>e.isIntersecting))buildVisibleSequential();
  },{threshold:.1});
  blocks.forEach(b=>observer.observe(b.el));
}

/* ---------- active nav ---------- */
const navAnchors=$('.nav a[href^="#"],.mobile-nav-panel a[href^="#"]');
if('IntersectionObserver' in window&&navAnchors.length){
  const sectionLinks=new Map();
  navAnchors.forEach(a=>{
    const id=a.getAttribute('href')?.slice(1);
    if(!id)return;
    if(!sectionLinks.has(id))sectionLinks.set(id,[]);
    sectionLinks.get(id).push(a);
  });
  const navObserver=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(!visible)return;
    navAnchors.forEach(a=>a.classList.remove('active'));
    (sectionLinks.get(visible.target.id)||[]).forEach(a=>a.classList.add('active'));
  },{rootMargin:'-35% 0px -50%',threshold:[0,.2,.5,.8]});
  sectionLinks.forEach((_,id)=>{const sec=document.getElementById(id);if(sec)navObserver.observe(sec)});
}

/* ---------- controls ---------- */
function togglePause(){
  if(finished){replay();return}
  if(!started){start();return}
  paused=!paused;
  setStatus(paused?'Pause':touring?'Auto':'Build');
  updatePlayIcon();
  if(!paused&&auto&&!touring)setTimeout(tour,70);
}
function toggleAuto(){
  auto=!auto;
  bAuto.classList.toggle('on',auto);
  bAuto.setAttribute('aria-pressed',String(auto));
  setStatus(auto?'Auto':'Manuell');
  if(!auto){
    scrollToken++;touring=false;buildVisibleSequential();
  }else if(started&&!finished){
    setTimeout(tour,80);
  }
}
function setSpeed(v){speed=v;bSpeed.textContent=v+'×';bSpeed.setAttribute('aria-label',`Animationsgeschwindigkeit ${v} fach`)}
function toggleSound(){
  soundOn=!soundOn;updateSoundButton();
  if(soundOn){sfx.ensure();sfx.tone(660,.11,.035)}
}
function resetBuildState(){
  scrollToken++;
  touring=false;visibleBuilding=false;finished=false;paused=false;started=false;finaleStarted=false;
  buildDone=0;setProgress();setStatus('Bereit');
  history.scrollRestoration='manual';
  bSkip.hidden=false;
  if(canvas)canvas.style.display='';
  stage?.classList.remove('settled');
  stage?.classList.add('idle');
  root.classList.add('build-mode','locked');
  root.classList.remove('instant','inked');
  stage?.classList.remove('settled');
  setAccent('#fff313');
  allItems.forEach(el=>{builtItems.delete?.(el);el.classList.remove('built','text-sweep')});
  $$('.wire').forEach(w=>w.remove());
  agents.forEach((a,i)=>{a.x=innerWidth/2+(i-AGENT_COUNT/2)*7;a.y=innerHeight/2+(i%3)*6;a.mode('arrow');a.render()});
  blocks.forEach(b=>{b.built=false;b.building=false});
  ctx?.clearRect(0,0,innerWidth,innerHeight);
  if(boot){boot.classList.remove('off');hint.textContent=`${AGENT_COUNT} Build-Agenten setzen das Portfolio zusammen…`}
  scrollTo(0,0);updatePlayIcon();
}
function replay(){resetBuildState();setTimeout(start,420)}

bTour.addEventListener('click',togglePause);
bAuto.addEventListener('click',toggleAuto);
bSpeed.addEventListener('click',()=>setSpeed(speed===1?2:1));
bSound.addEventListener('click',toggleSound);
bSkip.addEventListener('click',skipBuild);
bReplay.addEventListener('click',replay);
updateSoundButton();

$('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{if(started&&!finished)skipBuild()}));
$('.mobile-nav-panel a').forEach(a=>a.addEventListener('click',()=>a.closest('details')?.removeAttribute('open')));

document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&started&&!finished&&!paused){
    paused=true;pausedByVisibility=true;setStatus('Pause');updatePlayIcon();
  }else if(!document.hidden&&pausedByVisibility){
    paused=false;pausedByVisibility=false;setStatus(auto?'Auto':'Build');updatePlayIcon();
    if(auto&&!touring)setTimeout(tour,100);
  }
});

addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||/input|textarea|select/i.test(e.target?.tagName)||e.target?.isContentEditable)return;
  const k=e.key.toLowerCase();
  if(k===' '){e.preventDefault();togglePause()}
  else if(k==='r')replay();
  else if(k==='a')toggleAuto();
  else if(k==='m')toggleSound();
  else if(k==='s')skipBuild();
  else if(k==='1')setSpeed(1);
  else if(k==='2')setSpeed(2);
});

/* ---------- case studies ---------- */
const CASES={
  autpilot:{
    kicker:'Legal-Tech SaaS · Active prototype',title:'AutPilot',
    blocks:[
      ['Problem','Fall-, Dokumenten- und Kommunikationsprozesse liegen häufig in mehreren Systemen. Das erzeugt Medienbrüche, doppelte Arbeit und fehlenden Kontext.'],
      ['Meine Rolle','Produktkonzept, Informationsarchitektur, Full-Stack-Umsetzung sowie Entscheidungen rund um Authentifizierung und Row Level Security.'],
      ['Ansatz','Fallorientiertes Datenmodell, rollenbasierter Zugriff, strukturierte Dokumentenworkflows sowie Parser-/AI-Komponenten als unterstützende Layer.'],
      ['Lernwert','Praktische Vertiefung von Auth, RLS, Storage, Parser-Services, B2B-Workflow-Design und sicherer Systemgrenzziehung.']
    ],
    decision:'Sicherheit und Autorisierung bleiben deterministisch und serverseitig. AI darf Prozesse unterstützen, aber keine Zugriffslogik ersetzen.'
  },
  lifeos:{
    kicker:'Productivity platform · Web',title:'Life-OS',
    blocks:[
      ['Problem','Studium, Aufgaben, Notizen und Planung verteilen sich schnell auf mehrere Tools; Prioritäten und Kontext gehen beim Wechsel verloren.'],
      ['Meine Rolle','Product Design, Informationsarchitektur, Frontend-/Backend-Implementierung und laufende UX-Iteration.'],
      ['Ansatz','Gemeinsame Datenmodelle für Planner, Studium und Notizen; kompakte Tagesansichten; mobile Nutzung und PWA-Verhalten als Kernanforderungen.'],
      ['Lernwert','Synchronisation, Informationsdichte, Datenmodellierung, Produkt-Scope und die Frage, welche Funktionen wirklich zusammengehören.']
    ],
    decision:'Zusammengehörige Kontexte werden bewusst verbunden. Nicht jede Funktion erhält eine eigene App oder isolierte Seite.'
  },
  unisation:{
    kicker:'Native iOS · Local-first',title:'Unisation',
    blocks:[
      ['Problem','Studienorganisation liegt zwischen Kalender, Lernapps, Notizen und Zeittracking. Fortschritt bleibt dadurch häufig intransparent.'],
      ['Meine Rolle','Native iOS Product Design, SwiftUI-Umsetzung, lokale Datenlogik und Interaktionskonzept.'],
      ['Ansatz','Local-first MVP mit Planner, Modulen, Deadlines, Study Timer und formelbasiertem Lernfortschritt.'],
      ['Lernwert','Native UX, Datenhaltung, Accessibility und motivierende, aber nachvollziehbare Fortschrittsdarstellung.']
    ],
    decision:'Messbarer Fortschritt bleibt deterministisch. AI wird nur dort ergänzt, wo sie echten Mehrwert liefert.'
  }
};
const dialog=$('#caseDialog'),caseTitle=$('#caseTitle'),caseKicker=$('#caseKicker'),caseGrid=$('#caseGrid'),caseDecision=$('#caseDecision'),caseClose=$('#caseClose');
let lastFocus=null;
let caseWasPaused=false;
function openCase(btn){
  const c=CASES[btn.dataset.case];if(!c)return;
  lastFocus=btn;
  caseWasPaused=paused;
  if(started&&!finished){paused=true;setStatus('Detail');updatePlayIcon()}
  caseKicker.textContent=c.kicker;caseTitle.textContent=c.title;
  caseGrid.innerHTML=c.blocks.map(([h,p])=>`<div><b>${h}</b><p>${p}</p></div>`).join('');
  caseDecision.innerHTML=`<b>Architecture / Product Decision</b><p>${c.decision}</p>`;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  requestAnimationFrame(()=>caseClose.focus());
}
function closeCase(){
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');
}
$$('[data-case]').forEach(btn=>btn.addEventListener('click',()=>openCase(btn)));
caseClose.addEventListener('click',closeCase);
dialog.addEventListener('click',e=>{if(e.target===dialog)closeCase()});
dialog.addEventListener('close',()=>{
  lastFocus?.focus();
  if(started&&!finished&&!caseWasPaused){
    paused=false;
    setStatus(auto?'Auto':'Build');
    updatePlayIcon();
    if(auto&&!touring)setTimeout(tour,140);
    else if(!auto)buildVisibleSequential();
  }
});

/* ---------- finale swarm ---------- */
function sizeCanvas(){
  if(!ctx||!canvas)return 1;
  const d=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.max(1,innerWidth*d);canvas.height=Math.max(1,innerHeight*d);
  canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';
  ctx.setTransform(d,0,0,d,0,0);
  return d;
}
function textPoints(word,count){
  const off=document.createElement('canvas');
  off.width=Math.min(1100,innerWidth);off.height=Math.min(340,innerHeight*.4);
  const ox=off.getContext('2d',{willReadFrequently:true});
  if(!ox)return [];
  let fs=Math.min(off.height*.7,180);
  ox.font=`900 ${fs}px Arial Narrow, Arial, sans-serif`;
  while(ox.measureText(word).width>off.width*.84&&fs>40){fs-=4;ox.font=`900 ${fs}px Arial Narrow, Arial, sans-serif`}
  ox.fillStyle='#fff';ox.textAlign='center';ox.textBaseline='middle';ox.fillText(word,off.width/2,off.height/2);
  const data=ox.getImageData(0,0,off.width,off.height).data;
  const pts=[],step=lowPower?9:6;
  for(let y=0;y<off.height;y+=step)for(let x=0;x<off.width;x+=step)if(data[(y*off.width+x)*4+3]>120)pts.push([x,y]);
  for(let i=pts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pts[i],pts[j]]=[pts[j],pts[i]]}
  return Array.from({length:count},(_,i)=>pts[i%Math.max(1,pts.length)]||[off.width/2,off.height/2]).map(([x,y])=>[x+(innerWidth-off.width)/2,y+innerHeight*.3]);
}
function runFinale(){
  if(finaleStarted||reduce||!ctx)return;
  finaleStarted=true;sizeCanvas();
  const targets=textPoints('ROONY',lowPower?120:260);
  particles=targets.map((t,i)=>({x:Math.random()<.5?-24:innerWidth+24,y:Math.random()*innerHeight,tx:t[0],ty:t[1],c:COLORS[i%COLORS.length],vx:0,vy:0}));
  const startTime=performance.now();
  const frame=now=>{
    if(!finaleStarted)return;
    const dt=Math.min(30,(now-(frame.last||now))/1000);frame.last=now;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    particles.forEach(p=>{
      const ax=(p.tx-p.x)*12-p.vx*6.4,ay=(p.ty-p.y)*12-p.vy*6.4;
      p.vx+=ax*dt;p.vy+=ay*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      ctx.fillStyle=p.c;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+7,p.y+3.5);ctx.lineTo(p.x+2.5,p.y+9);ctx.closePath();ctx.fill();
    });
    if(now-startTime<4300)requestAnimationFrame(frame);
    else{ctx.clearRect(0,0,innerWidth,innerHeight);finaleStarted=false}
  };
  requestAnimationFrame(frame);
}
addEventListener('resize',()=>{if(finaleStarted)sizeCanvas()},{passive:true});

/* ---------- fail-safes + startup ---------- */
setTimeout(()=>{
  if(engineCapable&&!finished&&buildDone===0)emergencyReveal('fallback');
},7000);
setInterval(()=>{
  if(engineCapable&&started&&!finished&&!paused&&Date.now()-lastProgressAt>10500)emergencyReveal('stalled');
},2500);

if(!engineCapable){
  root.classList.remove('locked','build-mode');
  root.classList.add('instant','inked');
  allItems.forEach(el=>{el.classList.add('built');builtItems.add(el)});
  buildDone=allItems.length;setProgress();setStatus('Fertig');bSkip.hidden=true;history.scrollRestoration='auto';updatePlayIcon();
}else{
  updatePlayIcon();
  setTimeout(()=>{if(!started)start()},900);
}
})();