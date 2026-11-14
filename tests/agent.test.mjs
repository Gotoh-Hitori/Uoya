import test from 'node:test';import assert from 'node:assert/strict';
import {validateCommand,AGENT_TOOLS,HouseAgentController,parseLocalCommand} from '../src/agent/controller.mjs';
import {makeCollisionWorld,createNavigator,AgentMotion} from '../src/world/navigation.mjs';
const motion=()=>new AgentMotion(createNavigator(makeCollisionWorld(),.1),{x:4.75,z:5.7});
test('AI room tools include the bathroom and exclude kitchen as a separate room',()=>{
 assert.deepEqual(AGENT_TOOLS.find(t=>t.name==='goto_room').parameters.properties.room.enum,['living','bedroom','bathroom']);
});
test('reject arbitrary code, out-of-bounds movement, prototype pollution and unknown furniture',()=>{
 for(const cmd of [{type:'eval',args:{code:'alert(1)'}},
 {type:'move_to',args:{x:30,z:0}},
 {type:'move_to',args:{x:NaN,z:3}},
 {type:'goto_room',args:{room:'kitchen'}},
 {type:'speak',args:{text:'hi',__proto__:'unsafe',unexpected:1}},
 {type:'interact',args:{id:'door-D2'}}])assert.throws(()=>validateCommand(cmd));
 assert.deepEqual(validateCommand({type:'goto_room',args:{room:'bathroom'}}),{type:'goto_room',args:{room:'bathroom'}});
});
test('agent exposes state, emits safe events and performs speak/stop',async()=>{
 const actor=new HouseAgentController({motion:motion(),onSpeak:t=>assert.equal(t,'你好')});
 const events=[];const un=actor.subscribe(e=>events.push(e.event));
 assert.equal(actor.getState().room,'living');
 assert.deepEqual(await actor.execute({type:'speak',args:{text:'你好'}}),{status:'spoken'});
 assert.deepEqual(await actor.execute({type:'stop',args:{}}),{status:'stopped'});
 assert.deepEqual(events,['start','finish','start','finish']);un();
});
test('local natural language commands support three rooms',()=>{
 assert.equal(parseLocalCommand('去卧室')[0].args.room,'bedroom');
 assert.equal(parseLocalCommand('去卫生间')[0].args.room,'bathroom');
 assert.equal(parseLocalCommand('去厨房')[0].args.room,'living');
});
