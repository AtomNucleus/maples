import * as THREE from 'three';

const toon = (color: number, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });

export class World {
  readonly group = new THREE.Group();
  readonly portal = new THREE.Group();
  private portalRing: THREE.Mesh;
  private portalLight: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Sunken Grove';
    scene.add(this.group);

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(31, 34, 2.5, 64),
      toon(0x4f7d47),
    );
    ground.position.y = -1.25;
    ground.receiveShadow = true;
    this.group.add(ground);

    const innerGround = new THREE.Mesh(
      new THREE.CircleGeometry(28.8, 64),
      new THREE.MeshStandardMaterial({ color: 0x6c9a59, roughness: 1 }),
    );
    innerGround.rotation.x = -Math.PI / 2;
    innerGround.position.y = 0.012;
    innerGround.receiveShadow = true;
    this.group.add(innerGround);

    this.addPath();
    this.addTrees();
    this.addRuins();
    this.addRocks();
    this.addMushrooms();
    this.addPortal();

    this.portalRing = this.portal.children.find((child) => child.name === 'portal-ring') as THREE.Mesh;
    this.portalLight = this.portal.children.find((child) => child.name === 'portal-light') as THREE.PointLight;
  }

  update(time: number): void {
    const orb = this.portal.children.find((child) => child.name === 'portal-orb');
    if (orb) {
      orb.rotation.y = time * 0.65;
      orb.position.y = 2.65 + Math.sin(time * 2.2) * 0.12;
    }
  }

  setPortalActive(active: boolean): void {
    const material = this.portalRing.material as THREE.MeshStandardMaterial;
    material.emissive.setHex(active ? 0x69ffe2 : 0x152b27);
    material.emissiveIntensity = active ? 2.4 : 0.35;
    this.portalLight.color.setHex(active ? 0x66ffe3 : 0x5bb8a8);
    this.portalLight.intensity = active ? 8 : 1.8;
  }

  private addPath(): void {
    const material = toon(0xc6b684);
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const x = THREE.MathUtils.lerp(-2.5, 16, t) + Math.sin(t * Math.PI * 2) * 1.4;
      const z = THREE.MathUtils.lerp(19, -13, t);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.12, 7), material);
      stone.scale.set(1.25 + (i % 3) * 0.08, 1, 0.72 + (i % 2) * 0.12);
      stone.position.set(x, 0.07, z);
      stone.rotation.y = Math.sin(i * 1.7) * 0.5;
      stone.receiveShadow = true;
      this.group.add(stone);
    }
  }

  private addTrees(): void {
    const trunkMat = toon(0x765137);
    const leafMats = [toon(0x326447), toon(0x3f7b4f), toon(0x5b9252)];
    const placements = [
      [-22, -11, 1.1], [-19, 11, 0.9], [-12, -20, 1], [2, -24, 1.05], [19, -17, 1.15],
      [23, 1, 0.95], [19, 17, 1.1], [6, 24, 1], [-10, 23, 0.95], [-24, 3, 1.05],
      [-15, -7, 0.72], [13, 8, 0.75], [9, -14, 0.68],
    ] as const;

    placements.forEach(([x, z, scale], index) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      tree.rotation.y = index * 0.71;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, 4.2, 7), trunkMat);
      trunk.position.y = 2;
      trunk.castShadow = true;
      tree.add(trunk);

      for (let j = 0; j < 3; j++) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25 - j * 0.18, 1), leafMats[(index + j) % leafMats.length]);
        crown.position.set((j - 1) * 0.72, 4.7 + (j % 2) * 0.55, (j % 2 ? 0.55 : -0.25));
        crown.scale.y = 0.9;
        crown.castShadow = true;
        tree.add(crown);
      }
      this.group.add(tree);
    });
  }

  private addRuins(): void {
    const stoneMat = toon(0x9ea68d);
    const mossMat = toon(0x557b4b);

    for (const x of [-6.2, -2.2, 1.8]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 3.8 + (x + 6.2) * 0.17, 7), stoneMat);
      column.position.set(x, 1.8, -7.8);
      column.rotation.z = (x + 2.4) * 0.018;
      column.castShadow = true;
      column.receiveShadow = true;
      this.group.add(column);

      const moss = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.72, 0.32, 7), mossMat);
      moss.position.copy(column.position).add(new THREE.Vector3(0, 1.65, 0));
      moss.castShadow = true;
      this.group.add(moss);
    }

    const arch = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.8, 1.5), stoneMat);
    arch.position.set(-2.1, 4.25, -7.8);
    arch.rotation.z = -0.045;
    arch.castShadow = true;
    this.group.add(arch);
  }

  private addRocks(): void {
    const material = toon(0x758172);
    const coords = [[-14, 4], [-9, 12], [3, 13], [11, 16], [15, -2], [-4, -16], [7, -20], [-18, -15]];
    coords.forEach(([x, z], index) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + (index % 3) * 0.24, 0), material);
      rock.position.set(x, 0.6, z);
      rock.scale.y = 0.7;
      rock.rotation.set(index * 0.7, index * 0.4, 0.2);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    });
  }

  private addMushrooms(): void {
    const stem = toon(0xe4d6ae);
    const capMaterials = [toon(0xe76f51), toon(0xf4b65d), toon(0x8c75d6)];
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399;
      const radius = 8 + (i % 6) * 2.55;
      const group = new THREE.Group();
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      group.scale.setScalar(0.42 + (i % 4) * 0.08);

      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.82, 7), stem);
      stalk.position.y = 0.4;
      group.add(stalk);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMaterials[i % capMaterials.length]);
      cap.position.y = 0.78;
      cap.scale.y = 0.55;
      cap.castShadow = true;
      group.add(cap);
      this.group.add(group);
    }
  }

  private addPortal(): void {
    this.portal.position.set(17, 0, -12.5);
    this.group.add(this.portal);

    const steps = toon(0x8e9988);
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.45, 3.65 - i * 0.45, 0.38, 10), steps);
      step.position.y = i * 0.36;
      step.receiveShadow = true;
      step.castShadow = true;
      this.portal.add(step);
    }

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.24, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x5c8278, roughness: 0.5, emissive: 0x152b27, emissiveIntensity: 0.35 }),
    );
    ring.name = 'portal-ring';
    ring.position.y = 2.7;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    this.portal.add(ring);

    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.68, 2),
      new THREE.MeshStandardMaterial({ color: 0xa7fff0, roughness: 0.2, metalness: 0.05, emissive: 0x54dcc7, emissiveIntensity: 1.5 }),
    );
    orb.name = 'portal-orb';
    orb.position.y = 2.65;
    this.portal.add(orb);

    const light = new THREE.PointLight(0x5bb8a8, 1.8, 10, 2);
    light.name = 'portal-light';
    light.position.y = 2.8;
    this.portal.add(light);
  }
}
