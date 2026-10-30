import { browser, check } from './cdp.mjs';
const b = await browser();
try {
  for (const reduced of [false, true]) {
    const p = await b.page();
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await p.send('Page.navigate', { url: process.env.APP_URL ?? 'http://127.0.0.1:5188/' });
    await p.until("!!document.querySelector('.lobby')");
    check(await p.evaluate("document.activeElement?.tagName!=='H1'"), 'Initial lobby does not autofocus the title');
    await p.click('How a Hand Works');
    await p.until("document.activeElement?.classList.contains('lesson-hero-title')");
    check(true, `Lesson entry focus (reduced motion: ${reduced})`);
    await p.evaluate("document.querySelector('.skip-content').focus()");
    check(await p.evaluate("getComputedStyle(document.activeElement).clipPath==='none'"), 'Skip control becomes visible on focus');
    const key = async key => {
      await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Tab' ? 9 : 13, ...(key === 'Enter' ? { text: '\r' } : {}) });
      await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Tab' ? 9 : 13 });
    };
    await key('Enter');
    await p.until("document.activeElement?.classList.contains('lesson-hero-title')");
    await p.evaluate("(async()=>{const path='/src/ui/store/navStore.ts';const nav=(await import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name??path)).useNavStore;window.quiz=(await import('/src/tutorial/content/quizzes.ts')).QUIZZES_BY_ID['quiz-rankings'];nav.getState().go({name:'quiz',id:'quiz-rankings'})})()");
    const count = await p.evaluate('quiz.questions.length');
    for (let index = 0; index < count; index++) {
      await p.until(`document.activeElement?.classList.contains('quiz-prompt')&&document.activeElement.getAttribute('aria-label').startsWith('Question ${index + 1} of')`);
      // Select a known correct answer using Tab and Enter, including animated swaps.
      const answer = await p.evaluate(`quiz.questions[${index}].options.findIndex(o=>o.id===quiz.questions[${index}].correctOptionId)`);
      for (let tab = 0; tab <= answer; tab++) await key('Tab');
      await key('Enter');
      await p.until("document.activeElement?.classList.contains('quiz-feedback-head')");
      await key('Tab');
      check(await p.evaluate("document.activeElement?.classList.contains('quiz-next')"), 'Feedback leads directly to Next');
      await key('Enter');
    }
    await p.until("document.activeElement?.classList.contains('quiz-result-head')");
    await key('Tab');
    await key('Enter');
    await p.until("document.activeElement?.tagName==='H1'");
    check(p.errors.length === 0, `Keyboard quiz completes and returns to club (reduced motion: ${reduced})`);
    await p.close();
  }
} finally { await b.close(); }
