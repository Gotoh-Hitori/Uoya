import {copyText,createStreamingMarkdown} from './markdown.js';
import {createVoiceInput} from './voice-input.js';
import {renderMessageBody} from './media-render.js';
import {createMediaComposer} from './media-composer.js';
import {createGroupManagementUI} from './group-management.js';
import {createMemberSettings,createJoinManagement} from './member-settings.js';
import {createAdminConsoleUI} from './admin-console.js';
const $ = selector => document.querySelector(selector);
const els = {
  authOverlay:$('#authOverlay'), authForm:$('#authForm'),authUsername:$('#authUsername'),authDisplayName:$('#authDisplayName'),authPassword:$('#authPassword'),authError:$('#authError'),
  messages:$('#messages'),chatScroll:$('#chatScroll'),messageInput:$('#messageInput'),sendButton:$('#sendButton'),loadMore:$('#loadMore'),
  typing:$('#typing'),streaming:$('#streaming'),streamText:$('#streamText'),
};
function renderTokenRewards(rewards){state.tokenRewards=rewards;}
const base = (window.BLUEHAVEN_CONFIG?.apiBase || '').replace(/\/$/, '');
const state = {
  me:null, profile:null, aiMode:'mock', trigger:'auto', members:[],onlineUserIds:[],
  messageIds:new Set(), messages:[], stream:null, aiRunId:0, eventSource:null,
  register:false, hasMore:true, sending:false, autoSpeak:false, preferServerTts:false, ttsServer:false,
  currentAudio:null, memory:null,
};
const adminConsole=createAdminConsoleUI({api,onSaved:refreshAiConfig,onEditPersona:editPersona,onUnauthorized:()=>{show($('#adminConsoleOpen'),false);}});
const memberSettings=createMemberSettings({api,onProfile:applyMemberProfile,onPasswordChanged:()=>{resetToLogin();toast('密码已修改，请使用新密码登录');}}),joinManagement=createJoinManagement({api});
const mediaComposer=createMediaComposer({button:$('#mediaAttach'),preview:$('#mediaDrafts'),apiBase:base,dropTarget:$('#composer'),pasteTarget:els.messageInput,canUpload:()=>!!state.me&&!isMuted(),onNotice:toast,onChange:()=>renderMute()});
const groupManagement=createGroupManagementUI({api,onOpenJoin:()=>joinManagement.open()});
async function refreshAiConfig(){const c=await api('/api/config');state.profile=c.profile;state.aiMode=c.aiMode;state.trigger=c.aiTriggerMode;renderProfile();notifyHouse({type:'bluehaven:chat:mode',mode:state.aiMode});}
const streamRenderer=createStreamingMarkdown(els.streamText,{afterRender:()=>scrollBottom()});
const voice=createVoiceInput({button:$('#voiceInput'),cancelButton:$('#cancelVoice'),status:$('#voiceStatus'),input:els.messageInput,apiBase:base,onNotice:toast,canRecord:()=>!!state.me&&!isMuted()&&!state.sending});
function sizeInput(){els.messageInput.style.height='auto';els.messageInput.style.height=Math.min(innerWidth<600?120:180,Math.max(42,els.messageInput.scrollHeight))+'px';}
let toastTimer;
const avatarPalette = ['#4f8cd3','#9472cb','#dc96a6','#51a9b1','#7f9dcc','#9bb26c','#ca9a6c','#6f9dcd'];
function avatarColor(key='') { let hash=0;for (let i=0;i<key.length;i++) hash=(hash*31+key.charCodeAt(i))|0;return avatarPalette[Math.abs(hash)%avatarPalette.length]; }
const userInitial = name => [...(name||'访客')].slice(0,1).join('');
const show = (el, visible) => el.classList.toggle('hidden', !visible);
function toast(text) { const el=$('#toast');el.textContent=text;show(el,true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show(el,false),3800); }
async function api(path,{method='GET',body,...rest}={}) {
  const response = await fetch(base+path, {
    method,credentials:'include',headers:{...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}),...rest,
  });
  if (!response.ok) {
    let error;
    try { error=(await response.json()).error; } catch{}
    const e=new Error(error||`请求失败 ${response.status}`);e.status=response.status;throw e;
  }
  return response.headers.get('Content-Type')?.includes('application/json') ? response.json() : response;
}
function formatTime(ts) {return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function create(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function isNearBottom() {const el=els.chatScroll;return el.scrollHeight-el.clientHeight-el.scrollTop<150;}
function scrollBottom(force=false) {if(force||isNearBottom()) requestAnimationFrame(()=>{els.chatScroll.scrollTop=els.chatScroll.scrollHeight;});}
function renderAction(messageId,action){
 const row=els.messages.querySelector('[data-id="'+Number(messageId)+'"] .msg-main');if(!row)return;
 let tag=[...row.querySelectorAll('.action-receipt')].find(t=>t.dataset.actionId===action.actionId);if(!tag){tag=create('div','action-receipt');tag.dataset.actionId=action.actionId;row.append(tag);}
 tag.textContent=(state.profile?.name||'AI')+' · '+({queued:'已安排',started:'执行中',completed:'已完成',cancelled:'已取消'}[action.status]||action.status)+' · '+action.label;tag.dataset.status=action.status;
}
function appendMessage(message,{prepend=false,announce=true}={}) {
  if (state.messageIds.has(message.id)){for(const action of message.actions||[])renderAction(message.id,action);return;}
  const shouldScroll=isNearBottom();
  state.messageIds.add(message.id);
  state.messages.push(message);
  state.messages.sort((a,b)=>a.id-b.id);
  const mine=message.role==='human'&&message.author?.id===state.me?.id;
  const ai=message.role==='ai';
  const row=create('article','msg'+(mine?' mine':'')+(ai?' ai-message':''));
  row.dataset.id=String(message.id);
  const avatar=create('div','msg-avatar'+(ai?' ai':'') ,ai?'AI':userInitial(message.author?.displayName));
  if(ai)paintAvatar(avatar);
  if(!ai){avatar.style.background=avatarColor(message.author?.username);paintMemberAvatar(avatar,message.author);}
  const main=create('div','msg-main');
  const meta=create('div','msg-meta');
  const name=create('span','msg-name'+(ai?' ai-name':''),ai?state.profile?.name||'AI':message.author?.displayName||'未知成员');
  if(ai&&message.replyTo?.author){const target=message.replyTo.author;name.textContent+=' → '+(target.displayName||target.username);}
  const date=create('span','msg-date',formatTime(message.createdAt));
  const content=create('div','msg-content');renderMessageBody(content,message);
  meta.append(name,date);
  main.append(meta,content);
  {
    const actions=create('div','msg-actions');
    const speak=create('button','speak-button','♫ 朗读');speak.type='button';
    speak.setAttribute('aria-label','朗读这条 AI 消息');
    speak.addEventListener('click',()=>speakAi(message));
    const copy=create('button','copy-button','复制');copy.type='button';
    copy.addEventListener('click',()=>copyText(message.content).then(()=>toast('已复制')).catch(()=>toast('复制失败')));
    const quote=create('button','quote-button','引用');quote.type='button';quote.onclick=()=>{const name=ai?state.profile?.name||'AI':message.author?.displayName||'成员';const next='> '+name+'：'+message.content.replace(/\n/g,'\n> ')+'\n\n';if(next.length>2000)return toast('消息过长，无法完整引用');els.messageInput.value=next;sizeInput();els.messageInput.focus({preventScroll:true});};
    if(ai)actions.append(speak);actions.append(copy,quote);main.append(actions);
  }
  row.append(avatar,main);
  if(prepend)els.messages.prepend(row);else els.messages.append(row);for(const action of message.actions||[])renderAction(message.id,action);
  if(!prepend&&shouldScroll)scrollBottom(true);
  if(!prepend&&announce)notifyHouse({type:'bluehaven:chat:message',message});
  if(ai&&!prepend&&announce)notifyHouse({type:'bluehaven:chat:reply',message:{id:message.id,content:message.content}});
  if(ai&&state.autoSpeak&&!prepend&&announce) speakAi(message);
}
function paintMemberAvatar(el,user){const url=user?.avatar_url||user?.avatarUrl;el.replaceChildren();if(url){const image=document.createElement('img');image.src=url;image.alt=user.display_name||user.displayName||'头像';image.referrerPolicy='no-referrer';image.onerror=()=>el.textContent=userInitial(user.display_name||user.displayName);el.append(image);}else el.textContent=userInitial(user?.display_name||user?.displayName);}
function applyMemberProfile(user){const normal={id:user.id,username:user.username,displayName:user.display_name||user.displayName,avatarUrl:user.avatar_url||user.avatarUrl||''};if(state.me?.id===user.id)updateMe(user);for(const message of state.messages){if(message.author?.id===user.id)message.author=normal;if(message.replyTo?.author?.id===user.id)message.replyTo.author=normal;}const history=[...state.messages],scroll=els.chatScroll.scrollTop;state.messages=[];state.messageIds.clear();els.messages.replaceChildren();history.forEach(m=>appendMessage(m,{announce:false}));requestAnimationFrame(()=>els.chatScroll.scrollTop=scroll);}
function renderMembers(){}
function renderMemory(memory=state.memory){
 if(!memory)return;
 state.memory=memory;
}
function paintAvatar(el){el.replaceChildren();if(state.profile?.avatarUrl){const img=document.createElement('img');img.src=state.profile.avatarUrl;img.alt=state.profile.name;img.referrerPolicy='no-referrer';img.onerror=()=>{el.textContent='AI';};el.append(img);}else el.textContent='AI';}
function renderProfile() {
  const p=state.profile||{};
  $('#typingName').textContent=p.name||'AI';
  $('.stream-name').textContent=(p.name||'AI')+' · 正在回复';
  document.querySelectorAll('.mini-ai-icon,.ai-message .msg-avatar').forEach(paintAvatar);
  for(const message of state.messages){if(message.role==='ai'){const el=els.messages.querySelector('[data-id="'+message.id+'"] .msg-name');if(el)el.textContent=(p.name||'AI')+(message.replyTo?.author?' → '+(message.replyTo.author.displayName||message.replyTo.author.username):'');}for(const action of message.actions||[])renderAction(message.id,action);}
  notifyHouse({type:'bluehaven:chat:profile',profile:p});
  $('#preferServerTts').disabled=!state.ttsServer;
}
function updateMe(user) {
  groupManagement.setUser(user);show($('#groupManage'),user.role==='admin'&&window.parent===window);state.me=user;renderMute();notifyHouse({type:'bluehaven:chat:authenticated',user});
  $('#myDisplay').textContent=user.display_name||user.displayName;
  $('#myRole').textContent=user.role==='admin'?'空间管理员':'聊天室成员';
  paintMemberAvatar($('#myAvatar'),user);show($('#joinManage'),user.role==='admin');
  show($('#personaManage'),user.role==='admin');show($('#adminConsoleOpen'),window.parent===window);adminConsole.setUser(user);
}
function isMuted(user=state.me){const until=user?.muted_until??user?.mutedUntil??0;return until===-1||until>Date.now();}
function renderMute(){const muted=isMuted();els.messageInput.disabled=muted;if(!state.sending)els.sendButton.disabled=muted||mediaComposer.busy;els.messageInput.placeholder=muted?'禁言中，暂时不能发言':'和大家说点什么…';}
setInterval(()=>{if(state.me)renderMute();},1000);
function setConnection(connected){state.connected=connected;}
function updatePresence(data) {state.onlineUserIds=data.onlineUserIds||[];renderMembers();}
function clearStream(){state.stream=null;streamRenderer.clear();$('#streamNotice').textContent='';show($('#stopReply'),false);show(els.streaming,false);show(els.typing,false);}
function listenRealtime() {
  state.eventSource?.close();
  const s=new EventSource(base+'/api/events',{withCredentials:true});state.eventSource=s;
  s.addEventListener('connected',()=>{clearStream();state.aiRunId=0;setConnection(true);void refreshAiConfig().catch(()=>{});refreshMissedMessages();void api('/api/messages?limit=65').then(r=>r.messages.forEach(m=>appendMessage(m,{announce:false}))).catch(()=>{});});
  s.addEventListener('session_revoked',()=>{resetToLogin();toast('登录已失效，请使用新密码登录');});
  s.addEventListener('membership_changed',e=>{if(JSON.parse(e.data).membership==='kicked'){resetToLogin();els.authError.textContent='已被管理员移出群聊，可重新申请加入';}});
  s.addEventListener('member_moderated',e=>{const data=JSON.parse(e.data);if(data.userId===state.me?.id){state.me.muted_until=data.mutedUntil;state.me.daily_token_limit=data.dailyTokenLimit;renderMute();notifyHouse({type:'bluehaven:chat:authenticated',user:state.me});}});
  s.addEventListener('avatar_action',e=>{const action=JSON.parse(e.data);renderAction(action.messageId,action);});
  s.addEventListener('life_event',e=>notifyHouse({type:'bluehaven:life:event',event:JSON.parse(e.data).event}));
  void api('/api/token-rewards').then(data=>renderTokenRewards(data.rewards)).catch(()=>{});
  s.addEventListener('wallet_changed',e=>notifyHouse({type:'bluehaven:life:event',event:{type:'wallet_changed',payload:JSON.parse(e.data)}}));
  s.addEventListener('token_usage',e=>renderTokenRewards(JSON.parse(e.data)));
  s.addEventListener('member_profile_changed',e=>applyMemberProfile(JSON.parse(e.data).user));
  s.addEventListener('ai_profile_changed',e=>{state.profile=JSON.parse(e.data).profile;renderProfile();});
  s.addEventListener('ai_settings_changed',()=>void refreshAiConfig().catch(()=>{}));
  s.addEventListener('memory_status',e=>renderMemory(JSON.parse(e.data)));
  s.addEventListener('presence',e=>updatePresence(JSON.parse(e.data)));
  s.addEventListener('members',e=>{state.members=JSON.parse(e.data).members||[];renderMembers();});
  s.addEventListener('message',e=>{
    const data=JSON.parse(e.data);
    if(data.message?.role==='ai')clearStream();
    appendMessage(data.message);
  });
  s.addEventListener('ai_status',e=>{
    const data=JSON.parse(e.data);
    if(data.status==='thinking') {
      $('#typingName').textContent=(state.profile?.name||'AI')+(data.requestedBy?' → '+(data.requestedBy.displayName||data.requestedBy.username):'');
      clearStream();$('.stream-name').textContent=$('#typingName').textContent+' · 正在回复';state.aiRunId=data.runId;state.stream='';state.canStop=state.me?.role==='admin'||data.requestedBy?.id===state.me?.id;show($('#stopReply'),state.canStop);show(els.typing,true);show(els.streaming,true);scrollBottom();
    } else if(data.runId===state.aiRunId&&!state.stream) {clearStream();}
  });
  s.addEventListener('ai_delta',e=>{
    const data=JSON.parse(e.data);
    if(state.aiRunId!==data.runId)return;
    state.stream=(state.stream||'')+data.delta;
    streamRenderer.push(state.stream);
    show(els.typing,false);show(els.streaming,true);scrollBottom();
  });
  s.addEventListener('ai_error',e=>{const data=JSON.parse(e.data);if(data.runId!==state.aiRunId)return;if(state.stream){streamRenderer.flush();$('#streamNotice').textContent='回复已中断';show($('#stopReply'),false);show(els.typing,false);}else clearStream();if(!data.requestedBy?.id||data.requestedBy.id===state.me?.id)toast(data.message||'AI 模型暂时不可用');});
  s.addEventListener('persona_updated',()=>toast('管理员更新了 AI 人格，下一次回复起生效'));
  s.onerror=()=>setConnection(false);
}
async function refreshMissedMessages() {
  try {
    let after=state.messages.reduce((max,m)=>Math.max(max,m.id),0);
    if (!after) {
      const recent=await api('/api/messages?limit=100');
      recent.messages.forEach(m=>appendMessage(m,{announce:false}));
      return;
    }
    for (let page=0;page<40;page++) {
      const result=await api(`/api/messages?after=${after}&limit=100`);
      result.messages.forEach(m=>appendMessage(m,{announce:false}));
      if (result.messages.length<100) break;
      after=result.messages[result.messages.length-1].id;
    }
  }catch(e){if(e.status===401)resetToLogin();}
}
async function loadHistory() {
  if (!state.hasMore) return;
  const first=state.messages.length ? Math.min(...state.messages.map(m=>m.id)) : undefined;
  try {
    const payload=await api(`/api/messages?limit=50${first?`&before=${first}`:''}`);
    const currentHeight=els.chatScroll.scrollHeight;
    payload.messages.slice().reverse().forEach(m=>appendMessage(m,{prepend:true}));
    state.hasMore=payload.messages.length>=50;
    show(els.loadMore,state.hasMore);
    requestAnimationFrame(()=>{els.chatScroll.scrollTop+=els.chatScroll.scrollHeight-currentHeight;});
  } catch(e){toast(e.message);}
}
function resetToLogin() {
  memberSettings.close();joinManagement.close();groupManagement.close();mediaComposer.clear();voice.cancel();stopSpeaking();
  adminConsole.setUser(null);show($('#adminConsoleOpen'),false);
  state.eventSource?.close();state.eventSource=null;state.me=null;notifyHouse({type:'bluehaven:chat:signed-out'});
  state.messages=[];state.messageIds.clear();els.messages.replaceChildren();
  show(els.authOverlay,true);clearStream();setConnection(false);
}
async function startSession() {
  try {
    const [config,boot]=await Promise.all([api('/api/config'),api('/api/bootstrap')]);
    state.profile=config.profile;state.aiMode=config.aiMode;state.trigger=config.aiTriggerMode;state.ttsServer=config.tts.server;
    updateMe(boot.me);$('#voiceInput').disabled=!config.speech?.asr;$('#voiceInput').title=config.speech?.asr?'录音并转写为文字':'管理员尚未配置语音输入';
    state.members=boot.members;state.onlineUserIds=boot.presence.onlineUserIds;
    renderMembers();renderProfile();renderMemory(boot.memory||config.memory);
    els.messages.replaceChildren();state.messages=[];state.messageIds.clear();
    boot.messages.forEach(m=>appendMessage(m,{announce:false}));
    state.hasMore=boot.messages.length>=65;show(els.loadMore,state.hasMore);
    show(els.authOverlay,false);
    listenRealtime();scrollBottom(true);
    notifyHouse({type:'bluehaven:chat:mode',mode:state.aiMode});
    if(pendingHouseMessage){const text=pendingHouseMessage;pendingHouseMessage='';els.messageInput.value=text;await sendMessage();}
  } catch(e) {
    if(e.status!==401)toast(e.message);
    resetToLogin();
    try {const config=await api('/api/config');state.profile=config.profile;state.aiMode=config.aiMode;renderProfile();renderMemory(config.memory);}catch{}
  }
}
function setAuthMode(register) {
  state.register=register;
  $('#loginTab').classList.toggle('selected',!register);$('#registerTab').classList.toggle('selected',register);
  show($('#displayNameGroup'),register);show($('#joinNoteGroup'),register);void loadJoinPolicy();
  els.authDisplayName.required=register;
  els.authPassword.autocomplete=register?'new-password':'current-password';
  $('#authSubmit').textContent=register?'创建账号并进入 →':'进入聊天室 →';
  els.authError.textContent='';
}
async function loadJoinPolicy(){
 try{
  const {policy}=await api('/api/join-policy');
  if(state.register)$('#authSubmit').textContent=policy.mode==='direct'?'加入空间 →':policy.mode==='question'&&policy.answerMode==='fixed'?'验证答案并加入 →':'提交入群申请 →';
  const question=state.register&&policy.mode==='question';
  show($('#joinQuestionGroup'),question);
  $('#joinQuestion').textContent=policy.question;
  $('#joinAnswer').required=question;
  show($('#joinNoteGroup'),state.register&&policy.mode!=='direct');
 }catch{show($('#joinQuestionGroup'),false);$('#joinAnswer').required=false;}
}
async function submitAuth(event) {
  event.preventDefault();
  const button=$('#authSubmit');button.disabled=true;
  els.authError.textContent='';
  try {
    const url=state.register?'/api/auth/register':'/api/auth/login';
    const body={username:els.authUsername.value.trim(),password:els.authPassword.value};
    if(state.register){body.displayName=els.authDisplayName.value.trim();body.answer=$('#joinAnswer').value;body.note=$('#joinNote').value;}
    const result=await api(url,{method:'POST',body});if(result.membership&&result.membership!=='approved'){els.authError.textContent=result.message;return;}
    await startSession();els.authPassword.value='';
  } catch(e){els.authError.textContent=e.message;}
  finally{button.disabled=false;}
}
async function sendMessage(e) {
  e?.preventDefault();
  if(state.sending||!state.me)return;if(voice.busy)return toast('请先结束语音输入');if(isMuted())return toast('禁言期间不能发言');
  const content=els.messageInput.value.trim(),attachments=mediaComposer.ids;if(!content&&!attachments.length)return;if(mediaComposer.busy||mediaComposer.hasErrors)return toast('请等待附件处理完成，或移除失败的附件');
  state.sending=true;els.sendButton.disabled=true;mediaComposer.freeze(true);
  const clientId=crypto.randomUUID();
  try {
    const result=await api('/api/messages',{method:'POST',body:{content,clientId,attachments}});
    els.messageInput.value='';sizeInput();mediaComposer.clear();
    appendMessage(result.message);scrollBottom(true);if(result.actions?.length)toast('已安排角色动作');
  }catch(err){toast(`发送失败：${err.message}`);}
  finally{state.sending=false;mediaComposer.freeze(false);els.sendButton.disabled=isMuted();if(innerWidth>720)els.messageInput.focus({preventScroll:true});}
}
function stopSpeaking(){state.speechGeneration=(state.speechGeneration||0)+1;state.speechController?.abort();state.speechController=null;if(state.currentAudio){state.currentAudio.pause();URL.revokeObjectURL(state.currentAudio.src);state.currentAudio=null;}window.speechSynthesis?.cancel();state.speakingId=null;paintSpeaking();}
function paintSpeaking(){for(const button of document.querySelectorAll('.speak-button')){const selected=Number(button.closest('[data-id]')?.dataset.id)===state.speakingId;button.textContent=selected?'停止朗读':'朗读';button.setAttribute('aria-pressed',String(selected));}}
async function speakAi(message){
 const previous=state.speakingId;stopSpeaking();if(previous===message.id)return;const generation=state.speechGeneration;state.speakingId=message.id;paintSpeaking();
 try{
  if(state.preferServerTts&&state.ttsServer){const controller=new AbortController();state.speechController=controller;const response=await api('/api/tts',{method:'POST',body:{messageId:message.id},signal:controller.signal});const blob=await response.blob();if(generation!==state.speechGeneration)return;const url=URL.createObjectURL(blob),audio=new Audio(url);state.currentAudio=audio;const finish=()=>{URL.revokeObjectURL(url);if(generation===state.speechGeneration){state.currentAudio=null;state.speakingId=null;paintSpeaking();}};audio.onended=audio.onerror=finish;await audio.play();return;}
  if(!('speechSynthesis' in window))throw Error('当前浏览器无法朗读');
  const plain=document.createElement('div');renderMessageBody(plain,{content:message.content});plain.querySelectorAll('pre,.code-toolbar').forEach(el=>el.remove());for(const el of plain.querySelectorAll('p,li,h1,h2,h3,tr'))el.append(document.createTextNode('。'));
  const utterance=new SpeechSynthesisUtterance(plain.textContent);utterance.lang='zh-CN';utterance.rate=1;utterance.pitch=1.05;utterance.onend=utterance.onerror=()=>{if(generation===state.speechGeneration){state.speakingId=null;paintSpeaking();}};window.speechSynthesis.speak(utterance);
 }catch(error){if(generation===state.speechGeneration){stopSpeaking();if(error.name!=='AbortError')toast('语音播放失败：'+error.message);}}
}
async function editPersona() {
  $('#accountPopover').classList.add('hidden');
  try {
    const data=await api('/api/admin/persona');
    $('#personaText').value=data.persona;
    $('#personaStatus').textContent='';
    $('#personaDialog').showModal();
  }catch(e){toast(e.message);}
}
async function savePersona() {
  const button=$('#savePersona');button.disabled=true;
  try {
    await api('/api/admin/persona',{method:'PUT',body:{persona:$('#personaText').value}});
    $('#personaDialog').close();toast('AI 人格已保存，后续回复将使用新提示词');
  }catch(e){$('#personaStatus').textContent=e.message;}
  finally{button.disabled=false;}
}
function wire() {
  els.messageInput.addEventListener('input',sizeInput);
  $('#stopReply').onclick=async()=>{try{await api('/api/ai/stop',{method:'POST',body:{runId:state.aiRunId}});}catch(error){toast(error.message);}};
  $('#newMessageJump').onclick=()=>{scrollBottom(true);show($('#newMessageJump'),false);};
  els.chatScroll.addEventListener('scroll',()=>show($('#newMessageJump'),!isNearBottom()),{passive:true});
  $('#loginTab').addEventListener('click',()=>setAuthMode(false));
  $('#registerTab').addEventListener('click',()=>setAuthMode(true));
  els.authForm.addEventListener('submit',submitAuth);
  $('#composer').addEventListener('submit',sendMessage);
  els.messageInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}
  });
  $('#autoSpeak').addEventListener('change',e=>state.autoSpeak=e.target.checked);
  $('#preferServerTts').addEventListener('change',e=>state.preferServerTts=e.target.checked);
  $('#accountMenu').addEventListener('click',()=>$('#accountPopover').classList.toggle('hidden'));
  $('#logoutButton').addEventListener('click',async()=>{
    try {await api('/api/auth/logout',{method:'POST'});}catch{}
    $('#accountPopover').classList.add('hidden');resetToLogin();
  });
  $('#groupManage').onclick=()=>{show($('#accountPopover'),false);groupManagement.open();};
  $('#myProfileOpen').onclick=()=>{show($('#accountPopover'),false);void memberSettings.open();};$('#joinManage').onclick=()=>{show($('#accountPopover'),false);void joinManagement.open();};
  $('#personaManage').addEventListener('click',editPersona);
  $('#savePersona').addEventListener('click',savePersona);
  document.addEventListener('click',e=>{if(!e.target.closest('#accountMenu,#accountPopover'))$('#accountPopover').classList.add('hidden');});
  $('#adminConsoleOpen').addEventListener('click',()=>adminConsole.open());
  els.loadMore.addEventListener('click',loadHistory);
  window.addEventListener('beforeunload',()=>{state.eventSource?.close();stopSpeaking();});
}
let pendingHouseMessage='';
function notifyHouse(data){if(window.parent!==window)window.parent.postMessage(data,location.origin);}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='bluehaven:chat:compose')return;
 const text=event.data.text;if(typeof text!=='string'||!text.trim()||text.length>2000)return;
 if(!state.me){pendingHouseMessage=text;toast('请先登录，登录后会发送这条消息');return;}
 if(state.sending){toast('上一条消息正在发送，请稍后重试');return;}
 els.messageInput.value=text;void sendMessage();
});
wire();setAuthMode(false);notifyHouse({type:'bluehaven:chat:ready'});startSession();
