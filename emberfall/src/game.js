// game.js — simulation. Pure logic over SoA pools; no rendering/audio here.
// Events are queued for main.js to present (sound, toasts, UI).
import { RNG, Pool, Grid, clamp, lerp } from './core.js';

export const ARENA = 104;
const TWO_PI = Math.PI * 2;

// Upgrade definitions. Each has apply(game) and may have a level cap.
export const BOONS = [
  { id: 'damage', icon: '⚔', name: 'Keen Ember', desc: '+25% projectile damage', max: 8,
    apply: g => { g.stats.damage *= 1.25; } },
  { id: 'firerate', icon: '⌁', name: 'Rapid Heart', desc: '+18% fire rate', max: 8,
    apply: g => { g.stats.fireInterval *= 0.82; } },
  { id: 'multishot', icon: '⋔', name: 'Split Flame', desc: '+1 projectile per shot', max: 5,
    apply: g => { g.stats.projectiles += 1; } },
  { id: 'area', icon: '◎', name: 'Widen Wake', desc: '+20% pickup radius', max: 6,
    apply: g => { g.stats.pickup *= 1.2; } },
  { id: 'speed', icon: '➤', name: 'Fleet Step', desc: '+12% move speed', max: 6,
    apply: g => { g.stats.speed *= 1.12; } },
  { id: 'pierce', icon: '➶', name: 'Piercing Light', desc: 'Bullets pass through +1 foe', max: 4,
    apply: g => { g.stats.pierce += 1; } },
  { id: 'aura', icon: '❂', name: 'Cinder Aura', desc: 'Orbiting flames damage nearby foes', max: 5,
    apply: g => { g.stats.aura += 1; g.rebuildAura(); } },
  { id: 'regen', icon: '✚', name: 'Ashen Mend', desc: '+2 max HP and heal', max: 8,
    apply: g => { g.player.maxHp += 2; g.player.hp = Math.min(g.player.maxHp, g.player.hp + 3); } },
  { id: 'magnet', icon: '⊕', name: 'Ember Draw', desc: '+35% pickup radius, gems drift to you', max: 4,
    apply: g => { g.stats.pickup *= 1.35; g.stats.magnet = true; } },
  { id: 'overload', icon: '✦', name: 'Quick Fury', desc: '-18% overload cooldown', max: 5,
    apply: g => { g.stats.overloadCd *= 0.82; } },
  { id: 'crit', icon: '✧', name: 'Hot Shard', desc: '+12% critical chance', max: 6,
    apply: g => { g.stats.crit += 0.12; } },
  // Repeatable fallback so a level-up can never offer an empty hand once every
  // capped boon has been maxed — otherwise the run soft-locks.
  { id: 'vitality', icon: '♥', name: 'Undying Ember', desc: '+4 max HP, fully heal', max: Infinity,
    apply: g => { g.player.maxHp += 4; g.player.hp = g.player.maxHp; } },
  { id: 'fury', icon: '✵', name: 'Building Fury', desc: '+8% damage, +6% fire rate', max: Infinity,
    apply: g => { g.stats.damage *= 1.08; g.stats.fireInterval *= 0.94; } },
];

export const WORLD_RULES = [
  { id: 'bounce', name: 'RICOCHET: bullets bounce', apply: g => { g.rule.bounce = true; } },
  { id: 'split', name: 'SWARM: foes split when slain', apply: g => { g.rule.split = true; } },
  { id: 'haste', name: 'FRENZY: foes move 25% faster', apply: g => { g.rule.haste = true; } },
  { id: 'eclipse', name: 'ECLIPSE: half light, double embers', apply: g => { g.rule.eclipse = true; g.rule.emberMult = 2; } },
];

export class Game {
  constructor(audio) {
    this.audio = audio;
    this.rng = new RNG(1);
    this.events = [];

    // Pools. Enemy fields: pos, vel, hp, radius, type, flash, elite, spawnTier.
    this.enemies = new Pool(900, { x: Float32Array, z: Float32Array, vx: Float32Array, vz: Float32Array,
      hp: Float32Array, r: Float32Array, elite: Uint8Array, hitFlash: Float32Array, contact: Float32Array });
    this.bullets = new Pool(700, { x: Float32Array, z: Float32Array, vx: Float32Array, vz: Float32Array,
      life: Float32Array, big: Uint8Array, pierce: Uint8Array, bounces: Uint8Array, team: Uint8Array });
    // team: 0 = player bullet (hurts enemies), 1 = enemy bullet (hurts player).
    this.gems = new Pool(900, { x: Float32Array, z: Float32Array, value: Float32Array, life: Float32Array });
    this.fx = new Pool(300, { x: Float32Array, y: Float32Array, z: Float32Array, vx: Float32Array,
      vy: Float32Array, vz: Float32Array, life: Float32Array, maxLife: Float32Array });

    this.grid = new Grid(6, ARENA * 2 + 20);
    this.state = 'menu'; // menu | playing | levelup | paused | over | won
    this.player = { x: 0, z: 0, hp: 20, maxHp: 20, hitFlash: 0, invuln: 0 };
    this.boss = { active: false, x: 0, z: 0, hp: 0, maxHp: 0, hitFlash: 0, phase: 0, shootT: 0, summoned: false };
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 5;
    this.spawnTimer = 0;
    this.overloadCd = 0;
    this.overloadActive = 0; // inverted-controls duration
    this.auraAngles = [];
    this.shakeT = 0;

    this.meta = this._loadMeta();
    this.reset(1);
  }

  _loadMeta() {
    try {
      const raw = localStorage.getItem('emberfall.meta');
      if (raw) return { best: 0, souls: 0, unlocks: {}, ...JSON.parse(raw) };
    } catch {}
    return { best: 0, souls: 0, unlocks: {} };
  }
  _saveMeta() {
    try { localStorage.setItem('emberfall.meta', JSON.stringify(this.meta)); } catch {}
  }

  reset(seed) {
    this.rng = new RNG(seed);
    this.enemies.clear(); this.bullets.clear(); this.gems.clear(); this.fx.clear();
    this.state = 'playing';
    this.time = 0; this.kills = 0; this.level = 1; this.xp = 0; this.xpNeed = 5;
    this.spawnTimer = 1.5; this.overloadCd = 0; this.overloadActive = 0;
    this.player.x = 0; this.player.z = 0;
    this.player.maxHp = 20 + (this.meta.unlocks.vigor || 0) * 3;
    this.player.hp = this.player.maxHp;
    this.player.hitFlash = 0; this.player.invuln = 0;
    this.boss.active = false; this.boss.summoned = false;
    this.boss.hp = 0; this.boss.maxHp = 0; this.boss.phase = 0;

    this.stats = {
      damage: 10 + (this.meta.unlocks.edge || 0) * 2,
      fireInterval: 0.42,
      projectiles: 1,
      pickup: 4.2,
      speed: 12,
      pierce: 0,
      aura: 0,
      crit: 0.05,
      overloadCd: 9,
      magnet: false,
    };
    this.boonLevels = {};
    this.rule = { bounce: false, split: false, haste: false, eclipse: false, emberMult: 1, name: '' };
    this.auraAngles = [];
    this.rebuildAura();

    // Pick one world rule for the run.
    const r = this.rng.pick(WORLD_RULES);
    r.apply(this);
    this.rule.name = r.name;
    this.events.push({ type: 'rule', name: r.name });
  }

  rebuildAura() {
    this.auraAngles = [];
    for (let i = 0; i < this.stats.aura; i++) this.auraAngles.push((i / Math.max(1, this.stats.aura)) * TWO_PI);
    this.auraT = 0;
  }

  emit(x, y, z, n = 6, color = 'ember') {
    for (let k = 0; k < n; k++) {
      const i = this.fx.alloc(); if (i < 0) return;
      const a = this.rng.range(0, TWO_PI), sp = this.rng.range(2, 8);
      this.fx.x[i] = x; this.fx.y[i] = y; this.fx.z[i] = z;
      this.fx.vx[i] = Math.cos(a) * sp; this.fx.vz[i] = Math.sin(a) * sp;
      this.fx.vy[i] = this.rng.range(1, 6);
      const life = this.rng.range(0.25, 0.6);
      this.fx.life[i] = life; this.fx.maxLife[i] = life;
    }
  }

  // ---- Spawning ----
  _spawnEnemy(tier) {
    const i = this.enemies.alloc(); if (i < 0) return;
    const a = this.rng.range(0, TWO_PI);
    const dist = ARENA - 1;
    this.enemies.x[i] = Math.cos(a) * dist;
    this.enemies.z[i] = Math.sin(a) * dist;
    const elite = tier >= 2 && this.rng.chance(0.12);
    this.enemies.elite[i] = elite ? 1 : 0;
    const hp = (10 + tier * 2.2) * (elite ? 3.4 : 1);
    this.enemies.hp[i] = hp;
    this.enemies.r[i] = elite ? 1.5 : 0.9;
    this.enemies.hitFlash[i] = 0;
    this.enemies.contact[i] = 0;
  }

  _spawnGem(x, z, value) {
    const i = this.gems.alloc(); if (i < 0) return;
    this.gems.x[i] = x; this.gems.z[i] = z;
    this.gems.value[i] = value; this.gems.life[i] = 30;
  }

  // ---- Simulation ----
  step(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    const p = this.player;

    // Timers.
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    this.overloadCd = Math.max(0, this.overloadCd - dt);
    this.overloadActive = Math.max(0, this.overloadActive - dt);

    // Movement (controls invert during overload downside).
    const ax = input.axis();
    const dir = this.overloadActive > 0 ? -1 : 1;
    p.x = clamp(p.x + ax.x * this.stats.speed * dir * dt, -ARENA, ARENA);
    p.z = clamp(p.z + ax.z * this.stats.speed * dir * dt, -ARENA, ARENA);

    // Overload activation.
    if (input.pressed(' ') && this.overloadCd <= 0) {
      this.overloadCd = this.stats.overloadCd;
      this.overloadActive = 1.1;
      this.triggerOverload();
    }

    // Auto-fire at nearest enemy.
    this._fireTimer = (this._fireTimer || 0) - dt;
    if (this._fireTimer <= 0) {
      this._fireTimer = this.stats.fireInterval;
      this._fire();
    }

    // Aura ticks.
    if (this.stats.aura > 0) this._auraTick(dt);

    // Spawn waves.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !this.boss.active) {
      const tier = 1 + Math.floor(this.time / 60);
      const interval = Math.max(0.16, 0.95 - this.time * 0.012);
      this.spawnTimer = interval;
      const batch = 1 + Math.floor(this.time / 45);
      for (let k = 0; k < batch; k++) this._spawnEnemy(tier);
    }

    // Boss at 5 minutes.
    if (!this.boss.summoned && this.time >= 300) this._summonBoss();

    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updateGems(dt);
    this._updateFx(dt);
    if (this.boss.active) this._updateBoss(dt);

    // Music intensity follows crowd + boss.
    this.audio.setIntensity(this.boss.active ? 1 : clamp(this.enemies.n / 90, 0, 0.9));

    if (p.hp <= 0) this._gameOver(false);
  }

  _fire() {
    const p = this.player;
    // Find nearest enemy via grid.
    let best = -1, bestD = Infinity;
    this.grid.rebuild(this.enemies);
    this.grid.near(p.x, p.z, (i) => {
      const dx = this.enemies.x[i] - p.x, dz = this.enemies.z[i] - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    });
    // Boss as fallback/target.
    let tx, tz;
    if (this.boss.active) {
      const bd = Math.hypot(this.boss.x - p.x, this.boss.z - p.z);
      if (best < 0 || bd * bd < bestD) { tx = this.boss.x; tz = this.boss.z; }
    }
    if (best >= 0) { tx = this.enemies.x[best]; tz = this.enemies.z[best]; }
    if (tx === undefined) {
      // Fire upward into the dark when no target.
      tx = p.x; tz = p.z - 20;
    }
    const base = Math.atan2(tx - p.x, tz - p.z);
    const n = this.stats.projectiles;
    const crit = this.rng.chance(this.stats.crit);
    for (let k = 0; k < n; k++) {
      const i = this.bullets.alloc(); if (i < 0) break;
      const a = base + (k - (n - 1) / 2) * 0.13;
      const sp = 34;
      this.bullets.x[i] = p.x; this.bullets.z[i] = p.z;
      this.bullets.vx[i] = Math.sin(a) * sp; this.bullets.vz[i] = Math.cos(a) * sp;
      this.bullets.life[i] = 2.2;
      this.bullets.big[i] = crit ? 1 : 0;
      this.bullets.pierce[i] = this.stats.pierce;
      this.bullets.bounces[i] = this.rule.bounce ? 2 : 0;
      this.bullets.team[i] = 0;
    }
    if (n && best >= 0 || this.boss.active) this.audio.shoot();
  }

  _auraTick(dt) {
    this.auraT = (this.auraT || 0) + dt * 2.4;
    const p = this.player;
    this.grid.rebuild(this.enemies);
    for (let a = 0; a < this.auraAngles.length; a++) {
      const ang = this.auraAngles[a] + this.auraT;
      const ax = p.x + Math.cos(ang) * 3.2, az = p.z + Math.sin(ang) * 3.2;
      this.grid.near(ax, az, (i) => {
        const dx = this.enemies.x[i] - ax, dz = this.enemies.z[i] - az;
        if (dx * dx + dz * dz < 2.2) this._damageEnemy(i, this.stats.damage * 0.6 * dt * 60 * 0.35, false);
      });
    }
  }

  triggerOverload() {
    const p = this.player;
    this.audio.overload();
    this.render_shock = { x: p.x, z: p.z };
    this.events.push({ type: 'shock', x: p.x, z: p.z });
    // Kill/sweep everything within a generous radius, drop gems.
    this.grid.rebuild(this.enemies);
    const R = 26;
    this.grid.near(p.x, p.z, (i) => {
      const dx = this.enemies.x[i] - p.x, dz = this.enemies.z[i] - p.z;
      if (dx * dx + dz * dz < R * R) this._damageEnemy(i, 9999, true);
    });
    if (this.boss.active && Math.hypot(this.boss.x - p.x, this.boss.z - p.z) < R) {
      this._damageBoss(60);
    }
    this.emit(p.x, 1, p.z, 24);
    this.events.push({ type: 'toast', text: 'OVERLOAD' });
  }

  _damageEnemy(i, dmg, fromOverload) {
    if (i < 0 || i >= this.enemies.n) return;
    this.enemies.hp[i] -= dmg;
    this.enemies.hitFlash[i] = 0.08;
    if (this.enemies.hp[i] <= 0) this._killEnemy(i, fromOverload);
  }

  _killEnemy(i, fromOverload) {
    const x = this.enemies.x[i], z = this.enemies.z[i];
    const elite = this.enemies.elite[i] === 1;
    this.kills++;
    this.emit(x, 1, z, elite ? 12 : 6);
    if (!fromOverload) this.audio.kill();
    this._spawnGem(x, z, (elite ? 4 : 1) * this.rule.emberMult);
    // Swarm rule: split into two lesser foes.
    if (this.rule.split && !elite && this.enemies.hp[i] <= 0 && this.enemies.n < this.enemies.cap - 2) {
      for (let k = 0; k < 2; k++) {
        const j = this.enemies.alloc(); if (j < 0) break;
        this.enemies.x[j] = x + this.rng.range(-1, 1);
        this.enemies.z[j] = z + this.rng.range(-1, 1);
        this.enemies.vx[j] = 0; this.enemies.vz[j] = 0;
        this.enemies.hp[j] = 5 + this.time * 0.02;
        this.enemies.r[j] = 0.7; this.enemies.elite[j] = 0;
        this.enemies.hitFlash[j] = 0; this.enemies.contact[j] = 0;
      }
    }
    this.enemies.remove(i);
  }

  _updateEnemies(dt) {
    const E = this.enemies, p = this.player;
    const speedMul = this.rule.haste ? 1.25 : 1;
    for (let i = E.n - 1; i >= 0; i--) {
      E.hitFlash[i] = Math.max(0, E.hitFlash[i] - dt);
      E.contact[i] = Math.max(0, E.contact[i] - dt);
      const dx = p.x - E.x[i], dz = p.z - E.z[i];
      const d = Math.hypot(dx, dz) || 1;
      const sp = (4.2 + this.time * 0.006) * speedMul * (E.elite[i] ? 0.85 : 1);
      E.vx[i] = (dx / d) * sp; E.vz[i] = (dz / d) * sp;
      E.x[i] += E.vx[i] * dt; E.z[i] += E.vz[i] * dt;
      // Contact damage with per-enemy cooldown.
      if (d < E.r[i] + 1.0 && E.contact[i] <= 0 && p.invuln <= 0) {
        E.contact[i] = 0.8;
        this._hurtPlayer(E.elite[i] ? 2 : 1);
      }
    }
  }

  _updateBullets(dt) {
    const B = this.bullets, p = this.player;
    // One spatial rebuild per tick, not per bullet — this was O(bullets*enemies).
    this.grid.rebuild(this.enemies);
    for (let i = B.n - 1; i >= 0; i--) {
      B.x[i] += B.vx[i] * dt; B.z[i] += B.vz[i] * dt;
      B.life[i] -= dt;
      let dead = B.life[i] <= 0 || Math.abs(B.x[i]) > ARENA + 4 || Math.abs(B.z[i]) > ARENA + 4;

      if (!dead && B.team[i] === 1) {
        // Enemy bullet: only checks the player.
        const dx = p.x - B.x[i], dz = p.z - B.z[i];
        if (dx * dx + dz * dz < 1.3 ** 2) {
          if (p.invuln <= 0) this._hurtPlayer(1);
          dead = true;
        }
      } else if (!dead) {
        // Player bullet: broad-phase against enemies via the grid.
        let hit = false;
        this.grid.near(B.x[i], B.z[i], (j) => {
          if (hit || j >= this.enemies.n) return;
          const dx = this.enemies.x[j] - B.x[i], dz = this.enemies.z[j] - B.z[i];
          if (dx * dx + dz * dz < (this.enemies.r[j] + 0.5) ** 2) {
            const dmg = this.stats.damage * (B.big[i] ? 2 : 1);
            this._damageEnemy(j, dmg, false);
            this.audio.hit();
            if (B.pierce[i] > 0) B.pierce[i]--;
            else hit = true;
          }
        });
        if (this.boss.active && !hit) {
          const dx = this.boss.x - B.x[i], dz = this.boss.z - B.z[i];
          if (dx * dx + dz * dz < 3.4 ** 2) {
            this._damageBoss(this.stats.damage * (B.big[i] ? 2 : 1));
            hit = true;
          }
        }
        if (hit && B.bounces[i] > 0) {
          B.bounces[i]--;
          B.vx[i] = -B.vx[i]; B.vz[i] = -B.vz[i];
          B.life[i] = Math.min(B.life[i], 0.6);
        } else if (hit) dead = true;
      }
      if (dead) B.remove(i);
    }
  }

  _updateGems(dt) {
    const G = this.gems, p = this.player;
    for (let i = G.n - 1; i >= 0; i--) {
      G.life[i] -= dt;
      const dx = p.x - G.x[i], dz = p.z - G.z[i];
      const d = Math.hypot(dx, dz) || 1;
      const pickR = this.stats.pickup;
      if ((this.stats.magnet && d < pickR * 3) || d < pickR) {
        const pull = this.stats.magnet ? 26 : 14;
        G.x[i] += (dx / d) * pull * dt; G.z[i] += (dz / d) * pull * dt;
      }
      if (d < 1.3) {
        this._gainXp(G.value[i]);
        G.remove ? G.remove(i) : this.gems.remove(i);
      } else if (G.life[i] <= 0) this.gems.remove(i);
    }
  }

  _updateFx(dt) {
    const F = this.fx;
    for (let i = F.n - 1; i >= 0; i--) {
      F.life[i] -= dt;
      if (F.life[i] <= 0) { this.fx.remove(i); continue; }
      F.x[i] += F.vx[i] * dt; F.z[i] += F.vz[i] * dt;
      F.y[i] += F.vy[i] * dt; F.vy[i] -= 18 * dt;
      if (F.y[i] < 0) { F.y[i] = 0; F.vy[i] *= -0.3; }
    }
  }

  _hurtPlayer(dmg) {
    const p = this.player;
    p.hp -= dmg; p.hitFlash = 0.25; p.invuln = 0.5;
    this.shakeT = 0.2;
    this.audio.hurt();
    this.events.push({ type: 'hurt' });
  }

  _gainXp(amount) {
    this.xp += amount;
    this.audio.pickup();
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = Math.floor(5 + this.level * 2.6);
      this.state = 'levelup';
      this.audio.levelUp();
      this.events.push({ type: 'levelup', level: this.level });
      this._rollBoons();
      break; // present one level-up at a time
    }
  }

  _rollBoons() {
    const avail = BOONS.filter(b => (this.boonLevels[b.id] || 0) < b.max);
    // Shuffle with seeded rng, take 3.
    for (let i = avail.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [avail[i], avail[j]] = [avail[j], avail[i]];
    }
    this.offeredBoons = avail.slice(0, 3);
  }

  chooseBoon(id) {
    const b = BOONS.find(x => x.id === id);
    if (!b) return;
    b.apply(this);
    this.boonLevels[id] = (this.boonLevels[id] || 0) + 1;
    this.state = 'playing';
    this.events.push({ type: 'boon', name: b.name });
  }

  _summonBoss() {
    this.boss.summoned = true;
    this.boss.active = true;
    const a = this.rng.range(0, TWO_PI);
    this.boss.x = Math.cos(a) * 30; this.boss.z = Math.sin(a) * 30;
    this.boss.maxHp = 1400 + (this.meta.unlocks.edge || 0) * 100;
    this.boss.hp = this.boss.maxHp;
    this.boss.phase = 0; this.boss.shootT = 1;
    this.audio.boss();
    this.events.push({ type: 'toast', text: 'THE EMBER CROWN AWAKENS' });
  }

  _damageBoss(dmg) {
    this.boss.hp -= dmg;
    this.boss.hitFlash = 0.08;
    if (this.boss.hp <= 0) {
      this.boss.active = false;
      this.emit(this.boss.x, 3, this.boss.z, 30);
      this._gameOver(true);
    }
  }

  _updateBoss(dt) {
    const b = this.boss, p = this.player;
    b.hitFlash = Math.max(0, b.hitFlash - dt);
    const dx = p.x - b.x, dz = p.z - b.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = 3.4 + b.phase * 1.2;
    b.x += (dx / d) * sp * dt; b.z += (dz / d) * sp * dt;
    const hpFrac = b.hp / b.maxHp;
    if (hpFrac < 0.66) b.phase = 1;
    if (hpFrac < 0.33) b.phase = 2;

    // Radial bullet patterns. Enemy bullets share the pool but are tagged
    // team=1 and are resolved against the player in _updateBullets().
    b.shootT -= dt;
    if (b.shootT <= 0) {
      b.shootT = Math.max(0.5, 1.7 - b.phase * 0.45);
      const spokes = 8 + b.phase * 4;
      const off = this.rng.range(0, TWO_PI);
      for (let k = 0; k < spokes; k++) {
        const i = this.bullets.alloc(); if (i < 0) break;
        const a = off + (k / spokes) * TWO_PI;
        const sp2 = 11 + b.phase * 2;
        this.bullets.x[i] = b.x; this.bullets.z[i] = b.z;
        this.bullets.vx[i] = Math.cos(a) * sp2; this.bullets.vz[i] = Math.sin(a) * sp2;
        this.bullets.life[i] = 3; this.bullets.big[i] = 0;
        this.bullets.pierce[i] = 0; this.bullets.bounces[i] = 0;
        this.bullets.team[i] = 1;
      }
      this.audio.boss();
    }
    if (d < 3.4 + 1 && p.invuln <= 0) this._hurtPlayer(2);
  }

  _gameOver(won) {
    this.state = won ? 'won' : 'over';
    const survived = Math.floor(this.time);
    const isBest = survived > this.meta.best;
    if (isBest) this.meta.best = survived;
    this.meta.souls += Math.floor(this.kills / 10);
    // Meta unlocks by milestones.
    let unlocked = '';
    if (this.meta.best >= 120 && !this.meta.unlocks.vigor) { this.meta.unlocks.vigor = 1; unlocked = 'VIGOR: +3 max HP'; }
    else if (this.meta.best >= 240 && !this.meta.unlocks.edge) { this.meta.unlocks.edge = 1; unlocked = 'KEEN EDGE: +2 damage'; }
    this._saveMeta();
    if (won) this.audio.levelUp(); else this.audio.death();
    this.events.push({ type: 'gameover', won, survived, kills: this.kills, level: this.level, best: this.meta.best, isBest, unlocked });
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  quitToMenu() { this.state = 'menu'; }

  drainEvents() { const e = this.events; this.events = []; return e; }
}
