import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {alignBedroomAndBath,alignDiningHeight} from '../src/world/furniture-placement.js';
import {PLAN,FURNITURE} from '../src/world/layout.mjs';
import {HouseAgentController} from '../src/agent/controller.mjs';
import {createNavigator} from '../src/world/navigation.mjs';
const boxOf=item=>{item.holder.updateMatrixWorld(true);return new THREE.Box3().setFromObject(item.holder);};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,message+': '+a+' vs '+b);
function item(id,x,z,w,h,d,y=.052){const holder=new THREE.Group(),model=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());model.position.y=h/2;holder.position.set(x,y,z);holder.add(model);return {id,holder,model};}
test('nightstands contact actual bed edges; lamp follows cabinet and rests on its surface; tub contacts east inner wall',()=>{
 const bed=item('bed',7.24,1.215,1.62,.85,1.96),left=item('bedside-left',6.105,.415,.37,.52,.39),right=item('bedside-right',8.375,.415,.37,.52,.39),lamp=item('bed-lamp',8.375,.415,.22,.35,.22,.58),tub=item('bathtub',8.375,4.24,1.41,.58,.6),sofa=item('sofa',1.8,3.37,2,.9,.8);
 const instances=[bed,left,right,lamp,tub,sofa],originalSofa=sofa.holder.position.clone();alignBedroomAndBath(instances);
 const b=boxOf(bed),l=boxOf(left),r=boxOf(right),light=boxOf(lamp),bath=boxOf(tub);
 close(l.max.x,b.min.x,'left contact without overlap');close(r.min.x,b.max.x,'right contact without overlap');
 close(bath.max.x,PLAN.width-PLAN.wall,'bathtub wall contact');
 close(light.min.y,r.max.y,'lamp on cabinet');close((light.min.x+light.max.x)/2,(r.min.x+r.max.x)/2,'lamp x follows cabinet');close((light.min.z+light.max.z)/2,(r.min.z+r.max.z)/2,'lamp z follows cabinet');
 assert.deepEqual(sofa.holder.position,originalSofa);
 for(const instance of [bed,left,right,lamp,tub]){const box=boxOf(instance),size=box.getSize(new THREE.Vector3());close(instance.placement.w,size.x,instance.id+' collider width');close(instance.placement.d,size.z,instance.id+' collider depth');close(instance.placement.x,(box.min.x+box.max.x)/2,instance.id+' collider position');}
 const first=instances.map(i=>i.holder.position.clone());alignBedroomAndBath(instances);instances.forEach((i,n)=>assert.ok(i.holder.position.distanceTo(first[n])<1e-8,'placement is idempotent'));
 for(const instance of instances)instance.holder.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});
});
test('partial model loading still places bathtub without requiring bed assets',()=>{const tub=item('bathtub',8,4.24,1.4,.6,.7);alignBedroomAndBath([tub]);close(boxOf(tub).max.x,PLAN.width-PLAN.wall,'independent bathtub placement');alignBedroomAndBath([]);tub.model.geometry.dispose();tub.model.material.dispose();});
test('all furniture remain approachable after bedside and bathtub layout changes',async()=>{
 const motion={position:{x:4.75,z:5.7},path:[],moving:false,nav:createNavigator(undefined,.12),async goTo(p){this.position={x:p.x,z:p.z};return {status:'arrived'};},stop(){}};
 let reached=0;const api=new HouseAgentController({motion,onInteract:()=>{reached++;return {status:'active'};}});
 for(const f of FURNITURE){motion.position={x:4.75,z:5.7};assert.equal((await api.execute({type:'interact',args:{id:f.id}})).status,'active',f.id);}
 assert.equal(reached,FURNITURE.length);
});

test('dining tabletop matches highest chair back while feet and horizontal footprint stay fixed',()=>{
 const table=item('dining',3.88,2.24,.8,.65,1.08),west=item('chair-w',3.12,2.24,.48,.90,.48),east=item('chair-e',4.64,2.24,.48,.88,.48);
 const before=boxOf(table),chairs=[boxOf(west),boxOf(east)];
 alignDiningHeight([table,west,east]);const after=boxOf(table);
 close(after.max.y,Math.max(...chairs.map(b=>b.max.y)),'tabletop at chair top');
 for(const axis of ['x','z']){close(after.min[axis],before.min[axis],'unchanged min '+axis);close(after.max[axis],before.max[axis],'unchanged max '+axis);}
 close(after.min.y,before.min.y,'feet remain grounded');
 alignDiningHeight([table,west,east]);close(boxOf(table).max.y,after.max.y,'idempotent height');
 alignDiningHeight([]);alignDiningHeight([table]);
 for(const instance of [table,west,east]){instance.model.geometry.dispose();instance.model.material.dispose();}
});
