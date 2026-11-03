import * as THREE from 'three';
import { DogRig } from './DogRig.js';
import { DogAnimator } from './DogAnimator.js';
import WORLD_RULES from '../world/worldrules.json';

export class RobotDog {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'PlayerRobotDog';
    const spawn = WORLD_RULES.playerSpawn ?? { x: 0, y: 0.0775, z: 2.5, yaw: 0 };
    this.group.position.set(spawn.x, spawn.y, spawn.z);
    this.group.rotation.y = spawn.yaw ?? 0;
    scene.add(this.group);
    this.rig = new DogRig();
    this.group.add(this.rig.root);
    this.animator = new DogAnimator(this.rig);
    this.speed = 0;
    this.sprinting = false;
    this.sitting = false;
    this.grounded = true;
    this.verticalVelocity = 0;
    this.state = 'idle';
    this.footContacts = null;
    this.footLandingEvents = [];
    this.dustParticles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.018, 5, 4),
      new THREE.MeshBasicMaterial({ color: '#cbbba2', transparent: true, opacity: 0.48, depthWrite: false }),
      16
    );
    this.dustParticles.name = 'PawLandingDust';
    this.dustParticles.frustumCulled = false;
    this.dustDummy = new THREE.Object3D();
    this.dustCursor = 0;
    this.dustStates = Array.from({ length: 16 }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    for (let i = 0; i < this.dustStates.length; i++) {
      this.dustDummy.scale.setScalar(0);
      this.dustDummy.updateMatrix();
      this.dustParticles.setMatrixAt(i, this.dustDummy.matrix);
    }
    scene.add(this.dustParticles);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 28), new THREE.MeshBasicMaterial({ color: '#405647', transparent: true, opacity: 0.13, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0;
    this.shadow.scale.set(1.12, 0.72, 1);
    this.group.add(this.shadow);
  }

  updateAnimation(dt, movementIntent = true) {
    this.state = this.animator.update(dt, this.speed, this.sprinting, this.grounded, this.verticalVelocity, this.sitting, this.footContacts, movementIntent);
    this.updateFootDust(dt);
    const heightFactor = Math.min(1, Math.max(0, (this.group.position.y - 0.15) / 1.5));
    this.shadow.material.opacity = 0.13 * (1 - heightFactor * 0.75);
    this.shadow.scale.set(1.12 + heightFactor * 0.15, 0.72 + heightFactor * 0.1, 1);
  }

  updateFootDust(dt) {
    const landingEvents = this.footLandingEvents || [];
    const hasLiveParticles = this.dustStates.some((particle) => particle.life > 0);
    if (!landingEvents.length && !hasLiveParticles) {
      this.footLandingEvents.length = 0;
      return;
    }
    for (const contact of landingEvents) {
      if (!contact.justLanded || !Number.isFinite(contact.targetX) || !Number.isFinite(contact.currentY)) continue;
      for (let j = 0; j < 3; j++) {
        const index = this.dustCursor++ % this.dustStates.length;
        const particle = this.dustStates[index];
        const angle = (index * 2.399 + j * 1.7) % (Math.PI * 2);
        const spread = 0.025 + j * 0.018;
        particle.x = contact.targetX + Math.cos(angle) * spread;
        particle.y = contact.currentY + 0.018;
        particle.z = contact.targetZ + Math.sin(angle) * spread;
        particle.vx = Math.cos(angle) * (0.12 + j * 0.035);
        particle.vy = 0.12 + j * 0.045;
        particle.vz = Math.sin(angle) * (0.12 + j * 0.035);
        particle.life = 0.30 + j * 0.045;
      }
    }
    this.footLandingEvents.length = 0;
    for (let i = 0; i < this.dustStates.length; i++) {
      const particle = this.dustStates[i];
      if (particle.life > 0) {
        particle.life = Math.max(0, particle.life - dt);
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vy -= 0.55 * dt;
      }
      const fade = particle.life > 0 ? particle.life / 0.345 : 0;
      this.dustDummy.position.set(particle.x, particle.y, particle.z);
      this.dustDummy.scale.setScalar(0.045 * fade);
      this.dustDummy.updateMatrix();
      this.dustParticles.setMatrixAt(i, this.dustDummy.matrix);
    }
    this.dustParticles.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.rig.dispose();
    this.dustParticles.parent?.remove(this.dustParticles);
    this.dustParticles.geometry.dispose();
    this.dustParticles.material.dispose();
    this.shadow.geometry.dispose(); this.shadow.material.dispose();
    this.group.parent?.remove(this.group);
  }
}
