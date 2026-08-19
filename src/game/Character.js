import * as THREE from 'three';

const V = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

function std(color, rough=.75, metal=.0, emissive=0, ei=0){
  return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive,emissiveIntensity:ei,flatShading:true});
}

function mesh(geo, material, cast=true){ const m=new THREE.Mesh(geo,material);m.castShadow=cast;m.receiveShadow=true;return m; }

export class Character {
  constructor(scene, fx, audio){
    this.scene=scene;this.fx=fx;this.audio=audio;
    this.root=new THREE.Group();scene.add(this.root);
    this.root.position.set(0,0,9);
    this.velocity=new V();this.facing=0;this.speed=0;
    this.maxHp=100;this.hp=100;this.maxMana=100;this.mana=100;
    this.level=7;this.xp=0;this.xpToLevel=100;
    this.state='idle';this.stateTime=0;this.stateDuration=0;
    this.invuln=0;this.comboIndex=0;this.attackEventFired=false;this.dodgeDir=new V();
    this.hitFlash=0;this.dead=false;
    this._build();
  }

  _build(){
    const skin=std(0xe5b790,.8), hair=std(0x392e2a,.92), tunic=std(0x315f55,.78), cloth=std(0x9b4d43,.8), leather=std(0x593e2f,.88), gold=std(0xd1ad5d,.38,.55), steel=std(0xc5d4cc,.3,.72), dark=std(0x192d2b,.88);
    this.materials={skin,hair,tunic,cloth,leather,gold,steel,dark};
    const rig=this.rig={};

    rig.body=new THREE.Group();rig.body.position.y=1.15;this.root.add(rig.body);
    const torso=mesh(new THREE.CapsuleGeometry(.38,.62,5,8),tunic);torso.scale.set(1,.95,.74);rig.body.add(torso);
    const belt=mesh(new THREE.CylinderGeometry(.39,.39,.16,10),leather);belt.position.y=-.36;belt.scale.z=.82;rig.body.add(belt);
    const buckle=mesh(new THREE.BoxGeometry(.13,.13,.055),gold);buckle.position.set(0,-.36,.34);rig.body.add(buckle);
    // scarf/cape reads well in silhouette.
    const cape=mesh(new THREE.PlaneGeometry(.72,1.0),cloth);cape.position.set(0,-.1,-.31);cape.rotation.x=.1;rig.body.add(cape);rig.cape=cape;
    const shoulderL=mesh(new THREE.SphereGeometry(.28,8,6),gold);shoulderL.scale.set(1.15,.7,.95);shoulderL.position.set(-.43,.24,0);rig.body.add(shoulderL);
    const shoulderR=shoulderL.clone();shoulderR.position.x=.43;rig.body.add(shoulderR);

    rig.head=new THREE.Group();rig.head.position.y=2.04;this.root.add(rig.head);
    const head=mesh(new THREE.SphereGeometry(.33,10,8),skin);head.scale.set(1,.95,.92);rig.head.add(head);
    const hairTop=mesh(new THREE.IcosahedronGeometry(.34,1),hair);hairTop.scale.set(1.05,.68,1.0);hairTop.position.y=.19;rig.head.add(hairTop);
    for(let i=0;i<4;i++){
      const lock=mesh(new THREE.ConeGeometry(.08,.32,5),hair);lock.position.set(-.2+i*.13,.18,.25);lock.rotation.x=-.55;lock.rotation.z=(i-1.5)*.2;rig.head.add(lock);
    }
    const eyeMat=new THREE.MeshBasicMaterial({color:0x25322f});
    [-1,1].forEach(s=>{const eye=mesh(new THREE.SphereGeometry(.025,6,4),eyeMat,false);eye.position.set(s*.12,.02,.30);rig.head.add(eye);});

    rig.armL=this._limb(-.48,1.44,skin,tunic,leather);rig.armR=this._limb(.48,1.44,skin,tunic,leather);this.root.add(rig.armL,rig.armR);
    rig.legL=this._leg(-.22,.68,tunic,leather);rig.legR=this._leg(.22,.68,tunic,leather);this.root.add(rig.legL,rig.legR);

    // Sword sits under right hand group.
    rig.weapon=new THREE.Group();rig.weapon.position.set(0,-.46,0);rig.armR.add(rig.weapon);
    const grip=mesh(new THREE.CylinderGeometry(.045,.05,.32,7),leather);grip.rotation.z=Math.PI/2;rig.weapon.add(grip);
    const guard=mesh(new THREE.BoxGeometry(.08,.52,.08),gold);guard.rotation.z=Math.PI/2;guard.position.x=.18;rig.weapon.add(guard);
    const blade=mesh(new THREE.BoxGeometry(.07,1.22,.12),steel);blade.position.set(.78,0,0);blade.rotation.z=Math.PI/2;rig.weapon.add(blade);
    const tip=mesh(new THREE.ConeGeometry(.09,.28,4),steel);tip.position.set(1.53,0,0);tip.rotation.z=-Math.PI/2;rig.weapon.add(tip);
    const rune=mesh(new THREE.BoxGeometry(.025,.46,.13),new THREE.MeshStandardMaterial({color:0x79e5c5,emissive:0x69d9bc,emissiveIntensity:1.4,roughness:.2}),false);rune.position.set(.7,0,.01);rune.rotation.z=Math.PI/2;rig.weapon.add(rune);
    rig.swordGlow=rune;

    // Shield on back for D&D silhouette.
    const shield=mesh(new THREE.CylinderGeometry(.44,.44,.10,8),dark);shield.rotation.x=Math.PI/2;shield.position.set(0,1.25,-.35);shield.rotation.z=.15;this.root.add(shield);
    const rim=mesh(new THREE.TorusGeometry(.39,.055,6,8),gold);rim.position.z=.06;shield.add(rim);

    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.58,24),new THREE.MeshBasicMaterial({color:0x13221e,transparent:true,opacity:.24,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;shadow.scale.z=.72;this.root.add(shadow);this.shadow=shadow;
  }

  _limb(x,y,skin,tunic,leather){
    const g=new THREE.Group();g.position.set(x,y,0);
    const upper=mesh(new THREE.CapsuleGeometry(.13,.36,4,7),tunic);upper.position.y=-.18;g.add(upper);
    const fore=new THREE.Group();fore.position.y=-.48;g.add(fore);g.userData.fore=fore;
    const f=mesh(new THREE.CapsuleGeometry(.105,.32,4,7),skin);f.position.y=-.18;fore.add(f);
    const glove=mesh(new THREE.SphereGeometry(.13,7,5),leather);glove.position.y=-.43;fore.add(glove);
    return g;
  }
  _leg(x,y,tunic,leather){
    const g=new THREE.Group();g.position.set(x,y,0);
    const thigh=mesh(new THREE.CapsuleGeometry(.15,.4,4,7),tunic);thigh.position.y=-.2;g.add(thigh);
    const shin=mesh(new THREE.CapsuleGeometry(.13,.42,4,7),leather);shin.position.y=-.66;g.add(shin);
    const boot=mesh(new THREE.BoxGeometry(.25,.18,.42),leather);boot.position.set(0,-.9,.08);boot.rotation.x=.08;g.add(boot);
    return g;
  }

  setPosition(x,y,z){ this.root.position.set(x,y,z); }
  get position(){ return this.root.position; }

  beginAttack(combo){
    if(this.dead || this.state==='dodge') return false;
    this.state='attack';this.stateTime=0;this.comboIndex=combo%3;this.attackEventFired=false;
    this.stateDuration=[.38,.42,.58][this.comboIndex];
    this.audio.swing(this.comboIndex);
    return true;
  }

  beginDodge(moveDir){
    if(this.dead || this.state==='attack' && this.stateTime<.18) return false;
    this.state='dodge';this.stateTime=0;this.stateDuration=.44;this.invuln=.40;
    this.dodgeDir.copy(moveDir);
    if(this.dodgeDir.lengthSq()<.01) this.dodgeDir.set(Math.sin(this.facing),0,Math.cos(this.facing));
    this.dodgeDir.normalize();
    this.audio.dash();this.fx.ring(this.position,0x8ddded,.18,1.1,.25);
    return true;
  }

  takeDamage(amount, from){
    if(this.invuln>0 || this.dead) return false;
    this.hp=Math.max(0,this.hp-amount);this.invuln=.52;this.hitFlash=.18;
    this.audio.hurt();
    if(from){ const away=this.position.clone().sub(from);away.y=0;if(away.lengthSq()>.01)this.velocity.add(away.normalize().multiplyScalar(3.2)); }
    if(this.hp<=0){this.dead=true;this.state='dead';this.stateTime=0;}
    else {this.state='hurt';this.stateTime=0;this.stateDuration=.28;}
    return true;
  }

  addXp(amount){
    this.xp+=amount;
    let leveled=false;
    if(this.xp>=this.xpToLevel){
      this.xp-=this.xpToLevel;this.level++;this.xpToLevel=Math.round(this.xpToLevel*1.22);this.maxHp+=12;this.hp=this.maxHp;this.maxMana+=7;this.mana=this.maxMana;leveled=true;
      this.fx.levelUp(this.position);this.audio.level();
    }
    return leveled;
  }

  update(dt, move, cameraYaw){
    this.invuln=Math.max(0,this.invuln-dt);this.hitFlash=Math.max(0,this.hitFlash-dt);
    this.mana=Math.min(this.maxMana,this.mana+dt*8);
    this.stateTime+=dt;

    const forward=new V(Math.sin(cameraYaw),0,Math.cos(cameraYaw));
    const right=new V(-Math.cos(cameraYaw),0,Math.sin(cameraYaw));
    const desired=forward.multiplyScalar(move.y).add(right.multiplyScalar(move.x));
    if(desired.lengthSq()>1) desired.normalize();

    let movementAllowed=1;
    if(this.state==='attack') movementAllowed=this.comboIndex===2?.16:.34;
    if(this.state==='hurt'||this.state==='dead') movementAllowed=0;

    if(this.state==='dodge'){
      const t=this.stateTime/this.stateDuration;
      const speed=THREE.MathUtils.lerp(12.5,4.8,t);
      this.velocity.x=this.dodgeDir.x*speed;this.velocity.z=this.dodgeDir.z*speed;
      if(Math.floor(this.stateTime*35)!==Math.floor((this.stateTime-dt)*35)) this.fx.dashTrail(this.position);
      this.facing=Math.atan2(this.dodgeDir.x,this.dodgeDir.z);
    } else {
      const targetSpeed=desired.lengthSq()>.01?5.25*movementAllowed:0;
      const dir=desired.lengthSq()>.01?desired.normalize():new V();
      this.velocity.x=damp(this.velocity.x,dir.x*targetSpeed,desired.lengthSq()>.01?16:11,dt);
      this.velocity.z=damp(this.velocity.z,dir.z*targetSpeed,desired.lengthSq()>.01?16:11,dt);
      if(desired.lengthSq()>.01 && movementAllowed>.25){
        const targetFacing=Math.atan2(dir.x,dir.z);
        let delta=((targetFacing-this.facing+Math.PI)%(Math.PI*2))-Math.PI;
        this.facing+=delta*(1-Math.exp(-dt*14));
      }
    }

    this.root.position.addScaledVector(this.velocity,dt);
    this.root.rotation.y=this.facing;
    this.speed=Math.hypot(this.velocity.x,this.velocity.z);

    if(['attack','dodge','hurt'].includes(this.state) && this.stateTime>=this.stateDuration){this.state='idle';this.stateTime=0;}
    this._animate(dt);
  }

  _animate(dt){
    const r=this.rig,t=performance.now()*.001;
    const moving=this.speed>.35 && !['attack','dodge','hurt','dead'].includes(this.state);
    const walkPhase=t*(5.5+this.speed*.45);
    const walkAmp=clamp(this.speed/5.2,0,1)*.62;

    // base pose damping
    r.body.rotation.x=damp(r.body.rotation.x,0,12,dt);r.body.rotation.y=damp(r.body.rotation.y,0,12,dt);r.body.rotation.z=damp(r.body.rotation.z,0,12,dt);
    r.head.rotation.x=damp(r.head.rotation.x,0,10,dt);r.head.rotation.z=damp(r.head.rotation.z,0,10,dt);
    r.armL.rotation.x=damp(r.armL.rotation.x,moving?Math.sin(walkPhase)*walkAmp:.08,10,dt);
    r.armR.rotation.x=damp(r.armR.rotation.x,moving?-Math.sin(walkPhase)*walkAmp:-.12,10,dt);
    r.armL.rotation.z=damp(r.armL.rotation.z,.08,10,dt);r.armR.rotation.z=damp(r.armR.rotation.z,-.12,10,dt);
    r.armR.rotation.y=damp(r.armR.rotation.y,0,10,dt);
    r.armR.userData.fore.rotation.z=damp(r.armR.userData.fore.rotation.z,0,10,dt);
    r.legL.rotation.x=damp(r.legL.rotation.x,moving?-Math.sin(walkPhase)*walkAmp:0,11,dt);
    r.legR.rotation.x=damp(r.legR.rotation.x,moving?Math.sin(walkPhase)*walkAmp:0,11,dt);
    this.root.position.y=damp(this.root.position.y,moving?Math.abs(Math.sin(walkPhase*2))*.035:0,12,dt);
    r.cape.rotation.x=.1+Math.min(.4,this.speed*.045)+Math.sin(t*3)*.025;
    r.swordGlow.material.emissiveIntensity=1.15+.55*Math.sin(t*5.5);

    if(this.state==='attack') this._attackPose(dt);
    if(this.state==='dodge'){
      const p=this.stateTime/this.stateDuration;
      r.body.rotation.x=-.32*Math.sin(Math.PI*p);r.body.rotation.z=.12*Math.sin(Math.PI*p*2);
      r.armR.rotation.x=-1.15;r.armR.rotation.z=-.45;
      this.root.position.y=Math.sin(Math.PI*p)*.13;
    }
    if(this.state==='hurt'){
      const p=this.stateTime/this.stateDuration;
      r.body.rotation.x=-.28*Math.sin(Math.PI*p);r.head.rotation.x=.25*Math.sin(Math.PI*p);
    }
    if(this.state==='dead'){
      const p=clamp(this.stateTime/.8,0,1);r.body.rotation.z=THREE.MathUtils.lerp(0,1.35,p);r.head.rotation.z=THREE.MathUtils.lerp(0,.8,p);this.root.position.y=-.12*p;
    }
    if(this.invuln>0 && Math.floor(this.invuln*24)%2===0){ this.root.visible=false; } else this.root.visible=true;
  }

  _attackPose(dt){
    const r=this.rig;const p=clamp(this.stateTime/this.stateDuration,0,1);
    if(this.comboIndex===0){
      const swing=Math.sin(clamp((p-.08)/.68,0,1)*Math.PI);
      r.body.rotation.y=-.22+swing*.5;r.body.rotation.z=-.08*swing;
      r.armR.rotation.x=-1.15+swing*.45;r.armR.rotation.z=-1.1+swing*2.0;r.armR.rotation.y=-.35+swing*.8;
      r.armR.userData.fore.rotation.z=-.45;
    }else if(this.comboIndex===1){
      const swing=Math.sin(clamp((p-.07)/.68,0,1)*Math.PI);
      r.body.rotation.y=.25-swing*.55;r.body.rotation.z=.1*swing;
      r.armR.rotation.x=-.85+swing*.2;r.armR.rotation.z=.95-swing*2.15;r.armR.rotation.y=.45-swing*.75;
      r.armR.userData.fore.rotation.z=-.25;
    }else{
      const wind=clamp(p/.36,0,1),slash=clamp((p-.28)/.55,0,1);
      r.body.rotation.x=.18*wind-.42*Math.sin(slash*Math.PI);r.body.rotation.y=-.45*wind+slash*.9;
      r.armR.rotation.x=-2.15+slash*1.3;r.armR.rotation.z=-.35+slash*.85;r.armR.rotation.y=-.55+slash*.5;
      r.armL.rotation.x=-.7*wind;r.armL.rotation.z=.45*wind;
      if(p>.5&&p<.82)this.root.position.y=Math.sin((p-.5)/.32*Math.PI)*.18;
    }
  }

  attackWindow(){
    if(this.state!=='attack'||this.attackEventFired)return false;
    const p=this.stateTime/this.stateDuration;
    const threshold=[.34,.32,.52][this.comboIndex];
    if(p>=threshold){this.attackEventFired=true;return true;}return false;
  }
}