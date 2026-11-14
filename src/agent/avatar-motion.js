import * as THREE from 'three';

/** Runtime normalized humanoid poses; preserves the original VRM asset. */
export function createAvatarMotion(vrm){
 const names=['hips','spine','chest','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'];
 const bones=new Map();
 for(const name of names){const bone=vrm.humanoid.getNormalizedBoneNode(name);if(bone)bones.set(name,{bone,rest:bone.quaternion.clone()});}
 const delta=new THREE.Quaternion(),euler=new THREE.Euler();
 let time=0,phase=0,weight=0,nextBlink=2.8,blinkTime=-1,happyWeight=0,sadWeight=0;
 function rotate(name,x=0,y=0,z=0){const entry=bones.get(name);if(!entry)return;delta.setFromEuler(euler.set(x,y,z));entry.bone.quaternion.copy(entry.rest).multiply(delta);}
 return {update(dt,moving,activity=null,expression=null){
   time+=dt;weight=THREE.MathUtils.damp(weight,moving?1:0,9,dt);
   phase+=dt*9.5;const stride=Math.sin(phase)*weight,breath=Math.sin(time*2.1);
   for(const {bone,rest} of bones.values())bone.quaternion.copy(rest);
   rotate('spine',.012*breath,0,.025*stride);
   rotate('chest',.018*breath,0,-.018*stride);
   rotate('head',.015*Math.sin(time*1.4),.035*Math.sin(time*.65)*(1-weight),0);
   rotate('hips',0,.035*stride,0);
   rotate('leftUpperLeg',.48*stride);rotate('rightUpperLeg',-.48*stride);
   rotate('leftLowerLeg',Math.max(0,-Math.sin(phase))*.65*weight);
   rotate('rightLowerLeg',Math.max(0,Math.sin(phase))*.65*weight);
   rotate('leftFoot',-.15*stride);rotate('rightFoot',.15*stride);
   rotate('leftUpperArm',-.32*stride,0,.015*breath);
   rotate('rightUpperArm',.32*stride,0,-.015*breath);
   rotate('leftLowerArm',-.12*weight);rotate('rightLowerArm',-.12*weight);
   if(activity==='sit'||activity==='toilet'||activity==='bathe'){
     rotate('leftUpperLeg',-1.45);rotate('rightUpperLeg',-1.45);
     rotate('leftLowerLeg',1.45);rotate('rightLowerLeg',1.45);
     rotate('leftUpperArm',-.25);rotate('rightUpperArm',-.25);
     rotate('leftLowerArm',-.6);rotate('rightLowerArm',-.6);
   }else if(activity==='eat'){
     const bite=.5+.5*Math.sin(time*3.5);
     rotate('rightUpperArm',-.6-.35*bite,0,.3);
     rotate('rightLowerArm',-1.4-.5*bite);rotate('head',.06*bite);
   }else if(activity==='wash'||activity==='prepare'){
     rotate('spine',.1);rotate('leftUpperArm',-.65,0,-.15);rotate('rightUpperArm',-.65,0,.15);
     rotate('leftLowerArm',-.9+.18*Math.sin(time*9));rotate('rightLowerArm',-.9-.18*Math.sin(time*9));
   }else if(activity==='store'||activity==='heat'||activity==='switch'||activity==='remote'){
     const reach=.5+.5*Math.sin(time*3);rotate('rightUpperArm',-.4-.6*reach,0,.2);rotate('rightLowerArm',-.8*reach);
     rotate('spine',.06*reach);
   }else if(activity==='drink'){
     const sip=.5+.5*Math.sin(time*2.5);rotate('rightUpperArm',-.55-.3*sip);rotate('rightLowerArm',-1.4-.65*sip);rotate('head',-.04*sip);
   }else if(activity==='water'){
     rotate('spine',.15);rotate('rightUpperArm',-.75,0,.2);rotate('rightLowerArm',-.55);rotate('head',.1);
   }else if(activity==='groom'){
     rotate('rightUpperArm',-1.3,0,.35);rotate('rightLowerArm',-1.6+.15*Math.sin(time*4));rotate('head',0,.15*Math.sin(time*1.6));
   }else if(activity==='stretch'){
     const stretch=.5+.5*Math.sin(time*1.5);rotate('leftUpperArm',0,0,1.6*stretch);rotate('rightUpperArm',0,0,-1.6*stretch);rotate('spine',0,0,.1*Math.sin(time*1.5));
   }else if(activity==='sleep'){

     // Override the complete idle/walk lower body for a straight sleeping pose.
     for(const name of ['hips','spine','chest','head','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'])rotate(name);
     rotate('chest',.006*breath);
     rotate('leftLowerArm',-.06);rotate('rightLowerArm',-.06);
     rotate('leftUpperArm',0,0,.08);rotate('rightUpperArm',0,0,-.08);
     if(vrm.expressionManager?.getExpression('blink'))vrm.expressionManager.setValue('blink',1);
   }
   if(time>=nextBlink&&blinkTime<0){blinkTime=0;nextBlink=time+3.5+Math.sin(time)*.8;}
   let blink=0;if(blinkTime>=0){blinkTime+=dt;blink=Math.sin(Math.min(1,blinkTime/.18)*Math.PI);if(blinkTime>=.18)blinkTime=-1;}
   const em=vrm.expressionManager,live=expression&&Date.now()-expression.at<6000&&activity!=='sleep';
   const closure=activity==='sleep'?1:Math.max(0,blink);
   // This avatar's relaxed preset displaces eye highlights into visible white patches.
   // A small smile conveys relaxation without driving that problematic morph.
   happyWeight=THREE.MathUtils.damp(happyWeight,live?(expression.emotion==='happy'?.30:expression.emotion==='relaxed'?.10:0):0,8,dt);
   sadWeight=THREE.MathUtils.damp(sadWeight,live&&expression.emotion==='sad'?.30:0,8,dt);
   const mouth=live?Math.max(0,Math.sin(time*14))*.25:0,eyeBlend=1-closure;
   for(const [name,value] of [['relaxed',0],['happy',happyWeight*eyeBlend*(1-mouth)],['sad',sadWeight*eyeBlend],['aa',mouth],['blink',closure]])if(em?.getExpression(name))em.setValue(name,value);
 }};
}
