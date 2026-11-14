import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';import {tmpdir} from 'node:os';
import net from 'node:net';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const reserve=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
test('npm start defaults to production and never opens registration without initialized owner',{timeout:15000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'uoya-start-security-'));const port=await reserve(),apiPort=await reserve();
 const env={...process.env,DATABASE_FILE:path.join(dir,'chat.sqlite'),LONGMEMORY_ENABLED:'false',AI_MODE:'disabled',WEB_PORT:String(port),CHAT_API_PORT:String(apiPort)};
 delete env.NODE_ENV;delete env.BOOTSTRAP_ADMIN_USERNAME;delete env.BOOTSTRAP_ADMIN_PASSWORD;
 const child=spawn(process.execPath,['scripts/start.mjs'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 try{const exit=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});assert.equal(exit,1);assert.match(log,/BOOTSTRAP_ADMIN/);await assert.rejects(fetch('http://127.0.0.1:'+port+'/social-api/api/auth/register',{signal:AbortSignal.timeout(1000)}));}
 finally{child.kill();rmSync(dir,{recursive:true,force:true});}
});
