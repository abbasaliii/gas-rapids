import * as THREE from 'three';

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const white = mat(0xffffff), black = mat(0x1b1d24);

/** Seat roster: index 0 sits at the back of the raft, then clockwise. */
export const ROSTER = [
  { kind: 'hippo', name: 'Hippo', color: '#5b7fb5', emoji: '🦛' },
  { kind: 'capy', name: 'Capy', color: '#e07a2e', emoji: '🦫' },
  { kind: 'croc', name: 'Croc', color: '#5fcf3a', emoji: '🐊' },
  { kind: 'bear', name: 'Bear', color: '#5a3b2a', emoji: '🐻' },
];

function eyes(parent, x, y, z, size = 0.16, spread = 0.26) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), white);
    e.position.set(x + s * spread, y, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 6, 6), black);
    p.position.set(0, 0.02, size * 0.7);
    e.add(p);
    parent.add(e);
  }
}

/**
 * Builds a chunky low-poly animal from primitives. Local +z is the animal's front.
 * Returns { group, setFart(active, t), update(t) }.
 */
export function makeAnimal(kind) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  g.add(body); body.add(head);

  const spec = {
    hippo: { c: 0x5b7fb5, c2: 0x8aa8d6, bodyR: 0.95, headY: 1.35, snout: [0.95, 0.55, 0.7], ear: 0.16 },
    capy: { c: 0xe07a2e, c2: 0xf2b27a, bodyR: 0.85, headY: 1.3, snout: [0.62, 0.5, 0.6], ear: 0.14 },
    croc: { c: 0x5fcf3a, c2: 0xa8ef7a, bodyR: 0.8, headY: 1.2, snout: [0.6, 0.35, 1.2], ear: 0 },
    bear: { c: 0x5a3b2a, c2: 0xb8865f, bodyR: 0.95, headY: 1.4, snout: [0.55, 0.42, 0.5], ear: 0.22 },
  }[kind];
  const skin = mat(spec.c), belly = mat(spec.c2);

  // body: a squat sphere, sitting
  const b = new THREE.Mesh(new THREE.SphereGeometry(spec.bodyR, 12, 10), skin);
  b.scale.set(1, 0.95, 0.9); b.position.y = 0.75; b.castShadow = true;
  body.add(b);
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(spec.bodyR * 0.72, 10, 8), belly);
  tummy.scale.set(1, 0.9, 0.5); tummy.position.set(0, 0.62, spec.bodyR * 0.6);
  body.add(tummy);
  // arms reaching forward to the rim
  const armG = new THREE.CylinderGeometry(0.17, 0.2, 1.1, 7);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(armG, skin);
    a.position.set(s * spec.bodyR * 0.8, 0.8, 0.55);
    a.rotation.x = -1.25; a.rotation.z = s * 0.25;
    body.add(a);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), belly);
    paw.position.set(s * spec.bodyR * 0.95, 0.5, 1.05);
    body.add(paw);
    // legs tucked
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), skin);
    leg.position.set(s * spec.bodyR * 0.65, 0.3, 0.5); leg.scale.set(1, 0.7, 1.3);
    body.add(leg);
  }
  // head
  head.position.set(0, spec.headY, 0.35);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), skin);
  h.castShadow = true; head.add(h);
  const sn = new THREE.Mesh(new THREE.BoxGeometry(...spec.snout), kind === 'croc' ? skin : belly);
  sn.position.set(0, -0.12, 0.45 + spec.snout[2] / 2 - 0.1);
  head.add(sn);
  if (kind === 'croc') {
    // teeth + ridges
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), white);
      t.position.set(s * 0.22, -0.3, 0.55 + i * 0.22); t.rotation.x = Math.PI; head.add(t);
    }
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), mat(0x3f9f2a));
      r.position.set(0, 1.5 - i * 0.1, -0.25 - i * 0.35); body.add(r);
    }
    const nostrils = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), black); nostrils.position.set(0.15, 0.08, 1.05); head.add(nostrils);
    const n2 = nostrils.clone(); n2.position.x = -0.15; head.add(n2);
  } else {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(kind === 'hippo' ? 0.1 : 0.13, 6, 6), black);
    nose.position.set(kind === 'hippo' ? 0.22 : 0, kind === 'hippo' ? 0.05 : 0.02, 0.45 + spec.snout[2] - 0.05);
    head.add(nose);
    if (kind === 'hippo') { const n2 = nose.clone(); n2.position.x = -0.22; head.add(n2); }
  }
  if (spec.ear > 0) for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(spec.ear, 7, 6), skin);
    e.position.set(s * 0.48, 0.5, -0.05); head.add(e);
    const ei = new THREE.Mesh(new THREE.SphereGeometry(spec.ear * 0.55, 6, 5), belly);
    ei.position.set(0, 0, 0.08); e.add(ei);
  }
  eyes(head, 0, 0.18, 0.5, kind === 'croc' ? 0.19 : 0.15, kind === 'croc' ? 0.3 : 0.27);
  // angry brows when straining
  const browG = new THREE.BoxGeometry(0.26, 0.06, 0.08);
  const brows = [];
  for (const s of [-1, 1]) {
    const br = new THREE.Mesh(browG, black);
    br.position.set(s * 0.27, 0.4, 0.55); br.rotation.z = s * -0.35; br.visible = false;
    head.add(br); brows.push(br);
  }

  let fart = 0, phase = Math.random() * 10;
  return {
    group: g,
    setFart(active) { fart = active ? Math.min(1, fart + 0.3) : Math.max(0, fart - 0.08); },
    update(t) {
      const bob = Math.sin(t * 2.2 + phase) * 0.03;
      body.position.y = bob - fart * 0.18;
      body.scale.set(1 + fart * 0.12, 1 - fart * 0.16, 1 + fart * 0.1);
      head.scale.setScalar(1 + fart * 0.14);
      head.rotation.x = -fart * 0.25 + Math.sin(t * 3 + phase) * 0.03;
      head.rotation.z = fart ? Math.sin(t * 40) * 0.06 * fart : 0;
      for (const br of brows) br.visible = fart > 0.3;
    },
  };
}
