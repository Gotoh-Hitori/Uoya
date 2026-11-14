import {doorOccupantPosition} from '../src/world/door-occupant.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {createDoors,pathCrossesDoor} from '../src/world/doors.js';import {DOORS} from '../src/world/layout.mjs';import {makeCollisionWorld} from '../src/world/navigation.mjs';
function dispose(group){const mats=new Set();group.traverse(n=>{n.geometry?.dispose();if(n.material)mats.add(n.material);});for(const m of mats)m.dispose();}
test('all three doorway definitions have visible opaque leaves, frames and handles',()=>{const doors=createDoors();try{assert.equal(doors.records.length,3);for(const d of DOORS){const leaf=doors.group.getObjectByName(d.id+' door leaf');assert.ok(leaf?.isMesh);assert.equal(leaf.visible,true);assert.equal(leaf.material.transparent,false);assert.ok(leaf.geometry.parameters.height>=1.7);assert.ok(doors.group.getObjectByName(d.id+' lintel'));assert.equal(doors.group.getObjectsByProperty('name',d.id+' handle').length,2);}}finally{dispose(doors.group);}});
test('approaching doors opens them before crossing; leaves stay clear of the centre passage and close after leaving',()=>{const doors=createDoors();try{for(const record of doors.records){for(let i=0;i<300;i++)update(doors,1/60,{x:-10,z:-10});const d=record.door,v=d.orientation==='vertical';for(let distance=1.8;distance>=-.45;distance-=1.55/60){const p={x:d.x-(v?distance:0),z:d.z-(v?0:distance)};update(doors,1/60,p);if(Math.abs(distance)<.25){assert.ok(record.angle>.98,d.id+' must open before crossing');doors.group.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(record.leaf),dx=Math.max(b.min.x-p.x,0,p.x-b.max.x),dz=Math.max(b.min.z-p.z,0,p.z-b.max.z);assert.ok(Math.hypot(dx,dz)>.2,d.id+' leaf must clear actor');}}for(let i=0;i<300;i++)update(doors,1/60,{x:-10,z:-10});assert.equal(record.angle,0,d.id+' closes');}const world=makeCollisionWorld();for(const d of DOORS.filter(d=>d.orientation==='vertical'))assert.ok(world.isWalkable(d.x,d.z));}finally{dispose(doors.group);}});

test('closed leaves are centred between jambs and cannot swing beyond 90 degrees',()=>{const doors=createDoors();try{doors.group.updateMatrixWorld(true);for(const r of doors.records){const centre=new THREE.Box3().setFromObject(r.leaf).getCenter(new THREE.Vector3());assert.ok(Math.abs(centre.x-r.door.x)<1e-7,r.id+' x centred');assert.ok(Math.abs(centre.z-r.door.z)<1e-7,r.id+' z centred');assert.equal(Math.abs(r.opening),Math.PI/2);}for(let i=0;i<200;i++){for(const r of doors.records){update(doors,.1,{x:r.door.x,z:r.door.z});assert.ok(Math.abs(r.hinge.rotation.y-r.closed)<=Math.PI/2+1e-9);}}}finally{dispose(doors.group);}});

test('doors close promptly after crossing and clearance, but reopen on return',()=>{
 const doors=createDoors();try{for(const r of doors.records){
  const d=r.door,v=d.orientation==='vertical',point=n=>({x:d.x+(v?n:0),z:d.z+(v?0:n)});
  for(let i=0;i<90;i++)update(doors,1/60,point(-1.3));
  assert.ok(r.angle>.99);
  update(doors,1/60,point(0));
  for(let i=0;i<30;i++)update(doors,1/60,point(1.2));
  assert.ok(r.angle<.001,d.id+' closes within half a second after passing');
  for(let i=0;i<45;i++)update(doors,1/60,point(1.2));
  assert.equal(r.angle,0,d.id+' stays closed beside the room');
  for(let n=1.18;n>.2;n-=.02)update(doors,1/60,point(n));
  assert.ok(r.angle>.99,d.id+' reopens on return');
 }}finally{dispose(doors.group);}
});

// Existing geometry/crossing scenarios explicitly simulate manual control.
function update(doors,dt,position){doors.update(dt,position,{manual:true});}
test('proximity alone and nearby same-side paths do not open doors; crossing path opens only nearby',()=>{
 const doors=createDoors();try{for(const r of doors.records){
  const d=r.door,v=d.orientation==='vertical',point=(n,t=0)=>({x:d.x+(v?n:t),z:d.z+(v?t:n)});
  const from=point(-1.2),across=point(1.2);
  assert.equal(pathCrossesDoor(d,from,[across]),true);
  assert.equal(pathCrossesDoor(d,from,[point(-.7,.2)]),false);
  assert.equal(pathCrossesDoor(d,point(-1,2),[point(1,2)]),false);
  for(let i=0;i<60;i++)doors.update(1/60,from);
  assert.equal(r.angle,0,d.id+' proximity cannot open');
  for(let i=0;i<60;i++)doors.update(1/60,from,{path:[point(-.7,.2)]});
  assert.equal(r.angle,0,d.id+' unrelated path cannot open');
  for(let i=0;i<60;i++)doors.update(1/60,point(-2),{path:[across]});
  assert.equal(r.angle,0,d.id+' distant crossing cannot open');
  for(let i=0;i<60;i++)doors.update(1/60,from,{path:[across]});
  assert.ok(r.angle>.99,d.id+' nearby crossing opens');
  for(let i=0;i<60;i++)doors.update(1/60,point(0),{path:[across]});
  for(let i=0;i<60;i++)doors.update(1/60,across);
  assert.equal(r.angle,0,d.id+' closes after path crossed');
  doors.update(1/60,point(-2));
  for(let i=0;i<60;i++)doors.update(1/60,from,{manual:true});
  assert.ok(r.angle>.99,d.id+' manual control can open');
 }}finally{dispose(doors.group);}
});

test('an engaged door stays open until the wider avatar clearance is empty',()=>{
 const doors=createDoors();try{const record=doors.records.find(r=>r.id==='D3'),d=record.door;
 for(let i=0;i<90;i++)doors.update(1/60,{x:d.x-.8,z:d.z},{path:[{x:d.x+.8,z:d.z}]});
 for(let i=0;i<60;i++)doors.update(1/60,{x:d.x+.5,z:d.z});
 assert.ok(record.angle>.99,'do not close through head/hair before clearing 72 cm');
 for(let i=0;i<60;i++)doors.update(1/60,{x:d.x+.85,z:d.z});
 assert.equal(record.angle,0,'still closes quickly once safe');
 }finally{dispose(doors.group);}
});

test('bed pose releases the doorway using real body position instead of the old approach point',()=>{
 const doors=createDoors(),root=new THREE.Group(),hips=new THREE.Group(),target=new THREE.Vector3(),r=doors.records.find(r=>r.id==='D3'),d=r.door;
 root.add(hips);const motion={position:{x:d.x+.5,z:d.z}};
 const vrm={humanoid:{getRawBoneNode:name=>name==='hips'?hips:null}};
 try{
  for(let i=0;i<90;i++)doors.update(1/60,{x:d.x-.8,z:d.z},{path:[motion.position]});
  assert.ok(r.angle>.99);
  // Lying-down rigs can have an offset root; the hip bone is the actual body location.
  root.position.set(d.x+.4,0,d.z);hips.position.set(1.6,.8,-.5);
  const p=doorOccupantPosition({motion,activePose:{type:'sleep'},avatarRoot:root,vrm},target);
  assert.ok(Math.abs(p.x-(d.x+2))<1e-8);
  for(let i=0;i<60;i++)doors.update(1/60,p);
  assert.equal(r.angle,0,'door closes even though navigator remains near the door');
  const walking=doorOccupantPosition({motion,activePose:null,avatarRoot:root,vrm},target);assert.equal(walking,target);assert.equal(target.x,motion.position.x);assert.equal(target.z,motion.position.z);assert.equal(target.y,0);
  motion.position={x:7.45,z:4.82};doorOccupantPosition({motion,activePose:null,avatarRoot:root,vrm},target);assert.equal(target.x,7.45);assert.equal(target.z,4.82,'reused position buffer follows walking after leaving furniture');
 }finally{dispose(doors.group);}
});
