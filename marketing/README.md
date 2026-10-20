# Toot River: audience kit

Everything here is free to use. The goal for the next weeks is attention, not money: clips, streamers, itch.io, a Steam wishlist page later.

## One-line pitch
Four animals, one raft, one button each. Toot together or spin into the spikes. Free in your browser, no download, voice chat built in.

## Links
- Play: https://play.gas-rapids.workers.dev (replace with the domain when bought)
- Invite link format: `https://play.gas-rapids.workers.dev/?room=CODE`

## Clips (the whole marketing plan)
- In-game: press **R** or tap ⏺ during a race, or turn on "Record every race" in Settings. The finish screen offers **Share clip** (straight to TikTok/WhatsApp on phones) or **Download clip** (WebM; convert to MP4 with `ffmpeg -i clip.webm clip.mp4`).
- Trailer: `trailer-landscape.mp4` (1920x1080, 26.5 s) and `trailer-vertical.mp4` (720x1280 centre crop for TikTok/Reels/Shorts) are rendered from the game itself: frames captured in the browser via `tools/frames-server.mjs`, then encoded as three segments (title card 2 s, 660 gameplay frames at 30 fps, end card 2.5 s) and joined with ffmpeg's concat demuxer. Encode the segments separately; a single concat *filter* graph with looped PNG inputs deadlocks on Windows ffmpeg builds.
  Landscape: `ffmpeg -loop 1 -framerate 30 -t 2 -i card-title-16x9.png -vf scale=1920:1080,format=yuv420p -c:v libx264 -crf 21 s1.mp4`, `ffmpeg -framerate 30 -i frames/f_%05d.jpg -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p" -c:v libx264 -crf 21 s2.mp4`, same for the end card, then `ffmpeg -f concat -safe 0 -i list.txt -i ../public/music/race.ogg -filter_complex "[1:a]atrim=0:26.5,afade=t=out:st=24.5:d=2[m]" -map 0:v -map "[m]" -c:v copy -c:a aac -shortest -movflags +faststart trailer-landscape.mp4`.
  Vertical: same, with the gameplay segment filtered as `crop='min(iw,ih*3/4)':ih:'(iw-min(iw,ih*3/4))/2':0,scale=720:960,pad=720:1280:0:160:color=#2f96ff` and the 9x16 cards scaled to 720x1280.
- What works in this genre (from the games that sold millions): real people screaming on a call, the raft spinning at the worst moment, a death right before the finish, one person tooting the wrong way. Never a feature list.
- Post format: 9:16, 8 to 20 seconds, faces or voices in it if you can, caption on screen in the first second ("we are NOT good at this"), game name at the end, link in bio.

## Posting plan (first 30 days)
- 3 clips a week on TikTok, Instagram Reels and YouTube Shorts (same clip, all three).
- Every clip ends with the raft logo and "free in your browser, link in bio".
- Pin a comment with the play link.
- Reply to every comment for the first hour; the algorithms reward it.
- Hashtags: #tootriver #coopgame #partygame #indiegame #browsergame #fartgame #gamingwithfriends #funnygaming

## Captions that fit
- "4 friends. 1 raft. 0 coordination."
- "the crew said WAIT. he did not wait."
- "we have been stuck at this hammer for 10 minutes"
- "free browser game, your group chat is going to hate you"
- "POV: you are the only one steering"

## Streamers (small ones say yes)
Target: streamers with 20 to 500 viewers who play co-op chaos games (R.E.P.O., PEAK, Chained Together, Content Warning). Message:

> Hey! I made a free browser party game, four people on one raft steering with farts, voice chat built in, zero install: just a link. Would love to see you and your chat try it. Party link: <link>. If it is not your thing, no worries at all.

Send 10 a day. One yes per twenty is normal.

## itch.io page (free to publish)
- Build: `npm run pack:itch` makes `toot-river-itch.zip` from `dist/`. Upload it as an HTML game, viewport 1280x720, "Mobile friendly" ticked, "Fullscreen button" ticked.
- Classification: Game. Kind: HTML. Genre: Racing. Tags: co-op, party, multiplayer, physics, funny, family-friendly, browser.
- Pricing: free, with "donations enabled". Later a $2.99 "supporter" download with the same build unlocks the Steam-style goodwill without changing the game.
- Cover image: `cover-630x500.png`. Screenshots: the `screenshots/` folder.
- Short description: "Four animals, one raft, one button each. A free co-op raft race with voice chat, 8 levels, a new Daily River every day. Play with friends from a link, no download."

## Discord (free)
Make a server with #play-now (people drop party links), #clips, #bugs. Put the invite in the game's Socials row (`SOCIAL` in `src/main.js`).

## Steam, later
When the free version shows people coming back (daily plays rising for a month on `/stats`), create the Steam page early for wishlists even before the paid build exists. Steam Direct: $100 once, refunded at $1,000 revenue.

## Numbers to watch
- `https://toot-river-broker.gas-rapids.workers.dev/stats` : plays per day, online vs local, crew sizes.
- `https://toot-river-broker.gas-rapids.workers.dev/log/recent` : crashes from testers.
- Daily River board: `.../daily/top?day=YYYY-MM-DD`.
