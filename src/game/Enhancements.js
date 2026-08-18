import * as THREE from 'three';
import { Game } from './Game.js';
import { Character } from './Character.js';
import { Enemy } from './Enemy.js';
import { FXSystem } from './FX.js';

const V = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const params = () => new URLSearchParams(location.search);
const isCapture = () => params().has('capture');
const slashGeometry = new THREE.TorusGeometry(1.05, .055, 7, 42, Math.PI * .98);
const slashGlowGeometry = new THREE.TorusGeometry(1.06, .14, 7, 42, Math.PI * .98);
const slashEdgeGeometry = new THREE.TorusGeometry(1.03, .026, 6, 42, Math.PI * .98);

// The showcase can explicitly exercise the full desktop rendering path even on a small CI runner.
const detectQuality = Game.prototype._detectQuality;
Game.prototype._detectQuality = function () {
  const forced = params().get('quality');
  if (forced === 'high' || forced === 'low') return forced;
  return detectQuality.call(this);
};

const makeRenderer = Game.prototype._makeRenderer;
Game.prototype._makeRenderer = function (canvas) {
  const renderer = makeRenderer.call(this, canvas);
  if (isCapture()) renderer.setPixelRatio(1);
  renderer.toneMappingExposure = .96;
  return renderer;
};

const resize = Game.prototype._resize;
Game.prototype._resize = function () {
  resize.call(this);
  if (isCapture()) {
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer?.setPixelRatio?.(1);
    this.composer?.setSize(innerWidth, innerHeight);
  }
};

// Soft target magnetism: attacks still respect facing/cones, but close combat feels deliberate rather than slippery.
Game.prototype._faceNearestTarget = function (maxRange = 5, minDot = -.15) {
  const origin = this.player.position;
  const current = new V(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
  let best = null;
  let bestScore = Infinity;
  for (const enemy of this.enemies) {
    if (enemy.dead) continue;
    const to = enemy.position.clone().sub(origin); to.y = 0;
    const distance = to.length();
    if (distance < .001 || distance > maxRange) continue;
    const dot = to.clone().normalize().dot(current);
    if (dot < minDot) continue;
    const score = distance * (1 + (1 - dot) * .35);
    if (score < bestScore) { best = enemy; bestScore = score; }
  }
  if (best) {
    const to = best.position.clone().sub(origin); to.y = 0;
    this.player.facing = Math.atan2(to.x, to.z);
    this.player.root.rotation.y = this.player.facing;
  }
  return best;
};

const startAttack = Game.prototype._startAttack;
Game.prototype._startAttack = function () {
  this._faceNearestTarget(4.6, .05);
  return startAttack.call(this);
};

const resolveMelee = Game.prototype._resolveMelee;
Game.prototype._resolveMelee = function () {
  resolveMelee.call(this);
  const forward = new V(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
  this.player.velocity.addScaledVector(forward, this.player.comboIndex === 2 ? 1.35 : .72);
};

Character.prototype.beginCast = function () {
  if (this.dead || this.state === 'dodge') return false;
  this.state = 'cast';
  this.stateTime = 0;
  this.stateDuration = .34;
  this.velocity.multiplyScalar(.55);
  return true;
};

const characterUpdate = Character.prototype.update;
Character.prototype.update = function (dt, move, cameraYaw) {
  characterUpdate.call(this, dt, move, cameraYaw);
  if (this.state === 'cast' && this.stateTime >= this.stateDuration) {
    this.state = 'idle';
    this.stateTime = 0;
  }
};

const characterAnimate = Character.prototype._animate;
Character.prototype._animate = function (dt) {
  characterAnimate.call(this, dt);
  if (this.state !== 'cast') return;
  const rig = this.rig;
  const p = clamp(this.stateTime / this.stateDuration, 0, 1);
  const pulse = Math.sin(Math.PI * p);
  rig.body.rotation.y = -.16 * pulse;
  rig.armL.rotation.x = -1.25 * pulse;
  rig.armL.rotation.z = .62 * pulse;
  rig.armR.rotation.x = -.72 * pulse;
  rig.swordGlow.material.emissiveIntensity = 2.2 + 2.2 * pulse;
};

const castSpell = Game.prototype._castSpell;
Game.prototype._castSpell = function () {
  this._faceNearestTarget(13, -.4);
  this.player.beginCast?.();
  castSpell.call(this);
  const projectile = this.projectiles.at(-1);
  if (!projectile || projectile.mesh.userData.showcaseEnhanced) return;
  projectile.mesh.userData.showcaseEnhanced = true;
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(.38, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6f45, transparent: true, opacity: .24, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffd993, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 6, 20), ringMaterial);
  const ringB = ringA.clone();
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  projectile.mesh.add(aura, ringA, ringB);
  projectile.mesh.material.emissiveIntensity = 4.1;
  projectile.mesh.scale.setScalar(1.12);
};

// Replace the single white torus with a layered, colored energy ribbon.
FXSystem.prototype.slash = function (position, rotationY, combo = 0) {
  const colors = [0xb9ffe3, 0x8ff5d1, 0xffcc72];
  const accents = [0xeffff6, 0xd9fff2, 0xfff1b5];
  const group = new THREE.Group();
  const make = (geometry, color, opacity) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.userData.disposeMaterial = true;
    return mesh;
  };
  const glow = make(slashGlowGeometry, colors[combo % 3], .22);
  const core = make(slashGeometry, colors[combo % 3], 1);
  const edge = make(slashEdgeGeometry, accents[combo % 3], .95);
  group.add(glow, core, edge);
  group.position.copy(position).add(new V(0, 1.12, 0));
  group.rotation.set(Math.PI / 2.42, rotationY - Math.PI * .48, combo === 2 ? -.72 : .22);
  group.scale.setScalar(combo === 2 ? 1.38 : 1.08);
  this.add(group, .21, (effect, frameDt, t) => {
    effect.obj.scale.multiplyScalar(1 + frameDt * (combo === 2 ? 5.2 : 4.2));
    const fade = Math.pow(1 - t, 1.4);
    effect.obj.children[0].material.opacity = fade * .22;
    effect.obj.children[1].material.opacity = fade;
    effect.obj.children[2].material.opacity = fade * .92;
    effect.obj.rotation.z += (combo === 2 ? .9 : .45) * frameDt;
  });
};

// Thornmaw gets boss-scale silhouette and reach without duplicating the enemy state machine.
const enemyUpdate = Enemy.prototype.update;
Enemy.prototype.update = function (dt, player) {
  if (!this.isBoss) return enemyUpdate.call(this, dt, player);
  const scaleFactor = 1.36 / 1.08;
  this.root.scale.multiplyScalar(1 / scaleFactor);
  const result = enemyUpdate.call(this, dt, player);
  this.root.scale.multiplyScalar(scaleFactor);
  return result;
};

const spawnBoss = Game.prototype._spawnBoss;
Game.prototype._spawnBoss = function () {
  spawnBoss.call(this);
  if (!this.boss) return;
  this.boss.maxHp = 760;
  this.boss.hp = 760;
  this.boss.radius = 1.38;
  this.boss.attackRange = 2.85;
  this.boss.damage = 24;
};

// Lower third-person camera: keeps the character readable while showing much more horizon/ruins during combat.
Game.prototype._updateCamera = function (dt) {
  const playerPos = this.player.position;
  const forward = new V(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
  const horizontal = 6.05;
  const target = playerPos.clone().add(new V(0, 1.35, 0)).addScaledVector(forward, .62);
  const cp = Math.cos(this.cameraPitch), sp = Math.sin(this.cameraPitch);
  const offset = new V(-Math.sin(this.cameraYaw) * horizontal * cp, 2.45 + horizontal * sp * .58, -Math.cos(this.cameraYaw) * horizontal * cp);
  const ideal = target.clone().add(offset);
  this.camera.position.lerp(ideal, 1 - Math.exp(-dt * 9.5));

  this.cameraShake = damp(this.cameraShake, 0, 7, dt);
  this.cameraKick = damp(this.cameraKick, 0, 6, dt);
  if (this.cameraShake > .01) {
    const strength = this.cameraShake * this.cameraShake;
    this.camera.position.x += (Math.random() - .5) * strength * .28;
    this.camera.position.y += (Math.random() - .5) * strength * .21;
    this.camera.position.z += (Math.random() - .5) * strength * .28;
  }
  this.camera.lookAt(target.clone().addScaledVector(forward, this.cameraKick * .5));
  const targetFov = 50.5 + (this.player.speed / 5.2) * 2.6 + this.cameraKick * 3.1;
  this.camera.fov = damp(this.camera.fov, targetFov, 7, dt);
  this.camera.updateProjectionMatrix();
};

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function enhanceInstance(game) {
  game.cameraPitch = .16;
  game.renderer.toneMappingExposure = .96;

  if (game.scene.fog?.isFogExp2) {
    game.scene.fog.color.setHex(0x688b80);
    game.scene.fog.density = .0175;
  }
  game.scene.background?.setHex?.(0x64877d);

  let sunAdjusted = false;
  game.scene.traverse(object => {
    const uniforms = object.material?.uniforms;
    if (uniforms?.turbidity && uniforms?.rayleigh) {
      uniforms.turbidity.value = 7.2;
      uniforms.rayleigh.value = 2.15;
      uniforms.mieCoefficient.value = .0045;
      uniforms.mieDirectionalG.value = .82;
    }
    if (object.isHemisphereLight) {
      object.intensity = 1.28;
      object.color.setHex(0xbfe2d5);
      object.groundColor.setHex(0x22352b);
    }
    if (object.isDirectionalLight && !sunAdjusted) {
      object.intensity = 3.35;
      object.color.setHex(0xffdda8);
      sunAdjusted = true;
    } else if (object.isDirectionalLight) {
      object.intensity = .58;
      object.color.setHex(0x6bcfc5);
    }
  });

  const ground = game.world.decor.children[0];
  const inner = game.world.decor.children[1];
  ground?.material?.color?.setHex?.(0x365a46);
  inner?.material?.color?.setHex?.(0x4f7453);

  const patchGroup = new THREE.Group();
  patchGroup.name = 'showcase-grass-patches';
  const patchColors = [0x456b4f, 0x5b7d55, 0x3f674e, 0x527557];
  const random = mulberry32(0xE8B3F4);
  const patchMaterials = patchColors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  const count = game.quality === 'high' ? 22 : 13;
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 2.5 + random() * 18.2;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.15 + random() * 2, 7), patchMaterials[i % patchMaterials.length]);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = random() * Math.PI;
    patch.scale.set(1, .65 + random() * .8, 1);
    patch.position.set(Math.cos(angle) * radius, .013, Math.sin(angle) * radius);
    patch.receiveShadow = true;
    patchGroup.add(patch);
  }
  game.world.decor.add(patchGroup);

  if (game.composer) {
    for (const pass of game.composer.passes) {
      if ('strength' in pass && 'threshold' in pass) {
        pass.strength = .36;
        pass.threshold = .68;
        pass.radius = .42;
      }
    }
  }
}
