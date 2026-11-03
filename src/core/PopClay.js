import * as THREE from 'three';
import matcapUrl from '../../matcaps/256/party-plastic-gloss-256px.png';
import softMatcapUrl from '../../matcaps/256/050505_747474_4C4C4C_333333-256px.png';

let matcapTexture = null;
let softMatcapTexture = null;
let matcapPromise = null;
let softMatcapPromise = null;
let materialVariants = new WeakMap();
const lowMaterials = new Set();
const originalMaterials = new WeakMap();
const originalInstanceColors = new WeakMap();
// Brighter Candy-core target: high-chroma colors with lifted lightness for a glossy toy-plastic look.
const CANDY_CORE = Object.freeze({
  turquoise: Object.freeze({ h: 195 / 360, s: 0.95, l: 0.68 }),
  coral: Object.freeze({ h: 7 / 360, s: 0.94, l: 0.67 }),
  gold: Object.freeze({ h: 43 / 360, s: 0.96, l: 0.66 }),
  lilac: Object.freeze({ h: 276 / 360, s: 0.92, l: 0.70 }),
  sapphire: Object.freeze({ h: 218 / 360, s: 0.94, l: 0.66 }),
  mint: Object.freeze({ h: 151 / 360, s: 0.91, l: 0.67 }),
  bone: Object.freeze({ h: 0, s: 0.0, l: 0.97 }),
  caramel: Object.freeze({ h: 30 / 360, s: 0.82, l: 0.63 })
});
const SATURATED_CANDY_ROLES = Object.freeze([
  'turquoise', 'coral', 'gold', 'lilac', 'sapphire', 'mint', 'caramel'
]);

function hashHue(value, fallback = 0.52) {
  const text = String(value || '');
  if (!text) return fallback;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function exactCandyColor(role) {
  const hsl = CANDY_CORE[role] || CANDY_CORE.turquoise;
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function nearestCandyRole(hue) {
  let selected = SATURATED_CANDY_ROLES[0];
  let bestDistance = Infinity;
  for (const role of SATURATED_CANDY_ROLES) {
    const rawDistance = Math.abs(hue - CANDY_CORE[role].h);
    const distance = Math.min(rawDistance, 1 - rawDistance);
    if (distance < bestDistance) {
      selected = role;
      bestDistance = distance;
    }
  }
  return selected;
}

function sourceColorRole(sourceMaterial, object, type) {
  const color = sourceMaterial?.color;
  const label = [object?.name, sourceMaterial?.name, sourceMaterial?.uuid].filter(Boolean).join(' ').toLowerCase();
  if (object?.userData?.popClaySurface === 'base-floor' || /shelterbasefloor/i.test(label)) return 'turquoise';
  if (/(wood|timber|fence|rafter|picket|beam|oak|shelf)/i.test(label)) return 'caramel';

  if (color?.isColor) {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);

    // Bone white is the specified neutral exception for character accents only.
    if (type === 'pop' && hsl.s <= 0.22 && hsl.l >= 0.80) return 'bone';

    // Keep warm, mid-lightness timber in the caramel family, rather than shifting it to yellow.
    if ((hsl.h <= 0.105 || hsl.h >= 0.97) && hsl.s < 0.80 && hsl.l < 0.80) return 'caramel';
    if (hsl.s > 0.20) return nearestCandyRole(hsl.h);
  }

  // Neutral character surfaces use turquoise; environment neutrals rotate through party colors.
  if (type === 'pop') return 'turquoise';
  const index = Math.floor(hashHue(label || 'shelter-candy') * SATURATED_CANDY_ROLES.length);
  return SATURATED_CANDY_ROLES[index];
}

function profileColor(role) {
  const hsl = CANDY_CORE[role] || CANDY_CORE.turquoise;
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function platformTileRole(index) {
  const slot = index + 1;
  // Brighter party-floor mosaic: regular accents are frequent enough to read clearly at gameplay distance.
  if (slot % 17 === 0) return 'sapphire';
  if (slot % 13 === 0) return 'lilac';
  if (slot % 11 === 0) return 'mint';
  if (slot % 7 === 0) return 'coral';
  if (slot % 5 === 0) return 'gold';
  return 'turquoise';
}

/** Build a low-cost candy material using the glossy-floor or soft-surface grayscale MatCap. */
export function createPopMaterial(role, type, texture = matcapTexture, sourceMaterial = null, useInstanceColor = false) {
  if (!texture) throw new Error('Pop Clay needs its selected grayscale MatCap texture before materials are created.');
  // Neutral pass-through preserves source textures and per-instance swatches.
  const color = (sourceMaterial?.map || useInstanceColor)
    ? new THREE.Color()
    : profileColor(role);
  return new THREE.MeshMatcapMaterial({
    name: `PopClay-${type}`,
    color,
    matcap: texture,
    map: sourceMaterial?.map || null,
    alphaMap: sourceMaterial?.alphaMap || null,
    alphaTest: sourceMaterial?.alphaTest || 0,
    transparent: Boolean(sourceMaterial?.transparent),
    opacity: sourceMaterial?.opacity ?? 1,
    side: sourceMaterial?.side ?? THREE.FrontSide,
    // Three.js uses the color attribute path for InstancedMesh.instanceColor as well.
    vertexColors: Boolean(sourceMaterial?.vertexColors || useInstanceColor),
    flatShading: Boolean(sourceMaterial?.flatShading),
    depthWrite: sourceMaterial?.depthWrite ?? true,
    depthTest: sourceMaterial?.depthTest ?? true,
    blending: sourceMaterial?.blending ?? THREE.NormalBlending,
    fog: true
  });
}

export function loadPopClayMatcap() {
  if (matcapTexture) return Promise.resolve(matcapTexture);
  if (matcapPromise) return matcapPromise;
  matcapPromise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(matcapUrl, (texture) => {
      texture.name = 'BirthdayPlastic-Glossy-Grayscale-256';
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 1;
      texture.needsUpdate = true;
      matcapTexture = texture;
      resolve(texture);
    }, undefined, (error) => {
      matcapPromise = null;
      reject(error instanceof Error ? error : new Error('Failed to load the Pop Clay grayscale MatCap texture.'));
    });
  });
  return matcapPromise;
}

export function loadPopClaySoftMatcap() {
  if (softMatcapTexture) return Promise.resolve(softMatcapTexture);
  if (softMatcapPromise) return softMatcapPromise;
  softMatcapPromise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(softMatcapUrl, (texture) => {
      texture.name = 'BirthdayPlastic-Soft-Grayscale-256';
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 1;
      texture.needsUpdate = true;
      softMatcapTexture = texture;
      resolve(texture);
    }, undefined, (error) => {
      softMatcapPromise = null;
      reject(error instanceof Error ? error : new Error('Failed to load the soft grayscale MatCap texture.'));
    });
  });
  return softMatcapPromise;
}

function resolveObjectType(object) {
  let current = object;
  while (current) {
    if (current.userData?.popClayType === 'pop') return 'pop';
    if (current.userData?.popClayType === 'environment') return 'environment';
    if (current.name === 'PlayerRobotDog' || current.name === 'RoverRig') return 'pop';
    if (/(toy|bone|treat|ball|rope|frisbee)/i.test(current.name || '')) return 'pop';
    current = current.parent;
  }
  return 'environment';
}

function isGlossyFloor(object) {
  return object?.userData?.popClaySurface === 'platform'
    || object?.userData?.popClaySurface === 'base-floor'
    || object?.name === 'MainCandyPlatformTiles'
    || object?.name === 'ShelterBaseFloor';
}

function getLowMaterial(sourceMaterial, objectType, glossyTexture, object, softTexture = glossyTexture) {
  // Crisp toy-plastic reflections belong to the floor; characters and props use the softer grayscale MatCap.
  const surfaceTexture = isGlossyFloor(object) ? glossyTexture : softTexture;
  let variants = materialVariants.get(sourceMaterial);
  if (!variants) {
    variants = new Map();
    materialVariants.set(sourceMaterial, variants);
  }
  const useInstanceColor = Boolean(object?.isInstancedMesh && object.instanceColor);
  const role = sourceColorRole(sourceMaterial, object, objectType);
  const variantKey = `${objectType}|${useInstanceColor ? 'instanced' : 'single'}|${role}|${surfaceTexture.uuid}`;
  if (variants.has(variantKey)) return variants.get(variantKey);
  const material = createPopMaterial(role, objectType, surfaceTexture, sourceMaterial, useInstanceColor);
  variants.set(variantKey, material);
  lowMaterials.add(material);
  return material;
}

function tintInstancedColors(object, objectType) {
  if (!object.instanceColor) return;
  let original = originalInstanceColors.get(object);
  if (!original) {
    original = new Float32Array(object.instanceColor.array);
    originalInstanceColors.set(object, original);
  }
  const sourceColor = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const isMainPlatform = object.userData?.popClaySurface === 'platform' || object.name === 'MainCandyPlatformTiles';

  for (let i = 0; i < object.count; i++) {
    let role;
    if (isMainPlatform) {
      // Turquoise party floor with coral, gold, lilac, mint and sapphire confetti accents.
      role = platformTileRole(i);
    } else {
      sourceColor.fromArray(original, i * 3);
      sourceColor.getHSL(hsl);
      if (objectType === 'pop' && hsl.s <= 0.22 && hsl.l >= 0.80) {
        role = 'bone';
      } else if (hsl.s > 0.20) {
        role = nearestCandyRole(hsl.h);
      } else {
        role = objectType === 'pop'
          ? 'turquoise'
          : SATURATED_CANDY_ROLES[(i * 7 + 3) % SATURATED_CANDY_ROLES.length];
      }
    }
    object.setColorAt(i, profileColor(role));
  }
  object.instanceColor.needsUpdate = true;
}

export function applyPopClay(scene, glossyTexture, softTexture = glossyTexture) {
  if (!glossyTexture || !softTexture) throw new Error('Pop Clay needs both glossy-floor and soft-surface grayscale MatCaps.');
  scene.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (!originalMaterials.has(object)) originalMaterials.set(object, object.material);
    const source = originalMaterials.get(object);
    const type = resolveObjectType(object);
    object.material = Array.isArray(source)
      ? source.map((material) => getLowMaterial(material, type, glossyTexture, object, softTexture))
      : getLowMaterial(source, type, glossyTexture, object, softTexture);
    if (object.isInstancedMesh) tintInstancedColors(object, type);
  });
}

export function restorePopClay(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (originalMaterials.has(object)) object.material = originalMaterials.get(object);
    const original = originalInstanceColors.get(object);
    if (object.isInstancedMesh && object.instanceColor && original) {
      object.instanceColor.array.set(original);
      object.instanceColor.needsUpdate = true;
    }
  });
}

export function disposePopClay() {
  for (const material of lowMaterials) material.dispose();
  lowMaterials.clear();
  if (softMatcapTexture && softMatcapTexture !== matcapTexture) softMatcapTexture.dispose();
  matcapTexture?.dispose();
  matcapTexture = null;
  softMatcapTexture = null;
  matcapPromise = null;
  softMatcapPromise = null;
  materialVariants = new WeakMap();
}
