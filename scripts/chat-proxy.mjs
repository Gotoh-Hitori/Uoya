export const PRIVATE_SERVER_FILES=['**/.network/**','**/deployment/**','.env','.env.*','*.{crt,pem}','**/.git/**','**/server/**','**/bluehaven-social-ai-chat-v1.0/**','**/*.sqlite','**/*.sqlite-*','**/*.zip','**/LongMemory-main/**','**/bluehaven-life-economy-v1.0/**','**/*.db','**/*.db-*'];
export function createChatProxy(port=3001){
 return {target:'http://127.0.0.1:'+port,changeOrigin:true,cookiePathRewrite:'/social-api/api',
   rewrite:url=>url.replace(/^\/social-api(?=\/)/,''),
   configure(proxy){proxy.on('proxyRes',res=>{if(res.headers['content-type']?.includes('text/event-stream'))res.headers['cache-control']='no-cache, no-transform';});}
 };
}
