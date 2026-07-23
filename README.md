# LANCHAS — Harbor Sprint

A Super Sprint-style arcade racing game — but with speedboats. The whole
circuit is visible on one screen; race three laps around the bay against
three AI boats, dodging buoys, rocks, and a whirlpool.

## Play

Open `index.html` in a browser (or serve the folder with any static server,
e.g. `npx http-server . -p 8137`). The game scales to fill the window.

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Throttle |
| A D / ← → | Steer |
| S / ↓ | Brake / reverse |
| Esc | Pause |

## Features

- **Whole-track view** — classic Super Sprint presentation, one screen, 3 laps
- **Water physics** — anisotropic drag gives the boats a drifty, planing feel;
  banks, buoys and rocks bounce you with a speed penalty
- **Whirlpool hazard** — drags you sideways and bleeds speed; skirt it
- **3 AI opponents** — waypoint followers with per-boat skill and mild
  rubber-banding, they bump and tangle like everyone else
- **Race furniture** — checkered start/finish line, lap/position/best-lap HUD,
  countdown, results podium modal, pause modal
- **Effects** — wake trails, collision spray, animated current, bobbing buoys,
  WebAudio engine hum and beeps (mutable, remembered)
- **Crisp at any size** — canvas backing store rescales to the displayed size

## Tech

Plain HTML/CSS/JS, no dependencies. The track is a closed Catmull-Rom loop
sampled into ~600 points that drive rendering, collision (distance to
centerline), lap progress, and AI waypoints. Static scenery is pre-rendered
to an offscreen canvas.

`window.__lanchas` exposes a small dev hook (`step(ms)`, `state()`) for
automated testing.
