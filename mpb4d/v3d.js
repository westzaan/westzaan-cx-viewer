// MPB Build Sequence: own 3D renderer (three.js). Draws the light models made from the IFC files.
// One object per work package. Looks: off, built (calm grey with its own tone), solid (one colour), ghost (glass).
import * as T3 from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
// our meshes carry no normals (flat shading works them out per pixel); the stock shadow code needs one and would get an invalid number, so shadows vanish. Use no normal offset.
T3.ShaderChunk.shadowmap_vertex=T3.ShaderChunk.shadowmap_vertex.replace('vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );','vec3 shadowWorldNormal = vec3( 0.0 );');
const DIR=new T3.Vector3(-0.62,-0.5,0.8).normalize();   // from the west side, from above
function create(box,man,buf){
  const QS=new URLSearchParams(location.search), low0=QS.get('q')==='low', SH=QS.get('shadows')==='1';   // shadows are off unless asked for
  const renderer=new T3.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setClearColor('#e6eaee'); renderer.localClippingEnabled=true; renderer.toneMapping=T3.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
  const cv=renderer.domElement; cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;outline:none'; box.appendChild(cv);
  const scene=new T3.Scene(), camera=new T3.PerspectiveCamera(32,1,0.5,2000); camera.up.set(0,0,1);
  scene.add(new T3.HemisphereLight(0xffffff,0xb9c0c9,1.15)); const sun=new T3.DirectionalLight(0xffffff,1.9); sun.position.set(-60,-90,140); scene.add(sun); scene.add(sun.target);
  renderer.shadowMap.enabled=SH; renderer.shadowMap.type=T3.PCFSoftShadowMap; renderer.shadowMap.autoUpdate=false; sun.castShadow=SH; sun.shadow.mapSize.set(4096,4096); sun.shadow.bias=-0.0012; sun.shadow.normalBias=0; const fill=new T3.DirectionalLight(0xffffff,0.5); fill.position.set(80,60,40); scene.add(fill);
  const controls=new OrbitControls(camera,cv); controls.enableDamping=false; controls.zoomSpeed=1.2; controls.rotateSpeed=0.8;
  const I={ms:0,tris:0,onPick:null,low:low0}, tags={}, list=[]; let dirty=3, tween=null;
  for(const m of man.tags){
    const g=new T3.BufferGeometry(), pos=new T3.BufferAttribute(new Uint16Array(buf,m.pos[0],m.pos[1]),3); g.setAttribute('position',pos);
    g.setAttribute('color',new T3.BufferAttribute(new Uint8Array(buf,m.col[0],m.col[1]),3,true));
    g.setIndex(new T3.BufferAttribute(m.i16?new Uint16Array(buf,m.idx[0],m.idx[1]):new Uint32Array(buf,m.idx[0],m.idx[1]),1));
    const mat=new T3.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:0.85,metalness:0.02,side:T3.DoubleSide});
    const mesh=new T3.Mesh(g,mat); mesh.position.set(m.q[0],m.q[1],m.q[2]); mesh.scale.setScalar(m.q[3]); mesh.visible=false; mesh.userData.tag=m.tag; mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
    let edges=null; if(m.edg&&m.edg[1]){const eg=new T3.BufferGeometry(); eg.setAttribute('position',pos); eg.setIndex(new T3.BufferAttribute(m.i16?new Uint16Array(buf,m.edg[0],m.edg[1]):new Uint32Array(buf,m.edg[0],m.edg[1]),1));
      edges=new T3.LineSegments(eg,new T3.LineBasicMaterial({color:0x4b5563,transparent:true,opacity:0.26})); mesh.add(edges)}
    const t={mesh,mat,edges,key:'',bb:m.bb,plane:null}; tags[m.tag]=t; list.push(t);
  }
  { // the sun and its shadow cover the whole building; the shadow is drawn again only when the work on show changes, not when the camera moves
    const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9]; let gz=1e9; const pc=(k,q)=>{const a=man.tags.map(m=>m.bb[k]).sort((x,y)=>x-y); return a[Math.round(q*(a.length-1))]}; for(let i=0;i<3;i++){lo[i]=pc(i,0.03); hi[i]=pc(i+3,0.97)} gz=pc(2,0.03);   /* a few stray parts far away must not stretch the shadow area */
    const c=new T3.Vector3((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2), r=Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])/2;
    sun.target.position.copy(c); sun.position.copy(c).add(new T3.Vector3(-0.45,-0.8,1.25).normalize().multiplyScalar(r*2)); const sc=sun.shadow.camera; sc.left=-r; sc.right=r; sc.top=r; sc.bottom=-r; sc.near=r*0.2; sc.far=r*4; sc.updateProjectionMatrix();
    const ground=new T3.Mesh(new T3.PlaneGeometry(r*5,r*5),new T3.ShadowMaterial({opacity:0.14})); ground.position.set(c.x,c.y,gz-0.05); ground.receiveShadow=true; ground.material.depthWrite=false; ground.visible=SH; scene.add(ground); I.ground=ground;
  }
  // state: 'off' | 'built' | 'solid' | 'ghost'.  hex: colour for solid, or for coloured glass.  sel: picked in the list
  I.setLook=(tag,state,hex,sel,grow)=>{
    const t=tags[tag]; if(!t)return; const key=state+'|'+(hex||'')+'|'+(sel?1:0)+'|'+(grow||0); if(key===t.key)return; t.key=key; const m=t.mat, me=t.mesh;
    me.visible=state!=='off'; renderer.shadowMap.needsUpdate=true; if(!me.visible){dirty=2;return}
    const glass=state==='ghost'; m.transparent=glass; m.opacity=glass?(hex?0.24:0.07):1; m.depthWrite=true;   /* glass also writes depth: only the nearest sheet of glass shows, so many sheets cannot add up to fog */ me.renderOrder=glass?2:0; me.castShadow=!glass; me.receiveShadow=!glass;
    if(state==='built'){m.vertexColors=true; m.color.set('#ffffff'); m.emissive.set('#000000'); m.emissiveIntensity=0}
    else{m.vertexColors=false; m.color.set(hex||'#9fb0c2'); m.emissive.set(hex||'#000000'); m.emissiveIntensity=glass?0:0.12}
    if(sel){m.emissive.set('#0a84ff'); m.emissiveIntensity=0.35}
    if(t.edges){t.edges.visible=!glass&&!I.low; t.edges.material.color.set(state==='solid'?'#111827':'#4b5563'); t.edges.material.opacity=state==='solid'?0.8:0.24}
    // grow: only the lower part is drawn, up to a level that rises with the progress of the work
    if(grow&&t.bb){if(!t.plane)t.plane=new T3.Plane(new T3.Vector3(0,0,-1),0); t.plane.constant=t.bb[2]+(t.bb[5]-t.bb[2])*grow; m.clippingPlanes=[t.plane]; if(t.edges)t.edges.material.clippingPlanes=[t.plane]}
    else if(m.clippingPlanes&&m.clippingPlanes.length){m.clippingPlanes=[]; if(t.edges){t.edges.material.clippingPlanes=[]; t.edges.material.needsUpdate=true}}
    m.needsUpdate=true; dirty=2;
  };
  I.touch=()=>{dirty=2};
  I.setLow=on=>{I.low=!!on; sun.castShadow=SH&&!on; I.ground.visible=SH&&!on; renderer.shadowMap.needsUpdate=true; for(const t of list)t.mat.needsUpdate=true; renderer.setPixelRatio(on?1:Math.min(devicePixelRatio,2)); for(const t of list)if(t.edges)t.edges.visible=!on&&!t.mat.transparent; I.resize()};
  I.resize=()=>{const w=box.clientWidth||2,h=box.clientHeight||2; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); dirty=2};
  // turn and move the camera so the box fills the picture; a short glide instead of a jump
  I.fit=(lo,hi,instant)=>{
    const c=new T3.Vector3((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2);
    // exact fit: how far back must the camera be so that all eight corners of the box are inside the picture
    const dir=I.fitted?camera.position.clone().sub(controls.target).normalize():DIR.clone(); if(dir.z<0.15){dir.z=0.15; dir.normalize()} const fw=dir.clone().negate(), rt=new T3.Vector3().crossVectors(fw,new T3.Vector3(0,0,1)).normalize(), up=new T3.Vector3().crossVectors(rt,fw), tv=Math.tan(camera.fov*Math.PI/360), th=tv*camera.aspect; let d=2;
    for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]]){const v=new T3.Vector3(x,y,z).sub(c); d=Math.max(d,-v.dot(fw)+Math.max(Math.abs(v.dot(rt))/th,Math.abs(v.dot(up))/tv))}
    d*=1.04; const p=c.clone().addScaledVector(dir,d);
    camera.near=Math.max(0.3,d/400); camera.far=d*8+400; camera.updateProjectionMatrix();
    if(instant||!I.fitted){I.fitted=true; camera.position.copy(p); controls.target.copy(c); controls.update(); dirty=2; return}
    tween={t0:performance.now(),p0:camera.position.clone(),c0:controls.target.clone(),p1:p,c1:c};
  };
  I.orbit=dt=>{const a=dt*0.12, o=camera.position.clone().sub(controls.target); o.applyAxisAngle(new T3.Vector3(0,0,1),a); camera.position.copy(controls.target).add(o); controls.update(); dirty=2};
  I.getCam=()=>({p:camera.position.toArray(),c:controls.target.toArray()});
  I.setCam=s=>{if(!s||!s.p)return; camera.position.fromArray(s.p); controls.target.fromArray(s.c); controls.update(); dirty=2};
  I.shot=(w,h)=>{const pr=renderer.getPixelRatio(), cw=box.clientWidth, ch=box.clientHeight; renderer.setPixelRatio(1); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.render(scene,camera); const url=cv.toDataURL('image/png'); renderer.setPixelRatio(pr); renderer.setSize(cw,ch,false); camera.aspect=cw/ch; camera.updateProjectionMatrix(); dirty=2; return url};
  // click on an element: which work package is it?
  const ray=new T3.Raycaster(); let dn=null;
  cv.addEventListener('pointerdown',e=>{dn=[e.clientX,e.clientY]; tween=null});
  cv.addEventListener('pointerup',e=>{if(!dn||Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>4||!I.onPick)return; const r=cv.getBoundingClientRect();
    ray.setFromCamera(new T3.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1),camera); const hit=ray.intersectObjects(list.filter(t=>t.mesh.visible&&!t.mat.transparent).map(t=>t.mesh),false)[0]; if(hit)I.onPick(hit.object.userData.tag)});
  controls.addEventListener('change',()=>{dirty=2}); new ResizeObserver(()=>I.resize()).observe(box);
  I.setLow(low0);
  // draw only when something changed: a still picture costs nothing
  (function loop(){requestAnimationFrame(loop);
    if(tween){const k=Math.min(1,(performance.now()-tween.t0)/700), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; camera.position.lerpVectors(tween.p0,tween.p1,e); controls.target.lerpVectors(tween.c0,tween.c1,e); controls.update(); dirty=2; if(k>=1)tween=null}
    if(dirty>0){dirty--; const a=performance.now(); renderer.render(scene,camera); if(I.meter){renderer.getContext().finish(); I.ms=performance.now()-a; I.tris=renderer.info.render.triangles; I.meter(I.ms,I.tris)} I.frames=(I.frames||0)+1}})();
  I._d={sun,renderer,scene,camera,list};
  return I;
}
window.MPB3D={create}; window.dispatchEvent(new Event('mpb3d-ready'));
