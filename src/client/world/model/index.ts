import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NavGrid } from '../../../shared/nav';
import { BOARD_KEYS, type BoardPlace, type MapPlan, type BoardKey } from '../../../shared/maps';
import type { World } from '../world';
import type { Collider, Interactable } from '../types';
import { roomSign } from './sign';
import { releaseModel } from './resources';
import { furnishings } from './furniture';

export interface ModelSurfaces {
  screen: THREE.Mesh;
  whiteboard: THREE.Mesh;
  ready: Promise<void>;
  error: string | null;
}
export const modelSurfaces = new WeakMap<World, ModelSurfaces>();

export function buildModel(plan: MapPlan): World {
  const config = plan.config!.model!;
  const group = new THREE.Group();
  const interactables: Interactable[] = [];
  const colliders:Collider[] = [
    ...plan.obstacles!.rects.map(([minX,maxX,minZ,maxZ])=>({minX,maxX,minZ,maxZ,top:.8})),
    ...config.walls.map(w=>({...w, fence:true})),...(config.platforms??[]),
    {minX:plan.council!.x-1.3,maxX:plan.council!.x+1.3,minZ:plan.council!.z-1.3,maxZ:plan.council!.z+1.3,top:.78},
  ];
  const desks = furnishings(group,[...plan.desks,...plan.overflow,...plan.stations,...plan.meeting],interactables);
  const face = (p: BoardPlace, kind: Interactable['kind']) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),new THREE.MeshBasicMaterial({color:'#d9e3e8',toneMapped:false}));
    mesh.position.set(p.x,p.y,p.z); mesh.rotation.y=p.rotY;
    const it: Interactable={kind,x:p.x+Math.sin(p.rotY)*1.2,z:p.z+Math.cos(p.rotY)*1.2,radius:2.4};
    mesh.userData.interact=it; interactables.push(it); group.add(mesh); return mesh;
  };
  const boardMeshes = {} as Record<BoardKey,THREE.Mesh>;
  for (const key of BOARD_KEYS) {
    const p=plan.boards[key]; boardMeshes[key]=face(p,key);
    const label=roomSign(p.label);
    label.position.set(p.x,p.y+p.height/2+.3,p.z); label.rotation.y=p.rotY; group.add(label);
  }
  for(const label of config.labels??[]){
    const sign=roomSign(label.text);
    sign.position.set(label.x,2.2,label.z);sign.rotation.y=label.rotY;group.add(sign);
  }
  const cp=plan.council!;
  const table=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.08,24),new THREE.MeshStandardMaterial({color:'#927052',roughness:.6}));
  table.position.set(cp.x,.74,cp.z); group.add(table);
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.16,.35,.7,16),new THREE.MeshStandardMaterial({color:'#30353b',roughness:.6}));leg.position.set(cp.x,.35,cp.z);group.add(leg);
  const meeting: Interactable={kind:'meeting',x:cp.x,z:cp.z,radius:2.5}; table.userData.interact=meeting; interactables.push(meeting);
  const boardAt={x:cp.x-Math.sin(cp.rotY)*3.1,z:cp.z-Math.cos(cp.rotY)*3.1,y:1.95,width:2.3,height:1.4,rotY:cp.rotY};
  const meetingBoard=face(boardAt,'meeting');
  const meetingSign=face({...boardAt,y:.9,width:1.2,height:.34},'meeting');
  const screen=face(config.screen,'tv');
  const whiteboard=face(config.whiteboard,'whiteboard');
  // Interaction rays use low-poly furniture and wall proxies, never the architectural triangle soup.
  const pickables: THREE.Object3D[]=[...group.children];
  const invisible=new THREE.MeshBasicMaterial({visible:false});
  for(const w of config.walls){
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(w.maxX-w.minX,w.top,w.maxZ-w.minZ),invisible);
    proxy.position.set((w.minX+w.maxX)/2,w.top/2,(w.minZ+w.maxZ)/2);group.add(proxy);pickables.push(proxy);
  }
  const nav=new NavGrid(plan.bounds,plan.obstacles!);
  let disposed=false;
  let loaded:THREE.Group|undefined;
  const doors: {node:THREE.Object3D;closed:THREE.Vector3;center:THREE.Vector3;amount:number}[]=[];
  const status: ModelSurfaces={screen,whiteboard,ready:Promise.resolve(),error:null};
  const loader=new GLTFLoader(new THREE.LoadingManager());
  // Models are self-contained local GLBs; reject external texture/buffer requests.
  loader.manager.setURLModifier(url=>{
    if (url.startsWith('blob:') || url.startsWith('data:') || url===`/api/map-model/${config.asset}`) return url;
    throw new Error('Model assets must embed their textures and buffers');
  });
  status.ready=loader.loadAsync(`/api/map-model/${config.asset}`).then(gltf=>{
    if(disposed){releaseModel(gltf.scene);return;}
    loaded=gltf.scene;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o=>{
      if(o.name.startsWith('Door__')) doors.push({node:o,closed:o.position.clone(),center:new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()),amount:0});
      if(!(o instanceof THREE.Mesh)) return;
      o.geometry.computeBoundingSphere(); o.frustumCulled=true;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        m.userData.outlineParameters={visible:false};m.fog=false;
        if(!(m instanceof THREE.MeshStandardMaterial)) continue;
        const n=m.name.toLowerCase();
        if(n.includes('glass')) {m.transparent=true;m.opacity=.18;m.depthWrite=false;m.color.set('#91b7c5');m.roughness=.05;m.metalness=0;m.normalMap=null;m.side=THREE.DoubleSide;m.forceSinglePass=true;}
        else if(n.includes('marble')||n.includes('tiles')) {m.roughness=.2;m.envMapIntensity=1.2;}
        if(n.includes('poster')||n.includes('glow')) {m.emissive.set('#ffffff');m.emissiveMap=m.map;m.emissiveIntensity=1.6;}
      }
    });
    group.add(gltf.scene);
  }).catch(error=>{status.error=String(error);console.error('Model map failed',error);});
  const world: World={
    plan,group,colliders,interactables,pickables,desks,boardMeshes,meetingBoard,meetingSign,nav,
    ways:{home:(seat,from)=>({way:from?nav.route(from,[plan.door.x,plan.door.z]):nav.wayFrom(seat,[plan.door.x,plan.door.z]),chute:false}),in:seat=>nav.wayTo([plan.door.x,plan.door.z],seat)},
    rain:[{area:plan.bounds,top:()=>plan.height}],device:'laptop',room:{wall:.2,enclosed:true},
    setBeanbags(){return [];},setLook(){},setProjectName(){},update(_t,dt,people){
      const positions=[...people];
      for(const d of doors){const near=positions.some(p=>Math.hypot(p.x-d.center.x,p.z-d.center.z)<2.2&&Math.abs(p.y-d.center.y)<2.2);d.amount=THREE.MathUtils.damp(d.amount,near?1:0,9,dt);d.node.position.copy(d.closed);d.node.position.y+=d.amount*2.8;}
    },
    mood(lights){lights.hemi.intensity=.65;lights.hemi.color.set(0xe2efff);lights.hemi.groundColor.set(0x8c887b);lights.ambient.intensity=0;lights.sun.intensity=1.8;lights.sun.color.set(0xffedcf);lights.sun.position.set(-35,30,-12);lights.sun.target.position.set(12,0,-5);lights.sun.target.updateMatrixWorld();if(lights.scene.background instanceof THREE.Color)lights.scene.background.set('#c8d8e5'); if(lights.scene.fog instanceof THREE.Fog){lights.scene.fog.near=150;lights.scene.fog.far=300;}},
    dispose(){disposed=true;if(loaded){group.remove(loaded);releaseModel(loaded);}group.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.ownedTexture?.dispose();o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});},
  };
  modelSurfaces.set(world,status);
  return world;
}
