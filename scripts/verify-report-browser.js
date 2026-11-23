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
 await page.evaluate(async()=>renderHome());
 check('service buttons ordered follow-up then performance', await page.evaluate(()=>{const links=[...document.querySelectorAll('.nav-grid a')].map(a=>a.getAttribute('href'));return links.indexOf('#/iftiqad')===links.length-2 && links.indexOf('#/performance')===links.length-1;}));
 await page.evaluate(async()=>perfExportFullReportPDF(await MembersDB.getAll()));
 let report=await page.evaluate(()=>__reports[0]);
 check('compact report generates 1–2 pages for 30 records',report.length<=2);
 const r=await page.evaluate((pages)=>{
  const shell=document.createElement('div');shell.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(shell);shell.innerHTML=pages.join('');
  const bodies=[...shell.querySelectorAll('.report-body')];
  const cells=[...shell.querySelectorAll('th,td')];
  const texts=pages.join('');
  const x={fits:bodies.every(b=>b.scrollHeight<=b.clientHeight), cellsFit:cells.every(c=>c.scrollWidth<=c.clientWidth+1 && c.scrollHeight<=c.clientHeight+1), title:texts.includes('التقرير الكامل عن الخدمة'),noUnknown:!texts.includes('غير محدد'),noNames:!texts.includes('اسم 1'),sectorA:[...shell.querySelectorAll('tbody tr')].filter(tr=>tr.cells[0].textContent.trim()==='قطاع أ').length,sectorB:[...shell.querySelectorAll('tbody tr')].filter(tr=>tr.cells[0].textContent.trim()==='قطاع ب').length,cls:[...shell.querySelectorAll('tbody tr')].filter(tr=>tr.cells[0].textContent.trim()==='قطاع أ · فصل ألف').length, labels: ['القطاع','المرحلة','المدينة','الحي','الفصل','المخدومون'].every(x=>texts.includes(x)), summary:texts.includes('50.0%') && texts.includes('30')};shell.remove();return x;
 },report);
 for(const [k,v] of Object.entries(r)) check('report '+k,typeof v==='number'?v===1:v);
 // Verify beneficiary-based counts, inclusive dates, every grouping and PDF.
 const calculation = await page.evaluate(async () => {
  const original = await MembersDB.getAll();
  for (const m of original) await MembersDB.remove(m.id);
  const items = Array.from({length:20}, (_, i) => ({
   id:i+1,name:'اختبار '+i,sector:i%2?'ب':'أ',stage:i%2?'ثاني':'أول',city:i%2?'شرق':'غرب',
   neighborhood:i%2?'حي ب':'حي أ',class:i%2?'فصل ب':'فصل أ',
   attendance:i<4 ? [{date:'2026-10-02',present:true},{date:'2026-10-03',present:true}] : [{date:'2026-09-01',present:true}],
   phone1:'01000111111', street:'شارع',locationLink:'url', visits:i<6?['2026-10-02','2026-10-03']:['2026-09-01'] }));
  items[19].sector=''; items[19].phone1=''; items[18].street='';
  for (const m of items) await MembersDB.put(m);
  await renderPerformance({tab:'overview'});
  const start=document.querySelector('#perfPeriodStart'); start.value='2026-10-01'; start.dispatchEvent(new Event('change'));
  await new Promise(resolve=>setTimeout(resolve,150));
  const end=document.querySelector('#perfPeriodEnd'); end.value='2026-10-31'; end.dispatchEvent(new Event('change'));
  await new Promise(resolve=>setTimeout(resolve,150));
  const periodUI=sessionStorage.getItem('perf_period_start')==='2026-10-01' && sessionStorage.getItem('perf_period_end')==='2026-10-31';
  const total=perfTotals(items);
  const missing=perfTotals([{id:999,attendance:[]},{id:1000}]);
  const levels=['sector','stage','city','neighborhood','class'].every(field => {
    const groups=perfGroup(items,field==='class'?perfClassKey:m=>m[field]);
    return groups.reduce((a,g)=>a+g.count,0)===20 && groups.reduce((a,g)=>a+g.present,0)===4 &&
      groups.reduce((a,g)=>a+g.absent,0)===16 && groups.reduce((a,g)=>a+g.visit.visited,0)===6 &&
      groups.reduce((a,g)=>a+g.visit.notVisited,0)===14 && groups.every(g=>g.count===g.present+g.absent && g.count===g.visit.visited+g.visit.notVisited);
  });
  const visit=perfVisitStats(items), empty=perfVisitStats([]), incomplete=perfIncomplete(items);
  const incompleteOK=incomplete.length===2 && incomplete.some(x=>x.member.id===20 && x.missing.map(f=>f.key).sort().join(',')==='phone,sector') && incomplete.some(x=>x.member.id===19 && x.missing.length===1 && x.missing[0].key==='street');
  const noDenominator=perfTotals([]).pctPresent===null && perfTotals([]).pctAbsent===null && empty.pctVisited===null && empty.pctNotVisited===null;
  const independence=perfMemberAttendance(items[5])===false && perfIsVisited(items[5])===true && perfIsVisited(items[6])===false;
  await renderPerformance({tab:'overview',stat:'absence'});
  const dashboard=document.querySelector('#perfBody').textContent;
  const drill=document.querySelectorAll('.perf-drill-pick').length;
  const visitDashboard=dashboard.includes('30.0%') && dashboard.includes('70.0%');
  await renderPerformance({tab:'incomplete'});
  const aminIncomplete=document.querySelectorAll('.perf-incomplete-pick').length===2 && [...document.querySelectorAll('.perf-field-chips .perf-chip')].some(c=>c.textContent.includes('القطاع') && c.textContent.includes('1'));
  sessionStorage.setItem('perf_unlocked_role','khadim');
  await renderPerformance({tab:'classes'});
  const servantTable=document.querySelector('.perf-table tfoot').textContent;
  const servantOK=servantTable.includes('20.0%') && servantTable.includes('80.0%') && !document.querySelector('.perf-visit-count') && !document.querySelector('#perfReportBtn');
  await renderPerformance({tab:'incomplete'});
  const servantIncomplete=document.querySelectorAll('.perf-incomplete-pick').length===2;
  sessionStorage.setItem('perf_unlocked_role','amin');
  await perfExportFullReportPDF(items);
  const pdf=__reports[__reports.length-1];
  const container=document.createElement('div');container.innerHTML=pdf.join('');
  const tables=[...container.querySelectorAll('table')];
  const summary=tables[0];
  const sections=tables.slice(1).every(t => [...t.querySelectorAll('tbody tr')].reduce((n,r)=>n+Number(r.cells[1].textContent.replace(/,/g,'')),0)===20);
  const classRows=[...tables[tables.length-1].querySelectorAll('tbody tr')].map(r=>[r.cells[0].textContent.trim(),r.cells[1].textContent.trim()]);
  const classGroups=classRows.some(([label,n])=>label==='ب · فصل ب' && n==='9') && classRows.some(([label,n])=>label==='فصل ب' && n==='1');
  const bounds=(() => { const holder=document.createElement('div'); holder.style='position:fixed;left:-9999px;top:0';holder.innerHTML=pdf.join('');document.body.append(holder);const valid=[...holder.querySelectorAll('tbody td span[style*="background"]')].every(span=>{const a=span.getBoundingClientRect(),b=span.parentElement.getBoundingClientRect();return a.left>=b.left-0.5 && a.right<=b.right+0.5;});holder.remove();return valid; })();
  const rows=[...summary.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()));
  const headings=[...summary.querySelectorAll('thead tr')];
  const grouped=headings.length===2 && headings[0].lastElementChild.textContent==='ملفات' && headings[0].lastElementChild.colSpan===2 && headings[1].children.length===2 && headings[1].children[0].textContent==='ناقص' && headings[1].children[1].textContent==='مكتمل';
  const highlighted=[...container.querySelectorAll('tbody tr')].every(r=>[...r.cells].every((c,i)=>{
    const marker=c.querySelector('span[style*="background"]');
    return (i===3||i===5) && /[0-9]/.test(c.textContent) ? !!marker : !marker;
  }));
  for (const m of items) await MembersDB.remove(m.id);
  for (const m of original) await MembersDB.put(m);
  sessionStorage.removeItem('perf_period_start');sessionStorage.removeItem('perf_period_end');
  return {total,missing,levels,dashboard,drill,rows,grouped,highlighted,periodUI,visit,incompleteOK,noDenominator,independence,sections,bounds,classGroups,visitDashboard,aminIncomplete,servantOK,servantIncomplete};
 });
 check('20 registered: 4 present, 16 absent, 20% and 80%',calculation.total.count===20 && calculation.total.present===4 && calculation.total.absent===16 && calculation.total.pctPresent===20 && calculation.total.pctAbsent===80);
 check('no attendance yields all absent',calculation.missing.present===0 && calculation.missing.absent===2 && calculation.missing.pctAbsent===100);
 check('reporting period selection is applied',calculation.periodUI);
 check('all five levels use beneficiary counts',calculation.levels);
 check('visitation totals and period',calculation.visit.visited===6 && calculation.visit.notVisited===14 && calculation.visit.pctVisited===30 && calculation.visit.pctNotVisited===70);
 check('attendance and visits remain independent',calculation.independence);
 check('incomplete profiles and missing field counts',calculation.incompleteOK);
 check('zero denominator safe',calculation.noDenominator);
 check('PDF level totals include missing groups',calculation.sections);
 check('PDF separates same class across sectors',calculation.classGroups);
 check('PDF highlights remain within each cell',calculation.bounds);
 check('admin visitation dashboard matches totals',calculation.visitDashboard);
 check('incomplete counts shown for both roles',calculation.aminIncomplete && calculation.servantIncomplete);
 check('servant class totals and restrictions',calculation.servantOK);
 check('dashboard displays correct scope and absent list',calculation.dashboard.includes('20.0%') && calculation.dashboard.includes('80.0%') && calculation.drill===16);
 check('PDF totals match dashboard',calculation.rows[0][1]==='20' && calculation.rows[0][2]==='4' && calculation.rows[0][3]==='16' && calculation.rows[1][2]==='20.0%' && calculation.rows[1][3]==='80.0%');
 check('profile columns have grouped heading',calculation.grouped);
 check('only absence and unvisited figures highlighted',calculation.highlighted);
 const denied=await page.evaluate(async()=>{sessionStorage.setItem('perf_unlocked_role','khadim');try{await perfExportFullReportPDF(await MembersDB.getAll());return false}catch(e){return true}});check('servant cannot export numerical report',denied);
 await page.evaluate(async()=>{for(let i=31;i<=180;i++)await MembersDB.put({id:i,name:'زائر '+i,sector:'قطاع '+i,stage:'',city:'',neighborhood:'',class:'',attendance:[],visits:[]});sessionStorage.setItem('perf_unlocked_role','amin');await perfExportFullReportPDF(await MembersDB.getAll());});
 let long=await page.evaluate(()=>__reports[__reports.length-1]);
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
 check('mobile filter tap size',await page.locator('#iftSector').evaluate(e=>e.offsetHeight>=44));
 await page.evaluate(()=>location.hash='#/performance?tab=individuals');await page.waitForSelector('#perfExportSelected');check('mobile performance fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log(`RESULT ${results.filter(x=>x[1]).length}/${results.length}`);await browser.close();process.exit(results.some(x=>!x[1])?1:0);
})().catch(e=>{console.log('::error::'+String(e).replace(/\n/g,' '));process.exit(2)});
