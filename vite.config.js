import {defineConfig} from 'vite';
import {createChatProxy,PRIVATE_SERVER_FILES} from './scripts/chat-proxy.mjs';
const proxy={'/social-api':createChatProxy(Number(process.env.CHAT_API_PORT||3001)),'/api':{target:'http://127.0.0.1:8787',changeOrigin:true}};
export default defineConfig({base:'./',optimizeDeps:{noDiscovery:true,include:[]},
 server:{host:'127.0.0.1',port:5173,strictPort:true,proxy,fs:{deny:PRIVATE_SERVER_FILES},watch:{ignored:['**/server/**','**/LongMemory-main/**','**/bluehaven-social-ai-chat-v1.0/**','**/bluehaven-life-economy-v1.0/**']}},preview:{host:'127.0.0.1',proxy}});
