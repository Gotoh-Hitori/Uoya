/** The character stands on the fixture's front centreline, looking into the basin. */
export function sinkInteractionPose(item,margin=.56){
 if(!['bath-sink','sink-left'].includes(item.id))return null;
 const normal={north:{x:0,z:-1},south:{x:0,z:1},east:{x:1,z:0},west:{x:-1,z:0}}[item.facing];
 if(!normal)return null;
 const distance=(normal.x?item.w:item.d)/2+margin;
 return {x:item.x+normal.x*distance,z:item.z+normal.z*distance,heading:Math.atan2(-normal.x,-normal.z)};
}
