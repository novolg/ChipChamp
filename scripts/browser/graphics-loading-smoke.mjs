import { browser, check, wait } from './cdp.mjs';
const url = process.env.APP_URL ?? 'http://127.0.0.1:5189/';

for (const scenario of ['chunk-failure', 'slow-texture']) {
  const b = await browser();
  try {
    const p = await b.page();
    const paused = [];
    if (scenario === 'chunk-failure') {
      await p.send('Network.enable');
      await p.send('Network.setBlockedURLs', { urls: ['*TableScene-*.js'] });
    } else {
      p.on('Fetch.requestPaused', ({ requestId }) => paused.push(requestId));
      await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/noise.png' }] });
    }
    await p.send('Page.navigate', { url });
    await p.until("!!document.querySelector('.lobby')");
    await p.click('PLAY AVA');
    await p.until("!!document.querySelector('.play-controls')");
    const hand = await p.evaluate("localStorage.getItem('chipchamp.table.v1')");
    if (scenario === 'slow-texture') {
      await p.until("!!document.querySelector('.scene-stage')");
      await p.until("!document.querySelector('.scene-stage')", 18000);
      check(paused.length > 0, 'Texture request really stayed pending');
    }
    await p.until("document.querySelectorAll('.hero-cards .pcard:not(.pcard-empty)').length===2");
    check(await p.evaluate("localStorage.getItem('chipchamp.table.v1')") === hand, `${scenario}: fallback preserves the hand`);
    for (const requestId of paused) await p.send('Fetch.continueRequest', { requestId });
    if (scenario === 'slow-texture') {
      await wait(2500);
      check(await p.evaluate("!document.querySelector('.scene-stage')&&!document.querySelector('.scene-canvas canvas')"), 'Late graphics do not replace the fallback');
    }
    await p.click('FOLD');
    await p.until("!!document.querySelector('.coach-decision-review')");
    check(true, `${scenario}: native controls finish the hand`);
  } finally { await b.close(); }
}
