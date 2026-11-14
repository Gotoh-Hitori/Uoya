import {openDoorBarrier} from './door-layout.mjs';
import {LIMITS,PLAYER_RADIUS,FURNITURE,WALLS,ROOMS,DOORS} from './layout.mjs';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

export function makeCollisionWorld({furniture=FURNITURE,walls=WALLS,radius=PLAYER_RADIUS}={}){
 const barriers=[...DOORS.map(openDoorBarrier),...walls.map(w=>({id:w.id,x:w.x,z:w.z,w:w.w+(w.w<w.d?.16:0),d:w.d+(w.d<=w.w?.16:0)})),
   ...furniture.filter(f=>f.obstacle).map(f=>({id:f.id,x:f.x,z:f.z,w:f.w,d:f.d}))];
 return {
   barriers,
   safeDestination(point,from=point){
    const target={...point};
    for(const door of DOORS){const normal=door.orientation==='vertical'?'x':'z',tangent=normal==='x'?'z':'x';
     if(Math.abs(target[normal]-door[normal])<.72&&Math.abs(target[tangent]-door[tangent])<door.width/2+.22){
      const side=Math.sign(target[normal]-door[normal])||Math.sign(from[normal]-door[normal])||-1;
      for(const offset of [0,.12,-.12,.24,-.24,.36,-.36,.48,-.48,.6,-.6,.72,-.72]){const candidate={...target,[normal]:door[normal]+side*.72,[tangent]:target[tangent]+offset};if(this.isWalkable(candidate.x,candidate.z)){Object.assign(target,candidate);break;}}
     }
    }
    return target;
   },
   isWalkable(x,z){
     if(!Number.isFinite(x)||!Number.isFinite(z)) return false;
     if(x<LIMITS.minX+radius||x>LIMITS.maxX-radius||z<LIMITS.minZ+radius||z>LIMITS.maxZ-radius) return false;
     return !barriers.some(b=> Math.abs(x-b.x)<b.w/2+radius && Math.abs(z-b.z)<b.d/2+radius);
   },
   lineClear(a,b){
     if(!this.isWalkable(a.x,a.z)||!this.isWalkable(b.x,b.z))return false;
     // Exact segment/expanded-rectangle intersection prevents smoothing across tiny corners.
     for(const barrier of barriers){
       let enter=0,exit=1,intersects=true;
       for(const [axis,size] of [['x','w'],['z','d']]){
         const min=barrier[axis]-barrier[size]/2-radius+1e-8,max=barrier[axis]+barrier[size]/2+radius-1e-8,delta=b[axis]-a[axis];
         if(Math.abs(delta)<1e-12){if(a[axis]<min||a[axis]>max){intersects=false;break;}}
         else{const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit){intersects=false;break;}}
       }
       if(intersects&&enter<=exit)return false;
     }
     return true;
   },
 };
}

export function createNavigator(world=makeCollisionWorld(),step=.25){
 const cols=Math.floor((LIMITS.maxX-LIMITS.minX)/step)+1;
 const rows=Math.floor((LIMITS.maxZ-LIMITS.minZ)/step)+1;
 const grid=(x,z)=>({i:clamp(Math.round((x-LIMITS.minX)/step),0,cols-1),j:clamp(Math.round((z-LIMITS.minZ)/step),0,rows-1)});
 const point=(i,j)=>({x:LIMITS.minX+i*step,z:LIMITS.minZ+j*step});
 const key=(i,j)=>j*cols+i;
 function nearest(p){
   const ij=grid(p.x,p.z); if(world.isWalkable(...Object.values(point(ij.i,ij.j))))return ij;
   let best=null,dist=Infinity;
   for(let r=1;r<Math.max(cols,rows)&&!best;r++){
     for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){
       if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
       let i=ij.i+di,j=ij.j+dj; if(i<0||i>=cols||j<0||j>=rows)continue;
       let p2=point(i,j);if(!world.isWalkable(p2.x,p2.z))continue;
       const d=Math.hypot(p2.x-p.x,p2.z-p.z);
       if(d<dist){best={i,j};dist=d;}
     }
   }
   return best;
 }
 function findPath(start,goal){
   if(!world.isWalkable(start.x,start.z))return null;
   const a=nearest(start),b=nearest(goal);if(!a||!b)return null;
   const aKey=key(a.i,a.j),bKey=key(b.i,b.j);
   const count=cols*rows;
   const g=new Float64Array(count).fill(Infinity),prev=new Int32Array(count).fill(-1),closed=new Uint8Array(count);
   const heap=[];
   const push=(node)=>{heap.push(node);let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(heap[parent].f<=node.f)break;heap[i]=heap[parent];i=parent;}heap[i]=node;};
   const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=heap.length)break;let c=r<heap.length&&heap[r].f<heap[l].f?r:l;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out;};
   g[aKey]=0;push({id:aKey,i:a.i,j:a.j,f:0});
   const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
   let found=false;
   while(heap.length){
     const cur=pop();if(closed[cur.id])continue;
     closed[cur.id]=1;
     if(cur.id===bKey){found=true;break;}
     for(const [di,dj] of dirs){
       const i=cur.i+di,j=cur.j+dj;
       if(i<0||j<0||i>=cols||j>=rows)continue;
       const dst=point(i,j);if(!world.isWalkable(dst.x,dst.z))continue;
       if(di&&dj){const ax=point(cur.i+di,cur.j),az=point(cur.i,cur.j+dj);
         if(!world.isWalkable(ax.x,ax.z)||!world.isWalkable(az.x,az.z))continue;}
       const id=key(i,j),cost=g[cur.id]+Math.hypot(di,dj)*step;
       if(cost>=g[id])continue;
       g[id]=cost;prev[id]=cur.id;
       push({id,i,j,f:cost+Math.hypot(b.i-i,b.j-j)*step});
     }
   }
   if(!found)return null;
   const raw=[];let cursor=bKey;
   while(cursor>=0){raw.push(point(cursor%cols,Math.floor(cursor/cols)));if(cursor===aKey)break;cursor=prev[cursor];}
   raw.reverse();raw[0]={...start};
   if(world.isWalkable(goal.x,goal.z)&&world.lineClear(raw.at(-1),goal))raw.push({...goal});
   // Greedy line-of-sight compression; boundary checks use the same collider source.
   const smoothed=[raw[0]];
   let index=0;
   while(index<raw.length-1){let far=index+1;for(let i=raw.length-1;i>index+1;i--)if(world.lineClear(raw[index],raw[i])){far=i;break;}smoothed.push(raw[far]);index=far;}
   return smoothed;
 }
 return {findPath,nearest,point,world};
}

export class AgentMotion {
 constructor(navigator,initial={x:0,z:0}){
   this.nav=navigator;this.position=navigator.world.safeDestination?.(initial)||{...initial};this.path=[];this.speed=3.0;this.moving=false;
   this.heading=0;this._end=null;
 }
 stop(reason='stopped'){
   this.path=[];this.moving=false;
   if(this._end){this._end.resolve({status:reason,position:{...this.position}});this._end=null;}
 }
 goTo(goal){
   if(!goal||!Number.isFinite(goal.x)||!Number.isFinite(goal.z))return Promise.reject(new Error('目标坐标不合法'));
   goal=this.nav.world.safeDestination?.(goal,this.position)||goal;
   this.stop('interrupted');
   const path=this.nav.findPath(this.position,goal);
   if(!path)return Promise.reject(new Error('目的地无法到达'));
   this.path=path.slice(1);
   this.moving=this.path.length>0;
   if(!this.moving)return Promise.resolve({status:'arrived',position:{...this.position}});
   return new Promise((resolve,reject)=>{this._end={resolve,reject};});
 }
 update(dt,keys={}){
   const sx=(keys.right?1:0)-(keys.left?1:0);
   const sz=(keys.down?1:0)-(keys.up?1:0);
   if(this._wasManual&&!(sx||sz)&&!this.path.length){const safe=this.nav.world.safeDestination?.(this.position);if(safe&&Math.hypot(safe.x-this.position.x,safe.z-this.position.z)>.01)void this.goTo(safe).catch(()=>{});}
   this._wasManual=!!(sx||sz);
   if(sx||sz){
     if(this.path.length)this.stop('manual-override');
     const l=Math.hypot(sx,sz),dx=sx/l*this.speed*dt,dz=sz/l*this.speed*dt;
     const p=this.position;
     if(this.nav.world.isWalkable(p.x+dx,p.z))p.x+=dx;
     if(this.nav.world.isWalkable(p.x,p.z+dz))p.z+=dz;
     this.heading=Math.atan2(dx,dz);this.moving=true;
   }else if(this.path.length){
     let remaining=this.speed*dt;
     while(remaining>0&&this.path.length){
       const target=this.path[0],p=this.position;
       const dx=target.x-p.x,dz=target.z-p.z,dist=Math.hypot(dx,dz);
       if(dist<1e-5){this.path.shift();continue;}
       const move=Math.min(dist,remaining);
       this.heading=Math.atan2(dx,dz);
       p.x+=dx/dist*move;p.z+=dz/dist*move;
       remaining-=move;
       if(move>=dist-1e-5)this.path.shift();
     }
     this.moving=this.path.length>0;
     if(!this.moving&&this._end){this._end.resolve({status:'arrived',position:{...this.position}});this._end=null;}
   }else this.moving=false;
   return this.position;
 }
}

export function targetsReachable(){
 const n=createNavigator();return ['living','bedroom','bathroom'].map(id=>({room:id,reachable:!!n.findPath(ROOMS.living,ROOMS[id])}));
}
