/* Toketa Reise – Oberfläche. Ursprung: Japan-Reiseplaner v1, erweitert um mehrere Reisen, Anmeldung und Sync. */
import { loadStore, saveStore, loadUi, saveUi as saveUiStore, uid, addDays, migrate, newTripState } from './store.js';
import { initSync, pushTrip, removeTrip, login as fbLogin, logout as fbLogout, resetPassword, authMessage } from './sync.js';
import { isNative, openExternal, saveTextFile, setupNative } from './native.js';
import { initUpdates, runCheck, versionText, platform } from './update.js';
import { JAPAN_V1 } from './data/japan-v1.js';

/* ---------- Grunddaten ---------- */
let TRIP = {}, HOL = {}; // zeigen immer auf die aktive Reise (siehe bind)
const TYPES={transfer:['駅','Transfer'],stay:['宿','Unterkunft'],sight:['景','Sehenswertes'],food:['食','Essen'],night:['夜','Nachtleben'],shop:['買','Shopping'],culture:['劇','Kultur & Show'],nature:['山','Natur & Ausflug'],other:['他','Sonstiges']};
const IDEA_CATS=['sight','food','night','shop','culture','nature','other'];
const BEFORE_CATS={buy:['買','Kaufen'],do:['済','Erledigen'],plan:['調','Recherchieren']};
const PHASES={prep:['備','Vorbereitung'],pack:['荷','Packliste'],site:['地','Unterwegs & vor Ort']};
const COLORS=[['blue','Elektroblau'],['mid','Mittelblau'],['lav','Lavendel'],['ink','Schwarz'],['slate','Schiefer'],['gray','Grau'],['red','Rot'],['orange','Orange'],['yellow','Gelb'],['green','Grün'],['teal','Türkis'],['cyan','Himmelblau'],['pink','Pink'],['purple','Violett'],['brown','Braun']];
const WD=['So','Mo','Di','Mi','Do','Fr','Sa'],WDL=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONL=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

/* ---------- Helfer ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2])};
const diffDays=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const TODAY=iso(new Date());
const fmtShort=s=>{const d=parse(s);return d.getDate()+'.'+(d.getMonth()+1)+'.'};
const fmtLong=s=>{const d=parse(s);return WDL[d.getDay()]+', '+d.getDate()+'. '+MONL[d.getMonth()]};
const fmtWd=s=>{const d=parse(s);return WD[d.getDay()]+' '+d.getDate()+'.'+(d.getMonth()+1)+'.'};
const nf0=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
const eur=n=>nf0.format(Math.round(n))+' €';
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
function linkify(t){
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g,(m)=>{let h=m;try{h=new URL(m.replace(/&amp;/g,'&')).hostname.replace(/^www\./,'')}catch(e){}
    return '<a href="'+m+'" target="_blank" rel="noopener noreferrer">'+esc(h)+' ↗</a>'});
}
const SYM=()=>(state&&state.budget&&state.budget.sym)||'';

/* ---------- Speicher: lokal immer, zusätzlich Firestore wenn angemeldet ---------- */
let store=loadStore();
let state=null;
let ui=Object.assign({tab:'plan',sel:null,phase:'all',onlyOpen:false,wish:'japan',wcat:'all',wplace:'all',bcat:'all',skipLogin:false,theme:'',design:'toketa',autoUpd:true},loadUi());
let sync={user:null,status:'local',err:'',ready:false};
const timers={},pending={},deferred={};
const cur=()=>store.trips[store.active];
function bind(){const t=cur();state=t?t.state:null;TRIP=state?state.trip:{};HOL=state?state.holidays:{}}
function saveUi(){saveUiStore(ui)}
function persist(){
  const t=cur();if(!t)return;
  state.rev=Date.now();t.rev=state.rev;saveStore(store);
  if(sync.user)schedulePush(store.active);
}
function schedulePush(id){clearTimeout(timers[id]);pending[id]=true;setSync('saving');timers[id]=setTimeout(()=>doPush(id),800)}
async function doPush(id){
  const t=store.trips[id];if(!t){delete pending[id];return}
  const rev=t.rev;
  try{await pushTrip(id,{name:t.state.trip.name,rev,json:JSON.stringify(t.state)});if(t.rev===rev){delete pending[id];setSync('ok')}}
  catch(e){setSync('err',e&&e.code)}
}
function setSync(m,err){
  if(m)sync.status=m;if(err!==undefined)sync.err=err||'';
  const el=$('#sync');if(!el)return;
  let dot='',txt='';
  if(!sync.user){dot='';txt='Nur auf diesem Gerät gespeichert'}
  else if(sync.status==='saving'){dot='busy';txt='Speichert …'}
  else if(sync.status==='offline'){dot='busy';txt='Offline. Änderungen werden übertragen, sobald du wieder Netz hast.'}
  else if(sync.status==='err'){dot='err';txt='Synchronisierung fehlgeschlagen'+(sync.err?' ('+sync.err+')':'')+'. Alles ist lokal gespeichert.'}
  else{dot='ok';txt='Synchronisiert · '+esc(sync.user.email)}
  el.innerHTML='<span class="dot '+dot+'"></span>'+txt;
}
const modalOpen=()=>!!$('#modal').innerHTML;
function adoptRemote(id,d){
  try{
    const s=migrate(JSON.parse(d.json));s.rev=d.rev||s.rev||0;
    store.trips[id]={id,rev:d.rev||0,state:s};
    if(!store.active||!store.trips[store.active])store.active=id;
    saveStore(store);
    if(id===store.active){bind();if(!state.days[ui.sel])ui.sel=defaultSel()}
    render();
  }catch(e){}
}
function onRemoteTrip(id,d){
  if(pending[id])return;
  const loc=store.trips[id],rrev=d.rev||0;
  if(!loc){adoptRemote(id,d);return}
  if(rrev>loc.rev){if(modalOpen()&&id===store.active){deferred[id]=d;return}adoptRemote(id,d)}
  else if(rrev<loc.rev)schedulePush(id);
}
function onRemoteRemove(id){
  if(pending[id])return;
  if(!store.trips[id])return;
  delete store.trips[id];
  if(store.active===id){store.active=Object.keys(store.trips)[0]||null;bind();ui.sel=state?defaultSel():null}
  saveStore(store);render();
}
function onSnapshotDone(ids,fromCache){
  if(fromCache)return;
  Object.keys(store.trips).forEach(id=>{if(!ids.includes(id)&&!pending[id])schedulePush(id)});
}
function flushDeferred(){
  Object.keys(deferred).forEach(id=>{const d=deferred[id];delete deferred[id];const loc=store.trips[id];if(loc&&(d.rev||0)>loc.rev)adoptRemote(id,d)});
}
function commit(refocus){persist();render();if(refocus){const el=document.getElementById(refocus);if(el)el.focus()}}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),2400)}

/* ---------- Berechnungen ---------- */
const dayOf=d=>state.days[d]||{place:'',note:'',entries:[]};
const colorOf=p=>state.places[p]||'gray';
function dayNo(d){return diffDays(TRIP.day1,d)+1}
function toEur(a,cur){return !a?0:(cur==='fx'?a/(state.budget.rate||1):a)}
function costText(e){return e.cost?(e.cur==='fx'?nf0.format(e.cost)+' '+SYM()+(state.budget.rate>0?' (≈ '+eur(toEur(e.cost,'fx'))+')':''):eur(e.cost)):''}
function defaultSel(){return(TODAY>=TRIP.start&&TODAY<=TRIP.end)?TODAY:(state.days[TRIP.day1]?TRIP.day1:TRIP.start)}
function staysFor(d){
  const out=[];
  state.stays.forEach(s=>{const n=diffDays(s.from,s.to);
    if(s.from<=d&&d<s.to){out.push({s,t:'Nacht '+(diffDays(s.from,d)+1)+' von '+n+(s.from===d?' · Check-in heute':'')})}
    else if(s.to===d)out.push({s,t:'Check-out heute'})});
  return out;
}
function checkStats(phase){
  let t=0,d=0;state.check.forEach(g=>{if(phase&&phase!=='all'&&g.phase!==phase)return;g.items.forEach(i=>{t++;if(i.done)d++})});return{t,d};
}
function dueClass(due,done){if(!due||done)return'';const n=diffDays(TODAY,due);return n<0?'over':n<=3?'soon':''}
function dueSoonCount(){let n=0;state.check.forEach(g=>g.items.forEach(i=>{if(!i.done&&i.due&&diffDays(TODAY,i.due)<=7)n++}));
  state.todos.forEach(t=>{if(t.kind==='before'&&!t.done&&t.due&&diffDays(TODAY,t.due)<=7)n++});return n}
function budgetCalc(){
  const b=state.budget,fixed=b.fixed.reduce((a,x)=>a+(x.amount||0),0),stays=state.stays.reduce((a,x)=>a+(x.cost||0),0);
  let planned=0,optional=0,doneCost=0;
  Object.keys(state.days).forEach(d=>state.days[d].entries.forEach(e=>{const c=toEur(e.cost,e.cur);if(!c)return;if(e.done)doneCost+=c;else if(e.maybe)optional+=c;else planned+=c}));
  const logged=b.spent.reduce((a,x)=>a+toEur(x.amount,x.cur),0),spent=logged+doneCost;
  const pool=b.limit-fixed-stays,free=pool-planned-spent;
  const from=TODAY>TRIP.day1?TODAY:TRIP.day1;
  const left=TODAY>TRIP.home?0:diffDays(from,TRIP.home)+1;
  return{fixed,stays,planned,optional,logged,doneCost,spent,pool,free,left,perDay:left>0?free/left:0};
}

/* ---------- Kopf ---------- */
function rangeText(){
  const a=parse(TRIP.start),b=parse(TRIP.end);
  return a.getDate()+'. '+MON[a.getMonth()]+' – '+b.getDate()+'. '+MON[b.getMonth()]+' '+b.getFullYear();
}
function renderHero(){
  const t=$('#heroTitle'),k=$('#heroKick'),sun=$('#sun'),chips=$('#heroChips');
  if(!state){t.textContent='Toketa Reise';k.textContent='Dein Reiseplaner';sun.innerHTML='<b>解</b><small>Los geht’s</small>';chips.innerHTML='';return}
  t.textContent=TRIP.name;k.textContent=TRIP.kicker||rangeText();
  const n=diffDays(TODAY,TRIP.start);let big,small;
  if(n>0){big=n;small=n===1?'Tag bis zur Abreise':'Tage bis zur Abreise'}
  else if(TODAY<=TRIP.end){const d=dayNo(TODAY);if(d<1){big='→';small='Abreisetag'}else if(TODAY>TRIP.home){big='←';small='Heimreise'}else{big=d;small='Reisetag'}}
  else{big='解';small='Willkommen zurück'}
  sun.innerHTML='<b'+(String(big).length>3?' style="font-size:26px"':'')+'>'+esc(big)+'</b><small>'+esc(small)+'</small>';
  const st=checkStats('all'),soon=dueSoonCount(),bc=budgetCalc();
  chips.innerHTML=
    '<button class="chip-btn" data-tab="check" type="button">Checkliste <b>'+st.d+'/'+st.t+'</b></button>'+
    (soon?'<button class="chip-btn" data-tab="check" type="button">Bald fällig <b>'+soon+'</b></button>':'')+
    (state.budget.limit?'<button class="chip-btn" data-tab="budget" type="button">Budget frei <b>'+eur(bc.free)+'</b></button>':'');
}

/* ---------- Reiseplan ---------- */
function calHTML(){
  const s=TRIP,t0=parse(s.start),mon=addDays(s.start,-((t0.getDay()+6)%7));
  const total=Math.ceil((diffDays(mon,s.end)+1)/7)*7;let cells='';
  for(let i=0;i<total;i++){
    const d=addDays(mon,i);
    if(d<s.start||d>s.end){cells+='<span class="tile out"></span>';continue}
    const day=dayOf(d),dn=parse(d),n=day.entries.length,showM=d===s.start||dn.getDate()===1;
    cells+='<button type="button" class="tile'+(d===ui.sel?' sel':'')+(d===TODAY?' today':'')+'" style="--pc:var(--pc-'+colorOf(day.place)+')" data-act="selday" data-d="'+d+'" title="'+esc(day.entries.map(e=>e.title).join(' · '))+'">'+
      '<span class="tm">'+(showM?MON[dn.getMonth()]:'')+'</span><b>'+dn.getDate()+'</b><span class="tp">'+esc(day.place||'–')+'</span>'+
      (n?'<span class="tn">'+n+'</span>':'')+(HOL[d]?'<span class="th" title="'+esc(HOL[d])+'">祝</span>':'')+'</button>';
  }
  const places={};Object.keys(state.days).forEach(d=>{const p=state.days[d].place;if(p)places[p]=colorOf(p)});
  return '<div class="card cal"><div class="cal-h">'+['MO','DI','MI','DO','FR','SA','SO'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="cal-g">'+cells+'</div>'+
    '<div class="legend">'+Object.keys(places).map(p=>'<span class="pill" style="--pc:var(--pc-'+places[p]+')">'+esc(p)+'</span>').join('')+'</div></div>';
}
function staysHTML(){
  const list=state.stays.slice().sort((a,b)=>a.from<b.from?-1:1);
  return '<div class="card stays"><div class="side-h"><h3>Unterkünfte</h3><button class="btn sm" type="button" data-act="staynew">Neu</button></div>'+
    (list.length?list.map(s=>'<button type="button" class="stay" data-act="stayedit" data-id="'+s.id+'"><div><div class="s-n">'+esc(s.name)+'</div><div class="s-d">'+fmtShort(s.from)+' – '+fmtShort(s.to)+' · '+diffDays(s.from,s.to)+' Nächte</div></div>'+(s.cost?'<span class="cost">'+eur(s.cost)+'</span>':'')+'</button>').join(''):'<div class="empty">Noch keine Unterkunft.</div>')+'</div>';
}
function entryHTML(d,e){
  const t=TYPES[e.type]||TYPES.other,u=safeUrl(e.link);
  return '<li class="entry'+(e.done?' done':'')+(e.maybe?' maybe':'')+'" draggable="true" data-id="'+e.id+'" data-d="'+d+'">'+
    '<div class="e-time">'+(e.time?'<b>'+esc(e.time)+'</b>'+(e.end?'<small>bis '+esc(e.end)+'</small>':''):'<span class="open">Zeit offen</span>')+'</div>'+
    '<div class="stamp" title="'+esc(t[1])+'">'+t[0]+'</div>'+
    '<div class="e-body"><div class="e-title">'+esc(e.title)+'</div><div class="e-meta"><span>'+esc(t[1])+'</span>'+(e.maybe?'<span class="tag">vielleicht</span>':'')+(e.cost?'<span class="cost">'+esc(costText(e))+'</span>':'')+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">Link ↗</a>':'')+'</div>'+
    (e.note?'<p class="e-note">'+linkify(e.note)+'</p>':'')+'</div>'+
    '<div class="e-act"><button type="button" class="chk'+(e.done?' on':'')+'" data-act="edone" data-d="'+d+'" data-id="'+e.id+'" aria-label="Erledigt umschalten" title="Erledigt"></button>'+
    '<button type="button" class="ib" data-act="eup" data-d="'+d+'" data-id="'+e.id+'" aria-label="Nach oben" title="Nach oben">↑</button>'+
    '<button type="button" class="ib" data-act="edown" data-d="'+d+'" data-id="'+e.id+'" aria-label="Nach unten" title="Nach unten">↓</button>'+
    '<button type="button" class="ib" data-act="eedit" data-d="'+d+'" data-id="'+e.id+'" aria-label="Bearbeiten" title="Bearbeiten">✎</button></div></li>';
}
function dayHTML(d){
  const day=dayOf(d),k=dayNo(d),prev=addDays(d,-1),next=addDays(d,1);
  const kick=(k>=1?'Tag '+k:'Anreise')+(d===TODAY?' · heute':'');
  const stays=staysFor(d);
  const info=(stays.length||day.note)?'<div class="dayinfo">'+
    stays.map(x=>'<div class="row"><span class="lab">宿</span><span class="t"><b>'+esc(x.s.name)+'</b> · '+esc(x.t)+'</span></div>').join('')+
    (day.note?'<div class="row"><span class="lab">記</span><span class="t"><p>'+linkify(day.note)+'</p></span></div>':'')+'</div>':'';
  const ents=day.entries;
  const timeline=ents.length?'<ul class="tl" data-d="'+d+'">'+ents.map(e=>entryHTML(d,e)).join('')+'</ul>':
    '<div class="empty"><div class="big">空</div>Noch nichts geplant. Trage unten etwas ein oder zieh Ideen aus dem Pool hierher.</div>';
  return '<div class="card daycard" id="daycard"><div class="dayhead">'+
    '<button type="button" class="nav" data-act="selday" data-d="'+prev+'" '+(prev<TRIP.start?'disabled':'')+' aria-label="Vorheriger Tag">‹</button>'+
    '<div class="ttl"><div class="kicker" style="color:var(--muted)">'+kick+'</div><h2>'+fmtLong(d)+'</h2><div class="meta">'+
    '<button type="button" class="pill" style="--pc:var(--pc-'+colorOf(day.place)+');cursor:pointer" data-act="dayedit" data-d="'+d+'" title="Ort, Farbe und Notiz ändern">'+esc(day.place||'Ort festlegen')+' ✎</button>'+
    (HOL[d]?'<span class="tag new">'+esc(HOL[d])+'</span>':'')+'</div></div>'+
    '<button type="button" class="nav" data-act="selday" data-d="'+next+'" '+(next>TRIP.end?'disabled':'')+' aria-label="Nächster Tag">›</button></div>'+
    info+timeline+
    '<div class="addbar"><form class="qadd" data-form="qday" data-d="'+d+'"><input type="time" id="q_time" aria-label="Uhrzeit"><input type="text" id="q_title" placeholder="Was steht an? (Enter zum Hinzufügen)" aria-label="Titel"><select id="q_type" aria-label="Art">'+
    Object.keys(TYPES).map(t=>'<option value="'+t+'"'+(t==='sight'?' selected':'')+'>'+TYPES[t][1]+'</option>').join('')+'</select><button class="btn primary" type="submit">Hinzufügen</button></form>'+
    '<div class="btns"><button class="btn sm" type="button" data-act="eadd" data-d="'+d+'">Ausführlich eintragen</button><button class="btn sm" type="button" data-act="idea-pick" data-d="'+d+'">Aus Ideen einplanen</button>'+
    (ents.length>1?'<button class="btn sm" type="button" data-act="esort" data-d="'+d+'">Nach Uhrzeit sortieren</button>':'')+
    '<button class="btn sm" type="button" data-act="dayedit" data-d="'+d+'">Tag bearbeiten</button></div></div></div>';
}
function vPlan(){return '<div class="plan"><aside class="side">'+calHTML()+staysHTML()+'</aside><section>'+dayHTML(ui.sel)+'</section></div>'}

/* ---------- Checkliste ---------- */
function groupHTML(g){
  const n=g.items.length,dn=g.items.filter(i=>i.done).length;
  const items=g.items.filter(i=>!ui.onlyOpen||!i.done);
  return '<article class="card grp"><header><div class="stamp sm">'+PHASES[g.phase][0]+'</div><h3>'+esc(g.name)+'</h3><span class="cnt">'+dn+'/'+n+'</span><button type="button" class="ib" data-act="gup" data-g="'+g.id+'" aria-label="Kategorie nach oben" title="Nach oben">↑</button><button type="button" class="ib" data-act="gdown" data-g="'+g.id+'" aria-label="Kategorie nach unten" title="Nach unten">↓</button><button type="button" class="ib" data-act="gedit" data-g="'+g.id+'" aria-label="Kategorie bearbeiten">✎</button></header>'+
    '<div class="bar"><i style="width:'+(n?dn/n*100:0)+'%"></i></div><ul>'+
    (items.length?items.map(i=>{const dc=dueClass(i.due,i.done);
      return '<li class="ci'+(i.done?' done':'')+'"><button type="button" class="chk'+(i.done?' on':'')+'" data-act="ctoggle" data-g="'+g.id+'" data-i="'+i.id+'" aria-label="Erledigt umschalten"></button>'+
      '<div class="ci-body"><span class="ci-t" data-act="ctoggle" data-g="'+g.id+'" data-i="'+i.id+'">'+esc(i.t)+'</span>'+
      (i.isNew?'<span class="tag new" title="Vorschlag von Claude">Vorschlag</span>':'')+(i.due&&!i.done?'<span class="due '+dc+'">bis '+fmtShort(i.due)+'</span>':'')+
      (i.note?'<span class="ci-n">'+linkify(i.note)+'</span>':'')+'</div>'+
      '<button type="button" class="ib" data-act="cedit" data-g="'+g.id+'" data-i="'+i.id+'" aria-label="Bearbeiten">✎</button></li>'}).join(''):
      '<li class="ci"><span class="sub">'+(n?'Alles erledigt.':'Noch leer.')+'</span></li>')+
    '</ul><form class="addrow" data-form="qcheck" data-g="'+g.id+'"><input type="text" id="ac_'+g.id+'" placeholder="Punkt hinzufügen …" aria-label="Neuer Punkt"><button class="btn sm" type="submit">+</button></form></article>';
}
function vCheck(){
  const st=checkStats(ui.phase),pc=st.t?Math.round(st.d/st.t*100):0;
  const gs=state.check.filter(g=>ui.phase==='all'||g.phase===ui.phase);
  return '<div class="toolbar"><div class="seg" role="group" aria-label="Bereich">'+
    [['all','Alle']].concat(Object.keys(PHASES).map(p=>[p,PHASES[p][1]])).map(x=>'<button type="button" class="'+(ui.phase===x[0]?'on':'')+'" data-act="phase" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'+
    '<div class="progress-big"><b>'+pc+'%</b><div class="bar"><i style="width:'+pc+'%"></i></div><span class="cnt">'+st.d+' von '+st.t+'</span></div>'+
    '<label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" data-act="onlyopen" '+(ui.onlyOpen?'checked':'')+' style="accent-color:var(--ac)"> nur Offene</label>'+
    '<span class="grow"></span><button class="btn" type="button" data-act="gnew">Neue Kategorie</button></div>'+
    '<div class="cols">'+gs.map(groupHTML).join('')+'</div>'+
    (gs.length?'':'<div class="empty">Keine Kategorie in diesem Bereich.</div>');
}

/* ---------- Todos & Wünsche ---------- */
function ideaHTML(t){
  const c=TYPES[t.cat]||TYPES.other,u=safeUrl(t.link);
  return '<article class="card idea'+(t.done?' done':'')+'" data-s="'+esc((t.text+' '+t.note+' '+t.place).toLowerCase())+'"><div class="stamp" title="'+esc(c[1])+'">'+c[0]+'</div><div class="body">'+
    '<h4>'+esc(t.text)+'</h4><div class="meta">'+(t.place?'<span class="pill" style="--pc:var(--pc-'+colorOf(t.place)+')">'+esc(t.place)+'</span>':'')+'<span>'+esc(c[1])+'</span>'+
    (t.cost?'<span>'+esc(costText(t))+'</span>':'')+(t.isNew?'<span class="tag new">Vorschlag</span>':'')+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">Link ↗</a>':'')+'</div>'+
    (t.note?'<p>'+linkify(t.note)+'</p>':'')+
    '<div class="acts">'+(t.plan?'<button type="button" class="planned" data-act="gotoplan" data-d="'+esc(t.plan.day)+'">Eingeplant: '+fmtWd(t.plan.day)+'</button>':
      '<button type="button" class="btn sm primary" data-act="idea-plan" data-id="'+t.id+'">Einplanen</button>')+
    '<button type="button" class="btn sm" data-act="wdone" data-id="'+t.id+'">'+(t.done?'Wieder offen':'Erlebt')+'</button>'+
    '<button type="button" class="ib" data-act="wedit" data-id="'+t.id+'" aria-label="Bearbeiten">✎</button>'+
    '<button type="button" class="star'+(t.prio==='must'?' on':'')+'" data-act="wstar" data-id="'+t.id+'" aria-label="Unbedingt" title="Unbedingt erleben">★</button></div></div></article>';
}
function vWish(){
  const seg='<div class="seg" role="group"><button type="button" class="'+(ui.wish==='before'?'on':'')+'" data-act="wkind" data-v="before">Vor der Abreise</button><button type="button" class="'+(ui.wish==='japan'?'on':'')+'" data-act="wkind" data-v="japan">Unterwegs (Ideen-Pool)</button></div>';
  if(ui.wish==='before'){
    const list=state.todos.filter(t=>t.kind==='before').sort((a,b)=>(a.done-b.done)||((a.due||'9')<(b.due||'9')?-1:1));
    return '<div class="toolbar">'+seg+'</div><form class="qa b3" data-form="qbefore"><input type="text" id="qb_t" placeholder="Zum Beispiel: Powerbank kaufen" aria-label="Todo"><select id="qb_c" aria-label="Art">'+
      Object.keys(BEFORE_CATS).map(c=>'<option value="'+c+'">'+BEFORE_CATS[c][1]+'</option>').join('')+'</select><button class="btn primary" type="submit">Hinzufügen</button></form>'+
      (list.length?'<div class="todos">'+list.map(t=>{const dc=dueClass(t.due,t.done);return '<div class="todo'+(t.done?' done':'')+'"><button type="button" class="chk'+(t.done?' on':'')+'" data-act="wdone" data-id="'+t.id+'" aria-label="Erledigt umschalten"></button><div style="flex:1;min-width:0"><span class="tt">'+esc(t.text)+'</span> '+
        '<span class="tag">'+esc((BEFORE_CATS[t.cat]||BEFORE_CATS.do)[1])+'</span>'+(t.isNew?' <span class="tag new">Vorschlag</span>':'')+(t.due&&!t.done?' <span class="due '+dc+'">bis '+fmtShort(t.due)+'</span>':'')+(t.note?'<div class="sub">'+linkify(t.note)+'</div>':'')+'</div>'+
        '<button type="button" class="ib" data-act="wedit" data-id="'+t.id+'" aria-label="Bearbeiten">✎</button></div>'}).join('')+'</div>':'<div class="empty"><div class="big">備</div>Nichts offen. Trage ein, was du vor der Abreise noch kaufen oder erledigen willst.</div>');
  }
  const all=state.todos.filter(t=>t.kind==='japan');
  const cnt=c=>all.filter(t=>c==='all'||t.cat===c).length;
  const places=Array.from(new Set(all.map(t=>t.place).filter(Boolean)));
  let list=all.filter(t=>(ui.wcat==='all'||t.cat===ui.wcat)&&(ui.wplace==='all'||t.place===ui.wplace));
  list.sort((a,b)=>(a.done-b.done)||((b.prio==='must')-(a.prio==='must')));
  return '<div class="toolbar">'+seg+'<span class="sub">Ideen ohne festen Zeitplan. „Einplanen“ legt sie in einen Tag.</span></div>'+
    '<form class="qa" data-form="qjapan"><input type="text" id="qj_t" placeholder="Was willst du unbedingt erleben, essen oder kaufen?" aria-label="Idee"><select id="qj_c" aria-label="Kategorie">'+
    IDEA_CATS.map(c=>'<option value="'+c+'">'+TYPES[c][1]+'</option>').join('')+'</select><input type="text" id="qj_p" list="placelist" placeholder="Ort (optional)" aria-label="Ort"><button class="btn primary" type="submit">Hinzufügen</button></form>'+
    '<div class="toolbar"><div class="chiprow"><button type="button" class="fchip'+(ui.wcat==='all'?' on':'')+'" data-act="wcat" data-v="all">Alle<i>'+cnt('all')+'</i></button>'+
    IDEA_CATS.map(c=>'<button type="button" class="fchip'+(ui.wcat===c?' on':'')+'" data-act="wcat" data-v="'+c+'">'+TYPES[c][1]+'<i>'+cnt(c)+'</i></button>').join('')+'</div>'+
    '<span class="grow"></span><select id="wplace" style="width:auto" aria-label="Ort filtern"><option value="all">Alle Orte</option>'+places.map(p=>'<option'+(ui.wplace===p?' selected':'')+'>'+esc(p)+'</option>').join('')+'</select>'+
    '<input type="text" id="wsearch" placeholder="Suchen …" style="width:180px" aria-label="Suchen"></div>'+
    (list.length?'<div class="ideas" id="ideas">'+list.map(ideaHTML).join('')+'</div>':'<div class="empty"><div class="big">願</div>Hier ist noch nichts. Sammle Orte, Läden und Erlebnisse.</div>');
}

/* ---------- Budget ---------- */
function vBudget(){
  const b=state.budget,c=budgetCalc(),lim=b.limit||1;
  const seg=(v,col)=>'<i style="width:'+Math.max(0,Math.min(100,v/lim*100))+'%;background:'+col+'"></i>';
  const fixedAll=c.fixed+c.stays;
  const plannedRows=[];Object.keys(state.days).sort().forEach(d=>state.days[d].entries.forEach(e=>{if(e.cost)plannedRows.push([d,e])}));
  const catSum={};b.spent.forEach(x=>{catSum[x.cat]=(catSum[x.cat]||0)+toEur(x.amount,x.cur)});
  const cats=['Essen','Transit','Shopping','Eintritt','Sonstiges'];
  return '<div class="bgrid">'+
  '<section class="card panel"><h3>Übersicht</h3><div class="sub">Reiselimit</div><div class="big-n">'+eur(b.limit)+'</div>'+
    '<div class="stack" style="margin-top:14px">'+seg(fixedAll,'var(--pc-slate)')+seg(c.spent,'var(--ac)')+seg(c.planned,'var(--pc-lav)')+'</div>'+
    '<div class="leg">'+
      '<div style="--c:var(--pc-slate)">Fixkosten (Reise + Unterkünfte)<span>'+eur(fixedAll)+'</span></div>'+
      '<div style="--c:var(--ac)">Ausgegeben (Log + abgehakte Einträge)<span>'+eur(c.spent)+'</span></div>'+
      '<div style="--c:var(--pc-lav)">Geplant aus dem Reiseplan<span>'+eur(c.planned)+'</span></div>'+
      '<div style="--c:var(--line)"><b>Noch frei</b><span class="'+(c.free<0?'over-t':'')+'">'+eur(c.free)+'</span></div></div>'+
    '<p class="sub" style="margin:14px 0 0">Frei für Essen, Shopping und Transit nach Fixkosten: <b>'+eur(c.pool)+'</b>. '+
    (c.left>0?'Bei noch '+c.left+' Reisetagen bleiben rechnerisch <b>'+eur(c.perDay)+'</b> pro Tag.':'')+
    (c.optional?' Optionale Kosten (vielleicht): '+eur(c.optional)+'.':'')+'</p>'+
    '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center"><button class="btn sm" type="button" data-act="bsettings">Limit und Wechselkurs</button>'+(SYM()&&b.rate>0?'<span class="sub">1.000 '+esc(SYM())+' ≈ '+eur(1000/b.rate)+'</span>':'')+'</div>'+(b.limit?'':'<p class="sub" style="margin:12px 0 0">Lege ein Reiselimit fest, dann rechnet die App aus, was pro Tag frei bleibt.</p>')+'</section>'+
  '<section class="card panel"><h3>Fixkosten</h3><table class="tbl">'+
    b.fixed.map(x=>'<tr><td>'+esc(x.name)+(x.note?'<span class="sub">'+esc(x.note)+'</span>':'')+'</td><td class="r">'+eur(x.amount)+'</td><td class="r"><button type="button" class="ib" data-act="bfedit" data-id="'+x.id+'" aria-label="Bearbeiten">✎</button></td></tr>').join('')+
    state.stays.slice().sort((a,b)=>a.from<b.from?-1:1).map(s=>'<tr><td>'+esc(s.name)+'<span class="sub">'+fmtShort(s.from)+' – '+fmtShort(s.to)+' · '+diffDays(s.from,s.to)+' Nächte</span></td><td class="r">'+eur(s.cost||0)+'</td><td class="r"><button type="button" class="ib" data-act="stayedit" data-id="'+s.id+'" aria-label="Bearbeiten">✎</button></td></tr>').join('')+
    '<tr><td><b>Summe</b></td><td class="r"><b>'+eur(fixedAll)+'</b></td><td></td></tr></table>'+
    '<button class="btn sm" type="button" data-act="bfnew" style="margin-top:10px">Fixkosten hinzufügen</button></section>'+
  '<section class="card panel"><h3>Ausgaben vor Ort</h3>'+
    '<form data-form="qspent"><div class="qexp"><input type="text" id="qs_a" inputmode="decimal" placeholder="Betrag" aria-label="Betrag"><select id="qs_u" aria-label="Währung">'+(SYM()?'<option value="fx">'+esc(SYM())+'</option>':'')+'<option value="€">€</option></select><select id="qs_c" aria-label="Kategorie">'+cats.map(x=>'<option>'+x+'</option>').join('')+'</select><input class="full" type="text" id="qs_n" placeholder="Notiz (optional)" aria-label="Notiz"><button class="btn primary full" type="submit">Ausgabe erfassen</button></div></form>'+
    (b.spent.length?'<table class="tbl">'+b.spent.slice().reverse().map(x=>'<tr><td>'+esc(x.cat)+(x.note?'<span class="sub">'+esc(x.note)+'</span>':'')+'<span class="sub">'+fmtShort(x.date)+'</span></td><td class="r">'+(x.cur==='fx'?nf0.format(x.amount)+' '+esc(SYM()):eur(x.amount))+'<span class="sub">'+(x.cur==='fx'&&b.rate>0?'≈ '+eur(toEur(x.amount,'fx')):'')+'</span></td><td class="r"><button type="button" class="ib" data-act="bsdel" data-id="'+x.id+'" aria-label="Löschen">✕</button></td></tr>').join('')+'</table>':'<div class="empty" style="padding:16px">Noch keine Ausgaben erfasst.</div>')+
    (Object.keys(catSum).length?'<p class="sub" style="margin:10px 0 0">'+Object.keys(catSum).map(k=>esc(k)+' '+eur(catSum[k])).join(' · ')+'</p>':'')+'</section>'+
  '<section class="card panel"><h3>Kosten im Reiseplan</h3>'+
    (plannedRows.length?'<table class="tbl">'+plannedRows.map(r=>'<tr><td><button type="button" class="planned" style="color:var(--ink);text-decoration:none;text-align:left" data-act="gotoplan" data-d="'+r[0]+'">'+esc(r[1].title)+'</button><span class="sub">'+fmtWd(r[0])+(r[1].maybe?' · vielleicht':'')+(r[1].done?' · abgehakt':'')+'</span></td><td class="r">'+esc(costText(r[1]))+'</td></tr>').join('')+'</table>':'<div class="empty" style="padding:16px">Trage bei Einträgen im Reiseplan einen Preis ein, dann erscheinen sie hier.</div>')+'</section></div>';
}

/* ---------- Infos & Notizen ---------- */
function vInfo(){
  const card=i=>'<article class="card info"><h3><span class="stamp sm">'+esc(i.k||'記')+'</span><span style="flex:1;min-width:0">'+esc(i.title)+'</span><button type="button" class="ib" data-act="infoup" data-id="'+i.id+'" aria-label="Nach vorne" title="Nach vorne">↑</button><button type="button" class="ib" data-act="infodown" data-id="'+i.id+'" aria-label="Nach hinten" title="Nach hinten">↓</button><button type="button" class="ib" data-act="infoedit" data-id="'+i.id+'" aria-label="Bearbeiten">✎</button></h3><ul>'+i.items.map(x=>'<li>'+linkify(x)+'</li>').join('')+'</ul></article>';
  return '<div class="toolbar"><button class="btn primary" type="button" data-act="infonew">Neuer Hinweis</button><span class="sub">Eigene Infos zur Reise: Zeit, Geld, Strom, Notfallnummern …</span></div>'+
    (state.infos.length?'<div class="info-grid">'+state.infos.map(card).join('')+'</div>'+(state.infoNote?'<p class="sub" style="margin-top:6px">'+esc(state.infoNote)+'</p>':''):'<div class="empty"><div class="big">知</div>Noch keine Hinweise. Sammle hier, was du unterwegs schnell nachschlagen willst.</div>');
}
function vNotes(){
  return '<div class="toolbar"><button class="btn primary" type="button" data-act="nnew">Neue Notiz</button><span class="sub">Änderungen werden beim Verlassen des Feldes gespeichert.</span></div><div class="info-grid">'+
  state.notes.map(n=>'<article class="card note"><input type="text" data-act="ntitle" data-id="'+n.id+'" value="'+esc(n.title)+'" aria-label="Titel"><textarea data-act="ntext" data-id="'+n.id+'" aria-label="Text">'+esc(n.text)+'</textarea><footer><button type="button" class="btn sm danger" data-act="ndel" data-id="'+n.id+'">Löschen</button></footer></article>').join('')+'</div>'+
  (state.notes.length?'':'<div class="empty"><div class="big">記</div>Noch keine Notizen.</div>');
}

/* ---------- Render ---------- */
function vWelcome(){
  return '<div class="card welcome"><h2>Willkommen bei Toketa Reise</h2><p>'+(sync.user?'Deine Reisen werden geladen. Wenn hier gleich nichts erscheint, lege eine neue Reise an oder lade eine Sicherung.':'Lege deine erste Reise an oder lade eine Sicherung deiner bisherigen Planung.')+'</p><div class="btns"><button class="btn primary" type="button" data-act="tripnew">Neue Reise anlegen</button><button class="btn" type="button" data-act="welcome-import">Sicherung laden</button></div></div>';
}
function render(){
  renderTripBar();renderHero();
  $('#tabs').hidden=!state;
  if(!state){$('#view').innerHTML=vWelcome();setSync();return}
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===ui.tab));
  const fn={plan:vPlan,check:vCheck,wish:vWish,budget:vBudget,info:vInfo,notes:vNotes}[ui.tab]||vPlan;
  $('#view').innerHTML=fn()+'<datalist id="placelist">'+Object.keys(state.places).map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist>';
  setSync();
}

/* ---------- Dialoge ---------- */
let modalCfg=null;
function fieldHTML(f,v){
  const id='f_'+f.k,cls='fld'+(f.w==='2'?' h2c':f.w==='3'?' h3c':'')+(f.type==='check'?' ck':'');
  const lab='<label for="'+id+'">'+esc(f.label)+'</label>';
  let inp='';
  if(f.type==='textarea')inp='<textarea id="'+id+'" placeholder="'+esc(f.ph||'')+'">'+esc(v||'')+'</textarea>';
  else if(f.type==='select')inp='<select id="'+id+'">'+f.opts.map(o=>'<option value="'+esc(o[0])+'"'+(String(o[0])===String(v)?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
  else if(f.type==='check')return '<div class="'+cls+'"><input type="checkbox" id="'+id+'"'+(v?' checked':'')+'>'+lab+'</div>';
  else if(f.type==='color'){inp='<div class="swatches" id="'+id+'">'+COLORS.map(c=>'<label title="'+c[1]+'"><input type="radio" name="'+id+'" value="'+c[0]+'"'+(c[0]===v?' checked':'')+'><span style="--pc:var(--pc-'+c[0]+')"></span></label>').join('')+'</div>';return '<div class="'+cls+'"><label>'+esc(f.label)+'</label>'+inp+'</div>'}
  else{const t=f.type==='number'?'text':f.type;inp='<input type="'+t+'" id="'+id+'"'+(f.type==='number'?' inputmode="decimal"':'')+(f.list?' list="'+f.list+'"':'')+' value="'+esc(v==null?'':v)+'" placeholder="'+esc(f.ph||'')+'">'}
  return '<div class="'+cls+'">'+lab+inp+'</div>';
}
function openForm(cfg){
  modalCfg=cfg;
  const m=$('#modal');
  m.innerHTML='<div class="scrim" data-act="closem"></div><form class="sheet" id="mform" autocomplete="off" data-form="modal"><header><h3>'+esc(cfg.title)+'</h3><button type="button" class="x" data-act="closem" aria-label="Schließen">✕</button></header>'+
    '<div class="fields">'+cfg.fields.map(f=>fieldHTML(f,cfg.values[f.k])).join('')+'</div>'+
    '<footer>'+(cfg.onDelete?'<button type="button" class="btn danger" id="mdel">Löschen</button>':'')+'<span class="sp"></span><button type="button" class="btn ghost" data-act="closem">Abbrechen</button><button class="btn primary" type="submit">'+esc(cfg.save||'Speichern')+'</button></footer></form>';
  m.hidden=false;document.body.classList.add('noscroll');
  const first=m.querySelector('input[type=text],input[type=date],textarea');if(first&&!cfg.noFocus)setTimeout(()=>first.focus(),30);
  const del=document.getElementById('mdel');
  if(del)del.addEventListener('click',()=>{if(del.classList.contains('arm')){const f=cfg.onDelete;closeModal();f()}else{del.classList.add('arm');del.textContent='Wirklich löschen?'}});
}
function openSheet(title,html,wide){
  modalCfg=null;const m=$('#modal');
  m.innerHTML='<div class="scrim" data-act="closem"></div><div class="sheet'+(wide?' wide':'')+'"><header><h3>'+esc(title)+'</h3><button type="button" class="x" data-act="closem" aria-label="Schließen">✕</button></header>'+html+'<footer><span class="sp"></span><button type="button" class="btn ghost" data-act="closem">Schließen</button></footer></div>';
  m.hidden=false;document.body.classList.add('noscroll');
}
function closeModal(){const m=$('#modal');m.hidden=true;m.innerHTML='';modalCfg=null;document.body.classList.remove('noscroll');flushDeferred()}
function readForm(cfg){
  const out={};
  cfg.fields.forEach(f=>{
    if(f.type==='color'){const r=document.querySelector('input[name="f_'+f.k+'"]:checked');out[f.k]=r?r.value:'gray';return}
    const el=document.getElementById('f_'+f.k);
    if(f.type==='check')out[f.k]=el.checked;
    else if(f.type==='number'){const s=el.value.trim().replace(',','.');out[f.k]=s===''?null:(isFinite(Number(s))?Number(s):null)}
    else out[f.k]=el.value.trim();
  });
  return out;
}
const dayOpts=()=>Object.keys(state.days).sort().map(d=>[d,fmtWd(d)+' · '+(dayOf(d).place||'')]);
const curOpts=()=>[['€','€ Euro']].concat(SYM()?[['fx',SYM()]]:[]);
const typeOpts=()=>Object.keys(TYPES).map(t=>[t,TYPES[t][1]]);

function editEntry(d,id,pre){
  const day=dayOf(d),ex=id?day.entries.find(e=>e.id===id):null;
  const v=ex||Object.assign({time:'',end:'',title:'',type:'sight',note:'',cost:null,cur:'€',link:'',maybe:false,done:false},pre||{});
  openForm({title:ex?'Eintrag bearbeiten':'Neuer Eintrag',
    fields:[{k:'title',label:'Titel',type:'text'},{k:'day',label:'Tag',type:'select',opts:dayOpts(),w:'3'},{k:'type',label:'Art',type:'select',opts:typeOpts(),w:'3'},
      {k:'time',label:'Beginn',type:'time',w:'3'},{k:'end',label:'Ende',type:'time',w:'3'},{k:'cost',label:'Preis',type:'number',w:'3',ph:'z. B. 25'},{k:'cur',label:'Währung',type:'select',opts:curOpts(),w:'3'},
      {k:'link',label:'Link',type:'url',ph:'https://…'},{k:'note',label:'Notiz',type:'textarea'},{k:'maybe',label:'Nur vielleicht (optional)',type:'check',w:'3'},{k:'done',label:'Erledigt',type:'check',w:'3'}],
    values:Object.assign({},v,{day:d}),
    onDelete:ex?()=>{day.entries=day.entries.filter(e=>e.id!==id);unplanLink(id);commit();toast('Eintrag gelöscht')}:null,
    save:ex?'Speichern':'Hinzufügen',
    onSave(o){
      if(!o.title){toast('Bitte einen Titel eingeben');return false}
      if(o.link&&!safeUrl(o.link))o.link='https://'+o.link;
      const to=o.day;delete o.day;
      if(ex){Object.assign(ex,o);if(to!==d){day.entries=day.entries.filter(e=>e!==ex);insertEntry(to,ex)}}
      else insertEntry(to,Object.assign({id:uid()},o));
      ui.sel=to;saveUi();commit();return true;
    }});
}
function insertEntry(d,e){
  const list=dayOf(d).entries;
  if(e.time){const i=list.findIndex(x=>x.time&&x.time>e.time);if(i>=0){list.splice(i,0,e);return}}
  list.push(e);
}
function unplanLink(entryId){state.todos.forEach(t=>{if(t.plan&&t.plan.entry===entryId)t.plan=null})}

function editDay(d){
  const day=dayOf(d);
  openForm({title:fmtLong(d),fields:[{k:'place',label:'Ort / Etappe',type:'text',list:'placelist',ph:'z. B. Rom'},{k:'color',label:'Farbe dieses Ortes',type:'color'},{k:'hol',label:'Feiertag / besonderer Tag (optional)',type:'text',ph:'z. B. Feiertag: Allerheiligen'},{k:'note',label:'Tagesnotiz',type:'textarea',ph:'z. B. Check-in ab 15 Uhr, Wetter prüfen …'}],
    values:{place:day.place,color:colorOf(day.place),hol:HOL[d]||'',note:day.note},
    onSave(o){const p=o.place;if(!state.days[d])state.days[d]={place:'',note:'',entries:[]};state.days[d].place=p;state.days[d].note=o.note;if(p)state.places[p]=o.color;if(o.hol)state.holidays[d]=o.hol;else delete state.holidays[d];commit();return true}});
}
function editStay(id){
  const ex=id?state.stays.find(s=>s.id===id):null;
  openForm({title:ex?'Unterkunft bearbeiten':'Neue Unterkunft',
    fields:[{k:'name',label:'Name',type:'text'},{k:'from',label:'Check-in',type:'date',w:'3'},{k:'to',label:'Check-out',type:'date',w:'3'},{k:'cost',label:'Gesamtpreis in €',type:'number',w:'3'},{k:'link',label:'Link',type:'url',w:'3',ph:'https://…'},{k:'note',label:'Notiz (Adresse, Check-in-Zeit …)',type:'textarea'}],
    values:ex||{name:'',from:ui.sel,to:addDays(ui.sel,1),cost:null,link:'',note:''},
    onDelete:ex?()=>{state.stays=state.stays.filter(s=>s.id!==id);commit()}:null,
    onSave(o){if(!o.name||!o.from||!o.to){toast('Name, Check-in und Check-out ausfüllen');return false}
      if(o.to<=o.from){toast('Check-out muss nach Check-in liegen');return false}
      if(o.link&&!safeUrl(o.link))o.link='https://'+o.link;
      if(ex)Object.assign(ex,o);else state.stays.push(Object.assign({id:uid()},o));commit();return true}});
}
function editCheckItem(gid,iid){
  const g=state.check.find(x=>x.id===gid),it=g.items.find(x=>x.id===iid);
  openForm({title:'Punkt bearbeiten',fields:[{k:'t',label:'Text',type:'text'},{k:'due',label:'Fällig bis',type:'date',w:'3'},{k:'g',label:'Kategorie',type:'select',opts:state.check.map(x=>[x.id,x.name]),w:'3'},{k:'note',label:'Notiz',type:'textarea'}],
    values:{t:it.t,due:it.due||'',g:gid,note:it.note||''},
    onDelete:()=>{g.items=g.items.filter(x=>x!==it);commit()},
    onSave(o){if(!o.t){toast('Text fehlt');return false}it.t=o.t;it.due=o.due;it.note=o.note;
      if(o.g!==gid){g.items=g.items.filter(x=>x!==it);state.check.find(x=>x.id===o.g).items.push(it)}commit();return true}});
}
function editGroup(gid){
  const ex=gid?state.check.find(x=>x.id===gid):null;
  openForm({title:ex?'Kategorie bearbeiten':'Neue Kategorie',fields:[{k:'name',label:'Name',type:'text'},{k:'phase',label:'Bereich',type:'select',opts:Object.keys(PHASES).map(p=>[p,PHASES[p][1]])}],
    values:ex||{name:'',phase:ui.phase==='all'?'prep':ui.phase},
    onDelete:ex?()=>{state.check=state.check.filter(x=>x!==ex);commit()}:null,
    onSave(o){if(!o.name){toast('Name fehlt');return false}if(ex)Object.assign(ex,o);else state.check.push({id:uid(),name:o.name,phase:o.phase,items:[]});commit();return true}});
}
function editTodo(id){
  const t=state.todos.find(x=>x.id===id),before=t.kind==='before';
  openForm({title:before?'Todo bearbeiten':'Idee bearbeiten',
    fields:[{k:'text',label:'Titel',type:'text'},
      before?{k:'cat',label:'Art',type:'select',opts:Object.keys(BEFORE_CATS).map(c=>[c,BEFORE_CATS[c][1]]),w:'3'}:{k:'cat',label:'Kategorie',type:'select',opts:IDEA_CATS.map(c=>[c,TYPES[c][1]]),w:'3'},
      before?{k:'due',label:'Fällig bis',type:'date',w:'3'}:{k:'place',label:'Ort',type:'text',list:'placelist',w:'3'},
      {k:'cost',label:'Preis',type:'number',w:'3'},{k:'cur',label:'Währung',type:'select',opts:curOpts(),w:'3'},
      {k:'link',label:'Link',type:'url',ph:'https://…'},{k:'note',label:'Notiz',type:'textarea'}],
    values:t,onDelete:()=>{state.todos=state.todos.filter(x=>x!==t);commit()},
    onSave(o){if(!o.text){toast('Titel fehlt');return false}if(o.link&&!safeUrl(o.link))o.link='https://'+o.link;Object.assign(t,o);commit();return true}});
}
function planIdea(id,day){
  const t=state.todos.find(x=>x.id===id);
  openForm({title:'Einplanen: '+t.text,fields:[{k:'day',label:'Tag',type:'select',opts:dayOpts(),w:'3'},{k:'time',label:'Uhrzeit (optional)',type:'time',w:'3'}],
    values:{day:day||ui.sel,time:''},save:'In den Tag legen',
    onSave(o){
      const e={id:uid(),time:o.time,end:'',title:t.text,type:t.cat,note:t.note,cost:t.cost,cur:t.cur,link:t.link,done:false,maybe:false};
      insertEntry(o.day,e);t.plan={day:o.day,entry:e.id};ui.sel=o.day;ui.tab='plan';saveUi();commit();toast('Eingeplant: '+fmtWd(o.day));return true}});
}
function pickIdea(d){
  const place=dayOf(d).place;
  const list=state.todos.filter(t=>t.kind==='japan'&&!t.plan&&!t.done).sort((a,b)=>((b.place===place)-(a.place===place))||((b.prio==='must')-(a.prio==='must')));
  openSheet('Idee für '+fmtWd(d)+' wählen','<div class="pick-h"><input type="text" id="pk_s" placeholder="Suchen …" aria-label="Suchen"></div><div class="pick" id="pk">'+
    (list.length?list.map(t=>'<button type="button" data-act="idea-plan2" data-id="'+t.id+'" data-d="'+d+'" data-s="'+esc((t.text+' '+t.place+' '+t.note).toLowerCase())+'"><span class="stamp sm">'+(TYPES[t.cat]||TYPES.other)[0]+'</span><span class="nm">'+(t.prio==='must'?'★ ':'')+esc(t.text)+'</span>'+(t.place?'<span class="pill" style="--pc:var(--pc-'+colorOf(t.place)+')">'+esc(t.place)+'</span>':'')+'</button>').join(''):'<div class="empty">Der Ideen-Pool ist leer oder alles ist schon eingeplant.</div>')+'</div>',true);
}
function editFixed(id){
  const ex=id?state.budget.fixed.find(x=>x.id===id):null;
  openForm({title:ex?'Fixkosten bearbeiten':'Neue Fixkosten',fields:[{k:'name',label:'Bezeichnung',type:'text'},{k:'amount',label:'Betrag in €',type:'number',w:'3'},{k:'note',label:'Notiz',type:'text',w:'3'}],
    values:ex||{name:'',amount:null,note:''},onDelete:ex?()=>{state.budget.fixed=state.budget.fixed.filter(x=>x!==ex);commit()}:null,
    onSave(o){if(!o.name||o.amount==null){toast('Bezeichnung und Betrag ausfüllen');return false}if(ex)Object.assign(ex,o);else state.budget.fixed.push(Object.assign({id:uid()},o));commit();return true}});
}
function editBudget(){
  openForm({title:'Limit und Wechselkurs',fields:[{k:'limit',label:'Reiselimit in €',type:'number',w:'3'},{k:'sym',label:'Fremdwährung (Symbol, optional)',type:'text',w:'3',ph:'z. B. ¥, $, £'},{k:'rate',label:'Kurs: Fremdwährung pro 1 €',type:'number',w:'3',ph:'z. B. 175'}],
    values:state.budget,onSave(o){
      if(o.limit==null||o.limit<0){toast('Bitte ein Limit eingeben (0 = keins)');return false}
      if(o.sym&&!(o.rate>0)){toast('Für die Fremdwährung fehlt der Kurs');return false}
      state.budget.limit=o.limit;state.budget.sym=o.sym||'';state.budget.rate=o.sym?o.rate:(state.budget.rate||1);commit();return true}});
}

/* ---------- Sortieren / Verschieben ---------- */
function moveEntry(from,id,to,beforeId){
  const src=dayOf(from).entries,i=src.findIndex(e=>e.id===id);if(i<0)return;
  const e=src.splice(i,1)[0],dst=dayOf(to).entries;
  let j=beforeId?dst.findIndex(x=>x.id===beforeId):-1;
  if(j<0)dst.push(e);else dst.splice(j,0,e);
  state.todos.forEach(t=>{if(t.plan&&t.plan.entry===id)t.plan.day=to});
  commit();
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click',ev=>{
  const ext=ev.target.closest&&ev.target.closest('a[target=_blank]');
  if(ext&&isNative()){ev.preventDefault();openExternal(ext.href);return}
  const tabEl=ev.target.closest('[data-tab]');
  if(tabEl){ui.tab=tabEl.dataset.tab;saveUi();render();window.scrollTo({top:0});return}
  const el=ev.target.closest('[data-act]');if(!el)return;
  const a=el.dataset.act,d=el.dataset.d,id=el.dataset.id;
  if(a==='closem'){closeModal();return}
  if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')return;
  switch(a){
    case'tripnew':editTrip(false);break;
    case'tripedit':editTrip(true);break;
    case'infonew':editInfo(null);break;
    case'infoedit':editInfo(id);break;
    case'infoup':case'infodown':moveIn(state.infos,x=>x.id===id,a==='infoup'?-1:1);break;
    case'gup':case'gdown':moveIn(state.check,x=>x.id===el.dataset.g,a==='gup'?-1:1,g=>ui.phase==='all'||g.phase===ui.phase);break;
    case'menu':openMenu();break;
    case'm-theme':ui.theme=el.dataset.v;saveUi();applyTheme();openMenu();break;
    case'm-design':if(!el.disabled){ui.design=el.dataset.v;saveUi();openMenu()}break;
    case'm-login':menuLogin(el);break;
    case'm-tripedit':closeModal();editTrip(true);break;
    case'm-tripnew':closeModal();editTrip(false);break;
    case'm-export':closeModal();doExport();break;
    case'm-import':closeModal();$('#impFile').click();break;
    case'm-upd':menuCheckUpdate(el);break;
    case'm-auto':ui.autoUpd=!ui.autoUpd;saveUi();openMenu();break;
    case'm-repo':openExternal('https://github.com/toketa-ghub/toketa-reise');break;
    case'welcome-import':$('#impFile').click();break;
    case'selday':ui.sel=d;saveUi();render();if(innerWidth<=1040)document.getElementById('daycard').scrollIntoView({behavior:'smooth',block:'start'});break;
    case'gotoplan':ui.tab='plan';ui.sel=d;saveUi();render();window.scrollTo({top:0});break;
    case'edone':{const e=dayOf(d).entries.find(x=>x.id===id);e.done=!e.done;commit();break}
    case'eup':case'edown':{const l=dayOf(d).entries,i=l.findIndex(x=>x.id===id),j=a==='eup'?i-1:i+1;if(j<0||j>=l.length)break;const t=l[i];l[i]=l[j];l[j]=t;commit();break}
    case'eedit':editEntry(d,id);break;
    case'eadd':editEntry(d,null);break;
    case'esort':{const l=dayOf(d).entries;const un=l.filter(e=>!e.time),ti=l.filter(e=>e.time).sort((x,y)=>x.time<y.time?-1:x.time>y.time?1:0);state.days[d].entries=un.concat(ti);commit();toast('Nach Uhrzeit sortiert');break}
    case'dayedit':editDay(d);break;
    case'staynew':editStay(null);break;
    case'stayedit':editStay(id);break;
    case'idea-pick':pickIdea(d);break;
    case'idea-plan':planIdea(id,null);break;
    case'idea-plan2':closeModal();planIdea(id,d);break;
    case'phase':ui.phase=el.dataset.v;saveUi();render();break;
    case'ctoggle':{const g=state.check.find(x=>x.id===el.dataset.g),it=g.items.find(x=>x.id===el.dataset.i);it.done=!it.done;commit();break}
    case'cedit':editCheckItem(el.dataset.g,el.dataset.i);break;
    case'gedit':editGroup(el.dataset.g);break;
    case'gnew':editGroup(null);break;
    case'wkind':ui.wish=el.dataset.v;saveUi();render();break;
    case'wcat':ui.wcat=el.dataset.v;saveUi();render();break;
    case'wdone':{const t=state.todos.find(x=>x.id===id);t.done=!t.done;commit();break}
    case'wstar':{const t=state.todos.find(x=>x.id===id);t.prio=t.prio==='must'?'':'must';commit();break}
    case'wedit':editTodo(id);break;
    case'bsettings':editBudget();break;
    case'bfedit':editFixed(id);break;
    case'bfnew':editFixed(null);break;
    case'bsdel':state.budget.spent=state.budget.spent.filter(x=>x.id!==id);commit();break;
    case'nnew':state.notes.unshift({id:uid(),title:'Neue Notiz',text:''});commit();break;
    case'ndel':{if(el.classList.contains('arm')){state.notes=state.notes.filter(x=>x.id!==id);commit()}else{el.classList.add('arm');el.textContent='Wirklich löschen?'}break}
  }
});
document.addEventListener('change',ev=>{
  const el=ev.target,a=el.dataset&&el.dataset.act;
  if(a==='onlyopen'){ui.onlyOpen=el.checked;saveUi();render()}
  else if(a==='ntitle'||a==='ntext'){const n=state.notes.find(x=>x.id===el.dataset.id);if(n){if(a==='ntitle')n.title=el.value;else n.text=el.value;persist()}}
  else if(el.id==='wplace'){ui.wplace=el.value;saveUi();render()}
});
document.addEventListener('input',ev=>{
  const el=ev.target;
  if(el.id==='wsearch'||el.id==='pk_s'){
    const q=el.value.trim().toLowerCase(),box=el.id==='wsearch'?document.querySelectorAll('#ideas .idea'):document.querySelectorAll('#pk button');
    box.forEach(c=>{c.hidden=q&&c.dataset.s.indexOf(q)<0});
  }
});
document.addEventListener('submit',ev=>{
  const f=ev.target,k=f.dataset.form;if(!k)return;ev.preventDefault();
  if(k==='modal'){if(modalCfg){const o=readForm(modalCfg);if(modalCfg.onSave(o)!==false)closeModal()}return}
  if(k==='qday'){const t=document.getElementById('q_title').value.trim();if(!t){document.getElementById('q_title').focus();return}
    const d=f.dataset.d;insertEntry(d,{id:uid(),time:document.getElementById('q_time').value,end:'',title:t,type:document.getElementById('q_type').value,note:'',cost:null,cur:'€',link:'',done:false,maybe:false});commit('q_title');return}
  if(k==='qcheck'){const inp=document.getElementById('ac_'+f.dataset.g),t=inp.value.trim();if(!t)return;state.check.find(g=>g.id===f.dataset.g).items.push({id:uid(),t,done:false});commit('ac_'+f.dataset.g);return}
  if(k==='qbefore'){const t=document.getElementById('qb_t').value.trim();if(!t)return;state.todos.push({id:uid(),kind:'before',text:t,cat:document.getElementById('qb_c').value,place:'',note:'',prio:'',link:'',cost:null,cur:'€',done:false,plan:null,isNew:false,due:''});commit('qb_t');return}
  if(k==='qjapan'){const t=document.getElementById('qj_t').value.trim();if(!t)return;const p=document.getElementById('qj_p').value.trim();
    if(p&&!state.places[p])state.places[p]='gray';
    state.todos.push({id:uid(),kind:'japan',text:t,cat:document.getElementById('qj_c').value,place:p,note:'',prio:'',link:'',cost:null,cur:'€',done:false,plan:null,isNew:false});commit('qj_t');return}
  if(k==='qspent'){const s=document.getElementById('qs_a').value.trim().replace(',','.'),a=Number(s);if(!s||!isFinite(a)||a<=0){document.getElementById('qs_a').focus();toast('Betrag eingeben');return}
    state.budget.spent.push({id:uid(),date:TODAY,amount:a,cur:document.getElementById('qs_u').value,cat:document.getElementById('qs_c').value,note:document.getElementById('qs_n').value.trim()});commit('qs_a');return}
});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#modal').hidden)closeModal()});

/* Drag & Drop: Einträge umsortieren oder auf einen Kalendertag ziehen */
let drag=null;
document.addEventListener('dragstart',ev=>{const li=ev.target.closest&&ev.target.closest('.entry');if(!li)return;drag={d:li.dataset.d,id:li.dataset.id};li.classList.add('dragging');try{ev.dataTransfer.setData('text/plain',drag.id);ev.dataTransfer.effectAllowed='move'}catch(e){}});
document.addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.dragging,.over-t,.over-b,.dropt').forEach(x=>x.classList.remove('dragging','over-t','over-b','dropt'))});
document.addEventListener('dragover',ev=>{
  if(!drag)return;
  const tile=ev.target.closest('.tile[data-d]'),li=ev.target.closest('.entry'),tl=ev.target.closest('.tl');
  document.querySelectorAll('.over-t,.over-b,.dropt').forEach(x=>x.classList.remove('over-t','over-b','dropt'));
  if(tile){ev.preventDefault();tile.classList.add('dropt')}
  else if(li&&li.dataset.id!==drag.id){ev.preventDefault();const r=li.getBoundingClientRect();li.classList.add(ev.clientY<r.top+r.height/2?'over-t':'over-b')}
  else if(tl)ev.preventDefault();
});
document.addEventListener('drop',ev=>{
  if(!drag)return;
  const tile=ev.target.closest('.tile[data-d]'),li=ev.target.closest('.entry'),tl=ev.target.closest('.tl');
  const from=drag,top=li&&li.classList.contains('over-t');
  if(tile){ev.preventDefault();drag=null;if(tile.dataset.d!==from.d){moveEntry(from.d,from.id,tile.dataset.d,null);toast('Verschoben auf '+fmtWd(tile.dataset.d))}}
  else if(li&&li.dataset.id!==from.id){ev.preventDefault();drag=null;
    let before=li.dataset.id;if(!top){const nx=li.nextElementSibling;before=nx?nx.dataset.id:null}
    moveEntry(from.d,from.id,li.dataset.d,before)}
  else if(tl){ev.preventDefault();drag=null;moveEntry(from.d,from.id,tl.dataset.d,null)}
});


/* ---------- Reisen verwalten ---------- */
function renderTripBar(){
  const sel=$('#tripSel');if(!sel)return;
  const ids=Object.keys(store.trips).sort((a,b)=>(store.trips[a].state.trip.start||'')<(store.trips[b].state.trip.start||'')?-1:1);
  sel.innerHTML=ids.map(id=>'<option value="'+esc(id)+'"'+(id===store.active?' selected':'')+'>'+esc(store.trips[id].state.trip.name)+'</option>').join('')+'<option value="__new">＋ Neue Reise …</option>';
  sel.value=store.active&&store.trips[store.active]?store.active:'__new';
}
function switchTrip(id){
  if(!store.trips[id])return;
  store.active=id;saveStore(store);bind();ui.sel=defaultSel();ui.tab='plan';saveUi();render();window.scrollTo({top:0});
}
function editTrip(isEdit){
  const t=isEdit?TRIP:{name:'',kicker:'',start:TODAY,end:addDays(TODAY,13),day1:TODAY,home:addDays(TODAY,13)};
  const fields=[{k:'name',label:'Name der Reise',type:'text',ph:'z. B. Italien 2027'},{k:'kicker',label:'Untertitel (optional)',type:'text',ph:'z. B. Rom · Florenz · Neapel'},
    {k:'start',label:'Abreise',type:'date',w:'3'},{k:'end',label:'Rückkehr',type:'date',w:'3'}];
  if(isEdit)fields.push({k:'day1',label:'Reisetag 1 (Ankunft)',type:'date',w:'3'},{k:'home',label:'Heimreisetag',type:'date',w:'3'});
  openForm({title:isEdit?'Reise bearbeiten':'Neue Reise',fields,values:t,save:isEdit?'Speichern':'Anlegen',
    onDelete:isEdit?()=>deleteTrip():null,
    onSave(o){
      if(!o.name){toast('Bitte einen Namen eingeben');return false}
      if(!o.start||!o.end||o.end<o.start){toast('Rückkehr muss am oder nach dem Abreisetag liegen');return false}
      if(!isEdit){
        const id=uid();store.trips[id]={id,rev:0,state:newTripState(o)};store.active=id;bind();ui.sel=defaultSel();ui.tab='plan';saveUi();commit();toast('Reise angelegt');return true;
      }
      const clamp=d=>d<o.start?o.start:d>o.end?o.end:d;
      Object.assign(TRIP,{name:o.name,kicker:o.kicker,start:o.start,end:o.end,day1:clamp(o.day1||o.start),home:clamp(o.home||o.end)});
      for(let d=o.start;d<=o.end;d=addDays(d,1))if(!state.days[d])state.days[d]={place:'',note:'',entries:[]};
      if(ui.sel<o.start||ui.sel>o.end)ui.sel=defaultSel();
      commit();return true;
    }});
}
function deleteTrip(){
  const id=store.active;if(!id)return;
  clearTimeout(timers[id]);delete pending[id];delete store.trips[id];
  store.active=Object.keys(store.trips)[0]||null;bind();ui.sel=state?defaultSel():null;saveStore(store);
  if(sync.user)removeTrip(id).catch(()=>setSync('err'));
  render();toast('Reise gelöscht');
}
function editInfo(id){
  const ex=id?state.infos.find(x=>x.id===id):null;
  openForm({title:ex?'Hinweis bearbeiten':'Neuer Hinweis',
    fields:[{k:'title',label:'Titel',type:'text',ph:'z. B. Geld, Strom, Notfall'},{k:'k',label:'Symbol (ein Zeichen)',type:'text',w:'3',ph:'z. B. 円 oder ★'},{k:'text',label:'Punkte (eine Zeile pro Punkt)',type:'textarea'}],
    values:ex?{title:ex.title,k:ex.k,text:ex.items.join('\n')}:{title:'',k:'',text:''},
    onDelete:ex?()=>{state.infos=state.infos.filter(x=>x!==ex);commit()}:null,
    onSave(o){
      if(!o.title){toast('Titel fehlt');return false}
      const items=o.text.split('\n').map(x=>x.trim()).filter(Boolean),k=Array.from(o.k||'')[0]||'記';
      if(ex){ex.title=o.title;ex.k=k;ex.items=items}else state.infos.push({id:uid(),title:o.title,k,items});
      commit();return true;
    }});
}


/* Reihenfolge ändern: tauscht mit dem sichtbaren Nachbarn (Filter beachten) */
function moveIn(list,match,dir,visible){
  const i=list.findIndex(match);if(i<0)return;
  let j=i+dir;
  while(j>=0&&j<list.length&&visible&&!visible(list[j]))j+=dir;
  if(j<0||j>=list.length){toast(dir<0?'Schon ganz oben':'Schon ganz unten');return}
  const t=list[i];list[i]=list[j];list[j]=t;commit();
}

/* ---------- Menü ---------- */
const DESIGNS=[['toketa','Toketa','Elektroblau, Lavendel und Nachtschwarz']];
let updInfo=null;
function openMenu(){
  const dark=document.documentElement.dataset.theme==='dark'||(!ui.theme&&matchMedia('(prefers-color-scheme: dark)').matches);
  const th=(v,l)=>'<button type="button" class="'+(ui.theme===v?'on':'')+'" data-act="m-theme" data-v="'+v+'">'+l+'</button>';
  const web=platform()==='web';
  const row=(act,t,s,extra)=>'<button type="button" class="mrow" data-act="'+act+'"'+(extra||'')+'><span><b>'+t+'</b>'+(s?'<small>'+s+'</small>':'')+'</span><i>›</i></button>';
  const html='<div class="menu">'+
    '<section><h4>Aussehen</h4>'+
      '<div class="designs">'+DESIGNS.map(d=>'<button type="button" class="dz'+(ui.design===d[0]?' on':'')+'" data-act="m-design" data-v="'+d[0]+'"><span class="sw"><i style="background:#2457FF"></i><i style="background:#B9A6FF"></i><i style="background:#0B0B12"></i></span><b>'+d[1]+'</b><small>'+d[2]+'</small></button>').join('')+
      '<div class="dz soon"><span class="sw"><i></i><i></i><i></i></span><b>Weitere Designs</b><small>Folgen in späteren Versionen</small></div></div>'+
      '<div class="seg" role="group" aria-label="Helligkeit">'+th('','Automatisch')+th('light','Hell')+th('dark','Dunkel')+'</div></section>'+
    '<section><h4>Reise</h4>'+
      (state?row('m-tripedit','Reise bearbeiten',esc(TRIP.name||'')):'')+
      row('m-tripnew','Neue Reise anlegen','')+
      (state?row('m-export','Sicherung speichern','Alle Daten dieser Reise als Datei'):'')+
      row('m-import','Sicherung laden','Reise aus einer Datei wiederherstellen')+'</section>'+
    '<section><h4>Konto und Abgleich</h4>'+
      '<div class="mnote">'+(sync.user?'Angemeldet als <b>'+esc(sync.user.email)+'</b>. Deine Reisen werden auf allen Geräten abgeglichen.':'Nicht angemeldet. Deine Reisen liegen nur auf diesem Gerät.')+'</div>'+
      row('m-login',sync.user?'Abmelden':'Anmelden',sync.user?'Die Reisen bleiben auf diesem Gerät':'Für den Abgleich zwischen Handy und PC')+'</section>'+
    (web?'':'<section><h4>Updates</h4>'+
      '<div class="mnote" id="updNote">Installiert: Version <b>'+esc(versionText())+'</b>'+(updInfo&&updInfo.status==='new'?' · <b class="hotx">Update '+esc(updInfo.name)+' verfügbar</b>':'')+'</div>'+
      row('m-upd',updInfo&&updInfo.status==='new'?'Update '+esc(updInfo.name)+' installieren':'Nach Updates suchen','')+
      '<label class="mrow tog" data-act="m-auto"><span><b>Beim Start automatisch suchen</b><small>Zeigt dir unten ein Banner, wenn es etwas Neues gibt</small></span><span class="sw2'+(ui.autoUpd?' on':'')+'"></span></label></section>')+
    '<section><h4>Über Toketa Reise</h4>'+
      '<div class="mnote">Version '+esc(versionText())+' · Quellcode zur Ansicht, Nutzung privat und kostenlos. Weitergabe nur mit Erlaubnis.</div>'+
      row('m-repo','Projektseite öffnen','github.com/toketa-ghub/toketa-reise')+'</section></div>';
  const m=$('#modal');const had=!m.hidden&&m.querySelector('.menu');
  const sc=had?m.querySelector('.sheet').scrollTop:0;
  openSheet('Menü',html,false);
  if(had)m.querySelector('.sheet').scrollTop=sc;
}
async function menuLogin(el){
  if(!sync.user){closeModal();ui.skipLogin=false;saveUi();showLogin();return}
  if(el.classList.contains('arm')){try{await fbLogout();closeModal();toast('Abgemeldet. Die Reisen bleiben auf diesem Gerät.')}catch(x){toast('Abmelden fehlgeschlagen')}}
  else{el.classList.add('arm');el.querySelector('b').textContent='Wirklich abmelden?';setTimeout(()=>{if(el.isConnected){el.classList.remove('arm');el.querySelector('b').textContent='Abmelden'}},4000)}
}
async function menuCheckUpdate(el){
  if(updInfo&&updInfo.status==='new'){closeModal();showUpdate(updInfo);return}
  el.querySelector('b').textContent='Suche …';
  const u=await runCheck(true,toast,x=>{updInfo=x});
  if(u)updInfo=u;
  if(u&&u.status==='new')closeModal();else openMenu();
}

/* ---------- Sicherung, Anmeldung, Theme, Start ---------- */
async function saveFile(name,text){
  try{await saveTextFile(name,text)}catch(e){toast('Speichern nicht möglich')}
}
function doExport(){if(!state){toast('Es gibt noch keine Reise');return}
  const nm=(TRIP.name||'reise').toLowerCase().replace(/[^a-z0-9äöüß]+/g,'-').replace(/^-|-$/g,'');
  saveFile('toketa-reise-'+nm+'-'+TODAY+'.json',JSON.stringify(state,null,1))}
$('#impFile').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{
    const raw=JSON.parse(r.result),isV1=!(raw.trip&&raw.trip.name);
    const jp=isV1&&raw.trip&&raw.trip.start==='2026-10-24'?JSON.parse(JSON.stringify(JAPAN_V1)):{};
    const s=migrate(raw,jp);s.rev=0;
    const id=uid();store.trips[id]={id,rev:0,state:s};store.active=id;bind();ui.sel=defaultSel();ui.tab='plan';saveUi();commit();toast('Reise geladen: '+s.trip.name);
  }catch(x){toast('Datei nicht lesbar')}};
  r.readAsText(f);e.target.value='';
});
$('#tripSel').addEventListener('change',e=>{
  const v=e.target.value;
  if(v==='__new'){renderTripBar();editTrip(false)}else switchTrip(v);
});
function applyTheme(){
  const r=document.documentElement;
  if(ui.theme)r.dataset.theme=ui.theme;else delete r.dataset.theme;
  const dark=ui.theme?ui.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  const m=document.querySelector('meta[name=color-scheme]');if(m)m.content=dark?'dark light':'light dark';
}
$('#menuBtn').addEventListener('click',openMenu);

/* Anmeldung */
function showLogin(msg){$('#login').hidden=false;const m=$('#lmsg');m.className='msg';m.textContent=msg||''}
function hideLogin(){$('#login').hidden=true;$('#lpw').value=''}
$('#lform').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const email=$('#lmail').value.trim(),pw=$('#lpw').value,m=$('#lmsg');
  if(!email||!pw){m.className='msg';m.textContent='Bitte E-Mail und Passwort eingeben.';return}
  const b=$('#lgo');b.disabled=true;m.className='msg ok';m.textContent='Anmelden …';
  try{await fbLogin(email,pw);m.textContent=''}catch(e){m.className='msg';m.textContent=authMessage(e)}
  b.disabled=false;
});
$('#lreset').addEventListener('click',async()=>{
  const email=$('#lmail').value.trim(),m=$('#lmsg');
  if(!email){m.className='msg';m.textContent='Trage oben deine E-Mail ein, dann kommt der Link per Mail.';return}
  try{await resetPassword(email);m.className='msg ok';m.textContent='Wenn es dieses Konto gibt, ist eine Mail zum Zurücksetzen unterwegs.'}catch(e){m.className='msg';m.textContent=authMessage(e)}
});
$('#lskip').addEventListener('click',()=>{ui.skipLogin=true;saveUi();hideLogin();render()});
function onBack(){
  if(modalOpen()){closeModal();return true}
  if(!$('#login').hidden)return false;
  if(state&&ui.tab!=='plan'){ui.tab='plan';saveUi();render();return true}
  return false;
}

/* Start */
bind();
if(state&&(!ui.sel||!state.days[ui.sel]))ui.sel=defaultSel();
if(!['plan','check','wish','budget','info','notes'].includes(ui.tab))ui.tab='plan';
applyTheme();
render();setSync('local');
setupNative({onBack});
initUpdates(toast,()=>ui.autoUpd!==false,u=>{updInfo=u});
try{
  initSync({
    onUser(u){sync.user=u;sync.ready=true;if(u){hideLogin();setSync('saving')}else if(!ui.skipLogin)showLogin();setSync();render()},
    onStatus(m,e){if(!sync.user)return;if(m==='ok'&&Object.keys(pending).length)m='saving';setSync(m,e)},
    onTrip:onRemoteTrip,onRemove:onRemoteRemove,onSnapshotDone
  });
}catch(e){setSync('local');showLogin('Die Anmeldung ist hier gerade nicht verfügbar. Du kannst die App trotzdem lokal nutzen.')}
