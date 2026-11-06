import * as T from 'three';
import type {CrewEntry} from './layout';
import {COLORS,crewPose} from './layout';
import {tagScale,tagOpacity} from './tag-metrics';
import {crewMarker} from './markers';
import type {Bounds} from '../../../shared/nav';
import type {CrewSlot} from '../../../shared/fixtures/crew';
/** Two atlas draws: camera-facing tags/pins and fixed team markers. */
class Atlas {
 readonly mesh:T.InstancedMesh;readonly canvas=document.createElement('canvas');readonly paint:CanvasRenderingContext2D;readonly texture:T.CanvasTexture;
 readonly widths=new Float32Array(128);readonly rect:T.InstancedBufferAttribute;readonly alpha:T.InstancedBufferAttribute;
 private pending=new Set<number>();private keys=new Map<number,string>();private initialized=false;
 private tile=document.createElement('canvas');private tileTexture=new T.CanvasTexture(this.tile);
 private matrix=new T.Matrix4();private quaternion=new T.Quaternion();private vector=new T.Vector3();private scale=new T.Vector3();
 constructor(readonly billboard:boolean,private readonly renderer:T.WebGLRenderer){
  this.tile.width=256;this.tile.height=128;
  this.canvas.width=2048;this.canvas.height=2048;this.paint=this.canvas.getContext('2d')!;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.generateMipmaps=false;this.texture.minFilter=T.LinearFilter;
  const geometry=new T.PlaneGeometry(1,1);this.rect=new T.InstancedBufferAttribute(new Float32Array(128*4),4);this.alpha=new T.InstancedBufferAttribute(new Float32Array(128),1);geometry.setAttribute('cell',this.rect);geometry.setAttribute('opacity',this.alpha);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{atlas:{value:this.texture},billboard:{value:billboard}},vertexShader:`attribute vec4 cell; attribute float opacity; varying vec2 vUv; varying float vAlpha; uniform bool billboard;
  void main(){vUv=cell.xy+uv*cell.zw;vAlpha=opacity;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.); if(billboard){center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}else gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D atlas;varying vec2 vUv;varying float vAlpha;void main(){gl_FragColor=texture2D(atlas,vUv);gl_FragColor.a*=vAlpha;if(gl_FragColor.a<.01)discard; #include <colorspace_fragment> }`.replace('; #include',';\n#include').replace('fragment> }','fragment>\n}')});
  material.userData.outlineParameters={visible:false};this.mesh=new T.InstancedMesh(geometry,material,128);this.mesh.name=billboard?'cadre-crew-tags':'cadre-crew-markers';this.mesh.count=0;this.mesh.frustumCulled=false;
 }
 text(i:number,text:string,color:string,tag=false){
  const key=JSON.stringify([text,color,tag]);if(this.keys.get(i)===key)return;this.keys.set(i,key);this.pending.add(i);
  const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.font=tag?'600 32px Segoe UI':'600 26px Segoe UI';
  const chars=Array.from(text),limit=tag?18:24;let label=chars.slice(0,limit).join('');if(chars.length>limit)label+='…';
  while(g.measureText(label).width>(tag?196:244)&&label.length>1)label=label.slice(0,-2)+'…';
  const width=tag?Math.min(240,Math.ceil(g.measureText(label).width)+44):252,top=tag?40:24,height=tag?48:80;
  g.fillStyle='rgba(17,18,20,.88)';g.fillRect(x+2,y+top,width,height);g.fillStyle=color;if(tag)g.fillRect(x+10,y+55,18,18);
  g.textBaseline='middle';g.textAlign=tag?'left':'center';g.fillStyle=tag?'#ece6d6':color;g.fillText(label,x+(tag?36:128),y+64);
  this.widths[i]=tag?width/48*.12:0;
  this.rect.setXYZW(i,(x+(tag?2:0))/2048,1-(y+(tag?88:128))/2048,(tag?width:256)/2048,(tag?48:128)/2048);
 }
 pin(i:number){if(this.keys.get(i)==='pin')return;this.keys.set(i,'pin');this.pending.add(i);this.rect.setXYZW(i,i%8/8,1-(Math.floor(i/8)+1)/16,1/8,1/16);const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.fillStyle='#e3a948';g.beginPath();g.arc(x+128,y+51,43,0,Math.PI*2);g.fill();g.beginPath();g.moveTo(x+108,y+84);g.lineTo(x+128,y+124);g.lineTo(x+148,y+84);g.fill();g.fillStyle='#111214';g.font='700 70px Segoe UI';g.textAlign='center';g.textBaseline='middle';g.fillText('!',x+128,y+54);}
 post(i:number){if(this.keys.get(i)==='post')return;this.keys.set(i,'post');this.pending.add(i);this.rect.setXYZW(i,i%8/8,1-(Math.floor(i/8)+1)/16,1/8,1/16);const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.fillStyle='#34363a';g.fillRect(x,y,256,128);}
 set(i:number,x:number,y:number,z:number,w:number,h:number,rotY=0,alpha=1){this.matrix.compose(this.vector.set(x,y,z),this.quaternion.setFromAxisAngle(T.Object3D.DEFAULT_UP,rotY),this.scale.set(w,h,1));this.mesh.setMatrixAt(i,this.matrix);this.alpha.setX(i,alpha);}
 upload(){
  if(!this.initialized){this.renderer.initTexture(this.texture);this.initialized=true;this.mesh.userData.fullUploads=1;}
  else for(const i of this.pending){const x=i%8*256,y=Math.floor(i/8)*128,g=this.tile.getContext('2d')!;g.clearRect(0,0,256,128);g.drawImage(this.canvas,x,y,256,128,0,0,256,128);this.renderer.copyTextureToTexture(this.tileTexture,this.texture,null,new T.Vector2(x,2048-y-128));this.mesh.userData.cellUploads=(this.mesh.userData.cellUploads??0)+1;}
  this.pending.clear();this.rect.needsUpdate=true;this.alpha.needsUpdate=true;this.mesh.instanceMatrix.needsUpdate=true;}
 dispose(){this.tileTexture.dispose();this.mesh.dispose();this.texture.dispose();this.mesh.geometry.dispose();(this.mesh.material as T.Material).dispose();}
}
export class CrewLabels {
 readonly tags:Atlas;readonly signs:Atlas;private cells=new Map<string,number>();readonly shadows:T.InstancedMesh;
 private entries:CrewEntry[]=[];private matrix=new T.Matrix4();private pos=new T.Vector3();private q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);private scale=new T.Vector3(.65,.65,1);
 constructor(renderer:T.WebGLRenderer){this.tags=new Atlas(true,renderer);this.signs=new Atlas(false,renderer);const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float a=max(0.,1.-length(vUv-.5)*2.);gl_FragColor=vec4(0.,0.,0.,a*a*.22);}'});material.userData.outlineParameters={visible:false};this.shadows=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,64);this.shadows.frustumCulled=false;this.shadows.count=0;}
 sync(entries:CrewEntry[],slot:CrewSlot,overflow:number,bounds:Bounds){
  this.entries=entries;
  for(const [key,cell] of this.cells)if(!entries.some(e=>e.seat.session===key)){this.cells.delete(key);this.tags.set(cell*2,0,0,0,0,0,0,0);this.tags.set(cell*2+1,0,0,0,0,0,0,0);}
  for(const e of entries)if(!this.cells.has(e.seat.session)){const used=new Set(this.cells.values());let cell=0;while(used.has(cell))cell++;this.cells.set(e.seat.session,cell);}
  this.tags.mesh.count=(Math.max(-1,...this.cells.values())+1)*2;this.shadows.count=entries.length;let signs=0;
  entries.forEach((e,i)=>{const cell=this.cells.get(e.seat.session)!;this.tags.text(cell*2,e.seat.name,COLORS[e.seat.state],true);this.tags.pin(cell*2+1);
   const p=crewPose(e);this.shadows.setMatrixAt(i,this.matrix.compose(this.pos.set(p.x,p.y+.012,p.z),this.q,this.scale));
   if(e.teamStart){const offset=e.place.marker??e.zone.marker.offset,rot=e.place.rotY,at=crewMarker(e,entries,bounds),tent=e.zone.marker.kind==='tent';if(!at)return;const {x,z}=at;
    this.signs.text(signs,e.seat.rig,'#ece6d6');this.signs.set(signs++,x,e.place.y+offset.y+(tent?0:1.225),z,tent?.4:.85,tent?.2:.42,rot);if(!tent){this.signs.post(signs);this.signs.set(signs++,x,e.place.y+offset.y+.55,z,.04,1.1,rot);}
   }
  });
  if(overflow){const p=slot.overflow;this.signs.text(signs,'+'+overflow+' more on Cadre wall','#8b8676');this.signs.set(signs++,p.x,p.y+1.225,p.z,1.2,.45,p.rotY);}
  this.signs.mesh.count=signs;this.tags.upload();this.signs.upload();this.shadows.instanceMatrix.needsUpdate=true;
 }
 tick(camera:T.Camera,t:number,reduced:boolean,viewportHeight:number){
  this.entries.forEach(e=>{const i=this.cells.get(e.seat.session)!;
   const p=crewPose(e),y=p.y+1.95+(p.sit?p.seatHeight-.42:0)+(e.place.tagLift??0),distance=camera.position.distanceTo(this.pos.set(p.x,y,p.z));
   const depth=-this.pos.applyMatrix4(camera.matrixWorldInverse).z,scale=tagScale(depth,camera.projectionMatrix.elements[5],viewportHeight);
   this.tags.set(i*2,p.x,y,p.z,this.tags.widths[i*2]*scale,.12*scale,0,tagOpacity(distance));
   this.tags.set(i*2+1,p.x,y+.25+(reduced?0:Math.sin(t*Math.PI*2)*.05),p.z,.3,.3,0,e.seat.state==='needs-you'?1:0);
  });this.tags.alpha.needsUpdate=true;this.tags.mesh.instanceMatrix.needsUpdate=true;
 }
 dispose(){this.shadows.dispose();this.tags.dispose();this.signs.dispose();this.shadows.geometry.dispose();(this.shadows.material as T.Material).dispose();}
}
