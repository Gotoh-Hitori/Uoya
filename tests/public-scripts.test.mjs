import test from 'node:test';import {execFileSync} from 'node:child_process';import {readdirSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('public app scripts copied without Vite transformation are valid JavaScript',()=>{
 for(const dir of ['public/social-chat','public/life','public/ui'])for(const name of readdirSync(path.join(root,dir))){if(name.endsWith('.js')||name.endsWith('.mjs'))execFileSync(process.execPath,['--check',path.join(root,dir,name)],{windowsHide:true,stdio:'pipe'});}
});
