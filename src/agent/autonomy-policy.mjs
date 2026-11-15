/** Deterministic utility policy. No network calls and no model output required. */
export const LOCAL_ACTIVITIES=Object.freeze({
 drink:{furnitureId:'coffee',label:'喝点水',line:'先喝点水，再继续陪你。',holdSeconds:0},
 eat:{furnitureId:'dining',label:'吃点东西',line:'想吃点热乎的东西，吃饱再聊。',holdSeconds:0},
 sleep:{furnitureId:'bed',label:'上床休息',line:'这个时候，躺一会儿应该很舒服。',holdSeconds:60},
 rest:{furnitureId:'sofa',label:'坐下放松',line:'我想在沙发上歇一会儿。',holdSeconds:30},
 garden:{furnitureId:'side-plant',label:'照顾绿植',line:'去看看那盆绿植，换个心情。',holdSeconds:0},
 stretch:{furnitureId:'rug',label:'伸展身体',line:'起来活动一下，精神会好一点。',holdSeconds:0},
 tidy:{furnitureId:'counter',label:'整理台面',line:'把这里收拾整齐，看着也会开心。',holdSeconds:0},
 groom:{furnitureId:'bath-mirror',label:'整理头发',line:'我去整理一下头发，很快就回来。',holdSeconds:0},
 wash:{furnitureId:'bath-sink',label:'洗手清洁',line:'洗洗手，清清爽爽的。',holdSeconds:0},
});
export function chooseLocalActivity({account,catalog,policy,now=Date.now(),hour=12,recent={},suggestion=null,failedUntil={}}){
 const stats=account.stats;
 const ready=kind=>(failedUntil[kind]||0)<=now&&(recent[kind]===undefined||now-recent[kind]>=(kind==='sleep'?1800000:60000));
 const resource=kind=>{
  const categories=kind==='drink'?['drink']:['food','snack'];
  const score=item=>{const e=item.effects;return kind==='drink'?(e.hydration||0)*2+(e.mood||0)*.1:Math.max(0,e.satiety||0)*2+(e.mood||0)*.1;};
  const stock=account.inventory.filter(i=>categories.includes(i.category)&&i.usesLeft>0&&(i.earliestAvailableAt||0)<=now).map(i=>catalog.find(p=>p.id===i.itemId)).filter(Boolean).sort((a,b)=>score(b)-score(a)||a.price-b.price);
  if(stock.length)return {itemId:stock[0].id,buy:false};
  if(!policy.enabled)return null;
  const affordable=catalog.filter(i=>categories.includes(i.category)&&policy.allowedCategories.includes(i.category)&&i.price<=policy.maxSingleOrder&&account.coins-i.price>=policy.minimumBalanceAfter).sort((a,b)=>score(b)/b.price-score(a)/a.price||a.id.localeCompare(b.id));
  return affordable.length?{itemId:affordable[0].id,buy:true}:null;
 };
 const needs=[{kind:'drink',priority:(60-stats.hydration)*1.5,needed:stats.hydration<60},{kind:'eat',priority:(60-stats.satiety)*1.4,needed:stats.satiety<60}].filter(n=>n.needed).sort((a,b)=>b.priority-a.priority);
 for(const need of needs){if(!ready(need.kind))continue;const item=resource(need.kind);if(item)return {...LOCAL_ACTIVITIES[need.kind],kind:need.kind,...item,reason:need.kind==='drink'?'补水度偏低，优先补水':'饱食度偏低，优先进食'};}
 const candidates=[];
 if((hour>=23||hour<7)&&ready('sleep'))candidates.push({kind:'sleep',score:75,reason:'夜间作息，先休息一会儿'});
 if(stats.mood<45&&ready('rest'))candidates.push({kind:'rest',score:70+(45-stats.mood),reason:'心情偏低，先放松一下'});
 if(stats.boredom>65)for(const kind of ['stretch','garden','groom'])if(ready(kind))candidates.push({kind,score:60+stats.boredom/10-(recent[kind]?5:0),reason:'无聊度偏高，换一种活动'});
 if(!candidates.length){
  const kinds=['garden','stretch','tidy','groom','wash','rest'].filter(ready).sort((a,b)=>(recent[a]||0)-(recent[b]||0)||Object.keys(LOCAL_ACTIVITIES).indexOf(a)-Object.keys(LOCAL_ACTIVITIES).indexOf(b));
  if(suggestion?.expiresAt>now&&kinds.includes(suggestion.kind))kinds.unshift(suggestion.kind);
  if(kinds.length)candidates.push({kind:kinds[0],score:1,reason:needs.length?'暂时无法补充物品，先进行不花金币的活动':'状态平稳，做一点日常活动'});
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates.length?{...LOCAL_ACTIVITIES[candidates[0].kind],...candidates[0]}:null;
}
