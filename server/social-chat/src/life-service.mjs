import {createTokenRewards} from './token-rewards.mjs';
import {randomUUID} from 'node:crypto';
import {openLifeDatabase} from '../../life/src/db.mjs';
import {createLifeEngine,LifeError} from '../../life/src/engine.mjs';
import {createLifeRoutes} from '../../life/src/api.mjs';
import {createAiLifeToolExecutor,AI_TOOL_DEFINITIONS} from '../../life/src/ai-tools.mjs';
import {buildLifeContext} from '../../life/src/ai-context.mjs';
import {FURNITURE_ACTIONS} from '../../../src/agent/furniture-registry.mjs';

const EFFECTS={sleep:{mood:8,boredom:-5},sit:{mood:3,boredom:-3},bathe:{mood:7,boredom:-7},toilet:{mood:3},wash:{mood:2},prepare:{mood:2,boredom:-3},store:{mood:2,boredom:-2},water:{mood:4,boredom:-4},groom:{mood:3},stretch:{mood:5,boredom:-6},remote:{mood:3,boredom:-8}};
const consumes=type=>type==='eat'||type==='heat'?['food','snack']:type==='drink'?['drink']:null;
export function createLifeService(config,{now=()=>Date.now()}={}){
 const database=openLifeDatabase(config.lifeDbFile||config.dbFile),engine=createLifeEngine(database,{now,splitSharedWallet:true,walletMigrationMode:'admin'});
 database.exec('CREATE TABLE IF NOT EXISTS life_interaction_tickets(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,furniture_id TEXT NOT NULL,item_id TEXT,started_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,result TEXT)');
 const ticketInsert=database.prepare('INSERT INTO life_interaction_tickets VALUES (?,?,?,?,?,?,NULL)'),ticketRead=database.prepare('SELECT * FROM life_interaction_tickets WHERE id=? AND account_id=?'),ticketFinish=database.prepare('UPDATE life_interaction_tickets SET result=? WHERE id=?');
 const lastAction=database.prepare('SELECT created_at FROM life_events WHERE account_id=? AND type=\'furniture\' AND json_extract(payload,\'$.furnitureId\')=? ORDER BY id DESC LIMIT 1');
 const eventInsert=database.prepare('INSERT INTO life_events(account_id,type,payload,created_at) VALUES (?,\'furniture\',?,?)');
 const updateStats=database.prepare('UPDATE life_accounts SET mood=?,satiety=?,boredom=?,hydration=?,updated_at=? WHERE id=?');
 const eventsAfter=database.prepare("SELECT id,account_id AS accountId,type,payload,created_at AS createdAt FROM life_events WHERE account_id='ai:starry' AND type IN ('purchase','use','furniture') AND id>? ORDER BY id LIMIT 100");
 const listeners=new Set();const publish=event=>{for(const listener of listeners)try{listener(event);}catch(error){console.error('Life subscriber failed:',error.message);}};
 const tokenRewards=createTokenRewards({database,engine,publish,now});
 engine.subscribe(publish);
 function welcome(accountId,amount){if(amount>0)engine.grantCoins({accountId,amount,source:'welcome',sourceRef:'bluehaven_welcome_v1'});}
 welcome('ai:starry',config.lifeAiWelcomeCoins??160);
 function ensureUser(user){if(user?.id)welcome('user:'+user.id,config.lifeWelcomeCoins??120);return user;}
 const executeOriginal=createAiLifeToolExecutor(engine);
 function validateTool(name,args){
  const def=AI_TOOL_DEFINITIONS.find(t=>t.function.name===name);if(!def)throw Error('Unsupported AI tool');
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid tool arguments');
  const schema=def.function.parameters;
  for(const key of Object.keys(args))if(!Object.hasOwn(schema.properties,key))throw Error('Unknown tool argument: '+key);
  for(const key of schema.required||[])if(!Object.hasOwn(args,key))throw Error('Missing tool argument: '+key);
  if(args.itemId!==undefined&&(typeof args.itemId!=='string'||!/^[a-z0-9-]{2,50}$/.test(args.itemId)))throw Error('Invalid itemId');
  if(args.quantity!==undefined&&(!Number.isInteger(args.quantity)||args.quantity<1||args.quantity>2))throw Error('Invalid quantity');
 }
 async function executeTool(name,args,context){validateTool(name,args);return executeOriginal(name,args,context);}
 function startInteraction(user,furnitureId){
  if(typeof furnitureId!=='string'||!Object.hasOwn(FURNITURE_ACTIONS,furnitureId))throw new LifeError('UNKNOWN_FURNITURE','家具不存在',404);
  const action=FURNITURE_ACTIONS[furnitureId];
  if(!EFFECTS[action.type]&&!consumes(action.type))return {tracked:false};
  const accountId='user:'+user.id,account=engine.getAccount(accountId),categories=consumes(action.type);
  const owned=categories?account.inventory.find(i=>categories.includes(i.category)&&i.usesLeft>0):null;
  if(categories&&!owned)throw new LifeError('NOT_OWNED',categories.includes('drink')?'背包里没有饮料，请先到商店购买':'背包里没有食物，请先到商店购买',409);
  const previous=lastAction.get(accountId,furnitureId);if(!categories&&previous&&now()-previous.created_at<60000)return {tracked:false,cooldown:true};
  const id=randomUUID(),time=now();ticketInsert.run(id,accountId,furnitureId,owned?.itemId||null,time,time+300000);
  // Clean expired tickets without deleting completed audit events.
  database.prepare('DELETE FROM life_interaction_tickets WHERE expires_at<?').run(time-86400000);
  return {tracked:true,ticket:id,minimumSeconds:Math.min(action.duration||8,8),itemId:owned?.itemId||null};
 }
 function finishInteraction(user,id){
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new LifeError('UNKNOWN_TICKET','交互凭证不存在',404);
  const accountId='user:'+user.id,ticket=ticketRead.get(id,accountId);if(!ticket)throw new LifeError('UNKNOWN_TICKET','交互凭证不存在',404);
  if(ticket.result)return {...JSON.parse(ticket.result),idempotentReplay:true};
  if(now()>ticket.expires_at)throw new LifeError('EXPIRED','交互凭证已过期',409);
  const action=FURNITURE_ACTIONS[ticket.furniture_id],minimum=Math.min(action.duration||8,8)*1000;
  if(now()-ticket.started_at<minimum-100)throw new LifeError('TOO_EARLY','请完成家具动作后再结算',409);
  let result;
  if(ticket.item_id)result=engine.use({accountId,actorType:'human',itemId:ticket.item_id,requestId:'furniture:'+ticket.id});
  else {
   const previous=lastAction.get(accountId,ticket.furniture_id);if(previous&&now()-previous.created_at<60000)throw new LifeError('COOLDOWN','家具生活加成仍在冷却',409);
   const account=engine.getAccount(accountId),effects=EFFECTS[action.type],stats=Object.fromEntries(Object.entries(account.stats).map(([key,value])=>[key,Math.round(Math.min(100,Math.max(0,value+(effects[key]||0)))*100)/100]));
   const payload={furnitureId:ticket.furniture_id,label:action.label,effects,stats};
   database.exec('BEGIN IMMEDIATE');
   try{updateStats.run(stats.mood,stats.satiety,stats.boredom,stats.hydration,now(),accountId);const event=eventInsert.run(accountId,JSON.stringify(payload),now());result={event:{id:Number(event.lastInsertRowid),accountId,type:'furniture',payload,createdAt:now()}};ticketFinish.run(JSON.stringify(result),id);database.exec('COMMIT');}catch(error){database.exec('ROLLBACK');throw error;}
   publish(result.event);
  }
  if(ticket.item_id)ticketFinish.run(JSON.stringify(result),id);
  return {...result,account:engine.getAccount(accountId)};
 }
 function applyAiActivity(furnitureId,requestId){
  const action=FURNITURE_ACTIONS[furnitureId],effects=EFFECTS[action?.type];
  if(!effects)throw Error('Unsupported autonomous activity');
  const accountId='ai:starry',account=engine.getAccount(accountId);
  const previous=database.prepare('SELECT response FROM life_ops WHERE account_id=? AND request_key=?').get(accountId,requestId);
  if(previous)return JSON.parse(previous.response);
  const stats=Object.fromEntries(Object.entries(account.stats).map(([k,v])=>[k,Math.min(100,Math.max(0,v+(effects[k]||0)))]));
  const payload={furnitureId,label:action.label,effects,stats};let result;
  database.exec('BEGIN IMMEDIATE');
  try{updateStats.run(stats.mood,stats.satiety,stats.boredom,stats.hydration,now(),accountId);const e=eventInsert.run(accountId,JSON.stringify(payload),now());result={event:{id:Number(e.lastInsertRowid),accountId,type:'furniture',payload,createdAt:now()}};database.prepare('INSERT INTO life_ops VALUES(?,?,?,?,?)').run(accountId,requestId,furnitureId,JSON.stringify(result),now());database.exec('COMMIT');}catch(error){database.exec('ROLLBACK');throw error;}
  publish(result.event);return result;
 }
 function createRoutes(resolveUser,allowedOrigins){
  const original=createLifeRoutes({engine,resolveUser:async req=>ensureUser(await resolveUser(req)),allowedOrigins});
  return async(req,res)=>{
   const url=new URL(req.url,'http://localhost').pathname;
   if(!['/api/life/interaction/start','/api/life/interaction/finish'].includes(url))return original(req,res);
   const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
   try{
    const origin=req.headers.origin;if(origin&&!allowedOrigins.includes(origin)&&origin!=='http://'+req.headers.host&&origin!=='https://'+req.headers.host)throw new LifeError('ORIGIN_DENIED','请求来源不允许',403);
    const user=ensureUser(await resolveUser(req));if(!user)return send(401,{error:'请先登录',code:'UNAUTHENTICATED'});
    if(req.method!=='POST')return send(405,{error:'仅支持 POST'});
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw new LifeError('BODY_TOO_LARGE','请求过大',413);chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new LifeError('INVALID_JSON','JSON 格式错误');}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new LifeError('INVALID_JSON','请求格式错误');
    const result=url.endsWith('/start')?startInteraction(user,body.furnitureId):finishInteraction(user,body.ticket);
    send(200,{result});
   }catch(error){send(error instanceof LifeError?error.status:500,{error:error instanceof LifeError?error.message:'生活系统暂时不可用',code:error.code||'SERVER_ERROR'});}
  };
 }
 return {tokenRewards,applyAiActivity,engine,ensureUser,createRoutes,executeTool,tools:AI_TOOL_DEFINITIONS,context:()=>buildLifeContext(engine,config.aiName),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},publicEventsAfter:after=>eventsAfter.all(after).map(e=>({...e,payload:JSON.parse(e.payload)})),startInteraction,finishInteraction,close:()=>database.close()};
}
