export const START = Object.freeze({ mood:70,satiety:68,boredom:28,hydration:75 });
export const MINUTES_PER_HOUR = 60;
export const DECAY_PER_HOUR = Object.freeze({ mood:-1.2,satiety:-3.8,boredom:3.1,hydration:-4.6 });
export const AI_POLICY = Object.freeze({
  enabled:true,
  maxSingleOrder:90,
  minimumBalanceAfter:20,
  maxQuantityPerOrder:2,
  // open to food, drinks, snacks and toy use; the policy is ALWAYS enforced server-side
  allowedCategories:['food','drink','snack','toy'],
});
export const clamp=(v)=>Math.round(Math.max(0,Math.min(100,v))*100)/100;
export function decayedStats(stats,fromMs,toMs) {
  const hours=Math.max(0,(toMs-fromMs)/3600000);
  return Object.fromEntries(Object.keys(START).map(k=>[k,Math.max(0,Math.min(100,Number(stats[k])+hours*DECAY_PER_HOUR[k]))]));
}
export function applyEffects(stats,effects) {
  return Object.fromEntries(Object.keys(START).map(k=>[k,clamp(Number(stats[k])+(effects[k]||0))]));
}
export function moodLabel(stats){
  if(stats.satiety<23) return '饿得慌';
  if(stats.hydration<23) return '口渴';
  if(stats.boredom>78) return '无聊透顶';
  if(stats.mood>=82) return '开心';
  if(stats.mood<32) return '低落';
  return '平静';
}
