import * as THREE from 'three';

const V = THREE.Vector3;
const damp = THREE.MathUtils.damp;

const LOOKS = {
  skeleton: { tint: 0x96b875, emissive: 0x314b31, intensity: .18 },
  ghost: { tint: 0x7ee8cf, emissive: 0x2d9c87, intensity: .68 },
  bat: { tint: 0x8a7fc1, emissive: 0x3c356f, intensity: .42 },
  demon: { tint: 0xd55a48, emissive: 0x741d17, intensity: .34 },
};

function styleImportedEnemy(enemy) {
  if (!enemy.assetVisual || enemy.assetVisual.userData.cinematicLookApplied) return;
  const look = LOOKS[enemy.assetKind] || LOOKS.skeleton;
  enemy.assetVisual.userData.cinematicLookApplied = true;
  enemy.assetVisual.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material.color) material.color.lerp(new THREE.Color(look.tint), enemy.assetKind === 'ghost' ? .34 : .17);
      if (material.emissive) {
        material.emissive.setHex(look.emissive);
        material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, look.intensity);
      }
    }
  });

  // Small unshadowed aura lights make dark monster silhouettes readable without changing the world lighting budget much.
  if (enemy.assetKind === 'ghost' || enemy.assetKind === 'bat') {
    const aura = new THREE.PointLight(look.tint, enemy.assetKind === 'ghost' ? .55 : .3, 3.2, 2.2);
    aura.position.y = enemy.assetKind === 'ghost' ? 1.05 : 1.25;
    aura.userData.assetAura = true;
    enemy.root.add(aura);
  }
}

function tuneAtmosphere(game) {
  game.renderer.toneMappingExposure = .93;
  if (game.scene.fog?.isFogExp2) game.scene.fog.density = .0145;
  game.scene.traverse(object => {
    const uniforms = object.material?.uniforms;
    if (uniforms?.turbidity && uniforms?.rayleigh) {
      uniforms.turbidity.value = 5.1;
      uniforms.rayleigh.value = 2.35;
      uniforms.mieCoefficient.value = .0038;
      uniforms.mieDirectionalG.value = .8;
    }
  });
}

export function installCinematicPolish(game) {
  tuneAtmosphere(game);
  game.bossRevealTimer = 0;
  game.bossRevealDuration = 1.8;

  const baseSpawnBoss = game._spawnBoss.bind(game);
  game._spawnBoss = () => {
    baseSpawnBoss();
    if (!game.boss) return;
    game.boss.position.set(0, 0, -14.7);
    game.boss.velocity.set(0, 0, 0);
    game.boss.state = 'spawn';
    game.boss.stateTime = 0;
    game.boss.stateDuration = game.bossRevealDuration;
    game.bossRevealTimer = game.bossRevealDuration;
  };

  const baseUpdateEnemies = game._updateEnemies.bind(game);
  game._updateEnemies = (dt, realDt) => {
    baseUpdateEnemies(dt, realDt);
    for (const enemy of game.enemies) styleImportedEnemy(enemy);
  };

  const baseCamera = game._updateCamera.bind(game);
  game._updateCamera = dt => {
    baseCamera(dt);
    if (!game.boss || game.bossRevealTimer <= 0) return;

    game.bossRevealTimer = Math.max(0, game.bossRevealTimer - dt);
    const remaining = game.bossRevealTimer / game.bossRevealDuration;
    const returnBlend = THREE.MathUtils.smoothstep(remaining, 0, .24);
    const bossPos = game.boss.position.clone();
    const playerPos = game.player.position.clone();
    const towardBoss = bossPos.clone().sub(playerPos); towardBoss.y = 0;
    if (towardBoss.lengthSq() < .001) towardBoss.set(0, 0, -1);
    towardBoss.normalize();
    const right = new V(towardBoss.z, 0, -towardBoss.x);

    const cinematicPos = playerPos.clone()
      .addScaledVector(towardBoss, -7.0)
      .addScaledVector(right, 2.0)
      .add(new V(0, 4.15, 0));
    const cinematicLook = bossPos.clone().add(new V(0, 2.0, 0));

    const strength = 1 - returnBlend;
    this.camera.position.lerp(cinematicPos, (1 - Math.exp(-dt * 8)) * strength);
    const normalLook = playerPos.clone().add(new V(0, 1.35, 0)).addScaledVector(towardBoss, 1.0);
    const lookAt = normalLook.lerp(cinematicLook, .78 * strength);
    this.camera.lookAt(lookAt);
    this.camera.fov = damp(this.camera.fov, 57, 9, dt);
    this.camera.updateProjectionMatrix();
  };

  return game;
}
