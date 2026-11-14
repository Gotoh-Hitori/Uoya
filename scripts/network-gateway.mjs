import http from 'node:http';
import {createReadStream,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff2':'font/woff2','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.vrm':'application/octet-stream','.bin':'application/octet-stream','.mp4':'video/mp4','.webm':'video/webm','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav'};
const privateSegment=/^(?:\..*|server|scripts|node_modules|deployment|secrets|backups|\.network)$/i;
const privateFile=/\.(?:sqlite(?:-.*)?|db(?:-.*)?|pem|key|crt|toml|ya?ml|zip|ps1|bat|sh)$/i;
const hop=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
function headers(source){const copy={...source};for(const name of [...hop,...String(source.connection||'').split(',').map(s=>s.trim().toLowerCase())])delete copy[name];return copy;}
export function createGateway({dist,apiPort=3001}){
 const root=realpathSync(dist),active=new Set();
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Uoya-Gateway','production');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname.startsWith('/social-api/api/')){
   const h=headers(req.headers);delete h['x-forwarded-host'];delete h['x-forwarded-proto'];delete h['x-forwarded-for'];
   const upstream=http.request({host:'127.0.0.1',port:apiPort,path:req.url.slice('/social-api'.length),method:req.method,headers:h},response=>{
    const out=headers(response.headers);if(out['set-cookie'])out['set-cookie']=out['set-cookie'].map(value=>value.replace(/(Path=)\/api(?=;|$)/i,'$1/social-api/api'));
    if(out['content-type']?.includes('text/event-stream')){out['cache-control']='no-cache, no-transform';out['x-accel-buffering']='no';}
    res.writeHead(response.statusCode,out);res.flushHeaders();response.on('error',()=>res.destroy());response.pipe(res);
   });active.add(upstream);upstream.on('close',()=>active.delete(upstream));
   upstream.setTimeout(0);upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂时不可用'}));}else res.destroy();});
   req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  const segments=pathname.split('/').filter(Boolean);
  if(pathname.includes('\\')||pathname.includes(':')||pathname.includes('\0')||segments.some(p=>privateSegment.test(p)||p==='..')||privateFile.test(pathname)){res.writeHead(404);res.end();return;}
  let filename=path.resolve(root,'.'+pathname);if(pathname.endsWith('/'))filename=path.join(filename,'index.html');
  try{filename=realpathSync(filename);const relative=path.relative(root,filename);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('outside');const info=statSync(filename);if(!info.isFile())throw Error('file');
   let start=0,end=info.size-1,status=200;const range=req.headers.range;
   if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])throw Object.assign(Error('range'),{range:true});if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else start=Math.max(0,info.size-Number(match[2]));if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}status=206;}
   res.writeHead(status,{'Content-Type':types[path.extname(filename).toLowerCase()]||'application/octet-stream','Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes','Cache-Control':/\.(?:html|js|json|css)$/.test(filename)?'no-cache':'public, max-age=3600',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
   if(req.method==='HEAD'||!info.size){res.end();return;}const stream=createReadStream(filename,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){res.writeHead(error.range?416:404);res.end();}
 });
 server.requestTimeout=180000;server.headersTimeout=30000;server.on('close',()=>{for(const request of active)request.destroy();});return server;
}
