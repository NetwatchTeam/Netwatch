import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { snapshotSchema } from '../../src/infrastructure/scanner/snapshot-schema.js';
import { EXAMPLES_DIR, generateContractExamples } from '../../scripts/contract-examples.js';

/**
 * Structure d'une valeur JSON : les clés et les types, pas les valeurs (dates et durées varient).
 * Les éléments d'un tableau sont fusionnés : un champ présent sur un seul élément compte.
 */
function shape(value: unknown): unknown {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const items = value.map(shape);
    const objects = items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    if (objects.length > 0) return [Object.assign({}, ...objects)];
    return [...new Set(items.map(String))].sort();
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, shape(child)]),
    );
  }
  return typeof value;
}

async function readExample(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(EXAMPLES_DIR, name), 'utf8'));
}

describe('exemples JSON versionnés (docs/examples)', () => {
  let generated: Map<string, unknown>;

  beforeAll(async () => {
    generated = (await generateContractExamples()).files;
  }, 30_000);

  it('couvrent exactement ce que produit le générateur', async () => {
    const onDisk = [
      ...(await readdir(join(EXAMPLES_DIR, 'api'))).map((file) => `api/${file}`),
      ...(await readdir(join(EXAMPLES_DIR, 'collecteur'))).map((file) => `collecteur/${file}`),
    ].sort();

    expect(onDisk).toEqual([...generated.keys()].sort());
  });

  it('ont la structure des réponses actuelles de l’API (sinon : npm run contract:examples -w @netwatch/api)', async () => {
    for (const [name, content] of generated) {
      expect(shape(await readExample(name)), name).toEqual(shape(content));
    }
  });

  it('l’exemple du collecteur respecte le contrat d’entrée de l’API', async () => {
    const result = snapshotSchema.safeParse(await readExample('collecteur/scan.response.json'));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('les scénarios du faux collecteur respectent aussi le contrat', async () => {
    const dir = join(EXAMPLES_DIR, '../../tools/scanner-test/scenarios');
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
      const result = snapshotSchema.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')));
      expect(result.success, `${file} : ${JSON.stringify(result.error?.issues?.slice(0, 3))}`).toBe(true);
    }
  });

  it('rejette un collecteur qui annonce une autre version majeure du contrat', async () => {
    const example = (await readExample('collecteur/scan.response.json')) as Record<string, unknown>;
    const result = snapshotSchema.safeParse({ ...example, contractVersion: '2.0.0' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("l'API attend 1.x");
  });
});
