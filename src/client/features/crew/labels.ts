import * as T from 'three';
import type {CrewEntry} from './layout';
import {COLORS,crewPose} from './layout';
import type {CrewSlot} from '../../../shared/fixtures/crew';
/** Two atlas draws: camera-facing tags/pins and fixed team markers. */
class Atlas {
 readonly mesh:T.InstancedMesh;readonly canvas=document.createElement('canvas');readonly paint:CanvasRenderingContext2D;readonly texture:T.CanvasTexture;
 readonly rect:T.InstancedBufferAttribute;readonly alpha:T.InstancedBufferAttribute;
 private matrix=new T.Matrix4();private quaternion=new T.Quaternion();private vector=new T.Vector3();private scale=new T.Vector3();
 constructor(readonly billboard:boolean){
  this.canvas.width=2048;this.canvas.height=2048;this.paint=this.canvas.getContext('2d')!;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.generateMipmaps=true;this.texture.minFilter=T.LinearMipmapLinearFilter;
  const geometry=new T.PlaneGeometry(1,1);this.rect=new T.InstancedBufferAttribute(new Float32Array(128*4),4);this.alpha=new T.InstancedBufferAttribute(new Float32Array(128),1);geometry.setAttribute('cell',this.rect);geometry.setAttribute('opacity',this.alpha);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{atlas:{value:this.texture},billboard:{value:billboard}},vertexShader:`attribute vec4 cell; attribute float opacity; varying vec2 vUv; varying float vAlpha; uniform bool billboard;
  void main(){vUv=cell.xy+uv*cell.zw;vAlpha=opacity;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.); if(billboard){center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}else gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D atlas;varying vec2 vUv;varying float vAlpha;void main(){gl_FragColor=texture2D(atlas,vUv);gl_FragColor.a*=vAlpha;if(gl_FragColor.a<.01)discard; #include <colorspace_fragment> }`.replace('; #include',';\n#include').replace('fragment> }','fragment>\n}')});
  material.userData.outlineParameters={visible:false};this.mesh=new T.InstancedMesh(geometry,material,128);this.mesh.count=0;this.mesh.frustumCulled=false;
 }
 text(i:number,text:string,color:string,tag=false){const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.fillStyle='rgba(17,18,20,.88)';g.fillRect(x+2,y+24,252,80);g.fillStyle=color;if(tag)g.fillRect(x+12,y+48,25,25);g.font='600 26px Segoe UI';g.textBaseline='middle';g.textAlign=tag?'left':'center';g.fillStyle=tag?'#ece6d6':color;const limit=tag?18:24;let label=Array.from(text).slice(0,limit).join('');if(Array.from(text).length>limit)label+='…';while(g.measureText(label).width>(tag?202:244))label=label.slice(0,-2)+'…';g.fillText(label,x+(tag?45:128),y+64);this.rect.setXYZW(i,x/2048,1-(y+128)/2048,256/2048,128/2048);}
 pin(i:number){this.text(i,'!','#111214');const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.fillStyle='#e3a948';g.beginPath();g.arc(x+128,y+51,43,0,Math.PI*2);g.fill();g.beginPath();g.moveTo(x+108,y+84);g.lineTo(x+128,y+124);g.lineTo(x+148,y+84);g.fill();g.fillStyle='#111214';g.font='700 70px Segoe UI';g.textAlign='center';g.textBaseline='middle';g.fillText('!',x+128,y+54);}
 post(i:number){this.text(i,'','#34363a');const x=i%8*256,y=Math.floor(i/8)*128,g=this.paint;g.clearRect(x,y,256,128);g.fillStyle='#34363a';g.fillRect(x,y,256,128);}
 set(i:number,x:number,y:number,z:number,w:number,h:number,rotY=0,alpha=1){this.matrix.compose(this.vector.set(x,y,z),this.quaternion.setFromAxisAngle(T.Object3D.DEFAULT_UP,rotY),this.scale.set(w,h,1));this.mesh.setMatrixAt(i,this.matrix);this.alpha.setX(i,alpha);}
 upload(){this.texture.needsUpdate=true;this.rect.needsUpdate=true;this.alpha.needsUpdate=true;this.mesh.instanceMatrix.needsUpdate=true;}
 dispose(){this.mesh.dispose();this.texture.dispose();this.mesh.geometry.dispose();(this.mesh.material as T.Material).dispose();}
}
export class CrewLabels {
 readonly tags=new Atlas(true);readonly signs=new Atlas(false);readonly shadows:T.InstancedMesh;
 private entries:CrewEntry[]=[];private matrix=new T.Matrix4();private pos=new T.Vector3();private q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);private scale=new T.Vector3(.65,.65,1);
 constructor(){const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float a=max(0.,1.-length(vUv-.5)*2.);gl_FragColor=vec4(0.,0.,0.,a*a*.22);}'});material.userData.outlineParameters={visible:false};this.shadows=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,64);this.shadows.frustumCulled=false;this.shadows.count=0;}
 sync(entries:CrewEntry[],slot:CrewSlot,overflow:number){
  this.entries=entries;this.tags.mesh.count=entries.length*2;this.shadows.count=entries.length;let signs=0;
  entries.forEach((e,i)=>{this.tags.text(i*2,e.seat.name,COLORS[e.seat.state],true);this.tags.pin(i*2+1);
   const p=crewPose(e);this.shadows.setMatrixAt(i,this.matrix.compose(this.pos.set(p.x,p.y+.012,p.z),this.q,this.scale));
   if(e.teamStart){const offset=e.place.marker??e.zone.marker.offset,rot=e.place.rotY,x=e.place.x+Math.cos(rot)*offset.x+Math.sin(rot)*offset.z,z=e.place.z-Math.sin(rot)*offset.x+Math.cos(rot)*offset.z,tent=e.zone.marker.kind==='tent';
    this.signs.text(signs,e.seat.rig,'#ece6d6');this.signs.set(signs++,x,e.place.y+offset.y+(tent?0:1.225),z,tent?.4:.85,tent?.2:.42,rot);if(!tent){this.signs.post(signs);this.signs.set(signs++,x,e.place.y+offset.y+.55,z,.04,1.1,rot);}
   }
  });
  if(overflow){const p=slot.overflow;this.signs.text(signs,'+'+overflow+' more on Cadre wall','#8b8676');this.signs.set(signs++,p.x,p.y+1.225,p.z,1.2,.45,p.rotY);}
  this.signs.mesh.count=signs;this.tags.upload();this.signs.upload();this.shadows.instanceMatrix.needsUpdate=true;
 }
 tick(camera:T.Camera,t:number,reduced:boolean){this.entries.forEach((e,i)=>{const p=crewPose(e),y=p.y+1.95+(p.sit?p.seatHeight-.42:0),distance=camera.position.distanceTo(this.pos.set(p.x,y,p.z)),alpha=Math.min(1,Math.max(0,(16-distance)/2));this.tags.set(i*2,p.x,y,p.z,1.05,.525,0,alpha);this.tags.set(i*2+1,p.x,y+.38+(reduced?0:Math.sin(t*Math.PI*2)*.05),p.z,.3,.3,0,e.seat.state==='needs-you'?1:0);});this.tags.alpha.needsUpdate=true;this.tags.mesh.instanceMatrix.needsUpdate=true;}
 dispose(){this.shadows.dispose();this.tags.dispose();this.signs.dispose();this.shadows.geometry.dispose();(this.shadows.material as T.Material).dispose();}
}
