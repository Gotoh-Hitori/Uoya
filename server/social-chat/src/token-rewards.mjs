/** Trusted provider usage only. Usage receipt, carry and wallet credit commit together. */
export function createTokenRewards({database,engine,publish,now=()=>Date.now()}){
 database.exec(`CREATE TABLE IF NOT EXISTS chat_token_usage(request_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,total_tokens INTEGER NOT NULL,prompt_tokens INTEGER,completion_tokens INTEGER,model TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS chat_token_totals(account_id TEXT PRIMARY KEY,total_tokens INTEGER NOT NULL DEFAULT 0);`);
 function getState(accountId='ai:starry'){const totalTokens=database.prepare('SELECT total_tokens FROM chat_token_totals WHERE account_id=?').get(accountId)?.total_tokens||0;return {accountId,walletId:engine.wallet.shared?'household':accountId,totalTokens,earnedCoins:Math.floor(totalTokens/1000),remainderTokens:totalTokens%1000,tokensPerCoin:1000};}
 function record({accountId='ai:starry',requestId,totalTokens,promptTokens=null,completionTokens=null,model=''}){
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,100}$/.test(requestId)||!Number.isSafeInteger(totalTokens)||totalTokens<0||totalTokens>1e9)throw Error('Invalid provider usage');
  engine.getAccount(accountId);let event,duplicated=false;
  database.exec('BEGIN IMMEDIATE');
  try{
   const old=database.prepare('SELECT account_id,total_tokens FROM chat_token_usage WHERE request_id=?').get(requestId);
   if(old){if(old.account_id!==accountId||old.total_tokens!==totalTokens)throw Error('Usage receipt conflict');duplicated=true;}
   else{
    const previous=getState(accountId).totalTokens,total=previous+totalTokens;if(!Number.isSafeInteger(total))throw Error('Token total overflow');
    const amount=Math.floor(total/1000)-Math.floor(previous/1000),timestamp=now();
    database.prepare('INSERT INTO chat_token_usage VALUES(?,?,?,?,?,?,?)').run(requestId,accountId,totalTokens,Number.isSafeInteger(promptTokens)&&promptTokens>=0?promptTokens:null,Number.isSafeInteger(completionTokens)&&completionTokens>=0?completionTokens:null,String(model).slice(0,150),timestamp);
    database.prepare('INSERT INTO chat_token_totals VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET total_tokens=excluded.total_tokens').run(accountId,total);
    if(amount){const balance=engine.wallet.getBalance(accountId)+amount;if(!Number.isSafeInteger(balance))throw Error('Coin balance overflow');engine.wallet.setBalance(balance,accountId);database.prepare('INSERT INTO life_ledger(account_id,delta,after_balance,source,source_ref,created_at) VALUES(?,?,?,?,?,?)').run(accountId,amount,balance,'chat_tokens',requestId,timestamp);const payload={amount,balance,source:'chat_tokens',totalTokens:total,remainderTokens:total%1000};const result=database.prepare('INSERT INTO life_events(account_id,type,payload,created_at) VALUES(?,?,?,?)').run(accountId,'coins_granted',JSON.stringify(payload),timestamp);event={id:Number(result.lastInsertRowid),accountId,type:'coins_granted',payload,createdAt:timestamp};}
   }
   database.exec('COMMIT');
  }catch(error){database.exec('ROLLBACK');throw error;}
  if(event)publish(event);return {...getState(accountId),awardedCoins:event?.payload.amount||0,idempotentReplay:duplicated};
 }
 return {record,getState};
}
