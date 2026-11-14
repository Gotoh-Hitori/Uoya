import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const image=process.argv[2]||'uoya-release-v1-app';
const id='uoya-release-'+randomBytes(5).toString('hex'),app=id+'-app',volume=id+'-data';
const directory=mkdtempSync(path.join(tmpdir(),'uoya-container-')),password=randomBytes(24).toString('hex');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
// Node's fetch timeout uses unreferenced timers; keep the test alive through startup races.
const keepAlive=setInterval(()=>{},1000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(base){for(let i=0;i<100;i++){try{if((await fetch(base+'/social-api/api/health',{signal:AbortSignal.timeout(800)})).ok)return;}catch{}await sleep(200);}throw Error('Container gateway not ready');}
try{
 // Fail closed before exposing registration when an empty production DB has no owner.
 let denied=false;try{docker('run','--rm','-e','LONGMEMORY_ENABLED=false',image);}catch(e){denied=String(e.stderr).includes('BOOTSTRAP_ADMIN');}assert.ok(denied,'empty production startup must fail closed');
 docker('network','create',id);docker('volume','create',volume);
 const launch=(bootstrap=true)=>docker('run','-d','--init','--name',app,'--network',id,'-p','127.0.0.1::8080','-v',volume+':/app/server/social-chat/data','-e','AI_MODE=disabled',...(bootstrap?['-e','BOOTSTRAP_ADMIN_USERNAME=release_owner','-e','BOOTSTRAP_ADMIN_PASSWORD='+password]:[]),image);
 const base=()=> 'http://'+docker('port',app,'8080/tcp').split('\n')[0];
 launch();let url=base();await ready(url);
 const api=async(route,cookie,body)=>{const r=await fetch(url+'/social-api'+route,{method:body?('POST'):'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:url}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {r,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 let login=await api('/api/auth/login',null,{username:'release_owner',password});assert.equal(login.r.status,200);assert.equal(login.data.user.role,'admin');let cookie=login.cookie;
 const member=await api('/api/auth/register',null,{username:'release_member',displayName:'Member',password:'test-member-password'});assert.equal(member.r.status,201);assert.equal(member.data.user.role,'member');
 const initial=await api('/api/bootstrap',cookie);assert.equal(initial.r.status,200);assert.deepEqual(initial.data.messages,[]);assert.equal(initial.data.profile.name,'AI');assert.equal(initial.data.profile.avatarUrl,'');assert.equal(initial.data.profile.avatar,'');assert.equal(initial.data.profile.description,'');assert.deepEqual(initial.data.profile.tags,[]);assert.equal(initial.data.memory.count,0);
 const persona=await api('/api/admin/persona',cookie);assert.equal(persona.data.persona,'');
 const settings=await api('/api/ai-settings',cookie);assert.equal(settings.data.configured,false);assert.equal(settings.data.hasKey,false);assert.equal(settings.data.baseUrl,'');assert.equal(settings.data.model,'');
 const before=await api('/api/admin/console/status',cookie);assert.equal(before.data.wallet,0);assert.equal(before.r.status,200);assert.ok(before.data.memory.ready);
 const cfg=await(await fetch(url+'/assets/config.json')).json();assert.equal(cfg.mode,'local');
 const provenance=await(await fetch(url+'/assets/provenance.json')).json();assert.equal(provenance.files.length,25);
 for(const f of provenance.files){const r=await fetch(url+'/assets/'+f.key+'.glb');assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,f.size);}
 for(const deniedPath of ['/.env','/server/social-chat/data/bluehaven.sqlite','/.network/token'])assert.equal((await fetch(url+deniedPath)).status,404);
 // An independent container must not reach the loopback-only API port.
 docker('run','--rm','--network',id,'node:22-bookworm-slim','node','--input-type=module','-e',`try{await fetch('http://${app}:3001/api/health',{signal:AbortSignal.timeout(1500)});process.exit(1);}catch{process.exit(0);}`);
 const reset=await api('/api/admin/console/command',cookie,{command:'memory reset',requestId:randomBytes(16).toString('hex')});assert.equal(reset.r.status,200);assert.equal(reset.data.output.count,0);
 console.log('PASS: empty AI profile/persona/API config, zero messages/memories/wallet, default settings');
 console.log('PASS: internal API port inaccessible from peer container');
 console.log('PASS: production bootstrap, auth/roles, native SQLite, 25 local models, private paths, gateway');
 docker('stop','-t','15',app);docker('rm',app);launch(false);url=base();await ready(url);
 login=await api('/api/auth/login',null,{username:'release_owner',password});assert.equal(login.r.status,200);
 const after=await api('/api/admin/console/status',login.cookie);assert.equal(after.r.status,200);assert.equal(after.data.memory.count,0);assert.equal(after.data.wallet,before.data.wallet);
 console.log('PASS: container recreation without bootstrap credentials preserves owner, wallet and memory reset');
}catch(error){console.error(error.message);try{console.error(docker('logs','--tail','35',app));}catch{}process.exitCode=1;}
finally{
 clearInterval(keepAlive);
 for(const name of [app])try{docker('rm','-f','-v',name);}catch{}
 for(const name of [volume])try{docker('volume','rm',name);}catch{}
 try{docker('network','rm',id);}catch{}
 rmSync(directory,{recursive:true,force:true});
}
