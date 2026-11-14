/** Local life policy is server-authoritative; this adapter drives the existing VRM controller. */
export function createAvatarBrain({api,motion,ready,startPose,cancelPose,speak,blocked=()=>false}){
 const clientId=crypto.randomUUID();let state=null,run=null,dispatching=false,busy=false,lastManual=0,lastExpression=null,mirrored=null,localPausedUntil=0;
 const panel=document.createElement('aside');panel.className='avatar-life';panel.innerHTML=`<label><input type="checkbox" data-auto> 角色自主生活</label><p data-status>登录后开启</p><div class="avatar-metrics"><div class="avatar-metric" data-metric="mood"><div class="avatar-metric-heading"><span>心情</span><output data-value>—</output></div><progress max="100" value="0" aria-label="心情"></progress></div><div class="avatar-metric" data-metric="satiety"><div class="avatar-metric-heading"><span>饱食</span><output data-value>—</output></div><progress max="100" value="0" aria-label="饱食"></progress></div><div class="avatar-metric" data-metric="hydration"><div class="avatar-metric-heading"><span>补水</span><output data-value>—</output></div><progress max="100" value="0" aria-label="补水"></progress></div><div class="avatar-metric" data-metric="boredom"><div class="avatar-metric-heading"><span>无聊</span><output data-value>—</output></div><progress max="100" value="0" aria-label="无聊"></progress></div></div>`;(document.querySelector('.stage')||document.body).append(panel);
 const toggle=panel.querySelector('[data-auto]');
 async function request(route,body){const response=await fetch('/social-api/api/autonomy/'+route,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,...body})}:{})});const data=await response.json();if(!response.ok){const error=Error(data.error||'角色同步失败');error.status=response.status;throw error;}return data;}
 function credentials(){return {token:state?.token,planId:run?.id,position:{...motion.position},heading:motion.heading};}
 function stop(preserveCommand=false){run=null;mirrored=null;if(!preserveCommand)api.cancelInteraction();motion.stop();cancelPose();}
 function adopt(next){
  state=next;toggle.disabled=next.canControl===false;toggle.checked=next.enabled;
  panel.querySelector('[data-status]').textContent=!next.enabled&&next.plan?.source!=='chat'?'自主生活已关闭':next.pausedUntil>Date.now()?'手动操作中':next.plan&&!['done','cancelled'].includes(next.plan.phase)?next.plan.label:'休息中';
  const stats=next.account.stats;
  for(const key of ['mood','satiety','hydration','boredom']){
   const row=panel.querySelector('[data-metric="'+key+'"]'),bar=row.querySelector('progress'),value=Math.max(0,Math.round(stats[key]));
   row.querySelector('[data-value]').textContent=String(value);
   bar.max=100;bar.value=Math.min(100,value);
   bar.setAttribute('aria-valuetext',value+' / 100');
  }
  if(next.expression&&next.expression.id!==lastExpression&&Date.now()-next.expression.at<10000){lastExpression=next.expression.id;speak(next.expression.line);}
  if(run&&(run.id!==next.plan?.id||!next.owner&&!run.follower||next.owner&&run.follower||!next.enabled&&next.plan?.source!=='chat'||['done','cancelled'].includes(next.plan.phase)))stop();
 }
 async function poll(){
  if(busy)return;busy=true;
  try{
   if(document.hidden){if(state?.owner){await request('release',credentials());stop();}return;}
   const next=await request('state?clientId='+clientId);adopt(next);
   if(next.canControl===false){mirror(next);return;}
   const explicit=next.plan?.source==='chat'&&!['done','cancelled'].includes(next.plan.phase);
   if((blocked()||Date.now()<localPausedUntil)&&!explicit){if(state?.owner){await request('release',credentials());stop();}return;}
   if(!ready()||!next.enabled&&!explicit||next.pausedUntil>Date.now())return;
   if(!next.owner||!next.plan||['done','cancelled'].includes(next.plan.phase)){
    const claimed=await request('claim',{});adopt(claimed);
    if(!claimed.owner){mirror(claimed);return;}
   }
   adopt(await request('heartbeat',credentials()));
   if(state.plan?.phase==='holding'&&!run&&state.plan.furnitureId){run={id:state.plan.id,furnitureId:state.plan.furnitureId,completing:true};startPose(state.plan.furnitureId);}
   if(['walking','acting'].includes(state.plan?.phase)&&!run){
    const plan=state.plan;run={id:plan.id,furnitureId:plan.furnitureId};mirrored=null;
    dispatching=true;const command=plan.command||{type:'interact',args:{id:plan.furnitureId}},pending=api.execute(command);dispatching=false;
    void pending.then(async result=>{if(run?.id!==plan.id)return;if(command.type==='interact'){if(result.status!=='active')return failed();}else{if(['cancelled','blocked'].includes(result.status))return failed();adopt(await request('arrive',credentials()));if(run?.id===plan.id)await complete();}}).catch(()=>{if(run?.id===plan.id)return failed();});
   }
  }catch(error){if(error.status===401){stop();state=null;toggle.disabled=true;panel.querySelector('[data-status]').textContent='请先登录';}else if(run){stop();panel.querySelector('[data-status]').textContent='连接暂时中断，已暂停角色活动';}}
  finally{dispatching=false;busy=false;}
 }
 function mirror(next){
  if(!next.plan||!['walking','acting','holding'].includes(next.plan.phase)){if(mirrored)stop();return;}
  // Observers display the authoritative action without consuming inventory again.
  motion.position.x=next.position.x;motion.position.z=next.position.z;motion.heading=next.heading;
  if(next.plan.furnitureId&&['acting','holding'].includes(next.plan.phase)&&mirrored!==next.plan.id){mirrored=next.plan.id;run={id:next.plan.id,furnitureId:next.plan.furnitureId,follower:true};startPose(next.plan.furnitureId);}
 }
 async function failed(){const current=run;if(!current)return;try{const next=await request('fail',credentials());if(run===current)adopt(next);}catch{}if(run===current)stop();}
 async function arrive(id){const current=run;if(!current||current.follower||id!==current.furnitureId)return false;try{const next=await request('arrive',credentials());if(run!==current)return false;adopt(next);return true;}catch{if(run===current)await failed();return false;}}
 async function complete(){const current=run;if(!current||current.follower||current.completing)return;current.completing=true;try{const next=await request('complete',credentials());if(run===current)adopt(next);}catch{if(run===current)await failed();}}
 function manual(preserveCommand=false){if(dispatching)return;const time=Date.now();localPausedUntil=time+45000;stop(preserveCommand);if(time-lastManual<1000)return;lastManual=time;void request('suspend',{}).then(adopt).catch(()=>{});}
 toggle.addEventListener('change',()=>{stop();localPausedUntil=0;void request('config',{enabled:toggle.checked}).then(adopt).then(poll).catch(()=>{toggle.checked=false;});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state?.owner){void request('release',credentials()).catch(()=>{});stop();}else void poll();});
 toggle.disabled=true;setInterval(poll,3000);void poll();
 return {get active(){return !!run;},get dispatching(){return dispatching;},get state(){return state;},get expression(){return state?.expression;},describe(){if(run)speak(state?.expression?.line||state?.plan?.line||'');},manual,arrive,complete};
}
