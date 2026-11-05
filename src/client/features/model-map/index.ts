import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Ctx } from '../../core/context';
import { modelSurfaces } from '../../world/model';

export function installModelMap(ctx: Ctx) {
  const panel=document.createElement('output'); panel.id='model-performance';
  Object.assign(panel.style,{position:'fixed',left:'16px',bottom:'74px',maxWidth:'calc(100% - 32px)',padding:'8px 12px',borderRadius:'6px',background:'#172027dd',color:'#eff3f4',font:'12px Segoe UI, sans-serif',pointerEvents:'none',zIndex:'8'});
  panel.hidden=true; document.body.append(panel);
  const gl=ctx.renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER));
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ink=canvas.getContext('2d')!;ink.fillStyle='#20272b';ink.fillRect(0,0,1280,720);
  ink.fillStyle='#d67d43';ink.fillRect(80,100,8,110);ink.fillStyle='#f2f0eb';ink.font='600 76px Segoe UI';ink.fillText('Shared workspace',120,185);
  ink.fillStyle='#b5c1c6';ink.font='32px Segoe UI';ink.fillText('Share a screen to present to the room',120,265);
  ink.fillStyle='#d67d43';ink.font='24px Segoe UI';ink.fillText('AGENT OFFICE',120,615);
  const idle=new THREE.CanvasTexture(canvas);idle.colorSpace=THREE.SRGBColorSpace;
  let environment: THREE.WebGLRenderTarget | undefined;
  let active=false,previousShadows=ctx.renderer.shadowMap.enabled, previousEnvironment=ctx.scene.environment, previousTone=ctx.renderer.toneMapping, previousExposure=ctx.renderer.toneMappingExposure, previousRatio=ctx.renderer.getPixelRatio();
  const outlines=new Map<THREE.Material,unknown>();
  let modelWorld=ctx.world();
  const restoreOutlines=()=>{for(const [mat,previous] of outlines)mat.userData.outlineParameters=previous;outlines.clear();};
  let frames=0,last=performance.now(),calls=0,triangles=0;
  const originalReset=ctx.renderer.info.autoReset;
  ctx.ticks.add('pre',()=>{if(active){ctx.renderer.info.autoReset=false;ctx.renderer.info.reset();}});
  ctx.ticks.add('render',()=>{if(active){calls=ctx.renderer.info.render.calls;triangles=ctx.renderer.info.render.triangles;}});
  let whiteboardTexture: THREE.Texture | null=null;
  ctx.office.whiteboard.group.traverse(o=>{
    if(o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry && o.material instanceof THREE.MeshBasicMaterial && o.material.map) whiteboardTexture ??= o.material.map;
  });
  ctx.ticks.add('hud',()=>{
    const surfaces=modelSurfaces.get(ctx.world());
    if(surfaces&&modelWorld!==ctx.world()){restoreOutlines();modelWorld=ctx.world();}
    if(!!surfaces!==active){
      active=!!surfaces; panel.hidden=!active;frames=0;last=performance.now();
      if(active){
        previousShadows=ctx.renderer.shadowMap.enabled;ctx.renderer.shadowMap.enabled=false;previousEnvironment=ctx.scene.environment;previousTone=ctx.renderer.toneMapping;previousExposure=ctx.renderer.toneMappingExposure;previousRatio=ctx.renderer.getPixelRatio();
        if(!environment){const pmrem=new THREE.PMREMGenerator(ctx.renderer);const room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();}
        ctx.scene.environment=environment.texture;ctx.renderer.toneMapping=THREE.AgXToneMapping;ctx.renderer.toneMappingExposure=.8;ctx.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      }else{restoreOutlines();ctx.renderer.shadowMap.enabled=previousShadows;ctx.renderer.info.autoReset=originalReset;ctx.scene.environment=previousEnvironment;ctx.renderer.toneMapping=previousTone;ctx.renderer.toneMappingExposure=previousExposure;ctx.renderer.setPixelRatio(previousRatio);}
    }
    if(!surfaces)return;
    ctx.world().group.traverse(o=>{if(o instanceof THREE.Mesh)for(const mat of Array.isArray(o.material)?o.material:[o.material]){
      if(!outlines.has(mat)){outlines.set(mat,mat.userData.outlineParameters);mat.userData.outlineParameters={visible:false};}
    }});
    const tv=ctx.office.tvScreen.material as THREE.MeshBasicMaterial;
    for(const [mesh,map] of [[surfaces.screen,tv.map instanceof THREE.VideoTexture?tv.map:idle],[surfaces.whiteboard,whiteboardTexture]] as const){
      const mat=mesh.material as THREE.MeshBasicMaterial;
      if(mat.map!==map){mat.map=map;mat.needsUpdate=true;}mat.color.set('#ffffff');
    }
    frames++;const now=performance.now();
    if(now-last>=500){
      panel.dataset.calls=String(calls);panel.dataset.triangles=String(triangles);panel.dataset.fps=(frames*1000/(now-last)).toFixed(1);
      panel.textContent=surfaces.error ? `Model failed to load: ${surfaces.error}` : `${(frames*1000/(now-last)).toFixed(1)} FPS · ${calls} calls · ${triangles.toLocaleString()} triangles · GPU: ${gpu}`;
      frames=0;last=now;
    }
  });
}
