export function createSocialChat({onReply=()=>{},onOpen=()=>{},onLifeEvent=()=>{},onAuthChange=()=>{},onError=()=>{},onMessage=()=>{},onProfile=()=>{},onReset=()=>{},onMemberProfile=()=>{},onMediaChange=()=>{}}={}){
 const dialog=document.getElementById('social-chat-dialog'),frame=document.getElementById('social-chat-frame');
 function applyProfile(profile){if(!profile?.name)return;onProfile(profile);document.getElementById('life-frame')?.contentWindow?.postMessage({type:'bluehaven:chat:profile',profile},location.origin);document.querySelector('.agent-text strong').textContent=profile.name;document.getElementById('social-chat-title').textContent=profile.name+' · AI 聊天';document.getElementById('command-input').placeholder='和'+profile.name+'聊天，或告诉她想做什么…';document.querySelector('.agent-text img')?.remove();const icon=document.querySelector('.agent-icon');let image=icon.querySelector('img');const fallback=()=>{image?.remove();if(![...icon.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))icon.prepend(document.createTextNode('✦'));};if(profile.avatarUrl){if(!image){image=document.createElement('img');image.className='agent-portrait';image.referrerPolicy='no-referrer';icon.prepend(image);}for(const node of [...icon.childNodes])if(node.nodeType===3)node.remove();image.src=profile.avatarUrl;image.alt=profile.name;image.onerror=fallback;}else fallback();}
 fetch('/social-api/api/config').then(r=>r.ok?r.json():null).then(c=>c&&applyProfile(c.profile)).catch(()=>{});
 let attachmentComposer=null;
 const mediaModule=new URL('/social-chat/media-composer.js',location.href).href;
 if(document.getElementById('command-attach'))void import(/* @vite-ignore */ mediaModule).then(({createMediaComposer})=>{attachmentComposer=createMediaComposer({button:document.getElementById('command-attach'),preview:document.getElementById('command-media-drafts'),onNotice:onError,onChange:()=>onMediaChange()});document.getElementById('command-attach').disabled=false;}).catch(()=>onError('附件组件加载失败，请刷新'));
 const openButton=document.getElementById('social-chat-open'),closeButton=document.getElementById('social-chat-close');
 const status=document.getElementById('social-chat-status');status.hidden=true;let ready=false,pending='',seen=new Set();
 let stream=null,streamReady=null,lastMessageId=0,sessionUserId=null;const waiting=new Set(),earlyReplies=new Map();
 async function request(path,options={}){const response=await fetch('/social-api/api'+path,{credentials:'same-origin',...options});let data={};try{data=await response.json();}catch{}if(!response.ok){const error=Error(response.status===401?'请先通过聊天入口登录':data.error||'发送失败，请稍后重试');error.status=response.status;throw error;}return data;}
 function displayReply(message){if(!Number.isSafeInteger(message?.id)||typeof message.content!=='string'||seen.has(message.id))return;seen.add(message.id);if(seen.size>500)seen.delete(seen.values().next().value);onReply(message.content.slice(0,8000));}
 function receive(message){if(!message)return;onMessage(message);lastMessageId=Math.max(lastMessageId,message.id||0);if(message.role!=='ai')return;const target=message.replyTo?.messageId;if(waiting.has(target)){waiting.delete(target);earlyReplies.delete(target);displayReply(message);}else if(Number.isSafeInteger(target)){earlyReplies.set(target,message);while(earlyReplies.size>30)earlyReplies.delete(earlyReplies.keys().next().value);}}
 function closeStream(){stream?.close();stream=null;streamReady=null;waiting.clear();earlyReplies.clear();lastMessageId=0;sessionUserId=null;}
 async function recoverReplies(){let cursor=lastMessageId;for(let page=0;page<40&&waiting.size;page++){const data=await request('/messages?after='+cursor+'&limit=100');for(const message of data.messages)receive(message);if(data.messages.length<100)break;cursor=data.messages.at(-1).id;}}
 function connect(){if(streamReady)return streamReady;const source=new EventSource('/social-api/api/events',{withCredentials:true});stream=source;
  streamReady=new Promise((resolve,reject)=>{let connected=false;const timeout=setTimeout(()=>{if(!connected){closeStream();reject(Error('聊天连接超时，请重试'));}},10000);
   source.addEventListener('connected',()=>{const reconnect=connected;connected=true;clearTimeout(timeout);resolve();void request('/messages?limit=1').then(data=>data.messages.forEach(receive)).catch(()=>{});if(reconnect&&waiting.size)void recoverReplies().catch(()=>{});});
   source.addEventListener('message',event=>{try{receive(JSON.parse(event.data).message);}catch{}});
   source.addEventListener('life_event',event=>{try{onLifeEvent(JSON.parse(event.data).event);}catch{}});
   source.addEventListener('wallet_changed',event=>{try{onLifeEvent({type:'wallet_changed',payload:JSON.parse(event.data)});}catch{}});
   source.addEventListener('ai_error',event=>{try{const data=JSON.parse(event.data);if(waiting.delete(data.replyToMessageId))onError(data.message||'AI 回复失败，请重试');}catch{}});
   source.addEventListener('membership_changed',event=>{try{if(JSON.parse(event.data).membership==='kicked'){closeStream();onReset();onAuthChange();onError('已被管理员移出群聊，可重新申请加入');}}catch{}});
   source.addEventListener('member_moderated',event=>{try{if(JSON.parse(event.data).userId===sessionUserId)onAuthChange();}catch{}});
   source.addEventListener('member_profile_changed',event=>{try{onMemberProfile(JSON.parse(event.data).user);}catch{}});
   source.addEventListener('ai_profile_changed',event=>{try{applyProfile(JSON.parse(event.data).profile);}catch{}});
   source.onerror=()=>{if(!connected){clearTimeout(timeout);closeStream();reject(Error('聊天连接失败，请重试'));}};
  });return streamReady;
 }
 async function send(text,attachments=[]){const content=String(text).trim();if(!content&&!attachments.length||content.length>800)throw Error('消息需为 1–800 字');try{const user=await ensureSession();if(user.muted_until===-1||user.muted_until>Date.now())throw Object.assign(Error('禁言期间不能发言'),{status:403});await connect();const result=await request('/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,attachments,clientId:crypto.randomUUID()})});receive(result.message);const id=result.message?.id;if(Number.isSafeInteger(id)){waiting.add(id);if(waiting.size>100)waiting.delete(waiting.values().next().value);if(earlyReplies.has(id))receive(earlyReplies.get(id));}return result;}catch(error){if(error.status===401)closeStream();throw error;}}
 async function ensureSession(){const {user}=await request('/me');if(sessionUserId&&sessionUserId!==user.id){closeStream();onReset();}sessionUserId=user.id;return user;}
 async function syncSession(){try{await ensureSession();await connect();}catch(error){if(error.status===401){closeStream();onReset();}}}
 void syncSession();setInterval(()=>{if(!document.hidden)void syncSession();},30000);
 window.addEventListener('beforeunload',closeStream);
 function open(text=''){
  onOpen();if(!dialog.open)dialog.showModal();
  if(!frame.getAttribute('src'))frame.src='./social-chat/index.html';
  if(text){if(ready)frame.contentWindow.postMessage({type:'bluehaven:chat:compose',text},location.origin);else pending=text;}
 }
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  const data=event.data;
  if(data?.type==='bluehaven:chat:ready'){ready=true;status.textContent='';if(pending){frame.contentWindow.postMessage({type:'bluehaven:chat:compose',text:pending},location.origin);pending='';}}
  else if(data?.type==='bluehaven:chat:profile')applyProfile(data.profile);
  else if(data?.type==='bluehaven:chat:authenticated'){onAuthChange();void syncSession();}
  else if(data?.type==='bluehaven:chat:message')receive(data.message);
  else if(data?.type==='bluehaven:life:event')onLifeEvent(data.event);
  else if(data?.type==='bluehaven:chat:mode')status.textContent='';
  else if(data?.type==='bluehaven:chat:signed-out'){status.textContent='';closeStream();seen.clear();onReset();onAuthChange();}
  else if(data?.type==='bluehaven:chat:reply'&&typeof data.message?.content==='string'&&Number.isSafeInteger(data.message.id)&&!seen.has(data.message.id)){
   displayReply(data.message);
  }
 });
 openButton.addEventListener('click',()=>open());closeButton.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
 return {open,send,get attachments(){return attachmentComposer?.ids||[];},get mediaBusy(){return attachmentComposer?.busy||false;},get mediaErrors(){return attachmentComposer?.hasErrors||false;},freezeAttachments:value=>attachmentComposer?.freeze(value),clearAttachments:()=>attachmentComposer?.clear()};
}
