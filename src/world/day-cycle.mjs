/** The device's LOCAL clock is authoritative (not IP geolocation or a server time).
 * Phase boundaries are intentionally simple defaults, not astronomic sunrise/sunset.
 */
export const PHASES=Object.freeze(['morning','day','dusk','night']);
export const PHASE_NAMES=Object.freeze({morning:'清晨',day:'白天',dusk:'傍晚',night:'夜晚'});
export const ROOM_LIGHTS=Object.freeze(['living','bedroom','bathroom']);
export const TIME_MODES=Object.freeze(['auto',...PHASES]);
export function localHour(date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new TypeError('无效的本地时间');
  return date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
}
export function phaseForHour(hour){
  if(!Number.isFinite(hour)||hour<0||hour>=24)throw new RangeError('时间必须在 0..24 之间');
  return hour>=5.5&&hour<9?'morning':hour>=9&&hour<17.5?'day':hour>=17.5&&hour<20?'dusk':'night';
}
const PRESETS=Object.freeze({
  morning:{sky:'#b5d8f3',horizon:'#dcecff',fog:'#d8e9f8',sun:'#ffe0ad',sunIntensity:1.30,ambient:0.62,exposure:1.05,defaults:{living:false,bedroom:false,bathroom:true}},
  day:{sky:'#deecfa',horizon:'#eaf3ff',fog:'#e8f1ff',sun:'#fff8ed',sunIntensity:2.05,ambient:0.80,exposure:1.02,defaults:{living:false,bedroom:false,bathroom:false}},
  dusk:{sky:'#8396c1',horizon:'#b7c8e6',fog:'#9daecc',sun:'#ffad77',sunIntensity:0.75,ambient:0.42,exposure:1.03,defaults:{living:true,bedroom:true,bathroom:true}},
  night:{sky:'#152643',horizon:'#2a4164',fog:'#233958',sun:'#7b9dca',sunIntensity:0.025,ambient:0.18,exposure:1.08,defaults:{living:true,bedroom:true,bathroom:false}},
});
export function getLightingSnapshot({date=new Date(),mode='auto',brightness=.75,overrides={}}={}){
  if(!TIME_MODES.includes(mode))throw new RangeError('不支持的时间模式');
  if(!Number.isFinite(brightness)||brightness<0||brightness>1)throw new RangeError('亮度需在 0..1');
  const hour=localHour(date),phase=mode==='auto'?phaseForHour(hour):mode;
  const preset=PRESETS[phase];
  const lights=Object.fromEntries(ROOM_LIGHTS.map(room=>{
    const override=overrides[room];
    if(override!==undefined&&override!==null&&typeof override!=='boolean')throw new TypeError('灯光开关必须为布尔值');
    return [room,override??preset.defaults[room]];
  }));
  const sunClock=mode==='auto'?hour:{morning:7.2,day:12.5,dusk:18.35,night:23}[phase];
  const trajectory=Math.max(0,Math.min(1,(sunClock-5.5)/14.5));
  const elevation=Math.max(.03,Math.sin(Math.PI*trajectory));
  return {mode,phase,phaseName:PHASE_NAMES[phase],localTime:date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}),
    hour,brightness,lights,ambient:preset.ambient,sunIntensity:preset.sunIntensity,
    sunColor:preset.sun,sky:preset.sky,horizon:preset.horizon,fog:preset.fog,exposure:preset.exposure,
    sunPosition:{x:4.7+11*Math.cos(Math.PI*trajectory),y:2+13*elevation,z:3.1+9*Math.sin(Math.PI*trajectory)}};
}
