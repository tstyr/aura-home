import worker from '../worker/index.js';
import {getDatabase} from './database.js';
import {createStorage} from './storage.js';
import {isOwner,canAccess,dataUserId,sessionClient,authRoute,signInPage} from './auth.js';
import {verifiedSessionId,registerDevice,publicProfile,accountRoute} from './account.js';
import {localStateScript} from './local-state.js';
import {publicPage} from './public-pages.js';
import {deleteAccountData} from './delete-account.js';
export function sanitizedRequest(request,user,env){
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);
 headers.set('oai-authenticated-user-id',dataUserId(user,env));
 headers.set('oai-authenticated-user-email',user.email);
 return new Request(request,{headers});
}
export function normalizeRequest(request,env){
 const incoming=new URL(request.url),path=incoming.searchParams.get('__aura_path')||incoming.pathname;
 if(!path.startsWith('/')||path.startsWith('//')||path.includes('\\')||/[\u0000-\u001f]/.test(path))throw new Error('Invalid path');
 const url=new URL(env.APP_ORIGIN||incoming.origin);url.pathname=path;url.search=incoming.search;url.searchParams.delete('__aura_path');
 return new Request(url,request);
}
export async function handle(request,env,dependencies={}){
 let normalized;try{normalized=normalizeRequest(request,env)}catch{return new Response('Bad request',{status:400})}
 const url=new URL(normalized.url);
 if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==url.origin)return Response.json({error:'この操作はアプリ内から実行してください。'},{status:403,headers:{'Cache-Control':'no-store'}});
 const publicResponse=publicPage(url.pathname);if(publicResponse&&['GET','HEAD'].includes(request.method))return request.method==='HEAD'?new Response(null,{headers:publicResponse.headers}):publicResponse;
 const ready=['APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','DATABASE_URL'].every(key=>env[key])&&(env.PUBLIC_SIGNUPS==='true'||Boolean(env.OWNER_EMAIL));
 if(!ready)return url.pathname.startsWith('/api/')?Response.json({error:'保存先の初期設定が必要です。'},{status:503,headers:{'Cache-Control':'no-store'}}):signInPage('',503,{setup:true});
 const session=(dependencies.sessionClient||sessionClient)(normalized,env);
 try{
  if(url.pathname==='/'&&url.searchParams.has('error'))return session.finish(signInPage('サインインが完了しませんでした。Googleで続けるを押して、もう一度お試しください。',400,{google:env.GOOGLE_AUTH_ENABLED==='true'}));
  if(url.pathname==='/signin'||url.pathname.startsWith('/auth/'))return session.finish(await authRoute(normalized,env,session));
  const{data,error}=await session.client.auth.getUser();
  if(error?.status>=500||error&&(!error.status||error.status===0))return session.finish(Response.json({error:'認証サーバーに接続できません。もう一度お試しください。'},{status:503}));
  if(!canAccess(data?.user,env)){
   if(data?.user){await session.client.auth.signOut({scope:'local'});session.clear?.()}
   return session.finish(url.pathname.startsWith('/api/')?Response.json({error:'サインインしてください。',code:'sign_in_required'},{status:data?.user?403:401}):new Response(null,{status:303,headers:{Location:'/signin'}}));
  }
  const appEnv={...env,APP_DATA_USER_ID:dataUserId(data.user,env),GOOGLE_REDIRECT_URI:env.GOOGLE_REDIRECT_URI||env.APP_ORIGIN+'/api/google/callback'};
  appEnv.DB=(dependencies.getDatabase||getDatabase)(env).adapter;appEnv.BUCKET=(dependencies.createStorage||createStorage)(env,appEnv.DB);
  const authenticated=sanitizedRequest(normalized,data.user,env);
  const deviceId=await(dependencies.getSessionId||verifiedSessionId)(session,data.user);
  if(!await registerDevice(appEnv.DB,data.user,deviceId,authenticated,{checkAuthSession:!dependencies.getSessionId})){
   await session.client.auth.signOut({scope:'local'});session.clear?.();
   return session.finish(url.pathname.startsWith('/api/')?Response.json({error:'この端末はログアウトされました。再度サインインしてください。',code:'session_revoked'},{status:401}):new Response(null,{status:303,headers:{Location:'/signin'}}));
  }
  appEnv.DELETE_ACCOUNT=()=>((dependencies.deleteAccount||deleteAccountData)(data.user,appEnv));
  appEnv.AUTH_PROFILE=publicProfile(data.user,appEnv,session.loginProvider);
  if(url.pathname==='/session-context.js')return session.finish(new Response(localStateScript(data.user.id,isOwner(data.user,env)),{headers:{'Content-Type':'application/javascript;charset=utf-8'}}));
  if(url.pathname.startsWith('/api/account'))return session.finish(await accountRoute(authenticated,appEnv,session,data.user,deviceId,appEnv.DB));
  return session.finish(await(dependencies.worker||worker).fetch(authenticated,appEnv));
 }catch{return session.finish(Response.json({error:'接続できませんでした。時間をおいて再試行してください。'},{status:503}))}
}
export default{fetch:request=>handle(request,process.env)};
