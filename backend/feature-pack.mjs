// Feature pack: search/filter, CSV/JSON export, deterministic insights over own records.
// No provider calls here; insights are labelled deterministic fallback (aiGenerated:false).
export function filterRecords(records, {q="", status="", risk=""}={}) {
  const needle=String(q||"").trim().toLowerCase();
  return (records||[]).filter(r=>{
    if(status && r.status!==status) return false;
    if(risk && r.risk!==risk) return false;
    if(!needle) return true;
    const hay=[r.reference,r.title,r.status,r.owner,r.risk,r.feature_id, JSON.stringify(r.payload??{})].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
const COLS=["id","reference","title","status","owner","risk","due_date","amount","feature_id"];
function csvCell(v){ if(v===null||v===undefined) return ""; const s=typeof v==="object"?JSON.stringify(v):String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
export function recordsToCsv(records){
  const cols=[...COLS,"payload"];
  return [cols.join(","), ...(records||[]).map(r=>cols.map(c=>csvCell(c==="payload"?r.payload:r[c])).join(","))].join("\n")+"\n";
}
export function exportRecords(records, format="json"){
  if(format==="csv") return {contentType:"text/csv; charset=utf-8", body:recordsToCsv(records), filename:"records.csv"};
  return {contentType:"application/json; charset=utf-8", body:JSON.stringify({aiGenerated:false, items:records||[]},null,2), filename:"records.json"};
}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
function base(kind, feature, records){
  return {kind, aiGenerated:false, source:"deterministic-fallback", label:"Deterministic fallback — no AI generated", featureId:feature?.id||"", featureTitle:feature?.title||"Records", recordCount:(records||[]).length};
}
export function buildInsight(kind, records, feature){
  const rows=records||[];
  const total=rows.reduce((s,r)=>s+num(r.amount),0);
  const byStatus={}; const byRisk={};
  for(const r of rows){ byStatus[r.status]=(byStatus[r.status]||0)+1; byRisk[r.risk]=(byRisk[r.risk]||0)+1; }
  const open=rows.filter(r=>!["Approved","Closed"].includes(r.status));
  const high=rows.filter(r=>["High","Critical"].includes(r.risk));
  if(kind==="priority-queue"){
    const queue=[...open].sort((a,b)=>num(b.amount)-num(a.amount)).slice(0,5).map(r=>({reference:r.reference||"", title:r.title||"", status:r.status||"", risk:r.risk||"", amount:num(r.amount), aiGenerated:false}));
    return {...base(kind,feature,rows), title:`${feature?.title||"Records"} — priority queue`, summary: queue.length?`${queue.length} open record(s) ranked by amount for review.`:"No open records to prioritise.", metrics:[{label:"Open records",value:open.length},{label:"High-risk open",value:open.filter(r=>["High","Critical"].includes(r.risk)).length},{label:"Top amount",value:queue[0]?queue[0].amount:0}], sections:[{title:"Priority queue (labelled)", detail: queue.length?queue.map((x,i)=>`${i+1}. ${x.reference} — ${x.title} (${x.status}, ${x.risk}, ${x.amount})`).join("; "):"Empty — no open records."},{title:"Preserved values", detail:`aiGenerated: false; open count: ${open.length}; total amount: ${total}`}], actions: queue.length?["Review the top-ranked record first","Validate its source evidence","Assign an accountable owner"]:["Create or reopen a record to populate the queue"], queue};
  }
  if(kind==="variance-focus"){
    // Use payload numeric pairs when present, otherwise amount concentration.
    let varianceTotal=0, counted=0;
    for(const r of rows){ const p=r.payload||{}; const vals=Object.values(p).map(num).filter(n=>n>0); if(vals.length>=2){ varianceTotal+=Math.abs(vals[0]-vals[1]); counted++; } }
    const share=total? Math.round((rows.slice().sort((a,b)=>num(b.amount)-num(a.amount))[0]? num([...rows].sort((a,b)=>num(b.amount)-num(a.amount))[0].amount)/total*100:0)):0;
    return {...base(kind,feature,rows), title:`${feature?.title||"Records"} — variance focus`, summary: counted?`${counted} record(s) carry paired amounts; combined absolute variance ${varianceTotal}.`:`No paired payload amounts; largest record is ${share}% of total value.`, metrics:[{label:"Records reviewed",value:rows.length},{label:"Paired-amount records",value:counted},{label:"Combined variance",value:varianceTotal},{label:"Largest-record share %",value:share}], sections:[{title:"Variance finding (labelled)", detail: counted?`Combined absolute variance across paired payload amounts is ${varianceTotal} across ${counted} record(s).`:"Empty paired-amount set — variance is 0 for this view."},{title:"Preserved values", detail:`aiGenerated: false; variance: ${varianceTotal}; share: ${share}`}], actions:["Reconcile the largest variance record against source evidence","Confirm the governing rule or agreement","Retain the disposition evidence"]};
  }
  // default portfolio-summary
  return {...base("portfolio-summary",feature,rows), title:`${feature?.title||"Records"} — portfolio summary`, summary: rows.length?`${rows.length} record(s) totalling ${total}; ${open.length} open, ${high.length} high-risk.`:"No records in this view.", metrics:[{label:"Record count",value:rows.length},{label:"Total amount",value:total},{label:"Open records",value:open.length},{label:"High-risk records",value:high.length}], sections:[{title:"By status (labelled)", detail: Object.keys(byStatus).length?Object.entries(byStatus).map(([k,v])=>`${k}: ${v}`).join("; "):"Empty — no statuses."},{title:"By risk (labelled)", detail: Object.keys(byRisk).length?Object.entries(byRisk).map(([k,v])=>`${k}: ${v}`).join("; "):"Empty — no risks."},{title:"Preserved values", detail:`aiGenerated: false; total: ${total}; open: ${open.length}`}], actions: open.length?["Work open records in due-date order","Escalate high-risk records for review"]:["No open work — review closed evidence"], byStatus, byRisk};
}
export const INSIGHT_KINDS=["portfolio-summary","priority-queue","variance-focus"];
