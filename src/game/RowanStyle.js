import * as THREE from 'three';

const PALETTE = {
  Knight_Body: { color: 0x9fc9b8, roughness: .58, metalness: .06 },
  Knight_ArmLeft: { color: 0xb6d5c9, roughness: .6, metalness: .05 },
  Knight_ArmRight: { color: 0xb6d5c9, roughness: .6, metalness: .05 },
  Knight_LegLeft: { color: 0x84a99b, roughness: .64, metalness: .04 },
  Knight_LegRight: { color: 0x84a99b, roughness: .64, metalness: .04 },
  Knight_Head: { color: 0xffe1c3, roughness: .72, metalness: 0 },
  Knight_Helmet: { color: 0xd7c184, roughness: .38, metalness: .34 },
  Knight_Cape: { color: 0xef7058, roughness: .82, metalness: 0 },
  Round_Shield: { color: 0xd4bd75, roughness: .43, metalness: .26 },
  '1H_Sword': { color: 0xd9f2ed, roughness: .22, metalness: .68, emissive: 0x3ba88e, emissiveIntensity: .11 },
};

function styleMaterial(material, style) {
  if (!material || material.userData?.rowanStyled) return;
  material.userData ||= {};
  material.userData.rowanStyled = true;
  if (material.color && style.color != null) material.color.setHex(style.color);
  if ('roughness' in material && style.roughness != null) material.roughness = style.roughness;
  if ('metalness' in material && style.metalness != null) material.metalness = style.metalness;
  if (material.emissive && style.emissive != null) {
    material.emissive.setHex(style.emissive);
    material.emissiveIntensity = style.emissiveIntensity ?? .08;
  }
  material.needsUpdate = true;
}

function styleNode(node, style) {
  if (!node?.material) return;
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  for (const material of materials) styleMaterial(material, style);
}

function applyRowanLook(player) {
  const model = player?.assetVisual;
  if (!model || model.userData.rowanLookApplied) return false;
  model.userData.rowanLookApplied = true;

  model.traverse(node => {
    const style = PALETTE[node.name];
    if (style) styleNode(node, style);
  });

  const sword = model.getObjectByName('1H_Sword');
  if (sword) {
    const glow = new THREE.PointLight(0x79ebcf, .34, 2.1, 2.2);
    glow.name = 'Rowan_Sword_Glow';
    glow.position.set(.05, .12, 0);
    glow.castShadow = false;
    sword.add(glow);
  }

  return true;
}

export function installRowanStyle(game) {
  const state = game.rowanStyle = { ready: false };
  const started = performance.now();

  const poll = () => {
    if (applyRowanLook(game.player)) {
      state.ready = true;
      return;
    }
    if (performance.now() - started < 15000) requestAnimationFrame(poll);
  };

  poll();
  return state;
}
