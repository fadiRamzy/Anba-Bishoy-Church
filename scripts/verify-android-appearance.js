/* Exercise the installed debug APK in the Android emulator's actual WebView. */
const { execFileSync } = require('child_process');
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pkg = 'com.fadiramzy.anbabishoy';
function assert(ok, message) { if (!ok) throw new Error(message); console.log('PASS ' + message); }
async function open() {
  adb('shell', 'am', 'start', '-n', pkg + '/.MainActivity');
  let last;
  for (let i = 0; i < 50; i++) {
    try {
      const pid = adb('shell', 'pidof', pkg).split(/\s+/)[0];
      adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
      const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
      const target = targets.find(t => t.type === 'page');
      if (!target) throw new Error('no Android WebView page');
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
      let seq = 0; const pending = new Map(); const errors = [];
      socket.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
        if (!msg.id || !pending.has(msg.id)) return;
        const {resolve, reject} = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      };
      const send = (method, params={}) => new Promise((resolve,reject) => {
        const id=++seq; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));
      });
      await send('Runtime.enable');
      const evaluate = async expression => {
        const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
      };
      const wait = async expression => {
        for (let n=0;n<40;n++) { if (await evaluate(expression)) return; await pause(500); }
        throw new Error('Timed out waiting for ' + expression);
      };
      try {
        await wait("typeof MembersDB !== 'undefined' && !!document.querySelector('#tabBar') && !!document.querySelector('#themeToggle')");
      } catch (error) {
        const diagnostics = await evaluate(`(async () => ({url: location.href, ready: document.readyState, html: !!document.querySelector('#topNav'), shell: [...document.scripts].map(s => s.src).filter(s => s.includes('app-shell')), shellText: (await (await fetch('app-shell.js?v=3')).text()).includes('themeToggle'), worker: !!navigator.serviceWorker.controller, caches: await caches.keys()}))()`);
        socket.close();
        throw new Error(error.message + ' diagnostics=' + JSON.stringify(diagnostics));
      }
      return {socket, evaluate, wait, errors};
    } catch (e) { last = e; if (String(e).includes("diagnostics=")) throw e; }
    await pause(1500);
  }
  throw last || new Error('Android WebView not available');
}
async function checkPages(web, mode) {
  for (const [hash, selector] of [
    ['#/', '.landing-card'], ['#/home', '.nav-grid'], ['#/add', '.form-card'],
    ['#/bible', '.bible-home-grid'], ['#/iftiqad', '.ift-filter-bar'],
    ['#/performance', '.perf-gate'], ['#/admin', '.appearance-panel']
  ]) {
    await web.evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await web.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    assert(await web.evaluate(`document.documentElement.dataset.appearance === ${JSON.stringify(mode)} && !!document.querySelector('#themeToggle')`), `Android ${mode} ${hash} header toggle`);
  }
}
(async () => {
  adb('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  let web = await open();
  assert(await web.evaluate("location.protocol === 'https:' && location.hostname === 'localhost'"), 'Android packaged origin');
  await web.wait("!!document.querySelector('#themeToggle')");
  await web.evaluate("document.querySelector('#themeToggle').click()");
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'dark' && localStorage.getItem('church_appearance') === 'dark'"), 'Android header toggle saves dark');
  await web.evaluate("document.querySelector('#themeToggle').click()");
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'light'"), 'Android header toggle switches back to light');
  await web.evaluate("location.hash = '#/admin'");
  await web.wait("!!document.querySelector('[data-appearance-choice=dark]')");
  await web.evaluate("document.querySelector('[data-appearance-choice=dark]').click()");
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'dark' && localStorage.getItem('church_appearance') === 'dark'"), 'Android selector saves dark');
  assert(await web.evaluate("getComputedStyle(document.querySelector('.admin-panel')).backgroundColor.includes('55, 41, 35')"), 'Android dark surfaces rendered');
  await web.evaluate("location.hash = '#/home'");
  await web.wait("!!document.querySelector('.nav-grid')");
  assert(await web.evaluate("getComputedStyle(document.documentElement).colorScheme === 'dark'"), 'Android directory uses dark mode');
  await checkPages(web, 'dark');
  assert(web.errors.length === 0, 'Android WebView has no page errors');
  web.socket.close(); adb('shell', 'am', 'force-stop', pkg);
  web = await open();
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'dark'"), 'Android dark survives app restart');
  await web.evaluate("location.hash = '#/admin'");
  await web.wait("!!document.querySelector('[data-appearance-choice=light]')");
  await web.evaluate("document.querySelector('[data-appearance-choice=light]').click()");
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'light' && localStorage.getItem('church_appearance') === 'light'"), 'Android selector saves light');
  await checkPages(web, 'light');
  web.socket.close(); adb('shell', 'am', 'force-stop', pkg);
  web = await open();
  assert(await web.evaluate("document.documentElement.dataset.appearance === 'light'"), 'Android light survives app restart');
  web.socket.close();
})().catch(e => { console.error(e); console.log('::error::Android appearance test: ' + String(e.stack || e).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')); process.exit(1); });
