/**
 * Netcode check: `node sim/netcheck.mjs [latencyMs]`
 * Runs a host raft and a predicting client raft on the same level. The client's inputs reach the host after a delay,
 * host snapshots reach the client after the same delay, and the client reconciles exactly as main.js does.
 * Prints how far the client's predicted raft is from the host's truth, and how much correction the player would see.
 */
const noop = () => {};
const ctx2d = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
globalThis.document = { createElement: (t) => (t === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : { style: {}, remove: noop, appendChild: noop, play: () => Promise.resolve() }), body: { appendChild: noop } };
globalThis.window = globalThis; globalThis.self = globalThis;
const { LEVELS } = await import('../src/levels.js');
const { buildTrack } = await import('../src/track.js');
const { Raft } = await import('../src/raft.js');
const { Bots } = await import('../src/bots.js');
const fx = { gas: noop, ripple: noop, splash: noop, sparkle: noop, geyser: noop, confetti: noop, shake: 0 };
const audio = new Proxy({}, { get: () => noop });

const latency = +(process.argv[2] || 120) / 1000;
const level = LEVELS[0];
const hostTrack = buildTrack(level), clientTrack = buildTrack(level);
const host = new Raft(hostTrack, fx, audio, 4), client = new Raft(clientTrack, fx, audio, 4);
client.predicting = true;
const bots = new Bots(hostTrack);
const ME = 1; // client sits in seat 1, host human in seat 0 (driven by a simple script)
const FR = 1 / 60, FIXED = 1 / 120;
let t = 0, hostAcc = 0, lastSeq = [0, 0, 0, 0], snapT = 0;
const humans = [false, true, false, false];
const inFlight = [], snapFlight = []; // {at, msg}
const P = { seq: 0, buf: [], others: null, lastSnap: null };
let maxErr = 0, sumErr = 0, n = 0, maxCorr = 0, lastDeath = -9;
for (let i = 0; i < 60 * 40; i++) {
  t += FR;
  // scripted inputs: client toots in bursts and steers a little; host seat holds
  const mine = { fart: Math.floor(t / 1.5) % 3 !== 2, aim: Math.sin(t * 0.7) > 0.6 ? 1 : Math.sin(t * 0.7) < -0.6 ? -1 : 0, pop: false };
  // client: predict with my input now
  P.seq++; P.buf.push({ seq: P.seq, inp: { ...mine }, dt: FR }); if (P.buf.length > 240) P.buf.shift();
  inFlight.push({ at: t + latency, msg: { ...mine, q: P.seq } });
  // deliver inputs to host
  let latest = null; while (inFlight.length && inFlight[0].at <= t) latest = inFlight.shift().msg;
  if (latest) { host._in = latest; lastSeq[ME] = latest.q; }
  // host step
  hostTrack.update(t, FR); clientTrack.update(t, FR);
  const botIn = bots.read(host, FR, t, humans, true);
  const hin = humans.map((h, j) => (h ? (host._in ? { fart: host._in.fart, aim: host._in.aim, pop: false } : { fart: false, aim: 0, pop: false }) : botIn[j] || { fart: false, aim: 0, pop: false }));
  hostAcc += FR; while (hostAcc >= FIXED) { host.step(FIXED, hin, t); hostAcc -= FIXED; }
  host.events.length = 0;
  if (t - snapT >= 1 / 30) { snapT = t; snapFlight.push({ at: t + latency, msg: host.snapshot(t, lastSeq.slice()) }); }
  // client: receive snapshot?
  let snap = null; while (snapFlight.length && snapFlight[0].at <= t) snap = snapFlight.shift().msg;
  if (snap) {
    const px = client.x, pz = client.z;
    client.applyAuth(snap, ME);
    P.others = client.players.map((pl, j) => (j === ME ? null : { fart: !!snap.p[j][1], aim: snap.p[j][3], abs: true, pop: false }));
    const acked = snap.q[ME] || 0;
    P.buf = P.buf.filter((e) => e.seq > acked);
    for (const e of P.buf) { const merged = P.others.map((o, j) => (j === ME ? e.inp : o)); client.step(e.dt, merged, t); }
    const corr = Math.hypot(px - client.x, pz - client.z); if (host.alive && t - lastDeath > 2) maxCorr = Math.max(maxCorr, corr);
  } else if (P.others) {
    const merged = P.others.map((o, j) => (j === ME ? mine : o));
    client.step(FR, merged, t);
  }
  client.events.length = 0;
  if (host.retries !== client.retries) lastDeath = t; // a death just propagated
  if (t > 6 && host.alive && t - lastDeath > 2) { const err = Math.hypot(host.x - client.x, host.z - client.z); maxErr = Math.max(maxErr, err); sumErr += err; n++; }
}
console.log(`latency ${Math.round(latency * 1000)} ms: host d=${host.d.toFixed(0)} retries=${host.retries}  client d=${client.d.toFixed(0)}  mean error ${(sumErr / n).toFixed(2)} m  max error ${maxErr.toFixed(2)} m  largest single correction ${maxCorr.toFixed(2)} m`);
