import { browser, check } from './cdp.mjs';

const b = await browser();
try {
  const p = await b.page();
  await p.send('Page.navigate', { url: process.env.APP_URL ?? 'http://127.0.0.1:5189/' });
  await p.until("!!document.querySelector('.lobby')");
  for (const name of ['bot-ava', 'bot-ben', 'bot-ben-folded', 'bot-cleo', 'bg-saloon']) {
    const identical = await p.evaluate(`(async () => {
      const pixels = async extension => {
        const image = new Image();
        image.src = '/assets/indigo/' + ${JSON.stringify(name)} + '.' + extension;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.fillStyle = '#101529';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [png, webp] = await Promise.all([pixels('png'), pixels('webp')]);
      let max = 0, changed = 0;
      for (let i = 0; i < png.length; i++) {
        const delta = Math.abs(png[i] - webp[i]);
        if (delta) changed++;
        max = Math.max(max, delta);
      }
      return { sameSize: png.length === webp.length, max, changed };
    })()`);
    console.log(name, identical);
    // Chrome's PNG/WebP alpha compositors round differently by one 8-bit step.
    // Exact decoded RGBA equality is independently checked by optimize-indigo.py.
    check(identical.sameSize && identical.max <= 1, `${name}: browser compositing stays within one channel step`);
  }
} finally { await b.close(); }
