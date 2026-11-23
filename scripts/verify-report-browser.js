const { chromium } = require('playwright-core');
(async () => {
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox', '--disable-dev-shm-usage'], headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message));
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof MembersDB!=='undefined' && typeof perfExportFullReportPDF==='function');
 const results=[]; function check(n,v){results.push([n,!!v]);console.log((v?'PASS ':'::error::FAIL ')+n)}
 // Exercise the unchanged navigation on desktop and phone before report tests.
 const navErrors=[]; page.on('pageerror', e=>navErrors.push(e.message));
 const expected=[['home','#/','الرئيسية'],['directory','#/home','دليل الخدمات'],['visitation','#/visitation','الافتقاد'],['bible','#/bible','الكتاب المقدس'],['admin','#/admin','الإدارة']];
 for (const viewport of [{width:1280,height:800},{width:375,height:812},{width:320,height:640}]) {
  await page.setViewportSize(viewport);
  for (const [tab,href] of expected) {
   await page.locator(`[data-tab="${tab}"]`).click();
   await page.waitForFunction(t=>document.querySelector(`[data-tab="${t}"]`).classList.contains('active'),tab);
   check(`navigation ${viewport.width} ${tab}`,await page.evaluate(([t,h])=>location.hash===h && document.querySelector(`[data-tab="${t}"]`).getAttribute('aria-current')==='page',[tab,href]));
   if (await page.locator('.pin-modal-backdrop .btn-cancel').count()) await page.locator('.pin-modal-backdrop .btn-cancel').click();
  }
  const geometry=await page.evaluate(()=>{
   const bar=document.querySelector('.tab-bar-inner'), items=[...bar.querySelectorAll('.tab-item')], rects=items.map(x=>x.getBoundingClientRect()), icons=items.map(x=>x.querySelector('svg').getBoundingClientRect());
   const labels=items.map(x=>x.querySelector('.tab-label'));
   return {equal:rects.every(r=>Math.abs(r.width-rects[0].width)<1 && r.height>=44), icons:icons.every(r=>r.width===19 && r.height===19), labels:labels.every(l=>getComputedStyle(l).whiteSpace==='nowrap' && l.scrollWidth<=l.parentElement.clientWidth+1), fit:bar.getBoundingClientRect().left>=0 && bar.getBoundingClientRect().right<=innerWidth && bar.getBoundingClientRect().bottom<=innerHeight, space:parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom)>=bar.getBoundingClientRect().height+10};
  });
  for(const [k,v] of Object.entries(geometry)) check(`navigation ${viewport.width} ${k}`,v);
 }
 check('navigation labels and order preserved',await page.evaluate(e=>JSON.stringify([...document.querySelectorAll('.tab-item')].map(a=>[a.dataset.tab,a.getAttribute('href'),a.querySelector('.tab-label').textContent.trim()]))===JSON.stringify(e),expected));
 check('navigation no page errors',navErrors.length===0);
 await page.setViewportSize({width:1280,height:800});
 // Appearance is local, starts light, and can be switched from Administration.
 check('appearance defaults to light',await page.evaluate(()=>document.documentElement.dataset.appearance==='light'));
 await page.evaluate(()=>renderAdminPanel());
 for(const mode of ['dark','light','dark']) {
  await page.locator(`[data-appearance-choice="${mode}"]`).click();
  check(`appearance switch ${mode}`,await page.evaluate(m=>document.documentElement.dataset.appearance===m && localStorage.getItem('church_appearance')===m && document.querySelector(`[data-appearance-choice="${m}"]`).getAttribute('aria-pressed')==='true',mode));
 }
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof MembersDB!=='undefined');
 check('dark appearance survives reload',await page.evaluate(()=>document.documentElement.dataset.appearance==='dark'));
 await page.evaluate(()=>renderAdminPanel());
 check('dark surfaces and button identities',await page.evaluate(()=>{
  const panel=getComputedStyle(document.querySelector('.admin-panel')).backgroundColor;
  const primary=getComputedStyle(document.querySelector('.btn-primary')).backgroundImage;
  const gold=getComputedStyle(document.querySelector('.btn-gold')).backgroundImage;
  const danger=getComputedStyle(document.querySelector('.btn-danger')).backgroundImage;
  return panel.includes('42, 51, 61') && primary!==gold && danger!==primary && danger!==gold;
 }));
 await page.locator('[data-appearance-choice="light"]').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof MembersDB!=='undefined');
 check('light appearance survives reload',await page.evaluate(()=>document.documentElement.dataset.appearance==='light'));
 await page.evaluate(async()=>{
  const old=await MembersDB.getAll(); for(const m of old) await MembersDB.remove(m.id);
  for(let i=1;i<=30;i++) await MembersDB.put({id:i,name:'اسم '+i,phone1:'01000111111',street:'شارع',locationLink:'x',sector:i<=15?'قطاع أ':'قطاع ب',stage:'مرحلة ١',city:'المنيا',neighborhood:i<=10?'حي أول':'حي ثان',class:i<=15?'فصل ألف':'فصل باء',visits:i%2?['2026-11-01']:[],attendance:[{date:'2026-10-01',present:i%2===1}]});
  window.__reports=[];window.__pdfs=[];
  _loadPdfLibs=async()=>{}; window.jspdf={jsPDF:class{save(n){window.__pdfs.push(n)}}};
  _pdfRenderPages=async(pdf,pages)=>{ window.__reports.push(pages); };
  sessionStorage.setItem('perf_unlocked_role','amin');
 });
 await page.evaluate(async()=>renderHome());
 for (const viewport of [{width:1280,height:800},{width:375,height:812}]) {
  await page.setViewportSize(viewport);
  for (const mode of ['light','dark']) {
   await page.evaluate(m=>{setChurchAppearance(m);location.hash='#/home'},mode);
   await page.waitForSelector('.nav-grid .nav-card');
   check(`directory eight cards ${viewport.width} ${mode}`,await page.evaluate(()=>{
    const a=[...document.querySelectorAll('.nav-grid .nav-card')];
    return a.length===8 && a.every(x=>x.getBoundingClientRect().width>0 && x.getBoundingClientRect().height>=44 && x.querySelector('span:last-child').getBoundingClientRect().width<=x.clientWidth+1);
   }));
   for (const href of ['#/browse/sector','#/browse/neighborhood','#/browse/stage','#/browse/city','#/birthdays','#/attendance','#/iftiqad','#/performance']) {
    await page.evaluate(()=>{ location.hash='#/home'; });
    await page.waitForSelector('.nav-grid a');
    await page.locator(`.nav-grid a[href="${href}"]`).click();
    check(`directory destination ${mode} ${href}`,await page.evaluate(h=>location.hash===h,href));
    await page.waitForFunction(()=>!document.querySelector('.nav-grid'));
    if (await page.locator('.pin-modal-backdrop .btn-cancel').count()) await page.locator('.pin-modal-backdrop .btn-cancel').click();
   }
   await page.evaluate(()=>{ location.hash='#/home'; });
   await page.waitForSelector('#homeSearchInput');
   await page.locator('#homeSearchInput').fill('اسم 1');
   await page.waitForSelector('#homeSearchResults .member-card');
   await page.locator('#homeSearchResults .member-card').first().click();
   check(`beneficiary profile ${viewport.width} ${mode}`,await page.evaluate(()=>location.hash.startsWith('#/member/')));
   await page.waitForSelector('.profile-header');
  }
 }
 await page.setViewportSize({width:1280,height:800});
 await page.evaluate(()=>{setChurchAppearance('light');return renderHome()});
 check('appearance interactions no page errors',navErrors.length===0);
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
  const periodHidden=document.querySelector('#perfPeriodPanel').hidden && document.querySelector('#perfPeriodToggle').getAttribute('aria-expanded')==='false';
  document.querySelector('#perfPeriodToggle').click();
  const periodOpened=!document.querySelector('#perfPeriodPanel').hidden;
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
  const desktopTable=document.querySelector('.perf-incomplete-wrap');
  const desktopFit=desktopTable.scrollWidth<=desktopTable.clientWidth && !!desktopTable.querySelector('.perf-incomplete-pick') && !!desktopTable.querySelector('.perf-actions button') && !!desktopTable.querySelector('.perf-member-link');
  const table=desktopTable.querySelector('table');
  const tableWidth=table.getBoundingClientRect().width, wrapperWidth=desktopTable.getBoundingClientRect().width;
  const heads=table.querySelectorAll('thead th');
  const desktopProportions=Math.abs(tableWidth-wrapperWidth)<4 && heads[3].offsetWidth>heads[1].offsetWidth && heads[3].offsetWidth>heads[2].offsetWidth && [...desktopTable.querySelectorAll('.perf-missing-list')].every(list=>getComputedStyle(list).flexWrap==='wrap' && list.scrollWidth<=list.clientWidth);
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
  const originalPdf=simpleTablePdf; const exports=[]; simpleTablePdf=async o=>exports.push(o);
  const exportedLevels=[]; const exportPanelClean=[];
  for (const [tab,label] of [['sectors','القطاع'],['stages','المرحلة'],['cities','المدينة'],['neighborhoods','الحي'],['classes','القطاع · الفصل']]) {
    await renderPerformance({tab});
    const button=document.querySelector('#perfLevelExport'), wrapper=button.parentElement, style=getComputedStyle(wrapper);
    exportPanelClean.push(wrapper.children.length===1 && style.backgroundColor==='rgba(0, 0, 0, 0)' && style.borderTopWidth==='0px' && button.textContent.includes('تصدير الجدول PDF'));
    button.click(); await new Promise(resolve=>setTimeout(resolve,30));
    const result=exports[exports.length-1];
    exportedLevels.push(result.subtitle===label && result.rows[result.rows.length-1][1]==='20' && result.rows[result.rows.length-1][4]==='4' && result.rows[result.rows.length-1][5]==='16');
  }
  await renderPerformance({tab:'sectors',visit:'visited',group:'أ'});
  document.querySelector('#perfLevelDrillExport').click(); await new Promise(resolve=>setTimeout(resolve,30));
  const drillPdf=exports[exports.length-1];
  const drillExport=drillPdf.rows.length===3 && drillPdf.rows.every(row=>row[0].includes('اختبار'));
  sessionStorage.setItem('perf_unlocked_role','khadim');
  await renderPerformance({tab:'classes'}); document.querySelector('#perfLevelExport').click(); await new Promise(resolve=>setTimeout(resolve,30));
  const servantExport=exports[exports.length-1].headers.length===6;
  sessionStorage.setItem('perf_unlocked_role','amin'); simpleTablePdf=originalPdf;
  sessionStorage.removeItem('perf_period_start'); sessionStorage.removeItem('perf_period_end');
  await perfExportFullReportPDF(items);
  const history=document.createElement('div'); history.innerHTML=__reports[__reports.length-1].join('');
  const historyRow=history.querySelector('tbody tr');
  const allHistory=historyRow.cells[2].textContent.trim()==='20' && historyRow.cells[4].textContent.trim()==='20';
  for (const m of items) await MembersDB.remove(m.id);
  for (const m of original) await MembersDB.put(m);
  sessionStorage.removeItem('perf_period_start');sessionStorage.removeItem('perf_period_end');
  return {total,missing,levels,dashboard,drill,rows,grouped,highlighted,periodUI,visit,incompleteOK,noDenominator,independence,sections,bounds,classGroups,visitDashboard,aminIncomplete,servantOK,servantIncomplete,periodHidden,periodOpened,desktopFit,desktopProportions,exportedLevels,exportPanelClean,drillExport,servantExport,allHistory};
 });
 check('20 registered: 4 present, 16 absent, 20% and 80%',calculation.total.count===20 && calculation.total.present===4 && calculation.total.absent===16 && calculation.total.pctPresent===20 && calculation.total.pctAbsent===80);
 check('no attendance yields all absent',calculation.missing.present===0 && calculation.missing.absent===2 && calculation.missing.pctAbsent===100);
 check('period panel starts hidden and opens',calculation.periodHidden && calculation.periodOpened);
  check('reporting period selection is applied',calculation.periodUI);
 check('unfiltered PDF includes all history',calculation.allHistory);
 check('incomplete table fits desktop',calculation.desktopFit);
 check('desktop columns use width and badges wrap',calculation.desktopProportions);
 check('level export buttons have no white panel',calculation.exportPanelClean.every(Boolean));
 check('all five level exports match dashboard',calculation.exportedLevels.every(Boolean));
 check('filtered drill-down exports only its members',calculation.drillExport);
 check('servant class export excludes restricted metrics',calculation.servantExport);
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
 await page.evaluate(async()=>{await MembersDB.put({id:999,name:'مخدوم ناقص البيانات',sector:'قطاع أ',class:'فصل ألف',attendance:[],visits:[]});location.hash='#/performance?tab=incomplete'});
 await page.waitForSelector('.perf-incomplete-pick');
 check('mobile incomplete cards do not scroll horizontally',await page.locator('.perf-incomplete-wrap').evaluate(e=>e.scrollWidth<=e.clientWidth));
 check('mobile incomplete cards retain actions and data',await page.evaluate(()=>{const row=document.querySelector('.perf-incomplete-pick').closest('tr');return !!row.querySelector('.perf-member-link') && !!row.querySelector('.perf-missing-cell') && row.querySelectorAll('.perf-actions .btn').length===2}));
 await page.locator('.perf-incomplete-pick').last().check();
 check('mobile incomplete selection works',await page.locator('#perfIncompleteSelectedCount').innerText()!=='0 محدد');
 check('mobile badges wrap without overflow',await page.locator('.perf-missing-list').last().evaluate(e=>getComputedStyle(e).flexWrap==='wrap' && e.scrollWidth<=e.clientWidth));
 check('mobile action buttons are touch friendly',await page.locator('.perf-incomplete-actions .btn').last().evaluate(e=>e.offsetHeight>=44));
 await page.locator('.perf-incomplete-actions .perf-edit-btn').last().click();
 check('mobile edit remains available',await page.locator('#perfModalClose').isVisible());
 await page.locator('#perfModalClose').click();
 console.log(`RESULT ${results.filter(x=>x[1]).length}/${results.length}`);await browser.close();process.exit(results.some(x=>!x[1])?1:0);
})().catch(e=>{console.log('::error::'+String(e).replace(/\n/g,' '));process.exit(2)});
