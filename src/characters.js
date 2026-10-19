import * as THREE from 'three';
import { loadModel } from './models.js';

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const white = mat(0xffffff), black = mat(0x1b1d24), pinkM = mat(0xff8fb1);

/** Seat roster: index 0 sits at the back of the raft, then clockwise. */
export const ROSTER = [
  { kind: 'skunk', name: 'Stinky', color: '#3b3b48', emoji: '🦨' },
  { kind: 'pig', name: 'Porkchop', color: '#f28ab8', emoji: '🐷' },
  { kind: 'frog', name: 'Ribbit', color: '#5ad34a', emoji: '🐸' },
  { kind: 'seal', name: 'Blubber', color: '#7f9ec4', emoji: '🦭' },
];

function eyes(parent, y, z, size, spread, lidColor) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 9, 9), white);
    e.position.set(s * spread, y, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 7, 7), black);
    p.position.set(0, 0.02, size * 0.72);
    e.add(p);
    if (lidColor) { const lid = new THREE.Mesh(new THREE.SphereGeometry(size * 1.05, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), lidColor); lid.position.y = 0.02; e.add(lid); }
    parent.add(e);
  }
}

/**
 * Builds a chunky low-poly animal from primitives. Local +z is the animal's front (it faces the raft centre).
 * Returns { group, setFart(active), update(t) }.
 */
export function makeAnimal(kind) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  g.add(body); body.add(head);

  const spec = {
    skunk: { c: 0x3b3b48, c2: 0xf3f3f8, bodyR: 0.85, headY: 1.3 },
    pig: { c: 0xf28ab8, c2: 0xffc2da, bodyR: 0.98, headY: 1.35 },
    frog: { c: 0x5ad34a, c2: 0xe9f78a, bodyR: 0.9, headY: 1.15 },
    seal: { c: 0x7f9ec4, c2: 0xc9d9ee, bodyR: 0.9, headY: 1.3 },
  }[kind];
  const skin = mat(spec.c), belly = mat(spec.c2);

  // body: a squat sphere, sitting
  const b = new THREE.Mesh(new THREE.SphereGeometry(spec.bodyR, 12, 10), skin);
  b.scale.set(1, 0.95, kind === 'seal' ? 1.15 : 0.9); b.position.y = 0.75; b.castShadow = true;
  body.add(b);
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(spec.bodyR * 0.72, 10, 8), belly);
  tummy.scale.set(1, 0.9, 0.5); tummy.position.set(0, 0.62, spec.bodyR * 0.6);
  body.add(tummy);

  if (kind === 'seal') {
    // flippers instead of arms, a tail fin behind
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.9), skin);
      f.position.set(s * spec.bodyR * 0.95, 0.5, 0.6); f.rotation.y = s * -0.5; f.rotation.z = s * 0.3; body.add(f);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.5), skin);
    tail.position.set(0, 0.35, -spec.bodyR * 1.1); body.add(tail);
  } else {
    // arms reaching forward to the rim, legs tucked
    const armG = new THREE.CylinderGeometry(0.17, 0.2, 1.1, 7);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(armG, skin);
      a.position.set(s * spec.bodyR * 0.8, 0.8, 0.55); a.rotation.x = -1.25; a.rotation.z = s * 0.25; body.add(a);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), kind === 'frog' ? skin : belly);
      paw.position.set(s * spec.bodyR * 0.95, 0.5, 1.05); body.add(paw);
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), skin);
      leg.position.set(s * spec.bodyR * 0.65, 0.3, 0.5); leg.scale.set(1, 0.7, 1.3); body.add(leg);
    }
  }
  if (kind === 'skunk') {
    // white stripe down the back and a big bushy tail
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.6), belly);
    stripe.position.set(0, 1.2, -0.35); stripe.rotation.x = 0.5; body.add(stripe);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.6, 9, 8), skin);
    tail.scale.set(0.8, 1.6, 0.8); tail.position.set(0, 1.35, -1.05); tail.rotation.x = 0.55; body.add(tail);
    const tailStripe = new THREE.Mesh(new THREE.SphereGeometry(0.62, 9, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), belly);
    tailStripe.scale.copy(tail.scale); tailStripe.position.copy(tail.position); tailStripe.rotation.x = 0.55 - 1.2; body.add(tailStripe);
  }
  if (kind === 'pig') {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10, Math.PI * 1.5), skin);
    curl.position.set(0.15, 0.9, -spec.bodyR * 0.95); body.add(curl);
  }

  // head
  head.position.set(0, spec.headY, 0.35);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), skin);
  if (kind === 'frog') h.scale.set(1.25, 0.8, 1.05);
  h.castShadow = true; head.add(h);

  if (kind === 'skunk') {
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 8), skin);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.1, 0.75); head.add(snout);
    const faceStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.3), belly);
    faceStripe.position.set(0, 0.35, 0.5); faceStripe.rotation.x = -0.6; head.add(faceStripe);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), pinkM); nose.position.set(0, -0.08, 1.15); head.add(nose);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 5), skin); e.position.set(s * 0.4, 0.55, -0.05); head.add(e); }
    eyes(head, 0.12, 0.5, 0.15, 0.26);
  } else if (kind === 'pig') {
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.3, 10), belly);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.1, 0.65); head.add(snout);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), mat(0xd4537f)); n.position.set(s * 0.11, -0.08, 0.81); head.add(n);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.08), skin); ear.position.set(s * 0.45, 0.5, 0.05); ear.rotation.z = s * -0.6; ear.rotation.x = -0.4; head.add(ear);
    }
    eyes(head, 0.15, 0.5, 0.14, 0.27);
  } else if (kind === 'frog') {
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.5), mat(0x2a7d2a));
    mouth.position.set(0, -0.12, 0.45); head.add(mouth);
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), belly);
    throat.position.set(0, -0.3, 0.35); throat.scale.set(1.3, 0.7, 1); head.add(throat);
    eyes(head, 0.5, 0.25, 0.22, 0.42, skin); // eyes on top with lids
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), mat(0xd77a3a)); c.position.set(s * 0.6, 0.1, 0.3); head.add(c); }
  } else if (kind === 'seal') {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 8), belly);
    muzzle.position.set(0, -0.15, 0.55); muzzle.scale.set(1.3, 0.8, 1); head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), black); nose.position.set(0, 0.0, 0.88); head.add(nose);
    const wG = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4);
    for (const s of [-1, 1]) for (const k of [-0.12, 0.05]) {
      const w = new THREE.Mesh(wG, white); w.position.set(s * 0.35, -0.15 + k, 0.75); w.rotation.z = Math.PI / 2 + s * 0.2; w.rotation.y = s * 0.3; head.add(w);
    }
    eyes(head, 0.18, 0.5, 0.15, 0.25);
  }
  // angry brows when straining
  const browG = new THREE.BoxGeometry(0.26, 0.06, 0.08);
  const brows = [];
  for (const s of [-1, 1]) {
    const br = new THREE.Mesh(browG, black);
    br.position.set(s * (kind === 'frog' ? 0.42 : 0.27), kind === 'frog' ? 0.78 : 0.4, kind === 'frog' ? 0.3 : 0.55); br.rotation.z = s * -0.35; br.visible = false;
    head.add(br); brows.push(br);
  }

  let fart = 0, cheer = false, phase = Math.random() * 10, lastT = null;
  // the primitive build above is the instant placeholder; the real model replaces it once loaded
  let model = null, mixer = null;
  const headless = typeof window === 'undefined' || !window.requestAnimationFrame;
  if (!headless) loadModel(kind).then((m) => {
    model = m.group; mixer = m.mixer;
    g.remove(body);
    model.position.y = 0.05;
    g.add(model);
  }).catch(() => {});
  return {
    group: g,
    setFart(active) { fart = active ? Math.min(1, fart + 0.3) : Math.max(0, fart - 0.08); },
    setCheer(on) { cheer = on; },
    update(t) {
      const dt = lastT == null ? 0 : Math.min(0.1, t - lastT); lastT = t;
      const bob = Math.sin(t * 2.2 + phase) * 0.03;
      const hop = cheer ? Math.abs(Math.sin(t * 7 + phase)) * 0.35 : 0;
      const target = model || body;
      target.position.y = (model ? 0.05 : 0) + bob - fart * 0.18 + hop;
      target.scale.set(1 + fart * 0.12, 1 - fart * 0.16 + (cheer ? 0.05 : 0), 1 + fart * 0.1);
      // strain: lean back and quiver while tooting, nod while cheering
      target.rotation.x = -fart * 0.22 + (cheer ? Math.sin(t * 9 + phase) * 0.12 : 0);
      target.rotation.z = fart ? Math.sin(t * 40) * 0.05 * fart : 0;
      if (!model) {
        head.scale.setScalar(1 + fart * 0.14);
        head.rotation.x = -fart * 0.25 + Math.sin(t * 3 + phase) * 0.03 + (cheer ? -0.3 : 0);
        for (const br of brows) br.visible = fart > 0.3;
      }
      if (mixer) mixer.update(dt * (fart ? 2.5 : 1));
    },
  };
}
