import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from './palette.js';
import { AssetLoader } from '../core/AssetLoader.js';
import { buildFloor, buildShell, buildZones } from './Architecture.js';
import { makeDogHouse, makeBed, makeBowl, makeToy, buildFurniture } from './Props.js';
import { makePlant, buildPlantsAndDetails, buildLighting } from './Decorations.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from '../core/Localization.js';
import { getObjectRule } from './ObjectRules.js';



export class Shelter {
  constructor(scene) {
    this.scene = scene;
    this.solids = [];
    this.roomInteractions = [];
    this.materials = new Map();
    this.geometries = new Map();
    this.activeDynamicProp = null;
    this.dynamicPropCounter = 0;
    this.movablePropCounts = new Map();
    this.movableProps = new Map();
    this.seed = 749;
    this.assets = new AssetLoader();
    this.root = new THREE.Group();
    this.root.name = 'ShelterWorld';
    scene.add(this.root);
  }

  random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  material(hex, roughness = 0.78, metalness = 0) {
    const key = `${hex}|${roughness}|${metalness}`;
    // Interior faces must remain visible when the camera or character enters a hollow/closed prop.
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, side: THREE.DoubleSide, flatShading: true }));
    return this.materials.get(key);
  }
  geometry(key, create) { if (!this.geometries.has(key)) this.geometries.set(key, create()); return this.geometries.get(key); }
  beginMovableProp(name, x, y, z, options = {}) {
    if (this.activeDynamicProp) throw new Error('Movable props cannot be nested.');
    const group = new THREE.Group();
    const id = ++this.dynamicPropCounter;
    const instanceNumber = (this.movablePropCounts.get(name) || 0) + 1;
    this.movablePropCounts.set(name, instanceNumber);
    const objectId = `${name}-${instanceNumber}`;
    const rule = getObjectRule(objectId, name);
    const physics = rule.physics;
    const interaction = rule.interaction;
    const firstFinite = (...values) => values.find((value) => Number.isFinite(value));
    group.name = `Movable-${objectId}-${id}`;
    group.position.set(x, y, z);
    const prop = {
      id,
      objectId,
      name,
      rule,
      group,
      origin: { x, y, z },
      mass: Math.max(0.1, firstFinite(physics.massKg, options.mass, 1)),
      // Values in object-rules.json take precedence; Props.js values remain safe fallbacks.
      spawnLift: Math.max(0, firstFinite(physics.spawnLift, options.spawnLift, 0)),
      ccdEnabled: physics.ccdEnabled ?? Boolean(options.ccdEnabled),
      physicsEnabled: physics.enabled !== false,
      pickupAllowed: rule.pickup === true,
      interactionRadius: firstFinite(interaction.radius, options.interactionRadius, 0.6),
      interactionHeight: firstFinite(interaction.height, options.interactionHeight, 1.0),
      friction: firstFinite(physics.friction, options.friction, 0.65),
      restitution: firstFinite(physics.restitution, options.restitution, 0.08),
      linearDamping: firstFinite(physics.linearDamping, options.linearDamping, 0.55),
      angularDamping: firstFinite(physics.angularDamping, options.angularDamping, 1.25),
      gravityScale: firstFinite(physics.gravityScale, options.gravityScale, 1.0),
      canSleep: physics.canSleep ?? true,
      kickFactor: firstFinite(physics.kickFactor, options.kickFactor, 0.32),
      maxImpulse: firstFinite(physics.maxImpulse, options.maxImpulse, 4.2),
      interactionCooldown: firstFinite(options.interactionCooldown, 0.16)
    };
    group.userData.movableProp = { id: prop.id, objectId, name, mass: prop.mass, massKg: prop.mass };
    this.root.add(group);
    this.activeDynamicProp = prop;
    this.movableProps.set(objectId, prop);
    return prop;
  }
  endMovableProp() { this.activeDynamicProp = null; }
  dynamicSolidMetadata() {
    return this.activeDynamicProp?.physicsEnabled ? { dynamicProp: this.activeDynamicProp } : {};
  }
  addMesh(geometry, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    const activeProp = this.activeDynamicProp;
    mesh.position.set(x - (activeProp?.origin.x ?? 0), y - (activeProp?.origin.y ?? 0), z - (activeProp?.origin.z ?? 0));
    if (opts.rotation) mesh.rotation.set(opts.rotation.x || 0, opts.rotation.y || 0, opts.rotation.z || 0);
    if (opts.scale) mesh.scale.set(opts.scale.x || 1, opts.scale.y || 1, opts.scale.z || 1);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    if (opts.name) mesh.name = opts.name;
    if (activeProp) activeProp.group.add(mesh);
    else this.root.add(mesh);
    if (opts.solid) this.solids.push({
      x, y, z, sx: opts.solid.sx, sy: opts.solid.sy, sz: opts.solid.sz,
      ...this.dynamicSolidMetadata(),
      shape: opts.solid.shape || 'cuboid',
      radius: opts.solid.radius,
      halfHeight: opts.solid.halfHeight,
      roundRadius: opts.solid.roundRadius || 0,
      rotation: opts.rotation || { x: 0, y: 0, z: 0 }
    });
    return mesh;
  }
  box(x, y, z, sx, sy, sz, color, opts = {}) {
    const rounded = opts.rounded ?? false;
    const key = rounded ? `rbox:${sx}:${sy}:${sz}:${opts.radius ?? 0.08}` : `box:${sx}:${sy}:${sz}`;
    const geo = this.geometry(key, () => rounded
      ? new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(opts.radius ?? 0.08, sx / 3, sy / 3, sz / 3))
      : new THREE.BoxGeometry(sx, sy, sz));
    const mesh = this.addMesh(geo, this.material(color, opts.roughness ?? 0.8, opts.metalness ?? 0), x, y, z, opts);
    // Preserve rounded geometry metadata for Rapier. PhysicsWorld subtracts the
    // border radius from the inner half-extents so the rounded collider's outside size
    // matches the visible mesh exactly instead of adding invisible height or width.
    const roundRadius = rounded
      ? Math.min(opts.radius ?? 0.08, sx / 3, sy / 3, sz / 3)
      : 0;
    if (opts.solid) {
      const s = opts.solid;
      this.solids[this.solids.length - 1] = {
        x, y, z, sx: s.sx ?? sx, sy: s.sy ?? sy, sz: s.sz ?? sz,
        shape: s.shape || 'cuboid', radius: s.radius, halfHeight: s.halfHeight,
        roundRadius: s.roundRadius ?? (roundRadius > 0 ? Math.min(roundRadius, s.sx ?? sx, s.sy ?? sy, s.sz ?? sz) : 0),
        rotation: opts.rotation || { x: 0, y: 0, z: 0 },
        ...this.dynamicSolidMetadata()
      };
    } else if (
      opts.collidable !== false
      && y - sy * 0.5 < 1.65 && y + sy * 0.5 > 0.045
      && sx >= 0.12 && sy >= 0.06 && sz >= 0.12
      && Math.abs(x) < 20.2 && Math.abs(z) < 14.4
    ) {
      // Ground-level structural boxes and furniture pieces are solid by default unless explicitly decorative.
      // Rounded boxes keep the same edge profile in Rapier as the visible RoundedBoxGeometry.
      this.solids.push({
        x, y, z, sx: sx * 0.5, sy: sy * 0.5, sz: sz * 0.5,
        roundRadius: roundRadius > 0 ? Math.min(roundRadius, sx * 0.5, sy * 0.5, sz * 0.5) : 0,
        rotation: opts.rotation || { x: 0, y: 0, z: 0 },
        ...this.dynamicSolidMetadata()
      });
    }
    return mesh;
  }
  sphere(x, y, z, sx, sy, sz, color, opts = {}) {
    const geo = this.geometry(`sphere:${opts.detail ?? 16}`, () => new THREE.SphereGeometry(1, opts.detail ?? 16, Math.max(8, (opts.detail ?? 16) >> 1)));
    const solid = opts.solid ? { ...opts.solid } : undefined;
    if (solid && Math.abs(sx - sy) < 1e-6 && Math.abs(sy - sz) < 1e-6) {
      // Uniform spheres use a ball collider, not a square cuboid around the curved surface.
      solid.shape = 'ball';
      solid.radius = sx;
      solid.sx ??= sx; solid.sy ??= sy; solid.sz ??= sz;
    }
    return this.addMesh(geo, this.material(color, opts.roughness ?? 0.7, opts.metalness ?? 0), x, y, z, { ...opts, solid, scale: { x: sx, y: sy, z: sz } });
  }
  cylinder(x, y, z, radiusTop, radiusBottom, height, color, opts = {}) {
    const geo = this.geometry(`cyl:${radiusTop}:${radiusBottom}:${height}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16, 1));
    const solid = opts.solid ? {
      ...opts.solid,
      shape: opts.solid.shape || 'cylinder',
      radius: opts.solid.radius ?? Math.max(radiusTop, radiusBottom),
      halfHeight: opts.solid.halfHeight ?? height * 0.5
    } : undefined;
    return this.addMesh(geo, this.material(color, opts.roughness ?? 0.7, opts.metalness ?? 0), x, y, z, { ...opts, solid });
  }
  torus(x, y, z, radius, tube, color, opts = {}) {
    const geo = this.geometry(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 24));
    const { solid, ...meshOpts } = opts;
    const mesh = this.addMesh(geo, this.material(color, opts.roughness ?? 0.6, opts.metalness ?? 0), x, y, z, meshOpts);
    if (solid) {
      // One bounding cuboid fills a ring's hole and becomes an invisible raised platform.
      // Overlapping ball colliders follow the actual torus tube without blocking its centre; use twelve instead of twenty.
      // Their diameter stays slightly larger than the centre-to-centre spacing, preserving a continuous collision ring with fewer Rapier colliders.
      const rotation = opts.rotation || { x: 0, y: 0, z: 0 };
      const euler = new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0, 'XYZ');
      const segments = 12;
      for (let i = 0; i < segments; i++) {
        const angle = (i + 0.5) * Math.PI * 2 / segments;
        const point = new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0).applyEuler(euler);
        this.solids.push({
          x: x + point.x, y: y + point.y, z: z + point.z,
          sx: tube, sy: tube, sz: tube, shape: 'ball', radius: tube,
          rotation: { x: 0, y: 0, z: 0 },
          ...this.dynamicSolidMetadata()
        });
      }
    }
    return mesh;
  }
  label(text, x, y, z, width, height, bg = '#d9e8d6', fg = '#385b48', opts = {}) {
    const texture = this.assets.createLabelTexture(text, { background: bg, foreground: fg });
    const mesh = this.addMesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, side: THREE.DoubleSide }), x, y, z, { castShadow: false, receiveShadow: false });
    if (opts.rotationY != null) mesh.rotation.y = opts.rotationY;
    return mesh;
  }

  async build(onProgress = async () => {}) {
    this.buildFloor(); await onProgress(0.12, t('loading.floor'));
    this.buildShell(); await onProgress(0.3, t('loading.shell'));
    this.buildZones(); await onProgress(0.43, t('loading.zones'));
    this.buildFurniture();
    this.optimizeMovablePropMeshes();
    await onProgress(0.64, t('loading.furniture'));
    this.buildPlantsAndDetails(); await onProgress(0.82, t('loading.details'));
    this.buildLighting(); await onProgress(0.94, t('loading.lighting'));
    this.optimizeStaticMeshes();
    await onProgress(0.98, t('loading.optimize'));
    return this.solids;
  }

  optimizeMovablePropMeshes() {
    // Movable props remain independent rigid bodies, but their static visual pieces can
    // share draw calls. Collider definitions live in this.solids and are never merged.
    let batchedMeshes = 0;
    let removedMeshes = 0;

    for (const prop of this.movableProps.values()) {
      const group = prop.group;
      if (!group || group.children.length < 2) continue;
      const buckets = new Map();

      for (const object of [...group.children]) {
        if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh
          || object.parent !== group || !object.geometry || object.userData?.popClaySurface) continue;
        if (Array.isArray(object.material)) continue;
        const material = object.material;
        if (!material?.isMeshStandardMaterial || material.map || material.transparent
          || material.opacity < 0.999 || material.vertexColors || material.wireframe) continue;
        if (object.geometry.morphAttributes && Object.keys(object.geometry.morphAttributes).length) continue;

        const attributes = Object.keys(object.geometry.attributes).sort().map((name) => {
          const attribute = object.geometry.attributes[name];
          return [name, attribute.itemSize, attribute.normalized ? 1 : 0, attribute.array.constructor.name].join(':');
        }).join(',');
        if (object.matrixAutoUpdate) object.updateMatrix();
        const popClayType = object.userData?.popClayType || 'environment';
        const key = [
          material.uuid, popClayType,
          object.castShadow ? 1 : 0,
          object.receiveShadow ? 1 : 0,
          object.geometry.index ? 1 : 0,
          attributes
        ].join('|');
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            material, popClayType,
            castShadow: object.castShadow,
            receiveShadow: object.receiveShadow,
            objects: [], geometries: []
          };
          buckets.set(key, bucket);
        }

        // The source geometry may be cached and shared by other props; bake only into a clone.
        const baked = object.geometry.clone();
        baked.applyMatrix4(object.matrix);
        baked.clearGroups();
        bucket.objects.push(object);
        bucket.geometries.push(baked);
      }

      for (const bucket of buckets.values()) {
        if (bucket.objects.length < 2) {
          for (const geometry of bucket.geometries) geometry.dispose();
          continue;
        }

        let merged = null;
        try {
          merged = mergeGeometries(bucket.geometries, false);
        } catch (error) {
          console.warn('Skipping one incompatible movable-prop mesh batch.', prop.objectId, error);
        }
        for (const geometry of bucket.geometries) geometry.dispose();
        if (!merged) continue;

        merged.clearGroups();
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.name = 'MovablePropBatch-' + prop.objectId;
        mesh.userData.popClayType = bucket.popClayType;
        // Small kickable toys and trinkets should not enter the camera wall-raycast set.
        mesh.userData.cameraIgnore = bucket.popClayType === 'pop';
        mesh.castShadow = bucket.castShadow;
        mesh.receiveShadow = bucket.receiveShadow;
        mesh.frustumCulled = true;
        group.add(mesh);

        for (const object of bucket.objects) {
          group.remove(object);
          removedMeshes += 1;
        }
        batchedMeshes += 1;
      }
    }

    this.movableBatchStats = { batchedMeshes, removedMeshes };
  }

  optimizeStaticMeshes() {
    // Bake transforms into compatible static geometry and batch it by shared material.
    // Labels, instanced floor tiles, transparent meshes and animated character meshes stay separate.
    this.root.updateMatrixWorld(true);
    const buckets = new Map();
    // Keep merged geometry local to 10 m sectors so frustum culling can skip unseen parts of the shelter.
    const batchSize = 10;
    for (const object of [...this.root.children]) {
      // Preserve explicitly tagged floor surfaces so Low-profile material routing can keep them glossy.
      if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.parent !== this.root || !object.geometry || object.userData?.popClaySurface) continue;
      if (Array.isArray(object.material)) continue;
      const material = object.material;
      if (!material?.isMeshStandardMaterial || material.map || material.transparent || material.opacity < 0.999 || material.vertexColors || material.wireframe) continue;
      if (object.geometry.morphAttributes && Object.keys(object.geometry.morphAttributes).length) continue;

      const attributes = Object.keys(object.geometry.attributes).sort().map((name) => {
        const attribute = object.geometry.attributes[name];
        return [name, attribute.itemSize, attribute.normalized ? 1 : 0, attribute.array.constructor.name].join(':');
      }).join(',');
      object.updateWorldMatrix(true, false);
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const worldBounds = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      const worldSize = worldBounds.getSize(new THREE.Vector3());
      // Keep long walls/rafters as individually culled meshes instead of giving an entire sector a huge bound.
      if (worldSize.x > batchSize || worldSize.y > batchSize || worldSize.z > batchSize) continue;
      const worldPosition = worldBounds.getCenter(new THREE.Vector3());
      const sectorX = Math.floor(worldPosition.x / batchSize);
      const sectorZ = Math.floor(worldPosition.z / batchSize);
      const popClayType = object.userData?.popClayType || 'environment';
      const key = [sectorX, sectorZ, material.uuid, popClayType, object.castShadow ? 1 : 0, object.receiveShadow ? 1 : 0, object.geometry.index ? 1 : 0, attributes].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, popClayType, castShadow: object.castShadow, receiveShadow: object.receiveShadow, objects: [], geometries: [] };
        buckets.set(key, bucket);
      }
      const baked = object.geometry.clone();
      baked.applyMatrix4(object.matrixWorld);
      baked.clearGroups();
      bucket.objects.push(object);
      bucket.geometries.push(baked);
    }

    let batchedMeshes = 0;
    let removedMeshes = 0;
    for (const bucket of buckets.values()) {
      if (bucket.objects.length < 2) {
        for (const geometry of bucket.geometries) geometry.dispose();
        continue;
      }
      let merged = null;
      try {
        merged = mergeGeometries(bucket.geometries, false);
      } catch (error) {
        console.warn('Skipping one incompatible static mesh batch.', error);
      }
      for (const geometry of bucket.geometries) geometry.dispose();
      if (!merged) continue;

      merged.clearGroups();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.name = 'ShelterStaticBatch';
      mesh.userData.popClayType = bucket.popClayType;
      // Small pop-style props (toys, plush figures and ornaments) are not camera blockers.
      mesh.userData.cameraIgnore = bucket.popClayType === 'pop';
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.frustumCulled = true;
      this.root.add(mesh);
      for (const object of bucket.objects) {
        this.root.remove(object);
        removedMeshes += 1;
      }
      batchedMeshes += 1;
    }
    this.root.updateMatrixWorld(true);
    this.batchStats = { batchedMeshes, removedMeshes };
  }

  buildFloor() { return buildFloor(this); }

  buildShell() { return buildShell(this); }

  fenceRun(x1, x2, z, color = '#8fb69a', y = 0.58, options = {}) {
    const center = (x1 + x2) / 2; const length = Math.abs(x2 - x1);
    this.box(center, y, z, length, 0.11, 0.12, color, { solid: { sx: length / 2, sy: 0.055, sz: 0.06 }, rounded: true });
    this.box(center, y + 0.42, z, length, 0.09, 0.12, '#b2cdb0', { solid: { sx: length / 2, sy: 0.045, sz: 0.06 }, rounded: true });

    // Repeated pickets share one instanced draw while keeping their individual Rapier solids.
    const postPositions = [];
    const firstPostX = x1 + (options.skipStartPost === true ? 1.0 : 0.0);
    for (let x = firstPostX; x <= x2 + 0.01; x += 1.0) postPositions.push(x);
    const postGeometry = this.geometry('fence-post:0.1:1:0.15', () => new RoundedBoxGeometry(0.1, 1.0, 0.15, 3, 0.025));
    const postMaterial = this.material(color, 0.8, 0);
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, postPositions.length);
    posts.name = 'FencePosts';
    const dummy = new THREE.Object3D();
    for (let i = 0; i < postPositions.length; i++) {
      const x = postPositions[i];
      dummy.position.set(x, 0.5, z);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      this.solids.push({ x, y: 0.5, z, sx: 0.05, sy: 0.5, sz: 0.075, rotation: { x: 0, y: 0, z: 0 } });
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.receiveShadow = true;
    this.root.add(posts);
  }

  buildZones() { return buildZones(this); }

  makeDogHouse(x, z, color, roofColor) { return makeDogHouse(this, x, z, color, roofColor); }

  makeBed(x, z, color, pillow = '#f5e7c8') { return makeBed(this, x, z, color, pillow); }

  makeBowl(x, z, color) { return makeBowl(this, x, z, color); }

  makeToy(x, z, kind = 'ball', color = PALETTE.coral) { return makeToy(this, x, z, kind, color); }

  buildFurniture() { return buildFurniture(this); }

  makePlant(x, z, scale = 1, potColor = '#d7a28e') { return makePlant(this, x, z, scale, potColor); }

  buildPlantsAndDetails() { return buildPlantsAndDetails(this); }

  buildLighting() { return buildLighting(this); }

  updateRoomInteractions(dt, dog, physics) {
    for (const interaction of this.roomInteractions) interaction.update?.(dt, dog, physics);
  }

  dispose() {
    for (const interaction of this.roomInteractions) {
      try { interaction.dispose?.(); } catch (error) { console.warn('Room interaction cleanup was skipped safely.', error); }
    }
    this.roomInteractions.length = 0;
    const cachedGeometries = new Set(this.geometries.values());
    const cachedMaterials = new Set(this.materials.values());
    this.root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry && !cachedGeometries.has(obj.geometry)) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) if (material && !cachedMaterials.has(material)) { material.map?.dispose(); material.dispose(); }
    });
    for (const material of this.materials.values()) material.dispose();
    for (const geo of this.geometries.values()) geo.dispose();
    this.assets.dispose();
    this.root.parent?.remove(this.root);
  }
}
