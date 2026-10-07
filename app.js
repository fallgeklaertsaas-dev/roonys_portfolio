(()=>{
  'use strict';
  const $=(s,c=document)=>c.querySelector(s);
  const $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const root=document.documentElement;
  const body=document.body;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer=window.matchMedia('(pointer:fine)').matches;
  const linkedinUrl='https://www.linkedin.com/in/roony-hussein-555209369';

  /* Scroll progress + header + back-to-top */
  const progress=$('#progress');
  const header=$('#siteHeader');
  const toTop=$('#toTop');
  const onScroll=()=>{
    const max=document.documentElement.scrollHeight-window.innerHeight;
    progress.style.width=(max>0?Math.min(100,(window.scrollY/max)*100):0)+'%';
    header.classList.toggle('scrolled',window.scrollY>20);
    toTop.classList.toggle('show',window.scrollY>620);
  };
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  toTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduce?'auto':'smooth'}));

  /* Pointer glow */
  const glow=$('#pointerGlow');
  if(!reduce&&finePointer&&glow){
    window.addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';glow.style.opacity='1'},{passive:true});
    window.addEventListener('mouseout',e=>{if(!e.relatedTarget)glow.style.opacity='0'});
  }

  /* Reveal + skill bars */
  const revealEls=$$('.reveal');
  if('IntersectionObserver' in window&&!reduce){
    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');$$('.track i',entry.target).forEach(bar=>bar.style.width=bar.dataset.width||'0');io.unobserve(entry.target)}}),{threshold:.14});
    revealEls.forEach(el=>{if(!el.classList.contains('in-view'))io.observe(el)});
  }else{
    revealEls.forEach(el=>{el.classList.add('in-view');$$('.track i',el).forEach(bar=>bar.style.width=bar.dataset.width||'0')});
  }

  /* Spotlight cards */
  if(!reduce&&finePointer){$$('[data-spotlight]').forEach(card=>card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();card.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');card.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%')}));}

  /* Mobile navigation */
  const menuBtn=$('#menuBtn');
  const mobileMenu=$('#mobileMenu');
  const setMenu=open=>{mobileMenu.classList.toggle('open',open);mobileMenu.setAttribute('aria-hidden',String(!open));menuBtn.setAttribute('aria-expanded',String(open));menuBtn.setAttribute('aria-label',open?'Navigation schließen':'Navigation öffnen');menuBtn.textContent=open?'✕':'☰';body.classList.toggle('menu-open',open)};
  menuBtn.addEventListener('click',()=>setMenu(!mobileMenu.classList.contains('open')));
  $$('#mobileMenu a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobileMenu.classList.contains('open'))setMenu(false)});
  document.addEventListener('pointerdown',e=>{if(mobileMenu.classList.contains('open')&&!mobileMenu.contains(e.target)&&!menuBtn.contains(e.target))setMenu(false)});

  /* Active navigation */
  const desktopLinks=$$('.navlinks a');
  const sectionMap=desktopLinks.map(a=>({a,section:$(a.getAttribute('href'))})).filter(x=>x.section);
  if('IntersectionObserver' in window){const navIO=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){desktopLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id))}}),{rootMargin:'-36% 0px -54%',threshold:0});sectionMap.forEach(x=>navIO.observe(x.section));}

  /* Toast */
  const toast=$('#toast');let toastTimer;
  const showToast=message=>{toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2400)};

  /* Clipboard */
  const copyText=async text=>{try{await navigator.clipboard.writeText(text);showToast('Link kopiert.')}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('Link kopiert.')}};
  $('#copyLinkedIn')?.addEventListener('click',()=>copyText(linkedinUrl));
  $('#copyLinkedInContact')?.addEventListener('click',()=>copyText(linkedinUrl));

  /* Case-study dialog */
  const cases={
    autpilot:{title:'AutPilot',kicker:'Legal-Tech SaaS · Active prototype',problem:'Fall-, Dokumenten- und Kommunikationsprozesse sind über mehrere Medien verteilt. Dadurch entstehen manuelle Übertragungen, fehlender Kontext und unnötige Wiederholung.',role:'Produktkonzept, Informationsarchitektur, Full-Stack-Umsetzung und Security-/RLS-Entscheidungen.',approach:'Fallorientiertes Datenmodell, rollenbasierter Zugriff, strukturierte Dokumentenworkflows und Parser-/AI-Komponenten als unterstützende Layer statt als undurchsichtige Kernlogik.',result:'Ein belastbarer Prototyp, an dem insbesondere Auth, RLS, Credits, Storage, Parser-Services und B2B-Workflow-Design praktisch vertieft werden.',decision:'Sicherheit und Datenzugriff werden serverseitig gedacht. Automatisierung darf UI-Komfort erhöhen, aber keine Autorisierungslogik ersetzen.'},
    lifeos:{title:'Life-OS',kicker:'Productivity platform · Web',problem:'Aufgaben, Studium, Notizen, Gewohnheiten und persönliche Planung liegen oft in separaten Tools. Kontext und Prioritäten gehen beim Wechsel verloren.',role:'Product Design, Informationsarchitektur, Frontend/Backend-Implementierung und laufende UX-Iteration.',approach:'Gemeinsame Datenmodelle für Planner, Studium und Notizen; kompakte Tagesansicht; Kalender-/ICS-Integration und mobile Nutzung als zentrale Designanforderungen.',result:'Eine wachsende persönliche Plattform, an der Synchronisation, Informationsdichte, PWA-Verhalten und nutzerzentrierte Iteration praktisch getestet werden.',decision:'Nicht jede Funktion bekommt eine eigene App oder Seite. Zusammengehörige Kontexte werden bewusst verbunden, um Wechselkosten zu reduzieren.'},
    unisation:{title:'Unisation',kicker:'Native iOS · Local-first',problem:'Studienorganisation verteilt sich auf Kalender, Lernapps, Notizen und Zeittracking. Fortschritt ist häufig intransparent oder künstlich gamifiziert.',role:'Native iOS Product Design, SwiftUI-Umsetzung, lokale Datenlogik und Interaktionskonzept.',approach:'Local-first MVP mit Planner, Modulen, Deadlines, Study Timer und formelbasiertem Fortschritt. AI wird erst später ergänzt und nicht als Grundlage für transparente Berechnungen genutzt.',result:'Ein klar abgegrenztes iOS-Produktkonzept, mit dem native UX, Datenhaltung, Accessibility und motivierende Progress-Darstellung iterativ entwickelt werden.',decision:'Messbarer Fortschritt bleibt deterministisch und nachvollziehbar. AI wird dort eingesetzt, wo sie Mehrwert liefert — nicht als Ersatz für einfache, erklärbare Logik.'}
  };
  const dialog=$('#caseDialog'),dialogTitle=$('#dialogTitle'),dialogKicker=$('#dialogKicker'),dialogGrid=$('#dialogGrid'),dialogDecision=$('#dialogDecision'),dialogClose=$('#dialogClose');let lastFocus=null;
  const openCase=btn=>{const c=cases[btn.dataset.case];if(!c)return;lastFocus=btn;dialogTitle.textContent=c.title;dialogKicker.textContent=c.kicker;dialogGrid.innerHTML=`<div class="case-block"><b>Problem</b><p>${c.problem}</p></div><div class="case-block"><b>Meine Rolle</b><p>${c.role}</p></div><div class="case-block"><b>Ansatz</b><p>${c.approach}</p></div><div class="case-block"><b>Ergebnis / Lernwert</b><p>${c.result}</p></div>`;dialogDecision.innerHTML=`<b>Architecture / Product Decision</b><p>${c.decision}</p>`;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');requestAnimationFrame(()=>dialogClose.focus())};
  $$('.case-btn').forEach(btn=>btn.addEventListener('click',()=>openCase(btn)));
  const closeDialog=()=>{if(dialog.open)dialog.close();else dialog.removeAttribute('open')};dialogClose.addEventListener('click',closeDialog);dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog()});dialog.addEventListener('close',()=>lastFocus?.focus());

})();
