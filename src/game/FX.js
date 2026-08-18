import * as THREE from 'three';

const V = THREE.Vector3;

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.clock = 0;
    this._geo = {
      orb: new THREE.SphereGeometry(.09, 8, 6),
      spark: new THREE.TetrahedronGeometry(.07, 0),
      slash: new THREE.TorusGeometry(1.05,.045,6,36,Math.PI*.92),
      ring: new THREE.RingGeometry(.6,.68,36),
      shard: new THREE.ConeGeometry(.055,.35,5),
    };
  }

  add(obj, life, updater) {
    this.scene.add(obj);
    this.effects.push({ obj, life, maxLife: life, updater });
    return obj;
  }

  burst(position, color=0xffbe78, count=14, force=4, size=1) {
    for (let i=0;i<count;i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1, depthWrite:false, blending:THREE.AdditiveBlending });
      const m = new THREE.Mesh(i%3===0?this._geo.shard:this._geo.spark, mat);
      m.scale.setScalar(size*(.6+Math.random()*.8));
      m.position.copy(position).add(new V((Math.random()-.5)*.3,Math.random()*.3,(Math.random()-.5)*.3));
      const vel = new V((Math.random()-.5)*force, Math.random()*force*.75+.4, (Math.random()-.5)*force);
      const spin = new V(Math.random()*8,Math.random()*8,Math.random()*8);
      this.add(m,.35+Math.random()*.35,(e,dt,t)=>{
        vel.y -= 8*dt;
        e.obj.position.addScaledVector(vel,dt);
        e.obj.rotation.x += spin.x*dt; e.obj.rotation.y += spin.y*dt; e.obj.rotation.z += spin.z*dt;
        e.obj.material.opacity = Math.pow(1-t,1.5);
        e.obj.scale.multiplyScalar(1-dt*1.8);
      });
    }
  }

  slash(position, rotationY, combo=0) {
    const colors=[0xd8ffe2,0xa8efcf,0xffd07b];
    const mat=new THREE.MeshBasicMaterial({color:colors[combo%3],transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const m=new THREE.Mesh(this._geo.slash,mat);
    m.position.copy(position).add(new V(0,1.15,0));
    m.rotation.set(Math.PI/2.5, rotationY-(Math.PI*.46), combo===2?-.65:.25);
    m.scale.setScalar(combo===2?1.25:1);
    this.add(m,.16,(e,dt,t)=>{
      e.obj.scale.multiplyScalar(1+dt*5);
      e.obj.material.opacity=(1-t)*.9;
    });
  }

  ring(position, color=0x7cf2d1, start=.3, end=3.2, life=.35) {
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const m=new THREE.Mesh(this._geo.ring,mat);
    m.rotation.x=-Math.PI/2;
    m.position.copy(position).add(new V(0,.04,0));
    m.scale.setScalar(start);
    this.add(m,life,(e,dt,t)=>{
      const s=THREE.MathUtils.lerp(start,end,1-Math.pow(1-t,2));
      e.obj.scale.setScalar(s);
      e.obj.material.opacity=(1-t)*.75;
    });
  }

  dashTrail(position, color=0x89d7e7) {
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending});
    const m=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.9,4,8),mat);
    m.position.copy(position).add(new V(0,.8,0));
    m.rotation.z=Math.PI/2;
    this.add(m,.22,(e,dt,t)=>{e.obj.material.opacity=(1-t)*.3;e.obj.scale.multiplyScalar(1+dt*1.5);});
  }

  projectileTrail(position, color=0xff8e57) {
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending});
    const m=new THREE.Mesh(this._geo.orb,mat);
    m.position.copy(position);
    m.scale.setScalar(.6+Math.random()*.9);
    this.add(m,.22,(e,dt,t)=>{e.obj.material.opacity=(1-t)*.65;e.obj.scale.setScalar(Math.max(.02,(1-t)*1.2));});
  }

  heal(position) {
    for(let i=0;i<10;i++){
      const mat=new THREE.MeshBasicMaterial({color:0x8dffbd,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending});
      const m=new THREE.Mesh(this._geo.orb,mat);
      m.position.copy(position).add(new V((Math.random()-.5)*.8,.2+Math.random()*.6,(Math.random()-.5)*.8));
      const phase=Math.random()*Math.PI*2;
      this.add(m,.8+Math.random()*.5,(e,dt,t)=>{
        e.obj.position.y+=dt*(.8+Math.random()*.3);
        e.obj.position.x+=Math.sin(this.clock*5+phase)*dt*.25;
        e.obj.material.opacity=Math.sin(Math.PI*t)*.75;
      });
    }
  }

  levelUp(position) {
    this.ring(position,0xffdd80,.4,4.2,.7);
    this.ring(position,0x92ffd0,.2,2.7,.9);
    for(let i=0;i<26;i++){
      const a=Math.random()*Math.PI*2;
      const r=.4+Math.random()*1.1;
      const mat=new THREE.MeshBasicMaterial({color:i%2?0xffd979:0xa1f1d0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      const m=new THREE.Mesh(this._geo.spark,mat);
      m.position.copy(position).add(new V(Math.cos(a)*r,.2+Math.random()*.4,Math.sin(a)*r));
      const rise=1.5+Math.random()*3;
      this.add(m,1+Math.random()*.5,(e,dt,t)=>{e.obj.position.y+=rise*dt;e.obj.rotation.y+=dt*7;e.obj.material.opacity=(1-t);});
    }
  }

  update(dt) {
    this.clock += dt;
    for (let i=this.effects.length-1;i>=0;i--) {
      const e=this.effects[i];
      e.life-=dt;
      const t=1-Math.max(0,e.life)/e.maxLife;
      e.updater?.(e,dt,t);
      if(e.life<=0){
        this.scene.remove(e.obj);
        e.obj.traverse?.(o=>{if(o.material?.dispose && o.userData.disposeMaterial)o.material.dispose();});
        this.effects.splice(i,1);
      }
    }
  }
}
