/* SpotlightCard DOM adaptation for Uoya 魚家.
 * Adapted from React Bits, Copyright (c) 2026 David Haz.
 * MIT + Commons Clause — see docs/licenses/react-bits/LICENSE.md.
 * Source: https://github.com/DavidHDev/react-bits/tree/main/src/content/Components/SpotlightCard
 * Changes: event delegation, local blue palette, no React runtime, no idle RAF.
 */
(()=>{
 function init(){
  const stylesheet=document.querySelector('link[data-uoya-surfaces]');if(stylesheet)document.head.append(stylesheet);const mobile=document.querySelector('link[href$="/ui/mobile.css"]');if(mobile)document.head.append(mobile);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
  const selector='.panel,.product-card,.stat-card,.console-metrics>div,.auth-modal';let active=null,frame=0,point=null;
  function clear(){if(active)delete active.dataset.rbActive;active=null;point=null;if(frame)cancelAnimationFrame(frame);frame=0;}
  function light(card,x,y){if(!card||reduce.matches)return clear();if(active!==card){clear();active=card;card.classList.add('rb-surface');if(getComputedStyle(card).position==='static')card.style.position='relative';if(!card.querySelector(':scope>.rb-spotlight')){const glow=document.createElement('span');glow.className='rb-spotlight';glow.setAttribute('aria-hidden','true');card.append(glow);}card.dataset.rbActive='true';}point={x,y};if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!active||!point||!active.isConnected)return clear();const rect=active.getBoundingClientRect();active.style.setProperty('--rb-x',(point.x-rect.left)+'px');active.style.setProperty('--rb-y',(point.y-rect.top)+'px');});}
  document.addEventListener('pointermove',event=>{if(!fine.matches||event.pointerType!=='mouse')return;light(event.target.closest?.(selector),event.clientX,event.clientY);},{passive:true});
  document.addEventListener('focusin',event=>{if(!event.target.matches?.(':focus-visible'))return;const card=event.target.closest(selector);if(card){const rect=event.target.getBoundingClientRect();light(card,rect.left+rect.width/2,rect.top+rect.height/2);}});
  document.addEventListener('focusout',event=>{if(active&&!active.contains(event.relatedTarget))clear();});
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget)clear();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  reduce.addEventListener('change',clear);window.addEventListener('blur',clear);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
