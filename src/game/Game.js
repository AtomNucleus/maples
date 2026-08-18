import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './Input.js';
import { AudioEngine } from './Audio.js';
import { FXSystem } from './FX.js';
import { World } from './World.js';
import { Character } from './Character.js';
import { Enemy } from './Enemy.js';

const V = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.quality = this._detectQuality();
    this.renderer = this._makeRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera(54, innerWidth/innerHeight, .08, 500);
    this.camera.position.set(7, 5.5, 16);
    this.cameraYaw = Math.PI;
    this.cameraPitch = .28;
    this.cameraShake = 0;
    this.cameraKick = 0;

    this.fx = new FXSystem(this.scene);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.world = new World(this.scene, this.renderer, this.quality);
    this.player = new Character(this.scene, this.fx, this.audio);

    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.kills = 0;
    this.objectiveKills = 8;
    this.boss = null;
    this.bossPending = false;
    this.bossTimer = 0;
    this.victoryTimer = 0;
    this.victoryShown = false;
    this.gameTime = 0;
    this.started = false;
    this.hitStop = 0;
    this.attackCooldown = 0;
    this.spellCooldown = 0;
    this.dodgeCooldown = 0;
    this.comboStep = 0;
    this.comboDeadline = 0;
    this.attackQueued = false;
    this.combatCombo = 0;
    this.combatComboTimer = 0;
    this.respawnTimer = 0;
    this.toastTimer = 0;

    this._buildPost();
    this._bindUI();
    this._spawnInitialEnemies();
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  _detectQuality() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    return (!coarse && cores >= 6 && memory >= 4 && innerWidth >= 800) ? 'high' : 'low';
  }

  _makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.setPixelRatio(Math.min(devicePixelRatio, this.quality === 'high' ? 1.8 : 1.15));
    r.setSize(innerWidth, innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    return r;
  }

  _buildPost() {
    if (this.quality !== 'high') return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .26, .48, .82);
    bloom.threshold = .72;
    bloom.strength = .28;
    bloom.radius = .38;
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  _bindUI() {
    this.ui = {
      hpFill: document.querySelector('#hp-fill'), hpText: document.querySelector('#hp-text'),
      manaFill: document.querySelector('#mana-fill'), xpFill: document.querySelector('#xp-fill'), level: document.querySelector('#level'),
      questCopy: document.querySelector('#quest-copy'), questProgress: document.querySelector('#quest-progress'), questFill: document.querySelector('#quest-fill'),
      bossUi: document.querySelector('#boss-ui'), bossFill: document.querySelector('#boss-fill'), combo: document.querySelector('#combo'),
      toast: document.querySelector('#toast'), damageLayer: document.querySelector('#damage-layer'), damageFlash: document.querySelector('#damage-flash'),
      intro: document.querySelector('#intro'), victory: document.querySelector('#victory')
    };
    document.querySelector('#enter-btn').addEventListener('click', () => {
      this.audio.unlock();
      this.started = true;
      this.ui.intro.classList.add('hidden');
      if (!matchMedia('(pointer: coarse)').matches) this.canvas.requestPointerLock?.();
      this.toast('Defeat the Briarbound');
    });
    document.querySelector('#restart-btn').addEventListener('click', () => location.reload());
  }

  _spawnInitialEnemies() {
    const spots = [[-5,3],[5,1],[-8,-7],[7,-8],[2,-4]];
    spots.forEach(([x,z]) => this._spawnEnemy(x,z));
  }

  _spawnEnemy(x, z, type='briarling') {
    const p = new V(x ?? 0, 0, z ?? 0);
    if (x == null) {
      let tries = 0;
      do {
        const a = Math.random()*Math.PI*2, r = 8+Math.random()*15;
        p.set(Math.cos(a)*r, 0, Math.sin(a)*r);
        tries++;
      } while (p.distanceTo(this.player.position)<7 && tries<20);
    }
    const e = new Enemy(this.scene, this.fx, this.audio, p, type);
    this.enemies.push(e);
    return e;
  }

  _spawnBoss() {
    this.bossPending = false;
    this.world.unlockPortal();
    this.boss = this._spawnEnemy(0, -13.8, 'boss');
    this.ui.bossUi.classList.remove('hidden');
    this.ui.questCopy.textContent = 'Break Thornmaw, the oath-sworn guardian of the corrupted glade.';
    this.ui.questProgress.textContent = 'Ancient Warden awakened';
    this.ui.questFill.style.width = '100%';
    this.toast('THORNMAW AWAKENS', 2.0);
    this.audio.boss();
    this.cameraShake = .95;
    this.fx.ring(this.boss.position, 0xff8b62, .4, 6.8, 1.2);
  }

  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _frame() {
    let dt = Math.min(.033, this.clock.getDelta());
    const realDt = dt;
    this.gameTime += realDt;

    if (!this.started) {
      this.world.update(realDt);
      this.fx.update(realDt);
      this._introCamera(realDt);
      this._render();
      return;
    }

    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      dt *= .06;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown-realDt);
    this.spellCooldown = Math.max(0, this.spellCooldown-realDt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown-realDt);
    this.comboDeadline -= realDt;
    this.combatComboTimer -= realDt;
    if (this.combatComboTimer<=0) this.combatCombo=0;
    if (this.toastTimer>0) { this.toastTimer-=realDt; if(this.toastTimer<=0)this.ui.toast.classList.remove('show'); }

    const look = this.input.consumeLook();
    this.cameraYaw -= look.x * .00225;
    this.cameraPitch = clamp(this.cameraPitch - look.y*.00165, -.06, .68);
    const move = this.input.getMove();
    const moveWorld = this._moveVector(move);

    this._handleInput(moveWorld);
    this.player.update(dt, move, this.cameraYaw);
    this.world.clampToArena(this.player.position);
    if (this.player.attackWindow()) this._resolveMelee();

    this._updateEnemies(dt, realDt);
    this._updateProjectiles(dt);
    this._updatePickups(dt);
    this._updateEncounter(realDt);
    this.fx.update(dt);
    this.world.update(dt);
    this._updateCamera(realDt);
    this._updateHUD();
    this.input.endFrame();
    this._render();
  }

  _handleInput(moveWorld) {
    const attackPressed = this.input.consume('attack');
    if (attackPressed) {
      if (this.player.state === 'attack') {
        if (this.player.stateTime / this.player.stateDuration > .48) this.attackQueued = true;
      } else if (this.attackCooldown <= 0 && !this.player.dead) {
        this._startAttack();
      }
    }
    if (this.attackQueued && this.player.state === 'idle' && this.attackCooldown <= 0) {
      this.attackQueued = false;
      this._startAttack();
    }

    if (this.input.consume('dodge') && this.dodgeCooldown<=0 && !this.player.dead) {
      if (this.player.beginDodge(moveWorld)) {
        this.dodgeCooldown=.92; this.cameraKick=.75;
      }
    }

    if (this.input.consume('spell') && this.spellCooldown<=0 && this.player.mana>=26 && !this.player.dead && this.player.state!=='dodge') {
      this._castSpell();
    }
  }

  _startAttack() {
    if (this.comboDeadline <= 0) this.comboStep = 0;
    else this.comboStep = (this.comboStep+1)%3;
    if (this.player.beginAttack(this.comboStep)) {
      this.attackCooldown = [.22,.24,.35][this.comboStep];
      this.comboDeadline = .72;
    }
  }

  _resolveMelee() {
    const combo = this.player.comboIndex;
    const forward = new V(Math.sin(this.player.facing),0,Math.cos(this.player.facing));
    const origin = this.player.position.clone();
    const range = [2.15,2.25,2.75][combo];
    const arc = [0.22,0.15,-.15][combo];
    const base = [19,23,36][combo];
    let hits = 0;

    this.fx.slash(origin, this.player.facing, combo);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = e.position.clone().sub(origin); to.y=0;
      const d = to.length();
      if (d > range + e.radius) continue;
      const dot = d>.001 ? to.normalize().dot(forward) : 1;
      if (dot < arc) continue;
      const crit = Math.random() < (combo===2?.24:.12);
      const dmg = Math.round(base*(crit?1.72:1));
      if(e.takeHit(dmg,origin,crit)) {
        hits++;
        this._damageNumber(e.position.clone().add(new V(0,e.isBoss?2.8:1.45,0)),dmg,crit);
        this._addCombatCombo();
      }
    }
    if (hits) {
      this.hitStop = combo===2?.078:.043;
      this.cameraShake = Math.max(this.cameraShake, combo===2?.55:.27);
      this.cameraKick = Math.max(this.cameraKick, combo===2?.5:.22);
      if(combo===2) this.fx.ring(origin,0xffd17d,.25,2.0,.22);
    }
  }

  _castSpell() {
    this.player.mana -= 26;
    this.spellCooldown = 2.35;
    this.audio.spell();
    const f = new V(Math.sin(this.player.facing),0,Math.cos(this.player.facing));
    const pos = this.player.position.clone().add(new V(0,1.1,0)).addScaledVector(f,.85);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.22,1),
      new THREE.MeshStandardMaterial({color:0xffb66f,emissive:0xff5b36,emissiveIntensity:3.4,roughness:.18,flatShading:true})
    );
    core.position.copy(pos);this.scene.add(core);
    const light = new THREE.PointLight(0xff744d, 2.2, 5, 2); core.add(light);
    this.projectiles.push({mesh:core,velocity:f.multiplyScalar(13.5),life:1.45,hits:new Set(),pierce:2});
    this.fx.ring(this.player.position,0xffa060,.2,1.4,.28);
    this.cameraKick=.35;
  }

  _updateProjectiles(dt) {
    for (let i=this.projectiles.length-1;i>=0;i--) {
      const p=this.projectiles[i];p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*8;p.mesh.rotation.y+=dt*11;
      this.fx.projectileTrail(p.mesh.position);
      let exploded=false;
      for (const e of this.enemies) {
        if(e.dead||p.hits.has(e))continue;
        const hitR=e.radius+.45;
        if(p.mesh.position.distanceTo(e.position.clone().add(new V(0,e.isBoss?1.6:.75,0)))<hitR){
          p.hits.add(e);p.pierce--;
          const crit=Math.random()<.16,dmg=Math.round(42*(crit?1.55:1));
          e.takeHit(dmg,this.player.position,crit);this._damageNumber(e.position.clone().add(new V(0,e.isBoss?2.8:1.45,0)),dmg,crit);this._addCombatCombo();
          this.fx.burst(p.mesh.position,0xff8a55,24,5.5,1.0);this.fx.ring(e.position,0xff8154,.18,2.2,.3);this.cameraShake=Math.max(this.cameraShake,.38);this.hitStop=.055;
          if(p.pierce<=0){exploded=true;break;}
        }
      }
      if(p.life<=0||exploded){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.projectiles.splice(i,1);}
    }
  }

  _updateEnemies(dt, realDt) {
    for (const e of this.enemies) {
      e.update(dt,this.player);
      this.world.clampToArena(e.position);

      if (e.attackEvent && !this.player.dead) {
        const dist=e.position.distanceTo(this.player.position);
        const hitRange=e.isBoss?4.35:1.75;
        if(dist<hitRange){
          if(this.player.takeDamage(e.damage,e.position)){
            this.ui.damageFlash.classList.add('hit');setTimeout(()=>this.ui.damageFlash.classList.remove('hit'),55);
            this.cameraShake=Math.max(this.cameraShake,e.isBoss?.78:.42);
            this.hitStop=e.isBoss?.055:.035;
          }
        }
      }

      if (e.dead && !e.userDataRewarded) {
        e.userDataRewarded=true;
        if(e.isBoss){
          this.victoryTimer=1.65;
          this.ui.bossFill.style.transform='scaleX(0)';
          this.toast('ANCIENT WARDEN DEFEATED',1.5);
          this.cameraShake=.8;
          this.fx.levelUp(e.position);
        }else{
          this.kills++;
          this._spawnEssence(e.position,e.reward);
          this._updateQuest();
          if(this.kills>=this.objectiveKills && !this.boss && !this.bossPending){
            this.bossPending=true;this.bossTimer=1.8;
            this.toast('The forest is answering…',1.6);
          }
        }
      }
    }

    // soft separation keeps packs readable instead of merging into one blob
    for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){
      const a=this.enemies[i],b=this.enemies[j];if(a.dead||b.dead)continue;
      const d=a.position.clone().sub(b.position);d.y=0;const len=d.length(),min=a.radius+b.radius+.25;
      if(len>0&&len<min){d.multiplyScalar((min-len)/len*.035);a.position.add(d);b.position.sub(d);}
    }

    this.enemies=this.enemies.filter(e=>!e.remove);

    if(this.player.dead){
      this.respawnTimer+=realDt;
      if(this.respawnTimer>1.6){
        this.player.dead=false;this.player.hp=this.player.maxHp;this.player.mana=this.player.maxMana;this.player.state='idle';this.player.stateTime=0;this.player.root.rotation.set(0,this.player.facing,0);this.player.rig.body.rotation.set(0,0,0);this.player.rig.head.rotation.set(0,0,0);this.player.setPosition(0,0,9);this.respawnTimer=0;this.toast('The grove restores you',1.2);this.fx.levelUp(this.player.position);
      }
    }
  }

  _updateEncounter(dt) {
    if(this.kills < this.objectiveKills && !this.bossPending) {
      const living=this.enemies.filter(e=>!e.dead&&!e.isBoss).length;
      const totalPossible=this.kills+living;
      if(living<4 && totalPossible<this.objectiveKills) this._spawnEnemy();
      else if(living<4 && this.kills<this.objectiveKills) this._spawnEnemy();
    }
    if(this.bossPending){this.bossTimer-=dt;if(this.bossTimer<=0)this._spawnBoss();}
    if(this.boss&&!this.boss.dead){this.ui.bossFill.style.transform=`scaleX(${this.boss.hp/this.boss.maxHp})`;}
    if(this.victoryTimer>0){this.victoryTimer-=dt;if(this.victoryTimer<=0&&!this.victoryShown){this.victoryShown=true;this.ui.victory.classList.remove('hidden');document.exitPointerLock?.();}}
  }

  _spawnEssence(position,reward) {
    const n=3;
    for(let i=0;i<n;i++){
      const c=i===0?0xffd37b:0x80e9c7;
      const m=new THREE.Mesh(new THREE.OctahedronGeometry(.11,0),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:2.0,roughness:.25,flatShading:true}));
      m.position.copy(position).add(new V((Math.random()-.5)*.8,.45+Math.random()*.5,(Math.random()-.5)*.8));
      this.scene.add(m);
      this.pickups.push({mesh:m,value:reward/n,age:0,phase:Math.random()*6.28});
    }
  }

  _updatePickups(dt) {
    for(let i=this.pickups.length-1;i>=0;i--){
      const p=this.pickups[i];p.age+=dt;p.mesh.rotation.y+=dt*5;p.mesh.position.y+=Math.sin(p.age*4+p.phase)*dt*.12;
      const to=this.player.position.clone().add(new V(0,.8,0)).sub(p.mesh.position);const d=to.length();
      if(p.age>.35&&d<6){p.mesh.position.addScaledVector(to.normalize(),dt*(4+Math.max(0,6-d)*2.4));}
      if(d<.55){
        const leveled=this.player.addXp(p.value);this.player.hp=Math.min(this.player.maxHp,this.player.hp+1.8);this.player.mana=Math.min(this.player.maxMana,this.player.mana+2.5);this.audio.pickup();
        if(leveled)this.toast(`LEVEL ${this.player.level}`,1.4);
        this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.pickups.splice(i,1);
      }
    }
  }

  _moveVector(move) {
    const f=new V(Math.sin(this.cameraYaw),0,Math.cos(this.cameraYaw));
    const r=new V(Math.cos(this.cameraYaw),0,-Math.sin(this.cameraYaw));
    return f.multiplyScalar(move.y).add(r.multiplyScalar(move.x));
  }

  _addCombatCombo(){this.combatCombo++;this.combatComboTimer=1.55;this.ui.combo.querySelector('strong').textContent=this.combatCombo;this.ui.combo.classList.toggle('hidden',this.combatCombo<2);}

  _updateQuest(){
    const n=Math.min(this.kills,this.objectiveKills);
    this.ui.questProgress.textContent=`${n} / ${this.objectiveKills} defeated`;
    this.ui.questFill.style.width=`${n/this.objectiveKills*100}%`;
    if(n===this.objectiveKills)this.ui.questCopy.textContent='The glade falls silent. Something ancient stirs beyond the shrine…';
  }

  _damageNumber(worldPos, amount, crit){
    const v=worldPos.clone().project(this.camera);
    if(v.z>1)return;
    const el=document.createElement('div');el.className=`damage-number${crit?' crit':''}`;el.textContent=crit?`${amount}!`:amount;
    el.style.left=`${(v.x*.5+.5)*innerWidth}px`;el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;this.ui.damageLayer.appendChild(el);setTimeout(()=>el.remove(),720);
  }

  toast(text,duration=1.1){this.ui.toast.textContent=text;this.ui.toast.classList.add('show');this.toastTimer=duration;}

  _updateHUD(){
    const p=this.player;
    this.ui.hpFill.style.transform=`scaleX(${p.hp/p.maxHp})`;this.ui.hpText.textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.ui.manaFill.style.transform=`scaleX(${p.mana/p.maxMana})`;this.ui.xpFill.style.transform=`scaleX(${p.xp/p.xpToLevel})`;this.ui.level.textContent=`Lv. ${p.level}`;
    this.ui.combo.classList.toggle('hidden',this.combatCombo<2||this.combatComboTimer<=0);
  }

  _updateCamera(dt){
    const p=this.player.position;
    const fwd=new V(Math.sin(this.cameraYaw),0,Math.cos(this.cameraYaw));
    const horizontal=6.8;
    const target=p.clone().add(new V(0,1.25,0)).addScaledVector(fwd,.55);
    const cp=Math.cos(this.cameraPitch),sp=Math.sin(this.cameraPitch);
    const offset=new V(-Math.sin(this.cameraYaw)*horizontal*cp,3.1+horizontal*sp*.72,-Math.cos(this.cameraYaw)*horizontal*cp);
    const ideal=target.clone().add(offset);
    const alpha=1-Math.exp(-dt*9.5);
    this.camera.position.lerp(ideal,alpha);

    this.cameraShake=damp(this.cameraShake,0,7,dt);this.cameraKick=damp(this.cameraKick,0,6,dt);
    if(this.cameraShake>.01){
      const s=this.cameraShake*this.cameraShake;
      this.camera.position.x+=(Math.random()-.5)*s*.28;this.camera.position.y+=(Math.random()-.5)*s*.21;this.camera.position.z+=(Math.random()-.5)*s*.28;
    }
    const lookTarget=target.clone().addScaledVector(fwd,this.cameraKick*.5);
    this.camera.lookAt(lookTarget);
    const targetFov=54+(this.player.speed/5.2)*2.2+this.cameraKick*2.8;
    this.camera.fov=damp(this.camera.fov,targetFov,7,dt);this.camera.updateProjectionMatrix();
  }

  _introCamera(dt){
    const t=this.gameTime*.17;
    const target=new V(0,1.3,1.5);
    const radius=13.5;
    const ideal=new V(Math.sin(t)*radius,5.2+Math.sin(t*.7)*.7,Math.cos(t)*radius+1.5);
    this.camera.position.lerp(ideal,1-Math.exp(-dt*1.4));this.camera.lookAt(target);
  }

  _resize(){
    const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.quality==='high'?1.8:1.15));this.renderer.setSize(w,h,false);this.composer?.setSize(w,h);
  }

  _render(){if(this.composer)this.composer.render();else this.renderer.render(this.scene,this.camera);}
}
