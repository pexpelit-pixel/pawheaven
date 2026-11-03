import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OBJECT_RULES, canCarryObject as canCarryObjectBase, getInventoryTokenType as getInventoryTokenTypeBase, getObjectRule, getTokenRule as getTokenRuleBase, inventoryItemMassKg as inventoryItemMassKgBase } from '../world/ObjectRules.js';
import { t } from '../core/Localization.js';
import { playInteractionFx, disposeInteractionFx } from '../world/sound/InteractionAudio.js';

const SLOT_COUNT = Number.isInteger(OBJECT_RULES.capacity?.slots) ? OBJECT_RULES.capacity.slots : 12;
const SAVE_KEY = 'paw-haven-inventory-v1';
const SMALL_ITEM_TYPES = new Set(['ball', 'bone', 'cube', 'gear', 'plush']);
const ITEMS = Object.freeze(Object.fromEntries(
  [...SMALL_ITEM_TYPES].map((type) => {
    const rule = OBJECT_RULES.objects[type] || {};
    return [type, {
      name: rule.name || type,
      icon: rule.icon || '📦',
      color: rule.color || '#a7b8ad',
      metalness: Number(rule.metalness) || 0
    }];
  })
));
const QUEST_ITEM_TYPES = Object.freeze({ 'quest:v3:level-1': 'bone', 'quest:v3:level-2': 'cube', 'quest:v3:level-3': 'gear', 'quest:v3:level-4': 'plush', 'quest:v3:level-5': 'ball' });
const QUEST_ITEM_LABELS = Object.freeze({ 'quest:v3:level-1': 'Moss Relic', 'quest:v3:level-2': 'Birdie Relic', 'quest:v3:level-3': 'Crate Relic', 'quest:v3:level-4': 'Catapult Relic', 'quest:v3:level-5': 'Braidel Rally Relic' });
const QUEST_ITEM_COLORS = Object.freeze({ 'quest:v3:level-1': '#70a978', 'quest:v3:level-2': '#73bfd0', 'quest:v3:level-3': '#c76d4a', 'quest:v3:level-4': '#9677bd', 'quest:v3:level-5': '#4e829d' });
const getQuestBaseType = (token) => QUEST_ITEM_TYPES[token] || null;
const getInventoryTokenType = (token) => getQuestBaseType(token) || getInventoryTokenTypeBase(token);
const getTokenRule = (token) => getTokenRuleBase(getQuestBaseType(token) || token);
const inventoryItemMassKg = (token) => inventoryItemMassKgBase(getQuestBaseType(token) || token);
const canCarryObject = (token, type) => canCarryObjectBase(getQuestBaseType(token) || token, type);
const isItemType = (value) => typeof value === 'string' && (SMALL_ITEM_TYPES.has(value) || Object.hasOwn(QUEST_ITEM_TYPES, value));
const isPropToken = (value) => typeof value === 'string' && value.startsWith('prop:') && Boolean(getInventoryTokenType(value));
const isInventoryToken = (value) => {
  const type = getInventoryTokenType(value);
  return Boolean(type && Number.isFinite(inventoryItemMassKg(value)) && canCarryObject(value, type));
};
const isMovablePropType = (type) => typeof type === 'string' && Object.hasOwn(OBJECT_RULES.objects || {}, type);
const getItemInfo = (token) => {
  const rule = getTokenRule(token);
  if (!rule) return null;
  const fallback = ITEMS[rule.type] || {};
  const nameKey = `item.${rule.type}`;
  const localizedName = t(nameKey);
  return {
    ...fallback,
    name: QUEST_ITEM_LABELS[token] || (localizedName !== nameKey ? localizedName : (fallback.name || rule.name || rule.type)),
    icon: fallback.icon || rule.icon || '📦',
    color: QUEST_ITEM_COLORS[token] || fallback.color || rule.color || '#a7b8ad',
    metalness: fallback.metalness ?? (Number(rule.metalness) || 0)
  };
};
const getItemName = (token) => getItemInfo(token)?.name || String(token || 'item');

export class PickupInventory {
  constructor(scene, dog, input, hud, physics = null, shelter = null) {
    this.scene = scene;
    this.dog = dog;
    this.input = input;
    this.hud = hud;
    this.physics = physics;
    this.levelMode = false;
    this.teleportInteractActive = false;
    this.shelter = shelter;
    this.propRoots = new Map();
    this.items = [];
    this.slots = Array(SLOT_COUNT).fill(null);
    this.collected = new Set();
    this.heldType = null;
    this.heldRoot = null;
    this.nearby = null;
    this.nearbyScanElapsed = 1 / 30;
    this.nearbyScanInterval = 1 / 30;
    this.elapsed = 0;
    this.dynamicId = 0;
    this.droppedItems = [];
    this.droppedProps = [];
    this.dropPuffs = [];
    this.physicsSaveElapsed = 0;
    this.lastInteractionSignature = '';
    this.materials = new Map();
    this.geometries = new Map();

    this.panel = document.getElementById('inventory-panel');
    this.slotsRoot = document.getElementById('inventory-slots');
    this.toggle = document.getElementById('inventory-toggle');
    this.closeButton = document.getElementById('inventory-close');
    this.dropButton = document.getElementById('inventory-drop');
    this.dropTouchButton = document.getElementById('touch-drop');
    this.countLabel = document.getElementById('inventory-count');
    this.panelCountLabel = document.getElementById('inventory-panel-count');
    this.interactButton = document.getElementById('touch-interact');
    this.interactLabel = this.interactButton?.querySelector('small');
    this.prompt = document.getElementById('interaction-prompt');
    this.promptText = document.getElementById('interaction-prompt-text');

    this.loadState();
    this.buildSlotButtons();
    this.spawnInitialPickups();
    this.registerShelterProps();
    this.initRingInstances();
    if (this.heldType && isInventoryToken(this.heldType)) this.attachHeldModel(this.heldType);
    this.bindUI();
    this.renderInventory();
    this.updateInteractionUI(true);
    this.onLocaleChange = () => {
      this.renderInventory();
      this.updateInteractionUI(true);
    };
    document.addEventListener('paw-haven-locale-change', this.onLocaleChange);
  }

  hasQuestItems(tokens) {
    return Array.isArray(tokens) && tokens.every((token) => this.slots.includes(token) || this.heldType === token);
  }

  grantQuestItem(token) {
    if (!Object.hasOwn(QUEST_ITEM_TYPES, token) || !isInventoryToken(token)) return false;
    if (this.slots.includes(token) || this.heldType === token) return true;
    const slot = this.slots.findIndex((value) => !value);
    if (slot < 0) return false;
    this.slots[slot] = token;
    this.collected.add('pickup-level-' + token);
    this.saveState();
    this.renderInventory();
    this.updateInteractionUI(true);
    return true;
  }

  loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      if (Array.isArray(saved.slots)) {
        this.slots = Array.from({ length: SLOT_COUNT }, (_, index) => isInventoryToken(saved.slots[index]) ? saved.slots[index] : null);
        this.enforceInventoryMassLimit();
      }
      if (Array.isArray(saved.collected)) {
        this.collected = new Set(saved.collected.filter((id) =>
          typeof id === 'string' && (
            id.startsWith('pickup-')
            || (id.startsWith('prop:') && isPropToken(id))
          )
        ));
      }
      this.heldType = isInventoryToken(saved.held) ? saved.held : null;
      this.droppedItems = Array.isArray(saved.dropped)
        ? saved.dropped.filter((item) => item && typeof item.id === 'string' && /^dropped-\d+$/.test(item.id) && isItemType(item.type) && Number.isFinite(item.x) && Number.isFinite(item.z))
          .map(({ id, type, x, y, z }) => ({ id, type, x, y: Number.isFinite(y) ? y : 0.5, z }))
        : [];
      this.droppedProps = Array.isArray(saved.droppedProps)
        ? saved.droppedProps.filter((item) =>
          item && typeof item.objectId === 'string'
          && isMovablePropType(OBJECT_RULES.entities?.[item.objectId]?.type)
          && Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z)
        ).map(({ objectId, x, y, z, yaw }) => ({
          objectId, x, y, z, yaw: Number.isFinite(yaw) ? yaw : 0
        }))
        : [];
      this.dynamicId = this.droppedItems.reduce((max, item) => Math.max(max, Number(item.id.slice(8)) || 0), 0);
    } catch {
      this.slots = Array(SLOT_COUNT).fill(null);
      this.collected = new Set();
      this.heldType = null;
      this.droppedItems = [];
      this.droppedProps = [];
      this.dynamicId = 0;
    }
  }

  saveState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        slots: this.slots,
        held: this.heldType,
        collected: [...this.collected],
        dropped: this.items
          .filter((item) => !item.persistent && !item.prop && Number.isFinite(item.root.position.x) && Number.isFinite(item.root.position.z))
          .map((item) => ({ id: item.id, type: item.type, x: item.root.position.x, y: item.root.position.y, z: item.root.position.z })),
        droppedProps: this.items
          .filter((item) => item.prop && !item.persistent && Number.isFinite(item.root.position.x) && Number.isFinite(item.root.position.y) && Number.isFinite(item.root.position.z))
          .map((item) => ({
            objectId: item.propId,
            x: item.root.position.x,
            y: item.root.position.y,
            z: item.root.position.z,
            yaw: item.root.rotation.y
          }))
      }));
    } catch {
      this.hud?.toast('Inventory is available, but this browser cannot save it.');
    }
  }

  geometry(key, create) {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = create();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  material(color, metalness = 0, roughness = 0.62) {
    const key = `${color}|${metalness}|${roughness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      this.materials.set(key, material);
    }
    return material;
  }

  addMesh(parent, geometry, color, position, scale = [1, 1, 1], metalness = 0, roughness = 0.62) {
    const mesh = new THREE.Mesh(geometry, this.material(color, metalness, roughness));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  createModel(type) {
    const token = type;
    type = getQuestBaseType(type) || type;
    const item = ITEMS[type];
    const root = new THREE.Group();
    root.name = `Pickup-${token}`;
    const sphere = this.geometry('unit-sphere', () => new THREE.SphereGeometry(1, 14, 10));
    const torus = this.geometry('pickup-ring', () => new THREE.TorusGeometry(0.105, 0.014, 5, 14));

    if (type === 'ball') {
      this.addMesh(root, sphere, item.color, [0, 0.035, 0], [0.145, 0.145, 0.145], item.metalness, 0.38);
      const stripe = this.addMesh(root, torus, '#fff0cf', [0, 0.035, 0], [1.1, 1.1, 1.1], 0.02, 0.4);
      stripe.rotation.set(0.75, 0.55, 0.2);
      const stripe2 = this.addMesh(root, torus, '#b9f4de', [0, 0.035, 0], [0.8, 0.8, 0.8], 0.02, 0.4);
      stripe2.rotation.set(-0.5, 0.35, 1.0);
    } else if (type === 'bone') {
      const shaft = this.geometry('bone-shaft', () => new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10));
      const center = this.addMesh(root, shaft, item.color, [0, 0.025, 0], [1, 1, 1], item.metalness);
      center.rotation.z = Math.PI / 2;
      for (const x of [-0.115, 0.115]) {
        this.addMesh(root, sphere, item.color, [x, 0.025, 0], [0.072, 0.072, 0.072], item.metalness, 0.48);
        this.addMesh(root, sphere, '#fff0d2', [x, 0.075, 0], [0.045, 0.045, 0.045], 0.01, 0.5);
      }
    } else if (type === 'cube') {
      const block = this.geometry('puzzle-block', () => new RoundedBoxGeometry(0.25, 0.22, 0.25, 2, 0.045));
      this.addMesh(root, block, item.color, [0, 0.02, 0], [1, 1, 1], item.metalness, 0.42);
      this.addMesh(root, sphere, '#efffff', [0, 0.139, 0], [0.035, 0.018, 0.035], 0.02, 0.3);
    } else if (type === 'gear') {
      const gearBase = this.geometry('gear-cylinder', () => new THREE.CylinderGeometry(0.12, 0.12, 0.055, 12));
      this.addMesh(root, gearBase, item.color, [0, 0.02, 0], [1, 1, 1], item.metalness, 0.34);
      const teeth = this.geometry('gear-tooth', () => new THREE.BoxGeometry(0.052, 0.038, 0.052));
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const tooth = this.addMesh(root, teeth, item.color, [Math.cos(angle) * 0.12, 0.02, Math.sin(angle) * 0.12], [1, 1, 1], item.metalness, 0.34);
        tooth.rotation.y = -angle;
      }
      this.addMesh(root, sphere, '#435c58', [0, 0.055, 0], [0.052, 0.02, 0.052], 0.25, 0.5);
    } else if (type === 'plush') {
      this.addMesh(root, sphere, item.color, [0, 0.015, 0], [0.12, 0.115, 0.09], item.metalness, 0.9);
      const tips = [[0, 0.145, 0], [0, -0.09, 0], [-0.12, 0.015, 0], [0.12, 0.015, 0], [0, 0.015, -0.1]];
      for (const [x, y, z] of tips) this.addMesh(root, sphere, item.color, [x, y, z], [0.058, 0.058, 0.058], item.metalness, 0.9);
      this.addMesh(root, sphere, '#fff2be', [-0.035, 0.035, -0.08], [0.014, 0.014, 0.012], 0, 0.65);
      this.addMesh(root, sphere, '#fff2be', [0.035, 0.035, -0.08], [0.014, 0.014, 0.012], 0, 0.65);
    }

    root.userData.itemType = type;
    return root;
  }

  createWorldPickup(id, type, position, persistent = true, physical = false, physicsOptions = null) {
    const root = this.createModel(type);
    root.position.set(position.x, position.y ?? 0.14, position.z);
    // This Object3D stores the marker transform. Visible pickup rings are batched into
    // two InstancedMeshes so the number of pickable items does not add one draw call each.
    const ring = new THREE.Object3D();
    ring.name = 'PickupRingTransform-' + id;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(position.x, (position.y ?? 0.14) - 0.105, position.z);
    this.scene.add(root);
    root.userData.baseY = position.y ?? 0.14;
    root.userData.phase = this.items.length * 1.37;
    const physicsRecord = physical ? this.physics?.createLooseObject(id, type, root, physicsOptions || {}) : null;
    const hasPhysics = Boolean(physicsRecord);
    const pickupType = getInventoryTokenType(type);
    const pickupRule = getTokenRule(type);
    const item = {
      id, type, root, ring, ringIndex: -1, persistent, physical: hasPhysics,
      pickupAllowed: Boolean(pickupType && canCarryObject(id, pickupType)),
      pickupRange: Math.max(0.35, Number(pickupRule?.interaction?.range) || 1.85),
      pickupHeight: Math.max(1.35, Number(pickupRule?.interaction?.height) || 0),
      baseY: root.userData.baseY, supportProbeElapsed: 0, supportY: null, supportProbePosition: null
    };
    this.items.push(item);
    this.registerRingInstance(item);
  }

  initRingInstances() {
    if (this.ringIdleMesh) return;
    this.ringGeometry = this.geometry('ground-ring', () => new THREE.TorusGeometry(0.205, 0.012, 5, 20));
    this.ringIdleMaterial = new THREE.MeshStandardMaterial({
      color: '#b4d5a2', metalness: 0.05, roughness: 0.42,
      transparent: true, opacity: 0.38, depthWrite: false
    });
    this.ringActiveMaterial = new THREE.MeshStandardMaterial({
      color: '#c8f36a', metalness: 0.05, roughness: 0.42,
      transparent: true, opacity: 0.88, depthWrite: false
    });
    this.ringCapacity = Math.max(64, this.items.length + 16);
    this.ringSlotCount = 0;
    this.ringFreeSlots = [];
    this.ringHiddenMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    this.ringHiddenMatrix.setPosition(0, -1000, 0);
    this.ringMatrixScratch = new THREE.Matrix4();
    this.ringIdleMesh = this.createRingInstanceMesh(this.ringIdleMaterial, 'PickupRings-Idle', this.ringCapacity);
    this.ringActiveMesh = this.createRingInstanceMesh(this.ringActiveMaterial, 'PickupRings-Active', this.ringCapacity);
    this.scene.add(this.ringIdleMesh, this.ringActiveMesh);
    for (const item of this.items) this.registerRingInstance(item);
  }

  createRingInstanceMesh(material, name, capacity) {
    const mesh = new THREE.InstancedMesh(this.ringGeometry, material, capacity);
    mesh.name = name;
    mesh.count = this.ringSlotCount || 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Marker instances move independently across the shelter; avoid a stale aggregate
    // bounding sphere incorrectly culling a ring after its object has been carried/dropped.
    mesh.frustumCulled = false;
    return mesh;
  }

  ensureRingInstanceCapacity(required) {
    if (required <= this.ringCapacity) return;
    const capacity = Math.max(required, this.ringCapacity * 2);
    const previousIdle = this.ringIdleMesh;
    const previousActive = this.ringActiveMesh;
    const nextIdle = this.createRingInstanceMesh(this.ringIdleMaterial, 'PickupRings-Idle', capacity);
    const nextActive = this.createRingInstanceMesh(this.ringActiveMaterial, 'PickupRings-Active', capacity);
    const matrix = this.ringMatrixScratch;
    const copyCount = Math.min(previousIdle.count, this.ringCapacity);
    for (let index = 0; index < copyCount; index++) {
      previousIdle.getMatrixAt(index, matrix);
      nextIdle.setMatrixAt(index, matrix);
      previousActive.getMatrixAt(index, matrix);
      nextActive.setMatrixAt(index, matrix);
    }
    nextIdle.instanceMatrix.needsUpdate = true;
    nextActive.instanceMatrix.needsUpdate = true;
    this.scene.remove(previousIdle, previousActive);
    this.scene.add(nextIdle, nextActive);
    this.ringIdleMesh = nextIdle;
    this.ringActiveMesh = nextActive;
    this.ringCapacity = capacity;
  }

  registerRingInstance(item) {
    if (!this.ringIdleMesh || !item?.ring || Number.isInteger(item.ringIndex) && item.ringIndex >= 0) return;
    const reused = this.ringFreeSlots.length > 0;
    const index = reused ? this.ringFreeSlots.pop() : this.ringSlotCount;
    if (!reused) this.ringSlotCount += 1;
    this.ensureRingInstanceCapacity(this.ringSlotCount);
    item.ringIndex = index;
    this.ringIdleMesh.count = this.ringSlotCount;
    this.ringActiveMesh.count = this.ringSlotCount;
    item.ring.updateMatrix();
    this.ringIdleMesh.setMatrixAt(index, item.ring.matrix);
    this.ringActiveMesh.setMatrixAt(index, this.ringHiddenMatrix);
    this.ringIdleMesh.instanceMatrix.needsUpdate = true;
    this.ringActiveMesh.instanceMatrix.needsUpdate = true;
  }

  releaseRingInstance(item) {
    const index = item?.ringIndex;
    if (!Number.isInteger(index) || index < 0 || !this.ringIdleMesh || !this.ringActiveMesh) return;
    this.ringIdleMesh.setMatrixAt(index, this.ringHiddenMatrix);
    this.ringActiveMesh.setMatrixAt(index, this.ringHiddenMatrix);
    this.ringIdleMesh.instanceMatrix.needsUpdate = true;
    this.ringActiveMesh.instanceMatrix.needsUpdate = true;
    this.ringFreeSlots.push(index);
    item.ringIndex = -1;
  }

  syncRingInstances() {
    if (!this.ringIdleMesh || !this.ringActiveMesh) return;
    let matrixBufferChanged = false;
    for (const item of this.items) {
      const index = item.ringIndex;
      if (!Number.isInteger(index) || index < 0) continue;
      const near = item === this.nearby;
      const ring = item.ring;
      const state = item.ringMatrixState || (item.ringMatrixState = {});
      const transformChanged = !Number.isFinite(state.x)
        || Math.abs(ring.position.x - state.x) > 1e-4
        || Math.abs(ring.position.y - state.y) > 1e-4
        || Math.abs(ring.position.z - state.z) > 1e-4
        || Math.abs(ring.rotation.x - state.rx) > 1e-4
        || Math.abs(ring.rotation.y - state.ry) > 1e-4
        || Math.abs(ring.rotation.z - state.rz) > 1e-4
        || Math.abs(ring.scale.x - state.sx) > 1e-4
        || Math.abs(ring.scale.y - state.sy) > 1e-4
        || Math.abs(ring.scale.z - state.sz) > 1e-4;
      const nearbyChanged = item.isNearby !== near;
      if (!transformChanged && !nearbyChanged) continue;

      if (transformChanged) {
        ring.updateMatrix();
        state.x = ring.position.x;
        state.y = ring.position.y;
        state.z = ring.position.z;
        state.rx = ring.rotation.x;
        state.ry = ring.rotation.y;
        state.rz = ring.rotation.z;
        state.sx = ring.scale.x;
        state.sy = ring.scale.y;
        state.sz = ring.scale.z;
      }
      if (nearbyChanged) item.isNearby = near;
      const matrix = ring.matrix;
      this.ringIdleMesh.setMatrixAt(index, near ? this.ringHiddenMatrix : matrix);
      this.ringActiveMesh.setMatrixAt(index, near ? matrix : this.ringHiddenMatrix);
      matrixBufferChanged = true;
    }
    // Sleeping/static pickups no longer upload the full instance buffers on every step.
    if (matrixBufferChanged) {
      this.ringIdleMesh.instanceMatrix.needsUpdate = true;
      this.ringActiveMesh.instanceMatrix.needsUpdate = true;
    }
  }

  spawnInitialPickups() {
    const placements = Array.isArray(OBJECT_RULES.initialPickups) ? OBJECT_RULES.initialPickups : [];
    for (const item of placements) {
      if (this.collected.has(item.id) || !canCarryObject(item.id, item.type)) continue;
      // Starting pickups also settle under gravity instead of hovering on a visual-only bob.
      this.createWorldPickup(item.id, item.type, { x: item.x, y: Number.isFinite(item.y) ? item.y : 0.5, z: item.z }, item.persistent !== false, true);
    }
    for (const item of this.droppedItems) {
      if (!isInventoryToken(item.type)) continue;
      this.createWorldPickup(item.id, item.type, { x: item.x, y: item.y ?? 0.5, z: item.z }, false, true);
    }
    this.droppedItems = [];
  }

  enforceInventoryMassLimit() {
    const maxMass = Number(OBJECT_RULES.capacity?.maxInventoryMassKg ?? Infinity);
    let totalMass = 0;
    this.slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
      const token = this.slots[index];
      if (!isInventoryToken(token)) return null;
      const mass = inventoryItemMassKg(token);
      if (!Number.isFinite(mass) || totalMass + mass > maxMass + 1e-6) return null;
      totalMass += mass;
      return token;
    });
  }

  registerShelterProps() {
    const movableProps = this.shelter?.movableProps;
    if (!(movableProps instanceof Map)) return;
    const carried = new Set([...this.slots.filter(Boolean), this.heldType].filter(isPropToken));
    const droppedById = new Map(this.droppedProps.map((entry) => [entry.objectId, entry]));

    for (const [objectId, prop] of movableProps) {
      const token = `prop:${objectId}`;
      const type = OBJECT_RULES.entities?.[objectId]?.type || prop.name;
      this.propRoots.set(objectId, prop.group);
      if (!isMovablePropType(type) || !isInventoryToken(token)) continue;

      const dropped = droppedById.get(objectId);
      if (carried.has(token)) {
        this.physics?.suspendDynamicProp(objectId);
        prop.group.parent?.remove(prop.group);
        this.collected.add(token);
        continue;
      }
      if (this.collected.has(token) && !dropped) {
        this.physics?.suspendDynamicProp(objectId);
        prop.group.parent?.remove(prop.group);
        continue;
      }
      if (dropped) {
        prop.group.position.set(dropped.x, dropped.y, dropped.z);
        prop.group.rotation.set(0, dropped.yaw || 0, 0);
        const active = this.physics?.dynamicPropsByObjectId?.get(objectId);
        active?.body?.setTranslation({ x: dropped.x, y: dropped.y, z: dropped.z }, true);
        active?.body?.setRotation(prop.group.quaternion, true);
        this.collected.delete(token);
      }
      this.createPropPickup(objectId, !dropped, prop.group);
    }
    this.droppedProps = [];
  }

  createPropPickup(objectId, persistent = true, root = null) {
    const prop = this.shelter?.movableProps?.get(objectId);
    const group = root || prop?.group || this.propRoots.get(objectId);
    if (!group) return null;
    const token = `prop:${objectId}`;
    if (this.items.some((item) => item.id === token)) return this.items.find((item) => item.id === token);
    const rule = getTokenRule(token);
    if (!rule || !isInventoryToken(token)) return null;
    const ring = new THREE.Object3D();
    ring.name = 'PickupRingTransform-' + objectId;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(group.position.x, group.position.y - 0.105, group.position.z);
    ring.scale.setScalar(Math.max(1.1, Math.min(3.2, (Number(rule.interaction?.radius) || 0.6) * 2.2)));
    const pickupType = getInventoryTokenType(token);
    const item = {
      id: token, type: token, root: group, ring, ringIndex: -1, persistent,
      physical: true, prop: true, propId: objectId,
      pickupAllowed: Boolean(pickupType && canCarryObject(token, pickupType)),
      pickupRange: Math.max(0.35, Number(rule.interaction?.range) || 1.85),
      pickupHeight: Math.max(1.35, Number(rule.interaction?.height) || 0),
      baseY: group.position.y, supportProbeElapsed: 0, supportY: null, supportProbePosition: null
    };
    this.items.push(item);
    this.registerRingInstance(item);
    return item;
  }

  buildSlotButtons() {
    if (!this.slotsRoot) return;
    this.slotButtons = [];
    this.slotsRoot.replaceChildren();
    for (let index = 0; index < SLOT_COUNT; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inventory-slot';
      button.setAttribute('aria-label', t('inventory.emptySlotAria', { index: index + 1 }));
      button.addEventListener('click', () => this.selectSlot(index));
      this.slotsRoot.append(button);
      this.slotButtons.push(button);
    }
  }

  bindUI() {
    this.onToggleClick = () => this.togglePanel();
    this.onCloseClick = () => this.setPanelOpen(false);
    this.onDropClick = () => this.dropHeld();
    this.onTouchDropClick = () => this.dropHeld();
    this.onEscape = (event) => {
      if (event.key === 'Escape' && this.panel && !this.panel.hidden && document.getElementById('settings-panel')?.hidden) {
        this.setPanelOpen(false);
      }
    };
    this.toggle?.addEventListener('click', this.onToggleClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.dropButton?.addEventListener('click', this.onDropClick);
    this.dropTouchButton?.addEventListener('click', this.onTouchDropClick);
    window.addEventListener('keydown', this.onEscape);
  }

  togglePanel() {
    this.setPanelOpen(Boolean(this.panel?.hidden));
  }

  setPanelOpen(open) {
    if (!this.panel) return;
    this.panel.hidden = !open;
    this.toggle?.setAttribute('aria-expanded', String(open));
    if (open) {
      this.renderInventory();
      this.closeButton?.focus({ preventScroll: true });
    }
  }

  createDropPuff(position) {
    const root = new THREE.Group();
    root.position.copy(position);
    const geometry = this.geometry('comedic-drop-puff', () => new THREE.SphereGeometry(1, 8, 6));
    const material = new THREE.MeshBasicMaterial({ color: '#d6c2a4', transparent: true, opacity: 0.48, depthWrite: false });
    const blobs = [
      { x: -0.075, y: 0.015, z: 0, sx: 0.075, sy: 0.055, sz: 0.06 },
      { x: 0.055, y: 0.04, z: 0.025, sx: 0.065, sy: 0.075, sz: 0.055 },
      { x: 0.01, y: -0.015, z: -0.055, sx: 0.085, sy: 0.05, sz: 0.06 }
    ];
    for (const blob of blobs) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(blob.x, blob.y, blob.z);
      mesh.scale.set(blob.sx, blob.sy, blob.sz);
      mesh.renderOrder = 3;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
    }
    this.scene.add(root);
    this.dropPuffs.push({ root, material, elapsed: 0, life: 0.34 });
  }

  update(dt) {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    this.elapsed += safeDt;
    this.nearbyScanElapsed += safeDt;
    for (let i = this.dropPuffs.length - 1; i >= 0; i--) {
      const puff = this.dropPuffs[i];
      puff.elapsed += safeDt;
      const progress = Math.min(1, puff.elapsed / puff.life);
      puff.root.scale.setScalar(0.72 + progress * 1.18);
      puff.root.position.y += safeDt * 0.16;
      puff.material.opacity = 0.48 * (1 - progress);
      if (progress >= 1) {
        this.scene.remove(puff.root);
        puff.material.dispose();
        this.dropPuffs.splice(i, 1);
      }
    }
    this.physicsSaveElapsed += safeDt;
    for (const item of this.items) {
      if (!item.physical) {
        item.root.position.y = item.baseY + Math.sin(this.elapsed * 2.2 + item.root.userData.phase) * 0.022;
        item.ring.position.x = item.root.position.x;
        item.ring.position.z = item.root.position.z;
        continue;
      }
      // Physics owns the object's transform. The marker stays horizontal and snaps
      // to the actual collider beneath it, including the top of movable furniture.
      item.ring.position.x = item.root.position.x;
      item.ring.position.z = item.root.position.z;
      item.supportProbeElapsed += Math.min(0.05, Math.max(0, dt));
      const lastProbe = item.supportProbePosition;
      const supportNeedsRefresh = !lastProbe
        || Math.abs(item.root.position.x - lastProbe.x) > 0.025
        || Math.abs(item.root.position.y - lastProbe.y) > 0.025
        || Math.abs(item.root.position.z - lastProbe.z) > 0.025;
      // A settled object keeps its previous support hit. Probe again only after it moves,
      // or when it has never been probed; this removes repeated raycasts for idle pickups.
      if (item.supportProbeElapsed >= 0.12 && supportNeedsRefresh) {
        item.supportY = this.physics?.supportHeightAt(
          item.root.position.x,
          item.root.position.z,
          item.root.position.y + 0.24,
          item.id
        ) ?? null;
        item.supportProbeElapsed = 0;
        item.supportProbePosition = {
          x: item.root.position.x,
          y: item.root.position.y,
          z: item.root.position.z
        };
      }
      item.ring.position.y = Number.isFinite(item.supportY) ? item.supportY + 0.009 : item.root.position.y - 0.105;
    }

    if (this.heldType) {
      this.nearby = null;
      this.nearbyScanElapsed = 0;
    } else if (this.nearbyScanElapsed >= this.nearbyScanInterval) {
      // Proximity selection and its UI only need 30 Hz; physics and item visuals remain
      // updated at the fixed step. This halves repeated rule lookup/distance scans.
      this.nearby = this.findNearbyItem();
      this.nearbyScanElapsed = 0;
    }
    this.syncRingInstances();

    if (this.input.consumeInventoryToggle?.()) this.togglePanel();
    const dropRequested = this.input.consumeDrop?.();
    if (dropRequested && !this.levelMode) this.dropHeld();
    if (this.input.consumeInteract?.()) {
      const longInteract = this.input.consumeLongInteract?.();
      if (!this.levelMode) {
        if (longInteract) this.storeHeld();
        else this.interact();
      }
    }
    // Save moving drops occasionally, then one last time when each item settles.
    // This avoids a localStorage write every frame and prevents sleeping props from
    // needlessly triggering permanent periodic writes.
    if (this.physicsSaveElapsed >= 0.75) {
      const droppedPhysical = this.items.filter((item) => !item.persistent && item.physical);
      if (droppedPhysical.length) {
        const settledNow = [];
        let anyMoving = false;
        for (const item of droppedPhysical) {
          const body = item.prop
            ? this.physics?.dynamicPropsByObjectId.get(item.propId)?.body
            : this.physics?.looseObjectsById.get(item.id)?.body;
          if (!body) continue;
          const v = body.linvel();
          const moving = !body.isSleeping() && Math.hypot(v.x, v.y, v.z) > 0.08;
          if (moving) anyMoving = true;
          else if (body.isSleeping() && !item.physicsSettledSaved) settledNow.push(item);
        }
        if (anyMoving || settledNow.length) {
          this.saveState();
          for (const item of settledNow) item.physicsSettledSaved = true;
        }
      }
      this.physicsSaveElapsed = 0;
    }
    if (!this.levelMode) this.updateInteractionUI();
  }

  findNearbyItem() {
    const position = this.dog.group.position;
    let nearest = null;
    let nearestDistanceSq = Infinity;
    for (const item of this.items) {
      if (!item.pickupAllowed || !item.root?.visible) continue;
      const dx = item.root.position.x - position.x;
      const dz = item.root.position.z - position.z;
      const dy = Math.abs(item.root.position.y - position.y);
      const distanceSq = dx * dx + dz * dz;
      if (dy > item.pickupHeight || distanceSq > item.pickupRange * item.pickupRange || distanceSq >= nearestDistanceSq) continue;
      nearest = item;
      nearestDistanceSq = distanceSq;
    }
    return nearest;
  }

  attachHeldModel(type) {
    if (this.heldRoot?.parent) this.heldRoot.parent.remove(this.heldRoot);
    if (isPropToken(type)) {
      const objectId = type.slice(5);
      const root = this.propRoots.get(objectId);
      if (!root) {
        this.hud?.toast(`Objek ${objectId} tidak ditemukan; barang tetap aman di inventori.`);
        this.heldRoot = null;
        return;
      }
      const scale = Number(getTokenRule(type)?.presentation?.heldScale) || 0.64;
      root.parent?.remove(root);
      root.scale.setScalar(scale);
      root.position.set(0, -0.205, -0.735);
      root.rotation.set(0, 0, 0);
      this.dog.rig.headPivot.add(root);
      this.heldRoot = root;
      return;
    }
    if (!isItemType(type)) {
      this.heldRoot = null;
      return;
    }
    this.heldRoot = this.createModel(type);
    this.heldRoot.scale.setScalar(Number(getTokenRule(type)?.presentation?.heldScale) || 0.76);
    this.heldRoot.position.set(0, -0.205, -0.735);
    this.heldRoot.rotation.set(0, 0, 0);
    this.dog.rig.headPivot.add(this.heldRoot);
  }

  storeHeld() {
    if (!this.heldType) return;
    const slot = this.slots.findIndex((type) => type === null);
    if (slot < 0) {
      this.hud?.toast('Inventori penuh. Jatuhkan barang atau kosongkan slot.');
      return;
    }
    const mass = inventoryItemMassKg(this.heldType);
    const storedMass = this.slots.reduce((sum, token) => sum + (token ? inventoryItemMassKg(token) : 0), 0);
    const maxMass = Number(OBJECT_RULES.capacity?.maxInventoryMassKg ?? Infinity);
    if (!Number.isFinite(mass) || storedMass + mass > maxMass + 1e-6) {
      this.hud?.toast(`Batas berat inventori ${maxMass} kg tercapai. Jatuhkan atau keluarkan barang lain terlebih dahulu.`);
      return;
    }
    const itemName = getItemName(this.heldType);
    this.slots[slot] = this.heldType;
    this.heldRoot?.parent?.remove(this.heldRoot);
    this.heldRoot = null;
    this.heldType = null;
    playInteractionFx('equip');
    this.saveState();
    this.renderInventory();
    this.hud?.toast(`${itemName} disimpan ke inventori.`);
    this.updateInteractionUI(true);
  }

  interact() {
    if (this.heldType) {
      this.dropHeld();
      return;
    }

    if (!this.nearby) this.nearby = this.findNearbyItem();
    if (!this.nearby) {
      this.hud?.toast('Dekati barang yang bercincin hijau, lalu tekan E atau tombol PICK UP.');
      return;
    }

    const item = this.nearby;
    if (!isInventoryToken(item.type) || !canCarryObject(item.id, getInventoryTokenType(item.type))) {
      this.hud?.toast('Objek ini melewati batas berat atau pickup dinonaktifkan di object-rules.json.');
      return;
    }
    if (item.prop) {
      const suspended = this.physics?.suspendDynamicProp(item.propId);
      if (!suspended) {
        this.hud?.toast('Fisika objek belum bisa dihentikan dengan aman. Coba lagi sebentar.');
        return;
      }
      item.root.parent?.remove(item.root);
    } else {
      if (item.physical) this.physics?.removeLooseObject(item.id);
      this.scene.remove(item.root);
    }
    if (item.persistent) this.collected.add(item.id);
    this.releaseRingInstance(item);
    this.items = this.items.filter((candidate) => candidate !== item);
    this.heldType = item.type;
    this.attachHeldModel(item.type);
    playInteractionFx('pickup', item.type);
    this.saveState();
    this.hud?.toast(`${getItemName(item.type)} sekarang dibawa di mulut K-09.`);
    this.renderInventory();
    this.updateInteractionUI(true);
  }

  selectSlot(index) {
    if (index < 0 || index >= SLOT_COUNT) return;
    const selectedType = this.slots[index];
    if (!selectedType && !this.heldType) return;

    if (this.heldType && !selectedType) {
      const mass = inventoryItemMassKg(this.heldType);
      const storedMass = this.slots.reduce((sum, token) => sum + (token ? inventoryItemMassKg(token) : 0), 0);
      const maxMass = Number(OBJECT_RULES.capacity?.maxInventoryMassKg ?? Infinity);
      if (!Number.isFinite(mass) || storedMass + mass > maxMass + 1e-6) {
        this.hud?.toast(`Batas berat inventori ${maxMass} kg tercapai.`);
        return;
      }
      this.slots[index] = this.heldType;
      this.heldRoot?.parent?.remove(this.heldRoot);
      this.heldRoot = null;
      this.heldType = null;
      this.hud?.toast(`${getItemName(this.slots[index])} disimpan di slot ${index + 1}.`);
    } else if (this.heldType && selectedType) {
      const oldHeldType = this.heldType;
      const oldMass = inventoryItemMassKg(oldHeldType);
      const storedMass = this.slots.reduce((sum, token, slotIndex) => sum + (slotIndex === index || !token ? 0 : inventoryItemMassKg(token)), 0);
      const maxMass = Number(OBJECT_RULES.capacity?.maxInventoryMassKg ?? Infinity);
      if (!Number.isFinite(oldMass) || storedMass + oldMass > maxMass + 1e-6) {
        this.hud?.toast(`Batas berat inventori ${maxMass} kg tercapai.`);
        return;
      }
      this.slots[index] = oldHeldType;
      this.heldType = selectedType;
      this.attachHeldModel(selectedType);
      this.hud?.toast(`K-09 membawa ${getItemName(selectedType)}; ${getItemName(oldHeldType)} masuk ke slot ${index + 1}.`);
    } else {
      this.slots[index] = null;
      this.heldType = selectedType;
      this.attachHeldModel(selectedType);
      this.hud?.toast(`${getItemName(selectedType)} diambil dari slot ke mulut K-09.`);
    }

    playInteractionFx('equip');
    this.saveState();
    this.renderInventory();
    this.updateInteractionUI(true);
  }

  dropHeld() {
    if (!this.heldType) {
      this.hud?.toast('Tidak ada barang di mulut untuk dijatuhkan.');
      return;
    }
    if (Object.hasOwn(QUEST_ITEM_TYPES, this.heldType)) {
      this.hud?.toast('Benda misi level tidak dapat dijatuhkan.');
      return;
    }
    const type = this.heldType;
    this.heldRoot?.parent?.remove(this.heldRoot);
    this.heldRoot = null;
    this.heldType = null;
    const yaw = this.dog.group.rotation.y;
    const dogPosition = this.dog.group.position;
    this.dog.group.updateMatrixWorld(true);
    const rearX = Math.sin(yaw);
    const rearZ = Math.cos(yaw);
    const tailAnchor = this.dog.rig?.tailPivot;
    const tailWorld = tailAnchor
      ? tailAnchor.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(dogPosition.x, dogPosition.y + 0.72, dogPosition.z + rearZ * 0.65);

    // Emit from just beneath the tail base, never from in front of the dog's muzzle.
    // If a raised prop occupies that point, walk the release point back until it clears.
    const dropY = Math.max(dogPosition.y + 0.12, tailWorld.y - 0.34);
    const rearDistances = [0.28, 0.46, 0.66, 0.86, 1.06];
    let dropX = tailWorld.x + rearX * rearDistances[0];
    let dropZ = tailWorld.z + rearZ * rearDistances[0];
    for (const distance of rearDistances) {
      const testX = tailWorld.x + rearX * distance;
      const testZ = tailWorld.z + rearZ * distance;
      const testSurface = this.physics?.supportHeightAt(testX, testZ, 4.0) ?? null;
      dropX = testX;
      dropZ = testZ;
      if (!Number.isFinite(testSurface) || testSurface <= dropY + 0.07) break;
    }

    // Momentum is inherited from K-09's measured world velocity. A tiny rearward
    // ejection and spin make the release playful; Rapier gravity, friction, restitution,
    // and contact impulses determine the real fall, roll, bounce and final resting pose.
    const motion = this.dog.worldVelocity || { x: 0, y: 0, z: 0 };
    const linearVelocity = {
      x: (Number.isFinite(motion.x) ? motion.x : 0) + rearX * 0.34,
      y: (Number.isFinite(motion.y) ? motion.y : 0) * 0.72 + 0.22,
      z: (Number.isFinite(motion.z) ? motion.z : 0) + rearZ * 0.34
    };
    const angularVelocity = {
      x: 1.3 + (Number.isFinite(motion.z) ? motion.z : 0) * 0.12,
      y: (this.dynamicId % 2 ? 3.6 : -3.6),
      z: -1.0 + (Number.isFinite(motion.x) ? motion.x : 0) * 0.12
    };
    const releasePosition = new THREE.Vector3(dropX, dropY, dropZ);

    // One fast tail flick sells the joke; the animator naturally eases it back.
    if (tailAnchor) {
      tailAnchor.rotation.x += 0.19;
      tailAnchor.rotation.z += (this.dynamicId % 2 ? 0.13 : -0.13);
      const tailTip = this.dog.rig.parts.tail?.[1];
      if (tailTip) tailTip.rotation.y += (this.dynamicId % 2 ? 0.28 : -0.28);
    }
    this.createDropPuff(releasePosition);
    if (isPropToken(type)) {
      const objectId = type.slice(5);
      const root = this.propRoots.get(objectId);
      if (!root || !this.shelter?.root) {
        this.hud?.toast('Objek fisik tidak ditemukan. Data inventori tetap disimpan agar tidak hilang.');
        this.heldType = type;
        this.attachHeldModel(type);
        return;
      }
      this.shelter.root.add(root);
      root.scale.set(1, 1, 1);
      root.position.set(dropX, dropY, dropZ);
      root.rotation.set(0, yaw, 0);
      const restored = this.physics?.restoreDynamicProp(objectId, { x: dropX, y: dropY, z: dropZ }, root.quaternion, { linearVelocity, angularVelocity });
      if (!restored) {
        root.position.set(dropX, dropY, dropZ);
        this.hud?.toast('Objek dijatuhkan, tetapi fisika gagal dipulihkan. Objek tetap terlihat dan bisa dicoba lagi.');
      }
      this.collected.delete(type);
      this.createPropPickup(objectId, false, root);
      playInteractionFx('drop', type);
      this.physicsSaveElapsed = 0;
      this.saveState();
      this.renderInventory();
      this.hud?.toast(`${getItemName(type)} dijatuhkan dari bawah ekor K-09 💨`);
      this.updateInteractionUI(true);
      return;
    }
    this.createWorldPickup(`dropped-${++this.dynamicId}`, type, {
      x: dropX,
      y: dropY,
      z: dropZ
    }, false, true, { linearVelocity, angularVelocity });
    playInteractionFx('drop', type);
    this.physicsSaveElapsed = 0;
    this.saveState();
    this.renderInventory();
    this.hud?.toast(`Pfft! ${getItemName(type)} keluar dari bawah ekor K-09 💨`);
    this.updateInteractionUI(true);
  }

  renderInventory() {
    const count = this.slots.filter(Boolean).length;
    if (this.countLabel) this.countLabel.textContent = String(count);
    if (this.panelCountLabel) this.panelCountLabel.textContent = t('inventory.slotsUsed', { used: count, total: SLOT_COUNT });
    this.dropButton && (this.dropButton.disabled = !this.heldType);

    for (let index = 0; index < SLOT_COUNT; index++) {
      const button = this.slotButtons?.[index];
      if (!button) continue;
      const type = this.slots[index];
      button.classList.toggle('has-item', Boolean(type));
      button.replaceChildren();
      if (type) {
        const icon = document.createElement('span');
        icon.className = 'inventory-item-icon';
        const info = getItemInfo(type);
        icon.textContent = info?.icon || '📦';
        const name = document.createElement('small');
        name.textContent = info?.name || type;
        button.append(icon, name);
        button.title = t('inventory.slotItemTitle', { item: getItemName(type) });
        button.setAttribute('aria-label', t('inventory.slotItemAria', { index: index + 1, item: getItemName(type) }));
      } else {
        const empty = document.createElement('span');
        empty.className = 'inventory-slot-number';
        empty.textContent = String(index + 1).padStart(2, '0');
        const dash = document.createElement('small');
        dash.textContent = t('inventory.emptyLabel');
        button.append(empty, dash);
        button.title = this.heldType ? t('inventory.moveHeldToEmptySlot') : t('inventory.emptySlotTitle', { index: index + 1 });
        button.setAttribute('aria-label', t('inventory.emptySlotAriaShort', { index: index + 1 }));
      }
    }
  }

  setTeleportInteractActive(active) {
    const next = Boolean(active);
    if (this.teleportInteractActive === next) return;
    this.teleportInteractActive = next;
    this.updateInteractionUI(true);
  }

  updateInteractionUI(force = false) {
    const hasItem = !this.levelMode && Boolean(this.heldType || this.nearby);
    const teleportActive = this.teleportInteractActive === true;
    const canInteract = this.levelMode ? teleportActive : hasItem;
    const signature = (this.heldType
      ? `held:${this.heldType}:${this.slots.some((slot) => slot === null)}`
      : this.nearby ? `near:${this.nearby.id}` : 'none') + `:tp:${teleportActive}:level:${this.levelMode}`;
    if (!force && signature === this.lastInteractionSignature) return;
    this.lastInteractionSignature = signature;

    if (this.dropTouchButton) {
      this.dropTouchButton.disabled = !this.heldType;
      this.dropTouchButton.classList.toggle('is-available', Boolean(this.heldType));
    }

    const freeSlot = this.slots.some((slot) => slot === null);
    const label = teleportActive
      ? 'TELEPORT'
      : t(this.heldType ? 'inventory.dropLabel' : 'controls.pickUp');
    if (this.interactLabel) this.interactLabel.textContent = label;
    if (this.interactButton) this.interactButton.dataset.heldItem = String(Boolean(this.heldType));
    if (this.interactButton) {
      this.interactButton.hidden = this.levelMode && !teleportActive;
      this.interactButton.disabled = !canInteract;
      this.interactButton.setAttribute('aria-label', teleportActive
        ? 'Teleport to the upper parkour deck'
        : this.heldType
          ? (freeSlot ? t('inventory.storeFromMouthAria') : t('inventory.fullDropCarriedAria'))
          : this.nearby ? t('inventory.pickUpItemAria', { item: getItemName(this.nearby.type) }) : t('inventory.noItemNearbyAria'));
      this.interactButton.title = teleportActive
        ? 'Teleport ke dek parkur atas'
        : this.heldType
          ? (freeSlot ? t('inventory.tapDropHoldStoreTitle') : t('inventory.tapDropFullTitle'))
          : t('inventory.tapPickUpTitle');
      this.interactButton.classList.toggle('is-available', canInteract);
      this.interactButton.classList.toggle('is-teleport', teleportActive);
    }

    if (this.prompt && this.promptText) {
      this.prompt.hidden = !hasItem && !teleportActive;
      if (teleportActive) {
        this.promptText.textContent = 'TP Pad aktif. Tekan TELEPORT untuk menuju parkur atas.';
      } else if (this.heldType) {
        const freeSlots = this.slots.some((slot) => slot === null);
        this.promptText.textContent = freeSlots
          ? t('inventory.dropStorePrompt', { item: getItemName(this.heldType) })
          : t('inventory.fullDropPrompt', { item: getItemName(this.heldType) });
      } else if (this.nearby) {
        this.promptText.textContent = t('inventory.pickUpPrompt', { item: getItemName(this.nearby.type) });
      }
    }
  }

  dispose() {
    disposeInteractionFx();
    this.toggle?.removeEventListener('click', this.onToggleClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.dropButton?.removeEventListener('click', this.onDropClick);
    this.dropTouchButton?.removeEventListener('click', this.onTouchDropClick);
    window.removeEventListener('keydown', this.onEscape);
    document.removeEventListener('paw-haven-locale-change', this.onLocaleChange);
    for (const item of this.items) {
      if (item.prop) {
        this.physics?.suspendDynamicProp(item.propId);
        item.root.parent?.remove(item.root);
      } else {
        if (item.physical) this.physics?.removeLooseObject(item.id);
        this.scene.remove(item.root);
      }
      this.releaseRingInstance(item);
    }
    this.scene.remove(this.ringIdleMesh);
    this.scene.remove(this.ringActiveMesh);
    this.ringIdleMaterial?.dispose();
    this.ringActiveMaterial?.dispose();
    this.ringIdleMesh = null;
    this.ringActiveMesh = null;
    for (const puff of this.dropPuffs) {
      this.scene.remove(puff.root);
      puff.material.dispose();
    }
    this.dropPuffs.length = 0;
    if (this.heldRoot?.parent) this.heldRoot.parent.remove(this.heldRoot);
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.items = [];
    this.slotButtons = [];
    this.heldRoot = null;
  }
}
