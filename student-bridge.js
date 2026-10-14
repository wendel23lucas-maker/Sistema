'use strict';
(() => {
 const boot=JSON.parse(document.getElementById('blackfit-data').textContent);
 const values={'ft_v2':JSON.stringify(boot.state),'blackfit_wendel_pro_v2':JSON.stringify(boot.pro)};
 let version=boot.version,dirty=false,saving=false,timer,conflict=false;
 window.BLACKFIT_WATER_GOAL=Number(boot.plan.water_goal)||3500;
 const status=text=>{const el=document.getElementById('blackfit-sync');if(el)el.textContent=text;};
 window.blackfitQueueSave=()=>{dirty=true;status('Salvando…');clearTimeout(timer);timer=setTimeout(flush,350);};
 // Private in-memory storage: never reuse another student's browser data.
 window.blackfitStorage={getItem:key=>values[key]??null,setItem:(key,value)=>{values[key]=value;window.blackfitQueueSave();},removeItem:key=>{delete values[key];window.blackfitQueueSave();}};
 async function flush(){
  clearTimeout(timer);if(saving||!dirty||conflict)return;
  saving=true;dirty=false;
  try{
   const res=await fetch('/api/student-state',{method:'PUT',headers:{'Content-Type':'application/json','X-Sistema-Request':'1','X-CSRF-Token':boot.csrf},body:JSON.stringify({state:JSON.parse(values.ft_v2||'{}'),pro:JSON.parse(values.blackfit_wendel_pro_v2||'{}'),version}),keepalive:false});
   const out=await res.json();
   if(!res.ok){if(res.status===409)conflict=true;throw Error(out.error||'Não foi possível salvar.');}
   version=out.version;status(dirty?'Salvando…':'Salvo na nuvem');
  }catch(e){dirty=true;status(conflict?'Outra aba alterou os dados. Atualizar':navigator.onLine?'Não salvo. Toque para tentar':'Sem conexão. Alterações pendentes');if(window.showBlackfitToast)window.showBlackfitToast('Sincronização',e.message);}
  finally{saving=false;}
  if(dirty&&!conflict&&document.getElementById('blackfit-sync')?.textContent==='Salvando…')timer=setTimeout(flush,100);
 }
 window.blackfitFlush=flush;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.blackfitApplyPlans=(workouts,meals,schedule)=>{
  if(boot.plan.workout?.trim()){
   for(const k of Object.keys(workouts))delete workouts[k];
   let key='A';workouts[key]={name:'Meu treino',sub:'Plano da central',exercises:[]};
   for(const line of boot.plan.workout.split('\n').map(x=>x.trim()).filter(Boolean)){
    const heading=line.match(/^treino\s+([a-z])\b\s*[:—–-]?\s*(.*)$/i);
    if(heading){key=heading[1].toUpperCase();workouts[key]={name:'Treino '+key,sub:escape(heading[2]||'Plano da central'),exercises:[]};continue;}
    const fields=line.split('|').map(x=>x.trim());const count=line.match(/(\d+)\s*[x×]\s*([\d-]+)/i);
    workouts[key].exercises.push({name:escape(fields[0]),muscle:escape(fields[4]||'PERSONALIZADO'),series:Math.min(20,Math.max(1,Number(fields[1])||(count?Number(count[1]):1))),reps:escape(fields[2]||(count?count[2]:'Conforme plano')),rest:escape(fields[3]||'Conforme plano'),method:'PLANO DA CENTRAL'});
   }
   for(const k of Object.keys(workouts))if(!workouts[k].exercises.length)delete workouts[k];
   if(!Object.keys(workouts).length)workouts.A={name:'Meu treino',sub:'Plano da central',exercises:[{name:escape(boot.plan.workout),muscle:'PERSONALIZADO',series:1,reps:'Conforme plano',rest:'Conforme plano',method:'PLANO DA CENTRAL'}]};const keys=Object.keys(workouts);
   if(keys.length){for(const week of Object.keys(schedule))schedule[week]=Array.from({length:7},(_,i)=>i===0?'CARDIO':keys[(i-1)%keys.length]);const state=JSON.parse(values.ft_v2);if(!workouts[state.treino])state.treino=keys[0];values.ft_v2=JSON.stringify(state);}
  }
  if(boot.plan.diet?.trim()){
   meals.length=0;
   for(const line of boot.plan.diet.split('\n').map(x=>x.trim()).filter(Boolean)){
    const parts=line.split('|');const kcal=Number(parts[1]?.replace(/[^\d.]/g,''))||0;
    meals.push({name:escape(parts[0]),kcal,items:[]});
   }
  }
 };
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('blackfit-name').textContent=boot.user.name;
  document.getElementById('blackfit-sync').onclick=()=>conflict?location.reload():flush();
  document.querySelectorAll('.blackfit-water-goal').forEach(el=>el.textContent=window.BLACKFIT_WATER_GOAL+'ml');
  if(boot.plan.notes){const box=document.createElement('div');box.style.cssText='white-space:pre-wrap;margin:12px 0;padding:14px;border:1px solid #292932;border-radius:12px;color:#9696ae;font-size:13px';box.textContent='Orientações da central\n'+boot.plan.notes;document.getElementById('page-hoje').prepend(box);}
  document.getElementById('blackfit-logout').onclick=async()=>{await flush();if(dirty){if(!confirm('Há alterações não salvas. Deseja sair mesmo assim?'))return;}try{const r=await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Sistema-Request':'1','X-CSRF-Token':boot.csrf},body:'{}'});if(!r.ok)throw Error();location.href='/';}catch(e){status('Falha ao sair. Tente novamente.');}};
 });
 window.addEventListener('online',flush);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
})();
