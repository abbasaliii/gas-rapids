/**
 * Party networking. Everything is peer-to-peer over WebRTC:
 *  - game data on PeerJS data connections (host runs the simulation, clients send inputs, host streams snapshots)
 *  - voice on PeerJS media calls in a full mesh (every player hears every other player)
 * The only outside service is the free PeerJS broker, used once to introduce peers to each other.
 */
import Peer from 'peerjs';
export { Peer };

const PREFIX = 'gasrapids-v1-';
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
// Our own broker (server/ folder, Cloudflare Worker). Set VITE_PEER_HOST in .env; without it the public PeerJS broker is used.
const BROKER = import.meta.env.VITE_PEER_HOST
  ? { host: import.meta.env.VITE_PEER_HOST, port: 443, secure: true, path: '/', key: 'peerjs' }
  : {};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export class Net {
  constructor() {
    this.role = null; this.peer = null; this.code = null; this.name = '';
    this.conns = new Map();            // peerId -> DataConnection (host side)
    this.hostConn = null;              // client side
    this.seats = [null, null, null, null]; // {id, name}
    this.inputs = [null, null, null, null]; // host side: latest input per seat
    this.level = 0; this.mySeat = -1;
    this.listeners = {};
    this.voice = new Voice(this);
  }
  on(ev, cb) { (this.listeners[ev] ||= []).push(cb); return this; }
  emit(ev, ...a) { for (const cb of this.listeners[ev] || []) cb(...a); }
  get connected() { return !!this.peer && !this.peer.destroyed; }

  _peer(id) {
    return new Promise((resolve, reject) => {
      const opts = { ...BROKER, config: ICE };
      const p = id ? new Peer(id, opts) : new Peer(opts);
      p.on('open', () => resolve(p));
      p.on('error', (e) => { this.emit('error', e); reject(e); });
      p.on('disconnected', () => { try { p.reconnect(); } catch {} });
    });
  }

  async host(name) {
    this.name = name;
    this.code = makeCode();
    this.peer = await this._peer(PREFIX + this.code);
    this.role = 'host'; this.mySeat = 0;
    this.seats[0] = { id: this.peer.id, name };
    this.peer.on('connection', (c) => this._accept(c));
    this.peer.on('call', (call) => this.voice.answer(call));
    this.emit('lobby', this.lobby());
    return this.code;
  }

  _accept(c) {
    c.on('open', () => {
      this.conns.set(c.peer, c);
      c.on('data', (d) => this._hostData(c, d));
      c.on('close', () => this._drop(c.peer));
      c.on('error', () => this._drop(c.peer));
    });
  }
  _drop(id) {
    this.conns.delete(id);
    const i = this.seats.findIndex((s) => s && s.id === id);
    if (i >= 0) { this.seats[i] = null; this.inputs[i] = null; }
    this.voice.drop(id);
    this.broadcast(this.lobby()); this.emit('lobby', this.lobby());
  }
  _hostData(c, d) {
    if (d.t === 'hello') {
      let i = this.seats.findIndex((s) => !s);
      if (i < 0) { c.send({ t: 'full' }); c.close(); return; }
      this.seats[i] = { id: c.peer, name: String(d.name || 'Guest').slice(0, 12) };
      c.send({ t: 'welcome', seat: i });
      this.broadcast(this.lobby()); this.emit('lobby', this.lobby());
    } else if (d.t === 'in') {
      const i = this.seats.findIndex((s) => s && s.id === c.peer);
      if (i >= 0) this.inputs[i] = { fart: !!d.f, aim: +d.a || 0, pop: !!d.p || !!(this.inputs[i] && this.inputs[i].pop) }; // pops latch until the host consumes them
    }
  }
  lobby() { return { t: 'lobby', code: this.code, level: this.level, seats: this.seats.map((s) => (s ? { id: s.id, name: s.name } : null)) }; }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  setLevel(l) { this.level = l; this.broadcast(this.lobby()); this.emit('lobby', this.lobby()); }

  async join(code, name) {
    this.name = name; this.code = code.toUpperCase().trim();
    this.peer = await this._peer();
    this.role = 'client';
    this.peer.on('call', (call) => this.voice.answer(call));
    const c = this.peer.connect(PREFIX + this.code, { reliable: false, serialization: 'json' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No party with that code (or the host is offline)')), 12000);
      c.on('open', () => { clearTimeout(timer); resolve(); });
      c.on('error', (e) => { clearTimeout(timer); reject(e); });
      this.peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    this.hostConn = c;
    c.on('data', (d) => {
      if (d.t === 'welcome') this.mySeat = d.seat;
      else if (d.t === 'lobby') { this.level = d.level; this.seats = d.seats; }
      this.emit(d.t, d);
    });
    c.on('close', () => this.emit('closed'));
    c.send({ t: 'hello', name });
  }
  sendHost(msg) { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); }
  sendInput(inp) {
    const m = { t: 'in', f: inp.fart ? 1 : 0, a: +inp.aim.toFixed(2), p: inp.pop ? 1 : 0 };
    const key = m.f + '|' + m.a + '|' + m.p;
    const now = performance.now();
    if (key !== this._lastKey || now - (this._lastSent || 0) > 100) { this._lastKey = key; this._lastSent = now; this.sendHost(m); }
  }
  /** every peer id in the party except ours */
  others() { return this.seats.filter((s) => s && s.id !== this.peer?.id).map((s) => s.id); }
  leave() {
    try { this.voice.stop(); this.peer && this.peer.destroy(); } catch {}
    this.peer = null; this.role = null; this.conns.clear(); this.hostConn = null;
    this.seats = [null, null, null, null]; this.inputs = [null, null, null, null]; this.mySeat = -1;
  }
}

/** Voice mesh. The peer with the smaller id places the call so each pair has exactly one call. */
class Voice {
  constructor(net) {
    this.net = net; this.stream = null; this.calls = new Map(); // peerId -> {call, audio, analyser}
    this.muted = false; this.ctx = null; this.silent = null; this.levels = new Map(); this.speaking = new Set();
  }
  async enable() {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      this._meter('me', this.stream);
      // swap the real mic into any call that started with the silent placeholder
      for (const { call } of this.calls.values()) this._replaceTrack(call);
      return true;
    } catch (e) { this.net.emit('error', new Error('Microphone blocked: ' + e.message)); return false; }
  }
  _silentStream() {
    this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!this.silent) { const dst = this.ctx.createMediaStreamDestination(); this.silent = dst.stream; }
    return this.silent;
  }
  _replaceTrack(call) {
    const pc = call.peerConnection; if (!pc) return;
    const track = this.stream?.getAudioTracks()[0]; if (!track) return;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
    if (sender) sender.replaceTrack(track);
  }
  setMuted(m) { this.muted = m; if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = !m; }
  /** call everyone we should be calling (called whenever the lobby changes) */
  sync() {
    const me = this.net.peer?.id; if (!me) return;
    for (const id of this.net.others()) {
      if (this.calls.has(id) || id > me) continue; // the smaller id calls
      const call = this.net.peer.call(id, this.stream || this._silentStream());
      if (call) this._attach(id, call);
    }
  }
  answer(call) {
    call.answer(this.stream || this._silentStream());
    this._attach(call.peer, call);
  }
  _attach(id, call) {
    const audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true;
    document.body.appendChild(audio);
    const entry = { call, audio };
    this.calls.set(id, entry);
    call.on('stream', (s) => { audio.srcObject = s; audio.play().catch(() => {}); this._meter(id, s); });
    call.on('close', () => this.drop(id));
    call.on('error', () => this.drop(id));
  }
  _meter(id, stream) {
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this.levels.set(id, { an, buf: new Uint8Array(an.frequencyBinCount) });
    } catch {}
  }
  /** returns the set of peer ids (plus 'me') currently speaking */
  poll() {
    this.speaking.clear();
    for (const [id, { an, buf }] of this.levels) {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i += 4) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / (buf.length / 4));
      if (rms > 0.035 && !(id === 'me' && this.muted)) this.speaking.add(id);
    }
    return this.speaking;
  }
  drop(id) {
    const e = this.calls.get(id); if (!e) return;
    try { e.call.close(); } catch {}
    e.audio.remove(); this.calls.delete(id); this.levels.delete(id);
  }
  stop() {
    for (const id of [...this.calls.keys()]) this.drop(id);
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.levels.clear();
  }
}
