import {randomUUID} from 'node:crypto';
// This module must ONLY be instantiated in your trusted AI worker, not mounted as a public HTTP route.
export const AI_TOOL_DEFINITIONS=[
  {type:'function',function:{name:'life_get_state',description:'查询AI自己的心情、饱食度、无聊度、补水度、自己的钱包金币、物品库存和采购预算。',parameters:{type:'object',properties:{},additionalProperties:false}}},
  {type:'function',function:{name:'life_get_shop',description:'查询可用商品和各自的金币价格、效果。',parameters:{type:'object',properties:{},additionalProperties:false}}},
  {type:'function',function:{name:'life_buy_item',description:'AI使用自己钱包的金币购买一件商店商品。受服务端预算、金币余额及品类规则保护。',parameters:{type:'object',properties:{itemId:{type:'string'},quantity:{type:'integer',minimum:1,maximum:2}},required:['itemId'],additionalProperties:false}}},
  {type:'function',function:{name:'life_use_item',description:'AI使用自己拥有的食物/饮料/零食或玩具，影响生活状态。',parameters:{type:'object',properties:{itemId:{type:'string'}},required:['itemId'],additionalProperties:false}}},
];
export function createAiLifeToolExecutor(engine) {
  return async function executeAiTool(name,args={},context={}) {
    switch(name){
      case 'life_get_state':return {state:engine.getAccount('ai:starry'),policy:engine.getAiPolicy()};
      case 'life_get_shop':return {items:engine.catalog()};
      case 'life_buy_item':return engine.purchase({accountId:'ai:starry',actorType:'ai',itemId:args.itemId,quantity:args.quantity??1,requestId:context.requestId||randomUUID()});
      case 'life_use_item':return engine.use({accountId:'ai:starry',actorType:'ai',itemId:args.itemId,requestId:context.requestId||randomUUID()});
      default:throw new Error('Unsupported AI tool');
    }
  };
}
