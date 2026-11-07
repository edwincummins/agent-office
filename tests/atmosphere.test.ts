import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { atmosphereProfile, atmosphereSample, modelAtmosphere } from '../src/client/features/atmosphere/model.js';
test('atmosphere opt-in accepts only bounded explicit backdrop material names', () => {
  assert.deepEqual(atmosphereProfile({enabled:true,hideMaterials:['sky-north']}),{hideMaterials:['sky-north']});
  for(const p of [{enabled:false,hideMaterials:[]},{enabled:true,hideMaterials:['wall']},{enabled:true,hideMaterials:[],extra:true},null]) assert.equal(atmosphereProfile(p),null);
});
test('atmosphere follows solar time and changes haze with weather',()=>{
  const state={lat:0,lon:0,utcOffset:0,weather:'clear' as const,intensity:0,realTime:true};
  const day=atmosphereSample(state,Date.UTC(2026,2,20,12));
  const night=atmosphereSample(state,Date.UTC(2026,2,20,0));
  assert.ok(day.sun.el>1);assert.ok(night.sun.el < -1);
  assert.ok(atmosphereSample({...state,weather:'rain',intensity:1},Date.UTC(2026,2,20,12)).turbidity>day.turbidity);
});
test('only nominated pure backdrop meshes hide, with exact restoration and resource disposal',()=>{
  const root=new THREE.Group(), material=new THREE.MeshBasicMaterial();material.name='sky-north';
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(),material);const unrelated=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.add(plane,unrelated);
  const a=modelAtmosphere(root,{hideMaterials:['sky-north']});
  assert.equal(a.sky.material.transparent,true);
  assert.equal(a.sky.material.userData.outlineParameters.visible,false);
  assert.ok(a.sky.renderOrder > -1 && a.sky.renderOrder < 0);
  const camera=new THREE.PerspectiveCamera(75,1,.1,320);camera.position.set(3,7,-23);
  a.update({lat:0,lon:0,utcOffset:0,weather:'clear',intensity:0,realTime:true},Date.UTC(2026,2,20,12),camera,.1);
  assert.deepEqual(a.sky.position.toArray(),camera.position.toArray());
  assert.ok(a.sky.scale.x * Math.sqrt(3) / 2 < camera.far);
  let disposed=0;a.sky.geometry.addEventListener('dispose',()=>disposed++);a.sky.material.addEventListener('dispose',()=>disposed++);
  assert.equal(plane.visible,false);assert.equal(unrelated.visible,true);
  a.dispose();assert.equal(plane.visible,true);assert.equal(disposed,2);
  plane.geometry.dispose();material.dispose();unrelated.geometry.dispose();unrelated.material.dispose();
});
