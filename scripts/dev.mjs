import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
if(existsSync(path.join(root,'.env')))loadEnvFile(path.join(root,'.env'));
if(process.env.LONGMEMORY_ENABLED!=='false'&&!existsSync(path.join(root,'server/social-chat/vendor/longmemory/engine.mjs'))){
 const {buildLongMemory}=await import('./build-longmemory.mjs');await buildLongMemory();
}
const port=Number(process.env.CHAT_API_PORT||3001);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('CHAT_API_PORT must be between 1 and 65535');
const chatRoot=path.join(root,'server/social-chat');
const chatEnv=path.join(chatRoot,'.env');
const child=spawn(process.execPath,[...(existsSync(chatEnv)?['--env-file='+chatEnv]:[]),path.join(chatRoot,'src/index.mjs')],{
 cwd:chatRoot,stdio:'inherit',windowsHide:true,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CLIENT_ORIGIN:process.env.CLIENT_ORIGIN||'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'}
});
let vite,stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;await vite?.close();child.kill('SIGTERM');process.exitCode=code;}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
child.once('error',error=>{console.error('Unable to start chat API:',error.message);void stop(1);});
child.once('exit',code=>{if(!stopping){console.error('Chat API exited:',code);void stop(code||1);}});
try{
 let ready=false;
 for(let i=0;i<80&&!stopping;i++){
  try{const res=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(700)});const body=await res.json();if(body.service==='bluehaven-chat-api'){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,125));
 }
 if(!ready||stopping)throw Error('Chat API did not start');
 if(process.argv.includes('--chat-only'))console.log('Chat API ready on port '+port);
 else {const {createServer}=await import('vite');vite=await createServer({configLoader:'runner'});await vite.listen();vite.printUrls();}
}catch(error){console.error(error.message);await stop(1);}
