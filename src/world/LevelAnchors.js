// Single source of truth for visible portal placement and matching LevelSystem approach triggers. The left frames sit just inside the wall face.
export const LEVEL_ENTRY_PORTALS = Object.freeze([
  Object.freeze({ id: 1, side: 'left', x: -20.575, y: 0.96145, z: 1.4240237743, color: '#a9d6a4',
    trigger: Object.freeze({ x: -19.97, z: 1.4240237743, rx: 0.48, rz: 0.48 }) }),
  Object.freeze({ id: 2, side: 'left', x: -20.575, y: 0.92828, z: 4.1040537902, color: '#a7e3eb',
    trigger: Object.freeze({ x: -19.97, z: 4.1040537902, rx: 0.48, rz: 0.48 }) }),
  Object.freeze({ id: 3, side: 'left', x: -20.575, y: 0.77654, z: 6.3941235169, color: '#f1a17c',
    trigger: Object.freeze({ x: -19.97, z: 6.3941235169, rx: 0.48, rz: 0.48 }) }),
  Object.freeze({ id: 4, side: 'left', x: -20.575, y: 1.03443, z: 8.9855557504, color: '#c9b5ee',
    trigger: Object.freeze({ x: -19.97, z: 8.9855557504, rx: 0.48, rz: 0.48 }) }),
  // Level 5 faces the front wall; its trigger is an approach point inside the room, not the visual frame center.
  Object.freeze({ id: 5, side: 'front', x: -18.3376761399, y: 0.96145, z: 14.25, color: '#8edfdc',
    trigger: Object.freeze({ x: -18.34, z: 13.50, rx: 0.50, rz: 0.20 }) })
]);

// Former Level 1-4 wall positions remain clear of decorations so stale trim cannot overlap the relocated doors.
export const LEGACY_LEFT_WALL_PORTAL_ZS = Object.freeze([
  7.4843736439, 10.3353168082, 12.2488737687, 13.6816358107
]);

export const LEFT_WALL_PORTAL_CLEARANCE_ZS = Object.freeze([
  ...LEGACY_LEFT_WALL_PORTAL_ZS,
  ...LEVEL_ENTRY_PORTALS.filter((portal) => portal.side === 'left').map((portal) => portal.z)
]);
