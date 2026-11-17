// Compile packages/contracts s'il n'a jamais été compilé ou si ses sources ont changé.
// L'API et le dashboard importent sa version compilée (dist/) : sans elle, `npm run dev`
// échoue sur un clone neuf avec « Cannot find module @netwatch/contracts/dist/index.js ».
// Appelé automatiquement avant dev, test et contract:examples (voir les package.json).

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = join(root, 'packages/contracts');
const output = join(contracts, 'dist/index.js');

function newestSource(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name);
    const time = entry.isDirectory() ? newestSource(path) : statSync(path).mtimeMs;
    return Math.max(latest, time);
  }, 0);
}

const upToDate = existsSync(output) && statSync(output).mtimeMs >= newestSource(join(contracts, 'src'));

if (!upToDate) {
  console.log('[contracts] compilation de packages/contracts…');
  execSync('npm run build -w @netwatch/contracts', { cwd: root, stdio: 'inherit' });
}
