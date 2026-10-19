import * as THREE from 'three';
import { rng, deg, lerp, clamp, textTexture, checkerTexture, ringTexture, labelTexture } from './util.js';

const STEP = 1; // metres between centre-line samples

/**
 * Builds the course geometry plus the physics description from a level definition.
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
  for (let k = 0; k < 2; k++) for (let i = 1; i < S.length - 1; i++) S[i].w = (S[i - 1].w + S[i].w + S[i + 1].w) / 3;

  const at = (dist) => S[clamp(Math.round(dist / STEP), 0, S.length - 1)];
  const posAt = (dist, lat = 0) => { const s = at(dist); return new THREE.Vector3(s.x + s.lx * lat, 0, s.z + s.lz * lat); };
  const yawAt = (dist) => { const s = at(dist); return Math.atan2(s.lx, s.lz) + Math.PI / 2; };

  // ---- 2. geometry helpers ------------------------------------------------
  const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  /** Strip between lateral offsets fa(s) and fb(s) at heights ya and yb over the sample range. */
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

  // water: flowing wave highlights + slow colour breathing
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(th.water) }, uLight: { value: new THREE.Color(th.waterLight) } },
    vertexShader: `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec3 uLight; varying vec3 vP;
      void main(){
        float a = sin(vP.x*1.7 + vP.z*1.1 + uTime*1.6) + sin(vP.x*0.6 - vP.z*2.0 - uTime*1.1) + 0.5*sin(vP.x*3.1 + vP.z*0.4 + uTime*2.3);
        float s = smoothstep(1.3,1.9,a);
        float b = 0.5 + 0.5*sin(vP.x*0.25 + vP.z*0.31 + uTime*0.5);
        vec3 c = mix(uColor*(0.92+0.08*b), uLight, s*0.5);
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  group.add(ribbon((s) => -s.w - 0.6, (s) => s.w + 0.6, 0, 0, waterMat, 0, S.length - 1, 1));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), waterMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; group.add(sea);

  // banks
  const H = th.wallH;
  const faceL = ribbon((s) => -s.w - 0.6, (s) => -s.w - 0.6, 0, H, flat(th.bankFace));
  const faceR = ribbon((s) => s.w + 0.6, (s) => s.w + 0.6, H, 0, flat(th.bankFace));
  const topL = ribbon((s) => -s.w - 18, (s) => -s.w - 0.6, H, H, flat(th.bankTop));
  const topR = ribbon((s) => s.w + 0.6, (s) => s.w + 18, H, H, flat(th.bankTop));
  const outerL = ribbon((s) => -s.w - 34, (s) => -s.w - 18, H + 4, H, flat(th.bankTop2));
  const outerR = ribbon((s) => s.w + 18, (s) => s.w + 34, H, H + 4, flat(th.bankTop2));
  [faceL, faceR, topL, topR, outerL, outerR].forEach((m) => { m.material.side = THREE.DoubleSide; group.add(m); });

  // rails along each edge; hazard colour + spikes where a 'spikes' feature covers the segment
  const spikeSegs = feats.filter((f) => f.type === 'spikes');
  const isSpiky = (s, side) => spikeSegs.some((f) => s.d >= f.segStart && s.d <= f.segEnd && (f.side === 'B' || f.side === side));
  const railMatG = flat(th.rail), railMatP = flat(0xff5a36);
  const spikeGeo = new THREE.ConeGeometry(0.28, 0.9, 6);
  const spikeMat = flat(0xfff1c2);
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1; // positive lateral offset = left bank
    let run = [], runSpiky = null;
    const flush = () => {
      if (run.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(run);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, run.length * 2), 0.55, 8, false), runSpiky ? railMatP : railMatG);
      tube.castShadow = true; group.add(tube);
      if (runSpiky) for (let i = 0; i < run.length; i += 3) {
        const p = run[i];
        const m = new THREE.Mesh(spikeGeo, spikeMat);
        m.position.set(p.x, p.y + 0.45, p.z); m.rotation.z = -sign * 0.35; group.add(m);
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

  // ---- 3. decorations by theme ---------------------------------------------
  const place = (every, chance, minOff, spread, fn) => {
    for (let i = 0; i < S.length; i += every) {
      if (rand() > chance) continue;
      const s = S[i];
      const side = rand() < 0.5 ? -1 : 1;
      const off = s.w + minOff + rand() * spread;
      fn(s.x + s.lx * side * off, s.z + s.lz * side * off, side);
    }
  };
  if (th.trees === 'jungle') {
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), crownG = new THREE.ConeGeometry(1.6, 3.4, 7), roundG = new THREE.SphereGeometry(1.5, 7, 6);
    const trunkM = flat(0x8b5a2b), crownM = flat(0x3fae3a), crownM2 = flat(0x6fcf3a);
    place(5, 0.45, 2.5, 12, (px, pz) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.y = H + 1.1;
      const crown = new THREE.Mesh(rand() < 0.5 ? crownG : roundG, rand() < 0.5 ? crownM : crownM2); crown.position.y = H + 3.4; crown.castShadow = true;
      t.add(trunk, crown); t.scale.setScalar(0.7 + rand() * 0.8); t.position.set(px, 0, pz); t.rotation.y = rand() * 6.28; group.add(t);
    });
    const bushM = flat(0x58c43a);
    place(4, 0.3, 1.2, 4, (px, pz) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 6), bushM); b.position.set(px, H + 0.3, pz); b.scale.set(1.2, 0.7, 1.2); group.add(b); });
  } else if (th.trees === 'pine') {
    const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 2, 6), coneG = new THREE.ConeGeometry(1.4, 3.2, 7), capG = new THREE.ConeGeometry(0.9, 1.2, 7);
    const trunkM = flat(0x6b4a2b), pineM = flat(0x2f7d4a), snowM = flat(0xffffff);
    place(5, 0.5, 2.5, 12, (px, pz) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.y = H + 1;
      const c1 = new THREE.Mesh(coneG, pineM); c1.position.y = H + 3.2; c1.castShadow = true;
      const c2 = new THREE.Mesh(coneG, pineM); c2.position.y = H + 4.6; c2.scale.setScalar(0.75);
      const cap = new THREE.Mesh(capG, snowM); cap.position.y = H + 5.9;
      t.add(trunk, c1, c2, cap); t.scale.setScalar(0.7 + rand() * 0.8); t.position.set(px, 0, pz); group.add(t);
    });
  } else if (th.trees === 'dead') {
    const trunkM = flat(0x1f1a1d);
    place(6, 0.4, 2.5, 12, (px, pz) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 3.5, 5), trunkM); trunk.position.y = H + 1.7; t.add(trunk);
      for (let k = 0; k < 3; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 1.6, 4), trunkM); br.position.set(0, H + 2.2 + k * 0.5, 0); br.rotation.z = (k % 2 ? 1 : -1) * 0.8; br.rotation.y = k * 2; br.translateY(0.8); t.add(br); }
      t.scale.setScalar(0.7 + rand() * 0.8); t.position.set(px, 0, pz); t.rotation.y = rand() * 6; group.add(t);
    });
  } else {
    const cactusM = flat(0x4fae5a);
    place(6, 0.35, 2.5, 12, (px, pz) => {
      const c = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2, 4, 8), cactusM); body.position.y = H + 1.3; c.add(body);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), cactusM); arm.position.set(0.55, H + 1.5, 0); arm.rotation.z = -0.3; c.add(arm);
      c.scale.setScalar(0.7 + rand() * 0.7); c.position.set(px, 0, pz); group.add(c);
    });
  }
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rockM = flat(th.decor === 'ice' ? 0xffffff : th.decor === 'lava' ? 0x2a2226 : th.trees === 'jungle' ? 0x9aa0a6 : 0xd9735e);
  place(7, 0.5, 1.5, 20, (px, pz) => {
    const r = new THREE.Mesh(rockG, rockM);
    r.position.set(px, H + 0.2, pz); r.scale.set(0.6 + rand() * 1.6, 0.5 + rand() * 1.2, 0.6 + rand() * 1.6); r.rotation.set(rand(), rand() * 6, rand()); r.castShadow = true; group.add(r);
  });
  if (th.decor === 'lava') {
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff6a1f });
    place(6, 0.35, 1.2, 14, (px, pz) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(1 + rand() * 2, 0.25), glowM); g.rotation.x = -Math.PI / 2; g.rotation.z = rand() * 3; g.position.set(px, H + 0.03, pz); group.add(g); });
  }
  // clouds
  const cloudMat = new THREE.SpriteMaterial({ map: ringTexture.puff(), color: th.cloud, transparent: true, opacity: 0.9, depthWrite: false });
  const clouds = [];
  for (let i = 0; i < S.length; i += 45) {
    const s = S[i];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Sprite(cloudMat);
      const sc = 14 + rand() * 16;
      c.scale.set(sc, sc * 0.5, 1);
      c.position.set(s.x + (rand() - 0.5) * 160, 34 + rand() * 14, s.z + (rand() - 0.5) * 160);
      c.userData.v = 0.4 + rand() * 0.6;
      clouds.push(c); group.add(c);
    }
  }

  // ---- 4. features -> obstacles, fields, pickups + meshes -------------------
  const obstacles = []; // {type:'circle'|'segment', lethal, x,z,r | ax,az,bx,bz,r}
  const fields = [];    // {type:'whirl'|'geyser', x, z, r, ...}
  const pickups = [];   // {x, z, r, taken, mesh}
  const checkpoints = [];
  const boosts = [], ices = [];
  let finishD = length - 10;
  const rollers = [], hammers = [], logs = [], whirls = [], geysers = [], cans = [], lavas = [], traps = [], crushers = [], twisters = [], fans = [], cannons = [], spinners = [];
  const timed = []; // {d, span, safe(t)} hazards the crew must time

  const archMat = flat(0xff8a3d);
  function arch(dist, tex, { h = 7, bannerW = 10, bannerH = 2.4 } = {}) {
    const s = at(dist);
    const g = new THREE.Group();
    const postG = new THREE.CylinderGeometry(0.4, 0.5, h, 8);
    for (const sign of [-1, 1]) {
      const p = new THREE.Mesh(postG, archMat);
      p.position.set(s.lx * sign * (s.w + 0.2), h / 2, s.lz * sign * (s.w + 0.2)); p.castShadow = true; g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((s.w + 0.2) * 2 + 1, 0.5, 0.5), archMat);
    beam.position.y = h - 0.3; g.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerH), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.y = h - 1.7; g.add(banner);
    g.position.set(s.x, 0, s.z); g.rotation.y = yawAt(dist);
    group.add(g);
    return g;
  }
  arch(12, textTexture('START', { bg: '#ffd23f', fg: '#1b1d24', stroke: '#c2410c' }));

  const buoyG = new THREE.SphereGeometry(1.5, 10, 8);
  const buoyM = flat(0x6b3fd6), buoyBandM = flat(0xffd23f);
  const miniSpike = new THREE.ConeGeometry(0.22, 0.8, 5);
  const woodM = flat(0x8a5a2b), woodDark = flat(0x6e4521);
  const ballM = flat(0x4b4b58), chainM = flat(0x2b2b33);
  const canTex = labelTexture('BEANS');

  for (const f of feats) {
    const s = at(f.d);
    const usable = (fr) => fr * (s.w - 2.2);
    if (f.type === 'buoy' || f.type === 'lava') {
      const p = posAt(f.d, usable(f.lat));
      if (f.type === 'buoy') {
        const g = new THREE.Group();
        const b = new THREE.Mesh(buoyG, buoyM); b.scale.y = 0.75; b.position.y = 0.2; b.castShadow = true; g.add(b);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.3, 8, 18), buoyBandM); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; g.add(ring);
        for (let k = 0; k < 8; k++) {
          const sp = new THREE.Mesh(miniSpike, spikeMat);
          const a = (k / 8) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 1.35, 0.55, Math.sin(a) * 1.35); sp.lookAt(Math.cos(a) * 4, 1.4, Math.sin(a) * 4); sp.rotateX(Math.PI / 2); g.add(sp);
        }
        const top = new THREE.Mesh(miniSpike, spikeMat); top.position.y = 1.5; g.add(top);
        g.position.copy(p); group.add(g);
        obstacles.push({ type: 'circle', lethal: true, x: p.x, z: p.z, r: 1.7, kind: 'buoy' });
      } else {
        const g = new THREE.Group();
        const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), new THREE.MeshBasicMaterial({ color: 0xff6a1f }));
        pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; g.add(pool);
        const core = new THREE.Mesh(new THREE.CircleGeometry(1.4, 14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
        core.rotation.x = -Math.PI / 2; core.position.y = 0.05; g.add(core);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.3, 6, 18), flat(0x2a2226)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; g.add(rim);
        g.position.copy(p); group.add(g);
        lavas.push({ g, core, phase: rand() * 6 });
        obstacles.push({ type: 'circle', lethal: true, x: p.x, z: p.z, r: 2.2, kind: 'lava' });
      }
    } else if (f.type === 'roller') {
      const sign = f.side === 'L' ? 1 : -1;
      const len = f.len * s.w * 2;
      const hinge = posAt(f.d, sign * (s.w + 0.3));
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 10), railMatP);
      bar.rotation.z = Math.PI / 2; bar.position.x = sign * len / 2; bar.castShadow = true; g.add(bar);
      for (let k = 0; k < Math.floor(len / 1.2); k++) for (let q = 0; q < 4; q++) {
        const sp = new THREE.Mesh(miniSpike, spikeMat);
        const a = (q / 4) * Math.PI * 2 + k * 0.6;
        sp.position.set(sign * (0.8 + k * 1.2), Math.cos(a) * 0.75, Math.sin(a) * 0.75); sp.rotation.x = -a; g.add(sp);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), archMat); post.position.y = -0.5; g.add(post);
      g.position.set(hinge.x, 0.75, hinge.z); g.rotation.y = yawAt(f.d); group.add(g);
      const end = posAt(f.d, sign * (s.w + 0.3) - sign * len);
      obstacles.push({ type: 'segment', lethal: true, ax: hinge.x, az: hinge.z, bx: end.x, bz: end.z, r: 0.9, kind: 'roller' });
      rollers.push({ bar, speed: 2 + rand() * 2 });
    } else if (f.type === 'gate') {
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
        rail.position.set(mid.x, 1.1, mid.z); rail.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z) + Math.PI / 2; group.add(rail);
        const rail2 = rail.clone(); rail2.position.y = 0.5; group.add(rail2);
        for (let k = 0; k <= len; k += 2.5) {
          const t = k / len;
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 6), postM);
          p.position.set(lerp(pa.x, pb.x, t), 0.9, lerp(pa.z, pb.z, t)); group.add(p);
        }
        obstacles.push({ type: 'segment', lethal: false, ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, r: 0.35, kind: 'gate' });
      }
      for (const gl of [gA, gB]) {
        const p = posAt(f.d, gl);
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), flat(0xffd23f)); flag.position.set(p.x, 2.1, p.z); group.add(flag);
      }
    } else if (f.type === 'hammer') {
      // beam across the channel, arm hanging from the middle, spiked ball sweeping sideways
      const h = 9, arm = 5.6; // ball just skims head height at the bottom of the swing
      const g = new THREE.Group();
      const postG = new THREE.CylinderGeometry(0.4, 0.5, h, 8);
      for (const sign of [-1, 1]) { const p = new THREE.Mesh(postG, chainM); p.position.set(sign * (s.w + 0.4), h / 2, 0); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry((s.w + 0.4) * 2 + 1, 0.5, 0.5), chainM); beam.position.y = h - 0.25; g.add(beam);
      const pivot = new THREE.Group(); pivot.position.y = h - 0.5; g.add(pivot);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, arm, 6), chainM); chain.position.y = -arm / 2; pivot.add(chain);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), ballM); ball.position.y = -arm; ball.castShadow = true; pivot.add(ball);
      for (let k = 0; k < 10; k++) {
        const sp = new THREE.Mesh(miniSpike, spikeMat);
        const a = (k / 10) * Math.PI * 2, b = (k % 2 ? 0.5 : -0.5);
        sp.position.set(Math.cos(a) * 1.1, -arm + Math.sin(b) * 1.1, Math.sin(a) * 1.1); sp.lookAt(Math.cos(a) * 4, -arm + Math.sin(b) * 4, Math.sin(a) * 4); sp.rotateX(Math.PI / 2); pivot.add(sp);
      }
      g.position.set(s.x, 0, s.z); g.rotation.y = yawAt(f.d); group.add(g);
      const ob = { type: 'circle', lethal: true, x: s.x, z: s.z, r: 1.5, kind: 'hammer', active: false };
      obstacles.push(ob);
      const hm = { pivot, ob, s, period: f.period || 3, phase: f.phase || 0, arm, h };
      hammers.push(hm); ob.timed = true;
      timed.push({ d: f.d, span: 4, kind: 'hammer', safe: (t) => Math.abs(1.3 * Math.sin((t * Math.PI * 2) / hm.period + hm.phase)) >= 0.22 });
    } else if (f.type === 'log') {
      const len = f.len || 5;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 9), woodM); body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
      for (const e of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.1, 9), woodDark); cap.rotation.z = Math.PI / 2; cap.position.x = e * len / 2; g.add(cap); }
      g.position.set(s.x, 0.3, s.z); g.rotation.y = yawAt(f.d); group.add(g);
      const ob = { type: 'segment', lethal: false, ax: s.x, az: s.z, bx: s.x, bz: s.z, r: 0.7, kind: 'log' };
      obstacles.push(ob);
      logs.push({ g, body, ob, s, len, speed: f.speed || 1, phase: f.phase || 0, range: s.w - len / 2 - 0.8 });
    } else if (f.type === 'whirl') {
      const p = posAt(f.d, usable(f.lat));
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: 0x1b5fc9, transparent: true, opacity: 0.55 }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
      const swirl = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: ringTexture.swirl(), transparent: true, opacity: 0.85, depthWrite: false }));
      swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.03; g.add(swirl);
      g.position.copy(p); group.add(g);
      whirls.push({ swirl });
      fields.push({ type: 'whirl', x: p.x, z: p.z, r: 6 });
    } else if (f.type === 'geyser') {
      const p = posAt(f.d, usable(f.lat));
      const vent = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 18), flat(0x4b4b58)); vent.rotation.x = Math.PI / 2; vent.position.set(p.x, 0.08, p.z); group.add(vent);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })); glow.rotation.x = -Math.PI / 2; glow.position.set(p.x, 0.06, p.z); group.add(glow);
      const field = { type: 'geyser', x: p.x, z: p.z, r: 3.4, active: false, erupt: 0 };
      fields.push(field);
      geysers.push({ field, glow, period: f.period || 4, phase: f.phase || 0 });
    } else if (f.type === 'can') {
      const p = posAt(f.d, usable(f.lat));
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 14), new THREE.MeshLambertMaterial({ map: canTex })); body.castShadow = true; g.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14), flat(0xc9ced6)); lid.position.y = 0.68; g.add(lid);
      const lid2 = lid.clone(); lid2.position.y = -0.68; g.add(lid2);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: ringTexture.ring(), color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = -0.9; g.add(halo);
      g.position.set(p.x, 1.1, p.z); group.add(g);
      const pk = { x: p.x, z: p.z, r: 1.5, taken: false, mesh: g, phase: rand() * 6 };
      pickups.push(pk); cans.push(pk);
    } else if (f.type === 'ice') {
      ices.push({ d0: f.d, d1: f.d + f.len });
      const from = Math.round(f.d / STEP), to = Math.min(S.length - 1, Math.round((f.d + f.len) / STEP));
      const ice = ribbon((s) => -s.w - 0.6, (s) => s.w + 0.6, 0.015, 0.015, new THREE.MeshLambertMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.75 }), from, to, 2);
      group.add(ice);
      for (let dd = f.d + 3; dd < f.d + f.len; dd += 7) {
        const ss = at(dd);
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(2.5 + rand() * 3, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        crack.rotation.x = -Math.PI / 2; crack.rotation.z = rand() * 3; crack.position.set(ss.x + ss.lx * (rand() - 0.5) * ss.w * 1.4, 0.025, ss.z + ss.lz * (rand() - 0.5) * ss.w * 1.4); group.add(crack);
      }
    } else if (f.type === 'rock') {
      const p = posAt(f.d, usable(f.lat));
      const r = f.r || 1.5;
      const m = new THREE.Mesh(rockG, flat(th.decor === 'ice' ? 0xdfe9f3 : 0x8d8f99));
      m.position.set(p.x, 0.15, p.z); m.scale.set(r, r * 0.8, r); m.rotation.set(rand(), rand() * 6, rand()); m.castShadow = true; group.add(m);
      obstacles.push({ type: 'circle', lethal: false, x: p.x, z: p.z, r: r * 0.9, kind: 'rock' });
    } else if (f.type === 'trap') {
      const p = posAt(f.d, usable(f.lat));
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.25, 16), flat(0x4b4b58)); base.position.y = 0.05; g.add(base);
      const spikes = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 6), spikeMat);
        const a = (k / 7) * Math.PI * 2, rr = k === 0 ? 0 : 1.1;
        sp.position.set(Math.cos(a) * rr, 0.8, Math.sin(a) * rr); spikes.add(sp);
      }
      spikes.position.y = -1.9; g.add(spikes);
      const warn = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0 })); warn.rotation.x = -Math.PI / 2; warn.position.y = 0.2; g.add(warn);
      g.position.copy(p); group.add(g);
      const ob = { type: 'circle', lethal: true, x: p.x, z: p.z, r: 0, kind: 'trap', timed: true };
      obstacles.push(ob);
      const tr = { spikes, warn, ob, period: f.period || 3.5, phase: f.phase || 0 };
      traps.push(tr);
      timed.push({ d: f.d, span: 3.5, kind: 'trap', safe: (t) => { const ph = ((t + tr.phase) % tr.period) / tr.period; return ph > 0.4 && ph < 0.93; } });
    } else if (f.type === 'crusher') {
      const g = new THREE.Group();
      const blocks = [];
      for (const sign of [-1, 1]) {
        const b = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3), flat(0x5a5a68)); box.castShadow = true; b.add(box);
        for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(miniSpike, spikeMat); sp.position.set(-sign * 1.6, (k % 3 - 1) * 0.7, (Math.floor(k / 3) - 0.5) * 1.6); sp.rotation.z = sign * Math.PI / 2; b.add(sp); }
        b.position.set(sign * (s.w + 0.4), 1.1, 0); g.add(b); blocks.push(b);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.3, 0.3), flat(0x2b2b33)); rail.position.set(sign * (s.w / 2 + 0.4), 2.4, 0); g.add(rail);
      }
      g.position.set(s.x, 0, s.z); g.rotation.y = yawAt(f.d); group.add(g);
      const obs = [-1, 1].map((sign) => { const ob = { type: 'circle', lethal: true, x: s.x, z: s.z, r: 1.9, kind: 'crusher', timed: true, sign }; obstacles.push(ob); return ob; });
      const cr = { blocks, obs, s, period: f.period || 4, phase: f.phase || 0, reach: s.w + 0.4 - 2.3 };
      crushers.push(cr);
      timed.push({ d: f.d, span: 3.5, kind: 'crusher', safe: (t) => 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / cr.period + cr.phase) < 0.35 });
    } else if (f.type === 'twister') {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: 0x1b5fc9, transparent: true, opacity: 0.55 }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
      const swirl = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: ringTexture.swirl(), transparent: true, opacity: 0.85, depthWrite: false }));
      swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.03; g.add(swirl);
      g.position.set(s.x, 0, s.z); group.add(g);
      const field = { type: 'whirl', x: s.x, z: s.z, r: 6 };
      fields.push(field);
      twisters.push({ g, swirl, field, s, period: f.period || 6, range: s.w - 3 });
    } else if (f.type === 'fan') {
      const sign = f.side === 'L' ? 1 : -1;          // fan stands on this bank...
      const d0 = f.d, d1 = Math.min(length, f.d + (f.len || 30));
      fields.push({ type: 'fan', d0, d1, dir: -sign, strength: 3.5 }); // ...and blows toward the other
      const mid = at((d0 + d1) / 2);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 4, 8), flat(0x4b4b58)); pole.position.y = H + 2; g.add(pole);
      const hub = new THREE.Group(); hub.position.y = H + 4.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 20), flat(0xffd23f)); hub.add(ring);
      const blades = new THREE.Group();
      for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.08), flat(0xffffff)); bl.position.y = 0.75; const pv = new THREE.Group(); pv.rotation.z = (k / 4) * Math.PI * 2; pv.add(bl); blades.add(pv); }
      hub.add(blades); g.add(hub);
      g.position.set(mid.x + mid.lx * sign * (mid.w + 2.5), 0, mid.z + mid.lz * sign * (mid.w + 2.5));
      g.rotation.y = yawAt((d0 + d1) / 2) + (sign > 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(g);
      const streakM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      for (let dd = d0; dd < d1; dd += 5) { const ss = at(dd); const st = new THREE.Mesh(new THREE.PlaneGeometry(ss.w * 1.6, 0.14), streakM); st.rotation.x = -Math.PI / 2; st.rotation.z = yawAt(dd); st.position.set(ss.x, 0.04, ss.z); group.add(st); }
      fans.push({ blades });
    } else if (f.type === 'cannon') {
      // a cannon on one bank lobs a spiked ball straight across the channel every `period` seconds
      const sign = f.side === 'L' ? 1 : -1;
      const from = posAt(f.d, sign * (s.w + 1.2)), to = posAt(f.d, -sign * (s.w + 1.2));
      const g = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 10), flat(0x2b2b33)); barrel.rotation.z = Math.PI / 2; barrel.position.set(-sign * 0.6, 1.6, 0); g.add(barrel);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), flat(0x6e4521)); base.position.y = 0.6; g.add(base);
      g.position.set(from.x, H, from.z); g.rotation.y = yawAt(f.d); group.add(g);
      const ball = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), ballM); core.castShadow = true; ball.add(core);
      for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(miniSpike, spikeMat); const a = (k / 8) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0); sp.rotation.z = a - Math.PI / 2; ball.add(sp); }
      ball.visible = false; group.add(ball);
      const ob = { type: 'circle', lethal: true, x: from.x, z: from.z, r: 0, kind: 'cannon', timed: true };
      obstacles.push(ob);
      const cn = { ball, ob, from, to, period: f.period || 4, phase: f.phase || 0, flight: 1.3, s };
      cannons.push(cn);
      timed.push({ d: f.d, span: 3, kind: 'cannon', safe: (t) => { const ph = ((t + cn.phase) % cn.period) / cn.period; return ph > cn.flight / cn.period + 0.05 || ph < 0.02; } });
    } else if (f.type === 'spinner') {
      // a bar pinned in mid-channel that turns like a windmill: not deadly, but it bats you about
      const len = f.len || 6;
      const p = posAt(f.d, usable(f.lat || 0));
      const g = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1, 10), flat(0x2b2b33)); hub.position.y = 0.4; g.add(hub);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.6), flat(0xff8a3d)); bar.position.y = 0.7; bar.castShadow = true; g.add(bar);
      for (const e of [-1, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), flat(0xffd23f)); cap.position.set(e * len / 2, 0.7, 0); g.add(cap); }
      g.position.copy(p); group.add(g);
      const ob = { type: 'segment', lethal: false, ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.5, kind: 'spinner' };
      obstacles.push(ob);
      spinners.push({ g, ob, p, len, speed: f.speed || 1.2 });
    } else if (f.type === 'checkpoint') {
      checkpoints.push(f.d);
      arch(f.d, textTexture('CHECKPOINT', { bg: '#ffd23f', font: 'bold 78px "Lilita One", "Archivo", sans-serif' }), { h: 6.5, bannerW: 9, bannerH: 2.2 });
    } else if (f.type === 'boost') {
      boosts.push({ d0: f.d, d1: f.d + f.len });
      const chevM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
      for (let dd = f.d; dd < f.d + f.len; dd += 6) {
        const ss = at(dd);
        const c = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), chevM);
        c.rotation.x = -Math.PI / 2; c.rotation.z = Math.atan2(ss.lx, ss.lz) + Math.PI / 2; c.position.set(ss.x, 0.03, ss.z); group.add(c);
      }
    } else if (f.type === 'finish') {
      finishD = f.d;
      arch(f.d, checkerTexture(), { h: 7.5, bannerW: 12, bannerH: 2.6 });
    }
  }

  // ---- 5. queries --------------------------------------------------------
  function nearest(px, pz, hint = 0) {
    let best = hint, bestD = Infinity;
    const lo = Math.max(0, hint - 40), hi = Math.min(S.length - 1, hint + 40);
    for (let i = lo; i <= hi; i++) { const s = S[i]; const dd = (s.x - px) ** 2 + (s.z - pz) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    if (bestD > 400) for (let i = 0; i < S.length; i += 2) { const s = S[i]; const dd = (s.x - px) ** 2 + (s.z - pz) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    const s = S[best];
    const lat = (px - s.x) * s.lx + (pz - s.z) * s.lz;
    return { i: best, s, lat, d: s.d };
  }
  const currentAt = (dist) => boosts.some((b) => dist >= b.d0 && dist <= b.d1) ? level.current * 2.0 : level.current;
  const iceAt = (dist) => ices.some((b) => dist >= b.d0 && dist <= b.d1);

  /** Advance animated hazards. `t` is the race clock in seconds. */
  function update(t, dt = 0) {
    waterMat.uniforms.uTime.value = t;
    for (const r of rollers) r.bar.rotation.x = t * r.speed;
    for (const h of hammers) {
      const ang = 1.3 * Math.sin((t * Math.PI * 2) / h.period + h.phase);
      h.pivot.rotation.z = ang;
      const lat = -Math.sin(ang) * h.arm;   // local +x is the raft's right = negative lateral
      const height = h.h - 0.5 - Math.cos(ang) * h.arm;
      h.ob.x = h.s.x + h.s.lx * lat; h.ob.z = h.s.z + h.s.lz * lat;
      h.ob.active = height < 2.7; h.ob.r = h.ob.active ? 1.5 : 0;
    }
    for (const l of logs) {
      const lat = Math.sin(t * l.speed * 0.6 + l.phase) * l.range;
      const cx = l.s.x + l.s.lx * lat, cz = l.s.z + l.s.lz * lat;
      l.g.position.set(cx, 0.3 + Math.sin(t * 2 + l.phase) * 0.06, cz);
      l.body.rotation.x = t * 0.8;
      const hx = l.s.lx * l.len / 2, hz = l.s.lz * l.len / 2;
      l.ob.ax = cx - hx; l.ob.az = cz - hz; l.ob.bx = cx + hx; l.ob.bz = cz + hz;
    }
    for (const w of whirls) w.swirl.rotation.z = -t * 1.6;
    for (const g of geysers) {
      const ph = ((t + g.phase) % g.period) / g.period;
      const active = ph < 0.3;
      if (active && !g.field.active) g.field.erupt++;
      g.field.active = active;
      g.glow.material.opacity = active ? 0.9 : 0.25 + 0.2 * Math.sin(t * 6);
      g.glow.scale.setScalar(active ? 1.6 : 1);
    }
    for (const tr of traps) {
      const ph = ((t + tr.phase) % tr.period) / tr.period;
      const up = ph < 0.32;
      const target = up ? 0 : -1.9;
      tr.spikes.position.y += (target - tr.spikes.position.y) * Math.min(1, dt * 14);
      tr.ob.r = tr.spikes.position.y > -0.9 ? 1.6 : 0;
      tr.warn.material.opacity = ph > 0.88 ? 0.4 + 0.4 * Math.sin(t * 30) : 0;
    }
    for (const cr of crushers) {
      const k = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / cr.period + cr.phase);
      cr.blocks.forEach((b, i) => { const sign = i ? 1 : -1; b.position.x = sign * (cr.s.w + 0.4 - k * cr.reach); const lat = -b.position.x; cr.obs[i].x = cr.s.x + cr.s.lx * lat; cr.obs[i].z = cr.s.z + cr.s.lz * lat; });
    }
    for (const tw of twisters) {
      const lat = Math.sin((t * Math.PI * 2) / tw.period) * tw.range;
      tw.field.x = tw.s.x + tw.s.lx * lat; tw.field.z = tw.s.z + tw.s.lz * lat;
      tw.g.position.set(tw.field.x, 0, tw.field.z); tw.swirl.rotation.z = -t * 1.8;
    }
    for (const fn of fans) fn.blades.rotation.z = t * 9;
    for (const cn of cannons) {
      const ph = ((t + cn.phase) % cn.period);
      if (ph < cn.flight) {
        const k = ph / cn.flight;
        const x = cn.from.x + (cn.to.x - cn.from.x) * k, z = cn.from.z + (cn.to.z - cn.from.z) * k;
        cn.ball.visible = true; cn.ball.position.set(x, 1.4 + Math.sin(k * Math.PI) * 1.2, z); cn.ball.rotation.z = t * 8;
        cn.ob.x = x; cn.ob.z = z; cn.ob.r = 1.3;
      } else { cn.ball.visible = false; cn.ob.r = 0; }
    }
    for (const sp of spinners) {
      const a = t * sp.speed;
      sp.g.rotation.y = a;
      const hx = Math.cos(a) * sp.len / 2, hz = -Math.sin(a) * sp.len / 2;
      sp.ob.ax = sp.p.x - hx; sp.ob.az = sp.p.z - hz; sp.ob.bx = sp.p.x + hx; sp.ob.bz = sp.p.z + hz;
    }
    for (const c of cans) if (!c.taken) { c.mesh.position.y = 1.1 + Math.sin(t * 2.5 + c.phase) * 0.15; c.mesh.rotation.y = t * 1.2; }
    for (const l of lavas) l.core.scale.setScalar(1 + 0.12 * Math.sin(t * 3 + l.phase));
    for (const c of clouds) c.position.x += c.userData.v * dt;
  }

  return { group, samples: S, length, finishD, checkpoints, obstacles, fields, pickups, boosts, nearest, at, posAt, currentAt, iceAt, update, theme: th, geysers, hammers, timed };
}
