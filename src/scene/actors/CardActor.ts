import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Pt } from '../layout';

/** Live motion settings the actor reads per-tween (speed divides every
 *  duration; reducedMotion snaps every behavior to its end state). Backed by
 *  PokerScene fields so a settings change is picked up on the next behavior
 *  without re-wiring the actors. */
export interface CardMotion {
  speed(): number;
  reducedMotion(): boolean;
}

const DEAL_MS = 260;
const FLIP_HALF_MS = 110;
const MUCK_MS = 300;
const ARC_LIFT = 30; // control-point rise (px) for the deal arc
const SHADOW_ALPHA = 0.32;

/**
 * A single playing card in the Pixi scene: a face/back Sprite with a soft
 * contact shadow and a lazily-built gold winning-rim. Owns its own GSAP
 * behaviors (deal / flip / highlight / dim / muck); all durations divide by
 * `motion.speed()` and collapse to a snap under `motion.reducedMotion()`.
 * Size-agnostic — the caller sets the on-table size via `resize`.
 */
export class CardActor {
  readonly view = new Container();
  private readonly sprite = new Sprite();
  private readonly shadow = new Graphics();
  private rim: Graphics | null = null;
  private rimPulse: gsap.core.Tween | null = null;
  private muckTl: gsap.core.Timeline | null = null;

  private readonly backTex: Texture;
  private faceTex: Texture | null = null;
  private faceUp = false;
  private w = 0;
  private h = 0;
  private mucking = false;

  constructor(backTex: Texture, private readonly motion: CardMotion) {
    this.backTex = backTex;
    this.sprite.anchor.set(0.5);
    this.sprite.texture = backTex;
    this.view.addChild(this.shadow, this.sprite);
    this.view.visible = false;
  }

  private applySize(): void {
    // width/height setters recompute the sprite's scale from the CURRENT
    // texture, so re-apply after every texture swap to keep a constant on-table
    // size regardless of face-vs-back native resolution.
    this.sprite.width = this.w;
    this.sprite.height = this.h;
  }

  /** Set the on-table display size (world px). */
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.applySize();
    this.shadow
      .clear()
      .roundRect(-w / 2, -h / 2 + 4, w, h, Math.min(9, w * 0.14))
      .fill({ color: 0x000000, alpha: SHADOW_ALPHA });
  }

  /** Assign the front texture (from SceneAssets.cardFace) without showing it. */
  setFace(tex: Texture): void {
    this.faceTex = tex;
    if (this.faceUp) {
      this.sprite.texture = tex;
      this.applySize();
    }
  }

  private showBack(): void {
    this.faceUp = false;
    this.sprite.texture = this.backTex;
    this.applySize();
  }

  private showFace(): void {
    if (!this.faceTex) return;
    this.faceUp = true;
    this.sprite.texture = this.faceTex;
    this.applySize();
  }

  /** Hard-set to a resting state at `pt` (used by settle-to-truth), optionally
   *  rotated (fanned bot backs). Leaves highlight/dim to explicit calls. */
  place(pt: Pt, faceUp: boolean, rot = 0): void {
    this.muckTl?.kill();
    this.muckTl = null;
    this.mucking = false;
    this.view.visible = true;
    this.view.position.set(pt.x, pt.y);
    this.view.rotation = rot;
    this.view.scale.set(1);
    this.view.alpha = 1;
    this.shadow.alpha = 1;
    if (faceUp) this.showFace();
    else this.showBack();
  }

  hide(): void {
    this.muckTl?.kill();
    this.muckTl = null;
    this.mucking = false;
    this.view.visible = false;
    this.highlight(false);
    this.dim(false);
  }

  private secs(ms: number): number {
    return ms / this.motion.speed() / 1000;
  }

  /** Fly deck→slot with a slight arc + settling rotation, face-down in flight;
   *  when `faceUp`, a flip is appended so the card lands and turns over. */
  deal(from: Pt, to: Pt, faceUp: boolean, delayMs: number): gsap.core.Timeline {
    const tl = gsap.timeline();
    this.view.visible = true;
    this.view.alpha = 1;
    this.shadow.alpha = 1;
    this.showBack();

    if (this.motion.reducedMotion()) {
      this.view.position.set(to.x, to.y);
      this.view.rotation = 0;
      this.view.scale.set(1);
      if (faceUp) this.showFace();
      return tl;
    }

    const dur = this.secs(DEAL_MS);
    const at = this.secs(delayMs);
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2 - ARC_LIFT;

    this.view.position.set(from.x, from.y);
    this.view.rotation = -0.12;
    this.view.scale.set(1);

    const p = { t: 0 };
    tl.to(
      p,
      {
        t: 1,
        duration: dur,
        ease: 'power2.out',
        onUpdate: () => {
          const t = p.t;
          const u = 1 - t;
          this.view.position.set(
            u * u * from.x + 2 * u * t * cx + t * t * to.x,
            u * u * from.y + 2 * u * t * cy + t * t * to.y,
          );
        },
      },
      at,
    );
    tl.to(this.view, { rotation: 0, duration: dur, ease: 'power2.out' }, at);
    if (faceUp) tl.add(this.flip());
    return tl;
  }

  /** Pinch to a sliver, swap face-up, spring back — with a shadow lift pass. */
  flip(): gsap.core.Timeline {
    const tl = gsap.timeline();
    if (this.motion.reducedMotion()) {
      this.showFace();
      return tl;
    }
    const half = this.secs(FLIP_HALF_MS);
    tl.to(this.view.scale, { x: 0.06, duration: half, ease: 'power1.in' }, 0);
    tl.to(this.shadow, { alpha: 0.55, duration: half, ease: 'power1.in' }, 0);
    tl.add(() => this.showFace());
    tl.to(this.view.scale, { x: 1, duration: half, ease: 'power1.out' });
    tl.to(this.shadow, { alpha: 1, duration: half, ease: 'power1.out' }, `<`);
    return tl;
  }

  /** Winning-card gold rim: an alpha pulse while `on`, cleared when off. */
  highlight(on: boolean): void {
    if (!on) {
      this.rimPulse?.kill();
      this.rimPulse = null;
      if (this.rim) this.rim.alpha = 0;
      return;
    }
    if (!this.rim) {
      this.rim = new Graphics();
      this.view.addChildAt(this.rim, 0);
    }
    this.rim
      .clear()
      .roundRect(-this.w / 2, -this.h / 2, this.w, this.h, Math.min(9, this.w * 0.14))
      .stroke({ width: 3, color: 0xffcf3f, alpha: 1 });
    if (this.motion.reducedMotion()) {
      this.rim.alpha = 1;
      return;
    }
    this.rimPulse?.kill();
    this.rim.alpha = 0.35;
    this.rimPulse = gsap.to(this.rim, {
      alpha: 1,
      duration: 0.6,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  /** Losing-card fade (at showdown). */
  dim(on: boolean): void {
    this.view.alpha = on ? 0.55 : 1;
  }

  /** Slide toward the deck, fade + spin, then hide. No-op if already mucking or
   *  hidden (idempotent under repeated settle passes). */
  muck(toDeck: Pt): gsap.core.Timeline {
    const tl = gsap.timeline();
    if (this.mucking || !this.view.visible) return tl;
    this.mucking = true;
    this.highlight(false);
    if (this.motion.reducedMotion()) {
      this.view.visible = false;
      this.mucking = false;
      return tl;
    }
    this.muckTl?.kill();
    this.muckTl = tl;
    tl.to(
      this.view,
      {
        x: toDeck.x,
        y: toDeck.y,
        alpha: 0,
        rotation: this.view.rotation + 0.5,
        duration: this.secs(MUCK_MS),
        ease: 'power1.in',
        onComplete: () => {
          this.view.visible = false;
          this.mucking = false;
          this.muckTl = null;
        },
      },
      0,
    );
    return tl;
  }

  /** Kill any tween this actor owns (rim pulse loop, in-flight muck) so nothing
   *  keeps ticking a display object the renderer is about to destroy. The view
   *  itself is freed by the scene's recursive app.destroy. */
  killTweens(): void {
    this.rimPulse?.kill();
    this.rimPulse = null;
    this.muckTl?.kill();
    this.muckTl = null;
  }
}
