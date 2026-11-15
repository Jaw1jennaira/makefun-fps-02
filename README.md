# Sector Nine — Tactical FPS

A round-based tactical first-person shooter in the Counter-Strike style,
built original from the ground up for make.fun `threejs-fps-02`
(and reusable for `threejs-fps-01`). Static files, three.js 0.187.0 vendored,
no build step, no network. Open `game/index.html` from any static server
(`node serve.ts` → http://localhost:8080) and play single-player vs bots.

## The game

Vanguard (you + 2 bots) attacks; Crimson (4 bots) defends Sites A and B in
a dusk industrial yard. Win a round by planting the spike and defending it
until detonation, or by eliminating the Crimson squad. First to 4 rounds
takes the match (max 7 rounds). Money earned each round buys weapons, armor
and grenades in the buy phase between rounds.

- **Gunplay:** raycast hits, 2.5x headshots, recoil + spread that punish
  firing on the move, acceleration, crouch, jump, AABB map collision.
- **Tactics:** spike plant/defuse objective, buy economy ($800 start,
  +$300 kill, +$325 round win, +$250 round loss with a +$50 loss-streak
  bonus capped at +$150, +$300 plant), 4 weapons + frag grenade,
  bots that patrol lanes, hold sites, react to sight and sound, rush a
  planted spike and defuse it — each bot rolls its own skill (reaction
  time and accuracy) and calls out contacts, plants and defuses on the
  radio.
- **HUD:** health, armor, ammo, money, round timer, score, killfeed,
  minimap (enemies shown when spotted), crosshair that widens with
  movement, hitmarker, damage direction indicator, radio callouts,
  plant/defuse progress bars.
- **Sound:** fully procedural WebAudio (shots, hits, reload, plant beeps,
  explosion, footsteps, radio blips, round stingers) — no audio assets.

## Controls

WASD move · mouse look (pointer lock) · click fire · right mouse aim ·
R reload · 1–4 weapons · G frag grenade · E plant spike (hold, inside a
site) · Ctrl/C crouch · Space jump · Enter start round early.

## Files

| File | Job |
| --- | --- |
| `game/index.html` | HUD markup + import map (`three` → vendored module) |
| `game/src/main.js` | Boot, fixed 60 Hz sim loop, `?shot=` captures |
| `game/src/game.js` | Match state machine, economy, spike, grenades |
| `game/src/map.js` | Sector Nine arena, colliders, sites, waypoints |
| `game/src/bots.js` | Bot AI (patrol / engage / push / defuse) |
| `game/src/player.js` | Movement physics, crouch, jump, collision |
| `game/src/weapons.js` | Arsenal data, view-models, pooled tracers |
| `game/src/hud.js` | DOM HUD, buy menu, minimap |
| `game/src/input.js` | Keyboard + pointer-lock mouse |
| `game/src/audio.js` | Procedural WebAudio SFX |
| `game/src/util.js` | RNG, AABB segment test, body movement |
| `game/src/palette.js` | The one palette |
| `game/vendor/three/` | three.js 0.187.0, byte for byte from the kit |
| `main.ts` | Entrypoint: copies game/ + screenshots/ to /output, writes dossier.json |
| `vendor/makefun-threejs.ts` | Kit's dossier library, unchanged |
| `serve.ts` | Dev static server |
| `screenshots/` | 3 real renders of the game's own code |

## Screenshots

Taken headless from the game's own `?shot=` captures
(`shots.json`): `1-start.jpg` (menu + buy phase), `2-play.jpg`
(mid-firefight), `3-end.jpg` (round won).

## License

MIT — see `LICENSE`.
