import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openLifeDatabase} from '../src/db.mjs';
import {createLifeEngine} from '../src/engine.mjs';
import {createLifeRoutes} from '../src/api.mjs';
import {lifeEventToMemory} from '../src/ai-context.mjs';
const item={name:'自制果汁',emoji:'🍹',category:'drink',price:7,description:'清爽果汁',uses:2,cooldownSec:10,effects:{mood:4,hydration:20,boredom:-3,satiety:2}};
test('custom catalog persists, stays isolated and participates in purchase/use/cooldown/idempotency',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'bluehaven-catalog-')),file=path.join(dir,'life.sqlite');
 let db=openLifeDatabase(file);const isolatedDb=openLifeDatabase(':memory:');
 try{
  let time=Date.now(),engine=createLifeEngine(db,{now:()=>time});
  const created=engine.createItem(item,'admin');
  const copy=engine.catalog().find(x=>x.id===created.id);copy.effects.hydration=99;
  assert.equal(engine.catalog().find(x=>x.id===created.id).effects.hydration,20);
  assert.equal(createLifeEngine(isolatedDb).catalog().some(x=>x.id===created.id),false);
  db.close();db=openLifeDatabase(file);engine=createLifeEngine(db,{now:()=>time});
  assert.equal(engine.catalog().find(x=>x.id===created.id).price,7);
  engine.grantCoins({accountId:'user:alice',amount:100,source:'test',sourceRef:randomUUID()});
  const buy={accountId:'user:alice',actorType:'human',itemId:created.id,requestId:randomUUID()};
  engine.purchase(buy);assert.equal(engine.purchase(buy).idempotentReplay,true);
  assert.equal(engine.getAccount('user:alice').coins,93);
  assert.equal(engine.getAccount('user:alice').inventory[0].usesLeft,2);
  const before=engine.getAccount('user:alice').stats.hydration;
  const result=engine.use({...buy,requestId:randomUUID()});
  assert.equal(result.stats.hydration,Math.min(100,before+20));
  assert.match(lifeEventToMemory(result.event),/自制果汁/);
  assert.throws(()=>engine.use({...buy,requestId:randomUUID()}),e=>e.code==='COOLDOWN');
  time+=11000;engine.use({...buy,requestId:randomUUID()});assert.equal(engine.getAccount('user:alice').inventory.length,0);
  for(const bad of [{price:-1},{price:1.5},{uses:0},{cooldownSec:-1},{effects:{coins:100}},{effects:{mood:101}},{category:'other'},{name:''}])assert.throws(()=>engine.createItem({...item,...bad},'admin'),e=>e.code==='INVALID_ITEM');
 }finally{db.close();isolatedDb.close();rmSync(dir,{recursive:true,force:true});}
});
test('create catalog route requires real admin session, rejects foreign origins and serves new products',async()=>{
 const db=openLifeDatabase(':memory:'),engine=createLifeEngine(db);
 const routes=createLifeRoutes({engine,resolveUser:req=>req.headers['x-user']==='admin'?{id:'admin',role:'admin'}:req.headers['x-user']?{id:'member',role:'member'}:null});
 const server=http.createServer(routes);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/life/catalog';
 const post=(user,body=item,extra={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{}),...extra},body:JSON.stringify(body)});
 try{
  assert.equal((await post(null)).status,401);
  assert.equal((await post('member',{...item,role:'admin'})).status,403);
  assert.equal((await post('admin',item,{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await post('admin',{...item,price:0})).status,400);
  const response=await post('admin');assert.equal(response.status,201);const {item:created}=await response.json();
  const catalog=await(await fetch(url,{headers:{'x-user':'member'}})).json();assert.ok(catalog.items.some(x=>x.id===created.id));
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
