import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const isOwner=(user,env)=>Boolean(user?.email&&user.email_confirmed_at&&user.email.toLowerCase()===env.OWNER_EMAIL?.trim().toLowerCase());
export const canAccess=(user,env)=>Boolean(user?.id&&user.email&&user.email_confirmed_at&&(env.PUBLIC_SIGNUPS==='true'||isOwner(user,env)));
export const dataUserId=(user,env)=>isOwner(user,env)&&env.APP_DATA_USER_ID?env.APP_DATA_USER_ID:user.id;
// Preserve Origin on native HTML form POSTs while omitting URL paths and query tokens.
export function sessionClient(request,env){
 const cookies=new Map(),incoming=new Map(parseCookieHeader(request.headers.get('cookie')||'').map(c=>[c.name,c]));
 const client=createServerClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{
  cookieOptions:{httpOnly:true,secure:new URL(env.APP_ORIGIN).protocol==='https:',sameSite:'lax',path:'/'},
  cookies:{getAll:()=>[...incoming.values()],setAll:values=>{for(const cookie of values){incoming.set(cookie.name,{name:cookie.name,value:cookie.value});cookies.set(cookie.name,serializeCookieHeader(cookie.name,cookie.value,cookie.options))}}}
 });
 return{client,clear(){const names=new Set([...incoming.keys(),...cookies.keys()].filter(name=>name.startsWith('sb-')));cookies.clear();for(const name of names){incoming.delete(name);cookies.set(name,serializeCookieHeader(name,'',{path:'/',maxAge:0,httpOnly:true,secure:new URL(env.APP_ORIGIN).protocol==='https:',sameSite:'lax'}))}},finish(response){const headers=new Headers(response.headers);for(const cookie of cookies.values())headers.append('Set-Cookie',cookie);headers.set('Cache-Control','private, no-store');headers.set('Vary','Cookie');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin');return new Response(response.body,{status:response.status,headers})}};
}
export function signInPage(message='',status=200,{google=false,setup=false,logout=false,confirmation=''}={}){
 const nonce=crypto.randomUUID().replaceAll('-','');
 const content=setup?'<h1>初期設定を準備中</h1><p>保存先とアカウント設定が完了すると利用できます。</p>':confirmation?`<h1>サインインを続ける</h1><form method="post" action="/auth/confirm"><input name="token_hash" type="hidden" value="${escape(confirmation)}"><button>サインイン</button></form>`:`<h1>${google?'Aura Homeへようこそ':'サインイン'}</h1>${google?'<p>Googleアカウントで続けてください。初回も同じボタンから利用を始められます。</p><form method="post" action="/auth/google"><button><span aria-hidden="true" class="google-mark">G</span>Googleで続ける</button></form><p>Googleアカウントで利用できます。</p><details><summary>メールで続ける</summary>':''}<p>メールアドレスで続けることもできます。</p><form method="post" action="/auth/email"><label for="email">メールアドレス</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"><button>確認メールを送信</button></form><details><summary>確認コードでサインイン</summary><form method="post" action="/auth/verify"><label for="verify-email">メールアドレス</label><input id="verify-email" name="email" type="email" autocomplete="email" required maxlength="254"><label for="token">確認コード</label><input id="token" name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required maxlength="10"><button>サインイン</button></form></details>${google?'</details>':''}`;
 return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>サインイン</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#383838;color:#fff;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;min-height:100dvh;place-items:center;padding:24px}main{width:min(100%,420px);padding:32px;background:#ffffff0b;border:1px solid #ffffff16;border-radius:28px}h1{font-size:28px;margin:0 0 16px}p{line-height:1.7;color:#ddd}label{display:block;margin-top:20px}input,button{width:100%;font:inherit;border:0;border-radius:14px;padding:15px;margin-top:10px}input{background:#ffffff13;color:#fff;outline-offset:4px}button{background:#eee;color:#222;font-weight:700;cursor:pointer}.secondary{background:#ffffff1a;color:#fff}.google-mark{color:#4285f4;margin-right:10px}details{margin-top:24px}summary{cursor:pointer}#notice:empty{display:none}</style><main>${content}<p id="notice" role="status">${escape(message)}</p><p><a href="/about" style="color:inherit">Aura Homeについて</a> · <a href="/privacy" style="color:inherit">プライバシー</a> · <a href="/terms" style="color:inherit">利用について</a></p></main>${logout?`<script nonce="${nonce}">(async()=>{localStorage.clear();sessionStorage.clear();await Promise.allSettled((await caches.keys()).map(k=>caches.delete(k)));for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister()})().catch(()=>{})</script>`:''}</html>`,{status,headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,...(logout?{'Clear-Site-Data':'"cache", "storage"'}:{})}});
}
const redirect=()=>new Response(null,{status:303,headers:{Location:'/'}});
export function oauthRedirectPage(destination){
 const nonce=crypto.randomUUID().replaceAll('-',''),literal=JSON.stringify(destination).replaceAll('<','\\u003c');
 return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Googleで続ける</title><style nonce="${nonce}">body{background:#383838;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;margin:0;padding:24px}main{max-width:420px}a{color:#fff;display:inline-block;padding:16px;border:1px solid #ffffff40;border-radius:14px}</style><main><p>Googleの認証画面を開いています…</p><a href="${escape(destination)}">Googleの画面へ進む</a></main><script nonce="${nonce}">location.replace(${literal})</script></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private,no-store','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}});
}
export async function authRoute(request,env,session){
 const page=(message='',status=200,options={})=>signInPage(message,status,{google:env.GOOGLE_AUTH_ENABLED==='true',...options});
 const path=new URL(request.url).pathname;
 if(path==='/signin'){const{data}=await session.client.auth.getUser();if(canAccess(data?.user,env))return redirect();return page(new URL(request.url).searchParams.get('account_deleted')==='1'?'アカウントを削除しました。':'')}
 if(path==='/auth/confirm'&&request.method==='GET'){const token=new URL(request.url).searchParams.get('token_hash')||'';return /^[a-zA-Z0-9_-]{16,256}$/.test(token)?page('',200,{confirmation:token}):page('リンクが無効です。メールを再送してください。',400)}
 if(path==='/auth/callback'&&request.method==='GET'){
  const code=new URL(request.url).searchParams.get('code');
  if(code&&code.length<4096){const{error}=await session.client.auth.exchangeCodeForSession(code);if(!error){const{data}=await session.client.auth.getUser();if(canAccess(data.user,env))return redirect();await session.client.auth.signOut({scope:'local'});session.clear?.()}}
  return page('サインインできませんでした。このブラウザでGoogleログインをやり直すか、確認メールを再送してください。',400);
 }
 if(request.method!=='POST')return new Response('Not found',{status:404});
 if(Number(request.headers.get('content-length'))>4096)return new Response('Too large',{status:413});
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Unsupported type',{status:415});
 if(path==='/auth/logout'){try{await session.client.auth.signOut({scope:'local'})}catch{}finally{session.clear?.()}return page('サインアウトしました。',200,{logout:true})}
 if(['/auth/google','/auth/google/switch'].includes(path)&&env.GOOGLE_AUTH_ENABLED==='true'){
  const{data,error}=await session.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:env.APP_ORIGIN+'/auth/callback',queryParams:{prompt:'select_account'}}});
  if(error||!data.url)return page('接続できませんでした。もう一度お試しください。',502);
  const destination=new URL(data.url);if(destination.origin!==new URL(env.SUPABASE_URL).origin||destination.pathname!=='/auth/v1/authorize')return page('接続先を確認できませんでした。',502);
  // A self-origin POST finishes here. Separate GET navigation avoids browsers
  // applying form-action 'self' to OAuth's cross-origin redirect chain.
  return oauthRedirectPage(destination.href);
 }
 if(!['/auth/email','/auth/verify','/auth/confirm'].includes(path))return new Response('Not found',{status:404});
 const reader=request.body?.getReader();let encoded='',size=0;
 if(reader){const decoder=new TextDecoder();while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return new Response('Too large',{status:413})}encoded+=decoder.decode(value,{stream:true})}encoded+=decoder.decode()}
 const form=new URLSearchParams(encoded),email=String(form.get('email')||'').trim().toLowerCase();
 if(path==='/auth/confirm'){const token=String(form.get('token_hash')||'');if(!/^[a-zA-Z0-9_-]{16,256}$/.test(token))return page('リンクが無効です。',400);const{data,error}=await session.client.auth.verifyOtp({token_hash:token,type:'email'});if(!error&&canAccess(data.user,env))return redirect();session.clear?.();return page('リンクが無効か期限切れです。メールを再送してください。',400)}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return page('メールアドレスを確認してください。',400);
 if(env.PUBLIC_SIGNUPS!=='true'&&email!==env.OWNER_EMAIL?.trim().toLowerCase())return page('利用できるメールアドレスを確認してください。',403);
 if(path==='/auth/email'){
  const{error}=await session.client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:env.APP_ORIGIN+'/auth/callback'}});
  return page(error?'送信できませんでした。時間をおいて再度お試しください。':'確認メールを送信しました。このブラウザでメールのリンクを開いてください。確認コードの設定をした場合は、コードでもサインインできます。',error?429:200);
 }
 const token=String(form.get('token')||'');if(!/^\d{6,10}$/.test(token))return page('確認コードを入力してください。',400);
 const{data,error}=await session.client.auth.verifyOtp({email,token,type:'email'});
 if(!error&&canAccess(data.user,env))return redirect();
 if(data.user){await session.client.auth.signOut({scope:'local'});session.clear?.()}
 return page('コードが無効か期限切れです。メールを再送してください。',400);
}
