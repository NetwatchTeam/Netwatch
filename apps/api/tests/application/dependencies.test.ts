import { beforeEach, describe, expect, it } from 'vitest';
import {
  CreateDependency,
  DeleteDependency,
  ListDependencies,
  UpdateDependency,
  ValidateAllSuggestions,
} from '../../src/application/use-cases/dependencies.js';
import type { Dependency } from '../../src/domain/entities/dependency.js';
import { createDiscoveredDevice } from '../../src/domain/entities/device.js';
import { ConflictError, ValidationError } from '../../src/domain/errors.js';
import { findCycles, syncDiscoveredDependencies } from '../../src/domain/rules/dependency-graph.js';
import {
  InMemoryDependencyRepository,
  InMemoryDeviceRepository,
  sequentialIds,
} from '../support/in-memory-repositories.js';

const T0 = new Date('2026-11-06T10:00:00Z');
const clock = { now: () => T0 };

function device(id: string, ip: string, gatewayIp: string | null = null) {
  return {
    ...createDiscoveredDevice(
      id,
      {
        ip, mac: null, hostname: id, vendor: null, gatewayIp, latencyMs: 1, packetLossPercent: 0,
        cpuPercent: null, memory: null, disks: [], ports: [], certificates: [],
      },
      T0,
    ),
    lifecycle: 'active' as const,
  };
}

function dependency(id: string, deviceId: string, dependsOnId: string, overrides: Partial<Dependency> = {}): Dependency {
  return {
    id, deviceId, dependsOnId, source: 'discovered', status: 'suggested',
    createdAt: T0, updatedAt: T0, observedAt: T0, ...overrides,
  };
}

describe('graphe des dépendances', () => {
  it('trouve chaque cycle une seule fois', () => {
    const cycles = findCycles([
      { deviceId: 'a', dependsOnId: 'b' },
      { deviceId: 'b', dependsOnId: 'c' },
      { deviceId: 'c', dependsOnId: 'a' },
      { deviceId: 'd', dependsOnId: 'a' },
    ]);
    expect(cycles).toEqual([['a', 'b', 'c', 'a']]);
  });

  it('transforme la passerelle vue par le collecteur en suggestion, sans toucher aux décisions humaines', () => {
    const gwA = device('gw-a', '10.0.0.1');
    const gwB = device('gw-b', '10.0.0.2');
    const pc = device('pc', '10.0.1.1', '10.0.0.2');
    const existing = [
      dependency('validated', 'pc', 'gw-a', { status: 'validated', source: 'manual' }),
      dependency('stale', 'pc', 'gw-c-disparue'),
    ];

    const sync = syncDiscoveredDependencies([pc], [gwA, gwB, pc], existing, T0, () => 'nouvelle');

    expect(sync.inserted).toMatchObject([{ id: 'nouvelle', deviceId: 'pc', dependsOnId: 'gw-b', status: 'suggested' }]);
    expect(sync.deleted.map((d) => d.id)).toEqual(['stale']);
    expect(sync.updated).toEqual([]);
  });
});

describe('contrôle humain des dépendances', () => {
  let devices: InMemoryDeviceRepository;
  let dependencies: InMemoryDependencyRepository;

  beforeEach(async () => {
    devices = new InMemoryDeviceRepository();
    dependencies = new InMemoryDependencyRepository();
    await devices.saveMany([
      device('core', '10.0.0.254'),
      device('gw', '10.0.0.1'),
      device('pc', '10.0.1.1'),
      device('pc-2', '10.0.1.2'),
    ]);
  });

  const list = () => new ListDependencies(dependencies, devices).execute();

  it('valide, modifie puis rejette une suggestion', async () => {
    await dependencies.insertMany([dependency('d1', 'pc', 'gw')]);
    const update = new UpdateDependency(dependencies, devices, clock);

    await expect(update.execute('d1', { status: 'validated' })).resolves.toMatchObject({ status: 'validated' });

    const edited = await update.execute('d1', { dependsOnId: 'core' });
    expect(edited).toMatchObject({ dependsOnId: 'core', source: 'manual', status: 'validated' });

    await expect(update.execute('d1', { status: 'rejected' })).resolves.toMatchObject({ status: 'rejected' });
  });

  it('supprimer une suggestion du collecteur la rejette, supprimer une dépendance manuelle l’efface', async () => {
    await dependencies.insertMany([
      dependency('discovered', 'pc', 'gw'),
      dependency('manual', 'pc-2', 'gw', { source: 'manual', status: 'validated' }),
    ]);
    const remove = new DeleteDependency(dependencies, clock);

    await expect(remove.execute('discovered')).resolves.toMatchObject({ outcome: 'rejected' });
    await expect(remove.execute('manual')).resolves.toMatchObject({ outcome: 'deleted' });
    expect((await dependencies.list()).map((d) => `${d.id}:${d.status}`)).toEqual(['discovered:rejected']);
  });

  it('crée une dépendance manuelle validée d’emblée et refuse un cycle', async () => {
    const create = new CreateDependency(dependencies, devices, clock, sequentialIds());

    await expect(create.execute({ deviceId: 'pc', dependsOnId: 'gw' })).resolves.toMatchObject({
      source: 'manual',
      status: 'validated',
    });
    await create.execute({ deviceId: 'gw', dependsOnId: 'core' });

    await expect(create.execute({ deviceId: 'core', dependsOnId: 'pc' })).rejects.toThrow(ConflictError);
    await expect(create.execute({ deviceId: 'core', dependsOnId: 'pc' })).rejects.toThrow(
      'Cette dépendance créerait un cycle : core → pc → gw → core',
    );
    await expect(create.execute({ deviceId: 'pc', dependsOnId: 'pc' })).rejects.toThrow(ValidationError);
  });

  it('valide toutes les suggestions sauf celles qui fermeraient un cycle', async () => {
    await dependencies.insertMany([
      dependency('d1', 'pc', 'gw'),
      dependency('d2', 'gw', 'core'),
      dependency('d3', 'core', 'pc'),
    ]);

    const result = await new ValidateAllSuggestions(dependencies, clock).execute();

    expect(result).toEqual({ validated: 2, skipped: 1 });
    expect((await dependencies.findById('d3'))?.status).toBe('suggested');
  });

  it('signale les cycles et les incohérences', async () => {
    await dependencies.insertMany([
      dependency('d1', 'pc', 'gw', { status: 'validated' }),
      dependency('d2', 'pc', 'core'),
      dependency('d3', 'gw', 'pc-2'),
      dependency('d4', 'pc-2', 'gw'),
    ]);
    await devices.save({ ...(await devices.findById('core'))!, lifecycle: 'ignored' });

    const { issues } = await list();

    expect(issues.map((issue) => issue.kind).sort()).toEqual(['conflict', 'cycle']);
    expect(issues.find((i) => i.kind === 'cycle')?.message).toContain('Dépendance circulaire : gw → pc-2 → gw');
    expect(issues.find((i) => i.kind === 'conflict')?.message).toContain(
      'Le collecteur voit pc derrière core, mais la dépendance validée indique gw',
    );
  });

  it('signale une dépendance validée vers un équipement ignoré', async () => {
    await dependencies.insertMany([dependency('d1', 'pc', 'gw', { status: 'validated' })]);
    await devices.save({ ...(await devices.findById('gw'))!, lifecycle: 'ignored' });

    const { issues } = await list();

    expect(issues).toMatchObject([{ kind: 'ignored_upstream', dependencyIds: ['d1'] }]);
  });
});
