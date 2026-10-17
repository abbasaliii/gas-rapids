# Research: rebuilding the raft game from the reel

## What the reel shows

The reel (Bradleythebradster, 2.8M views, posted 11 Oct 2026) is a streamer playing **Fart Together** by GamesMrkt. Facts gathered from the Steam store and the footage:

- Steam app 5117550, developer and publisher GamesMrkt (a small studio that also sells Unity Asset Store templates, so the original is almost certainly Unity). Full game "coming soon"; a **free demo** (app 5208630) has been out since 8 Oct 2026 with about 92% positive reviews.
- Co-op for 2 to 4 players on one raft, online or shared screen, plus competitive modes for up to 8. Full controller support, Remote Play Together, leaderboards.
- Mechanic: four cartoon animals (hippo, crocodile, bear, capybara in the reel) sit on the rim of a round raft facing inward. Each player has a fart button. The gas jet leaves from the player's seat, so the raft is pushed away from whoever farts. The back seat drives, the sides steer, the front brakes. The store copy says the trick is "farting together at the right time".
- HUD: thin progress bar along the very top with checkpoint ticks, player avatar with a green gas bar top-left, elapsed timer top-centre, a retry counter top-right.
- Course elements seen: START and CHECKPOINT arches, green rails with white spikes, pink spike rollers, spiked red buoys, fences with gaps, spiral tubes, narrow slides, boosted water, canyon walls in orange and salmon, blue water with light ripple highlights.
- Camera: chase camera, behind and above the raft, looking down the course.
- Fail state: spikes pop the raft, the retry counter increments and the raft respawns at the last checkpoint.

The streamer's audio is mostly laughing and shouting ("go for it", "let's calm it down"), with the overlay caption "POP FART" suggesting short taps versus holds.

## Free toolchain chosen

| Need | Choice | Cost |
|------|--------|------|
| Engine / renderer | Three.js (MIT) in the browser | free |
| Physics | Hand-rolled 2D raft body (deterministic, 120 Hz) | free |
| Build tool | Vite | free |
| Sound | WebAudio synthesis (no sample files) | free |
| Art | Primitive-built animals and course; CC0 packs from Quaternius / Kenney when upgrading | free |
| Fonts | Google Fonts (Lilita One, Archivo) | free |
| Online play (next) | WebRTC data channels via PeerJS public broker, or a tiny Node relay on a free tier | free |
| Hosting | GitHub Pages / Netlify / itch.io | free |
| Research tools used | yt-dlp, ffmpeg, faster-whisper | free |

Why web instead of Godot: it runs instantly from a link, needs no install, can be tested headlessly, and it fits the existing skill set here. Godot 4 (MIT) is the right call only if a Steam build becomes the goal. Steam Direct charges a one-off fee, so Steam is the only step on any path that is not free. Unity and Unreal were ruled out because their licences are not "free, no strings" for a commercial release.

## How this version matches and improves on the original

Matches: one button per seat, thrust from the seat position, four animals on a round raft, gas meter, pop vs hold, checkpoints and retries, chase camera, spiked buoys, rollers, fences, boosts, pink spike rails, START and CHECKPOINT arches, chequered finish.

Improvements already in: bots fill empty seats so it is playable solo, aimable jets give each seat real steering, touch and gamepad support, best-time per level, instant load with no install.

Not yet matched: online multiplayer, the original's character models and animations, spiral tubes and half-pipe slides, competitive 8-player mode.

## Legal note

Game mechanics are not protected, so recreating "fart-propelled raft co-op" is fine. The name "Fart Together", its logo, its models, textures, sounds and levels are the developer's property and must not be copied, which is why this project is named Gas Rapids and generates all of its own art and audio.

## Studying the original for free

Install the free demo from Steam (app 5208630) and play it. That is the cheapest research available and it is fully legitimate. Useful things to note while playing: how long a gas bar lasts, how far a single pop moves the raft, how quickly the raft turns, and which hazards appear in which order.
