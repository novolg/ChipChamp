import { browser, check } from './cdp.mjs';
const b = await browser();
const url = process.env.APP_URL ?? 'http://127.0.0.1:5188/';
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const p = await b.page();
    await p.send('Page.navigate', { url });
    await p.until("!!document.querySelector('.lobby')");
    await p.evaluate("(async()=>{const path='/src/ui/store/progressStore.ts';window.ps=(await import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path)).useProgressStore})()");
    pages.push(p);
  }
  const [first, second] = pages;
  await first.evaluate("ps.getState().record({type:'lessonCompleted',lessonId:'rules-basics'})");
  await second.until("ps.getState().progress.completedLessonIds.includes('rules-basics')");
  await second.evaluate("ps.getState().record({type:'lessonCompleted',lessonId:'hand-rankings'})");
  await first.until('ps.getState().progress.completedLessonIds.length===2');
  check(true, 'Completed lessons synchronize in both directions');
  await second.evaluate('ps.getState().reset()');
  await first.until('ps.getState().progress.completedLessonIds.length===0');
  check(true, 'Reset reaches another open tab');
  await first.evaluate("window.write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pokergame.progress.v1')throw Error('quota');return write.call(this,k,v)};ps.getState().record({type:'quizAttempted',quizId:'quiz-rankings',score:0.5})");
  await first.until("document.body.innerText.includes('Your latest progress couldn’t be saved.')");
  await second.evaluate("ps.getState().record({type:'lessonCompleted',lessonId:'positions'})");
  await first.until("ps.getState().progress.completedLessonIds.includes('positions')");
  check(await first.evaluate("ps.getState().progress.quizScores['quiz-rankings'].attempts===1"), 'Unsaved quiz attempt survives remote refresh');
  await first.evaluate("Storage.prototype.setItem=write;ps.getState().record({type:'quizAttempted',quizId:'quiz-rankings',score:1})");
  await second.until("ps.getState().progress.quizScores['quiz-rankings']?.attempts===2");
  check(await first.evaluate("ps.getState().saved&&!document.body.innerText.includes('Your latest progress couldn’t be saved.')"), 'Later activity saves pending progress and clears warning');

  // Hold the actual browser lock until both tabs have queued conflicting writes.
  await first.evaluate('ps.getState().reset()');
  await first.evaluate("void navigator.locks.request('chipchamp-progress',async()=>{window.lockHeld=true;await new Promise(resolve=>window.releaseProgress=resolve)})");
  await first.until('window.lockHeld===true');
  for (const p of pages) await p.evaluate("void (window.concurrentSaves=Promise.all(Array.from({length:20},()=>ps.getState().record({type:'quizAttempted',quizId:'quiz-rankings',score:1}))))");
  check(await first.evaluate("!JSON.parse(localStorage.getItem('pokergame.progress.v1')).quizScores['quiz-rankings']"), 'Queued writes do not bypass the lock');
  await first.evaluate('releaseProgress()');
  for (const p of pages) check(await p.evaluate('concurrentSaves.then(results=>results.every(Boolean))'), 'Concurrent writes finish successfully');
  for (const p of pages) await p.until("ps.getState().progress.quizScores['quiz-rankings']?.attempts===40");
  check(true, '40 competing quiz attempts across two tabs are all preserved');

  for (const p of pages) await p.evaluate("(async()=>{const path='/src/ui/store/dailyStore.ts';window.ds=(await import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path)).useDailyStore;window.today=(await import('/src/tutorial/dailyChallenge.ts')).localDay()})()");
  await Promise.all(pages.map(p=>p.evaluate('ds.getState().complete(today)')));
  check(await first.evaluate("JSON.parse(localStorage.getItem('chipchamp.daily.v1')).length===1"), 'Simultaneous daily completion counts once');
  await first.evaluate("window.lockHeld=false;void navigator.locks.request('chipchamp-progress',async()=>{window.lockHeld=true;await new Promise(resolve=>window.releaseProgress=resolve)})");
  await first.until('window.lockHeld===true');
  await first.evaluate('void (window.resetSave=ps.getState().reset())');
  await second.evaluate('void (window.dailySave=ds.getState().complete(today))');
  await first.evaluate('releaseProgress()');
  await first.evaluate('resetSave');
  await second.evaluate('dailySave');
  check(await second.evaluate("JSON.parse(localStorage.getItem('pokergame.progress.v1')).quizScores['quiz-rankings']===undefined&&JSON.parse(localStorage.getItem('chipchamp.daily.v1')).includes(today)"), 'Reset and later daily completion follow lock order');

  await first.evaluate("(async()=>{const path='/src/ui/store/gameStore.ts';window.gs=(await import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path)).useGameStore})()");
  await first.until('gs.getState().hasTableControl');
  await first.evaluate("window.lockHeld=false;void navigator.locks.request('chipchamp-progress',async()=>{window.lockHeld=true;await new Promise(resolve=>window.releaseProgress=resolve)})");
  await first.until('window.lockHeld===true');
  await first.evaluate("gs.getState().newGame('medium','Ben');gs.getState().playerAction({type:'fold',seatId:0});gs.getState().newGame('medium','Ava');window.newJournal=localStorage.getItem('chipchamp.table.v1');releaseProgress()");
  await first.until('!ps.getState().saving');
  check(await first.evaluate("localStorage.getItem('chipchamp.table.v1')===newJournal"), 'Late completion receipt cannot overwrite a newer hand');
  await first.evaluate("window.originalWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pokergame.progress.v1')throw Error('quota');return originalWrite.call(this,k,v)};document.querySelector('.settings-toggle').click()");
  await first.click('RESET PROGRESS');
  await first.click('CLEAR PROGRESS');
  await first.until("document.body.innerText.includes('The reset couldn’t be saved.')");
  check(await first.evaluate("!!document.querySelector('.settings-modal')"), 'Failed reset stays on the page and reports failure');
  await first.evaluate('Storage.prototype.setItem=originalWrite');
  await first.click('CLEAR PROGRESS');
  await first.until("!!document.querySelector('.lobby')&&!document.querySelector('.settings-modal')");
  check(await first.evaluate("JSON.parse(localStorage.getItem('pokergame.progress.v1')).completedLessonIds.length===0&&localStorage.getItem('chipchamp.daily.v1')===null"), 'Successful reset finishes before reload');
  check(pages.every(p=>p.errors.length===0), 'No uncaught browser exceptions');
} finally { await b.close(); }
