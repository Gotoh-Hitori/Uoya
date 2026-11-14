/* Shared designed select control; native select remains the form/data source. */
(()=>{
const controls=new WeakMap();let sequence=0,opened=null;
const chevron='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function enhance(select){
 if(controls.has(select)||select.multiple||select.size>1)return;
 const wrap=document.createElement('span');wrap.className='uoya-select';
 const button=document.createElement('button');button.type='button';button.className='uoya-select-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
 const label=document.createElement('span');label.className='uoya-select-value';button.append(label);button.insertAdjacentHTML('beforeend',chevron);
 const list=document.createElement('div');list.className='uoya-select-menu';list.id='uoya-select-'+(++sequence);list.setAttribute('role','listbox');list.setAttribute('popover','manual');button.setAttribute('aria-controls',list.id);
 select.before(wrap);wrap.append(select,button);select.classList.add('uoya-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
 let active=-1,search='',searchTimer,rows=[];
 const disabled=()=>select.matches(':disabled');
 function sync(){
  if(label.textContent!==(select.selectedOptions[0]?.textContent||'请选择'))label.textContent=select.selectedOptions[0]?.textContent||'请选择';
  button.disabled=disabled();wrap.hidden=select.hidden;button.setAttribute('aria-required',String(select.required));
  const name=select.getAttribute('aria-label')||Array.from(select.labels||[]).map(x=>Array.from(x.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()).filter(Boolean).join(' ')||'选择选项';
  if(button.getAttribute('aria-label')!==name)button.setAttribute('aria-label',name);
  if(disabled()&&opened===control)close(false);
 }
 function position(){
  if(!button.isConnected||!button.getClientRects().length)return close(false);
  const rect=button.getBoundingClientRect(),viewport=window.visualViewport,vh=viewport?.height||innerHeight,vw=viewport?.width||innerWidth,offset=viewport?.offsetTop||0;
  const width=Math.min(Math.max(rect.width,150),vw-16),below=vh+offset-rect.bottom-8,above=rect.top-offset-8,up=below<160&&above>below;
  list.style.width=width+'px';list.style.left=Math.max(8,Math.min(rect.left,vw-width-8))+'px';list.style.maxHeight=Math.max(80,Math.min(280,up?above:below))+'px';
  list.style.top=(up?Math.max(offset+8,rect.top-6-Math.min(list.scrollHeight,280,above)):rect.bottom+6)+'px';
 }
 function highlight(index){
  const options=Array.from(select.options);if(!options.length)return;active=index;
  rows.forEach((row,i)=>row.classList.toggle('is-active',i===active));const row=rows[active];if(row){button.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'});}
 }
 function step(delta){
  const options=Array.from(select.options);for(let n=1;n<=options.length;n++){const i=(active+delta*n+options.length)%options.length;if(!options[i].disabled&&!options[i].parentElement.disabled){highlight(i);break;}}
 }
 function choose(index){
  const option=select.options[index];if(!option||option.disabled||option.parentElement.disabled)return;
  select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));close(true);
 }
 function open(){
  if(disabled())return;if(opened)opened.close(false);sync();rows=[];list.replaceChildren();
  for(const [i,option]of Array.from(select.options).entries()){
   const row=document.createElement('div');row.className='uoya-select-option';row.id=list.id+'-'+i;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled||!!option.parentElement.disabled));row.textContent=option.textContent;
   if(option.selected)row.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
   row.addEventListener('pointerdown',e=>e.preventDefault());row.addEventListener('click',()=>choose(i));row.addEventListener('pointermove',()=>highlight(i));rows.push(row);list.append(row);
  }
  const host=select.closest('dialog')||document.body;host.append(list);list.hidden=false;button.setAttribute('aria-expanded','true');opened=control;
  if(typeof list.showPopover==='function')list.showPopover();position();highlight(select.selectedIndex);button.focus();
 }
 function close(focus){if(typeof list.hidePopover==='function'&&list.matches(':popover-open'))list.hidePopover();list.remove();button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');if(opened===control)opened=null;if(focus&&button.isConnected)button.focus();}
 const control={sync,close,position,button,list};controls.set(select,control);
 button.addEventListener('click',()=>opened===control?close(false):open());
 button.addEventListener('keydown',e=>{
  if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape')return close(true);if(e.key==='Enter'||e.key===' '){if(opened===control)choose(active);else open();return;}if(opened!==control)open();if(e.key==='ArrowDown')step(1);if(e.key==='ArrowUp')step(-1);if(e.key==='Home'){active=-1;step(1);}if(e.key==='End'){active=0;step(-1);}return;}
  if(e.key==='Tab')close(false);
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){search+=e.key.toLocaleLowerCase();clearTimeout(searchTimer);searchTimer=setTimeout(()=>search='',700);const index=Array.from(select.options).findIndex(o=>!o.disabled&&o.textContent.trim().toLocaleLowerCase().startsWith(search));if(index>=0){if(opened!==control)open();highlight(index);}}
 });
 select.addEventListener('change',sync);select.addEventListener('input',sync);select.addEventListener('invalid',e=>{e.preventDefault();button.setAttribute('aria-invalid','true');button.focus();});
 button.addEventListener('blur',()=>queueMicrotask(()=>{if(!list.contains(document.activeElement))close(false);}));
 select.form?.addEventListener('reset',()=>setTimeout(sync));
 for(const property of ['value','selectedIndex']){const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,property);Object.defineProperty(select,property,{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);sync();}});}
 new MutationObserver(()=>{sync();if(opened===control){close(false);open();}}).observe(select,{subtree:true,childList:true,characterData:true,attributes:true});
 sync();
}
function scan(root){if(root.nodeType!==1&&root.nodeType!==9)return;if(root.matches?.('select'))enhance(root);root.querySelectorAll('select').forEach(enhance);}
function init(){
 scan(document);new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes)scan(node);}if(opened&&!opened.button.isConnected)opened.close(false);}).observe(document.body,{subtree:true,childList:true});
 document.addEventListener('pointerdown',e=>{if(opened&&!opened.button.contains(e.target)&&!opened.list.contains(e.target))opened.close(false);},true);
 document.addEventListener('scroll',()=>opened?.position(),true);window.addEventListener('resize',()=>opened?.position());window.visualViewport?.addEventListener('resize',()=>opened?.position());document.addEventListener('close',()=>opened?.close(false),true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();