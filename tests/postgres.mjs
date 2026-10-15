import {test} from 'node:test';import assert from 'node:assert/strict';import {createPostgresStore} from '../server/postgres.mjs';
const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL: participants, corrections, persistence, transactional rollback, deletion', {skip:!url},async()=>{
 let store=await createPostgresStore(url);let id;
 try{
  const name='Integration '+Date.now();const state=await store.mutate('add',{name});id=state.participants.find(p=>p.name===name).id;
  await store.mutate('attendance',{date:'2026-06-01',entries:[{id,status:'late'}]});
  await store.mutate('attendance',{date:'2026-06-01',entries:[{id,status:'on_time'}]});
  await store.close();store=await createPostgresStore(url);
  assert.equal((await store.state()).records.find(r=>r.participant_id===id).status,'on_time');
  await store.mutate('rename',{id,name:'Анна Проверочная'});assert.equal((await store.state()).participants.find(p=>p.id===id).name,'Анна Проверочная');
  await assert.rejects(store.mutate('attendance',{date:'2026-06-03',entries:[{id,status:'on_time'},{id:'nonexistent',status:'late'}]}));
  assert.equal((await store.state()).records.filter(r=>r.participant_id===id).length,1);
  await assert.rejects(store.mutate('attendance',{date:'2026-02-30',entries:[]}));
  await store.mutate('attendance',{date:'2026-06-01',entries:[{id,status:null}]});assert.equal((await store.state()).records.filter(r=>r.participant_id===id).length,0);
  await store.mutate('attendance',{date:'2026-06-05',entries:[{id,status:'absent'}]});await store.mutate('delete',{id});
  assert.equal((await store.state()).records.filter(r=>r.participant_id===id).length,0);assert.equal((await store.state()).participants.some(p=>p.id===id),false);id=null;
 }finally{if(id)await store.mutate('delete',{id});await store.close();}
});
