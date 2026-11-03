import * as THREE from 'three';

export class Movement {
  constructor(physics, dog, input, cameraController) {
    this.physics = physics;
    this.dog = dog;
    this.input = input;
    this.camera = cameraController;
    this.horizontalVelocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.forwardScratch = new THREE.Vector3();
    this.rightScratch = new THREE.Vector3();
    this.desiredScratch = new THREE.Vector3();
    this.acceleration = 18;
    this.braking = 23;
    this.walkSpeed = 3.15;
    this.runSpeed = 5.6;
    this.jumpSpeed = 6.6;
    this.gravity = 18;
    this.grounded = true;
  }

  update(dt) {
    const input = this.input.movement();
    const basis = this.camera.getMoveBasis();
    const sprinting = this.input.sprinting();
    const maxSpeed = sprinting ? this.runSpeed : this.walkSpeed;
    this.desiredScratch.set(0, 0, 0).addScaledVector(basis.forward, input.y).addScaledVector(basis.right, input.x);
    if (this.desiredScratch.lengthSq() > 1) this.desiredScratch.normalize();
    this.desiredScratch.multiplyScalar(maxSpeed);
    const moving = input.x !== 0 || input.y !== 0;
    const rate = moving ? this.acceleration : this.braking;
    this.horizontalVelocity.x = THREE.MathUtils.damp(this.horizontalVelocity.x, this.desiredScratch.x, rate, dt);
    this.horizontalVelocity.z = THREE.MathUtils.damp(this.horizontalVelocity.z, this.desiredScratch.z, rate, dt);

    if (this.input.consumeJump() && this.grounded) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
    }
    this.verticalVelocity = Math.max(-25, this.verticalVelocity - this.gravity * dt);
    const movement = this.physics.move({
      x: this.horizontalVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: this.horizontalVelocity.z * dt
    });
    this.physics.step();
    const pos = this.physics.position();
    this.grounded = movement.grounded;
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = -1.2;

    // Softly constrain the player to the level footprint as a safety net at the far wall seams.
    pos.x = THREE.MathUtils.clamp(pos.x, -19.6, 19.6);
    pos.z = THREE.MathUtils.clamp(pos.z, -13.55, 13.55);
    this.dog.group.position.set(pos.x, pos.y - 0.78, pos.z);
    if (this.desiredScratch.lengthSq() > 0.15) {
      const desiredYaw = Math.atan2(-this.horizontalVelocity.x, -this.horizontalVelocity.z);
      const delta = THREE.MathUtils.euclideanModulo(desiredYaw - this.dog.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.dog.group.rotation.y += delta * (1 - Math.exp(-dt * (sprinting ? 9 : 11)));
    }
    this.dog.speed = Math.hypot(this.horizontalVelocity.x, this.horizontalVelocity.z);
    this.dog.sprinting = sprinting && this.dog.speed > this.walkSpeed;
    this.dog.grounded = this.grounded;
    this.dog.verticalVelocity = this.verticalVelocity;
    this.dog.updateAnimation(dt);
  }
}
