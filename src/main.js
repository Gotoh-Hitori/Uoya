import {createHouseAdminPanels} from './ui/house-admin-panels.js';
import {doorOccupantPosition} from './world/door-occupant.mjs';
import {createLatestMessage} from './ui/latest-message.js';
import {createAvatarBrain} from './agent/avatar-brain.js';
import {createLifeUI} from './ui/life-ui.js';
import {createSocialChat} from './ui/social-chat.js';
import {LAMPS} from './world/lamp-config.mjs';
import {createFurnitureActions} from './agent/furniture-actions.js';
import {createAvatarMotion} from './agent/avatar-motion.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import './styles.css';
import {createScene} from './world/build-scene.js';
import {createLighting} from './world/lighting.js';
import {PLAN,ROOMS,FURNITURE,DOORS,CHARACTER_ASSET,roomAt} from './world/layout.mjs';
import {makeCollisionWorld,createNavigator,AgentMotion} from './world/navigation.mjs';
import {fetchAssetConfig,addImportedModel,populateFurniture,REQUIRED_MODELS} from './world/models.js';
import {HouseAgentController,AGENT_TOOLS} from './agent/controller.mjs';
const el=id=>document.getElementById(id);
const canvas=el('world');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
const {scene,updateDoors}=createScene();
const lighting=createLighting(scene,renderer);lighting.refresh(new Date());
const center=new THREE.Vector3(PLAN.width/2,.1,PLAN.depth/2);
const camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,125);
const home=new THREE.Vector3(11.0,17.2,17.5);
camera.position.copy(home);camera.lookAt(center);
const controls=new OrbitControls(camera,canvas);controls.target.copy(center);
controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;
controls.minPolarAngle=.10;controls.maxPolarAngle=1.32;controls.minZoom=.67;controls.maxZoom=3.0;
controls.minAzimuthAngle=-1.25;controls.maxAzimuthAngle=1.30;
const modelRoot=new THREE.Group();modelRoot.name='Real imported Kenney furniture';scene.add(modelRoot);
const avatarRoot=new THREE.Group();avatarRoot.name='Real imported Kenney character';scene.add(avatarRoot);
const footprint=makeCollisionWorld(),navigator=createNavigator(footprint,.12),motion=new AgentMotion(navigator,{x:4.75,z:5.70});
motion.speed=1.55;
let canControl=false;
const api=new HouseAgentController({motion,onInteract:handleInteract,onSpeak:speak,lighting});
const executeAuthorized=api.execute.bind(api);api.execute=(...args)=>canControl?executeAuthorized(...args):Promise.reject(Error('仅空间管理员可控制角色和照明'));
async function refreshPermissions(){try{const response=await fetch('/social-api/api/me',{credentials:'same-origin'});const data=response.ok?await response.json():{};canControl=data.user?.role==='admin';adminPanels.setUser(data.user||null);const muted=data.user?.muted_until===-1||data.user?.muted_until>Date.now();el('command-input').disabled=muted;if(muted){el('send-command').disabled=true;el('send-command').dataset.muted='true';}else if(el('send-command').dataset.muted){delete el('send-command').dataset.muted;el('send-command').disabled=false;}}catch{canControl=false;adminPanels.setUser(null);}for(const input of document.querySelectorAll('.lighting-panel input,.lighting-panel button,[data-room]'))input.disabled=!canControl;if(!canControl)Object.keys(keys).forEach(k=>keys[k]=false);}
window.HouseAgent=window.DollhouseAgent=Object.freeze({
 version:'1.0',tools:AGENT_TOOLS,getState:()=>api.getState(),getAutonomyState:()=>brain?.state,getLightingState:()=>lighting.getState(),execute:action=>api.execute(action),
 executePlan:actions=>api.executePlan(actions),subscribe:callback=>api.subscribe(callback),
 getPlan:()=>JSON.parse(JSON.stringify({width:PLAN.width,depth:PLAN.depth,rooms:ROOMS,doors:DOORS}))
});
let actor=null,animationMixer=null,idleAction=null,walkAction=null,lastMoving=false,loaded=0,failed=0;
const keys={up:false,down:false,left:false,right:false};
const adminPanels=createHouseAdminPanels({onOpen:()=>Object.keys(keys).forEach(k=>keys[k]=false),onNotice:toast});
const furnitureInstances=new Map();
let lifeUI=null,brain=null;
const furnitureActions=createFurnitureActions({root:avatarRoot,motion,getActor:()=>actor,getFurniture:id=>furnitureInstances.get(id),speak,onActivate:item=>syncLighting(lighting.toggleLamp(item.id)),onState:state=>{api.activity=state;if(!state)lifeUI?.cancelInteraction();},onLifeComplete:id=>{if(brain?.active)void brain.complete();else void lifeUI?.completeInteraction(id)}});
api.subscribe(event=>{if(event.event==='start'&&['move_to','goto_room','interact','stop'].includes(event.type)){if(!brain?.dispatching)brain?.manual(true);furnitureActions.cancel();}});
const raycaster=new THREE.Raycaster(),cursor=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),-.05);
function toast(message,error=false){
 const item=el('toast');item.textContent=message;item.dataset.type=error?'error':'success';item.classList.add('visible');
 clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>item.classList.remove('visible'),3400);
}
function speak(message,{chat=false,activity=false}={}){
 if(!chat&&!activity&&Date.now()<(speak.chatUntil||0))return;
 const duration=chat?Math.min(45000,Math.max(8000,String(message).length*90)):4300;if(chat)speak.chatUntil=Date.now()+duration;
 const item=el('speech');item.textContent=message;item.hidden=false;
 clearTimeout(speak.timeout);speak.timeout=setTimeout(()=>{item.hidden=true;speak.chatUntil=0;},duration);
}
const latestMessage=createLatestMessage();
const socialChat=createSocialChat({onMediaChange:()=>{el('send-command').disabled=!!el('command-input').disabled||el('send-command').dataset.sending==='true'||socialChat.mediaBusy;},onMemberProfile:user=>latestMessage.updateMember(user),onMessage:message=>latestMessage.show(message),onProfile:profile=>latestMessage.setProfile(profile),onReset:()=>latestMessage.clear(),onLifeEvent:event=>lifeUI?.lifeEvent(event),onAuthChange:()=>{lifeUI?.authChanged();void refreshPermissions();},onReply:text=>speak(text,{chat:true}),onError:message=>toast(message,true),onOpen:()=>{Object.keys(keys).forEach(k=>keys[k]=false);}});
lifeUI=createLifeUI({onAiUse:item=>{const verb=item.category==='drink'?'喝了':item.category==='toy'?'玩了':item.category==='food'||item.category==='snack'?'吃了':'使用了';speak(verb+' '+item.name,{activity:true});},onLogin:()=>socialChat.open(),onNotice:toast,onOpen:()=>{Object.keys(keys).forEach(k=>keys[k]=false);}});
brain=createAvatarBrain({api,motion,ready:()=>!!actor&&furnitureInstances.size>=25,startPose:id=>furnitureActions.start(FURNITURE.find(f=>f.id===id)),cancelPose:()=>furnitureActions.cancel(),speak,blocked:()=>el('social-chat-dialog').open||el('life-dialog').open||adminPanels.isOpen});
async function handleInteract(item){
 const token=api.interactionToken;
 if(brain?.active){if(!await brain.arrive(item.id))return {status:'cancelled'};}else await lifeUI.prepareInteraction(item.id);
 if(token!==api.interactionToken){lifeUI.cancelInteraction();return {status:'cancelled'};}
 if(furnitureActions.start(item)){brain?.describe();return {status:'active',activity:api.activity};}
 if(item.id==='tv'){speak('电视已经准备好啦！');toast('电视已打开')}
 else if(item.interact==='lamp'){syncLighting(lighting.toggleLamp(item.id));speak(`${item.room==='bedroom'?'卧室':'客餐厨'}灯光已切换～`)}
 else{speak(`到达${item.name}旁边啦！`);toast(`成功互动：${item.name}`)}
}
function syncLighting(state=lighting.getState()){
 el('local-clock').textContent=state.localTime;
 el('phase-status').textContent=`${state.phaseName} · ${state.mode==='auto'?'自动':'手动'}`;
 el('smart-lights').checked=state.smart;
 for(const lamp of LAMPS)el('lamp-'+lamp.id).checked=state.lamps[lamp.id].enabled;
 document.body.classList.toggle('night',state.phase==='night');
}
syncLighting();
for(const input of document.querySelectorAll('.lighting-panel input,.lighting-panel button,[data-room]'))input.disabled=true;
void refreshPermissions();setInterval(()=>void refreshPermissions(),30000);
api.subscribe(e=>{if(e.result?.lighting)syncLighting(e.result.lighting);});
el('smart-lights').addEventListener('change',event=>{if(canControl)syncLighting(lighting.setSmart(event.target.checked));else syncLighting();});
for(const lamp of LAMPS)el('lamp-'+lamp.id).addEventListener('change',event=>{if(canControl)syncLighting(lighting.setLamp(lamp.id,event.target.checked));else syncLighting();});
for(const [id,on] of [['all-lights-on',true],['all-lights-off',false]])el(id).addEventListener('click',()=>{if(canControl)syncLighting(lighting.setAllLights(on));});
window.setInterval(()=>syncLighting(lighting.refresh(new Date())),15000);
function navigateToRoom(room){
 if(!canControl)return;
 document.querySelectorAll('[data-room]').forEach(item=>item.classList.toggle('selected',item.dataset.room===room));
 void api.execute({type:'goto_room',args:{room}}).then(result=>{if(result.status==='arrived')toast(`已到达 ${ROOMS[room].name}`)}).catch(e=>toast(e.message,true));
}
document.querySelectorAll('[data-room]').forEach(item=>item.onclick=()=>navigateToRoom(item.dataset.room));
window.addEventListener('keydown',e=>{
 if(el('social-chat-dialog').open||el('life-dialog').open||adminPanels.isOpen||e.target?.matches?.('input,textarea,select'))return;
 const k=e.key.toLowerCase();const map={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
 if(!canControl)return;
 if(map[k]){brain?.manual();keys[map[k]]=true;e.preventDefault()}
 if(e.repeat)return;
 if(k==='1')navigateToRoom('living');if(k==='2')navigateToRoom('bedroom');if(k==='3')navigateToRoom('bathroom');
 if(k==='escape'){brain?.manual();motion.stop();furnitureActions.cancel();api.cancelInteraction()};
});
window.addEventListener('keyup',e=>{const map={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};const k=e.key.toLowerCase();if(map[k])keys[map[k]]=false});
window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
let pointer=null;
canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointerup',e=>{
 if(!canControl)return;
 if(!pointer||Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>5)return;
 const rect=canvas.getBoundingClientRect();cursor.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
 raycaster.setFromCamera(cursor,camera);
 const ceilingHits=raycaster.intersectObjects(scene.children.filter(n=>n.userData.lampId&&!n.userData.entityId),true);
 const hits=raycaster.intersectObjects(modelRoot.children,true);
 if(ceilingHits.length&&(!hits.length||ceilingHits[0].distance<hits[0].distance)){syncLighting(lighting.toggleLamp(ceilingHits[0].object.userData.lampId));toast('已切换这盏灯');return;}
 if(hits.length){
  let cur=hits[0].object;while(cur&&!cur.userData.entityId)cur=cur.parent;
  if(cur?.userData.entityId){
   const obj=FURNITURE.find(f=>f.id===cur.userData.entityId);
   if(obj){toast(obj.interact?`正在前往${obj.name}`:obj.name);
    if(obj.interact)void api.execute({type:'interact',args:{id:obj.id}}).catch(err=>toast(err.message,true));return}
  }
 }
 const p=new THREE.Vector3();
 if(raycaster.ray.intersectPlane(ground,p))void api.execute({type:'move_to',args:{x:p.x,z:p.z}}).catch(err=>toast(err.message,true));
});
el('command-form').onsubmit=async e=>{e.preventDefault();const input=el('command-input'),button=el('send-command'),text=input.value.trim(),attachments=socialChat.attachments;if(!text&&!attachments.length||button.disabled)return;if(socialChat.mediaErrors)return toast('请移除失败的附件或重试',true);button.disabled=true;button.dataset.sending='true';socialChat.freezeAttachments(true);try{await socialChat.send(text,attachments);socialChat.clearAttachments();if(input.value.trim()===text)input.value='';}catch(error){toast(error.message,true);}finally{delete button.dataset.sending;socialChat.freezeAttachments(false);button.disabled=input.disabled||socialChat.mediaBusy;}};
async function initModels(){
 const config=await fetchAssetConfig(),mode=config.mode??'remote';
 el('asset-status').textContent='正在加载';
 let allErrors=[];
 const entries=await Promise.allSettled([
  populateFurniture(modelRoot,{mode,onProgress:progress=>{
   loaded=progress.loaded;failed=progress.failed;
   el('loading-fill').style.width=`${Math.round(progress.processed/FURNITURE.length*90)}%`;
   el('loading-progress').textContent=`加载中 ${Math.round(progress.processed/progress.total*100)}%`;
  }}),
  addImportedModel(avatarRoot,{...CHARACTER_ASSET,id:'player',name:CHARACTER_ASSET.name,x:0,z:0,w:.63,d:.63,h:1.55}, {mode})
 ]);
 if(entries[0].status==='fulfilled'){
  allErrors.push(...entries[0].value.errors);
  for(const instance of entries[0].value.instances){
   furnitureInstances.set(instance.id,instance);
   if(instance.placement){
    Object.assign(FURNITURE.find(f=>f.id===instance.id),instance.placement);
    const barrier=footprint.barriers.find(b=>b.id===instance.id);
    if(barrier)Object.assign(barrier,instance.placement);
   }
   if(instance.id==='floor-lamp'||instance.id==='bed-lamp')lighting.attachImportedLamp(instance,instance.room);
  }
 }
 else allErrors.push({error:String(entries[0].reason)});
 if(entries[1].status==='fulfilled'){
  actor=entries[1].value;
  if(actor.vrm)actor.motion=createAvatarMotion(actor.vrm);
  if(actor.clips.length){
   animationMixer=new THREE.AnimationMixer(actor.model);
   const idle=actor.clips.find(clip=>/idle/i.test(clip.name));
   const walk=actor.clips.find(clip=>/walk/i.test(clip.name));
   if(idle){idleAction=animationMixer.clipAction(idle);idleAction.play();}
   if(walk){walkAction=animationMixer.clipAction(walk);walkAction.enabled=true;}
  }
 }else allErrors.push({error:String(entries[1].reason)});
 el('loading-fill').style.width='100%';
 el('asset-status').textContent=allErrors.length?'部分内容加载失败':'已就绪';
 el('loading-cover').classList.add('done');setTimeout(()=>el('loading-cover')?.remove(),900);
 if(allErrors.length)toast('部分内容加载失败，请稍后重试',true);
}
// Timeout unblocks the UI, not the in-flight GLB tasks.
const loadingTimer=setTimeout(()=>{el('loading-cover')?.classList.add('done');toast('加载较慢，请稍候',true)},25000);
void initModels().catch(err=>{console.error(err);el('loading-cover')?.remove();el('asset-status').textContent='加载失败';toast(err.message,true)}).finally(()=>clearTimeout(loadingTimer));
function resize(){
 const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
 renderer.setSize(rect.width,rect.height,false);
 const ratio=rect.width/rect.height,h=Math.max(10.4,14/ratio);
 camera.left=-h*ratio/2;camera.right=h*ratio/2;camera.top=h/2;camera.bottom=-h/2;
 camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();
function projectLabels(){
 const rect=canvas.getBoundingClientRect();
 const speech=el('speech');if(!speech.hidden){
  const pos=new THREE.Vector3(motion.position.x,1.8,motion.position.z).project(camera);
  speech.style.left=`${(pos.x*.5+.5)*rect.width}px`;speech.style.top=`${(-pos.y*.5+.5)*rect.height}px`;
 }
}
const doorBodyPosition=new THREE.Vector3();let occupiedLightingRoom=null;
const clock=new THREE.Clock();let frame=0;
function animate(){requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.055);
 if(Object.values(keys).some(Boolean)){furnitureActions.cancel();api.cancelInteraction();}
 motion.update(dt,keys);

 actor?.motion?.update(dt,motion.moving,furnitureActions.state?.type||(!motion.moving?lifeUI.gesture:null),brain?.expression);
 actor?.vrm?.update(dt);
 avatarRoot.position.set(motion.position.x,.06,motion.position.z);
 avatarRoot.rotation.y=motion.heading;
 if(actor&&!animationMixer)avatarRoot.position.y+=motion.moving?Math.abs(Math.sin(performance.now()*.0095))*.012:0;
 if(animationMixer){
  if(motion.moving!==lastMoving){
   const previous=lastMoving?walkAction:idleAction,next=motion.moving?walkAction:idleAction;
   if(next&&next!==previous){next.reset().fadeIn(.23).play();previous?.fadeOut(.23);}
   else if(!next)previous?.fadeOut(.2);
   lastMoving=motion.moving;
  }
  animationMixer.update(dt);
 }
 furnitureActions.update(dt);
 doorOccupantPosition({motion,activePose:furnitureActions.state,avatarRoot,vrm:actor?.vrm},doorBodyPosition);
 const occupiedRoom=roomAt(doorBodyPosition.x,doorBodyPosition.z);if(occupiedRoom!==occupiedLightingRoom){occupiedLightingRoom=occupiedRoom;syncLighting(lighting.setOccupiedRoom(occupiedRoom));}
 updateDoors(dt,doorBodyPosition,{path:motion.path,manual:Object.values(keys).some(Boolean)});
 controls.update();projectLabels();renderer.render(scene,camera);
 if(++frame%4===0){
 }
}
animate();
