import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAN,LIMITS,DOORS,WINDOWS,WALLS,FURNITURE,ROOMS,PLAYER_RADIUS,roomAt,FACING_ROTATION,KITCHEN_RUN_IDS,furnitureRotation} from '../src/world/layout.mjs';
import {makeCollisionWorld,createNavigator,AgentMotion} from '../src/world/navigation.mjs';
const world=makeCollisionWorld(),nav=createNavigator(world,.10);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
test('A-806 architectural dimensions are exact, including door/window schedule',()=>{
 assert.equal(PLAN.width,9.4);assert.equal(PLAN.depth,6.2);assert.equal(PLAN.wall,.2);
 assert.equal(DOORS.find(d=>d.id==='D1').width,1.0);
 assert.equal(DOORS.find(d=>d.id==='D2').width,.9);
 assert.equal(DOORS.find(d=>d.id==='D3').width,.9);
 assert.deepEqual(WINDOWS.map(w=>w.width),[1.2,1.8,2.4,.9]);
 assert.ok(PLAN.width/PLAN.depth>1.5&&PLAN.width/PLAN.depth<1.53);
});
test('all 30 furniture instances have reasonable 1:1 metre-scale room footprints',()=>{
 assert.equal(FURNITURE.length,30);
 for(const id of ['armchair','chair-n','chair-s'])assert.equal(FURNITURE.some(f=>f.id===id),false,'removed item '+id);
 for(const f of FURNITURE){
  assert.ok(f.pack==='furniture-kit');assert.ok(f.model);
  assert.ok(f.w>.15&&f.w<2.4&&f.d>.14&&f.d<2.4&&f.h>.02&&f.h<2.5,`invalid scale ${f.id}`);
  assert.ok(f.x-f.w/2>=.12&&f.x+f.w/2<=9.28,`x footprint ${f.id}`);
  assert.ok(f.z-f.d/2>=.12&&f.z+f.d/2<=6.08,`z footprint ${f.id}`);
 }
});
test('each room destination is not inside a wall or furniture footprint',()=>{
 for(const room of Object.values(ROOMS))assert.ok(world.isWalkable(room.x,room.z),room.id);
});
test('all three door centres are real omitted wall segments (not virtual tunnels)',()=>{
 for(const d of DOORS){
  if(d.id==='D1')continue;assert.equal(d.orientation,'vertical');
  assert.equal(world.isWalkable(d.x,d.z),true,d.id);
  assert.equal(world.isWalkable(d.x,d.z-(d.width/2+.30)),false,`${d.id} top lintel wall`);
  assert.equal(world.isWalkable(d.x,d.z+(d.width/2+.30)),false,`${d.id} bottom lintel wall`);
 }
});
test('no diagonal corner cutting, wall rectangle and furniture footprints stop movement',()=>{
 assert.equal(world.isWalkable(-.01,2),false);
 assert.equal(world.isWalkable(5.72,.7),false);
 assert.equal(world.isWalkable(7.54,1.57),false);
 assert.equal(world.isWalkable(8.24,4.24),false);
 assert.equal(world.lineClear({x:5.3,z:1.1},{x:6.1,z:1.1}),false);
 assert.equal(world.lineClear({x:5.35,z:2.15},{x:6.0,z:2.15}),true);
});
test('bidirectional 3-room connectivity including bedroom-to-bathroom',()=>{
 for(const a of Object.values(ROOMS))for(const b of Object.values(ROOMS)){
  const path=nav.findPath(a,b);assert.ok(path?.length,`${a.id} → ${b.id}`);
  for(const p of path)assert.ok(world.isWalkable(p.x,p.z),`${a.id} → ${b.id}: path collision`);
  for(let i=1;i<path.length;i++)assert.ok(world.lineClear(path[i-1],path[i]),`${a.id}→${b.id}: illegal shortcut`);
 }
});
test('real motion simulation: entry hall to bedroom, then bathroom, then sofa side',async()=>{
 const agent=new AgentMotion(nav,{x:4.75,z:5.70});agent.speed=1.45;
 for(const goal of [ROOMS.bedroom,ROOMS.bathroom,ROOMS.living]){
  const travel=agent.goTo(goal);
  for(let frame=0;frame<2000&&agent.path.length;frame++){
   agent.update(1/60,{});
   assert.ok(world.isWalkable(agent.position.x,agent.position.z));
  }
  const result=await travel;assert.equal(result.status,'arrived');
  assert.ok(dist(agent.position,goal)<.08,`destination ${goal.id}`);
 }
});
test('manual WASD cannot pass the partition wall',()=>{
 const a=new AgentMotion(nav,{x:5.31,z:.9});
 for(let i=0;i<300;i++)a.update(1/60,{right:true});
 assert.ok(a.position.x<5.43,'cannot walk into wall');
});
test('roomAt distinguishes right-upper bedroom from right-lower bathroom',()=>{
 assert.equal(roomAt(2.4,4.7),'living');assert.equal(roomAt(7.1,1.7),'bedroom');assert.equal(roomAt(7.1,5),'bathroom');
});

const byId=id=>FURNITURE.find(item=>item.id===id);
test('kitchen counter units form one coherent north-wall run with no module-sized gaps',()=>{
 const units=KITCHEN_RUN_IDS.map(byId);
 assert.equal(units.length,7);
 assert.ok(units.every(u=>u.zone==='kitchen'));
 for(let i=1;i<units.length;i++){
  const left=units[i-1],right=units[i];
  const gap=(right.x-right.w/2)-(left.x+left.w/2);
  assert.ok(Math.abs(gap)<=.012,`${left.id} -> ${right.id} seam ${gap.toFixed(4)}m`);
  assert.ok(Math.abs(left.z-right.z)<.10,'kitchen models should share a north-wall depth line');
 }
});
test('dining chairs face table, television faces sofa and sofa faces television',()=>{
 const facingAngle=item=>furnitureRotation(item);
 const aim=(from,to)=>({x:to.x-from.x,z:to.z-from.z});
 const cosine=(a,v)=>{const f={x:Math.sin(a),z:Math.cos(a)};return (f.x*v.x+f.z*v.z)/Math.hypot(v.x,v.z)};
 const table=byId('dining');
 assert.equal(FURNITURE.filter(f=>f.id.startsWith('chair-')).length,2);
 assert.equal(table.rot,Math.PI/2);assert.ok(table.d>table.w,'table long edge now runs north-south');
 for(const id of ['chair-w','chair-e']){
  const chair=byId(id);assert.ok(cosine(facingAngle(chair),aim(chair,table))>.94,id);
 }
 const sofa=byId('sofa'),tv=byId('tv');
 assert.ok(cosine(facingAngle(tv),aim(tv,sofa))>.99,'TV screen faces seating');
 assert.ok(cosine(facingAngle(sofa),aim(sofa,tv))>.99,'sofa faces TV');
});
test('single sofa model (no extra chaise/ottoman) and carpet placed ahead of it',()=>{
 const sofa=byId('sofa'),rug=byId('rug');
 assert.equal(sofa.model,'loungesofa');
 assert.equal(FURNITURE.filter(x=>/sofa/i.test(x.model)).length,1);
 assert.ok(rug.z-rug.d/2>=sofa.z+sofa.d/2-.002,'rug should not protrude through sofa');
});

test('path smoothing does not graze the sofa corner while routing around open doors',()=>{assert.equal(world.isWalkable(4.32,4.08),true);assert.equal(world.isWalkable(3,2.76),true);assert.equal(world.lineClear({x:4.32,z:4.08},{x:3,z:2.76}),false);});

test('wall buffer and idle door destinations keep the avatar back from architecture',async()=>{
 const empty=makeCollisionWorld({furniture:[]});
 assert.equal(empty.isWalkable(.43,3.4),false,'wall safety margin exceeds the old 20 cm body radius');
 assert.equal(empty.isWalkable(.50,3.4),true);
 const motion=new AgentMotion(createNavigator(world,.1),{x:4.77,z:5.3});
 const pending=motion.goTo({x:4.77,z:6.1});
 for(let i=0;i<180;i++)motion.update(1/60);
 assert.equal((await pending).status,'arrived');
 assert.ok(6.1-motion.position.z>=.719,'door clicks stop outside the closed leaf zone');
 const manual=new AgentMotion(createNavigator(world,.1),{x:4.77,z:5.4});manual.speed=1;
 for(let i=0;i<18;i++)manual.update(1/60,{down:true});
 for(let i=0;i<120;i++)manual.update(1/60,{});
 assert.ok(6.1-manual.position.z>=.719,'releasing WASD retreats out of door space');
 const initial=new AgentMotion(createNavigator(world,.1),{x:4.77,z:5.7});
 assert.ok(6.1-initial.position.z>=.719,'initial idle pose does not overlap a closed door');
});
