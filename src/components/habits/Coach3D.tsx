import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type CoachEmotion = "proud" | "excited" | "warm" | "concerned" | "thinking";

/** Expression targets; the face eases toward them so emotions blend instead of snapping. */
interface Face {
  smile: number;     // -1 frown … 1 big grin
  open: number;      // mouth open at rest (a grin shows teeth-dark)
  browLift: number;  // both brows up
  browWorry: number; // + inner ends up (worried), − inner ends down (determined)
  browAsym: number;  // one brow raised (thinking)
  cheek: number;     // cheeks push up with a real smile
  squint: number;    // smiling eyes
  pitch: number;     // − chin up (proud), + head down (concerned)
  roll: number;      // head tilt
  lookX: number;     // gaze off to the side
  bounce: number;    // idle energy
}
const FACES: Record<CoachEmotion, Face> = {
  proud:     { smile: 1,     open: 0.3, browLift: 0.05, browWorry: 0,    browAsym: 0,    cheek: 1,   squint: 0.5, pitch: -0.12, roll: 0,     lookX: 0,    bounce: 0.03 },
  excited:   { smile: 0.9,   open: 0.6, browLift: 0.08, browWorry: -0.1, browAsym: 0,    cheek: 0.9, squint: 0.3, pitch: -0.05, roll: 0.05,  lookX: 0,    bounce: 0.06 },
  warm:      { smile: 0.55,  open: 0,   browLift: 0.02, browWorry: 0.25, browAsym: 0,    cheek: 0.5, squint: 0.3, pitch: 0.03,  roll: 0.1,   lookX: 0,    bounce: 0.015 },
  concerned: { smile: -0.5,  open: 0,   browLift: 0,    browWorry: 1,    browAsym: 0,    cheek: 0,   squint: 0,   pitch: 0.09,  roll: -0.14, lookX: 0,    bounce: 0.008 },
  thinking:  { smile: -0.1,  open: 0,   browLift: 0.01, browWorry: -0.2, browAsym: 1,    cheek: 0.1, squint: 0.2, pitch: -0.14, roll: 0.08,  lookX: 0.3,  bounce: 0.01 },
};
const FACE_KEYS = Object.keys(FACES.warm) as (keyof Face)[];

/** Optional: a rigged .glb at public/coach.glb replaces the built-in coach. */
const COACH_MODEL_URL = "/coach.glb";

interface Props {
  /** How he feels about the habit right now; drives face, head and body language. */
  emotion: CoachEmotion;
  /** Changes whenever a new pep talk starts — triggers talking + a nod. */
  talkKey: string | number;
  /** How long he keeps talking for this line, in ms. */
  talkMs: number;
  /** Shown while loading, and if WebGL is unavailable. */
  fallback: ReactNode;
  width?: number;
  height?: number;
}

interface FrameState { now: number; t: number; dt: number; talking: boolean; since: number; emotion: CoachEmotion; face: Face; px: number; py: number; blink: number }
interface Rig { root: THREE.Object3D; camera: THREE.PerspectiveCamera; update: (s: FrameState) => void; dispose?: () => void }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ─────────────────────────────────────────────────────────────────────────────
// Optional external model
// ─────────────────────────────────────────────────────────────────────────────
let modelPromise: Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> | null = null;
function loadModel() {
  if (!modelPromise) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    modelPromise = loader.loadAsync(COACH_MODEL_URL).then((g) => ({ scene: g.scene, clips: g.animations }));
    modelPromise.catch(() => {}); // a missing model stays missing for the session
  }
  return modelPromise;
}

const MORPHS = {
  jaw: ["jawOpen", "mouthOpen", "viseme_aa", "MouthOpen"],
  smile: ["mouthSmile", "mouthSmileLeft", "mouthSmileRight", "Smile"],
  frown: ["mouthFrownLeft", "mouthFrownRight", "Frown"],
  browUp: ["browInnerUp", "BrowsUp"],
  browOuter: ["browOuterUpLeft"],
  browDown: ["browDownLeft", "browDownRight", "BrowsDown"],
  cheek: ["cheekSquintLeft", "cheekSquintRight"],
  squint: ["eyeSquintLeft", "eyeSquintRight"],
  blink: ["eyesClosed", "eyeBlinkLeft", "eyeBlinkRight", "Blink"],
};
type MorphKey = keyof typeof MORPHS;

function gltfRig(source: THREE.Group, clips: THREE.AnimationClip[], aspect: number): Rig {
  const model = source.clone(true);
  let head: THREE.Object3D | undefined;
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (!head && /head$/i.test(o.name) && !/top|end/i.test(o.name)) head = o;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) meshes.push(m);
  });
  const morph = {} as Record<MorphKey, [THREE.Mesh, number][]>;
  (Object.keys(MORPHS) as MorphKey[]).forEach((k) => {
    morph[k] = meshes.flatMap((m) => MORPHS[k].flatMap((n) => {
      const i = m.morphTargetDictionary![n];
      return i === undefined ? [] : [[m, i] as [THREE.Mesh, number]];
    }));
  });
  const set = (k: MorphKey, v: number) => morph[k].forEach(([m, i]) => { m.morphTargetInfluences![i] = v; });

  const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
  if (mixer) { (mixer.clipAction(clips.find((c) => /idle|breath|stand/i.test(c.name)) ?? clips[0])).play(); mixer.update(0); }

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const hp = head ? head.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - size.y * 0.12, (box.min.z + box.max.z) / 2);
  const viewH = size.y > size.x * 1.6 ? size.y * 0.34 : size.y * 0.95;
  const camera = new THREE.PerspectiveCamera(28, aspect, 0.01, 100);
  const target = new THREE.Vector3(hp.x, hp.y - viewH * 0.14, hp.z);
  camera.position.set(target.x, target.y + viewH * 0.04, target.z + viewH / 2 / Math.tan(THREE.MathUtils.degToRad(14)));
  camera.lookAt(target);
  const baseZ = camera.position.z;
  const base = head?.quaternion.clone();
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  let lx = 0, ly = 0;

  return {
    root: model, camera,
    update: (s) => {
      mixer?.update(s.dt);
      const nod = s.since < 0.9 ? Math.sin((s.since / 0.9) * Math.PI) * 0.12 : 0;
      if (head && base) {
        if (!mixer) head.quaternion.copy(base);
        ly = lerp(ly, s.px * 0.45, 0.08);
        lx = lerp(lx, s.py * 0.25 + nod + s.face.pitch, 0.1);
        head.quaternion.multiply(q.setFromEuler(e.set(lx, ly + s.face.lookX, s.face.roll + (s.talking ? Math.sin(s.t * 3.5) * 0.04 : 0))));
      }
      const f = s.face;
      const flap = s.talking ? Math.abs(Math.sin(s.t * 13)) * (0.55 + 0.45 * Math.abs(Math.sin(s.t * 2.9))) : 0;
      set("jaw", Math.min(1, flap * 0.7 + f.open * 0.3));
      set("smile", Math.max(0, f.smile) * 0.8);
      set("frown", Math.max(0, -f.smile) * 0.8);
      set("browUp", Math.max(0, f.browWorry) * 0.7 + f.browLift * 4);
      set("browOuter", f.browAsym * 0.8);
      set("browDown", Math.max(0, -f.browWorry) * 0.6);
      set("cheek", f.cheek * 0.6);
      set("squint", f.squint);
      set("blink", s.blink);
      camera.position.z = lerp(camera.position.z, s.talking ? baseZ - viewH * 0.12 : baseZ, 0.03);
    },
    dispose: () => mixer?.stopAllAction(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in coach: a sculpted head (deformed sphere) with features placed by
// raycasting onto the face, so nothing floats or sinks in.
// ─────────────────────────────────────────────────────────────────────────────

/** Unit sphere → head: taller skull, tapered jaw, chin, brow ridge, eye sockets, cheekbones. */
function sculptHead(v: THREE.Vector3) {
  let { x, y, z } = v;
  const lower = Math.max(0, -y);
  x *= 0.84 * (1 - 0.2 * Math.pow(lower, 1.6));
  z *= 0.95 * (1 - 0.1 * lower);
  y *= 1.12;
  if (y < -0.72 && z > 0) z += 0.07 * ((-y - 0.72) / 0.4) * z;     // chin forward
  if (z < 0 && y > -0.25) z *= 1.06;                               // fuller back of skull
  const g = (cx: number, cy: number, s: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (s * s));
  if (z > 0) {
    z += 0.04 * (g(-0.3, 0.33, 0.2) + g(0.3, 0.33, 0.2));          // brow ridge
    z -= 0.06 * (g(-0.3, 0.1, 0.14) + g(0.3, 0.1, 0.14));          // eye sockets
    x *= 1 + 0.035 * (g(-0.55, -0.08, 0.26) + g(0.55, -0.08, 0.26)); // cheekbones
    z += 0.03 * g(0, -0.42, 0.22);                                  // upper lip
  }
  v.set(x, y, z);
}

function sculpted(segW: number, segH: number, scale: number, keep?: (u: THREE.Vector3) => boolean, noise = 0) {
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const u = v.clone();
    sculptHead(v);
    let s = scale;
    if (keep && !keep(u)) s = 0.9; // tuck unwanted parts inside the head
    else if (noise) s *= 1 + noise * Math.sin(u.x * 23) * Math.sin(u.z * 19) * Math.sin(u.y * 17);
    v.multiplyScalar(s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function builtInRig(accent: THREE.Color, aspect: number): Rig {
  const phys = (color: THREE.ColorRepresentation, p: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, ...p });
  const fabric = (color: THREE.ColorRepresentation) => phys(color, {
    roughness: 0.82, sheen: 0.7, sheenRoughness: 0.55, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
  });
  const skin = phys(0xe2ab86, { roughness: 0.5, sheen: 0.4, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffc2a6), clearcoat: 0.06, clearcoatRoughness: 0.6 });
  const skinDeep = phys(0xcf9372, { roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffb194) });
  const hair = phys(0x4b2f1d, { roughness: 0.62, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(0x9a6a44) });
  const jacket = fabric(0x22408e);
  const jacketDeep = fabric(0x172e68);
  const stripe = fabric(0xb4263b);
  const lanyard = fabric(0xe9b52b);
  const shirt = phys(0xf2f0ea, { roughness: 0.75 });
  const crest = phys(accent, { roughness: 0.35, clearcoat: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.18, metalness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b562, roughness: 0.22, metalness: 1 });
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0xa5551a, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04,
    transparent: true, opacity: 0.88, side: THREE.DoubleSide, envMapIntensity: 1.8,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.8 });
  const lipMat = phys(0xa9614c, { roughness: 0.45, sheen: 0.3, sheenColor: new THREE.Color(0xe0907a) });

  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, p: [number, number, number] = [0, 0, 0]) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(...p);
    parent.add(o);
    return o;
  };
  const tube = (pts: THREE.Vector3[], r: number, m: THREE.Material, parent: THREE.Object3D, closed = false) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), Math.max(24, pts.length * 12), r, 8, closed), m, parent);

  // ── Torso (lathe profile, flattened front-to-back) ──
  const torso = new THREE.Group();
  root.add(torso);
  const profile = [[0.3, -0.92], [0.55, -1.05], [0.98, -1.25], [1.26, -1.55], [1.36, -2.0], [1.34, -2.7]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const body = add(new THREE.LatheGeometry(profile, 64), jacket, torso);
  body.scale.set(1.15, 1, 0.62);
  const rAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1], b = profile[i];
      if (y <= a.y && y >= b.y) return lerp(a.x, b.x, (a.y - y) / (a.y - b.y));
    }
    return profile[profile.length - 1].x;
  };
  for (const y of [-1.72, -1.84]) {
    const r = rAt(y) * 1.01;
    const ring = add(new THREE.TorusGeometry(1, 0.035, 8, 96), stripe, torso, [0, y, 0]);
    ring.scale.set(r * 1.15, r * 0.62, 1);
    ring.rotation.x = Math.PI / 2;
  }
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 32), skin, torso, [0, -0.72, -0.02]);
  add(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 40, 1, true), jacketDeep, torso, [0, -0.93, 0]).material.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const c = add(new THREE.BoxGeometry(0.22, 0.04, 0.18), shirt, torso, [side * 0.13, -0.9, 0.36]);
    c.rotation.set(0.55, side * -0.35, side * -0.55);
  }
  const fz = (y: number) => rAt(y) * 0.62;
  tube([new THREE.Vector3(0, -1.06, 0.4), new THREE.Vector3(0, -1.3, fz(-1.3)), new THREE.Vector3(0, -1.7, fz(-1.7) + 0.01), new THREE.Vector3(0, -2.4, fz(-2.4) + 0.01)], 0.016, metal, torso);
  for (const side of [-1, 1]) {
    tube([
      new THREE.Vector3(side * 0.33, -0.95, -0.05), new THREE.Vector3(side * 0.38, -1.08, 0.3),
      new THREE.Vector3(side * 0.24, -1.42, fz(-1.42) + 0.03), new THREE.Vector3(side * 0.03, -1.86, fz(-1.86) + 0.04),
    ], 0.028, lanyard, torso);
  }
  const whistle = new THREE.Group();
  whistle.position.set(0.02, -1.95, fz(-1.95) + 0.1);
  whistle.rotation.set(0.25, 0.2, 1.35);
  torso.add(whistle);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 24), metal, whistle).rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.11, 0.05, 0.09), metal, whistle, [0.13, 0.03, 0]);
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-0.12, 0.13); shieldShape.lineTo(0.12, 0.13); shieldShape.lineTo(0.12, -0.02);
  shieldShape.quadraticCurveTo(0.12, -0.12, 0, -0.17); shieldShape.quadraticCurveTo(-0.12, -0.12, -0.12, -0.02);
  const badge = new THREE.Group();
  badge.position.set(0.56, -1.5, fz(-1.5) * Math.sqrt(1 - (0.56 / (rAt(-1.5) * 1.15)) ** 2) + 0.02);
  badge.rotation.set(-0.12, 0.42, 0);
  torso.add(badge);
  add(new THREE.ExtrudeGeometry(shieldShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 }), gold, badge).scale.set(1.12, 1.1, 1);
  add(new THREE.ShapeGeometry(shieldShape), crest, badge, [0, 0, 0.035]);

  // ── Head ──
  const head = new THREE.Group();
  root.add(head);
  const skull = add(sculpted(128, 96, 1), skin, head);
  skull.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hit = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => {
    ray.set(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize());
    return ray.intersectObject(skull)[0]?.point ?? new THREE.Vector3(ox, oy, 0);
  };
  const face = (x: number, y: number) => hit(x, y, 4, 0, 0, -1);

  // ears
  for (const side of [-1, 1]) {
    const p = hit(side * 3, 0.02, -0.08, -side, 0, 0);
    const ear = add(new THREE.SphereGeometry(1, 32, 24), skinDeep, head, [p.x + side * 0.02, p.y, p.z]);
    ear.scale.set(0.07, 0.21, 0.13);
    ear.rotation.y = side * -0.25;
  }

  // hair: shell following the skull with a natural hairline, plus a swept quiff
  const hairline = (u: THREE.Vector3) => {
    const ax = Math.abs(u.x);
    const line = u.z >= 0 ? lerp(-0.05, 0.6 - 0.25 * ax, u.z) : lerp(-0.05, -0.42, -u.z);
    return u.y > line;
  };
  add(sculpted(128, 96, 1.04, hairline, 0.012), hair, head);
  const quiff: [number, number, number, number, number, number, number][] = [
    // x, y, z, sx, sy, sz, tiltX
    [-0.26, 1.0, 0.42, 0.34, 0.2, 0.3, -0.55],
    [0.06, 1.08, 0.46, 0.38, 0.22, 0.3, -0.6],
    [0.36, 0.98, 0.38, 0.3, 0.18, 0.28, -0.5],
    [0.02, 1.13, 0.12, 0.5, 0.2, 0.42, -0.25],
    [-0.46, 0.9, 0.12, 0.26, 0.2, 0.34, -0.3],
  ];
  for (const [x, y, z, sx, sy, sz, tx] of quiff) {
    const q = add(new THREE.SphereGeometry(1, 40, 28), hair, head, [x, y, z]);
    q.scale.set(sx, sy, sz);
    q.rotation.set(tx, x * 0.4, x * -0.3);
  }
  for (const side of [-1, 1]) {
    const p = hit(side * 3, 0.18, 0.28, -side, 0, 0);
    const sb = add(new THREE.BoxGeometry(0.05, 0.3, 0.16), hair, head, [p.x + side * 0.015, p.y, p.z]);
    sb.rotation.y = side * 0.3;
  }

  // eyes (mostly hidden by the aviators)
  const eyes: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const p = face(side * 0.3, 0.1);
    const eye = add(new THREE.SphereGeometry(0.075, 24, 18), dark, head, [p.x, p.y, p.z - 0.04]);
    eye.scale.set(1.1, 0.75, 0.6);
    eyes.push(eye);
  }

  // nose: bridge + tip + wings, sitting on the face
  const bridgeTop = face(0, 0.2), tipBase = face(0, -0.16);
  const bridge = add(new THREE.SphereGeometry(1, 32, 24), skin, head, [0, 0.02, (bridgeTop.z + tipBase.z) / 2 + 0.05]);
  bridge.scale.set(0.085, 0.22, 0.1);
  bridge.rotation.x = -0.32;
  add(new THREE.SphereGeometry(0.105, 32, 24), skin, head, [0, -0.15, tipBase.z + 0.13]);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.06, 20, 16), skinDeep, head, [side * 0.1, -0.2, tipBase.z + 0.05]);

  // cheeks: rise and round out with a real smile
  const cheeks: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const p = face(side * 0.46, -0.3);
    const c = add(new THREE.SphereGeometry(0.17, 28, 20), skin, head, [p.x, p.y, p.z - 0.12]);
    c.scale.set(1, 0.8, 0.5);
    c.userData.y = p.y;
    cheeks.push(c);
  }

  // mouth: a flat strip below the mustache, built as top/bottom edges so two
  // morphs can bend it (smile: corners up, negative = frown) and open it into
  // a grin with a row of teeth.
  const lipY = -0.64;
  const mouthG = new THREE.Group();
  mouthG.position.set(0, lipY, face(0, lipY).z + 0.012);
  head.add(mouthG);
  const W = 0.23, N = 24;
  const xs = Array.from({ length: N + 1 }, (_, i) => (i / N * 2 - 1) * W);
  const curl = (x: number) => 0.13 * (x / W) ** 2;            // smile = 1: corners up this much
  const dip = (x: number) => 0.12 * (1 - (x / W) ** 2) ** 0.7; // open = 1: bottom edge drops this much
  const mouthStrip = (thick: number, openFrac: number, mat: THREE.Material, z: number) => {
    const pos: number[] = [], smile: number[] = [], open: number[] = [], idx: number[] = [];
    xs.forEach((x, i) => {
      const zz = -Math.abs(x) * 0.35 + z;
      pos.push(x, 0, zz, x, -thick * (1 - (x / W) ** 2), zz);
      smile.push(0, curl(x), 0, 0, curl(x), 0);
      open.push(0, 0, 0, 0, -dip(x) * openFrac, 0);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(smile, 3), new THREE.Float32BufferAttribute(open, 3)];
    g.morphTargetsRelative = true;
    g.computeVertexNormals();
    const m = add(g, mat, mouthG) as THREE.Mesh;
    m.morphTargetInfluences = [0, 0];
    return m;
  };
  const mouth = mouthStrip(0.03, 1, new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.7, side: THREE.DoubleSide }), 0);
  const teeth = mouthStrip(0.0, 0.38, new THREE.MeshStandardMaterial({ color: 0xf3eee4, roughness: 0.4, side: THREE.DoubleSide }), 0.004);
  const jaw = new THREE.Group(); // lower lip + chin follow the mouth open
  head.add(jaw);
  const lip = add(new THREE.CapsuleGeometry(0.028, 0.2, 6, 16), lipMat, jaw, [0, lipY - 0.055, face(0, lipY - 0.055).z + 0.005]);
  lip.rotation.z = Math.PI / 2;

  // big bushy mustache: dense taper of spheres along the upper lip, drooping at the ends
  const stache = new THREE.Group();
  head.add(stache);
  for (const row of [0, 1]) {
    for (let x = -0.5; x <= 0.5001; x += 0.022) {
      const ax = Math.abs(x) / 0.5;
      const y = -0.37 - 0.13 * Math.pow(ax, 1.7) - row * 0.045;
      const r = (0.1 * (1 - ax * ax) + 0.035) * (row ? 0.8 : 1);
      const p = face(x, y);
      const s = add(new THREE.SphereGeometry(r, 18, 14), hair, stache, [p.x, p.y, p.z + r * 0.45]);
      s.scale.set(1, 0.72, 0.8);
    }
  }

  // brows: arched, thick, following the brow ridge
  const brows: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // pivot at the brow's middle so it can tilt in place (worried / determined)
    const mid = face(side * 0.325, 0.37);
    const g = new THREE.Group();
    g.position.copy(mid);
    head.add(g);
    for (let t = 0; t <= 1.0001; t += 0.08) {
      const x = side * lerp(0.13, 0.52, t);
      const y = 0.34 + Math.sin(t * Math.PI) * 0.045 - t * 0.02;
      const p = face(x, y);
      const r = lerp(0.048, 0.028, t);
      add(new THREE.SphereGeometry(r, 14, 10), hair, g, [p.x - mid.x, p.y - mid.y, p.z + 0.01 - mid.z]).scale.set(1.2, 0.7, 0.7);
    }
    g.userData.y = mid.y;
    brows.push(g);
  }

  // aviators: teardrop lenses in thin gold frames, double bridge, temple arms
  const tear = new THREE.Shape();
  tear.moveTo(-0.2, 0.1);
  tear.bezierCurveTo(-0.22, 0.2, 0.2, 0.2, 0.22, 0.1);
  tear.bezierCurveTo(0.25, -0.05, 0.1, -0.21, -0.03, -0.2);
  tear.bezierCurveTo(-0.16, -0.19, -0.21, -0.06, -0.2, 0.1);
  const tearPts = tear.getPoints(48);
  const specs = new THREE.Group(); // nudged up when the cheeks lift
  head.add(specs);
  for (const side of [-1, 1]) {
    // mirror the outline (not the mesh) so the teardrop droops toward the outside
    const outline = tearPts.map((p) => new THREE.Vector2(p.x * side, p.y));
    const c = face(side * 0.31, 0.08);
    const g = new THREE.Group();
    g.position.set(side * 0.31, 0.08, c.z + 0.11);
    g.rotation.set(0.04, side * 0.22, 0);
    specs.add(g);
    add(new THREE.ShapeGeometry(new THREE.Shape(outline), 24), lens, g);
    tube(outline.map((p) => new THREE.Vector3(p.x, p.y, 0)), 0.013, gold, g, true);
    const ear = hit(side * 3, 0.08, -0.05, -side, 0, 0);
    tube([new THREE.Vector3(side * 0.53, 0.14, c.z + 0.02), new THREE.Vector3(side * (ear.x + 0.02 * side), 0.12, 0.2), new THREE.Vector3(side * (ear.x + 0.01 * side), 0.06, -0.15)], 0.011, gold, specs);
  }
  const bz = face(0, 0.14).z + 0.1;
  tube([new THREE.Vector3(-0.12, 0.13, bz), new THREE.Vector3(0, 0.17, bz + 0.01), new THREE.Vector3(0.12, 0.13, bz)], 0.011, gold, specs);
  tube([new THREE.Vector3(-0.2, 0.22, bz - 0.02), new THREE.Vector3(0.2, 0.22, bz - 0.02)], 0.009, gold, specs);

  head.position.y = 0.3;

  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50);
  camera.position.set(0, -0.22, 7.6);
  camera.lookAt(0, -0.25, 0);

  let lx = 0, ly = 0;
  return {
    root, camera,
    update: (s) => {
      const f = s.face;
      // a reaction when a new line starts: proud/excited hop, concerned sighs into a slow shake
      const r = s.since < 1.1 ? Math.sin((s.since / 1.1) * Math.PI) : 0;
      const nod = s.emotion === "concerned" ? r * 0.06 : r * 0.1;
      const shake = s.emotion === "concerned" ? r * Math.sin(s.since * 9) * 0.07 : 0;
      const hop = s.emotion === "excited" || s.emotion === "proud" ? r * 0.12 : 0;
      const laugh = s.emotion === "excited" && s.since < 1.4 ? Math.sin(s.t * 30) * 0.012 * (1 - s.since / 1.4) : 0;
      root.position.y = Math.sin(s.t * 1.8) * 0.02 + Math.abs(Math.sin(s.t * 3.2)) * f.bounce + hop + laugh;
      ly = lerp(ly, s.px * 0.5 + Math.sin(s.t * 0.6) * 0.06 + f.lookX + shake, 0.08);
      lx = lerp(lx, s.py * 0.25 + nod + f.pitch + (s.talking ? Math.sin(s.t * 7) * 0.03 : 0), 0.1);
      head.rotation.set(lx, ly, f.roll + Math.sin(s.t * 1.1) * 0.03 + (s.talking ? Math.sin(s.t * 3.6) * 0.04 : 0));
      torso.rotation.y = ly * 0.2;
      torso.rotation.x = f.pitch * 0.3;

      const flap = s.talking ? Math.abs(Math.sin(s.t * 13)) * (0.55 + 0.45 * Math.abs(Math.sin(s.t * 2.9))) : 0;
      const open = Math.min(1, f.open + flap);
      for (const m of [mouth, teeth]) { m.morphTargetInfluences![0] = f.smile; m.morphTargetInfluences![1] = open; }
      mouthG.position.x = f.browAsym * 0.04; // thinking: mouth pulls to one side
      mouthG.scale.x = 0.85 + Math.max(0, f.smile) * 0.25; // a grin is wider
      jaw.position.y = -open * 0.1 + Math.max(0, f.smile) * 0.02;
      stache.position.y = flap * 0.02 + Math.max(0, f.smile) * 0.015;
      stache.rotation.z = s.talking ? Math.sin(s.t * 13) * 0.025 : 0;

      for (const c of cheeks) {
        c.position.y = c.userData.y + f.cheek * 0.03;
        c.scale.set(1, 0.8 + f.cheek * 0.06, 0.5 + f.cheek * 0.12);
      }
      specs.position.y = f.cheek * 0.02;

      const talkLift = s.talking ? Math.abs(Math.sin(s.t * 5)) * 0.025 : 0;
      brows.forEach((b, i) => {
        const side = i === 0 ? -1 : 1;
        // + worry lifts the inner ends; asym raises only the right brow and arches it
        b.rotation.z = -side * f.browWorry * 0.32 + (side > 0 ? f.browAsym * 0.1 : 0);
        b.position.y = b.userData.y + f.browLift + talkLift + (side > 0 ? f.browAsym * 0.06 : -f.browAsym * 0.01) - Math.max(0, -f.browWorry) * 0.03;
      });
      for (const e of eyes) e.scale.y = 0.75 * (1 - f.squint * 0.45) * (1 - s.blink * 0.9);

      camera.position.z = lerp(camera.position.z, s.talking ? 7.0 : 7.6, 0.025);
    },
  };
}

function resolveAccent(): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  if (!v) return new THREE.Color("#3b82f6");
  const [h, s, l] = v.split(/\s+/);
  return new THREE.Color(`hsl(${h}, ${s}, ${l})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Coach3D({ emotion, talkKey, talkMs, fallback, width = 80, height = 104 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const talkStart = useRef(-1e9);
  const talkUntil = useRef(0);
  const emotionRef = useRef<CoachEmotion>(emotion);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    talkStart.current = performance.now();
    talkUntil.current = performance.now() + talkMs;
  }, [talkKey, talkMs]);
  useEffect(() => { emotionRef.current = emotion; }, [emotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff0e0, 1.9);
    key.position.set(2.2, 2.8, 4);
    const rim = new THREE.DirectionalLight(0xbcd6ff, 1.8);
    rim.position.set(-3, 2, -3);
    scene.add(key, rim, new THREE.HemisphereLight(0xfff6ee, 0x2a3142, 0.5));

    let disposed = false;
    let rig: Rig | null = null;
    let raf = 0;
    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 350));
      pointer.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 350));
    };
    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });

    const start = (r: Rig) => {
      if (disposed) return;
      rig = r;
      scene.add(r.root);
      host.appendChild(renderer.domElement);
      window.addEventListener("pointermove", onMove, { passive: true });
      io.observe(host);
      const clock = new THREE.Clock();
      let nextBlink = performance.now() + 1800, blinkStart = -1;
      const face: Face = { ...FACES[emotionRef.current] };
      const frame = (now: number, dt: number, t: number) => {
        if (blinkStart < 0 && now > nextBlink) blinkStart = now;
        let blink = 0;
        if (blinkStart >= 0) {
          const p = (now - blinkStart) / 160;
          blink = p < 1 ? 1 - Math.abs(1 - p * 2) : 0;
          if (p >= 1) { blinkStart = -1; nextBlink = now + 2500 + Math.random() * 3000; }
        }
        const target = FACES[emotionRef.current];
        const k = dt ? 1 - Math.exp(-dt * 5) : 1;
        for (const key of FACE_KEYS) face[key] = lerp(face[key], target[key], k);
        r.update({
          now, t, dt, blink, emotion: emotionRef.current, face, px: pointer.x, py: pointer.y,
          talking: now < talkUntil.current, since: (now - talkStart.current) / 1000,
        });
        renderer.render(scene, r.camera);
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        frame(0, 0, 0);
      } else {
        const tick = () => {
          raf = requestAnimationFrame(tick);
          if (!visible || document.hidden) return;
          frame(performance.now(), clock.getDelta(), clock.elapsedTime);
        };
        tick();
      }
      setReady(true);
    };

    loadModel()
      .then(({ scene: s, clips }) => start(gltfRig(s, clips, width / height)))
      .catch(() => start(builtInRig(resolveAccent(), width / height)));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      rig?.dispose?.();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
        }
      });
      envTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [width, height]);

  return (
    <div style={{ position: "relative", width, height }} aria-hidden>
      {(!ready || failed) && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "end center" }}>{fallback}</div>
      )}
      <div ref={hostRef} style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: "opacity 0.4s" }} />
    </div>
  );
}
