/**
 * Gas Rapids broker: a PeerJS-compatible signaling server on Cloudflare Workers + one Durable Object.
 * It only introduces browsers to each other (offer/answer/ICE relay). Game data and voice never pass through here.
 * Runs on Cloudflare's free plan: no card, no server to maintain.
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const QUEUE_TTL = 10_000; // ms to hold a message for a peer that has not connected yet (same as peerjs-server)

function randomId() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname.endsWith('/id')) return new Response(randomId(), { headers: { ...CORS, 'Content-Type': 'text/plain' } });
    if (req.headers.get('Upgrade') === 'websocket' || url.pathname.endsWith('/peers')) {
      // every party gets its own Durable Object: the room code is baked into every peer id (host = PREFIX+CODE, guests = PREFIX+CODE-xxxx)
      const id = url.searchParams.get('id') || '';
      const m = id.match(/^gasrapids-v1-([A-Z0-9]{5})/);
      const stub = env.BROKER.get(env.BROKER.idFromName(m ? 'room:' + m[1] : 'room:' + (id.split('-')[0] || 'misc')));
      return stub.fetch(req);
    }
    if (url.pathname.startsWith('/daily/') || url.pathname.startsWith('/log') || url.pathname.startsWith('/stats')) {
      const stub = env.BROKER.get(env.BROKER.idFromName('global'));
      return stub.fetch(req);
    }
    return new Response(JSON.stringify({ name: 'Toot River broker', description: 'PeerJS-compatible signaling', ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};

export class Broker {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = new Map(); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/daily/')) return this.daily(req, url);
    if (url.pathname.startsWith('/log') || url.pathname.startsWith('/stats')) return this.telemetry(req, url);
    if (url.pathname.endsWith('/peers')) {
      const ids = this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() || {}).id).filter(Boolean);
      return new Response(JSON.stringify(ids), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const id = url.searchParams.get('id'), token = url.searchParams.get('token');
    if (!id || !token) return new Response('Missing id or token', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (this.ctx.getWebSockets(id).length > 0) {
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } }));
      server.close(1008, 'ID is taken');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, token });
    server.send(JSON.stringify({ type: 'OPEN' }));
    const q = this.queue.get(id);
    if (q) { this.queue.delete(id); for (const { msg } of q) try { server.send(JSON.stringify(msg)); } catch {} }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Crash reports and play counts, so testers' problems and traction are visible without any third-party service. */
  async telemetry(req, url) {
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const day = new Date().toISOString().slice(0, 10);
    if (req.method === 'POST' && url.pathname === '/log') {
      let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400); }
      const list = (await this.ctx.storage.get('log')) || [];
      list.unshift({ at: new Date().toISOString(), msg: String(b.msg || '').slice(0, 300), stack: String(b.stack || '').slice(0, 800), where: String(b.where || '').slice(0, 200), ua: String(b.ua || '').slice(0, 160), v: String(b.v || '').slice(0, 20) });
      await this.ctx.storage.put('log', list.slice(0, 200));
      return json({ ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/log/recent') return json({ errors: ((await this.ctx.storage.get('log')) || []).slice(0, +(url.searchParams.get('n') || 50)) });
    if (req.method === 'POST' && url.pathname === '/stats/play') {
      let b; try { b = await req.json(); } catch { b = {}; }
      const key = 'stats:' + day;
      const s = (await this.ctx.storage.get(key)) || { plays: 0, online: 0, daily: 0, crews: {} };
      s.plays++; if (b.online) s.online++; if (b.level === 'daily') s.daily++;
      const c = String(Math.min(4, Math.max(1, +b.crew || 1))); s.crews[c] = (s.crews[c] || 0) + 1;
      await this.ctx.storage.put(key, s);
      return json({ ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      const out = {};
      for (let i = 0; i < 14; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const s = await this.ctx.storage.get('stats:' + d); if (s) out[d] = s; }
      return json(out);
    }
    return json({ error: 'route' }, 404);
  }

  /** Daily River leaderboard: GET /daily/top?day=YYYY-MM-DD, POST /daily/score {day, name, time, crew}. Best time per name, top 100 kept. */
  async daily(req, url) {
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const dayOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    if (req.method === 'GET' && url.pathname === '/daily/top') {
      const day = url.searchParams.get('day');
      if (!dayOk(day)) return json({ error: 'day' }, 400);
      const list = (await this.ctx.storage.get('daily:' + day)) || [];
      return json({ day, top: list.slice(0, 20) });
    }
    if (req.method === 'POST' && url.pathname === '/daily/score') {
      let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400); }
      const day = String(b.day || ''), name = String(b.name || 'Player').slice(0, 12).replace(/[^\w .'-]/g, ''), time = +b.time, crew = Math.min(4, Math.max(1, +b.crew || 1));
      if (!dayOk(day) || !(time > 10 && time < 3600)) return json({ error: 'bad' }, 400);
      const key = 'daily:' + day;
      let list = (await this.ctx.storage.get(key)) || [];
      const i = list.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
      if (i >= 0) { if (time < list[i].time) list[i] = { name, time, crew }; }
      else list.push({ name, time, crew });
      list.sort((a, b2) => a.time - b2.time); list = list.slice(0, 100);
      await this.ctx.storage.put(key, list);
      return json({ ok: true, rank: list.findIndex((e) => e.name === name) + 1, top: list.slice(0, 20) });
    }
    return json({ error: 'route' }, 404);
  }

  webSocketMessage(ws, data) {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    const { id } = ws.deserializeAttachment() || {};
    if (!id || msg.type === 'HEARTBEAT' || !msg.dst) return;
    msg.src = id;
    const targets = this.ctx.getWebSockets(msg.dst);
    if (targets.length) { for (const t of targets) try { t.send(JSON.stringify(msg)); } catch {} return; }
    if (msg.type === 'OFFER' || msg.type === 'ANSWER' || msg.type === 'CANDIDATE') {
      const now = Date.now();
      const q = (this.queue.get(msg.dst) || []).filter((e) => now - e.at < QUEUE_TTL);
      q.push({ at: now, msg }); this.queue.set(msg.dst, q);
      return;
    }
    if (msg.type !== 'LEAVE' && msg.type !== 'EXPIRE') try { ws.send(JSON.stringify({ type: 'EXPIRE', src: msg.dst, dst: id })); } catch {}
  }

  webSocketClose(ws) { try { ws.close(); } catch {} }
  webSocketError(ws) { try { ws.close(); } catch {} }
}
