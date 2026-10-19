import * as THREE from 'three';
import { LEVELS, WORLDS } from './levels.js';
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
import { dailyLevel, todayKey } from './daily.js';

const BROKER_URL = 'https://' + (import.meta.env.VITE_PEER_HOST || 'toot-river-broker.gas-rapids.workers.dev');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 420);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(30, 60, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfeaff, 0x6b8e3a, 1.4);
scene.add(hemi);
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
  title: $('title'), levels: $('levels'), finish: $('finish'), party: $('party'), seats: $('seats'), worlds: $('worlds'),
  play: $('play'), online: $('online'), sound: $('opt-sound'), music: $('opt-music'), bots: $('opt-bots'), levelsBack: $('levels-back'),
  fTime: $('f-time'), fSub: $('f-sub'), fBest: $('f-best'), fWait: $('f-wait'), stars: $('stars'), next: $('next'), again: $('again'), menu: $('menu'),
  setup: $('party-setup'), lobby: $('party-lobby'), pname: $('pname'), pcode: $('pcode'), host: $('host'), join: $('join'), partyErr: $('party-error'),
  partyBack: $('party-back'), codeOut: $('code-out'), invite: $('invite-link'), copy: $('copy'), lobbySeats: $('lobby-seats'), lobbyLevel: $('lobby-level'),
  lobbyLevelWrap: $('lobby-level-wrap'), mic: $('mic'), micHud: $('mic-hud'), lobbyStatus: $('lobby-status'), lobbyStart: $('lobby-start'), leave: $('leave'),
};
let G = null;       // current game
let mode = 'title'; // title | levels | party | game | finish
let clock = 0;
let selectedLevel = 0;
let players = 1, crewBots = true;
try { players = Math.min(4, Math.max(1, +localStorage.getItem('tootriver-players') || 1)); } catch {} // crew bots are off every launch: the raft carries exactly the players you pick
const setPlayers = (n) => { players = n; try { localStorage.setItem('tootriver-players', n); } catch {} input.claimed = [0, 1, 2, 3].map((i) => i < n); renderSeats(); };
const setBots = (on) => { crewBots = on; renderSeats(); };
/** how many animals sit on the raft this race: the humans, or a full crew of four if bots fill in */
const crewSize = () => (crewBots ? 4 : players);

function show(screen) { for (const s of [ui.title, ui.levels, ui.party, ui.finish]) s.hidden = s !== screen; }

// ---------------------------------------------------------------- progression
const PROG_KEY = 'tootriver-progress';
let prog = {};
try { prog = JSON.parse(localStorage.getItem(PROG_KEY) || '{}') || {}; } catch { prog = {}; }
const saveProg = () => { try { localStorage.setItem(PROG_KEY, JSON.stringify(prog)); } catch {} };
const unlocked = (i) => i === 0 || !!(prog[i - 1] && prog[i - 1].stars >= 1) || !!(prog[i] && prog[i].best);
const starsFor = (level, time) => (time <= level.stars[0] ? 3 : time <= level.stars[1] ? 2 : 1);

let dailyTop = null;
async function fetchDaily() {
  try { const r = await fetch(`${BROKER_URL}/daily/top?day=${todayKey()}`); const j = await r.json(); dailyTop = j.top || []; } catch { dailyTop = []; }
  if (mode === 'levels') renderDailyCard();
}
function renderDailyCard() {
  const el = $('daily'); if (!el) return;
  const lv = dailyLevel();
  const best = (prog.daily && prog.daily.day === todayKey()) ? prog.daily.best : null;
  const rows = dailyTop === null ? '<li>loading…</li>' : dailyTop.length ? dailyTop.slice(0, 5).map((e, i) => `<li><b>${i + 1}.</b> ${e.name} <span>${fmtTime(e.time)}</span></li>`).join('') : '<li>No times yet today. Be first.</li>';
  el.innerHTML = `<div class="world daily" style="--w:${WORLDS[lv.world].color}"><h2>📅 Daily River<span>new every day · ${WORLDS[lv.world].name} · ${todayKey()}</span></h2>
    <div class="level" data-i="daily" style="--w:${WORLDS[lv.world].color}"><div class="n">Today's river</div><div class="t">${best ? 'Your best ' + fmtTime(best) : 'Not run yet today'} · everyone gets the same river</div></div>
    <ol class="board">${rows}</ol></div>`;
  el.querySelector('.level').addEventListener('click', () => { selectedLevel = 'daily'; startGame(); });
}
function renderLevels() {
  renderDailyCard(); fetchDaily();
  ui.worlds.innerHTML = WORLDS.map((w, wi) => {
    const cards = LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.world === wi).map(({ l, i }) => {
      const p = prog[i] || {}, lock = !unlocked(i);
      const stars = [1, 2, 3].map((n) => `<b${(p.stars || 0) >= n ? '' : ' class="off"'}>${(p.stars || 0) >= n ? '★' : '☆'}</b>`).join('');
      return `<div class="level ${lock ? 'locked' : ''}" data-i="${i}" style="--w:${w.color}">
        <div class="n">${i + 1}. ${l.name}</div>
        <div class="s">${stars}</div>
        <div class="t">${p.best ? 'Best ' + fmtTime(p.best) : 'Not finished yet'} · gold under ${l.stars[0]}s</div>
        ${lock ? '<div class="lock">🔒</div>' : ''}</div>`;
    }).join('');
    return `<div class="world" style="--w:${w.color}"><h2>${w.icon} ${w.name}<span>${LEVELS.filter((l) => l.world === wi).length} levels</span></h2>${cards}</div>`;
  }).join('');
  ui.worlds.querySelectorAll('.level').forEach((el) => el.addEventListener('click', () => {
    const i = +el.dataset.i;
    if (!unlocked(i)) { el.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 }); return; }
    selectedLevel = i; startGame();
  }));
  renderSeats();
}

function renderSeats() {
  document.querySelectorAll('#players button').forEach((b) => b.classList.toggle('on', +b.dataset.n === players));
  ui.bots.checked = crewBots;
  ui.seats.innerHTML = ROSTER.map((r, i) => {
    const human = i < players, empty = !human && !crewBots;
    return `
    <div class="seat ${human ? 'human' : ''} ${empty ? 'empty' : ''}" style="--c:${r.color}">
      <div class="face">${r.emoji}</div>
      <div class="who">${r.name}</div>
      <div class="role">${human ? `PLAYER ${i + 1}` : crewBots ? 'CREW BOT' : 'EMPTY SEAT'}</div>
      <kbd>${KEYMAP[i].label}</kbd>
    </div>`;
  }).join('');
}
document.querySelectorAll('#players button').forEach((b) => b.addEventListener('click', () => setPlayers(+b.dataset.n)));
$('opt-bots').addEventListener('change', (e) => setBots(e.target.checked));
const localRoles = () => [0, 1, 2, 3].map((i) => i < players);

// ---------------------------------------------------------------- cel shading
const gradient = (() => { const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 220, 220, 220, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toonCache = new Map();
function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.isMeshLambertMaterial) return;
    const m = o.material;
    let tm = toonCache.get(m);
    if (!tm) { tm = new THREE.MeshToonMaterial({ color: m.color, map: m.map || null, gradientMap: gradient, side: m.side, transparent: m.transparent, opacity: m.opacity }); toonCache.set(m, tm); }
    o.material = tm;
  });
}

// ---------------------------------------------------------------- game setup
function loadLevel(idx, crew) {
  if (G) scene.remove(G.track.group, G.raft.mesh);
  const level = idx === 'daily' ? dailyLevel() : LEVELS[idx];
  const track = buildTrack(level);
  scene.add(track.group);
  scene.background = new THREE.Color(level.theme.sky);
  scene.fog = new THREE.Fog(level.theme.fog, 90, 280);
  hemi.groundColor.set(level.theme.bankTop);
  const raft = new Raft(track, effects, audio, crew);
  toonify(track.group); toonify(raft.mesh);
  scene.add(raft.mesh);
  return { level, track, raft };
}

function startGame(opts = {}) {
  audio.init(); audio.setEnabled(ui.sound.checked); audio.setMusic(ui.music.checked);
  const online = opts.online || null; // 'host' | 'client' | null
  const idx = online ? net.level : selectedLevel;
  const { level, track, raft } = loadLevel(idx, online ? Math.max(1, net.crew || net.seats.filter(Boolean).length) : crewSize());
  if (online) raft.players.forEach((p, i) => { p.name = net.seats[i] ? net.seats[i].name : p.name; });
  const hud = new Hud(raft.players);
  hud.setTicks(track.checkpoints, track.length);
  hud.show(true);
  G = { idx, level, online, track, raft, bots: new Bots(track), hud, time: 0, trackTime: 0, phase: online === 'client' ? 'client' : 'countdown', cd: 3.9, cdShown: null, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camInit: false, snap: null, lastSnap: 0, hintT: 0 };
  if (online) { hud.setRoles(net.seats.slice(0, raft.count).map((s, i) => (!s ? false : i === net.mySeat ? true : s.name))); ui.micHud.hidden = false; }
  if (online === 'client') { raft.predicting = true; G.pred = { seq: 0, buf: [], acc: 0, others: null }; }
  else { hud.setRoles(localRoles()); ui.micHud.hidden = true; }
  hud.toast(idx === 'daily' ? 'DAILY RIVER' : `${idx + 1}. ${level.name.toUpperCase()}`);
  audio.stopMusic(); audio.startMusic('race');
  show(null);
  mode = 'game';
}

function showFinish(time, retries, isClient) {
  const { level, idx } = G;
  const stars = idx === 'daily' ? 0 : starsFor(level, time);
  ui.fTime.textContent = fmtTime(time);
  ui.fSub.textContent = `${level.name} · ${retries} ${retries === 1 ? 'retry' : 'retries'} · ${G.raft.cans} 🥫`;
  const p = (idx === 'daily' ? (prog.daily && prog.daily.day === todayKey() ? prog.daily : {}) : prog[idx]) || {};
  const newBest = !p.best || time < p.best;
  if (!isClient) {
    if (idx === 'daily') prog.daily = { day: todayKey(), best: newBest ? time : p.best };
    else prog[idx] = { best: newBest ? time : p.best, stars: Math.max(stars, p.stars || 0) };
    saveProg();
  }
  $('daily-submit').hidden = idx !== 'daily';
  if (idx === 'daily') { $('daily-name').value = (localStorage.getItem('tootriver-name') || ''); $('daily-result').textContent = ''; $('daily-submit').dataset.time = time; $('daily-submit').dataset.crew = G.raft.count; }
  ui.fBest.textContent = newBest ? (p.best ? `New best! Previous ${fmtTime(p.best)}` : 'First finish. That is the time to beat.') : `Best ${fmtTime(p.best)}`;
  if (stars < 3) ui.fBest.textContent += ` · gold under ${level.stars[0]}s`;
  const starEls = ui.stars.querySelectorAll('i');
  starEls.forEach((s) => s.classList.remove('on'));
  ui.next.hidden = isClient || idx === 'daily' || idx + 1 >= LEVELS.length;
  ui.again.hidden = isClient;
  ui.menu.textContent = G.online ? 'Back to party' : 'Levels';
  ui.fWait.hidden = !isClient;
  show(ui.finish);
  G.hud.show(false);
  mode = 'finish';
  for (let n = 0; n < stars; n++) setTimeout(() => { starEls[n].classList.add('on'); audio.star(n); }, 350 + n * 280);
}

function finishGame() {
  const { raft } = G;
  audio.fanfare(); audio.startMusic('victory');
  G.phase = 'finished';
  G.hud.toast('FINISH!');
  effects.confetti(raft.x, raft.z, 90);
  if (G.online === 'host') net.broadcast({ t: 'end', time: G.time, retries: raft.retries, cans: raft.cans });
  const game = G;
  setTimeout(() => { if (G === game) showFinish(G.time, raft.retries, false); }, 1700);
}

ui.play.addEventListener('click', () => { audio.init(); audio.setMusic(ui.music.checked); audio.startMusic('menu'); show(ui.levels); mode = 'levels'; renderLevels(); setPlayers(players); });
$('credits-open').addEventListener('click', () => { $('credits').hidden = false; });
$('credits-close').addEventListener('click', () => { $('credits').hidden = true; });
ui.levelsBack.addEventListener('click', () => { show(ui.title); mode = 'title'; });
ui.next.addEventListener('click', () => { selectedLevel = Math.min(LEVELS.length - 1, G.idx + 1); startGame(); });
$('daily-send').addEventListener('click', async () => {
  const box = $('daily-submit'); const name = ($('daily-name').value.trim() || 'Player').slice(0, 12);
  try { localStorage.setItem('tootriver-name', name); } catch {}
  $('daily-result').textContent = 'Sending…';
  try {
    const r = await fetch(`${BROKER_URL}/daily/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: todayKey(), name, time: +box.dataset.time, crew: +box.dataset.crew }) });
    const j = await r.json();
    $('daily-result').textContent = j.ok ? `You are #${j.rank} today` : 'Could not submit';
    dailyTop = j.top || dailyTop;
  } catch { $('daily-result').textContent = 'Could not reach the leaderboard'; }
});
ui.again.addEventListener('click', () => { if (G && G.online === 'host') hostStart(); else startGame(); });
ui.menu.addEventListener('click', () => {
  audio.startMusic('menu');
  if (G && G.online) { show(ui.party); mode = 'party'; renderLobby(); }
  else { show(ui.levels); mode = 'levels'; renderLevels(); }
  if (G) G.hud.show(false);
});
ui.sound.addEventListener('change', () => audio.setEnabled(ui.sound.checked));
ui.music.addEventListener('change', () => audio.setMusic(ui.music.checked));
addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) ui.play.click();
  if (mode === 'finish' && e.code === 'Space' && !(G && G.online === 'client')) (ui.next.hidden ? ui.again : ui.next).click();
  if (e.code === 'Escape' && mode === 'game') ui.menu.click();
  if (e.code === 'Escape' && mode === 'levels') ui.levelsBack.click();
  if (e.code === 'KeyM' && net.connected) toggleMic();
});

// ---------------------------------------------------------------- party
function partyError(msg) { ui.partyErr.textContent = msg || ''; }
function inviteUrl(code) { const u = new URL(location.href); u.search = '?room=' + code; return u.toString(); }
ui.online.addEventListener('click', () => { audio.init(); show(ui.party); ui.setup.hidden = false; ui.lobby.hidden = true; mode = 'party'; partyError(''); ui.pname.focus(); });
ui.partyBack.addEventListener('click', () => { net.leave(); show(ui.title); mode = 'title'; });
ui.leave.addEventListener('click', () => { net.leave(); ui.setup.hidden = false; ui.lobby.hidden = true; show(ui.title); mode = 'title'; });
ui.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.invite.value); ui.copy.textContent = 'Copied!'; }
  catch { ui.invite.select(); ui.copy.textContent = 'Select and copy'; }
  setTimeout(() => (ui.copy.textContent = 'Copy invite link'), 1800);
});
const myName = () => (ui.pname.value.trim() || 'Player').slice(0, 12);
try { ui.pname.value = localStorage.getItem('tootriver-name') || ''; } catch {}
ui.lobbyLevel.innerHTML = LEVELS.map((l, i) => `<option value="${i}">${i + 1}. ${l.name} (${WORLDS[l.world].name})</option>`).join('');

async function enterLobby() {
  try { localStorage.setItem('tootriver-name', myName()); } catch {}
  ui.setup.hidden = true; ui.lobby.hidden = false;
  ui.codeOut.textContent = net.code; ui.invite.value = inviteUrl(net.code);
  ui.lobbyLevelWrap.style.display = net.role === 'host' ? '' : 'none';
  ui.lobbyStart.hidden = net.role !== 'host';
  ui.lobbyLevel.value = String(net.level);
  renderLobby();
  net.voice.sync();
}
/** ask for the mic before connecting so every call carries the real track from the start */
async function micFirst() {
  ui.partyErr.textContent = 'Asking for your microphone…';
  const ok = await net.voice.enable();
  setMicUi(ok ? !net.voice.muted : null);
  ui.partyErr.textContent = ok ? '' : ok === null ? 'Still waiting for the microphone prompt: allow it and your voice joins automatically.' : 'No microphone: you will hear the others but they will not hear you.';
}
net.on('mic', (ok) => { setMicUi(ok ? !net.voice.muted : null); if (mode === 'party') { partyError(''); renderLobby(); } });
ui.host.addEventListener('click', async () => {
  partyError(''); ui.host.disabled = true;
  try { await micFirst(); await net.host(myName()); await enterLobby(); }
  catch (e) { partyError('Could not reach the party service: ' + (e.message || e.type || e)); net.leave(); }
  ui.host.disabled = false;
});
ui.join.addEventListener('click', async () => {
  const code = ui.pcode.value.trim().toUpperCase();
  if (code.length < 5) return partyError('Enter the 5-letter party code.');
  partyError(''); ui.join.disabled = true;
  try { await micFirst(); await net.join(code, myName()); await enterLobby(); }
  catch (e) { partyError(e.message || 'Could not join'); net.leave(); }
  ui.join.disabled = false;
});
ui.lobbyLevel.addEventListener('change', () => { if (net.role === 'host') net.setLevel(+ui.lobbyLevel.value); });
function setMicUi(on) {
  ui.mic.textContent = on === null ? '🎤 Mic blocked' : on ? '🎤 Mic on' : '🔇 Mic off';
  ui.micHud.textContent = on ? '🎤' : '🔇'; ui.micHud.classList.toggle('off', !on);
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
    const voice = !s ? '' : mine ? (net.voice.stream ? '🎤 mic on' : '🔇 no mic') : net.voice.connectedTo(s.id) ? '🔊 voice linked' : '⏳ linking voice…';
    return `<div class="seat ${s ? 'human' : ''} ${mine ? 'me' : ''} ${talking ? 'speaking' : ''}" style="--c:${r.color}">
      <div class="face">${r.emoji}</div><div class="who">${r.name}</div>
      <div class="name">${s ? s.name + (mine ? ' (you)' : '') : 'empty'}</div><div class="role">${voice}</div></div>`;
  }).join('');
  const n = net.seats.filter(Boolean).length;
  ui.lobbyStatus.textContent = net.role === 'host'
    ? (n < 2 ? 'Share the link. Only the people who join sit on the raft.' : `${n} players in. Start when everyone is here.`)
    : 'Waiting for the host to start. Everyone uses Space + A/D (or any seat keys, a gamepad, or touch).';
  if (net.role !== 'host') ui.lobbyLevel.value = String(net.level);
}
function hostStart() { net.crew = Math.max(1, net.seats.filter(Boolean).length); net.broadcast({ t: 'start', level: net.level, crew: net.crew }); startGame({ online: 'host' }); }
ui.lobbyStart.addEventListener('click', hostStart);

net.on('lobby', () => { if (mode === 'party') renderLobby(); net.voice.sync(); if (G && G.online) G.hud.setNames(net.seats.map((s, i) => (s ? s.name : ROSTER[i].name))); });
net.on('voice', () => { if (mode === 'party') renderLobby(); });
setInterval(() => { if (net.connected) net.voice.sync(); }, 2500);
net.on('welcome', () => { ui.lobby.hidden = false; });
net.on('full', () => partyError('That party is full.'));
net.on('start', (d) => { net.level = d.level; net.crew = d.crew || 4; startGame({ online: 'client' }); });
net.on('s', (d) => { if (G && G.online === 'client') G.snap = d; });
net.on('ev', (d) => {
  if (!G || G.online !== 'client') return;
  if (d.e === 'checkpoint') { G.hud.toast('CHECKPOINT'); audio.chime(); }
  if (d.e === 'die') G.hud.toast(['POPPED!', 'OUCH!', 'SPIKED!'][d.n % 3]);
  if (d.e === 'bump') { audio.bump(d.k); effects.splash(G.raft.x, G.raft.z, 8); }
  if (d.e === 'geyser') { audio.geyser(); effects.shake = 1; }
  if (d.e === 'can') G.hud.toast('BEANS!');
  if (d.e === 'cd') { G.hud.countdown(d.v); if (d.v) audio.beep(d.v === 'GO!'); if (d.v === 'GO!') { G.hud.hint('HOLD SPACE TO TOOT · A / D TURN YOUR ARROW'); setTimeout(() => G && G.hud.hint(''), 9000); } }
  if (d.e === 'finish') { audio.fanfare(); audio.startMusic('victory'); G.hud.toast('FINISH!'); effects.confetti(G.raft.x, G.raft.z, 90); }
});
net.on('end', (d) => { if (G && G.online === 'client') { G.time = d.time; G.raft.cans = d.cans || 0; setTimeout(() => { if (G && G.online === 'client') showFinish(d.time, d.retries, true); }, 1700); } });
net.on('closed', () => { if (net.role === 'client') { net.leave(); audio.stopMusic(); if (G) G.hud.show(false); show(ui.party); ui.setup.hidden = false; ui.lobby.hidden = true; mode = 'party'; partyError('The host left the party.'); } });
net.on('error', (e) => { if (mode === 'party') partyError(e.message || String(e.type || e)); });

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
// adaptive quality: if frames come in slow for a while, drop resolution then shadows, so motion stays smooth
let quality = 2, slowFrames = 0, qualityT = 0;
function lowerQuality() {
  if (quality === 2) { quality = 1; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); sun.shadow.mapSize.set(1024, 1024); sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; }
  else if (quality === 1) { quality = 0; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; sun.castShadow = false; }
}
function frame(now) { requestAnimationFrame(frame); tick(now); }
// debug/automation hook: window.tootRiver.tick(seconds) advances the game without waiting for rAF
window.tootRiver = { tick(sec = 1, fps = 60) { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) tick(last + 1000 / fps, i === n - 1); }, get state() { return G; }, startGame, net, setLevel(i) { selectedLevel = i; }, prog, LEVELS };
function tick(now, render = true) {
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
  clock += dt;
  if (render && mode === 'game') { if (dt > 1 / 40) slowFrames++; qualityT += dt; if (qualityT > 3) { if (slowFrames > 45 && quality > 0) lowerQuality(); slowFrames = 0; qualityT = 0; } }
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
      // ---- client-side prediction: my inputs apply instantly; host snapshots correct us and we replay what the host has not seen yet
      const P = G.pred, me = net.mySeat;
      const mine = input.readAny();
      P.seq++; P.buf.push({ seq: P.seq, inp: { ...mine }, dt });
      if (P.buf.length > 240) P.buf.shift();
      net.sendInput(mine, P.seq);
      G.trackTime += dt;
      const othersFrom = (snap) => raft.players.map((pl, i) => (i === me ? null : { fart: !!snap.p[i][1], aim: snap.p[i][3], abs: true, pop: false }));
      if (G.snap && G.snap !== P.lastSnap) {
        const snap = G.snap; P.lastSnap = snap;
        const px = raft.x, pz = raft.z, py = raft.yaw;
        raft.applyAuth(snap, me);
        P.others = othersFrom(snap);
        const acked = snap.q ? snap.q[me] || 0 : P.seq;
        P.buf = P.buf.filter((e) => e.seq > acked);
        for (const e of P.buf) { const merged = P.others.map((o, i) => (i === me ? e.inp : o)); raft.step(e.dt, merged, clock); }
        // keep the visual where it was and let it ease to the corrected spot
        raft.visOff.x += px - raft.x; raft.visOff.z += pz - raft.z; raft.visOff.yaw += Math.atan2(Math.sin(py - raft.yaw), Math.cos(py - raft.yaw));
        if (Math.abs(snap.tc - G.trackTime) > 0.25) G.trackTime = snap.tc;
        G.time = snap.f ? G.time : G.time + dt;
      } else if (P.others) {
        const merged = P.others.map((o, i) => (i === me ? mine : o));
        raft.step(dt, merged, clock);
      }
      track.update(G.trackTime, dt);
      raft.events.length = 0;
      for (const g of track.geysers) if (g.field.active && Math.random() < 0.6) effects.geyser(g.field.x, g.field.z);
    } else {
      const inputs = G.online === 'host' ? null : input.read();
      if (G.phase === 'countdown') {
        G.cd -= dt;
        const n = Math.ceil(G.cd);
        const label = n > 0 ? String(n) : 'GO!';
        if (label !== G.cdShown) { G.cdShown = label; hud.countdown(label); audio.beep(n <= 0); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: label }); }
        if (G.cd <= 0) { G.phase = 'race'; G.hintT = 12; hud.hint(G.online ? 'HOLD SPACE TO TOOT · A / D TURN YOUR ARROW' : players > 1 ? 'HOLD YOUR TOOT KEY · SIDE KEYS TURN YOUR ARROW · THE RAFT GOES WHERE THE ARROWS POINT' : 'HOLD SPACE TO TOOT · A / D TURN YOUR ARROW · THE RAFT GOES WHERE IT POINTS'); }
        if (G.cd < -0.9) { hud.countdown(''); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: '' }); }
      } else if (G.phase === 'race' || G.phase === 'finished') {
        if (G.phase === 'race') G.time += dt;
        if (G.cd > -1) { G.cd -= dt; if (G.cd < -0.9) { hud.countdown(''); if (G.online === 'host') net.broadcast({ t: 'ev', e: 'cd', v: '' }); } }
        let merged;
        if (G.online === 'host') {
          const occupied = raft.seats.map(() => true);
          const mine = input.readAny();
          const tooting = mine.fart || net.inputs.some((x) => x && x.fart);
          const botIn = G.bots.read(raft, dt, G.trackTime, occupied, tooting);
          merged = occupied.map((o, i) => (i === net.mySeat ? mine : o ? net.inputs[i] || { fart: false, aim: 0, pop: false } : botIn[i] || { fart: false, aim: 0, pop: false }));
        } else {
          const hm = localRoles();
          const tooting = inputs.some((inp, i) => hm[i] && inp.fart);
          const botIn = G.bots.read(raft, dt, G.trackTime, hm, tooting);
          merged = inputs.map((inp, i) => (hm[i] ? inp : botIn[i] || { fart: false, aim: 0, pop: false }));
        }
        if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0 || (G.time > 1.5 && Math.hypot(raft.vx, raft.vz) > 6)) { G.hintT = 0; hud.hint(''); } }
        if (G.bots.braking && !G.brakeShown) { G.brakeShown = true; hud.toast('CREW: WAIT FOR IT…'); } else if (!G.bots.braking) G.brakeShown = false;
        G.trackTime += dt;
        track.update(G.trackTime, dt);
        acc += dt;
        let steps = 0;
        while (acc >= FIXED && steps < 8) { raft.step(FIXED, merged, clock); acc -= FIXED; steps++; merged.forEach((m) => (m.pop = false)); }
        for (const i in net.inputs) if (net.inputs[i]) net.inputs[i].pop = false;
        for (const ev of raft.events) {
          if (ev === 'checkpoint') hud.toast('CHECKPOINT');
          if (ev === 'die') hud.toast(['POPPED!', 'OUCH!', 'SPIKED!'][raft.retries % 3]);
          if (ev === 'can') hud.toast('BEANS!');
          if (ev === 'geyser') { audio.geyser(); effects.shake = 1; }
          if (ev === 'finish' && G.phase === 'race') finishGame();
          if (G.online === 'host') net.broadcast({ t: 'ev', e: ev, n: raft.retries, k: raft.bump });
        }
        raft.events.length = 0;
        for (const g of track.geysers) if (g.field.active && Math.random() < 0.6) effects.geyser(g.field.x, g.field.z);
        if (G.online === 'host' && clock - G.lastSnap > 1 / 30) { G.lastSnap = clock; net.broadcast(raft.snapshot(G.trackTime, net.lastSeq.slice(0, raft.count))); }
      }
    }
    raft.syncMesh(clock, dt);
    effects.update(dt);
    updateCamera(dt);
    hud.update(raft, G.time, track.finishD);
  } else if (G) {
    // idle: slow orbit around the raft behind the menus
    effects.update(dt); G.track.update(clock, dt); G.raft.syncMesh(clock, dt);
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
  const { level, track, raft } = loadLevel(0, 4);
  G = { idx: 0, level, online: null, track, raft, bots: new Bots(track), hud: new Hud(raft.players), time: 0, trackTime: 0, phase: 'idle', cd: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camInit: false };
})();
