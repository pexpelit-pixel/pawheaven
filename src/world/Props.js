import * as THREE from 'three';
import { PALETTE } from './palette.js';
// Procedural shelter furniture and play props. All geometry/material helpers are supplied by Shelter.
function markPop(mesh) {
    if (mesh) mesh.userData.popClayType = 'pop';
    return mesh;
}

export function makeDogHouse(world, x, z, color, roofColor) {
    world.beginMovableProp('doghouse', x, 0.95, z, { mass: 18, spawnLift: 0.0475, interactionRadius: 1.4, interactionHeight: 1.5, friction: 0.82, restitution: 0.02, linearDamping: 0.85, angularDamping: 2.4, kickFactor: 0.24, maxImpulse: 5.2 });
    world.box(x, 0.47, z, 2.0, 0.88, 1.65, color, { rounded: true, solid: { sx: 1, sy: 0.44, sz: 0.825 } });
    world.box(x, 0.82, z + 0.835, 0.68, 0.82, 0.11, PALETTE.dark, { rounded: true, roughness: 0.94 });
    world.box(x, 1.03, z + 0.9, 0.46, 0.42, 0.035, '#203937', { rounded: true, castShadow: false });
    world.box(x - 0.49, 1.02, z + 0.85, 0.065, 0.42, 0.07, PALETTE.cream);
    world.box(x + 0.49, 1.02, z + 0.85, 0.065, 0.42, 0.07, PALETTE.cream);
    world.box(x, 1.47, z, 2.3, 0.15, 1.97, roofColor, { rounded: true, solid: { sx: 1.15, sy: 0.075, sz: 0.985 } });
    world.box(x - 0.52, 1.68, z, 1.2, 0.22, 2.0, roofColor, { rounded: true, rotation: { x: 0, y: 0, z: -0.27 }, solid: { sx: 0.6, sy: 0.11, sz: 1.0 } });
    world.box(x + 0.52, 1.68, z, 1.2, 0.22, 2.0, roofColor, { rounded: true, rotation: { x: 0, y: 0, z: 0.27 }, solid: { sx: 0.6, sy: 0.11, sz: 1.0 } });
    world.box(x, 1.86, z, 0.14, 0.16, 2.02, PALETTE.cream, { rounded: true });
    world.box(x, 0.12, z, 2.35, 0.12, 2.0, PALETTE.wood, { rounded: true });
    world.sphere(x - 0.62, 1.11, z + 0.91, 0.075, 0.075, 0.05, PALETTE.butter, { detail: 12, castShadow: false });
    world.sphere(x + 0.62, 1.11, z + 0.91, 0.075, 0.075, 0.05, PALETTE.coral, { detail: 12, castShadow: false });
    world.endMovableProp();
}

export function makeBed(world, x, z, color, pillow = '#f5e7c8') {
    world.beginMovableProp('dog-bed', x, 0.32, z, { mass: 7.5, spawnLift: 0.0775, interactionRadius: 1.22, interactionHeight: 0.85, friction: 0.86, restitution: 0.015, linearDamping: 0.9, angularDamping: 2.2, kickFactor: 0.24, maxImpulse: 4.8 });
    world.box(x, 0.23, z, 2.15, 0.32, 1.72, PALETTE.wood, { rounded: true, solid: { sx: 1.075, sy: 0.16, sz: 0.86 } });
    world.box(x, 0.42, z, 1.95, 0.24, 1.52, color, { rounded: true, roughness: 0.98, solid: { sx: 0.975, sy: 0.12, sz: 0.76 } });
    world.box(x, 0.55, z - 0.38, 1.42, 0.12, 0.44, pillow, { rounded: true, solid: { sx: 0.71, sy: 0.06, sz: 0.22 } });
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.6, 0.6]) world.box(x + dx, 0.08, z + dz, 0.14, 0.16, 0.14, PALETTE.woodDark, { rounded: true });
    world.box(x, 0.565, z + 0.33, 0.28, 0.035, 0.18, '#fff7e8', { rounded: true, castShadow: false });
    world.endMovableProp();
}

export function makeBowl(world, x, z, color) {
    world.beginMovableProp('water-bowl', x, 0.22, z, { mass: 0.85, spawnLift: 0.0275, interactionRadius: 0.48, interactionHeight: 0.52, friction: 0.48, restitution: 0.07, linearDamping: 0.38, angularDamping: 0.72, kickFactor: 0.34, maxImpulse: 2.5 });
    world.cylinder(x, 0.19, z, 0.41, 0.31, 0.28, color, { roughness: 0.46, metalness: 0.14, castShadow: true, solid: { sx: 0.41, sy: 0.14, sz: 0.41 } });
    world.cylinder(x, 0.335, z, 0.34, 0.34, 0.035, '#d7e5dd', { roughness: 0.28, metalness: 0.06, castShadow: false });
    world.cylinder(x, 0.35, z, 0.285, 0.285, 0.012, '#8ec0cf', { roughness: 0.28, castShadow: false });
    world.torus(x, 0.32, z, 0.34, 0.025, PALETTE.cream, { rotation: { x: Math.PI / 2, y: 0, z: 0 }, castShadow: false });
    world.endMovableProp();
}

export function makeToy(world, x, z, kind = 'ball', color = PALETTE.coral) {
    const toyProfile = kind === 'ball'
      ? { y: 0.25, mass: 0.24, spawnLift: 0.0675, ccdEnabled: true, radius: 0.36, height: 0.5, friction: 0.42, restitution: 0.22, linearDamping: 0.24, angularDamping: 0.42, maxImpulse: 1.8 }
      : kind === 'ring'
        ? { y: 0.24, mass: 0.34, spawnLift: 0.0755, ccdEnabled: true, radius: 0.5, height: 0.62, friction: 0.56, restitution: 0.12, linearDamping: 0.36, angularDamping: 0.64, maxImpulse: 2.2 }
        : { y: 0.2, mass: 0.42, spawnLift: 0.0575, radius: 0.52, height: 0.42, friction: 0.72, restitution: 0.045, linearDamping: 0.72, angularDamping: 1.5, maxImpulse: 2.4 };
    world.beginMovableProp(`toy-${kind}`, x, toyProfile.y, z, { ...toyProfile, interactionRadius: toyProfile.radius, interactionHeight: toyProfile.height, kickFactor: 0.38 });
    if (kind === 'ball') {
      markPop(world.sphere(x, 0.25, z, 0.24, 0.24, 0.24, color, { detail: 18, solid: { sx: 0.24, sy: 0.24, sz: 0.24 } }));
      markPop(world.torus(x, 0.25, z, 0.21, 0.025, PALETTE.cream, { rotation: { x: Math.PI / 2, y: 0.5, z: 0 }, castShadow: false }));
    } else if (kind === 'ring') {
      // Use a curved, segmented collider around the torus tube so the hole stays open.
      // This avoids a flat invisible platform under paws inside or near the ring.
      markPop(world.torus(x, 0.24, z, 0.33, 0.095, color, { rotation: { x: Math.PI / 2.8, y: 0, z: 0 }, castShadow: true, solid: { sx: 0.43, sy: 0.205, sz: 0.39 } }));
    } else {
      // The rope lies along X. Keep its collider horizontal; the old Y half-extent of 0.50 acted like a hidden pillar.
      markPop(world.cylinder(x, 0.2, z, 0.15, 0.15, 0.6, color, { rotation: { x: 0, y: 0, z: Math.PI / 2 }, rounded: true, solid: { sx: 0.31, sy: 0.15, sz: 0.15 } }));
      markPop(world.sphere(x - 0.31, 0.2, z, 0.18, 0.18, 0.18, PALETTE.cream, { detail: 14, solid: { sx: 0.18, sy: 0.18, sz: 0.18 } }));
      markPop(world.sphere(x + 0.31, 0.2, z, 0.18, 0.18, 0.18, PALETTE.cream, { detail: 14, solid: { sx: 0.18, sy: 0.18, sz: 0.18 } }));
    }
    world.endMovableProp();
}

export function buildFurniture(world) {
    makeDogHouse(world, -12.2, -9.3, PALETTE.mint, PALETTE.sage);
    makeDogHouse(world, -17.7, -9.5, PALETTE.pink, PALETTE.coral);
    makeDogHouse(world, 11.7, 9.0, PALETTE.butter, PALETTE.wood);
    makeDogHouse(world, 16.4, 8.5, PALETTE.sky, PALETTE.blue);
    // JSON directive: remove the bed at approximately (-7.01, 0.54, -8.76).
    // The remaining two beds stay unchanged.
    makeBed(world, 7.8, -8.3, PALETTE.pink, PALETTE.cream);
    makeBed(world, 16.3, 2.3, PALETTE.sky, PALETTE.cream);
    makeBowl(world, -4.4, -7.5, PALETTE.sky); makeBowl(world, -2.9, -7.5, PALETTE.pink);
    makeBowl(world, 6.4, 5.7, PALETTE.butter); makeBowl(world, 8.0, 5.7, PALETTE.blue);
    makeToy(world, -7.2, -3.9, 'ball', PALETTE.coral); makeToy(world, -4.1, -2.0, 'ring', PALETTE.mint);
    makeToy(world, 5.9, 2.0, 'rope', PALETTE.butter); makeToy(world, 3.9, -4.4, 'ball', PALETTE.sky);
    makeToy(world, 15.5, -2.1, 'ring', PALETTE.pink); makeToy(world, -14.0, 2.1, 'rope', PALETTE.sage);
    // Removed the board/ramp selected at world point (13.225, 0.652, -7.472) per spatial directive.
    // Moved by the AI spatial directives. Their requested destination is the bottom-center anchor.
    // Keep the tube's geometry and all collision segments together as one logical world object.
    const tunnelTarget = { x: 0.07220723201030665, floorY: 0.07750000059604645, z: -12.305996161400158 };
    const tunnelCenterY = tunnelTarget.floorY + 0.84;
    const tunnelOuter = world.geometry('agility-tunnel-outer', () => new THREE.CylinderGeometry(0.84, 0.84, 2.0, 28, 1, true));
    world.addMesh(tunnelOuter, world.material(PALETTE.mint, 0.68), tunnelTarget.x, tunnelCenterY, tunnelTarget.z, { rotation: { x: Math.PI / 2, y: 0, z: 0 }, name: 'AgilityTunnelOuter' });
    const tunnelInner = world.geometry('agility-tunnel-inner', () => new THREE.CylinderGeometry(0.70, 0.70, 2.02, 28, 1, true));
    world.addMesh(tunnelInner, world.material(PALETTE.sageDark, 0.82), tunnelTarget.x, tunnelCenterY, tunnelTarget.z, { rotation: { x: Math.PI / 2, y: 0, z: 0 }, castShadow: false, name: 'AgilityTunnelInner' });
    world.torus(tunnelTarget.x, tunnelCenterY, tunnelTarget.z - 1, 0.81, 0.075, PALETTE.mint, { castShadow: true, name: 'AgilityTunnelEntryRing' });
    world.torus(tunnelTarget.x, tunnelCenterY, tunnelTarget.z + 1, 0.81, 0.075, PALETTE.mint, { castShadow: true, name: 'AgilityTunnelExitRing' });

    // The tube is hollow, so use thin rotated collision segments around its shell instead
    // of one solid cylinder that would block the entrance. The bottom arc is omitted where
    // the visual tunnel sits inside the floor.
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI * 2 / 16;
      if (Math.sin(angle) < -0.86) continue;
      const radius = 0.77;
      world.solids.push({
        x: tunnelTarget.x + Math.cos(angle) * radius,
        y: tunnelCenterY + Math.sin(angle) * radius,
        z: tunnelTarget.z,
        sx: 0.16,
        sy: 0.085,
        sz: 0.95,
        rotation: { x: 0, y: 0, z: angle + Math.PI / 2 }
      });
    }
    // Display shelves and small cubbies along the back wall.
    world.box(-8.7, 1.05, -14.1, 5.0, 1.7, 0.6, PALETTE.peach, { rounded: true, solid: { sx: 2.5, sy: 0.85, sz: 0.3 } });
    for (let x = -10.6; x <= -6.8; x += 1.25) {
      // Tiny display dividers/products do not cast or receive individual shadows; their fine shadow edges alias at camera distance.
      world.box(x, 0.82, -13.76, 0.09, 1.25, 0.07, PALETTE.woodDark, { castShadow: false, receiveShadow: false });
      world.box(x, 0.68, -13.7, 0.6, 0.16, 0.38, PALETTE.sage, { rounded: true, castShadow: false, receiveShadow: false });
    }
    world.box(-8.7, 1.98, -13.92, 5.4, 0.17, 0.77, PALETTE.wood, { rounded: true, castShadow: false, receiveShadow: false, solid: { sx: 2.7, sy: 0.085, sz: 0.385 } });
    world.label('TOYS & TREATS', -8.7, 2.2, -13.55, 3.3, 0.35, PALETTE.cream, PALETTE.woodDark);
  
}
