import {ITEM_MAP} from './catalog.mjs';
export function buildLifeContext(engine,aiName='AI'){
  const s=engine.getAccount('ai:starry');
  const p=engine.getAiPolicy();
  const i=s.inventory.map(x=>`${x.name}：${x.units} 件，剩余 ${x.usesLeft} 次`).join('；')||'暂无';
  return [
    `你是共享聊天室中的 AI 角色${aiName}。以下状态是游戏角色模拟数值，不是现实生理或感情状态。`,
    `当前模拟状态：心情 ${s.stats.mood}/100，饱食度 ${s.stats.satiety}/100，无聊度 ${s.stats.boredom}/100，补水度 ${s.stats.hydration}/100。`,
    `你的独立钱包金币：${s.coins}；无每日消费上限，单次购买上限 ${p.maxSingleOrder} 金币。`,
    `物品库存：${i}。`,
    '只有在与当前对话/游戏需要有关时才提及状态；不要机械地每轮报告数值。',
    '你与每位玩家的钱包、背包和生活状态均独立。你只能花自己的金币；玩家可通过爆金币给你转账。你可以通过 life_get_shop、life_buy_item、life_use_item 进行购买和使用，但不要为了花钱而花钱。',
    '没有足够金币、受余额、单次购买或冷却限制时应接受工具返回的结果；禁止建议直接修改数据库、伪造金币或绕过限制。',
    '大白饭是一种朴素实惠的主食；想填饱肚子时可以考虑它。',
  ].join('\n');
}
export function lifeEventToMemory(event){
  if(event?.type==='furniture'&&event.accountId==='ai:starry')return 'AI在住宅中完成了'+String(event.payload.label||event.payload.furnitureId)+'。';
  if(!event||!['purchase','use'].includes(event.type))return null;
  const item=ITEM_MAP.get(event.payload.itemId)||(event.payload.itemName?{name:event.payload.itemName}:null);
  if(!item)return null;
  if(event.type==='purchase')return `${event.accountId==='ai:starry'?'AI':'一位用户'}在虚拟商店购买了 ${item.name} ×${event.payload.quantity}。`;
  return `${event.accountId==='ai:starry'?'AI':'一位用户'}在虚拟世界使用了 ${item.name}。`;
}
