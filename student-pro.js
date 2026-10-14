
/* ===== BLACK FIT PRO — NOTIFICAÇÃO REAL + METAS EXTRAS ===== */
(function(){
  const KEY='blackfit_wendel_pro_v2';
  const todayKey=()=>typeof bfISODate==='function'?bfISODate(new Date()):new Date().toLocaleDateString('en-CA');
  const defaultPro={sugarStart:todayKey(),sugarDone:{},dailyGoals:{},notifications:false};
  let P;
  function loadPro(){
    try{P={...defaultPro,...JSON.parse(window.blackfitStorage.getItem(KEY)||'{}')};}catch(e){P={...defaultPro};}
    if(typeof window.fitFirebaseLoadPro==='function'){
      window.fitFirebaseLoadPro(defaultPro,function(remotePro){P=remotePro;renderPro();});
    }
  }
  function savePro(){
    if(typeof window.fitFirebaseSavePro==='function') window.fitFirebaseSavePro(P);
    else{try{window.blackfitStorage.setItem(KEY,JSON.stringify(P));}catch(e){}}
  }
  function daysBetween(a,b){const da=new Date(a+'T00:00:00');const db=new Date(b+'T00:00:00');return Math.max(0,Math.floor((db-da)/86400000));}
  function toast(title,msg){
    let s=document.getElementById('toast-stack');
    if(!s){s=document.createElement('div');s.id='toast-stack';s.className='toast-stack';document.body.appendChild(s);}
    const t=document.createElement('div');
    t.className='pro-toast';
    t.innerHTML='<b>'+title+'</b><br>'+msg;
    s.prepend(t);
    setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-10px)';setTimeout(()=>t.remove(),260)},4300);
  }
  window.showBlackfitToast=toast;

  async function registerSW(){
    if('serviceWorker' in navigator){
      try{return await navigator.serviceWorker.register('/sw.js');}catch(e){console.warn('SW não registrado',e);}
    }
    return null;
  }
  async function showRealNotification(title,body){
    toast(title,body);
    if(!('Notification' in window)) return;
    if(Notification.permission!=='granted') return;
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg&&reg.showNotification){
        reg.showNotification(title,{body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'blackfit-wendel',renotify:true});
      }else{
        new Notification(title,{body});
      }
    }catch(e){try{new Notification(title,{body});}catch(err){}}
  }
  window.enableProNotifications=async function(){
    await registerSW();
    if(!('Notification' in window)){toast('Notificação indisponível','Este navegador não permite notificação real.');return;}
    const perm=await Notification.requestPermission();
    P.notifications=perm==='granted';savePro();
    if(P.notifications){showRealNotification('BLACK FIT ativado ⚡','Notificações reais liberadas para água, treino e metas.');}
    else{toast('Permissão não ativada','Libere as notificações do navegador para receber os alertas reais.');}
  };
  function goalState(){const k=todayKey();if(!P.dailyGoals[k])P.dailyGoals[k]={};return P.dailyGoals[k];}
  window.toggleProGoal=function(g){const st=goalState();st[g]=!st[g];savePro();renderPro();showRealNotification('Meta atualizada',st[g]?'Boa! Meta concluída hoje.':'Meta reaberta para hoje.');};
  window.markSugarDay=function(done){
    const k=todayKey();
    if(done){P.sugarDone[k]=true;showRealNotification('Sem açúcar hoje ✅','Mais um dia contabilizado no desafio de '+window.BLACKFIT_SETTINGS.sugar_days+' dias.');}
    else{if(confirm('Reiniciar o desafio de '+window.BLACKFIT_SETTINGS.sugar_days+' dias sem açúcar?')){P.sugarStart=k;P.sugarDone={};showRealNotification('Desafio reiniciado','Começando uma nova sequência hoje.');}}
    savePro();renderPro();
  };
  function renderPro(){
    const limit=window.BLACKFIT_SETTINGS.sugar_days;
    const k=todayKey();const day=Math.min(limit,daysBetween(P.sugarStart,k)+1);const pct=Math.min(100,Math.round(day/limit*100));
    const sd=document.getElementById('sugar-days');if(sd)sd.textContent=day+'/'+limit;
    const ss=document.getElementById('sugar-sub');if(ss)ss.textContent=(P.sugarDone[k]?'Concluído hoje · ':'')+'Dia '+day+' de '+limit;
    const sb=document.getElementById('sugar-bar');if(sb)sb.style.width=pct+'%';
    const st=goalState();
    const goals=window.BLACKFIT_GOALS.map(g=>[g.id,g.icon,g.name]);
    const dg=document.getElementById('daily-goals');
    if(dg){dg.textContent='';for(const [id,ic,n] of goals){const el=document.createElement('div');el.className='goal-chip '+(st[id]?'done':'');el.onclick=()=>toggleProGoal(id);for(const [cls,label] of [['goal-icon',ic],['goal-name',n],['goal-status',st[id]?'Concluído':'Meta diária']]){const child=document.createElement('div');child.className=cls;child.textContent=label;el.appendChild(child);}dg.appendChild(el);}if(!goals.length){dg.textContent='Metas e atividades ainda não definidas pela central.';dg.style.gridTemplateColumns='1fr';}}
    let score=0;
    if(window.BLACKFIT_SETTINGS.sugar_enabled&&P.sugarDone[k]) score+=25;
    score+=goals.filter(([id])=>st[id]).length*15;
    try{if(typeof S!=='undefined'&&window.BLACKFIT_WATER_GOAL>0&&S.water>=window.BLACKFIT_WATER_GOAL)score+=20;if(typeof S!=='undefined'&&S.exChecks&&Object.keys(S.exChecks).length)score+=10;}catch(e){}
    const ps=document.getElementById('pro-score');if(ps)ps.textContent=Math.min(100,score);
  }
  function wrap(name){const old=window[name];if(typeof old==='function'){window[name]=function(){const r=old.apply(this,arguments);setTimeout(renderPro,0);return r;};}}
  ['addWater','resetWater','addCal','resetCal','toggleExercise','renderWater','renderToday','renderExercises'].forEach(wrap);
  function scheduleSmartAlerts(){
    setTimeout(()=>showRealNotification('🏋️ Treino do dia','Abra o checklist e marque o treino conforme concluir.'),3500);

    // Água: checa a cada 5 min e avisa no máximo 1x por hora, das 08h às 22h.
    // Funciona enquanto o app/navegador mantiver esta página ativa em memória.
    const waterReminder=()=>{
      const now=new Date();
      const h=now.getHours();
      if(h<8||h>22) return;
      try{
        if(typeof S==='undefined'||S.water>=window.BLACKFIT_WATER_GOAL) return;
        const nowMs=Date.now();
        const last=Number(P.lastWaterReminderAt||0);
        if(nowMs-last < 60*60*1000) return;
        P.lastWaterReminderAt=nowMs;savePro();
        const remaining=Math.max(0,window.BLACKFIT_WATER_GOAL-(Number(S.water)||0));
        showRealNotification('💧 Hora da água',`Faltam ${remaining} ml para sua meta de ${window.BLACKFIT_WATER_GOAL} ml hoje.`);
      }catch(e){}
    };
    setTimeout(waterReminder,60*1000);
    setInterval(waterReminder,5*60*1000);

    setInterval(()=>{
      if(document.hidden) return;
      const st=goalState();
      const pending=window.BLACKFIT_GOALS.filter(g=>!st[g.id]);if(pending.length)showRealNotification('⚡ Metas rápidas','Pendentes: '+pending.map(g=>g.name).join(', '));
    },3*60*60*1000);
  }
  loadPro();registerSW();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{renderPro();scheduleSmartAlerts();});
  else{renderPro();scheduleSmartAlerts();}
})();
