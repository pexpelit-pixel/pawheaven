import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Optional local asset loader plus procedural text textures. The shipped shelter uses fully
 * procedural geometry, so it remains complete without remote model downloads.
 */
export class AssetLoader {
  constructor(onProgress = () => {}) {
    this.resources = new Set();
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (url, loaded, total) => onProgress(total > 0 ? loaded / total : 0, url);
    this.manager.onError = (url) => console.error(`Asset failed to load: ${url}`);
    this.textures = new THREE.TextureLoader(this.manager);
    this.models = new GLTFLoader(this.manager);
  }

  loadTexture(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.textures.load(url, (texture) => {
        texture.colorSpace = options.colorSpace || THREE.SRGBColorSpace;
        texture.anisotropy = Math.max(1, options.anisotropy || 4);
        this.resources.add(texture);
        resolve(texture);
      }, undefined, reject);
    });
  }

  loadModel(url) {
    return new Promise((resolve, reject) => {
      this.models.load(url, (gltf) => {
        this.resources.add(gltf.scene);
        resolve(gltf);
      }, undefined, reject);
    });
  }

  createLabelTexture(text, { background = '#d9e8d6', foreground = '#385b48' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is required to prepare shelter signage.');
    ctx.fillStyle = background;
    ctx.beginPath(); ctx.roundRect(0, 0, 512, 128, 26); ctx.fill();
    ctx.fillStyle = foreground; ctx.font = '700 36px Manrope, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(text).toUpperCase(), 256, 66, 450);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    this.resources.add(texture);
    return texture;
  }

  dispose() {
    for (const resource of this.resources) {
      if (resource.isObject3D) resource.traverse((child) => { if (child.isMesh) { child.geometry?.dispose(); const mats = Array.isArray(child.material) ? child.material : [child.material]; mats.forEach((m) => m?.dispose()); } });
      resource.dispose?.();
    }
    this.resources.clear();
  }
}
