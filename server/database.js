import postgres from 'postgres';
let database;
// The existing handlers use a small prepared-statement interface. Execute the
// same conditional writes on Postgres, retaining revision conflict detection.
export function postgresQuery(sql){
 let index=0,quoted=false,out='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"){out+=c;if(quoted&&sql[i+1]==="'"){out+=sql[++i];continue}quoted=!quoted;continue}
  out+=c==='?'&&!quoted?'$'+(++index):c;
 }
 if(/^INSERT OR IGNORE /i.test(out))out=out.replace(/^INSERT OR IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';
 return out;
}
export function adaptDatabase(query){return{
 prepare(statement){const sql=postgresQuery(statement);return{
  bind(...parameters){const execute=()=>query(sql,parameters);return{
   async first(){return(await execute())[0]||null},
   async all(){return{results:Array.from(await execute())}},
   async run(){const rows=await execute();return{meta:{changes:rows.count??rows.length}}}
  }}
 }}
}}
export function getDatabase(env){
 if(!database){
  // Transaction pooling does not support prepared statement sessions.
  const sql=postgres(env.DATABASE_URL,{prepare:false,max:2,idle_timeout:20,connect_timeout:10,ssl:'require'});
  database={raw:sql,adapter:adaptDatabase((query,args)=>sql.unsafe(query,args))};
 }
 return database;
}
