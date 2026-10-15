import pg from 'pg';
import {randomUUID} from 'node:crypto';
export async function createPostgresStore(connectionString){
 // Keep TLS certificate and hostname validation enabled, including for Neon connection strings.
 const url=new URL(connectionString);
 if(url.searchParams.has('sslmode'))url.searchParams.set('sslmode','verify-full');
 const pool=new pg.Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:20000,idleTimeoutMillis:30000});
 pool.on('error',e=>console.error('Database connection failed:',e.code||e.name));
 await pool.query(`CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS attendance(participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('on_time','late','absent')),PRIMARY KEY(participant_id,date));`);
 const state=async(client=pool)=>{
  const participants=(await client.query('SELECT id,name FROM participants ORDER BY created_at,id')).rows;
  const records=(await client.query('SELECT * FROM attendance ORDER BY date')).rows;return {participants,records};
 };
 async function mutate(action,payload={}){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   if(['add','rename'].includes(action)){
    const name=String(payload.name??'').trim();if(!name||name.length>60)throw Error('Имя должно содержать от 1 до 60 символов');
    if(action==='add')await client.query('INSERT INTO participants(id,name) VALUES($1,$2)',[randomUUID(),name]);
    else await client.query('UPDATE participants SET name=$1 WHERE id=$2',[name,payload.id]);
   }else if(action==='delete')await client.query('DELETE FROM participants WHERE id=$1',[payload.id]);
   else if(action==='attendance'){
    if(typeof payload.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)||Number.isNaN(Date.parse(payload.date))||new Date(payload.date).toISOString().slice(0,10)!==payload.date)throw Error('Некорректная дата');
    if(!Array.isArray(payload.entries)||payload.entries.length>1000)throw Error('Некорректные отметки');
    for(const row of payload.entries){
     if(!['on_time','late','absent',null].includes(row.status))throw Error('Некорректный статус');
     if(row.status===null)await client.query('DELETE FROM attendance WHERE participant_id=$1 AND date=$2',[row.id,payload.date]);
     else await client.query('INSERT INTO attendance(participant_id,date,status) VALUES($1,$2,$3) ON CONFLICT(participant_id,date) DO UPDATE SET status=excluded.status',[row.id,payload.date,row.status]);
    }
   }else throw Error('Неизвестное действие');
   const result=await state(client);await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 return {state:()=>state(),mutate,close:()=>pool.end()};
}
