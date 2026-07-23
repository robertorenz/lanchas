/* LANCHAS — Harbor Sprint
   Super Sprint-style top-down speedboat racing. Whole circuit on one screen,
   drifty water physics, buoys, rocks, a whirlpool, 3 AI boats, 3 laps. */

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

// ---------------------------------------------------------------- track
// Closed Catmull-Rom loop, clockwise. The (795,470)->(625,430)->(520,555)
// kink is the S-bend that makes the bottom half of the circuit technical.
const CTRL = [
  [520, 85], [730, 115], [880, 215], [905, 380], [795, 470], [625, 430],
  [520, 555], [355, 540], [200, 470], [125, 330], [175, 175], [350, 105]
];
const HALF = 42;          // half-width of the water channel
const HULL_R = 9;         // boat collision radius
const TOTAL_LAPS = 3;

const track = (() => {
  const pts = [];
  const n = CTRL.length, SEG = 50;
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i - 1 + n) % n], p1 = CTRL[i],
          p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n];
    for (let s = 0; s < SEG; s++) {
      const u = s / SEG, u2 = u * u, u3 = u2 * u;
      pts.push({
        x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
      });
    }
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    pts[i].tx = dx / d; pts[i].ty = dy / d;   // tangent (race direction)
    pts[i].nx = -dy / d; pts[i].ny = dx / d;  // normal (left of travel)
  }
  return pts;
})();
const N = track.length;

function nearestIdx(x, y, hint) {
  let best = 0, bd = Infinity;
  if (hint == null) {
    for (let i = 0; i < N; i++) {
      const d = dist2(x, y, track[i].x, track[i].y);
      if (d < bd) { bd = d; best = i; }
    }
  } else {
    for (let k = -45; k <= 45; k++) {
      const i = (hint + k + N * 2) % N;
      const d = dist2(x, y, track[i].x, track[i].y);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

const startIdx = nearestIdx(455, 550, null); // on the bottom straight

// ---------------------------------------------------------------- hazards
const atT = t => (startIdx + Math.round(t * N)) % N;
function trackPoint(t, off) {
  const p = track[atT(t)];
  return { x: p.x + p.nx * off, y: p.y + p.ny * off };
}
const buoys = [
  { t: .08, off:  18 }, { t: .20, off: -16 }, { t: .38, off:  15 },
  { t: .50, off: -18 }, { t: .72, off:  16 }, { t: .86, off: -14 }
].map((b, i) => ({ ...trackPoint(b.t, b.off), r: 7, phase: i * 1.7 }));

const rocks = [
  { t: .30, off:  24, r: 12 }, { t: .45, off: -22, r: 10 },
  { t: .78, off:  21, r: 13 }, { t: .93, off: -24, r: 11 }
].map(r => ({ ...trackPoint(r.t, r.off), r: r.r }));

const whirl = { ...trackPoint(.615, 0), r: 34 };

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
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try { localStorage.setItem('lanchas-muted', this.muted ? '1' : '0'); } catch (e) {}
    return this.muted;
  }
};
try { snd.muted = localStorage.getItem('lanchas-muted') === '1'; } catch (e) {}

// ---------------------------------------------------------------- boats
const ROSTER = [
  { name: 'You',      color: '#E2523E', trim: '#EDF4F7', ai: false },
  { name: 'Corsario', color: '#2E9E9B', trim: '#0B2434', ai: true, skill: .955 },
  { name: 'Pelícano', color: '#F5B841', trim: '#0B2434', ai: true, skill: .925 },
  { name: 'Tormenta', color: '#ECEFF1', trim: '#E2523E', ai: true, skill: .895 }
];

let boats = [];

function spawnBoats() {
  boats = ROSTER.map((r, i) => {
    const row = Math.floor(i / 2), lane = (i % 2 === 0 ? 1 : -1) * 14;
    const idx = (startIdx - 12 - row * 11 + N) % N;
    const p = track[idx];
    return {
      ...r,
      x: p.x + p.nx * lane, y: p.y + p.ny * lane,
      a: Math.atan2(p.ty, p.tx),
      vx: 0, vy: 0, steer: 0, throttle: 0,
      idx, prog: -12 - row * 11,
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
  const tp = track[(b.idx + Math.round(look)) % N];
  const wobble = Math.sin(perf * .7 + b.wob) * 6; // slight lane variation
  const tx = tp.x + tp.nx * wobble, ty = tp.y + tp.ny * wobble;
  const diff = wrapAng(Math.atan2(ty - b.y, tx - b.x) - b.a);
  b.steer = clamp(diff * 3, -1, 1);
  // rubber-band: trail the player a little harder, ease off when ahead
  const gap = clamp((playerProg - b.prog) / N, -0.5, 0.5);
  const eff = clamp(b.skill + gap * 0.16, 0.8, 1.02);
  b.throttle = (Math.abs(diff) > 1.1 ? 0.55 : 1) * eff;
}

function stepBoat(b, dt, spray) {
  // steering (needs way to grip: turn authority scales with speed)
  const spd = Math.hypot(b.vx, b.vy);
  b.a = wrapAng(b.a + TURN * b.steer * clamp(spd / 90, 0, 1) * dt);

  // thrust along heading
  const th = b.throttle;
  if (th > 0) { b.vx += Math.cos(b.a) * ACCEL * th * dt; b.vy += Math.sin(b.a) * ACCEL * th * dt; }
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
  const p = track[b.idx];
  const dx = b.x - p.x, dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const lim = HALF - HULL_R + 2;
  if (d > lim) {
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * lim; b.y = p.y + ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) { b.vx -= vn * 1.5 * nx; b.vy -= vn * 1.5 * ny; }
    b.vx *= 0.97; b.vy *= 0.97;
    if (b.grindCool <= 0 && spd > 60) {
      spray(b.x + nx * 6, b.y + ny * 6, 5, '#EDF4F7');
      if (!b.ai) snd.thud();
      b.grindCool = .35;
    }
  }
  b.grindCool -= dt;
  b.bumpCool -= dt;

  // hazards
  for (const list of [buoys, rocks]) {
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
          spray(b.x, b.y, 8, '#EDF4F7');
          if (!b.ai) snd.thud();
          b.bumpCool = .3;
        }
      }
    }
  }

  // whirlpool: drags you sideways and bleeds speed
  {
    const wx = b.x - whirl.x, wy = b.y - whirl.y;
    const wd = Math.hypot(wx, wy);
    if (wd < whirl.r + 14) {
      const k = 1 - wd / (whirl.r + 14);
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
  if (d > N / 2) d -= N;
  if (d < -N / 2) d += N;
  b.prog += d;
  b.prevIdx = b.idx;
}

// ---------------------------------------------------------------- particles
const parts = [];
function spray(x, y, n, color) {
  for (let i = 0; i < n && parts.length < 420; i++) {
    const a = Math.random() * TAU, s = 20 + Math.random() * 70;
    parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0, max: .35 + Math.random() * .3,
      r: 1.5 + Math.random() * 2.5, color
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
    r: 2 + Math.random() * 2, color: 'wake'
  });
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

// ---------------------------------------------------------------- static scene
const bg = document.createElement('canvas');
bg.width = W; bg.height = H;
function paintScene() {
  const g = bg.getContext('2d');
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const rnd = mulberry32(20260722);

  // land
  g.fillStyle = '#DCC894';
  g.fillRect(0, 0, W, H);

  // dune / grass mottling (kept off the water)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H;
    const near = track[nearestIdx(x, y, null)];
    if (dist2(x, y, near.x, near.y) < (HALF + 26) ** 2) continue;
    g.fillStyle = rnd() < .5 ? 'rgba(158,166,110,.35)' : 'rgba(201,181,126,.5)';
    g.beginPath();
    g.ellipse(x, y, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * TAU, 0, TAU);
    g.fill();
  }

  const path = new Path2D();
  path.moveTo(track[0].x, track[0].y);
  for (let i = 1; i < N; i++) path.lineTo(track[i].x, track[i].y);
  path.closePath();
  g.lineJoin = g.lineCap = 'round';

  // wet-sand shoreline, then water, then shallower center
  g.strokeStyle = '#C3AA72'; g.lineWidth = (HALF + 9) * 2; g.stroke(path);
  g.strokeStyle = '#14567F'; g.lineWidth = HALF * 2;        g.stroke(path);
  g.strokeStyle = '#1F7FB5'; g.lineWidth = HALF * 2 - 16;   g.stroke(path);
  g.strokeStyle = '#2B8FC4'; g.lineWidth = HALF * 2 - 40;   g.stroke(path);

  // start / finish checkers across the channel
  const sp = track[startIdx];
  g.save();
  g.translate(sp.x, sp.y);
  g.rotate(Math.atan2(sp.ny, sp.nx));
  const sq = 7;
  for (let r = 0; r < 2; r++)
    for (let c = -6; c < 6; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? '#EDF4F7' : '#12222E';
      g.fillRect(c * sq, -sq + r * sq, sq, sq);
    }
  g.restore();

  // rocks (static hazards, painted once)
  for (const r of rocks) {
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

  // a small dock on the infield near the start
  const dp = trackPoint(0.02, -HALF - 4);
  g.save();
  g.translate(dp.x, dp.y);
  g.rotate(Math.atan2(track[atT(0.02)].ty, track[atT(0.02)].tx));
  g.fillStyle = '#8A6B48'; g.fillRect(-26, -6, 52, 16);
  g.fillStyle = '#A07E56';
  for (let i = -24; i < 26; i += 8) g.fillRect(i, -6, 6, 16);
  g.restore();

  // palms on land
  for (const [px, py] of [[70, 90], [935, 90], [60, 580], [945, 590], [510, 300]]) {
    const near = track[nearestIdx(px, py, null)];
    if (dist2(px, py, near.x, near.y) < (HALF + 30) ** 2) continue;
    g.fillStyle = 'rgba(9,32,46,.25)';
    g.beginPath(); g.ellipse(px + 4, py + 5, 14, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = '#8A6B48'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(px, py + 4); g.lineTo(px + 3, py - 10); g.stroke();
    g.fillStyle = '#4E7C4A';
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      g.beginPath();
      g.ellipse(px + 3 + Math.cos(a) * 9, py - 12 + Math.sin(a) * 5, 9, 3.5, a, 0, TAU);
      g.fill();
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
  bg.width = cvs.width;
  bg.height = cvs.height;
  paintScene();
}
window.addEventListener('resize', () => applyResolution());

const centerPath = new Path2D();
centerPath.moveTo(track[0].x, track[0].y);
for (let i = 1; i < N; i++) centerPath.lineTo(track[i].x, track[i].y);
centerPath.closePath();

// ---------------------------------------------------------------- rendering
let perf = 0; // animation clock (runs even in menus)

function drawWater() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,196,226,.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 110]);
  ctx.lineDashOffset = -perf * 26;
  ctx.stroke(centerPath);
  ctx.strokeStyle = 'rgba(120,196,226,.22)';
  ctx.setLineDash([10, 150]);
  ctx.lineDashOffset = -perf * 38 - 60;
  ctx.lineWidth = 2;
  ctx.stroke(centerPath);
  ctx.restore();
}

function drawWhirl() {
  ctx.save();
  ctx.translate(whirl.x, whirl.y);
  ctx.rotate(perf * 1.8);
  ctx.strokeStyle = 'rgba(230,244,250,.5)';
  ctx.lineWidth = 2.5;
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let s = 0; s <= 22; s++) {
      const a = arm * TAU / 3 + s * .32;
      const r = 3 + s * (whirl.r - 4) / 22;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10,40,60,.55)';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBuoys() {
  for (const b of buoys) {
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
  // shadow
  ctx.fillStyle = 'rgba(9,32,46,.3)';
  ctx.beginPath(); ctx.ellipse(1, 3, 13, 6, 0, 0, TAU); ctx.fill();
  // hull
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.quadraticCurveTo(8, -7, -9, -6);
  ctx.quadraticCurveTo(-13, -5, -13, 0);
  ctx.quadraticCurveTo(-13, 5, -9, 6);
  ctx.quadraticCurveTo(8, 7, 15, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(9,32,46,.4)'; ctx.lineWidth = 1; ctx.stroke();
  // deck stripe + cockpit
  ctx.fillStyle = b.trim;
  ctx.fillRect(-11, -1.4, 18, 2.8);
  ctx.fillStyle = '#12222E';
  ctx.beginPath(); ctx.ellipse(-2, 0, 4, 3, 0, 0, TAU); ctx.fill();
  // motor
  ctx.fillStyle = '#22303A';
  ctx.fillRect(-15, -2.5, 4, 5);
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    const k = 1 - p.life / p.max;
    if (p.color === 'wake') {
      ctx.fillStyle = `rgba(230,244,250,${(.5 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - k) * 6, 0, TAU); ctx.fill();
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
  for (const b of boats) b.prevIdx = b.idx;
  parts.length = 0;
  raceTime = 0; lastBeep = -1; finishShownAt = null;
  countT = 3.6;
  state = 'countdown';
  showModal(null);
}

function playerRank() {
  const sorted = [...boats].sort((a, b2) => b2.prog - a.prog);
  return sorted.indexOf(boats[0]) + 1;
}

function updateHud() {
  const p = boats[0];
  const lap = clamp(p.lapsDone + 1, 1, TOTAL_LAPS);
  hud.lap.textContent = p.finished ? `${TOTAL_LAPS}/${TOTAL_LAPS}` : `${lap}/${TOTAL_LAPS}`;
  hud.pos.textContent = ORD(playerRank());
  hud.time.textContent = fmtTime(raceTime);
  hud.best.textContent = p.bestLap == null ? '—' : fmtTime(p.bestLap);
}

function checkLaps(b) {
  const done = Math.floor(b.prog / N);
  if (done > b.lapsDone) {
    b.lapsDone = done;
    const lapTime = raceTime - b.lapStamp;
    b.lapStamp = raceTime;
    if (done > 0 && (b.bestLap == null || lapTime < b.bestLap)) b.bestLap = lapTime;
    if (!b.ai && done < TOTAL_LAPS) snd.beep(880, .15, .25);
    if (done >= TOTAL_LAPS && !b.finished) {
      b.finished = true;
      b.finishTime = raceTime;
    }
  }
}

function showResults() {
  const p = boats[0];
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
    place === 1 ? 'Fastest lancha in the harbor today.'
                : 'The podium slips away — take another run at it.';
  const tbody = modals.finish.querySelector('tbody');
  tbody.innerHTML = '';
  rank.forEach((b, i) => {
    const tr = document.createElement('tr');
    if (!b.ai) tr.className = 'you';
    const res = b.finished ? fmtTime(b.finishTime)
                           : `Lap ${clamp(b.lapsDone + 1, 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;
    tr.innerHTML = `<td>${ORD(i + 1)}</td>` +
      `<td><span class="swatch" style="background:${b.color}"></span> ${b.name}</td>` +
      `<td>${res}</td>`;
    tbody.appendChild(tr);
  });
  showModal('finish');
}

// ---------------------------------------------------------------- input
const keys = {};
window.addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  keys[k.length === 1 ? k.toLowerCase() : k] = true;
  if (k === 'Escape') {
    if (state === 'racing') { state = 'paused'; showModal('pause'); snd.setEngine(0, false); }
    else if (state === 'paused') { state = 'racing'; showModal(null); }
  }
});
window.addEventListener('keyup', e => {
  const k = e.key;
  keys[k.length === 1 ? k.toLowerCase() : k] = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'racing') {
    state = 'paused'; showModal('pause'); snd.setEngine(0, false);
  }
});

document.getElementById('btn-start').addEventListener('click', () => { snd.init(); resetRace(); });
document.getElementById('btn-restart').addEventListener('click', resetRace);
document.getElementById('btn-restart-pause').addEventListener('click', resetRace);
document.getElementById('btn-resume').addEventListener('click', () => { state = 'racing'; showModal(null); });

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

  if (state === 'racing' || state === 'finished') {
    raceTime += dt;
    const player = boats[0];

    // player controls (cut when finished — the boat glides in)
    if (!player.finished && state === 'racing') {
      player.throttle = (keys['w'] || keys['ArrowUp']) ? 1 :
                        (keys['s'] || keys['ArrowDown']) ? -1 : 0;
      player.steer = ((keys['a'] || keys['ArrowLeft']) ? -1 : 0) +
                     ((keys['d'] || keys['ArrowRight']) ? 1 : 0);
    } else {
      player.throttle = 0; player.steer = 0;
    }

    for (const b of boats) {
      if (b.ai && !b.finished) driveAI(b, dt, player.prog);
      else if (b.ai) { b.throttle = 0; b.steer = 0; }
      stepBoat(b, dt, spray);
      updateProgress(b);
      checkLaps(b);
      wake(b);
    }

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
            spray((A.x + B.x) / 2, (A.y + B.y) / 2, 4, '#EDF4F7');
          }
        }
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
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.drawImage(bg, 0, 0, W, H);
  drawWater();
  drawWhirl();
  drawParts();
  drawBuoys();
  if (state !== 'menu') for (const b of [...boats].reverse()) drawBoat(b);
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
  state: () => ({ state, raceTime, boats })
};

})();
