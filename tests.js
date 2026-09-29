/* IronLog regression suite.
   Load it into the running app from the console, then run it:
     document.head.append(Object.assign(document.createElement('script'),{src:'tests.js'}))
     await __iltest()                    // or __iltest({stress:false})
   Snapshots the database first and restores it afterwards, so it is safe to
   run against a real install — but prefer a scratch profile anyway.

   Covers: mechanics physics, unilateral doubling, strength-score eligibility
   and invariance, schedule date maths (incl. DST), PR-on-edit celebration,
   fatigue ramp, export/import round trip, v4/v5.0 backward compatibility,
   PWA assets, all-or-nothing restore, PREV set matching, live PR flags,
   double-tap guards, local dates, autosave-on-hide, the service worker's
   fetch strategy, Technogym presets, editing a finished workout, the v5.8
   redesign's contracts, the iOS 27 home-screen fixes, 5.7 ⇄ 5.8 data
   compatibility, the fairer strength score, kg ⇄ lb conversion, exercise
   history, the forgotten-Finish card, in-app updates and bundled Chart.js,
   and a render stress test. CI runs it headlessly: ci/run-tests.mjs. */
(function(){
const R=[];let only=null;
const ok=(name,cond,detail)=>{R.push({name,pass:!!cond,detail:cond?(detail||''):('FAILED '+(detail||''))});return !!cond;};
const near=(a,b,eps)=>Math.abs(a-b)<=(eps==null?1e-6:eps);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* deep, order-insensitive normalise so export→import compares meaningfully:
   spread-defaults reorder object keys, and record arrays come back in store
   order rather than insertion order */
function norm(v){
  if(Array.isArray(v)){
    const a=v.map(norm);
    a.sort((x,y)=>JSON.stringify(x)<JSON.stringify(y)?-1:1);
    return a;
  }
  if(v&&typeof v==='object'){
    const o={};
    for(const k of Object.keys(v).sort())if(v[k]!==undefined)o[k]=norm(v[k]);
    return o;
  }
  return v;
}
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const $$=sel=>[...document.querySelectorAll(sel)];
// the sheet on top. Not `.overlay:last-of-type`: that is the last DIV among
// body's children, and a celebration effect appended after the sheet is one
const topSheet=()=>{const o=document.querySelectorAll('.overlay');return o[o.length-1]||document.createElement('div');};

function mkWorkout(exId,sets,ts,name){
  return {id:uid(),name:name||'Test',finishedAt:ts,dur:3600,notes:'',
    exs:[{exId,sets:sets.map(s=>({t:'N',w:s[0],r:s[1],rpe:s[2]==null?8:s[2],dur:null,dist:null,done:true}))}]};
}

window.__iltest=async function(opts){
  opts=opts||{};
  R.length=0;              // a second run in the same page starts clean
  const il=window.__il;
  if(!il){console.error('__il missing — app not booted');return{fatal:'no __il'};}
  const t0=performance.now();
  const timings={};
  const snapshot=await il.buildExportData();   // restored in the finally block

  try{
    /* ---------- 1. environment ---------- */
    ok('boot: debug handle present',!!il.S&&!!il.strengthProfile&&!!il.plotCalc);
    ok('boot: seed library loaded',il.S.ex.size>=60,il.S.ex.size+' exercises');

    /* ---------- 2. fatigue ramp ---------- */
    const hue=f=>parseFloat(il.fatigueColor(f).match(/hsl\(([\d.]+)/)[1]);
    let mono=true;
    for(let f=1;f<=100;f++)if(hue(f)>hue(f-1)+1e-9)mono=false;
    ok('fatigue: hue falls monotonically green→red',mono);
    ok('fatigue: 0 % is green',hue(0)>=130,'hue '+hue(0));
    ok('fatigue: 50 % is deep yellow/orange',hue(50)>=18&&hue(50)<=40,'hue '+hue(50)+' (was ~62 = light green)');
    ok('fatigue: 75 % is orange-red',hue(75)<=18,'hue '+hue(75));
    ok('fatigue: 100 % is red',hue(100)<=6,'hue '+hue(100));

    /* ---------- 3. plotter physics ---------- */
    const pc=il.plotCalc;
    ok('plot: load tracks hands 1:1 → ×1.00',
      near(pc({hx0:50,hy0:70,hx1:50,hy1:40,wx0:60,wy0:70,wx1:60,wy1:40}).ratio,1,1e-9));
    ok('plot: 2:1 pulley → ×0.50',
      near(pc({hx0:50,hy0:70,hx1:50,hy1:40,wx0:60,wy0:70,wx1:60,wy1:55}).ratio,.5,1e-9));
    const sled=pc({hx0:40,hy0:70,hx1:60,hy1:50,wx0:40,wy0:70,wx1:60,wy1:50});
    ok('plot: 45° sled → ×0.71 (sin 45 falls out of the geometry)',
      near(sled.ratio,Math.SQRT1_2,1e-3),'got '+sled.ratio.toFixed(4));
    ok('plot: horizontal pull, load rises 12 over 20 → ×0.60',
      near(pc({hx0:60,hy0:50,hx1:40,hy1:50,wx0:80,wy0:70,wx1:80,wy1:58}).ratio,.6,1e-9));
    ok('plot: only VERTICAL load travel counts',
      near(pc({hx0:50,hy0:70,hx1:50,hy1:50,wx0:10,wy0:60,wx1:90,wy1:60}).ratio,.05,1e-9),
      'purely horizontal load travel does no work against gravity → clamps to floor');
    ok('plot: ratio clamped to [0.05, 4]',
      pc({hx0:50,hy0:50,hx1:50,hy1:52,wx0:5,wy0:90,wx1:5,wy1:5}).ratio<=4);
    const romA=pc({hx0:50,hy0:70,hx1:50,hy1:40,wx0:60,wy0:70,wx1:60,wy1:40}).romCm;
    const savedH=il.S.set.heightCm;
    il.S.set.heightCm=savedH*2;
    const romB=pc({hx0:50,hy0:70,hx1:50,hy1:40,wx0:60,wy0:70,wx1:60,wy1:40}).romCm;
    il.S.set.heightCm=savedH;
    ok('plot: ROM scales linearly with your height',near(romB,romA*2,1e-6),
      romA.toFixed(1)+' cm at '+savedH+' cm tall');

    /* ---------- 4. mechanics applied to load ---------- */
    const bb={id:'t_bb',name:'T Bench',m:'Chest',s:[],e:'Barbell'};
    const mc={id:'t_mc',name:'T Machine',m:'Chest',s:[],e:'Machine'};
    const st={t:'N',w:100,r:5,rpe:8};
    ok('load: free weight, uncalibrated → unchanged',
      near(il.strengthLoad(bb,st),il.loadOf(bb,st)));
    const mc2={...mc,mech:{ratio:.5,romCm:0}};
    ok('load: calibrated machine ×0.5 → 50',near(il.strengthLoad(mc2,st),50));
    ok('load: unilateral doubles',near(il.strengthLoad({...bb,uni:1},st),200));
    ok('load: leverage and per-side compose',
      near(il.strengthLoad({...mc,mech:{ratio:.6,romCm:0},uni:1},st),120));
    ok('load: romFactor clamps low',il.romFactor({m:'Chest',mech:{ratio:1,romCm:1}})>=.85);
    ok('load: romFactor clamps high',il.romFactor({m:'Chest',mech:{ratio:1,romCm:9999}})<=1.1);
    ok('load: romFactor is 1 without a plot',near(il.romFactor(bb),1));
    ok('eligible: uncalibrated machine excluded',!il.strengthEligible(mc));
    ok('eligible: calibrated machine included',il.strengthEligible(mc2));
    ok('eligible: barbell always included',il.strengthEligible(bb));
    ok('eligible: cardio never included',
      !il.strengthEligible({id:'c',name:'Run',m:'Quads',s:[],e:'Cardio',cardio:1}));

    /* ---------- 4b. seed per-side defaults ---------- */
    ok('seeds: barbell Bench Press is NOT per-side',!il.S.ex.get('x06').uni);
    ok('seeds: Back Squat / Deadlift are NOT per-side',
      !il.S.ex.get('x01').uni&&!il.S.ex.get('x03').uni);
    ok('seeds: Dumbbell Bench Press IS per-side',!!il.S.ex.get('x09').uni);
    ok('seeds: one-arm Dumbbell Row IS per-side',!!il.S.ex.get('x20').uni);
    ok('seeds: Bulgarian Split Squat IS per-side',!!il.S.ex.get('x37').uni);
    ok('seeds: Lat Pulldown (one stack, two hands) is NOT per-side',!il.S.ex.get('x17').uni);
    ok('seeds: Leg Press is NOT per-side',!il.S.ex.get('x35').uni);
    const uniN=[...il.S.ex.values()].filter(x=>x.uni).length;
    ok('seeds: a sensible number are tagged per-side',uniN>=10&&uniN<=18,uniN+' tagged');
    // deliberately reverting one must survive the next boot's backfill
    const lat=il.S.ex.get('x23');
    delete lat.uni;lat.edited=1;await il.dbPut('exercises',lat);
    await il.kvPut('uniPatched',0);      // falsy → the patch would run again
    await il.seedBackfill();
    ok('seeds: an exercise you set back to total-load is not re-flipped',
      !il.S.ex.get('x23').uni);
    delete lat.edited;lat.uni=1;await il.dbPut('exercises',lat);
    // and per-side tagging genuinely reaches the score
    const dbEx=il.S.ex.get('x09');
    ok('seeds: per-side tagging doubles the scoring load',
      near(il.strengthLoad(dbEx,{t:'N',w:30,r:8}),60),
      '30 kg per hand → 60 kg of system load');
    ok('seeds: …but the displayed weight is untouched',
      near(il.loadOf(dbEx,{t:'N',w:30,r:8}),30));

    /* ---------- 4c. rigged figure ---------- */
    const rigEx={id:'r',name:'R',m:'Back',s:['Biceps'],e:'Machine'};
    const svgTxt=il.rigFigureSVG('seated',30,rigEx,[47,55],false);
    ok('rig: emits polygons and circles',/polygon/.test(svgTxt)&&/circle/.test(svgTxt));
    const hot=il.fatigueColor(100),warm=il.fatigueColor(52);
    ok('rig: the primary muscle is lit hot',svgTxt.includes(hot),'expected '+hot);
    ok('rig: a secondary muscle is lit warm',svgTxt.includes(warm));
    const quietEx={id:'r2',name:'R2',m:'Calves',s:[],e:'Machine'};
    ok('rig: unrelated muscles stay cold',
      !il.rigFigureSVG('seated',30,quietEx,[47,55],false).includes(warm));
    // IK: a reachable target is met exactly; an unreachable one straightens out
    const root=[10,10],reach=(l1,l2)=>l1+l2;
    const[,endNear]=il.ik2(root,[10,25],10.5,10.5,false);
    ok('rig IK: reachable target is met',
      Math.hypot(endNear[0]-10,endNear[1]-25)<.3,'end '+endNear.map(v=>v.toFixed(1)));
    const[,endFar]=il.ik2(root,[10,90],10.5,10.5,false);
    ok('rig IK: unreachable target straightens the limb instead of snapping',
      Math.abs(Math.hypot(endFar[0]-root[0],endFar[1]-root[1])-reach(10.5,10.5))<.2);
    const[mid1]=il.ik2(root,[10,25],10.5,10.5,false);
    const[mid2]=il.ik2(root,[10,25],10.5,10.5,true);
    ok('rig IK: the flip flag bends the joint the other way',
      Math.abs(mid1[0]-mid2[0])>1);
    ok('rig: leg exercises drive the legs, not the arms',(()=>{
      const legEx={id:'r3',name:'R3',m:'Quads',s:[],e:'Machine'};
      const a=il.rigFigureSVG('lying',22,legEx,[44,64],true);
      const b=il.rigFigureSVG('lying',22,legEx,[70,30],true);
      return a!==b;   // moving the target repositions the tracked limb
    })());
    ok('rig: every posture renders',
      ['seated','standing','lying','incline'].every(p=>il.rigFigureSVG(p,30,rigEx,[47,55],false).length>200));
    /* animated plotter: the figure performs the rep on a loop */
    document.querySelectorAll('.overlay').forEach(o=>o.remove());
    const animEx={id:'t_anim',name:'T Anim',m:'Back',s:['Biceps'],e:'Machine'};
    il.S.ex.set(animEx.id,animEx);
    il.movementSheet(animEx,()=>{});
    await sleep(120);
    const rigSvg=document.querySelector('svg.rig');
    ok('plot anim: a dynamic layer holds the moving parts',!!rigSvg&&!!rigSvg.querySelector('.dyn'));
    const plateY=()=>{const r=document.querySelector('svg.rig .dyn rect.plate');return r?+r.getAttribute('y'):null;};
    ok('plot anim: the plate renders inside the dynamic layer',plateY()!=null);
    const seen=new Set();
    for(let i=0;i<8;i++){seen.add(plateY());await sleep(220);}
    ok('plot anim: the load travels its path on a loop',seen.size>2,seen.size+' distinct positions');
    // dragging must freeze the loop so the finger owns the geometry
    const svgEl=document.querySelector('svg.rig'),rr=svgEl.getBoundingClientRect();
    const cpt=(x,y)=>({clientX:rr.left+x/100*rr.width,clientY:rr.top+y/100*rr.height});
    const pf2=(t,p)=>svgEl.dispatchEvent(new PointerEvent(t,{...p,bubbles:true,pointerId:9,isPrimary:true}));
    pf2('pointerdown',cpt(47,55));
    const frozenA=plateY();await sleep(600);const frozenB=plateY();
    ok('plot anim: the loop pauses while you drag a point',frozenA===frozenB);
    pf2('pointerup',cpt(47,55));
    await sleep(500);
    ok('plot anim: it resumes after you let go',plateY()!==frozenB);
    // and must not keep running once the sheet is gone
    let rafN=0;const origRaf=window.requestAnimationFrame;
    window.requestAnimationFrame=function(cb){rafN++;return origRaf.call(window,cb);};
    document.querySelector('.overlay .sheet-x').click();
    await sleep(400);const settled=rafN;await sleep(500);
    window.requestAnimationFrame=origRaf;
    ok('plot anim: closing the sheet cancels the loop (no leaked rAF)',rafN-settled<=1,
      'growth after close: '+(rafN-settled));
    il.S.ex.delete(animEx.id);
    document.querySelectorAll('.overlay').forEach(o=>o.remove());

    /* ---------- 4d. the three load domains ----------
       loadOf = as typed · workLoad = tonnage · strengthLoad = tonnage × ROM.
       These assertions exist because per-side and leverage were originally
       wired into the strength score ONLY, silently under-counting muscle
       balance and session volume. */
    const uniBB={id:'t_u',name:'T Uni',m:'Back',s:[],e:'Dumbbell',uni:1};
    const lever={id:'t_l',name:'T Lever',m:'Back',s:[],e:'Machine',mech:{ratio:.5,romCm:0}};
    const plain={id:'t_p',name:'T Plain',m:'Back',s:[],e:'Barbell'};
    const s5={t:'N',w:40,r:10,rpe:8};
    ok('domains: loadOf reports the weight as typed',near(il.loadOf(uniBB,s5),40));
    ok('domains: workLoad doubles a per-side lift',near(il.workLoad(uniBB,s5),80));
    ok('domains: workLoad applies machine leverage',near(il.workLoad(lever,s5),20));
    ok('domains: workLoad is a no-op on a plain barbell lift',
      near(il.workLoad(plain,s5),il.loadOf(plain,s5)));
    ok('domains: strengthLoad = workLoad × romFactor',
      near(il.strengthLoad(lever,s5),il.workLoad(lever,s5)*il.romFactor(lever)));
    // …and that the tonnage domain actually reaches the aggregates
    for(const x of[uniBB,lever,plain]){il.S.ex.set(x.id,x);await il.dbPut('exercises',x);}
    const volWk=(exId)=>({id:uid(),name:'V',finishedAt:Date.now()-864e5,dur:60,notes:'',
      exs:[{exId,sets:[{t:'N',w:40,r:10,rpe:8,done:true}]}]});
    il.S.workouts=[volWk(plain.id)];
    const volPlain=il.workoutVolume(il.S.workouts[0]);
    ok('volume: a plain lift is weight × reps',near(volPlain,400));
    il.S.workouts=[volWk(uniBB.id)];
    ok('volume: session tonnage counts BOTH sides of a per-side lift',
      near(il.workoutVolume(il.S.workouts[0]),800),'40×10 per side → 800');
    il.S.workouts=[volWk(lever.id)];
    ok('volume: session tonnage applies machine leverage',
      near(il.workoutVolume(il.S.workouts[0]),200));
    il.S.workouts=[volWk(uniBB.id)];
    const aggV=il.muscleAgg(7,'vol'),aggS=il.muscleAgg(7,'sets');
    ok('balance: muscle VOLUME counts both sides (the reported bug)',
      near(aggV.Back,800),'Back volume '+aggV.Back);
    ok('balance: muscle SETS still counts one set of stimulus per side',
      near(aggS.Back,1),'Back sets '+aggS.Back);
    il.S.workouts=[volWk(lever.id)];
    ok('balance: muscle volume applies machine leverage',
      near(il.muscleAgg(7,'vol').Back,200));
    // volume RECORDS must use the same domain as the session total they are
    // compared against, or a per-side lift could never beat its own record
    il.S.workouts=[volWk(uniBB.id)];
    const uRec=il.computeRecords(uniBB.id);
    ok('records: best session volume uses the tonnage domain',near(uRec.vol.v,800));
    ok('records: heaviest weight stays as typed',near(uRec.w.v,40),
      'a per-side PR must never print a weight you never held');
    ok('records: est. 1RM stays as typed',near(uRec.e1rm.v,il.epley(40,10)));
    // fatigue is set-based by design — weight-independent, so per-side must NOT
    // double there (each side genuinely received one set)
    const fatUni=il.muscleRecovery().Back.fatigue;
    il.S.workouts=[volWk(plain.id)];
    const fatPlain=il.muscleRecovery().Back.fatigue;
    ok('fatigue: per-side lifts DO generate fatigue',fatUni>0,'Back fatigue '+fatUni);
    ok('fatigue: per-side does not double fatigue (each side got one set)',
      fatUni===fatPlain,'uni '+fatUni+' vs plain '+fatPlain);
    for(const x of[uniBB,lever,plain]){il.S.ex.delete(x.id);}

    /* ---------- 5. score invariance (the back-compat guarantee) ---------- */
    await il.dbPut('exercises',bb);await il.dbPut('exercises',mc);
    il.S.ex.set(bb.id,bb);il.S.ex.set(mc.id,mc);
    const now=Date.now();
    il.S.workouts=[mkWorkout(bb.id,[[100,5]],now-6*864e5)];
    const scoreFree=il.strengthProfile();
    il.S.workouts.push(mkWorkout(mc.id,[[220,5]],now-5*864e5));
    const scoreWithMachine=il.strengthProfile();
    ok('score: an uncalibrated machine cannot move the score',
      scoreFree.score===scoreWithMachine.score&&near(scoreFree.per.Chest,scoreWithMachine.per.Chest),
      scoreFree.score+' → '+scoreWithMachine.score);
    ok('score: uncalibratedMachines() surfaces it',
      il.uncalibratedMachines().some(x=>x.id===mc.id));
    const mcCal={...mc,mech:{kind:'lever',ratio:.5,romCm:42,at:now}};
    il.S.ex.set(mc.id,mcCal);await il.dbPut('exercises',mcCal);
    const scoreCal=il.strengthProfile();
    ok('score: calibrating lets the machine contribute',
      scoreCal.best.Chest&&near(scoreCal.best.Chest.v,il.epley(110,5),1e-6),
      '220 kg × 0.5 = 110 effective → best Chest '+(scoreCal.best.Chest||{}).v);
    ok('score: calibrated machine no longer listed as uncounted',
      !il.uncalibratedMachines().some(x=>x.id===mc.id));
    ok('score: PR/volume paths still use the TYPED weight',
      near(il.loadOf(mcCal,{w:220,r:5}),220),'loadOf must stay uncalibrated');

    /* ---------- 6. schedule date maths ---------- */
    const anchor=new Date(2026,0,5).getTime();   // a Monday
    il.S.set.sched={on:1,mode:'cycle',anchor,remind:0,at:'17:30',lastNotif:'',
      days:[{label:'Upper A'},{label:'Lower A'},{rest:1,label:'Rest'},
            {label:'Upper B'},{label:'Lower B'},{rest:1,label:'Rest'}]};
    const idxAt=d=>{const t=new Date(2026,0,5+d,12,0,0).getTime();const s=il.schedFor(t);return s?s.idx:null;};
    let cyc=true;
    for(let d=0;d<18;d++)if(idxAt(d)!==d%6)cyc=false;
    ok('schedule: 6-day cycle rotates correctly over 18 days',cyc,
      [0,1,2,3,4,5,6,7].map(idxAt).join(','));
    ok('schedule: cycle drifts through the week (day 7 is Lower A, not Upper A)',
      idxAt(7)===1);
    ok('schedule: dates BEFORE the anchor stay in range',
      idxAt(-1)===5&&idxAt(-13)===5,'day -1 → '+idxAt(-1));
    // DST: late-March and late-October transitions must not slip the rotation
    let dst=true;
    for(let d=60;d<340;d++)if(idxAt(d)!==((d%6)+6)%6)dst=false;
    ok('schedule: no drift across DST transitions (280 days)',dst);
    ok('schedule: rest days flagged',il.schedFor(new Date(2026,0,7,12).getTime()).day.rest===1);
    il.S.set.sched.mode='week';
    il.S.set.sched.days=il.S.set.sched.days.concat([{rest:1,label:'Rest'}]);
    ok('schedule: week mode maps Monday → slot 0',
      il.schedFor(new Date(2026,0,5,12).getTime()).idx===0);
    ok('schedule: week mode maps Sunday → slot 6',
      il.schedFor(new Date(2026,0,11,12).getTime()).idx===6);
    il.S.set.sched.on=0;
    ok('schedule: switched off returns nothing',il.schedFor(Date.now())===null);
    ok('schedule: daysBetween is symmetric and signed',
      il.daysBetween(anchor,anchor+3*864e5)===3&&il.daysBetween(anchor+3*864e5,anchor)===-3);

    /* ---------- 6b. reminder decision logic ---------- */
    // schedTick stamps lastNotif only when it actually decides to notify, so
    // that field is a faithful proxy for "would have fired" without needing
    // notification permission in the harness
    const past=new Date();past.setHours(0,1,0,0);
    const hhmm=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    const future=new Date(Date.now()+3600000);
    const mkSched=(over)=>Object.assign({on:1,mode:'cycle',anchor:midnightOf(Date.now()),
      remind:1,at:hhmm(past),lastNotif:'',
      days:[{label:'Upper A'},{rest:1,label:'Rest'}]},over||{});
    function midnightOf(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
    il.S.workouts=[];
    il.S.set.sched=mkSched();
    await il.schedTick();
    ok('reminder: fires on a training day once the time has passed',
      il.S.set.sched.lastNotif===il.dateKey(Date.now()));
    // "an hour from now" wraps past midnight after 23:00 — 00:30 reads as
    // already overdue, which made this fail every night in the last hour of
    // the day. Clamp to 23:59, and in that final minute there is no later time
    // left today to test with.
    const eod=new Date();eod.setHours(23,59,0,0);
    il.S.set.sched=mkSched({lastNotif:''});
    il.S.set.sched.at=hhmm(new Date(Math.min(future.getTime(),eod.getTime())));
    await il.schedTick();
    ok('reminder: silent before the reminder time',
      Date.now()>=eod.getTime()||il.S.set.sched.lastNotif==='',
      Date.now()>=eod.getTime()?'skipped: no later reminder time left today':'');
    il.S.set.sched=mkSched({anchor:midnightOf(Date.now()-864e5)});   // today = slot 1 = Rest
    await il.schedTick();
    ok('reminder: silent on a rest day',il.S.set.sched.lastNotif==='');
    il.S.set.sched=mkSched();
    il.S.workouts=[mkWorkout('x06',[[100,5]],Date.now()-3600000)];   // already trained today
    await il.schedTick();
    ok('reminder: silent once you have already trained today',il.S.set.sched.lastNotif==='');
    il.S.workouts=[];
    il.S.set.sched=mkSched({lastNotif:il.dateKey(Date.now())});
    await il.schedTick();
    ok('reminder: never fires twice in one day',il.S.set.sched.lastNotif===il.dateKey(Date.now()));
    il.S.set.sched=mkSched({remind:0});
    await il.schedTick();
    ok('reminder: silent when reminders are switched off',il.S.set.sched.lastNotif==='');
    // a schedule whose template was deleted must degrade, not break
    il.S.set.sched=mkSched({days:[{label:'Ghost Day',tplId:'tpl_does_not_exist'}]});
    const ghost=il.schedFor(Date.now());
    ok('schedule: a deleted template degrades to a labelled day',
      ghost&&ghost.tpl===null,'label still "'+(ghost?ghost.day.label:'?')+'"');

    /* ---------- 7. PR celebration on edit ---------- */
    document.querySelectorAll('#toasts .toast').forEach(t=>t.remove());
    const prEx={id:'t_pr',name:'T PR Lift',m:'Back',s:[],e:'Barbell'};
    il.S.ex.set(prEx.id,prEx);await il.dbPut('exercises',prEx);
    il.S.workouts=[mkWorkout(prEx.id,[[100,5]],now-3*864e5)];   // establishes a history
    il.S.records[prEx.id]=il.computeRecords(prEx.id);
    il.S.active={id:uid(),name:'PR test',startedAt:now,notes:'',
      exs:[{exId:prEx.id,sets:[{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:true}]}]};
    const en=il.S.active.exs[0],pset=en.sets[0];
    const row=document.createElement('div');
    il.reverifySet(en,pset,row);            // still 100 kg → not a record
    await sleep(1000);
    ok('PR: matching your best does not celebrate',
      !document.querySelector('#toasts .toast.pr')&&!pset.pr);
    pset.w=140;                              // edited upward into record territory
    il.reverifySet(en,pset,row);
    ok('PR: gold ring appears immediately on edit',!!pset.pr&&row.classList.contains('prset'));
    ok('PR: celebration is debounced, not instant',!document.querySelector('#toasts .toast.pr'));
    await sleep(1100);
    const prToast=document.querySelector('#toasts .toast.pr');
    ok('PR: editing a set into a record DOES celebrate (the reported bug)',
      !!prToast,prToast?prToast.textContent.slice(0,60):'no toast fired');
    const toastCount=document.querySelectorAll('#toasts .toast.pr').length;
    il.reverifySet(en,pset,row);             // same numbers again
    await sleep(1100);
    ok('PR: re-touching an already-cheered set stays quiet',
      document.querySelectorAll('#toasts .toast.pr').length===toastCount);
    il.S.active=null;
    document.querySelectorAll('#toasts .toast').forEach(t=>t.remove());

    /* ---------- 8. export → import round trip ---------- */
    il.S.set.sched={on:1,mode:'cycle',anchor,remind:1,at:'18:15',lastNotif:'',
      days:[{label:'Upper A'},{rest:1,label:'Rest'}]};
    await il.kvPut('settings',il.S.set);
    const before=await il.buildExportData();
    await il.applyImport(JSON.parse(JSON.stringify(before)));
    const after=await il.buildExportData();
    const bn=norm({...before,exportedAt:0}),an=norm({...after,exportedAt:0});
    ok('backup: export → import → export is identical',
      JSON.stringify(bn)===JSON.stringify(an),
      JSON.stringify(bn)===JSON.stringify(an)?'':'first divergence logged to console');
    if(JSON.stringify(bn)!==JSON.stringify(an))console.warn('round-trip diff',bn,an);
    ok('backup: mech calibration survives the round trip',
      (after.exercises.find(x=>x.id===mc.id)||{}).mech!=null);
    ok('backup: schedule survives the round trip',
      after.settings.sched&&after.settings.sched.days.length===2&&after.settings.sched.at==='18:15');

    /* ---------- 9. backward compatibility with pre-5.2 data ---------- */
    const v4={app:'ironlog',version:1,exportedAt:'2026-03-01T00:00:00.000Z',
      settings:{unit:'kg',restSec:150,theme:'light',name:'Callum',strScale:1.05},  // no coachOff/heightCm/sched
      exercises:[{id:'x06',name:'Bench Press',m:'Chest',s:['Triceps'],e:'Barbell'},
                 {id:'old1',name:'Old Machine Row',m:'Back',s:[],e:'Machine',custom:true}],
      workouts:[{id:'w_old',name:'Legacy',finishedAt:now-20*864e5,dur:3000,notes:'',
        exs:[{exId:'x06',sets:[{t:'N',w:80,r:5,rpe:8,done:true}]},          // no dur/dist fields at all
             {exId:'old1',sets:[{t:'N',w:60,r:10,done:true}]}]}],
      templates:[],body:[],photos:[],deadSeeds:[]};
    await il.applyImport(v4);
    ok('v4 import: legacy workout preserved',il.S.workouts.length===1);
    ok('v4 import: missing settings gain defaults',
      Array.isArray(il.S.set.coachOff)&&il.S.set.heightCm>0&&il.S.set.sched===null,
      'coachOff='+JSON.stringify(il.S.set.coachOff)+' heightCm='+il.S.set.heightCm);
    ok('v4 import: user settings preserved',il.S.set.restSec===150&&il.S.set.name==='Callum');
    ok('v4 import: v5 cardio seeds backfilled',!!il.S.ex.get('c05'),'Swimming present');
    ok('v4 import: legacy custom exercises gain no mech/uni',
      !il.S.ex.get('old1').mech&&!il.S.ex.get('old1').uni);
    ok('v4 import: restored seeds still receive per-side tagging',
      !!il.S.ex.get('x09').uni,'importing onto an already-patched device must re-patch');
    const v4score=il.strengthProfile();
    ok('v4 import: strength score computes and ignores the uncalibrated machine',
      v4score.score>0&&near(v4score.best.Chest.v,il.epley(80,5),1e-6));
    ok('v4 import: sets without dur/dist still render',(()=>{try{il.switchTab('history');return true;}catch(e){return false;}})());
    let allTabs=true;
    for(const t of['log','templates','history','progress','body']){
      try{il.switchTab(t);}catch(e){allTabs=false;console.error('tab '+t,e);}
    }
    ok('v4 import: every tab renders on legacy data',allTabs);
    ok('v4 import: cardio coach still picks',!!il.cardioRecommendation());

    /* ---------- 9b. Settings entry points ---------- */
    document.querySelectorAll('.overlay').forEach(o=>o.remove());
    il.exerciseLibrarySheet();
    await sleep(120);
    const lib=document.querySelector('.overlay');
    ok('library: opens from outside a workout',
      !!lib&&/Exercise library/.test(lib.querySelector('h2').textContent));
    ok('library: lists the whole library',
      lib&&lib.querySelectorAll('.ex-row').length>=60,
      (lib?lib.querySelectorAll('.ex-row').length:0)+' rows');
    ok('library: has a to-calibrate filter',
      !!lib&&/To calibrate/.test(lib.textContent));
    document.querySelectorAll('.overlay').forEach(o=>o.remove());
    const gear=document.querySelector('#gearbtn svg');
    ok('settings icon: is a cog path, not radiating sun lines',
      !!gear&&gear.classList.contains('gear')&&gear.querySelectorAll('path').length===1
      &&gear.querySelector('path').getAttribute('d').split('L').length>20,
      'toothed outline with '+(gear?gear.querySelector('path').getAttribute('d').split('L').length-1:0)+' vertices');

    /* ---------- 9c. v5.5 UI polish ---------- */
    // template lines: a target-less entry must read "3 sets", never "3 × ?"
    il.S.templates=[{id:'t_tpl',name:'T',pos:0,exs:[{exId:'x06',sets:3,tgt:{}}]}];
    il.switchTab('templates');
    await sleep(60);
    const tplLine=document.querySelector('#page-templates .card .hist-line');
    ok('templates: no rep target renders as "3 sets", not "3 × ?"',
      tplLine&&/3 sets/.test(tplLine.textContent)&&!/\?/.test(tplLine.textContent),
      tplLine?tplLine.textContent.trim():'no line');
    il.S.templates=[];
    // history: cardio-only sessions show minutes, never "0 kg"
    il.S.workouts=[{id:uid(),name:'Cardio Session',finishedAt:Date.now()-3600e3,dur:2100,notes:'',
      exs:[{exId:'c03',sets:[{t:'N',w:null,r:null,rpe:6,dur:35,dist:14,done:true}]}]}];
    il.switchTab('history');
    await sleep(60);
    const histStats=document.querySelector('#page-history .card .wo-stats');
    ok('history: cardio-only workout shows minutes, not 0 kg',
      histStats&&/35 min cardio/.test(histStats.textContent)&&!/0 kg/.test(histStats.textContent),
      histStats?histStats.textContent:'no stats');
    ok('history: workoutCardioMin sums non-warm-up minutes',
      near(il.workoutCardioMin(il.S.workouts[0]),35));
    // settings hub cards lead the sheet
    document.querySelectorAll('.overlay').forEach(o=>o.remove());
    document.querySelector('#gearbtn').click();
    await sleep(150);
    const sheetEl=document.querySelector('.overlay .sheet');
    const hubs=sheetEl?[...sheetEl.querySelectorAll('.hub-btn')]:[];
    ok('settings: hub cards for library + schedule at the top',
      hubs.length===2&&/Exercise library/.test(hubs[0].textContent)&&/schedule/i.test(hubs[1].textContent));
    if(sheetEl){
      const firstCtl=sheetEl.querySelector('.hub-row'),nameLbl=[...sheetEl.querySelectorAll('.lbl')][0];
      ok('settings: hubs appear before the first tuning field',
        !!firstCtl&&!!nameLbl&&(firstCtl.compareDocumentPosition(nameLbl)&Node.DOCUMENT_POSITION_FOLLOWING));
    }
    document.querySelectorAll('.overlay').forEach(o=>o.remove());
    // getting-started card: shows on a fresh install, ticks progress, hides on dismiss
    const savedIntro=await il.kvGet('introDone');
    await il.kvPut('introDone',0);il.setIntroDone(null);
    il.S.workouts=[];il.S.templates=[];
    // give the tick-detection a known premise: schedule on, nothing else done
    il.S.set.sched={on:1,mode:'cycle',anchor:Date.now(),remind:0,at:'17:30',lastNotif:'',
      days:[{label:'A'},{rest:1,label:'Rest'}]};
    il.switchTab('log');await sleep(60);
    const intro=[...document.querySelectorAll('#page-log .card')].find(c=>c.textContent.includes('Getting started'));
    ok('intro: card shows on a fresh install',!!intro);
    ok('intro: a completed step shows as ticked (schedule is on)',
      intro&&[...intro.querySelectorAll('.intro-step')].some(s=>s.classList.contains('done')&&/split/.test(s.textContent)));
    ok('intro: incomplete steps are not ticked',
      intro&&[...intro.querySelectorAll('.intro-step')].filter(s=>!s.classList.contains('done')).length===2);
    if(intro)intro.querySelector('button.btn').click();
    await sleep(60);
    ok('intro: dismiss persists to kv',(await il.kvGet('introDone'))===1);
    ok('intro: gone after dismissing',
      ![...document.querySelectorAll('#page-log .card')].some(c=>c.textContent.includes('Getting started')));
    il.setIntroDone(null);await il.kvPut('introDone',0);
    il.S.workouts=[1,2,3].map(i=>mkWorkout('x06',[[60,5]],Date.now()-i*864e5));
    il.switchTab('log');await sleep(60);
    ok('intro: retires by itself after 3 workouts',
      ![...document.querySelectorAll('#page-log .card')].some(c=>c.textContent.includes('Getting started')));
    await il.kvPut('introDone',savedIntro||0);

    /* ---------- 9d. v5.6 balance + motion ---------- */
    // Strength balance must reflect STRENGTH, not recent volume: a muscle you
    // hammered with light weight should not outrank a strong one you rested.
    il.S.ex.set(plain.id,plain);il.S.ex.set(uniBB.id,uniBB);
    il.S.workouts=[
      mkWorkout('x06',[[120,5]],now-3*864e5),   // strong chest
      mkWorkout('x27',[[15,8]],now-2*864e5),    // weak biceps, but…
      mkWorkout('x27',[[15,8]],now-1*864e5),    // …trained twice as often
    ];
    il.switchTab('progress');await sleep(80);
    const balCard=[...document.querySelectorAll('#page-progress .card')].find(c=>/Strength balance/.test(c.textContent));
    ok('balance: card exists and is no longer volume-titled',
      !!balCard&&!/last 30 days/.test(balCard.querySelector('h3').textContent));
    const balRows=balCard?[...balCard.querySelectorAll('.bal-row')].map(r=>[
      r.querySelector('.nm').textContent,parseFloat(r.querySelector('.pct').textContent)]):[];
    const bChest=balRows.find(r=>r[0]==='Chest'),bBi=balRows.find(r=>r[0]==='Biceps');
    ok('balance: ranks by strength, not by how often you trained it',
      bChest&&bBi&&bChest[1]>bBi[1],
      'Chest '+(bChest&&bChest[1])+' vs twice-trained Biceps '+(bBi&&bBi[1]));
    ok('balance: values match the radar scale exactly',(()=>{
      const sp=il.strengthProfile();
      return balRows.every(([m,v])=>Math.abs(v-Math.round(sp.radar[m]))<=1);
    })(),'bars are the same numbers as the radar axes');
    ok('balance: a genuinely lagging muscle is called out',
      balCard&&/Behind the rest of you/.test(balCard.textContent)&&/Biceps/.test(balCard.textContent));
    // median reference: one huge outlier must not flag everyone else
    il.S.workouts=[mkWorkout('x03',[[400,5]],now-4*864e5),   // absurd deadlift
      mkWorkout('x06',[[100,5]],now-3*864e5),mkWorkout('x11',[[60,5]],now-2*864e5),
      mkWorkout('x27',[[40,5]],now-1*864e5)];
    il.switchTab('progress');await sleep(80);
    const balCard2=[...document.querySelectorAll('#page-progress .card')].find(c=>/Strength balance/.test(c.textContent));
    ok('balance: uses a MEDIAN so one outlier lift cannot flag the whole body',
      balCard2&&/Well balanced/.test(balCard2.textContent),
      balCard2?balCard2.textContent.match(/⚖️[^]*?\./)[0].slice(0,90):'');

    // motion: entrance animations exist, are retriggerable, and are opt-out
    il.S.workouts=[mkWorkout('x06',[[100,5]],now-864e5)];
    il.switchTab('body');il.switchTab('progress');
    const pgEl=document.querySelector('#page-progress');
    ok('motion: tab switch arms the staggered entrance',pgEl.classList.contains('anim'));
    const kidCs=pgEl.children[1]?getComputedStyle(pgEl.children[1]):null;
    ok('motion: page children animate in with a stagger',
      kidCs&&kidCs.animationName==='cardIn'&&parseFloat(kidCs.animationDelay)>0,
      kidCs?kidCs.animationName+' @ '+kidCs.animationDelay:'none');
    ok('motion: stagger is capped so long lists do not cascade',(()=>{
      const kids=[...pgEl.children];
      if(kids.length<7)return true;
      const d=k=>parseFloat(getComputedStyle(k).animationDelay);
      return d(kids[6])<=d(kids[5])+.001;
    })());
    ok('motion: switching away and back retriggers it',(()=>{
      il.switchTab('log');il.switchTab('progress');
      return document.querySelector('#page-progress').classList.contains('anim');
    })());
    // set rows
    il.S.active={id:uid(),name:'Motion',startedAt:now,notes:'',
      exs:[{exId:'x06',notes:'',sets:[{t:'N',w:60,r:5,rpe:8,dur:null,dist:null,done:false},
        {t:'N',w:60,r:5,rpe:8,dur:null,dist:null,done:false}]}]};
    il.S.prev={};il.S.records={};
    il.switchTab('log');await sleep(80);
    const srow=document.querySelectorAll('#page-log .setgrid .setrow')[1];
    const srCs=srow?getComputedStyle(srow):null;
    ok('motion: set rows slide in, staggered',
      srCs&&srCs.animationName==='rowIn'&&parseFloat(srCs.animationDelay)>0,
      srCs?srCs.animationName+' @ '+srCs.animationDelay:'no set row');
    il.S.active=null;
    const toastCs=(()=>{const t=document.createElement('div');t.className='toast';
      document.getElementById('toasts').append(t);const c=getComputedStyle(t);
      const o={t:c.transform,o:c.opacity};t.remove();return o;})();
    ok('motion: toasts start offset and transparent, then settle',
      toastCs.o==='0'&&/matrix/.test(toastCs.t)&&toastCs.t!=='none',toastCs.t);
    ok('motion: reduced-motion opt-out is declared',
      [...document.styleSheets].some(ss=>{try{return [...ss.cssRules].some(r=>
        r.conditionText&&/prefers-reduced-motion/.test(r.conditionText));}catch(e){return false;}}));

    /* ---------- 10. PWA assets ---------- */
    const mres=await fetch('manifest.webmanifest');
    ok('pwa: manifest served',mres.ok,'HTTP '+mres.status);
    const man=await mres.json();
    ok('pwa: manifest has name / start_url / display',
      !!man.name&&!!man.start_url&&man.display==='standalone');
    const has=(s)=>man.icons.some(i=>i.sizes===s);
    ok('pwa: 192 and 512 icons declared',has('192x192')&&has('512x512'));
    ok('pwa: maskable icon declared',man.icons.some(i=>(i.purpose||'').includes('maskable')));
    let iconsOk=true;
    for(const i of man.icons){const r=await fetch(i.src);if(!r.ok)iconsOk=false;}
    ok('pwa: every declared icon actually resolves',iconsOk);
    ok('pwa: apple-touch-icon link present',!!document.querySelector('link[rel="apple-touch-icon"]'));
    ok('pwa: manifest linked from the page',!!document.querySelector('link[rel="manifest"]'));
    const atr=await fetch('apple-touch-icon.png');
    ok('pwa: apple-touch-icon resolves',atr.ok);
    ok('pwa: theme-color meta present',!!document.querySelector('meta[name="theme-color"]'));

    /* ---------- 11. v5.7: cross-platform shell ----------
       The Android WebAPK nav breakage. shellPlan() is a pure function precisely
       so the numbers real devices report can be fed in directly. */
    const sp=il.shellPlan;
    // the device measurements these were built against
    const IPH17 ={ios:true, standalone:true,vvH:799,screenW:402,screenH:874,portrait:true,curH:799,curW:402,mode:'auto'};
    const IPH14 ={ios:true, standalone:true,vvH:759,screenW:393,screenH:852,portrait:true,curH:759,curW:393,mode:'auto'};
    const S25_G ={ios:false,standalone:true,vvH:852,screenW:412,screenH:892,portrait:true,curH:852,curW:412,mode:'auto'};
    const S25_3B={ios:false,standalone:true,vvH:816,screenW:412,screenH:892,portrait:true,curH:816,curW:412,mode:'auto'};

    ok('shell: iPhone 17 standalone heals its short viewport',
      sp(IPH17).height===874,JSON.stringify(sp(IPH17)));
    ok('shell: iPhone 14 Pro standalone heals its short viewport',
      sp(IPH14).height===852,JSON.stringify(sp(IPH14)));
    ok('shell: Android WebAPK is never stretched (gesture nav)',
      sp(S25_G).height===null&&sp(S25_G).release===true,JSON.stringify(sp(S25_G)));
    ok('shell: Android WebAPK is never stretched (3-button nav)',
      sp(S25_3B).height===null&&sp(S25_3B).release===true,JSON.stringify(sp(S25_3B)));

    /* NEGATIVE CONTROL for the above — reproduces the v5.6 gate (standalone via
       the display-mode media query alone, with no iOS check) and proves it
       stretched the Android shell past the fold. If this ever stops failing,
       the two assertions above have stopped testing anything. */
    const v56plan=env=>{
      const standalone=true;           // what matchMedia said in a WebAPK
      let target=env.vvH;
      if(standalone){
        const sh=env.portrait?Math.max(env.screenW,env.screenH):Math.min(env.screenW,env.screenH);
        if(sh>target)target=sh;
      }
      const grow=target-env.curH;
      return (grow>2&&grow<=140)?target:null;
    };
    ok('shell: NEGATIVE CONTROL — the old gate did stretch Android past the fold',
      v56plan(S25_3B)===892&&892>S25_3B.vvH,
      'old code pinned 892px into an '+S25_3B.vvH+'px viewport = '+(892-S25_3B.vvH)+'px of nav below the fold');

    ok('shell: a browser tab is left alone on both platforms',
      sp({...IPH17,standalone:false}).height===null&&sp({...S25_G,standalone:false}).height===null);
    ok('shell: the keyboard shrinking the visual viewport never squashes the shell',
      sp({...IPH17,vvH:430,curH:874}).height===null,'grow must go negative, not positive');
    ok('shell: refuses to trust screen.height when the app does not own the width',
      sp({...IPH17,curW:300}).height===null&&sp({...IPH17,curW:300}).why==='not-fullscreen');
    ok('shell: a few pixels of rounding noise is not worth stretching for',
      sp({...IPH17,curH:870}).height===null,'grow 4px is below the floor');
    ok('shell: an implausible screen size is refused',
      sp({...IPH17,screenH:2000,vvH:400,curH:400}).height===null);
    ok('shell: escape hatch — Never disables the heal on iOS',
      sp({...IPH17,mode:'off'}).height===null&&sp({...IPH17,mode:'off'}).release===true);
    ok('shell: escape hatch — Always enables it off-iOS',
      sp({...S25_3B,mode:'on'}).height===892);
    ok('shell: landscape picks the short screen dimension',
      sp({...IPH17,portrait:false,vvH:360,curH:360,curW:874}).height===402);
    /* the v5.6 healer measured body's own box, which it had just resized, so
       after one fire it always saw grow===0: it could neither re-correct nor
       ever let go. curH is now the layout viewport, which stays honest. */
    ok('shell: the heal is idempotent, not a one-way latch',
      sp(IPH17).height===874&&sp({...IPH17,curH:874}).height===null
        &&sp({...IPH17,curH:874}).release===true,
      'holds its target, then releases once the viewport reports honestly');

    ok('shell: every target device ends with the tab bar inside the viewport',(()=>{
      for(const [name,env] of [['iPhone17',IPH17],['iPhone14Pro',IPH14],['S25U-gesture',S25_G],['S25U-3button',S25_3B]]){
        const p=sp(env);
        const shellH=p.height||env.vvH;      // what the shell ends up being
        const visible=env.ios?Math.max(env.vvH,p.height||0):env.vvH;
        if(shellH>visible)return false;
      }
      return true;
    })());

    /* ---------- 12. v5.7: storage durability ---------- */
    ok('storage: the app asks not to be evicted',typeof il.ensurePersistence==='function');
    const stRep=await il.storageReport();
    ok('storage: persistence state is readable',
      stRep&&(stRep.persisted===true||stRep.persisted===false||stRep.persisted===null),
      'persisted='+stRep.persisted);
    ok('storage: quota is reported so the user can see headroom',
      stRep.quota>0||!navigator.storage||!navigator.storage.estimate,
      il.fmtBytes(stRep.usage)+' / '+il.fmtBytes(stRep.quota));
    ok('storage: fmtBytes is human-readable',
      il.fmtBytes(0)==='0 KB'&&il.fmtBytes(2048)==='2 KB'&&il.fmtBytes(5242880)==='5.0 MB',
      [il.fmtBytes(0),il.fmtBytes(2048),il.fmtBytes(5242880)].join(' · '));

    const bkSaved={last:il.BK.last,snooze:il.BK.snooze};
    const DAY=86400000, NOW=Date.now();
    ok('backup: nagged once there is history to lose',
      il.backupNagDue({workouts:5,last:null,snooze:0,now:NOW})===true);
    ok('backup: NEGATIVE CONTROL — not nagged before there is anything to lose',
      il.backupNagDue({workouts:4,last:null,snooze:0,now:NOW})===false,
      'a brand-new install must not be nagged');
    ok('backup: a fresh backup silences the nag',
      il.backupNagDue({workouts:50,last:NOW-2*DAY,snooze:0,now:NOW})===false);
    ok('backup: a stale backup raises it again',
      il.backupNagDue({workouts:50,last:NOW-30*DAY,snooze:0,now:NOW})===true);
    ok('backup: dismissing it is respected for a week',
      il.backupNagDue({workouts:50,last:null,snooze:NOW-2*DAY,now:NOW})===false
      &&il.backupNagDue({workouts:50,last:null,snooze:NOW-9*DAY,now:NOW})===true);
    await il.noteBackup();
    ok('backup: exporting records the date on this device',
      (await il.kvGet('lastBackupAt'))>0&&il.BK.last>0);
    il.BK.last=bkSaved.last;il.BK.snooze=bkSaved.snooze;

    /* ---------- 13. v5.7: PREV fallback ---------- */
    {
      const pex={id:'t_prev',name:'T Prev',m:'Chest',s:[],e:'Barbell'};
      il.S.ex.set(pex.id,pex);
      il.S.prev[pex.id]={sets:[
        {t:'W',w:40,r:10,rpe:6,dur:null,dist:null},
        {t:'N',w:80,r:8,rpe:8,dur:null,dist:null},
        {t:'N',w:85,r:6,rpe:9,dur:null,dist:null}]};
      // the rows as addExerciseToActive builds them: last session's shape
      const en={exId:pex.id,sets:[{t:'W'},{t:'N'},{t:'N'}]};
      const g1=il.ghost(en,1), g4=il.ghost(en,4);
      ok('prev: a matching set index still shows that exact set',
        g1&&g1.w===80&&g1.r===8&&g1.src==='prev',JSON.stringify(g1));
      ok('prev: a set beyond last session falls back to its last WORKING set',
        g4&&g4.w===85&&g4.r===6&&g4.src==='prevlast',JSON.stringify(g4));
      ok('prev: NEGATIVE CONTROL — v5.6 returned nothing there, blanking PREV',
        (()=>{const p=il.S.prev[pex.id];return !p.sets[4];})(),
        'p.sets[4] is undefined, which is what used to reach the UI as "—"');
      ok('prev: the warm-up is never offered as the reference set',
        il.ghost(en,9).t!=='W');
      il.S.ex.delete(pex.id);delete il.S.prev[pex.id];
    }

    /* ---------- 14. v5.7: Android Back closes sheets ---------- */
    {
      document.querySelectorAll('.overlay').forEach(o=>o.remove());
      il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      const nOv=()=>document.querySelectorAll('.overlay').length;
      document.querySelector('#gearbtn').click();await sleep(140);
      ok('back: a sheet is open',nOv()===1,'overlays='+nOv());
      history.back();await sleep(420);
      ok('back: the system Back gesture closes the sheet, not the app',nOv()===0,'overlays='+nOv());
      document.querySelector('#gearbtn').click();await sleep(140);
      il.exerciseLibrarySheet();await sleep(160);
      ok('back: sheets stack',nOv()===2,'overlays='+nOv());
      history.back();await sleep(420);
      ok('back: Back closes only the topmost sheet',nOv()===1,'overlays='+nOv());
      history.back();await sleep(420);
      ok('back: and then the one beneath it',nOv()===0,'overlays='+nOv());
      document.querySelector('#gearbtn').click();await sleep(140);
      document.querySelector('.overlay .sheet-x').click();await sleep(460);
      ok('back: closing with ✕ leaves no stale history entry behind',
        nOv()===0&&((history.state&&history.state.ilSheet)||0)===0,
        'depth='+((history.state&&history.state.ilSheet)||0));
      /* NEGATIVE CONTROL for the popstate race: a pop arriving when nothing is
         open must not resurrect-and-close anything. The first design used a
         counter that could desync and closed the wrong sheet — which showed up
         as the plotter's animation loop being cancelled mid-test. */
      history.back();await sleep(300);
      ok('back: NEGATIVE CONTROL — a stray pop with nothing open closes nothing',
        nOv()===0&&il.SHEETS.length===0,'SHEETS='+il.SHEETS.length);
      document.querySelectorAll('.overlay').forEach(o=>o.remove());
      il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
    }

    /* ---------- 15. v5.7: light-theme contrast ---------- */
    {
      const lum=hex=>{
        const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
          .map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));
        return .2126*c[0]+.7152*c[1]+.0722*c[2];
      };
      const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      const tok=n=>getComputedStyle(document.body).getPropertyValue(n).trim();
      const wasLight=document.body.classList.contains('light');
      document.body.classList.add('light');
      const lightSem={};
      for(const n of ['--grn','--amb','--red','--ppl','--gold','--acc','--dim','--ph','--navfg'])
        lightSem[n]=tok(n);
      const card=tok('--card')||'#FFFFFF';
      const bad=Object.entries(lightSem).filter(([n,v])=>!/^#[0-9a-f]{6}$/i.test(v)||ratio(v,card)<4.5);
      ok('theme: every light-mode semantic colour clears 4.5:1 on a card',
        bad.length===0,bad.map(([n,v])=>n+' '+v+' = '+ratio(v,card).toFixed(2)+':1').join(', ')||'all pass');
      /* NEGATIVE CONTROL — the dark palette is deliberately untouched, and the
         v5.6 light theme inherited exactly these neon values, which is what
         made them illegible on paper. */
      document.body.classList.remove('light');
      const darkGrn=tok('--grn'),darkGold=tok('--gold');
      ok('theme: NEGATIVE CONTROL — the dark palette is unchanged and would fail on paper',
        darkGrn.toLowerCase()==='#2fd671'&&darkGold.toLowerCase()==='#ffcf4d'
        &&ratio(darkGrn,'#FFFFFF')<2.5&&ratio(darkGold,'#FFFFFF')<2.5,
        'dark --grn '+ratio(darkGrn,'#FFFFFF').toFixed(2)+':1 and --gold '
        +ratio(darkGold,'#FFFFFF').toFixed(2)+':1 on white — correct for black, wrong for paper');
      ok('theme: dark semantic colours stay legible on their own background',
        ratio(tok('--grn'),tok('--card')||'#151518')>=4.5);
      if(wasLight)document.body.classList.add('light');
    }
    ok('theme: System follows prefers-color-scheme without changing saved choices',
      (()=>{
        const was=il.S.set.theme;
        il.S.set.theme='dark';const a=il.themeIsLight();
        il.S.set.theme='light';const b=il.themeIsLight();
        il.S.set.theme='auto';const c=il.themeIsLight();
        il.S.set.theme=was;
        return a===false&&b===true&&c===matchMedia('(prefers-color-scheme: light)').matches;
      })());

    /* ---------- 16. v5.7: Android input + a11y invariants ---------- */
    ok('android: the viewport tells Gboard to resize rather than cover the page',
      (document.querySelector('meta[name=viewport]').content||'').includes('interactive-widget=resizes-content'));
    ok('a11y: the tab bar announces itself as a tab bar',
      document.querySelector('nav[role=tablist]')
      &&$$('nav button[role=tab]').length===5
      &&$$('nav button[aria-selected=true]').length===1);
    ok('a11y: icon-only controls are labelled',
      !![...document.querySelectorAll('#gearbtn')].every(b=>b.getAttribute('aria-label')));
    ok('a11y: a keyboard focus ring is declared',(()=>{
      for(const sheet of document.styleSheets){
        let rules;try{rules=sheet.cssRules;}catch(e){continue;}
        for(const r of rules)if(r.selectorText&&r.selectorText.includes(':focus-visible'))return true;
      }
      return false;
    })());
    ok('android: manifest shortcuts actually resolve to something',
      JSON.stringify(il.launchIntent('?tab=history'))==='{"tab":"history"}'
      &&il.launchIntent('?start=empty').startEmpty===true
      &&JSON.stringify(il.launchIntent('?tab=../evil'))==='{}',
      'and an unknown tab is ignored rather than trusted');
    ok('android: bottom controls get gesture-strip clearance on an installed phone',(()=>{
      const was=document.body.classList.contains('aphone');
      document.body.classList.add('aphone');
      const sab=getComputedStyle(document.body).getPropertyValue('--sab');
      if(!was)document.body.classList.remove('aphone');
      return /max|14px/.test(sab);
    })(),'--sab floors on body.aphone');
    ok('shell: the status-bar band is painted opaque (iOS 27 blur fix)',(()=>{
      const b=getComputedStyle(document.querySelector('header'),'::before');
      return b&&b.content!=='none'&&!/rgba\(.*0(\.\d+)?\)$/.test(b.backgroundColor);
    })(),'header::before background = '+getComputedStyle(document.querySelector('header'),'::before').backgroundColor);

    /* ---------- 17. v5.7: backwards compatibility with a v5.6 backup ---------- */
    {
      const legacy={app:'ironlog',version:1,exportedAt:'2026-08-04T12:00:00.000Z',
        settings:{unit:'kg',restSec:120,barWeight:20,plates:[25,20,15,10,5,2.5,1.25],
          sound:true,vibrate:true,notify:false,theme:'dark',name:'Callum',strScale:1,
          coachOff:[],heightCm:181,sched:null},
        exercises:[{id:'x06',name:'Bench Press',m:'Chest',s:['Triceps','Shoulders'],e:'Barbell'}],
        workouts:[mkWorkout('x06',[[100,5,9]],Date.now()-3*DAY,'Legacy Upper A')],
        templates:[],body:[],photos:[],deadSeeds:[]};
      await il.applyImport(legacy);
      ok('compat: a v5.6 backup imports without the v5.7 fields',
        il.S.workouts.some(w=>w.name==='Legacy Upper A'),il.S.workouts.length+' workouts');
      ok('compat: settings it never knew about fill from defaults',
        il.S.set.shellFix==='auto'&&il.S.set.heightCm===181&&il.S.set.name==='Callum',
        'shellFix='+il.S.set.shellFix+' heightCm='+il.S.set.heightCm);
      ok('compat: the v5.7 theme values still accept the old two-way choice',
        il.S.set.theme==='dark'&&il.themeIsLight()===false);
      const rt=await il.buildExportData();
      ok('compat: and it round-trips back out cleanly',
        rt.workouts.some(w=>w.name==='Legacy Upper A')&&rt.settings.heightCm===181);
    }

    /* ---------- 18. restore is all-or-nothing ----------
       A restore used to wipe each store and then write records one
       transaction at a time, so a single record the database refused left the
       device half-wiped (3 workouts became 1, the library 69 exercises became
       1). It is now one transaction: all of it lands, or none of it does. */
    {
      const counts=async()=>{const o={};
        for(const s of['exercises','workouts','templates','body'])o[s]=(await il.allOf(s)).length;return o;};
      const base={app:'ironlog',version:1,exportedAt:new Date().toISOString(),
        settings:{unit:'kg',name:'Restore Test'},
        exercises:[{id:'x06',name:'Bench Press',m:'Chest',s:['Triceps'],e:'Barbell'}],
        workouts:[mkWorkout('x06',[[100,5]],now-2*DAY,'Kept A'),mkWorkout('x06',[[102.5,5]],now-DAY,'Kept B')],
        templates:[{id:'t_keep',name:'Kept template',pos:0,exs:[{exId:'x06',sets:3,reps:5}]}],
        body:[{id:'b_keep',date:now,key:'Weight',value:82}],photos:[],deadSeeds:[]};
      await il.applyImport(JSON.parse(JSON.stringify(base)));
      const before=await counts();
      // a record the database cannot store: structured clone refuses functions
      const poison={...mkWorkout('x06',[[90,5]],now,'Poison'),junk:()=>0};
      ok('restore: NEGATIVE CONTROL — the poisoned record really is unstorable',(()=>{
        try{structuredClone(poison);return false;}catch(e){return e.name==='DataCloneError';}
      })());
      const bad={...JSON.parse(JSON.stringify(base)),settings:{unit:'lb',name:'Should not stick'},
        workouts:[mkWorkout('x06',[[60,5]],now,'From backup'),poison]};
      let err=null;
      try{await il.applyImport(bad);}catch(e){err=e;}
      ok('restore: a backup the database refuses is rejected as a whole',
        !!err&&/nothing was changed/.test(err.message),err?err.message:'no error thrown');
      const after=await counts();
      ok('restore: …leaving every store exactly as it was before the attempt',
        JSON.stringify(after)===JSON.stringify(before),JSON.stringify(before)+' → '+JSON.stringify(after));
      ok('restore: …and the data on screen untouched',
        il.S.workouts.some(w=>w.name==='Kept A')&&!il.S.workouts.some(w=>w.name==='From backup')
        &&il.S.set.name==='Restore Test');
      ok('restore: settings inside the refused backup were not applied',
        ((await il.kvGet('settings'))||{}).unit==='kg');
      // a record that could never be stored is skipped and counted, not fatal
      const partial=JSON.parse(JSON.stringify(base));
      partial.workouts.push({...mkWorkout('x06',[[70,5]],now,'Bad key'),id:true});
      const res=await il.applyImport(partial);
      ok('restore: an unstorable record is skipped and reported, the rest restored',
        res&&res.skipped===1&&il.S.workouts.length===2,
        'skipped='+(res&&res.skipped)+' workouts='+il.S.workouts.length);
    }

    /* ---------- 19. PREV matches set kind, not array index ----------
       Rows used to read last session's set at the same array index, so any
       difference in warm-ups misaligned every row — and ticking an untouched
       row auto-fills from PREV, so the wrong numbers were LOGGED. */
    {
      const pex={id:'t_prev2',name:'T Prev2',m:'Chest',s:[],e:'Barbell'};
      il.S.ex.set(pex.id,pex);
      const W=(w,r)=>({t:'W',w,r,rpe:null,dur:null,dist:null}),N=(w,r)=>({t:'N',w,r,rpe:8,dur:null,dist:null});
      // last session had two warm-ups; a template start builds working rows only
      il.S.prev[pex.id]={sets:[W(40,10),W(60,5),N(100,5),N(100,5),N(102.5,4)]};
      const tplRows={exId:pex.id,sets:[{t:'N'},{t:'N'},{t:'N'}]};
      const g=[0,1,2].map(j=>il.ghost(tplRows,j));
      ok('prev: after a warm-up session, working set 1 reads working set 1',
        g[0]&&g[0].t==='N'&&g[0].w===100&&g[0].r===5&&g[0].src==='prev',JSON.stringify(g[0]));
      ok('prev: every working row lines up with its working counterpart',
        g[1].w===100&&g[2].w===102.5&&g[2].r===4,g.map(x=>x&&x.w+'×'+x.r).join(', '));
      ok('prev: NEGATIVE CONTROL — raw index 0 of that session is a warm-up',
        il.S.prev[pex.id].sets[0].t==='W','which index matching offered (and auto-filled) for set 1');
      // the warm-up calculator inserts rows above a session that had none
      il.S.prev[pex.id]={sets:[N(100,5),N(100,5),N(102.5,4)]};
      const calcRows={exId:pex.id,sets:[{t:'W'},{t:'W'},{t:'W'},{t:'N'},{t:'N'},{t:'N'}]};
      const gc=calcRows.sets.map((_,j)=>il.ghost(calcRows,j));
      ok('prev: added warm-ups do not shift the working sets',
        gc[3].w===100&&gc[4].w===100&&gc[5].w===102.5&&gc.slice(3).every(x=>x.src==='prev'),
        gc.slice(3).map(x=>x&&x.w+'×'+x.r).join(', '));
      ok('prev: a warm-up never borrows a working set’s numbers',gc.slice(0,3).every(x=>x===null));
      il.S.prev[pex.id]={sets:[W(40,10),W(60,5),N(100,5)]};
      const wRows={exId:pex.id,sets:[{t:'W'},{t:'W'},{t:'W'},{t:'N'}]};
      ok('prev: warm-up 2 reads warm-up 2, and an extra warm-up has no stand-in',
        il.ghost(wRows,1).w===60&&il.ghost(wRows,2)===null&&il.ghost(wRows,3).w===100);
      il.S.prev[pex.id]=null;
      const tgtRows={exId:pex.id,sets:[{t:'W'},{t:'N'}],tgt:{w:80,r:8,rpe:null}};
      ok('prev: a template target fills working rows only',
        il.ghost(tgtRows,0)===null&&il.ghost(tgtRows,1).src==='tgt'&&il.ghost(tgtRows,1).w===80);
      il.S.prev[pex.id]={sets:[W(40,10),W(60,5),N(100,5)]};il.S.records[pex.id]=null;
      ok('prev: the warm-up calculator ramps towards a WORKING weight',
        il.bestWeightGuess({exId:pex.id,sets:[{t:'W'},{t:'W'},{t:'N'}]})===100,
        'guessed '+il.bestWeightGuess({exId:pex.id,sets:[{t:'W'},{t:'W'},{t:'N'}]})+' (row 0 is a 40 kg warm-up)');
      il.S.ex.delete(pex.id);delete il.S.prev[pex.id];delete il.S.records[pex.id];
      // end to end, through the real UI: start the template, tick set 1 untouched
      il.S.workouts=[{id:uid(),name:'Push',notes:'',startedAt:now-3*DAY-3600e3,finishedAt:now-3*DAY,dur:3600,
        exs:[{exId:'x06',notes:'',sets:[W(40,10),W(60,5),N(100,5),N(100,5),N(100,5)]}]}];
      il.S.templates=[{id:'t_e2e',name:'E2E Push',pos:0,exs:[{exId:'x06',sets:3,reps:5,w:100,rpe:null}]}];
      il.S.active=null;
      il.switchTab('templates');await sleep(60);
      [...[...document.querySelectorAll('#page-templates .card')].find(c=>/E2E Push/.test(c.textContent))
        .querySelectorAll('button')].find(b=>/^\s*Start\s*$/.test(b.textContent)).click();
      await sleep(250);
      document.querySelector('#exc0 .setrow .chk').click();await sleep(60);
      const s0=il.S.active.exs[0].sets[0];
      ok('prev: ticking an untouched set logs last session’s WORKING numbers',
        s0.done&&s0.w===100&&s0.r===5,'logged '+s0.w+'×'+s0.r+' (index matching logged the 40×10 warm-up)');
      il.S.active=null;il.S.templates=[];
      document.querySelector('#rt-skip').click();
    }

    /* ---------- 20. live PR flags follow the whole session ----------
       Re-checking a set used to rebuild records from finished history ONLY,
       forgetting a heavier set logged minutes earlier in the same session. */
    {
      document.querySelectorAll('#toasts .toast').forEach(t=>t.remove());
      const px={id:'t_pr2',name:'T PR Two',m:'Back',s:[],e:'Barbell'};
      il.S.ex.set(px.id,px);
      il.S.workouts=[mkWorkout(px.id,[[100,5]],now-3*DAY)];              // all-time best: 100×5
      const done=(w,r)=>({t:'N',w,r,rpe:8,dur:null,dist:null,done:true});
      il.S.active={id:uid(),name:'PR flow',startedAt:now,notes:'',exs:[{exId:px.id,notes:'',sets:[done(105,5),done(103,5)]}]};
      il.S.prev={};il.S.records={};
      il.switchTab('log');await sleep(60);
      const e0=il.S.active.exs[0],[a,b]=e0.sets;
      const [rowA,rowB]=document.querySelectorAll('#exc0 .setrow');
      il.recheckPRs(px.id);
      ok('PR: the heavier set is the record, the lighter one after it is not',a.pr===1&&!b.pr);
      il.reverifySet(e0,b,rowB);           // e.g. fixing a typo in its reps
      await sleep(1100);
      ok('PR: retyping a lighter set after a heavier one stays quiet',
        !b.pr&&!rowB.classList.contains('prset')&&!document.querySelector('#toasts .toast.pr'),
        [...document.querySelectorAll('#toasts .toast.pr')].map(t=>t.textContent).join(' | '));
      ok('PR: NEGATIVE CONTROL — against finished history alone, 103 beats 100',
        103>il.computeRecords(px.id).w.v,'which is how that edit used to fire “weight PR 103 kg”');
      rowA.querySelector('.chk').click();await sleep(60);                 // untick the record
      ok('PR: an unticked record loses its gold ring',!a.pr&&!rowA.classList.contains('prset'));
      ok('PR: …and the set it was overshadowing becomes the record',b.pr===1&&rowB.classList.contains('prset'));
      a.w=95;rowA.querySelector('.chk').click();await sleep(60);         // re-tick it below your best
      ok('PR: a set re-ticked below your best is not saved as a PR',a.done&&!a.pr,'pr='+a.pr);
      rowB.querySelector('.set-type').click();await sleep(350);           // delete the 103
      [...document.querySelectorAll('.overlay .menu-row.danger')].find(x=>/Delete set/.test(x.textContent)).click();
      await sleep(300);
      ok('PR: deleting a set forgets its numbers',il.S.records[px.id].w.v===100&&!a.pr,
        'best now '+il.S.records[px.id].w.v);
      e0.sets.push(done(101,5));il.recheckPRs(px.id);
      ok('PR: …so it no longer blocks the next genuine record',e0.sets[1].pr===1);
      il.S.active=null;il.S.ex.delete(px.id);
      document.querySelector('#rt-skip').click();
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      document.querySelectorAll('#toasts .toast').forEach(t=>t.remove());
    }

    /* ---------- 21. a double tap does one thing ---------- */
    {
      il.S.workouts=[];il.S.templates=[];
      il.S.active={id:uid(),name:'Double tap',startedAt:now-1800e3,notes:'',
        exs:[{exId:'x06',notes:'',sets:[{t:'N',w:80,r:8,rpe:8,dur:null,dist:null,done:true}]}]};
      il.S.prev={};il.S.records={};
      il.switchTab('log');await sleep(60);
      document.querySelector('#page-log .btn.green').click();await sleep(350);          // Finish
      const saveBtn=[...document.querySelectorAll('.overlay .btn.green')].find(x=>/Save Workout/.test(x.textContent));
      saveBtn.click();saveBtn.click();
      await sleep(700);
      ok('double tap: Save Workout saves the session once',
        il.S.workouts.length===1&&(await il.allOf('workouts')).filter(w=>w.name==='Double tap').length===1,
        il.S.workouts.length+' in memory');
      const offers=[...document.querySelectorAll('.overlay h2')].filter(x=>/Save as template/.test(x.textContent));
      ok('double tap: …and offers to make a template once',offers.length===1,offers.length+' prompts');
      const tplBtn=[...document.querySelectorAll('.overlay .btn.primary')].find(x=>/Save as Template/.test(x.textContent));
      tplBtn.click();tplBtn.click();await sleep(450);
      ok('double tap: Save as Template creates one template',il.S.templates.length===1,il.S.templates.length+' templates');
      // a real finger is hit-tested, so replay the second tap at the same spot
      // while the menu sheet is fading out
      il.switchTab('templates');await sleep(60);
      document.querySelector('#page-templates .card .icon-btn').click();await sleep(450);
      const dup=[...document.querySelectorAll('.overlay .menu-row')].find(x=>/Duplicate/.test(x.textContent));
      const rc=dup.getBoundingClientRect(),cx=rc.left+rc.width/2,cy=rc.top+rc.height/2;
      const tap=()=>{const el=document.elementFromPoint(cx,cy);if(el)el.click();return el;};
      tap();const second=tap();
      await sleep(450);
      ok('double tap: a closing sheet swallows the second tap (one duplicate, not two)',
        il.S.templates.length===2,il.S.templates.length+' templates; 2nd tap hit '+(second?second.className||second.tagName:'nothing'));
      il.S.templates=[];il.S.workouts=[];
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
    }

    /* ---------- 22. "today" means your today ----------
       Picks a moment when the UTC date and the local date differ, if this
       time zone has one: 00:30 local east of Greenwich, 23:30 local west. */
    {
      const off=-new Date(2026,5,15,12).getTimezoneOffset();   // minutes east of UTC
      const probe=new Date(2026,5,15,off>0?0:off<0?23:12,30).getTime();
      const realNow=Date.now;
      Date.now=()=>probe;
      try{
        document.querySelectorAll('.overlay').forEach(o=>o.remove());
        il.switchTab('body');await sleep(60);
        [...document.querySelectorAll('#page-body .btn.primary')].find(x=>/Log/.test(x.textContent)).click();
        await sleep(300);
        const dateIn=document.querySelector('.overlay input[type=date]');
        ok('dates: the bodyweight form defaults to today in your time zone',dateIn.value==='2026-06-15',
          'offered '+dateIn.value+(off?'':' (this runner is on UTC: nothing to tell apart)'));
        ok('dates: NEGATIVE CONTROL — at that moment the UTC date is a different day',
          off===0||new Date(probe).toISOString().slice(0,10)!=='2026-06-15',
          'UTC says '+new Date(probe).toISOString().slice(0,10)+', which the form used to offer');
        ok('dates: backup files are named for your day too',
          il.backupFileName()==='ironlog-backup-2026-06-15.json',il.backupFileName());
        const n0=il.S.body.length;
        document.querySelector('.overlay input.num').value='80.4';
        const saveB=[...document.querySelectorAll('.overlay .btn.primary')].find(x=>/Save/.test(x.textContent));
        saveB.click();saveB.click();
        await sleep(300);
        ok('double tap: logging bodyweight records one entry',il.S.body.length===n0+1,(il.S.body.length-n0)+' entries');
        const last=il.S.body[il.S.body.length-1];
        ok('dates: …on the local day it was logged',!!last&&il.dateKey(last.date)==='2026-06-15');
      }finally{Date.now=realNow;}
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
    }

    /* ---------- 23. hiding the app lands the pending autosave ----------
       A phone that is locked or switched away freezes timers and may reclaim
       the page, so a debounced write still pending then was simply lost. */
    {
      il.S.active={id:uid(),name:'Flush test',startedAt:now,notes:'',
        exs:[{exId:'x06',notes:'',sets:[{t:'N',w:null,r:null,rpe:null,dur:null,dist:null,done:false}]}]};
      await il.flushActive();                                   // storage matches the screen
      const st=il.S.active.exs[0].sets[0];
      st.w=100;st.r=5;st.done=true;
      il.saveActive();                                          // what ticking a set does
      const landed=async()=>{const a=await il.kvGet('active');const s=a&&a.exs[0].sets[0];return !!(s&&s.done&&s.w===100);};
      ok('autosave: NEGATIVE CONTROL — right after a tick the write is still pending',!(await landed()),
        'the window a phone lock could freeze');
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
      try{document.dispatchEvent(new Event('visibilitychange'));}
      finally{delete document.visibilityState;}
      ok('autosave: hiding the app writes it immediately',await landed());
      il.S.active=null;await il.flushActive();
    }

    /* ---------- 24. service worker: slow networks and bad replies ----------
       sw.js runs here against stand-in caches, fetch and timers, so its fetch
       strategy is tested without touching the real network. */
    {
      const src=await (await fetch('sw.js',{cache:'no-store'})).text();
      const mkSW=code=>{
        const H={},store=new Map(),timers=[];let net=()=>new Promise(()=>{});
        const key=r=>typeof r==='string'?new URL(r,location.href).href:r.url;
        const cachesMock={open:async()=>({put:async(r,res)=>{store.set(key(r),res);},addAll:async()=>{}}),
          match:async r=>{const m=store.get(key(r));return m&&m.clone?m.clone():m;},keys:async()=>[],delete:async()=>true};
        const selfMock={addEventListener:(t,f)=>{H[t]=f;},skipWaiting:()=>{},
          clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async()=>{}}};
        new Function('self','caches','fetch','setTimeout','clearTimeout',code)(selfMock,cachesMock,r=>net(r),
          (fn,ms)=>timers.push({fn,ms,live:true})-1,id=>{if(timers[id])timers[id].live=false;});
        return {timers,setNet:f=>{net=f;},
          put:(u,body)=>store.set(key(u),new Response(body,{status:200})),
          get:u=>store.get(key(u)),
          go(u,mode){
            let resp=null;const waits=[];
            H.fetch({request:{url:key(u),method:'GET',mode:mode||'no-cors'},respondWith:p=>{resp=p;},waitUntil:p=>{waits.push(p);}});
            return {resp,settled:Promise.all(waits)};
          },
          tick(){for(const t of timers)if(t.live){t.live=false;t.fn();}}};
      };
      const pending=async p=>{let s=false;p.then(()=>{s=true;},()=>{s=true;});await sleep(30);return !s;};
      // every await is bounded: a handler that never answers must FAIL here,
      // not hang the whole suite (which is exactly what the old one did)
      const within=p=>Promise.race([p,sleep(400).then(()=>null)]);
      const text=async r=>r&&r.text?await r.text():null;
      // the v5.7 handler, verbatim, for the negative controls
      const OLD="self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith("
        +"fetch(e.request).then(r=>{const cp=r.clone();caches.open('c').then(c=>c.put(e.request,cp)).catch(()=>{});return r;})"
        +".catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html')||Response.error())));});";

      // one bar of signal: the network hangs
      let sw=mkSW(src);
      sw.put('./','app v1');sw.put('./index.html','app v1');
      let release;sw.setNet(()=>new Promise(r=>{release=r;}));
      let f=sw.go('./','navigate');
      ok('sw: a slow network still gets its chance first',await pending(f.resp));
      ok('sw: …but only for a few seconds',sw.timers.length===1&&sw.timers[0].ms>0&&sw.timers[0].ms<=5000,
        (sw.timers[0]||{}).ms+' ms');
      sw.tick();
      ok('sw: then the cached app is served instead of hanging',(await text(await within(f.resp)))==='app v1');
      if(release)release(new Response('app v2',{status:200}));await within(f.settled);
      ok('sw: …and the late reply still refreshes the cache for next time',(await text(sw.get('./')))==='app v2');
      let old=mkSW(OLD);old.put('./','app v1');
      const of=old.go('./','navigate');old.tick();
      ok('sw: NEGATIVE CONTROL — the old handler hung for as long as the network did',await pending(of.resp));

      // a working network always wins, and is cached
      sw=mkSW(src);sw.put('./','app v1');
      sw.setNet(async()=>new Response('app v3',{status:200}));
      f=sw.go('./','navigate');
      ok('sw: a live network is preferred over the cache',(await text(await within(f.resp)))==='app v3');
      await within(f.settled);
      ok('sw: …and its reply cached',(await text(sw.get('./')))==='app v3');

      // error replies never overwrite a working copy
      sw=mkSW(src);sw.put('./icon-192.png','good icon');sw.put('./','app v1');
      sw.setNet(async()=>new Response('oops',{status:500}));
      f=sw.go('./icon-192.png');await within(f.resp);await within(f.settled);
      ok('sw: a 500 is not cached over a good copy',(await text(sw.get('./icon-192.png')))==='good icon');
      f=sw.go('./','navigate');
      ok('sw: a page load the server fails gets the cached app',(await text(await within(f.resp)))==='app v1');

      // offline
      sw=mkSW(src);sw.put('./index.html','<html>app</html>');
      sw.setNet(async()=>{throw new TypeError('offline');});
      const r4=await within(sw.go('./missing.js').resp);
      ok('sw: offline, an uncached script gets a network error — not the app’s HTML',r4&&r4.type==='error',r4?r4.type:'none');
      old=mkSW(OLD);old.put('./index.html','<html>app</html>');old.setNet(async()=>{throw new TypeError('offline');});
      ok('sw: NEGATIVE CONTROL — the old handler answered it with index.html',
        (await text(await within(old.go('./missing.js').resp)))==='<html>app</html>');
      ok('sw: offline, a page load still gets the cached app',
        (await text(await within(sw.go('./','navigate').resp)))==='<html>app</html>');

      // the Chart.js CDN reply is opaque (cross-origin, no CORS) but still cacheable
      sw=mkSW(src);
      const opaque={ok:false,status:0,type:'opaque',clone(){return this;}};
      const cdn='https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      sw.setNet(async()=>opaque);
      f=sw.go(cdn);await within(f.resp);await within(f.settled);
      ok('sw: the opaque CDN script is still cached for offline use',sw.get(cdn)===opaque);
    }

    /* ---------- 25. Technogym presets for the movement plotter ---------- */
    {
      const tg=il.TG;
      ok('technogym: presets span Selection, Pure Strength and cable stations',
        tg.length>=25&&['sel','pure','cable'].every(l=>tg.some(p=>p.line===l)),tg.length+' presets');
      const pushdown=il.S.ex.get('x32');
      const off=tg.filter(p=>{
        const c=il.plotCalc(il.tgPlot(p,pushdown));
        return p.ratio!=null?Math.abs(c.ratio-p.ratio)>.005:!(c.ratio>.4&&c.ratio<=1.0001);
      });
      ok('technogym: every preset plots to exactly the leverage it states',!off.length,off.map(p=>p.id).join(', ')||'all match');
      const r=id=>il.plotCalc(il.tgPlot(tg.find(p=>p.id===id),pushdown)).ratio;
      ok('technogym: a 45° sled falls out at sin 45°, a vertical press at 1:1',near(r('pure-linear'),Math.SQRT1_2,.01)&&near(r('pure-vertical'),1,.001));
      ok('technogym: a direct cable is 1:1, a crossover 2:1',near(r('sel-lat'),1,.001)&&near(r('cable-cross'),.5,.001));
      const cmU=il.S.set.heightCm||175;
      const roms=tg.map(p=>il.plotCalc(il.tgPlot(p,pushdown)).romCm*175/cmU);
      ok('technogym: every working path is a realistic 30–60 cm for a 175 cm lifter',roms.every(v=>v>=30&&v<=60),
        Math.round(Math.min(...roms))+'–'+Math.round(Math.max(...roms))+' cm');
      const sug=id=>(il.tgSuggest(il.S.ex.get(id))[0]||{}).id;
      ok('technogym: suggests the right machine for the stock exercises',
        sug('x48')==='sel-chest'&&sug('x17')==='sel-lat'&&sug('x39')==='sel-legext'&&sug('x47')==='sel-pec'
        &&sug('x32')==='cable-dap'&&sug('x46')==='cable-cross'&&sug('x36')==='pure-hack',
        ['x48','x17','x39','x47','x32','x46','x36'].map(sug).join(' '));
      ok('technogym: never offers a preset for free weights or cardio',
        !il.tgSuggest(il.S.ex.get('x06')).length&&!il.tgSuggest(il.S.ex.get('c01')).length);
      ok('technogym: finds machines you created by their name',
        (il.tgSuggest({id:'u_tg',name:'TG Leg Extension',m:'Quads',s:[],e:'Machine'})[0]||{}).id==='sel-legext');
      // through the real plotter: Apply the suggestion, then Save
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      const mx={id:'t_tgm',name:'Chest Press Machine',m:'Chest',s:['Triceps'],e:'Machine'};
      il.S.ex.set(mx.id,mx);await il.dbPut('exercises',mx);
      il.movementSheet(mx,()=>{});await sleep(300);
      [...document.querySelectorAll('.overlay .tg-bar button')].find(b=>/Apply/.test(b.textContent)).click();await sleep(120);
      [...document.querySelectorAll('.overlay .btn.primary')].find(b=>/Save calibration/.test(b.textContent)).click();await sleep(300);
      ok('technogym: Apply + Save stores the preset’s leverage',
        mx.mech&&near(mx.mech.ratio,.7,.001)&&mx.mech.preset==='sel-chest'&&Math.abs(mx.mech.romCm-40*cmU/175)<=1.5,
        mx.mech?'×'+mx.mech.ratio+' '+mx.mech.romCm+' cm '+mx.mech.preset:'not saved');
      ok('technogym: the calibration keeps 5.7’s shape — new fields are purely additive',
        mx.mech&&['kind','pos','fx','ratio','romCm','at','hx0','hy0','hx1','hy1','wx0','wy0','wx1','wy1'].every(k=>typeof mx.mech[k]==='number'||typeof mx.mech[k]==='string'));
      // "Measure it": 50 cm of travel, 30 cm of stack rise → ×0.60 exactly
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      il.movementSheet(mx,()=>{});await sleep(300);
      const ms=document.querySelector('.overlay .tg-measure');ms.open=true;
      const [mH,mR]=ms.querySelectorAll('input');mH.value='50';mR.value='30';
      [...ms.querySelectorAll('button')].find(b=>/Use these/.test(b.textContent)).click();await sleep(60);
      [...document.querySelectorAll('.overlay .btn.primary')].find(b=>/Save calibration/.test(b.textContent)).click();await sleep(300);
      ok('technogym: “Measure it” makes the leverage exactly rise ÷ travel',
        near(mx.mech.ratio,.6,.002)&&Math.abs(mx.mech.romCm-50)<=1,'×'+mx.mech.ratio+' over '+mx.mech.romCm+' cm');
      // bulk: calibrate every matched machine, leave the rest alone
      for(const id of['x39','x40','x47','x44'])delete il.S.ex.get(id).mech;
      // …including one you have already calibrated by hand, which it must not touch
      const x48=il.S.ex.get('x48'),x48was=x48.mech;
      const own={kind:'lever',pos:'seated',fx:30,ratio:.55,romCm:41,at:now-DAY,hx0:34,hy0:58,hx1:48,hy1:56,wx0:82,wy0:84,wx1:82,wy1:76};
      x48.mech={...own};
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      il.tgBulkSheet();await sleep(300);
      const goB=[...document.querySelectorAll('.overlay .btn.primary')].find(b=>/Calibrate \d+ machine/.test(b.textContent));
      ok('technogym: bulk calibration pre-selects every machine with a match',!!goB,goB?goB.textContent:'no button');
      if(goB)goB.click();
      await sleep(500);
      ok('technogym: …and calibrates them with their presets',
        ['x39','x40','x47'].every(id=>il.S.ex.get(id).mech&&il.S.ex.get(id).mech.preset),
        ['x39','x40','x47'].map(id=>(il.S.ex.get(id).mech||{}).preset).join(' '));
      ok('technogym: a machine with no matching preset is left for you to plot',!il.S.ex.get('x44').mech,'Standing Calf Raise');
      ok('technogym: …and one you calibrated yourself is never overwritten',
        JSON.stringify(x48.mech)===JSON.stringify(own),'Chest Press ×'+(x48.mech||{}).ratio);
      if(x48was)x48.mech=x48was;else delete x48.mech;
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      il.S.ex.delete(mx.id);
    }

    /* ---------- 26. editing a finished workout ---------- */
    {
      const ex26={id:'t_ed',name:'T Edit Lift',m:'Chest',s:[],e:'Barbell'};
      il.S.ex.set(ex26.id,ex26);await il.dbPut('exercises',ex26);
      const w1=mkWorkout(ex26.id,[[100,5]],now-20*DAY,'E1'),w2=mkWorkout(ex26.id,[[1000,5]],now-10*DAY,'E2 typo'),
            w3=mkWorkout(ex26.id,[[105,5]],now-3*DAY,'E3');
      w1.exs[0].sets[0].pr=1;w2.exs[0].sets[0].pr=1;     // as live logging left them: club 100, then the typo
      // an old trophy today's rules would not award (a first session, under any
      // milestone): editing a LATER workout must leave it exactly as logged
      const w0=mkWorkout(ex26.id,[[55,5]],now-30*DAY,'E0');w0.exs[0].sets[0].pr=1;
      il.S.workouts=[w0,w1,w2,w3];
      for(const w of il.S.workouts)await il.dbPut('workouts',w);
      ok('edit: NEGATIVE CONTROL — a typo blocks every real record after it',
        !w3.exs[0].sets[0].pr&&il.computeRecords(ex26.id).w.v===1000,'best on record: '+il.computeRecords(ex26.id).w.v);
      const fixed=JSON.parse(JSON.stringify(w2));fixed.exs[0].sets[0].w=100;
      await il.saveWorkoutEdit(w2,fixed);
      const W=id=>il.S.workouts.find(x=>x.id===id);
      ok('edit: the corrected set stops being a record',!W(w2.id).exs[0].sets[0].pr);
      ok('edit: the genuine record after it gets its trophy back',W(w3.id).exs[0].sets[0].pr===1);
      ok('edit: records follow the correction',il.computeRecords(ex26.id).w.v===105);
      ok('edit: earlier sessions are read, never rewritten',W(w1.id).exs[0].sets[0].pr===1&&W(w0.id).exs[0].sets[0].pr===1);
      ok('edit: the re-derived flags are saved, not just shown',
        ((await il.allOf('workouts')).find(x=>x.id===w3.id).exs[0].sets[0].pr)===1);
      // "forgot to press Finish": a 14 h session corrected to the real hour
      const long=mkWorkout(ex26.id,[[90,5]],now-DAY,'Forgot');
      long.startedAt=now-DAY-14*3600e3;long.dur=14*3600;
      il.S.workouts.push(long);await il.dbPut('workouts',long);
      const lf=JSON.parse(JSON.stringify(long));lf.dur=3600;lf.finishedAt=lf.startedAt+3600e3;
      await il.saveWorkoutEdit(long,lf);
      ok('edit: a forgotten Finish can be corrected to the real duration',
        W(long.id).dur===3600&&W(long.id).finishedAt===long.startedAt+3600e3);
      // and the real UI: History → workout → Edit → change reps → Save
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      il.workoutSheet(W(w3.id));await sleep(300);
      [...document.querySelectorAll('.overlay button')].find(b=>/Edit workout/.test(b.textContent)).click();await sleep(400);
      const repsIn=topSheet().querySelectorAll('.edrow:not(.sethead) input')[1];
      repsIn.value='8';repsIn.dispatchEvent(new Event('input',{bubbles:true}));
      [...topSheet().querySelectorAll('.btn.primary')].find(b=>/Save changes/.test(b.textContent)).click();
      await sleep(500);
      ok('edit: the Edit sheet saves what you type',W(w3.id).exs[0].sets[0].r===8,'reps '+W(w3.id).exs[0].sets[0].r);
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      il.S.ex.delete(ex26.id);il.S.workouts=[];
    }

    /* ---------- 27. v5.8 redesign: the contracts behind the looks ---------- */
    {
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      // light-theme switches: 5.7's `body.light .tgl` out-ranked `.tgl.on`
      const wasLight=document.body.classList.contains('light');
      document.body.classList.add('light');
      const on=document.createElement('button');on.className='tgl on';document.body.append(on);
      const offT=document.createElement('button');offT.className='tgl';document.body.append(offT);
      const bgOn=getComputedStyle(on).backgroundColor,bgOff=getComputedStyle(offT).backgroundColor;
      const grn=(()=>{const d=document.createElement('div');d.style.color=getComputedStyle(document.body).getPropertyValue('--grn');document.body.append(d);const c=getComputedStyle(d).color;d.remove();return c;})();
      ok('ui: an ON switch reads as on in the light theme (5.7 painted it grey)',bgOn===grn&&bgOn!==bgOff,bgOn+' vs off '+bgOff);
      on.remove();offT.remove();if(!wasLight)document.body.classList.remove('light');
      // the active workout
      il.S.workouts=[mkWorkout('x06',[[100,5]],now-2*DAY)];
      il.S.active={id:uid(),name:'UI test',startedAt:now-600e3,notes:'',exs:[
        {exId:'x06',notes:'',sets:[{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:false},{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:false}]}]};
      il.S.prev={};il.S.records={};
      il.switchTab('log');await sleep(80);
      const bar=document.querySelector('#page-log .wo-bar');
      ok('ui: the clock and Finish live in a sticky bar',!!bar&&getComputedStyle(bar).position==='sticky'
        &&!!bar.querySelector('#wo-dur')&&!!bar.querySelector('.btn.green'));
      ok('ui: the bar tallies done of total sets',document.querySelector('#wo-sets').textContent==='0'&&document.querySelector('#wo-total').textContent==='2');
      document.querySelector('#exc0 .setrow .chk').click();await sleep(60);
      ok('ui: ticking a set moves the exercise’s progress chip',document.querySelector('#exc0 .ex-prog').textContent==='1/2'
        &&document.querySelector('#wo-sets').textContent==='1');
      document.querySelectorAll('#exc0 .setrow .chk')[1].click();await sleep(60);
      ok('ui: …and marks it Done when every set is in',/Done/.test(document.querySelector('#exc0 .ex-prog').textContent));
      document.querySelector('#rt-skip').click();
      document.querySelector('#exc0 .icon-btn').click();await sleep(300);
      const groups=[...document.querySelectorAll('.overlay .menu-group')];
      const lastRow=groups.length?[...groups[groups.length-1].querySelectorAll('.menu-row')].pop():null;
      ok('ui: menus are grouped rows with the destructive action set apart, last',
        groups.length>=3&&!!lastRow&&lastRow.classList.contains('danger'),groups.length+' groups');
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      il.S.active=null;
      // Today: the scheduled template is the headline action
      il.S.templates=[{id:'t_today',name:'Push Day',pos:0,exs:[{exId:'x06',sets:3,reps:5}]}];
      const mid=new Date(now);mid.setHours(0,0,0,0);
      il.S.set.sched={on:1,mode:'cycle',anchor:mid.getTime(),remind:0,at:'17:30',lastNotif:'',
        days:[{label:'Push Day',tplId:'t_today'},{rest:1,label:'Rest'}]};
      il.S.workouts=[mkWorkout('x06',[[100,5]],now-2*DAY)];
      il.switchTab('log');await sleep(60);
      const hero=document.querySelector('#page-log .hero');
      ok('ui: Today leads with the scheduled session and starts it in one tap',
        !!hero&&/Start Push Day/.test(hero.textContent)&&!!hero.querySelector('.btn.primary'));
      il.S.set.sched.anchor=mid.getTime()-864e5;          // today is now the rest slot
      il.switchTab('log');await sleep(60);
      ok('ui: …and says so on a rest day',/Rest day/.test(document.querySelector('#page-log .hero .hero-t').textContent));
      il.S.set.sched=null;il.S.templates=[];
      // the week strip
      const d0=new Date(now);d0.setHours(12,0,0,0);
      const monday=d0.getTime()-((d0.getDay()+6)%7)*864e5;
      il.S.workouts=[mkWorkout('x06',[[100,5]],monday),mkWorkout('x06',[[100,5]],monday-864e5)];
      const wk=il.weekStats(now);
      ok('ui: the week strip counts this week only, Monday first',wk.n===1&&wk.days[0]===true,JSON.stringify(wk.days));
      // the picker opens on Recent, most recently trained first
      il.S.workouts=[mkWorkout('x06',[[100,5]],now-5*DAY),mkWorkout('x19',[[80,8]],now-DAY)];
      il.pickExercises({onDone:()=>{}});await sleep(300);
      const chipOn=document.querySelector('.overlay .pk-chips .chip.on');
      const first=document.querySelector('.overlay .ex-row .bold');
      ok('ui: the picker opens on Recent, most recently trained first',
        !!chipOn&&/Recent/.test(chipOn.textContent)&&/Barbell Row/.test(first.textContent),first?first.textContent:'');
      const srch=document.querySelector('.overlay input[type=search]');
      srch.value='leg ext';srch.dispatchEvent(new Event('input',{bubbles:true}));await sleep(60);
      ok('ui: typing searches the whole library, whatever the filter',
        [...document.querySelectorAll('.overlay .ex-row .bold')].some(b=>/Leg Extension/.test(b.textContent)));
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      // settings: grouped, repair switch folded away
      document.querySelector('#gearbtn').click();await sleep(300);
      const adv=document.querySelector('.overlay details.set-adv');
      ok('ui: settings are grouped, the display repair switch folded under Advanced',
        document.querySelectorAll('.overlay .set-grp').length>=5&&!!adv&&!adv.open&&/Fill the screen/.test(adv.textContent));
      // sheets: drag the grabber down to dismiss; a nudge springs back
      const sh=document.querySelector('.overlay .sheet'),gr=sh.querySelector('.grabber');
      const r0=gr.getBoundingClientRect(),y0=r0.top+2,x0=r0.left+r0.width/2;
      const pe=(t,y)=>gr.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x0,clientY:y,pointerId:7,isPrimary:true}));
      pe('pointerdown',y0);pe('pointermove',y0+30);await sleep(400);pe('pointerup',y0+30);await sleep(350);
      ok('ui: a small drag springs back',document.querySelectorAll('.overlay').length===1&&!sh.style.transform);
      pe('pointerdown',y0);pe('pointermove',y0+80);pe('pointermove',y0+180);pe('pointerup',y0+180);await sleep(400);
      ok('ui: dragging the grabber down dismisses the sheet',document.querySelectorAll('.overlay').length===0);
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      // one icon family: no emoji left in headings or menu rows
      il.S.workouts=[mkWorkout('x06',[[100,5]],now-DAY)];
      const emoji=/\p{Extended_Pictographic}/u,found=[];
      for(const t of['log','templates','history','progress','body']){
        il.switchTab(t);await sleep(40);
        for(const el of document.querySelectorAll('#page-'+t+' h3, #page-'+t+' .hero-eb'))if(emoji.test(el.textContent))found.push(el.textContent.trim());
      }
      ok('ui: headings use the icon set, not emoji',!found.length,found.join(' | '));
      // every icon-only button carries a name for screen readers
      const unnamed=[];
      for(const t of['log','templates','history','body']){
        il.switchTab(t);await sleep(40);
        for(const b of document.querySelectorAll('#page-'+t+' button,header button'))
          if(!b.textContent.trim()&&!b.getAttribute('aria-label'))unnamed.push(t+':'+b.className);
      }
      ok('a11y: every icon-only button is labelled',!unnamed.length,unnamed.slice(0,5).join(', '));
      il.S.workouts=[];
    }

    /* ---------- 28. iOS 27 home-screen app bugs ----------
       No iPhone in the loop, so each fix is pinned at the level a device can't
       fool: the decisions take the numbers devices report, and the DOM is
       checked for exactly what WebKit looks for. */
    {
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      // (1) the blur: WebKit extends the colour of a REAL fixed element with a
      // solid background touching the top edge; the root's own background, a
      // pseudo-element and a gradient are all invisible to it
      const sbar=document.getElementById('sbar'),hdr=document.querySelector('header');
      const hadSa=document.body.classList.contains('ios-sa');
      const alpha=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return 0;const p=m[1].split(',');return p.length>3?+p[3]:1;};
      const topEdge=()=>[...document.querySelectorAll('body *')].filter(el=>{
        const cs=getComputedStyle(el);if(cs.position!=='fixed'||cs.display==='none')return false;
        const r=el.getBoundingClientRect();
        return r.top<=0&&r.left<=0&&r.right>=document.documentElement.clientWidth&&r.height>=1&&alpha(cs.backgroundColor)===1;
      });
      document.body.classList.remove('ios-sa');
      ok('ios27: a Safari tab or Android never shows the status-bar sampler',!sbar||getComputedStyle(sbar).display==='none');
      /* NEGATIVE CONTROL: this is 5.7's top edge. Its opaque band was
         header::before, and the header itself is not fixed, so WebKit found no
         element at all and blurred the header instead. */
      ok('ios27: NEGATIVE CONTROL — without the sampler nothing solid touches the top edge',
        topEdge().length===0&&getComputedStyle(hdr).position!=='fixed'
          &&getComputedStyle(hdr,'::before').content!=='none',
        topEdge().map(e=>e.id||e.tagName).join(','));
      document.body.classList.add('ios-sa');
      const found=topEdge(),scs=sbar?getComputedStyle(sbar):null;
      ok('ios27: the installed iOS app gives WebKit exactly one solid element at the top edge',
        !!sbar&&found.length===1&&found[0]===sbar,found.map(e=>e.id||e.tagName).join(',')||'none');
      ok('ios27: …flat colour (a gradient is not a colour to extend), above the header, never in the way',
        !!scs&&scs.backgroundImage==='none'&&+scs.zIndex>+getComputedStyle(hdr).zIndex&&scs.pointerEvents==='none'
          &&sbar.getAttribute('aria-hidden')==='true',scs?scs.zIndex+' over '+getComputedStyle(hdr).zIndex:'no #sbar');
      // theme-color, the sampler and the header band are one colour, both themes
      const hex=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
      const wasTheme=il.S.set.theme,agree=[];
      for(const th of['dark','light']){
        il.S.set.theme=th;il.applyTheme();
        const meta=document.querySelector('meta[name="theme-color"]').getAttribute('content');
        const band=getComputedStyle(document.body).getPropertyValue('--bgtop').trim();
        const col=sbar?getComputedStyle(sbar).backgroundColor:'no #sbar';
        agree.push({th,meta,band,col,same:hex(meta)===col&&meta.toLowerCase()===band.toLowerCase()});
      }
      il.S.set.theme=wasTheme;il.applyTheme();
      ok('ios27: theme-color, the sampler and the header band agree in both themes',agree.every(a=>a.same),JSON.stringify(agree));
      if(!hadSa)document.body.classList.remove('ios-sa');

      // (2) the keyboard: the first raise can leave the window short for good
      const vs=il.viewportShrunk;
      // an iPhone 17 Pro, installed: 874pt tall, and the bug takes the 62pt status bar
      const KB={ios:true,standalone:true,focused:false,sinceFocus:2000,vvH:812,vvTop:0,curH:812,curW:402,base:874};
      ok('ios27: a window the keyboard left 62pt short is caught',vs(KB)===true);
      ok('ios27: …never while a field has focus (the keyboard may still be up)',vs({...KB,focused:true})===false);
      ok('ios27: …nor while it is still sliding away',vs({...KB,sinceFocus:60})===false);
      ok('ios27: …nor while the visual viewport is still inset',vs({...KB,vvH:480})===false);
      ok('ios27: …nor mid caret-pan',vs({...KB,vvTop:30})===false);
      ok('ios27: a full-height window, or rounding noise, is left alone',
        vs({...KB,vvH:874,curH:874})===false&&vs({...KB,vvH:872,curH:872})===false);
      ok('ios27: Safari tabs and Android are never touched',vs({...KB,standalone:false})===false&&vs({...KB,ios:false})===false);
      ok('ios27: no yardstick yet, no verdict',vs({...KB,base:0})===false);
      // healShrink: the yardstick, the cheap sentinel first, and the circuit breaker
      const SH=il.SHRINK,keepSH={...SH};
      Object.assign(SH,{base:0,w:0,tries:0,wins:0});
      const env=o=>({...KB,vvH:874,curH:874,...o});
      il.healShrink(env({focused:true,vvH:480,curH:480}),()=>480);
      ok('ios27: a keyboard-up window never becomes the yardstick',SH.base===0);
      il.healShrink(env({}),()=>874);
      ok('ios27: the yardstick is the tallest honest window',SH.base===874&&SH.tries===0);
      const bodyStyle=new MutationObserver(()=>{});
      bodyStyle.observe(document.body,{attributes:true,attributeFilter:['style']});
      const won=il.healShrink(env({vvH:812,curH:812}),()=>874);
      ok('ios27: a shrunk window is laid out again, by the empty sentinel alone when that is enough',
        won===true&&SH.tries===1&&SH.wins===1&&bodyStyle.takeRecords().length===0);
      const miss=il.healShrink(env({vvH:812,curH:812}),()=>812);
      ok('ios27: …and by the whole body when it is not',miss===false&&SH.tries===2&&bodyStyle.takeRecords().length>=2
        &&document.body.style.display==='');
      il.healShrink(env({vvH:812,curH:812}),()=>812);il.healShrink(env({vvH:812,curH:812}),()=>812);
      const t4=SH.tries;
      il.healShrink(env({vvH:812,curH:812}),()=>812);
      ok('ios27: three misses and it stops trying',t4===4&&SH.tries===4,'tries '+SH.tries+' wins '+SH.wins);
      bodyStyle.disconnect();
      Object.assign(SH,{base:874,w:402,tries:0,wins:0});
      il.healShrink(env({curW:874,vvH:402,curH:402}),()=>402);
      ok('ios27: a new width (rotation, iPad windows) starts a new yardstick',SH.base===402&&SH.w===874&&SH.tries===0);
      Object.assign(SH,keepSH);
      // laying the window out again must not cost the user their place
      const mainEl=document.querySelector('main'),pad=document.createElement('div');
      pad.style.height='4000px';mainEl.append(pad);
      mainEl.scrollTop=700;const at0=mainEl.scrollTop;
      il.remeasureViewport(true);
      // (Chromium happens to keep scroll offsets through a display flip anyway;
      // the explicit restore is for an engine that drops them.)
      ok('ios27: the relayout keeps the scroll position',at0>0&&mainEl.scrollTop===at0&&document.body.style.display==='',
        at0+' → '+mainEl.scrollTop);
      pad.remove();mainEl.scrollTop=0;

      // (3) resume: iOS 27 can bring an installed app back with no event at all
      il.S.active=null;il.S.set.sched=null;il.switchTab('log');await sleep(40);
      const n0=il.RESUME.n,stale=document.querySelector('#page-log').firstElementChild;
      const t0r=Date.now();il.RESUME.last=t0r;
      const tick=il.resumeCheck(t0r+1000);
      ok('ios27: the 1 s ticker is not a resume',tick===false&&il.RESUME.n===n0&&stale.isConnected);
      il.RESUME.last=t0r;
      const back=il.resumeCheck(t0r+10*60e3);
      ok('ios27: a jump in the wall clock is a resume, events or not',back===true&&il.RESUME.n===n0+1);
      ok('ios27: …and Today is redrawn for the new moment',!stale.isConnected&&!!document.querySelector('#page-log').firstElementChild);
      il.RESUME.last=Date.now();

      // (4) a frozen app gets no warning, so a ticked set can't wait on the debounce
      il.S.active={id:uid(),name:'Tick',startedAt:now-60e3,notes:'',exs:[{exId:'x06',notes:'',
        sets:[{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:false},{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:false}]}]};
      il.S.prev={};il.S.records={};il.S.workouts=[];
      await il.flushActive();
      il.switchTab('log');await sleep(60);
      document.querySelector('#exc0 .setrow .chk').click();
      await sleep(40);   // far inside the 250 ms autosave debounce
      const disk=await il.kvGet('active');
      ok('ios27: a ticked set is on disk at once',!!disk&&disk.exs[0].sets[0].done===true&&disk.exs[0].sets[1].done===false);
      document.querySelector('#rt-skip').click();
      il.S.active=null;await il.flushActive();
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
    }

    /* ---------- 29. 5.7 ⇄ 5.8: data degrades cleanly, both ways ----------
       Rolling back to 5.7, or bringing a 5.7 backup forward, must just work:
       no new database version, no new stores, no field that changes meaning.
       5.8 only ADDS optional fields, which 5.7 carries along untouched. (The
       browser-level proof, a real 5.7 profile opened by 5.8 and then by 5.7
       again, is described in the README.) */
    {
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      // 5.7 opens version 1 of these six stores: a bump would lock it out for good
      const db=await new Promise((res,rej)=>{const q=indexedDB.open('ironlog');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
      const stores=[...db.objectStoreNames].sort().join(',');const dbv=db.version;db.close();
      ok('compat57: same database version and stores, so 5.7 can still open it',
        dbv===1&&stores==='body,exercises,kv,photos,templates,workouts',dbv+' · '+stores);
      const ex58=await il.buildExportData();
      ok('compat57: a 5.8 backup is a file 5.7 accepts (app ironlog, format 1)',ex58.app==='ironlog'&&ex58.version===1);
      const man58=await (await fetch('manifest.webmanifest')).json();
      ok('compat57: the manifest id is unchanged, so 5.8 updates the installed app in place',man58.id==='/');
      // every preset writes a calibration 5.7's plotter can draw and weigh
      const K57=['lever','cable','sled','direct'],P57=['seated','standing','lying','incline'];
      const PK=['hx0','hy0','hx1','hy1','wx0','wy0','wx1','wy1'],MK=['kind','pos','fx','ratio','romCm','at',...PK];
      const badTg=[];
      for(const p of il.TG){
        const m=il.mechFromPlot(il.tgPlot(p,il.S.ex.get('x32')),{preset:p.id,track:p.track});
        const extra=Object.keys(m).filter(k=>!MK.includes(k)).sort().join(',');
        if(!K57.includes(m.kind)||!P57.includes(m.pos)||!(m.ratio>0)||extra!=='preset,track'
          ||!['fx','romCm','at',...PK].every(k=>typeof m[k]==='number'&&isFinite(m[k]))
          ||!PK.every(k=>m[k]>=0&&m[k]<=100))badTg.push(p.id);
      }
      ok('compat57: every Technogym preset writes a style, seat and shape 5.7 knows — plus two optional fields',
        !badTg.length,badTg.join(' ')||il.TG.length+' presets');
      // a 5.7 backup with everything 5.7 could write
      const mid57=new Date();mid57.setHours(0,0,0,0);
      const w57=mkWorkout('x06',[[100,5,8],[100,5,9]],now-2*DAY,'5.7 Upper');w57.startedAt=w57.finishedAt-3600e3;
      w57.exs[0].sets[0].pr=1;w57.exs[0].notes='5.7 note';
      const mech57={kind:'lever',pos:'seated',fx:30,ratio:.608,romCm:44,at:now-40*DAY,hx0:47,hy0:55,hx1:34,hy1:57,wx0:80,wy0:76,wx1:80,wy1:68};
      const v57={app:'ironlog',version:1,exportedAt:'2026-09-20T09:00:00.000Z',
        settings:{unit:'kg',restSec:150,barWeight:20,plates:[25,20,15,10,5,2.5,1.25],sound:true,vibrate:true,notify:false,
          theme:'auto',name:'Sam',strScale:1.05,coachOff:['c05'],heightCm:181,shellFix:'auto',
          sched:{on:1,mode:'cycle',anchor:mid57.getTime(),remind:0,at:'17:30',lastNotif:'',
            days:[{label:'Upper A',tplId:'tp57'},{rest:1,label:'Rest'}]}},
        exercises:[{id:'u57',name:'Hammer Strength Row',m:'Back',s:['Biceps'],e:'Machine',custom:true,
          pin:'Seat 5',restSec:120,edited:1,mech:{...mech57}}],
        workouts:[w57],templates:[{id:'tp57',name:'Upper A',pos:0,exs:[{exId:'x06',sets:3,reps:5,w:100,rpe:8}]}],
        body:[{id:'b57',date:now-DAY,key:'Weight',value:82.4}],photos:[],deadSeeds:['x53']};
      const res57=await il.applyImport(JSON.parse(JSON.stringify(v57)));
      const out57=await il.buildExportData();
      const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
      const setOk=Object.keys(v57.settings).every(k=>same(out57.settings[k],v57.settings[k]));
      ok('compat57: a 5.7 backup imports into 5.8 and exports back unchanged',
        (!res57||!res57.skipped)&&setOk&&same(out57.exercises.find(x=>x.id==='u57'),v57.exercises[0])
          &&same(out57.workouts,v57.workouts)&&same(out57.templates,v57.templates)&&same(out57.body,v57.body)
          &&same(out57.deadSeeds,v57.deadSeeds),out57.workouts.length+' workouts');
      const u57=il.S.ex.get('u57');
      ok('compat57: a 5.7 calibration is used as measured, never relabelled a preset',
        il.mechRatio(u57)===.608&&!u57.mech.preset&&!u57.mech.track);
      il.movementSheet(u57,()=>{});await sleep(250);
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      ok('compat57: just opening it in the 5.8 plotter writes nothing',
        same((await il.allOf('exercises')).find(x=>x.id==='u57').mech,mech57));
      // a 5.8 edit, through the real sheet, stores nothing 5.7 doesn't already read
      il.workoutSheet(il.S.workouts.find(w=>w.id===w57.id));await sleep(300);
      [...document.querySelectorAll('.overlay button')].find(b=>/Edit workout/.test(b.textContent)).click();await sleep(400);
      const eRows=topSheet().querySelectorAll('.edrow:not(.sethead)');
      const eReps=eRows[1].querySelectorAll('input')[1];
      eReps.value='6';eReps.dispatchEvent(new Event('input',{bubbles:true}));
      [...topSheet().querySelectorAll('.btn.primary')].find(b=>/Save changes/.test(b.textContent)).click();
      await sleep(500);
      document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;
      try{history.replaceState({ilSheet:0},'');}catch(e){}
      const st57=(await il.allOf('workouts')).find(w=>w.id===w57.id);
      const WK=['id','name','notes','startedAt','finishedAt','dur','exs','tplId'],SK=['t','w','r','rpe','dur','dist','done','pr'];
      ok('compat57: an edited workout keeps 5.7’s shape exactly',
        Object.keys(st57).every(k=>WK.includes(k))&&st57.exs.every(en=>Object.keys(en).every(k=>['exId','notes','sets','tgt'].includes(k))
          &&en.sets.every(s=>Object.keys(s).every(k=>SK.includes(k))))&&st57.exs[0].sets[1].r===6,
        Object.keys(st57).join(','));
      il.S.ex.delete('u57');
    }

    /* ---------- 31. the strength score reads strength, not endurance ---------- */
    {
      const shut=()=>{document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;};
      shut();
      // a 75 kg lifter, through the database so the bodyweight cache sees it
      await il.dbPut('body',{id:'b31',date:Date.now(),key:'Weight',value:75});
      await il.loadAll();
      const bench=il.S.ex.get('x06'),push=il.S.ex.get('x13'),pull=il.S.ex.get('x15'),plank=il.S.ex.get('x51');
      const sc=il.S.set.strScale||1;
      /* NEGATIVE CONTROL: 5.7 scored a push-up at full bodyweight and read all
         30 reps, which put 30 push-ups above a 100 kg × 5 bench */
      const old30=il.epley(75,30),oldBench=il.epley(100,5);
      ok('score: NEGATIVE CONTROL — 5.7’s formula rated 30 push-ups above a 100 kg bench',old30>oldBench,
        Math.round(old30/(75*1.25*sc)*100)+' vs '+Math.round(oldBench/(75*1.25*sc)*100));
      il.S.workouts=[mkWorkout('x06',[[100,5]],now-3*DAY,'Bench'),mkWorkout('x13',[[0,30]],now-2*DAY,'Push')];
      const sp=il.strengthProfile();
      ok('score: a 100 kg × 5 bench now outranks 30 push-ups',sp.best.Chest&&sp.best.Chest.name===bench.name,
        (sp.best.Chest||{}).name+' '+Math.round((sp.best.Chest||{}).v||0));
      il.S.workouts=[mkWorkout('x13',[[0,30]],now-2*DAY,'Push')];
      ok('score: a push-up counts about two-thirds of you, read at 12 reps at most',
        near(il.strengthProfile().best.Chest.v,il.epley(75*.65,12),1e-6),'est. '+il.strengthProfile().best.Chest.v.toFixed(1));
      il.S.workouts=[mkWorkout('x06',[[60,20]],now-2*DAY,'Burnout')];
      ok('score: any set past 12 reps is read as 12',near(il.strengthProfile().best.Chest.v,il.epley(60,12),1e-6));
      il.S.workouts=[mkWorkout('x15',[[0,8]],now-2*DAY,'Pull')];
      ok('score: a pull-up still lifts all of you',near(il.strengthProfile().best.Back.v,il.epley(75,8),1e-6));
      il.S.workouts=[mkWorkout('x51',[[0,60]],now-2*DAY,'Plank')];
      ok('score: a plank is a hold — no bodyweight "lift" in the score',!il.strengthProfile().per.Abs);
      ok('score: the share is matched by name, so your own variants count right',
        il.bwShare({name:'Deficit Push Ups',e:'Bodyweight'})===.65&&il.bwShare({name:'Knee push-up',e:'Bodyweight'})===.5
          &&il.bwShare({name:'Weighted Dip',e:'Bodyweight'})===1);
      il.S.workouts=[mkWorkout('x13',[[0,30]],now-2*DAY,'Push')];
      il.S.records={};
      ok('score: records keep the numbers as logged (it is the score’s business alone)',
        near(il.computeRecords('x13').e1rm.v,il.epley(75,30),1e-6));
      il.S.workouts=[];il.S.records={};
    }

    /* ---------- 32. kg ⇄ lb converts, all or nothing ---------- */
    {
      const shut=()=>{document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;};
      shut();
      const keepSet={...il.S.set},keepEx=il.S.ex.get('x06').baseW;
      il.S.set={...il.S.set,unit:'kg',barWeight:20,plates:[25,20,15,10,5,2.5,1.25]};
      await il.kvPut('settings',il.S.set);
      const wS=mkWorkout('x06',[[100,5],[102.5,5]],now-2*DAY,'Conv');wS.exs[0].sets[1].pr=1;
      delete wS.exs[0].sets[0].dist;delete wS.exs[0].sets[1].dist;
      const wC={id:uid(),name:'Conv run',finishedAt:now-DAY,dur:1800,notes:'',exs:[{exId:'c03',sets:[{t:'N',w:null,r:null,rpe:6,dur:30,dist:5,done:true},
        {t:'N',w:null,r:null,rpe:6,dur:5,dist:1.1,done:true}]}]};
      const tpl={id:'t32',name:'Conv T',pos:0,exs:[{exId:'x06',sets:3,reps:5,w:100,rpe:8},{exId:'c03',sets:1,dur:30,dist:5}]};
      const bwE={id:'b32',date:now-DAY,key:'Weight',value:80},waist={id:'b32w',date:now-DAY,key:'Waist',value:86};
      il.S.workouts=[wS,wC];il.S.templates=[tpl];il.S.body=[bwE,waist];
      il.S.ex.get('x06').baseW=15;
      for(const w of il.S.workouts)await il.dbPut('workouts',w);
      await il.dbPut('templates',tpl);await il.dbPut('body',bwE);await il.dbPut('body',waist);
      await il.dbPut('exercises',il.S.ex.get('x06'));
      il.S.active={id:uid(),name:'Conv live',startedAt:now-600e3,notes:'',exs:[{exId:'x06',notes:'',tgt:{w:70,r:5,rpe:8},
        sets:[{t:'N',w:60,r:5,rpe:8,dur:null,dist:null,done:true}]}]};
      await il.flushActive();
      const n=await il.convertUnits('lb');
      const dbW=async id=>(await il.allOf('workouts')).find(w=>w.id===id);
      const sW=(await dbW(wS.id)).exs[0].sets,sC=(await dbW(wC.id)).exs[0].sets[0];
      const dT=(await il.allOf('templates')).find(t=>t.id==='t32'),dB=(await il.allOf('body'));
      const dA=await il.kvGet('active'),dS=await il.kvGet('settings');
      ok('units: every logged weight is converted, on disk',near(sW[0].w,220.462262185,1e-6)&&near(sW[1].w,225.97381874,1e-6)
        &&il.fmtW(sW[0].w)==='220.46',sW.map(s=>s.w).join(', '));
      ok('units: …distances too, since km ⇄ mi follows the unit',near(sC.dist,3.106855961,1e-6)&&sC.dur===30,sC.dist+' mi');
      ok('units: …template targets, body weight and an exercise’s own bar',
        near(dT.exs[0].w,220.462262185,1e-6)&&near(dT.exs[1].dist,3.106855961,1e-6)&&near(dB.find(b=>b.id==='b32').value,176.369809748,1e-6)
          &&near((await il.allOf('exercises')).find(x=>x.id==='x06').baseW,33.069339328,1e-6));
      ok('units: other measurements keep their numbers (a waist is not a weight)',dB.find(b=>b.id==='b32w').value===86);
      ok('units: the session in progress converts, set and target',near(dA.exs[0].sets[0].w,132.277357311,1e-6)&&near(dA.exs[0].tgt.w,154.32358353,1e-6)
        &&near(il.S.active.exs[0].sets[0].w,132.277357311,1e-6));
      ok('units: a standard bar and plate set become the lb standards',dS.unit==='lb'&&dS.barWeight===45
        &&JSON.stringify(dS.plates)==='[45,35,25,10,5,2.5]');
      ok('units: nothing gains a field it never had, and trophies stay',!('dist' in sW[0])&&sW[1].pr===1&&!sW[0].pr);
      ok('units: memory follows the disk',il.S.set.unit==='lb'&&near(il.S.workouts.find(w=>w.id===wS.id).exs[0].sets[0].w,220.462262185,1e-6),
        JSON.stringify(n));
      await il.convertUnits('kg');
      const back=(await dbW(wS.id)).exs[0].sets;
      ok('units: converting back returns exactly what you logged (so PREV and PRs are untouched)',back[0].w===100&&back[1].w===102.5
        &&(await dbW(wC.id)).exs[0].sets[0].dist===5&&(await dbW(wC.id)).exs[0].sets[1].dist===1.1&&(await il.allOf('body')).find(b=>b.id==='b32').value===80
        &&il.S.set.barWeight===20&&JSON.stringify(il.S.set.plates)==='[25,20,15,10,5,2.5,1.25]');
      // the other directions, on values plain nine-decimal rounding drifts on
      const lbs=[54.18,339.05,260.81,11.82,173.39,225];
      const rt=il.unitConvert(il.unitConvert({settings:{unit:'lb',barWeight:45,plates:[45,35,25,10,5,2.5]},exercises:[],templates:[],body:[],active:null,
        workouts:[{id:'rt',exs:[{exId:'x06',sets:lbs.map(w=>({t:'N',w,r:5}))},{exId:'c03',sets:[{t:'N',dur:10,dist:0.7},{t:'N',dur:10,dist:1.1}]}]}]},'kg'),'lb');
      ok('units: lb → kg → lb comes back exact too',JSON.stringify(rt.workouts[0].exs[0].sets.map(x=>x.w))===JSON.stringify(lbs)
        &&rt.workouts[0].exs[1].sets.map(x=>x.dist).join()==='0.7,1.1'&&rt.settings.barWeight===45,
        rt.workouts[0].exs[0].sets.map(x=>x.w).join(', '));
      il.S.set.plates=[20,10,5];
      const custom=il.unitConvert({settings:{...il.S.set},exercises:[],workouts:[],templates:[],body:[],active:null},'lb');
      ok('units: plates you listed yourself convert as they are',JSON.stringify(custom.settings.plates.map(p=>il.fmtW(p)))==='["44.09","22.05","11.02"]',
        JSON.stringify(custom.settings.plates));
      il.S.set.plates=[25,20,15,10,5,2.5,1.25];
      // all or nothing: one record the database refuses aborts the lot
      il.S.workouts.push({name:'no id',finishedAt:now,dur:1,notes:'',exs:[{exId:'x06',sets:[{t:'N',w:50,r:5,done:true}]}]});
      let threw=false;try{await il.convertUnits('lb');}catch(e){threw=true;}
      ok('units: a failure part-way changes nothing at all',threw&&il.S.set.unit==='kg'
        &&(await dbW(wS.id)).exs[0].sets[0].w===100&&(await il.kvGet('settings')).unit==='kg'&&il.S.workouts[0].exs[0].sets[0].w===100);
      il.S.workouts.pop();
      // the real flow: Settings → Units → lb → Convert
      il.S.active=null;await il.flushActive();
      document.querySelector('#gearbtn').click();await sleep(300);
      const lbBtn=[...document.querySelectorAll('.overlay .row-seg button')].find(b=>b.textContent==='lb');
      lbBtn.click();await sleep(300);
      [...document.querySelectorAll('.overlay .btn.primary')].find(b=>/Convert everything to lb/.test(b.textContent)).click();
      await sleep(600);
      const barIn=[...document.querySelectorAll('.overlay .lrow')].find(r=>/Bar weight/.test(r.textContent));
      ok('units: Settings converts through the sheet and shows the new numbers',
        il.S.set.unit==='lb'&&!!barIn&&barIn.querySelector('input').value==='45'&&/lb/.test(barIn.textContent),
        barIn?barIn.textContent:'');
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      await il.convertUnits('kg');
      // relabel only, for numbers already logged in lb
      il.unitSwitchSheet('lb');await sleep(250);
      [...document.querySelectorAll('.overlay .btn')].find(b=>/Only change the label/.test(b.textContent)).click();await sleep(300);
      ok('units: "Only change the label" keeps every number',il.S.set.unit==='lb'&&(await dbW(wS.id)).exs[0].sets[0].w===100);
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      il.S.set=keepSet;await il.kvPut('settings',il.S.set);
      if(keepEx==null)delete il.S.ex.get('x06').baseW;else il.S.ex.get('x06').baseW=keepEx;
      il.S.workouts=[];il.S.templates=[];
    }

    /* ---------- 33. an exercise's history, from inside the workout ---------- */
    {
      const shut=()=>{document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;};
      shut();
      il.S.workouts=[mkWorkout('x06',[[95,5]],now-9*DAY,'H1'),mkWorkout('x06',[[100,5],[100,4]],now-5*DAY,'H2'),
        mkWorkout('x06',[[102.5,5]],now-DAY,'H3'),mkWorkout('x19',[[70,8]],now-DAY,'Other')];
      il.S.records={};
      il.exHistorySheet('x06');await sleep(300);
      const rows=[...document.querySelectorAll('.overlay .hist-row')];
      ok('history: every session with the exercise, newest first',rows.length===3&&/H3/.test(rows[0].textContent)
        &&/H1/.test(rows[2].textContent),rows.map(r=>r.querySelector('.tiny').textContent).join(' · '));
      ok('history: each session lists its sets',/100 × 5\s+·\s+100 × 4/.test(rows[1].textContent),rows[1].textContent);
      const pts=(document.querySelector('.overlay .spark-box polyline')||{getAttribute:()=>''}).getAttribute('points').trim().split(/\s+/);
      ok('history: a sparkline of the best set per session',pts.length===3);
      ok('history: records up top',/Best est\. 1RM/.test(document.querySelector('.overlay .statgrid').textContent)
        &&/3\s*Sessions/.test(document.querySelector('.overlay .statgrid').textContent));
      shut();
      il.S.active={id:uid(),name:'H live',startedAt:now-600e3,notes:'',exs:[{exId:'x06',notes:'',
        sets:[{t:'N',w:null,r:null,rpe:null,dur:null,dist:null,done:false}]}]};
      il.S.prev={};il.S.records={};il.switchTab('log');await sleep(80);
      il.exMenu(0);await sleep(250);
      const first=document.querySelector('.overlay .menu-row');
      ok('history: first in the exercise menu, with a count',!!first&&/History/.test(first.textContent)&&/3 sessions/.test(first.textContent),
        first?first.textContent:'');
      first.click();await sleep(400);
      ok('history: …and it opens',document.querySelectorAll('.overlay .hist-row').length===3);
      shut();
      document.querySelector('#exc0 .exname').click();await sleep(300);
      ok('history: tapping the exercise name opens it too',document.querySelectorAll('.overlay .hist-row').length===3);
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      il.exHistorySheet('x44');await sleep(200);
      ok('history: an exercise never done says so',/today is the first/.test(document.querySelector('.overlay').textContent));
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      il.S.active=null;await il.flushActive();il.S.workouts=[];
    }

    /* ---------- 34. a forgotten Finish ends when the training did ---------- */
    {
      const shut=()=>{document.querySelectorAll('.overlay').forEach(o=>o.remove());il.SHEETS.length=0;};
      shut();
      const act=o=>({id:uid(),name:'Evening',startedAt:now-5*3600e3,notes:'',exs:[{exId:'x06',notes:'',
        sets:[{t:'N',w:100,r:5,rpe:8,dur:null,dist:null,done:true},{t:'N',w:null,r:null,rpe:null,dur:null,dist:null,done:false}]}],...o});
      const si=il.staleInfo;
      ok('stale: two quiet hours after the last set is a forgotten Finish',
        (si(act({lastAt:now-3*3600e3}),now)||{}).endAt===now-3*3600e3+5*60e3);
      ok('stale: a normal rest is not',si(act({lastAt:now-20*60e3}),now)===null);
      ok('stale: "Keep going" silences it for two more hours',si(act({lastAt:now-3*3600e3,staleAck:now-60e3}),now)===null);
      ok('stale: a 5.7 session without a last-set time is never ended at its start',
        (si(act({}),now)||{}).endAt===null&&si(act({}),now).done===true);
      ok('stale: nothing ticked at all offers to discard instead',si(act({exs:[{exId:'x06',notes:'',sets:[{t:'N',done:false}]}]}),now).done===false);
      // ticking a set records when training last happened
      il.S.active=act({startedAt:now-600e3});il.S.prev={};il.S.records={};il.S.workouts=[];
      il.switchTab('log');await sleep(80);
      document.querySelectorAll('#exc0 .setrow .chk')[1].click();await sleep(60);
      ok('stale: ticking a set stamps the time',Math.abs((il.S.active.lastAt||0)-Date.now())<2000);
      const rs=document.querySelector('#rt-skip');if(rs)rs.click();
      // the real flow: the card, then Finish at the last set
      const lastAt=now-3*3600e3-7*60e3;
      il.S.active=act({lastAt});il.switchTab('log');await sleep(80);
      const card=document.querySelector('#page-log .stale');
      // (the label gains a weekday when the last set was on another day)
      ok('stale: the card offers to finish at the last set',!!card&&card.textContent.includes('Finish at ')
        &&card.textContent.includes(new Date(lastAt+5*60e3).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})),
        card?card.textContent:'no card');
      [...card.querySelectorAll('button')].find(b=>/Finish at/.test(b.textContent)).click();await sleep(300);
      ok('stale: the finish sheet says when it will end',/when you last logged a set/.test(document.querySelector('.overlay').textContent));
      const id=il.S.active.id,st0=il.S.active.startedAt;
      [...document.querySelectorAll('.overlay .btn.green')].find(b=>/Save Workout/.test(b.textContent)).click();await sleep(500);
      const saved=il.S.workouts.find(w=>w.id===id);
      ok('stale: the workout ends at the last set plus a cool-down, not now',
        !!saved&&saved.finishedAt===lastAt+5*60e3&&saved.dur===Math.round((lastAt+5*60e3-st0)/1000),
        saved?new Date(saved.finishedAt).toISOString()+' · '+saved.dur+' s':'not saved');
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      // a normal Finish still ends now (the button hands the handler a click event)
      il.S.active=act({startedAt:now-1800e3,lastAt:Date.now()-60e3});il.switchTab('log');await sleep(80);
      ok('stale: no card while you are training',!document.querySelector('#page-log .stale'));
      document.querySelector('#page-log .wo-bar .btn.green').click();await sleep(300);
      const id2=il.S.active.id;
      [...document.querySelectorAll('.overlay .btn.green')].find(b=>/Save Workout/.test(b.textContent)).click();await sleep(500);
      const s2=il.S.workouts.find(w=>w.id===id2);
      ok('stale: an ordinary Finish ends now',!!s2&&Math.abs(s2.finishedAt-Date.now())<5000&&s2.dur>1700,
        s2?s2.finishedAt+' · '+s2.dur:'not saved');
      shut();try{history.replaceState({ilSheet:0},'');}catch(e){}
      // "Keep going" removes the card and remembers it
      il.S.active=act({lastAt:now-3*3600e3});il.switchTab('log');await sleep(80);
      [...document.querySelectorAll('#page-log .stale button')].find(b=>/Keep going/.test(b.textContent)).click();await sleep(60);
      ok('stale: "Keep going" dismisses it',!document.querySelector('#page-log .stale')&&il.S.active.staleAck>0);
      il.S.active=null;await il.flushActive();il.S.workouts=[];
    }

    /* ---------- 35. updates reach the installed app; charts ship with it ---------- */
    {
      const nv=il.newerVer;
      ok('update: versions compare as numbers',nv('5.10','5.9')&&nv('5.9','5.8')&&nv('6','5.9.9')&&!nv('5.8','5.8')&&!nv('5.7','5.8'));
      const v=await il.checkForUpdate(true);
      ok('update: checks the live page, and this build is current',v===null&&il.UPD.ok===true);
      let polluted=false;
      for(const k of await caches.keys())if((await (await caches.open(k)).keys()).some(r=>r.url.includes('ilcheck')))polluted=true;
      ok('update: the check goes past the offline cache and stores nothing',!polluted&&!!navigator.serviceWorker.controller,
        navigator.serviceWorker.controller?'':'(page not controlled by the service worker)');
      il.UPD.ver='9.9';il.switchTab('log');await sleep(60);
      const uc=document.querySelector('#page-log #updcard');
      ok('update: a newer version puts a one-tap Update on the Log tab',!!uc&&/9\.9 is ready/.test(uc.textContent)
        &&[...uc.querySelectorAll('button')].some(b=>b.textContent==='Update'));
      il.UPD.ver=null;il.switchTab('log');
      const ext=[...document.scripts].filter(s=>s.src&&new URL(s.src).origin!==location.origin);
      ok('offline: Chart.js ships with the app — no script from another site',!ext.length&&!!window.Chart
        &&[...document.scripts].some(s=>/vendor\/chart\.umd\.min\.js$/.test(s.src)),ext.map(s=>s.src).join(' '));
      const swTxt=await (await fetch('sw.js',{cache:'no-store'})).text();
      ok('offline: …and the service worker precaches it for the first launch',swTxt.includes("'./vendor/chart.umd.min.js'"));
      ok('offline: …with its MIT licence alongside',(await fetch('vendor/chart.js-LICENSE.md')).ok);
    }

    /* ---------- 36. stress test ---------- */
    const N=opts.stress===false?0:400;
    if(N){
      const ids=[...il.S.ex.values()].filter(x=>!x.cardio).slice(0,12).map(x=>x.id);
      const cIds=[...il.S.ex.values()].filter(x=>x.cardio).slice(0,3).map(x=>x.id);
      const big=[];
      for(let i=0;i<N;i++){
        const exs=[];
        for(let k=0;k<5;k++){
          const id=ids[(i*5+k)%ids.length];
          exs.push({exId:id,sets:[0,1,2,3].map(j=>({t:j===0?'W':'N',
            w:60+((i+j*7)%50),r:5+((i+j)%6),rpe:7+((i+j)%3),dur:null,dist:null,done:true}))});
        }
        if(i%3===0){const cid=cIds[i%cIds.length];
          exs.push({exId:cid,sets:[{t:'N',w:null,r:null,rpe:6,dur:25+(i%20),dist:5+(i%6),done:true}]});}
        big.push({id:'s'+i,name:'Stress '+i,finishedAt:now-i*43200000,dur:3600,notes:'',exs});
      }
      // one transaction for the lot, per the playbook
      await new Promise((res,rej)=>{
        const req=indexedDB.open('ironlog');
        req.onsuccess=()=>{
          const d=req.result,tx=d.transaction('workouts','readwrite'),os=tx.objectStore('workouts');
          for(const w of big)os.put(w);
          tx.oncomplete=()=>{d.close();res();};
          tx.onerror=()=>{d.close();rej(tx.error);};
        };
        req.onerror=()=>rej(req.error);
      });
      await il.loadAll();
      il.S.records={};il.S.prev={};
      ok('stress: '+N+' workouts loaded',il.S.workouts.length>=N,il.S.workouts.length+' total');
      for(const t of['log','templates','history','progress','body']){
        const a=performance.now();il.switchTab(t);timings[t]=+(performance.now()-a).toFixed(1);
      }
      const a1=performance.now();il.muscleRecovery();timings.muscleRecovery=+(performance.now()-a1).toFixed(1);
      const a2=performance.now();il.weeklyPRs();timings.weeklyPRs=+(performance.now()-a2).toFixed(1);
      const a3=performance.now();il.strengthProfile();timings.strengthProfile=+(performance.now()-a3).toFixed(1);
      const a4=performance.now();il.cardioRecommendation();timings.cardioCoach=+(performance.now()-a4).toFixed(1);
      const slow=Object.entries(timings).filter(([k,v])=>v>(k==='progress'?600:250));
      ok('stress: every tab and computation stays responsive',slow.length===0,
        JSON.stringify(timings));
      const a5=performance.now();
      const bigExport=await il.buildExportData();
      timings.export=+(performance.now()-a5).toFixed(1);
      ok('stress: export completes on a large database',
        bigExport.workouts.length>=N,Math.round(JSON.stringify(bigExport).length/1024)+' KB');
    }
  }catch(err){
    R.push({name:'SUITE CRASHED',pass:false,detail:err&&err.stack?err.stack.split('\n').slice(0,3).join(' | '):String(err)});
  }finally{
    try{await il.applyImport(snapshot);}catch(e){console.error('restore failed',e);}
  }

  const pass=R.filter(r=>r.pass).length,fail=R.length-pass;
  const out={pass,fail,total:R.length,ms:Math.round(performance.now()-t0),timings,
    failures:R.filter(r=>!r.pass).map(r=>r.name+' — '+r.detail),results:R};
  console.log('%cIronLog tests: '+pass+'/'+R.length+' passed'+(fail?' — '+fail+' FAILED':''),
    'font-weight:bold;color:'+(fail?'#ef4444':'#2fd671'));
  console.table(R.map(r=>({test:r.name,pass:r.pass,detail:r.detail})));
  return out;
};
})();
