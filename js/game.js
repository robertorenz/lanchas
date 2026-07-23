/* LANCHAS — Harbor Sprint
   Super Sprint-style top-down speedboat racing. Whole circuit on one screen,
   drifty water physics, hazards, 3 AI boats, 3 laps, multiple tracks. */

(() => {
'use strict';

// ---------------------------------------------------------------- helpers
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapAng = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
const ORD = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

// ---------------------------------------------------------------- canvas
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = 1000, H = 640;   // logical playfield size; RES scales the backing store
let RES = 1;

const HULL_R = 9;
let TOTAL_LAPS = 3;   // per-track (def.laps), set in selectTrack

// ---------------------------------------------------------------- track roster
// ctrl: closed Catmull-Rom loop, clockwise. t values are fractions of a lap
// measured from the start line; off is the sideways offset from centerline.
const TRACKS = [
  {
    id: 'bahia', name: 'Bahía', blurb: 'The classic bay. One mean S-bend.',
    half: 42, startNear: [455, 550], decor: 'palms',
    ctrl: [[520, 85], [730, 115], [880, 215], [905, 380], [795, 470], [625, 430],
           [520, 555], [355, 540], [200, 470], [125, 330], [175, 175], [350, 105]],
    palette: {
      land: '#DCC894', shore: '#C3AA72',
      water: ['#14567F', '#1F7FB5', '#2B8FC4'],
      mottle: ['rgba(158,166,110,.35)', 'rgba(201,181,126,.5)'], tree: '#4E7C4A'
    },
    buoys: [{ t: .08, off: 18 }, { t: .20, off: -16 }, { t: .38, off: 15 },
            { t: .50, off: -18 }, { t: .72, off: 16 }, { t: .86, off: -14 }],
    rocks: [{ t: .30, off: 24, r: 12 }, { t: .45, off: -22, r: 10 },
            { t: .78, off: 21, r: 13 }, { t: .93, off: -24, r: 11 }],
    crates: [], whirls: [{ t: .615, off: 0, r: 34 }]
  },
  {
    id: 'laguna', name: 'Laguna', blurb: 'Wide and fast — but the lagoon spins twice.',
    half: 48, startNear: [470, 558], decor: 'palms',
    ctrl: [[500, 90], [720, 110], [880, 200], [910, 340], [850, 470], [680, 550],
           [480, 560], [290, 530], [150, 430], [110, 290], [180, 160], [330, 95]],
    palette: {
      land: '#E2D8A8', shore: '#CDBB80',
      water: ['#0F6E86', '#1D96AC', '#2BA9BE'],
      mottle: ['rgba(150,170,105,.4)', 'rgba(205,187,128,.55)'], tree: '#3F7C4E'
    },
    buoys: [{ t: .07, off: 22 }, { t: .19, off: -22 }, { t: .31, off: 22 },
            { t: .43, off: -22 }, { t: .55, off: 22 }, { t: .67, off: -22 },
            { t: .79, off: 22 }, { t: .91, off: -22 }],
    rocks: [{ t: .40, off: 30, r: 11 }, { t: .90, off: -30, r: 12 }],
    crates: [], whirls: [{ t: .28, off: 10, r: 30 }, { t: .65, off: -8, r: 30 }]
  },
  {
    id: 'rio', name: 'Río Bravo', blurb: 'A narrow canyon river strewn with rocks.',
    half: 38, startNear: [105, 215], decor: 'pines',
    ctrl: [[150, 140], [320, 90], [480, 170], [620, 90], [800, 120], [900, 240],
           [870, 380], [920, 500], [760, 560], [600, 480], [440, 560], [280, 520],
           [130, 430], [90, 280]],
    palette: {
      land: '#A98F66', shore: '#8F7750',
      water: ['#0F5068', '#177690', '#2088A2'],
      mottle: ['rgba(122,101,66,.45)', 'rgba(96,116,62,.35)'], tree: '#3E6B44'
    },
    buoys: [{ t: .10, off: 14 }, { t: .35, off: -14 }, { t: .60, off: 14 },
            { t: .85, off: -14 }],
    rocks: [{ t: .15, off: -20, r: 11 }, { t: .22, off: 18, r: 10 },
            { t: .30, off: -16, r: 12 }, { t: .48, off: 20, r: 10 },
            { t: .55, off: -18, r: 13 }, { t: .70, off: 16, r: 10 },
            { t: .90, off: -18, r: 11 }],
    crates: [], whirls: [{ t: .42, off: 0, r: 26 }]
  },
  {
    id: 'puerto', name: 'Puerto Viejo', blurb: 'Tight concrete harbor. Mind the cargo.',
    half: 36, startNear: [280, 535], decor: 'port',
    ctrl: [[170, 110], [450, 90], [560, 180], [700, 100], [880, 130], [900, 280],
           [790, 330], [900, 430], [850, 560], [600, 540], [500, 430], [380, 545],
           [170, 520], [120, 350], [200, 250], [120, 180]],
    palette: {
      land: '#9AA3AA', shore: '#79838C',
      water: ['#123F55', '#175F7E', '#1F7292'],
      mottle: ['rgba(70,80,90,.30)', 'rgba(126,136,146,.4)'], tree: '#4E6B57'
    },
    buoys: [{ t: .08, off: 14 }, { t: .20, off: -14 }, { t: .33, off: 12 },
            { t: .50, off: -14 }, { t: .66, off: 12 }, { t: .80, off: -12 }],
    rocks: [],
    crates: [{ t: .12, off: -18, r: 10 }, { t: .28, off: 16, r: 10 },
             { t: .45, off: -16, r: 10 }, { t: .62, off: 18, r: 10 },
             { t: .88, off: -14, r: 10 }],
    whirls: []
  },
  {
    id: 'travesia', name: 'Gran Travesía', blurb: 'A vast delta expedition — 2 laps, follow the minimap.',
    half: 46, startNear: [950, 1815], decor: 'palms',
    w: 3000, h: 2000, samples: 2400, laps: 2,
    ctrl: [[300, 1750], [700, 1850], [1200, 1780], [1600, 1860], [2100, 1800],
           [2500, 1650], [2750, 1400], [2600, 1150], [2300, 1250], [2050, 1100],
           [2200, 850], [2550, 900], [2800, 650], [2600, 350], [2200, 250],
           [1800, 400], [1500, 250], [1100, 300], [800, 180], [450, 300],
           [200, 600], [350, 900], [150, 1250], [250, 1550]],
    palette: {
      land: '#C9C08B', shore: '#A89A64',
      water: ['#12536E', '#1B7A9C', '#2790AF'],
      mottle: ['rgba(139,158,96,.45)', 'rgba(168,154,100,.5)'], tree: '#47764C'
    },
    buoys: [{ t: .05, off: 22 }, { t: .13, off: -20 }, { t: .21, off: 20 },
            { t: .29, off: -22 }, { t: .37, off: 20 }, { t: .45, off: -20 },
            { t: .53, off: 22 }, { t: .61, off: -20 }, { t: .69, off: 20 },
            { t: .77, off: -22 }, { t: .85, off: 20 }, { t: .93, off: -20 }],
    rocks: [{ t: .09, off: 26, r: 13 }, { t: .18, off: -24, r: 11 },
            { t: .33, off: 25, r: 12 }, { t: .41, off: -26, r: 14 },
            { t: .57, off: 24, r: 11 }, { t: .66, off: -25, r: 13 },
            { t: .81, off: 26, r: 12 }, { t: .97, off: -24, r: 11 }],
    crates: [],
    whirls: [{ t: .25, off: 0, r: 40 }, { t: .55, off: -6, r: 40 }, { t: .88, off: 4, r: 36 }]
  },
  {
    id: 'ocho', name: 'Ocho Loco', blurb: 'A giant figure-8 — the channels criss-cross mid-bay. Watch for cross traffic!',
    half: 44, startNear: [700, 1400], decor: 'palms',
    w: 2600, h: 1800, samples: 1800, laps: 2,
    ctrl: [[1050, 1160], [700, 1400], [300, 1250], [180, 850], [350, 480],
           [750, 350], [1080, 640], [1550, 1180], [1900, 1430], [2320, 1250],
           [2440, 850], [2260, 470], [1830, 350], [1520, 640]],
    palette: {
      land: '#B7A97E', shore: '#96865C',
      water: ['#114C63', '#1A7189', '#26839C'],
      mottle: ['rgba(130,142,88,.42)', 'rgba(163,146,102,.5)'], tree: '#4A7550'
    },
    buoys: [{ t: .08, off: 20 }, { t: .2, off: -20 }, { t: .32, off: 20 },
            { t: .44, off: -20 }, { t: .58, off: 20 }, { t: .7, off: -20 },
            { t: .82, off: 20 }, { t: .94, off: -20 }],
    rocks: [{ t: .14, off: 26, r: 12 }, { t: .38, off: -25, r: 11 },
            { t: .64, off: 26, r: 13 }, { t: .88, off: -25, r: 12 }],
    crates: [],
    whirls: [{ t: .26, off: 0, r: 38 }, { t: .76, off: 0, r: 38 }]
  },
  {
    id: 'archipielago', name: 'Archipiélago', blurb: 'A long island-hopping coastal cruise. Big, bright, and busy.',
    half: 42, startNear: [800, 1750], decor: 'palms',
    w: 2800, h: 1900, samples: 2000, laps: 2,
    ctrl: [[350, 1650], [800, 1750], [1300, 1600], [1700, 1730], [2200, 1650],
           [2550, 1400], [2400, 1100], [2600, 800], [2450, 450], [2000, 300],
           [1600, 450], [1250, 280], [850, 380], [500, 250], [200, 500],
           [300, 850], [150, 1200], [280, 1450]],
    palette: {
      land: '#E0D4A2', shore: '#C4B078',
      water: ['#0E6B84', '#1C93A9', '#2AA6BB'],
      mottle: ['rgba(148,168,104,.42)', 'rgba(196,176,120,.5)'], tree: '#3F7C4E'
    },
    buoys: [{ t: .06, off: 20 }, { t: .16, off: -20 }, { t: .26, off: 20 },
            { t: .36, off: -20 }, { t: .46, off: 20 }, { t: .56, off: -20 },
            { t: .66, off: 20 }, { t: .76, off: -20 }, { t: .86, off: 20 },
            { t: .96, off: -20 }],
    rocks: [{ t: .11, off: 25, r: 12 }, { t: .31, off: -24, r: 11 },
            { t: .51, off: 25, r: 13 }, { t: .61, off: -25, r: 11 },
            { t: .81, off: 24, r: 12 }, { t: .91, off: -25, r: 13 }],
    crates: [],
    whirls: [{ t: .41, off: 0, r: 36 }, { t: .71, off: -6, r: 36 }]
  }
];

function buildTrack(def) {
  const pts = [];
  const n = def.ctrl.length, SEG = Math.round((def.samples || 600) / n);
  for (let i = 0; i < n; i++) {
    const p0 = def.ctrl[(i - 1 + n) % n], p1 = def.ctrl[i],
          p2 = def.ctrl[(i + 1) % n], p3 = def.ctrl[(i + 2) % n];
    for (let s = 0; s < SEG; s++) {
      const u = s / SEG, u2 = u * u, u3 = u2 * u;
      pts.push({
        x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
      });
    }
  }
  const NN = pts.length;
  for (let i = 0; i < NN; i++) {
    const a = pts[(i - 1 + NN) % NN], b = pts[(i + 1) % NN];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    pts[i].tx = dx / d; pts[i].ty = dy / d;
    pts[i].nx = -dy / d; pts[i].ny = dx / d;
  }
  let startIdx = 0, bd = Infinity;
  for (let i = 0; i < NN; i++) {
    const d = dist2(def.startNear[0], def.startNear[1], pts[i].x, pts[i].y);
    if (d < bd) { bd = d; startIdx = i; }
  }
  const at = (t, off) => {
    const p = pts[(startIdx + Math.round(t * NN)) % NN];
    return { x: p.x + p.nx * off, y: p.y + p.ny * off };
  };
  const centerPath = new Path2D();
  centerPath.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < NN; i++) centerPath.lineTo(pts[i].x, pts[i].y);
  centerPath.closePath();
  return {
    def, pts, N: NN, startIdx, half: def.half, centerPath,
    world: { w: def.w || 1000, h: def.h || 640 },
    buoys: def.buoys.map((b, i) => ({ ...at(b.t, b.off), r: 7, phase: i * 1.7 })),
    rocks: def.rocks.map(r => ({ ...at(r.t, r.off), r: r.r })),
    crates: def.crates.map((c, i) => ({ ...at(c.t, c.off), r: c.r, rot: i * 0.9 })),
    whirls: def.whirls.map(w => ({ ...at(w.t, w.off), r: w.r }))
  };
}

const built = TRACKS.map(buildTrack);
let T = built[0];

function nearestIdx(x, y, hint) {
  const pts = T.pts, NN = T.N;
  let best = 0, bd = Infinity;
  if (hint == null) {
    for (let i = 0; i < NN; i++) {
      const d = dist2(x, y, pts[i].x, pts[i].y);
      if (d < bd) { bd = d; best = i; }
    }
  } else {
    for (let k = -45; k <= 45; k++) {
      const i = (hint + k + NN * 2) % NN;
      const d = dist2(x, y, pts[i].x, pts[i].y);
      if (d < bd) { bd = d; best = i; }
    }
    // hint too stale (e.g. teleport correction): fall back to a full scan
    if (bd > (T.half + 20) ** 2) return nearestIdx(x, y, null);
  }
  return best;
}

// ---------------------------------------------------------------- audio
const snd = {
  ctx: null, master: null, engine: null, engineGain: null, muted: false,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 40;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      osc.connect(lp).connect(this.engineGain).connect(this.master);
      osc.start();
      this.engine = osc;
    } catch (e) { /* no audio available — game runs silent */ }
  },
  setEngine(speed, on) {
    if (!this.ctx) return;
    const s = clamp(speed / 240, 0, 1);
    this.engine.frequency.setTargetAtTime(38 + s * 85, this.ctx.currentTime, .05);
    this.engineGain.gain.setTargetAtTime(on ? .10 + s * .10 : 0, this.ctx.currentTime, .1);
  },
  beep(freq, dur = .12, vol = .3) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  },
  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + .15);
    g.gain.setValueAtTime(.4, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + .18);
    o.connect(g).connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + .2);
  },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.beep(f, .22, .25), i * 140));
  },
  ding() {
    this.beep(1180, .07, .22);
    setTimeout(() => this.beep(1570, .1, .22), 70);
  },
  zap() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + .3);
    g.gain.setValueAtTime(.25, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + .4);
    o.connect(g).connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + .4);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try { localStorage.setItem('lanchas-muted', this.muted ? '1' : '0'); } catch (e) {}
    return this.muted;
  }
};
try { snd.muted = localStorage.getItem('lanchas-muted') === '1'; } catch (e) {}

// ---------------------------------------------------------------- boats
const SLOT_STYLE = [
  { color: '#E2523E', trim: '#EDF4F7' },
  { color: '#2E9E9B', trim: '#0B2434' },
  { color: '#F5B841', trim: '#0B2434' },
  { color: '#ECEFF1', trim: '#E2523E' }
];
const AI_NAMES = ['Skipper', 'Corsario', 'Pelícano', 'Tormenta'];
const AI_SKILL = [.94, .955, .925, .895];

function defaultRoster() {
  return SLOT_STYLE.map((s, i) => i === 0
    ? { name: 'You', ai: false, remote: false }
    : { name: AI_NAMES[i], ai: true, remote: false, skill: AI_SKILL[i] });
}

let boats = [];
let raceRoster = null;   // null -> solo default; set for online races
let ME = 0;              // index of the boat this browser controls

function spawnBoats() {
  const roster = raceRoster || defaultRoster();
  boats = roster.map((r, i) => {
    const row = Math.floor(i / 2), lane = (i % 2 === 0 ? 1 : -1) * 14;
    const idx = (T.startIdx - 12 - row * 11 + T.N) % T.N;
    const p = T.pts[idx];
    return {
      name: r.name, ai: !!r.ai, remote: !!r.remote,
      skill: r.skill ?? AI_SKILL[i],
      color: SLOT_STYLE[i].color, trim: SLOT_STYLE[i].trim,
      netIn: { th: 0, st: 0, sp: 0 },
      x: p.x + p.nx * lane, y: p.y + p.ny * lane,
      a: Math.atan2(p.ty, p.tx),
      vx: 0, vy: 0, steer: 0, throttle: 0,
      boostHeld: false, boostT: 0, boostUseAt: 0, boostLockT: 0,
      idx, prevIdx: idx, prog: -12 - row * 11,
      lapsDone: 0, lapStamp: 0, bestLap: null,
      finished: false, finishTime: null,
      grindCool: 0, bumpCool: 0, wob: Math.random() * TAU
    };
  });
}

// ---------------------------------------------------------------- physics
const ACCEL = 265, REV_ACCEL = 130, F_DRAG = 1.12, L_DRAG = 4.6, TURN = 2.7;

function driveAI(b, dt, playerProg) {
  const look = 13 + Math.hypot(b.vx, b.vy) * 0.055;
  const tp = T.pts[(b.idx + Math.round(look)) % T.N];
  const amp = clamp(T.half - 34, 3, 9); // less lane wandering on narrow tracks
  const wobble = Math.sin(perf * .7 + b.wob) * amp;
  const tx = tp.x + tp.nx * wobble, ty = tp.y + tp.ny * wobble;
  const diff = wrapAng(Math.atan2(ty - b.y, tx - b.x) - b.a);
  b.steer = clamp(diff * 3, -1, 1);
  // rubber-band: trail the player a little harder, ease off when ahead
  const gap = clamp((playerProg - b.prog) / T.N, -0.5, 0.5);
  const eff = clamp(b.skill + gap * 0.16, 0.8, 1.02);
  b.throttle = (Math.abs(diff) > 1.1 ? 0.55 : 1) * eff;
}

function stepBoat(b, dt) {
  const spd = Math.hypot(b.vx, b.vy);
  b.a = wrapAng(b.a + TURN * b.steer * clamp(spd / 90, 0, 1) * dt);

  b.boostT = Math.max(0, b.boostT - dt);
  b.boostLockT = Math.max(0, b.boostLockT - dt);
  const th = b.throttle;
  const acc = ACCEL * (b.boostT > 0 ? 2 : 1);   // boost doubles thrust => ~2x top speed
  if (th > 0) { b.vx += Math.cos(b.a) * acc * th * dt; b.vy += Math.sin(b.a) * acc * th * dt; }
  else if (th < 0) { b.vx += Math.cos(b.a) * REV_ACCEL * th * dt; b.vy += Math.sin(b.a) * REV_ACCEL * th * dt; }

  // anisotropic water drag -> drift feel
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  let fwd = b.vx * ca + b.vy * sa;
  let lat = -b.vx * sa + b.vy * ca;
  fwd *= Math.exp(-F_DRAG * dt);
  lat *= Math.exp(-L_DRAG * dt);
  b.vx = ca * fwd - sa * lat;
  b.vy = sa * fwd + ca * lat;

  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // channel bounds
  b.idx = nearestIdx(b.x, b.y, b.idx);
  const p = T.pts[b.idx];
  const dx = b.x - p.x, dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const lim = T.half - HULL_R + 2;
  if (d > lim) {
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * lim; b.y = p.y + ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) { b.vx -= vn * 1.5 * nx; b.vy -= vn * 1.5 * ny; }
    b.vx *= 0.97; b.vy *= 0.97;
    if (b.grindCool <= 0 && spd > 60) {
      spray(b.x + nx * 6, b.y + ny * 6, 5);
      if (b === boats[ME]) snd.thud();
      b.grindCool = .35;
    }
  }
  b.grindCool -= dt;
  b.bumpCool -= dt;

  // hazards
  for (const list of [T.buoys, T.rocks, T.crates]) {
    for (const o of list) {
      const ox = b.x - o.x, oy = b.y - o.y;
      const od = Math.hypot(ox, oy), min = o.r + HULL_R;
      if (od < min && od > 0.001) {
        const nx = ox / od, ny = oy / od;
        b.x = o.x + nx * min; b.y = o.y + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= vn * 1.7 * nx; b.vy -= vn * 1.7 * ny; }
        b.vx *= 0.82; b.vy *= 0.82;
        if (b.bumpCool <= 0) {
          spray(b.x, b.y, 8);
          if (b === boats[ME]) snd.thud();
          b.bumpCool = .3;
        }
      }
    }
  }

  // whirlpools: drag you sideways and bleed speed
  for (const wh of T.whirls) {
    const wx = b.x - wh.x, wy = b.y - wh.y;
    const wd = Math.hypot(wx, wy);
    if (wd < wh.r + 14) {
      const k = 1 - wd / (wh.r + 14);
      b.vx += (-wy / (wd || 1)) * 260 * k * dt;
      b.vy += ( wx / (wd || 1)) * 260 * k * dt;
      b.vx *= 1 - 0.9 * k * dt;
      b.vy *= 1 - 0.9 * k * dt;
      b.a = wrapAng(b.a + 1.4 * k * dt);
    }
  }
}

// lap progress: accumulate the wrapped delta of the nearest-sample index
function updateProgress(b) {
  let d = b.idx - b.prevIdx;
  if (d > T.N / 2) d -= T.N;
  if (d < -T.N / 2) d += T.N;
  b.prog += d;
  b.prevIdx = b.idx;
}

// ---------------------------------------------------------------- particles
const parts = [];
function spray(x, y, n) {
  for (let i = 0; i < n && parts.length < 420; i++) {
    const a = Math.random() * TAU, s = 20 + Math.random() * 70;
    parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0, max: .35 + Math.random() * .3,
      r: 1.5 + Math.random() * 2.5, wake: false
    });
  }
}
function wake(b) {
  const spd = Math.hypot(b.vx, b.vy);
  if (spd < 55 || parts.length > 380) return;
  const sx = b.x - Math.cos(b.a) * 12, sy = b.y - Math.sin(b.a) * 12;
  parts.push({
    x: sx + (Math.random() - .5) * 4, y: sy + (Math.random() - .5) * 4,
    vx: -Math.cos(b.a) * 14 + (Math.random() - .5) * 10,
    vy: -Math.sin(b.a) * 14 + (Math.random() - .5) * 10,
    life: 0, max: .8 + Math.random() * .5,
    r: 2 + Math.random() * 2, wake: true
  });
  if (b.boostT > 0) {   // golden exhaust while boosting
    parts.push({
      x: sx, y: sy,
      vx: -Math.cos(b.a) * 60 + (Math.random() - .5) * 30,
      vy: -Math.sin(b.a) * 60 + (Math.random() - .5) * 30,
      life: 0, max: .3 + Math.random() * .25,
      r: 2 + Math.random() * 2.5, wake: false, gold: true
    });
  }
}
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= .96; p.vy *= .96;
  }
}

// ---------------------------------------------------------------- boosters
// Lightning bolts float on the track. Drive over one to hold it, press
// Space for 2x thrust for 4s. Taken bolts respawn 5s later somewhere random.
const BOLT_R = 11, BOOST_TIME = 4, BOLT_RESPAWN = 5;
let bolts = [];

function boltPos(t, off) {
  const p = T.pts[(T.startIdx + Math.round(t * T.N) + T.N) % T.N];
  return { x: p.x + p.nx * off, y: p.y + p.ny * off };
}

function spawnBolts() {
  bolts = [.12, .37, .62, .87].map((t, i) => ({
    ...boltPos(t, (i % 2 ? -1 : 1) * 10),
    active: true, respawnT: 0, phase: i * 1.3
  }));
}

function updateBolts(dt) {   // host / solo only
  for (const o of bolts) {
    if (!o.active && raceTime >= o.respawnT) {
      const spot = boltPos(Math.random(), (Math.random() * 2 - 1) * (T.half - 22));
      o.x = spot.x; o.y = spot.y;
      o.active = true;
    }
    if (!o.active) continue;
    for (const b of boats) {
      if (b.boostHeld || b.finished) continue;
      if (dist2(b.x, b.y, o.x, o.y) < (BOLT_R + HULL_R) ** 2) {
        o.active = false;
        o.respawnT = raceTime + BOLT_RESPAWN;
        b.boostHeld = true;
        b.boostUseAt = raceTime + 0.6 + Math.random() * 1.2;   // AI usage delay
        if (b === boats[ME]) snd.ding();
        break;
      }
    }
  }
}

function activateBoost(b) {
  if (!b.boostHeld || b.boostT > 0) return;
  b.boostHeld = false;
  b.boostT = BOOST_TIME;
  spray(b.x, b.y, 6);
  if (b === boats[ME]) snd.zap();
}

function drawBolts() {
  for (const o of bolts) {
    if (!o.active) continue;
    const bob = Math.sin(perf * 2.4 + o.phase) * 2;
    const pulse = 1 + Math.sin(perf * 4 + o.phase) * 0.08;
    ctx.save();
    ctx.translate(o.x, o.y + bob);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(245,184,65,.25)';
    ctx.beginPath(); ctx.arc(0, 0, BOLT_R + 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#EDF4F7';
    ctx.beginPath(); ctx.arc(0, 0, BOLT_R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(9,32,46,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#F5B841';
    ctx.strokeStyle = '#B9822A'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2.5, -7.5); ctx.lineTo(-4, 1.5); ctx.lineTo(-0.5, 1.5);
    ctx.lineTo(-2.5, 7.5); ctx.lineTo(4, -1.5); ctx.lineTo(0.5, -1.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawBoostHud() {
  if (state !== 'racing' && state !== 'finished') return;
  const me = boats[ME];
  if (!me) return;
  if (me.boostT > 0) {
    const w = 130, x = W / 2 - w / 2, y = H - 26;
    ctx.fillStyle = 'rgba(8,20,30,.6)';
    ctx.fillRect(x - 4, y - 4, w + 8, 16);
    ctx.fillStyle = '#F5B841';
    ctx.fillRect(x, y, w * (me.boostT / BOOST_TIME), 8);
  } else if (me.boostHeld) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 17px Bahnschrift, "Arial Narrow", sans-serif';
    const pulse = .75 + Math.sin(perf * 5) * .25;
    ctx.fillStyle = 'rgba(8,20,30,.65)';
    ctx.fillRect(W / 2 - 92, H - 38, 184, 26);
    ctx.fillStyle = `rgba(245,184,65,${pulse.toFixed(2)})`;
    ctx.fillText('⚡ SPACE — BOOST', W / 2, H - 25);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- static scene
const bg = document.createElement('canvas');
bg.width = W; bg.height = H;
let BGR = 1;   // background backing-store scale (capped for huge worlds)

function paintScene() {
  const wld = T.world;
  BGR = Math.min(RES, Math.sqrt(12e6 / (wld.w * wld.h)));
  bg.width = Math.round(wld.w * BGR);
  bg.height = Math.round(wld.h * BGR);
  const g = bg.getContext('2d');
  g.setTransform(BGR, 0, 0, BGR, 0, 0);
  const rnd = mulberry32(20260722);
  const pal = T.def.palette;
  const pts = T.pts, NN = T.N;
  const area = (wld.w * wld.h) / (1000 * 640);   // decoration density factor

  g.fillStyle = pal.land;
  g.fillRect(0, 0, wld.w, wld.h);

  const offChannel = (x, y, margin) => {
    let bd = Infinity;
    for (let i = 0; i < NN; i += 4) {
      const d = dist2(x, y, pts[i].x, pts[i].y);
      if (d < bd) bd = d;
    }
    return bd > margin * margin;
  };

  // land mottling
  for (let i = 0; i < Math.round(260 * area); i++) {
    const x = rnd() * wld.w, y = rnd() * wld.h;
    if (!offChannel(x, y, T.half + 26)) continue;
    g.fillStyle = pal.mottle[rnd() < .5 ? 0 : 1];
    g.beginPath();
    if (T.def.decor === 'port') {
      g.rect(x - 14, y - 8, 14 + rnd() * 22, 8 + rnd() * 14); // concrete plates
    } else {
      g.ellipse(x, y, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * TAU, 0, TAU);
    }
    g.fill();
  }

  g.lineJoin = g.lineCap = 'round';
  g.strokeStyle = pal.shore;    g.lineWidth = (T.half + 9) * 2;  g.stroke(T.centerPath);
  g.strokeStyle = pal.water[0]; g.lineWidth = T.half * 2;        g.stroke(T.centerPath);
  g.strokeStyle = pal.water[1]; g.lineWidth = T.half * 2 - 16;   g.stroke(T.centerPath);
  g.strokeStyle = pal.water[2]; g.lineWidth = T.half * 2 - 40;   g.stroke(T.centerPath);

  // start / finish checkers across the channel
  const sp = pts[T.startIdx];
  g.save();
  g.translate(sp.x, sp.y);
  g.rotate(Math.atan2(sp.ny, sp.nx));
  const sq = 7, cols = Math.ceil(T.half / sq);
  for (let r = 0; r < 2; r++)
    for (let c = -cols; c < cols; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? '#EDF4F7' : '#12222E';
      g.fillRect(c * sq, -sq + r * sq, sq, sq);
    }
  g.restore();

  // rocks
  for (const r of T.rocks) {
    g.fillStyle = 'rgba(9,32,46,.35)';
    g.beginPath(); g.ellipse(r.x + 2, r.y + 3, r.r, r.r * .8, 0, 0, TAU); g.fill();
    g.fillStyle = '#7E858B';
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, rr = r.r * (.75 + rnd() * .35);
      const px = r.x + Math.cos(a) * rr, py = r.y + Math.sin(a) * rr * .85;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#9AA1A7';
    g.beginPath(); g.ellipse(r.x - r.r * .25, r.y - r.r * .3, r.r * .45, r.r * .3, -.5, 0, TAU); g.fill();
  }

  // floating cargo crates
  for (const c of T.crates) {
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.rot);
    g.fillStyle = 'rgba(9,32,46,.35)';
    g.fillRect(-c.r + 2, -c.r + 3, c.r * 2, c.r * 2);
    g.fillStyle = '#A5793F';
    g.fillRect(-c.r, -c.r, c.r * 2, c.r * 2);
    g.strokeStyle = '#7C5A2C'; g.lineWidth = 2;
    g.strokeRect(-c.r + 1, -c.r + 1, c.r * 2 - 2, c.r * 2 - 2);
    g.beginPath(); g.moveTo(-c.r, -c.r); g.lineTo(c.r, c.r);
    g.moveTo(c.r, -c.r); g.lineTo(-c.r, c.r); g.stroke();
    g.restore();
  }

  // a small dock on the shore near the start
  {
    const p = pts[(T.startIdx + Math.round(0.02 * NN)) % NN];
    const dp = { x: p.x - p.nx * (T.half + 4), y: p.y - p.ny * (T.half + 4) };
    g.save();
    g.translate(dp.x, dp.y);
    g.rotate(Math.atan2(p.ty, p.tx));
    g.fillStyle = '#8A6B48'; g.fillRect(-26, -6, 52, 16);
    g.fillStyle = '#A07E56';
    for (let i = -24; i < 26; i += 8) g.fillRect(i, -6, 6, 16);
    g.restore();
  }

  // trees
  if (T.def.decor !== 'port') {
    let planted = 0, tries = 0;
    const wanted = Math.round(8 * area), maxTries = 150 * Math.ceil(area);
    while (planted < wanted && tries++ < maxTries) {
      const px = 40 + rnd() * (wld.w - 80), py = 40 + rnd() * (wld.h - 80);
      if (!offChannel(px, py, T.half + 34)) continue;
      planted++;
      g.fillStyle = 'rgba(9,32,46,.25)';
      g.beginPath(); g.ellipse(px + 4, py + 5, 14, 6, 0, 0, TAU); g.fill();
      if (T.def.decor === 'pines') {
        g.fillStyle = '#6B4F33';
        g.fillRect(px - 2, py - 2, 4, 8);
        g.fillStyle = pal.tree;
        for (let k = 3; k > 0; k--) {
          const w2 = 5 + k * 4, yy = py - 24 + k * 7;
          g.beginPath();
          g.moveTo(px, yy - 10); g.lineTo(px - w2, yy); g.lineTo(px + w2, yy);
          g.closePath(); g.fill();
        }
      } else {
        g.strokeStyle = '#8A6B48'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(px, py + 4); g.lineTo(px + 3, py - 10); g.stroke();
        g.fillStyle = pal.tree;
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU;
          g.beginPath();
          g.ellipse(px + 3 + Math.cos(a) * 9, py - 12 + Math.sin(a) * 5, 9, 3.5, a, 0, TAU);
          g.fill();
        }
      }
    }
  }
}
paintScene();

// render at the displayed size so the art stays crisp when the page fills the screen
function applyResolution() {
  const rect = cvs.getBoundingClientRect();
  const shownW = Math.min(rect.width || W, (rect.height || H) * (W / H));
  const target = clamp(shownW * (window.devicePixelRatio || 1) / W, 1, 2.5);
  if (Math.abs(target - RES) < 0.05) return;
  RES = target;
  cvs.width = Math.round(W * RES);
  cvs.height = Math.round(H * RES);
  paintScene();
}
window.addEventListener('resize', () => applyResolution());

// ---------------------------------------------------------------- camera
const cam = { x: 0, y: 0 };

function updateCamera(dt, snap) {
  const wld = T.world;
  if (wld.w <= W && wld.h <= H) { cam.x = 0; cam.y = 0; return; }
  const f = boats.length ? boats[ME] : null;
  const px = f ? f.x + f.vx * 0.25 : T.pts[T.startIdx].x;
  const py = f ? f.y + f.vy * 0.25 : T.pts[T.startIdx].y;
  const tx = clamp(px - W / 2, 0, wld.w - W);
  const ty = clamp(py - H / 2, 0, wld.h - H);
  if (snap) { cam.x = tx; cam.y = ty; return; }
  const k = 1 - Math.exp(-4 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

// minimap for tracks larger than the screen
let miniMap = null, miniScale = 1;
function buildMinimap() {
  const wld = T.world;
  if (wld.w <= W && wld.h <= H) { miniMap = null; return; }
  miniScale = Math.min(170 / wld.w, 120 / wld.h);
  miniMap = document.createElement('canvas');
  miniMap.width = Math.round(wld.w * miniScale) + 12;
  miniMap.height = Math.round(wld.h * miniScale) + 12;
  const mg = miniMap.getContext('2d');
  mg.fillStyle = 'rgba(8,20,30,.78)';
  mg.fillRect(0, 0, miniMap.width, miniMap.height);
  mg.translate(6, 6);
  mg.scale(miniScale, miniScale);
  mg.lineJoin = mg.lineCap = 'round';
  mg.strokeStyle = T.def.palette.water[1];
  mg.lineWidth = T.half * 2.6;
  mg.stroke(T.centerPath);
}

function drawMinimap() {
  if (!miniMap || state === 'menu') return;
  const mx = W - miniMap.width - 10, my = 10;
  ctx.drawImage(miniMap, mx, my);
  ctx.strokeStyle = 'rgba(237,244,247,.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 6 + cam.x * miniScale, my + 6 + cam.y * miniScale, W * miniScale, H * miniScale);
  for (let i = boats.length - 1; i >= 0; i--) {
    const b = boats[i];
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(mx + 6 + b.x * miniScale, my + 6 + b.y * miniScale, i === ME ? 4 : 3, 0, TAU);
    ctx.fill();
    if (i === ME) { ctx.strokeStyle = '#EDF4F7'; ctx.stroke(); }
  }
}

// ---------------------------------------------------------------- rendering
let perf = 0; // animation clock (runs even in menus)

function drawWater() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,196,226,.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 110]);
  ctx.lineDashOffset = -perf * 26;
  ctx.stroke(T.centerPath);
  ctx.strokeStyle = 'rgba(120,196,226,.22)';
  ctx.setLineDash([10, 150]);
  ctx.lineDashOffset = -perf * 38 - 60;
  ctx.lineWidth = 2;
  ctx.stroke(T.centerPath);
  ctx.restore();
}

function drawWhirls() {
  for (const wh of T.whirls) {
    ctx.save();
    ctx.translate(wh.x, wh.y);
    ctx.rotate(perf * 1.8);
    ctx.strokeStyle = 'rgba(230,244,250,.5)';
    ctx.lineWidth = 2.5;
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let s = 0; s <= 22; s++) {
        const a = arm * TAU / 3 + s * .32;
        const r = 3 + s * (wh.r - 4) / 22;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(10,40,60,.55)';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawBuoys() {
  for (const b of T.buoys) {
    const bob = Math.sin(perf * 2.1 + b.phase) * 1.6;
    ctx.fillStyle = 'rgba(9,32,46,.3)';
    ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 3, b.r + 1, b.r * .7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#E2523E';
    ctx.beginPath(); ctx.arc(b.x, b.y + bob, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#EDF4F7';
    ctx.beginPath(); ctx.arc(b.x, b.y + bob, b.r, -2.4, -0.7);
    ctx.arc(b.x, b.y + bob, b.r * .45, -0.7, -2.4, true);
    ctx.closePath(); ctx.fill();
  }
}

function drawBoat(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.a);
  ctx.fillStyle = 'rgba(9,32,46,.3)';
  ctx.beginPath(); ctx.ellipse(1, 3, 13, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.quadraticCurveTo(8, -7, -9, -6);
  ctx.quadraticCurveTo(-13, -5, -13, 0);
  ctx.quadraticCurveTo(-13, 5, -9, 6);
  ctx.quadraticCurveTo(8, 7, 15, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(9,32,46,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = b.trim;
  ctx.fillRect(-11, -1.4, 18, 2.8);
  ctx.fillStyle = '#12222E';
  ctx.beginPath(); ctx.ellipse(-2, 0, 4, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#22303A';
  ctx.fillRect(-15, -2.5, 4, 5);
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    const k = 1 - p.life / p.max;
    if (p.wake) {
      ctx.fillStyle = `rgba(230,244,250,${(.5 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - k) * 6, 0, TAU); ctx.fill();
    } else if (p.gold) {
      ctx.fillStyle = `rgba(245,184,65,${(.85 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(237,244,247,${(.9 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
  }
}

function drawCountdown(n) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 110px Bahnschrift, "Arial Narrow", sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(9,32,46,.75)';
  ctx.fillStyle = n === 'GO!' ? '#F5B841' : '#EDF4F7';
  ctx.strokeText(n, W / 2, H / 2 - 20);
  ctx.fillText(n, W / 2, H / 2 - 20);
  ctx.restore();
}

// ---------------------------------------------------------------- race state
const hud = {
  lap: document.getElementById('hud-lap'),
  pos: document.getElementById('hud-pos'),
  time: document.getElementById('hud-time'),
  best: document.getElementById('hud-best')
};
const modals = {
  start: document.getElementById('modal-start'),
  online: document.getElementById('modal-online'),
  pause: document.getElementById('modal-pause'),
  finish: document.getElementById('modal-finish')
};
function showModal(which) {
  for (const k in modals) modals[k].classList.toggle('hidden', k !== which);
}

let state = 'menu';        // menu | countdown | racing | paused | finished
let raceTime = 0, countT = 0, lastBeep = -1, finishShownAt = null;

function resetRace() {
  spawnBoats();
  parts.length = 0;
  raceTime = 0; lastBeep = -1; finishShownAt = null;
  countT = 3.6;
  state = 'countdown';
  spawnBolts();
  updateCamera(0, true);
  showModal(null);
}

function playerRank() {
  const sorted = [...boats].sort((a, b2) => b2.prog - a.prog);
  return sorted.indexOf(boats[ME]) + 1;
}

function updateHud() {
  const p = boats[ME];
  const lap = clamp(p.lapsDone + 1, 1, TOTAL_LAPS);
  hud.lap.textContent = p.finished ? `${TOTAL_LAPS}/${TOTAL_LAPS}` : `${lap}/${TOTAL_LAPS}`;
  hud.pos.textContent = ORD(playerRank());
  hud.time.textContent = fmtTime(raceTime);
  hud.best.textContent = p.bestLap == null ? '—' : fmtTime(p.bestLap);
}

function checkLaps(b) {
  const done = Math.floor(b.prog / T.N);
  if (done > b.lapsDone) {
    b.lapsDone = done;
    const lapTime = raceTime - b.lapStamp;
    b.lapStamp = raceTime;
    if (done > 0 && (b.bestLap == null || lapTime < b.bestLap)) b.bestLap = lapTime;
    if (b === boats[ME] && done < TOTAL_LAPS) snd.beep(880, .15, .25);
    if (done >= TOTAL_LAPS && !b.finished) {
      b.finished = true;
      b.finishTime = raceTime;
    }
  }
}

function showResults() {
  const p = boats[ME];
  const rank = [...boats].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.prog - a.prog;
  });
  const place = rank.indexOf(p) + 1;
  document.getElementById('finish-title').textContent =
    place === 1 ? 'Checkered flag — you win!' : `You finished ${ORD(place)}`;
  document.getElementById('finish-sub').textContent =
    net.mode === 'guest' ? 'Waiting for the host to start the next race…' :
    place === 1 ? `Fastest lancha on ${T.def.name} today.`
                : 'The podium slips away — take another run at it.';
  const tbody = modals.finish.querySelector('tbody');
  tbody.innerHTML = '';
  rank.forEach((b, i) => {
    const tr = document.createElement('tr');
    if (b === p) tr.className = 'you';
    const res = b.finished ? fmtTime(b.finishTime)
                           : `Lap ${clamp(b.lapsDone + 1, 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;
    tr.innerHTML = `<td>${ORD(i + 1)}</td>` +
      `<td><span class="swatch" style="background:${b.color}"></span> ${b.name}</td>` +
      `<td>${res}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('btn-restart').classList.toggle('hidden', net.mode === 'guest');
  document.getElementById('btn-change-track').classList.toggle('hidden', net.mode !== null);
  document.getElementById('btn-leave-finish').classList.toggle('hidden', net.mode === null);
  showModal('finish');
}

// ---------------------------------------------------------------- track select
const marqueeSub = document.getElementById('marquee-sub');
const grid = document.getElementById('track-grid');
let currentTrackIdx = 0;

function selectTrack(i, save = true) {
  currentTrackIdx = i;
  T = built[i];
  TOTAL_LAPS = T.def.laps || 3;
  marqueeSub.textContent = `SUPER HARBOR SPRINT · ${T.def.name.toUpperCase()} · ${TOTAL_LAPS} LAPS`;
  for (const el of grid.children)
    el.classList.toggle('selected', +el.dataset.i === i);
  paintScene();
  buildMinimap();
  updateCamera(0, true);
  if (save) try { localStorage.setItem('lanchas-track', String(i)); } catch (e) {}
}

TRACKS.forEach((def, i) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'track-card';
  card.dataset.i = i;
  const mini = document.createElement('canvas');
  mini.width = 150; mini.height = 96;
  const mg = mini.getContext('2d');
  const dw = def.w || 1000, dh = def.h || 640;
  const s = Math.min(150 / dw, 96 / dh);
  const ox = (150 - dw * s) / 2, oy = (96 - dh * s) / 2;
  mg.fillStyle = def.palette.land;
  mg.fillRect(0, 0, 150, 96);
  mg.save();
  mg.translate(ox, oy);
  mg.scale(s, s);
  mg.lineJoin = mg.lineCap = 'round';
  mg.strokeStyle = def.palette.shore; mg.lineWidth = Math.max((def.half + 9) * 2, 7 / s);
  mg.stroke(built[i].centerPath);
  mg.strokeStyle = def.palette.water[1]; mg.lineWidth = Math.max(def.half * 2, 5 / s);
  mg.stroke(built[i].centerPath);
  mg.restore();
  const sp = built[i].pts[built[i].startIdx];
  mg.fillStyle = '#EDF4F7';
  mg.fillRect(ox + sp.x * s - 2, oy + sp.y * s - 2, 4, 4);
  card.appendChild(mini);
  const nm = document.createElement('span');
  nm.className = 'track-name';
  nm.textContent = def.name;
  const bl = document.createElement('span');
  bl.className = 'track-blurb';
  bl.textContent = def.blurb;
  card.appendChild(nm);
  card.appendChild(bl);
  card.addEventListener('click', () => selectTrack(i));
  grid.appendChild(card);
});

let savedTrack = 0;
try { savedTrack = clamp(parseInt(localStorage.getItem('lanchas-track') || '0', 10) || 0, 0, TRACKS.length - 1); } catch (e) {}
selectTrack(savedTrack, false);

// ---------------------------------------------------------------- online play
// Host-authoritative over WebRTC (PeerJS): guests stream inputs, the host
// simulates every boat and broadcasts snapshots that guests interpolate.
const net = {
  mode: null,        // null | 'host' | 'guest'
  peer: null,
  conns: [],         // host: one per guest; guest: [connection to host]
  code: null,
  myName: '',
  mySlot: 0,
  lobby: [],         // host: [{slot, name, conn|null}]
  snaps: [],         // guest: recent snapshots [{rx, rt, b:[...]}]
  lastSnapSent: 0,
  lastInSent: 0,
  lastIn: '',
  halfRtt: 0.05,     // guest: smoothed one-way latency estimate
  lastPing: 0
};

const ui = id => document.getElementById(id);
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 4 },
  () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const roomId = code => 'lanchas-' + code.toLowerCase();

function cleanName(v, fallback) {
  const s = (v || '').trim().slice(0, 12);
  return s || fallback;
}

function netSend(conn, msg) { if (conn && conn.open) conn.send(msg); }
function netBroadcast(msg) { for (const c of net.conns) netSend(c, msg); }

function teardownNet() {
  if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
  net.mode = null; net.peer = null; net.conns = []; net.lobby = [];
  net.snaps = []; net.code = null; net.mySlot = 0;
  raceRoster = null; ME = 0;
}

function leaveOnline(reason) {
  teardownNet();
  state = 'menu';
  snd.setEngine(0, false);
  const status = ui('online-status');
  status.hidden = !reason;
  status.textContent = reason || '';
  showModal('start');
}

// ---- lobby UI ----
function openOnlineModal(mode) {
  ui('online-title').textContent = mode === 'host' ? 'Host an online race' : 'Join an online race';
  ui('btn-online-go').textContent = mode === 'host' ? 'Create room' : 'Join room';
  ui('online-code-wrap').hidden = mode === 'host';
  ui('online-setup').hidden = false;
  ui('online-lobby').hidden = true;
  ui('online-setup-status').textContent = '';
  ui('btn-online-go').dataset.mode = mode;
  showModal('online');
  ui('online-name').focus();
}

function lobbyRosterNames() {
  return SLOT_STYLE.map((s, i) => {
    const pl = net.lobby.find(p => p.slot === i);
    return pl ? { name: pl.name, human: true } : { name: AI_NAMES[i], human: false };
  });
}

function renderLobby() {
  ui('online-setup').hidden = true;
  ui('online-lobby').hidden = false;
  ui('lobby-code').textContent = net.code || '----';
  ui('lobby-track').textContent = TRACKS[currentTrackIdx].name;
  const list = ui('lobby-players');
  list.innerHTML = '';
  lobbyRosterNames().forEach((p, i) => {
    const li = document.createElement('li');
    const isMe = (net.mode === 'host' && i === 0) || (net.mode === 'guest' && i === net.mySlot);
    li.innerHTML = `<span class="swatch" style="background:${SLOT_STYLE[i].color}"></span>` +
      `<span>${p.name}${isMe ? ' (you)' : ''}</span>` +
      `<span class="who">${p.human ? 'player' : 'AI'}</span>`;
    list.appendChild(li);
  });
  ui('btn-lobby-start').classList.toggle('hidden', net.mode !== 'host');
  ui('lobby-status').textContent = net.mode === 'host'
    ? 'Share the code. Empty seats race as AI.'
    : 'Waiting for the host to start…';
}

// ---- hosting ----
function hostRoom(name) {
  net.mode = 'host';
  net.myName = name;
  net.code = makeCode();
  ui('online-setup-status').textContent = 'Contacting the harbor master…';
  const peer = new Peer(roomId(net.code));
  net.peer = peer;
  peer.on('open', () => {
    net.lobby = [{ slot: 0, name: net.myName, conn: null }];
    renderLobby();
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      const used = new Set(net.lobby.map(p => p.slot));
      let slot = -1;
      for (let i = 1; i < 4; i++) if (!used.has(i)) { slot = i; break; }
      if (slot === -1 || state !== 'menu') {
        netSend(conn, { t: 'full' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      conn.slot = slot;
      net.conns.push(conn);
      net.lobby.push({ slot, name: 'Captain', conn });
      netSend(conn, { t: 'welcome', slot, track: currentTrackIdx });
      broadcastLobby();
    });
    conn.on('data', m => onHostMsg(conn, m));
    conn.on('close', () => dropGuest(conn));
    conn.on('error', () => dropGuest(conn));
  });
  peer.on('error', e => {
    if (net.mode !== 'host') return;
    if (e.type === 'unavailable-id') { leaveOnline('That room code was taken — host again for a fresh one.'); return; }
    // Broker trouble is only fatal while the lobby is still empty; established
    // WebRTC connections don't need the broker to keep working.
    if (state === 'menu' && net.conns.length === 0) leaveOnline('Could not reach the matchmaking service. Try again.');
  });
  peer.on('disconnected', () => {
    if (net.mode === 'host' && net.peer === peer) { try { peer.reconnect(); } catch (e) {} }
  });
}

function broadcastLobby() {
  netBroadcast({ t: 'lobby', players: net.lobby.map(p => ({ slot: p.slot, name: p.name })), track: currentTrackIdx });
  renderLobby();
}

function onHostMsg(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    const pl = net.lobby.find(p => p.conn === conn);
    if (pl) { pl.name = cleanName(m.name, `Captain ${pl.slot + 1}`); broadcastLobby(); }
  } else if (m.t === 'in') {
    const b = boats[conn.slot];
    if (b && b.remote) {
      b.netIn.th = clamp(+m.th || 0, -1, 1);
      b.netIn.st = clamp(+m.st || 0, -1, 1);
      b.netIn.sp = m.sp ? 1 : 0;
    }
  } else if (m.t === 'ping') {
    netSend(conn, { t: 'pong', ts: m.ts });
  }
}

function dropGuest(conn) {
  net.conns = net.conns.filter(c => c !== conn);
  const pl = net.lobby.find(p => p.conn === conn);
  if (!pl) return;
  net.lobby = net.lobby.filter(p => p !== pl);
  const b = boats[pl.slot];
  if (b && b.remote) { b.remote = false; b.ai = true; }   // mid-race: AI takes over
  if (state === 'menu') broadcastLobby();
}

function hostStartRace() {
  const roster = lobbyRosterNames().map((p, i) => ({
    name: i === 0 ? net.myName : p.name,
    ai: !p.human && i !== 0,
    remote: p.human && i !== 0,
    skill: AI_SKILL[i]
  }));
  raceRoster = roster;
  ME = 0;
  netBroadcast({ t: 'start', track: currentTrackIdx, roster: roster.map(r => ({ name: r.name, ai: r.ai })) });
  resetRace();
}

// ---- joining ----
function joinRoom(code, name) {
  net.mode = 'guest';
  net.myName = name;
  net.code = code;
  ui('online-setup-status').textContent = 'Looking for the room…';
  const peer = new Peer();
  net.peer = peer;
  peer.on('open', () => {
    const conn = peer.connect(roomId(code), { serialization: 'json' });
    net.conns = [conn];
    conn.on('open', () => netSend(conn, { t: 'hello', name: net.myName }));
    conn.on('data', onGuestMsg);
    conn.on('close', () => { if (net.mode === 'guest') leaveOnline('Lost the connection to the host.'); });
  });
  peer.on('error', e => {
    if (net.mode !== 'guest') return;
    if (e.type === 'peer-unavailable') { leaveOnline(`No room found with code ${code}.`); return; }
    // Broker trouble only matters before the host connection is established
    if (!(net.conns[0] && net.conns[0].open)) leaveOnline('Could not reach the matchmaking service. Try again.');
  });
  peer.on('disconnected', () => {
    if (net.mode === 'guest' && net.peer === peer) { try { peer.reconnect(); } catch (e) {} }
  });
}

function onGuestMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'welcome') {
    net.mySlot = m.slot;
    selectTrack(m.track, false);
    renderLobby();
  } else if (m.t === 'lobby') {
    net.lobby = m.players.map(p => ({ slot: p.slot, name: p.name, conn: null }));
    selectTrack(m.track, false);
    if (state === 'menu') renderLobby();
  } else if (m.t === 'full') {
    leaveOnline('That room is full or already racing.');
  } else if (m.t === 'start') {
    selectTrack(m.track, false);
    raceRoster = m.roster.map(r => ({ name: r.name, ai: r.ai, remote: false }));
    ME = net.mySlot;
    net.snaps = [];
    resetRace();
  } else if (m.t === 'snap') {
    net.snaps.push({ rx: performance.now() / 1000, rt: m.rt, b: m.b, k: m.k });
    if (net.snaps.length > 8) net.snaps.shift();
  } else if (m.t === 'pong') {
    const rtt = performance.now() / 1000 - m.ts;
    if (rtt >= 0 && rtt < 2) net.halfRtt = net.halfRtt * 0.7 + (rtt / 2) * 0.3;
  }
}

// ---- host: broadcast snapshots ----
function hostSendSnap() {
  if (perf - net.lastSnapSent < 0.05) return;
  net.lastSnapSent = perf;
  netBroadcast({
    t: 'snap', rt: raceTime,
    b: boats.map(b => [
      Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10,
      Math.round(b.a * 1000) / 1000,
      Math.round(b.vx), Math.round(b.vy),
      b.prog, b.lapsDone, b.bestLap, b.finished ? 1 : 0, b.finishTime,
      b.boostHeld ? 1 : 0, Math.round(b.boostT * 10) / 10
    ]),
    k: bolts.map(o => [Math.round(o.x), Math.round(o.y), o.active ? 1 : 0])
  });
}

// ---- guest: predict own boat, interpolate the rest, stream inputs ----
function guestUpdate(dt) {
  if (!boats.length) return;
  const S = net.snaps;
  const me = boats[ME];

  // latency probe for reconciliation extrapolation
  if (perf - net.lastPing > 2) {
    net.lastPing = perf;
    netSend(net.conns[0], { t: 'ping', ts: performance.now() / 1000 });
  }

  // other boats: render slightly in the past, interpolated between snapshots
  if (S.length) {
    const now = performance.now() / 1000 - 0.10;
    let s0 = S[0], s1 = S[S.length - 1];
    for (let i = 0; i < S.length - 1; i++)
      if (S[i].rx <= now && S[i + 1].rx >= now) { s0 = S[i]; s1 = S[i + 1]; break; }
    if (now > s1.rx) s0 = s1;
    const span = s1.rx - s0.rx;
    const k = span > 0.001 ? clamp((now - s0.rx) / span, 0, 1) : 1;
    boats.forEach((b, i) => {
      const a0 = s0.b[i], a1 = s1.b[i];
      if (!a0 || !a1) return;
      // authoritative race bookkeeping for everyone, including me
      b.prog = a1[5]; b.lapsDone = a1[6]; b.bestLap = a1[7];
      b.finished = !!a1[8]; b.finishTime = a1[9];
      if (i === ME) {
        // boost state is authoritative unless we just predicted an activation
        if (b.boostLockT <= 0) {
          if (!b.boostHeld && a1[10]) snd.ding();
          b.boostHeld = !!a1[10];
          b.boostT = a1[11] || 0;
        }
        return;   // my hull is predicted locally below
      }
      b.x = a0[0] + (a1[0] - a0[0]) * k;
      b.y = a0[1] + (a1[1] - a0[1]) * k;
      b.a = wrapAng(a0[2] + wrapAng(a1[2] - a0[2]) * k);
      b.vx = a1[3]; b.vy = a1[4];
      b.boostHeld = !!a1[10]; b.boostT = a1[11] || 0;
      wake(b);
    });
    raceTime = s1.rt;
    // bolts are fully host-authoritative
    const kk = S[S.length - 1].k;
    if (kk) bolts.forEach((o, i) => {
      if (!kk[i]) return;
      o.x = kk[i][0]; o.y = kk[i][1]; o.active = !!kk[i][2];
    });
  }

  // client-side prediction: run my own physics locally so controls feel instant
  if (state === 'racing' && !me.finished) {
    me.throttle = (keys['w'] || keys['ArrowUp']) ? 1 :
                  (keys['s'] || keys['ArrowDown']) ? -1 : 0;
    me.steer = ((keys['a'] || keys['ArrowLeft']) ? -1 : 0) +
               ((keys['d'] || keys['ArrowRight']) ? 1 : 0);
    if (keys[' '] && me.boostHeld && me.boostT <= 0) {
      activateBoost(me);           // predicted; host confirms via snapshots
      me.boostLockT = 0.6;
    }
  } else {
    me.throttle = 0; me.steer = 0;
  }
  stepBoat(me, dt);
  wake(me);

  // don't visibly overlap the interpolated boats (local-only nudge)
  boats.forEach((o, i) => {
    if (i === ME) return;
    const dx = me.x - o.x, dy = me.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < HULL_R * 2 && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      me.x = o.x + nx * HULL_R * 2;
      me.y = o.y + ny * HULL_R * 2;
      const vn = me.vx * nx + me.vy * ny;
      if (vn < 0) { me.vx -= vn * 1.2 * nx; me.vy -= vn * 1.2 * ny; }
    }
  });

  // reconcile: pull gently toward the host's authoritative position,
  // extrapolated by snapshot age + one-way latency so we don't chase the past
  if (S.length) {
    const s1 = S[S.length - 1], a1 = s1.b[ME];
    if (a1) {
      const age = clamp(performance.now() / 1000 - s1.rx + net.halfRtt, 0, 0.4);
      const ax = a1[0] + a1[3] * age, ay = a1[1] + a1[4] * age;
      const ex = ax - me.x, ey = ay - me.y;
      if (Math.hypot(ex, ey) > 80) {         // hard desync (e.g. big collision): snap
        me.x = ax; me.y = ay;
        me.a = a1[2]; me.vx = a1[3]; me.vy = a1[4];
      } else {
        const k2 = 1 - Math.exp(-3.5 * dt);
        me.x += ex * k2;
        me.y += ey * k2;
        me.a = wrapAng(me.a + wrapAng(a1[2] - me.a) * k2 * 0.5);
      }
    }
  }

  // stream my controls to the host (instant on change, 20Hz keepalive)
  if (!me.finished && state === 'racing') {
    const sp = keys[' '] ? 1 : 0;
    const packed = me.throttle + ':' + me.steer + ':' + sp;
    if (packed !== net.lastIn || perf - net.lastInSent > 0.05) {
      net.lastIn = packed;
      net.lastInSent = perf;
      netSend(net.conns[0], { t: 'in', th: me.throttle, st: me.steer, sp });
    }
  }
}

// ---------------------------------------------------------------- input
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  keys[k.length === 1 ? k.toLowerCase() : k] = true;
  if (k === 'Escape') {
    if (net.mode) {
      // online races never stop; Esc just toggles the leave menu
      if (state === 'racing' || state === 'finished') {
        const open = !modals.pause.classList.contains('hidden');
        preparePauseModal();
        showModal(open ? null : 'pause');
      }
    } else if (state === 'racing') {
      state = 'paused'; preparePauseModal(); showModal('pause'); snd.setEngine(0, false);
    } else if (state === 'paused') {
      state = 'racing'; showModal(null);
    }
  }
});
window.addEventListener('keyup', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key;
  keys[k.length === 1 ? k.toLowerCase() : k] = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'racing' && !net.mode) {
    state = 'paused'; preparePauseModal(); showModal('pause'); snd.setEngine(0, false);
  }
});

function preparePauseModal() {
  const online = net.mode !== null;
  document.getElementById('pause-sub').textContent = online
    ? 'The race keeps running while this menu is open.'
    : 'The boats are idling. Press Esc or resume when ready.';
  document.getElementById('btn-restart-pause').classList.toggle('hidden', online);
  document.getElementById('btn-leave-pause').classList.toggle('hidden', !online);
}

document.getElementById('btn-start').addEventListener('click', () => {
  snd.init();
  raceRoster = null; ME = 0;
  resetRace();
});
document.getElementById('btn-restart').addEventListener('click', () => {
  if (net.mode === 'host') hostStartRace();
  else if (net.mode === null) resetRace();
});
document.getElementById('btn-restart-pause').addEventListener('click', () => { if (!net.mode) resetRace(); });
document.getElementById('btn-resume').addEventListener('click', () => {
  if (state === 'paused') state = 'racing';
  showModal(null);
});
document.getElementById('btn-change-track').addEventListener('click', () => {
  state = 'menu';
  showModal('start');
});

// online buttons
document.getElementById('btn-online-host').addEventListener('click', () => { snd.init(); openOnlineModal('host'); });
document.getElementById('btn-online-join').addEventListener('click', () => { snd.init(); openOnlineModal('join'); });
document.getElementById('btn-online-cancel').addEventListener('click', () => leaveOnline(''));
document.getElementById('btn-online-leave').addEventListener('click', () => leaveOnline(''));
document.getElementById('btn-leave-pause').addEventListener('click', () => leaveOnline(''));
document.getElementById('btn-leave-finish').addEventListener('click', () => leaveOnline(''));
document.getElementById('btn-lobby-start').addEventListener('click', () => { if (net.mode === 'host') hostStartRace(); });
document.getElementById('btn-online-go').addEventListener('click', () => {
  const mode = document.getElementById('btn-online-go').dataset.mode;
  const name = cleanName(document.getElementById('online-name').value, 'Captain');
  if (typeof Peer === 'undefined') {
    ui('online-setup-status').textContent = 'Multiplayer library failed to load — check your connection and reload.';
    return;
  }
  if (mode === 'host') hostRoom(name);
  else {
    const code = (document.getElementById('online-code').value || '').trim().toUpperCase();
    if (code.length !== 4) { ui('online-setup-status').textContent = 'Enter the 4-letter room code.'; return; }
    joinRoom(code, name);
  }
});
document.getElementById('online-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-online-go').click();
});

const muteBtn = document.getElementById('btn-mute');
muteBtn.textContent = snd.muted ? 'SOUND OFF' : 'SOUND ON';
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = snd.toggleMute() ? 'SOUND OFF' : 'SOUND ON';
});

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0, 1 / 30);
  lastT = now;
  perf += dt;

  if (state === 'countdown') {
    countT -= dt;
    const n = Math.ceil(countT - 0.6);
    if (n !== lastBeep && n >= 1 && n <= 3) { snd.beep(440, .12, .3); lastBeep = n; }
    if (countT <= 0.6 && lastBeep !== 0) { snd.beep(880, .3, .35); lastBeep = 0; }
    if (countT <= 0) state = 'racing';
  }

  if ((state === 'racing' || state === 'finished') && boats.length) {
    const player = boats[ME];

    if (net.mode === 'guest') {
      guestUpdate(dt);     // predict own boat, interpolate the rest
    } else {
      raceTime += dt;
      if (!player.finished && state === 'racing') {
        player.throttle = (keys['w'] || keys['ArrowUp']) ? 1 :
                          (keys['s'] || keys['ArrowDown']) ? -1 : 0;
        player.steer = ((keys['a'] || keys['ArrowLeft']) ? -1 : 0) +
                       ((keys['d'] || keys['ArrowRight']) ? 1 : 0);
      } else {
        player.throttle = 0; player.steer = 0;
      }

      for (const b of boats) {
        if (b.remote) {
          b.throttle = b.finished ? 0 : b.netIn.th;
          b.steer = b.finished ? 0 : b.netIn.st;
          if (b.netIn.sp && !b.finished) activateBoost(b);
        } else if (b.ai && !b.finished) {
          driveAI(b, dt, player.prog);
          if (b.boostHeld && raceTime >= b.boostUseAt) activateBoost(b);
        } else if (b.ai) { b.throttle = 0; b.steer = 0; }
        stepBoat(b, dt);
        updateProgress(b);
        checkLaps(b);
        wake(b);
      }
      if (keys[' '] && !player.finished && state === 'racing') activateBoost(player);
      updateBolts(dt);

      // boat-vs-boat bumping
      for (let i = 0; i < boats.length; i++)
        for (let j = i + 1; j < boats.length; j++) {
          const A = boats[i], B = boats[j];
          const dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy);
          if (d < HULL_R * 2 && d > 0.001) {
            const nx = dx / d, ny = dy / d, push = (HULL_R * 2 - d) / 2;
            A.x -= nx * push; A.y -= ny * push;
            B.x += nx * push; B.y += ny * push;
            const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
            if (rel < 0) {
              A.vx += rel * .55 * nx; A.vy += rel * .55 * ny;
              B.vx -= rel * .55 * nx; B.vy -= rel * .55 * ny;
              spray((A.x + B.x) / 2, (A.y + B.y) / 2, 4);
            }
          }
        }

      if (net.mode === 'host') hostSendSnap();
    }

    snd.setEngine(Math.hypot(player.vx, player.vy), state === 'racing' && !player.finished);

    if (player.finished && state === 'racing') {
      state = 'finished';
      finishShownAt = perf + 1.4;
      snd.setEngine(0, false);
      snd.fanfare();
    }
    if (state === 'finished' && finishShownAt && perf >= finishShownAt) {
      finishShownAt = null;
      showResults();
    }
    updateHud();
  }

  stepParts(dt);

  // ---- render ----
  updateCamera(dt, false);
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.drawImage(bg, cam.x * BGR, cam.y * BGR, W * BGR, H * BGR, 0, 0, W, H);
  ctx.setTransform(RES, 0, 0, RES, -cam.x * RES, -cam.y * RES);
  drawWater();
  drawWhirls();
  if (state !== 'menu') drawBolts();
  drawParts();
  drawBuoys();
  if (state !== 'menu' && boats.length) for (const b of [...boats].reverse()) drawBoat(b);
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  drawMinimap();
  drawBoostHud();
  if (state === 'countdown') {
    const n = Math.ceil(countT - 0.6);
    drawCountdown(n >= 1 ? String(n) : 'GO!');
  }
}

function loop(now) {
  frame(now);
  requestAnimationFrame(loop);
}
applyResolution();
requestAnimationFrame(loop);

// dev hook: step the simulation without waiting on requestAnimationFrame
window.__lanchas = {
  step: ms => frame(lastT + ms),
  state: () => ({ state, raceTime, boats, bolts, track: T.def.id, netMode: net.mode, code: net.code, mySlot: net.mySlot, ME }),
  selectTrack
};

})();
