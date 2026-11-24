/* Verify the deployed site, not the local server, after Pages updates. */
const { chromium } = require('playwright-core');
const url = 'https://fadiramzy.github.io/Anba-Bishoy-Church/';
const apk = 'https://github.com/fadiRamzy/Anba-Bishoy-Church/releases/download/android-latest/Anba-Bishoy-Church.apk';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let deployed = false;
  for (let i = 0; i < 60; i++) {
    try {
      const html = await (await fetch(url + '?verify=' + Date.now(), {cache:'no-store'})).text();
      const shell = await (await fetch(url + 'app-shell.js?verify=' + Date.now(), {cache:'no-store'})).text();
      if (html.includes('app-shell.js?v=3') && shell.includes('themeToggle')) { deployed = true; break; }
    } catch (_) { /* Pages may still be deploying. */ }
    await pause(5000);
  }
  if (!deployed) throw new Error('Updated Pages assets did not appear within five minutes');
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#themeToggle');
  for (const [hash, selector] of [['#/', '.service-wheel'], ['#/home','.nav-grid'], ['#/bible','.bible-home-grid'], ['#/bible/calendar','.cal-card'], ['#/admin','.appearance-panel']]) {
    await page.evaluate(h=>location.hash=h,hash);
    await page.waitForSelector(selector);
    if (!await page.locator('#themeToggle').isVisible()) throw new Error('Missing live toggle on '+hash);
    console.log('PASS live route and toggle '+hash);
  }
  await page.evaluate(()=>setChurchAppearance('light'));
  await page.locator('#themeToggle').click();
  if (!await page.evaluate(()=>document.documentElement.dataset.appearance==='dark' && localStorage.getItem('church_appearance')==='dark')) throw new Error('Live toggle did not save dark');
  if (await page.locator('[data-appearance-choice="dark"]').getAttribute('aria-pressed') !== 'true') throw new Error('Live Administration selector out of sync');
  if (await page.locator('#apkDownloadBtn').getAttribute('href') !== apk) throw new Error('Live Administration APK link is wrong');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#themeToggle');
  if (!await page.evaluate(()=>document.documentElement.dataset.appearance==='dark')) throw new Error('Live dark preference did not persist');
  await page.locator('#themeToggle').click();
  if (!await page.evaluate(()=>document.documentElement.dataset.appearance==='light')) throw new Error('Live toggle did not restore light');
  console.log('PASS live toggle, persistence, Administration selector and APK link');
  await browser.close();
})().catch(e=>{console.error(e);console.log('::error::'+String(e).replace(/\n/g,' '));process.exit(1)});
