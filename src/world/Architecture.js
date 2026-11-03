import { PALETTE } from './palette.js';
import { LEFT_WALL_PORTAL_CLEARANCE_ZS } from './LevelAnchors.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import carpetTextureUrl from './skin/object/carpet.jpg';
import wallTextureUrl from './skin/object/dinding.webp';
// Architecture textures currently use JPG assets. WebP can be introduced later without binary KTX2 imports.
const architectureTextureLoader = new THREE.TextureLoader();
const architectureTextureCache = new WeakMap();

function applyArchitectureTexture(world, mesh, key, url, repeatX, repeatY) {
    if (!mesh?.isMesh || !world?.assets?.resources) return;
    let cache = architectureTextureCache.get(world);
    if (!cache) {
        cache = new Map();
        architectureTextureCache.set(world, cache);
    }
    let state = cache.get(key);
    if (!state) {
        state = { materials: [], texture: null };
        const texture = architectureTextureLoader.load(url, undefined, undefined, () => {
            console.warn(`Shelter JPG texture failed to load (${key}); retaining the original material color.`);
            for (const entry of state.materials) {
                if (entry.material.map === texture) {
                    entry.material.map = null;
                    entry.material.color.copy(entry.fallbackColor);
                    entry.material.needsUpdate = true;
                }
            }
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = 2;
        state.texture = texture;
        cache.set(key, state);
        world.assets.resources.add(texture);
    }

    const sourceMaterial = mesh.material;
    if (!sourceMaterial?.isMeshStandardMaterial) return;
    const material = sourceMaterial.clone();
    const fallbackColor = sourceMaterial.color?.clone?.() ?? new THREE.Color(0xffffff);
    material.color.set(0xffffff);
    material.map = state.texture;
    material.needsUpdate = true;
    mesh.material = material;
    state.materials.push({ material, fallbackColor });
}

// Procedural architecture: floor, enclosure, architectural glazing, roof structure, and named play zones.
export function buildFloor(world) {
    const baseFloor = world.box(0, -0.15, 0, 43, 0.3, 31, PALETTE.floorA, { castShadow: false, receiveShadow: false, roughness: 0.96 });
    baseFloor.name = 'ShelterBaseFloor';
    baseFloor.userData.popClaySurface = 'base-floor';
    const tileGeo = world.geometry('floor-tile', () => new RoundedBoxGeometry(1.88, 0.075, 1.88, 3, 0.022));
    const tileMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.floorB, roughness: 0.94, metalness: 0, flatShading: true, side: THREE.FrontSide });
    const tiles = new THREE.InstancedMesh(tileGeo, tileMaterial, 21 * 15);
    tiles.name = 'MainCandyPlatformTiles';
    tiles.userData.popClaySurface = 'platform';
    const dummy = new THREE.Object3D(); const color = new THREE.Color(); let i = 0;
    for (let x = -20.5; x <= 20.5; x += 2) for (let z = -14.5; z <= 14.5; z += 2) {
      dummy.position.set(x, 0.04, z); dummy.updateMatrix(); tiles.setMatrixAt(i, dummy.matrix);
      const isWarm = ((Math.round((x + 20.5) / 2) + Math.round((z + 14.5) / 2)) % 2) === 0;
      color.set(isWarm ? PALETTE.floorA : PALETTE.floorB);
      if (world.random() > 0.91) color.lerp(new THREE.Color('#d9e8d6'), 0.38);
      tiles.setColorAt(i++, color);
    }
    tiles.count = i; tiles.instanceMatrix.needsUpdate = true; if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    tiles.receiveShadow = true; tiles.castShadow = false; world.root.add(tiles);
    // A full central rug overlay hides tile seams and sits just above the tile tops.
    // Both layers are visual-only so they cannot introduce invisible steps into the dog's movement.
    const carpetBacking = world.box(0, 0.0805, 1, 12.15, 0.006, 16.15, '#ff91c4', { castShadow: false, receiveShadow: false, collidable: false });
    carpetBacking.name = 'CentralCarpetBacking';
    carpetBacking.userData.popClaySurface = 'central-carpet-backing';
    // The rug is a broad textured surface; it does not need per-pixel shadow sampling on mobile.
    const centralCarpet = world.box(0, 0.0855, 1, 12.0, 0.004, 16.0, '#ffc4e0', { castShadow: false, receiveShadow: false, roughness: 0.97, collidable: false });
    centralCarpet.name = 'CentralCarpetSurface';
    // One shared, mipmapped JPG texture keeps the central rug textured without adding geometry or draw-call layers.
    applyArchitectureTexture(world, centralCarpet, 'carpet', carpetTextureUrl, 4, 16 / 3);
    centralCarpet.userData.popClaySurface = 'central-carpet';
    for (let z = -12; z <= 13; z += 5) {
      world.box(-5.7, 0.09, z, 0.045, 0.012, 2.4, '#ffe16b', { castShadow: false, receiveShadow: false });
      world.box(5.7, 0.09, z, 0.045, 0.012, 2.4, '#7ee8d0', { castShadow: false, receiveShadow: false });
    }
  
}

export function buildShell(world) {
    // Lower walls and protective base trim.
    world.box(0, 1.5, -15, 42.2, 3, 0.55, PALETTE.wall, { name: 'ShelterWallBack', solid: { sx: 21.1, sy: 1.5, sz: 0.275 } });
    world.box(-12.9, 1.5, 15, 16.2, 3, 0.55, PALETTE.wall, { name: 'ShelterWallFrontLeft', solid: { sx: 8.1, sy: 1.5, sz: 0.275 } });
    world.box(12.9, 1.5, 15, 16.2, 3, 0.55, PALETTE.wall, { name: 'ShelterWallFrontRight', solid: { sx: 8.1, sy: 1.5, sz: 0.275 } });
    world.box(0, 2.83, 15, 9.6, 0.34, 0.55, PALETTE.wall, { name: 'ShelterWallFrontAboveEntry', solid: { sx: 4.8, sy: 0.17, sz: 0.275 } });
    world.box(-21, 1.5, 0, 0.55, 3, 30.1, PALETTE.wall, { name: 'ShelterWallLeft', solid: { sx: 0.275, sy: 1.5, sz: 15.05 } });
    world.box(21, 1.5, 0, 0.55, 3, 30.1, PALETTE.wall, { name: 'ShelterWallRight', solid: { sx: 0.275, sy: 1.5, sz: 15.05 } });
    for (const x of [-21, 21]) world.box(x, 0.3, 0, 0.12, 0.26, 29.6, PALETTE.wallShade, { castShadow: false });
    for (const z of [-15, 15]) world.box(0, 0.3, z, 41.8, 0.26, 0.12, PALETTE.wallShade, { castShadow: false });

    // Load the JPG on the six opaque wall meshes only. Glass, timber and collision data stay untouched.
    // A shared texture preserves the existing mesh count and avoids the much larger dormant KTX2 asset.
    for (const name of ['ShelterWallBack', 'ShelterWallFrontLeft', 'ShelterWallFrontRight', 'ShelterWallFrontAboveEntry', 'ShelterWallLeft', 'ShelterWallRight']) {
      const wall = world.root.getObjectByName(name);
      if (wall) applyArchitectureTexture(world, wall, 'wall', wallTextureUrl, 12, 1);
    }

    // Tall glass panels, divided by warm timber mullions.
    for (const side of [-1, 1]) {
      for (const z of [-11.2, -6.7, -2.2, 2.3, 6.8, 11.0]) {
        // Leave the left-wall portal approaches clear of glass panels, rails and mullions.
        // A panel spans 3.8 m along Z, so skip any panel whose footprint overlaps a portal.
        // Clear both current portal approaches and former portal locations so wall glass/trim cannot remain attached to moved doors.
        const portalZ = LEFT_WALL_PORTAL_CLEARANCE_ZS;
        if (side === -1 && portalZ.some((doorZ) => Math.abs(z - doorZ) < 2.45)) continue;
        world.box(side * 20.69, 4.35, z, 0.1, 2.55, 3.8, '#a2cbd0', { roughness: 0.3, metalness: 0.06, solid: { sx: 0.06, sy: 1.25, sz: 1.85 }, castShadow: false });
        world.box(side * 20.58, 3.08, z, 0.17, 0.12, 3.98, PALETTE.wood, { castShadow: false });
        world.box(side * 20.58, 5.62, z, 0.17, 0.12, 3.98, PALETTE.wood, { castShadow: false });
        for (const dz of [-1.9, 0, 1.9]) world.box(side * 20.57, 4.35, z + dz, 0.16, 2.62, 0.09, PALETTE.wood, { castShadow: false });
      }
    }
    for (const z of [-14.66, 14.66]) {
      for (let x = -17; x <= 17; x += 5.2) {
        world.box(x, 4.5, z, 4.45, 2.6, 0.1, '#b1d3d5', { roughness: 0.32, metalness: 0.04, solid: { sx: 2.2, sy: 1.25, sz: 0.06 }, castShadow: false });
        world.box(x, 3.17, z, 4.58, 0.11, 0.16, PALETTE.wood, { castShadow: false });
        world.box(x, 5.83, z, 4.58, 0.11, 0.16, PALETTE.wood, { castShadow: false });
        world.box(x - 2.24, 4.5, z, 0.09, 2.72, 0.16, PALETTE.wood, { castShadow: false });
        world.box(x + 2.24, 4.5, z, 0.09, 2.72, 0.16, PALETTE.wood, { castShadow: false });
      }
    }

    // Exposed timber rafters and pendant fixtures imply a high indoor ceiling.
    for (let z = -13; z <= 13; z += 4.3) {
      world.box(0, 7.05, z, 42, 0.22, 0.28, PALETTE.wood, { castShadow: true });
      world.box(0, 6.77, z, 42, 0.07, 0.34, PALETTE.woodDark, { castShadow: false });
    }
    for (const x of [-17, -9, 0, 9, 17]) world.box(x, 6.93, 0, 0.2, 0.28, 30, PALETTE.wood, { castShadow: true });

    // Main entry frame and a cheerful welcome sign.
    world.box(-4.5, 1.4, 14.55, 0.22, 2.8, 0.3, PALETTE.sageDark, { solid: { sx: 0.11, sy: 1.4, sz: 0.15 } });
    world.box(4.5, 1.4, 14.55, 0.22, 2.8, 0.3, PALETTE.sageDark, { solid: { sx: 0.11, sy: 1.4, sz: 0.15 } });
    world.box(0, 2.86, 14.55, 9.15, 0.22, 0.3, PALETTE.woodDark);
    world.box(0, 3.35, 14.35, 7.5, 0.7, 0.25, '#e5eddc', { rounded: true });
    world.label('WELCOME TO THE COZY CLUB!', 0, 3.35, 14.19, 6.9, 0.53, '#fff0e1', '#8a6570', { rotationY: Math.PI });
    world.box(0, 0.23, 14.6, 8.9, 0.08, 0.38, PALETTE.wood, { castShadow: false });
  
}

export function buildZones(world) {
    // Low fences form a gentle training pen, with a large opening to avoid pinching the player.
    // Join the low pen rails to the diagonal iron fence. The iron pickets replace each low end-post at the join.
    world.fenceRun(-15.450384, -8.5, -5.9, '#8fb69a', 0.58, { skipStartPost: true });
    world.fenceRun(-15.298206, -8.5, -11.9, '#8fb69a', 0.58, { skipStartPost: true });
    world.fenceRun(8.2, 15.3, 5.4, '#d4a175');
    world.fenceRun(8.2, 15.3, 11.4, '#d4a175');
    world.box(15.3, 0.5, 8.4, 0.1, 1.0, 0.15, '#d4a175', { solid: { sx: 0.05, sy: 0.5, sz: 0.075 }, rounded: true });
    world.label('COZY PLAY ZONE', -12.0, 1.55, -5.83, 4.0, 0.45, '#dcead6', '#718f7d');
    world.label('SOFT NAP NOOK', 11.7, 1.55, 5.47, 2.4, 0.45, '#fff0e1', '#8a6570');
    // Soft colour-blocked resting mats and a check-in island.
    world.box(-12.2, 0.105, -8.8, 4.3, 0.09, 4.2, '#e7d8b9', { rounded: true, castShadow: false, solid: { sx: 2.15, sy: 0.045, sz: 2.1 } });
    world.box(11.7, 0.105, 8.5, 4.4, 0.09, 4.2, '#eed8c9', { rounded: true, castShadow: false, solid: { sx: 2.2, sy: 0.045, sz: 2.1 } });
    // The check-in counter was removed to keep the right side open for movement.
  
}

export function buildArchitecture(world) {
  buildFloor(world);
  buildShell(world);
  buildZones(world);
}
