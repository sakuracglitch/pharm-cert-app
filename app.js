const APP_VERSION='1.17.0';
const SCHEMA_VERSION=10;
const LEGACY_STORAGE_KEY='pharm-cert-pwa-data';
const DB_NAME='pharm-cert-pwa';
const DB_VERSION=2;
const DB_STORE='kv';
const DB_FILE_STORE='files';
const DB_STATE_KEY='state';
let storageBackend='indexeddb';
let saveQueue=Promise.resolve();

const CURRICULUM=[
  {domain:'I',title:'医療倫理と法令を順守する',items:[['I-1','薬剤師の使命と責任'],['I-2','医療制度'],['I-3','法令順守']]},
  {domain:'II',title:'基本的業務の向上を図る',items:[['II-1','調剤'],['II-2','製剤'],['II-3','医薬品情報'],['II-4','医薬品管理'],['II-5','マネジメント'],['II-6','教育・研究']]},
  {domain:'III',title:'チーム医療を実践する',items:[['III-1','病棟・外来業務（医療コミュニケーション）'],['III-2','連携']]},
  {domain:'IV',title:'医療安全を推進する',items:[['IV-1','リスクマネジメント（医薬品安全管理）'],['IV-2','感染制御・管理']]},
  {domain:'V',title:'ファーマシューティカルケアを実践する',items:[['V-1','医薬品（製剤）特性'],['V-2','疾病・薬物療法'],['V-3','患者特性']]}
];
const ITEM_CODES=CURRICULUM.flatMap(g=>g.items.map(x=>x[0]));
const HOSPITAL_CERT={
  id:'jshp-hospital',name:'病院薬学認定薬剤師',totalRequired:50,annualRequired:10,unitWindowYears:3,externalMax:10,experienceYears:0,kind:'curriculum',
  requirementTypes:{credits:true,experience:false,cases:false,paper:false,presentation:false,exam:true,membership:true},
  domains:{I:{units:2,items:1},II:{units:4,items:2},III:{units:4,items:2,all:true},IV:{units:4,items:2,all:true},V:{units:6,items:3,all:true}},
  officialLinks:[
    {label:'HOPESS',sub:'研修単位・認定申請',url:'https://www.jshp.or.jp/hopess/index.html'},
    {label:'シクミネット',sub:'会員情報・会費',url:'https://www.jshp.or.jp/cloud-member/'},
    {label:'日本病院薬剤師会',sub:'公式サイト',url:'https://www.jshp.or.jp/'}
  ]
};

const ICONS={
  menu:`<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  home:`<svg viewBox="0 0 24 24"><path d="M4 11.2 12 4l8 7.2"/><path d="M5.8 10.2V20h12.4v-9.8M9.4 20v-6.1h5.2V20"/></svg>`,
  history:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.4 2"/></svg>`,
  record:`<svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></svg>`,
  allocation:`<svg viewBox="0 0 24 24"><path d="M5 8h13M15 5l3 3-3 3M19 16H6M9 13l-3 3 3 3"/></svg>`,
  settings:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1"/><path d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M18 6l-1.5 1.5M7.5 16.5 6 18M18 18l-1.5-1.5M7.5 7.5 6 6"/><circle cx="12" cy="12" r="6.4"/></svg>`,
  chevron:`<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>`,
  file:`<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM15 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,
  eye:`<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>`
};

const defaultData=()=>({
  schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,
  settings:{hopess:false,dark:false,theme:'burgundy',practiceStartDate:'',selectedQualificationId:'jshp-hospital',qualificationPlans:{'jshp-hospital':{startFiscalYear:2026}}},
  qualifications:[HOSPITAL_CERT],trainings:[],plans:[],conferences:[],confirmedAllocations:{},manualAllocations:{},lastBackupAt:null
});

let state=defaultData();
let currentView='home',editingId=null,registerMode='manual',historyMode='matrix',menuOpen=false,qualModalOpen=false,requirementsOpen=false,settingsDataOpen=false,themePickerOpen=false,planModalOpen=false;
let planDraft=freshPlanDraft(),editingPlanId=null;
let excelCandidates=[],excelFileName='',excelLoading=false,excelError='';
let creditSelectMode=false;
let selectedCreditEntryIds=new Set();
let updateAvailableVersion='';
let updateInProgress=false;
let updateDeferred=false;
let updateToast='';
let lastUpdateCheckAt=0;
let pdfWorkerSrc='';
let regDraft=freshDraft();
let conferenceDraft=null;
let matrixDetail=null;
let matrixRequirementDomain='';
let selectedSourceFile=null;
let selectedSourceURL='';
let sourceViewerOpen=false;
let editConferenceIndex=null;
let manualSourceConferenceId=null;
let conferenceCompletionPrompt=null;

function freshDraft(){return {date:todayISO(),name:'',source:'jshp',cpc:false,hopessId:'',memo:'',files:[],creditEntries:[]}}
function freshPlanDraft(){return {date:todayISO(),name:''}}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function uid(){return crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function safeParse(s){try{return JSON.parse(s)}catch{return null}}
function fmt(n){const x=Number(n||0);return x.toFixed(x%1?1:0)}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fy(dateStr){const d=new Date(dateStr+'T00:00:00');return d.getMonth()+1>=4?d.getFullYear():d.getFullYear()-1}
function nextApplicationYear(){const now=new Date();const y=now.getFullYear(),m=now.getMonth()+1;return m<=5?y:y+1}
function planStartYearFor(q=HOSPITAL_CERT){const v=state.settings?.qualificationPlans?.[q.id]?.startFiscalYear;return Number.isFinite(Number(v))?Number(v):null}
function targetApplicationYear(q=HOSPITAL_CERT){const planStart=planStartYearFor(q);if(planStart!==null&&q.unitWindowYears)return planStart+Number(q.unitWindowYears);if(!q.experienceYears||!state.settings.practiceStartDate)return nextApplicationYear();const s=new Date(state.settings.practiceStartDate+'T00:00:00');s.setFullYear(s.getFullYear()+Number(q.experienceYears));let y=s.getFullYear();if(s.getMonth()+1>5)y++;return Math.max(y,nextApplicationYear())}
function targetFiscalYears(appYear,q=HOSPITAL_CERT){const planStart=planStartYearFor(q);if(planStart!==null&&q.unitWindowYears)return Array.from({length:q.unitWindowYears},(_,i)=>planStart+i);return Array.from({length:q.unitWindowYears},(_,i)=>appYear-q.unitWindowYears+i)}
function planYearOptions(q=HOSPITAL_CERT){const current=fy(todayISO()),selected=planStartYearFor(q)??current;const years=[];for(let y=current-3;y<=current+7;y++)years.push(y);if(!years.includes(selected))years.push(selected);return years.sort((a,b)=>a-b)}
function itemName(code){for(const g of CURRICULUM){const it=g.items.find(i=>i[0]===code);if(it)return it[1]}return code||'要確認'}
function currentQualification(){return state.qualifications.find(q=>q.id===state.settings.selectedQualificationId)||HOSPITAL_CERT}
function isHospitalQualification(q=currentQualification()){return q.id===HOSPITAL_CERT.id}
function requirementLabel(k){return ({credits:'単位',experience:'実務経験',cases:'症例',paper:'論文',presentation:'学会発表',exam:'試験',membership:'会員・基礎資格'})[k]||k}
function normalizeTraining(t){if(Array.isArray(t.creditEntries))return {...t,creditEntries:t.creditEntries.map(e=>({...e,id:e.id||uid(),unit:Number(e.unit||0)}))};return {...t,creditEntries:Object.entries(t.credits||{}).map(([code,unit])=>({id:uid(),code,unit:Number(unit),title:''}))}}
function normalizePlanRecord(p){return {id:p?.id||uid(),date:p?.date||todayISO(),name:String(p?.name||'').trim(),createdAt:p?.createdAt||new Date().toISOString(),updatedAt:p?.updatedAt||p?.createdAt||new Date().toISOString()}}
function normalizeConferenceRecord(c){const x={...c};x.id=x.id||uid();x.sourceId=x.sourceId||'';x.sourceType=x.sourceType||'';x.fileName=x.fileName||'';x.name=x.name||x.fileName||'学会プログラム';x.date=x.date||todayISO();x.sessions=(x.sessions||[]).map((s,i)=>({...s,sourceOrder:s.sourceOrder||i+1,status:s.status==='skipped'?'undecided':(s.status||'undecided'),credits:(s.credits||[]).map(v=>({...v,unit:Number(v.unit||0)}))}));x.analysisPending=false;x.createdAt=x.createdAt||new Date().toISOString();x.updatedAt=x.updatedAt||x.createdAt;return x}
function migrateData(raw){
  let d=raw&&typeof raw==='object'?JSON.parse(JSON.stringify(raw)):defaultData();
  d.settings={hopess:false,dark:false,theme:'burgundy',practiceStartDate:'',selectedQualificationId:'jshp-hospital',qualificationPlans:{'jshp-hospital':{startFiscalYear:2026}},...(d.settings||{})};
  d.settings.qualificationPlans={'jshp-hospital':{startFiscalYear:2026},...(d.settings.qualificationPlans||{})};
  d.qualifications=d.qualifications?.length?d.qualifications:[HOSPITAL_CERT];
  d.qualifications=d.qualifications.map(q=>q.id==='jshp-hospital'?{...HOSPITAL_CERT,...q}:q);
  d.trainings=(d.trainings||[]).map(normalizeTraining);
  d.plans=(d.plans||[]).map(normalizePlanRecord);
  d.conferences=(d.conferences||[]).map(normalizeConferenceRecord);
  d.confirmedAllocations=d.confirmedAllocations||{};
  d.manualAllocations=d.manualAllocations||{};
  d.lastBackupAt=d.lastBackupAt||null;
  d.schemaVersion=SCHEMA_VERSION;
  d.appVersion=APP_VERSION;
  return d;
}
function openAppDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);if(!db.objectStoreNames.contains(DB_FILE_STORE))db.createObjectStore(DB_FILE_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
  });
}
async function idbGet(key){
  const db=await openAppDB();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  finally{db.close()}
}
async function idbSet(key,value){
  const db=await openAppDB();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB write aborted'))})}
  finally{db.close()}
}
async function idbFileSet(key,value){const db=await openAppDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_FILE_STORE,'readwrite');tx.objectStore(DB_FILE_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB file write aborted'))})}finally{db.close()}}
async function idbFileGet(key){const db=await openAppDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_FILE_STORE,'readonly');const req=tx.objectStore(DB_FILE_STORE).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}finally{db.close()}}
async function idbFileDelete(key){const db=await openAppDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_FILE_STORE,'readwrite');tx.objectStore(DB_FILE_STORE).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}finally{db.close()}}

async function loadData(){
  let raw=null;
  try{raw=await idbGet(DB_STATE_KEY);storageBackend='indexeddb'}catch(err){storageBackend='localStorage';console.warn('IndexedDBを利用できないためローカル保存へ切り替えます。',err)}
  const legacy=safeParse(localStorage.getItem(LEGACY_STORAGE_KEY));
  if(!raw&&legacy){
    raw=legacy;
    if(storageBackend==='indexeddb'){
      try{await idbSet(`migration-backup-v0.13-${Date.now()}`,legacy)}catch{}
    }
  }
  const originalSchema=Number(raw?.schemaVersion||0);
  if(raw&&originalSchema<SCHEMA_VERSION&&storageBackend==='indexeddb'){
    try{await idbSet(`migration-backup-schema-${originalSchema}-${Date.now()}`,raw)}catch{}
  }
  const migrated=migrateData(raw||defaultData());
  await persistData(migrated);
  return migrated;
}
async function persistData(snapshot){
  // localStorageは旧版からの移行・非常時復旧用のミラー。主保存先はIndexedDB。
  try{localStorage.setItem(LEGACY_STORAGE_KEY,JSON.stringify(snapshot))}catch{}
  if(storageBackend!=='indexeddb')return;
  await idbSet(DB_STATE_KEY,snapshot);
}
function saveData(){
  state.schemaVersion=SCHEMA_VERSION;
  state.appVersion=APP_VERSION;
  const snapshot=JSON.parse(JSON.stringify(state));
  try{localStorage.setItem(LEGACY_STORAGE_KEY,JSON.stringify(snapshot))}catch{}
  if(storageBackend==='indexeddb'){
    saveQueue=saveQueue.then(()=>idbSet(DB_STATE_KEY,snapshot)).catch(err=>{console.warn('IndexedDB保存に失敗しました。',err);storageBackend='localStorage'});
  }
}

function allCredits(){return state.trainings.flatMap(t=>(t.creditEntries||[]).map(e=>({creditId:`${t.id}:${e.id}`,entryId:e.id,trainingId:t.id,date:t.date,name:t.name,code:e.code,domain:(e.code||'').split('-')[0],unit:Number(e.unit),lectureTitle:e.title||'',source:t.source,cpc:t.cpc,sourceOrder:e.sourceOrder||null,sourcePage:e.sourcePage||null})))}
function isCreditEligibleForHospital(c,appYear=targetApplicationYear(HOSPITAL_CERT)){return targetFiscalYears(appYear,HOSPITAL_CERT).includes(fy(c.date))}
function recommendAllocation(c){return isCreditEligibleForHospital(c)?HOSPITAL_CERT.id:'unassigned'}
function allocationFor(c){return state.confirmedAllocations[c.creditId]||state.manualAllocations[c.creditId]||recommendAllocation(c)}
function hospitalAllocationSnapshot(credits,years=targetFiscalYears(targetApplicationYear(HOSPITAL_CERT),HOSPITAL_CERT)){
  const cs=[...credits];
  const total=cs.reduce((s,c)=>s+Number(c.unit||0),0);
  const yearly=Object.fromEntries(years.map(y=>[y,cs.filter(c=>fy(c.date)===y).reduce((s,c)=>s+Number(c.unit||0),0)]));
  const domains={};
  for(const [d,req] of Object.entries(HOSPITAL_CERT.domains)){
    const dcs=cs.filter(c=>c.domain===d),codes=new Set(dcs.map(c=>c.code));
    domains[d]={units:dcs.reduce((s,c)=>s+Number(c.unit||0),0),items:codes.size,codes,req};
  }
  const mandatoryMissing=[];
  for(const d of ['III','IV','V']){
    const group=CURRICULUM.find(g=>g.domain===d);
    for(const [code] of group?.items||[])if(!domains[d]?.codes?.has(code))mandatoryMissing.push(code);
  }
  const domainItemDeficit=Object.entries(HOSPITAL_CERT.domains).reduce((s,[d,req])=>s+Math.max(0,Number(req.items||0)-Number(domains[d]?.items||0)),0);
  const domainUnitDeficit=Object.entries(HOSPITAL_CERT.domains).reduce((s,[d,req])=>s+Math.max(0,Number(req.units||0)-Number(domains[d]?.units||0)),0);
  const annualDeficit=years.reduce((s,y)=>s+Math.max(0,HOSPITAL_CERT.annualRequired-Number(yearly[y]||0)),0);
  const totalDeficit=Math.max(0,HOSPITAL_CERT.totalRequired-total);
  const externalUsed=cs.filter(c=>c.source!=='jshp'&&c.cpc).reduce((s,c)=>s+Number(c.unit||0),0);
  const meets=mandatoryMissing.length===0&&domainItemDeficit<=1e-9&&domainUnitDeficit<=1e-9&&annualDeficit<=1e-9&&totalDeficit<=1e-9&&externalUsed<=HOSPITAL_CERT.externalMax+1e-9;
  return {total,yearly,domains,mandatoryMissing,domainItemDeficit,domainUnitDeficit,annualDeficit,totalDeficit,externalUsed,meets};
}
function hospitalAllocationImprovement(before,after){
  return [
    before.mandatoryMissing.length-after.mandatoryMissing.length,
    before.domainItemDeficit-after.domainItemDeficit,
    before.domainUnitDeficit-after.domainUnitDeficit,
    before.annualDeficit-after.annualDeficit,
    before.totalDeficit-after.totalDeficit
  ];
}
function compareImprovement(a,b){for(let i=0;i<a.length;i++){if(Math.abs(a[i]-b[i])>1e-9)return a[i]-b[i]}return 0}
function simulateHospitalAllocation(){
  const years=targetFiscalYears(targetApplicationYear(HOSPITAL_CERT),HOSPITAL_CERT);
  const all=allCredits().filter(c=>years.includes(fy(c.date)));
  const fixed=all.filter(c=>state.confirmedAllocations[c.creditId]===HOSPITAL_CERT.id);
  const fixedIds=new Set(fixed.map(c=>c.creditId));
  const selected=[...fixed];
  const selectedIds=new Set(selected.map(c=>c.creditId));
  const candidates=all.filter(c=>!fixedIds.has(c.creditId)&&(c.source==='jshp'||c.cpc));
  const canAdd=c=>{
    if(selectedIds.has(c.creditId))return false;
    if(c.source!=='jshp'&&!c.cpc)return false;
    if(c.source!=='jshp'&&c.cpc){
      const ext=selected.filter(x=>x.source!=='jshp'&&x.cpc).reduce((s,x)=>s+Number(x.unit||0),0);
      if(ext+Number(c.unit||0)>HOSPITAL_CERT.externalMax+1e-9)return false;
    }
    return true;
  };
  let safety=0;
  while(safety++<10000){
    const before=hospitalAllocationSnapshot(selected,years);
    if(before.meets)break;
    let best=null,bestImp=null;
    for(const c of candidates){
      if(!canAdd(c))continue;
      const after=hospitalAllocationSnapshot([...selected,c],years);
      const imp=hospitalAllocationImprovement(before,after);
      if(!imp.some(v=>v>1e-9))continue;
      if(!best){best=c;bestImp=imp;continue}
      const cmp=compareImprovement(imp,bestImp);
      if(cmp>0||(cmp===0&&(c.date<best.date||(c.date===best.date&&String(c.creditId)<String(best.creditId))))){best=c;bestImp=imp}
    }
    if(!best)break;
    selected.push(best);selectedIds.add(best.creditId);
  }
  // Once every requirement is met, remove redundant non-confirmed credits. Newer credits are removed first so older/earlier-expiring credits remain preferred.
  if(hospitalAllocationSnapshot(selected,years).meets){
    const removable=selected.filter(c=>!fixedIds.has(c.creditId)).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.unit||0)-Number(a.unit||0)||String(b.creditId).localeCompare(String(a.creditId)));
    for(const c of removable){
      const trial=selected.filter(x=>x.creditId!==c.creditId);
      if(hospitalAllocationSnapshot(trial,years).meets){
        const idx=selected.findIndex(x=>x.creditId===c.creditId);if(idx>=0)selected.splice(idx,1);selectedIds.delete(c.creditId)
      }
    }
  }
  const selectedSet=new Set(selected.map(c=>c.creditId));
  const assignedUnits=selected.reduce((s,c)=>s+Number(c.unit||0),0);
  const unassignedCredits=all.filter(c=>!selectedSet.has(c.creditId));
  const unassignedUnits=unassignedCredits.reduce((s,c)=>s+Number(c.unit||0),0);
  return {years,all,selected,selectedSet,assignedUnits,unassignedCredits,unassignedUnits,met:hospitalAllocationSnapshot(selected,years).meets};
}
function creditsForHospital(){const years=targetFiscalYears(targetApplicationYear(HOSPITAL_CERT),HOSPITAL_CERT);return allCredits().filter(c=>years.includes(fy(c.date))&&(state.confirmedAllocations[c.creditId]===HOSPITAL_CERT.id||state.manualAllocations[c.creditId]===HOSPITAL_CERT.id||(!state.confirmedAllocations[c.creditId]&&!state.manualAllocations[c.creditId]&&recommendAllocation(c)===HOSPITAL_CERT.id)))}
function hospitalStats(){
  const appYear=targetApplicationYear(HOSPITAL_CERT),years=targetFiscalYears(appYear,HOSPITAL_CERT);let cs=creditsForHospital();
  const internal=cs.filter(c=>c.source==='jshp'),external=cs.filter(c=>c.source!=='jshp'&&c.cpc).sort((a,b)=>a.date.localeCompare(b.date));let usedExternal=[],sumExt=0;
  for(const c of external){if(sumExt+c.unit<=HOSPITAL_CERT.externalMax+1e-9){usedExternal.push(c);sumExt+=c.unit}}
  cs=[...internal,...usedExternal];const total=cs.reduce((s,c)=>s+c.unit,0);const yearly=Object.fromEntries(years.map(y=>[y,cs.filter(c=>fy(c.date)===y).reduce((s,c)=>s+c.unit,0)]));
  const domains={};for(const d of Object.keys(HOSPITAL_CERT.domains)){const dcs=cs.filter(c=>c.domain===d);domains[d]={units:dcs.reduce((s,c)=>s+c.unit,0),items:new Set(dcs.map(c=>c.code)).size,codes:new Set(dcs.map(c=>c.code))}}
  const itemTotals=Object.fromEntries(ITEM_CODES.map(code=>[code,cs.filter(c=>c.code===code).reduce((sum,c)=>sum+c.unit,0)]));
  const shortages=[];if(total<HOSPITAL_CERT.totalRequired)shortages.push({type:'total',text:`総単位 あと ${fmt(HOSPITAL_CERT.totalRequired-total)}単位`});
  years.forEach(y=>{if(yearly[y]<HOSPITAL_CERT.annualRequired)shortages.push({type:'year',year:y,text:`${y}年度 あと ${fmt(HOSPITAL_CERT.annualRequired-yearly[y])}単位`})});
  for(const [d,req] of Object.entries(HOSPITAL_CERT.domains)){if(domains[d].units<req.units)shortages.push({type:'domainUnit',domain:d,text:`${d}領域 あと ${fmt(req.units-domains[d].units)}単位`});if(domains[d].items<req.items)shortages.push({type:'domainItem',domain:d,text:`${d}領域 あと ${req.items-domains[d].items}項目`})}
  const mandatory=[];for(const d of ['III','IV','V'])for(const g of CURRICULUM.filter(g=>g.domain===d))for(const [code,name] of g.items)if(!domains[d].codes.has(code))mandatory.push({code,name});
  const expSoon=cs.filter(c=>fy(c.date)===years[0]).reduce((s,c)=>s+c.unit,0);
  return {appYear,years,credits:cs,total,yearly,domains,itemTotals,shortages,mandatory,externalUsed:sumExt,expSoon}
}
function trainingTotal(t){return (t.creditEntries||[]).reduce((s,e)=>s+Number(e.unit||0),0)}
function trainingItemCount(t){return new Set((t.creditEntries||[]).map(e=>e.code)).size}
function groupTrainingCredits(t){const m={};for(const e of t.creditEntries||[]){if(!m[e.code])m[e.code]={unit:0,count:0};m[e.code].unit+=Number(e.unit||0);m[e.code].count++}return m}
function draftEntries(code){return regDraft.creditEntries.filter(e=>e.code===code)}
function draftCodeTotal(code){return draftEntries(code).reduce((s,e)=>s+Number(e.unit||0),0)}
function draftTotal(){return regDraft.creditEntries.reduce((s,e)=>s+Number(e.unit||0),0)}
function draftItemCount(){return new Set(regDraft.creditEntries.map(e=>e.code)).size}

function app(){const palette=state.settings.theme||'burgundy';document.documentElement.dataset.theme=state.settings.dark?'dark':'light';document.documentElement.dataset.palette=palette;document.body.classList.toggle('darkmode',!!state.settings.dark);const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',state.settings.dark?'#111111':(palette==='teal'?'#236B67':'#8F2942'));const q=currentQualification();const appMeta=isHospitalQualification(q)?`<button class="top-application top-application-btn" onclick="openPlanModal()" aria-label="申請計画を確認"><span>申請予定</span><strong>${targetApplicationYear(q)}年度</strong></button>`:'';const updateBar=updateAvailableVersion?`<div class="update-bar"><span>${updateDeferred?`新しいバージョン ${esc(updateAvailableVersion)} は保存後に自動更新します`:`新しいバージョン ${esc(updateAvailableVersion)} を更新しています`}</span>${updateDeferred?'<button onclick="forceAppUpdate()">今すぐ更新</button>':''}</div>`:'';const toast=updateToast?`<div class="update-toast">${esc(updateToast)}</div>`:'';return `<div class="shell">${updateBar}${toast}<header class="topbar"><button class="menu-btn" onclick="toggleMenu()">${ICONS.menu}</button><div class="top-title"><strong>${esc(q.name)}</strong></div>${appMeta}</header><main class="content">${renderView()}</main>${renderNav()}${menuOpen?renderQualificationDrawer():''}${qualModalOpen?renderQualificationModal():''}${sourceViewerOpen?renderSourceViewer():''}${editConferenceIndex!==null?renderConferenceEditModal():''}${matrixDetail?renderMatrixDetailModal():''}${matrixRequirementDomain?renderMatrixRequirementModal():''}${themePickerOpen?renderThemePickerModal():''}${planModalOpen?renderPlanModal():''}${conferenceCompletionPrompt?renderConferenceCompletionModal():''}</div>`}
function renderNav(){const nav=[['home',ICONS.home,'ホーム'],['history',ICONS.history,'履歴'],['register',ICONS.record,'記録'],['allocation',ICONS.allocation,'配分'],['settings',ICONS.settings,'設定']];return `<nav class="nav">${nav.map(([id,ic,tx])=>`<button class="${currentView===id?'active':''} ${id==='register'?'primary-nav':''}" onclick="go('${id}')"><span class="nav-icon">${ic}</span><span>${tx}</span></button>`).join('')}</nav>`}
function renderView(){if(currentView==='home')return renderHome();if(currentView==='history')return renderHistory();if(currentView==='register')return renderRegister();if(currentView==='allocation')return renderAllocation();if(currentView==='settings')return renderSettings();return ''}

function renderHome(){const q=currentQualification();if(!isHospitalQualification(q))return renderCustomQualificationHome(q);const s=hospitalStats();const mandatorySet=new Set(s.mandatory.map(x=>x.code));return `
<section class="card status-card">
  <div class="status-head"><div><h2>現在の取得状況</h2></div></div>
  <div class="status-section total-status">
    <div class="status-label">総合取得単位</div>
    <div class="status-total"><strong>${fmt(s.total)}</strong><span>/ 50単位</span></div>
    <div class="progress"><i style="width:${Math.min(100,s.total/50*100)}%"></i></div>
  </div>
  <div class="status-section">
    <div class="status-label">年度別取得単位</div>
    <div class="status-grid">${s.years.map(y=>`<div class="status-row ${s.yearly[y]<HOSPITAL_CERT.annualRequired?'is-unmet':''}"><span>${y}年度</span><strong>${fmt(s.yearly[y])} / ${HOSPITAL_CERT.annualRequired}単位</strong></div>`).join('')}</div>
  </div>
  <div class="status-section">
    <div class="status-label">項目別取得単位</div>
    <div class="status-grid domain-status-grid">${Object.entries(HOSPITAL_CERT.domains).map(([d,r])=>`<div class="status-row ${s.domains[d].units<r.units||s.domains[d].items<r.items?'is-unmet':''}"><span>${d}領域</span><strong>${fmt(s.domains[d].units)} / ${r.units}単位 <em>${s.domains[d].items} / ${r.items}項目</em></strong></div>`).join('')}</div>
    ${s.mandatory.length?`<div class="mandatory-list"><div class="mandatory-title">必須未取得</div>${s.mandatory.map(x=>`<div class="mandatory-item"><span>${x.code} ${esc(x.name)}</span><strong>${fmt(s.itemTotals[x.code]||0)}単位</strong></div>`).join('')}</div>`:''}
  </div>
</section>
<section class="card simulation-mini"><div class="row between"><div><div class="section-title" style="margin:0">配分シミュレーション</div></div><button class="text-link" onclick="go('allocation')">詳細 ${ICONS.chevron}</button></div>${(()=>{const a=simulateHospitalAllocation();return `<div class="sim-lines"><div><span>病院薬学認定</span><strong>${fmt(a.assignedUnits)}単位</strong></div><div><span>未割当</span><strong>${fmt(a.unassignedUnits)}単位</strong></div></div>`})()}</section>
<section class="card schedule-card"><div class="section-title">申請・試験</div><div class="metric"><span>次回申請日程</span><strong>未発表</strong></div><div class="metric"><span>試験日</span><strong>未発表</strong></div></section>
<section class="card requirements-compact"><button class="requirements-toggle" onclick="requirementsOpen=!requirementsOpen;render()"><span>認定要件を確認</span><span class="chev ${requirementsOpen?'open':''}">${ICONS.chevron}</span></button>${requirementsOpen?`<div class="requirements-body"><div>過去3年度 合計50単位以上</div><div>各年度10単位以上</div><div>Ⅰ：1項目以上・2単位以上</div><div>Ⅱ：2項目以上・4単位以上</div><div>Ⅲ：全2項目・4単位以上</div><div>Ⅳ：全2項目・4単位以上</div><div>Ⅴ：全3項目・6単位以上</div><div>日病薬以外の対象単位 最大10単位</div></div>`:''}</section>`}
function renderCustomQualificationHome(q){const reqs=Object.entries(q.requirementTypes||{}).filter(([,v])=>v);return `<section class="compact-target"><div><span class="muted-label">TARGET</span><strong>${esc(q.name)}</strong></div><div class="target-year">要件未設定</div></section><section class="card shortage-card"><div class="kicker">NOW</div><h2>現在の不足</h2><div class="notice">この資格の公式テンプレートを追加すると、ここに単位・実務経験・症例・論文・学会発表などの不足だけを表示します。</div></section><section class="card"><div class="section-title">管理する要件</div>${reqs.map(([k])=>`<div class="metric"><span>${requirementLabel(k)}</span><strong>未設定</strong></div>`).join('')}</section>`}

function renderRegister(){if(!isHospitalQualification())return `<section class="card"><div class="section-title">${esc(currentQualification().name)} の記録</div><div class="notice">この資格の公式要件テンプレートはまだ未設定です。</div></section>`;const body=registerMode==='manual'?renderManualRegister():registerMode==='conference'?renderConferenceRegister():registerMode==='planned'?renderPlannedRegister():renderExcelRegister();return `<section class="record-switch"><button class="${registerMode==='manual'?'on':''}" onclick="setRegisterMode('manual')">入力</button><button class="${registerMode==='conference'?'on':''}" onclick="setRegisterMode('conference')">学会プログラム</button><button class="${registerMode==='planned'?'on':''}" onclick="setRegisterMode('planned')">予定</button><button class="${registerMode==='excel'?'on':''}" onclick="setRegisterMode('excel')">Excel</button></section>${body}`}
function renderManualRegister(){const sourceRef=renderManualSourceReference();return `${sourceRef}<section class="card"><div class="field"><label>取得日</label><input class="input" type="date" value="${regDraft.date}" onchange="regDraft.date=this.value"></div><div class="field"><label>研修名</label><input class="input" value="${esc(regDraft.name)}" placeholder="研修会・学会名" onchange="regDraft.name=this.value"></div><div class="row between"><div><div class="section-title" style="margin-bottom:2px">取得項目</div></div><span class="pill accent">${fmt(draftTotal())}単位</span></div>${CURRICULUM.map(renderDomain).join('')}<button class="btn accent block" style="margin-top:16px" onclick="saveTraining()">${editingId?'変更を保存':'登録する'}</button>${editingId?'<button class="btn delete-record block" style="margin-top:8px" onclick="deleteCurrentTraining()">全部削除</button><button class="btn ghost block" style="margin-top:8px" onclick="cancelEdit()">キャンセル</button>':''}</section>`}
function renderCreditBulkEditor(){const entries=regDraft.creditEntries||[];if(!entries.length)return '';if(!creditSelectMode)return `<div class="credit-bulk-head"><span><strong>登録済み単位</strong><small>${entries.length}明細</small></span><button onclick="startCreditSelection()">選択して削除</button></div>`;const n=selectedCreditEntryIds.size;return `<div class="credit-bulk-box"><div class="credit-bulk-toolbar"><button onclick="toggleSelectAllCredits()">${n===entries.length?'選択解除':'すべて選択'}</button><strong>${n}件選択</strong><button class="danger" onclick="deleteSelectedCredits()" ${n?'':'disabled'}>削除</button><button onclick="cancelCreditSelection()">キャンセル</button></div><div class="credit-bulk-list">${entries.map(e=>{const on=selectedCreditEntryIds.has(e.id);return `<button class="credit-bulk-row ${on?'selected':''}" onclick="toggleCreditSelection('${e.id}')"><span class="credit-check">${on?'✓':''}</span><span><strong>${esc(e.code||'要確認')} ${fmt(e.unit)}単位</strong>${e.title?`<small>${esc(e.title)}</small>`:''}</span></button>`}).join('')}</div></div>`}
function startCreditSelection(){creditSelectMode=true;selectedCreditEntryIds.clear();render()}
function cancelCreditSelection(){creditSelectMode=false;selectedCreditEntryIds.clear();render()}
function toggleCreditSelection(id){if(selectedCreditEntryIds.has(id))selectedCreditEntryIds.delete(id);else selectedCreditEntryIds.add(id);render()}
function toggleSelectAllCredits(){const entries=regDraft.creditEntries||[];if(selectedCreditEntryIds.size===entries.length)selectedCreditEntryIds.clear();else selectedCreditEntryIds=new Set(entries.map(e=>e.id));render()}
function deleteSelectedCredits(){const n=selectedCreditEntryIds.size;if(!n)return;if(!confirm(`${n}件の単位明細を削除しますか？`))return;regDraft.creditEntries=(regDraft.creditEntries||[]).filter(e=>!selectedCreditEntryIds.has(e.id));selectedCreditEntryIds.clear();creditSelectMode=false;render()}
function renderManualSourceReference(){if(!manualSourceConferenceId)return '';const c=(conferenceDraft&&conferenceDraft.id===manualSourceConferenceId)?conferenceDraft:state.conferences.find(x=>x.id===manualSourceConferenceId);if(!c)return '';const isImage=(c.sourceType||'').startsWith('image/');if(isImage&&selectedSourceURL)return `<section class="manual-source-reference"><div class="manual-source-head"><div><strong>参照画像</strong><span>${esc(c.fileName||'アップロード画像')}</span></div><button class="icon-text-btn" onclick="openSourceViewer()">${ICONS.eye}<span>拡大</span></button></div><div class="manual-source-image"><img src="${selectedSourceURL}" alt="参照画像"></div></section>`;return `<section class="card manual-source-file"><div><strong>資料を見ながら入力</strong><div class="small">${esc(c.fileName||'資料')}</div></div><button class="icon-text-btn" onclick="openSourceViewer()">${ICONS.eye}<span>資料</span></button></section>`}
function renderDomain(g){return `<details class="domain" data-domain="${g.domain}" ${g.domain==='I'?'open':''}><summary><span>${g.domain}. ${g.title}</span><span>${g.items.reduce((a,[c])=>a+draftCodeTotal(c),0)?fmt(g.items.reduce((a,[c])=>a+draftCodeTotal(c),0))+'単位':'＋'}</span></summary>${g.items.map(([c,n])=>renderItemRow(c,n)).join('')}</details>`}
function renderItemRow(code,name){const entries=draftEntries(code),total=draftCodeTotal(code);return `<div class="item-row multi"><div class="row between item-heading"><div><div class="item-code">${code}</div><div class="item-name">${name}</div></div>${total?`<span class="item-total">${fmt(total)}単位</span>`:''}</div><div class="add-unit-btns"><button onclick="addCredit('${code}',0.5)">＋0.5</button><button onclick="addCredit('${code}',1)">＋1.0</button><button class="custom-unit" onclick="addCustomCredit('${code}')">単位を入力</button></div>${entries.length?`<div class="entry-chips">${entries.map(e=>`<button class="entry-chip" onclick="removeCredit('${e.id}')"><span>${fmt(e.unit)}</span><small>単位</small><b>×</b></button>`).join('')}</div>`:''}</div>`}

function renderPlannedRegister(){const plans=[...(state.plans||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));return `<section class="card"><div class="section-title">参加予定を登録</div><div class="field"><label>参加予定日</label><input class="input" type="date" value="${esc(planDraft.date)}" onchange="planDraft.date=this.value"></div><div class="field"><label>研修・学会名</label><input class="input" value="${esc(planDraft.name)}" placeholder="研修会・学会名" onchange="planDraft.name=this.value"></div><button class="btn accent block" onclick="savePlannedTraining()">${editingPlanId?'変更を保存':'予定を登録'}</button>${editingPlanId?'<button class="btn ghost block" style="margin-top:8px" onclick="cancelPlanEdit()">キャンセル</button>':''}</section>${plans.length?`<section class="card planned-list"><div class="section-title">登録済みの予定</div>${plans.map(p=>`<div class="planned-row"><button class="planned-main" onclick="editPlannedTraining('${p.id}')"><span>${esc(p.date)}</span><strong>${esc(p.name)}</strong></button><button class="planned-delete" onclick="deletePlannedTraining('${p.id}')">削除</button></div>`).join('')}</section>`:'<section class="card empty">登録済みの予定はありません。</section>'}`}
function savePlannedTraining(){const name=(planDraft.name||'').trim();if(!planDraft.date||!name)return alert('参加予定日と研修・学会名を入力してください。');const now=new Date().toISOString();if(editingPlanId){state.plans=(state.plans||[]).map(p=>p.id===editingPlanId?{...p,date:planDraft.date,name,updatedAt:now}:p)}else{state.plans=state.plans||[];state.plans.push({id:uid(),date:planDraft.date,name,createdAt:now,updatedAt:now})}editingPlanId=null;planDraft=freshPlanDraft();saveData();render()}
function editPlannedTraining(id){const p=(state.plans||[]).find(x=>x.id===id);if(!p)return;editingPlanId=id;planDraft={date:p.date,name:p.name};render({top:true})}
function cancelPlanEdit(){editingPlanId=null;planDraft=freshPlanDraft();render()}
function deletePlannedTraining(id){const p=(state.plans||[]).find(x=>x.id===id);if(!p)return;if(!confirm(`「${p.name}」の予定を削除しますか？`))return;state.plans=state.plans.filter(x=>x.id!==id);if(editingPlanId===id){editingPlanId=null;planDraft=freshPlanDraft()}saveData();render()}

function renderExcelRegister(){if(excelLoading)return `<section class="card"><div class="section-title">Excelから取り込む</div><div class="notice">Excelファイルを読み取っています…</div></section>`;if(!excelCandidates.length)return `<section class="card"><div class="section-title">Excelから取り込む</div>${excelError?`<div class="notice" style="margin-bottom:10px">${esc(excelError)}</div>`:''}<label class="upload excel-upload"><input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onchange="loadExcelSource(this.files?.[0])"><strong>Excelファイルを選択</strong></label></section>`;const selected=excelCandidates.filter(x=>x.selected).length;return `<section class="card excel-import-head"><div class="row between"><div><div class="section-title" style="margin-bottom:3px">Excelから取り込む</div><div class="small">${esc(excelFileName)} ・ ${excelCandidates.length}件</div></div><button class="text-link" onclick="clearExcelImport()">選び直す</button></div></section><section class="excel-candidates">${excelCandidates.map((c,i)=>renderExcelCandidate(c,i)).join('')}</section><section class="card sticky-summary ${selected?'has-pending':'is-empty'}"><div class="row between"><div><div class="small">登録する候補</div><strong class="summary-total">${selected}件</strong></div></div><button class="btn accent block" onclick="registerExcelCandidates()" ${selected?'':'disabled'}>選択した候補を登録</button></section>`}
function renderExcelCandidate(c,i){return `<section class="card excel-candidate ${c.selected?'selected':''}"><label class="excel-select"><input type="checkbox" ${c.selected?'checked':''} onchange="setExcelCandidateSelected(${i},this.checked)"><span>登録する</span></label><div class="field"><label>取得日</label><input class="input" type="date" value="${esc(c.date||'')}" onchange="updateExcelCandidate(${i},'date',this.value)"></div><div class="field"><label>研修名</label><input class="input" value="${esc(c.name||'')}" placeholder="研修会・学会名" onchange="updateExcelCandidate(${i},'name',this.value)"></div><div class="excel-credit-list">${(c.credits||[]).map((cr,j)=>`<div class="excel-credit-row"><select class="select" onchange="updateExcelCredit(${i},${j},'code',this.value)"><option value="">要確認</option>${ITEM_CODES.map(code=>`<option value="${code}" ${cr.code===code?'selected':''}>${code} ${esc(itemName(code))}</option>`).join('')}</select><input class="input" type="number" min="0" step="0.5" value="${Number(cr.unit||0)||''}" placeholder="単位" onchange="updateExcelCredit(${i},${j},'unit',this.value)"></div>`).join('')}</div>${c.sourceSheet?`<div class="small excel-source-sheet">${esc(c.sourceSheet)}</div>`:''}</section>`}
function setExcelCandidateSelected(i,on){if(!excelCandidates[i])return;excelCandidates[i].selected=!!on;render()}
function updateExcelCandidate(i,key,value){if(!excelCandidates[i])return;excelCandidates[i][key]=value}
function updateExcelCredit(i,j,key,value){const c=excelCandidates[i],cr=c?.credits?.[j];if(!cr)return;cr[key]=key==='unit'?Number(value||0):value}
function clearExcelImport(){excelCandidates=[];excelFileName='';excelError='';render({top:true})}
function normalizeExcelHeader(v=''){return String(v??'').replace(/[\s　\n\r]+/g,'').replace(/[()（）]/g,'').toLowerCase()}
function excelColIndex(headers,aliases){const hs=headers.map(normalizeExcelHeader);for(const alias of aliases){const a=normalizeExcelHeader(alias),exact=hs.findIndex(h=>h===a);if(exact>=0)return exact}for(const alias of aliases){const a=normalizeExcelHeader(alias),partial=hs.findIndex(h=>h.includes(a)||a.includes(h));if(partial>=0)return partial}return -1}
function excelDateToISO(v,XLSX){if(v instanceof Date&&!Number.isNaN(v.getTime()))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;if(typeof v==='number'&&XLSX?.SSF?.parse_date_code){const d=XLSX.SSF.parse_date_code(v);if(d?.y&&d?.m&&d?.d)return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}const t=String(v??'').trim();let m=t.match(/(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;m=t.match(/(20\d{2})(\d{2})(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:''}
function curriculumCodeFromText(v=''){const t=String(v??'').replace(/Ⅰ/g,'I').replace(/Ⅱ/g,'II').replace(/Ⅲ/g,'III').replace(/Ⅳ/g,'IV').replace(/Ⅴ/g,'V');const m=t.match(/(III|IV|II|V|I)\s*[-－–—ー]?\s*([1-6])/i);if(m){const code=`${m[1].toUpperCase()}-${m[2]}`;if(ITEM_CODES.includes(code))return code}const norm=x=>String(x||'').replace(/[\s　()（）・\/／\-－–—ー]/g,'');const nt=norm(t);for(const g of CURRICULUM)for(const [code,name] of g.items){const nn=norm(name);if(nn&&nt.includes(nn))return code}return ''}
function excelUnitValue(v=''){if(typeof v==='number'&&Number.isFinite(v))return v;const m=String(v??'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):0}
async function ensureXlsx(){if(window.XLSX)return window.XLSX;const sources=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];let last=null;for(const url of sources){try{await loadExternalScript(url);if(window.XLSX)return window.XLSX}catch(e){last=e}}throw last||new Error('Excel読取ライブラリを読み込めませんでした。')}
function extractExcelCandidates(workbook,XLSX){const out=[];for(const sheetName of workbook.SheetNames||[]){const ws=workbook.Sheets[sheetName];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});if(!rows.length)continue;let headerRow=-1,cols=null;for(let r=0;r<Math.min(rows.length,25);r++){const h=rows[r]||[];const date=excelColIndex(h,['取得日','受講日','研修日','日付','開催日']);const name=excelColIndex(h,['研修名','研修会名','学会名','講演名','研修会・学会名']);const unit=excelColIndex(h,['取得単位','単位数','単位','日病薬認定単位']);const code=excelColIndex(h,['項目コード','研修項目','項目','区分','カリキュラム']);const item=excelColIndex(h,['項目名','研修項目名','カリキュラム名']);if((date>=0||name>=0)&&unit>=0&&(code>=0||item>=0)){headerRow=r;cols={date,name,unit,code,item};break}}if(headerRow<0)continue;for(let r=headerRow+1;r<rows.length;r++){const row=rows[r]||[];if(!row.some(v=>String(v??'').trim()))continue;const date=cols.date>=0?excelDateToISO(row[cols.date],XLSX):'';const name=cols.name>=0?String(row[cols.name]??'').trim():'';const unit=cols.unit>=0?excelUnitValue(row[cols.unit]):0;const codeText=[cols.code>=0?row[cols.code]:'',cols.item>=0?row[cols.item]:''].filter(Boolean).join(' ');const code=curriculumCodeFromText(codeText)||curriculumCodeFromText(row.join(' '));if(!(unit>0)||(!date&&!name)||(!code&&!codeText))continue;out.push({date,name,credits:[{code,unit}],sourceSheet:sheetName,selected:true,_row:r+1})}}
  const grouped=[];const map=new Map();for(const x of out){const key=x.date&&x.name?`${x.date}\u0000${x.name}`:`__row__${grouped.length}`;if(map.has(key)){map.get(key).credits.push(...x.credits)}else{const c={...x,credits:[...x.credits]};grouped.push(c);map.set(key,c)}}return grouped}
async function loadExcelSource(file){if(!file)return;excelLoading=true;excelError='';excelCandidates=[];excelFileName=file.name;render();try{const XLSX=await ensureXlsx();let workbook;if(/\.csv$/i.test(file.name)){const text=await file.text();workbook=XLSX.read(text,{type:'string',cellDates:true})}else{const buf=await file.arrayBuffer();workbook=XLSX.read(buf,{type:'array',cellDates:true})}excelCandidates=extractExcelCandidates(workbook,XLSX);if(!excelCandidates.length)excelError='取得日・研修名・単位・項目を読み取れる行が見つかりませんでした。';}catch(err){console.error('Excel取込エラー',err);excelError=(err?.message||'Excelファイルを読み取れませんでした。')}finally{excelLoading=false;render({top:true})}}
function registerExcelCandidates(){const selected=excelCandidates.filter(x=>x.selected);if(!selected.length)return;for(const c of selected){if(!c.date||!String(c.name||'').trim())return alert('取得日または研修名が未入力の候補があります。');if(!(c.credits||[]).length||(c.credits||[]).some(cr=>!(Number(cr.unit)>0)))return alert('単位数を確認してください。')}for(const c of selected){const t={id:uid(),date:c.date,name:String(c.name).trim(),source:'excel',cpc:false,hopessId:'',memo:'Excelから取り込み',files:[],creditEntries:(c.credits||[]).map(cr=>({id:uid(),code:cr.code||'要確認',unit:Number(cr.unit||0),title:''}))};addOrMergeTraining(t)}excelCandidates=[];excelFileName='';excelError='';saveData();historyMode='matrix';currentView='history';registerMode='manual';render({top:true});setTimeout(maybeApplyDeferredUpdate,0)}


function renderConferenceRegister(){const s=hospitalStats();if(!conferenceDraft)return `${renderSavedConferenceList()}<section class="card"><div class="section-title" style="margin-bottom:3px">学会プログラムから登録</div><label class="upload source-upload"><input type="file" accept="application/pdf,image/*" onchange="loadConferenceSource(this.files?.[0])"><strong>PDF・画像を選択</strong></label></section>`;
  if(conferenceDraft.analysisPending)return `<section class="card conference-head"><div class="row between"><div><div class="kicker">ANALYZING</div><div class="section-title" style="margin-bottom:3px">${esc(conferenceDraft.name)}</div><div class="small">${esc(conferenceDraft.fileName)} を解析しています</div></div><button class="icon-text-btn" onclick="openSourceViewer()">${ICONS.eye}<span>資料</span></button></div><div class="notice" style="margin-top:12px">${esc(conferenceDraft.analysisMessage||'PDFから文字と単位区分を読み取っています…')}</div></section>`;
  if(conferenceDraft.analysisError&&!conferenceDraft.sessions.length)return `<section class="card conference-head"><div class="row between"><div><div class="kicker">SOURCE</div><div class="section-title" style="margin-bottom:3px">${esc(conferenceDraft.name)}</div><div class="small">${esc(conferenceDraft.fileName)}</div></div><button class="icon-text-btn" onclick="openSourceViewer()">${ICONS.eye}<span>資料</span></button></div><div class="notice" style="margin-top:12px">${esc(conferenceDraft.analysisError)}</div><button class="btn soft block" style="margin-top:10px" onclick="startManualFromConference()">${(conferenceDraft.sourceType||'').startsWith('image/')?'画像を見ながら入力':'資料を見ながら入力'}</button><button class="btn ghost block" style="margin-top:8px" onclick="leaveConferenceDraft()">学会一覧に戻る</button></section>`;
  const pending=conferenceDraft.sessions.filter(x=>x.status==='attended'&&!x.registeredAt);const summary=summarizeConference(pending);return `<section class="card conference-head"><div class="row between"><div><div class="kicker">CONFERENCE</div><div class="section-title" style="margin-bottom:3px">${esc(conferenceDraft.name)}</div><div class="small">${conferenceDraft.sessions.length}件・資料の順番を維持${conferenceDraft.autoParsed?'・自動抽出':''}・自動保存</div></div>${conferenceDraft.fileName?`<button class="icon-text-btn" onclick="openSourceViewer()">${ICONS.eye}<span>資料</span></button>`:''}</div>${conferenceDraft.fileName?`<div class="source-chip">${esc(conferenceDraft.fileName)}</div>`:''}<label class="conference-name-field"><span>登録名</span><input value="${esc(conferenceDraft.name)}" onchange="setConferenceName(this.value)"></label>${renderConferenceRegisteredSummary(conferenceDraft)}<label class="conference-date-field"><span>今回登録する取得日</span><input type="date" value="${conferenceDraft.date}" onchange="setConferenceDate(this.value)"></label>${conferenceDraft.analysisWarning?`<div class="notice" style="margin-top:10px">${esc(conferenceDraft.analysisWarning)}</div>`:''}<button class="conference-back-link" onclick="leaveConferenceDraft()">← 学会一覧に戻る</button></section><section class="card no-pad"><div class="conference-guide"><span>参加状況をタップ</span><span class="legend-dot"></span><b>登録済みは日付付きで保持</b></div><div class="conference-list">${conferenceDraft.sessions.map((x,i)=>renderConferenceRow(x,i,s)).join('')}</div></section><section class="card sticky-summary ${pending.length?'has-pending':'is-empty'}"><div class="row between"><div><div class="small">今回登録する参加講演</div><strong class="summary-total">${fmt(summary.total)}単位</strong></div><div class="summary-codes">${Object.entries(summary.byCode).slice(0,5).map(([c,u])=>`<span>${c} ${fmt(u)}</span>`).join('')}${Object.keys(summary.byCode).length>5?'<span>…</span>':''}</div></div><button class="btn accent block" onclick="saveConferenceTraining()" ${pending.length?'':'disabled'}>${pending.length?'参加講演を登録':'登録する講演がありません'}</button></section>`}
function renderSavedConferenceList(){const cs=[...(state.conferences||[])].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));if(!cs.length)return '';return `<section class="card saved-conferences"><div class="section-title">取り込み済みの学会</div><div class="small" style="margin-top:-5px;margin-bottom:8px">途中から続けて登録できます。</div>${cs.map(c=>{const registered=(c.sessions||[]).filter(x=>x.registeredAt).length,notParticipated=Math.max(0,(c.sessions||[]).length-registered);return `<div class="saved-conference-row"><button class="saved-conference-main" onclick="openSavedConference('${c.id}')"><strong>${esc(c.name)}</strong><span>${esc(c.fileName||'保存済みプログラム')}</span><small>参加登録済み ${registered}件 ・ 未参加 ${notParticipated}件</small></button><button class="saved-conference-delete" onclick="deleteSavedConference('${c.id}')">削除</button></div>`}).join('')}</section>`}
function renderConferenceRegisteredSummary(c){const groups={};for(const s of c.sessions||[]){if(!s.registeredAt)continue;const d=s.registeredDate||'登録済み';if(!groups[d])groups[d]={count:0,total:0};groups[d].count++;for(const cr of s.credits||[])groups[d].total+=Number(cr.unit||0)}const rows=Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));return rows.length?`<div class="conference-day-summary">${rows.map(([d,v])=>`<span><b>${esc(d)}</b>${v.count}件・${fmt(v.total)}単位</span>`).join('')}</div>`:''}

function relevanceForSession(session,s){const codes=(session.credits||[]).map(c=>c.code).filter(Boolean);for(const c of codes){const m=s.mandatory.find(x=>x.code===c);if(m)return {label:'必須未取得',level:'high'}}for(const c of codes){const d=(c||'').split('-')[0];if(s.shortages.some(x=>x.domain===d))return {label:`${d}領域の不足`,level:'mid'}}if((session.credits||[]).some(c=>!c.code))return {label:'区分を確認',level:'check'};return null}
function renderConferenceRow(x,i,s){const rel=relevanceForSession(x,s),credits=(x.credits||[]),needsCheck=!credits.length||credits.some(c=>!c.code||!(Number(c.unit)>0)),registered=!!x.registeredAt;return `<div class="conference-row ${registered?'is-registered':x.status==='attended'?'is-attended':''}"><div class="conf-order">${String(i+1).padStart(2,'0')}</div><div class="conf-main"><div class="conf-title">${esc(x.title)}</div><div class="conf-meta">${credits.length?credits.map(c=>`${c.code||'要確認'} ${Number(c.unit)>0?fmt(c.unit)+'単位':'単位要確認'}`).join(' ／ '):'単位区分 要確認'}${x.page?` ・ p.${x.page}`:''}</div><div class="conf-tags">${registered?`<span class="registered-tag">${esc(x.registeredDate||'')} 登録済み</span>`:(rel?`<span class="recommend-tag ${rel.level}">${rel.label}</span>`:'')}${!registered&&needsCheck?'<button class="manual-tag" onclick="editConferenceSession('+i+')">手動で確認</button>':''}</div></div><div class="conf-actions">${registered?'<span class="conf-locked">登録済み</span>':`<button class="status-btn ${x.status==='attended'?'on attended':''}" onclick="cycleConferenceStatus(${i},'attended')">参加</button><button class="edit-mini" onclick="editConferenceSession(${i})">編集</button>`}</div></div>`}

function summarizeConference(rows){const byCode={};let total=0;for(const r of rows)for(const c of r.credits||[]){total+=Number(c.unit||0);if(c.code)byCode[c.code]=(byCode[c.code]||0)+Number(c.unit||0)}return {total,byCode}}

function renderHistory(){
  const count=historyMode==='timeline'&&state.trainings.length?`<div class="history-tools"><span class="small">${state.trainings.length}件の記録</span></div>`:'';
  return `<section class="history-tabs"><button class="${historyMode==='matrix'?'on':''}" onclick="setHistoryMode('matrix')">項目別一覧</button><button class="${historyMode==='timeline'?'on':''}" onclick="setHistoryMode('timeline')">研修履歴</button></section>${count}${historyMode==='matrix'?renderItemMatrix():renderHistoryTimeline()}`
}
function setHistoryMode(mode){historyMode=mode;render()}
function renderHistoryTimeline(){
  const ts=[...state.trainings].sort((a,b)=>b.date.localeCompare(a.date));
  return ts.length?ts.map(t=>{
    const g=groupTrainingCredits(t);
    return `<section class="card history-card editable-history-card" role="button" tabindex="0" aria-label="${esc(t.name)}を編集" onclick="editTraining('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();editTraining('${t.id}')}"><div class="history-date">${esc(t.date)} ・ ${fy(t.date)}年度</div><div class="history-title">${esc(t.name)}</div><div class="credit-tags">${Object.entries(g).map(([c,v])=>`<span class="credit-tag">${c} ${fmt(v.unit)}単位${v.count>1?`・${v.count}件`:''}</span>`).join('')}</div><div class="small" style="margin-top:10px">計 ${fmt(trainingTotal(t))}単位</div></section>`
  }).join(''):'<section class="card empty">まだ記録がありません。</section>'
}
function trainingCodeEntries(t,code){return (t.creditEntries||[]).filter(e=>e.code===code)}
function trainingCodeTotal(t,code){return trainingCodeEntries(t,code).reduce((s,e)=>s+Number(e.unit||0),0)}
function itemGrandTotal(code){return state.trainings.reduce((s,t)=>s+trainingCodeTotal(t,code),0)}
function matrixItemNameHtml(name=''){const text=String(name||''),i=text.indexOf('（');if(i>0)return `<span class="matrix-name-line matrix-name-main">${esc(text.slice(0,i))}</span><span class="matrix-name-line matrix-name-sub">${esc(text.slice(i))}</span>`;return `<span class="matrix-name-line matrix-name-main">${esc(text)}</span>`}
function renderItemMatrix(){const ts=[...state.trainings].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));if(!ts.length)return '<section class="card empty">まだ記録がありません。研修を登録すると、ここに「いつ・どの研修で・何単位取ったか」が表示されます。</section>';const rows=CURRICULUM.flatMap(g=>g.items.map(([code,name])=>({code,name,domain:g.domain})));return `<section class="card matrix-card"><div class="matrix-intro"><div><div class="section-title" style="margin-bottom:3px">項目別取得一覧</div><div class="small">横スクロールできます。数値セルで内訳、項目名で領域要件を確認できます。</div></div></div><div class="matrix-scroll"><table class="credit-matrix"><thead><tr><th class="matrix-item-head">項目</th>${ts.map(t=>`<th class="matrix-training-head"><span>${esc(shortDate(t.date))}</span><small>${esc(t.name)}</small></th>`).join('')}<th class="matrix-total-head">合計</th></tr></thead><tbody>${rows.map(r=>`<tr><th class="matrix-item"><button class="matrix-item-btn" onclick="openMatrixRequirement('${r.domain}')"><strong>${r.code}</strong><small>${matrixItemNameHtml(r.name)}</small></button></th>${ts.map(t=>{const entries=trainingCodeEntries(t,r.code),total=entries.reduce((s,e)=>s+Number(e.unit||0),0);return `<td>${total?`<button class="matrix-unit" onclick="openMatrixDetail('${t.id}','${r.code}')"><strong>${fmt(total)}</strong></button>`:'<span class="matrix-empty"></span>'}</td>`}).join('')}<td class="matrix-total"><strong>${fmt(itemGrandTotal(r.code))}</strong></td></tr>`).join('')}</tbody></table></div></section>`}
function shortDate(date){if(!date)return '';const p=date.split('-');return p.length===3?`${Number(p[1])}/${Number(p[2])}`:date}
function openMatrixDetail(trainingId,code){matrixDetail={trainingId,code};render()}
function closeMatrixDetail(){matrixDetail=null;render()}
function domainCurriculum(domain){return CURRICULUM.find(g=>g.domain===domain)}
function matrixRequirementStats(domain){const s=hospitalStats(),req=HOSPITAL_CERT.domains[domain],group=domainCurriculum(domain);if(!req||!group)return null;const totalItems=group.items.length,current=s.domains[domain]||{units:0,items:0,codes:new Set()},remainUnits=Math.max(0,Number(req.units||0)-Number(current.units||0)),remainItems=Math.max(0,Number(req.items||0)-Number(current.items||0)),itemRule=req.all||Number(req.items)>=totalItems?`${totalItems}項目すべて`:`${totalItems}項目のうち${Number(req.items||0)}項目以上`,remainParts=[];if(remainItems>0)remainParts.push(`${remainItems}項目`);if(remainUnits>0)remainParts.push(`${fmt(remainUnits)}単位`);return {domain,group,req,totalItems,current,remainUnits,remainItems,itemRule,remainText:remainParts.length?remainParts.join('・'):'達成済み'}}
function openMatrixRequirement(domain){matrixRequirementDomain=domain;render()}
function closeMatrixRequirement(){matrixRequirementDomain='';render()}
function renderMatrixRequirementModal(){const info=matrixRequirementStats(matrixRequirementDomain);if(!info){matrixRequirementDomain='';return ''}return `<div class="modal-back matrix-req-back" onclick="if(event.target===this)closeMatrixRequirement()"><section class="modal matrix-req-sheet" onclick="event.stopPropagation()"><div class="sheet-grab"></div><div class="matrix-req-top"><div class="matrix-req-icon">${ICONS.file}</div><div><h3>${info.domain}領域の認定要件</h3><div class="small">${esc(info.group.title)}</div></div><button class="close-x" onclick="closeMatrixRequirement()">×</button></div><div class="matrix-req-grid"><div><span>必須項目</span><strong>${info.itemRule}</strong></div><div><span>必須単位</span><strong>${fmt(info.req.units)}単位以上</strong></div><div><span>現在</span><strong>${info.current.items}項目 / ${fmt(info.current.units)}単位</strong></div><div><span>あと</span><strong class="accent">${info.remainText}</strong></div></div><div class="matrix-req-tags">${info.group.items.map(([code,name])=>`<span>${code} ${esc(name)}</span>`).join('')}</div></section></div>`}
function renderMatrixDetailModal(){const t=state.trainings.find(x=>x.id===matrixDetail.trainingId);if(!t){matrixDetail=null;return ''}const code=matrixDetail.code,entries=trainingCodeEntries(t,code),total=entries.reduce((sum,e)=>sum+Number(e.unit||0),0);const breakdown=entries.length>1?`<div class="matrix-detail-list">${entries.map(e=>`<div class="matrix-detail-row"><div><strong>${fmt(e.unit)}単位</strong>${e.title?`<span>${esc(e.title)}</span>`:''}</div><small>${e.sourcePage?`PDF ${e.sourcePage}ページ`:''}${e.sourceOrder?`${e.sourcePage?' ・ ':''}掲載順 ${e.sourceOrder}`:''}</small></div>`).join('')}</div>`:'';return `<div class="modal-back" onclick="if(event.target===this)closeMatrixDetail()"><section class="modal matrix-detail-modal"><div class="row between"><div><div class="kicker">DETAIL</div><h3>${code} ${esc(curriculumName(code))}</h3></div><button class="close-x" onclick="closeMatrixDetail()">×</button></div><div class="matrix-detail-training"><strong>${esc(t.name)}</strong><span>${esc(t.date)} ・ ${fy(t.date)}年度</span></div><div class="matrix-detail-unit-only"><strong>${fmt(total)}単位</strong></div>${breakdown}</section></div>`}

function renderAllocation(){
  const sim=simulateHospitalAllocation();
  const required=HOSPITAL_CERT.totalRequired;
  const rows=[...sim.all].sort((a,b)=>a.date.localeCompare(b.date)||(a.sourceOrder||0)-(b.sourceOrder||0)||a.name.localeCompare(b.name));
  return `<section class="card allocation-overview"><div class="section-title">配分シミュレーション</div><div class="single-alloc-summary"><div class="primary"><span>病院薬学認定</span><strong>${fmt(sim.assignedUnits)} / ${fmt(required)}単位</strong></div><div><span>未割当</span><strong>${fmt(sim.unassignedUnits)}単位</strong></div></div></section><section class="card single-alloc-list"><div class="section-title">配分一覧</div>${rows.map(r=>{const assigned=sim.selectedSet.has(r.creditId);return `<div class="single-alloc-row"><div class="single-alloc-main"><strong>${esc(r.code)} ${esc(itemName(r.code))}　${fmt(r.unit)}単位</strong><span>${esc(r.date)}　${esc(r.name)}</span></div><span class="single-alloc-status ${assigned?'':'unassigned'}">${assigned?'病院薬学認定':'未割当'}</span></div>`}).join('')}</section>`
}

function renderAllocRow(c){const confirmed=state.confirmedAllocations[c.creditId],manual=state.manualAllocations[c.creditId],a=allocationFor(c);return `<div class="alloc-row"><div class="row between"><div><div class="alloc-title">${c.code} ${fmt(c.unit)}単位 ・ ${esc(c.name)}</div><div class="alloc-meta">${c.date}${c.lectureTitle?` ・ ${esc(c.lectureTitle)}`:''}</div></div><span class="status ${confirmed?'confirmed':manual?'':'rec'}">${confirmed?'確定済み':manual?'手動配分':'おすすめ'}</span></div><div class="seg" style="margin-top:9px"><button class="${a===HOSPITAL_CERT.id?'on':''}" ${confirmed?'disabled':''} onclick="setAllocation('${c.creditId}','${HOSPITAL_CERT.id}')">病院薬学認定</button><button class="${a==='unassigned'?'on':''}" ${confirmed?'disabled':''} onclick="setAllocation('${c.creditId}','unassigned')">未割当</button></div></div>`}

function renderOfficialLinkRows(q=currentQualification()){const links=q.officialLinks||[];if(!links.length)return `<div class="settings-plain-note">この資格の公式リンクはまだ登録されていません。</div>`;return links.map(link=>`<a class="setting-action-row official-link-row" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(link.label)}</strong><small>${esc(link.sub||'公式ページ')}</small></span><b>↗</b></a>`).join('')}

function renderSettings(){const q=currentQualification(),theme=state.settings.theme||'burgundy';const planRow=isHospitalQualification(q)?`<button class="setting-action-row" onclick="openPlanModal()"><span>申請計画</span><span class="setting-action-value"><strong>${targetApplicationYear(q)}年度</strong><b>›</b></span></button>`:'';return `<section class="card settings-card"><div class="section-title">資格・申請</div>${planRow}${renderOfficialLinkRows(q)}${q.id!==HOSPITAL_CERT.id?'<button class="setting-action-row danger-row" onclick="removeCurrentQualification()"><span>この目標資格を削除</span><b>›</b></button>':''}</section><section class="card settings-card"><div class="section-title">表示・照合</div><button class="setting-action-row theme-action" onclick="openThemePicker()"><span>カラーテーマ</span><span class="setting-action-value"><i class="theme-swatch ${theme}"></i><b>›</b></span></button><div class="metric"><span>HOPESS照合</span><button class="switch ${state.settings.hopess?'on':''}" onclick="toggleSetting('hopess')"><i></i></button></div><div class="metric"><span>ダークモード</span><button class="switch ${state.settings.dark?'on':''}" onclick="toggleSetting('dark')"><i></i></button></div></section><section class="settings-plain-section"><div class="settings-plain-title">データ</div><button class="settings-plain-row" onclick="exportBackup()"><span>バックアップを書き出す</span><b>→</b></button><label class="settings-plain-row file-label"><span>バックアップを読み込む</span><b>→</b><input type="file" accept="application/json" onchange="importBackup(this.files[0])"></label><div class="settings-plain-note">研修・単位データは端末内に保存されます。更新時も同じURLなら引き継がれます。</div><div class="settings-plain-title app-info-title">アプリ</div><div class="settings-info-row"><span>バージョン</span><strong>${APP_VERSION}</strong></div><button class="settings-update-row" onclick="checkUpdateManually()"><span>更新を確認</span><strong>${updateInProgress?'確認中…':'→'}</strong></button><div class="settings-info-row"><span>保存方式</span><strong>${storageBackend==='indexeddb'?'IndexedDB':'ローカル保存'}</strong></div></section>`}

function renderThemePickerModal(){const theme=state.settings.theme||'burgundy';return `<div class="modal-back theme-picker-back" onclick="closeThemePicker(event)"><section class="modal theme-picker" onclick="event.stopPropagation()"><div class="row between"><h3>カラーテーマ</h3><button class="close-x" onclick="closeThemePicker()">×</button></div><button class="theme-choice-row ${theme==='burgundy'?'selected':''}" onclick="setTheme('burgundy')"><span><i class="theme-swatch burgundy"></i>ボルドー</span><b>${theme==='burgundy'?'✓':''}</b></button><button class="theme-choice-row ${theme==='teal'?'selected':''}" onclick="setTheme('teal')"><span><i class="theme-swatch teal"></i>ティール</span><b>${theme==='teal'?'✓':''}</b></button></section></div>`}

function renderPlanModal(){const q=currentQualification();if(!isHospitalQualification(q))return '';const start=planStartYearFor(q),years=targetFiscalYears(targetApplicationYear(q),q);const quickLinks=(q.officialLinks||[]).filter(x=>['HOPESS','日本病院薬剤師会'].includes(x.label));return `<div class="modal-back" onclick="closePlanModal(event)"><section class="modal plan-modal" onclick="event.stopPropagation()"><div class="row between"><div><div class="kicker">APPLICATION PLAN</div><h3>申請計画</h3></div><button class="close-x" onclick="closePlanModal()">×</button></div><div class="plan-modal-main"><label class="plan-modal-field"><span>単位収集開始年度</span><select class="plan-modal-select" onchange="setPlanStartYear(this.value)">${planYearOptions(q).map(y=>`<option value="${y}" ${y===start?'selected':''}>${y}年度</option>`).join('')}</select></label><div class="plan-modal-summary"><div><span>対象年度</span><strong>${years.join('・')}年度</strong></div><div><span>申請予定</span><strong>${targetApplicationYear(q)}年度</strong></div></div><div class="small plan-modal-note">開始年度を変更すると、年度別集計・対象単位・期限判定・配分シミュレーションも連動して切り替わります。</div></div>${quickLinks.length?`<div class="plan-modal-links"><div class="settings-plain-title">公式ページ</div>${quickLinks.map(link=>`<a class="settings-plain-row" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(link.label)}</span><b>↗</b></a>`).join('')}</div>`:''}</section></div>`}


function renderQualificationDrawer(){const q=currentQualification();return `<div class="drawer-back" onclick="closeMenu(event)"><aside class="drawer" onclick="event.stopPropagation()"><div class="drawer-head"><div><div class="kicker">QUALIFICATIONS</div><h2>目標資格</h2></div><button class="close-x" onclick="toggleMenu()">×</button></div><div class="qual-list">${state.qualifications.map(x=>`<button class="qual-row ${x.id===q.id?'active':''}" onclick="switchQualification('${x.id}')"><span><strong>${esc(x.name)}</strong><small>${x.id===HOSPITAL_CERT.id?'公式要件テンプレート':'要件テンプレート未設定'}</small></span><b>${x.id===q.id?'✓':'›'}</b></button>`).join('')}</div><button class="btn accent block" style="margin-top:14px" onclick="openQualificationModal()">＋ 目標資格を追加</button></aside></div>`}
function renderQualificationModal(){return `<div class="modal-back" onclick="closeQualificationModal(event)"><div class="modal" onclick="event.stopPropagation()"><div class="row between"><h3>目標資格を追加</h3><button class="close-x" onclick="closeQualificationModal()">×</button></div><div class="notice">公式テンプレート対応資格は今後追加できます。未対応の資格は、必要な要件を選んでカスタム作成できます。</div><div class="field" style="margin-top:14px"><label>資格名</label><input id="newQualName" class="input" placeholder="例：外来がん治療専門薬剤師"></div><div class="req-check-grid">${[['credits','単位'],['experience','実務経験'],['cases','症例'],['paper','論文'],['presentation','学会発表'],['exam','試験'],['membership','会員・基礎資格']].map(([k,l])=>`<label class="req-check"><input type="checkbox" data-req="${k}" ${['credits','experience','cases','exam'].includes(k)?'checked':''}><span>${l}</span></label>`).join('')}</div><button class="btn accent block" style="margin-top:14px" onclick="addQualificationFromModal()">追加する</button></div></div>`}

function renderSourceViewer(){const c=conferenceDraft||state.conferences.find(x=>x.id===manualSourceConferenceId);return `<div class="viewer-back"><div class="viewer"><header><strong>${esc(c?.fileName||'資料')}</strong><button class="close-x" onclick="closeSourceViewer()">×</button></header><div class="viewer-body">${selectedSourceURL?(((selectedSourceFile?.type||conferenceDraft?.sourceType||state.conferences.find(x=>x.id===manualSourceConferenceId)?.sourceType||'')==='application/pdf')?`<iframe src="${selectedSourceURL}"></iframe>`:`<img src="${selectedSourceURL}" alt="資料">`):'<div class="empty">元ファイルを開けませんでした。<br>取り込み済みデータに資料が保存されているか確認してください。</div>'}</div></div></div>`}
function renderConferenceEditModal(){const x=conferenceDraft.sessions[editConferenceIndex],c=x.credits?.[0]||{code:'',unit:1};return `<div class="modal-back" onclick="closeConferenceEdit(event)"><div class="modal" onclick="event.stopPropagation()"><div class="row between"><div><div class="kicker">MANUAL CHECK</div><h3 style="margin:3px 0 0">単位区分を修正</h3></div><button class="close-x" onclick="closeConferenceEdit()">×</button></div><div class="small" style="margin:10px 0 14px">${esc(x.title)}</div><div class="field"><label>研修項目</label><select id="confEditCode" class="select"><option value="">要確認</option>${ITEM_CODES.map(code=>`<option value="${code}" ${code===c.code?'selected':''}>${code} ${itemName(code)}</option>`).join('')}</select></div><div class="field"><label>単位</label><input id="confEditUnit" class="input" type="number" step="0.5" min="0" value="${Number(c.unit||0)}"></div><button class="btn accent block" onclick="saveConferenceEdit()">修正する</button><div class="small" style="margin-top:10px">複数区分が付く講演は複数明細として保持できます。この編集画面では先頭の明細を修正します。</div></div></div>`}

function renderConferenceCompletionModal(){
  const p=conferenceCompletionPrompt||{};
  return `<div class="modal-back conference-completion-back"><section class="modal conference-completion-modal" onclick="event.stopPropagation()"><div class="kicker">REGISTERED</div><h3>登録が完了しました</h3><div class="completion-summary"><strong>${Number(p.count||0)}件・${fmt(p.total||0)}単位</strong><span>${esc(p.date||'')} に登録しました</span></div><div class="notice">取り込んだPDF・画像と参加状況を残しますか？ あとから続きを入力する場合は残しておけます。</div><button class="btn accent block" style="margin-top:14px" onclick="keepConferenceAfterRegistration()">残してあとで続ける</button><button class="btn ghost block completion-delete" style="margin-top:8px" onclick="deleteConferenceAfterRegistration()">入力完了・学会データを削除</button><div class="small" style="margin-top:10px">学会データを削除しても、今回登録した研修・単位は履歴に残ります。</div></section></div>`
}

function go(v){const from=currentView;currentView=v;if(v==='history'&&from!=='history')historyMode='matrix';if(v!=='register'){editingId=null;creditSelectMode=false;selectedCreditEntryIds.clear();manualSourceConferenceId=null;editingPlanId=null;planDraft=freshPlanDraft()}render({top:true})}
function render(opts={}){
  const root=document.getElementById('app');
  const previousView=root.dataset.view||'';
  const sameView=previousView===currentView;
  const scrollY=window.scrollY;
  const oldSourceImage=root.querySelector('.manual-source-image');
  const sourceImageScroll=oldSourceImage?{top:oldSourceImage.scrollTop,left:oldSourceImage.scrollLeft}:null;
  const oldDomains=[...root.querySelectorAll('details.domain')];
  const hadDomains=oldDomains.length>0;
  const openDomains=new Set(oldDomains.filter(d=>d.open).map(d=>d.dataset.domain));
  root.innerHTML=app();
  root.dataset.view=currentView;
  requestAnimationFrame(()=>{
    if(sameView&&hadDomains){
      root.querySelectorAll('details.domain').forEach(d=>{d.open=openDomains.has(d.dataset.domain)});
    }
    if(sameView&&sourceImageScroll){
      const nextSourceImage=root.querySelector('.manual-source-image');
      if(nextSourceImage){
        const restore=()=>{nextSourceImage.scrollTop=sourceImageScroll.top;nextSourceImage.scrollLeft=sourceImageScroll.left};
        restore();
        const img=nextSourceImage.querySelector('img');
        if(img&&!img.complete)img.addEventListener('load',restore,{once:true});
      }
    }
    window.scrollTo({top:opts.top?0:scrollY,behavior:'instant'});
  });
}
function setRegisterMode(mode){registerMode=mode;if(mode==='manual'&&conferenceDraft){manualSourceConferenceId=conferenceDraft.id;regDraft.date=conferenceDraft.date||regDraft.date;if(!regDraft.name)regDraft.name=conferenceDraft.name||''}if(mode!=='manual')manualSourceConferenceId=null;render({top:true})}

function normalizedTrainingName(name=''){return String(name||'').trim().replace(/\s+/g,' ')}
function addOrMergeTraining(t){const name=normalizedTrainingName(t.name);t.name=name;const existing=state.trainings.find(x=>x.date===t.date&&normalizedTrainingName(x.name)===name);if(!existing){state.trainings.push(t);return t.id}existing.creditEntries=[...(existing.creditEntries||[]),...(t.creditEntries||[])];if(!existing.conferenceId&&t.conferenceId)existing.conferenceId=t.conferenceId;if(t.files?.length){const names=new Set((existing.files||[]).map(f=>f.name));existing.files=[...(existing.files||[]),...t.files.filter(f=>!names.has(f.name))]}return existing.id}
function addCredit(code,unit){regDraft.creditEntries.push({id:uid(),code,unit:Number(unit),title:''});render()}
function addCustomCredit(code){const raw=prompt(`${code} の単位数を入力してください`,'0.5');if(raw===null)return;const v=Number(raw);if(v>0)addCredit(code,v)}
function removeCredit(id){regDraft.creditEntries=regDraft.creditEntries.filter(e=>e.id!==id);render()}
function saveTraining(){if(!regDraft.date||!regDraft.name.trim())return alert('取得日と研修名を入力してください。');if(!regDraft.creditEntries.length)return alert('取得単位を1件以上追加してください。');const t={...regDraft,id:editingId||uid(),name:regDraft.name.trim(),conferenceId:regDraft.conferenceId||manualSourceConferenceId||''};if(manualSourceConferenceId&&!t.files?.length){const c=state.conferences.find(x=>x.id===manualSourceConferenceId)||conferenceDraft;if(c?.fileName)t.files=[{name:c.fileName}]}if(editingId){const old=state.trainings.find(x=>x.id===editingId);const keep=new Set((t.creditEntries||[]).map(e=>e.id));for(const e of old?.creditEntries||[]){if(!keep.has(e.id)){const key=`${editingId}:${e.id}`;delete state.confirmedAllocations[key];delete state.manualAllocations[key]}}state.trainings=state.trainings.map(x=>x.id===editingId?t:x)}else addOrMergeTraining(t);saveData();editingId=null;creditSelectMode=false;selectedCreditEntryIds.clear();manualSourceConferenceId=null;regDraft=freshDraft();historyMode='matrix';currentView='history';render({top:true});setTimeout(maybeApplyDeferredUpdate,0)}
function editTraining(id){const t=state.trainings.find(x=>x.id===id);if(!t)return;editingId=id;creditSelectMode=false;selectedCreditEntryIds.clear();manualSourceConferenceId=t.conferenceId||null;regDraft=JSON.parse(JSON.stringify(t));registerMode='manual';currentView='register';if(manualSourceConferenceId)prepareConferenceSource(manualSourceConferenceId).finally(()=>render({top:true}));else render({top:true})}
function cancelEdit(){editingId=null;creditSelectMode=false;selectedCreditEntryIds.clear();manualSourceConferenceId=null;regDraft=freshDraft();currentView='history';render({top:true});setTimeout(maybeApplyDeferredUpdate,0)}
function deleteCurrentTraining(){
  if(!editingId)return;
  const t=state.trainings.find(x=>x.id===editingId);
  if(!t)return;
  if(!confirm('この研修記録をすべて削除しますか？\n取得単位・配分情報も削除されます。'))return;
  for(const e of (t.creditEntries||[])){
    const key=`${t.id}:${e.id}`;
    delete state.manualAllocations[key];
    delete state.confirmedAllocations[key];
  }
  if(t.conferenceId){
    const c=state.conferences.find(x=>x.id===t.conferenceId);
    if(c){
      let changed=false;
      for(const session of (c.sessions||[])){
        if(session.registeredTrainingId===t.id){
          delete session.registeredAt;
          delete session.registeredDate;
          delete session.registeredTrainingId;
          changed=true;
        }
      }
      if(changed)c.updatedAt=new Date().toISOString();
    }
  }
  state.trainings=state.trainings.filter(x=>x.id!==t.id);
  if(matrixDetail?.trainingId===t.id)matrixDetail=null;
  saveData();
  editingId=null;
  creditSelectMode=false;
  selectedCreditEntryIds.clear();
  manualSourceConferenceId=null;
  regDraft=freshDraft();
  currentView='history';
  render({top:true});
}
function setAllocation(id,val){if(state.confirmedAllocations[id])return;state.manualAllocations[id]=val;saveData();render()}
function resetRecommendations(){state.manualAllocations={};saveData();render()}
function confirmAllHospital(){const cs=allCredits().filter(c=>allocationFor(c)===HOSPITAL_CERT.id&&!state.confirmedAllocations[c.creditId]);if(!cs.length)return alert('確定対象がありません。');const total=cs.reduce((a,c)=>a+c.unit,0);if(!confirm(`${cs.length}明細・${fmt(total)}単位をアプリ上で確定済みにしますか？`))return;cs.forEach(c=>{state.confirmedAllocations[c.creditId]=HOSPITAL_CERT.id;delete state.manualAllocations[c.creditId]});saveData();render()}
function toggleSetting(k){state.settings[k]=!state.settings[k];saveData();render()}
function openThemePicker(){themePickerOpen=true;render()}
function closeThemePicker(e){if(e&&e.target!==e.currentTarget)return;themePickerOpen=false;render()}
function setTheme(theme){state.settings.theme=theme==='teal'?'teal':'burgundy';themePickerOpen=false;saveData();render()}
function openPlanModal(){planModalOpen=true;render()}
function closePlanModal(e){if(e&&e.target!==e.currentTarget)return;planModalOpen=false;render()}
function setPlanStartYear(value){const y=Number(value);if(!Number.isFinite(y))return;state.settings.qualificationPlans=state.settings.qualificationPlans||{};state.settings.qualificationPlans[HOSPITAL_CERT.id]={...(state.settings.qualificationPlans[HOSPITAL_CERT.id]||{}),startFiscalYear:y};saveData();render()}
function toggleDataManagement(){settingsDataOpen=!settingsDataOpen;render()}

async function loadConferenceSource(file){
  if(!file)return;releaseSelectedSource();selectedSourceFile=file;selectedSourceURL=URL.createObjectURL(file);
  const conferenceId=uid(),sourceId=`conference-source-${conferenceId}`;
  conferenceDraft={id:conferenceId,name:file.name.replace(/\.(pdf|png|jpe?g|webp|heic)$/i,''),date:todayISO(),fileName:file.name,sourceType:file.type||'',sourceId,sessions:[],analysisPending:true,analysisMessage:'資料を確認しています…',analysisError:'',analysisWarning:'',autoParsed:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  upsertConferenceDraft();if(storageBackend==='indexeddb'){try{await idbFileSet(sourceId,file)}catch(err){console.warn('資料の保存に失敗しました',err)}}render();
  const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);const isImage=(file.type||'').startsWith('image/')||/\.(png|jpe?g|webp|heic)$/i.test(file.name);
  if(!isPdf&&!isImage){conferenceDraft.analysisPending=false;conferenceDraft.analysisError='このファイル形式は自動読取に対応していません。PDFまたは画像を選択してください。';upsertConferenceDraft();render();return}
  try{const sessions=isPdf?await parseConferencePdf(file):await parseConferenceImage(file);if(!conferenceDraft)return;conferenceDraft.analysisPending=false;conferenceDraft.sessions=sessions;conferenceDraft.autoParsed=true;const unresolved=sessions.filter(x=>!(x.credits||[]).length||(x.credits||[]).some(c=>!c.code||!(Number(c.unit)>0))).length;const pageNote=isPdf&&conferenceDraft.detectedUnitPages?.length?` 単位情報ページ: ${conferenceDraft.detectedUnitPages.join('・')}ページ。`:'';conferenceDraft.analysisWarning=unresolved?`${sessions.length}件を抽出しました。${pageNote}うち${unresolved}件は単位区分または単位数を手動で確認してください。`:`${sessions.length}件を${isPdf?'PDF':'画像'}から抽出しました。${pageNote}登録前に資料との一致を確認してください。`;if(!sessions.length)conferenceDraft.analysisError=isPdf?'単位情報を自動抽出できませんでした。画像スキャン形式のPDF、または表の文字情報を取得できないPDFの可能性があります。資料を見ながら入力してください。':'画像の文字は読み取りましたが、単位区分と単位数を結び付けられませんでした。文字が小さい表や色付きの時間割はOCRが苦手です。画像を表示したまま入力できます。';upsertConferenceDraft();render()}catch(err){console.error('資料解析エラー',err);if(!conferenceDraft)return;conferenceDraft.analysisPending=false;conferenceDraft.analysisError=(err?.message||'資料を解析できませんでした。')+' 資料を表示しながら入力できます。';upsertConferenceDraft();render()}
}
function releaseSelectedSource(){selectedSourceFile=null;if(selectedSourceURL)URL.revokeObjectURL(selectedSourceURL);selectedSourceURL=''}
function conferenceSerializable(d){const x=JSON.parse(JSON.stringify(d));x.analysisPending=false;delete x.analysisMessage;return x}
function upsertConferenceDraft(){if(!conferenceDraft)return;conferenceDraft.updatedAt=new Date().toISOString();state.conferences=state.conferences||[];const snap=conferenceSerializable(conferenceDraft),i=state.conferences.findIndex(x=>x.id===snap.id);if(i>=0)state.conferences[i]=snap;else state.conferences.push(snap);saveData()}
async function prepareConferenceSource(id){const c=(conferenceDraft&&conferenceDraft.id===id)?conferenceDraft:state.conferences.find(x=>x.id===id);if(!c)return;releaseSelectedSource();if(!c.sourceId||storageBackend!=='indexeddb')return;try{const blob=await idbFileGet(c.sourceId);if(blob){selectedSourceFile=blob;selectedSourceURL=URL.createObjectURL(blob)}}catch(err){console.warn('資料を開けませんでした',err)}}
async function openSavedConference(id){const c=state.conferences.find(x=>x.id===id);if(!c)return;conferenceDraft=JSON.parse(JSON.stringify(c));registerMode='conference';manualSourceConferenceId=null;await prepareConferenceSource(id);render({top:true})}
function leaveConferenceDraft(){upsertConferenceDraft();conferenceDraft=null;manualSourceConferenceId=null;releaseSelectedSource();render({top:true})}
async function removeConferenceData(id,{confirmDelete=true,goHistory=false}={}){const c=state.conferences.find(x=>x.id===id);if(!c)return false;if(confirmDelete&&!confirm(`「${c.name}」の取り込みデータを削除しますか？\n登録済みの研修記録は削除されません。`))return false;state.conferences=state.conferences.filter(x=>x.id!==id);for(const t of state.trainings||[]){if(t.conferenceId===id)t.conferenceId=''}saveData();if(c.sourceId&&storageBackend==='indexeddb')idbFileDelete(c.sourceId).catch(()=>{});if(conferenceDraft?.id===id){conferenceDraft=null;manualSourceConferenceId=null;releaseSelectedSource()}if(goHistory){currentView='history';registerMode='manual'}render({top:goHistory});return true}
async function deleteSavedConference(id){await removeConferenceData(id,{confirmDelete:true,goHistory:false})}
function setConferenceName(value){if(!conferenceDraft)return;conferenceDraft.name=String(value||'').trim()||conferenceDraft.fileName?.replace(/\.(pdf|png|jpe?g|webp|heic)$/i,'')||'学会プログラム';upsertConferenceDraft();render()}
function setConferenceDate(value){if(!conferenceDraft||!value)return;conferenceDraft.date=value;upsertConferenceDraft();render()}
function startManualFromConference(){if(!conferenceDraft)return;manualSourceConferenceId=conferenceDraft.id;regDraft=freshDraft();regDraft.date=conferenceDraft.date||todayISO();regDraft.name=conferenceDraft.name||'';regDraft.conferenceId=conferenceDraft.id;registerMode='manual';render({top:true})}


function loadExternalScript(url,timeoutMs=18000){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===url);
    if(existing&&existing.dataset.loaded==='1')return resolve(url);
    const script=existing||document.createElement('script');
    let done=false;
    const finish=(ok,err)=>{if(done)return;done=true;clearTimeout(timer);if(ok){script.dataset.loaded='1';resolve(url)}else{if(!existing)script.remove();reject(err||new Error(`script load failed: ${url}`))}};
    script.onload=()=>finish(true);
    script.onerror=()=>finish(false,new Error(`script load failed: ${url}`));
    const timer=setTimeout(()=>finish(false,new Error(`script timeout: ${url}`)),timeoutMs);
    if(!existing){script.src=url;script.async=true;script.crossOrigin='anonymous';document.head.appendChild(script)}
  });
}
async function ensurePdfJs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  const sources=[
    ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
    ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
    ['https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js']
  ];
  let lastErr=null;
  for(const [main,worker] of sources){
    try{await loadExternalScript(main);if(window.pdfjsLib){pdfWorkerSrc=worker;return window.pdfjsLib}}catch(err){lastErr=err}
  }
  throw new Error(`PDF読み取り機能を読み込めませんでした。通信状態を確認してください。${lastErr?'':''}`);
}
async function ensureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  const sources=['https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'];
  let lastErr=null;
  for(const src of sources){
    try{await loadExternalScript(src,22000);if(window.Tesseract)return window.Tesseract}catch(err){lastErr=err}
  }
  throw new Error(`画像OCR機能を読み込めませんでした。通信状態を確認してください。${lastErr?'':''}`);
}
async function imageToOcrBlob(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    if(!w||!h)return file;
    const maxPixels=7_200_000;
    const byPixels=Math.sqrt(maxPixels/(w*h));
    const byWidth=1900/w;
    const scale=Math.max(0.45,Math.min(1.8,byPixels,byWidth>1?byWidth:1));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:false});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    // Dense conference schedules are easier for OCR after grayscale + contrast enhancement.
    ctx.filter='grayscale(1) contrast(1.65) brightness(1.08)';
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.96));
    return blob||file;
  }finally{URL.revokeObjectURL(url)}
}

function normalizePdfCode(raw=''){
  const map={'Ⅰ':'I','Ⅱ':'II','Ⅲ':'III','Ⅳ':'IV','Ⅴ':'V'};
  const m=String(raw).trim().match(/^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|IV|III|II|V|I)\s*[-－–—ー]\s*([1-6])$/i);
  if(!m)return '';
  const roman=map[m[1]]||m[1].toUpperCase();
  const code=`${roman}-${m[2]}`;
  return ITEM_CODES.includes(code)?code:'';
}

function normalizeSourceText(text=''){
  return String(text).normalize('NFKC')
    .replace(/Ⅰ/g,'I').replace(/Ⅱ/g,'II').replace(/Ⅲ/g,'III').replace(/Ⅳ/g,'IV').replace(/Ⅴ/g,'V')
    .replace(/[−‐‑‒–—―ー]/g,'-')
    .replace(/(IV|III|II|V|I)\s*[|｜:]\s*([1-6])/gi,'$1-$2')
    .replace(/(IV|III|II|V|I)\s*-\s*([1-6])/gi,'$1-$2')
    .replace(/\s+/g,' ').trim();
}

function extractCreditsFromPdfText(text=''){
  text=normalizeSourceText(text);
  const codeRe=/(IV|III|II|V|I)\s*[-]\s*([1-6])/gi;
  const found=[];let m;
  while((m=codeRe.exec(text))){
    const code=normalizePdfCode(`${m[1]}-${m[2]}`);
    if(code)found.push({code,start:m.index,end:codeRe.lastIndex});
  }
  if(!found.length)return [];

  // Explicit unit labels may appear before OR after the curriculum code in tables.
  const unitRe=/(0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*(?:単位|unit)/gi;
  const units=[];
  while((m=unitRe.exec(text)))units.push({unit:Number(m[1]),start:m.index,end:unitRe.lastIndex,used:false});

  const out=found.map((f,i)=>{
    const end=i+1<found.length?found[i+1].start:text.length;
    const after=text.slice(f.end,end);
    let um=after.match(/(?:^|[^0-9])(0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*(?:単位|unit)/i);
    if(!um)um=after.slice(0,24).match(/(?:^|\s)(0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)(?=\s|$)/);
    return {code:f.code,unit:um?Number(um[1]):null,_pos:(f.start+f.end)/2};
  });

  // Fill missing units from the nearest explicit 'x単位' token, including tokens on the left.
  for(const row of out){
    if(Number(row.unit)>0)continue;
    let best=null,bestD=Infinity;
    for(const u of units){
      if(u.used)continue;
      const d=Math.abs(((u.start+u.end)/2)-row._pos);
      if(d<bestD){best=u;bestD=d}
    }
    if(best && (found.length===1 || bestD<60)){
      row.unit=best.unit;best.used=true;
    }
  }

  // If counts match, table order is a reliable final fallback.
  const missing=out.filter(x=>!(Number(x.unit)>0));
  const unused=units.filter(x=>!x.used);
  if(missing.length && missing.length===unused.length){
    missing.forEach((x,i)=>{x.unit=unused[i].unit;unused[i].used=true});
  }
  return out.map(({_pos,...x})=>x);
}

function cleanPdfSessionTitle(text=''){
  let t=String(text)
    .replace(/(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|IV|III|II|V|I)\s*[-－–—ー]\s*[1-6]/gi,' ')
    .replace(/\b(?:0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*(?:単位|unit)\b/gi,' ')
    .replace(/\s+/g,' ').trim();
  t=t.replace(/^[\s|｜:：・,，/／\-–—]+|[\s|｜:：・,，/／\-–—]+$/g,'').trim();
  return t;
}

function pdfLineLooksLikeOnlyUnits(text=''){
  const t=String(text).replace(/\s+/g,' ').trim();
  return /^(?:(?:0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*(?:単位)?[\s/／・,，]*)+$/.test(t);
}

function pdfPageScore(text=''){
  const t=normalizeSourceText(text);
  let score=0;
  if(/単位に関するご案内/.test(t))score+=120;
  if(/研修項目/.test(t))score+=35;
  if(/病院薬学単位\s*[・･]?\s*研修科目/.test(t))score+=35;
  if(/単位数\s*[:：]?.*単位/.test(t))score+=25;
  if(/日病薬病院薬学認定薬剤師制度/.test(t))score+=12;
  if(/単位付与の対象外/.test(t))score+=8;
  const codes=(t.match(/(?:IV|III|II|V|I)\s*-\s*[1-6]/g)||[]).length;
  score+=Math.min(45,codes*4);
  return score;
}
function pdfPageHasUnitTable(text=''){
  const t=normalizeSourceText(text);
  const codes=(t.match(/(?:IV|III|II|V|I)\s*-\s*[1-6]/g)||[]).length;
  return /研修項目/.test(t)||/病院薬学単位\s*[・･]?\s*研修科目/.test(t)||(/単位数\s*[:：]?.*単位/.test(t)&&codes>=1)||codes>=3;
}
function pdfItemsToLines(items,pageNo){
  const positioned=(items||[]).filter(it=>String(it.str||'').trim()).map(it=>({text:String(it.str).trim(),x:Number(it.transform?.[4]||0),y:Number(it.transform?.[5]||0),w:Number(it.width||0)}));
  positioned.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
  const groups=[];
  for(const it of positioned){
    let g=groups.find(row=>Math.abs(row.y-it.y)<=2.2);
    if(!g){g={y:it.y,items:[]};groups.push(g)}
    g.items.push(it);
  }
  groups.sort((a,b)=>b.y-a.y);
  const lines=[];
  for(const g of groups){
    g.items.sort((a,b)=>a.x-b.x);
    let line='',lastEnd=null;
    for(const it of g.items){
      const gap=lastEnd===null?0:it.x-lastEnd;
      if(line&&gap>2.5)line+=' ';
      line+=it.text;
      lastEnd=it.x+it.w;
    }
    line=normalizeSourceText(line);
    if(line)lines.push({page:pageNo,text:line});
  }
  return lines;
}
async function pdfTextLines(file){
  const lib=await ensurePdfJs();
  lib.GlobalWorkerOptions.workerSrc=pdfWorkerSrc||'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const data=await file.arrayBuffer();
  const pdf=await lib.getDocument({data}).promise;
  const cache=new Map();
  const readPage=async(pageNo)=>{
    if(cache.has(pageNo))return cache.get(pageNo);
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const flat=normalizeSourceText((content.items||[]).map(it=>String(it.str||'')).join(' '));
    const info={page:pageNo,flat,score:pdfPageScore(flat),isTable:pdfPageHasUnitTable(flat),isGuide:/単位に関するご案内|認定単位(?:について|のご案内)?|研修単位(?:について|のご案内)?/.test(flat),lines:pdfItemsToLines(content.items||[],pageNo)};
    cache.set(pageNo,info);return info;
  };
  const tocRefs=[];
  const tocLimit=Math.min(pdf.numPages,15);
  if(conferenceDraft){conferenceDraft.analysisMessage='目次から単位情報ページを探しています…';render()}
  for(let pageNo=1;pageNo<=tocLimit;pageNo++){
    const p=await readPage(pageNo);
    if(!/(?:目\s*次|CONTENTS)/i.test(p.flat))continue;
    const t=p.flat;
    const patterns=[
      /(?:単位に関するご案内|認定単位(?:について|のご案内)?|研修単位(?:について|のご案内)?|単位取得(?:について|のご案内)?)[^0-9]{0,90}([0-9]{1,3})/gi,
      /(?:単位|研修項目)[^0-9]{0,60}([0-9]{1,3})/gi
    ];
    for(const re of patterns){let m;while((m=re.exec(t))){const n=Number(m[1]);if(n>=1&&n<=pdf.numPages&&!tocRefs.includes(n))tocRefs.push(n)}}
  }

  let guidePage=null,tocReference=null;
  if(tocRefs.length){
    // Printed page numbers and PDF page indices can differ by a cover page or two.
    // Check around every TOC reference and choose the strongest unit-information page.
    let best=null;
    for(const ref of tocRefs){
      for(let n=Math.max(1,ref-4);n<=Math.min(pdf.numPages,ref+4);n++){
        const p=await readPage(n);
        const bonus=p.isGuide?180:(p.isTable?55:0);
        const candidate={page:n,score:p.score+bonus-Math.abs(n-ref)*2,ref};
        if(!best||candidate.score>best.score)best=candidate;
      }
    }
    if(best&&best.score>=45){guidePage=best.page;tocReference=best.ref}
  }

  const collectFromGuide=async(startPage)=>{
    const chosen=[];let tableStarted=false,lowAfterTable=0;
    for(let n=startPage;n<=Math.min(pdf.numPages,startPage+10);n++){
      const p=await readPage(n);
      if(n===startPage||p.isTable||p.score>=25||(!tableStarted&&n<=startPage+2))chosen.push(p);
      if(p.isTable){tableStarted=true;lowAfterTable=0}else if(tableStarted)lowAfterTable++;
      if(tableStarted&&lowAfterTable>=2)break;
    }
    return chosen;
  };

  let chosen=[];
  if(guidePage!==null){
    if(conferenceDraft){conferenceDraft.analysisMessage=`目次の「単位」案内（${tocReference||guidePage}ページ）を基に、PDF ${guidePage}ページ付近を確認しています…`;render()}
    chosen=await collectFromGuide(guidePage);
  }

  if(!chosen.some(x=>x.isTable)){
    // TOC did not resolve, or the document has no usable TOC. Search the PDF itself.
    if(conferenceDraft){conferenceDraft.analysisMessage='目次で特定できなかったため、PDF全体から単位情報を探しています…';render()}
    const fallback=[];let directGuide=null;
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      if(conferenceDraft&&pageNo%3===0){conferenceDraft.analysisMessage=`PDF全体から単位情報を探しています… ${pageNo} / ${pdf.numPages}`;render()}
      const p=await readPage(pageNo);
      if(directGuide===null&&p.isGuide)directGuide=pageNo;
      if(p.score>=35||p.isTable)fallback.push(p);
      if(directGuide!==null&&pageNo>=directGuide+8)break;
    }
    chosen=directGuide!==null?await collectFromGuide(directGuide):fallback.sort((a,b)=>a.page-b.page);
  }

  chosen=chosen.filter((x,i,a)=>a.findIndex(y=>y.page===x.page)===i);
  if(!chosen.length||!chosen.some(x=>x.isTable))return [];
  const pages=chosen.filter(x=>x.isTable||x.isGuide).map(x=>x.page).sort((a,b)=>a-b);
  if(conferenceDraft){conferenceDraft.detectedUnitPages=[...new Set(pages)];conferenceDraft.analysisMessage=`単位情報ページ（${[...new Set(pages)].join('・')}ページ）を優先解析しています…`;render()}
  return chosen.sort((a,b)=>a.page-b.page).flatMap(x=>x.lines);
}

async function parseConferencePdf(file){
  const lines=await pdfTextLines(file);
  return parseConferenceLines(lines);
}

function ocrTextToLines(text=''){
  return String(text).split(/\r?\n/).map((t,i)=>({page:1,text:normalizeSourceText(t),_i:i})).filter(x=>x.text);
}

async function parseConferenceImage(file){
  const T=await ensureTesseract();
  const logger=m=>{
    if(!conferenceDraft)return;
    if(m.status==='recognizing text')conferenceDraft.analysisMessage=`画像を読み取っています… ${Math.round((m.progress||0)*100)}%`;
    else if(m.status)conferenceDraft.analysisMessage='画像OCRを準備しています…';
    render();
  };
  let worker=null;
  try{
    // v5's worker API is more reliable on iPhone than the old one-shot recognize helper.
    worker=await T.createWorker(['jpn','eng'],1,{logger});
    try{await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300'})}catch{}
    const prepared=await imageToOcrBlob(file);
    let result=await worker.recognize(prepared);
    let raw=result?.data?.text||'';
    let sessions=parseConferenceLines(ocrTextToLines(raw));
    // If contrast processing lost useful detail, retry the original once.
    if(!sessions.length&&prepared!==file){
      if(conferenceDraft){conferenceDraft.analysisMessage='別の読み取り方法でもう一度確認しています…';render()}
      result=await worker.recognize(file);raw=result?.data?.text||'';sessions=parseConferenceLines(ocrTextToLines(raw));
    }
    if(conferenceDraft)conferenceDraft.ocrTextPreview=raw.slice(0,5000);
    return sessions;
  }finally{if(worker)try{await worker.terminate()}catch{}}
}

function sectionDefaultUnitFromText(text=''){
  const t=normalizeSourceText(text);
  // Examples: 「単位数：各 1 単位」「単位数: 各0.5単位」
  let m=t.match(/単位数\s*[:：]?\s*(?:各\s*)?(0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*単位/i);
  if(m)return Number(m[1]);
  // Some programs omit 「単位数」 but write 「各 1 単位」 in the section heading.
  m=t.match(/(?:^|\s)各\s*(0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)\s*単位(?:\s|$)/i);
  return m?Number(m[1]):null;
}

function looksLikeConferenceSectionHeading(text=''){
  const t=normalizeSourceText(text);
  return /(?:^|\s)[1-5]\s*[.．]\s*(?:特別講演|シンポジウム|ブロック学術大会|その他)/.test(t)
    || /(?:特別講演|シンポジウム).*(?:各\s*\d+\s*(?:-|～|~)?\s*\d*\s*分)/.test(t);
}

function isPdfTableNoise(text=''){
  const t=normalizeSourceText(text);
  return /^(?:No|演者|担当|テーマ|研修項目|上段|下段|病院薬学単位|専門薬剤師単位)/i.test(t)
    || /^\d+\s*単位\s*(?:がん|感染制御|精神科|妊婦|授乳婦|HIV)/i.test(t)
    || pdfLineLooksLikeOnlyUnits(t);
}
function inferPdfSessionTitle(lines,index,currentText=''){
  const direct=cleanPdfSessionTitle(currentText)
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚\d\s.．-]+/,'').trim();
  if(direct.length>=7&&!isPdfTableNoise(direct))return direct.slice(0,180);
  const page=lines[index]?.page,parts=[];
  for(let j=index-1;j>=0&&j>=index-4;j--){
    const prev=lines[j];if(!prev||prev.page!==page)break;
    if(looksLikeConferenceSectionHeading(prev.text)||extractCreditsFromPdfText(prev.text).length)break;
    if(isPdfTableNoise(prev.text))continue;
    let p=cleanPdfSessionTitle(prev.text).replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚\d\s.．-]+/,'').trim();
    if(p&&p.length>2)parts.unshift(p);
  }
  const joined=parts.join(' ').replace(/\s+/g,' ').trim();
  return (joined||direct||`資料 ${page||1}ページの単位対象講演`).slice(0,180);
}
function parseConferenceLines(lines){
  const sessions=[];let order=0;
  let activePage=null;
  let sectionDefaultUnit=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(activePage!==line.page){activePage=line.page;sectionDefaultUnit=null}

    const headingDefault=sectionDefaultUnitFromText(line.text);
    if(looksLikeConferenceSectionHeading(line.text))sectionDefaultUnit=headingDefault;
    else if(headingDefault!==null)sectionDefaultUnit=headingDefault;

    let credits=extractCreditsFromPdfText(line.text);
    if(!credits.length)continue;

    // Unit tokens sometimes become a separate line immediately before/after the curriculum code.
    if(credits.some(c=>!(Number(c.unit)>0))){
      const neighbors=[lines[i-2],lines[i-1],lines[i+1],lines[i+2]].filter(x=>x&&x.page===line.page);
      for(const near of neighbors){
        const t=normalizeSourceText(near.text);
        const units=(t.match(/(?:0\.5|1(?:\.0)?|1\.5|2(?:\.0)?|2\.5|3(?:\.0)?)(?=\s*単位)/g)||[]).map(Number);
        if(units.length){credits=credits.map((c,j)=>({...c,unit:Number(c.unit)>0?c.unit:(units[Math.min(j,units.length-1)]||null)}));if(credits.every(c=>Number(c.unit)>0))break}
      }
    }

    // Header-level rules such as 「単位数：各1単位」 apply to every row in that section.
    // Explicit row-level values (e.g. II-4 0.5 + II-5 0.5) always win.
    if(sectionDefaultUnit!==null&&credits.some(c=>!(Number(c.unit)>0))){
      credits=credits.map(c=>({...c,unit:Number(c.unit)>0?c.unit:sectionDefaultUnit}));
    }

    const title=inferPdfSessionTitle(lines,i,line.text);
    order++;
    sessions.push({title,page:line.page||1,credits,status:'undecided',sourceOrder:order,rawText:line.text});
  }

  // Merge split sub-credit rows such as 「①II-4 0.5」「②II-5 0.5」 that belong to one seminar.
  const subMerged=[];
  for(const s of sessions){
    const prev=subMerged[subMerged.length-1];
    const prevSub=prev&&/[①1]\s*(?:IV|III|II|V|I)\s*[-－–—ー]\s*[1-6]/i.test(normalizeSourceText(prev.rawText||''));
    const curSub=/[②2]\s*(?:IV|III|II|V|I)\s*[-－–—ー]\s*[1-6]/i.test(normalizeSourceText(s.rawText||''));
    if(prev&&prev.page===s.page&&prevSub&&curSub){
      prev.credits=[...(prev.credits||[]),...(s.credits||[])];
      const combined=`${prev.title||''} ${s.title||''}`.replace(/\s+/g,' ').trim();
      if(combined.length>prev.title.length)prev.title=combined.slice(0,180);
      prev.rawText=`${prev.rawText||''} ${s.rawText||''}`.trim();
      continue;
    }
    subMerged.push(s);
  }

  // Merge accidental duplicate rows from PDF text-layer fragmentation, while preserving source order.
  const merged=[];
  for(const s of subMerged){
    const signature=(s.credits||[]).map(c=>`${c.code}:${Number(c.unit||0)}`).join('|');
    const prev=merged[merged.length-1];
    if(prev&&prev.page===s.page&&signature&&signature===(prev.credits||[]).map(c=>`${c.code}:${Number(c.unit||0)}`).join('|')&&prev.title===s.title)continue;
    merged.push(s);
  }
  return merged.map((s,i)=>({...s,sourceOrder:i+1}));
}

function cycleConferenceStatus(i,status){const x=conferenceDraft.sessions[i];if(x.registeredAt)return;x.status=x.status===status?'undecided':status;upsertConferenceDraft();render()}
function editConferenceSession(i){editConferenceIndex=i;render()}
function closeConferenceEdit(e){if(e&&e.target!==e.currentTarget)return;editConferenceIndex=null;render()}
function saveConferenceEdit(){const code=document.getElementById('confEditCode').value,unit=Number(document.getElementById('confEditUnit').value);if(!(unit>0))return alert('単位数を入力してください。');const x=conferenceDraft.sessions[editConferenceIndex];if(x.registeredAt)return alert('登録済みの講演は履歴から編集してください。');if(!x.credits?.length)x.credits=[{code,unit}];else x.credits[0]={...x.credits[0],code,unit};editConferenceIndex=null;upsertConferenceDraft();render()}
function saveConferenceTraining(){
  const attended=conferenceDraft.sessions.filter(x=>x.status==='attended'&&!x.registeredAt);
  if(!attended.length)return;
  const unresolved=attended.some(x=>!(x.credits||[]).length||(x.credits||[]).some(c=>!c.code||!(Number(c.unit)>0)));
  if(unresolved&&!confirm('単位区分が「要確認」の講演があります。このまま登録しますか？'))return;
  const entries=[];
  attended.forEach(s=>(s.credits||[]).forEach(c=>entries.push({id:uid(),code:c.code||'要確認',unit:Number(c.unit||0),title:s.title,sourceOrder:s.sourceOrder,sourcePage:s.page})));
  const conferenceId=conferenceDraft.id;
  const trainingId=addOrMergeTraining({id:uid(),date:conferenceDraft.date,name:conferenceDraft.name,conferenceId,source:'jshp',cpc:false,hopessId:'',memo:'学会プログラムから一括登録',files:conferenceDraft.fileName?[{name:conferenceDraft.fileName}]:[],creditEntries:entries});
  const now=new Date().toISOString();
  attended.forEach(s=>{s.registeredAt=now;s.registeredDate=conferenceDraft.date;s.registeredTrainingId=trainingId});
  upsertConferenceDraft();
  saveData();
  conferenceCompletionPrompt={conferenceId,trainingId,count:attended.length,total:entries.reduce((sum,e)=>sum+Number(e.unit||0),0),date:conferenceDraft.date};
  render();
}
function keepConferenceAfterRegistration(){conferenceCompletionPrompt=null;render();setTimeout(maybeApplyDeferredUpdate,0)}
async function deleteConferenceAfterRegistration(){const p=conferenceCompletionPrompt;if(!p)return;conferenceCompletionPrompt=null;await removeConferenceData(p.conferenceId,{confirmDelete:false,goHistory:true});setTimeout(maybeApplyDeferredUpdate,0)}

async function openSourceViewer(){const id=conferenceDraft?.id||manualSourceConferenceId;if(id&&!selectedSourceURL)await prepareConferenceSource(id);sourceViewerOpen=true;render()}
function closeSourceViewer(){sourceViewerOpen=false;render()}

function toggleMenu(){menuOpen=!menuOpen;qualModalOpen=false;render()}
function closeMenu(e){if(e&&e.target!==e.currentTarget)return;menuOpen=false;render()}
function switchQualification(id){state.settings.selectedQualificationId=id;saveData();menuOpen=false;currentView='home';render({top:true})}
function openQualificationModal(){menuOpen=false;qualModalOpen=true;render()}
function closeQualificationModal(e){if(e&&e.target!==e.currentTarget)return;qualModalOpen=false;render()}
function addQualificationFromModal(){const name=(document.getElementById('newQualName')?.value||'').trim();if(!name)return alert('資格名を入力してください。');const req={};document.querySelectorAll('[data-req]').forEach(el=>req[el.dataset.req]=el.checked);const q={id:`custom-${uid()}`,name,kind:'custom',requirementTypes:req};state.qualifications.push(q);state.settings.selectedQualificationId=q.id;saveData();qualModalOpen=false;currentView='home';render({top:true})}
function removeCurrentQualification(){const q=currentQualification();if(q.id===HOSPITAL_CERT.id)return;if(!confirm(`「${q.name}」を削除しますか？`))return;state.qualifications=state.qualifications.filter(x=>x.id!==q.id);state.settings.selectedQualificationId=HOSPITAL_CERT.id;saveData();currentView='home';render({top:true})}
function exportBackup(){state.lastBackupAt=new Date().toISOString();saveData();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pharm-cert-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0)}
function importBackup(file){if(!file)return;const r=new FileReader();r.onload=()=>{const d=safeParse(r.result);if(!d||!Array.isArray(d.trainings))return alert('バックアップ形式を確認できませんでした。');if(!confirm('現在のデータを置き換えますか？'))return;state=migrateData(d);saveData();render()};r.readAsText(file)}


function versionParts(v=''){return String(v).split('.').map(x=>Number(x)||0)}
function isNewerVersion(remote,local){const a=versionParts(remote),b=versionParts(local),n=Math.max(a.length,b.length);for(let i=0;i<n;i++){const d=(a[i]||0)-(b[i]||0);if(d)return d>0}return false}
function hasUnsafeUnsavedInput(){
  if(conferenceDraft?.analysisPending||editConferenceIndex!==null)return true;
  if(currentView!=='register')return false;
  if(registerMode==='planned')return !!(editingPlanId||planDraft.name?.trim());
  if(registerMode==='excel')return !!(excelLoading||excelCandidates.length);
  if(registerMode!=='manual')return false;
  if(editingId)return true;
  return !!(regDraft.name?.trim()||regDraft.creditEntries?.length||regDraft.memo?.trim()||manualSourceConferenceId);
}
function showUpdateToast(text){updateToast=text;render();setTimeout(()=>{if(updateToast===text){updateToast='';render()}},1600)}
async function checkForAppUpdate(opts={}){
  const {auto=true,manual=false,force=false}=opts;
  if(location.protocol!=='https:'&&location.hostname!=='localhost')return;
  const now=Date.now();if(!force&&!manual&&now-lastUpdateCheckAt<15000)return;lastUpdateCheckAt=now;
  try{
    const res=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error('version check failed');
    const info=await res.json();
    if(info?.version&&isNewerVersion(info.version,APP_VERSION)){
      updateAvailableVersion=info.version;
      if(auto&&!hasUnsafeUnsavedInput()){updateDeferred=false;render();return forceAppUpdate(info.version,true)}
      updateDeferred=true;render();
      if(manual)alert(`新しいバージョン ${info.version} があります。入力中の内容を保存した後、自動更新します。`);
      return;
    }
    updateAvailableVersion='';updateDeferred=false;
    if(manual)alert(`最新バージョン（${APP_VERSION}）です。`);
  }catch(err){if(manual)alert('更新情報を確認できませんでした。通信状態を確認してください。')}
}
async function checkUpdateManually(){return checkForAppUpdate({auto:true,manual:true,force:true})}
async function forceAppUpdate(targetVersion=updateAvailableVersion,automatic=false){
  if(updateInProgress)return;
  if(hasUnsafeUnsavedInput()&&!automatic){if(!confirm('入力途中の内容があります。保存せずに更新しますか？'))return}
  if(hasUnsafeUnsavedInput()&&automatic){updateDeferred=true;render();return}
  updateInProgress=true;updateDeferred=false;render();
  try{
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('pharm-cert-')).map(k=>caches.delete(k)))}
    if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs){try{await reg.update();if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'})}catch{}}}
    if(targetVersion)localStorage.setItem('pharm-cert-update-notice',targetVersion);
  }catch(e){console.warn('更新処理',e)}
  location.replace(`${location.pathname}?update=${Date.now()}`);
}
function maybeApplyDeferredUpdate(){if(updateAvailableVersion&&!hasUnsafeUnsavedInput())forceAppUpdate(updateAvailableVersion,true)}
function scheduleForegroundUpdateCheck(){setTimeout(()=>checkForAppUpdate({auto:true}),250)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleForegroundUpdateCheck()});
window.addEventListener('pageshow',scheduleForegroundUpdateCheck);
window.addEventListener('focus',scheduleForegroundUpdateCheck);

async function bootstrap(){
  try{state=await loadData()}catch(err){console.error(err);state=migrateData(defaultData());storageBackend='localStorage'}
  regDraft=freshDraft();
  planDraft=freshPlanDraft();
  const notice=localStorage.getItem('pharm-cert-update-notice');
  if(notice===APP_VERSION){localStorage.removeItem('pharm-cert-update-notice');setTimeout(()=>showUpdateToast(`v${APP_VERSION}に更新しました`),80)}
  render();
  if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(reg=>reg.update()).catch(()=>{});
  checkForAppUpdate({auto:true,force:true});
}
bootstrap();
