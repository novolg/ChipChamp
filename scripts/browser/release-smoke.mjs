import { browser, wait, check } from './cdp.mjs';

const url = process.env.APP_URL ?? 'http://127.0.0.1:5188/';
const b = await browser();
const pages = [];
async function page(width = 1440) {
  const p = await b.page(); pages.push(p);
  await p.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 761 });
  return p;
}
async function open(p) {
  await p.send('Page.navigate', { url });
  await p.until("!!document.querySelector('.lobby')");
  await p.evaluate("(async()=>{const module=async path=>import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path);window.gs=(await module('/src/ui/store/gameStore.ts')).useGameStore;window.ss=(await module('/src/ui/store/settingsStore.ts')).useSettingsStore;window.ns=(await module('/src/ui/store/navStore.ts')).useNavStore;window.ps=(await module('/src/ui/store/progressStore.ts')).useProgressStore})()");
}
async function table(p, renderer = 'full') {
  await p.until('gs.getState().hasTableControl');
  await p.evaluate(`ss.getState().set('renderer',${JSON.stringify(renderer)});ss.getState().set('reducedMotion','system');gs.getState().newGame('medium','Ben');ns.getState().go({name:'free'})`);
  await p.until("!!document.querySelector('.play-controls')");
}
try {
  // Missing model / repeated context-loss fallback.
  const p = await page();
  await p.send('Network.enable');
  await p.send('Network.setBlockedURLs', { urls: ['*.glb'] });
  await open(p); await table(p);
  await p.until("!!document.querySelector('.scene-canvas canvas')");
  await p.until("!!document.querySelector('.scene-seat .bp:not(.bp-3d) img')");
  check(true, 'Missing models use portraits');
  const state = await p.evaluate('JSON.stringify(gs.getState().game)');
  for (let i = 0; i < 2; i++) {
    await p.until("!!document.querySelector('.scene-canvas canvas')");
    await p.evaluate("document.querySelector('.scene-canvas canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}))");
  }
  await p.until("!document.querySelector('.scene-stage')");
  check(await p.evaluate('JSON.stringify(gs.getState().game)') === state, 'Context loss preserves game state');

  // Save action journal, fail the final receipt write, then recover on reload.
  const count = await p.evaluate('ps.getState().progress.freePlayStats.handsPlayed');
  await p.evaluate("window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='chipchamp.table.v1'&&JSON.parse(v).recorded)throw Error('injected final write failure');return originalSet.call(this,k,v)};gs.getState().playerAction({type:'fold',seatId:0})");
  check(await p.evaluate('ps.getState().progress.freePlayStats.handsPlayed') === count + 1, 'Hand recorded before interrupted final write');
  await p.send('Page.reload'); await p.until("!!document.querySelector('.lobby')"); await open(p);
  await p.until('gs.getState().hasTableControl');
  await p.click('RETURN TO TABLE'); await p.until("!!document.querySelector('.play-controls')");
  check(await p.evaluate('ps.getState().progress.freePlayStats.handsPlayed') === count + 1, 'Recovery does not duplicate statistics');
  await p.until("!!document.querySelector('.coach-decision-review')");
  check(true, 'Decision review survives reload');

  // Tab ownership and handover use the real browser lock service.
  const second = await page(); await open(second);
  check(await second.evaluate('!gs.getState().hasTableControl'), 'Second tab cannot control table');
  const waiting = await second.evaluate('JSON.stringify(gs.getState().game)');
  await second.evaluate('gs.getState().newGame()');
  check(await second.evaluate('JSON.stringify(gs.getState().game)') === waiting, 'Second tab cannot replace saved game');
  await p.close(); await second.until('gs.getState().hasTableControl');
  check(await second.evaluate('gs.getState().game.phase===\'handComplete\''), 'Ownership handover restores latest hand');
  await second.close();

  // No WebGL: exercise native controls rather than only inspecting a tier flag.
  const dom = await page();
  await dom.send('Page.addScriptToEvaluateOnNewDocument', { source: "const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args)}" });
  await open(dom); await table(dom, 'auto');
  await dom.until("!!document.querySelector('.play-controls button')");
  check(await dom.evaluate("!document.querySelector('.scene-stage')&&!document.querySelector('.bp3d')"), 'No WebGL starts playable DOM table');
  await dom.click('FOLD'); await dom.until("gs.getState().game.phase==='handComplete'");
  await dom.close();

  // Mobile resource policy, resize and keyboard settings confirmation.
  const mobile = await page(360);
  await mobile.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mobileStart = Date.now();
  await open(mobile); await table(mobile, 'auto');
  await mobile.until("!!document.querySelector('.scene-canvas canvas')");
  console.log('INFO mobile table ready with 4x CPU throttle:', Date.now() - mobileStart, 'ms (headless desktop emulation)');
  await mobile.until("!!document.querySelector('.bp3d canvas')");
  check(await mobile.evaluate("performance.getEntriesByType('resource').some(e=>e.name.endsWith('.glb'))"), 'Mobile auto mode loads 3D avatars');
  await mobile.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await mobile.until("!!document.querySelector('[data-avatar-status=\"3D · motion reduced\"] .bp3d canvas')");
  check(true, 'System reduced motion keeps the 3D model');
  await mobile.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const canvasCount = await mobile.evaluate("document.querySelectorAll('canvas').length");
  await mobile.evaluate("(async()=>{for(let i=0;i<30;i++){gs.getState().newGame('medium','Ben');gs.getState().playerAction({type:'fold',seatId:0});await new Promise(r=>setTimeout(r,25));}})()");
  check(await mobile.evaluate("document.querySelectorAll('canvas').length") === canvasCount, '30 consecutive rounds do not accumulate canvases');
  await mobile.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  for (const width of [360, 390, 760, 844]) {
    await mobile.send('Emulation.setDeviceMetricsOverride', { width, height: width > 760 ? 390 : 844, deviceScaleFactor: 1, mobile: true });
    await wait(150);
    check(await mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'), `${width}px layout fits viewport`);
  }
  await mobile.evaluate("document.querySelector('.settings-toggle').click()");
  await mobile.until("!!document.querySelector('.settings-modal')");
  await mobile.click('RESET PROGRESS');
  check(await mobile.evaluate("document.activeElement.textContent.includes('KEEP PROGRESS')"), 'Reset confirmation focuses safe option');
  await mobile.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await mobile.until("document.activeElement.textContent.includes('RESET PROGRESS')");
  await mobile.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await mobile.until("document.activeElement.classList.contains('settings-toggle')");
  check(true, 'Escape cancels confirmation and returns focus');
  check(pages.every(p => p.errors.length === 0), 'No uncaught browser exceptions');
} finally { await b.close(); }
