(()=>{
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const root=document.documentElement;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
history.scrollRestoration='manual';

const COLORS=['#ff6b5e','#ffb02e','#ffe14d','#7dff8f','#35e0c2','#4db8ff','#8f93ff','#d07bff','#ff7ac8','#8fe1ff','#b7ff65','#ff8bb1'];
const ROLES=['layout','type','product','systems','security','ai'];
const lowPower=coarse||((navigator.hardwareConcurrency||8)<=4);
const AGENT_COUNT=coarse?5:(lowPower?7:9);
const PARALLEL=coarse?2:3;

let speed=1;
let started=false;
let finished=false;
let paused=false;
let auto=true;
let touring=false;
let manualUntil=0;
let scrollToken=0;
let buildDone=0;
let soundOn=false;
let finaleStarted=false;
let lastProgressAt=Date.now();
let pausedByVisibility=false;

const stage=$('#stage');
const scan=$('#scan');
const boot=$('#boot');
const hud=$('#hud');
const bar=$('#bar');
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

nAgents.textContent=AGENT_COUNT;

const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(1,ms/speed)));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

const setStatus=s=>{st.textContent=s};
const setProgress=()=>{
  nDone.textContent=buildDone;
  bar.style.width=(buildDone/Math.max(1,allItems.length)*100)+'%';
  lastProgressAt=Date.now();
  if(buildDone>0&&window.__portfolioFailsafe){
    clearTimeout(window.__portfolioFailsafe);
    window.__portfolioFailsafe=null;
  }
};
const updatePlayIcon=()=>{
  icoPlay.textContent=finished?'↻':paused?'▶':'Ⅱ';
};
const setAccent=c=>root.style.setProperty('--acc',c);

function emergencyReveal(reason='fallback'){
  try{
    finished=true;paused=false;touring=false;
    root.classList.remove('locked');
    root.classList.add('instant','inked');
    document.querySelectorAll('[data-item]').forEach(el=>el.classList.add('built'));
    document.querySelectorAll('.wire').forEach(el=>el.remove());
    document.getElementById('boot')?.classList.add('off');
    const scanEl=document.getElementById('scan');if(scanEl)scanEl.style.opacity='0';
    const stageEl=document.getElementById('stage');if(stageEl)stageEl.hidden=true;
    const swarmEl=document.getElementById('swarm');if(swarmEl)swarmEl.style.display='none';
    buildDone=document.querySelectorAll('[data-item]').length;
    if(typeof setProgress==='function')setProgress();
    if(typeof setStatus==='function')setStatus(reason==='error'?'Static fallback':reason==='stalled'?'Recovered':'Built');
    if(typeof updatePlayIcon==='function')updatePlayIcon();
    clearTimeout(window.__portfolioFailsafe);
    window.__portfolioFailsafe=null;
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
    this.ctx?.resume();
  },
  tone(freq=620,dur=.045,vol=.025){
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
  build(i){this.tone(360+(i%8)*55,.055,.02)},
  chord(){[330,440,550,660].forEach((f,i)=>setTimeout(()=>this.tone(f,.22,.025),i*55))}
};

/* ---------- cursor agents ---------- */
const arrowSvg=c=>`<svg class="arrow" viewBox="0 0 18 23"><path d="M2 1.5v16l4.3-4 3.1 7 2.7-1.1-3-6.8h6z" fill="${c}" stroke="#fff" stroke-width="1.15" stroke-linejoin="round"/></svg>`;
const crossSvg=c=>`<svg class="cross" viewBox="0 0 18 18"><path d="M9 1v16M1 9h16" stroke="#060607" stroke-width="4" stroke-linecap="round"/><path d="M9 1v16M1 9h16" stroke="${c}" stroke-width="1.65" stroke-linecap="round"/></svg>`;
const ibeamSvg=c=>`<svg class="ibeam" viewBox="0 0 18 18"><path d="M5 2h8M5 16h8M9 2v14" stroke="#060607" stroke-width="4" stroke-linecap="round"/><path d="M5 2h8M5 16h8M9 2v14" stroke="${c}" stroke-width="1.55" stroke-linecap="round"/></svg>`;

class Agent{
  constructor(i){
    this.i=i;
    this.color=COLORS[i%COLORS.length];
    this.x=innerWidth/2+(Math.random()-.5)*80;
    this.y=innerHeight/2+(Math.random()-.5)*80;
    this.el=document.createElement('div');
    this.el.className='agent';
    this.el.style.color=this.color;
    this.el.innerHTML=arrowSvg(this.color)+crossSvg(this.color)+ibeamSvg(this.color)+(ROLES[i]&&i<5?`<label style="background:${this.color}">${ROLES[i]}</label>`:'');
    this.el.dataset.mode='arrow';
    stage.appendChild(this.el);
    this.render();
  }
  render(){this.el.style.transform=`translate3d(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px,0)`}
  mode(m){this.el.dataset.mode=m}
  click(){this.el.classList.remove('click');void this.el.offsetWidth;this.el.classList.add('click')}
  async moveTo(x,y,dur){
    dur=(dur??clamp(140+Math.hypot(x-this.x,y-this.y)*.28,170,470))/speed;
    const sx=this.x,sy=this.y;
    const dx=x-sx,dy=y-sy,d=Math.hypot(dx,dy)||1;
    const bend=(Math.random()-.5)*Math.min(120,d*.24);
    const cx=(sx+x)/2-dy/d*bend,cy=(sy+y)/2+dx/d*bend;
    const start=performance.now();
    await new Promise(resolve=>{
      const tick=now=>{
        if(paused){requestAnimationFrame(tick);return}
        const t=clamp((now-start)/dur,0,1),e=ease(t),u=1-e;
        this.x=u*u*sx+2*u*e*cx+e*e*x;
        this.y=u*u*sy+2*u*e*cy+e*e*y;
        this.render();
        if(t<1)requestAnimationFrame(tick);else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
}
const agents=Array.from({length:AGENT_COUNT},(_,i)=>new Agent(i));
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

function makeWire(r){
  const w=document.createElement('div');
  w.className='wire';
  w.innerHTML='<em>0 × 0</em>';
  w.style.left=r.left+'px';
  w.style.top=r.top+'px';
  w.style.width='0px';
  w.style.height='0px';
  stage.appendChild(w);
  return w;
}
async function drawWire(agent,el){
  const r=rect(el);
  const tx=clamp(r.left,4,innerWidth-10),ty=clamp(r.top,4,innerHeight-10);
  await agent.moveTo(tx,ty,210);
  agent.mode('cross');
  const w=makeWire(r);
  const label=w.querySelector('em');
  const dur=clamp(130+Math.hypot(r.width,r.height)*.16,155,360)/speed;
  const start=performance.now();
  await new Promise(resolve=>{
    const tick=now=>{
      if(paused){requestAnimationFrame(tick);return}
      const t=clamp((now-start)/dur,0,1),e=ease(t);
      w.style.width=(r.width*e)+'px';
      w.style.height=(r.height*e)+'px';
      label.textContent=Math.round(r.width*e)+' × '+Math.round(r.height*e);
      agent.x=tx+r.width*e;
      agent.y=ty+r.height*e;
      agent.render();
      if(t<1)requestAnimationFrame(tick);else resolve();
    };
    requestAnimationFrame(tick);
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
    if(!node.textContent.trim()&&node.textContent.length<2)return;
    const frag=document.createDocumentFragment();
    [...node.textContent].forEach(ch=>{
      const s=document.createElement('span');
      s.className='ch';
      s.textContent=ch;
      frag.appendChild(s);
      chars.push(s);
    });
    node.replaceWith(frag);
  });
  return {original,chars};
}
async function typeText(agent,el){
  const {original,chars}=splitText(el);
  el.classList.add('built');
  agent.mode('ibeam');
  const total=chars.length;
  if(!total){el.innerHTML=original;return}
  const duration=clamp(total*6.3,125,520)/speed;
  const start=performance.now();
  let shown=0;
  await new Promise(resolve=>{
    const tick=now=>{
      if(paused){requestAnimationFrame(tick);return}
      const t=clamp((now-start)/duration,0,1);
      const upto=Math.floor(t*total);
      for(let i=shown;i<upto;i++)chars[i]?.classList.add('v');
      shown=upto;
      const c=chars[Math.max(0,upto-1)];
      if(c){
        const r=c.getBoundingClientRect();
        if(r.width||r.height){agent.x=r.right+2;agent.y=r.top+r.height*.55;agent.render()}
      }
      if(t<1)requestAnimationFrame(tick);else resolve();
    };
    requestAnimationFrame(tick);
  });
  el.innerHTML=original;
  el.classList.add('built');
  agent.mode('arrow');
}

async function buildItem(item,index){
  if(item.classList.contains('built'))return;
  const agent=agents[index%agents.length];
  const r=rect(item);
  if(r.bottom<0||r.top>innerHeight) await sleep(25);
  agent.el.classList.remove('resting');
  const wire=await drawWire(agent,item);
  await sleep(28);
  const kind=item.dataset.item;
  if(kind==='text'){
    await typeText(agent,item);
  }else if(kind==='mega'){
    item.classList.add('built');
    agent.mode('arrow');agent.click();
    await sleep(420);
  }else{
    const rr=rect(item);
    await agent.moveTo(rr.left+rr.width*(.35+Math.random()*.3),rr.top+rr.height*(.35+Math.random()*.3),140);
    agent.mode('arrow');agent.click();
    item.classList.add('built');
    await sleep(52);
  }
  wire?.classList.add('out');
  setTimeout(()=>wire?.remove(),220);
  buildDone++;
  setProgress();
  sfx.build(buildDone);
  agent.mode('arrow');
  agent.el.classList.add('resting');
}

async function buildBlock(block){
  if(block.built||block.building)return;
  block.building=true;
  setStatus(block.index<2?'Building':'Assembling');
  const items=block.items.filter(x=>!x.classList.contains('built'));
  for(let i=0;i<items.length;i+=Math.min(PARALLEL,agents.length)){
    while(paused)await sleep(60);
    const batch=items.slice(i,i+Math.min(PARALLEL,agents.length));
    await Promise.all(batch.map((it,j)=>sleep(j*32).then(()=>buildItem(it,i+j+block.index))));
  }
  block.built=true;
  block.building=false;
  if(block.el.hasAttribute('data-finale'))runFinale();
}

/* ---------- auto tour ---------- */
function targetY(block){
  const r=block.el.getBoundingClientRect();
  const absolute=scrollY+r.top;
  const h=r.height;
  if(block.index===0)return 0;
  return clamp(absolute-Math.max(40,(innerHeight-h)/2),0,document.documentElement.scrollHeight-innerHeight);
}
async function smoothTo(y,duration=850,token=scrollToken){
  const from=scrollY,dist=y-from;
  if(Math.abs(dist)<4)return;
  const dur=clamp(duration,260,1300)/speed,start=performance.now();
  await new Promise(resolve=>{
    const tick=now=>{
      if(token!==scrollToken){resolve();return}
      if(paused){requestAnimationFrame(tick);return}
      const t=clamp((now-start)/dur,0,1);
      scrollTo(0,from+dist*ease(t));
      if(t<1)requestAnimationFrame(tick);else resolve();
    };
    requestAnimationFrame(tick);
  });
}
async function waitManual(){
  while(Date.now()<manualUntil||paused)await sleep(80);
}

async function tour(){
  if(touring||finished||!started||!auto)return;
  touring=true;
  const token=++scrollToken;
  try{
    for(const block of blocks){
      if(!auto||finished||token!==scrollToken)break;
      if(block.built)continue;
      await waitManual();
      if(!auto||token!==scrollToken)break;
      setStatus('Touring');
      await smoothTo(targetY(block),block.index===0?300:560,token);
      if(token!==scrollToken)break;
      await sleep(90);
      await buildBlock(block);
      await sleep(block.index===0?260:135);
    }
    if(blocks.every(b=>b.built)&&!finished)finishBuild();
  }catch(err){
    console.error('Portfolio tour failed',err);
    emergencyReveal('error');
  }finally{
    touring=false;
  }
}

function finishBuild(){
  finished=true;
  touring=false;
  root.classList.remove('locked');
  root.classList.add('inked');
  setAccent('#fff313');
  setStatus('Built');
  updatePlayIcon();
  clearTimeout(window.__portfolioFailsafe);
  window.__portfolioFailsafe=null;
  agents.forEach(a=>a.el.classList.add('resting'));
  setTimeout(()=>{if(finished)stage.style.opacity='.12'},900);
  sfx.chord();
  runFinale();
}

/* ---------- scan + startup ---------- */
async function brandPass(){
  const colors=['#a58bff','#3dffb0','#ff3348','#fff313'];
  for(const c of colors){setAccent(c);await sleep(72)}
  root.classList.add('inked');
}
async function start(){
  if(started)return;
  started=true;
  paused=false;
  lastProgressAt=Date.now();
  updatePlayIcon();
  try{
    setStatus('Scanning');
    scan.style.opacity='1';
    scan.style.transform='translateY(0)';
    scan.style.transition='none';
    await new Promise(resolve=>{
      const startedAt=performance.now(),dur=460;
      const tick=now=>{
        const t=clamp((now-startedAt)/dur,0,1);
        scan.style.transform=`translateY(${innerHeight*t}px)`;
        if(t<1)requestAnimationFrame(tick);else resolve();
      };
      requestAnimationFrame(tick);
    });
    scan.style.opacity='0';
    boot.classList.add('off');
    await sleep(65);
    await brandPass();
    if(auto)tour();else visibleBlocks().forEach(buildBlock);
  }catch(err){
    console.error('Portfolio start failed',err);
    emergencyReveal('error');
  }
}

function visibleBlocks(){
  return blocks.filter(b=>{const r=b.el.getBoundingClientRect();return r.bottom>80&&r.top<innerHeight-40});
}

/* manual handling */
let manualTimer;
const handsOn=()=>{
  if(!started||finished)return;
  manualUntil=Date.now()+1150;
  body.classList.add('manual');
  clearTimeout(manualTimer);
  manualTimer=setTimeout(()=>body.classList.remove('manual'),850);
  if(touring){scrollToken++;touring=false;setStatus('Manual');}
  visibleBlocks().forEach(buildBlock);
  if(auto)setTimeout(()=>{if(started&&!finished&&auto&&!touring&&Date.now()>=manualUntil)tour()},1220);
};
addEventListener('wheel',handsOn,{passive:true});
addEventListener('touchmove',handsOn,{passive:true});

const observer=new IntersectionObserver(entries=>{
  if(!started)return;
  entries.forEach(e=>{
    if(e.isIntersecting&&!auto){
      const block=blocks.find(b=>b.el===e.target);
      if(block)buildBlock(block);
    }
  })
},{threshold:.12});
blocks.forEach(b=>observer.observe(b.el));

/* ---------- controls ---------- */
function togglePause(){
  if(finished){replay();return}
  if(!started){start();return}
  paused=!paused;
  setStatus(paused?'Paused':touring?'Touring':'Building');
  updatePlayIcon();
  if(!paused&&auto&&!touring)setTimeout(tour,80);
}
function toggleAuto(){
  auto=!auto;
  bAuto.classList.toggle('on',auto);
  bAuto.setAttribute('aria-pressed',String(auto));
  setStatus(auto?'Auto on':'Auto off');
  if(!auto){scrollToken++;touring=false;visibleBlocks().forEach(buildBlock)}
  else if(started&&!finished)setTimeout(tour,100);
}
function setSpeed(v){
  speed=v;
  bSpeed.textContent=v+'x';
}
function toggleSound(){
  soundOn=!soundOn;
  bSound.classList.toggle('off',!soundOn);
  bSound.setAttribute('aria-pressed',String(soundOn));
  bSound.setAttribute('aria-label',soundOn?'Sound ausschalten':'Sound einschalten');
  if(soundOn){sfx.ensure();sfx.tone(660,.12,.04)}
}
function resetBuildState(){
  scrollToken++;
  touring=false;finished=false;paused=false;started=false;finaleStarted=false;
  buildDone=0;setProgress();setStatus('Ready');updatePlayIcon();
  root.classList.add('locked');root.classList.remove('instant','inked');
  stage.hidden=false;stage.style.display='';stage.style.opacity='1';
  const swarmEl=document.getElementById('swarm');if(swarmEl)swarmEl.style.display='';
  setAccent('#fff313');
  allItems.forEach(el=>{el.classList.remove('built');if(el.dataset.item==='mega')el.querySelector('text')?.style.removeProperty('stroke-dashoffset')});
  $$('.wire').forEach(w=>w.remove());
  agents.forEach((a,i)=>{a.x=innerWidth/2+(i-AGENT_COUNT/2)*4;a.y=innerHeight/2+(i%3)*6;a.mode('arrow');a.render()});
  blocks.forEach(b=>{b.built=false;b.building=false});
  const ctx=$('#swarm')?.getContext('2d');ctx?.clearRect(0,0,innerWidth,innerHeight);
  boot.classList.remove('off');scrollTo(0,0);
}
function replay(){resetBuildState();setTimeout(start,300)}
function skipBuild(reason='skip'){
  scrollToken++;
  touring=false;paused=false;started=true;finished=true;
  root.classList.remove('locked');
  root.classList.add('instant','inked');
  allItems.forEach(el=>el.classList.add('built'));
  blocks.forEach(b=>{b.built=true;b.building=false});
  buildDone=allItems.length;setProgress();
  boot.classList.add('off');
  scan.style.opacity='0';
  stage.hidden=true;
  const swarmEl=document.getElementById('swarm');if(swarmEl)swarmEl.style.display='none';
  setStatus(reason==='navigation'?'Ready':'Skipped');
  updatePlayIcon();
  clearTimeout(window.__portfolioFailsafe);window.__portfolioFailsafe=null;
}

bTour.addEventListener('click',togglePause);
bAuto.addEventListener('click',toggleAuto);
bSpeed.addEventListener('click',()=>setSpeed(speed===1?2:1));
bSound.addEventListener('click',toggleSound);
bSkip.addEventListener('click',()=>skipBuild('skip'));
bReplay.addEventListener('click',replay);
$('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{if(started&&!finished)skipBuild('navigation')}));
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&started&&!finished&&!paused){paused=true;pausedByVisibility=true;setStatus('Paused');updatePlayIcon()}
  else if(!document.hidden&&pausedByVisibility){paused=false;pausedByVisibility=false;setStatus(auto?'Auto on':'Building');updatePlayIcon();if(auto&&!touring)setTimeout(tour,120)}
});
addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||/input|textarea/i.test(e.target?.tagName))return;
  const k=e.key.toLowerCase();
  if(k===' '){e.preventDefault();togglePause()}
  else if(k==='r')replay();
  else if(k==='a')toggleAuto();
  else if(k==='m')toggleSound();
  else if(k==='s')skipBuild('skip');
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
let lastFocus;
$$('[data-case]').forEach(btn=>btn.addEventListener('click',()=>{
  const c=CASES[btn.dataset.case];if(!c)return;
  lastFocus=btn;caseKicker.textContent=c.kicker;caseTitle.textContent=c.title;
  caseGrid.innerHTML=c.blocks.map(([h,p])=>`<div><b>${h}</b><p>${p}</p></div>`).join('');
  caseDecision.innerHTML=`<b>Architecture / Product Decision</b><p>${c.decision}</p>`;
  dialog.showModal?.();requestAnimationFrame(()=>caseClose.focus());
}));
caseClose.addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
dialog.addEventListener('close',()=>lastFocus?.focus());

/* ---------- finale swarm ---------- */
const canvas=$('#swarm');
const ctx=canvas.getContext('2d');
let particles=[];
let swarmWord='ROONY';
function sizeCanvas(){
  const d=Math.min(2,devicePixelRatio||1);
  canvas.width=innerWidth*d;canvas.height=innerHeight*d;
  canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';
  ctx.setTransform(d,0,0,d,0,0);
  return d;
}
function textPoints(word,count){
  const off=document.createElement('canvas');
  off.width=Math.min(1200,innerWidth);off.height=Math.min(380,innerHeight*.42);
  const ox=off.getContext('2d',{willReadFrequently:true});
  let fs=Math.min(off.height*.72,190);
  ox.font=`900 ${fs}px Arial Narrow, Arial, sans-serif`;
  while(ox.measureText(word).width>off.width*.86&&fs>40){fs-=4;ox.font=`900 ${fs}px Arial Narrow, Arial, sans-serif`}
  ox.fillStyle='#fff';ox.textAlign='center';ox.textBaseline='middle';ox.fillText(word,off.width/2,off.height/2);
  const data=ox.getImageData(0,0,off.width,off.height).data;
  const pts=[],step=coarse?8:6;
  for(let y=0;y<off.height;y+=step)for(let x=0;x<off.width;x+=step)if(data[(y*off.width+x)*4+3]>120)pts.push([x,y]);
  for(let i=pts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pts[i],pts[j]]=[pts[j],pts[i]]}
  return Array.from({length:count},(_,i)=>pts[i%Math.max(1,pts.length)]||[off.width/2,off.height/2]).map(([x,y])=>[x+(innerWidth-off.width)/2,y+innerHeight*.28]);
}
function runFinale(){
  if(finaleStarted||reduce)return;
  finaleStarted=true;
  sizeCanvas();
  const count=coarse?170:330,targets=textPoints(swarmWord,count);
  particles=targets.map((t,i)=>({
    x:Math.random()<.5?-30:innerWidth+30,
    y:Math.random()*innerHeight,
    tx:t[0],ty:t[1],
    c:COLORS[i%COLORS.length],
    vx:0,vy:0
  }));
  const start=performance.now();
  const frame=now=>{
    if(!finaleStarted)return;
    const dt=Math.min(32,(now-(frame.last||now))/1000);frame.last=now;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    particles.forEach(p=>{
      const ax=(p.tx-p.x)*13-p.vx*6.2,ay=(p.ty-p.y)*13-p.vy*6.2;
      p.vx+=ax*dt;p.vy+=ay*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      ctx.fillStyle=p.c;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+8,p.y+4);ctx.lineTo(p.x+3,p.y+10);ctx.closePath();ctx.fill();
    });
    if(now-start<6200)requestAnimationFrame(frame);
    else{ctx.clearRect(0,0,innerWidth,innerHeight);finaleStarted=false}
  };
  requestAnimationFrame(frame);
}
addEventListener('resize',()=>{if(finaleStarted)sizeCanvas()},{passive:true});

/* ---------- reduced motion / boot ---------- */
// Safety nets: fail open rather than ever leaving the visitor on an empty screen.
setTimeout(()=>{
  if(!reduce && buildDone===0 && !finished) emergencyReveal('fallback');
},5200);
setInterval(()=>{
  if(started&&!finished&&!paused&&Date.now()-lastProgressAt>7500) emergencyReveal('stalled');
},2500);

if(reduce){
  root.classList.remove('locked');
  root.classList.add('instant','inked');
  allItems.forEach(el=>el.classList.add('built'));
  buildDone=allItems.length;setProgress();setStatus('Built');
}else{
  updatePlayIcon();
  setTimeout(()=>{if(!started)start()},560);
}
})();