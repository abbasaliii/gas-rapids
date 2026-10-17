import * as THREE from 'three';
import { rng, deg, lerp, clamp, textTexture, checkerTexture } from './util.js';

const STEP = 1; // metres between centre-line samples

/**
 * Builds the course geometry and a physics description from a level definition.
 * World: y up, the course starts at the origin heading -z.
 */
export function buildTrack(level) {
  const rand = rng(level.seed);
  const group = new THREE.Group();
  const th = level.theme;

  // ---- 1. walk the path -------------------------------------------------
  const S = []; // samples {x,z,tx,tz,lx,lz,w,d}
  let x = 0, z = 0, heading = 0; // heading 0 = -z
  let w = level.startW, d = 0;
  const push = () => S.push({ x, z, tx: Math.sin(heading), tz: -Math.cos(heading), lx: -Math.cos(heading), lz: -Math.sin(heading), w, d });
  push();
  const feats = [];
  let prevW = level.startW;
  for (const seg of level.segments) {
    const n = Math.round(seg.len / STEP);
    const segStart = d;
    for (let i = 1; i <= n; i++) {
      heading += deg(seg.turn) / n;
      x += Math.sin(heading) * STEP;
      z += -Math.cos(heading) * STEP;
      d += STEP;
      w = lerp(prevW, seg.w, i / n);
      push();
    }
    for (const f of seg.f || []) feats.push({ ...f, d: segStart + (f.at ?? 0.5) * seg.len, segStart, segEnd: d });
    prevW = seg.w;
  }
  const length = d;
  // small smoothing of width transitions
  for (let k = 0; k < 2; k++) for (let i = 1; i < S.length - 1; i++) S[i].w = (S[i - 1].w + S[i].w + S[i + 1].w) / 3;

  const at = (dist) => S[clamp(Math.round(dist / STEP), 0, S.length - 1)];
  const posAt = (dist, lat = 0) => { const s = at(dist); return new THREE.Vector3(s.x + s.lx * lat, 0, s.z + s.lz * lat); };

  // ---- 2. geometry helpers ------------------------------------------------
  const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  /** Strip between lateral offsets fa(s) and fb(s) at heights ya and yb. */
  function ribbon(fa, fb, ya, yb, mat, from = 0, to = S.length - 1, every = 2) {
    const pos = [], idx = [];
    let row = 0;
    for (let i = from; i <= to; i += every) {
      const s = S[Math.min(i, S.length - 1)];
      const a = fa(s), b = fb(s);
      pos.push(s.x + s.lx * a, ya, s.z + s.lz * a, s.x + s.lx * b, yb, s.z + s.lz * b);
      if (row > 0) { const k = row * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      row++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  // water (custom shader: animated flow stripes + darker edges)
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(th.water) }, uLight: { value: new THREE.Color(0xaee6ff) } },
    vertexShader: `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec3 uLight; varying vec3 vP;
      void main(){
        float a = sin(vP.x*1.7 + vP.z*1.1 + uTime*1.6) + sin(vP.x*0.6 - vP.z*2.0 - uTime*1.1) + 0.5*sin(vP.x*3.1 + vP.z*0.4 + uTime*2.3);
        float s = smoothstep(1.3,1.9,a);
        vec3 c = mix(uColor, uLight, s*0.5);
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  const water = ribbon((s) => -s.w - 0.6, (s) => s.w + 0.6, 0, 0, waterMat, 0, S.length - 1, 1);
  group.add(water);
  // the world beyond the banks: a sea of the same water far below the terraces, and a wide ground plane
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), waterMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; group.add(sea);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), flat(th.bankTop2));
  ground.rotation.x = -Math.PI / 2; ground.position.y = th.wallH + 3.9; ground.visible = false; group.add(ground);

  // banks: vertical face + top terrace on both sides, plus a far outer slope
  const H = th.wallH;
  const faceL = ribbon((s) => -s.w - 0.6, (s) => -s.w - 0.6, 0, H, flat(th.bankFace));
  const faceR = ribbon((s) => s.w + 0.6, (s) => s.w + 0.6, H, 0, flat(th.bankFace));
  const topL = ribbon((s) => -s.w - 18, (s) => -s.w - 0.6, H, H, flat(th.bankTop));
  const topR = ribbon((s) => s.w + 0.6, (s) => s.w + 18, H, H, flat(th.bankTop));
  const outerL = ribbon((s) => -s.w - 34, (s) => -s.w - 18, H + 4, H, flat(th.bankTop2));
  const outerR = ribbon((s) => s.w + 18, (s) => s.w + 34, H, H + 4, flat(th.bankTop2));
  [faceL, faceR, topL, topR, outerL, outerR].forEach((m) => { m.material.side = THREE.DoubleSide; group.add(m); });

  // rails (tube along each edge). Pink + spikes where a 'spikes' feature covers the segment.
  const spikeSegs = feats.filter((f) => f.type === 'spikes');
  const isSpiky = (s, side) => spikeSegs.some((f) => s.d >= f.segStart && s.d <= f.segEnd && (f.side === 'B' || f.side === side));
  const railMatG = flat(th.rail), railMatP = flat(0xff3fa0);
  const spikeGeo = new THREE.ConeGeometry(0.28, 0.9, 6);
  const spikeMat = flat(0xffffff);
  const spikeMeshes = [];
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1; // positive lateral offset = left bank
    // split into runs of same material
    let run = [], runSpiky = null;
    const flush = () => {
      if (run.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(run);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, run.length * 2), 0.55, 8, false), runSpiky ? railMatP : railMatG);
      tube.castShadow = true;
      group.add(tube);
      if (runSpiky) {
        for (let i = 0; i < run.length; i += 3) {
          const p = run[i];
          const m = new THREE.Mesh(spikeGeo, spikeMat);
          m.position.set(p.x, p.y + 0.45, p.z);
          const s = at(i * 3 * STEP);
          m.rotation.z = -sign * 0.35; // lean slightly inward
          spikeMeshes.push(m);
          group.add(m);
        }
      }
    };
    for (let i = 0; i < S.length; i += 3) {
      const s = S[i];
      const sp = isSpiky(s, side);
      if (runSpiky !== null && sp !== runSpiky) { flush(); run = [run[run.length - 1]]; }
      runSpiky = sp;
      run.push(new THREE.Vector3(s.x + s.lx * sign * (s.w + 0.3), 0.35, s.z + s.lz * sign * (s.w + 0.3)));
    }
    flush();
  }

  // ---- 3. decorations ----------------------------------------------------
  if (th.trees) {
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
    const crownG = new THREE.ConeGeometry(1.6, 3.4, 7);
    const roundG = new THREE.SphereGeometry(1.5, 7, 6);
    const trunkM = flat(0x8b5a2b), crownM = flat(0x3fae3a), crownM2 = flat(0x6fcf3a);
    for (let i = 0; i < S.length; i += 5) {
      if (rand() > 0.55) continue;
      const s = S[i];
      const side = rand() < 0.5 ? -1 : 1;
      const off = s.w + 2.5 + rand() * 12;
      const px = s.x + s.lx * side * off, pz = s.z + s.lz * side * off;
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.y = H + 1.1;
      const crown = new THREE.Mesh(rand() < 0.5 ? crownG : roundG, rand() < 0.5 ? crownM : crownM2);
      crown.position.y = H + 3.4; crown.castShadow = true;
      t.add(trunk, crown);
      const sc = 0.7 + rand() * 0.8;
      t.scale.setScalar(sc);
      t.position.set(px, 0, pz);
      t.rotation.y = rand() * 6.28;
      group.add(t);
    }
  }
  // rocks everywhere
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rockM = flat(th.trees ? 0x9aa0a6 : 0xd9735e);
  for (let i = 0; i < S.length; i += 7) {
    if (rand() > 0.5) continue;
    const s = S[i];
    const side = rand() < 0.5 ? -1 : 1;
    const off = s.w + 1.5 + rand() * 20;
    const r = new THREE.Mesh(rockG, rockM);
    r.position.set(s.x + s.lx * side * off, H + 0.2, s.z + s.lz * side * off);
    r.scale.set(0.6 + rand() * 1.6, 0.5 + rand() * 1.2, 0.6 + rand() * 1.6);
    r.rotation.set(rand(), rand() * 6, rand());
    r.castShadow = true;
    group.add(r);
  }

  // ---- 4. features -> obstacles + meshes ---------------------------------
  const obstacles = []; // {type:'circle'|'segment', lethal, x,z,r | ax,az,bx,bz,r}
  const checkpoints = []; // distances
  const boosts = []; // {d0,d1}
  let finishD = length - 10;
  const rollers = [];

  const archMat = flat(0xff8a3d);
  function arch(dist, tex, { h = 7, bannerW = 10, bannerH = 2.4 } = {}) {
    const s = at(dist);
    const g = new THREE.Group();
    const postG = new THREE.CylinderGeometry(0.4, 0.5, h, 8);
    for (const sign of [-1, 1]) {
      const p = new THREE.Mesh(postG, archMat);
      p.position.set(s.lx * sign * (s.w + 0.2), h / 2, s.lz * sign * (s.w + 0.2));
      p.castShadow = true; g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((s.w + 0.2) * 2 + 1, 0.5, 0.5), archMat);
    beam.position.y = h - 0.3; g.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerH), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.y = h - 1.7; g.add(banner);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = Math.atan2(s.lx, s.lz) + Math.PI / 2; // face along the track
    group.add(g);
    return g;
  }

  arch(12, textTexture('START', { bg: '#ffd23f', fg: '#1b1d24', stroke: '#c2410c' }));

  const buoyG = new THREE.SphereGeometry(1.5, 10, 8);
  const buoyM = flat(0xd62f4a);
  const buoyBandM = flat(0x2ec4b6);
  const miniSpike = new THREE.ConeGeometry(0.22, 0.8, 5);
  for (const f of feats) {
    const s = at(f.d);
    if (f.type === 'buoy') {
      const lat = f.lat * (s.w - 2.2);
      const p = posAt(f.d, lat);
      const g = new THREE.Group();
      const b = new THREE.Mesh(buoyG, buoyM); b.scale.y = 0.75; b.position.y = 0.2; b.castShadow = true; g.add(b);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.3, 8, 18), buoyBandM); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; g.add(ring);
      for (let k = 0; k < 8; k++) {
        const sp = new THREE.Mesh(miniSpike, spikeMat);
        const a = (k / 8) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 1.35, 0.55, Math.sin(a) * 1.35);
        sp.lookAt(Math.cos(a) * 4, 1.4, Math.sin(a) * 4);
        sp.rotateX(Math.PI / 2);
        g.add(sp);
      }
      const top = new THREE.Mesh(miniSpike, spikeMat); top.position.y = 1.5; g.add(top);
      g.position.copy(p);
      group.add(g);
      obstacles.push({ type: 'circle', lethal: true, x: p.x, z: p.z, r: 1.7, mesh: g });
    } else if (f.type === 'roller') {
      const sign = f.side === 'L' ? 1 : -1;
      const len = f.len * s.w * 2;
      const hinge = posAt(f.d, sign * (s.w + 0.3));
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 10), railMatP);
      bar.rotation.z = Math.PI / 2; bar.position.x = sign * len / 2; bar.castShadow = true; // lateral +1 (left bank) is local -x, so the bar runs toward +x
      g.add(bar);
      for (let k = 0; k < Math.floor(len / 1.2); k++) {
        for (let q = 0; q < 4; q++) {
          const sp = new THREE.Mesh(miniSpike, spikeMat);
          const a = (q / 4) * Math.PI * 2 + k * 0.6;
          sp.position.set(sign * (0.8 + k * 1.2), Math.cos(a) * 0.75, Math.sin(a) * 0.75);
          sp.rotation.x = -a; // point outward (cone points +y, rotate around x)
          g.add(sp);
        }
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), archMat); post.position.y = -0.5; g.add(post);
      g.position.set(hinge.x, 0.75, hinge.z);
      g.rotation.y = Math.atan2(s.lx, s.lz) + Math.PI / 2;
      group.add(g);
      const end = posAt(f.d, sign * (s.w + 0.3) - sign * len);
      obstacles.push({ type: 'segment', lethal: true, ax: hinge.x, az: hinge.z, bx: end.x, bz: end.z, r: 0.9 });
      rollers.push({ bar, speed: 2 + rand() * 2 });
    } else if (f.type === 'gate') {
      // fence across the channel with a gap
      const gapC = f.gap * (s.w - f.gw / 2 - 0.5);
      const left = -s.w - 0.3, right = s.w + 0.3;
      const gA = gapC - f.gw / 2, gB = gapC + f.gw / 2;
      const fenceM = flat(0xffffff), postM = flat(0xff8a3d);
      for (const [a, b] of [[left, gA], [gB, right]]) {
        if (b - a < 0.5) continue;
        const pa = posAt(f.d, a), pb = posAt(f.d, b);
        const len = pa.distanceTo(pb);
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.35), fenceM);
        rail.position.set(mid.x, 1.1, mid.z);
        rail.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z) + Math.PI / 2;
        group.add(rail);
        const rail2 = rail.clone(); rail2.position.y = 0.5; group.add(rail2);
        for (let k = 0; k <= len; k += 2.5) {
          const t = k / len;
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 6), postM);
          p.position.set(lerp(pa.x, pb.x, t), 0.9, lerp(pa.z, pb.z, t));
          group.add(p);
        }
        obstacles.push({ type: 'segment', lethal: false, ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, r: 0.35 });
      }
      // flags marking the gap
      for (const gl of [gA, gB]) {
        const p = posAt(f.d, gl);
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), flat(0xffd23f));
        flag.position.set(p.x, 2.1, p.z); group.add(flag);
      }
    } else if (f.type === 'checkpoint') {
      checkpoints.push(f.d);
      arch(f.d, textTexture('CHECKPOINT', { bg: '#ffd23f', font: 'bold 78px "Lilita One", "Archivo", sans-serif' }), { h: 6.5, bannerW: 9, bannerH: 2.2 });
    } else if (f.type === 'boost') {
      boosts.push({ d0: f.d, d1: f.d + f.len });
      // chevrons on the water
      const chevM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
      for (let dd = f.d; dd < f.d + f.len; dd += 6) {
        const ss = at(dd);
        const c = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), chevM);
        c.rotation.x = -Math.PI / 2; c.rotation.z = Math.atan2(ss.lx, ss.lz) + Math.PI / 2;
        c.position.set(ss.x, 0.03, ss.z);
        group.add(c);
      }
    } else if (f.type === 'finish') {
      finishD = f.d;
      arch(f.d, checkerTexture(), { h: 7.5, bannerW: 12, bannerH: 2.6 });
    }
  }

  // ---- 5. queries --------------------------------------------------------
  /** Nearest centre-line sample to (x,z). `hint` is a previous index for a fast local search. */
  function nearest(px, pz, hint = 0) {
    let best = hint, bestD = Infinity;
    const lo = Math.max(0, hint - 40), hi = Math.min(S.length - 1, hint + 40);
    for (let i = lo; i <= hi; i++) { const s = S[i]; const dd = (s.x - px) ** 2 + (s.z - pz) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    if (bestD > 400) { // lost: global search
      for (let i = 0; i < S.length; i += 2) { const s = S[i]; const dd = (s.x - px) ** 2 + (s.z - pz) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    }
    const s = S[best];
    const lat = (px - s.x) * s.lx + (pz - s.z) * s.lz;
    return { i: best, s, lat, d: s.d };
  }
  const currentAt = (dist) => boosts.some((b) => dist >= b.d0 && dist <= b.d1) ? level.current * 2.0 : level.current;

  function update(t) {
    waterMat.uniforms.uTime.value = t;
    for (const r of rollers) r.bar.rotation.x = t * r.speed;
  }

  return { group, samples: S, length, finishD, checkpoints, obstacles, boosts, nearest, at, posAt, currentAt, update, theme: th };
}
