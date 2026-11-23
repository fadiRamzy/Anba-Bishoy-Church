const { chromium } = require('playwright-core');
(async () => {
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox', '--disable-dev-shm-usage'], headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message));
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof MembersDB!=='undefined' && typeof perfExportFullReportPDF==='function');
 const results=[]; function check(n,v){results.push([n,!!v]);console.log((v?'PASS ':'::error::FAIL ')+n)}
 await page.evaluate(async()=>{
  const old=await MembersDB.getAll(); for(const m of old) await MembersDB.remove(m.id);
  for(let i=1;i<=30;i++) await MembersDB.put({id:i,name:'اسم '+i,phone1:'01000111111',street:'شارع',locationLink:'x',sector:i<=15?'قطاع أ':'قطاع ب',stage:'مرحلة ١',city:'المنيا',neighborhood:i<=10?'حي أول':'حي ثان',class:i<=15?'فصل ألف':'فصل باء',visits:i%2?['2026-11-01']:[],attendance:[{date:'2026-10-01',present:i%2===1}]});
  window.__reports=[];window.__pdfs=[];
  _loadPdfLibs=async()=>{}; window.jspdf={jsPDF:class{save(n){window.__pdfs.push(n)}}};
  _pdfRenderPages=async(pdf,pages)=>{ window.__reports.push(pages); };
  sessionStorage.setItem('perf_unlocked_role','amin');
 });
 await page.evaluate(async()=>perfExportFullReportPDF(await MembersDB.getAll()));
 let report=await page.evaluate(()=>__reports[0]);
 check('compact report generates 1–2 pages for 30 records',report.length<=2);
 const r=await page.evaluate((pages)=>{
  const shell=document.createElement('div');shell.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(shell);shell.innerHTML=pages.join('');
  const bodies=[...shell.querySelectorAll('.report-body')];
  const cells=[...shell.querySelectorAll('th,td')];
  const texts=pages.join('');
  const x={fits:bodies.every(b=>b.scrollHeight<=b.clientHeight), cellsFit:cells.every(c=>c.scrollWidth<=c.clientWidth+1 && c.scrollHeight<=c.clientHeight+1), title:texts.includes('التقرير الكامل عن الخدمة'),noUnknown:!texts.includes('غير محدد'),noNames:!texts.includes('اسم 1'),sectorA:(texts.match(/قطاع أ/g)||[]).length,sectorB:(texts.match(/قطاع ب/g)||[]).length,cls:(texts.match(/فصل ألف/g)||[]).length, labels: ['القطاع','المرحلة','المدينة','الحي','الفصل','المخدومون'].every(x=>texts.includes(x)), summary:texts.includes('50.0%') && texts.includes('30')};shell.remove();return x;
 },report);
 for(const [k,v] of Object.entries(r)) check('report '+k,typeof v==='number'?v===1:v);
 const denied=await page.evaluate(async()=>{sessionStorage.setItem('perf_unlocked_role','khadim');try{await perfExportFullReportPDF(await MembersDB.getAll());return false}catch(e){return true}});check('servant cannot export numerical report',denied);
 await page.evaluate(async()=>{for(let i=31;i<=180;i++)await MembersDB.put({id:i,name:'زائر '+i,sector:'قطاع '+i,stage:'',city:'',neighborhood:'',class:'',attendance:[],visits:[]});sessionStorage.setItem('perf_unlocked_role','amin');await perfExportFullReportPDF(await MembersDB.getAll());});
 let long=await page.evaluate(()=>__reports[1]);
 const l=await page.evaluate(pages=>{const d=document.createElement('div');d.style='position:fixed;left:-9999px';d.innerHTML=pages.join('');document.body.append(d);const ok=[...d.querySelectorAll('.report-body')].every(x=>x.scrollHeight<=x.clientHeight);const repeat=[...d.querySelectorAll('.report-body')].every(x=>x.querySelector('thead'));d.remove();return {ok,repeat}},long);
 check('large report spans pages',long.length>2);check('large report pages fit',l.ok);check('table headers repeat on continuation pages',l.repeat);
 await page.evaluate(async()=>{window.__captured=[];simpleTablePdf=async o=>__captured.push(o); location.hash='#/iftiqad?view=visited';});
 await page.waitForSelector('#iftExportFiltered');
 check('directory label',await page.locator('#iftExportFiltered').innerText()==='تصدير الكل PDF');
 await page.locator('#iftSector').selectOption('قطاع أ');await page.waitForTimeout(300);
 await page.locator('#iftExportFiltered').click(); await page.waitForFunction(()=>__captured.length>0);
 check('all filtered visited records exported',await page.evaluate(()=>__captured[0].rows.length===8));
 await page.locator('.ift-pick').first().check();await page.locator('#iftExportSelected').click();await page.waitForFunction(()=>__captured.length>1);
 check('selected export retained',await page.evaluate(()=>__captured[1].rows.length===1));
 await page.evaluate(()=>{sessionStorage.setItem('perf_unlocked_role','amin');location.hash='#/performance?tab=overview&stat=total'});await page.waitForSelector('#perfDrillExportSelected');
 check('overview selected PDF label',await page.locator('#perfDrillExportSelected').innerText()==='تصدير المحدد PDF');
 await page.evaluate(()=>{sessionStorage.setItem('perf_unlocked_role','khadim');location.hash='#/performance?tab=individuals'});await page.waitForSelector('#perfExportSelected');check('servant retains selection export',await page.locator('#perfExportSelected').count()===1);check('servant does not see report',await page.locator('#perfReportBtn').count()===0);
 await page.setViewportSize({width:375,height:812});await page.evaluate(()=>location.hash='#/iftiqad?view=visited');await page.waitForSelector('#iftSector');
 check('mobile directory fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('mobile filter tap size',await page.locator('#iftSector').evaluate(e=>e.getBoundingClientRect().height>=44));
 await page.evaluate(()=>location.hash='#/performance?tab=individuals');await page.waitForSelector('#perfExportSelected');check('mobile performance fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log(`RESULT ${results.filter(x=>x[1]).length}/${results.length}`);await browser.close();process.exit(results.some(x=>!x[1])?1:0);
})().catch(e=>{console.log('::error::'+String(e).replace(/\n/g,' '));process.exit(2)});
