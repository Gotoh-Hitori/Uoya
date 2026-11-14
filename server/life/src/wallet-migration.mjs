import {START} from './rules.mjs';
export function splitLegacyWallet(db,{mode='history',now=Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS life_wallet_migrations(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at INTEGER NOT NULL)');
 if(db.prepare('SELECT id FROM life_wallet_migrations WHERE id=?').get('individual-wallets-v1'))return;
 db.exec('BEGIN IMMEDIATE');try{
  const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='life_shared_wallet'").get();
  const shared=exists?db.prepare('SELECT coins FROM life_shared_wallet WHERE id=1').get():null;
  if(shared){
   if(!Number.isSafeInteger(shared.coins)||shared.coins<0)throw Error('Invalid legacy wallet balance');
   let rows=db.prepare('SELECT a.id,a.coins,COALESCE(SUM(l.delta),0) AS net,COUNT(l.id) AS entries FROM life_accounts a LEFT JOIN life_ledger l ON l.account_id=a.id GROUP BY a.id ORDER BY a.id').all();
   let allocations=[];
   if(mode==='ai'||mode==='admin'){
    let id='ai:starry';if(mode==='admin'){const owner=db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1").get();if(!owner)throw Error('No administrator for wallet migration');id='user:'+owner.id;}
    if(!rows.some(r=>r.id===id)){db.prepare('INSERT INTO life_accounts VALUES(?,0,?,?,?,?,?)').run(id,START.mood,START.satiety,START.boredom,START.hydration,now);rows.push({id,coins:0,net:0,entries:0});}
    allocations=rows.map(r=>({...r,balance:r.id===id?shared.coins:0}));
   }else{
    const hasLedger=rows.some(r=>r.entries>0),weights=rows.map(r=>BigInt(Math.max(0,hasLedger?r.net:r.coins))),sum=weights.reduce((a,b)=>a+b,0n),budget=BigInt(shared.coins);
    if(sum){
     allocations=rows.map((r,i)=>({...r,balance:Number(budget*weights[i]/sum),remainder:budget*weights[i]%sum}));
     let extra=shared.coins-allocations.reduce((n,r)=>n+r.balance,0);for(const row of [...allocations].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1)){if(extra--<=0)break;row.balance++;}
    }else{
     if(!rows.some(r=>r.id==='ai:starry')){db.prepare('INSERT INTO life_accounts VALUES(?,0,?,?,?,?,?)').run('ai:starry',START.mood,START.satiety,START.boredom,START.hydration,now);rows.push({id:'ai:starry',coins:0,net:0,entries:0});}
     allocations=rows.map(r=>({...r,balance:r.id==='ai:starry'?shared.coins:0}));
    }
   }
   for(const row of allocations){db.prepare('UPDATE life_accounts SET coins=? WHERE id=?').run(row.balance,row.id);db.prepare('INSERT INTO life_ledger(account_id,delta,after_balance,source,source_ref,created_at) VALUES(?,?,?,?,?,?)').run(row.id,row.balance-row.net,row.balance,'wallet_split','individual-wallets-v1',now);}
   db.prepare('INSERT INTO life_wallet_migrations VALUES(?,?,?)').run('individual-wallets-v1',JSON.stringify({mode,total:shared.coins,accounts:allocations.map(({remainder,...r})=>r)}),now);
  }else db.prepare('INSERT INTO life_wallet_migrations VALUES(?,?,?)').run('individual-wallets-v1',JSON.stringify({mode:'fresh'}),now);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
