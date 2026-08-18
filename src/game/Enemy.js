import * as THREE from 'three';

const V=THREE.Vector3; const clamp=THREE.MathUtils.clamp; const damp=THREE.MathUtils.damp;
function mat(color,rough=.8,metal=0,em=0,ei=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive:em,emissiveIntensity:ei,flatShading:true});}
function mesh(g,m){const x=new THREE.Mesh(g,m);x.castShadow=true;x.receiveShadow=true;return x;}

export class Enemy {
  constructor(scene,fx,audio,position,type='briarling'){
    this.scene=scene;this.fx=fx;this.audio=audio;this.type=type;this.isBoss=type==='boss';
    this.root=new THREE.Group();scene.add(this.root);this.root.position.copy(position);
    const teleMat=new THREE.MeshBasicMaterial({color:this.isBoss?0xff6f59:0xffb86b,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    this.telegraph=new THREE.Mesh(new THREE.RingGeometry(this.isBoss?1.5:.62,this.isBoss?1.67:.72,28),teleMat);this.telegraph.rotation.x=-Math.PI/2;this.telegraph.position.y=.025;this.root.add(this.telegraph);
    this.velocity=new V();this.facing=Math.random()*Math.PI*2;
    this.state='spawn';this.stateTime=0;this.stateDuration=.55;
    this.attackEvent=false;this.attackSerial=0;this.dead=false;this.remove=false;this.hitFlash=0;
    this.maxHp=this.isBoss?650:58;this.hp=this.maxHp;
    this.speed=this.isBoss?1.55:2.15+Math.random()*.35;this.attackRange=this.isBoss?2.4:1.45;
    this.damage=this.isBoss?22:11;this.radius=this.isBoss?1.1:.55;
    this.reward=this.isBoss?180:22;
    this._build();
    this.fx.ring(this.root.position,this.isBoss?0xff8a67:0x75d0a1,.15,this.isBoss?2.8:1.3,.5);
  }

  _build(){
    if(this.isBoss) return this._buildBoss();
    const moss=mat(0x446e50,.9),moss2=mat(0x5e8b5f,.9),bark=mat(0x63483b,.95),belly=mat(0x91a765,.92),thorn=mat(0x373e34,.86),eye=new THREE.MeshBasicMaterial({color:0xf4d68e});
    this.materials=[moss,moss2,bark,belly,thorn];this.materials.forEach(m=>{m.userData.baseEmissive=m.emissive.getHex();m.userData.baseEI=m.emissiveIntensity;});
    const r=this.rig={};
    r.body=new THREE.Group();r.body.position.y=.67;this.root.add(r.body);
    const body=mesh(new THREE.IcosahedronGeometry(.55,1),moss);body.scale.set(1,.9,1.08);r.body.add(body);
    const bellyPatch=mesh(new THREE.SphereGeometry(.34,8,6),belly);bellyPatch.scale.set(1,.75,.3);bellyPatch.position.set(0,-.05,.48);r.body.add(bellyPatch);
    r.head=new THREE.Group();r.head.position.set(0,1.18,.08);this.root.add(r.head);
    const head=mesh(new THREE.IcosahedronGeometry(.44,1),moss2);head.scale.set(1.05,.9,1);r.head.add(head);
    [-1,1].forEach(s=>{const e=mesh(new THREE.SphereGeometry(.045,7,5),eye);e.position.set(s*.15,.05,.4);r.head.add(e);const brow=mesh(new THREE.BoxGeometry(.16,.045,.045),bark);brow.position.set(s*.15,.14,.4);brow.rotation.z=s*.25;r.head.add(brow);});
    // leaf ears
    [-1,1].forEach(s=>{const ear=mesh(new THREE.ConeGeometry(.16,.5,5),moss2);ear.position.set(s*.38,.12,.02);ear.rotation.z=-s*1.15;ear.rotation.x=.15;r.head.add(ear);});
    // thorn crown
    for(let i=0;i<3;i++){const h=mesh(new THREE.ConeGeometry(.08,.42,5),thorn);h.position.set((i-1)*.18,.38,-.03);h.rotation.z=(i-1)*.28;r.head.add(h);}
    r.armL=this._claw(-.52,.72,bark,thorn);r.armR=this._claw(.52,.72,bark,thorn);this.root.add(r.armL,r.armR);
    r.legL=this._foot(-.25,.22,bark);r.legR=this._foot(.25,.22,bark);this.root.add(r.legL,r.legR);
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.58,18),new THREE.MeshBasicMaterial({color:0x13211a,transparent:true,opacity:.2,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;shadow.scale.z=.68;this.root.add(shadow);
    this.scaleBase=.82+Math.random()*.24;this.root.scale.setScalar(this.scaleBase);
  }

  _claw(x,y,bark,thorn){const g=new THREE.Group();g.position.set(x,y,0);const arm=mesh(new THREE.CapsuleGeometry(.1,.34,4,6),bark);arm.position.y=-.15;g.add(arm);for(let i=-1;i<=1;i++){const c=mesh(new THREE.ConeGeometry(.035,.23,4),thorn);c.position.set(i*.07,-.41,.06);c.rotation.x=Math.PI/2.5;g.add(c);}return g;}
  _foot(x,y,bark){const g=new THREE.Group();g.position.set(x,y,0);const foot=mesh(new THREE.SphereGeometry(.2,7,5),bark);foot.scale.set(1.2,.65,1.45);foot.position.z=.07;g.add(foot);return g;}

  _buildBoss(){
    const bark=mat(0x4a3d32,.96),bark2=mat(0x66513d,.95),moss=mat(0x354e3c,.96),ember=mat(0xad4e46,.52,.1,0x8f2b24,.55),bone=mat(0xb7aa80,.86),eye=new THREE.MeshBasicMaterial({color:0xffb46a});
    this.materials=[bark,bark2,moss,ember,bone];this.materials.forEach(m=>{m.userData.baseEmissive=m.emissive.getHex();m.userData.baseEI=m.emissiveIntensity;});const r=this.rig={};
    r.body=new THREE.Group();r.body.position.y=1.45;this.root.add(r.body);
    const torso=mesh(new THREE.IcosahedronGeometry(1.15,1),bark);torso.scale.set(1.05,1.15,.88);r.body.add(torso);
    const chest=mesh(new THREE.IcosahedronGeometry(.7,1),ember);chest.scale.set(.8,.72,.35);chest.position.set(0,.05,.86);r.body.add(chest);
    // bark plates
    for(let i=0;i<5;i++){const p=mesh(new THREE.BoxGeometry(.32,.8,.18),bark2);p.position.set((i-2)*.27,.12+Math.abs(i-2)*.06,.91);p.rotation.z=(i-2)*.07;r.body.add(p);}
    r.head=new THREE.Group();r.head.position.set(0,2.7,.1);this.root.add(r.head);
    const head=mesh(new THREE.IcosahedronGeometry(.76,1),bark2);head.scale.set(1,.82,.9);r.head.add(head);
    [-1,1].forEach(s=>{const e=mesh(new THREE.SphereGeometry(.075,7,5),eye);e.position.set(s*.25,.03,.67);r.head.add(e);const horn=mesh(new THREE.ConeGeometry(.18,1.15,6),bone);horn.position.set(s*.62,.28,.0);horn.rotation.z=-s*.72;r.head.add(horn);});
    r.armL=this._bossArm(-1.15,1.65,bark,bark2,bone);r.armR=this._bossArm(1.15,1.65,bark,bark2,bone);this.root.add(r.armL,r.armR);
    r.legL=this._bossLeg(-.56,.62,bark,bone);r.legR=this._bossLeg(.56,.62,bark,bone);this.root.add(r.legL,r.legR);
    // back briars
    for(let i=0;i<5;i++){const thorn=mesh(new THREE.ConeGeometry(.13,.9,5),bone);thorn.position.set((i-2)*.38,1.65+Math.abs(i-2)*.25,-.75);thorn.rotation.x=-.65;thorn.rotation.z=(i-2)*.1;this.root.add(thorn);}
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.45,24),new THREE.MeshBasicMaterial({color:0x140f0e,transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;shadow.scale.z=.72;this.root.add(shadow);
    this.root.scale.setScalar(1.08);
  }
  _bossArm(x,y,bark,bark2,bone){const g=new THREE.Group();g.position.set(x,y,0);const upper=mesh(new THREE.CapsuleGeometry(.28,.65,5,8),bark);upper.position.y=-.24;g.add(upper);const fist=mesh(new THREE.IcosahedronGeometry(.42,1),bark2);fist.position.y=-.78;g.add(fist);for(let i=-1;i<=1;i++){const c=mesh(new THREE.ConeGeometry(.065,.34,5),bone);c.position.set(i*.15,-1.05,.15);c.rotation.x=1.1;g.add(c);}return g;}
  _bossLeg(x,y,bark,bone){const g=new THREE.Group();g.position.set(x,y,0);const leg=mesh(new THREE.CapsuleGeometry(.3,.75,5,8),bark);leg.position.y=-.3;g.add(leg);const foot=mesh(new THREE.BoxGeometry(.65,.32,.9),bone);foot.position.set(0,-.83,.17);g.add(foot);return g;}

  get position(){return this.root.position;}

  takeHit(damage,from,crit=false){
    if(this.dead||this.state==='spawn')return false;
    this.hp=Math.max(0,this.hp-damage);this.hitFlash=.12;
    const away=this.position.clone().sub(from);away.y=0;if(away.lengthSq()>.01&&!this.isBoss)this.velocity.add(away.normalize().multiplyScalar(4.4));
    this.fx.burst(this.position.clone().add(new V(0,this.isBoss?1.8:.8,0)),crit?0xffbe76:0xb8efb0,crit?20:11,crit?5.5:3.5,this.isBoss?1.25:.85);
    this.audio.hit(crit);
    if(this.hp<=0){
      this.dead=true;this.state='dead';this.stateTime=0;this.stateDuration=this.isBoss?1.8:.85;
      this.fx.ring(this.position,this.isBoss?0xffad73:0x89daa8,.3,this.isBoss?5.5:2.2,this.isBoss?1.1:.45);
    }else if(!this.isBoss){this.state='stagger';this.stateTime=0;this.stateDuration=.2;}
    return true;
  }

  update(dt,player){
    this.stateTime+=dt;this.hitFlash=Math.max(0,this.hitFlash-dt);this.attackEvent=false;
    if(this.dead){
      const p=clamp(this.stateTime/this.stateDuration,0,1);
      this.root.scale.setScalar((this.isBoss?1.08:this.scaleBase)*(1-p*.72));
      this.root.rotation.z=p*(this.isBoss?.65:1.15);this.root.position.y=-p*(this.isBoss?.3:.15);
      this.root.traverse(o=>{if(o.material&&'opacity'in o.material&&o.material.transparent)o.material.opacity=1-p;});
      if(p>=1){this.remove=true;this.scene.remove(this.root);}return;
    }

    const toPlayer=player.position.clone().sub(this.position);toPlayer.y=0;const dist=toPlayer.length();const dir=dist>.001?toPlayer.multiplyScalar(1/dist):new V();
    if(this.state==='spawn'){
      const p=clamp(this.stateTime/this.stateDuration,0,1);const bounce=1-Math.pow(1-p,3);this.root.scale.setScalar((this.isBoss?1.08:this.scaleBase)*bounce);
      if(p>=1){this.state='idle';this.stateTime=0;}
    } else if(this.state==='idle'){
      if(dist<(this.isBoss?18:12)){this.state='chase';this.stateTime=0;}
    } else if(this.state==='chase'){
      if(dist<this.attackRange){this.state='windup';this.stateTime=0;this.stateDuration=this.isBoss?.92:.52;this.velocity.multiplyScalar(.35);}
      else{this.velocity.x=damp(this.velocity.x,dir.x*this.speed,8,dt);this.velocity.z=damp(this.velocity.z,dir.z*this.speed,8,dt);}
    } else if(this.state==='windup'){
      this.velocity.multiplyScalar(Math.exp(-dt*9));
      if(this.stateTime>this.stateDuration){this.state='attack';this.stateTime=0;this.stateDuration=this.isBoss?.5:.24;this.attackEvent=true;this.attackSerial++;if(this.isBoss)this.fx.ring(this.position,0xff785f,.25,4.6,.55);}
    } else if(this.state==='attack'){
      if(this.stateTime<this.stateDuration*.48){this.velocity.x=dir.x*(this.isBoss?3.7:5.4);this.velocity.z=dir.z*(this.isBoss?3.7:5.4);}else this.velocity.multiplyScalar(Math.exp(-dt*12));
      if(this.stateTime>this.stateDuration){this.state='recover';this.stateTime=0;this.stateDuration=this.isBoss?.72:.46;}
    } else if(this.state==='recover'){
      this.velocity.multiplyScalar(Math.exp(-dt*10));if(this.stateTime>this.stateDuration){this.state='chase';this.stateTime=0;}
    } else if(this.state==='stagger'){
      this.velocity.multiplyScalar(Math.exp(-dt*8));if(this.stateTime>this.stateDuration){this.state='chase';this.stateTime=0;}
    }

    if(!['windup','stagger'].includes(this.state) && dir.lengthSq()>.01){const target=Math.atan2(dir.x,dir.z);let d=((target-this.facing+Math.PI)%(Math.PI*2))-Math.PI;this.facing+=d*(1-Math.exp(-dt*8));}
    this.position.addScaledVector(this.velocity,dt);this.root.rotation.y=this.facing;
    this._animate(dt,dist);
  }

  _animate(dt,dist){
    const r=this.rig,t=performance.now()*.001,walk=Math.sin(t*(this.isBoss?4.3:7));
    if(!r)return;
    const moving=this.state==='chase'&&dist>this.attackRange;
    r.body.position.y=(this.isBoss?1.45:.67)+(moving?Math.abs(Math.sin(t*(this.isBoss?4.4:7.3)))*(this.isBoss?.08:.055):0);
    r.head.rotation.z=Math.sin(t*2.3)*.025;
    r.armL.rotation.x=damp(r.armL.rotation.x,moving?walk*.38:0,8,dt);r.armR.rotation.x=damp(r.armR.rotation.x,moving?-walk*.38:0,8,dt);
    r.legL.rotation.x=damp(r.legL.rotation.x,moving?-walk*.35:0,8,dt);r.legR.rotation.x=damp(r.legR.rotation.x,moving?walk*.35:0,8,dt);
    if(this.state==='windup'){
      const p=clamp(this.stateTime/this.stateDuration,0,1);r.body.rotation.x=.22*p;r.armL.rotation.x=-1.25*p;r.armR.rotation.x=-1.25*p;
      const s=1+Math.sin(t*28)*.018*p;this.root.scale.x=(this.isBoss?1.08:this.scaleBase)*s;this.root.scale.z=(this.isBoss?1.08:this.scaleBase)*s;
    }else if(this.state==='attack'){
      const p=this.stateTime/this.stateDuration;r.body.rotation.x=-.36*Math.sin(Math.PI*p);r.armL.rotation.x=-1.25+2.1*Math.sin(Math.PI*p);r.armR.rotation.x=-1.25+2.1*Math.sin(Math.PI*p);
    }else{r.body.rotation.x=damp(r.body.rotation.x,0,9,dt);}
    if(this.state==='stagger'){r.body.rotation.z=Math.sin(this.stateTime*24)*.18;}else r.body.rotation.z=damp(r.body.rotation.z,0,10,dt);

    const intensity=this.hitFlash>0?1.3:0;
    for(const m of this.materials||[]){if(m.emissive){ if(this.hitFlash>0){m.emissive.setHex(0xffffff);m.emissiveIntensity=intensity;} else {m.emissive.setHex(m.userData.baseEmissive||0);m.emissiveIntensity=m.userData.baseEI||0;} }}
    if(this.state==='windup'){
      const p=clamp(this.stateTime/this.stateDuration,0,1);
      this.telegraph.material.opacity=.18+.58*p;
      this.telegraph.scale.setScalar(.85+.18*Math.sin(this.stateTime*12));
      this.telegraph.rotation.z+=dt*(this.isBoss?1.1:1.8);
    }else this.telegraph.material.opacity=damp(this.telegraph.material.opacity,0,18,dt);
  }
}
