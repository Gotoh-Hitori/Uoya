import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createNetServer} from 'node:net';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'vite';
import {createChatProxy,PRIVATE_SERVER_FILES} from '../scripts/chat-proxy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function freePort(){return new Promise((resolve,reject)=>{const s=createNetServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
test('integrated same-origin chat: assets, cookie path, auth, streamed replies, history and logout',{timeout:30000},async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'bluehaven-integrated-chat-')),port=await freePort(),webPort=await freePort();
 const persona=path.join(dir,'persona.md');writeFileSync(persona,'你是蓝色小肥鱼，友善的数字室友。');
 const child=spawn(process.execPath,[path.join(root,'server/social-chat/src/index.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATABASE_FILE:path.join(dir,'chat.sqlite'),PERSONA_FILE:persona,AI_MODE:'mock',AI_TRIGGER_MODE:'auto',AI_NAME:'蓝色小肥鱼',INVITE_CODE:'test-only',CLIENT_ORIGIN:'http://127.0.0.1:'+webPort,COOKIE_SECURE:'false'}});
 let vite,streamController,logs='';child.stderr.on('data',d=>logs+=String(d));
 t.after(async()=>{streamController?.abort();await vite?.close();child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2000)]);if(child.exitCode===null)child.kill();if(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep))rmSync(dir,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<80;i++){try{const res=await fetch('http://127.0.0.1:'+port+'/api/health');if(res.ok){ready=true;break;}}catch{}await delay(60);}assert.ok(ready,logs);
 vite=await createServer({configFile:false,root,cacheDir:path.join(dir,'.vite'),optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:webPort,strictPort:true,fs:{deny:PRIVATE_SERVER_FILES},proxy:{'/social-api':createChatProxy(port)}}});await vite.listen();
 const base='http://127.0.0.1:'+vite.httpServer.address().port;
 for(const url of ['/social-chat/index.html','/social-chat/app.js','/social-chat/config.js'])assert.equal((await fetch(base+url)).status,200,url);
 for(const url of ['/server/social-chat/src/index.mjs','/server/social-chat/vendor/longmemory/engine.mjs','/server/social-chat/data/bluehaven.sqlite','/server/social-chat/data/longmemory.sqlite','/LongMemory-main/LongMemory-main/src/index.ts','/.env.example','/bluehaven-social-ai-chat-v1.0/bluehaven-social-ai-chat/server/src/index.mjs']){
  const response=await fetch(base+url);
  if(existsSync(path.resolve(root,'.'+url)))assert.equal(response.status,403,'private file '+url);
  else {assert.ok([403,404].includes(response.status)||(response.status===200&&response.headers.get('content-type')?.includes('text/html')),'missing file must not return private data '+url);}
 }

 const page=await (await fetch(base+'/')).text();assert.match(page,/id="social-chat-open"/);assert.doesNotMatch(page,/id="command-mode"/);assert.match(page,/id="command-form"/);
 const request=async(url,{method='GET',cookie,body}={})=>{const res=await fetch(base+'/social-api/api'+url,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {res,data:await res.json()};};
 assert.equal((await request('/bootstrap')).res.status,401);
 assert.equal((await request('/life/me')).res.status,401);
 assert.equal((await request('/memory/status')).res.status,401);
 const config=await request('/config');assert.equal(config.data.aiMode,'mock');assert.equal(config.data.aiName,'蓝色小肥鱼');assert.ok(!JSON.stringify(config.data).includes('aiApiKey'));
 const registered=await request('/auth/register',{method:'POST',body:{username:'integrated_user',displayName:'整合测试',password:'Test-password-2026',inviteCode:'test-only'}});assert.equal(registered.res.status,201);
 const setCookie=registered.res.headers.get('set-cookie');assert.match(setCookie,/Path=\/social-api\/api(?:;|$)/);assert.match(setCookie,/HttpOnly/);const cookie=setCookie.split(';')[0];
 const boot=await request('/bootstrap',{cookie});assert.equal(boot.res.status,200);assert.equal(boot.data.me.username,'integrated_user');assert.equal(boot.data.memory.provider,'LongMemory');assert.equal(boot.data.memory.ready,true);
 const bob=await request('/auth/register',{method:'POST',body:{username:'life_bob',displayName:'另一成员',password:'Other-password-2026',inviteCode:'test-only'}});assert.equal(bob.res.status,201);const bobCookie=bob.res.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/life/catalog',{cookie})).data.items.length,19);
 assert.equal((await request('/life/me',{cookie})).data.account.coins,120);
 assert.equal((await request('/life/me',{cookie:bobCookie})).data.account.coins,120);
 const bobAbort=new AbortController();t.after(()=>bobAbort.abort());const bobStream=await fetch(base+'/social-api/api/events',{headers:{Cookie:bobCookie,Origin:base},signal:bobAbort.signal});let bobEvents='';const bobReader=bobStream.body.getReader();void(async()=>{try{while(true){const r=await bobReader.read();if(r.done)break;bobEvents+=new TextDecoder().decode(r.value);}}catch{}})();
 streamController=new AbortController();const stream=await fetch(base+'/social-api/api/events',{headers:{Cookie:cookie,Origin:base},signal:streamController.signal});assert.equal(stream.status,200);
 const purchaseBody={itemId:'water',quantity:1,requestId:'life-http-water-0001',accountId:'ai:starry',price:0};
 const bought=await request('/life/purchase',{method:'POST',cookie,body:purchaseBody});assert.equal(bought.res.status,200);assert.equal(bought.data.result.total,6);
 assert.equal((await request('/life/purchase',{method:'POST',cookie,body:purchaseBody})).data.result.idempotentReplay,true);
 assert.equal((await request('/life/me',{cookie})).data.account.coins,114);assert.equal((await request('/life/me',{cookie:bobCookie})).data.account.coins,120);assert.equal((await request('/life/ai',{cookie})).data.account.coins,160);
 assert.equal((await request('/life/use',{method:'POST',cookie,body:{itemId:'water',requestId:'life-http-use-0001'}})).res.status,200);
 assert.equal((await request('/life/me',{cookie})).data.account.inventory.length,0);
 assert.equal((await request('/memory/status',{cookie})).data.memory.count,0,'private shopping must not become shared memory');
 assert.equal((await request('/demo/ai-buy',{method:'POST',cookie,body:{itemId:'plain-rice'}})).res.status,404);
 await delay(60);assert.ok(!bobEvents.includes('"itemId":"water"'),'private purchase/use events cannot reach another member');bobAbort.abort();
 const sent=await request('/messages',{method:'POST',cookie,body:{content:'你好，今天一起在 Blue Haven 聊天吧！',clientId:'integrated-test-message-123'}});assert.equal(sent.res.status,201);
 const memoryStatus=await request('/memory/status',{cookie});assert.equal(memoryStatus.data.memory.count,1);assert.equal(memoryStatus.data.memory.ready,true);assert.ok(!JSON.stringify(memoryStatus.data).includes('db_path'));
 const reader=stream.body.getReader(),decoder=new TextDecoder();let events='';const timer=setTimeout(()=>streamController.abort(),12000);
 try{while(true){const {done,value}=await reader.read();if(done)break;events+=decoder.decode(value,{stream:true});if(/event: message\ndata: .*"role":"ai"/.test(events))break;}}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
 assert.match(events,/event: life_event/);assert.match(events,/event: ai_delta/);assert.match(events,/"role":"ai"/);
 const history=await request('/messages?limit=10',{cookie});assert.ok(history.data.messages.some(m=>m.role==='ai'&&m.content.includes('演示模式')));
 const logout=await request('/auth/logout',{method:'POST',cookie});assert.equal(logout.res.status,200);assert.match(logout.res.headers.get('set-cookie'),/Path=\/social-api\/api/);assert.equal((await request('/bootstrap',{cookie})).res.status,401);
 const login=await request('/auth/login',{method:'POST',body:{username:'integrated_user',password:'Test-password-2026'}});assert.equal(login.res.status,200);const newCookie=login.res.headers.get('set-cookie').split(';')[0];assert.ok((await request('/messages',{cookie:newCookie})).data.messages.length>=2);
});

