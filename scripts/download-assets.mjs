/** One-command vendoring: downloads actual Kenney GLBs, verifies magic/length, and records SHA-256. */
import {mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {REQUIRED_MODELS,ASSET_RAW,ASSET_CDN} from '../src/world/asset-catalog.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/assets');
const dest=key=>path.join(base,`${key}.glb`);
const isGlb=b=>b.length>20&&b.toString('utf8',0,4)==='glTF'&&b.readUInt32LE(4)===2&&b.readUInt32LE(8)===b.length;
async function grab(key){
 const output=dest(key);await mkdir(path.dirname(output),{recursive:true});
 let data;
 try{data=await readFile(output);if(isGlb(data))return {key,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),cached:true};}catch{}
 for(const url of [`${ASSET_RAW}/${key}.glb`,`${ASSET_CDN}/${key}.glb`]){
   for(let attempt=0;attempt<2;attempt++){
     try{
       const r=await fetch(url,{signal:AbortSignal.timeout(35000)});
       if(!r.ok)throw new Error(`HTTP ${r.status}`);
       data=Buffer.from(await r.arrayBuffer());
       if(!isGlb(data))throw new Error('invalid GLB header, version or byte length');
       await writeFile(output+'.partial',data);await rename(output+'.partial',output);
       return {key,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),source:url};
     }catch(error){console.error(`[${key}] ${url} #${attempt+1}: ${error.message}`);await rm(output+'.partial',{force:true});}
   }
 }
 throw new Error(`all sources exhausted: ${key}`);
}
async function main(){
 const result=[],errors=[];
 const queue=[...REQUIRED_MODELS];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const key=queue.shift();try{const data=await grab(key);result.push(data);console.log(`✓ ${key} ${Math.round(data.size/1024)} KiB`);}catch(e){errors.push(e.message);console.error('✗',e.message);}}}));
 if(errors.length){console.error(`FAILED ${errors.length}/${REQUIRED_MODELS.length}. Keeping remote mode; retry npm run assets.`);process.exitCode=1;return;}
 const manifest={catalog:'https://github.com/Hidencod/tge-assets',license:'CC0-1.0',originalAuthor:'Kenney',
   downloadedAt:new Date().toISOString(),files:result.sort((a,b)=>a.key.localeCompare(b.key))};
 await writeFile(path.join(base,'provenance.json'),JSON.stringify(manifest,null,2));
 // Switch to local only after ALL required models have been validated and saved.
 await writeFile(path.join(base,'config.json'),JSON.stringify({mode:'local',complete:true,count:result.length},null,2));
 console.log(`DONE: ${result.length} genuine GLB models vendored into public/assets. npm run dev works with local files.`);
}
main().catch(err=>{console.error(err);process.exitCode=1;});
