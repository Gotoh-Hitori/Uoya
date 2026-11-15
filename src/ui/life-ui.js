export function createLifeUI({onLogin=()=>{},onOpen=()=>{},onNotice=()=>{},onAiUse=()=>{}}={}){
 const dialog=document.getElementById('life-dialog'),frame=document.getElementById('life-frame');
 const hud=document.getElementById('life-values'),coins=document.getElementById('life-coins');
 let user=null,account=null,character=null,active=null,gesture=null,catalog=[],refreshing=null;const seenEvents=new Set();
 async function request(url,body){const res=await fetch('/social-api/api'+url,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok){const error=Error(data.error||'生活系统暂时不可用');error.status=res.status;throw error;}return data;}
 function show(){coins.textContent=account?account.coins+' 金币':'登录后同步';hud.textContent=character?'心情 '+Math.round(character.stats.mood)+' · 饱食 '+Math.round(character.stats.satiety)+' · 无聊 '+Math.round(character.stats.boredom)+' · 补水 '+Math.round(character.stats.hydration):'心情 · 饱食 · 无聊 · 补水';}
 async function refresh(){if(refreshing)return refreshing;refreshing=(async()=>{try{const me=await request('/me');user=me.user;const state=await request('/life/me');account=state.account;const observed=(await request('/life/ai')).account;if(!character)character=observed;if(!catalog.length)catalog=(await request('/life/catalog')).items;show();return true;}catch(error){if(error.status===401){user=null;account=null;character=null;active=null;show();return false;}coins.textContent='暂时离线';return false;}finally{refreshing=null;}})();return refreshing;}
 function open(){onOpen();if(!dialog.open)dialog.showModal();if(!frame.getAttribute('src'))frame.src='./life/index.html';else frame.contentWindow.postMessage({type:'bluehaven:life:refresh',sessionChanged:true},location.origin);void refresh();}
 function lifeEvent(event,fromFrame=false){
  if(Number.isSafeInteger(event?.id)){if(seenEvents.has(event.id))return;seenEvents.add(event.id);if(seenEvents.size>300)seenEvents.delete(seenEvents.values().next().value);}
  if(event?.type==='use'&&event.accountId==='ai:starry'){const item=catalog.find(i=>i.id===event.payload?.itemId);onAiUse({name:event.payload?.itemName||item?.name||'物品',category:event.payload?.itemCategory||item?.category});}
  if(event?.type==='use'){
   const item=catalog.find(i=>i.id===event.payload?.itemId);if(item)gesture={type:item.category==='drink'?'drink':item.category==='toy'?'stretch':'eat',until:performance.now()+5000};
  }
  void refresh();if(dialog.open&&!fromFrame&&frame.getAttribute('src'))frame.contentWindow.postMessage({type:'bluehaven:life:refresh'},location.origin);
 }
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='bluehaven:life:login'){dialog.close();onLogin();}
  if(event.data?.type==='bluehaven:life:changed')lifeEvent(event.data.event,true);
 });
 document.getElementById('life-open').addEventListener('click',open);document.getElementById('life-close').addEventListener('click',()=>dialog.close());
 async function prepareInteraction(id){
  active=null;if(!user&&!await refresh())return;
  const {result}=await request('/life/interaction/start',{furnitureId:id});
  if(result.tracked)active={id,ticket:result.ticket};
 }
 async function completeInteraction(id){
  if(!active||active.id!==id)return;const ticket=active.ticket;active=null;
  try{await request('/life/interaction/finish',{ticket});await refresh();onNotice('生活状态已更新');if(frame.getAttribute('src'))frame.contentWindow.postMessage({type:'bluehaven:life:refresh'},location.origin);}catch(error){onNotice(error.message,true);}
 }
 void refresh();setInterval(()=>{if(!document.hidden)void refresh();},1000);
 return {setCharacterAccount(value){character=value;show();if(frame.getAttribute('src'))frame.contentWindow.postMessage({type:'bluehaven:life:character',account:value},location.origin);},open,refresh,lifeEvent,prepareInteraction,completeInteraction,cancelInteraction:()=>{active=null;},authChanged:()=>{active=null;user=null;account=null;character=null;seenEvents.clear();void refresh();if(dialog.open&&frame.getAttribute('src'))frame.contentWindow.postMessage({type:'bluehaven:life:refresh',sessionChanged:true},location.origin);},get gesture(){return gesture&&performance.now()<gesture.until?gesture.type:null;}};
}
