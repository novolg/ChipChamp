import { useEffect, useRef } from 'react';

/**
 * Animated "suit field" background — a dense, jittered lattice of ♠♥♦♣ glyphs
 * with layered cursor physics (repulsion, velocity wake, click shockwaves) and
 * a rack-focus blur for depth. Purely presentational; no app state.
 *
 * Ported from the design handoff's framework-agnostic canvas script.
 */
export function SuitField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The heaviest motion source in the app — gate it on the user's reduced-
    // motion preference and tab visibility (CSS/Framer kill-switches can't reach
    // a canvas rAF). t0 is mutable so it can absorb hidden time on resume.
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let t0 = performance.now();

    // Cursor + eased focus point.
    let mx = window.innerWidth / 2;
    let my = 300;
    let ex = mx;
    let ey = my;
    let pex = ex;
    let pey = ey;
    let wvx = 0;
    let wvy = 0;
    let pulses: { x: number; y: number; t0: number; s: number; v: number }[] = [];
    let lastTrail = 0;
    let ltx = -9999;
    let lty = -9999;
    let nextSpark = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      const now = performance.now();
      const dx = e.clientX - ltx;
      const dy = e.clientY - lty;
      if (now - lastTrail > 130 && dx * dx + dy * dy > 5000) {
        pulses.push({ x: e.clientX, y: e.clientY, t0: now, s: 0.45, v: 320 });
        if (pulses.length > 9) pulses.shift();
        lastTrail = now;
        ltx = e.clientX;
        lty = e.clientY;
      }
    };
    const onDown = (e: MouseEvent) => {
      pulses.push({ x: e.clientX, y: e.clientY, t0: performance.now(), s: 1, v: 520 });
      if (pulses.length > 9) pulses.shift();
    };

    // Pre-render suit sprites at several focus levels (crisp → blurred) + an
    // energized blue set, for cheap depth-of-field.
    const suits = ['♠', '♥', '♦', '♣'];
    const variants = [
      { color: '#232B40', blur: 0 },
      { color: '#1E2536', blur: 1.6 },
      { color: '#181E2E', blur: 3.2 },
      { color: '#2E78E6', blur: 0 },
    ];
    const S = 64;
    const sprites = suits.map((glyph) =>
      variants.map((v) => {
        const sc = document.createElement('canvas');
        sc.width = S;
        sc.height = S;
        const sx = sc.getContext('2d')!;
        sx.font = '600 40px Arial, sans-serif';
        sx.textAlign = 'center';
        sx.textBaseline = 'middle';
        sx.fillStyle = v.color;
        if (v.blur) sx.filter = 'blur(' + v.blur + 'px)';
        sx.fillText(glyph, S / 2, S / 2 + 2);
        return sc;
      }),
    );

    interface Cell {
      x: number; y: number; ph: number; su: number; szj: number; rot: number;
      ba: number; zb: number; en: number; spk: number;
      px?: number; py?: number; vx?: number; vy?: number; av?: number;
      idx?: number; depth?: number; s?: number;
    }
    let cells: Cell[] = [];
    let dpr = 1;
    let buckets = new Map<number, Cell[]>();

    const sizeField = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(2, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(2, Math.floor(window.innerHeight * dpr));
      const gap = 34;
      cells = [];
      const cols = Math.ceil(window.innerWidth / gap) + 1;
      const rows = Math.ceil(window.innerHeight / gap) + 1;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          cells.push({
            x: i * gap + gap / 2 + (j % 2) * gap * 0.5 + (Math.random() - 0.5) * 14,
            y: j * gap + gap / 2 + (Math.random() - 0.5) * 14,
            ph: Math.random() * 6.283,
            su: (i + 2 * j) % 4,
            szj: 0.55 + Math.random() * 0.85,
            rot: (Math.random() - 0.5) * 0.9,
            ba: 1.6 + Math.random() * 3.2,
            zb: Math.random() * 0.3 - 0.15,
            en: 0,
            spk: 0,
          });
        }
      }
    };

    const draw = () => {
      const wantW = Math.max(2, Math.floor(window.innerWidth * dpr));
      if (canvas.width !== wantW) sizeField();
      const now = performance.now();
      const t = (now - t0) / 1000;
      ex += (mx - ex) * 0.09;
      ey += (my - ey) * 0.09;
      pulses = pulses.filter((p) => now - p.t0 < 1800);
      const fvx = ex - pex;
      const fvy = ey - pey;
      pex = ex;
      pey = ey;
      wvx += (fvx - wvx) * 0.15;
      wvy += (fvy - wvy) * 0.15;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const R = 160;
      const nP = pulses.length;
      if (!nextSpark || now > nextSpark) {
        cells[(Math.random() * cells.length) | 0].spk = 1;
        nextSpark = now + 380 + Math.random() * 650;
      }
      const n = cells.length;

      // pass 1: forces + integration (inertia)
      for (let k = 0; k < n; k++) {
        const cell = cells[k];
        cell.idx = k;
        const bobx = Math.cos(t * 0.5 + cell.ph * 1.3) * cell.ba;
        const boby = Math.sin(t * 0.62 + cell.ph) * cell.ba * 1.15;
        const hx = cell.x + bobx;
        const hy = cell.y + boby;
        if (cell.px === undefined) {
          cell.px = hx; cell.py = hy; cell.vx = 0; cell.vy = 0; cell.av = 0;
        }
        let ax = (hx - cell.px!) * 0.011;
        let ay = (hy - cell.py!) * 0.011;
        const dx = cell.px! - ex;
        const dy = cell.py! - ey;
        const d2 = dx * dx + dy * dy;
        const g = Math.exp(-d2 / (R * R));
        let pr = 0;
        if (g > 0.01 || nP > 0) {
          const d = Math.sqrt(d2) + 18;
          ax += (dx / d) * g * 0.75 + wvx * g * 0.14;
          ay += (dy / d) * g * 0.75 + wvy * g * 0.14;
          for (let q = 0; q < nP; q++) {
            const p = pulses[q];
            const age = (now - p.t0) / 1000;
            const pdx = cell.px! - p.x;
            const pdy = cell.py! - p.y;
            const pd = Math.sqrt(pdx * pdx + pdy * pdy) + 14;
            const rr = (pd - age * p.v) / 56;
            const ring = Math.exp(-rr * rr) * Math.exp(-age * 2.1) * p.s;
            if (ring > 0.004) {
              pr += ring;
              ax += (pdx / pd) * ring * 1.4;
              ay += (pdy / pd) * ring * 1.4;
            }
          }
        }
        cell.vx = (cell.vx! + ax) * 0.945;
        cell.vy = (cell.vy! + ay) * 0.945;
        if (cell.vx > 4) cell.vx = 4; else if (cell.vx < -4) cell.vx = -4;
        if (cell.vy > 4) cell.vy = 4; else if (cell.vy < -4) cell.vy = -4;
        cell.px! += cell.vx;
        cell.py! += cell.vy;
        cell.av = cell.av! * 0.965 + cell.vx * 0.0035;
        cell.rot += cell.av;
        const tgt = Math.min(1, g * 1.05 + pr * 0.5);
        cell.en += (tgt - cell.en) * (tgt > cell.en ? 0.085 : 0.028);
        cell.spk *= 0.982;
        const z01 =
          0.5 +
          0.5 * Math.sin(cell.px! * 0.008 + t * 0.22 + cell.ph) *
            Math.cos(cell.py! * 0.0075 - t * 0.16);
        let depth = z01 * 0.4 + cell.zb + cell.en * 0.6 + (cell.spk > 0.012 ? cell.spk : 0) * 0.55;
        if (depth > 1) depth = 1; else if (depth < 0.02) depth = 0.02;
        cell.depth = depth;
        cell.s = 16 * cell.szj * (0.9 + depth * 0.55 + cell.en * 0.7);
      }

      // pass 2: soft collisions (spatial hash)
      const bs = 40;
      const bcols = Math.ceil(window.innerWidth / bs) + 3;
      buckets.clear();
      for (let k = 0; k < n; k++) {
        const cell = cells[k];
        const key = ((cell.px! / bs) | 0) + ((cell.py! / bs) | 0) * bcols;
        const arr = buckets.get(key);
        if (arr) arr.push(cell); else buckets.set(key, [cell]);
      }
      for (let k = 0; k < n; k++) {
        const a = cells[k];
        const bx = (a.px! / bs) | 0;
        const by = (a.py! / bs) | 0;
        const ra = a.s! * 0.36;
        for (let nb = 0; nb < 9; nb++) {
          const arr = buckets.get(bx + (nb % 3) - 1 + (by + ((nb / 3) | 0) - 1) * bcols);
          if (!arr) continue;
          for (let m = 0; m < arr.length; m++) {
            const b = arr[m];
            if (b.idx! <= a.idx!) continue;
            const ddx = b.px! - a.px!;
            const ddy = b.py! - a.py!;
            const md = ra + b.s! * 0.36;
            const dd2 = ddx * ddx + ddy * ddy;
            if (dd2 > md * md || dd2 < 0.01) continue;
            const dist = Math.sqrt(dd2);
            const nx = ddx / dist;
            const ny = ddy / dist;
            const ov = (md - dist) * 0.3;
            a.px! -= nx * ov; a.py! -= ny * ov;
            b.px! += nx * ov; b.py! += ny * ov;
            const rel = (b.vx! - a.vx!) * nx + (b.vy! - a.vy!) * ny;
            if (rel < 0) {
              const imp = rel * 0.42;
              a.vx! += nx * imp; a.vy! += ny * imp;
              b.vx! -= nx * imp; b.vy! -= ny * imp;
              a.av! -= rel * 0.01; b.av! += rel * 0.01;
              const bump = -rel * 0.1;
              if (bump > 0.03) {
                if (bump > a.spk) a.spk = Math.min(0.5, bump);
                if (bump > b.spk) b.spk = Math.min(0.5, bump);
              }
            }
          }
        }
      }

      // pass 3: draw with rack-focus blur
      for (let k = 0; k < n; k++) {
        const cell = cells[k];
        const depth = cell.depth!;
        const en = cell.en;
        const spark = cell.spk > 0.012 ? cell.spk : 0;
        const s = cell.s!;
        const alpha = Math.min(0.85, 0.26 + depth * 0.24 + en * 0.22);
        const li = (1 - depth) * 2;
        const i0 = li | 0;
        const i1 = i0 >= 2 ? 2 : i0 + 1;
        const frac = li - i0;
        const sp = sprites[cell.su];
        const ang = cell.rot + Math.sin(t * (0.55 + cell.ph * 0.08) + cell.ph) * (0.05 + en * 0.2 + spark * 0.15);
        ctx.setTransform(dpr, 0, 0, dpr, cell.px! * dpr, cell.py! * dpr);
        ctx.rotate(ang);
        ctx.globalAlpha = alpha * (1 - frac);
        ctx.drawImage(sp[i0], -s / 2, -s / 2, s, s);
        if (frac > 0.04) {
          ctx.globalAlpha = alpha * frac;
          ctx.drawImage(sp[i1], -s / 2, -s / 2, s, s);
        }
        if (en > 0.06) {
          ctx.globalAlpha = en * 0.32;
          ctx.drawImage(sp[3], -s / 2, -s / 2, s, s);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    sizeField();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', sizeField);

    // draw() re-arms its own rAF at the end while running; start()/stop() own
    // the on/off transitions. A static draw() repaints one frame then stops.
    let raf = 0;
    let hiddenAt = 0;
    const start = () => {
      if (raf !== 0 || rm.matches || document.hidden) return;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const staticFrame = () => { draw(); stop(); };

    if (rm.matches) staticFrame();
    else start();

    const onVisibility = () => {
      if (document.hidden) { hiddenAt = performance.now(); stop(); }
      else { if (hiddenAt) t0 += performance.now() - hiddenAt; hiddenAt = 0; start(); }
    };
    const onRM = () => { if (rm.matches) { stop(); staticFrame(); } else start(); };
    document.addEventListener('visibilitychange', onVisibility);
    rm.addEventListener?.('change', onRM);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', sizeField);
      document.removeEventListener('visibilitychange', onVisibility);
      rm.removeEventListener?.('change', onRM);
      stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="suit-field" aria-hidden="true" />;
}
