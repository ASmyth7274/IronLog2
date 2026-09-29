// Runs IronLog's in-app regression suite (tests.js) headlessly against this
// checkout, the way a phone would load it: served over http://localhost (a
// secure context, so the service worker registers), in a phone-sized mobile
// viewport, in a chosen time zone.
//
//   node ci/run-tests.mjs                     full suite, incl. the stress test
//   node ci/run-tests.mjs --no-stress         quicker
//   node ci/run-tests.mjs --tz=Pacific/Auckland
//
// Needs Playwright:  npm i --no-save playwright && npx playwright install chromium
// Exits 1 if any check fails, 2 if the app or the suite could not run at all.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=k=>(process.argv.find(a=>a.startsWith('--'+k+'='))||'').split('=')[1];
const STRESS=!process.argv.includes('--no-stress');
const TZ=arg('tz')||process.env.TZ||'Europe/London';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript',
  '.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.md':'text/plain'};

const srv=http.createServer((q,r)=>{
  let p=decodeURIComponent(q.url.split('?')[0]);
  if(p.endsWith('/'))p+='index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||!fs.statSync(f).isFile()){r.writeHead(404);r.end();return;}
  r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});
  fs.createReadStream(f).pipe(r);
});
await new Promise(res=>srv.listen(0,'127.0.0.1',res));
const url='http://localhost:'+srv.address().port+'/';

const browser=await chromium.launch();
const done=async code=>{await browser.close().catch(()=>{});srv.close();process.exit(code);};
try{
  const ctx=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:2,
    isMobile:true,hasTouch:true,timezoneId:TZ});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console.error: '+m.text());});
  await page.goto(url);
  await page.waitForFunction(()=>window.__il&&window.Chart,null,{timeout:30000});
  await page.addScriptTag({path:path.join(ROOT,'tests.js')});
  const out=await page.evaluate(async stress=>{
    const r=await window.__iltest({stress});
    return {pass:r.pass,fail:r.fail,total:r.total,ms:r.ms,failures:r.failures};
  },STRESS);
  const line=`IronLog tests (${TZ}${STRESS?'':', no stress'}): ${out.pass}/${out.total} passed in ${(out.ms/1000).toFixed(1)} s`;
  console.log(line);
  for(const f of out.failures)console.log('  FAIL  '+f);
  if(errors.length)console.log('Page errors:\n  '+errors.join('\n  '));
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### '+(out.fail?'❌ ':'✅ ')+line+'\n'
      +out.failures.map(f=>'- '+f.replace(/\|/g,'\\|')).join('\n')+'\n');
  }
  await done(out.fail?1:0);
}catch(err){
  console.error('The suite could not run: '+(err&&err.message?err.message.split('\n')[0]:err));
  await done(2);
}
