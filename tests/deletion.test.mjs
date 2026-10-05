import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {adaptDatabase} from '../server/database.js';
import {deleteAccountData} from '../server/delete-account.js';
import {handle} from '../server/index.js';
const pg=new PGlite();await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await pg.exec(fs.readFileSync(new URL('../supabase/migrations/202610050001_aura_home.sql',import.meta.url),'utf8'));
const adapter=adaptDatabase(async(sql,args)=>{const r=await pg.query(sql,args);r.rows.count=r.affectedRows;return r.rows});
const database={adapter,raw:{begin:fn=>pg.transaction(tx=>fn({unsafe:async(sql,args)=>tx.query(sql,args)}))}};
const user={id:crypto.randomUUID(),email:'alice@example.test',email_confirmed_at:'2026-10-05'},other=crypto.randomUUID();
const env={APP_ORIGIN:'https://fixture.test',PUBLIC_SIGNUPS:'true',APP_DATA_USER_ID:user.id,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture',DATABASE_URL:'fixture'};
for(const id of [user.id,other]){
 await pg.query("INSERT INTO home_settings VALUES($1,'{}',1,'now')",[id]);
 await pg.query("INSERT INTO home_records VALUES($1,'tasks',$2,'{}',1,'now')",[id,crypto.randomUUID()]);
 await pg.query("INSERT INTO calendar_sources VALUES($1,$2,'source','https://calendar.google.com/calendar/ical/test/public/basic.ics','now')",[id,crypto.randomUUID()]);
 await pg.query("INSERT INTO google_oauth_states VALUES($1,'state','cookie','verifier',123)",[id]);
}
const objects=new Set();for(const id of [user.id,other])for(const root of ['backgrounds/','calendar-cache/','google-cache/'])for(let i=0;i<(root==='google-cache/'?1002:2);i++){
 const key=root+id+'/'+String(i).padStart(4,'0');objects.add(key);await pg.query("INSERT INTO home_objects VALUES($1,'application/json','{}','now')",[key]);
}
let adminCalls=0,identityDeleted=false;
const admin={deleteUser:async id=>{assert.equal(id,user.id);adminCalls++;identityDeleted=true;return{error:null}}};
const storage={list:async({prefix,limit,cursor=''})=>{const keys=[...objects].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return{objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit,cursor:keys.length>limit?keys[limit-1]:''}},delete:async keys=>keys.forEach(key=>objects.delete(key))};
const failingStorage={...storage,list:async()=>{throw Error('storage unavailable')}};
await assert.rejects(()=>deleteAccountData(user,env,{database,storage:failingStorage,admin}));assert.equal(adminCalls,0);assert.equal((await pg.query('SELECT * FROM home_settings WHERE user_id=$1',[user.id])).rows.length,1);
const deleted=await deleteAccountData(user,env,{database,storage,admin});assert.equal(deleted.deleted,true);assert.equal(identityDeleted,true);assert.equal(adminCalls,1);
for(const table of ['home_settings','home_records','calendar_sources','google_oauth_states']){assert.equal((await pg.query('SELECT * FROM '+table+' WHERE user_id=$1',[user.id])).rows.length,0);assert.equal((await pg.query('SELECT * FROM '+table+' WHERE user_id=$1',[other])).rows.length,1)}
assert.equal((await pg.query('SELECT * FROM home_objects')).rows.length,1006);assert.equal(objects.size,1006);assert.ok([...objects].every(key=>key.includes(other)));
let deletionRequests=0;
const deps={getSessionId:async()=>crypto.randomUUID(),getDatabase:()=>({adapter}),createStorage:()=>storage,deleteAccount:async verified=>{assert.equal(verified.id,user.id);deletionRequests++;return{deleted:true}},sessionClient:()=>({client:{auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})}},clear(){},finish:r=>r})};
const request=confirm=>new Request(env.APP_ORIGIN+'/api/account/delete',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({confirm})});
assert.equal((await handle(request('bob@example.test'),env,deps)).status,400);assert.equal(deletionRequests,0);
assert.equal((await handle(request(user.email),env,deps)).status,200);assert.equal(deletionRequests,1);
for(const path of ['/about','/privacy','/terms']){const response=await handle(new Request(env.APP_ORIGIN+path),{},{});assert.equal(response.status,200);assert.ok((await response.text()).includes('Aura Home'))}
await pg.close();console.log('PASS: account deletion confirmation/identity scoping, storage pagination, retry on storage failure, other-user preservation, public privacy/usage pages.');
