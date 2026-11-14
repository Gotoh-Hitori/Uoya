import {DatabaseSync} from 'node:sqlite';
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
export function createAdminConsole({config,life,avatar,memory,getWorker,cancelAi=()=>{},getConnections=()=>0,notify=()=>{},journal=null}){
 const sql=new DatabaseSync(config.lifeDbFile||config.dbFile);sql.exec('PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS admin_command_audit(request_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,command TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL)');
 const usersDb=new DatabaseSync(config.dbFile);const users=()=>usersDb.prepare("SELECT id,username,display_name AS displayName,role FROM users WHERE membership='approved' ORDER BY created_at,id").all();
 const logs=[];const log=(type,message)=>{if(journal){journal.log(type,message);return;}logs.push({at:Date.now(),type,message});if(logs.length>120)logs.shift();};log('system','服务已启动');
 const authorize=user=>{if(!user)fail('请先登录',401);if(user.role!=='admin')fail('仅空间管理员可用',403);};
 function status(user){authorize(user);const a=avatar.getState();return {at:Date.now(),uptime:Math.floor(process.uptime()),memoryMB:Math.round(process.memoryUsage().rss/1048576),heapMB:Math.round(process.memoryUsage().heapUsed/1048576),connections:getConnections(),ai:{mode:config.aiMode,model:config.aiModel,...getWorker()},memory:memory.getStatus(),wallet:life.engine.getAccount('ai:starry').coins,tokens:life.tokenRewards.getState(),avatar:{enabled:a.enabled,position:a.position,activity:a.plan?{kind:a.plan.kind,phase:a.plan.phase,reason:a.plan.reason}:null,stats:a.account.stats},logs:journal?journal.read():[...logs],audit:sql.prepare('SELECT user_id AS userId,command,result,created_at AS at FROM admin_command_audit ORDER BY created_at DESC LIMIT 30').all().map(r=>({...r,result:JSON.parse(r.result)}))};}
 const help=['help','status','users','coins add <ai|me|@用户名|user:ID> <1..100000>','coins remove <ai|me|@用户名|user:ID> <1..100000>','stats <ai|me> <mood|satiety|hydration|boredom|all> <0..100>','give <ai|me> <商品ID> <1..20>','items','autonomy <on|off>','memory sync','memory reset','clear'];
 async function execute(user,body){
  authorize(user);if(!body||typeof body.command!=='string'||body.command.length>160||typeof body.requestId!=='string'||!/^[a-z0-9-]{8,80}$/i.test(body.requestId))fail('指令格式无效');
  const command=body.command.trim(),parts=command.split(/\s+/),[name,a,b,c]=parts;
  const old=sql.prepare('SELECT * FROM admin_command_audit WHERE request_id=?').get(body.requestId);if(old){if(old.user_id!==user.id||old.command!==command)fail('指令凭证冲突',409);return {...JSON.parse(old.result),replayed:true};}
  if(command==='users')return {output:[{target:'ai',displayName:config.aiName,coins:life.engine.getAccount('ai:starry').coins},...users().map(u=>({target:'@'+u.username,id:'user:'+u.id,displayName:u.displayName,coins:life.engine.getAccount('user:'+u.id).coins}))]};
  if(command==='help')return {output:help.join('\n')};if(command==='status')return {output:status(user)};if(command==='items')return {output:life.engine.catalog().map(i=>({id:i.id,name:i.name}))};
  let result;
  const integer=(v,min,max)=>{if(!/^\d+$/.test(v||'')||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)fail('数值超出范围');return Number(v);};
  const account=target=>{if(target==='ai'||target==='ai:starry')return 'ai:starry';if(target==='me')return 'user:'+user.id;const found=users().find(u=>target==='@'+u.username||target==='user:'+u.id);if(!found)fail('用户不存在，输入 users 查看 @用户名 或 user:ID');return 'user:'+found.id;};
  if(name==='coins'&&['add','remove'].includes(a)&&(parts.length===4||a==='add'&&parts.length===3)){const legacy=parts.length===3,id=account(legacy?'ai':b),amount=integer(legacy?b:c,1,100000),delta=a==='remove'?-amount:amount;result={output:life.engine.adjustCoins({accountId:id,delta,requestId:body.requestId})};}
  else if(name==='stats'&&parts.length===4){const id=account(a),value=integer(c,0,100),keys=['mood','satiety','hydration','boredom'];if(b!=='all'&&!keys.includes(b))fail('未知生活属性');life.engine.getAccount(id);const selected=b==='all'?keys:[b];result={output:{accountId:id,stats:Object.fromEntries(selected.map(k=>[k,value]))}};transaction(()=>{sql.prepare('UPDATE life_accounts SET '+selected.map(k=>k+'=?').join(',')+',updated_at=? WHERE id=?').run(...selected.map(()=>value),Date.now(),id);audit(user,body,command,result);});notify();log('command',user.username+': '+command);return result;}
  else if(name==='give'&&parts.length===4){const id=account(a),quantity=integer(c,1,20),item=life.engine.catalog().find(i=>i.id===b);if(!item)fail('商品不存在，输入 items 查看');life.engine.getAccount(id);result={output:{accountId:id,itemId:item.id,quantity}};transaction(()=>{const insert=sql.prepare('INSERT INTO life_inventory(account_id,item_id,uses_left,last_used_at,acquired_at) VALUES(?,?,?,0,?)');for(let i=0;i<quantity;i++)insert.run(id,item.id,item.uses,Date.now());audit(user,body,command,result);});notify();log('command',user.username+': '+command);return result;}
  else if(name==='autonomy'&&parts.length===2&&['on','off'].includes(a)){avatar.setEnabled(a==='on');result={output:'自主生活已'+(a==='on'?'开启':'关闭')};}
  else if(command==='memory reset'){if(!memory.reset)fail('记忆未启用',409);cancelAi();result={output:await memory.reset()};}
  else if(command==='memory sync'){await memory.sync();result={output:memory.getStatus()};}
  else fail('未知指令，输入 help 查看可用指令');
  audit(user,body,command,result);log('command',user.username+': '+command);notify();return result;
 }
 function transaction(fn){sql.exec('BEGIN IMMEDIATE');try{fn();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}
 function audit(user,body,command,result){sql.prepare('INSERT INTO admin_command_audit VALUES(?,?,?,?,?)').run(body.requestId,user.id,command,JSON.stringify(result),Date.now());}
 return {status,execute,log,close:()=>{sql.close();usersDb.close();}};
}
