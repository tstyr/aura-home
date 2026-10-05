import {createClient} from '@supabase/supabase-js';
export function createStorage(env,db){
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const bucket=client.storage.from(env.SUPABASE_BUCKET||'aura-home');
 const fail=e=>{if(e)throw new Error('Storage unavailable')};
 return{
  async get(key){
   const metadata=await db.prepare('SELECT content_type,custom_metadata FROM home_objects WHERE object_key=?').bind(key).first();
   if(!metadata)return null;
   const{data,error}=await bucket.download(key);fail(error);
   return{body:data.stream(),customMetadata:JSON.parse(metadata.custom_metadata),text:()=>data.text(),json:async()=>JSON.parse(await data.text())};
  },
  async put(key,value,options={}){
   const contentType=options.httpMetadata?.contentType||'application/octet-stream';
   const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
   const{error}=await bucket.upload(key,bytes,{upsert:true,contentType});fail(error);
   await db.prepare('INSERT INTO home_objects(object_key,content_type,custom_metadata,uploaded_at) VALUES(?,?,?,?) ON CONFLICT(object_key) DO UPDATE SET content_type=excluded.content_type,custom_metadata=excluded.custom_metadata,uploaded_at=excluded.uploaded_at').bind(key,contentType,JSON.stringify(options.customMetadata||{}),new Date().toISOString()).run();
  },
  async delete(keys){const paths=Array.isArray(keys)?keys:[keys];if(!paths.length)return;const{error}=await bucket.remove(paths);fail(error);for(const path of paths)await db.prepare('DELETE FROM home_objects WHERE object_key=?').bind(path).run()},
  async list({prefix='',limit=1000,cursor=''}){
   const escaped=prefix.replace(/[\\%_]/g,c=>'\\'+c)+'%';
   const rows=await db.prepare("SELECT object_key,custom_metadata,uploaded_at FROM home_objects WHERE object_key LIKE ? ESCAPE '\\' AND object_key>? ORDER BY object_key LIMIT ?").bind(escaped,cursor,Math.min(1000,limit)+1).all();
   const more=rows.results.length>limit,selected=rows.results.slice(0,limit);
   return{objects:selected.map(row=>({key:row.object_key,customMetadata:JSON.parse(row.custom_metadata),uploaded:new Date(row.uploaded_at)})),truncated:more,cursor:more?selected.at(-1).object_key:null};
  }
 }
}
