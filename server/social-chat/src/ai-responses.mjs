import {randomUUID,createHash} from 'node:crypto';
export function nativeResponsesHost(base){try{const host=new URL(base).hostname;return host==='api.openai.com'||host==='codexcn.com'||host.endsWith('.codexcn.com');}catch{return false;}}
export async function generateWithResponses(config,context,onToken,options,events){
 const {life=null,runKey=0,onUsage=()=>{},beforeRequest=null,onRoundEnd=()=>{},signal=null,onSources=()=>{}}=options;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('AI 请求超时')),config.aiTimeoutMs||90000),abort=()=>controller.abort(signal?.reason||Error('回复已停止'));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const instructions=context.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
 const input=context.filter(m=>m.role!=='system').map(m=>({role:m.role,content:Array.isArray(m.content)?m.content.map(p=>p.type==='image_url'?{type:'input_image',image_url:p.image_url.url,detail:p.image_url.detail||'auto'}:{type:'input_text',text:p.text}):m.content}));
 let full='',callsUsed=0;const sources=[];
 try{for(let round=0;round<4;round++){
  const functions=life&&round<3&&callsUsed<6?life.tools||[]:[],tools=[...(config.aiWebSearch?[{type:'web_search'}]:[]),...functions.map(t=>({type:'function',...t.function,strict:false}))];
  const requestId=randomUUID(),budget=beforeRequest?await beforeRequest({requestId,messages:[{role:'system',content:instructions},...input],tools,maxOutputTokens:config.aiMaxOutputTokens}):null;
  let response,usage=null,completed=null,roundText='',items=new Map();const offset=full.length;
  const delta=text=>{if(typeof text!=='string'||!text)return;if(full.length+text.length>8000)throw Error('AI 回复超过长度限制');roundText+=text;full+=text;onToken(text);};
  try{
   response=await fetch(config.aiBaseUrl.replace(/\/$/,'')+'/responses',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.aiApiKey,'Content-Type':'application/json'},body:JSON.stringify({model:config.aiModel,instructions,input,stream:true,store:false,max_output_tokens:budget?.maxOutputTokens??config.aiMaxOutputTokens,...(tools.length?{tools}:{}),include:['reasoning.encrypted_content']}),signal:controller.signal});
   if(!response.ok||!response.body)throw Error('AI provider HTTP '+response.status+'（当前通道需支持 Responses 和所选联网/视觉能力）');
   const accept=object=>{completed=object;const u=object?.usage,total=u?.total_tokens??(Number.isSafeInteger(u?.input_tokens)&&Number.isSafeInteger(u?.output_tokens)?u.input_tokens+u.output_tokens:null);if(Number.isSafeInteger(total)&&total>=0&&total<=1e9)usage={requestId,totalTokens:total,promptTokens:u.input_tokens,completionTokens:u.output_tokens,model:config.aiModel};};
   if(response.headers.get('content-type')?.includes('application/json'))accept(await response.json());
   else for await(const event of events(response.body,controller.signal)){
    if(event.type==='response.output_text.delta')delta(event.delta);
    if(event.type==='response.output_item.done')items.set(event.output_index??items.size,event.item);
    if(event.type==='response.completed'||event.type==='response.incomplete')accept(event.response);
    if(event.type==='error'||event.type==='response.failed'){if(event.response)accept(event.response);throw Error('当前 AI 通道处理联网或视觉请求失败，请检查通道与模型能力');}
   }
   const output=completed?.output||[...items.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v),whole=output.filter(o=>o.type==='message').flatMap(o=>o.content||[]).filter(p=>p.type==='output_text').map(p=>p.text||'').join('');if(whole.startsWith(roundText))delta(whole.slice(roundText.length));
   for(const message of output.filter(o=>o.type==='message'))for(const part of message.content||[]){const start=roundText.indexOf(part.text);for(const a of part.annotations||[]){if(a.type!=='url_citation'||sources.length>=20)continue;try{const url=new URL(a.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;sources.push({url:url.href,title:String(a.title||url.hostname).slice(0,180),...(start>=0&&Number.isInteger(a.start_index)&&Number.isInteger(a.end_index)?{startIndex:offset+start+a.start_index,endIndex:offset+start+a.end_index}:{})});}catch{}}}
   const calls=output.filter(o=>o.type==='function_call');if(!calls.length){if(!full.trim())throw Error('AI 返回空内容，当前模型可能不支持附件或输出额度不足');const leading=full.length-full.trimStart().length;onSources(sources.map(s=>({...s,...(Number.isInteger(s.startIndex)?{startIndex:s.startIndex-leading,endIndex:s.endIndex-leading}:{})})));return full.trim();}
   if(callsUsed+calls.length>6||calls.some(c=>!c.call_id||!c.name)||!functions.length)throw Error('AI 工具调用不合法');input.push(...output);
   for(const call of calls){callsUsed++;let result;try{const args=JSON.parse(call.arguments||'{}'),id='ai-tool:'+runKey+':'+createHash('sha256').update(call.call_id).digest('hex').slice(0,24);result={ok:true,result:await life.executeTool(call.name,args,{requestId:id})};}catch(error){result={ok:false,error:String(error.message).slice(0,200),code:error.code||'TOOL_ERROR'};}input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});}
  }finally{try{if(usage)await onUsage(usage);}finally{await onRoundEnd({requestId,noCharge:!!response&&response.status>=400&&response.status<500});}}
 }throw Error('AI 工具轮次已达上限');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
