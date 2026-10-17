/**
 * Headless level simulator: `node sim/run.mjs [levelIndex] [seconds]`
 * Drives the back seat with Space held the whole way; the crew bots steer and brake as in the game.
 * Prints finish time, retries, beans, and where each death happened. Used to sanity-check levels and calibrate star times.
 */
const noop = () => {};
const ctx2d = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : { style: {}, remove: noop, appendChild: noop, play: () => Promise.resolve() }), body: { appendChild: noop } };
globalThis.window = globalThis;
globalThis.self = globalThis;

const { LEVELS } = await import('../src/levels.js');
const { buildTrack } = await import('../src/track.js');
const { Raft } = await import('../src/raft.js');
const { Bots } = await import('../src/bots.js');

const fx = { gas: noop, ripple: noop, splash: noop, sparkle: noop, geyser: noop, confetti: noop, shake: 0 };
const audio = new Proxy({}, { get: () => noop });

export function simulate(idx, maxSec = 240, { hold = true } = {}) {
  const level = LEVELS[idx];
  const track = buildTrack(level);
  const raft = new Raft(track, fx, audio);
  const bots = new Bots(track);
  const humans = [true, false, false, false];
  const FIXED = 1 / 120, FRAME = 1 / 60;
  let t = 0, trackTime = 0, acc = 0, lastRet = 0, lastD = 0, lastLat = 0, lastSp = 0;
  const deaths = [];
  let finished = null;
  while (t < maxSec) {
    t += FRAME; trackTime += FRAME;
    track.update(trackTime, FRAME);
    const mine = { fart: hold, aim: 0, pop: false };
    const botIn = bots.read(raft, FRAME, trackTime, humans, hold);
    const merged = humans.map((h, i) => (h ? mine : botIn[i] || { fart: false, aim: 0, pop: false }));
    acc += FRAME;
    while (acc >= FIXED) { raft.step(FIXED, merged, t); acc -= FIXED; }
    if (raft.retries > lastRet) {
      lastRet = raft.retries;
      const p = track.posAt(lastD, lastLat);
      let best = null, bd = 1e9;
      for (const o of track.obstacles) {
        if (!o.lethal) continue;
        const px = o.type === 'circle' ? o.x : (o.ax + o.bx) / 2, pz = o.type === 'circle' ? o.z : (o.az + o.bz) / 2;
        const dd = Math.hypot(px - p.x, pz - p.z); if (dd < bd) { bd = dd; best = o; }
      }
      deaths.push({ d: Math.round(lastD), lat: +lastLat.toFixed(1), sp: +lastSp.toFixed(1), kind: best && best.kind, dist: +bd.toFixed(1), brake: !!bots.braking });
    }
    if (raft.alive) { lastD = raft.d; lastLat = raft.lat; lastSp = Math.hypot(raft.vx, raft.vz); }
    for (const ev of raft.events) if (ev === 'finish') finished = t;
    raft.events.length = 0;
    if (finished) break;
  }
  return { idx, name: level.name, finished: finished && +finished.toFixed(1), retries: raft.retries, cans: raft.cans, d: Math.round(raft.d), finishD: track.finishD, deaths };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('run.mjs')) {
  const which = process.argv[2] !== undefined ? [+process.argv[2]] : LEVELS.map((_, i) => i);
  const maxSec = +(process.argv[3] || 240);
  for (const i of which) {
    const r = simulate(i, maxSec);
    const deaths = r.deaths.slice(0, 6).map((x) => `${x.kind}@d${x.d} lat${x.lat} sp${x.sp} dist${x.dist}${x.brake ? '(braking)' : ''}`).join(', ');
    console.log(`L${i + 1} ${r.name.padEnd(16)} ${r.finished ? 'finish ' + r.finished + 's' : 'TIMEOUT at d=' + r.d + '/' + r.finishD} retries=${r.retries} beans=${r.cans}${deaths ? '  deaths: ' + deaths : ''}`);
  }
}
