# Toot River

A four-player, fart-powered raft race for the browser. Four animals share one round raft and each player has one toot button. A toot pushes the raft away from your seat, so the back seat drives, the side seats steer and the front seat brakes. Toot together at the right moment or spin into the spikes.

**Play:** https://play.gas-rapids.workers.dev (backup copy: https://abbasaliii.github.io/gas-rapids/)

Everything here is free to use commercially. Code, levels, course art and effects are original. The four animals are open models (pig by Quaternius, CC0; skunk, frog and seal from Poly by Google, CC BY 3.0, credited in-game). The toot recordings and the three music tracks are CC0 from OpenGameArt, with a synthesised fallback if the files fail to load. Dependencies are MIT (Three.js, PeerJS, Vite). The mechanic is inspired by the co-op raft genre; nothing is copied from any other game.

## The game

- **8 levels in 4 worlds**: Jungle, Canyon, Frostbite, Volcano. Levels unlock in order. Each has gold, silver and bronze times, a best time, and stars on the level-select screen.
- **Daily River**: a new procedurally generated river every day, the same for everyone, with a global leaderboard (best time per name, kept on the broker). Submit from the finish screen.
- **1 to 4 players** on one keyboard: pick the count on the level screen and exactly that many animals sit on the raft. One sits at the back; two sit back-left and back-right; three form a triangle; four take all sides. Fewer toot-ers means less steering and no way to brake, so it gets harder. Tick "Add crew bots" if you want a full crew of four with bots in the spare seats (they drive, steer and time the hammers, traps and crushers for you).
- **Crew**: Stinky the skunk (back seat), Porkchop the pig (right), Ribbit the frog (front), Blubber the seal (left).
- **Feel**: every jet leaves slightly off-centre and sputters, the raft spins when hit and only weakly straightens itself, so coordination and timing matter. Tap for a punchy pop, hold for thrust.
- **Hazards**: spiked buoys, lava pools, boulders, spinning spike rollers, fences with gaps, swinging spiked hammers, pop-up spike traps, crusher blocks, cannons that lob spiked balls across the channel, windmill spinners that bat you about, drifting logs, whirlpools, wandering twisters, erupting geysers, bank fans that blow you sideways, ice (slippery), boost currents, spiked rails.
- **Beans**: cans of beans refill the whole crew's gas. The HUD counts them.
- **Gas**: tap for a short pop, hold for sustained thrust. Run the bar to zero and you sputter until it recovers.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run sim        # headless check of every level (finish time, retries, where deaths happen)
node sim/netcheck.mjs 150   # prediction error for a remote player at 150 ms latency
npm run build      # static site in dist/
```

## Controls

| Seat | Animal | Toot | Aim |
|------|--------|------|-----|
| Back | Stinky | Space | A / D |
| Right | Porkchop | Enter | Left / Right arrows |
| Front | Ribbit | V | C / B |
| Left | Blubber | P | O / [ |

- Local co-op: press a seat's toot key on the level screen to take it; up to four on one keyboard.
- Each player has a coloured arrow on the deck showing where their toot pushes the raft. A and D turn that arrow (it stays where you leave it); D turns it clockwise. Point it, hold your toot key, and the raft goes where the arrows point. Toots from the side seats also swing the raft round, which is most of the fun and most of the chaos.
- Gamepads: pad 1 to 4 map to seats 1 to 4. A or right trigger toots, left stick or bumpers aim.
- Touch: tap the middle of the screen to toot, the left or right thirds to aim.
- Esc goes back. M toggles your mic in a party.

## Play online with friends (voice included)

1. **Party with friends** → type a name → **Create party**. You get a 5-letter code and an invite link.
2. Send the link. Friends open it, type a name, **Join**. Up to four; empty seats are crew bots.
3. The browser asks for your microphone before you create or join (say yes; without it you can hear but not talk). Each seat in the lobby shows "voice linked" once the audio link to that player is up. 🎤 or M mutes. Avatars pulse while someone talks.
4. The host picks the level and starts. Online, everyone drives their own seat with Space + A/D (or any seat keys, gamepad, touch).

How it is free: the host's browser runs the race. Each friend's browser sends numbered button presses to the host and gets the raft state back 30 times a second over a WebRTC data channel; the client predicts its own toots immediately and replays anything the host has not acknowledged yet, so remote players feel no input lag (`npm run netcheck` measures it). Voice goes browser to browser the same way. No game server. The only outside piece is a tiny signaling broker (`server/`, a Cloudflare Worker on the free plan) that introduces the browsers to each other once.

## Deploy (all free)

```bash
npx wrangler login   # once; free Cloudflare account, no card
npm run deploy       # deploys the broker worker, then builds and deploys the site
```

- Site: Cloudflare Worker with static assets (`wrangler.jsonc`), live at `play.<your-subdomain>.workers.dev`. Commercial use allowed on the free plan.
- Broker: `server/wrangler.jsonc`, a 90-line PeerJS-compatible signaling server. Its host goes in `.env` as `VITE_PEER_HOST`.
- Backup: `.github/workflows/pages.yml` publishes every push to GitHub Pages (fine for a free game, not for selling it).
- Nicer address: change the workers.dev subdomain once in the Cloudflare dashboard (Workers & Pages → Overview → Change), update `.env`, run `npm run deploy`. A custom domain is the only thing that costs money (about $10 a year) and attaches to the Worker in one click.

## Project layout

```
index.html        shell: HUD, title, level select, party, finish screens
src/main.js       renderer, camera, loop, state machine, progression (stars, unlocks)
src/levels.js     worlds + level definitions (path segments, hazards, star times)
src/track.js      builds course geometry, animated hazards, fields, pickups from a level
src/raft.js       raft physics: seat thrust, drag, keel, walls, hazards, fields, pickups, checkpoints
src/bots.js       crew bots: steer, dodge, brake at hammers, toot with the player
src/characters.js the four animals from primitives
src/effects.js    gas, splashes, sparkles, confetti, ripples (pooled sprites)
src/audio.js      every sound and the music loop, synthesised
src/input.js      keyboard, gamepad, touch
src/hud.js        gas bars, timer, beans, retries, progress, toasts, hints
src/net.js        party networking (PeerJS data channels + voice mesh), client-side prediction inputs
src/models.js     glTF character loader (normalise, face the centre, skinned clone, animation mixer)
src/daily.js      Daily River generator (date-seeded)
sim/netcheck.mjs  netcode check: host + predicting client at a chosen latency, prints prediction error
server/           signaling broker (Cloudflare Worker + Durable Object)
sim/run.mjs       headless simulator used to test levels and calibrate star times
```

### Physics in one paragraph

The raft is a 2D rigid body on the water plane. Each seat sits on the rim at 90 degree spacing; a tooting player applies a force at their seat position toward the raft's centre, rotated by their aim, which also produces torque. Drag is linear plus a small quadratic term, a weak keel turns the raft to face its motion, the river current pushes along the course tangent, ice cuts drag, whirlpools pull and spin, geysers shove. The course is a sampled centre line with a half-width every metre, so walls, lateral position and progress are cheap lookups.

### Adding a level

Add an entry to `src/levels.js` and run `npm run sim`. Keep at least 7 m of open water past any lethal hazard; the raft is about 5 m across. Star times: gold is about 80% of the simulator's finish time, silver about equal to it.

## Debug hook

`window.tootRiver.tick(seconds)` advances the game without animation frames; `window.tootRiver.state` is the live game; `window.tootRiver.setLevel(i)` picks a level for `startGame()`.
