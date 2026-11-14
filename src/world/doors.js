import * as THREE from 'three';
import {DOORS} from './layout.mjs';
import {openDoorBarrier,doorPose} from './door-layout.mjs';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.74,...extra});
export function pathCrossesDoor(door,position,path=[]){
 if(!position)return false;
 const normal=door.orientation==='vertical'?'x':'z',tangent=normal==='x'?'z':'x';
 let a=position;
 for(const b of path){
  const da=a[normal]-door[normal],db=b[normal]-door[normal],delta=db-da;
  if(Math.abs(delta)>1e-8&&da*db<=0){
   const t=-da/delta,along=a[tangent]+(b[tangent]-a[tangent])*t;
   if(Math.abs(along-door[tangent])<door.width/2)return true;
  }
  a=b;
 }
 return false;
}
export function createDoors(){
 const group=new THREE.Group();group.name='Architectural doors';const records=[];
 const frame=mat('#a9bfd5'),edge=mat('#b8a797'),paint=mat('#ecdfcc'),panel=mat('#f8f1e5'),bathPanel=mat('#c9dce6'),metal=mat('#8a9bab',{metalness:.65,roughness:.3});
 function box(parent,w,h,d,x,y,z,material,name){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 for(const door of DOORS){
  const vertical=door.orientation==='vertical',height=door.id==='D1'?1.82:1.72,base=.055,thickness=.045,width=door.width-.09;
  const assembly=new THREE.Group();assembly.name=door.name;assembly.userData.doorId=door.id;group.add(assembly);
  for(const side of [-1,1])box(assembly,vertical?.25:.065,height+.08,vertical?.065:.25,door.x+(vertical?0:side*door.width/2),base+(height+.08)/2,door.z+(vertical?side*door.width/2:0),frame,door.id+' jamb');
  box(assembly,vertical?.25:door.width+.065,.065,vertical?door.width+.065:.25,door.x,base+height+.0475,door.z,frame,door.id+' lintel');
  const hinge=new THREE.Group();hinge.name=door.id+' hinge';const pose=doorPose(door);
  const {closed,opening}=pose;
  // The closed leaf lies on the frame centre plane, and its travel is limited to 90 degrees.
  hinge.position.set(pose.hinge.x,base,pose.hinge.z);hinge.rotation.y=closed;assembly.add(hinge);
  const leaf=box(hinge,width,height,thickness,width/2,height/2,0,paint,door.id+' door leaf');leaf.userData.doorId=door.id;
  for(const side of [-1,1]){
   box(hinge,width-.14,height*.43,.012,width/2,height*.70,side*(thickness/2+.004),door.id==='D2'?bathPanel:panel,door.id+' upper panel');
   box(hinge,width-.14,height*.28,.012,width/2,height*.23,side*(thickness/2+.004),panel,door.id+' lower panel');
   box(hinge,.045,.16,.014,width-.13,.91,side*(thickness/2+.012),edge,door.id+' handle plate');
   box(hinge,.12,.025,.035,width-.16,.94,side*(thickness/2+.035),metal,door.id+' handle');
  }
  records.push({id:door.id,door,hinge,leaf,closed,opening,engaged:false,approachSide:0,passed:false,lastDistance:Infinity,angle:0});
 }
 function update(dt,position,{path=[],manual=false}={}){
  const elapsed=Math.max(0,Math.min(dt,.1));
  for(const record of records){
   const d=record.door,vertical=d.orientation==='vertical';
   const normal=position?(vertical?position.x-d.x:position.z-d.z):Infinity;
   const tangent=position?(vertical?position.z-d.z:position.x-d.x):Infinity;
   const distance=Math.abs(normal),side=Math.sign(normal);
   const near=position&&Math.hypot(normal,tangent)<1.6;
   const requested=manual||pathCrossesDoor(d,position,path);
   if(!near){record.approachSide=0;record.passed=false;record.engaged=false;}
   else {
    // Returning towards the doorway reopens it before the character reaches the leaf.
    if(requested&&record.passed&&distance<1.2&&distance<record.lastDistance-.002){record.passed=false;record.approachSide=side;}
    if(!record.approachSide&&side)record.approachSide=side;
    const barrier=openDoorBarrier(d),swingSide=Math.sign(vertical?barrier.x-d.x:barrier.z-d.z);
    const clearance=side===swingSide?d.width+.40:.72;
    if(side&&side!==record.approachSide&&(distance>clearance||Math.abs(tangent)>d.width/2+.45))record.passed=true;
   }
   record.lastDistance=distance;
   const openBarrier=openDoorBarrier(d),swingSide=Math.sign(vertical?openBarrier.x-d.x:openBarrier.z-d.z);
   const inSweep=Math.abs(tangent)<d.width/2+.40&&distance<(side===swingSide?d.width+.40:.72);
   // Preserve an already-open leaf while the character occupies its sweep or finishes crossing.
   const target=near&&((!record.passed&&requested)||(record.engaged&&inSweep))?1:0;
   record.engaged=target===1;
   record.angle=THREE.MathUtils.damp(record.angle,target,target?9:18,elapsed);
   if(Math.abs(record.angle-target)<.0001)record.angle=target;
   record.hinge.rotation.y=record.closed+record.opening*record.angle;
   record.leaf.userData.open=record.angle>.95;
  }
 }
 return {group,update,records};
}
