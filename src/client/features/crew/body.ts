import {CrewFallback} from './fallback';
import * as T from 'three';
import {SKIN_TONES,HAIR_COLORS} from '../../../shared/avatar';
import {hash,SHIRTS,crewPose,type CrewEntry} from './layout';
interface Part {id:number;x:number;y:number;z:number;sx:number;sy:number;sz:number;rx:number;head:boolean;breath:boolean;shirt:boolean}
interface Figure {entry:CrewEntry;parts:Part[];born:number;leaving?:number;dirty?:boolean;lastSize?:number}
/** Person proportions, reduced tessellation, one material and one multi-draw batch. */
export class CrewBodies {
 readonly mesh:T.BatchedMesh|CrewFallback;
 private figures=new Map<string,Figure>();
 private geometries:number[];
 private matrix=new T.Matrix4();private local=new T.Matrix4();private root=new T.Matrix4();
 private position=new T.Vector3();private scale=new T.Vector3();private rotation=new T.Quaternion();private euler=new T.Euler();
 constructor(multiDraw=true){
  const mat=new T.MeshToonMaterial({color:0xffffff});mat.userData.outlineParameters={visible:false};
  this.mesh=multiDraw?new T.BatchedMesh(2400,12000,30000,mat):new CrewFallback(mat);this.mesh.name='cadre-crew-bodies';this.mesh.castShadow=false;this.mesh.receiveShadow=false;this.mesh.frustumCulled=false;
  const shapes=[new T.CapsuleGeometry(.26,.28,4,8),new T.SphereGeometry(.34,16,12),new T.SphereGeometry(1,8,6),new T.CapsuleGeometry(.1,.22,4,8),new T.CapsuleGeometry(.08,.24,4,8),new T.SphereGeometry(.35,12,8,0,Math.PI*2,0,Math.PI*.55),new T.TorusGeometry(.06,.015,4,8,Math.PI)];
  this.geometries=shapes.map(g=>this.mesh.addGeometry(g));shapes.forEach(g=>g.dispose());
 }
 sync(entries:CrewEntry[],now:number){
  for(const [key,f] of this.figures)if(f.leaving!==undefined){f.parts.forEach(p=>this.mesh.deleteInstance(p.id));this.figures.delete(key);}
  for(const [key,f] of this.figures)if(!entries.some(e=>e.seat.session===key))f.leaving??=now;
  for(const entry of entries){const key=entry.seat.session,old=this.figures.get(key);if(old){if(old.entry.seat.rig!==entry.seat.rig)for(const p of old.parts)if(p.shirt)this.mesh.setColorAt(p.id,new T.Color(SHIRTS[hash(entry.seat.rig)%SHIRTS.length]));old.dirty=JSON.stringify([old.entry.place,old.entry.seat.state])!==JSON.stringify([entry.place,entry.seat.state]);old.entry=entry;old.leaving=undefined;continue;}
   const h=hash(key),skin=SKIN_TONES[h%SKIN_TONES.length],hair=HAIR_COLORS[(h>>>4)%HAIR_COLORS.length],shirt=SHIRTS[hash(entry.seat.rig)%SHIRTS.length];
   const parts:Part[]=[];
   const add=(g:number,color:string,x:number,y:number,z:number,sx=1,sy=1,sz=1,rx=0,head=false,breath=false)=>{const id=this.mesh.addInstance(this.geometries[g]);this.mesh.setColorAt(id,new T.Color(color));parts.push({id,x,y,z,sx,sy,sz,rx,head,breath,shirt:color===shirt});};
   add(0,shirt,0,.72,0,1,1,1,0,false,true);add(1,skin,0,1.32,0,1,1,1,0,true,true);
   add(5,hair,0,1.34,-.015,1,1,1,0,true,true);
   if(h%3===1)add(2,hair,.17,1.58,-.1,.15,.15,.15,0,true,true);
   if(h%3===2)add(2,hair,0,1.52,-.23,.28,.16,.13,0,true,true);
   for(const s of [-1,1]){add(2,'#1d1d1d',s*.12,1.34,.30,.055,.055,.055,0,true,true);add(2,'#ff9f9f',s*.2,1.24,.27,.05,.05,.05,0,true,true);add(3,'#3d405b',s*.12,.25,0);add(4,shirt,s*.33,.72,0);add(2,skin,s*.33,.52,0,.085,.085,.085);}
   add(6,'#1d1d1d',0,1.24,.32,1,-1,1,0,true,true);
   this.figures.set(key,{entry,parts,born:now,dirty:true});
  }
 }
 tick(now:number,reduced:boolean){
  for(const [key,f] of this.figures){
   if(f.leaving!==undefined&&now-f.leaving>=.25){f.parts.forEach(p=>this.mesh.deleteInstance(p.id));this.figures.delete(key);continue;}
   const pose=crewPose(f.entry),progress=reduced?1:Math.min(1,(now-f.born)/.25),size=f.leaving!==undefined?Math.max(0,1-(now-f.leaving)/.25):1-(1-progress)**3;
   this.root.compose(this.position.set(pose.x,pose.y,pose.z),this.rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP,pose.rotY),this.scale.setScalar(size));
   const breath=!reduced&&['working','idle'].includes(f.entry.seat.state)?Math.sin(now*2+hash(key))*.012:0;
   const moving=f.lastSize!==size||size!==1||f.leaving!==undefined||f.dirty;
   for(const p of f.parts){if(!moving&&!(p.breath&&breath!==0))continue;let y=p.y+(pose.sit?pose.seatHeight-.42:0),z=p.z,rx=p.rx;
    if(p.y===.25&&pose.sit){y=pose.seatHeight-.1;z=.15;rx=-Math.PI/2;}
    if(p.head&&f.entry.seat.state==='stuck'){const dy=y-(1.32+(pose.sit?pose.seatHeight-.42:0));y=1.32+(pose.sit?pose.seatHeight-.42:0)+dy*Math.cos(.21)-z*Math.sin(.21);z=dy*Math.sin(.21)+z*Math.cos(.21);rx+=.21;}
    this.local.compose(this.position.set(p.x,y+(p.breath?breath:0),z),this.rotation.setFromEuler(this.euler.set(rx,0,0)),this.scale.set(p.sx,p.sy,p.sz));
    this.mesh.setMatrixAt(p.id,this.matrix.multiplyMatrices(this.root,this.local));
   }
   f.dirty=false;f.lastSize=size;
  }
 }
 dispose(){if(this.mesh instanceof T.BatchedMesh){this.mesh.geometry.dispose();(this.mesh.material as T.Material).dispose();}this.mesh.dispose();}
}
