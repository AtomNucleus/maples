import * as THREE from 'three';

function makeNoiseTexture(seed = 0x8f31a2c7, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  let s = seed | 0;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967295;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const broad = Math.sin(x * .19) * 7 + Math.cos(y * .16) * 6;
      const fine = (rand() - .5) * 28;
      const value = Math.max(96, Math.min(232, 164 + broad + fine));
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function fixWaterShader(pass) {
  const material = pass?.water?.material;
  if (!material?.isShaderMaterial) return;
  const unsafe = 'smoothstep(0.0,.2,vUv.y)*smoothstep(1.0,.8,vUv.y)';
  const safe = 'smoothstep(0.0,.2,vUv.y)*(1.0-smoothstep(.8,1.0,vUv.y))';
  if (material.fragmentShader.includes(unsafe)) {
    material.fragmentShader = material.fragmentShader.replace(unsafe, safe);
    material.needsUpdate = true;
  }
}

function addSurfaceDetail(game, pass) {
  if (!pass?.root) return;
  const detail = makeNoiseTexture();
  detail.anisotropy = Math.min(4, game.renderer.capabilities.getMaxAnisotropy?.() || 1);
  const touched = new Set();

  pass.root.traverse(node => {
    if (!node.isMesh || node === pass.water) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material?.isMeshStandardMaterial || touched.has(material)) continue;
      touched.add(material);
      if ((material.roughness ?? 0) >= .9) {
        material.bumpMap = detail;
        material.bumpScale = .028;
        material.roughnessMap = detail;
        material.needsUpdate = true;
      }
    }
  });

  pass.detailTexture = detail;
}

function tuneLowQuality(game, pass) {
  if (game.quality !== 'low') return;

  game.scene.traverse(node => {
    if (node.isDirectionalLight && node.castShadow) {
      node.shadow.mapSize.set(1024, 1024);
      node.shadow.needsUpdate = true;
    }
  });

  // Keep the same authored silhouette on mobile while trimming transparent overdraw.
  pass.foam?.forEach((foam, i) => { if (i % 2) foam.visible = false; });
  pass.root?.traverse(node => {
    if (!node.isMesh) return;
    if (node.userData?.showcaseMote && Math.abs(node.userData.phase || 0) % 2 > 1) node.visible = false;
    if (node.name === 'Showcase_Cliff') node.castShadow = false;
  });
}

function installNatureWindLayer(game) {
  let cancelled = false;
  let attempts = 0;
  const waitForNature = () => {
    if (cancelled) return;
    const manager = game.natureAssetManager;
    if (!manager?.ready) {
      if (attempts++ < 900) requestAnimationFrame(waitForNature);
      return;
    }

    const baseUpdate = game.world.update.bind(game.world);
    let t = 0;
    game.world.update = dt => {
      baseUpdate(dt);
      t += dt;
      const gust = .45 + .55 * (Math.sin(t * .37) * .5 + .5);
      for (let i = 0; i < manager.instances.length; i++) {
        const item = manager.instances[i];
        const kind = item.userData.kind;
        const phase = item.userData.phase || i * .73;
        const micro = kind === 'pine' ? .0045 : kind === 'grass' ? .017 : .010;
        item.rotation.z += Math.sin(t * 2.6 + phase * 1.9) * micro * gust;
        item.rotation.x += Math.sin(t * 1.55 + phase * 1.2) * micro * .18;
      }
    };
    game.showcaseNatureWindReady = true;
  };
  requestAnimationFrame(waitForNature);
  return () => { cancelled = true; };
}

export function installShowcaseQualityGate(game) {
  const pass = game.showcasePass;
  if (!pass || game.showcaseQualityGate) return game.showcaseQualityGate;

  fixWaterShader(pass);
  addSurfaceDetail(game, pass);
  tuneLowQuality(game, pass);
  const cancelNatureWind = installNatureWindLayer(game);

  const gate = {
    waterShaderSafe: true,
    surfaceDetail: Boolean(pass.detailTexture),
    cancelNatureWind,
  };
  game.showcaseQualityGate = gate;
  return gate;
}
