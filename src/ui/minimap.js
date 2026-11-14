import {PLAN,ROOMS,WALLS,DOORS,WINDOWS,FURNITURE} from '../world/layout.mjs';
const W=360,H=238,P=9;
const sx=x=>P+x/PLAN.width*(W-2*P),sz=z=>P+z/PLAN.depth*(H-2*P);
export function mapPoint(x,z){return [sx(x),sz(z)]}
export function unmapPoint(px,py){return {x:(px-P)/(W-2*P)*PLAN.width,z:(py-P)/(H-2*P)*PLAN.depth}}
export function drawMinimap(canvas,position,path=[]){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const ratio=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(W*ratio)||canvas.height!==Math.round(H*ratio)){canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio)}
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
 ctx.fillStyle='#f2f8ff';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#e7f2fe';ctx.fillRect(sx(5.82),sz(.2),sx(9.2)-sx(5.82),sz(3.65)-sz(.2));
 ctx.fillStyle='#d6eafe';ctx.fillRect(sx(5.82),sz(3.85),sx(9.2)-sx(5.82),sz(6)-sz(3.85));
 // Real obstacles are painted in neutral ink; never hide the door apertures.
 ctx.fillStyle='#b8d2ed';
 for(const item of FURNITURE.filter(f=>f.obstacle))ctx.fillRect(sx(item.x-item.w/2),sz(item.z-item.d/2),item.w/PLAN.width*(W-2*P),item.d/PLAN.depth*(H-2*P));
 ctx.strokeStyle='#456f9f';ctx.lineWidth=5.4;ctx.lineCap='butt';ctx.beginPath();
 for(const wall of WALLS){
  const a=sx(wall.x-wall.w/2),b=sx(wall.x+wall.w/2),c=sz(wall.z-wall.d/2),d=sz(wall.z+wall.d/2);
  if(wall.w>wall.d){ctx.moveTo(a,(c+d)/2);ctx.lineTo(b,(c+d)/2)}
  else{ctx.moveTo((a+b)/2,c);ctx.lineTo((a+b)/2,d)}
 }
 ctx.stroke();
 ctx.strokeStyle='#4795ef';ctx.lineWidth=4.3;ctx.beginPath();
 for(const d of DOORS){if(d.orientation==='vertical'){ctx.moveTo(sx(d.x),sz(d.z-d.width/2));ctx.lineTo(sx(d.x),sz(d.z+d.width/2))}
 else{ctx.moveTo(sx(d.x-d.width/2),sz(d.z));ctx.lineTo(sx(d.x+d.width/2),sz(d.z))}}
 ctx.stroke();
 ctx.strokeStyle='#72c5f4';ctx.lineWidth=4;ctx.beginPath();
 for(const w of WINDOWS){
  if(w.side==='west'){ctx.moveTo(sx(.1),sz(w.center-w.width/2));ctx.lineTo(sx(.1),sz(w.center+w.width/2))}
  else{const z=w.side==='north'?.1:6.1;ctx.moveTo(sx(w.center-w.width/2),sz(z));ctx.lineTo(sx(w.center+w.width/2),sz(z))}}
 ctx.stroke();
 ctx.textAlign='center';ctx.font='bold 11px system-ui';ctx.fillStyle='#426f9c';
 ctx.fillText('客餐厨',sx(2.16),sz(2.58));ctx.fillText('卧室',sx(7.44),sz(3.17));ctx.fillText('卫生间',sx(7.6),sz(5.16));
 if(path.length){ctx.strokeStyle='#277de8';ctx.lineWidth=2.8;ctx.setLineDash([5,3]);ctx.beginPath();
  path.forEach((p,i)=>{const x=sx(p.x),y=sz(p.z);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([])}
 ctx.beginPath();ctx.arc(sx(position.x),sz(position.z),7,0,2*Math.PI);ctx.fillStyle='#327ff0';ctx.fill();
 ctx.lineWidth=2.1;ctx.strokeStyle='#ffffff';ctx.stroke();
 ctx.font='bold 8px system-ui';ctx.fillStyle='#5c87b7';ctx.textAlign='left';
 ctx.fillText('9.4 m',sx(4.4),H-2);ctx.save();ctx.translate(7,sz(3.1));ctx.rotate(-Math.PI/2);ctx.fillText('6.2 m',-10,0);ctx.restore();
}
