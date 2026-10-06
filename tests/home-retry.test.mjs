import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {adaptDatabase} from '../server/database.js';
import {handleHome} from '../worker/home.js';

const pg=new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await pg.exec(fs.readFileSync(new URL('../supabase/migrations/202610050001_aura_home.sql',import.meta.url),'utf8'));
const DB=adaptDatabase(async(s,p)=>{const r=await pg.query(s,p);r.rows.count=r.affectedRows;return r.rows});
const values={tasks:{title:'Original task',due:null,done:false},events:{title:'Original event',start:'2026-10-06',end:'2026-10-07',allDay:true,location:''},timers:{title:'Original timer',mode:'timer',duration:600,remaining:600,end:null,done:false,phase:'focus',cycle:1,cycles:4,focusSeconds:1500,breakSeconds:300}};
const post=async(kind,user,value,db=DB)=>{const url=new URL('https://fixture.test/api/'+kind);return handleHome(new Request(url,{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json','oai-authenticated-user-id':user},body:JSON.stringify(value)}),{DB:db,BUCKET:{}},url)};
const count=async(kind,user)=>(await DB.prepare('SELECT COUNT(*) AS count FROM home_records WHERE user_id=? AND kind=?').bind(user,kind).first()).count;
try{
 for(const[kind,limit]of Object.entries({tasks:100,timers:20,events:300})){
  const user='quota-'+kind,id=crypto.randomUUID(),value={...values[kind],id};
  for(let i=0;i<limit-1;i++)await pg.query('INSERT INTO home_records VALUES($1,$2,$3,$4,1,$5)',[user,kind,crypto.randomUUID(),JSON.stringify(values[kind]),new Date().toISOString()]);
  let response=await post(kind,user,value);assert.equal(response.status,201);const original=(await response.json()).record;
  response=await post(kind,user,{...value,title:'Retry must preserve the saved title'});assert.equal(response.status,201);assert.deepEqual((await response.json()).record,original);
  assert.equal(await count(kind,user),limit);assert.equal((await post(kind,user,{...value,id:crypto.randomUUID()})).status,409);
  const foreignId=crypto.randomUUID();await pg.query('INSERT INTO home_records VALUES($1,$2,$3,$4,1,$5)',['other-owner',kind,foreignId,JSON.stringify({...values[kind],title:'Private other user record'}),new Date().toISOString()]);
  assert.equal((await post(kind,user,{...value,id:foreignId})).status,409,'An existing ID in another user must not bypass the quota.');
  const differentKind=kind==='tasks'?'events':'tasks',foreignKindId=crypto.randomUUID();await pg.query('INSERT INTO home_records VALUES($1,$2,$3,$4,1,$5)',[user,differentKind,foreignKindId,JSON.stringify(values[differentKind]),new Date().toISOString()]);
  assert.equal((await post(kind,user,{...value,id:foreignKindId})).status,409,'An existing ID in another record kind must not bypass the quota.');
  const parallelUser='parallel-'+kind,parallelValue={...values[kind],id:crypto.randomUUID()};
  const responses=await Promise.all([post(kind,parallelUser,parallelValue),post(kind,parallelUser,parallelValue)]);assert.deepEqual(responses.map(r=>r.status),[201,201]);assert.deepEqual(await responses[0].json(),await responses[1].json());assert.equal(await count(kind,parallelUser),1);
  // Simulate another copy completing after the existing-ID lookup but before
  // this copy checks the quota. Both requests must still report the same save.
  await pg.query('DELETE FROM home_records WHERE user_id=$1 AND kind=$2 AND id=$3',[user,kind,id]);
  const racedId=crypto.randomUUID();let insertDuringCount=true;
  const racingDB=adaptDatabase(async(s,p)=>{if(insertDuringCount&&s.startsWith('SELECT COUNT(*) AS count')){insertDuringCount=false;await pg.query('INSERT INTO home_records VALUES($1,$2,$3,$4,1,$5)',[user,kind,racedId,JSON.stringify(values[kind]),new Date().toISOString()]);}const r=await pg.query(s,p);r.rows.count=r.affectedRows;return r.rows});
  response=await post(kind,user,{...values[kind],id:racedId},racingDB);assert.equal(response.status,201);assert.equal((await response.json()).record.id,racedId);assert.equal(await count(kind,user),limit);
 }
 console.log('PASS: task/event/timer final-slot retry, preserved record/revision, new-record quota, user/kind isolation, simultaneous duplicate saves.');
}finally{await pg.close()}
