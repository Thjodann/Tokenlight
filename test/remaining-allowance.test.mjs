import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as model from '../src/model.mjs';
import * as demoData from '../src/demo-data.mjs';
import {demoCards} from '../src/fixtures.mjs';
import {allowancePercent,allowanceFill,allowanceReading,allowanceState,allowanceMarkup,allowanceSummary,balanceReading,paidLimitText} from '../src/metric-view.mjs';
import {dialSegments,allowancePools,allowanceDial,allowanceLegend} from '../src/allowance-dial.mjs';
import {desktopView} from '../src/desktop-view.mjs';
import {dashboardView} from '../src/dashboard-view.mjs';
import {miniView} from '../src/mini-view.mjs';
import {wideView} from '../src/wide-view.mjs';
import windows from '../src/dashboard-windows.cjs';
const mainUrl=new URL('../src/main.cjs',import.meta.url),require=createRequire(mainUrl),main=await readFile(mainUrl,'utf8');
function serviceAt(dir) {
 const module={exports:{}};
 const electron={app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>({then(){}}),getVersion:()=> 'test',getPath:()=>dir},nativeTheme:{shouldUseDarkColors:false},Menu:{}};
 vm.runInNewContext(main+'\nmodule.exports={Service,inject(m,d){model=m;demoData=d;}};', {require:id=>id==='electron'?electron:require(id),module,process:{env:{},argv:[]},__dirname:fileURLToPath(new URL('../src/',import.meta.url))});
 module.exports.inject(model,demoData);return new module.exports.Service();
}
test('remaining percentage, bounded paint, unknown and over-limit retain provider context',()=>{
 for(const [used,left] of [[0,100],[60,40],[100,0],[112,0],[2.9,97.1]]) {
  assert.equal(allowancePercent(used,true),left);
  assert.equal(allowancePercent(used,false),used);
  const segments=dialSegments(allowancePercent(used,true));
  assert.ok(Math.abs(segments.reduce((sum,s)=>sum+s.fraction,0)-left/100*12)<1e-10);
  assert.equal(allowanceFill(used,true),left);
 }
 for(const value of [undefined,null,NaN,Infinity]) {assert.equal(allowancePercent(value,true),null);assert.equal(allowanceReading(value,true),'Not reported');assert.equal(allowanceFill(value,true),0);}
 assert.equal(allowanceFill(-5,true),0);assert.equal(allowanceReading(112,true),'0% remaining (112% used)');
 assert.match(allowanceDial([],true)+allowanceLegend([],true),/not reported/i);
});
test('all allowance renderer seams complement labels and fills without changing money, balances, activity or severity',()=>{
 const s={month:'2026-11',settings:{showRemainingAllowance:true},cards:demoCards('2026-11'),demo:true};
 const c=s.cards.find(c=>c.id==='claude');c.windows=[{label:'Weekly',percent:60}];
 const before=structuredClone(s),pools=allowancePools([c]);
 assert.match(allowanceDial(pools,true),/data-percent="40"/);assert.match(allowanceDial(pools,true),/40<small>%/);
 assert.match(allowanceLegend(pools,true),/% remaining/);
 assert.match(allowanceMarkup(c,true),/width="40"/);assert.match(allowanceSummary(c,true),/40% remaining/);
 for(const render of [x=>desktopView(x,'overview',''),x=>dashboardView(x,'overview'),x=>miniView(x,'overview'),x=>wideView(x,'overview')]) {const html=render(s);assert.match(html,/40% remaining/);assert.doesNotMatch(html,/Weekly: 60% used/);}
 assert.deepEqual(s,before);
 assert.equal(balanceReading(c).text,balanceReading(before.cards.find(c=>c.id==='claude')).text);
 assert.equal(paidLimitText(c),paidLimitText(before.cards.find(c=>c.id==='claude')));
 for(const [used,state] of [[60,'normal'],[80,'warning'],[95,'critical'],[100,'critical'],[112,'critical']]) {
  c.windows[0].percent=used;assert.equal(allowanceState(used),state);
  for(const remaining of [false,true]) {assert.match(allowanceMarkup(c,remaining),new RegExp(`data-allowance-state="${state}"`));assert.match(allowanceDial(allowancePools([c]),remaining),new RegExp(`data-allowance-state="${state}"`));}
 }
 assert.match(dashboardView(s,'overview'),/visibility="hidden" stroke-dasharray="0 100"/);
 c.windows=[{label:'Unknown',percent:null}];assert.doesNotMatch(allowanceMarkup(c,true),/100% remaining/);
});
test('preference defaults off, persists across launch, synchronizes sanitized windows and rolls back failed queued writes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'tokenlight-allowance-'));
 try {
  const s=serviceAt(dir);await s.init();assert.equal(s.settings.showRemainingAllowance,false);
  const registry=new windows.DashboardWindows(),sent=[];
  const win=()=>({webContents:{send:(_channel,data)=>sent.push(data)},once(){},isDestroyed:()=>false});
  const normal=registry.add(win(),{month:s.month}),pop=registry.add(win(),{kiosk:true,month:s.month});
  s.emit=()=>registry.broadcast(month=>s.snapshot(month));
  for(const bad of [null,1,'true',{}]) await assert.rejects(s.setShowRemainingAllowance(bad));
  await s.setShowRemainingAllowance(true);
  assert.equal(sent.at(-1).settings.showRemainingAllowance,true);assert.equal(sent.at(-1).settings.secretsPath,undefined);
  const restarted=serviceAt(dir);await restarted.init();assert.equal(restarted.snapshot().settings.showRemainingAllowance,true);
  s.demo=true;assert.equal(s.snapshot().settings.showRemainingAllowance,true);assert.equal(s.snapshot().settings.secretsPath,null);
  const event={sender:pop.window.webContents,senderFrame:{}};event.sender.mainFrame=event.senderFrame;
  assert.throws(()=>registry.authorize(event),/read-only/);assert.equal(registry.authorize(event,true),pop);
  assert.throws(()=>registry.authorize({...event,senderFrame:{}}),/Unknown caller/);
  let release;const hold=new Promise(r=>release=r);let calls=0;
  s.persist=async()=>{if(++calls===1){await hold;throw new Error('fixture disk failure');}};
  const failed=s.setShowRemainingAllowance(false);const recovered=s.setShowRemainingAllowance(true);
  const rejected=assert.rejects(failed,/fixture disk failure/);release();await rejected;await recovered;
  assert.equal(s.settings.showRemainingAllowance,true);assert.equal(sent.at(-1).settings.showRemainingAllowance,true);
  assert.ok(sent.some(x=>x.settings.showRemainingAllowance===false),'immediate broadcast');
  assert.equal(registry.snapshot(normal,s.snapshot()).settings.showRemainingAllowance,true);
  assert.match(main,/handle\('set-remaining-allowance', \(_entry, enabled\) => service.setShowRemainingAllowance\(enabled\)\);/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('renderer snapshot updates open source allowances without disturbing dirty forms',async()=>{
 const renderer=await readFile(new URL('../src/renderer.mjs',import.meta.url),'utf8');
 const updateSource=renderer.slice(renderer.indexOf('function update(value)'),renderer.indexOf('async function run'));
 const controls={ '#details-dialog':{open:true}, '#remaining-allowance':{}, '#appearance-mode':{} };
 const reading={dataset:{allowanceIndex:'0'},textContent:'60% used'}, unknown={dataset:{allowanceIndex:'1'},textContent:'Not reported'};
 const before={cards:[{id:'codex',windows:[{percent:60},{percent:null}]}],settings:{showRemainingAllowance:false},demo:false};
 let renders=0;
 const module={exports:{}};
 vm.runInNewContext(updateSource+';module.exports=update;',{
  module,snapshot:before,view:'overview',selected:'codex',detailDirty:true,
  $:key=>controls[key],document:{documentElement:{dataset:{}},querySelectorAll:()=>[reading,unknown]},
  allowanceReading,render:()=>renders++,renderDetails:()=>assert.fail('must preserve dirty form')
 });
 module.exports({...before,settings:{showRemainingAllowance:true}});
 assert.equal(reading.textContent,'40% remaining');assert.equal(unknown.textContent,'Not reported');
 assert.equal(controls['#remaining-allowance'].checked,true);assert.equal(renders,1);
 module.exports(before);assert.equal(reading.textContent,'60% used');assert.equal(controls['#remaining-allowance'].checked,false);
});

test('run shows rejected API errors in the toast and preserves successful string receipts',async()=>{
 const renderer=await readFile(new URL('../src/renderer.mjs',import.meta.url),'utf8');
 const start=renderer.indexOf('function notify(');
 assert.notEqual(start,-1,'the renderer must retain its notification helper');
 const source=renderer.slice(start,renderer.indexOf('async function action('));
 const classes=new Set(),toast={hidden:true,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
 let modalOpen=true,parent,timer,delay;
 const modal={append(value){assert.equal(value,toast);parent='modal';}};
 const body={append(value){assert.equal(value,toast);parent='body';}};
 const module={exports:{}};
 vm.runInNewContext(source+';module.exports=run;',{
  module,toastTimer:17,$:selector=>{assert.equal(selector,'#toast');return toast;},
  document:{body,querySelectorAll:()=>modalOpen?[modal]:[]},
  clearTimeout(id){assert.equal(id,17);},setTimeout(fn,ms){timer=fn;delay=ms;return 17;},
  update(){assert.fail('a failed action must not update the snapshot');}
 });
 const original=new Error('Could not save allowance preference.');
 assert.equal(await module.exports(()=>Promise.reject(original)),null);
 assert.equal(toast.textContent,original.message);assert.equal(toast.hidden,false);
 assert.equal(classes.has('error'),true);assert.equal(classes.has('in-dialog'),true);
 assert.equal(parent,'modal');assert.equal(delay,6500);timer();assert.equal(toast.hidden,true);
 modalOpen=false;
 assert.equal(await module.exports(async()=> 'Snapshot exported.'),'Snapshot exported.');
 assert.equal(toast.textContent,'Snapshot exported.');assert.equal(toast.hidden,false);
 assert.equal(classes.has('error'),false);assert.equal(classes.has('in-dialog'),false);
 assert.equal(parent,'body');assert.equal(delay,4000);
});
