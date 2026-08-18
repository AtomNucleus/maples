import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

const ENV = {
  arch: '/assets/environment/glade-arch.glb',
  brokenWall: '/assets/environment/ruin-wall-broken.glb',
  pillar: '/assets/environment/ruin-pillar.glb',
  stairs: '/assets/environment/shrine-stairs.glb',
  torch: '/assets/environment/torch-lit.glb',
};

function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

function prep(root, tint = null, tintAmount = 0) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (!node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    const copies = list.map(material => {
      const copy = material.clone();
      if (copy.color && tint != null) copy.color.lerp(new THREE.Color(tint), tintAmount);
      if ('roughness' in copy) copy.roughness = Math.max(.62, copy.roughness ?? .8);
      return copy;
    });
    node.material = Array.isArray(node.material) ? copies : copies[0];
  });
  return root;
}

async function cloneModel(url, tint = null, tintAmount = 0) {
  const gltf = await load(url);
  return prep(gltf.scene.clone(true), tint, tintAmount);
}

function place(parent, model, { x = 0, y = 0, z = 0, ry = 0, scale = 1, name = '' } = {}) {
  model.position.set(x, y, z);
  model.rotation.y = ry;
  model.scale.setScalar(scale);
  model.name = name;
  model.userData.assetEnvironment = true;
  parent.add(model);
  return model;
}

function hideProceduralPortalStone(world) {
  if (!world.portal) return;
  for (const child of world.portal.children) {
    if (child === world.portalRing || child === world.portalDisc || child === world.portalLight) continue;
    child.visible = false;
  }
}

function addTorchLight(parent, x, y, z, color = 0xffa85a) {
  const light = new THREE.PointLight(color, 1.45, 5.2, 2.0);
  light.position.set(x, y, z);
  light.castShadow = false;
  parent.add(light);
  return light;
}

export async function installEnvironmentAssets(game) {
  const manager = game.environmentAssetManager = {
    ready: false,
    count: 0,
    failures: [],
    roots: [],
  };

  try {
    const [archTemplate, wallTemplate, pillarTemplate, stairsTemplate, torchTemplate] = await Promise.all([
      cloneModel(ENV.arch, 0x809487, .08),
      cloneModel(ENV.brokenWall, 0x758878, .10),
      cloneModel(ENV.pillar, 0x7e9183, .08),
      cloneModel(ENV.stairs, 0x768a7c, .08),
      cloneModel(ENV.torch, null, 0),
    ]);

    const parent = game.world.decor;
    hideProceduralPortalStone(game.world);

    // Shrine silhouette: one authentic four-meter arch, with the old portal magic retained inside it.
    manager.roots.push(place(parent, archTemplate, {
      x: 0, y: 0, z: -18, ry: 0, scale: 1.13, name: 'KayKit_Glade_Arch'
    }));

    // A broad stair run pulls the eye from the combat field into the portal composition.
    manager.roots.push(place(parent, stairsTemplate, {
      x: 0, y: .01, z: -14.75, ry: Math.PI, scale: .92, name: 'KayKit_Shrine_Stairs'
    }));

    const pillarPlacements = [
      [-5.9, 0, -10.1, .13, .9], [5.9, 0, -10.1, -.13, .9],
      [-8.8, 0, -2.4, .38, .72], [8.8, 0, -2.4, -.38, .72],
    ];
    for (const [x, y, z, ry, scale] of pillarPlacements) {
      const model = prep(pillarTemplate.clone(true), 0x728778, .04);
      manager.roots.push(place(parent, model, { x, y, z, ry, scale, name: 'KayKit_Ruin_Pillar' }));
    }

    const wallPlacements = [
      [-10.6, 0, -7.0, .56, .86], [10.3, 0, 5.2, -1.02, .82],
      [-11.4, 0, 5.5, 1.08, .68], [8.4, 0, -11.4, -.52, .66],
    ];
    for (const [x, y, z, ry, scale] of wallPlacements) {
      const model = prep(wallTemplate.clone(true), 0x68806e, .05);
      manager.roots.push(place(parent, model, { x, y, z, ry, scale, name: 'KayKit_Broken_Ruin' }));
    }

    const torches = [
      [-1.63, .05, -17.38, 0], [1.63, .05, -17.38, Math.PI],
      [-5.25, .03, -9.62, .2], [5.25, .03, -9.62, -.2],
    ];
    for (const [x, y, z, ry] of torches) {
      const model = torchTemplate.clone(true);
      manager.roots.push(place(parent, model, { x, y, z, ry, scale: 1.05, name: 'KayKit_Lit_Torch' }));
      addTorchLight(parent, x, y + 1.55, z + .06);
    }

    manager.count = manager.roots.length;
    manager.ready = true;
    return manager;
  } catch (error) {
    manager.failures.push(String(error));
    console.error('Could not install KayKit environment layer; procedural world remains available.', error);
    return manager;
  }
}
