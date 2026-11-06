import * as THREE from 'three';
import type { FleetGuestSettings, FleetScreen, FleetSnapshot } from '../../../shared/protocol/fleet';
import type { Ctx } from '../../core/context';
import { boardModes } from '../../core/board-modes';
import { hintTitle,key } from '../../core/hint';
import { store } from '../../state';
import { boardKey,readMode,writeMode } from './memory';
import { drawFleet,boardSignature,cadreLogo } from './draw';
import { openFleet } from './panel';
import type { Interactable } from '../../world/types';
import type { Modal } from '../../ui/dom';

declare module '../../world/types' { interface InteractKinds { fleetmode: true; } }

export function installFleet(ctx:Ctx) {
  // 3072×1536 (1.5× the layout's 2048×1024 drawing space) so the terminal text on the bigger wall stays sharp.
  const canvas=document.createElement('canvas');canvas.width=3072;canvas.height=1536;
  const paint=canvas.getContext('2d')!;paint.setTransform(1.5,0,0,1.5,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=ctx.renderer.capabilities.getMaxAnisotropy();
  let state:FleetSnapshot|null=null,last='',selected=false,scope='',base:THREE.Texture|undefined,mesh:THREE.Mesh|undefined;
  let panel:Modal|undefined;
  const labelMaps=new WeakMap<THREE.Mesh,THREE.Texture>();
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const labelPaint=labelCanvas.getContext('2d')!;labelPaint.fillStyle='#111214';labelPaint.fillRect(0,0,512,128);
  // Logo + "Cadre", centered on the sign as one group.
  labelPaint.font='600 76px Segoe UI';
  const labelText=labelPaint.measureText('Cadre').width,labelLeft=Math.round((512-(72+18+labelText))/2);
  labelPaint.fillStyle='#ece6d6';labelPaint.fillText('Cadre',labelLeft+90,91);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  // Cadre's own logo on the sign (and on the board's header, see draw.ts), once the image has loaded.
  cadreLogo.then(img=>{labelPaint.drawImage(img,labelLeft,28,72,72);labelTexture.needsUpdate=true;last='';draw(state);}).catch(()=>{labelPaint.fillStyle='#F0643B';labelPaint.fillRect(labelLeft+12,40,48,48);labelTexture.needsUpdate=true;});
  let authorized=false,permissionRequest=0;
  // Guests watch a filtered, read-only copy the office sends them (server fleet/guests.ts); the owner sets what's in it.
  let guest=false,guestSettings:FleetGuestSettings|null=null;
  const screens={map:new Map<string,FleetScreen>(),version:0,resets:0};
  const watch=(on:boolean)=>{if(!on){screens.map.clear();screens.version++;}ctx.net.send({t:'fleet.screens',on});};
  const owner=()=>authorized&&store.me.account?.role==='admin';
  const allowed=()=>owner()||(guest&&state!==null);
  const header=document.createElement('canvas');header.width=1024;header.height=250;
  const headerTexture=new THREE.CanvasTexture(header);headerTexture.colorSpace=THREE.SRGBColorSpace;
  const switchMesh=new THREE.Group();
  switchMesh.name='cadre-board-switch';switchMesh.userData.drawCalls=2;
  const segments=[false,true].map((cadre,i)=>{
    const geometry=new THREE.PlaneGeometry(.45,.16),uv=geometry.attributes.uv;
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
  const open=async()=>{
    const response=owner()?await fetch('/api/cadre/open',{method:'POST'}).catch(()=>null):null;
    if(!owner()&&guest&&state){panel?.close();panel=openFleet(()=>state,()=>{toggle();},{guest:true,guests:()=>null,setGuests:()=>{},screens:()=>screens,watch});return;}
    if(response?.ok&&allowed()){panel?.close();panel=openFleet(()=>state,()=>{toggle();},{guest:false,guests:()=>guestSettings,setGuests:s=>ctx.net.send({t:'fleet.guests',settings:s}),screens:()=>screens,watch});}
    else {authorized=false;panel?.close();apply();}
  };
  const draw=(next:FleetSnapshot|null)=>{
    state=next;const value=boardSignature(next);if(value===last)return;
    last=value;const started=performance.now();drawFleet(paint,next);switchMesh.userData.paintMs=performance.now()-started;texture.needsUpdate=true;const upload=performance.now();ctx.renderer.initTexture(texture);switchMesh.userData.uploadMs=performance.now()-upload;switchMesh.userData.redraws=(switchMesh.userData.redraws??0)+1;
  };
  const mount=(original:THREE.Texture,target:THREE.Mesh)=>{
    base=original;mesh=target;
    const next=boardKey(store.floor,ctx.plan().id);
    if(next!==scope){scope=next;try{selected=readMode(localStorage,scope);}catch{selected=false;}}
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;
    switchMesh.position.set(box.max.x-.53,box.max.y-.10,.02);
    const board=ctx.plan().boards.services;for(const it of segments){it.x=board.x;it.z=board.z;}
    mesh.add(switchMesh);apply();
    return selected&&allowed()?texture:base;
  };
  boardModes.set('services',{
    texture:mount,
    hint:()=>({k:`fleet:${selected}:${allowed()}`,parts:[hintTitle(selected&&allowed()?'Cadre':'Services'),key('E','Open'),...(allowed()?[key('B','Services | Cadre')]:[])]}),
    use:k=>{if(k==='B'){toggle();return true;}if(k==='E'&&selected&&allowed()){void open();return true;}return false;},
  });
  ctx.interactions.define('fleetmode',{reach:9,hint:()=>({k:'switch',parts:[hintTitle('Services | Cadre'),key('E','Switch')]}),use:(it,k)=>{if(k==='E'&&allowed()&&selected!==(it.label==='Cadre'))toggle();}});
  draw(null);
  const sync=()=>{
    const request=++permissionRequest;authorized=false;guest=false;panel?.close();draw(null);apply();
    if(store.me.account?.role!=='admin'){ctx.net.send({t:'fleet.subscribe'});return;}
    void fetch('/api/cadre/web',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
      if(request!==permissionRequest)return;
      authorized=config?.allowed===true;if(allowed())ctx.net.send({t:'fleet.subscribe'});apply();
    }).catch(()=>{});
  };
  let watching=false;
  ctx.messages.on('welcome',()=>{draw(null);sync();if(!watching){watching=true;ctx.net.onStatus(up=>{if(!up){permissionRequest++;authorized=false;panel?.close();draw(null);apply();}});}});
  store.on('me',sync);
  ctx.messages.on('fleet',m=>{if(m.guest){guest=true;authorized=false;draw(m.state);apply();return;}if(m.state===null)sync();else if(allowed())draw(m.state);});
  ctx.messages.on('fleet.guests',m=>{guestSettings=m.settings;});
  ctx.messages.on('fleet.screens',m=>{if(m.reset){screens.map.clear();screens.resets++;}for(const [seat,sc] of Object.entries(m.screens))screens.map.set(seat,sc);screens.version++;});
  store.on('floor',()=>{if(mesh&&base)mount(base,ctx.world().boardMeshes.services);});
  const initial=ctx.office.boardMeshes.services;
  mount((initial.material as THREE.MeshBasicMaterial).map!,initial);
}
