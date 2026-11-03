import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL_ENTRY_PORTALS, LEFT_WALL_PORTAL_CLEARANCE_ZS } from './LevelAnchors.js';
import { buildCozyPastelRoom } from './object/kado.js';

function mergeStaticPortalParts(world, parts, name) {
  if (parts.length < 2) return false;
  const groups = [];
  for (const part of parts) {
    let group = groups.find((item) => item.material === part.material
      && item.castShadow === part.castShadow
      && item.receiveShadow === part.receiveShadow);
    if (!group) {
      group = { material: part.material, castShadow: part.castShadow, receiveShadow: part.receiveShadow, geometries: [] };
      groups.push(group);
    }
    part.updateMatrix();
    const geometry = part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    group.geometries.push(geometry);
  }
  const batches = [];
  for (const group of groups) {
    const merged = mergeGeometries(group.geometries, false);
    for (const geometry of group.geometries) geometry.dispose();
    if (!merged) {
      for (const batch of batches) batch.geometry.dispose();
      for (const remaining of groups) for (const geometry of remaining.geometries) geometry.dispose();
      console.warn('[RDS] Static mesh batch skipped; original meshes retained:', name);
      return false;
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    batches.push({ geometry: merged, material: group.material, castShadow: group.castShadow, receiveShadow: group.receiveShadow });
  }
  parts.forEach((part) => part.removeFromParent());
  batches.forEach(({ geometry, material, castShadow, receiveShadow }, index) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}-Batch-${index}`;
    // Planters are soft scenery; they do not need to force the camera away from its follow path.
    mesh.userData.cameraIgnore = /planter/i.test(name);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    world.root.add(mesh);
  });
  return true;
}

// Procedural foliage, shelter signage, water station, pendants, and light fixtures.
let plantBatchSequence = 0;
let centerPlantCollector = null;
let birthdayVoxelCollector = null;

function mergeStaticVertexColoredParts(world, meshes, name, popClayType, roughness = 0.86) {
  const geometries = [];
  for (const mesh of meshes) {
    if (!mesh?.isMesh || mesh.parent !== world.root || !mesh.geometry
      || Array.isArray(mesh.material) || !mesh.material?.color?.isColor) continue;
    mesh.updateMatrix();
    let geometry = mesh.geometry.clone();
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    geometry.applyMatrix4(mesh.matrix);
    const position = geometry.getAttribute('position');
    if (!position) { geometry.dispose(); continue; }
    const color = mesh.material.color;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const offset = i * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometries.push(geometry);
  }
  if (geometries.length < 2) {
    for (const geometry of geometries) geometry.dispose();
    return null;
  }
  let merged = null;
  try {
    merged = mergeGeometries(geometries, false);
  } catch (error) {
    console.warn('[RDS] Static vertex-color batch skipped; original meshes retained:', name, error);
  }
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const batch = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
    name: `${name}VertexColor`,
    color: '#ffffff',
    vertexColors: true,
    roughness,
    metalness: 0,
    flatShading: true,
    side: THREE.FrontSide
  }));
  batch.name = name;
  batch.userData.popClayType = popClayType;
  // These large decorative aggregates are not walls; skip them in the camera's triangle-raycast pass.
  batch.userData.cameraIgnore = true;
  batch.castShadow = false;
  batch.receiveShadow = false;
  batch.frustumCulled = true;
  world.root.add(batch);
  // Rapier colliders are stored separately in world.solids; removing source meshes does not remove collision.
  for (const mesh of meshes) mesh.removeFromParent();
  return batch;
}

function makePlantGroup(world, name, plants) {
  const parts = centerPlantCollector || [];
  for (const [x, z, scale, potColor] of plants) makePlant(world, x, z, scale, potColor, parts);
  if (!centerPlantCollector) mergeStaticPortalParts(world, parts, name);
}

export function makePlant(world, x, z, scale = 1, potColor = '#d7a28e', batchParts = null) {
    const plantParts = [];
    const box = (...args) => {
      const mesh = world.box(...args);
      if (mesh?.isMesh && mesh.geometry) plantParts.push(mesh);
      return mesh;
    };

    // The lower pot is the only physical collider; decorative pieces stay visual-only.
    const baseY = 0.09;
    box(x, baseY + 0.11 * scale, z, 0.84 * scale, 0.22 * scale, 0.84 * scale, potColor, {
      castShadow: false,
      receiveShadow: false,
      solid: { sx: 0.42 * scale, sy: 0.11 * scale, sz: 0.42 * scale }
    });
    box(x, baseY + 0.235 * scale, z, 0.92 * scale, 0.08 * scale, 0.92 * scale, '#bd7f78', {
      castShadow: false, receiveShadow: false, collidable: false
    });
    box(x, baseY + 0.285 * scale, z, 0.72 * scale, 0.035 * scale, 0.72 * scale, '#654d3e', {
      castShadow: false, receiveShadow: false, collidable: false
    });

    // Square trunk and layered block foliage preserve the low-poly silhouette.
    box(x, baseY + 0.58 * scale, z, 0.13 * scale, 0.58 * scale, 0.13 * scale, '#8a6847', {
      castShadow: false, receiveShadow: false, collidable: false
    });
    // Reuse four leaf materials so static foliage can be merged into a handful of meshes.
    const leafBlocks = [
      [0, 0.80, 0, 0.66, 0.44, 0.66, '#659968'],
      [-0.22, 0.88, 0, 0.38, 0.36, 0.38, '#81b77d'],
      [0.22, 0.88, 0, 0.38, 0.36, 0.38, '#81b77d'],
      [0, 1.08, 0, 0.58, 0.38, 0.58, '#78ad78'],
      [0, 1.13, -0.19, 0.34, 0.31, 0.34, '#8fc381'],
      [0, 1.13, 0.19, 0.34, 0.31, 0.34, '#659968'],
      [0, 1.35, 0, 0.40, 0.30, 0.40, '#8fc381'],
      [0.12, 1.40, 0, 0.23, 0.22, 0.23, '#a2ce83']
    ];
    for (const [ox, oy, oz, sx, sy, sz, color] of leafBlocks) {
      box(x + ox * scale, baseY + oy * scale, z + oz * scale, sx * scale, sy * scale, sz * scale, color, {
        castShadow: false, receiveShadow: false, collidable: false
      });
    }

    // Small blossom remains visible without adding a shadow-map draw.
    box(x + 0.24 * scale, baseY + 1.52 * scale, z, 0.12 * scale, 0.12 * scale, 0.12 * scale, '#f4d58c', {
      castShadow: false, receiveShadow: false, collidable: false
    });

    // Batch only within a local cluster so distant corners retain independent frustum culling.
    if (batchParts) batchParts.push(...plantParts);
    else if (centerPlantCollector) centerPlantCollector.push(...plantParts);
    else mergeStaticPortalParts(world, plantParts, `Planter-${++plantBatchSequence}`);
}


const VOXEL_FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  Y: ['10001','10001','01010','00100','00100','00100','00100']
};

function birthdayVoxel(world, x, y, z, sx, sy, sz, color, name = 'BirthdayVoxel', collider = false) {
  const mesh = world.box(x, y, z, sx, sy, sz, color, {
    name, castShadow: false, receiveShadow: false, collidable: false, roughness: 0.86,
    ...(collider ? { solid: { sx: sx * 0.5, sy: sy * 0.5, sz: sz * 0.5 } } : {})
  });
  mesh.userData.popClayType = 'voxel-birthday';
  if (birthdayVoxelCollector && mesh?.isMesh) birthdayVoxelCollector.push(mesh);
  return mesh;
}

function addVoxelHeart(world, centerX, centerY, z, cell, color, namePrefix) {
  const rows = ['0110110','1111111','1111111','0111110','0011100','0001000'];
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] !== '1') continue;
      const x = centerX + (col - 3) * cell;
      const y = centerY + ((rows.length - 1) * 0.5 - row) * cell;
      const highlight = row < 2 && (col === 1 || col === 2 || col === 4 || col === 5);
      birthdayVoxel(world, x, y, z, cell * 0.92, cell * 0.92, 0.065,
        highlight ? '#ff8aa8' : color, namePrefix);
    }
  }
}

function addVoxelBirthdaySign(world) {
  const centerY = 2.35;
  const centerZ = -5.9;
  birthdayVoxel(world, 0, centerY, centerZ, 10.2, 1.45, 0.18, '#dd91b2', 'BirthdayVoxelSignFrame', true);
  birthdayVoxel(world, 0, centerY, centerZ + 0.105, 9.96, 1.21, 0.055, '#fff0df', 'BirthdayVoxelSignFace');
  birthdayVoxel(world, 0, centerY - 0.64, centerZ + 0.14, 10.0, 0.055, 0.07, '#f2a9c1', 'BirthdayVoxelSignTrim');
  birthdayVoxel(world, 0, centerY + 0.64, centerZ + 0.14, 10.0, 0.055, 0.07, '#f2a9c1', 'BirthdayVoxelSignTrim');
  for (const side of [-1, 1]) {
    birthdayVoxel(world, side * 4.68, 0.86, centerZ, 0.16, 1.56, 0.18, '#9b6a80', 'BirthdayVoxelSignPost', true);
    birthdayVoxel(world, side * 4.68, 0.13, centerZ, 0.58, 0.09, 0.34, '#f2a9c1', 'BirthdayVoxelSignFoot', true);
  }

  const message = 'HAPPY BIRTHDAY';
  const cell = 0.09;
  const charGap = 0.035;
  const spaceWidth = cell * 2.2;
  const totalWidth = [...message].reduce((sum, char, index) => {
    return sum + (char === ' ' ? spaceWidth : cell * 5) + (index < message.length - 1 ? charGap : 0);
  }, 0);
  const colors = ['#e84e76','#f0aa38','#529bd3','#865ac7','#e84e76','#5ba888','#e84e76','#f0aa38','#529bd3','#865ac7','#e84e76','#5ba888','#f0aa38'];
  let cursorX = -totalWidth * 0.5;
  for (let index = 0; index < message.length; index++) {
    const char = message[index];
    if (char === ' ') {
      cursorX += spaceWidth + (index < message.length - 1 ? charGap : 0);
      continue;
    }
    const glyph = VOXEL_FONT[char];
    const color = colors[index % colors.length];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] !== '1') continue;
        birthdayVoxel(
          world,
          cursorX + (col + 0.5) * cell,
          centerY + (3 - row) * cell,
          centerZ + 0.17,
          cell * 0.91, cell * 0.91, 0.06,
          color,
          'HappyBirthdayVoxelLetter'
        );
      }
    }
    cursorX += cell * 5 + (index < message.length - 1 ? charGap : 0);
  }

  // Pixel-heart logos flank the words, inside the board margins.
  addVoxelHeart(world, -4.45, centerY, centerZ + 0.17, 0.075, '#e94e79', 'BirthdayVoxelHeart');
  addVoxelHeart(world, 4.45, centerY, centerZ + 0.17, 0.075, '#e94e79', 'BirthdayVoxelHeart');

  // Two voxel balloons and block strings crown the sign without filling the walking lane.
  const addBalloon = (x, y, color, prefix) => {
    const rows = ['00100','01110','11111','11111','01110','00100'];
    const cellSize = 0.075;
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        if (rows[row][col] !== '1') continue;
        birthdayVoxel(world,
          x + (col - 2) * cellSize,
          y + ((rows.length - 1) * 0.5 - row) * cellSize,
          centerZ + 0.17,
          cellSize * 0.95, cellSize * 0.95, 0.07,
          row < 2 ? '#fff0df' : color,
          prefix
        );
      }
    }
    for (let i = 0; i < 3; i++) {
      birthdayVoxel(world, x, 3.18 - i * 0.06, centerZ + 0.17, 0.025, 0.07, 0.025, '#b38c8c', 'BirthdayVoxelBalloonString');
    }
  };
  addBalloon(-4.55, 3.45, '#f05b84', 'BirthdayVoxelBalloon');
  addBalloon(4.55, 3.45, '#f3c64e', 'BirthdayVoxelBalloon');
}

function addVoxelGamepad(world) {
  const centerX = -4.35;
  const centerY = 1.32;
  const z = 0.35;
  const cell = 0.095;
  const rows = [
    '0001111111000',
    '0011111111100',
    '0111111111110',
    '1111111111111',
    '1111111111111',
    '1111111111111',
    '1111100111111',
    '0111000111000',
    '0010000010000'
  ];
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] !== '1') continue;
      birthdayVoxel(world, centerX + (col - 6) * cell, centerY + (4 - row) * cell, z,
        cell * 0.93, cell * 0.93, 0.075, '#35435e', 'PlayStationVoxelController');
    }
  }
  const detail = (col, row, color, size = 0.68) => birthdayVoxel(
    world,
    centerX + (col - 6) * cell,
    centerY + (4 - row) * cell,
    z + 0.045,
    cell * size, cell * size, 0.04, color, 'PlayStationVoxelButton'
  );
  // D-pad, twin analog sticks and the four classic face-button colors.
  for (const [col, row] of [[2,3],[1,4],[2,4],[3,4],[2,5]]) detail(col, row, '#f3d9b0', 0.76);
  detail(5, 5, '#d5dbe7', 0.72);
  detail(7, 5, '#d5dbe7', 0.72);
  detail(10, 3, '#8dcf9a', 0.62);
  detail(11, 4, '#f18ca9', 0.62);
  detail(10, 5, '#88c9e4', 0.62);
  detail(9, 4, '#eb6c75', 0.62);
  detail(6, 2, '#f2c45b', 0.58);

  world.solids.push({ x: centerX, y: centerY, z, sx: 0.6175, sy: 0.4275, sz: 0.0375, rotation: { x: 0, y: 0, z: 0 } });
  birthdayVoxel(world, centerX, 0.17, z, 1.55, 0.14, 0.48, '#d995ad', 'PlayStationVoxelDisplayBase', true);
  for (const side of [-1, 1]) {
    birthdayVoxel(world, centerX + side * 0.34, 0.55, z, 0.09, 0.68, 0.10, '#ad7894', 'PlayStationVoxelDisplayStand', true);
  }
}

function addVoxelHeartDisplay(world) {
  const x = 4.35;
  const z = 0.35;
  birthdayVoxel(world, x, 1.36, z, 1.12, 0.96, 0.12, '#fff0df', 'VoxelHeartDisplayBacking', true);
  addVoxelHeart(world, x, 1.38, z + 0.095, 0.105, '#eb4e78', 'VoxelHeartLogo');
  birthdayVoxel(world, x, 0.16, z, 1.42, 0.13, 0.48, '#d995ad', 'VoxelHeartDisplayBase', true);
  for (const side of [-1, 1]) {
    birthdayVoxel(world, x + side * 0.28, 0.53, z, 0.09, 0.66, 0.10, '#ad7894', 'VoxelHeartDisplayStand', true);
  }
}

function buildBirthdayFeatureBatch(world, name, build) {
  const parts = [];
  const previousCollector = birthdayVoxelCollector;
  birthdayVoxelCollector = parts;
  try {
    build();
  } finally {
    birthdayVoxelCollector = previousCollector;
  }
  // Separate local bounds let the camera frustum cull the distant sign and either display independently.
  mergeStaticVertexColoredParts(world, parts, name, 'voxel-birthday', 0.86);
}

function buildVoxelBirthdayCenter(world) {
  buildBirthdayFeatureBatch(world, 'BirthdaySignVoxelBatch', () => addVoxelBirthdaySign(world));
  buildBirthdayFeatureBatch(world, 'GamepadDisplayVoxelBatch', () => addVoxelGamepad(world));
  buildBirthdayFeatureBatch(world, 'LoveDisplayVoxelBatch', () => addVoxelHeartDisplay(world));

  // The three central planters share one local vertex-color batch; their Rapier solids remain separate.
  const plantParts = [];
  const previousPlantCollector = centerPlantCollector;
  centerPlantCollector = plantParts;
  try {
    makePlantGroup(world, 'CenterPlanters', [
      [-5.05, -1.75, 0.9, '#e4a2b6'],
      [5.05, -1.75, 0.9, '#9fc7ce']
    ]);
    makePlant(world, -7.75, 1.2, 0.86, '#d6b37d');
  } finally {
    centerPlantCollector = previousPlantCollector;
  }
  mergeStaticVertexColoredParts(world, plantParts, 'CenterPlantersVertexColorBatch', 'environment', 0.8);
}
function buildLevelAccess(world) {
    // Extend the spawn-side endpoint under the back wall so neither the rails nor collider leave an escape gap.
    const fenceStart = -14.80;
    const gateStart = 9.53;
    const gateEnd = 11.00;
    // Stop the main run at the inside edge and join it to the front-left wall with a return.
    const fenceEnd = 14.70;
    const levelFivePortal = LEVEL_ENTRY_PORTALS.find((portal) => portal.id === 5);
    const fenceRunEndX = -15.9728624508;
    // Move the existing front-return fence endpoint rightward, rather than creating a second fence.
    const fenceReturnEndX = -11.0933657063;
    const fenceDeltaX = fenceRunEndX - (-15.2600498948);
    const fenceDeltaZ = fenceEnd - (-13.4043907589);
    const xAt = (z) => -15.2600498948 + (fenceDeltaX / fenceDeltaZ) * (z + 13.4043907589);
    const yaw = Math.atan2(fenceDeltaX, fenceDeltaZ);

    const fenceSegment = (start, end, index) => {
      const length = end - start;
      const middle = (start + end) * 0.5;
      const x = xAt(middle);
      // One slim static collider keeps the fence genuinely impassable without a collider per iron bar.
      world.solids.push({
        x, y: 1.42, z: middle, sx: 0.065, sy: 1.42, sz: length * 0.5,
        rotation: { x: 0, y: yaw, z: 0 }
      });
      for (const y of [0.16, 0.72, 1.42, 2.12, 2.76]) {
        world.box(x, y, middle, 0.065, y === 0.16 || y === 2.76 ? 0.09 : 0.065, length,
          '#20242a', { collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.42, rotation: { x: 0, y: yaw, z: 0 } });
      }
      for (let z = start + 0.08; z < end - 0.04; z += 0.42) {
        world.box(xAt(z), 1.42, z, 0.055, 2.72, 0.055, '#20242a', {
          collidable: false, castShadow: false, receiveShadow: false, metalness: 0.74, roughness: 0.4
        });
      }
      // Patch the visibly wide gaps beside the spawn with extra iron bars.
      // The long fence collider already blocks passage, so these remain decorative meshes.
      for (let z = start + 0.29; z < end - 0.2; z += 0.42) {
        if (z < -5.9 || z > -3.1) continue;
        world.box(xAt(z), 1.42, z, 0.055, 2.72, 0.055, '#20242a', {
          collidable: false, castShadow: false, receiveShadow: false, metalness: 0.74, roughness: 0.4
        });
      }
      for (const z of [start, ...Array.from({ length: Math.floor(length / 1.65) }, (_, i) => start + (i + 1) * 1.65), end]) {
        if (z < start - 0.01 || z > end + 0.01) continue;
        world.box(xAt(z), 1.42, z, 0.105, 2.84, 0.105, '#15181d', {
          collidable: false, castShadow: false, receiveShadow: false, metalness: 0.7, roughness: 0.42
        });
      }
    };
    fenceSegment(fenceStart, gateStart, 0);
    fenceSegment(gateEnd, fenceEnd, 1);

    // Continue the same black-iron fence as an L-shaped return to the left wall.
    // Keep a centered opening around the existing Level 5 portal so the teleport approach stays usable.
    const fenceReturnSegment = (startX, endX, z, index) => {
      const low = Math.min(startX, endX);
      const high = Math.max(startX, endX);
      const length = high - low;
      if (length < 0.15 || Math.abs(z - fenceEnd) < 0.01) return;
      const center = (low + high) * 0.5;
      world.solids.push({
        x: center, y: 1.42, z, sx: length * 0.5, sy: 1.42, sz: 0.0325,
        rotation: { x: 0, y: 0, z: 0 }
      });
      for (const y of [0.16, 0.72, 1.42, 2.12, 2.76]) {
        world.box(center, y, z, length, y === 0.16 || y === 2.76 ? 0.09 : 0.065, 0.065,
          '#20242a', { collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.42 });
      }
      for (let x = low + 0.08; x < high - 0.04; x += 0.42) {
        // Avoid duplicating a picket where the moved return meets the existing long fence run.
        if (Math.abs(x - fenceRunEndX) < 0.18) continue;
        world.box(x, 1.42, z, 0.055, 2.72, 0.055, '#20242a', {
          collidable: false, castShadow: false, receiveShadow: false, metalness: 0.74, roughness: 0.4
        });
      }
      const postXs = [low, ...Array.from({ length: Math.floor(length / 1.65) }, (_, i) => low + (i + 1) * 1.65), high];
      for (const x of postXs) {
        // Reuse the main-run endpoint post where the return meets it; avoid doubling the same post.
        if (Math.abs(x - fenceRunEndX) < 0.18) continue;
        world.box(x, 1.42, z, 0.105, 2.84, 0.105, '#15181d', {
          collidable: false, castShadow: false, receiveShadow: false, metalness: 0.7, roughness: 0.42
        });
      }
    };
    const levelFiveHalfGap = 0.73;
    // Remove only the selected black-iron fence section at the supplied world point.
    // The 0.50 m opening clears x=-20.1622, z=14.725 without deleting unrelated fence runs.
    const removalPointX = -20.16217081563211;
    const removalHalfWidth = 0.25;
    fenceReturnSegment(-20.80, removalPointX - removalHalfWidth, fenceEnd, 0);
    fenceReturnSegment(removalPointX + removalHalfWidth, levelFivePortal.x - levelFiveHalfGap, fenceEnd, 1);
    // Leave the front-wall text area clear; do not render the unnecessary fence beneath it.

    // The gate is a separate group so it can disappear only when all five levels are complete.
    const gate = new THREE.Group();
    gate.name = 'LevelGateVisual';
    gate.position.set(xAt((gateStart + gateEnd) * 0.5), 0, (gateStart + gateEnd) * 0.5);
    gate.rotation.y = yaw;
    world.root.add(gate);
    const gateBox = (name, x, y, z, sx, sy, sz, color, metalness = 0.72) => {
      const mesh = new THREE.Mesh(
        world.geometry('level-gate:' + name + ':' + sx + ':' + sy + ':' + sz, () => new THREE.BoxGeometry(sx, sy, sz)),
        world.material(color, 0.42, metalness)
      );
      mesh.name = 'LevelGatePart-' + name;
      mesh.position.set(x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      gate.add(mesh);
      return mesh;
    };
    for (const side of [-1, 1]) gateBox('post-' + side, 0, 1.38, side * 0.69, 0.10, 2.76, 0.10, '#15181d');
    for (const y of [0.15, 0.7, 1.38, 2.1, 2.74]) gateBox('rail-' + y, 0, y, 0, 0.075, 0.075, 1.34, '#20242a');
    for (let z = -0.54; z <= 0.55; z += 0.18) gateBox('bar-' + z.toFixed(2), 0, 1.37, z, 0.05, 2.65, 0.05, '#252a31');
    gateBox('lock', 0.075, 1.32, 0.04, 0.12, 0.22, 0.18, '#e5b957', 0.82);
    gateBox('lock-slot', 0.145, 1.32, 0.04, 0.025, 0.12, 0.04, '#292c32', 0.65);

    const leftDoors = LEVEL_ENTRY_PORTALS.filter((portal) => portal.side === 'left');
    // Capture only the static box/sphere meshes belonging to portal visuals.
    // Labels remain separate because each uses its own generated texture.
    const portalParts = [];
    const originalPortalBox = world.box;
    const originalPortalSphere = world.sphere;
    world.box = function (...args) {
      const mesh = originalPortalBox.apply(this, args);
      portalParts.push(mesh);
      return mesh;
    };
    world.sphere = function (...args) {
      const mesh = originalPortalSphere.apply(this, args);
      portalParts.push(mesh);
      return mesh;
    };
    for (const door of leftDoors) {
      // Align the portal centerline to the supplied teleport anchor, not an offset visual-only position.
      // Mount the portal flush to the inner face of the left wall.
      // The walk-up trigger is centered just inside this frame by LevelAnchors.js.
      // Match the supplied teleport anchor exactly at the portal's front-frame center.
      const x = door.x;
      const z = door.z;
      // A narrower, consistent portal frame keeps the close pair from crowding each other.
      world.box(x + 0.025, 1.02, z, 0.10, 2.12, 1.12, '#343c4b', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.42, roughness: 0.55
      });
      world.box(x + 0.085, 1.02, z, 0.045, 1.84, 0.90, '#fff0df', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.62
      });
      world.box(x + 0.115, 1.00, z, 0.035, 1.66, 0.74, door.color, {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.44, metalness: 0.12
      });
      world.box(x + 0.14, 0.98, z, 0.025, 1.38, 0.54, '#354356', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.48
      });
      for (const dz of [-0.50, 0.50]) {
        world.box(x + 0.16, 1.06, z + dz, 0.17, 2.18, 0.12, '#202630', {
          rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.38
        });
        world.box(x + 0.255, 1.04, z + dz, 0.025, 1.82, 0.03, door.color, {
          collidable: false, castShadow: false, receiveShadow: false, roughness: 0.38, metalness: 0.18
        });
      }
      world.box(x + 0.16, 2.18, z, 0.17, 0.16, 1.16, '#202630', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.38
      });
      world.box(x + 0.255, 2.17, z, 0.025, 0.055, 0.92, door.color, {
        collidable: false, castShadow: false, receiveShadow: false, roughness: 0.38, metalness: 0.18
      });
      world.box(x + 0.18, 0.14, z, 0.42, 0.14, 1.16, '#d7c7b9', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.86
      });
      world.box(x + 0.24, 0.23, z, 0.28, 0.035, 0.78, door.color, {
        collidable: false, castShadow: false, receiveShadow: false, roughness: 0.5
      });
      for (let marker = 0; marker < 3; marker++) {
        world.sphere(x + 0.19, 1.55 - marker * 0.20, z + 0.17, 0.035, 0.035, 0.035,
          marker === 0 ? '#fff3d8' : door.color, { castShadow: false, receiveShadow: false, roughness: 0.32, metalness: 0.08 });
      }
      const portalLabel = world.label('LEVEL ' + door.id, x + 0.285, 2.42, z, 0.94, 0.24, door.color, '#252832', { rotationY: Math.PI / 2 });
      portalLabel.updateMatrix();
      portalLabel.matrixAutoUpdate = false;
      mergeStaticPortalParts(world, portalParts, `LevelPortal-${door.id}`);
      portalParts.length = 0;
    }

    // Fifth portal uses the same proportions and is set inward from the front wall.
    const fifth = LEVEL_ENTRY_PORTALS.find((portal) => portal.id === 5);
    world.box(fifth.x, 1.02, fifth.z - 0.025, 1.12, 2.12, 0.10, '#343c4b', {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.42, roughness: 0.55
    });
    world.box(fifth.x, 1.02, fifth.z - 0.085, 0.90, 1.84, 0.045, '#fff0df', {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.62
    });
    world.box(fifth.x, 1.00, fifth.z - 0.115, 0.74, 1.66, 0.035, fifth.color, {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.44, metalness: 0.12
    });
    world.box(fifth.x, 0.98, fifth.z - 0.14, 0.54, 1.38, 0.025, '#354356', {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.48
    });
    for (const dx of [-0.50, 0.50]) {
      world.box(fifth.x + dx, 1.06, fifth.z - 0.16, 0.12, 2.18, 0.12, '#202630', {
        rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.38
      });
      world.box(fifth.x + dx, 1.04, fifth.z - 0.255, 0.03, 1.82, 0.025, fifth.color, {
        collidable: false, castShadow: false, receiveShadow: false, roughness: 0.38, metalness: 0.18
      });
    }
    world.box(fifth.x, 2.18, fifth.z - 0.16, 1.16, 0.16, 0.12, '#202630', {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, metalness: 0.72, roughness: 0.38
    });
    world.box(fifth.x, 2.17, fifth.z - 0.255, 0.92, 0.055, 0.025, fifth.color, {
      collidable: false, castShadow: false, receiveShadow: false, roughness: 0.38, metalness: 0.18
    });
    world.box(fifth.x, 0.14, fifth.z - 0.20, 1.16, 0.14, 0.42, '#d7c7b9', {
      rounded: true, collidable: false, castShadow: false, receiveShadow: false, roughness: 0.86
    });
    world.box(fifth.x, 0.23, fifth.z - 0.20, 0.78, 0.035, 0.28, fifth.color, {
      collidable: false, castShadow: false, receiveShadow: false, roughness: 0.5
    });
    for (let marker = 0; marker < 3; marker++) {
      world.sphere(fifth.x - 0.18 + marker * 0.18, 1.55, fifth.z - 0.20, 0.035, 0.035, 0.035,
        marker === 1 ? '#fff3d8' : fifth.color, { castShadow: false, receiveShadow: false, roughness: 0.32, metalness: 0.08 });
    }
    const fifthPortalLabel = world.label('LEVEL 5', fifth.x, 2.42, fifth.z - 0.19, 0.94, 0.24, fifth.color, '#252832', { rotationY: Math.PI });
    fifthPortalLabel.updateMatrix();
    fifthPortalLabel.matrixAutoUpdate = false;
    mergeStaticPortalParts(world, portalParts, 'LevelPortal-5');
    world.box = originalPortalBox;
    world.sphere = originalPortalSphere;

    // A restrained lock plaque identifies the boundary gate without adding HUD clutter.
    world.label('LEVEL GATE', xAt(10.265), 2.98, 10.265, 1.55, 0.28, '#252a31', '#fff0d1', { rotationY: Math.PI / 2 });
  }

export function buildPlantsAndDetails(world) {
    buildLevelAccess(world);
    // Batch nearby static planters by room area, not across the entire room.
    makePlantGroup(world, 'Planters-WestNorth', [
      [-12.1, 13.0, 1.05, '#8fb7bd'],
      [-7, 11, 0.9, '#a9c8a0']
    ]);
    makePlantGroup(world, 'Planters-EastNorth', [
      [19, 12, 1.2, '#d7a28e'],
      [7, 11, 0.9, '#a9c8a0']
    ]);
    makePlant(world, -19, -12, 1.35, '#d6a38e');
    makePlant(world, -18, 1, 0.75, '#e0c090');
    makePlantGroup(world, 'Planters-EastSouth', [
      [19, -12, 1.25, '#d7ba7b'],
      [18, -4, 0.8, '#d9a59b']
    ]);
    // Ceiling pendant lanterns with soft emissive diffusers.
    for (const x of [-14, 0, 14]) for (const z of [-10, 0, 10]) {
      world.cylinder(x, 6.45, z, 0.035, 0.035, 0.95, '#927f66', { castShadow: false });
      world.cylinder(x, 5.94, z, 0.46, 0.26, 0.2, '#e8d7ad', { castShadow: true });
      world.sphere(x, 5.8, z, 0.26, 0.105, 0.26, '#fff3ce', { roughness: 0.25, castShadow: false });
      // Keep pendant geometry as visible emissive-looking fixtures, without per-pixel point-light loops on mobile GPUs.
    }
    // Wall accents, paw motifs, clocks, and clean signs.
    for (const side of [-1, 1]) {
      const x = side * 20.62;
      for (const z of [-8.5, 0, 8.5]) {
        // Remove wall plaques/paw motifs behind both the old and corrected Level 1-4 portal positions.
        const portalZs = LEFT_WALL_PORTAL_CLEARANCE_ZS;
        if (side === -1 && portalZs.some(doorZ => Math.abs(doorZ - z) < 1.5)) continue;
        world.box(x, 2.0, z, 0.12, 0.78, 1.25, '#e3eadb', { rounded: true, castShadow: false });
        world.sphere(x + side * 0.08, 2.18, z - 0.12, 0.035, 0.09, 0.09, '#7da384', { castShadow: false });
        for (const dx of [-0.1, 0.1]) world.sphere(x + side * 0.08, 2.29, z + dx, 0.03, 0.045, 0.035, '#7da384', { castShadow: false });
      }
    }
    world.label('PLAY • PAUSE • REPEAT', -12.0, 2.65, 14.15, 4.6, 0.45, '#fff0e1', '#8a6570', { rotationY: Math.PI });
    world.label('GAMER WATER BAR', 10.5, 2.35, -14.12, 3.8, 0.38, '#fff0e1', '#8a6570');
    // Compact water dispenser.
    world.box(10.5, 0.82, -13.55, 1.15, 1.65, 0.95, '#d9e2d8', { rounded: true, roughness: 0.38, metalness: 0.22, solid: { sx: 0.575, sy: 0.825, sz: 0.475 } });
    world.box(10.5, 1.72, -13.55, 1.2, 0.16, 1.0, '#9dbab1', { rounded: true, roughness: 0.32, metalness: 0.24, solid: { sx: 0.6, sy: 0.08, sz: 0.5 } });
    world.box(10.5, 0.59, -13.03, 0.78, 0.08, 0.14, '#527c77', { rounded: true });
    world.cylinder(10.5, 0.72, -12.87, 0.29, 0.22, 0.15, '#bcdedc', { rotation: { x: Math.PI / 2, y: 0, z: 0 }, castShadow: false });

    // Gather birthday pixels, a PS-style pad, a voxel heart and cubic plants on the center rug.
    buildVoxelBirthdayCenter(world);

    // Cozy pastel birthday set and its in-world pressure plate are part of the room, not the HUD.
    const giftInteraction = buildCozyPastelRoom(world);
    if (giftInteraction) world.roomInteractions.push(giftInteraction);
  
}

export function buildLighting(world) {
    // Light-colored wall sconces and brass detail rings are decorative emissive surfaces.
    for (const side of [-1, 1]) for (const z of [-12, -4, 4, 12]) {
      // Remove legacy wall sconces behind both the old and corrected portal locations.
      if (side === -1 && LEFT_WALL_PORTAL_CLEARANCE_ZS.some(doorZ => Math.abs(z - doorZ) < 1.15)) continue;
      world.box(side * 20.6, 2.42, z, 0.18, 0.62, 0.36, '#f5e4bd', { rounded: true, castShadow: false });
      world.sphere(side * 20.48, 2.45, z, 0.06, 0.17, 0.13, '#fff5d7', { castShadow: false });
    }
  
}
