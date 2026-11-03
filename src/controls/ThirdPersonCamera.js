import * as THREE from 'three';

/** Character-first follow camera with zoom, soft occlusion handling and low CPU raycast cost. */
export class ThirdPersonCamera {
  constructor(camera, worldRoot) {
    this.camera = camera;
    this.worldRoot = worldRoot;
    this.target = new THREE.Vector3(0, 0.82, 2.5);
    this.currentTarget = this.target.clone();
    this.yaw = 0.12;
    this.pitch = 0.22;
    this.distance = 6.0;
    this.targetDistance = 6.0;
    this.minDistance = 2.7;
    this.maxDistance = 15;
    this.raycaster = new THREE.Raycaster();
    this.cameraOccluders = [];
    this.cameraOcclusionHits = [];
    this.occluderScale = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.safePosition = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    // Reuse the movement basis object: movement reads this every fixed physics tick.
    this.moveBasis = { forward: this.forward, right: this.right };
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.lookOffset = new THREE.Vector3(0, 0.82, 0);
    this.occlusionTimer = 0;
    this.cinematic = null;
    this.cachedSafeDistance = this.distance;
    this.cacheCameraOccluders();
  }

  cacheCameraOccluders() {
    this.cameraOccluders.length = 0;
    if (!this.worldRoot?.traverse) return;

    // Cache only substantial regular meshes once. The old recursive raycast visited every
    // decorative child on each orbit query, even objects too small to meaningfully occlude K-09.
    this.worldRoot.updateMatrixWorld(true);
    this.worldRoot.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || !object.visible || object.userData.cameraIgnore || !object.geometry) return;
      const geometry = object.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      if (!sphere || !Number.isFinite(sphere.radius)) return;
      object.getWorldScale(this.occluderScale);
      const worldRadius = sphere.radius * Math.max(
        Math.abs(this.occluderScale.x),
        Math.abs(this.occluderScale.y),
        Math.abs(this.occluderScale.z)
      );
      if (worldRadius < 0.16) return;
      this.cameraOccluders.push(object);
    });
  }

  orbit(dx, dy) {
    if (this.cinematic) return;
    this.yaw -= dx * 0.0042;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0032, 0.035, 0.72);
  }

  /** Positive wheel delta zooms out; negative delta zooms in. */
  zoom(delta) {
    if (this.cinematic) return;
    const amount = THREE.MathUtils.clamp(Number(delta) || 0, -180, 180);
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + amount * 0.010, this.minDistance, this.maxDistance);
  }

  /** direction -1 zooms in, +1 zooms out. */
  zoomStep(direction) {
    if (this.cinematic) return;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + (direction > 0 ? 0.8 : -0.8), this.minDistance, this.maxDistance);
  }

  resetView(targetPosition = null, yaw = 0.12) {
    this.cinematic = null;
    this.yaw = Number.isFinite(yaw) ? yaw : 0.12;
    this.pitch = 0.22;
    this.targetDistance = 6.0;
    if (!targetPosition || !Number.isFinite(targetPosition.x)
      || !Number.isFinite(targetPosition.y) || !Number.isFinite(targetPosition.z)) return;

    // Teleports must move the camera target and camera itself in the same frame.
    // Otherwise the follow interpolation still points at the previous world location.
    this.distance = this.targetDistance;
    this.target.set(targetPosition.x, targetPosition.y + this.lookOffset.y, targetPosition.z);
    this.currentTarget.copy(this.target);
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.currentTarget.x + Math.sin(this.yaw) * horizontal,
      this.currentTarget.y + Math.sin(this.pitch) * this.distance,
      this.currentTarget.z + Math.cos(this.yaw) * horizontal
    );
    this.cachedSafeDistance = this.distance;
    this.occlusionTimer = 0;
    this.camera.lookAt(this.currentTarget);
  }

  playCinematic(cameraPoints, lookPoints, duration = 5, onComplete = null) {
    if (!Array.isArray(cameraPoints) || cameraPoints.length < 2
      || !Array.isArray(lookPoints) || lookPoints.length !== cameraPoints.length) return false;

    const cameraVectors = cameraPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const targetVectors = lookPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const cameraPath = new THREE.CatmullRomCurve3(cameraVectors, false, 'centripetal');
    const targetPath = new THREE.CatmullRomCurve3(targetVectors, false, 'centripetal');
    // Dense arc-length sampling keeps camera speed uniform on 120 Hz displays.
    cameraPath.arcLengthDivisions = 600;
    targetPath.arcLengthDivisions = 600;
    cameraPath.updateArcLengths();
    targetPath.updateArcLengths();
    this.cinematic = {
      cameraPath,
      targetPath,
      duration: Math.max(0.25, Number(duration) || 5),
      elapsed: 0,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };
    this.camera.position.copy(this.cinematic.cameraPath.getPoint(0));
    this.camera.lookAt(this.cinematic.targetPath.getPoint(0));
    return true;
  }

  skipCinematic() {
    const shot = this.cinematic;
    if (!shot) return false;
    this.camera.position.copy(shot.cameraPath.getPoint(1));
    this.camera.lookAt(shot.targetPath.getPoint(1));
    this.cinematic = null;
    shot.onComplete?.();
    return true;
  }

  updateCinematic(dt) {
    const shot = this.cinematic;
    if (!shot) return false;
    shot.elapsed += THREE.MathUtils.clamp(dt, 0, 0.1);
    const linear = THREE.MathUtils.clamp(shot.elapsed / shot.duration, 0, 1);
    // Quintic smootherstep has zero velocity and acceleration at both ends,
    // avoiding the small start/stop jolt of the cubic smoothstep curve.
    const eased = linear * linear * linear * (linear * (linear * 6 - 15) + 10);
    this.camera.position.copy(shot.cameraPath.getPointAt(eased));
    this.camera.lookAt(shot.targetPath.getPointAt(eased));
    if (linear >= 1) {
      this.camera.position.copy(shot.cameraPath.getPoint(1));
      this.camera.lookAt(shot.targetPath.getPoint(1));
      this.cinematic = null;
      shot.onComplete?.();
    }
    return true;
  }

  getMoveBasis() {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.right.crossVectors(this.forward, this.worldUp).normalize();
    return this.moveBasis;
  }

  update(dt, roverPosition) {
    const frameDt = THREE.MathUtils.clamp(dt, 0, 0.1);
    if (this.cinematic) {
      this.updateCinematic(frameDt);
      return;
    }
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, 1 - Math.exp(-frameDt * 9));
    this.target.set(roverPosition.x, roverPosition.y + this.lookOffset.y, roverPosition.z);
    this.currentTarget.lerp(this.target, 1 - Math.exp(-frameDt * 10));

    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desiredPosition.set(
      this.currentTarget.x + Math.sin(this.yaw) * horizontal,
      this.currentTarget.y + Math.sin(this.pitch) * this.distance,
      this.currentTarget.z + Math.cos(this.yaw) * horizontal
    );

    this.direction.copy(this.desiredPosition).sub(this.currentTarget);
    const desiredDistance = this.direction.length();
    this.direction.normalize();

    // Recursive raycasts traverse shelter geometry and can become a major CPU spike while orbiting.
    // Hard-throttle occlusion checks to 10 Hz even during fast drags; camera interpolation still runs every frame.
    this.occlusionTimer -= frameDt;
    if (this.occlusionTimer <= 0) {
      this.raycaster.set(this.currentTarget, this.direction);
      this.raycaster.near = 0.12;
      this.raycaster.far = desiredDistance;
      const hits = this.cameraOcclusionHits;
      hits.length = 0;
      if (this.cameraOccluders.length) {
        this.raycaster.intersectObjects(this.cameraOccluders, false, hits);
      }
      let safeDistance = desiredDistance;
      for (const hit of hits) {
        if (!hit.object.visible || hit.object.userData.cameraIgnore) continue;
        if (hit.distance > 0.16) {
          safeDistance = Math.min(safeDistance, Math.max(0.68, hit.distance - 0.34));
          break;
        }
      }
      this.cachedSafeDistance = safeDistance;
      this.occlusionTimer = 0.10;
    }

    const safeDistance = Math.min(desiredDistance, this.cachedSafeDistance);
    this.safePosition.copy(this.currentTarget).addScaledVector(this.direction, safeDistance);
    const currentDistance = this.camera.position.distanceTo(this.currentTarget);
    const cameraRate = safeDistance < currentDistance ? 19 : 7.5;
    this.camera.position.lerp(this.safePosition, 1 - Math.exp(-frameDt * cameraRate));
    this.camera.lookAt(this.currentTarget);
  }
}
