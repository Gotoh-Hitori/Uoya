import {parseLocalCommand} from '../../../src/agent/controller.mjs';
/** Only clear short imperatives use the deterministic fast path; normal conversation goes to the model. */
export function localIntent(text){const s=String(text).trim();if(s.length>48||/[?？]|不要|不想|别|不能|可以吗|怎么|为什么|买|吃|喝|食用|饮用/.test(s))return null;if(!/^(?:请|帮我|小肥鱼[，, ]*)?(?:去|前往|走到|打开|关闭|开灯|关灯|上床|躺下|坐下|睡觉|停下|停止|洗手|洗澡|\/goto)/.test(s))return null;try{return parseLocalCommand(s);}catch{return null;}}
