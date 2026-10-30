import { browser, check } from './cdp.mjs';

// UI-only: runs against dist without importing development source modules.
const url = process.env.APP_URL ?? 'http://127.0.0.1:5189/';
const b = await browser();
try {
  const p = await b.page();
  await p.send('Page.navigate', { url });
  await p.until("!!document.querySelector('.lobby')");
  await p.click('TAKE YOUR FIRST LESSON');
  await p.until("!!document.querySelector('.lesson')");
  await p.click('Path');
  await p.until("!!document.querySelector('.lobby')");
  await p.click('PLAY TODAY’S CHALLENGE');
  await p.until("document.body.innerText.includes('Seven cards. Your best five.')");
  await p.click('Back to the club');
  await p.until("!!document.querySelector('.lobby')");
  await p.click('PLAY AVA');
  await p.until("!!document.querySelector('.play-controls')");
  await p.until("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('FOLD')&&!b.disabled)");
  await p.click('FOLD');
  await p.until("!!document.querySelector('.coach-decision-review')");
  await p.send('Page.reload');
  await p.until("!!document.querySelector('.lobby')");
  await p.click('RETURN TO TABLE');
  await p.until("!!document.querySelector('.coach-decision-review')");
  check(p.errors.length === 0, 'Production lesson, daily puzzle, game and saved review load without exceptions');
  await p.close();

  const failed = await b.page();
  await failed.send('Network.enable');
  await failed.send('Network.setBlockedURLs', { urls: ['*LessonScreen-*.js'] });
  await failed.send('Page.navigate', { url });
  await failed.until("!!document.querySelector('.lobby')");
  // A completed game is shared in this isolated context; use the lesson trail.
  await failed.click('How a Hand Works');
  await failed.until("document.body.innerText.includes('This screen couldn’t open.')");
  await failed.click('BACK TO THE CLUB');
  await failed.until("!!document.querySelector('.lobby')");
  check(true, 'Failed route download offers working return to club');
} finally { await b.close(); }
