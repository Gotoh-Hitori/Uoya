import * as THREE from 'three';
import {PLAN} from './layout.mjs';
const boxOf=instance=>{instance.holder.updateMatrixWorld(true);return new THREE.Box3().setFromObject(instance.holder);};
function recordPlacement(instance){
 const box=boxOf(instance),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 instance.placement={x:center.x,z:center.z,w:size.x,d:size.z};
 Object.assign(instance,instance.placement);
}
/** Flush contact uses imported bounds; shared colliders consume these placements. */
export function alignBedroomAndBath(instances){
 const byId=id=>instances.find(instance=>instance.id===id),bed=byId('bed');
 if(bed){
  const bedBox=boxOf(bed);recordPlacement(bed);
  for(const [id,side] of [['bedside-left','left'],['bedside-right','right']]){
   const cabinet=byId(id);if(!cabinet)continue;
   const cabinetBox=boxOf(cabinet);
   cabinet.holder.position.x+=side==='left'?bedBox.min.x-cabinetBox.max.x:bedBox.max.x-cabinetBox.min.x;
   recordPlacement(cabinet);
  }
 }
 const cabinet=byId('bedside-right'),lamp=byId('bed-lamp');
 if(cabinet&&lamp){
  const support=boxOf(cabinet),light=boxOf(lamp);
  lamp.holder.position.x+=(support.min.x+support.max.x-light.min.x-light.max.x)/2;
  lamp.holder.position.z+=(support.min.z+support.max.z-light.min.z-light.max.z)/2;
  lamp.holder.position.y+=support.max.y-light.min.y;
  recordPlacement(lamp);
 }
 const bathtub=byId('bathtub');
 if(bathtub){bathtub.holder.position.x+=PLAN.width-PLAN.wall-boxOf(bathtub).max.x;recordPlacement(bathtub);}
}

/** Stretch the dining table vertically to the actual chair-back tops, keeping its feet on the floor. */
export function alignDiningHeight(instances){
 const table=instances.find(i=>i.id==='dining');
 const chairs=instances.filter(i=>['chair-w','chair-e'].includes(i.id));
 if(!table||!chairs.length)return;
 const before=boxOf(table),height=before.max.y-before.min.y;
 const target=Math.max(...chairs.map(chair=>boxOf(chair).max.y));
 if(height<=0||target<=before.min.y)return;
 table.holder.scale.y*=(target-before.min.y)/height;
 table.holder.position.y+=before.min.y-boxOf(table).min.y;
 const after=boxOf(table);
 if(table.sizeMeters)table.sizeMeters.y=after.max.y-after.min.y;
 recordPlacement(table);
}
