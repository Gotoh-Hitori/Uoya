let parentSnapshotAt=0;
function stableIcon(kind){return globalThis.UoyaIcons.emoji(kind);}
const itemEmoji=item=>legacyEmoji(item);
const $=id=>document.getElementById(id);
const statMeta={
  mood:{label:'心情',icon:'💙',color:'#7bb2f7',desc:'越高越开心'},
  satiety:{label:'饱食度',icon:'🍚',color:'#ffbd84',desc:'饱腹的满足感'},
  boredom:{label:'无聊度',icon:'🧸',color:'#be9bfa',desc:'越低越不无聊'},
  hydration:{label:'补水度',icon:'💧',color:'#6ad1dc',desc:'记得按时喝水'},
};
const legacyEmoji=item=>h(({gift:'🎁',food:'🍚',drink:'🥤',snack:'🍪',toy:'🧸',heart:'💙',star:'🌟'})[item?.emoji]||item?.emoji||'📦');
const cn={food:'食物',drink:'饮料',snack:'零食',toy:'小玩具'};
let isAdmin=false;let catalog=[];let activeCategory='all',me=null,aiAccount=null,pendingTip=null,activity={events:[]},busy=false;
const h=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=ts=>new Date(ts).toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit'});
let toastTimer;
function toast(s,error=false){const t=$('toast');t.textContent=s;t.className=`toast show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='toast',2700);}
async function api(url,{method='GET',body}={}){
  const r=await fetch('/social-api'+url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  let data={};try{data=await r.json();}catch{}
  if(!r.ok){const error=Error(data.error||`请求失败 (${r.status})`);error.status=r.status;throw error;}
  return data;
}
function applyProfile(profile){if(profile?.name)document.getElementById('characterStatsTitle').textContent=profile.name+'的生活状态';if(profile?.name)document.getElementById('aiWalletName').textContent=profile.name+'的钱包';if(profile?.name)document.querySelector('.shop-section h3').textContent=profile.name+'的小商店';}
const newId=()=>crypto.randomUUID();
function effectMarkup(item){return Object.entries(item.effects).map(([k,v])=>`<span class="effect ${v<0?'neg':''}">${h(statMeta[k]?.label||k)} ${v>0?'+':''}${v}</span>`).join('');}
function renderCatalog(){
  const items=catalog.filter(x=>activeCategory==='all'||x.category===activeCategory);
  $('shopCount').textContent=`${items.length} 种商品`;
  $('catalogGrid').innerHTML=items.map(item=>`
    <article class="product-card ${item.id==='plain-rice'?'featured':''}">
      <div class="product-head"><span class="product-emoji" aria-hidden="true">${itemEmoji(item)}</span><span class="product-price"><span>🪙</span> ${item.price}</span></div>
      <h4>${h(item.name)} </h4>
      <p>${h(item.description)}${item.category==='toy'?` 可玩 ${item.uses} 次。`:''}</p>
      <div class="effects">${effectMarkup(item)}</div>
      <button class="buy-button" data-buy="${h(item.id)}" ${busy||!me||me.coins<item.price?'disabled':''} type="button">${me&&me.coins<item.price?'金币不足':'＋ 购买 · '+cn[item.category]}</button>
    </article>`).join('');
  $('catalogGrid').querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>purchase(button.dataset.buy));
}
function renderStats(){
  if(!me||!aiAccount)return;
  $('coinBalance').textContent=me.coins.toLocaleString();$('aiCoinBalance').textContent=aiAccount?aiAccount.coins.toLocaleString()+' 金币':'—';renderTip();
  $('moodChip').textContent=`😊 ${aiAccount.moodLabel}`;
  $('statsGrid').innerHTML=Object.entries(statMeta).map(([key,s])=>{
    const val=Math.round(aiAccount.stats[key]);
    return `<div class="stat-card"><div class="stat-top"><span>${s.label}</span><span class="stat-icon">${stableIcon(({mood:'heart',satiety:'food',hydration:'drop',boredom:'toy'})[key])}</span></div><div class="stat-number">${val}<small>/100</small></div><div class="stat-track"><div class="stat-fill" style="width:${val}%;background:${s.color}"></div></div><div class="stat-sub">${s.desc}</div></div>`;
  }).join('');
}
function renderInventory(){
  if(!me)return;
  const sorted=[...me.inventory].sort((a,b)=>a.category==='food'?-1:0);
  $('inventoryCount').textContent=sorted.reduce((s,i)=>s+i.units,0);
  $('inventoryList').innerHTML=sorted.length?sorted.map(x=>{
    const toy=x.category==='toy';
    const cooldown=x.earliestAvailableAt>Date.now();
    return `<div class="inventory-item"><div class="inventory-icon">${itemEmoji(x)}</div><div class="inventory-copy"><strong>${h(x.name)}</strong><small>${`剩余 ${x.usesLeft} 次 · ${x.units} 件`}</small></div><button class="use-btn" data-use="${h(x.itemId)}" ${busy||cooldown?'disabled':''}>${cooldown?'冷却中':toy?'玩耍':'使用'}</button></div>`;
  }).join(''):'<p class="empty">背包还是空的，先去商店买点东西吧。</p>';
  $('inventoryList').querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>use(b.dataset.use));
}
function renderActivity(){
  $('activityList').innerHTML=activity.events.length?activity.events.slice(0,7).map(e=>{
    const it=catalog.find(i=>i.id===e.payload.itemId);
    const t=e.type==='purchase'?`购买了 ${it?.name||'商品'} ×${e.payload.quantity}（-${e.payload.total}）`:e.type==='use'?`使用 ${it?.name||'物品'}，状态变化`:e.type==='coins_granted'?`获得金币 +${e.payload.amount}`:e.type==='transfer'?`爆金币 -${e.payload.amount}`:e.type==='coins_adjusted'?`金币调整 ${e.payload.delta>0?'+':''}${e.payload.delta}`:e.type;
    return `<div class="activity-item"><span class="activity-dot"></span><div>${h(t)}<small>${fmtTime(e.createdAt)}</small></div></div>`;
  }).join(''):'<p class="empty">暂无动态。</p>';
}
function renderTip(){const disabled=busy||!me||me.coins<1;$('tipButton').disabled=disabled;$('tipAmount').disabled=disabled;const max=Math.min(100000,me?.coins||0);$('tipAmount').max=String(max);if(max>0&&$('tipAmount').valueAsNumber>max)$('tipAmount').value=String(max);}
async function tip(event){event.preventDefault();if(busy||!me)return;const amount=$('tipAmount').valueAsNumber;if(!Number.isSafeInteger(amount)||amount<1||amount>me.coins)return toast('请输入余额范围内的整数金币',true);busy=true;if(pendingTip?.amount!==amount)pendingTip={amount,requestId:newId()};renderTip();renderCatalog();renderInventory();try{const {result}=await api('/api/life/tip',{method:'POST',body:pendingTip});pendingTip=null;notifyParent(result.event);toast('爆金币成功，已转给 AI '+amount+' 金币');await refresh();}catch(error){if(error.status)pendingTip=null;toast(error.message,true);}finally{busy=false;renderTip();renderCatalog();renderInventory();}}
let refreshPending=null;function refresh(){if(refreshPending)return refreshPending;refreshPending=refreshState().finally(()=>{refreshPending=null;});return refreshPending;}
async function refreshState(){
  try{
    const [m,act,c,a]=await Promise.all([api('/api/life/me'),api('/api/life/activity'),api('/api/life/catalog'),api('/api/life/ai')]);if(performance.now()-parentSnapshotAt>2000)aiAccount=a.account;catalog=c.items;
    me=m.account;activity=act;$('life-auth').hidden=true;
    renderStats();renderCatalog();renderInventory();renderActivity();
  }catch(err){if(err.status===401){me=null;isAdmin=false;$('customItemPanel').hidden=true;$('life-auth').hidden=false;}else toast(err.message,true);}
}
async function purchase(itemId){
  if(busy)return;busy=true;renderTip();renderCatalog();renderInventory();
  try{
    const {result}=await api('/api/life/purchase',{method:'POST',body:{itemId,quantity:1,requestId:newId()}});
    toast(`购买成功，花费 ${result.total} 金币！`);
    notifyParent(result.event);await refresh();
  }catch(err){toast(err.message,true);}finally{busy=false;renderTip();renderCatalog();renderInventory();}
}
async function use(itemId){
  if(busy)return;busy=true;renderCatalog();renderInventory();
  try{
    const {result}=await api('/api/life/use',{method:'POST',body:{itemId,requestId:newId()}});
    notifyParent(result.event);toast('使用成功，生活状态已更新');await refresh();
  }catch(err){toast(err.message,true);}finally{busy=false;renderCatalog();renderInventory();}
}
function notifyParent(event){if(parent!==window)parent.postMessage({type:'bluehaven:life:changed',event},location.origin);}
async function loadSession(){
 void api('/api/config').then(c=>applyProfile(c.profile)).catch(()=>{});
 try{const {user}=await api('/api/me');isAdmin=user.role==='admin';$('customItemPanel').hidden=!isAdmin;catalog=(await api('/api/life/catalog')).items;await refresh();}
 catch(error){if(error.status===401){isAdmin=false;$('customItemPanel').hidden=true;$('life-auth').hidden=false;}else toast(error.message,true);}
}
async function createCustomItem(event){
 event.preventDefault();if(!isAdmin)return;
 const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
 if(button.disabled)return;button.disabled=true;
 const values=Object.fromEntries(new FormData(form)),effects={};
 for(const key of ['mood','satiety','boredom','hydration']){effects[key]=Number(values[key]);delete values[key];}
 for(const key of ['price','uses','cooldownSec'])values[key]=Number(values[key]);
 try{await api('/api/life/catalog',{method:'POST',body:{...values,effects}});form.reset();await refresh();toast('商品已创建并上架');}
 catch(error){toast(error.message,true);}finally{button.disabled=false;}
}
async function init(){
 $('tipForm').addEventListener('submit',tip);
 $('customItemForm').addEventListener('submit',createCustomItem);
 $('filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.category;$('filters').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));renderCatalog();});
 $('life-login').onclick=()=>{if(parent!==window)parent.postMessage({type:'bluehaven:life:login'},location.origin);else location.href='../social-chat/index.html';};
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='bluehaven:life:character'&&event.data.account?.accountId==='ai:starry'){parentSnapshotAt=performance.now();aiAccount=event.data.account;renderStats();}if(event.origin===location.origin&&event.source===parent&&event.data?.type==='bluehaven:chat:profile')applyProfile(event.data.profile);if(event.origin===location.origin&&event.source===parent&&event.data?.type==='bluehaven:life:refresh')void(event.data.sessionChanged||!me?loadSession():refresh());});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});window.addEventListener('focus',()=>void refresh());
 await loadSession();setInterval(()=>{if(!document.hidden)void(me?refresh():loadSession());},1000);
}
init().catch(error=>toast(error.message,true));
