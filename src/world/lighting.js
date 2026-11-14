import * as THREE from 'three';
import {getLightingSnapshot,ROOM_LIGHTS,TIME_MODES} from './day-cycle.mjs';
import {LAMPS} from './lamp-config.mjs';
export function createLighting(scene,renderer){
 const hemi=new THREE.HemisphereLight('#ffffff','#7e94b9',.7);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff7ec',1.5);sun.position.set(9,13,11);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:15,top:13,bottom:-13,near:.5,far:45});
 sun.shadow.bias=-.00035;sun.shadow.normalBias=.015;scene.add(sun);sun.target.position.set(4.7,0,3.1);scene.add(sun.target);
 const config={mode:'auto',brightness:1,smart:true,overrides:{living:null,bedroom:null,bathroom:null}};
 const lamps=new Map(LAMPS.map(def=>[def.id,{...def,override:null,brightness:1,light:null,materials:[],glow:null}]));
 let snapshot=null,occupiedRoom=null;
 function addLight(lamp,x,y,z){
   const light=new THREE.PointLight(lamp.color,0,lamp.imported?3:6.7,2);light.position.set(x,y,z);light.name=lamp.name;
   if(lamp.id==='living-ceiling'){light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.001;}
   scene.add(light);lamp.light=light;return light;
 }
 for(const lamp of lamps.values()){
   if(lamp.imported)continue;
   addLight(lamp,lamp.x,2.54,lamp.z);
   const mat=new THREE.MeshStandardMaterial({color:'#d7e9fb',roughness:.35,emissive:lamp.color,emissiveIntensity:0});
   const ring=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.035,24),mat);ring.position.set(lamp.x,2.65,lamp.z);
   ring.name=lamp.name;ring.userData.lampId=lamp.id;ring.userData.lightRoom=lamp.room;scene.add(ring);lamp.materials.push(mat);
 }
 function enabled(lamp){return lamp.override??(config.smart&&occupiedRoom==='bathroom'&&lamp.room==='bathroom'&&snapshot?.phase==='night'?true:snapshot?.lights[lamp.room]??false);}
 function updateLamps(){
   for(const lamp of lamps.values()){
     const on=enabled(lamp),power=config.brightness*lamp.brightness;
     if(lamp.light)lamp.light.intensity=on?lamp.base*power*1.23:0;
     for(const material of lamp.materials){if(material.emissive){material.emissive.set(on?lamp.color:'#000000');material.emissiveIntensity=on?power*1.9:0;}}
     if(lamp.glow){lamp.glow.visible=on&&power>0;lamp.glow.material.opacity=.14*power;}
   }
 }
 function setOccupiedRoom(room){if(room!==null&&!ROOM_LIGHTS.includes(room))throw Error('未知房间');occupiedRoom=room;updateLamps();return getState();}
 function getState(){
   const lampStates=Object.fromEntries([...lamps].map(([id,lamp])=>[id,{id,name:lamp.name,room:lamp.room,enabled:enabled(lamp),brightness:lamp.brightness,override:lamp.override}]));
   const lights=Object.fromEntries(ROOM_LIGHTS.map(room=>[room,[...lamps.values()].filter(l=>l.room===room).every(enabled)]));
   return {...snapshot,smart:config.smart,occupiedRoom,lights,lamps:lampStates,overrides:{...config.overrides}};
 }
 function refresh(date=new Date()){
   snapshot=getLightingSnapshot({...config,date});
   scene.background.set(snapshot.sky);scene.fog.color.set(snapshot.fog);scene.fog.density=snapshot.phase==='night'?.016:.011;
   sun.color.set(snapshot.sunColor);sun.intensity=snapshot.sunIntensity;sun.position.set(snapshot.sunPosition.x,snapshot.sunPosition.y,snapshot.sunPosition.z);
   hemi.intensity=snapshot.ambient;hemi.color.set(snapshot.phase==='night'?'#a9ccff':'#ffffff');hemi.groundColor.set(snapshot.phase==='night'?'#304661':'#adc5e6');
   renderer.toneMappingExposure=snapshot.exposure;updateLamps();return getState();
 }
 function lampById(id){const lamp=lamps.get(id);if(!lamp)throw Error('未知灯具：'+id);return lamp;}
 function setLamp(id,on){if(typeof on!=='boolean')throw Error('开关必须是布尔值');lampById(id).override=on;updateLamps();return getState();}
 function toggleLamp(id){return setLamp(id,!enabled(lampById(id)));}
 function setRoomLight(room,on){if(!ROOM_LIGHTS.includes(room)||typeof on!=='boolean')throw Error('无效的房间开关');config.overrides[room]=on;for(const lamp of lamps.values())if(lamp.room===room)lamp.override=on;return refresh();}
 function toggleRoomLight(room){return setRoomLight(room,!getState().lights[room]);}
 function resetRoomLights(){for(const room of ROOM_LIGHTS)config.overrides[room]=null;for(const lamp of lamps.values()){lamp.override=null;lamp.brightness=1;}return refresh();}
 function setTimeMode(mode){if(!TIME_MODES.includes(mode))throw Error('无效时间模式');config.mode=mode;return refresh();}
 function setSmart(on){
   if(typeof on!=='boolean')throw Error('开关必须是布尔值');
   if(on){config.smart=true;return resetRoomLights();}
   for(const lamp of lamps.values())lamp.override=enabled(lamp);
   config.smart=false;return refresh();
 }
 function setAllLights(on){setSmart(false);for(const room of ROOM_LIGHTS)setRoomLight(room,on);return getState();}
 function attachImportedLamp({id,holder,model}){
   const lamp=lampById(id);if(lamp.light)return;
   const box=new THREE.Box3().setFromObject(holder),center=box.getCenter(new THREE.Vector3());addLight(lamp,center.x,box.max.y-.12,center.z);
   holder.userData.lampId=id;
   const mat=new THREE.MeshBasicMaterial({color:lamp.color,transparent:true,opacity:.14,depthWrite:false});
   const glow=new THREE.Mesh(new THREE.SphereGeometry(.12,20,12),mat);glow.position.copy(lamp.light.position);scene.add(glow);lamp.glow=glow;
   const materials=new Set();model.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m?.emissive)materials.add(m);});lamp.materials=[...materials];updateLamps();
 }
 return {refresh,getState,setOccupiedRoom,setLamp,toggleLamp,setSmart,setAllLights,setTimeMode,setRoomLight,toggleRoomLight,resetRoomLights,attachImportedLamp};
}
