/** Closed leaves are centred in the jamb; open leaves swing 90 degrees into the living area. */
export function doorPose(door){
 const vertical=door.orientation==='vertical',north=door.id==='D2',width=door.width-.09;
 return {width,vertical,closed:vertical?(north?-Math.PI/2:Math.PI/2):0,opening:vertical?(north?-Math.PI/2:Math.PI/2):Math.PI/2,hinge:{x:vertical?door.x:door.x-width/2,z:vertical?door.z+(north?-1:1)*width/2:door.z}};
}
export function openDoorBarrier(door){const p=doorPose(door),yaw=p.closed+p.opening,dx=Math.cos(yaw)*p.width,dz=-Math.sin(yaw)*p.width;return {id:'door-open-'+door.id,x:p.hinge.x+dx/2,z:p.hinge.z+dz/2,w:Math.abs(dx)+.045,d:Math.abs(dz)+.045};}
