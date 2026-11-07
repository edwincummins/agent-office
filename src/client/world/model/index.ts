import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NavGrid, type Obstacles } from '../../../shared/nav';
import { BOARD_KEYS, type BoardPlace, type MapPlan, type BoardKey } from '../../../shared/maps';
import type { World } from '../world';
import type { Collider, Interactable } from '../types';
import { roomSign } from './sign';
import { releaseModel,retainModelTextures } from './resources';
import { ModelNav } from './navigation';
import {retryModelLoad} from './retry';
import {modelColliders} from './colliders';
import { furnishings } from './furniture';
import { seatFloor } from '../../../shared/levels/attach';
import { mergeOpaqueModelMeshes } from './merge';
import { modelDecor } from './decor';
import { authoredEmissionMaterials } from '../../features/model-effects/emission';
import type { ModelChair } from '../../../shared/maps/model';

export interface ModelSurfaces {
  screen: THREE.Mesh | null;
  whiteboard: THREE.Mesh;
  ready: Promise<void>;
  error: string | null;
}
export const modelSurfaces = new WeakMap<World, ModelSurfaces>();

export function buildModel(plan: MapPlan): World {
  const config = plan.config!.model!;
  const group = new THREE.Group();
  const interactables: Interactable[] = [];
  const colliders=modelColliders(plan,config);
  const authoredChairs = config.source ? new Map<string,ModelChair>() : undefined;
  if(authoredChairs&&config.source){
    [...plan.desks,...plan.overflow].forEach((d,i)=>authoredChairs.set(d.id,config.source!.chairs[i]));
    plan.meeting.forEach((d,i)=>authoredChairs.set(d.id,config.source!.council[i]));
    for(const d of plan.stations){const chair=config.source.stationChairs?.[d.station!];if(chair)authoredChairs.set(d.id,chair);}
  }
  const laptops=new Map(config.seats.flatMap((seat,i)=>seat.laptop?[[[...plan.desks,...plan.overflow][i].id,seat.laptop] as const]:[]));
  const desks = furnishings(group,[...plan.desks,...plan.overflow,...plan.stations,...plan.meeting],interactables,config.lounges,authoredChairs,id=>seatFloor(plan,id),config.source?.stations,laptops);
  const face = (p: BoardPlace, kind: Interactable['kind']) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),new THREE.MeshBasicMaterial({color:'#d9e3e8',toneMapped:false}));
    mesh.position.set(p.x,p.y,p.z); mesh.rotation.y=p.rotY;
    const it: Interactable={kind,x:p.x+Math.sin(p.rotY)*1.2,z:p.z+Math.cos(p.rotY)*1.2,y:Math.max(0,...(plan.levels?.floors.filter(f=>f.y<=p.y-p.height/2+.3&&p.x>=f.minX&&p.x<=f.maxX&&p.z>=f.minZ&&p.z<=f.maxZ).map(f=>f.y)??[])),radius:2.4};
    mesh.userData.interact=it; interactables.push(it); group.add(mesh); return mesh;
  };
  const boardMeshes = {} as Record<BoardKey,THREE.Mesh>;
  for (const key of BOARD_KEYS) {
    const p=plan.boards[key]; boardMeshes[key]=face(p,key);
    const label=roomSign(p.label); boardMeshes[key].userData.boardLabel=label;
    label.position.set(p.x,p.y+p.height/2+.3,p.z); label.rotation.y=p.rotY; group.add(label);
  }
  for(const label of config.labels??[]){
    const sign=roomSign(label.text);
    sign.position.set(label.x,2.2,label.z);sign.rotation.y=label.rotY;group.add(sign);
  }
  const cp=plan.council!, councilY=seatFloor(plan,plan.meeting[0].id);
  const table=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.08,24),new THREE.MeshStandardMaterial({color:'#927052',roughness:.6}));
  table.position.set(cp.x,councilY+.74,cp.z); table.material.visible=!config.source;group.add(table);
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.16,.35,.7,16),new THREE.MeshStandardMaterial({color:'#30353b',roughness:.6}));leg.position.set(cp.x,councilY+.35,cp.z);if(!config.source)group.add(leg);else{leg.geometry.dispose();leg.material.dispose();}
  const meeting: Interactable={kind:'meeting',x:cp.x,y:councilY,z:cp.z,radius:2.5}; table.userData.interact=meeting; interactables.push(meeting);
  const boardAt=config.source?.meetingBoard??{x:cp.x-Math.sin(cp.rotY)*3.1,z:cp.z-Math.cos(cp.rotY)*3.1,y:councilY+1.95,width:2.3,height:1.4,rotY:cp.rotY};
  const meetingBoard=face(boardAt,'meeting');
  const meetingSign=config.source?undefined:face({...boardAt,y:councilY+.9,width:1.2,height:.34},'meeting');
  const screen=config.screen?face(config.screen,'tv'):null;
  const whiteboard=face(config.whiteboard,'whiteboard');
  // Interaction rays use low-poly furniture and wall proxies, never the architectural triangle soup.
  const pickables: THREE.Object3D[]=[...group.children];
  const invisible=new THREE.MeshBasicMaterial({visible:false});
  for(const w of config.walls){
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(w.maxX-w.minX,w.top-(w.bottom??0),w.maxZ-w.minZ),invisible);
    proxy.position.set((w.minX+w.maxX)/2,(w.top+(w.bottom??0))/2,(w.minZ+w.maxZ)/2);group.add(proxy);pickables.push(proxy);
  }
  const chairs=new Map(config.source?[...plan.desks,...plan.overflow,...plan.meeting].map((d,i)=>[d.id,i<32?config.source!.chairs[i]:config.source!.council[i-32]]):[]);
  const navigation=(obstacles: Obstacles)=>config.source?new ModelNav(plan.bounds,obstacles,chairs):new NavGrid(plan.bounds,obstacles);
  const nav=navigation(plan.obstacles!);
  // Plants, signs and lamps the owner can move one by one (Arrange mode): never merged into the room.
  const decor=modelDecor(group,plan.config!.decor);
  let disposed=false;const download=new AbortController();
  let loaded:THREE.Group|undefined;
  const doors: {node:THREE.Object3D;closed:THREE.Vector3;center:THREE.Vector3;amount:number}[]=[];
  const status: ModelSurfaces={screen,whiteboard,ready:Promise.resolve(),error:null};
  const loader=new GLTFLoader(new THREE.LoadingManager());
  // Models are self-contained local GLBs; reject external texture/buffer requests.
  loader.manager.setURLModifier(url=>{
    if (url.startsWith('blob:') || url.startsWith('data:') || url===`/api/map-model/${config.asset}`) return url;
    throw new Error('Model assets must embed their textures and buffers');
  });
  status.ready=retryModelLoad(()=>loader.loadAsync(`/api/map-model/${config.asset}`),download.signal).then(gltf=>{
    if(disposed){releaseModel(gltf.scene);return;}
    loaded=gltf.scene;retainModelTextures(loaded);
    gltf.scene.updateMatrixWorld(true);
    const authoredEmission = authoredEmissionMaterials(gltf.scene);
    gltf.scene.traverse(o=>{
      if(o.name.startsWith('Door__')) doors.push({node:o,closed:o.position.clone(),center:new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()),amount:0});
      if(!(o instanceof THREE.Mesh)) return;
      o.geometry.computeBoundingSphere(); o.frustumCulled=true;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        m.userData.localModel=true;m.userData.outlineParameters={visible:false};m.fog=false;
        if(!(m instanceof THREE.MeshStandardMaterial)) continue;
        const n=m.name.toLowerCase();
        // Steady at grazing angles: without anisotropy fine textures (the dais's stone tiles) shimmer into stripes as you
        // move (Fetty, 11-06). three clamps it to what the GPU supports.
        for(const t of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.aoMap,m.emissiveMap]) if(t&&t.anisotropy<8){t.anisotropy=8;t.needsUpdate=true;}
        // Glass the map tints on purpose ("interior-glass-#5a5044-0.4": a colour and a strength of 0.3 or more, like the round
        // room's smoked bronze) keeps its look; plain glass gets the office's own (Fetty, 11-06: the bronze never showed).
        const tint=/glass-(#[0-9a-f]{6})-([0-9.]+)/.exec(n), tinted=!!tint&&Number(tint[2])>=.3;
        if(n.includes('glass')) {o.renderOrder=0;const interior=n.includes('interior')||n.includes('partition');m.transparent=true;m.opacity=tinted?Math.min(.75,Number(tint![2])):interior?.13:.3;m.depthWrite=false;m.color.set(tinted?tint![1]:interior?'#c4c6c5':'#91b7c5');m.roughness=.05;m.metalness=0;m.normalMap=null;m.side=THREE.DoubleSide;m.forceSinglePass=true;}
        else if(n.includes('marble')||n.includes('tiles')) {m.roughness=.2;m.envMapIntensity=1.2;}
        if(!authoredEmission.has(m)&&(n.includes('poster')||n.includes('glow'))) {m.emissive.set('#ffffff');m.emissiveMap=m.map;m.emissiveIntensity=1.6;}
      }
    });
    mergeOpaqueModelMeshes(gltf.scene);
    group.add(gltf.scene);
  }).catch(error=>{if(disposed)return;status.error=String(error);console.error('Model map failed',error);});
  const world: World={
    plan,group,colliders,interactables,pickables,desks,boardMeshes,meetingBoard,meetingSign,nav,navigation,
    ways:{home:(seat,from)=>({way:from?world.nav.route(from,[plan.door.x,plan.door.z]):world.nav.wayFrom(seat,[plan.door.x,plan.door.z]),chute:false}),in:seat=>world.nav.wayTo([plan.door.x,plan.door.z],seat)},
    rain:[{area:plan.bounds,top:()=>plan.height}],device:'laptop',room:{wall:.2,enclosed:true},
    setBeanbags(){return [];},setLook(){},setProjectName(){},update(t,dt,people){
      // The free desks' "+" bobs and turns, as in the stock office.
      for(const d of desks.values()){if(!d.vacancy.visible||d.def.station)continue;d.vacancy.position.y=d.vacancyY+Math.sin(t*2+d.def.x)*.06;d.vacancy.rotation.y=t*1.2;}
      const positions=[...people];
      for(const d of doors){const near=positions.some(p=>Math.hypot(p.x-d.center.x,p.z-d.center.z)<2.2&&Math.abs(p.y-d.center.y)<2.2);d.amount=THREE.MathUtils.damp(d.amount,near?1:0,9,dt);d.node.position.copy(d.closed);d.node.position.y+=d.amount*2.8;}
    },
    mood(lights){lights.hemi.intensity=.65;lights.hemi.color.set(0xe2efff);lights.hemi.groundColor.set(0x8c887b);lights.ambient.intensity=0;lights.sun.intensity=1.8;lights.sun.color.set(0xffedcf);lights.sun.position.set(-35,30,-12);lights.sun.target.position.set(12,0,-5);lights.sun.target.updateMatrixWorld();if(lights.scene.background instanceof THREE.Color)lights.scene.background.set('#c8d8e5'); if(lights.scene.fog instanceof THREE.Fog){lights.scene.fog.near=150;lights.scene.fog.far=300;}},
    dispose(){disposed=true;download.abort();decor.dispose();if(loaded){group.remove(loaded);releaseModel(loaded);}group.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.ownedTexture?.dispose();o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});},
  };
  modelSurfaces.set(world,status);
  return world;
}
