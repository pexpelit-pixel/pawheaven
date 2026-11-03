import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export class DogRig {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'RoverRig';
    this.parts = { legs: [], ears: [], tail: [] };
    this.materials = {
      shell: new THREE.MeshStandardMaterial({ color: '#d9e4d9', roughness: 0.38, metalness: 0.28 }),
      edge: new THREE.MeshStandardMaterial({ color: '#8caaa0', roughness: 0.42, metalness: 0.36 }),
      dark: new THREE.MeshStandardMaterial({ color: '#334c4a', roughness: 0.55, metalness: 0.22 }),
      joint: new THREE.MeshStandardMaterial({ color: '#b3c7be', roughness: 0.42, metalness: 0.48 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#536b65', roughness: 0.78, metalness: 0.04 }),
      cream: new THREE.MeshStandardMaterial({ color: '#fff0d5', roughness: 0.56, metalness: 0.05 }),
      coral: new THREE.MeshStandardMaterial({ color: '#e89e88', roughness: 0.46, metalness: 0.1 }),
      teal: new THREE.MeshStandardMaterial({ color: '#7bd9ce', emissive: '#278f86', emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.14 }),
      optic: new THREE.MeshStandardMaterial({ color: '#b8f6f1', emissive: '#6ae5de', emissiveIntensity: 0.65, roughness: 0.18, metalness: 0.04 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e5c77f', roughness: 0.28, metalness: 0.7 }),
      pulse: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec3 vNormalLocal; varying vec3 vPositionLocal; void main(){ vNormalLocal = normalize(normal); vPositionLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uTime; varying vec3 vNormalLocal; varying vec3 vPositionLocal; void main(){ float pulse = 0.5 + 0.5 * sin(uTime * 3.1); float edge = pow(1.0 - abs(normalize(vNormalLocal).z), 2.0); float scan = 0.92 + 0.08 * sin(vPositionLocal.y * 95.0 + uTime * 2.0); vec3 mint = vec3(0.08, 0.48, 0.43); vec3 ice = vec3(0.62, 1.0, 0.89); vec3 color = mix(mint, ice, pulse * 0.65 + edge * 0.25) * scan; gl_FragColor = vec4(color, 1.0); }`,
        roughness: 0.25,
        metalness: 0.1
      })
    };
    this.geometries = new Set();
    // Reuse identical local-space geometry across body details and articulated limbs.
    // Mesh transforms stay independent, while each shared GPU geometry is disposed once.
    this.geometryCache = new Map();
    this.makeBody();
    this.makeHead();
    this.makeLegs();
    this.makeTail();
    this.makeDetails();
    this.root.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
  }

  geometry(key, create) {
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      geometry = create();
      this.geometryCache.set(key, geometry);
    }
    return geometry;
  }

  mesh(geometry, material, parent, x, y, z, scale = null) {
    this.geometries.add(geometry);
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z);
    if (scale) m.scale.set(scale.x, scale.y, scale.z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  rounded(w, h, d, r = 0.12) {
    const radius = Math.min(r, w / 3, h / 3, d / 3);
    const key = `rounded:${w}:${h}:${d}:3:${radius}`;
    return this.geometry(key, () => new RoundedBoxGeometry(w, h, d, 3, radius));
  }
  sphere(parent, x, y, z, sx, sy, sz, mat) {
    const geometry = this.geometry('sphere:1:18:12', () => new THREE.SphereGeometry(1, 18, 12));
    return this.mesh(geometry, mat, parent, x, y, z, { x: sx, y: sy, z: sz });
  }
  cylinder(parent, x, y, z, rTop, rBottom, h, mat, axis = 'y') {
    const key = `cylinder:${rTop}:${rBottom}:${h}:12:1`;
    const geometry = this.geometry(key, () => new THREE.CylinderGeometry(rTop, rBottom, h, 12, 1));
    const m = this.mesh(geometry, mat, parent, x, y, z);
    if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  }

  makeBody() {
    this.bodyBob = new THREE.Group(); this.bodyBob.position.y = 0.72; this.root.add(this.bodyBob);
    this.mesh(this.rounded(0.9, 0.45, 1.42, 0.17), this.materials.shell, this.bodyBob, 0, 0, 0);
    this.mesh(this.rounded(0.7, 0.18, 1.0, 0.08), this.materials.edge, this.bodyBob, 0, 0.2, 0.06);
    this.mesh(this.rounded(0.54, 0.17, 0.69, 0.08), this.materials.dark, this.bodyBob, 0, 0.285, -0.02);
    this.mesh(this.rounded(0.32, 0.07, 0.42, 0.03), this.materials.teal, this.bodyBob, 0, 0.385, -0.03);
    this.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 32), this.materials.gold, this.bodyBob, 0, 0.34, -0.03);
    this.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 32), this.materials.teal, this.bodyBob, 0, 0.366, -0.03);
    // Side armour badges and mechanical vents.
    for (const side of [-1, 1]) {
      this.mesh(this.rounded(0.055, 0.26, 0.66, 0.025), this.materials.edge, this.bodyBob, side * 0.46, -0.03, 0.05);
      for (let i = 0; i < 3; i++) this.mesh(this.rounded(0.025, 0.035, 0.15, 0.01), this.materials.dark, this.bodyBob, side * 0.493, 0.02 + i * 0.075, -0.1, null).rotation.z = side * 0.07;
      this.sphere(this.bodyBob, side * 0.466, -0.05, -0.42, 0.06, 0.06, 0.06, this.materials.gold);
      this.sphere(this.bodyBob, side * 0.466, -0.05, 0.42, 0.06, 0.06, 0.06, this.materials.gold);
    }
    this.mesh(this.rounded(0.42, 0.16, 0.56, 0.07), this.materials.cream, this.bodyBob, 0, -0.05, -0.47);
  }

  makeHead() {
    this.headPivot = new THREE.Group(); this.headPivot.position.set(0, 0.32, -0.63); this.bodyBob.add(this.headPivot);
    this.mesh(this.rounded(0.64, 0.49, 0.62, 0.17), this.materials.shell, this.headPivot, 0, 0.03, -0.05);
    this.mesh(this.rounded(0.49, 0.11, 0.47, 0.04), this.materials.edge, this.headPivot, 0, 0.26, -0.05);
    this.mesh(this.rounded(0.43, 0.27, 0.30, 0.1), this.materials.dark, this.headPivot, 0, -0.13, -0.37);
    this.mesh(this.rounded(0.3, 0.16, 0.14, 0.05), this.materials.cream, this.headPivot, 0, -0.17, -0.52);
    this.sphere(this.headPivot, 0, -0.12, -0.6, 0.095, 0.08, 0.065, this.materials.rubber);
    for (const side of [-1, 1]) {
      this.mesh(this.rounded(0.15, 0.2, 0.085, 0.035), this.materials.dark, this.headPivot, side * 0.255, 0.01, -0.31);
      this.mesh(this.rounded(0.085, 0.115, 0.04, 0.02), this.materials.optic, this.headPivot, side * 0.255, 0.015, -0.36);
      this.sphere(this.headPivot, side * 0.31, 0.03, -0.02, 0.07, 0.08, 0.09, this.materials.gold);
      const ear = new THREE.Group(); ear.position.set(side * 0.23, 0.29, 0.03); this.headPivot.add(ear); this.parts.ears.push({ group: ear, side });
      const earShell = this.mesh(this.rounded(0.18, 0.34, 0.14, 0.055), this.materials.edge, ear, 0, 0.11, 0);
      earShell.rotation.z = -side * 0.22;
      const earInner = this.mesh(this.rounded(0.075, 0.2, 0.025, 0.015), this.materials.coral, ear, 0, 0.13, -0.078);
      earInner.rotation.z = -side * 0.22;
      this.sphere(ear, 0, -0.05, 0, 0.105, 0.09, 0.1, this.materials.gold);
    }
    // Forehead sensor: small circular glass with a glowing centre.
    this.mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 28), this.materials.gold, this.headPivot, 0, 0.235, -0.29, null).rotation.x = Math.PI / 2;
    this.sphere(this.headPivot, 0, 0.235, -0.32, 0.06, 0.06, 0.03, this.materials.pulse);
    this.sphere(this.headPivot, 0, 0.235, -0.35, 0.035, 0.035, 0.025, this.materials.optic);
    this.mesh(this.rounded(0.08, 0.055, 0.05, 0.01), this.materials.coral, this.headPivot, -0.1, -0.295, -0.53);
    this.mesh(this.rounded(0.08, 0.055, 0.05, 0.01), this.materials.coral, this.headPivot, 0.1, -0.295, -0.53);
  }

  makeLegs() {
    const positions = [
      { x: -0.34, z: -0.46, label: 'front-left' }, { x: 0.34, z: -0.46, label: 'front-right' },
      { x: -0.34, z: 0.47, label: 'rear-left' }, { x: 0.34, z: 0.47, label: 'rear-right' }
    ];
    const upperLength = 0.31;
    const lowerLength = 0.33;
    for (const [index, p] of positions.entries()) {
      // Two-segment low-poly leg. Each segment's origin is its joint, never its centre.
      const upperLeg = new THREE.Group();
      upperLeg.name = 'UpperLeg-' + p.label;
      upperLeg.position.set(p.x, 0.64, p.z);
      this.root.add(upperLeg);
      this.sphere(upperLeg, 0, 0, 0, 0.14, 0.14, 0.14, this.materials.gold);

      const upperGeometry = this.geometry(`leg-upper:${upperLength}:0.075:0.095:8`, () => {
        const geometry = new THREE.CylinderGeometry(0.075, 0.095, upperLength, 8, 1);
        geometry.translate(0, -upperLength / 2, 0);
        return geometry;
      });
      this.mesh(upperGeometry, this.materials.shell, upperLeg, 0, 0, 0);
      this.mesh(this.rounded(0.19, 0.055, 0.19, 0.025), this.materials.edge, upperLeg, 0, -0.18, 0);

      // The lower segment is a child joint at the exact end of the upper bone.
      const lowerLeg = new THREE.Group();
      lowerLeg.name = 'LowerLeg-' + p.label;
      lowerLeg.position.set(0, -upperLength, 0);
      upperLeg.add(lowerLeg);
      this.sphere(lowerLeg, 0, 0, 0, 0.09, 0.09, 0.09, this.materials.gold);

      const lowerGeometry = this.geometry(`leg-lower:${lowerLength}:0.055:0.075:8`, () => {
        const geometry = new THREE.CylinderGeometry(0.055, 0.075, lowerLength, 8, 1);
        geometry.translate(0, -lowerLength / 2, 0);
        return geometry;
      });
      this.mesh(lowerGeometry, this.materials.edge, lowerLeg, 0, 0, 0);
      // A real ankle hinge sits at the end of the shin. The foot is a separate child,
      // so it can dorsiflex/plantarflex without bending the entire lower leg.
      const anklePivot = new THREE.Group();
      anklePivot.name = 'AnkleJoint-' + p.label;
      anklePivot.position.set(0, -lowerLength, 0);
      lowerLeg.add(anklePivot);
      // Transverse hinge pin and visible end caps communicate a mechanical ankle axis.
      this.cylinder(anklePivot, 0, 0, 0.025, 0.032, 0.032, 0.22, this.materials.dark, 'x');
      this.sphere(anklePivot, -0.105, 0, 0.025, 0.045, 0.045, 0.045, this.materials.gold);
      this.sphere(anklePivot, 0.105, 0, 0.025, 0.045, 0.045, 0.045, this.materials.gold);
      this.sphere(anklePivot, 0, 0, 0.025, 0.067, 0.067, 0.067, this.materials.edge);

      const foot = new THREE.Group();
      foot.name = 'Paw-' + p.label;
      anklePivot.add(foot);
      // Flat rubber sole, rounded toe pointing toward the dog's forward (-Z) direction,
      // and an armour cap. All of it rotates around the ankle pivot as one foot assembly.
      this.mesh(this.rounded(0.22, 0.018, 0.275, 0.025), this.materials.dark, foot, 0, 0.01, -0.055);
      this.mesh(this.rounded(0.25, 0.105, 0.32, 0.045), this.materials.rubber, foot, 0, 0.061, -0.055);
      this.mesh(this.rounded(0.14, 0.026, 0.145, 0.015), this.materials.cream, foot, 0, 0.119, -0.155);
      this.sphere(foot, 0, 0.118, -0.208, 0.052, 0.022, 0.035, this.materials.coral);

      // Invisible target follows the stride; Rapier samples the collider under this point.
      const pawTarget = new THREE.Object3D();
      pawTarget.name = 'PawTarget-' + p.label;
      pawTarget.position.set(p.x, 0.06, p.z);
      this.root.add(pawTarget);
      this.parts.legs.push({ hip: upperLeg, upperLeg, lowerLeg, knee: lowerLeg, anklePivot, foot, pawTarget, upperLength, lowerLength, baseX: p.x, baseZ: p.z, index, front: p.z < 0, side: p.x < 0 ? -1 : 1, previousGrounded: false, previousSwing: false, inSwing: false });
    }
  }
  makeTail() {
    this.tailPivot = new THREE.Group(); this.tailPivot.position.set(0, 0.08, 0.69); this.bodyBob.add(this.tailPivot);
    const lower = this.mesh(this.rounded(0.17, 0.17, 0.48, 0.06), this.materials.edge, this.tailPivot, 0, 0.04, 0.2); lower.rotation.x = -0.55;
    const upperPivot = new THREE.Group(); upperPivot.position.set(0, 0.16, 0.38); this.tailPivot.add(upperPivot);
    const upper = this.mesh(this.rounded(0.14, 0.15, 0.42, 0.055), this.materials.shell, upperPivot, 0, 0.04, 0.19); upper.rotation.x = -0.42;
    this.sphere(upperPivot, 0, 0.1, 0.38, 0.15, 0.14, 0.16, this.materials.coral);
    this.parts.tail = [this.tailPivot, upperPivot];
  }

  makeDetails() {
    // Shoulder discs, feet lights, and neat fasteners sell the manufactured character.
    const shoulderDiscGeometry = this.geometry('cylinder:0.1:0.1:0.035:24:1', () => new THREE.CylinderGeometry(0.1, 0.1, 0.035, 24));
    for (const side of [-1, 1]) {
      this.mesh(shoulderDiscGeometry, this.materials.gold, this.bodyBob, side * 0.46, 0.19, -0.34, null).rotation.z = Math.PI / 2;
      this.sphere(this.bodyBob, side * 0.475, 0.19, -0.34, 0.045, 0.045, 0.045, this.materials.teal);
    }
  }

  dispose() {
    for (const geo of this.geometries) geo.dispose();
    for (const mat of Object.values(this.materials)) mat.dispose();
    this.root.parent?.remove(this.root);
  }
}
