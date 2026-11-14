import {readdirSync,lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));let count=0;
const forbidden=new Set(['node_modules','.git','.network','.longmemory','data','uploads','backups','secrets','history']);
function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
 const p=path.join(dir,e.name);assert.ok(!lstatSync(p).isSymbolicLink(),p);
 assert.ok(!forbidden.has(e.name),'Forbidden directory: '+p);
 assert.ok(!/\.(sqlite(?:-.*)?|db(?:-.*)?|zip|log|pem|key)$/i.test(e.name),'Forbidden data file: '+p);
 assert.ok(!/^\.env(?:\.|$)/.test(e.name)||e.name.endsWith('.example'),'Runtime env: '+p);
 if(e.isDirectory())visit(p);else count++;
}}
visit(root);const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));assert.equal(pkg.version,'1.0.0');
const profile=JSON.parse(readFileSync(path.join(root,'server/social-chat/prompts/public-profile.json'),'utf8'));assert.equal(profile.avatarUrl,'');assert.equal(profile.description,'');assert.equal(profile.avatar,'');assert.deepEqual(profile.tags,[]);assert.equal(readFileSync(path.join(root,'server/social-chat/prompts/persona.md'),'utf8'),'');
console.log('PASS: '+count+' release files; no historical data, runtime credentials, dependencies or archives; AI profile/persona blank');
