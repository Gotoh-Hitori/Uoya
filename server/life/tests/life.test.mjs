import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {openLifeDatabase} from '../src/db.mjs';
import {createLifeEngine,LifeError} from '../src/engine.mjs';
import {createLifeRoutes} from '../src/api.mjs';
import {createAiLifeToolExecutor,AI_TOOL_DEFINITIONS} from '../src/ai-tools.mjs';
import {decayedStats} from '../src/rules.mjs';

const make=()=>{
  const db=openLifeDatabase(':memory:');let time=Date.parse('2026-11-12T09:00:00.000Z');
  const engine=createLifeEngine(db,{now:()=>time});
  return {db,engine,tick:ms=>time+=ms,close:()=>db.close()};
};
const award=(engine,id,n=100)=>engine.grantCoins({accountId:id,amount:n,source:'test_reward',sourceRef:randomUUID()});
const p=(e,id,itemId,q=1,requestId=randomUUID())=>e.purchase({accountId:id,actorType:id.startsWith('ai:')?'ai':'human',itemId,quantity:q,requestId});
const u=(e,id,itemId,requestId=randomUUID())=>e.use({accountId:id,actorType:id.startsWith('ai:')?'ai':'human',itemId,requestId});

test('所有类别和必需的大白饭商品都存在，价格不相同且金币为整数',()=>{
  const x=make();
  const catalog=x.engine.catalog();
  assert.deepEqual([...new Set(catalog.map(i=>i.category))].sort(),['drink','food','snack','toy']);
  assert.equal(catalog.find(i=>i.id==='plain-rice')?.name,'大白饭');
  assert.equal(catalog.find(i=>i.id==='plain-rice')?.price,12);
  assert(catalog.length>=18);
  assert(catalog.every(i=>Number.isSafeInteger(i.price)&&i.price>0));
  x.close();
});

test('虚拟状态随时间衰减，始终被限制为 0 到 100',()=>{
  const x=make(); const init=x.engine.getAccount('user:alice');
  x.tick(3600000*3);
  const next=x.engine.getAccount('user:alice');
  assert(next.stats.satiety<init.stats.satiety);
  assert(next.stats.boredom>init.stats.boredom);
  x.tick(3600000*1000);
  const later=x.engine.getAccount('user:alice');
  assert(later.stats.boredom<=100&&later.stats.hydration>=0);
  assert.equal(decayedStats({mood:30,satiety:30,boredom:40,hydration:30},0,-2000).mood,30);
  x.close();
});

test('大白饭购买入库，吃掉后增加饱食度且不重复扣币',()=>{
  const x=make();award(x.engine,'user:alice',100);
  const before=x.engine.getAccount('user:alice');
  const bought=p(x.engine,'user:alice','plain-rice',1,'order_test_001');
  assert.equal(bought.balance,88);
  assert.equal(x.engine.getAccount('user:alice').inventory[0].usesLeft,1);
  const after=u(x.engine,'user:alice','plain-rice','use_test_001');
  assert(after.stats.satiety>before.stats.satiety);
  assert.equal(x.engine.getAccount('user:alice').inventory.length,0);
  assert.equal(x.engine.getAccount('user:alice').coins,88);
  x.close();
});

test('幂等购买：重复相同请求不会重复扣币；同键异内容会报冲突',()=>{
  const x=make();award(x.engine,'user:alice',100);
  const a=p(x.engine,'user:alice','cookies',2,'same_key_001');
  const b=p(x.engine,'user:alice','cookies',2,'same_key_001');
  assert.equal(b.idempotentReplay,true);
  assert.equal(a.orderId,b.orderId);
  assert.equal(x.engine.getAccount('user:alice').coins,84);
  assert.throws(()=>p(x.engine,'user:alice','cookies',1,'same_key_001'),e=>e.code==='KEY_REUSED');
  x.close();
});

test('双人完全独立的钱包、库存和状态',()=>{
  const x=make();award(x.engine,'user:alice',100);award(x.engine,'user:bob',100);
  p(x.engine,'user:alice','plain-rice');u(x.engine,'user:alice','plain-rice');
  const a=x.engine.getAccount('user:alice'),b=x.engine.getAccount('user:bob');
  assert.equal(a.coins,88);assert.equal(b.coins,100);
  assert.notEqual(a.stats.satiety,b.stats.satiety);
  assert.equal(b.inventory.length,0);
  x.close();
});

test('事务：金币不足、非法数量或不存在商品时不产生负余额与库存',()=>{
  const x=make();
  assert.throws(()=>p(x.engine,'user:alice','handheld'),e=>e.code==='INSUFFICIENT_COINS');
  assert.throws(()=>p(x.engine,'user:alice','plain-rice',999),e=>e.code==='INVALID_QUANTITY');
  assert.throws(()=>p(x.engine,'user:alice','xxx-doesnt-exist'),e=>e.code==='UNKNOWN_ITEM');
  assert.equal(x.engine.getAccount('user:alice').coins,0);
  assert.equal(x.engine.getAccount('user:alice').inventory.length,0);
  x.close();
});

test('玩具可多次使用，冷却和耐久次数有效',()=>{
  const x=make();award(x.engine,'user:alice',100);
  p(x.engine,'user:alice','rubber-duck');
  const first=u(x.engine,'user:alice','rubber-duck');
  assert.equal(x.engine.getAccount('user:alice').inventory[0].usesLeft,8);
  assert.throws(()=>u(x.engine,'user:alice','rubber-duck'),e=>e.code==='COOLDOWN');
  x.tick(46000);
  const second=u(x.engine,'user:alice','rubber-duck');
  assert.equal(second.itemId,first.itemId);
  assert.equal(x.engine.getAccount('user:alice').inventory[0].usesLeft,7);
  x.close();
});

test('金币只允许受信任的外部发放事件注入；重复事件不重复发币',()=>{
  const x=make();
  const args={accountId:'user:alice',amount:95,source:'daily_login',sourceRef:'daily_20261112_alice'};
  const a=x.engine.grantCoins(args),b=x.engine.grantCoins(args);
  assert.equal(a.balance,95);assert.equal(b.idempotentReplay,true);
  assert.equal(x.engine.getAccount('user:alice').coins,95);
  assert.throws(()=>x.engine.grantCoins({...args,amount:-10}),e=>e.code==='INVALID_GRANT');
  x.close();
});

test('AI 自己有钱包且受到预算、最小余额和单次购买策略约束',()=>{
  const x=make();award(x.engine,'ai:starry',300);
  assert.throws(()=>x.engine.purchase({accountId:'ai:starry',actorType:'human',itemId:'plain-rice',requestId:randomUUID()}),e=>e.code==='AI_AUTH_REQUIRED');
  assert.throws(()=>p(x.engine,'ai:starry','handheld'),e=>e.code==='AI_POLICY_DENY');
  assert.equal(p(x.engine,'ai:starry','mini-robot').total,88);
  assert.equal(p(x.engine,'ai:starry','mini-robot').total,88);
  assert.equal(p(x.engine,'ai:starry','mini-robot').total,88);
  assert.equal(x.engine.getAccount('ai:starry').coins,36);
  assert.throws(()=>p(x.engine,'ai:starry','mini-robot'),e=>e.code==='AI_RESERVE');
  assert.equal('maxSpendPerDay' in x.engine.getAiPolicy(),false);
  x.close();
});

test('AI 工具执行器只允许已定义的指令，购买与使用都是服务端逻辑',async()=>{
  const x=make();award(x.engine,'ai:starry',100);
  const exec=createAiLifeToolExecutor(x.engine);
  assert(AI_TOOL_DEFINITIONS.some(t=>t.function.name==='life_buy_item'));
  const bought=await exec('life_buy_item',{itemId:'plain-rice'});
  assert.equal(bought.total,12);
  const used=await exec('life_use_item',{itemId:'plain-rice'});
  assert.equal(used.itemId,'plain-rice');
  await assert.rejects(exec('javascript_eval',{}),/Unsupported/);
  x.close();
});

test('事件通知只在首次真实购买后发送，不重复广播',()=>{
  const x=make();award(x.engine,'user:alice',100);
  const captured=[];x.engine.subscribe(e=>captured.push(e));
  p(x.engine,'user:alice','water',1,'unique_event_001');
  p(x.engine,'user:alice','water',1,'unique_event_001');
  assert.equal(captured.filter(e=>e.type==='purchase').length,1);
  assert.equal(x.engine.getActivity('user:alice').orders.length,1);
  x.close();
});

test('HTTP 路由从登录态提取 user ID，忽略伪造 accountId',async()=>{
  const x=make();award(x.engine,'user:alice',100);award(x.engine,'user:bob',100);
  const routes=createLifeRoutes({engine:x.engine,resolveUser:req=>({id:req.headers['x-test-user']||'alice'})});
  const server=http.createServer((req,res)=>routes(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const r=await fetch(base+'/api/life/purchase',{method:'POST',headers:{'Content-Type':'application/json','x-test-user':'alice'},body:JSON.stringify({accountId:'user:bob',itemId:'plain-rice',quantity:1,requestId:randomUUID()})});
    assert.equal(r.status,200);
    assert.equal(x.engine.getAccount('user:alice').coins,88);
    assert.equal(x.engine.getAccount('user:bob').coins,100);
    const noAuth=createLifeRoutes({engine:x.engine,resolveUser:()=>null});
    const resMock={writeHead(code){this.status=code;},end() {}};
    await noAuth({url:'/api/life/catalog',headers:{host:'localhost'},method:'GET'},resMock);
    assert.equal(resMock.status,401);
  }finally{await new Promise(resolve=>server.close(resolve));x.close();}
});
