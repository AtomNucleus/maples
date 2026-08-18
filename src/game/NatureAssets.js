import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const V = THREE.Vector3;
const cache = new Map();

const NATURE = {
  pine: '/assets/nature/lumen-pine.glb',
  bush: '/assets/nature/flowering-bush.glb',
  fern: '/assets/nature/fern.glb',
  grass: '/assets/nature/wispy-grass.glb',
};

function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

function seededRandom(seed = 0x5EEDBEEF) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function configureTemplate(root, renderer, { castShadow = false, receiveShadow = true } = {}) {
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() || 1);
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = castShadow;
    node.receiveShadow = receiveShadow;
    node.frustumCulled = true;
    if (node.material?.map) node.material.map.anisotropy = maxAniso;
    if (node.material && 'roughness' in node.material) node.material.roughness = Math.max(.72, node.material.roughness ?? .8);
  });
  return root;
}

function normalize(root, targetHeight) {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new V());
  if (size.y > .001) root.scale.multiplyScalar(targetHeight / size.y);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new V());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return root;
}

function placeClone(parent, template, x, z, scale, rotationY, kind, sway = 0) {
  const model = template.clone(true);
  model.position.x += x;
  model.position.z += z;
  model.scale.multiplyScalar(scale);
  model.rotation.y = rotationY;
  model.userData.assetNature = true;
  model.userData.kind = kind;
  model.userData.baseRotationZ = model.rotation.z;
  model.userData.sway = sway;
  model.userData.phase = (x * .37 + z * .53) % (Math.PI * 2);
  parent.add(model);
  return model;
}

export async function installNatureAssets(game) {
  const manager = game.natureAssetManager = {
    ready: false,
    count: 0,
    failures: [],
    instances: [],
    time: 0,
  };

  try {
    const [pineGltf, bushGltf, fernGltf, grassGltf] = await Promise.all([
      load(NATURE.pine), load(NATURE.bush), load(NATURE.fern), load(NATURE.grass)
    ]);

    const pine = normalize(configureTemplate(pineGltf.scene.clone(true), game.renderer, { castShadow: true }), 6.4);
    const bush = normalize(configureTemplate(bushGltf.scene.clone(true), game.renderer, { castShadow: true }), 1.15);
    const fern = normalize(configureTemplate(fernGltf.scene.clone(true), game.renderer), .72);
    const grass = normalize(configureTemplate(grassGltf.scene.clone(true), game.renderer), .42);

    const parent = game.world.decor;
    const random = seededRandom();
    const high = game.quality === 'high';

    const pineCount = high ? 18 : 10;
    for (let i = 0; i < pineCount; i++) {
      const angle = (i / pineCount) * Math.PI * 2 + (random() - .5) * .17;
      const radius = 22.2 + random() * 6.2;
      if (Math.abs(Math.sin(angle)) < .12 && Math.cos(angle) > .25) continue;
      const instance = placeClone(
        parent, pine,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        .82 + random() * .48,
        random() * Math.PI * 2,
        'pine',
        .008 + random() * .012
      );
      // Only foreground/near-shrine pines need expensive dynamic shadows.
      let shadowEnabled = i < (high ? 8 : 4);
      instance.traverse(node => { if (node.isMesh) node.castShadow = shadowEnabled; });
      manager.instances.push(instance);
    }

    const bushCount = high ? 20 : 11;
    for (let i = 0; i < bushCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 6.5 + random() * 15.5;
      const instance = placeClone(
        parent, bush,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        .62 + random() * .55,
        random() * Math.PI * 2,
        'bush',
        .012 + random() * .01
      );
      instance.traverse(node => { if (node.isMesh) node.castShadow = i < 5 && high; });
      manager.instances.push(instance);
    }

    const fernCount = high ? 28 : 14;
    for (let i = 0; i < fernCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 4.2 + random() * 19.5;
      manager.instances.push(placeClone(
        parent, fern,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        .58 + random() * .55,
        random() * Math.PI * 2,
        'fern',
        .02 + random() * .018
      ));
    }

    const grassCount = high ? 36 : 18;
    for (let i = 0; i < grassCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 3.2 + random() * 20.5;
      manager.instances.push(placeClone(
        parent, grass,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        .55 + random() * .8,
        random() * Math.PI * 2,
        'grass',
        .025 + random() * .025
      ));
    }

    manager.count = manager.instances.length;
    manager.ready = true;

    const originalWorldUpdate = game.world.update.bind(game.world);
    game.world.update = dt => {
      originalWorldUpdate(dt);
      manager.time += dt;
      for (const item of manager.instances) {
        const frequency = item.userData.kind === 'pine' ? .72 : 1.18;
        item.rotation.z = item.userData.baseRotationZ + Math.sin(manager.time * frequency + item.userData.phase) * item.userData.sway;
      }
    };
  } catch (error) {
    manager.failures.push(String(error));
    console.error('Could not install stylized nature asset layer; procedural foliage remains available.', error);
  }

  return manager;
}
