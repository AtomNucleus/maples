import * as THREE from 'three';

const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.03 });

export class Player {
  readonly group = new THREE.Group();
  readonly swordPivot = new THREE.Group();
  readonly radius = 0.65;
  maxHp = 100;
  hp = 100;
  level = 1;
  xp = 0;
  gold = 0;
  attackBonus = 5;
  armorClass = 15;
  attackCooldown = 0;
  attackAnim = 0;
  dodgeCooldown = 0;
  dodgeTimer = 0;
  private velocity = new THREE.Vector3();
  private facing = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    this.group.name = 'Warden';
    this.group.position.set(0, 0, 13);
    scene.add(this.group);
    this.buildMesh();
  }

  get forward(): THREE.Vector3 {
    return this.facing.clone();
  }

  update(dt: number, movement: THREE.Vector2, cameraYaw: number, sprint: boolean): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);

    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const desired = forward.multiplyScalar(movement.y).add(right.multiplyScalar(movement.x));
    if (desired.lengthSq() > 1) desired.normalize();

    const baseSpeed = sprint ? 7.2 : 5.1;
    const speed = this.dodgeTimer > 0 ? 12.2 : baseSpeed;
    const targetVelocity = desired.multiplyScalar(speed);
    const blend = 1 - Math.exp(-dt * (this.dodgeTimer > 0 ? 18 : 10));
    this.velocity.lerp(targetVelocity, blend);

    if (this.dodgeTimer > 0 && desired.lengthSq() < 0.01) {
      this.velocity.copy(this.facing).multiplyScalar(12.2);
    }

    this.group.position.addScaledVector(this.velocity, dt);
    const distance = Math.hypot(this.group.position.x, this.group.position.z);
    if (distance > 26.5) {
      const scale = 26.5 / distance;
      this.group.position.x *= scale;
      this.group.position.z *= scale;
    }
    this.group.position.y = 0;

    if (desired.lengthSq() > 0.03) {
      desired.normalize();
      this.facing.lerp(desired, 1 - Math.exp(-dt * 14)).normalize();
      const targetYaw = Math.atan2(this.facing.x, this.facing.z);
      this.group.rotation.y = this.lerpAngle(this.group.rotation.y, targetYaw, 1 - Math.exp(-dt * 13));
    }

    const moving = this.velocity.length();
    const body = this.group.getObjectByName('body-root');
    if (body) {
      body.position.y = 0.04 + Math.sin(performance.now() * 0.012 * Math.min(moving, 6)) * Math.min(moving / 90, 0.07);
      body.rotation.z = Math.sin(performance.now() * 0.009) * Math.min(moving / 100, 0.04);
    }

    if (this.attackAnim > 0) {
      const progress = 1 - this.attackAnim / 0.28;
      this.swordPivot.rotation.x = -0.8 + Math.sin(progress * Math.PI) * 1.95;
      this.swordPivot.rotation.z = -0.9 + progress * 1.8;
    } else {
      this.swordPivot.rotation.set(-0.45, 0, -0.55);
    }
  }

  canAttack(): boolean {
    return this.attackCooldown <= 0;
  }

  beginAttack(): void {
    this.attackCooldown = 0.47;
    this.attackAnim = 0.28;
  }

  tryDodge(): boolean {
    if (this.dodgeCooldown > 0) return false;
    this.dodgeCooldown = 1.05;
    this.dodgeTimer = 0.24;
    return true;
  }

  takeDamage(amount: number): void {
    if (this.dodgeTimer > 0.06) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  healFull(): void {
    this.hp = this.maxHp;
  }

  addXp(amount: number): boolean {
    this.xp += amount;
    const required = this.xpRequired();
    if (this.xp < required) return false;
    this.xp -= required;
    this.level += 1;
    this.maxHp += 16;
    this.hp = this.maxHp;
    this.attackBonus += 1;
    return true;
  }

  xpRequired(): number {
    return 90 + (this.level - 1) * 55;
  }

  private buildMesh(): void {
    const bodyRoot = new THREE.Group();
    bodyRoot.name = 'body-root';
    this.group.add(bodyRoot);

    const boots = material(0x332d3e);
    for (const x of [-0.27, 0.27]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.62), boots);
      foot.position.set(x, 0.18, 0.12);
      foot.castShadow = true;
      bodyRoot.add(foot);
    }

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.54, 0.72, 6, 12), material(0x315b74));
    torso.position.y = 1.13;
    torso.scale.z = 0.8;
    torso.castShadow = true;
    bodyRoot.add(torso);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 6, 14), material(0x7c5332));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.94;
    bodyRoot.add(belt);

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.3, 7, 1, true, 0, Math.PI * 1.25), material(0x764a8d));
    cloak.position.set(0, 1.1, -0.24);
    cloak.rotation.y = Math.PI * 0.37;
    cloak.castShadow = true;
    bodyRoot.add(cloak);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), material(0xf0c79d));
    head.position.y = 2.05;
    head.scale.set(0.95, 1.04, 0.92);
    head.castShadow = true;
    bodyRoot.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.59, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), material(0x2c2430));
    hair.position.y = 2.23;
    hair.scale.z = 0.95;
    hair.castShadow = true;
    bodyRoot.add(hair);

    for (const x of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), material(0x172535));
      eye.position.set(x, 2.09, 0.5);
      eye.scale.y = 1.5;
      bodyRoot.add(eye);
    }

    const shoulderMat = material(0xc99b4c);
    for (const x of [-0.58, 0.58]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 7), shoulderMat);
      shoulder.position.set(x, 1.47, 0);
      shoulder.scale.set(1.3, 0.7, 1.1);
      shoulder.castShadow = true;
      bodyRoot.add(shoulder);
    }

    this.swordPivot.position.set(0.56, 1.45, 0.12);
    bodyRoot.add(this.swordPivot);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.55, 0.13), new THREE.MeshStandardMaterial({ color: 0xd9edf0, roughness: 0.28, metalness: 0.62 }));
    blade.position.y = -0.78;
    blade.castShadow = true;
    this.swordPivot.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.14), shoulderMat);
    guard.position.y = -0.03;
    this.swordPivot.add(guard);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let delta = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
  }
}
