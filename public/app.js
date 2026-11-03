/* Pumplogg: webbapp utan byggsteg. Pratar med Supabase (databas + inloggning).
   Filen är uppdelad i: 1) räknelogik, 2) tillstånd, 3) vyer, 4) åtgärder, 5) datahämtning och inloggning. */

// ---------- 1. Räknelogik (ren, ingen databas) ----------
const DEFAULT_PL={namn:'Standard',etablering:0,timpris:0,slang:0,kubik:0,avetablering:0,tvatt:0,minTimmar:0,moms:25,ovriga:[]};
const toMin=t=>{ if(!/^\d{1,2}:\d{2}$/.test(t||''))return null; const p=t.split(':').map(Number); return p[0]*60+p[1]; };
const span=(a,b)=>{ let d=b-a; if(d<0)d+=1440; return d; };
const num=v=>{ const n=parseFloat(String(v==null?'':v).replace(/\s/g,'').replace(',','.')); return isFinite(n)?n:0; };
function calc(rep,pl){
  pl=pl||DEFAULT_PL;
  const a=toMin(rep.ankomst),s=toMin(rep.start),e=toMin(rep.slut),f=toMin(rep.avfard);
  const res={onSite:null,paid:null,billH:null,pumpMin:null,phases:null,lines:[],net:0,vat:0,gross:0,complete:false};
  if(s!=null&&e!=null)res.pumpMin=span(s,e);
  if(a!=null&&s!=null&&e!=null&&f!=null)res.phases=[span(a,s),span(s,e),span(e,f)];
  if(a==null||f==null)return res;
  const rast=Math.max(0,Number(rep.rast)||0);
  const onSite=span(a,f); res.onSite=onSite;
  const paid=Math.max(0,onSite-rast); res.paid=paid;
  const billH=Math.max(Math.ceil(paid/30)/2,Number(pl.minTimmar)||0); res.billH=billH;
  const L=[]; const add=(txt,antal,enhet,apris)=>{ if(antal>0&&apris>=0)L.push({txt:txt,antal:antal,enhet:enhet,apris:apris,belopp:Math.round(antal*apris)}); };
  add('Etablering',1,'st',Number(pl.etablering)||0);
  add('Timdebitering',billH,'tim',Number(pl.timpris)||0);
  add('Slang',Number(rep.slang)||0,'m',Number(pl.slang)||0);
  add('Kubik',Number(rep.m3)||0,'m³',Number(pl.kubik)||0);
  add('Avetablering',1,'st',Number(pl.avetablering)||0);
  if(rep.tvatt)add('Tvätt',1,'st',Number(pl.tvatt)||0);
  (pl.ovriga||[]).forEach(o=>add(o.namn||'Övrigt',Number((rep.ovriga||{})[o.id])||0,o.enhet||'st',Number(o.pris)||0));
  res.lines=L; res.net=L.reduce((x,l)=>x+l.belopp,0);
  res.vat=Math.round(res.net*(Number(pl.moms)||0)/100); res.gross=res.net+res.vat; res.complete=true;
  return res;
}
const dec=n=>String(Math.round(n*100)/100).replace('.',',');
const csvCell=v=>{ const s=String(v==null?'':v); return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
function buildCsv(kund,snap){
  const rows=[['Kund','Datum','Uppdrag','Plats','Chaufför','Rad','Antal','Enhet','À-pris','Belopp']];
  snap.rader.forEach(r=>r.lines.forEach(l=>rows.push([kund,r.datum,r.uppdrag,r.plats,r.forare,l.txt,dec(l.antal),l.enhet,dec(l.apris),l.belopp])));
  rows.push(['','','','','','Summa exkl. moms','','','',snap.net]);
  rows.push(['','','','','','Moms','','','',snap.vat]);
  rows.push(['','','','','','Att fakturera','','','',snap.gross]);
  return '﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
}
const fmtDate=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
function monthGrid(ym){
  const p=ym.split('-').map(Number); const y=p[0],m=p[1];
  const off=(new Date(y,m-1,1).getDay()+6)%7; const total=Math.ceil((off+new Date(y,m,0).getDate())/7)*7; const cells=[];
  for(let i=0;i<total;i++){ const dt=new Date(y,m-1,1-off+i); cells.push({date:fmtDate(dt),inMonth:dt.getMonth()===m-1,day:dt.getDate()}); }
  return cells;
}

(function(){
'use strict';
const root=document.getElementById('app');
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtKr=n=>new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:0}).format(n||0);
const fmtN=(n,d)=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:d==null?1:d}).format(n||0);
const fmtDur=m=>{ const h=Math.floor(m/60),mm=m%60; return h?(mm?h+' h '+mm+' min':h+' h'):mm+' min'; };
const todayStr=()=>fmtDate(new Date());
const dlabel=d=>new Date(d+'T12:00:00').toLocaleDateString('sv-SE',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,'');
const dlong=d=>{ const s=new Date(d+'T12:00:00').toLocaleDateString('sv-SE',{weekday:'long',day:'numeric',month:'long'}); return s.charAt(0).toUpperCase()+s.slice(1); };
const nowHHMM=()=>{ const n=new Date(); return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); };
const t5=s=>s?String(s).slice(0,5):'';
const orNull=v=>(v===''||v==null)?null:v;
const genCode=()=>{ const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++)s+=a[Math.floor(Math.random()*a.length)]; return s; };
const rid=()=>Math.random().toString(36).slice(2,6);
const setPath=(o,p,v)=>{ const k=p.split('.'); let c=o; for(let i=0;i<k.length-1;i++){ if(c[k[i]]==null)c[k[i]]={}; c=c[k[i]]; } c[k[k.length-1]]=v; };

const cfg=window.PUMPLOGG_CONFIG||{};
const sb=(window.supabase&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY)?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const ok=r=>{ if(r&&r.error)throw r.error; return r?r.data:null; };

// ---------- 2. Tillstånd ----------
let pending=false,tt=0;
const state={phase:'boot',session:null,me:null,
  accounts:[],lists:[],jobs:[],reports:{},approvals:{},invoices:[],requests:[],articles:{},
  au:{mode:'in',email:'',pw:'',pw2:'',err:'',msg:''},claim:'',claimName:'',claimErr:'',firstAdmin:false,
  viewAs:'',openJob:null,d:{},errs:[],expanded:{},confirm:null,busy:false,loadErr:'',
  cal:{ym:todayStr().slice(0,7),sel:todayStr()},jf:null,af:null,pe:null,peSel:'',peDirty:false,rf:null};

const ROLL={chauffor:'Chaufför',kund:'Kund',admin:'Admin'};
const ST={ej:['Ej rapporterad',''],utkast:['Utkast','warn'],inskickad:['Inskickad','acc'],godkand:['Godkänd','ok'],fakturerad:['Fakturerad','']};
const chip=st=>'<span class="chip '+ST[st][1]+'">'+ST[st][0]+'</span>';
const CST={ej:['Planerad',''],utkast:['Pågår','warn'],inskickad:['Utfört','acc'],godkand:['Klart','ok'],fakturerad:['Fakturerat','']};
const cchip=st=>'<span class="chip '+CST[st][1]+'">'+CST[st][0]+'</span>';
const cmpAsc=(a,b)=>(a.job.datum+(a.job.planerad||'')).localeCompare(b.job.datum+(b.job.planerad||''));
const cmpName=(a,b)=>String(a.namn).localeCompare(String(b.namn),'sv');

// Gör om databasrader (snake_case) till de objekt vyerna använder.
const mapAccount=r=>({id:r.id,userId:r.user_id,roll:r.roll,namn:r.namn,kontakt:r.kontakt||'',telefon:r.telefon||'',epost:r.epost||'',fordon:r.fordon||'',prislistaId:r.prislista_id,kod:''});
const mapList=r=>({id:r.id,namn:r.namn,standard:!!r.standard,etablering:r.etablering,timpris:r.timpris,slang:r.slang,kubik:r.kubik,avetablering:r.avetablering,tvatt:r.tvatt,minTimmar:r.min_timmar,moms:r.moms,ovriga:r.ovriga||[]});
const mapJob=r=>({id:r.id,datum:r.datum,planerad:t5(r.planerad),kundId:r.kund_id,forareId:r.chauffor_id,prislistaId:r.prislista_id,plats:r.plats,beskrivning:r.beskrivning||'',planM3:r.plan_m3||0,notis:r.notis||''});
const mapReport=r=>({jobId:r.job_id,forareId:r.chauffor_id,ankomst:t5(r.ankomst),start:t5(r.start),slut:t5(r.slut),avfard:t5(r.avfard),rast:r.rast_min,m3:r.m3,slang:r.slang_m,tvatt:r.tvatt,ovriga:r.ovriga||{},mottagare:r.mottagare||'',notering:r.notering||'',status:r.status});
const mapApproval=r=>({jobId:r.job_id,snap:r.snap,fakturerad:!!r.faktura_id,fakturaId:r.faktura_id});
const mapInvoice=r=>({id:r.id,nummer:r.nummer,kundId:r.kund_id,rader:r.rader,net:r.netto,vat:r.moms,gross:r.brutto,skapad:r.skapad,jobIds:(r.rader||[]).map(x=>x.jobId)});
const mapRequest=r=>({id:r.id,kundId:r.kund_id,datum:r.datum,planerad:t5(r.planerad),plats:r.plats,beskrivning:r.beskrivning||'',planM3:r.plan_m3||0,status:r.status,jobId:r.job_id,skapad:r.skapad});

function derive(){
  const acc={}; state.accounts.forEach(a=>{acc[a.id]=a;});
  const std=state.lists.find(l=>l.standard)||state.lists[0]||null;
  const plOf=(j,k)=>state.lists.find(l=>l.id===j.prislistaId)||(k&&state.lists.find(l=>l.id===k.prislistaId))||std||null;
  const rows=state.jobs.map(j=>{
    const rep=state.reports[j.id]||null, appr=state.approvals[j.id]||null;
    let st='ej';
    if(appr&&appr.fakturerad)st='fakturerad'; else if(appr&&rep)st='godkand'; else if(rep&&rep.status==='inskickad')st='inskickad'; else if(rep)st='utkast';
    const kund=acc[j.kundId]||null, drv=acc[j.forareId]||null;
    let pl=plOf(j,kund);
    if(!pl&&state.articles[j.id]){ const a=state.articles[j.id]; pl=Object.assign({},DEFAULT_PL,{minTimmar:a.min_timmar||0,tvatt:a.tvatt?1:0,ovriga:(a.ovriga||[]).map(o=>({id:o.id,namn:o.namn,enhet:o.enhet,pris:0}))}); }
    pl=pl||DEFAULT_PL;
    let c=null;
    if(rep){ c=calc(rep,pl); if(appr&&appr.snap)c=Object.assign(c,{lines:appr.snap.lines,net:appr.snap.net,vat:appr.snap.vat,gross:appr.snap.gross}); }
    return {job:j,rep:rep,appr:appr,st:st,calc:c,kund:kund,drv:drv,pl:pl};
  });
  const byId={}; rows.forEach(x=>{byId[x.job.id]=x;});
  return {acc:acc,rows:rows,byId:byId,std:std,drivers:state.accounts.filter(a=>a.roll==='chauffor').sort(cmpName),customers:state.accounts.filter(a=>a.roll==='kund').sort(cmpName)};
}
function ctx(d){
  const me=state.me; if(!me)return {role:'okand'};
  if(me.roll==='admin'){
    const a=state.viewAs&&d.acc[state.viewAs];
    if(a)return {role:a.roll==='kund'?'kund':'chauffor',acc:a,preview:true};
    return {role:'admin',acc:me};
  }
  return {role:me.roll==='kund'?'kund':'chauffor',acc:me};
}
const TABS=['kalender','uppdrag','godkann','faktura','konton','prislistor'];
function route(){ const h=(location.hash||'').slice(1); return TABS.indexOf(h)>=0?h:'kalender'; }
const momsOf=x=>(x.appr&&x.appr.snap&&x.appr.snap.moms!=null)?x.appr.snap.moms:x.pl.moms;
const kname=x=>x.kund?x.kund.namn:'Okänd kund';

// ---------- 3. Vyer ----------
function phaseBlock(c){
  if(!c||!c.phases)return '<div class="bar none" aria-hidden="true"></div><div class="legend"><span>Fyll i alla fyra tider för att se tidsfördelningen.</span></div>';
  const p=c.phases;
  return '<div class="bar" role="img" aria-label="Uppställning '+fmtDur(p[0])+', pumpning '+fmtDur(p[1])+', avslut '+fmtDur(p[2])+'">'+
    '<span class="s1" style="flex:'+(p[0]||0.01)+'"></span><span class="s2" style="flex:'+(p[1]||0.01)+'"></span><span class="s3" style="flex:'+(p[2]||0.01)+'"></span></div>'+
    '<div class="legend"><span><i class="s1"></i>Uppställning '+fmtDur(p[0])+'</span><span><i class="s2"></i>Pumpning '+fmtDur(p[1])+'</span><span><i class="s3"></i>Avslut '+fmtDur(p[2])+'</span></div>';
}
function kv(items){ return '<dl class="kv">'+items.map(i=>'<div><dt>'+i[0]+'</dt><dd>'+i[1]+'</dd></div>').join('')+'</dl>'; }
function empty(t,s,extra){ return '<div class="empty"><b>'+t+'</b>'+s+(extra?'<div style="margin-top:14px">'+extra+'</div>':'')+'</div>'; }
const BRAND='<div class="brand"><svg viewBox="0 0 36 27" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 24V15h12l6-9h12"/></svg>Pumplogg</div>';

/* --- skal --- */
function shell(c,r,body,d){
  let right='';
  if(state.me&&state.me.roll==='admin'){
    const opt=a=>'<option value="'+esc(a.id)+'"'+(state.viewAs===a.id?' selected':'')+'>'+ROLL[a.roll]+': '+esc(a.namn)+'</option>';
    right='<div class="who"><label for="viewas">Visa som</label><select id="viewas" data-act="viewas"><option value="">Admin</option>'+
      (d.drivers.length?'<optgroup label="Chaufförer">'+d.drivers.map(opt).join('')+'</optgroup>':'')+
      (d.customers.length?'<optgroup label="Kunder">'+d.customers.map(opt).join('')+'</optgroup>':'')+'</select><button type="button" class="btn sm" data-act="logout">Logga ut</button></div>';
  }else if(state.me){ right='<div class="who"><span class="you">'+esc(state.me.namn)+'</span><button type="button" class="btn sm" data-act="logout">Logga ut</button></div>'; }
  let tabs='';
  if(c.role==='admin'){
    const un=d.rows.filter(x=>!x.job.forareId&&x.job.datum>=todayStr()).length;
    const req=state.requests.filter(q=>q.status==='ny').length;
    const pend=d.rows.filter(x=>x.st==='inskickad').length, ready=d.rows.filter(x=>x.st==='godkand').length;
    const tab=(h,l,n,w)=>'<a href="#'+h+'"'+(r===h?' aria-current="page"':'')+'>'+l+(n?'<span class="n'+(w?' w':'')+'">'+n+'</span>':'')+'</a>';
    tabs='<nav class="tabs" aria-label="Admin">'+tab('kalender','Kalender',un,1)+tab('uppdrag','Uppdrag',req,1)+tab('godkann','Att godkänna',pend)+tab('faktura','Fakturaunderlag',ready)+tab('konton','Konton')+tab('prislistor','Prislistor')+'</nav>';
  }
  const prev=c.preview?'<div class="preview"><span>Du förhandsvisar som <b>'+esc(c.acc.namn)+'</b>. Det du gör sparas som den personen.</span><button type="button" class="btn sm" data-act="unview">Tillbaka till admin</button></div>':'';
  return '<div class="wrap"><header class="top">'+BRAND+right+'</header>'+prev+tabs+(state.loadErr?'<ul class="errs"><li>'+esc(state.loadErr)+'</li></ul>':'')+body+'</div>';
}

/* --- inloggning --- */
function plainShell(inner){ return '<div class="wrap"><header class="top">'+BRAND+'</header>'+inner+'</div>'; }
function viewSetup(){
  return plainShell('<div class="narrow">'+empty('Appen är inte kopplad till Supabase än','Öppna filen <b>public/config.js</b> i GitHub och fyll i SUPABASE_URL och SUPABASE_ANON_KEY från Supabase (Project Settings, API). Spara och ladda om sidan.')+'</div>');
}
function viewAuth(){
  const a=state.au; const mode=a.mode;
  const f=(k,l,type,ac)=>'<div class="field"><label for="au-'+k+'">'+l+'</label><input id="au-'+k+'" type="'+type+'" data-bind="au.'+k+'" data-enter="auth" autocomplete="'+ac+'" value="'+esc(a[k])+'"></div>';
  let form='';
  if(mode==='in')form=f('email','E-post','email','username')+f('pw','Lösenord','password','current-password')+'<div class="row-btns"><button type="button" class="btn pri" data-act="login">Logga in</button></div><button type="button" class="linkbtn" data-act="authmode" data-m="reset">Glömt lösenordet?</button>';
  else if(mode==='up')form=f('email','E-post','email','username')+f('pw','Lösenord, minst 8 tecken','password','new-password')+f('pw2','Upprepa lösenordet','password','new-password')+'<div class="row-btns"><button type="button" class="btn pri" data-act="signup">Skapa inloggning</button></div><p class="hint">Du får koppla inloggningen till ditt konto i nästa steg, med koden du fått av kontoret.</p>';
  else form=f('email','E-post','email','username')+'<div class="row-btns"><button type="button" class="btn pri" data-act="reset">Skicka länk</button></div><button type="button" class="linkbtn" data-act="authmode" data-m="in">Tillbaka till inloggning</button>';
  return plainShell('<div class="narrow"><div class="card form">'+
    (mode!=='reset'?'<div class="auth-tabs" role="group" aria-label="Inloggning"><button type="button" data-act="authmode" data-m="in" aria-pressed="'+(mode==='in')+'">Logga in</button><button type="button" data-act="authmode" data-m="up" aria-pressed="'+(mode==='up')+'">Ny användare</button></div>':'<h2 style="margin:0">Nytt lösenord</h2>')+
    form+(a.err?'<ul class="errs" role="alert"><li>'+esc(a.err)+'</li></ul>':'')+(a.msg?'<p class="ok-msg" role="status">'+esc(a.msg)+'</p>':'')+'</div></div>');
}
function viewRecover(){
  const a=state.au;
  return plainShell('<div class="narrow"><div class="card form"><h2 style="margin:0">Välj nytt lösenord</h2>'+
    '<div class="field"><label for="au-pw">Nytt lösenord, minst 8 tecken</label><input id="au-pw" type="password" data-bind="au.pw" data-enter="setpw" autocomplete="new-password" value="'+esc(a.pw)+'"></div>'+
    (a.err?'<ul class="errs" role="alert"><li>'+esc(a.err)+'</li></ul>':'')+'<div class="row-btns"><button type="button" class="btn pri" data-act="setpw">Spara lösenord</button></div></div></div>');
}
function viewClaim(){
  const em=state.session&&state.session.user?state.session.user.email:'';
  return plainShell('<div class="narrow"><h2>Koppla ditt konto</h2><p class="lead">Du är inloggad som '+esc(em)+'. Skriv in koden du fått av kontoret, så kopplas inloggningen till ditt konto. Det gör du bara en gång.</p>'+
    '<div class="card form"><div class="field"><label for="claim">Din kod</label><input id="claim" class="big-input" maxlength="8" autocomplete="off" autocapitalize="characters" data-bind="claim" data-enter="claim" value="'+esc(state.claim)+'" placeholder="ABC123"></div>'+
    (state.claimErr&&!state.firstAdmin?'<ul class="errs" role="alert"><li>'+esc(state.claimErr)+'</li></ul>':'')+
    '<div class="row-btns"><button type="button" class="btn pri" data-act="claim">Koppla konto</button><button type="button" class="btn" data-act="logout">Logga ut</button></div></div>'+
    '<div style="margin-top:22px">'+(state.firstAdmin?
      '<div class="card form"><div class="note warn">Använd bara det här om du är den som startar Pumplogg och ännu ingen admin finns.</div><div class="field"><label for="cname">Ditt namn</label><input id="cname" data-bind="claimName" data-enter="firstadmin" value="'+esc(state.claimName)+'"></div>'+
      (state.claimErr?'<ul class="errs" role="alert"><li>'+esc(state.claimErr)+'</li></ul>':'')+'<div class="row-btns"><button type="button" class="btn pri" data-act="firstadmin">Skapa adminkonto</button></div></div>':
      '<button type="button" class="linkbtn" data-act="showfirst">Första gången? Skapa adminkonto</button>')+'</div></div>');
}

/* --- chaufför --- */
function jobCard(x){
  const j=x.job;
  return '<button type="button" class="job card" data-act="open" data-id="'+esc(j.id)+'">'+
    '<span class="job-top"><span>'+dlabel(j.datum)+' <b class="num">'+esc(j.planerad||'')+'</b></span>'+chip(x.st)+'</span>'+
    '<span class="job-kund">'+esc(kname(x))+'</span>'+
    '<span class="job-sub">'+esc(j.plats)+(j.beskrivning?' · '+esc(j.beskrivning):'')+'</span>'+
    (j.planM3?'<span class="job-meta">Planerat '+fmtN(j.planM3,0)+' m³</span>':'')+'</button>';
}
function viewDriver(d,c){
  if(state.openJob)return viewReport(d,c);
  const a=c.acc; const mine=d.rows.filter(x=>x.job.forareId===a.id); const today=todayStr();
  const todo=mine.filter(x=>(x.st==='ej'&&x.job.datum<=today)||x.st==='utkast').sort(cmpAsc);
  const next=mine.filter(x=>x.st==='ej'&&x.job.datum>today).sort(cmpAsc);
  const done=mine.filter(x=>x.st==='inskickad'||x.st==='godkand'||x.st==='fakturerad').sort((p,q)=>cmpAsc(q,p)).slice(0,12);
  const sec=(t,l)=>l.length?'<h2>'+t+' <small>'+l.length+'</small></h2><div class="stack">'+l.map(jobCard).join('')+'</div>':'';
  let body='<h2>Hej '+esc(a.namn.split(' ')[0])+'</h2>'+(a.fordon?'<p class="lead">'+esc(a.fordon)+'</p>':'');
  if(!mine.length)body+=empty('Inga uppdrag ännu','Kontoret tilldelar dig uppdrag. De dyker upp här så fort de är inlagda.');
  else{ body+=todo.length?sec('Att rapportera',todo):'<div class="note">Allt är rapporterat. Bra jobbat.</div>'; body+=sec('Kommande',next)+sec('Skickade',done); }
  return '<div class="narrow">'+body+'</div>';
}
function draftRep(){ const x=state.d; const o={}; Object.keys(x.ovriga||{}).forEach(k=>{ if(num(x.ovriga[k])>0)o[k]=num(x.ovriga[k]); });
  return {ankomst:x.ankomst,start:x.start,slut:x.slut,avfard:x.avfard,rast:num(x.rast),m3:num(x.m3),slang:num(x.slang),tvatt:!!x.tvatt,ovriga:o}; }
function liveHTML(){
  const d=derive(); const x=d.byId[state.openJob]; if(!x)return '';
  const c=calc(draftRep(),x.pl); const minH=Number(x.pl.minTimmar)||0;
  const items=c.onSite==null?[['Tid på plats','–'],['Pumpad tid',c.pumpMin==null?'–':fmtDur(c.pumpMin)]]:
    [['Tid på plats',fmtDur(c.onSite)],['Rast',fmtDur(num(state.d.rast))],['Pumpad tid',c.pumpMin==null?'–':fmtDur(c.pumpMin)],['Debiteras',fmtN(c.billH,1)+' tim'+(minH&&c.billH===minH?' (minimum)':'')]];
  return '<div class="lbl">Tidsfördelning</div>'+phaseBlock(c)+kv(items);
}
function updateLive(){ const el=$('live'); if(el)el.innerHTML=liveHTML(); }
function setErrs(){ const el=$('errs'); if(el)el.innerHTML=state.errs.map(e=>'<li>'+esc(e)+'</li>').join(''); }
function viewReport(d,c){
  const x=d.byId[state.openJob]; if(!x){state.openJob=null;return viewDriver(d,c);}
  const j=x.job; const locked=x.st==='godkand'||x.st==='fakturerad'; const dis=locked?' disabled':''; const dd=state.d;
  const tf=(k,l)=>'<div class="field"><label for="f-'+k+'">'+l+'</label><div class="tf"><input id="f-'+k+'" type="time" data-bind="d.'+k+'" value="'+esc(dd[k])+'"'+dis+'>'+(locked?'':'<button type="button" class="btn now" data-act="now" data-field="'+k+'">Nu</button>')+'</div></div>';
  const rastChips=locked?'':'<div class="chips">'+[0,15,30,45,60].map(v=>'<button type="button" class="btn" data-act="rast" data-v="'+v+'">'+v+'</button>').join('')+'</div>';
  const btns=locked?'':(x.st==='inskickad'?'<button type="button" class="btn pri" data-act="save" data-submit="1">Uppdatera rapport</button>':
    '<button type="button" class="btn" data-act="save" data-submit="0">Spara utkast</button><button type="button" class="btn pri" data-act="save" data-submit="1">Skicka in</button>');
  const ov=(x.pl.ovriga||[]).map(o=>'<div class="field"><label for="f-o-'+esc(o.id)+'">'+esc(o.namn)+', '+esc(o.enhet)+'</label><input id="f-o-'+esc(o.id)+'" class="num" inputmode="decimal" data-bind="d.ovriga.'+esc(o.id)+'" value="'+esc((dd.ovriga||{})[o.id]||'')+'" placeholder="0"'+dis+'></div>').join('');
  return '<div class="narrow form" id="form"><button type="button" class="back" data-act="back">← Mina uppdrag</button>'+
    '<div class="card jobhead"><div class="job-top"><span>'+dlabel(j.datum)+' <b class="num">'+esc(j.planerad||'')+'</b></span>'+chip(x.st)+'</div>'+
    '<div class="job-kund">'+esc(kname(x))+'</div><div class="job-sub">'+esc(j.plats)+'</div>'+
    '<div class="job-meta">'+(j.beskrivning?esc(j.beskrivning):'')+(j.planM3?(j.beskrivning?' · ':'')+'planerat '+fmtN(j.planM3,0)+' m³':'')+'</div>'+
    (j.notis?'<div class="note" style="margin-top:10px"><b>Från kontoret:</b> '+esc(j.notis)+'</div>':'')+'</div>'+
    (locked?'<div class="note">Rapporten är godkänd av kontoret och kan inte ändras här.</div>':'')+
    '<div class="g2">'+tf('ankomst','Ankomst plats')+tf('start','Start pumpning')+tf('slut','Slut pumpning')+tf('avfard','Avfärd')+'</div>'+
    '<div class="g2"><div class="field"><label for="f-rast">Rast, minuter</label><input id="f-rast" class="num" inputmode="numeric" data-bind="d.rast" value="'+esc(dd.rast)+'"'+dis+'>'+rastChips+'</div>'+
    '<div class="field"><label for="f-m3">Kubik, m³</label><input id="f-m3" class="num" inputmode="decimal" data-bind="d.m3" placeholder="'+(j.planM3?esc(j.planM3):'0')+'" value="'+esc(dd.m3)+'"'+dis+'></div></div>'+
    '<div class="g2"><div class="field"><label for="f-slang">Slang, meter</label><input id="f-slang" class="num" inputmode="decimal" data-bind="d.slang" value="'+esc(dd.slang)+'"'+dis+'></div>'+
    '<div class="field"><div class="lbl">Tvätt</div><label class="chk"><input type="checkbox" data-bind="d.tvatt"'+(dd.tvatt?' checked':'')+dis+'>Pumpen tvättad</label></div></div>'+
    (ov?'<div class="g2">'+ov+'</div>':'')+
    '<div class="field"><label for="f-mott">Mottagare på plats</label><input id="f-mott" data-bind="d.mottagare" placeholder="Namn på den som kvitterar" value="'+esc(dd.mottagare)+'"'+dis+'></div>'+
    '<div class="field"><label for="f-not">Anteckning</label><textarea id="f-not" data-bind="d.notering" placeholder="Väntetid, haveri, ändrad plats, annat kontoret behöver veta"'+dis+'>'+esc(dd.notering)+'</textarea></div>'+
    '<div class="card" id="live">'+liveHTML()+'</div>'+
    '<ul class="errs" id="errs" role="alert">'+state.errs.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>'+
    (btns?'<div class="row-btns">'+btns+'</div>':'')+'</div>';
}
function initDraft(x){
  const r=x.rep||{};
  state.d={ankomst:r.ankomst||'',start:r.start||'',slut:r.slut||'',avfard:r.avfard||'',rast:r.rast!=null?String(r.rast):'0',
    m3:r.m3?String(r.m3).replace('.',','):'',slang:r.slang!=null?String(r.slang):'0',tvatt:!!r.tvatt,
    ovriga:Object.keys(r.ovriga||{}).reduce((o,k)=>{o[k]=String(r.ovriga[k]).replace('.',',');return o;},{}),mottagare:r.mottagare||'',notering:r.notering||''};
  state.errs=[];
}
function validate(x){
  const er=[]; const T=[['ankomst','Ankomst plats'],['start','Start pumpning'],['slut','Slut pumpning'],['avfard','Avfärd']];
  T.forEach(t=>{ if(toMin(x[t[0]])==null)er.push(t[1]+': fyll i klockslag.'); });
  if(!er.length){
    const a=toMin(x.ankomst),s=toMin(x.start),e=toMin(x.slut),f=toMin(x.avfard);
    if(span(a,s)+span(s,e)+span(e,f)!==span(a,f))er.push('Tiderna ligger inte i ordning. Kontrollera ankomst, start, slut och avfärd.');
    else if(num(x.rast)>=span(a,f))er.push('Rasten är längre än tiden på plats.');
  }
  if(!(num(x.m3)>0))er.push('Kubik: fyll i antal kubikmeter.');
  return er;
}

/* --- kund --- */
function newReq(){ return {datum:todayStr(),planerad:'07:00',plats:'',beskrivning:'',planM3:''}; }
function specTable(lines,net,vat,gross,moms){
  return '<div class="scroll"><table class="tbl"><thead><tr><th>Rad</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Belopp</th></tr></thead><tbody>'+
    lines.map(l=>'<tr><td>'+esc(l.txt)+'</td><td class="r">'+fmtN(l.antal,2)+' '+esc(l.enhet)+'</td><td class="r">'+fmtKr(l.apris)+'</td><td class="r">'+fmtKr(l.belopp)+'</td></tr>').join('')+
    '<tr class="tot"><td colspan="3" class="r">Exkl. moms</td><td class="r">'+fmtKr(net)+'</td></tr><tr class="tot"><td colspan="3" class="r">Moms '+moms+' %</td><td class="r">'+fmtKr(vat)+'</td></tr>'+
    '<tr class="tot big"><td colspan="3" class="r">Totalt</td><td class="r">'+fmtKr(gross)+'</td></tr></tbody></table></div>';
}
function viewCustomer(d,c){
  const a=c.acc; const mine=d.rows.filter(x=>x.job.kundId===a.id);
  if(!state.rf)state.rf=newReq(); const f=state.rf;
  const open=mine.filter(x=>x.st==='ej'||x.st==='utkast').sort(cmpAsc);
  const done=mine.filter(x=>!(x.st==='ej'||x.st==='utkast')).sort((p,q)=>cmpAsc(q,p));
  const reqs=state.requests.filter(q=>q.kundId===a.id&&q.status!=='bokad').sort((p,q)=>String(q.skapad).localeCompare(String(p.skapad)));
  const jobRow=x=>{ const j=x.job;
    return '<div class="card"><div class="acc-row"><div><div class="job-top" style="margin-bottom:4px"><span>'+dlabel(j.datum)+' <b class="num">'+esc(j.planerad||'')+'</b></span></div><div class="rc-kund">'+esc(j.beskrivning||'Pumpuppdrag')+'</div><div class="rc-sub">'+esc(j.plats)+'</div>'+
      '<div class="job-meta">'+(x.drv?'Chaufför: '+esc(x.drv.namn)+(x.drv.fordon?' · '+esc(x.drv.fordon):''):'Chaufför tilldelas snart')+'</div></div>'+cchip(x.st)+'</div>'+
      ((x.st==='godkand'||x.st==='fakturerad')&&x.calc?'<div class="rc-sum"><span>Belopp exkl. moms</span><b>'+fmtKr(x.calc.net)+'</b></div><div class="rc-act"><button type="button" class="btn sm" data-act="toggle" data-id="'+esc(j.id)+'" aria-expanded="'+!!state.expanded[j.id]+'">'+(state.expanded[j.id]?'Dölj specifikation':'Visa specifikation')+'</button></div>'+
        (state.expanded[j.id]?'<div class="detail">'+kv([['Pumpat',fmtN(x.rep.m3,1)+' m³'],['Tid på plats',x.calc.onSite!=null?fmtDur(x.calc.onSite):'–']])+specTable(x.calc.lines,x.calc.net,x.calc.vat,x.calc.gross,momsOf(x))+'</div>':''):'')+'</div>'; };
  const form='<div class="card form"><div class="g2"><div class="field"><label for="r-datum">Önskat datum</label><input id="r-datum" type="date" data-bind="rf.datum" value="'+esc(f.datum)+'"></div><div class="field"><label for="r-tid">Önskad starttid</label><input id="r-tid" type="time" data-bind="rf.planerad" value="'+esc(f.planerad)+'"></div></div>'+
    '<div class="field"><label for="r-plats">Plats</label><input id="r-plats" data-bind="rf.plats" placeholder="Adress, ort" value="'+esc(f.plats)+'"></div>'+
    '<div class="g2"><div class="field"><label for="r-besk">Vad ska gjutas</label><input id="r-besk" data-bind="rf.beskrivning" placeholder="Platta, bjälklag, väggar" value="'+esc(f.beskrivning)+'"></div><div class="field"><label for="r-m3">Ungefärlig mängd, m³</label><input id="r-m3" class="num" inputmode="decimal" data-bind="rf.planM3" value="'+esc(f.planM3)+'"></div></div>'+
    '<div class="row-btns"><button type="button" class="btn pri" data-act="reqsend">Skicka förfrågan</button></div></div>';
  return '<div class="narrow"><h2>'+esc(a.namn)+'</h2><p class="lead">Här ser du dina pumpuppdrag, vem som kommer och vad som ska faktureras.</p>'+
    '<h2>Begär pump</h2>'+form+
    (reqs.length?'<h2>Förfrågningar <small>'+reqs.length+'</small></h2><div class="stack">'+reqs.map(q=>'<div class="card acc-row"><div><b>'+dlabel(q.datum)+' '+esc(q.planerad||'')+'</b><div class="job-meta">'+esc(q.plats)+(q.beskrivning?' · '+esc(q.beskrivning):'')+'</div></div><span class="chip '+(q.status==='avvisad'?'bad':'warn')+'">'+(q.status==='avvisad'?'Kan inte tas':'Skickad')+'</span></div>').join('')+'</div>':'')+
    '<h2>Bokade uppdrag <small>'+open.length+'</small></h2>'+(open.length?'<div class="stack">'+open.map(jobRow).join('')+'</div>':empty('Inga bokade uppdrag','Skicka en förfrågan ovan så bokar kontoret in en pump.'))+
    (done.length?'<h2>Utförda <small>'+done.length+'</small></h2><div class="stack">'+done.map(jobRow).join('')+'</div>':'')+'</div>';
}

/* --- admin: kalender --- */
function viewCalendar(d){
  const cal=state.cal; const cells=monthGrid(cal.ym); const today=todayStr();
  const byDate={}; d.rows.forEach(x=>{(byDate[x.job.datum]=byDate[x.job.datum]||[]).push(x);});
  Object.keys(byDate).forEach(k=>byDate[k].sort(cmpAsc));
  const p=cal.ym.split('-').map(Number);
  const label=new Date(p[0],p[1]-1,1).toLocaleDateString('sv-SE',{month:'long',year:'numeric'});
  const un=d.rows.filter(x=>!x.job.forareId&&x.job.datum>=today).length;
  const head='<div class="calhead"><button type="button" class="btn sm" data-act="calprev" aria-label="Föregående månad">←</button><div class="mname">'+esc(label)+'</div><button type="button" class="btn sm" data-act="calnext" aria-label="Nästa månad">→</button><button type="button" class="btn sm" data-act="caltoday">Idag</button></div>';
  const dows=['Mån','Tis','Ons','Tors','Fre','Lör','Sön'].map(s=>'<div class="dow">'+s+'</div>').join('');
  const grid=cells.map(ce=>{
    const l=byDate[ce.date]||[];
    const chips=l.slice(0,3).map(x=>'<span class="dc'+(x.job.forareId?'':' un')+'" title="'+esc(kname(x)+' · '+(x.drv?x.drv.namn:'Ej tilldelad'))+'"><b>'+esc(x.job.planerad||'')+'</b> '+esc(kname(x))+'</span>').join('');
    return '<button type="button" class="day'+(ce.inMonth?'':' out')+(ce.date===today?' today':'')+(ce.date===cal.sel?' sel':'')+'" data-act="seld" data-d="'+ce.date+'" aria-label="'+esc(dlong(ce.date))+', '+l.length+' uppdrag"><span class="dn">'+ce.day+'</span>'+chips+
      (l.length>3?'<span class="more">+'+(l.length-3)+' till</span>':'')+(l.length?'<span class="dots">'+l.slice(0,5).map(x=>'<i'+(x.job.forareId?'':' class="un"')+'></i>').join('')+'</span>':'')+'</button>';
  }).join('');
  const sel=byDate[cal.sel]||[];
  const dayRows=sel.map(x=>{
    const j=x.job;
    return '<div class="card jrow"><div class="jt">'+esc(j.planerad||'–')+'</div><div style="min-width:0"><div class="rc-kund">'+esc(kname(x))+'</div><div class="rc-sub">'+esc(j.plats)+(j.beskrivning?' · '+esc(j.beskrivning):'')+(j.planM3?' · '+fmtN(j.planM3,0)+' m³':'')+'</div></div>'+
      '<div class="jc"><label class="lbl" for="a-'+esc(j.id)+'">Chaufför</label><select id="a-'+esc(j.id)+'" data-act="assign" data-id="'+esc(j.id)+'"><option value="">Ej tilldelad</option>'+d.drivers.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===j.forareId?' selected':'')+'>'+esc(a.namn)+'</option>').join('')+'</select></div>'+
      '<div class="jb">'+chip(x.st)+'<button type="button" class="btn sm" data-act="jobedit" data-id="'+esc(j.id)+'">Ändra</button></div></div>';
  }).join('');
  const sd=new Date(cal.sel+'T12:00:00');
  return '<h2>Kalender'+(un?' <small>'+un+' kommande uppdrag saknar chaufför</small>':'')+'</h2>'+head+'<div class="cal" role="group" aria-label="Månadskalender">'+dows+grid+'</div>'+
    '<h2>'+esc(dlong(cal.sel))+' <small>'+sel.length+' uppdrag</small></h2>'+
    (sel.length?'<div class="stack">'+dayRows+'</div>':empty('Inga uppdrag den här dagen','Lägg till ett uppdrag så syns det i kalendern.'))+
    '<div style="margin-top:14px"><button type="button" class="btn pri" data-act="jobnew" data-d="'+cal.sel+'">Nytt uppdrag den '+sd.getDate()+'/'+(sd.getMonth()+1)+'</button></div>';
}

/* --- admin: uppdrag --- */
function newJob(date){ return {id:null,requestId:null,datum:date||todayStr(),planerad:'07:00',kundId:'',plats:'',beskrivning:'',forareId:'',prislistaId:'',planM3:'',notis:''}; }
function viewJobs(d){
  if(!state.jf)state.jf=newJob(); const f=state.jf;
  const reqs=state.requests.filter(q=>q.status==='ny').sort((a,b)=>String(a.skapad).localeCompare(String(b.skapad)));
  const reqHtml=reqs.length?'<h2>Förfrågningar från kunder <small>'+reqs.length+'</small></h2><div class="stack">'+reqs.map(q=>{ const k=d.acc[q.kundId];
    return '<div class="card acc-row"><div><b>'+esc(k?k.namn:'Okänd kund')+'</b><div class="job-meta">'+dlabel(q.datum)+' '+esc(q.planerad||'')+' · '+esc(q.plats)+(q.beskrivning?' · '+esc(q.beskrivning):'')+(q.planM3?' · ca '+fmtN(q.planM3,0)+' m³':'')+'</div></div>'+
      '<div class="row-btns"><button type="button" class="btn sm pri" data-act="reqbook" data-id="'+esc(q.id)+'">Skapa uppdrag</button><button type="button" class="btn sm" data-act="reqno" data-id="'+esc(q.id)+'">Avvisa</button></div></div>'; }).join('')+'</div>':'';
  const form='<div class="card form"><div class="g3">'+
    '<div class="field"><label for="j-datum">Datum</label><input id="j-datum" type="date" data-bind="jf.datum" value="'+esc(f.datum)+'"></div>'+
    '<div class="field"><label for="j-tid">Planerad start</label><input id="j-tid" type="time" data-bind="jf.planerad" value="'+esc(f.planerad)+'"></div>'+
    '<div class="field"><label for="j-m3">Planerad mängd, m³</label><input id="j-m3" class="num" inputmode="decimal" data-bind="jf.planM3" value="'+esc(f.planM3)+'"></div></div>'+
    '<div class="g2"><div class="field"><label for="j-kund">Kund</label><select id="j-kund" data-bind="jf.kundId"><option value="">Välj kund</option>'+d.customers.map(k=>'<option value="'+esc(k.id)+'"'+(k.id===f.kundId?' selected':'')+'>'+esc(k.namn)+'</option>').join('')+'</select>'+(d.customers.length?'':'<div class="hint">Lägg först upp en kund under Konton.</div>')+'</div>'+
    '<div class="field"><label for="j-plats">Plats</label><input id="j-plats" data-bind="jf.plats" placeholder="Adress, ort" value="'+esc(f.plats)+'"></div></div>'+
    '<div class="field"><label for="j-besk">Vad ska gjutas</label><input id="j-besk" data-bind="jf.beskrivning" placeholder="Till exempel platta på mark, bjälklag plan 2" value="'+esc(f.beskrivning)+'"></div>'+
    '<div class="g2"><div class="field"><label for="j-forare">Chaufför</label><select id="j-forare" data-bind="jf.forareId"><option value="">Ej tilldelad</option>'+d.drivers.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===f.forareId?' selected':'')+'>'+esc(a.namn)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="j-pl">Prislista</label><select id="j-pl" data-bind="jf.prislistaId"><option value="">Kundens prislista</option>'+state.lists.slice().sort(cmpName).map(l=>'<option value="'+esc(l.id)+'"'+(l.id===f.prislistaId?' selected':'')+'>'+esc(l.namn)+'</option>').join('')+'</select></div></div>'+
    '<div class="field"><label for="j-notis">Meddelande till chauffören</label><input id="j-notis" data-bind="jf.notis" placeholder="Portkod, kontaktperson, svår åtkomst" value="'+esc(f.notis)+'"></div>'+
    '<div class="row-btns"><button type="button" class="btn pri" data-act="jobsave">'+(f.id?'Spara ändringar':'Lägg till uppdrag')+'</button>'+(f.id?'<button type="button" class="btn" data-act="jobnew">Avbryt</button>':'')+'</div></div>';
  const list=d.rows.slice().sort((a,b)=>cmpAsc(b,a));
  const items=list.length?'<div class="stack">'+list.map(x=>
    '<div class="card inv"><div><b>'+esc(kname(x))+'</b><div class="job-meta">'+dlabel(x.job.datum)+' '+esc(x.job.planerad||'')+' · '+esc(x.job.plats)+' · '+(x.drv?esc(x.drv.namn):'<span style="color:var(--warn);font-weight:600">Ej tilldelad</span>')+'</div></div>'+
    '<div class="row-btns" style="align-items:center">'+chip(x.st)+'<button type="button" class="btn sm" data-act="jobedit" data-id="'+esc(x.job.id)+'">Ändra</button>'+
    (x.st==='ej'?(state.confirm==='del:'+x.job.id?'<button type="button" class="btn sm bad" data-act="jobdelok" data-id="'+esc(x.job.id)+'">Ta bort</button><button type="button" class="btn sm" data-act="cancel">Behåll</button>':'<button type="button" class="btn sm" data-act="jobdel" data-id="'+esc(x.job.id)+'">Ta bort</button>'):'')+'</div></div>').join('')+'</div>':
    empty('Inga uppdrag ännu','Lägg upp det första uppdraget ovan.');
  return reqHtml+'<h2 id="jobform">'+(f.id?'Ändra uppdrag':'Nytt uppdrag')+'</h2>'+form+'<h2>Alla uppdrag <small>'+list.length+'</small></h2>'+items;
}

/* --- admin: godkänna och faktura --- */
function reportCard(x){
  const j=x.job,r=x.rep,c=x.calc,open=!!state.expanded[j.id];
  const detail=open?'<div class="detail">'+kv([['Ankomst',esc(r.ankomst)],['Start',esc(r.start)],['Slut',esc(r.slut)],['Avfärd',esc(r.avfard)],['Rast',esc(r.rast||0)+' min']])+
    '<div><div class="lbl">Mottagare på plats</div>'+(r.mottagare?esc(r.mottagare):'<span style="color:var(--ink-2)">Ej angiven</span>')+'</div>'+
    (r.notering?'<div><div class="lbl">Anteckning</div>'+esc(r.notering)+'</div>':'')+
    '<div class="hint">Prislista: '+esc(x.pl.namn)+'</div>'+specTable(c.lines,c.net,c.vat,c.gross,x.pl.moms)+'</div>':'';
  return '<article class="card rc"><header><div><div class="rc-kund">'+esc(kname(x))+'</div><div class="rc-sub">'+esc(j.plats)+(j.beskrivning?' · '+esc(j.beskrivning):'')+'</div></div>'+chip(x.st)+'</header>'+
    '<div class="rc-meta">'+dlabel(j.datum)+' · '+(x.drv?esc(x.drv.namn):'Okänd chaufför')+'</div>'+phaseBlock(c)+
    kv([['Debiteras',c.complete?fmtN(c.billH,1)+' tim':'–'],['Kubik',fmtN(r.m3,1)+' m³'],['Slang',fmtN(r.slang||0,0)+' m']])+
    '<div class="rc-sum"><span>Exkl. moms</span><b>'+fmtKr(c.net)+'</b></div>'+
    '<div class="rc-act"><button type="button" class="btn sm" data-act="toggle" data-id="'+esc(j.id)+'" aria-expanded="'+open+'">'+(open?'Dölj detaljer':'Granska')+'</button>'+
    (x.st==='inskickad'?'<button type="button" class="btn sm pri" data-act="approve" data-id="'+esc(j.id)+'">Godkänn</button>':'')+'</div>'+detail+'</article>';
}
function viewApprove(d){
  const list=d.rows.filter(x=>x.st==='inskickad').sort(cmpAsc);
  if(!list.length)return empty('Inget väntar på godkännande','Tidrapporter som chaufförerna skickar in dyker upp här. Godkända rapporter går vidare till fakturaunderlaget.');
  return '<h2>Att godkänna <small>'+list.length+'</small></h2><p class="lead">Granska tider och mängder. Beloppen räknas från kundens prislista och låses när du godkänner.</p>'+
    (list.length>1?'<div class="row-btns" style="margin-bottom:14px"><button type="button" class="btn" data-act="approveall">Godkänn alla ('+list.length+')</button></div>':'')+
    '<div class="cards">'+list.map(reportCard).join('')+'</div>';
}
function snapFor(list){
  const rader=list.map(x=>({jobId:x.job.id,datum:x.job.datum,uppdrag:x.job.beskrivning||'',plats:x.job.plats||'',forare:x.drv?x.drv.namn:'',lines:x.calc.lines}));
  const net=list.reduce((s,x)=>s+x.calc.net,0), vat=list.reduce((s,x)=>s+x.calc.vat,0);
  return {rader:rader,net:net,vat:vat,gross:net+vat};
}
function snapTable(snap){
  return '<div class="scroll"><table class="tbl"><thead><tr><th>Rad</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Belopp</th></tr></thead><tbody>'+
    snap.rader.map(r=>'<tr class="grp"><td colspan="4">'+dlabel(r.datum)+' · '+esc(r.uppdrag||r.plats)+' <span style="font-weight:400;color:var(--ink-2)">· '+esc(r.plats)+' · '+esc(r.forare)+'</span></td></tr>'+
      r.lines.map(l=>'<tr><td>'+esc(l.txt)+'</td><td class="r">'+fmtN(l.antal,2)+' '+esc(l.enhet)+'</td><td class="r">'+fmtKr(l.apris)+'</td><td class="r">'+fmtKr(l.belopp)+'</td></tr>').join('')).join('')+
    '<tr class="tot"><td colspan="3" class="r">Summa exkl. moms</td><td class="r">'+fmtKr(snap.net)+'</td></tr>'+
    '<tr class="tot"><td colspan="3" class="r">Moms</td><td class="r">'+fmtKr(snap.vat)+'</td></tr>'+
    '<tr class="tot big"><td colspan="3" class="r">Att fakturera</td><td class="r">'+fmtKr(snap.gross)+'</td></tr></tbody></table></div>';
}
function nextNumber(){
  const y=new Date().getFullYear(); let m=0;
  state.invoices.forEach(i=>{ const mm=/^U-(\d{4})-(\d+)$/.exec(i.nummer||''); if(mm&&Number(mm[1])===y)m=Math.max(m,Number(mm[2])); });
  return 'U-'+y+'-'+String(m+1).padStart(3,'0');
}
function viewInvoice(d){
  const ready=d.rows.filter(x=>x.st==='godkand').sort(cmpAsc);
  const groups={}; ready.forEach(x=>{(groups[x.job.kundId]=groups[x.job.kundId]||[]).push(x);});
  const ids=Object.keys(groups).sort((a,b)=>String((d.acc[a]||{}).namn).localeCompare(String((d.acc[b]||{}).namn),'sv'));
  let out='<h2>Fakturaunderlag</h2><p class="lead">Godkända tidrapporter grupperade per kund. Ladda ner raderna för ert faktureringssystem, markera sedan underlaget som fakturerat.</p>';
  if(!ids.length)out+=empty('Inget att fakturera just nu','Godkända tidrapporter hamnar här, en sektion per kund.',d.rows.some(x=>x.st==='inskickad')?'<a class="btn" href="#godkann">Gå till Att godkänna</a>':'');
  out+='<div class="stack">'+ids.map(k=>{
    const list=groups[k]; const snap=snapFor(list); const nm=d.acc[k]?d.acc[k].namn:'Okänd kund';
    return '<section class="card"><div class="cust-head"><div><div class="job-kund">'+esc(nm)+'</div><div class="job-meta">'+list.length+' tidrapport'+(list.length>1?'er':'')+'</div></div>'+
      '<div class="row-btns"><button type="button" class="btn sm" data-act="csv" data-kund="'+esc(k)+'">Ladda ner CSV</button>'+
      '<button type="button" class="btn sm pri" data-act="invoice" data-kund="'+esc(k)+'">Markera som fakturerat</button></div></div>'+
      snapTable(snap)+
      (state.confirm==='inv:'+k?'<div class="confirm"><span>Skapa underlag <b class="num">'+nextNumber()+'</b> på '+fmtKr(snap.gross)+' inkl. moms? Rapporterna räknas då som fakturerade.</span><button type="button" class="btn sm pri" data-act="invoiceok" data-kund="'+esc(k)+'">Skapa underlag</button><button type="button" class="btn sm" data-act="cancel">Avbryt</button></div>':'')+
      '<div class="rc-act">'+list.map(x=>'<button type="button" class="btn sm" data-act="unapprove" data-id="'+esc(x.job.id)+'">Återta godkännande '+dlabel(x.job.datum)+'</button>').join('')+'</div></section>';
  }).join('')+'</div>';
  const invs=state.invoices.slice().sort((a,b)=>String(b.skapad).localeCompare(String(a.skapad)));
  if(invs.length)out+='<h2>Tidigare underlag <small>'+invs.length+'</small></h2><div class="invs">'+invs.map(i=>
    '<div class="card inv"><div><b class="num">'+esc(i.nummer)+'</b> · '+esc((d.acc[i.kundId]||{}).namn||'')+'<div class="job-meta">'+new Date(i.skapad).toLocaleDateString('sv-SE')+' · '+i.jobIds.length+' uppdrag</div></div>'+
    '<div class="row-btns" style="align-items:center"><b class="num">'+fmtKr(i.gross)+'</b><button type="button" class="btn sm" data-act="csvinv" data-id="'+esc(i.id)+'">CSV</button></div></div>').join('')+'</div>';
  return out;
}

/* --- admin: konton --- */
function newAcc(roll){ return {id:null,roll:roll||'chauffor',namn:'',kontakt:'',telefon:'',epost:'',fordon:'',prislistaId:''}; }
function viewAccounts(d){
  if(!state.af)state.af=newAcc(); const f=state.af;
  const field=(k,l,ph,type)=>'<div class="field"><label for="a-'+k+'">'+l+'</label><input id="a-'+k+'" '+(type?'type="'+type+'" ':'')+'data-bind="af.'+k+'" placeholder="'+(ph||'')+'" value="'+esc(f[k])+'"></div>';
  let fields=field('namn',f.roll==='kund'?'Företagsnamn':'Namn','');
  if(f.roll==='kund')fields+='<div class="g2">'+field('kontakt','Kontaktperson','')+field('telefon','Telefon','','tel')+'</div>'+field('epost','E-post','','email')+
    '<div class="field"><label for="a-pl">Prislista</label><select id="a-pl" data-bind="af.prislistaId"><option value="">Standardlistan</option>'+state.lists.slice().sort(cmpName).map(l=>'<option value="'+esc(l.id)+'"'+(l.id===f.prislistaId?' selected':'')+'>'+esc(l.namn)+'</option>').join('')+'</select></div>';
  else if(f.roll==='chauffor')fields+='<div class="g2">'+field('telefon','Telefon','','tel')+field('fordon','Pump och registreringsnummer','Pumpbil 36 m, ABC 123')+'</div>'+field('epost','E-post','','email');
  else fields+='<div class="g2">'+field('epost','E-post','','email')+field('telefon','Telefon','','tel')+'</div><div class="note">Ett adminkonto kan se och ändra allt. Skapa bara sådana åt personer du litar fullt på.</div>';
  const form='<div class="card form"><div class="field"><label for="a-roll">Kontotyp</label><select id="a-roll" data-bind="af.roll" data-rerender="1"><option value="chauffor"'+(f.roll==='chauffor'?' selected':'')+'>Chaufför</option><option value="kund"'+(f.roll==='kund'?' selected':'')+'>Kund</option><option value="admin"'+(f.roll==='admin'?' selected':'')+'>Admin</option></select></div>'+fields+
    '<div class="row-btns"><button type="button" class="btn pri" data-act="accsave">'+(f.id?'Spara ändringar':'Skapa konto')+'</button>'+(f.id?'<button type="button" class="btn" data-act="accnew">Avbryt</button>':'')+'</div></div>';
  const card=a=>{ const pl=a.roll==='kund'?state.lists.find(l=>l.id===a.prislistaId):null;
    return '<div class="card"><div class="acc-row"><div><div class="rc-kund">'+esc(a.namn)+'</div><div class="job-meta">'+[a.kontakt,a.telefon,a.epost,a.fordon].filter(Boolean).map(esc).join(' · ')+(a.roll==='kund'?(a.kontakt||a.telefon||a.epost?' · ':'')+'Prislista: '+esc(pl?pl.namn:'Standard'):'')+'</div></div>'+
      '<span class="chip '+(a.userId?'ok':'warn')+'">'+(a.userId?'Inloggning kopplad':'Ej kopplad')+'</span></div>'+
      (a.userId?'':'<div class="rc-sum"><span>Kod att skicka till personen</span><span class="code">'+esc(a.kod||'–')+'</span></div>')+
      '<div class="rc-act">'+(a.userId?'':'<button type="button" class="btn sm" data-act="copy" data-v="'+esc(a.kod||'')+'">Kopiera kod</button>')+'<button type="button" class="btn sm" data-act="accedit" data-id="'+esc(a.id)+'">Ändra</button><button type="button" class="btn sm" data-act="accrecode" data-id="'+esc(a.id)+'">'+(a.userId?'Koppla bort inloggning':'Ny kod')+'</button>'+
      (state.confirm==='acc:'+a.id?'<button type="button" class="btn sm bad" data-act="accdelok" data-id="'+esc(a.id)+'">Ta bort konto</button><button type="button" class="btn sm" data-act="cancel">Behåll</button>':'<button type="button" class="btn sm" data-act="accdel" data-id="'+esc(a.id)+'">Ta bort</button>')+'</div></div>'; };
  const group=(roll,t)=>{ const l=state.accounts.filter(a=>a.roll===roll).sort(cmpName); return l.length?'<h2>'+t+' <small>'+l.length+'</small></h2><div class="cards">'+l.map(card).join('')+'</div>':''; };
  return '<h2>'+(f.id?'Ändra konto':'Nytt konto')+'</h2>'+form+group('chauffor','Chaufförer')+group('kund','Kunder')+group('admin','Admin')+
    (state.accounts.length?'':'<div style="margin-top:18px">'+empty('Inga konton ännu','Skapa chaufförer och kunder ovan. Varje konto får en kod som personen anger första gången den loggar in.')+'</div>');
}

/* --- admin: prislistor --- */
function blankList(){ return {id:null,namn:'',standard:false,etablering:'',timpris:'',slang:'',kubik:'',avetablering:'',tvatt:'',minTimmar:'0',moms:'25',ovriga:[]}; }
function listToDraft(l){ return {id:l.id,namn:l.namn,standard:!!l.standard,etablering:String(l.etablering),timpris:String(l.timpris),slang:String(l.slang),kubik:String(l.kubik),avetablering:String(l.avetablering),tvatt:String(l.tvatt),minTimmar:String(l.minTimmar||0),moms:String(l.moms),
  ovriga:(l.ovriga||[]).map(o=>({id:o.id,namn:o.namn,pris:String(o.pris),enhet:o.enhet||'st'}))}; }
function viewLists(){
  if(!state.pe){ const l=state.lists.find(x=>x.id===state.peSel)||state.lists.find(x=>x.standard)||state.lists[0]; state.pe=l?listToDraft(l):blankList(); state.peSel=state.pe.id||''; }
  const e=state.pe;
  const fld=(k,l,u)=>'<div class="field"><label for="e-'+k+'">'+l+'</label><input id="e-'+k+'" class="num" inputmode="decimal" data-bind="pe.'+k+'" value="'+esc(e[k])+'" aria-describedby="u-'+k+'"><div id="u-'+k+'" class="hint">'+u+'</div></div>';
  const usedBy=e.id?state.accounts.filter(a=>a.prislistaId===e.id).length:0;
  const sel=state.lists.length?'<div class="field" style="max-width:420px"><label for="pl-sel">Prislista</label><select id="pl-sel" data-act="plsel">'+state.lists.slice().sort(cmpName).map(l=>'<option value="'+esc(l.id)+'"'+(l.id===e.id?' selected':'')+'>'+esc(l.namn)+(l.standard?' (standard)':'')+'</option>').join('')+(e.id?'':'<option selected>Ny prislista</option>')+'</select></div>':'';
  return '<h2>Prislistor</h2><p class="lead">Standardlistan gäller alla kunder som inte har en egen. Tilldela en egen lista på kundens konto, eller välj lista per uppdrag.</p>'+
    '<div class="row-btns" style="align-items:flex-end;margin-bottom:14px">'+sel+'<button type="button" class="btn" data-act="plnew">Ny prislista</button></div>'+
    (!state.lists.length?'<div class="note warn" style="margin-bottom:14px">Det finns ingen prislista än. Fyll i dina priser och spara, så blir den första listan standard.</div>':'')+
    '<div class="card form"><div class="field" style="max-width:420px"><label for="e-namn">Namn på prislistan</label><input id="e-namn" data-bind="pe.namn" placeholder="Till exempel Standard 2026" value="'+esc(e.namn)+'"></div>'+
    '<div class="g3">'+fld('etablering','Etablering','kr per uppdrag')+fld('timpris','Timdebitering','kr per timme')+fld('slang','Slang','kr per meter')+fld('kubik','Kubik','kr per m³')+fld('avetablering','Avetablering','kr per uppdrag')+fld('tvatt','Tvätt','kr per tillfälle')+'</div>'+
    '<div><div class="lbl">Övriga artiklar</div><p class="hint" style="margin:0 0 10px">Valfri text och pris. Chauffören fyller i antal på rapporten.</p><div class="stack">'+e.ovriga.map((o,i)=>
      '<div class="prow"><input class="pn" aria-label="Artikel" placeholder="Text, till exempel Väntetid" data-bind="pe.ovriga.'+i+'.namn" value="'+esc(o.namn)+'"><input class="num" aria-label="Pris, kr" inputmode="decimal" placeholder="Pris" data-bind="pe.ovriga.'+i+'.pris" value="'+esc(o.pris)+'"><select aria-label="Enhet" data-bind="pe.ovriga.'+i+'.enhet">'+['st','tim','m','m³'].map(u=>'<option'+(o.enhet===u?' selected':'')+'>'+u+'</option>').join('')+'</select><button type="button" class="btn sm bad" data-act="oxdel" data-i="'+i+'" aria-label="Ta bort artikel">Ta bort</button></div>').join('')+'</div>'+
      '<div style="margin-top:10px"><button type="button" class="btn sm" data-act="oxadd">Lägg till artikel</button></div></div>'+
    '<div class="g3">'+fld('minTimmar','Minsta debitering','timmar, 0 = ingen')+fld('moms','Moms','%')+'</div>'+
    '<div class="hint">Timmar räknas från ankomst till avfärd minus rast, per påbörjad halvtimme.</div>'+
    '<div class="row-btns"><button type="button" class="btn pri" data-act="plsave">Spara prislista</button>'+
    (e.id&&!e.standard?'<button type="button" class="btn" data-act="plstd">Gör till standard</button>':'')+(e.id?'<button type="button" class="btn" data-act="pldup">Duplicera</button>':'')+
    (e.id&&!e.standard?(state.confirm==='pl:'+e.id?'<button type="button" class="btn bad" data-act="pldelok">Ta bort listan</button><button type="button" class="btn" data-act="cancel">Behåll</button>':'<button type="button" class="btn" data-act="pldel">Ta bort</button>'):'')+'</div>'+
    (usedBy?'<div class="hint">Används av '+usedBy+' kund'+(usedBy>1?'er':'')+'.</div>':'')+'</div>';
}

/* --- ritning --- */
function loadingView(t){ return plainShell('<div class="narrow">'+empty(t||'Hämtar uppdrag','Ett ögonblick.')+'</div>'); }
function draw(){
  const y=window.scrollY; let html;
  if(!sb)html=viewSetup();
  else if(state.phase==='boot')html=loadingView('Startar');
  else if(state.phase==='out')html=viewAuth();
  else if(state.phase==='recover')html=viewRecover();
  else if(state.phase==='claim')html=viewClaim();
  else if(state.phase==='loading')html=loadingView();
  else{
    const d=derive(); const c=ctx(d); const r=route(); let body;
    if(c.role==='chauffor')body=viewDriver(d,c);
    else if(c.role==='kund')body=viewCustomer(d,c);
    else if(r==='kalender')body=viewCalendar(d);
    else if(r==='uppdrag')body=viewJobs(d);
    else if(r==='godkann')body=viewApprove(d);
    else if(r==='faktura')body=viewInvoice(d);
    else if(r==='konton')body=viewAccounts(d);
    else body=viewLists();
    html=shell(c,r,body,d);
  }
  root.innerHTML=html;
  window.scrollTo(0,y);
}
const inputFocused=()=>{ const a=document.activeElement; return !!a&&root.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
function render(force){ if(!force&&inputFocused()){pending=true;return;} pending=false; draw(); }
function toast(m){ $('toast').innerHTML='<div>'+esc(m)+'</div>'; clearTimeout(tt); tt=setTimeout(()=>{$('toast').innerHTML='';},4000); }
const errMsg=e=>{ const m=e&&e.message?String(e.message):''; if(/violates foreign key/i.test(m))return 'Det går inte, något annat hör ihop med det här. Ta bort eller flytta det först.'; if(/row-level security|permission denied/i.test(m))return 'Du har inte behörighet att göra det här.'; return m||'Det gick inte att spara. Försök igen.'; };
async function run(fn){
  if(state.busy)return; state.busy=true;
  try{ await fn(); }catch(e){ toast(errMsg(e)); }
  finally{ state.busy=false; }
}

// ---------- 4. Åtgärder (skriver till databasen) ----------
async function saveReport(submit,c){
  const d=derive(); const x=d.byId[state.openJob]; if(!x)return;
  if(submit){ state.errs=validate(state.d); setErrs(); if(state.errs.length)return; }
  const s=state.d; const now=new Date().toISOString(); const dr=draftRep();
  const row={chauffor_id:c.acc.id,ankomst:orNull(s.ankomst),start:orNull(s.start),slut:orNull(s.slut),avfard:orNull(s.avfard),rast_min:Math.round(dr.rast),m3:dr.m3,slang_m:dr.slang,tvatt:dr.tvatt,ovriga:dr.ovriga,
    mottagare:s.mottagare.trim(),notering:s.notering.trim(),status:submit?'inskickad':'utkast',updated_at:now};
  if(submit)row.skickad_at=now;
  if(x.rep)ok(await sb.from('reports').update(row).eq('job_id',x.job.id));
  else ok(await sb.from('reports').insert(Object.assign({job_id:x.job.id},row)));
  state.openJob=null; await loadAll(); toast(submit?'Rapporten är inskickad.':'Utkastet är sparat.'); render(true); window.scrollTo(0,0);
}
function exportCsv(kund,snap){
  const blob=new Blob([buildCsv(kund,snap)],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='fakturaunderlag-'+kund.toLowerCase().replace(/[^a-z0-9åäö]+/g,'-')+'-'+todayStr()+'.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); toast('Filen laddas ner.');
}
const approveRow=x=>({job_id:x.job.id,godkand_av:state.session.user.id,snap:{lines:x.calc.lines,net:x.calc.net,vat:x.calc.vat,gross:x.calc.gross,moms:Number(x.pl.moms)||0,prislista:x.pl.namn||''}});
function plRow(e){
  return {namn:e.namn.trim(),etablering:num(e.etablering),timpris:num(e.timpris),slang:num(e.slang),kubik:num(e.kubik),avetablering:num(e.avetablering),tvatt:num(e.tvatt),min_timmar:num(e.minTimmar),moms:num(e.moms),
    ovriga:e.ovriga.filter(o=>o.namn.trim()).map(o=>({id:o.id,namn:o.namn.trim(),pris:num(o.pris),enhet:o.enhet||'st'}))};
}
function goForm(){ setTimeout(()=>{ const el=$('jobform'); if(el)el.scrollIntoView({block:'start'}); },0); }
async function afterWrite(msg){ await loadAll(); if(msg)toast(msg); render(true); }

document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]'); if(!t||!root.contains(t))return;
  const a=t.dataset.act, id=t.dataset.id; if(t.tagName==='SELECT')return;
  const d=derive(), c=state.me?ctx(d):{};
  /* inloggning */
  if(a==='authmode'){ state.au.mode=t.dataset.m; state.au.err=''; state.au.msg=''; render(true); }
  else if(a==='login'){ run(async()=>{ state.au.err=''; const r=await sb.auth.signInWithPassword({email:state.au.email.trim(),password:state.au.pw}); if(r.error){ state.au.err=/invalid login/i.test(r.error.message)?'Fel e-post eller lösenord.':r.error.message; render(true); } }); }
  else if(a==='signup'){ run(async()=>{ state.au.err=''; state.au.msg='';
    if(state.au.pw.length<8){ state.au.err='Lösenordet måste vara minst 8 tecken.'; render(true); return; }
    if(state.au.pw!==state.au.pw2){ state.au.err='Lösenorden är inte lika.'; render(true); return; }
    const r=await sb.auth.signUp({email:state.au.email.trim(),password:state.au.pw});
    if(r.error){ state.au.err=r.error.message; render(true); return; }
    if(!r.data.session){ state.au.msg='Vi har skickat ett mejl till '+state.au.email.trim()+'. Klicka på länken i mejlet och logga sedan in.'; state.au.mode='in'; state.au.pw=''; state.au.pw2=''; render(true); } }); }
  else if(a==='reset'){ run(async()=>{ state.au.err=''; const r=await sb.auth.resetPasswordForEmail(state.au.email.trim(),{redirectTo:location.origin+location.pathname}); if(r.error)state.au.err=r.error.message; else state.au.msg='Om adressen finns hos oss har vi skickat en länk för att välja nytt lösenord.'; render(true); }); }
  else if(a==='setpw'){ run(async()=>{ state.au.err=''; if(state.au.pw.length<8){ state.au.err='Lösenordet måste vara minst 8 tecken.'; render(true); return; }
    const r=await sb.auth.updateUser({password:state.au.pw}); if(r.error){ state.au.err=r.error.message; render(true); return; } state.au.pw=''; toast('Lösenordet är bytt.'); await afterAuth(); }); }
  else if(a==='logout'){ run(async()=>{ await sb.auth.signOut(); }); }
  else if(a==='showfirst'){ state.firstAdmin=true; state.claimErr=''; render(true); }
  else if(a==='claim'){ run(async()=>{ state.claimErr=''; const r=await sb.rpc('claim_account',{p_kod:state.claim.trim()}); if(r.error){ state.claimErr=r.error.message; render(true); return; } state.claim=''; await afterAuth(); }); }
  else if(a==='firstadmin'){ run(async()=>{ state.claimErr=''; const r=await sb.rpc('claim_first_admin',{p_namn:state.claimName.trim()}); if(r.error){ state.claimErr=r.error.message; render(true); return; } await afterAuth(); }); }
  /* chaufför */
  else if(a==='open'){ const x=d.byId[id]; if(!x)return; state.openJob=id; initDraft(x); render(true); window.scrollTo(0,0);
    if(!state.articles[id]&&!d.std){ sb.rpc('report_articles',{p_job:id}).then(r=>{ if(!r.error&&r.data){ state.articles[id]=r.data; if(state.openJob===id)render(true); } }); } }
  else if(a==='back'){ state.openJob=null; render(true); }
  else if(a==='unview'){ state.viewAs=''; state.openJob=null; render(true); }
  else if(a==='now'){ const v=nowHHMM(); state.d[t.dataset.field]=v; $('f-'+t.dataset.field).value=v; updateLive(); }
  else if(a==='rast'){ state.d.rast=t.dataset.v; $('f-rast').value=t.dataset.v; updateLive(); }
  else if(a==='save'){ run(()=>saveReport(t.dataset.submit==='1',c)); }
  else if(a==='toggle'){ state.expanded[id]=!state.expanded[id]; render(true); }
  else if(a==='cancel'){ state.confirm=null; render(true); }
  /* kalender */
  else if(a==='calprev'||a==='calnext'){ const p=state.cal.ym.split('-').map(Number); const dt=new Date(p[0],p[1]-1+(a==='calnext'?1:-1),1); state.cal.ym=fmtDate(dt).slice(0,7); render(true); }
  else if(a==='caltoday'){ state.cal={ym:todayStr().slice(0,7),sel:todayStr()}; render(true); }
  else if(a==='seld'){ state.cal.sel=t.dataset.d; if(t.dataset.d.slice(0,7)!==state.cal.ym)state.cal.ym=t.dataset.d.slice(0,7); render(true); }
  /* uppdrag */
  else if(a==='jobnew'){ state.jf=newJob(t.dataset.d); if(location.hash!=='#uppdrag')location.hash='uppdrag'; else render(true); goForm(); }
  else if(a==='jobedit'){ const j=d.byId[id].job; state.jf={id:j.id,requestId:null,datum:j.datum,planerad:j.planerad||'',kundId:j.kundId||'',plats:j.plats||'',beskrivning:j.beskrivning||'',forareId:j.forareId||'',prislistaId:j.prislistaId||'',planM3:j.planM3?String(j.planM3):'',notis:j.notis||''}; if(location.hash!=='#uppdrag')location.hash='uppdrag'; else render(true); goForm(); }
  else if(a==='jobsave'){ run(async()=>{
    const f=state.jf; if(!f.kundId||!f.plats.trim()||!f.datum){ toast('Fyll i datum, kund och plats.'); return; }
    const row={datum:f.datum,planerad:orNull(f.planerad),kund_id:f.kundId,plats:f.plats.trim(),beskrivning:f.beskrivning.trim(),chauffor_id:f.forareId||null,prislista_id:f.prislistaId||null,plan_m3:num(f.planM3)||null,notis:f.notis.trim()};
    let msg;
    if(f.id){ ok(await sb.from('jobs').update(row).eq('id',f.id)); msg='Uppdraget är sparat.'; }
    else{ const nj=ok(await sb.from('jobs').insert(row).select().single()); if(f.requestId)ok(await sb.from('requests').update({status:'bokad',job_id:nj.id}).eq('id',f.requestId)); msg='Uppdraget är tillagt.'; state.cal.sel=f.datum; state.cal.ym=f.datum.slice(0,7); }
    state.jf=newJob(); await afterWrite(msg); }); }
  else if(a==='jobdel'){ state.confirm='del:'+id; render(true); }
  else if(a==='jobdelok'){ run(async()=>{ ok(await sb.from('jobs').delete().eq('id',id)); state.confirm=null; await afterWrite('Uppdraget är borttaget.'); }); }
  else if(a==='reqbook'){ const q=state.requests.find(v=>v.id===id); if(!q)return; state.jf=Object.assign(newJob(q.datum),{requestId:q.id,planerad:q.planerad||'07:00',kundId:q.kundId,plats:q.plats||'',beskrivning:q.beskrivning||'',planM3:q.planM3?String(q.planM3):''}); render(true); goForm(); }
  else if(a==='reqno'){ run(async()=>{ ok(await sb.from('requests').update({status:'avvisad'}).eq('id',id)); await afterWrite('Förfrågan är avvisad.'); }); }
  else if(a==='reqsend'){ run(async()=>{
    const f=state.rf; if(!f.plats.trim()||!f.datum){ toast('Fyll i datum och plats.'); return; }
    ok(await sb.from('requests').insert({kund_id:c.acc.id,datum:f.datum,planerad:orNull(f.planerad),plats:f.plats.trim(),beskrivning:f.beskrivning.trim(),plan_m3:num(f.planM3)||null}));
    state.rf=newReq(); await afterWrite('Förfrågan är skickad.'); }); }
  /* godkänna och faktura */
  else if(a==='approve'){ run(async()=>{ ok(await sb.from('approvals').insert(approveRow(d.byId[id]))); await afterWrite('Godkänd.'); }); }
  else if(a==='approveall'){ run(async()=>{ const l=d.rows.filter(x=>x.st==='inskickad'); ok(await sb.from('approvals').insert(l.map(approveRow))); await afterWrite(l.length+' rapporter godkända.'); }); }
  else if(a==='unapprove'){ run(async()=>{ ok(await sb.from('approvals').delete().eq('job_id',id)); await afterWrite('Godkännandet är återtaget.'); }); }
  else if(a==='csv'){ const k=t.dataset.kund; const l=d.rows.filter(x=>x.st==='godkand'&&x.job.kundId===k); exportCsv((d.acc[k]||{}).namn||'kund',snapFor(l)); }
  else if(a==='csvinv'){ const i=state.invoices.find(v=>v.id===id); if(i)exportCsv((d.acc[i.kundId]||{}).namn||'kund',i); }
  else if(a==='invoice'){ state.confirm='inv:'+t.dataset.kund; render(true); }
  else if(a==='invoiceok'){ run(async()=>{
    const k=t.dataset.kund; const l=d.rows.filter(x=>x.st==='godkand'&&x.job.kundId===k); if(!l.length)return;
    const snap=snapFor(l); const nr=nextNumber();
    const inv=ok(await sb.from('invoices').insert({nummer:nr,kund_id:k,rader:snap.rader,netto:snap.net,moms:snap.vat,brutto:snap.gross,skapad_av:state.session.user.id}).select().single());
    ok(await sb.from('approvals').update({faktura_id:inv.id}).in('job_id',l.map(x=>x.job.id)));
    state.confirm=null; await afterWrite('Underlag '+nr+' är skapat.'); }); }
  /* konton */
  else if(a==='accnew'){ state.af=newAcc(); render(true); }
  else if(a==='accedit'){ const x=d.acc[id]; state.af={id:x.id,roll:x.roll,namn:x.namn||'',kontakt:x.kontakt||'',telefon:x.telefon||'',epost:x.epost||'',fordon:x.fordon||'',prislistaId:x.prislistaId||''}; render(true); window.scrollTo(0,0); }
  else if(a==='accsave'){ run(async()=>{
    const f=state.af; if(!f.namn.trim()){ toast('Fyll i namn.'); return; }
    const row={roll:f.roll,namn:f.namn.trim(),telefon:f.telefon.trim(),epost:f.epost.trim(),kontakt:f.roll==='kund'?f.kontakt.trim():null,fordon:f.roll==='chauffor'?f.fordon.trim():null,prislista_id:f.roll==='kund'?(f.prislistaId||null):null};
    let msg;
    if(f.id){ ok(await sb.from('accounts').update(row).eq('id',f.id)); msg='Kontot är sparat.'; }
    else{ const na=ok(await sb.from('accounts').insert(row).select().single()); ok(await sb.from('account_codes').insert({account_id:na.id,kod:genCode()})); msg='Kontot är skapat. Skicka koden till personen.'; }
    state.af=newAcc(f.roll); await afterWrite(msg); }); }
  else if(a==='accrecode'){ run(async()=>{ ok(await sb.from('account_codes').update({kod:genCode()}).eq('account_id',id)); ok(await sb.from('accounts').update({user_id:null}).eq('id',id)); await afterWrite('Ny kod är skapad. Eventuell gammal inloggning är bortkopplad.'); }); }
  else if(a==='accdel'){ state.confirm='acc:'+id; render(true); }
  else if(a==='accdelok'){ run(async()=>{ ok(await sb.from('accounts').delete().eq('id',id)); state.confirm=null; await afterWrite('Kontot är borttaget.'); }); }
  else if(a==='copy'){ const v=t.dataset.v; try{ navigator.clipboard.writeText(v).then(()=>toast('Koden är kopierad.'),()=>toast('Markera koden och kopiera den manuellt.')); }catch(er){ toast('Markera koden och kopiera den manuellt.'); } }
  /* prislistor */
  else if(a==='plnew'){ state.pe=blankList(); state.peSel=''; state.peDirty=true; render(true); }
  else if(a==='pldup'){ const e=state.pe; state.pe=Object.assign(JSON.parse(JSON.stringify(e)),{id:null,standard:false,namn:e.namn+' (kopia)'}); state.peSel=''; state.peDirty=true; render(true); }
  else if(a==='oxadd'){ state.pe.ovriga.push({id:'o'+rid(),namn:'',pris:'',enhet:'st'}); state.peDirty=true; render(true); }
  else if(a==='oxdel'){ state.pe.ovriga.splice(Number(t.dataset.i),1); state.peDirty=true; render(true); }
  else if(a==='plsave'){ run(async()=>{
    const e=state.pe; if(!e.namn.trim()){ toast('Ge prislistan ett namn.'); return; }
    const row=plRow(e);
    if(e.id){ ok(await sb.from('price_lists').update(row).eq('id',e.id)); }
    else{ row.standard=state.lists.length===0; const nl=ok(await sb.from('price_lists').insert(row).select().single()); state.peSel=nl.id; }
    state.peDirty=false; state.pe=null; await afterWrite('Prislistan är sparad.'); }); }
  else if(a==='plstd'){ run(async()=>{ const cur=state.lists.find(l=>l.standard); if(cur)ok(await sb.from('price_lists').update({standard:false}).eq('id',cur.id)); ok(await sb.from('price_lists').update({standard:true}).eq('id',state.pe.id)); state.pe=null; await afterWrite('Standardlistan är bytt.'); }); }
  else if(a==='pldel'){ state.confirm='pl:'+state.pe.id; render(true); }
  else if(a==='pldelok'){ run(async()=>{ ok(await sb.from('price_lists').delete().eq('id',state.pe.id)); state.confirm=null; state.pe=null; state.peSel=''; state.peDirty=false; await afterWrite('Prislistan är borttagen.'); }); }
});
function onField(e){
  const t=e.target; if(!t||!t.dataset)return;
  const a=t.dataset.act;
  if(e.type==='change'&&a){
    if(a==='viewas'){ state.viewAs=t.value; state.openJob=null; render(true); return; }
    if(a==='plsel'){ state.peSel=t.value; state.pe=null; state.peDirty=false; state.confirm=null; render(true); return; }
    if(a==='assign'){ const v=t.value||null; const jid=t.dataset.id; t.blur(); run(async()=>{ ok(await sb.from('jobs').update({chauffor_id:v}).eq('id',jid)); await afterWrite(v?'Chauffören är tilldelad.':'Tilldelningen är borttagen.'); }); return; }
  }
  const b=t.dataset.bind; if(!b)return;
  setPath(state,b,t.type==='checkbox'?t.checked:t.value);
  if(b.indexOf('pe.')===0)state.peDirty=true;
  if(b.indexOf('d.')===0)updateLive();
  if(t.dataset.rerender&&e.type==='change')render(true);
}
document.addEventListener('input',onField);
document.addEventListener('change',onField);
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return; const t=e.target; if(!t||!t.dataset||!t.dataset.enter)return;
  const map={auth:state.au.mode==='up'?'signup':state.au.mode==='reset'?'reset':'login',setpw:'setpw',claim:'claim',firstadmin:'firstadmin'};
  const btn=root.querySelector('[data-act="'+map[t.dataset.enter]+'"]'); if(btn){ e.preventDefault(); btn.click(); }
});
document.addEventListener('focusout',()=>setTimeout(()=>{ if(pending&&!inputFocused())render(); },250));
window.addEventListener('hashchange',()=>{ state.openJob=null; state.confirm=null; render(true); window.scrollTo(0,0); });

// ---------- 5. Datahämtning och inloggning ----------
async function loadAll(){
  const admin=state.me&&state.me.roll==='admin';
  const q=[sb.from('accounts').select('*'),sb.from('price_lists').select('*'),sb.from('jobs').select('*'),sb.from('reports').select('*'),sb.from('approvals').select('*'),sb.from('requests').select('*')];
  if(admin){ q.push(sb.from('account_codes').select('*')); q.push(sb.from('invoices').select('*')); }
  const r=await Promise.all(q);
  for(const x of r){ if(x.error){ state.loadErr='Det gick inte att hämta data: '+x.error.message; return; } }
  state.loadErr='';
  state.accounts=r[0].data.map(mapAccount);
  state.lists=r[1].data.map(mapList);
  state.jobs=r[2].data.map(mapJob);
  state.reports={}; r[3].data.forEach(x=>{state.reports[x.job_id]=mapReport(x);});
  state.approvals={}; r[4].data.forEach(x=>{state.approvals[x.job_id]=mapApproval(x);});
  state.requests=r[5].data.map(mapRequest);
  if(admin){
    const codes={}; r[6].data.forEach(x=>{codes[x.account_id]=x.kod;});
    state.accounts.forEach(a=>{a.kod=codes[a.id]||'';});
    state.invoices=r[7].data.map(mapInvoice);
  }
  if(!state.peDirty)state.pe=null;
}
async function afterAuth(){
  const s=state.session;
  if(!s){ state.me=null; state.viewAs=''; state.openJob=null; state.phase='out'; render(true); return; }
  const r=await sb.from('accounts').select('*').eq('user_id',s.user.id).maybeSingle();
  if(r.error){ state.phase='out'; state.au.err='Det gick inte att hämta ditt konto: '+r.error.message; render(true); return; }
  if(!r.data){ state.me=null; state.phase='claim'; render(true); return; }
  state.me=mapAccount(r.data); state.phase='loading'; render(true);
  await loadAll(); state.phase='app'; render(true);
}
async function refresh(){
  if(state.phase!=='app'||state.busy||document.hidden||inputFocused()||state.openJob)return;
  try{ await loadAll(); render(); }catch(e){}
}
async function init(){
  draw(); if(!sb)return;
  sb.auth.onAuthStateChange((event,session)=>{
    state.session=session;
    if(event==='PASSWORD_RECOVERY'){ state.phase='recover'; render(true); return; }
    if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='INITIAL_SESSION'){ if(event==='INITIAL_SESSION'&&state.phase!=='boot')return; if(event==='SIGNED_IN'&&state.phase==='app'&&state.me)return; setTimeout(()=>{ afterAuth(); },0); }
  });
  setInterval(refresh,45000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden)refresh(); });
}
init();
})();
