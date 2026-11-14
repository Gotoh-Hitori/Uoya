/** Furniture poses can move the body away from the navigator's approach point. */
export function doorOccupantPosition({motion,activePose,avatarRoot,vrm},target){
 if(!activePose)return target.set(motion.position.x,motion.position.y??0,motion.position.z);
 const hips=vrm?.humanoid?.getRawBoneNode?.('hips')||vrm?.humanoid?.getNormalizedBoneNode?.('hips');
 return (hips||avatarRoot).getWorldPosition(target);
}
