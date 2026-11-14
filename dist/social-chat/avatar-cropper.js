export function createAvatarCropper({onConfirm}){
 const dialog=document.createElement('dialog');dialog.className='avatar-cropper';dialog.setAttribute('aria-label','裁剪头像');
 dialog.innerHTML=`<header><strong>裁剪头像</strong><button type="button" data-cancel aria-label="取消裁剪">×</button></header><p>拖动图片选择区域，调整缩放。</p><canvas width="320" height="320" tabindex="0" aria-label="正方形裁剪框，可拖动图片或使用方向键调整"></canvas><label>缩放<input type="range" min="1" max="4" step="0.01" value="1" aria-label="头像缩放"></label><footer><button type="button" data-cancel>取消</button><button type="button" data-confirm>使用此头像</button></footer>`;
 document.body.append(dialog);const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),slider=dialog.querySelector('input');
 const size=240,inset=40;let image=null,zoom=1,x=0,y=0,drag=null;
 function scale(){return Math.max(size/image.width,size/image.height)*zoom;}
 function constrain(){const s=scale();x=Math.max(size-image.width*s,Math.min(0,x));y=Math.max(size-image.height*s,Math.min(0,y));}
 function draw(){if(!image)return;constrain();const s=scale();ctx.clearRect(0,0,320,320);ctx.fillStyle='#172b42';ctx.fillRect(0,0,320,320);ctx.drawImage(image,inset+x,inset+y,image.width*s,image.height*s);ctx.fillStyle='#071421aa';ctx.fillRect(0,0,320,inset);ctx.fillRect(0,inset+size,320,inset);ctx.fillRect(0,inset,inset,size);ctx.fillRect(inset+size,inset,inset,size);ctx.strokeStyle='white';ctx.lineWidth=2;ctx.strokeRect(inset,inset,size,size);ctx.strokeStyle='#ffffff66';ctx.lineWidth=1;for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(inset+size*i/3,inset);ctx.lineTo(inset+size*i/3,inset+size);ctx.moveTo(inset,inset+size*i/3);ctx.lineTo(inset+size,inset+size*i/3);ctx.stroke();}}
 function close(){dialog.close();}
 dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=close);
 dialog.addEventListener('close',()=>{image?.close();image=null;drag=null;});
 slider.oninput=()=>{if(!image)return;const before=scale();zoom=Number(slider.value);const ratio=scale()/before;x=size/2-(size/2-x)*ratio;y=size/2-(size/2-y)*ratio;draw();};
 canvas.addEventListener('wheel',e=>{if(!image)return;e.preventDefault();const rect=canvas.getBoundingClientRect(),anchorX=Math.max(0,Math.min(size,(e.clientX-rect.left)*320/rect.width-inset)),anchorY=Math.max(0,Math.min(size,(e.clientY-rect.top)*320/rect.height-inset)),before=scale(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?320:1);zoom=Math.max(1,Math.min(4,zoom*Math.exp(-delta*.0015)));slider.value=String(zoom);const ratio=scale()/before;x=anchorX-(anchorX-x)*ratio;y=anchorY-(anchorY-y)*ratio;draw();},{passive:false});
 canvas.onpointerdown=e=>{if(!image)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};};
 canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const ratio=320/canvas.getBoundingClientRect().width;x+=(e.clientX-drag.x)*ratio;y+=(e.clientY-drag.y)*ratio;drag.x=e.clientX;drag.y=e.clientY;draw();};
 canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
 canvas.onkeydown=e=>{const offsets={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]};if(!image||!offsets[e.key])return;e.preventDefault();x+=offsets[e.key][0];y+=offsets[e.key][1];draw();};
 dialog.querySelector('[data-confirm]').onclick=()=>{if(!image)return;const output=document.createElement('canvas');output.width=output.height=256;const s=scale();output.getContext('2d').drawImage(image,-x/s,-y/s,size/s,size/s,0,0,256,256);onConfirm(output.toDataURL('image/webp',.85));close();};
 return {async open(blob){const next=await createImageBitmap(blob);if(!next.width||!next.height){next.close();throw Error('图片无法读取');}image?.close();image=next;zoom=1;slider.value='1';const s=scale();x=(size-image.width*s)/2;y=(size-image.height*s)/2;draw();dialog.showModal();},close(){if(dialog.open)close();}};
}
