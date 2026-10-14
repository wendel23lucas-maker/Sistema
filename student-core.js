
// ─── DATA ───────────────────────────────────────────────
const TREINOS={};
const SCHED={'1-2':Array(7).fill('CARDIO'),'3-6':Array(7).fill('CARDIO'),'7-9':Array(7).fill('CARDIO'),'10-12':Array(7).fill('CARDIO')};
const CARDIO={'1-2':'','3-6':'','7-9':'','10-12':''};
const MEALS=[];
window.blackfitApplyPlans(TREINOS,MEALS,SCHED,CARDIO);

// ─── STATE ──────────────────────────────────────────────
const DEF = {water:0,calories:0,week:'1-2',treino:'A',weights:[],photos:[],photosByDay:{},photosByWeek:{},photoProgramStart:null,collapsed:{},calData:{},exChecks:{},offDiet:{},loads:{},lastActiveDay:null,lastViewedDay:null};
let S = DEF;


/* ===== MODO DIA SELECIONADO — AGENDA CONTROLA AS TELAS PRINCIPAIS ===== */
function bfISODate(date){
  const d=new Date(date);
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function bfDateFromKey(key){
  const [y,m,d]=String(key||bfISODate(new Date())).split('-').map(Number);
  return new Date(y,(m||1)-1,d||1);
}
let selectedDayKey = bfISODate(new Date());
function currentDayKey(){ return selectedDayKey || bfISODate(new Date()); }
function ensureDayRecord(key=currentDayKey()){
  if(!S.calData) S.calData={};
  if(!S.calData[key]) S.calData[key]={water:0,calories:0,peso:0,cardio:0,treino:false};
  return S.calData[key];
}
function checkKeyFromISO(key=currentDayKey()){
  const [y,m,d]=String(key).split('-');
  return 'checks_'+y+'_'+m+'_'+d;
}
function loadKeyFromISO(key=currentDayKey()){
  const [y,m,d]=String(key).split('-');
  return 'loads_'+y+'_'+m+'_'+d;
}
function weightForDay(key=currentDayKey()){
  if(!S.weights) return null;
  const found=S.weights.find(w=>w.iso===key || bfISODate(w.ts||new Date())===key || dateBRToISO(w.date)===key);
  return found?found.kg:null;
}
function dateBRToISO(br){
  const m=String(br||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:null;
}
function dayDiff(aKey,bKey){
  const a=bfDateFromKey(aKey), b=bfDateFromKey(bKey);
  a.setHours(12,0,0,0); b.setHours(12,0,0,0);
  return Math.floor((b-a)/(24*60*60*1000));
}
function ensurePhotoProgramStart(dayKey=bfISODate(new Date())){
  if(!S.photoProgramStart) S.photoProgramStart=dayKey;
  return S.photoProgramStart;
}
function photoWeekNumber(dayKey=currentDayKey()){
  if(!S.photoProgramStart) return 1;
  const diff=dayDiff(S.photoProgramStart,dayKey);
  return Math.max(1,Math.floor(Math.max(0,diff)/7)+1);
}
function photoWeekStartKey(dayKey=currentDayKey()){
  if(!S.photoProgramStart) return dayKey;
  const start=bfDateFromKey(S.photoProgramStart);
  const n=photoWeekNumber(dayKey);
  start.setDate(start.getDate()+((n-1)*7));
  return bfISODate(start);
}
function photoWeekEndKey(weekKey){
  const d=bfDateFromKey(weekKey);d.setDate(d.getDate()+6);return bfISODate(d);
}
function photoWeekLabel(dayKey=currentDayKey()){
  if(!S.photoProgramStart) return 'Semana 1 · começa na primeira foto';
  const week=photoWeekNumber(dayKey);
  const start=bfDateFromKey(photoWeekStartKey(dayKey));
  const end=new Date(start);end.setDate(end.getDate()+6);
  return `Semana ${week} · ${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`;
}
function photoWeekProgress(dayKey=bfISODate(new Date())){
  if(!S.photoProgramStart) return {week:1,day:0,remaining:7};
  const diff=Math.max(0,dayDiff(S.photoProgramStart,dayKey));
  const day=(diff%7)+1;
  return {week:Math.floor(diff/7)+1,day,remaining:7-day};
}
function rebuildPhotoWeeksFromStart(){
  if(!S.photosByWeek)S.photosByWeek={};
  const all=[];
  Object.values(S.photosByWeek||{}).forEach(arr=>(arr||[]).forEach(ph=>all.push(ph)));
  (S.photos||[]).forEach(ph=>all.push(ph));
  Object.entries(S.photosByDay||{}).forEach(([dayKey,arr])=>(arr||[]).forEach(ph=>all.push({...ph,dayKey:ph.dayKey||dayKey})));
  const uniq=[]; const seen=new Set();
  all.forEach(ph=>{
    const k=`${ph.src||''}|${ph.lbl||''}|${ph.dayKey||ph.date||''}`;
    if(!seen.has(k)){seen.add(k);uniq.push(ph);}
  });
  if(!S.photoProgramStart && uniq.length){
    const keys=uniq.map(ph=>ph.dayKey||dateBRToISO(ph.date)).filter(Boolean).sort();
    if(keys.length)S.photoProgramStart=keys[0];
  }
  if(!S.photoProgramStart) return;
  const rebuilt={};
  uniq.forEach(ph=>{
    const dayKey=ph.dayKey||dateBRToISO(ph.date)||S.photoProgramStart;
    const weekKey=photoWeekStartKey(dayKey);
    if(!rebuilt[weekKey])rebuilt[weekKey]=[];
    const normalized={...ph,dayKey,weekKey};
    // Só substitui a mesma posição no MESMO DIA. Fotos de outros dias da semana são preservadas.
    const lbl=String(normalized.lbl||'Foto').toLowerCase();
    const idx=rebuilt[weekKey].findIndex(x=>(x.dayKey||dateBRToISO(x.date))===dayKey && String(x.lbl||'Foto').toLowerCase()===lbl);
    if(idx>=0) rebuilt[weekKey][idx]=normalized;
    else rebuilt[weekKey].push(normalized);
  });
  S.photosByWeek=rebuilt;S.photos=[];S.photosByDay={};
}
function hasWorkoutDoneForDay(key=currentDayKey()){
  const ck=checkKeyFromISO(key);
  const day=S.exChecks&&S.exChecks[ck];
  if(!day) return !!(S.legacyTrainingDays&&S.legacyTrainingDays[key]);
  return Object.values(day).some(t=>Object.values(t||{}).some(Boolean));
}
function persistSelectedDaySnapshot(){
  const key=currentDayKey();
  const rec=ensureDayRecord(key);
  rec.water=Number(S.water)||0;
  rec.calories=Number(S.calories)||0;
  const peso=weightForDay(key);
  if(peso) rec.peso=peso;
  rec.treino=hasWorkoutDoneForDay(key);
  rec.offDiet=(S.offDiet&&S.offDiet[key])?S.offDiet[key]:[];
  rec.updatedAt=new Date().toISOString();
}
function applySelectedDayToState(){
  const key=currentDayKey();
  const rec=ensureDayRecord(key);
  S.water=Number(rec.water)||0;
  S.calories=Number(rec.calories)||0;
}
function setSelectedDay(key, goHome=true){
  selectedDayKey=key || bfISODate(new Date());
  S.lastViewedDay=selectedDayKey;
  try{window.blackfitStorage.setItem('ft_v2',JSON.stringify(S));}catch(e){}
  applySelectedDayToState();
  calSelected=selectedDayKey;
  calView=bfDateFromKey(selectedDayKey);
  renderAll();
  if(goHome) showPage('hoje');
}
function isViewingToday(){ return currentDayKey()===bfISODate(new Date()); }

/* ===== VIRADA AUTOMÁTICA DO DIA =====
   - Fecha água/calorias do último dia no histórico.
   - O novo dia começa zerado.
   - Treinos, cargas e refeições livres são separados por data. Fotos são agrupadas por semana.
*/
function archiveDailySnapshotFor(key){
  if(!key) return;
  if(!S.calData) S.calData={};
  const rec=S.calData[key]||{water:0,calories:0,peso:0,cardio:0,treino:false};
  // Só usa os valores globais se a última tela aberta era este mesmo dia.
  // Isso evita sobrescrever ontem com dados de um dia histórico consultado na Agenda.
  if(!S.lastViewedDay || S.lastViewedDay===key){
    rec.water=Number(S.water)||0;
    rec.calories=Number(S.calories)||0;
  }
  const peso=weightForDay(key);
  if(peso) rec.peso=peso;
  rec.treino=hasWorkoutDoneForDay(key);
  rec.offDiet=(S.offDiet&&S.offDiet[key])?S.offDiet[key]:[];
  rec.updatedAt=new Date().toISOString();
  S.calData[key]=rec;
}
function runDailyRolloverIfNeeded(){
  const today=bfISODate(new Date());
  if(!S.lastActiveDay){
    S.lastActiveDay=today;
    return false;
  }
  if(S.lastActiveDay===today) return false;

  // salva o que estava aberto no dia anterior antes de zerar o novo dia
  archiveDailySnapshotFor(S.lastActiveDay);
  S.water=0;
  S.calories=0;
  S.lastActiveDay=today;
  selectedDayKey=today;
  S.lastViewedDay=today;
  ensureDayRecord(today);
  try{window.blackfitStorage.setItem('ft_v2',JSON.stringify(S));}catch(e){}
  return true;
}
function startDailyRolloverWatcher(){
  const check=()=>{
    const changed=runDailyRolloverIfNeeded();
    if(changed){
      applySelectedDayToState();
      renderAll();
      if(typeof showBlackfitToast==='function') showBlackfitToast('🌅 Novo dia','O dia anterior foi salvo e seus controles diários foram zerados.');
    }
  };
  setInterval(check,60*1000);
  window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
}

function firebaseSaveStateDebounced(){window.blackfitQueueSave();}
function startFirebaseSync(){}
async function uploadPhotoToFirebase(){return null;}
window.fitFirebaseSavePro=function(p){window.blackfitStorage.setItem('blackfit_wendel_pro_v2',JSON.stringify(p));};
window.fitFirebaseLoadPro=function(defaults,callback){const p=JSON.parse(window.blackfitStorage.getItem('blackfit_wendel_pro_v2')||'{}');callback({...defaults,...p});};
function load(){
  try{
    const d=window.blackfitStorage.getItem('ft_v2');
    if(d) S={...DEF,...JSON.parse(d)};
  }catch(e){}
  if(!S.calData)S.calData={};
  if(!S.photosByDay)S.photosByDay={};
  if(!S.photosByWeek)S.photosByWeek={};
  if(!S.photos)S.photos=[];

  const today=bfISODate(new Date());

  // Migração: preserva fotos antigas e reorganiza em blocos de 7 dias a partir da primeira foto.
  rebuildPhotoWeeksFromStart();

  // Em instalações antigas, considera o estado atual como pertencente ao dia de hoje.
  if(!S.lastActiveDay){
    S.lastActiveDay=today;
    if(!S.calData[today] && ((Number(S.water)||0)>0 || (Number(S.calories)||0)>0)){
      S.calData[today]={water:Number(S.water)||0,calories:Number(S.calories)||0,peso:weightForDay(today)||0,treino:hasWorkoutDoneForDay(today)};
    }
  } else {
    runDailyRolloverIfNeeded();
  }

  selectedDayKey=today;
  S.lastViewedDay=today;
  ensureDayRecord(today);
  applySelectedDayToState();
  try{window.blackfitStorage.setItem('ft_v2',JSON.stringify(S));}catch(e){}
}

function save(){
  try{persistSelectedDaySnapshot();}catch(e){console.warn('Snapshot diário:',e);}
  try{window.blackfitStorage.setItem('ft_v2',JSON.stringify(S));}catch(e){}
  firebaseSaveStateDebounced();
}

function renderAll(){
  try{applySelectedDayToState();}catch(e){}
  try{renderWater();renderCal();renderWeights();renderToday();renderDayRow();renderTreinoPage();renderMeals();renderQuick();renderFreeMeals();renderPhotos();}catch(e){console.warn("Render geral:", e);}
  try{if(typeof renderCalPage==='function')renderCalPage();}catch(e){}
}

// ─── NAV ────────────────────────────────────────────────
const PAGES = ['hoje','treino','dieta','peso','fotos','calendario'];
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('.nav-btn')[PAGES.indexOf(id)].classList.add('active');
  document.querySelector('.scroll-area').scrollTop=0;
  if(id==='peso')renderChart();
  if(id==='calendario')renderCalPage();
}

// ─── WATER ──────────────────────────────────────────────
function addWater(ml){S.water=Math.min((Number(S.water)||0)+ml,window.BLACKFIT_WATER_GOAL);save();renderWater();renderCalPage();}
function resetWater(){S.water=0;save();renderWater();renderCalPage();}
function renderWater(){
  const pct=window.BLACKFIT_WATER_GOAL>0?S.water/window.BLACKFIT_WATER_GOAL:0;
  const n=14,filled=Math.round(pct*n);
  const tr=document.getElementById('water-track');
  if(!tr)return;
  tr.innerHTML='';
  for(let i=0;i<n;i++){
    const g=document.createElement('div');
    g.className='wg'+(i<filled?' filled':'');
    const f=document.createElement('div');
    f.className='wg-fill';
    f.style.height=i<filled?'100%':'0';
    g.appendChild(f);
    g.onclick=()=>{S.water=Math.round(((i+1)/n)*window.BLACKFIT_WATER_GOAL);save();renderWater();renderCalPage();};
    tr.appendChild(g);
  }
  const wb=document.getElementById('water-big');
  const wp=document.getElementById('water-pct');
  const mw=document.getElementById('m-agua');
  if(wb)wb.textContent=S.water+'ml';
  if(wp)wp.textContent=Math.round(pct*100)+'%';
  if(mw)mw.textContent=S.water;
}

// ─── CALORIES ───────────────────────────────────────────
function addCal(){
  const v=parseFloat(document.getElementById('cal-inp').value);
  if(!Number.isFinite(v)||v<=0)return;
  S.calories=Math.max(0,(Number(S.calories)||0)+v);
  document.getElementById('cal-inp').value='';
  save();renderCal();renderCalPage();
}
function resetCal(){S.calories=0;const key=todayISOKey();if(S.offDiet&&S.offDiet[key])S.offDiet[key]=[];save();renderCal();renderFreeMeals();renderCalPage();}
function renderCal(){
  const pct=window.BLACKFIT_SETTINGS.calorie_goal?Math.min(S.calories/window.BLACKFIT_SETTINGS.calorie_goal,1):0;
  const el=id=>document.getElementById(id);
  if(el('cal-bar'))el('cal-bar').style.width=(pct*100)+'%';
  if(el('d-cons'))el('d-cons').textContent=Math.round(S.calories);
  if(el('d-rest'))el('d-rest').textContent=window.BLACKFIT_SETTINGS.calorie_goal?Math.max(0,Math.round(window.BLACKFIT_SETTINGS.calorie_goal-S.calories)):'—';
  if(el('m-kcal'))el('m-kcal').textContent=Math.round(S.calories);
}
function renderQuick(){
  const w=document.getElementById('quick-add');
  if(!w)return;
  w.innerHTML=MEALS.map(m=>`<button class="quick-btn" onclick="S.calories=Math.max(0,(Number(S.calories)||0)+${m.kcal});save();renderCal();renderCalPage();">${m.name.slice(0,10)} +${m.kcal}</button>`).join('');
}


function todayISOKey(){
  return currentDayKey();
}

function addFreeMeal(){
  const nameEl=document.getElementById('free-food-name');
  const kcalEl=document.getElementById('free-food-kcal');
  if(!nameEl||!kcalEl)return;
  const name=nameEl.value.trim();
  const kcal=Math.round(parseFloat(kcalEl.value));
  if(!name){alert('Digite o nome do alimento.');nameEl.focus();return;}
  if(!Number.isFinite(kcal)||kcal<=0){alert('Digite as calorias aproximadas.');kcalEl.focus();return;}
  const key=todayISOKey();
  if(!S.offDiet)S.offDiet={};
  if(!S.offDiet[key])S.offDiet[key]=[];
  S.offDiet[key].push({id:Date.now().toString(36)+Math.random().toString(36).slice(2),name,kcal,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),date:key});
  S.calories=Math.max(0,(Number(S.calories)||0)+kcal);
  nameEl.value='';kcalEl.value='';
  save();renderCal();renderFreeMeals();renderCalPage();
}

function deleteFreeMeal(id){
  const key=todayISOKey();
  if(!S.offDiet||!S.offDiet[key])return;
  const item=S.offDiet[key].find(x=>x.id===id);
  S.offDiet[key]=S.offDiet[key].filter(x=>x.id!==id);
  if(item)S.calories=Math.max(0,(Number(S.calories)||0)-Number(item.kcal||0));
  save();renderCal();renderFreeMeals();renderCalPage();
}

function renderFreeMeals(){
  const el=document.getElementById('free-meal-list');
  if(!el)return;
  const key=todayISOKey();
  const items=(S.offDiet&&S.offDiet[key])?S.offDiet[key]:[];
  if(!items.length){
    el.innerHTML='<div style="color:var(--muted);font-size:12px;line-height:1.5;padding:4px 0;">Nenhum item fora da dieta registrado neste dia.</div>';
    return;
  }
  const total=items.reduce((sum,it)=>sum+Number(it.kcal||0),0);
  el.innerHTML=`<div style="font-size:12px;color:var(--muted);margin-bottom:2px;">Total fora da dieta neste dia: <b style="color:var(--accent);">${total} kcal</b></div>`+
    items.map(it=>`<div class="free-meal-item">
      <div style="min-width:0;flex:1;">
        <div class="free-meal-name">${escapeText(it.name)}</div>
        <div class="free-meal-meta">${it.time||''}</div>
      </div>
      <div class="free-meal-kcal">${it.kcal} kcal</div>
      <button class="free-meal-del" onclick="deleteFreeMeal('${it.id}')">×</button>
    </div>`).join('');
}

function escapeText(v){
  return String(v||'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}

// ─── WEIGHT ─────────────────────────────────────────────
function addWeight(){
  const v=parseFloat(document.getElementById('w-inp').value);
  if(!Number.isFinite(v)||v<1||v>500)return;
  const dt=bfDateFromKey(currentDayKey());
  const dateBR=dt.toLocaleDateString('pt-BR');
  S.weights=(S.weights||[]).filter(w=>!(w.iso===currentDayKey() || dateBRToISO(w.date)===currentDayKey()));
  S.weights.unshift({date:dateBR,iso:currentDayKey(),kg:v,ts:dt.getTime()});
  if(S.weights.length>60)S.weights.pop();
  document.getElementById('w-inp').value='';
  ensureDayRecord(currentDayKey()).peso=v;
  save();renderWeights();renderChart();renderCalPage();
  const mp=document.getElementById('m-peso');
  if(mp)mp.textContent=v;
}
function renderWeights(){
  const el=document.getElementById('w-list');
  if(!el)return;
  if(!S.weights.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;">Nenhum registro ainda.</div>';return;}
  el.innerHTML=S.weights.map((w,i)=>{
    const p=S.weights[i+1];
    let d='';
    if(p){const diff=(w.kg-p.kg).toFixed(1);d=`<span class="${diff>=0?'delta-up':'delta-dn'}">${diff>=0?'+':''}${diff}kg</span>`;}
    return `<div class="w-entry"><div><div class="w-kg">${w.kg}kg</div><div class="w-date">${w.date}</div></div>${d}</div>`;
  }).join('');
  const mp=document.getElementById('m-peso');
  if(mp){const pw=weightForDay(currentDayKey()); mp.textContent=pw||'—';}
}

let chartInst=null;
function renderChart(){
  const canvas=document.getElementById('wChart');
  if(!canvas)return;
  if(chartInst){chartInst.destroy();chartInst=null;}
  const data=[...S.weights].reverse();
  if(data.length<2){canvas.parentElement.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center;">Adicione 2+ registros para ver o gráfico.</div>';return;}
  chartInst=new Chart(canvas,{
    type:'line',
    data:{
      labels:data.map(d=>d.date),
      datasets:[{label:'Peso (kg)',data:data.map(d=>d.kg),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.08)',fill:true,tension:0.4,pointBackgroundColor:'#3b82f6',pointRadius:4}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#7878a0',font:{size:9},maxRotation:45}},
        y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#7878a0',font:{size:10}}}
      }
    }
  });
}

// ─── TODAY ──────────────────────────────────────────────
function renderToday(){
  const d=bfDateFromKey(currentDayKey());
  const dow=d.getDay();
  const dateEl=document.getElementById('hero-date');
  if(dateEl)dateEl.textContent=(isViewingToday()?'Hoje · ':'')+d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});

  const item=SCHED[S.week][dow];
  const cm=window.BLACKFIT_SETTINGS.cardio_minutes;

  const hn=document.getElementById('hero-name');
  const hc=document.getElementById('hero-cardio');
  const hex=document.getElementById('hoje-exercises');

  if(!window.BLACKFIT_HAS_WORKOUT&&!window.BLACKFIT_SETTINGS.cardio_minutes&&!window.BLACKFIT_SETTINGS.cardio_text){
    if(hn)hn.textContent='Aguardando seu plano de treino';
    if(hc)hc.textContent='Seu responsável prepara seu plano pela central';
    if(hex)hex.textContent='Nenhum treino foi cadastrado para você ainda.';
    return;
  }

  if(item==='CARDIO'){
    if(hn)hn.textContent=window.BLACKFIT_SETTINGS.cardio_minutes?'Descanso + Cardio':'Descanso';
    if(hc)hc.textContent=window.blackfitCardioLabel();
    if(hex)hex.innerHTML='<div style="color:var(--muted);font-size:13px;line-height:1.7;padding:4px 0;">Consulte as orientações da sua central para este dia.</div>';
  } else if(TREINOS[item]){
    const t=TREINOS[item];
    if(hn)hn.textContent=t.name+' — '+t.sub;
    if(hc)hc.textContent=window.blackfitCardioLabel();
    const ck2=getTodayCheckKey();
    const dc=(S.exChecks&&S.exChecks[ck2]&&S.exChecks[ck2][item])||{};
    const doneC=Object.values(dc).filter(Boolean).length;
    const totalC=t.exercises.length;
    const pctC=totalC>0?Math.round(doneC/totalC*100):0;
    if(hex)hex.innerHTML=
      `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px;"><span>Progresso de hoje</span><span>${doneC}/${totalC} · ${pctC}%</span></div>
        <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pctC}%;border-radius:3px;background:#22c55e;transition:width 0.4s;"></div></div>
      </div>`+
      t.exercises.slice(0,4).map((e,i)=>{
        const isDone=!!dc[i];
        return `<div class="ex-check-item${isDone?' done':''}" onclick="toggleExercise('${item}',${i});renderToday();">
          <div class="ex-checkbox${isDone?' checked':''}">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5L5.2 10L11 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div style="flex:1;min-width:0;"><div class="ex-name">${e.name}</div><div class="ex-muscle">${e.muscle}</div></div>
          <div style="text-align:right;flex-shrink:0;"><div class="ex-badge">${e.series}x${e.reps}</div></div>
        </div>`;
      }).join('')+(t.exercises.length>4?`<div style="color:var(--muted);font-size:12px;text-align:center;padding:8px;">+ ${t.exercises.length-4} exercícios no treino completo</div>`:'');
  }
}

function renderDayRow(){
  const el=document.getElementById('day-row');
  if(!el)return;
  const days=['D','S','T','Q','Q','S','S'];
  const sched=SCHED[S.week];
  const today=bfDateFromKey(currentDayKey()).getDay();
  el.innerHTML=days.map((d,i)=>{
    const item=sched[i];
    const cls=item==='CARDIO'?'c':'t';
    const todayCls=i===today?' today':'';
    const lbl=i===today?(item==='CARDIO'?'🏃':item):d;
    return `<div class="dc ${cls}${todayCls}" title="${item}">${lbl}</div>`;
  }).join('');
}

// ─── TREINO PAGE ────────────────────────────────────────
function renderTreinoPage(){
  const ws=document.getElementById('week-sel');
  if(ws){
    ws.textContent=window.blackfitProgramLabel();
  }
  const tabs=document.getElementById('t-tabs');
  if(tabs)tabs.innerHTML=Object.keys(TREINOS).map(k=>`<div class="t-tab${S.treino===k?' active':''}" onclick="S.treino='${k}';save();renderExercises();">${k}</div>`).join('');
  const ci=document.getElementById('cardio-txt');
  if(ci)ci.textContent=window.BLACKFIT_SETTINGS.cardio_text||'Cardio ainda não definido pela central.';
  renderExercises();
}

function getTodayCheckKey(){
  return checkKeyFromISO(currentDayKey());
}

function toggleExercise(treinoKey, idx){
  const ck=getTodayCheckKey();
  if(!S.exChecks) S.exChecks={};
  if(!S.exChecks[ck]) S.exChecks[ck]={};
  if(!S.exChecks[ck][treinoKey]) S.exChecks[ck][treinoKey]={};
  S.exChecks[ck][treinoKey][idx]=!S.exChecks[ck][treinoKey][idx];
  save();
  renderExercises();renderToday();renderCalPage();
}


function getLoadKey(){
  return loadKeyFromISO(currentDayKey());
}

function getExerciseLoad(treinoKey, exIdx, serieIdx){
  const lk=getLoadKey();
  return (((S.loads||{})[lk]||{})[treinoKey]||{})[exIdx]?.[serieIdx] || '';
}

function updateExerciseLoad(treinoKey, exIdx, serieIdx, value){
  const lk=getLoadKey();
  if(!S.loads)S.loads={};
  if(!S.loads[lk])S.loads[lk]={};
  if(!S.loads[lk][treinoKey])S.loads[lk][treinoKey]={};
  if(!S.loads[lk][treinoKey][exIdx])S.loads[lk][treinoKey][exIdx]={};
  S.loads[lk][treinoKey][exIdx][serieIdx]=value;
  save();renderCalPage();
}

function renderLoadInputs(treinoKey, exIdx, seriesCount){
  const n=Math.max(1,Number(seriesCount)||1);
  let html='<div class="load-box" onclick="event.stopPropagation();"><div class="load-title">Carga por série (kg)</div><div class="load-grid">';
  for(let s=1;s<=n;s++){
    const value=escapeText(getExerciseLoad(treinoKey,exIdx,s));
    html+=`<label class="load-input-wrap" onclick="event.stopPropagation();"><span>S${s}</span><input class="load-input" type="number" inputmode="decimal" step="0.5" placeholder="kg" value="${value}" oninput="updateExerciseLoad('${treinoKey}',${exIdx},${s},this.value)" onclick="event.stopPropagation();" /></label>`;
  }
  html+='</div></div>';
  return html;
}

function renderExercises(){
  const tabs=document.getElementById('t-tabs');
  if(tabs)tabs.innerHTML=Object.keys(TREINOS).map(k=>`<div class="t-tab${S.treino===k?' active':''}" onclick="S.treino='${k}';save();renderExercises();">${k}</div>`).join('');
  const el=document.getElementById('t-content');
  if(!el)return;
  const t=TREINOS[S.treino];
  const ck=getTodayCheckKey();
  const dayChecks=(S.exChecks&&S.exChecks[ck]&&S.exChecks[ck][S.treino])||{};
  const total=t.exercises.length;
  const done=Object.values(dayChecks).filter(Boolean).length;
  const pct=total>0?Math.round(done/total*100):0;
  const allDone=total>0&&done===total;

  let html=`<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">${t.name} — ${t.sub}</div>`;
  if(S.treino==='FUNC'){
    html+=`<div class="alert alert-warn" style="margin-bottom:10px;"><span>🏠</span><span><b>Treino em casa:</b> use apenas peso do corpo, barra fixa e seu galão de 5 kg. Faça o EMOM por 12 min (4 voltas dos 3 minutos), depois o AMRAP por 12 min e finalize com 6 min de 30s forte / 30s descanso. Se ainda não fizer 3 barras, troque por negativas ou sustentação na barra.</span></div>`;
  }

  // barra progresso
  html+=`<div class="treino-progress-wrap">
    <div class="treino-progress-bar"><div class="treino-progress-fill" style="width:${pct}%"></div></div>
    <div class="treino-progress-txt"><span>${done}/${total} exercícios</span><span>${pct}%</span></div>
  </div>`;

  // badge concluído
  if(allDone){
    html+=`<div class="treino-complete-badge" style="display:block;">🎉 Treino ${t.name} concluído hoje!</div>`;
  }

  // exercícios com checkbox
  html+=t.exercises.map((e,i)=>{
    const isDone=!!dayChecks[i];
    return `<div class="ex-check-item${isDone?' done':''}" onclick="toggleExercise('${S.treino}',${i})">
      <div class="ex-checkbox${isDone?' checked':''}">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2 6.5L5.2 10L11 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div class="ex-name">${e.name}</div>
        <div class="ex-muscle">${e.muscle}</div>
        <div class="ex-method">${e.method}</div>
        ${e.noLoad?'':renderLoadInputs(S.treino,i,e.series)}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="ex-badge">${e.series}x${e.reps}</div>
        <div class="ex-rest">${e.rest}</div>
      </div>
    </div>`;
  }).join('');

  // botão reset
  if(done>0){
    html+=`<button class="btn btn-ghost btn-block" style="margin-top:8px;font-size:12px;" onclick="resetChecks()">Resetar checklist</button>`;
  }

  el.innerHTML=html;
}

function resetChecks(){
  if(!confirm('Zerar o checklist de hoje?')) return;
  const ck=getTodayCheckKey();
  if(S.exChecks&&S.exChecks[ck]) delete S.exChecks[ck][S.treino];
  save();
  renderExercises();renderToday();renderCalPage();
}

// ─── MEALS ──────────────────────────────────────────────
function renderMeals(){
  const el=document.getElementById('meals');
  if(!el)return;
  el.innerHTML=MEALS.map((m,i)=>{
    const open=!S.collapsed[i];
    return `<div class="meal-wrap">
      <div class="meal-hd${open?'':' closed'}" onclick="S.collapsed[${i}]=!S.collapsed[${i}];save();renderMeals();">
        <div class="meal-nm">${m.name}</div><div class="meal-kc">${m.kcal} kcal ${open?'▲':'▼'}</div>
      </div>
      ${open?`<div class="meal-bd">${m.items.map(it=>`<div class="meal-row"><span>${it.food}</span><span class="meal-qty">${it.qty}</span></div>`).join('')}</div>`:''}</div>`;
  }).join('');
}

// ─── PHOTOS ─────────────────────────────────────────────
function photosForWeek(dayKey=currentDayKey()){
  if(!S.photosByWeek)S.photosByWeek={};
  const weekKey=photoWeekStartKey(dayKey);
  if(!S.photosByWeek[weekKey])S.photosByWeek[weekKey]=[];
  return S.photosByWeek[weekKey];
}
function photosTakenOnDay(dayKey){
  if(!S.photoProgramStart)return [];
  const arr=photosForWeek(dayKey);
  return arr.filter(ph=>(ph.dayKey||dateBRToISO(ph.date))===dayKey);
}
function saveWeeklyPhoto(photo){
  const dayKey=photo.dayKey||bfISODate(new Date());
  ensurePhotoProgramStart(dayKey);
  const weekKey=photoWeekStartKey(dayKey);
  photo.dayKey=dayKey;
  photo.weekKey=weekKey;
  if(!S.photosByWeek)S.photosByWeek={};
  if(!S.photosByWeek[weekKey])S.photosByWeek[weekKey]=[];
  const arr=S.photosByWeek[weekKey];
  const lbl=String(photo.lbl||'Foto').toLowerCase();
  // Frente/Lateral/Costas podem existir todos os dias. Só substitui a mesma posição no mesmo dia.
  const idx=arr.findIndex(x=>(x.dayKey||dateBRToISO(x.date))===dayKey && String(x.lbl||'').toLowerCase()===lbl);
  if(idx>=0) arr[idx]=photo; else arr.push(photo);
}
function removePhotoForWeek(weekKey,idx){
  if(!S.photosByWeek||!S.photosByWeek[weekKey])return;
  S.photosByWeek[weekKey].splice(idx,1);
  save();renderPhotos();renderCalPage();
}
function renderPhotoHistory(){
  const box=document.getElementById('photo-history');
  if(!box)return;
  if(!S.photoProgramStart){
    box.innerHTML='<div style="font-size:12px;color:var(--muted);padding:6px 0;">Registre sua primeira foto para iniciar a Semana 1.</div>';
    return;
  }
  const order=['Frente','Lateral','Costas'];
  const today=bfISODate(new Date());
  const currentWeek=Math.max(1,photoWeekNumber(today));
  let html='';
  for(let w=1;w<=currentWeek;w++){
    const start=bfDateFromKey(S.photoProgramStart);start.setDate(start.getDate()+((w-1)*7));
    const weekKey=bfISODate(start);
    const end=bfDateFromKey(weekKey);end.setDate(end.getDate()+6);
    const arr=(S.photosByWeek&&S.photosByWeek[weekKey])||[];
    const dayBlocks=[];
    for(let di=0;di<7;di++){
      const d=bfDateFromKey(weekKey);d.setDate(d.getDate()+di);
      const dayKey=bfISODate(d);
      const dayPhotos=arr.filter(p=>(p.dayKey||dateBRToISO(p.date))===dayKey);
      const future=dayDiff(today,dayKey)>0;
      const thumbs=order.map(lbl=>{
        const p=dayPhotos.find(x=>String(x.lbl||'').toLowerCase()===lbl.toLowerCase());
        if(p) return `<div class="photo-slot" style="cursor:default;"><img src="${p.src}" alt="${escapeText(lbl)}"/><div class="photo-slot-lbl" style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,.65);padding:3px 5px;border-radius:6px;color:#fff;">${escapeText(lbl)}</div></div>`;
        return `<div class="photo-slot" style="cursor:default;opacity:${future?'.35':'1'};"><span style="font-size:18px;color:var(--muted2);">${future?'·':'—'}</span><div class="photo-slot-lbl">${escapeText(lbl)}</div></div>`;
      }).join('');
      dayBlocks.push(`<div style="margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.025);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;"><b style="font-size:11px;color:${dayKey===today?'var(--accent)':'var(--text)'};">Dia ${di+1}</b><span style="font-size:9px;color:var(--muted);">${d.toLocaleDateString('pt-BR')}${dayKey===today?' · hoje':''}</span></div><div class="photo-grid">${thumbs}</div></div>`);
    }
    const status=w<currentWeek?'Fechada':'Em andamento';
    html+=`<details ${w===currentWeek?'open':''} style="margin-bottom:12px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden;"><summary style="cursor:pointer;list-style:none;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;"><span><b style="font-size:13px;color:var(--text);">Semana ${w}</b><span style="font-size:10px;color:var(--muted);margin-left:7px;">${status}</span></span><span style="font-size:10px;color:var(--muted);">${start.toLocaleDateString('pt-BR')} → ${end.toLocaleDateString('pt-BR')}</span></summary><div style="padding:0 10px 10px;">${dayBlocks.join('')}</div></details>`;
  }
  box.innerHTML=html;
}
function renderPhotos(){
  const el=document.getElementById('photo-grid');
  if(!el)return;
  const today=bfISODate(new Date());
  const viewing=currentDayKey();
  const targetDay=S.photoProgramStart?viewing:today;
  const weekKey=photoWeekStartKey(targetDay);
  const title=document.getElementById('photo-day-title');
  const info=document.getElementById('photo-cycle-info');
  if(title){
    const wk=S.photoProgramStart?photoWeekNumber(targetDay):1;
    const dk=S.photoProgramStart?Math.max(1,(dayDiff(photoWeekStartKey(targetDay),targetDay)+1)):1;
    title.textContent=`Fotos de progresso · Semana ${wk} · Dia ${dk}/7`;
  }
  if(info){
    if(!S.photoProgramStart){
      info.textContent='A primeira foto inicia o ciclo. Depois, cada 7 dias formam uma semana e um novo bloco é criado automaticamente.';
    }else{
      const pg=photoWeekProgress(today);
      info.textContent=`Ciclo ativo: Semana ${pg.week} · dia ${pg.day}/7${pg.remaining>0?` · faltam ${pg.remaining} dia(s) para abrir automaticamente a Semana ${pg.week+1}`:` · amanhã abre automaticamente a Semana ${pg.week+1}`}. Todas as fotos diárias permanecem salvas nos blocos abaixo.`;
    }
  }
  const weekPhotos=photosForWeek(targetDay);
  const dayPhotos=weekPhotos.filter(p=>(p.dayKey||dateBRToISO(p.date))===targetDay);
  const order=['Frente','Lateral','Costas'];
  const slots=order.map(lbl=>dayPhotos.find(p=>String(p.lbl||'').toLowerCase()===lbl.toLowerCase())||{placeholder:true,lbl});
  el.innerHTML=slots.map((p)=>{
    if(p.placeholder) return `<div class="photo-slot"><span style="font-size:22px;color:var(--muted2);">+</span><div class="photo-slot-lbl">${escapeText(p.lbl)}</div></div>`;
    const idx=weekPhotos.indexOf(p);
    const isToday=targetDay===today;
    const remove=isToday?`onclick="if(confirm('Remover a foto ${escapeText(p.lbl||'')} de hoje?')){removePhotoForWeek('${weekKey}',${idx});}"`:'';
    return `<div class="photo-slot" ${remove}><img src="${p.src}" alt="${escapeText(p.lbl||'Foto')}"/><div class="photo-slot-lbl" style="position:absolute;bottom:4px;left:4px;right:4px;background:rgba(0,0,0,.65);padding:3px 5px;border-radius:6px;color:#fff;">${escapeText(p.lbl||'Foto')} · ${escapeText(p.date||'')}</div></div>`;
  }).join('');
  renderPhotoHistory();
}
function compressPhotoToDataURL(file,maxSide=1280,quality=.82){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=reject;
    r.onload=()=>{
      const img=new Image();
      img.onerror=reject;
      img.onload=()=>{
        let w=img.width,h=img.height;
        const scale=Math.min(1,maxSide/Math.max(w,h));
        w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
        const c=document.createElement('canvas');c.width=w;c.height=h;
        const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',quality));
      };
      img.src=r.result;
    };
    r.readAsDataURL(file);
  });
}

async function handlePhoto(e){
  const f=e.target.files[0];if(!f)return;
  const lbl=document.getElementById('ph-lbl').value;
  const dayKey=bfISODate(new Date());
  ensurePhotoProgramStart(dayKey);
  const weekKey=photoWeekStartKey(dayKey);
  const dateLabel=bfDateFromKey(dayKey).toLocaleDateString('pt-BR');

  // Primeiro tenta Firebase; se não estiver configurado, salva uma versão comprimida localmente.
  const cloudPhoto = await uploadPhotoToFirebase(f,lbl,dayKey);
  if(cloudPhoto){
    saveWeeklyPhoto(cloudPhoto);
    save();renderPhotos();renderCalPage();
    e.target.value='';
    return;
  }

  try{
    const src=await compressPhotoToDataURL(f);
    saveWeeklyPhoto({src,lbl,date:dateLabel,dayKey,weekKey});
    save();renderPhotos();renderCalPage();
  }catch(err){
    const r=new FileReader();
    r.onload=ev=>{saveWeeklyPhoto({src:ev.target.result,lbl,date:dateLabel,dayKey,weekKey});save();renderPhotos();renderCalPage();};
    r.readAsDataURL(f);
  }
  e.target.value='';
}

// ─── CALENDARIO ──────────────────────────────────────────
// Registros diários: calData[key] = {water, calories, treino, peso, cardio}
// key = "YYYY-MM-DD"
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WDAYS_PT = ['D','S','T','Q','Q','S','S'];

let calView = new Date();
let calSelected = null;

function calKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function todayKey(){ return bfISODate(new Date()); }

function getDayRecord(key){
  if(!S.calData)S.calData={};
  const rec=S.calData[key]||null;
  if(key===currentDayKey()){persistSelectedDaySnapshot();return S.calData[key]||rec;}
  return rec;
}

function saveDayRecord(key, rec){
  if(!S.calData) S.calData = {};
  S.calData[key] = {...(S.calData[key]||{}),...rec};
  if(key===currentDayKey()) applySelectedDayToState();
  save();
}

function renderCalPage(){
  renderCalGrid();
  renderCalDetail(calSelected);
}

function calChangeMonth(dir){
  calView.setMonth(calView.getMonth()+dir);
  calSelected = null;
  document.getElementById('cal-day-detail').innerHTML = '';
  renderCalGrid();
}

function renderCalGrid(){
  const y = calView.getFullYear();
  const m = calView.getMonth();
  const lbl = document.getElementById('cal-month-label');
  if(lbl) lbl.textContent = MONTHS_PT[m] + ' ' + y;

  const grid = document.getElementById('cal-grid');
  if(!grid) return;

  const today = new Date();
  const todayStr = calKey(today);

  // header dias semana
  let html = WDAYS_PT.map(d=>`<div class="cal-wday">${d}</div>`).join('');

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  // celulas do mes anterior
  for(let i=0; i<firstDay; i++){
    const d = prevDays - firstDay + 1 + i;
    html += `<div class="cal-cell other-m">${d}</div>`;
  }

  // dias do mes
  for(let d=1; d<=daysInMonth; d++){
    const dt = new Date(y, m, d);
    const key = calKey(dt);
    const rec = getDayRecord(key);
    const isToday = key === todayStr;
    const isSel = key === calSelected;

    let dots = '';
    if(rec){
      if(rec.water > 0) dots += '<span class="cal-dot-w"></span>';
      if(rec.calories > 0) dots += '<span class="cal-dot-m"></span>';
      if(rec.treino) dots += '<span class="cal-dot-t"></span>';
      if(rec.peso > 0) dots += '<span class="cal-dot-c"></span>';
    }
    if(photosTakenOnDay(key).length) dots += '<span class="cal-dot-p"></span>';

    const cls = [
      'cal-cell',
      isToday && !isSel ? 'today-c' : '',
      isSel ? 'selected-c' : ''
    ].filter(Boolean).join(' ');

    html += `<div class="${cls}" onclick="calSelectDay('${key}')">${d}<div class="cal-dots-row">${dots}</div></div>`;
  }

  // completar grid
  const total = firstDay + daysInMonth;
  const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let d=1; d<=remainder; d++){
    html += `<div class="cal-cell other-m">${d}</div>`;
  }

  grid.innerHTML = html;
}

function calSelectDay(key){
  calSelected = key;
  setSelectedDay(key,true);
  renderCalGrid();
  renderCalDetail(key);
}


function countLoadsForDay(key){
  const lk=loadKeyFromISO(key);
  const obj=(S.loads&&S.loads[lk])||{};
  let count=0;
  Object.values(obj).forEach(t=>Object.values(t||{}).forEach(ex=>Object.values(ex||{}).forEach(v=>{if(String(v||'').trim())count++;})));
  return count?count+' séries':'—';
}

function renderCalDetail(key){
  const el = document.getElementById('cal-day-detail');
  if(!el) return;
  if(!key){ el.innerHTML=''; return; }

  const parts = key.split('-');
  const dt = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  const dateStr = dt.toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const rec = getDayRecord(key) || {};
  const dow = dt.getDay();
  const sched = SCHED[S.week][dow];
  const treinoNome = sched === 'CARDIO' ? 'Cardio / Descanso' : (TREINOS[sched] ? TREINOS[sched].name + ' — ' + TREINOS[sched].sub : '—');

  el.innerHTML = `
    <div class="cal-detail">
      <div class="cal-detail-date">${dateStr}</div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Agua</span>
        <span style="color:#3b82f6;font-weight:700;">${rec.water ? rec.water+'ml' : '—'}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Calorias</span>
        <span style="color:#22c55e;font-weight:700;">${rec.calories ? Math.round(rec.calories)+' kcal' : '—'}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Peso</span>
        <span style="color:#f59e0b;font-weight:700;">${rec.peso ? rec.peso+'kg' : '—'}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Treino do dia</span>
        <span class="cal-tag" style="color:var(--accent);">${treinoNome}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Treino realizado</span>
        <span style="font-weight:700;color:${rec.treino?'#22c55e':'var(--muted)'};">${rec.treino ? 'Sim' : 'Nao'}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Cardio</span>
        <span style="font-weight:700;color:${rec.cardio?'#22c55e':'var(--muted)'};">${rec.cardio ? rec.cardio+' min' : '—'}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Fora da dieta</span>
        <span style="font-weight:700;color:var(--accent);">${((S.offDiet&&S.offDiet[key])||[]).reduce((a,b)=>a+Number(b.kcal||0),0)||'—'}${((S.offDiet&&S.offDiet[key])||[]).length?' kcal':''}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Cargas registradas</span>
        <span style="font-weight:700;color:var(--accent);">${countLoadsForDay(key)}</span>
      </div>
      <div class="cal-detail-row">
        <span style="color:var(--muted);">Fotos do dia</span>
        <span style="font-weight:700;color:var(--accent);">${photosTakenOnDay(key).length||'—'}</span>
      </div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);">Registrar para este dia</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <input id="cd-water" type="number" class="inp" placeholder="Agua (ml)" style="flex:1;min-width:100px;font-size:12px;padding:7px 10px;" value="${rec.water||''}" />
          <input id="cd-cal" type="number" class="inp" placeholder="Kcal" style="flex:1;min-width:80px;font-size:12px;padding:7px 10px;" value="${rec.calories||''}" />
          <input id="cd-peso" type="number" step="0.1" class="inp" placeholder="Peso (kg)" style="flex:1;min-width:80px;font-size:12px;padding:7px 10px;" value="${rec.peso||''}" />
          <input id="cd-cardio" type="number" class="inp" placeholder="Cardio (min)" style="flex:1;min-width:90px;font-size:12px;padding:7px 10px;" value="${rec.cardio||''}" />
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer;">
            <input type="checkbox" id="cd-treino" ${rec.treino?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;" />
            Treino realizado
          </label>
        </div>
        <button class="btn btn-primary btn-block" onclick="saveCalDay('${key}')">Salvar registro</button>
      </div>
    </div>`;
}

function saveCalDay(key){
  if(!S.calData) S.calData = {};
  const w = parseFloat(document.getElementById('cd-water').value)||0;
  const c = parseFloat(document.getElementById('cd-cal').value)||0;
  const p = parseFloat(document.getElementById('cd-peso').value)||0;
  const cardio = parseFloat(document.getElementById('cd-cardio').value)||0;
  const treino = document.getElementById('cd-treino').checked;
  S.calData[key] = {...(S.calData[key]||{}),water:w, calories:c, peso:p, cardio:cardio, treino:treino};
  if(key===currentDayKey()){S.water=w;S.calories=c;}
  save();
  renderAll();
  renderCalDetail(key);
  // feedback
  const btn = document.querySelector('#cal-day-detail .btn-primary');
  if(btn){btn.textContent='Salvo!';setTimeout(()=>btn.textContent='Salvar registro',1500);}
}

function calSearch(val){
  const v = val.trim();
  const sr = document.getElementById('cal-search-result');
  const mv = document.getElementById('cal-main-view');
  if(!v){sr.innerHTML='';mv.style.display='';return;}

  // tenta parsear DD/MM/YYYY ou DD/MM ou YYYY-MM-DD
  let dt = null;
  const m1 = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m1){
    const year = m1[3] ? parseInt(m1[3]) : new Date().getFullYear();
    dt = new Date(year, parseInt(m1[2])-1, parseInt(m1[1]));
  } else if(m2){
    dt = new Date(parseInt(m2[1]), parseInt(m2[2])-1, parseInt(m2[3]));
  }

  if(!dt || isNaN(dt.getTime())){
    sr.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 0;">Formato: DD/MM/AAAA ou DD/MM</div>';
    mv.style.display='';
    return;
  }

  mv.style.display='none';
  const key = calKey(dt);
  const rec = getDayRecord(key) || {};
  const dateStr = dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const dow = dt.getDay();
  const sched = SCHED[S.week][dow];
  const treinoNome = sched==='CARDIO'?'Cardio / Descanso':(TREINOS[sched]?TREINOS[sched].name+' — '+TREINOS[sched].sub:'—');

  sr.innerHTML = `
    <div class="search-result-card">
      <div class="search-result-title">Resultado: ${dateStr}</div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Agua</span><span style="color:#3b82f6;font-weight:700;">${rec.water?rec.water+'ml':'—'}</span></div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Calorias</span><span style="color:#22c55e;font-weight:700;">${rec.calories?Math.round(rec.calories)+' kcal':'—'}</span></div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Peso</span><span style="color:#f59e0b;font-weight:700;">${rec.peso?rec.peso+'kg':'—'}</span></div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Treino programado</span><span class="cal-tag" style="color:var(--accent);font-size:10px;">${treinoNome}</span></div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Treino realizado</span><span style="font-weight:700;color:${rec.treino?'#22c55e':'var(--muted)'};">${rec.treino?'Sim':'Nao'}</span></div>
      <div class="cal-detail-row"><span style="color:var(--muted);">Cardio</span><span style="font-weight:700;color:${rec.cardio?'#22c55e':'var(--muted)'};">${rec.cardio?rec.cardio+' min':'—'}</span></div>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;font-size:12px;" onclick="clearCalSearch();calView=new Date(${dt.getFullYear()},${dt.getMonth()},1);calSelected='${key}';renderCalPage();">Ver no calendario</button>
    </div>`;
}

function clearCalSearch(){
  const inp = document.getElementById('cal-search-inp');
  if(inp) inp.value='';
  const sr = document.getElementById('cal-search-result');
  if(sr) sr.innerHTML='';
  const mv = document.getElementById('cal-main-view');
  if(mv) mv.style.display='';
}


// ═══ INTRO SEQUENCE ═══════════════════════════════════
const QUOTES = [
  'A dor de hoje é a <b>força de amanhã.</b>',
  'Cada rep te aproxima da <b>melhor versão.</b>',
  'Consistência supera <b>intensidade.</b>',
  'Não é sobre ser perfeito. É sobre <b>aparecer.</b>',
  'O corpo alcança o que a <b>mente acredita.</b>',
];

let cdInterval = null;
let cdVal = 5;

function enterApp(){
  clearInterval(cdInterval);
  const w = document.getElementById('welcome');
  w.classList.add('fade-out');
  setTimeout(()=>{ w.style.display='none'; }, 700);
}

function showWelcome(){
  // popular stats rápidos do window.blackfitStorage
  load();
  const ws = document.getElementById('welcome-stats');
  const lastW = S.weights && S.weights[0] ? S.weights[0].kg+'kg' : '—';
  const totalDays = S.calData ? Object.keys(S.calData).length : 0;
  ws.innerHTML = `
    <div class="wstat"><div class="wstat-val">${lastW}</div><div class="wstat-label">Peso atual</div></div>
    <div class="wstat-divider"></div>
    <div class="wstat"><div class="wstat-val">${totalDays}</div><div class="wstat-label">Dias logs</div></div>
    <div class="wstat-divider"></div>
    <div class="wstat"><div class="wstat-val">${window.BLACKFIT_SETTINGS.program_weeks+' sem.'}</div><div class="wstat-label">Semana</div></div>`;

  // frase aleatória
  const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  document.getElementById('welcome-quote').innerHTML = q;

  // mostrar welcome
  const w = document.getElementById('welcome');
  w.style.opacity = '1';
  w.style.pointerEvents = 'auto';
  w.style.transition = 'opacity 0.5s ease';

  // countdown
  cdVal = 5;
  const numEl = document.getElementById('cd-num');
  const ringEl = document.getElementById('cd-ring');
  const circumference = 175.9;
  if(numEl) numEl.textContent = cdVal;
  if(ringEl) ringEl.style.strokeDashoffset = '0';

  cdInterval = setInterval(()=>{
    cdVal--;
    if(numEl) numEl.textContent = cdVal;
    const progress = (5 - cdVal) / 5;
    if(ringEl) ringEl.style.strokeDashoffset = circumference * progress;
    if(cdVal <= 0){
      clearInterval(cdInterval);
      enterApp();
    }
  }, 1000);
}

function runSplash(){
  const bar = document.getElementById('splash-bar');
  const splash = document.getElementById('splash');
  let pct = 0;
  const step = () => {
    pct += 2;
    if(bar) bar.style.width = pct + '%';
    if(pct < 100){
      setTimeout(step, 30);
    } else {
      // fade out splash
      splash.classList.add('fade-out');
      setTimeout(()=>{
        splash.style.display = 'none';
        showWelcome();
      }, 600);
    }
  };
  setTimeout(step, 400);
}

// Iniciar sequência
runSplash();

// ─── INIT ───────────────────────────────────────────────
load();
renderWater();renderCal();renderWeights();
renderToday();renderDayRow();
renderTreinoPage();renderMeals();renderQuick();renderFreeMeals();renderPhotos();
startDailyRolloverWatcher();

// Top label
const tl=document.getElementById('top-week-label');
if(tl)tl.textContent=window.blackfitProgramLabel();

// Sincronização Firebase: mantém window.blackfitStorage como backup e puxa a nuvem quando configurado.
startFirebaseSync();
