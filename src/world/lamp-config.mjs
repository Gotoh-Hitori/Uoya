export const LAMPS=Object.freeze([
 {id:'living-ceiling',name:'客厅吸顶灯',room:'living',x:2.35,z:3.15,base:29,color:'#d3e8ff'},
 {id:'kitchen-ceiling',name:'厨房工作灯',room:'living',x:2.73,z:.96,base:18,color:'#eaf5ff'},
 {id:'bedroom-ceiling',name:'卧室吸顶灯',room:'bedroom',x:7.39,z:2.07,base:24,color:'#ffe8c9'},
 {id:'bathroom-ceiling',name:'卫生间吸顶灯',room:'bathroom',x:7.45,z:4.82,base:20,color:'#e0f5ff'},
 {id:'floor-lamp',name:'客厅落地灯',room:'living',base:12,color:'#ffe0a8',imported:true},
 {id:'bed-lamp',name:'卧室床头灯',room:'bedroom',base:12,color:'#ffe0a8',imported:true},
]);
export const LAMP_IDS=Object.freeze(LAMPS.map(l=>l.id));
