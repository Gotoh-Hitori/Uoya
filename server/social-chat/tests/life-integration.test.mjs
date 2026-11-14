import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createDB} from '../src/db.mjs';
import {createLifeService} from '../src/life-service.mjs';
import {createChatMemory} from '../src/memory.mjs';
import {createAiWorker} from '../src/ai.mjs';
function fixture(){const dir=mkdtempSync(path.join(tmpdir(),'bluehaven-life-integration-')),config={dbFile:path.join(dir,'chat.sqlite'),memoryDbFile:path.join(dir,'memory.sqlite'),memoryEnabled:true,memoryTopK:8,memoryTokenBudget:1200,lifeWelcomeCoins:120,lifeAiWelcomeCoins:160,aiName:'蓝色小肥鱼'};const db=createDB(config.dbFile);let time=Date.now();const life=createLifeService(config,{now:()=>time});return {dir,config,db,life,tick:ms=>time+=ms,close(){life.close();db.close();if(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep))rmSync(dir,{recursive:true,force:true});}};}
test('welcome grants are one-time; furniture requires owned food, elapsed time and owner; retries settle once',()=>{
 const x=fixture();try{
  const alice={id:'alice'},bob={id:'bob'};x.life.ensureUser(alice);x.life.ensureUser(alice);x.life.ensureUser(bob);
  assert.equal(x.life.engine.getAccount('user:alice').coins,120);assert.equal(x.life.engine.getAccount('ai:starry').coins,160);
  assert.throws(()=>x.life.startInteraction(alice,'fridge'),e=>e.code==='NOT_OWNED');
  x.life.engine.purchase({accountId:'user:alice',actorType:'human',itemId:'plain-rice',requestId:randomUUID()});
  const ticket=x.life.startInteraction(alice,'fridge');assert.equal(ticket.itemId,'plain-rice');assert.throws(()=>x.life.finishInteraction(alice,ticket.ticket),e=>e.code==='TOO_EARLY');assert.throws(()=>x.life.finishInteraction(bob,ticket.ticket),e=>e.code==='UNKNOWN_TICKET');
  x.tick(8100);const result=x.life.finishInteraction(alice,ticket.ticket);assert.ok(result.account.stats.satiety>99);assert.equal(result.account.inventory.length,0);assert.equal(x.life.finishInteraction(alice,ticket.ticket).idempotentReplay,true);assert.equal(x.life.engine.getAccount('user:alice').coins,108);assert.equal(x.life.engine.getAccount('user:bob').coins,120);assert.equal(x.life.engine.getAccount('ai:starry').coins,160);
  const rest=x.life.startInteraction(alice,'bed'),before=x.life.engine.getAccount('user:alice').stats.mood;x.tick(8100);x.life.finishInteraction(alice,rest.ticket);assert.ok(x.life.engine.getAccount('user:alice').stats.mood>before+7);assert.equal(x.life.startInteraction(alice,'bed').tracked,false);
 }finally{x.close();}
});
test('AI tools reject unknown/extra arguments, enforce policy and retain idempotency; only public AI events enter LongMemory',async()=>{
 const x=fixture();let memory;try{
  x.life.ensureUser({id:'alice'});x.life.engine.purchase({accountId:'user:alice',actorType:'human',itemId:'chocolate',requestId:randomUUID()});
  await assert.rejects(x.life.executeTool('life_buy_item',{itemId:'water',accountId:'user:alice'}),/Unknown/);
  await assert.rejects(x.life.executeTool('life_buy_item',{itemId:'handheld'}),e=>e.code==='AI_POLICY_DENY');
  const key={requestId:'ai-public-rice-0001'};await x.life.executeTool('life_buy_item',{itemId:'plain-rice'},key);await x.life.executeTool('life_buy_item',{itemId:'plain-rice'},key);assert.equal(x.life.engine.getAccount('ai:starry').coins,148);
  await x.life.executeTool('life_use_item',{itemId:'plain-rice'},{requestId:'ai-use-rice-0001'});
  memory=await createChatMemory({db:x.db,config:x.config,getLifeEvents:x.life.publicEventsAfter});assert.equal(memory.getStatus().count,2);
  const records=await memory.recall('蓝色小肥鱼购买并使用了什么食物？');assert.ok(records.some(r=>r.text.includes('大白饭')));assert.ok(records.every(r=>r.author.id==='ai:starry'));assert.ok(!records.some(r=>r.text.includes('巧克力')));
  await memory.close();memory=await createChatMemory({db:x.db,config:x.config,getLifeEvents:x.life.publicEventsAfter});assert.equal(memory.getStatus().count,2);
 }finally{await memory?.close();x.close();}
});
test('streamed model tool calls buy/use with AI wallet and return successful tool results before final reply',async()=>{
 const x=fixture();let worker,server;try{
  const user=x.db.register({username:'life_user',displayName:'生活测试',password:'test-password'});x.life.ensureUser(user);let rounds=0,finalMessages;
  server=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts).toString());rounds++;res.writeHead(200,{'Content-Type':'text/event-stream'});
   const emit=delta=>res.write('data: '+JSON.stringify({choices:[{delta}]})+'\n\n');
   if(rounds<=2){assert.ok(body.tools.some(t=>t.function.name==='life_buy_item'));const name=rounds===1?'life_buy_item':'life_use_item';emit({tool_calls:[{index:0,id:'tool-'+rounds,type:'function',function:{name,arguments:'{"item'}}]});emit({tool_calls:[{index:0,function:{arguments:'Id":"plain-rice"}'}}]});}
   else{finalMessages=body.messages;emit({content:'已用自己的金币购买并吃掉大白饭。'});}res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const events=[];
  worker=createAiWorker({db:x.db,life:x.life,config:{...x.config,aiMode:'api',aiTriggerMode:'auto',aiBaseUrl:'http://127.0.0.1:'+server.address().port,aiApiKey:'local-test-only',aiModel:'test-model',aiTimeoutMs:5000,aiMaxOutputTokens:200},broadcast:(event,data)=>events.push({event,data}),readPersona:()=> '你是蓝色小肥鱼。'});
  worker.notifyHuman(x.db.addHumanMessage(user.id,'请买碗白饭并吃掉。','life-model-question').message);
  for(let i=0;i<120&&!events.some(e=>e.event==='message');i++)await delay(50);
  assert.ok(events.some(e=>e.event==='message'),JSON.stringify(events));assert.equal(rounds,3);assert.equal(x.life.engine.getAccount('ai:starry').coins,148);assert.equal(x.life.engine.getAccount('ai:starry').inventory.length,0);assert.equal(x.life.engine.getAccount('user:'+user.id).coins,120);
  const results=finalMessages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));assert.equal(results.length,2);assert.ok(results.every(r=>r.ok));assert.ok(x.life.engine.getAccount('ai:starry').stats.satiety>99);
 }finally{worker?.close();if(server)await new Promise(resolve=>server.close(resolve));x.close();}
});
test('life routes require the shared login, reject foreign origins and do not expose demo AI buying',async()=>{
 const x=fixture();let server;try{
  const routes=x.life.createRoutes(req=>req.headers['x-test-user']?{id:req.headers['x-test-user']}:null,[]);
  server=http.createServer((req,res)=>routes(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/life/me')).status,401);
  const buy=await fetch(base+'/api/life/purchase',{method:'POST',headers:{'x-test-user':'alice','Content-Type':'application/json'},body:JSON.stringify({accountId:'ai:starry',itemId:'water',quantity:1,price:0,requestId:randomUUID()})});assert.equal(buy.status,200);assert.equal(x.life.engine.getAccount('user:alice').coins,114);assert.equal(x.life.engine.getAccount('ai:starry').coins,160);
  const bad=await fetch(base+'/api/life/interaction/start',{method:'POST',headers:{'x-test-user':'alice','Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:JSON.stringify({furnitureId:'bed'})});assert.equal(bad.status,403);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));x.close();}
});
