import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REQUIRED_MODELS} from '../src/world/asset-catalog.mjs';
const base=new URL('../public/assets/',import.meta.url);
const config=JSON.parse(readFileSync(new URL('config.json',base),'utf8'));
if(config.mode!=='local')throw Error('Release requires local assets: run npm run assets');
const manifest=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
for(const key of REQUIRED_MODELS){
 const file=new URL(key+'.glb',base),data=readFileSync(file),entry=manifest.files.find(f=>f.key===key);
 if(data.length<20||data.toString('utf8',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length||!entry||entry.size!==data.length||entry.sha256!==createHash('sha256').update(data).digest('hex'))throw Error('Invalid release asset: '+fileURLToPath(file));
}
console.log('Verified '+REQUIRED_MODELS.length+' local GLB files and SHA-256 provenance');
