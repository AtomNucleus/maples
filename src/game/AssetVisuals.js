import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { Character } from './Character.js';
import { Enemy } from './Enemy.js';

const loader = new GLTFLoader();
const cache = new Map();
const V = THREE.Vector3;

const ASSETS = {
  hero: '/assets/characters/rowan-knight.glb',
  demon: '/assets/monsters/thornmaw-demon.glb',
  ghost: '/assets/monsters/briar-ghost.glb',
  skeleton: '/assets/monsters/briar-skeleton.glb',
  bat: '/assets/monsters/briar-bat.glb',
};

const PLAYER_CLIPS = {
  idle: ['Idle'],
  run: ['Running_A', 'Running_B'],
  walk: ['Walking_A', 'Walking_B'],
  attack0: ['1H_Melee_Attack_Slice_Horizontal'],
  attack1: ['1H_Melee_Attack_Slice_Diagonal'],
  attack2: ['1H_Melee_Attack_Chop'],
  dodge: ['Dodge_Forward'],
  cast: ['Spellcast_Shoot', 'Spellcasting'],
  hurt: ['Hit_A', 'Hit_B'],
  death: ['Death_A', 'Death_B'],
};

const MONSTER_CLIPS = {
  skeleton: {
    idle: [/Skeleton_Idle$/i], run: [/Skeleton_Running$/i], windup: [/Skeleton_Attack$/i], attack: [/Skeleton_Attack$/i],
    hit: [/Skeleton_Idle$/i], death: [/Skeleton_Death$/i], spawn: [/Skeleton_Spawn$/i],
  },
  bat: {
    idle: [/Bat_Flying$/i], run: [/Bat_Flying$/i], windup: [/Bat_Attack2?$/i], attack: [/Bat_Attack2?$/i],
    hit: [/Bat_Hit$/i], death: [/Bat_Death$/i], spawn: [/Bat_Flying$/i],
  },
  ghost: {
    idle: ['Flying_Idle'], run: ['Fast_Flying'], windup: ['Punch', 'Headbutt'], attack: ['Punch', 'Headbutt'],
    hit: ['HitReact'], death: ['Death'], spawn: ['Flying_Idle'],
  },
  demon: {
    idle: ['Idle'], run: ['Run', 'Walk'], windup: ['Punch', 'Weapon'], attack: ['Punch', 'Weapon'],
    hit: ['HitReact'], death: ['Death'], spawn: ['Idle'],
  },
};

function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).catch(error => {
      cache.delete(url);
      throw error;
    }));
  }
  return cache.get(url);
}

function configureMeshTree(root, tint = null, tintAmount = 0) {
  root.traverse(node => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = true;
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const copies = materials.map(material => {
        const copy = material.clone();
        if (copy.color && tint != null && tintAmount > 0) copy.color.lerp(new THREE.Color(tint), tintAmount);
        if ('roughness' in copy) copy.roughness = Math.max(.48, copy.roughness ?? .7);
        return copy;
      });
      node.material = Array.isArray(node.material) ? copies : copies[0];
    }
  });
}

function normalizeToHeight(model, height, lift = 0) {
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new V());
  if (!Number.isFinite(size.y) || size.y < .001) return;
  model.scale.multiplyScalar(height / size.y);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new V());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.position.y += lift;
  model.updateMatrixWorld(true);
}

function findClip(clips, candidates = []) {
  for (const candidate of candidates) {
    if (candidate instanceof RegExp) {
      const found = clips.find(clip => candidate.test(clip.name));
      if (found) return found;
    } else {
      const exact = clips.find(clip => clip.name === candidate);
      if (exact) return exact;
      const fuzzy = clips.find(clip => clip.name.toLowerCase().includes(String(candidate).toLowerCase()));
      if (fuzzy) return fuzzy;
    }
  }
  return null;
}

class RigAnimator {
  constructor(model, clips, map) {
    this.model = model;
    this.clips = clips;
    this.map = map;
    this.mixer = new THREE.AnimationMixer(model);
    this.action = null;
    this.key = null;
    this.clip = null;
    this.clipCache = new Map();
  }

  _clipFor(key) {
    if (!this.clipCache.has(key)) this.clipCache.set(key, findClip(this.clips, this.map[key] || []));
    return this.clipCache.get(key);
  }

  play(key, { once = false, duration = null, fade = .12, startFraction = 0 } = {}) {
    if (this.key === key && this.action) return this.action;
    const clip = this._clipFor(key);
    if (!clip) return null;

    const next = this.mixer.clipAction(clip);
    const previous = this.action;
    const previousClip = this.clip;
    const previousKey = this.key;
    const previousPhase = previous && previousClip?.duration > 0
      ? (previous.time % previousClip.duration) / previousClip.duration
      : 0;
    const phaseSync = !once && ['walk', 'run'].includes(key) && ['walk', 'run'].includes(previousKey);

    if (next === previous && previousKey !== key) next.stop();
    next.enabled = true;
    next.reset();
    next.stopFading();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.time = clip.duration * THREE.MathUtils.clamp(startFraction, 0, .92);

    if (phaseSync) next.time = clip.duration * previousPhase;

    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (duration && duration > .02) next.setDuration(duration);

    if (previous && previous !== next) {
      next.play();
      next.crossFadeFrom(previous, fade, true);
    } else {
      next.play();
    }

    this.action = next;
    this.key = key;
    this.clip = clip;
    return next;
  }

  update(dt, speedScale = 1) {
    if (this.action && !Number.isNaN(speedScale) && this.key && ['run', 'walk'].includes(this.key)) {
      this.action.setEffectiveTimeScale(THREE.MathUtils.clamp(speedScale, .68, 1.5));
    }
    this.mixer.update(dt);
  }

  get normalizedTime() {
    if (!this.action || !this.clip?.duration) return 0;
    return (this.action.time % this.clip.duration) / this.clip.duration;
  }
}

function hideProceduralPlayer(player) {
  for (const child of player.root.children) {
    if (child === player.shadow || child.userData?.assetVisual) continue;
    child.visible = false;
  }
  if (player.shadow) player.shadow.visible = true;
}

function hideProceduralEnemy(enemy) {
  enemy.proceduralVisualFallback ||= [];
  for (const child of [...enemy.root.children]) {
    if (child === enemy.telegraph || child.userData?.assetVisual) continue;
    const isShadow = child.isMesh && child.geometry?.type === 'CircleGeometry';
    if (isShadow) {
      child.visible = true;
      continue;
    }
    child.visible = false;
    enemy.proceduralVisualFallback.push(child);
    enemy.root.remove(child);
  }
  enemy.telegraph.visible = true;
}

function configureKnightGear(model) {
  const show = new Set(['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape']);
  const gearNames = new Set([
    '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
    '1H_Sword', '2H_Sword', 'Knight_Helmet', 'Knight_Cape',
  ]);
  model.traverse(node => {
    if (gearNames.has(node.name)) node.visible = show.has(node.name);
  });
}

async function attachPlayer(player) {
  try {
    const gltf = await loadGLTF(ASSETS.hero);
    if (player.assetVisual) return;
    const model = cloneSkeleton(gltf.scene);
    model.name = 'Rowan_Imported_Knight';
    model.userData.assetVisual = true;
    configureMeshTree(model);
    configureKnightGear(model);
    normalizeToHeight(model, 1.83);
    // Rowan is authored facing +Z, matching Character.root's forward convention.
    model.rotation.y = 0;
    player.root.add(model);
    player.assetVisual = model;
    player.assetAnimator = new RigAnimator(model, gltf.animations, PLAYER_CLIPS);
    player.assetAnimator.play('idle', { fade: 0 });
    hideProceduralPlayer(player);
  } catch (error) {
    console.error('Could not load Rowan GLB; keeping procedural fallback.', error);
  }
}

function monsterSettings(kind, isBoss) {
  if (isBoss) return { height: 3.35, lift: 0, tint: 0x6b4639, tintAmount: .18, rotation: Math.PI };
  if (kind === 'ghost') return { height: 1.5, lift: .28, tint: 0x5fbca8, tintAmount: .18, rotation: Math.PI };
  if (kind === 'bat') return { height: 1.16, lift: .72, tint: 0x546f5f, tintAmount: .2, rotation: Math.PI };
  return { height: 1.48, lift: 0, tint: 0x6e8d59, tintAmount: .2, rotation: Math.PI };
}

async function attachEnemy(enemy, kind) {
  const actualKind = enemy.isBoss ? 'demon' : kind;
  try {
    const gltf = await loadGLTF(ASSETS[actualKind]);
    if (enemy.assetVisual || enemy.remove) return;
    const model = cloneSkeleton(gltf.scene);
    const settings = monsterSettings(actualKind, enemy.isBoss);
    model.name = `${actualKind}_Imported_Visual`;
    model.userData.assetVisual = true;
    configureMeshTree(model, settings.tint, settings.tintAmount);
    normalizeToHeight(model, settings.height, settings.lift);
    model.rotation.y = settings.rotation;
    enemy.root.add(model);
    enemy.assetVisual = model;
    enemy.assetKind = actualKind;
    enemy.assetAnimator = new RigAnimator(model, gltf.animations, MONSTER_CLIPS[actualKind]);
    enemy.assetAnimator.play(enemy.state === 'spawn' ? 'spawn' : 'idle', { fade: 0, once: enemy.state === 'spawn' });
    hideProceduralEnemy(enemy);
  } catch (error) {
    console.error(`Could not load ${actualKind} GLB; keeping procedural fallback.`, error);
  }
}

function syncPlayerVisual(player, dt) {
  const animator = player.assetAnimator;
  if (!animator) return;
  let key = 'idle';
  let once = false;
  let duration = null;
  let fade = .15;

  if (player.dead || player.state === 'dead') {
    key = 'death'; once = true; duration = 1.05; fade = .07;
  } else if (player.state === 'attack') {
    key = `attack${player.comboIndex}`; once = true; duration = player.stateDuration; fade = .04;
  } else if (player.state === 'dodge') {
    key = 'dodge'; once = true; duration = player.stateDuration; fade = .055;
  } else if (player.state === 'cast') {
    key = 'cast'; once = true; duration = player.stateDuration; fade = .07;
  } else if (player.state === 'hurt') {
    key = 'hurt'; once = true; duration = player.stateDuration; fade = .045;
  } else if (player.speed > .5) {
    const runThreshold = animator.key === 'run' ? 2.58 : 3.28;
    key = player.speed > runThreshold ? 'run' : 'walk';
    fade = animator.key === 'idle' ? .18 : .14;
  }

  animator.play(key, { once, duration, fade });
  animator.update(dt, player.speed / 5.25);
}

function enemyVisualKey(enemy) {
  if (enemy.dead || enemy.state === 'dead') return 'death';
  if (enemy.state === 'windup') return 'windup';
  if (enemy.state === 'attack') return 'attack';
  if (enemy.state === 'stagger') return 'hit';
  if (enemy.state === 'chase') return 'run';
  if (enemy.state === 'spawn') return 'spawn';
  return 'idle';
}

function syncEnemyVisual(enemy, dt) {
  const animator = enemy.assetAnimator;
  if (!animator) return;
  const key = enemyVisualKey(enemy);
  const once = ['windup', 'attack', 'hit', 'death', 'spawn'].includes(key);
  let duration = null;
  let startFraction = 0;
  let fade = .11;

  if (key === 'windup') {
    const anticipationCut = enemy.isBoss ? .3 : .36;
    duration = enemy.stateDuration / anticipationCut;
    fade = enemy.isBoss ? .12 : .07;
  } else if (key === 'attack') {
    const anticipationCut = enemy.isBoss ? .3 : .36;
    startFraction = anticipationCut;
    duration = enemy.stateDuration / (1 - anticipationCut);
    fade = .025;
  } else if (key === 'hit') {
    duration = enemy.stateDuration;
    fade = .025;
  } else if (key === 'death') {
    duration = enemy.stateDuration;
    fade = .07;
  } else if (key === 'spawn') {
    duration = enemy.stateDuration;
    fade = .08;
  }

  animator.play(key, { once, duration, fade, startFraction });
  animator.update(dt, enemy.speed / 2.2);

  if (enemy.assetKind === 'ghost' || enemy.assetKind === 'bat') {
    enemy.assetVisual.position.y += Math.sin(performance.now() * .004 + enemy.position.x) * dt * .1;
  }
}

let prototypesPatched = false;
function patchAnimationSync() {
  if (prototypesPatched) return;
  prototypesPatched = true;

  const characterUpdate = Character.prototype.update;
  Character.prototype.update = function (...args) {
    const result = characterUpdate.apply(this, args);
    syncPlayerVisual(this, args[0] || 0);
    return result;
  };

  const enemyUpdate = Enemy.prototype.update;
  Enemy.prototype.update = function (...args) {
    const result = enemyUpdate.apply(this, args);
    syncEnemyVisual(this, args[0] || 0);
    return result;
  };
}

export function installAssetVisuals(game) {
  patchAnimationSync();
  const manager = {
    enemySerial: 0,
    ready: false,
    heroReady: false,
    failures: [],
  };
  game.assetVisualManager = manager;

  const kinds = ['skeleton', 'ghost', 'bat'];
  const attachNormal = enemy => {
    const kind = kinds[manager.enemySerial++ % kinds.length];
    attachEnemy(enemy, kind).catch(error => manager.failures.push(String(error)));
  };

  for (const enemy of game.enemies) attachNormal(enemy);

  const spawnEnemy = game._spawnEnemy.bind(game);
  game._spawnEnemy = (...args) => {
    const enemy = spawnEnemy(...args);
    if (enemy.isBoss) attachEnemy(enemy, 'demon').catch(error => manager.failures.push(String(error)));
    else attachNormal(enemy);
    return enemy;
  };

  attachPlayer(game.player).then(() => {
    manager.heroReady = Boolean(game.player.assetVisual);
  }).catch(error => manager.failures.push(String(error)));

  Promise.all([ASSETS.hero, ASSETS.demon, ASSETS.ghost, ASSETS.skeleton, ASSETS.bat].map(loadGLTF))
    .then(() => { manager.ready = true; })
    .catch(error => { manager.failures.push(String(error)); });

  return manager;
}
