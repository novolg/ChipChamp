// Firefox's built-in WebDriver BiDi endpoint; no geckodriver dependency.
import { check, wait } from './cdp.mjs';
const ws = new WebSocket(process.env.BIDI_URL ?? 'ws://127.0.0.1:9223/session');
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.type === 'error' ? p.reject(Error(m.message)) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const url = process.env.APP_URL ?? 'http://127.0.0.1:5188/';
let userContext;
try {
  await send('session.new', { capabilities: { alwaysMatch: {} } });
  ({ userContext } = await send('browser.createUserContext'));
  const { context } = await send('browsingContext.create', { type: 'tab', userContext });
  const evaluate = async expression => {
    const result = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
    if (result.type === 'exception') throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(100); }
    throw Error('Timed out: ' + expression);
  };
  const click = async text => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click()})()`);
    await wait(150);
  };
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  await until("!!document.querySelector('.lobby')");
  check(true, 'Firefox lobby renders');
  await evaluate("(async()=>{const module=async path=>import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path);window.gs=(await module('/src/ui/store/gameStore.ts')).useGameStore;window.ss=(await module('/src/ui/store/settingsStore.ts')).useSettingsStore;window.ns=(await module('/src/ui/store/navStore.ts')).useNavStore})()");
  await until('gs.getState().hasTableControl');
  await evaluate("ss.getState().set('renderer','dom');ss.getState().set('reducedMotion','on');gs.getState().newGame('medium','Ben');ns.getState().go({name:'free'})");
  await until("!!document.querySelector('.play-controls button')");
  await click('FOLD'); await until("gs.getState().game.phase==='handComplete'");
  await until("!!document.querySelector('.coach-decision-review')");
  check(true, 'Firefox DOM game and decision review work');
  await send('browsingContext.reload', { context, wait: 'complete' });
  await until("!!document.querySelector('.lobby')");
  await click('RETURN TO TABLE'); await until("!!document.querySelector('.coach-decision-review')");
  check(true, 'Firefox saved hand and review survive reload');
  await evaluate("document.querySelector('.nav-seg').click()"); await until("!!document.querySelector('.lobby')");
  await click('PLAY TODAY'); await until("document.querySelectorAll('.best-five-card').length===7");
  await evaluate("(async()=>{const d=await import('/src/tutorial/dailyChallenge.ts');const b=await import('/src/tutorial/bestFive.ts');const e=d.dailyExercise(d.localDay());for(let a=0;a<7;a++)for(let c=a+1;c<7;c++){const indices=[0,1,2,3,4,5,6].filter(i=>i!==a&&i!==c);if(b.assessBestFive(e,indices).correct){for(const i of indices){document.querySelectorAll('.best-five-card')[i].click();await new Promise(r=>setTimeout(r,0));}return;}}})()");
  await click('CHECK MY FIVE'); await click('FINISH THE EXERCISE'); await until("!!document.querySelector('.daily-finish')");
  check(true, 'Firefox daily puzzle completes');
  await send('browsingContext.setViewport', { context, viewport: { width: 360, height: 800 } });
  check(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Firefox 360px layout fits');
  check(await evaluate("document.documentElement.dataset.reducedMotion==='true'"), 'Firefox persisted motion preference applies');
  await send('browsingContext.close', { context });
} finally {
  if (userContext) { try { await send('browser.removeUserContext', { userContext }); } catch { /* Session may have ended. */ } }
  try { await send('session.end'); } catch { /* Preserve the original failure. */ }
  ws.close();
}
