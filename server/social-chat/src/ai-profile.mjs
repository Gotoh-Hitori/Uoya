import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function validateProfile(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','avatarUrl'].includes(k)))fail('资料格式无效');
 const name=typeof body.name==='string'?body.name.trim():'',avatarUrl=body.avatarUrl;
 if(!name||name.length>30||/[<>\x00-\x1f]/.test(name))fail('名字需为 1–30 字');
 if(typeof avatarUrl!=='string'||avatarUrl.length>280000)fail('头像过大');
 if(avatarUrl){
  if(avatarUrl.startsWith('data:')){
   const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(avatarUrl);if(!match)fail('头像仅支持 PNG、JPEG、WebP 图片');
   const bytes=Buffer.from(match[2],'base64'),valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)fail('头像图片格式无效');
  }else{let url;try{url=new URL(avatarUrl);}catch{fail('请输入有效头像链接');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||avatarUrl.length>2048)fail('头像链接需为 HTTP 或 HTTPS');}
 }
 return {name,avatarUrl};
}
export function createAiProfile({config,defaults={}}){
 const filename=config.dbFile+'.profile.json',profile={...defaults,name:config.aiName,avatarUrl:''};if(existsSync(filename))Object.assign(profile,JSON.parse(readFileSync(filename,'utf8')));config.aiName=profile.name;
 function save(user,body){if(!user)fail('请先登录',401);if(user.role!=='admin')fail('仅空间管理员可修改 AI 资料',403);const next={...profile,...validateProfile(body)};writeFileSync(filename+'.tmp',JSON.stringify(next),'utf8');renameSync(filename+'.tmp',filename);Object.assign(profile,next);config.aiName=profile.name;return {...profile};}
 return {profile,save};
}
