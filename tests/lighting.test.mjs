import test from 'node:test';
import assert from 'node:assert/strict';
import {phaseForHour,getLightingSnapshot,PHASES,ROOM_LIGHTS,TIME_MODES} from '../src/world/day-cycle.mjs';
import {validateCommand,HouseAgentController,parseLocalCommand} from '../src/agent/controller.mjs';
import {makeCollisionWorld,createNavigator,AgentMotion} from '../src/world/navigation.mjs';

test('device-local 24h cycle boundaries, morning, day, dusk and night',()=>{
 const cases=[[0,'night'],[5.49,'night'],[5.5,'morning'],[8.99,'morning'],[9,'day'],[17.49,'day'],[17.5,'dusk'],[19.99,'dusk'],[20,'night'],[23.99,'night']];
 for(const [hour,phase] of cases)assert.equal(phaseForHour(hour),phase,`hour ${hour}`);
 for(const invalid of [-1,24,NaN,Infinity])assert.throws(()=>phaseForHour(invalid));
});
test('auto reads browser-local time without relying on network/geolocation',()=>{
 const date=new Date(2026,10,12,7,45,0); // constructor uses local-time fields
 const state=getLightingSnapshot({date});
 assert.equal(state.mode,'auto');assert.equal(state.phase,'morning');
 assert.equal(state.lights.living,false);assert.equal(state.lights.bathroom,true);
 assert.match(state.localTime,/07:45/);
 const night=getLightingSnapshot({date:new Date(2026,10,12,23,0,0)});
 assert.equal(night.phase,'night');assert.notEqual(night.sky,state.sky);
 assert.ok(night.sunIntensity<state.sunIntensity);
});
test('manual preview time modes preserve local clock and override lights independently',()=>{
 const date=new Date(2026,10,12,10,20,0);
 const night=getLightingSnapshot({date,mode:'night',brightness:.55,overrides:{living:false,bathroom:true}});
 assert.equal(night.phase,'night');assert.equal(night.lights.living,false);
 assert.equal(night.lights.bathroom,true);assert.equal(night.brightness,.55);
 assert.match(night.localTime,/10:20/);
 assert.equal(getLightingSnapshot({date,mode:'day'}).phase,'day');
 for(const x of [{date,mode:'hi'},{date,brightness:1.1},{date,overrides:{living:5}}])assert.throws(()=>getLightingSnapshot(x));
});
test('lighting API tool schemas validate room switches, preview and brightness safely',()=>{
 assert.deepEqual(validateCommand({type:'set_light',args:{room:'bedroom',enabled:false}}),{type:'set_light',args:{room:'bedroom',enabled:false}});
 assert.deepEqual(validateCommand({type:'set_time_mode',args:{mode:'auto'}}).args,{mode:'auto'});
 for(const input of [
  {type:'set_light',args:{room:'dungeon',enabled:true}},
  {type:'set_light',args:{room:'living',enabled:'yes'}},
  {type:'set_brightness',args:{value:1.1}},
  {type:'set_brightness',args:{value:-.1}},
  {type:'set_time_mode',args:{mode:'twilight'}},
 ])assert.throws(()=>validateCommand(input));
});
test('agent routes lighting commands through its injected controller interface',async()=>{
 const calls=[];
 const fake={getState:()=>({phase:'night',lights:{living:true,bedroom:false,bathroom:false}}),
  setRoomLight:(room,on)=>calls.push([room,on]),setTimeMode:mode=>calls.push(['mode',mode]),setBrightness:v=>calls.push(['bright',v])};
 const actor=new HouseAgentController({motion:new AgentMotion(createNavigator(makeCollisionWorld(),.1),{x:4.75,z:5.70}),lighting:fake});
 await actor.execute({type:'set_light',args:{room:'all',enabled:true}});
 await actor.execute({type:'set_time_mode',args:{mode:'morning'}});
 await assert.rejects(actor.execute({type:'set_brightness',args:{value:.35}}));
 assert.deepEqual(calls,[['living',true],['bedroom',true],['bathroom',true],['mode','morning']]);
 assert.ok(actor.getState().lighting);
});
test('local Chinese light phrases map to safe commands',()=>{
 assert.deepEqual(parseLocalCommand('打开客厅灯'),[{type:'set_light',args:{room:'living',enabled:true}}]);
 assert.deepEqual(parseLocalCommand('关闭卧室灯'),[{type:'set_light',args:{room:'bedroom',enabled:false}}]);
 assert.deepEqual(parseLocalCommand('打开所有灯'),[{type:'set_light',args:{room:'all',enabled:true}}]);
 assert.deepEqual(parseLocalCommand('跟随系统时间'),[{type:'set_time_mode',args:{mode:'auto'}}]);
 assert.deepEqual(parseLocalCommand('模拟夜晚'),[{type:'set_time_mode',args:{mode:'night'}}]);
});

test('smart lighting freezes switches when disabled, supports all lamps and stays at full power',async()=>{
 const THREE=await import('three');
 const {createLighting}=await import('../src/world/lighting.js');
 const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2();
 const lighting=createLighting(scene,{});
 lighting.refresh(new Date(2026,10,13,23));
 assert.equal(lighting.getState().brightness,1);
 lighting.setSmart(false);
 const before=Object.values(lighting.getState().lamps).map(x=>x.enabled);
 lighting.refresh(new Date(2026,10,14,12));
 assert.deepEqual(Object.values(lighting.getState().lamps).map(x=>x.enabled),before);
 for(const on of [true,false]){
  lighting.setAllLights(on);
  assert.equal(lighting.getState().smart,false);
  assert.ok(Object.values(lighting.getState().lamps).every(x=>x.enabled===on&&x.brightness===1));
 }
 lighting.setLamp('floor-lamp',true);
 assert.equal(lighting.getState().lamps['floor-lamp'].enabled,true);
 assert.equal(lighting.getState().lamps['living-ceiling'].enabled,false);
 lighting.setSmart(true);
 assert.equal(lighting.getState().smart,true);
 assert.ok(Object.values(lighting.getState().lamps).every(x=>x.override===null));
 assert.throws(()=>validateCommand({type:'set_lamp',args:{id:'floor-lamp',enabled:true,brightness:.5}}));
});

test('night bathroom occupancy turns on smart light immediately and respects manual controls',async()=>{
 const THREE=await import('three'),{createLighting}=await import('../src/world/lighting.js');const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2();const lighting=createLighting(scene,{});
 lighting.setTimeMode('night');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,false);
 lighting.setOccupiedRoom('bathroom');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,true);assert.ok(scene.children.find(o=>o.name==='卫生间吸顶灯'&&o.isLight).intensity>0);
 lighting.refresh();assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,true);
 lighting.setOccupiedRoom('bedroom');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,false);
 lighting.setLamp('bathroom-ceiling',false);lighting.setOccupiedRoom('bathroom');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,false);
 lighting.setSmart(true);assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,true);
 lighting.setOccupiedRoom('living');lighting.setSmart(false);lighting.setOccupiedRoom('bathroom');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,false);
 lighting.setSmart(true);lighting.setTimeMode('day');assert.equal(lighting.getState().lamps['bathroom-ceiling'].enabled,false);
});
