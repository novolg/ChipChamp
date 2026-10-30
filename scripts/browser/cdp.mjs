// Dependency-free Chrome DevTools Protocol harness. Every run owns an isolated
// browser context and disposes it; it never clears the user's browser storage.
export async function browser() {
  const endpoint = process.env.CDP_URL ?? 'http://127.0.0.1:9338';
  const version = await (await fetch(endpoint + '/json/version')).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const exceptions = new Map();
  const logs = new Map();
  const listeners = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method) listeners.get(message.sessionId)?.get(message.method)?.(message.params);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.get(message.sessionId)?.push(message.params.exceptionDetails);
    } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      logs.get(message.sessionId)?.push(message.params.args.map(a => a.value ?? a.description).join(' '));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { browserContextId } = await send('Target.createBrowserContext');
  return {
    async page() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const errors = [];
      exceptions.set(sessionId, errors);
      const consoleMessages = [];
      const events = new Map();
      listeners.set(sessionId, events);
      logs.set(sessionId, consoleMessages);
      const command = (method, params) => send(method, params, sessionId);
      await command('Runtime.enable');
      await command('Page.enable');
      const evaluate = async (expression) => {
        const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result.value;
      };
      return {
        send: command, evaluate, errors,
        on: (method, listener) => events.set(method, listener),
        close: () => send('Target.closeTarget', { targetId }),
        async until(expression, timeout = 20000) {
          const end = Date.now() + timeout;
          do { if (await evaluate(expression)) return; await wait(100); } while (Date.now() < end);
          throw Error('Timed out: ' + expression + '\n' + consoleMessages.join('\n') + '\n' + await evaluate('document.body.innerText.slice(-600)'));
        },
        async click(text) {
          await evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent.includes(${JSON.stringify(text)}));if(!button)throw Error('Missing or disabled button: '+${JSON.stringify(text)});button.click()})()`);
          await wait(100);
        },
      };
    },
    async close() { await send('Target.disposeBrowserContext', { browserContextId }); ws.close(); },
  };
}
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function check(value, description) {
  if (!value) throw Error(description);
  console.log('PASS', description);
}
