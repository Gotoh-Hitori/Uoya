import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createScene,FLOOR_SLAB} from '../src/world/build-scene.js';
const bounds=node=>{node.updateMatrixWorld(true);return new THREE.Box3().setFromObject(node);};
test('continuous floor overlaps exterior/partition wall bases, floor finishes and lower plinth',()=>{
 const {scene}=createScene();
 try{
  const slab=scene.getObjectByName('Continuous structural floor slab'),box=bounds(slab);
  assert.ok(Math.abs(box.max.y-FLOOR_SLAB.top)<1e-7);assert.ok(Math.abs(box.min.y-FLOOR_SLAB.bottom)<1e-7);
  const floor=slab.parent,plinth=floor.children.find(n=>n.geometry?.parameters.width===10.05),base=bounds(plinth);
  assert.ok(box.min.y<base.max.y-.01,'slab must overlap the plinth vertically');
  const finishes=floor.children.filter(n=>n.geometry?.parameters.height===.028);assert.equal(finishes.length,3);
  for(const finish of finishes){const b=bounds(finish);assert.ok(b.min.y<box.max.y,'finish overlaps substrate');assert.ok(b.max.y>box.max.y+.001,'finish remains visible above substrate');}
  for(const mode of ['cutaway']){
   let count=0;
   for(const name of ['1:1 architecture','Cutaway inner partitions'])scene.getObjectByName(name).traverse(node=>{
    if(!node.isMesh||!['e5effd','f7fbff'].includes(node.material?.color?.getHexString()))return;
    const b=bounds(node);if(b.min.y>.1)return; // Window lintels intentionally start above the glazing.
    assert.ok(b.min.y<box.max.y-.001,mode+': no air gap below '+node.name);
    assert.ok(b.min.x>=box.min.x&&b.max.x<=box.max.x&&b.min.z>=box.min.z&&b.max.z<=box.max.z,'substrate covers full wall footprint');count++;
   });assert.ok(count>=10,'exterior wall courses were checked');
  }
 }finally{const materials=new Set();scene.traverse(n=>{n.geometry?.dispose();for(const mat of Array.isArray(n.material)?n.material:n.material?[n.material]:[])materials.add(mat);});for(const mat of materials)mat.dispose();}
});
