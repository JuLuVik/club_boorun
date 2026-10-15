import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export function createStore(path){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS attendance(participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('on_time','late','absent')),PRIMARY KEY(participant_id,date));`);
 const state=()=>({participants:db.prepare('SELECT id,name FROM participants ORDER BY created_at,id').all(),records:db.prepare('SELECT * FROM attendance ORDER BY date').all()});
 function mutate(action,payload={}){
  if(['add','rename'].includes(action)){const name=String(payload.name??'').trim();if(!name||name.length>60)throw Error('Имя должно содержать от 1 до 60 символов');if(action==='add')db.prepare('INSERT INTO participants(id,name) VALUES(?,?)').run(randomUUID(),name);else db.prepare('UPDATE participants SET name=? WHERE id=?').run(name,payload.id);
  }else if(action==='delete'){db.prepare('DELETE FROM participants WHERE id=?').run(payload.id);
  }else if(action==='attendance'){
   if(typeof payload.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)||Number.isNaN(Date.parse(payload.date))||new Date(payload.date).toISOString().slice(0,10)!==payload.date)throw Error('Некорректная дата');
   if(!Array.isArray(payload.entries)||payload.entries.length>1000)throw Error('Некорректные отметки');
   db.exec('BEGIN');try{for(const row of payload.entries){if(!['on_time','late','absent',null].includes(row.status))throw Error('Некорректный статус');if(row.status===null)db.prepare('DELETE FROM attendance WHERE participant_id=? AND date=?').run(row.id,payload.date);else db.prepare('INSERT INTO attendance(participant_id,date,status) VALUES(?,?,?) ON CONFLICT(participant_id,date) DO UPDATE SET status=excluded.status').run(row.id,payload.date,row.status);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }else throw Error('Неизвестное действие');return state();
 }
 return {state,mutate,close:()=>db.close()};
}
