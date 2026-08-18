import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const V = THREE.Vector3;

function mat(color, roughness=.8, metalness=0, emissive=0x000000, emissiveIntensity=0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, flatShading:true });
}

export class World {
  constructor(scene, renderer, quality='high') {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.portal = null;
    this.portalRing = null;
    this.portalLight = null;
    this.fireflies = [];
    this.time = 0;
    this.arenaRadius = 28;
    this._build();
  }

  _build() {
    this.scene.background = new THREE.Color(0x8aa6a0);
    this.scene.fog = new THREE.FogExp2(0x78968d, .022);

    const sky = new Sky();
    sky.scale.setScalar(420);
    const su = sky.material.uniforms;
    su.turbidity.value = 5.2; su.rayleigh.value = 1.35; su.mieCoefficient.value = .007; su.mieDirectionalG.value = .86;
    const sunDir = new THREE.Vector3();
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(66), THREE.MathUtils.degToRad(225));
    su.sunPosition.value.copy(sunDir);
    this.scene.add(sky);

    const cloudMat = new THREE.MeshStandardMaterial({ color:0xe9eee2, roughness:1, transparent:true, opacity:.42, depthWrite:false, flatShading:true });
    for(let i=0;i<(this.quality==='high'?14:7);i++){
      const cg=new THREE.Group(); const a=(i/14)*Math.PI*2+.3, rr=46+Math.random()*30; cg.position.set(Math.cos(a)*rr,18+Math.random()*12,Math.sin(a)*rr);
      for(let j=0;j<3+Math.floor(Math.random()*3);j++){ const c=new THREE.Mesh(new THREE.IcosahedronGeometry(2.5+Math.random()*2.8,1),cloudMat); c.scale.set(1.8+Math.random(),.45+.2*Math.random(),1); c.position.set(j*2.6+(Math.random()-.5)*2,(Math.random()-.5)*1.2,(Math.random()-.5)*2); cg.add(c); } this.scene.add(cg);
    }

    const hemi = new THREE.HemisphereLight(0xcce7d9, 0x29372c, 1.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe7bb, 4.1);
    sun.position.set(-18, 28, 13);
    sun.castShadow = true;
    const sr = this.renderer.shadowMap.type === THREE.PCFSoftShadowMap ? 22 : 18;
    sun.shadow.mapSize.set(this.quality==='high'?2048:1024,this.quality==='high'?2048:1024);
    sun.shadow.camera.left=-sr; sun.shadow.camera.right=sr; sun.shadow.camera.top=sr; sun.shadow.camera.bottom=-sr;
    sun.shadow.camera.near=1; sun.shadow.camera.far=75;
    sun.shadow.bias=-.00025;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x7dd7c9, .85);
    fill.position.set(15,10,-15);
    this.scene.add(fill);

    const groundMat = new THREE.MeshStandardMaterial({ color:0x466953, roughness:.98, metalness:0, flatShading:true });
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(30,31,1,48,1,false), groundMat);
    ground.position.y=-.55; ground.receiveShadow=true; this.decor.add(ground);

    const inner = new THREE.Mesh(new THREE.CircleGeometry(21,40), mat(0x58755a,.98));
    inner.rotation.x=-Math.PI/2; inner.position.y=.008; inner.receiveShadow=true; this.decor.add(inner);

    const stoneMat = mat(0x718075,.94);
    for(let i=0;i<17;i++){
      const z=15-i*1.8;
      const x=Math.sin(i*.58)*2.1;
      const slab=new THREE.Mesh(new THREE.CylinderGeometry(1.05+Math.random()*.45,1.1+Math.random()*.45,.12,6),stoneMat);
      slab.position.set(x,.065,z); slab.scale.z=.72; slab.rotation.y=Math.random()*.8; slab.receiveShadow=true; slab.castShadow=true; this.decor.add(slab);
    }

    this._buildRuin(-8,0,-6,1.0);
    this._buildRuin(10,0,5,.78);
    this._buildShrine(0,0,-17);

    for(let i=0;i<(this.quality==='high'?42:28);i++){
      const a=(i/(this.quality==='high'?42:28))*Math.PI*2 + (Math.random()-.5)*.12;
      const r=22.5+Math.random()*6.7;
      if(Math.abs(Math.sin(a))<.14 && Math.cos(a)>.4) continue;
      this._tree(Math.cos(a)*r,Math.sin(a)*r,.8+Math.random()*.75,i);
    }

    [[-14,-4],[14,-8],[-11,10],[12,13],[-5,-14],[17,2]].forEach(([x,z],i)=>this._tree(x,z,.72+Math.random()*.35,80+i));

    const rockMat=mat(0x5d6961,.95);
    for(let i=0;i<(this.quality==='high'?34:20);i++){
      const a=Math.random()*Math.PI*2, r=7+Math.random()*21;
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.3+Math.random()*.7,0),rockMat);
      rock.position.set(Math.cos(a)*r,.12,Math.sin(a)*r); rock.scale.set(1,.6+Math.random()*.8,.8+Math.random()*.7); rock.rotation.set(Math.random(),Math.random()*6,Math.random()); rock.castShadow=true; rock.receiveShadow=true; this.decor.add(rock);
    }
    for(let i=0;i<(this.quality==='high'?50:28);i++) this._plant(i);
    for(let i=0;i<9;i++) this._crystal(i);

    this._buildPortal();
    this._buildFireflies();
  }

  _tree(x,z,s=1,seed=0) {
    const g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); g.rotation.y=(seed*2.37)%6.28;
    const trunkMat=mat(seed%3===0?0x59483b:0x66503e,.98);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.36,.56,4.2,7),trunkMat); trunk.position.y=2.1; trunk.castShadow=true; trunk.receiveShadow=true; g.add(trunk);
    for(let j=0;j<4;j++){
      const root=new THREE.Mesh(new THREE.ConeGeometry(.22,1.15,5),trunkMat); root.rotation.z=Math.PI/2.7; root.rotation.y=j*Math.PI/2+.3; root.position.set(Math.cos(j*Math.PI/2)*.45,.18,Math.sin(j*Math.PI/2)*.45); root.castShadow=true; g.add(root);
    }
    const greens=[0x2f654d,0x39775a,0x477e59,0x2d5d50];
    for(let j=0;j<5;j++){
      const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6+(j%2)*.25,1),mat(greens[(seed+j)%greens.length],.9));
      const a=j/5*Math.PI*2;
      crown.position.set(Math.cos(a)*.82,4.15+(j%3)*.48,Math.sin(a)*.82); crown.scale.set(1.05,.85,1.05); crown.castShadow=true; crown.receiveShadow=true; g.add(crown);
    }
    if(seed%5===0){
      const lantern=new THREE.Mesh(new THREE.SphereGeometry(.08,8,6),new THREE.MeshBasicMaterial({color:0xffd783}));
      lantern.position.set(.65,3.05,.2); g.add(lantern);
    }
    this.decor.add(g);
  }

  _plant(i){
    const a=Math.random()*Math.PI*2,r=4+Math.random()*23,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(i%4===0){
      const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=Math.random()*6;
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.23,8,5,0,Math.PI*2,0,Math.PI/2),mat(i%8===0?0xd46f63:0xc8a15b,.8)); cap.position.y=.28; cap.scale.y=.55; g.add(cap);
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,.26,6),mat(0xe0d2aa,.9)); stem.position.y=.13;g.add(stem);this.decor.add(g);
    }else{
      const group=new THREE.Group(); group.position.set(x,0,z);
      const leafMat=mat(i%3?0x3e7352:0x5d8457,.95);
      for(let j=0;j<3;j++){
        const leaf=new THREE.Mesh(new THREE.ConeGeometry(.08,.5,4),leafMat); leaf.position.y=.22; leaf.rotation.z=(j-1)*.5; leaf.rotation.y=j*2.1; group.add(leaf);
      }
      this.decor.add(group);
    }
  }

  _crystal(i){
    const a=(i/9)*Math.PI*2+.35,r=15+((i*3)%5),x=Math.cos(a)*r,z=Math.sin(a)*r;
    const g=new THREE.Group();g.position.set(x,0,z);
    const c= i%2?0x67e3bd:0xe9b963;
    for(let j=0;j<3;j++){
      const shard=new THREE.Mesh(new THREE.OctahedronGeometry(.28+Math.random()*.18,0),new THREE.MeshStandardMaterial({color:c,roughness:.25,emissive:c,emissiveIntensity:.35,flatShading:true}));
      shard.scale.y=2+Math.random()*1.6; shard.position.set((j-1)*.28,.45+Math.random()*.2,(Math.random()-.5)*.25); shard.rotation.z=(j-1)*.18; shard.castShadow=true; g.add(shard);
    }
    this.decor.add(g);
  }

  _buildRuin(x,y,z,s){
    const g=new THREE.Group(); g.position.set(x,y,z); g.scale.setScalar(s); g.rotation.y=.25;
    const stone=mat(0x778176,.96); const moss=mat(0x4e7050,.98);
    const makeColumn=(px,pz,h)=>{ const base=new THREE.Mesh(new THREE.CylinderGeometry(.55,.68,.32,8),stone);base.position.set(px,.16,pz);base.castShadow=true;g.add(base); const col=new THREE.Mesh(new THREE.CylinderGeometry(.36,.42,h,8),stone);col.position.set(px,.32+h/2,pz);col.castShadow=true;g.add(col); const top=new THREE.Mesh(new THREE.BoxGeometry(1,.25,.85),stone);top.position.set(px,.32+h+.12,pz);top.rotation.y=.1;top.castShadow=true;g.add(top); };
    makeColumn(-1.7,0,2.6);makeColumn(1.7,0,1.75);
    const arch=new THREE.Mesh(new THREE.BoxGeometry(4.2,.42,.75),stone);arch.position.set(0,3.1,0);arch.rotation.z=.05;arch.castShadow=true;g.add(arch);
    const mossStrip=new THREE.Mesh(new THREE.BoxGeometry(2.4,.09,.79),moss);mossStrip.position.set(-.7,3.33,.02);g.add(mossStrip);
    this.decor.add(g);
  }

  _buildShrine(x,y,z){
    const g=new THREE.Group();g.position.set(x,y,z);
    const stone=mat(0x687872,.9); const gold=mat(0xc0a25d,.42,.45,0x8f6b2e,.08);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.3,3.7,.5,8),stone);base.position.y=.25;base.castShadow=true;base.receiveShadow=true;g.add(base);
    for(let i=0;i<5;i++){
      const step=new THREE.Mesh(new THREE.CylinderGeometry(2.2-i*.25,2.45-i*.25,.23,8),stone);step.position.y=.5+i*.17;step.castShadow=true;g.add(step);
    }
    const ob=new THREE.Mesh(new THREE.CylinderGeometry(.42,.65,3.6,6),stone);ob.position.y=2.7;ob.castShadow=true;g.add(ob);
    const rune=new THREE.Mesh(new THREE.TorusGeometry(.55,.06,6,24),gold);rune.position.set(0,3.0,.42);g.add(rune);
    this.decor.add(g);
  }

  _buildPortal(){
    const g=new THREE.Group();g.position.set(0,0,-18);this.decor.add(g);this.portal=g;
    const stone=mat(0x5e6d67,.9);
    const left=new THREE.Mesh(new THREE.BoxGeometry(1.05,4.8,1.1),stone);left.position.set(-2,2.4,0);left.rotation.z=-.06;left.castShadow=true;g.add(left);
    const right=left.clone();right.position.x=2;right.rotation.z=.06;g.add(right);
    const top=new THREE.Mesh(new THREE.BoxGeometry(4.5,.85,1.1),stone);top.position.set(0,4.75,0);top.castShadow=true;g.add(top);
    const ringMat=new THREE.MeshBasicMaterial({color:0x79ebc8,transparent:true,opacity:.13,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.55,.1,8,48),ringMat);ring.position.set(0,2.55,.02);g.add(ring);this.portalRing=ring;
    const disc=new THREE.Mesh(new THREE.CircleGeometry(1.48,48),new THREE.MeshBasicMaterial({color:0x5ed0b6,transparent:true,opacity:.03,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));disc.position.set(0,2.55,.02);g.add(disc);this.portalDisc=disc;
    const light=new THREE.PointLight(0x75eac5,0,8,2);light.position.set(0,2.5,1);g.add(light);this.portalLight=light;
  }

  _buildFireflies(){
    const geo=new THREE.SphereGeometry(.035,6,4);
    for(let i=0;i<(this.quality==='high'?34:20);i++){
      const c=i%5===0?0xffd17a:0x91f5c9;
      const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.5+Math.random()*.5}));
      const a=Math.random()*Math.PI*2,r=5+Math.random()*24;
      m.position.set(Math.cos(a)*r,.5+Math.random()*4.5,Math.sin(a)*r);
      m.userData={base:m.position.clone(),phase:Math.random()*6.28,speed:.6+Math.random()*1.5};
      this.decor.add(m);this.fireflies.push(m);
    }
  }

  unlockPortal(){
    this.portal.userData.unlocked=true;
  }

  update(dt){
    this.time+=dt;
    for(const f of this.fireflies){
      const u=f.userData;
      f.position.x=u.base.x+Math.sin(this.time*u.speed+u.phase)*.45;
      f.position.y=u.base.y+Math.sin(this.time*u.speed*.7+u.phase*2)*.32;
      f.position.z=u.base.z+Math.cos(this.time*u.speed*.8+u.phase)*.4;
      f.material.opacity=.3+.55*(.5+.5*Math.sin(this.time*2+u.phase));
    }
    if(this.portal?.userData.unlocked){
      const pulse=.5+.5*Math.sin(this.time*2.8);
      this.portalRing.material.opacity=.48+pulse*.25;
      this.portalRing.rotation.z+=dt*.25;
      this.portalDisc.material.opacity=.12+pulse*.08;
      this.portalLight.intensity=2.2+pulse*1.6;
    } else {
      this.portalRing.rotation.z+=dt*.08;
    }
  }

  clampToArena(pos){
    const d=Math.hypot(pos.x,pos.z);
    if(d>this.arenaRadius){ const s=this.arenaRadius/d; pos.x*=s;pos.z*=s; }
  }
}
