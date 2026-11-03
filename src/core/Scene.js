import * as THREE from 'three';
import WORLD_RULES from '../world/worldrules.json';

const QUALITY_LIGHT_RIGS = new WeakMap();

export function createScene() {
  const scene = new THREE.Scene();
  const lighting = WORLD_RULES.room.lighting;
  const backdrop = new THREE.Color(lighting.background);
  scene.background = backdrop;
  // Warm, low-density haze blends distant walls into the pastel room without bleaching nearby colors.
  scene.fog = new THREE.FogExp2(lighting.fogColor, lighting.fogDensity);

  // The shelter fits well inside this frustum even at maximum zoom-out; tighter clipping also improves depth precision.
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.18, 72);
  camera.position.set(5.5, 4.8, 7.6);
  camera.lookAt(0, 0.9, 0);
  return { scene, camera };
}

/** Create a shared light rig on demand; Low can disable all shadow casting. */
export function setQualityLighting(scene, enabled, options = {}) {
  const shadowsEnabled = options.shadows ?? true;
  const intensityScale = options.intensityScale ?? 1;
  const lighting = WORLD_RULES.room.lighting;
  let rig = QUALITY_LIGHT_RIGS.get(scene);
  if (!enabled) {
    if (rig) {
      rig.sun.castShadow = false;
      rig.sun.shadow.map?.dispose();
      rig.sun.shadow.map = null;
      rig.group.removeFromParent();
      QUALITY_LIGHT_RIGS.delete(scene);
    }
    return null;
  }

  if (!rig) {
    const group = new THREE.Group();
    group.name = 'QualityLightingRig';

    // One warm ambient source keeps Low bright and cozy without adding more per-object lights.
    const hemi = new THREE.AmbientLight(lighting.ambientColor, lighting.ambientIntensity);
    hemi.name = 'ShelterAmbient';
    group.add(hemi);

    const sun = new THREE.DirectionalLight(lighting.directionalColor, lighting.directionalIntensity);
    sun.name = 'ShelterSun';
    sun.position.set(...lighting.directionalPosition);
    sun.castShadow = shadowsEnabled;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 56;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.025;
    group.add(sun);

    const fill = new THREE.DirectionalLight(lighting.fillColor, lighting.fillIntensity);
    fill.name = 'ShelterFill';
    fill.position.set(...lighting.fillPosition);
    fill.castShadow = false;
    group.add(fill);

    rig = { group, sun, fill, hemi };
    QUALITY_LIGHT_RIGS.set(scene, rig);
  }

  rig.sun.castShadow = shadowsEnabled;
  if (shadowsEnabled) {
    rig.sun.shadow.needsUpdate = true;
  } else if (rig.sun.shadow.map) {
    rig.sun.shadow.map.dispose();
    rig.sun.shadow.map = null;
  }
  rig.hemi.color.set(lighting.ambientColor);
  rig.hemi.intensity = lighting.ambientIntensity;
  rig.sun.color.set(lighting.directionalColor);
  rig.sun.intensity = lighting.directionalIntensity * intensityScale;
  rig.fill.color.set(lighting.fillColor);
  rig.fill.intensity = lighting.fillIntensity * intensityScale;
  if (rig.group.parent !== scene) scene.add(rig.group);
  return { sun: rig.sun, fill: rig.fill, hemi: rig.hemi };
}
