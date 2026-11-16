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
  proud:     { smile: 1,     open: 0.5, browLift: 0.05, browWorry: 0,    browAsym: 0,    cheek: 1,   squint: 0.5, pitch: -0.12, roll: 0,     lookX: 0,    bounce: 0.03 },
  excited:   { smile: 0.9,   open: 0.6, browLift: 0.08, browWorry: -0.1, browAsym: 0,    cheek: 0.9, squint: 0.3, pitch: -0.05, roll: 0.05,  lookX: 0,    bounce: 0.06 },
  warm:      { smile: 0.7,   open: 0.35, browLift: 0.02, browWorry: 0.25, browAsym: 0,    cheek: 0.5, squint: 0.3, pitch: 0.03,  roll: 0.1,   lookX: 0,    bounce: 0.015 },
  concerned: { smile: -0.5,  open: 0,   browLift: 0,    browWorry: 1,    browAsym: 0,    cheek: 0,   squint: 0,   pitch: 0.09,  roll: -0.14, lookX: 0,    bounce: 0.008 },
  thinking:  { smile: -0.1,  open: 0,   browLift: 0.01, browWorry: -0.2, browAsym: 1,    cheek: 0.1, squint: 0.2, pitch: -0.14, roll: 0.08,  lookX: 0.3,  bounce: 0.01 },
};
const FACE_KEYS = Object.keys(FACES.warm) as (keyof Face)[];

/** Where his right hand goes for each emotion: x, y, z, then how far the thumb is up (0…1). */
const POSES: Record<CoachEmotion, [number, number, number, number]> = {
  proud:     [-1.12, -1.42, 0.78, 1],
  excited:   [-1.18, -1.22, 0.74, 1],
  warm:      [-1.1,  -1.72, 0.76, 1],
  concerned: [-1.3,  -2.75, 0.5,  0],    // hand drops out of frame
  thinking:  [-0.3,  -1.02, 0.92, 0.25], // fist under the chin
};

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

/** Unit sphere → head: a broad oval with a soft rounded jaw, full cheeks, a strong chin, brow ridge and eye sockets. */
function sculptHead(v: THREE.Vector3) {
  let { x, y, z } = v;
  const lower = Math.max(0, -y);
  x *= 0.88 * (1 - 0.15 * Math.pow(lower, 1.8));
  z *= 0.95 * (1 - 0.1 * lower);
  y *= 1.12;
  if (y < -0.72 && z > 0) z += 0.1 * ((-y - 0.72) / 0.4) * z;      // chin forward
  if (z < 0 && y > -0.25) z *= 1.06;                               // fuller back of skull
  const g = (cx: number, cy: number, s: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (s * s));
  if (z > 0) {
    z += 0.04 * (g(-0.3, 0.33, 0.2) + g(0.3, 0.33, 0.2));          // brow ridge
    z -= 0.06 * (g(-0.3, 0.1, 0.14) + g(0.3, 0.1, 0.14));          // eye sockets
    x *= 1 + 0.035 * (g(-0.55, -0.08, 0.26) + g(0.55, -0.08, 0.26)); // cheekbones
    x *= 1 + 0.04 * (g(-0.5, -0.4, 0.3) + g(0.5, -0.4, 0.3));       // full cheeks
    z += 0.03 * g(0, -0.42, 0.22);                                  // upper lip
  }
  v.set(x, y, z);
}

/** A head-shaped shell; scaleOf(u) sizes each point of the unit sphere (below 1 tucks it inside the head). */
function sculpted(segW: number, segH: number, scaleOf: (u: THREE.Vector3) => number = () => 1) {
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3(), u = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    u.copy(v);
    sculptHead(v);
    v.multiplyScalar(scaleOf(u));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function builtInRig(accent: THREE.Color, aspect: number): Rig {
  const phys = (color: THREE.ColorRepresentation, p: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, ...p });
  // the scene is lit hot (key + rim + room), so albedos sit well below the colour they read as
  const fabric = (color: THREE.ColorRepresentation) => phys(color, {
    roughness: 0.8, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15),
  });
  const skin = phys(0xd89a72, { roughness: 0.5, sheen: 0.4, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffc2a6), clearcoat: 0.06, clearcoatRoughness: 0.6 });
  const skinDeep = phys(0xcf9372, { roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffb194) });
  const hair = phys(0x1c110b, { roughness: 0.68, sheen: 0.25, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x6b4830), envMapIntensity: 0.55 });
  const navy = fabric(0x070f30);
  const navyDeep = fabric(0x050a22);
  const royal = fabric(0x06348f);
  const stripe = fabric(0x9c0f22);
  const lanyard = fabric(0xc49a10);
  const shirt = phys(0xf2f0ea, { roughness: 0.75 });
  const crest = phys(accent, { roughness: 0.35, clearcoat: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.18, metalness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b562, roughness: 0.22, metalness: 1 });
  const sclera = phys(0xf6f2ec, { roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const irisMat = phys(0x6a4a22, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0d0907, roughness: 0.3 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // smile lines, crow's feet and the dimple: faint at rest, deepening as he smiles
  const crease = new THREE.MeshStandardMaterial({ color: 0x8a5238, roughness: 0.8, transparent: true, opacity: 0.1 });
  const ballWhite = phys(0xf4f4f1, { roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const ballBlack = phys(0x15161a, { roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const lipMat = phys(0xb56f58, { roughness: 0.45, sheen: 0.3, sheenColor: new THREE.Color(0xe0907a) });

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
  const rAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1], b = profile[i];
      if (y <= a.y && y >= b.y) return lerp(a.x, b.x, (a.y - y) / (a.y - b.y));
    }
    return profile[profile.length - 1].x;
  };
  // track jacket: navy shoulders and chest, two red chest stripes, royal blue below
  const SPLIT = -1.93;
  const seam = new THREE.Vector2(rAt(SPLIT), SPLIT);
  const panels: [THREE.Vector2[], THREE.Material][] = [
    [[...profile.filter((p) => p.y > SPLIT), seam], navy],
    [[seam, ...profile.filter((p) => p.y < SPLIT)], royal],
  ];
  // (a lathe only faces outward when its profile runs bottom-up)
  for (const [pts, m] of panels) add(new THREE.LatheGeometry([...pts].reverse(), 64), m, torso).scale.set(1.15, 1, 0.62);
  for (const y of [-1.7, -1.83]) {
    const r = rAt(y) * 1.01;
    const ring = add(new THREE.TorusGeometry(1, 0.04, 8, 96), stripe, torso, [0, y, 0]);
    ring.scale.set(r * 1.15, r * 0.62, 1);
    ring.rotation.x = Math.PI / 2;
  }
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 32), skin, torso, [0, -0.72, -0.02]);
  // stand-up jacket collar, open at the front over a white shirt collar
  const GAP = 0.62;
  const collar = new THREE.MeshPhysicalMaterial().copy(navyDeep);
  collar.side = THREE.DoubleSide;
  add(new THREE.CylinderGeometry(0.47, 0.56, 0.34, 48, 1, true, GAP, Math.PI * 2 - GAP * 2), collar, torso, [0, -0.95, -0.02]);
  add(new THREE.CylinderGeometry(0.37, 0.43, 0.3, 40, 1, true), shirt, torso, [0, -0.93, -0.02]);
  for (const side of [-1, 1]) {
    const c = add(new THREE.BoxGeometry(0.26, 0.035, 0.2), shirt, torso, [side * 0.17, -0.92, 0.38]);
    c.rotation.set(0.75, side * -0.3, side * -0.6);
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

  // ── Arms: his right gives the thumbs-up (posed per emotion), his left tucks a football ──
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  /** Stretch a unit-height cylinder from a to b. */
  const place = (m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => {
    tmp.subVectors(b, a);
    const len = tmp.length();
    m.position.copy(a).addScaledVector(tmp, 0.5);
    m.quaternion.setFromUnitVectors(up, tmp.divideScalar(len));
    m.scale.set(1, len, 1);
  };
  const UPPER = 0.95, FORE = 0.95;
  const makeArm = (side: number) => {
    const shoulder = new THREE.Vector3(side * 1.36, -1.7, 0);
    add(new THREE.SphereGeometry(0.31, 24, 18), navy, torso, [shoulder.x, shoulder.y, shoulder.z]);
    const upper = add(new THREE.CylinderGeometry(0.24, 0.3, 1, 24, 1, true), navy, torso);
    const elbowBall = add(new THREE.SphereGeometry(0.24, 20, 16), navy, torso);
    const fore = add(new THREE.CylinderGeometry(0.17, 0.24, 1, 24, 1, true), navy, torso);
    const cuff = add(new THREE.CylinderGeometry(0.185, 0.2, 1, 24), stripe, torso);
    const elbow = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), pole = new THREE.Vector3();
    /** Two-bone IK: the elbow bends down and out so the hand lands on h. */
    return (h: THREE.Vector3) => {
      a.subVectors(h, shoulder);
      const d = Math.min(a.length(), UPPER + FORE - 0.01);
      a.normalize();
      const along = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
      pole.set(side * 0.35, -1, -0.2);
      pole.addScaledVector(a, -pole.dot(a)).normalize();
      elbow.copy(shoulder).addScaledVector(a, along).addScaledVector(pole, Math.sqrt(Math.max(0, UPPER * UPPER - along * along)));
      place(upper, shoulder, elbow);
      elbowBall.position.copy(elbow);
      place(fore, elbow, h);
      place(cuff, a.lerpVectors(elbow, h, 0.78), b.lerpVectors(elbow, h, 0.97));
    };
  };
  const reachRight = makeArm(-1);
  const hand = new THREE.Group(); // a fist with curled fingers and a thumb that pops up
  hand.scale.setScalar(1.3);
  torso.add(hand);
  add(new THREE.SphereGeometry(1, 24, 18), skin, hand).scale.set(0.19, 0.2, 0.17);
  for (let i = 0; i < 4; i++) {
    add(new THREE.CapsuleGeometry(0.052, 0.15, 4, 10), skin, hand, [0.03, 0.13 - i * 0.088, 0.12]).rotation.z = Math.PI / 2;
  }
  const thumb = new THREE.Group();
  thumb.position.set(-0.04, 0.12, 0.05);
  hand.add(thumb);
  add(new THREE.CapsuleGeometry(0.062, 0.2, 6, 12), skin, thumb, [0, 0.15, 0]);
  const pose = new THREE.Vector4(...POSES.warm), poseTo = new THREE.Vector4(), handAt = new THREE.Vector3();

  // football: white with a black pentagon at each icosahedron vertex
  const BALL = 0.5;
  const ball = new THREE.Group();
  ball.position.set(1.02, -2.08, 0.78);
  ball.rotation.set(0.4, 0.3, 0.2);
  torso.add(ball);
  add(new THREE.SphereGeometry(BALL, 40, 28), ballWhite, ball);
  const PHI = (1 + Math.sqrt(5)) / 2;
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    for (const [x, y, z] of [[0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]]) {
      const patch = add(new THREE.SphereGeometry(BALL * 1.03, 5, 2, 0, Math.PI * 2, 0, 0.36), ballBlack, ball);
      patch.quaternion.setFromUnitVectors(up, tmp.set(x, y, z).normalize());
    }
  }
  makeArm(1)(new THREE.Vector3(1.3, -2.5, 1.02));
  const palm = add(new THREE.SphereGeometry(1, 20, 16), skin, torso, [1.24, -2.46, 1.1]);
  palm.scale.set(0.22, 0.12, 0.2);
  palm.rotation.set(0.6, 0, 0.3);

  // ── Head ──
  const head = new THREE.Group();
  root.add(head);
  const skull = add(sculpted(128, 96), skin, head);
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

  // hair: a shell over the skull — short at the sides, a full rounded top parted
  // on his left and swept across to his right, lifting off the forehead in a soft quiff
  const { smoothstep } = THREE.MathUtils;
  const hairShell = (u: THREE.Vector3) => {
    const ax = Math.abs(u.x);
    // hairline: near-level across the forehead, squaring down at the temples to the ears
    const line = u.z >= 0 ? lerp(-0.05, 0.57 - 0.1 * ax * ax, smoothstep(u.z, 0.05, 0.5)) : lerp(-0.05, -0.42, -u.z);
    const top = smoothstep(u.y, 0.2, 0.62); // full height well before the crown, so the top is round, not peaked
    const swept = 1 - 0.55 * smoothstep(u.x, 0.42, 0.6); // flatter on the far side of the part
    const crown = 0.085 * top * swept;
    // body at the upper corners squares the silhouette off; fuller where the sweep lands
    const corners = (u.x < 0 ? 0.1 : 0.06) * Math.exp(-(((ax - 0.6) / 0.25) ** 2) - ((u.y - 0.6) / 0.25) ** 2);
    const quiff = 0.1 * top * smoothstep(u.z, 0.2, 0.75) * Math.exp(-(((u.x + 0.1) / 0.7) ** 2));
    const part = -0.05 * Math.exp(-(((u.x - 0.48) / 0.06) ** 2)) * top;
    // broad strands running from the part across the top
    const strands = Math.sin((0.5 * u.x - u.z + 0.3 * u.y) * 18) * 0.012 * top * swept;
    return lerp(0.9, 1.04 + crown + corners + quiff + part + strands, smoothstep(u.y, line - 0.02, line + 0.05));
  };
  add(sculpted(200, 150, hairShell), hair, head);
  for (const side of [-1, 1]) {
    const p = hit(side * 3, 0.18, 0.28, -side, 0, 0);
    const sb = add(new THREE.SphereGeometry(1, 16, 12), hair, head, [p.x - side * 0.005, p.y, p.z]);
    sb.scale.set(0.035, 0.17, 0.09);
    sb.rotation.y = side * 0.3;
  }

  // eyes: an eyeball in each socket, an iris that follows the pointer, and lids
  // that blink and crease up when he smiles
  const cap = (r: number, angle: number) => new THREE.SphereGeometry(r, 24, 6, 0, Math.PI * 2, 0, angle).rotateX(Math.PI / 2);
  const eyes: { look: THREE.Group; top: THREE.Mesh; bot: THREE.Mesh }[] = [];
  for (const side of [-1, 1]) {
    const p = face(side * 0.3, 0.1);
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z - 0.03);
    g.scale.set(0.15, 0.118, 0.09);
    g.rotation.z = -side * 0.12; // outer corners turn down a touch: a kind look
    head.add(g);
    add(new THREE.SphereGeometry(1, 28, 20), sclera, g);
    const look = new THREE.Group();
    g.add(look);
    add(cap(1.02, 0.8), irisMat, look);
    add(cap(1.04, 0.42), pupilMat, look);
    add(new THREE.SphereGeometry(0.09, 10, 8), glint, look, [0.2, 0.24, 1.02]);
    const top = add(new THREE.SphereGeometry(1.07, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin, g);
    const bot = add(new THREE.SphereGeometry(1.07, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin, g);
    eyes.push({ look, top, bot });
    for (const dy of [0.045, 0.005, -0.035]) { // crow's feet: three short creases off the outer corner
      tube([0.47, 0.495, 0.52].map((x, i) => {
        const p = face(side * x, 0.085 + dy * (0.4 + i * 0.45));
        return p.setZ(p.z + 0.002);
      }), 0.0045, crease, head);
    }
  }

  // nose: bridge + tip + wings, sitting on the face
  const bridgeTop = face(0, 0.2), tipBase = face(0, -0.16);
  const bridge = add(new THREE.SphereGeometry(1, 32, 24), skin, head, [0, 0.02, (bridgeTop.z + tipBase.z) / 2 + 0.05]);
  bridge.scale.set(0.095, 0.23, 0.1);
  bridge.rotation.x = -0.32;
  add(new THREE.SphereGeometry(0.118, 32, 24), skin, head, [0, -0.15, tipBase.z + 0.125]);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.06, 20, 16), skinDeep, head, [side * 0.11, -0.2, tipBase.z + 0.05]);

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
  const lipZ = face(0, lipY).z;
  mouthG.position.set(0, lipY, lipZ + 0.02);
  head.add(mouthG);
  const W = 0.29, N = 24;
  const xs = Array.from({ length: N + 1 }, (_, i) => (i / N * 2 - 1) * W);
  const curl = (x: number) => 0.13 * (x / W) ** 2;            // smile = 1: corners up this much
  const dip = (x: number) => 0.12 * (1 - (x / W) ** 2) ** 0.7; // open = 1: bottom edge drops this much
  const wrap = (x: number, dy = 0) => face(x, lipY + dy).z - lipZ; // hug the face, so the corners never sink in
  const mouthStrip = (thick: number, openFrac: number, mat: THREE.Material, z: number) => {
    const pos: number[] = [], smile: number[] = [], open: number[] = [], idx: number[] = [];
    xs.forEach((x, i) => {
      const zz = wrap(x) + z, lift = wrap(x, curl(x)) - wrap(x);
      pos.push(x, 0, zz, x, -thick * (1 - (x / W) ** 2), zz);
      smile.push(0, curl(x), lift, 0, curl(x), lift);
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
  const teeth = mouthStrip(0.0, 0.62, new THREE.MeshStandardMaterial({ color: 0xf3eee4, roughness: 0.4, side: THREE.DoubleSide }), 0.004);
  const jaw = new THREE.Group(); // lower lip + chin follow the mouth open
  head.add(jaw);
  const lip = add(new THREE.CapsuleGeometry(0.04, 0.26, 6, 16), lipMat, jaw, [0, lipY - 0.06, face(0, lipY - 0.06).z - 0.004]);
  lip.rotation.z = Math.PI / 2;
  lip.scale.x = 0.72; // (the capsule's across-axis, now vertical)

  // smile lines from the nose out around the mustache to the mouth corners, and a dimple on his left cheek
  const onFace = (x: number, y: number) => { const p = face(x, y); return p.setZ(p.z + 0.002); };
  for (const side of [-1, 1]) {
    tube([[0.19, -0.22], [0.35, -0.31], [0.47, -0.45], [0.48, -0.6]].map(([x, y]) => onFace(side * x, y)), 0.007, crease, head);
  }
  const dimple = add(new THREE.SphereGeometry(1, 12, 10), crease, head, onFace(0.56, -0.56).toArray());
  dimple.scale.set(0.014, 0.04, 0.008);

  // the mustache: a thick chevron of overlapping spheres along the upper lip
  const stache = new THREE.Group();
  head.add(stache);
  for (const row of [0, 1]) {
    for (let x = -0.42; x <= 0.4201; x += 0.02) {
      const ax = Math.abs(x) / 0.42;
      const y = -0.385 - 0.06 * Math.pow(ax, 1.6) - row * 0.045;
      const r = (0.085 * (1 - ax * ax) + 0.04) * (row ? 0.8 : 1);
      const p = face(x, y);
      const s = add(new THREE.SphereGeometry(r, 18, 14), hair, stache, [p.x, p.y, p.z + r * 0.45]);
      s.scale.set(1, 0.72, 0.8);
    }
  }

  // brows: arched, thick, following the brow ridge
  const brows: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // pivot at the brow's middle so it can tilt in place (worried / determined)
    const mid = face(side * 0.325, 0.385);
    const g = new THREE.Group();
    g.position.copy(mid);
    head.add(g);
    for (let t = 0; t <= 1.0001; t += 0.08) {
      const x = side * lerp(0.13, 0.52, t);
      const y = 0.355 + Math.sin(t * Math.PI) * 0.05 - t * 0.02;
      const p = face(x, y);
      const r = lerp(0.058, 0.034, t);
      add(new THREE.SphereGeometry(r, 14, 10), hair, g, [p.x - mid.x, p.y - mid.y, p.z + 0.01 - mid.z]).scale.set(1.2, 0.7, 0.7);
    }
    g.userData.y = mid.y;
    brows.push(g);
  }

  head.position.y = 0.3;

  // framed wide enough for the thumbs-up and the ball
  const CAM_Z = 9.2;
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50);
  camera.position.set(0, -0.5, CAM_Z);
  camera.lookAt(0, -0.55, 0);

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

      // right hand eases to this emotion's pose; a new proud/excited line pumps the thumb
      pose.lerp(poseTo.set(...POSES[s.emotion]), s.dt ? 1 - Math.exp(-s.dt * 6) : 1);
      handAt.set(pose.x, pose.y + (hop ? r * 0.14 : 0) + Math.sin(s.t * 1.8) * 0.015, pose.z);
      reachRight(handAt);
      hand.position.copy(handAt);
      hand.rotation.set(0, 0.35, -0.12 + (s.emotion === "excited" ? r * Math.sin(s.since * 16) * 0.14 : 0));
      thumb.scale.y = 0.3 + 0.7 * pose.w;

      const flap = s.talking ? Math.abs(Math.sin(s.t * 13)) * (0.55 + 0.45 * Math.abs(Math.sin(s.t * 2.9))) : 0;
      const open = Math.min(1, f.open + flap);
      for (const m of [mouth, teeth]) { m.morphTargetInfluences![0] = f.smile; m.morphTargetInfluences![1] = open; }
      mouthG.position.x = f.browAsym * 0.04; // thinking: mouth pulls to one side
      mouthG.scale.x = 0.85 + Math.max(0, f.smile) * 0.25; // a grin is wider
      jaw.position.y = -open * 0.1 + Math.max(0, f.smile) * 0.02;
      stache.position.y = flap * 0.02 + Math.max(0, f.smile) * 0.015;
      stache.rotation.z = s.talking ? Math.sin(s.t * 13) * 0.025 : 0;

      crease.opacity = 0.08 + 0.45 * f.cheek;
      for (const c of cheeks) {
        c.position.y = c.userData.y + f.cheek * 0.03;
        c.scale.set(1, 0.8 + f.cheek * 0.06, 0.5 + f.cheek * 0.12);
      }

      const talkLift = s.talking ? Math.abs(Math.sin(s.t * 5)) * 0.025 : 0;
      brows.forEach((b, i) => {
        const side = i === 0 ? -1 : 1;
        // + worry lifts the inner ends; asym raises only the right brow and arches it
        b.rotation.z = -side * f.browWorry * 0.32 + (side > 0 ? f.browAsym * 0.1 : 0);
        b.position.y = b.userData.y + f.browLift + talkLift + (side > 0 ? f.browAsym * 0.06 : -f.browAsym * 0.01) - Math.max(0, -f.browWorry) * 0.03;
      });
      const gazeX = THREE.MathUtils.clamp(s.px * 0.35 + f.lookX * 1.1, -0.5, 0.5);
      const gazeY = THREE.MathUtils.clamp(s.py * 0.25 - f.browAsym * 0.22, -0.35, 0.35);
      for (const e of eyes) {
        e.look.rotation.set(gazeY, gazeX, 0);
        e.top.rotation.x = lerp(-0.64 + f.squint * 0.25 + gazeY * 0.5, 0.34, s.blink);
        e.bot.rotation.x = lerp(0.85 - f.squint * 0.45, 0.22, s.blink);
      }

      camera.position.z = lerp(camera.position.z, s.talking ? CAM_Z - 0.6 : CAM_Z, 0.025);
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
