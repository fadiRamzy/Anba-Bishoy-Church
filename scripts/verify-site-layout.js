/* Whole-site desktop layout and header appearance control checks. */
const { chromium } = require('playwright-core');
(async () => {
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof MembersDB!=='undefined' && typeof VisitationAuth!=='undefined');
 await page.evaluate(()=>{const sheet=[...document.styleSheets].find(s=>s.href && s.href.includes('styles.css'));const rule=[...sheet.cssRules].find(r=>r.conditionText && r.conditionText.includes('min-width: 1024px') && r.conditionText.includes('pointer: fine'));if(!matchMedia('(hover: hover) and (pointer: fine)').matches){const style=document.createElement('style');style.textContent='@media (min-width: 1024px) {'+[...rule.cssRules].map(r=>r.cssText).join('')+'}';document.head.append(style)}});
 await page.evaluate(async()=>{
  localStorage.setItem(VisitationAuth.unlockedKey, VisitationAuth.todayStr());
  sessionStorage.setItem('admin_unlocked','1'); sessionStorage.setItem('perf_unlocked_role','amin');
  await MembersDB.put({id:998877,name:'اختبار العرض',sector:'قطاع أ',class:'فصل ألف',attendance:[],visits:[]});
 });
 const routes=[['home','#/','.service-wheel'],['directory','#/home','.nav-grid'],['add name','#/add','#memberForm'],['add family','#/visitation/add','#visitationForm'],['administration','#/admin','.appearance-panel'],['visitation data','#/visitation/data','#visitationExportBtn'],['visitation families','#/visitation/families','#filterNeighborhood'],['follow-up','#/iftiqad','#iftSector'],['performance','#/performance?tab=incomplete','.perf-incomplete-table'],['attendance','#/attendance','#attSectorSelect'],['profile','#/member/998877','.profile-header'],['Bible reader','#/bible/read/gen/1','.verse-list'],['calendar','#/bible/calendar','.cal-card']];
 function check(name,ok,detail) {if(!ok) throw new Error(name+' '+JSON.stringify(detail||''));console.log('PASS '+name);}
 for(const width of [1280,1440,1920,2560]) {
  await page.setViewportSize({width,height:900});
  for(const [name,hash,selector] of routes) {
   await page.evaluate(h=>{location.hash=h},hash);
   await page.waitForSelector(selector,{timeout:20000});
   await page.waitForSelector('#themeToggle');
   for(const mode of ['light','dark']) {
    await page.evaluate(m=>setChurchAppearance(m),mode);
    const info=await page.evaluate(()=>{
     const toggle=document.querySelector('#themeToggle'), b=toggle.getBoundingClientRect();
     const visible=[...document.querySelectorAll('.search-panel,.form-card,.admin-panel,.filter-bar,.profile-header,.info-section')].filter(e=>e.offsetWidth);
     const oversized=visible.filter(e=>e.offsetWidth > (e.matches('.search-panel')?760:e.matches('.admin-panel')?960:e.matches('.filter-bar')?1100:1160)+1).map(e=>[e.className,e.offsetWidth]);

     return {mode:document.documentElement.dataset.appearance, pressed:toggle.getAttribute('aria-pressed'), button:[b.width,b.height], visible:b.width>0 && b.left>=0 && b.right<=innerWidth, overflow:document.documentElement.scrollWidth>innerWidth+1, oversized};
    });
    check(`${width} ${name} ${mode} layout`,info.mode===mode && info.pressed===String(mode==='dark') && info.visible && Math.abs(info.button[0]-info.button[1])<1 && !info.overflow && !info.oversized.length,info);
    await page.locator('#themeToggle').click();
    check(`${width} ${name} ${mode} toggle`,await page.evaluate(m=>document.documentElement.dataset.appearance !== m && localStorage.getItem('church_appearance')===document.documentElement.dataset.appearance,mode));
   }
  }
 }
 await page.evaluate(()=>{location.hash='#/admin'});await page.waitForSelector('.appearance-panel');
 await page.evaluate(()=>setChurchAppearance('light'));await page.locator('#themeToggle').click();
 check('Administration selector follows header switch',await page.locator('[data-appearance-choice="dark"]').getAttribute('aria-pressed')==='true');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#themeToggle');
 check('header selection survives reload',await page.evaluate(()=>document.documentElement.dataset.appearance==='dark' && document.querySelector('#themeToggle').getAttribute('aria-pressed')==='true'));
 await page.locator('#adminToggle').click();
 // When already unlocked, the existing admin action locks; click again to open its dialog.
 if (!(await page.locator('.pin-modal-backdrop').count())) await page.locator('#adminToggle').click();
 await page.waitForSelector('.pin-modal-backdrop');
 check('existing admin dialog remains usable',await page.locator('.pin-modal-backdrop .btn-cancel').isVisible());
 await page.locator('.pin-modal-backdrop .btn-cancel').click();
 check('no uncaught page errors',errors.length===0,errors);
 await browser.close();
})().catch(e=>{console.log('::error::'+String(e).replace(/\n/g,' '));process.exit(1)});
