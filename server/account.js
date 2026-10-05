import {cleanSettingsPatch} from '../worker/home.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reply=(data,status=200)=>Response.json(data,{status});
export function publicProfile(user,env,loginProvider=''){
 let avatar=null;try{const u=new URL(user.user_metadata?.avatar_url||user.user_metadata?.picture);if(u.protocol==='https:'&&(u.hostname==='lh3.googleusercontent.com'||u.hostname==='lh4.googleusercontent.com')&&!u.username&&!u.password)avatar=u.href}catch{}
 return{email:user.email,name:String(user.user_metadata?.full_name||user.user_metadata?.name||'').slice(0,80),avatar,googleLoginAvailable:env.GOOGLE_AUTH_ENABLED==='true',provider:loginProvider||(user.app_metadata?.provider==='google'?'google':'email')};
}
export async function verifiedSessionId(session,user){
 // getUser has already verified the token. Read only the session identifier;
 // identity and ownership never come from local cookie user metadata.
 const{data,error}=await session.client.auth.getSession();if(error||!data.session?.access_token)throw Error('Session unavailable');
 let claims;try{claims=JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url').toString())}catch{throw Error('Invalid session')}
 if(claims.sub!==user.id||!UUID.test(claims.session_id||''))throw Error('Invalid session');session.loginProvider=Array.isArray(claims.amr)?(claims.amr.some(item=>item.method==='oauth')?'google':'email'):'';return claims.session_id;
}
function deviceName(ua){const platform=/iPad/.test(ua)?'iPad':/iPhone/.test(ua)?'iPhone':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'Mac':'ブラウザ';const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':/Firefox\//.test(ua)?'Firefox':'';return [platform,browser].filter(Boolean).join(' · ')}
export async function registerDevice(db,user,sessionId,request,{checkAuthSession=true}={}){
 if(checkAuthSession){const active=await db.prepare('SELECT id FROM auth.sessions WHERE id=?::uuid AND user_id=?::uuid').bind(sessionId,user.id).first();if(!active)return false}
 const at=new Date().toISOString(),owner=request.headers.get('oai-authenticated-user-id'),value=JSON.stringify({name:deviceName(request.headers.get('user-agent')||''),createdAt:at,revoked:false});
 // Never resurrect a revoked device; ON CONFLICT only updates last-seen time.
 const row=await db.prepare("INSERT INTO home_records(user_id,kind,id,value,revision,updated_at) VALUES(?,'devices',?,?,1,?) ON CONFLICT(user_id,kind,id) DO UPDATE SET updated_at=excluded.updated_at RETURNING value").bind(owner,sessionId,value,at).first();return row&&!JSON.parse(row.value).revoked;
}
async function body(request,max=262144){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error('入力形式を確認してください。'),{status:415});const reader=request.body?.getReader();let size=0,chunks=[];if(reader)while(true){const{done,value}=await reader.read();if(done)break;if((size+=value.length)>max){await reader.cancel();throw Object.assign(Error('データが大きすぎます。'),{status:413})}chunks.push(value)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw Object.assign(Error('入力を確認してください。'),{status:400})}}
export async function accountRoute(request,env,session,user,sessionId,db){
 const url=new URL(request.url),path=url.pathname,owner=env.APP_DATA_USER_ID||user.id;
 try{
  if(path==='/api/account'&&request.method==='GET'){
   const rows=await db.prepare("SELECT id,value,updated_at FROM home_records WHERE user_id=? AND kind='devices' ORDER BY updated_at DESC LIMIT 30").bind(owner).all();
   const backups=await db.prepare("SELECT id,updated_at FROM home_records WHERE user_id=? AND kind='backups' ORDER BY updated_at DESC LIMIT 10").bind(owner).all();
   return reply({profile:env.AUTH_PROFILE||publicProfile(user,env),devices:rows.results.map(r=>({id:r.id,...JSON.parse(r.value),lastSeen:r.updated_at,current:r.id===sessionId})),backups:backups.results.map(r=>({id:r.id,createdAt:r.updated_at}))});
  }
  if(path==='/api/account/delete'&&request.method==='POST'){const data=await body(request,2048);if(data.confirm!==user.email)return reply({error:'確認のメールアドレスが一致しません。'},400);if(!env.DELETE_ACCOUNT)return reply({error:'削除に接続できません。'},503);const signedOut=await session.client.auth.signOut({scope:'global'});if(signedOut?.error)return reply({error:'ログイン情報を終了できません。時間をおいて再試行してください。'},503);const result=await env.DELETE_ACCOUNT();session.clear?.();return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Clear-Site-Data':'"cache", "storage"'}})}
  if(path==='/api/account/export'&&request.method==='GET'){
   const settings=await db.prepare('SELECT value FROM home_settings WHERE user_id=?').bind(owner).first(),rows=await db.prepare("SELECT id,kind,value FROM home_records WHERE user_id=? AND kind IN ('tasks','events','timers') ORDER BY kind,id").bind(owner).all();
   const data={format:'aura-home',version:1,exportedAt:new Date().toISOString(),settings:settings?JSON.parse(settings.value):{},records:rows.results.map(r=>({id:r.id,kind:r.kind,value:JSON.parse(r.value)}))};
   return new Response(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json;charset=utf-8','Content-Disposition':'attachment; filename="aura-home-export.json"'}});
  }
  if(path==='/api/account/devices/revoke'&&request.method==='POST'){
   const data=await body(request,2048);if(!UUID.test(data.id||'')||data.id===sessionId)return reply({error:'別の端末を選んでください。'},400);
   const row=await db.prepare("UPDATE home_records SET value=(value::jsonb || '{\"revoked\":true}'::jsonb)::text,revision=revision+1,updated_at=? WHERE user_id=? AND kind='devices' AND id=? RETURNING id").bind(new Date().toISOString(),owner,data.id).first();return row?reply({revoked:true}):reply({error:'端末が見つかりません。'},404);
  }
  if(path==='/api/account/devices/revoke-others'&&request.method==='POST'){
   // App-level revocation is immediate even while an access JWT remains valid.
   await db.prepare("UPDATE home_records SET value=(value::jsonb || '{\"revoked\":true}'::jsonb)::text,revision=revision+1,updated_at=? WHERE user_id=? AND kind='devices' AND id<>?").bind(new Date().toISOString(),owner,sessionId).run();
   const{error}=await session.client.auth.signOut({scope:'others'});return reply({revoked:true,refreshTokensRevoked:!error});
  }
  if(path==='/api/account/backups'&&request.method==='POST'){
   const current=await db.prepare('SELECT value FROM home_settings WHERE user_id=?').bind(owner).first();if(!current)return reply({error:'設定を保存してからバックアップしてください。'},409);
   const id=crypto.randomUUID(),at=new Date().toISOString();await db.prepare("INSERT INTO home_records(user_id,kind,id,value,revision,updated_at) VALUES(?,'backups',?,?,1,?)").bind(owner,id,current.value,at).run();
   return reply({backup:{id,createdAt:at}},201);
  }
  if(path==='/api/account/restore'&&request.method==='POST'){
   const data=await body(request);let settings=data.settings;
   if(data.backupId){if(!UUID.test(data.backupId))return reply({error:'バックアップを選んでください。'},400);const backup=await db.prepare("SELECT value FROM home_records WHERE user_id=? AND kind='backups' AND id=?").bind(owner,data.backupId).first();if(!backup)return reply({error:'バックアップが見つかりません。'},404);settings=JSON.parse(backup.value)}
   // Revalidate every restored field; exports never contain OAuth/SMTP secrets.
   const clean=cleanSettingsPatch(settings),at=new Date().toISOString();if(!Number.isInteger(data.revision)||data.revision<0)return reply({error:'設定を再読み込みしてください。'},400);
   const row=await db.prepare('INSERT INTO home_settings(user_id,value,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value,revision=home_settings.revision+1,updated_at=excluded.updated_at WHERE home_settings.revision=? RETURNING revision').bind(owner,JSON.stringify(clean),at,data.revision).first();return row?reply({restored:true,revision:row.revision}):reply({error:'別の端末で設定が更新されました。再読み込みしてください。'},409);
  }
  if(path==='/api/account/diagnostics'&&request.method==='GET'){
   const dbOk=await db.prepare('SELECT 1 AS ok').bind().first();return reply({checkedAt:new Date().toISOString(),database:Boolean(dbOk?.ok),auth:true,googleLogin:env.GOOGLE_AUTH_ENABLED==='true',googleCalendar:Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),storage:Boolean(env.SUPABASE_BUCKET)});
  }
  return reply({error:'見つかりません。'},404);
 }catch(e){return reply({error:e.status?e.message:'処理できませんでした。再読み込みしてお試しください。'},e.status||503)}
}
