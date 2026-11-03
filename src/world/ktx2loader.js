// import * as THREE from 'three';
// import { KTX2Loader } from
  // 'three/addons/loaders/KTX2Loader.js';

// const ktx2Loader = new KTX2Loader()
  // .setTranscoderPath('/basis/')
  // .detectSupport(renderer);

// const textureLoader = new THREE.TextureLoader();

// async function changeTexture(material, format) {
  // const texture = format === 'ktx2'
    // ? await ktx2Loader.loadAsync('/textures/robot-skin.ktx2')
    // : await textureLoader.loadAsync('/textures/robot-skin.webp');

  // texture.colorSpace = THREE.SRGBColorSpace;

  // const previousTexture = material.map;
  // material.map = texture;
  // material.needsUpdate = true;

  // previousTexture?.dispose();
// }