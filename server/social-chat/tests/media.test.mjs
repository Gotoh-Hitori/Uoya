import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import http from 'node:http';
import {createDB} from '../src/db.mjs';
import {createChatUploads} from '../src/uploads.mjs';
import {generateWithLifeTools} from '../src/ai-completions.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
function raw(bytes,mime){const req=Readable.from([bytes]);req.headers={'content-type':mime,'content-length':String(bytes.length)};req.url='/api/uploads?name=test';return req;}
test('media ownership, type checks, video readiness, persistent message links and ranged playback',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'uoya-media-')),config={dbFile:path.join(dir,'test.sqlite')},db=createDB(config.dbFile),media=createChatUploads({config});let server;
 try{
  const a=db.register({username:'owner',displayName:'Owner',password:'password-123'}),b=db.register({username:'other',displayName:'Other',password:'password-123'});
  await assert.rejects(media.upload(raw(Buffer.from('<svg/>'),'image/png'),a));assert.equal(readdirSync(path.join(dir,'uploads')).length,0);
  const image=await media.upload(raw(png,'image/png'),a);assert.deepEqual(media.validateAttachments(a.id,[image.id]),[image.id]);assert.throws(()=>media.validateAttachments(b.id,[image.id]));assert.throws(()=>media.validateAttachments(a.id,[image.id,image.id]));
  assert.equal(media.contentParts([image])[0].image_url.url,'data:image/png;base64,'+png.toString('base64'));
  const resStub={};assert.throws(()=>media.serve({headers:{}},resStub,image.id,b),e=>e.status===404);
  const human=db.addHumanMessage(a.id,'','image-client-id',[image.id]).message;assert.equal(human.attachments[0].id,image.id);assert.equal(db.addHumanMessage(a.id,'','image-client-id',[image.id]).message.id,human.id);
  const ai=db.addAiMessage('source',{replyToMessageId:human.id,sources:[{url:'https://example.com',title:'Example'}]});assert.equal(ai.sources[0].title,'Example');
  const video=await media.upload(raw(Buffer.from([26,69,223,163,1,2,3,4]),'video/webm'),a);assert.throws(()=>media.validateAttachments(a.id,[video.id]));
  const frame='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,1,2,3]).toString('base64');assert.throws(()=>media.setFrames(video.id,b,{duration:2,frames:[{time:0,data:frame}]}));assert.throws(()=>media.setFrames(video.id,a,{duration:301,frames:[{time:0,data:frame}]}));
  media.setFrames(video.id,a,{duration:2,frames:[{time:0,data:frame},{time:1.9,data:frame}]});assert.equal(media.contentParts([video]).filter(p=>p.type==='image_url').length,2);media.validateAttachments(a.id,[video.id]);
  server=http.createServer((req,res)=>{try{media.serve(req,res,image.id,b);}catch(e){res.writeHead(e.status||500);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const response=await fetch('http://127.0.0.1:'+server.address().port,{headers:{Range:'bytes=0-7'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,8);assert.equal(response.headers.get('content-type'),'image/png');
 }finally{if(server)await new Promise(r=>server.close(r));media.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
test('native Responses preserves vision, search citations, tool continuation, real usage and round reservations',async()=>{
 let round=0;const requests=[],usages=[],settled=[],executed=[];const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({url:req.url,body:JSON.parse(body)});round++;res.writeHead(200,{'Content-Type':'text/event-stream'});const output=round===1?[{type:'function_call',call_id:'call-food',name:'eat',arguments:'{"itemId":"sandwich"}'}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'  Red. Source.',annotations:[{type:'url_citation',url:'https://example.com/source',title:'Source',start_index:7,end_index:14}]}]}];if(round===2)res.write('data: '+JSON.stringify({type:'response.output_text.delta',delta:'  Red. Source.'})+'\n\n');res.end('data: '+JSON.stringify({type:'response.completed',response:{output,usage:{input_tokens:100,output_tokens:20,total_tokens:120}}})+'\n\n');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let sources;
 try{const result=await generateWithLifeTools({aiApiFormat:'responses',aiWebSearch:true,aiBaseUrl:'http://127.0.0.1:'+server.address().port+'/v1',aiApiKey:'test',aiModel:'current-model',aiMaxOutputTokens:500,aiTimeoutMs:5000},[{role:'system',content:'Persona'},{role:'user',content:[{type:'text',text:'Describe and search'},{type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64')}}]}],()=>{},{life:{tools:[{type:'function',function:{name:'eat',description:'Eat',parameters:{type:'object',properties:{itemId:{type:'string'}}}}}],executeTool:async(name,args)=>{executed.push({name,args});return {ate:true};}},beforeRequest:args=>{assert.ok(args.tools.some(t=>t.type==='web_search'));return {maxOutputTokens:300};},onUsage:u=>usages.push(u),onRoundEnd:r=>settled.push(r),onSources:s=>sources=s});
 assert.equal(result,'Red. Source.');assert.equal(requests.length,2);assert.equal(requests[0].url,'/v1/responses');assert.equal(requests[0].body.model,'current-model');assert.equal(requests[0].body.input[0].content[1].type,'input_image');assert.equal(requests[0].body.max_output_tokens,300);assert.ok(requests[1].body.input.some(i=>i.type==='function_call_output'&&i.call_id==='call-food'));assert.equal(executed[0].name,'eat');assert.equal(usages.reduce((n,u)=>n+u.totalTokens,0),240);assert.equal(settled.length,2);assert.equal(sources[0].startIndex,5);assert.equal(sources[0].url,'https://example.com/source');
 }finally{await new Promise(r=>server.close(r));}
});
