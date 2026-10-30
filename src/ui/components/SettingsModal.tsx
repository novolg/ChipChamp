import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useSettingsStore, type Settings } from '../store/settingsStore';
import { useProgressStore } from '../store/progressStore';
import { useGameStore } from '../store/gameStore';
import { playSfx } from '../lib/sound';

/** Tab/Shift+Tab wrap target set for the focus trap — anything a keyboard
 *  user could legitimately land on inside the panel. */
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const VOLUME_BUSES: { key: keyof Settings['volumes']; label: string }[] = [
  { key: 'master', label: 'MASTER' },
  { key: 'sfx', label: 'SFX' },
  { key: 'ui', label: 'UI' },
  { key: 'ambience', label: 'AMBIENCE' },
  { key: 'music', label: 'MUSIC' },
];

const RELEASE_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown',
]);

/** A row of `.btn` toggles sharing one active value — used for speed,
 *  reduced-motion, and the boolean ON/OFF switches alike. */
function SegRow<T extends string | number | boolean>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="settings-seg-row" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`btn settings-seg ${opt.value === value ? 'btn-orange' : 'btn-dark'}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Settings modal: volumes, speed, deck style, haptics, reduced motion,
 *  renderer, and a two-step progress reset. Mounted (conditionally, by the
 *  caller) inside `.frame` — that element's own `transform` already makes it
 *  the containing block for this panel's `position: absolute` backdrop, so
 *  the modal scales with the rest of the fixed-canvas UI for free. */
export function SettingsModal({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement> }) {
  const settings = useSettingsStore((s) => s.settings);
  const set = useSettingsStore((s) => s.set);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const resetProgress = useProgressStore((s) => s.reset);

  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const previousConfirm = useRef(false);
  const [avatarStatus, setAvatarStatus] = useState('Open the table to check 3D avatars.');
  useEffect(() => {
    const read = () => {
      const statuses = [...new Set(Array.from(document.querySelectorAll<HTMLElement>('[data-avatar-status]'), node => node.dataset.avatarStatus))];
      setAvatarStatus(statuses.length ? statuses.join(' · ') : 'Open the table to check 3D avatars.');
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-avatar-status'] });
    return () => observer.disconnect();
  }, []);

  // Autofocus the first control on mount. Idempotent (just moves focus), so
  // StrictMode's dev double-invoke is harmless.
  useEffect(() => {
    const opener = returnFocusRef.current;
    const backdrop = panelRef.current?.parentElement;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const previous = siblings.map((node) => node.inert);
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    siblings.forEach((node) => { node.inert = true; });
    useGameStore.getState().setSettingsPaused(true);
    return () => {
      siblings.forEach((node, i) => { node.inert = previous[i]; });
      useGameStore.getState().setSettingsPaused(false);
      if (opener?.isConnected) opener.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (confirmReset) cancelResetRef.current?.focus();
    else if (previousConfirm.current) resetRef.current?.focus();
    previousConfirm.current = confirmReset;
  }, [confirmReset]);

  const tick = () => playSfx('click');

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (confirmReset) setConfirmReset(false);
      else onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleResetYes = async () => {
    if (resetSaving) return;
    setResetSaving(true);
    setResetFailed(false);
    const saved = await resetProgress();
    if (saved) window.location.reload();
    else { setResetSaving(false); setResetFailed(true); }
  };

  return (
    <div
      className="settings-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-modal-head">
          <h2 id="settings-modal-title">SETTINGS</h2>
          <button type="button" className="settings-close" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3 className="settings-section-title">Volume</h3>
          {VOLUME_BUSES.map(({ key, label }) => (
            <div className="settings-row" key={key}>
              <span className="settings-row-label">{label}</span>
              <input
                className="settings-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volumes[key]}
                aria-label={`${label} volume`}
                onChange={(e) => setVolume(key, Number(e.target.value))}
                onPointerUp={tick}
                onKeyUp={(e) => {
                  if (RELEASE_KEYS.has(e.key)) tick();
                }}
              />
              <span className="settings-row-value">{Math.round(settings.volumes[key] * 100)}%</span>
            </div>
          ))}
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Gameplay</h3>
          <div className="settings-row">
            <span className="settings-row-label">Speed</span>
            <SegRow
              label="Game speed"
              value={settings.speed}
              options={[
                { value: 0.5, label: '0.5×' },
                { value: 1, label: '1×' },
                { value: 2, label: '2×' },
              ]}
              onChange={(v) => set('speed', v)}
            />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">4-color deck</span>
            <SegRow
              label="Four-color deck"
              value={settings.fourColorDeck}
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              onChange={(v) => set('fourColorDeck', v)}
            />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Haptics</span>
            <SegRow
              label="Haptics"
              value={settings.haptics}
              options={[
                { value: true, label: 'ON' },
                { value: false, label: 'OFF' },
              ]}
              onChange={(v) => set('haptics', v)}
            />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Reduced motion</span>
            <SegRow
              label="Reduced motion"
              value={settings.reducedMotion}
              options={[
                { value: 'system', label: 'SYSTEM' },
                { value: 'on', label: 'ON' },
              ]}
              onChange={(v) => set('reducedMotion', v)}
            />
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Renderer</h3>
          <div className="settings-row">
            <span className="settings-row-label">Table renderer</span>
            <select
              aria-label="Table renderer"
              className="settings-select"
              value={settings.renderer}
              onChange={(e) => set('renderer', e.target.value as Settings['renderer'])}
            >
              <option value="auto">Auto</option>
              <option value="full">Full</option>
              <option value="reduced">Reduced</option>
              <option value="dom">DOM</option>
            </select>
          </div>
          <p className="settings-hint">Auto uses 3D when supported. Reduced and DOM use portraits.</p>
          <p className="settings-hint" role="status" data-avatar-diagnostic>Avatars: {avatarStatus}</p>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Progress</h3>
          <div className="settings-reset-row">
            {!confirmReset ? (
              <button ref={resetRef} type="button" className="btn btn-red" onClick={() => setConfirmReset(true)}>
                RESET PROGRESS
              </button>
            ) : (
              <>
                <span className="settings-reset-confirm" role="status">Clear lessons, quiz scores and daily streaks? Your saved table stays.</span>
                <button type="button" className="btn btn-red" onClick={handleResetYes} disabled={resetSaving}>
                  {resetSaving ? 'CLEARING…' : 'CLEAR PROGRESS'}
                </button>
                <button ref={cancelResetRef} type="button" className="btn btn-dark" onClick={() => setConfirmReset(false)} disabled={resetSaving}>
                  KEEP PROGRESS
                </button>
              </>
            )}
          </div>
          {resetFailed && <p role="alert" className="settings-hint">The reset couldn’t be saved. Keep this tab open and try again.</p>}
        </section>
      </div>
    </div>
  );
}
