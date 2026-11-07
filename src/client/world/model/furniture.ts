import * as THREE from 'three';
import type {ModelChair,ModelLaptop} from '../../../shared/maps/model';
import type {StationKind} from '../../../shared/layout';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DeskDef } from '../../../shared/layout';
import type { DeskView, Interactable } from '../types';
import { mergeByMaterial } from '../toon';

export function furnishings(group: THREE.Group, defs: DeskDef[], interactables: Interactable[], lounges: {x:number;z:number;rugLength:number}[] = [], source?:Map<string,ModelChair>, floor: (id:string)=>number = ()=>0, sourceStations: readonly StationKind[] = [], laptops:ReadonlyMap<string,ModelLaptop> = new Map()) {
  const still = new THREE.Group();
  const oak = new THREE.MeshStandardMaterial({ color: '#aa8260', roughness: .6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#30353b', roughness: .5, metalness: .3 });
  const fabric = new THREE.MeshStandardMaterial({ color: '#353b41', roughness: .95 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ce733b', roughness: .95 });
  const carpet = new THREE.MeshStandardMaterial({color:'#44494c',roughness:1});
  const glow = new THREE.MeshBasicMaterial({ color: '#20323d', toneMapped: false });
  for(const mat of [oak,metal,fabric,orange,glow,carpet]) mat.userData.outlineParameters={visible:false};
  const hitMaterial=new THREE.MeshBasicMaterial({visible:false});
  const screenInk=new THREE.MeshBasicMaterial({color:'#7aa0ae',toneMapped:false});
  screenInk.userData.outlineParameters={visible:false};
  const desks = new Map<string, DeskView>();
  const box = (g: THREE.Group, size: number[], pos: number[], mat: THREE.Material) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],1,Math.min(.025,...size.map(n=>n/4))), mat);
    m.position.set(...pos as [number,number,number]); g.add(m);
  };
  const work=defs.filter(d=>d.id.startsWith('desk-'));
  for(const p of lounges){
    box(still,[2.6,.012,p.rugLength],[p.x,.018,p.z],carpet);
    box(still,[.6,.065,1.2],[p.x,.3675,p.z],oak);
    box(still,[.22,.33,.75],[p.x,.165,p.z],metal);
  }
  if(!source)for(const y of new Set(work.map(d=>floor(d.id)))){const seats=work.filter(d=>floor(d.id)===y),xs=seats.map(d=>d.x),zs=seats.map(d=>d.z);box(still,[Math.max(...xs)-Math.min(...xs)+2,.012,Math.max(...zs)-Math.min(...zs)+2.6],[(Math.max(...xs)+Math.min(...xs))/2,y+.018,(Math.max(...zs)+Math.min(...zs))/2+.5],carpet);}
  for (const def of defs) {
    const soft = def.id.startsWith('beanbag');
    const y=floor(def.id);
    const g = new THREE.Group(); g.position.set(def.x,y,def.z); g.rotation.y=def.rotY;
    const shape = new THREE.Group(); shape.position.copy(g.position); shape.rotation.copy(g.rotation);
    if(source?.has(def.id)) {
      // The local model already contains this seat and its furniture.
    } else if (soft) {
      const charcoal = (Number(def.id.split('-')[1])-1)%6>=4;
      const cushion = new THREE.Mesh(new THREE.SphereGeometry(.407,16,10), charcoal ? fabric : orange);
      cushion.scale.set(1,.6,1.05); cushion.position.set(0,.2192,.85); shape.add(cushion);
      const contact = new THREE.Mesh(new THREE.CylinderGeometry(.363,.363,.005,16),fabric);
      contact.scale.z=1.05;contact.position.set(0,.027,.85);shape.add(contact);
    } else if (def.station && sourceStations.includes(def.station)) {
      // The model supplies this kiosk; keep only its interaction and seat anchors.
    } else if (!def.room) {
      box(shape,[1.6,.07,.8],[0,.75,0],oak);
      box(shape,[.42,.018,.15],[0,.797,.17],metal);
      for (const x of [-.67,.67]) box(shape,[.06,.71,.65],[x,.355,0],metal);
      box(shape,[.6,.09,.55],[0,.46,.85],fabric);
      box(shape,[.6,.55,.08],[0,.76,1.12],fabric);
      box(shape,[.06,.43,.06],[0,.215,.85],metal);
      box(shape,[.6,.04,.6],[0,.05,.85],metal);
      box(shape,[.65,.38,.05],[0,1.1,-.21],metal);
      box(shape,[.6,.33,.012],[0,1.1,-.18],glow);
      for(const [i,width] of [.4,.28,.35].entries())box(shape,[width,.015,.004],[-.04,1.16-i*.06,-.171],screenInk);
      box(shape,[.05,.18,.05],[0,.85,-.21],metal);
    } else {
      box(shape,[.6,.09,.55],[0,.46,.85],fabric);
      box(shape,[.6,.55,.08],[0,.76,1.12],fabric);
      box(shape,[.06,.43,.06],[0,.215,.85],metal);
    }
    still.add(shape);
    const laptopAnchor = new THREE.Object3D(); laptopAnchor.position.set(0,soft?.4:.8,0); g.add(laptopAnchor);
    const seatAnchor = new THREE.Object3D(); seatAnchor.position.set(0,soft?.18:.38,.85); seatAnchor.rotation.y=Math.PI; seatAnchor.scale.setScalar(.82); g.add(seatAnchor);
    const anchored=source?.get(def.id);if(anchored){
      seatAnchor.position.y=anchored.y-y;
      if(anchored.sit)seatAnchor.position.z=0;
      seatAnchor.rotation.y=anchored.rotY-def.rotY;
      laptopAnchor.position.y=.8;
    }
    const laptop=laptops.get(def.id);
    if(laptop){
      g.updateMatrixWorld(true);
      laptopAnchor.position.copy(g.worldToLocal(new THREE.Vector3(laptop.x,laptop.y,laptop.z)));
      // The screen's local normal is +Z; the sitter looks toward it along their facing.
      laptopAnchor.rotation.y=laptop.rotY+Math.PI-def.rotY;
    }
    const stage = new THREE.Object3D(); stage.position.set(.55,0,.85); g.add(stage);
    const vacancy = new THREE.Group(); if(def.station) vacancy.add(seatAnchor.clone()); g.add(vacancy);
    const it: Interactable = {kind:def.station?'station':'desk',deskId:def.id,x:def.x+Math.sin(def.rotY)*1.1,y,z:def.z+Math.cos(def.rotY)*1.1,radius:1.25};
    const hit=new THREE.Mesh(new THREE.BoxGeometry(soft?.81:1.5,soft?.46:1.3,soft?.85:1.8),hitMaterial);hit.position.set(0,soft?.23:.65,soft?.85:.4);g.add(hit);
    g.userData.interact=it; interactables.push(it); group.add(g);
    desks.set(def.id,{def,group:g,laptopAnchor,seatAnchor,stage,chair:new THREE.Group(),vacancy,vacancyY:1.4});
  }
  group.add(mergeByMaterial(still));
  return desks;
}
