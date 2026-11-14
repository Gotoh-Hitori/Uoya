// Original Blue Haven catalog. All prices are fictional game coins, not real money.
export const CATALOG = Object.freeze([
  {id:'plain-rice',name:'大白饭',emoji:'🍚',category:'food',price:12,description:'热腾腾的一大碗白米饭，朴实又管饱。',effects:{satiety:38,mood:4,hydration:-2},uses:1},
  {id:'egg-rice',name:'蛋炒饭',emoji:'🍳',category:'food',price:23,description:'香喷喷的炒饭，饱足感十足。',effects:{satiety:47,mood:8,hydration:-3},uses:1},
  {id:'ramen',name:'热汤面',emoji:'🍜',category:'food',price:26,description:'温暖的汤面，稍微赶走疲惫。',effects:{satiety:42,mood:7,hydration:8},uses:1},
  {id:'curry',name:'咖喱饭',emoji:'🍛',category:'food',price:29,description:'浓香咖喱搭配米饭。',effects:{satiety:54,mood:10,hydration:-4},uses:1},
  {id:'sandwich',name:'三明治',emoji:'🥪',category:'food',price:17,description:'简单快速的轻食。',effects:{satiety:27,mood:4},uses:1},
  {id:'water',name:'矿泉水',emoji:'💧',category:'drink',price:6,description:'清爽补水。',effects:{hydration:35,mood:1},uses:1},
  {id:'milk',name:'牛奶',emoji:'🥛',category:'drink',price:10,description:'一杯温和的牛奶。',effects:{hydration:22,satiety:8,mood:3},uses:1},
  {id:'tea',name:'蜜桃茶',emoji:'🍑',category:'drink',price:13,description:'甜甜的果茶。',effects:{hydration:24,mood:7},uses:1},
  {id:'cola',name:'汽水',emoji:'🥤',category:'drink',price:14,description:'气泡令人开心。',effects:{hydration:14,mood:10},uses:1},
  {id:'cookies',name:'曲奇饼干',emoji:'🍪',category:'snack',price:8,description:'小小的甜点。',effects:{satiety:10,mood:6,boredom:-2},uses:1},
  {id:'chips',name:'薯片',emoji:'🥔',category:'snack',price:12,description:'咔滋咔滋的脆感。',effects:{satiety:12,mood:7,boredom:-4},uses:1},
  {id:'chocolate',name:'巧克力',emoji:'🍫',category:'snack',price:15,description:'一点点甜蜜。',effects:{satiety:7,mood:12},uses:1},
  {id:'pudding',name:'布丁',emoji:'🍮',category:'snack',price:16,description:'软软甜甜。',effects:{satiety:13,mood:10},uses:1},
  {id:'rubber-duck',name:'小黄鸭',emoji:'🐤',category:'toy',price:29,description:'可以反复摆弄的可爱小鸭。',effects:{mood:6,boredom:-12},uses:9,cooldownSec:45},
  {id:'squishy',name:'捏捏乐',emoji:'🫧',category:'toy',price:24,description:'挤压缓解无聊。',effects:{mood:5,boredom:-9},uses:12,cooldownSec:40},
  {id:'plush-bear',name:'毛绒小熊',emoji:'🧸',category:'toy',price:65,description:'柔软又安心的小伙伴。',effects:{mood:12,boredom:-14},uses:18,cooldownSec:90},
  {id:'puzzle',name:'拼图盒',emoji:'🧩',category:'toy',price:49,description:'认真拼一会儿，时间就过去了。',effects:{mood:7,boredom:-20,satiety:-3},uses:15,cooldownSec:75},
  {id:'mini-robot',name:'迷你机器人',emoji:'🤖',category:'toy',price:88,description:'会摇头的桌面机器人。',effects:{mood:15,boredom:-23},uses:24,cooldownSec:110},
  {id:'handheld',name:'掌上小游戏机',emoji:'🎮',category:'toy',price:119,description:'可反复玩耍的小游戏。',effects:{mood:12,boredom:-26,satiety:-5},uses:30,cooldownSec:120},
]);
export const ITEM_MAP = new Map(CATALOG.map(item=>[item.id,item]));
export const CATEGORIES = Object.freeze({food:'食物',drink:'饮料',snack:'零食',toy:'小玩具'});
export function cleanCatalog(){return CATALOG.map(item=>({...item,effects:{...item.effects}}));}
