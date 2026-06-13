import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { playSfx } from '../../lib/sound';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Live pot-odds trainer: drag the pot / call sliders to see the equity you
 *  need, then set your outs to see whether the call is profitable. */
export function PotOddsWidget() {
  const [pot, setPot] = useState(80);
  const [call, setCall] = useState(20);
  const [outs, setOuts] = useState(9);
  const [street, setStreet] = useState<'flop' | 'turn'>('flop');

  const need = call / (pot + call); // break-even equity for the call
  const have = Math.min(0.95, (outs * (street === 'flop' ? 4 : 2)) / 100); // rule of 2 & 4
  const goodCall = have >= need;

  // Confirm the verdict flip (CALL↔FOLD) with one tone — fire only when the
  // verdict actually changes. A previous-value ref (not a skip-first flag) keeps
  // the dev StrictMode double-invoke silent, mirroring useTableSfx's snapshot guard.
  const prevGoodCall = useRef(goodCall);
  useEffect(() => {
    if (prevGoodCall.current === goodCall) return;
    prevGoodCall.current = goodCall;
    playSfx(goodCall ? 'win' : 'incorrect');
  }, [goodCall]);

  return (
    <div className="podds">
      <div className="podds-row">
        <label className="podds-field">
          <span className="podds-label">POT SIZE</span>
          <input type="range" min={20} max={500} step={10} value={pot} onChange={(e) => { setPot(Number(e.target.value)); playSfx('chipTick'); }} />
          <span className="podds-value">${pot}</span>
        </label>
        <label className="podds-field">
          <span className="podds-label">COST TO CALL</span>
          <input type="range" min={5} max={200} step={5} value={call} onChange={(e) => { setCall(Number(e.target.value)); playSfx('chipTick'); }} />
          <span className="podds-value">${call}</span>
        </label>
      </div>

      <div className="podds-readout">
        <span className="podds-need">{pct(need)}</span>
        <span className="podds-need-cap">equity needed — you risk ${call} to win ${pot + call}</span>
      </div>

      <div className="podds-row">
        <label className="podds-field">
          <span className="podds-label">YOUR OUTS</span>
          <input type="range" min={1} max={15} value={outs} onChange={(e) => { setOuts(Number(e.target.value)); playSfx('chipTick'); }} />
          <span className="podds-value">{outs}</span>
        </label>
        <div className="podds-field">
          <span className="podds-label">CARDS TO COME</span>
          <div className="podds-toggle" role="tablist" aria-label="street">
            <button
              role="tab"
              aria-selected={street === 'flop'}
              className={`podds-seg${street === 'flop' ? ' podds-seg-active' : ''}`}
              onClick={() => { setStreet('flop'); playSfx('click'); }}
            >
              FLOP (×4)
            </button>
            <button
              role="tab"
              aria-selected={street === 'turn'}
              className={`podds-seg${street === 'turn' ? ' podds-seg-active' : ''}`}
              onClick={() => { setStreet('turn'); playSfx('click'); }}
            >
              TURN (×2)
            </button>
          </div>
        </div>
      </div>

      <div className="podds-bar">
        <span className={`podds-bar-fill${goodCall ? ' podds-bar-fill-good' : ''}`} style={{ width: pct(have) }} />
        <span className="podds-bar-mark" style={{ left: pct(need) }} />
      </div>
      <div className="podds-legend">
        <span className={`podds-legend-have${goodCall ? ' podds-legend-have-good' : ''}`}>YOUR EQUITY ≈ {pct(have)}</span>
        <span className="podds-legend-need">NEEDED {pct(need)}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={goodCall ? 'c' : 'f'}
          className={`podds-verdict ${goodCall ? 'podds-verdict-call' : 'podds-verdict-fold'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {goodCall
            ? 'CALL — your hand wins often enough to pay this price.'
            : 'FOLD — the price is too high for how often you get there.'}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
