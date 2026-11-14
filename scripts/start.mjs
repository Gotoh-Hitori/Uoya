import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import {loadEnvFile} from 'node:process';import {fileURLToPath} from 'node:url';import path from 'node:path';import net from 'node:net';import {createGateway} from './network-gateway.mjs';import {readNetwork,validPort} from './network-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);if(existsSync('.env'))loadEnvFile('.env');
const settings=readNetwork(root),tunnel=process.argv.includes('--tunnel'),gatewayOnly=process.argv.includes('--gateway-only'),port=validPort(process.env.WEB_PORT||settings?.webPort||8080),apiPort=validPort(process.env.CHAT_API_PORT||3001),origin=process.env.PUBLIC_ORIGIN||settings?.publicOrigin||'http://127.0.0.1:'+port;
let api,gateway,stopping=false;const children=[];
async function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');gateway?.closeAllConnections();await new Promise(r=>gateway?.listening?gateway.close(r):r());process.exitCode=code;}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
function child(args,options={}){const processChild=spawn(args[0],args.slice(1),{cwd:root,stdio:'inherit',windowsHide:true,...options});children.push(processChild);processChild.once('error',error=>{console.error(error.message);void stop(1);});processChild.once('exit',code=>{if(!stopping){console.error('子服务已退出：'+(code??'signal'));void stop(code||1);}});return processChild;}
async function free(port){const s=net.createServer();try{await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',resolve);});}finally{if(s.listening)await new Promise(r=>s.close(r));}}
try{
 if(!existsSync('dist/index.html'))throw Error('缺少发行文件，请先 npm run build');if(!/^https?:\/\//.test(origin)||new URL(origin).origin!==origin)throw Error('PUBLIC_ORIGIN 必须是完整 HTTP(S) 源，不带路径');
 if(tunnel&&settings&&port!==settings.webPort)throw Error('WEB_PORT 与已保存配置不一致');
 await free(port);
 if(!gatewayOnly){await free(apiPort);const envFile=path.join(root,'server/social-chat/.env');api=child([process.execPath,...(existsSync(envFile)?['--env-file='+envFile]:[]),'server/social-chat/src/index.mjs'],{env:{...process.env,NETWORK_ROOT:process.env.NETWORK_ROOT||root,HOST:'127.0.0.1',PORT:String(apiPort),CLIENT_ORIGIN:[origin,'http://127.0.0.1:'+port,'http://localhost:'+port].join(','),PUBLIC_ORIGIN:origin,COOKIE_SECURE:process.env.COOKIE_SECURE||(origin.startsWith('https://')?'true':'false')}});}
 let ready=false;for(let i=0;i<100&&!stopping;i++){try{const response=await fetch('http://127.0.0.1:'+apiPort+'/api/health',{signal:AbortSignal.timeout(700)});if((await response.json()).service==='bluehaven-chat-api'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready||stopping)throw Error('聊天后端未就绪');
 gateway=createGateway({dist:path.join(root,'dist'),apiPort});await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(port,process.env.WEB_HOST||'127.0.0.1',resolve);});console.log('Uoya 魚家 正式入口：http://127.0.0.1:'+port+'/');
 if(tunnel){console.log('请登录控制台 → 网络设置，点击连接。启动站点不会自动建立公网隧道。');}else console.log('未启动公网隧道。');
}catch(error){console.error(error.message);await stop(1);}
