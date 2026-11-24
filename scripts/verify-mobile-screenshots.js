/* Compare mobile rendering with the approved pre-change snapshot. */
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const baseline = 'bdc9a60';
const files = ['index.html','styles.css','appearance.css','performance.js','app.js','app-shell.js','service-worker.js'];
const old = Object.fromEntries(files.map(f => [f, execFileSync('git',['show',`${baseline}:${f}`])]));
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  for (const width of [360,390,430]) for (const mode of ['light','dark']) {
    const images=[];
    for (const previous of [true,false]) {
      const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
      await context.addInitScript(m=>localStorage.setItem('church_appearance',m),mode);
      if (previous) await context.route('http://127.0.0.1:4173/**', async route=>{
        const file=new URL(route.request().url()).pathname.slice(1) || 'index.html';
        if (!old[file]) return route.continue();
        await route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript',body:old[file]});
      });
      const page=await context.newPage();
      await page.goto('http://127.0.0.1:4173/#/home',{waitUntil:'load'});
      await page.waitForFunction(()=>typeof MembersDB!=='undefined' && typeof renderHome==='function');
      await page.evaluate(async()=>{await document.fonts.ready;await renderHome();});
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .app-bar{visibility:hidden!important}'});
      await page.waitForTimeout(300);
      images.push(await page.screenshot({animations:'disabled'}));
      await context.close();
    }
    if (!images[0].equals(images[1])) {
      const probe=await browser.newPage();
      const diff=await probe.evaluate(async ([a,b])=>{
        const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
        const [ia,ib]=await Promise.all([load(a),load(b)]), canvas=document.createElement('canvas');canvas.width=ia.width;canvas.height=ia.height;const ctx=canvas.getContext('2d');
        ctx.drawImage(ia,0,0);const x=ctx.getImageData(0,0,canvas.width,canvas.height).data;ctx.drawImage(ib,0,0);const y=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let count=0,left=canvas.width,right=0,top=canvas.height,bottom=0;
        for(let p=0;p<x.length;p+=4) if(x[p]!==y[p]||x[p+1]!==y[p+1]||x[p+2]!==y[p+2]) {const n=p/4, xx=n%canvas.width, yy=Math.floor(n/canvas.width);count++;left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);}
        return {count,left,right,top,bottom,total:canvas.width*canvas.height};
      },images.map(i=>'data:image/png;base64,'+i.toString('base64')));
      await probe.close();
      if (diff.count > diff.total * .001) throw new Error(`mobile screenshot differs at ${width}px ${mode}: ${JSON.stringify(diff)}`);
      console.log(`Minor rendering noise: ${diff.count} pixels of ${diff.total}`);
    }
    console.log(`PASS unchanged mobile content screenshot (header excluded) ${width}px ${mode}`);
  }
  await browser.close();
})().catch(e=>{console.error(e);console.log('::error::'+String(e));process.exit(1)});
