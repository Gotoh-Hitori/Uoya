import {LifeError} from './engine.mjs';

const json=(res,status,data)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
};
async function parseBody(req){
  let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>8192)throw new LifeError('BODY_TOO_LARGE','请求体过大',413);}
  try{return JSON.parse(data||'{}');}catch{throw new LifeError('INVALID_JSON','JSON 格式错误',400);}
}
export function createLifeRoutes({engine,resolveUser,allowedOrigins=[]}={}) {
  if(!engine||typeof resolveUser!=='function')throw new Error('createLifeRoutes requires engine and resolveUser');
  return async function handleLife(req,res){
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/api/life/'))return false;
    try{
      const origin=req.headers.origin;
      if(origin && !allowedOrigins.includes(origin) && origin!==`http://${req.headers.host}` && origin!==`https://${req.headers.host}`) {
        throw new LifeError('ORIGIN_DENIED','请求来源不允许',403);
      }
      const user=await resolveUser(req);
      if(!user?.id)throw new LifeError('UNAUTHENTICATED','请先登录',401);
      const accountId=`user:${user.id}`;
      if(req.method==='POST'&&path==='/api/life/catalog'){
        if(user.role!=='admin')throw new LifeError('ADMIN_REQUIRED','仅管理员可创建商品',403);
        return json(res,201,{item:engine.createItem(await parseBody(req),user.id)})||true;
      }
      if(req.method==='GET'&&path==='/api/life/catalog')return json(res,200,{items:engine.catalog()})||true;
      if(req.method==='GET'&&path==='/api/life/me')return json(res,200,{account:engine.getAccount(accountId)})||true;
      if(req.method==='GET'&&path==='/api/life/ai')return json(res,200,{account:engine.getAccount('ai:starry'),policy:engine.getAiPolicy()})||true;
      if(req.method==='GET'&&path==='/api/life/activity')return json(res,200,engine.getActivity(accountId))||true;
      if(req.method==='GET'&&path==='/api/life/ai/activity')return json(res,200,engine.getActivity('ai:starry'))||true;
      if(req.method==='POST'&&path==='/api/life/tip'){
        const b=await parseBody(req);if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['amount','requestId'].includes(k)))throw new LifeError('INVALID_TRANSFER','转账参数无效');
        return json(res,200,{result:engine.transferCoins({fromAccountId:accountId,amount:b.amount,requestId:b.requestId})})||true;
      }
      if(req.method==='POST'&&path==='/api/life/purchase'){
        const b=await parseBody(req);
        // No accountId accepted from the browser. Always derived from session.
        return json(res,200,{result:engine.purchase({accountId,actorType:'human',itemId:b.itemId,quantity:b.quantity??1,requestId:b.requestId})})||true;
      }
      if(req.method==='POST'&&path==='/api/life/use'){
        const b=await parseBody(req);
        return json(res,200,{result:engine.use({accountId,actorType:'human',itemId:b.itemId,requestId:b.requestId})})||true;
      }
      json(res,404,{error:'路由不存在',code:'NOT_FOUND'});
    } catch(err) {
      if(err instanceof LifeError)json(res,err.status,{error:err.message,code:err.code});
      else {console.error('life api error',err);json(res,500,{error:'服务器内部错误',code:'SERVER_ERROR'});}
    }
    return true;
  };
}
