export function createFileUpload(input){
 const wrapper=document.createElement('span');wrapper.className='uoya-file-picker';const action=document.createElement('span');action.className='uoya-file-action';action.textContent='↥ 上传图片';const filename=document.createElement('span');filename.className='uoya-file-name';filename.setAttribute('aria-live','polite');input.before(wrapper);wrapper.append(input,action,filename);input.setAttribute('aria-label','上传头像图片');
 const reset=()=>{input.value='';filename.textContent='PNG / JPEG / WebP · 10 MB 内';filename.title='';};
 input.addEventListener('change',()=>{const name=input.files?.[0]?.name;if(name){filename.textContent=name;filename.title=name;}});input.form?.addEventListener('reset',reset);reset();return {reset};
}
