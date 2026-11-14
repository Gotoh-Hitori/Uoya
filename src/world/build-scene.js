import {createDoors} from './doors.js';
import * as THREE from 'three';
import {PLAN,ROOMS,WALLS,DOORS,WINDOWS,FURNITURE} from './layout.mjs';

// Continuous substrate overlaps the lowest wall courses and all finish layers.
export const FLOOR_SLAB=Object.freeze({bottom:-.272,top:.028});
const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.82,...options});
const MAT={plinth:material('#80a9e7'),floor:material('#edf6ff'),wood:material('#f6faff'),
  bathroom:material('#e4f1fc'),bedroom:material('#e8f2ff'),wall:material('#f7fbff'),
  outer:material('#e5effd'),trim:material('#b5cff5'),cap:material('#ffffff'),
  blue:material('#4c8de8'),glass:material('#b8e7ff',{transparent:true,opacity:.42,depthWrite:false,metalness:.12,roughness:.17}),
  lane:material('#84bafe',{transparent:true,opacity:.36,depthWrite:false}),
};
function addBox(parent,w,h,d,x,y,z,mat,{shadow=true,name=''}={}){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(w,.001),Math.max(h,.001),Math.max(d,.001)),mat);
 mesh.position.set(x,y,z); mesh.castShadow=shadow; mesh.receiveShadow=true; mesh.name=name;
 parent.add(mesh);return mesh;
}
function addLine(parent,a,b,color='#75a5df',opacity=.6){
 const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);
 const line=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(line);return line;
}
function addFloor(scene){
 const floor=new THREE.Group();floor.name='9.4m × 6.2m architectural slab';scene.add(floor);
 addBox(floor,10.05,.27,6.87,4.7,-.33,3.1,MAT.plinth);
 addBox(floor,9.67,FLOOR_SLAB.top-FLOOR_SLAB.bottom,6.47,4.7,(FLOOR_SLAB.top+FLOOR_SLAB.bottom)/2,3.1,MAT.floor,{name:'Continuous structural floor slab'});
 addBox(floor,5.52,.028,5.82,2.96,.018,3.08,MAT.wood,{shadow:false});
 addBox(floor,3.38,.028,3.55,7.51,.02,1.88,MAT.bedroom,{shadow:false});
 addBox(floor,3.38,.028,2.21,7.51,.021,4.88,MAT.bathroom,{shadow:false});
 const grout=material('#c9ddf7',{transparent:true,opacity:.52,depthWrite:false});
 // Natural plank joints. Decoration is building material, never a fake 3D furniture model.
 for(let z=.28;z<6.05;z+=.38)addBox(floor,5.28,.002,.008,2.86,.037,z,grout,{shadow:false});
 for(let x=.32;x<5.52;x+=1.25)addBox(floor,.009,.002,5.8,x,.037,3.03,grout,{shadow:false});
 for(let z=3.92;z<6.05;z+=.43)addBox(floor,3.22,.003,.008,7.51,.042,z,grout,{shadow:false});
 for(let x=5.94;x<9.22;x+=.43)addBox(floor,.008,.003,2.08,x,.042,4.94,grout,{shadow:false});
 for(const d of DOORS.slice(1))addBox(floor,.46,.008,d.width-.03,d.x,.053,d.z,MAT.lane,{shadow:false});
 // Entrance platform (outside the walkable model, purely architectural).
 addBox(floor,1.40,.11,.35,4.77,-.15,6.48,material('#c9ddf9'));
 addBox(floor,1.19,.09,.31,4.77,-.24,6.71,material('#e0edff'));
 return floor;
}
function drawWall(parent,wall,full=false){
 let height=wall.h;
 if(wall.kind==='partition'&&full)height=PLAN.height;
 const mesh=addBox(parent,wall.w,height,wall.d,wall.x,height/2+.025,wall.z,wall.kind==='outer'?MAT.outer:MAT.wall,{name:wall.id});
 addBox(parent,wall.w+.03,.045,wall.d+.03,wall.x,height+.046,wall.z,MAT.cap,{shadow:false});
 if(wall.kind==='partition'&&height<2.5){
  const h=.032;
  addBox(parent,wall.w+.04,h,wall.d+.04,wall.x,height+.08,wall.z,MAT.trim,{shadow:false});
 }
 return mesh;
}
function windowFrame(parent,win){
 const x=win.side==='west'?.1:win.center;
 const z=win.side==='west'?win.center:(win.side==='north'?.1:6.1);
 const horizontal=win.side!=='west';const w=win.width, glassBottom=.76,glassTop=2.10, mid=(glassTop+glassBottom)/2;
 if(horizontal){
   addBox(parent,w,glassTop-glassBottom,.028,x,mid,z,MAT.glass,{shadow:false});
   for(const s of [-1,1])addBox(parent,.068,glassTop-glassBottom,.12,x+s*w/2,mid,z,MAT.cap);
   for(const y of [glassBottom,glassTop])addBox(parent,w+.10,.064,.13,x,y,z,MAT.cap);
   addBox(parent,.035,glassTop-glassBottom,.11,x,mid,z,MAT.cap);
   addBox(parent,w,.038,.13,x,(glassBottom+glassTop)/2,z,MAT.cap);
 }else{
   addBox(parent,.03,glassTop-glassBottom,w,x,mid,z,MAT.glass,{shadow:false});
   for(const s of [-1,1])addBox(parent,.12,glassTop-glassBottom,.067,x,mid,z+s*w/2,MAT.cap);
   for(const y of [glassBottom,glassTop])addBox(parent,.13,.064,w+.12,x,y,z,MAT.cap);
   addBox(parent,.12,glassTop-glassBottom,.036,x,mid,z,MAT.cap);
 }
}
function outerWallWithWindows(parent){
 const h=PLAN.height;
 // North wall contains 1200mm W1 and 1800mm W2 window; solid wall below sill/above lintel.
 const bays=[[0,1.68],[1.68,2.88],[2.88,6.47],[6.47,8.27],[8.27,9.4]];
 for(let i=0;i<bays.length;i++){
  const [a,b]=bays[i],x=(a+b)/2,w=b-a;
  if(i===1||i===3){
    addBox(parent,w,.76,.2,x,.38,.10,MAT.outer);
    addBox(parent,w,h-2.10,.2,x,(2.10+h)/2,.10,MAT.outer);
  }else addBox(parent,w,h,.2,x,h/2,.10,MAT.outer);
 }
 // West wall W3 center at z3.4 width 2.4.
 for(const [a,b,glass] of [[0,2.2,false],[2.2,4.6,true],[4.6,6.2,false]]){
   const d=b-a,z=(a+b)/2;
   if(glass){
    addBox(parent,.2,.76,d,.10,.38,z,MAT.outer);
    addBox(parent,.2,h-2.1,d,.10,(2.1+h)/2,z,MAT.outer);
   }else addBox(parent,.2,h,d,.10,h/2,z,MAT.outer);
 }
 // East wall is intact. The south cut-away is intentionally short to reveal the floor plan.
 addBox(parent,.2,h,6.2,9.30,h/2,3.10,MAT.outer);
 for(const w of WALLS.filter(o=>o.kind==='cutaway'))drawWall(parent,w);
 for(const win of WINDOWS)windowFrame(parent,win);
}
function addAtmosphere(scene){
 const grid=new THREE.GridHelper(17,34,0xcee4fa,0xcee4fa);
 grid.position.set(4.7,-.48,3.1);grid.material.transparent=true;grid.material.opacity=.26;scene.add(grid);
 // Soft backdrop for the architectural miniature
 const base=new THREE.Mesh(new THREE.PlaneGeometry(150,150),material('#e9f3ff'));
 base.rotation.x=-Math.PI/2;base.position.y=-.63;base.receiveShadow=true;scene.add(base);
}
export function createScene(){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#edf6ff');
 scene.fog=new THREE.FogExp2('#edf6ff',.019);
 // All exterior / room illumination is managed by world/lighting.js (real local time).
 addAtmosphere(scene);addFloor(scene);
 const architecture=new THREE.Group();architecture.name='1:1 architecture';scene.add(architecture);
 outerWallWithWindows(architecture);
 const partitions=new THREE.Group();partitions.name='Cutaway inner partitions';scene.add(partitions);
 for(const w of WALLS.filter(o=>o.kind==='partition'))drawWall(partitions,w,false);
 const doors=createDoors();partitions.add(doors.group);
 const debugGroup=new THREE.Group();debugGroup.name='Placement collision validation';debugGroup.visible=false;scene.add(debugGroup);
 const mat=new THREE.MeshBasicMaterial({color:'#247af1',wireframe:true,transparent:true,opacity:.5,depthTest:false});
 for(const f of FURNITURE.filter(f=>f.obstacle)){
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(f.w,.06,f.d),mat);
   mesh.position.set(f.x,.11,f.z);mesh.name=f.id;debugGroup.add(mesh);
 }
 return {scene,updateDoors:doors.update,setCollisionView:(bool)=>{debugGroup.visible=!!bool}};
}
