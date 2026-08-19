import * as THREE from 'three';

const V = THREE.Vector3;
const C = THREE.Color;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

function seededRandom(seed = 0x4D41504C) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function standard(color, roughness = .9, metalness = 0, emissive = 0, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive, emissiveIntensity,
    flatShading: true,
  });
}

function markShadowTree(root, cast = true, receive = true) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = cast;
    node.receiveShadow = receive;
  });
  return root;
}

function makeRadialTexture(inner = 'rgba(0,0,0,.72)', outer = 'rgba(0,0,0,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, inner);
  g.addColorStop(.42, 'rgba(0,0,0,.34)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class ShowcasePass {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.quality = game.quality;
    this.time = 0;
    this.random = seededRandom();
    this.root = new THREE.Group();
    this.root.name = 'Showcase_Environment_Pass';
    this.world.decor.add(this.root);
    this.water = null;
    this.waterUniforms = null;
    this.foam = [];
    this.swayGroups = [];
    this.dynamicShadows = new Map();
    this.shadowTexture = makeRadialTexture();
    this.silhouetteStyled = new WeakSet();
    this.bossPresentationActive = false;
    this.bossPresentationTime = 0;
    this.bossPresentationDuration = 2.65;
    this.bossPresentationBoss = null;
    this.cinematicLight = null;

    this._upgradeRenderer();
    this._buildTerrainComposition();
    this._buildStreamAndBridge();
    this._buildForegroundDetail();
    this._installContactShadows();
    this._upgradeCombatVfx();
    this._upgradeBossPresentation();
    this._upgradeUiMotion();
    this._hookUpdate();
  }

  _upgradeRenderer() {
    const renderer = this.game.renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMappingExposure = .98;

    let key = null;
    this.scene.traverse(object => {
      if (object.isDirectionalLight && object.castShadow && (!key || object.intensity > key.intensity)) key = object;
    });
    if (key) {
      key.shadow.mapSize.set(this.quality === 'high' ? 3072 : 1536, this.quality === 'high' ? 3072 : 1536);
      key.shadow.bias = -.00018;
      key.shadow.normalBias = .025;
      const cam = key.shadow.camera;
      cam.left = -25; cam.right = 25; cam.top = 25; cam.bottom = -25;
      key.shadow.needsUpdate = true;
    }

    const rim = new THREE.DirectionalLight(0x78cdbb, .5);
    rim.position.set(12, 8, -18);
    this.scene.add(rim);
    this.rimLight = rim;
  }

  _buildTerrainComposition() {
    const rock = standard(0x4b5b55, .98);
    const rockDark = standard(0x344943, 1);
    const moss = standard(0x496846, .98);
    const dirt = standard(0x645943, 1);
    const random = this.random;

    const shelves = [
      { a0: -.05, a1: .62, r: 30, y: 3.0, count: 8 },
      { a0: .73, a1: 1.38, r: 33, y: 5.0, count: 9 },
      { a0: 1.58, a1: 2.34, r: 31, y: 3.8, count: 10 },
      { a0: 2.55, a1: 3.28, r: 34, y: 6.2, count: 9 },
      { a0: 3.48, a1: 4.18, r: 31, y: 4.0, count: 9 },
      { a0: 4.45, a1: 5.14, r: 35, y: 6.8, count: 8 },
      { a0: 5.35, a1: 6.12, r: 31.5, y: 4.7, count: 9 },
    ];

    shelves.forEach((shelf, shelfIndex) => {
      for (let i = 0; i < shelf.count; i++) {
        const p = shelf.count === 1 ? .5 : i / (shelf.count - 1);
        const a = THREE.MathUtils.lerp(shelf.a0, shelf.a1, p) + (random() - .5) * .055;
        const r = shelf.r + (random() - .5) * 2.2;
        const height = shelf.y * (.78 + random() * .38);
        const radius = 3.5 + random() * 2.8;
        const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), i % 4 ? rock : rockDark);
        cliff.name = 'Showcase_Cliff';
        cliff.position.set(Math.cos(a) * r, height * .42 - 1.15, Math.sin(a) * r);
        cliff.scale.set(.95 + random() * .55, height / (radius * 1.65), .75 + random() * .55);
        cliff.rotation.set((random() - .5) * .2, random() * TAU, (random() - .5) * .17);
        cliff.castShadow = shelfIndex % 2 === 0 && this.quality === 'high';
        cliff.receiveShadow = true;
        this.root.add(cliff);

        if (i % 2 === 0) {
          const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * .7, 1), moss);
          cap.position.copy(cliff.position).add(new V(0, height * .48, 0));
          cap.scale.set(cliff.scale.x * 1.12, .22 + random() * .12, cliff.scale.z * 1.12);
          cap.rotation.y = random() * TAU;
          cap.receiveShadow = true;
          this.root.add(cap);
        }
      }
    });

    const terraces = [
      [-19, -16, 5.8, 1.1], [-15, 18, 5.0, .7], [17, 15, 6.2, .95], [20, -10, 5.4, .75],
      [-22, 3, 4.2, .55], [22, 5, 4.5, .6],
    ];
    for (const [x, z, radius, h] of terraces) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * .86, radius, h, 9), dirt);
      base.position.set(x, h / 2 - .02, z);
      base.receiveShadow = true;
      base.castShadow = this.quality === 'high';
      this.root.add(base);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * .88, radius * .9, .18, 9), moss);
      top.position.set(x, h + .03, z);
      top.receiveShadow = true;
      this.root.add(top);
      for (let j = 0; j < 4; j++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.55 + random() * .7, 0), rock);
        const angle = j / 4 * TAU + random() * .6;
        stone.position.set(x + Math.cos(angle) * radius * .72, .35 + h * .55, z + Math.sin(angle) * radius * .72);
        stone.scale.set(1.25, .75 + random() * .8, .85);
        stone.rotation.set(random(), random() * TAU, random());
        stone.castShadow = true;
        stone.receiveShadow = true;
        this.root.add(stone);
      }
    }

    const mountainMat = standard(0x354b49, 1);
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * TAU + .18;
      const r = 62 + random() * 20;
      const h = 13 + random() * 14;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(9 + random() * 7, h, 5), mountainMat);
      mountain.position.set(Math.cos(a) * r, h / 2 - 3.4, Math.sin(a) * r);
      mountain.rotation.y = random() * TAU;
      mountain.scale.x = .72 + random() * .55;
      mountain.receiveShadow = true;
      this.root.add(mountain);
    }
  }

  _buildStreamAndBridge() {
    const points = [
      new V(-31, .045, 12), new V(-25, .045, 9), new V(-20, .045, 6.5), new V(-16.5, .045, 2.5),
      new V(-15.5, .045, -2.0), new V(-18, .045, -7.5), new V(-23, .045, -12), new V(-31, .045, -15),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const segments = this.quality === 'high' ? 72 : 42;
    const width = 2.55;
    const positions = [];
    const uvs = [];
    const indices = [];
    const center = new V();
    const tangent = new V();
    const side = new V();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      curve.getPointAt(t, center);
      curve.getTangentAt(t, tangent).setY(0).normalize();
      side.set(-tangent.z, 0, tangent.x);
      for (const s of [-1, 1]) {
        positions.push(center.x + side.x * width * s, center.y, center.z + side.z * width * s);
        uvs.push(t * 7.5, s < 0 ? 0 : 1);
      }
      if (i < segments) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, c, b, c, d, b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    this.waterUniforms = {
      uTime: { value: 0 },
      uDeep: { value: new C(0x163f4a) },
      uShallow: { value: new C(0x4a9d90) },
      uSun: { value: new C(0xcde8ce) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main(){
          vUv=uv;
          vec3 p=position;
          float wave=sin(p.x*1.7 + uTime*2.2)*.035 + sin(p.z*2.9-uTime*1.45)*.022;
          p.y += wave;
          vWave=wave;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSun;
        varying vec2 vUv;
        varying float vWave;
        void main(){
          float edge=smoothstep(0.0,.2,vUv.y)*smoothstep(1.0,.8,vUv.y);
          float flow=sin(vUv.x*12.0-uTime*4.0+sin(vUv.x*2.5)*2.0);
          float ripple=sin(vUv.x*28.0+vUv.y*9.0-uTime*5.2)*.5+.5;
          float sparkle=pow(max(0.0,flow*.5+.5),18.0)*(.25+.75*ripple);
          vec3 col=mix(uDeep,uShallow,.38+.34*edge+.18*vWave*10.0);
          col += uSun*sparkle*.42;
          float alpha=.78 + sparkle*.12;
          gl_FragColor=vec4(col,alpha);
        }
      `,
    });
    this.water = new THREE.Mesh(geometry, material);
    this.water.name = 'Showcase_Stream_Water';
    this.water.renderOrder = 2;
    this.root.add(this.water);

    const rockMat = standard(0x52655f, .94);
    const mossMat = standard(0x3f6950, .98);
    for (let i = 0; i <= 36; i++) {
      const t = i / 36;
      curve.getPointAt(t, center);
      curve.getTangentAt(t, tangent).setY(0).normalize();
      side.set(-tangent.z, 0, tangent.x);
      for (const s of [-1, 1]) {
        const jitter = (this.random() - .5) * .55;
        const bank = center.clone().addScaledVector(side, s * (width + .2 + this.random() * .75)).addScaledVector(tangent, jitter);
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.18 + this.random() * .34, 0), i % 5 ? rockMat : mossMat);
        stone.position.copy(bank).setY(.08 + this.random() * .08);
        stone.scale.set(1.3 + this.random(), .45 + this.random() * .45, .75 + this.random() * .8);
        stone.rotation.set(this.random(), this.random() * TAU, this.random());
        stone.castShadow = i % 3 === 0;
        stone.receiveShadow = true;
        this.root.add(stone);
      }
    }

    const foamMat = new THREE.MeshBasicMaterial({ color: 0xd6f4e5, transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 18; i++) {
      const t = (i + .35) / 18;
      curve.getPointAt(t, center);
      const foam = new THREE.Mesh(new THREE.RingGeometry(.22, .28, 12, 1, 0, Math.PI * (1.2 + this.random() * .6)), foamMat.clone());
      foam.rotation.x = -Math.PI / 2;
      foam.rotation.z = this.random() * TAU;
      foam.position.copy(center).add(new V((this.random() - .5) * 2.6, .055, (this.random() - .5) * 1.6));
      foam.userData.phase = this.random() * TAU;
      this.root.add(foam);
      this.foam.push(foam);
    }

    this._buildBridge(new V(-16.0, .08, 1.3), -.24);
  }

  _buildBridge(position, rotationY) {
    const bridge = new THREE.Group();
    bridge.name = 'Showcase_Hero_Bridge';
    bridge.position.copy(position);
    bridge.rotation.y = rotationY;

    const wood = standard(0x73553b, .82);
    const woodDark = standard(0x493b31, .94);
    const rope = standard(0x9c805a, .96);
    const stone = standard(0x5d6b66, .96);

    for (const z of [-3.25, 3.25]) {
      for (const x of [-1.25, 1.25]) {
        const pier = new THREE.Mesh(new THREE.DodecahedronGeometry(.82, 0), stone);
        pier.position.set(x, .15, z);
        pier.scale.set(1.15, .75, 1.3);
        pier.castShadow = true; pier.receiveShadow = true;
        bridge.add(pier);
      }
    }

    const plankCount = 18;
    for (let i = 0; i < plankCount; i++) {
      const t = i / (plankCount - 1);
      const z = THREE.MathUtils.lerp(-3.25, 3.25, t);
      const arch = Math.sin(t * Math.PI) * .45;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.25, .16, .34), wood);
      plank.position.set((this.random() - .5) * .06, .38 + arch, z);
      plank.rotation.y = (this.random() - .5) * .018;
      plank.rotation.z = (this.random() - .5) * .016;
      plank.castShadow = true; plank.receiveShadow = true;
      bridge.add(plank);
    }

    for (const x of [-1.58, 1.58]) {
      for (const z of [-3.05, -1.55, 0, 1.55, 3.05]) {
        const t = (z + 3.25) / 6.5;
        const arch = Math.sin(t * Math.PI) * .45;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.095, .12, 1.32, 7), woodDark);
        post.position.set(x, 1.02 + arch, z);
        post.castShadow = true;
        bridge.add(post);
      }
      const curve = new THREE.CatmullRomCurve3([
        new V(x, 1.45, -3.05), new V(x, 1.62, -1.55), new V(x, 1.85, 0), new V(x, 1.62, 1.55), new V(x, 1.45, 3.05),
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .035, 6, false), rope);
      cable.castShadow = true;
      bridge.add(cable);
    }

    markShadowTree(bridge, true, true);
    this.root.add(bridge);
  }

  _buildForegroundDetail() {
    const random = this.random;
    const reedMat = standard(0x52794d, .96);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xd4a973, roughness: .75, emissive: 0x5c3b25, emissiveIntensity: .08, flatShading: true });

    for (let i = 0; i < (this.quality === 'high' ? 34 : 18); i++) {
      const side = i % 2 ? -1 : 1;
      const z = 11 - (i / 34) * 25 + (random() - .5) * 3;
      const x = -19 + side * (2.2 + random() * 2.7) + Math.sin(z * .18) * 2.5;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = random() * TAU;
      g.userData.baseZ = 0;
      g.userData.phase = random() * TAU;
      g.userData.sway = .028 + random() * .04;
      const count = 3 + Math.floor(random() * 4);
      for (let j = 0; j < count; j++) {
        const h = .45 + random() * .65;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(.025 + random() * .025, h, 4), reedMat);
        blade.position.set((random() - .5) * .38, h / 2, (random() - .5) * .35);
        blade.rotation.z = (random() - .5) * .24;
        g.add(blade);
        if (j === 0 && i % 3 === 0) {
          const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(.055, 0), flowerMat);
          bloom.position.set(blade.position.x, h + .03, blade.position.z);
          g.add(bloom);
        }
      }
      this.root.add(g);
      this.swayGroups.push(g);
    }

    const moteGeo = new THREE.SphereGeometry(.025, 5, 4);
    for (let i = 0; i < (this.quality === 'high' ? 32 : 14); i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 5 ? 0x9de1c7 : 0xffd284, transparent: true, opacity: .22 + random() * .35, blending: THREE.AdditiveBlending, depthWrite: false });
      const mote = new THREE.Mesh(moteGeo, mat);
      mote.position.set(-20 + random() * 11, .55 + random() * 4.2, -7 + random() * 19);
      mote.userData.showcaseMote = true;
      mote.userData.base = mote.position.clone();
      mote.userData.phase = random() * TAU;
      mote.userData.speed = .35 + random() * .7;
      this.root.add(mote);
    }
  }

  _installContactShadows() {
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: .52, depthWrite: false, color: 0x17221e });
    this._ensureShadow(this.game.player.root, 1.25, .42, 'player');
  }

  _ensureShadow(target, scale, opacity, key) {
    if (!target || this.dynamicShadows.has(target)) return;
    const mat = this.shadowMaterial.clone();
    mat.opacity = opacity;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(scale * 2, scale * 2), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = .018;
    plane.renderOrder = 1;
    plane.userData.baseScale = scale;
    plane.userData.shadowKey = key;
    this.world.decor.add(plane);
    this.dynamicShadows.set(target, plane);
  }

  _styleEnemySilhouette(enemy) {
    if (!enemy || enemy.remove || !enemy.assetVisual || this.silhouetteStyled.has(enemy)) return;
    this.silhouetteStyled.add(enemy);
    const kind = enemy.assetKind || (enemy.isBoss ? 'demon' : 'skeleton');
    const group = new THREE.Group();
    group.name = `Showcase_Silhouette_${kind}`;
    group.userData.showcaseAccessory = true;

    if (kind === 'skeleton') {
      const iron = standard(0x2f3735, .7, .25);
      const ember = standard(0x6e7e49, .45, .08, 0x314a28, .36);
      for (const s of [-1, 1]) {
        const shoulder = new THREE.Mesh(new THREE.ConeGeometry(.18, .65, 5), iron);
        shoulder.position.set(s * .48, 1.14, .02);
        shoulder.rotation.z = -s * 1.17;
        group.add(shoulder);
      }
      const crest = new THREE.Mesh(new THREE.ConeGeometry(.11, .8, 5), ember);
      crest.position.set(0, 1.72, -.08);
      group.add(crest);
    } else if (kind === 'ghost') {
      const ghostMat = new THREE.MeshBasicMaterial({ color: 0x83f2d5, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(.58, .025, 6, 32), ghostMat);
      halo.position.y = 1.52; halo.rotation.x = Math.PI / 2;
      group.add(halo);
      for (let i = 0; i < 3; i++) {
        const ribbon = new THREE.Mesh(new THREE.TorusGeometry(.34 + i * .13, .015, 5, 26, Math.PI * 1.25), ghostMat.clone());
        ribbon.position.y = .35 + i * .18;
        ribbon.rotation.set(Math.PI / 2, i * 1.5, i * .8);
        group.add(ribbon);
      }
    } else if (kind === 'bat') {
      const thorn = standard(0x303438, .88, .04, 0x2a244f, .18);
      for (const s of [-1, 1]) {
        const wingTip = new THREE.Mesh(new THREE.ConeGeometry(.12, .95, 5), thorn);
        wingTip.position.set(s * .82, 1.05, -.18);
        wingTip.rotation.z = -s * 1.13;
        group.add(wingTip);
      }
    } else if (kind === 'demon') {
      const thorn = standard(0x261f1d, .82, .08, 0x4b1714, .22);
      for (let i = -2; i <= 2; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(.12 + Math.abs(i) * .025, 1.25 - Math.abs(i) * .1, 6), thorn);
        spike.position.set(i * .42, 2.25 + (2 - Math.abs(i)) * .24, -.48);
        spike.rotation.x = -.55;
        spike.rotation.z = i * .08;
        group.add(spike);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(.72, .045, 7, 40), new THREE.MeshBasicMaterial({ color: 0xff6c4e, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false }));
      crown.position.y = 3.35; crown.rotation.x = Math.PI / 2;
      group.add(crown);
    }

    markShadowTree(group, true, true);
    enemy.root.add(group);
    this._ensureShadow(enemy.root, enemy.isBoss ? 1.95 : .83, enemy.isBoss ? .56 : .42, kind);
  }

  _upgradeCombatVfx() {
    const game = this.game;
    const baseSlash = game.fx.slash.bind(game.fx);
    game.fx.slash = (position, rotationY, combo = 0) => {
      baseSlash(position, rotationY, combo);
      this._spawnSwordRibbon(position, rotationY, combo);
    };

    const baseCast = game._castSpell.bind(game);
    game._castSpell = () => {
      const origin = game.player.position.clone();
      baseCast();
      this._spawnSpellSigil(origin, game.player.facing);
    };

    const baseMelee = game._resolveMelee.bind(game);
    game._resolveMelee = () => {
      const before = game.enemies.map(e => ({ e, hp: e.hp }));
      const combo = game.player.comboIndex;
      const origin = game.player.position.clone();
      baseMelee();
      for (const item of before) {
        if (item.e.hp < item.hp) this._spawnImpact(item.e.position.clone().add(new V(0, item.e.isBoss ? 1.8 : .9, 0)), combo, item.e.isBoss);
      }
      if (before.some(item => item.e.hp < item.hp) && combo === 2) this._spawnGroundFracture(origin, game.player.facing);
    };
  }

  _spawnSwordRibbon(position, rotationY, combo) {
    const points = [];
    const radius = combo === 2 ? 2.0 : 1.55;
    const start = rotationY - 1.25;
    const sweep = combo === 2 ? 2.55 : 2.1;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = start + sweep * t;
      points.push(new V(Math.sin(a) * radius, 1.05 + Math.sin(t * Math.PI) * .5, Math.cos(a) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 22, combo === 2 ? .065 : .045, 5, false);
    const color = combo === 2 ? 0xffd07a : (combo === 1 ? 0xaaf6da : 0xe1fff0);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false });
    const ribbon = new THREE.Mesh(tube, material);
    ribbon.position.copy(position);
    this.game.fx.add(ribbon, .19, (effect, dt, t) => {
      effect.obj.material.opacity = (1 - t) * .78;
      effect.obj.scale.multiplyScalar(1 + dt * 2.1);
    });

    const light = new THREE.PointLight(color, combo === 2 ? 1.8 : .9, 3.4, 2.2);
    light.position.copy(position).add(new V(0, 1.2, 0));
    this.game.fx.add(light, .12, (effect, dt, t) => { effect.obj.intensity = (1 - t) * (combo === 2 ? 1.8 : .9); });
  }

  _spawnImpact(position, combo, boss) {
    const color = combo === 2 ? 0xffd37c : 0xb8f2d4;
    const flashMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const flash = new THREE.Mesh(new THREE.OctahedronGeometry(boss ? .36 : .23, 0), flashMat);
    flash.position.copy(position);
    this.game.fx.add(flash, .16, (effect, dt, t) => {
      effect.obj.scale.setScalar(.6 + t * (boss ? 4.4 : 3.2));
      effect.obj.material.opacity = Math.pow(1 - t, 2);
      effect.obj.rotation.y += dt * 10;
    });
    this.game.fx.burst(position, color, boss ? 22 : 13, boss ? 6.2 : 4.8, boss ? 1.15 : .8);
    this.game.fx.ring(position.clone().setY(.06), color, .1, boss ? 2.6 : 1.55, .24);
  }

  _spawnGroundFracture(position, facing) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf1c475, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(.035, .65 + this.random() * .8), mat.clone());
      const angle = facing + (this.random() - .5) * 1.6;
      const r = .4 + this.random() * 1.1;
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = -angle;
      line.position.copy(position).add(new V(Math.sin(angle) * r, .025, Math.cos(angle) * r));
      this.game.fx.add(line, .38, (effect, dt, t) => { effect.obj.material.opacity = (1 - t) * .4; effect.obj.scale.y = 1 + t * .8; });
    }
  }

  _spawnSpellSigil(position, facing) {
    const center = position.clone().add(new V(0, .07, 0));
    const colors = [0xffa76b, 0xffd486, 0x7ce7d0];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.48 + i * .24, .51 + i * .24, 36),
        new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: .55 - i * .08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(center);
      ring.rotation.z = i * .7;
      this.game.fx.add(ring, .62 + i * .1, (effect, dt, t) => {
        effect.obj.rotation.z += dt * (i % 2 ? -3.2 : 3.8);
        effect.obj.scale.setScalar(.55 + smoothstep(t, 0, 1) * .8);
        effect.obj.material.opacity = Math.sin(Math.PI * t) * (.52 - i * .08);
      });
    }
    const fwd = new V(Math.sin(facing), 0, Math.cos(facing));
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffb26d : 0x8be6d2, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.position.copy(center).add(new V(Math.cos(a) * .7, .12 + (i % 4) * .05, Math.sin(a) * .7)).addScaledVector(fwd, .2);
      const phase = a;
      this.game.fx.add(orb, .55 + this.random() * .25, (effect, dt, t) => {
        effect.obj.position.y += dt * (1.1 + i * .018);
        effect.obj.position.x += Math.cos(phase + t * 5) * dt * .3;
        effect.obj.position.z += Math.sin(phase + t * 5) * dt * .3;
        effect.obj.material.opacity = (1 - t) * .78;
      });
    }
  }

  _upgradeBossPresentation() {
    const game = this.game;
    const baseSpawnBoss = game._spawnBoss.bind(game);
    game._spawnBoss = () => {
      baseSpawnBoss();
      if (!game.boss) return;
      this.bossPresentationActive = true;
      this.bossPresentationTime = 0;
      this.bossPresentationBoss = game.boss;
      document.documentElement.classList.add('boss-cinematic');
      const title = document.querySelector('#showcase-boss-title');
      if (title) {
        title.querySelector('strong').textContent = 'THORNMAW';
        title.querySelector('span').textContent = 'OATH-SWORN WARDEN';
      }
      const light = new THREE.PointLight(0xff653f, 0, 12, 1.8);
      light.position.copy(game.boss.position).add(new V(0, 2.0, 1.0));
      this.scene.add(light);
      this.cinematicLight = light;
      this._bossShockwave(game.boss.position);
      setTimeout(() => document.documentElement.classList.remove('boss-cinematic'), this.bossPresentationDuration * 1000);
    };
  }

  _bossShockwave(position) {
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x6f3a31, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.35 + this.random() * .25, 1), smokeMat.clone());
      puff.position.copy(position).add(new V(Math.cos(a) * 1.1, .3 + this.random() * .45, Math.sin(a) * 1.1));
      const velocity = new V(Math.cos(a) * (1.7 + this.random()), .25 + this.random() * .5, Math.sin(a) * (1.7 + this.random()));
      this.game.fx.add(puff, .85 + this.random() * .3, (effect, dt, t) => {
        effect.obj.position.addScaledVector(velocity, dt);
        effect.obj.scale.multiplyScalar(1 + dt * 1.2);
        effect.obj.material.opacity = (1 - t) * .2;
      });
    }
    this.game.fx.ring(position, 0xff704d, .3, 7.8, .9);
    this.game.fx.ring(position, 0xffc17a, .15, 4.5, .55);
  }

  _upgradeUiMotion() {
    if (!document.querySelector('#showcase-cinematic-bars')) {
      const bars = document.createElement('div');
      bars.id = 'showcase-cinematic-bars';
      bars.innerHTML = '<i></i><i></i>';
      document.body.appendChild(bars);
    }
    if (!document.querySelector('#showcase-boss-title')) {
      const title = document.createElement('div');
      title.id = 'showcase-boss-title';
      title.innerHTML = '<span>OATH-SWORN WARDEN</span><strong>THORNMAW</strong><em></em>';
      document.body.appendChild(title);
    }

    const game = this.game;
    const baseCombo = game._addCombatCombo.bind(game);
    game._addCombatCombo = () => {
      baseCombo();
      game.ui.combo.classList.remove('showcase-pop');
      void game.ui.combo.offsetWidth;
      game.ui.combo.classList.add('showcase-pop');
    };
    const baseToast = game.toast.bind(game);
    game.toast = (text, duration = 1.1) => {
      baseToast(text, duration);
      game.ui.toast.classList.remove('showcase-toast-in');
      void game.ui.toast.offsetWidth;
      game.ui.toast.classList.add('showcase-toast-in');
    };
  }

  _hookUpdate() {
    const baseWorldUpdate = this.world.update.bind(this.world);
    this.world.update = dt => {
      baseWorldUpdate(dt);
      this.update(dt);
    };
  }

  update(dt) {
    this.time += dt;
    if (this.waterUniforms) this.waterUniforms.uTime.value = this.time;

    for (const foam of this.foam) {
      const p = foam.userData.phase;
      foam.material.opacity = .16 + (Math.sin(this.time * 2.8 + p) * .5 + .5) * .18;
      foam.rotation.z += dt * .12;
      const pulse = 1 + Math.sin(this.time * 2 + p) * .08;
      foam.scale.setScalar(pulse);
    }

    const gust = .48 + .52 * (Math.sin(this.time * .31) * .5 + .5);
    for (const g of this.swayGroups) {
      g.rotation.z = g.userData.baseZ + Math.sin(this.time * 1.05 + g.userData.phase) * g.userData.sway * (1 + gust * .75)
        + Math.sin(this.time * 2.8 + g.userData.phase * 1.7) * g.userData.sway * .18;
    }
    const nature = this.game.natureAssetManager;
    if (nature?.instances) {
      for (let i = 0; i < nature.instances.length; i++) {
        const item = nature.instances[i];
        if (item.userData.showcaseWind) continue;
        item.userData.showcaseWind = true;
        item.userData.showcaseBaseZ = item.userData.baseRotationZ ?? item.rotation.z;
      }
      for (let i = 0; i < nature.instances.length; i++) {
        const item = nature.instances[i];
        const amp = item.userData.kind === 'pine' ? .007 : item.userData.kind === 'grass' ? .025 : .016;
        const phase = item.userData.phase || i;
        item.rotation.z += Math.sin(this.time * 2.35 + phase * 1.7) * amp * gust;
      }
    }

    this.root.traverse(object => {
      if (!object.userData.showcaseMote) return;
      const u = object.userData;
      object.position.x = u.base.x + Math.sin(this.time * u.speed + u.phase) * .42;
      object.position.y = u.base.y + Math.sin(this.time * u.speed * .73 + u.phase * 1.4) * .32;
      object.position.z = u.base.z + Math.cos(this.time * u.speed * .61 + u.phase) * .36;
      object.material.opacity = .18 + .34 * (Math.sin(this.time * 1.3 + u.phase) * .5 + .5);
    });

    for (const enemy of this.game.enemies) this._styleEnemySilhouette(enemy);
    this._ensureShadow(this.game.player.root, 1.25, .42, 'player');
    for (const [target, shadow] of this.dynamicShadows) {
      if (!target.parent || target.visible === false) {
        shadow.visible = false;
        continue;
      }
      shadow.visible = true;
      shadow.position.x = target.position.x;
      shadow.position.z = target.position.z;
      const lift = Math.max(0, target.position.y || 0);
      shadow.material.opacity = (shadow.userData.shadowKey === 'demon' ? .56 : .42) * clamp(1 - lift * .3, .25, 1);
    }

    if (this.bossPresentationActive) this._updateBossPresentation(dt);
  }

  _updateBossPresentation(dt) {
    const boss = this.bossPresentationBoss;
    if (!boss || boss.remove) {
      this.bossPresentationActive = false;
      return;
    }
    this.bossPresentationTime += dt;
    const t = clamp(this.bossPresentationTime / this.bossPresentationDuration, 0, 1);
    if (this.cinematicLight) {
      this.cinematicLight.position.copy(boss.position).add(new V(0, 2.0, 1));
      this.cinematicLight.intensity = Math.sin(Math.PI * clamp(t * 1.3, 0, 1)) * 5.2;
    }

    if (t > .18 && t < .52) {
      const pulse = 1 - Math.abs((t - .35) / .17);
      this.game.cameraShake = Math.max(this.game.cameraShake, Math.max(0, pulse) * .44);
    }

    if (t >= 1) {
      this.bossPresentationActive = false;
      if (this.cinematicLight) {
        this.scene.remove(this.cinematicLight);
        this.cinematicLight = null;
      }
    }
  }
}

export function installShowcasePass(game) {
  if (game.showcasePass) return game.showcasePass;
  const pass = new ShowcasePass(game);
  game.showcasePass = pass;
  return pass;
}
