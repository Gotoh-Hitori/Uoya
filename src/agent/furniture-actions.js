import {sinkInteractionPose} from './sink-pose.mjs';
import * as THREE from 'three';
import {FURNITURE_ACTIONS} from './furniture-registry.mjs';
export function createFurnitureActions({root,motion,getActor,getFurniture,speak,onState,onActivate=()=>{},onLifeComplete=()=>{},now=()=>performance.now()}){
 let state=null;
 const tvStates=new Map();
 function toggleTelevision(instance){
   const on=!tvStates.get(instance.id);tvStates.set(instance.id,on);
   instance.model.traverse(node=>{if(!node.isMesh)return;for(const mat of Array.isArray(node.material)?node.material:[node.material]){
     if(!mat?.emissive)continue;
     if(!mat.userData.tvOriginal)mat.userData.tvOriginal={color:mat.emissive.getHex(),intensity:mat.emissiveIntensity};
     if(on){mat.emissive.set('#74b9ff');mat.emissiveIntensity=.38;}
     else{mat.emissive.setHex(mat.userData.tvOriginal.color);mat.emissiveIntensity=mat.userData.tvOriginal.intensity;}
   }});return on;
 }
 function makeEffect(item,box,type){
   if(!['wash','water','bathe','heat'].includes(type))return null;
   const group=new THREE.Group();group.name='Interaction effect | '+item.id;
   const material=new THREE.MeshBasicMaterial({color:type==='heat'?'#ffb75d':'#a4e8ff',transparent:true,opacity:.65,depthWrite:false});
   for(let i=0;i<14;i++){
     const mesh=new THREE.Mesh(new THREE.SphereGeometry(type==='heat'?.012:.009,6,4),material);
     mesh.userData.phase=i/14;group.add(mesh);
   }
   group.position.set((box.min.x+box.max.x)/2,box.max.y-.08,(box.min.z+box.max.z)/2);
   if(type==='water')group.position.y=box.min.y+(box.max.y-box.min.y)*.5;
   getFurniture(item.id).holder.parent.add(group);return group;
 }
 function disposeEffect(effect){if(!effect)return;effect.removeFromParent();const materials=new Set();for(const child of effect.children){child.geometry.dispose();materials.add(child.material);}for(const mat of materials)mat.dispose();}

 function cancel(){if(!state)return;disposeEffect(state.effect);state=null;root.rotation.x=0;root.rotation.z=0;onState(null);}
 function start(item){
   cancel();const config=FURNITURE_ACTIONS[item.id];if(!config)return false;
   if(!getActor())throw Error('角色仍在加载，请稍后再试');
   const instance=getFurniture(item.id);if(!instance)throw Error('家具仍在加载，请稍后再试');
   instance.holder.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(instance.holder);
   const stand=config.type==='wash'?sinkInteractionPose(item):null;
   if(stand&&Math.hypot(motion.position.x-stand.x,motion.position.z-stand.z)>.12)throw Error('请先走到洗手池正前方');
   state={stand,type:config.type,config,id:item.id,time:0,startedAt:now(),box,heading:Math.atan2(item.x-motion.position.x,item.z-motion.position.z)};
   if(stand){state.heading=stand.heading;motion.heading=stand.heading;}
   if(config.type==='sit')state.heading=item.facing==='east'?Math.PI/2:item.facing==='west'?-Math.PI/2:0;
   state.effect=makeEffect(item,box,config.type);
   if(config.toggle==='tv')state.enabled=toggleTelevision(instance);
   if(config.toggle==='light')onActivate(item);
   if(config.type==='bathe')state.heading=-Math.PI/2;
   if(item.id==='toilet')state.heading=-Math.PI/2;
   onState({type:state.type,furniture:item.id});speak(config.label+(config.duration?'':'，移动即可退出'));return true;
 }
 function update(dt){if(!state)return null;state.time=Math.max(0,(now()-state.startedAt)/1000);
   if(!state.lifeReported&&state.time>=Math.min(state.config.duration||8,8)){state.lifeReported=true;onLifeComplete(state.id);}
   if(state.config.duration&&state.time>=state.config.duration){cancel();return null;}
   if(state.effect)for(const child of state.effect.children){const t=(state.time*1.3+child.userData.phase)%1;child.position.set(Math.sin(child.userData.phase*51)*.06,-t*.25,Math.cos(child.userData.phase*31)*.045);child.scale.setScalar(state.type==='heat'?1+t:1);}
   const actor=getActor(),b=state.box;
   root.rotation.set(0,state.heading,0);
   if(state.type==='wash'&&state.stand){
     root.position.set(state.stand.x,.06,state.stand.z);motion.heading=state.heading;
   }else if(state.type==='sit'||state.type==='toilet'||state.type==='bathe'){
     root.position.set((b.min.x+b.max.x)/2,.06,(b.min.z+b.max.z)/2);
     if(state.type==='sit')root.position.z+=Math.min(.15,(b.max.z-b.min.z)*.16);
     root.updateMatrixWorld(true);
     const hips=actor.vrm?.humanoid.getNormalizedBoneNode('hips');
     if(hips){const pos=hips.getWorldPosition(new THREE.Vector3());const surface=state.type==='sit'?b.min.y+(b.max.y-b.min.y)*.42:state.type==='bathe'?b.min.y+.16:b.min.y+(b.max.y-b.min.y)*.52;root.position.y+=surface+.07-pos.y;}
   }else if(state.type==='sleep'){
     // Hair, skirts and accessories must not determine the torso's bed height.
     // Use the right half of the mattress, excluding the high headboard.
     const cx=b.min.x+(b.max.x-b.min.x)*.73,cz=(b.min.z+b.max.z)/2;
     if(state.mattressY===undefined){
       const ray=new THREE.Raycaster(new THREE.Vector3(cx,b.max.y+.2,cz),new THREE.Vector3(0,-1,0));
       const hit=ray.intersectObject(getFurniture(state.id).holder,true)[0];
       state.mattressY=hit?hit.point.y:b.min.y+(b.max.y-b.min.y)*.55;
     }
     root.rotation.set(-Math.PI/2,0,0);root.position.set(0,0,0);root.updateMatrixWorld(true);
     const humanoid=actor.vrm?.humanoid;
     const bone=name=>humanoid?.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3());
     const hips=bone('hips'),chest=bone('chest')||bone('spine');
     if(hips&&chest){
       const backY=(hips.y+chest.y)/2;
       root.position.set(cx-hips.x,state.mattressY+.085-backY,cz+.08-hips.z);
     }
     root.updateMatrixWorld(true);

   }
   return state;
 }
 return {start,cancel,update,get state(){return state;}};
}
