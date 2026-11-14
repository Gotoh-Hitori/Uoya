/** Optional OpenAI-compatible API proxy. Node >=20. No key is sent to the browser. */
import http from 'node:http';
import {AGENT_TOOLS,validateCommand} from '../src/agent/controller.mjs';
const port=Number(process.env.AI_PORT||8787);
const base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
const model=process.env.AI_MODEL||'gpt-4o-mini';
const key=process.env.AI_API_KEY;
const MAX_BODY=16*1024;
const write=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
function validateStep(input){try{validateCommand(input);return true;}catch{return false;}}
async function askAI(message,state){
 if(!key)throw new Error('未配置 AI_API_KEY。请在终端设置环境变量，不要放到前端代码中。');
 const system=`你是9.4 米 × 6.2 米真实户型中的蓝白色 WebGL 房屋游戏角色的路径规划助手。请严格输出 JSON 对象，格式是 {"steps":[{"type":"goto_room","args":{"room":"living"}}]}。最多 6 步，不要输出 Markdown。仅能使用如下工具的名称、参数和枚举：${JSON.stringify(AGENT_TOOLS)}。房间：living=客餐厨，bedroom=卧室，bathroom=卫生间。支持 set_light 开关房间灯、set_brightness 调整亮度、set_time_mode 选择自动本地时钟或预览时间。角色状态：${JSON.stringify(state).slice(0,600)}。如果指令不合理返回 {"steps":[]}。`;
 const signal=AbortSignal.timeout(20000);
 const response=await fetch(`${base}/chat/completions`,{
   method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,
   body:JSON.stringify({model,temperature:.1,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:message}]})
 });
 if(!response.ok)throw new Error(`模型服务返回 HTTP ${response.status}：${(await response.text()).slice(0,180)}`);
 const data=await response.json();
 const content=data?.choices?.[0]?.message?.content;
 if(typeof content!=='string')throw new Error('模型响应缺少 message.content');
 let parsed;try{parsed=JSON.parse(content);}catch{throw new Error('模型未返回有效 JSON');}
 if(!Array.isArray(parsed.steps)||parsed.steps.length>6||!parsed.steps.every(validateStep))throw new Error('模型产生了未通过安全校验的动作序列');
 return parsed.steps;
}
http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/api/health')return write(res,200,{ok:true,configured:!!key,model});
 if(req.method!=='POST'||req.url!=='/api/ai/plan')return write(res,404,{error:'Not found'});
 let body='';try{
   for await(const chunk of req){body+=chunk;if(body.length>MAX_BODY)throw new Error('请求体超过 16KB');}
   const {message,state}=JSON.parse(body);
   if(typeof message!=='string'||!message.trim()||message.length>800)throw new Error('message 必须是 1~800 个字符');
   const steps=await askAI(message,state);
   write(res,200,{steps});
 }catch(err){write(res,err.message.includes('AI_API_KEY')?503:400,{error:err.message});}
}).listen(port,'127.0.0.1',()=>console.log(`AI bridge listening at 127.0.0.1:${port} · key ${key?'present':'NOT configured'}`));
