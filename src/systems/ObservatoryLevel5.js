import * as THREE from 'three';
import { LEVEL_FIVE_PARKOUR } from '../Level/level-5.js';
import album0Asset from '../world/skin/object/album0.webp';
import album1Asset from '../world/skin/object/album1.webp';
import album3Asset from '../world/skin/object/album3.webp';

const FLOOR_Y = 0.42;
const MEMORY_BLOCK_NAMES = [
  'MemoryCube01', 'MemoryCube02', 'MemoryCube03',
  'MemoryCube04', 'MemoryCube05', 'MemoryCube06',
  'MemoryCube07', 'MemoryCube08', 'MemoryCube09'
];
const COLLAPSE_WARNING_SECONDS = 0.40;
const HIDDEN_SECONDS = 2.35;
const RESTORE_SECONDS = 0.34;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function addPhotoGallery({ group }) {
  const assets = [album0Asset, album1Asset, album3Asset];
  const loader = new THREE.TextureLoader();
  const textures = assets.map((asset) => {
    const texture = loader.load(asset, (loaded) => {
      // Album art is wall decoration, so cap GPU texture dimensions at 512 px.
      // Keep aspect ratio and mipmaps to avoid shimmer when the camera moves away.
      try {
        const image = loaded.image;
        const width = Number(image?.width) || 0;
        const height = Number(image?.height) || 0;
        const largest = Math.max(width, height);
        if (largest > 512 && typeof document !== 'undefined') {
          const scale = 512 / largest;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const context = canvas.getContext('2d', { alpha: false });
          if (context) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            loaded.image = canvas;
            loaded.needsUpdate = true;
          }
        }
      } catch (error) {
        console.warn('[RDS] Album texture downscale skipped:', error);
      }
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 1;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    group.userData.disposeTextures.push(texture);
    return texture;
  });

  // One shared geometry/material per frame part. Instancing turns 9 x 6 meshes
  // into only five draw calls (back, frame border, and three album-image batches).
  const backGeometry = new THREE.BoxGeometry(1.42, 1.72, 0.13);
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-0.75, -0.875);
  frameShape.lineTo(0.75, -0.875);
  frameShape.lineTo(0.75, 0.875);
  frameShape.lineTo(-0.75, 0.875);
  frameShape.closePath();
  const frameHole = new THREE.Path();
  frameHole.moveTo(-0.59, -0.71);
  frameHole.lineTo(-0.59, 0.71);
  frameHole.lineTo(0.59, 0.71);
  frameHole.lineTo(0.59, -0.71);
  frameHole.closePath();
  frameShape.holes.push(frameHole);
  const frameGeometry = new THREE.ShapeGeometry(frameShape);
  const photoGeometry = new THREE.PlaneGeometry(1.18, 1.42);

  const backMaterial = new THREE.MeshStandardMaterial({
    color: '#8d776f',
    roughness: 0.82,
    metalness: 0.04,
    flatShading: true
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: '#e7c68f',
    roughness: 0.68,
    metalness: 0.12,
    flatShading: true,
    side: THREE.FrontSide
  });
  const photoMaterials = textures.map((map) => new THREE.MeshBasicMaterial({
    map,
    side: THREE.FrontSide,
    toneMapped: false
  }));

  const backs = new THREE.InstancedMesh(backGeometry, backMaterial, 9);
  backs.name = 'MemoryGallery-PhotoBacks';
  const frames = new THREE.InstancedMesh(frameGeometry, frameMaterial, 9);
  frames.name = 'MemoryGallery-PhotoFrameBorders';
  const photos = photoMaterials.map((material, index) => {
    const mesh = new THREE.InstancedMesh(photoGeometry, material, 3);
    mesh.name = 'MemoryGallery-AlbumBatch-' + index;
    return mesh;
  });
  const photoCounts = [0, 0, 0];

  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const quaternion = new THREE.Quaternion();
  const frameMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();

  const placements = [
    [-5.0, -31.4, -1], [5.0, -29.5, 1], [-5.0, -27.6, -1],
    [5.0, -25.7, 1], [-5.0, -23.8, -1], [5.0, -21.9, 1],
    [-5.0, -20.0, -1], [5.0, -18.1, 1], [-5.0, -16.2, -1]
  ];

  placements.forEach(([x, z, side], index) => {
    position.set(x, 1.78, z);
    quaternion.setFromEuler(new THREE.Euler(0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0));
    frameMatrix.compose(position, quaternion, scale);

    backs.setMatrixAt(index, frameMatrix);

    localMatrix.makeTranslation(0, 0, 0.09);
    worldMatrix.multiplyMatrices(frameMatrix, localMatrix);
    frames.setMatrixAt(index, worldMatrix);

    const textureIndex = index % photos.length;
    localMatrix.makeTranslation(0, 0, 0.073);
    worldMatrix.multiplyMatrices(frameMatrix, localMatrix);
    photos[textureIndex].setMatrixAt(photoCounts[textureIndex]++, worldMatrix);
  });

  for (const mesh of [backs, frames, ...photos]) {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  group.userData.disposeGeometries.push(backGeometry, frameGeometry, photoGeometry);
  group.userData.disposeMaterials.push(backMaterial, frameMaterial, ...photoMaterials);
}

function addTeleportDirectionArrows({ group }) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.12, -0.46);
  shape.lineTo(0.12, -0.46);
  shape.lineTo(0.12, 0.08);
  shape.lineTo(0.29, 0.08);
  shape.lineTo(0, 0.52);
  shape.lineTo(-0.29, 0.08);
  shape.lineTo(-0.12, 0.08);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({
    color: '#f5d98b',
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false
  });
  group.userData.disposeGeometries.push(geometry);
  group.userData.disposeMaterials.push(material);

  const from = { x: 2.35, z: -6.42 };
  const to = { x: 0.0, z: -2.48 };
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const arrows = [];

  for (const t of [0.20, 0.50, 0.80]) {
    const arrow = new THREE.Mesh(geometry, material);
    arrow.name = 'GalleryTP-FloorDirectionArrow-' + arrows.length;
    arrow.rotation.set(Math.PI * 0.5, yaw, 0);
    arrow.position.set(
      THREE.MathUtils.lerp(from.x, to.x, t),
      FLOOR_Y + 0.026,
      THREE.MathUtils.lerp(from.z, to.z, t)
    );
    arrow.castShadow = false;
    arrow.receiveShadow = false;
    group.add(arrow);
    arrows.push(arrow);
  }

  return arrows;
}

function setBodyCollidersEnabled(body, enabled) {
  if (!body || typeof body.numColliders !== 'function' || typeof body.collider !== 'function') return 0;
  let changed = 0;
  try {
    const count = body.numColliders();
    for (let index = 0; index < count; index++) {
      const collider = body.collider(index);
      if (!collider) continue;
      collider.setEnabled(Boolean(enabled));
      changed++;
    }
  } catch (error) {
    console.warn('[RDS] Memory Gallery collider update skipped:', error);
    return 0;
  }
  return changed;
}

function buildWeightSwitchAndTeleportPad({ group, box, solids }) {
  const crateSize = 0.96;
  const crateStart = { x: -2.75, y: FLOOR_Y + crateSize * 0.5, z: -7.15 };
  const crate = new THREE.Group();
  crate.name = 'Level5-GalleryPowerCrate';
  crate.position.set(crateStart.x, crateStart.y, crateStart.z);
  group.add(crate);

  box('GalleryPowerCrate-Core', 0, 0, 0, crateSize, crateSize, crateSize,
    '#a96f50', false, 0.04, crate);
  for (const y of [-0.31, 0, 0.31]) {
    box('GalleryPowerCrate-Rail-' + y, 0, y, -crateSize * 0.51,
      crateSize, 0.075, 0.055, '#e0b27c', false, 0.12, crate);
    box('GalleryPowerCrate-SideRail-' + y, crateSize * 0.51, y, 0,
      0.055, 0.075, crateSize, '#e0b27c', false, 0.12, crate);
  }
  const braceA = box('GalleryPowerCrate-BraceA', 0, 0, -crateSize * 0.54,
    0.09, 0.76, 0.035, '#f0ce9b', false, 0.14, crate);
  braceA.rotation.z = 0.54;
  const braceB = box('GalleryPowerCrate-BraceB', 0, 0, -crateSize * 0.545,
    0.09, 0.76, 0.035, '#f0ce9b', false, 0.14, crate);
  braceB.rotation.z = -0.54;

  const crateProp = {
    id: 'level5-gallery-power-crate',
    name: 'Gallery weight cube',
    group: crate,
    origin: { ...crateStart },
    spawnLift: 0,
    mass: 3.6,
    gravityScale: 1,
    linearDamping: 1.05,
    angularDamping: 4.2,
    friction: 0.94,
    restitution: 0.018,
    ccdEnabled: true,
    canSleep: true,
    interactionRadius: 1.35,
    interactionHeight: 1.45,
    kickFactor: 0.68,
    maxImpulse: 3.8,
    interactionCooldown: 0.08
  };
  solids.push({
    x: crateStart.x, y: crateStart.y, z: crateStart.z,
    sx: crateSize * 0.5, sy: crateSize * 0.5, sz: crateSize * 0.5,
    dynamicProp: crateProp
  });

  const switchPoint = { x: 2.72, z: -7.15 };
  const switchRoot = new THREE.Group();
  switchRoot.name = 'Level5-GalleryPressureSwitch';
  switchRoot.position.set(switchPoint.x, FLOOR_Y, switchPoint.z);
  group.add(switchRoot);
  box('GalleryPressureSwitch-Base', 0, 0.02, 0,
    1.78, 0.04, 1.78, '#566b83', false, 0.22, switchRoot);
  const switchPlate = box('GalleryPressureSwitch-Plate', 0, 0.055, 0,
    1.48, 0.035, 1.48, '#e0b86e', false, 0.28, switchRoot);
  switchPlate.material.emissive.set('#77572d');
  switchPlate.material.emissiveIntensity = 0.18;
  box('GalleryPressureSwitch-Mark', 0, 0.079, 0,
    0.80, 0.012, 0.80, '#fff1c5', false, 0.18, switchRoot);

  // Static teleport pad: no moving body, no elevator motor, and no kinematic state.
  // Its fixed collider stays at FLOOR_Y while the trigger moves K-09 to the upper deck.
  const teleportCenter = { x: 0, y: FLOOR_Y - 0.15, z: -0.55 };
  const teleportPad = new THREE.Group();
  teleportPad.name = 'Level5-GalleryTeleportPad';
  teleportPad.position.set(teleportCenter.x, teleportCenter.y, teleportCenter.z);
  group.add(teleportPad);

  box('GalleryTeleportPad-Platform', 0, 0, 0,
    3.85, 0.30, 3.30, '#486f89', false, 0.30, teleportPad);
  const teleportDeck = box('GalleryTeleportPad-Deck', 0, 0.165, 0,
    3.48, 0.035, 2.94, '#70d9d5', false, 0.22, teleportPad);
  teleportDeck.material.emissive.set('#1a777e');
  teleportDeck.material.emissiveIntensity = 0.46;
  box('GalleryTeleportPad-Core', 0, 0.19, 0,
    1.52, 0.018, 1.52, '#b6fff0', false, 0.24, teleportPad);
  box('GalleryTeleportPad-CoreGlow', 0, 0.205, 0,
    0.82, 0.012, 0.82, '#f4ffff', false, 0.26, teleportPad);

  for (const x of [-1.72, 1.72]) {
    for (const z of [-1.42, 1.42]) {
      box('GalleryTeleportPad-Post-' + x + '-' + z, x, 0.47, z,
        0.13, 0.94, 0.13, '#b8a8dc', false, 0.26, teleportPad);
      box('GalleryTeleportPad-Light-' + x + '-' + z, x, 0.98, z,
        0.22, 0.09, 0.22, '#a6fff0', false, 0.32, teleportPad);
    }
  }

  const teleportPadState = {
    x: teleportCenter.x,
    z: teleportCenter.z,
    top: FLOOR_Y,
    width: 3.85,
    depth: 3.30,
    powered: false,
    triggered: false,
    destination: { x: 0.2, y: 6.825, z: 2.8, yaw: Math.PI }
  };
  teleportPad.userData.teleportPad = teleportPadState;

  // This collider belongs to the fixed body, so the pad can never drift or desync.
  solids.push({
    x: teleportCenter.x,
    y: teleportCenter.y,
    z: teleportCenter.z,
    sx: teleportPadState.width * 0.5,
    sy: 0.15,
    sz: teleportPadState.depth * 0.5
  });

  const floorArrows = addTeleportDirectionArrows({ group });

  return {
    crate,
    crateId: crateProp.id,
    crateStart: { ...crateStart },
    crateCenterY: crateStart.y,
    crateHalfSize: crateSize * 0.5,
    crateTarget: { x: switchPoint.x, z: switchPoint.z },
    crateSolved: false,
    pressurePressed: false,
    pressureElapsed: 0,
    pressureReleaseElapsed: 0,
    pressureDelaySeconds: 0.45,
    pressureReleaseSeconds: 0.80,
    pressureVisualPressed: false,
    floorArrows,
    switchRoot,
    switchPlate,
    teleportPad,
    teleportPadState
  };
}

export function buildObservatoryLevel5({ group, box, solids }) {
  group.userData.disposeTextures = group.userData.disposeTextures || [];
  group.userData.disposeMaterials = group.userData.disposeMaterials || [];
  group.userData.disposeGeometries = group.userData.disposeGeometries || [];
  group.userData.disposed = false;

  addPhotoGallery({ group, box });
  const machine = buildWeightSwitchAndTeleportPad({ group, box, solids });

  return {
    type: 'observatory',
    completed: false,
    phase: 'gallery',
    exit: { x: 0, z: -13.2, y: FLOOR_Y },
    highExit: { x: LEVEL_FIVE_PARKOUR.finishTrigger.x, z: LEVEL_FIVE_PARKOUR.finishTrigger.z, y: 11.56 },
    blocks: MEMORY_BLOCK_NAMES.map((name) => ({
      name,
      id: 'level5-moving-platform-' + name,
      state: 'ready',
      elapsed: 0,
      armed: true,
      triggered: false,
      colliderEnabled: true
    })),
    ...machine,
    galleryPassed: false
  };
}

function updateMemoryGallery(system, gallery, position, dt, grounded) {
  let readyRecords = 0;
  let triggeredCount = 0;

  for (const block of gallery.blocks) {
    const record = system.activePhysics?.dynamicPropsById?.get(block.id);
    if (!record?.body || !record.group) continue;
    readyRecords++;

    const motion = record.group.userData?.boardMotion;
    const blockX = record.group.position.x;
    const blockZ = record.group.position.z;
    const top = Number.isFinite(motion?.top) ? motion.top : 1.19;
    const width = Number.isFinite(motion?.width) ? motion.width : 1.12;
    const depth = Number.isFinite(motion?.spanZ) ? motion.spanZ : 1.12;
    const inside = Math.abs(position.x - blockX) <= width * 0.5 + 0.12
      && Math.abs(position.z - blockZ) <= depth * 0.5 + 0.12;

    if (!inside) block.armed = true;

    if (block.state === 'ready' && block.armed && inside && grounded
      && Math.abs(position.y - top) <= 0.38) {
      block.armed = false;
      block.triggered = true;
      block.state = 'warning';
      block.elapsed = 0;
    }

    if (block.state === 'warning') {
      block.elapsed += dt;
      const fade = clamp01(block.elapsed / COLLAPSE_WARNING_SECONDS);
      record.group.scale.y = 1 - fade * 0.82;
      if (block.elapsed >= COLLAPSE_WARNING_SECONDS) {
        const disabled = setBodyCollidersEnabled(record.body, false);
        if (disabled > 0) {
          block.colliderEnabled = false;
          record.group.visible = false;
          record.group.scale.y = 1;
          block.state = 'hidden';
          block.elapsed = 0;
        } else {
          block.state = 'ready';
          block.elapsed = 0;
          block.armed = false;
          record.group.scale.y = 1;
        }
      }
    } else if (block.state === 'hidden') {
      block.elapsed += dt;
      if (block.elapsed >= HIDDEN_SECONDS) {
        record.group.visible = true;
        record.group.scale.y = 0.08;
        block.state = 'restoring';
        block.elapsed = 0;
      }
    } else if (block.state === 'restoring') {
      block.elapsed += dt;
      record.group.scale.y = 0.08 + 0.92 * clamp01(block.elapsed / RESTORE_SECONDS);
      if (block.elapsed >= 0.12 && !block.colliderEnabled) {
        if (setBodyCollidersEnabled(record.body, true) > 0) block.colliderEnabled = true;
      }
      if (block.elapsed >= RESTORE_SECONDS && block.colliderEnabled) {
        record.group.scale.y = 1;
        block.state = 'ready';
        block.elapsed = 0;
      }
    }

    if (block.triggered) triggeredCount++;
  }

  if (readyRecords !== gallery.blocks.length) {
    system.setPrompt('MEMORY GALLERY: menyelaraskan sembilan kubus (' +
      readyRecords + '/' + gallery.blocks.length + '). Tetap di dek awal.');
    return false;
  }

  const exit = gallery.exit;
  const atExit = Math.abs(position.x - exit.x) <= 2.45
    && Math.abs(position.z - exit.z) <= 2.15
    && grounded
    && Math.abs(position.y - exit.y) <= 0.42;
  // The switch deck is the next physical area after the gallery. Once all nine
  // memory blocks are cleared, accept a grounded arrival anywhere on that deck
  // as well as the narrow exit marker so the crate puzzle cannot remain phase-locked.
  const atPuzzleDeck = Math.abs(position.x) <= 5.15
    && Math.abs(position.z + 7.0) <= 4.05
    && grounded
    && Math.abs(position.y - FLOOR_Y) <= 0.48;

  if (triggeredCount === gallery.blocks.length && (atExit || atPuzzleDeck)) {
    gallery.galleryPassed = true;
    gallery.phase = 'switchPuzzle';
    system.setPrompt('Sembilan kenangan terkumpul. Dorong kubus kayu berat ke pressure plate emas untuk mengaktifkan TP Pad di depan.');
    return true;
  }

  if (triggeredCount === gallery.blocks.length) {
    system.setPrompt('MEMORY GALLERY: 9/9 kubus dilewati. Turun ke dek keluar galeri.');
  } else {
    system.setPrompt('MEMORY GALLERY: lewati sembilan kubus penuh. Kubus runtuh sesaat setelah diinjak dan pulih kembali. Terlewati ' +
      triggeredCount + '/9.');
  }
  return true;
}

function updateWeightSwitch(system, gallery, dt, quiet = false) {
  const puzzle = gallery;
  const teleport = puzzle.teleportPadState;
  const record = system.activePhysics?.dynamicPropsById?.get(puzzle.crateId);
  const body = record?.body;
  let pressureCandidate = false;
  let distance = Infinity;
  let escaped = false;
  let point = null;

  // Rapier is authoritative when available. The visual transform is a safe fallback
  // for the short frame in which a dynamic body is being registered or restored.
  try {
    point = body?.translation?.() || puzzle.crate?.position || null;
  } catch {
    point = puzzle.crate?.position || null;
  }

  if (point && [point.x, point.y, point.z].every(Number.isFinite)) {
    const minSafeY = puzzle.crateCenterY - 0.34;
    escaped = point.y < minSafeY
      || Math.abs(point.x) > 4.98
      || point.z < -10.75
      || point.z > -3.25;

    if (escaped && body) {
      try {
        body.setTranslation(puzzle.crateStart, true);
        body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setGravityScale(1, true);
        body.wakeUp();
        puzzle.crate.position.set(puzzle.crateStart.x, puzzle.crateStart.y, puzzle.crateStart.z);
        point = puzzle.crateStart;
      } catch (error) {
        console.warn('[RDS] Level 5 weight cube reset skipped:', error);
      }
    }

    if (!escaped) {
      const target = puzzle.switchRoot?.position || puzzle.crateTarget;
      const dx = point.x - target.x;
      const dz = point.z - target.z;
      distance = Math.hypot(dx, dz);

      // Detect actual footprint overlap, not just the crate's centre. The old
      // centre-only 0.76 m gate could miss a cube visibly resting on the plate.
      const crateHalf = Number.isFinite(puzzle.crateHalfSize) ? puzzle.crateHalfSize : 0.48;
      const plateHalfX = 0.74;
      const plateHalfZ = 0.74;
      // Use a true footprint-overlap envelope with a little tolerance for Rapier
      // settling/rotation. The former contracted range could reject a crate that was
      // visibly resting on the outer part of the gold plate.
      const pressReachX = plateHalfX + crateHalf + 0.18;
      const pressReachZ = plateHalfZ + crateHalf + 0.18;
      const holdReachX = pressReachX + 0.22;
      const holdReachZ = pressReachZ + 0.22;
      const plateY = Number.isFinite(puzzle.switchRoot?.position?.y)
        ? puzzle.switchRoot.position.y + 0.073
        : FLOOR_Y + 0.073;
      const crateBottom = point.y - crateHalf;
      const crateTop = point.y + crateHalf;
      // Test the crate volume against the plate's vertical band, not against its
      // original spawn height. This stays valid when the crate settles or tips.
      const heightReady = crateTop >= plateY - 0.16
        && crateBottom <= plateY + 0.72;
      const pressZone = Math.abs(dx) <= pressReachX
        && Math.abs(dz) <= pressReachZ
        && heightReady;
      const holdZone = Math.abs(dx) <= holdReachX
        && Math.abs(dz) <= holdReachZ
        && heightReady;
      pressureCandidate = puzzle.pressurePressed ? holdZone : pressZone;
    }
  }

  if (pressureCandidate) {
    puzzle.pressurePressed = true;
    puzzle.pressureReleaseElapsed = 0;
    puzzle.pressureElapsed = Math.min(
      puzzle.pressureDelaySeconds,
      (puzzle.pressureElapsed || 0) + dt
    );
  } else {
    puzzle.pressureReleaseElapsed = (puzzle.pressureReleaseElapsed || 0) + dt;
    if (puzzle.pressureReleaseElapsed >= puzzle.pressureReleaseSeconds) {
      puzzle.pressurePressed = false;
      puzzle.pressureElapsed = 0;
    }
  }

  const pressureActive = puzzle.pressurePressed === true;
  const pressureConditionMet = pressureActive
    && puzzle.pressureElapsed >= puzzle.pressureDelaySeconds;

  // Power is latched once: the crate may settle or roll away after activation.
  if (pressureConditionMet) teleport.powered = true;
  const activated = teleport.powered === true;

  if (teleport.visualPowered !== activated) {
    teleport.visualPowered = activated;
    const deck = gallery.teleportPad?.getObjectByName('GalleryTeleportPad-Deck');
    const core = gallery.teleportPad?.getObjectByName('GalleryTeleportPad-CoreGlow');
    if (deck?.material?.emissive) {
      deck.material.emissive.set(activated ? '#39ffe0' : '#1a777e');
      deck.material.emissiveIntensity = activated ? 1.15 : 0.46;
    }
    if (core?.material?.emissive) {
      core.material.emissive.set(activated ? '#7affee' : '#b6fff0');
      core.material.emissiveIntensity = activated ? 1.35 : 0.25;
    }
  }

  // The pressure plate is a physical trigger, not a reward gated by K-09's
  // gallery position, grounded state, or Memory Gallery progress. Once powered,
  // it can move the level directly into the teleport interaction phase.
  if (activated && (gallery.phase === 'gallery' || gallery.phase === 'switchPuzzle')) {
    gallery.phase = 'teleportReady';
  }

  const targetPlateY = pressureActive ? 0.005 : 0.055;
  puzzle.switchPlate.position.y = THREE.MathUtils.damp(
    puzzle.switchPlate.position.y,
    targetPlateY,
    pressureActive ? 24 : 16,
    dt
  );

  if (puzzle.pressureVisualPressed !== pressureActive) {
    puzzle.pressureVisualPressed = pressureActive;
    puzzle.switchPlate.material.color.set(pressureActive ? '#8df2d6' : '#e0b86e');
    puzzle.switchPlate.material.emissive.set(pressureActive ? '#36b99a' : '#77572d');
    puzzle.switchPlate.material.emissiveIntensity = pressureActive ? 0.85 : 0.18;
    if (puzzle.switchRoot?.userData) {
      puzzle.switchRoot.userData.pressurePressed = pressureActive;
    }
  }

  if (!quiet) {
    if (escaped) {
      system.setPrompt('Kubus keluar dari dek tekanan dan kembali ke titik awal. Dorong lagi ke tombol emas.');
    } else if (!record?.body && !point) {
      system.setPrompt('PRESSURE SWITCH: fisika kubus sedang disiapkan. Tetap di dek mekanisme.');
    } else if (!activated && !pressureCandidate) {
      system.setPrompt('PUZZLE FISIKA: tumpangkan kubus kayu pada tombol emas. Jarak ke tombol ' +
        distance.toFixed(1) + ' m. Tahan sampai pelat berubah hijau.');
    } else if (!activated) {
      const remaining = Math.max(0, puzzle.pressureDelaySeconds - puzzle.pressureElapsed);
      system.setPrompt('PRESSURE PLATE TERTEKAN: tahan kubus di tombol. Daya aktif dalam ' +
        remaining.toFixed(1) + ' detik.');
    } else {
      system.setPrompt('TOMBOL TEKANAN AKTIF! TP Pad sekarang mendapat daya. Injak platform biru bercahaya.');
    }
  }

  return { pressureActive, activated, pressureCandidate };
}

function updateObservatoryXTemporaryPlatforms(system, position, dt, grounded) {
  const platforms = LEVEL_FIVE_PARKOUR.platforms;
  const step = Math.min(0.05, Math.max(0, Number(dt) || 0));

  for (const platform of platforms) {
    if (platform.temporary !== true) continue;
    const id = 'level5-moving-platform-' + platform.name;
    const record = system.activePhysics?.dynamicPropsById?.get(id);
    const board = record?.group;
    const motion = board?.userData?.boardMotion;
    if (!record?.body || !board || !motion) continue;

    if (!motion.temporaryState) {
      motion.temporaryState = 'ready';
      motion.temporaryElapsed = 0;
      motion.temporaryCollidersEnabled = true;
    }

    const inside = Math.abs(position.x - board.position.x) <= platform.width * 0.5 + 0.12
      && Math.abs(position.z - board.position.z) <= platform.depth * 0.5 + 0.12;
    const footSupported = (system.game.dog?.footContacts || []).some((contact) =>
      contact?.hasSurface === true
      && contact.blocked !== true
      && Number.isFinite(contact.currentY)
      && Math.abs(contact.currentY - platform.top) <= 0.30
    );
    const standing = inside
      && (grounded || footSupported)
      && Math.abs(position.y - platform.top) <= 0.38;

    if (motion.temporaryState === 'ready' && standing) {
      motion.temporaryState = 'warning';
      motion.temporaryElapsed = 0;
    }

    if (motion.temporaryState === 'warning') {
      motion.temporaryElapsed += step;
      const warning = Math.max(0.28, Number(platform.temporaryWarningSeconds) || 0.52);
      const progress = clamp01(motion.temporaryElapsed / warning);
      board.scale.y = Math.max(0.12, 1 - progress * 0.88);

      if (motion.temporaryElapsed >= warning) {
        const disabled = setBodyCollidersEnabled(record.body, false);
        if (disabled > 0) {
          motion.temporaryCollidersEnabled = false;
          board.visible = false;
          board.scale.y = 1;
          motion.temporaryState = 'hidden';
          motion.temporaryElapsed = 0;
        }
      }
    } else if (motion.temporaryState === 'hidden') {
      motion.temporaryElapsed += step;
      const hidden = Math.max(0.75, Number(platform.temporaryHiddenSeconds) || 1.65);
      if (motion.temporaryElapsed >= hidden) {
        board.visible = true;
        board.scale.y = 0.10;
        motion.temporaryState = 'restoring';
        motion.temporaryElapsed = 0;
      }
    } else if (motion.temporaryState === 'restoring') {
      motion.temporaryElapsed += step;
      const restore = Math.max(0.20, Number(platform.temporaryRestoreSeconds) || 0.32);
      const progress = clamp01(motion.temporaryElapsed / restore);
      board.scale.y = 0.10 + progress * 0.90;

      if (!motion.temporaryCollidersEnabled && progress >= 0.70) {
        if (setBodyCollidersEnabled(record.body, true) > 0) {
          motion.temporaryCollidersEnabled = true;
        }
      }
      if (motion.temporaryElapsed >= restore && motion.temporaryCollidersEnabled) {
        board.scale.y = 1;
        motion.temporaryState = 'ready';
        motion.temporaryElapsed = 0;
      }
    }
  }
}

export function updateObservatoryLevel5(system, level, position, dt) {
  const gallery = system.special;
  if (!gallery) return false;
  if (gallery.phase !== 'teleportReady') {
    system.game.inventory?.setTeleportInteractActive?.(false);
  }
  if (gallery.completed) return false;

  const step = Math.min(0.05, Math.max(0, Number(dt) || 0));
  const movement = system.game.movement;
  const dog = system.game.dog;
  const grounded = movement?.grounded === true
    || dog?.grounded === true
    || (dog?.footContacts || []).some((contact) =>
      contact?.hasSurface === true && contact.blocked !== true
    );

  // Run the crate sensor while the level is still in Memory Gallery. This is
  // deliberately independent of K-09 position/grounded checks and of the
  // gallery's memory-block completion gate. A crate already resting on the plate
  // can therefore power the pad without waiting for a phase transition.
  if (gallery.phase === 'gallery') {
    updateWeightSwitch(system, gallery, step, true);
  }

  if (gallery.phase === 'gallery') {
    return updateMemoryGallery(system, gallery, position, step, grounded);
  }

  if (gallery.phase === 'switchPuzzle') {
    updateWeightSwitch(system, gallery, step);
    return true;
  }

  if (gallery.phase === 'teleportReady') {
    updateWeightSwitch(system, gallery, step, true);
    const pad = gallery.teleportPadState;
    if (!pad?.powered) {
      system.game.inventory?.setTeleportInteractActive?.(false);
      gallery.phase = 'switchPuzzle';
      system.setPrompt('TP PAD belum mendapat daya. Aktifkan pressure plate terlebih dahulu.');
      return true;
    }

    const validPosition = [position.x, position.y, position.z].every(Number.isFinite);
    const verticalDistance = validPosition ? Math.abs(position.y - pad.top) : Infinity;
    const insidePad = validPosition
      && Math.abs(position.x - pad.x) <= pad.width * 0.5 + 0.16
      && Math.abs(position.z - pad.z) <= pad.depth * 0.5 + 0.16;
    const standingOnPad = insidePad && verticalDistance <= 2.25;

    // The pad is a proximity trigger only. Its power must come from the
    // pressure-switch puzzle; no HUD button or interact input can activate it.
    if (standingOnPad && !pad.triggered) {
      pad.triggered = true;
      system.game.inventory?.setTeleportInteractActive?.(false);
      const destination = pad.destination || {
        x: 0.2, y: 6.825, z: 2.8, yaw: Math.PI
      };

      // One-shot teleport: move the visual root and Rapier character body together.
      // Reset render snapshots so interpolation never draws a streak across the arena.
      system.moveDogTo(destination, system.activePhysics);
      system.parkourRespawnPoint = {
        x: destination.x,
        y: destination.y + 0.025,
        z: destination.z,
        yaw: Number.isFinite(destination.yaw) ? destination.yaw : Math.PI
      };
      system.game.resetRenderPositionSnapshots?.();
      gallery.phase = 'highParkour';
      system.startLevel5RouteCinematic?.(destination);
      system.setPrompt('TELEPORT BERHASIL! K-09 tiba di dek menara. Checkpoint atas aktif, lanjutkan parkour menuju FINISH.');
      return true;
    }

    system.setPrompt('TP PAD AKTIF! Masuk dan berdiri di atas platform biru bercahaya untuk teleport otomatis.');
    return true;
  }

  if (gallery.phase === 'highParkour') {
    updateWeightSwitch(system, gallery, step, true);
    updateObservatoryXTemporaryPlatforms(
      system,
      position,
      step,
      system.game.movement?.grounded === true || system.game.dog?.grounded === true
    );
    const exit = gallery.highExit;
    const atExit = Math.abs(position.x - exit.x) <= 4.05
      && Math.abs(position.z - exit.z) <= 2.35
      && grounded
      && Math.abs(position.y - exit.y) <= 0.48;
    if (atExit) {
      gallery.completed = true;
      gallery.phase = 'complete';
      const plate = system.activeArena?.userData?.finishPressurePlate;
      if (plate) plate.visible = true;
      system.setPrompt('OBSERVATORY X DITAKLUKKAN! Injak PRESSURE PLATE FINISH untuk menuntaskan Level 5.');
      return false;
    }

    system.setPrompt('OBSERVATORY X: lintasan zig-zag 135 meter. Lewati 20 papan presisi, dua jembatan keseimbangan, arena rotor holografik, lalu panjat tiga balok prisma menuju dek FINISH.');
    return true;
  }

  return true;
}