import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { EXAMPLES_DIR, REPO_ROOT, generateContractExamples } from './contract-examples.js';

/** Régénère docs/examples/ à partir du code. À relancer après toute évolution du contrat. */
const { files } = await generateContractExamples();

for (const [name, content] of files) {
  const path = join(EXAMPLES_DIR, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

// Retire les exemples qui ne sont plus produits, sans supprimer de dossier
// (un dossier ouvert dans l'éditeur est verrouillé sous Windows).
for (const folder of ['api', 'collecteur']) {
  for (const file of await readdir(join(EXAMPLES_DIR, folder))) {
    if (file.endsWith('.json') && !files.has(`${folder}/${file}`)) await unlink(join(EXAMPLES_DIR, folder, file));
  }
}

console.log(`${files.size} exemples écrits dans ${relative(REPO_ROOT, EXAMPLES_DIR)}/`);
