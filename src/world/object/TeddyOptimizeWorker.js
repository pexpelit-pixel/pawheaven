import { BufferAttribute, BufferGeometry } from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

// Runs meshoptimizer simplification away from the render thread.
self.onmessage = async (event) => {
  const payload = event.data || {};
  let sourceGeometry = null;
  let simplifiedGeometry = null;

  try {
    sourceGeometry = new BufferGeometry();
    for (const attribute of payload.attributes || []) {
      if (!attribute?.name || !ArrayBuffer.isView(attribute.array)) continue;
      sourceGeometry.setAttribute(
        attribute.name,
        new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized === true)
      );
    }

    if (ArrayBuffer.isView(payload.indexArray)) {
      sourceGeometry.setIndex(new BufferAttribute(payload.indexArray, 1));
    }

    const position = sourceGeometry.getAttribute('position');
    const index = sourceGeometry.getIndex();
    if (!position || !index || index.count < 3) {
      throw new Error('Teddy geometry is missing indexed positions.');
    }

    const beforeVertices = position.count;
    const beforeTriangles = Math.floor(index.count / 3);
    const targetVertices = Math.max(10000, Math.min(16000, Math.floor(payload.targetVertices || 16000)));

    if (beforeVertices > targetVertices) {
      const modifier = new SimplifyModifier();
      simplifiedGeometry = await modifier.modify(sourceGeometry, beforeVertices - targetVertices);
    } else {
      simplifiedGeometry = sourceGeometry;
    }

    const outputAttributes = [];
    const transfers = [];
    for (const [name, attribute] of Object.entries(simplifiedGeometry.attributes)) {
      outputAttributes.push({
        name,
        array: attribute.array,
        itemSize: attribute.itemSize,
        normalized: attribute.normalized
      });
      transfers.push(attribute.array.buffer);
    }

    const outputIndex = simplifiedGeometry.getIndex()?.array || null;
    if (outputIndex) transfers.push(outputIndex.buffer);

    const result = {
      ok: true,
      attributes: outputAttributes,
      indexArray: outputIndex,
      beforeVertices,
      beforeTriangles,
      afterVertices: simplifiedGeometry.getAttribute('position')?.count || 0,
      afterTriangles: outputIndex ? Math.floor(outputIndex.length / 3) : 0
    };

    self.postMessage(result, transfers);
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (simplifiedGeometry && simplifiedGeometry !== sourceGeometry) simplifiedGeometry.dispose();
    sourceGeometry?.dispose();
  }
};
