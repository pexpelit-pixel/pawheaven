import './editor.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Shelter } from '../world/Shelter.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'paw-haven-ai-spatial-generator-v1';
const WORLD = Object.freeze({name:'Paw Haven Shelter',minX:-21.5,maxX:21.5,minY:-4,maxY:8,minZ:-15.5,maxZ:15.5,width:43,depth:31,unit:'m'});
const AXES = ['x','y','z'];
const ACTIONS = {
 place:{code:'PLACE_OBJECT',label:'Taruh objek',color:'#66e0c2'},
 move:{code:'MOVE_OBJECT',label:'Pindahkan objek',color:'#f3d56e'},
 modify:{code:'MODIFY_AREA',label:'Ubah area / objek',color:'#86aef0'},
 remove:{code:'REMOVE_OBJECT',label:'Hapus objek',color:'#ee9e97'},
 keep_clear:{code:'KEEP_CLEAR',label:'Jalur kosong',color:'#e7bf78'},
 trigger:{code:'DEFINE_TRIGGER',label:'Trigger volume',color:'#c2a0ed'},
 route:{code:'DEFINE_ROUTE',label:'Jalur / waypoint',color:'#9ad58e'},
 note:{code:'AI_NOTE',label:'Catatan untuk AI',color:'#a3b6c5'}
};
const TARGET_TYPES = new Set(['unspecified','table','chair','doghouse','bed','decoration','plant','prop','trigger','waypoint','clearance','custom']);
const finite = (value,fallback=0) => {const n=Number(value);return Number.isFinite(n)?n:fallback;};
const clone = (value) => JSON.parse(JSON.stringify(value));
const fmt = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
const uid = (prefix='zone') => prefix+'-'+Math.random().toString(36).slice(2,8)+'-'+Date.now().toString(36).slice(-4);
const slug = (value) => String(value||'spatial-plan').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'spatial-plan';
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function createRegion(a={x:-4,y:0.085,z:-4},b={x:4,y:3,z:4},index=1){
 return {id:uid(),label:'EDIT_ZONE_'+String(index).padStart(2,'0'),action:'place',priority:'normal',targetName:'',targetId:null,targetType:'unspecified',count:1,
  instruction:'Tempatkan objek yang diminta di dalam rentang koordinat ini. Jangan menutup jalur utama dan pertahankan objek yang sudah ada kecuali perubahan memang diperlukan.',
  a:{x:a.x,y:a.y,z:a.z},b:{x:b.x,y:b.y,z:b.z},clearance:.25,rotationY:0,surfaceSnap:true,avoidOverlap:true,preserveExisting:true};
}
function normalizeImportedRegion(raw,index){
 const source=raw.spatialConstraint||raw.spatial||raw,legacyPosition=raw.position||{},legacySize=raw.dimensions||{x:1,y:1,z:1},legacyScale=raw.scale||{x:1,y:1,z:1};
 const legacyA=raw.position?{x:finite(legacyPosition.x)-finite(legacySize.x,1)*finite(legacyScale.x,1)*.5,y:finite(legacyPosition.y,.085),z:finite(legacyPosition.z)-finite(legacySize.z,1)*finite(legacyScale.z,1)*.5}:null;
 const legacyB=raw.position?{x:finite(legacyPosition.x)+finite(legacySize.x,1)*finite(legacyScale.x,1)*.5,y:finite(legacyPosition.y,.085)+finite(legacySize.y,1)*finite(legacyScale.y,1),z:finite(legacyPosition.z)+finite(legacySize.z,1)*finite(legacyScale.z,1)*.5}:null;
 const a=source.from||raw.a||raw.start||legacyA||{x:0,y:.085,z:0},b=source.to||raw.b||raw.end||legacyB||{x:0,y:3,z:0};
 const r=createRegion(a,b,index);r.id=typeof raw.id==='string'&&raw.id.length<128?raw.id:r.id;r.label=String(raw.label||raw.aiLabel||raw.name||('EDIT_ZONE_'+String(index).padStart(2,'0'))).slice(0,80);
 r.action=String(raw.action||'place').toLowerCase();if(!ACTIONS[r.action])r.action='place';
 r.priority=['low','normal','high','critical'].includes(raw.priority)?raw.priority:'normal';
 r.targetName=String((raw.target&&raw.target.name)||raw.targetName||raw.name||'').slice(0,100);
 r.targetId=String((raw.target&&(raw.target.id||raw.target.objectId))||raw.targetId||'').slice(0,128)||null;
 r.targetType=String((raw.target&&raw.target.type)||raw.targetType||'unspecified');if(!TARGET_TYPES.has(r.targetType))r.targetType='custom';
 r.count=Math.round(clamp(finite((raw.target&&raw.target.count)||raw.count,1),1,1000));r.instruction=String(raw.instruction||raw.aiInstruction||'').slice(0,1600);
 for(const axis of AXES){const range=axis==='x'?[WORLD.minX,WORLD.maxX]:axis==='y'?[WORLD.minY,WORLD.maxY]:[WORLD.minZ,WORLD.maxZ];r.a[axis]=clamp(finite(a[axis],0),range[0],range[1]);r.b[axis]=clamp(finite(b[axis],axis==='y'?3:0),range[0],range[1]);}
 r.clearance=clamp(finite(raw.clearance??source.clearanceMeters??source.clearance,.25),0,20);r.rotationY=clamp(finite((raw.target&&raw.target.rotationDeg&&raw.target.rotationDeg.y)??raw.rotationY,0),-3600,3600);
 r.surfaceSnap=raw.surfaceSnap??source.surfaceSnap??true;r.avoidOverlap=raw.avoidOverlap??source.avoidOverlap??true;r.preserveExisting=raw.preserveExisting??source.preserveExisting??true;return r;
}

class SpatialJsonGenerator{
 constructor(){
  this.regions=this.loadLocal();this.selectedId=null;this.mode='select';this.draftA=null;this.draftPointer=null;this.pointerStart=null;this.pointerMoved=false;this.pointerDownClientX=0;this.pointerDownClientY=0;this.showLabels=true;this.canvas=$('spatial-map');this.toastTimer=null;this.scene=null;this.camera=null;this.renderer=null;this.controls=null;this.shelter=null;this.raycaster=new THREE.Raycaster();this.pointerNdc=new THREE.Vector2();this.groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.zoneRoot=null;this.zoneMaterials=new Map();this.labelNodes=[];this.visualGeometry=null;this.edgeGeometry=null;this.markerGeometry=null;this.labelsLayer=null;this.draftGroup=null;this.draftBox=null;this.draftMarker=null;this.controlsDragEnabled=true;this.cameraStickVector={x:0,y:0};this.cameraStickPointer=null;this.cameraStickRaf=0;this.cameraStickLast=0;
  this.initEvents();this.renderAll();this.resizeObserver=new ResizeObserver(()=>this.drawMap());this.resizeObserver.observe($('map-wrap'));window.addEventListener('resize',()=>this.drawMap());this.setStatus('Memuat dunia 3D Paw Haven…');this.init3D();
 }
 async init3D(){
  try{
   const wrap=$('map-wrap');
   this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c7d8ce');this.scene.fog=new THREE.Fog('#c7d8ce',45,100);
   const rect=wrap.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
   this.camera=new THREE.PerspectiveCamera(48,width/height,.12,140);this.camera.position.set(13,15,17);this.camera.lookAt(0,0,0);
   this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,alpha:false,powerPreference:'low-power',precision:'mediump'});
   this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));this.renderer.setSize(width,height,false);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
   this.scene.add(new THREE.HemisphereLight(0xf1f7eb,0x657c72,2.15));
   const sun=new THREE.DirectionalLight(0xfff3d9,2.2);sun.position.set(12,24,9);this.scene.add(sun);
   // The editor previews the exact Shelter class used by the live game, including current Decorations.js and Props.js.
   this.shelter=new Shelter(this.scene);
   await this.shelter.build((progress,message)=>{this.setStatus('Sinkronisasi world game · '+Math.round(progress*100)+'%');});
   this.shelter.root.updateMatrixWorld(true);
   this.zoneRoot=new THREE.Group();this.zoneRoot.name='AIWorldLabels';this.scene.add(this.zoneRoot);
   this.visualGeometry=new THREE.BoxGeometry(1,1,1);this.edgeGeometry=new THREE.EdgesGeometry(this.visualGeometry);this.markerGeometry=new THREE.SphereGeometry(.12,10,8);
   const grid=new THREE.GridHelper(40,40,0x9fc4b3,0x9eb2a8);grid.position.y=.025;grid.material.transparent=true;grid.material.opacity=.23;grid.material.depthWrite=false;this.scene.add(grid);
   this.controls=new OrbitControls(this.camera,this.canvas);this.controls.target.set(0,.55,0);this.controls.enableDamping=false;this.controls.enablePan=true;this.controls.minDistance=5;this.controls.maxDistance=58;this.controls.minPolarAngle=.12;this.controls.maxPolarAngle=1.48;this.controls.rotateSpeed=.72;this.controls.zoomSpeed=.9;this.controls.panSpeed=.7;
   this.controls.addEventListener('change',()=>this.render3D());
   this.labelsLayer=$('world-label-layer');
   this.draftGroup=new THREE.Group();this.draftGroup.name='DraftAim';this.scene.add(this.draftGroup);
   const draftMaterial=new THREE.MeshBasicMaterial({color:0xc4f16e,wireframe:true,transparent:true,opacity:.95});
   this.draftBox=new THREE.Mesh(this.visualGeometry,draftMaterial);this.draftBox.visible=false;this.draftGroup.add(this.draftBox);
   const draftPointMaterial=new THREE.MeshBasicMaterial({color:0xffe7a8,depthTest:false});this.draftMarker=new THREE.Mesh(this.markerGeometry,draftPointMaterial);this.draftMarker.visible=false;this.draftMarker.renderOrder=20;this.draftGroup.add(this.draftMarker);
   this.drawMap();this.setStatus('Dunia 3D siap · bidik dan klik titik untuk memberi label');
  }catch(error){
   console.error('AI Spatial 3D editor failed:',error);this.setStatus('Gagal memuat dunia 3D: '+(error&&error.message?error.message:'error'));this.showToast('Dunia 3D gagal dimuat. Periksa console browser.');
  }
 }
 loadLocal(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(!raw||!Array.isArray(raw.regions))return [];return raw.regions.slice(0,1000).map(normalizeImportedRegion);}catch{return [];}}
 get selected(){return this.regions.find(r=>r.id===this.selectedId)||null;}
 setStatus(message){$('status-text').textContent=message;}
 showToast(message){
  let el=$('toast-message');if(!el){el=document.createElement('div');el.id='toast-message';el.className='toast';el.setAttribute('role','status');document.body.append(el);}
  el.textContent=message;el.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{el.hidden=true;},2400);
 }
 initEvents(){
  $('select-mode-btn').addEventListener('click',()=>{this.setMode('select');this.closeDrawer();});
  $('draw-mode-btn').addEventListener('click',()=>{this.setMode(this.mode==='draw'?'select':'draw');this.closeDrawer();});
  $('show-labels-btn').addEventListener('click',()=>{this.showLabels=!this.showLabels;$('show-labels-btn').classList.toggle('active',this.showLabels);$('show-labels-btn').setAttribute('aria-pressed',String(this.showLabels));$('show-labels-btn').querySelector('small').textContent=this.showLabels?'LABEL ON':'LABEL OFF';this.drawMap();});
  $('add-zone-btn').addEventListener('click',()=>this.addManualZone());
  $('zone-list').addEventListener('click',e=>{const b=e.target.closest('[data-zone-id]');if(b)this.selectZone(b.dataset.zoneId);});
  $('search-input').addEventListener('input',()=>this.renderZoneList());
  $('zone-form').addEventListener('input',e=>this.onFieldInput(e));$('zone-form').addEventListener('change',e=>this.onFieldChange(e));
  $('delete-zone-btn').addEventListener('click',()=>this.deleteSelected());$('duplicate-zone-btn').addEventListener('click',()=>this.duplicateSelected());
  $('sync-world-btn').addEventListener('click',()=>{this.setStatus('Memuat ulang source world terbaru…');window.location.reload();});
  $('save-local-btn').addEventListener('click',()=>this.saveLocal(true));$('copy-json-btn').addEventListener('click',()=>this.copyJson());$('copy-json-bottom-btn').addEventListener('click',()=>this.copyJson());
  $('export-json-btn').addEventListener('click',()=>this.downloadJson());$('download-json-bottom-btn').addEventListener('click',()=>this.downloadJson());
  $('import-json-btn').addEventListener('click',()=>$('import-json-file').click());$('import-json-file').addEventListener('change',e=>this.importJson(e.target.files&&e.target.files[0]));
  $('panel-toggle-btn').addEventListener('click',()=>this.toggleDrawer(this.selected?'details':'zones'));
  $('panel-close').addEventListener('click',()=>this.closeDrawer());$('panel-close-btn').addEventListener('click',()=>{this.closeDrawer();this.closeJsonPanel();});
  $('editor-tab-details').addEventListener('click',()=>this.setDrawerTab('details'));$('editor-tab-zones').addEventListener('click',()=>this.setDrawerTab('zones'));
  $('json-toggle-btn').addEventListener('click',()=>this.toggleJsonPanel());$('json-close-btn').addEventListener('click',()=>this.closeJsonPanel());
  $('create-point-btn').addEventListener('click',()=>{const p=this.controls?this.controls.target:new THREE.Vector3(0,.085,0);this.addPointRegion(p);});
  const stick=$('camera-stick');
  stick.addEventListener('pointerdown',e=>this.onCameraStickDown(e));
  stick.addEventListener('pointermove',e=>this.onCameraStickMove(e));
  stick.addEventListener('pointerup',e=>this.onCameraStickUp(e));
  stick.addEventListener('pointercancel',e=>this.onCameraStickUp(e));
  window.addEventListener('pointermove',e=>this.onCameraStickMove(e),{passive:false});
  window.addEventListener('pointerup',e=>this.onCameraStickUp(e));
  stick.addEventListener('keydown',e=>{const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(dirs[e.key]){e.preventDefault();this.cameraStickVector={x:dirs[e.key][0],y:dirs[e.key][1]};this.cameraStickLast=0;if(!this.cameraStickRaf)this.cameraStickRaf=requestAnimationFrame(this.cameraStickLoop);}if(e.key==='Escape')this.releaseCameraStick();});stick.addEventListener('keyup',()=>this.releaseCameraStick());stick.addEventListener('blur',()=>this.releaseCameraStick());
  this.canvas.addEventListener('pointerdown',e=>this.onMapPointerDown(e));this.canvas.addEventListener('pointermove',e=>this.onMapPointerMove(e));this.canvas.addEventListener('pointerup',e=>this.onMapPointerUp(e));
  this.canvas.addEventListener('pointercancel',()=>{this.pointerStart=null;this.pointerStartTarget=null;this.draftATarget=null;this.pointerMoved=false;if(this.controls)this.controls.enabled=true;this.hideDraft();});
  window.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();this.downloadJson();}
   if(e.key==='Escape'&&this.mode==='draw'){this.draftA=null;this.draftATarget=null;this.draftPointer=null;this.setMode('select');this.closeDrawer();}
   if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))this.deleteSelected();
  });
 }
 toggleDrawer(tab='details'){
  const app=$('editor-app');
  if(app.classList.contains('json-open')){this.closeJsonPanel();this.openDrawer(tab);return;}
  if(app.classList.contains('drawer-open')){this.closeDrawer();return;}
  this.openDrawer(tab);
 }
 openDrawer(tab='details'){
  this.closeJsonPanel();this.setDrawerTab(tab);$('editor-app').classList.add('drawer-open');$('panel-toggle-btn').setAttribute('aria-expanded','true');
 }
 closeDrawer(){
  $('editor-app').classList.remove('drawer-open');$('panel-toggle-btn').setAttribute('aria-expanded','false');
  if($('editor-app').classList.contains('json-open'))this.closeJsonPanel();
 }
 setDrawerTab(tab='details'){
  const details=tab!=='zones';$('details-view').hidden=!details;$('zones-view').hidden=details;
  $('editor-tab-details').classList.toggle('active',details);$('editor-tab-zones').classList.toggle('active',!details);
 }
 toggleJsonPanel(){
  if($('editor-app').classList.contains('json-open')){this.closeJsonPanel();return;}
  this.closeDrawer();$('json-panel').hidden=false;$('editor-app').classList.add('json-open','drawer-open');$('json-toggle-btn').setAttribute('aria-expanded','true');
 }
 closeJsonPanel(){
  $('editor-app').classList.remove('json-open','drawer-open');$('json-panel').hidden=true;$('json-toggle-btn').setAttribute('aria-expanded','false');
 }
 onCameraStickDown(event){
  event.preventDefault();event.stopPropagation();this.cameraStickPointer=event.pointerId;$('camera-stick').setPointerCapture?.(event.pointerId);
  this.cameraStickLast=0;this.updateCameraStickVector(event.clientX,event.clientY);
  if(!this.cameraStickRaf)this.cameraStickRaf=requestAnimationFrame(this.cameraStickLoop);
 }
 onCameraStickMove(event){
  if(this.cameraStickPointer!==event.pointerId)return;event.preventDefault();this.updateCameraStickVector(event.clientX,event.clientY);
 }
 updateCameraStickVector(clientX,clientY){
  const pad=$('camera-stick'),rect=pad.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,radius=rect.width*.31;
  let x=(clientX-cx)/radius,y=(clientY-cy)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  this.cameraStickVector={x,y};$('camera-knob').style.transform='translate(calc(-50% + '+(x*radius)+'px),calc(-50% + '+(y*radius)+'px))';
  if(Math.hypot(x,y)>.05){this.cameraStickLast=0;if(!this.cameraStickRaf)this.cameraStickRaf=requestAnimationFrame(this.cameraStickLoop);}
 }
 onCameraStickUp(event){
  if(this.cameraStickPointer!==null&&event.pointerId!==this.cameraStickPointer)return;
  this.releaseCameraStick();
 }
 releaseCameraStick(){
  this.cameraStickPointer=null;this.cameraStickVector={x:0,y:0};this.cameraStickLast=0;
  const knob=$('camera-knob');if(knob)knob.style.transform='translate(-50%,-50%)';
 }
 cameraStickLoop=(time)=>{
  if(!this.camera||!this.controls||Math.hypot(this.cameraStickVector.x,this.cameraStickVector.y)<.04){this.cameraStickRaf=0;this.cameraStickLast=0;return;}
  const dt=this.cameraStickLast?Math.min(.04,(time-this.cameraStickLast)/1000):1/60;this.cameraStickLast=time;
  // Pan only: translate the camera and orbit target together in screen space.
  // Keep the camera-target offset unchanged so the analog never rotates the view.
  this.camera.updateMatrixWorld(true);
  const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0).normalize();
  const up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1).normalize();
  const pan=right.multiplyScalar(this.cameraStickVector.x*dt*5.2)
    .addScaledVector(up,-this.cameraStickVector.y*dt*5.2);
  this.camera.position.add(pan);this.controls.target.add(pan);
  this.controls.update();this.render3D();
  this.cameraStickRaf=requestAnimationFrame(this.cameraStickLoop);
 }
 setMode(mode){
  this.mode=mode;if(mode!=='draw'){this.draftA=null;this.draftATarget=null;this.draftPointer=null;this.hideDraft();}
  $('select-mode-btn').classList.toggle('active',mode==='select');$('draw-mode-btn').classList.toggle('active',mode==='draw');
  $('map-instruction').textContent=mode==='draw'?'Bidik permukaan 3D, klik titik A lalu B, atau seret untuk membatasi area.':'Putar kamera, lalu klik permukaan/titik dunia untuk memberi label.';
  $('draft-status').textContent=mode==='draw'?'BIDIK TITIK A → B · DRAG UNTUK AREA':'ORBIT: DRAG · ZOOM: PINCH/SCROLL · KLIK: LABEL TITIK';this.canvas.style.cursor=mode==='draw'?'crosshair':'grab';if(this.controls)this.controls.enabled=mode!=='draw';this.drawMap();
 }
 addManualZone(){
  if(this.regions.length>=1000){this.showToast('Batas 1.000 zona telah tercapai.');return;}
  const r=createRegion(undefined,undefined,this.regions.length+1);this.regions.push(r);this.selectedId=r.id;this.setMode('select');this.renderAll();this.saveLocal(false);this.setStatus('Label manual dibuat');this.showToast('Isi label dan instruksi AI.');this.openDrawer('details');
 }
 addRegionBetween(a,b,target=null){
  if(this.regions.length>=1000){this.showToast('Batas 1.000 zona telah tercapai.');this.setMode('select');return;}
  const pointA={x:clamp(finite(a.x),WORLD.minX,WORLD.maxX),y:clamp(finite(a.y,.085),WORLD.minY,WORLD.maxY),z:clamp(finite(a.z),WORLD.minZ,WORLD.maxZ)};
  const pointB={x:clamp(finite(b.x),WORLD.minX,WORLD.maxX),y:clamp(finite(b.y,.085),WORLD.minY,WORLD.maxY),z:clamp(finite(b.z),WORLD.minZ,WORLD.maxZ)};
  const r=createRegion(pointA,pointB,this.regions.length+1);r.label='EDIT_ZONE_'+String(this.regions.length+1).padStart(2,'0');if(target){r.targetName=String(target.name||target.id||'').slice(0,100);r.targetId=target.id||null;r.targetType=target.type==='movable'?'prop':'custom';}
  this.regions.push(r);this.selectedId=r.id;this.draftA=null;this.draftPointer=null;this.mode='select';this.hideDraft();this.renderAll();this.saveLocal(false);
  this.setStatus('Rentang 3D dibuat');this.showToast('Dua titik 3D terkunci. Beri label dan instruksi.');this.setMode('select');this.openDrawer('details');
 }
 selectZone(id){
  this.selectedId=id;this.mode='select';this.draftA=null;this.draftPointer=null;if(this.controls)this.controls.enabled=true;this.hideDraft();$('select-mode-btn').classList.add('active');$('draw-mode-btn').classList.remove('active');
  $('map-instruction').textContent='Label dipilih. Ubah nama atau instruksi AI di panel editor.';this.renderAll();this.setStatus(this.selected?'Label: '+this.selected.label:'Label dipilih');this.openDrawer('details');
 }
 deleteSelected(){
  const r=this.selected;if(!r){this.showToast('Pilih zona yang ingin dihapus.');return;}const label=r.label;this.regions=this.regions.filter(x=>x.id!==r.id);this.selectedId=this.regions.length?this.regions[this.regions.length-1].id:null;
  this.renderAll();this.saveLocal(false);this.setStatus('Zona dihapus');this.showToast('Zona dihapus: '+label);
 }
 duplicateSelected(){
  const r=this.selected;if(!r){this.showToast('Pilih zona untuk diduplikasi.');return;}if(this.regions.length>=1000){this.showToast('Batas 1.000 zona telah tercapai.');return;}
  const copy=clone(r);copy.id=uid();copy.label=r.label+'_COPY';copy.a.x=clamp(copy.a.x+.75,WORLD.minX,WORLD.maxX);copy.b.x=clamp(copy.b.x+.75,WORLD.minX,WORLD.maxX);
  this.regions.push(copy);this.selectedId=copy.id;this.renderAll();this.saveLocal(false);this.setStatus('Zona diduplikasi');
 }
 axisRange(axis){return axis==='x'?[WORLD.minX,WORLD.maxX]:axis==='y'?[WORLD.minY,WORLD.maxY]:[WORLD.minZ,WORLD.maxZ];}
 assignField(region,key,input){
  if(key==='label')region.label=String(input.value).trim().slice(0,80)||'EDIT_ZONE';
  else if(key==='action')region.action=ACTIONS[input.value]?input.value:'place';
  else if(key==='priority')region.priority=['low','normal','high','critical'].includes(input.value)?input.value:'normal';
  else if(key==='targetName')region.targetName=String(input.value).slice(0,100);
  else if(key==='targetType')region.targetType=TARGET_TYPES.has(input.value)?input.value:'custom';
  else if(key==='count')region.count=Math.round(clamp(finite(input.value,1),1,1000));
  else if(key==='instruction')region.instruction=String(input.value).slice(0,1600);
  else if(key==='clearance')region.clearance=clamp(finite(input.value,.25),0,20);
  else if(key==='rotationY')region.rotationY=clamp(finite(input.value,0),-3600,3600);
  else if(key==='surfaceSnap')region.surfaceSnap=Boolean(input.checked);
  else if(key==='avoidOverlap')region.avoidOverlap=Boolean(input.checked);
  else if(key==='preserveExisting')region.preserveExisting=Boolean(input.checked);
 }
 onFieldInput(event){
  const r=this.selected;if(!r)return;const input=event.target;
  if(input.dataset.point&&input.dataset.axis){const range=this.axisRange(input.dataset.axis);r[input.dataset.point][input.dataset.axis]=clamp(finite(input.value,r[input.dataset.point][input.dataset.axis]),range[0],range[1]);}
  else if(input.dataset.field)this.assignField(r,input.dataset.field,input);else return;
  this.updateSelectedLabels();this.drawMap();this.renderJson();
 }
 onFieldChange(event){
  const r=this.selected;if(!r)return;const input=event.target;
  if(input.dataset.point&&input.dataset.axis){const range=this.axisRange(input.dataset.axis);input.value=fmt(clamp(finite(input.value,0),range[0],range[1]));}
  else if(input.dataset.field)this.assignField(r,input.dataset.field,input);
  this.refreshDerived();this.saveLocal(false);
 }
 updateSelectedLabels(){
  const r=this.selected;if(!r)return;const b=this.getBounds(r);
  $('inspector-title').textContent=r.label||'Instruksi zona';
  $('normalized-bounds').textContent='X: '+fmt(b.min.x)+' → '+fmt(b.max.x)+' · Y: '+fmt(b.min.y)+' → '+fmt(b.max.y)+' · Z: '+fmt(b.min.z)+' → '+fmt(b.max.z);
  $('range-summary').querySelector('b').textContent=r.label||'Rentang koordinat';
  $('range-summary').querySelector('small').textContent='AI membaca '+ACTIONS[r.action].code+' dari FROM ('+fmt(r.a.x)+', '+fmt(r.a.y)+', '+fmt(r.a.z)+') sampai TO ('+fmt(r.b.x)+', '+fmt(r.b.y)+', '+fmt(r.b.z)+').';
  $('draft-status').textContent='A ('+fmt(r.a.x)+', '+fmt(r.a.y)+', '+fmt(r.a.z)+') → B ('+fmt(r.b.x)+', '+fmt(r.b.y)+', '+fmt(r.b.z)+')';
 }
 renderInspector(){
  const r=this.selected;$('empty-inspector').hidden=Boolean(r);$('zone-form').hidden=!r;
  if(!r){$('inspector-title').textContent='Instruksi zona';$('range-summary').querySelector('b').textContent='Rentang koordinat';$('range-summary').querySelector('small').textContent='Pilih titik A dan B pada peta untuk membuat zona yang dapat dibaca AI.';return;}
  $('inspector-title').textContent=r.label;$('zone-label').value=r.label;$('zone-action').value=r.action;$('zone-priority').value=r.priority;$('target-name').value=r.targetName;$('target-type').value=r.targetType;$('target-count').value=r.count;$('zone-instruction').value=r.instruction;
  $('zone-clearance').value=r.clearance;$('target-yaw').value=r.rotationY;$('surface-snap').checked=r.surfaceSnap;$('avoid-overlap').checked=r.avoidOverlap;$('preserve-existing').checked=r.preserveExisting;
  for(const [container,point] of [['point-a-fields','a'],['point-b-fields','b']]){
   const element=$(container);element.replaceChildren();
   for(const axis of AXES){
    const label=document.createElement('label');label.className='vector-field';const small=document.createElement('small');small.textContent=axis.toUpperCase()+(axis==='x'?' · X':'');
    const input=document.createElement('input');input.type='number';input.step='.05';input.value=fmt(r[point][axis]);input.dataset.point=point;input.dataset.axis=axis;input.setAttribute('aria-label',point.toUpperCase()+' '+axis.toUpperCase());
    label.append(small,input);element.append(label);
   }
  }
  this.updateSelectedLabels();
 }
 renderZoneList(){
  const container=$('zone-list'),query=$('search-input').value.trim().toLowerCase();container.replaceChildren();
  const list=this.regions.filter(r=>(r.label+' '+r.targetName+' '+r.instruction+' '+r.action).toLowerCase().includes(query));
  if(!list.length){const empty=document.createElement('div');empty.className='zone-empty';empty.textContent=this.regions.length?'Tidak ada zona yang cocok dengan pencarian.':'Belum ada label. Klik permukaan 3D untuk label titik, atau aktifkan A → B untuk membatasi area.';container.append(empty);return;}
  for(const r of list){
   const button=document.createElement('button');button.type='button';button.className='zone-card'+(r.id===this.selectedId?' selected':'');button.dataset.zoneId=r.id;
   const swatch=document.createElement('span');swatch.className='zone-swatch';swatch.style.background=ACTIONS[r.action].color;
   const copy=document.createElement('span');copy.className='zone-card-copy';const title=document.createElement('b');title.textContent=r.label;
   const sub=document.createElement('small');sub.textContent=ACTIONS[r.action].code+'\n'+fmt(r.a.x)+','+fmt(r.a.z)+' → '+fmt(r.b.x)+','+fmt(r.b.z);
   copy.append(title,sub);const pill=document.createElement('span');pill.className='zone-action-pill';pill.textContent=r.priority.toUpperCase();button.append(swatch,copy,pill);container.append(button);
  }
 }
 renderAll(){this.renderZoneList();this.renderInspector();this.refreshDerived();}
 refreshDerived(){
  $('zone-count').textContent=String(this.regions.length);$('zone-list-count').textContent=String(this.regions.length);$('directive-count').textContent=String(this.regions.length);
  this.renderZoneList();this.updateSelectedLabels();this.drawMap();this.renderJson();
 }
 getBounds(r){
  const min={},max={},center={},size={};for(const axis of AXES){min[axis]=Math.min(r.a[axis],r.b[axis]);max[axis]=Math.max(r.a[axis],r.b[axis]);size[axis]=max[axis]-min[axis];center[axis]=(min[axis]+max[axis])*.5;}
  return {type:'AABB',min,max,center,size};
 }
 makeDirective(r,index){
  const bounds=this.getBounds(r),action=ACTIONS[r.action]||ACTIONS.place,instruction=r.instruction.trim()||action.label+': '+(r.targetName||'target belum ditentukan')+' di dalam zona ini.';
  const from={x:finite(r.a.x),y:finite(r.a.y),z:finite(r.a.z)},to={x:finite(r.b.x),y:finite(r.b.y),z:finite(r.b.z)};
  const marker='AI_READABLE_BEGIN | '+r.label+' | FROM ('+fmt(from.x)+', '+fmt(from.y)+', '+fmt(from.z)+') | TO ('+fmt(to.x)+', '+fmt(to.y)+', '+fmt(to.z)+') | '+action.code+' | AI_READABLE_END';
  const isPoint=bounds.size.x<0.001&&bounds.size.y<0.001&&bounds.size.z<0.001,isMove=r.action==='move';
  const geometry=isMove?'TRANSFORM':isPoint?'POINT':'AABB';
  const directive={
   index:index+1,id:r.id,label:r.label,aiReadable:true,selectionGeometry:geometry,point:isPoint?from:null,action:r.action,actionCode:action.code,priority:r.priority,
   markers:{begin:'AI_READABLE_BEGIN',end:'AI_READABLE_END',humanReadable:marker},instruction,
   target:{id:r.targetId||null,name:r.targetName||null,type:r.targetType,rotationDeg:{x:0,y:r.rotationY,z:0}},
   spatialConstraint:{coordinateSpace:'world',units:'meters',boundsType:geometry,from,to,point:isPoint?from:null,min:bounds.min,max:bounds.max,center:bounds.center,size:bounds.size,
    placementRule:isMove?'move_target_from_source_to_destination':isPoint?'point_anchor':r.action==='keep_clear'?'exclude_objects':r.action==='remove'?'remove_matching_objects':r.action==='trigger'?'define_trigger_volume':r.action==='route'?'define_route_corridor':r.action==='modify'?'modify_existing_within_bounds':'place_target_inside_bounds',
    anchor:'bottom-center',clearanceMeters:r.clearance,surfaceSnap:r.surfaceSnap,avoidOverlap:r.avoidOverlap,preserveExisting:r.preserveExisting}
  };
  if(r.action==='place')directive.target.count=r.count;
  if(isMove)directive.expectedAIBehavior='Move the identified target from spatialConstraint.from to spatialConstraint.to. Treat these as source and destination anchors, not an AABB volume. Preserve the target geometry, size, and rotation unless separately instructed.';
  else if(isPoint)directive.expectedAIBehavior='Use this exact world-space point as the semantic anchor selected by the camera ray. Attach the requested label/instruction to this coordinate; do not widen it into a region unless instructed.';
  else if(r.action==='place')directive.expectedAIBehavior='Place the requested target inside the normalized bounds; choose a valid non-overlapping position within the volume.';
  else if(r.action==='keep_clear')directive.expectedAIBehavior='Keep this entire volume clear of new props and preserve it as usable space.';
  else if(r.action==='remove')directive.expectedAIBehavior='Remove only the specified target(s) inside this volume; do not delete unrelated objects.';
  else if(r.action==='modify')directive.expectedAIBehavior='Modify only the requested content inside this volume and preserve unrelated geometry.';
  else if(r.action==='trigger')directive.expectedAIBehavior='Define a trigger/interaction volume using these bounds.';
  else if(r.action==='route')directive.expectedAIBehavior='Interpret the bounds as a permitted route/waypoint editing corridor.';
  else directive.expectedAIBehavior='Treat the instruction as a spatial note tied to this exact coordinate range.';
  return directive;
 }
 buildPayload(){
  return {
   schema:'paw-haven-ai-spatial-directives',schemaVersion:1,
   purpose:'Coordinate-labelled edit instructions for an AI world-building assistant. This file describes requested edits; it does not directly mutate the game world.',
   coordinateSystem:{space:'world',units:'meters',origin:'world center (0,0,0)',axes:{x:'horizontal left/right',y:'vertical elevation',z:'world depth; positive Z points toward the front/entrance side'},
    worldBounds:{min:{x:WORLD.minX,y:WORLD.minY,z:WORLD.minZ},max:{x:WORLD.maxX,y:WORLD.maxY,z:WORLD.maxZ},size:{x:WORLD.width,y:WORLD.maxY-WORLD.minY,z:WORLD.depth}}},
   aiReadingProtocol:[
    'Read each directive as POINT, AABB, or TRANSFORM. For MOVE_OBJECT, FROM is the source point on the selected object and TO is the destination anchor.',
    'AI_READABLE_BEGIN and AI_READABLE_END delimit the coordinate marker; use spatialConstraint.from and spatialConstraint.to as the exact source points.',
    'For POINT use spatialConstraint.point; for AABB use min/max/center/size; for TRANSFORM use from and to as source/destination anchors, never as a volume.',
    'Do not infer a model or action that is not supported by actionCode, target, or instruction.',
    'Unless action is remove, preserveExisting stays true by default; do not replace or remove unrelated geometry.',
    'This file is a plan for the AI to interpret. Applying it to game meshes requires a separate implementation step.'
   ],
   directives:this.regions.map((r,index)=>this.makeDirective(r,index)),
   summary:{directiveCount:this.regions.length,actions:this.regions.reduce((out,r)=>{out[r.action]=(out[r.action]||0)+1;return out;},{})},
   exportedAt:new Date().toISOString()
  };
 }
 renderJson(){const text=JSON.stringify(this.buildPayload(),null,2);$('json-preview').querySelector('code').textContent=text;$('json-byte-count').textContent=new TextEncoder().encode(text).length.toLocaleString('en-US')+' bytes';$('json-status').textContent='LIVE PREVIEW · '+this.regions.length+' DIRECTIVE'+(this.regions.length===1?'':'S');}
 async copyJson(){
  const text=JSON.stringify(this.buildPayload(),null,2);
  try{
   if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
   else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('Clipboard not available');}
   this.showToast('AI Spatial JSON berhasil disalin.');this.setStatus('JSON copied to clipboard');
  }catch{this.showToast('Clipboard ditolak browser. Gunakan DOWNLOAD JSON.');this.setStatus('Gunakan download JSON untuk menyimpan hasil');}
 }
 downloadJson(){
  const text=JSON.stringify(this.buildPayload(),null,2),blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=slug(WORLD.name)+'-ai-spatial-directives.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  this.setStatus('AI Spatial JSON exported');this.showToast('JSON diekspor · '+this.regions.length+' zona instruksi.');
 }
 saveLocal(showToast=true){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({schema:'paw-haven-ai-spatial-workspace',version:1,regions:this.regions}));this.setStatus('Workspace tersimpan lokal');if(showToast)this.showToast('Zona disimpan di browser ini.');}
  catch{this.showToast('Penyimpanan lokal gagal. Unduh JSON agar tidak hilang.');}
 }
 async importJson(file){
  if(!file)return;
  try{
   if(file.size>10_000_000)throw new Error('Batas impor 10 MB');
   const raw=JSON.parse(await file.text());let incoming;
   if(Array.isArray(raw.directives))incoming=raw.directives;else if(Array.isArray(raw.regions))incoming=raw.regions;else if(Array.isArray(raw.objects))incoming=raw.objects;else throw new Error('JSON tidak berisi directives, regions, atau objects');
   if(incoming.length>1000)throw new Error('Batas impor 1.000 zona');
   const list=incoming.map((item,index)=>normalizeImportedRegion(item,index+1)),ids=new Set();for(const r of list){if(ids.has(r.id))r.id=uid();ids.add(r.id);}
   this.regions=list;this.selectedId=list[0]&&list[0].id||null;this.saveLocal(false);this.renderAll();this.setStatus('JSON diimpor');this.showToast(list.length+' zona berhasil diimpor.');
  }catch(error){this.showToast('Impor gagal: '+error.message);this.setStatus('Import failed');}
  finally{$('import-json-file').value='';}
 }
 resizeRenderer(){
  if(!this.renderer||!this.camera)return;
  const rect=$('map-wrap').getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
  if(this.canvas.width!==Math.round(width*Math.min(window.devicePixelRatio||1,1.35))||this.canvas.height!==Math.round(height*Math.min(window.devicePixelRatio||1,1.35)))this.renderer.setSize(width,height,false);
  this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
 }
 materialFor(action){
  const key=action||'place';if(this.zoneMaterials.has(key))return this.zoneMaterials.get(key);
  const color=(ACTIONS[key]||ACTIONS.place).color;
  const material={fill:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}),edge:new THREE.LineBasicMaterial({color,transparent:true,opacity:.95}),point:new THREE.MeshBasicMaterial({color,depthTest:false})};
  this.zoneMaterials.set(key,material);return material;
 }
 syncZoneVisuals(){
  if(!this.zoneRoot||!this.visualGeometry)return;
  this.zoneRoot.clear();this.labelNodes=[];if(this.labelsLayer)this.labelsLayer.replaceChildren();
  for(const r of this.regions){
   const bounds=this.getBounds(r),mat=this.materialFor(r.action),group=new THREE.Group();group.name='Zone-'+r.label;group.userData.regionId=r.id;
   const sx=Math.max(.12,bounds.size.x),sy=Math.max(.12,bounds.size.y),sz=Math.max(.12,bounds.size.z);
   const center=new THREE.Vector3(bounds.center.x,bounds.center.y,bounds.center.z);
   const volume=new THREE.Mesh(this.visualGeometry,mat.fill);volume.position.copy(center);volume.scale.set(sx,sy,sz);volume.userData.regionId=r.id;group.add(volume);
   const edges=new THREE.LineSegments(this.edgeGeometry,mat.edge);edges.position.copy(center);edges.scale.set(sx,sy,sz);edges.userData.regionId=r.id;group.add(edges);
   for(const [point,color] of [[r.a,mat.point],[r.b,this.materialFor(r.action).point]]){
    const marker=new THREE.Mesh(this.markerGeometry,color);marker.position.set(point.x,point.y,point.z);marker.renderOrder=20;marker.userData.regionId=r.id;group.add(marker);
   }
   this.zoneRoot.add(group);
   if(this.showLabels){
    const node=document.createElement('div');node.className='world-ai-label'+(r.id===this.selectedId?' selected':'');node.textContent=r.label;node.style.setProperty('--label-color',mat.edge.color.getStyle());node.dataset.zoneId=r.id;this.labelsLayer?.append(node);
    const labelPosition=new THREE.Vector3(bounds.center.x,bounds.center.y+(bounds.size.y<.15?.35:Math.max(.25,bounds.size.y*.5)),bounds.center.z);
    this.labelNodes.push({node,position:labelPosition});
   }
  }
 }
 drawMap(){
  if(!this.renderer||!this.scene||!this.camera)return;
  this.resizeRenderer();this.syncZoneVisuals();this.render3D();
 }
 render3D(){
  if(!this.renderer||!this.scene||!this.camera)return;
  this.renderer.render(this.scene,this.camera);this.updateProjectedLabels();
 }
 updateProjectedLabels(){
  if(!this.labelsLayer||!this.camera)return;
  const rect=this.canvas.getBoundingClientRect();
  for(const item of this.labelNodes){
   const p=item.position.clone().project(this.camera),visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;
   item.node.hidden=!visible;
   if(visible){item.node.style.left=((p.x*.5+.5)*rect.width)+'px';item.node.style.top=((-p.y*.5+.5)*rect.height)+'px';}
  }
 }
 resolveHitTarget(object){
  let node=object;
  while(node&&node!==this.shelter?.root){
   const movable=node.userData?.movableProp;
   if(movable?.objectId)return{id:movable.objectId,name:movable.name||movable.objectId,type:'movable'};
   if(node.name&&node.name!=='Mesh'&&node.name!==''){return{id:node.name,name:node.name,type:'static'};}
   node=node.parent;
  }
  return null;
 }
 raycastPoint(clientX,clientY){
  if(!this.camera||!this.shelter)return null;
  const rect=this.canvas.getBoundingClientRect();this.pointerNdc.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
  this.raycaster.setFromCamera(this.pointerNdc,this.camera);
  const zoneHits=this.zoneRoot?this.raycaster.intersectObject(this.zoneRoot,true):[];
  if(zoneHits.length){const id=zoneHits[0].object.userData.regionId;if(id)return{region:this.regions.find(r=>r.id===id)||null,point:zoneHits[0].point.clone()};}
  const worldHits=this.raycaster.intersectObject(this.shelter.root,true);
  if(worldHits.length){const hit=worldHits[0],point=hit.point.clone();point.x=clamp(point.x,WORLD.minX,WORLD.maxX);point.y=clamp(point.y,WORLD.minY,WORLD.maxY);point.z=clamp(point.z,WORLD.minZ,WORLD.maxZ);return{region:null,point,target:this.resolveHitTarget(hit.object)};}
  const point=this.raycaster.ray.intersectPlane(this.groundPlane,new THREE.Vector3());
  if(!point)return null;point.x=clamp(point.x,WORLD.minX,WORLD.maxX);point.y=0;point.z=clamp(point.z,WORLD.minZ,WORLD.maxZ);return{region:null,point,target:null};
 }
 setDraftPoint(point){
  if(!point||!this.draftMarker)return;this.draftMarker.position.copy(point);this.draftMarker.visible=true;
  if(this.draftA){
   const a=new THREE.Vector3(this.draftA.x,this.draftA.y,this.draftA.z),b=new THREE.Vector3(point.x,point.y,point.z),center=a.clone().add(b).multiplyScalar(.5);
   this.draftBox.position.copy(center);this.draftBox.scale.set(Math.max(.12,Math.abs(a.x-b.x)),Math.max(.12,Math.abs(a.y-b.y)),Math.max(.12,Math.abs(a.z-b.z)));this.draftBox.visible=true;
  }else this.draftBox.visible=false;
  this.render3D();
 }
 hideDraft(){if(this.draftMarker)this.draftMarker.visible=false;if(this.draftBox)this.draftBox.visible=false;this.render3D();}
 onMapPointerDown(event){
  if(event.button!==0&&event.pointerType!=='touch')return;
  this.pointerDownClientX=event.clientX;this.pointerDownClientY=event.clientY;this.pointerMoved=false;
  if(this.mode==='draw'){
   event.preventDefault();if(this.controls)this.controls.enabled=false;
   const hit=this.raycastPoint(event.clientX,event.clientY);this.pointerStart=hit?{x:hit.point.x,y:hit.point.y,z:hit.point.z}:null;this.pointerStartTarget=hit?.target||null;this.draftPointer=hit?hit.point:null;
   if(this.pointerStart){this.canvas.setPointerCapture?.(event.pointerId);this.setDraftPoint(hit.point);}
  }
 }
 onMapPointerMove(event){
  if(Math.hypot(event.clientX-this.pointerDownClientX,event.clientY-this.pointerDownClientY)>5)this.pointerMoved=true;
  let hit=null;
  if(this.mode==='draw'&&this.pointerStart){
   hit=this.raycastPoint(event.clientX,event.clientY);
   if(hit){this.draftPointer=hit.point;this.setDraftPoint(hit.point);}
  }else if(event.buttons===0&&event.pointerType!=='touch')hit=this.raycastPoint(event.clientX,event.clientY);
  if(hit){const p=hit.point;$('cursor-coordinate').textContent='X '+fmt(p.x)+' · Y '+fmt(p.y)+' · Z '+fmt(p.z);}
 }
 onMapPointerUp(event){
  const moved=this.pointerMoved;
  if(this.mode==='draw'&&this.pointerStart){
   const start=this.pointerStart,sourceTarget=this.pointerStartTarget,hit=this.raycastPoint(event.clientX,event.clientY),end=hit?{x:hit.point.x,y:hit.point.y,z:hit.point.z}:start;
   this.pointerStart=null;this.pointerStartTarget=null;this.pointerMoved=false;if(this.controls)this.controls.enabled=true;
   if(moved)this.addRegionBetween(start,end,sourceTarget);
   else if(!this.draftA){
    this.draftA=start;this.draftATarget=sourceTarget;this.draftPointer=null;this.setDraftPoint(new THREE.Vector3(start.x,start.y,start.z));this.setStatus('Titik A terkunci · bidik titik B');$('draft-status').textContent='A ('+fmt(start.x)+', '+fmt(start.y)+', '+fmt(start.z)+') · bidik titik B';
   }else{this.addRegionBetween(this.draftA,end,this.draftATarget);this.draftATarget=null;}
   if(!this.draftA)this.hideDraft();return;
  }
  if(!moved&&this.mode==='select'){
   const hit=this.raycastPoint(event.clientX,event.clientY);if(!hit)return;
   if(hit.region){this.selectZone(hit.region.id);return;}
   this.addPointRegion(hit.point);
  }
  this.pointerMoved=false;
 }
 addPointRegion(point,target=null){
  if(this.regions.length>=1000){this.showToast('Batas 1.000 label telah tercapai.');return;}
  const p={x:clamp(point.x,WORLD.minX,WORLD.maxX),y:clamp(point.y,WORLD.minY,WORLD.maxY),z:clamp(point.z,WORLD.minZ,WORLD.maxZ)};
  const r=createRegion(p,p,this.regions.length+1);r.label='AI_POINT_'+String(this.regions.length+1).padStart(2,'0');r.instruction='Titik dunia yang dibidik kamera. Gunakan label dan instruksi ini sebagai referensi spasial yang tepat; jangan pindahkan titik tanpa instruksi.';
  if(target){r.targetName=String(target.name||target.id||'').slice(0,100);r.targetId=target.id||null;r.targetType=target.type==='movable'?'prop':'custom';}
  this.regions.push(r);this.selectedId=r.id;this.renderAll();this.saveLocal(false);this.setStatus(target?'Objek terpilih: '+(target.name||target.id):'Titik 3D terkunci');this.showToast(target?'Objek '+(target.name||target.id)+' terpilih. Beri instruksi.':'Titik terpilih. Beri label dan instruksi AI.');this.openDrawer('details');
 }
 hitRegion(point){
  for(let i=this.regions.length-1;i>=0;i--){const r=this.regions[i],b=this.getBounds(r);if(point.x>=b.min.x-.08&&point.x<=b.max.x+.08&&point.y>=b.min.y-.08&&point.y<=b.max.y+.08&&point.z>=b.min.z-.08&&point.z<=b.max.z+.08)return r;}return null;
 }
}
new SpatialJsonGenerator();
