import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_ROOT = path.join(PROJECT_ROOT, 'backups', 'level-modular');

// Keep this list focused on runtime dependencies for modular Levels.
// The HGR folder is included as read-only reference data for future level design.
const SOURCES = [
  'src/Level',
  'src/systems/LevelSystem.js',
  'src/systems/Movement.js',
  'src/main.js',
  'src/physics/PhysicsWorld.js',
  'src/world/LevelAnchors.js',
  'src/world/worldrules.json',
  'src/world/gamerules.json',
  'src/world/object-rules.json',
  'src/character/RobotDog.js',
  'src/character/inventory.js',
  'src/character/DogRig.js',
  'src/character/DogAnimator.js',
  'src/world/hgr_parsed_mapcode'
];

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      const info = await stat(absolutePath);
      files.push({ path: relativePath, bytes: info.size });
    }
  }

  return files;
}

async function main() {
  // Validate every source before creating a snapshot, avoiding a misleading
  // partial backup when a required path is missing.
  for (const relativePath of SOURCES) {
    await stat(path.join(PROJECT_ROOT, relativePath));
  }

  await mkdir(BACKUP_ROOT, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotName = 'pre-change-' + stamp;
  const snapshotRoot = path.join(BACKUP_ROOT, snapshotName);
  await mkdir(snapshotRoot, { recursive: false });

  try {
    for (const relativePath of SOURCES) {
      const source = path.join(PROJECT_ROOT, relativePath);
      const destination = path.join(snapshotRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true
      });
    }

    const copiedFiles = await collectFiles(snapshotRoot);
    const totalBytes = copiedFiles.reduce((sum, file) => sum + file.bytes, 0);
    const manifest = {
      createdAt: new Date().toISOString(),
      snapshot: snapshotName,
      project: path.basename(PROJECT_ROOT),
      fileCount: copiedFiles.length,
      totalBytes,
      sources: SOURCES,
      files: copiedFiles
    };

    await writeFile(
      path.join(snapshotRoot, 'BACKUP_MANIFEST.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );

    console.log('LEVEL BACKUP COMPLETE');
    console.log('Snapshot: ' + snapshotRoot);
    console.log('Files: ' + copiedFiles.length);
    console.log('Bytes: ' + totalBytes);
  } catch (error) {
    console.error('LEVEL BACKUP INCOMPLETE');
    console.error('Partial snapshot: ' + snapshotRoot);
    console.error(error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Backup aborted before completion.');
  console.error(error);
  process.exitCode = 1;
});
