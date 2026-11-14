/** Initialize before opening HTTP; never overwrite existing accounts. */
export function initializeAdmin(db,env=process.env){
 if(db.userCount()>0)return;
 const username=env.BOOTSTRAP_ADMIN_USERNAME,password=env.BOOTSTRAP_ADMIN_PASSWORD;
 if(!username&&!password&&env.NODE_ENV==='development'&&['127.0.0.1','::1','localhost'].includes(env.HOST||'127.0.0.1'))return;
 if(!/^[a-zA-Z0-9_]{3,24}$/.test(username||'')||typeof password!=='string'||password.length<12||password.length>128)
  throw Error('Empty database: set BOOTSTRAP_ADMIN_USERNAME (3-24 letters/digits/_) and BOOTSTRAP_ADMIN_PASSWORD (12-128 characters) before production startup');
 db.register({username,displayName:username,password});
}
