/** One-bedroom architectural blueprint: CADChange A-806. All coordinates and sizes in metres.
 * Plan origin (0,0) = NORTH-WEST OUTER CORNER; x grows east, z grows south.
 * Source bounding dimension: 9400 mm x 6200 mm. Outer walls .20m; D1=1.0m, D2/D3=.90m.
 * Geometry, minimap, collisions and AI use this single authoritative dataset.
 */
export const PLAN = Object.freeze({width:9.4,depth:6.2,wall:.2,height:2.75,source:'CADChange A-806',scale:'1:50'});
export const LIMITS = Object.freeze({minX:0,maxX:9.4,minZ:0,maxZ:6.2});
export const PLAYER_RADIUS=.20;
export const DOORS=Object.freeze([
  {id:'D1',name:'入户门',orientation:'horizontal',x:4.77,z:6.10,width:1.00,from:'outside',to:'living'},
  {id:'D3',name:'卧室门',orientation:'vertical',x:5.72,z:2.15,width:.90,from:'living',to:'bedroom'},
  {id:'D2',name:'卫生间门',orientation:'vertical',x:5.72,z:4.94,width:.90,from:'living',to:'bathroom'},
]);
export const WINDOWS=Object.freeze([
  {id:'W1',side:'north',center:2.28,width:1.20,type:'sliding'},
  {id:'W2',side:'north',center:7.37,width:1.80,type:'fixed'},
  {id:'W3',side:'west',center:3.40,width:2.40,type:'sliding'},
  {id:'W4',side:'south',center:8.05,width:.90,type:'fixed'},
]);
export const ROOMS=Object.freeze({
  living:{id:'living',name:'客餐厨',english:'LIVING · DINING · KITCHEN',x:4.34,z:4.05,area:31.3,color:'#f2f8ff'},
  bedroom:{id:'bedroom',name:'卧室',english:'BEDROOM',x:6.15,z:3.02,area:11.6,color:'#e9f4ff'},
  bathroom:{id:'bathroom',name:'卫生间',english:'BATHROOM',x:6.53,z:5.03,area:7.5,color:'#e2f0fc'},
});
/** Wall rectangle footprints: x,z center; w,d full size. Door gaps are REAL omissions. */
export const WALLS=Object.freeze([
  {id:'north',x:4.7,z:.10,w:9.4,d:.20,h:2.72,kind:'outer'},
  {id:'west',x:.10,z:3.10,w:.20,d:6.20,h:2.72,kind:'outer'},
  {id:'east',x:9.30,z:3.10,w:.20,d:6.20,h:2.72,kind:'outer'},
  {id:'south-left',x:2.135,z:6.10,w:4.27,d:.20,h:.60,kind:'cutaway'},
  {id:'south-right',x:(5.27+9.4)/2,z:6.10,w:9.4-5.27,d:.20,h:.60,kind:'cutaway'},
  // Right-hand divider: top wall / .9m D3 aperture / middle wall / .9m D2 / bottom wall
  {id:'divide-top',x:5.72,z:(.20+1.70)/2,w:.20,d:1.50,h:1.35,kind:'partition'},
  {id:'divide-middle',x:5.72,z:(2.60+4.49)/2,w:.20,d:4.49-2.60,h:1.35,kind:'partition'},
  {id:'divide-bottom',x:5.72,z:(5.39+6.00)/2,w:.20,d:6.00-5.39,h:1.35,kind:'partition'},
  {id:'bed-bath',x:(5.82+9.20)/2,z:3.75,w:9.20-5.82,d:.20,h:1.25,kind:'partition'},
]);
const k=(id,name,model,room,x,z,w,d,h,opts={})=>({id,name,pack:'furniture-kit',model,room,x,z,w,d,h,obstacle:true,interact:id,...opts});
/** Target footprints are 1:1 residential-scale bounding envelopes; Y and rotations in radians.
 * Visual mesh comes from REAL Kenney GLBs. Nothing in this array is procedurally fabricated furniture.
 * `w,d` are conservative collision envelopes, not arbitrary GLB aspect-ratio distortions.
 */
export const FURNITURE=Object.freeze([
  // V3.1: a coherent north-wall kitchen, modules touch edge-to-edge (<=1cm seams).
  // Every cabinet/appliance below loads an ORIGINAL CC0 Kenney GLB, not a generated cabinet.
  k('washer','洗衣机预留位 · 实际展示橱柜','kitchencabinetdrawer','living',.56,.55,.72,.70,.89,{facing:'south',zone:'kitchen'}),
  k('sink-left','双水槽','kitchensink','living',1.33,.55,.82,.70,.93,{facing:'south',interact:'sink',zone:'kitchen'}),
  k('base-01','水槽旁收纳柜','kitchencabinet','living',2.03,.55,.58,.70,.92,{facing:'south',zone:'kitchen'}),
  k('stove','灶台','kitchenstoveelectric','living',2.72,.55,.80,.70,.93,{facing:'south',interact:'stove',zone:'kitchen'}),
  k('counter','备餐抽屉柜','kitchencabinetdrawer','living',3.49,.55,.74,.70,.92,{facing:'south',zone:'kitchen'}),
  k('base-02','冰箱旁收纳柜','kitchencabinet','living',4.19,.55,.66,.70,.92,{facing:'south',zone:'kitchen'}),
  k('fridge','冰箱','kitchenfridgelarge','living',4.91,.61,.77,.81,1.87,{facing:'south',interact:'fridge',zone:'kitchen'}),
  k('microwave','微波炉','kitchenmicrowave','living',3.49,.55,.39,.34,.34,{y:.94,obstacle:false,facing:'south',zone:'kitchen'}),
  // Real 4-chair dining set. The chair FRONT is toward the table, never the opposite way.
  k('dining','双人餐桌','tablecross','living',3.88,2.24,.80,1.08,.76,{rot:Math.PI/2,interact:'dining'}),
  k('chair-w','西侧餐椅','chaircushion','living',3.12,2.24,.48,.48,.90,{facing:'east'}),
  k('chair-e','东侧餐椅','chaircushion','living',4.64,2.24,.48,.48,.90,{facing:'west'}),
  // One single, unambiguous Kenney sofa (no ottoman, loose extra cushion or chaise).
  // Carpet starts ahead of sofa; it is not incorrectly fused into the sofa body.
  k('sofa','双人沙发','loungesofa','living',1.80,3.37,2.04,.82,.95,{facing:'south',interact:'sofa'}),
  k('rug','圆地毯','ruground','living',1.80,4.68,1.68,1.68,.035,{obstacle:false,y:.039}),
  k('coffee','茶几','tablecoffee','living',1.80,4.55,.91,.56,.44,{interact:'coffee'}),
  k('tv-console','电视柜','cabinettelevisiondoors','living',1.80,5.76,1.90,.43,.52,{facing:'north'}),
  k('tv','电视','televisionmodern','living',1.80,5.76,1.09,.20,.69,{y:.57,obstacle:false,facing:'north',interact:'tv'}),
  k('side-plant','绿植','pottedplant','living',.53,4.55,.48,.48,1.30),
  k('floor-lamp','落地灯','lamproundfloor','living',.55,5.02,.40,.40,1.52,{interact:'lamp'}),
  k('entrance-cabinet','玄关柜','sidetabledrawers','living',3.63,5.78,.63,.38,.77,{facing:'north'}),
  // Bedroom: wardrobe against east, bed towards north, nightstands by the headboard.
  k('bed','双人床','beddouble','bedroom',7.24,1.215,1.82,2.03,.93,{facing:'south',interact:'bed'}),
  k('bedside-left','左床头柜','cabinetbeddrawer','bedroom',6.105,.415,.45,.43,.56,{facing:'south'}),
  k('bedside-right','右床头柜','cabinetbeddrawer','bedroom',8.375,.415,.45,.43,.56,{facing:'south'}),
  k('bed-lamp','床头灯','lamproundtable','bedroom',8.375,.415,.27,.27,.40,{y:.58,obstacle:false,interact:'lamp'}),
  k('wardrobe','推拉衣柜','bookcasecloseddoors','bedroom',8.95,2.40,.52,1.52,2.15,{facing:'west',interact:'wardrobe'}),
  k('dresser','卧室矮柜','sidetabledrawers','bedroom',6.96,3.44,.93,.42,.79,{facing:'north'}),
  k('bedroom-plant','卧室绿植','plantsmall2','bedroom',8.47,3.23,.36,.36,.56),
  // Real Kenney bathroom fixtures.
  k('bathtub','浴缸','bathtub','bathroom',8.375,4.24,1.65,.72,.69,{interact:'bathtub'}),
  k('toilet','坐便器','toilet','bathroom',8.93,5.40,.61,.68,.82,{facing:'west',interact:'toilet'}),
  k('bath-sink','洗手台','bathroomsink','bathroom',7.16,5.73,.76,.44,.85,{facing:'north',interact:'bath-sink'}),
  k('bath-mirror','浴室镜','bathroommirror','bathroom',7.16,5.73,.71,.17,.77,{y:1.09,obstacle:false,facing:'north'}),
]);
/** Human-readable forward directions, with +Z as the Kenney furniture reference front.
 * Keep this separate from model coordinates so a different source pack can be calibrated once.
 */
export const FACING_ROTATION=Object.freeze({south:0,west:-Math.PI/2,north:Math.PI,east:Math.PI/2});
export const KITCHEN_RUN_IDS=Object.freeze(['washer','sink-left','base-01','stove','counter','base-02','fridge']);
export function furnitureRotation(item){return item.facing?FACING_ROTATION[item.facing]:(item.rot??0);}
export const CHARACTER_ASSET=Object.freeze({url:'/assets/avatar/blue-fish.vrm',name:'蓝色小肥鱼 Deepseek鲸鱼娘'});
export function roomAt(x,z){return x>=5.82?(z<3.75?'bedroom':'bathroom'):'living';}
export function doorById(id){return DOORS.find(door=>door.id===id);}
