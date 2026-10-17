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
      const stub = env.BROKER.get(env.BROKER.idFromName('global'));
      return stub.fetch(req);
    }
    return new Response(JSON.stringify({ name: 'Gas Rapids broker', description: 'PeerJS-compatible signaling', ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};

export class Broker {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = new Map(); }

  async fetch(req) {
    const url = new URL(req.url);
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
