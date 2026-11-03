import RAPIER from '@dimforge/rapier3d-compat';
import { playInteractionFx } from '../world/sound/InteractionAudio.js';
import { getObjectRule } from '../world/ObjectRules.js';
import WORLD_RULES from '../world/worldrules.json';

const MAX_FOOT_STEP_HEIGHT = 0.30;
const GROUND_PROBE_MAX_DROP = 0.12;
// Allow a small upward correction when landing on the top of a raised prop.
const GROUND_PROBE_MAX_RISE = 0.10;
const MAX_WALKABLE_SLOPE_ANGLE = 38 * Math.PI / 180;
const MIN_WALKABLE_NORMAL_Y = Math.cos(MAX_WALKABLE_SLOPE_ANGLE);
const SLOPE_NORMAL_ALIGNMENT = Math.cos(8 * Math.PI / 180);
const SLOPE_PLANE_TOLERANCE = 0.035;
const GROUND_SUPPORT_MAX_SPREAD = 0.035;
const FOOT_SUPPORT_CLUSTER_EPSILON = 0.035;
const GROUND_PROBE_OFFSETS = Object.freeze([0, -0.27, 0.27]);
const FOOTPRINT_OFFSETS = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 0, z: -0.14 }),
  Object.freeze({ x: 0, z: 0.105 })
]);

let rapierRuntimePromise = null;

export class PhysicsWorld {
  static prepareRuntime() {
    if (!rapierRuntimePromise) rapierRuntimePromise = RAPIER.init();
    return rapierRuntimePromise;
  }

  static async create(solids = []) {
    await PhysicsWorld.prepareRuntime();
    return new PhysicsWorld(solids);
  }

  constructor(solids) {
    this.api = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = 1 / 60;
    this.fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.dynamicProps = [];
    this.dynamicPropsById = new Map();
    this.dynamicPropsByObjectId = new Map();
    this.suspendedDynamicPropsByObjectId = new Map();
    // Loose pickup objects use the same Rapier world as furniture, so they can land
    // on floors, tables, beds, or other movable props instead of hovering in Three.js.
    this.looseObjects = [];
    this.looseObjectsById = new Map();
    this.previousPawPositions = new Map();
    // Scratch values are reused on each fixed movement tick to limit temporary garbage.
    this.requestedMoveScratch = { x: 0, y: 0, z: 0 };
    this.rotationScratch = { x: 0, y: 0, z: 0, w: 1 };
    this.moveResultScratch = { grounded: false, movement: null };
    // Tile centres are y=0.04 with 0.075 m thickness, so their visible top is y=0.0775.
    // Keep the support plane aligned with that surface; paw IK then needs no artificial lift.
    const floor = RAPIER.ColliderDesc.cuboid(21.5, 0.15, 15.5).setTranslation(0, -0.0725, 0).setFriction(0.9);
    this.world.createCollider(floor, this.fixedBody);
    for (const s of solids) {
      // A malformed decorative collider must not abort the whole game startup and strand
      // the player on the loading screen. Validate every dimension before crossing WASM.
      if (![s.x, s.y, s.z, s.sx, s.sy, s.sz].every(Number.isFinite)) continue;
      if (!(s.sx > 0 && s.sy > 0 && s.sz > 0)) continue;

      try {
        const minExtent = Math.min(s.sx, s.sy, s.sz);
        // Keep the rounding radius strictly inside every half-extent for Rapier's rounded shapes.
        const roundRadius = Number.isFinite(s.roundRadius)
          ? Math.max(0, Math.min(s.roundRadius, minExtent * 0.9))
          : 0;
        let shape;
        if (s.shape === 'ball' && Number.isFinite(s.radius) && s.radius > 0) {
          shape = RAPIER.ColliderDesc.ball(s.radius);
        } else if (s.shape === 'capsule' && Number.isFinite(s.halfHeight) && s.halfHeight > 0 && Number.isFinite(s.radius) && s.radius > 0) {
          shape = RAPIER.ColliderDesc.capsule(s.halfHeight, s.radius);
        } else if (s.shape === 'cylinder' && Number.isFinite(s.halfHeight) && s.halfHeight > 0 && Number.isFinite(s.radius) && s.radius > 0) {
          shape = RAPIER.ColliderDesc.cylinder(s.halfHeight, s.radius);
        } else if (roundRadius > 0.001) {
          // Rapier's borderRadius is added outside the inner cuboid. Subtract it
          // from the core half-extents so the collider's OUTER dimensions still
          // exactly match the visible mesh instead of becoming taller/wider.
          shape = RAPIER.ColliderDesc.roundCuboid(
            Math.max(0.001, s.sx - roundRadius),
            Math.max(0.001, s.sy - roundRadius),
            Math.max(0.001, s.sz - roundRadius),
            roundRadius
          );
        } else {
          shape = RAPIER.ColliderDesc.cuboid(s.sx, s.sy, s.sz);
        }

        let ownerBody = this.fixedBody;
        let colliderPosition = { x: s.x, y: s.y, z: s.z };
        const prop = s.dynamicProp || null;
        if (prop) {
          let record = this.dynamicPropsById.get(prop.id);
          if (!record) {
            const bodyY = prop.origin.y + prop.spawnLift;
            // Static puzzle platforms get fixed bodies, not heavyweight dynamic bodies
            // converted to kinematic every frame. Their colliders can still be toggled
            // by the timed-memory-block mechanic through dynamicPropsById.
            const bodyDesc = prop.isStatic
              ? RAPIER.RigidBodyDesc.fixed().setTranslation(prop.origin.x, bodyY, prop.origin.z)
              : RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(prop.origin.x, bodyY, prop.origin.z)
                .setLinearDamping(prop.linearDamping)
                .setAngularDamping(prop.angularDamping)
                .setAdditionalMass(prop.mass)
                .setCanSleep(prop.canSleep ?? true)
                .setCcdEnabled(prop.ccdEnabled);
            if (!prop.isStatic) bodyDesc.setGravityScale?.(prop.gravityScale ?? 1);
            const body = this.world.createRigidBody(bodyDesc);
            // Start the visual group at the exact rigid-body transform, avoiding a first-frame pop.
            prop.group.position.set(prop.origin.x, bodyY, prop.origin.z);
            record = { prop, group: prop.group, body, isStatic: prop.isStatic === true, cooldown: 0, contactLatched: false, wasSleeping: false, solidSources: [], suspended: false };
            this.dynamicPropsById.set(prop.id, record);
            if (prop.objectId) this.dynamicPropsByObjectId.set(prop.objectId, record);
            // Fixed puzzle bodies remain addressable by ID for collider toggles, but are
            // excluded from dynamic syncing, paw-impact scans, and moving-platform updates.
            if (!prop.isStatic) this.dynamicProps.push(record);
          }
          ownerBody = record.body;
          colliderPosition = {
            x: s.x - prop.origin.x,
            y: s.y - prop.origin.y,
            z: s.z - prop.origin.z
          };
        }
        const desc = shape.setTranslation(colliderPosition.x, colliderPosition.y, colliderPosition.z)
          // Low collider density keeps the declared kg mass dominant while retaining useful angular inertia from each shape.
          .setDensity(prop ? 0.1 : 1)
          .setFriction(prop?.friction ?? s.friction ?? 0.12)
          .setRestitution(prop?.restitution ?? 0.01);
        const e = s.rotation || { x: 0, y: 0, z: 0 };
        if (![e.x || 0, e.y || 0, e.z || 0].every(Number.isFinite)) {
          throw new Error('Collider rotation contains a non-finite angle.');
        }
        if (Math.abs(e.x || 0) + Math.abs(e.y || 0) + Math.abs(e.z || 0) > 1e-6) {
          // Rapier expects a quaternion. Match Three.js Euler XYZ so rotated ramps/roof pieces
          // collide along their visible slope instead of acting like invisible axis-aligned walls.
          const c1 = Math.cos((e.x || 0) / 2), s1 = Math.sin((e.x || 0) / 2);
          const c2 = Math.cos((e.y || 0) / 2), s2 = Math.sin((e.y || 0) / 2);
          const c3 = Math.cos((e.z || 0) / 2), s3 = Math.sin((e.z || 0) / 2);
          desc.setRotation({
            x: s1 * c2 * c3 + c1 * s2 * s3,
            y: c1 * s2 * c3 - s1 * c2 * s3,
            z: c1 * c2 * s3 + s1 * s2 * c3,
            w: c1 * c2 * c3 - s1 * s2 * s3
          });
        }
        this.world.createCollider(desc, ownerBody);
        if (prop) {
          const record = this.dynamicPropsById.get(prop.id);
          if (record) record.solidSources.push({
            x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz,
            shape: s.shape, radius: s.radius, halfHeight: s.halfHeight,
            roundRadius: s.roundRadius || 0,
            rotation: { ...(s.rotation || { x: 0, y: 0, z: 0 }) }
          });
        }
      } catch (error) {
        console.warn('Skipping one invalid shelter collider to keep startup available.', s, error);
      }
    }

    // Keep the authoritative Rapier character body aligned with the same world-rules spawn used by RobotDog.js.
    // The rendered dog's root is at floor level; the torso body sits 0.78 m above that root.
    const playerSpawn = WORLD_RULES.playerSpawn ?? { x: 0, y: 0.0775, z: 2.5, yaw: 0 };
    const spawnYaw = Number.isFinite(playerSpawn.yaw) ? playerSpawn.yaw : 0;
    const spawnBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(playerSpawn.x, playerSpawn.y + 0.78, playerSpawn.z)
      .setRotation({ x: 0, y: Math.sin(spawnYaw * 0.5), z: 0, w: Math.cos(spawnYaw * 0.5) });
    this.body = this.world.createRigidBody(spawnBodyDesc);
    // A compact torso collider protects the core without turning all four legs into one rigid block.
    // Its bottom aligns with the floor; paws resolve raised surfaces separately through raycasts and IK.
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(0.23, 0.38, 0.47, 0.15)
        .setTranslation(0, -0.25, 0)
        .setFriction(0)
        .setRestitution(0),
      this.body
    );
    this.controller = this.world.createCharacterController(0.012);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    // The character controller transfers momentum into loose props when K-09 bumps them.
    this.controller.setApplyImpulsesToDynamicBodies(true);
    // Keep whole-body auto-step near curb height. Raised furniture should be contacted
    // by individual paws through multi-point raycasts and IK, not lift the torso wholesale.
    this.controller.setMaxSlopeClimbAngle(MAX_WALKABLE_SLOPE_ANGLE);
    // Keep the slide threshold above the climb threshold so walkable ramps do not
    // enter the controller's slide behavior while the dog is actively climbing.
    this.controller.setMinSlopeSlideAngle(42 * Math.PI / 180);
    // Never lift the entire chassis to climb a furniture collider. Raised surfaces are
    // handled by the individual foot IK below; the body should slide against tall props.
    this.controller.disableAutostep();
    this.controller.enableSnapToGround(0.06);
    this.controller.setCharacterMass(32);
  }

  move(desiredTranslation, yaw = 0, grounded = false) {
    // Rapier's controller performs a shape cast; sanitize its target and reject oversized frame spikes.
    const requested = this.requestedMoveScratch;
    requested.x = Number.isFinite(desiredTranslation?.x) ? desiredTranslation.x : 0;
    requested.y = Number.isFinite(desiredTranslation?.y) ? desiredTranslation.y : 0;
    requested.z = Number.isFinite(desiredTranslation?.z) ? desiredTranslation.z : 0;
    // Limit horizontal travel and vertical travel independently. Scaling the whole
    // 3D vector made a fast fall shrink X/Z too, causing a visible speed drop mid-run.
    const requestedHorizontalLength = Math.hypot(requested.x, requested.z);
    if (requestedHorizontalLength > 0.16) {
      const factor = 0.16 / requestedHorizontalLength;
      requested.x *= factor;
      requested.z *= factor;
    }
    requested.y = Math.max(-0.16, Math.min(0.16, requested.y));
    // Grounded slope assistance: sample the walkable plane ahead and add only the
    // vertical rise implied by its normal. This guides the kinematic sweep uphill instead
    // of repeatedly pressing the torso into a shallow ramp and losing ground contact.
    const horizontalDistance = Math.hypot(requested.x, requested.z);
    if (grounded && requested.y < 0 && horizontalDistance > 1e-4) {
      const directionX = requested.x / horizontalDistance;
      const directionZ = requested.z / horizontalDistance;
      const current = this.body.translation();
      const sampleDistance = 0.42 + horizontalDistance;
      const ray = new this.api.Ray(
        {
          x: current.x + directionX * sampleDistance,
          y: current.y + 0.65,
          z: current.z + directionZ * sampleDistance
        },
        { x: 0, y: -1, z: 0 }
      );
      const hit = this.world.castRayAndGetNormal(ray, 1.9, true, undefined, undefined, this.collider, this.body);
      const normal = hit?.normal;
      if (normal && Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z)
        && normal.y >= MIN_WALKABLE_NORMAL_Y && normal.y < 0.9995) {
        const uphillGrade = -(normal.x * directionX + normal.z * directionZ) / normal.y;
        if (uphillGrade > 0.005) {
          const riseFromSlope = uphillGrade * horizontalDistance;
          const riseLimit = Math.min(
            horizontalDistance * Math.tan(MAX_WALKABLE_SLOPE_ANGLE),
            Math.sqrt(Math.max(0, 0.16 * 0.16 - horizontalDistance * horizontalDistance))
          );
          requested.y = Math.max(requested.y, Math.min(riseFromSlope, riseLimit));
        }
      }
    }
    // Rotate the collision shape before the character sweep so turning into a nearby prop uses the same footprint as the visible robot.
    const halfYaw = (Number.isFinite(yaw) ? yaw : 0) * 0.5;
    const rotation = this.rotationScratch;
    rotation.x = 0;
    rotation.y = Math.sin(halfYaw);
    rotation.z = 0;
    rotation.w = Math.cos(halfYaw);
    this.body.setRotation(rotation, true);
    this.controller.computeColliderMovement(this.collider, requested);
    const delta = this.controller.computedMovement();
    const current = this.body.translation();
    this.body.setNextKinematicTranslation({ x: current.x + delta.x, y: current.y + delta.y, z: current.z + delta.z });
    this.body.setNextKinematicRotation(rotation);
    this.moveResultScratch.grounded = this.controller.computedGrounded();
    this.moveResultScratch.movement = delta;
    return this.moveResultScratch;
  }

  setPosition(position) {
    if (!this.body || !position) return;
    const safe = {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0.8575,
      z: Number.isFinite(position.z) ? position.z : 0
    };
    this.body.setTranslation(safe, true);
    this.body.setNextKinematicTranslation(safe);
  }

  // Long vertical support rays let a descending character find a raised prop top
  // before its torso penetrates the surface. Candidate detection is intentionally wider
  // than the grounded band; Movement only snaps when the feet are near or cross that plane.
  probeGround(rootY, yaw = 0, controllerGrounded = false) {
    if (!this.world || !this.body || !Number.isFinite(rootY)) return { grounded: false, surfaceY: null, supportPoints: 0 };
    const originY = rootY + 1.30;
    const offsets = GROUND_PROBE_OFFSETS;
    const cosYaw = Math.cos(yaw || 0);
    const sinYaw = Math.sin(yaw || 0);
    const bodyPos = this.body.translation();
    const supportHits = [];
    for (let index = 0; index < offsets.length; index++) {
      const localZ = offsets[index];
      const x = bodyPos.x + sinYaw * localZ;
      const z = bodyPos.z + cosYaw * localZ;
      const ray = new this.api.Ray({ x, y: originY, z }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRayAndGetNormal(ray, 1.62, true, undefined, undefined, this.collider, this.body);
      if (!hit || !Number.isFinite(hit.timeOfImpact) || hit.timeOfImpact < 0.025) continue;
      if (!Number.isFinite(hit.normal?.y) || hit.normal.y < MIN_WALKABLE_NORMAL_Y) continue;
      const surfaceY = originY - hit.timeOfImpact;
      const gap = rootY - surfaceY;
      // Fast path: when Rapier's controller confirms support and the centre ray is already
      // almost perfectly aligned, side rays add little information. Keep the full 3-ray
      // plane test for airborne landings, steps, edges, and ambiguous support.
      if (index === 0 && controllerGrounded && Math.abs(gap) <= 0.045) {
        return { grounded: true, surfaceY, supportPoints: 1, gap, slopeSupport: hit.normal.y < 0.9999 };
      }
      // Keep the candidate window bounded so remote floors do not become landing targets.
      if (gap < -0.30 || gap > 1.30) continue;
      supportHits.push({
        surfaceY, gap, x, z,
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        center: index === 0
      });
    }
    supportHits.sort((a, b) => b.surfaceY - a.surfaceY);
    const supportPoints = supportHits.length;
    const supportSpread = supportPoints > 1
      ? supportHits[0].surfaceY - supportHits[supportPoints - 1].surfaceY
      : Infinity;
    const stableSupport = supportPoints >= 2 && supportSpread <= GROUND_SUPPORT_MAX_SPREAD;

    // Three rays on a ramp naturally report different heights. Accept them as one
    // support plane only when their normals agree and height differences match that plane;
    // separate stair treads still fail the plane-residual test.
    const reference = supportHits[0];
    let coherentSlopePlane = supportPoints >= 2 && Boolean(reference?.normal)
      && reference.normal.y >= MIN_WALKABLE_NORMAL_Y;
    if (coherentSlopePlane) {
      for (let i = 1; i < supportHits.length; i++) {
        const hit = supportHits[i];
        const normalDot = reference.normal.x * hit.normal.x
          + reference.normal.y * hit.normal.y
          + reference.normal.z * hit.normal.z;
        if (normalDot < SLOPE_NORMAL_ALIGNMENT) {
          coherentSlopePlane = false;
          break;
        }
        const expectedRise = -(
          reference.normal.x * (hit.x - reference.x)
          + reference.normal.z * (hit.z - reference.z)
        ) / reference.normal.y;
        if (Math.abs((hit.surfaceY - reference.surfaceY) - expectedRise) > SLOPE_PLANE_TOLERANCE) {
          coherentSlopePlane = false;
          break;
        }
      }
    }
    const stableSlopeSupport = coherentSlopePlane;
    const stableGroundPlane = stableSupport || stableSlopeSupport;
    const meanSurfaceY = supportPoints
      ? supportHits.reduce((sum, hit) => sum + hit.surfaceY, 0) / supportPoints
      : null;
    const groundSurfaceY = stableGroundPlane ? meanSurfaceY : (supportPoints ? supportHits[0].surfaceY : null);
    const groundGap = Number.isFinite(groundSurfaceY) ? rootY - groundSurfaceY : Infinity;
    const withinContactBand = groundGap >= -0.10 && groundGap <= GROUND_PROBE_MAX_DROP;
    // A single ray may confirm a narrow surface, but only inside the real contact band.
    const controllerConfirmedSupport = controllerGrounded && supportPoints === 1 && withinContactBand;
    const grounded = withinContactBand && (stableGroundPlane || controllerConfirmedSupport);
    return {
      grounded,
      surfaceY: groundSurfaceY,
      supportPoints,
      gap: groundGap,
      slopeSupport: stableSlopeSupport
    };
  }

  // Multi-point foot contact: sample the paw centre, toe, heel and both sides.
  // The torso collider remains grounded; each paw independently selects a stable
  // surface cluster, so one paw can plant on furniture while the others stay on floor.
  probeDogFeet(dog, velocity = { x: 0, z: 0 }, matricesCurrent = false) {
    if (!this.world || !dog?.rig?.parts?.legs) return [];
    // Movement refreshes the full rig once after animation. Keep this fallback for standalone callers.
    if (!matricesCurrent) dog.group.updateMatrixWorld(true);

    const speed = Math.hypot(velocity.x || 0, velocity.z || 0);
    const dirX = speed > 0.45 ? (velocity.x || 0) / speed : 0;
    const dirZ = speed > 0.45 ? (velocity.z || 0) / speed : 0;
    // Resolve travel direction into K-09's local axes once, rather than recomputing
    // yaw sin/cos for each leg. Horizontal wall sweeps only need the leading pair.
    const yaw = dog.group.rotation.y;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const localTravelX = cosYaw * dirX - sinYaw * dirZ;
    const localTravelZ = sinYaw * dirX + cosYaw * dirZ;
    const longitudinalDominant = Math.abs(localTravelZ) >= Math.abs(localTravelX);
    const leadingFront = localTravelZ < 0;
    const leadingSide = localTravelX < 0 ? -1 : 1;
    const rootY = dog.group.position.y;
    const minSurfaceY = rootY - 0.38;

    const sampleSurface = (x, z, originY, maxSurfaceY) => {
      const ray = new this.api.Ray({ x, y: originY, z }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRayAndGetNormal(ray, 1.9, true, undefined, undefined, this.collider, this.body);
      if (!hit) return { surfaceY: null, rawSurfaceY: null, blocked: false };
      const toi = hit.timeOfImpact;
      const rawSurfaceY = originY - toi;
      if (!Number.isFinite(rawSurfaceY)) return { surfaceY: null, rawSurfaceY: null, blocked: false };
      // A near-zero TOI means the ray origin is already inside a collider.
      if (toi < 0.035) return { surfaceY: null, rawSurfaceY, blocked: true, startedInside: true };
      // Reject walls and steep sides as foot support, even when their hit point is in range.
      if (!Number.isFinite(hit.normal?.y) || hit.normal.y < MIN_WALKABLE_NORMAL_Y) {
        return { surfaceY: null, rawSurfaceY, blocked: true, unwalkable: true };
      }
      if (rawSurfaceY < minSurfaceY) return { surfaceY: null, rawSurfaceY, blocked: false };
      if (rawSurfaceY > maxSurfaceY) return { surfaceY: null, rawSurfaceY, blocked: true };
      return { surfaceY: rawSurfaceY, rawSurfaceY, blocked: false };
    };

    return dog.rig.parts.legs.map((leg) => {
      const hipMatrix = leg.upperLeg.matrixWorld.elements;
      const hipX = hipMatrix[12];
      const hipY = hipMatrix[13];
      const hipZ = hipMatrix[14];
      const targetMatrix = leg.pawTarget.matrixWorld.elements;
      const targetX = targetMatrix[12];
      const targetZ = targetMatrix[14];

      // A paw cannot reach arbitrarily high just because the body is close to a prop.
      // Derive the ceiling from the hip's actual height and keep it separate from autostep.
      const maxSurfaceY = Math.min(rootY + MAX_FOOT_STEP_HEIGHT, hipY + 0.10);
      const originY = hipY + 0.24;
      const offsetToWorld = (dx, dz) => ({
        x: targetX + cosYaw * dx + sinYaw * dz,
        z: targetZ - sinYaw * dx + cosYaw * dz
      });

      // Three strategic samples (centre, toe, heel) keep stable support detection with fewer raycasts.
      const footprintOffsets = FOOTPRINT_OFFSETS;
      // Start with centre + toe. On a broad, level surface these usually agree, so the
      // heel ray is only needed for edges, steps, slopes, or conflicting samples.
      const footprintSamples = [];
      for (let index = 0; index < 2; index++) {
        const offset = footprintOffsets[index];
        const point = offsetToWorld(offset.x, offset.z);
        footprintSamples.push({
          ...sampleSurface(point.x, point.z, originY, maxSurfaceY),
          x: point.x, z: point.z, index
        });
      }
      const centerSample = footprintSamples[0];
      const firstPairAgrees = footprintSamples.length >= 2
        && footprintSamples.every((sample) => Number.isFinite(sample.surfaceY) && !sample.blocked)
        && Math.abs(footprintSamples[0].surfaceY - footprintSamples[1].surfaceY) <= FOOT_SUPPORT_CLUSTER_EPSILON;
      if (!firstPairAgrees) {
        const offset = footprintOffsets[2];
        const point = offsetToWorld(offset.x, offset.z);
        footprintSamples.push({
          ...sampleSurface(point.x, point.z, originY, maxSurfaceY),
          x: point.x, z: point.z, index: 2
        });
      }

      // Flat ground is the common case during a run: when centre and toe agree,
      // their mean is already the same 2-hit support cluster. Skip filter/cluster/sort
      // allocations here; retain full clustering for edges, steps and conflicting hits.
      let stableCluster = null;
      let currentY = null;
      if (firstPairAgrees) {
        currentY = (footprintSamples[0].surfaceY + footprintSamples[1].surfaceY) * 0.5;
        stableCluster = { y: currentY, hits: footprintSamples };
      } else {
        const validSamples = footprintSamples.filter((sample) => Number.isFinite(sample.surfaceY) && !sample.blocked);
        const clusters = [];
        for (const sample of validSamples) {
          let cluster = clusters.find((candidate) => Math.abs(candidate.y - sample.surfaceY) <= FOOT_SUPPORT_CLUSTER_EPSILON);
          if (!cluster) {
            cluster = { y: sample.surfaceY, hits: [] };
            clusters.push(cluster);
          }
          cluster.hits.push(sample);
          cluster.y = cluster.hits.reduce((sum, hit) => sum + hit.surfaceY, 0) / cluster.hits.length;
        }
        // Require two footprint samples to agree on one walkable plane.
        clusters.sort((a, b) => b.y - a.y || b.hits.length - a.hits.length);
        stableCluster = clusters.find((cluster) => cluster.hits.length >= 2) || null;
        currentY = stableCluster?.y ?? null;
      }
      const supportAtPaw = Boolean(stableCluster);

      // Hip height comes directly from the rig matrix; a second downward ray is unnecessary.

      const aheadPoint = { x: targetX + dirX * 0.20, z: targetZ + dirZ * 0.20 };
      const aheadSample = speed > 0.45
        ? sampleSurface(aheadPoint.x, aheadPoint.z, originY, maxSurfaceY)
        : centerSample;
      // A horizontal sweep catches vertical prop faces that a downward surface probe
      // would miss. If the forward ray already found a reachable raised top, that hit is
      // enough to guide the paw; avoid an extra cast unless ground/edge ambiguity remains.
      const sameLevelAhead = Number.isFinite(aheadSample.surfaceY)
        && Math.abs(aheadSample.surfaceY - rootY) <= 0.035;
      // On a straight run the four paw sweeps used to cast four more rays every
      // probe cycle. Sweep the leading pair only: front/rear for forward/reverse,
      // or left/right for strafing. Downward support probes still run for all paws.
      const leadingPaw = speed > 0.45 && (
        longitudinalDominant
          ? leg.front === leadingFront
          : leg.side === leadingSide
      );
      const needsHorizontalSweep = leadingPaw && (
        aheadSample.blocked
        || !Number.isFinite(aheadSample.surfaceY)
        || aheadSample.surfaceY <= rootY + 0.035
      );
      const sweepBlocked = needsHorizontalSweep && (() => {
        const probeY = rootY + 0.12;
        const ray = new this.api.Ray(
          { x: targetX - dirX * 0.045, y: probeY, z: targetZ - dirZ * 0.045 },
          { x: dirX, y: 0, z: dirZ }
        );
        const hit = this.world.castRay(ray, 0.26, true, undefined, undefined, this.collider, this.body);
        return Boolean(hit && Number.isFinite(hit.timeOfImpact) && hit.timeOfImpact <= 0.26);
      })();
      // A same-height floor hit plus a horizontal hit indicates a side obstacle instead.
      const sideObstacleAhead = sweepBlocked && (sameLevelAhead || !Number.isFinite(aheadSample.surfaceY));
      const blocked = !supportAtPaw && Boolean(centerSample.blocked);
      const obstacleAhead = Boolean(speed > 0.45 && (aheadSample.blocked || sideObstacleAhead));
      const hasSurface = Number.isFinite(currentY) || blocked || obstacleAhead;

      let safeTargetX = targetX;
      let safeTargetZ = targetZ;
      if (blocked || obstacleAhead) {
        // Recover inward if the paw is already inside a collider or would swing into one.
        const e = dog.rig.root.matrixWorld.elements;
        const tuckX = leg.baseX * 0.42;
        const tuckZ = leg.baseZ * 0.56;
        safeTargetX = e[0] * tuckX + e[8] * tuckZ + e[12];
        safeTargetZ = e[2] * tuckX + e[10] * tuckZ + e[14];
      }

      const supportY = Number.isFinite(currentY) ? currentY : rootY;
      const dx = safeTargetX - hipX;
      const dz = safeTargetZ - hipZ;
      const distance = hasSurface
        ? Math.min(leg.upperLength + leg.lowerLength, Math.hypot(dx, hipY - (supportY - 0.001), dz))
        : null;
      const justLanded = Boolean(leg.justSwung && hasSurface && !blocked && !obstacleAhead);
      leg.justSwung = false;
      return {
        currentY: supportY,
        hipSurfaceY: supportY,
        aheadY: aheadSample.surfaceY ?? supportY,
        targetX, targetZ, safeTargetX, safeTargetZ, hipX, hipY, hipZ,
        distance, hasSurface, blocked, obstacleAhead,
        supportPoints: stableCluster?.hits.length ?? (supportAtPaw ? 1 : 0),
        rawTargetY: centerSample.rawSurfaceY,
        justLanded
      };
    });
  }
  suspendDynamicProp(objectId) {
    const active = this.dynamicPropsByObjectId.get(objectId);
    if (!active) return this.suspendedDynamicPropsByObjectId.get(objectId) || null;
    this.dynamicPropsByObjectId.delete(objectId);
    this.dynamicPropsById.delete(active.prop.id);
    this.dynamicProps = this.dynamicProps.filter((candidate) => candidate !== active);
    try {
      if (this.world && active.body) this.world.removeRigidBody(active.body);
    } catch (error) {
      console.warn('Movable prop physics suspension was skipped safely.', objectId, error);
      return null;
    }
    active.body = null;
    active.suspended = true;
    this.suspendedDynamicPropsByObjectId.set(objectId, active);
    if (active.group?.userData) active.group.userData.physicsEnabled = false;
    return active;
  }

  restoreDynamicProp(objectId, position, rotation = null, motion = null) {
    const record = this.suspendedDynamicPropsByObjectId.get(objectId);
    if (!record || !this.world || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
    const prop = record.prop;
    const group = record.group;
    const currentRotation = rotation || group.quaternion || { x: 0, y: 0, z: 0, w: 1 };
    group.position.set(position.x, position.y, position.z);
    if (typeof currentRotation.w === 'number') {
      group.quaternion.set(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);
    }
    group.scale.set(1, 1, 1);

    let body = null;
    try {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(prop.linearDamping)
        .setAngularDamping(prop.angularDamping)
        .setAdditionalMass(prop.mass)
        .setCanSleep(prop.canSleep ?? true)
        .setCcdEnabled(prop.ccdEnabled);
      bodyDesc.setGravityScale?.(prop.gravityScale ?? 1);
      body = this.world.createRigidBody(bodyDesc);
      body.setRotation({
        x: group.quaternion.x, y: group.quaternion.y,
        z: group.quaternion.z, w: group.quaternion.w
      }, true);

      for (const source of record.solidSources || []) {
        if (![source.sx, source.sy, source.sz].every(Number.isFinite) || !(source.sx > 0 && source.sy > 0 && source.sz > 0)) continue;
        const minExtent = Math.min(source.sx, source.sy, source.sz);
        const roundRadius = Number.isFinite(source.roundRadius)
          ? Math.max(0, Math.min(source.roundRadius, minExtent * 0.9))
          : 0;
        let shape;
        if (source.shape === 'ball' && Number.isFinite(source.radius) && source.radius > 0) {
          shape = RAPIER.ColliderDesc.ball(source.radius);
        } else if (source.shape === 'capsule' && Number.isFinite(source.halfHeight) && source.halfHeight > 0 && Number.isFinite(source.radius) && source.radius > 0) {
          shape = RAPIER.ColliderDesc.capsule(source.halfHeight, source.radius);
        } else if (source.shape === 'cylinder' && Number.isFinite(source.halfHeight) && source.halfHeight > 0 && Number.isFinite(source.radius) && source.radius > 0) {
          shape = RAPIER.ColliderDesc.cylinder(source.halfHeight, source.radius);
        } else if (roundRadius > 0.001) {
          shape = RAPIER.ColliderDesc.roundCuboid(
            Math.max(0.001, source.sx - roundRadius),
            Math.max(0.001, source.sy - roundRadius),
            Math.max(0.001, source.sz - roundRadius),
            roundRadius
          );
        } else {
          shape = RAPIER.ColliderDesc.cuboid(source.sx, source.sy, source.sz);
        }
        const desc = shape.setTranslation(
          source.x - prop.origin.x,
          source.y - prop.origin.y,
          source.z - prop.origin.z
        ).setDensity(0.1).setFriction(prop.friction).setRestitution(prop.restitution);
        const e = source.rotation || { x: 0, y: 0, z: 0 };
        if (Math.abs(e.x || 0) + Math.abs(e.y || 0) + Math.abs(e.z || 0) > 1e-6) {
          const c1 = Math.cos((e.x || 0) / 2), s1 = Math.sin((e.x || 0) / 2);
          const c2 = Math.cos((e.y || 0) / 2), s2 = Math.sin((e.y || 0) / 2);
          const c3 = Math.cos((e.z || 0) / 2), s3 = Math.sin((e.z || 0) / 2);
          desc.setRotation({
            x: s1 * c2 * c3 + c1 * s2 * s3,
            y: c1 * s2 * c3 - s1 * c2 * s3,
            z: c1 * c2 * s3 + s1 * s2 * c3,
            w: c1 * c2 * c3 - s1 * s2 * s3
          });
        }
        this.world.createCollider(desc, body);
      }
      const launchVelocity = motion?.linearVelocity;
      if (launchVelocity && [launchVelocity.x ?? 0, launchVelocity.y ?? 0, launchVelocity.z ?? 0].every(Number.isFinite)) {
        body.setLinvel({
          x: Math.max(-8, Math.min(8, launchVelocity.x ?? 0)),
          y: Math.max(-4, Math.min(4, launchVelocity.y ?? 0)),
          z: Math.max(-8, Math.min(8, launchVelocity.z ?? 0))
        }, true);
      }
      const launchSpin = motion?.angularVelocity;
      if (launchSpin && [launchSpin.x ?? 0, launchSpin.y ?? 0, launchSpin.z ?? 0].every(Number.isFinite)) {
        body.setAngvel({
          x: Math.max(-8, Math.min(8, launchSpin.x ?? 0)),
          y: Math.max(-10, Math.min(10, launchSpin.y ?? 0)),
          z: Math.max(-8, Math.min(8, launchSpin.z ?? 0))
        }, true);
      }
      record.body = body;
      record.cooldown = 0;
      record.contactLatched = false;
      record.wasSleeping = false;
      record.suspended = false;
      this.suspendedDynamicPropsByObjectId.delete(objectId);
      this.dynamicPropsById.set(prop.id, record);
      this.dynamicPropsByObjectId.set(objectId, record);
      this.dynamicProps.push(record);
      group.userData.physicsEnabled = true;
      return true;
    } catch (error) {
      if (body) {
        try { this.world.removeRigidBody(body); } catch { /* Preserve the saved prop record for a later retry. */ }
      }
      console.warn('Could not restore movable prop physics; keeping the prop safely suspended.', objectId, error);
      return false;
    }
  }

  createLooseObject(id, type, root, options = {}) {
    if (!this.world || typeof id !== 'string' || !root?.position) return null;
    this.removeLooseObject(id);
    const rule = getObjectRule(id, type);
    const physics = rule.physics;
    if (physics.enabled === false) return null;
    const colliderRule = physics.collider || {};
    const [ox = 0, oy = 0, oz = 0] = colliderRule.offset || [0, 0, 0];
    let collider;
    switch (colliderRule.shape) {
      case 'ball':
        if (!(colliderRule.radius > 0)) return null;
        collider = RAPIER.ColliderDesc.ball(colliderRule.radius);
        break;
      case 'cylinder':
        if (!(colliderRule.radius > 0) || !(colliderRule.halfHeight > 0)) return null;
        collider = RAPIER.ColliderDesc.cylinder(colliderRule.halfHeight, colliderRule.radius);
        break;
      case 'capsule':
        if (!(colliderRule.radius > 0) || !(colliderRule.halfHeight > 0)) return null;
        collider = RAPIER.ColliderDesc.capsule(colliderRule.halfHeight, colliderRule.radius);
        break;
      case 'roundCuboid': {
        const [sx, sy, sz] = colliderRule.halfExtents || [];
        if (![sx, sy, sz].every(Number.isFinite) || !(sx > 0 && sy > 0 && sz > 0)) return null;
        collider = RAPIER.ColliderDesc.roundCuboid(sx, sy, sz, Math.max(0, Number(colliderRule.roundRadius) || 0));
        break;
      }
      case 'cuboid': {
        const [sx, sy, sz] = colliderRule.halfExtents || [];
        if (![sx, sy, sz].every(Number.isFinite) || !(sx > 0 && sy > 0 && sz > 0)) return null;
        collider = RAPIER.ColliderDesc.cuboid(sx, sy, sz);
        break;
      }
      default:
        console.warn('Pickup collider rule is missing or unsupported.', id, type);
        return null;
    }
    collider.setTranslation(ox, oy, oz);

    const mass = Number(physics.massKg);
    if (!Number.isFinite(mass) || mass <= 0) return null;
    const friction = Math.max(0, Number(physics.friction) || 0);
    const restitution = Math.max(0, Math.min(1, Number(physics.restitution) || 0));
    const linearDamping = Math.max(0, Number(physics.linearDamping) || 0);
    const angularDamping = Math.max(0, Number(physics.angularDamping) || 0);
    let createdBody = null;
    try {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(root.position.x, root.position.y, root.position.z)
        .setLinearDamping(linearDamping)
        .setAngularDamping(angularDamping)
        .setAdditionalMass(mass)
        .setCanSleep(physics.canSleep ?? true)
        .setCcdEnabled(physics.ccdEnabled ?? true);
      bodyDesc.setGravityScale?.(Number.isFinite(physics.gravityScale) ? physics.gravityScale : 1);
      const body = this.world.createRigidBody(bodyDesc);
      createdBody = body;
      body.setRotation({ x: root.quaternion.x, y: root.quaternion.y, z: root.quaternion.z, w: root.quaternion.w }, true);
      const launchVelocity = options.linearVelocity;
      if (launchVelocity && [launchVelocity.x ?? 0, launchVelocity.y ?? 0, launchVelocity.z ?? 0].every(Number.isFinite)) {
        body.setLinvel({
          x: Math.max(-8, Math.min(8, launchVelocity.x ?? 0)),
          y: Math.max(-4, Math.min(4, launchVelocity.y ?? 0)),
          z: Math.max(-8, Math.min(8, launchVelocity.z ?? 0))
        }, true);
      }
      const launchSpin = options.angularVelocity;
      if (launchSpin && [launchSpin.x ?? 0, launchSpin.y ?? 0, launchSpin.z ?? 0].every(Number.isFinite)) {
        body.setAngvel({
          x: Math.max(-8, Math.min(8, launchSpin.x ?? 0)),
          y: Math.max(-10, Math.min(10, launchSpin.y ?? 0)),
          z: Math.max(-8, Math.min(8, launchSpin.z ?? 0))
        }, true);
      }
      collider.setFriction(friction).setRestitution(restitution).setDensity(0.01);
      this.world.createCollider(collider, body);
      const interaction = rule.interaction;
      const record = {
        id, type, root, body, cooldown: 0, contactLatched: false, wasSleeping: false,
        massKg: mass,
        interactionRadius: Number(interaction.radius) || 0.42,
        interactionHeight: Number(interaction.height) || 0.65,
        kickFactor: Number(physics.kickFactor) || 0.11,
        maxImpulse: Number(physics.maxImpulse) || 0.34,
        interactionCooldown: 0.18
      };
      this.looseObjectsById.set(id, record);
      this.looseObjects.push(record);
      root.userData.physicsEnabled = true;
      return record;
    } catch (error) {
      if (createdBody && this.world) {
        try { this.world.removeRigidBody(createdBody); } catch { /* Keep the visual fallback even if rollback fails. */ }
      }
      console.warn('Loose pickup physics could not be created; keeping its visual available.', id, error);
      return null;
    }
  }

  removeLooseObject(id) {
    const record = this.looseObjectsById.get(id);
    if (!record) return false;
    this.looseObjectsById.delete(id);
    this.looseObjects = this.looseObjects.filter((candidate) => candidate !== record);
    try {
      if (this.world) this.world.removeRigidBody(record.body);
    } catch (error) {
      console.warn('Loose pickup physics cleanup was skipped safely.', id, error);
    }
    if (record.root?.userData) record.root.userData.physicsEnabled = false;
    return true;
  }

  supportHeightAt(x, z, originY, excludeId = null) {
    if (!this.world || ![x, z, originY].every(Number.isFinite)) return null;
    const excludedBody = this.looseObjectsById.get(excludeId)?.body ?? this.body;
    const ray = new this.api.Ray({ x, y: originY, z }, { x: 0, y: -1, z: 0 });
    // Exclude the player's torso from support queries, but keep world geometry and
    // other dynamic rigid bodies eligible so a drop can land on a bed/table/object.
    const hit = this.world.castRayAndGetNormal(ray, 5, true, undefined, undefined, this.collider, excludedBody);
    if (!hit || !Number.isFinite(hit.timeOfImpact) || hit.timeOfImpact < 0.015) return null;
    if (!Number.isFinite(hit.normal?.y) || hit.normal.y < MIN_WALKABLE_NORMAL_Y) return null;
    const surfaceY = originY - hit.timeOfImpact;
    return Number.isFinite(surfaceY) ? surfaceY : null;
  }

  step() {
    this.world.step();
    this.syncDynamicProps();
    this.syncLooseObjects();
  }

  syncLooseObjects() {
    for (const record of this.looseObjects) {
      if (!record.body) continue;
      const sleeping = record.body.isSleeping?.() === true;
      // Copy the final pose once on the transition to sleep, then skip idle transform writes.
      if (sleeping && record.wasSleeping) continue;
      const p = record.body.translation();
      const r = record.body.rotation();
      record.root.position.set(p.x, p.y, p.z);
      record.root.quaternion.set(r.x, r.y, r.z, r.w);
      record.wasSleeping = sleeping;
    }
  }

  syncDynamicProps() {
    for (const record of this.dynamicProps) {
      if (!record.body) continue;
      const sleeping = record.body.isSleeping?.() === true;
      // Copy the final pose once on the transition to sleep, then skip idle transform writes.
      if (sleeping && record.wasSleeping) continue;
      const p = record.body.translation();
      const r = record.body.rotation();
      record.group.position.set(p.x, p.y, p.z);
      record.group.quaternion.set(r.x, r.y, r.z, r.w);
      record.wasSleeping = sleeping;
    }
  }

  // Paw-level impacts supplement body collisions so walking or sprinting can kick loose toys.
  interactWithDog(dog, velocity = { x: 0, z: 0 }, dt = 1 / 60, matricesCurrent = false) {
    if ((!this.dynamicProps.length && !this.looseObjects.length) || !dog?.rig?.parts?.legs) return;
    const speed = Math.hypot(velocity.x || 0, velocity.z || 0);
    // Idle animation cannot meaningfully kick an object. Advance cooldowns and drop old
    // paw samples without walking every prop/paw pair until locomotion or a live contact resumes.
    for (const record of this.dynamicProps) record.cooldown = Math.max(0, record.cooldown - dt);
    for (const record of this.looseObjects) record.cooldown = Math.max(0, record.cooldown - dt);
    const latchedAtRest = this.dynamicProps.some((record) => record.contactLatched)
      || this.looseObjects.some((record) => record.contactLatched);
    if (speed < 0.10 && dog.state === 'idle' && !latchedAtRest) {
      this.previousPawPositions.clear();
      return;
    }
    if (!matricesCurrent) dog.group.updateMatrixWorld(true);
    const velocityX = speed > 1e-4 ? velocity.x / speed : 0;
    const velocityZ = speed > 1e-4 ? velocity.z / speed : 0;
    const dogPosition = dog.group.position;
    let maxPawSpeed = 0;
    const legs = dog.rig.parts.legs;
    const paws = this.pawScratch || (this.pawScratch = legs.map(() => ({ position: { x: 0, y: 0, z: 0 }, pawSpeed: 0, pawVerticalVelocity: 0 })));
    paws.length = legs.length;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const paw = paws[i] || (paws[i] = { position: { x: 0, y: 0, z: 0 }, pawSpeed: 0, pawVerticalVelocity: 0 });
      const e = leg.foot.matrixWorld.elements;
      const x = e[12], y = e[13], z = e[14];
      const previous = this.previousPawPositions.get(leg.index);
      paw.pawSpeed = previous && dt > 1e-4
        ? Math.hypot(x - previous.x, y - previous.y, z - previous.z) / dt
        : 0;
      paw.pawVerticalVelocity = previous && dt > 1e-4 ? (y - previous.y) / dt : 0;
      paw.position.x = x; paw.position.y = y; paw.position.z = z;
      maxPawSpeed = Math.max(maxPawSpeed, paw.pawSpeed);
      if (previous) { previous.x = x; previous.y = y; previous.z = z; }
      else this.previousPawPositions.set(leg.index, { x, y, z });
    }

    const canApplyPawImpulse = speed >= 0.45 || maxPawSpeed >= 0.85;
    const hasLatchedContact = this.dynamicProps.some((record) => record.contactLatched)
      || this.looseObjects.some((record) => record.contactLatched);
    // Idle frames only inspect latched objects for separation; the general object-paw scan
    // runs again as soon as movement can create an impact.
    if (!canApplyPawImpulse) {
      if (!hasLatchedContact) return;
      for (const record of this.dynamicProps) {
        if (!record.contactLatched) continue;
        const center = record.group.position;
        const radius = record.prop.interactionRadius + 0.08;
        const radiusSq = radius * radius;
        const touching = paws.some(({ position: foot }) => {
          const dx = center.x - foot.x;
          const dz = center.z - foot.z;
          return dx * dx + dz * dz <= radiusSq
            && Math.abs(center.y - foot.y) <= record.prop.interactionHeight;
        });
        if (!touching) record.contactLatched = false;
      }
      for (const record of this.looseObjects) {
        if (!record.contactLatched) continue;
        const center = record.root.position;
        const radius = record.interactionRadius + 0.06;
        const radiusSq = radius * radius;
        const touching = paws.some(({ position: foot }) => {
          const dx = center.x - foot.x;
          const dz = center.z - foot.z;
          return dx * dx + dz * dz <= radiusSq
            && Math.abs(center.y - foot.y) <= record.interactionHeight;
        });
        if (!touching) record.contactLatched = false;
      }
      return;
    }

    for (const record of this.dynamicProps) {
      // PhysicsWorld.step already synchronized the visual group's position from Rapier.
      // Read it directly to avoid another WASM-to-JS translation object per prop per tick.
      const center = record.group.position;
      // Paws can reach about 1.2 m from the chassis; discard distant prop pairs
      // before testing each of four feet. Latched contacts are never broad-phase skipped.
      if (!record.contactLatched) {
        const dx = center.x - dogPosition.x;
        const dz = center.z - dogPosition.z;
        const broadRadius = record.prop.interactionRadius + 1.35;
        if (dx * dx + dz * dz > broadRadius * broadRadius) continue;
      }
      const contactRadius = record.prop.interactionRadius + 0.08;
      const contactRadiusSq = contactRadius * contactRadius;
      let touching = false;
      for (const paw of paws) {
        const foot = paw.position;
        const dx = center.x - foot.x;
        const dz = center.z - foot.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > contactRadiusSq || Math.abs(center.y - foot.y) > record.prop.interactionHeight) continue;
        touching = true;
        if (record.contactLatched || record.cooldown > 0) continue;
        if (speed < 0.45 && paw.pawSpeed < 0.85) continue;

        const horizontalDistance = Math.sqrt(distanceSq);
        const mass = Math.max(0.1, record.body.mass());
        const awayX = horizontalDistance > 1e-4 ? dx / horizontalDistance : -velocityX;
        const awayZ = horizontalDistance > 1e-4 ? dz / horizontalDistance : -velocityZ;
        let dirX = speed > 0.35 ? velocityX * 0.68 + awayX * 0.32 : awayX;
        let dirZ = speed > 0.35 ? velocityZ * 0.68 + awayZ * 0.32 : awayZ;
        const directionLength = Math.hypot(dirX, dirZ) || 1;
        dirX /= directionLength;
        dirZ /= directionLength;
        const stompSpeed = Math.max(0, -(paw.pawVerticalVelocity || 0));
        const impactSpeed = Math.min(4.2, speed * 0.65 + paw.pawSpeed * 0.32 + stompSpeed * 0.18);
        const impulseMagnitude = Math.min(record.prop.maxImpulse, Math.max(0.08, mass * impactSpeed * record.prop.kickFactor));
        const verticalImpulse = stompSpeed > 0.6
          ? Math.min(0.035, impulseMagnitude * 0.008 + mass * stompSpeed * record.prop.kickFactor * 0.015)
          : 0;
        // One kick per continuous contact; keep the latch until every paw leaves this envelope.
        record.contactLatched = true;
        try {
          record.body.applyImpulseAtPoint(
            { x: dirX * impulseMagnitude, y: verticalImpulse, z: dirZ * impulseMagnitude },
            { x: foot.x, y: foot.y, z: foot.z },
            true
          );
          record.body.wakeUp();
          playInteractionFx('push', record.prop);
          record.cooldown = record.prop.interactionCooldown;
        } catch (error) {
          console.warn('Movable prop impact was skipped safely.', record.prop.name, error);
          record.cooldown = 0.1;
        }
        break;
      }
      if (!touching) record.contactLatched = false;
    }

    // The character controller handles torso contacts; this low-cost paw impulse also
    // nudges small dropped pickups when a paw actually sweeps into them.
    for (const record of this.looseObjects) {
      const center = record.root.position;
      // Dropped pickup position is synchronized after physics step; avoid allocating another translation wrapper.
      // Dropped pickups use a conservative broad-phase radius around the dog.
      if (!record.contactLatched) {
        const dx = center.x - dogPosition.x;
        const dz = center.z - dogPosition.z;
        const broadRadius = record.interactionRadius + 1.35;
        if (dx * dx + dz * dz > broadRadius * broadRadius) continue;
      }
      const contactRadius = record.interactionRadius + 0.06;
      const contactRadiusSq = contactRadius * contactRadius;
      let touching = false;
      for (const paw of paws) {
        const foot = paw.position;
        const dx = center.x - foot.x;
        const dz = center.z - foot.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > contactRadiusSq || Math.abs(center.y - foot.y) > record.interactionHeight) continue;
        touching = true;
        if (record.contactLatched || record.cooldown > 0) continue;
        if (speed < 0.45 && paw.pawSpeed < 0.85) continue;

        const horizontalDistance = Math.sqrt(distanceSq);
        const mass = Math.max(0.08, record.body.mass());
        const awayX = horizontalDistance > 1e-4 ? dx / horizontalDistance : -velocityX;
        const awayZ = horizontalDistance > 1e-4 ? dz / horizontalDistance : -velocityZ;
        let dirX = speed > 0.35 ? velocityX * 0.58 + awayX * 0.42 : awayX;
        let dirZ = speed > 0.35 ? velocityZ * 0.58 + awayZ * 0.42 : awayZ;
        const length = Math.hypot(dirX, dirZ) || 1;
        dirX /= length;
        dirZ /= length;
        const impactSpeed = Math.min(3.2, speed * 0.5 + paw.pawSpeed * 0.22);
        const impulse = Math.min(record.maxImpulse, Math.max(0.025, mass * impactSpeed * record.kickFactor));
        record.contactLatched = true;
        try {
          record.body.applyImpulseAtPoint(
            { x: dirX * impulse, y: 0, z: dirZ * impulse },
            { x: foot.x, y: foot.y, z: foot.z },
            true
          );
          record.body.wakeUp();
          playInteractionFx('push', record);
          record.cooldown = record.interactionCooldown;
        } catch (error) {
          console.warn('Dropped pickup impact was skipped safely.', record.id, error);
          record.cooldown = 0.1;
        }
        break;
      }
      if (!touching) record.contactLatched = false;
    }
  }

  position(out = null) {
    const p = this.body.translation();
    if (out) {
      out.x = p.x;
      out.y = p.y;
      out.z = p.z;
      return out;
    }
    return { x: p.x, y: p.y, z: p.z };
  }

  dispose() {
    if (this.controller && this.world) this.world.removeCharacterController(this.controller);
    this.looseObjects.length = 0;
    this.looseObjectsById.clear();
    this.dynamicProps.length = 0;
    this.dynamicPropsById.clear();
    this.world?.free?.();
    this.controller = null;
    this.world = null;
  }
}
