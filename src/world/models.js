import {alignBedroomAndBath,alignDiningHeight} from './furniture-placement.js';
import {VRMLoaderPlugin,VRMUtils} from '../vendor/three-vrm.js';
/** Genuine Kenney CC0 GLB importer. No generated furniture substitutes, ever.
 *   Original: https://kenney.nl/assets/furniture-kit ; https://kenney.nl/assets/mini-characters
 *   CC0 glTF conversion: https://github.com/Hidencod/tge-assets
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {FURNITURE,CHARACTER_ASSET,furnitureRotation} from './layout.mjs';
export {ASSET_CDN,ASSET_RAW,REQUIRED_MODELS} from './asset-catalog.mjs';
import {ASSET_CDN,ASSET_RAW} from './asset-catalog.mjs';
const loader=new GLTFLoader(),cache=new Map();
export async function fetchAssetConfig(){
 try{const response=await fetch(`${import.meta.env.BASE_URL}assets/config.json`,{cache:'no-store'});return response.ok?await response.json():{mode:'local'}}
 catch{return {mode:'local'}}
}
export function assetUrl(key,mode='remote'){
 if(!/^[a-z-]+\/[a-z0-9-]+$/.test(key))throw new Error('非法的模型名称');
 return mode==='local'?`${import.meta.env.BASE_URL}assets/${key}.glb`:`${ASSET_CDN}/${key}.glb`;
}
export function loadModel(key,mode='remote'){
 const cacheKey=`${mode}:${key}`;
 if(!cache.has(cacheKey))cache.set(cacheKey,(async()=>{
   try{return await loader.loadAsync(assetUrl(key,mode));}
   catch(first){
     if(mode!=='remote')throw first;
     try{return await loader.loadAsync(`${ASSET_RAW}/${key}.glb`);}
     catch(err){throw new Error(`无法下载真实模型 ${key}: ${err.message}`)}
   }
 })());
 return cache.get(cacheKey);
}
/** Imported mesh keeps the source geometry; only one uniform metre-scale factor is applied.
 * On 90-degree rotation, the requested footprint width/depth swaps in model-local coordinates.
 */

function workSurface(model,bounds){
 const levels=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 const size=bounds.getSize(new THREE.Vector3());
 model.traverse(node=>{if(!node.isMesh)return;const p=node.geometry.attributes.position,idx=node.geometry.index;
 for(let i=0;i<(idx?idx.count:p.count);i+=3){
 a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(node.matrixWorld);
 b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(node.matrixWorld);
 c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(node.matrixWorld);
 if(Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y)>.002)continue;
 const y=(a.y+b.y+c.y)/3;if(y<bounds.min.y+size.y*.5)continue;
 const area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2;
 const key=Math.round(y*500)/500;levels.set(key,(levels.get(key)||0)+area);
 }});
 const wide=[...levels].filter(([,area])=>area>=size.x*size.z*.28).sort((a,b)=>b[0]-a[0]);
 if(!wide.length)throw Error('Cannot identify kitchen work surface');
 return wide[0][0]-bounds.min.y;
}
const stoveHeights=new Map();
async function stoveHeight(mode){
 if(!stoveHeights.has(mode))stoveHeights.set(mode,loadModel('furniture-kit/kitchenstoveelectric',mode).then(g=>{
 const m=g.scene.clone(true);m.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(m),d=b.getSize(new THREE.Vector3());
 return workSurface(m,b)*Math.min(.80/d.x,.70/d.z,.93/d.y);
 }));return stoveHeights.get(mode);
}
async function addVRM(parent,description){
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const gltf=await loader.loadAsync(description.url),vrm=gltf.userData.vrm;
 if(!vrm)throw Error('The character file has no VRM humanoid');
 VRMUtils.rotateVRM0(vrm);
 vrm.humanoid.setNormalizedPose({leftUpperArm:{rotation:[0,0,-.55,.835164]},rightUpperArm:{rotation:[0,0,.55,.835164]}});
 vrm.update(0);const model=vrm.scene;model.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 const scale=description.h/size.y;model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(model);model.position.sub(new THREE.Vector3((box.min.x+box.max.x)/2,box.min.y,(box.min.z+box.max.z)/2));
 model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;}});
 const holder=new THREE.Group();holder.name='AI Deepseek鲸鱼娘';holder.userData={entityId:'player',source:'木子恶魔/MZEM · 模之屋'};
 holder.add(model);parent.add(holder);return {holder,model,vrm,clips:[],sizeMeters:size.multiplyScalar(scale)};
}

export async function addImportedModel(parent,description,{mode='remote',tint='#c9e3ff'}={}){
 if(description.url)return addVRM(parent,description);
 const key=`${description.pack}/${description.model}`;
 const gltf=await loadModel(key,mode);
 const isCharacter=description.pack==='mini-characters';
 const model=isCharacter?cloneSkeleton(gltf.scene):gltf.scene.clone(true);
 model.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model),dimensions=bounds.getSize(new THREE.Vector3());
 const angle=furnitureRotation(description),quarterTurn=Math.abs(Math.sin(angle))>.70;
 const localW=quarterTurn?description.d:description.w;
 const localD=quarterTurn?description.w:description.d;
 const uniformScale=Math.min(localW/Math.max(.01,dimensions.x),localD/Math.max(.01,dimensions.z),description.h/Math.max(.01,dimensions.y));
 const kitchen=description.zone==='kitchen' && description.id!=='microwave';
 if(kitchen){
   const height=description.id==='fridge'?description.h:await stoveHeight(mode);
   const surface=description.id==='fridge'?dimensions.y:workSurface(model,bounds);
   model.scale.set(localW/dimensions.x,height/surface,localD/dimensions.z);
 }else model.scale.setScalar(uniformScale);

 model.updateMatrixWorld(true);
 const placedBox=new THREE.Box3().setFromObject(model);
 model.position.set(-(placedBox.min.x+placedBox.max.x)/2,-placedBox.min.y,-(placedBox.min.z+placedBox.max.z)/2);
 model.traverse(node=>{
   if(!node.isMesh)return;
   node.castShadow=true;node.receiveShadow=true;
   node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);
 });
 function copy(m){
   if(!m)return m;
   const material=m.clone();
   if(material.color)material.color.lerp(new THREE.Color(tint),isCharacter?.025:.09);
   material.roughness=Math.max(.46,material.roughness??.8);
   return material;
 }
 const holder=new THREE.Group();holder.position.set(description.x||0,description.y??.052,description.z||0);
 holder.rotation.y=angle;
 holder.name=`Kenney GLB | ${description.name||key}`;
 holder.userData={entityId:description.id??'player',key,source:'Kenney',license:'CC0-1.0'};
 holder.add(model);parent.add(holder);
 holder.updateMatrixWorld(true);
 const actual=new THREE.Box3().setFromObject(holder);
 if(['bed','bedside-left','bedside-right'].includes(description.id))holder.position.z+=.20-actual.min.z;
 if(description.id==='dresser')holder.position.z+=3.65-actual.max.z;
 holder.updateMatrixWorld(true);

 return {holder,model,clips:gltf.animations||[],sizeMeters:dimensions.multiplyScalar(uniformScale)};
}
export async function populateFurniture(parent,{mode='remote',onProgress=()=>{}}={}){
 const queue=[...FURNITURE],errors=[],instances=[];
 let processed=0;
 await Promise.all(Array.from({length:5},async()=>{
   while(queue.length){
     const item=queue.shift();
     try{const result=await addImportedModel(parent,item,{mode});instances.push({...item,...result});}
     catch(err){errors.push({id:item.id,key:item.model,error:String(err)});console.error('GLB import error',item.id,err);}
     processed++;onProgress({processed,total:FURNITURE.length,loaded:instances.length,failed:errors.length,item});
   }
 }));
 alignBedroomAndBath(instances);
 alignDiningHeight(instances);
 // Place supported appliances only after both models finish loading.
 // Counter heights are measured using the same stove reference as the cabinetry.
 const microwave=instances.find(i=>i.id==='microwave');
 const counter=instances.find(i=>i.id==='counter');
 if(microwave&&counter){
   const top=counter.holder.position.y+await stoveHeight(mode);
   microwave.holder.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(microwave.holder);
   microwave.holder.position.y+=top-bounds.min.y;
   microwave.holder.updateMatrixWorld(true);
 }
 const television=instances.find(i=>i.id==='tv');
 const tvConsole=instances.find(i=>i.id==='tv-console');
 if(television&&tvConsole){
   tvConsole.holder.updateMatrixWorld(true);television.holder.updateMatrixWorld(true);
   const top=new THREE.Box3().setFromObject(tvConsole.holder).max.y;
   const bottom=new THREE.Box3().setFromObject(television.holder).min.y;
   television.holder.position.y+=top-bottom;
   television.holder.updateMatrixWorld(true);
 }
 return {instances,errors,loaded:instances.length,failed:errors.length};
}
