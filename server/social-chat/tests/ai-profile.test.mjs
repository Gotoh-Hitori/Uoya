import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createAiProfile} from '../src/ai-profile.mjs';
test('shared AI identity requires admin, validates image/name and survives restart',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'uoya-profile-')),config={dbFile:path.join(dir,'test.sqlite'),aiName:'蓝色小肥鱼'};
 try{const identity=createAiProfile({config}),admin={role:'admin'};
 assert.throws(()=>identity.save(null,{}),e=>e.status===401);
 assert.throws(()=>identity.save({role:'member'},{name:'改名',avatarUrl:''}),e=>e.status===403);
 for(const body of [{name:3,avatarUrl:''},{name:'',avatarUrl:''},{name:'<script>',avatarUrl:''},{name:'鱼',avatarUrl:'javascript:alert(1)'},{name:'鱼',avatarUrl:'data:image/svg+xml;base64,PHN2Zz4='},{name:'鱼',avatarUrl:'data:image/png;base64,YWJjZA=='},{name:'鱼',avatarUrl:'https://user:password@example.com/a.png'},{name:'鱼',avatarUrl:'',role:'admin'}])assert.throws(()=>identity.save(admin,body),e=>e.status===400);
 const avatarUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
 identity.save(admin,{name:' 魚魚 ',avatarUrl});assert.equal(identity.profile.name,'魚魚');assert.equal(config.aiName,'魚魚');
 const restarted=createAiProfile({config:{...config,aiName:'旧名'}});assert.equal(restarted.profile.name,'魚魚');assert.equal(restarted.profile.avatarUrl,avatarUrl);
 identity.save(admin,{name:'新名字',avatarUrl:''});assert.equal(identity.profile.avatarUrl,'');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
