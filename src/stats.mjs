export const milestones=[3,5,10,20];
export const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function participantStats(id,records){
 let streak=0,best=0,onTime=0,late=0;
 for(const r of records.filter(r=>r.participant_id===id).sort((a,b)=>a.date.localeCompare(b.date))){if(r.status==='on_time'){onTime++;streak++;best=Math.max(best,streak);}else if(r.status==='late'){late++;streak=0;}}
 return {streak,best,onTime,late,percent:onTime+late?Math.round(onTime/(onTime+late)*100):null,badges:milestones.filter(n=>best>=n)};
}
export function monthStats(records,month){const rows=records.filter(r=>r.date.startsWith(month)&&r.status!=='absent');return {percent:rows.length?Math.round(rows.filter(r=>r.status==='on_time').length/rows.length*100):null,total:rows.length};}
