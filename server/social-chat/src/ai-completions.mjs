import {generateWithResponses,nativeResponsesHost} from './ai-responses.mjs';
import {randomUUID,createHash} from 'node:crypto';

export async function* completionEvents(stream,signal){
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){if(signal.aborted)throw signal.reason||Error('aborted');const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});if(done&&buffer&&!buffer.endsWith('\n'))buffer+='\n';let end;
  while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);if(!line.startsWith('data:'))continue;const text=line.slice(5).trim();if(text==='[DONE]')return;if(!text)continue;let data;try{data=JSON.parse(text);}catch{continue;}if(data.error)throw Error(data.error.message||'AI provider error');yield data;}
  if(done)break;
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function generateWithLifeTools(config,context,onToken,{life=null,runKey=0,onUsage=()=>{},beforeRequest=null,onRoundEnd=()=>{},signal=null,onSources=()=>{}}={}){
 if(!config.aiApiKey)throw Error('AI_MODE=api 但尚未配置 AI_API_KEY');
 if(config.aiApiFormat==='responses'||config.aiWebSearch||nativeResponsesHost(config.aiBaseUrl))return generateWithResponses(config,context,onToken,{life,runKey,onUsage,beforeRequest,onRoundEnd,signal,onSources},completionEvents);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('AI 请求超时')),config.aiTimeoutMs);
 const abortFromParent=()=>controller.abort(signal?.reason||Error('回复已停止'));if(signal?.aborted)abortFromParent();else signal?.addEventListener('abort',abortFromParent,{once:true});
 const messages=context.map(m=>({...m}));let fullOutput='',toolCount=0;
 try{
  for(let round=0;round<4;round++){
   const allowTools=!!life&&life.tools?.length>0&&round<3&&toolCount<6;
   const requestId=randomUUID(),budget=beforeRequest?await beforeRequest({requestId,messages,tools:allowTools?life.tools:[],maxOutputTokens:config.aiMaxOutputTokens}):null;let response;
   try{response=await fetch(config.aiBaseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.aiApiKey,'Content-Type':'application/json'},body:JSON.stringify({model:config.aiModel,messages,stream:true,stream_options:{include_usage:true},max_tokens:budget?.maxOutputTokens??config.aiMaxOutputTokens,temperature:.75,...(allowTools?{tools:life.tools,tool_choice:'auto'}:{})}),signal:controller.signal});}catch(error){await onRoundEnd({requestId,noCharge:false});throw error;}
   if(!response.ok||!response.body){await onRoundEnd({requestId,noCharge:response.status>=400&&response.status<500});throw Error('AI provider HTTP '+response.status);}
   const calls=new Map();let roundContent='',usage=null;
   try{for await(const event of completionEvents(response.body,controller.signal)){
    if(event.usage){const u=event.usage;const total=u.total_tokens??(Number.isSafeInteger(u.prompt_tokens)&&u.prompt_tokens>=0&&Number.isSafeInteger(u.completion_tokens)&&u.completion_tokens>=0?u.prompt_tokens+u.completion_tokens:null);if(Number.isSafeInteger(total)&&total>=0&&total<=1e9)usage={requestId,totalTokens:total,promptTokens:u.prompt_tokens,completionTokens:u.completion_tokens,model:config.aiModel};}
    const delta=event.choices?.[0]?.delta;if(!delta)continue;
    if(typeof delta.content==='string'&&delta.content){if(fullOutput.length+delta.content.length>8000)throw Error('AI 回复超过长度限制');roundContent+=delta.content;fullOutput+=delta.content;onToken(delta.content);}
    for(const part of delta.tool_calls||[]){
     if(!allowTools)throw Error('AI 工具调用超过轮次限制');
     if(!Number.isInteger(part.index)||part.index<0||part.index>=6)throw Error('无效工具调用索引');
     const call=calls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}};
     if(part.id)call.id+=part.id;
     if(part.function?.name)call.function.name+=part.function.name;
     if(part.function?.arguments)call.function.arguments+=part.function.arguments;
     if(call.id.length>128||call.function.name.length>80||call.function.arguments.length>8192)throw Error('工具调用参数过长');
     calls.set(part.index,call);
    }
   }
   }finally{try{if(usage)await onUsage(usage);}finally{await onRoundEnd({requestId,noCharge:false});}}
   if(!calls.size){if(!fullOutput.trim())throw Error('AI 返回了空消息');return fullOutput.trim();}
   const ordered=[...calls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call);
   if(toolCount+ordered.length>6)throw Error('本轮最多允许 6 次生活工具调用');
   if(ordered.some(call=>!call.id||!call.function.name))throw Error('不完整的工具调用');
   messages.push({role:'assistant',content:roundContent||null,tool_calls:ordered});
   for(const call of ordered){
    toolCount++;let result;
    try{const args=JSON.parse(call.function.arguments||'{}');const requestId='ai-tool:'+runKey+':'+createHash('sha256').update(call.id).digest('hex').slice(0,24);result={ok:true,result:await life.executeTool(call.function.name,args,{requestId})};}
    catch(error){result={ok:false,error:String(error.message).slice(0,200),code:error.code||'TOOL_ERROR'};}
    messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
   }
  }
  throw Error('AI 操作轮次已达上限');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abortFromParent);}
}
