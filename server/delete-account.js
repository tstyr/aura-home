import {createClient} from '@supabase/supabase-js';
import {getDatabase} from './database.js';
import {createStorage} from './storage.js';
import {unseal} from '../worker/google.js';

// Only called with the getUser-verified user and that user's resolved namespace.
export async function deleteAccountData(user,env,dependencies={}){
 const database=dependencies.database||getDatabase(env),owner=env.APP_DATA_USER_ID||user.id;
 const storage=dependencies.storage||createStorage(env,database.adapter);
 const admin=dependencies.admin||createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.admin;
 const connection=await database.adapter.prepare('SELECT tokens FROM google_accounts WHERE user_id=?').bind(owner).first();
 let googleTokens=null;try{if(connection)googleTokens=await unseal(env,owner,connection.tokens)}catch{}
 // The caller first revokes sessions. Keep the Auth identity until data cleanup
 // succeeds, so a failed storage/database cleanup can be retried after login.
 for(const root of ['backgrounds/','calendar-cache/','google-cache/']){
  const prefix=root+encodeURIComponent(owner)+'/';let cursor='';
  do{const list=await storage.list({prefix,limit:1000,cursor});if(list.objects.length)await storage.delete(list.objects.map(item=>item.key));cursor=list.truncated?list.cursor:''}while(cursor);
 }
 await database.raw.begin(async tx=>{
  for(const table of ['home_settings','home_records','calendar_sources','google_accounts','google_oauth_states'])await tx.unsafe('DELETE FROM '+table+' WHERE user_id=$1',[owner]);
  for(const root of ['backgrounds/','calendar-cache/','google-cache/'])await tx.unsafe("DELETE FROM home_objects WHERE object_key LIKE $1",[root+encodeURIComponent(owner)+'/%']);
 });
 const {error}=await admin.deleteUser(user.id);if(error)throw Error('Account deletion failed');
 let googleRevoked=!connection;
 if(googleTokens){try{const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:googleTokens.refreshToken||googleTokens.accessToken}),signal:AbortSignal.timeout(12000)});googleRevoked=response.ok||response.status===400}catch{}}
 return{deleted:true,googleRevoked};
}
