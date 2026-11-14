import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createDB } from '../src/db.mjs';
import { buildContext, parseChatCompletionSSE } from '../src/ai.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function tempDir(){return mkdtempSync(path.join(tmpdir(),'bluehaven-chat-test-'));}
async function openPort(){return await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}

await test('SQLite: 注册首个管理员、密码、幂等发送、持久化与群聊上下文', async () => {
  const dir=tempDir();const filepath=path.join(dir,'chat.sqlite');
  try {
    let db=createDB(filepath);
    const alice=db.register({username:'alice',displayName:'Alice',password:'passw0rd!'});
    const bob=db.register({username:'bob01',displayName:'Bob',password:'passw0rd!'});
    assert.equal(alice.role,'admin');assert.equal(bob.role,'member');
    assert.equal(db.validateLogin('alice','wrong'),null);
    assert.equal(db.validateLogin('alice','passw0rd!').id,alice.id);
    const session=db.createSession(bob.id);
    assert.equal(db.findSession(session).username,'bob01');
    const r=db.addHumanMessage(alice.id,'你好群聊','c0000001');
    assert.equal(r.created,true);
    assert.equal(db.addHumanMessage(alice.id,'再次尝试','c0000001').created,false);
    db.addHumanMessage(bob.id,'大家好','c0000002');
    db.addAiMessage('欢迎大家');
    assert.deepEqual(db.getMessages({limit:3}).map(m=>m.role),['human','human','ai']);
    assert.equal(db.getMessages({after:1}).length,2);
    assert.equal(db.getMessages({before:3}).length,2);
    const ctx=buildContext(db,'你是星澜','星澜');
    assert.equal(ctx[0].role,'system');assert.ok(ctx[1].content.includes('Alice'));
    db.close();db=createDB(filepath);
    assert.equal(db.getMessages({limit:9}).length,3);
    db.deleteSession(session);assert.equal(db.findSession(session),null);
    db.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

await test('SSE 流解析：按块拆开的 data 与 token 合并', async () => {
  const encoder=new TextEncoder();
  const chunks=['data: {"choices":[{"delta":{"content":"你','好"}}]}\n\n','data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n','data: [DONE]\n\n'];
  const stream=new ReadableStream({start(controller){chunks.forEach(c=>controller.enqueue(encoder.encode(c)));controller.close();}});
  let output='';for await(const token of parseChatCompletionSSE(stream))output+=token;
  assert.equal(output,'你好，世界');
});

await test('HTTP + 两真人 + 一 AI + SSE + 权限 + 人格编辑 + TTS 插槽（真实服务端集成）', async (t) => {
  const dir=tempDir(),port=await openPort();
  const personaFile=path.join(dir,'persona.md');
  writeFileSync(personaFile,'你是群聊 AI 星澜，只回答群聊中的话。你好。');
  const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATABASE_FILE:path.join(dir,'chat.sqlite'),PERSONA_FILE:personaFile,
    INVITE_CODE:'integration-code',AI_MODE:'mock',CLIENT_ORIGIN:'http://localhost:5173',TTS_ENABLED:'false'};
  const proc=spawn(process.execPath,['src/index.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let log=''; proc.stdout.on('data',buf=>log+=buf.toString());proc.stderr.on('data',buf=>log+=buf.toString());
  t.after(async()=>{proc.kill('SIGTERM');await delay(200);rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  let ok=false;
  for (let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ok=true;break;}}catch{}await delay(70);}
  assert.ok(ok,'server did not start: '+log);
  const request=async(path,{method='GET',body,cookie,origin='http://localhost:5173'}={})=>{
    const res=await fetch(base+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {code:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  };
  const guest=await request('/api/messages');assert.equal(guest.code,401);
  const alice=await request('/api/auth/register',{method:'POST',body:{username:'alice',displayName:'Alice',password:'passwordA',inviteCode:'integration-code'}});
  assert.equal(alice.code,201);assert.equal(alice.json.user.role,'admin');assert.ok(alice.cookie?.includes('bh_session='));
  const bob=await request('/api/auth/register',{method:'POST',body:{username:'bob01',displayName:'小波',password:'passwordB',inviteCode:'integration-code'}});
  assert.equal(bob.code,201);assert.equal(bob.json.user.role,'member');
  const personaForbidden=await request('/api/admin/persona',{cookie:bob.cookie});assert.equal(personaForbidden.code,403);
  const changed=await request('/api/admin/persona',{method:'PUT',cookie:alice.cookie,body:{persona:'# 星澜人格\n'+('机敏、体贴、实事求是。'.repeat(9))}});
  assert.equal(changed.code,200);assert.match(readFileSync(personaFile,'utf8'),/星澜人格/);
  const crossOrigin=await request('/api/bootstrap',{cookie:alice.cookie,origin:'https://untrusted.test'});
  assert.equal(crossOrigin.code,403);
  const aStream=await fetch(base+'/api/events',{headers:{Origin:'http://localhost:5173',Cookie:alice.cookie}});
  const bStream=await fetch(base+'/api/events',{headers:{Origin:'http://localhost:5173',Cookie:bob.cookie}});
  assert.equal(aStream.status,200);assert.equal(bStream.status,200);
  const readEvents=async stream=>{
    const reader=stream.body.getReader();let text='';const events=[];
    const promise=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);let idx;while((idx=text.indexOf('\n\n'))>=0){const part=text.slice(0,idx);text=text.slice(idx+2);const name=part.match(/^event: (.+)$/m)?.[1];const data=part.match(/^data: (.+)$/m)?.[1];if(name&&data)events.push({name,data:JSON.parse(data)});}}}catch{}})();
    return {events,close:()=>reader.cancel().catch(()=>{}),promise};
  };
  const as=await readEvents(aStream),bs=await readEvents(bStream);
  t.after(()=>{as.close();bs.close();});
  const send1=await request('/api/messages',{method:'POST',cookie:alice.cookie,body:{content:'大家好，欢迎加入！',clientId:'client-msg-123456'}});
  assert.equal(send1.code,201);
  const again=await request('/api/messages',{method:'POST',cookie:alice.cookie,body:{content:'重复发送',clientId:'client-msg-123456'}});
  assert.equal(again.code,200);assert.equal(again.json.created,false);
  const send2=await request('/api/messages',{method:'POST',cookie:bob.cookie,body:{content:'星澜，你觉得今天聊什么？',clientId:'client-msg-789012'}});
  assert.equal(send2.code,201);
  let ai;
  for(let i=0;i<90;i++){await delay(70);const data=await request('/api/messages?limit=10',{cookie:alice.cookie});ai=data.json.messages.find(m=>m.role==='ai');if(ai)break;}
  assert.ok(ai,'AI mock did not respond');assert.match(ai.content,/【演示模式】/);
  assert.ok(!ai.author,'AI has no human author');
  assert.equal((await request('/api/bootstrap',{cookie:bob.cookie})).json.members.length,2);
  for(let i=0;i<25;i++){if(as.events.some(e=>e.name==='message'&&e.data.message.id===send2.json.message.id)&&bs.events.some(e=>e.name==='message'&&e.data.message.id===send1.json.message.id))break;await delay(35);}
  assert.ok(as.events.some(e=>e.name==='message'&&e.data.message.id===send2.json.message.id),'Alice SSE did not receive Bob message');
  assert.ok(bs.events.some(e=>e.name==='message'&&e.data.message.id===send1.json.message.id),'Bob SSE did not receive Alice message');
  assert.ok(bs.events.some(e=>e.name==='ai_delta'),'Bob SSE did not receive AI stream');
  const tts=await request('/api/tts',{method:'POST',cookie:bob.cookie,body:{messageId:ai.id}});assert.equal(tts.code,501);
  const msgAfter=await request(`/api/messages?after=${send1.json.message.id}&limit=30`,{cookie:bob.cookie});
  assert.ok(msgAfter.json.messages.some(m=>m.id===ai.id));
  const logout=await request('/api/auth/logout',{method:'POST',cookie:bob.cookie});assert.equal(logout.code,200);
  assert.equal((await request('/api/me',{cookie:bob.cookie})).code,401);
});
