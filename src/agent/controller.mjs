import {sinkInteractionPose} from './sink-pose.mjs';
import {LAMPS,LAMP_IDS} from '../world/lamp-config.mjs';
import {FURNITURE_ACTIONS} from './furniture-registry.mjs';
/** Safe command boundary between keyboard, web UI, future AI providers and the game.
 * Tools are whitelisted, input validated, navigation uses shared map/colliders. No eval.
 */
import {FURNITURE,ROOMS,LIMITS,roomAt} from '../world/layout.mjs';
import {ROOM_LIGHTS,TIME_MODES} from '../world/day-cycle.mjs';
const INTERACTABLE=FURNITURE.filter(f=>f.interact).map(f=>f.id);
export const AGENT_TOOLS=Object.freeze([
 {name:'set_lamp',description:'Control one lamp independently',parameters:{type:'object',properties:{id:{type:'string',enum:LAMP_IDS},enabled:{type:'boolean'}},required:['id','enabled'],additionalProperties:false}},
 {name:'get_state',description:'Read character position, current room and available 3D actions',parameters:{type:'object',properties:{},additionalProperties:false}},
 {name:'goto_room',description:'Navigate into a room using A* pathfinding',parameters:{type:'object',properties:{room:{type:'string',enum:Object.keys(ROOMS)}},required:['room'],additionalProperties:false}},
 {name:'move_to',description:'Navigate to 1:1 metre-scale floor coordinates; x=0..9.4 (west-east), z=0..6.2 (north-south)',parameters:{type:'object',properties:{x:{type:'number'},z:{type:'number'}},required:['x','z'],additionalProperties:false}},
 {name:'interact',description:'Approach furniture and perform its corresponding action',parameters:{type:'object',properties:{id:{type:'string',enum:INTERACTABLE}},required:['id'],additionalProperties:false}},
 {name:'speak',description:'Say a short text in a character speech bubble',parameters:{type:'object',properties:{text:{type:'string',maxLength:150}},required:['text'],additionalProperties:false}},
 {name:'stop',description:'Stop the current movement',parameters:{type:'object',properties:{},additionalProperties:false}},
 {name:'set_light',description:'Turn a room light on/off. Room can be living, bedroom, bathroom, or all',parameters:{type:'object',properties:{room:{type:'string',enum:[...ROOM_LIGHTS,'all']},enabled:{type:'boolean'}},required:['room','enabled'],additionalProperties:false}},
 {name:'set_time_mode',description:'Use client local system time (auto) or preview morning/day/dusk/night',parameters:{type:'object',properties:{mode:{type:'string',enum:TIME_MODES}},required:['mode'],additionalProperties:false}},
]);
const validObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function validateCommand(input){
 if(!validObject(input))throw Error('指令必须为对象');
 const type=input.type??input.name,args=input.args??input.arguments??{};
 const def=AGENT_TOOLS.find(t=>t.name===type);
 if(!def)throw Error(`非法动作：${String(type).slice(0,32)}`);
 if(!validObject(args))throw Error('动作参数必须为对象');
 const properties=def.parameters.properties;
 for(const name of Object.keys(args))if(!(name in properties))throw Error(`不允许的参数：${name}`);
 for(const field of def.parameters.required??[])if(!(field in args))throw Error(`缺少参数：${field}`);
 for(const [name,value] of Object.entries(args)){
  const schema=properties[name];if(typeof value!==schema.type)throw Error(`${name} 类型错误`);
  if(schema.enum&&!schema.enum.includes(value))throw Error(`${name} 不在可用范围`);
  if(typeof value==='number'&&!Number.isFinite(value))throw Error(`${name} 必须有限数字`);
  if(schema.maxLength&&value.length>schema.maxLength)throw Error(`${name} 超出允许长度`);
 }
 if(type==='move_to'&&(args.x<LIMITS.minX||args.x>LIMITS.maxX||args.z<LIMITS.minZ||args.z>LIMITS.maxZ))throw Error('目的地超出 9.4 × 6.2m 户型');
 if(type==='speak'&&!args.text.trim())throw Error('对话内容不能为空');
 return {type,args};
}
export class HouseAgentController{
 constructor({motion,onInteract=()=>{},onSpeak=()=>{},lighting=null}){
  this.motion=motion;this.onInteract=onInteract;this.onSpeak=onSpeak;this.lighting=lighting;this.listeners=new Set();
 }
 cancelInteraction(){this.interactionToken=(this.interactionToken??0)+1;}
 getState(){
  const p=this.motion.position;
  return {version:'3.1',unit:'metres',position:{x:+p.x.toFixed(3),z:+p.z.toFixed(3)},
   activity:this.activity??null,room:roomAt(p.x,p.z),moving:this.motion.moving,remainingWaypoints:this.motion.path.length,
   availableRooms:Object.keys(ROOMS),availableInteractions:INTERACTABLE,interactionDetails:INTERACTABLE.map(id=>({id,...FURNITURE_ACTIONS[id]})),
   ...(this.lighting?{lighting:this.lighting.getState()}:{} )};
 }
 subscribe(fn){if(typeof fn!=='function')throw TypeError('订阅对象应为函数');this.listeners.add(fn);return ()=>this.listeners.delete(fn)}
 emit(event){for(const fn of this.listeners)try{fn(event)}catch(err){console.warn('Agent subscriber error',err)}}
 async execute(input){
  const {type,args}=validateCommand(input);if(['interact','move_to','goto_room','stop'].includes(type))this.cancelInteraction();const token=this.interactionToken;this.emit({event:'start',type,args,state:this.getState()});
  try{
   let result;
   if(type==='get_state')result=this.getState();
   else if(type==='goto_room')result=await this.motion.goTo(ROOMS[args.room]);
   else if(type==='move_to')result=await this.motion.goTo(args);
   else if(type==='stop'){this.motion.stop();result={status:'stopped'}}
   else if(type==='speak'){this.onSpeak(args.text);result={status:'spoken'}}
   else if(type==='set_lamp'){
    if(!this.lighting)throw Error('灯光控制器未就绪');
    this.lighting.setLamp(args.id,args.enabled);
    result={status:'lamp-updated',lighting:this.lighting.getState()};
   }
   else if(type==='set_light'){
    if(!this.lighting)throw Error('尚未配置灯光控制器');
    const rooms=args.room==='all'?ROOM_LIGHTS:[args.room];
    for(const room of rooms)this.lighting.setRoomLight(room,args.enabled);
    result={status:'light-updated',lighting:this.lighting.getState()};
   }
   else if(type==='set_time_mode'){
    if(!this.lighting)throw Error('尚未配置灯光控制器');
    this.lighting.setTimeMode(args.mode);result={status:'time-mode-updated',lighting:this.lighting.getState()};
   }

   else if(type==='interact'){
    const f=FURNITURE.find(item=>item.id===args.id&&item.interact);
    const supports={microwave:'counter',tv:'tv-console','bed-lamp':'bedside-right','bath-mirror':'bath-sink'};
    const target=FURNITURE.find(item=>item.id===supports[f.id])||f;
    const options=[];
    const margin=.36;
    const front=sinkInteractionPose(target);
    if(front){
     if(this.motion.nav.world.isWalkable(front.x,front.z)){const path=this.motion.nav.findPath(this.motion.position,front);if(path)options.push({...front,cost:0});}
    }else for(let i=0;i<=16;i++){
     const t=i/16;
     for(const {x,z} of [{x:target.x-target.w/2-margin,z:target.z-target.d/2+target.d*t},{x:target.x+target.w/2+margin,z:target.z-target.d/2+target.d*t},{x:target.x-target.w/2+target.w*t,z:target.z-target.d/2-margin},{x:target.x-target.w/2+target.w*t,z:target.z+target.d/2+margin}]){
      if(!this.motion.nav.world.isWalkable(x,z))continue;
      const path=this.motion.nav.findPath(this.motion.position,{x,z});
      if(path)options.push({x,z,cost:path.reduce((sum,p,j)=>j?sum+Math.hypot(p.x-path[j-1].x,p.z-path[j-1].z):sum,0)});
     }
    }
    if(!options.length)throw Error(`无法安全接近 ${f.name}`);
    options.sort((a,b)=>a.cost-b.cost);
    result=await this.motion.goTo(options[0]);
    if(result.status==='arrived'&&token===this.interactionToken){if(front){if(Math.hypot(this.motion.position.x-front.x,this.motion.position.z-front.z)>.08)throw Error('尚未到达洗手池正前方');this.motion.heading=front.heading;}const action=await this.onInteract(f);if(action)result={...result,...action};}
   }
   this.emit({event:'finish',type,args,result,state:this.getState()});return result;
  }catch(err){this.emit({event:'error',type,args,message:err.message});throw err}
 }
 async executePlan(steps){
  if(!Array.isArray(steps)||steps.length>6)throw Error('动作序列不能超过 6 步');
  for(const step of steps)validateCommand(step);
  const results=[];for(const step of steps)results.push(await this.execute(step));return results;
 }
}
export function parseLocalCommand(raw){
 const s=String(raw??'').trim();if(!s)return [];
 const coords=s.match(/^\/?goto\s+([0-9.]+)\s+([0-9.]+)$/i);
 if(coords)return [{type:'move_to',args:{x:Number(coords[1]),z:Number(coords[2])}}];
 if(/停止|停下|stop/i.test(s))return [{type:'stop',args:{}}];
 const lamp=LAMPS.find(l=>s.includes(l.name)||s.includes(l.id))||(/床头灯/.test(s)?LAMPS.find(l=>l.id==='bed-lamp'):/落地灯/.test(s)?LAMPS.find(l=>l.id==='floor-lamp'):null);
 if(lamp&&/开|关|on|off/i.test(s))return [{type:'set_lamp',args:{id:lamp.id,enabled:!/关|off/i.test(s)}}];
 const lightRoom=/卧室|床头/i.test(s)?'bedroom':/卫生间|浴室|厕所/i.test(s)?'bathroom':/全屋|所有|全部/i.test(s)?'all':'living';
 if(/灯|照明|light/i.test(s)&&/打开|开灯|点亮|关灯|关闭|关掉|熄灭|turn on|turn off/i.test(s))
   return [{type:'set_light',args:{room:lightRoom,enabled:!/关闭|关灯|关掉|熄灭|turn off/i.test(s)}}];
 if(/自动时间|跟随系统时间|实时光照/i.test(s))return [{type:'set_time_mode',args:{mode:'auto'}}];
 if(/模拟夜晚|切换夜晚|夜间模式/i.test(s))return [{type:'set_time_mode',args:{mode:'night'}}];
 if(/模拟清晨|早晨模式/i.test(s))return [{type:'set_time_mode',args:{mode:'morning'}}];
 if(/模拟傍晚|黄昏模式/i.test(s))return [{type:'set_time_mode',args:{mode:'dusk'}}];
 if(/模拟白天|白天模式/i.test(s))return [{type:'set_time_mode',args:{mode:'day'}}];
 if(/状态|位置|在哪里|state/i.test(s))return [{type:'get_state',args:{}}];
 if(/说[：:]/.test(s))return [{type:'speak',args:{text:s.slice(s.indexOf('：')+1||2,150)||s.slice(2)}}];
 const room=/卫生间|浴室|厕所|洗手间/i.test(s)?'bathroom':/卧室|睡觉|睡房|床边/i.test(s)?'bedroom':/客厅|餐厅|厨房|客餐厨|玄关/i.test(s)?'living':null;
 const direct=FURNITURE.find(f=>s===f.id||s.includes(f.name));
 if(direct)return [{type:'interact',args:{id:direct.id}}];
 const action=/上床|睡觉|躺下/.test(s)?'bed':/坐下|坐沙发|休息/.test(s)?'sofa':/上厕所|如厕|马桶/.test(s)?'toilet':/吃饭|做饭|燃气灶|煤气灶/.test(s)?'stove':/冰箱/.test(s)?'fridge':null;
 if(action)return [{type:'interact',args:{id:action}}];
 const calls=[];
 if(room)calls.push({type:'goto_room',args:{room}});
 if(/电视/i.test(s)&&/开|关|打开|关闭|看/i.test(s))calls.push({type:'interact',args:{id:'tv'}});
 if(/洗手台|洗手/i.test(s))calls.push({type:'interact',args:{id:'bath-sink'}});
 if(/浴缸|洗澡/i.test(s))calls.push({type:'interact',args:{id:'bathtub'}});
 if(/冰箱/i.test(s))calls.push({type:'interact',args:{id:'fridge'}});
 if(calls.length)return calls;
 throw Error('本地模式示例：去卧室、打开客厅灯、关闭卧室灯、模拟夜晚、自动时间、/goto 4.3 5.0');
}
// Backward-compatibility name used by the optional AI adapter.
export const DollhouseAgentController=HouseAgentController;
