import * as THREE from 'three';

const smoothstep = (value) => value * value * (3 - 2 * value);
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = (t) => t * t * (3 - 2 * t);
const safeAcos = (value) => Math.acos(clamp(value, -1, 1));
const EMPTY_CONTACTS = [];
const isAirState = (state) => state === 'jump' || state === 'air';
const gaitStrength = (state) => state === 'run' ? 1 : state === 'walk' ? 0.56 : 0;

/** Delta-time procedural poses with a short crossfade whenever the locomotion state changes. */
export class DogAnimator {
  constructor(rig) {
    this.rig = rig;
    // Reuse IK scratch vectors so each paw solve does not allocate vectors every frame.
    this.targetWorldScratch = new THREE.Vector3();
    this.targetLocalScratch = new THREE.Vector3();
    this.time = 0;
    this.state = 'idle';
    this.phase = 0;
    this.smoothedSpeed = 0;
    // Smooth speed/cadence envelopes prevent abrupt gait changes when the input speed fluctuates.
    this.cycleSpeed = 9.5;
    this.runBlend = 0;
    this.maxRunBlend = 0;
    this.previousState = 'idle';
    this.stateBlend = 1;
    this.lastGrounded = true;
    this.landingPulse = 0;
    this.landingTimer = 0;
    this.sitBlend = 0;
  }

  update(dt, speed, sprinting, grounded, verticalVelocity, sitting = false, footContacts = null, movementIntent = true) {
    // Reject invalid frame deltas and cap only animation time after rare stalls. Normal 60 FPS
    // timing is unchanged; a long frame cannot make the tail, head, or gait jump to a new pose.
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 1 / 30) : 1 / 60;
    // Animation follows filtered measured speed. A single collision/seam tick may change
    // actual displacement, but it should not instantly switch the gait from run to idle.
    const targetSpeed = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed, 0, 6.2) : 0;
    const speedResponse = 1 - Math.exp(-dt * (targetSpeed > this.smoothedSpeed ? 14 : 8));
    this.smoothedSpeed += (targetSpeed - this.smoothedSpeed) * speedResponse;
    speed = this.smoothedSpeed;
    this.time += dt;
    if (this.rig.materials.pulse?.uniforms?.uTime) this.rig.materials.pulse.uniforms.uTime.value = this.time;

    if (!this.lastGrounded && grounded) {
      this.landingPulse = 1;
      this.landingTimer = 0.28;
    }
    this.lastGrounded = grounded;
    this.landingPulse = Math.max(0, this.landingPulse - dt * 2.8);

    const locomotionActive = Boolean(movementIntent) && speed > 0.1;
    let targetState;
    if (!grounded && verticalVelocity > 0.3) targetState = 'jump';
    else if (!grounded) targetState = 'air';
    else if (this.landingTimer > 0) {
      targetState = 'landing';
      this.landingTimer = Math.max(0, this.landingTimer - dt);
    } else if (sitting && speed < 0.16) targetState = 'sit';
    else if (locomotionActive && (speed > 3.8 || (sprinting && speed > 2.9))) targetState = 'run';
    else if (locomotionActive) targetState = 'walk';
    else targetState = 'idle';

    if (targetState !== this.state) {
      this.previousState = this.state;
      this.state = targetState;
      this.stateBlend = 0;
    }
    this.stateBlend = Math.min(1, this.stateBlend + dt * 4.5);
    const blend = smoothstep(this.stateBlend);
    const sitTarget = this.state === 'sit' ? 1 : 0;
    this.sitBlend += (sitTarget - this.sitBlend) * (1 - Math.exp(-dt * 5.8));
    const previousGait = gaitStrength(this.previousState);
    const currentGait = gaitStrength(this.state);
    const gait = mix(previousGait, currentGait, blend);
    const stateRunBlend = mix(this.previousState === 'run' ? 1 : 0, this.state === 'run' ? 1 : 0, blend);
    // Continuous speed blend like the reference slider: a slow jog keeps a walk-like
    // diagonal rhythm, then transitions into front-pair/rear-pair galloping as speed rises.
    const speedRunBlend = sprinting
      ? smoothstep(THREE.MathUtils.clamp((speed - 2.9) / 2.0, 0, 1))
      : stateRunBlend;
    const targetRunBlend = Math.min(stateRunBlend, speedRunBlend);
    this.runBlend += (targetRunBlend - this.runBlend) * (1 - Math.exp(-dt * 6.5));
    const runBlend = this.runBlend;
    // Extra sprint envelope only reaches full strength near the 5.6 m/s top speed.
    const targetMaxRunBlend = sprinting ? smoothstep(THREE.MathUtils.clamp((speed - 3.6) / 2.0, 0, 1)) : 0;
    this.maxRunBlend += (targetMaxRunBlend - this.maxRunBlend) * (1 - Math.exp(-dt * 5.0));
    const maxRunBlend = this.maxRunBlend;
    const swingAmount = mix(0.4, mix(0.8, 0.98, maxRunBlend), runBlend);
    const desiredCycleSpeed = mix(9.5, 16.5, runBlend) * THREE.MathUtils.clamp(speed / 3.15, 0.5, 1.45) + maxRunBlend * 1.2;
    this.cycleSpeed += (desiredCycleSpeed - this.cycleSpeed) * (1 - Math.exp(-dt * 4.5));
    const cycleSpeed = this.cycleSpeed;
    const airBlend = mix(isAirState(this.previousState) ? 1 : 0, isAirState(this.state) ? 1 : 0, blend);

    this.phase += dt * cycleSpeed;
    const wave = Math.sin(this.phase);
    const waveOpposite = Math.sin(this.phase + Math.PI);
    const moving = gait > 0.04 && locomotionActive;
    const body = this.rig.bodyBob;
    const rootY = this.rig.root.parent?.position.y ?? 0;
    const contacts = Array.isArray(footContacts) ? footContacts : EMPTY_CONTACTS;
    // Ground stance uses full two-bone IK. In the air, only preserve the rare obstacle-tuck yaw.
    const needsGroundIK = grounded && !sitting && this.sitBlend < 0.25;
    const needsBlockedAirYaw = !needsGroundIK && contacts.some((contact) =>
      Boolean(contact?.blocked || contact?.obstacleAhead)
      && contact?.hasSurface
      && Number.isFinite(contact.currentY)
      && Number.isFinite(contact.targetX)
      && Number.isFinite(contact.targetZ)
    );
    // Aggregate the four support heights in one pass. Avoid filter/map/reduce arrays in every frame.
    let leftSurfaceSum = 0, rightSurfaceSum = 0, frontSurfaceSum = 0, rearSurfaceSum = 0;
    let leftSurfaceCount = 0, rightSurfaceCount = 0, frontSurfaceCount = 0, rearSurfaceCount = 0;
    for (const leg of this.rig.parts.legs) {
      const contactY = contacts[leg.index]?.currentY;
      const surfaceY = Number.isFinite(contactY) ? contactY : rootY;
      if (leg.side < 0) { leftSurfaceSum += surfaceY; leftSurfaceCount++; }
      else { rightSurfaceSum += surfaceY; rightSurfaceCount++; }
      if (leg.front) { frontSurfaceSum += surfaceY; frontSurfaceCount++; }
      else { rearSurfaceSum += surfaceY; rearSurfaceCount++; }
    }
    const leftSurface = leftSurfaceCount ? leftSurfaceSum / leftSurfaceCount : rootY;
    const rightSurface = rightSurfaceCount ? rightSurfaceSum / rightSurfaceCount : rootY;
    const frontSurface = frontSurfaceCount ? frontSurfaceSum / frontSurfaceCount : rootY;
    const rearSurface = rearSurfaceCount ? rearSurfaceSum / rearSurfaceCount : rootY;
    const balanceActive = grounded && this.sitBlend < 0.45 && airBlend < 0.45;
    const terrainRoll = balanceActive ? clamp((leftSurface - rightSurface) * 0.10, -0.045, 0.045) : 0;
    const terrainPitch = balanceActive ? clamp((frontSurface - rearSurface) * 0.075, -0.04, 0.04) : 0;
    // Tiny irregular breathing and weight shifts keep the idle pose alive without skating the paws.
    const breath = Math.sin(this.time * 2.05) * 0.008 + Math.sin(this.time * 0.71) * 0.0035;
    const idleSway = Math.sin(this.time * 1.65) * 0.008 + Math.sin(this.time * 0.87) * 0.004;
    // A small suspension bounce moves the complete rig, while IK re-solves each grounded
    // paw against the collision surface. Keep the vertical lift below the leg's reach.
    // Weight transfer: compress near footfall and rise as the legs pass under the torso.
    // Use one broad suspension arc per stride. The previous doubled-frequency bounce
    // made the whole dog vibrate at sprint speed, especially on high-refresh devices.
    const suspensionWave = smoothstep(Math.max(0, Math.sin(this.phase - 0.55)));
    const rootBounce = grounded && !sitting ? suspensionWave * mix(0.012, mix(0.023, 0.034, maxRunBlend), runBlend) * gait : 0;
    const bodyAlpha = 1 - Math.exp(-dt * 13.5);
    this.rig.root.position.y = THREE.MathUtils.lerp(this.rig.root.position.y, rootBounce, bodyAlpha);
    // The torso follows one broad load-launch-recover arc instead of sharp narrow pulses.
    const gaitBobPhase = this.phase - 0.9;
    const gaitBob = (Math.sin(gaitBobPhase) * 0.5 + 0.5) * mix(0.008, mix(0.018, 0.026, maxRunBlend), runBlend) * gait;
    const flightPulse = Math.pow(Math.max(0, Math.cos(this.phase - 0.25)), 2) * maxRunBlend * 0.018;
    const landingCompression = Math.pow(Math.max(0, Math.cos(this.phase + Math.PI - 0.25)), 2) * maxRunBlend * 0.008;
    const bodyTargetY = 0.72 + mix(idleSway, gaitBob, Math.min(1, gait * 1.8)) + breath + flightPulse - landingCompression - this.landingPulse * 0.07 - this.sitBlend * 0.018;
    const bodyTargetZ = mix(Math.sin(this.time * 1.1) * 0.01, Math.sin(this.phase * 0.5) * mix(0.016, mix(0.028, 0.043, maxRunBlend), runBlend), gait) * (1 - this.sitBlend * 0.55) + terrainRoll;
    const bodyTargetX = mix(0, -0.025 * runBlend + Math.sin(this.phase - 0.55) * mix(0.010, mix(0.022, 0.042, maxRunBlend), runBlend), gait) + this.sitBlend * 0.18 + terrainPitch;
    const bodyTargetYaw = Math.sin(this.phase) * mix(0.010, mix(0.020, 0.034, maxRunBlend), runBlend) * gait;
    body.position.y = THREE.MathUtils.lerp(body.position.y, bodyTargetY, bodyAlpha);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, bodyTargetZ, bodyAlpha);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, bodyTargetX, bodyAlpha);
    body.rotation.y = THREE.MathUtils.lerp(body.rotation.y, bodyTargetYaw, bodyAlpha);

    // Subtle idle attention: slow nods and small side-to-side scans keep the head alive
    // without moving the feet or adding bones, constraints, or per-frame allocations.
    const idleHeadNod = Math.sin(this.time * 1.05 + 0.25) * 0.018 + Math.sin(this.time * 0.46) * 0.012;
    const idleHeadYaw = Math.sin(this.time * 0.58) * 0.045 + Math.sin(this.time * 1.13 + 0.7) * 0.012;
    const groundHeadX = Math.sin(this.phase - 0.5) * mix(0.028, 0.055, runBlend) - 0.075 * runBlend;
    const movingHeadYaw = Math.sin(this.phase * 0.48) * mix(0.012, 0.035, runBlend) + Math.sin(this.time * 1.1) * 0.009;
    // The head gently counterbalances the torso while walking/running, then settles into
    // a soft idle scan. Exponential damping makes transitions independent of frame rate.
    const headTargetX = mix(idleHeadNod, groundHeadX - body.rotation.x * 0.35 * runBlend, gait);
    const headTargetY = mix(idleHeadYaw, movingHeadYaw, gait) * (1 - this.sitBlend * 0.28);
    const headTargetZ = Math.sin(this.time * 0.83) * 0.014 + Math.sin(this.time * 0.43) * 0.006 + Math.sin(this.phase * 0.5) * 0.012 * gait;
    const headAlpha = 1 - Math.exp(-Math.min(dt, 0.05) * 7.5);
    this.rig.headPivot.rotation.x = THREE.MathUtils.lerp(
      this.rig.headPivot.rotation.x,
      mix(headTargetX, -0.16, airBlend) + this.landingPulse * 0.08 - this.sitBlend * 0.075,
      headAlpha
    );
    this.rig.headPivot.rotation.y = THREE.MathUtils.lerp(this.rig.headPivot.rotation.y, headTargetY, headAlpha);
    this.rig.headPivot.rotation.z = THREE.MathUtils.lerp(this.rig.headPivot.rotation.z, headTargetZ, headAlpha);

    // IK converts world targets through the rig root only, so refresh the hierarchy once per frame.
    if (needsGroundIK || needsBlockedAirYaw) this.rig.root.updateMatrixWorld(true);
    for (const leg of this.rig.parts.legs) {
      // Walk uses diagonal pairs (FL+BR, FR+BL). Gallop synchronises the
      // front pair and delays the rear pair by half a cycle, blended smoothly.
      const walkOffset = leg.index === 0 || leg.index === 3 ? 0 : Math.PI;
      // A slight left/right lead removes the perfectly mirrored, mechanical timing of a paired gallop.
      const leadPhase = leg.side < 0 ? -0.10 : 0.10;
      const runOffset = leg.front ? leadPhase : Math.PI + leadPhase * 1.35;
      const phaseOffset = THREE.MathUtils.lerp(walkOffset, runOffset, runBlend);
      const phase = this.phase + phaseOffset;
      const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
      // A short overlap at maximal sprint creates a brief all-paws-off-ground flight beat.
      const swingRatio = mix(0.36, mix(0.43, 0.59, maxRunBlend), runBlend);
      const swinging = moving && cycle < swingRatio;
      const swingProgress = swinging ? cycle / swingRatio : 0;
      const footStanceProgress = THREE.MathUtils.clamp((cycle - swingRatio) / (1 - swingRatio), 0, 1);
      // Ease both ends of the lift arc so the paw does not snap vertically at takeoff/landing.
      const lift = swinging ? Math.sin(Math.PI * ease(swingProgress)) : 0;
      const contact = contacts[leg.index] || null;
      const contactBlocked = Boolean(contact?.blocked || contact?.obstacleAhead);
      // During stance the planted paw travels rearward relative to the torso; swing
      // lifts it and brings it forward with eased timing instead of a sinusoidal skate.
      const strideLength = THREE.MathUtils.clamp(speed * Math.PI * (1 - swingRatio) / cycleSpeed, 0.12, mix(0.28, 0.40, maxRunBlend));
      const strideOffset = !moving ? 0 : swinging
        ? mix(strideLength, -strideLength, ease(swingProgress))
        : mix(-strideLength, strideLength, ease(footStanceProgress));
      const safeLift = swinging && !contactBlocked ? lift : 0;
      const toeClearance = mix(0.085, mix(0.15, 0.215, maxRunBlend), runBlend);
      leg.pawTarget.position.set(leg.baseX, 0.06 + safeLift * toeClearance, leg.baseZ + (contactBlocked ? 0 : strideOffset));
      leg.inSwing = swinging && !contactBlocked;

      const hasIKTarget = Boolean(contact?.hasSurface && Number.isFinite(contact.currentY) && Number.isFinite(contact.targetX) && Number.isFinite(contact.targetZ));
      const canSolveIK = needsGroundIK && hasIKTarget;
      const canResolveBlockedAirYaw = !needsGroundIK && contactBlocked && hasIKTarget;
      let ikUpper = leg.front ? 0.02 : -0.04;
      let ikLower = leg.front ? 0.0 : 0.12;
      let ikYaw = 0;
      if (canResolveBlockedAirYaw) {
        // Full leg IK is blended out in the air, but keep the lateral tuck for a paw
        // approaching a wall. This needs only a yaw solve, not the two law-of-cosines solves.
        const targetWorld = this.targetWorldScratch.set(
          Number.isFinite(contact.safeTargetX) ? contact.safeTargetX : contact.targetX,
          contact.currentY - 0.001,
          Number.isFinite(contact.safeTargetZ) ? contact.safeTargetZ : contact.targetZ
        );
        const targetLocal = this.targetLocalScratch.copy(targetWorld);
        this.rig.root.worldToLocal(targetLocal);
        const dx = targetLocal.x - leg.upperLeg.position.x;
        const dz = targetLocal.z - leg.upperLeg.position.z;
        ikYaw = Math.atan2(-dx, -dz);
      } else if (canSolveIK) {
        // The lowest sole pad sits 1 mm above the ankle pivot. Target the ankle
        // just below the measured surface, not 2.3 cm above it, or every paw will hover.
        const targetWorld = this.targetWorldScratch.set(
          contactBlocked && Number.isFinite(contact.safeTargetX) ? contact.safeTargetX : contact.targetX,
          contact.currentY - 0.001,
          contactBlocked && Number.isFinite(contact.safeTargetZ) ? contact.safeTargetZ : contact.targetZ
        );
        const targetLocal = this.targetLocalScratch.copy(targetWorld);
        this.rig.root.worldToLocal(targetLocal);
        const dx = targetLocal.x - leg.upperLeg.position.x;
        const dy = targetLocal.y - leg.upperLeg.position.y;
        const dz = targetLocal.z - leg.upperLeg.position.z;
        // Normal stance remains a simple sagittal solve. Recovery targets use true
        // 3D reach and a yawed bend plane so a tucked paw can move inward without
        // asking a two-bone leg to stretch beyond its total length.
        const horizontal = contactBlocked ? Math.hypot(dx, dz) : dz;
        const rawDistance = Math.hypot(dy, horizontal);
        const l1 = leg.upperLength;
        const l2 = leg.lowerLength;
        const distance = clamp(rawDistance, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
        const targetAngle = contactBlocked ? Math.atan2(horizontal, -dy) : Math.atan2(-dz, -dy);
        const alpha = safeAcos((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance));
        const internalKnee = safeAcos((l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2));
        const bendSign = leg.front ? -1 : 1;
        ikUpper = targetAngle - bendSign * alpha;
        ikLower = bendSign * (Math.PI - internalKnee);
        if (contactBlocked) ikYaw = Math.atan2(-dx, -dz);
      }

      // Swing phase folds the knee; stance phase blends into analytic two-bone IK.
      const swingUpper = contactBlocked ? (leg.front ? 0.02 : -0.04) : Math.sin(phase) * swingAmount;
      // Cosine-driven knee flex mirrors the reference animation. Front knees fold
      // backward; rear knees fold forward, with stronger flex during a gallop.
      const kneeAmplitude = THREE.MathUtils.lerp(0.5, mix(1.2, 1.38, maxRunBlend), runBlend);
      const kneeFlex = Math.max(0, Math.cos(phase)) * kneeAmplitude;
      const swingLower = contactBlocked ? 0 : (leg.front ? -kneeFlex : kneeFlex);
      // Do not blend into planted-foot IK before the swing arc has finished.
      // This matters most during a gallop, where the swing occupies over half the cycle.
      const stanceProgress = THREE.MathUtils.clamp((cycle - swingRatio) / 0.10, 0, 1);
      const stanceFade = THREE.MathUtils.clamp((1 - cycle) / 0.12, 0, 1);
      const ikWeight = canSolveIK
        ? (contactBlocked ? 1 : moving ? smoothstep(stanceProgress) * smoothstep(stanceFade) : 1)
        : 0;
      const upperTarget = THREE.MathUtils.lerp(swingUpper, ikUpper, ikWeight);
      const lowerTarget = THREE.MathUtils.lerp(swingLower, ikLower, ikWeight);
      const airUpper = leg.front ? -0.58 : 0.48;
      const airLower = leg.front ? 0.55 : -0.55;
      const locomotionUpper = THREE.MathUtils.lerp(upperTarget, airUpper, airBlend);
      const locomotionLower = THREE.MathUtils.lerp(lowerTarget, airLower, airBlend);
      const sitUpper = leg.front ? -0.08 : 0.74;
      const sitLower = leg.front ? 0.08 : -0.95;
      const finalUpper = THREE.MathUtils.lerp(locomotionUpper, sitUpper, this.sitBlend);
      const finalLower = THREE.MathUtils.lerp(locomotionLower, sitLower, this.sitBlend);
      const rotationAlpha = 1 - Math.exp(-dt * 22);
      leg.upperLeg.rotation.x = THREE.MathUtils.lerp(leg.upperLeg.rotation.x, finalUpper, rotationAlpha);
      leg.lowerLeg.rotation.x = THREE.MathUtils.lerp(leg.lowerLeg.rotation.x, finalLower, rotationAlpha);

      // The ankle counter-rotates against hip/knee motion so the sole stays flat in
      // stance. During swing, the toe lifts; in the air/sit poses it gets a smaller
      // purposeful angle. Clamp the hinge to a believable mechanical range.
      const toeLift = swinging ? Math.sin(Math.PI * ease(swingProgress)) * (sprinting ? mix(0.42, 0.56, maxRunBlend) : 0.30) : 0;
      const airFootPitch = leg.front ? 0.22 : -0.14;
      const sitFootPitch = leg.front ? 0.07 : -0.12;
      let desiredFootPitch = THREE.MathUtils.lerp(0, toeLift, moving ? 1 : 0);
      desiredFootPitch = THREE.MathUtils.lerp(desiredFootPitch, airFootPitch, airBlend);
      desiredFootPitch = THREE.MathUtils.lerp(desiredFootPitch, sitFootPitch, this.sitBlend);
      const ankleTarget = THREE.MathUtils.clamp(
        desiredFootPitch - leg.upperLeg.rotation.x - leg.lowerLeg.rotation.x,
        -0.95,
        0.95
      );
      if (leg.anklePivot) {
        leg.anklePivot.rotation.x = THREE.MathUtils.lerp(leg.anklePivot.rotation.x, ankleTarget, rotationAlpha);
        // A small roll prevents the ankle from looking like a single-axis toy hinge.
        const ankleRoll = grounded && !sitting && this.sitBlend < 0.25
          ? THREE.MathUtils.clamp(-leg.upperLeg.rotation.z * 0.32, -0.10, 0.10)
          : 0;
        leg.anklePivot.rotation.z = THREE.MathUtils.lerp(leg.anklePivot.rotation.z, ankleRoll, rotationAlpha);
      }
      leg.upperLeg.rotation.y = THREE.MathUtils.lerp(leg.upperLeg.rotation.y, ikYaw, rotationAlpha);
      leg.upperLeg.rotation.z = THREE.MathUtils.lerp(leg.upperLeg.rotation.z, leg.side * (moving ? 0.025 : 0), rotationAlpha);
      leg.justSwung = leg.previousSwing && !swinging;
      leg.previousSwing = swinging;
    }
    for (const ear of this.rig.parts.ears) {
      const perk = mix(0, 0.05, runBlend);
      const idleEarFlick = Math.sin(this.time * 1.7 + ear.side * 1.9) * 0.018;
      ear.group.rotation.z = ear.side * (Math.sin(this.time * 2.4 + ear.side) * 0.025 + idleEarFlick + perk - this.sitBlend * 0.025);
      const streamAlpha = 1 - Math.exp(-dt * 12);
      ear.group.rotation.x = THREE.MathUtils.lerp(ear.group.rotation.x, -0.46 * runBlend, streamAlpha);
    }
    // Two-joint tail motion: relaxed wag at rest, a livelier side sweep while walking,
    // and a tighter counterbalance during a sprint. All joints are damped, so neither
    // locomotion changes nor a frame-time spike can snap the tail between poses.
    const tailFrequency = mix(2.15, mix(4.4, 7.0, maxRunBlend), gait);
    const tailPhase = this.time * tailFrequency + Math.sin(this.phase * 0.42) * 0.12;
    const tailWagAmplitude = mix(0.105, mix(0.205, 0.125, maxRunBlend), gait) * mix(1, 0.62, this.sitBlend);
    const tailTargetX = mix(-0.19, mix(-0.115, -0.035, maxRunBlend), gait) + Math.sin(this.phase * 1.7) * 0.014 * gait;
    const tailTargetY = Math.sin(tailPhase) * tailWagAmplitude;
    const tailTargetZ = Math.sin(tailPhase - 0.38) * mix(0.012, 0.032, gait);
    const tailAlpha = 1 - Math.exp(-Math.min(dt, 0.05) * 9.0);
    this.rig.tailPivot.rotation.x = THREE.MathUtils.lerp(this.rig.tailPivot.rotation.x, mix(tailTargetX, 0.12, this.sitBlend), tailAlpha);
    this.rig.tailPivot.rotation.y = THREE.MathUtils.lerp(this.rig.tailPivot.rotation.y, tailTargetY, tailAlpha);
    this.rig.tailPivot.rotation.z = THREE.MathUtils.lerp(this.rig.tailPivot.rotation.z, tailTargetZ, tailAlpha);
    const tailTipYaw = Math.sin(tailPhase - 0.62) * tailWagAmplitude * 0.78;
    const tailTipPitch = Math.sin(tailPhase * 1.08 - 0.3) * mix(0.025, 0.052, gait) - 0.025 * maxRunBlend;
    this.rig.parts.tail[1].rotation.y = THREE.MathUtils.lerp(this.rig.parts.tail[1].rotation.y, tailTipYaw, tailAlpha);
    this.rig.parts.tail[1].rotation.x = THREE.MathUtils.lerp(this.rig.parts.tail[1].rotation.x, tailTipPitch, tailAlpha);
    return this.state;
  }
}
