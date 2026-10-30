import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ActionType } from '../../../engine/types';
import type { Emotion } from '../../lib/botEmotion';
import type { GazeVec } from '../../hooks/useGazeDirector';

/** Live drive state for one bot — read by the render loop every frame. */
export interface BotDrive {
  emotion: Emotion;
  /** Bump replays the emotion's entry gesture. */
  emotionSeq: number;
  gaze?: GazeVec;
  folded: boolean;
  acting: boolean;
  /** Latest action on the street; a new `seq` fires its gesture once. */
  action?: { type: ActionType; seq: number };
  /** Live reduced-motion (in-app setting or OS) — no idle loop, no gestures. */
  still: boolean;
}

interface BotModel3DProps extends BotDrive {
  /** GLB path under public/ (Claude Design export, simplified). */
  src: string;
  /** Desync idle loops between bots. */
  phase: number;
  /** WebGL, model load or context loss failed — parent shows the PNG. */
  onFail: (reason: string) => void;
  onReady: () => void;
}

/** Rig parts the Claude Design export names (pivots sit at the joints). */
interface Rig {
  root: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  visor: THREE.Object3D;
  hat: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  /** Model height (feet at y=0 → top of the hat), drives camera framing. */
  height: number;
  /** Click target (rest pose bounds). */
  bounds: THREE.Box3;
  visorMats: THREE.MeshStandardMaterial[];
  base: Map<THREE.Object3D, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>;
}

const gltfCache = new Map<string, Promise<THREE.Group>>();
function loadModel(src: string): Promise<THREE.Group> {
  let p = gltfCache.get(src);
  if (!p) {
    p = new GLTFLoader().loadAsync(src).then((g) => g.scene);
    // A failed load is not cached — the next mount retries.
    p.catch(() => gltfCache.delete(src));
    gltfCache.set(src, p);
  }
  return p;
}

const PART_NAMES = new Set(['torso', 'head', 'visor', 'hat', 'arm_L', 'hand_L', 'arm_R', 'hand_R', 'leg_L', 'leg_R']);

/** World-space box of a part's own meshes (sub-parts excluded). */
function ownBox(node: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const walk = (o: THREE.Object3D) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
    for (const c of o.children) if (!PART_NAMES.has(c.name)) walk(c);
  };
  walk(node);
  return box;
}

/**
 * Move a part's origin to a joint without moving its geometry. Exports that
 * already carry joint pivots (non-zero rest offset) are left alone; others
 * (everything at the origin) get the joint from the part's bounding box.
 * Assumes the part itself has no rotation/scale (true for these exports).
 */
function ensurePivot(node: THREE.Object3D, joint: (b: THREE.Box3) => THREE.Vector3) {
  if (node.position.lengthSq() > 1e-8) return;
  node.updateWorldMatrix(true, true);
  const local = node.parent!.worldToLocal(joint(ownBox(node)));
  const delta = local.sub(node.position);
  node.position.add(delta);
  for (const c of node.children) c.position.sub(delta);
  node.updateWorldMatrix(false, true);
}

function buildRig(template: THREE.Group): Rig {
  const root = template.clone(true);
  const part = (name: string) => {
    const o = root.getObjectByName(name);
    if (!o) throw new Error(`bot model is missing part "${name}"`);
    return o;
  };
  const bottom = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  const shoulder = (b: THREE.Box3) =>
    new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - (b.max.y - b.min.y) * 0.15, (b.min.z + b.max.z) / 2);
  // Parents first, so children re-pivot in their final frame.
  ensurePivot(part('torso'), bottom);
  ensurePivot(part('head'), bottom);
  ensurePivot(part('arm_L'), shoulder);
  ensurePivot(part('arm_R'), shoulder);
  const visor = part('visor');
  // Per-instance visor materials so one bot's glow doesn't light the others.
  const visorMats: THREE.MeshStandardMaterial[] = [];
  visor.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    m.material = mat;
    if (mat.name.startsWith('visor')) visorMats.push(mat);
  });
  const rig: Rig = {
    root, visor, visorMats,
    torso: part('torso'), head: part('head'), hat: part('hat'),
    armL: part('arm_L'), armR: part('arm_R'),
    height: new THREE.Box3().setFromObject(root, true).max.y,
    bounds: new THREE.Box3().setFromObject(root, true),
    base: new Map(),
  };
  for (const o of [rig.torso, rig.head, rig.visor, rig.hat, rig.armL, rig.armR]) {
    rig.base.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
  }
  return rig;
}

/** Pose offsets from the rest pose (radians / model units / scale factors). */
interface Pose {
  torsoX: number; torsoZ: number; torsoY: number; lift: number;
  headX: number; headY: number; headZ: number;
  armLX: number; armLZ: number; armRX: number; armRZ: number;
  hatX: number; hatY: number;
  squint: number; glow: number;
  /** Whole-body turn (radians) — click reactions only. */
  spin: number;
}
const ZERO: Pose = {
  torsoX: 0, torsoZ: 0, torsoY: 0, lift: 0, headX: 0, headY: 0, headZ: 0,
  armLX: 0, armLZ: 0, armRX: 0, armRZ: 0, hatX: 0, hatY: 0, squint: 0, glow: 1, spin: 0,
};
const KEYS = Object.keys(ZERO) as (keyof Pose)[];

/** Held pose per emotion (the "face" of a bot with a visor for eyes). */
const EMOTION_POSE: Record<Emotion, Partial<Pose>> = {
  idle: {},
  thinking: { headZ: 0.12, headX: 0.08, armRX: -1.1, armRZ: 0.35, glow: 1.25 },
  confident: { torsoX: -0.08, headX: -0.1, armLZ: -0.25, armRZ: 0.25 },
  worried: { torsoX: 0.1, headX: 0.22, headY: 0.15, squint: 0.2, glow: 0.8 },
  suspicious: { headZ: -0.14, headY: -0.12, squint: 0.55 },
  relief: { torsoX: -0.04, headX: -0.06 },
  shocked: { torsoX: -0.14, headX: -0.2, armLZ: -0.5, armRZ: 0.5, squint: -0.25, glow: 1.5 },
  happy: { headX: -0.08, armLZ: -0.2, armRZ: 0.2, glow: 1.3 },
  sad: { torsoX: 0.18, headX: 0.35, armLZ: 0.08, armRZ: -0.08, squint: 0.35, glow: 0.55 },
  asleep: { torsoX: 0.12, headX: 0.45, headZ: 0.15, squint: 0.85, glow: 0.25 },
};

/** One-shot gesture: pose delta as a function of seconds since trigger (0 when done). */
type Gesture = (t: number) => Partial<Pose> | null;
/** Smooth 0→1→0 envelope over `dur` seconds. */
const bell = (t: number, dur: number) => (t < 0 || t > dur ? 0 : Math.sin((t / dur) * Math.PI));

const ACTION_GESTURE: Partial<Record<ActionType, Gesture>> = {
  // Toss the cards away: right arm sweeps out, head turns from the table.
  fold: (t) => (t > 0.9 ? null : { armRX: -1.2 * bell(t, 0.9), armRZ: 0.9 * bell(t, 0.9), headY: 0.3 * bell(t, 0.9) }),
  // Knuckle tap on the felt.
  check: (t) => (t > 0.6 ? null : { armRX: -0.5 * Math.abs(Math.sin(t * 10.5)) * (1 - t / 0.6), headX: 0.08 * bell(t, 0.6) }),
  // Nod + slide chips in.
  call: (t) => (t > 0.8 ? null : { headX: 0.12 * Math.sin(t * 15) * (1 - t / 0.8), armLX: -0.7 * bell(t, 0.8) }),
  // Lean in and push.
  bet: (t) => (t > 0.9 ? null : { torsoX: 0.16 * bell(t, 0.9), armLX: -1.0 * bell(t, 0.9), armRX: -1.0 * bell(t, 0.9) }),
  raise: (t) => (t > 1 ? null : { torsoX: 0.2 * bell(t, 1), headX: -0.1 * bell(t, 1), armLX: -1.2 * bell(t, 1), armRX: -1.2 * bell(t, 1) }),
  allin: (t) => (t > 1.3 ? null : { torsoX: 0.28 * bell(t, 1.3), lift: 0.04 * bell(t, 1.3), armLX: -1.5 * bell(t, 1.3), armRX: -1.5 * bell(t, 1.3), glow: 1.8 * bell(t, 1.3) }),
};

const EMOTION_GESTURE: Partial<Record<Emotion, Gesture>> = {
  // Hop + tip of the hat.
  happy: (t) => (t > 1.1 ? null : { lift: 0.07 * bell(t, 0.5), hatX: -0.5 * bell(t - 0.2, 0.9), hatY: 0.05 * bell(t - 0.2, 0.9), armRX: -2.2 * bell(t - 0.1, 1), armRZ: 0.3 * bell(t - 0.1, 1) }),
  confident: (t) => (t > 0.9 ? null : { lift: 0.04 * bell(t, 0.5), hatX: -0.3 * bell(t, 0.9), hatY: 0.03 * bell(t, 0.9) }),
  shocked: (t) => (t > 0.5 ? null : { lift: 0.06 * bell(t, 0.3), torsoX: -0.15 * bell(t, 0.5) }),
  relief: (t) => (t > 0.8 ? null : { torsoY: 0.04 * bell(t, 0.8), headX: -0.2 * bell(t, 0.8) }),
};

/** Reactions when the player clicks a bot, played in turn. */
const CLICK_REACTIONS: Gesture[] = [
  // Wave: right arm up and out, hand wiggles, head tilts.
  (t) => (t > 1.4 ? null : { armRX: -0.5 * bell(t, 1.4), armRZ: -2.3 * bell(t, 1.4) + 0.35 * Math.sin(t * 16) * bell(t, 1.4), headZ: 0.15 * bell(t, 1.4), glow: 1.4 * bell(t, 1.4) }),
  // Tip of the hat.
  (t) => (t > 1.2 ? null : { armRX: -2.4 * bell(t, 1.2), hatX: -0.55 * bell(t - 0.2, 0.9), hatY: 0.06 * bell(t - 0.2, 0.9), headX: 0.15 * bell(t, 1.2) }),
  // Hop and full spin.
  (t) => (t > 0.9 ? null : { lift: 0.08 * bell(t, 0.9), spin: Math.PI * 2 * Math.min(1, t / 0.8) ** 0.7 }),
];
/** Too many clicks: shakes its head, visor narrows. */
const ANNOYED: Gesture = (t) => (t > 0.9 ? null : { headY: 0.35 * Math.sin(t * 20) * bell(t, 0.9), squint: 0.6 * bell(t, 0.9), torsoX: -0.06 * bell(t, 0.9) });

/**
 * Real-time 3D cyber-cowboy bot (three.js) — the Claude Design GLB, posed by
 * hand every frame: idle breathing, head tracks the gaze director, held pose
 * per emotion, one-shot gestures per action / emotion change, visor glow as
 * the "eyes". One small WebGL canvas per seat.
 */
export default function BotModel3D({ src, phase, onFail, onReady, ...drive }: BotModel3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Props flow into the loop through a ref — no re-init on every change.
  const driveRef = useRef<BotDrive>(drive);
  driveRef.current = drive;
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current!;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (err) {
      console.warn('[BotModel3D] WebGL unavailable; using the portrait.', err);
      failRef.current('Portrait · browser could not start WebGL');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'bp3d-canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1c3a, 1.5));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.4); // warm, from the table lamps
    key.position.set(1.5, 2.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fd8ff, 2.2); // cyan back rim
    rim.position.set(-2, 2, -2.5);
    scene.add(rim);

    // Bust framing (matches the PNG cast): belt to hat brim, a little headroom for hops and hat tips.
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    // Framing is tuned for the seat box (.bp); the canvas (.bp3d) overhangs it
    // on top and sides, and setViewOffset widens the view to match — so the
    // bot keeps its size in the seat but the hat never hits a canvas edge.
    const frame3d = (height: number) => {
      const span = height * 0.76; // belt → hat brim fills the seat box
      const cy = height * 0.66;
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, cy + height * 0.08, dist);
      camera.lookAt(0, cy, 0);
    };
    frame3d(1.54);

    const resize = () => {
      const box = host.parentElement!;
      const bw = box.clientWidth || 1;
      const bh = box.clientHeight || 1;
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = bw / bh;
      camera.setViewOffset(bw, bh, host.offsetLeft, host.offsetTop, w, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Pointer: an idle bot watches the cursor; clicking a bot plays a reaction.
    const pointer = { x: 0, y: 0, t: -1e9 };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.t = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    const canvas = renderer.domElement;
    const onContextLost = () => {
      console.warn('[BotModel3D] WebGL context lost; using the portrait.', src);
      failRef.current('Portrait · WebGL context was lost');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const overBot = (e: PointerEvent) => {
      if (!rig) return false;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectsBox(rig.bounds);
    };
    const onCanvasMove = (e: PointerEvent) => {
      canvas.style.cursor = overBot(e) ? 'pointer' : '';
    };
    let reaction = 0;
    const clicks: number[] = [];
    const onClick = (e: PointerEvent) => {
      if (!overBot(e)) return;
      const t = clock.elapsedTime;
      clicks.push(t);
      while (clicks.length && t - clicks[0] > 2.5) clicks.shift();
      gesture = { fn: clicks.length >= 4 ? ANNOYED : CLICK_REACTIONS[reaction++ % CLICK_REACTIONS.length], t0: t };
    };
    canvas.addEventListener('pointermove', onCanvasMove);
    canvas.addEventListener('click', onClick as EventListener);

    let rig: Rig | null = null;
    const cur: Pose = { ...ZERO };
    let gesture: { fn: Gesture; t0: number } | null = null;
    let lastActionSeq = driveRef.current.action?.seq;
    let lastEmo = `${driveRef.current.emotion}-${driveRef.current.emotionSeq}`;
    const clock = new THREE.Clock();

    const mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    let lastFrame = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!rig || document.hidden) return;
      const timestamp = performance.now();
      if (mobile && timestamp - lastFrame < 1000 / 30) return;
      lastFrame = timestamp;
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = clock.elapsedTime;
      const d = driveRef.current;
      const still = d.still;

      // Fire one-shot gestures on new actions / emotion entries.
      if (d.action && d.action.seq !== lastActionSeq) {
        lastActionSeq = d.action.seq;
        const g = ACTION_GESTURE[d.action.type];
        if (g) gesture = { fn: g, t0: now };
      }
      const emoKey = `${d.emotion}-${d.emotionSeq}`;
      if (emoKey !== lastEmo) {
        lastEmo = emoKey;
        const g = EMOTION_GESTURE[d.emotion];
        if (g) gesture = { fn: g, t0: now };
      }

      // Target = held emotion pose + gaze + idle + active gesture.
      const tgt: Pose = { ...ZERO, ...EMOTION_POSE[d.emotion] };
      if (d.folded) Object.assign(tgt, { torsoX: 0.1, headX: 0.12, armLZ: 0.1, armRZ: -0.1, squint: 0.3, glow: 0.3 });
      const gz = d.gaze ?? { x: 0, y: 0, tilt: 0 };
      tgt.headY += gz.x * 0.16; // ±2.5 → ±0.4 rad yaw
      tgt.headX += gz.y * 0.045; // looks down at hero / pot
      tgt.headZ += -gz.tilt * 0.035;
      const idleGaze = Math.abs(gz.x) + Math.abs(gz.y) < 0.01 && !d.acting;
      if (idleGaze && performance.now() - pointer.t < 5000) {
        const r = canvas.getBoundingClientRect();
        const dx = pointer.x - (r.left + r.width / 2);
        const dy = pointer.y - (r.top + r.height * 0.4);
        tgt.headY += THREE.MathUtils.clamp(dx / 520, -0.6, 0.6);
        tgt.headX += THREE.MathUtils.clamp(dy / 700, -0.25, 0.3);
      }
      if (d.acting) { tgt.glow *= 1.35 + 0.25 * Math.sin(now * 6); tgt.torsoX += 0.05; }
      if (!still) {
        const b = Math.sin((now + phase) * 1.7);
        tgt.torsoY += 0.012 * b; // breathing swell
        tgt.headX += 0.025 * Math.sin((now + phase) * 1.7 - 0.6);
        tgt.headY += 0.04 * Math.sin((now + phase) * 0.37);
        tgt.armLZ += -0.03 * b;
        tgt.armRZ += 0.03 * b;
        // Visor blink every few seconds.
        const blink = ((now + phase * 3) % 4.3) < 0.12;
        if (blink && !d.folded) tgt.squint = Math.max(tgt.squint, 0.9);
      }
      if (gesture && !still) {
        const g = gesture.fn(now - gesture.t0);
        if (g) {
          for (const k of KEYS) if (g[k] !== undefined) tgt[k] += g[k]!;
        } else {
          gesture = null;
        }
      }

      if (!gesture) cur.spin = Math.atan2(Math.sin(cur.spin), Math.cos(cur.spin));
      // Critically-damped-ish follow; gestures are already smooth curves.
      const a = still ? 1 : 1 - Math.exp(-dt * 14);
      for (const k of KEYS) cur[k] += (tgt[k] - cur[k]) * a;

      const set = (o: THREE.Object3D, rx = 0, ry = 0, rz = 0) => {
        const b0 = rig!.base.get(o)!;
        o.rotation.set(b0.r.x + rx, b0.r.y + ry, b0.r.z + rz);
      };
      const tb = rig.base.get(rig.torso)!;
      rig.torso.position.y = tb.p.y + cur.lift;
      rig.torso.scale.set(tb.s.x * (1 + cur.torsoY * 0.5), tb.s.y * (1 + cur.torsoY), tb.s.z * (1 + cur.torsoY * 0.5));
      rig.root.rotation.y = cur.spin;
      set(rig.torso, cur.torsoX, 0, cur.torsoZ);
      set(rig.head, cur.headX, cur.headY, cur.headZ);
      set(rig.armL, cur.armLX, 0, cur.armLZ);
      set(rig.armR, cur.armRX, 0, cur.armRZ);
      set(rig.hat, cur.hatX, 0, 0);
      const hb = rig.base.get(rig.hat)!;
      rig.hat.position.y = hb.p.y + cur.hatY;
      const vb = rig.base.get(rig.visor)!;
      rig.visor.scale.set(vb.s.x, vb.s.y * Math.max(0.12, 1 - cur.squint), vb.s.z);
      for (const m of rig.visorMats) m.emissiveIntensity = Math.max(0.05, cur.glow);

      renderer.render(scene, camera);
    };

    const loadTimeout = setTimeout(() => { if (!disposed) failRef.current('Portrait · model download timed out'); }, 12000);
    loadModel(src)
      .then((tpl) => {
        clearTimeout(loadTimeout);
        if (disposed) return;
        rig = buildRig(tpl);
        frame3d(rig.height);
        rig.root.rotation.y = 0;
        scene.add(rig.root);
        clock.start();
        frame();
        readyRef.current();
      })
      .catch((err) => {
        clearTimeout(loadTimeout);
        console.error('[BotModel3D] failed to load', src, err);
        if (!disposed) failRef.current('Portrait · model download or setup failed');
      });

    return () => {
      disposed = true;
      clearTimeout(loadTimeout);
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointermove', onCanvasMove);
      canvas.removeEventListener('click', onClick as EventListener);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      rig?.visorMats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, phase]);

  return <div ref={hostRef} className="bp3d" />;
}
