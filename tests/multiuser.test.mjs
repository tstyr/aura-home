import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {adaptDatabase} from '../server/database.js';
import {handle} from '../server/index.js';
import {canAccess,dataUserId} from '../server/auth.js';
import {localStateScript} from '../server/local-state.js';

const pg=new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await pg.exec(fs.readFileSync(new URL('../supabase/migrations/202610050001_aura_home.sql',import.meta.url),'utf8'));
await pg.exec('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL)');
const DB=adaptDatabase(async(sql,params)=>{const result=await pg.query(sql,params);result.rows.count=result.affectedRows;return result.rows});
const owner={id:crypto.randomUUID(),email:'owner@example.test',email_confirmed_at:'2026-10-05T00:00:00Z'};
const alice={id:crypto.randomUUID(),email:'alice@example.test',email_confirmed_at:'2026-10-05T00:00:00Z',app_metadata:{provider:'email'}};
const bob={id:crypto.randomUUID(),email:'bob@example.test',email_confirmed_at:'2026-10-05T00:00:00Z'};
const env={APP_ORIGIN:'https://aura.test',PUBLIC_SIGNUPS:'true',OWNER_EMAIL:owner.email,APP_DATA_USER_ID:'legacy-owner',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture',DATABASE_URL:'fixture'};
const ids=new Map([owner,alice,bob].map(user=>[user.id,crypto.randomUUID()]));
for(const user of [owner,alice,bob])await pg.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[ids.get(user.id),user.id]);
let current=alice,exchangeError=null,mailSent=null;
const objects=new Map();
const BUCKET={
 async get(key){if(!objects.has(key))return null;const value=objects.get(key);const bytes=typeof value.data==='string'?new TextEncoder().encode(value.data):value.data;return{body:new Response(bytes).body,text:async()=>new TextDecoder().decode(bytes),json:async()=>JSON.parse(new TextDecoder().decode(bytes)),customMetadata:value.options.customMetadata}},
 async put(key,data,options={}){objects.set(key,{data,options})},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)},
 async list({prefix}){return{objects:[...objects.entries()].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,customMetadata:value.options.customMetadata,uploaded:new Date()}))}}
};
const deps={getDatabase:()=>({adapter:DB}),createStorage:()=>BUCKET,sessionClient:()=>({client:{auth:{
 getUser:async()=>({data:{user:current},error:null}),
 getSession:async()=>({data:{session:current?{access_token:'x.'+Buffer.from(JSON.stringify({sub:current.id,session_id:ids.get(current.id),amr:[{method:'oauth'}]})).toString('base64url')+'.x'}:null}}),
 exchangeCodeForSession:async()=>({data:{user:current},error:exchangeError}),
 signInWithOtp:async options=>{mailSent=options;return{error:null}},signOut:async()=>({error:null})}},finish:r=>r,clear(){}})};
const req=(path,method='GET',body,headers={})=>new Request(env.APP_ORIGIN+path,{method,headers:{...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const call=(path,method,body,headers)=>handle(req(path,method,body,headers),env,deps);
assert.equal(canAccess(alice,env),true);
assert.equal(canAccess({...alice,email_confirmed_at:null},env),false);
assert.equal(canAccess(alice,{...env,PUBLIC_SIGNUPS:'false'}),false);
assert.equal(dataUserId(owner,env),'legacy-owner');assert.equal(dataUserId(alice,env),alice.id);
assert.equal((await call('/signin')).headers.get('Location'),'/');
assert.equal((await call('/auth/callback?code=test-code')).headers.get('Location'),'/');
exchangeError={code:'pkce_code_verifier_not_found'};assert.equal((await call('/auth/callback?code=expired-code')).status,400);exchangeError=null;
const form=new Request(env.APP_ORIGIN+'/auth/email',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:alice.email})});
assert.equal((await handle(form,env,deps)).status,200);assert.equal(mailSent.email,alice.email);
const sharedTaskId=crypto.randomUUID();
assert.equal((await call('/api/settings','PATCH',{revision:0,patch:{hub:{displayName:'Alice'}}})).status,200);
assert.equal((await call('/api/tasks','POST',{id:sharedTaskId,title:'Alice private task',done:false,due:null})).status,201);
const aliceBackup=(await(await call('/api/account/backups','POST',{})).json()).backup;
const jpeg=Uint8Array.from([255,216,255,224,1,2,255,217]);
const imageResponse=await handle(new Request(env.APP_ORIGIN+'/api/backgrounds',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'image/jpeg'},body:jpeg}),env,deps);
assert.equal(imageResponse.status,201);const aliceImage=(await imageResponse.json()).image;
current=bob;
let state=await(await call('/api/state')).json();assert.equal(state.tasks.length,0);assert.equal(state.revision,0);
assert.equal((await call('/api/tasks/'+sharedTaskId,'PUT',{id:sharedTaskId,title:'Steal',done:false,due:null,revision:1})).status,404);
assert.equal((await call('/api/account/restore','POST',{backupId:aliceBackup.id,revision:0})).status,404);
assert.equal((await call('/api/account/devices/revoke','POST',{id:ids.get(alice.id)})).status,404);
assert.equal((await call('/api/backgrounds/'+aliceImage.id)).status,404);
assert.equal((await(await call('/api/backgrounds')).json()).images.length,0);
assert.equal((await call('/api/tasks','POST',{id:sharedTaskId,title:'Bob private task',done:false,due:null})).status,201);
const bobExport=await(await call('/api/account/export')).text();assert.ok(bobExport.includes('Bob private task'));assert.ok(!bobExport.includes('Alice'));
current=alice;
state=await(await call('/api/state','GET',undefined,{'oai-authenticated-user-id':bob.id})).json();assert.equal(state.tasks[0].title,'Alice private task');assert.equal(state.settings.hub.displayName,'Alice');
assert.equal((await(await call('/api/backgrounds')).json()).images.length,1);
assert.equal((await call('/api/backgrounds/'+aliceImage.id)).status,200);
current=owner;assert.equal((await call('/api/settings','PATCH',{revision:0,patch:{idle:120}})).status,200);
assert.equal((await pg.query('SELECT value FROM home_settings WHERE user_id=$1',['legacy-owner'])).rows.length,1);
current=null;assert.equal((await call('/api/state')).status,401);assert.equal((await call('/session-context.js')).status,303);
// Local preferences/offline timers never move from one account into another.
const localStorage={};Object.defineProperties(localStorage,{getItem:{value(key){return Object.hasOwn(this,key)?this[key]:null}},setItem:{value(key,value){this[key]=String(value)}}});
localStorage.setItem('aura-prefs','legacy');
let browser={localStorage,window:{}};vm.runInNewContext(localStateScript(owner.id,true),browser);assert.equal(browser.window.AuraLocal.getItem('aura-prefs'),'legacy');
browser.window.AuraLocal.setItem('aura-timer-cache','owner-private');
browser={localStorage,window:{}};vm.runInNewContext(localStateScript(alice.id,false),browser);assert.equal(browser.window.AuraLocal.getItem('aura-prefs'),null);assert.equal(browser.window.AuraLocal.getItem('aura-timer-cache'),null);
browser.window.AuraLocal.setItem('aura-prefs','alice-local');
browser={localStorage,window:{}};vm.runInNewContext(localStateScript(owner.id,true),browser);assert.equal(browser.window.AuraLocal.getItem('aura-timer-cache'),'owner-private');
await pg.close();
console.log('PASS: public/private signups, authenticated signin redirect, callback failure, legacy mapping, per-user settings/tasks/backups/devices/backgrounds/exports, spoofed headers and local cache isolation.');
