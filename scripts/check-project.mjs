import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const required = ['.gitignore', 'index.html', 'package.json', 'vite.config.js', 'server.mjs', 'manifest.json', 'PLAN.md', 'src/core/Localization.js', 'src/localization/en.json', 'src/localization/id.json', 'src/world/gamerules.json', 'src/main.js', 'src/core/Renderer.js', 'src/core/Scene.js', 'src/core/Quality.js', 'src/core/PopClay.js', 'src/core/AssetLoader.js', 'src/world/Shelter.js', 'src/world/Architecture.js', 'src/world/Props.js', 'src/world/Decorations.js', 'src/world/LevelAnchors.js', 'src/world/palette.js', 'src/character/RobotDog.js', 'src/character/inventory.js', 'src/character/DogRig.js', 'src/character/DogAnimator.js', 'src/physics/PhysicsWorld.js', 'src/controls/Input.js', 'src/controls/ThirdPersonCamera.js', 'src/systems/Movement.js', 'src/systems/LevelSystem.js', 'src/systems/Performance.js', 'src/ui/HUD.js', 'src/ui/LoadingScreen.js', 'src/styles/main.css', 'src/styles/touch-ff.css', 'src/ui/icon/package.svg', 'scripts/deploy-vps.sh', 'README.md'];
for (const rel of required) {
  try { await access(path.join(root, rel)); }
  catch { errors.push(`Missing required file: ${rel}`); }
}
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
try {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.files)) errors.push('manifest.json must contain a files array.');
  else {
    const indexed = new Set(manifest.files.map((entry) => entry.path));
    for (const rel of required) if (!indexed.has(rel)) errors.push(`manifest.json does not index required file: ${rel}`);
    for (const entry of manifest.files) {
      if (typeof entry.path !== 'string' || typeof entry.purpose !== 'string' || typeof entry.description !== 'string') errors.push('Each manifest file entry needs path, purpose, and description.');
      if (entry.status === 'present' || entry.status === 'existing') {
        try { await access(path.join(root, entry.path)); } catch { errors.push(`Manifest marks a missing file as present: ${entry.path}`); }
      }
    }
  }
} catch (error) { errors.push(`Invalid or unreadable manifest.json: ${error.message}`); }
if (pkg.type !== 'module') errors.push('package.json must use ES modules.');
if (!pkg.dependencies?.three || !pkg.dependencies?.['@dimforge/rapier3d-compat']) errors.push('Three.js and Rapier dependencies are required.');
const mainSource = await readFile(path.join(root, 'src/main.js'), 'utf8');
const rendererSource = await readFile(path.join(root, 'src/core/Renderer.js'), 'utf8');
const qualitySource = await readFile(path.join(root, 'src/core/Quality.js'), 'utf8');
const popClaySource = await readFile(path.join(root, 'src/core/PopClay.js'), 'utf8');
const sceneSource = await readFile(path.join(root, 'src/core/Scene.js'), 'utf8');
const dogRigSource = await readFile(path.join(root, 'src/character/DogRig.js'), 'utf8');
const robotDogSource = await readFile(path.join(root, 'src/character/RobotDog.js'), 'utf8');
const inventorySource = await readFile(path.join(root, 'src/character/inventory.js'), 'utf8');
const objectRulesSource = await readFile(path.join(root, 'src/world/object-rules.json'), 'utf8');
const animatorSource = await readFile(path.join(root, 'src/character/DogAnimator.js'), 'utf8');
const shelterSource = await readFile(path.join(root, 'src/world/Shelter.js'), 'utf8');
const physicsSource = await readFile(path.join(root, 'src/physics/PhysicsWorld.js'), 'utf8');
const movementSource = await readFile(path.join(root, 'src/systems/Movement.js'), 'utf8');
const propsSource = await readFile(path.join(root, 'src/world/Props.js'), 'utf8');
const architectureSource = await readFile(path.join(root, 'src/world/Architecture.js'), 'utf8');
const cameraSource = await readFile(path.join(root, 'src/controls/ThirdPersonCamera.js'), 'utf8');
const hudSource = await readFile(path.join(root, 'src/ui/HUD.js'), 'utf8');
const bagIconSource = await readFile(path.join(root, 'src/ui/icon/package.svg'), 'utf8');
const inputSource = await readFile(path.join(root, 'src/controls/Input.js'), 'utf8');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const styleSource = await readFile(path.join(root, 'src/styles/main.css'), 'utf8');
const touchStyleSource = await readFile(path.join(root, 'src/styles/touch-ff.css'), 'utf8');
const decorationSource = await readFile(path.join(root, 'src/world/Decorations.js'), 'utf8');
const performanceSource = await readFile(path.join(root, 'src/systems/Performance.js'), 'utf8');
const paletteSource = await readFile(path.join(root, 'src/world/palette.js'), 'utf8');
const localizationSource = await readFile(path.join(root, 'src/core/Localization.js'), 'utf8');
const localeEnSource = await readFile(path.join(root, 'src/localization/en.json'), 'utf8');
const localeIdSource = await readFile(path.join(root, 'src/localization/id.json'), 'utf8');
const gameRulesSource = await readFile(path.join(root, 'src/world/gamerules.json'), 'utf8');
const worldRulesSource = await readFile(path.join(root, 'src/world/worldrules.json'), 'utf8');

let localeEn = null;
let localeId = null;
let gameRules = null;
try {
  localeEn = JSON.parse(localeEnSource);
  localeId = JSON.parse(localeIdSource);
  gameRules = JSON.parse(gameRulesSource);
} catch (error) {
  errors.push(`Localization catalogues and gamerules.json must be valid JSON: ${error.message}`);
}

if (localeEn && localeId) {
  const englishKeys = Object.keys(localeEn).sort();
  const indonesianKeys = Object.keys(localeId).sort();
  if (JSON.stringify(englishKeys) !== JSON.stringify(indonesianKeys)) {
    errors.push('English and Indonesian localization catalogs must contain the same keys.');
  }

  const localizedSources = [
    ['index.html', html],
    ['src/main.js', mainSource],
    ['src/ui/HUD.js', hudSource],
    ['src/ui/LoadingScreen.js', await readFile(path.join(root, 'src/ui/LoadingScreen.js'), 'utf8')],
    ['src/controls/Input.js', inputSource],
    ['src/character/inventory.js', inventorySource],
    ['src/world/Shelter.js', shelterSource]
  ];
  for (const [relativePath, source] of localizedSources) {
    const referencedKeys = new Set();
    for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) referencedKeys.add(match[1]);
    for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) referencedKeys.add(match[1]);
    for (const key of referencedKeys) {
      if (!Object.hasOwn(localeEn, key) || !Object.hasOwn(localeId, key)) {
        errors.push(`Missing translation key ${key} referenced in ${relativePath}.`);
      }
    }
  }

  if (!localizationSource.includes('export function setLocale(locale)') ||
      !localizationSource.includes('export function applyTranslations(root = document)') ||
      !localizationSource.includes("import en from '../localization/en.json'") ||
      !localizationSource.includes("import id from '../localization/id.json'") ||
      !mainSource.includes("import { applyTranslations, t } from './core/Localization.js'") ||
      !hudSource.includes("import { t } from '../core/Localization.js'") ||
      !inventorySource.includes("import { t } from '../core/Localization.js'") ||
      !inputSource.includes("import { t } from '../core/Localization.js'") ||
      !shelterSource.includes("import { t } from '../core/Localization.js'") ||
      !mainSource.includes('applyTranslations();')) {
    errors.push('Localization must use external JSON catalogs and initialize translations before the game UI is built.');
  }
}

if (gameRules) {
  const expectedScope = ['localization.foundation', 'performance.stability', 'world.physics'];
  const actualScope = [...(gameRules.scope || [])].sort();
  if (JSON.stringify(actualScope) !== JSON.stringify(expectedScope)) {
    errors.push('gamerules.json must stay limited to world physics, performance/stability, and localization foundation.');
  }
  const keyReferences = [];
  for (const section of [gameRules.world?.physics, gameRules.performance?.stability]) {
    if (!section) { errors.push('gamerules.json is missing a required physics or performance section.'); continue; }
    keyReferences.push(section.titleKey, section.summaryKey, ...(section.rules || []).map((rule) => rule.textKey));
  }
  for (const key of keyReferences) {
    if (typeof key !== 'string' || !localeEn || !localeId || !Object.hasOwn(localeEn, key) || !Object.hasOwn(localeId, key)) {
      errors.push(`Game rule references a missing localized string: ${String(key)}.`);
    }
  }
  if ((gameRules.world?.physics?.rules?.length || 0) !== 5 ||
      (gameRules.performance?.stability?.rules?.length || 0) !== 6 ||
      gameRules.technicalTargets?.authoritativePhysicsHz !== 60 ||
      gameRules.technicalTargets?.desiredRenderFps !== 60) {
    errors.push('gamerules.json must retain the agreed five physics rules, six performance/stability rules, and 60 Hz/60 FPS reference targets.');
  }
}


function hasBalancedCss(source) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (inComment) {
      if (char === '*' && next === '/') { inComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') { inComment = true; i++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth++;
    else if (char === '}' && --depth < 0) return false;
  }
  return depth === 0 && quote === null && !inComment;
}
if (!hasBalancedCss(styleSource) || !hasBalancedCss(touchStyleSource)) {
  errors.push('CSS blocks, strings, or comments are unbalanced; check for an incomplete declaration or missing closing brace.');
}
if (!rendererSource.includes("import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'") || !rendererSource.includes('this.composer.addPass(this.outputPass)')) {
  errors.push('Post-processing must finish with OutputPass for tone mapping and output color-space conversion.');
}
if (!shelterSource.includes("import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'") || !shelterSource.includes('this.optimizeStaticMeshes()') || !shelterSource.includes('this.optimizeMovablePropMeshes();') || !shelterSource.includes('optimizeMovablePropMeshes() {') || !shelterSource.includes('MovablePropBatch-')) {
  errors.push('Shelter static-mesh batching is missing.');
}
if (!shelterSource.includes('beginMovableProp(') || !propsSource.includes("world.beginMovableProp('doghouse'") || !propsSource.includes("world.beginMovableProp('dog-bed'") || !propsSource.includes("world.beginMovableProp('water-bowl'") || !propsSource.includes('world.beginMovableProp(`toy-${kind}`') || !propsSource.includes('world.endMovableProp();') || !physicsSource.includes('this.dynamicPropsById = new Map()') || !physicsSource.includes('record.group.quaternion.set(') || !physicsSource.includes('applyImpulseAtPoint(') || !physicsSource.includes('this.controller.setApplyImpulsesToDynamicBodies(true)') || !physicsSource.includes('.setDensity(prop ? 0.1 : 1)') || !movementSource.includes('this.physics.interactWithDog(this.dog, actualVelocity, dt, true)')) {
  errors.push('Movable props need mass profiles, attached dynamic colliders, paw-impact impulses, and live visual-body syncing.');
}
if (!physicsSource.includes('paw.pawVerticalVelocity = previous && dt > 1e-4 ? (y - previous.y) / dt : 0;') || !physicsSource.includes('const stompSpeed = Math.max(0, -(paw.pawVerticalVelocity || 0))') || !physicsSource.includes('const verticalImpulse = stompSpeed > 0.6') || !physicsSource.includes('Math.min(0.035, impulseMagnitude * 0.008 + mass * stompSpeed * record.prop.kickFactor * 0.015)')) {
  errors.push('Paw impacts must distinguish downward stomps from horizontal kicks and apply a bounded, mass-scaled response.');
}
if (!propsSource.includes('mass: 18') || !propsSource.includes('mass: 7.5') || !propsSource.includes('mass: 0.85') || !propsSource.includes('mass: 0.24') || !propsSource.includes('restitution: 0.22') || !propsSource.includes('linearDamping: 0.9') || !propsSource.includes('angularDamping: 2.4')) {
  errors.push('Interactive prop weight classes need distinct mass, bounce, and damping profiles.');
}
if (!shelterSource.includes('spawnLift: Math.max(0, firstFinite(physics.spawnLift, options.spawnLift, 0))') || !physicsSource.includes('.setCcdEnabled(prop.ccdEnabled)') || !propsSource.includes('spawnLift: 0.0775') || !propsSource.includes('spawnLift: 0.0675') || !propsSource.includes('ccdEnabled: true') || !propsSource.includes('solid: { sx: 0.41, sy: 0.14, sz: 0.41 }')) {
  errors.push('Movable props must start aligned with the floor and fast lightweight toys must use continuous collision detection.');
}

if (!shelterSource.includes('const batchSize = 10;') || !shelterSource.includes('const sectorX = Math.floor(worldPosition.x / batchSize);') || !shelterSource.includes('const sectorZ = Math.floor(worldPosition.z / batchSize);') || !shelterSource.includes('mesh.frustumCulled = true;')) {
  errors.push('Static shelter geometry must be batched by spatial sector for useful frustum culling.');
}
if (!dogRigSource.includes('this.geometryCache = new Map()') || !dogRigSource.includes("this.geometry('sphere:1:18:12'") || !dogRigSource.includes('const upperGeometry = this.geometry(') || !dogRigSource.includes('const lowerGeometry = this.geometry(') || !rendererSource.includes('this.renderer.shadowMap.autoUpdate = !mobileDevice') || !rendererSource.includes('this.setDynamicDogShadows(false)') || !rendererSource.includes('this.setDynamicPropShadows(!mobileDevice && shadowEnabled)')) {
  errors.push('Repeated robot geometry caching or mobile static-shadow reuse is missing.');
}
if (!dogRigSource.includes('this.headPivot.position.set(0, 0.32, -0.63)') || !dogRigSource.includes('upperLeg.position.set(p.x, 0.64, p.z)') || !dogRigSource.includes('lowerLeg.position.set(0, -upperLength, 0)') || !dogRigSource.includes('const upperGeometry = this.geometry(') || !dogRigSource.includes('geometry.translate(0, -upperLength / 2, 0)') || !dogRigSource.includes('const lowerGeometry = this.geometry(') || !dogRigSource.includes('geometry.translate(0, -lowerLength / 2, 0)') || !dogRigSource.includes("anklePivot.name = 'AnkleJoint-' + p.label") || !dogRigSource.includes('anklePivot.position.set(0, -lowerLength, 0)') || !dogRigSource.includes('foot.name = \'Paw-\' + p.label') || !dogRigSource.includes('this.tailPivot.position.set(0, 0.08, 0.69)')) {
  errors.push('Robot dog transforms or articulated two-segment leg rigging appear to have regressed.');
}
if (!qualitySource.includes("low: Object.freeze({ label: 'LOW · PERFORMANCE', pixelRatio: 1.0, shadows: false") || !qualitySource.includes('shadows: false, matcap: false, bloom: false') || !qualitySource.includes("medium: Object.freeze({ label: 'MEDIUM · BALANCED', pixelRatio: 1.0, shadows: true") || !qualitySource.includes('pixelRatio: 1.25')) {
  errors.push('GPU-friendly Low/Medium/High render scale profiles or Low PBR flag are missing.');
}
if (!rendererSource.includes('const antialias = true;') || !cameraSource.includes('cacheCameraOccluders()') || !cameraSource.includes('this.raycaster.intersectObjects(this.cameraOccluders, false, hits)') || !cameraSource.includes('const hits = this.cameraOcclusionHits;') || !rendererSource.includes('this.camera.far = mobileDevice ? Math.min(preset.drawDistance ?? 72, 72) : (preset.drawDistance ?? 72);') || !qualitySource.includes('drawDistance: 64') || !qualitySource.includes('drawDistance: 70') || !qualitySource.includes('drawDistance: 84') || !sceneSource.includes('new THREE.FogExp2(lighting.fogColor, lighting.fogDensity)') || !sceneSource.includes('new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.18, 72)')) {
  errors.push('Hardware MSAA, quality-specific draw distance, or depth-safe camera settings are missing.');
}
const sceneBootstrap = sceneSource.slice(sceneSource.indexOf('export function createScene()'), sceneSource.indexOf('export function setQualityLighting'));
if (rendererSource.includes('loadPopClayMatcap') || rendererSource.includes('MeshMatcapMaterial') || !rendererSource.includes('new THREE.PMREMGenerator(this.renderer)') || !rendererSource.includes('new RoomEnvironment()') || !rendererSource.includes('new THREE.MeshPhysicalMaterial(') || !rendererSource.includes('clearcoat: 0.24') || !rendererSource.includes('envMapIntensity: 0.72') || !rendererSource.includes('this.applyLowPbrMaterials()') || !rendererSource.includes('this.ensureEnvironment(0.52)') || !rendererSource.includes('this.renderer.toneMapping = THREE.ACESFilmicToneMapping')) {
  errors.push('Low must use native PBR materials and bright PMREM environment reflections without MatCap.');
}
if (!popClaySource.includes('const CANDY_CORE = Object.freeze({') || !popClaySource.includes("turquoise: Object.freeze(") || !popClaySource.includes("coral: Object.freeze(") || !popClaySource.includes("gold: Object.freeze(") || !popClaySource.includes("lilac: Object.freeze(") || !popClaySource.includes("sapphire: Object.freeze(") || !popClaySource.includes("mint: Object.freeze(") || !popClaySource.includes('function platformTileRole(index)') || !popClaySource.includes("role = platformTileRole(i);") || !popClaySource.includes("if (slot % 13 === 0) return 'lilac'") || !popClaySource.includes("if (slot % 7 === 0) return 'coral'") || !popClaySource.includes("object.setColorAt(i, profileColor(role));") || !architectureSource.includes("tiles.name = 'MainCandyPlatformTiles'") || !architectureSource.includes("tiles.userData.popClaySurface = 'platform'")) {
  errors.push('Pop Clay must use the full elegant birthday palette and deterministic confetti accents on the main platform.');
}
if (!architectureSource.includes("import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'") || !architectureSource.includes("new RoundedBoxGeometry(1.88, 0.075, 1.88, 3, 0.022)") || !architectureSource.includes("baseFloor.userData.popClaySurface = 'base-floor'") || !architectureSource.includes("tiles.userData.popClaySurface = 'platform'") || !shelterSource.includes('object.userData?.popClaySurface')) {
  errors.push('Low PBR needs rounded floor tiles and surface tags so the glossy override only affects the floor.');
}
if (/new THREE\.(?:AmbientLight|HemisphereLight|DirectionalLight)/.test(sceneBootstrap) || !sceneSource.includes('export function setQualityLighting(scene, enabled, options = {})') || !sceneSource.includes('rig.sun.shadow.map.dispose()') || !rendererSource.includes('setQualityLighting(this.scene, true, { shadows: false, intensityScale: 0.68 })') || !rendererSource.includes('this.renderer.shadowMap.enabled = false') || !rendererSource.includes('this.setMeshShadows(false)') || !rendererSource.includes('this.applyLowPbrMaterials()') || !rendererSource.includes('this.restoreLowPbrMaterials()') || !rendererSource.includes('this.renderer.toneMapping = THREE.ACESFilmicToneMapping')) {
  errors.push('Low must use a reversible PBR material override with active shadow-free lighting and HDR-style tone mapping.');
}
if (!propsSource.includes("mesh.userData.popClayType = 'pop'") || !shelterSource.includes('const popClayType = object.userData?.popClayType || \'environment\'') || !shelterSource.includes('mesh.userData.popClayType = bucket.popClayType')) {
  errors.push('Candy-colored toys must retain their semantic tag through static-mesh batching.');
}
for (const addonPath of [
  'node_modules/three/examples/jsm/postprocessing/OutputPass.js',
  'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'
]) {
  try { await access(path.join(root, addonPath)); }
  catch { errors.push(`Required Three.js addon is missing: ${addonPath}`); }
}
if (!physicsSource.includes('const SLOPE_NORMAL_ALIGNMENT = Math.cos(8 * Math.PI / 180)') || !physicsSource.includes('const SLOPE_PLANE_TOLERANCE = 0.035') || !physicsSource.includes('const stableSlopeSupport = coherentSlopePlane') || !physicsSource.includes('const uphillGrade = -(normal.x * directionX + normal.z * directionZ) / normal.y') || !physicsSource.includes('requested.y = Math.max(requested.y, Math.min(riseFromSlope, riseLimit))') || !movementSource.includes('this.physics.move(requestedTranslation, this.dog.group.rotation.y, this.grounded);')) {
  errors.push('Incline physics must maintain coherent ramp support and apply bounded uphill motion only while grounded.');
}
if (!physicsSource.includes('ColliderDesc.roundCuboid(0.23, 0.38, 0.47, 0.15)') || !physicsSource.includes('desc.setRotation(') || !physicsSource.includes('setNextKinematicRotation(rotation)')) {
  errors.push('Character collider width or rotated-world collider support is missing.');
}
if (!movementSource.includes('this.grounded ? -0.025 : this.verticalVelocity * dt') || !movementSource.includes('this.verticalVelocity = 0;')) {
  errors.push('Grounded movement needs a stable contact probe and zero downward drift.');
}
if (!shelterSource.includes('rotation: opts.rotation || { x: 0, y: 0, z: 0 }')) {
  errors.push('World solid colliders must preserve mesh rotation.');
}
if (!architectureSource.includes("centralCarpet.name = 'CentralCarpetSurface'") || !architectureSource.includes("const centralCarpet = world.box(0, 0.0855, 1, 12.0, 0.004, 16.0, '#ffc4e0'") || !architectureSource.includes('collidable: false') || !propsSource.includes('solid: { sx: 0.975, sy: 0.12, sz: 0.76 }') || !propsSource.includes('solid: { sx: 0.41, sy: 0.14, sz: 0.41 }')) {
  errors.push('Important walkable prop surfaces or small prop collision shapes are missing.');
}
if (!architectureSource.includes("centralCarpet.name = 'CentralCarpetSurface'") || !architectureSource.includes("const centralCarpet = world.box(0, 0.0855, 1, 12.0, 0.004, 16.0, '#ffc4e0'") || !architectureSource.includes('collidable: false') || propsSource.includes('ribHeight')) {
  errors.push('The active central carpet must remain full-size and visual-only; removed ramp teeth must not reappear as colliders.');
}
if (!propsSource.includes('const radius = 0.77;') || !propsSource.includes('rotation: { x: 0, y: 0, z: angle + Math.PI / 2 }')) {
  errors.push('Hollow agility tunnel needs segmented shell collisions instead of a solid blocking collider.');
}
if (!propsSource.includes('rotation: { x: 0, y: 0, z: -0.27 }') || !propsSource.includes('rotation: { x: 0, y: 0, z: 0.27 }')) {
  errors.push('Angled doghouse roof meshes must pass their rotations into collision metadata.');
}
if (!cameraSource.includes('targetDistance = 6.0') || !cameraSource.includes('zoomStep(direction)') || !cameraSource.includes('resetView(targetPosition = null') || !cameraSource.includes('minDistance = 2.7') || !cameraSource.includes('maxDistance = 15')) {
  errors.push('Character-focused camera with zoom range and reset controls is missing.');
}
if (!cameraSource.includes('this.occlusionTimer = 0.10;') || !cameraSource.includes('if (this.occlusionTimer <= 0) {') || cameraSource.includes('|| cameraTurned')) {
  errors.push('Camera occlusion raycasts must be throttled during fast camera movement.');
}
if (!inputSource.includes('getPinchDistance()') || !inputSource.includes('this.camera.zoom(this.pinchDistance - nextDistance)')) {
  errors.push('Touch input must support two-finger pinch zoom.');
}
if (!inputSource.includes('setPointerCapture') || !inputSource.includes('this.sprintPointerId') || !inputSource.includes('this.touchSprint = true;') || !inputSource.includes('this.touchSprint = false;') || inputSource.includes('this.touchSprint = !this.touchSprint') || !inputSource.includes('consumeSit()') || !inputSource.includes("event.code === 'KeyC'") || !html.includes('Hold to sprint, release to walk')) {
  errors.push('RUN must sprint only while held, keyboard SIT toggle and SIT/STAND input wiring must be present.');
}
if (!animatorSource.includes("targetState = 'sit'") || !animatorSource.includes('this.sitBlend') || !animatorSource.includes('Math.acos(clamp(value, -1, 1))') || !animatorSource.includes('leg.upperLeg.rotation.x') || !animatorSource.includes('leg.lowerLeg.rotation.x') || !animatorSource.includes('leg.anklePivot.rotation.x') || !animatorSource.includes('desiredFootPitch - leg.upperLeg.rotation.x - leg.lowerLeg.rotation.x') || !animatorSource.includes('THREE.MathUtils.lerp')) {
  errors.push('Dog sit pose, analytic two-bone IK, or smoothed articulated leg rotations are missing.');
}
const walkSpeedValue = Number(movementSource.match(/this\.walkSpeed = ([0-9.]+);/)?.[1]);
const runSpeedValue = Number(movementSource.match(/this\.runSpeed = ([0-9.]+);/)?.[1]);
if (
  !movementSource.includes('this.acceleration = 18;') ||
  !movementSource.includes('this.braking = 23;') ||
  !movementSource.includes('this.movingIntent = false;') ||
  !movementSource.includes('this.movementStartThreshold = 0.028;') ||
  !movementSource.includes('this.movementStopThreshold = 0.018;') ||
  !movementSource.includes('const inputMagnitude = Math.min(1, Math.hypot(input.x, input.y));') ||
  !movementSource.includes('if (inputMagnitude <= this.movementStopThreshold) this.movingIntent = false;') ||
  !movementSource.includes('else if (inputMagnitude >= this.movementStartThreshold)') ||
  movementSource.includes('Math.abs(input.x) + Math.abs(input.y) > 0.08') ||
  !movementSource.includes('const rate = moving') ||
  !movementSource.includes('? this.acceleration') ||
  !movementSource.includes(': (this.grounded ? this.braking * groundTraction : 0.35);') ||
  !movementSource.includes('this.horizontalVelocity.x = THREE.MathUtils.damp(') ||
  !movementSource.includes('this.horizontalVelocity.z = THREE.MathUtils.damp(') ||
  !movementSource.includes('const desiredYaw = Math.atan2(-this.horizontalVelocity.x, -this.horizontalVelocity.z);') ||
  !movementSource.includes('this.lastJumpTakeoffSpeed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);') ||
  !movementSource.includes('this.lastJumpEstimatedFlightTime = (2 * this.jumpSpeed) / this.gravity;') ||
  !movementSource.includes('this.lastJumpEstimatedRange = this.lastJumpTakeoffSpeed * this.lastJumpEstimatedFlightTime;') ||
  movementSource.includes('clippedByObstacle') ||
  movementSource.includes('lateralAcceleration') ||
  movementSource.includes('desiredHorizontalSpeed') ||
  movementSource.includes('const actualSpeed = Math.hypot(actualVelocity.x, actualVelocity.z);    const actualSpeed =') ||
  !(walkSpeedValue > 0 && runSpeedValue >= walkSpeedValue * 1.5 && runSpeedValue <= walkSpeedValue * 2.5)
) {
  errors.push('Movement must preserve the proven exponentially damped X/Z response, smooth steering, collision-safe translation, and the run-up jump-range estimate.');
}
if (!physicsSource.includes('setTranslation(0, -0.0725, 0)') || !physicsSource.includes('const playerSpawn = WORLD_RULES.playerSpawn') || !physicsSource.includes('.setTranslation(playerSpawn.x, playerSpawn.y + 0.78, playerSpawn.z)') || !physicsSource.includes('setMaxSlopeClimbAngle(MAX_WALKABLE_SLOPE_ANGLE)') || !physicsSource.includes('setMinSlopeSlideAngle(42 * Math.PI / 180)') || !physicsSource.includes('disableAutostep()') || !physicsSource.includes('enableSnapToGround(0.06)') || !physicsSource.includes('probeGround(rootY') || !physicsSource.includes('if (index === 0 && controllerGrounded && Math.abs(gap) <= 0.045)') || !physicsSource.includes('MAX_FOOT_STEP_HEIGHT = 0.30') || !physicsSource.includes('.setFriction(prop?.friction ?? s.friction ?? 0.12)') || !physicsSource.includes('Number.isFinite(desiredTranslation?.x)') || !physicsSource.includes('requestedHorizontalLength > 0.16') || !physicsSource.includes('requested.y = Math.max(-0.16, Math.min(0.16, requested.y));')) {
  errors.push('Conservative prop-step collision, ground snap, or movement spike guard is missing.');
}
if (!physicsSource.includes('probeDogFeet(dog, velocity') || !physicsSource.includes('this.world.castRay(') || !physicsSource.includes('const hipY = hipMatrix[13]') || !physicsSource.includes('justLanded') || !dogRigSource.includes('const pawTarget = new THREE.Object3D()') || !movementSource.includes('this.physics.probeDogFeet(this.dog, actualVelocity, true)') || !movementSource.includes('(pos.x - previousPosition.x) / dt') || !movementSource.includes('this.dog.speed = actualSpeed') || !movementSource.includes('this.physics.probeGround(pos.y - 0.78') || !movementSource.includes('this.physics.setPosition(pos)') || !movementSource.includes('this.dog.updateAnimation(dt, moving)') || !animatorSource.includes('this.smoothedSpeed = 0;') || !animatorSource.includes('this.smoothedSpeed += (targetSpeed - this.smoothedSpeed) * speedResponse;') || !animatorSource.includes('Boolean(movementIntent) && speed > 0.1') || !animatorSource.includes('const internalKnee = safeAcos') || !animatorSource.includes('terrainRoll') || !animatorSource.includes('terrainPitch') || !robotDogSource.includes('new THREE.InstancedMesh') || !robotDogSource.includes('updateFootDust(dt)') || !movementSource.includes('const landingEvents = this.dog.footLandingEvents') && movementSource.includes('if (contact.justLanded) landingEvents.push(contact)')) {
  errors.push('Per-paw Rapier raycasts, analytic IK contact, balance response, or landing-dust instancing is missing.');
}
if (!physicsSource.includes('const maxSurfaceY = Math.min(rootY + MAX_FOOT_STEP_HEIGHT, hipY + 0.10)') || !physicsSource.includes('const footprintOffsets = FOOTPRINT_OFFSETS') || !physicsSource.includes('for (let index = 0; index < 2; index++)') || !physicsSource.includes('GROUND_PROBE_OFFSETS') || !physicsSource.includes('const firstPairAgrees =') || !physicsSource.includes('if (firstPairAgrees)') || !physicsSource.includes('stableCluster = { y: currentY, hits: footprintSamples }') || !physicsSource.includes('const leadingPaw = speed > 0.45') || !physicsSource.includes('const needsHorizontalSweep = leadingPaw &&') || !physicsSource.includes('const localTravelX = cosYaw * dirX - sinYaw * dirZ') || !physicsSource.includes('const localTravelZ = sinYaw * dirX + cosYaw * dirZ') || !physicsSource.includes('const broadRadius = record.prop.interactionRadius + 1.35') || !physicsSource.includes('const broadRadius = record.interactionRadius + 1.35') || !physicsSource.includes('const dogPosition = dog.group.position') || !physicsSource.includes('const center = record.group.position;') || !physicsSource.includes('const center = record.root.position;') || !physicsSource.includes('cluster.hits.length >= 2') || !physicsSource.includes('supportPoints: stableCluster?.hits.length') || !physicsSource.includes('startedInside: true') || !physicsSource.includes('safeTargetX = e[0] * tuckX') || !physicsSource.includes('const hasSurface = Number.isFinite(currentY) || blocked || obstacleAhead') || !physicsSource.includes('if (!matricesCurrent) dog.group.updateMatrixWorld(true)') || !physicsSource.includes('const paws = this.pawScratch ||') || !physicsSource.includes('const latchedAtRest') || physicsSource.includes('leg.foot.updateWorldMatrix(true, false)')) {
  errors.push('Paw probes must reject rays originating inside props, detect reachable surfaces, and tuck blocked paws inward.');
}
if (!animatorSource.includes('contact?.hasSurface') || !animatorSource.includes('contactBlocked ? 1') || !animatorSource.includes('const horizontal = contactBlocked ? Math.hypot(dx, dz) : dz') || !animatorSource.includes('if (contactBlocked) ikYaw = Math.atan2(-dx, -dz)') || !animatorSource.includes('contact.currentY - 0.001') || !physicsSource.includes('supportY - 0.001')) {
  errors.push('Leg IK must use verified contacts and retract blocked paws with lateral articulation.');
}
if (!propsSource.includes('world.box(x, 0.55, z - 0.38, 1.42, 0.12, 0.44, pillow') || !propsSource.includes('solid: { sx: 0.71, sy: 0.06, sz: 0.22 }') || propsSource.includes('ribHeight')) {
  errors.push('The pillow top must retain its matching collider, without restoring removed ramp-tooth collision geometry.');
}
if (!shelterSource.includes('const posts = new THREE.InstancedMesh(postGeometry, postMaterial, postPositions.length)') || !shelterSource.includes('posts.setMatrixAt(i, dummy.matrix)') || !shelterSource.includes('this.solids.push({ x, y: 0.5, z, sx: 0.05, sy: 0.5, sz: 0.075')) {
  errors.push('Fence pickets should be instanced for Low-profile performance while retaining per-post Rapier colliders.');
}
if (!animatorSource.includes('const walkOffset = leg.index === 0 || leg.index === 3 ? 0 : Math.PI') || !animatorSource.includes('const runOffset = leg.front ? leadPhase : Math.PI + leadPhase * 1.35') || !animatorSource.includes('const kneeFlex = Math.max(0, Math.cos(phase)) * kneeAmplitude') || !animatorSource.includes('this.rig.root.position.y = THREE.MathUtils.lerp(this.rig.root.position.y, rootBounce, bodyAlpha)')) {
  errors.push('Procedural gait must blend diagonal walking into asymmetric front/rear gallop with knee flex and suspension bounce.');
}
if (!animatorSource.includes('const speedRunBlend = sprinting') || !animatorSource.includes('const swingAmount = mix(0.4, mix(0.8, 0.98, maxRunBlend), runBlend)') || !animatorSource.includes('const desiredCycleSpeed = mix(9.5, 16.5, runBlend) * THREE.MathUtils.clamp(speed / 3.15, 0.5, 1.45) + maxRunBlend * 1.2') || !animatorSource.includes('const cycleSpeed = this.cycleSpeed')) {
  errors.push('Gait amplitude and cycle frequency must blend with actual sprint speed, not only a binary run state.');
}
if (!animatorSource.includes('const footStanceProgress = THREE.MathUtils.clamp((cycle - swingRatio) / (1 - swingRatio), 0, 1)') || !animatorSource.includes('mix(strideLength, -strideLength, ease(swingProgress))') || !animatorSource.includes('mix(-strideLength, strideLength, ease(footStanceProgress))') || !animatorSource.includes('const suspensionWave = smoothstep(Math.max(0, Math.sin(this.phase - 0.55)))') || !animatorSource.includes('const bodyTargetYaw = Math.sin(this.phase)') || !animatorSource.includes('body.rotation.y = THREE.MathUtils.lerp(body.rotation.y, bodyTargetYaw, bodyAlpha)')) {
  errors.push('Natural gait needs eased swing/stance trajectories, speed-scaled cadence, weight transfer, and torso yaw sway.');
}
if (!animatorSource.includes('const targetMaxRunBlend = sprinting ? smoothstep(THREE.MathUtils.clamp((speed - 3.6) / 2.0, 0, 1)) : 0;') || !animatorSource.includes('const maxRunBlend = this.maxRunBlend;') || !animatorSource.includes('const flightPulse = Math.pow(Math.max(0, Math.cos(this.phase - 0.25)), 2) * maxRunBlend * 0.018') || !animatorSource.includes('const swingRatio = mix(0.36, mix(0.43, 0.59, maxRunBlend), runBlend)') || !animatorSource.includes('mix(0.28, 0.40, maxRunBlend)') || !animatorSource.includes('ear.group.rotation.x = THREE.MathUtils.lerp(ear.group.rotation.x, -0.46 * runBlend, streamAlpha)')) {
  errors.push('Top-speed gallop needs a speed envelope, flight beat, longer stride, and ears streaming back.');
}
if (!animatorSource.includes('THREE.MathUtils.clamp(dt, 0, 1 / 30)') || !animatorSource.includes('const idleHeadNod =') || !animatorSource.includes('const idleHeadYaw =') || !animatorSource.includes('this.rig.headPivot.rotation.y = THREE.MathUtils.lerp') || !animatorSource.includes('const tailFrequency =') || !animatorSource.includes('const tailAlpha = 1 - Math.exp(-Math.min(dt, 0.05) * 9.0)') || !animatorSource.includes('this.rig.parts.tail[1].rotation.x = THREE.MathUtils.lerp') || !animatorSource.includes('let leftSurfaceSum = 0, rightSurfaceSum = 0, frontSurfaceSum = 0, rearSurfaceSum = 0') || !animatorSource.includes('const EMPTY_CONTACTS = []') || !animatorSource.includes('this.targetWorldScratch = new THREE.Vector3()') || !animatorSource.includes('this.targetLocalScratch.copy(targetWorld)') || animatorSource.includes('this.rig.parts.legs.filter(test).map(surfaceYFor)') || animatorSource.includes('const targetWorld = new THREE.Vector3(')) {
  errors.push('Head idle micro-motion and frame-rate-independent two-joint tail smoothing are required.');
}
if (!animatorSource.includes('this.cycleSpeed = 9.5') || !animatorSource.includes('this.runBlend += (targetRunBlend - this.runBlend) * (1 - Math.exp(-dt * 6.5))') || !animatorSource.includes('this.cycleSpeed += (desiredCycleSpeed - this.cycleSpeed) * (1 - Math.exp(-dt * 4.5))') || !animatorSource.includes('const bodyAlpha = 1 - Math.exp(-dt * 13.5)') || !animatorSource.includes('Math.sin(Math.PI * ease(swingProgress))') || !animatorSource.includes('const stanceProgress = THREE.MathUtils.clamp((cycle - swingRatio) / 0.10, 0, 1)') || !animatorSource.includes('const toeLift = swinging ? Math.sin(Math.PI * ease(swingProgress))')) {
  errors.push('Running animation must smooth cadence, blend speed transitions, body suspension, and paw lift endpoints to avoid vibration.');
}
if (!rendererSource.includes('Post-processing is disabled on low/medium') || rendererSource.includes("from 'three/addons/postprocessing/SSAOPass.js'") || rendererSource.includes("from 'three/addons/postprocessing/SMAAPass.js'")) {
  errors.push('Renderer should avoid expensive SSAO/SMAA passes in the performance-oriented pipeline.');
}
if (!rendererSource.includes('this.renderer.setRenderTarget(null)') || !rendererSource.includes('this.renderer.autoClear = true')) {
  errors.push('Switching to Low must return to the default framebuffer and clear the scene normally.');
}
if (!rendererSource.includes('const antialias = true') || !rendererSource.includes('this.renderer.setPixelRatio(dpr)') || !rendererSource.includes('pixelRatioCap) * this.adaptiveScale')) {
  errors.push('Renderer must keep MSAA enabled and adapt render resolution relative to each quality preset.');
}
if (!rendererSource.includes("const pixelRatioCap = mobileDevice ? Math.min(preset.pixelRatio, 1.0) : preset.pixelRatio") || !rendererSource.includes("mobileDevice ? Math.min(preset.drawDistance ?? 72, 72)") || !rendererSource.includes("matchMedia('(max-width: 900px), (pointer: coarse)')") || !rendererSource.includes("const weakDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches") || !rendererSource.includes("preset.bloom && !weakDevice")) {
  errors.push('High quality needs a mobile-aware pixel-ratio cap, conservative view distance, and bloom suppression on touch devices to protect frame time.');
}
if (!mainSource.includes('const frameDelta = Math.max(0, (timestamp - this.lastTime) / 1000)') || !mainSource.includes('const rawDelta = Math.min(0.1, frameDelta)') || !mainSource.includes('this.performance.update(frameDelta)') || mainSource.includes('this.performance.update(Math.max(rawDelta, FIXED_DT))') || !mainSource.includes('this.accumulator / FIXED_DT') || !mainSource.includes('this.previousRenderPosition') || !mainSource.includes('this.currentRenderPosition') || !mainSource.includes('this.previousRenderYaw') || !mainSource.includes('this.currentRenderYaw') || !mainSource.includes('Math.atan2(') || !mainSource.includes('this.cameraRig.update(rawDelta || FIXED_DT, dogPosition)')) {
  errors.push('Frame telemetry must use real display delta, and high-refresh rendering must interpolate stable fixed-step dog position/yaw poses.');
}
if (
  !mainSource.includes('this.hud?.settings && !this.hud.settings.hidden') ||
  !mainSource.includes('if (this.hud?.settings && !this.hud.settings.hidden) return;') ||
  !mainSource.includes('this.accumulator = 0;') ||
  !mainSource.includes('this.frameId = 0;') ||
  !mainSource.includes('this.resetRenderPositionSnapshots();') ||
  !mainSource.includes('this.running && !document.hidden && !this.frameId') ||
  !mainSource.includes('this.renderer?.resize();\n      this.lastTime = performance.now();') ||
  !mainSource.includes('if (this.hud?.settings && !this.hud.settings.hidden) this.renderer.render();') ||
  !rendererSource.includes("if (document.getElementById('game')?.classList.contains('settings-open')) return;") ||
  !hudSource.includes('onSettingsVisibilityChange = null') ||
  !hudSource.includes('this.onSettingsVisibilityChange?.(settingsOpen)') ||
  !hudSource.includes('this.onSettingsVisibilityChange?.(false)') ||
  !hudSource.includes("this.gameRoot?.classList.toggle('settings-open', settingsOpen)") ||
  !hudSource.includes("this.gameRoot?.classList.remove('settings-open')") ||
  !touchStyleSource.includes('#game.settings-open .fps-pill') ||
  !touchStyleSource.includes('contain:layout style') ||
  !touchStyleSource.includes('overscroll-behavior-y:contain')
) {
  errors.push('Opening settings must stop WebGL/physics/RAF work, defer viewport resize churn, then resize and resume cleanly while preserving one-shot quality previews.');
}
for (const iconName of ['chevron-down', 'arrow-up-right', 'sparkles', 'code-2']) {
  if (!hudSource.includes(`./icon/${iconName}.svg`) || !html.includes(`data-icon="${iconName}"`)) {
    errors.push(`UI SVG icon is not wired through HUD and HTML: ${iconName}`);
  }
}
if (decorationSource.includes('new THREE.PointLight')) errors.push('Decorative pendant lights must not spawn expensive dynamic point lights.');
if (!architectureSource.includes('new THREE.MeshStandardMaterial({ color: PALETTE.floorB, roughness: 0.94') || !propsSource.includes('roughness: 0.98') || !architectureSource.includes('metalness: 0.22')) {
  errors.push('Shelter floor, fabric bedding, and stainless-style fixtures need appropriate material response.');
}
if (!performanceSource.includes('this.adaptiveScale - 0.1') || !performanceSource.includes('this.adaptiveScale > 0.48')) {
  errors.push('Adaptive resolution fallback is missing for sustained low FPS.');
}
if (!performanceSource.includes('if (fps < 42)') || !performanceSource.includes('else if (fps >= 52)') || !performanceSource.includes('this.adaptiveScale + 0.08')) {
  errors.push('Adaptive resolution must use hysteresis and restore edge clarity promptly after FPS recovers.');
}
if (
  !cameraSource.includes('this.moveBasis = { forward: this.forward, right: this.right }') ||
  !cameraSource.includes('return this.moveBasis;') ||
  !inputSource.includes('this.movementAxes = { x: 0, y: 0 }') ||
  !movementSource.includes('this.physics.position(this.previousPositionScratch)') ||
  !movementSource.includes('this.physics.position(this.positionScratch)') ||
  !movementSource.includes('const actualVelocity = this.actualVelocityScratch;') ||
  movementSource.includes('this.cachedFootContacts.map(') ||
  !physicsSource.includes('position(out = null)') ||
  !physicsSource.includes('this.requestedMoveScratch = { x: 0, y: 0, z: 0 }') ||
  !physicsSource.includes('const rotation = this.rotationScratch;') ||
  !physicsSource.includes('return this.moveResultScratch;')
) {
  errors.push('Camera orbit and locomotion must reuse per-tick input, movement, position, and contact buffers to reduce garbage collection.');
}
if (
  !movementSource.includes('this.airborneGroundProbe = { grounded: false, surfaceY: null, supportPoints: 0 }') ||
  !movementSource.includes('const groundProbe = this.verticalVelocity > 0.05') ||
  !movementSource.includes('? this.airborneGroundProbe') ||
  !animatorSource.includes('const needsGroundIK = grounded && !sitting && this.sitBlend < 0.25;') ||
  !animatorSource.includes('const needsBlockedAirYaw = !needsGroundIK && contacts.some(') ||
  !animatorSource.includes('if (needsGroundIK || needsBlockedAirYaw) this.rig.root.updateMatrixWorld(true);') ||
  !animatorSource.includes('const canSolveIK = needsGroundIK && hasIKTarget;') ||
  !animatorSource.includes('const canResolveBlockedAirYaw = !needsGroundIK && contactBlocked && hasIKTarget;')
) {
  errors.push('Jump ascent should skip unnecessary ground support rays, and airborne animation should avoid full grounded IK except for obstacle-tuck yaw.');
}
if (!hudSource.includes('toggleHUD()') || !hudSource.includes('[data-camera-zoom]') || !hudSource.includes("event.code === 'KeyH'")) {
  errors.push('HUD hide/show hotkey or camera zoom buttons are missing.');
}
const advancedSettingsStart = html.indexOf('<details class="advanced-settings" id="advanced-settings" hidden>');
const advancedSettingsEnd = html.indexOf('</details>', advancedSettingsStart);
const advancedSettingsHtml = advancedSettingsStart >= 0 && advancedSettingsEnd > advancedSettingsStart
  ? html.slice(advancedSettingsStart, advancedSettingsEnd)
  : '';
if (
  !html.includes('id="developer-mode-toggle"') ||
  !html.includes('id="advanced-settings" hidden') ||
  !advancedSettingsHtml.includes('id="fps-toggle"') ||
  !advancedSettingsHtml.includes('id="morning-check-toggle"') ||
  !advancedSettingsHtml.includes('role="switch"') ||
  !hudSource.includes("localStorage.getItem('paw-haven-developer-mode')") ||
  !hudSource.includes("localStorage.setItem('paw-haven-developer-mode', String(this.developerMode))") ||
  !hudSource.includes("this.developerMode = this.readDeveloperModePreference()") ||
  !hudSource.includes("this.developerModeToggle?.addEventListener('click', () => this.setDeveloperMode(!this.developerMode))") ||
  !hudSource.includes('this.advancedSettings.hidden = !this.developerMode') ||
  !hudSource.includes("localStorage.getItem('paw-haven-show-fps')") ||
  !hudSource.includes("localStorage.setItem('paw-haven-show-fps', String(this.showFPS))") ||
  !hudSource.includes('this.showFPS = this.developerMode && this.readFPSPreference()') ||
  !hudSource.includes("this.gameRoot?.classList.toggle('show-fps', this.showFPS)") ||
  !hudSource.includes("this.setFPSVisible(this.readFPSPreference(), false)") ||
  !hudSource.includes("this.fpsToggle?.addEventListener('click', () => {") ||
  !hudSource.includes("this.gameRoot?.classList.toggle('morning-check-disabled', !this.showMorningCheck)") ||
  !hudSource.includes("this.morningCheckToggle?.addEventListener('click', () => this.setMorningCheckVisible(!this.showMorningCheck))") ||
  !hudSource.includes("localStorage.setItem('paw-haven-morning-check', String(this.showMorningCheck))") ||
  !touchStyleSource.includes('#game:not(.show-fps) .fps-pill') ||
  !touchStyleSource.includes('#game.show-fps .fps-pill') ||
  !touchStyleSource.includes('#game.morning-check-disabled .mission-card') ||
  !touchStyleSource.includes('.advanced-settings[hidden]')
) {
  errors.push('Developer Mode must be user-toggleable, persistent, and gate Advanced Settings with functional FPS and Morning Check switches.');
}
if (!paletteSource.includes("...(WORLD_RULES.room?.palette || {})") || !worldRulesSource.includes('"wood": "#c89069"') || !worldRulesSource.includes('"floorA": "#f0d9d4"') || !worldRulesSource.includes('"coral": "#f09caa"')) {
  errors.push('Paw Haven practical-material palette is missing from the active world-rules catalog.');
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'backups' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(?:m?js)$/.test(entry.name)) files.push(full);
  }
  return files;
}
const jsFiles = await walk(root);
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  const rel = path.relative(root, file);
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    const spec = match[1];
    const resolved = path.resolve(path.dirname(file), spec);
    try { await access(resolved); }
    catch { errors.push(`Broken local import in ${rel}: ${spec}`); }
  }
}
if (!html.includes('id="touch-jump"') || !html.includes('id="touch-sit"') || !html.includes('id="touch-sprint"')) {
  errors.push('Mobile jump, sit/stand, and hold-to-run controls are required.');
}
if (
  !html.includes('id="touch-zone"') ||
  !inputSource.includes('navigator.maxTouchPoints > 0') ||
  !inputSource.includes('const forwardAmount = length > 0 ? -dy / length : 0') ||
  !inputSource.includes('forwardPercent >= 85') ||
  !inputSource.includes('const availableUpwardTravel = Math.max(1, this.joystickOrigin.y)') ||
  !html.includes('id="touch-percent"') ||
  !touchStyleSource.includes('.touch-percent') ||
  !inputSource.includes('this.autoRunLocked && this.joystickPointerId === null') ||
  !inputSource.includes("stick.style.setProperty('left'") ||
  !inputSource.includes('this.joystickOrigin.x = event.clientX') ||
  !inputSource.includes("zone.addEventListener('pointerdown', this.startStick") ||
  !inputSource.includes("stick.addEventListener('pointerdown', this.startStick") ||
  !inputSource.includes("zone.addEventListener('lostpointercapture', this.resetStick)") ||
  !inputSource.includes("stick.addEventListener('lostpointercapture', this.resetStick)") ||
  !inputSource.includes("window.addEventListener('pointercancel', this.resetStick)") ||
  !inputSource.includes("this.touchSprint || this.autoRunLocked") ||
  !touchStyleSource.includes('pointer-events:auto!important') ||
  !touchStyleSource.includes('opacity:0!important') ||
  !touchStyleSource.includes('opacity:1!important;pointer-events:auto!important') ||
  !touchStyleSource.includes('width:52%') ||
  !touchStyleSource.includes('grid-template-areas:". jump" "sprint ." ". sit";') ||
  !touchStyleSource.includes('width:58px!important;height:58px!important;') ||
  !touchStyleSource.includes('.touch-controls.touch-enabled .touch-actions') ||
  !touchStyleSource.includes('right:clamp(22px,7vw,38px)!important') ||
  !touchStyleSource.includes('width:64px!important;height:64px!important;') ||
  (!inputSource.includes('data-icon="stand"') || !inputSource.includes('data-icon="sit"') || !inputSource.includes('paw-haven-icons-change')) ||
  !styleSource.includes('.touch-controls.touch-enabled')
) {
  errors.push('Mobile controls need a dynamic joystick anywhere in the left playfield, stable pointer recovery, an 85% upward-swipe auto-run lock with a visible percentage meter, and readable adventure-style action buttons.');
}
if (!html.includes('src="/src/main.js"')) errors.push('index.html must reference src/main.js.');
if (!html.includes('id="game-canvas"')) errors.push('Missing game canvas.');
if (!html.includes('id="touch-controls"')) errors.push('Missing responsive touch controls.');
if (!html.includes('id="ui-toggle"') || !html.includes('data-camera-zoom="in"') || !html.includes('data-camera-zoom="out"')) errors.push('HUD toggle and on-screen camera zoom controls are required.');
if (!html.includes('Paw Haven') || !html.includes("K-09's") || !html.includes('routine safety check')) errors.push('Paw Haven morning inspection story is missing.');
if (
  !shelterSource.includes('const segments = 12;') ||
  !shelterSource.includes('preserving a continuous collision ring with fewer Rapier colliders')
) {
  errors.push('Toy-ring collision should use the validated 12-segment continuous collider approximation.');
}

if (!shelterSource.includes('side: THREE.DoubleSide') || !shelterSource.includes('Ground-level structural boxes and furniture pieces are solid by default') || !shelterSource.includes('roundRadius: roundRadius > 0 ? Math.min(roundRadius') || !shelterSource.includes("solid.shape = 'ball'") || !shelterSource.includes("shape: opts.solid.shape || 'cylinder'") || !shelterSource.includes('Overlapping ball colliders follow the actual torus tube') || !physicsSource.includes('setTranslation(0, -0.25, 0)') || !physicsSource.includes('Math.max(0.001, s.sx - roundRadius)') || !physicsSource.includes('Math.max(0.001, s.sy - roundRadius)') || !physicsSource.includes('Math.max(0.001, s.sz - roundRadius)') || !physicsSource.includes('ColliderDesc.ball(s.radius)') || !physicsSource.includes('ColliderDesc.cylinder(s.halfHeight, s.radius)') || !physicsSource.includes('ColliderDesc.capsule(s.halfHeight, s.radius)') || !propsSource.includes('solid: { sx: 0.31, sy: 0.15, sz: 0.15 }') || !propsSource.includes('solid: { sx: 0.43, sy: 0.205, sz: 0.39 }') || !propsSource.includes('const ribHeight = 0.018;') || !decorationSource.includes('Foliage is decorative, not a walkable platform') || decorationSource.includes('world.solids.push({ x, y: 1.31 * scale') || !robotDogSource.includes('this.group.position.set(0, 0.0775, 2.5)') || !robotDogSource.includes('this.shadow.position.y = 0;')) {
  errors.push('Interior surfaces must render from both sides and visible prop collision coverage must stay aligned with the character.');
}
if (
  !mainSource.includes("import { PickupInventory } from './character/inventory.js';") ||
  !mainSource.includes('new PickupInventory(this.scene, this.dog, this.input, this.hud, this.physics, this.shelter)') ||
  !mainSource.includes('this.inventory?.update(FIXED_DT)') ||
  !mainSource.includes('this.inventory?.dispose()') ||
  !inventorySource.includes('const SLOT_COUNT = Number.isInteger(OBJECT_RULES.capacity?.slots) ? OBJECT_RULES.capacity.slots : 12;') ||
  !inventorySource.includes("const SAVE_KEY = 'paw-haven-inventory-v1';") ||
  !inventorySource.includes('OBJECT_RULES.initialPickups') ||
  !objectRulesSource.includes('"pickup-ball"') ||
  !objectRulesSource.includes('"pickup-bone"') ||
  !objectRulesSource.includes('"pickup-cube"') ||
  !objectRulesSource.includes('"pickup-gear"') ||
  !objectRulesSource.includes('"pickup-plush"') ||
  !inventorySource.includes('registerShelterProps()') ||
  !inventorySource.includes('this.dog.rig.headPivot.add(this.heldRoot)') ||
  !inventorySource.includes('this.input.consumeInteract?.()') ||
  !inventorySource.includes('this.input.consumeInventoryToggle?.()') ||
  !inputSource.includes("event.code === 'KeyE'") ||
  !inputSource.includes("event.code === 'KeyQ'") ||
  !inputSource.includes("event.code === 'KeyI'") ||
  !inputSource.includes('consumeInteract()') ||
  !inputSource.includes('consumeDrop()') ||
  !inputSource.includes('consumeInventoryToggle()') ||
  !inputSource.includes("interact?.addEventListener('click', this.onInteractClick)") ||
  !html.includes('id="inventory-toggle"') ||
  !html.includes('id="inventory-panel"') ||
  !html.includes('id="inventory-slots"') ||
  !html.includes('id="touch-interact"') ||
  !html.includes('id="interaction-prompt"') ||
  !hudSource.includes("./icon/package.svg") ||
  !hudSource.includes("'package': packageIcon") ||
  !touchStyleSource.includes('.inventory-panel') ||
  !touchStyleSource.includes('.inventory-slots') ||
  !touchStyleSource.includes('.touch-interact-button') ||
  !touchStyleSource.includes('#game.hud-hidden .inventory-panel') ||
  !touchStyleSource.includes('.touch-interact-button:not(.is-available)') ||
  !touchStyleSource.includes('pointer-events:none!important;') ||
  !hudSource.includes('toast() {') ||
  hudSource.includes('this.toastNode.classList.add(\'show\')') ||
  html.includes('id="toast"') ||
  styleSource.includes('.toast') ||
  touchStyleSource.includes('.toast') ||
  !touchStyleSource.includes('@media (orientation:landscape) and (max-height:600px) and (pointer:coarse)') ||
  !touchStyleSource.includes('right:25vw!important') ||
  !touchStyleSource.includes('top:50%!important') ||
  !touchStyleSource.includes('width:68px!important') ||
  !touchStyleSource.includes('#game .center-hint,') ||
  !touchStyleSource.includes('#game .interaction-prompt{display:none!important}')
) {
  errors.push('Pickup/inventory interaction, inactive-button camera passthrough, landscape layout, or permanent toast removal regressed.');
}
if (
  !html.includes('id="game-quick-actions"') ||
  html.includes('id="touch-drop"') ||
  !html.includes('id="inventory-toggle"') ||
  !inventorySource.includes('saved.dropped') ||
  !inventorySource.includes('dropped: this.items') ||
  !inventorySource.includes("const label = this.heldType ? 'DROP' : 'PICK UP';") ||
  !inventorySource.includes('storeHeld()') ||
  !inventorySource.includes('HOLD 600 MS  STORE') ||
  !inputSource.includes('consumeLongInteract()') ||
  !inputSource.includes('interact?.addEventListener(\'pointerdown\', this.onInteractPointerDown') ||
  !inputSource.includes('this.interactHoldStartedAt) / 600') ||
  !touchStyleSource.includes('.game-quick-actions') ||
  !touchStyleSource.includes('#game.hud-hidden .game-quick-actions') ||
  !touchStyleSource.includes('conic-gradient(#c8f36a var(--hold-progress,0%)') ||
  touchStyleSource.includes('#game.hud-hidden .touch-interact-button{display:none!important}') ||
  touchStyleSource.includes('#game.hud-hidden .inventory-toggle,#game.hud-hidden .inventory-panel') ||
  !bagIconSource.includes('<rect x="5" y="5" width="14" height="16" rx="3"/>')
) {
  errors.push('Unified tap pickup/drop, 600ms hold-to-store, backpack UI, hide-HUD behavior, or dropped-item persistence regressed.');
}
if (
  !mainSource.includes('new PickupInventory(this.scene, this.dog, this.input, this.hud, this.physics, this.shelter)') ||
  !physicsSource.includes('this.looseObjects = [];') ||
  !physicsSource.includes('this.looseObjectsById = new Map();') ||
  !physicsSource.includes('createLooseObject(id, type, root, options = {})') ||
  !physicsSource.includes('removeLooseObject(id)') ||
  !physicsSource.includes('supportHeightAt(x, z, originY, excludeId = null)') ||
  !physicsSource.includes('this.syncLooseObjects();') ||
  !physicsSource.includes('record.root.position.set(p.x, p.y, p.z)') ||
  !physicsSource.includes('ColliderDesc.ball(0.145)') ||
  !physicsSource.includes('ColliderDesc.roundCuboid(0.105, 0.09, 0.105, 0.02)') ||
  !physicsSource.includes('ColliderDesc.cylinder(0.03, 0.15)') ||
  !inventorySource.includes('constructor(scene, dog, input, hud, physics = null, shelter = null)') ||
  !inventorySource.includes('this.physics?.createLooseObject(id, type, root, physicsOptions || {})') ||
  !inventorySource.includes('this.physics?.removeLooseObject(item.id)') ||
  !inventorySource.includes('item.physical') ||
  !inventorySource.includes('this.physics?.supportHeightAt(') ||
  !inventorySource.includes('y: item.root.position.y') ||
  !inventorySource.includes('false, true)') ||
  !inventorySource.includes('createWorldPickup(item.id, item.type, { x: item.x, y: Number.isFinite(item.y) ? item.y : 0.5, z: item.z }, item.persistent !== false, true)') ||
  !physicsSource.includes('Dropped pickup impact was skipped safely.')
) {
  errors.push('Dropped inventory objects must use Rapier rigid bodies, collide with existing fixed and movable objects, synchronize their visual transform, and remove physics bodies on pickup/disposal.');
}
if (
  !movementSource.includes('this.dog.worldVelocity ||= { x: 0, y: 0, z: 0 };') ||
  !movementSource.includes('const worldVelocity = this.dog.worldVelocity;') ||
  !movementSource.includes('worldVelocity.z = actualVelocity.z;') ||
  !physicsSource.includes('const launchVelocity = options.linearVelocity') ||
  !physicsSource.includes('body.setLinvel({') ||
  !physicsSource.includes('const launchSpin = options.angularVelocity') ||
  !physicsSource.includes('body.setAngvel({') ||
  !inventorySource.includes('tailAnchor.getWorldPosition(new THREE.Vector3())') ||
  !inventorySource.includes('const rearDistances = [0.28, 0.46, 0.66, 0.86, 1.06]') ||
  !inventorySource.includes('const motion = this.dog.worldVelocity ||') ||
  !inventorySource.includes('linearVelocity, angularVelocity') ||
  !inventorySource.includes('this.createDropPuff(releasePosition)') ||
  !inventorySource.includes('tailAnchor.rotation.x += 0.19') ||
  !inventorySource.includes('Pfft!') ||
  !inventorySource.includes('this.dropPuffs.length = 0')
) {
  errors.push('Dropped items must emerge beneath the tail, inherit motion and spin, show a temporary puff and persist physical motion safely.');
}
if (
  !inventorySource.includes('this.registerShelterProps();') ||
  !inventorySource.includes('createPropPickup(objectId, !dropped, prop.group)') ||
  !inventorySource.includes('this.physics?.suspendDynamicProp(item.propId)') ||
  !inventorySource.includes('this.physics?.restoreDynamicProp(objectId,') ||
  !inventorySource.includes('pickupAllowed: Boolean(pickupType && canCarryObject(id, pickupType))') ||
  !inventorySource.includes('pickupAllowed: Boolean(pickupType && canCarryObject(token, pickupType))') ||
  !inventorySource.includes('maxInventoryMassKg') ||
  !objectRulesSource.includes('"maxPickupMassKg": 1.2') ||
  !objectRulesSource.includes('"maxInventoryMassKg": 4.0') ||
  !objectRulesSource.includes('"water-bowl"') ||
  !objectRulesSource.includes('"toy-ball"') ||
  !objectRulesSource.includes('"toy-ring"') ||
  !objectRulesSource.includes('"toy-rope"')
) {
  errors.push('JSON-driven pickup must register eligible lightweight shelter props, honor per-entity pickup flags and mass limits, and restore the same Rapier prop when dropped.');
}

const sleepingBodySyncGuards = (physicsSource.match(/record\.body\.isSleeping\?\.\(\) === true/g) || []).length;
if (
  (physicsSource.match(/contactLatched: false/g) || []).length < 2 ||
  !physicsSource.includes('const canApplyPawImpulse = speed >= 0.45 || maxPawSpeed >= 0.85;') ||
  !physicsSource.includes('if (!canApplyPawImpulse) {') ||
  !physicsSource.includes('if (!record.contactLatched) continue;') ||
  !physicsSource.includes('if (!touching) record.contactLatched = false;') ||
  !physicsSource.includes('let record = this.dynamicPropsById.get(prop.id);') ||
  !physicsSource.includes('this.removeLooseObject(id);') ||
  sleepingBodySyncGuards < 2 ||
  (physicsSource.match(/if \(sleeping && record\.wasSleeping\) continue;/g) || []).length < 2 ||
  (physicsSource.match(/record\.wasSleeping = sleeping;/g) || []).length < 2
) {
  errors.push('Physics performance guards must preserve one-kick-per-contact latching, safe idle early-out, unique prop/loose rigid bodies, and sleeping-body transform sync.');
}
if (
  !inventorySource.includes('const supportNeedsRefresh = !lastProbe') ||
  !inventorySource.includes('item.supportProbePosition = {') ||
  !inventorySource.includes('if (item.isNearby !== near) item.isNearby = near;') ||
  !inventorySource.includes('this.syncRingInstances();') ||
  !inventorySource.includes('new THREE.InstancedMesh(this.ringGeometry, material, capacity)') ||
  !inventorySource.includes('item.ringMatrixState || (item.ringMatrixState = {})') ||
  !inventorySource.includes('if (matrixBufferChanged) {') ||
  !inventorySource.includes('this.scene.add(this.ringIdleMesh, this.ringActiveMesh)') ||
  !inventorySource.includes('this.releaseRingInstance(item);') ||
  !inventorySource.includes('this.nearbyScanInterval = 1 / 30;') ||
  !inventorySource.includes('else if (this.nearbyScanElapsed >= this.nearbyScanInterval)') ||
  !inventorySource.includes('if (!this.nearby) this.nearby = this.findNearbyItem();') ||
  !inventorySource.includes('pickupAllowed: Boolean(pickupType && canCarryObject(id, pickupType))') ||
  !inventorySource.includes('if (!item.pickupAllowed) continue;') ||
  !inventorySource.includes('pickupRange: Math.max(0.35, Number(pickupRule?.interaction?.range) || 1.85)') ||
  !inventorySource.includes('if (this.physicsSaveElapsed >= 0.75) {\n      const droppedPhysical = this.items.filter')
) {
  errors.push('Pickup inventory should avoid stationary support raycasts, per-item pickup draw calls, repeated rule lookups, and per-frame dropped-item filter allocations.');
}

if (errors.length) {
  console.error(`Project checks failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Project checks passed: ${required.length} required paths, ${jsFiles.length} JS module files, ES module imports and required UI hooks verified.`);
}
