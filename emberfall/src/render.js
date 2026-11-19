// render.js — three.js presentation layer. Instanced meshes keep draw calls low
// at high entity counts; an EffectComposer adds bloom for the neon look.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const COLORS = {
  void: 0x0a0710,
  player: 0xffb24d,
  playerCore: 0xfff3d0,
  enemy: 0x7a3cff,
  enemyElite: 0xff3d7a,
  boss: 0xff2a2a,
  bullet: 0x63e6ff,
  gem: 0xff8a3d,
  ground: 0x140d20,
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(COLORS.void, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(COLORS.void, 0.018);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.camera.position.set(0, 46, 30);
    this.camera.lookAt(0, 0, 0);

    // Lighting: dim ambient + player-follow point light for the neon pool.
    this.scene.add(new THREE.AmbientLight(0x4a3a6a, 1.4));
    this.playerLight = new THREE.PointLight(0xff7a3d, 40, 34, 2);
    this.playerLight.position.set(0, 6, 0);
    this.scene.add(this.playerLight);

    this._buildGround();
    this._buildPools();

    // Post-processing bloom.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.6, 0.15);
    this.composer.addPass(this.bloom);

    this.dummy = new THREE.Object3D();
    this._t = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _buildGround() {
    // Arena floor: a dark disc with a faint grid via a shader-free approach —
    // concentric rings + radial lines made from LineSegments.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(120, 64),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    this.scene.add(floor);

    const pts = [];
    for (let r = 10; r <= 110; r += 10) {
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        pts.push(Math.cos(a + 0.12) * r, 0, Math.sin(a + 0.12) * r);
      }
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      pts.push(0, 0, 0);
      pts.push(Math.cos(a) * 110, 0, Math.sin(a) * 110);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a2050, transparent: true, opacity: 0.35 }));
    this.scene.add(grid);
    this.grid = grid;

    // Outer ember ring boundary marker.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(109, 111, 96),
      new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);
  }

  _instanced(geometry, material, cap) {
    const m = new THREE.InstancedMesh(geometry, material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  _buildPools() {
    const CAP = this.CAP = { enemy: 900, bullet: 700, gem: 900, fx: 300 };
    const glowMat = (color, emissive) => new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.1,
    });

    // Enemy: faceted crystal. Elite/boss recolour via setColorAt.
    this.mEnemies = this._instanced(
      new THREE.IcosahedronGeometry(0.9, 0),
      glowMat(0xffffff, 0xffffff), CAP.enemy
    );
    // Bullets: elongated shards.
    this.mBullets = this._instanced(
      new THREE.TetrahedronGeometry(0.42, 0),
      glowMat(COLORS.bullet, COLORS.bullet), CAP.bullet
    );
    // Gems: octahedra.
    this.mGems = this._instanced(
      new THREE.OctahedronGeometry(0.32, 0),
      glowMat(COLORS.gem, COLORS.gem), CAP.gem
    );
    // FX sparks: tiny cubes.
    this.mFx = this._instanced(
      new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 }), CAP.fx
    );

    // Player: a glowing figure made of a cone (cloak) + core orb.
    this.playerGroup = new THREE.Group();
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 2.1, 6),
      glowMat(COLORS.player, COLORS.player)
    );
    cloak.position.y = 1.05;
    this.playerGroup.add(cloak);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.playerCore })
    );
    core.position.y = 1.85;
    this.playerGroup.add(core);
    this.playerCore = core;
    this.scene.add(this.playerGroup);

    // Boss: separate larger mesh.
    this.bossMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(3.2, 0),
      glowMat(COLORS.boss, COLORS.boss)
    );
    this.bossMesh.visible = false;
    this.scene.add(this.bossMesh);

    // Overload shockwave ring.
    this.shockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.2, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.shockRing.rotation.x = -Math.PI / 2;
    this.shockRing.position.y = 0.3;
    this.scene.add(this.shockRing);
    this.shockT = 0;
  }

  triggerShock(x, z) {
    this.shockRing.position.set(x, 0.3, z);
    this.shockT = 1;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    // Keep the arena framed on tall/narrow screens.
    this.camera.position.set(0, 46, 30);
    this.camera.updateProjectionMatrix();
  }

  _place(mesh, i, x, y, z, scale, rotY = 0) {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(0, rotY, 0);
    d.scale.setScalar(scale);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }

  render(game, alpha, dtReal) {
    this._t += dtReal;
    const p = game.player;

    // Player + light.
    this.playerGroup.position.set(p.x, 0, p.z);
    this.playerCore.scale.setScalar(1 + Math.sin(this._t * 6) * 0.08);
    this.playerLight.position.set(p.x, 6, p.z);
    this.playerLight.intensity = p.hitFlash > 0 ? 80 : 40;
    // Camera gently follows player, clamped so the arena edge stays visible.
    const camX = p.x * 0.18, camZ = 30 + p.z * 0.18;
    this.camera.position.x += (camX - this.camera.position.x) * 0.06;
    this.camera.position.z += (camZ - this.camera.position.z) * 0.06;
    this.camera.lookAt(p.x * 0.35, 0, p.z * 0.35);

    // Enemies (SoA pool).
    const E = game.enemies;
    this.mEnemies.count = E.n;
    const col = new THREE.Color();
    for (let i = 0; i < E.n; i++) {
      const elite = E.elite[i] === 1;
      const bob = Math.sin(this._t * 3 + i * 0.7) * 0.12;
      this._place(this.mEnemies, i, E.x[i], (elite ? 1.4 : 0.9) + bob, E.z[i], elite ? 1.7 : 1, this._t + i);
      col.setHex(elite ? COLORS.enemyElite : COLORS.enemy);
      if (E.hitFlash[i] > 0) col.setHex(0xffffff);
      this.mEnemies.setColorAt(i, col);
    }
    if (E.n) { this.mEnemies.instanceMatrix.needsUpdate = true; if (this.mEnemies.instanceColor) this.mEnemies.instanceColor.needsUpdate = true; }

    // Bullets. Player = frost cyan, enemy = ember red (readable at a glance).
    const B = game.bullets;
    this.mBullets.count = B.n;
    const bcol = new THREE.Color();
    for (let i = 0; i < B.n; i++) {
      this._place(this.mBullets, i, B.x[i], 0.7, B.z[i], B.big[i] ? 1.8 : (B.team[i] ? 1.4 : 1),
        Math.atan2(B.vx[i], B.vz[i]));
      bcol.setHex(B.team[i] ? COLORS.boss : (B.big[i] ? 0xffffff : COLORS.bullet));
      this.mBullets.setColorAt(i, bcol);
    }
    if (B.n) {
      this.mBullets.instanceMatrix.needsUpdate = true;
      if (this.mBullets.instanceColor) this.mBullets.instanceColor.needsUpdate = true;
    }

    // Gems.
    const G = game.gems;
    this.mGems.count = G.n;
    for (let i = 0; i < G.n; i++) {
      const spin = this._t * 2 + i;
      this._place(this.mGems, i, G.x[i], 0.45 + Math.sin(spin) * 0.12, G.z[i], 1, spin);
    }
    if (G.n) this.mGems.instanceMatrix.needsUpdate = true;

    // FX sparks.
    const F = game.fx;
    this.mFx.count = F.n;
    for (let i = 0; i < F.n; i++) {
      const k = F.life[i] / F.maxLife[i];
      this._place(this.mFx, i, F.x[i], F.y[i], F.z[i], Math.max(0.05, k * 1.2), this._t + i);
    }
    if (F.n) this.mFx.instanceMatrix.needsUpdate = true;

    // Boss.
    const boss = game.boss;
    if (boss.active) {
      this.bossMesh.visible = true;
      this.bossMesh.position.set(boss.x, 3.4 + Math.sin(this._t * 2) * 0.3, boss.z);
      this.bossMesh.rotation.y += dtReal * 0.6;
      this.bossMesh.rotation.x += dtReal * 0.25;
      const s = 1 + Math.sin(this._t * 4) * 0.04;
      this.bossMesh.scale.setScalar(boss.hitFlash > 0 ? s * 1.12 : s);
    } else this.bossMesh.visible = false;

    // Shockwave.
    if (this.shockT > 0) {
      this.shockT = Math.max(0, this.shockT - dtReal * 1.6);
      const k = 1 - this.shockT;
      this.shockRing.scale.setScalar(1 + k * 60);
      this.shockRing.material.opacity = this.shockT * 0.7;
    } else this.shockRing.material.opacity = 0;

    this.grid.rotation.y += dtReal * 0.02;
    this.composer.render();
  }
}
