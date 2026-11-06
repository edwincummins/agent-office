import * as T from 'three';
/** Without multi-draw, share one instanced draw per part geometry (seven, not one per person). */
export class CrewFallback extends T.Group {
 private batches:T.InstancedMesh[]=[];private free:number[][]=[];private slots=new Map<number,{geometry:number;slot:number}>();private next=0;
 constructor(private material:T.Material){super();}
 addGeometry(geometry:T.BufferGeometry){const mesh=new T.InstancedMesh(geometry.clone(),this.material,1024);mesh.count=0;mesh.frustumCulled=false;this.add(mesh);this.free.push([]);return this.batches.push(mesh)-1;}
 addInstance(geometry:number){const mesh=this.batches[geometry],slot=this.free[geometry].pop()??mesh.count++;if(slot>=1024)throw new Error('Crew geometry capacity exceeded');const id=this.next++;this.slots.set(id,{geometry,slot});return id;}
 setColorAt(id:number,color:T.Color){const s=this.slots.get(id)!;this.batches[s.geometry].setColorAt(s.slot,color);this.batches[s.geometry].instanceColor!.needsUpdate=true;}
 setMatrixAt(id:number,matrix:T.Matrix4){const s=this.slots.get(id)!;this.batches[s.geometry].setMatrixAt(s.slot,matrix);this.batches[s.geometry].instanceMatrix.needsUpdate=true;}
 deleteInstance(id:number){const s=this.slots.get(id);if(!s)return;this.setMatrixAt(id,new T.Matrix4().makeScale(0,0,0));this.free[s.geometry].push(s.slot);this.slots.delete(id);}
 dispose(){for(const m of this.batches){m.dispose();m.geometry.dispose();}this.material.dispose();this.clear();}
}
