/* Exercise the installed debug APK in an Android emulator using its real WebView. */
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pkg = 'com.fadiramzy.anbabishoy';
function assert(ok, message) { if (!ok) throw new Error(message); console.log('PASS ' + message); }
async function open() {
  adb('shell', 'am', 'start', '-n', pkg + '/.MainActivity');
  let last;
  for (let i = 0; i < 40; i++) {
    try {
      const pid = adb('shell', 'pidof', pkg).split(/\s+/)[0];
      adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
      const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
      const pages = browser.contexts()[0].pages();
      if (pages.length) { const page = pages[0]; await page.waitForFunction(() => typeof MembersDB !== 'undefined', null, { timeout: 5000 }); return {browser, page}; }
      await browser.close();
    } catch (e) { last = e; }
    await pause(1500);
  }
  throw last || new Error('Android WebView not available');
}
(async () => {
  adb('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
  // Prove the APK's bundled copy works even without a deployed website.
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  let { browser, page } = await open();
  assert(await page.evaluate(() => location.protocol === 'https:' && location.hostname === 'localhost'), 'Android packaged origin');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { location.hash = '#/admin'; });
  await page.waitForSelector('[data-appearance-choice="dark"]');
  await page.locator('[data-appearance-choice="dark"]').click();
  assert(await page.evaluate(() => document.documentElement.dataset.appearance === 'dark' && localStorage.getItem('church_appearance') === 'dark'), 'Android selector saves dark');
  const dark = await page.evaluate(() => getComputedStyle(document.querySelector('.admin-panel')).backgroundColor);
  assert(dark.includes('38, 39, 42'), 'Android dark surfaces rendered');
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForSelector('.nav-grid');
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === 'dark'), 'Android directory uses dark mode');
  assert(errors.length === 0, 'Android WebView has no page errors');
  await browser.close();
  adb('shell', 'am', 'force-stop', pkg);
  ({browser, page} = await open());
  assert(await page.evaluate(() => document.documentElement.dataset.appearance === 'dark'), 'Android dark survives app restart');
  await page.evaluate(() => { location.hash = '#/admin'; });
  await page.waitForSelector('[data-appearance-choice="light"]');
  await page.locator('[data-appearance-choice="light"]').click();
  assert(await page.evaluate(() => document.documentElement.dataset.appearance === 'light' && localStorage.getItem('church_appearance') === 'light'), 'Android selector saves light');
  await browser.close();
  adb('shell', 'am', 'force-stop', pkg);
  ({browser, page} = await open());
  assert(await page.evaluate(() => document.documentElement.dataset.appearance === 'light'), 'Android light survives app restart');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
