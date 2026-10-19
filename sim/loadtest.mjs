/**
 * Broker load test: `node sim/loadtest.mjs [connections] [seconds] [host]`
 * Opens N PeerJS-style WebSocket clients against the signaling broker, heartbeats like the real client,
 * and relays small OFFER messages between pairs to measure round-trip time through the broker.
 */
const N = +(process.argv[2] || 100), SECS = +(process.argv[3] || 30);
const HOST = process.argv[4] || 'toot-river-broker.gas-rapids.workers.dev';
const salt = Math.random().toString(36).slice(2, 5).toUpperCase();
const room = (i) => (salt.slice(0, 2) + Math.floor(i / 2).toString(36).padStart(3, '0')).toUpperCase();
const ids = Array.from({ length: N }, (_, i) => (i % 2 === 0 ? `gasrapids-v1-${room(i)}` : `gasrapids-v1-${room(i)}-${process.pid}${i}`));
const socks = [], rtts = []; let opened = 0, failed = 0, received = 0, closedEarly = 0;
const t0 = Date.now();
await Promise.all(ids.map((id, i) => new Promise((res) => {
  const ws = new WebSocket(`wss://${HOST}/peerjs?key=peerjs&id=${id}&token=t${i}&version=1.5.4`);
  const timer = setTimeout(() => { failed++; res(); }, 15000);
  ws.onopen = () => { opened++; clearTimeout(timer); res(); };
  ws.onerror = () => { failed++; clearTimeout(timer); res(); };
  ws.onclose = () => { if (Date.now() - t0 < SECS * 1000 - 500) closedEarly++; };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'OFFER' && m.payload && m.payload.sent) { received++; rtts.push(Date.now() - m.payload.sent); }
  };
  socks[i] = ws;
})));
console.log(`opened ${opened}/${N} (failed ${failed}) in ${Date.now() - t0} ms`);
const hb = setInterval(() => { for (const ws of socks) if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'HEARTBEAT' })); }, 5000);
const relay = setInterval(() => {
  for (let i = 0; i + 1 < N; i += 2) {
    const a = socks[i], b = ids[i + 1];
    if (a.readyState === 1) a.send(JSON.stringify({ type: 'OFFER', dst: b, payload: { sent: Date.now() } }));
  }
}, 1000);
await new Promise((r) => setTimeout(r, SECS * 1000));
clearInterval(hb); clearInterval(relay);
for (const ws of socks) try { ws.close(); } catch {}
rtts.sort((a, b) => a - b);
const p = (q) => rtts.length ? rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * q))] : null;
console.log(`relayed ${received} messages over ${SECS}s; rtt median ${p(0.5)} ms, p90 ${p(0.9)} ms, max ${p(1)} ms; connections dropped early: ${closedEarly}`);
