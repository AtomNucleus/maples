import * as THREE from 'three';
import { Enemy } from './Enemy';
import { InputManager } from './InputManager';
import { Player } from './Player';
import { World } from './World';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 140);
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private input: InputManager;
  private player: Player;
  private world: World;
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private cameraYaw = 0;
  private cameraPitch = 0.43;
  private cameraTarget = new THREE.Vector3();
  private defeated = 0;
  private questComplete = false;
  private respawnTimer = 0;
  private hud!: ReturnType<Game['queryHud']>;

  constructor(private root: HTMLElement) {
    root.innerHTML = this.uiMarkup();
    const mount = root.querySelector<HTMLElement>('[data-game-mount]');
    if (!mount) throw new Error('Missing game mount');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9bd9d6);
    this.scene.fog = new THREE.FogExp2(0x9acbc1, 0.017);
    this.setupLights();
    this.setupSky();

    this.world = new World(this.scene);
    this.world.setPortalActive(false);
    this.player = new Player(this.scene);
    this.input = new InputManager(this.renderer.domElement, root);
    this.hud = this.queryHud();

    const enemyPositions = [
      new THREE.Vector3(-8, 0, 5),
      new THREE.Vector3(7, 0, 2),
      new THREE.Vector3(3, 0, -10),
      new THREE.Vector3(-12, 0, -10),
    ];
    enemyPositions.forEach((position, index) => this.enemies.push(new Enemy(this.scene, position, index)));

    window.addEventListener('resize', this.resize);
    this.resize();
    this.updateHud();
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawnPlayer();
    } else {
      const move = this.input.movement;
      this.player.update(dt, move, this.cameraYaw, this.input.sprinting);
      if (this.input.consumeDodge()) this.player.tryDodge();
      if (this.input.consumeAttack()) this.attack();

      for (const enemy of this.enemies) {
        const damage = enemy.update(dt, this.player, elapsed);
        if (damage > 0) {
          const before = this.player.hp;
          this.player.takeDamage(damage);
          if (this.player.hp < before) this.showToast(`Goblin hits for ${damage}`, 'damage');
          if (this.player.hp <= 0) this.beginRespawn();
        }
        const bar = enemy.group.getObjectByName('health-back');
        const fill = enemy.group.getObjectByName('health-fill');
        bar?.quaternion.copy(this.camera.quaternion);
        fill?.quaternion.copy(this.camera.quaternion);
      }
    }

    this.updateCamera(dt);
    this.updateParticles(dt);
    this.world.update(elapsed);
    this.updateHud();
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  };

  private attack(): void {
    if (!this.player.canAttack() || this.respawnTimer > 0) return;
    this.player.beginAttack();

    const candidates = this.enemies
      .filter((enemy) => enemy.alive && enemy.distanceTo(this.player.group.position) <= 3.15)
      .map((enemy) => {
        const direction = enemy.group.position.clone().sub(this.player.group.position).setY(0).normalize();
        return { enemy, direction, dot: direction.dot(this.player.forward) };
      })
      .filter(({ dot }) => dot > -0.05)
      .sort((a, b) => b.dot - a.dot || a.enemy.distanceTo(this.player.group.position) - b.enemy.distanceTo(this.player.group.position));

    if (!candidates.length) {
      this.showDice('d20', 'Swing', 'No target in reach');
      return;
    }

    const { enemy, direction } = candidates[0];
    const roll = 1 + Math.floor(Math.random() * 20);
    const total = roll + this.player.attackBonus;
    const crit = roll === 20;
    const miss = roll === 1 || (!crit && total < enemy.armorClass);

    if (miss) {
      this.showDice(`${roll}`, `${roll} + ${this.player.attackBonus} = ${total}`, 'MISS');
      this.spawnParticles(enemy.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xdfe7dd, 5);
      return;
    }

    let damage = 5 + Math.floor(Math.random() * 7) + this.player.level;
    if (crit) damage *= 2;
    const killed = enemy.takeDamage(damage, direction);
    this.showDice(`${roll}`, `${roll} + ${this.player.attackBonus} = ${total}`, crit ? `CRIT · ${damage}` : `HIT · ${damage}`);
    this.spawnParticles(enemy.group.position.clone().add(new THREE.Vector3(0, 1, 0)), crit ? 0xffdd75 : 0xff8e6c, crit ? 16 : 9);

    if (killed) {
      this.defeated += 1;
      this.player.gold += 7 + Math.floor(Math.random() * 6);
      const leveled = this.player.addXp(35);
      this.showToast(leveled ? `Level ${this.player.level}! Strength renewed.` : '+35 XP · coins collected', leveled ? 'level' : 'reward');
      if (this.defeated >= 3 && !this.questComplete) {
        this.questComplete = true;
        this.world.setPortalActive(true);
        this.showToast('Quest complete — the Grove Gate awakens!', 'level');
      }
    }
  }

  private beginRespawn(): void {
    this.respawnTimer = 2.2;
    this.showToast('You fall… the grove pulls you back.', 'damage');
  }

  private respawnPlayer(): void {
    this.player.group.position.set(0, 0, 13);
    this.player.healFull();
    this.showToast('Returned at the old trail.', 'reward');
  }

  private updateCamera(dt: number): void {
    const delta = this.input.consumeCameraDelta();
    const sensitivity = delta.lengthSq() > 0 ? 0.005 : 0;
    this.cameraYaw -= delta.x * sensitivity;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - delta.y * sensitivity * 0.75, 0.18, 0.88);

    this.cameraTarget.lerp(this.player.group.position.clone().add(new THREE.Vector3(0, 1.35, 0)), 1 - Math.exp(-dt * 9));
    const distance = 8.2;
    const horizontal = Math.cos(this.cameraPitch) * distance;
    const desired = this.cameraTarget.clone().add(new THREE.Vector3(
      Math.sin(this.cameraYaw) * horizontal,
      Math.sin(this.cameraPitch) * distance + 1.0,
      Math.cos(this.cameraYaw) * horizontal,
    ));
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 11));
    this.camera.lookAt(this.cameraTarget);
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.velocity.y -= 6 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.setScalar(Math.max(0.001, particle.life * 1.4));
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  private spawnParticles(position: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.08 + Math.random() * 0.08, 0),
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.copy(position);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3.4, (Math.random() - 0.5) * 4),
        life: 0.45 + Math.random() * 0.35,
      });
    }
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xc7f6ff, 0x355437, 2.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0c5, 4.2);
    sun.position.set(-15, 26, 18);
    sun.castShadow = true;
    const shadowSize = window.innerWidth < 800 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.00025;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x74b9ff, 1.15);
    rim.position.set(15, 10, -18);
    this.scene.add(rim);
  }

  private setupSky(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          topColor: { value: new THREE.Color(0x68b8d3) },
          bottomColor: { value: new THREE.Color(0xd8e8bf) },
          offset: { value: 12.0 },
          exponent: { value: 0.72 },
        },
        vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y; gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0); }`,
      }),
    );
    this.scene.add(sky);
  }

  private resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 700 ? 62 : 55;
    this.camera.updateProjectionMatrix();
  };

  private updateHud(): void {
    const hpRatio = this.player.hp / this.player.maxHp;
    const xpRatio = this.player.xp / this.player.xpRequired();
    this.hud.level.textContent = `LV ${this.player.level}`;
    this.hud.hpText.textContent = `${this.player.hp} / ${this.player.maxHp}`;
    this.hud.hpFill.style.transform = `scaleX(${hpRatio})`;
    this.hud.xpFill.style.transform = `scaleX(${xpRatio})`;
    this.hud.gold.textContent = `${this.player.gold}`;
    this.hud.questCount.textContent = `${Math.min(this.defeated, 3)} / 3`;
    this.hud.questState.textContent = this.questComplete ? 'Grove Gate awakened' : 'Drive back the goblins';
    this.hud.questCard.classList.toggle('complete', this.questComplete);
  }

  private showDice(roll: string, formula: string, result: string): void {
    this.hud.diceRoll.textContent = roll;
    this.hud.diceFormula.textContent = formula;
    this.hud.diceResult.textContent = result;
    this.hud.dicePanel.classList.remove('show');
    void this.hud.dicePanel.offsetWidth;
    this.hud.dicePanel.classList.add('show');
  }

  private showToast(message: string, kind: 'damage' | 'reward' | 'level'): void {
    this.hud.toast.textContent = message;
    this.hud.toast.dataset.kind = kind;
    this.hud.toast.classList.remove('show');
    void this.hud.toast.offsetWidth;
    this.hud.toast.classList.add('show');
  }

  private queryHud() {
    const get = <T extends HTMLElement>(selector: string) => {
      const element = this.root.querySelector<T>(selector);
      if (!element) throw new Error(`Missing UI element: ${selector}`);
      return element;
    };
    return {
      level: get<HTMLElement>('[data-level]'),
      hpText: get<HTMLElement>('[data-hp-text]'),
      hpFill: get<HTMLElement>('[data-hp-fill]'),
      xpFill: get<HTMLElement>('[data-xp-fill]'),
      gold: get<HTMLElement>('[data-gold]'),
      questCount: get<HTMLElement>('[data-quest-count]'),
      questState: get<HTMLElement>('[data-quest-state]'),
      questCard: get<HTMLElement>('[data-quest-card]'),
      dicePanel: get<HTMLElement>('[data-dice-panel]'),
      diceRoll: get<HTMLElement>('[data-dice-roll]'),
      diceFormula: get<HTMLElement>('[data-dice-formula]'),
      diceResult: get<HTMLElement>('[data-dice-result]'),
      toast: get<HTMLElement>('[data-toast]'),
    };
  }

  private uiMarkup(): string {
    return `
      <main class="game-shell">
        <div class="game-mount" data-game-mount></div>
        <div class="vignette"></div>
        <header class="brand"><span class="brand-mark">M</span><div><strong>MAPLES</strong><small>THE SUNKEN GROVE</small></div></header>

        <section class="player-card glass">
          <div class="portrait">⚔</div>
          <div class="player-meta">
            <div class="name-row"><strong>Rowan</strong><span data-level>LV 1</span></div>
            <div class="bar hp"><i data-hp-fill></i><span data-hp-text>100 / 100</span></div>
            <div class="bar xp"><i data-xp-fill></i></div>
            <div class="stats"><span>WARDEN</span><span>AC 15</span><span>+5 ATK</span></div>
          </div>
        </section>

        <section class="quest-card glass" data-quest-card>
          <div class="quest-icon">✦</div>
          <div><small>GROVE TROUBLE</small><strong data-quest-state>Drive back the goblins</strong><span><b data-quest-count>0 / 3</b> defeated</span></div>
        </section>

        <div class="coin-pill glass"><span>◆</span><b data-gold>0</b></div>

        <section class="dice-panel glass" data-dice-panel>
          <div class="d20" data-dice-roll>d20</div>
          <div><small data-dice-formula>Attack roll</small><strong data-dice-result>READY</strong></div>
        </section>

        <div class="toast glass" data-toast></div>

        <aside class="controls glass">
          <span><kbd>WASD</kbd> Move</span><span><kbd>RMB</kbd> Camera</span><span><kbd>LMB</kbd> Attack</span><span><kbd>SPACE</kbd> Dodge</span><span><kbd>SHIFT</kbd> Sprint</span>
        </aside>

        <div class="mobile-ui">
          <div class="joystick" data-joystick><div class="joystick-knob" data-joystick-knob></div></div>
          <div class="mobile-actions">
            <button class="action dodge" aria-label="Dodge" data-dodge>↝</button>
            <button class="action attack" aria-label="Attack" data-attack>⚔</button>
          </div>
          <span class="swipe-hint">Swipe to look</span>
        </div>
      </main>`;
  }
}
