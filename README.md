# LANCHAS — Harbor Sprint

A Super Sprint-style arcade racing game — but with speedboats. The whole
circuit is visible on one screen; race three laps around the bay against
three AI boats, dodging buoys, rocks, and a whirlpool.

## Play

Open `index.html` in a browser (or serve the folder with any static server,
e.g. `npx http-server . -p 8137`). The game scales to fill the window.

## Multiplayer

Up to 4 players, each on their own computer:

1. One player clicks **Host online**, picks a name, and gets a 4-letter room
   code.
2. The others click **Join online** and enter the code. Empty seats race as AI.
3. The host starts the race; everyone gets the countdown together.

How it works: browsers connect directly to each other over WebRTC (PeerJS's
free public broker handles the handshake — no game server involved). The
host's browser simulates all boats; guests stream their throttle/steer inputs
(20 Hz) and receive 20 Hz snapshots. To keep controls feeling instant,
guests run **client-side prediction**: their own boat's physics runs locally
(walls, obstacles, whirlpools included) and is gently reconciled toward the
host's authoritative position, extrapolated by measured latency — so only
other boats carry the interpolation delay. If a guest drops mid-race, the AI
takes their boat over; if the host drops, guests return to the menu. Note:
the host should keep their tab visible — browsers throttle background tabs,
which would freeze the race for everyone.

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Throttle |
| A D / ← → | Steer |
| S / ↓ | Brake / reverse |
| Esc | Pause |

## Tracks

Pick a circuit from the start screen (mini-map previews included; your choice
is remembered):

| Track | Character |
|-------|-----------|
| **Bahía** | The classic bay — medium width, one mean S-bend, a whirlpool |
| **Laguna** | Wide, fast tropical oval — but the lagoon spins twice |
| **Río Bravo** | Narrow canyon river strewn with rocks |
| **Puerto Viejo** | Tight concrete harbor with chicanes and floating cargo |
| **Gran Travesía** | A vast delta ~10× the size of the others — the camera scrolls with your boat, a minimap shows the field, 2 laps |
| **Ocho Loco** | A giant figure-8 whose channels criss-cross mid-bay — real cross traffic at the junction, 2 laps |
| **Archipiélago** | A long, bright island-hopping coastal cruise, 2 laps |

## Boosters

Four ⚡ lightning bolts float on every track. Drive over one to grab it, then
press **Space** to fire it: double thrust for 4 seconds with a golden wake.
A taken bolt respawns 5 seconds later somewhere random on the circuit. AI
boats grab and use them too, and in multiplayer they are host-authoritative
(guests predict their own activation so Space feels instant).

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
