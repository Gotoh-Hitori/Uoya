import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createDB } from '../src/db.mjs';
import { createAiWorker, requestTts } from '../src/ai.mjs';

await test('AI_MODE=api 真正调用 OpenAI-compatible SSE 服务器；服务端 TTS 适配器能取回音频字节', async () => {
  let receivedAi;
  let receivedTts;
  const upstream=http.createServer(async(req,res)=>{
    let body='';for await(const buf of req)body+=buf.toString();
    assert.equal(req.headers.authorization,'Bearer upstream-test-key');
    if(req.url==='/v1/chat/completions') {
      receivedAi=JSON.parse(body);
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      res.write('data: {"choices":[{"delta":{"content":"欢迎来到"}}]}\n\n');
      await delay(25);
      res.write('data: {"choices":[{"delta":{"content":"共享客厅！"}}]}\n\n');
      res.end('data: [DONE]\n\n');return;
    }
    if(req.url==='/v1/audio/speech') {
      receivedTts=JSON.parse(body);
      res.writeHead(200,{'Content-Type':'audio/mpeg'});
      res.end(Buffer.from('ID3mockaudio'));return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const addr=`http://127.0.0.1:${upstream.address().port}/v1`;
  const db=createDB(':memory:');
  const user=db.register({username:'alice',displayName:'小明',password:'abc1234567'});
  const events=[];
  const ai=createAiWorker({db,config:{aiMode:'api',aiBaseUrl:addr,aiApiKey:'upstream-test-key',aiModel:'demo',aiTimeoutMs:5000,aiMaxOutputTokens:64,aiName:'星澜',aiTriggerMode:'auto'},broadcast:(event,data)=>events.push({event,data}),readPersona:()=> '你是一个可爱的群聊 AI 星澜'});
  try {
    const {message}=db.addHumanMessage(user.id,'介绍一下你自己','client-id-1234');
    ai.notifyHuman(message);
    for(let i=0;i<70;i++){
      if(db.getMessages({limit:5}).some(m=>m.role==='ai'))break;
      await delay(50);
    }
    assert.equal(db.getMessages({limit:5}).at(-1).content,'欢迎来到共享客厅！');
    assert.equal(receivedAi.model,'demo');assert.equal(receivedAi.stream,true);
    assert.equal(receivedAi.messages.at(-1).role,'user');
    assert.ok(receivedAi.messages.at(-1).content.includes('小明'));
    assert.equal(events.filter(e=>e.event==='ai_delta').length,2);
    assert.equal(events.filter(e=>e.event==='message').length,1);
    const sound=await requestTts({ttsEnabled:true,ttsUrl:addr+'/audio/speech',ttsApiKey:'upstream-test-key',ttsModel:'voice-model',ttsVoice:'alloy'},'你好大家');
    assert.equal(sound.toString(),'ID3mockaudio');
    assert.equal(receivedTts.model,'voice-model');
    assert.equal(receivedTts.voice,'alloy');
    assert.equal(receivedTts.input,'你好大家');
  } finally {ai.close();db.close();await new Promise(resolve=>upstream.close(resolve));}
});
