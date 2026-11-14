import {createChatUploads} from './uploads.mjs';
import {createGroupManagement} from './group-management.mjs';
import {createRuntimeJournal} from './runtime-journal.mjs';
import {localIntent} from './unified-command.mjs';
import {createMembership} from './membership.mjs';
import {validateProfile,createAiProfile} from './ai-profile.mjs';
import {createAiSettings} from './ai-settings.mjs';
import {createAdminConsole} from './admin-console.mjs';
import {createAvatarAutonomy} from './avatar-autonomy.mjs';
import {createLifeService} from './life-service.mjs';
import {createChatMemory} from './memory.mjs';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import {initializeAdmin} from './bootstrap-admin.mjs';
import { createDB, tokenHash } from './db.mjs';
import { createAiWorker, requestTts } from './ai.mjs';

const config = loadConfig();
const db = createDB(config.dbFile);
try{initializeAdmin(db,process.env);}catch(error){db.close();throw error;}
const membership=createMembership({config,db});
const group=createGroupManagement({config});
const uploads=createChatUploads({config});
const journal=createRuntimeJournal({config,db});
const aiSettings=createAiSettings({config});
const spaceConfig=new Proxy(config,{get:(target,key)=>aiSettings.effective(null)[key]});
const life = createLifeService(config);
const memory = await createChatMemory({db,config,getLifeEvents:life.publicEventsAfter});
if (!existsSync(config.personaPath)) {
  mkdirSync(path.dirname(config.personaPath), {recursive:true});
  copyFileSync(config.personaTemplatePath, config.personaPath);
}
let persona = readFileSync(config.personaPath, 'utf8');
const identity=createAiProfile({config,defaults:JSON.parse(readFileSync(config.profilePath,'utf8'))});
const profile=identity.profile;

let adminConsole=null;
const subscribers = new Map();
const sessionStreams = new Map();
const limits = new Map();
// 避免常驻服务的简单速率计数缓存无限增长。
setInterval(() => { const now=Date.now(); for(const [key,times] of limits){ const recent=times.filter(ts=>now-ts<60000); if(recent.length)limits.set(key,recent);else limits.delete(key); } }, 600000).unref();
const AUTH_COOKIE = 'bh_session';
const maxBytes = 20_000;

const mime = 'application/json; charset=utf-8';
const sendJson = (res, code, data, headers = {}) => {
  res.writeHead(code, {'Content-Type':mime, 'Cache-Control':'no-store', ...headers});
  res.end(JSON.stringify(data));
};
const failure = (res, code, message) => sendJson(res, code, { error:message });
const parseCookie = header => Object.fromEntries((header||'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
  const i=s.indexOf('=');return [s.slice(0,i),decodeURIComponent(s.slice(i+1))];
}));
const sessionCookie = (value, exp = false, req = null) => `${AUTH_COOKIE}=${value}; HttpOnly; Path=/api; SameSite=Lax${config.cookieSecure ? '; Secure' : ''}${exp ? '; Max-Age=0' : '; Max-Age=604800'}`;
const currentUser = req => db.findSession(parseCookie(req.headers.cookie)[AUTH_COOKIE]);
const validUsername = str => typeof str==='string' && /^[a-zA-Z0-9_]{3,24}$/.test(str);
const validName = str => typeof str==='string' && str.trim().length>=1 && str.trim().length<=30 && !/[<>\x00-\x1F]/.test(str);
const validPassword = str => typeof str==='string' && str.length>=8 && str.length<=128;
const rate = (key, max, windowMs) => {
  const now=Date.now();
  const old = (limits.get(key)||[]).filter(t=>now-t<windowMs);
  old.push(now); limits.set(key,old);
  return old.length<=max;
};
const statusFromErr = e => String(e?.message||'').includes('UNIQUE constraint') ? 409 : 500;
const cleanError = e => String(e?.message||'').includes('UNIQUE constraint') ? '用户名已被占用' : '服务器内部错误';

async function readJson(req,limit=maxBytes) {
  let size = 0, text = '';
  for await (const buf of req) {
    size += buf.length;
    if (size>limit) { const e=new Error('请求体过大'); e.status=413; throw e; }
    text += buf.toString('utf8');
  }
  try { return JSON.parse(text); }
  catch { const e=new Error('无效的 JSON'); e.status=400; throw e; }
}
function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && (config.clientOrigins.includes(origin) || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Vary','Origin');
    return true;
  }
  return !origin;
}
const writeEvent = (res, event, data) => {
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
const presence = () => {
  const users = [...subscribers.keys()];
  return { onlineUserIds: users, onlineCount: users.length };
};
function broadcast(event, data) {
  if(event==='message')journal.chat(data.message);
  if(['ai_status','ai_error','token_usage'].includes(event))adminConsole?.log(event,event==='ai_status'?(data.requestedBy?.displayName||'用户')+' · '+data.status:event==='ai_error'?'AI 请求失败':'本轮 '+data.lastRequestTokens+' token');
  for (const connections of subscribers.values()) {
    for (const res of connections) {
      try { writeEvent(res,event,data); } catch { /* dead connection */ }
    }
  }
}
const lifeRoutes=life.createRoutes(currentUser,config.clientOrigins);
life.subscribe(event=>{
 journal.life(event,life.engine.catalog());
 if(['purchase','coins_granted','coins_adjusted','transfer'].includes(event.type)){
  const data={walletId:event.accountId,balance:event.payload.balance};
  if(event.accountId==='ai:starry')broadcast('wallet_changed',data);else for(const response of subscribers.get(event.accountId.replace(/^user:/,''))||[])writeEvent(response,'wallet_changed',data);
 }
 if(event.accountId==='ai:starry'){
  broadcast('life_event',{event});
  if(['purchase','use','furniture'].includes(event.type))void memory.sync().catch(error=>console.error('Life memory sync failed:',error.message));
 }else{
  const recipients=subscribers.get(event.accountId.replace(/^user:/,''));
  if(recipients)for(const response of recipients)writeEvent(response,'life_event',{event});
 }
});
const avatar=createAvatarAutonomy({life,config:spaceConfig,memory,readPersona:()=>persona,onEvent:(status,plan)=>{journal.action(status,plan);if(plan.source==='chat')broadcast('avatar_action',{actionId:plan.id,status,label:plan.label||plan.command?.type,messageId:plan.context?.replyToMessageId,requestedBy:plan.context?.requestedBy});},withContext:journal.withContext});
const embodiedLife={...life,tools:[...life.tools,...avatar.tools],context:()=>life.context()+'\n角色控制：'+avatar.context(),executeTool:(name,args,trace)=>journal.withContext(trace,async()=>{
 try{if(trace?.requestedBy&&db.allUsers().find(u=>u.id===trace.requestedBy.id)?.role!=='admin')throw Object.assign(Error('仅空间管理员可控制角色活动'),{status:403});if(name==='life_use_item'&&(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>k!=='itemId')))throw Error('Invalid use-item arguments');const result=name==='life_use_item'?await avatar.enqueueUse(args.itemId,trace):name.startsWith('avatar_')?await avatar.executeTool(name,args,trace):await life.executeTool(name,args,trace);journal.log('tool',(trace.requestedBy?.displayName||'用户')+' 请求的 AI 工具 '+name+'：'+(result.status||'成功'),{...trace,tool:name,status:result.status||'completed'},'tool:'+trace.requestId);return result;}
 catch(error){journal.log('tool','AI 工具 '+name+' 失败：'+error.message,{...trace,tool:name,status:'failed'},'tool:'+trace.requestId);throw error;}
})};
const aiWorker = createAiWorker({ db, config, media:uploads, usageMeter:group, resolveConfig:id=>({...aiSettings.effective(id),canControlAvatar:db.allUsers().find(u=>u.id===id)?.role==='admin'}), broadcast, memory, life:embodiedLife, readPersona:()=>persona });
adminConsole=createAdminConsole({journal,config:spaceConfig,life,avatar,memory,getWorker:()=>aiWorker.getStatus(),cancelAi:()=>aiWorker.cancelAll(),getConnections:()=>[...subscribers.values()].reduce((n,v)=>n+v.size,0),notify:()=>broadcast('wallet_changed',{walletId:'ai:starry',balance:life.engine.getAccount('ai:starry').coins})});
for(const message of db.getMessages({limit:100}))journal.chat(message);
for(const event of life.engine.getActivity('ai:starry',50).events.reverse())journal.life({...event,accountId:'ai:starry'},life.engine.catalog());
const requireAuth = (req,res) => {
  const me = currentUser(req);
  if (!me) { failure(res,401,'请先登录'); return null; }
  return me;
};
function corsGuard(req,res) {
  if (!allowOrigin(req,res)) { failure(res,403,'请求来源未获授权'); return false; }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end(); return false;
  }
  return true;
}

const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if (!corsGuard(req,res)) return;
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const ip = req.socket.remoteAddress || 'unknown';
  const userAgent = String(req.headers['user-agent']||'').slice(0,200);
  try {
    if(pathname==='/api/uploads'||pathname.startsWith('/api/uploads/')){
     const me=requireAuth(req,res);if(!me)return;const parts=pathname.split('/');
     if(pathname==='/api/uploads'&&req.method==='POST'){group.assertMember(me.id);if(!rate('upload:'+me.id,12,60000))return failure(res,429,'上传过于频繁');return sendJson(res,201,{attachment:await uploads.upload(req,me)});}
     if(parts.length===4&&['GET','HEAD'].includes(req.method)){uploads.serve(req,res,parts[3],me);return;}
     if(parts.length===5&&parts[4]==='frames'&&req.method==='POST'){group.assertMember(me.id);return sendJson(res,200,{attachment:uploads.setFrames(parts[3],me,await readJson(req,4500000))});}
     return failure(res,405,'附件接口不支持此操作');
    }
    if(pathname.startsWith('/api/admin/group/')){
     const me=requireAuth(req,res);if(!me)return;if(me.role!=='admin')return failure(res,403,'仅空间管理员可管理群聊');
     if(!rate('group:'+me.id,120,60000))return failure(res,429,'操作过于频繁');
     if(pathname==='/api/admin/group/members'&&req.method==='GET')return sendJson(res,200,group.list(me));
     if(pathname==='/api/admin/group/manage'&&req.method==='POST'){
      const body=await readJson(req),result=group.manage(me,body);journal.log('moderation',me.display_name+' '+body.action+' '+result.member.displayName,{actorId:me.id,targetId:body.userId,action:body.action});
      if(body.action==='mute'||body.action==='kick'||body.action==='quota'&&result.member.usage.remaining===0)aiWorker.cancelUser(body.userId);
      if(body.action==='kick'){for(const client of [...(subscribers.get(body.userId)||[])]){writeEvent(client,'membership_changed',{membership:'kicked'});client.end();}}
      else broadcast('member_moderated',{userId:body.userId,mutedUntil:result.member.mutedUntil,dailyTokenLimit:result.member.dailyTokenLimit});
      broadcast('members',{members:db.allUsers()});return sendJson(res,200,result);
     }
     return failure(res,405,'请求方式不支持');
    }
    if(pathname==='/api/join-policy'&&req.method==='GET')return sendJson(res,200,{policy:membership.settings()});
    if(pathname.startsWith('/api/admin/join/')){
     const me=requireAuth(req,res);if(!me)return;if(me.role!=='admin')return failure(res,403,'仅空间管理员可用');
     if(pathname.endsWith('/settings')&&req.method==='GET')return sendJson(res,200,{policy:membership.settings(true)});
     if(pathname.endsWith('/settings')&&req.method==='PUT')return sendJson(res,200,{policy:membership.save(me,await readJson(req))});
     if(pathname.endsWith('/requests')&&req.method==='GET')return sendJson(res,200,{requests:membership.requests(me)});
     if(pathname.endsWith('/review')&&req.method==='POST'){const result=membership.review(me,await readJson(req));broadcast('members',{members:db.allUsers()});return sendJson(res,200,result);}
     return failure(res,405,'请求方式不支持');
    }
    if(pathname==='/api/me/profile'&&req.method==='PUT'){
     const me=requireAuth(req,res);if(!me)return;if(!rate('profile:'+me.id,15,60000))return failure(res,429,'操作过于频繁');
     const user=db.updateProfile(me.id,validateProfile(await readJson(req,300000)));broadcast('member_profile_changed',{user});broadcast('members',{members:db.allUsers()});return sendJson(res,200,{user});
    }
    if(pathname==='/api/ai-profile'){
     const me=requireAuth(req,res);if(!me)return;
     if(req.method==='GET')return sendJson(res,200,{profile});
     if(req.method!=='PUT')return failure(res,405,'请求方式不支持');
     if(me.role!=='admin')return failure(res,403,'仅空间管理员可修改 AI 资料');
     if(!rate('ai-profile:'+me.id,15,60000))return failure(res,429,'操作过于频繁');
     const saved=identity.save(me,await readJson(req,300000));broadcast('ai_profile_changed',{profile:saved});return sendJson(res,200,{profile:saved});
    }
    if(pathname==='/api/ai-settings'||pathname==='/api/ai-settings/test'){
     const me=requireAuth(req,res);if(!me)return;
     if(!rate('ai-settings:'+me.id,30,60000))return failure(res,429,'设置操作过于频繁');
     if(req.method==='GET'&&pathname==='/api/ai-settings')return sendJson(res,200,aiSettings.describe(me));
     if(!['PUT','POST','DELETE'].includes(req.method))return failure(res,405,'请求方式不支持');
     const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body))return failure(res,400,'设置格式无效');let result;
     if(pathname.endsWith('/test')&&req.method==='POST')return sendJson(res,200,await aiSettings.test(me,body));
     if(pathname==='/api/ai-settings'&&req.method==='PUT')result=aiSettings.save(me,body);
     else if(pathname==='/api/ai-settings'&&req.method==='DELETE')result=aiSettings.remove(me);
     else return failure(res,405,'请求方式不支持');
     broadcast('ai_settings_changed',{});
     return sendJson(res,200,result);
    }
     if(pathname.startsWith('/api/admin/console/')){
     const me=requireAuth(req,res);if(!me)return;if(me.role!=='admin')return failure(res,403,'仅空间管理员可用');
     if(!rate('console:'+me.id,120,60000))return failure(res,429,'操作过于频繁');
     if(pathname==='/api/admin/console/status'&&req.method==='GET')return sendJson(res,200,adminConsole.status(me));
     if(pathname==='/api/admin/console/command'&&req.method==='POST')return sendJson(res,200,await adminConsole.execute(me,await readJson(req)));
     return failure(res,404,'控制台接口不存在');
    }
    if(pathname.startsWith('/api/autonomy/')){
     const me=requireAuth(req,res);if(!me)return;
     if(!rate('autonomy:'+me.id,240,60000))return failure(res,429,'同步过于频繁');
     const route=pathname.slice('/api/autonomy/'.length);
     if(route==='state'&&req.method==='GET')return sendJson(res,200,{...avatar.getState(me,new URL(req.url,'http://localhost').searchParams.get('clientId')||''),canControl:me.role==='admin'});
     if(me.role!=='admin')return failure(res,403,'仅空间管理员可控制角色');
     if(req.method!=='POST')return failure(res,405,'仅支持 POST');
     const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body))return failure(res,400,'参数无效');
     let result;
     if(route==='claim')result=await avatar.claim(me,body.clientId);
     else if(['heartbeat','arrive','complete','release'].includes(route))result=avatar[route](me,body);
     else if(route==='fail')result=avatar.failPlan(me,body);
     else if(route==='suspend')result=avatar.suspend('手动接管');
     else if(route==='config'){if(body.enabled!==undefined)avatar.setEnabled(body.enabled);result=avatar.getState(me,body.clientId);}
     else return failure(res,404,'角色接口不存在');
     return sendJson(res,200,result);
    }
    if(pathname.startsWith('/api/life/')){await lifeRoutes(req,res);return;}
    if (pathname === '/api/health' && req.method==='GET') return sendJson(res,200,{ ok:true, service:'bluehaven-chat-api', now:Date.now(),memory:{enabled:memory.getStatus().enabled,ready:memory.getStatus().ready,provider:'LongMemory'} });
    if (pathname === '/api/config' && req.method==='GET') {const active=aiSettings.effective(currentUser(req)?.id);return sendJson(res,200,{
      aiName: config.aiName, aiMode: active.aiMode, aiTriggerMode: active.aiTriggerMode,
      tts: { browser:true, server:config.ttsEnabled }, profile, memory:{enabled:memory.getStatus().enabled,ready:memory.getStatus().ready,provider:'LongMemory'},
    });
    }
    if (pathname === '/api/auth/register' && req.method==='POST') {
      if (!rate(`register:${ip}`,8,60_000)) return failure(res,429,'注册请求过于频繁');
      const data = await readJson(req);
      const {username,displayName,password} = data;
      if (!validUsername(username)||!validName(displayName)||!validPassword(password)) return failure(res,400,'用户名需为 3–24 位字母数字下划线，昵称 1–30 字，密码至少 8 位');
      try {
        const user = membership.register({...data,username,displayName:displayName.trim(),password});
        if(user.membership!=='approved')return sendJson(res,202,{membership:user.membership,message:'入群申请已提交，等待管理员审核'});
        const token = db.createSession(user.id);
        broadcast('members',{members:db.allUsers()});
        return sendJson(res,201,{user},{'Set-Cookie':sessionCookie(token,false,req)});
      } catch(e) { return failure(res,e.status||statusFromErr(e),e.status?e.message:cleanError(e)); }
    }
    if (pathname === '/api/auth/login' && req.method==='POST') {
      if (!rate(`login:${ip}`,18,60_000)) return failure(res,429,'登录尝试过于频繁');
      const data = await readJson(req);
      if (typeof data.username !== 'string'||typeof data.password!=='string') return failure(res,400,'缺少用户名或密码');
      const user = db.validateLogin(data.username,data.password);
      if (!user) return failure(res,401,'账号或密码不正确');
      if(user.membership!=='approved')return sendJson(res,202,{membership:user.membership,message:user.membership==='pending'?'入群申请待审核':user.membership==='kicked'?'已被移出群聊，可重新申请加入':'入群申请未通过，可重新提交申请'});
      const token = db.createSession(user.id);
      return sendJson(res,200,{user},{'Set-Cookie':sessionCookie(token,false,req)});
    }
    if (pathname === '/api/auth/logout' && req.method==='POST') {
      const token=parseCookie(req.headers.cookie)[AUTH_COOKIE];
      db.deleteSession(token);
      if (token) {
        const active=sessionStreams.get(tokenHash(token));
        if(active)for(const stream of [...active])stream.end();
      }
      return sendJson(res,200,{ok:true},{'Set-Cookie':sessionCookie('',true,req)});
    }
    if(pathname==='/api/token-rewards'&&req.method==='GET'){const me=requireAuth(req,res);if(!me)return;return sendJson(res,200,{rewards:life.tokenRewards.getState('ai:starry'),account:life.engine.getAccount('ai:starry')});}
    if (pathname === '/api/memory/status' && req.method==='GET') {
      const me=requireAuth(req,res);if(!me)return;
      return sendJson(res,200,{memory:memory.getStatus()});
    }
    if (pathname === '/api/me' && req.method === 'GET') {
      const me=requireAuth(req,res); if(!me)return;
      return sendJson(res,200,{ user:me });
    }
    if (pathname === '/api/bootstrap' && req.method==='GET') {
      const me=requireAuth(req,res); if(!me)return;
      return sendJson(res,200,{ me, members:db.allUsers(), messages:db.getMessages({limit:65}), presence:presence(), profile, aiMode:aiSettings.effective(me.id).aiMode, memory:memory.getStatus() });
    }
    if (pathname === '/api/messages' && req.method==='GET') {
      const me=requireAuth(req,res); if(!me)return;
      const url=new URL(req.url,'http://localhost');
      const before=Number(url.searchParams.get('before')||0);
      const after=Number(url.searchParams.get('after')||0);
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||50),1),100);
      if (!Number.isInteger(before)||before<0||!Number.isInteger(after)||after<0||!Number.isFinite(limit))return failure(res,400,'非法游标');
      if (before&&after) return failure(res,400,'不能同时指定 before 与 after');
      return sendJson(res,200,{ messages:db.getMessages({before:before||undefined,after:after||undefined,limit}) });
    }
    if (pathname === '/api/messages' && req.method==='POST') {
      const me=requireAuth(req,res); if(!me)return;
      if(me.muted_until===-1||me.muted_until>Date.now())return failure(res,403,'禁言期间不能发言');
      if (!rate(`message:${me.id}`,14,10_000)) return failure(res,429,'发送太频繁，请稍后再试');
      const data=await readJson(req);
      const attachments=uploads.validateAttachments(me.id,data.attachments||[]);
      if (typeof data.content!=='string'||!data.content.trim()&&!attachments.length||data.content.length>2000) return failure(res,400,'消息长度必须在 1–2000 字符内');
      if (typeof data.clientId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(data.clientId)) return failure(res,400,'clientId 无效');
      const {message,created}=db.addHumanMessage(me.id,data.content.trim(),data.clientId,attachments);
      let actions=[];
      if (created) {
        journal.chat(message);
        const commands=me.role==='admin'?localIntent(message.content):null;
        if(commands)try{for(const [i,command] of commands.entries())actions.push(await journal.withContext({replyToMessageId:message.id,requestedBy:message.author},()=>avatar.enqueue(command,{requestId:'local:'+message.id+':'+i,replyToMessageId:message.id,requestedBy:message.author})));}catch(error){journal.log('action','动作未能安排：'+error.message,{replyToMessageId:message.id,requestedBy:message.author});}
        try{await memory.sync();}catch(error){console.error('LongMemory sync failed:',error.message);}
        broadcast('memory_status',memory.getStatus());broadcast('message',{message:db.getMessage(message.id)});aiWorker.notifyHuman(message);
      }
      return sendJson(res,created?201:200,{message:db.getMessage(message.id),created,actions});
    }
    if (pathname === '/api/events' && req.method==='GET') {
      const me=requireAuth(req,res); if(!me)return;
      if ((subscribers.get(me.id)?.size||0)>4) return failure(res,429,'连接数过多');
      res.writeHead(200, {
        'Content-Type':'text/event-stream; charset=utf-8',
        'Cache-Control':'no-cache, no-transform',
        'Connection':'keep-alive',
        'X-Accel-Buffering':'no',
      });
      res.write(': ready\n\n');
      const existing=subscribers.get(me.id)||new Set();
      existing.add(res); subscribers.set(me.id,existing);
      const sessionToken = parseCookie(req.headers.cookie)[AUTH_COOKIE];
      const sessionKey = tokenHash(sessionToken);
      const sameSession = sessionStreams.get(sessionKey)||new Set();
      sameSession.add(res);sessionStreams.set(sessionKey,sameSession);
      writeEvent(res,'connected',{ now:Date.now(), userId:me.id });
      broadcast('presence',presence());
      const heartbeat=setInterval(()=>{if(!res.writableEnded)res.write(': heartbeat\n\n');},15000);
      req.on('close',()=>{
        clearInterval(heartbeat);
        const clients=subscribers.get(me.id);
        if(clients){clients.delete(res);if(clients.size===0)subscribers.delete(me.id);}
        const sessions=sessionStreams.get(sessionKey);
        if(sessions){sessions.delete(res);if(sessions.size===0)sessionStreams.delete(sessionKey);}
        broadcast('presence',presence());
      });
      return;
    }
    if (pathname === '/api/admin/persona' && (req.method==='GET'||req.method==='PUT')) {
      const me=requireAuth(req,res); if(!me)return;
      if (me.role!=='admin') return failure(res,403,'仅管理员可编辑人格');
      if (req.method==='GET') return sendJson(res,200,{persona});
      if (!rate(`persona:${me.id}`,6,60_000)) return failure(res,429,'修改过于频繁');
      const data=await readJson(req);
      if(typeof data.persona!=='string'||data.persona.length<40||data.persona.length>10000) return failure(res,400,'人格设定需为 40–10000 字符');
      const updated=data.persona.trim();
      writeFileSync(config.personaPath,updated+'\n','utf8');
      persona=updated;
      broadcast('persona_updated',{by:me.display_name});
      return sendJson(res,200,{ok:true});
    }
    if (pathname === '/api/tts' && req.method==='POST') {
      const me=requireAuth(req,res); if(!me)return;
      if(!rate(`tts:${me.id}`,5,60_000))return failure(res,429,'语音请求过于频繁');
      if(!config.ttsEnabled)return failure(res,501,'服务端 TTS 尚未启用，可用浏览器朗读');
      const data=await readJson(req);
      if (!Number.isInteger(data.messageId)||data.messageId<=0) return failure(res,400,'无效的消息 ID');
      const message=db.getMessage(data.messageId);
      if(!message||message.role!=='ai') return failure(res,404,'只能朗读 AI 消息');
      const buffer=await requestTts(config,message.content);
      res.writeHead(200,{ 'Content-Type':'audio/mpeg', 'Content-Length':buffer.length, 'Cache-Control':'private, max-age=120' });
      res.end(buffer);return;
    }
    return failure(res,404,'路由不存在');
  } catch(error) {
    adminConsole?.log('error',req.method+' '+pathname+' · '+(error.status||500));
    console.error(`[${new Date().toISOString()}] ${req.method} ${pathname}:`,error);
    if (!res.headersSent) failure(res,error.status||500,error.status?error.message:'服务器遇到错误');
    else res.end();
  }
});
server.requestTimeout = 180000;
server.headersTimeout = 30000;
server.listen(config.port,config.host,()=>{
  console.log(`Uoya API: http://${config.host}:${config.port}`);
  console.log(`AI mode: ${config.aiMode}; TTS server enabled: ${config.ttsEnabled}; DB: ${config.dbFile}`);
  console.log('LongMemory:',JSON.stringify(memory.getStatus()));
  if (config.aiMode==='mock') console.log('演示模式：AI 输出为标注【演示模式】的固定回答，不会调用外部模型。');

});
for (const signal of ['SIGINT','SIGTERM']) {
  process.once(signal,()=>{
    console.log(`Received ${signal}, shutting down`);
    aiWorker.close();
    for(const clients of subscribers.values())for(const res of clients)res.end();
    server.close(async()=>{try{journal.close();uploads.close();group.close();membership.close();aiSettings.close();adminConsole.close();avatar.close();await memory.close();life.close();db.close();process.exit(0);}catch(error){console.error('Memory shutdown failed:',error.message);process.exit(1);}});
    setTimeout(()=>process.exit(1),8000).unref();
  });
}
