import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { buildTrack } from './track.js';
import { Raft } from './raft.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { Input, KEYMAP } from './input.js';
import { Bots } from './bots.js';
import { Hud } from './hud.js';
import { ROSTER } from './characters.js';
import { Net } from './net.js';
import { fmtTime } from './util.js';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 400);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(30, 60, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x6b8e3a, 1.4));
const effects = new Effects(scene);
const audio = new Audio();
const input = new Input();
input.bindTouch(document.getElementById('touch'));
const net = new Net();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- ui
const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title'), finish: $('finish'), seats: $('seats'), start: $('start'), again: $('again'), menu: $('menu'),
  sound: $('opt-sound'), bots: $('opt-bots'), level: $('opt-level'),
  fTime: $('f-time'), fSub: $('f-sub'), fBest: $('f-best'), fWait: $('f-wait'),
  online: $('online'), party: $('party'), setup: $('party-setup'), lobby: $('party-lobby'), pname: $('pname'), pcode: $('pcode'),
  host: $('host'), join: $('join'), partyErr: $('party-error'), partyBack: $('party-back'), codeOut: $('code-out'), invite: $('invite-link'),
  copy: $('copy'), lobbySeats: $('lobby-seats'), lobbyLevel: $('lobby-level'), lobbyLevelWrap: $('lobby-level-wrap'), mic: $('mic'), micHud: $('mic-hud'),
  lobbyStatus: $('lobby-status'), lobbyStart: $('lobby-start'), leave: $('leave'),
};
let G = null;       // current game
let mode = 'title'; // title | party | game | finish
let clock = 0;

function show(screen) {
  for (const s of [ui.title, ui.party, ui.finish]) s.hidden = s !== screen;
}

function renderSeats() {
  ui.seats.innerHTML = ROSTER.map((r, i) => `
    <div class="seat ${input.claimed[i] ? 'human' : ''}" style="--c:${r.color}">
      <div class="face">${r.emoji}</div>
      <div class="who">${r.name}</div>
      <div class="role">${input.claimed[i] ? 'YOU' : ui.bots.checked ? 'BOT' : 'empty'}</div>
      <kbd>${KEYMAP[i].label}</kbd>
    </div>`).join('');
}
input.onClaim(() => { if (mode === 'title') renderSeats(); if (G && !G.online) G.hud.setRoles(localRoles()); });
ui.bots.addEventListener('change', renderSeats);
renderSeats();
const localRoles = () => input.claimed.map((c) => c || !ui.bots.checked);

// ---------------------------------------------------------------- game setup
function startGame(opts = {}) {
  audio.init(); audio.setEnabled(ui.sound.checked);
  if (G) scene.remove(G.track.group, G.raft.mesh);
  const online = opts.online || null; // 'host' | 'client' | null
  const levelIdx = online ? net.level : +ui.level.value;
  const level = LEVELS[levelIdx];
  const track = buildTrack(level);
  scene.add(track.group);
  scene.background = new THREE.Color(level.theme.fog);
  scene.fog = new THREE.Fog(level.theme.fog, 90, 260);
  const raft = new Raft(track, effects, audio);
  scene.add(raft.mesh);
  if (online) raft.players.forEach((p, i) => { p.name = net.seats[i] ? net.seats[i].name : p.name; });
  const hud = new Hud(raft.players);
  hud.setTicks(track.checkpoints, track.length);
  hud.show(true);
  G = { level, online, track, raft, bots: new Bots(track), hud, time: 0, phase: online === 'client' ? 'client' : 'countdown', cd: 3.9, cdShown: null, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camInit: false, snap: null, lastSnap: 0 };
  if (online) {
    hud.setRoles(net.seats.map((s, i) => (!s ? false : i === net.mySeat ? true : s.name)));
    ui.micHud.hidden = false;
  } else {
    if (!input.claimed.some(Boolean)) input.claim(0); // someone has to be the player
    hud.setRoles(localRoles());
    ui.micHud.hidden = true;
  }
  show(null);
  mode = 'game';
}

function showFinish(time, retries, level, isClient) {
  ui.fTime.textContent = fmtTime(time);
  ui.fSub.textContent = `${level.name} · ${retries} ${retries === 1 ? 'retry' : 'retries'}`;
  try {
    const key = 'gasrapids-best-' + level.name;
    const best = +localStorage.getItem(key) || null;
    if (!best || time < best) { localStorage.setItem(key, time); ui.fBest.textContent = best ? `New best! Previous ${fmtTime(best)}` : 'First finish. That is the time to beat.'; }
    else ui.fBest.textContent = `Best ${fmtTime(best)}`;
  } catch { ui.fBest.textContent = ''; }
  ui.again.hidden = isClient; ui.menu.textContent = G.online ? 'Back to party' : 'Menu'; ui.fWait.hidden = !isClient;
  show(ui.finish);
  G.hud.show(false);
  mode = 'finish';
}

function finishGame() {
  const { raft, level } = G;
  audio.fanfare();
  G.phase = 'finished';
  G.hud.toast('FINISH!');
  if (G.online === 'host') net.broadcast({ t: 'end', time: G.time, retries: raft.retries });
  const game = G;
  setTimeout(() => { if (G === game) showFinish(G.time, raft.retries, level, false); }, 1600);
}

ui.start.addEventListener('click', () => startGame());
ui.again.addEventListener('click', () => { if (G && G.online === 'host') hostStart(); else startGame(); });
ui.menu.addEventListener('click', () => {
  if (G && G.online) { show(ui.party); mode = 'party'; renderLobby(); }
  else { show(ui.title); mode = 'title'; renderSeats(); }
  if (G) G.hud.show(false);
});
ui.sound.addEventListener('change', () => audio.setEnabled(ui.sound.checked));
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (mode === 'title' && e.code === 'Space') startGame();
  if (mode === 'finish' && e.code === 'Space' && !(G && G.online === 'client')) ui.again.click();
  if (e.code === 'Escape' && mode === 'game') ui.menu.click();
  if (e.code === 'KeyM' && net.connected) toggleMic();
});

// ---------------------------------------------------------------- party
function partyError(msg) { ui.partyErr.textContent = msg || ''; }
function inviteUrl(code) { const u = new URL(location.href); u.search = '?room=' + code; return u.toString(); }
ui.online.addEventListener('click', () => { show(ui.party); ui.setup.hidden = false; ui.lobby.hidden = true; mode = 'party'; partyError(''); ui.pname.focus(); });
ui.partyBack.addEventListener('click', () => { net.leave(); show(ui.title); mode = 'title'; });
ui.leave.addEventListener('click', () => { net.leave(); ui.setup.hidden = false; ui.lobby.hidden = true; show(ui.title); mode = 'title'; });
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.invite.value); ui.copy.textContent = 'Copied!'; }
  catch { ui.invite.select(); ui.copy.textContent = 'Select and copy'; }
  setTimeout(() => (ui.copy.textContent = 'Copy invite link'), 1800);
});
const myName = () => (ui.pname.value.trim() || 'Player').slice(0, 12);
try { ui.pname.value = localStorage.getItem('gasrapids-name') || ''; } catch {}

async function enterLobby() {
  try { localStorage.setItem('gasrapids-name', myName()); } catch {}
  ui.setup.hidden = true; ui.lobby.hidden = false;
  ui.codeOut.textContent = net.code; ui.invite.value = inviteUrl(net.code);
  ui.lobbyLevelWrap.style.display = net.role === 'host' ? '' : 'none';
  ui.lobbyStart.hidden = net.role !== 'host';
  ui.lobbyLevel.value = String(net.level);
  renderLobby();
  const ok = await net.voice.enable();
  setMicUi(ok ? !net.voice.muted : null);
  net.voice.sync();
}
ui.host.addEventListener('click', async () => {
  partyError(''); ui.host.disabled = true;
  try { audio.init(); await net.host(myName()); await enterLobby(); }
  catch (e) { partyError('Could not reach the party service: ' + (e.message || e.type || e)); net.leave(); }
  ui.host.disabled = false;
});
ui.join.addEventListener('click', async () => {
  const code = ui.pcode.value.trim().toUpperCase();
  if (code.length < 5) return partyError('Enter the 5-letter party code.');
  partyError(''); ui.join.disabled = true;
  try { audio.init(); await net.join(code, myName()); await enterLobby(); }
  catch (e) { partyError(e.message || 'Could not join'); net.leave(); }
  ui.join.disabled = false;
});
ui.lobbyLevel.addEventListener('change', () => { if (net.role === 'host') net.setLevel(+ui.lobbyLevel.value); });
function setMicUi(on) {
  const label = on === null ? '🎤 Mic blocked' : on ? '🎤 Mic on' : '🔇 Mic off';
  ui.mic.textContent = label; ui.micHud.textContent = on ? '🎤' : '🔇'; ui.micHud.classList.toggle('off', !on);
}
async function toggleMic() {
  if (!net.voice.stream) { const ok = await net.voice.enable(); setMicUi(ok ? true : null); net.voice.sync(); return; }
  net.voice.setMuted(!net.voice.muted); setMicUi(!net.voice.muted);
}
ui.mic.addEventListener('click', toggleMic);
ui.micHud.addEventListener('click', toggleMic);

function renderLobby() {
  const speaking = net.voice.poll();
  ui.lobbySeats.innerHTML = ROSTER.map((r, i) => {
    const s = net.seats[i];
    const mine = s && net.peer && s.id === net.peer.id;
    const talking = s && (mine ? speaking.has('me') : speaking.has(s.id));
    return `<div class="seat ${s ? 'human' : ''} ${mine ? 'me' : ''} ${talking ? 'speaking' : ''}" style="--c:${r.color}">
      <div class="face">${r.emoji}</div><div class="who">${r.name}</div>
      <div class="name">${s ? s.name + (mine ? ' (you)' : '') : 'Bot'}</div></div>`;
  }).join('');
  const n = net.seats.filter(Boolean).length;
  ui.lobbyStatus.textContent = net.role === 'host'
    ? (n < 2 ? 'Share the link. You can start whenever you like; empty seats are bots.' : `${n} players in. Start when everyone is here.`)
    : 'Waiting for the host to start. Everyone uses Space + A/D (or any seat keys, a gamepad, or touch).';
}
function hostStart() { net.broadcast({ t: 'start', level: net.level }); startGame({ online: 'host' }); }
ui.lobbyStart.addEventListener('click', hostStart);

net.on('lobby', () => { if (mode === 'party') renderLobby(); net.voice.sync(); if (G && G.online) G.hud.setNames(net.seats.map((s, i) => (s ? s.name : ROSTER[i].name))); });
net.on('welcome', () => { ui.lobby.hidden = false; });
net.on('full', () => partyError('That party is full.'));
net.on('start', (d) => { net.level = d.level; startGame({ online: 'client' }); });
net.on('s', (d) => { if (G && G.online === 'client') G.snap = d; });
net.on('ev', (d) => {
  if (!G || G.online !== 'client') return;
  if (d.e === 'checkpoint') { G.hud.toast('CHECKPOINT'); audio.chime(); }
  if (d.e === 'die') G.hud.toast(['POPPED!', 'OUCH!', 'SPIKED!'][d.n % 3]);
  if (d.e === 'bump') { audio.bump(d.k); effects.splash(G.raft.x, G.raft.z, 8); }
  if (d.e === 'cd') { G.hud.countdown(d.v); if (d.v) audio.beep(d.v === 'GO!'); }
  if (d.e === 'finish') { audio.fanfare(); G.hud.toast('FINISH!'); }
});
net.on('end', (d) => { if (G && G.online === 'client') { G.time = d.time; setTimeout(() => { if (G && G.online === 'client') showFinish(d.time, d.retries, G.level, true); }, 1600); } });
net.on('closed', () => { if (net.role === 'client') { net.leave(); if (G) G.hud.show(false); show(ui.party); ui.setup.hidden = false; ui.lobby.hidden = true; mode = 'party'; partyError('The host left the party.'); } });
net.on('error', (e) => { if (mode === 'party') partyError(e.message || String(e.type || e)); });

// invite link: ?room=CODE opens the join panel with the code filled in
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) { ui.online.click(); ui.pcode.value = roomParam.toUpperCase().slice(0, 5); }

// ---------------------------------------------------------------- camera
const tmpV = new THREE.Vector3();
function updateCamera(dt) {
  const { raft, track, camPos, camLook } = G;
  const s = track.at(raft.d + 6);
  const fwdX = s.tx, fwdZ = s.tz;
  const sp = Math.hypot(raft.vx, raft.vz);
  const back = 13 + sp * 0.2, up = 15 + sp * 0.15;
  tmpV.set(raft.x - fwdX * back, up, raft.z - fwdZ * back);
  const look = new THREE.Vector3(raft.x + fwdX * 5, 0.5, raft.z + fwdZ * 5);
  if (!G.camInit) { camPos.copy(tmpV); camLook.copy(look); G.camInit = true; }
  camPos.lerp(tmpV, Math.min(1, dt * 3.2));
  camLook.lerp(look, Math.min(1, dt * 5));
  const sh = effects.shake;
  camera.position.copy(camPos);
  if (sh > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.6, (Math.random() - 0.5) * sh));
  camera.lookAt(camLook);
  sun.position.set(raft.x + 30, 60, raft.z + 20);
  sun.target.position.set(raft.x, 0, raft.z);
}

// ---------------------------------------------------------------- loop
const FIXED = 1 / 120;
let acc = 0, last = performance.now(), voiceT = 0;
function frame(now) { requestAnimationFrame(frame); tick(now); }
// debug/automation hook: window.gasRapids.tick(seconds) advances the game without waiting for rAF
window.gasRapids = { tick(sec = 1, fps = 60) { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) tick(last + 1000 / fps, i === n - 1); }, get state() { return G; }, startGame, net };
function tick(now, render = true) {
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
  clock += dt;
  // voice activity indicators (lobby and HUD)
  voiceT += dt;
  if (net.connected && voiceT > 0.12) {
    voiceT = 0;
    const sp = net.voice.poll();
    if (mode === 'party') renderLobby();
    if (G && G.online) G.hud.setSpeaking(net.seats.map((s) => s && (s.id === net.peer.id ? sp.has('me') : sp.has(s.id))));
  }
  if (mode === 'game' && G) {
    const { raft, track, hud } = G;
    if (G.online === 'client') {
      net.sendInput(input.readAny());
      if (G.snap) { raft.applySnapshot(G.snap, dt); G.time = G.snap.f ? G.time : G.time + dt; }
    } else {
      const inputs = G.online === 'host' ? null : input.read();
      if (G.phase === 'countdown') {
        G.cd -= dt;
        const n = Math.ceil(G.cd);
        const label = n > 0 ? String(n) : 'GO!';
        if (label !== G.cdShown) { G.cdShown = label; hud.countdown(label); audio.beep(n <= 0); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: label }); }
        if (G.cd <= 0) G.phase = 'race';
        if (G.cd < -0.9) { hud.countdown(''); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: '' }); }
      } else if (G.phase === 'race' || G.phase === 'finished') {
        if (G.phase === 'race') G.time += dt;
        if (G.cd > -1) { G.cd -= dt; if (G.cd < -0.9) { hud.countdown(''); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: '' }); } }
        let merged;
        if (G.online === 'host') {
          const occupied = net.seats.map(Boolean);
          const botIn = G.bots.read(raft, dt, clock, occupied);
          const mine = input.readAny();
          merged = occupied.map((o, i) => (i === net.mySeat ? mine : o ? net.inputs[i] || { fart: false, aim: 0, pop: false } : botIn[i] || { fart: false, aim: 0, pop: false }));
        } else {
          const hm = localRoles();
          const botIn = G.bots.read(raft, dt, clock, hm);
          merged = inputs.map((inp, i) => (hm[i] ? inp : botIn[i] || { fart: false, aim: 0, pop: false }));
        }
        acc += dt;
        let steps = 0;
        while (acc >= FIXED && steps < 8) { raft.step(FIXED, merged, clock); acc -= FIXED; steps++; merged.forEach((m) => (m.pop = false)); }
        for (const i in net.inputs) if (net.inputs[i]) net.inputs[i].pop = false; // a remote pop is consumed once
        for (const ev of raft.events) {
          if (ev === 'checkpoint') hud.toast('CHECKPOINT');
          if (ev === 'die') hud.toast(['POPPED!', 'OUCH!', 'SPIKED!'][raft.retries % 3]);
          if (ev === 'finish' && G.phase === 'race') finishGame();
          if (G.online === 'host') net.broadcast({ t: 'ev', e: ev, n: raft.retries, k: raft.bump });
        }
        raft.events.length = 0;
        if (G.online === 'host' && clock - G.lastSnap > 1 / 30) { G.lastSnap = clock; net.broadcast(raft.snapshot()); }
      }
    }
    raft.syncMesh(clock, dt);
    track.update(clock);
    effects.update(dt);
    updateCamera(dt);
    hud.update(raft, G.time, track.finishD);
  } else if (G) {
    // idle: slow orbit around the raft behind the title / party / finish screens
    effects.update(dt); G.track.update(clock); G.raft.syncMesh(clock, dt);
    const r = G.raft, a = clock * 0.25;
    camera.position.set(r.x + Math.sin(a) * 14, 7 + Math.sin(clock * 0.5), r.z + Math.cos(a) * 14);
    camera.lookAt(r.x, 1, r.z);
    for (const an of r.animals) an.setFart(false);
  }
  if (render) renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// preview scene behind the title so the page is never empty
(function preview() {
  const level = LEVELS[0];
  const track = buildTrack(level);
  scene.add(track.group);
  scene.background = new THREE.Color(level.theme.fog);
  scene.fog = new THREE.Fog(level.theme.fog, 90, 260);
  const raft = new Raft(track, effects, audio);
  scene.add(raft.mesh);
  G = { level, online: null, track, raft, bots: new Bots(track), hud: new Hud(raft.players), time: 0, phase: 'idle', cd: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camInit: false };
})();
