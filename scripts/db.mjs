import fs from 'node:fs';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL must be set');
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,ssl:'require'});
try{
 await sql.unsafe(fs.readFileSync(new URL('../supabase/migrations/202610050001_aura_home.sql',import.meta.url),'utf8')).simple();
 if(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY){
  const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}}),id=process.env.SUPABASE_BUCKET||'aura-home';
  const{data:bucket,error}=await client.storage.getBucket(id);
  if(error){const{error:created}=await client.storage.createBucket(id,{public:false,fileSizeLimit:8*1024*1024,allowedMimeTypes:['image/jpeg','application/json','text/calendar']});if(created)throw Error('Cannot create private storage bucket')}
  else if(bucket.public)throw Error('Storage bucket must be private');
 }
 console.log('Database schema ready; browser roles have no application table access');
}finally{await sql.end()}
