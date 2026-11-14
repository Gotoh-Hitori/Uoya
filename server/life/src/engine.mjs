import {splitLegacyWallet} from './wallet-migration.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {cleanCatalog} from './catalog.mjs';
import {START,AI_POLICY,decayedStats,applyEffects,moodLabel} from './rules.mjs';

export class LifeError extends Error {
  constructor(code,message,status=400){super(message);this.name='LifeError';this.code=code;this.status=status;}
}
const fail=(code,message,status=400)=>{throw new LifeError(code,message,status);};
const hash=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const validAccount=id=>typeof id==='string' && (/^user:[a-zA-Z0-9_-]{1,80}$/.test(id)||id==='ai:starry');
const validKey=k=>typeof k==='string' && /^[a-zA-Z0-9:_-]{8,100}$/.test(k);
const validItem=s=>typeof s==='string' && /^[a-z0-9-]{2,50}$/.test(s);
const inRangeInt=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

export function createLifeEngine(db,{now=()=>Date.now(),aiPolicy=AI_POLICY,sharedWallet=false,splitSharedWallet=false,walletMigrationMode='history'}={}) {
  db.exec('CREATE TABLE IF NOT EXISTS life_custom_items(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_by TEXT NOT NULL,created_at INTEGER NOT NULL)');
  const itemMap=new Map(cleanCatalog().map(item=>[item.id,item]));
  for(const row of db.prepare('SELECT data FROM life_custom_items').all()){const item=JSON.parse(row.data);itemMap.set(item.id,item);}
  function createItem(input,createdBy){
    const bad=()=>fail('INVALID_ITEM','请检查商品数据：价格 1–1000000，次数 1–1000，冷却 0–86400 秒，效果 -100–100');
    if(!input||typeof input!=='object'||Array.isArray(input))bad();
    const fields=['name','emoji','category','price','description','uses','cooldownSec','effects'];
    if(Object.keys(input).some(k=>!fields.includes(k)))bad();
    for(const [key,max] of [['name',60],['emoji',16],['description',500]])if(typeof input[key]!=='string'||input[key].length>max||(key!=='description'&&!input[key].trim()))bad();
    if(!['food','drink','snack','toy'].includes(input.category)||!inRangeInt(input.price,1,1000000)||!inRangeInt(input.uses,1,1000)||!inRangeInt(input.cooldownSec,0,86400))bad();
    if(!input.effects||typeof input.effects!=='object'||Array.isArray(input.effects)||Object.entries(input.effects).some(([key,v])=>!['mood','satiety','boredom','hydration'].includes(key)||!inRangeInt(v,-100,100)))bad();
    const item={id:'custom-'+randomUUID(),name:input.name.trim(),emoji:input.emoji.trim(),category:input.category,price:input.price,description:input.description.trim(),uses:input.uses,cooldownSec:input.cooldownSec,effects:{...input.effects}};
    db.prepare('INSERT INTO life_custom_items VALUES(?,?,?,?)').run(item.id,JSON.stringify(item),createdBy,now());
    itemMap.set(item.id,item);return structuredClone(item);
  }
  const listeners=new Set();
  if(splitSharedWallet){if(sharedWallet)throw Error('Independent wallet migration requires separate wallets');splitLegacyWallet(db,{mode:walletMigrationMode,now:now()});}
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS life_admin_adjust_reference ON life_ledger(source,source_ref) WHERE source='admin_adjust'");
  db.exec('CREATE TABLE IF NOT EXISTS life_shared_wallet(id INTEGER PRIMARY KEY CHECK(id=1),coins INTEGER NOT NULL CHECK(coins>=0))');
  if(sharedWallet){db.exec('BEGIN IMMEDIATE');try{db.exec('INSERT OR IGNORE INTO life_shared_wallet(id,coins) SELECT 1,COALESCE(SUM(coins),0) FROM life_accounts');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
  const wallet={shared:sharedWallet,getBalance:accountId=>sharedWallet?db.prepare('SELECT coins FROM life_shared_wallet WHERE id=1').get().coins:db.prepare('SELECT coins FROM life_accounts WHERE id=?').get(accountId).coins,setBalance:(coins,accountId)=>sharedWallet?db.prepare('UPDATE life_shared_wallet SET coins=? WHERE id=1').run(coins):db.prepare('UPDATE life_accounts SET coins=? WHERE id=?').run(coins,accountId)};
  const prepare=sql=>db.prepare(sql);
  const q={
    getAccount:prepare('SELECT * FROM life_accounts WHERE id=?'),
    addAccount:prepare('INSERT OR IGNORE INTO life_accounts(id,coins,mood,satiety,boredom,hydration,updated_at) VALUES (?,0,?,?,?,?,?)'),
    updateStats:prepare('UPDATE life_accounts SET mood=?,satiety=?,boredom=?,hydration=?,updated_at=? WHERE id=?'),
    adjustCoins:{run:(coins,accountId)=>wallet.setBalance(coins,accountId)},
    getOp:prepare('SELECT request_hash,response FROM life_ops WHERE account_id=? AND request_key=?'),
    putOp:prepare('INSERT INTO life_ops(account_id,request_key,request_hash,response,created_at) VALUES (?,?,?,?,?)'),
    getInventory:prepare('SELECT id,item_id,uses_left,last_used_at,acquired_at FROM life_inventory WHERE account_id=? ORDER BY acquired_at,id'),
    pickInventory:prepare('SELECT id,uses_left,last_used_at FROM life_inventory WHERE account_id=? AND item_id=? ORDER BY last_used_at,id'),
    putUnit:prepare('INSERT INTO life_inventory(account_id,item_id,uses_left,last_used_at,acquired_at) VALUES (?,?,?,0,?)'),
    updateUnit:prepare('UPDATE life_inventory SET uses_left=?,last_used_at=? WHERE id=?'),
    delUnit:prepare('DELETE FROM life_inventory WHERE id=?'),
    addOrder:prepare('INSERT INTO life_orders(account_id,item_id,quantity,unit_price,total,ordered_at,actor_type) VALUES (?,?,?,?,?,?,?)'),
    lastOrders:prepare('SELECT id,item_id,quantity,unit_price AS unitPrice,total,ordered_at AS orderedAt,actor_type AS actorType FROM life_orders WHERE account_id=? ORDER BY id DESC LIMIT ?'),
    addLedger:prepare('INSERT INTO life_ledger(account_id,delta,after_balance,source,source_ref,created_at) VALUES (?,?,?,?,?,?)'),
    findGrant:prepare('SELECT id FROM life_ledger WHERE account_id=? AND source=? AND source_ref=?'),
    addEvent:prepare('INSERT INTO life_events(account_id,type,payload,created_at) VALUES (?,?,?,?)'),
    events:prepare('SELECT id,type,payload,created_at AS createdAt FROM life_events WHERE account_id=? ORDER BY id DESC LIMIT ?'),
  };
  function tx(fn){
    db.exec('BEGIN IMMEDIATE');
    try {const out=fn();db.exec('COMMIT');return out;}
    catch(err){db.exec('ROLLBACK');throw err;}
  }
  function ensureAccount(accountId,t){
    if(!validAccount(accountId)) fail('INVALID_ACCOUNT','无效账户 ID');
    q.addAccount.run(accountId,START.mood,START.satiety,START.boredom,START.hydration,t);
    const row=q.getAccount.get(accountId);
    const stats=decayedStats(row,row.updated_at,t);
    if(t>row.updated_at) q.updateStats.run(stats.mood,stats.satiety,stats.boredom,stats.hydration,t,accountId);
    return {...row,...stats,coins:wallet.getBalance(accountId),updated_at:Math.max(row.updated_at,t)};
  }
  function inventoryFor(accountId) {
    const items=new Map();
    for (const u of q.getInventory.all(accountId)) {
      const item=itemMap.get(u.item_id);
      if(!item) continue;
      const key=item.id;
      let rec=items.get(key);
      if(!rec){rec={itemId:key,name:item.name,emoji:item.emoji,category:item.category,units:0,usesLeft:0,earliestAvailableAt:Infinity};items.set(key,rec);}
      rec.units++;
      rec.usesLeft+=u.uses_left;
      rec.earliestAvailableAt=Math.min(rec.earliestAvailableAt,u.last_used_at + (item.cooldownSec||0)*1000);
    }
    return [...items.values()];
  }
  function snapshot(accountId,row=undefined,t=now()){
    const a=row||ensureAccount(accountId,t);
    const stats=Object.fromEntries(['mood','satiety','boredom','hydration'].map(k=>[k,Math.round(a[k]*100)/100]));
    return {accountId,actorType:accountId==='ai:starry'?'ai':'human',coins:wallet.getBalance(accountId),walletId:sharedWallet?'household':accountId,stats,moodLabel:moodLabel(stats),inventory:inventoryFor(accountId),updatedAt:a.updated_at};
  }
  function recordEvent(accountId,type,payload,t) {
    const data={accountId,type,payload,createdAt:t};
    const result=q.addEvent.run(accountId,type,JSON.stringify(payload),t);
    return {...data,id:Number(result.lastInsertRowid)};
  }
  function emit(event){for(const fn of listeners){try{fn(event);}catch(err){console.error('Life event listener failed',err);}}}
  function withIdempotency(accountId,key,request,action){
    if(!validKey(key))fail('INVALID_REQUEST_KEY','必须提供 8–100 字符的幂等 requestId');
    const requestHash=hash(request);
    const prior=q.getOp.get(accountId,key);
    if(prior){if(prior.request_hash!==requestHash)fail('KEY_REUSED','幂等键用于了不同操作',409);return {duplicated:true,result:JSON.parse(prior.response)};}
    const result=action();
    q.putOp.run(accountId,key,requestHash,JSON.stringify(result),now());
    return {duplicated:false,result};
  }
  function assertBuyer(accountId,actorType) {
    if(accountId==='ai:starry' && actorType!=='ai')fail('AI_AUTH_REQUIRED','AI 采购只允许可信的服务端工具调用',403);
    if(accountId!=='ai:starry' && actorType!=='human')fail('HUMAN_AUTH_REQUIRED','不允许冒用真人身份',403);
  }
  function purchase({accountId,actorType,itemId,quantity=1,requestId}) {
    assertBuyer(accountId,actorType);
    if(!validItem(itemId)||!itemMap.has(itemId))fail('UNKNOWN_ITEM','商品不存在',404);
    if(!inRangeInt(quantity,1,5))fail('INVALID_QUANTITY','单次仅可购买 1–5 件');
    const item=itemMap.get(itemId),total=item.price*quantity;
    const outcome=tx(()=>withIdempotency(accountId,requestId,{type:'purchase',itemId,quantity},()=>{
      const t=now(), a=ensureAccount(accountId,t);
      if(actorType==='ai') {
        if(!aiPolicy.enabled||!aiPolicy.allowedCategories.includes(item.category))fail('AI_POLICY_DENY','AI 未获准购买该品类',403);
        if(quantity>aiPolicy.maxQuantityPerOrder||total>aiPolicy.maxSingleOrder)fail('AI_POLICY_DENY','超过 AI 单次购买限制',403);
        if(a.coins-total<aiPolicy.minimumBalanceAfter)fail('AI_RESERVE','AI 需要保留最低金币余额',409);
      }
      if(a.coins<total)fail('INSUFFICIENT_COINS','金币不足',409);
      const newBalance=a.coins-total;
      q.adjustCoins.run(newBalance,accountId);
      const order=q.addOrder.run(accountId,itemId,quantity,item.price,total,t,actorType);
      for(let i=0;i<quantity;i++)q.putUnit.run(accountId,itemId,item.uses,t);
      q.addLedger.run(accountId,-total,newBalance,'purchase',String(order.lastInsertRowid),t);
      const event=recordEvent(accountId,'purchase',{itemId,itemName:item.name,quantity,total,balance:newBalance,actorType},t);
      return {orderId:Number(order.lastInsertRowid),itemId,quantity,total,balance:newBalance,event};
    }));
    if(!outcome.duplicated)emit(outcome.result.event);
    return {...outcome.result,idempotentReplay:outcome.duplicated};
  }
  function use({accountId,actorType,itemId,requestId}) {
    assertBuyer(accountId,actorType);
    if(!validItem(itemId)||!itemMap.has(itemId))fail('UNKNOWN_ITEM','商品不存在',404);
    const item=itemMap.get(itemId);
    const outcome=tx(()=>withIdempotency(accountId,requestId,{type:'use',itemId},()=>{
      const t=now(),a=ensureAccount(accountId,t);
      const units=q.pickInventory.all(accountId,itemId);
      if(!units.length)fail('NOT_OWNED','背包中没有该物品',409);
      const available=units.find(u=>!item.cooldownSec || t-u.last_used_at>=item.cooldownSec*1000);
      if(!available)fail('COOLDOWN','玩具仍在冷却中，请稍后再玩',409);
      if(available.uses_left<=1)q.delUnit.run(available.id);
      else q.updateUnit.run(available.uses_left-1,t,available.id);
      const stats=applyEffects(a,item.effects);
      q.updateStats.run(stats.mood,stats.satiety,stats.boredom,stats.hydration,t,accountId);
      const event=recordEvent(accountId,'use',{itemId,itemName:item.name,itemCategory:item.category,effects:item.effects,stats},t);
      return {itemId,effects:item.effects,stats,moodLabel:moodLabel(stats),event};
    }));
    if(!outcome.duplicated)emit(outcome.result.event);
    return {...outcome.result,idempotentReplay:outcome.duplicated};
  }
  // Currency issuer entry point. No public HTTP route; call only after trusted reward verification.
  function grantCoins({accountId,amount,source,sourceRef}) {
    if(!inRangeInt(amount,1,100000)||typeof source!=='string'||!/^[a-z0-9_.-]{2,35}$/.test(source)||!validKey(sourceRef))fail('INVALID_GRANT','无效的金币发放请求');
    if(source==='purchase')fail('RESERVED_SOURCE','保留事件来源不可使用');
    const outcome=tx(()=>{
      const t=now();
      const a=ensureAccount(accountId,t);
      const old=q.findGrant.get(accountId,source,sourceRef);
      if(old)return {duplicated:true,result:{amount:0,balance:a.coins}};
      const balance=a.coins+amount;
      if(!Number.isSafeInteger(balance))fail('COIN_OVERFLOW','金币余额超出限制');
      q.adjustCoins.run(balance,accountId);
      q.addLedger.run(accountId,amount,balance,source,sourceRef,t);
      const event=recordEvent(accountId,'coins_granted',{amount,source,balance},t);
      return {duplicated:false,result:{amount,balance,event}};
    });
    if(!outcome.duplicated)emit(outcome.result.event);
    return {...outcome.result,idempotentReplay:outcome.duplicated};
  }
  function transferCoins({fromAccountId,toAccountId='ai:starry',amount,requestId}){
    if(typeof fromAccountId!=='string'||!fromAccountId.startsWith('user:')||toAccountId!=='ai:starry'||sharedWallet)fail('INVALID_TRANSFER','仅支持用户向 AI 爆金币');
    if(!inRangeInt(amount,1,100000))fail('INVALID_AMOUNT','金币数量需为 1–100000 的整数');
    const outcome=tx(()=>withIdempotency(fromAccountId,requestId,{type:'transfer',toAccountId,amount},()=>{
      const t=now(),from=ensureAccount(fromAccountId,t),to=ensureAccount(toAccountId,t);
      if(from.coins<amount)fail('INSUFFICIENT_COINS','金币不足',409);
      const fromBalance=from.coins-amount,toBalance=to.coins+amount;if(!Number.isSafeInteger(toBalance))fail('COIN_OVERFLOW','金币余额超出限制');
      q.adjustCoins.run(fromBalance,fromAccountId);q.adjustCoins.run(toBalance,toAccountId);
      const transferId=randomUUID();q.addLedger.run(fromAccountId,-amount,fromBalance,'tip_out',transferId,t);q.addLedger.run(toAccountId,amount,toBalance,'tip_in',transferId,t);
      const common={transferId,fromAccountId,toAccountId,amount};
      const event=recordEvent(fromAccountId,'transfer',{...common,direction:'out',balance:fromBalance},t),receivedEvent=recordEvent(toAccountId,'transfer',{...common,direction:'in',balance:toBalance},t);
      return {amount,fromBalance,toBalance,transferId,event,receivedEvent};
    }));
    if(!outcome.duplicated){emit(outcome.result.event);emit(outcome.result.receivedEvent);}return {...outcome.result,idempotentReplay:outcome.duplicated};
  }
  function adjustCoins({accountId,delta,requestId}){
    if(!inRangeInt(delta,-100000,100000)||!delta)fail('INVALID_AMOUNT','增减数量需为非零整数，最多 100000');
    const outcome=tx(()=>withIdempotency(accountId,requestId,{type:'admin_adjust',delta},()=>{
      const t=now(),a=ensureAccount(accountId,t),balance=a.coins+delta;
      if(balance<0)fail('INSUFFICIENT_COINS','扣除后余额不能小于 0',409);if(!Number.isSafeInteger(balance))fail('COIN_OVERFLOW','金币余额超出限制');
      q.adjustCoins.run(balance,accountId);q.addLedger.run(accountId,delta,balance,'admin_adjust',requestId,t);
      const event=recordEvent(accountId,'coins_adjusted',{amount:delta,delta,balance,source:'admin_adjust'},t);return {accountId,delta,balance,event};
    }));if(!outcome.duplicated)emit(outcome.result.event);return {...outcome.result,idempotentReplay:outcome.duplicated};
  }
  function getAccount(accountId){return tx(()=>{const t=now();return snapshot(accountId,ensureAccount(accountId,t),t);});}
  function getActivity(accountId,limit=20){
    if(!validAccount(accountId))fail('INVALID_ACCOUNT','无效账户');
    limit=Math.max(1,Math.min(50,Number(limit)||20));
    return {events:q.events.all(accountId,limit).map(e=>({...e,payload:JSON.parse(e.payload)})),orders:q.lastOrders.all(accountId,limit)};
  }
  function getAiPolicy(){return {...aiPolicy};}
  return {wallet,catalog:()=>[...itemMap.values()].map(item=>structuredClone(item)),createItem,getAccount,getActivity,getAiPolicy,purchase,use,grantCoins,transferCoins,adjustCoins,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
