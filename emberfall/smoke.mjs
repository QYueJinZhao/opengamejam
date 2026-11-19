// Headless logic smoke test — runs the pure simulation without a browser.
import { Game } from './src/game.js';

const noop = () => {};
const audio = new Proxy({}, { get: () => noop });
const input = {
  axis: () => ({ x: Math.sin(Date.now() / 500), z: Math.cos(Date.now() / 700) }),
  pressed: () => false,
};

const g = new Game(audio);
g.reset(12345);

let steps = 0, levelups = 0, maxEnemies = 0, bossSeen = false, overSeen = false;
const DT = 1 / 60;
const MAX = 60 * 60 * 7; // 7 simulated minutes

try {
  for (let i = 0; i < MAX; i++) {
    if (g.state === 'playing') {
      g.step(DT, input);
      steps++;
      maxEnemies = Math.max(maxEnemies, g.enemies.n);
      if (g.boss.active) bossSeen = true;
    } else if (g.state === 'levelup') {
      levelups++;
      const pick = g.offeredBoons[0];
      if (!pick) throw new Error('levelup with no boons offered');
      g.chooseBoon(pick.id);
    } else if (g.state === 'over' || g.state === 'won') {
      overSeen = true;
      break;
    }
  }
} catch (e) {
  console.error('SIM CRASH at step', steps, e);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  simulatedSeconds: +(steps * DT).toFixed(1),
  levelups,
  maxEnemies,
  bossSeen,
  overSeen,
  finalState: g.state,
  kills: g.kills,
  level: g.level,
  rule: g.rule.name,
  poolHealth: {
    enemies: g.enemies.n <= g.enemies.cap,
    bullets: g.bullets.n <= g.bullets.cap,
    gems: g.gems.n <= g.gems.cap,
    fx: g.fx.n <= g.fx.cap,
  },
}, null, 2));
