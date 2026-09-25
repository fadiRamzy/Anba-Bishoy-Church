#!/usr/bin/env node
/* ==========================================================================
   scripts/sync-web.js — populate www/ (the Capacitor webDir) from the
   website sources at the repo root.

   www/ is a GENERATED build artifact (git-ignored): it is rebuilt from
   scratch on every run, then `npx cap sync android` copies it into the
   Android project. The repo-root website files are never modified.

   Android-only transforms applied to the www/ COPY (website untouched):
   1. Injects <script src="capacitor-bridge.js"> into www/index.html so the
      native back-button / download / APK bridge loads inside the app only.
   2. Strips the two Cloudflare challenge <script> blocks that were saved
      into index.html by mistake — they only 404 inside the app.

   The service-worker registration is deliberately LEFT IN PLACE in the www/
   copy: inside the app the worker mirrors the live website (see
   service-worker.js), which is what lets a web deploy reach installed apps
   without building a new APK. Bundled files stay as the offline fallback.

   Usage:  npm run sync:web
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

/* Top-level entries that must NOT ship inside the app bundle. */
const EXCLUDED = new Set([
  '.git',
  '.github',
  '.tooling',
  'android',
  'ios',
  'node_modules',
  'www',
  'assets', // icon/splash sources for native projects — not web content
  'scripts',
  'telegram-relay', // Cloudflare Worker (server side) — never loaded by index.html
  'package.json',
  'package-lock.json',
  'capacitor.config.json',
  '.gitignore',
  'test-import.js', // node verification harnesses, not app code
  'test-bridge.js',
]);

function isExcludedTopLevel(name) {
  if (EXCLUDED.has(name)) return true;
  if (name.startsWith('.')) return true; // any other dotfile
  if (name.toLowerCase().endsWith('.md')) return true; // docs (e.g. RELEASE.md)
  if (name.toLowerCase().endsWith('.apk')) return true; // app packages are served by the site, never bundled in it
  return false;
}

function copyTree() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(WWW, { recursive: true });
  const copied = [];
  for (const entry of fs.readdirSync(ROOT)) {
    if (isExcludedTopLevel(entry)) continue;
    const src = path.join(ROOT, entry);
    const dest = path.join(WWW, entry);
    fs.cpSync(src, dest, { recursive: true });
    copied.push(entry);
  }
  return copied;
}

/* --- www/index.html transforms (Android app copy only) --- */
function transformIndexHtml() {
  const file = path.join(WWW, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const notes = [];

  // 1. Inject the native bridge before the first app script.
  const bridgeTag = '<script src="capacitor-bridge.js?v=1"></script>';
  if (!html.includes('capacitor-bridge.js')) {
    const anchor = '<script src="db.js';
    if (!html.includes(anchor)) throw new Error('index.html: anchor for bridge injection not found');
    html = html.replace(anchor, `${bridgeTag}\n${anchor}`);
    notes.push('injected capacitor-bridge.js script tag');
  }

  // 2. Strip Cloudflare challenge scripts accidentally saved into index.html.
  const cfPattern = /<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/g;
  const cfMatches = html.match(cfPattern) || [];
  if (cfMatches.length > 0) {
    html = html.replace(cfPattern, '');
    notes.push(`stripped ${cfMatches.length} Cloudflare challenge script(s)`);
  }

  fs.writeFileSync(file, html);
  return notes;
}

function verify() {
  const required = [
    'index.html',
    'app.js',
    'app-shell.js',
    'db.js',
    'styles.css',
    'service-worker.js',
    'seed.json',
    'capacitor-bridge.js',
    'logo.jpg',
    'site-bg.jpg',
    'hero.webp',
    'bible/bible.js',
    'bible/metadata.json',
    'calendar/coptic-calendar.js',
    'calendar/calendar.css',
    'vendor/jspdf.umd.min.js',
    'vendor/html2canvas.min.js',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(WWW, rel)));
  if (missing.length > 0) {
    throw new Error(`www/ verification failed, missing: ${missing.join(', ')}`);
  }
  // The www copy must reference the bridge; the root website must NOT.
  const wwwHtml = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const rootHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!wwwHtml.includes('capacitor-bridge.js')) throw new Error('www/index.html missing bridge tag');
  if (rootHtml.includes('capacitor-bridge.js')) {
    throw new Error('root index.html must stay untouched (bridge tag leaked into website)');
  }
  if (wwwHtml.includes('contentDocument')) throw new Error('www/index.html still contains CF scripts');
  // The app must keep the worker registered — it is the live-site mirror.
  if (wwwHtml.includes('__capSWGuard')) {
    throw new Error('www/index.html still no-ops the service-worker registration');
  }
}

function main() {
  const copied = copyTree();
  const notes = transformIndexHtml();
  verify();
  console.log(`www/ rebuilt from repo root (${copied.length} top-level entries):`);
  for (const entry of copied) console.log(`  + ${entry}`);
  for (const note of notes) console.log(`  * ${note}`);
  console.log('www/ verification: OK');
}

main();
