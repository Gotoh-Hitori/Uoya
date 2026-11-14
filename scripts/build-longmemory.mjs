import {build} from 'esbuild';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function buildLongMemory(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const source=path.resolve(root,process.env.LONGMEMORY_SOURCE||'LongMemory-main/LongMemory-main');
 const output=path.join(root,'server/social-chat/vendor/longmemory');mkdirSync(output,{recursive:true});
 const pkg=JSON.parse(readFileSync(path.join(source,'package.json'),'utf8'));
 const entry=path.join(source,'src/core/create_memory.ts'),tokens=path.join(source,'src/core/recall/context_builder.ts');
 const result=await build({absWorkingDir:root,stdin:{contents:'export {createMemory} from '+JSON.stringify(entry)+';\nexport {count_tokens} from '+JSON.stringify(tokens)+';',resolveDir:source,sourcefile:'bluehaven-longmemory-entry.ts',loader:'ts'},outfile:path.join(output,'engine.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',metafile:true,banner:{js:'/*! LongMemory Hydrograph | CaviraOSS / nullure (c) 2026 | Apache-2.0. Built from the locally supplied source; see LICENSE and NOTICE. */'}});
 copyFileSync(path.join(source,'src/stores/sqlite/schema.sql'),path.join(output,'schema.sql'));
 copyFileSync(path.join(source,'LICENSE'),path.join(output,'LICENSE'));
 writeFileSync(path.join(output,'NOTICE'),'LongMemory Hydrograph\nCopyright (c) 2026 CaviraOSS / cavira oss and nullure.\nhttps://github.com/CaviraOSS/LongMemory\nBuilt from the local LongMemory source without changing the engine source.\nLicensed under Apache License 2.0; see LICENSE.\n');
 const hash=createHash('sha256');for(const file of Object.keys(result.metafile.inputs).sort())if(!file.endsWith('bluehaven-longmemory-entry.ts')){hash.update(file);hash.update(readFileSync(path.resolve(root,file)));}hash.update(readFileSync(path.join(output,'schema.sql')));
 writeFileSync(path.join(output,'source.json'),JSON.stringify({name:pkg.name,version:pkg.version,source:path.relative(root,source).replaceAll('\\','/'),entry:'src/core/create_memory.ts',sha256:hash.digest('hex'),license:pkg.license},null,2)+'\n');
 console.log('Built local LongMemory '+pkg.version+' engine at '+path.relative(root,output));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildLongMemory();
