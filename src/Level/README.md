# Level modules

Each playable level owns its definition in a separate file:

- `level-1.js` to `level-5.js`: level metadata, portal trigger, reward, obstacle data, and its puzzle/checkpoint sequence.
- Parkour levels also export their own immutable course geometry.
- `index.js`: the single registry consumed by runtime systems.

## Adding a level

1. Create `level-N.js` and export a `levelN` definition with a unique `id`, token, mechanic, trigger, reward, and obstacle data.
2. Export its `puzzleSequenceN` in checkpoint order.
3. For parkour, export an immutable course object with `spawn`, `finishTrigger`, and `platforms`.
4. Register the imports in `index.js`, then add the course to `PARKOUR_COURSES` when applicable.
5. Keep shared runtime behavior in `systems/LevelSystem.js`; keep level-specific content in this folder.

The registry preserves the existing level IDs, quest tokens, coordinates, rewards, and mechanic keys.
