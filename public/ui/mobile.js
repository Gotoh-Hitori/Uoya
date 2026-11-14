/* Mobile panels and the iOS visual viewport, independent of the 3D runtime. */
(()=>{
 function init(){
 const bar=document.createElement('nav');bar.className='mobile-tools';bar.setAttribute('aria-label','住宅工具');
 bar.innerHTML='<button type="button" data-panel="status" aria-expanded="false" aria-controls="mobile-avatar-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 19v-5m7 5V5m7 14V9" stroke-linecap="round"/></svg>状态</button><button type="button" data-panel="lights" aria-expanded="false" aria-controls="mobile-lighting"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></svg>灯光</button>';
 document.querySelector('.stage').append(bar);
 document.querySelector('.right-column').id='mobile-lighting';
 const syncStatus=()=>{const panel=document.querySelector('.avatar-life');if(panel)panel.id='mobile-avatar-status';};
 function close(){delete document.body.dataset.mobilePanel;bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded','false'));}
 bar.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;syncStatus();const next=button.dataset.panel,isOpen=document.body.dataset.mobilePanel===next;close();if(!isOpen){document.body.dataset.mobilePanel=next;button.setAttribute('aria-expanded','true');}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.querySelector('#world').addEventListener('pointerdown',close);
 const mobile=matchMedia('(max-width:700px)');mobile.addEventListener('change',()=>{close();resize();});
 function resize(){if(!mobile.matches)return;const viewport=window.visualViewport;const keyboard=viewport&&viewport.height<window.innerHeight-100&&document.activeElement?.matches('input,textarea');document.body.toggleAttribute('data-mobile-keyboard',!!keyboard);document.querySelector('.application').style.height=keyboard?viewport.height+'px':'';}
 window.visualViewport?.addEventListener('resize',resize);document.addEventListener('focusout',()=>setTimeout(resize,150));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();