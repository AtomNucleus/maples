import * as THREE from 'three';
import { Character } from './Character.js';
import { Enemy } from './Enemy.js';

const V = THREE.Vector3;
const Q = THREE.Quaternion;
const E = THREE.Euler;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const playerManagers = new WeakMap();
const enemyManagers = new WeakMap();
const dustGeo = new THREE.IcosahedronGeometry(.115, 0);
const warm = new THREE.Color(0xffd077);
const cool = new THREE.Color(0xb9ffe4);
const white = new THREE.Color(0xffffff);

function wrapAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function listMaterials(root) {
  const materials = [];
  const seen = new Set();
  root?.traverse(node => {
    if (!node.material) return;
    const source = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of source) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      materials.push(material);
    }
  });
  return materials;
}

function captureGlowMaterials(root) {
  return listMaterials(root)
    .filter(material => material.emissive)
    .map(material => ({
      material,
      emissive: material.emissive.clone(),
      intensity: material.emissiveIntensity || 0,
    }));
}

function findNamed(root, matcher) {
  let match = null;
  root?.traverse(node => {
    if (!match && matcher(node.name || '', node)) match = node;
  });
  return match;
}

function findSwordMesh(root) {
  const swordRoot = findNamed(root, name => /(^|_)1h_sword($|_)/i.test(name) || /sword/i.test(name));
  if (!swordRoot) return null;
  if (swordRoot.isMesh && swordRoot.geometry) return swordRoot;
  let mesh = null;
  swordRoot.traverse(node => {
    if (!mesh && node.isMesh && node.geometry) mesh = node;
  });
  return mesh;
}

function bladeEndpoints(mesh, outA, outB) {
  if (!mesh?.geometry) return false;
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;

  const size = box.getSize(new V());
  const center = box.getCenter(new V());
  let axis = 'y';
  if (size.x > size.y && size.x > size.z) axis = 'x';
  else if (size.z > size.y && size.z > size.x) axis = 'z';

  outA.copy(center);
  outB.copy(center);
  outA[axis] = box.min[axis];
  outB[axis] = box.max[axis];
  mesh.localToWorld(outA);
  mesh.localToWorld(outB);
  return Number.isFinite(outA.x + outA.y + outA.z + outB.x + outB.y + outB.z);
}

class WeaponRibbon {
  constructor(scene) {
    this.scene = scene;
    this.samples = [];
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: .72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'RowanWeaponMotionRibbon';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.a = new V();
    this.b = new V();
    this.combo = 0;
  }

  update(dt, sword, active, combo = 0, energy = 1) {
    for (const sample of this.samples) sample.life -= dt;
    this.samples = this.samples.filter(sample => sample.life > 0);
    this.combo = combo;

    if (active && bladeEndpoints(sword, this.a, this.b)) {
      const last = this.samples[this.samples.length - 1];
      const center = this.a.clone().add(this.b).multiplyScalar(.5);
      const lastCenter = last ? last.a.clone().add(last.b).multiplyScalar(.5) : null;
      if (!lastCenter || center.distanceToSquared(lastCenter) > .00045) {
        this.samples.push({ a: this.a.clone(), b: this.b.clone(), life: .14 + energy * .045, energy });
      }
      while (this.samples.length > 10) this.samples.shift();
    }

    if (this.samples.length < 2) {
      this.mesh.visible = false;
      return;
    }

    const positions = [];
    const colors = [];
    const indices = [];
    const baseColor = combo === 2 ? warm : cool;
    const count = this.samples.length;

    for (let i = 0; i < count; i++) {
      const sample = this.samples[i];
      const age = i / Math.max(1, count - 1);
      const color = baseColor.clone().lerp(white, age * .34);
      const fade = .2 + age * .8;
      positions.push(sample.a.x, sample.a.y, sample.a.z, sample.b.x, sample.b.y, sample.b.z);
      colors.push(color.r * fade, color.g * fade, color.b * fade, color.r * fade, color.g * fade, color.b * fade);
      if (i < count - 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }

    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingSphere();
    this.material.opacity = combo === 2 ? .82 : .67;
    this.mesh.visible = true;
  }
}

function emitGroundDust(fx, position, intensity = 1, facing = 0, lateral = 0) {
  if (!fx?.add) return;
  const right = new V(Math.cos(facing), 0, -Math.sin(facing));
  const origin = position.clone().addScaledVector(right, lateral);
  const count = Math.max(2, Math.round(3 * intensity));

  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0x9b8a69 : 0x718064,
      transparent: true,
      opacity: .2 + Math.random() * .13,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(dustGeo, material);
    puff.userData.disposeMaterial = true;
    puff.position.copy(origin).add(new V((Math.random() - .5) * .38 * intensity, .05 + Math.random() * .11, (Math.random() - .5) * .38 * intensity));
    puff.scale.setScalar(.45 + Math.random() * .7 * intensity);
    const velocity = new V((Math.random() - .5) * .65 * intensity, .25 + Math.random() * .4, (Math.random() - .5) * .65 * intensity);
    fx.add(puff, .34 + Math.random() * .22, (effect, dt, t) => {
      effect.obj.position.addScaledVector(velocity, dt);
      effect.obj.scale.multiplyScalar(1 + dt * (1.25 + intensity * .45));
      effect.obj.material.opacity = (1 - t) * .24;
    });
  }
}

function initPlayerPolish(player, manager) {
  if (!player.assetVisual?.userData?.rowanLookApplied) return null;
  if (player._animationPolish?.model === player.assetVisual) return player._animationPolish;

  const model = player.assetVisual;
  const sword = findSwordMesh(model);
  const cape = findNamed(model, name => /cape/i.test(name));
  const hair = findNamed(model, name => /hair/i.test(name));
  const state = {
    model,
    restPosition: model.position.clone(),
    restQuaternion: model.quaternion.clone(),
    restScale: model.scale.clone(),
    sword,
    swordGlow: sword ? captureGlowMaterials(sword) : [],
    cape,
    capeRest: cape?.quaternion.clone() || null,
    hair,
    hairRest: hair?.quaternion.clone() || null,
    ribbon: new WeaponRibbon(player.scene),
    lastSpeed: player.speed || 0,
    lastFacing: player.facing || 0,
    strideDistance: 0,
    foot: -1,
    stateKey: player.state,
  };
  player._animationPolish = state;

  manager.playerReady = true;
  manager.secondaryMotionReady = Boolean(cape || hair);
  manager.trailReady = Boolean(sword);
  return state;
}

function updateGearSecondary(state, player, dt, speed01, turnRate, acceleration) {
  if (state.cape && state.capeRest) {
    const flutter = Math.sin(performance.now() * .0082) * (.025 + speed01 * .04);
    const pitch = .03 + speed01 * .32 + clamp(acceleration * .012, -.05, .08);
    const roll = clamp(-turnRate * .014, -.1, .1) + flutter;
    const add = new Q().setFromEuler(new E(pitch, 0, roll, 'XYZ'));
    const target = state.capeRest.clone().multiply(add);
    state.cape.quaternion.slerp(target, 1 - Math.exp(-dt * 8.5));
  }

  if (state.hair && state.hairRest && state.hair !== state.cape) {
    const flutter = Math.sin(performance.now() * .011 + 1.2) * (.018 + speed01 * .025);
    const add = new Q().setFromEuler(new E(-speed01 * .055, 0, clamp(-turnRate * .008, -.055, .055) + flutter, 'XYZ'));
    const target = state.hairRest.clone().multiply(add);
    state.hair.quaternion.slerp(target, 1 - Math.exp(-dt * 10));
  }
}

function updateSwordGlow(state, player, dt) {
  if (!state.swordGlow.length) return;
  const attacking = player.state === 'attack';
  const p = attacking ? clamp(player.stateTime / player.stateDuration, 0, 1) : 0;
  const strike = attacking ? Math.sin(Math.PI * clamp((p - .12) / .74, 0, 1)) : 0;
  const finisher = player.comboIndex === 2 ? 1.45 : 1;
  const tint = player.comboIndex === 2 ? warm : cool;

  for (const entry of state.swordGlow) {
    const material = entry.material;
    const power = strike * finisher;
    material.emissive.copy(entry.emissive).lerp(tint, clamp(power * .68, 0, .82));
    material.emissiveIntensity = damp(material.emissiveIntensity || 0, entry.intensity + power * 1.45, 16, dt);
  }
}

function updatePlayerPolish(player, dt) {
  const manager = playerManagers.get(player);
  if (!manager || !player.assetVisual) return;
  const state = initPlayerPolish(player, manager);
  if (!state) return;

  const now = performance.now() * .001;
  const speed = player.speed || 0;
  const speed01 = clamp(speed / 5.25, 0, 1);
  const acceleration = dt > .0001 ? clamp((speed - state.lastSpeed) / dt, -22, 22) : 0;
  const turnRate = dt > .0001 ? wrapAngle(player.facing - state.lastFacing) / dt : 0;
  const moving = speed > .45 && !['attack', 'dodge', 'hurt', 'dead'].includes(player.state);

  let pitch = clamp(-acceleration * .0065, -.075, .075) - speed01 * .018;
  let roll = clamp(turnRate * .018 * speed01, -.11, .11);
  let bob = moving ? Math.sin(now * (8.1 + speed01 * 3.4)) * .009 * speed01 : Math.sin(now * 2.15) * .005;
  let squash = 0;

  if (player.state === 'attack') {
    const p = clamp(player.stateTime / player.stateDuration, 0, 1);
    const drive = Math.sin(Math.PI * clamp((p - .08) / .78, 0, 1));
    pitch -= drive * (player.comboIndex === 2 ? .115 : .055);
    roll += (player.comboIndex === 0 ? -.045 : player.comboIndex === 1 ? .045 : -.025) * drive;
    squash = Math.sin(Math.PI * p) * (player.comboIndex === 2 ? .018 : .008);
    bob = 0;
  } else if (player.state === 'dodge') {
    const p = clamp(player.stateTime / player.stateDuration, 0, 1);
    pitch -= Math.sin(Math.PI * p) * .1;
    bob -= Math.sin(Math.PI * p) * .035;
  } else if (player.state === 'hurt') {
    const p = clamp(player.stateTime / Math.max(.01, player.stateDuration), 0, 1);
    pitch += Math.sin(Math.PI * p) * .06;
  }

  const targetQ = state.restQuaternion.clone().multiply(new Q().setFromEuler(new E(pitch, 0, roll, 'XYZ')));
  state.model.quaternion.slerp(targetQ, 1 - Math.exp(-dt * 13));
  state.model.position.copy(state.restPosition);
  state.model.position.y += bob;
  state.model.scale.copy(state.restScale).multiply(new V(1 + squash * .5, 1 - squash, 1 + squash * .5));

  updateGearSecondary(state, player, dt, speed01, turnRate, acceleration);
  updateSwordGlow(state, player, dt);

  const attackProgress = player.state === 'attack' ? player.stateTime / Math.max(.01, player.stateDuration) : 0;
  const trailActive = player.root.visible && player.state === 'attack' && attackProgress > .13 && attackProgress < .88;
  const trailEnergy = player.comboIndex === 2 ? 1.35 : 1;
  state.ribbon.update(dt, state.sword, trailActive, player.comboIndex, trailEnergy);
  manager.trailActive = state.ribbon.mesh.visible;
  manager.trailSamples = state.ribbon.samples.length;

  if (moving && speed > 1.1) {
    state.strideDistance += speed * dt;
    const stride = speed > 3.2 ? 1.48 : 1.05;
    if (state.strideDistance >= stride) {
      state.strideDistance %= stride;
      state.foot *= -1;
      emitGroundDust(player.fx, player.position, .62 + speed01 * .48, player.facing, state.foot * .18);
      manager.footstepEvents++;
    }
  } else {
    state.strideDistance = Math.min(state.strideDistance, .35);
  }

  if (state.stateKey !== player.state) {
    if (player.state === 'dodge') {
      emitGroundDust(player.fx, player.position, 1.05, player.facing, 0);
      manager.impactEvents++;
    }
    state.stateKey = player.state;
  }

  state.lastSpeed = speed;
  state.lastFacing = player.facing;
}

function initEnemyPolish(enemy, manager) {
  if (!enemy.assetVisual?.userData?.cinematicLookApplied) return null;
  if (enemy._animationPolish?.model === enemy.assetVisual) return enemy._animationPolish;
  const model = enemy.assetVisual;
  const state = {
    model,
    restPosition: model.position.clone(),
    restQuaternion: model.quaternion.clone(),
    restScale: model.scale.clone(),
    glowMaterials: captureGlowMaterials(model),
    lastState: enemy.state,
    lastAttackSerial: enemy.attackSerial,
    hitSign: Math.random() < .5 ? -1 : 1,
    bossLight: null,
  };

  if (enemy.isBoss) {
    const light = new THREE.PointLight(0xff684a, 0, 7.5, 2);
    light.position.set(0, 2.15, .5);
    light.userData.animationPolish = true;
    enemy.root.add(light);
    state.bossLight = light;
  }

  enemy._animationPolish = state;
  manager.enemyPolished++;
  if (enemy.isBoss) manager.bossPolished = true;
  return state;
}

function updateEnemyMaterials(state, enemy, dt, windupPower) {
  const hitPower = enemy.hitFlash > 0 ? clamp(enemy.hitFlash / .12, 0, 1) : 0;
  const bossPower = enemy.isBoss ? windupPower : 0;

  for (const entry of state.glowMaterials) {
    const material = entry.material;
    const targetPower = Math.max(hitPower * 1.15, bossPower * .78);
    const tint = hitPower > bossPower ? white : warm;
    material.emissive.copy(entry.emissive).lerp(tint, clamp(targetPower * .72, 0, .88));
    material.emissiveIntensity = damp(material.emissiveIntensity || 0, entry.intensity + targetPower * 1.6, 18, dt);
  }
}

function updateEnemyPolish(enemy, dt) {
  const manager = enemyManagers.get(enemy);
  if (!manager || !enemy.assetVisual || enemy.remove) return;
  const state = initEnemyPolish(enemy, manager);
  if (!state) return;

  const now = performance.now() * .001;
  const moving = enemy.state === 'chase' && enemy.velocity.lengthSq() > .05;
  let pitch = moving ? -.025 : 0;
  let roll = moving ? Math.sin(now * (enemy.isBoss ? 4.2 : 7.2)) * (enemy.isBoss ? .018 : .028) : 0;
  let y = state.restPosition.y;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  let windupPower = 0;

  if (enemy.assetKind === 'ghost') y += Math.sin(now * 3.2 + enemy.position.x * .17) * .075;
  else if (enemy.assetKind === 'bat') y += Math.sin(now * 5.1 + enemy.position.z * .13) * .055;
  else if (moving) y += Math.abs(Math.sin(now * (enemy.isBoss ? 4.4 : 7.5))) * (enemy.isBoss ? .025 : .018);

  if (enemy.state === 'windup') {
    const p = clamp(enemy.stateTime / Math.max(.01, enemy.stateDuration), 0, 1);
    windupPower = p * p;
    pitch += (enemy.isBoss ? .085 : .055) * p;
    sx += p * (enemy.isBoss ? .028 : .018);
    sy -= p * (enemy.isBoss ? .025 : .014);
    sz += p * (enemy.isBoss ? .035 : .02);
    roll += Math.sin(now * 27) * .008 * p;
  } else if (enemy.state === 'attack') {
    const p = clamp(enemy.stateTime / Math.max(.01, enemy.stateDuration), 0, 1);
    const strike = Math.sin(Math.PI * clamp(p / .72, 0, 1));
    pitch -= strike * (enemy.isBoss ? .13 : .085);
    sy += strike * .018;
    sz += strike * .026;
  } else if (enemy.state === 'stagger') {
    const p = clamp(enemy.stateTime / Math.max(.01, enemy.stateDuration), 0, 1);
    roll += state.hitSign * Math.sin(Math.PI * p) * .13;
    pitch += Math.sin(Math.PI * p) * .06;
  } else if (enemy.isBoss && enemy.state === 'idle') {
    const breath = Math.sin(now * 1.9) * .006;
    sx += breath;
    sy -= breath * .5;
    sz += breath;
  }

  const targetQ = state.restQuaternion.clone().multiply(new Q().setFromEuler(new E(pitch, 0, roll, 'XYZ')));
  state.model.quaternion.slerp(targetQ, 1 - Math.exp(-dt * (enemy.isBoss ? 9 : 12)));
  state.model.position.copy(state.restPosition);
  state.model.position.y = y;
  state.model.scale.copy(state.restScale).multiply(new V(sx, sy, sz));

  updateEnemyMaterials(state, enemy, dt, windupPower);

  if (state.bossLight) {
    let target = 0;
    if (enemy.state === 'windup') target = .35 + windupPower * 2.4;
    else if (enemy.state === 'attack') target = 2.1;
    state.bossLight.intensity = damp(state.bossLight.intensity, target, 16, dt);
  }

  if (state.lastState !== enemy.state) {
    if (enemy.state === 'attack') {
      const strength = enemy.isBoss ? 1.9 : .72;
      emitGroundDust(enemy.fx, enemy.position, strength, enemy.facing, 0);
      if (enemy.isBoss) {
        enemy.fx.burst(enemy.position.clone().add(new V(0, .35, 0)), 0xff9a67, 10, 3.1, 1.15);
      }
      manager.impactEvents++;
    } else if (enemy.state === 'stagger') {
      state.hitSign *= -1;
    }
    state.lastState = enemy.state;
  }

  state.lastAttackSerial = enemy.attackSerial;
}

let prototypesPatched = false;
function patchPrototypes() {
  if (prototypesPatched) return;
  prototypesPatched = true;

  const characterUpdate = Character.prototype.update;
  Character.prototype.update = function (...args) {
    const result = characterUpdate.apply(this, args);
    updatePlayerPolish(this, args[0] || 0);
    return result;
  };

  const enemyUpdate = Enemy.prototype.update;
  Enemy.prototype.update = function (...args) {
    const result = enemyUpdate.apply(this, args);
    updateEnemyPolish(this, args[0] || 0);
    return result;
  };
}

export function installAnimationPolish(game) {
  patchPrototypes();
  const manager = {
    ready: true,
    playerReady: false,
    secondaryMotionReady: false,
    trailReady: false,
    trailActive: false,
    trailSamples: 0,
    enemyPolished: 0,
    bossPolished: false,
    footstepEvents: 0,
    impactEvents: 0,
  };
  game.animationPolishManager = manager;
  playerManagers.set(game.player, manager);
  for (const enemy of game.enemies) enemyManagers.set(enemy, manager);

  const baseSpawnEnemy = game._spawnEnemy.bind(game);
  game._spawnEnemy = (...args) => {
    const enemy = baseSpawnEnemy(...args);
    enemyManagers.set(enemy, manager);
    return enemy;
  };

  return manager;
}
