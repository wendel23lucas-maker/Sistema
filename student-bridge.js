'use strict';
(() => {
 const boot=JSON.parse(document.getElementById('blackfit-data').textContent);
 const values={'ft_v2':JSON.stringify(boot.state),'blackfit_wendel_pro_v2':JSON.stringify(boot.pro)};
 let version=boot.version,dirty=false,saving=false,timer,conflict=false;
 window.BLACKFIT_SETTINGS=boot.settings;
 window.BLACKFIT_HAS_WORKOUT=!!boot.plan.workout?.trim();
 const goalId=(prefix,label)=>prefix+Array.from(label).reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,0).toString(16).replace('-','n');
 window.BLACKFIT_GOALS=[...boot.settings.daily_goals.map(name=>({id:goalId('g_',name),name,icon:'🎯'})),...boot.settings.activities.map(name=>({id:goalId('a_',name),name,icon:'🏃'}))];
 window.blackfitProgramLabel=()=>{const cfg=boot.settings;return cfg.program_start?'Semana '+Math.min(cfg.program_weeks,Math.max(1,Math.floor((Date.now()-new Date(cfg.program_start+'T12:00:00').getTime())/604800000)+1))+' de '+cfg.program_weeks:(cfg.program_title||'Meu programa')+' · '+cfg.program_weeks+' semanas';};
 window.blackfitCardioLabel=()=>boot.settings.cardio_minutes?'🏃 Cardio '+boot.settings.cardio_minutes+' min':boot.settings.cardio_text.split('\n')[0]||'Sem cardio definido';
 window.BLACKFIT_WATER_GOAL=Number.isFinite(Number(boot.plan.water_goal))?Number(boot.plan.water_goal):3500;
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
 window.blackfitApplyPlans=(workouts,meals,schedule,cardio)=>{
  if(boot.plan.workout?.trim()){
   for(const k of Object.keys(workouts))delete workouts[k];
   let key='A';workouts[key]={name:'Meu treino',sub:'Plano da central',exercises:[]};
   for(const line of boot.plan.workout.split('\n').map(x=>x.trim()).filter(Boolean)){
    const heading=line.match(/^treino\s+([a-z])\b\s*[:—–-]?\s*(.*)$/i);
    if(heading){key=heading[1].toUpperCase();workouts[key]={name:'Treino '+key,sub:escape(heading[2]||'Plano da central'),exercises:[]};continue;}
    const fields=line.split('|').map(x=>x.trim());const count=line.match(/(\d+)\s*[x×]\s*([\d-]+)/i);
    workouts[key].exercises.push({name:escape(fields[0]),muscle:escape(fields[4]||'PERSONALIZADO'),series:Math.min(20,Math.max(1,Number(fields[1])||(count?Number(count[1]):1))),reps:escape(fields[2]||(count?count[2]:'Conforme plano')),rest:escape(fields[3]||'Conforme plano'),method:escape(fields[5]||'')});
   }
   for(const k of Object.keys(workouts))if(!workouts[k].exercises.length)delete workouts[k];
   if(!Object.keys(workouts).length)workouts.A={name:'Meu treino',sub:'Plano da central',exercises:[{name:escape(boot.plan.workout),muscle:'PERSONALIZADO',series:1,reps:'Conforme plano',rest:'Conforme plano',method:'PLANO DA CENTRAL'}]};const keys=Object.keys(workouts);
   if(keys.length){const state=JSON.parse(values.ft_v2);if(!workouts[state.treino])state.treino=keys[0];values.ft_v2=JSON.stringify(state);}
  }
  if(!Object.keys(workouts).length)workouts.A={name:'Treino ainda não cadastrado',sub:'Aguardando a central',exercises:[]};
  for(const key of boot.settings.schedule)if(key!=='CARDIO'&&!workouts[key])workouts[key]={name:'Treino '+key,sub:'Ainda não cadastrado',exercises:[]};
  const state=JSON.parse(values.ft_v2);if(!workouts[state.treino])state.treino=Object.keys(workouts)[0];values.ft_v2=JSON.stringify(state);
  for(const week of Object.keys(schedule)){schedule[week]=[...boot.settings.schedule];cardio[week]=boot.settings.cardio_text;}
  if(boot.plan.diet?.trim()){
   meals.length=0;
   for(const line of boot.plan.diet.split('\n').map(x=>x.trim()).filter(Boolean)){
    const parts=line.split('|');const kcal=Number(parts[1]?.replace(/[^\d.]/g,''))||0;
    meals.push({name:escape(parts[0]),kcal:Number.isFinite(kcal)?Math.min(kcal,10000):0,items:parts.slice(2).join('|').split(';').map(x=>x.trim()).filter(Boolean).map(food=>({food:escape(food),qty:''}))});
   }
  }
 };
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('blackfit-name').textContent=boot.user.name;
  document.getElementById('blackfit-sync').onclick=()=>conflict?location.reload():flush();
  document.getElementById('water-track').closest('.card').hidden=window.BLACKFIT_WATER_GOAL===0;
  document.querySelectorAll('.blackfit-water-goal').forEach(el=>el.textContent=window.BLACKFIT_WATER_GOAL+'ml');
  document.getElementById('d-goal').textContent=boot.settings.calorie_goal||'—';
  document.getElementById('diet-guidance').textContent=boot.settings.diet_guidance;
  document.getElementById('diet-guidance-card').hidden=!boot.settings.diet_guidance;
  document.getElementById('meals-title').textContent=boot.plan.diet?.trim()?'Refeições do seu plano':'Dieta ainda não cadastrada';
  const macros=document.getElementById('macro-targets');macros.hidden=![boot.settings.protein_goal,boot.settings.carbs_goal,boot.settings.fat_goal].some(Boolean);macros.textContent=`Metas diárias • Proteína: ${boot.settings.protein_goal} g • Carboidratos: ${boot.settings.carbs_goal} g • Gorduras: ${boot.settings.fat_goal} g`;
  document.getElementById('target-weight').textContent=boot.settings.target_weight?'Meta definida pela central: '+boot.settings.target_weight+' kg':'';
  document.getElementById('hero-sub').textContent=window.blackfitProgramLabel();
  document.getElementById('workout-guidance').textContent=boot.settings.workout_guidance;
  document.getElementById('workout-guidance-card').hidden=!boot.settings.workout_guidance;
  document.querySelector('.challenge-box').hidden=!boot.settings.sugar_enabled;
  document.querySelector('.challenge-title').textContent='🚫 '+boot.settings.sugar_days+' dias sem açúcar';
  if(boot.plan.notes){const box=document.createElement('div');box.style.cssText='white-space:pre-wrap;margin:12px 0;padding:14px;border:1px solid #292932;border-radius:12px;color:#9696ae;font-size:13px';box.textContent='Orientações da central\n'+boot.plan.notes;document.getElementById('page-hoje').prepend(box);}
  document.getElementById('blackfit-logout').onclick=async()=>{await flush();if(dirty){if(!confirm('Há alterações não salvas. Deseja sair mesmo assim?'))return;}try{const r=await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Sistema-Request':'1','X-CSRF-Token':boot.csrf},body:'{}'});if(!r.ok)throw Error();location.href='/';}catch(e){status('Falha ao sair. Tente novamente.');}};
 });
 window.addEventListener('online',flush);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
})();
