import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY_PRESETS } from './Quality.js';
import { setQualityLighting } from './Scene.js';

export class GameRenderer {
  constructor(canvas, scene, camera) {
    // Ask WebGL for hardware MSAA on every quality preset. This smooths silhouettes without an extra FXAA post-process pass.
    const lowPowerDevice = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 4;
    const antialias = true;
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false
    });
    if (!context) throw new Error('WebGL2 is unavailable. Try a recent browser with hardware acceleration enabled.');

    this.scene = scene;
    this.camera = camera;
    // Avoid expensive real-time shadows on low-memory / low-core devices, even if High is selected.
    this.lowPowerDevice = lowPowerDevice;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    // Low is the startup default: no scene lights, shadow-map rendering, or PMREM setup.
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = true;

    this.environmentTarget = null;
    this.composer = null;
    this.bloomPass = null;
    this.outputPass = null;
    this.quality = 'low';
    this.qualityRequest = 0;
    this.adaptiveScale = 1;
    this.shadowFlags = new WeakMap();
    this.lowPbrOriginalMaterials = new WeakMap();
    this.lowPbrObjects = new Set();
    this.lowPbrFloorVariants = new WeakMap();
    this.lowPbrVariantMaterials = new Set();
    this.birthdayThemeEnabled = false;
    this.birthdayDecorations = null;
    this.resizeObserver = new ResizeObserver(() => {
      // Mobile browser chrome can resize a 100dvh canvas during a scroll gesture.
      // Defer framebuffer reallocation while the settings sheet is open, then resize on close.
      if (document.getElementById('game')?.classList.contains('settings-open')) return;
      this.resize();
    });
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  ensureEnvironment(intensity = 0.28) {
    if (this.environmentTarget) {
      this.scene.environmentIntensity = intensity;
      return;
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.025);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = intensity;
    room.dispose?.();
    pmrem.dispose();
  }

  disposeEnvironment() {
    this.scene.environment = null;
    this.scene.environmentIntensity = 1;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
  }

  isLowGlossyFloor(object) {
    return object?.userData?.popClaySurface === 'platform'
      || object?.userData?.popClaySurface === 'base-floor'
      || object?.name === 'MainCandyPlatformTiles'
      || object?.name === 'ShelterBaseFloor';
  }

  getLowGlossyFloorMaterial(source) {
    if (!source?.isMeshStandardMaterial) return source;
    let material = this.lowPbrFloorVariants.get(source);
    if (material) return material;
    // Keep the source PBR material intact for Medium/High; only the Low floor gets this clear-coated variant.
    material = new THREE.MeshPhysicalMaterial({
      name: `LowPBR-Glossy-${source.name || 'Floor'}`,
      color: source.color?.clone?.() ?? new THREE.Color(0xffffff),
      map: source.map ?? null,
      alphaMap: source.alphaMap ?? null,
      alphaTest: source.alphaTest ?? 0,
      aoMap: source.aoMap ?? null,
      aoMapIntensity: source.aoMapIntensity ?? 1,
      bumpMap: source.bumpMap ?? null,
      bumpScale: source.bumpScale ?? 1,
      emissive: source.emissive?.clone?.() ?? new THREE.Color(0x000000),
      emissiveMap: source.emissiveMap ?? null,
      emissiveIntensity: source.emissiveIntensity ?? 1,
      lightMap: source.lightMap ?? null,
      lightMapIntensity: source.lightMapIntensity ?? 1,
      normalMap: source.normalMap ?? null,
      normalScale: source.normalScale?.clone?.() ?? new THREE.Vector2(1, 1),
      roughnessMap: source.roughnessMap ?? null,
      metalnessMap: source.metalnessMap ?? null,
      side: source.side ?? THREE.FrontSide,
      vertexColors: Boolean(source.vertexColors),
      flatShading: Boolean(source.flatShading),
      transparent: Boolean(source.transparent),
      opacity: source.opacity ?? 1,
      depthWrite: source.depthWrite ?? true,
      depthTest: source.depthTest ?? true,
      blending: source.blending ?? THREE.NormalBlending,
      fog: source.fog ?? true,
      roughness: 0.36,
      metalness: 0.02,
      envMap: source.envMap ?? null,
      envMapIntensity: 0.72,
      clearcoat: 0.24,
      clearcoatRoughness: 0.3,
      clearcoatMap: source.clearcoatMap ?? null,
      clearcoatNormalMap: source.clearcoatNormalMap ?? null,
      clearcoatRoughnessMap: source.clearcoatRoughnessMap ?? null,
      wireframe: Boolean(source.wireframe)
    });
    // Disable the clearcoat shader layer on weak GPUs while retaining low-profile PBR reflections.
    if (this.lowPowerDevice) {
      material.clearcoat = 0;
      material.clearcoatRoughness = 1;
      material.envMapIntensity = 0.42;
      material.needsUpdate = true;
    }
    this.lowPbrFloorVariants.set(source, material);
    this.lowPbrVariantMaterials.add(material);
    return material;
  }

  applyLowPbrMaterials() {
    this.scene.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      if (!this.lowPbrOriginalMaterials.has(object)) {
        this.lowPbrOriginalMaterials.set(object, object.material);
        this.lowPbrObjects.add(object);
      }
      const source = this.lowPbrOriginalMaterials.get(object);
      if (!this.isLowGlossyFloor(object)) {
        object.material = source;
        return;
      }
      object.material = Array.isArray(source)
        ? source.map((material) => this.getLowGlossyFloorMaterial(material))
        : this.getLowGlossyFloorMaterial(source);
    });
  }

  restoreLowPbrMaterials() {
    for (const object of this.lowPbrObjects) {
      if (object?.isMesh && this.lowPbrOriginalMaterials.has(object)) {
        object.material = this.lowPbrOriginalMaterials.get(object);
      }
    }
  }

  disposeLowPbrMaterials() {
    this.restoreLowPbrMaterials();
    for (const material of this.lowPbrVariantMaterials) material.dispose();
    this.lowPbrVariantMaterials.clear();
    this.lowPbrFloorVariants = new WeakMap();
    this.lowPbrObjects.clear();
  }

  createBirthdayDecorations() {
    const group = new THREE.Group();
    group.name = 'BirthdayThemePreviewDecorations';
    const colors = ['#ff6b8a', '#ffd166', '#70d6ff', '#cdb4ff', '#95e1b3', '#ff9f1c'];
    const balloonGeometry = new THREE.SphereGeometry(0.29, 10, 8);
    const balloonMaterial = new THREE.MeshStandardMaterial({
      name: 'BirthdayPreview-Balloons',
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.02,
      emissive: new THREE.Color('#160b12'),
      emissiveIntensity: 0.12
    });
    const balloonPositions = [];
    for (let x = -17.5, i = 0; x <= 17.6; x += 3.5, i++) {
      balloonPositions.push([x, 4.65 + (i % 2) * 0.35, -13.85]);
    }
    for (const side of [-1, 1]) {
      for (let z = -9; z <= 9; z += 4.5) {
        balloonPositions.push([side * 19.65, 4.25 + (Math.round(z + 9) % 2) * 0.3, z]);
      }
    }
    const balloons = new THREE.InstancedMesh(balloonGeometry, balloonMaterial, balloonPositions.length);
    balloons.name = 'BirthdayPreview-BalloonBatch';
    const dummy = new THREE.Object3D();
    const stringPoints = [];
    balloonPositions.forEach(([x, y, z], index) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(1, 1.23, 0.92);
      dummy.rotation.set(0, (index % 3 - 1) * 0.12, (index % 5 - 2) * 0.06);
      dummy.updateMatrix();
      balloons.setMatrixAt(index, dummy.matrix);
      balloons.setColorAt(index, new THREE.Color(colors[index % colors.length]));
      stringPoints.push(x, y - 0.34, z, x + (index % 2 ? 0.06 : -0.06), y - 0.92, z);
    });
    balloons.instanceMatrix.needsUpdate = true;
    if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
    group.add(balloons);

    const stringsGeometry = new THREE.BufferGeometry();
    stringsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stringPoints, 3));
    const strings = new THREE.LineSegments(stringsGeometry, new THREE.LineBasicMaterial({
      color: '#fff0df',
      transparent: true,
      opacity: 0.8
    }));
    strings.name = 'BirthdayPreview-BalloonStrings';
    group.add(strings);

    const flagPositions = [];
    const flagColors = [];
    const buntingLinePoints = [];
    const flagCount = 15;
    for (let i = 0; i < flagCount; i++) {
      const x = -15 + i * (30 / (flagCount - 1));
      const y = 5.9 - Math.sin((i / (flagCount - 1)) * Math.PI) * 0.58;
      const half = 0.72;
      flagPositions.push(x - half, y, -14.42, x + half, y, -14.42, x, y - 0.9, -14.42);
      const color = new THREE.Color(colors[i % colors.length]);
      flagColors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
      if (i < flagCount - 1) {
        const nextX = -15 + (i + 1) * (30 / (flagCount - 1));
        const nextY = 5.9 - Math.sin(((i + 1) / (flagCount - 1)) * Math.PI) * 0.58;
        buntingLinePoints.push(x, y, -14.4, nextX, nextY, -14.4);
      }
    }
    const flagsGeometry = new THREE.BufferGeometry();
    flagsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flagPositions, 3));
    flagsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(flagColors, 3));
    flagsGeometry.computeVertexNormals();
    const flags = new THREE.Mesh(flagsGeometry, new THREE.MeshStandardMaterial({
      name: 'BirthdayPreview-Bunting',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0
    }));
    flags.name = 'BirthdayPreview-PartyBunting';
    group.add(flags);

    const cordGeometry = new THREE.BufferGeometry();
    cordGeometry.setAttribute('position', new THREE.Float32BufferAttribute(buntingLinePoints, 3));
    group.add(new THREE.LineSegments(cordGeometry, new THREE.LineBasicMaterial({ color: '#ffe8c9' })));
    return group;
  }

  setBirthdayTheme(enabled) {
    const next = Boolean(enabled);
    if (next === this.birthdayThemeEnabled) return this.birthdayThemeEnabled;
    this.birthdayThemeEnabled = next;
    if (next) {
      this.birthdayDecorations = this.createBirthdayDecorations();
      this.scene.add(this.birthdayDecorations);
    } else if (this.birthdayDecorations) {
      this.scene.remove(this.birthdayDecorations);
      this.birthdayDecorations.traverse((object) => {
        // Do not retain detached preview meshes in Low-quality material/shadow tracking sets.
        this.lowPbrObjects.delete(object);
        this.lowPbrOriginalMaterials.delete(object);
        this.shadowFlags.delete(object);
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose?.();
      });
      this.birthdayDecorations = null;
    }
    return this.birthdayThemeEnabled;
  }

  setMeshShadows(enabled) {
    const mobileDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      if (!this.shadowFlags.has(object)) {
        this.shadowFlags.set(object, { castShadow: object.castShadow, receiveShadow: object.receiveShadow });
      }
      if (enabled) {
        const original = this.shadowFlags.get(object);
        object.castShadow = original.castShadow;
        // The floor spans almost the entire camera view. Skip its shadow lookup on mobile;
        // furniture and walls keep their own shadows, and desktop restores the full floor.
        object.receiveShadow = original.receiveShadow
          && !(mobileDevice && object.userData?.popClaySurface === 'platform');
      } else {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
  }

  setDynamicPropShadows(enabled) {
    // On mobile the shelter's shadow map is cached. Keep moving props out of that static map,
    // otherwise their old silhouettes remain painted on the floor after they have been kicked.
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      let parent = object.parent;
      while (parent && !parent.userData?.movableProp) parent = parent.parent;
      if (!parent) return;
      const original = this.shadowFlags.get(object);
      object.castShadow = Boolean(enabled && original?.castShadow);
    });
  }

  setDynamicDogShadows(enabled) {
    const dog = this.scene.getObjectByName('PlayerRobotDog');
    if (!dog) return;
    dog.traverse((object) => {
      if (!object.isMesh) return;
      const original = this.shadowFlags.get(object);
      object.castShadow = Boolean(enabled && original?.castShadow);
    });
  }

  async setQuality(name) {
    const preset = QUALITY_PRESETS[name] || QUALITY_PRESETS.medium;
    this.quality = QUALITY_PRESETS[name] ? name : 'medium';
    const request = ++this.qualityRequest;
    const mobileDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    // High on mobile caps pixel ratio at 1.0 rather than supersampling at 1.25,
    // avoiding about 36% more fragment work while keeping antialiasing enabled.
    const pixelRatioCap = mobileDevice ? Math.min(preset.pixelRatio, 1.0) : preset.pixelRatio;
    // Mobile uses a modest view-distance cap to reduce visible batches and overdraw.
    this.camera.far = mobileDevice ? Math.min(preset.drawDistance ?? 72, 72) : (preset.drawDistance ?? 72);
    this.camera.updateProjectionMatrix();
    const shadowEnabled = preset.shadows && !this.lowPowerDevice;
    // The shelter sun and its world geometry are static. Mobile reuses its shadow map instead of rebuilding it every frame.
    this.renderer.shadowMap.autoUpdate = !mobileDevice;
    const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap) * this.adaptiveScale;
    this.renderer.setPixelRatio(dpr);
    this.disposeComposer();

    // Never leave the post-processing framebuffer bound between profile changes.
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = true;
    this.renderer.setClearColor(this.scene.background || '#b9ded9', 1);

    if (this.quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.shadowMap.needsUpdate = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.96;
      this.setMeshShadows(false);

      // Native PBR plus a compact PMREM room environment: no MatCap, shadow maps, or post-processing.
      setQualityLighting(this.scene, true, { shadows: false, intensityScale: 0.68 });
      this.ensureEnvironment(0.52);
      this.applyLowPbrMaterials();
      this.resize();
      return;
    }

    this.restoreLowPbrMaterials();
    this.setMeshShadows(shadowEnabled);
    this.setDynamicPropShadows(!mobileDevice && shadowEnabled);
    // The moving dog already has a soft ground-contact shadow. On mobile, exclude it from the cached static shadow map.
    if (mobileDevice && shadowEnabled) this.setDynamicDogShadows(false);
    setQualityLighting(this.scene, true, { shadows: shadowEnabled, intensityScale: 1 });
    this.ensureEnvironment(0.28);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = shadowEnabled;
    // Softer PCF shadows on desktop; cheaper PCF and smaller maps on mobile.
    this.renderer.shadowMap.type = shadowEnabled && !mobileDevice ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    // Shadow maps are sized only while a lit profile is active.
    if (shadowEnabled) {
      this.scene.traverse((object) => {
        if (!object.isLight || !object.castShadow || !object.shadow) return;
        const size = mobileDevice ? Math.min(preset.shadowMapSize, 512) : preset.shadowMapSize;
        if (object.shadow.mapSize.width !== size || object.shadow.mapSize.height !== size) {
          object.shadow.map?.dispose();
          object.shadow.map = null;
          object.shadow.mapSize.set(size, size);
          object.shadow.needsUpdate = true;
        }
      });
      this.renderer.shadowMap.needsUpdate = true;
    }

    // Post-processing is disabled on low/medium and on small/low-power devices.
    // One optional bloom pass is retained for High on capable desktop hardware. No SSAO or SMAA passes.
    const weakDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches
      || (navigator.hardwareConcurrency || 4) <= 4
      || (navigator.deviceMemory || 4) <= 4;
    if (this.quality === 'high' && preset.bloom && !weakDevice) {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.045, 0.16, 1.12);
      this.composer.addPass(this.bloomPass);
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(size.x, size.y);
    }

    this.resize();
  }

  setAdaptiveScale(scale) {
    const next = THREE.MathUtils.clamp(scale, 0.38, 1);
    if (Math.abs(next - this.adaptiveScale) < 0.025) return;
    this.adaptiveScale = next;
    const preset = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.medium;
    const mobileDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    const pixelRatioCap = mobileDevice ? Math.min(preset.pixelRatio, 1.0) : preset.pixelRatio;
    const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap) * this.adaptiveScale;
    this.renderer.setPixelRatio(dpr);
    this.composer?.setPixelRatio(dpr);
    this.resize();
  }

  resize() {
    const host = this.renderer.domElement.parentElement || this.renderer.domElement;
    const width = Math.max(1, host.clientWidth || window.innerWidth);
    const height = Math.max(1, host.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.bloomPass?.setSize) this.bloomPass.setSize(width, height);
    }
  }

  async warmup() {
    // Compile the active scene programs while the loading screen is still covering the canvas.
    // This prevents the first interactive frames from paying the shader-compilation cost.
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    try {
      if (typeof this.renderer.compileAsync === 'function') {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
      // Prime the active render path once so the first visible frame is not also its warm-up frame.
      this.render();
    } catch (error) {
      console.warn('[RDS] Renderer warm-up skipped; normal rendering will continue:', error);
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  disposeComposer() {
    this.bloomPass?.dispose?.();
    this.outputPass?.dispose?.();
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.outputPass = null;
  }

  dispose() {
    this.setBirthdayTheme(false);
    this.disposeComposer();
    this.disposeEnvironment();
    this.disposeLowPbrMaterials();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
