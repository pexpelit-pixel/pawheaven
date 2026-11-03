import * as THREE from 'three';
import { MovementAudio } from '../world/sound/MovementAudio.js';

const DEFAULT_WORLD_BOUNDS = Object.freeze({ minX: -19.6, maxX: 19.6, minZ: -13.55, maxZ: 13.55 });

export class Movement {
  constructor(physics, dog, input, cameraController, surfaceResolver = null) {
    this.physics = physics;
    this.dog = dog;
    this.input = input;
    this.camera = cameraController;
    this.surfaceResolver = typeof surfaceResolver === 'function' ? surfaceResolver : null;
    this.movementAudio = new MovementAudio();
    this.stepAudioCooldown = 0;
    this.airborneAudioActive = false;
    this.fallAudioPlayed = false;
    this.previousSprintIntent = false;
    this.worldBounds = DEFAULT_WORLD_BOUNDS;
    // Reusable frame data avoids short-lived objects in the 60 Hz movement loop.
    this.previousPositionScratch = { x: 0, y: 0, z: 0 };
    this.positionScratch = { x: 0, y: 0, z: 0 };
    this.requestedTranslationScratch = { x: 0, y: 0, z: 0 };
    this.actualVelocityScratch = { x: 0, z: 0 };
    this.dog.worldVelocity ||= { x: 0, y: 0, z: 0 };
    this.horizontalVelocity = new THREE.Vector3();
    this.platformCarryVelocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.forwardScratch = new THREE.Vector3();
    this.rightScratch = new THREE.Vector3();
    this.desiredScratch = new THREE.Vector3();
    // These are the proven response values from Movementversilama.js.
    // Exponential damping on X/Z keeps steering responsive without speed snapping.
    this.acceleration = 18;
    this.braking = 23;
    this.surfaceTraction = 1.0; // Set by LevelSystem only while grounded on special surfaces.
    this.jumpBuffer = 0;
    this.jumpBufferDuration = 0.12;
    this.coyoteTime = 0;
    this.coyoteDuration = 0.10;
    this.walkSpeed = 3.15; // m/s
    this.runSpeed = 5.6; // m/s, 1.78× walking speed (+78%)
    this.runJumpSpeedMultiplier = 1.22; // Longer horizontal range only when sprinting into a jump.
    this.runJumpMinimumSpeed = this.walkSpeed * 1.05;
    this.runJumpActive = false;
    // Mobile sprint is hold-to-run: preserve the run intent briefly after release
    // so the other thumb has time to press jump without losing the run-up.
    this.sprintJumpGraceDuration = 0.45;
    this.sprintJumpGraceTimer = 0;
    this.jumpSpeed = 6.6; // m/s vertical take-off velocity
    this.gravity = 18; // m/s², matched by PhysicsWorld gravity

    // Diagnostic estimate only: actual range changes with steering, collisions and landing height.
    this.lastJumpTakeoffSpeed = 0;
    this.lastJumpEstimatedFlightTime = 0;
    this.lastJumpEstimatedRange = 0;
    this.grounded = true;
    // Detailed paw-contact rays are expensive on mobile; cache contacts between fixed ticks.
    this.footProbeInterval = 1 / 30;
    this.footProbeElapsed = Infinity;
    this.cachedFootContacts = null;
    // Reused result for the rising jump phase, when ground snapping is intentionally disabled.
    this.airborneGroundProbe = { grounded: false, surfaceY: null, supportPoints: 0 };
    // Hysteresis prevents noisy analog samples from toggling locomotion on/off at the threshold.
    this.movingIntent = false;
    this.movementStartThreshold = 0.028;
    this.movementStopThreshold = 0.018;
  }

  setWorldBounds(bounds = null) {
    if (!bounds || ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
      || bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
      this.worldBounds = DEFAULT_WORLD_BOUNDS;
      return;
    }
    this.worldBounds = {
      minX: bounds.minX, maxX: bounds.maxX,
      minZ: bounds.minZ, maxZ: bounds.maxZ
    };
  }

  update(dt) {
    const input = this.input.movement();
    const basis = this.camera.getMoveBasis();
    const sprinting = this.input.sprinting();
    this.stepAudioCooldown = Math.max(0, this.stepAudioCooldown - dt);
    if (sprinting) {
      this.sprintJumpGraceTimer = this.sprintJumpGraceDuration;
    } else {
      this.sprintJumpGraceTimer = Math.max(0, this.sprintJumpGraceTimer - dt);
    }
    // Keep run intent for a short grace window after RUN is released. This supports
    // two-thumb mobile play: one thumb can release RUN while the other taps JUMP.
    const sprintingForMovement = sprinting || this.sprintJumpGraceTimer > 0;
    if (sprintingForMovement !== this.previousSprintIntent) {
      if (sprintingForMovement) this.movementAudio.playPowerUp();
      else this.movementAudio.playPowerDown();
      this.previousSprintIntent = sprintingForMovement;
    }
    // Once a sprint jump starts, preserve its higher forward target in mid-air even if
    // sprint is released. Releasing movement still uses the low airborne-drag response.
    const runJumpAirControl = !this.grounded && this.runJumpActive && input.y > 0.25;
    const maxSpeed = runJumpAirControl
      ? this.runSpeed * this.runJumpSpeedMultiplier
      : (sprintingForMovement ? this.runSpeed : this.walkSpeed);
    this.desiredScratch.set(0, 0, 0).addScaledVector(basis.forward, input.y).addScaledVector(basis.right, input.x);
    if (this.desiredScratch.lengthSq() > 1) this.desiredScratch.normalize();
    this.desiredScratch.multiplyScalar(maxSpeed);
    // Use radial magnitude, not |x| + |y|: the latter gives diagonals a different
    // dead zone and can make analog movement pulse when the stick crosses the threshold.
    const inputMagnitude = Math.min(1, Math.hypot(input.x, input.y));
    if (this.movingIntent) {
      if (inputMagnitude <= this.movementStopThreshold) this.movingIntent = false;
    } else if (inputMagnitude >= this.movementStartThreshold) {
      this.movingIntent = true;
    }
    const moving = this.movingIntent;
    // Apply one dead zone consistently to translation and turning. Otherwise a tiny
    // residual joystick value can rotate/creep the dog even after the stick is released.
    if (!moving) this.desiredScratch.set(0, 0, 0);
    const jumpRequested = this.input.consumeJump();
    if (jumpRequested) this.jumpBuffer = this.jumpBufferDuration;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.grounded) this.coyoteTime = this.coyoteDuration;
    else this.coyoteTime = Math.max(0, this.coyoteTime - dt);
    const sitRequest = this.input.consumeSit();
    if (sitRequest !== null) {
      if (!this.grounded || (sitRequest && (moving || jumpRequested))) {
        // Cancel sit intent if K-09 is airborne or already moving; never leave a false STAND state.
        this.input.setSitting(false);
      } else {
        this.dog.sitting = Boolean(sitRequest);
        this.input.setSitting(this.dog.sitting);
      }
    }
    if (this.dog.sitting && (moving || jumpRequested || !this.grounded)) {
      this.dog.sitting = false;
      this.input.setSitting(false);
    }
    if (this.dog.sitting) {
      this.horizontalVelocity.set(0, 0, 0);
      this.desiredScratch.set(0, 0, 0);
    }
    // Match the original, proven X/Z exponential-damping model from Movementversilama.js.
    // Each velocity component eases toward the analog target, so heading changes remain continuous.
    // Ground-contact probes can disagree for one tick at seams/props. Keep the
    // acceleration response independent of grounded state while input is held, or
    // analog motion can pulse between 18 and 2 m/s². Air drag stays low only on release.
    const groundTraction = this.grounded
      ? THREE.MathUtils.clamp(Number(this.surfaceTraction) || 1, 0.12, 1)
      : 1;
    const rate = moving
      ? this.acceleration * groundTraction
      : (this.grounded ? this.braking * groundTraction : 0.35);
    if (this.dog.sitting) {
      this.horizontalVelocity.set(0, 0, 0);
    } else {
      this.horizontalVelocity.x = THREE.MathUtils.damp(
        this.horizontalVelocity.x,
        this.desiredScratch.x,
        rate,
        dt
      );
      this.horizontalVelocity.z = THREE.MathUtils.damp(
        this.horizontalVelocity.z,
        this.desiredScratch.z,
        rate,
        dt
      );
    }

    // A short buffer and coyote window make jumping responsive without changing fixed-step physics.
    if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTime > 0) && !this.dog.sitting) {
      // A moving board contributes a small amount of its surface velocity at takeoff.
      // This preserves the board's momentum without changing grounded steering.
      this.horizontalVelocity.x += this.platformCarryVelocity.x * 0.72;
      this.horizontalVelocity.z += this.platformCarryVelocity.z * 0.72;
      this.platformCarryVelocity.set(0, 0, 0);
      const takeoffSpeed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);
      // A real run-up adds horizontal launch momentum, creating a longer, flatter jump.
      // Require forward input and established running speed so standing jumps stay unchanged.
      this.runJumpActive = sprintingForMovement
        && input.y > 0.35
        && takeoffSpeed >= this.runJumpMinimumSpeed;
      if (this.runJumpActive && takeoffSpeed > 1e-4) {
        const boostedTakeoffSpeed = Math.min(
          this.runSpeed * this.runJumpSpeedMultiplier,
          takeoffSpeed * this.runJumpSpeedMultiplier
        );
        this.horizontalVelocity.multiplyScalar(boostedTakeoffSpeed / takeoffSpeed);
      }
      this.movementAudio.playTakeoff(this.runJumpActive, moving);
      this.airborneAudioActive = true;
      this.fallAudioPlayed = false;
      this.lastJumpTakeoffSpeed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);
      this.lastJumpEstimatedFlightTime = (2 * this.jumpSpeed) / this.gravity;
      this.lastJumpEstimatedRange = this.lastJumpTakeoffSpeed * this.lastJumpEstimatedFlightTime;
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
    }
    // Avoid accumulating downward velocity at rest. Probe gently into the support surface
    // so the controller remains grounded on low furniture and minor floor transitions.
    if (this.grounded) this.verticalVelocity = 0;
    else this.verticalVelocity = Math.max(-16, this.verticalVelocity - this.gravity * dt);
    // Smoothly turn with the damped travel velocity, matching the baseline behavior.
    // This avoids a chassis that yaws independently from its actual movement direction.
    const headingSpeed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);
    if (headingSpeed > 0.12) {
      const desiredYaw = Math.atan2(-this.horizontalVelocity.x, -this.horizontalVelocity.z);
      const delta = THREE.MathUtils.euclideanModulo(
        desiredYaw - this.dog.group.rotation.y + Math.PI,
        Math.PI * 2
      ) - Math.PI;
      this.dog.group.rotation.y += delta * (1 - Math.exp(-dt * (sprintingForMovement ? 9 : 11)));
    }
    const previousPosition = this.physics.position(this.previousPositionScratch);
    const requestedTranslation = this.requestedTranslationScratch;
    requestedTranslation.x = this.horizontalVelocity.x * dt;
    requestedTranslation.y = this.grounded ? -0.025 : this.verticalVelocity * dt;
    requestedTranslation.z = this.horizontalVelocity.z * dt;
    const movement = this.physics.move(requestedTranslation, this.dog.group.rotation.y, this.grounded);
    this.physics.step();

    let pos = this.physics.position(this.positionScratch);
    // Clamp the physics body itself, not just the rendered mesh. Clamping only the
    // visual root made the dog appear stationary while its hidden collider kept moving.
    const unclampedX = pos.x;
    const unclampedZ = pos.z;
    const bounds = this.worldBounds;
    pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX, bounds.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ, bounds.maxZ);
    if (Math.abs(pos.x - unclampedX) > 1e-6 || Math.abs(pos.z - unclampedZ) > 1e-6) {
      this.physics.setPosition(pos);
    }

    // Find raised support surfaces during descent, without snapping while still airborne.
    const previousRootY = previousPosition.y - 0.78;
    const currentRootY = pos.y - 0.78;
    // While rising, we cannot land or snap to support. Skip three downward Rapier rays
    // per 60 Hz tick; resume full support probing as soon as vertical velocity turns downward.
    const groundProbe = this.verticalVelocity > 0.05
      ? this.airborneGroundProbe
      : this.physics.probeGround(pos.y - 0.78, this.dog.group.rotation.y, movement.grounded);
    const descendingOrSettled = this.verticalVelocity <= 0.05;
    const supportY = groundProbe.surfaceY;
    const hasStableSupport = groundProbe.grounded
      || (movement.grounded && groundProbe.supportPoints === 1);
    const nearSupportPlane = Number.isFinite(supportY)
      && currentRootY >= supportY - 0.10
      && currentRootY <= supportY + 0.12;
    const crossedSupportPlane = Number.isFinite(supportY)
      && previousRootY >= supportY - 0.02
      && currentRootY <= supportY + 0.12
      && currentRootY >= supportY - 0.18;
    const landingContact = descendingOrSettled && hasStableSupport
      && (nearSupportPlane || crossedSupportPlane);
    if (descendingOrSettled && Number.isFinite(supportY) && (groundProbe.grounded || landingContact)) {
      const targetBodyY = supportY + 0.78;
      const correction = targetBodyY - pos.y;
      const maxLandingCorrection = Math.max(0.12, Math.abs(this.verticalVelocity) * dt + 0.025);
      if (Math.abs(correction) <= maxLandingCorrection && Math.abs(correction) > 0.001) {
        pos.y = targetBodyY;
        this.physics.setPosition(pos);
      }
      this.grounded = true;
      this.verticalVelocity = 0;
    } else {
      // Preserve confirmed controller contact when the support probes briefly disagree at a seam.
      const supportGapMagnitude = Number.isFinite(supportY)
        ? Math.abs(currentRootY - supportY)
        : Infinity;
      const controllerSupportsBody = Boolean(movement.grounded)
        && this.verticalVelocity <= 0.05
        && (!Number.isFinite(supportY) || supportGapMagnitude <= 0.18);
      this.grounded = this.verticalVelocity > 0.05
        ? false
        : (groundProbe.grounded || controllerSupportsBody);
      if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;
    }
    if (this.grounded) this.runJumpActive = false;

    // Use the existing grounded edge for one-shot fall and landing cues.
    if (!this.grounded) {
      this.airborneAudioActive = true;
      if (this.verticalVelocity <= -4.8 && !this.fallAudioPlayed) {
        this.movementAudio.playFall();
        this.fallAudioPlayed = true;
      }
    } else if (this.airborneAudioActive) {
      this.movementAudio.playLanding(this.resolveSurfaceType());
      this.airborneAudioActive = false;
      this.fallAudioPlayed = false;
      this.stepAudioCooldown = Math.max(this.stepAudioCooldown, 0.13);
    }

    // Measure displacement after any landing correction so animation and foot contacts
    // follow the settled pose rather than the unsnapped kinematic target.
    const actualVelocity = this.actualVelocityScratch;
    actualVelocity.x = dt > 1e-4 ? (pos.x - previousPosition.x) / dt : 0;
    actualVelocity.z = dt > 1e-4 ? (pos.z - previousPosition.z) / dt : 0;
    const actualSpeed = Math.hypot(actualVelocity.x, actualVelocity.z);
    // Expose the measured world-space motion so items released from the tail inherit
    // momentum instead of appearing to fall from a stationary reference frame.
    const worldVelocity = this.dog.worldVelocity;
    worldVelocity.x = actualVelocity.x;
    worldVelocity.y = Number.isFinite(this.verticalVelocity) ? this.verticalVelocity : 0;
    worldVelocity.z = actualVelocity.z;

    // Do not reset motor momentum from one clipped displacement. The Rapier
    // character controller already resolves collisions; isolated clipped ticks at
    // prop edges or seams must not create a stop-start speed pulse.
    this.dog.group.position.set(pos.x, pos.y - 0.78, pos.z);
    this.dog.speed = actualSpeed;
    this.dog.sprinting = sprintingForMovement && actualSpeed > this.walkSpeed;
    if (!this.grounded) this.dog.sitting = false;
    this.dog.grounded = this.grounded;
    this.dog.verticalVelocity = this.verticalVelocity;
    // Match locomotion state to both intent and measured horizontal displacement.
    // Keep intent separate from noisy measured displacement. DogAnimator filters speed
    // so one collision/contact tick cannot snap the gait to idle and back to running.
    this.dog.updateAnimation(dt, moving);
    // Animation changes the rig transforms. Refresh once here so kick contacts and foot IK share the same matrices.
    this.dog.group.updateMatrixWorld(true);
    this.physics.interactWithDog(this.dog, actualVelocity, dt, true);
    this.footProbeElapsed += dt;
    if (this.footProbeElapsed >= this.footProbeInterval || !this.cachedFootContacts) {
      this.dog.footContacts = this.physics.probeDogFeet(this.dog, actualVelocity, true);
      this.cachedFootContacts = this.dog.footContacts;
      this.footProbeElapsed = 0;
    } else {
      // Do not replay a landing event when cached foot contacts are reused.
      this.dog.footContacts = this.cachedFootContacts;
      // Clear the one-tick landing edge in place instead of cloning each contact every tick.
      for (const contact of this.dog.footContacts) {
        if (contact?.justLanded) contact.justLanded = false;
      }
    }
    const landingEvents = this.dog.footLandingEvents;
    landingEvents.length = 0;
    for (const contact of this.dog.footContacts) {
      if (contact.justLanded) landingEvents.push(contact);
    }

    // Paw swing edges come from the existing cached 30 Hz contact pass.
    // Coalesce simultaneous diagonal/gallop impacts into one short audio event.
    if (landingEvents.length && this.grounded && moving && !this.dog.sitting
      && actualSpeed > 0.62 && this.stepAudioCooldown <= 0) {
      this.movementAudio.playFootstep(this.resolveSurfaceType(), this.dog.sprinting);
      this.stepAudioCooldown = 0.10;
    }
  }

  resolveSurfaceType() {
    const override = this.surfaceResolver?.();
    if (override === 'carpet' || override === 'wood') return override;

    const position = this.dog.group.position;
    // The central rug is visual-only and sits over the main floor. Identify its
    // known footprint without adding collision queries or touching floor colliders.
    const onCentralCarpet = position.y <= 0.22
      && Math.abs(position.x) <= 6.08
      && position.z >= -7.08 && position.z <= 9.08;
    return onCentralCarpet ? 'carpet' : 'wood';
  }

  dispose() {
    this.movementAudio?.dispose();
    this.movementAudio = null;
  }
}
