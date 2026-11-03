import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import WORLD_RULES from '../worldrules.json';
import { PALETTE } from '../palette.js';
import { playInteractionFx } from '../sound/InteractionAudio.js';
import { playRewardFx } from '../sound/RewardAudio.js';
import teddyModelUrl from './tedi.glb?url';

const THEME = WORLD_RULES.room;
const PARTY = THEME.party;
const GIFT = WORLD_RULES.centralGift;

// Match the supplied Puffy 3D Gift Box reference: warm yellow matte clay and coral-red ribbon.
const GIFT_BOX_COLOR = '#ffcb25';
const GIFT_RIBBON_COLOR = '#ff4238';
const GIFT_GLOW_COLOR = '#ffe270';

function createRoundedSquare(size, radius) {
  const shape = new THREE.Shape();
  const h = size / 2;
  const r = Math.min(radius, h);
  shape.moveTo(-h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  return shape;
}

// Grid-based rounded cap with a cushioned dome, adapted from the supplied HTML.
function createPuffyLidCap(width, thickness, radius, puffAmount) {
  const geometry = new THREE.BoxGeometry(width, thickness, width, 12, 2, 12);
  const positions = geometry.attributes.position;
  const innerW = width / 2 - radius;
  const spread = width / 2;

  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i);
    let y = positions.getY(i);
    let z = positions.getZ(i);
    const absX = Math.abs(x);
    const absZ = Math.abs(z);

    if (absX > innerW && absZ > innerW) {
      const cx = Math.sign(x) * innerW;
      const cz = Math.sign(z) * innerW;
      const u = (x - cx) / radius;
      const v = (z - cz) / radius;
      const cu = u * Math.sqrt(Math.max(0, 1 - (v * v) / 2));
      const cv = v * Math.sqrt(Math.max(0, 1 - (u * u) / 2));
      x = cx + cu * radius;
      z = cz + cv * radius;
    }

    if (y > 0) {
      const distance = Math.hypot(x, z);
      let factor = Math.max(0, 1 - distance / spread);
      factor = 1 - Math.pow(1 - factor, 3);
      y += factor * puffAmount;
    }
    positions.setXYZ(i, x, y, z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function bendRibbonOverDome(geometry, spread, puffAmount) {
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const distance = Math.hypot(x, z);
    let factor = Math.max(0, 1 - distance / spread);
    factor = 1 - Math.pow(1 - factor, 3);
    positions.setY(i, y + factor * puffAmount);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function markPop(mesh) {
  if (mesh) mesh.userData.popClayType = 'pop';
  return mesh;
}

function mergeVertexColoredParts(parts, label) {
  const normalized = [];
  try {
    for (const part of parts) {
      const geometry = part.geometry.index
        ? part.geometry.toNonIndexed()
        : part.geometry.clone();
      if (part.matrix) geometry.applyMatrix4(part.matrix);
      geometry.clearGroups();
      const tint = new THREE.Color(part.color);
      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const offset = i * 3;
        colors[offset] = tint.r;
        colors[offset + 1] = tint.g;
        colors[offset + 2] = tint.b;
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      normalized.push(geometry);
    }
    const merged = mergeGeometries(normalized, false);
    if (!merged) throw new Error('Could not merge vertex-colored gift geometry: ' + label);
    merged.clearGroups();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  } finally {
    for (const geometry of normalized) geometry.dispose();
  }
}

function addIco(world, x, y, z, sx, sy, sz, color) {
  const geometry = world.geometry('cozy-pastel-icosahedron', () => new THREE.IcosahedronGeometry(1, 0));
  return markPop(world.addMesh(geometry, world.material(color, 0.76), x, y, z, {
    scale: { x: sx, y: sy, z: sz }, castShadow: false, receiveShadow: false, collidable: false
  }));
}

function addFlatBox(world, x, y, z, sx, sy, sz, color, opts = {}) {
  const solid = opts.solid ?? (opts.collidable === true
    ? { sx: sx * 0.5, sy: sy * 0.5, sz: sz * 0.5 }
    : undefined);
  return markPop(world.box(x, y, z, sx, sy, sz, color, {
    rounded: opts.rounded ?? false,
    radius: opts.radius ?? 0.06,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    castShadow: opts.castShadow ?? false,
    receiveShadow: opts.receiveShadow ?? false,
    collidable: opts.collidable ?? false,
    solid,
    rotation: opts.rotation
  }));
}

function addWire(world, x1, y1, x2, y2, z, color = PARTY.string) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  addFlatBox(world, (x1 + x2) * 0.5, (y1 + y2) * 0.5, z, length, 0.022, 0.022, color, {
    rotation: { x: 0, y: 0, z: Math.atan2(dy, dx) }
  });
}

function addBirthdayWall(world) {
  const panelY = 4.12;
  addFlatBox(world, 0, panelY, -14.61, 14.6, 2.42, 0.12, PARTY.signPanel, { rounded: true, radius: 0.12 });
  world.label('HAPPY BIRTHDAY', 0, 4.28, -14.52, 11.9, 0.92, PARTY.signPanel, PARTY.signForeground);
  world.label('COZY GAMER CLUB', 0, 3.55, -14.52, 5.8, 0.34, '#fff6e8', '#927a80');

  // One shared low-poly wire-and-bulb motif. These are meshes, not realtime point lights.
  const lightPoints = [];
  for (let i = 0; i <= 20; i++) {
    const x = -15 + i * 1.5;
    const y = 6.15 - (1 - Math.abs(x) / 15) * 0.35;
    lightPoints.push({ x, y });
    if (i > 0) addWire(world, lightPoints[i - 1].x, lightPoints[i - 1].y, x, y, -14.37);
  }
  lightPoints.forEach((point, i) => {
    addIco(world, point.x, point.y - 0.13, -14.36, 0.12, 0.14, 0.09, PARTY.balloons[i % PARTY.balloons.length]);
  });

  const flagGeometry = world.geometry('cozy-party-flag', () => new THREE.ConeGeometry(0.23, 0.43, 3, 1));
  for (let i = 0; i < 13; i++) {
    const x = -12 + i * 2;
    const y = 5.62 - (1 - Math.abs(x) / 14) * 0.14;
    const flag = world.addMesh(flagGeometry, world.material(PARTY.balloons[(i + 2) % PARTY.balloons.length], 0.86), x, y, -14.39, {
      rotation: { x: 0, y: (i % 2) * 0.06, z: Math.PI },
      castShadow: false,
      receiveShadow: false
    });
    markPop(flag);
  }
}

function addBalloonCluster(world, side) {
  const positions = [
    [side * 17.1, 3.35, 9.7, 0.52],
    [side * 16.45, 2.75, 10.2, 0.48],
    [side * 17.8, 2.55, 10.35, 0.46],
    [side * 16.75, 4.05, 10.0, 0.47]
  ];
  positions.forEach(([x, y, z, size], i) => {
    addIco(world, x, y, z, size, size * 1.18, size * 0.92, PARTY.balloons[(i + (side < 0 ? 0 : 2)) % PARTY.balloons.length]);
    addFlatBox(world, x, y * 0.5 + 0.2, z, 0.012, Math.max(0.1, y - 0.35), 0.012, '#b9aaa4');
    addFlatBox(world, x, 0.11, z + 0.04, 0.15, 0.05, 0.15, PALETTE.wood, { rounded: true });
  });
}

function addGameConsole(world, batchParts = null) {
  const rememberConsole = (mesh) => { if (batchParts && mesh?.isMesh) batchParts.push(mesh); return mesh; };
  // Turn the Nintendo-style console 90 degrees so its screen faces the cake table to the east.
  // Tuck the console into the front-left corner of the carpet while keeping its screen aimed at the cake table.
  const x = -5.15;
  const y = 1.18;
  const z = 6.2;
  // Rotate each static piece around the console center. Swap X/Z dimensions so visuals and
  // conservative box colliders stay aligned, without introducing a parent group or runtime cost.
  const turnedBox = (px, py, pz, sx, sy, sz, color, opts = {}) => {
    const rotatedOpts = { ...opts };
    if (opts.rotation) {
      rotatedOpts.rotation = {
        x: opts.rotation.x || 0,
        y: (opts.rotation.y || 0) + Math.PI / 2,
        z: opts.rotation.z || 0
      };
    }
    return rememberConsole(addFlatBox(world, x + (pz - z), py, z - (px - x), sz, sy, sx, color, rotatedOpts));
  };
  const turnedIco = (px, py, pz, sx, sy, sz, color) =>
    rememberConsole(addIco(world, x + (pz - z), py, z - (px - x), sz, sy, sx, color));

  // One body collider matches the console shell; screen art and tiny controls stay visual-only.
  turnedBox(x, y, z, 4.55, 1.78, 0.48, PALETTE.navy, {
    rounded: true, radius: 0.18, collidable: true,
    // One conservative shell collider also covers the overlapping side controllers.
    solid: { sx: 0.27, sy: 0.935, sz: 2.44 }
  });
  turnedBox(x - 2.08, y, z + 0.025, 0.72, 1.87, 0.54, PALETTE.sky, { rounded: true, radius: 0.17, collidable: false });
  turnedBox(x + 2.08, y, z + 0.025, 0.72, 1.87, 0.54, PALETTE.pink, { rounded: true, radius: 0.17, collidable: false });
  turnedBox(x, y + 0.03, z + 0.25, 2.88, 1.47, 0.08, '#333b4e', { rounded: true, radius: 0.08 });
  turnedBox(x, y + 0.03, z + 0.30, 2.62, 1.21, 0.035, '#8195b7', { rounded: true, radius: 0.05 });
  turnedBox(x - 2.09, y + 0.12, z + 0.31, 0.12, 0.62, 0.045, PALETTE.woodDark, { rounded: true });
  turnedIco(x - 2.08, y + 0.12, z + 0.34, 0.14, 0.06, 0.05, PALETTE.dark);
  for (let i = 0; i < 4; i++) {
    turnedIco(x + 2.05 + (i % 2) * 0.16, y + 0.19 + Math.floor(i / 2) * 0.16, z + 0.34, 0.07, 0.07, 0.05, PARTY.balloons[i]);
  }
  // Static pixel sparkles on the display, with no animated shader or extra draw loop.
  turnedBox(x - 0.25, y + 0.14, z + 0.335, 0.58, 0.055, 0.018, '#f7c9d7');
  turnedBox(x + 0.26, y + 0.30, z + 0.335, 0.46, 0.045, 0.018, '#bde6d4');
  turnedBox(x + 0.05, y - 0.11, z + 0.335, 0.05, 0.38, 0.018, '#d9e6ef');
}

function addPlushToy(world, x, z, bodyColor, headColor, earColor, scale = 1, batchParts = null) {
  // Both small bears face the console's screen and the cake table, using static geometry only.
  const rememberPlush = (mesh) => { if (batchParts && mesh?.isMesh) batchParts.push(mesh); return mesh; };
  const faceXBox = (px, py, pz, sx, sy, sz, color, opts = {}) => {
    const rotatedOpts = { ...opts };
    if (opts.rotation) {
      rotatedOpts.rotation = {
        x: opts.rotation.x || 0,
        y: (opts.rotation.y || 0) + Math.PI / 2,
        z: opts.rotation.z || 0
      };
    }
    return rememberPlush(addFlatBox(world, x + (pz - z), py, z - (px - x), sz, sy, sx, color, rotatedOpts));
  };
  const faceXIco = (px, py, pz, sx, sy, sz, color) =>
    rememberPlush(addIco(world, x + (pz - z), py, z - (px - x), sz, sy, sx, color));

  faceXBox(x, 0.39 * scale, z, 0.48 * scale, 0.55 * scale, 0.4 * scale, bodyColor, {
    rounded: true, radius: 0.1 * scale, collidable: true
  });
  faceXBox(x, 0.82 * scale, z + 0.015 * scale, 0.58 * scale, 0.48 * scale, 0.42 * scale, headColor, {
    rounded: true, radius: 0.12 * scale, collidable: true
  });
  for (const side of [-1, 1]) {
    faceXBox(x + side * 0.19 * scale, 1.12 * scale, z + 0.015 * scale,
      0.17 * scale, 0.2 * scale, 0.16 * scale, earColor, {
        rounded: true, radius: 0.05 * scale, rotation: { x: 0, y: 0, z: side * -0.18 }
      });
    faceXIco(x + side * 0.12 * scale, 0.86 * scale, z + 0.245 * scale,
      0.038 * scale, 0.05 * scale, 0.025 * scale, PALETTE.dark);
  }
  faceXBox(x, 0.75 * scale, z + 0.25 * scale,
    0.09 * scale, 0.045 * scale, 0.025 * scale, PALETTE.woodDark, { rounded: true });
}



function mergeCakeTableDecorations(world, meshes, batchName = 'CakeTableDecorationsBatch') {
  const parts = [];
  for (const mesh of meshes) {
    if (!mesh || !mesh.isMesh || mesh.parent !== world.root || !mesh.geometry
      || Array.isArray(mesh.material) || !mesh.material || !mesh.material.color?.isColor) continue;
    mesh.updateMatrix();
    parts.push({ geometry: mesh.geometry, color: mesh.material.color, matrix: mesh.matrix });
  }
  if (parts.length < 2) return null;
  const geometry = mergeVertexColoredParts(parts, 'cake-table-decorations');
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.82,
    metalness: 0, flatShading: true, side: THREE.FrontSide
  });
  const batch = new THREE.Mesh(geometry, material);
  batch.name = batchName;
  // Decorations and tiny parcels stay visible and collidable, but are not camera walls.
  batch.userData.cameraIgnore = true;
  batch.castShadow = false;
  batch.receiveShadow = false;
  batch.frustumCulled = true;
  markPop(batch);
  world.root.add(batch);
  // Keep all existing Rapier solids, including the three parcel-body colliders.
  for (const mesh of meshes) mesh.removeFromParent();
  return batch;
}

function addCakeTable(world) {
  // Cake and buffet decorations are batched after construction.
  const decorativeParts = [];
  const rememberDecoration = (mesh) => { if (mesh && mesh.isMesh) decorativeParts.push(mesh); return mesh; };
  const cakeCylinder = (x, y, z, radiusTop, radiusBottom, height, color, opts = {}) =>
    rememberDecoration(world.cylinder(x, y, z, radiusTop, radiusBottom, height, color, { ...opts, receiveShadow: false }));
  const cakeSphere = (x, y, z, sx, sy, sz, color, opts = {}) =>
    rememberDecoration(world.sphere(x, y, z, sx, sy, sz, color, { ...opts, receiveShadow: false }));
  const cakeBox = (...args) => rememberDecoration(addFlatBox(...args));
  const cakeIco = (...args) => rememberDecoration(addIco(...args));
  // Tabletop and legs have colliders matching the visible dimensions.
  const x = 3.8;
  const z = 5.2;
  addFlatBox(world, x, 1.12, z, 4.35, 0.18, 2.3, PALETTE.wood, { rounded: true, radius: 0.09, collidable: true, castShadow: false, receiveShadow: false });
  for (const dx of [-1.82, 1.82]) {
    for (const dz of [-0.85, 0.85]) {
      addFlatBox(world, x + dx, 0.58, z + dz, 0.24, 1.04, 0.24, PALETTE.woodDark, { rounded: true, radius: 0.05, collidable: true, castShadow: false, receiveShadow: false });
    }
  }

  // Cake, frosting, candles and tabletop decorations are visual-only; the tabletop remains their support surface.
  cakeCylinder(x, 1.31, z, 0.62, 0.58, 0.18, PARTY.cake, { castShadow: false,  });
  cakeCylinder(x, 1.48, z, 0.47, 0.5, 0.2, PARTY.cakeBand, { castShadow: false,  });
  cakeCylinder(x, 1.65, z, 0.34, 0.4, 0.16, PARTY.cakeFrosting, { castShadow: false,  });
  cakeCylinder(x, 1.4, z, 0.63, 0.61, 0.035, PARTY.cakeFrosting, { castShadow: false,  });

  for (let i = 0; i < 5; i++) {
    const candleX = x - 0.29 + i * 0.145;
    const candleZ = z + (i % 2 ? 0.075 : -0.065);
    cakeCylinder(candleX, 1.87, candleZ, 0.035, 0.035, 0.3, PARTY.signAccent, {
      castShadow: false, 
    });
    cakeSphere(candleX, 2.05, candleZ, 0.055, 0.08, 0.055, PALETTE.butter, {
      castShadow: false, 
    });
  }

  // Colourful cupcakes make the cake table feel like a real birthday buffet.
  const cupcakes = [
    { x: 2.55, z: 5.15, color: '#e6a0a7', icing: '#fff0e1' },
    { x: 4.95, z: 4.55, color: '#9acdc0', icing: '#f7c7db' },
    { x: 4.95, z: 5.85, color: '#e8c87c', icing: '#d9c6f4' }
  ];
  for (const cup of cupcakes) {
    cakeCylinder(cup.x, 1.31, cup.z, 0.19, 0.17, 0.18, cup.color, {
      castShadow: false, 
    });
    cakeCylinder(cup.x, 1.44, cup.z, 0.145, 0.15, 0.1, cup.icing, {
      castShadow: false, 
    });
    cakeSphere(cup.x, 1.505, cup.z, 0.045, 0.045, 0.045, PALETTE.coral, {
      castShadow: false, 
    });
  }

  // Juice cups with coloured rims sit near the back corners of the tabletop.
  for (const cup of [
    { x: 2.25, z: 4.45, color: '#f5b94d' },
    { x: 5.45, z: 4.5, color: '#80c9de' }
  ]) {
    cakeCylinder(cup.x, 1.39, cup.z, 0.13, 0.16, 0.32, '#fff3de', {
      castShadow: false, 
    });
    cakeCylinder(cup.x, 1.535, cup.z, 0.132, 0.132, 0.035, cup.color, {
      castShadow: false, 
    });
    cakeBox(world, cup.x, 1.38, cup.z + 0.15, 0.055, 0.24, 0.018, cup.color, { rounded: true });
  }

  // A side plate of cookies and two tiny party hats fill the remaining corners.
  cakeCylinder(5.35, 1.245, 5.2, 0.3, 0.3, 0.05, '#f9e6bc', {
    castShadow: false, 
  });
  for (const cookie of [
    { x: 5.18, z: 5.08, color: '#bf8a62' },
    { x: 5.44, z: 5.05, color: '#d5a16c' },
    { x: 5.43, z: 5.3, color: '#b97856' }
  ]) {
    cakeCylinder(cookie.x, 1.3, cookie.z, 0.105, 0.105, 0.07, cookie.color, {
      castShadow: false, 
    });
    cakeSphere(cookie.x - 0.025, 1.34, cookie.z, 0.018, 0.018, 0.018, PALETTE.butter, {
      castShadow: false, 
    });
  }

  const hatGeometry = world.geometry('birthday-table-party-hat', () => new THREE.ConeGeometry(0.17, 0.42, 5, 1));
  for (const hat of [
    { x: 2.22, z: 5.88, color: '#ed709c' },
    { x: 5.42, z: 5.9, color: '#78b7d5' }
  ]) {
    rememberDecoration(world.addMesh(hatGeometry, world.material(hat.color, 0.82), hat.x, 1.47, hat.z, {
      castShadow: false,
      receiveShadow: false
    }));
    cakeCylinder(hat.x, 1.265, hat.z, 0.17, 0.17, 0.035, PARTY.signAccent, {
      castShadow: false, 
    });
  }

  // Gift parcel bodies keep collision; lids, ribbons and decorative pieces stay visual-only.
  const parcelColors = PARTY.giftColors;
  const parcels = [
    { x: x - 1.08, z: z + 0.08, w: 0.82, h: 0.8, d: 0.76, c: parcelColors[0] },
    { x, z: z + 0.38, w: 0.72, h: 0.67, d: 0.68, c: parcelColors[2] },
    { x: x + 1.08, z: z - 0.08, w: 0.9, h: 0.72, d: 0.84, c: parcelColors[1] }
  ];
  parcels.forEach((gift) => {
    cakeBox(world, gift.x, 0.08 + gift.h * 0.5, gift.z, gift.w, gift.h, gift.d, gift.c, {
      rounded: true, radius: 0.07, collidable: true
    });
    cakeBox(world, gift.x, 0.08 + gift.h * 0.5, gift.z + gift.d * 0.5 + 0.012, gift.w * 0.14, gift.h * 0.94, 0.025, PALETTE.cream);
    cakeBox(world, gift.x, 0.08 + gift.h + 0.035, gift.z, gift.w * 1.04, 0.06, gift.d * 1.04, PALETTE.cream, {
      rounded: true
    });
    cakeIco(world, gift.x - 0.1, 0.08 + gift.h + 0.1, gift.z, 0.12, 0.06, 0.1, PALETTE.coral);
    cakeIco(world, gift.x + 0.1, 0.08 + gift.h + 0.1, gift.z, 0.12, 0.06, 0.1, PALETTE.butter);
  });
  mergeCakeTableDecorations(world, decorativeParts);
}

function buildCentralGift(world) {
  if (!GIFT.enabled) return null;
  const { x, z } = GIFT.position;
  const { width, height, depth } = GIFT.body;
  const floorY = GIFT.floorY;
  const panelBaseY = floorY + 0.14;
  const topY = panelBaseY + height;
  const plate = GIFT.pressurePlate;
  const animation = GIFT.animation;
  const panelOpenAngle = animation.panelOpenAngle ?? 1.48;
  const lidLiftHeight = animation.lidLiftHeight ?? height * 1.65;
  // Leave overhead clearance for the oversized bow while the lid is fully hoisted.
  const craneTopY = topY + lidLiftHeight + 2.3;
  const frontZ = z + depth * 0.5;

  // The parcel is assembled from four independent, non-physical panels so every wall can fold outward.
  // Keeping the body visual-only avoids an invisible full-box collider after the walls have opened.
  const wallThickness = 0.3;
  const ribbonWidth = 0.8;
  const ribbonThickness = 0.15;
  const boxMaterial = new THREE.MeshStandardMaterial({
    color: GIFT_BOX_COLOR, roughness: 0.85, metalness: 0.05
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: GIFT_GLOW_COLOR,
    emissive: GIFT_BOX_COLOR,
    emissiveIntensity: 0.36,
    roughness: 1
  });

  // Warm yellow base stays slightly above the rug, with one shared gift material and no redundant temporary material.
  const giftBaseGeometry = world.geometry('cozy-gift-base', () => new RoundedBoxGeometry(width + 0.4, 0.14, depth + 0.4, 3, 0.06));
  const giftBase = world.addMesh(giftBaseGeometry, boxMaterial, x, floorY + 0.07, z, { castShadow: false, receiveShadow: false });
  markPop(giftBase);

  // A glowing inset floor sits just above the base, matching the warm inner glow in the reference.
  const giftInlayGeometry = world.geometry('cozy-gift-inlay', () => new RoundedBoxGeometry(width - wallThickness, 0.08, depth - wallThickness, 3, 0.035));
  const giftInlay = world.addMesh(giftInlayGeometry, glowMaterial, x, floorY + 0.188, z, { castShadow: false, receiveShadow: false });
  giftInlay.visible = false;
  markPop(giftInlay);

  // Four folding walls and their ribbons are now one vertex-colored instanced batch.
  // Equal wall spans share one instanced batch; distinct spans stay in separate batches.
  const panelRibbonOffset = wallThickness / 2 + ribbonThickness / 2 - 0.01;
  const panelEntries = [
    { px: x, pz: frontZ, axis: 'x', sign: 1, rotateY: 0 },
    { px: x, pz: z - depth * 0.5, axis: 'x', sign: -1, rotateY: 0 },
    { px: x - width * 0.5, pz: z, axis: 'z', sign: 1, rotateY: -Math.PI / 2 },
    { px: x + width * 0.5, pz: z, axis: 'z', sign: -1, rotateY: Math.PI / 2 }
  ];
  const panelSpans = [...new Set([width, depth])];
  const panelMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.05
  });
  const panelBatches = panelSpans.map((span) => {
    const entries = panelEntries.filter((entry, index) => Math.abs((index < 2 ? width : depth) - span) < 0.0001);
    const geometry = world.geometry(`central-gift-colored-panel:${span}:${height}:${wallThickness}:${ribbonWidth}:${ribbonThickness}`, () => {
      const wall = new RoundedBoxGeometry(span, height, wallThickness, 2, Math.min(0.14, wallThickness * 0.47));
      const ribbon = new RoundedBoxGeometry(ribbonWidth, height + 0.4, ribbonThickness, 2, 0.05);
      ribbon.translate(0, 0, panelRibbonOffset);
      try {
        return mergeVertexColoredParts([
          { geometry: wall, color: GIFT_BOX_COLOR },
          { geometry: ribbon, color: GIFT_RIBBON_COLOR }
        ], 'folding-wall');
      } finally {
        wall.dispose();
        ribbon.dispose();
      }
    });
    const instances = new THREE.InstancedMesh(geometry, panelMaterial, entries.length);
    instances.name = 'CozyGiftFoldedWallBatch';
    instances.castShadow = false;
    instances.receiveShadow = false;
    instances.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(x, panelBaseY + height * 0.5, z),
      Math.max(width, depth) * 1.85 + height * 0.5
    );
    markPop(instances);
    world.root.add(instances);
    return { entries, instances };
  });
  const panelHinge = new THREE.Object3D();
  const panelLocal = new THREE.Object3D();
  const panelMatrix = new THREE.Matrix4();
  const syncPanels = (wallProgress) => {
    for (const batch of panelBatches) {
      batch.entries.forEach((entry, index) => {
        panelHinge.position.set(entry.px, panelBaseY, entry.pz);
        panelHinge.rotation.set(
          entry.axis === 'x' ? entry.sign * panelOpenAngle * wallProgress : 0,
          0,
          entry.axis === 'z' ? entry.sign * panelOpenAngle * wallProgress : 0
        );
        panelHinge.updateMatrix();
        panelLocal.position.set(0, height * 0.5, 0);
        panelLocal.rotation.set(0, entry.rotateY, 0);
        panelLocal.updateMatrix();
        panelMatrix.multiplyMatrices(panelHinge.matrix, panelLocal.matrix);
        batch.instances.setMatrixAt(index, panelMatrix);
      });
      batch.instances.instanceMatrix.needsUpdate = true;
    }
  };
  syncPanels(0);

  // Rapier kinematic wall bodies follow the same hinge transforms as the visible wall batch.
  let panelColliderRecords = null;
  let panelColliderWorld = null;
  const panelColliderQuaternion = new THREE.Quaternion();
  const syncPanelColliders = (wallProgress, immediate = false) => {
    if (!panelColliderRecords) return;
    for (const record of panelColliderRecords) {
      const { entry, body, translation } = record;
      panelHinge.rotation.set(
        entry.axis === 'x' ? entry.sign * panelOpenAngle * wallProgress : 0,
        0,
        entry.axis === 'z' ? entry.sign * panelOpenAngle * wallProgress : 0
      );
      panelHinge.updateMatrix();
      panelLocal.rotation.set(0, entry.rotateY, 0);
      panelLocal.updateMatrix();
      panelColliderQuaternion.copy(panelHinge.quaternion).multiply(panelLocal.quaternion);
      if (immediate) {
        body.setTranslation(translation, true);
        body.setRotation(panelColliderQuaternion, true);
      } else {
        body.setNextKinematicTranslation(translation);
        body.setNextKinematicRotation(panelColliderQuaternion);
      }
    }
  };
  const ensurePanelColliders = (physics, wallProgress) => {
    if (panelColliderRecords || !physics?.world || !physics?.api) return;
    const { RigidBodyDesc, ColliderDesc } = physics.api;
    if (typeof RigidBodyDesc?.kinematicPositionBased !== 'function'
      || typeof ColliderDesc?.cuboid !== 'function') return;
    const records = [];
    try {
      for (const batch of panelBatches) {
        for (const entry of batch.entries) {
          const translation = { x: entry.px, y: panelBaseY, z: entry.pz };
          const body = physics.world.createRigidBody(
            RigidBodyDesc.kinematicPositionBased().setTranslation(translation.x, translation.y, translation.z)
          );
          const span = entry.axis === 'x' ? width : depth;
          physics.world.createCollider(
            ColliderDesc.cuboid(span * 0.5, height * 0.5, wallThickness * 0.5)
              .setTranslation(0, height * 0.5, 0)
              .setFriction(0.2)
              .setRestitution(0),
            body
          );
          records.push({ entry, body, translation });
        }
      }
      panelColliderRecords = records;
      panelColliderWorld = physics.world;
      syncPanelColliders(wallProgress, true);
    } catch (error) {
      for (const record of records) {
        try { physics.world.removeRigidBody(record.body); } catch { /* Ignore partial collider rollback. */ }
      }
      panelColliderRecords = null;
      panelColliderWorld = null;
      console.warn('[CozyGift] Could not create folding-wall colliders.', error);
    }
  };

  // Five colored treasure pieces share one instanced draw instead of five independent meshes.
  const treasureY = panelBaseY + 0.32;
  const treasureItems = [
    { x: x - 0.62, y: treasureY, z: z - 0.15, sx: 0.25, sy: 0.31, sz: 0.23, color: PALETTE.butter },
    { x, y: treasureY + 0.07, z: z + 0.1, sx: 0.29, sy: 0.34, sz: 0.26, color: PALETTE.lavender },
    { x: x + 0.62, y: treasureY, z: z - 0.12, sx: 0.23, sy: 0.29, sz: 0.22, color: PALETTE.sky },
    { x: x - 0.22, y: treasureY + 0.18, z: z - 0.56, sx: 0.12, sy: 0.15, sz: 0.12, color: PARTY.signAccent },
    { x: x + 0.34, y: treasureY + 0.2, z: z + 0.48, sx: 0.12, sy: 0.14, sz: 0.12, color: PALETTE.mint }
  ];
  const treasureGeometry = world.geometry('cozy-pastel-icosahedron', () => new THREE.IcosahedronGeometry(1, 0));
  const treasureMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.76, flatShading: true });
  const treasureInstances = new THREE.InstancedMesh(treasureGeometry, treasureMaterial, treasureItems.length);
  treasureInstances.name = 'CozyGiftTreasureInstances';
  treasureInstances.castShadow = false;
  treasureInstances.receiveShadow = false;
  const treasureDummy = new THREE.Object3D();
  treasureItems.forEach((item, index) => {
    treasureDummy.position.set(item.x, item.y, item.z);
    treasureDummy.scale.set(item.sx, item.sy, item.sz);
    treasureDummy.updateMatrix();
    treasureInstances.setMatrixAt(index, treasureDummy.matrix);
    treasureInstances.setColorAt(index, new THREE.Color(item.color));
  });
  treasureInstances.instanceMatrix.needsUpdate = true;
  if (treasureInstances.instanceColor) treasureInstances.instanceColor.needsUpdate = true;
  treasureInstances.computeBoundingSphere();

  // All gift contents live under one hidden parent. Three.js skips the entire subtree
  // while the gift is closed, so neither treasure nor surprise parcels reach the renderer.
  const giftContents = new THREE.Group();
  giftContents.name = 'CozyGiftHiddenContents';
  giftContents.visible = false;
  giftContents.add(treasureInstances);

  // Three little wrapped presents and floating gem-like sparkles share one vertex-color draw.
  const surpriseGeometry = world.geometry('cozy-gift-surprise-contents', () => {
    const parts = [];
    const addPart = (geometry, color, px, py, pz, sx = 1, sy = 1, sz = 1) => {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz)
      );
      parts.push({ geometry, color, matrix });
    };
    const presents = [
      { px: x - 0.88, pz: z + 0.08, color: PALETTE.butter, ribbon: PALETTE.coral, scale: 0.88 },
      { px: x, pz: z - 0.12, color: PALETTE.lavender, ribbon: PALETTE.cream, scale: 1.08 },
      { px: x + 0.88, pz: z + 0.08, color: PALETTE.sky, ribbon: PALETTE.pink, scale: 0.88 }
    ];
    for (const present of presents) {
      const w = 0.56 * present.scale;
      const h = 0.48 * present.scale;
      const d = 0.52 * present.scale;
      const baseY = treasureY + h * 0.5 + 0.12;
      addPart(new RoundedBoxGeometry(w, h, d, 2, 0.07), present.color,
        present.px, baseY, present.pz);
      addPart(new RoundedBoxGeometry(w * 0.16, h * 1.04, d * 1.04, 2, 0.025), present.ribbon,
        present.px, baseY, present.pz + d * 0.012);
      addPart(new RoundedBoxGeometry(w * 1.02, h * 0.13, d * 1.02, 2, 0.025), present.ribbon,
        present.px, baseY + h * 0.39, present.pz);
      addPart(new THREE.IcosahedronGeometry(0.12 * present.scale, 0), present.ribbon,
        present.px, baseY + h * 0.62, present.pz, 1.15, 0.7, 1.0);
    }
    const sparklePositions = [
      [-1.28, 0.72, -0.62, PALETTE.mint],
      [-0.42, 0.94, 0.62, PARTY.signAccent],
      [0.55, 0.82, -0.7, PALETTE.butter],
      [1.3, 0.7, -0.48, PALETTE.lavender],
      [0.1, 1.12, 0.12, PALETTE.sky]
    ];
    for (const [ox, oy, oz, color] of sparklePositions) {
      addPart(new THREE.IcosahedronGeometry(0.105, 0), color,
        x + ox, treasureY + oy, z + oz, 1, 1.35, 1);
    }
    const merged = mergeVertexColoredParts(parts, 'surprise-contents');
    for (const part of parts) part.geometry.dispose();
    return merged;
  });
  const surpriseMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.78,
    metalness: 0, flatShading: true, side: THREE.FrontSide
  });
  const surpriseMesh = new THREE.Mesh(surpriseGeometry, surpriseMaterial);
  surpriseMesh.name = 'CozyGiftSurpriseContentsMesh';
  surpriseMesh.castShadow = false;
  surpriseMesh.receiveShadow = false;
  surpriseMesh.frustumCulled = true;
  markPop(surpriseMesh);
  giftContents.add(surpriseMesh);

  // Load the large plush only after the gift has visibly started opening.
  const teddyContainer = new THREE.Group();
  teddyContainer.name = 'CozyGiftLazyTeddy';
  teddyContainer.position.set(x, floorY + 0.228, z);
  teddyContainer.visible = false;
  giftContents.add(teddyContainer);
  let teddyLoadState = 'idle';
  let latestPhysics = null;
  let teddyColliderBody = null;
  let teddyColliderWorld = null;
  let teddyColliderSize = null;
  const ensureTeddyCollider = (physics) => {
    if (teddyColliderBody || !teddyColliderSize || !physics?.world || !physics?.api) return;
    const { RigidBodyDesc, ColliderDesc } = physics.api;
    if (typeof RigidBodyDesc?.fixed !== 'function' || typeof ColliderDesc?.capsule !== 'function') return;
    const radius = Math.max(0.12, Math.min(teddyColliderSize.x, teddyColliderSize.z) * 0.42);
    const safeRadius = Math.min(radius, teddyColliderSize.y * 0.44);
    const halfHeight = Math.max(0.05, teddyColliderSize.y * 0.5 - safeRadius);
    try {
      const body = physics.world.createRigidBody(
        RigidBodyDesc.fixed().setTranslation(x, floorY + 0.228 + teddyColliderSize.y * 0.5, z)
      );
      physics.world.createCollider(
        ColliderDesc.capsule(halfHeight, safeRadius).setFriction(0.45).setRestitution(0.02),
        body
      );
      teddyColliderBody = body;
      teddyColliderWorld = physics.world;
    } catch (error) {
      console.warn('[CozyGift] Could not create teddy collider.', error);
    }
  };

  const disposeDetachedTeddy = (root) => {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  };

  const simplifyTeddyMeshInWorker = (mesh, targetVertices = 16000) => new Promise((resolve, reject) => {
    const sourceGeometry = mesh.geometry;
    const position = sourceGeometry?.getAttribute('position');
    const index = sourceGeometry?.getIndex();
    if (!position || !index || position.count <= 30000) {
      resolve({
        beforeVertices: position?.count || 0,
        beforeTriangles: index ? Math.floor(index.count / 3) : 0,
        afterVertices: position?.count || 0,
        afterTriangles: index ? Math.floor(index.count / 3) : 0
      });
      return;
    }

    let worker;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      callback(value);
    };

    try {
      worker = new Worker(new URL('./TeddyOptimizeWorker.js', import.meta.url), { type: 'module' });
      const attributes = [];
      const transferables = [];
      for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
        const array = attribute.array.slice();
        attributes.push({
          name,
          array,
          itemSize: attribute.itemSize,
          normalized: attribute.normalized
        });
        transferables.push(array.buffer);
      }
      const indexArray = index.array.slice();
      transferables.push(indexArray.buffer);

      worker.onmessage = (event) => {
        const result = event.data;
        if (!result?.ok) {
          finish(reject, new Error(result?.error || 'Teddy mesh optimization failed.'));
          return;
        }

        let optimizedGeometry = null;
        try {
          optimizedGeometry = new THREE.BufferGeometry();
          for (const attribute of result.attributes || []) {
            optimizedGeometry.setAttribute(
              attribute.name,
              new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized === true)
            );
          }
          if (!result.indexArray) throw new Error('Simplified teddy has no index buffer.');
          optimizedGeometry.setIndex(new THREE.BufferAttribute(result.indexArray, 1));
          optimizedGeometry.computeBoundingBox();
          optimizedGeometry.computeBoundingSphere();
          mesh.geometry = optimizedGeometry;
          sourceGeometry.dispose();
          finish(resolve, {
            beforeVertices: result.beforeVertices,
            beforeTriangles: result.beforeTriangles,
            afterVertices: result.afterVertices,
            afterTriangles: result.afterTriangles
          });
        } catch (error) {
          optimizedGeometry?.dispose();
          finish(reject, error);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        finish(reject, new Error(event.message || 'Teddy optimization worker failed.'));
      };
      worker.postMessage({ attributes, indexArray, targetVertices }, transferables);
    } catch (error) {
      finish(reject, error);
    }
  });

  const optimizeTeddyMaterials = (model) => {
    const replacements = new Map();
    const originals = new Set();
    const keptTextures = new Set();
    const removableTextures = new Set();

    model.traverse((object) => {
      if (!object.isMesh) return;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const source of sourceMaterials) {
        if (!source) continue;
        originals.add(source);
        if (source.map?.isTexture) keptTextures.add(source.map);
        if (source.alphaMap?.isTexture) keptTextures.add(source.alphaMap);
        for (const value of Object.values(source)) {
          if (value?.isTexture) removableTextures.add(value);
        }
        if (!replacements.has(source)) {
          replacements.set(source, new THREE.MeshLambertMaterial({
            color: source.color?.clone() || new THREE.Color(0xffffff),
            map: source.map || null,
            alphaMap: source.alphaMap || null,
            side: source.side ?? THREE.FrontSide,
            transparent: source.transparent === true,
            opacity: Number.isFinite(source.opacity) ? source.opacity : 1,
            alphaTest: Number.isFinite(source.alphaTest) ? source.alphaTest : 0,
            vertexColors: source.vertexColors === true,
            depthWrite: source.depthWrite !== false,
            toneMapped: source.toneMapped !== false,
            flatShading: true
          }));
        }
      }
    });

    for (const [source, optimized] of replacements) {
      optimized.name = source.name || 'TeddyLightweightDiffuse';
    }
    model.traverse((object) => {
      if (!object.isMesh) return;
      if (Array.isArray(object.material)) {
        object.material = object.material.map((source) => replacements.get(source) || source);
      } else if (object.material) {
        object.material = replacements.get(object.material) || object.material;
      }
    });

    for (const texture of removableTextures) {
      if (!keptTextures.has(texture)) texture.dispose();
    }
    for (const source of originals) source.dispose();
    for (const texture of keptTextures) texture.anisotropy = 1;
  };

  const loadTeddyOnDemand = async () => {
    if (teddyLoadState !== 'idle') return;
    const loader = world.assets?.models;
    if (!loader || typeof loader.load !== 'function' || typeof loader.setDRACOLoader !== 'function') {
      teddyLoadState = 'failed';
      console.warn('[CozyGift] GLTFLoader is unavailable or does not support Draco.');
      return;
    }

    // The decoder module and its WASM files are fetched only after the gift begins opening.
    teddyLoadState = 'loading';
    let dracoLoader = null;
    const releaseDraco = () => {
      if (!dracoLoader) return;
      loader.setDRACOLoader(null);
      dracoLoader.dispose();
      dracoLoader = null;
    };

    try {
      const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
      if (!world.root.parent) {
        teddyLoadState = 'disposed';
        return;
      }

      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
      dracoLoader.setWorkerLimit(1);
      loader.setDRACOLoader(dracoLoader);

      loader.load(teddyModelUrl, async (gltf) => {
        const model = gltf?.scene;
        if (!model) {
          releaseDraco();
          teddyLoadState = 'failed';
          console.warn('[CozyGift] Teddy GLB has no scene.');
          return;
        }
        if (!world.root.parent) {
          disposeDetachedTeddy(model);
          releaseDraco();
          teddyLoadState = 'disposed';
          return;
        }

        // Reduce the one-time heavy GLB geometry in a Worker before it joins the rendered scene.
        const teddyMeshes = [];
        model.traverse((object) => {
          if (object.isMesh && !object.isSkinnedMesh && object.geometry?.getAttribute('position')) {
            teddyMeshes.push(object);
          }
        });
        let beforeTriangles = 0;
        let afterTriangles = 0;
        for (const mesh of teddyMeshes) {
          try {
            const stats = await simplifyTeddyMeshInWorker(mesh, 16000);
            beforeTriangles += stats.beforeTriangles;
            afterTriangles += stats.afterTriangles;
          } catch (error) {
            console.warn('[CozyGift] Teddy mesh simplification failed; using original geometry.', error);
          }
        }
        optimizeTeddyMaterials(model);
        if (beforeTriangles > 0) {
          console.info('[CozyGift] Teddy GPU geometry optimized:', {
            meshes: teddyMeshes.length,
            trianglesBefore: beforeTriangles,
            trianglesAfter: afterTriangles,
            reduction: Math.round((1 - afterTriangles / beforeTriangles) * 100) + '%'
          });
        }

        if (!world.root.parent) {
          disposeDetachedTeddy(model);
          releaseDraco();
          teddyLoadState = 'disposed';
          return;
        }

        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0.001)) {
          disposeDetachedTeddy(model);
          releaseDraco();
          teddyLoadState = 'failed';
          console.warn('[CozyGift] Teddy GLB has invalid dimensions.');
          return;
        }

        // Fit a near-full-height teddy while leaving clearance from the folding walls.
        const footprint = Math.min(width, depth) * 0.74;
        const fitScale = Math.min(height * 0.9 / size.y, footprint / size.x, footprint / size.z);
        if (!Number.isFinite(fitScale) || fitScale <= 0) {
          disposeDetachedTeddy(model);
          releaseDraco();
          teddyLoadState = 'failed';
          console.warn('[CozyGift] Teddy GLB could not be fitted inside the gift.');
          return;
        }

        model.scale.multiplyScalar(fitScale);
        model.updateMatrixWorld(true);
        const fitted = new THREE.Box3().setFromObject(model);
        const center = fitted.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.y -= fitted.min.y;
        model.position.z -= center.z;
        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
          object.frustumCulled = true;
          object.userData.cameraIgnore = true;
        });

        teddyContainer.add(model);
        teddyContainer.visible = true;
        teddyColliderSize = fitted.getSize(new THREE.Vector3());
        ensureTeddyCollider(latestPhysics);
        releaseDraco();
        teddyLoadState = 'loaded';
      }, undefined, (error) => {
        releaseDraco();
        teddyLoadState = 'failed';
        console.warn('[CozyGift] Draco-compressed teddy GLB load failed.', error);
      });
    } catch (error) {
      releaseDraco();
      teddyLoadState = 'failed';
      console.warn('[CozyGift] Could not initialize the Draco decoder.', error);
    }
  };

  world.root.add(giftContents);

  // A simple gantry hoists the lid vertically after all four walls have folded outward.
  const lidAssembly = new THREE.Group();
  lidAssembly.name = 'CozyGiftHoistedLid';
  lidAssembly.position.set(x, topY + 0.025, z);
  world.root.add(lidAssembly);

  const lidWidth = width + 0.6;
  const lidThickness = 0.4;
  const lidRadius = 0.55;
  const puffAmount = 0.65;
  const rimHeight = 0.6;
  const bowGroupHeight = lidThickness / 2 + puffAmount + 0.1;

  // Merge the puffy cap and hollow skirt into one low-cost lid shell mesh.
  const lidShellGeometry = world.geometry('cozy-gift-combined-lid-shell', () => {
    const capSource = createPuffyLidCap(lidWidth, lidThickness, lidRadius, puffAmount);
    const outerShape = createRoundedSquare(lidWidth, lidRadius);
    const innerShape = createRoundedSquare(lidWidth - wallThickness * 2, lidRadius * 0.5);
    outerShape.holes.push(innerShape);
    const rimSource = new THREE.ExtrudeGeometry(outerShape, {
      depth: rimHeight,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      curveSegments: 8
    });
    rimSource.rotateX(-Math.PI / 2);
    rimSource.translate(0, -rimHeight / 2 - 0.18, 0);
    const capGeometry = capSource.index ? capSource.toNonIndexed() : capSource;
    const rimGeometry = rimSource.index ? rimSource.toNonIndexed() : rimSource;
    if (capGeometry !== capSource) capSource.dispose();
    if (rimGeometry !== rimSource) rimSource.dispose();
    const merged = mergeGeometries([capGeometry, rimGeometry], false);
    capGeometry.dispose();
    rimGeometry.dispose();
    if (!merged) throw new Error('Could not merge the gift lid shell geometry.');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  });
  // Build both dome ribbons now; they will be merged with the four lid-side strips below.
  const lidRibbonParts = [];
  const ribbonX = new THREE.BoxGeometry(lidWidth + 0.1, ribbonThickness, ribbonWidth, 12, 1, 1);
  bendRibbonOverDome(ribbonX, lidWidth / 2, puffAmount);
  ribbonX.translate(0, lidThickness / 2 - 0.03, 0);
  lidRibbonParts.push(ribbonX);
  const ribbonZ = new THREE.BoxGeometry(ribbonWidth, ribbonThickness, lidWidth + 0.1, 1, 1, 12);
  bendRibbonOverDome(ribbonZ, lidWidth / 2, puffAmount);
  ribbonZ.translate(0, lidThickness / 2 - 0.03, 0);
  lidRibbonParts.push(ribbonZ);

  // Matching red ribbon strips continue over all four vertical sides of the lid.
  const lidOuterBound = lidWidth / 2 + 0.04 + ribbonThickness / 2 - 0.02;
  const lidSideRibbonGeometry = world.geometry(
    'cozy-gift-lid-side-ribbon',
    () => new RoundedBoxGeometry(ribbonWidth, rimHeight + 0.1, ribbonThickness, 2, 0.05)
  );
  const lidSideRibbonTransforms = [
    [0, -0.18, lidOuterBound, 0],
    [0, -0.18, -lidOuterBound, 0],
    [-lidOuterBound, -0.18, 0, Math.PI / 2],
    [lidOuterBound, -0.18, 0, Math.PI / 2]
  ];
  const lidSideRibbonDummy = new THREE.Object3D();
  for (const [px, py, pz, ry] of lidSideRibbonTransforms) {
    const sideGeometry = lidSideRibbonGeometry.clone();
    lidSideRibbonDummy.position.set(px, py, pz);
    lidSideRibbonDummy.rotation.set(0, ry, 0);
    lidSideRibbonDummy.updateMatrix();
    sideGeometry.applyMatrix4(lidSideRibbonDummy.matrix);
    lidRibbonParts.push(sideGeometry);
  }

  // Six static lid ribbons share one geometry and one draw call while the whole lid moves as a unit.
  const lidRibbonsGeometry = world.geometry('cozy-gift-all-ribbons', () => {
    const normalizedParts = lidRibbonParts.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry.clone());
    const merged = mergeGeometries(normalizedParts, false);
    for (const geometry of lidRibbonParts) geometry.dispose();
    for (const geometry of normalizedParts) geometry.dispose();
    if (!merged) throw new Error('Could not merge the gift lid ribbons.');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  });
  // Merge the knot and mirrored low-poly loops into one static bow mesh.
  const bowGeometry = world.geometry('cozy-gift-combined-bow', () => {
    const knotSource = new RoundedBoxGeometry(0.72, 0.42, 0.58, 2, 0.14);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 0.08, 0),
      new THREE.Vector3(-1.08, 0.82, 0.22),
      new THREE.Vector3(-1.85, 0.55, 0),
      new THREE.Vector3(-1.25, -0.08, -0.22),
      new THREE.Vector3(-0.22, 0, 0)
    ], true);
    const loopSource = new THREE.TubeGeometry(curve, 16, 0.26, 6, false);
    const rightLoopSource = loopSource.clone();
    rightLoopSource.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    const sources = [knotSource, loopSource, rightLoopSource];
    const normalizedParts = sources.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry.clone());
    const merged = mergeGeometries(normalizedParts, false);
    for (const geometry of sources) geometry.dispose();
    for (const geometry of normalizedParts) geometry.dispose();
    if (!merged) throw new Error('Could not merge the gift bow geometry.');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  });
  // Lid shell, all six red ribbons and the bow share a single vertex-colored draw call.
  const bowOffsetMatrix = new THREE.Matrix4().makeTranslation(0, bowGroupHeight, 0);
  const completeLidGeometry = world.geometry('cozy-gift-complete-lid', () =>
    mergeVertexColoredParts([
      { geometry: lidShellGeometry, color: GIFT_BOX_COLOR },
      { geometry: lidRibbonsGeometry, color: GIFT_RIBBON_COLOR },
      { geometry: bowGeometry, color: GIFT_RIBBON_COLOR, matrix: bowOffsetMatrix }
    ], 'complete-lid')
  );
  // The source geometries are build-time inputs only; release their cached copies after batching.
  for (const key of [
    'cozy-gift-combined-lid-shell',
    'cozy-gift-all-ribbons',
    'cozy-gift-combined-bow',
    'cozy-gift-lid-side-ribbon'
  ]) {
    const sourceGeometry = world.geometries.get(key);
    if (sourceGeometry && sourceGeometry !== completeLidGeometry) sourceGeometry.dispose();
    world.geometries.delete(key);
  }
  const completeLidMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.04
  });
  const completeLid = new THREE.Mesh(completeLidGeometry, completeLidMaterial);
  completeLid.name = 'CozyGiftCompleteLidMesh';
  // Large animated gift lid is decorative and should not trigger a full triangle raycast.
  completeLid.userData.cameraIgnore = true;
  completeLid.castShadow = false;
  completeLid.receiveShadow = false;
  markPop(completeLid);
  lidAssembly.add(completeLid);

  // A fixed base collider supports the parcel floor; a kinematic lid collider follows the hoist.
  let giftBaseColliderBody = null;
  let giftLidColliderBody = null;
  let giftColliderWorld = null;
  const ensureGiftBaseAndLidColliders = (physics) => {
    if (!physics?.world || !physics?.api) return;
    const { RigidBodyDesc, ColliderDesc } = physics.api;
    if (typeof RigidBodyDesc?.fixed !== 'function'
      || typeof RigidBodyDesc?.kinematicPositionBased !== 'function'
      || typeof ColliderDesc?.cuboid !== 'function') return;
    if (giftColliderWorld && giftColliderWorld !== physics.world) return;
    giftColliderWorld = physics.world;

    if (!giftBaseColliderBody) {
      let body = null;
      try {
        body = physics.world.createRigidBody(RigidBodyDesc.fixed());
        physics.world.createCollider(
          ColliderDesc.cuboid((width + 0.4) * 0.5, 0.07, (depth + 0.4) * 0.5)
            .setTranslation(x, floorY + 0.07, z)
            .setFriction(0.48),
          body
        );
        physics.world.createCollider(
          ColliderDesc.cuboid((width - wallThickness) * 0.5, 0.04, (depth - wallThickness) * 0.5)
            .setTranslation(x, floorY + 0.188, z)
            .setFriction(0.48),
          body
        );
        giftBaseColliderBody = body;
      } catch (error) {
        if (body) { try { physics.world.removeRigidBody(body); } catch { /* Ignore partial base rollback. */ } }
        console.warn('[CozyGift] Could not create base/floor colliders.', error);
      }
    }

    if (!giftLidColliderBody) {
      let body = null;
      try {
        body = physics.world.createRigidBody(
          RigidBodyDesc.kinematicPositionBased().setTranslation(x, lidAssembly.position.y, z)
        );
        physics.world.createCollider(
          ColliderDesc.cuboid(lidWidth * 0.5, 0.5, lidWidth * 0.5)
            .setTranslation(0, 0.12, 0)
            .setFriction(0.38)
            .setRestitution(0),
          body
        );
        giftLidColliderBody = body;
      } catch (error) {
        if (body) { try { physics.world.removeRigidBody(body); } catch { /* Ignore partial lid rollback. */ } }
        console.warn('[CozyGift] Could not create lid collider.', error);
      }
    }
  };
  const syncGiftLidCollider = (nextLidY) => {
    if (giftLidColliderBody) {
      giftLidColliderBody.setNextKinematicTranslation({ x, y: nextLidY, z });
    }
  };

  // Two posts, an overhead beam and four moving cables make the vertical lift legible in-world.
  const postOffsetX = width * 0.5 + 0.46;
  const postBaseY = floorY + 0.03;
  const postHeight = craneTopY - postBaseY;
  addFlatBox(world, x - postOffsetX, postBaseY + postHeight * 0.5, z, 0.13, postHeight, 0.13, PALETTE.woodDark, { rounded: true, radius: 0.045 });
  addFlatBox(world, x + postOffsetX, postBaseY + postHeight * 0.5, z, 0.13, postHeight, 0.13, PALETTE.woodDark, { rounded: true, radius: 0.045 });
  addFlatBox(world, x, craneTopY, z, width + 1.12, 0.17, 0.22, PALETTE.metal, { rounded: true, radius: 0.045 });
  addFlatBox(world, x, craneTopY + 0.13, z, 0.5, 0.2, 0.38, PALETTE.woodDark, { rounded: true, radius: 0.05 });
  addFlatBox(world, x, craneTopY + 0.245, z, 0.22, 0.035, 0.24, PALETTE.butter, { rounded: true, radius: 0.01 });

  const cableGeometry = world.geometry('central-gift-hoist-cable', () => new THREE.CylinderGeometry(0.018, 0.018, 1, 6));
  const cableMaterial = world.material(PALETTE.woodDark, 0.72);
  const craneCableInstances = new THREE.InstancedMesh(cableGeometry, cableMaterial, 4);
  craneCableInstances.name = 'CozyGiftHoistCableInstances';
  craneCableInstances.castShadow = false;
  craneCableInstances.receiveShadow = false;
  craneCableInstances.frustumCulled = true;
  markPop(craneCableInstances);
  world.root.add(craneCableInstances);
  const craneCables = [];
  let cableInstanceIndex = 0;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      craneCables.push({
        instanceId: cableInstanceIndex++, sideX, sideZ,
        anchor: new THREE.Vector3(x + sideX * width * 0.39, craneTopY - 0.1, z + sideZ * depth * 0.39)
      });
    }
  }
  const cableUp = new THREE.Vector3(0, 1, 0);
  const cableStart = new THREE.Vector3();
  const cableDirection = new THREE.Vector3();
  const cablePosition = new THREE.Vector3();
  const cableQuaternion = new THREE.Quaternion();
  const cableScale = new THREE.Vector3(1, 1, 1);
  const cableMatrix = new THREE.Matrix4();
  const syncCraneCables = () => {
    for (const cable of craneCables) {
      cableStart.set(
        lidAssembly.position.x + cable.sideX * width * 0.39,
        lidAssembly.position.y + 0.16,
        lidAssembly.position.z + cable.sideZ * depth * 0.39
      );
      cableDirection.copy(cable.anchor).sub(cableStart);
      const length = Math.max(0.001, cableDirection.length());
      cablePosition.copy(cableStart).add(cable.anchor).multiplyScalar(0.5);
      cableQuaternion.setFromUnitVectors(cableUp, cableDirection.multiplyScalar(1 / length));
      cableScale.y = length;
      cableMatrix.compose(cablePosition, cableQuaternion, cableScale);
      craneCableInstances.setMatrixAt(cable.instanceId, cableMatrix);
    }
    craneCableInstances.instanceMatrix.needsUpdate = true;
  };
  syncCraneCables();
  const cableMinY = topY + 0.185;
  const cableMaxY = topY + lidLiftHeight + 2.2;
  craneCableInstances.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(x, (cableMinY + cableMaxY) * 0.5, z),
    Math.hypot(width * 0.39 + 0.1, depth * 0.39 + 0.1, (cableMaxY - cableMinY) * 0.5 + 0.1)
  );

  // A physical, in-world pressure plate. It depresses when the dog or a sufficiently heavy prop stands on it.
  addFlatBox(world, plate.x, floorY + 0.075, plate.z, 1.78, 0.15, 1.0, PARTY.buttonBase, { rounded: true, radius: 0.1 });
  const buttonSurface = new THREE.Group();
  buttonSurface.name = 'CozyGiftPressureButton';
  buttonSurface.position.set(plate.x, floorY + 0.15, plate.z);
  world.root.add(buttonSurface);
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: PARTY.buttonOff, roughness: 0.72, flatShading: true });
  const buttonGeometry = world.geometry('cozy-gift-pressure-button', () => new RoundedBoxGeometry(1.54, 0.1, 0.78, 3, 0.075));
  const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonMesh.name = 'CozyGiftPressureButtonSurface';
  buttonSurface.add(buttonMesh);
  const star = new THREE.Mesh(world.geometry('cozy-gift-button-star', () => new THREE.IcosahedronGeometry(0.14, 0)), new THREE.MeshStandardMaterial({ color: PARTY.signForeground, roughness: 0.8, flatShading: true }));
  star.position.set(0, 0.075, 0);
  buttonSurface.add(star);
  world.label('STEP TO OPEN', plate.x, 0.44, plate.z + 0.62, 1.8, 0.22, '#fff0e1', PARTY.signForeground);

  // Signatures deliberately describe the visual feature only; no HUD buttons or extra light sources are needed.
  const insidePlate = (px, pz, margin = 0) =>
    Math.abs(px - plate.x) <= plate.halfWidth + margin
    && Math.abs(pz - plate.z) <= plate.halfDepth + margin;
  let releaseTimer = 0;
  let openProgress = 0;
  let lastTargetOpen = false;
  let birthdayGreetingDispatched = false;
  // Pressure occupancy is sampled at 20 Hz; lid and button animation remain frame-smooth.
  const pressureCheckInterval = 1 / 20;
  let pressureCheckAccumulator = pressureCheckInterval;
  let pressureHeld = false;
  // Cache static visual transforms so closed, idle gift parts do not upload instance matrices every frame.
  let lastWallProgress = 0;
  let lastLidY = lidAssembly.position.y;
  let lastPressureVisual = false;
  let lastInteriorVisual = false;
  const smoothstep = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const minimumMass = plate.minWeightKg;
  const maxDogHeight = plate.dogMaxHeight;

  return {
    update(dt, dog, physics) {
      latestPhysics = physics || latestPhysics;
      const giftUnlocked = dog?.levelGiftTriggerActivated === true;
      if (!giftUnlocked) {
        pressureHeld = false;
        releaseTimer = 0;
        pressureCheckAccumulator = 0;
      } else {
        pressureCheckAccumulator += Math.max(0, dt);
        if (pressureCheckAccumulator >= pressureCheckInterval) {
          pressureCheckAccumulator %= pressureCheckInterval;
          let pressed = false;
          const dogPosition = dog?.group?.position;
          if (dogPosition && dog.grounded !== false && dogPosition.y <= maxDogHeight
            && insidePlate(dogPosition.x, dogPosition.z)) {
            pressed = true;
          }

          if (!pressed) {
            for (const prop of world.movableProps.values()) {
              const position = prop.group?.position;
              if (!position || prop.mass < minimumMass || position.y > 1.45) continue;
              const margin = Math.min(0.42, Math.max(0.12, (prop.interactionRadius || 0.45) * 0.28));
              if (insidePlate(position.x, position.z, margin)) { pressed = true; break; }
            }
          }

          if (!pressed && physics?.looseObjects) {
            for (const object of physics.looseObjects) {
              const position = object.root?.position;
              if (!position || object.massKg < minimumMass || position.y > 1.15) continue;
              if (insidePlate(position.x, position.z, 0.12)) { pressed = true; break; }
            }
          }
          pressureHeld = pressed;
        }
      }

      if (pressureHeld) releaseTimer = animation.releaseDelay;
      else releaseTimer = Math.max(0, releaseTimer - dt);

      const shouldOpen = pressureHeld || releaseTimer > 0;
      if (shouldOpen !== lastTargetOpen) {
        playInteractionFx(shouldOpen ? 'gift-open' : 'gift-close');
        if (shouldOpen) playRewardFx('mystery');
        lastTargetOpen = shouldOpen;
      }
      const targetOpen = shouldOpen ? 1 : 0;
      const blend = 1 - Math.exp(-animation.speed * Math.min(dt, 0.05));
      openProgress += (targetOpen - openProgress) * blend;

      // Opening order: walls fold outward first, then the lid rises on the hoist.
      // Closing reverses that sequence, lowering the lid before closing the walls.
      const wallProgress = smoothstep(openProgress / 0.56);
      const liftProgress = smoothstep((openProgress - 0.56) / 0.44);
      ensurePanelColliders(physics, wallProgress);
      ensureGiftBaseAndLidColliders(physics);
      ensureTeddyCollider(physics);
      if (Math.abs(wallProgress - lastWallProgress) > 0.00005) {
        syncPanels(wallProgress);
        syncPanelColliders(wallProgress);
        lastWallProgress = wallProgress;
      }
      const interiorVisible = wallProgress > 0.08;
      if (interiorVisible !== lastInteriorVisual) {
        giftInlay.visible = interiorVisible;
        // Toggle one parent instead of every child. Closed gift = zero interior draw calls.
        giftContents.visible = interiorVisible;
        if (interiorVisible) loadTeddyOnDemand();
        lastInteriorVisual = interiorVisible;
      }

      const nextLidY = topY + 0.025 + lidLiftHeight * liftProgress;
      if (Math.abs(nextLidY - lastLidY) > 0.00005) {
        lidAssembly.position.y = nextLidY;
        syncGiftLidCollider(nextLidY);
        syncCraneCables();
        lastLidY = nextLidY;
      }

      // Fire after the final lid transform has been applied, so the greeting captures the fully opened gift.
      if (!birthdayGreetingDispatched && liftProgress >= 0.985) {
        birthdayGreetingDispatched = true;
        playRewardFx('gift-reveal');
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paw-haven-gift-opened'));
        }
      }

      if (pressureHeld !== lastPressureVisual) {
        buttonSurface.position.y = floorY + (pressureHeld ? 0.10 : 0.15);
        buttonMaterial.color.set(pressureHeld ? PARTY.buttonOn : PARTY.buttonOff);
        lastPressureVisual = pressureHeld;
      }
    },
    dispose() {
      if (panelColliderWorld && panelColliderRecords) {
        for (const record of panelColliderRecords) {
          try { panelColliderWorld.removeRigidBody(record.body); } catch { /* Physics may already be disposed. */ }
        }
      }
      if (teddyColliderWorld && teddyColliderBody) {
        try { teddyColliderWorld.removeRigidBody(teddyColliderBody); } catch { /* Physics may already be disposed. */ }
      }
      if (giftColliderWorld && giftBaseColliderBody) {
        try { giftColliderWorld.removeRigidBody(giftBaseColliderBody); } catch { /* Physics may already be disposed. */ }
      }
      if (giftColliderWorld && giftLidColliderBody) {
        try { giftColliderWorld.removeRigidBody(giftLidColliderBody); } catch { /* Physics may already be disposed. */ }
      }
      giftBaseColliderBody = null;
      giftLidColliderBody = null;
      giftColliderWorld = null;
      panelColliderRecords = null;
      panelColliderWorld = null;
      teddyColliderBody = null;
      teddyColliderWorld = null;
    }
  };
}

export function buildCozyPastelRoom(world) {
  // Keep the Nintendo-style console and both tiny plush figures in one compact, front-sided vertex-color batch.
  // This replaces several tiny material batches with one draw while preserving every source collider.
  const clusterParts = [];
  addGameConsole(world, clusterParts);
  addPlushToy(world, -4.18, 5.8, PALETTE.peach, PALETTE.wood, PALETTE.coral, 0.72, clusterParts);
  addPlushToy(world, -4.18, 6.7, PALETTE.lavender, PALETTE.pink, PALETTE.sky, 0.72, clusterParts);
  mergeCakeTableDecorations(world, clusterParts, 'NintendoPlushClusterBatch');
  addCakeTable(world);
  return buildCentralGift(world);
}
