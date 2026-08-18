import * as THREE from 'three';
import { Player } from './Player';

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });

export class Enemy {
  readonly group = new THREE.Group();
  readonly maxHp: number;
  hp: number;
  alive = true;
  armorClass = 12;
  respawnTimer = 0;
  private attackCooldown = 0;
  private hurtFlash = 0;
  private wanderAngle: number;
  private home: THREE.Vector3;
  private bodyMaterial: THREE.MeshStandardMaterial;
  private healthBarFill: THREE.Mesh;

  constructor(scene: THREE.Scene, position: THREE.Vector3, readonly id: number) {
    this.maxHp = 22 + id * 2;
    this.hp = this.maxHp;
    this.home = position.clone();
    this.wanderAngle = id * 1.9;
    this.group.position.copy(position);
    scene.add(this.group);

    this.bodyMaterial = mat(id % 2 ? 0x7cb856 : 0x71a94e);
    this.buildMesh();
    this.healthBarFill = this.group.getObjectByName('health-fill') as THREE.Mesh;
  }

  update(dt: number, player: Player, time: number): number {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return 0;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.bodyMaterial.emissive.setHex(this.hurtFlash > 0 ? 0x5f1717 : 0x000000);
    this.bodyMaterial.emissiveIntensity = this.hurtFlash > 0 ? 1.4 : 0;

    const toPlayer = player.group.position.clone().sub(this.group.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const speed = distance < 7.5 ? 2.7 : 0.7;
    const direction = new THREE.Vector3();

    if (distance < 7.5) {
      direction.copy(toPlayer).normalize();
    } else {
      this.wanderAngle += dt * (0.35 + this.id * 0.03);
      const wanderTarget = this.home.clone().add(new THREE.Vector3(Math.cos(this.wanderAngle) * 2.3, 0, Math.sin(this.wanderAngle) * 2.3));
      direction.copy(wanderTarget.sub(this.group.position)).normalize();
    }

    if (distance > 1.55) {
      this.group.position.addScaledVector(direction, speed * dt);
      this.group.rotation.y = Math.atan2(direction.x, direction.z);
    }

    const body = this.group.getObjectByName('goblin-body');
    if (body) body.position.y = 0.86 + Math.sin(time * 5.2 + this.id) * 0.06;

    if (distance < 1.72 && this.attackCooldown <= 0) {
      this.attackCooldown = 1.35;
      return 7 + this.id % 3;
    }
    return 0;
  }

  takeDamage(amount: number, knockDirection: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtFlash = 0.12;
    this.group.position.addScaledVector(knockDirection, 0.42);
    this.updateHealthBar();
    if (this.hp > 0) return false;
    this.die();
    return true;
  }

  distanceTo(position: THREE.Vector3): number {
    return this.group.position.distanceTo(position);
  }

  private die(): void {
    this.alive = false;
    this.respawnTimer = 8 + this.id * 0.8;
    this.group.visible = false;
  }

  private respawn(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.group.position.copy(this.home);
    this.group.visible = true;
    this.updateHealthBar();
  }

  private updateHealthBar(): void {
    const ratio = this.hp / this.maxHp;
    this.healthBarFill.scale.x = Math.max(0.001, ratio);
    this.healthBarFill.position.x = -0.61 * (1 - ratio);
    this.healthBarFill.visible = ratio < 0.999;
    const back = this.group.getObjectByName('health-back');
    if (back) back.visible = ratio < 0.999;
  }

  private buildMesh(): void {
    const body = new THREE.Group();
    body.name = 'goblin-body';
    body.position.y = 0.86;
    this.group.add(body);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 9), this.bodyMaterial);
    torso.scale.set(0.9, 1.05, 0.82);
    torso.castShadow = true;
    body.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), this.bodyMaterial);
    head.position.y = 0.63;
    head.scale.set(1.12, 0.88, 0.95);
    head.castShadow = true;
    body.add(head);

    const earGeo = new THREE.ConeGeometry(0.19, 0.6, 5);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, this.bodyMaterial);
      ear.position.set(side * 0.46, 0.66, 0);
      ear.rotation.z = side * -Math.PI / 2;
      ear.castShadow = true;
      body.add(ear);
    }

    const eyeMat = mat(0x2b1b20);
    for (const x of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), eyeMat);
      eye.position.set(x, 0.69, 0.43);
      body.add(eye);
    }

    const tunic = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.72, 7), mat(this.id % 2 ? 0x8a4e51 : 0x5a4c7c));
    tunic.position.y = -0.18;
    tunic.rotation.y = 0.35;
    tunic.castShadow = true;
    body.add(tunic);

    const barBack = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.11), new THREE.MeshBasicMaterial({ color: 0x2a1f28, depthTest: false }));
    barBack.name = 'health-back';
    barBack.position.set(0, 1.62, 0);
    barBack.renderOrder = 10;
    barBack.visible = false;
    this.group.add(barBack);

    const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.065), new THREE.MeshBasicMaterial({ color: 0xff745f, depthTest: false }));
    barFill.name = 'health-fill';
    barFill.position.set(0, 1.62, 0.01);
    barFill.renderOrder = 11;
    barFill.visible = false;
    this.group.add(barFill);
  }
}
