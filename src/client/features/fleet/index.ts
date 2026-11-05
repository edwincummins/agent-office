import * as THREE from 'three';
import type { FleetSnapshot } from '../../../shared/protocol/fleet';
import type { Ctx } from '../../core/context';
import { boardModes } from '../../core/board-modes';
import { hintTitle,key } from '../../core/hint';
import { store } from '../../state';
import { boardKey,readMode,writeMode } from './memory';
import { drawFleet } from './draw';
import { openFleet } from './panel';
import type { Interactable } from '../../world/types';
import type { Modal } from '../../ui/dom';

declare module '../../world/types' { interface InteractKinds { fleetmode: true; } }

export function installFleet(ctx:Ctx) {
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
  const paint=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  let state:FleetSnapshot|null=null,last='',selected=false,scope='',base:THREE.Texture|undefined,mesh:THREE.Mesh|undefined;
  let panel:Modal|undefined;
  const labelMaps=new WeakMap<THREE.Mesh,THREE.Texture>();
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const labelPaint=labelCanvas.getContext('2d')!;labelPaint.fillStyle='#111214';labelPaint.fillRect(0,0,512,128);
  labelPaint.fillStyle='#F0643B';labelPaint.fillRect(30,40,48,48);labelPaint.fillStyle='#ece6d6';labelPaint.font='600 76px Segoe UI';labelPaint.fillText('Cadre',110,91);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const allowed=()=>store.me.account?.role==='admin';
  const header=document.createElement('canvas');header.width=1024;header.height=250;
  const headerTexture=new THREE.CanvasTexture(header);headerTexture.colorSpace=THREE.SRGBColorSpace;
  const switchMesh=new THREE.Group();
  switchMesh.name='cadre-board-switch';switchMesh.userData.drawCalls=2;
  const segments=[false,true].map((cadre,i)=>{
    const geometry=new THREE.PlaneGeometry(.45,.22),uv=geometry.attributes.uv;
    for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/2);
    const part=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:headerTexture,toneMapped:false}));
    part.material.userData.outlineParameters={visible:false};
    part.position.x=(i-.5)*.45;
    const it:Interactable={kind:'fleetmode',x:0,z:0,radius:9,label:cadre?'Cadre':'Services'};
    part.userData.interact=it;switchMesh.add(part);return it;
  });
  const apply=()=>{
    if(!mesh||!base)return;
    switchMesh.visible=allowed();
    const sign=mesh.userData.boardLabel as THREE.Mesh|undefined;
    if(sign){const material=sign.material as THREE.MeshBasicMaterial;if(!labelMaps.has(sign)&&material.map)labelMaps.set(sign,material.map);material.map=selected&&allowed()?labelTexture:labelMaps.get(sign)!;material.needsUpdate=true;}
    (mesh.material as THREE.MeshBasicMaterial).map=selected&&allowed()?texture:base;
    (mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;
    const g=header.getContext('2d')!;g.fillStyle=selected?'#111214':'#23303b';g.fillRect(0,0,1024,250);
    g.fillStyle='#17191c';g.fillRect(selected?512:0,3,509,244);
    g.font='600 80px Segoe UI';g.textAlign='center';g.textBaseline='middle';
    g.fillStyle=selected?'#8b8676':'#ece6d6';g.fillText('Services',256,125);
    g.fillStyle=selected?'#ece6d6':'#8b8676';g.fillText('Cadre',768,125);headerTexture.needsUpdate=true;
    ctx.hint.invalidate();
  };
  const toggle=()=>{if(!allowed())return;selected=!selected;try{writeMode(localStorage,scope,selected);}catch{}apply();};
  const draw=(next:FleetSnapshot|null)=>{
    state=next;const value=JSON.stringify(next);if(value===last)return;
    last=value;drawFleet(paint,next);texture.needsUpdate=true;switchMesh.userData.redraws=(switchMesh.userData.redraws??0)+1;
  };
  const mount=(original:THREE.Texture,target:THREE.Mesh)=>{
    base=original;mesh=target;
    const next=boardKey(store.floor,ctx.plan().id);
    if(next!==scope){scope=next;try{selected=readMode(localStorage,scope);}catch{selected=false;}}
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;
    switchMesh.position.set(box.max.x-.53,box.max.y-.19,.02);
    const board=ctx.plan().boards.services;for(const it of segments){it.x=board.x;it.z=board.z;}
    mesh.add(switchMesh);apply();
    return selected&&allowed()?texture:base;
  };
  boardModes.set('services',{
    texture:mount,
    hint:()=>({k:`fleet:${selected}:${allowed()}`,parts:[hintTitle(selected&&allowed()?'Cadre':'Services'),key('E','Open'),...(allowed()?[key('B','Services | Cadre')]:[])]}),
    use:k=>{if(k==='B'){toggle();return true;}if(k==='E'&&selected&&allowed()){panel?.close();panel=openFleet(()=>state,()=>{toggle();});return true;}return false;},
  });
  ctx.interactions.define('fleetmode',{reach:9,hint:()=>({k:'switch',parts:[hintTitle('Services | Cadre'),key('E','Switch')]}),use:(it,k)=>{if(k==='E'&&allowed()&&selected!==(it.label==='Cadre'))toggle();}});
  draw(null);
  const sync=()=>{if(!allowed()){panel?.close();draw(null);apply();return;}ctx.net.send({t:'fleet.subscribe'});apply();};
  let watching=false;
  ctx.messages.on('welcome',()=>{draw(null);sync();if(!watching){watching=true;ctx.net.onStatus(up=>{if(!up){panel?.close();draw(null);}});}});
  store.on('me',sync);
  ctx.messages.on('fleet',m=>{if(allowed())draw(m.state);});
  store.on('floor',()=>{if(mesh&&base)mount(base,ctx.world().boardMeshes.services);});
  const initial=ctx.office.boardMeshes.services;
  mount((initial.material as THREE.MeshBasicMaterial).map!,initial);
}
