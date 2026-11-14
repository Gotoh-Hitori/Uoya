/** Thin frontend API client. No API key exists in browser code. */
export async function planWithAI(text,state,{endpoint='/api/ai/plan',signal}={}){
 const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({message:text,state}),signal});
 let payload;
 try{payload=await res.json();}catch{throw new Error('AI 网关没有返回 JSON，确认 `npm run ai-server` 已启动');}
 if(!res.ok)throw new Error(payload.error||`AI 网关响应 ${res.status}`);
 if(!Array.isArray(payload.steps))throw new Error('AI 结果没有 steps 数组');
 return payload.steps;
}
