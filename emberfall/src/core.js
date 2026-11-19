// core.js — deterministic simulation core.
// Entity storage is Structure-of-Arrays (SoA): hot fields are contiguous typed
// arrays, dead slots are removed by swap-remove with O(1) cost and no holes.
// A fixed timestep + seeded PRNG make a run reproducible from its seed.

export class RNG {
  // Mulberry32: small, fast, good enough for gameplay determinism.
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// SoA pool of gameplay entities. `alive` count is the active prefix; removal
// swaps the last live entity into the removed slot. Callers must not hold indices
// across a remove() within the same iteration — iterate backwards.
export class Pool {
  constructor(capacity, fields) {
    this.cap = capacity;
    this.n = 0;
    for (const [name, Type] of Object.entries(fields)) {
      this[name] = new Type(capacity);
    }
  }
  alloc() {
    if (this.n >= this.cap) return -1;
    return this.n++;
  }
  remove(i) {
    const last = --this.n;
    if (i !== last) {
      for (const key of Object.keys(this)) {
        if (key === 'cap' || key === 'n' || !(this[key] instanceof Object)) continue;
        this[key][i] = this[key][last];
      }
    }
  }
  clear() { this.n = 0; }
}

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;

// Uniform grid spatial hash for neighbour queries (collision / target lookup).
// Cell size ~= largest query radius. Rebuilt each tick from live positions.
export class Grid {
  constructor(cell, worldSize) {
    this.cell = cell;
    this.cols = Math.ceil(worldSize / cell);
    this.buckets = new Array(this.cols * this.cols);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }
  _idx(x, z) {
    const cx = clamp(Math.floor(x / this.cell) + (this.cols >> 1), 0, this.cols - 1);
    const cz = clamp(Math.floor(z / this.cell) + (this.cols >> 1), 0, this.cols - 1);
    return cz * this.cols + cx;
  }
  rebuild(pool) {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
    for (let i = 0; i < pool.n; i++) {
      this.buckets[this._idx(pool.x[i], pool.z[i])].push(i);
    }
  }
  // Visit indices within one cell of (x,z). Cheap broad-phase.
  near(x, z, fn) {
    const cx = clamp(Math.floor(x / this.cell) + (this.cols >> 1), 0, this.cols - 1);
    const cz = clamp(Math.floor(z / this.cell) + (this.cols >> 1), 0, this.cols - 1);
    for (let dz = -1; dz <= 1; dz++) {
      const rz = cz + dz; if (rz < 0 || rz >= this.cols) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const rx = cx + dx; if (rx < 0 || rx >= this.cols) continue;
        const b = this.buckets[rz * this.cols + rx];
        for (let k = 0; k < b.length; k++) fn(b[k]);
      }
    }
  }
}

// Fixed-timestep driver. Accumulates wall time and steps simulation in equal
// slices so behaviour is frame-rate independent and deterministic.
export class FixedStep {
  constructor(dt = 1 / 60, maxSteps = 5) {
    this.dt = dt; this.maxSteps = maxSteps; this.acc = 0; this.last = 0;
  }
  advance(now, stepFn) {
    if (!this.last) this.last = now;
    let elapsed = (now - this.last) / 1000;
    this.last = now;
    if (elapsed > 0.25) elapsed = 0.25; // tab was backgrounded
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      stepFn(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0; // spiral-of-death guard
    return this.acc / this.dt; // interpolation alpha
  }
  reset(now = 0) { this.last = now; this.acc = 0; }
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressedThisFrame.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }
  down(k) { return this.keys.has(k); }
  pressed(k) { return this.pressedThisFrame.has(k); }
  axis() {
    let x = 0, z = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }
  endFrame() { this.pressedThisFrame.clear(); }
}
