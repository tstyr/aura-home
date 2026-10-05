import fs from 'node:fs';
import postgres from 'postgres';
if(!process.env.DATABASE_URL||!process.env.APP_DATA_USER_ID)throw Error('Set DATABASE_URL and APP_DATA_USER_ID on the server');
const file=process.argv[2];if(!file)throw Error('Pass the private legacy export path');
const exportData=JSON.parse(fs.readFileSync(file,'utf8'));
const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,ssl:'require'});
try{
 await sql.begin(async tx=>{
  for(const name of ['home_settings','home_records','calendar_sources']){
   const table=exportData.tables[name],rows=Array.isArray(table)?table:table.rows;
   for(const row of rows){if(row.user_id!==process.env.APP_DATA_USER_ID)throw Error('Legacy user mapping mismatch');
    await tx`INSERT INTO ${tx(name)} ${tx(row)} ON CONFLICT DO NOTHING`;
   }
  }
 });
 console.log('Legacy settings and records imported without overwriting existing data');
}finally{await sql.end()}
